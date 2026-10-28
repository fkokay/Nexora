using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AIERP.IntegrationSDK;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

public sealed class IntegrationOperationWorker(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory clients,
    IConfiguration configuration,
    ILogger<IntegrationOperationWorker> logger) : BackgroundService
{
    private const int MaximumDeliveryAttempts = 3;
    private const int MaximumIntegrationHostResponseBytes = 1024 * 1024;
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);
    private DateTimeOffset nextRetentionSweep = DateTimeOffset.UtcNow.AddHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var operation = await ClaimNextAsync(stoppingToken);
                if (operation is null)
                {
                    await SweepExpiredAsync(stoppingToken);
                    await Task.Delay(PollInterval, stoppingToken);
                    continue;
                }
                await DeliverAsync(operation, stoppingToken);
                await SweepExpiredAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError("Integration queue worker iteration failed ({ErrorType}).", exception.GetType().Name);
                try { await Task.Delay(PollInterval, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            }
        }
    }

    private async Task<IntegrationOperation?> ClaimNextAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        if (!db.Database.IsRelational()) return null;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var operation = await db.IntegrationOperations
            .FromSqlRaw("SELECT TOP (1) * FROM [dbo].[IntegrationOperations] WITH (UPDLOCK, READPAST, ROWLOCK) WHERE ([Status] = 'Queued' AND [NextAttemptAt] <= SYSUTCDATETIME()) OR ([Status] = 'Running' AND [StartedAt] < DATEADD(minute, -2, SYSUTCDATETIME())) ORDER BY [NextAttemptAt], [CreatedAt]")
            .FirstOrDefaultAsync(cancellationToken);
        if (operation is null)
        {
            await transaction.CommitAsync(cancellationToken);
            return null;
        }
        if (operation.AttemptCount >= MaximumDeliveryAttempts)
        {
            operation.Status = "Indeterminate";
            operation.ErrorCode = "delivery_indeterminate";
            operation.CompletedAt = DateTimeOffset.UtcNow;
            operation.EncryptedPayload = "";
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = operation.TenantId,
                UserId = operation.RequestedByUserId,
                Action = "integration.execute.indeterminate",
                Resource = $"{operation.IntegrationCode}:{operation.Id:N}"
            });
        }
        else
        {
            operation.Status = "Running";
            operation.AttemptCount++;
            operation.StartedAt = DateTimeOffset.UtcNow;
        }
        operation.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return operation.Status == "Running" ? operation : null;
    }

    private async Task DeliverAsync(IntegrationOperation claimed, CancellationToken stoppingToken)
    {
        var delivery = new DeliveryOutcome("Failed", "integration_host_unavailable", null, false, false);
        try
        {
            var payloadJson = IntegrationOperationCipher.Decrypt(claimed.EncryptedPayload, configuration,
                claimed.TenantId, claimed.Id, "request");
            using var payloadDocument = JsonDocument.Parse(payloadJson);
            var hostUri = GetHostUri();
            var signingKey = configuration["IntegrationHost:SigningKey"] ?? configuration["PluginHost:SigningKey"];
            if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
                throw new InvalidOperationException("Integration host signing is not configured.");

            var now = DateTimeOffset.UtcNow;
            var request = new IntegrationHostExecuteRequest(claimed.IntegrationCode, claimed.ProviderIdempotencyKey,
                claimed.Id.ToString("N"), now.AddSeconds(30), payloadDocument.RootElement.Clone());
            var token = IssueInternalToken(claimed, signingKey);
            using var client = clients.CreateClient("integration-host");
            client.BaseAddress = hostUri;
            using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/integrations/execute")
            {
                Content = System.Net.Http.Json.JsonContent.Create(request)
            };
            message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, stoppingToken);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                delivery = new DeliveryOutcome("Failed", "integration_not_configured", null, false, false);
            else if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
                delivery = new DeliveryOutcome("Failed", "integration_host_authentication_failed", null, false, false);
            else
            {
                IntegrationHostExecuteResponse? result;
                var invalidResponse = false;
                try
                {
                    var responseBytes = await ReadBoundedResponseAsync(response.Content, MaximumIntegrationHostResponseBytes, stoppingToken);
                    result = JsonSerializer.Deserialize<IntegrationHostExecuteResponse>(responseBytes);
                }
                catch (InvalidDataException)
                {
                    result = null;
                    invalidResponse = true;
                }
                catch (JsonException)
                {
                    result = null;
                    invalidResponse = true;
                }
                if (result is null)
                {
                    delivery = invalidResponse
                        ? new DeliveryOutcome("Failed", "integration_host_invalid_response", null, false, false)
                        : new DeliveryOutcome("Failed", "integration_host_invalid_response", null, !response.IsSuccessStatusCode, true);
                }
                else if (result.Succeeded && response.IsSuccessStatusCode)
                    delivery = new DeliveryOutcome("Succeeded", null, JsonSerializer.Serialize(result), false, false);
                else
                {
                    var retryable = IsRetryable(result.ErrorCode) || (int)response.StatusCode >= 500;
                    delivery = new DeliveryOutcome("Failed", SanitizeErrorCode(result.ErrorCode), JsonSerializer.Serialize(result), retryable, retryable);
                }
            }
        }
        catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
        {
            delivery = new DeliveryOutcome("Failed", "integration_delivery_timeout", null, true, true);
        }
        catch (HttpRequestException)
        {
            delivery = new DeliveryOutcome("Failed", "integration_host_unavailable", null, true, true);
        }
        catch (JsonException)
        {
            delivery = new DeliveryOutcome("Failed", "integration_payload_invalid", null, false, false);
        }
        catch (CryptographicException)
        {
            delivery = new DeliveryOutcome("Failed", "integration_payload_unavailable", null, false, false);
        }
        catch (FormatException)
        {
            delivery = new DeliveryOutcome("Failed", "integration_payload_unavailable", null, false, false);
        }
        catch (InvalidOperationException)
        {
            delivery = new DeliveryOutcome("Failed", "integration_host_unavailable", null, true, true);
        }

        await CompleteAttemptAsync(claimed, delivery, stoppingToken);
    }

    private async Task CompleteAttemptAsync(IntegrationOperation claimed, DeliveryOutcome outcome, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var operation = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.Id == claimed.Id && x.TenantId == claimed.TenantId, cancellationToken);
        if (operation is null || operation.Status != "Running" || operation.AttemptCount != claimed.AttemptCount) return;

        var now = DateTimeOffset.UtcNow;
        operation.UpdatedAt = now;
        operation.ErrorCode = outcome.ErrorCode;
        if (outcome.ResultJson is not null)
            operation.EncryptedResult = IntegrationOperationCipher.Encrypt(outcome.ResultJson, configuration, operation.TenantId, operation.Id, "result");

        if (ShouldScheduleRetry(outcome.Retryable, outcome.Ambiguous, operation.AttemptCount, MaximumDeliveryAttempts))
        {
            operation.Status = "Queued";
            operation.NextAttemptAt = now.AddSeconds(Math.Min(30, 5 * operation.AttemptCount));
            operation.StartedAt = null;
        }
        else
        {
            operation.Status = outcome.Ambiguous || outcome.Retryable ? "Indeterminate" : outcome.Status;
            operation.CompletedAt = now;
            operation.EncryptedPayload = "";
            if (operation.Status == "Indeterminate") operation.ErrorCode = "delivery_indeterminate";
        }

        db.AuditEvents.Add(new AuditEvent
        {
            TenantId = operation.TenantId,
            UserId = operation.RequestedByUserId,
            Action = operation.Status == "Queued" ? "integration.execute.retry-scheduled" : "integration.execute.completed",
            Resource = $"{operation.IntegrationCode}:{operation.Status}:{operation.Id:N}"
        });
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Integration operation {OperationId} finished with {Status} after {AttemptCount} attempt(s).",
            operation.Id, operation.Status, operation.AttemptCount);
    }

    private Uri GetHostUri()
    {
        if (!Uri.TryCreate(configuration["IntegrationHost:BaseUrl"], UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidOperationException("IntegrationHost URL is invalid.");
        return uri;
    }

    private async Task SweepExpiredAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (now < nextRetentionSweep) return;
        nextRetentionSweep = now.AddHours(6);
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        if (!db.Database.IsRelational()) return;
        var cutoff = now.AddDays(-30);
        var removed = await db.IntegrationOperations
            .Where(x => (x.Status == "Succeeded" || x.Status == "Failed" || x.Status == "Indeterminate") && x.CompletedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);
        if (removed > 0) logger.LogInformation("Expired {OperationCount} integration operation record(s) after the 30-day idempotency window.", removed);
    }

    private string IssueInternalToken(IntegrationOperation operation, string signingKey)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, operation.RequestedByUserId.ToString("D")),
            new Claim("service", "AIERP.Api"),
            new Claim("operation", "integration.execute"),
            new Claim("tenant_id", operation.TenantId.ToString("D")),
            new Claim("integration_code", operation.IntegrationCode)
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(configuration["Authentication:Issuer"] ?? "AIERP", "AIERP.IntegrationHost", claims,
            now.AddSeconds(-5), now.AddSeconds(45), new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static bool IsRetryable(string? errorCode) => errorCode is
        "temporary_unavailable" or "rate_limited" or "adapter_error" or "deadline_exceeded" or "integration_host_unavailable";

    internal static bool ShouldScheduleRetry(bool retryable, bool ambiguous, int attemptCount, int maximumAttempts) =>
        retryable && !ambiguous && attemptCount < maximumAttempts;

    private static string SanitizeErrorCode(string? value) => value is { Length: > 0 and <= 48 } && value.All(c => char.IsAsciiLetterOrDigit(c) || c == '_')
        ? value : "integration_failed";

    internal static async Task<byte[]> ReadBoundedResponseAsync(HttpContent content, int maximumBytes, CancellationToken cancellationToken)
    {
        if (maximumBytes <= 0) throw new ArgumentOutOfRangeException(nameof(maximumBytes));
        if (content.Headers.ContentLength is long contentLength && contentLength > maximumBytes)
            throw new InvalidDataException("IntegrationHost response exceeded the configured limit.");

        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream(Math.Min(maximumBytes, content.Headers.ContentLength is long length ? (int)length : 8192));
        var chunk = new byte[8192];
        while (true)
        {
            var read = await stream.ReadAsync(chunk.AsMemory(), cancellationToken);
            if (read == 0) break;
            if (buffer.Length + read > maximumBytes)
                throw new InvalidDataException("IntegrationHost response exceeded the configured limit.");
            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }
        return buffer.ToArray();
    }

    private sealed record DeliveryOutcome(string Status, string? ErrorCode, string? ResultJson, bool Retryable, bool Ambiguous);
}
