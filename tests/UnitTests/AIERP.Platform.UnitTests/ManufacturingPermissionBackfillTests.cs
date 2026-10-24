using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Platform.UnitTests;

public sealed class ManufacturingPermissionBackfillTests
{
    [Fact]
    public async Task Existing_tenant_users_receive_new_manufacturing_baseline_permissions_without_overriding_configured_rules()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"manufacturing-permission-backfill-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var tenant = new Tenant { Name = "Legacy manufacturing tenant", Slug = Guid.NewGuid().ToString("N") };
        var user = new AppUser { Email = $"manufacturing-backfill-{Guid.NewGuid():N}@example.test" };
        db.TenantMemberships.Add(new TenantMembership { Tenant = tenant, User = user, Role = "TenantUser" });
        var readDefinition = await db.PermissionDefinitions.SingleAsync(x => x.Code == "erp.manufacturing.read");
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = tenant.Id,
            Tenant = tenant,
            SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "TenantUser",
            PermissionCode = readDefinition.Code,
            Permission = readDefinition,
            Effect = TenantPermissionEffect.Deny
        });
        await db.SaveChangesAsync();

        await TenantPermissionDefaults.AddMissingTenantUserBaselineAsync(db, tenant.Id, user.Id);
        await db.SaveChangesAsync();
        await TenantPermissionDefaults.AddMissingTenantUserBaselineAsync(db, tenant.Id, user.Id);
        await db.SaveChangesAsync();

        Assert.Equal(1, await db.TenantPermissionRules.CountAsync(x => x.TenantId == tenant.Id
            && x.SubjectRole == "TenantUser" && x.PermissionCode == "erp.manufacturing.read"));
        Assert.Equal(1, await db.TenantPermissionRules.CountAsync(x => x.TenantId == tenant.Id
            && x.SubjectRole == "TenantUser" && x.PermissionCode == "erp.manufacturing.create"));

        var authorizer = new PlatformPermissionAuthorizer(db);
        var readResolved = new ResolvedPlatformPermission(
            new PlatformPermissionDefinition(readDefinition.Code, readDefinition.ResourceType, readDefinition.Action, readDefinition.Description),
            new Dictionary<string, string> { ["resource.type"] = "erp.manufacturing" });
        var createDefinition = await db.PermissionDefinitions.SingleAsync(x => x.Code == "erp.manufacturing.create");
        var createResolved = new ResolvedPlatformPermission(
            new PlatformPermissionDefinition(createDefinition.Code, createDefinition.ResourceType, createDefinition.Action, createDefinition.Description),
            new Dictionary<string, string> { ["resource.type"] = "erp.manufacturing" });
        Assert.False(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", readResolved));
        Assert.True(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", createResolved));
    }
}
