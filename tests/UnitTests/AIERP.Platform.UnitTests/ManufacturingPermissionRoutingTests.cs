using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ManufacturingPermissionRoutingTests
{
    [Theory]
    [InlineData("GET", "/api/manufacturing/work-centers/{id}/calendar", "/api/manufacturing/work-centers/{id:guid}/calendar", "read")]
    [InlineData("GET", "/api/manufacturing/work-centers/{id}/setup-rules", "/api/manufacturing/work-centers/{id:guid}/setup-rules", "read")]
    [InlineData("PUT", "/api/manufacturing/work-centers/{id}/calendar", "/api/manufacturing/work-centers/{id:guid}/calendar", "update")]
    [InlineData("PUT", "/api/manufacturing/work-centers/{id}/setup-rules", "/api/manufacturing/work-centers/{id:guid}/setup-rules", "update")]
    public void Work_center_detail_routes_resolve_to_manufacturing_permissions(
        string method, string path, string routePattern, string action)
    {
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern,
            new Dictionary<string, string?> { ["id"] = Guid.NewGuid().ToString("D") },
            Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.manufacturing", permission.Permission.ResourceType);
        Assert.Equal($"erp.manufacturing.{action}", permission.Permission.Code);
    }
}
