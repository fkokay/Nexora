using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.IntegrationSDK;
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
public sealed record IntegrationOperationAdminItem(
    Guid OperationId,
    string IntegrationCode,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    int Attempts,
    string? ErrorCode);
public sealed record IntegrationOperationAdminPage(
    IReadOnlyList<IntegrationOperationAdminItem> Items,
    int Page,
    int PageSize,
    int TotalCount);
public sealed record EDocumentSubmissionAdminItem(Guid OperationId, string DocumentType, Guid DocumentId,
    string DocumentNumber, DateOnly IssueDate, string CurrencyCode, string Status, DateTimeOffset CreatedAt,
    Guid RequestedByUserId);
public sealed record EDocumentSourceDocument(Guid Id, string Number, DateOnly IssueDate, string CurrencyCode,
    string CounterpartyName, decimal Total, string Status);
public sealed record EDocumentSubmissionDraftRequest(string DocumentType, Guid DocumentId);

public static class IntegrationExecutionApiEndpoints
{
    private const string EDocumentIntegrationCode = "tr.e-document.submit";
    private const int MaximumPayloadBytes = 128 * 1024;
    private const int MaximumPendingOperationsPerTenant = 250;
    private const int MaximumAdminQueuePage = 10_000;

    public static void MapIntegrationExecutionApi(this WebApplication app)
    {
        app.MapGet("/api/e-documents/source-documents", async (
            string documentType, ClaimsPrincipal user, [FromServices] TenantDbContext tenantDb, CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out _) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            if (documentType is not ("e-invoice" or "e-dispatch" or "e-archive"))
                return Results.BadRequest(new { errorCode = "unsupported_document_type" });
            if (documentType == "e-dispatch")
            {
                var deliveries = await tenantDb.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId &&
                        x.Status == SalesDeliveryStatus.Posted)
                    .OrderByDescending(x => x.DeliveryDate).ThenBy(x => x.Code).Take(100)
                    .Select(x => new EDocumentSourceDocument(x.Id, x.Code, x.DeliveryDate, x.Order.CurrencyCode,
                        x.Order.Customer.Name, x.Lines.Sum(line => line.Quantity), x.Status.ToString()))
                    .ToListAsync(cancellationToken);
                return Results.Ok(deliveries);
            }
            var invoices = await tenantDb.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    x.Status == SalesInvoiceStatus.Posted)
                .OrderByDescending(x => x.InvoiceDate).ThenBy(x => x.Code).Take(100)
                .Select(x => new EDocumentSourceDocument(x.Id, x.Code, x.InvoiceDate, x.CurrencyCode,
                    x.Customer.Name, x.GrandTotal, x.Status.ToString()))
                .ToListAsync(cancellationToken);
            return Results.Ok(invoices);
        }).RequireAuthorization();

        app.MapGet("/api/e-documents/source-documents/{documentType}/{documentId:guid}/preview", async (
            string documentType, Guid documentId, ClaimsPrincipal user, [FromServices] TenantDbContext tenantDb,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out _) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            if (documentType is not ("e-invoice" or "e-dispatch" or "e-archive"))
                return Results.BadRequest(new { errorCode = "unsupported_document_type" });
            var request = await BuildSourceSubmissionAsync(tenantDb, tenantId,
                new EDocumentSubmissionDraftRequest(documentType, documentId), cancellationToken);
            if (request is null) return Results.NotFound(new { errorCode = "source_document_not_found" });
            var errors = EDocumentSubmissionRules.Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors.ToDictionary(error => error, error => new[] { error }));
            return Results.Ok(request);
        }).RequireAuthorization();

        app.MapPost("/api/e-documents/submissions", async (
            EDocumentSubmissionDraftRequest draft,
            ClaimsPrincipal user,
            HttpRequest httpRequest,
            [FromServices] TenantDbContext tenantDb,
            PlatformDbContext db,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var request = await BuildSourceSubmissionAsync(tenantDb, tenantId, draft, cancellationToken);
            if (request is null) return Results.NotFound(new { errorCode = "source_document_not_found" });
            var errors = EDocumentSubmissionRules.Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors.ToDictionary(error => error, error => new[] { error }));
            if (!IntegrationOperationCipher.IsConfigured(configuration))
                return Results.Problem("Integration queue encryption is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);
            var clientKey = httpRequest.Headers["Idempotency-Key"].FirstOrDefault();
            if (!IsSafeIdempotencyKey(clientKey)) return Results.BadRequest(new { errorCode = "idempotency_key_required" });
            var bytes = JsonSerializer.SerializeToUtf8Bytes(request);
            if (bytes.Length > MaximumPayloadBytes) return Results.BadRequest(new { errorCode = "payload_too_large" });
            var keyHash = IntegrationOperationCipher.Sha256Hex(System.Text.Encoding.UTF8.GetBytes(clientKey!));
            var payloadHash = IntegrationOperationCipher.Sha256Hex(bytes);
            var existing = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                x.IntegrationCode == EDocumentIntegrationCode && x.IdempotencyKeyHash == keyHash, cancellationToken);
            if (existing is not null) return ExistingOperationResult(existing, userId, payloadHash, configuration);
            var pending = await db.IntegrationOperations.CountAsync(x => x.TenantId == tenantId &&
                (x.Status == "Queued" || x.Status == "Running" || x.Status == "AwaitingApproval"), cancellationToken);
            if (pending >= MaximumPendingOperationsPerTenant)
                return Results.Problem("Entegrasyon kuyruğu tenant sınırına ulaştı; daha sonra tekrar deneyin.", statusCode: StatusCodes.Status429TooManyRequests);

            var id = Guid.NewGuid();
            var now = DateTimeOffset.UtcNow;
            var operation = new IntegrationOperation
            {
                Id = id, TenantId = tenantId, RequestedByUserId = userId, IntegrationCode = EDocumentIntegrationCode,
                IdempotencyKeyHash = keyHash, PayloadSha256 = payloadHash,
                ProviderIdempotencyKey = IntegrationOperationCipher.CreateProviderIdempotencyKey(tenantId, EDocumentIntegrationCode, clientKey!),
                EncryptedPayload = IntegrationOperationCipher.Encrypt(JsonSerializer.Serialize(request), configuration, tenantId, id, "request"),
                Status = "AwaitingApproval", CreatedAt = now, UpdatedAt = now, NextAttemptAt = now
            };
            db.IntegrationOperations.Add(operation);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "e-document.submission.prepared", Resource = $"{request.DocumentType}:{request.DocumentNumber}:{id:N}" });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateException)
            {
                db.ChangeTracker.Clear();
                var raced = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                    x.IntegrationCode == EDocumentIntegrationCode && x.IdempotencyKeyHash == keyHash, cancellationToken);
                if (raced is null) throw;
                return ExistingOperationResult(raced, userId, payloadHash, configuration);
            }
            return Results.Accepted($"/api/integrations/operations/{id:D}", ToResponse(operation, configuration));
        }).WithMetadata(new RequestSizeLimitAttribute(MaximumPayloadBytes + 4096)).RequireAuthorization().RequireRateLimiting("integration-execute");

        app.MapGet("/api/e-documents/submissions", async (ClaimsPrincipal user, PlatformDbContext db, IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out _) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var operations = await db.IntegrationOperations.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    x.IntegrationCode == EDocumentIntegrationCode && x.Status == "AwaitingApproval")
                .OrderBy(x => x.CreatedAt).Take(100).ToListAsync(cancellationToken);
            var items = operations.Select(operation =>
            {
                var json = IntegrationOperationCipher.Decrypt(operation.EncryptedPayload, configuration, tenantId, operation.Id, "request");
                var request = JsonSerializer.Deserialize<EDocumentSubmissionRequest>(json)!;
                return new EDocumentSubmissionAdminItem(operation.Id, request.DocumentType, request.DocumentId,
                    request.DocumentNumber, request.IssueDate, request.CurrencyCode, operation.Status,
                    operation.CreatedAt, operation.RequestedByUserId);
            }).ToArray();
            return Results.Ok(items);
        }).RequireAuthorization();

        app.MapGet("/api/e-documents/submissions/{operationId:guid}", async (Guid operationId,
            ClaimsPrincipal user, PlatformDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out _) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var operation = await db.IntegrationOperations.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                x.Id == operationId && x.IntegrationCode == EDocumentIntegrationCode && x.Status == "AwaitingApproval", cancellationToken);
            if (operation is null) return Results.NotFound();
            var json = IntegrationOperationCipher.Decrypt(operation.EncryptedPayload, configuration, tenantId, operation.Id, "request");
            return Results.Ok(JsonSerializer.Deserialize<EDocumentSubmissionRequest>(json));
        }).RequireAuthorization();

        app.MapPost("/api/e-documents/submissions/{operationId:guid}/approve", async (Guid operationId,
            ClaimsPrincipal user, PlatformDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var operation = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId &&
                x.Id == operationId && x.IntegrationCode == EDocumentIntegrationCode, cancellationToken);
            if (operation is null) return Results.NotFound();
            if (operation.Status != "AwaitingApproval") return Results.Conflict(new { errorCode = "submission_not_awaiting_approval", status = operation.Status });
            if (operation.RequestedByUserId == userId) return Results.Conflict(new { errorCode = "independent_approval_required" });
            var payload = JsonSerializer.Deserialize<EDocumentSubmissionRequest>(IntegrationOperationCipher.Decrypt(
                operation.EncryptedPayload, configuration, tenantId, operation.Id, "request"));
            if (EDocumentSubmissionRules.Validate(payload).Count > 0) return Results.Conflict(new { errorCode = "submission_invalid" });
            operation.Status = "Queued";
            operation.UpdatedAt = DateTimeOffset.UtcNow;
            operation.NextAttemptAt = operation.UpdatedAt;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "e-document.submission.approved", Resource = $"{payload!.DocumentType}:{payload.DocumentNumber}:{operation.Id:N}" });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { errorCode = "submission_state_changed" }); }
            return Results.Accepted($"/api/integrations/operations/{operation.Id:D}", ToResponse(operation, configuration));
        }).RequireAuthorization();

        app.MapGet("/api/integrations/operations", async (
            ClaimsPrincipal user,
            PlatformDbContext db,
            int page = 1,
            int pageSize = 25,
            string? status = null,
            string? integrationCode = null,
            CancellationToken cancellationToken = default) =>
        {
            if (!TryGetActor(user, out var tenantId, out _) || user.FindFirstValue("role") != "TenantAdmin")
                return Results.Forbid();
            if (page is < 1 or > MaximumAdminQueuePage || pageSize is < 1 or > 100 ||
                (status is not null && !IsKnownStatus(status)) ||
                (integrationCode is not null && !AIERP.ModuleSDK.ModuleManifestValidator.IsValidModuleCode(integrationCode)))
                return Results.BadRequest(new { errorCode = "invalid_query" });

            var query = db.IntegrationOperations.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (status is not null) query = query.Where(x => x.Status == status);
            if (integrationCode is not null) query = query.Where(x => x.IntegrationCode == integrationCode);
            var totalCount = await query.CountAsync(cancellationToken);
            var items = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new IntegrationOperationAdminItem(x.Id, x.IntegrationCode, x.Status,
                    x.CreatedAt, x.UpdatedAt, x.StartedAt, x.CompletedAt, x.AttemptCount, x.ErrorCode))
                .ToListAsync(cancellationToken);
            return Results.Ok(new IntegrationOperationAdminPage(items, page, pageSize, totalCount));
        }).RequireAuthorization();

        app.MapPost("/api/integrations/operations/{operationId:guid}/cancel", async (
            Guid operationId,
            ClaimsPrincipal user,
            PlatformDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId) || user.FindFirstValue("role") != "TenantAdmin")
                return Results.Forbid();
            var operation = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.Id == operationId &&
                x.TenantId == tenantId, cancellationToken);
            if (operation is null) return Results.NotFound();
            if (operation.Status is not ("Queued" or "AwaitingApproval"))
                return Results.Conflict(new { errorCode = "operation_not_cancellable", status = operation.Status });

            var now = DateTimeOffset.UtcNow;
            operation.Status = "Cancelled";
            operation.UpdatedAt = now;
            operation.CompletedAt = now;
            operation.EncryptedPayload = string.Empty;
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = "integration.operation.cancelled",
                Resource = $"{operation.IntegrationCode}:{operation.Id:N}"
            });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new { errorCode = "operation_state_changed" });
            }
            return Results.Ok(new IntegrationOperationAdminItem(operation.Id, operation.IntegrationCode, operation.Status,
                operation.CreatedAt, operation.UpdatedAt, operation.StartedAt, operation.CompletedAt,
                operation.AttemptCount, operation.ErrorCode));
        }).RequireAuthorization();

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
            if (!AIERP.ModuleSDK.ModuleManifestValidator.IsValidModuleCode(integrationCode) || integrationCode.StartsWith("tr.e-document.", StringComparison.Ordinal) || request.Payload.ValueKind != JsonValueKind.Object)
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

    private static async Task<EDocumentSubmissionRequest?> BuildSourceSubmissionAsync(
        TenantDbContext db, Guid tenantId, EDocumentSubmissionDraftRequest draft, CancellationToken cancellationToken)
    {
        if (draft.DocumentId == Guid.Empty) return null;
        if (draft.DocumentType == "e-dispatch")
        {
            var delivery = await db.SalesDeliveries.AsNoTracking()
                .Include(x => x.Order).ThenInclude(x => x.Customer).ThenInclude(x => x.Addresses)
                .Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == draft.DocumentId &&
                    x.Status == SalesDeliveryStatus.Posted, cancellationToken);
            if (delivery is null) return null;
            var document = JsonSerializer.SerializeToElement(new
            {
                source = new { kind = "sales-delivery", id = delivery.Id, code = delivery.Code },
                issueDate = delivery.DeliveryDate,
                customer = CustomerEnvelope(delivery.Order.Customer),
                lines = delivery.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new
                {
                    x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity,
                    x.EnteredQuantity, x.EnteredUnitCode
                })
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            return new EDocumentSubmissionRequest("e-dispatch", delivery.Id, delivery.Code,
                delivery.DeliveryDate, delivery.Order.CurrencyCode, document);
        }
        if (draft.DocumentType is not ("e-invoice" or "e-archive")) return null;
        var invoice = await db.SalesInvoices.AsNoTracking()
            .Include(x => x.Customer).ThenInclude(x => x.Addresses)
            .Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == draft.DocumentId &&
                x.Status == SalesInvoiceStatus.Posted, cancellationToken);
        if (invoice is null) return null;
        var invoiceDocument = JsonSerializer.SerializeToElement(new
        {
            source = new { kind = "sales-invoice", id = invoice.Id, code = invoice.Code },
            issueDate = invoice.InvoiceDate,
            customer = CustomerEnvelope(invoice.Customer),
            invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal, invoice.GrandTotal,
            lines = invoice.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new
            {
                x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice,
                x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal
            })
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return new EDocumentSubmissionRequest(draft.DocumentType, invoice.Id, invoice.Code,
            invoice.InvoiceDate, invoice.CurrencyCode, invoiceDocument);
    }

    private static object CustomerEnvelope(CustomerAccount customer) => new
    {
        customer.Code, customer.Name, customer.TaxNumber,
        addresses = customer.Addresses.Where(x => x.IsActive).OrderByDescending(x => x.IsDefault).Select(x => new
        {
            x.Label, x.AddressLine, x.City, x.District, x.PostalCode, x.CountryCode, x.IsDefault
        })
    };

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

    private static bool IsKnownStatus(string status) => status is
        "AwaitingApproval" or "Queued" or "Running" or "Succeeded" or "Failed" or "Indeterminate" or "Cancelled";
}
