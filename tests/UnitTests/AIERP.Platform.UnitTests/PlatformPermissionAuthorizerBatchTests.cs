using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Platform.UnitTests;

public sealed class PlatformPermissionAuthorizerBatchTests
{
    [Fact]
    public async Task Batch_decisions_match_single_decisions_for_allow_deny_admin_and_non_member()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"authorizer-batch-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenant = new Tenant { Name = "Batch", Slug = Guid.NewGuid().ToString("N"), IsActive = true };
        var user = new AppUser { Email = $"batch-user-{Guid.NewGuid():N}@example.test", IsActive = true };
        var admin = new AppUser { Email = $"batch-admin-{Guid.NewGuid():N}@example.test", IsActive = true };
        db.TenantMemberships.Add(new TenantMembership { Tenant = tenant, User = user, Role = "TenantUser" });
        db.TenantMemberships.Add(new TenantMembership { Tenant = tenant, User = admin, Role = "TenantAdmin" });
        foreach (var (code, effect) in new[] { ("erp.stock-items.read", TenantPermissionEffect.Allow), ("erp.stock-items.delete", TenantPermissionEffect.Allow),
                     ("erp.stock-items.delete", TenantPermissionEffect.Deny) })
            db.TenantPermissionRules.Add(new TenantPermissionRule
            {
                Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser", PermissionCode = code,
                ResourceType = "erp.stock-items", Effect = effect, IsActive = true
            });
        await db.SaveChangesAsync();

        var authorizer = new PlatformPermissionAuthorizer(db);
        var permissions = new[] { "erp.stock-items.read", "erp.stock-items.delete", "erp.stock-items.create", "erp.payroll-compensation.view" }
            .Select(code => Resolve(code, tenant.Id)).ToArray();

        foreach (var (userId, role) in new[] { (user.Id, "TenantUser"), (admin.Id, "TenantAdmin"), (Guid.NewGuid(), "TenantUser"), (user.Id, "TenantAdmin") })
        {
            var batch = await authorizer.IsAllowedManyAsync(tenant.Id, userId, role, permissions);
            var single = new List<bool>();
            foreach (var permission in permissions) single.Add(await authorizer.IsAllowedAsync(tenant.Id, userId, role, permission));
            Assert.Equal(single, batch);
        }
        Assert.Equal([true, false, false, false], await authorizer.IsAllowedManyAsync(tenant.Id, user.Id, "TenantUser", permissions));
        Assert.Equal([true, true, true, false], await authorizer.IsAllowedManyAsync(tenant.Id, admin.Id, "TenantAdmin", permissions));
    }

    private static ResolvedPlatformPermission Resolve(string code, Guid tenantId)
    {
        var definition = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code);
        return new ResolvedPlatformPermission(definition, new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"), ["request.action"] = definition.Action
        });
    }
}
