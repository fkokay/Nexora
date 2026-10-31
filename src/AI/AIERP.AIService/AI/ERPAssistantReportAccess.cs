using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.AIService.AI;

/// <summary>
/// Adds source-module permission checks to ERP assistant reports. The report API
/// itself authorizes the report-builder permission, which is broader than a
/// caller's permission to each underlying ERP module.
/// </summary>
public static class ERPAssistantReportAccess
{
    private static readonly IReadOnlyDictionary<string, string> SourcePaths = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["customers"] = "/api/customers",
        ["salesInvoices"] = "/api/sales/invoices",
        ["purchaseOrders"] = "/api/purchasing/orders",
        ["purchaseInvoices"] = "/api/purchasing/invoices",
        ["purchaseReceipts"] = "/api/purchasing/receipts",
        ["manufacturingOrders"] = "/api/manufacturing/orders",
        ["manufacturingWorkCenters"] = "/api/manufacturing/work-centers",
        ["inventoryTransactions"] = "/api/stock/items",
        ["inventoryTracking"] = "/api/inventory-tracking",
        ["salesOrders"] = "/api/sales/orders",
        ["salesOrderFulfillment"] = "/api/sales/orders",
        ["purchaseOrderFulfillment"] = "/api/purchasing/orders",
        ["salesQuotes"] = "/api/sales/quotes",
        ["purchaseSupplierQuotes"] = "/api/purchasing/supplier-quotes",
        ["supplierPayments"] = "/api/purchasing/payments",
        ["salesDeliveries"] = "/api/sales/deliveries",
        ["salesReturns"] = "/api/sales/returns",
        ["supplierReturns"] = "/api/purchasing/returns",
        ["purchaseRequests"] = "/api/purchasing/requests",
        ["stockItems"] = "/api/stock/items",
        ["warehouseStock"] = "/api/warehouses",
        ["bankStatements"] = "/api/finance/statements",
        ["bankStatementLines"] = "/api/finance/statements",
        ["financialAccountTransactions"] = "/api/finance/accounts",
        ["financialAccountTransfers"] = "/api/finance/transfers",
        ["journalEntryLines"] = "/api/finance/general-ledger",
        ["fxRevaluationLines"] = "/api/finance/fx-revaluations",
        ["crmOpportunities"] = "/api/crm/opportunities",
        ["customerLedgerEntries"] = "/api/customers",
        ["supplierLedgerEntries"] = "/api/purchasing/payments",
        ["inventoryTransfers"] = "/api/warehouses/transfers",
        ["workflowInstances"] = "/api/workflows"
    };

    private static readonly IReadOnlyDictionary<string, string> DateFields = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["salesInvoices"] = "invoiceDate", ["purchaseOrders"] = "orderDate", ["purchaseInvoices"] = "invoiceDate",
        ["purchaseReceipts"] = "receiptDate", ["manufacturingOrders"] = "plannedDate", ["inventoryTransactions"] = "entryDate",
        ["salesOrders"] = "orderDate", ["salesOrderFulfillment"] = "orderDate", ["purchaseOrderFulfillment"] = "orderDate",
        ["salesQuotes"] = "quoteDate", ["purchaseSupplierQuotes"] = "quoteDate", ["supplierPayments"] = "paymentDate",
        ["salesDeliveries"] = "deliveryDate", ["salesReturns"] = "returnDate", ["supplierReturns"] = "returnDate",
        ["purchaseRequests"] = "requestDate", ["bankStatements"] = "startDate", ["bankStatementLines"] = "transactionDate",
        ["financialAccountTransactions"] = "transactionDate", ["financialAccountTransfers"] = "transferDate",
        ["journalEntryLines"] = "entryDate", ["fxRevaluationLines"] = "asOfDate", ["customerLedgerEntries"] = "entryDate",
        ["supplierLedgerEntries"] = "entryDate",
        ["inventoryTransfers"] = "transferDate", ["crmOpportunities"] = "createdAt", ["workflowInstances"] = "completedAt"
    };

    public static async Task<bool> IsSourceAllowedAsync(string source, Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!SourcePaths.TryGetValue(source, out var path)) return false;
        if (!PlatformPermissionCatalog.TryResolve(path, "GET", path, new Dictionary<string, string?>(), tenantId, userId, role,
                out var permission) || permission is null) return false;
        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static Task<bool> IsReportCatalogAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken) =>
        IsEndpointAllowedAsync("/api/reports/catalog", "GET", tenantId, userId, role, authorizer, cancellationToken);

    public static Task<bool> IsReportRunAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken) =>
        IsEndpointAllowedAsync("/api/reports/run", "POST", tenantId, userId, role, authorizer, cancellationToken);

    private static async Task<bool> IsEndpointAllowedAsync(string path, string method, Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(path, method, path, new Dictionary<string, string?>(), tenantId, userId, role,
                out var permission) || permission is null) return false;
        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static bool HasBoundedDateWindow(string source, JsonElement filters)
    {
        if (!DateFields.TryGetValue(source, out var dateField)) return true;
        if (filters.ValueKind != JsonValueKind.Array) return false;
        if (dateField is "createdAt" or "updatedAt" or "nextActivityAt" or "completedAt" or "startedAt")
            return HasBoundedDateTimeWindow(filters, dateField);
        DateOnly? from = null;
        DateOnly? through = null;
        foreach (var filter in filters.EnumerateArray())
        {
            if (!filter.TryGetProperty("field", out var field) || field.GetString() != dateField ||
                !filter.TryGetProperty("operator", out var op) || !filter.TryGetProperty("value", out var value) ||
                value.ValueKind != JsonValueKind.String) continue;
            var text = value.GetString();
            if (op.GetString() == "gte" && DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var lower)) from = lower;
            if (op.GetString() is "lte" or "lt" && DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var upper)) through = upper;
        }
        return from is not null && through is not null && through >= from && through.Value.DayNumber - from.Value.DayNumber <= 365;
    }

    private static bool HasBoundedDateTimeWindow(JsonElement filters, string dateField)
    {
        DateTimeOffset? from = null;
        DateTimeOffset? through = null;
        foreach (var filter in filters.EnumerateArray())
        {
            if (!filter.TryGetProperty("field", out var field) || field.GetString() != dateField ||
                !filter.TryGetProperty("operator", out var op) || !filter.TryGetProperty("value", out var value) ||
                value.ValueKind != JsonValueKind.String || !DateTimeOffset.TryParse(value.GetString(), CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal, out var date)) continue;
            if (op.GetString() == "gte") from = date;
            if (op.GetString() is "lte" or "lt") through = date;
        }
        return from is not null && through is not null && through >= from && through.Value - from.Value <= TimeSpan.FromDays(365);
    }
}
