namespace AIERP.AIService.AI;

/// <summary>
/// Report sources that the read-only ERP assistant may discover and query.
/// This single list is shared by runtime validation and the provider tool schema.
/// </summary>
public static class ErpReportSources
{
    public static IReadOnlyList<string> All { get; } = Array.AsReadOnly(new[]
    {
        "customers", "salesInvoices", "purchaseOrders", "purchaseInvoices", "purchaseReceipts",
        "manufacturingOrders", "manufacturingWorkCenters", "inventoryTransactions", "salesOrders",
        "salesOrderFulfillment", "purchaseOrderFulfillment", "salesQuotes", "purchaseSupplierQuotes", "supplierPayments",
        "salesDeliveries", "salesReturns", "supplierReturns", "purchaseRequests", "stockItems",
        "warehouseStock", "bankStatements", "bankStatementLines", "financialAccountTransactions",
        "financialAccountTransfers", "journalEntryLines", "fxRevaluationLines", "crmOpportunities",
        "customerLedgerEntries", "supplierLedgerEntries", "inventoryTransfers", "workflowInstances"
    });
}
