using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class TenantScreenViewEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> ResizableColumnScreenKeys = new(StringComparer.Ordinal)
    {
        "customers", "sales-returns", "finance-accounts", "finance-account-transactions",
        "finance-balance-sheet", "finance-cash-flow-report", "finance-fx-exposure",
        "finance-fx-revaluation-lines", "finance-fx-revaluations", "finance-income-statement",
        "finance-journals", "finance-ledger-accounts", "finance-ledger-mappings", "finance-maturities",
        "finance-maturity-aging", "finance-statement-lines", "finance-statement-unmatched-book",
        "finance-statements", "finance-transfer-sources", "finance-trial-balance",
        "hr-attendance", "hr-employee-calendar-overrides", "hr-employees", "hr-leave-requests",
        "hr-workplace-assignments", "hr-workplace-calendars"
    };
    private static readonly ScreenViewField[] CustomerFields =
    [
        new("code", "Cari kodu", true), new("name", "Ünvan", true), new("groupName", "Cari grubu", true),
        new("type", "Tür", true), new("currencyCode", "Döviz", true), new("paymentTermDays", "Vade", true),
        new("taxNumber", "Vergi no", true), new("status", "Durum", true),
        new("identityNumber", "T.C. kimlik no", false), new("taxOffice", "Vergi dairesi", false),
        new("riskLimit", "Risk limiti", false), new("parentCompanyName", "Ana firma", false),
        new("subsidiaryCount", "Bağlı firma sayısı", false), new("createdAt", "Oluşturulma tarihi", false),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CustomerDetailFields =
    [
        new("groupName", "Cari grubu", true, Section: "Genel Bilgiler"), new("taxNumber", "Vergi no", true, Section: "Genel Bilgiler"),
        new("identityNumber", "T.C. kimlik no", true, Section: "Genel Bilgiler"), new("taxOffice", "Vergi dairesi", true, Section: "Diğer"),
        new("currencyCode", "Para birimi", true, Section: "Finans"), new("paymentTermDays", "Vade", true, Section: "Finans"),
        new("riskLimit", "Risk limiti", true, Section: "Finans")
    ];
    private static readonly ScreenViewField[] CustomerLedgerEntryFields =
    [
        new("entryDate", "Tarih", true), new("description", "Açıklama", true), new("direction", "Yön", true),
        new("debit", "Borç", true), new("credit", "Alacak", true), new("balance", "Bakiye", true),
        new("currencyCode", "Döviz", false)
    ];
    private static readonly ScreenViewField[] AuditEventFields =
    [
        new("occurredAt", "Tarih / saat", true), new("user", "Kullanıcı", true),
        new("userId", "Kullanıcı kimliği", true), new("action", "İşlem", true),
        new("resource", "Kaynak", true), new("eventId", "Olay numarası", true)
    ];
    private static readonly ScreenViewField[] HrEmployeeFields =
    [
        new("personnelCode", "Personel kodu", true), new("fullName", "Ad soyad", true),
        new("department", "Departman", true), new("jobTitle", "Görev", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrLeaveRequestFields =
    [
        new("employee", "Personel", true), new("leaveType", "Tür", true),
        new("startDate", "Başlangıç", true), new("endDate", "Bitiş", true),
        new("requestedDays", "Gün", true), new("status", "Durum", true),
        new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrAttendanceFields =
    [
        new("employee", "Personel", true), new("workDate", "Tarih", true),
        new("workedMinutes", "Çalışma", true), new("overtimeMinutes", "Fazla mesai", true),
        new("note", "Not", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrWorkplaceAssignmentFields =
    [
        new("employee", "Personel", true), new("workplaceCode", "İşyeri", true),
        new("effectiveFrom", "Yürürlük", true), new("versionStatus", "Sürüm / durum", true),
        new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrWorkplaceCalendarFields =
    [
        new("workplaceCode", "İşyeri", true), new("effectiveFrom", "Yürürlük", true),
        new("versionStatus", "Sürüm / durum", true), new("policyReference", "Politika", true),
        new("calendar", "Takvim JSON", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrEmployeeCalendarOverrideFields =
    [
        new("employee", "Personel", true), new("effectiveFrom", "Yürürlük", true),
        new("versionStatus", "Sürüm / durum", true), new("policyReference", "Politika", true),
        new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] StockItemFields =
    [
        new("code", "Stok kodu", true), new("name", "Stok adı", true), new("category", "Kategori", true),
        new("quantityOnHand", "Depo bakiyesi", true), new("reservedQuantity", "Rezerve", true),
        new("availableQuantity", "Kullanılabilir", true), new("minimumStock", "Minimum", true),
        new("valuationAmountBase", "Stok değeri", true), new("unvaluedQuantity", "Maliyetsiz miktar", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] InventoryMovementFields =
    [
        new("entryDate", "Tarih", true), new("direction", "Yön", true), new("description", "Açıklama", true),
        new("quantity", "Miktar", true), new("unitCostBase", "Birim maliyet", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] ManufacturingRecipesScreenFields =
    [
        new("recipe", "Reçete", true), new("product", "Mamul", true), new("outputQuantity", "Çıktı", true), new("content", "İçerik", true), new("status", "Durum / kullanım", true), new("workCenters", "İş merkezleri", false), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] ManufacturingCostVarianceScreenFields =
    [
        new("orderCode", "Üretim emri", true), new("plannedDate", "Plan tarihi", true), new("status", "Durum", true), new("plannedQuantity", "Miktar", true), new("plannedMaterial", "Planlanan malzeme", true), new("actualMaterial", "Fiilî malzeme", true), new("plannedConversion", "Planlanan dönüşüm", true), new("actualConversion", "Fiilî dönüşüm", true), new("conversionVariance", "Dönüşüm farkı", true), new("actualTotalCost", "Fiilî toplam", true), new("totalVariance", "Toplam fark", true), new("plannedLabor", "Planlanan işçilik", false), new("actualLabor", "Fiilî işçilik", false)
    ];
    private static readonly ScreenViewField[] FinanceCreditExposureFacilitiesScreenFields =
    [
        new("code", "Kredi", true), new("lenderName", "Banka / kurum", true), new("currencyCode", "Para birimi", true), new("approvedLimit", "Onaylı limit", false), new("outstandingPrincipal", "Açık anapara", true), new("security", "Teminat + garanti", true), new("limitUtilization", "Limit kullanım", true)
    ];
    private static readonly ScreenViewField[] IntegrationOperationsScreenFields =
    [
        new("integration", "Entegrasyon", true), new("status", "Durum", true), new("createdAt", "Oluşturulma", true), new("attempts", "Deneme", true), new("errorCode", "Hata kodu", true), new("updatedAt", "Son güncelleme", false), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] EDocumentSubmissionsScreenFields =
    [
        new("documentType", "Tür", true), new("document", "Belge", true), new("issueDate", "Düzenleme tarihi", true), new("currencyCode", "Para birimi", true), new("createdAt", "Hazırlanma", true), new("requestedBy", "Hazırlayan kullanıcı", false), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseRequestsScreenFields =
    [
        new("code", "Talep no", true), new("description", "Açıklama", true), new("requestedByName", "Talep sahibi", true), new("requestDate", "Talep tarihi", true), new("neededByDate", "İhtiyaç tarihi", true), new("lineCount", "Kalem", true), new("status", "Durum", true), new("purchaseOrderCode", "Bağlı sipariş", false), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseOrderReceiptsScreenFields =
    [
        new("code", "Mal kabul", true), new("receiptDate", "Tarih", true), new("warehouseName", "Depo", true), new("lineCount", "Satır", true), new("status", "Durum", true), new("invoice", "Alış faturası", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesInvoicePaymentsScreenFields =
    [
        new("code", "Fiş no", true), new("collectionDate", "Tarih", true), new("paymentMethod", "Yöntem", true), new("reference", "Referans", true), new("amount", "Tutar", true), new("status", "Durum", true), new("createdAt", "Oluşturulma", false), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CustomerDetailMovementsScreenFields =
    [
        new("entryDate", "Tarih", true), new("direction", "Yön", true), new("description", "Açıklama", true), new("amount", "Tutar", true), new("balance", "Dönem bakiyesi", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrCompensationRecordsScreenFields =
    [
        new("employee", "Personel", true), new("targetKind", "Hedef", true), new("amount", "Tutar", true), new("currencyCode", "Para birimi", true), new("payBasisCode", "Ödeme esası", true), new("effectiveFrom", "Yürürlük", true), new("status", "Durum", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrTaxDeclarationsScreenFields =
    [
        new("employee", "Personel", true), new("taxYear", "Yıl / sürüm", true), new("declarationKind", "Beyan türü", true), new("baseEntries", "Matrahlar", true), new("evidenceReference", "Kanıt ref.", true), new("status", "Durum", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrPayrollDraftsScreenFields =
    [
        new("period", "Dönem", true), new("profileCode", "Profil", true), new("employeeCount", "Personel", true), new("status", "Durum", true), new("blockers", "Engeller", true), new("snapshotSha256", "SHA-256", true), new("createdAt", "Oluşturulma", true), new("actions", "Snapshot", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] HrPayrollRuleSetsScreenFields =
    [
        new("taxYear", "Yıl", true), new("effectivePeriod", "Geçerlilik", true), new("version", "Sürüm", true), new("officialSourceUrl", "Kaynak", true), new("rules", "Parametreler", true), new("status", "Durum", true), new("approvedAt", "Onay tarihi", false), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] FinanceCreditSecuritiesScreenFields =
    [
        new("code", "Kod / tür", true), new("facilityCode", "Bağlı kredi", true), new("parties", "Veren → lehtar", true), new("amount", "Tutar", true), new("commissionAmount", "Komisyon", true), new("issueDate", "Düzenleme", true), new("expiryDate", "Vade", true), new("status", "Durum", true), new("notes", "Not", false), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] ForeignTradeFilesScreenFields =
    [
        new("reference", "Referans", true), new("direction", "Yön", true), new("linkedOrder", "Bağlı sipariş", true), new("countries", "Ülkeler", true), new("status", "Durum", true), new("transportMode", "Taşıma şekli", false), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CustomerProvincesScreenFields =
    [
        new("name", "İl", true), new("status", "Durum", true), new("districtCount", "İlçeler", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CustomerDistrictsScreenFields =
    [
        new("name", "İlçe", true), new("province", "İl", true), new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] OperationalDefinitionsScreenFields =
    [
        new("kind", "Tür", true), new("code", "Kod", true), new("name", "Ad", true), new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] InventoryMovementHistoryFields =
    [
        new("entryDate", "Tarih", true), new("direction", "Yön", true), new("quantity", "Miktar", true),
        new("warehouse", "Depo", true), new("storageLocation", "Konum", true), new("tracking", "Lot / seri", true),
        new("description", "Açıklama", true), new("unitCostBase", "Birim maliyet", false)
    ];
    private static readonly ScreenViewField[] InventoryWarehouseFields =
    [
        new("code", "Depo kodu", true), new("name", "Depo adı", true),
        new("status", "Durum", true), new("availability", "Açıklama", true)
    ];
    private static readonly ScreenViewField[] InventoryTransferFields =
    [
        new("code", "Transfer kodu", true), new("transferDate", "Tarih", true),
        new("fromWarehouseName", "Kaynak depo", true), new("toWarehouseName", "Hedef depo", true),
        new("lineCount", "Stok kalemi", true), new("status", "Durum", true),
        new("createdAt", "Oluşturulma", false), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] ExchangeRateFields =
    [
        new("rateDate", "Tarih", true), new("currencyCode", "Döviz", true),
        new("rate", "Kur", true), new("revision", "Revizyon", true), new("source", "Kaynak", true)
    ];
    private static readonly ScreenViewField[] WarehouseLocationBalanceFields =
    [
        new("stockItemCode", "Stok kodu", true), new("stockItemName", "Stok adı", true),
        new("quantity", "Konum miktarı", true), new("unitCode", "Birim", true)
    ];
    private static readonly ScreenViewField[] WarehouseLocationFields =
    [
        new("code", "Konum kodu", true), new("name", "Konum adı", true),
        new("parentLocation", "Üst konum", true), new("status", "Durum", true),
        new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] WarehouseLocationReconciliationFields =
    [
        new("stockItemCode", "Stok kodu", true), new("stockItemName", "Stok adı", true),
        new("warehouseQuantity", "Depo bakiyesi", true), new("locatedQuantity", "Konumlandırılmış", true),
        new("unlocatedQuantity", "Konumu boş", true), new("unitCode", "Birim", true)
    ];
    private static readonly ScreenViewField[] InventoryTrackingBalanceFields =
    [
        new("trackingCode", "Lot / seri", true), new("trackingMode", "İz türü", true),
        new("stockItem", "Stok", true), new("warehouse", "Depo", true),
        new("quantityOnHand", "Mevcut miktar", true), new("expiryDate", "Son kullanma", true),
        new("lastMovementDate", "Son hareket", true)
    ];
    private static readonly ScreenViewField[] SalesOrderFields =
    [
        new("code", "Sipariş no", true), new("quoteCode", "Kaynak teklif", true), new("customerName", "Müşteri", true),
        new("orderDate", "Sipariş tarihi", true), new("lineCount", "Satır", true), new("grandTotal", "Genel toplam", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesOrderLineFields =
    [
        new("stockCode", "Stok kodu", true), new("stockName", "Stok adı", true),
        new("quantity", "Sipariş miktarı", true), new("deliveredQuantity", "Teslim edilen", true),
        new("remainingQuantity", "Kalan miktar", true), new("reservedQuantity", "Rezerve", true),
        new("unitPrice", "Birim fiyat", true), new("lineTotal", "Satır toplamı", true)
    ];
    private static readonly ScreenViewField[] SalesQuoteFields =
    [
        new("code", "Teklif no", true), new("customerName", "Müşteri", true),
        new("salesperson", "Plasiyer", true), new("salesOrderCode", "Sipariş no", true),
        new("quoteDate", "Teklif tarihi", true), new("validUntil", "Geçerlilik", true),
        new("lineCount", "Satır", true), new("grandTotal", "Genel toplam", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesPromotionFields =
    [
        new("code", "Kampanya kodu", true), new("name", "Kampanya adı", true),
        new("discountPercent", "İndirim (%)", true), new("effectiveFrom", "Başlangıç", true),
        new("effectiveThrough", "Bitiş", true), new("status", "Durum", true),
        new("applicationCount", "Uygulama", true)
    ];
    private static readonly ScreenViewField[] SalesCampaignPerformanceFields =
    [
        new("campaign", "Kampanya", true), new("applications", "Uygulama", true),
        new("appliedQuotes", "Uygulanan teklifler", true), new("discountTotals", "İndirim tutarı", true),
        new("linkedOrders", "Bağlantılı sipariş", true), new("linkedOrderTotals", "Sipariş toplamı", true)
    ];
    private static readonly ScreenViewField[] SalesDistributionFields =
    [
        new("stock", "Stok kodu / adı", true), new("openDemand", "Açık talep", true),
        new("onHand", "Depo mevcudu", true), new("activeReserved", "Rezervasyon", true),
        new("available", "Kullanılabilir", true), new("uncovered", "Açıkta kalan", true),
        new("openOrderCount", "Sipariş", true)
    ];
    private static readonly ScreenViewField[] SalesDeliveryFields =
    [
        new("code", "İrsaliye no", true), new("orderCode", "Sipariş no", true),
        new("deliveryDate", "Sevk tarihi", true), new("warehouseName", "Depo", true),
        new("lineCount", "Satır", true), new("status", "Durum", true),
        new("invoiceStatus", "Fatura", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesInvoiceFields =
    [
        new("code", "Fatura no", true), new("deliveryCode", "İrsaliye", true), new("orderCode", "Sipariş", true),
        new("customerName", "Müşteri", true), new("customerTaxNumber", "Müşteri vergi no", false), new("invoiceDate", "Fatura tarihi", true),
        new("lineCount", "Satır", true), new("grandTotal", "Genel toplam", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesReturnFields =
    [
        new("code", "İade no", true), new("returnDate", "Tarih", true), new("warehouseName", "Depo", true),
        new("lineCount", "Satır", true), new("grandTotal", "Tutar", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] SalesInvoiceDetailFields =
    [
        new("customerName", "Müşteri", true), new("invoiceDate", "Fatura tarihi", true),
        new("orderCode", "Sipariş", true), new("deliveryCode", "İrsaliye", true),
        new("currencyCode", "Döviz", true), new("subtotal", "Ara toplam", true),
        new("discountTotal", "İskonto", true), new("taxTotal", "KDV", true),
        new("grandTotal", "Genel toplam", true), new("paidAmount", "Tahsil edilen", true),
        new("returnedAmount", "İade edilen", true), new("outstandingAmount", "Açık bakiye", true),
        new("status", "Durum", true), new("ledgerEntry", "Cari kaydı", true)
    ];
    private static readonly ScreenViewField[] CustomerSalesInvoiceFields =
    [
        new("code", "Fatura", true), new("orderCode", "Sipariş", true), new("deliveryCode", "İrsaliye", true),
        new("invoiceDate", "Tarih", true), new("lineCount", "Satır", true), new("grandTotal", "Tutar", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseInvoiceFields =
    [
        new("code", "Fatura no", true), new("supplierName", "Tedarikçi", true),
        new("receiptCode", "Mal kabul", true), new("purchaseOrderCode", "Sipariş no", true),
        new("invoiceDate", "Fatura tarihi", true), new("dueDate", "Vade tarihi", true),
        new("currencyCode", "Döviz", true), new("grandTotal", "Toplam", true),
        new("paidAmount", "Ödenen", true), new("outstandingAmount", "Ödenmemiş", true),
        new("lineCount", "Satır", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseInvoiceReceiptSelectionFields =
    [
        new("receipt", "Mal kabul / sipariş", true), new("supplier", "Tedarikçi", true),
        new("receiptDate", "Kabul tarihi", true), new("warehouse", "Depo", true),
        new("lineCount", "Satır", true), new("purchaseOrderTotal", "Sipariş toplamı", true),
        new("actions", "Fatura işlemi", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] StandalonePurchaseInvoiceDraftFields =
    [
        new("invoiceNumber", "Fatura no", true), new("supplierName", "Tedarikçi", true),
        new("invoiceDate", "Fatura tarihi", true), new("dueDate", "Vade tarihi", true),
        new("currencyCode", "Döviz", true), new("grandTotal", "Genel toplam", true),
        new("lineCount", "Satır", true), new("createdAt", "Kaydedilme", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseSupplierQuoteFields =
    [
        new("code", "Teklif no", true), new("requestCode", "Talep", true), new("supplierName", "Tedarikçi", true),
        new("quoteDate", "Tarih", true), new("validUntil", "Geçerlilik", true), new("status", "Durum", true),
        new("grandTotal", "Toplam", true), new("lineCount", "Satır", false), new("createdAt", "Oluşturulma", false)
    ];
    private static readonly ScreenViewField[] PurchaseOrderFields =
    [
        new("code", "Sipariş no", true), new("supplierName", "Tedarikçi", true),
        new("orderDate", "Sipariş tarihi", true), new("expectedReceiptDate", "Beklenen teslim", true),
        new("targetWarehouseCode", "Hedef depo", true), new("lineCount", "Satır", true),
        new("grandTotal", "Genel toplam", true), new("currencyCode", "Döviz", true),
        new("status", "Durum", true), new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseReceiptFields =
    [
        new("code", "Mal kabul no", true), new("purchaseOrderCode", "Tedarikçi siparişi", true),
        new("receiptDate", "Kabul tarihi", true), new("warehouseName", "Depo", true),
        new("lineCount", "Satır", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseDeliveryNoteFields =
    [
        new("documentNumber", "Tedarikçi irsaliye no", true), new("documentDate", "Belge tarihi", true),
        new("purchaseOrderCode", "Satın alma siparişi", true), new("supplierName", "Tedarikçi", true),
        new("lineCount", "Satır", true), new("purchaseReceiptCode", "Mal kabul", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseDeliveryOrderLineFields =
    [
        new("lineNumber", "Sipariş satırı", true), new("product", "Ürün", true),
        new("orderedQuantity", "Sipariş miktarı", true),
        new("deliveryQuantity", "İrsaliye miktarı · sipariş birimi", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseOrderDeliveryNoteFields =
    [
        new("documentNumber", "Tedarikçi belge no", true), new("documentDate", "Tarih", true),
        new("lineCount", "Satır", true), new("purchaseReceiptCode", "Mal kabul", true),
        new("actions", "Bağlantı işlemi", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PurchaseDeliveryNoteLineFields =
    [
        new("orderLineNumber", "Sipariş satırı", true), new("quantity", "Miktar · temel birim", true)
    ];
    private static readonly ScreenViewField[] ManufacturingOrderFields =
    [
        new("code", "Üretim emri", true), new("plannedDate", "Plan tarihi", true),
        new("billOfMaterialName", "Reçete / rota ve fiili süre", true), new("warehouseName", "Depo", true),
        new("plannedQuantity", "Planlanan miktar", true), new("components", "Bileşenler", true),
        new("status", "Durum", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] ManufacturingWorkCenterFields =
    [
        new("code", "Kod", true), new("name", "İş merkezi", true), new("capacityMinutesPerDay", "Günlük kapasite", true),
        new("laborCostPerHourBase", "İşçilik / saat", true), new("overheadCostPerHourBase", "Genel gider / saat", true),
        new("status", "Durum", true), new("shift", "Vardiya", false)
    ];
    private static readonly ScreenViewField[] ManufacturingMrpLineFields =
    [
        new("stockItem", "Stok kartı", true), new("level", "Seviye", true),
        new("grossRequirement", "Brüt ihtiyaç", true), new("onHandAndReserved", "Stok / rezerve", true),
        new("openPurchaseOrders", "Açık satın alma", true), new("openManufacturingOrders", "Açık üretim", true),
        new("netRequirement", "Net ihtiyaç", true), new("requiredByDate", "Gerekli tarih", true),
        new("recommendedOrderDate", "Sipariş / üretim tarihi", true), new("recommendation", "Öneri", true)
    ];
    private static readonly ScreenViewField[] FixedAssetFields =
    [
        new("assetCode", "Kıymet kodu", true), new("name", "Kıymet", true), new("category", "Kategori", true),
        new("acquisitionDate", "Edinim tarihi", true), new("inServiceDate", "Kullanıma giriş", true),
        new("acquisitionCostBase", "Edinim maliyeti", true), new("residualValueBase", "Kalıntı değer", true),
        new("usefulLifeMonths", "Faydalı ömür (ay)", true), new("accumulatedDepreciationBase", "Birikmiş amortisman", true),
        new("remainingBookValueBase", "Kalan defter değeri", true),
        new("vukTaxYear", "VUK yılı", true), new("vukDepreciationLowerLimitTry", "VUK alt sınırı (TL)", true),
        new("vukCommuniqueNumber", "VUK tebliği", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] FixedAssetDepreciationFields =
    [
        new("periodStart", "Dönem", true), new("amountBase", "Tutar", true),
        new("isPosted", "Durum", true), new("journalEntryId", "Yevmiye fişi", true)
    ];
    private static readonly ScreenViewField[] FixedAssetAssignmentFields =
    [
        new("employee", "Personel", true), new("assignedDate", "Teslim", true),
        new("returnedDate", "İade", true), new("location", "Konum", true),
        new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CrmOpportunityFields =
    [
        new("code", "Fırsat kodu", true), new("name", "Fırsat", true), new("customerName", "Müşteri", true),
        new("stage", "Aşama", true), new("estimatedValue", "Tahmini değer", true),
        new("probabilityPercent", "Olasılık", true), new("expectedCloseDate", "Beklenen kapanış", true),
        new("nextActivityAt", "Sonraki takip", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] PaymentInstrumentFields =
    [
        new("instrumentNumber", "Çek/senet no", true), new("code", "Portföy kodu", true),
        new("type", "Tür", true), new("direction", "Yön", true),
        new("counterpartyName", "Cari", true), new("bankName", "Banka", true),
        new("dueDate", "Vade tarihi", true), new("amount", "Tutar", true),
        new("currencyCode", "Döviz", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] CommercialContractFields =
    [
        new("code", "Sözleşme kodu", true), new("type", "Tür", true),
        new("counterpartyName", "Cari hesap", true), new("effectiveFrom", "Başlangıç", true),
        new("effectiveThrough", "Bitiş", true), new("currencyCode", "Döviz", true),
        new("status", "Durum", true), new("revision", "Sürüm", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] OperationalProjectFields =
    [
        new("code", "Proje kodu", true), new("name", "Proje adı", true), new("status", "Durum", true),
        new("startDate", "Başlangıç", true), new("endDate", "Bitiş", true), new("budgetAmount", "Bütçe", true),
        new("currencyCode", "Döviz", true), new("taskCount", "Görev", true),
        new("completedTaskCount", "Tamamlanan görev", true), new("overdueTaskCount", "Geciken görev", true),
        new("actualHours", "Gerçekleşen saat", true), new("nextTaskDate", "Sıradaki görev", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] OperationalProjectTaskFields =
    [
        new("code", "Görev kodu", true), new("name", "Görev", true), new("status", "Durum", true),
        new("plannedHours", "Planlanan saat", true), new("startDate", "Başlangıç", true),
        new("endDate", "Bitiş", true), new("actions", "Durum işlemi", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] OperationalProjectTimeEntryFields =
    [
        new("workDate", "Çalışma tarihi", true), new("taskName", "Görev", true),
        new("hours", "Gerçekleşen saat", true), new("description", "Açıklama", true)
    ];
    private static readonly ScreenViewField[] DirectCashBudgetFields =
    [
        new("name", "Plan adı", true), new("fiscalYear", "Mali yıl", true),
        new("currencyCode", "Döviz", true), new("status", "Durum", true),
        new("lineCount", "Satır", true), new("revision", "Sürüm", true),
        new("actions", "Aç", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] FinancialAccountFields =
    [
        new("code", "Kod", true), new("name", "Hesap", true), new("type", "Tür", true),
        new("currencyCode", "Döviz", true), new("balance", "Bakiye", true),
        new("transactionCount", "Hareket", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] FinancialAccountTransactionFields =
    [
        new("transactionDate", "Tarih", true), new("source", "Kaynak", true),
        new("description", "Açıklama", true), new("cashFlowCategory", "Nakit akışı", true),
        new("reference", "Referans", true), new("inflow", "Giriş", true),
        new("outflow", "Çıkış", true), new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] GeneralLedgerJournalFields =
    [
        new("code", "Fiş", true, Fixed: true), new("entryDate", "Tarih", true),
        new("sourceType", "Kaynak", true), new("description", "Açıklama", true),
        new("totalDebit", "Borç", true), new("totalCredit", "Alacak", true)
    ];
    private static readonly ScreenViewField[] GeneralLedgerAccountFields =
    [
        new("code", "Kod", true), new("name", "Hesap", true),
        new("statementSection", "Finansal tablo sınıfı", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] GeneralLedgerMappingFields =
    [
        new("sourceAccount", "Kaynak hesabı", true), new("tenantAccount", "Eşleştirilen tenant hesabı", true),
        new("status", "Durum", true)
    ];
    private static readonly ScreenViewField[] GeneralLedgerTransferSourceFields =
    [
        new("source", "Kaynak", true), new("entryDate", "Tarih", true),
        new("description", "Açıklama", true), new("amount", "Tutar", true),
        new("actions", "Gerekli eşleştirmeler / işlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] BankStatementFields =
    [
        new("code", "Ekstre", true), new("account", "Hesap", true), new("period", "Dönem", true),
        new("openingBalance", "Açılış", true), new("closingBalance", "Kapanış", true),
        new("matching", "Eşleşme", true), new("status", "Durum", true),
        new("actions", "İşlemler", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] BankStatementLineFields =
    [
        new("lineNumber", "Satır", true), new("transactionDate", "Tarih", true),
        new("direction", "Yön", true), new("description", "Açıklama", true),
        new("externalId", "Dış işlem no", true), new("reference", "Referans", true),
        new("amount", "Tutar", true), new("matchStatus", "Eşleştirme", true),
        new("actions", "İşlem", true, Fixed: true)
    ];
    private static readonly ScreenViewField[] UnmatchedBookMovementFields =
    [
        new("date", "Tarih", true), new("source", "Kaynak", true),
        new("description", "Açıklama", true), new("amount", "Tutar", true)
    ];
    private static readonly ScreenViewField[] FinanceMaturityFields =
    [
        new("invoice", "Fatura", true), new("counterparty", "Cari", true),
        new("direction", "Yön", true), new("invoiceDate", "Fatura tarihi", true),
        new("dueDate", "Vade tarihi", true), new("outstandingAmount", "Kalan tutar", true),
        new("status", "Vade durumu", true)
    ];
    private static readonly ScreenViewField[] FinanceMaturityAgingFields =
    [
        new("direction", "Yön", true), new("currencyCode", "Döviz", true),
        new("invoiceCount", "Fatura", true), new("outstandingAmount", "Açık tutar", true),
        new("notDue", "Vadesi gelmemiş", true), new("days1To30", "1–30 gün", true),
        new("days31To60", "31–60 gün", true), new("days61To90", "61–90 gün", true),
        new("over90Days", "90+ gün", true)
    ];
    private static readonly ScreenViewField[] FinanceFxExposureFields =
    [
        new("invoice", "Fatura", true), new("counterparty", "Cari", true), new("direction", "Yön", true),
        new("invoiceDate", "Fatura tarihi", true), new("currencyCode", "Döviz", true),
        new("outstandingAmount", "Kalan tutar", true), new("invoiceDateRate", "Fatura kuru", true),
        new("currentRate", "Güncel kur", true), new("estimatedChangeBase", "Tahmini değişim", true)
    ];
    private static readonly ScreenViewField[] FinanceCashFlowForecastFields =
    [
        new("periodStart", "Dönem", true), new("openingBalance", "Açılış", true),
        new("receivables", "Alacak faturaları", true), new("payables", "Borç faturaları", true),
        new("instrumentReceivables", "Çek/senet tahsilat", true), new("instrumentPayables", "Çek/senet ödeme", true),
        new("creditFacilityPayments", "Kredi taksidi", true), new("directCashBudgetInflows", "Planlı tahsilat", true),
        new("directCashBudgetOutflows", "Planlı ödeme", true), new("postedMovements", "İleri tarihli kayıt", true),
        new("netChange", "Net değişim", true), new("closingBalance", "Kapanış tahmini", true),
        new("overdueTotal", "Vadesi geçmiş toplam", true)
    ];
    private static readonly ScreenViewField[] FinanceIncomeStatementFields =
    [
        new("account", "Hesap", true), new("section", "Sınıf", true),
        new("debit", "Borç hareketi", true), new("credit", "Alacak hareketi", true),
        new("balance", "Dönem tutarı", true)
    ];
    private static readonly ScreenViewField[] FinanceBalanceSheetFields =
    [
        new("account", "Hesap", true), new("section", "Sınıf", true),
        new("debit", "Borç hareketi", true), new("credit", "Alacak hareketi", true),
        new("balance", "Net bakiye", true)
    ];
    private static readonly ScreenViewField[] FinanceFxRevaluationVoucherFields =
    [
        new("code", "Fiş", true), new("asOfDate", "Dönem sonu", true),
        new("lineCount", "Döviz kalemi", true), new("totalDebit", "Borç", true),
        new("totalCredit", "Alacak", true), new("actions", "İşlem", true, true)
    ];
    private static readonly ScreenViewField[] FinanceFxRevaluationLineFields =
    [
        new("invoice", "Fatura / cari", true), new("direction", "Yön", true),
        new("outstandingAmount", "Açık tutar", true), new("invoiceDateRate", "Fatura kuru", true),
        new("closingRate", "Dönem kuru", true), new("adjustmentBase", "Değerleme farkı", true),
        new("debitBaseAmount", "Borç tutarı", true), new("debitAccount", "Borç hesabı", true),
        new("creditBaseAmount", "Alacak tutarı", true), new("creditAccount", "Alacak hesabı", true)
    ];
    private static readonly ScreenViewField[] FinanceTrialBalanceFields =
    [
        new("account", "Hesap", true), new("openingDebit", "Açılış borç", true),
        new("openingCredit", "Açılış alacak", true), new("debit", "Dönem borç", true),
        new("credit", "Dönem alacak", true), new("balanceDebit", "Borç bakiyesi", true),
        new("balanceCredit", "Alacak bakiyesi", true)
    ];
    private static readonly ScreenViewField[] FinanceCashFlowReportFields =
    [
        new("currencyCode", "Döviz", true), new("openingBalance", "Dönem başı", true),
        new("operating", "İşletme", true), new("investing", "Yatırım", true),
        new("financing", "Finansman", true), new("internalTransfers", "İç transfer", true),
        new("unclassified", "Sınıflandırılmamış", true), new("openingAdjustments", "Açılış düzeltmesi", true),
        new("netChange", "Net değişim", true), new("closingBalance", "Dönem sonu", true),
        new("reconciles", "Kontrol", true)
    ];
    private static readonly ScreenViewField[] FinanceBudgetScenarioFields =
    [
        new("periodStart", "Dönem", true), new("account", "Hesap", true),
        new("section", "Tür", true), new("plannedAmount", "Planlanan tahakkuk", true),
        new("actualAmount", "Yevmiye gerçekleşeni", true), new("variance", "Fark", true),
        new("notes", "Not", true)
    ];
    private static readonly ScreenViewField[] FinanceCreditScheduleFields =
    [
        new("dueDate", "Vade", true), new("principalAmount", "Anapara", true),
        new("interestAmount", "Faiz", true), new("feeAmount", "Ücret", true),
        new("total", "Toplam", true), new("status", "Durum", true),
        new("actions", "İşlem", true, true)
    ];
    private static readonly ScreenViewField[] FinanceCreditMovementFields =
    [
        new("transactionDate", "Tarih", true), new("type", "Tür", true),
        new("accountCode", "Hesap", true), new("principalAmount", "Anapara", true),
        new("interestAmount", "Faiz", true), new("feeAmount", "Ücret", true),
        new("actions", "İşlem", true, true)
    ];

    public static void MapTenantScreenViewEndpoints(this WebApplication app)
    {
        var views = app.MapGroup("/api/screen-views").WithTags("Tenant Screen Views").RequireAuthorization();

        views.MapGet("/catalog", () => Results.Ok(new[]
        {
            new ScreenViewCatalog("hr-employees", "Personel listesi", HrEmployeeFields),
            new ScreenViewCatalog("hr-leave-requests", "İzin talepleri", HrLeaveRequestFields),
            new ScreenViewCatalog("hr-attendance", "Puantaj kayıtları", HrAttendanceFields),
            new ScreenViewCatalog("hr-workplace-assignments", "İşyeri atamaları", HrWorkplaceAssignmentFields),
            new ScreenViewCatalog("hr-workplace-calendars", "İşyeri çalışma takvimleri", HrWorkplaceCalendarFields),
            new ScreenViewCatalog("hr-employee-calendar-overrides", "Kişi takvim istisnaları", HrEmployeeCalendarOverrideFields),
            new ScreenViewCatalog("customers", "Cari listesi", CustomerFields),
            new ScreenViewCatalog("customer-details", "Cari detay kartı", CustomerDetailFields),
            new ScreenViewCatalog("customer-ledger-entries", "Cari hesap hareketleri", CustomerLedgerEntryFields),
            new ScreenViewCatalog("audit-events", "İşlem kayıtları", AuditEventFields),
            new ScreenViewCatalog("inventory-stock", "Stok kartları", StockItemFields),
            new ScreenViewCatalog("inventory-stock-movements", "Stok hareket geçmişi", InventoryMovementFields),
            new ScreenViewCatalog("inventory-transfers", "Depolar arası transferler", InventoryTransferFields),
            new ScreenViewCatalog("inventory-warehouses", "Depo tanımları", InventoryWarehouseFields),
            new ScreenViewCatalog("inventory-movement-history", "Stok hareketleri", InventoryMovementHistoryFields),
            new ScreenViewCatalog("purchase-requests", "Satın alma talepleri", PurchaseRequestsScreenFields),
            new ScreenViewCatalog("purchase-order-receipts", "Satın alma siparişi mal kabulleri", PurchaseOrderReceiptsScreenFields),
            new ScreenViewCatalog("sales-invoice-payments", "Satış faturası tahsilatları", SalesInvoicePaymentsScreenFields),
            new ScreenViewCatalog("customer-detail-movements", "Cari detay hareketleri", CustomerDetailMovementsScreenFields),
            new ScreenViewCatalog("hr-compensation-records", "Gizli ücret kayıtları", HrCompensationRecordsScreenFields),
            new ScreenViewCatalog("hr-tax-declarations", "Önceki işveren beyanları", HrTaxDeclarationsScreenFields),
            new ScreenViewCatalog("hr-payroll-drafts", "Bordro taslak snapshotları", HrPayrollDraftsScreenFields),
            new ScreenViewCatalog("hr-payroll-rule-sets", "Kural seti taslakları", HrPayrollRuleSetsScreenFields),
            new ScreenViewCatalog("finance-credit-securities", "Kredi teminat ve garantileri", FinanceCreditSecuritiesScreenFields),
            new ScreenViewCatalog("foreign-trade-files", "Dış ticaret dosyaları", ForeignTradeFilesScreenFields),
            new ScreenViewCatalog("customer-provinces", "Müşteri il tanımları", CustomerProvincesScreenFields),
            new ScreenViewCatalog("customer-districts", "Müşteri ilçe tanımları", CustomerDistrictsScreenFields),
            new ScreenViewCatalog("operational-definitions", "Organizasyon tanımları", OperationalDefinitionsScreenFields),
            new ScreenViewCatalog("manufacturing-recipes", "Ürün reçeteleri", ManufacturingRecipesScreenFields),
            new ScreenViewCatalog("manufacturing-cost-variance", "Üretim maliyet farkı", ManufacturingCostVarianceScreenFields),
            new ScreenViewCatalog("finance-credit-exposure-facilities", "Kredi bazında maruziyet", FinanceCreditExposureFacilitiesScreenFields),
            new ScreenViewCatalog("integration-operations", "Entegrasyon işlem geçmişi", IntegrationOperationsScreenFields),
            new ScreenViewCatalog("e-document-submissions", "Onay bekleyen e-belge gönderimleri", EDocumentSubmissionsScreenFields),
            new ScreenViewCatalog("exchange-rates", "Döviz kurları", ExchangeRateFields),
            new ScreenViewCatalog("warehouse-location-balances", "Depo konum bakiyeleri", WarehouseLocationBalanceFields),
            new ScreenViewCatalog("inventory-warehouse-locations", "Raf ve bölmeler", WarehouseLocationFields),
            new ScreenViewCatalog("inventory-warehouse-reconciliation", "Konumlandırma denetimi", WarehouseLocationReconciliationFields),
            new ScreenViewCatalog("inventory-trace-balances", "Lot/seri stok bakiyeleri", InventoryTrackingBalanceFields),
            new ScreenViewCatalog("sales-quotes", "Satış teklifleri", SalesQuoteFields),
            new ScreenViewCatalog("sales-promotions", "Kampanyalar", SalesPromotionFields),
            new ScreenViewCatalog("sales-campaign-performance", "Kampanya performansı", SalesCampaignPerformanceFields),
            new ScreenViewCatalog("sales-distribution-plan", "Dağıtım ihtiyaç planı", SalesDistributionFields),
            new ScreenViewCatalog("sales-orders", "Satış siparişleri", SalesOrderFields),
            new ScreenViewCatalog("sales-order-lines", "Satış siparişi satırları", SalesOrderLineFields),
            new ScreenViewCatalog("sales-deliveries", "Satış irsaliyeleri", SalesDeliveryFields),
            new ScreenViewCatalog("sales-invoices", "Satış faturaları", SalesInvoiceFields),
            new ScreenViewCatalog("sales-returns", "Satış iadeleri", SalesReturnFields),
            new ScreenViewCatalog("sales-invoice-details", "Satış faturası detay özeti", SalesInvoiceDetailFields),
            new ScreenViewCatalog("customer-sales-invoices", "Cari satış faturaları", CustomerSalesInvoiceFields),
            new ScreenViewCatalog("purchase-invoices", "Alış faturaları", PurchaseInvoiceFields),
            new ScreenViewCatalog("purchase-invoice-receipt-selection", "Alış faturası girişi · mal kabul seçimi", PurchaseInvoiceReceiptSelectionFields),
            new ScreenViewCatalog("standalone-invoice-drafts", "Bağımsız alış faturası taslakları", StandalonePurchaseInvoiceDraftFields),
            new ScreenViewCatalog("purchase-orders", "Satın alma siparişleri", PurchaseOrderFields),
            new ScreenViewCatalog("purchase-supplier-quotes", "Tedarikçi teklifleri", PurchaseSupplierQuoteFields),
            new ScreenViewCatalog("purchase-receipts", "Mal kabulleri", PurchaseReceiptFields),
            new ScreenViewCatalog("purchase-delivery-notes", "Tedarikçi irsaliyeleri", PurchaseDeliveryNoteFields),
            new ScreenViewCatalog("purchase-delivery-order-lines", "İrsaliye girişi · sipariş satırları", PurchaseDeliveryOrderLineFields),
            new ScreenViewCatalog("purchase-order-delivery-notes", "Siparişe bağlı tedarikçi irsaliyeleri", PurchaseOrderDeliveryNoteFields),
            new ScreenViewCatalog("purchase-delivery-note-lines", "Tedarikçi irsaliye satırları", PurchaseDeliveryNoteLineFields),
            new ScreenViewCatalog("manufacturing-orders", "Üretim emirleri", ManufacturingOrderFields),
            new ScreenViewCatalog("manufacturing-mrp-lines", "MRP plan sonuçları", ManufacturingMrpLineFields),
            new ScreenViewCatalog("manufacturing-work-centers", "İş merkezleri", ManufacturingWorkCenterFields),
            new ScreenViewCatalog("fixed-assets", "Sabit kıymetler", FixedAssetFields),
            new ScreenViewCatalog("fixed-asset-depreciation", "Amortisman planı", FixedAssetDepreciationFields),
            new ScreenViewCatalog("fixed-asset-assignments", "Zimmet geçmişi", FixedAssetAssignmentFields),
            new ScreenViewCatalog("crm-opportunities", "CRM fırsatları", CrmOpportunityFields),
            new ScreenViewCatalog("payment-instruments", "Çek/senet portföyü", PaymentInstrumentFields),
            new ScreenViewCatalog("commercial-contracts", "Ticari sözleşmeler", CommercialContractFields),
            new ScreenViewCatalog("operational-projects", "Proje listesi", OperationalProjectFields),
            new ScreenViewCatalog("operational-project-tasks", "Proje görevleri", OperationalProjectTaskFields),
            new ScreenViewCatalog("operational-project-time-entries", "Proje süre kayıtları", OperationalProjectTimeEntryFields),
            new ScreenViewCatalog("direct-cash-budgets", "Doğrudan nakit bütçeleri", DirectCashBudgetFields),
            new ScreenViewCatalog("finance-accounts", "Kasa ve banka hesapları", FinancialAccountFields),
            new ScreenViewCatalog("finance-account-transactions", "Kasa ve banka hesap hareketleri", FinancialAccountTransactionFields),
            new ScreenViewCatalog("finance-journals", "Yevmiye defteri", GeneralLedgerJournalFields),
            new ScreenViewCatalog("finance-ledger-accounts", "Genel muhasebe hesap planı", GeneralLedgerAccountFields),
            new ScreenViewCatalog("finance-ledger-mappings", "Genel muhasebe hesap eşleştirmeleri", GeneralLedgerMappingFields),
            new ScreenViewCatalog("finance-transfer-sources", "Yevmiye aktarım kaynakları", GeneralLedgerTransferSourceFields),
            new ScreenViewCatalog("finance-statements", "Banka ekstreleri", BankStatementFields),
            new ScreenViewCatalog("finance-statement-lines", "Banka ekstresi satırları", BankStatementLineFields),
            new ScreenViewCatalog("finance-statement-unmatched-book", "Ekstreyle eşleşmeyen defter hareketleri", UnmatchedBookMovementFields),
            new ScreenViewCatalog("finance-maturities", "Açık fatura vade listesi", FinanceMaturityFields),
            new ScreenViewCatalog("finance-maturity-aging", "Vade dağılımı", FinanceMaturityAgingFields),
            new ScreenViewCatalog("finance-fx-exposure", "Döviz pozisyon raporu", FinanceFxExposureFields),
            new ScreenViewCatalog("finance-cash-flow-forecast", "Nakit tahmin tablosu", FinanceCashFlowForecastFields),
            new ScreenViewCatalog("finance-income-statement", "Gelir tablosu", FinanceIncomeStatementFields),
            new ScreenViewCatalog("finance-balance-sheet", "Bilanço", FinanceBalanceSheetFields),
            new ScreenViewCatalog("finance-trial-balance", "Mizan", FinanceTrialBalanceFields),
            new ScreenViewCatalog("finance-cash-flow-report", "Nakit akışı gerçekleşen raporu", FinanceCashFlowReportFields),
            new ScreenViewCatalog("finance-budget-scenarios", "Bütçe planı ve gerçekleşen", FinanceBudgetScenarioFields),
            new ScreenViewCatalog("finance-fx-revaluations", "Kur değerleme fişleri", FinanceFxRevaluationVoucherFields),
            new ScreenViewCatalog("finance-fx-revaluation-lines", "Kur değerleme fiş satırları", FinanceFxRevaluationLineFields),
            new ScreenViewCatalog("finance-credit-schedules", "Kredi ödeme planları", FinanceCreditScheduleFields),
            new ScreenViewCatalog("finance-credit-movements", "Gerçekleşen kredi hareketleri", FinanceCreditMovementFields)
        }));

        views.MapGet("/{screenKey}/active", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "read", ct)) return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            var view = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.IsPublished, ct);
            return Results.Ok(view is null ? DefaultView(catalog) : ToView(view, catalog));
        });

        views.MapGet("/{screenKey}/draft", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "read", ct)) return Results.Forbid();
            var canManageDrafts = await CanManageDraftsAsync(authorizer, tenantId, userId, role, ct);
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            var draft = canManageDrafts ? await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && !x.IsPublished &&
                    !db.TenantScreenViewRevisions.Any(revision => revision.TenantId == tenantId && revision.ScreenViewId == x.Id &&
                        (revision.ChangeKind == "Published" || revision.ChangeKind == "Superseded")), ct) : null;
            var active = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.IsPublished, ct);
            return Results.Ok(new ScreenViewEditorState(catalog, active is null ? DefaultView(catalog) : ToView(active, catalog), draft is null ? null : ToView(draft, catalog)));
        });

        views.MapPost("/{screenKey}/draft", async (string screenKey, ScreenViewDraftCreateRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "create", ct)) return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            if (await db.TenantScreenViews.AnyAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && !x.IsPublished &&
                !db.TenantScreenViewRevisions.Any(revision => revision.TenantId == tenantId && revision.ScreenViewId == x.Id &&
                    (revision.ChangeKind == "Published" || revision.ChangeKind == "Superseded")), ct))
                return Results.Conflict(new { error = "Bu ekran için düzenlenmekte olan bir taslak zaten var." });
            var active = await db.TenantScreenViews.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.IsPublished, ct);
            var name = NormalizeName(request.Name, catalog.Label);
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantScreenView
            {
                TenantId = tenantId, ScreenKey = catalog.Key, Name = name,
                LayoutJson = request.UseStandard
                    ? SerializeLayout(DefaultView(catalog).Fields, DefaultView(catalog).PageSettings)
                    : active?.LayoutJson ?? SerializeLayout(DefaultView(catalog).Fields, DefaultView(catalog).PageSettings),
                Revision = 1, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantScreenViews.Add(draft);
            db.TenantScreenViewRevisions.Add(RevisionOf(draft, userId, "DraftCreated"));
            AddAudit(db, tenantId, userId, "screen-view.draft-created", catalog.Key);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/screen-views/{catalog.Key}/draft", ToView(draft, catalog));
        });

        views.MapPut("/{viewId:guid}", async (Guid viewId, ScreenViewUpdateRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "update", ct)) return Results.Forbid();
            var view = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == viewId, ct);
            if (view is null) return Results.NotFound();
            if (view.IsPublished) return Results.Conflict(new { error = "Yayımlanmış görünüm doğrudan değiştirilemez; yeni taslak oluşturun." });
            if (request.ExpectedRevision != view.Revision) return Results.Conflict(new { error = "Taslak başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin." });
            if (!TryGetCatalog(view.ScreenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            if (!TryNormalizeFields(request.Fields, catalog, out var fields, out var errors)) return Results.ValidationProblem(errors!);
            var name = NormalizeName(request.Name, catalog.Label);
            db.TenantScreenViewRevisions.Add(RevisionOf(view, userId, "Updated"));
            CustomerPageSettings? pageSettings = null;
            if (catalog.Key == "customers")
            {
                pageSettings = NormalizePageSettings(request.PageSettings ?? ReadPageSettings(view.LayoutJson), out var pageSettingsError);
                if (pageSettingsError is not null)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["pageSettings"] = [pageSettingsError] });
            }
            view.Name = name; view.LayoutJson = SerializeLayout(fields, pageSettings);
            view.Revision++; view.UpdatedByUserId = userId; view.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "screen-view.draft-updated", $"{view.ScreenKey}@{view.Revision}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Taslak eşzamanlı değiştirildi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(view, catalog));
        });

        views.MapPost("/{viewId:guid}/publish", async (Guid viewId, ScreenViewPublishRequest request, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "execute", ct)) return Results.Forbid();
            var draft = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == viewId, ct);
            if (draft is null) return Results.NotFound();
            if (draft.IsPublished) return Results.Conflict(new { error = "Görünüm zaten yayımlanmış." });
            if (request.ExpectedRevision != draft.Revision) return Results.Conflict(new { error = "Taslak başka bir kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin." });
            if (!TryGetCatalog(draft.ScreenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            if (!TryNormalizeFields(catalog.Key == "customers" ? WithFixedFields(catalog, ReadFields(draft.LayoutJson)) : ReadFields(draft.LayoutJson), catalog, out _, out var errors))
                return Results.Conflict(new { error = "Görünüm tanımı artık geçerli değil.", details = errors });
            var previous = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == draft.ScreenKey && x.IsPublished, ct);
            if (previous is not null)
            {
                db.TenantScreenViewRevisions.Add(RevisionOf(previous, userId, "Superseded"));
                previous.IsPublished = false; previous.Revision++; previous.UpdatedByUserId = userId; previous.UpdatedAt = DateTimeOffset.UtcNow;
            }
            db.TenantScreenViewRevisions.Add(RevisionOf(draft, userId, "Published"));
            draft.IsPublished = true; draft.Revision++; draft.UpdatedByUserId = userId; draft.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(db, tenantId, userId, "screen-view.published", $"{draft.ScreenKey}@{draft.Revision}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Görünüm eşzamanlı değiştirildi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(draft, catalog));
        });

        views.MapGet("/{screenKey}/history", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "read", ct)) return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            var items = await db.TenantScreenViewRevisions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key)
                .OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct);
            return Results.Ok(items.Select(ToRevisionView));
        });

        views.MapPost("/{screenKey}/draft-from-revision/{revisionId:guid}", async (string screenKey, Guid revisionId, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "create", ct)) return Results.Forbid();
            if (!TryGetCatalog(screenKey, out var catalog)) return Results.NotFound();
            catalog = await WithCustomerFieldsAsync(catalog, tenantId, db, ct);
            if (await db.TenantScreenViews.AnyAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && !x.IsPublished &&
                !db.TenantScreenViewRevisions.Any(revision => revision.TenantId == tenantId && revision.ScreenViewId == x.Id &&
                    (revision.ChangeKind == "Published" || revision.ChangeKind == "Superseded")), ct))
                return Results.Conflict(new { error = "Önce mevcut taslağı yayımlayın veya düzenlemeyi tamamlayın." });
            var old = await db.TenantScreenViewRevisions.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == catalog.Key && x.Id == revisionId, ct);
            if (old is null) return Results.NotFound();
            if (!TryNormalizeFields(catalog.Key == "customers" ? WithFixedFields(catalog, ReadFields(old.LayoutJson)) : ReadFields(old.LayoutJson), catalog, out var fields, out var errors))
                return Results.Conflict(new { error = "Geçmiş görünüm artık geçerli değil.", details = errors });
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantScreenView
            {
                TenantId = tenantId, ScreenKey = catalog.Key, Name = old.Name,
                LayoutJson = SerializeLayout(fields, catalog.Key == "customers" ? ReadPageSettings(old.LayoutJson) : null), Revision = 1,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantScreenViews.Add(draft);
            db.TenantScreenViewRevisions.Add(RevisionOf(draft, userId, $"RestoredDraft:{old.Revision}"));
            AddAudit(db, tenantId, userId, "screen-view.restore-draft-created", $"{catalog.Key}:revision:{old.Revision}");
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/screen-views/{catalog.Key}/draft", ToView(draft, catalog));
        });
    }

    private static bool TryTenantContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = Guid.Empty; userId = Guid.Empty; role = "";
        if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) || !Guid.TryParse(user.FindFirstValue("sub"), out userId)) return false;
        role = user.FindFirstValue("role") ?? "";
        return true;
    }

    private static async Task<bool> CanManageDraftsAsync(IPlatformPermissionAuthorizer authorizer, Guid tenantId,
        Guid userId, string role, CancellationToken ct) =>
        await IsAllowedAsync(authorizer, tenantId, userId, role, "create", ct)
        || await IsAllowedAsync(authorizer, tenantId, userId, role, "update", ct)
        || await IsAllowedAsync(authorizer, tenantId, userId, role, "execute", ct);

    private static async Task<bool> IsAllowedAsync(IPlatformPermissionAuthorizer authorizer, Guid tenantId,
        Guid userId, string role, string action, CancellationToken ct)
    {
        var definition = PlatformPermissionCatalog.Definitions.Single(x => x.ResourceType == "erp.screen-views" && x.Action == action);
        var permission = new ResolvedPlatformPermission(definition, new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role,
            ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.action"] = action
        });
        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, ct);
    }

    private static bool TryGetCatalog(string key, out ScreenViewCatalog catalog)
    {
        if (string.Equals(key, "hr-employees", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-employees", "Personel listesi", HrEmployeeFields);
            return true;
        }
        if (string.Equals(key, "hr-leave-requests", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-leave-requests", "İzin talepleri", HrLeaveRequestFields);
            return true;
        }
        if (string.Equals(key, "hr-attendance", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-attendance", "Puantaj kayıtları", HrAttendanceFields);
            return true;
        }
        if (string.Equals(key, "hr-workplace-assignments", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-workplace-assignments", "İşyeri atamaları", HrWorkplaceAssignmentFields);
            return true;
        }
        if (string.Equals(key, "hr-workplace-calendars", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-workplace-calendars", "İşyeri çalışma takvimleri", HrWorkplaceCalendarFields);
            return true;
        }
        if (string.Equals(key, "hr-employee-calendar-overrides", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-employee-calendar-overrides", "Kişi takvim istisnaları", HrEmployeeCalendarOverrideFields);
            return true;
        }
        if (string.Equals(key, "customers", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customers", "Cari listesi", CustomerFields);
            return true;
        }
        if (string.Equals(key, "customer-details", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customer-details", "Cari detay kartı", CustomerDetailFields);
            return true;
        }
        if (string.Equals(key, "customer-ledger-entries", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customer-ledger-entries", "Cari hesap hareketleri", CustomerLedgerEntryFields);
            return true;
        }
        if (string.Equals(key, "audit-events", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("audit-events", "İşlem kayıtları", AuditEventFields);
            return true;
        }
        if (string.Equals(key, "inventory-stock", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-stock", "Stok kartları", StockItemFields);
            return true;
        }
        if (string.Equals(key, "inventory-stock-movements", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-stock-movements", "Stok hareket geçmişi", InventoryMovementFields);
            return true;
        }
        if (string.Equals(key, "manufacturing-recipes", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("manufacturing-recipes", "Ürün reçeteleri", ManufacturingRecipesScreenFields);
            return true;
        }
        if (string.Equals(key, "manufacturing-cost-variance", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("manufacturing-cost-variance", "Üretim maliyet farkı", ManufacturingCostVarianceScreenFields);
            return true;
        }
        if (string.Equals(key, "finance-credit-exposure-facilities", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-credit-exposure-facilities", "Kredi bazında maruziyet", FinanceCreditExposureFacilitiesScreenFields);
            return true;
        }
        if (string.Equals(key, "integration-operations", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("integration-operations", "Entegrasyon işlem geçmişi", IntegrationOperationsScreenFields);
            return true;
        }
        if (string.Equals(key, "e-document-submissions", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("e-document-submissions", "Onay bekleyen e-belge gönderimleri", EDocumentSubmissionsScreenFields);
            return true;
        }
        if (string.Equals(key, "purchase-requests", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-requests", "Satın alma talepleri", PurchaseRequestsScreenFields);
            return true;
        }
        if (string.Equals(key, "purchase-order-receipts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-order-receipts", "Satın alma siparişi mal kabulleri", PurchaseOrderReceiptsScreenFields);
            return true;
        }
        if (string.Equals(key, "sales-invoice-payments", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-invoice-payments", "Satış faturası tahsilatları", SalesInvoicePaymentsScreenFields);
            return true;
        }
        if (string.Equals(key, "customer-detail-movements", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customer-detail-movements", "Cari detay hareketleri", CustomerDetailMovementsScreenFields);
            return true;
        }
        if (string.Equals(key, "hr-compensation-records", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-compensation-records", "Gizli ücret kayıtları", HrCompensationRecordsScreenFields);
            return true;
        }
        if (string.Equals(key, "hr-tax-declarations", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-tax-declarations", "Önceki işveren beyanları", HrTaxDeclarationsScreenFields);
            return true;
        }
        if (string.Equals(key, "hr-payroll-drafts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-payroll-drafts", "Bordro taslak snapshotları", HrPayrollDraftsScreenFields);
            return true;
        }
        if (string.Equals(key, "hr-payroll-rule-sets", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("hr-payroll-rule-sets", "Kural seti taslakları", HrPayrollRuleSetsScreenFields);
            return true;
        }
        if (string.Equals(key, "finance-credit-securities", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-credit-securities", "Kredi teminat ve garantileri", FinanceCreditSecuritiesScreenFields);
            return true;
        }
        if (string.Equals(key, "foreign-trade-files", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("foreign-trade-files", "Dış ticaret dosyaları", ForeignTradeFilesScreenFields);
            return true;
        }
        if (string.Equals(key, "customer-provinces", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customer-provinces", "Müşteri il tanımları", CustomerProvincesScreenFields);
            return true;
        }
        if (string.Equals(key, "customer-districts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customer-districts", "Müşteri ilçe tanımları", CustomerDistrictsScreenFields);
            return true;
        }
        if (string.Equals(key, "operational-definitions", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("operational-definitions", "Organizasyon tanımları", OperationalDefinitionsScreenFields);
            return true;
        }
        if (string.Equals(key, "inventory-movement-history", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-movement-history", "Stok hareketleri", InventoryMovementHistoryFields);
            return true;
        }
        if (string.Equals(key, "inventory-warehouses", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-warehouses", "Depo tanımları", InventoryWarehouseFields);
            return true;
        }
        if (string.Equals(key, "inventory-transfers", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-transfers", "Depolar arası transferler", InventoryTransferFields);
            return true;
        }
        if (string.Equals(key, "exchange-rates", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("exchange-rates", "Döviz kurları", ExchangeRateFields);
            return true;
        }
        if (string.Equals(key, "warehouse-location-balances", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("warehouse-location-balances", "Depo konum bakiyeleri", WarehouseLocationBalanceFields);
            return true;
        }
        if (string.Equals(key, "inventory-warehouse-locations", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-warehouse-locations", "Raf ve bölmeler", WarehouseLocationFields);
            return true;
        }
        if (string.Equals(key, "inventory-warehouse-reconciliation", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-warehouse-reconciliation", "Konumlandırma denetimi", WarehouseLocationReconciliationFields);
            return true;
        }
        if (string.Equals(key, "inventory-trace-balances", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("inventory-trace-balances", "Lot/seri stok bakiyeleri", InventoryTrackingBalanceFields);
            return true;
        }
        if (string.Equals(key, "sales-orders", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-orders", "Satış siparişleri", SalesOrderFields);
            return true;
        }
        if (string.Equals(key, "sales-order-lines", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-order-lines", "Satış siparişi satırları", SalesOrderLineFields);
            return true;
        }
        if (string.Equals(key, "sales-quotes", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-quotes", "Satış teklifleri", SalesQuoteFields);
            return true;
        }
        if (string.Equals(key, "sales-promotions", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-promotions", "Kampanyalar", SalesPromotionFields);
            return true;
        }
        if (string.Equals(key, "sales-campaign-performance", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-campaign-performance", "Kampanya performansı", SalesCampaignPerformanceFields);
            return true;
        }
        if (string.Equals(key, "sales-distribution-plan", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-distribution-plan", "Dağıtım ihtiyaç planı", SalesDistributionFields);
            return true;
        }
        if (string.Equals(key, "sales-deliveries", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-deliveries", "Satış irsaliyeleri", SalesDeliveryFields);
            return true;
        }
        if (string.Equals(key, "sales-invoices", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-invoices", "Satış faturaları", SalesInvoiceFields);
            return true;
        }
        if (string.Equals(key, "sales-returns", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-returns", "Satış iadeleri", SalesReturnFields);
            return true;
        }
        if (string.Equals(key, "sales-invoice-details", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("sales-invoice-details", "Satış faturası detay özeti", SalesInvoiceDetailFields);
            return true;
        }
        if (string.Equals(key, "customer-sales-invoices", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("customer-sales-invoices", "Cari satış faturaları", CustomerSalesInvoiceFields);
            return true;
        }
        if (string.Equals(key, "purchase-invoices", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-invoices", "Alış faturaları", PurchaseInvoiceFields);
            return true;
        }
        if (string.Equals(key, "purchase-invoice-receipt-selection", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-invoice-receipt-selection", "Alış faturası girişi · mal kabul seçimi", PurchaseInvoiceReceiptSelectionFields);
            return true;
        }
        if (string.Equals(key, "standalone-invoice-drafts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("standalone-invoice-drafts", "Bağımsız alış faturası taslakları", StandalonePurchaseInvoiceDraftFields);
            return true;
        }
        if (string.Equals(key, "purchase-supplier-quotes", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-supplier-quotes", "Tedarikçi teklifleri", PurchaseSupplierQuoteFields);
            return true;
        }
        if (string.Equals(key, "purchase-orders", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-orders", "Satın alma siparişleri", PurchaseOrderFields);
            return true;
        }
        if (string.Equals(key, "purchase-receipts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-receipts", "Mal kabulleri", PurchaseReceiptFields);
            return true;
        }
        if (string.Equals(key, "purchase-delivery-notes", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-delivery-notes", "Tedarikçi irsaliyeleri", PurchaseDeliveryNoteFields);
            return true;
        }
        if (string.Equals(key, "purchase-delivery-order-lines", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-delivery-order-lines", "İrsaliye girişi · sipariş satırları", PurchaseDeliveryOrderLineFields);
            return true;
        }
        if (string.Equals(key, "purchase-order-delivery-notes", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-order-delivery-notes", "Siparişe bağlı tedarikçi irsaliyeleri", PurchaseOrderDeliveryNoteFields);
            return true;
        }
        if (string.Equals(key, "purchase-delivery-note-lines", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("purchase-delivery-note-lines", "Tedarikçi irsaliye satırları", PurchaseDeliveryNoteLineFields);
            return true;
        }
        if (string.Equals(key, "manufacturing-orders", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("manufacturing-orders", "Üretim emirleri", ManufacturingOrderFields);
            return true;
        }
        if (string.Equals(key, "manufacturing-work-centers", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("manufacturing-work-centers", "İş merkezleri", ManufacturingWorkCenterFields);
            return true;
        }
        if (string.Equals(key, "manufacturing-mrp-lines", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("manufacturing-mrp-lines", "MRP plan sonuçları", ManufacturingMrpLineFields);
            return true;
        }
        if (string.Equals(key, "fixed-assets", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("fixed-assets", "Sabit kıymetler", FixedAssetFields);
            return true;
        }
        if (string.Equals(key, "fixed-asset-depreciation", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("fixed-asset-depreciation", "Amortisman planı", FixedAssetDepreciationFields);
            return true;
        }
        if (string.Equals(key, "fixed-asset-assignments", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("fixed-asset-assignments", "Zimmet geçmişi", FixedAssetAssignmentFields);
            return true;
        }
        if (string.Equals(key, "crm-opportunities", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("crm-opportunities", "CRM fırsatları", CrmOpportunityFields);
            return true;
        }
        if (string.Equals(key, "payment-instruments", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("payment-instruments", "Çek/senet portföyü", PaymentInstrumentFields);
            return true;
        }
        if (string.Equals(key, "commercial-contracts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("commercial-contracts", "Ticari sözleşmeler", CommercialContractFields);
            return true;
        }
        if (string.Equals(key, "operational-projects", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("operational-projects", "Proje listesi", OperationalProjectFields);
            return true;
        }
        if (string.Equals(key, "operational-project-tasks", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("operational-project-tasks", "Proje görevleri", OperationalProjectTaskFields);
            return true;
        }
        if (string.Equals(key, "operational-project-time-entries", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("operational-project-time-entries", "Proje süre kayıtları", OperationalProjectTimeEntryFields);
            return true;
        }
        if (string.Equals(key, "direct-cash-budgets", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("direct-cash-budgets", "Doğrudan nakit bütçeleri", DirectCashBudgetFields);
            return true;
        }
        if (string.Equals(key, "finance-accounts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-accounts", "Kasa ve banka hesapları", FinancialAccountFields);
            return true;
        }
        if (string.Equals(key, "finance-account-transactions", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-account-transactions", "Kasa ve banka hesap hareketleri", FinancialAccountTransactionFields);
            return true;
        }
        if (string.Equals(key, "finance-journals", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-journals", "Yevmiye defteri", GeneralLedgerJournalFields);
            return true;
        }
        if (string.Equals(key, "finance-ledger-accounts", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-ledger-accounts", "Genel muhasebe hesap planı", GeneralLedgerAccountFields);
            return true;
        }
        if (string.Equals(key, "finance-ledger-mappings", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-ledger-mappings", "Genel muhasebe hesap eşleştirmeleri", GeneralLedgerMappingFields);
            return true;
        }
        if (string.Equals(key, "finance-transfer-sources", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-transfer-sources", "Yevmiye aktarım kaynakları", GeneralLedgerTransferSourceFields);
            return true;
        }
        if (string.Equals(key, "finance-statements", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-statements", "Banka ekstreleri", BankStatementFields);
            return true;
        }
        if (string.Equals(key, "finance-statement-lines", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-statement-lines", "Banka ekstresi satırları", BankStatementLineFields);
            return true;
        }
        if (string.Equals(key, "finance-statement-unmatched-book", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-statement-unmatched-book", "Ekstreyle eşleşmeyen defter hareketleri", UnmatchedBookMovementFields);
            return true;
        }
        if (string.Equals(key, "finance-maturities", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-maturities", "Açık fatura vade listesi", FinanceMaturityFields);
            return true;
        }
        if (string.Equals(key, "finance-maturity-aging", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-maturity-aging", "Vade dağılımı", FinanceMaturityAgingFields);
            return true;
        }
        if (string.Equals(key, "finance-fx-exposure", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-fx-exposure", "Döviz pozisyon raporu", FinanceFxExposureFields);
            return true;
        }
        if (string.Equals(key, "finance-cash-flow-forecast", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-cash-flow-forecast", "Nakit tahmin tablosu", FinanceCashFlowForecastFields);
            return true;
        }
        if (string.Equals(key, "finance-income-statement", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-income-statement", "Gelir tablosu", FinanceIncomeStatementFields);
            return true;
        }
        if (string.Equals(key, "finance-balance-sheet", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-balance-sheet", "Bilanço", FinanceBalanceSheetFields);
            return true;
        }
        if (string.Equals(key, "finance-trial-balance", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-trial-balance", "Mizan", FinanceTrialBalanceFields);
            return true;
        }
        if (string.Equals(key, "finance-cash-flow-report", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-cash-flow-report", "Nakit akışı gerçekleşen raporu", FinanceCashFlowReportFields);
            return true;
        }
        if (string.Equals(key, "finance-budget-scenarios", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-budget-scenarios", "Bütçe planı ve gerçekleşen", FinanceBudgetScenarioFields);
            return true;
        }
        if (string.Equals(key, "finance-fx-revaluations", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-fx-revaluations", "Kur değerleme fişleri", FinanceFxRevaluationVoucherFields);
            return true;
        }
        if (string.Equals(key, "finance-fx-revaluation-lines", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-fx-revaluation-lines", "Kur değerleme fiş satırları", FinanceFxRevaluationLineFields);
            return true;
        }
        if (string.Equals(key, "finance-credit-schedules", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-credit-schedules", "Kredi ödeme planları", FinanceCreditScheduleFields);
            return true;
        }
        if (string.Equals(key, "finance-credit-movements", StringComparison.OrdinalIgnoreCase))
        {
            catalog = new ScreenViewCatalog("finance-credit-movements", "Gerçekleşen kredi hareketleri", FinanceCreditMovementFields);
            return true;
        }
        catalog = null!;
        return false;
    }

    private static ScreenViewRecord DefaultView(ScreenViewCatalog catalog) => new(null, catalog.Key, catalog.Label, "Varsayılan", false, 0, catalog.Fields.Select((x, i) => new ScreenViewFieldLayout(x.Key, x.Label, x.DefaultVisible, i, x.Fixed, x.Section)).ToArray(), catalog.Key == "customers" ? DefaultCustomerPageSettings : null);
    private static readonly CustomerPageSettings DefaultCustomerPageSettings = new("Cari Hesaplar", "Müşteri ve tedarikçi kartlarını firma bazında yönetin.", "Cari ara", "Cari kodu, unvanı veya vergi no ile ara", "Cari türü", "Durum", "Filtrele", true, true);
    private static IReadOnlyList<ScreenViewFieldLayout> ReadFields(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var fields = root.ValueKind == JsonValueKind.Array ? root : root.ValueKind == JsonValueKind.Object && root.TryGetProperty("fields", out var nested) ? nested : default;
        return fields.ValueKind == JsonValueKind.Array ? JsonSerializer.Deserialize<IReadOnlyList<ScreenViewFieldLayout>>(fields.GetRawText(), JsonOptions) ?? [] : [];
    }
    private static CustomerPageSettings? ReadPageSettings(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty("pageSettings", out var settings)
            ? JsonSerializer.Deserialize<CustomerPageSettings>(settings.GetRawText(), JsonOptions) ?? DefaultCustomerPageSettings
            : DefaultCustomerPageSettings;
    }
    private static string SerializeLayout(IReadOnlyList<ScreenViewFieldLayout> fields, CustomerPageSettings? pageSettings) =>
        pageSettings is null ? JsonSerializer.Serialize(fields, JsonOptions) : JsonSerializer.Serialize(new ScreenViewLayoutDocument(fields, pageSettings), JsonOptions);
    private static CustomerPageSettings? NormalizePageSettings(CustomerPageSettings? requested, out string? error)
    {
        error = null;
        if (requested is null) return DefaultCustomerPageSettings;
        static bool valid(string? value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= maximum && !value.Any(char.IsControl);
        if (!valid(requested.Title, 120) || !valid(requested.Description, 300) || !valid(requested.SearchLabel, 60)
            || !valid(requested.SearchPlaceholder, 120) || !valid(requested.TypeFilterLabel, 60) || !valid(requested.StatusFilterLabel, 60)
            || !valid(requested.ApplyLabel, 40))
        {
            error = "Sayfa metinleri boş olmamalı ve alan uzunluklarını aşmamalıdır.";
            return null;
        }
        return requested with { Title = requested.Title.Trim(), Description = requested.Description.Trim(), SearchLabel = requested.SearchLabel.Trim(), SearchPlaceholder = requested.SearchPlaceholder.Trim(), TypeFilterLabel = requested.TypeFilterLabel.Trim(), StatusFilterLabel = requested.StatusFilterLabel.Trim(), ApplyLabel = requested.ApplyLabel.Trim() };
    }
    private static string NormalizeName(string? name, string fallback) => string.IsNullOrWhiteSpace(name) ? fallback : name.Trim()[..Math.Min(name.Trim().Length, 120)];
    private static async Task<ScreenViewCatalog> WithCustomerFieldsAsync(ScreenViewCatalog catalog, Guid tenantId, TenantDbContext db, CancellationToken ct)
    {
        if (catalog.Key is not ("customers" or "sales-invoices")) return catalog;
        // Keep inactive definitions in the catalog so existing layouts and revisions remain editable.
        var definitions = catalog.Key == "customers"
            ? await db.CustomerCustomFieldDefinitions.AsNoTracking()
                .Where(x => x.TenantId == tenantId).OrderBy(x => x.Label)
                .Select(x => new { x.Id, x.Label, x.IsActive }).ToListAsync(ct)
            : await db.SalesInvoiceCustomFieldDefinitions.AsNoTracking()
                .Where(x => x.TenantId == tenantId).OrderBy(x => x.Label)
                .Select(x => new { x.Id, x.Label, x.IsActive }).ToListAsync(ct);
        var fields = catalog.Fields.Where(x => !x.Fixed).ToList();
        fields.AddRange(definitions.Select(x => new ScreenViewField($"custom:{x.Id:D}",
            (x.Label.Length > 65 ? x.Label[..65] : x.Label) + (x.IsActive ? "" : " (pasif)"), false)));
        fields.AddRange(catalog.Fields.Where(x => x.Fixed));
        return catalog with { Fields = fields };
    }
    private static ScreenViewRecord ToView(TenantScreenView x, ScreenViewCatalog catalog) => new(x.Id, x.ScreenKey,
        catalog.Label, x.Name, x.IsPublished, x.Revision, WithFixedFields(catalog, ReadFields(x.LayoutJson)), catalog.Key == "customers" ? ReadPageSettings(x.LayoutJson) : null);
    private static ScreenViewRevisionView ToRevisionView(TenantScreenViewRevision x) => new(x.Id, x.Revision, x.Name, WithFixedFields(x.ScreenKey, x.LayoutJson is null ? [] : ReadFields(x.LayoutJson)), x.ChangeKind, x.ChangedByUserId, x.CreatedAt);
    private static IReadOnlyList<ScreenViewFieldLayout> WithFixedFields(string screenKey, IReadOnlyList<ScreenViewFieldLayout> fields)
    {
        if (!TryGetCatalog(screenKey, out var catalog)) return fields;
        return WithFixedFields(catalog, fields);
    }
    private static IReadOnlyList<ScreenViewFieldLayout> WithFixedFields(ScreenViewCatalog catalog, IReadOnlyList<ScreenViewFieldLayout> fields)
    {
        var ordered = fields.OrderBy(field => field.Position)
            .Select(field =>
            {
                var metadata = catalog.Fields.SingleOrDefault(x => x.Key == field.Key);
                return field with { Fixed = metadata?.Fixed ?? false, Section = string.IsNullOrWhiteSpace(field.Section) ? metadata?.Section : field.Section };
            })
            .ToList();
        var existingKeys = ordered.Select(field => field.Key).ToHashSet(StringComparer.Ordinal);
        var missing = catalog.Fields.Where(field => !existingKeys.Contains(field.Key)).ToArray();
        if (missing.Length == 0) return ordered;

        // Older published layouts stay in their saved order and keep their labels/visibility.
        // New built-in fields are appended before fixed action columns, using catalog defaults.
        var insertionIndex = ordered.FindIndex(field => field.Fixed);
        if (insertionIndex < 0) insertionIndex = ordered.Count;

        var merged = new List<ScreenViewFieldLayout>(ordered.Count + missing.Length);
        merged.AddRange(ordered.Take(insertionIndex));
        merged.AddRange(missing.Select(field => new ScreenViewFieldLayout(
            field.Key, field.Label, field.DefaultVisible, 0, field.Fixed, field.Section)));
        merged.AddRange(ordered.Skip(insertionIndex));
        return merged.Select((field, position) => field with { Position = position }).ToArray();
    }
    private static TenantScreenViewRevision RevisionOf(TenantScreenView x, Guid userId, string changeKind) => new()
    {
        TenantId = x.TenantId, ScreenViewId = x.Id, Revision = x.Revision, ScreenKey = x.ScreenKey, Name = x.Name,
        LayoutJson = x.LayoutJson, ChangeKind = changeKind, ChangedByUserId = userId, CreatedAt = DateTimeOffset.UtcNow
    };

    private static bool TryNormalizeFields(IReadOnlyList<ScreenViewFieldLayout>? requested, ScreenViewCatalog catalog,
        out IReadOnlyList<ScreenViewFieldLayout> normalized, out Dictionary<string, string[]>? errors)
    {
        normalized = [];
        errors = null;
        if (requested is null || requested.Count != catalog.Fields.Count)
        {
            errors = new Dictionary<string, string[]> { ["fields"] = ["Katalogdaki tüm alanlar bir kez gönderilmelidir."] };
            return false;
        }
        var available = catalog.Fields.ToDictionary(x => x.Key, StringComparer.Ordinal);
        var result = new List<ScreenViewFieldLayout>(requested.Count);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (field, requestedIndex) in requested.OrderBy(x => x.Position).Select((field, index) => (field, index)))
        {
            if (field is null || !available.TryGetValue(field.Key ?? "", out var metadata) || !seen.Add(field.Key!))
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Alanlar katalogda bulunmalı ve yinelenmemelidir."] };
                return false;
            }
            var label = field.Label?.Trim();
            if (string.IsNullOrWhiteSpace(label) || label.Length > 80)
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Alan etiketleri 1–80 karakter olmalıdır."] };
                return false;
            }
            if (metadata.Fixed && !field.Visible)
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["İşlemler alanı gizlenemez."] };
                return false;
            }
            if (metadata.Fixed && requestedIndex != requested.Count - 1)
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Sabit alanlar listenin sonunda tutulmalıdır."] };
                return false;
            }
            var section = field.Section?.Trim();
            if (section is { Length: > 40 } || section?.Any(char.IsControl) == true || metadata.Fixed && !string.IsNullOrEmpty(section))
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Alan bölümü en fazla 40 karakter olabilir; sabit sistem alanları bölümlendirilemez."] };
                return false;
            }
            var supportsColumnWidth = ResizableColumnScreenKeys.Contains(catalog.Key);
            if (field.Width is not null && (!supportsColumnWidth || metadata.Fixed || field.Width is < 80 or > 640))
            {
                errors = new Dictionary<string, string[]> { ["fields"] = ["Sütun genişliği yalnız cari, finans ve satış iade listelerinde 80–640 piksel aralığında ayarlanabilir; sistem işlem sütunu sabit kalır."] };
                return false;
            }
            result.Add(new ScreenViewFieldLayout(metadata.Key, label, field.Visible, result.Count, metadata.Fixed, string.IsNullOrWhiteSpace(section) ? null : section, field.Width));
        }
        if (seen.Count != available.Count)
        {
            errors = new Dictionary<string, string[]> { ["fields"] = ["Katalogdaki alanlar eksik."] };
            return false;
        }
        normalized = result;
        return true;
    }

    internal static bool ValidatePackageLayout(string screenKey, string layoutJson,
        IReadOnlyList<ScreenViewFieldLayout> packagedCustomFields, out string[] errors)
    {
        errors = [];
        if (!TryGetCatalog(screenKey, out var catalog))
        {
            errors = ["Ekran anahtarı bu sürümde desteklenmiyor."];
            return false;
        }
        IReadOnlyList<ScreenViewFieldLayout>? fields;
        try { fields = ReadFields(layoutJson); }
        catch (JsonException)
        {
            errors = ["Ekran düzeni okunamadı."];
            return false;
        }
        IReadOnlyList<ScreenViewFieldLayout> customFields = catalog.Key is "customers" or "sales-invoices"
            ? packagedCustomFields : Array.Empty<ScreenViewFieldLayout>();
        var expandedCatalog = catalog with
        {
            Fields = catalog.Fields.Where(field => !field.Fixed)
                .Concat(customFields.Select(field => new ScreenViewField(field.Key, field.Label, false)))
                .Concat(catalog.Fields.Where(field => field.Fixed)).ToArray()
        };
        if (TryNormalizeFields(fields, expandedCatalog, out _, out var validationErrors)) return true;
        errors = validationErrors?.Values.SelectMany(messages => messages).ToArray() ?? new[] { "Ekran düzeni geçersiz." };
        return false;
    }

    private static void AddAudit(TenantDbContext db, Guid tenantId, Guid userId, string action, string resource) =>
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = action, Resource = resource });

    private sealed record ScreenViewDraftCreateRequest(string? Name, bool UseStandard = false);
    private sealed record ScreenViewUpdateRequest(int ExpectedRevision, string? Name, IReadOnlyList<ScreenViewFieldLayout>? Fields, CustomerPageSettings? PageSettings = null);
    private sealed record CustomerPageSettings(string Title, string Description, string SearchLabel, string SearchPlaceholder, string TypeFilterLabel, string StatusFilterLabel, string ApplyLabel, bool ShowTypeFilter, bool ShowStatusFilter);
    private sealed record ScreenViewLayoutDocument(IReadOnlyList<ScreenViewFieldLayout> Fields, CustomerPageSettings PageSettings);
    private sealed record ScreenViewPublishRequest(int ExpectedRevision);
    private sealed record ScreenViewCatalog(string Key, string Label, IReadOnlyList<ScreenViewField> Fields);
    private sealed record ScreenViewField(string Key, string Label, bool DefaultVisible, bool Fixed = false, string? Section = null);
    internal sealed record ScreenViewFieldLayout(string Key, string Label, bool Visible, int Position, bool Fixed = false, string? Section = null, int? Width = null);
    private sealed record ScreenViewRecord(Guid? Id, string ScreenKey, string ScreenLabel, string Name, bool IsPublished, int Revision, IReadOnlyList<ScreenViewFieldLayout> Fields, CustomerPageSettings? PageSettings);
    private sealed record ScreenViewEditorState(ScreenViewCatalog Catalog, ScreenViewRecord Active, ScreenViewRecord? Draft);
    private sealed record ScreenViewRevisionView(Guid Id, int Revision, string Name, IReadOnlyList<ScreenViewFieldLayout> Fields, string ChangeKind, Guid ChangedByUserId, DateTimeOffset CreatedAt);
}
