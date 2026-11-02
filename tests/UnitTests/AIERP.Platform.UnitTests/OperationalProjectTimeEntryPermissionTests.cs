using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Platform.UnitTests;

public sealed class OperationalProjectTimeEntryPermissionTests
{
    private const string PermissionCode = "erp.operational-projects.time-entries.create";

    [Fact]
    public void Time_entry_endpoint_uses_its_narrow_permission_while_project_creation_keeps_general_permission()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        Assert.True(PlatformPermissionCatalog.TryResolve($"/api/projects/{Guid.NewGuid():D}/time-entries", "POST",
            "/api/projects/{id:guid}/time-entries", new Dictionary<string, string?>(), tenantId, userId, "TenantUser", out var timeEntry));
        Assert.Equal(PermissionCode, timeEntry!.Permission.Code);
        Assert.Equal("erp.operational-projects", timeEntry.Permission.ResourceType);
        Assert.Equal("create", timeEntry.Permission.Action);

        Assert.True(PlatformPermissionCatalog.TryResolve("/api/projects/", "POST", "/api/projects/",
            new Dictionary<string, string?>(), tenantId, userId, "TenantUser", out var project));
        Assert.Equal("erp.operational-projects.create", project!.Permission.Code);
    }

    [Fact]
    public async Task Narrow_time_entry_permission_is_tenant_scoped_admin_bypassed_and_deny_overrides_allow()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"operational-project-time-permissions-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenant = new Tenant { Name = "Projects", Slug = Guid.NewGuid().ToString("N") };
        var user = new AppUser { Email = $"project-user-{Guid.NewGuid():N}@example.test" };
        var membership = new TenantMembership { Tenant = tenant, User = user, Role = "TenantUser" };
        var permission = new PermissionDefinition
        {
            Code = PermissionCode,
            ResourceType = "erp.operational-projects",
            Action = "create",
            Description = "Create own operational project time entries"
        };
        db.TenantMemberships.Add(membership);
        db.PermissionDefinitions.Add(permission);
        await db.SaveChangesAsync();
        await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenant.Id, user.Id);
        await db.SaveChangesAsync();

        Assert.True(PlatformPermissionCatalog.TryResolve("/api/projects/00000000-0000-0000-0000-000000000001/time-entries", "POST",
            "/api/projects/{id:guid}/time-entries", new Dictionary<string, string?>(), tenant.Id, user.Id, "TenantUser", out var resolved));
        var authorizer = new PlatformPermissionAuthorizer(db);
        Assert.True(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved!));
        Assert.False(await authorizer.IsAllowedAsync(Guid.NewGuid(), user.Id, "TenantUser", resolved!));

        membership.Role = "TenantAdmin";
        await db.SaveChangesAsync();
        Assert.True(PlatformPermissionCatalog.TryResolve("/api/projects/00000000-0000-0000-0000-000000000001/time-entries", "POST",
            "/api/projects/{id:guid}/time-entries", new Dictionary<string, string?>(), tenant.Id, user.Id, "TenantAdmin", out var adminResolved));
        Assert.True(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantAdmin", adminResolved!));

        membership.Role = "TenantUser";
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = tenant.Id,
            Tenant = tenant,
            SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "TenantUser",
            PermissionCode = PermissionCode,
            Permission = permission,
            Effect = TenantPermissionEffect.Deny
        });
        await db.SaveChangesAsync();
        Assert.False(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved!));
    }
}
