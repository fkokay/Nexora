using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class GeneralLedgerTransferPreviewPermissionRoutingTests
{
    [Fact]
    public void Transfer_preview_uses_the_same_general_ledger_permission_as_the_transfer()
    {
        const string transfer = "/api/finance/general-ledger/transfer";
        const string preview = "/api/finance/general-ledger/transfer/preview";
        Assert.True(PlatformPermissionCatalog.TryResolve(transfer, "POST", transfer, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", out var transferPermission));
        Assert.True(PlatformPermissionCatalog.TryResolve(preview, "POST", preview, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantAdmin", out var previewPermission));

        Assert.StartsWith("erp.general-ledger.", transferPermission!.Permission.Code);
        Assert.Equal(transferPermission.Permission.Code, previewPermission!.Permission.Code);
    }
}
