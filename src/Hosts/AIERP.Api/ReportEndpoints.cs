using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Linq.Expressions;
using System.Reflection;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class ReportEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly IReadOnlyList<ReportColumn> CustomerColumns =
    [
        new("code", "Cari kodu", "text"), new("name", "Cari adı", "text"), new("type", "Tür", "text", ["Customer", "Supplier", "Both"]),
        new("currencyCode", "Para birimi", "text"), new("riskLimit", "Risk limiti", "decimal"),
        new("paymentTermDays", "Vade (gün)", "number"), new("isActive", "Durum", "boolean"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> CustomerAggregates =
    [
        new("count", "Kayıt sayısı"), new("sumRiskLimit", "Risk limiti toplamı"), new("averageRiskLimit", "Ortalama risk limiti"),
        new("sumPaymentTermDays", "Vade günü toplamı"), new("averagePaymentTermDays", "Ortalama vade günü")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesInvoiceColumns =
    [
        new("code", "Fatura kodu", "text"), new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("invoiceDate", "Fatura tarihi", "date"), new("currencyCode", "Para birimi", "text"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("subtotal", "Ara toplam", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("paidAmount", "Tahsil edilen", "decimal"), new("returnedAmount", "İade toplamı", "decimal"),
        new("outstandingAmount", "Açık alacak", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> SalesInvoiceAggregates =
    [
        new("count", "Fatura sayısı"), new("sumGrandTotal", "Genel toplamların toplamı"), new("averageGrandTotal", "Ortalama fatura tutarı"),
        new("sumTaxTotal", "Vergi toplamı"), new("averageTaxTotal", "Ortalama vergi")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseOrderColumns =
    [
        new("code", "Sipariş kodu", "text"), new("supplierCode", "Tedarikçi kodu", "text"), new("supplierName", "Tedarikçi adı", "text"),
        new("orderDate", "Sipariş tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("status", "Durum", "text", ["Open", "PartiallyReceived", "Received", "Cancelled", "PendingApproval", "Rejected"]),
        new("subtotal", "Ara toplam", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> PurchaseOrderAggregates =
    [
        new("count", "Satın alma siparişi sayısı"), new("sumGrandTotal", "Sipariş genel toplamları"), new("averageGrandTotal", "Ortalama sipariş tutarı"),
        new("sumTaxTotal", "Sipariş vergi toplamı"), new("averageTaxTotal", "Ortalama sipariş vergisi")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseInvoiceColumns =
    [
        new("code", "Alış faturası", "text"), new("orderCode", "Satın alma siparişi", "text"),
        new("receiptCode", "Mal kabul", "text"), new("supplierCode", "Tedarikçi kodu", "text"),
        new("supplierName", "Tedarikçi adı", "text"), new("invoiceDate", "Fatura tarihi", "date"),
        new("dueDate", "Vade tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("status", "Durum", "text", ["Posted", "Voided"]), new("subtotal", "Ara toplam", "decimal"),
        new("discountTotal", "İskonto toplamı", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"),
        new("grandTotal", "Genel toplam", "decimal"), new("paidAmount", "Ödenen", "decimal"),
        new("returnedAmount", "İade toplamı", "decimal"), new("outstandingAmount", "Açık bakiye", "decimal"),
        new("lineCount", "Satır sayısı", "number"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> ManufacturingOrderColumns =
    [
        new("code", "Üretim emri", "text"), new("bomCode", "Ürün reçetesi kodu", "text"), new("bomName", "Ürün reçetesi adı", "text"),
        new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("plannedDate", "Plan tarihi", "date"), new("status", "Durum", "text", ["Planned", "Released", "Completed", "Cancelled"]),
        new("plannedQuantity", "Planlanan miktar", "decimal"), new("operationCount", "Operasyon sayısı", "number"),
        new("plannedOperationCost", "Planlanan operasyon maliyeti", "decimal"), new("actualOperationCost", "Fiili operasyon maliyeti", "decimal"),
        new("completedAt", "Tamamlanma", "date"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> ManufacturingOrderAggregates = [new("count", "Üretim emri sayısı")];
    private static readonly IReadOnlyList<ReportColumn> ManufacturingWorkCenterColumns =
    [
        new("code", "İş merkezi kodu", "text"), new("name", "İş merkezi adı", "text"),
        new("capacityMinutesPerDay", "Günlük kapasite (dakika)", "number"),
        new("laborCostPerHourBase", "Saatlik işçilik maliyeti (ana para birimi)", "decimal"),
        new("overheadCostPerHourBase", "Saatlik genel gider (ana para birimi)", "decimal"),
        new("isActive", "Durum", "boolean"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> InventoryTransactionColumns =
    [
        new("transactionId", "Hareket kimliği", "text"), new("entryDate", "Hareket tarihi", "date"),
        new("direction", "Yön", "text", ["Receipt", "Issue"]), new("stockCode", "Stok kodu", "text"),
        new("stockName", "Stok adı", "text"), new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("quantity", "Stok biriminde miktar", "decimal"), new("enteredQuantity", "Girilen miktar", "decimal"),
        new("enteredUnitCode", "Girilen birim", "text"), new("unitCostBase", "Birim maliyet (ana para birimi)", "decimal"),
        new("totalCostBase", "Toplam maliyet (ana para birimi)", "decimal"), new("traceCount", "İz kayıt sayısı", "number"),
        new("reversalOfId", "Ters kayıt kimliği", "text"), new("description", "Açıklama", "text"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> InventoryTransferColumns =
    [
        new("code", "Transfer kodu", "text"), new("transferDate", "Transfer tarihi", "date"),
        new("status", "Durum", "text", ["Posted", "Voided"]),
        new("fromWarehouseCode", "Kaynak depo kodu", "text"), new("fromWarehouseName", "Kaynak depo", "text"),
        new("toWarehouseCode", "Hedef depo kodu", "text"), new("toWarehouseName", "Hedef depo", "text"),
        new("lineCount", "Aktarılan stok kalemi", "number"), new("totalQuantity", "Aktarılan miktar", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseReceiptColumns =
    [
        new("code", "Mal kabul kodu", "text"), new("orderCode", "Satın alma siparişi", "text"),
        new("supplierCode", "Tedarikçi kodu", "text"), new("supplierName", "Tedarikçi adı", "text"),
        new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("receiptDate", "Mal kabul tarihi", "date"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("lineCount", "Satır sayısı", "number"), new("totalQuantity", "Kabul miktarı toplamı", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesOrderColumns =
    [
        new("code", "Sipariş kodu", "text"), new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("orderDate", "Sipariş tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("status", "Durum", "text", ["Open", "Fulfilled", "Cancelled"]),
        new("subtotal", "Ara toplam", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesOrderFulfillmentColumns =
    [
        new("orderCode", "Sipariş kodu", "text"), new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("orderDate", "Sipariş tarihi", "date"), new("requestedDeliveryDate", "İstenen teslim tarihi", "date"),
        new("status", "Sipariş durumu", "text", ["Open", "Fulfilled", "Cancelled"]), new("lineNumber", "Satır", "number"),
        new("stockCode", "Stok kodu", "text"), new("stockName", "Stok adı", "text"), new("unitCode", "Birim", "text"),
        new("orderedQuantity", "Sipariş miktarı", "decimal"), new("reservedQuantity", "Açık rezerve miktar", "decimal"),
        new("fulfilledQuantity", "Sevk edilen miktar", "decimal"), new("remainingQuantity", "Kalan talep", "decimal"),
        new("backorderQuantity", "Rezerve edilmemiş kalan miktar", "decimal")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseOrderFulfillmentColumns =
    [
        new("orderCode", "Satın alma siparişi", "text"), new("supplierCode", "Tedarikçi kodu", "text"),
        new("supplierName", "Tedarikçi adı", "text"), new("orderDate", "Sipariş tarihi", "date"),
        new("expectedReceiptDate", "Beklenen mal kabul tarihi", "date"),
        new("status", "Sipariş durumu", "text", ["Open", "PartiallyReceived"]), new("lineNumber", "Satır", "number"),
        new("stockCode", "Stok kodu", "text"), new("stockName", "Stok adı", "text"), new("unitCode", "Birim", "text"),
        new("orderedQuantity", "Sipariş miktarı", "decimal"), new("receivedQuantity", "Kabul edilen miktar", "decimal"),
        new("outstandingQuantity", "Bekleyen miktar", "decimal")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> SalesOrderAggregates =
    [
        new("count", "Satış siparişi sayısı"), new("sumGrandTotal", "Sipariş genel toplamları"), new("averageGrandTotal", "Ortalama sipariş tutarı"),
        new("sumTaxTotal", "Sipariş vergi toplamı"), new("averageTaxTotal", "Ortalama sipariş vergisi")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesQuoteColumns =
    [
        new("code", "Teklif kodu", "text"), new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("quoteDate", "Teklif tarihi", "date"), new("validUntil", "Geçerlilik tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("status", "Durum", "text", ["Draft", "Sent", "Accepted", "Rejected", "Expired"]),
        new("subtotal", "Ara toplam", "decimal"), new("discountTotal", "İskonto toplamı", "decimal"),
        new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("orderCode", "Oluşturulan sipariş", "text"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseSupplierQuoteColumns =
    [
        new("code", "Tedarikçi teklif kodu", "text"), new("requestCode", "Satın alma talebi", "text"),
        new("supplierCode", "Tedarikçi kodu", "text"), new("supplierName", "Tedarikçi adı", "text"),
        new("quoteDate", "Teklif tarihi", "date"), new("validUntil", "Geçerlilik tarihi", "date"),
        new("currencyCode", "Para birimi", "text"), new("status", "Durum", "text", ["Submitted", "Selected", "NotSelected"]),
        new("subtotal", "Ara toplam", "decimal"), new("discountTotal", "İskonto toplamı", "decimal"),
        new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesDeliveryColumns =
    [
        new("code", "Sevk irsaliyesi", "text"), new("orderCode", "Satış siparişi", "text"),
        new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("deliveryDate", "Sevk tarihi", "date"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("lineCount", "Satır sayısı", "number"), new("totalQuantity", "Sevk miktarı toplamı", "decimal"),
        new("invoiceCode", "Satış faturası", "text"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> SalesReturnColumns =
    [
        new("code", "Satış iadesi", "text"), new("invoiceCode", "Satış faturası", "text"),
        new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("returnDate", "İade tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("status", "Durum", "text", ["Posted", "Voided"]), new("subtotal", "Ara toplam", "decimal"),
        new("discountTotal", "İskonto toplamı", "decimal"), new("taxTotal", "Vergi toplamı", "decimal"),
        new("grandTotal", "Genel toplam", "decimal"), new("lineCount", "Satır sayısı", "number"),
        new("totalQuantity", "İade miktarı toplamı", "decimal"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> SupplierReturnColumns =
    [
        new("code", "Tedarikçi iadesi", "text"), new("invoiceCode", "Alış faturası", "text"),
        new("supplierCode", "Tedarikçi kodu", "text"), new("supplierName", "Tedarikçi adı", "text"),
        new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("returnDate", "İade tarihi", "date"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("subtotal", "Ara toplam", "decimal"), new("discountTotal", "İskonto toplamı", "decimal"),
        new("taxTotal", "Vergi toplamı", "decimal"), new("grandTotal", "Genel toplam", "decimal"),
        new("lineCount", "Satır sayısı", "number"), new("totalQuantity", "İade miktarı toplamı", "decimal"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> PurchaseRequestColumns =
    [
        new("code", "Talep kodu", "text"), new("requesterUserId", "Talep sahibi kullanıcı kodu", "text"),
        new("requestDate", "Talep tarihi", "date"),
        new("neededByDate", "İhtiyaç tarihi", "date"), new("description", "Açıklama", "text"),
        new("status", "Durum", "text", ["Submitted", "Approved", "Rejected", "Ordered"]),
        new("createdAt", "Oluşturulma", "date"), new("reviewedAt", "İnceleme tarihi", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> PurchaseRequestAggregates =
    [ new("count", "Talep sayısı") ];
    private static readonly IReadOnlyList<ReportColumn> StockItemColumns =
    [
        new("code", "Stok kodu", "text"), new("name", "Stok adı", "text"), new("barcode", "Barkod", "text"),
        new("unitCode", "Birim", "text"), new("category", "Kategori", "text"), new("minimumStock", "Minimum stok", "decimal"),
        new("onHand", "Eldeki miktar", "decimal"), new("reserved", "Rezerve miktar", "decimal"), new("available", "Kullanılabilir miktar", "decimal"),
        new("minimumStockGap", "Minimum stok açığı", "decimal"), new("belowMinimum", "Minimumun altında", "boolean"),
        new("trackingMode", "Takip türü", "text", ["None", "Lot", "Serial"]), new("isActive", "Durum", "boolean"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> StockItemAggregates =
    [
        new("count", "Stok kartı sayısı"), new("sumMinimumStock", "Minimum stok toplamı"), new("averageMinimumStock", "Ortalama minimum stok"),
        new("sumOnHand", "Eldeki miktar toplamı"), new("averageOnHand", "Ortalama eldeki miktar"),
        new("sumReserved", "Rezerve miktar toplamı"), new("averageReserved", "Ortalama rezerve miktar"),
        new("sumAvailable", "Kullanılabilir miktar toplamı"), new("averageAvailable", "Ortalama kullanılabilir miktar"),
        new("sumMinimumStockGap", "Minimum stok açığı toplamı"), new("averageMinimumStockGap", "Ortalama minimum stok açığı")
    ];
    private static readonly IReadOnlyList<ReportColumn> WarehouseStockColumns =
    [
        new("stockCode", "Stok kodu", "text"), new("stockName", "Stok adı", "text"), new("unitCode", "Birim", "text"),
        new("warehouseCode", "Depo kodu", "text"), new("warehouseName", "Depo adı", "text"),
        new("onHand", "Eldeki miktar", "decimal"), new("reserved", "Rezerve miktar", "decimal"), new("available", "Kullanılabilir miktar", "decimal")
    ];
    private static readonly IReadOnlyList<ReportColumn> WorkflowInstanceColumns =
    [
        new("workflowCode", "İş akışı kodu", "text"), new("workflowName", "İş akışı adı", "text"),
        new("workflowVersion", "İş akışı sürümü", "number"), new("subjectType", "Kayıt türü", "text", ["PurchaseRequest", "SalesQuote", "PurchaseOrder"]),
        new("subjectCode", "İş kaydı kodu", "text"), new("status", "Akış durumu", "text", ["Pending", "Approved", "Rejected"]),
        new("currentStepIndex", "Geçerli adım", "number"), new("startedByUserId", "Başlatan kullanıcı kodu", "text"),
        new("startedAt", "Başlangıç", "date"), new("completedAt", "Tamamlanma", "date")
    ];
    private static readonly IReadOnlyList<ReportAggregateOption> WorkflowInstanceAggregates = [new("count", "İş akışı sayısı")];
    private static readonly IReadOnlyList<ReportColumn> BankStatementColumns =
    [
        new("code", "Ekstre kodu", "text"), new("accountCode", "Hesap kodu", "text"), new("accountName", "Hesap adı", "text"),
        new("currencyCode", "Para birimi", "text"), new("startDate", "Dönem başlangıcı", "date"), new("endDate", "Dönem bitişi", "date"),
        new("openingBalance", "Açılış bakiyesi", "decimal"), new("closingBalance", "Kapanış bakiyesi", "decimal"),
        new("status", "Durum", "text", ["Imported", "Reconciled"]), new("lineCount", "Satır sayısı", "number"),
        new("matchedLineCount", "Eşleşen satır sayısı", "number"), new("unmatchedLineCount", "Eşleşmemiş satır sayısı", "number"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> BankStatementLineColumns =
    [
        new("statementCode", "Ekstre kodu", "text"), new("lineNumber", "Ekstre satırı", "number"),
        new("externalId", "Harici satır kimliği", "text"), new("transactionDate", "Hareket tarihi", "date"),
        new("direction", "Yön", "text", ["Inflow", "Outflow"]), new("currencyCode", "Para birimi", "text"),
        new("amount", "Tutar", "decimal"), new("description", "Açıklama", "text"), new("reference", "Referans", "text"),
        new("isMatched", "Eşleşti", "boolean"), new("transactionId", "Kasa-banka hareket kimliği", "text"),
        new("bookEntryCreated", "Muhasebe kaydı oluşturuldu", "boolean"), new("matchedAt", "Eşleşme zamanı", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> FinancialAccountTransactionColumns =
    [
        new("accountCode", "Hesap kodu", "text"), new("accountName", "Hesap adı", "text"),
        new("accountType", "Hesap türü", "text", ["Cash", "Bank"]), new("transactionDate", "Hareket tarihi", "date"),
        new("direction", "Yön", "text", ["Inflow", "Outflow"]), new("currencyCode", "Para birimi", "text"),
        new("amount", "Tutar", "decimal"), new("description", "Açıklama", "text"), new("reference", "Referans", "text"),
        new("sourceType", "Kaynak türü", "text", ["CustomerCollection", "SupplierPayment", "AccountTransfer", "BankStatement", "Manual"]),
        new("sourceCode", "Kaynak kodu", "text"), new("reversalOfId", "Ters kayıt kimliği", "text"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> FinancialAccountTransferColumns =
    [
        new("code", "Transfer kodu", "text"), new("fromAccountCode", "Kaynak hesap kodu", "text"),
        new("fromAccountName", "Kaynak hesap", "text"), new("toAccountCode", "Hedef hesap kodu", "text"),
        new("toAccountName", "Hedef hesap", "text"), new("transferDate", "Transfer tarihi", "date"),
        new("currencyCode", "Kaynak para birimi", "text"), new("amount", "Kaynak tutar", "decimal"),
        new("toCurrencyCode", "Hedef para birimi", "text"), new("destinationAmount", "Hedef tutar", "decimal"),
        new("exchangeRate", "Döviz kuru", "decimal"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("reference", "Referans", "text"), new("description", "Açıklama", "text"), new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> JournalEntryLineColumns =
    [
        new("entryCode", "Fiş kodu", "text"), new("entryDate", "Fiş tarihi", "date"),
        new("entryDescription", "Fiş açıklaması", "text"), new("sourceType", "Kaynak türü", "text"),
        new("accountCode", "Hesap kodu", "text"), new("accountName", "Hesap adı", "text"),
        new("lineNumber", "Satır", "number"), new("lineDescription", "Satır açıklaması", "text"),
        new("debit", "Borç", "decimal"), new("credit", "Alacak", "decimal"),
        new("entryDebitTotal", "Fiş borç toplamı", "decimal"), new("entryCreditTotal", "Fiş alacak toplamı", "decimal"),
        new("isBalanced", "Fiş dengeli", "boolean")
    ];
    private static readonly IReadOnlyList<ReportColumn> FxRevaluationLineColumns =
    [
        new("voucherCode", "Değerleme fişi", "text"), new("asOfDate", "Değerleme tarihi", "date"),
        new("baseCurrencyCode", "Ana para birimi", "text"), new("direction", "Cari yönü", "text", ["Receivable", "Payable"]),
        new("invoiceCode", "Fatura kodu", "text"), new("counterpartyName", "Cari adı", "text"),
        new("currencyCode", "Fatura para birimi", "text"), new("outstandingAmount", "Açık tutar", "decimal"),
        new("invoiceDateRate", "Fatura kuru", "decimal"), new("closingRate", "Kapanış kuru", "decimal"),
        new("previousAdjustmentBase", "Önceki değerleme (ana para)", "decimal"),
        new("targetAdjustmentBase", "Hedef değerleme (ana para)", "decimal"), new("adjustmentBase", "Dönem farkı (ana para)", "decimal"),
        new("debitAccount", "Borç hesabı", "text"), new("creditAccount", "Alacak hesabı", "text"),
        new("debitBaseAmount", "Borç (ana para)", "decimal"), new("creditBaseAmount", "Alacak (ana para)", "decimal")
    ];
    private static readonly IReadOnlyList<ReportColumn> SupplierPaymentColumns =
    [
        new("code", "Ödeme kodu", "text"), new("invoiceCode", "Alış faturası", "text"),
        new("supplierCode", "Tedarikçi kodu", "text"), new("supplierName", "Tedarikçi adı", "text"),
        new("paymentDate", "Ödeme tarihi", "date"), new("currencyCode", "Para birimi", "text"),
        new("amount", "Ödeme tutarı", "decimal"), new("paymentMethod", "Ödeme yöntemi", "text"),
        new("reference", "Referans", "text"), new("status", "Durum", "text", ["Posted", "Voided"]),
        new("accountCode", "Kasa/banka hesap kodu", "text"), new("accountName", "Kasa/banka hesabı", "text"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> CrmOpportunityColumns =
    [
        new("code", "Fırsat kodu", "text"), new("name", "Fırsat adı", "text"),
        new("customerCode", "Müşteri kodu", "text"), new("customerName", "Müşteri adı", "text"),
        new("stage", "Aşama", "text", ["Prospecting", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]),
        new("estimatedValue", "Tahmini değer", "decimal"), new("currencyCode", "Para birimi", "text"),
        new("probabilityPercent", "Olasılık (%)", "number"), new("expectedCloseDate", "Beklenen kapanış", "date"),
        new("nextActivityAt", "Sonraki aktivite", "date"), new("createdAt", "Oluşturulma", "date"),
        new("updatedAt", "Güncellenme", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> CustomerLedgerColumns =
    [
        new("entryDate", "Hareket tarihi", "date"), new("customerCode", "Cari kodu", "text"),
        new("customerName", "Cari adı", "text"), new("counterpartyType", "Cari türü", "text", ["Customer", "Supplier", "Both"]),
        new("direction", "Yön", "text", ["Debit", "Credit"]),
        new("amount", "Tutar", "decimal"), new("currencyCode", "Para birimi", "text"),
        new("description", "Açıklama", "text"), new("sourceType", "Belge türü", "text", ["SalesInvoice", "CustomerCollection", "SalesReturn", "PurchaseInvoice", "SupplierPayment", "SupplierReturn", "Manual"]),
        new("sourceCode", "Belge kodu", "text"), new("collectionPaymentMethod", "Tahsilat yöntemi", "text"),
        new("collectionAccountCode", "Tahsilat kasa/banka hesabı", "text"), new("collectionReference", "Tahsilat referansı", "text"),
        new("reversalOfId", "Ters kayıt bağlantısı", "text"),
        new("createdAt", "Oluşturulma", "date")
    ];
    private static readonly IReadOnlyList<ReportColumn> SupplierLedgerColumns =
    [
        new("entryDate", "Hareket tarihi", "date"), new("supplierCode", "Tedarikçi kodu", "text"),
        new("supplierName", "Tedarikçi adı", "text"), new("direction", "Yön", "text", ["Debit", "Credit"]),
        new("amount", "Tutar", "decimal"), new("currencyCode", "Para birimi", "text"),
        new("description", "Açıklama", "text"), new("sourceType", "Belge türü", "text", ["SalesInvoice", "CustomerCollection", "SalesReturn", "PurchaseInvoice", "SupplierPayment", "SupplierReturn", "Manual"]),
        new("sourceCode", "Belge kodu", "text"), new("createdAt", "Oluşturulma", "date")
    ];

    public static void MapReportEndpoints(this WebApplication app)
    {
        var reports = app.MapGroup("/api/reports").WithTags("Tenant Report Builder").RequireAuthorization();

        reports.MapGet("/manufacturing-cost-variance", async (DateOnly? from, DateOnly? to, int? page, int? pageSize,
            ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
            await GetManufacturingCostVarianceAsync(from, to, page ?? 1, pageSize ?? 100, user, db, platformDb, ct));

        reports.MapGet("/catalog", (ClaimsPrincipal user) =>
        {
            if (!TryTenantContext(user, out _, out _, out var role)) return Results.Forbid();
            var sources = new List<ReportSource>
            {
                new("customers", "Cari hesaplar", CustomerColumns, CustomerAggregates),
                new("salesInvoices", "Satış faturaları", SalesInvoiceColumns, SalesInvoiceAggregates),
                new("purchaseOrders", "Satın alma siparişleri", PurchaseOrderColumns, PurchaseOrderAggregates),
                new("purchaseInvoices", "Alış faturaları", PurchaseInvoiceColumns, []),
                new("purchaseReceipts", "Satın alma mal kabulleri", PurchaseReceiptColumns, []),
                new("manufacturingOrders", "Üretim emirleri", ManufacturingOrderColumns, ManufacturingOrderAggregates),
                new("manufacturingWorkCenters", "Üretim iş merkezleri", ManufacturingWorkCenterColumns, []),
                new("inventoryTransactions", "Stok hareketleri", InventoryTransactionColumns, []),
                new("salesOrders", "Satış siparişleri", SalesOrderColumns, SalesOrderAggregates),
                new("salesOrderFulfillment", "Satış siparişi karşılama durumu", SalesOrderFulfillmentColumns, []),
                new("purchaseOrderFulfillment", "Satın alma siparişi karşılama durumu", PurchaseOrderFulfillmentColumns, []),
                new("salesQuotes", "Satış teklifleri", SalesQuoteColumns, []),
                new("purchaseSupplierQuotes", "Tedarikçi teklifleri", PurchaseSupplierQuoteColumns, []),
                new("supplierPayments", "Tedarikçi ödemeleri", SupplierPaymentColumns, []),
                new("salesDeliveries", "Satış sevkiyatları", SalesDeliveryColumns, []),
                new("salesReturns", "Satış iadeleri", SalesReturnColumns, []),
                new("supplierReturns", "Tedarikçi iadeleri", SupplierReturnColumns, []),
                new("purchaseRequests", "Satın alma talepleri", PurchaseRequestColumns, PurchaseRequestAggregates),
                new("stockItems", "Stok kartları", StockItemColumns, StockItemAggregates)
            };
            sources.Add(new("warehouseStock", "Depo bazında stok bakiyesi", WarehouseStockColumns, []));
            sources.Add(new("bankStatements", "Banka ekstreleri", BankStatementColumns, []));
            sources.Add(new("bankStatementLines", "Banka ekstresi satırları", BankStatementLineColumns, []));
            sources.Add(new("financialAccountTransactions", "Kasa-banka hareketleri", FinancialAccountTransactionColumns, []));
            sources.Add(new("financialAccountTransfers", "Kasa-banka hesap transferleri", FinancialAccountTransferColumns, []));
            sources.Add(new("journalEntryLines", "Muhasebe fiş satırları", JournalEntryLineColumns, []));
            sources.Add(new("fxRevaluationLines", "Döviz değerleme satırları", FxRevaluationLineColumns, []));
            sources.Add(new("crmOpportunities", "CRM fırsatları", CrmOpportunityColumns, []));
            sources.Add(new("customerLedgerEntries", "Cari hareketleri", CustomerLedgerColumns, []));
            sources.Add(new("supplierLedgerEntries", "Tedarikçi hesap hareketleri", SupplierLedgerColumns, []));
            sources.Add(new("inventoryTransfers", "Depolar arası transferler", InventoryTransferColumns, []));
            if (role == "TenantAdmin") sources.Add(new("workflowInstances", "İş akışı geçmişi", WorkflowInstanceColumns, WorkflowInstanceAggregates));
            return Results.Ok(sources);
        });

        reports.MapGet("/", async (string? kind, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out _)) return Results.Forbid();
            if (!TrySavedKind(kind, "Report", out var normalizedKind))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Tür Report veya List olmalıdır."] });
            var saved = await db.TenantSavedReports.AsNoTracking().Where(x => x.TenantId == tenantId && x.Kind == normalizedKind)
                .OrderBy(x => x.Name).Take(200).ToListAsync(ct);
            return Results.Ok(saved.Select(ToView));
        });

        reports.MapGet("/{reportId:guid}/history", async (Guid reportId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
            var report = await db.TenantSavedReports.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            var revisions = await db.TenantSavedReportRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SavedReportId == reportId)
                .OrderByDescending(x => x.Revision).Take(100).ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(report.Kind, "history-viewed"), Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.Ok(revisions.Select(x => new SavedReportRevisionView(x.Id, x.Revision, x.Name, x.Kind, x.Source,
                JsonSerializer.Deserialize<ReportRunRequest>(x.DefinitionJson, JsonOptions)!, x.CreatedByUserId, x.CreatedAt)));
        });

        reports.MapPost("/{reportId:guid}/history/{revision:int}/restore", async (Guid reportId, int revision, RestoreSavedReportRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var report = await db.TenantSavedReports.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            if (request.ExpectedRevision != report.DefinitionRevision) return Results.Conflict(new { error = "Tanım başka bir kullanıcı tarafından güncellendi. Yenileyip tekrar deneyin." });
            var old = await db.TenantSavedReportRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SavedReportId == reportId && x.Revision == revision, ct);
            if (old is null) return Results.NotFound();
            var now = DateTimeOffset.UtcNow;
            report.Kind = old.Kind; report.Source = old.Source; report.DefinitionJson = old.DefinitionJson;
            report.DefinitionRevision++; report.UpdatedByUserId = userId; report.UpdatedAt = now;
            db.TenantSavedReportRevisions.Add(RevisionOf(report, userId, now));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(report.Kind, "restored"), Resource = $"{report.Name};revision={revision};newRevision={report.DefinitionRevision}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Tanım başka bir kullanıcı tarafından güncellendi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(report));
        });

        reports.MapPost("/{reportId:guid}/duplicate", async (Guid reportId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var source = await db.TenantSavedReports.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (source is null) return Results.NotFound();

            const string copySuffix = " (copy)";
            var baseName = $"{source.Name[..Math.Min(source.Name.Length, 120 - copySuffix.Length)]}{copySuffix}";
            var name = baseName;
            for (var suffix = 2; await db.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Name == name, ct); suffix++)
            {
                var suffixText = $" (copy {suffix})";
                name = $"{source.Name[..Math.Min(source.Name.Length, 120 - suffixText.Length)]}{suffixText}";
            }

            var now = DateTimeOffset.UtcNow;
            var duplicate = new TenantSavedReport
            {
                TenantId = tenantId, Name = name, Kind = source.Kind, Source = source.Source, DefinitionJson = source.DefinitionJson,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantSavedReports.Add(duplicate);
            db.TenantSavedReportRevisions.Add(RevisionOf(duplicate, userId, now));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(source.Kind, "duplicated"), Resource = duplicate.Name });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/reports/{duplicate.Id}", ToView(duplicate));
        });

        reports.MapPost("/run", async (ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct) =>
        {
            return await RunAsync(request, user, db, context, ct);
        });

        reports.MapPost("/export", async (ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct) =>
            await ExportAsync(request, user, db, context, ct));

        reports.MapPost("/", async (ReportSaveRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Rapor adı 1-120 karakter olmalıdır."] });
            if (!Validate(request.Definition, out var definition, out var errors)) return Results.ValidationProblem(errors!);
            if (!TrySavedKind(request.Kind, "Report", out var kind))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Tür Report veya List olmalıdır."] });
            if (kind == "List" && definition!.GroupByFields.Count > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition.groupByFields"] = ["Dinamik listeler gruplama içeremez."] });
            var name = request.Name.Trim();
            if (await db.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Name == name, ct))
                return Results.Conflict(new { error = "Bu adla kayıtlı bir rapor zaten var." });
            var now = DateTimeOffset.UtcNow;
            var report = new TenantSavedReport
            {
                TenantId = tenantId, Name = name, Kind = kind, Source = definition!.Source, DefinitionJson = JsonSerializer.Serialize(definition, JsonOptions),
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantSavedReports.Add(report);
            db.TenantSavedReportRevisions.Add(RevisionOf(report, userId, now));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(kind, "created"), Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/reports/{report.Id}", ToView(report));
        });

        reports.MapPut("/{reportId:guid}", async (Guid reportId, ReportSaveRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var report = await db.TenantSavedReports.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            if (request.ExpectedRevision is null || request.ExpectedRevision != report.DefinitionRevision)
                return Results.Conflict(new { error = "Tanım sürümü uyuşmuyor. Yenileyip tekrar deneyin." });
            if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Rapor adı 1-120 karakter olmalıdır."] });
            if (!Validate(request.Definition, out var definition, out var errors)) return Results.ValidationProblem(errors!);
            if (!TrySavedKind(request.Kind, report.Kind, out var kind))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Tür Report veya List olmalıdır."] });
            if (kind == "List" && definition!.GroupByFields.Count > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition.groupByFields"] = ["Dinamik listeler gruplama içeremez."] });
            var name = request.Name.Trim();
            if (await db.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Id != reportId && x.Name == name, ct))
                return Results.Conflict(new { error = "Bu adla kayıtlı bir rapor zaten var." });
            report.Name = name; report.Kind = kind; report.Source = definition!.Source; report.DefinitionJson = JsonSerializer.Serialize(definition, JsonOptions);
            report.DefinitionRevision++; report.UpdatedByUserId = userId; report.UpdatedAt = DateTimeOffset.UtcNow;
            db.TenantSavedReportRevisions.Add(RevisionOf(report, userId, report.UpdatedAt));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(kind, "updated"), Resource = report.Name });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Tanım başka bir kullanıcı tarafından güncellendi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(report));
        });

        reports.MapDelete("/{reportId:guid}", async (Guid reportId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var report = await db.TenantSavedReports.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            db.TenantSavedReports.Remove(report);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = SavedAuditAction(report.Kind, "deleted"), Resource = report.Name });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        reports.MapPost("/{reportId:guid}/run", async (Guid reportId, ReportPageRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out _, out _)) return Results.Forbid();
            var report = await db.TenantSavedReports.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == reportId, ct);
            if (report is null) return Results.NotFound();
            var definition = JsonSerializer.Deserialize<ReportRunRequest>(report.DefinitionJson, JsonOptions);
            if (definition is null) return Results.Problem("Kayıtlı rapor tanımı okunamadı.", statusCode: 500);
            return await RunAsync(definition with { Page = Math.Clamp(request.Page, 1, 100000), PageSize = Math.Clamp(request.PageSize, 1, 200) }, user, db, context, ct);
        });
    }

    private static async Task<IResult> GetManufacturingCostVarianceAsync(DateOnly? from, DateOnly? to, int page, int pageSize,
        ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role is not ("TenantAdmin" or "TenantUser"))
            return Results.Forbid();
        if (from is null || to is null || from > to || to.Value.DayNumber - from.Value.DayNumber > 365 || page < 1 || pageSize is < 1 or > 200)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["period"] = ["Başlangıç ve bitiş tarihi zorunludur; dönem en fazla 366 gün, sayfa 1 veya üzeri ve sayfa boyutu 1–200 olmalıdır."] });

        var ordersQuery = db.ManufacturingOrders.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.PlannedDate >= from && x.PlannedDate <= to);
        var totalCount = await ordersQuery.CountAsync(ct);
        if (totalCount > 1000)
            return Results.Problem("Dönem en fazla 1.000 üretim emri içerebilir. Tarih aralığını daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);

        var baseCurrencyCode = await platformDb.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
            .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync(ct);
        if (baseCurrencyCode is null) return Results.Forbid();
        var allOrders = await ordersQuery.OrderBy(x => x.PlannedDate).ThenBy(x => x.Code)
            .Include(x => x.Operations).Include(x => x.Lines).AsSplitQuery().ToListAsync(ct);
        var orderIds = allOrders.Select(x => x.Id).ToArray();
        var materialCosts = new Dictionary<Guid, (int MovementCount, int UnknownCostCount, decimal? NetCostBase)>();
        var productStockItemByOrder = new Dictionary<Guid, Guid>();
        if (orderIds.Length > 0)
        {
            productStockItemByOrder = await db.ManufacturingOrders.AsNoTracking()
                .Where(x => x.TenantId == tenantId && orderIds.Contains(x.Id))
                .Join(db.BillOfMaterials.AsNoTracking(), order => new { order.TenantId, Id = order.BillOfMaterialId },
                    bom => new { bom.TenantId, Id = bom.Id }, (order, bom) => new { order.Id, bom.ProductStockItemId })
                .ToDictionaryAsync(x => x.Id, x => x.ProductStockItemId, ct);
            var movementCostRows = await db.InventoryTransactions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ManufacturingOrderId.HasValue && orderIds.Contains(x.ManufacturingOrderId.Value))
                .GroupBy(x => new { ManufacturingOrderId = x.ManufacturingOrderId!.Value, x.StockItemId })
                .Select(group => new
                {
                    group.Key.ManufacturingOrderId,
                    group.Key.StockItemId,
                    MovementCount = group.Count(),
                    UnknownCostCount = group.Count(x => x.UnitCostBase == null),
                    NetCostBase = group.Sum(x => (decimal?)(x.Direction == InventoryDirection.Issue ? 1m : -1m) * x.Quantity * (x.UnitCostBase ?? 0m))
                }).ToListAsync(ct);
            foreach (var row in movementCostRows)
            {
                // The finished-goods receipt carries the full output valuation. It is not a
                // component cost and must not be subtracted from material consumption.
                if (productStockItemByOrder.GetValueOrDefault(row.ManufacturingOrderId) == row.StockItemId) continue;
                var current = materialCosts.GetValueOrDefault(row.ManufacturingOrderId);
                materialCosts[row.ManufacturingOrderId] = (
                    current.MovementCount + row.MovementCount,
                    current.UnknownCostCount + row.UnknownCostCount,
                    current.NetCostBase is null ? row.NetCostBase : row.NetCostBase is null ? current.NetCostBase : current.NetCostBase + row.NetCostBase);
            }
        }

        var details = allOrders.Select(order =>
        {
            var plannedLabor = decimal.Round(order.Operations.Sum(operation => (operation.SetupMinutes + operation.RunMinutes) / 60m * operation.LaborCostPerHourBase), 4, MidpointRounding.AwayFromZero);
            var plannedOverhead = decimal.Round(order.Operations.Sum(operation => (operation.SetupMinutes + operation.RunMinutes) / 60m * operation.OverheadCostPerHourBase), 4, MidpointRounding.AwayFromZero);
            var actualComplete = order.Status == ManufacturingOrderStatus.Completed &&
                order.Operations.All(operation => operation.ActualSetupMinutes is not null && operation.ActualRunMinutes is not null && operation.ActualCostBase is not null);
            decimal? actualLabor = actualComplete ? decimal.Round(order.Operations.Sum(operation =>
                ((operation.ActualSetupMinutes ?? 0m) + (operation.ActualRunMinutes ?? 0m)) / 60m * operation.LaborCostPerHourBase), 4, MidpointRounding.AwayFromZero) : null;
            decimal? actualOverhead = actualComplete ? decimal.Round(order.Operations.Sum(operation =>
                ((operation.ActualSetupMinutes ?? 0m) + (operation.ActualRunMinutes ?? 0m)) / 60m * operation.OverheadCostPerHourBase), 4, MidpointRounding.AwayFromZero) : null;
            var actualEnergy = actualComplete ? decimal.Round(order.Operations.Sum(operation => operation.ActualEnergyCostBase ?? 0m), 4, MidpointRounding.AwayFromZero) : (decimal?)null;
            var plannedEnergy = decimal.Round(order.Operations.Sum(operation => operation.PlannedEnergyCostBase), 4, MidpointRounding.AwayFromZero);
            // Use the nullable tenant-scoped source FK only. Historical rows and free-text
            // descriptions are intentionally not backfilled or treated as accounting identity.
            decimal? actualMaterial = materialCosts.TryGetValue(order.Id, out var material) && material.MovementCount > 0 && material.UnknownCostCount == 0
                ? decimal.Round(material.NetCostBase ?? 0m, 4, MidpointRounding.AwayFromZero)
                : null;
            var plannedMaterial = decimal.Round(order.Lines.Sum(line => line.PlannedCostBase), 4, MidpointRounding.AwayFromZero);
            var plannedConversion = plannedLabor + plannedOverhead + plannedEnergy;
            decimal? actualConversion = actualComplete ? actualLabor + actualOverhead + actualEnergy : null;
            return new ManufacturingCostVarianceOrder(order.Code, order.PlannedDate, order.Status.ToString(), order.PlannedQuantity,
                order.Operations.Count, baseCurrencyCode, plannedLabor, actualLabor, plannedOverhead, actualOverhead,
                plannedEnergy, actualEnergy, plannedMaterial, actualMaterial, plannedConversion, actualConversion,
                actualConversion is not null ? actualConversion - plannedConversion : null,
                // Keep the total unknown: source-linked material can be reported as a component,
                // but legacy/unlinked movements prevent proving that it is complete for an order.
                null, null);
        }).ToArray();
        var pageRows = details.Skip((page - 1) * pageSize).Take(pageSize).ToArray();
        var pageTotals = new ManufacturingCostVarianceTotals(pageRows.Length,
            pageRows.Sum(x => x.PlannedLaborBase), pageRows.All(x => x.ActualLaborBase is not null) ? pageRows.Sum(x => x.ActualLaborBase!.Value) : null,
            pageRows.Sum(x => x.PlannedOverheadBase), pageRows.All(x => x.ActualOverheadBase is not null) ? pageRows.Sum(x => x.ActualOverheadBase!.Value) : null,
            pageRows.Sum(x => x.PlannedEnergyBase ?? 0m), pageRows.Sum(x => x.PlannedMaterialBase ?? 0m),
            pageRows.All(x => x.ActualEnergyBase is not null) ? pageRows.Sum(x => x.ActualEnergyBase!.Value) : null,
            pageRows.All(x => x.ActualConversionBase is not null) ? pageRows.Sum(x => x.ActualConversionBase!.Value) : null,
            pageRows.All(x => x.ActualMaterialBase is not null) ? pageRows.Sum(x => x.ActualMaterialBase!.Value) : null);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed",
            Resource = $"manufacturingCostVariance:{from:yyyy-MM-dd}:{to:yyyy-MM-dd}:page:{page}" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ManufacturingCostVarianceReport(from.Value, to.Value, "plannedDate", baseCurrencyCode,
            page, pageSize, totalCount, pageRows, pageTotals,
            "Planlanan enerji ve fire dahil malzeme maliyetleri emir anındaki anlık görüntülerden raporlanır. Fiili malzeme yalnızca doğrudan üretim emrine bağlı bileşen hareketlerinden hesaplanır; mamul giriş hareketi bileşen maliyetinden çıkarılır. Eski bağlantısız stok hareketlerinin hangi emre ait olduğu kanıtlanamadığından toplam fiili maliyet ve toplam maliyet farkı ayrıca doğrulanana kadar gösterilmez."));
    }

    private static async Task<IResult> RunAsync(ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
        if (!Validate(request, out var normalized, out var errors)) return Results.ValidationProblem(errors!);
        if (normalized!.Source == "workflowInstances" && role != "TenantAdmin") return Results.Forbid();
        if (normalized!.Source == "salesInvoices") return await RunSalesInvoicesAsync(normalized, user, db, ct);
        if (normalized!.Source == "bankStatements") return await RunBankStatementsAsync(normalized, user, db, ct);
        if (normalized!.Source == "bankStatementLines") return await RunBankStatementLinesAsync(normalized, user, db, ct);
        if (normalized!.Source == "financialAccountTransactions") return await RunFinancialAccountTransactionsAsync(normalized, user, db, ct);
        if (normalized!.Source == "financialAccountTransfers") return await RunFinancialAccountTransfersAsync(normalized, user, db, ct);
        if (normalized!.Source == "journalEntryLines") return await RunJournalEntryLinesAsync(normalized, user, db, ct);
        if (normalized!.Source == "fxRevaluationLines") return await RunFxRevaluationLinesAsync(normalized, user, db, ct);
        if (normalized!.Source == "supplierPayments") return await RunSupplierPaymentsAsync(normalized, user, db, context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized!.Source == "salesQuotes") return await RunSalesQuotesAsync(normalized, user, db, ct);
        if (normalized!.Source == "purchaseSupplierQuotes") return await RunPurchaseSupplierQuotesAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseRequests") return await RunPurchaseRequestsAsync(normalized, user, db, context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized.Source == "purchaseOrders") return await RunPurchaseOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseReceipts") return await RunPurchaseReceiptsAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseInvoices") return await RunPurchaseInvoicesAsync(normalized, user, db, ct);
        if (normalized.Source == "manufacturingOrders") return await RunManufacturingOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "manufacturingWorkCenters") return await RunManufacturingWorkCentersAsync(normalized, user, db, ct);
        if (normalized.Source == "inventoryTransactions") return await RunInventoryTransactionsAsync(normalized, user, db, ct);
        if (normalized.Source == "inventoryTransfers") return await RunInventoryTransfersAsync(normalized, user, db, ct);
        if (normalized.Source == "salesOrders") return await RunSalesOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "salesOrderFulfillment") return await RunSalesOrderFulfillmentAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseOrderFulfillment") return await RunPurchaseOrderFulfillmentAsync(normalized, user, db, ct);
        if (normalized.Source == "salesDeliveries") return await RunSalesDeliveriesAsync(normalized, user, db, ct);
        if (normalized.Source == "salesReturns") return await RunSalesReturnsAsync(normalized, user, db, ct);
        if (normalized.Source == "supplierReturns") return await RunSupplierReturnsAsync(normalized, user, db, ct);
        if (normalized.Source == "stockItems") return await RunStockItemsAsync(normalized, user, db, ct);
        if (normalized.Source == "warehouseStock") return await RunWarehouseStockAsync(normalized, user, db, ct);
        if (normalized.Source == "workflowInstances") return await RunWorkflowInstancesAsync(normalized, user, db, ct);
        if (normalized.Source == "crmOpportunities") return await RunCrmOpportunitiesAsync(normalized, user, db, ct);
        if (normalized.Source == "customerLedgerEntries") return await RunCustomerLedgerEntriesAsync(normalized, user, db,
            context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized.Source == "supplierLedgerEntries") return await RunSupplierLedgerEntriesAsync(normalized, user, db,
            context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        IQueryable<CustomerAccount> query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in normalized!.Filters)
            if (!TryApplyCustomerFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (normalized.GroupByFields.Count > 0)
        {
            var grouped = await AggregateAsync(query, normalized.GroupByFields, normalized.Aggregate!, normalized.Descending,
                (normalized.Page - 1) * normalized.PageSize, normalized.PageSize, ct);
            var groupBy = string.Join(',', normalized.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"customers:group:{groupBy}:{normalized.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult("customers", [], [], normalized.Page, normalized.PageSize, totalCount,
                normalized.GroupByFields.Count == 1 ? normalized.GroupByFields[0] : groupBy, normalized.Aggregate, grouped.Rows, grouped.TotalGroups, normalized.GroupByFields));
        }
        query = ApplySort(query, normalized.SortBy, normalized.Descending);
        var page = await query.Skip((normalized.Page - 1) * normalized.PageSize).Take(normalized.PageSize).ToListAsync(ct);
        var rows = page.Select(customer => (IReadOnlyDictionary<string, object?>)normalized.Columns.ToDictionary(
            code => code, code => ReadCustomerValue(customer, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "customers" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult("customers", normalized.Columns.Select(ColumnByCode).ToArray(), rows,
            normalized.Page, normalized.PageSize, totalCount));
    }

    private static async Task<IResult> ExportAsync(ReportRunRequest request, ClaimsPrincipal user, TenantDbContext db, HttpContext context, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
        if (!Validate(request, out var normalized, out var errors)) return Results.ValidationProblem(errors!);
        if (normalized!.Source == "workflowInstances" && role != "TenantAdmin") return Results.Forbid();
        if (normalized!.Source == "salesInvoices") return await ExportSalesInvoicesAsync(normalized, user, db, ct);
        if (normalized!.Source == "bankStatements") return await ExportBankStatementsAsync(normalized, user, db, ct);
        if (normalized!.Source == "bankStatementLines") return await ExportBankStatementLinesAsync(normalized, user, db, ct);
        if (normalized!.Source == "financialAccountTransactions") return await ExportFinancialAccountTransactionsAsync(normalized, user, db, ct);
        if (normalized!.Source == "financialAccountTransfers") return await ExportFinancialAccountTransfersAsync(normalized, user, db, ct);
        if (normalized!.Source == "journalEntryLines") return await ExportJournalEntryLinesAsync(normalized, user, db, ct);
        if (normalized!.Source == "fxRevaluationLines") return await ExportFxRevaluationLinesAsync(normalized, user, db, ct);
        if (normalized!.Source == "supplierPayments") return await ExportSupplierPaymentsAsync(normalized, user, db, context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized!.Source == "salesQuotes") return await ExportSalesQuotesAsync(normalized, user, db, ct);
        if (normalized!.Source == "purchaseSupplierQuotes") return await ExportPurchaseSupplierQuotesAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseRequests") return await ExportPurchaseRequestsAsync(normalized, user, db, context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized.Source == "purchaseOrders") return await ExportPurchaseOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseReceipts") return await ExportPurchaseReceiptsAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseInvoices") return await ExportPurchaseInvoicesAsync(normalized, user, db, ct);
        if (normalized.Source == "manufacturingOrders") return await ExportManufacturingOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "manufacturingWorkCenters") return await ExportManufacturingWorkCentersAsync(normalized, user, db, ct);
        if (normalized.Source == "inventoryTransactions") return await ExportInventoryTransactionsAsync(normalized, user, db, ct);
        if (normalized.Source == "inventoryTransfers") return await ExportInventoryTransfersAsync(normalized, user, db, ct);
        if (normalized.Source == "salesOrders") return await ExportSalesOrdersAsync(normalized, user, db, ct);
        if (normalized.Source == "salesOrderFulfillment") return await ExportSalesOrderFulfillmentAsync(normalized, user, db, ct);
        if (normalized.Source == "purchaseOrderFulfillment") return await ExportPurchaseOrderFulfillmentAsync(normalized, user, db, ct);
        if (normalized.Source == "salesDeliveries") return await ExportSalesDeliveriesAsync(normalized, user, db, ct);
        if (normalized.Source == "salesReturns") return await ExportSalesReturnsAsync(normalized, user, db, ct);
        if (normalized.Source == "supplierReturns") return await ExportSupplierReturnsAsync(normalized, user, db, ct);
        if (normalized.Source == "stockItems") return await ExportStockItemsAsync(normalized, user, db, ct);
        if (normalized.Source == "warehouseStock") return await ExportWarehouseStockAsync(normalized, user, db, ct);
        if (normalized.Source == "workflowInstances") return await ExportWorkflowInstancesAsync(normalized, user, db, ct);
        if (normalized.Source == "crmOpportunities") return await ExportCrmOpportunitiesAsync(normalized, user, db, ct);
        if (normalized.Source == "customerLedgerEntries") return await ExportCustomerLedgerEntriesAsync(normalized, user, db,
            context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        if (normalized.Source == "supplierLedgerEntries") return await ExportSupplierLedgerEntriesAsync(normalized, user, db,
            context.RequestServices.GetRequiredService<PlatformDbContext>(), ct);
        IQueryable<CustomerAccount> query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in normalized!.Filters)
            if (!TryApplyCustomerFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        if (normalized.GroupByFields.Count > 0)
        {
            var grouped = await AggregateAsync(query, normalized.GroupByFields, normalized.Aggregate!, normalized.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var groupedCsv = new StringBuilder();
            var headers = normalized.GroupByFields.Select(code => ColumnByCode(code).Label).Append("Kayıt sayısı").ToList();
            if (normalized.Aggregate != "count") headers.Add(AggregateLabel(normalized.Aggregate!));
            groupedCsv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(header => Csv(header))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (normalized.Aggregate != "count") values.Add(CsvValue(row.Value));
                groupedCsv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"customers:group:{string.Join(',', normalized.GroupByFields)}:{grouped.Rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.File(Encoding.UTF8.GetBytes(groupedCsv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
        }
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySort(query, normalized.SortBy, normalized.Descending).Take(10_000).ToListAsync(ct);
        var builder = new StringBuilder();
        builder.Append('\uFEFF').AppendLine(string.Join(',', normalized.Columns.Select(code => Csv(ColumnByCode(code).Label))));
        foreach (var row in rows)
            builder.AppendLine(string.Join(',', normalized.Columns.Select(code => CsvValue(ReadCustomerValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"customers:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(builder.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunCrmOpportunitiesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<CrmOpportunity> query = db.CrmOpportunities.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplyCrmOpportunityFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyCrmOpportunitySort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(item => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadCrmOpportunityValue(item, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "crmOpportunities" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(CrmOpportunityColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportCrmOpportunitiesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<CrmOpportunity> query = db.CrmOpportunities.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplyCrmOpportunityFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyCrmOpportunitySort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(CrmOpportunityColumnByCode(code).Label))));
        foreach (var item in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadCrmOpportunityValue(item, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"crmOpportunities:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static IQueryable<CustomerLedgerEntry> CustomerLedgerEntryQuery(TenantDbContext db, Guid tenantId) =>
        db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId
            && (x.Customer.Type == CounterpartyType.Customer || x.Customer.Type == CounterpartyType.Both))
            .Include(x => x.Customer).Include(x => x.SalesInvoice).Include(x => x.CustomerCollection).ThenInclude(x => x!.FinancialAccount)
            .Include(x => x.SalesReturn).Include(x => x.PurchaseInvoice).Include(x => x.SupplierPayment)
            .Include(x => x.SupplierReturn).Include(x => x.ReversalOf);

    private static IQueryable<CustomerLedgerEntry> SupplierLedgerEntryQuery(TenantDbContext db, Guid tenantId) =>
        db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId
            && (x.Customer.Type == CounterpartyType.Supplier || x.Customer.Type == CounterpartyType.Both))
            .Include(x => x.Customer).Include(x => x.SalesInvoice).Include(x => x.CustomerCollection).ThenInclude(x => x!.FinancialAccount)
            .Include(x => x.SalesReturn).Include(x => x.PurchaseInvoice).Include(x => x.SupplierPayment)
            .Include(x => x.SupplierReturn).Include(x => x.ReversalOf);

    private static async Task<IResult> RunCustomerLedgerEntriesAsync(NormalizedReport report, ClaimsPrincipal user,
        TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
        IQueryable<CustomerLedgerEntry> query = CustomerLedgerEntryQuery(db, tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
            "erp.customers.read", "erp.customers", query, x => x.Direction, x => x.CustomerId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyCustomerLedgerEntryFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyCustomerLedgerEntrySort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadCustomerLedgerEntryValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "customerLedgerEntries" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(CustomerLedgerColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportCustomerLedgerEntriesAsync(NormalizedReport report, ClaimsPrincipal user,
        TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
        IQueryable<CustomerLedgerEntry> query = CustomerLedgerEntryQuery(db, tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
            "erp.customers.read", "erp.customers", query, x => x.Direction, x => x.CustomerId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyCustomerLedgerEntryFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyCustomerLedgerEntrySort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(CustomerLedgerColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadCustomerLedgerEntryValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"customerLedgerEntries:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunSupplierLedgerEntriesAsync(NormalizedReport report, ClaimsPrincipal user,
        TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
        IQueryable<CustomerLedgerEntry> query = SupplierLedgerEntryQuery(db, tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
            "erp.supplier-payments.read", "erp.supplier-payments", query, x => x.Direction, x => x.CustomerId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyCustomerLedgerEntryFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyCustomerLedgerEntrySort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadCustomerLedgerEntryValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "supplierLedgerEntries" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SupplierLedgerColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSupplierLedgerEntriesAsync(NormalizedReport report, ClaimsPrincipal user,
        TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
        IQueryable<CustomerLedgerEntry> query = SupplierLedgerEntryQuery(db, tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, role,
            "erp.supplier-payments.read", "erp.supplier-payments", query, x => x.Direction, x => x.CustomerId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyCustomerLedgerEntryFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyCustomerLedgerEntrySort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SupplierLedgerColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadCustomerLedgerEntryValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"supplierLedgerEntries:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyCustomerLedgerEntryFilter(ref IQueryable<CustomerLedgerEntry> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Operator == "isNull")
        {
            if (filter.Field == "reversalOfId") { query = query.Where(x => x.ReversalOfId == null); return true; }
            if (filter.Field == "collectionPaymentMethod") { query = query.Where(x => x.CustomerCollection == null || x.CustomerCollection.TenantId != x.TenantId); return true; }
            if (filter.Field == "collectionAccountCode") { query = query.Where(x => x.CustomerCollection == null || x.CustomerCollection.TenantId != x.TenantId || x.CustomerCollection.FinancialAccount == null); return true; }
            if (filter.Field == "collectionReference") { query = query.Where(x => x.CustomerCollection == null || x.CustomerCollection.TenantId != x.TenantId || x.CustomerCollection.Reference == null); return true; }
            if (filter.Field == "sourceCode")
            {
                query = query.Where(x => x.SalesInvoiceId == null && x.CustomerCollectionId == null && x.SalesReturnId == null
                    && x.PurchaseInvoiceId == null && x.SupplierPaymentId == null && x.SupplierReturnId == null);
                return true;
            }
            error = "Bu müşteri hareketi alanı boş değer filtresini desteklemiyor."; return false;
        }
        switch (filter.Field)
        {
            case "customerCode": case "supplierCode": query = filter.Operator == "contains" ? query.Where(x => x.Customer.Code.Contains(value)) : query.Where(x => x.Customer.Code == value); return true;
            case "customerName": case "supplierName": query = filter.Operator == "contains" ? query.Where(x => x.Customer.Name.Contains(value)) : query.Where(x => x.Customer.Name == value); return true;
            case "counterpartyType":
                if (!Enum.TryParse<CounterpartyType>(value, true, out var counterpartyType)) { error = "Cari türü geçersiz."; return false; }
                query = query.Where(x => x.Customer.Type == counterpartyType); return true;
            case "direction":
                if (!Enum.TryParse<CustomerLedgerDirection>(value, true, out var direction)) { error = "Cari hareket yönü geçersiz."; return false; }
                query = query.Where(x => x.Direction == direction); return true;
            case "amount":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var amountOperator)) { error = "Tutar filtresi veya operatörü geçersiz."; return false; }
                query = amountOperator switch { "gt" => query.Where(x => x.Amount > amount), "gte" => query.Where(x => x.Amount >= amount), "lt" => query.Where(x => x.Amount < amount), "lte" => query.Where(x => x.Amount <= amount), _ => query.Where(x => x.Amount == amount) }; return true;
            case "entryDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var entryDate)) { error = "Hareket tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.EntryDate > entryDate), "gte" => query.Where(x => x.EntryDate >= entryDate), "lt" => query.Where(x => x.EntryDate < entryDate), _ => query.Where(x => x.EntryDate <= entryDate) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "currencyCode": query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "description": query = filter.Operator == "contains" ? query.Where(x => x.Description.Contains(value)) : query.Where(x => x.Description == value); return true;
            case "sourceType":
                query = value.ToLowerInvariant() switch
                {
                    "salesinvoice" => query.Where(x => x.SalesInvoiceId != null), "customercollection" => query.Where(x => x.CustomerCollectionId != null),
                    "salesreturn" => query.Where(x => x.SalesReturnId != null), "purchaseinvoice" => query.Where(x => x.PurchaseInvoiceId != null),
                    "supplierpayment" => query.Where(x => x.SupplierPaymentId != null), "supplierreturn" => query.Where(x => x.SupplierReturnId != null),
                    "manual" => query.Where(x => x.SalesInvoiceId == null && x.CustomerCollectionId == null && x.SalesReturnId == null && x.PurchaseInvoiceId == null && x.SupplierPaymentId == null && x.SupplierReturnId == null),
                    _ => query
                };
                if (value.ToLowerInvariant() is not ("salesinvoice" or "customercollection" or "salesreturn" or "purchaseinvoice" or "supplierpayment" or "supplierreturn" or "manual")) { error = "Belge türü geçersiz."; return false; }
                return true;
            case "sourceCode":
                query = filter.Operator == "contains"
                    ? query.Where(x => (x.SalesInvoice != null && x.SalesInvoice.Code.Contains(value)) || (x.CustomerCollection != null && x.CustomerCollection.Code.Contains(value)) || (x.SalesReturn != null && x.SalesReturn.Code.Contains(value)) || (x.PurchaseInvoice != null && x.PurchaseInvoice.Code.Contains(value)) || (x.SupplierPayment != null && x.SupplierPayment.Code.Contains(value)) || (x.SupplierReturn != null && x.SupplierReturn.Code.Contains(value)))
                    : query.Where(x => (x.SalesInvoice != null && x.SalesInvoice.Code == value) || (x.CustomerCollection != null && x.CustomerCollection.Code == value) || (x.SalesReturn != null && x.SalesReturn.Code == value) || (x.PurchaseInvoice != null && x.PurchaseInvoice.Code == value) || (x.SupplierPayment != null && x.SupplierPayment.Code == value) || (x.SupplierReturn != null && x.SupplierReturn.Code == value));
                return true;
            case "collectionPaymentMethod":
                query = filter.Operator == "contains"
                    ? query.Where(x => x.CustomerCollection != null && x.CustomerCollection.TenantId == x.TenantId && x.CustomerCollection.PaymentMethod.Contains(value))
                    : query.Where(x => x.CustomerCollection != null && x.CustomerCollection.TenantId == x.TenantId && x.CustomerCollection.PaymentMethod == value);
                return true;
            case "collectionAccountCode":
                query = filter.Operator == "contains"
                    ? query.Where(x => x.CustomerCollection != null && x.CustomerCollection.TenantId == x.TenantId && x.CustomerCollection.FinancialAccount != null && x.CustomerCollection.FinancialAccount.TenantId == x.TenantId && x.CustomerCollection.FinancialAccount.Code.Contains(value))
                    : query.Where(x => x.CustomerCollection != null && x.CustomerCollection.TenantId == x.TenantId && x.CustomerCollection.FinancialAccount != null && x.CustomerCollection.FinancialAccount.TenantId == x.TenantId && x.CustomerCollection.FinancialAccount.Code == value);
                return true;
            case "collectionReference":
                query = filter.Operator == "contains"
                    ? query.Where(x => x.CustomerCollection != null && x.CustomerCollection.TenantId == x.TenantId && x.CustomerCollection.Reference != null && x.CustomerCollection.Reference.Contains(value))
                    : query.Where(x => x.CustomerCollection != null && x.CustomerCollection.TenantId == x.TenantId && x.CustomerCollection.Reference == value);
                return true;
            case "reversalOfId":
                if (!Guid.TryParse(value, out var reversalId)) { error = "Ters kayıt bağlantısı GUID olmalıdır."; return false; }
                query = query.Where(x => x.ReversalOfId == reversalId); return true;
            default: error = "Müşteri hareketi filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<CustomerLedgerEntry> ApplyCustomerLedgerEntrySort(IQueryable<CustomerLedgerEntry> query, string field, bool descending)
    {
        IOrderedQueryable<CustomerLedgerEntry> ordered = (field, descending) switch
        {
            ("entryDate", false) => query.OrderBy(x => x.EntryDate), ("entryDate", true) => query.OrderByDescending(x => x.EntryDate),
            ("customerCode", false) => query.OrderBy(x => x.Customer.Code), ("customerCode", true) => query.OrderByDescending(x => x.Customer.Code),
            ("customerName", false) => query.OrderBy(x => x.Customer.Name), ("customerName", true) => query.OrderByDescending(x => x.Customer.Name),
            ("supplierCode", false) => query.OrderBy(x => x.Customer.Code), ("supplierCode", true) => query.OrderByDescending(x => x.Customer.Code),
            ("supplierName", false) => query.OrderBy(x => x.Customer.Name), ("supplierName", true) => query.OrderByDescending(x => x.Customer.Name),
            ("direction", false) => query.OrderBy(x => x.Direction), ("direction", true) => query.OrderByDescending(x => x.Direction),
            ("amount", false) => query.OrderBy(x => x.Amount), ("amount", true) => query.OrderByDescending(x => x.Amount),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("description", false) => query.OrderBy(x => x.Description), ("description", true) => query.OrderByDescending(x => x.Description),
            ("sourceType", false) => query.OrderBy(x => x.SalesInvoiceId != null ? 0 : x.CustomerCollectionId != null ? 1 : x.SalesReturnId != null ? 2 : x.PurchaseInvoiceId != null ? 3 : x.SupplierPaymentId != null ? 4 : x.SupplierReturnId != null ? 5 : 6),
            ("sourceType", true) => query.OrderByDescending(x => x.SalesInvoiceId != null ? 0 : x.CustomerCollectionId != null ? 1 : x.SalesReturnId != null ? 2 : x.PurchaseInvoiceId != null ? 3 : x.SupplierPaymentId != null ? 4 : x.SupplierReturnId != null ? 5 : 6),
            ("sourceCode", false) => query.OrderBy(x => x.SalesInvoice != null ? x.SalesInvoice.Code : x.CustomerCollection != null ? x.CustomerCollection.Code : x.SalesReturn != null ? x.SalesReturn.Code : x.PurchaseInvoice != null ? x.PurchaseInvoice.Code : x.SupplierPayment != null ? x.SupplierPayment.Code : x.SupplierReturn != null ? x.SupplierReturn.Code : null),
            ("sourceCode", true) => query.OrderByDescending(x => x.SalesInvoice != null ? x.SalesInvoice.Code : x.CustomerCollection != null ? x.CustomerCollection.Code : x.SalesReturn != null ? x.SalesReturn.Code : x.PurchaseInvoice != null ? x.PurchaseInvoice.Code : x.SupplierPayment != null ? x.SupplierPayment.Code : x.SupplierReturn != null ? x.SupplierReturn.Code : null),
            ("collectionPaymentMethod", false) => query.OrderBy(x => x.CustomerCollection == null ? null : x.CustomerCollection.PaymentMethod),
            ("collectionPaymentMethod", true) => query.OrderByDescending(x => x.CustomerCollection == null ? null : x.CustomerCollection.PaymentMethod),
            ("collectionAccountCode", false) => query.OrderBy(x => x.CustomerCollection == null || x.CustomerCollection.FinancialAccount == null ? null : x.CustomerCollection.FinancialAccount.Code),
            ("collectionAccountCode", true) => query.OrderByDescending(x => x.CustomerCollection == null || x.CustomerCollection.FinancialAccount == null ? null : x.CustomerCollection.FinancialAccount.Code),
            ("collectionReference", false) => query.OrderBy(x => x.CustomerCollection == null ? null : x.CustomerCollection.Reference),
            ("collectionReference", true) => query.OrderByDescending(x => x.CustomerCollection == null ? null : x.CustomerCollection.Reference),
            ("reversalOfId", false) => query.OrderBy(x => x.ReversalOfId), ("reversalOfId", true) => query.OrderByDescending(x => x.ReversalOfId),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt),
            _ => query.OrderBy(x => x.Id)
        };
        return ordered.ThenBy(x => x.Id);
    }

    private static object? ReadCustomerLedgerEntryValue(CustomerLedgerEntry row, string code) => code switch
    {
        "entryDate" => row.EntryDate, "customerCode" => row.Customer.Code, "customerName" => row.Customer.Name,
        "supplierCode" => row.Customer.Code, "supplierName" => row.Customer.Name,
        "counterpartyType" => row.Customer.Type.ToString(),
        "direction" => row.Direction.ToString(), "amount" => row.Amount, "currencyCode" => row.CurrencyCode,
        "description" => row.Description,
        "sourceType" => row.SalesInvoiceId is not null ? "SalesInvoice" : row.CustomerCollectionId is not null ? "CustomerCollection" : row.SalesReturnId is not null ? "SalesReturn" : row.PurchaseInvoiceId is not null ? "PurchaseInvoice" : row.SupplierPaymentId is not null ? "SupplierPayment" : row.SupplierReturnId is not null ? "SupplierReturn" : "Manual",
        "sourceCode" => row.SalesInvoice?.Code ?? row.CustomerCollection?.Code ?? row.SalesReturn?.Code ?? row.PurchaseInvoice?.Code ?? row.SupplierPayment?.Code ?? row.SupplierReturn?.Code,
        "collectionPaymentMethod" => row.CustomerCollection?.TenantId == row.TenantId ? row.CustomerCollection.PaymentMethod : null,
        "collectionAccountCode" => row.CustomerCollection?.TenantId == row.TenantId && row.CustomerCollection.FinancialAccount?.TenantId == row.TenantId ? row.CustomerCollection.FinancialAccount.Code : null,
        "collectionReference" => row.CustomerCollection?.TenantId == row.TenantId ? row.CustomerCollection.Reference : null,
        "reversalOfId" => row.ReversalOfId, "createdAt" => row.CreatedAt, _ => null
    };

    private static ReportColumn CustomerLedgerColumnByCode(string code) => CustomerLedgerColumns.First(x => x.Code == code);
    private static ReportColumn SupplierLedgerColumnByCode(string code) => SupplierLedgerColumns.First(x => x.Code == code);

    private static bool TryApplyCrmOpportunityFilter(ref IQueryable<CrmOpportunity> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Operator == "isNull")
        {
            query = filter.Field switch
            {
                "customerCode" or "customerName" => query.Where(x => x.CustomerId == null),
                "estimatedValue" => query.Where(x => x.EstimatedValue == null),
                "expectedCloseDate" => query.Where(x => x.ExpectedCloseDate == null),
                "nextActivityAt" => query.Where(x => x.NextActivityAt == null),
                _ => query
            };
            if (filter.Field is "customerCode" or "customerName" or "estimatedValue" or "expectedCloseDate" or "nextActivityAt") return true;
            error = "Bu CRM fırsatı alanı boş değer filtresini desteklemiyor."; return false;
        }
        switch (filter.Field)
        {
            case "code": query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "name": query = filter.Operator == "contains" ? query.Where(x => x.Name.Contains(value)) : query.Where(x => x.Name == value); return true;
            case "customerCode": query = filter.Operator == "contains" ? query.Where(x => x.Customer != null && x.Customer.Code.Contains(value)) : query.Where(x => x.Customer != null && x.Customer.Code == value); return true;
            case "customerName": query = filter.Operator == "contains" ? query.Where(x => x.Customer != null && x.Customer.Name.Contains(value)) : query.Where(x => x.Customer != null && x.Customer.Name == value); return true;
            case "stage":
                if (!Enum.TryParse<CrmOpportunityStage>(value, true, out var stage)) { error = "CRM fırsat aşaması geçersiz."; return false; }
                query = query.Where(x => x.Stage == stage); return true;
            case "currencyCode": query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "estimatedValue":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var decimalOp)) { error = "Tahmini değer filtresi geçersiz."; return false; }
                query = decimalOp switch { "gt" => query.Where(x => x.EstimatedValue > amount), "gte" => query.Where(x => x.EstimatedValue >= amount), "lt" => query.Where(x => x.EstimatedValue < amount), "lte" => query.Where(x => x.EstimatedValue <= amount), _ => query.Where(x => x.EstimatedValue == amount) }; return true;
            case "probabilityPercent":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var probability) || !ApplyDecimalOperator(filter.Operator, out var numberOp) || probability is < 0 or > 100) { error = "Olasılık filtresi 0-100 arasında tam sayı olmalıdır."; return false; }
                query = numberOp switch { "gt" => query.Where(x => x.ProbabilityPercent > probability), "gte" => query.Where(x => x.ProbabilityPercent >= probability), "lt" => query.Where(x => x.ProbabilityPercent < probability), "lte" => query.Where(x => x.ProbabilityPercent <= probability), _ => query.Where(x => x.ProbabilityPercent == probability) }; return true;
            case "expectedCloseDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var closeDate)) { error = "Beklenen kapanış tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.ExpectedCloseDate > closeDate), "gte" => query.Where(x => x.ExpectedCloseDate >= closeDate), "lt" => query.Where(x => x.ExpectedCloseDate < closeDate), _ => query.Where(x => x.ExpectedCloseDate <= closeDate) }; return true;
            case "nextActivityAt": case "createdAt": case "updatedAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dateTime)) { error = "Tarih filtresi ISO tarih biçiminde olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("nextActivityAt", "gt") => query.Where(x => x.NextActivityAt > dateTime), ("nextActivityAt", "gte") => query.Where(x => x.NextActivityAt >= dateTime), ("nextActivityAt", "lt") => query.Where(x => x.NextActivityAt < dateTime), ("nextActivityAt", _) => query.Where(x => x.NextActivityAt <= dateTime),
                    ("createdAt", "gt") => query.Where(x => x.CreatedAt > dateTime), ("createdAt", "gte") => query.Where(x => x.CreatedAt >= dateTime), ("createdAt", "lt") => query.Where(x => x.CreatedAt < dateTime), ("createdAt", _) => query.Where(x => x.CreatedAt <= dateTime),
                    (_, "gt") => query.Where(x => x.UpdatedAt > dateTime), (_, "gte") => query.Where(x => x.UpdatedAt >= dateTime), (_, "lt") => query.Where(x => x.UpdatedAt < dateTime), _ => query.Where(x => x.UpdatedAt <= dateTime)
                }; return true;
            default: error = "CRM fırsatı filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<CrmOpportunity> ApplyCrmOpportunitySort(IQueryable<CrmOpportunity> query, string field, bool descending)
    {
        IOrderedQueryable<CrmOpportunity> ordered = (field, descending) switch
        {
            ("name", false) => query.OrderBy(x => x.Name), ("name", true) => query.OrderByDescending(x => x.Name),
            ("customerCode", false) => query.OrderBy(x => x.Customer!.Code), ("customerCode", true) => query.OrderByDescending(x => x.Customer!.Code),
            ("customerName", false) => query.OrderBy(x => x.Customer!.Name), ("customerName", true) => query.OrderByDescending(x => x.Customer!.Name),
            ("stage", false) => query.OrderBy(x => x.Stage), ("stage", true) => query.OrderByDescending(x => x.Stage),
            ("estimatedValue", false) => query.OrderBy(x => x.EstimatedValue), ("estimatedValue", true) => query.OrderByDescending(x => x.EstimatedValue),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("probabilityPercent", false) => query.OrderBy(x => x.ProbabilityPercent), ("probabilityPercent", true) => query.OrderByDescending(x => x.ProbabilityPercent),
            ("expectedCloseDate", false) => query.OrderBy(x => x.ExpectedCloseDate), ("expectedCloseDate", true) => query.OrderByDescending(x => x.ExpectedCloseDate),
            ("nextActivityAt", false) => query.OrderBy(x => x.NextActivityAt), ("nextActivityAt", true) => query.OrderByDescending(x => x.NextActivityAt),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt),
            ("updatedAt", false) => query.OrderBy(x => x.UpdatedAt), ("updatedAt", true) => query.OrderByDescending(x => x.UpdatedAt),
            ("code", false) => query.OrderBy(x => x.Code), ("code", true) => query.OrderByDescending(x => x.Code),
            _ => query.OrderBy(x => x.Code)
        };
        return ordered.ThenBy(x => x.Id);
    }

    private static object? ReadCrmOpportunityValue(CrmOpportunity x, string code) => code switch
    {
        "code" => x.Code, "name" => x.Name, "customerCode" => x.Customer?.Code, "customerName" => x.Customer?.Name,
        "stage" => x.Stage.ToString(), "estimatedValue" => x.EstimatedValue, "currencyCode" => x.CurrencyCode,
        "probabilityPercent" => x.ProbabilityPercent, "expectedCloseDate" => x.ExpectedCloseDate,
        "nextActivityAt" => x.NextActivityAt, "createdAt" => x.CreatedAt, "updatedAt" => x.UpdatedAt, _ => null
    };

    private static ReportColumn CrmOpportunityColumnByCode(string code) => CrmOpportunityColumns.First(x => x.Code == code);

    private static async Task<IResult> RunWorkflowInstancesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
        IQueryable<TenantWorkflowInstance> query = db.TenantWorkflowInstances.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyWorkflowInstanceFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateWorkflowInstancesAsync(query, report.GroupByFields, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed",
                Resource = $"workflowInstances:group:{string.Join(',', report.GroupByFields)}:count" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : string.Join(',', report.GroupByFields),
                "count", grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyWorkflowInstanceSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(instance => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadWorkflowInstanceValue(instance, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "workflowInstances" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(WorkflowInstanceColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportWorkflowInstancesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
        IQueryable<TenantWorkflowInstance> query = db.TenantWorkflowInstances.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyWorkflowInstanceFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateWorkflowInstancesAsync(query, report.GroupByFields, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => Csv(WorkflowInstanceColumnByCode(code).Label)).Append(Csv("İş akışı sayısı"));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers));
            foreach (var row in grouped.Rows)
                csv.AppendLine(string.Join(',', (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported",
                Resource = $"workflowInstances:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyWorkflowInstanceSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(WorkflowInstanceColumnByCode(code).Label))));
            foreach (var instance in rows)
                csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadWorkflowInstanceValue(instance, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"workflowInstances:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<AggregatePage> AggregateWorkflowInstancesAsync(IQueryable<TenantWorkflowInstance> query,
        IReadOnlyList<string> groupBy, bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1)
        {
            var groups = groupBy[0] switch
            {
                "subjectType" => query.GroupBy(x => x.SubjectType).Select(group => new { Key = group.Key, Count = group.Count() }),
                "status" => query.GroupBy(x => x.Status).Select(group => new { Key = group.Key, Count = group.Count() }),
                _ => query.GroupBy(x => x.DefinitionCode).Select(group => new { Key = group.Key, Count = group.Count() })
            };
            var total = await groups.CountAsync(ct);
            var page = await (descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key))
                .Skip(skip).Take(take).ToListAsync(ct);
            return new AggregatePage(page.Select(row => new ReportAggregateRow(row.Key, row.Count, row.Count)).ToArray(), total);
        }
        var selectors = groupBy.Select(field => (LambdaExpression)(field switch
        {
            "subjectType" => (Expression<Func<TenantWorkflowInstance, string>>)(instance => instance.SubjectType),
            "status" => instance => instance.Status,
            _ => instance => instance.DefinitionCode
        })).ToArray();
        return await AggregateMultipleGroupsAsync(query, selectors, "count", null, descending, skip, take, ct);
    }

    private static bool TryApplyWorkflowInstanceFilter(ref IQueryable<TenantWorkflowInstance> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim();
        if (filter.Operator == "isNull" && filter.Field == "completedAt") { query = query.Where(x => x.CompletedAt == null); return true; }
        if (value is null || value.Length == 0 || value.Length > 200) { error = "Filtre değeri 1-200 karakter olmalıdır."; return false; }
        if (filter.Field is "workflowVersion" or "currentStepIndex")
        {
            if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) || !ApplyDecimalOperator(filter.Operator, out var op))
            { error = "Sayısal filtre veya operatör geçersiz."; return false; }
            query = filter.Field == "workflowVersion"
                ? op switch { "gt" => query.Where(x => x.DefinitionVersion > number), "gte" => query.Where(x => x.DefinitionVersion >= number), "lt" => query.Where(x => x.DefinitionVersion < number), "lte" => query.Where(x => x.DefinitionVersion <= number), _ => query.Where(x => x.DefinitionVersion == number) }
                : op switch { "gt" => query.Where(x => x.CurrentStepIndex > number), "gte" => query.Where(x => x.CurrentStepIndex >= number), "lt" => query.Where(x => x.CurrentStepIndex < number), "lte" => query.Where(x => x.CurrentStepIndex <= number), _ => query.Where(x => x.CurrentStepIndex == number) };
            return true;
        }
        if (filter.Field is "startedAt" or "completedAt")
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) || filter.Operator is not ("gt" or "gte" or "lt" or "lte"))
            { error = "ISO tarih ve gt/gte/lt/lte operatörü kullanın."; return false; }
            query = filter.Field == "startedAt"
                ? filter.Operator switch { "gt" => query.Where(x => x.StartedAt > date), "gte" => query.Where(x => x.StartedAt >= date), "lt" => query.Where(x => x.StartedAt < date), _ => query.Where(x => x.StartedAt <= date) }
                : filter.Operator switch { "gt" => query.Where(x => x.CompletedAt > date), "gte" => query.Where(x => x.CompletedAt >= date), "lt" => query.Where(x => x.CompletedAt < date), _ => query.Where(x => x.CompletedAt <= date) };
            return true;
        }
        switch (filter.Field)
        {
            case "workflowCode": query = filter.Operator == "contains" ? query.Where(x => x.DefinitionCode.Contains(value)) : query.Where(x => x.DefinitionCode == value); return true;
            case "workflowName": query = filter.Operator == "contains" ? query.Where(x => x.DefinitionName.Contains(value)) : query.Where(x => x.DefinitionName == value); return true;
            case "subjectType": query = query.Where(x => x.SubjectType == value); return true;
            case "subjectCode": query = filter.Operator == "contains" ? query.Where(x => x.SubjectTitle.Contains(value)) : query.Where(x => x.SubjectTitle == value); return true;
            case "status": query = query.Where(x => x.Status == value); return true;
            case "startedByUserId" when Guid.TryParse(value, out var userId): query = query.Where(x => x.StartedByUserId == userId); return true;
            default: error = "Filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<TenantWorkflowInstance> ApplyWorkflowInstanceSort(IQueryable<TenantWorkflowInstance> query, string field, bool descending) => (field, descending) switch
    {
        ("workflowCode", false) => query.OrderBy(x => x.DefinitionCode).ThenBy(x => x.Id), ("workflowCode", true) => query.OrderByDescending(x => x.DefinitionCode).ThenBy(x => x.Id),
        ("workflowName", false) => query.OrderBy(x => x.DefinitionName).ThenBy(x => x.Id), ("workflowName", true) => query.OrderByDescending(x => x.DefinitionName).ThenBy(x => x.Id),
        ("workflowVersion", false) => query.OrderBy(x => x.DefinitionVersion).ThenBy(x => x.Id), ("workflowVersion", true) => query.OrderByDescending(x => x.DefinitionVersion).ThenBy(x => x.Id),
        ("subjectType", false) => query.OrderBy(x => x.SubjectType).ThenBy(x => x.Id), ("subjectType", true) => query.OrderByDescending(x => x.SubjectType).ThenBy(x => x.Id),
        ("subjectCode", false) => query.OrderBy(x => x.SubjectTitle).ThenBy(x => x.Id), ("subjectCode", true) => query.OrderByDescending(x => x.SubjectTitle).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("currentStepIndex", false) => query.OrderBy(x => x.CurrentStepIndex).ThenBy(x => x.Id), ("currentStepIndex", true) => query.OrderByDescending(x => x.CurrentStepIndex).ThenBy(x => x.Id),
        ("startedByUserId", false) => query.OrderBy(x => x.StartedByUserId).ThenBy(x => x.Id), ("startedByUserId", true) => query.OrderByDescending(x => x.StartedByUserId).ThenBy(x => x.Id),
        ("completedAt", false) => query.OrderBy(x => x.CompletedAt).ThenBy(x => x.Id), ("completedAt", true) => query.OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id),
        ("startedAt", false) => query.OrderBy(x => x.StartedAt).ThenBy(x => x.Id), ("startedAt", true) => query.OrderByDescending(x => x.StartedAt).ThenBy(x => x.Id),
        _ => query.OrderByDescending(x => x.StartedAt).ThenBy(x => x.Id)
    };

    private static object? ReadWorkflowInstanceValue(TenantWorkflowInstance instance, string code) => code switch
    {
        "workflowCode" => instance.DefinitionCode, "workflowName" => instance.DefinitionName, "workflowVersion" => instance.DefinitionVersion,
        "subjectType" => instance.SubjectType, "subjectCode" => instance.SubjectTitle, "status" => instance.Status,
        "currentStepIndex" => instance.CurrentStepIndex, "startedByUserId" => instance.StartedByUserId,
        "startedAt" => instance.StartedAt, "completedAt" => instance.CompletedAt, _ => null
    };

    private static async Task<IResult> RunStockItemsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<StockItemReportRow> query = StockItemReportRows(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyStockItemFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateStockItemsAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var joinedFields = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"stockItems:group:{joinedFields}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : joinedFields, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyStockItemSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(item => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadStockItemValue(item, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "stockItems" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(StockItemColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportStockItemsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<StockItemReportRow> query = StockItemReportRows(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyStockItemFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateStockItemsAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => StockItemColumnByCode(code).Label).Append("Stok kartı sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(StockItemAggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(header => Csv(header))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"stockItems:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyStockItemSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(StockItemColumnByCode(code).Label))));
            foreach (var item in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadStockItemValue(item, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"stockItems:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunWarehouseStockAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<WarehouseStockReportRow> query = WarehouseStockRows(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyWarehouseStockFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyWarehouseStockSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadWarehouseStockValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "warehouseStock" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(WarehouseStockColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportWarehouseStockAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<WarehouseStockReportRow> query = WarehouseStockRows(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyWarehouseStockFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyWarehouseStockSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(WarehouseStockColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadWarehouseStockValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"warehouseStock:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static IQueryable<WarehouseStockReportRow> WarehouseStockRows(TenantDbContext db, Guid tenantId)
    {
        var keys = db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Select(x => new { x.StockItemId, x.WarehouseId })
            .Union(db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesOrderReservationStatus.Active)
                .Select(x => new { StockItemId = x.OrderLine.StockItemId, x.WarehouseId }));
        return from key in keys.Distinct()
               join item in db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId) on key.StockItemId equals item.Id
               join warehouse in db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId) on key.WarehouseId equals warehouse.Id
               let onHand = db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.WarehouseId == warehouse.Id)
                   .Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)
               let reserved = db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
                   && x.OrderLine.StockItemId == item.Id && x.Status == SalesOrderReservationStatus.Active)
                   .Sum(x => x.Quantity - x.FulfilledQuantity)
               select new WarehouseStockReportRow
               {
                   Id = item.Id, WarehouseId = warehouse.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode,
                   WarehouseCode = warehouse.Code, WarehouseName = warehouse.Name, OnHand = onHand, Reserved = reserved, Available = onHand - reserved
               };
    }

    private static bool TryApplyWarehouseStockFilter(ref IQueryable<WarehouseStockReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "stockCode" or "stockName" or "unitCode" or "warehouseCode" or "warehouseName")
        {
            query = filter.Field switch
            {
                "stockCode" when filter.Operator == "contains" => query.Where(x => x.StockCode.Contains(value)),
                "stockCode" => query.Where(x => x.StockCode == value),
                "stockName" when filter.Operator == "contains" => query.Where(x => x.StockName.Contains(value)),
                "stockName" => query.Where(x => x.StockName == value),
                "unitCode" when filter.Operator == "contains" => query.Where(x => x.UnitCode.Contains(value)),
                "unitCode" => query.Where(x => x.UnitCode == value),
                "warehouseCode" when filter.Operator == "contains" => query.Where(x => x.WarehouseCode.Contains(value)),
                "warehouseCode" => query.Where(x => x.WarehouseCode == value),
                "warehouseName" when filter.Operator == "contains" => query.Where(x => x.WarehouseName.Contains(value)),
                _ => query.Where(x => x.WarehouseName == value)
            };
            return true;
        }
        if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Miktar filtresi geçersiz."; return false; }
        query = filter.Field switch
        {
            "onHand" => query.Where(x => filter.Operator == "gt" ? x.OnHand > amount : filter.Operator == "gte" ? x.OnHand >= amount : filter.Operator == "lt" ? x.OnHand < amount : filter.Operator == "lte" ? x.OnHand <= amount : x.OnHand == amount),
            "reserved" => query.Where(x => filter.Operator == "gt" ? x.Reserved > amount : filter.Operator == "gte" ? x.Reserved >= amount : filter.Operator == "lt" ? x.Reserved < amount : filter.Operator == "lte" ? x.Reserved <= amount : x.Reserved == amount),
            "available" => query.Where(x => filter.Operator == "gt" ? x.Available > amount : filter.Operator == "gte" ? x.Available >= amount : filter.Operator == "lt" ? x.Available < amount : filter.Operator == "lte" ? x.Available <= amount : x.Available == amount),
            _ => query
        };
        return true;
    }

    private static IQueryable<WarehouseStockReportRow> ApplyWarehouseStockSort(IQueryable<WarehouseStockReportRow> query, string field, bool descending) => (field, descending) switch
    {
        ("stockCode", false) => query.OrderBy(x => x.StockCode).ThenBy(x => x.WarehouseCode).ThenBy(x => x.Id),
        ("stockCode", true) => query.OrderByDescending(x => x.StockCode).ThenBy(x => x.WarehouseCode).ThenBy(x => x.Id),
        ("stockName", false) => query.OrderBy(x => x.StockName).ThenBy(x => x.WarehouseCode).ThenBy(x => x.Id),
        ("stockName", true) => query.OrderByDescending(x => x.StockName).ThenBy(x => x.WarehouseCode).ThenBy(x => x.Id),
        ("unitCode", false) => query.OrderBy(x => x.UnitCode).ThenBy(x => x.WarehouseCode).ThenBy(x => x.Id),
        ("unitCode", true) => query.OrderByDescending(x => x.UnitCode).ThenBy(x => x.WarehouseCode).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => x.WarehouseName).ThenBy(x => x.StockCode).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id),
        ("warehouseName", true) => query.OrderByDescending(x => x.WarehouseName).ThenBy(x => x.StockCode).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => x.WarehouseCode).ThenBy(x => x.StockCode).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id),
        ("warehouseCode", true) => query.OrderByDescending(x => x.WarehouseCode).ThenBy(x => x.StockCode).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id),
        ("onHand", false) => query.OrderBy(x => x.OnHand).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id), ("onHand", true) => query.OrderByDescending(x => x.OnHand).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id),
        ("reserved", false) => query.OrderBy(x => x.Reserved).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id), ("reserved", true) => query.OrderByDescending(x => x.Reserved).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id),
        ("available", false) => query.OrderBy(x => x.Available).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Available).ThenBy(x => x.WarehouseId).ThenBy(x => x.Id)
    };

    private static object? ReadWarehouseStockValue(WarehouseStockReportRow row, string code) => code switch
    {
        "stockCode" => row.StockCode, "stockName" => row.StockName, "unitCode" => row.UnitCode,
        "warehouseCode" => row.WarehouseCode, "warehouseName" => row.WarehouseName,
        "onHand" => row.OnHand, "reserved" => row.Reserved, "available" => row.Available, _ => null
    };

    private static ReportColumn WarehouseStockColumnByCode(string code) => WarehouseStockColumns.First(x => x.Code == code);

    private static string CsvValue(object? value) => Csv(value switch
    {
        null => "",
        DateTimeOffset date => date.ToString("O", CultureInfo.InvariantCulture),
        bool boolean => boolean ? "true" : "false",
        IFormattable number => number.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? ""
    }, protectFormula: value is string);

    private static string Csv(string value, bool protectFormula = false)
    {
        var firstNonWhitespace = value.AsSpan().TrimStart();
        if (protectFormula && firstNonWhitespace.Length > 0 && firstNonWhitespace[0] is '=' or '+' or '-' or '@') value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }

    private static async Task<IResult> RunPurchaseOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseOrder> query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Supplier);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseOrderFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseOrdersAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var groupBy = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"purchaseOrders:group:{groupBy}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : groupBy, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyPurchaseOrderSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(order => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseOrderValue(order, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseOrders" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseOrderColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseOrder> query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Supplier);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseOrderFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseOrdersAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => PurchaseOrderColumnByCode(code).Label).Append("Sipariş sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(PurchaseOrderAggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(value => Csv(value))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseOrders:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyPurchaseOrderSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseOrderColumnByCode(code).Label))));
            foreach (var order in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseOrderValue(order, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseOrders:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunPurchaseReceiptsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseReceipt> query = db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseReceiptFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyPurchaseReceiptSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)
            .Include(x => x.PurchaseOrder).ThenInclude(x => x.Supplier).Include(x => x.Warehouse).Include(x => x.Lines).AsSplitQuery().ToListAsync(ct);
        var resultRows = rows.Select(receipt => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseReceiptValue(receipt, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseReceipts" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseReceiptColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseReceiptsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseReceipt> query = db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseReceiptFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyPurchaseReceiptSort(query, report.SortBy, report.Descending).Take(10_000)
            .Include(x => x.PurchaseOrder).ThenInclude(x => x.Supplier).Include(x => x.Warehouse).Include(x => x.Lines).AsSplitQuery().ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseReceiptColumnByCode(code).Label))));
        foreach (var receipt in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseReceiptValue(receipt, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseReceipts:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunPurchaseInvoicesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseInvoice> query = db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseInvoiceFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyPurchaseInvoiceSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)
            .Include(x => x.PurchaseOrder).Include(x => x.PurchaseReceipt).Include(x => x.Supplier).Include(x => x.Lines)
            .Include(x => x.Payments).Include(x => x.Returns)
            .AsSplitQuery().ToListAsync(ct);
        var resultRows = rows.Select(invoice => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseInvoiceValue(invoice, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseInvoices" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseInvoiceColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseInvoicesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseInvoice> query = db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseInvoiceFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyPurchaseInvoiceSort(query, report.SortBy, report.Descending).Take(10_000)
            .Include(x => x.PurchaseOrder).Include(x => x.PurchaseReceipt).Include(x => x.Supplier).Include(x => x.Lines)
            .Include(x => x.Payments).Include(x => x.Returns)
            .AsSplitQuery().ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseInvoiceColumnByCode(code).Label))));
        foreach (var invoice in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseInvoiceValue(invoice, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseInvoices:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<AggregatePage> AggregateManufacturingOrdersByStatusAsync(IQueryable<ManufacturingOrder> query,
        bool descending, int skip, int take, CancellationToken ct)
    {
        var groups = query.GroupBy(x => x.Status).Select(g => new { Key = g.Key, Count = g.Count() });
        var total = await groups.CountAsync(ct);
        var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
            .Skip(skip).Take(take).ToListAsync(ct);
        return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key.ToString(), x.Count, x.Count)).ToArray(), total);
    }

    private static async Task<IResult> RunManufacturingWorkCentersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<ManufacturingWorkCenter> query = db.ManufacturingWorkCenters.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyManufacturingWorkCenterFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var totalCount = await query.CountAsync(ct);
        var centers = await ApplyManufacturingWorkCenterSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var rows = centers.Select(center => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadManufacturingWorkCenterValue(center, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "manufacturingWorkCenters" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(ManufacturingWorkCenterColumnByCode).ToArray(), rows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportManufacturingWorkCentersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<ManufacturingWorkCenter> query = db.ManufacturingWorkCenters.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyManufacturingWorkCenterFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var centers = await ApplyManufacturingWorkCenterSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(ManufacturingWorkCenterColumnByCode(code).Label))));
        foreach (var center in centers)
            csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadManufacturingWorkCenterValue(center, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"manufacturingWorkCenters:{centers.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyManufacturingWorkCenterFilter(ref IQueryable<ManufacturingWorkCenter> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code": case "name":
                if (filter.Field == "code") query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value);
                else query = filter.Operator == "contains" ? query.Where(x => x.Name.Contains(value)) : query.Where(x => x.Name == value);
                return true;
            case "capacityMinutesPerDay":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var minutes)) { error = "Günlük kapasite tam sayı olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CapacityMinutesPerDay > minutes), "gte" => query.Where(x => x.CapacityMinutesPerDay >= minutes), "lt" => query.Where(x => x.CapacityMinutesPerDay < minutes), "lte" => query.Where(x => x.CapacityMinutesPerDay <= minutes), _ => query.Where(x => x.CapacityMinutesPerDay == minutes) };
                return true;
            case "laborCostPerHourBase": case "overheadCostPerHourBase":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Saatlik maliyet sayısal olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("laborCostPerHourBase", "gt") => query.Where(x => x.LaborCostPerHourBase > amount),
                    ("laborCostPerHourBase", "gte") => query.Where(x => x.LaborCostPerHourBase >= amount),
                    ("laborCostPerHourBase", "lt") => query.Where(x => x.LaborCostPerHourBase < amount),
                    ("laborCostPerHourBase", "lte") => query.Where(x => x.LaborCostPerHourBase <= amount),
                    ("laborCostPerHourBase", _) => query.Where(x => x.LaborCostPerHourBase == amount),
                    ("overheadCostPerHourBase", "gt") => query.Where(x => x.OverheadCostPerHourBase > amount),
                    ("overheadCostPerHourBase", "gte") => query.Where(x => x.OverheadCostPerHourBase >= amount),
                    ("overheadCostPerHourBase", "lt") => query.Where(x => x.OverheadCostPerHourBase < amount),
                    ("overheadCostPerHourBase", "lte") => query.Where(x => x.OverheadCostPerHourBase <= amount),
                    _ => query.Where(x => x.OverheadCostPerHourBase == amount)
                };
                return true;
            case "isActive":
                if (!bool.TryParse(value, out var isActive)) { error = "Durum true veya false olmalıdır."; return false; }
                query = query.Where(x => x.IsActive == isActive);
                return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) { error = "Oluşturulma zamanı ISO tarih biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > date), "gte" => query.Where(x => x.CreatedAt >= date), "lt" => query.Where(x => x.CreatedAt < date), "lte" => query.Where(x => x.CreatedAt <= date), _ => query.Where(x => x.CreatedAt == date) };
                return true;
            default:
                error = "İş merkezi filtre alanı geçersiz.";
                return false;
        }
    }

    private static IQueryable<ManufacturingWorkCenter> ApplyManufacturingWorkCenterSort(IQueryable<ManufacturingWorkCenter> query, string field, bool descending) => (field, descending) switch
    {
        ("name", false) => query.OrderBy(x => x.Name).ThenBy(x => x.Id), ("name", true) => query.OrderByDescending(x => x.Name).ThenBy(x => x.Id),
        ("capacityMinutesPerDay", false) => query.OrderBy(x => x.CapacityMinutesPerDay).ThenBy(x => x.Id), ("capacityMinutesPerDay", true) => query.OrderByDescending(x => x.CapacityMinutesPerDay).ThenBy(x => x.Id),
        ("laborCostPerHourBase", false) => query.OrderBy(x => x.LaborCostPerHourBase).ThenBy(x => x.Id), ("laborCostPerHourBase", true) => query.OrderByDescending(x => x.LaborCostPerHourBase).ThenBy(x => x.Id),
        ("overheadCostPerHourBase", false) => query.OrderBy(x => x.OverheadCostPerHourBase).ThenBy(x => x.Id), ("overheadCostPerHourBase", true) => query.OrderByDescending(x => x.OverheadCostPerHourBase).ThenBy(x => x.Id),
        ("isActive", false) => query.OrderBy(x => x.IsActive).ThenBy(x => x.Id), ("isActive", true) => query.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadManufacturingWorkCenterValue(ManufacturingWorkCenter center, string code) => code switch
    {
        "code" => center.Code, "name" => center.Name, "capacityMinutesPerDay" => center.CapacityMinutesPerDay,
        "laborCostPerHourBase" => center.LaborCostPerHourBase, "overheadCostPerHourBase" => center.OverheadCostPerHourBase,
        "isActive" => center.IsActive, "createdAt" => center.CreatedAt, _ => null
    };

    private static async Task<IResult> RunManufacturingOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<ManufacturingOrder> query = db.ManufacturingOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyManufacturingOrderFilter(ref query, filter, tenantId, db, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var groups = await AggregateManufacturingOrdersByStatusAsync(query, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"manufacturingOrders:group:status:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                "status", "count", groups.Rows, groups.TotalGroups, ["status"]));
        }

        var orders = await ApplyManufacturingOrderSort(query, report.SortBy, report.Descending, tenantId, db)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).Include(x => x.Operations).AsSplitQuery().ToListAsync(ct);
        var bomIds = orders.Select(x => x.BillOfMaterialId).Distinct().ToArray();
        var warehouseIds = orders.Select(x => x.WarehouseId).Distinct().ToArray();
        var boms = await db.BillOfMaterials.AsNoTracking().Where(x => x.TenantId == tenantId && bomIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var warehouses = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var resultRows = orders.Select(order => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadManufacturingOrderValue(order, code, boms, warehouses), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "manufacturingOrders" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(ManufacturingOrderColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportManufacturingOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<ManufacturingOrder> query = db.ManufacturingOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyManufacturingOrderFilter(ref query, filter, tenantId, db, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        if (report.GroupByFields.Count > 0)
        {
            var groups = await AggregateManufacturingOrdersByStatusAsync(query, report.Descending, 0, 10_001, ct);
            if (groups.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 grup destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var csv = new StringBuilder().Append('\uFEFF').AppendLine("Durum,Üretim emri sayısı");
            foreach (var row in groups.Rows) csv.AppendLine($"{CsvValue(row.GroupValue)},{CsvValue(row.RowCount)}");
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"manufacturingOrders:group:status:{groups.Rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
        }
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var orders = await ApplyManufacturingOrderSort(query, report.SortBy, report.Descending, tenantId, db).Take(10_000)
            .Include(x => x.Operations).AsSplitQuery().ToListAsync(ct);
        var bomIds = orders.Select(x => x.BillOfMaterialId).Distinct().ToArray();
        var warehouseIds = orders.Select(x => x.WarehouseId).Distinct().ToArray();
        var boms = await db.BillOfMaterials.AsNoTracking().Where(x => x.TenantId == tenantId && bomIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var warehouses = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var csvDetail = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(ManufacturingOrderColumnByCode(code).Label))));
        foreach (var order in orders) csvDetail.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadManufacturingOrderValue(order, code, boms, warehouses)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"manufacturingOrders:{orders.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csvDetail.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunInventoryTransactionsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<InventoryTransaction> query = db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyInventoryTransactionFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyInventoryTransactionSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)
            .Include(x => x.StockItem).Include(x => x.Warehouse).Include(x => x.Tracking).AsSplitQuery().ToListAsync(ct);
        var resultRows = rows.Select(item => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadInventoryTransactionValue(item, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "inventoryTransactions" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(InventoryTransactionColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportInventoryTransactionsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<InventoryTransaction> query = db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyInventoryTransactionFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 stok hareketi destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyInventoryTransactionSort(query, report.SortBy, report.Descending).Take(10_000)
            .Include(x => x.StockItem).Include(x => x.Warehouse).Include(x => x.Tracking).AsSplitQuery().ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(InventoryTransactionColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadInventoryTransactionValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"inventoryTransactions:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunInventoryTransfersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<InventoryTransfer> query = db.InventoryTransfers.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyInventoryTransferFilter(ref query, filter, tenantId, db, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        var pageQuery = ApplyInventoryTransferSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize);
        var transfers = await pageQuery.ToListAsync(ct);
        var rows = await BuildInventoryTransferRowsAsync(transfers, tenantId, db, ct);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "inventoryTransfers" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(InventoryTransferColumnByCode).ToArray(), rows,
            report.Page, report.PageSize, count));
    }

    private static async Task<IResult> ExportInventoryTransfersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<InventoryTransfer> query = db.InventoryTransfers.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyInventoryTransferFilter(ref query, filter, tenantId, db, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 depo transferi destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var transfers = await ApplyInventoryTransferSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var rows = await BuildInventoryTransferRowsAsync(transfers, tenantId, db, ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(InventoryTransferColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(row[code]))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"inventoryTransfers:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IReadOnlyList<IReadOnlyDictionary<string, object?>>> BuildInventoryTransferRowsAsync(
        IReadOnlyList<InventoryTransfer> transfers, Guid tenantId, TenantDbContext db, CancellationToken ct)
    {
        var ids = transfers.Select(x => x.Id).ToArray();
        var warehouseIds = transfers.SelectMany(x => new[] { x.FromWarehouseId, x.ToWarehouseId }).Distinct().ToArray();
        var warehouses = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && warehouseIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var totals = await db.InventoryTransactions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.InventoryTransferId != null && ids.Contains(x.InventoryTransferId.Value) && x.Direction == InventoryDirection.Issue)
            .GroupBy(x => x.InventoryTransferId!.Value)
            .Select(group => new { TransferId = group.Key, LineCount = group.Count(), TotalQuantity = group.Sum(x => x.Quantity) })
            .ToDictionaryAsync(x => x.TransferId, ct);
        return transfers.Select(transfer =>
        {
            warehouses.TryGetValue(transfer.FromWarehouseId, out var from);
            warehouses.TryGetValue(transfer.ToWarehouseId, out var to);
            totals.TryGetValue(transfer.Id, out var total);
            return (IReadOnlyDictionary<string, object?>)new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["code"] = transfer.Code, ["transferDate"] = transfer.TransferDate, ["status"] = transfer.Status.ToString(),
                ["fromWarehouseCode"] = from?.Code, ["fromWarehouseName"] = from?.Name,
                ["toWarehouseCode"] = to?.Code, ["toWarehouseName"] = to?.Name,
                ["lineCount"] = total?.LineCount ?? 0, ["totalQuantity"] = total?.TotalQuantity ?? 0m, ["createdAt"] = transfer.CreatedAt
            };
        }).ToArray();
    }

    private static IQueryable<InventoryTransfer> ApplyInventoryTransferSort(IQueryable<InventoryTransfer> query, string sortBy, bool descending)
    {
        return (sortBy, descending) switch
        {
            ("transferDate", true) => query.OrderByDescending(x => x.TransferDate).ThenByDescending(x => x.Code),
            ("transferDate", false) => query.OrderBy(x => x.TransferDate).ThenBy(x => x.Code),
            ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Code),
            ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Code),
            ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Code),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Code),
            (_, true) => query.OrderByDescending(x => x.Code),
            _ => query.OrderBy(x => x.Code)
        };
    }

    private static bool TryApplyInventoryTransferFilter(ref IQueryable<InventoryTransfer> query, ReportFilter filter, Guid tenantId, TenantDbContext db, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code": query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "status":
                if (!Enum.TryParse<InventoryTransferStatus>(value, true, out var status)) { error = "Transfer durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "fromWarehouseCode": case "fromWarehouseName": case "toWarehouseCode": case "toWarehouseName":
                var from = filter.Field.StartsWith("from", StringComparison.Ordinal);
                var code = filter.Field.EndsWith("Code", StringComparison.Ordinal);
                query = query.Where(x => db.Warehouses.Any(w => w.TenantId == tenantId && w.Id == (from ? x.FromWarehouseId : x.ToWarehouseId)
                    && (code ? filter.Operator == "contains" ? w.Code.Contains(value) : w.Code == value
                        : filter.Operator == "contains" ? w.Name.Contains(value) : w.Name == value)));
                return true;
            case "transferDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Transfer tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.TransferDate > date), "gte" => query.Where(x => x.TransferDate >= date), "lt" => query.Where(x => x.TransferDate < date), "lte" => query.Where(x => x.TransferDate <= date), _ => query.Where(x => x.TransferDate == date) };
                return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma tarihi ISO biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), "lte" => query.Where(x => x.CreatedAt <= createdAt), _ => query.Where(x => x.CreatedAt == createdAt) };
                return true;
            default: error = "Depo transferi filtre alanı geçersiz."; return false;
        }
    }

    private static async Task<IResult> RunSalesOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesOrder> query = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplySalesOrderFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateSalesOrdersAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var groupBy = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"salesOrders:group:{groupBy}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : groupBy, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplySalesOrderSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(order => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadSalesOrderValue(order, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesOrders" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SalesOrderColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> RunSalesQuotesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesQuote> query = db.SalesQuotes.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.Customer).Include(x => x.Order);
        foreach (var filter in report.Filters)
            if (!TryApplySalesQuoteFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplySalesQuoteSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(quote => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadSalesQuoteValue(quote, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesQuotes" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SalesQuoteColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static IQueryable<SalesOrderFulfillmentReportRow> SalesOrderFulfillmentQuery(TenantDbContext db, Guid tenantId) =>
        from line in db.SalesOrderLines.AsNoTracking()
        join order in db.SalesOrders.AsNoTracking() on new { line.TenantId, Id = line.OrderId } equals new { order.TenantId, Id = order.Id }
        join customer in db.CustomerAccounts.AsNoTracking() on new { order.TenantId, order.CustomerId } equals new { customer.TenantId, CustomerId = customer.Id }
        where line.TenantId == tenantId && order.TenantId == tenantId
        let fulfilled = db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == line.OrderId && x.OrderLineNumber == line.LineNumber).Sum(x => (decimal?)x.FulfilledQuantity) ?? 0m
        let reservedOpen = db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == line.OrderId && x.OrderLineNumber == line.LineNumber && x.Status == SalesOrderReservationStatus.Active).Sum(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m
        let reserved = order.Status == SalesOrderStatus.Cancelled ? 0m : reservedOpen
        let remaining = order.Status == SalesOrderStatus.Cancelled ? 0m : line.Quantity - fulfilled
        select new SalesOrderFulfillmentReportRow(order.Code, customer.Code, customer.Name, order.OrderDate, order.RequestedDeliveryDate,
            order.Status, line.LineNumber, line.StockCode, line.StockName, line.UnitCode, line.Quantity, reserved, fulfilled, remaining,
            remaining > reserved ? remaining - reserved : 0m);

    private static async Task<IResult> RunSalesOrderFulfillmentAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesOrderFulfillmentReportRow> query = SalesOrderFulfillmentQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplySalesOrderFulfillmentFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        var rows = await ApplySalesOrderFulfillmentSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var result = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(code => code,
            code => ReadSalesOrderFulfillmentValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesOrderFulfillment" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SalesOrderFulfillmentColumnByCode).ToArray(), result,
            report.Page, report.PageSize, count));
    }

    private static async Task<IResult> ExportSalesOrderFulfillmentAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesOrderFulfillmentReportRow> query = SalesOrderFulfillmentQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplySalesOrderFulfillmentFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySalesOrderFulfillmentSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SalesOrderFulfillmentColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSalesOrderFulfillmentValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesOrderFulfillment:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplySalesOrderFulfillmentFilter(ref IQueryable<SalesOrderFulfillmentReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        if (filter.Field is "orderCode" or "customerCode" or "customerName" or "status" or "stockCode" or "stockName" or "unitCode")
        {
            var value = filter.Value!;
            query = (filter.Field, filter.Operator) switch
            {
                ("orderCode", "contains") => query.Where(x => x.OrderCode.Contains(value)), ("orderCode", _) => query.Where(x => x.OrderCode == value),
                ("customerCode", "contains") => query.Where(x => x.CustomerCode.Contains(value)), ("customerCode", _) => query.Where(x => x.CustomerCode == value),
                ("customerName", "contains") => query.Where(x => x.CustomerName.Contains(value)), ("customerName", _) => query.Where(x => x.CustomerName == value),
                ("status", _) when Enum.TryParse<SalesOrderStatus>(value, true, out var status) => query.Where(x => x.Status == status),
                ("stockCode", "contains") => query.Where(x => x.StockCode.Contains(value)), ("stockCode", _) => query.Where(x => x.StockCode == value),
                ("stockName", "contains") => query.Where(x => x.StockName.Contains(value)), ("stockName", _) => query.Where(x => x.StockName == value),
                ("unitCode", "contains") => query.Where(x => x.UnitCode.Contains(value)), ("unitCode", _) => query.Where(x => x.UnitCode == value),
                _ => query
            };
            if (filter.Field == "status" && !Enum.TryParse<SalesOrderStatus>(value, true, out _)) { error = "Satış siparişi durumu geçersiz."; return false; }
            return true;
        }
        if (filter.Field is "orderDate" or "requestedDeliveryDate")
        {
            if (filter.Field == "requestedDeliveryDate" && filter.Operator == "isNull") { query = query.Where(x => x.RequestedDeliveryDate == null); return true; }
            if (!DateOnly.TryParse(filter.Value, CultureInfo.InvariantCulture, out var date)) { error = "Tarih YYYY-MM-DD biçiminde olmalıdır."; return false; }
            if (filter.Field == "orderDate") query = ApplyDateFilter(query, filter.Operator, date, x => x.OrderDate);
            else query = filter.Operator switch
            {
                "equals" => query.Where(x => x.RequestedDeliveryDate == date),
                "gt" => query.Where(x => x.RequestedDeliveryDate > date), "gte" => query.Where(x => x.RequestedDeliveryDate >= date),
                "lt" => query.Where(x => x.RequestedDeliveryDate < date), "lte" => query.Where(x => x.RequestedDeliveryDate <= date), _ => query
            };
            return true;
        }
        var numeric = filter.Field switch
        {
            "lineNumber" => (Expression<Func<SalesOrderFulfillmentReportRow, decimal>>)(x => x.LineNumber),
            "orderedQuantity" => x => x.OrderedQuantity, "reservedQuantity" => x => x.ReservedQuantity,
            "fulfilledQuantity" => x => x.FulfilledQuantity, "remainingQuantity" => x => x.RemainingQuantity,
            "backorderQuantity" => x => x.BackorderQuantity, _ => null
        };
        if (numeric is null || !decimal.TryParse(filter.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Sayısal filtre değeri geçersiz."; return false; }
        var p = numeric.Parameters[0]; var body = numeric.Body;
        var constant = Expression.Constant(amount);
        var comparison = filter.Operator switch
        {
            "equals" => Expression.Equal(body, constant), "gt" => Expression.GreaterThan(body, constant), "gte" => Expression.GreaterThanOrEqual(body, constant),
            "lt" => Expression.LessThan(body, constant), "lte" => Expression.LessThanOrEqual(body, constant), _ => null
        };
        if (comparison is null) { error = "Sayısal filtre operatörü geçersiz."; return false; }
        query = query.Where(Expression.Lambda<Func<SalesOrderFulfillmentReportRow, bool>>(comparison, p));
        return true;
    }

    private static IQueryable<SalesOrderFulfillmentReportRow> ApplyDateFilter(IQueryable<SalesOrderFulfillmentReportRow> query, string op, DateOnly date, Expression<Func<SalesOrderFulfillmentReportRow, DateOnly>> selector)
    {
        var p = selector.Parameters[0]; var value = selector.Body; var constant = Expression.Constant(date);
        var cmp = op switch { "equals" => Expression.Equal(value, constant), "gt" => Expression.GreaterThan(value, constant), "gte" => Expression.GreaterThanOrEqual(value, constant), "lt" => Expression.LessThan(value, constant), "lte" => Expression.LessThanOrEqual(value, constant), _ => Expression.Equal(value, constant) };
        return query.Where(Expression.Lambda<Func<SalesOrderFulfillmentReportRow, bool>>(cmp, p));
    }

    private static IOrderedQueryable<SalesOrderFulfillmentReportRow> ApplySalesOrderFulfillmentSort(IQueryable<SalesOrderFulfillmentReportRow> query, string field, bool desc) => (field, desc) switch
    {
        ("orderCode", false) => query.OrderBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("orderCode", true) => query.OrderByDescending(x => x.OrderCode).ThenBy(x => x.LineNumber),
        ("customerCode", false) => query.OrderBy(x => x.CustomerCode).ThenBy(x => x.OrderCode), ("customerCode", true) => query.OrderByDescending(x => x.CustomerCode).ThenBy(x => x.OrderCode),
        ("customerName", false) => query.OrderBy(x => x.CustomerName).ThenBy(x => x.OrderCode), ("customerName", true) => query.OrderByDescending(x => x.CustomerName).ThenBy(x => x.OrderCode),
        ("orderDate", false) => query.OrderBy(x => x.OrderDate).ThenBy(x => x.OrderCode), ("orderDate", true) => query.OrderByDescending(x => x.OrderDate).ThenBy(x => x.OrderCode),
        ("requestedDeliveryDate", false) => query.OrderBy(x => x.RequestedDeliveryDate).ThenBy(x => x.OrderCode), ("requestedDeliveryDate", true) => query.OrderByDescending(x => x.RequestedDeliveryDate).ThenBy(x => x.OrderCode),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.OrderCode), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.OrderCode),
        ("lineNumber", false) => query.OrderBy(x => x.LineNumber).ThenBy(x => x.OrderCode), ("lineNumber", true) => query.OrderByDescending(x => x.LineNumber).ThenBy(x => x.OrderCode),
        ("stockCode", false) => query.OrderBy(x => x.StockCode).ThenBy(x => x.OrderCode), ("stockCode", true) => query.OrderByDescending(x => x.StockCode).ThenBy(x => x.OrderCode),
        ("stockName", false) => query.OrderBy(x => x.StockName).ThenBy(x => x.OrderCode), ("stockName", true) => query.OrderByDescending(x => x.StockName).ThenBy(x => x.OrderCode),
        ("unitCode", false) => query.OrderBy(x => x.UnitCode).ThenBy(x => x.OrderCode), ("unitCode", true) => query.OrderByDescending(x => x.UnitCode).ThenBy(x => x.OrderCode),
        ("orderedQuantity", false) => query.OrderBy(x => x.OrderedQuantity).ThenBy(x => x.OrderCode), ("orderedQuantity", true) => query.OrderByDescending(x => x.OrderedQuantity).ThenBy(x => x.OrderCode),
        ("reservedQuantity", false) => query.OrderBy(x => x.ReservedQuantity).ThenBy(x => x.OrderCode), ("reservedQuantity", true) => query.OrderByDescending(x => x.ReservedQuantity).ThenBy(x => x.OrderCode),
        ("fulfilledQuantity", false) => query.OrderBy(x => x.FulfilledQuantity).ThenBy(x => x.OrderCode), ("fulfilledQuantity", true) => query.OrderByDescending(x => x.FulfilledQuantity).ThenBy(x => x.OrderCode),
        ("remainingQuantity", false) => query.OrderBy(x => x.RemainingQuantity).ThenBy(x => x.OrderCode), ("remainingQuantity", true) => query.OrderByDescending(x => x.RemainingQuantity).ThenBy(x => x.OrderCode),
        ("backorderQuantity", false) => query.OrderBy(x => x.BackorderQuantity).ThenBy(x => x.OrderCode), ("backorderQuantity", true) => query.OrderByDescending(x => x.BackorderQuantity).ThenBy(x => x.OrderCode),
        _ => query.OrderBy(x => x.OrderCode).ThenBy(x => x.LineNumber)
    };

    private static object? ReadSalesOrderFulfillmentValue(SalesOrderFulfillmentReportRow x, string code) => code switch
    {
        "orderCode" => x.OrderCode, "customerCode" => x.CustomerCode, "customerName" => x.CustomerName, "orderDate" => x.OrderDate,
        "requestedDeliveryDate" => x.RequestedDeliveryDate, "status" => x.Status.ToString(), "lineNumber" => x.LineNumber,
        "stockCode" => x.StockCode, "stockName" => x.StockName, "unitCode" => x.UnitCode, "orderedQuantity" => x.OrderedQuantity,
        "reservedQuantity" => x.ReservedQuantity, "fulfilledQuantity" => x.FulfilledQuantity, "remainingQuantity" => x.RemainingQuantity,
        "backorderQuantity" => x.BackorderQuantity, _ => null
    };
    private static ReportColumn SalesOrderFulfillmentColumnByCode(string code) => SalesOrderFulfillmentColumns.First(x => x.Code == code);

    private static IQueryable<PurchaseOrderFulfillmentReportRow> PurchaseOrderFulfillmentQuery(TenantDbContext db, Guid tenantId) =>
        from line in db.PurchaseOrderLines.AsNoTracking()
        join order in db.PurchaseOrders.AsNoTracking() on new { line.TenantId, Id = line.PurchaseOrderId } equals new { order.TenantId, Id = order.Id }
        join supplier in db.CustomerAccounts.AsNoTracking() on new { order.TenantId, order.SupplierId } equals new { supplier.TenantId, SupplierId = supplier.Id }
        where line.TenantId == tenantId && order.TenantId == tenantId &&
            (order.Status == PurchaseOrderStatus.Open || order.Status == PurchaseOrderStatus.PartiallyReceived)
        let received = db.PurchaseReceiptLines.Where(x => x.TenantId == tenantId && x.PurchaseOrderId == line.PurchaseOrderId &&
            x.OrderLineNumber == line.LineNumber && db.PurchaseReceipts.Any(r => r.TenantId == tenantId && r.Id == x.ReceiptId && r.Status == PurchaseReceiptStatus.Posted))
            .Sum(x => (decimal?)x.Quantity) ?? 0m
        select new PurchaseOrderFulfillmentReportRow
        {
            OrderCode = order.Code,
            SupplierCode = supplier.Code,
            SupplierName = supplier.Name,
            OrderDate = order.OrderDate,
            ExpectedReceiptDate = order.ExpectedReceiptDate,
            Status = order.Status,
            LineNumber = line.LineNumber,
            StockCode = line.StockCode,
            StockName = line.StockName,
            UnitCode = line.UnitCode,
            OrderedQuantity = line.Quantity,
            ReceivedQuantity = received,
            OutstandingQuantity = line.Quantity > received ? line.Quantity - received : 0m
        };

    private static async Task<IResult> RunPurchaseOrderFulfillmentAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseOrderFulfillmentReportRow> query = PurchaseOrderFulfillmentQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseOrderFulfillmentFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        var rows = await ApplyPurchaseOrderFulfillmentSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var result = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(code => code,
            code => ReadPurchaseOrderFulfillmentValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseOrderFulfillment" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseOrderFulfillmentColumnByCode).ToArray(), result,
            report.Page, report.PageSize, count));
    }

    private static async Task<IResult> ExportPurchaseOrderFulfillmentAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseOrderFulfillmentReportRow> query = PurchaseOrderFulfillmentQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseOrderFulfillmentFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var count = await query.CountAsync(ct);
        if (count > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyPurchaseOrderFulfillmentSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseOrderFulfillmentColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseOrderFulfillmentValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseOrderFulfillment:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyPurchaseOrderFulfillmentFilter(ref IQueryable<PurchaseOrderFulfillmentReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        if (filter.Field is "orderCode" or "supplierCode" or "supplierName" or "status" or "stockCode" or "stockName" or "unitCode")
        {
            var value = filter.Value!;
            query = (filter.Field, filter.Operator) switch
            {
                ("orderCode", "contains") => query.Where(x => x.OrderCode.Contains(value)), ("orderCode", _) => query.Where(x => x.OrderCode == value),
                ("supplierCode", "contains") => query.Where(x => x.SupplierCode.Contains(value)), ("supplierCode", _) => query.Where(x => x.SupplierCode == value),
                ("supplierName", "contains") => query.Where(x => x.SupplierName.Contains(value)), ("supplierName", _) => query.Where(x => x.SupplierName == value),
                ("status", _) when Enum.TryParse<PurchaseOrderStatus>(value, true, out var status) => query.Where(x => x.Status == status),
                ("stockCode", "contains") => query.Where(x => x.StockCode.Contains(value)), ("stockCode", _) => query.Where(x => x.StockCode == value),
                ("stockName", "contains") => query.Where(x => x.StockName.Contains(value)), ("stockName", _) => query.Where(x => x.StockName == value),
                ("unitCode", "contains") => query.Where(x => x.UnitCode.Contains(value)), ("unitCode", _) => query.Where(x => x.UnitCode == value),
                _ => query
            };
            if (filter.Field == "status" && !Enum.TryParse<PurchaseOrderStatus>(value, true, out _)) { error = "Satın alma siparişi durumu geçersiz."; return false; }
            return true;
        }
        if (filter.Field is "orderDate" or "expectedReceiptDate")
        {
            if (filter.Field == "expectedReceiptDate" && filter.Operator == "isNull") { query = query.Where(x => x.ExpectedReceiptDate == null); return true; }
            if (!DateOnly.TryParse(filter.Value, CultureInfo.InvariantCulture, out var date)) { error = "Tarih YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = (filter.Field, filter.Operator) switch
            {
                ("orderDate", "gt") => query.Where(x => x.OrderDate > date), ("orderDate", "gte") => query.Where(x => x.OrderDate >= date),
                ("orderDate", "lt") => query.Where(x => x.OrderDate < date), ("orderDate", "lte") => query.Where(x => x.OrderDate <= date),
                ("orderDate", _) => query.Where(x => x.OrderDate == date),
                ("expectedReceiptDate", "gt") => query.Where(x => x.ExpectedReceiptDate > date), ("expectedReceiptDate", "gte") => query.Where(x => x.ExpectedReceiptDate >= date),
                ("expectedReceiptDate", "lt") => query.Where(x => x.ExpectedReceiptDate < date), ("expectedReceiptDate", "lte") => query.Where(x => x.ExpectedReceiptDate <= date),
                _ => query.Where(x => x.ExpectedReceiptDate == date)
            };
            return true;
        }
        if (filter.Field is "lineNumber" or "orderedQuantity" or "receivedQuantity" or "outstandingQuantity")
        {
            if (!decimal.TryParse(filter.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number)) { error = "Sayısal filtre geçersiz."; return false; }
            Expression<Func<PurchaseOrderFulfillmentReportRow, decimal>> selector = filter.Field switch
            {
                "lineNumber" => x => x.LineNumber, "orderedQuantity" => x => x.OrderedQuantity,
                "receivedQuantity" => x => x.ReceivedQuantity, _ => x => x.OutstandingQuantity
            };
            var p = selector.Parameters[0];
            var comparison = Expression.MakeBinary(filter.Operator switch { "gt" => ExpressionType.GreaterThan, "gte" => ExpressionType.GreaterThanOrEqual, "lt" => ExpressionType.LessThan, "lte" => ExpressionType.LessThanOrEqual, _ => ExpressionType.Equal }, selector.Body, Expression.Constant(number));
            query = query.Where(Expression.Lambda<Func<PurchaseOrderFulfillmentReportRow, bool>>(comparison, p));
            return true;
        }
        error = "Satın alma karşılama raporu filtre alanı geçersiz.";
        return false;
    }

    private static IOrderedQueryable<PurchaseOrderFulfillmentReportRow> ApplyPurchaseOrderFulfillmentSort(IQueryable<PurchaseOrderFulfillmentReportRow> query, string field, bool desc) => (field, desc) switch
    {
        ("orderCode", false) => query.OrderBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("orderCode", true) => query.OrderByDescending(x => x.OrderCode).ThenBy(x => x.LineNumber),
        ("supplierCode", false) => query.OrderBy(x => x.SupplierCode).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("supplierCode", true) => query.OrderByDescending(x => x.SupplierCode).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber),
        ("expectedReceiptDate", false) => query.OrderBy(x => x.ExpectedReceiptDate).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("expectedReceiptDate", true) => query.OrderByDescending(x => x.ExpectedReceiptDate).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber),
        ("stockCode", false) => query.OrderBy(x => x.StockCode).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("stockCode", true) => query.OrderByDescending(x => x.StockCode).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber),
        ("receivedQuantity", false) => query.OrderBy(x => x.ReceivedQuantity).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("receivedQuantity", true) => query.OrderByDescending(x => x.ReceivedQuantity).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber),
        ("outstandingQuantity", false) => query.OrderBy(x => x.OutstandingQuantity).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber), ("outstandingQuantity", true) => query.OrderByDescending(x => x.OutstandingQuantity).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber),
        _ => desc ? query.OrderByDescending(x => x.OrderDate).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber) : query.OrderBy(x => x.OrderDate).ThenBy(x => x.OrderCode).ThenBy(x => x.LineNumber)
    };

    private static object? ReadPurchaseOrderFulfillmentValue(PurchaseOrderFulfillmentReportRow x, string code) => code switch
    {
        "orderCode" => x.OrderCode, "supplierCode" => x.SupplierCode, "supplierName" => x.SupplierName, "orderDate" => x.OrderDate,
        "expectedReceiptDate" => x.ExpectedReceiptDate, "status" => x.Status.ToString(), "lineNumber" => x.LineNumber, "stockCode" => x.StockCode,
        "stockName" => x.StockName, "unitCode" => x.UnitCode, "orderedQuantity" => x.OrderedQuantity, "receivedQuantity" => x.ReceivedQuantity,
        "outstandingQuantity" => x.OutstandingQuantity, _ => null
    };
    private static ReportColumn PurchaseOrderFulfillmentColumnByCode(string code) => PurchaseOrderFulfillmentColumns.First(x => x.Code == code);

    private static async Task<IResult> ExportSalesQuotesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesQuote> query = db.SalesQuotes.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.Customer).Include(x => x.Order);
        foreach (var filter in report.Filters)
            if (!TryApplySalesQuoteFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySalesQuoteSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SalesQuoteColumnByCode(code).Label))));
        foreach (var quote in rows)
            csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSalesQuoteValue(quote, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesQuotes:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunPurchaseSupplierQuotesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseSupplierQuote> query = db.PurchaseSupplierQuotes.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.PurchaseRequest).Include(x => x.Supplier);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseSupplierQuoteFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyPurchaseSupplierQuoteSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(quote => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseSupplierQuoteValue(quote, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseSupplierQuotes" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseSupplierQuoteColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseSupplierQuotesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseSupplierQuote> query = db.PurchaseSupplierQuotes.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.PurchaseRequest).Include(x => x.Supplier);
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseSupplierQuoteFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyPurchaseSupplierQuoteSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseSupplierQuoteColumnByCode(code).Label))));
        foreach (var quote in rows)
            csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseSupplierQuoteValue(quote, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseSupplierQuotes:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunSalesDeliveriesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesDelivery> query = db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.Order).ThenInclude(x => x.Customer).Include(x => x.Warehouse).Include(x => x.Invoice).Include(x => x.Lines);
        foreach (var filter in report.Filters)
            if (!TryApplySalesDeliveryFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplySalesDeliverySort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(delivery => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadSalesDeliveryValue(delivery, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesDeliveries" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SalesDeliveryColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSalesDeliveriesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesDelivery> query = db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.Order).ThenInclude(x => x.Customer).Include(x => x.Warehouse).Include(x => x.Invoice).Include(x => x.Lines);
        foreach (var filter in report.Filters)
            if (!TryApplySalesDeliveryFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySalesDeliverySort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SalesDeliveryColumnByCode(code).Label))));
        foreach (var delivery in rows)
            csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSalesDeliveryValue(delivery, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesDeliveries:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunSalesReturnsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesReturn> query = db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.SalesInvoice).Include(x => x.Customer).Include(x => x.Warehouse).Include(x => x.Lines);
        foreach (var filter in report.Filters)
            if (!TryApplySalesReturnFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplySalesReturnSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(salesReturn => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadSalesReturnValue(salesReturn, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesReturns" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SalesReturnColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSalesReturnsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesReturn> query = db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Include(x => x.SalesInvoice).Include(x => x.Customer).Include(x => x.Warehouse).Include(x => x.Lines);
        foreach (var filter in report.Filters)
            if (!TryApplySalesReturnFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySalesReturnSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SalesReturnColumnByCode(code).Label))));
        foreach (var salesReturn in rows)
            csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSalesReturnValue(salesReturn, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesReturns:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunSupplierReturnsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplySupplierReturnFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplySupplierReturnSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)
            .Select(x => new SupplierReturnReportRow(x.Id, x.Code, x.PurchaseInvoice.Code, x.Supplier.Code, x.Supplier.Name,
                x.Warehouse.Code, x.Warehouse.Name, x.ReturnDate, x.Status, x.Subtotal, x.DiscountTotal, x.TaxTotal,
                x.GrandTotal, x.Lines.Count(), x.Lines.Sum(line => (decimal?)line.Quantity) ?? 0m, x.CreatedAt))
            .ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadSupplierReturnValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "supplierReturns" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SupplierReturnColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSupplierReturnsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplySupplierReturnFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplySupplierReturnSort(query, report.SortBy, report.Descending).Take(10_000)
            .Select(x => new SupplierReturnReportRow(x.Id, x.Code, x.PurchaseInvoice.Code, x.Supplier.Code, x.Supplier.Name,
                x.Warehouse.Code, x.Warehouse.Name, x.ReturnDate, x.Status, x.Subtotal, x.DiscountTotal, x.TaxTotal,
                x.GrandTotal, x.Lines.Count(), x.Lines.Sum(line => (decimal?)line.Quantity) ?? 0m, x.CreatedAt))
            .ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SupplierReturnColumnByCode(code).Label))));
        foreach (var row in rows)
            csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSupplierReturnValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"supplierReturns:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> ExportSalesOrdersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesOrder> query = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplySalesOrderFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateSalesOrdersAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => SalesOrderColumnByCode(code).Label).Append("Sipariş sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(SalesOrderAggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(value => Csv(value))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesOrders:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplySalesOrderSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SalesOrderColumnByCode(code).Label))));
            foreach (var order in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSalesOrderValue(order, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesOrders:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<IResult> RunPurchaseRequestsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseRequest> query = db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.purchase-requests.read", "erp.purchase-requests", query, x => x.Status, null, null, x => x.RequestedByUserId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseRequestFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseRequestsAsync(query, report.GroupByFields[0], report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"purchaseRequests:group:{report.GroupByFields[0]}:count" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields[0], "count", grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyPurchaseRequestSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(request => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadPurchaseRequestValue(request, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "purchaseRequests" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(PurchaseRequestColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportPurchaseRequestsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<PurchaseRequest> query = db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.purchase-requests.read", "erp.purchase-requests", query, x => x.Status, null, null, x => x.RequestedByUserId) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplyPurchaseRequestFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregatePurchaseRequestsAsync(query, report.GroupByFields[0], report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            csv.Append('\uFEFF').AppendLine($"{Csv(PurchaseRequestColumnByCode(report.GroupByFields[0]).Label)},{Csv("Talep sayısı")}");
            foreach (var row in grouped.Rows) csv.AppendLine($"{CsvValue(row.GroupValue)},{CsvValue(row.RowCount)}");
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseRequests:group:{report.GroupByFields[0]}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyPurchaseRequestSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(PurchaseRequestColumnByCode(code).Label))));
            foreach (var request in rows)
                csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadPurchaseRequestValue(request, code)))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"purchaseRequests:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<AggregatePage> AggregatePurchaseRequestsAsync(IQueryable<PurchaseRequest> query, string field,
        bool descending, int skip, int take, CancellationToken ct)
    {
        switch (field)
        {
            case "status":
            {
                var groups = query.GroupBy(x => x.Status).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key.ToString(), x.Count, x.Count)).ToArray(), total);
            }
            case "requesterUserId":
            {
                var groups = query.GroupBy(x => x.RequestedByUserId).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key.ToString("D"), x.Count, x.Count)).ToArray(), total);
            }
            case "requestDate":
            {
                var groups = query.GroupBy(x => x.RequestDate).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key, x.Count, x.Count)).ToArray(), total);
            }
            default:
            {
                var groups = query.GroupBy(x => x.Code).Select(g => new { Key = g.Key, Count = g.Count() });
                var total = await groups.CountAsync(ct);
                var page = await (descending ? groups.OrderByDescending(x => x.Count).ThenBy(x => x.Key) : groups.OrderBy(x => x.Key))
                    .Skip(skip).Take(take).ToListAsync(ct);
                return new AggregatePage(page.Select(x => new ReportAggregateRow(x.Key, x.Count, x.Count)).ToArray(), total);
            }
        }
    }

    private static IQueryable<BankStatement> BankStatementQuery(TenantDbContext db, Guid tenantId) =>
        db.BankStatements.AsNoTracking().Where(x => x.TenantId == tenantId);

    private static async Task<IResult> RunBankStatementsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<BankStatement> query = BankStatementQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyBankStatementFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyBankStatementSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)
            .Select(x => new BankStatementReportRow(x.Id, x.Code, x.Account.Code, x.Account.Name, x.CurrencyCode,
                x.StartDate, x.EndDate, x.OpeningBalance, x.ClosingBalance, x.Status, x.Lines.Count(),
                x.Lines.Count(line => line.FinancialAccountTransactionId != null),
                x.Lines.Count(line => line.FinancialAccountTransactionId == null), x.CreatedAt))
            .ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadBankStatementValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "bankStatements" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(BankStatementColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportBankStatementsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<BankStatement> query = BankStatementQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyBankStatementFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyBankStatementSort(query, report.SortBy, report.Descending).Take(10_000)
            .Select(x => new BankStatementReportRow(x.Id, x.Code, x.Account.Code, x.Account.Name, x.CurrencyCode,
                x.StartDate, x.EndDate, x.OpeningBalance, x.ClosingBalance, x.Status, x.Lines.Count(),
                x.Lines.Count(line => line.FinancialAccountTransactionId != null),
                x.Lines.Count(line => line.FinancialAccountTransactionId == null), x.CreatedAt))
            .ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(BankStatementColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadBankStatementValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"bankStatements:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyBankStatementFilter(ref IQueryable<BankStatement> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "code" or "accountCode" or "accountName" or "currencyCode")
        {
            query = (filter.Field, filter.Operator) switch
            {
                ("code", "contains") => query.Where(x => x.Code.Contains(value)), ("code", _) => query.Where(x => x.Code == value),
                ("accountCode", "contains") => query.Where(x => x.Account.Code.Contains(value)), ("accountCode", _) => query.Where(x => x.Account.Code == value),
                ("accountName", "contains") => query.Where(x => x.Account.Name.Contains(value)), ("accountName", _) => query.Where(x => x.Account.Name == value),
                ("currencyCode", "contains") => query.Where(x => x.CurrencyCode.Contains(value)), _ => query.Where(x => x.CurrencyCode == value)
            };
            return true;
        }
        if (filter.Field == "status")
        {
            if (!Enum.TryParse<BankStatementStatus>(value, true, out var status)) { error = "Banka ekstresi durumu geçersiz."; return false; }
            query = query.Where(x => x.Status == status);
            return true;
        }
        if (filter.Field is "startDate" or "endDate")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Dönem tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = (filter.Field, filter.Operator) switch
            {
                ("startDate", "gt") => query.Where(x => x.StartDate > date), ("startDate", "gte") => query.Where(x => x.StartDate >= date),
                ("startDate", "lt") => query.Where(x => x.StartDate < date), ("startDate", "lte") => query.Where(x => x.StartDate <= date),
                ("startDate", _) => query.Where(x => x.StartDate == date), ("endDate", "gt") => query.Where(x => x.EndDate > date),
                ("endDate", "gte") => query.Where(x => x.EndDate >= date), ("endDate", "lt") => query.Where(x => x.EndDate < date),
                ("endDate", "lte") => query.Where(x => x.EndDate <= date), _ => query.Where(x => x.EndDate == date)
            };
            return true;
        }
        if (filter.Field is "openingBalance" or "closingBalance")
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Bakiye filtresi sayısal olmalıdır."; return false; }
            query = (filter.Field, filter.Operator) switch
            {
                ("openingBalance", "gt") => query.Where(x => x.OpeningBalance > amount), ("openingBalance", "gte") => query.Where(x => x.OpeningBalance >= amount),
                ("openingBalance", "lt") => query.Where(x => x.OpeningBalance < amount), ("openingBalance", "lte") => query.Where(x => x.OpeningBalance <= amount),
                ("openingBalance", _) => query.Where(x => x.OpeningBalance == amount), ("closingBalance", "gt") => query.Where(x => x.ClosingBalance > amount),
                ("closingBalance", "gte") => query.Where(x => x.ClosingBalance >= amount), ("closingBalance", "lt") => query.Where(x => x.ClosingBalance < amount),
                ("closingBalance", "lte") => query.Where(x => x.ClosingBalance <= amount), _ => query.Where(x => x.ClosingBalance == amount)
            };
            return true;
        }
        if (filter.Field is "lineCount" or "matchedLineCount" or "unmatchedLineCount")
        {
            if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var count)) { error = "Satır sayısı tam sayı olmalıdır."; return false; }
            query = (filter.Field, filter.Operator) switch
            {
                ("lineCount", "gt") => query.Where(x => x.Lines.Count() > count), ("lineCount", "gte") => query.Where(x => x.Lines.Count() >= count),
                ("lineCount", "lt") => query.Where(x => x.Lines.Count() < count), ("lineCount", "lte") => query.Where(x => x.Lines.Count() <= count),
                ("lineCount", _) => query.Where(x => x.Lines.Count() == count), ("matchedLineCount", "gt") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null) > count),
                ("matchedLineCount", "gte") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null) >= count), ("matchedLineCount", "lt") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null) < count),
                ("matchedLineCount", "lte") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null) <= count), ("matchedLineCount", _) => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null) == count),
                ("unmatchedLineCount", "gt") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null) > count), ("unmatchedLineCount", "gte") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null) >= count),
                ("unmatchedLineCount", "lt") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null) < count), ("unmatchedLineCount", "lte") => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null) <= count),
                _ => query.Where(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null) == count)
            };
            return true;
        }
        if (filter.Field == "createdAt")
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt),
                "lt" => query.Where(x => x.CreatedAt < createdAt), "lte" => query.Where(x => x.CreatedAt <= createdAt),
                _ => query.Where(x => x.CreatedAt == createdAt)
            };
            return true;
        }
        error = "Banka ekstresi filtre alanı geçersiz.";
        return false;
    }

    private static IQueryable<BankStatement> ApplyBankStatementSort(IQueryable<BankStatement> query, string field, bool descending)
    {
        IOrderedQueryable<BankStatement> ordered = (field, descending) switch
        {
            ("accountCode", false) => query.OrderBy(x => x.Account.Code), ("accountCode", true) => query.OrderByDescending(x => x.Account.Code),
            ("accountName", false) => query.OrderBy(x => x.Account.Name), ("accountName", true) => query.OrderByDescending(x => x.Account.Name),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("startDate", false) => query.OrderBy(x => x.StartDate), ("startDate", true) => query.OrderByDescending(x => x.StartDate),
            ("endDate", false) => query.OrderBy(x => x.EndDate), ("endDate", true) => query.OrderByDescending(x => x.EndDate),
            ("openingBalance", false) => query.OrderBy(x => x.OpeningBalance), ("openingBalance", true) => query.OrderByDescending(x => x.OpeningBalance),
            ("closingBalance", false) => query.OrderBy(x => x.ClosingBalance), ("closingBalance", true) => query.OrderByDescending(x => x.ClosingBalance),
            ("status", false) => query.OrderBy(x => x.Status), ("status", true) => query.OrderByDescending(x => x.Status),
            ("lineCount", false) => query.OrderBy(x => x.Lines.Count()), ("lineCount", true) => query.OrderByDescending(x => x.Lines.Count()),
            ("matchedLineCount", false) => query.OrderBy(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null)), ("matchedLineCount", true) => query.OrderByDescending(x => x.Lines.Count(line => line.FinancialAccountTransactionId != null)),
            ("unmatchedLineCount", false) => query.OrderBy(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null)), ("unmatchedLineCount", true) => query.OrderByDescending(x => x.Lines.Count(line => line.FinancialAccountTransactionId == null)),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt),
            ("code", true) => query.OrderByDescending(x => x.Code), _ => query.OrderBy(x => x.Code)
        };
        return ordered.ThenBy(x => x.Id);
    }

    private static object? ReadBankStatementValue(BankStatementReportRow row, string code) => code switch
    {
        "code" => row.Code, "accountCode" => row.AccountCode, "accountName" => row.AccountName, "currencyCode" => row.CurrencyCode,
        "startDate" => row.StartDate, "endDate" => row.EndDate, "openingBalance" => row.OpeningBalance, "closingBalance" => row.ClosingBalance,
        "status" => row.Status.ToString(), "lineCount" => row.LineCount, "matchedLineCount" => row.MatchedLineCount,
        "unmatchedLineCount" => row.UnmatchedLineCount, "createdAt" => row.CreatedAt, _ => null
    };

    private static IQueryable<BankStatementLine> BankStatementLineQuery(TenantDbContext db, Guid tenantId) =>
        db.BankStatementLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.Statement.TenantId == tenantId);

    private static async Task<IResult> RunBankStatementLinesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<BankStatementLine> query = BankStatementLineQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyBankStatementLineFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyBankStatementLineSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)
            .Select(x => new BankStatementLineReportRow(x.Id, x.Statement.Code, x.LineNumber, x.ExternalId, x.TransactionDate,
                x.Direction, x.CurrencyCode, x.Amount, x.Description, x.Reference, x.FinancialAccountTransactionId != null,
                x.FinancialAccountTransactionId, x.IsBookEntryCreated, x.MatchedAt))
            .ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadBankStatementLineValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "bankStatementLines" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(BankStatementLineColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportBankStatementLinesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<BankStatementLine> query = BankStatementLineQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyBankStatementLineFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyBankStatementLineSort(query, report.SortBy, report.Descending).Take(10_000)
            .Select(x => new BankStatementLineReportRow(x.Id, x.Statement.Code, x.LineNumber, x.ExternalId, x.TransactionDate,
                x.Direction, x.CurrencyCode, x.Amount, x.Description, x.Reference, x.FinancialAccountTransactionId != null,
                x.FinancialAccountTransactionId, x.IsBookEntryCreated, x.MatchedAt))
            .ToListAsync(ct);
        var csv = new StringBuilder().Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(BankStatementLineColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadBankStatementLineValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"bankStatementLines:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyBankStatementLineFilter(ref IQueryable<BankStatementLine> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value ?? "";
        if (filter.Field is "statementCode" or "currencyCode" or "description" or "externalId" or "reference")
        {
            if (filter.Field is "externalId" or "reference" && filter.Operator == "isNull")
            {
                query = filter.Field == "externalId" ? query.Where(x => x.ExternalId == null) : query.Where(x => x.Reference == null);
                return true;
            }
            query = (filter.Field, filter.Operator) switch
            {
                ("statementCode", "contains") => query.Where(x => x.Statement.Code.Contains(value)),
                ("statementCode", _) => query.Where(x => x.Statement.Code == value),
                ("currencyCode", "contains") => query.Where(x => x.CurrencyCode.Contains(value)),
                ("currencyCode", _) => query.Where(x => x.CurrencyCode == value),
                ("description", "contains") => query.Where(x => x.Description.Contains(value)),
                ("description", _) => query.Where(x => x.Description == value),
                ("externalId", "contains") => query.Where(x => x.ExternalId != null && x.ExternalId.Contains(value)),
                ("externalId", _) => query.Where(x => x.ExternalId == value),
                ("reference", "contains") => query.Where(x => x.Reference != null && x.Reference.Contains(value)),
                _ => query.Where(x => x.Reference == value)
            };
            return true;
        }
        if (filter.Field == "direction")
        {
            if (!Enum.TryParse<FinancialDirection>(value, true, out var direction)) { error = "Banka ekstresi satırı yönü geçersiz."; return false; }
            query = query.Where(x => x.Direction == direction);
            return true;
        }
        if (filter.Field is "isMatched" or "bookEntryCreated")
        {
            if (!bool.TryParse(value, out var flag)) { error = "Eşleşme filtresi true veya false olmalıdır."; return false; }
            query = filter.Field == "isMatched" ? query.Where(x => (x.FinancialAccountTransactionId != null) == flag) : query.Where(x => x.IsBookEntryCreated == flag);
            return true;
        }
        if (filter.Field == "transactionId")
        {
            if (filter.Operator == "isNull") query = query.Where(x => x.FinancialAccountTransactionId == null);
            else if (Guid.TryParse(value, out var transactionId)) query = query.Where(x => x.FinancialAccountTransactionId == transactionId);
            else { error = "Hareket kimliği geçerli bir GUID olmalıdır."; return false; }
            return true;
        }
        if (filter.Field == "transactionDate")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Hareket tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.TransactionDate > date), "gte" => query.Where(x => x.TransactionDate >= date),
                "lt" => query.Where(x => x.TransactionDate < date), "lte" => query.Where(x => x.TransactionDate <= date),
                _ => query.Where(x => x.TransactionDate == date)
            };
            return true;
        }
        if (filter.Field == "matchedAt")
        {
            if (filter.Operator == "isNull") { query = query.Where(x => x.MatchedAt == null); return true; }
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var matchedAt)) { error = "Eşleşme zamanı ISO tarih olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.MatchedAt > matchedAt), "gte" => query.Where(x => x.MatchedAt >= matchedAt),
                "lt" => query.Where(x => x.MatchedAt < matchedAt), "lte" => query.Where(x => x.MatchedAt <= matchedAt),
                _ => query.Where(x => x.MatchedAt == matchedAt)
            };
            return true;
        }
        if (filter.Field is "amount" or "lineNumber")
        {
            if (filter.Field == "amount")
            {
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Tutar filtresi sayısal olmalıdır."; return false; }
                query = (filter.Operator, amount) switch
                {
                    ("gt", _) => query.Where(x => x.Amount > amount), ("gte", _) => query.Where(x => x.Amount >= amount),
                    ("lt", _) => query.Where(x => x.Amount < amount), ("lte", _) => query.Where(x => x.Amount <= amount), _ => query.Where(x => x.Amount == amount)
                };
            }
            else
            {
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var lineNumber)) { error = "Ekstre satırı tam sayı olmalıdır."; return false; }
                query = (filter.Operator, lineNumber) switch
                {
                    ("gt", _) => query.Where(x => x.LineNumber > lineNumber), ("gte", _) => query.Where(x => x.LineNumber >= lineNumber),
                    ("lt", _) => query.Where(x => x.LineNumber < lineNumber), ("lte", _) => query.Where(x => x.LineNumber <= lineNumber), _ => query.Where(x => x.LineNumber == lineNumber)
                };
            }
            return true;
        }
        error = "Banka ekstresi satırı filtre alanı geçersiz.";
        return false;
    }

    private static IQueryable<BankStatementLine> ApplyBankStatementLineSort(IQueryable<BankStatementLine> query, string field, bool descending)
    {
        IOrderedQueryable<BankStatementLine> ordered = (field, descending) switch
        {
            ("statementCode", false) => query.OrderBy(x => x.Statement.Code), ("statementCode", true) => query.OrderByDescending(x => x.Statement.Code),
            ("lineNumber", false) => query.OrderBy(x => x.LineNumber), ("lineNumber", true) => query.OrderByDescending(x => x.LineNumber),
            ("externalId", false) => query.OrderBy(x => x.ExternalId), ("externalId", true) => query.OrderByDescending(x => x.ExternalId),
            ("transactionDate", false) => query.OrderBy(x => x.TransactionDate), ("transactionDate", true) => query.OrderByDescending(x => x.TransactionDate),
            ("direction", false) => query.OrderBy(x => x.Direction), ("direction", true) => query.OrderByDescending(x => x.Direction),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("amount", false) => query.OrderBy(x => x.Amount), ("amount", true) => query.OrderByDescending(x => x.Amount),
            ("description", false) => query.OrderBy(x => x.Description), ("description", true) => query.OrderByDescending(x => x.Description),
            ("reference", false) => query.OrderBy(x => x.Reference), ("reference", true) => query.OrderByDescending(x => x.Reference),
            ("isMatched", false) => query.OrderBy(x => x.FinancialAccountTransactionId != null), ("isMatched", true) => query.OrderByDescending(x => x.FinancialAccountTransactionId != null),
            ("transactionId", false) => query.OrderBy(x => x.FinancialAccountTransactionId), ("transactionId", true) => query.OrderByDescending(x => x.FinancialAccountTransactionId),
            ("bookEntryCreated", false) => query.OrderBy(x => x.IsBookEntryCreated), ("bookEntryCreated", true) => query.OrderByDescending(x => x.IsBookEntryCreated),
            ("matchedAt", false) => query.OrderBy(x => x.MatchedAt), ("matchedAt", true) => query.OrderByDescending(x => x.MatchedAt),
            _ => query.OrderBy(x => x.Statement.Code)
        };
        return ordered.ThenBy(x => x.StatementId).ThenBy(x => x.LineNumber).ThenBy(x => x.Id);
    }

    private static object? ReadBankStatementLineValue(BankStatementLineReportRow row, string code) => code switch
    {
        "statementCode" => row.StatementCode, "lineNumber" => row.LineNumber, "externalId" => row.ExternalId,
        "transactionDate" => row.TransactionDate, "direction" => row.Direction.ToString(), "currencyCode" => row.CurrencyCode,
        "amount" => row.Amount, "description" => row.Description, "reference" => row.Reference, "isMatched" => row.IsMatched,
        "transactionId" => row.TransactionId, "bookEntryCreated" => row.BookEntryCreated, "matchedAt" => row.MatchedAt, _ => null
    };

    private static IQueryable<FinancialAccountTransaction> FinancialAccountTransactionQuery(TenantDbContext db, Guid tenantId) =>
        db.FinancialAccountTransactions.AsNoTracking().Where(x => x.TenantId == tenantId);

    private static IQueryable<FinancialAccountTransactionReportRow> ProjectFinancialAccountTransactions(IQueryable<FinancialAccountTransaction> query) =>
        query.Select(x => new FinancialAccountTransactionReportRow(
            x.Id, x.FinancialAccount.Code, x.FinancialAccount.Name, x.FinancialAccount.Type, x.TransactionDate, x.Direction, x.CurrencyCode,
            x.Amount, x.Description, x.Reference,
            x.CustomerCollectionId != null ? "CustomerCollection" : x.SupplierPaymentId != null ? "SupplierPayment" :
            x.TransferId != null ? "AccountTransfer" : x.BankStatementMatch != null ? "BankStatement" : "Manual",
            x.CustomerCollection != null ? x.CustomerCollection.Code : x.SupplierPayment != null ? x.SupplierPayment.Code :
            x.Transfer != null ? x.Transfer.Code : x.BankStatementMatch != null ? x.BankStatementMatch.Statement.Code : null,
            x.ReversalOfId, x.CreatedAt));

    private static async Task<IResult> RunFinancialAccountTransactionsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<FinancialAccountTransaction> query = FinancialAccountTransactionQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyFinancialAccountTransactionFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ProjectFinancialAccountTransactions(ApplyFinancialAccountTransactionSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadFinancialAccountTransactionValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "financialAccountTransactions" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(FinancialAccountTransactionColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportFinancialAccountTransactionsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<FinancialAccountTransaction> query = FinancialAccountTransactionQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyFinancialAccountTransactionFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ProjectFinancialAccountTransactions(ApplyFinancialAccountTransactionSort(query, report.SortBy, report.Descending).Take(10_000)).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(FinancialAccountTransactionColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadFinancialAccountTransactionValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"financialAccountTransactions:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static IQueryable<SupplierPayment> SupplierPaymentQuery(TenantDbContext db, Guid tenantId) =>
        db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId);

    private static IQueryable<SupplierPaymentReportRow> ProjectSupplierPayments(IQueryable<SupplierPayment> query) =>
        query.Select(x => new SupplierPaymentReportRow(
            x.Id, x.Code, x.PurchaseInvoice.Code, x.Supplier.Code, x.Supplier.Name, x.PaymentDate, x.CurrencyCode, x.Amount,
            x.PaymentMethod, x.Reference, x.Status, x.FinancialAccount == null ? null : x.FinancialAccount.Code,
            x.FinancialAccount == null ? null : x.FinancialAccount.Name, x.CreatedAt));

    private static async Task<IResult> RunSupplierPaymentsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SupplierPayment> query = SupplierPaymentQuery(db, tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.supplier-payments.read", "erp.supplier-payments", query, x => x.Status, null, null, null) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplySupplierPaymentFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ProjectSupplierPayments(ApplySupplierPaymentSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize)).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadSupplierPaymentValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "supplierPayments" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(SupplierPaymentColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSupplierPaymentsAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SupplierPayment> query = SupplierPaymentQuery(db, tenantId);
        query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId, user.FindFirstValue("role")!,
            "erp.supplier-payments.read", "erp.supplier-payments", query, x => x.Status, null, null, null) ?? query;
        foreach (var filter in report.Filters)
            if (!TryApplySupplierPaymentFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ProjectSupplierPayments(ApplySupplierPaymentSort(query, report.SortBy, report.Descending).Take(10_000)).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(SupplierPaymentColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadSupplierPaymentValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"supplierPayments:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplySupplierPaymentFilter(ref IQueryable<SupplierPayment> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "code" or "invoiceCode" or "supplierCode" or "supplierName" or "currencyCode" or "paymentMethod" or "reference" or "accountCode" or "accountName")
        {
            var nullable = filter.Field is "reference" or "accountCode" or "accountName";
            if (filter.Operator == "isNull" && nullable)
            {
                query = filter.Field switch
                {
                    "reference" => query.Where(x => x.Reference == null),
                    "accountCode" => query.Where(x => x.FinancialAccount == null),
                    _ => query.Where(x => x.FinancialAccount == null)
                };
                return true;
            }
            query = (filter.Field, filter.Operator) switch
            {
                ("code", "contains") => query.Where(x => x.Code.Contains(value)), ("code", _) => query.Where(x => x.Code == value),
                ("invoiceCode", "contains") => query.Where(x => x.PurchaseInvoice.Code.Contains(value)), ("invoiceCode", _) => query.Where(x => x.PurchaseInvoice.Code == value),
                ("supplierCode", "contains") => query.Where(x => x.Supplier.Code.Contains(value)), ("supplierCode", _) => query.Where(x => x.Supplier.Code == value),
                ("supplierName", "contains") => query.Where(x => x.Supplier.Name.Contains(value)), ("supplierName", _) => query.Where(x => x.Supplier.Name == value),
                ("currencyCode", "contains") => query.Where(x => x.CurrencyCode.Contains(value)), ("currencyCode", _) => query.Where(x => x.CurrencyCode == value),
                ("paymentMethod", "contains") => query.Where(x => x.PaymentMethod.Contains(value)), ("paymentMethod", _) => query.Where(x => x.PaymentMethod == value),
                ("reference", "contains") => query.Where(x => x.Reference != null && x.Reference.Contains(value)), ("reference", _) => query.Where(x => x.Reference == value),
                ("accountCode", "contains") => query.Where(x => x.FinancialAccount != null && x.FinancialAccount.Code.Contains(value)), ("accountCode", _) => query.Where(x => x.FinancialAccount != null && x.FinancialAccount.Code == value),
                ("accountName", "contains") => query.Where(x => x.FinancialAccount != null && x.FinancialAccount.Name.Contains(value)), _ => query.Where(x => x.FinancialAccount != null && x.FinancialAccount.Name == value)
            };
            return true;
        }
        if (filter.Field == "status")
        {
            if (!Enum.TryParse<SupplierPaymentStatus>(value, true, out var status)) { error = "Ödeme durumu geçersiz."; return false; }
            query = query.Where(x => x.Status == status);
            return true;
        }
        if (filter.Field == "paymentDate")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Ödeme tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.PaymentDate > date), "gte" => query.Where(x => x.PaymentDate >= date),
                "lt" => query.Where(x => x.PaymentDate < date), _ => query.Where(x => x.PaymentDate <= date)
            };
            return true;
        }
        if (filter.Field == "createdAt")
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.CreatedAt > date), "gte" => query.Where(x => x.CreatedAt >= date),
                "lt" => query.Where(x => x.CreatedAt < date), _ => query.Where(x => x.CreatedAt <= date)
            };
            return true;
        }
        if (filter.Field == "amount")
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Ödeme tutarı veya operatörü geçersiz."; return false; }
            query = op switch
            {
                "gt" => query.Where(x => x.Amount > amount), "gte" => query.Where(x => x.Amount >= amount),
                "lt" => query.Where(x => x.Amount < amount), "lte" => query.Where(x => x.Amount <= amount), _ => query.Where(x => x.Amount == amount)
            };
            return true;
        }
        error = "Tedarikçi ödeme filtresi geçersiz.";
        return false;
    }

    private static IQueryable<SupplierPayment> ApplySupplierPaymentSort(IQueryable<SupplierPayment> query, string field, bool descending)
    {
        IOrderedQueryable<SupplierPayment> ordered = (field, descending) switch
        {
            ("code", false) => query.OrderBy(x => x.Code), ("code", true) => query.OrderByDescending(x => x.Code),
            ("invoiceCode", false) => query.OrderBy(x => x.PurchaseInvoice.Code), ("invoiceCode", true) => query.OrderByDescending(x => x.PurchaseInvoice.Code),
            ("supplierCode", false) => query.OrderBy(x => x.Supplier.Code), ("supplierCode", true) => query.OrderByDescending(x => x.Supplier.Code),
            ("supplierName", false) => query.OrderBy(x => x.Supplier.Name), ("supplierName", true) => query.OrderByDescending(x => x.Supplier.Name),
            ("paymentDate", false) => query.OrderBy(x => x.PaymentDate), ("paymentDate", true) => query.OrderByDescending(x => x.PaymentDate),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("amount", false) => query.OrderBy(x => x.Amount), ("amount", true) => query.OrderByDescending(x => x.Amount),
            ("paymentMethod", false) => query.OrderBy(x => x.PaymentMethod), ("paymentMethod", true) => query.OrderByDescending(x => x.PaymentMethod),
            ("reference", false) => query.OrderBy(x => x.Reference), ("reference", true) => query.OrderByDescending(x => x.Reference),
            ("status", false) => query.OrderBy(x => x.Status), ("status", true) => query.OrderByDescending(x => x.Status),
            ("accountCode", false) => query.OrderBy(x => x.FinancialAccount == null ? null : x.FinancialAccount.Code), ("accountCode", true) => query.OrderByDescending(x => x.FinancialAccount == null ? null : x.FinancialAccount.Code),
            ("accountName", false) => query.OrderBy(x => x.FinancialAccount == null ? null : x.FinancialAccount.Name), ("accountName", true) => query.OrderByDescending(x => x.FinancialAccount == null ? null : x.FinancialAccount.Name),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt),
            _ => query.OrderBy(x => x.Code)
        };
        return ordered.ThenBy(x => x.Id);
    }

    private static object? ReadSupplierPaymentValue(SupplierPaymentReportRow row, string code) => code switch
    {
        "code" => row.Code, "invoiceCode" => row.InvoiceCode, "supplierCode" => row.SupplierCode, "supplierName" => row.SupplierName,
        "paymentDate" => row.PaymentDate, "currencyCode" => row.CurrencyCode, "amount" => row.Amount,
        "paymentMethod" => row.PaymentMethod, "reference" => row.Reference, "status" => row.Status.ToString(),
        "accountCode" => row.AccountCode, "accountName" => row.AccountName, "createdAt" => row.CreatedAt, _ => null
    };

    private static ReportColumn SupplierPaymentColumnByCode(string code) => SupplierPaymentColumns.First(x => x.Code == code);

    private static bool TryApplyFinancialAccountTransactionFilter(ref IQueryable<FinancialAccountTransaction> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "accountCode" or "accountName" or "currencyCode" or "description" or "reference" or "sourceCode")
        {
            if (filter.Operator == "isNull")
            {
                query = filter.Field switch
                {
                    "reference" => query.Where(x => x.Reference == null),
                    "sourceCode" => query.Where(x => x.CustomerCollection == null && x.SupplierPayment == null && x.Transfer == null && x.BankStatementMatch == null),
                    _ => query
                };
                return true;
            }
            query = (filter.Field, filter.Operator) switch
            {
                ("accountCode", "contains") => query.Where(x => x.FinancialAccount.Code.Contains(value)), ("accountCode", _) => query.Where(x => x.FinancialAccount.Code == value),
                ("accountName", "contains") => query.Where(x => x.FinancialAccount.Name.Contains(value)), ("accountName", _) => query.Where(x => x.FinancialAccount.Name == value),
                ("currencyCode", "contains") => query.Where(x => x.CurrencyCode.Contains(value)), ("currencyCode", _) => query.Where(x => x.CurrencyCode == value),
                ("description", "contains") => query.Where(x => x.Description.Contains(value)), ("description", _) => query.Where(x => x.Description == value),
                ("reference", "contains") => query.Where(x => x.Reference != null && x.Reference.Contains(value)), ("reference", _) => query.Where(x => x.Reference == value),
                ("sourceCode", "contains") => query.Where(x =>
                    (x.CustomerCollection != null && x.CustomerCollection.Code.Contains(value)) ||
                    (x.SupplierPayment != null && x.SupplierPayment.Code.Contains(value)) ||
                    (x.Transfer != null && x.Transfer.Code.Contains(value)) ||
                    (x.BankStatementMatch != null && x.BankStatementMatch.Statement.Code.Contains(value))),
                _ => query.Where(x =>
                    (x.CustomerCollection != null && x.CustomerCollection.Code == value) ||
                    (x.SupplierPayment != null && x.SupplierPayment.Code == value) ||
                    (x.Transfer != null && x.Transfer.Code == value) ||
                    (x.BankStatementMatch != null && x.BankStatementMatch.Statement.Code == value))
            };
            return true;
        }
        if (filter.Field is "accountType" or "direction" or "sourceType")
        {
            if (filter.Field == "accountType")
            {
                if (!Enum.TryParse<FinancialAccountType>(value, true, out var type)) { error = "Hesap türü geçersiz."; return false; }
                query = query.Where(x => x.FinancialAccount.Type == type);
            }
            else if (filter.Field == "direction")
            {
                if (!Enum.TryParse<FinancialDirection>(value, true, out var direction)) { error = "Hareket yönü geçersiz."; return false; }
                query = query.Where(x => x.Direction == direction);
            }
            else
            {
                if (value is not ("CustomerCollection" or "SupplierPayment" or "AccountTransfer" or "BankStatement" or "Manual")) { error = "Hareket kaynak türü geçersiz."; return false; }
                query = value switch
                {
                    "CustomerCollection" => query.Where(x => x.CustomerCollectionId != null),
                    "SupplierPayment" => query.Where(x => x.CustomerCollectionId == null && x.SupplierPaymentId != null),
                    "AccountTransfer" => query.Where(x => x.CustomerCollectionId == null && x.SupplierPaymentId == null && x.TransferId != null),
                    "BankStatement" => query.Where(x => x.CustomerCollectionId == null && x.SupplierPaymentId == null && x.TransferId == null && x.BankStatementMatch != null),
                    _ => query.Where(x => x.CustomerCollectionId == null && x.SupplierPaymentId == null && x.TransferId == null && x.BankStatementMatch == null)
                };
            }
            return true;
        }
        if (filter.Field == "reversalOfId")
        {
            if (filter.Operator == "isNull") { query = query.Where(x => x.ReversalOfId == null); return true; }
            if (!Guid.TryParse(value, out var reversalId)) { error = "Ters kayıt kimliği GUID olmalıdır."; return false; }
            query = query.Where(x => x.ReversalOfId == reversalId);
            return true;
        }
        if (filter.Field == "transactionDate")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Hareket tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.TransactionDate > date), "gte" => query.Where(x => x.TransactionDate >= date),
                "lt" => query.Where(x => x.TransactionDate < date), "lte" => query.Where(x => x.TransactionDate <= date), _ => query.Where(x => x.TransactionDate == date)
            };
            return true;
        }
        if (filter.Field == "createdAt")
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.CreatedAt > date), "gte" => query.Where(x => x.CreatedAt >= date),
                "lt" => query.Where(x => x.CreatedAt < date), "lte" => query.Where(x => x.CreatedAt <= date), _ => query.Where(x => x.CreatedAt == date)
            };
            return true;
        }
        if (filter.Field == "amount")
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Tutar filtresi sayısal olmalıdır."; return false; }
            query = filter.Operator switch
            {
                "gt" => query.Where(x => x.Amount > amount), "gte" => query.Where(x => x.Amount >= amount),
                "lt" => query.Where(x => x.Amount < amount), "lte" => query.Where(x => x.Amount <= amount), _ => query.Where(x => x.Amount == amount)
            };
            return true;
        }
        error = "Kasa-banka hareketi filtre alanı geçersiz.";
        return false;
    }

    private static IQueryable<FinancialAccountTransaction> ApplyFinancialAccountTransactionSort(IQueryable<FinancialAccountTransaction> query, string field, bool descending)
    {
        IOrderedQueryable<FinancialAccountTransaction> ordered = (field, descending) switch
        {
            ("accountCode", false) => query.OrderBy(x => x.FinancialAccount.Code), ("accountCode", true) => query.OrderByDescending(x => x.FinancialAccount.Code),
            ("accountName", false) => query.OrderBy(x => x.FinancialAccount.Name), ("accountName", true) => query.OrderByDescending(x => x.FinancialAccount.Name),
            ("accountType", false) => query.OrderBy(x => x.FinancialAccount.Type), ("accountType", true) => query.OrderByDescending(x => x.FinancialAccount.Type),
            ("transactionDate", false) => query.OrderBy(x => x.TransactionDate), ("transactionDate", true) => query.OrderByDescending(x => x.TransactionDate),
            ("direction", false) => query.OrderBy(x => x.Direction), ("direction", true) => query.OrderByDescending(x => x.Direction),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("amount", false) => query.OrderBy(x => x.Amount), ("amount", true) => query.OrderByDescending(x => x.Amount),
            ("sourceType", false) => query.OrderBy(x => x.CustomerCollectionId != null ? "CustomerCollection" : x.SupplierPaymentId != null ? "SupplierPayment" : x.TransferId != null ? "AccountTransfer" : x.BankStatementMatch != null ? "BankStatement" : "Manual"),
            ("sourceType", true) => query.OrderByDescending(x => x.CustomerCollectionId != null ? "CustomerCollection" : x.SupplierPaymentId != null ? "SupplierPayment" : x.TransferId != null ? "AccountTransfer" : x.BankStatementMatch != null ? "BankStatement" : "Manual"),
            ("sourceCode", false) => query.OrderBy(x => x.CustomerCollection != null ? x.CustomerCollection.Code : x.SupplierPayment != null ? x.SupplierPayment.Code : x.Transfer != null ? x.Transfer.Code : x.BankStatementMatch != null ? x.BankStatementMatch.Statement.Code : null),
            ("sourceCode", true) => query.OrderByDescending(x => x.CustomerCollection != null ? x.CustomerCollection.Code : x.SupplierPayment != null ? x.SupplierPayment.Code : x.Transfer != null ? x.Transfer.Code : x.BankStatementMatch != null ? x.BankStatementMatch.Statement.Code : null),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt),
            ("reversalOfId", false) => query.OrderBy(x => x.ReversalOfId), ("reversalOfId", true) => query.OrderByDescending(x => x.ReversalOfId),
            ("reference", false) => query.OrderBy(x => x.Reference), ("reference", true) => query.OrderByDescending(x => x.Reference),
            ("description", false) => query.OrderBy(x => x.Description), ("description", true) => query.OrderByDescending(x => x.Description),
            _ => query.OrderBy(x => x.Id)
        };
        return ordered.ThenBy(x => x.Id);
    }

    private static object? ReadFinancialAccountTransactionValue(FinancialAccountTransactionReportRow row, string code) => code switch
    {
        "accountCode" => row.AccountCode, "accountName" => row.AccountName, "accountType" => row.AccountType.ToString(),
        "transactionDate" => row.TransactionDate, "direction" => row.Direction.ToString(), "currencyCode" => row.CurrencyCode,
        "amount" => row.Amount, "description" => row.Description, "reference" => row.Reference, "sourceType" => row.SourceType,
        "sourceCode" => row.SourceCode, "reversalOfId" => row.ReversalOfId, "createdAt" => row.CreatedAt, _ => null
    };

    private static IQueryable<FinancialAccountTransferReportRow> FinancialAccountTransferQuery(TenantDbContext db, Guid tenantId) =>
        from transfer in db.FinancialAccountTransfers.AsNoTracking()
        join fromAccount in db.FinancialAccounts.AsNoTracking() on new { transfer.TenantId, Id = transfer.FromAccountId } equals new { fromAccount.TenantId, Id = fromAccount.Id }
        join toAccount in db.FinancialAccounts.AsNoTracking() on new { transfer.TenantId, Id = transfer.ToAccountId } equals new { toAccount.TenantId, Id = toAccount.Id }
        where transfer.TenantId == tenantId && fromAccount.TenantId == tenantId && toAccount.TenantId == tenantId
        select new FinancialAccountTransferReportRow(transfer.Id, transfer.Code, fromAccount.Code, fromAccount.Name, toAccount.Code,
            toAccount.Name, transfer.TransferDate, transfer.CurrencyCode, transfer.Amount, transfer.ToCurrencyCode,
            transfer.DestinationAmount, transfer.ExchangeRate, transfer.Status, transfer.Reference, transfer.Description, transfer.CreatedAt);

    private static async Task<IResult> RunFinancialAccountTransfersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = FinancialAccountTransferQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyFinancialAccountTransferFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyFinancialAccountTransferSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadFinancialAccountTransferValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "financialAccountTransfers" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(FinancialAccountTransferColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportFinancialAccountTransfersAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = FinancialAccountTransferQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyFinancialAccountTransferFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyFinancialAccountTransferSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(FinancialAccountTransferColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadFinancialAccountTransferValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"financialAccountTransfers:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyFinancialAccountTransferFilter(ref IQueryable<FinancialAccountTransferReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "code" or "fromAccountCode" or "fromAccountName" or "toAccountCode" or "toAccountName" or "currencyCode" or "toCurrencyCode" or "reference" or "description")
        {
            query = (filter.Field, filter.Operator) switch
            {
                ("code", "contains") => query.Where(x => x.Code.Contains(value)), ("code", _) => query.Where(x => x.Code == value),
                ("fromAccountCode", "contains") => query.Where(x => x.FromAccountCode.Contains(value)), ("fromAccountCode", _) => query.Where(x => x.FromAccountCode == value),
                ("fromAccountName", "contains") => query.Where(x => x.FromAccountName.Contains(value)), ("fromAccountName", _) => query.Where(x => x.FromAccountName == value),
                ("toAccountCode", "contains") => query.Where(x => x.ToAccountCode.Contains(value)), ("toAccountCode", _) => query.Where(x => x.ToAccountCode == value),
                ("toAccountName", "contains") => query.Where(x => x.ToAccountName.Contains(value)), ("toAccountName", _) => query.Where(x => x.ToAccountName == value),
                ("currencyCode", "contains") => query.Where(x => x.CurrencyCode.Contains(value)), ("currencyCode", _) => query.Where(x => x.CurrencyCode == value),
                ("toCurrencyCode", "contains") => query.Where(x => x.ToCurrencyCode.Contains(value)), ("toCurrencyCode", _) => query.Where(x => x.ToCurrencyCode == value),
                ("reference", "isNull") => query.Where(x => x.Reference == null), ("reference", "contains") => query.Where(x => x.Reference != null && x.Reference.Contains(value)),
                ("reference", _) => query.Where(x => x.Reference == value), ("description", "contains") => query.Where(x => x.Description.Contains(value)),
                _ => query.Where(x => x.Description == value)
            };
            return true;
        }
        if (filter.Field == "status")
        {
            if (!Enum.TryParse<FinancialTransferStatus>(value, true, out var status)) { error = "Transfer durumu geçersiz."; return false; }
            query = query.Where(x => x.Status == status); return true;
        }
        if (filter.Field == "transferDate" || filter.Field == "createdAt")
        {
            if (filter.Field == "transferDate")
            {
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Transfer tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.TransferDate > date), "gte" => query.Where(x => x.TransferDate >= date), "lt" => query.Where(x => x.TransferDate < date), "lte" => query.Where(x => x.TransferDate <= date), _ => query.Where(x => x.TransferDate == date) };
            }
            else
            {
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > date), "gte" => query.Where(x => x.CreatedAt >= date), "lt" => query.Where(x => x.CreatedAt < date), "lte" => query.Where(x => x.CreatedAt <= date), _ => query.Where(x => x.CreatedAt == date) };
            }
            return true;
        }
        if (filter.Field is "amount" or "destinationAmount" or "exchangeRate")
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Transfer tutarı/kuru veya operatörü geçersiz."; return false; }
            query = (filter.Field, op) switch
            {
                ("amount", "gt") => query.Where(x => x.Amount > number), ("amount", "gte") => query.Where(x => x.Amount >= number), ("amount", "lt") => query.Where(x => x.Amount < number), ("amount", "lte") => query.Where(x => x.Amount <= number), ("amount", _) => query.Where(x => x.Amount == number),
                ("destinationAmount", "gt") => query.Where(x => x.DestinationAmount > number), ("destinationAmount", "gte") => query.Where(x => x.DestinationAmount >= number), ("destinationAmount", "lt") => query.Where(x => x.DestinationAmount < number), ("destinationAmount", "lte") => query.Where(x => x.DestinationAmount <= number), ("destinationAmount", _) => query.Where(x => x.DestinationAmount == number),
                (_, "gt") => query.Where(x => x.ExchangeRate > number), (_, "gte") => query.Where(x => x.ExchangeRate >= number), (_, "lt") => query.Where(x => x.ExchangeRate < number), (_, "lte") => query.Where(x => x.ExchangeRate <= number), _ => query.Where(x => x.ExchangeRate == number)
            };
            return true;
        }
        error = "Kasa-banka transfer filtresi geçersiz."; return false;
    }

    private static IQueryable<FinancialAccountTransferReportRow> ApplyFinancialAccountTransferSort(IQueryable<FinancialAccountTransferReportRow> query, string field, bool descending)
    {
        IOrderedQueryable<FinancialAccountTransferReportRow> ordered = (field, descending) switch
        {
            ("code", false) => query.OrderBy(x => x.Code), ("code", true) => query.OrderByDescending(x => x.Code),
            ("fromAccountCode", false) => query.OrderBy(x => x.FromAccountCode), ("fromAccountCode", true) => query.OrderByDescending(x => x.FromAccountCode),
            ("fromAccountName", false) => query.OrderBy(x => x.FromAccountName), ("fromAccountName", true) => query.OrderByDescending(x => x.FromAccountName),
            ("toAccountCode", false) => query.OrderBy(x => x.ToAccountCode), ("toAccountCode", true) => query.OrderByDescending(x => x.ToAccountCode),
            ("toAccountName", false) => query.OrderBy(x => x.ToAccountName), ("toAccountName", true) => query.OrderByDescending(x => x.ToAccountName),
            ("transferDate", false) => query.OrderBy(x => x.TransferDate), ("transferDate", true) => query.OrderByDescending(x => x.TransferDate),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("amount", false) => query.OrderBy(x => x.Amount), ("amount", true) => query.OrderByDescending(x => x.Amount),
            ("toCurrencyCode", false) => query.OrderBy(x => x.ToCurrencyCode), ("toCurrencyCode", true) => query.OrderByDescending(x => x.ToCurrencyCode),
            ("destinationAmount", false) => query.OrderBy(x => x.DestinationAmount), ("destinationAmount", true) => query.OrderByDescending(x => x.DestinationAmount),
            ("exchangeRate", false) => query.OrderBy(x => x.ExchangeRate), ("exchangeRate", true) => query.OrderByDescending(x => x.ExchangeRate),
            ("status", false) => query.OrderBy(x => x.Status), ("status", true) => query.OrderByDescending(x => x.Status),
            ("reference", false) => query.OrderBy(x => x.Reference), ("reference", true) => query.OrderByDescending(x => x.Reference),
            ("description", false) => query.OrderBy(x => x.Description), ("description", true) => query.OrderByDescending(x => x.Description),
            ("createdAt", false) => query.OrderBy(x => x.CreatedAt), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt),
            _ => query.OrderBy(x => x.Code)
        };
        return ordered.ThenBy(x => x.Id);
    }

    private static object? ReadFinancialAccountTransferValue(FinancialAccountTransferReportRow row, string code) => code switch
    {
        "code" => row.Code, "fromAccountCode" => row.FromAccountCode, "fromAccountName" => row.FromAccountName,
        "toAccountCode" => row.ToAccountCode, "toAccountName" => row.ToAccountName, "transferDate" => row.TransferDate,
        "currencyCode" => row.CurrencyCode, "amount" => row.Amount, "toCurrencyCode" => row.ToCurrencyCode,
        "destinationAmount" => row.DestinationAmount, "exchangeRate" => row.ExchangeRate, "status" => row.Status.ToString(),
        "reference" => row.Reference, "description" => row.Description, "createdAt" => row.CreatedAt, _ => null
    };

    private static ReportColumn FinancialAccountTransferColumnByCode(string code) => FinancialAccountTransferColumns.First(x => x.Code == code);

    private static IQueryable<JournalEntryLineReportRow> JournalEntryLineQuery(TenantDbContext db, Guid tenantId) =>
        from line in db.JournalEntryLines.AsNoTracking()
        join entry in db.JournalEntries.AsNoTracking() on new { line.TenantId, Id = line.JournalEntryId } equals new { entry.TenantId, Id = entry.Id }
        join account in db.LedgerAccounts.AsNoTracking() on new { line.TenantId, Id = line.AccountId } equals new { account.TenantId, Id = account.Id }
        where line.TenantId == tenantId && entry.TenantId == tenantId && account.TenantId == tenantId
        let debitTotal = db.JournalEntryLines.Where(x => x.TenantId == tenantId && x.JournalEntryId == line.JournalEntryId).Sum(x => (decimal?)x.Debit) ?? 0m
        let creditTotal = db.JournalEntryLines.Where(x => x.TenantId == tenantId && x.JournalEntryId == line.JournalEntryId).Sum(x => (decimal?)x.Credit) ?? 0m
        select new JournalEntryLineReportRow(line.Id, entry.Id, entry.Code, entry.EntryDate, entry.Description, entry.SourceType,
            account.Code, account.Name, line.LineNumber, line.Description, line.Debit, line.Credit, debitTotal, creditTotal,
            debitTotal == creditTotal, entry.CreatedAt);

    private static async Task<IResult> RunJournalEntryLinesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = JournalEntryLineQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyJournalEntryLineFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyJournalEntryLineSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadJournalEntryLineValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "journalEntryLines" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(JournalEntryLineColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportJournalEntryLinesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = JournalEntryLineQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyJournalEntryLineFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyJournalEntryLineSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(JournalEntryLineColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadJournalEntryLineValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"journalEntryLines:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyJournalEntryLineFilter(ref IQueryable<JournalEntryLineReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "entryCode" or "entryDescription" or "sourceType" or "accountCode" or "accountName" or "lineDescription")
        {
            query = (filter.Field, filter.Operator) switch
            {
                ("entryCode", "contains") => query.Where(x => x.EntryCode.Contains(value)), ("entryCode", _) => query.Where(x => x.EntryCode == value),
                ("entryDescription", "contains") => query.Where(x => x.EntryDescription.Contains(value)), ("entryDescription", _) => query.Where(x => x.EntryDescription == value),
                ("sourceType", "contains") => query.Where(x => x.SourceType.Contains(value)), ("sourceType", _) => query.Where(x => x.SourceType == value),
                ("accountCode", "contains") => query.Where(x => x.AccountCode.Contains(value)), ("accountCode", _) => query.Where(x => x.AccountCode == value),
                ("accountName", "contains") => query.Where(x => x.AccountName.Contains(value)), ("accountName", _) => query.Where(x => x.AccountName == value),
                ("lineDescription", "contains") => query.Where(x => x.LineDescription.Contains(value)), _ => query.Where(x => x.LineDescription == value)
            };
            return true;
        }
        if (filter.Field == "isBalanced")
        {
            if (!bool.TryParse(value, out var balanced)) { error = "Dengeli filtresi true veya false olmalıdır."; return false; }
            query = query.Where(x => x.IsBalanced == balanced); return true;
        }
        if (filter.Field is "entryDate" or "createdAt")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Fiş tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = filter.Operator switch { "gt" => query.Where(x => x.EntryDate > date), "gte" => query.Where(x => x.EntryDate >= date), "lt" => query.Where(x => x.EntryDate < date), "lte" => query.Where(x => x.EntryDate <= date), _ => query.Where(x => x.EntryDate == date) };
            return true;
        }
        if (filter.Field is "debit" or "credit" or "entryDebitTotal" or "entryCreditTotal")
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Borç/alacak tutarı veya operatörü geçersiz."; return false; }
            query = (filter.Field, op) switch
            {
                ("debit", "gt") => query.Where(x => x.Debit > amount), ("debit", "gte") => query.Where(x => x.Debit >= amount), ("debit", "lt") => query.Where(x => x.Debit < amount), ("debit", "lte") => query.Where(x => x.Debit <= amount), ("debit", _) => query.Where(x => x.Debit == amount),
                ("credit", "gt") => query.Where(x => x.Credit > amount), ("credit", "gte") => query.Where(x => x.Credit >= amount), ("credit", "lt") => query.Where(x => x.Credit < amount), ("credit", "lte") => query.Where(x => x.Credit <= amount), ("credit", _) => query.Where(x => x.Credit == amount),
                ("entryDebitTotal", "gt") => query.Where(x => x.EntryDebitTotal > amount), ("entryDebitTotal", "gte") => query.Where(x => x.EntryDebitTotal >= amount), ("entryDebitTotal", "lt") => query.Where(x => x.EntryDebitTotal < amount), ("entryDebitTotal", "lte") => query.Where(x => x.EntryDebitTotal <= amount), ("entryDebitTotal", _) => query.Where(x => x.EntryDebitTotal == amount),
                ("entryCreditTotal", "gt") => query.Where(x => x.EntryCreditTotal > amount), ("entryCreditTotal", "gte") => query.Where(x => x.EntryCreditTotal >= amount), ("entryCreditTotal", "lt") => query.Where(x => x.EntryCreditTotal < amount), ("entryCreditTotal", "lte") => query.Where(x => x.EntryCreditTotal <= amount), _ => query.Where(x => x.EntryCreditTotal == amount)
            };
            return true;
        }
        if (filter.Field == "lineNumber")
        {
            if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Satır numarası veya operatörü geçersiz."; return false; }
            query = op switch { "gt" => query.Where(x => x.LineNumber > number), "gte" => query.Where(x => x.LineNumber >= number), "lt" => query.Where(x => x.LineNumber < number), "lte" => query.Where(x => x.LineNumber <= number), _ => query.Where(x => x.LineNumber == number) };
            return true;
        }
        error = "Muhasebe fiş satırı filtresi geçersiz."; return false;
    }

    private static IQueryable<JournalEntryLineReportRow> ApplyJournalEntryLineSort(IQueryable<JournalEntryLineReportRow> query, string field, bool descending)
    {
        IOrderedQueryable<JournalEntryLineReportRow> ordered = (field, descending) switch
        {
            ("entryCode", false) => query.OrderBy(x => x.EntryCode), ("entryCode", true) => query.OrderByDescending(x => x.EntryCode),
            ("entryDate", false) => query.OrderBy(x => x.EntryDate), ("entryDate", true) => query.OrderByDescending(x => x.EntryDate),
            ("entryDescription", false) => query.OrderBy(x => x.EntryDescription), ("entryDescription", true) => query.OrderByDescending(x => x.EntryDescription),
            ("sourceType", false) => query.OrderBy(x => x.SourceType), ("sourceType", true) => query.OrderByDescending(x => x.SourceType),
            ("accountCode", false) => query.OrderBy(x => x.AccountCode), ("accountCode", true) => query.OrderByDescending(x => x.AccountCode),
            ("accountName", false) => query.OrderBy(x => x.AccountName), ("accountName", true) => query.OrderByDescending(x => x.AccountName),
            ("lineNumber", false) => query.OrderBy(x => x.LineNumber), ("lineNumber", true) => query.OrderByDescending(x => x.LineNumber),
            ("lineDescription", false) => query.OrderBy(x => x.LineDescription), ("lineDescription", true) => query.OrderByDescending(x => x.LineDescription),
            ("debit", false) => query.OrderBy(x => x.Debit), ("debit", true) => query.OrderByDescending(x => x.Debit),
            ("credit", false) => query.OrderBy(x => x.Credit), ("credit", true) => query.OrderByDescending(x => x.Credit),
            ("entryDebitTotal", false) => query.OrderBy(x => x.EntryDebitTotal), ("entryDebitTotal", true) => query.OrderByDescending(x => x.EntryDebitTotal),
            ("entryCreditTotal", false) => query.OrderBy(x => x.EntryCreditTotal), ("entryCreditTotal", true) => query.OrderByDescending(x => x.EntryCreditTotal),
            ("isBalanced", false) => query.OrderBy(x => x.IsBalanced), ("isBalanced", true) => query.OrderByDescending(x => x.IsBalanced),
            _ => query.OrderBy(x => x.EntryCode)
        };
        return ordered.ThenBy(x => x.EntryId).ThenBy(x => x.LineNumber).ThenBy(x => x.Id);
    }

    private static object? ReadJournalEntryLineValue(JournalEntryLineReportRow row, string code) => code switch
    {
        "entryCode" => row.EntryCode, "entryDate" => row.EntryDate, "entryDescription" => row.EntryDescription,
        "sourceType" => row.SourceType, "accountCode" => row.AccountCode, "accountName" => row.AccountName,
        "lineNumber" => row.LineNumber, "lineDescription" => row.LineDescription, "debit" => row.Debit, "credit" => row.Credit,
        "entryDebitTotal" => row.EntryDebitTotal, "entryCreditTotal" => row.EntryCreditTotal, "isBalanced" => row.IsBalanced, _ => null
    };

    private static ReportColumn JournalEntryLineColumnByCode(string code) => JournalEntryLineColumns.First(x => x.Code == code);

    private static IQueryable<FxRevaluationLineReportRow> FxRevaluationLineQuery(TenantDbContext db, Guid tenantId) =>
        from line in db.FxRevaluationVoucherLines.AsNoTracking()
        join voucher in db.FxRevaluationVouchers.AsNoTracking() on new { line.TenantId, Id = line.VoucherId } equals new { voucher.TenantId, Id = voucher.Id }
        where line.TenantId == tenantId && voucher.TenantId == tenantId
        select new FxRevaluationLineReportRow(line.Id, voucher.Id, voucher.Code, voucher.AsOfDate, voucher.BaseCurrencyCode,
            line.Direction, line.InvoiceCode, line.CounterpartyName, line.CurrencyCode, line.OutstandingAmount,
            line.InvoiceDateRate, line.ClosingRate, line.PreviousAdjustmentBase, line.TargetAdjustmentBase,
            line.AdjustmentBase, line.DebitAccount, line.CreditAccount, line.DebitBaseAmount, line.CreditBaseAmount, voucher.CreatedAt);

    private static async Task<IResult> RunFxRevaluationLinesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = FxRevaluationLineQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyFxRevaluationLineFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        var rows = await ApplyFxRevaluationLineSort(query, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var resultRows = rows.Select(row => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadFxRevaluationLineValue(row, code), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "fxRevaluationLines" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(FxRevaluationLineColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportFxRevaluationLinesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        var query = FxRevaluationLineQuery(db, tenantId);
        foreach (var filter in report.Filters)
            if (!TryApplyFxRevaluationLineFilter(ref query, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
        var rows = await ApplyFxRevaluationLineSort(query, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
        var csv = new StringBuilder();
        csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(FxRevaluationLineColumnByCode(code).Label))));
        foreach (var row in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadFxRevaluationLineValue(row, code)))));
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"fxRevaluationLines:{rows.Count}" });
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static bool TryApplyFxRevaluationLineFilter(ref IQueryable<FxRevaluationLineReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field == "direction")
        {
            if (!Enum.TryParse<FxRevaluationDirection>(value, true, out var direction)) { error = "Cari yönü Receivable veya Payable olmalıdır."; return false; }
            query = query.Where(x => x.Direction == direction); return true;
        }
        if (filter.Field is "voucherCode" or "baseCurrencyCode" or "invoiceCode" or "counterpartyName" or "currencyCode" or "debitAccount" or "creditAccount")
        {
            query = (filter.Field, filter.Operator) switch
            {
                ("voucherCode", "contains") => query.Where(x => x.VoucherCode.Contains(value)), ("voucherCode", _) => query.Where(x => x.VoucherCode == value),
                ("baseCurrencyCode", "contains") => query.Where(x => x.BaseCurrencyCode.Contains(value)), ("baseCurrencyCode", _) => query.Where(x => x.BaseCurrencyCode == value),
                ("invoiceCode", "contains") => query.Where(x => x.InvoiceCode.Contains(value)), ("invoiceCode", _) => query.Where(x => x.InvoiceCode == value),
                ("counterpartyName", "contains") => query.Where(x => x.CounterpartyName.Contains(value)), ("counterpartyName", _) => query.Where(x => x.CounterpartyName == value),
                ("currencyCode", "contains") => query.Where(x => x.CurrencyCode.Contains(value)), ("currencyCode", _) => query.Where(x => x.CurrencyCode == value),
                ("debitAccount", "contains") => query.Where(x => x.DebitAccount.Contains(value)), ("debitAccount", _) => query.Where(x => x.DebitAccount == value),
                ("creditAccount", "contains") => query.Where(x => x.CreditAccount.Contains(value)), _ => query.Where(x => x.CreditAccount == value)
            };
            return true;
        }
        if (filter.Field == "asOfDate")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Değerleme tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = filter.Operator switch { "gt" => query.Where(x => x.AsOfDate > date), "gte" => query.Where(x => x.AsOfDate >= date), "lt" => query.Where(x => x.AsOfDate < date), _ => query.Where(x => x.AsOfDate <= date) };
            return true;
        }
        if (filter.Field is "outstandingAmount" or "invoiceDateRate" or "closingRate" or "previousAdjustmentBase" or "targetAdjustmentBase" or "adjustmentBase" or "debitBaseAmount" or "creditBaseAmount")
        {
            if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Değerleme tutarı/kuru veya operatörü geçersiz."; return false; }
            query = (filter.Field, op) switch
            {
                ("outstandingAmount", "gt") => query.Where(x => x.OutstandingAmount > amount), ("outstandingAmount", "gte") => query.Where(x => x.OutstandingAmount >= amount), ("outstandingAmount", "lt") => query.Where(x => x.OutstandingAmount < amount), ("outstandingAmount", "lte") => query.Where(x => x.OutstandingAmount <= amount), ("outstandingAmount", _) => query.Where(x => x.OutstandingAmount == amount),
                ("invoiceDateRate", "gt") => query.Where(x => x.InvoiceDateRate > amount), ("invoiceDateRate", "gte") => query.Where(x => x.InvoiceDateRate >= amount), ("invoiceDateRate", "lt") => query.Where(x => x.InvoiceDateRate < amount), ("invoiceDateRate", "lte") => query.Where(x => x.InvoiceDateRate <= amount), ("invoiceDateRate", _) => query.Where(x => x.InvoiceDateRate == amount),
                ("closingRate", "gt") => query.Where(x => x.ClosingRate > amount), ("closingRate", "gte") => query.Where(x => x.ClosingRate >= amount), ("closingRate", "lt") => query.Where(x => x.ClosingRate < amount), ("closingRate", "lte") => query.Where(x => x.ClosingRate <= amount), ("closingRate", _) => query.Where(x => x.ClosingRate == amount),
                ("previousAdjustmentBase", "gt") => query.Where(x => x.PreviousAdjustmentBase > amount), ("previousAdjustmentBase", "gte") => query.Where(x => x.PreviousAdjustmentBase >= amount), ("previousAdjustmentBase", "lt") => query.Where(x => x.PreviousAdjustmentBase < amount), ("previousAdjustmentBase", "lte") => query.Where(x => x.PreviousAdjustmentBase <= amount), ("previousAdjustmentBase", _) => query.Where(x => x.PreviousAdjustmentBase == amount),
                ("targetAdjustmentBase", "gt") => query.Where(x => x.TargetAdjustmentBase > amount), ("targetAdjustmentBase", "gte") => query.Where(x => x.TargetAdjustmentBase >= amount), ("targetAdjustmentBase", "lt") => query.Where(x => x.TargetAdjustmentBase < amount), ("targetAdjustmentBase", "lte") => query.Where(x => x.TargetAdjustmentBase <= amount), ("targetAdjustmentBase", _) => query.Where(x => x.TargetAdjustmentBase == amount),
                ("adjustmentBase", "gt") => query.Where(x => x.AdjustmentBase > amount), ("adjustmentBase", "gte") => query.Where(x => x.AdjustmentBase >= amount), ("adjustmentBase", "lt") => query.Where(x => x.AdjustmentBase < amount), ("adjustmentBase", "lte") => query.Where(x => x.AdjustmentBase <= amount), ("adjustmentBase", _) => query.Where(x => x.AdjustmentBase == amount),
                ("debitBaseAmount", "gt") => query.Where(x => x.DebitBaseAmount > amount), ("debitBaseAmount", "gte") => query.Where(x => x.DebitBaseAmount >= amount), ("debitBaseAmount", "lt") => query.Where(x => x.DebitBaseAmount < amount), ("debitBaseAmount", "lte") => query.Where(x => x.DebitBaseAmount <= amount), ("debitBaseAmount", _) => query.Where(x => x.DebitBaseAmount == amount),
                ("creditBaseAmount", "gt") => query.Where(x => x.CreditBaseAmount > amount), ("creditBaseAmount", "gte") => query.Where(x => x.CreditBaseAmount >= amount), ("creditBaseAmount", "lt") => query.Where(x => x.CreditBaseAmount < amount), ("creditBaseAmount", "lte") => query.Where(x => x.CreditBaseAmount <= amount), _ => query.Where(x => x.CreditBaseAmount == amount)
            };
            return true;
        }
        error = "Döviz değerleme satırı filtresi geçersiz."; return false;
    }

    private static IQueryable<FxRevaluationLineReportRow> ApplyFxRevaluationLineSort(IQueryable<FxRevaluationLineReportRow> query, string field, bool descending)
    {
        IOrderedQueryable<FxRevaluationLineReportRow> ordered = (field, descending) switch
        {
            ("voucherCode", false) => query.OrderBy(x => x.VoucherCode), ("voucherCode", true) => query.OrderByDescending(x => x.VoucherCode),
            ("asOfDate", false) => query.OrderBy(x => x.AsOfDate), ("asOfDate", true) => query.OrderByDescending(x => x.AsOfDate),
            ("baseCurrencyCode", false) => query.OrderBy(x => x.BaseCurrencyCode), ("baseCurrencyCode", true) => query.OrderByDescending(x => x.BaseCurrencyCode),
            ("direction", false) => query.OrderBy(x => x.Direction), ("direction", true) => query.OrderByDescending(x => x.Direction),
            ("invoiceCode", false) => query.OrderBy(x => x.InvoiceCode), ("invoiceCode", true) => query.OrderByDescending(x => x.InvoiceCode),
            ("counterpartyName", false) => query.OrderBy(x => x.CounterpartyName), ("counterpartyName", true) => query.OrderByDescending(x => x.CounterpartyName),
            ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode),
            ("outstandingAmount", false) => query.OrderBy(x => x.OutstandingAmount), ("outstandingAmount", true) => query.OrderByDescending(x => x.OutstandingAmount),
            ("invoiceDateRate", false) => query.OrderBy(x => x.InvoiceDateRate), ("invoiceDateRate", true) => query.OrderByDescending(x => x.InvoiceDateRate),
            ("closingRate", false) => query.OrderBy(x => x.ClosingRate), ("closingRate", true) => query.OrderByDescending(x => x.ClosingRate),
            ("previousAdjustmentBase", false) => query.OrderBy(x => x.PreviousAdjustmentBase), ("previousAdjustmentBase", true) => query.OrderByDescending(x => x.PreviousAdjustmentBase),
            ("targetAdjustmentBase", false) => query.OrderBy(x => x.TargetAdjustmentBase), ("targetAdjustmentBase", true) => query.OrderByDescending(x => x.TargetAdjustmentBase),
            ("adjustmentBase", false) => query.OrderBy(x => x.AdjustmentBase), ("adjustmentBase", true) => query.OrderByDescending(x => x.AdjustmentBase),
            ("debitAccount", false) => query.OrderBy(x => x.DebitAccount), ("debitAccount", true) => query.OrderByDescending(x => x.DebitAccount),
            ("creditAccount", false) => query.OrderBy(x => x.CreditAccount), ("creditAccount", true) => query.OrderByDescending(x => x.CreditAccount),
            ("debitBaseAmount", false) => query.OrderBy(x => x.DebitBaseAmount), ("debitBaseAmount", true) => query.OrderByDescending(x => x.DebitBaseAmount),
            ("creditBaseAmount", false) => query.OrderBy(x => x.CreditBaseAmount), ("creditBaseAmount", true) => query.OrderByDescending(x => x.CreditBaseAmount),
            _ => query.OrderBy(x => x.VoucherCode)
        };
        return ordered.ThenBy(x => x.VoucherId).ThenBy(x => x.InvoiceCode).ThenBy(x => x.Id);
    }

    private static object? ReadFxRevaluationLineValue(FxRevaluationLineReportRow row, string code) => code switch
    {
        "voucherCode" => row.VoucherCode, "asOfDate" => row.AsOfDate, "baseCurrencyCode" => row.BaseCurrencyCode,
        "direction" => row.Direction.ToString(), "invoiceCode" => row.InvoiceCode, "counterpartyName" => row.CounterpartyName,
        "currencyCode" => row.CurrencyCode, "outstandingAmount" => row.OutstandingAmount, "invoiceDateRate" => row.InvoiceDateRate,
        "closingRate" => row.ClosingRate, "previousAdjustmentBase" => row.PreviousAdjustmentBase,
        "targetAdjustmentBase" => row.TargetAdjustmentBase, "adjustmentBase" => row.AdjustmentBase,
        "debitAccount" => row.DebitAccount, "creditAccount" => row.CreditAccount,
        "debitBaseAmount" => row.DebitBaseAmount, "creditBaseAmount" => row.CreditBaseAmount, _ => null
    };

    private static ReportColumn FxRevaluationLineColumnByCode(string code) => FxRevaluationLineColumns.First(x => x.Code == code);

    private static async Task<IResult> RunSalesInvoicesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesInvoice> query = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplyInvoiceFilter(ref query, db, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });
        var totalCount = await query.CountAsync(ct);
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateInvoicesAsync(query, report.GroupByFields, report.Aggregate!, report.Descending,
                (report.Page - 1) * report.PageSize, report.PageSize, ct);
            var groupBy = string.Join(',', report.GroupByFields);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = $"salesInvoices:group:{groupBy}:{report.Aggregate}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new ReportResult(report.Source, [], [], report.Page, report.PageSize, totalCount,
                report.GroupByFields.Count == 1 ? report.GroupByFields[0] : groupBy, report.Aggregate, grouped.Rows, grouped.TotalGroups, report.GroupByFields));
        }
        var rows = await ApplyInvoiceSort(query, db, report.SortBy, report.Descending)
            .Skip((report.Page - 1) * report.PageSize).Take(report.PageSize).ToListAsync(ct);
        var invoiceIds = rows.Select(x => x.Id).ToArray();
        var paidByInvoice = await GetPostedCollectionTotalsAsync(db, tenantId, invoiceIds, ct);
        var returnedByInvoice = await GetPostedSalesReturnTotalsAsync(db, tenantId, invoiceIds, ct);
        var resultRows = rows.Select(invoice => (IReadOnlyDictionary<string, object?>)report.Columns.ToDictionary(
            code => code, code => ReadInvoiceValue(invoice, code, paidByInvoice.GetValueOrDefault(invoice.Id), returnedByInvoice.GetValueOrDefault(invoice.Id)), StringComparer.Ordinal)).ToArray();
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.executed", Resource = "salesInvoices" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new ReportResult(report.Source, report.Columns.Select(InvoiceColumnByCode).ToArray(), resultRows,
            report.Page, report.PageSize, totalCount));
    }

    private static async Task<IResult> ExportSalesInvoicesAsync(NormalizedReport report, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct)
    {
        if (!TryTenantContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
        IQueryable<SalesInvoice> query = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId).Include(x => x.Customer);
        foreach (var filter in report.Filters)
            if (!TryApplyInvoiceFilter(ref query, db, filter, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"filters.{filter.Field}"] = [error!] });

        var csv = new StringBuilder();
        if (report.GroupByFields.Count > 0)
        {
            var grouped = await AggregateInvoicesAsync(query, report.GroupByFields, report.Aggregate!, report.Descending, 0, 10_001, ct);
            if (grouped.TotalGroups > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 gruplu satır destekler.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var headers = report.GroupByFields.Select(code => InvoiceColumnByCode(code).Label).Append("Fatura sayısı").ToList();
            if (report.Aggregate != "count") headers.Add(AggregateLabel(report.Aggregate!));
            csv.Append('\uFEFF').AppendLine(string.Join(',', headers.Select(header => Csv(header))));
            foreach (var row in grouped.Rows)
            {
                var values = (row.GroupValues ?? [row.GroupValue]).Select(CsvValue).Append(CsvValue(row.RowCount)).ToList();
                if (report.Aggregate != "count") values.Add(CsvValue(row.Value));
                csv.AppendLine(string.Join(',', values));
            }
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesInvoices:group:{string.Join(',', report.GroupByFields)}:{grouped.Rows.Count}" });
        }
        else
        {
            var totalCount = await query.CountAsync(ct);
            if (totalCount > 10_000) return Results.Problem("CSV dışa aktarma en fazla 10.000 satır destekler. Filtreleri daraltın.", statusCode: StatusCodes.Status413PayloadTooLarge);
            var rows = await ApplyInvoiceSort(query, db, report.SortBy, report.Descending).Take(10_000).ToListAsync(ct);
            var invoiceIds = rows.Select(x => x.Id).ToArray();
            var paidByInvoice = await GetPostedCollectionTotalsAsync(db, tenantId, invoiceIds, ct);
            var returnedByInvoice = await GetPostedSalesReturnTotalsAsync(db, tenantId, invoiceIds, ct);
            csv.Append('\uFEFF').AppendLine(string.Join(',', report.Columns.Select(code => Csv(InvoiceColumnByCode(code).Label))));
            foreach (var invoice in rows) csv.AppendLine(string.Join(',', report.Columns.Select(code => CsvValue(ReadInvoiceValue(invoice, code,
                paidByInvoice.GetValueOrDefault(invoice.Id), returnedByInvoice.GetValueOrDefault(invoice.Id))))));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.report.exported", Resource = $"salesInvoices:{rows.Count}" });
        }
        await db.SaveChangesAsync(ct);
        return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "nexora-report.csv");
    }

    private static async Task<AggregatePage> AggregateStockItemsAsync(IQueryable<StockItemReportRow> query, IReadOnlyList<string> groupBy,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateStockItemSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<StockItemReportRow, string>>)(x => x.Code),
            "name" => (Expression<Func<StockItemReportRow, string>>)(x => x.Name),
            "barcode" => (Expression<Func<StockItemReportRow, string?>>)(x => x.Barcode),
            "unitCode" => (Expression<Func<StockItemReportRow, string>>)(x => x.UnitCode),
            "category" => (Expression<Func<StockItemReportRow, string?>>)(x => x.Category),
            "minimumStock" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.MinimumStock),
            "onHand" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.OnHand),
            "reserved" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Reserved),
            "available" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Available),
            "minimumStockGap" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.MinimumStockGap),
            "belowMinimum" => (Expression<Func<StockItemReportRow, bool>>)(x => x.BelowMinimum),
            "trackingMode" => (Expression<Func<StockItemReportRow, InventoryTrackingMode>>)(x => x.TrackingMode),
            "isActive" => (Expression<Func<StockItemReportRow, bool>>)(x => x.IsActive),
            "createdAt" => (Expression<Func<StockItemReportRow, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported stock-item grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumMinimumStock" or "averageMinimumStock" => (LambdaExpression)(Expression<Func<StockItemReportRow, decimal>>)(x => x.MinimumStock),
            "sumOnHand" or "averageOnHand" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.OnHand),
            "sumReserved" or "averageReserved" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Reserved),
            "sumAvailable" or "averageAvailable" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.Available),
            "sumMinimumStockGap" or "averageMinimumStockGap" => (Expression<Func<StockItemReportRow, decimal>>)(x => x.MinimumStockGap),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregateStockItemSingleAsync(IQueryable<StockItemReportRow> query, string groupBy,
        string aggregate, bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateStockItemGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "name" => await AggregateStockItemGroups(query.GroupBy(x => x.Name), aggregate, descending, skip, take, ct),
        "barcode" => await AggregateStockItemGroups(query.GroupBy(x => x.Barcode), aggregate, descending, skip, take, ct),
        "unitCode" => await AggregateStockItemGroups(query.GroupBy(x => x.UnitCode), aggregate, descending, skip, take, ct),
        "category" => await AggregateStockItemGroups(query.GroupBy(x => x.Category), aggregate, descending, skip, take, ct),
        "minimumStock" => await AggregateStockItemGroups(query.GroupBy(x => x.MinimumStock), aggregate, descending, skip, take, ct),
        "onHand" => await AggregateStockItemGroups(query.GroupBy(x => x.OnHand), aggregate, descending, skip, take, ct),
        "reserved" => await AggregateStockItemGroups(query.GroupBy(x => x.Reserved), aggregate, descending, skip, take, ct),
        "available" => await AggregateStockItemGroups(query.GroupBy(x => x.Available), aggregate, descending, skip, take, ct),
        "minimumStockGap" => await AggregateStockItemGroups(query.GroupBy(x => x.MinimumStockGap), aggregate, descending, skip, take, ct),
        "belowMinimum" => await AggregateStockItemGroups(query.GroupBy(x => x.BelowMinimum), aggregate, descending, skip, take, ct),
        "trackingMode" => await AggregateStockItemGroups(query.GroupBy(x => x.TrackingMode), aggregate, descending, skip, take, ct),
        "isActive" => await AggregateStockItemGroups(query.GroupBy(x => x.IsActive), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateStockItemGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateStockItemGroups<TKey>(IQueryable<IGrouping<TKey, StockItemReportRow>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumMinimumStock" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.MinimumStock))).ToListAsync(ct),
            "averageMinimumStock" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.MinimumStock))).ToListAsync(ct),
            "sumOnHand" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.OnHand))).ToListAsync(ct),
            "averageOnHand" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.OnHand))).ToListAsync(ct),
            "sumReserved" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.Reserved))).ToListAsync(ct),
            "averageReserved" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.Reserved))).ToListAsync(ct),
            "sumAvailable" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.Available))).ToListAsync(ct),
            "averageAvailable" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.Available))).ToListAsync(ct),
            "sumMinimumStockGap" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.MinimumStockGap))).ToListAsync(ct),
            "averageMinimumStockGap" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.MinimumStockGap))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(row => row with { GroupValue = row.GroupValue is InventoryTrackingMode mode ? mode.ToString() : row.GroupValue }).ToArray(), total);
    }

    private sealed class WarehouseStockReportRow
    {
        public Guid Id { get; init; }
        public Guid WarehouseId { get; init; }
        public string StockCode { get; init; } = "";
        public string StockName { get; init; } = "";
        public string UnitCode { get; init; } = "";
        public string WarehouseCode { get; init; } = "";
        public string WarehouseName { get; init; } = "";
        public decimal OnHand { get; init; }
        public decimal Reserved { get; init; }
        public decimal Available { get; init; }
    }

    private sealed class StockItemReportRow
    {
        public Guid Id { get; init; }
        public string Code { get; init; } = "";
        public string Name { get; init; } = "";
        public string? Barcode { get; init; }
        public string UnitCode { get; init; } = "";
        public string? Category { get; init; }
        public decimal MinimumStock { get; init; }
        public InventoryTrackingMode TrackingMode { get; init; }
        public bool IsActive { get; init; }
        public DateTimeOffset CreatedAt { get; init; }
        public decimal OnHand { get; init; }
        public decimal Reserved { get; init; }
        public decimal Available { get; init; }
        public decimal MinimumStockGap { get; init; }
        public bool BelowMinimum { get; init; }
    }

    private static IQueryable<StockItemReportRow> StockItemReportRows(TenantDbContext db, Guid tenantId)
    {
        return from item in db.StockItems.Where(item => item.TenantId == tenantId)
               let onHand = db.InventoryTransactions
                   .Where(move => move.TenantId == tenantId && move.StockItemId == item.Id)
                   .Sum(move => move.Direction == InventoryDirection.Receipt ? move.Quantity : -move.Quantity)
               let reserved = db.SalesOrderReservations
                   .Where(reservation => reservation.TenantId == tenantId && reservation.Status == SalesOrderReservationStatus.Active
                       && reservation.OrderLine.StockItemId == item.Id)
                   .Sum(reservation => reservation.Quantity - reservation.FulfilledQuantity)
               let available = onHand - reserved
               select new StockItemReportRow
               {
                Id = item.Id,
                Code = item.Code,
                Name = item.Name,
                Barcode = item.Barcode,
                UnitCode = item.UnitCode,
                Category = item.Category,
                MinimumStock = item.MinimumStock,
                TrackingMode = item.TrackingMode,
                IsActive = item.IsActive,
                CreatedAt = item.CreatedAt,
                OnHand = onHand,
                Reserved = reserved,
                Available = available,
                MinimumStockGap = item.MinimumStock > available ? item.MinimumStock - available : 0m,
                BelowMinimum = item.MinimumStock > available
               };
    }

    private static bool TryApplyStockItemFilter(ref IQueryable<StockItemReportRow> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Operator == "isNull")
        {
            if (filter.Field == "barcode") { query = query.Where(x => x.Barcode == null); return true; }
            if (filter.Field == "category") { query = query.Where(x => x.Category == null); return true; }
            error = "Bu stok alanı boş değer filtresini desteklemiyor."; return false;
        }
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "name":
                query = filter.Operator == "contains" ? query.Where(x => x.Name.Contains(value)) : query.Where(x => x.Name == value); return true;
            case "barcode":
                query = filter.Operator == "contains" ? query.Where(x => x.Barcode != null && x.Barcode.Contains(value)) : query.Where(x => x.Barcode == value); return true;
            case "unitCode":
                query = filter.Operator == "contains" ? query.Where(x => x.UnitCode.Contains(value)) : query.Where(x => x.UnitCode == value); return true;
            case "category":
                query = filter.Operator == "contains" ? query.Where(x => x.Category != null && x.Category.Contains(value)) : query.Where(x => x.Category == value); return true;
            case "onHand":
            case "reserved":
            case "available":
            case "minimumStockGap":
            case "minimumStock":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var op)) { error = "Stok miktarı veya operatörü geçersiz."; return false; }
                query = (filter.Field, op) switch
                {
                    ("onHand", "gt") => query.Where(x => x.OnHand > amount), ("onHand", "gte") => query.Where(x => x.OnHand >= amount), ("onHand", "lt") => query.Where(x => x.OnHand < amount), ("onHand", "lte") => query.Where(x => x.OnHand <= amount), ("onHand", _) => query.Where(x => x.OnHand == amount),
                    ("reserved", "gt") => query.Where(x => x.Reserved > amount), ("reserved", "gte") => query.Where(x => x.Reserved >= amount), ("reserved", "lt") => query.Where(x => x.Reserved < amount), ("reserved", "lte") => query.Where(x => x.Reserved <= amount), ("reserved", _) => query.Where(x => x.Reserved == amount),
                    ("available", "gt") => query.Where(x => x.Available > amount), ("available", "gte") => query.Where(x => x.Available >= amount), ("available", "lt") => query.Where(x => x.Available < amount), ("available", "lte") => query.Where(x => x.Available <= amount), ("available", _) => query.Where(x => x.Available == amount),
                    ("minimumStockGap", "gt") => query.Where(x => x.MinimumStockGap > amount), ("minimumStockGap", "gte") => query.Where(x => x.MinimumStockGap >= amount), ("minimumStockGap", "lt") => query.Where(x => x.MinimumStockGap < amount), ("minimumStockGap", "lte") => query.Where(x => x.MinimumStockGap <= amount), ("minimumStockGap", _) => query.Where(x => x.MinimumStockGap == amount),
                    (_, "gt") => query.Where(x => x.MinimumStock > amount), (_, "gte") => query.Where(x => x.MinimumStock >= amount), (_, "lt") => query.Where(x => x.MinimumStock < amount), (_, "lte") => query.Where(x => x.MinimumStock <= amount), _ => query.Where(x => x.MinimumStock == amount)
                }; return true;
            case "trackingMode":
                if (!Enum.TryParse<InventoryTrackingMode>(value, true, out var mode)) { error = "Stok takip türü geçersiz."; return false; }
                query = query.Where(x => x.TrackingMode == mode); return true;
            case "isActive":
                if (!bool.TryParse(value, out var active)) { error = "Durum true/false olmalıdır."; return false; }
                query = query.Where(x => x.IsActive == active); return true;
            case "belowMinimum":
                if (!bool.TryParse(value, out var belowMinimum)) { error = "Minimum stok eşiği true/false olmalıdır."; return false; }
                query = query.Where(x => x.BelowMinimum == belowMinimum); return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            default: error = "Stok kartı filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<StockItemReportRow> ApplyStockItemSort(IQueryable<StockItemReportRow> query, string field, bool descending) => (field, descending) switch
    {
        ("name", false) => query.OrderBy(x => x.Name).ThenBy(x => x.Id), ("name", true) => query.OrderByDescending(x => x.Name).ThenBy(x => x.Id),
        ("barcode", false) => query.OrderBy(x => x.Barcode).ThenBy(x => x.Id), ("barcode", true) => query.OrderByDescending(x => x.Barcode).ThenBy(x => x.Id),
        ("unitCode", false) => query.OrderBy(x => x.UnitCode).ThenBy(x => x.Id), ("unitCode", true) => query.OrderByDescending(x => x.UnitCode).ThenBy(x => x.Id),
        ("category", false) => query.OrderBy(x => x.Category).ThenBy(x => x.Id), ("category", true) => query.OrderByDescending(x => x.Category).ThenBy(x => x.Id),
        ("minimumStock", false) => query.OrderBy(x => x.MinimumStock).ThenBy(x => x.Id), ("minimumStock", true) => query.OrderByDescending(x => x.MinimumStock).ThenBy(x => x.Id),
        ("onHand", false) => query.OrderBy(x => x.OnHand).ThenBy(x => x.Id), ("onHand", true) => query.OrderByDescending(x => x.OnHand).ThenBy(x => x.Id),
        ("reserved", false) => query.OrderBy(x => x.Reserved).ThenBy(x => x.Id), ("reserved", true) => query.OrderByDescending(x => x.Reserved).ThenBy(x => x.Id),
        ("available", false) => query.OrderBy(x => x.Available).ThenBy(x => x.Id), ("available", true) => query.OrderByDescending(x => x.Available).ThenBy(x => x.Id),
        ("minimumStockGap", false) => query.OrderBy(x => x.MinimumStockGap).ThenBy(x => x.Id), ("minimumStockGap", true) => query.OrderByDescending(x => x.MinimumStockGap).ThenBy(x => x.Id),
        ("belowMinimum", false) => query.OrderBy(x => x.BelowMinimum).ThenBy(x => x.Id), ("belowMinimum", true) => query.OrderByDescending(x => x.BelowMinimum).ThenBy(x => x.Id),
        ("trackingMode", false) => query.OrderBy(x => x.TrackingMode).ThenBy(x => x.Id), ("trackingMode", true) => query.OrderByDescending(x => x.TrackingMode).ThenBy(x => x.Id),
        ("isActive", false) => query.OrderBy(x => x.IsActive).ThenBy(x => x.Id), ("isActive", true) => query.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadStockItemValue(StockItemReportRow item, string code) => code switch
    {
        "code" => item.Code, "name" => item.Name, "barcode" => item.Barcode, "unitCode" => item.UnitCode,
        "category" => item.Category, "minimumStock" => item.MinimumStock, "onHand" => item.OnHand, "reserved" => item.Reserved, "available" => item.Available,
        "minimumStockGap" => item.MinimumStockGap, "belowMinimum" => item.BelowMinimum, "trackingMode" => item.TrackingMode.ToString(),
        "isActive" => item.IsActive, "createdAt" => item.CreatedAt, _ => null
    };

    private static bool TryApplyPurchaseOrderFilter(ref IQueryable<PurchaseOrder> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "supplierCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Code.Contains(value)) : query.Where(x => x.Supplier.Code == value); return true;
            case "supplierName":
                query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Name.Contains(value)) : query.Where(x => x.Supplier.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<PurchaseOrderStatus>(value, true, out var status)) { error = "Satın alma siparişi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "orderDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var orderDate)) { error = "Sipariş tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.OrderDate > orderDate), "gte" => query.Where(x => x.OrderDate >= orderDate), "lt" => query.Where(x => x.OrderDate < orderDate), _ => query.Where(x => x.OrderDate <= orderDate) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "subtotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Sipariş tutarı filtresi geçersiz."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Satın alma siparişi filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplyPurchaseReceiptFilter(ref IQueryable<PurchaseReceipt> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code": query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "orderCode": query = filter.Operator == "contains" ? query.Where(x => x.PurchaseOrder.Code.Contains(value)) : query.Where(x => x.PurchaseOrder.Code == value); return true;
            case "supplierCode": query = filter.Operator == "contains" ? query.Where(x => x.PurchaseOrder.Supplier.Code.Contains(value)) : query.Where(x => x.PurchaseOrder.Supplier.Code == value); return true;
            case "supplierName": query = filter.Operator == "contains" ? query.Where(x => x.PurchaseOrder.Supplier.Name.Contains(value)) : query.Where(x => x.PurchaseOrder.Supplier.Name == value); return true;
            case "warehouseCode": query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Code.Contains(value)) : query.Where(x => x.Warehouse.Code == value); return true;
            case "warehouseName": query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Name.Contains(value)) : query.Where(x => x.Warehouse.Name == value); return true;
            case "status":
                if (!Enum.TryParse<PurchaseReceiptStatus>(value, true, out var status)) { error = "Mal kabul durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "receiptDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Mal kabul tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.ReceiptDate > date), "gte" => query.Where(x => x.ReceiptDate >= date), "lt" => query.Where(x => x.ReceiptDate < date), "lte" => query.Where(x => x.ReceiptDate <= date), _ => query.Where(x => x.ReceiptDate == date) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), "lte" => query.Where(x => x.CreatedAt <= createdAt), _ => query.Where(x => x.CreatedAt == createdAt) }; return true;
            case "lineCount":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var count)) { error = "Satır sayısı sayısal olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.Lines.Count > count), "gte" => query.Where(x => x.Lines.Count >= count), "lt" => query.Where(x => x.Lines.Count < count), "lte" => query.Where(x => x.Lines.Count <= count), _ => query.Where(x => x.Lines.Count == count) }; return true;
            case "totalQuantity":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var quantity)) { error = "Kabul miktarı sayısal olmalıdır."; return false; }
                var total = (Expression<Func<PurchaseReceipt, decimal>>)(x => x.Lines.Select(l => (decimal?)l.Quantity).Sum() ?? 0m);
                var parameter = total.Parameters[0]; var body = total.Body;
                var compare = filter.Operator switch { "gt" => Expression.GreaterThan(body, Expression.Constant(quantity)), "gte" => Expression.GreaterThanOrEqual(body, Expression.Constant(quantity)), "lt" => Expression.LessThan(body, Expression.Constant(quantity)), "lte" => Expression.LessThanOrEqual(body, Expression.Constant(quantity)), _ => Expression.Equal(body, Expression.Constant(quantity)) };
                query = query.Where(Expression.Lambda<Func<PurchaseReceipt, bool>>(compare, parameter)); return true;
            default: error = "Mal kabul filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplyPurchaseInvoiceFilter(ref IQueryable<PurchaseInvoice> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code": query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "orderCode": query = filter.Operator == "contains" ? query.Where(x => x.PurchaseOrder.Code.Contains(value)) : query.Where(x => x.PurchaseOrder.Code == value); return true;
            case "receiptCode": query = filter.Operator == "contains" ? query.Where(x => x.PurchaseReceipt.Code.Contains(value)) : query.Where(x => x.PurchaseReceipt.Code == value); return true;
            case "supplierCode": query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Code.Contains(value)) : query.Where(x => x.Supplier.Code == value); return true;
            case "supplierName": query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Name.Contains(value)) : query.Where(x => x.Supplier.Name == value); return true;
            case "currencyCode": query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<PurchaseInvoiceStatus>(value, true, out var status)) { error = "Alış faturası durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "invoiceDate": case "dueDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Fatura/vade tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("invoiceDate", "gt") => query.Where(x => x.InvoiceDate > date), ("invoiceDate", "gte") => query.Where(x => x.InvoiceDate >= date),
                    ("invoiceDate", "lt") => query.Where(x => x.InvoiceDate < date), ("invoiceDate", "lte") => query.Where(x => x.InvoiceDate <= date),
                    ("invoiceDate", _) => query.Where(x => x.InvoiceDate == date), ("dueDate", "gt") => query.Where(x => x.DueDate > date),
                    ("dueDate", "gte") => query.Where(x => x.DueDate >= date), ("dueDate", "lt") => query.Where(x => x.DueDate < date),
                    ("dueDate", "lte") => query.Where(x => x.DueDate <= date), _ => query.Where(x => x.DueDate == date)
                };
                return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), "lte" => query.Where(x => x.CreatedAt <= createdAt), _ => query.Where(x => x.CreatedAt == createdAt) }; return true;
            case "outstandingAmount":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var outstandingAmount)) { error = "Açık bakiye filtresi sayısal olmalıdır."; return false; }
                query = ApplyPurchaseInvoiceOutstandingFilter(query, filter.Operator, outstandingAmount);
                return true;
            case "paidAmount": case "returnedAmount": case "subtotal": case "discountTotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Tutar filtresi sayısal olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("paidAmount", "gt") => query.Where(x => (x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m) > amount),
                    ("paidAmount", "gte") => query.Where(x => (x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m) >= amount),
                    ("paidAmount", "lt") => query.Where(x => (x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m) < amount),
                    ("paidAmount", "lte") => query.Where(x => (x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m) <= amount),
                    ("paidAmount", _) => query.Where(x => (x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m) == amount),
                    ("returnedAmount", "gt") => query.Where(x => (x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) > amount),
                    ("returnedAmount", "gte") => query.Where(x => (x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) >= amount),
                    ("returnedAmount", "lt") => query.Where(x => (x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) < amount),
                    ("returnedAmount", "lte") => query.Where(x => (x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) <= amount),
                    ("returnedAmount", _) => query.Where(x => (x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) == amount),
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount), ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("discountTotal", "gt") => query.Where(x => x.DiscountTotal > amount), ("discountTotal", "gte") => query.Where(x => x.DiscountTotal >= amount), ("discountTotal", "lt") => query.Where(x => x.DiscountTotal < amount), ("discountTotal", "lte") => query.Where(x => x.DiscountTotal <= amount), ("discountTotal", _) => query.Where(x => x.DiscountTotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount), ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount), (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                };
                return true;
            case "lineCount":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var lineCount)) { error = "Satır sayısı sayısal olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.Lines.Count > lineCount), "gte" => query.Where(x => x.Lines.Count >= lineCount), "lt" => query.Where(x => x.Lines.Count < lineCount), "lte" => query.Where(x => x.Lines.Count <= lineCount), _ => query.Where(x => x.Lines.Count == lineCount) }; return true;
            default: error = "Alış faturası filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplyInventoryTransactionFilter(ref IQueryable<InventoryTransaction> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "transactionId": case "reversalOfId":
                if (!Guid.TryParse(value, out var id)) { error = "Hareket kimliği GUID biçiminde olmalıdır."; return false; }
                query = filter.Field == "transactionId" ? query.Where(x => x.Id == id) : query.Where(x => x.ReversalOfId == id);
                return true;
            case "direction":
                if (!Enum.TryParse<InventoryDirection>(value, true, out var direction)) { error = "Stok hareket yönü geçersiz."; return false; }
                query = query.Where(x => x.Direction == direction); return true;
            case "stockCode": query = filter.Operator == "contains" ? query.Where(x => x.StockItem.Code.Contains(value)) : query.Where(x => x.StockItem.Code == value); return true;
            case "stockName": query = filter.Operator == "contains" ? query.Where(x => x.StockItem.Name.Contains(value)) : query.Where(x => x.StockItem.Name == value); return true;
            case "warehouseCode": query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Code.Contains(value)) : query.Where(x => x.Warehouse.Code == value); return true;
            case "warehouseName": query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Name.Contains(value)) : query.Where(x => x.Warehouse.Name == value); return true;
            case "enteredUnitCode": case "description":
                query = filter.Field == "description"
                    ? filter.Operator == "contains" ? query.Where(x => x.Description.Contains(value)) : query.Where(x => x.Description == value)
                    : filter.Operator == "contains" ? query.Where(x => x.EnteredUnitCode != null && x.EnteredUnitCode.Contains(value)) : query.Where(x => x.EnteredUnitCode == value);
                return true;
            case "entryDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var entryDate)) { error = "Hareket tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.EntryDate > entryDate), "gte" => query.Where(x => x.EntryDate >= entryDate), "lt" => query.Where(x => x.EntryDate < entryDate), "lte" => query.Where(x => x.EntryDate <= entryDate), _ => query.Where(x => x.EntryDate == entryDate) };
                return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma tarihi ISO biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), "lte" => query.Where(x => x.CreatedAt <= createdAt), _ => query.Where(x => x.CreatedAt == createdAt) };
                return true;
            case "quantity": case "enteredQuantity": case "unitCostBase":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Miktar veya maliyet filtresi sayısal olmalıdır."; return false; }
                query = filter.Field switch
                {
                    "quantity" => filter.Operator switch { "gt" => query.Where(x => x.Quantity > amount), "gte" => query.Where(x => x.Quantity >= amount), "lt" => query.Where(x => x.Quantity < amount), "lte" => query.Where(x => x.Quantity <= amount), _ => query.Where(x => x.Quantity == amount) },
                    "enteredQuantity" => filter.Operator switch { "gt" => query.Where(x => x.EnteredQuantity > amount), "gte" => query.Where(x => x.EnteredQuantity >= amount), "lt" => query.Where(x => x.EnteredQuantity < amount), "lte" => query.Where(x => x.EnteredQuantity <= amount), _ => query.Where(x => x.EnteredQuantity == amount) },
                    _ => filter.Operator switch { "gt" => query.Where(x => x.UnitCostBase > amount), "gte" => query.Where(x => x.UnitCostBase >= amount), "lt" => query.Where(x => x.UnitCostBase < amount), "lte" => query.Where(x => x.UnitCostBase <= amount), _ => query.Where(x => x.UnitCostBase == amount) }
                };
                return true;
            case "traceCount":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var traceCount)) { error = "İz kayıt sayısı tam sayı olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.Tracking.Count > traceCount), "gte" => query.Where(x => x.Tracking.Count >= traceCount), "lt" => query.Where(x => x.Tracking.Count < traceCount), "lte" => query.Where(x => x.Tracking.Count <= traceCount), _ => query.Where(x => x.Tracking.Count == traceCount) };
                return true;
            default: error = "Stok hareketi filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplyManufacturingOrderFilter(ref IQueryable<ManufacturingOrder> query, ReportFilter filter,
        Guid tenantId, TenantDbContext db, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code": query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "bomCode": query = filter.Operator == "contains" ? query.Where(x => db.BillOfMaterials.Any(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId && b.Code.Contains(value))) : query.Where(x => db.BillOfMaterials.Any(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId && b.Code == value)); return true;
            case "bomName": query = filter.Operator == "contains" ? query.Where(x => db.BillOfMaterials.Any(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId && b.Name.Contains(value))) : query.Where(x => db.BillOfMaterials.Any(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId && b.Name == value)); return true;
            case "warehouseCode": query = filter.Operator == "contains" ? query.Where(x => db.Warehouses.Any(w => w.TenantId == tenantId && w.Id == x.WarehouseId && w.Code.Contains(value))) : query.Where(x => db.Warehouses.Any(w => w.TenantId == tenantId && w.Id == x.WarehouseId && w.Code == value)); return true;
            case "warehouseName": query = filter.Operator == "contains" ? query.Where(x => db.Warehouses.Any(w => w.TenantId == tenantId && w.Id == x.WarehouseId && w.Name.Contains(value))) : query.Where(x => db.Warehouses.Any(w => w.TenantId == tenantId && w.Id == x.WarehouseId && w.Name == value)); return true;
            case "status":
                if (!Enum.TryParse<ManufacturingOrderStatus>(value, true, out var status)) { error = "Üretim emri durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "plannedDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var plannedDate)) { error = "Plan tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.PlannedDate > plannedDate), "gte" => query.Where(x => x.PlannedDate >= plannedDate), "lt" => query.Where(x => x.PlannedDate < plannedDate), "lte" => query.Where(x => x.PlannedDate <= plannedDate), _ => query.Where(x => x.PlannedDate == plannedDate) }; return true;
            case "completedAt": case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) { error = "Zaman filtresi ISO tarih biçiminde olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("completedAt", "gt") => query.Where(x => x.CompletedAt > date), ("completedAt", "gte") => query.Where(x => x.CompletedAt >= date),
                    ("completedAt", "lt") => query.Where(x => x.CompletedAt < date), ("completedAt", "lte") => query.Where(x => x.CompletedAt <= date), ("completedAt", _) => query.Where(x => x.CompletedAt == date),
                    ("createdAt", "gt") => query.Where(x => x.CreatedAt > date), ("createdAt", "gte") => query.Where(x => x.CreatedAt >= date),
                    ("createdAt", "lt") => query.Where(x => x.CreatedAt < date), ("createdAt", "lte") => query.Where(x => x.CreatedAt <= date), _ => query.Where(x => x.CreatedAt == date)
                }; return true;
            case "plannedQuantity": case "plannedOperationCost": case "actualOperationCost":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Üretim emri miktar veya maliyet filtresi sayısal olmalıdır."; return false; }
                Expression<Func<ManufacturingOrder, decimal>> values = filter.Field switch
                {
                    "plannedQuantity" => (Expression<Func<ManufacturingOrder, decimal>>)(x => x.PlannedQuantity),
                    "plannedOperationCost" => x => x.Operations.Select(o => (decimal?)o.PlannedCostBase).Sum() ?? 0m,
                    _ => x => x.Operations.Select(o => (decimal?)(o.ActualCostBase ?? 0m)).Sum() ?? 0m
                };
                var parameter = values.Parameters[0]; var body = values.Body;
                var comparison = filter.Operator switch { "gt" => Expression.GreaterThan(body, Expression.Constant(amount)), "gte" => Expression.GreaterThanOrEqual(body, Expression.Constant(amount)), "lt" => Expression.LessThan(body, Expression.Constant(amount)), "lte" => Expression.LessThanOrEqual(body, Expression.Constant(amount)), _ => Expression.Equal(body, Expression.Constant(amount)) };
                query = query.Where(Expression.Lambda<Func<ManufacturingOrder, bool>>(comparison, parameter)); return true;
            case "operationCount":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var count)) { error = "Operasyon sayısı tam sayı olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.Operations.Count > count), "gte" => query.Where(x => x.Operations.Count >= count), "lt" => query.Where(x => x.Operations.Count < count), "lte" => query.Where(x => x.Operations.Count <= count), _ => query.Where(x => x.Operations.Count == count) }; return true;
            default: error = "Üretim emri filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplySalesQuoteFilter(ref IQueryable<SalesQuote> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "customerCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Code.Contains(value)) : query.Where(x => x.Customer.Code == value); return true;
            case "customerName":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Name.Contains(value)) : query.Where(x => x.Customer.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "orderCode":
                if (filter.Operator == "isNull") { query = query.Where(x => x.Order == null); return true; }
                query = filter.Operator == "contains" ? query.Where(x => x.Order != null && x.Order.Code.Contains(value)) : query.Where(x => x.Order != null && x.Order.Code == value); return true;
            case "status":
                if (!Enum.TryParse<SalesQuoteStatus>(value, true, out var status)) { error = "Satış teklifi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "quoteDate": case "validUntil":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var quoteDate)) { error = "Teklif tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("quoteDate", "gt") => query.Where(x => x.QuoteDate > quoteDate), ("quoteDate", "gte") => query.Where(x => x.QuoteDate >= quoteDate),
                    ("quoteDate", "lt") => query.Where(x => x.QuoteDate < quoteDate), ("quoteDate", "lte") => query.Where(x => x.QuoteDate <= quoteDate), ("quoteDate", _) => query.Where(x => x.QuoteDate == quoteDate),
                    ("validUntil", "gt") => query.Where(x => x.ValidUntil > quoteDate), ("validUntil", "gte") => query.Where(x => x.ValidUntil >= quoteDate),
                    ("validUntil", "lt") => query.Where(x => x.ValidUntil < quoteDate), _ => query.Where(x => x.ValidUntil <= quoteDate)
                }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "subtotal": case "discountTotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Teklif tutarı filtresi geçersiz."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("discountTotal", "gt") => query.Where(x => x.DiscountTotal > amount), ("discountTotal", "gte") => query.Where(x => x.DiscountTotal >= amount),
                    ("discountTotal", "lt") => query.Where(x => x.DiscountTotal < amount), ("discountTotal", "lte") => query.Where(x => x.DiscountTotal <= amount), ("discountTotal", _) => query.Where(x => x.DiscountTotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Satış teklifi filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplyPurchaseSupplierQuoteFilter(ref IQueryable<PurchaseSupplierQuote> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "requestCode":
                query = filter.Operator == "contains" ? query.Where(x => x.PurchaseRequest.Code.Contains(value)) : query.Where(x => x.PurchaseRequest.Code == value); return true;
            case "supplierCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Code.Contains(value)) : query.Where(x => x.Supplier.Code == value); return true;
            case "supplierName":
                query = filter.Operator == "contains" ? query.Where(x => x.Supplier.Name.Contains(value)) : query.Where(x => x.Supplier.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<PurchaseSupplierQuoteStatus>(value, true, out var status)) { error = "Tedarikçi teklifi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "validUntil" when filter.Operator == "isNull":
                query = query.Where(x => x.ValidUntil == null); return true;
            case "quoteDate": case "validUntil":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var quoteDate)) { error = "Teklif tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("quoteDate", "gt") => query.Where(x => x.QuoteDate > quoteDate), ("quoteDate", "gte") => query.Where(x => x.QuoteDate >= quoteDate),
                    ("quoteDate", "lt") => query.Where(x => x.QuoteDate < quoteDate), ("quoteDate", "lte") => query.Where(x => x.QuoteDate <= quoteDate),
                    ("quoteDate", _) => query.Where(x => x.QuoteDate == quoteDate),
                    ("validUntil", "gt") => query.Where(x => x.ValidUntil > quoteDate), ("validUntil", "gte") => query.Where(x => x.ValidUntil >= quoteDate),
                    ("validUntil", "lt") => query.Where(x => x.ValidUntil < quoteDate), _ => query.Where(x => x.ValidUntil <= quoteDate)
                }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "subtotal": case "discountTotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Tedarikçi teklifi tutar filtresi geçersiz."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("discountTotal", "gt") => query.Where(x => x.DiscountTotal > amount), ("discountTotal", "gte") => query.Where(x => x.DiscountTotal >= amount),
                    ("discountTotal", "lt") => query.Where(x => x.DiscountTotal < amount), ("discountTotal", "lte") => query.Where(x => x.DiscountTotal <= amount), ("discountTotal", _) => query.Where(x => x.DiscountTotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Tedarikçi teklifi filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplySalesOrderFilter(ref IQueryable<SalesOrder> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "customerCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Code.Contains(value)) : query.Where(x => x.Customer.Code == value); return true;
            case "customerName":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Name.Contains(value)) : query.Where(x => x.Customer.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<SalesOrderStatus>(value, true, out var status)) { error = "Satış siparişi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "orderDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var orderDate)) { error = "Sipariş tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.OrderDate > orderDate), "gte" => query.Where(x => x.OrderDate >= orderDate), "lt" => query.Where(x => x.OrderDate < orderDate), _ => query.Where(x => x.OrderDate <= orderDate) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "subtotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Sipariş tutarı filtresi geçersiz."; return false; }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Satış siparişi filtre alanı geçersiz."; return false;
        }
    }

    private static bool TryApplySalesDeliveryFilter(ref IQueryable<SalesDelivery> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "orderCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Order.Code.Contains(value)) : query.Where(x => x.Order.Code == value); return true;
            case "customerCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Order.Customer.Code.Contains(value)) : query.Where(x => x.Order.Customer.Code == value); return true;
            case "customerName":
                query = filter.Operator == "contains" ? query.Where(x => x.Order.Customer.Name.Contains(value)) : query.Where(x => x.Order.Customer.Name == value); return true;
            case "warehouseCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Code.Contains(value)) : query.Where(x => x.Warehouse.Code == value); return true;
            case "warehouseName":
                query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Name.Contains(value)) : query.Where(x => x.Warehouse.Name == value); return true;
            case "invoiceCode":
                if (filter.Operator == "isNull") { query = query.Where(x => x.Invoice == null); return true; }
                query = filter.Operator == "contains" ? query.Where(x => x.Invoice != null && x.Invoice.Code.Contains(value)) : query.Where(x => x.Invoice != null && x.Invoice.Code == value); return true;
            case "status":
                if (!Enum.TryParse<SalesDeliveryStatus>(value, true, out var status)) { error = "Sevkiyat durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "deliveryDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "Sevk tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.DeliveryDate > date), "gte" => query.Where(x => x.DeliveryDate >= date), "lt" => query.Where(x => x.DeliveryDate < date), _ => query.Where(x => x.DeliveryDate <= date) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "lineCount": case "totalQuantity":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Satır veya sevk miktarı filtresi geçersiz."; return false; }
                var count = (int)amount;
                if (filter.Field == "lineCount" && amount != count) { error = "Satır sayısı tam sayı olmalıdır."; return false; }
                if (filter.Field == "lineCount")
                    query = filter.Operator switch { "gt" => query.Where(x => x.Lines.Count > count), "gte" => query.Where(x => x.Lines.Count >= count), "lt" => query.Where(x => x.Lines.Count < count), "lte" => query.Where(x => x.Lines.Count <= count), _ => query.Where(x => x.Lines.Count == count) };
                else
                    query = filter.Operator switch { "gt" => query.Where(x => x.Lines.Sum(line => line.Quantity) > amount), "gte" => query.Where(x => x.Lines.Sum(line => line.Quantity) >= amount), "lt" => query.Where(x => x.Lines.Sum(line => line.Quantity) < amount), "lte" => query.Where(x => x.Lines.Sum(line => line.Quantity) <= amount), _ => query.Where(x => x.Lines.Sum(line => line.Quantity) == amount) };
                return true;
            default: error = "Sevkiyat filtresi geçersiz."; return false;
        }
    }

    private static bool TryApplySalesReturnFilter(ref IQueryable<SalesReturn> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code": query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "invoiceCode": query = filter.Operator == "contains" ? query.Where(x => x.SalesInvoice.Code.Contains(value)) : query.Where(x => x.SalesInvoice.Code == value); return true;
            case "customerCode": query = filter.Operator == "contains" ? query.Where(x => x.Customer.Code.Contains(value)) : query.Where(x => x.Customer.Code == value); return true;
            case "customerName": query = filter.Operator == "contains" ? query.Where(x => x.Customer.Name.Contains(value)) : query.Where(x => x.Customer.Name == value); return true;
            case "warehouseCode": query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Code.Contains(value)) : query.Where(x => x.Warehouse.Code == value); return true;
            case "warehouseName": query = filter.Operator == "contains" ? query.Where(x => x.Warehouse.Name.Contains(value)) : query.Where(x => x.Warehouse.Name == value); return true;
            case "currencyCode": query = filter.Operator == "contains" ? query.Where(x => x.SalesInvoice.CurrencyCode.Contains(value)) : query.Where(x => x.SalesInvoice.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<SalesReturnStatus>(value, true, out var status)) { error = "Satış iadesi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "returnDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "İade tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.ReturnDate > date), "gte" => query.Where(x => x.ReturnDate >= date), "lt" => query.Where(x => x.ReturnDate < date), _ => query.Where(x => x.ReturnDate <= date) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "lineCount": case "totalQuantity": case "subtotal": case "discountTotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "İade miktarı/tutarı filtresi geçersiz."; return false; }
                var count = (int)amount;
                if (filter.Field == "lineCount" && amount != count) { error = "Satır sayısı tam sayı olmalıdır."; return false; }
                query = filter.Field switch
                {
                    "lineCount" => filter.Operator switch { "gt" => query.Where(x => x.Lines.Count > count), "gte" => query.Where(x => x.Lines.Count >= count), "lt" => query.Where(x => x.Lines.Count < count), "lte" => query.Where(x => x.Lines.Count <= count), _ => query.Where(x => x.Lines.Count == count) },
                    "totalQuantity" => filter.Operator switch { "gt" => query.Where(x => x.Lines.Sum(line => line.Quantity) > amount), "gte" => query.Where(x => x.Lines.Sum(line => line.Quantity) >= amount), "lt" => query.Where(x => x.Lines.Sum(line => line.Quantity) < amount), "lte" => query.Where(x => x.Lines.Sum(line => line.Quantity) <= amount), _ => query.Where(x => x.Lines.Sum(line => line.Quantity) == amount) },
                    "subtotal" => filter.Operator switch { "gt" => query.Where(x => x.Subtotal > amount), "gte" => query.Where(x => x.Subtotal >= amount), "lt" => query.Where(x => x.Subtotal < amount), "lte" => query.Where(x => x.Subtotal <= amount), _ => query.Where(x => x.Subtotal == amount) },
                    "discountTotal" => filter.Operator switch { "gt" => query.Where(x => x.DiscountTotal > amount), "gte" => query.Where(x => x.DiscountTotal >= amount), "lt" => query.Where(x => x.DiscountTotal < amount), "lte" => query.Where(x => x.DiscountTotal <= amount), _ => query.Where(x => x.DiscountTotal == amount) },
                    "taxTotal" => filter.Operator switch { "gt" => query.Where(x => x.TaxTotal > amount), "gte" => query.Where(x => x.TaxTotal >= amount), "lt" => query.Where(x => x.TaxTotal < amount), "lte" => query.Where(x => x.TaxTotal <= amount), _ => query.Where(x => x.TaxTotal == amount) },
                    _ => filter.Operator switch { "gt" => query.Where(x => x.GrandTotal > amount), "gte" => query.Where(x => x.GrandTotal >= amount), "lt" => query.Where(x => x.GrandTotal < amount), "lte" => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount) }
                }; return true;
            default: error = "Satış iadesi filtresi geçersiz."; return false;
        }
    }

    private static bool TryApplySupplierReturnFilter(ref IQueryable<SupplierReturn> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        if (filter.Field is "code" or "invoiceCode" or "supplierCode" or "supplierName" or "warehouseCode" or "warehouseName")
        {
            query = filter.Field switch
            {
                "code" => filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value),
                "invoiceCode" => filter.Operator == "contains" ? query.Where(x => x.PurchaseInvoice.Code.Contains(value)) : query.Where(x => x.PurchaseInvoice.Code == value),
                "supplierCode" => filter.Operator == "contains" ? query.Where(x => x.Supplier.Code.Contains(value)) : query.Where(x => x.Supplier.Code == value),
                "supplierName" => filter.Operator == "contains" ? query.Where(x => x.Supplier.Name.Contains(value)) : query.Where(x => x.Supplier.Name == value),
                "warehouseCode" => filter.Operator == "contains" ? query.Where(x => x.Warehouse.Code.Contains(value)) : query.Where(x => x.Warehouse.Code == value),
                _ => filter.Operator == "contains" ? query.Where(x => x.Warehouse.Name.Contains(value)) : query.Where(x => x.Warehouse.Name == value)
            };
            return true;
        }
        if (filter.Field == "status")
        {
            if (!Enum.TryParse<SupplierReturnStatus>(value, true, out var status)) { error = "Tedarikçi iadesi durumu geçersiz."; return false; }
            query = query.Where(x => x.Status == status);
            return true;
        }
        if (filter.Field == "returnDate")
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) { error = "İade tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
            query = filter.Operator switch { "gt" => query.Where(x => x.ReturnDate > date), "gte" => query.Where(x => x.ReturnDate >= date), "lt" => query.Where(x => x.ReturnDate < date), _ => query.Where(x => x.ReturnDate <= date) };
            return true;
        }
        if (filter.Field == "createdAt")
        {
            if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
            query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) };
            return true;
        }
        if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "İade miktarı/tutarı filtresi geçersiz."; return false; }
        var count = (int)amount;
        if (filter.Field == "lineCount" && amount != count) { error = "Satır sayısı tam sayı olmalıdır."; return false; }
        query = filter.Field switch
        {
            "lineCount" => filter.Operator switch { "gt" => query.Where(x => x.Lines.Count() > count), "gte" => query.Where(x => x.Lines.Count() >= count), "lt" => query.Where(x => x.Lines.Count() < count), "lte" => query.Where(x => x.Lines.Count() <= count), _ => query.Where(x => x.Lines.Count() == count) },
            "totalQuantity" => filter.Operator switch { "gt" => query.Where(x => x.Lines.Sum(line => line.Quantity) > amount), "gte" => query.Where(x => x.Lines.Sum(line => line.Quantity) >= amount), "lt" => query.Where(x => x.Lines.Sum(line => line.Quantity) < amount), "lte" => query.Where(x => x.Lines.Sum(line => line.Quantity) <= amount), _ => query.Where(x => x.Lines.Sum(line => line.Quantity) == amount) },
            "subtotal" => filter.Operator switch { "gt" => query.Where(x => x.Subtotal > amount), "gte" => query.Where(x => x.Subtotal >= amount), "lt" => query.Where(x => x.Subtotal < amount), "lte" => query.Where(x => x.Subtotal <= amount), _ => query.Where(x => x.Subtotal == amount) },
            "discountTotal" => filter.Operator switch { "gt" => query.Where(x => x.DiscountTotal > amount), "gte" => query.Where(x => x.DiscountTotal >= amount), "lt" => query.Where(x => x.DiscountTotal < amount), "lte" => query.Where(x => x.DiscountTotal <= amount), _ => query.Where(x => x.DiscountTotal == amount) },
            "taxTotal" => filter.Operator switch { "gt" => query.Where(x => x.TaxTotal > amount), "gte" => query.Where(x => x.TaxTotal >= amount), "lt" => query.Where(x => x.TaxTotal < amount), "lte" => query.Where(x => x.TaxTotal <= amount), _ => query.Where(x => x.TaxTotal == amount) },
            _ => filter.Operator switch { "gt" => query.Where(x => x.GrandTotal > amount), "gte" => query.Where(x => x.GrandTotal >= amount), "lt" => query.Where(x => x.GrandTotal < amount), "lte" => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount) }
        };
        return true;
    }

    private static bool TryApplyPurchaseRequestFilter(ref IQueryable<PurchaseRequest> query, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "description":
                query = filter.Operator == "contains" ? query.Where(x => x.Description.Contains(value)) : query.Where(x => x.Description == value); return true;
            case "requesterUserId":
                if (!Guid.TryParse(value, out var requesterId)) { error = "Talep sahibi kullanıcı kodu geçersiz."; return false; }
                query = query.Where(x => x.RequestedByUserId == requesterId); return true;
            case "status":
                if (!Enum.TryParse<PurchaseRequestStatus>(value, true, out var status)) { error = "Satın alma talebi durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "neededByDate":
                if (filter.Operator == "isNull") { query = query.Where(x => x.NeededByDate == null); return true; }
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var neededBy)) { error = "İhtiyaç tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.NeededByDate > neededBy), "gte" => query.Where(x => x.NeededByDate >= neededBy), "lt" => query.Where(x => x.NeededByDate < neededBy), _ => query.Where(x => x.NeededByDate <= neededBy) }; return true;
            case "requestDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var requestedOn)) { error = "Talep tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.RequestDate > requestedOn), "gte" => query.Where(x => x.RequestDate >= requestedOn), "lt" => query.Where(x => x.RequestDate < requestedOn), _ => query.Where(x => x.RequestDate <= requestedOn) }; return true;
            case "createdAt": case "reviewedAt":
                if (filter.Field == "reviewedAt" && filter.Operator == "isNull") { query = query.Where(x => x.ReviewedAt == null); return true; }
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var timestamp)) { error = "Tarih filtresi ISO tarih biçiminde olmalıdır."; return false; }
                if (filter.Field == "createdAt")
                    query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > timestamp), "gte" => query.Where(x => x.CreatedAt >= timestamp), "lt" => query.Where(x => x.CreatedAt < timestamp), _ => query.Where(x => x.CreatedAt <= timestamp) };
                else
                    query = filter.Operator switch { "gt" => query.Where(x => x.ReviewedAt > timestamp), "gte" => query.Where(x => x.ReviewedAt >= timestamp), "lt" => query.Where(x => x.ReviewedAt < timestamp), _ => query.Where(x => x.ReviewedAt <= timestamp) };
                return true;
            default: error = "Satın alma talebi filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<PurchaseRequest> ApplyPurchaseRequestSort(IQueryable<PurchaseRequest> query, string field, bool descending) => (field, descending) switch
    {
        ("requesterUserId", false) => query.OrderBy(x => x.RequestedByUserId).ThenBy(x => x.Id), ("requesterUserId", true) => query.OrderByDescending(x => x.RequestedByUserId).ThenBy(x => x.Id),
        ("requestDate", false) => query.OrderBy(x => x.RequestDate).ThenBy(x => x.Id), ("requestDate", true) => query.OrderByDescending(x => x.RequestDate).ThenBy(x => x.Id),
        ("neededByDate", false) => query.OrderBy(x => x.NeededByDate).ThenBy(x => x.Id), ("neededByDate", true) => query.OrderByDescending(x => x.NeededByDate).ThenBy(x => x.Id),
        ("description", false) => query.OrderBy(x => x.Description).ThenBy(x => x.Id), ("description", true) => query.OrderByDescending(x => x.Description).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        ("reviewedAt", false) => query.OrderBy(x => x.ReviewedAt).ThenBy(x => x.Id), ("reviewedAt", true) => query.OrderByDescending(x => x.ReviewedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadPurchaseRequestValue(PurchaseRequest x, string code) => code switch
    {
        "code" => x.Code, "requesterUserId" => x.RequestedByUserId,
        "requestDate" => x.RequestDate, "neededByDate" => x.NeededByDate, "description" => x.Description,
        "status" => x.Status.ToString(), "createdAt" => x.CreatedAt, "reviewedAt" => x.ReviewedAt, _ => null
    };

    private static ReportColumn PurchaseRequestColumnByCode(string code) => PurchaseRequestColumns.First(x => x.Code == code);
    private static ReportColumn PurchaseReceiptColumnByCode(string code) => PurchaseReceiptColumns.First(x => x.Code == code);

    private static IQueryable<PurchaseOrder> ApplyPurchaseOrderSort(IQueryable<PurchaseOrder> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("supplierCode", false) => query.OrderBy(x => x.Supplier.Code).ThenBy(x => x.Id), ("supplierCode", true) => query.OrderByDescending(x => x.Supplier.Code).ThenBy(x => x.Id),
        ("supplierName", false) => query.OrderBy(x => x.Supplier.Name).ThenBy(x => x.Id), ("supplierName", true) => query.OrderByDescending(x => x.Supplier.Name).ThenBy(x => x.Id),
        ("orderDate", false) => query.OrderBy(x => x.OrderDate).ThenBy(x => x.Id), ("orderDate", true) => query.OrderByDescending(x => x.OrderDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadPurchaseOrderValue(PurchaseOrder x, string code) => code switch
    {
        "code" => x.Code, "supplierCode" => x.Supplier.Code, "supplierName" => x.Supplier.Name, "orderDate" => x.OrderDate,
        "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "taxTotal" => x.TaxTotal,
        "grandTotal" => x.GrandTotal, "createdAt" => x.CreatedAt, _ => null
    };

    private static IQueryable<PurchaseReceipt> ApplyPurchaseReceiptSort(IQueryable<PurchaseReceipt> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("orderCode", false) => query.OrderBy(x => x.PurchaseOrder.Code).ThenBy(x => x.Id), ("orderCode", true) => query.OrderByDescending(x => x.PurchaseOrder.Code).ThenBy(x => x.Id),
        ("supplierCode", false) => query.OrderBy(x => x.PurchaseOrder.Supplier.Code).ThenBy(x => x.Id), ("supplierCode", true) => query.OrderByDescending(x => x.PurchaseOrder.Supplier.Code).ThenBy(x => x.Id),
        ("supplierName", false) => query.OrderBy(x => x.PurchaseOrder.Supplier.Name).ThenBy(x => x.Id), ("supplierName", true) => query.OrderByDescending(x => x.PurchaseOrder.Supplier.Name).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => x.Warehouse.Code).ThenBy(x => x.Id), ("warehouseCode", true) => query.OrderByDescending(x => x.Warehouse.Code).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => x.Warehouse.Name).ThenBy(x => x.Id), ("warehouseName", true) => query.OrderByDescending(x => x.Warehouse.Name).ThenBy(x => x.Id),
        ("receiptDate", false) => query.OrderBy(x => x.ReceiptDate).ThenBy(x => x.Id), ("receiptDate", true) => query.OrderByDescending(x => x.ReceiptDate).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        ("lineCount", false) => query.OrderBy(x => x.Lines.Count).ThenBy(x => x.Id), ("lineCount", true) => query.OrderByDescending(x => x.Lines.Count).ThenBy(x => x.Id),
        ("totalQuantity", false) => query.OrderBy(x => x.Lines.Select(l => (decimal?)l.Quantity).Sum() ?? 0m).ThenBy(x => x.Id),
        ("totalQuantity", true) => query.OrderByDescending(x => x.Lines.Select(l => (decimal?)l.Quantity).Sum() ?? 0m).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.ReceiptDate).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.ReceiptDate).ThenBy(x => x.Id)
    };

    private static IQueryable<PurchaseInvoice> ApplyPurchaseInvoiceOutstandingFilter(IQueryable<PurchaseInvoice> query, string operation, decimal amount)
    {
        var balances = from invoice in query
            let paid = invoice.Payments.Where(x => x.TenantId == invoice.TenantId && x.Status == SupplierPaymentStatus.Posted).Sum(x => (decimal?)x.Amount) ?? 0m
            let returned = invoice.Returns.Where(x => x.TenantId == invoice.TenantId && x.Status == SupplierReturnStatus.Posted).Sum(x => (decimal?)x.GrandTotal) ?? 0m
            let raw = invoice.GrandTotal - paid - returned
            select new { Invoice = invoice, Outstanding = raw > 0m ? raw : 0m };
        var filtered = operation switch
        {
            "gt" => balances.Where(x => x.Outstanding > amount), "gte" => balances.Where(x => x.Outstanding >= amount),
            "lt" => balances.Where(x => x.Outstanding < amount), "lte" => balances.Where(x => x.Outstanding <= amount),
            _ => balances.Where(x => x.Outstanding == amount)
        };
        return filtered.Select(x => x.Invoice);
    }

    private static IQueryable<PurchaseInvoice> ApplyPurchaseInvoiceSort(IQueryable<PurchaseInvoice> query, string field, bool descending)
    {
        if (field == "paidAmount")
            return descending
                ? query.OrderByDescending(x => x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m).ThenBy(x => x.Id)
                : query.OrderBy(x => x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m).ThenBy(x => x.Id);
        if (field == "returnedAmount")
            return descending
                ? query.OrderByDescending(x => x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m).ThenBy(x => x.Id)
                : query.OrderBy(x => x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m).ThenBy(x => x.Id);
        if (field == "outstandingAmount")
        {
            var balances = from invoice in query
                let paid = invoice.Payments.Where(x => x.TenantId == invoice.TenantId && x.Status == SupplierPaymentStatus.Posted).Sum(x => (decimal?)x.Amount) ?? 0m
                let returned = invoice.Returns.Where(x => x.TenantId == invoice.TenantId && x.Status == SupplierReturnStatus.Posted).Sum(x => (decimal?)x.GrandTotal) ?? 0m
                let raw = invoice.GrandTotal - paid - returned
                select new { Invoice = invoice, Outstanding = raw > 0m ? raw : 0m };
            return (descending
                ? balances.OrderByDescending(x => x.Outstanding).ThenBy(x => x.Invoice.Id)
                : balances.OrderBy(x => x.Outstanding).ThenBy(x => x.Invoice.Id)).Select(x => x.Invoice);
        }
        return (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("orderCode", false) => query.OrderBy(x => x.PurchaseOrder.Code).ThenBy(x => x.Id), ("orderCode", true) => query.OrderByDescending(x => x.PurchaseOrder.Code).ThenBy(x => x.Id),
        ("receiptCode", false) => query.OrderBy(x => x.PurchaseReceipt.Code).ThenBy(x => x.Id), ("receiptCode", true) => query.OrderByDescending(x => x.PurchaseReceipt.Code).ThenBy(x => x.Id),
        ("supplierCode", false) => query.OrderBy(x => x.Supplier.Code).ThenBy(x => x.Id), ("supplierCode", true) => query.OrderByDescending(x => x.Supplier.Code).ThenBy(x => x.Id),
        ("supplierName", false) => query.OrderBy(x => x.Supplier.Name).ThenBy(x => x.Id), ("supplierName", true) => query.OrderByDescending(x => x.Supplier.Name).ThenBy(x => x.Id),
        ("invoiceDate", false) => query.OrderBy(x => x.InvoiceDate).ThenBy(x => x.Id), ("invoiceDate", true) => query.OrderByDescending(x => x.InvoiceDate).ThenBy(x => x.Id),
        ("dueDate", false) => query.OrderBy(x => x.DueDate).ThenBy(x => x.Id), ("dueDate", true) => query.OrderByDescending(x => x.DueDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("discountTotal", false) => query.OrderBy(x => x.DiscountTotal).ThenBy(x => x.Id), ("discountTotal", true) => query.OrderByDescending(x => x.DiscountTotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("lineCount", false) => query.OrderBy(x => x.Lines.Count).ThenBy(x => x.Id), ("lineCount", true) => query.OrderByDescending(x => x.Lines.Count).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
        };
    }

    private static object? ReadPurchaseInvoiceValue(PurchaseInvoice x, string code) => code switch
    {
        "code" => x.Code, "orderCode" => x.PurchaseOrder.Code, "receiptCode" => x.PurchaseReceipt.Code,
        "supplierCode" => x.Supplier.Code, "supplierName" => x.Supplier.Name, "invoiceDate" => x.InvoiceDate,
        "dueDate" => x.DueDate, "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(),
        "subtotal" => x.Subtotal, "discountTotal" => x.DiscountTotal, "taxTotal" => x.TaxTotal,
        "grandTotal" => x.GrandTotal,
        "paidAmount" => x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => p.Amount),
        "returnedAmount" => x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => r.GrandTotal),
        "outstandingAmount" => Math.Max(0m, x.GrandTotal -
            x.Payments.Where(p => p.TenantId == x.TenantId && p.Status == SupplierPaymentStatus.Posted).Sum(p => p.Amount) -
            x.Returns.Where(r => r.TenantId == x.TenantId && r.Status == SupplierReturnStatus.Posted).Sum(r => r.GrandTotal)),
        "lineCount" => x.Lines.Count, "createdAt" => x.CreatedAt, _ => null
    };

    private static object? ReadPurchaseReceiptValue(PurchaseReceipt x, string code) => code switch
    {
        "code" => x.Code, "orderCode" => x.PurchaseOrder.Code, "supplierCode" => x.PurchaseOrder.Supplier.Code,
        "supplierName" => x.PurchaseOrder.Supplier.Name, "warehouseCode" => x.Warehouse.Code, "warehouseName" => x.Warehouse.Name,
        "receiptDate" => x.ReceiptDate, "status" => x.Status.ToString(), "lineCount" => x.Lines.Count,
        "totalQuantity" => x.Lines.Sum(line => line.Quantity), "createdAt" => x.CreatedAt, _ => null
    };

    private static IQueryable<ManufacturingOrder> ApplyManufacturingOrderSort(IQueryable<ManufacturingOrder> query, string field,
        bool descending, Guid tenantId, TenantDbContext db) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("bomCode", false) => query.OrderBy(x => db.BillOfMaterials.Where(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId).Select(b => b.Code).FirstOrDefault()).ThenBy(x => x.Id),
        ("bomCode", true) => query.OrderByDescending(x => db.BillOfMaterials.Where(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId).Select(b => b.Code).FirstOrDefault()).ThenBy(x => x.Id),
        ("bomName", false) => query.OrderBy(x => db.BillOfMaterials.Where(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId).Select(b => b.Name).FirstOrDefault()).ThenBy(x => x.Id),
        ("bomName", true) => query.OrderByDescending(x => db.BillOfMaterials.Where(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId).Select(b => b.Name).FirstOrDefault()).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.WarehouseId).Select(w => w.Code).FirstOrDefault()).ThenBy(x => x.Id),
        ("warehouseCode", true) => query.OrderByDescending(x => db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.WarehouseId).Select(w => w.Code).FirstOrDefault()).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.WarehouseId).Select(w => w.Name).FirstOrDefault()).ThenBy(x => x.Id),
        ("warehouseName", true) => query.OrderByDescending(x => db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.WarehouseId).Select(w => w.Name).FirstOrDefault()).ThenBy(x => x.Id),
        ("plannedDate", false) => query.OrderBy(x => x.PlannedDate).ThenBy(x => x.Id), ("plannedDate", true) => query.OrderByDescending(x => x.PlannedDate).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("plannedQuantity", false) => query.OrderBy(x => x.PlannedQuantity).ThenBy(x => x.Id), ("plannedQuantity", true) => query.OrderByDescending(x => x.PlannedQuantity).ThenBy(x => x.Id),
        ("operationCount", false) => query.OrderBy(x => x.Operations.Count).ThenBy(x => x.Id), ("operationCount", true) => query.OrderByDescending(x => x.Operations.Count).ThenBy(x => x.Id),
        ("plannedOperationCost", false) => query.OrderBy(x => x.Operations.Select(o => (decimal?)o.PlannedCostBase).Sum() ?? 0m).ThenBy(x => x.Id),
        ("plannedOperationCost", true) => query.OrderByDescending(x => x.Operations.Select(o => (decimal?)o.PlannedCostBase).Sum() ?? 0m).ThenBy(x => x.Id),
        ("actualOperationCost", false) => query.OrderBy(x => x.Operations.Select(o => (decimal?)(o.ActualCostBase ?? 0m)).Sum() ?? 0m).ThenBy(x => x.Id),
        ("actualOperationCost", true) => query.OrderByDescending(x => x.Operations.Select(o => (decimal?)(o.ActualCostBase ?? 0m)).Sum() ?? 0m).ThenBy(x => x.Id),
        ("completedAt", false) => query.OrderBy(x => x.CompletedAt).ThenBy(x => x.Id), ("completedAt", true) => query.OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadManufacturingOrderValue(ManufacturingOrder x, string code,
        IReadOnlyDictionary<Guid, BillOfMaterial> boms, IReadOnlyDictionary<Guid, Warehouse> warehouses) => code switch
    {
        "code" => x.Code, "bomCode" => boms.GetValueOrDefault(x.BillOfMaterialId)?.Code, "bomName" => boms.GetValueOrDefault(x.BillOfMaterialId)?.Name,
        "warehouseCode" => warehouses.GetValueOrDefault(x.WarehouseId)?.Code, "warehouseName" => warehouses.GetValueOrDefault(x.WarehouseId)?.Name,
        "plannedDate" => x.PlannedDate, "status" => x.Status.ToString(), "plannedQuantity" => x.PlannedQuantity,
        "operationCount" => x.Operations.Count, "plannedOperationCost" => x.Operations.Sum(o => o.PlannedCostBase),
        "actualOperationCost" => x.Operations.Sum(o => o.ActualCostBase ?? 0m), "completedAt" => x.CompletedAt, "createdAt" => x.CreatedAt, _ => null
    };

    private static IQueryable<InventoryTransaction> ApplyInventoryTransactionSort(IQueryable<InventoryTransaction> query, string field, bool descending) => (field, descending) switch
    {
        ("transactionId", false) => query.OrderBy(x => x.Id), ("transactionId", true) => query.OrderByDescending(x => x.Id),
        ("entryDate", false) => query.OrderBy(x => x.EntryDate).ThenBy(x => x.Id), ("entryDate", true) => query.OrderByDescending(x => x.EntryDate).ThenBy(x => x.Id),
        ("direction", false) => query.OrderBy(x => x.Direction).ThenBy(x => x.Id), ("direction", true) => query.OrderByDescending(x => x.Direction).ThenBy(x => x.Id),
        ("stockCode", false) => query.OrderBy(x => x.StockItem.Code).ThenBy(x => x.Id), ("stockCode", true) => query.OrderByDescending(x => x.StockItem.Code).ThenBy(x => x.Id),
        ("stockName", false) => query.OrderBy(x => x.StockItem.Name).ThenBy(x => x.Id), ("stockName", true) => query.OrderByDescending(x => x.StockItem.Name).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => x.Warehouse.Code).ThenBy(x => x.Id), ("warehouseCode", true) => query.OrderByDescending(x => x.Warehouse.Code).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => x.Warehouse.Name).ThenBy(x => x.Id), ("warehouseName", true) => query.OrderByDescending(x => x.Warehouse.Name).ThenBy(x => x.Id),
        ("quantity", false) => query.OrderBy(x => x.Quantity).ThenBy(x => x.Id), ("quantity", true) => query.OrderByDescending(x => x.Quantity).ThenBy(x => x.Id),
        ("enteredQuantity", false) => query.OrderBy(x => x.EnteredQuantity).ThenBy(x => x.Id), ("enteredQuantity", true) => query.OrderByDescending(x => x.EnteredQuantity).ThenBy(x => x.Id),
        ("unitCostBase", false) => query.OrderBy(x => x.UnitCostBase).ThenBy(x => x.Id), ("unitCostBase", true) => query.OrderByDescending(x => x.UnitCostBase).ThenBy(x => x.Id),
        ("totalCostBase", false) => query.OrderBy(x => x.UnitCostBase * x.Quantity).ThenBy(x => x.Id), ("totalCostBase", true) => query.OrderByDescending(x => x.UnitCostBase * x.Quantity).ThenBy(x => x.Id),
        ("traceCount", false) => query.OrderBy(x => x.Tracking.Count).ThenBy(x => x.Id), ("traceCount", true) => query.OrderByDescending(x => x.Tracking.Count).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderByDescending(x => x.EntryDate).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.Id)
    };

    private static object? ReadInventoryTransactionValue(InventoryTransaction x, string code) => code switch
    {
        "transactionId" => x.Id, "entryDate" => x.EntryDate, "direction" => x.Direction.ToString(),
        "stockCode" => x.StockItem.Code, "stockName" => x.StockItem.Name,
        "warehouseCode" => x.Warehouse.Code, "warehouseName" => x.Warehouse.Name,
        "quantity" => x.Quantity, "enteredQuantity" => x.EnteredQuantity, "enteredUnitCode" => x.EnteredUnitCode,
        "unitCostBase" => x.UnitCostBase, "totalCostBase" => x.UnitCostBase is decimal unitCost ? unitCost * x.Quantity : null,
        "traceCount" => x.Tracking.Count, "reversalOfId" => x.ReversalOfId, "description" => x.Description, "createdAt" => x.CreatedAt, _ => null
    };

    private static IQueryable<SalesOrder> ApplySalesOrderSort(IQueryable<SalesOrder> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("customerCode", false) => query.OrderBy(x => x.Customer.Code).ThenBy(x => x.Id), ("customerCode", true) => query.OrderByDescending(x => x.Customer.Code).ThenBy(x => x.Id),
        ("customerName", false) => query.OrderBy(x => x.Customer.Name).ThenBy(x => x.Id), ("customerName", true) => query.OrderByDescending(x => x.Customer.Name).ThenBy(x => x.Id),
        ("orderDate", false) => query.OrderBy(x => x.OrderDate).ThenBy(x => x.Id), ("orderDate", true) => query.OrderByDescending(x => x.OrderDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static IQueryable<SalesQuote> ApplySalesQuoteSort(IQueryable<SalesQuote> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("customerCode", false) => query.OrderBy(x => x.Customer.Code).ThenBy(x => x.Id), ("customerCode", true) => query.OrderByDescending(x => x.Customer.Code).ThenBy(x => x.Id),
        ("customerName", false) => query.OrderBy(x => x.Customer.Name).ThenBy(x => x.Id), ("customerName", true) => query.OrderByDescending(x => x.Customer.Name).ThenBy(x => x.Id),
        ("quoteDate", false) => query.OrderBy(x => x.QuoteDate).ThenBy(x => x.Id), ("quoteDate", true) => query.OrderByDescending(x => x.QuoteDate).ThenBy(x => x.Id),
        ("validUntil", false) => query.OrderBy(x => x.ValidUntil).ThenBy(x => x.Id), ("validUntil", true) => query.OrderByDescending(x => x.ValidUntil).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("discountTotal", false) => query.OrderBy(x => x.DiscountTotal).ThenBy(x => x.Id), ("discountTotal", true) => query.OrderByDescending(x => x.DiscountTotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("orderCode", false) => query.OrderBy(x => x.Order == null ? null : x.Order.Code).ThenBy(x => x.Id), ("orderCode", true) => query.OrderByDescending(x => x.Order == null ? null : x.Order.Code).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static IQueryable<PurchaseSupplierQuote> ApplyPurchaseSupplierQuoteSort(IQueryable<PurchaseSupplierQuote> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("requestCode", false) => query.OrderBy(x => x.PurchaseRequest.Code).ThenBy(x => x.Id), ("requestCode", true) => query.OrderByDescending(x => x.PurchaseRequest.Code).ThenBy(x => x.Id),
        ("supplierCode", false) => query.OrderBy(x => x.Supplier.Code).ThenBy(x => x.Id), ("supplierCode", true) => query.OrderByDescending(x => x.Supplier.Code).ThenBy(x => x.Id),
        ("supplierName", false) => query.OrderBy(x => x.Supplier.Name).ThenBy(x => x.Id), ("supplierName", true) => query.OrderByDescending(x => x.Supplier.Name).ThenBy(x => x.Id),
        ("quoteDate", false) => query.OrderBy(x => x.QuoteDate).ThenBy(x => x.Id), ("quoteDate", true) => query.OrderByDescending(x => x.QuoteDate).ThenBy(x => x.Id),
        ("validUntil", false) => query.OrderBy(x => x.ValidUntil).ThenBy(x => x.Id), ("validUntil", true) => query.OrderByDescending(x => x.ValidUntil).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("discountTotal", false) => query.OrderBy(x => x.DiscountTotal).ThenBy(x => x.Id), ("discountTotal", true) => query.OrderByDescending(x => x.DiscountTotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadSalesQuoteValue(SalesQuote x, string code) => code switch
    {
        "code" => x.Code, "customerCode" => x.Customer.Code, "customerName" => x.Customer.Name,
        "quoteDate" => x.QuoteDate, "validUntil" => x.ValidUntil, "currencyCode" => x.CurrencyCode,
        "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "discountTotal" => x.DiscountTotal,
        "taxTotal" => x.TaxTotal, "grandTotal" => x.GrandTotal, "orderCode" => x.Order?.Code, "createdAt" => x.CreatedAt, _ => null
    };

    private static object? ReadPurchaseSupplierQuoteValue(PurchaseSupplierQuote x, string code) => code switch
    {
        "code" => x.Code, "requestCode" => x.PurchaseRequest.Code, "supplierCode" => x.Supplier.Code, "supplierName" => x.Supplier.Name,
        "quoteDate" => x.QuoteDate, "validUntil" => x.ValidUntil, "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(),
        "subtotal" => x.Subtotal, "discountTotal" => x.DiscountTotal, "taxTotal" => x.TaxTotal, "grandTotal" => x.GrandTotal,
        "createdAt" => x.CreatedAt, _ => null
    };

    private static object? ReadSalesOrderValue(SalesOrder x, string code) => code switch
    {
        "code" => x.Code, "customerCode" => x.Customer.Code, "customerName" => x.Customer.Name, "orderDate" => x.OrderDate,
        "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "taxTotal" => x.TaxTotal,
        "grandTotal" => x.GrandTotal, "createdAt" => x.CreatedAt, _ => null
    };

    private static IQueryable<SalesDelivery> ApplySalesDeliverySort(IQueryable<SalesDelivery> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("orderCode", false) => query.OrderBy(x => x.Order.Code).ThenBy(x => x.Id), ("orderCode", true) => query.OrderByDescending(x => x.Order.Code).ThenBy(x => x.Id),
        ("customerCode", false) => query.OrderBy(x => x.Order.Customer.Code).ThenBy(x => x.Id), ("customerCode", true) => query.OrderByDescending(x => x.Order.Customer.Code).ThenBy(x => x.Id),
        ("customerName", false) => query.OrderBy(x => x.Order.Customer.Name).ThenBy(x => x.Id), ("customerName", true) => query.OrderByDescending(x => x.Order.Customer.Name).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => x.Warehouse.Code).ThenBy(x => x.Id), ("warehouseCode", true) => query.OrderByDescending(x => x.Warehouse.Code).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => x.Warehouse.Name).ThenBy(x => x.Id), ("warehouseName", true) => query.OrderByDescending(x => x.Warehouse.Name).ThenBy(x => x.Id),
        ("deliveryDate", false) => query.OrderBy(x => x.DeliveryDate).ThenBy(x => x.Id), ("deliveryDate", true) => query.OrderByDescending(x => x.DeliveryDate).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("lineCount", false) => query.OrderBy(x => x.Lines.Count).ThenBy(x => x.Id), ("lineCount", true) => query.OrderByDescending(x => x.Lines.Count).ThenBy(x => x.Id),
        ("totalQuantity", false) => query.OrderBy(x => x.Lines.Sum(line => line.Quantity)).ThenBy(x => x.Id), ("totalQuantity", true) => query.OrderByDescending(x => x.Lines.Sum(line => line.Quantity)).ThenBy(x => x.Id),
        ("invoiceCode", false) => query.OrderBy(x => x.Invoice == null ? null : x.Invoice.Code).ThenBy(x => x.Id), ("invoiceCode", true) => query.OrderByDescending(x => x.Invoice == null ? null : x.Invoice.Code).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadSalesDeliveryValue(SalesDelivery x, string code) => code switch
    {
        "code" => x.Code, "orderCode" => x.Order.Code, "customerCode" => x.Order.Customer.Code, "customerName" => x.Order.Customer.Name,
        "warehouseCode" => x.Warehouse.Code, "warehouseName" => x.Warehouse.Name, "deliveryDate" => x.DeliveryDate,
        "status" => x.Status.ToString(), "lineCount" => x.Lines.Count, "totalQuantity" => x.Lines.Sum(line => line.Quantity),
        "invoiceCode" => x.Invoice?.Code, "createdAt" => x.CreatedAt, _ => null
    };

    private static IQueryable<SalesReturn> ApplySalesReturnSort(IQueryable<SalesReturn> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("invoiceCode", false) => query.OrderBy(x => x.SalesInvoice.Code).ThenBy(x => x.Id), ("invoiceCode", true) => query.OrderByDescending(x => x.SalesInvoice.Code).ThenBy(x => x.Id),
        ("customerCode", false) => query.OrderBy(x => x.Customer.Code).ThenBy(x => x.Id), ("customerCode", true) => query.OrderByDescending(x => x.Customer.Code).ThenBy(x => x.Id),
        ("customerName", false) => query.OrderBy(x => x.Customer.Name).ThenBy(x => x.Id), ("customerName", true) => query.OrderByDescending(x => x.Customer.Name).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => x.Warehouse.Code).ThenBy(x => x.Id), ("warehouseCode", true) => query.OrderByDescending(x => x.Warehouse.Code).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => x.Warehouse.Name).ThenBy(x => x.Id), ("warehouseName", true) => query.OrderByDescending(x => x.Warehouse.Name).ThenBy(x => x.Id),
        ("returnDate", false) => query.OrderBy(x => x.ReturnDate).ThenBy(x => x.Id), ("returnDate", true) => query.OrderByDescending(x => x.ReturnDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.SalesInvoice.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.SalesInvoice.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("discountTotal", false) => query.OrderBy(x => x.DiscountTotal).ThenBy(x => x.Id), ("discountTotal", true) => query.OrderByDescending(x => x.DiscountTotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("lineCount", false) => query.OrderBy(x => x.Lines.Count).ThenBy(x => x.Id), ("lineCount", true) => query.OrderByDescending(x => x.Lines.Count).ThenBy(x => x.Id),
        ("totalQuantity", false) => query.OrderBy(x => x.Lines.Sum(line => line.Quantity)).ThenBy(x => x.Id), ("totalQuantity", true) => query.OrderByDescending(x => x.Lines.Sum(line => line.Quantity)).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static IQueryable<SupplierReturn> ApplySupplierReturnSort(IQueryable<SupplierReturn> query, string field, bool descending) => (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("invoiceCode", false) => query.OrderBy(x => x.PurchaseInvoice.Code).ThenBy(x => x.Id), ("invoiceCode", true) => query.OrderByDescending(x => x.PurchaseInvoice.Code).ThenBy(x => x.Id),
        ("supplierCode", false) => query.OrderBy(x => x.Supplier.Code).ThenBy(x => x.Id), ("supplierCode", true) => query.OrderByDescending(x => x.Supplier.Code).ThenBy(x => x.Id),
        ("supplierName", false) => query.OrderBy(x => x.Supplier.Name).ThenBy(x => x.Id), ("supplierName", true) => query.OrderByDescending(x => x.Supplier.Name).ThenBy(x => x.Id),
        ("warehouseCode", false) => query.OrderBy(x => x.Warehouse.Code).ThenBy(x => x.Id), ("warehouseCode", true) => query.OrderByDescending(x => x.Warehouse.Code).ThenBy(x => x.Id),
        ("warehouseName", false) => query.OrderBy(x => x.Warehouse.Name).ThenBy(x => x.Id), ("warehouseName", true) => query.OrderByDescending(x => x.Warehouse.Name).ThenBy(x => x.Id),
        ("returnDate", false) => query.OrderBy(x => x.ReturnDate).ThenBy(x => x.Id), ("returnDate", true) => query.OrderByDescending(x => x.ReturnDate).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("discountTotal", false) => query.OrderBy(x => x.DiscountTotal).ThenBy(x => x.Id), ("discountTotal", true) => query.OrderByDescending(x => x.DiscountTotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("lineCount", false) => query.OrderBy(x => x.Lines.Count()).ThenBy(x => x.Id), ("lineCount", true) => query.OrderByDescending(x => x.Lines.Count()).ThenBy(x => x.Id),
        ("totalQuantity", false) => query.OrderBy(x => x.Lines.Sum(line => line.Quantity)).ThenBy(x => x.Id), ("totalQuantity", true) => query.OrderByDescending(x => x.Lines.Sum(line => line.Quantity)).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadSupplierReturnValue(SupplierReturnReportRow x, string code) => code switch
    {
        "code" => x.Code, "invoiceCode" => x.InvoiceCode, "supplierCode" => x.SupplierCode, "supplierName" => x.SupplierName,
        "warehouseCode" => x.WarehouseCode, "warehouseName" => x.WarehouseName, "returnDate" => x.ReturnDate,
        "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "discountTotal" => x.DiscountTotal,
        "taxTotal" => x.TaxTotal, "grandTotal" => x.GrandTotal, "lineCount" => x.LineCount,
        "totalQuantity" => x.TotalQuantity, "createdAt" => x.CreatedAt, _ => null
    };

    private static object? ReadSalesReturnValue(SalesReturn x, string code) => code switch
    {
        "code" => x.Code, "invoiceCode" => x.SalesInvoice.Code, "customerCode" => x.Customer.Code, "customerName" => x.Customer.Name,
        "warehouseCode" => x.Warehouse.Code, "warehouseName" => x.Warehouse.Name, "returnDate" => x.ReturnDate,
        "currencyCode" => x.SalesInvoice.CurrencyCode, "status" => x.Status.ToString(), "subtotal" => x.Subtotal,
        "discountTotal" => x.DiscountTotal, "taxTotal" => x.TaxTotal, "grandTotal" => x.GrandTotal,
        "lineCount" => x.Lines.Count, "totalQuantity" => x.Lines.Sum(line => line.Quantity), "createdAt" => x.CreatedAt, _ => null
    };

    private static bool TryApplyInvoiceFilter(ref IQueryable<SalesInvoice> query, TenantDbContext db, ReportFilter filter, out string? error)
    {
        error = null;
        var value = filter.Value?.Trim() ?? "";
        switch (filter.Field)
        {
            case "code":
                query = filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value); return true;
            case "customerCode":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Code.Contains(value)) : query.Where(x => x.Customer.Code == value); return true;
            case "customerName":
                query = filter.Operator == "contains" ? query.Where(x => x.Customer.Name.Contains(value)) : query.Where(x => x.Customer.Name == value); return true;
            case "currencyCode":
                query = filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value); return true;
            case "status":
                if (!Enum.TryParse<SalesInvoiceStatus>(value, true, out var status)) { error = "Fatura durumu geçersiz."; return false; }
                query = query.Where(x => x.Status == status); return true;
            case "invoiceDate":
                if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var invoiceDate)) { error = "Fatura tarihi YYYY-MM-DD biçiminde olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.InvoiceDate > invoiceDate), "gte" => query.Where(x => x.InvoiceDate >= invoiceDate), "lt" => query.Where(x => x.InvoiceDate < invoiceDate), _ => query.Where(x => x.InvoiceDate <= invoiceDate) }; return true;
            case "createdAt":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var createdAt)) { error = "Oluşturulma filtresi ISO tarih olmalıdır."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > createdAt), "gte" => query.Where(x => x.CreatedAt >= createdAt), "lt" => query.Where(x => x.CreatedAt < createdAt), _ => query.Where(x => x.CreatedAt <= createdAt) }; return true;
            case "paidAmount": case "returnedAmount": case "outstandingAmount": case "subtotal": case "taxTotal": case "grandTotal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) { error = "Tutar filtresi geçersiz."; return false; }
                if (filter.Field == "outstandingAmount")
                {
                    query = ApplySalesInvoiceOutstandingFilter(query, db, filter.Operator, amount);
                    return true;
                }
                if (filter.Field == "paidAmount")
                {
                    query = filter.Operator switch
                    {
                        "gt" => query.Where(x => (db.CustomerCollectionAllocations.Where(a => a.TenantId == x.TenantId && a.SalesInvoiceId == x.Id && a.CustomerCollection.TenantId == x.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m) > amount),
                        "gte" => query.Where(x => (db.CustomerCollectionAllocations.Where(a => a.TenantId == x.TenantId && a.SalesInvoiceId == x.Id && a.CustomerCollection.TenantId == x.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m) >= amount),
                        "lt" => query.Where(x => (db.CustomerCollectionAllocations.Where(a => a.TenantId == x.TenantId && a.SalesInvoiceId == x.Id && a.CustomerCollection.TenantId == x.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m) < amount),
                        "lte" => query.Where(x => (db.CustomerCollectionAllocations.Where(a => a.TenantId == x.TenantId && a.SalesInvoiceId == x.Id && a.CustomerCollection.TenantId == x.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m) <= amount),
                        _ => query.Where(x => (db.CustomerCollectionAllocations.Where(a => a.TenantId == x.TenantId && a.SalesInvoiceId == x.Id && a.CustomerCollection.TenantId == x.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m) == amount)
                    };
                    return true;
                }
                if (filter.Field == "returnedAmount")
                {
                    query = filter.Operator switch
                    {
                        "gt" => query.Where(x => (db.SalesReturns.Where(r => r.TenantId == x.TenantId && r.SalesInvoiceId == x.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) > amount),
                        "gte" => query.Where(x => (db.SalesReturns.Where(r => r.TenantId == x.TenantId && r.SalesInvoiceId == x.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) >= amount),
                        "lt" => query.Where(x => (db.SalesReturns.Where(r => r.TenantId == x.TenantId && r.SalesInvoiceId == x.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) < amount),
                        "lte" => query.Where(x => (db.SalesReturns.Where(r => r.TenantId == x.TenantId && r.SalesInvoiceId == x.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) <= amount),
                        _ => query.Where(x => (db.SalesReturns.Where(r => r.TenantId == x.TenantId && r.SalesInvoiceId == x.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m) == amount)
                    };
                    return true;
                }
                query = (filter.Field, filter.Operator) switch
                {
                    ("subtotal", "gt") => query.Where(x => x.Subtotal > amount), ("subtotal", "gte") => query.Where(x => x.Subtotal >= amount),
                    ("subtotal", "lt") => query.Where(x => x.Subtotal < amount), ("subtotal", "lte") => query.Where(x => x.Subtotal <= amount), ("subtotal", _) => query.Where(x => x.Subtotal == amount),
                    ("taxTotal", "gt") => query.Where(x => x.TaxTotal > amount), ("taxTotal", "gte") => query.Where(x => x.TaxTotal >= amount),
                    ("taxTotal", "lt") => query.Where(x => x.TaxTotal < amount), ("taxTotal", "lte") => query.Where(x => x.TaxTotal <= amount), ("taxTotal", _) => query.Where(x => x.TaxTotal == amount),
                    (_, "gt") => query.Where(x => x.GrandTotal > amount), (_, "gte") => query.Where(x => x.GrandTotal >= amount),
                    (_, "lt") => query.Where(x => x.GrandTotal < amount), (_, "lte") => query.Where(x => x.GrandTotal <= amount), _ => query.Where(x => x.GrandTotal == amount)
                }; return true;
            default: error = "Satış faturası filtre alanı geçersiz."; return false;
        }
    }

    private static IQueryable<SalesInvoice> ApplySalesInvoiceOutstandingFilter(IQueryable<SalesInvoice> query, TenantDbContext db, string operation, decimal amount)
    {
        var balances = from invoice in query
            let paid = db.CustomerCollectionAllocations.Where(a => a.TenantId == invoice.TenantId && a.SalesInvoiceId == invoice.Id && a.CustomerCollection.TenantId == invoice.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m
            let returned = db.SalesReturns.Where(r => r.TenantId == invoice.TenantId && r.SalesInvoiceId == invoice.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m
            let raw = invoice.GrandTotal - paid - returned
            select new { Invoice = invoice, Outstanding = raw > 0m ? raw : 0m };
        var filtered = operation switch
        {
            "gt" => balances.Where(x => x.Outstanding > amount), "gte" => balances.Where(x => x.Outstanding >= amount),
            "lt" => balances.Where(x => x.Outstanding < amount), "lte" => balances.Where(x => x.Outstanding <= amount),
            _ => balances.Where(x => x.Outstanding == amount)
        };
        return filtered.Select(x => x.Invoice);
    }

    private static async Task<Dictionary<Guid, decimal>> GetPostedCollectionTotalsAsync(TenantDbContext db, Guid tenantId, Guid[] invoiceIds, CancellationToken ct)
    {
        if (invoiceIds.Length == 0) return [];
        return await db.CustomerCollectionAllocations.AsNoTracking()
            .Where(a => a.TenantId == tenantId && invoiceIds.Contains(a.SalesInvoiceId) &&
                a.CustomerCollection.TenantId == tenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted)
            .GroupBy(a => a.SalesInvoiceId)
            .Select(group => new { InvoiceId = group.Key, Amount = group.Sum(a => a.Amount) })
            .ToDictionaryAsync(x => x.InvoiceId, x => x.Amount, ct);
    }

    private static async Task<Dictionary<Guid, decimal>> GetPostedSalesReturnTotalsAsync(TenantDbContext db, Guid tenantId, Guid[] invoiceIds, CancellationToken ct)
    {
        if (invoiceIds.Length == 0) return [];
        return await db.SalesReturns.AsNoTracking()
            .Where(r => r.TenantId == tenantId && invoiceIds.Contains(r.SalesInvoiceId) && r.Status == SalesReturnStatus.Posted)
            .GroupBy(r => r.SalesInvoiceId)
            .Select(group => new { InvoiceId = group.Key, Amount = group.Sum(r => r.GrandTotal) })
            .ToDictionaryAsync(x => x.InvoiceId, x => x.Amount, ct);
    }

    private static IQueryable<SalesInvoice> ApplyInvoiceSort(IQueryable<SalesInvoice> query, TenantDbContext db, string field, bool descending)
    {
        if (field == "paidAmount")
            return descending
                ? query.OrderByDescending(invoice => db.CustomerCollectionAllocations.Where(a => a.TenantId == invoice.TenantId && a.SalesInvoiceId == invoice.Id && a.CustomerCollection.TenantId == invoice.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => db.CustomerCollectionAllocations.Where(a => a.TenantId == invoice.TenantId && a.SalesInvoiceId == invoice.Id && a.CustomerCollection.TenantId == invoice.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m).ThenBy(invoice => invoice.Id);
        if (field == "returnedAmount")
            return descending
                ? query.OrderByDescending(invoice => db.SalesReturns.Where(r => r.TenantId == invoice.TenantId && r.SalesInvoiceId == invoice.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => db.SalesReturns.Where(r => r.TenantId == invoice.TenantId && r.SalesInvoiceId == invoice.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m).ThenBy(invoice => invoice.Id);
        if (field == "outstandingAmount")
        {
            var balances = from invoice in query
                let paid = db.CustomerCollectionAllocations.Where(a => a.TenantId == invoice.TenantId && a.SalesInvoiceId == invoice.Id && a.CustomerCollection.TenantId == invoice.TenantId && a.CustomerCollection.Status == CustomerCollectionStatus.Posted).Sum(a => (decimal?)a.Amount) ?? 0m
                let returned = db.SalesReturns.Where(r => r.TenantId == invoice.TenantId && r.SalesInvoiceId == invoice.Id && r.Status == SalesReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m
                let raw = invoice.GrandTotal - paid - returned
                select new { Invoice = invoice, Outstanding = raw > 0m ? raw : 0m };
            return (descending
                ? balances.OrderByDescending(x => x.Outstanding).ThenBy(x => x.Invoice.Id)
                : balances.OrderBy(x => x.Outstanding).ThenBy(x => x.Invoice.Id)).Select(x => x.Invoice);
        }
        return (field, descending) switch
    {
        ("code", false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), ("code", true) => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id),
        ("customerCode", false) => query.OrderBy(x => x.Customer.Code).ThenBy(x => x.Id), ("customerCode", true) => query.OrderByDescending(x => x.Customer.Code).ThenBy(x => x.Id),
        ("customerName", false) => query.OrderBy(x => x.Customer.Name).ThenBy(x => x.Id), ("customerName", true) => query.OrderByDescending(x => x.Customer.Name).ThenBy(x => x.Id),
        ("invoiceDate", false) => query.OrderBy(x => x.InvoiceDate).ThenBy(x => x.Id), ("invoiceDate", true) => query.OrderByDescending(x => x.InvoiceDate).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("status", false) => query.OrderBy(x => x.Status).ThenBy(x => x.Id), ("status", true) => query.OrderByDescending(x => x.Status).ThenBy(x => x.Id),
        ("subtotal", false) => query.OrderBy(x => x.Subtotal).ThenBy(x => x.Id), ("subtotal", true) => query.OrderByDescending(x => x.Subtotal).ThenBy(x => x.Id),
        ("taxTotal", false) => query.OrderBy(x => x.TaxTotal).ThenBy(x => x.Id), ("taxTotal", true) => query.OrderByDescending(x => x.TaxTotal).ThenBy(x => x.Id),
        ("grandTotal", false) => query.OrderBy(x => x.GrandTotal).ThenBy(x => x.Id), ("grandTotal", true) => query.OrderByDescending(x => x.GrandTotal).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
        };
    }

    private static object? ReadInvoiceValue(SalesInvoice x, string code, decimal paidAmount, decimal returnedAmount) => code switch
    {
        "code" => x.Code, "customerCode" => x.Customer.Code, "customerName" => x.Customer.Name, "invoiceDate" => x.InvoiceDate,
        "currencyCode" => x.CurrencyCode, "status" => x.Status.ToString(), "subtotal" => x.Subtotal, "taxTotal" => x.TaxTotal,
        "grandTotal" => x.GrandTotal, "paidAmount" => paidAmount, "returnedAmount" => returnedAmount,
        "outstandingAmount" => Math.Max(0m, x.GrandTotal - paidAmount - returnedAmount),
        "createdAt" => x.CreatedAt, _ => null
    };

    private static async Task<AggregatePage> AggregateInvoicesAsync(IQueryable<SalesInvoice> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateInvoiceSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<SalesInvoice, string>>)(x => x.Code),
            "customerCode" => (Expression<Func<SalesInvoice, string>>)(x => x.Customer.Code),
            "customerName" => (Expression<Func<SalesInvoice, string>>)(x => x.Customer.Name),
            "invoiceDate" => (Expression<Func<SalesInvoice, DateOnly>>)(x => x.InvoiceDate),
            "currencyCode" => (Expression<Func<SalesInvoice, string>>)(x => x.CurrencyCode),
            "status" => (Expression<Func<SalesInvoice, SalesInvoiceStatus>>)(x => x.Status),
            "subtotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.Subtotal),
            "taxTotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.TaxTotal),
            "grandTotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.GrandTotal),
            "createdAt" => (Expression<Func<SalesInvoice, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported invoice grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumGrandTotal" or "averageGrandTotal" => (LambdaExpression)(Expression<Func<SalesInvoice, decimal>>)(x => x.GrandTotal),
            "sumTaxTotal" or "averageTaxTotal" => (Expression<Func<SalesInvoice, decimal>>)(x => x.TaxTotal),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregatePurchaseOrdersAsync(IQueryable<PurchaseOrder> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregatePurchaseOrderSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<PurchaseOrder, string>>)(x => x.Code),
            "supplierCode" => (Expression<Func<PurchaseOrder, string>>)(x => x.Supplier.Code),
            "supplierName" => (Expression<Func<PurchaseOrder, string>>)(x => x.Supplier.Name),
            "orderDate" => (Expression<Func<PurchaseOrder, DateOnly>>)(x => x.OrderDate),
            "currencyCode" => (Expression<Func<PurchaseOrder, string>>)(x => x.CurrencyCode),
            "status" => (Expression<Func<PurchaseOrder, PurchaseOrderStatus>>)(x => x.Status),
            "subtotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.Subtotal),
            "taxTotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.TaxTotal),
            "grandTotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.GrandTotal),
            "createdAt" => (Expression<Func<PurchaseOrder, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported purchase-order grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumGrandTotal" or "averageGrandTotal" => (LambdaExpression)(Expression<Func<PurchaseOrder, decimal>>)(x => x.GrandTotal),
            "sumTaxTotal" or "averageTaxTotal" => (Expression<Func<PurchaseOrder, decimal>>)(x => x.TaxTotal),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregatePurchaseOrderSingleAsync(IQueryable<PurchaseOrder> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "supplierCode" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Supplier.Code), aggregate, descending, skip, take, ct),
        "supplierName" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Supplier.Name), aggregate, descending, skip, take, ct),
        "orderDate" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.OrderDate), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "status" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Status), aggregate, descending, skip, take, ct),
        "subtotal" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.Subtotal), aggregate, descending, skip, take, ct),
        "taxTotal" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.TaxTotal), aggregate, descending, skip, take, ct),
        "grandTotal" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.GrandTotal), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregatePurchaseOrderGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregatePurchaseOrderGroups<TKey>(IQueryable<IGrouping<TKey, PurchaseOrder>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.GrandTotal))).ToListAsync(ct),
            "averageGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.GrandTotal))).ToListAsync(ct),
            "sumTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.TaxTotal))).ToListAsync(ct),
            "averageTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.TaxTotal))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(row => row with { GroupValue = row.GroupValue is PurchaseOrderStatus status ? status.ToString() : row.GroupValue }).ToArray(), total);
    }

    private static async Task<AggregatePage> AggregateSalesOrdersAsync(IQueryable<SalesOrder> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateSalesOrderSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<SalesOrder, string>>)(x => x.Code),
            "customerCode" => (Expression<Func<SalesOrder, string>>)(x => x.Customer.Code),
            "customerName" => (Expression<Func<SalesOrder, string>>)(x => x.Customer.Name),
            "orderDate" => (Expression<Func<SalesOrder, DateOnly>>)(x => x.OrderDate),
            "currencyCode" => (Expression<Func<SalesOrder, string>>)(x => x.CurrencyCode),
            "status" => (Expression<Func<SalesOrder, SalesOrderStatus>>)(x => x.Status),
            "subtotal" => (Expression<Func<SalesOrder, decimal>>)(x => x.Subtotal),
            "taxTotal" => (Expression<Func<SalesOrder, decimal>>)(x => x.TaxTotal),
            "grandTotal" => (Expression<Func<SalesOrder, decimal>>)(x => x.GrandTotal),
            "createdAt" => (Expression<Func<SalesOrder, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported purchase-order grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumGrandTotal" or "averageGrandTotal" => (LambdaExpression)(Expression<Func<SalesOrder, decimal>>)(x => x.GrandTotal),
            "sumTaxTotal" or "averageTaxTotal" => (Expression<Func<SalesOrder, decimal>>)(x => x.TaxTotal),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregateSalesOrderSingleAsync(IQueryable<SalesOrder> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateSalesOrderGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "customerCode" => await AggregateSalesOrderGroups(query.GroupBy(x => x.Customer.Code), aggregate, descending, skip, take, ct),
        "customerName" => await AggregateSalesOrderGroups(query.GroupBy(x => x.Customer.Name), aggregate, descending, skip, take, ct),
        "orderDate" => await AggregateSalesOrderGroups(query.GroupBy(x => x.OrderDate), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregateSalesOrderGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "status" => await AggregateSalesOrderGroups(query.GroupBy(x => x.Status), aggregate, descending, skip, take, ct),
        "subtotal" => await AggregateSalesOrderGroups(query.GroupBy(x => x.Subtotal), aggregate, descending, skip, take, ct),
        "taxTotal" => await AggregateSalesOrderGroups(query.GroupBy(x => x.TaxTotal), aggregate, descending, skip, take, ct),
        "grandTotal" => await AggregateSalesOrderGroups(query.GroupBy(x => x.GrandTotal), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateSalesOrderGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateSalesOrderGroups<TKey>(IQueryable<IGrouping<TKey, SalesOrder>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.GrandTotal))).ToListAsync(ct),
            "averageGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.GrandTotal))).ToListAsync(ct),
            "sumTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.TaxTotal))).ToListAsync(ct),
            "averageTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.TaxTotal))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(row => row with { GroupValue = row.GroupValue is SalesOrderStatus status ? status.ToString() : row.GroupValue }).ToArray(), total);
    }

    private static async Task<AggregatePage> AggregateInvoiceSingleAsync(IQueryable<SalesInvoice> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateInvoiceGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "customerCode" => await AggregateInvoiceGroups(query.GroupBy(x => x.Customer.Code), aggregate, descending, skip, take, ct),
        "customerName" => await AggregateInvoiceGroups(query.GroupBy(x => x.Customer.Name), aggregate, descending, skip, take, ct),
        "invoiceDate" => await AggregateInvoiceGroups(query.GroupBy(x => x.InvoiceDate), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregateInvoiceGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "status" => await AggregateInvoiceGroups(query.GroupBy(x => x.Status), aggregate, descending, skip, take, ct),
        "subtotal" => await AggregateInvoiceGroups(query.GroupBy(x => x.Subtotal), aggregate, descending, skip, take, ct),
        "taxTotal" => await AggregateInvoiceGroups(query.GroupBy(x => x.TaxTotal), aggregate, descending, skip, take, ct),
        "grandTotal" => await AggregateInvoiceGroups(query.GroupBy(x => x.GrandTotal), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateInvoiceGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateInvoiceGroups<TKey>(IQueryable<IGrouping<TKey, SalesInvoice>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.GrandTotal))).ToListAsync(ct),
            "averageGrandTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.GrandTotal))).ToListAsync(ct),
            "sumTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.TaxTotal))).ToListAsync(ct),
            "averageTaxTotal" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.TaxTotal))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(x => x with { GroupValue = x.GroupValue is SalesInvoiceStatus status ? status.ToString() : x.GroupValue }).ToArray(), total);
    }

    private static bool Validate(ReportRunRequest? request, out NormalizedReport? normalized, out Dictionary<string, string[]>? errors)
    {
        normalized = null; errors = new Dictionary<string, string[]>();
        var columns = request is null ? [] : ColumnsForSource(request.Source);
        var aggregates = request is null ? [] : AggregatesForSource(request.Source);
        if (request is null || columns.Count == 0) errors["source"] = ["Desteklenmeyen rapor kaynağı."];
        if (request?.Columns is not { Count: > 0 and <= 12 } || request.Columns.Distinct(StringComparer.Ordinal).Count() != request.Columns.Count
            || request.Columns.Any(code => !columns.Any(x => x.Code == code)))
            errors["columns"] = ["1-12 benzersiz ve izin verilen sütun seçin."];
        if (request?.Filters is { Count: > 8 }) errors["filters"] = ["En fazla 8 filtre kullanılabilir."];
        if (request?.Filters is not null)
        {
            foreach (var filter in request.Filters)
            {
                if (filter is null || string.IsNullOrWhiteSpace(filter.Field) || !columns.Any(x => x.Code == filter.Field))
                {
                    errors["filters"] = ["Filtrelerde yalnız katalogdaki alanlar kullanılabilir."];
                    break;
                }
                var isNullFilter = filter.Operator == "isNull";
                if ((!isNullFilter && (filter.Value is null || filter.Value.Length is < 1 or > 200)) || (isNullFilter && !string.IsNullOrEmpty(filter.Value)))
                {
                    errors["filters"] = ["Filtre değeri 1-200 karakter olmalı; boş değer filtresi değer almamalıdır."];
                    break;
                }
                var type = columns.First(x => x.Code == filter.Field).DataType;
                if (request.Source == "inventoryTransfers" && filter.Field is not ("code" or "status" or "transferDate" or "createdAt" or "fromWarehouseCode" or "fromWarehouseName" or "toWarehouseCode" or "toWarehouseName"))
                {
                    errors["filters"] = ["Depo transferlerinde yalnız kod, durum, tarih ve kaynak/hedef depo alanları filtrelenebilir."];
                    break;
                }
                var allowed = type switch
                {
                    "text" when request.Source == "inventoryTransactions" && filter.Field is "direction" or "transactionId" or "reversalOfId" => filter.Operator == "equals",
                    "text" when request.Source == "financialAccountTransactions" && filter.Field is "accountType" or "direction" or "sourceType" => filter.Operator == "equals",
                    "text" when request.Source == "financialAccountTransactions" && filter.Field == "reversalOfId" => filter.Operator is "equals" or "isNull",
                    "text" when request.Source == "financialAccountTransactions" && filter.Field is "reference" or "sourceCode" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "bankStatementLines" && filter.Field is "externalId" or "reference" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "bankStatementLines" && filter.Field == "transactionId" => filter.Operator is "equals" or "isNull",
                    "text" when request.Source == "bankStatementLines" && filter.Field == "direction" => filter.Operator == "equals",
                    "text" when request.Source == "financialAccountTransfers" && filter.Field == "reference" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "financialAccountTransfers" && filter.Field == "status" => filter.Operator == "equals",
                    "text" when request.Source == "salesDeliveries" && filter.Field == "invoiceCode" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "salesQuotes" && filter.Field == "orderCode" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "purchaseSupplierQuotes" && filter.Field is "status" => filter.Operator == "equals",
                    "text" when request.Source == "supplierPayments" && filter.Field == "status" => filter.Operator == "equals",
                    "text" when request.Source == "supplierPayments" && filter.Field is "reference" or "accountCode" or "accountName" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "financialAccountTransfers" && filter.Field is "fromAccountCode" or "fromAccountName" or "toAccountCode" or "toAccountName" or "currencyCode" or "toCurrencyCode" or "description" or "code" => filter.Operator is "contains" or "equals",
                    "text" when request.Source == "fxRevaluationLines" && filter.Field == "direction" => filter.Operator == "equals",
                    "text" when request.Source == "crmOpportunities" && filter.Field == "stage" => filter.Operator == "equals",
                    "text" when request.Source == "crmOpportunities" && filter.Field is "customerCode" or "customerName" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "crmOpportunities" && filter.Field == "currencyCode" => filter.Operator is "contains" or "equals",
                    "text" when request.Source == "customerLedgerEntries" && filter.Field is "direction" or "sourceType" or "counterpartyType" => filter.Operator == "equals",
                    "text" when request.Source == "customerLedgerEntries" && filter.Field == "reversalOfId" => filter.Operator is "equals" or "isNull",
                    "text" when request.Source == "customerLedgerEntries" && filter.Field == "sourceCode" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when request.Source == "customerLedgerEntries" && filter.Field is "collectionPaymentMethod" or "collectionAccountCode" or "collectionReference" => filter.Operator is "contains" or "equals" or "isNull",
                    "text" when filter.Field is "type" or "status" or "trackingMode" or "requesterUserId" => filter.Operator == "equals",
                    "text" when request.Source == "purchaseOrderFulfillment" && filter.Field == "status" => filter.Operator == "equals",
                    "text" when request.Source == "workflowInstances" && filter.Field is "subjectType" or "status" or "startedByUserId" => filter.Operator == "equals",
                    "text" when request.Source == "stockItems" && (filter.Field is "barcode" or "category") => filter.Operator is "contains" or "equals" or "isNull",
                    "text" => filter.Operator is "contains" or "equals",
                    "boolean" => (filter.Field is "isActive" or "isBalanced" or "belowMinimum" or "isMatched" or "bookEntryCreated") && filter.Operator == "equals",
                    "decimal" when request.Source == "customers" && filter.Field == "riskLimit" => filter.Operator is "equals" or "gt" or "gte" or "lt" or "lte" or "isNull",
                    "decimal" when request.Source == "crmOpportunities" && filter.Field == "estimatedValue" => filter.Operator is "equals" or "gt" or "gte" or "lt" or "lte" or "isNull",
                    "number" when request.Source == "crmOpportunities" && filter.Field == "probabilityPercent" => filter.Operator is "equals" or "gt" or "gte" or "lt" or "lte",
                    "decimal" or "number" => filter.Operator is "equals" or "gt" or "gte" or "lt" or "lte",
                    "date" when request.Source == "salesOrderFulfillment" && filter.Field == "requestedDeliveryDate" => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" when request.Source == "purchaseOrderFulfillment" && filter.Field == "expectedReceiptDate" => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" when request.Source == "purchaseRequests" && (filter.Field is "neededByDate" or "reviewedAt") => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" when request.Source == "purchaseSupplierQuotes" && filter.Field == "validUntil" => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" when request.Source == "workflowInstances" && filter.Field == "completedAt" => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" when request.Source == "bankStatementLines" && filter.Field == "matchedAt" => filter.Operator is "gt" or "gte" or "lt" or "lte" or "equals" or "isNull",
                    "date" when request.Source == "crmOpportunities" && filter.Field is "expectedCloseDate" or "nextActivityAt" => filter.Operator is "gt" or "gte" or "lt" or "lte" or "isNull",
                    "date" when request.Source == "crmOpportunities" && filter.Field is "createdAt" or "updatedAt" => filter.Operator is "gt" or "gte" or "lt" or "lte",
                    "date" => filter.Operator is "gt" or "gte" or "lt" or "lte",
                    _ => false
                };
                if (!allowed) { errors["filters"] = [$"{filter.Field} alanı için filtre operatörü geçersiz."]; break; }
            }
        }
        var sortBy = request?.SortBy ?? "code";
        if (!columns.Any(x => x.Code == sortBy)) errors["sortBy"] = ["Sıralama sütunu geçersiz."];
        if (request?.Source == "inventoryTransfers" && sortBy is not ("code" or "transferDate" or "status" or "createdAt"))
            errors["sortBy"] = ["Depo transferleri kod, transfer tarihi, durum veya oluşturulma tarihine göre sıralanabilir."];
        if (request?.Source == "warehouseStock" && sortBy is not ("stockCode" or "stockName" or "unitCode" or "warehouseCode" or "warehouseName" or "onHand" or "reserved" or "available"))
            errors["sortBy"] = ["Depo stok bakiyesi stok, depo veya miktar alanlarına göre sıralanabilir."];
        if (request?.Source == "purchaseOrderFulfillment" && sortBy is not ("orderCode" or "supplierCode" or "expectedReceiptDate" or "stockCode" or "receivedQuantity" or "outstandingQuantity" or "orderDate"))
            errors["sortBy"] = ["Satın alma karşılama raporu sipariş, tedarikçi, beklenen tarih, stok veya miktara göre sıralanabilir."];
        var requestedGroupFields = request?.GroupByFields is { Count: > 0 }
            ? request.GroupByFields.ToArray()
            : string.IsNullOrWhiteSpace(request?.GroupBy) ? [] : [request!.GroupBy!];
        var groupFields = requestedGroupFields.Where(field => !string.IsNullOrWhiteSpace(field)).ToArray();
        if (requestedGroupFields.Length > 3 || groupFields.Length != requestedGroupFields.Length ||
            groupFields.Length != groupFields.Distinct(StringComparer.Ordinal).Count() ||
            groupFields.Any(field => !columns.Any(x => x.Code == field)))
            errors["groupByFields"] = ["En fazla 3 benzersiz ve katalogda bulunan alanla gruplayın."];
        if (request?.Source == "purchaseRequests" && (groupFields.Length > 1 || groupFields.Any(field => field is not ("code" or "status" or "requesterUserId" or "requestDate"))))
            errors["groupByFields"] = ["Satın alma talepleri kod, durum, talep sahibi kullanıcı kodu veya talep tarihine göre tek alanla gruplanabilir."];
        if (request?.Source == "purchaseReceipts" && groupFields.Length > 0)
            errors["groupByFields"] = ["Mal kabul raporunda ayrıntı satırları gruplanamaz."];
        if (request?.Source == "inventoryTransfers" && groupFields.Length > 0)
            errors["groupByFields"] = ["Depo transferleri stok ve depo izlenebilirliği için transfer başına ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "salesOrderFulfillment" && groupFields.Length > 0)
            errors["groupByFields"] = ["Sipariş karşılama miktarları izlenebilirlik için sipariş satırı başına ayrıntı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "purchaseOrderFulfillment" && groupFields.Length > 0)
            errors["groupByFields"] = ["Satın alma karşılama miktarları izlenebilirlik için sipariş satırı başına ayrıntı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "bankStatements" && groupFields.Length > 0)
            errors["groupByFields"] = ["Banka ekstreleri uzlaştırma izlenebilirliği için statement başına bir ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "bankStatementLines" && groupFields.Length > 0)
            errors["groupByFields"] = ["Banka ekstresi satırları uzlaştırma izlenebilirliği için satır başına raporlanır; gruplama desteklenmez."];
        if (request?.Source == "financialAccountTransactions" && groupFields.Length > 0)
            errors["groupByFields"] = ["Kasa-banka hareketleri, para birimleri farklı olabileceğinden ve izlenebilirlik için hareket başına bir ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "financialAccountTransfers" && groupFields.Length > 0)
            errors["groupByFields"] = ["Hesap transferleri para birimleri ve kur bilgisi farklı olabileceğinden transfer başına ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "journalEntryLines" && groupFields.Length > 0)
            errors["groupByFields"] = ["Muhasebe fiş satırları borç/alacak denetimi ve hesap izlenebilirliği için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "fxRevaluationLines" && groupFields.Length > 0)
            errors["groupByFields"] = ["Döviz değerleme satırları kur ve hesap izlenebilirliği için belge satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "crmOpportunities" && groupFields.Length > 0)
            errors["groupByFields"] = ["CRM fırsatları para birimleri farklı olabileceğinden ve izlenebilirlik için fırsat başına bir ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source is "customerLedgerEntries" or "supplierLedgerEntries" && groupFields.Length > 0)
            errors["groupByFields"] = ["Cari hareketleri para birimi ve ters kayıt izlenebilirliği için hareket başına ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "manufacturingWorkCenters" && groupFields.Length > 0)
            errors["groupByFields"] = ["Üretim iş merkezleri kapasite ve maliyet denetimi için merkez başına bir ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "purchaseInvoices" && groupFields.Length > 0)
            errors["groupByFields"] = ["Alış faturaları izlenebilirliği korumak için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "salesDeliveries" && groupFields.Length > 0)
            errors["groupByFields"] = ["Satış sevkiyatları izlenebilirliği korumak için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "salesQuotes" && groupFields.Length > 0)
            errors["groupByFields"] = ["Satış teklifleri izlenebilirlik için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "purchaseSupplierQuotes" && groupFields.Length > 0)
            errors["groupByFields"] = ["Tedarikçi teklifleri para birimleri farklı olabileceğinden ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "supplierPayments" && groupFields.Length > 0)
            errors["groupByFields"] = ["Tedarikçi ödemeleri para birimleri farklı olabileceğinden ve izlenebilirlik için ödeme başına ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "salesReturns" && groupFields.Length > 0)
            errors["groupByFields"] = ["Satış iadeleri izlenebilirliği korumak için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "supplierReturns" && groupFields.Length > 0)
            errors["groupByFields"] = ["Tedarikçi iadeleri izlenebilirliği korumak için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "manufacturingOrders" && groupFields.Any(field => field != "status"))
            errors["groupByFields"] = ["Üretim emirleri yalnızca durum alanına göre gruplanabilir."];
        if (request?.Source == "inventoryTransactions" && groupFields.Length > 0)
            errors["groupByFields"] = ["Stok hareketleri izlenebilirliği korumak için ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "warehouseStock" && groupFields.Length > 0)
            errors["groupByFields"] = ["Depo stok bakiyeleri depo ve stok kartı başına bir ayrıntı satırı olarak raporlanır; gruplama desteklenmez."];
        if (request?.Source == "workflowInstances" && groupFields.Any(field => field is not ("workflowCode" or "subjectType" or "status")))
            errors["groupByFields"] = ["İş akışı geçmişi kod, kayıt türü ve durum alanlarına göre gruplanabilir."];
        var aggregate = request?.Aggregate;
        if (!string.IsNullOrWhiteSpace(aggregate) && !aggregates.Any(x => x.Code == aggregate))
            errors["aggregate"] = ["Desteklenmeyen toplama işlemi."];
        if (groupFields.Length == 0 && !string.IsNullOrWhiteSpace(aggregate))
            errors["aggregate"] = ["Toplama işlemi için bir gruplama alanı seçin."];
        if (request?.Source == "purchaseRequests" && groupFields.Length > 0 && aggregate is not (null or "count"))
            errors["aggregate"] = ["Satın alma taleplerinde yalnızca kayıt sayısı kullanılabilir."];
        if (request?.Source == "salesInvoices" && aggregate is "sumGrandTotal" or "averageGrandTotal" or "sumTaxTotal" or "averageTaxTotal")
        {
            var groupedByCurrency = groupFields.Contains("currencyCode", StringComparer.Ordinal);
            var singleCurrencyFilter = request.Filters?.Any(filter => filter.Field == "currencyCode" && filter.Operator == "equals" && !string.IsNullOrWhiteSpace(filter.Value)) == true;
            if (!groupedByCurrency && !singleCurrencyFilter)
                errors["aggregate"] = ["Farklı para birimlerini toplamak önlenmiştir. Para birimine göre gruplayın veya tek bir para birimini eşitlik filtresiyle seçin."];
        }
        if (request?.Source == "purchaseOrders" && aggregate is "sumGrandTotal" or "averageGrandTotal" or "sumTaxTotal" or "averageTaxTotal")
        {
            var groupedByCurrency = groupFields.Contains("currencyCode", StringComparer.Ordinal);
            var singleCurrencyFilter = request.Filters?.Any(filter => filter.Field == "currencyCode" && filter.Operator == "equals" && !string.IsNullOrWhiteSpace(filter.Value)) == true;
            if (!groupedByCurrency && !singleCurrencyFilter)
                errors["aggregate"] = ["Farklı para birimlerindeki satın alma tutarları toplanamaz. Para birimine göre gruplayın veya tek para birimini filtreleyin."];
        }
        if (request?.Source == "salesOrders" && aggregate is "sumGrandTotal" or "averageGrandTotal" or "sumTaxTotal" or "averageTaxTotal")
        {
            var groupedByCurrency = groupFields.Contains("currencyCode", StringComparer.Ordinal);
            var singleCurrencyFilter = request.Filters?.Any(filter => filter.Field == "currencyCode" && filter.Operator == "equals" && !string.IsNullOrWhiteSpace(filter.Value)) == true;
            if (!groupedByCurrency && !singleCurrencyFilter)
                errors["aggregate"] = ["Farklı para birimlerindeki satış tutarları toplanamaz. Para birimine göre gruplayın veya tek para birimini filtreleyin."];
        }
        if (errors.Count > 0 || request is null) return false;
        normalized = new NormalizedReport(request.Source, request.Columns!.ToArray(), request.Filters?.ToArray() ?? [],
            sortBy, request.Descending, Math.Clamp(request.Page, 1, 100000), Math.Clamp(request.PageSize, 1, 200),
            groupFields.FirstOrDefault(), groupFields.Length == 0 ? null : aggregate ?? "count", groupFields);
        return true;
    }

    private static async Task<AggregatePage> AggregateAsync(IQueryable<CustomerAccount> query, IReadOnlyList<string> groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct)
    {
        if (groupBy.Count == 1) return await AggregateCustomerSingleAsync(query, groupBy[0], aggregate, descending, skip, take, ct);
        var selectors = groupBy.Select(code => code switch
        {
            "code" => (LambdaExpression)(Expression<Func<CustomerAccount, string>>)(x => x.Code),
            "name" => (Expression<Func<CustomerAccount, string>>)(x => x.Name),
            "type" => (Expression<Func<CustomerAccount, CounterpartyType>>)(x => x.Type),
            "currencyCode" => (Expression<Func<CustomerAccount, string>>)(x => x.CurrencyCode),
            "riskLimit" => (Expression<Func<CustomerAccount, decimal?>>)(x => x.RiskLimit),
            "paymentTermDays" => (Expression<Func<CustomerAccount, int>>)(x => x.PaymentTermDays),
            "isActive" => (Expression<Func<CustomerAccount, bool>>)(x => x.IsActive),
            "createdAt" => (Expression<Func<CustomerAccount, DateTimeOffset>>)(x => x.CreatedAt),
            _ => throw new InvalidOperationException("Unsupported customer grouping field.")
        }).ToArray();
        var aggregateSelector = aggregate switch
        {
            "sumRiskLimit" or "averageRiskLimit" => (LambdaExpression)(Expression<Func<CustomerAccount, decimal?>>)(x => x.RiskLimit),
            "sumPaymentTermDays" or "averagePaymentTermDays" => (Expression<Func<CustomerAccount, decimal>>)(x => x.PaymentTermDays),
            _ => null
        };
        return await AggregateMultipleGroupsAsync(query, selectors, aggregate, aggregateSelector, descending, skip, take, ct);
    }

    private static async Task<AggregatePage> AggregateCustomerSingleAsync(IQueryable<CustomerAccount> query, string groupBy, string aggregate,
        bool descending, int skip, int take, CancellationToken ct) => groupBy switch
    {
        "code" => await AggregateGroups(query.GroupBy(x => x.Code), aggregate, descending, skip, take, ct),
        "name" => await AggregateGroups(query.GroupBy(x => x.Name), aggregate, descending, skip, take, ct),
        "type" => await AggregateGroups(query.GroupBy(x => x.Type), aggregate, descending, skip, take, ct),
        "currencyCode" => await AggregateGroups(query.GroupBy(x => x.CurrencyCode), aggregate, descending, skip, take, ct),
        "riskLimit" => await AggregateGroups(query.GroupBy(x => x.RiskLimit), aggregate, descending, skip, take, ct),
        "paymentTermDays" => await AggregateGroups(query.GroupBy(x => x.PaymentTermDays), aggregate, descending, skip, take, ct),
        "isActive" => await AggregateGroups(query.GroupBy(x => x.IsActive), aggregate, descending, skip, take, ct),
        "createdAt" => await AggregateGroups(query.GroupBy(x => x.CreatedAt), aggregate, descending, skip, take, ct),
        _ => new AggregatePage([], 0)
    };

    private static async Task<AggregatePage> AggregateMultipleGroupsAsync<TEntity>(IQueryable<TEntity> query,
        IReadOnlyList<LambdaExpression> selectors, string aggregate, LambdaExpression? aggregateSelector,
        bool descending, int skip, int take, CancellationToken ct)
    {
        var parameter = Expression.Parameter(typeof(TEntity), "row");
        var expressions = selectors.Select(selector => new ParameterReplaceVisitor(selector.Parameters[0], parameter).Visit(selector.Body)!).ToArray();
        var tupleDefinition = expressions.Length switch
        {
            2 => typeof(ValueTuple<,>),
            3 => typeof(ValueTuple<,,>),
            _ => throw new ArgumentOutOfRangeException(nameof(selectors), "Multi-field reports support two or three grouping fields.")
        };
        var keyType = tupleDefinition.MakeGenericType(expressions.Select(expression => expression.Type).ToArray());
        var constructor = keyType.GetConstructors().Single();
        var tupleMembers = Enumerable.Range(1, expressions.Length)
            .Select(index => (MemberInfo)keyType.GetField($"Item{index}")!).ToArray();
        var keyBody = Expression.New(constructor, expressions, tupleMembers);
        var keyLambdaType = typeof(Func<,>).MakeGenericType(typeof(TEntity), keyType);
        var keySelector = Expression.Lambda(keyLambdaType, keyBody, parameter);
        var method = typeof(ReportEndpoints).GetMethod(nameof(AggregateMultipleGroupsTypedAsync), BindingFlags.NonPublic | BindingFlags.Static)!
            .MakeGenericMethod(typeof(TEntity), keyType);
        var task = (Task<AggregatePage>)method.Invoke(null,
            [query, keySelector, selectors.Count, aggregate, aggregateSelector, descending, skip, take, ct])!;
        return await task;
    }

    private static async Task<AggregatePage> AggregateMultipleGroupsTypedAsync<TEntity, TKey>(IQueryable<TEntity> query,
        LambdaExpression keySelector, int fieldCount, string aggregate, LambdaExpression? aggregateSelector,
        bool descending, int skip, int take, CancellationToken ct)
    {
        var typedSelector = (Expression<Func<TEntity, TKey>>)keySelector;
        var groups = query.GroupBy(typedSelector);
        var total = await groups.CountAsync(ct);
        IQueryable<IGrouping<TKey, TEntity>> ordered = groups;
        for (var index = 1; index <= fieldCount; index++)
        {
            var group = Expression.Parameter(typeof(IGrouping<TKey, TEntity>), "group");
            var key = Expression.Property(group, nameof(IGrouping<TKey, TEntity>.Key));
            var value = Expression.Field(key, $"Item{index}");
            var selector = Expression.Lambda(value, group);
            var methodName = index == 1
                ? descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy)
                : descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy);
            var order = Expression.Call(typeof(Queryable), methodName, [typeof(IGrouping<TKey, TEntity>), value.Type],
                ordered.Expression, Expression.Quote(selector));
            ordered = (IQueryable<IGrouping<TKey, TEntity>>)ordered.Provider.CreateQuery(order);
        }
        var page = ordered.Skip(skip).Take(take);
        var groupParameter = Expression.Parameter(typeof(IGrouping<TKey, TEntity>), "group");
        var keyExpression = Expression.Property(groupParameter, nameof(IGrouping<TKey, TEntity>.Key));
        var values = Enumerable.Range(1, fieldCount)
            .Select(index => Expression.Convert(Expression.Field(keyExpression, $"Item{index}"), typeof(object)));
        var groupValues = Expression.NewArrayInit(typeof(object), values);
        var countMethod = typeof(Enumerable).GetMethods().Single(method => method.Name == nameof(Enumerable.Count) &&
            method.IsGenericMethodDefinition && method.GetParameters().Length == 1).MakeGenericMethod(typeof(TEntity));
        var count = Expression.Call(countMethod, groupParameter);
        Expression valueExpression = Expression.Constant(null, typeof(decimal?));
        if (aggregateSelector is not null)
        {
            var name = aggregate.StartsWith("sum", StringComparison.Ordinal) ? nameof(Enumerable.Sum) : nameof(Enumerable.Average);
            var aggregateType = aggregateSelector.ReturnType;
            var method = typeof(Enumerable).GetMethods().Single(candidate => candidate.Name == name && candidate.IsGenericMethodDefinition &&
                candidate.GetParameters().Length == 2 && candidate.GetParameters()[1].ParameterType.IsGenericType &&
                candidate.GetParameters()[1].ParameterType.GetGenericTypeDefinition() == typeof(Func<,>) &&
                candidate.GetParameters()[1].ParameterType.GetGenericArguments()[1] == aggregateType && candidate.ReturnType == aggregateType).MakeGenericMethod(typeof(TEntity));
            var aggregateParameter = Expression.Parameter(typeof(TEntity), "row");
            var aggregateBody = new ParameterReplaceVisitor(aggregateSelector.Parameters[0], aggregateParameter).Visit(aggregateSelector.Body)!;
            var selector = Expression.Lambda(typeof(Func<,>).MakeGenericType(typeof(TEntity), aggregateType), aggregateBody, aggregateParameter);
            var aggregateValue = Expression.Call(method, groupParameter, selector);
            valueExpression = aggregateValue.Type == typeof(decimal?) ? aggregateValue : Expression.Convert(aggregateValue, typeof(decimal?));
        }
        var rowConstructor = typeof(ReportAggregateRow).GetConstructors().Single();
        var projectionBody = Expression.New(rowConstructor, Expression.Constant(null, typeof(object)), count, valueExpression,
            Expression.Convert(groupValues, typeof(IReadOnlyList<object?>)));
        var projection = Expression.Lambda<Func<IGrouping<TKey, TEntity>, ReportAggregateRow>>(projectionBody, groupParameter);
        var rows = await page.Select(projection).ToListAsync(ct);
        rows = rows.Select(row => row with
        {
            GroupValues = row.GroupValues?.Select(value => value switch
            {
                CounterpartyType type => type.ToString(),
                SalesInvoiceStatus status => status.ToString(),
                PurchaseOrderStatus status => status.ToString(),
                SalesOrderStatus status => status.ToString(),
                InventoryTrackingMode mode => mode.ToString(),
                _ => value
            }).ToArray()
        }).ToList();
        return new AggregatePage(rows, total);
    }

    private sealed class ParameterReplaceVisitor(ParameterExpression source, ParameterExpression destination) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == source ? destination : base.VisitParameter(node);
    }

    private static async Task<AggregatePage> AggregateGroups<TKey>(IQueryable<IGrouping<TKey, CustomerAccount>> groups,
        string aggregate, bool descending, int skip, int take, CancellationToken ct)
    {
        var total = await groups.CountAsync(ct);
        var ordered = descending ? groups.OrderByDescending(x => x.Key) : groups.OrderBy(x => x.Key);
        var page = ordered.Skip(skip).Take(take);
        List<ReportAggregateRow> rows = aggregate switch
        {
            "sumRiskLimit" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => x.RiskLimit))).ToListAsync(ct),
            "averageRiskLimit" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.RiskLimit))).ToListAsync(ct),
            "sumPaymentTermDays" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Sum(x => (decimal)x.PaymentTermDays))).ToListAsync(ct),
            "averagePaymentTermDays" => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Average(x => (decimal?)x.PaymentTermDays))).ToListAsync(ct),
            _ => await page.Select(g => new ReportAggregateRow(g.Key, g.Count(), g.Count())).ToListAsync(ct)
        };
        return new AggregatePage(rows.Select(x => x with { GroupValue = x.GroupValue is CounterpartyType type ? type.ToString() : x.GroupValue }).ToArray(), total);
    }

    private static string AggregateLabel(string aggregate) => aggregate switch
    {
        "sumRiskLimit" => "Risk limiti toplamı", "averageRiskLimit" => "Ortalama risk limiti",
        "sumPaymentTermDays" => "Vade günü toplamı", "averagePaymentTermDays" => "Ortalama vade günü",
        "sumGrandTotal" => "Genel toplamların toplamı", "averageGrandTotal" => "Ortalama fatura tutarı",
        "sumTaxTotal" => "Vergi toplamı", "averageTaxTotal" => "Ortalama vergi", _ => "Kayıt sayısı"
    };

    private static string PurchaseOrderAggregateLabel(string aggregate) => aggregate switch
    {
        "sumGrandTotal" => "Sipariş genel toplamları", "averageGrandTotal" => "Ortalama sipariş tutarı",
        "sumTaxTotal" => "Sipariş vergi toplamı", "averageTaxTotal" => "Ortalama sipariş vergisi", _ => "Satın alma siparişi sayısı"
    };

    private static string SalesOrderAggregateLabel(string aggregate) => aggregate switch
    {
        "sumGrandTotal" => "Satış siparişlerinin genel toplamı", "averageGrandTotal" => "Ortalama satış siparişi tutarı",
        "sumTaxTotal" => "Satış siparişi vergi toplamı", "averageTaxTotal" => "Ortalama satış siparişi vergisi", _ => "Satış siparişi sayısı"
    };

    private static string StockItemAggregateLabel(string aggregate) => aggregate switch
    {
        "sumMinimumStock" => "Minimum stok toplamı", "averageMinimumStock" => "Ortalama minimum stok",
        "sumOnHand" => "Eldeki miktar toplamı", "averageOnHand" => "Ortalama eldeki miktar",
        "sumReserved" => "Rezerve miktar toplamı", "averageReserved" => "Ortalama rezerve miktar",
        "sumAvailable" => "Kullanılabilir miktar toplamı", "averageAvailable" => "Ortalama kullanılabilir miktar",
        "sumMinimumStockGap" => "Minimum stok açığı toplamı", "averageMinimumStockGap" => "Ortalama minimum stok açığı",
        _ => "Stok kartı sayısı"
    };

    private static IReadOnlyList<ReportColumn> ColumnsForSource(string source) => source switch
    {
        "customers" => CustomerColumns, "salesInvoices" => SalesInvoiceColumns, "purchaseOrders" => PurchaseOrderColumns, "purchaseInvoices" => PurchaseInvoiceColumns, "purchaseReceipts" => PurchaseReceiptColumns, "manufacturingOrders" => ManufacturingOrderColumns, "manufacturingWorkCenters" => ManufacturingWorkCenterColumns, "inventoryTransactions" => InventoryTransactionColumns, "inventoryTransfers" => InventoryTransferColumns, "salesOrders" => SalesOrderColumns, "salesOrderFulfillment" => SalesOrderFulfillmentColumns, "purchaseOrderFulfillment" => PurchaseOrderFulfillmentColumns, "salesQuotes" => SalesQuoteColumns, "purchaseSupplierQuotes" => PurchaseSupplierQuoteColumns, "supplierPayments" => SupplierPaymentColumns, "salesDeliveries" => SalesDeliveryColumns, "salesReturns" => SalesReturnColumns, "supplierReturns" => SupplierReturnColumns, "purchaseRequests" => PurchaseRequestColumns, "stockItems" => StockItemColumns, "warehouseStock" => WarehouseStockColumns, "workflowInstances" => WorkflowInstanceColumns, "bankStatements" => BankStatementColumns, "bankStatementLines" => BankStatementLineColumns, "financialAccountTransactions" => FinancialAccountTransactionColumns, "financialAccountTransfers" => FinancialAccountTransferColumns, "journalEntryLines" => JournalEntryLineColumns, "fxRevaluationLines" => FxRevaluationLineColumns, "crmOpportunities" => CrmOpportunityColumns, "customerLedgerEntries" => CustomerLedgerColumns, "supplierLedgerEntries" => SupplierLedgerColumns, _ => []
    };

    private static IReadOnlyList<ReportAggregateOption> AggregatesForSource(string source) => source switch
    {
        "customers" => CustomerAggregates, "salesInvoices" => SalesInvoiceAggregates, "purchaseOrders" => PurchaseOrderAggregates, "purchaseReceipts" => [], "manufacturingOrders" => ManufacturingOrderAggregates, "salesOrders" => SalesOrderAggregates, "purchaseRequests" => PurchaseRequestAggregates, "stockItems" => StockItemAggregates, "workflowInstances" => WorkflowInstanceAggregates, "bankStatements" => [], _ => []
    };

    private static ReportColumn InvoiceColumnByCode(string code) => SalesInvoiceColumns.First(x => x.Code == code);
    private static ReportColumn PurchaseOrderColumnByCode(string code) => PurchaseOrderColumns.First(x => x.Code == code);
    private static ReportColumn PurchaseInvoiceColumnByCode(string code) => PurchaseInvoiceColumns.First(x => x.Code == code);
    private static ReportColumn ManufacturingOrderColumnByCode(string code) => ManufacturingOrderColumns.First(x => x.Code == code);
    private static ReportColumn ManufacturingWorkCenterColumnByCode(string code) => ManufacturingWorkCenterColumns.First(x => x.Code == code);
    private static ReportColumn InventoryTransactionColumnByCode(string code) => InventoryTransactionColumns.First(x => x.Code == code);
    private static ReportColumn InventoryTransferColumnByCode(string code) => InventoryTransferColumns.First(x => x.Code == code);
    private static ReportColumn SalesOrderColumnByCode(string code) => SalesOrderColumns.First(x => x.Code == code);
    private static ReportColumn SalesQuoteColumnByCode(string code) => SalesQuoteColumns.First(x => x.Code == code);
    private static ReportColumn PurchaseSupplierQuoteColumnByCode(string code) => PurchaseSupplierQuoteColumns.First(x => x.Code == code);
    private static ReportColumn SalesDeliveryColumnByCode(string code) => SalesDeliveryColumns.First(x => x.Code == code);
    private static ReportColumn SalesReturnColumnByCode(string code) => SalesReturnColumns.First(x => x.Code == code);
    private static ReportColumn SupplierReturnColumnByCode(string code) => SupplierReturnColumns.First(x => x.Code == code);
    private static ReportColumn StockItemColumnByCode(string code) => StockItemColumns.First(x => x.Code == code);
    private static ReportColumn WorkflowInstanceColumnByCode(string code) => WorkflowInstanceColumns.First(x => x.Code == code);
    private static ReportColumn BankStatementColumnByCode(string code) => BankStatementColumns.First(x => x.Code == code);
    private static ReportColumn BankStatementLineColumnByCode(string code) => BankStatementLineColumns.First(x => x.Code == code);
    private static ReportColumn FinancialAccountTransactionColumnByCode(string code) => FinancialAccountTransactionColumns.First(x => x.Code == code);

    private static bool TryApplyCustomerFilter(ref IQueryable<CustomerAccount> query, ReportFilter filter, out string? error)
    {
        error = null;
        var column = ColumnByCode(filter.Field);
        var value = filter.Value?.Trim();
        if (filter.Operator == "isNull" && filter.Field == "riskLimit") { query = query.Where(x => x.RiskLimit == null); return true; }
        if (value is null || value.Length == 0 || value.Length > 200) { error = "Filtre değeri 1-200 karakter olmalıdır."; return false; }
        switch (column.DataType)
        {
            case "text":
                if (filter.Operator is not ("contains" or "equals")) { error = "Metin alanında contains veya equals kullanın."; return false; }
                query = filter.Field switch
                {
                    "code" => filter.Operator == "contains" ? query.Where(x => x.Code.Contains(value)) : query.Where(x => x.Code == value),
                    "name" => filter.Operator == "contains" ? query.Where(x => x.Name.Contains(value)) : query.Where(x => x.Name == value),
                    "type" when Enum.TryParse<CounterpartyType>(value, true, out var type) => query.Where(x => x.Type == type),
                    "currencyCode" => filter.Operator == "contains" ? query.Where(x => x.CurrencyCode.Contains(value)) : query.Where(x => x.CurrencyCode == value),
                    _ => query
                };
                if (filter.Field == "type" && !Enum.TryParse<CounterpartyType>(value, true, out _)) { error = "Cari türü geçersiz."; return false; }
                return true;
            case "boolean":
                if (filter.Field != "isActive" || filter.Operator != "equals" || !bool.TryParse(value, out var active)) { error = "Durum filtresi true/false eşitliği olmalıdır."; return false; }
                query = query.Where(x => x.IsActive == active); return true;
            case "decimal":
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) || !ApplyDecimalOperator(filter.Operator, out var decimalOp)) { error = "Sayısal filtre veya operatör geçersiz."; return false; }
                query = decimalOp switch { "gt" => query.Where(x => x.RiskLimit > amount), "gte" => query.Where(x => x.RiskLimit >= amount), "lt" => query.Where(x => x.RiskLimit < amount), "lte" => query.Where(x => x.RiskLimit <= amount), _ => query.Where(x => x.RiskLimit == amount) }; return true;
            case "number":
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var days) || !ApplyDecimalOperator(filter.Operator, out var intOp)) { error = "Vade filtresi veya operatör geçersiz."; return false; }
                query = intOp switch { "gt" => query.Where(x => x.PaymentTermDays > days), "gte" => query.Where(x => x.PaymentTermDays >= days), "lt" => query.Where(x => x.PaymentTermDays < days), "lte" => query.Where(x => x.PaymentTermDays <= days), _ => query.Where(x => x.PaymentTermDays == days) }; return true;
            case "date":
                if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) || filter.Operator is not ("gt" or "gte" or "lt" or "lte")) { error = "ISO tarih ve gt/gte/lt/lte operatörü kullanın."; return false; }
                query = filter.Operator switch { "gt" => query.Where(x => x.CreatedAt > date), "gte" => query.Where(x => x.CreatedAt >= date), "lt" => query.Where(x => x.CreatedAt < date), _ => query.Where(x => x.CreatedAt <= date) }; return true;
            default: error = "Filtre alanı geçersiz."; return false;
        }
    }

    private static bool ApplyDecimalOperator(string value, out string normalized)
    {
        normalized = value;
        return value is "equals" or "gt" or "gte" or "lt" or "lte";
    }

    private static IQueryable<CustomerAccount> ApplySort(IQueryable<CustomerAccount> query, string field, bool descending) => (field, descending) switch
    {
        ("name", false) => query.OrderBy(x => x.Name).ThenBy(x => x.Id), ("name", true) => query.OrderByDescending(x => x.Name).ThenBy(x => x.Id),
        ("type", false) => query.OrderBy(x => x.Type).ThenBy(x => x.Id), ("type", true) => query.OrderByDescending(x => x.Type).ThenBy(x => x.Id),
        ("currencyCode", false) => query.OrderBy(x => x.CurrencyCode).ThenBy(x => x.Id), ("currencyCode", true) => query.OrderByDescending(x => x.CurrencyCode).ThenBy(x => x.Id),
        ("riskLimit", false) => query.OrderBy(x => x.RiskLimit).ThenBy(x => x.Id), ("riskLimit", true) => query.OrderByDescending(x => x.RiskLimit).ThenBy(x => x.Id),
        ("paymentTermDays", false) => query.OrderBy(x => x.PaymentTermDays).ThenBy(x => x.Id), ("paymentTermDays", true) => query.OrderByDescending(x => x.PaymentTermDays).ThenBy(x => x.Id),
        ("isActive", false) => query.OrderBy(x => x.IsActive).ThenBy(x => x.Id), ("isActive", true) => query.OrderByDescending(x => x.IsActive).ThenBy(x => x.Id),
        ("createdAt", false) => query.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id), ("createdAt", true) => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
        (_, false) => query.OrderBy(x => x.Code).ThenBy(x => x.Id), _ => query.OrderByDescending(x => x.Code).ThenBy(x => x.Id)
    };

    private static object? ReadCustomerValue(CustomerAccount x, string code) => code switch
    {
        "code" => x.Code, "name" => x.Name, "type" => x.Type.ToString(), "currencyCode" => x.CurrencyCode,
        "riskLimit" => x.RiskLimit, "paymentTermDays" => x.PaymentTermDays, "isActive" => x.IsActive, "createdAt" => x.CreatedAt,
        _ => null
    };

    private static ReportColumn ColumnByCode(string code) => CustomerColumns.First(x => x.Code == code);
    private static ReportView ToView(TenantSavedReport report) => new(report.Id, report.Name, report.Source,
        JsonSerializer.Deserialize<ReportRunRequest>(report.DefinitionJson, JsonOptions) ?? new ReportRunRequest("customers", ["code", "name"], [], "code", false, 1, 50), report.Kind, report.CreatedAt, report.UpdatedAt, report.DefinitionRevision);
    private static TenantSavedReportRevision RevisionOf(TenantSavedReport report, Guid userId, DateTimeOffset createdAt) => new()
    {
        TenantId = report.TenantId, SavedReportId = report.Id, Revision = report.DefinitionRevision, Name = report.Name,
        Kind = report.Kind, Source = report.Source, DefinitionJson = report.DefinitionJson, CreatedByUserId = userId, CreatedAt = createdAt
    };
    private static bool TrySavedKind(string? requested, string? fallback, out string normalized)
    {
        var value = string.IsNullOrWhiteSpace(requested) ? fallback : requested.Trim();
        normalized = string.Equals(value, "List", StringComparison.OrdinalIgnoreCase) ? "List"
            : string.Equals(value, "Report", StringComparison.OrdinalIgnoreCase) ? "Report" : "";
        return normalized.Length > 0;
    }
    private static string SavedAuditAction(string kind, string action) =>
        $"erp.{(kind == "List" ? "list-view" : "report")}.{action}";
    private static bool TryTenantContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = Guid.Empty; userId = Guid.Empty; role = "";
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) || !Guid.TryParse(user.FindFirstValue("sub"), out userId)) return false;
        role = user.FindFirstValue("role") ?? ""; return role.Length > 0;
    }
}

public sealed record ReportColumn(string Code, string Label, string DataType, IReadOnlyList<string>? Options = null);
public sealed record ManufacturingCostVarianceReport(DateOnly From, DateOnly To, string PeriodBasis, string BaseCurrencyCode,
    int Page, int PageSize, int TotalCount, IReadOnlyList<ManufacturingCostVarianceOrder> Orders,
    ManufacturingCostVarianceTotals PageTotals, string Limitations);
public sealed record ManufacturingCostVarianceOrder(string OrderCode, DateOnly PlannedDate, string Status, decimal PlannedQuantity,
    int OperationCount, string CurrencyCode, decimal PlannedLaborBase, decimal? ActualLaborBase,
    decimal PlannedOverheadBase, decimal? ActualOverheadBase, decimal? PlannedEnergyBase, decimal? ActualEnergyBase,
    decimal? PlannedMaterialBase, decimal? ActualMaterialBase, decimal PlannedConversionBase,
    decimal? ActualConversionBase, decimal? ConversionVarianceBase, decimal? ActualTotalCostBase, decimal? TotalVarianceBase);
public sealed record ManufacturingCostVarianceTotals(int OrderCount, decimal PlannedLaborBase, decimal? ActualLaborBase,
    decimal PlannedOverheadBase, decimal? ActualOverheadBase, decimal PlannedEnergyBase, decimal PlannedMaterialBase, decimal? ActualEnergyBase,
    decimal? ActualConversionBase, decimal? ActualMaterialBase);
public sealed record SalesOrderFulfillmentReportRow(string OrderCode, string CustomerCode, string CustomerName, DateOnly OrderDate,
    DateOnly? RequestedDeliveryDate, SalesOrderStatus Status, int LineNumber, string StockCode, string StockName, string UnitCode,
    decimal OrderedQuantity, decimal ReservedQuantity, decimal FulfilledQuantity, decimal RemainingQuantity, decimal BackorderQuantity);
public sealed class PurchaseOrderFulfillmentReportRow
{
    public required string OrderCode { get; init; }
    public required string SupplierCode { get; init; }
    public required string SupplierName { get; init; }
    public DateOnly OrderDate { get; init; }
    public DateOnly? ExpectedReceiptDate { get; init; }
    public PurchaseOrderStatus Status { get; init; }
    public int LineNumber { get; init; }
    public required string StockCode { get; init; }
    public required string StockName { get; init; }
    public required string UnitCode { get; init; }
    public decimal OrderedQuantity { get; init; }
    public decimal ReceivedQuantity { get; init; }
    public decimal OutstandingQuantity { get; init; }
}
public sealed record BankStatementReportRow(Guid Id, string Code, string AccountCode, string AccountName, string CurrencyCode,
    DateOnly StartDate, DateOnly EndDate, decimal OpeningBalance, decimal ClosingBalance, BankStatementStatus Status,
    int LineCount, int MatchedLineCount, int UnmatchedLineCount, DateTimeOffset CreatedAt);
public sealed record BankStatementLineReportRow(Guid Id, string StatementCode, int LineNumber, string? ExternalId, DateOnly TransactionDate,
    FinancialDirection Direction, string CurrencyCode, decimal Amount, string Description, string? Reference, bool IsMatched,
    Guid? TransactionId, bool BookEntryCreated, DateTimeOffset? MatchedAt);
public sealed record FinancialAccountTransactionReportRow(Guid Id, string AccountCode, string AccountName, FinancialAccountType AccountType,
    DateOnly TransactionDate, FinancialDirection Direction, string CurrencyCode, decimal Amount, string Description, string? Reference,
    string SourceType, string? SourceCode, Guid? ReversalOfId, DateTimeOffset CreatedAt);
public sealed record FinancialAccountTransferReportRow(Guid Id, string Code, string FromAccountCode, string FromAccountName,
    string ToAccountCode, string ToAccountName, DateOnly TransferDate, string CurrencyCode, decimal Amount,
    string ToCurrencyCode, decimal DestinationAmount, decimal ExchangeRate, FinancialTransferStatus Status,
    string? Reference, string Description, DateTimeOffset CreatedAt);
public sealed record JournalEntryLineReportRow(Guid Id, Guid EntryId, string EntryCode, DateOnly EntryDate, string EntryDescription,
    string SourceType, string AccountCode, string AccountName, int LineNumber, string LineDescription, decimal Debit,
    decimal Credit, decimal EntryDebitTotal, decimal EntryCreditTotal, bool IsBalanced, DateTimeOffset CreatedAt);
public sealed record FxRevaluationLineReportRow(Guid Id, Guid VoucherId, string VoucherCode, DateOnly AsOfDate,
    string BaseCurrencyCode, FxRevaluationDirection Direction, string InvoiceCode, string CounterpartyName, string CurrencyCode,
    decimal OutstandingAmount, decimal InvoiceDateRate, decimal ClosingRate, decimal PreviousAdjustmentBase,
    decimal TargetAdjustmentBase, decimal AdjustmentBase, string DebitAccount, string CreditAccount,
    decimal DebitBaseAmount, decimal CreditBaseAmount, DateTimeOffset CreatedAt);
public sealed record SupplierPaymentReportRow(Guid Id, string Code, string InvoiceCode, string SupplierCode, string SupplierName,
    DateOnly PaymentDate, string CurrencyCode, decimal Amount, string PaymentMethod, string? Reference, SupplierPaymentStatus Status,
    string? AccountCode, string? AccountName, DateTimeOffset CreatedAt);
public sealed record SupplierReturnReportRow(Guid Id, string Code, string InvoiceCode, string SupplierCode, string SupplierName,
    string WarehouseCode, string WarehouseName, DateOnly ReturnDate, SupplierReturnStatus Status, decimal Subtotal,
    decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, int LineCount, decimal TotalQuantity, DateTimeOffset CreatedAt);
public sealed record ReportAggregateOption(string Code, string Label);
public sealed record ReportSource(string Code, string Label, IReadOnlyList<ReportColumn> Columns, IReadOnlyList<ReportAggregateOption> Aggregates);
public sealed record ReportFilter(string Field, string Operator, string? Value);
public sealed record ReportRunRequest(string Source, IReadOnlyList<string>? Columns, IReadOnlyList<ReportFilter>? Filters, string? SortBy, bool Descending, int Page = 1, int PageSize = 50, string? GroupBy = null, string? Aggregate = null, IReadOnlyList<string>? GroupByFields = null);
public sealed record ReportPageRequest(int Page = 1, int PageSize = 50);
public sealed record ReportSaveRequest(string? Name, ReportRunRequest? Definition, string? Kind = null, int? ExpectedRevision = null);
public sealed record RestoreSavedReportRequest(int ExpectedRevision);
public sealed record NormalizedReport(string Source, IReadOnlyList<string> Columns, IReadOnlyList<ReportFilter> Filters, string SortBy, bool Descending, int Page, int PageSize, string? GroupBy = null, string? Aggregate = null, IReadOnlyList<string> GroupByFields = null!);
public sealed record ReportAggregateRow(object? GroupValue, int RowCount, decimal? Value, IReadOnlyList<object?>? GroupValues = null);
public sealed record AggregatePage(IReadOnlyList<ReportAggregateRow> Rows, int TotalGroups);
public sealed record ReportResult(string Source, IReadOnlyList<ReportColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, int Page, int PageSize, int TotalCount, string? GroupBy = null, string? Aggregate = null, IReadOnlyList<ReportAggregateRow>? Groups = null, int TotalGroups = 0, IReadOnlyList<string>? GroupByFields = null);
public sealed record ReportView(Guid Id, string Name, string Source, ReportRunRequest Definition, string Kind, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, int DefinitionRevision);
public sealed record SavedReportRevisionView(Guid Id, int Revision, string Name, string Kind, string Source, ReportRunRequest Definition, Guid CreatedByUserId, DateTimeOffset CreatedAt);
