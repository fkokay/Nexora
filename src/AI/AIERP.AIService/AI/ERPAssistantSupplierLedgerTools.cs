using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Validates and minimizes a bounded supplier-ledger report for the read-only assistant.</summary>
internal static class ERPAssistantSupplierLedgerTools
{
    public static bool TryValidatePeriod(string? fromValue, string? toValue, DateOnly today,
        out DateOnly from, out DateOnly to) =>
        ERPAssistantCustomerLedgerTools.TryValidatePeriod(fromValue, toValue, today, out from, out to);

    public static Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken) =>
        ERPAssistantReportAccess.IsSourceAllowedAsync("supplierLedgerEntries", tenantId, userId, role, authorizer, cancellationToken);

    public static string SummarizeReport(JsonElement report, DateOnly from, DateOnly to) =>
        ERPAssistantCustomerLedgerTools.SummarizeLedgerReport(report, from, to, "supplierLedgerEntries");
}
