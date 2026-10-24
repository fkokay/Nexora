using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class SalesPromotionPermissionRoutingTests
{
    [Theory]
    [InlineData("GET", "/api/sales/promotions/", "erp.sales-promotions.read")]
    [InlineData("POST", "/api/sales/promotions/", "erp.sales-promotions.create")]
    [InlineData("PUT", "/api/sales/promotions/00000000-0000-0000-0000-000000000001", "erp.sales-promotions.update")]
    [InlineData("POST", "/api/sales/promotions/00000000-0000-0000-0000-000000000001/apply", "erp.sales-promotions.execute")]
    [InlineData("POST", "/api/finance/exchange-rates/import-tcmb", "erp.exchange-rates.execute")]
    [InlineData("POST", "/api/finance/general-ledger/entries/manual", "erp.general-ledger.create")]
    public void Routes_resolve_to_their_dedicated_permission_action(string method, string path, string expectedCode)
    {
        var routePattern = path.EndsWith("/apply", StringComparison.Ordinal)
            ? "/api/sales/promotions/{id:guid}/apply"
            : path.EndsWith("/", StringComparison.Ordinal) ? "/api/sales/promotions/"
            : path.EndsWith("/import-tcmb", StringComparison.Ordinal) ? "/api/finance/exchange-rates/import-tcmb"
            : path.EndsWith("/entries/manual", StringComparison.Ordinal) ? "/api/finance/general-ledger/entries/manual"
            : path.EndsWith("/promotions", StringComparison.Ordinal) ? "/api/sales/promotions/"
            : "/api/sales/promotions/{id:guid}";
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.Equal(expectedCode, permission!.Permission.Code);
    }
}
