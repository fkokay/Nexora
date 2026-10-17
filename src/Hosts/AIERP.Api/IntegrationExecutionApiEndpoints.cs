using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;

public sealed record IntegrationExecuteApiRequest(JsonElement Payload);
public sealed record IntegrationOperationApiResponse(
    Guid OperationId,
    string IntegrationCode,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int Attempts,
    string? ErrorCode,
    AIERP.IntegrationSDK.IntegrationHostExecuteResponse? Result);

public static class IntegrationExecutionApiEndpoints
{
    private const int MaximumPayloadBytes = 128 * 1024;
    private const int MaximumPendingOperationsPerTenant = 250;

    public static void MapIntegrationExecutionApi(this WebApplication app)
    {
        app.MapPost("/api/integrations/{integrationCode}/execute", async (
            string integrationCode,
            IntegrationExecuteApiRequest request,
            ClaimsPrincipal user,
            HttpRequest httpRequest,
            PlatformDbContext db,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!AIERP.ModuleSDK.ModuleManifestValidator.IsValidModuleCode(integrationCode) || request.Payload.ValueKind != JsonValueKind.Object)
                return Results.BadRequest(new { errorCode = "invalid_request" });
            if (!IntegrationOperationCipher.IsConfigured(configuration))
                return Results.Problem("Integration queue encryption is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);

            var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(request.Payload);
            if (payloadBytes.Length > MaximumPayloadBytes) return Results.BadRequest(new { errorCode = "payload_too_large" });
            var clientKey = httpRequest.Headers["Idempotency-Key"].FirstOrDefault();
            if (!IsSafeIdempotencyKey(clientKey)) return Results.BadRequest(new { errorCode = "idempotency_key_required" });
            var keyHash = IntegrationOperationCipher.Sha256Hex(System.Text.Encoding.UTF8.GetBytes(clientKey!));
            var payloadHash = IntegrationOperationCipher.Sha256Hex(payloadBytes);

            var existing = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                x.IntegrationCode == integrationCode && x.IdempotencyKeyHash == keyHash, cancellationToken);
            if (existing is not null) return ExistingOperationResult(existing, userId, payloadHash, configuration);

            var pendingCount = await db.IntegrationOperations.CountAsync(x => x.TenantId == tenantId &&
                (x.Status == "Queued" || x.Status == "Running"), cancellationToken);
            if (pendingCount >= MaximumPendingOperationsPerTenant)
                return Results.Problem("Entegrasyon kuyruğu tenant sınırına ulaştı; daha sonra tekrar deneyin.", statusCode: StatusCodes.Status429TooManyRequests);

            var operationId = Guid.NewGuid();
            var now = DateTimeOffset.UtcNow;
            var operation = new IntegrationOperation
            {
                Id = operationId,
                TenantId = tenantId,
                RequestedByUserId = userId,
                IntegrationCode = integrationCode,
                IdempotencyKeyHash = keyHash,
                PayloadSha256 = payloadHash,
                ProviderIdempotencyKey = IntegrationOperationCipher.CreateProviderIdempotencyKey(tenantId, integrationCode, clientKey!),
                EncryptedPayload = IntegrationOperationCipher.Encrypt(JsonSerializer.Serialize(request.Payload), configuration, tenantId, operationId, "request"),
                Status = "Queued",
                CreatedAt = now,
                UpdatedAt = now,
                NextAttemptAt = now
            };
            db.IntegrationOperations.Add(operation);
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = "integration.execute.queued",
                Resource = $"{integrationCode}:{operationId:N}"
            });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                db.ChangeTracker.Clear();
                var raced = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                    x.IntegrationCode == integrationCode && x.IdempotencyKeyHash == keyHash, cancellationToken);
                if (raced is null) throw;
                return ExistingOperationResult(raced, userId, payloadHash, configuration);
            }
            return Results.Accepted($"/api/integrations/operations/{operation.Id:D}", ToResponse(operation, configuration));
        }).WithMetadata(new RequestSizeLimitAttribute(MaximumPayloadBytes + 4096))
            .RequireAuthorization().RequireRateLimiting("integration-execute");

        app.MapGet("/api/integrations/operations/{operationId:guid}", async (
            Guid operationId,
            ClaimsPrincipal user,
            PlatformDbContext db,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId)) return Results.Forbid();
            var operation = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.Id == operationId &&
                x.TenantId == tenantId && x.RequestedByUserId == userId, cancellationToken);
            return operation is null ? Results.NotFound() : Results.Ok(ToResponse(operation, configuration));
        }).RequireAuthorization();
    }

    private static IResult ExistingOperationResult(IntegrationOperation operation, Guid userId, string payloadHash, IConfiguration configuration)
    {
        if (operation.RequestedByUserId != userId) return Results.Conflict(new { errorCode = "idempotency_key_already_used" });
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(operation.PayloadSha256), Convert.FromHexString(payloadHash)))
            return Results.Conflict(new { errorCode = "idempotency_payload_mismatch" });
        var response = ToResponse(operation, configuration);
        return operation.Status is "Queued" or "Running"
            ? Results.Accepted($"/api/integrations/operations/{operation.Id:D}", response)
            : Results.Ok(response);
    }

    private static IntegrationOperationApiResponse ToResponse(IntegrationOperation operation, IConfiguration configuration)
    {
        AIERP.IntegrationSDK.IntegrationHostExecuteResponse? result = null;
        if (!string.IsNullOrEmpty(operation.EncryptedResult))
        {
            var resultJson = IntegrationOperationCipher.Decrypt(operation.EncryptedResult, configuration, operation.TenantId, operation.Id, "result");
            result = JsonSerializer.Deserialize<AIERP.IntegrationSDK.IntegrationHostExecuteResponse>(resultJson);
        }
        return new IntegrationOperationApiResponse(operation.Id, operation.IntegrationCode, operation.Status,
            operation.CreatedAt, operation.UpdatedAt, operation.AttemptCount, operation.ErrorCode, result);
    }

    private static bool TryGetActor(ClaimsPrincipal principal, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(principal.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }

    private static bool IsSafeIdempotencyKey(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= 128 &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or ':' or '-');
}
