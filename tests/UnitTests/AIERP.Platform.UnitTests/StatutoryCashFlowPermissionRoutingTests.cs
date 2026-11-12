using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class StatutoryCashFlowPermissionRoutingTests
{
    [Fact]
    public void Statutory_cash_flow_statement_is_a_general_ledger_read()
    {
        const string route = "/api/finance/general-ledger/financial-statements/tms7/statement-of-cash-flows";
        var resolved = PlatformPermissionCatalog.TryResolve(route, "GET", route, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.Equal("erp.general-ledger.read", permission!.Permission.Code);
    }
}
