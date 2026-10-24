using System.Data;
using System.Data.Common;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

public static class TenantProvisioningEndpoints
{
    public static WebApplication MapTenantProvisioningEndpoints(this WebApplication app)
    {
        var tenants = app.MapGroup("/api/platform/tenants")
            .WithTags("Platform Tenant Provisioning")
            .RequireAuthorization("PlatformSuperAdmin");

        tenants.MapPost("/", CreateAsync);
        tenants.MapGet("/{tenantId:guid}/provisioning", GetStatusAsync);
        tenants.MapPost("/{tenantId:guid}/provisioning/retry", RetryAsync);
        return app;
    }

    private static async Task<IResult> CreateAsync(
        CreateTenantProvisioningRequest request,
        HttpContext context,
        ClaimsPrincipal principal,
        PlatformDbContext db,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var requestedByUserId))
            return Results.Unauthorized();

        var idempotencyKey = context.Request.Headers["Idempotency-Key"].ToString().Trim();
        if (idempotencyKey.Length is < 8 or > 200)
            return Results.BadRequest(new { error = "idempotency_key_required", message = "Provide an Idempotency-Key between 8 and 200 characters." });

        TenantProvisioningRequestData normalized;
        try
        {
            normalized = TenantProvisioningRequestNormalizer.Normalize(
                request.Name, request.Slug, request.BaseCurrencyCode, request.AdminEmail, request.AdminDisplayName);
        }
        catch (ArgumentException exception)
        {
            return Results.BadRequest(new { error = "invalid_provisioning_request", message = exception.Message });
        }

        var idempotencyKeyHash = Sha256Hex(idempotencyKey);
        var payloadHash = Sha256Hex(JsonSerializer.SerializeToUtf8Bytes(normalized));
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var prior = await ReadJobAsync(db, "IdempotencyKeyHash", idempotencyKeyHash, lockForUpdate: true, cancellationToken);
            if (prior is not null)
            {
                if (!string.Equals(prior.PayloadSha256, payloadHash, StringComparison.Ordinal))
                    return Results.Conflict(new { error = "idempotency_key_reused", message = "This Idempotency-Key was already used for a different company request." });

                await transaction.CommitAsync(cancellationToken);
                return await StatusResultAsync(db, prior, cancellationToken);
            }

            var admin = await db.Users.SingleOrDefaultAsync(x => x.Email == normalized.AdminEmail, cancellationToken);
            if (admin is null || !admin.IsActive)
                return Results.UnprocessableEntity(new { error = "active_admin_user_required", message = "The admin email must belong to an existing active platform user. Create or invite the user through the account onboarding flow first." });

            if (await db.Tenants.AnyAsync(x => x.Slug == normalized.Slug, cancellationToken))
                return Results.Conflict(new { error = "company_slug_already_exists", message = "A company already uses this slug." });

            var tenant = new Tenant
            {
                Name = normalized.Name,
                Slug = normalized.Slug,
                BaseCurrencyCode = normalized.BaseCurrencyCode,
                IsActive = false
            };
            db.Tenants.Add(tenant);
            db.TenantMemberships.Add(new TenantMembership { Tenant = tenant, User = admin, Role = "TenantAdmin" });
            db.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenant.Id,
                DatabaseName = $"AIERPTenant_{tenant.Id:N}",
                State = TenantDatabaseProvisioningState.Provisioning
            });
            db.AuditEvents.Add(new AuditEvent
            {
                UserId = requestedByUserId,
                TenantId = tenant.Id,
                Action = "tenant.provisioning.requested",
                Resource = tenant.Slug
            });

            await db.SaveChangesAsync(cancellationToken);
            await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenant.Id, admin.Id, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);

            var jobId = Guid.NewGuid();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO [dbo].[TenantProvisioningJobs]
                    ([Id], [TenantId], [RequestedByUserId], [IdempotencyKeyHash], [PayloadSha256], [Status],
                     [AttemptCount], [CreatedAt], [UpdatedAt], [NextAttemptAt], [LeaseExpiresAt], [LeaseOwner], [CompletedAt], [ErrorCode])
                VALUES
                    ({jobId}, {tenant.Id}, {requestedByUserId}, {idempotencyKeyHash}, {payloadHash},
                     {(int)TenantProvisioningJobStatus.Queued}, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME(),
                     NULL, NULL, NULL, NULL);
                """, cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            var created = new JobSnapshot(jobId, tenant.Id, payloadHash, TenantProvisioningJobStatus.Queued, 0,
                DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null, null);
            var response = await CreateStatusResponseAsync(db, created, cancellationToken);
            return Results.Accepted(response.StatusUrl, response);
        }
        catch (Exception exception) when (IsUniqueViolation(exception))
        {
            var prior = await ReadJobAsync(db, "IdempotencyKeyHash", idempotencyKeyHash, lockForUpdate: false, cancellationToken);
            if (prior is not null && string.Equals(prior.PayloadSha256, payloadHash, StringComparison.Ordinal))
                return await StatusResultAsync(db, prior, cancellationToken);
            return Results.Conflict(new { error = "company_or_request_already_exists", message = "A company or request with these unique values already exists." });
        }
    }

    private static async Task<IResult> GetStatusAsync(Guid tenantId, PlatformDbContext db, CancellationToken cancellationToken)
    {
        var job = await ReadJobAsync(db, "TenantId", tenantId, lockForUpdate: false, cancellationToken);
        return job is null ? Results.NotFound() : Results.Ok(await CreateStatusResponseAsync(db, job, cancellationToken));
    }

    private static async Task<IResult> RetryAsync(
        Guid tenantId,
        ClaimsPrincipal principal,
        PlatformDbContext db,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var requestedByUserId))
            return Results.Unauthorized();

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var job = await ReadJobAsync(db, "TenantId", tenantId, lockForUpdate: true, cancellationToken);
        if (job is null) return Results.NotFound();

        if (job.Status == TenantProvisioningJobStatus.Failed)
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE [dbo].[TenantProvisioningJobs]
                SET [Status] = {(int)TenantProvisioningJobStatus.Queued}, [AttemptCount] = 0,
                    [NextAttemptAt] = SYSUTCDATETIME(), [UpdatedAt] = SYSUTCDATETIME(),
                    [LeaseExpiresAt] = NULL, [LeaseOwner] = NULL, [CompletedAt] = NULL, [ErrorCode] = NULL
                WHERE [Id] = {job.Id} AND [Status] = {(int)TenantProvisioningJobStatus.Failed};
                """, cancellationToken);
            db.AuditEvents.Add(new AuditEvent
            {
                UserId = requestedByUserId,
                TenantId = tenantId,
                Action = "tenant.provisioning.retry_requested",
                Resource = tenantId.ToString("D")
            });
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        var updated = await ReadJobAsync(db, "TenantId", tenantId, lockForUpdate: false, cancellationToken);
        return updated is null ? Results.NotFound() : await StatusResultAsync(db, updated, cancellationToken);
    }

    private static async Task<IResult> StatusResultAsync(PlatformDbContext db, JobSnapshot job, CancellationToken cancellationToken)
    {
        var response = await CreateStatusResponseAsync(db, job, cancellationToken);
        return job.Status is TenantProvisioningJobStatus.Queued or TenantProvisioningJobStatus.Running
            ? Results.Accepted(response.StatusUrl, response)
            : Results.Ok(response);
    }

    private static async Task<ProvisioningStatusResponse> CreateStatusResponseAsync(
        PlatformDbContext db,
        JobSnapshot job,
        CancellationToken cancellationToken)
    {
        var catalog = await db.TenantDatabaseCatalog.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == job.TenantId, cancellationToken);
        return new ProvisioningStatusResponse(
            job.Id,
            job.TenantId,
            job.Status,
            catalog?.State,
            job.AttemptCount,
            job.ErrorCode,
            job.CreatedAt,
            job.UpdatedAt,
            job.CompletedAt,
            $"/api/platform/tenants/{job.TenantId:D}/provisioning");
    }

    private static async Task<JobSnapshot?> ReadJobAsync(
        PlatformDbContext db,
        string keyColumn,
        object keyValue,
        bool lockForUpdate,
        CancellationToken cancellationToken)
    {
        if (keyColumn is not ("IdempotencyKeyHash" or "TenantId")) throw new ArgumentOutOfRangeException(nameof(keyColumn));
        var connection = db.Database.GetDbConnection();
        var closeAfter = connection.State != ConnectionState.Open;
        if (closeAfter) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
            var hints = lockForUpdate ? " WITH (UPDLOCK, HOLDLOCK)" : "";
            command.CommandText = $"SELECT [Id], [TenantId], [PayloadSha256], [Status], [AttemptCount], [CreatedAt], [UpdatedAt], [CompletedAt], [ErrorCode] FROM [dbo].[TenantProvisioningJobs]{hints} WHERE [{keyColumn}] = @key;";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "@key";
            parameter.Value = keyValue;
            command.Parameters.Add(parameter);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null;
            return new JobSnapshot(
                reader.GetGuid(0),
                reader.GetGuid(1),
                reader.GetString(2),
                (TenantProvisioningJobStatus)reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetFieldValue<DateTimeOffset>(5),
                reader.GetFieldValue<DateTimeOffset>(6),
                reader.IsDBNull(7) ? null : reader.GetFieldValue<DateTimeOffset>(7),
                reader.IsDBNull(8) ? null : reader.GetString(8));
        }
        finally
        {
            if (closeAfter) await connection.CloseAsync();
        }
    }

    private static bool IsUniqueViolation(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current is SqlException sql && sql.Number is 2601 or 2627) return true;
        return false;
    }

    private static string Sha256Hex(byte[] value) => Convert.ToHexString(SHA256.HashData(value));
    private static string Sha256Hex(string value) => Sha256Hex(Encoding.UTF8.GetBytes(value));

    private sealed record JobSnapshot(
        Guid Id,
        Guid TenantId,
        string PayloadSha256,
        TenantProvisioningJobStatus Status,
        int AttemptCount,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt,
        DateTimeOffset? CompletedAt,
        string? ErrorCode);

    public sealed record CreateTenantProvisioningRequest(
        string? Name,
        string? Slug,
        string? BaseCurrencyCode,
        string? AdminEmail,
        string? AdminDisplayName);

    public sealed record ProvisioningStatusResponse(
        Guid JobId,
        Guid TenantId,
        TenantProvisioningJobStatus Status,
        TenantDatabaseProvisioningState? ProvisioningState,
        int AttemptCount,
        string? ErrorCode,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt,
        DateTimeOffset? CompletedAt,
        string StatusUrl);
}
