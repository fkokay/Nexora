using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Platform.UnitTests;

public sealed class CustomPageAccessRulesTests
{
    private static readonly Guid User = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid OtherUser = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public void Evaluate_without_access_row_grants_view_only()
    {
        Assert.Equal(new CustomPageRights(true, false, false, false), CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: false, isMember: true, pageHasQueries: false));
        // A missing row never widens rights for admins (they already get all) and never reaches non-members.
        Assert.Equal(CustomPageRights.All, CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: true, isMember: true, pageHasQueries: false));
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: false, isMember: false, pageHasQueries: false));
    }

    [Fact]
    public void Evaluate_without_row_and_with_queries_is_admins_only()
    {
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: false, isMember: true, pageHasQueries: true));
        Assert.Equal(CustomPageRights.All, CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: true, isMember: true, pageHasQueries: true));
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: true, isMember: false, pageHasQueries: true));
    }

    [Fact]
    public void Access_rule_uses_queries_only_when_no_access_row()
    {
        // A saved row decides regardless of queries; without a row, only a page with queries falls back to AdminsOnly.
        var allUsers = Access(CustomPageAccessModes.AllUsers);
        Assert.Equal(new CustomPageRights(true, false, false, false), CustomPageAccessRules.Evaluate(allUsers, User, isTenantAdmin: false, isMember: true, pageHasQueries: true));
        var selected = Access(CustomPageAccessModes.SelectedUsers);
        selected.Users.Add(new TenantCustomPageAccessUser { AccessId = selected.Id, UserId = User, CanView = true });
        Assert.Equal(new CustomPageRights(true, false, false, false), CustomPageAccessRules.Evaluate(selected, User, isTenantAdmin: false, isMember: true, pageHasQueries: true));
        Assert.Equal(new CustomPageRights(true, false, false, false), CustomPageAccessRules.Evaluate(null, User, isTenantAdmin: false, isMember: true, pageHasQueries: false));
    }

    [Fact]
    public void Evaluate_grants_all_rights_to_tenant_admin()
    {
        var access = Access(CustomPageAccessModes.AdminsOnly);
        Assert.Equal(CustomPageRights.All, CustomPageAccessRules.Evaluate(access, User, isTenantAdmin: true, isMember: true, pageHasQueries: false));
        var selected = Access(CustomPageAccessModes.SelectedUsers);
        Assert.Equal(CustomPageRights.All, CustomPageAccessRules.Evaluate(selected, User, isTenantAdmin: true, isMember: true, pageHasQueries: false));
    }

    [Fact]
    public void Evaluate_admins_only_denies_regular_user()
    {
        var access = Access(CustomPageAccessModes.AdminsOnly);
        access.Users.Add(new TenantCustomPageAccessUser { AccessId = access.Id, UserId = User, CanView = true, CanInsert = true });
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(access, User, isTenantAdmin: false, isMember: true, pageHasQueries: false));
    }

    [Fact]
    public void Evaluate_all_users_applies_shared_write_flags()
    {
        var access = Access(CustomPageAccessModes.AllUsers);
        access.AllUsersCanUpdate = true;
        Assert.Equal(new CustomPageRights(true, false, true, false), CustomPageAccessRules.Evaluate(access, User, isTenantAdmin: false, isMember: true, pageHasQueries: false));
    }

    [Fact]
    public void Evaluate_selected_users_returns_user_row_rights()
    {
        var access = Access(CustomPageAccessModes.SelectedUsers);
        access.Users.Add(new TenantCustomPageAccessUser { AccessId = access.Id, UserId = User, CanView = true, CanInsert = true });
        Assert.Equal(new CustomPageRights(true, true, false, false), CustomPageAccessRules.Evaluate(access, User, isTenantAdmin: false, isMember: true, pageHasQueries: false));
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(access, OtherUser, isTenantAdmin: false, isMember: true, pageHasQueries: false));
    }

    [Fact]
    public void Evaluate_ignores_users_without_membership()
    {
        var access = Access(CustomPageAccessModes.SelectedUsers);
        access.Users.Add(new TenantCustomPageAccessUser { AccessId = access.Id, UserId = User, CanView = true, CanInsert = true, CanUpdate = true, CanDelete = true });
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(access, User, isTenantAdmin: false, isMember: false, pageHasQueries: false));
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(access, User, isTenantAdmin: true, isMember: false, pageHasQueries: false));
        Assert.Equal(CustomPageRights.None, CustomPageAccessRules.Evaluate(Access(CustomPageAccessModes.AllUsers), User, isTenantAdmin: false, isMember: false, pageHasQueries: false));
    }

    [Theory]
    [InlineData("GET", "read")]
    [InlineData("PUT", "update")]
    public void Access_routes_resolve_to_tenant_customization_permission(string method, string action)
    {
        var resolved = PlatformPermissionCatalog.TryResolve("/api/custom-pages/asset-dashboard/access", method, "/api/custom-pages/{code}/access",
            new Dictionary<string, string?> { ["code"] = "asset-dashboard" }, Guid.NewGuid(), User, "TenantAdmin", out var permission);
        Assert.True(resolved);
        Assert.Equal("erp.tenant-customizations", permission!.Permission.ResourceType);
        Assert.Equal(action, permission.Permission.Action);
    }

    [Fact]
    public void Query_run_route_resolves_to_custom_page_runtime_read_permission()
    {
        // Running a published page's query is runtime page use, like opening /{code}/published.
        var run = PlatformPermissionCatalog.TryResolve("/api/custom-pages/asset-dashboard/queries/q1/run", "POST", "/api/custom-pages/{code}/queries/{queryId}/run",
            new Dictionary<string, string?> { ["code"] = "asset-dashboard", ["queryId"] = "q1" }, Guid.NewGuid(), User, "TenantUser", out var permission);
        Assert.True(run);
        Assert.Equal("erp.custom-menus", permission!.Permission.ResourceType);
        Assert.Equal("read", permission.Permission.Action);

        var id = Guid.NewGuid().ToString("D");
        var preview = PlatformPermissionCatalog.TryResolve($"/api/custom-pages/{id}/preview/queries/q1/run", "POST", "/api/custom-pages/{id:guid}/preview/queries/{queryId}/run",
            new Dictionary<string, string?> { ["id"] = id, ["queryId"] = "q1" }, Guid.NewGuid(), User, "TenantAdmin", out var previewPermission);
        Assert.True(preview);
        Assert.Equal("erp.tenant-customizations", previewPermission!.Permission.ResourceType);
    }

    [Fact]
    public void Erp_operation_catalog_route_resolves_to_custom_page_runtime_read_permission()
    {
        // Published pages load the ERP operation catalog at runtime, so reading it is page use like /{code}/published.
        var resolved = PlatformPermissionCatalog.TryResolve("/api/custom-pages/erp-operations", "GET", "/api/custom-pages/erp-operations",
            new Dictionary<string, string?>(), Guid.NewGuid(), User, "TenantUser", out var permission);
        Assert.True(resolved);
        Assert.Equal("erp.custom-menus", permission!.Permission.ResourceType);
        Assert.Equal("read", permission.Permission.Action);
    }

    private static TenantCustomPageAccess Access(string mode) => new() { TenantId = Guid.NewGuid(), PageCode = "asset-dashboard", Mode = mode, Revision = 1 };
}
