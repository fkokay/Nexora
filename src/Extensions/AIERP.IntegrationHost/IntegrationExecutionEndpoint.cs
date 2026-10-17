using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.IntegrationSDK;

namespace AIERP.IntegrationHost;

public sealed class IntegrationDispatcher(IConfiguration configuration, IHttpClientFactory clients, IIntegrationSecretResolver secrets)
{
    private const int MaximumPayloadBytes = 128 * 1024;
    private const int MaximumResponseBytes = 128 * 1024;

    public int ConfiguredCount => configuration.GetSection("Integrations").GetChildren()
        .Count(section => section.GetValue<bool>("Enabled"));

    public async Task<(bool Configured, IntegrationExecutionResult<JsonElement>? Result)> ExecuteAsync(
        string integrationCode,
        IntegrationContext context,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        if (!ModuleCodeRules.IsValid(integrationCode)) return (false, null);
        var section = configuration.GetSection($"Integrations:{integrationCode}");
        if (!section.GetValue<bool>("Enabled")) return (false, null);
        if (payload.ValueKind != JsonValueKind.Object || Encoding.UTF8.GetByteCount(payload.GetRawText()) > MaximumPayloadBytes)
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "validation_failed", 0, TimeSpan.Zero));

        var baseUrl = section["BaseUrl"];
        var path = section["Path"];
        var allowedHosts = section.GetSection("AllowedHosts").Get<string[]>() ?? [];
        if (!TryResolveEndpoint(baseUrl, path, allowedHosts, out var endpoint))
            return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "invalid_integration", 0, TimeSpan.Zero));

        ReadOnlyMemory<char> secret = ReadOnlyMemory<char>.Empty;
        var secretName = section["CredentialSecretName"];
        if (!string.IsNullOrWhiteSpace(secretName))
        {
            try
            {
                secret = await secrets.ResolveAsync(context.TenantId, new IntegrationCredentialReference(secretName), cancellationToken);
            }
            catch (FileNotFoundException)
            {
                return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "authentication_failed", 0, TimeSpan.Zero));
            }
            if (secret.IsEmpty) return (true, new IntegrationExecutionResult<JsonElement>(false, default, null, "authentication_failed", 0, TimeSpan.Zero));
        }

        var adapter = new ConfiguredHttpJsonAdapter(integrationCode, endpoint, section["CredentialHeaderName"] ?? "Authorization",
            section["CredentialScheme"] ?? "Bearer", secret, clients.CreateClient("integration-outbound"), MaximumResponseBytes);
        var retryPolicy = new IntegrationRetryPolicy(
            section.GetValue("Retry:MaximumAttempts", 3),
            TimeSpan.FromMilliseconds(section.GetValue("Retry:InitialDelayMilliseconds", 250)),
            TimeSpan.FromMilliseconds(section.GetValue("Retry:MaximumDelayMilliseconds", 2000)));
        var result = await IntegrationAdapterExecutor.ExecuteAsync(adapter, context, payload, retryPolicy, cancellationToken);
        return (true, result);
    }

    private static bool TryResolveEndpoint(string? baseUrl, string? path, IReadOnlyCollection<string> allowedHosts, out Uri endpoint)
    {
        endpoint = null!;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri) || baseUri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(baseUri.UserInfo) || !string.IsNullOrEmpty(baseUri.Query) || !string.IsNullOrEmpty(baseUri.Fragment) ||
            !allowedHosts.Contains(baseUri.IdnHost, StringComparer.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(path) ||
            path.StartsWith('/') || path.Contains('?') || path.Contains('#') ||
            path.Split('/').Any(segment => segment is "." or "..")) return false;
        if (!Uri.TryCreate(baseUri, path, out var candidate) || candidate.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(candidate.IdnHost, baseUri.IdnHost, StringComparison.OrdinalIgnoreCase)) return false;
        endpoint = candidate;
        return true;
    }

    private sealed class ConfiguredHttpJsonAdapter(
        string integrationCode,
        Uri endpoint,
        string credentialHeaderName,
        string credentialScheme,
        ReadOnlyMemory<char> secret,
        HttpClient client,
        int maximumResponseBytes) : IERPIntegrationAdapter<JsonElement, JsonElement>
    {
        public string IntegrationCode => integrationCode;

        public async Task<IntegrationResult<JsonElement>> ExecuteAsync(IntegrationContext context, JsonElement request, CancellationToken cancellationToken)
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = JsonContent.Create(request)
            };
            message.Headers.TryAddWithoutValidation("Idempotency-Key", context.IdempotencyKey);
            message.Headers.TryAddWithoutValidation("X-Correlation-ID", context.CorrelationId);
            if (!secret.IsEmpty)
            {
                var credential = new string(secret.Span);
                if (credential.Contains('\r') || credential.Contains('\n'))
                    return new IntegrationResult<JsonElement>(false, default, null, "authentication_failed", false);
                var headerValue = string.Equals(credentialHeaderName, "Authorization", StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(credentialScheme) ? $"{credentialScheme} {credential}" : credential;
                if (!message.Headers.TryAddWithoutValidation(credentialHeaderName, headerValue))
                    return new IntegrationResult<JsonElement>(false, default, null, "authentication_failed", false);
            }

            using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var code = response.StatusCode switch
                {
                    System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden => "authentication_failed",
                    System.Net.HttpStatusCode.TooManyRequests => "rate_limited",
                    System.Net.HttpStatusCode.RequestTimeout => "temporary_unavailable",
                    System.Net.HttpStatusCode.BadRequest => "validation_failed",
                    System.Net.HttpStatusCode.Conflict => "conflict",
                    System.Net.HttpStatusCode.NotFound => "not_found",
                    _ when (int)response.StatusCode >= 500 => "temporary_unavailable",
                    _ => "provider_rejected"
                };
                var retryable = response.StatusCode is System.Net.HttpStatusCode.RequestTimeout or System.Net.HttpStatusCode.TooManyRequests
                    || (int)response.StatusCode >= 500;
                return new IntegrationResult<JsonElement>(false, default, null, code, retryable);
            }

            var bytes = await ReadBoundedAsync(response.Content, maximumResponseBytes, cancellationToken);
            JsonElement responseValue;
            if (bytes.Length == 0) responseValue = JsonSerializer.SerializeToElement<object?>(null);
            else
            {
                using var document = JsonDocument.Parse(bytes);
                responseValue = document.RootElement.Clone();
            }
            var reference = response.Headers.TryGetValues("X-External-Reference", out var values)
                ? values.FirstOrDefault(value => value.Length <= 200 && !value.Any(char.IsControl))
                : null;
            return new IntegrationResult<JsonElement>(true, responseValue, reference, null, false);
        }

        private static async Task<byte[]> ReadBoundedAsync(HttpContent content, int maximumBytes, CancellationToken cancellationToken)
        {
            if (content.Headers.ContentLength is > 0 and var length && length > maximumBytes)
                throw new InvalidDataException("Integration provider response exceeds the configured limit.");
            await using var stream = await content.ReadAsStreamAsync(cancellationToken);
            using var output = new MemoryStream();
            var buffer = new byte[16 * 1024];
            while (true)
            {
                var read = await stream.ReadAsync(buffer, cancellationToken);
                if (read == 0) break;
                if (output.Length + read > maximumBytes) throw new InvalidDataException("Integration provider response exceeds the configured limit.");
                output.Write(buffer, 0, read);
            }
            return output.ToArray();
        }
    }
}

public static class IntegrationExecutionEndpoint
{
    public static void MapIntegrationExecution(this WebApplication app)
    {
        app.MapPost("/internal/integrations/execute", async (
            IntegrationHostExecuteRequest request,
            ClaimsPrincipal caller,
            IntegrationDispatcher dispatcher,
            CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(caller.FindFirstValue("tenant_id"), out var tenantId) ||
                !string.Equals(caller.FindFirstValue("integration_code"), request.IntegrationCode, StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(request.IntegrationCode) || string.IsNullOrWhiteSpace(request.IdempotencyKey) ||
                string.IsNullOrWhiteSpace(request.CorrelationId) || request.Payload.ValueKind != JsonValueKind.Object)
                return Results.BadRequest(new { errorCode = "invalid_context" });
            if (request.Deadline <= DateTimeOffset.UtcNow || request.Deadline > DateTimeOffset.UtcNow.AddMinutes(1))
                return Results.BadRequest(new { errorCode = "invalid_deadline" });

            var context = new IntegrationContext(tenantId, request.IntegrationCode, request.CorrelationId,
                request.IdempotencyKey, request.Deadline);
            var (configured, result) = await dispatcher.ExecuteAsync(request.IntegrationCode, context, request.Payload, cancellationToken);
            if (!configured) return Results.NotFound(new { errorCode = "integration_not_configured" });
            if (result is null) return Results.Problem("Adapter sonucu yok.", statusCode: StatusCodes.Status502BadGateway);
            var body = new IntegrationHostExecuteResponse(result.Succeeded, result.Value, result.ExternalReference,
                result.ErrorCode, result.Attempts, DateTimeOffset.UtcNow);
            if (result.Succeeded) return Results.Ok(body);
            return result.ErrorCode switch
            {
                "deadline_exceeded" => Results.Json(body, statusCode: StatusCodes.Status504GatewayTimeout),
                "validation_failed" or "invalid_context" or "invalid_retry_policy" or "invalid_integration" => Results.UnprocessableEntity(body),
                _ => Results.Json(body, statusCode: StatusCodes.Status502BadGateway)
            };
        }).RequireAuthorization("IntegrationExecution").RequireRateLimiting("integration-execute");
    }
}

internal static class ModuleCodeRules
{
    private static readonly Regex Pattern = new("^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$", RegexOptions.CultureInvariant);

    public static bool IsValid(string? value)
    {
        var candidate = value ?? string.Empty;
        return candidate.Length <= 60 && Pattern.IsMatch(candidate);
    }
}
