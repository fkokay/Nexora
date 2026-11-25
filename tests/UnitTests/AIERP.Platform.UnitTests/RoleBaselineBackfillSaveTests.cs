using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Platform.UnitTests;

/// <summary>
/// The login backfill saves on its own (so a concurrent-login unique violation can be absorbed without losing the caller's
/// work) and therefore refuses to run with unrelated pending changes. The race itself needs SQL Server:
/// see PermissionBaselineConcurrencySqlAcceptanceTests.
/// </summary>
public sealed class RoleBaselineBackfillSaveTests
{
    [Fact]
    public async Task Backfill_saves_its_rules_and_audit_and_a_second_call_adds_nothing()
    {
        await using var db = await CreateAsync();
        var tenant = new Tenant { Name = "Backfill save", Slug = Guid.NewGuid().ToString("N") };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();

        var added = await TenantPermissionDefaults.AddMissingRoleBaselineAsync(db, tenant.Id, "TenantDeveloper", Guid.NewGuid());

        Assert.True(added > 0);
        Assert.False(db.ChangeTracker.HasChanges());
        db.ChangeTracker.Clear();
        Assert.Equal(added, await db.TenantPermissionRules.CountAsync(x => x.TenantId == tenant.Id && x.SubjectRole == "TenantDeveloper"));
        Assert.Equal(0, await TenantPermissionDefaults.AddMissingRoleBaselineAsync(db, tenant.Id, "TenantDeveloper", Guid.NewGuid()));
        Assert.Equal(1, await db.AuditEvents.CountAsync(x => x.TenantId == tenant.Id && x.Action == "permission.baseline.seeded"));
    }

    [Fact]
    public async Task Backfill_refuses_to_flush_unrelated_pending_changes()
    {
        await using var db = await CreateAsync();
        var tenant = new Tenant { Name = "Backfill pending", Slug = Guid.NewGuid().ToString("N") };
        db.Tenants.Add(tenant);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            TenantPermissionDefaults.AddMissingRoleBaselineAsync(db, tenant.Id, "TenantUser"));
        Assert.Equal(EntityState.Added, db.Entry(tenant).State);
        Assert.Empty(db.ChangeTracker.Entries<TenantPermissionRule>());
    }

    private static async Task<PlatformDbContext> CreateAsync()
    {
        var db = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"role-baseline-save-{Guid.NewGuid():N}").Options);
        await db.Database.EnsureCreatedAsync();
        return db;
    }
}
