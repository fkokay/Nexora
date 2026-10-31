using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class CustomerLocationDefinitionPermissionTests
{
    [Fact]
    public void Tenant_discovery_is_allowed_before_tenant_selection()
    {
        var resolved = PlatformPermissionCatalog.TryResolve("/api/auth/tenants", "GET", "/api/auth/tenants",
            new Dictionary<string, string?>(), Guid.Empty, Guid.Empty, string.Empty, out var permission);

        Assert.True(resolved);
        Assert.Null(permission);
    }

    [Theory]
    [InlineData("GET", "/api/location-definitions/", "/api/location-definitions/")]
    [InlineData("GET", "/api/location-definitions/provinces", "/api/location-definitions/provinces")]
    [InlineData("GET", "/api/location-definitions/districts", "/api/location-definitions/districts")]
    public void Location_lookups_use_existing_customer_read_permission(string method, string path, string routePattern)
    {
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern,
            new Dictionary<string, string?>(), Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.customers", permission.Permission.ResourceType);
        Assert.Equal("erp.customers.read", permission.Permission.Code);
    }
}
