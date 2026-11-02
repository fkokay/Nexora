using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;

/// <summary>
/// Creates the isolated, deterministic bootstrap tenant used by ReleaseDeployer staging.
/// It is opt-in and refuses to run outside Staging or with tenant separation disabled.
/// </summary>
public sealed class StagingBootstrapTenantInitializer(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<StagingBootstrapTenantInitializer> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!configuration.GetValue<bool>("StagingBootstrap:Enabled")) return;
        if (!string.Equals(environment.EnvironmentName, "Staging", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("StagingBootstrap can run only in the Staging environment.");
        if (!configuration.GetValue<bool>("Database:SeparationEnabled"))
            throw new InvalidOperationException("StagingBootstrap requires tenant database separation.");

        if (!Guid.TryParse(configuration["StagingBootstrap:TenantId"], out var tenantId) || tenantId == Guid.Empty)
            throw new InvalidOperationException("StagingBootstrap requires a valid deterministic TenantId.");
        var email = configuration["Bootstrap:Email"]?.Trim().ToLowerInvariant();
        var password = configuration["Bootstrap:Password"];
        var displayName = configuration["Bootstrap:DisplayName"]?.Trim();
        var tenantName = configuration["Bootstrap:TenantName"]?.Trim();
        var slug = $"staging-{tenantId:N}";
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254 || !email.Contains('@')
            || string.IsNullOrWhiteSpace(password) || Encoding.UTF8.GetByteCount(password) < 16
            || string.IsNullOrWhiteSpace(displayName) || displayName.Length > 160
            || string.IsNullOrWhiteSpace(tenantName) || tenantName.Length > 160)
            throw new InvalidOperationException("StagingBootstrap administrator and company settings are invalid.");

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken)
            : null;

        var existingTenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, cancellationToken);
        if (existingTenant is not null
            && (!string.Equals(existingTenant.Slug, slug, StringComparison.Ordinal)
                || !string.Equals(existingTenant.Name, tenantName, StringComparison.Ordinal)))
            throw new InvalidOperationException("StagingBootstrap TenantId is already bound to different tenant metadata.");
        if (existingTenant is null && await db.Tenants.AnyAsync(x => x.Slug == slug, cancellationToken))
            throw new InvalidOperationException("StagingBootstrap tenant slug is already bound to another tenant.");

        var admin = await db.Users.SingleOrDefaultAsync(x => x.Email == email, cancellationToken);
        if (admin is not null && !admin.IsActive)
            throw new InvalidOperationException("StagingBootstrap administrator account is inactive.");
        if (admin is not null && !string.Equals(admin.DisplayName, displayName, StringComparison.Ordinal))
            throw new InvalidOperationException("StagingBootstrap administrator email is already bound to different account metadata.");
        if (admin is not null && await db.TenantMemberships.AnyAsync(
                x => x.UserId == admin.Id && x.TenantId != tenantId, cancellationToken))
            throw new InvalidOperationException("StagingBootstrap administrator is already assigned to another tenant.");
        if (admin is null)
        {
            admin = new AppUser
            {
                Email = email,
                DisplayName = displayName,
                PasswordHash = PasswordHashing.Hash(password)
            };
            db.Users.Add(admin);
        }

        var createdTenant = existingTenant is null;
        var tenant = existingTenant ?? new Tenant
        {
            Id = tenantId,
            Name = tenantName,
            Slug = slug,
            IsActive = false,
            BaseCurrencyCode = "TRY"
        };
        if (existingTenant is null) db.Tenants.Add(tenant);

        if (!await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.UserId == admin.Id, cancellationToken))
            db.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = admin.Id, Role = "TenantAdmin" });

        var expectedErpDatabase = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.Erp);
        var catalog = await db.TenantDatabaseCatalog.SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (catalog is null)
        {
            catalog = new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId,
                DatabaseName = expectedErpDatabase,
                State = TenantDatabaseProvisioningState.Provisioning
            };
            db.TenantDatabaseCatalog.Add(catalog);
        }
        else if (!string.Equals(catalog.DatabaseName, expectedErpDatabase, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("StagingBootstrap tenant database catalog is not canonical.");
        }

        var studioKey = TenantDatabaseRouting.StudioComponentKey(tenantId);
        var studio = await db.DatabaseSeparationComponentStates.SingleOrDefaultAsync(x => x.Component == studioKey, cancellationToken);
        if (studio is not null && !string.Equals(studio.DatabaseName,
                TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio), StringComparison.Ordinal))
            throw new InvalidOperationException("StagingBootstrap AI Studio catalog is not canonical.");

        var ready = catalog.State == TenantDatabaseProvisioningState.Ready
            && studio?.State == TenantDatabaseProvisioningState.Ready;
        var job = await db.TenantProvisioningJobs.SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
        if (ready)
        {
            tenant.IsActive = true;
            if (job is null)
            {
                var now = DateTimeOffset.UtcNow;
                db.TenantProvisioningJobs.Add(CreateJob(tenantId, admin.Id, TenantProvisioningJobStatus.Completed, now));
            }
            else if (job.Status != TenantProvisioningJobStatus.Completed)
            {
                throw new InvalidOperationException("StagingBootstrap database catalog is Ready but its provisioning job is not Completed.");
            }
        }
        else
        {
            if (catalog.State == TenantDatabaseProvisioningState.Ready || studio?.State == TenantDatabaseProvisioningState.Ready)
                throw new InvalidOperationException("StagingBootstrap found a partially Ready ERP/AI Studio database pair.");
            tenant.IsActive = false;
            if (catalog.State == TenantDatabaseProvisioningState.Failed)
            {
                catalog.State = TenantDatabaseProvisioningState.Provisioning;
                catalog.LastError = null;
                catalog.UpdatedAt = DateTimeOffset.UtcNow;
            }
            if (job is null)
            {
                var now = DateTimeOffset.UtcNow;
                db.TenantProvisioningJobs.Add(CreateJob(tenantId, admin.Id, TenantProvisioningJobStatus.Queued, now));
            }
            else if (job.Status == TenantProvisioningJobStatus.Failed)
            {
                job.Status = TenantProvisioningJobStatus.Queued;
                job.AttemptCount = 0;
                job.NextAttemptAt = DateTimeOffset.UtcNow;
                job.UpdatedAt = job.NextAttemptAt;
                job.LeaseOwner = null;
                job.LeaseExpiresAt = null;
                job.CompletedAt = null;
                job.ErrorCode = null;
            }
            else if (job.Status == TenantProvisioningJobStatus.Completed)
            {
                throw new InvalidOperationException("StagingBootstrap provisioning job is Completed while an ERP/AI Studio database is not Ready.");
            }
        }

        if (createdTenant)
            await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenantId, admin.Id, cancellationToken);
        if (createdTenant)
            db.AuditEvents.Add(new AuditEvent
        {
            TenantId = tenantId,
            UserId = admin.Id,
            Action = "staging.tenant.bootstrap",
            Resource = slug
            });
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("ReleaseDeployer staging tenant bootstrap is ready for provisioning. Tenant {TenantId}; alreadyReady={AlreadyReady}.", tenantId, ready);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static TenantProvisioningJob CreateJob(Guid tenantId, Guid requestedByUserId,
        TenantProvisioningJobStatus status, DateTimeOffset now)
    {
        var identity = Encoding.UTF8.GetBytes($"release-deployer-staging:{tenantId:D}:v1");
        var hash = Convert.ToHexString(SHA256.HashData(identity)).ToLowerInvariant();
        return new TenantProvisioningJob
        {
            TenantId = tenantId,
            RequestedByUserId = requestedByUserId,
            IdempotencyKeyHash = hash,
            PayloadSha256 = hash,
            Status = status,
            CreatedAt = now,
            UpdatedAt = now,
            NextAttemptAt = now,
            CompletedAt = status == TenantProvisioningJobStatus.Completed ? now : null
        };
    }
}
