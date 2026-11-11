using System.Security.Claims;
using System.Security.Cryptography;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.IntegrationSDK;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

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
public sealed record EDocumentReconciliationRequest(string Outcome, string? ExternalReference, string EvidenceSummary);

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
                        x.Status == SalesDeliveryStatus.Posted && x.Order != null)
                    .OrderByDescending(x => x.DeliveryDate).ThenBy(x => x.Code).Take(100)
                    .Select(x => new EDocumentSourceDocument(x.Id, x.Code, x.DeliveryDate, x.Order!.CurrencyCode,
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
            var errors = ValidateSubmission(request);
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
            var errors = ValidateSubmission(request);
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
            if (ValidateSubmission(payload).Count > 0) return Results.Conflict(new { errorCode = "submission_invalid" });
            operation.Status = "Queued";
            operation.UpdatedAt = DateTimeOffset.UtcNow;
            operation.NextAttemptAt = operation.UpdatedAt;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "e-document.submission.approved", Resource = $"{payload!.DocumentType}:{payload.DocumentNumber}:{operation.Id:N}" });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { errorCode = "submission_state_changed" }); }
            return Results.Accepted($"/api/integrations/operations/{operation.Id:D}", ToResponse(operation, configuration));
        }).RequireAuthorization();

        app.MapPost("/api/e-documents/submissions/{operationId:guid}/reconcile", async (
            Guid operationId, EDocumentReconciliationRequest reconciliation, ClaimsPrincipal user,
            PlatformDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            if (reconciliation.Outcome is not ("confirmed_submitted" or "confirmed_not_submitted"))
                return Results.BadRequest(new { errorCode = "invalid_reconciliation_outcome" });
            var reference = reconciliation.ExternalReference?.Trim();
            var evidence = reconciliation.EvidenceSummary?.Trim();
            if ((reconciliation.Outcome == "confirmed_submitted" &&
                    (string.IsNullOrWhiteSpace(reference) || reference.Length > 200 || reference.Any(char.IsControl) ||
                     !reference.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or ':' or '-' or '/'))) ||
                (reference is not null && (reference.Length > 200 || reference.Any(char.IsControl))) ||
                string.IsNullOrWhiteSpace(evidence) || evidence.Length is < 10 or > 1000 || evidence.Any(char.IsControl))
                return Results.BadRequest(new { errorCode = "invalid_reconciliation_evidence" });

            var operation = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.Id == operationId &&
                x.TenantId == tenantId && x.IntegrationCode == EDocumentIntegrationCode, cancellationToken);
            if (operation is null) return Results.NotFound();
            if (operation.Status != "Indeterminate")
                return Results.Conflict(new { errorCode = "submission_not_indeterminate", status = operation.Status });
            if (operation.RequestedByUserId == userId)
                return Results.Conflict(new { errorCode = "independent_reconciliation_required" });

            var payloadJson = IntegrationOperationCipher.Decrypt(operation.EncryptedPayload, configuration, tenantId, operation.Id, "request");
            var submission = JsonSerializer.Deserialize<EDocumentSubmissionRequest>(payloadJson);
            if (submission is null || ValidateSourceSubmission(submission).Count > 0)
                return Results.Conflict(new { errorCode = "submission_invalid" });

            var now = DateTimeOffset.UtcNow;
            var confirmedSubmitted = reconciliation.Outcome == "confirmed_submitted";
            var resultValue = JsonSerializer.SerializeToElement(new
            {
                outcome = reconciliation.Outcome,
                evidenceSummary = evidence,
                reconciledAt = now,
                reconciledByUserId = userId
            });
            var providerResult = new AIERP.IntegrationSDK.IntegrationHostExecuteResponse(
                confirmedSubmitted, resultValue, reference,
                confirmedSubmitted ? null : "delivery_confirmed_not_submitted", operation.AttemptCount, now);
            operation.Status = confirmedSubmitted ? "Succeeded" : "Failed";
            operation.ErrorCode = confirmedSubmitted ? null : "delivery_confirmed_not_submitted";
            operation.EncryptedResult = IntegrationOperationCipher.Encrypt(JsonSerializer.Serialize(providerResult),
                configuration, tenantId, operation.Id, "result");
            operation.EncryptedPayload = "";
            operation.UpdatedAt = now;
            operation.CompletedAt = now;
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = confirmedSubmitted ? "e-document.submission.reconciled.submitted" : "e-document.submission.reconciled.not-submitted",
                Resource = $"{submission.DocumentType}:{submission.DocumentNumber}:{operation.Id:N}"
            });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { errorCode = "submission_state_changed" }); }
            return Results.Ok(ToResponse(operation, configuration));
        }).RequireAuthorization();

        app.MapGet("/api/e-documents/submissions/{operationId:guid}/provider-status", async (
            Guid operationId, ClaimsPrincipal user, PlatformDbContext db, IConfiguration configuration,
            IHttpClientFactory clients, CancellationToken cancellationToken) =>
        {
            if (!TryGetActor(user, out var tenantId, out var userId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var operation = await db.IntegrationOperations.SingleOrDefaultAsync(x => x.Id == operationId &&
                x.TenantId == tenantId && x.IntegrationCode == EDocumentIntegrationCode, cancellationToken);
            if (operation is null) return Results.NotFound();
            if (operation.Status is not ("Indeterminate" or "Succeeded"))
                return Results.Conflict(new { errorCode = "submission_not_status_checkable", status = operation.Status });
            if (operation.RequestedByUserId == userId)
                return Results.Conflict(new { errorCode = "independent_reconciliation_required" });

            string documentType;
            string documentNumber;
            if (operation.Status == "Indeterminate")
            {
                EDocumentSubmissionRequest? submission;
                try
                {
                    var payloadJson = IntegrationOperationCipher.Decrypt(operation.EncryptedPayload, configuration, tenantId, operation.Id, "request");
                    submission = JsonSerializer.Deserialize<EDocumentSubmissionRequest>(payloadJson);
                }
                catch (Exception exception) when (exception is CryptographicException or FormatException or JsonException)
                {
                    return Results.Problem("Submission data is unavailable for provider status lookup.", statusCode: StatusCodes.Status409Conflict);
                }
                if (submission is null || submission.DocumentType is not ("e-invoice" or "e-archive" or "e-dispatch") || ValidateSourceSubmission(submission).Count > 0)
                    return Results.Conflict(new { errorCode = "submission_invalid" });
                documentType = submission.DocumentType;
                documentNumber = submission.DocumentNumber;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(operation.EncryptedResult))
                    return Results.Conflict(new { errorCode = "provider_create_result_unavailable" });
                try
                {
                    var resultJson = IntegrationOperationCipher.Decrypt(operation.EncryptedResult, configuration, tenantId, operation.Id, "result");
                    var createResult = JsonSerializer.Deserialize<IntegrationHostExecuteResponse>(resultJson,
                        new JsonSerializerOptions(JsonSerializerDefaults.Web));
                    if (createResult is null || !createResult.Succeeded || createResult.ExternalReference is null ||
                        !Guid.TryParse(createResult.ExternalReference, out var createdUuid) || createdUuid != operation.Id ||
                        createResult.Value is not JsonElement providerDocument || providerDocument.ValueKind != JsonValueKind.Object ||
                        !providerDocument.TryGetProperty("scenario", out var scenarioValue) || scenarioValue.ValueKind != JsonValueKind.String)
                        return Results.Conflict(new { errorCode = "provider_create_result_unavailable" });
                    documentType = scenarioValue.GetString() switch
                    {
                        "EARSIVFATURA" => "e-archive",
                        "TEMELFATURA" or "TICARIFATURA" => "e-invoice",
                        _ => ""
                    };
                    if (documentType.Length == 0) return Results.Conflict(new { errorCode = "provider_create_result_unsupported" });
                    documentNumber = operation.Id.ToString("D");
                }
                catch (Exception exception) when (exception is CryptographicException or FormatException or JsonException)
                {
                    return Results.Problem("Provider create result is unavailable for status lookup.", statusCode: StatusCodes.Status409Conflict);
                }
            }

            var signingKey = configuration["IntegrationHost:SigningKey"] ?? configuration["PluginHost:SigningKey"];
            if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32 ||
                !Uri.TryCreate(configuration["IntegrationHost:BaseUrl"], UriKind.Absolute, out var hostUri) ||
                hostUri.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(hostUri.UserInfo) ||
                !string.IsNullOrEmpty(hostUri.Query) || !string.IsNullOrEmpty(hostUri.Fragment))
                return Results.Problem("IntegrationHost is unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable);

            var now = DateTimeOffset.UtcNow;
            var hostRequest = new IntegrationHostExecuteRequest(EDocumentIntegrationCode, operation.ProviderIdempotencyKey,
                operation.Id.ToString("N"), now.AddSeconds(30), JsonSerializer.SerializeToElement(new
                {
                    action = "get-status",
                    documentType,
                    documentUuid = operation.Id
                }));
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = "e-document.provider-status.lookup.requested",
                Resource = $"{documentType}:{documentNumber}:{operation.Id:N}"
            });
            await db.SaveChangesAsync(cancellationToken);

            using var client = clients.CreateClient("integration-host");
            client.BaseAddress = hostUri;
            using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/integrations/execute")
            {
                Content = System.Net.Http.Json.JsonContent.Create(hostRequest)
            };
            message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",
                CreateIntegrationHostToken(tenantId, userId, signingKey,
                    configuration["IntegrationHost:Issuer"] ?? "AIERP",
                    configuration["IntegrationHost:Audience"] ?? "AIERP.IntegrationHost"));

            IntegrationHostExecuteResponse? providerResult;
            try
            {
                using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                var responseBytes = await IntegrationOperationWorker.ReadBoundedResponseAsync(response.Content, 128 * 1024, cancellationToken);
                providerResult = JsonSerializer.Deserialize<IntegrationHostExecuteResponse>(responseBytes,
                    new JsonSerializerOptions(JsonSerializerDefaults.Web));
                if (providerResult is null || !response.IsSuccessStatusCode)
                {
                    if (providerResult?.ErrorCode == "provider_status_not_found")
                        return Results.NotFound(new { errorCode = "provider_status_not_found", operationStatus = operation.Status });
                    return Results.Problem("Provider status lookup failed; the queue operation state is unchanged.",
                        statusCode: StatusCodes.Status502BadGateway);
                }
            }
            catch (HttpRequestException)
            {
                return Results.Problem("Provider status lookup is temporarily unavailable; the queue operation state is unchanged.",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            catch (InvalidDataException)
            {
                return Results.Problem("Provider status response was invalid; the queue operation state is unchanged.",
                    statusCode: StatusCodes.Status502BadGateway);
            }
            catch (JsonException)
            {
                return Results.Problem("Provider status response was invalid; the queue operation state is unchanged.",
                    statusCode: StatusCodes.Status502BadGateway);
            }

            if (!providerResult.Succeeded || providerResult.ExternalReference is null ||
                !Guid.TryParse(providerResult.ExternalReference, out var returnedUuid) || returnedUuid != operation.Id)
                return Results.Problem("Provider status could not be confirmed; the queue operation state is unchanged.",
                    statusCode: StatusCodes.Status502BadGateway);

            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = "e-document.provider-status.checked",
                Resource = $"{documentType}:{documentNumber}:{operation.Id:N}"
            });
            await db.SaveChangesAsync(cancellationToken);
            var currentOperationStatus = await db.IntegrationOperations.AsNoTracking()
                .Where(x => x.Id == operation.Id && x.TenantId == tenantId && x.IntegrationCode == EDocumentIntegrationCode)
                .Select(x => x.Status)
                .SingleOrDefaultAsync(cancellationToken);
            if (currentOperationStatus is null) return Results.NotFound();
            return Results.Ok(new
            {
                operationId = operation.Id,
                operationStatus = currentOperationStatus,
                providerStatus = providerResult.Value,
                externalReference = providerResult.ExternalReference
            });
        }).RequireAuthorization().RequireRateLimiting("integration-execute");

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
                .Include(x => x.Order).ThenInclude(x => x!.Customer).ThenInclude(x => x.Addresses)
                .Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == draft.DocumentId &&
                    x.Status == SalesDeliveryStatus.Posted, cancellationToken);
            if (delivery?.Order is null) return null;
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
            eDocumentScenario = invoice.EDocumentScenario,
            eDocumentTypeCode = invoice.EDocumentTypeCode,
            recipientAlias = invoice.EDocumentRecipientAlias,
            eCommerce = new
            {
                purchaseUrl = invoice.ECommercePurchaseUrl,
                paymentTaxId = invoice.ECommercePaymentTaxId,
                paymentTitle = invoice.ECommercePaymentTitle,
                paymentAlias = invoice.ECommercePaymentAlias,
                paymentAgentName = invoice.ECommercePaymentAgentName,
                paymentType = invoice.ECommercePaymentType,
                paymentDate = invoice.ECommercePaymentDate,
                paymentDueDate = invoice.ECommercePaymentDueDate,
                paymentMeans = invoice.ECommercePaymentMeans,
                instructionNote = invoice.ECommercePaymentInstructionNote,
                carrierTaxId = invoice.DeliveryCarrierTaxId,
                carrierName = invoice.DeliveryCarrierName,
                carrierSurname = invoice.DeliveryCarrierSurname,
                sentAt = invoice.DeliverySentAt
            },
            intermediaryInfo = invoice.EDocumentScenario == "YOLCUBERABERFATURA" ? new
            {
                taxId = invoice.ECommercePaymentTaxId,
                title = invoice.ECommercePaymentTitle,
                alias = invoice.ECommercePaymentAlias,
                country = invoice.ECommerceIntermediaryCountry,
                countryCode = invoice.ECommerceIntermediaryCountryCode,
                city = invoice.ECommerceIntermediaryCity,
                district = invoice.ECommerceIntermediaryDistrict
            } : null,
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

    private static IReadOnlyList<string> ValidateSubmission(EDocumentSubmissionRequest? request) =>
        ValidateSourceSubmission(request).Concat(TrendyolEInvoiceReadinessRules.Validate(request)).Distinct(StringComparer.Ordinal).ToArray();

    private static IReadOnlyList<string> ValidateSourceSubmission(EDocumentSubmissionRequest? request) =>
        EDocumentSubmissionRules.Validate(request);

    private static object CustomerEnvelope(CustomerAccount customer) => new
    {
        customer.Code, customer.Name, customer.TaxNumber, customer.IdentityNumber,
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

    private static string CreateIntegrationHostToken(Guid tenantId, Guid userId, string signingKey, string issuer, string audience)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString("D")),
            new Claim("service", "AIERP.Api"),
            new Claim("operation", "integration.execute"),
            new Claim("tenant_id", tenantId.ToString("D")),
            new Claim("integration_code", EDocumentIntegrationCode)
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(issuer, audience, claims,
            now.AddSeconds(-5), now.AddSeconds(45), new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
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
