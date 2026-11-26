using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class SalesOrderTransitionPermissionRoutingTests
{
    [Theory]
    [InlineData("approve")]
    [InlineData("unapprove")]
    [InlineData("cancel")]
    public void Order_transitions_resolve_as_sales_order_execute(string transition)
    {
        var resolved = PlatformPermissionCatalog.TryResolve($"/api/sales/orders/00000000-0000-0000-0000-000000000001/{transition}", "POST",
            $"/api/sales/orders/{{id:guid}}/{transition}", new Dictionary<string, string?>(), Guid.NewGuid(), Guid.NewGuid(), "TenantUser",
            out var permission);

        Assert.True(resolved);
        Assert.Equal("erp.sales-orders.execute", permission!.Permission.Code);
    }
}
