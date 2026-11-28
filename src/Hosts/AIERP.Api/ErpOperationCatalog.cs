using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Claims;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;

namespace AIERP.Api;

/// <summary>A field of a <c>list</c> parameter's items: a scalar type, or <c>map</c> (one level, string values).</summary>
internal sealed record ErpOperationParameterItem(string Code, string Label, string DataType, bool Required);
internal sealed record ErpOperationParameter(string Name, string In, string Type, bool Required)
{
    /// <summary>The item fields of a <c>list</c> parameter; null for every other type (wire: <c>items</c>).</summary>
    public IReadOnlyList<ErpOperationParameterItem>? Items { get; init; }
    /// <summary>
    /// The request member accepts null (wire: <c>nullable</c>). Only body parameters built from a request record set it; the
    /// runtime sends an empty optional text value of such a parameter as null instead of <c>""</c>, so the server's
    /// "absent" checks (optional e-mail, all-empty profile) see it as not given and an update clears the stored value.
    /// Written only when true (older clients and fixtures without it read it as false).
    /// </summary>
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)]
    public bool Nullable { get; init; }
}
internal sealed record ErpOperationColumn(string Code, string Label, string DataType);
internal sealed record ErpOperationResult(string Shape, string? RowsPath, IReadOnlyList<ErpOperationColumn> Columns)
{
    /// <summary>Row properties whose scalar fields the runtime copies to dotted keys (<c>balance.code</c>).</summary>
    public IReadOnlyList<string> Flatten { get; init; } = [];
    /// <summary>Top-level response properties copied into the query's <c>meta</c> (paging totals).</summary>
    public IReadOnlyList<string> MetaPaths { get; init; } = [];
}
/// <summary>An alternative route used when the <c>When</c> route parameter has a value.</summary>
internal sealed record ErpOperationRouteVariant(string Route, string When);
/// <summary>
/// The request body carries a map property built from a source read's rows (<c>KeyColumn</c> → <c>ValueColumn</c>)
/// plus page-bound values for parameters the operation does not declare.
/// </summary>
internal sealed record ErpOperationBodyMap(string Property, string SourceOperation, string KeyColumn, string ValueColumn);
internal sealed record ErpOperation(string Name, string Label, string Module, string Kind, string PageKind, string Method, string Route,
    IReadOnlyList<ErpOperationParameter> Parameters, ErpOperationResult Result, string? SourceOperation,
    IReadOnlyDictionary<string, object?>? FixedBody, string Since, bool Deprecated = false, bool RequiresTenantAdmin = false)
{
    /// <summary>
    /// The endpoint handler itself rejects anyone but a TenantAdmin, beyond the permission catalog. Server-side only:
    /// it is folded into <c>allowed</c> and is not part of the wire contract.
    /// </summary>
    public bool RequiresTenantAdmin { get; init; } = RequiresTenantAdmin;
    /// <summary>Alternative routes; the runtime uses the first whose <c>When</c> parameter is set, else <see cref="Route"/>.</summary>
    public IReadOnlyList<ErpOperationRouteVariant> RouteVariants { get; init; } = [];
    public ErpOperationBodyMap? BodyMap { get; init; }
    /// <summary>
    /// Query string values the runtime always appends (e.g. <c>isActive=false</c> of a status route); a page cannot bind
    /// them, and the keys never collide with a parameter (wire: <c>fixedQuery</c>).
    /// </summary>
    public IReadOnlyDictionary<string, object?>? FixedQuery { get; init; }
}

/// <summary>Resolves an operation by name; <see cref="ErpOperationCatalog.TryGet"/> in production.</summary>
internal delegate bool ErpOperationLookup(string name, out ErpOperation operation);

/// <summary>Wire form of a catalog entry: the operation plus whether the caller may run it.</summary>
internal sealed record ErpOperationView(string Name, string Label, string Module, string Kind, string PageKind, string Method, string Route,
    IReadOnlyList<ErpOperationParameter> Parameters, ErpOperationResult Result, string? SourceOperation,
    IReadOnlyDictionary<string, object?>? FixedBody, string Since, bool Deprecated, bool Allowed,
    IReadOnlyList<ErpOperationRouteVariant> RouteVariants, ErpOperationBodyMap? BodyMap,
    // Left out of the wire when null, so the recorded operation fixtures of the pages that do not use it stay unchanged.
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyDictionary<string, object?>? FixedQuery);

/// <summary>
/// Named ERP operations that custom pages may bind to instead of SQL. Each entry describes an existing API endpoint; the
/// page runtime calls that endpoint with the user's own token, so no new privilege is created. Names are stable forever:
/// entries are only added or marked deprecated, never removed or renamed (<c>ErpOperationCatalog.names.txt</c> in the
/// integration tests enforces this). If an operation's contract has to change, add a new name.
/// </summary>
internal static partial class ErpOperationCatalog
{
    private const string Since = "2026-11-18";
    private const string StockModule = "Stok";
    private const string WarehouseModule = "Depo";
    private const string ReportModule = "Raporlar";
    private const string ManufacturingModule = "Üretim";
    private const string SettingsModule = "Ayarlar";
    private const string PurchasingModule = "Satınalma";
    private const string CustomerModule = "Cari";
    private const string FinanceModule = "Finans";
    private const string StockItemRoute = "/api/stock/items/{id}";
    private const string StockItemRead = "stok.kart.getir";

    // Shared labels. A module's own codes live in its label block (CrmLabels, PurchasingLabel, SalesLabelMap, FinanceLabels, ManufacturingLabelMap)
    // and apply to that module's operations only (see InModule), so two modules may label the same code differently.
    private static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["salesRequestLineNumber"] = "Talep satır no",
        // İrsaliye / mal kabul satır fiyatı ve bedelsiz satır
        ["isFreeOfCharge"] = "Bedelsiz", ["lineNetAmount"] = "Tutar", ["lineVatAmount"] = "Satır KDV tutarı",
        ["orderUnitPrice"] = "Sipariş birim fiyatı", ["receiptUnitPrice"] = "Mal kabul birim fiyatı", ["requiresAmount"] = "Tutar girilmeli",
        ["costPending"] = "Maliyet bekliyor", ["pricedNetTotal"] = "Tutar (KDV hariç)", ["pricedVatTotal"] = "KDV toplamı",
        ["pricedGrandTotal"] = "Tutar (KDV dahil)", ["freeLineCount"] = "Bedelsiz satır", ["unpricedLineCount"] = "Fiyatsız satır",
        ["pricingState"] = "Fiyat durumu",
        ["id"] = "Kimlik", ["code"] = "Kod", ["name"] = "Ad", ["barcode"] = "Barkod", ["unitCode"] = "Birim",
        ["category"] = "Kategori", ["minimumStock"] = "Minimum stok", ["isActive"] = "Etkin", ["createdAt"] = "Oluşturulma",
        ["rowVersion"] = "Satır sürümü", ["trackingMode"] = "İzleme türü", ["procurementLeadTimeDays"] = "Tedarik süresi (gün)",
        ["manufacturingLeadTimeDays"] = "Üretim süresi (gün)", ["purchaseListPrice"] = "Alış liste fiyatı",
        ["salesListPrice"] = "Satış liste fiyatı", ["priceCurrencyCode"] = "Fiyat para birimi", ["purchaseVatPercent"] = "Alış KDV %",
        ["salesVatPercent"] = "Satış KDV %", ["exciseTaxPercent"] = "ÖTV %", ["communicationTaxPercent"] = "ÖİV %",
        ["purchaseDiscountPercent"] = "Alış iskonto %", ["salesDiscountPercent"] = "Satış iskonto %", ["maximumStock"] = "Maksimum stok",
        ["reorderPoint"] = "Yeniden sipariş noktası", ["safetyStock"] = "Emniyet stoku", ["netWeight"] = "Net ağırlık",
        ["grossWeight"] = "Brüt ağırlık", ["length"] = "Uzunluk", ["width"] = "Genişlik", ["height"] = "Yükseklik",
        ["productImageUrl"] = "Ürün görseli", ["purchaseAccountCode"] = "Alış hesap kodu", ["salesAccountCode"] = "Satış hesap kodu",
        ["costAccountCode"] = "Maliyet hesap kodu", ["marketplaceProductId"] = "Pazaryeri ürün kimliği",
        ["parentStockItemId"] = "Ana stok kartı", ["isVariantParent"] = "Varyant ana kartı", ["withholdingTaxPercent"] = "Tevkifat %",
        ["stampTaxPercent"] = "Damga vergisi %",
        ["entryDate"] = "Hareket tarihi", ["direction"] = "Yön", ["quantity"] = "Miktar", ["description"] = "Açıklama",
        ["reversalOfId"] = "Ters kaydı yapılan hareket", ["isReversal"] = "Ters kayıt", ["hasReversal"] = "Ters kaydı var",
        ["unitCostBase"] = "Birim maliyet", ["enteredQuantity"] = "Girilen miktar", ["enteredUnitCode"] = "Girilen birim",
        ["storageLocationId"] = "Konum kimliği", ["storageLocationCode"] = "Konum kodu", ["storageLocationName"] = "Konum adı",
        ["warehouseId"] = "Depo kimliği", ["warehouseCode"] = "Depo kodu", ["warehouseName"] = "Depo adı",
        ["definitionId"] = "Tanım kimliği", ["label"] = "Etiket", ["dataType"] = "Veri türü", ["maxLength"] = "En fazla uzunluk",
        ["definitionVersion"] = "Tanım sürümü", ["isRequired"] = "Zorunlu", ["value"] = "Değer", ["version"] = "Sürüm",
        ["q"] = "Arama", ["page"] = "Sayfa", ["pageSize"] = "Sayfa boyutu",
        ["stockItemId"] = "Stok kartı kimliği", ["quantityOnHand"] = "Eldeki miktar", ["belowMinimum"] = "Minimum altında",
        ["reservedQuantity"] = "Rezerve miktar", ["availableQuantity"] = "Kullanılabilir miktar", ["valuationAmountBase"] = "Stok değeri",
        ["unvaluedQuantity"] = "Maliyetsiz miktar", ["baseCurrencyCode"] = "Ana para birimi", ["factorToBase"] = "Ana birim katsayısı",
        ["parentLocationId"] = "Üst konum",
        ["customFields"] = "Özel alanlar", ["variants"] = "Varyantlar", ["attributes"] = "Özellikler",
        ["tracking"] = "Lot / seri dağılımı", ["trackingCode"] = "Lot / seri kodu", ["expiryDate"] = "Son kullanma tarihi",
        ["values"] = "Özel alan değerleri",
        ["productStockItemId"] = "Mamul stok kartı", ["productName"] = "Mamul", ["productTrackingMode"] = "Mamul izleme türü",
        ["outputQuantity"] = "Çıktı miktarı", ["orderCount"] = "Üretim emri sayısı", ["tenantId"] = "Firma kimliği",
        ["allowNegativeStock"] = "Negatif stoka izin ver", ["updatedByUserId"] = "Güncelleyen", ["updatedAt"] = "Güncellenme",
        ["status"] = "Durum",
        ["displayQuantity"] = "Miktar", ["displayUnitCode"] = "Birim", ["trackingText"] = "Lot / seri",
        ["stockItemCode"] = "Stok kodu", ["stockItemName"] = "Stok adı", ["warehouseQuantity"] = "Depo bakiyesi",
        ["locatedQuantity"] = "Konumlandırılmış", ["unlocatedQuantity"] = "Konumu boş", ["asOfDate"] = "Tarih itibarıyla",
        ["kind"] = "Kayıt türü", ["purchaseReceiptId"] = "Mal kabul kimliği", ["totalAmountBase"] = "Toplam tutar",
        ["amountBase"] = "Tutar", ["reason"] = "Gerekçe", ["allocationMethod"] = "Dağıtım yöntemi",
        ["purchaseOrderId"] = "Satınalma siparişi kimliği", ["purchaseOrderCode"] = "Satınalma siparişi", ["receiptDate"] = "Kabul tarihi",
        ["lineCount"] = "Satır sayısı",
        ["lastMovementDate"] = "Son hareket tarihi",
        ["transferDate"] = "Transfer tarihi", ["fromWarehouseId"] = "Kaynak depo kimliği", ["fromWarehouseName"] = "Kaynak depo",
        ["toWarehouseId"] = "Hedef depo kimliği", ["toWarehouseName"] = "Hedef depo", ["fromStorageLocationId"] = "Kaynak konum kimliği",
        ["fromStorageLocationCode"] = "Kaynak konum kodu", ["fromStorageLocationName"] = "Kaynak konum adı",
        ["toStorageLocationId"] = "Hedef konum kimliği", ["toStorageLocationCode"] = "Hedef konum kodu",
        ["toStorageLocationName"] = "Hedef konum adı",
        // Cari Hesaplar, cari kart ve Cari Hesap Hareketleri.
        ["type"] = "Cari türü", ["taxNumber"] = "Vergi no", ["groupId"] = "Cari grubu kimliği", ["groupName"] = "Cari grubu",
        ["currencyCode"] = "Döviz", ["riskLimit"] = "Risk limiti", ["paymentTermDays"] = "Vade (gün)",
        ["identityNumber"] = "T.C. kimlik no", ["taxOffice"] = "Vergi dairesi", ["parentCompanyId"] = "Ana firma kimliği",
        ["parentCompanyName"] = "Ana firma", ["subsidiaryCount"] = "Bağlı firma sayısı", ["isEInvoiceRegistered"] = "E-Fatura mükellefi",
        ["eInvoiceRecipientAlias"] = "E-Fatura alıcı etiketi", ["phone"] = "Telefon", ["email"] = "Kurumsal e-posta",
        ["website"] = "Web sitesi", ["contactName"] = "Yetkili kişi", ["contactPhone"] = "Yetkili telefonu",
        ["contactEmail"] = "Yetkili e-postası", ["priceListCode"] = "Fiyat listesi kodu", ["receivableAccountCode"] = "Alıcı muhasebe hesabı",
        ["payableAccountCode"] = "Satıcı muhasebe hesabı", ["bankName"] = "Banka adı", ["bankBranchCode"] = "Şube kodu", ["iban"] = "IBAN",
        ["addressLine"] = "Adres", ["city"] = "İl", ["district"] = "İlçe", ["postalCode"] = "Posta kodu", ["countryCode"] = "Ülke",
        ["isDefault"] = "Varsayılan", ["latitude"] = "Enlem", ["longitude"] = "Boylam", ["provinceId"] = "İl kimliği", ["provinceName"] = "İl adı",
        ["defaultAddressId"] = "Varsayılan adres kimliği", ["defaultAddressLabel"] = "Varsayılan adres etiketi",
        ["defaultAddressLine"] = "Varsayılan adres", ["defaultAddressCity"] = "Varsayılan adres ili",
        ["defaultAddressDistrict"] = "Varsayılan adres ilçesi", ["defaultAddressPostalCode"] = "Varsayılan adres posta kodu",
        ["defaultAddressCountryCode"] = "Varsayılan adres ülkesi", ["defaultAddressLatitude"] = "Varsayılan adres enlemi",
        ["defaultAddressLongitude"] = "Varsayılan adres boylamı",
        ["balance"] = "Bakiye", ["balanceSide"] = "Bakiye yönü", ["balanceAmount"] = "Bakiye tutarı", ["balanceSideCode"] = "Bakiye (B/A)",
        ["limitUsagePercent"] = "Limit kullanımı %", ["amount"] = "Tutar", ["debitAmount"] = "Borç", ["creditAmount"] = "Alacak",
        ["foreignCurrencyCode"] = "Satır dövizi",
        ["totalCount"] = "Cari kartı", ["activeCount"] = "Aktif", ["inactiveCount"] = "Pasif", ["customerCount"] = "Müşteri",
        ["supplierCount"] = "Tedarikçi", ["bothCount"] = "Müşteri ve tedarikçi", ["dealerCount"] = "Bayi", ["employeeCount"] = "Personel",
        ["eInvoiceRegisteredCount"] = "E-Fatura mükellefi", ["riskLimitDefinedCount"] = "Risk limiti tanımlı"
    };

    /// <summary>CRM Fırsatları ve fırsat kartı.</summary>
    private static readonly IReadOnlyDictionary<string, string> CrmLabels = ModuleLabels("CRM", new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["customerId"] = "Müşteri kimliği", ["customerName"] = "Müşteri", ["stage"] = "Aşama", ["estimatedValue"] = "Tahmini değer",
        ["probabilityPercent"] = "Kazanma olasılığı %", ["expectedCloseDate"] = "Beklenen kapanış", ["nextActivityAt"] = "Sonraki takip",
        ["notes"] = "Not", ["prospectingCount"] = "İlk temas", ["qualifiedCount"] = "Nitelikli", ["proposalCount"] = "Teklif",
        ["negotiationCount"] = "Müzakere", ["wonCount"] = "Kazanıldı", ["lostCount"] = "Kaybedildi", ["openCount"] = "Açık fırsat",
        ["overdueCount"] = "Takibi geçmiş", ["openValueAmount"] = "Açık fırsat değeri", ["openValueCurrencyCode"] = "Açık değer dövizi",
        ["otherCurrencyCount"] = "Diğer döviz sayısı"
    });

    /// <summary>Finans: Kasalar / Bankalar, Mizan, Hesap Planı ve Yevmiye.</summary>
    private static readonly IReadOnlyDictionary<string, string> FinanceLabels = ModuleLabels("Finans", new Dictionary<string, string>(StringComparer.Ordinal)
    {
        // Codes shared with other modules ("type", "totalCount",
        // "entryDate", …) keep their label here; BuildFinance relabels its own columns where the text differs.
        ["transactionCount"] = "Hareket", ["transactionDate"] = "Tarih", ["reference"] = "Referans", ["sourceType"] = "Kaynak",
        ["sourceCode"] = "Kaynak belge", ["transferId"] = "Transfer kimliği", ["cashFlowCategory"] = "Nakit akışı",
        ["transactionPage"] = "Ekstre sayfası", ["transactionPageSize"] = "Ekstre sayfa boyutu", ["transactionTotalCount"] = "Hareket sayısı",
        ["inflow"] = "Giriş", ["outflow"] = "Çıkış", ["sourceKind"] = "Kaynak türü", ["isReversed"] = "Ters çevrildi",
        ["canVoid"] = "İptal edilebilir", ["canVoidTransfer"] = "Transfer iptal edilebilir", ["canChangeCashFlow"] = "Nakit akışı değiştirilebilir",
        ["reversalUpdated"] = "Ters kaydı da güncellendi", ["accountCount"] = "Hesap", ["negativeBalanceCount"] = "Eksi bakiyeli hesap",
        ["currencyCount"] = "Döviz sayısı", ["totalBalance"] = "Toplam bakiye", ["fromAccountId"] = "Kaynak hesap kimliği",
        ["fromAccountName"] = "Kaynak hesap", ["toAccountId"] = "Hedef hesap kimliği", ["toAccountName"] = "Hedef hesap",
        ["toCurrencyCode"] = "Hedef döviz", ["destinationAmount"] = "Hedef tutar", ["exchangeRate"] = "Kur",
        ["accountId"] = "Hesap kimliği", ["statementSection"] = "Finansal tablo sınıfı", ["openingDebit"] = "Açılış borç",
        ["openingCredit"] = "Açılış alacak", ["debit"] = "Borç", ["credit"] = "Alacak", ["balanceDebit"] = "Bakiye borç",
        ["balanceCredit"] = "Bakiye alacak", ["accountClass"] = "Sınıf", ["journalEntryId"] = "Fiş kimliği", ["journalEntryCode"] = "Fiş no",
        ["journalDescription"] = "Fiş açıklaması", ["lineNumber"] = "Satır", ["lineDescription"] = "Satır açıklaması",
        ["hasMovements"] = "Hareketli", ["accountType"] = "Hesap tipi", ["normalBalance"] = "Çalışma şekli",
        ["ifrsAccountCode"] = "IFRS hesap kodu", ["ifrsAccountName"] = "IFRS hesap adı", ["ifrsStatementSection"] = "IFRS tablo sınıfı",
        ["template"] = "Şablon", ["sourceUrl"] = "Kaynak bağlantısı", ["totalAccounts"] = "Şablondaki hesap", ["existingAccounts"] = "Mevcut hesap",
        ["accountsToAdd"] = "Eklenecek hesap", ["addedCount"] = "Eklenen hesap", ["preservedExistingCount"] = "Korunan hesap",
        ["sourceId"] = "Kaynak kimliği", ["accountingBasis"] = "Muhasebe standardı", ["totalDebit"] = "Toplam borç",
        ["totalCredit"] = "Toplam alacak", ["isSourced"] = "Kaynaklı", ["canReverse"] = "Ters çevrilebilir", ["sourceLabel"] = "Kaynak adı",
        ["reversedByEntryId"] = "Ters kayıt fişi kimliği", ["reversedByEntryCode"] = "Ters kayıt fişi", ["reversalOfEntryCode"] = "Ters çevrilen fiş",
        ["accountCode"] = "Hesap kodu", ["accountName"] = "Hesap adı"
    });

    private static readonly IReadOnlyDictionary<string, string> SalesLabelMap = ModuleLabels("Satış", SalesLabels());
    private static readonly IReadOnlyDictionary<string, string> HrLabels = ModuleLabels("İnsan Kaynakları", HumanResourcesLabels());
    private static readonly IReadOnlyDictionary<string, string> ManufacturingLabelMap = ModuleLabels("Üretim", ManufacturingLabels());

    /// <summary>Dış Ticaret: dış ticaret dosyaları ve dosya kartı.</summary>
    private static readonly IReadOnlyDictionary<string, string> ForeignTradeLabels = ModuleLabels("Dış Ticaret", new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["salesOrderId"] = "Satış siparişi kimliği", ["referenceCode"] = "Dış ticaret referansı", ["originCountryCode"] = "Çıkış ülkesi",
        ["destinationCountryCode"] = "Varış ülkesi", ["incotermsCode"] = "Incoterms", ["harmonizedSystemCode"] = "HS kodu",
        ["transportMode"] = "Taşıma", ["carrierReference"] = "Taşıyıcı / takip", ["customsReference"] = "Gümrük referansı",
        ["declaredValue"] = "Beyan değeri", ["plannedShipDate"] = "Planlanan sevkiyat", ["actualShipDate"] = "Gerçek sevkiyat",
        ["plannedArrivalDate"] = "Planlanan varış", ["actualArrivalDate"] = "Gerçek varış", ["notes"] = "Operasyon notu",
        ["inventoryPostingRequired"] = "Stok belgesi gerekli", ["salesDeliveryId"] = "Teslimat kimliği",
        ["inventoryDocumentLinkedAt"] = "Stok belgesi bağlanma zamanı", ["orderCode"] = "Sipariş", ["counterpartyName"] = "Cari",
        ["route"] = "Rota", ["shipDate"] = "Sevk", ["arrivalDate"] = "Varış", ["importCount"] = "İthalat", ["exportCount"] = "İhracat",
        ["draftCount"] = "Taslak", ["bookedCount"] = "Planlandı", ["shippedCount"] = "Sevkte", ["customsClearanceCount"] = "Gümrükte",
        ["arrivedCount"] = "Ulaştı", ["closedCount"] = "Kapandı", ["cancelledCount"] = "İptal", ["actualDate"] = "Gerçek tarih",
        ["documentId"] = "Stok belgesi kimliği", ["documentDate"] = "Belge tarihi", ["isLinked"] = "Bağlı", ["orderDate"] = "Sipariş tarihi",
        ["grandTotal"] = "Genel toplam"
    });

    /// <summary>A module label block: its codes must be new (the shared dictionary wins on a shared code) and appear once.</summary>
    private static IReadOnlyDictionary<string, string> ModuleLabels(string module, IEnumerable<KeyValuePair<string, string>> block)
    {
        var labels = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (code, label) in block)
            if (Labels.ContainsKey(code) || !labels.TryAdd(code, label))
                throw new InvalidOperationException($"ERP işlem kataloğunda {module} etiketi '{code}' birden fazla kez tanımlı.");
        return labels;
    }

    // Declared before Operations: static fields initialize in textual order and Build() uses it.
    private static readonly ErpOperationResult None = new("none", null, []);
    private static readonly IReadOnlyList<ErpOperation> Operations = Build();
    private static readonly IReadOnlyDictionary<string, ErpOperation> ByName = Operations.ToDictionary(x => x.Name, StringComparer.Ordinal);

    internal static IReadOnlyList<ErpOperation> All => Operations;

    internal static bool TryGet(string name, out ErpOperation operation)
    {
        if (name is not null && ByName.TryGetValue(name, out var found)) { operation = found; return true; }
        operation = null!;
        return false;
    }

    /// <summary>Route pattern without constraints and trailing slash: <c>/api/stock/items/{id:guid}/</c> → <c>/api/stock/items/{id}</c>.</summary>
    internal static string NormalizeRoutePattern(string? rawText) =>
        Regex.Replace(rawText ?? "", @"\{([^}:=?]+)[^}]*\}", "{$1}").TrimEnd('/');

    private static IReadOnlyList<ErpOperation> Build()
    {
        var stockItemColumns = Columns<StockItemView>();
        var id = Route("id");
        var paging = new[] { Query("page", "int"), Query("pageSize", "int") };
        var stateChangeBody = new Dictionary<string, object?>(StringComparer.Ordinal) { ["confirmation"] = true };
        var operations = new List<ErpOperation>
        {
            Read(StockModule, "stok.kart.listele", "Stok kartlarını listele", "/api/stock/items", [Query("q", "text"), .. paging],
                List(stockItemColumns, "items")),
            Read(StockModule, StockItemRead, "Stok kartı getir", StockItemRoute, [id], new ErpOperationResult("record", null, stockItemColumns)),
            Write(StockModule, "stok.kart.olustur", "Stok kartı oluştur", "insert", "POST", "/api/stock/items",
                [.. BodyParameters<StockItemWriteRequest>(sourceBacked: false), MapParameter("customFields"),
                    ListParameter<StockItemVariantWriteRequest>("variants")], Record(stockItemColumns), null, null),
            // Update and state changes return the updated StockItemView; unbound body fields come from the source read.
            Write(StockModule, "stok.kart.guncelle", "Stok kartı güncelle", "update", "PUT", StockItemRoute,
                [id, .. BodyParameters<StockItemUpdateRequest>(sourceBacked: true)], Record(stockItemColumns), StockItemRead, null),
            // The DELETE handler itself only accepts TenantAdmin, whatever the permission rules say.
            Write(StockModule, "stok.kart.sil", "Stok kartı sil", "delete", "DELETE", StockItemRoute, [id], None, null, null, requiresTenantAdmin: true),
            // confirmation is fixed: a page cannot bind it to false, and it is not offered as a parameter.
            Write(StockModule, "stok.kart.pasifeAl", "Stok kartını pasife al", "update", "POST", StockItemRoute + "/deactivate",
                [id, .. BodyParameters<StockItemStateChangeRequest>(sourceBacked: true, exclude: "confirmation")],
                Record(stockItemColumns), StockItemRead, stateChangeBody),
            Write(StockModule, "stok.kart.aktifEt", "Stok kartını etkinleştir", "update", "POST", StockItemRoute + "/activate",
                [id, .. BodyParameters<StockItemStateChangeRequest>(sourceBacked: true, exclude: "confirmation")],
                Record(stockItemColumns), StockItemRead, stateChangeBody),
            Read(StockModule, "stok.kart.hareketleri", "Stok kartı hareketleri", "/api/stock/items/{stockItemId}/transactions",
                [Route("stockItemId"), .. paging], List(Columns<InventoryTransactionView>(), "items")),
            Read(StockModule, "stok.kart.varyantlari", "Stok kartı varyantları", StockItemRoute + "/variants", [id],
                List(Columns<StockItemVariantView>(), null)),
            Read(StockModule, "stok.kart.ozelAlanDegerleri", "Stok kartı özel alan değerleri", StockItemRoute + "/custom-fields", [id],
                List(Columns<StockCustomFieldValueView>(), null)),
            Read(StockModule, "stok.ozelAlanTanimlari", "Stok özel alan tanımları", "/api/stock/items/custom-fields", [],
                List(Columns<StockCustomFieldDefinitionView>(), null)),
            Read(StockModule, "stok.kategoriler", "Stok kategorileri", "/api/stock/categories", [], List(Columns<StockItemCategoryView>(), null)),
        };
        operations.AddRange(BuildStockPilot(id, paging));
        operations.AddRange(BuildStockPilotV1());
        operations.Add(BuildStockMovementHistory(paging));
        operations.AddRange(BuildWarehouseStandard());
        operations.AddRange(BuildStockCost(paging));
        operations.AddRange(BuildStockScreens(paging));
        operations.AddRange(BuildWarehouseTransfers(paging));
        operations.AddRange(BuildCustomers(paging));
        operations.AddRange(InModule(code => CrmLabels.GetValueOrDefault(code), () => BuildCrm(paging)));
        operations.AddRange(InModule(PurchasingLabel, () => BuildPurchasing(paging)));
        operations.AddRange(InModule(code => SalesLabelMap.GetValueOrDefault(code), () => BuildSales(paging)));
        operations.AddRange(InModule(code => FinanceLabels.GetValueOrDefault(code), () => BuildFinance(paging)));
        operations.AddRange(InModule(FixedAssetLabel, () => BuildFixedAssets(paging)));
        operations.AddRange(InModule(code => HrLabels.GetValueOrDefault(code), () => BuildHumanResources(paging)));
        operations.AddRange(InModule(code => ManufacturingLabelMap.GetValueOrDefault(code), () => BuildManufacturing(paging)));
        operations.AddRange(InModule(code => ForeignTradeLabels.GetValueOrDefault(code), () => BuildForeignTrade(paging)));

        var reportSources = ReportEndpoints.CatalogSources(includeAdminSources: true).ToDictionary(x => x.Code, StringComparer.Ordinal);
        foreach (var source in ReportEndpoints.ReportSourcePermissions.Keys.OrderBy(x => x, StringComparer.Ordinal))
        {
            if (!reportSources.TryGetValue(source, out var report))
                throw new InvalidOperationException($"Rapor kaynağı katalogda yok: {source}");
            operations.Add(new ErpOperation($"rapor.{source}", "Rapor: " + report.Label, ReportModule, "read", "read", "POST", "/api/reports/run",
                [], new ErpOperationResult("list", "rows", ReportColumns(report).Select(x => new ErpOperationColumn(x.Code, x.Label, x.DataType)).ToArray()),
                null, ReportBody(source, report), Since));
        }
        foreach (var operation in operations)
            if (ParameterShapeError(operation) is { } shapeError)
                throw new InvalidOperationException($"ERP işlemi '{operation.Name}' geçersiz: {shapeError}");
        return operations;
    }

    /// <summary>Proje 2 Faz A stock pilot: balances, warehouses, units, custom field save and warehouse movements.</summary>
    private static IEnumerable<ErpOperation> BuildStockPilot(ErpOperationParameter id, IReadOnlyList<ErpOperationParameter> paging)
    {
        var warehouseId = Route("warehouseId");
        var stockItemId = Route("stockItemId");
        var transactionColumns = Columns<InventoryTransactionView>();
        var unitColumns = Columns<StockItemUnitConversionView>();
        const string transactionsRoute = "/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions";
        string[] hiddenStockColumns = ["stockItem.code", "stockItem.name", "stockItem.unitCode", "stockItem.minimumStock"];
        var balanceColumns = Columns<InventoryBalanceView>("balance")
            .Concat(Columns<StockItemView>("stockItem").Where(x => !hiddenStockColumns.Contains(x.Code, StringComparer.Ordinal)))
            .Append(new ErpOperationColumn("status", Label("status"), "text")).ToArray();
        var balanceResult = List(balanceColumns, "items") with
        {
            Flatten = ["balance", "stockItem"],
            // The page summary members are computed over the returned page items only.
            MetaPaths = ["page", "pageSize", "totalCount", "belowMinimumCount", "pageValuationAmountBase", "pageAvailableQuantity",
                "pageUnitCode", "pageAvailableCount", "pageUnvaluedCount", "baseCurrencyCode"]
        };
        ErpOperationRouteVariant[] balanceRoutes = [new("/api/warehouses/{warehouseId}/balances/page", "warehouseId")];

        // warehouseId is optional: when it is set the per-warehouse route is used, otherwise all active warehouses.
        yield return Read(StockModule, "stok.bakiye.sayfa", "Stok bakiyeleri (sayfalı)", "/api/warehouses/balances/page",
            [new ErpOperationParameter("warehouseId", "route", "guid", false), Query("q", "text"), Query("belowMinimumOnly", "bool"),
                Query("includeInactive", "bool"), .. paging],
            balanceResult) with { RouteVariants = balanceRoutes };
        // One stock card's balance (e.g. a step-by-step page's selected stock): the same routes filtered by the required
        // stockItemId, so the page never reads every card's balance through it.
        yield return Read(StockModule, "stok.bakiye.kart", "Stok kartının bakiyesi", "/api/warehouses/balances/page",
            [new ErpOperationParameter("stockItemId", "query", "guid", true), new ErpOperationParameter("warehouseId", "route", "guid", false)],
            balanceResult) with { RouteVariants = balanceRoutes };
        yield return Read(WarehouseModule, "depo.listele", "Depoları listele", "/api/warehouses", [], List(Columns<WarehouseView>(), null));
        yield return Read(WarehouseModule, "depo.konumlari", "Depo konumları", "/api/warehouses/{warehouseId}/locations", [warehouseId],
            List(Columns<WarehouseLocationView>(), null));
        yield return Read(StockModule, "stok.kart.birimleri", "Stok kartı birimleri", StockItemRoute + "/units", [id],
            List(unitColumns, "conversions") with { MetaPaths = ["baseUnitCode"] });
        // The unit handlers themselves only accept TenantAdmin, whatever the permission rules say.
        yield return Write(StockModule, "stok.kart.birimEkle", "Stok kartına birim ekle", "insert", "POST", StockItemRoute + "/units",
            [id, .. BodyParameters<StockItemUnitConversionWriteRequest>(sourceBacked: false)], Record(unitColumns), null, null, requiresTenantAdmin: true);
        yield return Write(StockModule, "stok.kart.birimSil", "Stok kartından birim sil", "delete", "DELETE", StockItemRoute + "/units/{conversionId}",
            [id, Route("conversionId")], None, null, null, requiresTenantAdmin: true);
        // values is a code → value map: codes the page does not bind keep the values read by stok.kart.ozelAlanDegerleri.
        // The declared values map (Faz B) is merged over those source values; it never replaces them wholesale.
        yield return Write(StockModule, "stok.kart.ozelAlanKaydet", "Stok kartı özel alanlarını kaydet", "update", "PUT", StockItemRoute + "/custom-fields",
            [id, MapParameter("values")], List(Columns<StockCustomFieldValueView>(), null), null, null)
            with { BodyMap = new ErpOperationBodyMap("values", "stok.kart.ozelAlanDegerleri", "code", "value") };
        yield return Read(StockModule, "stok.hareket.listele", "Depo stok hareketleri", transactionsRoute, [warehouseId, stockItemId, .. paging],
            List(transactionColumns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
        // Lot/serial tracking allocations are a list parameter (Faz B), bound to an editable grid's rows.
        yield return Write(StockModule, "stok.hareket.ekle", "Stok hareketi ekle", "insert", "POST", transactionsRoute,
            [warehouseId, stockItemId, .. BodyParameters<InventoryTransactionWriteRequest>(sourceBacked: false),
                ListParameter<InventoryTrackingAllocationRequest>("tracking")], Record(transactionColumns), null, null);
        // A reversal writes a new linked entry; the original movement is never changed.
        yield return Write(StockModule, "stok.hareket.tersKayit", "Stok hareketini ters kayıtla düzelt", "insert", "POST", transactionsRoute + "/{entryId}/reverse",
            [warehouseId, stockItemId, Route("entryId"), .. BodyParameters<InventoryReverseRequest>(sourceBacked: false)], Record(transactionColumns), null, null);
        yield return Read(StockModule, "stok.kart.depoBakiyeleri", "Stok kartı depo bakiyeleri", StockItemRoute + "/balances", [id],
            List(Columns<StockItemWarehouseBalanceView>(), null));
    }

    /// <summary>Proje 4 stock card standard v1: the recipes that produce a card and the tenant negative stock rule.</summary>
    private static IEnumerable<ErpOperation> BuildStockPilotV1()
    {
        // The product filter is required, so a page never reads every recipe of the tenant.
        yield return Read(ManufacturingModule, "uretim.recete.listele", "Stok kartını üreten reçeteler", "/api/manufacturing/boms",
            [new ErpOperationParameter("productStockItemId", "query", "guid", true)], List(Columns<BomView>(), null));
        yield return Read(SettingsModule, "ayar.negatifStok", "Negatif stok kuralı", "/api/tenant-settings/operations", [],
            Record(Columns<TenantOperationalSettingsView>()));
    }

    /// <summary>
    /// Stok Hareketleri standard: one stock card's movements in every warehouse, or in one warehouse when warehouseId is set
    /// (the per-warehouse route, as the legacy screen does). The caller needs both routes' read permissions. The display
    /// columns (entered quantity with its unit, else the base quantity and unit; lot / serial allocations as one line) are
    /// computed members of the view outside its constructor, so the older transaction operations keep their columns.
    /// </summary>
    private static ErpOperation BuildStockMovementHistory(IReadOnlyList<ErpOperationParameter> paging)
    {
        var columns = Columns<InventoryTransactionView>()
            .Append(new ErpOperationColumn("displayQuantity", Label("displayQuantity"), "decimal"))
            .Append(new ErpOperationColumn("displayUnitCode", Label("displayUnitCode"), "text"))
            .Append(new ErpOperationColumn("trackingText", Label("trackingText"), "text")).ToArray();
        return Read(StockModule, "stok.hareket.gecmisi", "Stok hareket geçmişi", "/api/stock/items/{stockItemId}/transactions",
                [Route("stockItemId"), new ErpOperationParameter("warehouseId", "route", "guid", false), .. paging],
                List(columns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] })
            with { RouteVariants = [new ErpOperationRouteVariant("/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions", "warehouseId")] };
    }

    /// <summary>
    /// Depo Yönetimi (standard v2) and Raf ve Konumlar (standard v1). There is no single warehouse or location read, so
    /// the updates have no source operation: every body field, rowVersion included, is bound from the selected list row.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildWarehouseStandard()
    {
        const string warehouseRoute = "/api/warehouses/{warehouseId}";
        const string locationRoute = warehouseRoute + "/locations/{locationId}";
        var warehouseId = Route("warehouseId");
        var locationId = Route("locationId");
        var warehouseColumns = Columns<WarehouseView>();
        var locationColumns = Columns<WarehouseLocationView>();
        var valueColumns = Columns<WarehouseCustomFieldValueView>();
        // Status changes are POST …/status (resolved as erp.warehouses.create); isActive and confirmation are fixed so a page
        // can neither flip the direction nor skip the confirmation the endpoint requires.
        Dictionary<string, object?> Status(bool isActive) => new(StringComparer.Ordinal) { ["isActive"] = isActive, ["confirmation"] = true };

        yield return Write(WarehouseModule, "depo.olustur", "Depo oluştur", "insert", "POST", "/api/warehouses",
            [.. BodyParameters<WarehouseWriteRequest>(sourceBacked: false), MapParameter("customFields")], Record(warehouseColumns), null, null);
        yield return Write(WarehouseModule, "depo.guncelle", "Depo güncelle", "update", "PUT", warehouseRoute,
            [warehouseId, .. BodyParameters<WarehouseUpdateRequest>(sourceBacked: false)], Record(warehouseColumns), null, null);
        yield return Write(WarehouseModule, "depo.pasifeAl", "Depoyu pasife al", "update", "POST", warehouseRoute + "/status",
            [warehouseId], Record(warehouseColumns), null, Status(false));
        yield return Write(WarehouseModule, "depo.aktifEt", "Depoyu etkinleştir", "update", "POST", warehouseRoute + "/status",
            [warehouseId], Record(warehouseColumns), null, Status(true));
        yield return Read(WarehouseModule, "depo.ozelAlanTanimlari", "Depo özel alan tanımları", "/api/warehouses/custom-fields", [],
            List(Columns<WarehouseCustomFieldDefinitionView>(), null));
        yield return Read(WarehouseModule, "depo.ozelAlanDegerleri", "Depo özel alan değerleri", warehouseRoute + "/custom-fields", [warehouseId],
            List(valueColumns, null));
        // Same body map as stok.kart.ozelAlanKaydet: codes the page does not bind keep the values read by depo.ozelAlanDegerleri.
        yield return Write(WarehouseModule, "depo.ozelAlanKaydet", "Depo özel alanlarını kaydet", "update", "PUT", warehouseRoute + "/custom-fields",
            [warehouseId, MapParameter("values")], List(valueColumns, null), null, null)
            with { BodyMap = new ErpOperationBodyMap("values", "depo.ozelAlanDegerleri", "code", "value") };
        // The location write handlers themselves only accept TenantAdmin, whatever the permission rules say.
        yield return Write(WarehouseModule, "depo.konum.olustur", "Depo konumu oluştur", "insert", "POST", warehouseRoute + "/locations",
            [warehouseId, .. BodyParameters<WarehouseLocationWriteRequest>(sourceBacked: false)], Record(locationColumns), null, null,
            requiresTenantAdmin: true);
        yield return Write(WarehouseModule, "depo.konum.guncelle", "Depo konumu güncelle", "update", "PUT", locationRoute,
            [warehouseId, locationId, .. BodyParameters<WarehouseLocationUpdateRequest>(sourceBacked: false)], Record(locationColumns), null, null,
            requiresTenantAdmin: true);
        // Sil → Pasife al: the same PUT with isActive fixed to false, the other fields bound from the row.
        yield return Write(WarehouseModule, "depo.konum.pasifeAl", "Depo konumunu pasife al", "update", "PUT", locationRoute,
            [warehouseId, locationId, .. BodyParameters<WarehouseLocationUpdateRequest>(sourceBacked: false, exclude: "isActive")],
            Record(locationColumns), null, new Dictionary<string, object?>(StringComparer.Ordinal) { ["isActive"] = false },
            requiresTenantAdmin: true);
        yield return Read(WarehouseModule, "depo.konum.bakiyeleri", "Depo konumu stok bakiyeleri", locationRoute + "/balances",
            [warehouseId, locationId, Query("asOfDate", "date")], List(Columns<WarehouseLocationBalanceView>(), "items"));
        yield return Read(WarehouseModule, "depo.konumlandirmaDenetimi", "Konumlandırma denetimi", warehouseRoute + "/location-reconciliation",
            [warehouseId, Query("asOfDate", "date")], List(Columns<WarehouseLocationReconciliationItemView>(), "items"));
    }

    /// <summary>
    /// Stok Değerleme (inventory-cost): cost adjustments of a stock item in a warehouse, revaluation, landed costs of a
    /// purchase receipt and their reversals. Every write handler itself only accepts TenantAdmin; a reversal writes a new
    /// linked entry and never changes the original, and the handlers keep their fiscal-close checks.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildStockCost(IReadOnlyList<ErpOperationParameter> paging)
    {
        var adjustmentColumns = Columns<InventoryCostAdjustmentView>();
        var warehouseId = Route("warehouseId");
        var stockItemId = Route("stockItemId");
        var receiptId = Route("id");
        const string stockCostRoute = "/api/warehouses/{warehouseId}/stock/{stockItemId}";
        const string landedCostRoute = "/api/purchasing/receipts/{id}/landed-costs";
        yield return Read(StockModule, "stok.maliyet.kayitlari", "Stok maliyet kayıtları (depo, son 100)", stockCostRoute + "/cost-adjustments",
            [warehouseId, stockItemId], List(adjustmentColumns, null));
        yield return Write(StockModule, "stok.maliyet.yenidenDegerle", "Stok maliyetini yeniden değerle", "insert", "POST", stockCostRoute + "/revaluations",
            [warehouseId, stockItemId, .. BodyParameters<InventoryCostRevaluationRequest>(sourceBacked: false)], Record(adjustmentColumns), null, null,
            requiresTenantAdmin: true);
        yield return Write(StockModule, "stok.maliyet.tersKayit", "Stok değerlemesini ters kayıtla düzelt", "insert", "POST",
            "/api/warehouses/cost-adjustments/{id}/reverse", [Route("id"), .. BodyParameters<InventoryReverseRequest>(sourceBacked: false)],
            Record(adjustmentColumns), null, null, requiresTenantAdmin: true);
        // The list has no status filter; Posted is only checked by the landed cost handler.
        yield return Read(PurchasingModule, "satinalma.malKabul.listele", "Mal kabulleri listele", "/api/purchasing/receipts", paging,
            List(Columns<PurchaseReceiptSummary>(), "items"));
        yield return Read(PurchasingModule, "satinalma.malKabul.ekMaliyetler", "Mal kabul ek maliyetleri", landedCostRoute, [receiptId],
            List(adjustmentColumns, null));
        yield return Write(PurchasingModule, "satinalma.malKabul.ekMaliyetDagit", "Mal kabul ek maliyetini dağıt", "insert", "POST", landedCostRoute,
            [receiptId, .. BodyParameters<LandedCostWriteRequest>(sourceBacked: false)], Record(adjustmentColumns), null, null, requiresTenantAdmin: true);
        yield return Write(PurchasingModule, "satinalma.malKabul.ekMaliyetTersKayit", "Mal kabul ek maliyetini ters kayıtla düzelt", "insert", "POST",
            landedCostRoute + "/{adjustmentId}/reverse", [receiptId, Route("adjustmentId"), .. BodyParameters<InventoryReverseRequest>(sourceBacked: false)],
            Record(adjustmentColumns), null, null, requiresTenantAdmin: true);
    }

    /// <summary>Stok &amp; Depo screen standards: Lot / Seri İzleme (read only).</summary>
    private static IEnumerable<ErpOperation> BuildStockScreens(IReadOnlyList<ErpOperationParameter> paging)
    {
        // Lot/serial balances computed from traced movements; the endpoint accepts trackingMode Lot or Serial only.
        yield return Read(StockModule, "stok.izleme.bakiyeler", "Lot / seri bakiyeleri (sayfalı)", "/api/inventory-tracking/balances",
            [Query("q", "text"), Query("warehouseId", "guid"), Query("trackingMode", "text"), .. paging],
            List(Columns<InventoryTrackingBalanceView>(), "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
    }

    /// <summary>
    /// Depolar arası transferler: list, lines, create and void. The create body carries a page-made requestId: the handler
    /// returns the existing transfer (200) for a retry with the same content and 409 for different content, so a retry after a
    /// failed save never posts twice. A void writes linked reversal movements in both warehouses; confirmation is fixed, and
    /// the route resolves to the execute action. The line view's display members are computed outside its constructor, so
    /// only this operation declares them.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildWarehouseTransfers(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string transfersRoute = "/api/warehouses/transfers";
        var transferId = Route("transferId");
        var summaryColumns = Columns<InventoryTransferSummary>();
        var lineColumns = Columns<InventoryTransferLineView>()
            .Append(new ErpOperationColumn("displayQuantity", Label("displayQuantity"), "decimal"))
            .Append(new ErpOperationColumn("displayUnitCode", Label("displayUnitCode"), "text")).ToArray();
        var voidBody = new Dictionary<string, object?>(StringComparer.Ordinal) { ["confirmation"] = true };
        yield return Read(WarehouseModule, "depo.transfer.listele", "Depo transferlerini listele", transfersRoute, paging,
            List(summaryColumns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
        yield return Read(WarehouseModule, "depo.transfer.kalemleri", "Depo transferinin kalemleri", transfersRoute + "/{transferId}", [transferId],
            List(lineColumns, "lines"));
        yield return Write(WarehouseModule, "depo.transfer.olustur", "Depo transferi oluştur", "insert", "POST", transfersRoute,
            [.. BodyParameters<InventoryTransferWriteRequest>(sourceBacked: false), ListParameter<InventoryTransferLineWriteRequest>("lines")],
            Record(summaryColumns), null, null);
        yield return Write(WarehouseModule, "depo.transfer.iptal", "Depo transferini iptal et", "update", "POST", transfersRoute + "/{transferId}/void",
            [transferId, .. BodyParameters<InventoryTransferVoidRequest>(sourceBacked: false, exclude: "confirmation")], None, null, voidBody);
    }

    /// <summary>
    /// Cari Hesaplar, cari kart (yeni ve düzenleme) and Cari Hesap Hareketleri. The card and its primary address are saved in
    /// one request: the address fields are dotted body parameters (<c>address.city</c>), nested on the wire, and the fixed
    /// <c>address.kind</c> / <c>address.isDefault</c> apply only when the page sends the address. Updates and state changes
    /// start from the cari.getir record (rowVersion included); custom field values of a saved card go through
    /// cari.ozelAlanKaydet (body map), never cari.guncelle, so values the page does not bind are kept.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildCustomers(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string customersRoute = "/api/customers";
        const string customerRoute = customersRoute + "/{id}";
        const string addressRoute = customerRoute + "/addresses/{addressId}";
        const string customerRead = "cari.getir";
        var id = Route("id");
        var customerColumns = Columns<CustomerView>();
        // cari.getir also returns the primary address (members outside the constructor, set by the single-card read).
        string[] defaultAddressMembers = ["defaultAddressId:guid", "defaultAddressLabel:text", "defaultAddressLine:text", "defaultAddressCity:text",
            "defaultAddressDistrict:text", "defaultAddressPostalCode:text", "defaultAddressCountryCode:text", "defaultAddressLatitude:decimal",
            "defaultAddressLongitude:decimal"];
        var cardColumns = customerColumns.Concat(defaultAddressMembers.Select(x => x.Split(':'))
            .Select(x => new ErpOperationColumn(x[0], Label(x[0]), x[1]))).ToArray();
        var addressColumns = Columns<CustomerAddressView>();
        var valueColumns = Columns<CustomerCustomFieldValueView>();
        // The primary address: kind (General) and isDefault are fixed, the page binds the rest.
        var primaryAddress = NestedBodyParameters<CustomerAddressWriteRequest>("address", "kind", "isDefault", "isActive");
        static Dictionary<string, object?> Fixed(params (string Key, object? Value)[] values) =>
            values.ToDictionary(x => x.Key, x => x.Value, StringComparer.Ordinal);
        (string, object?)[] primaryAddressFixed = [("address.kind", "General"), ("address.isDefault", true)];

        yield return Read(CustomerModule, "cari.listele", "Cari kartlarını listele", customersRoute,
            [Query("q", "text"), Query("type", "text"), Query("status", "text"), .. paging],
            List(customerColumns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
        yield return Read(CustomerModule, customerRead, "Cari kartı getir", customerRoute, [id], Record(cardColumns));
        // isActive is fixed (a new card is active); rowVersion belongs to updates, which take it from the source record.
        yield return Write(CustomerModule, "cari.olustur", "Cari kartı oluştur", "insert", "POST", customersRoute,
            [.. BodyParameters<CustomerWriteRequest>(sourceBacked: false, exclude: ["isActive", "rowVersion"]), MapParameter("customFields"),
                .. primaryAddress],
            Record(customerColumns), null, Fixed([("isActive", true), .. primaryAddressFixed]));
        yield return Write(CustomerModule, "cari.guncelle", "Cari kartı güncelle", "update", "PUT", customerRoute,
            [id, .. BodyParameters<CustomerWriteRequest>(sourceBacked: true, exclude: ["isActive", "rowVersion"]), .. primaryAddress],
            Record(customerColumns), customerRead, Fixed(primaryAddressFixed));
        // Pasife al / Etkinleştir: the whole card from the source record with isActive fixed; no address is sent (kept as is).
        yield return Write(CustomerModule, "cari.pasifeAl", "Cari kartı pasife al", "update", "PUT", customerRoute, [id],
            Record(customerColumns), customerRead, Fixed(("isActive", false)));
        yield return Write(CustomerModule, "cari.aktifEt", "Cari kartı etkinleştir", "update", "PUT", customerRoute, [id],
            Record(customerColumns), customerRead, Fixed(("isActive", true)));
        // Sil: only a card with no related records (no movement, document, history or subsidiary); otherwise 409 and Pasife al.
        yield return Write(CustomerModule, "cari.sil", "Cari kartı sil", "delete", "DELETE", customerRoute, [id], None, null, null,
            requiresTenantAdmin: true);
        yield return Read(CustomerModule, "cari.bakiye", "Cari bakiyesi", customerRoute + "/balance", [id],
            Record(Columns<CustomerLedgerBalance>()
                .Append(new ErpOperationColumn("balanceAmount", Label("balanceAmount"), "decimal"))
                .Append(new ErpOperationColumn("balanceSideCode", Label("balanceSideCode"), "text"))
                .Append(new ErpOperationColumn("limitUsagePercent", Label("limitUsagePercent"), "decimal")).ToArray()));
        yield return Read(CustomerModule, "cari.sayaclar", "Cari sayaçları", customersRoute + "/counts", [Query("q", "text")],
            Record(Columns<CustomerCounts>()));
        yield return Read(CustomerModule, "cari.adresleri", "Cari adresleri", customerRoute + "/addresses", [id], List(addressColumns, null));
        yield return Read(CustomerModule, "cari.anaFirmaSecenekleri", "Ana firma seçenekleri", customersRoute + "/company-options",
            [Query("q", "text"), Query("excludeId", "guid")], List(Columns<CustomerCompanyOption>(), null));
        yield return Read(CustomerModule, "cari.gruplar", "Cari grupları", "/api/customer-groups", [], List(Columns<CustomerGroupView>(), null));
        yield return Read(CustomerModule, "cari.ozelAlanTanimlari", "Cari özel alan tanımları", customersRoute + "/custom-fields", [],
            List(Columns<CustomerCustomFieldDefinitionView>(), null));
        yield return Read(CustomerModule, "cari.ozelAlanDegerleri", "Cari özel alan değerleri", customerRoute + "/custom-fields", [id],
            List(valueColumns, null));
        // Same body map as stok.kart.ozelAlanKaydet: codes the page does not bind keep the values read by cari.ozelAlanDegerleri.
        yield return Write(CustomerModule, "cari.ozelAlanKaydet", "Cari özel alanlarını kaydet", "update", "PUT", customerRoute + "/custom-fields",
            [id, MapParameter("values")], List(valueColumns, null), null, null)
            with { BodyMap = new ErpOperationBodyMap("values", "cari.ozelAlanDegerleri", "code", "value") };
        yield return Read(CustomerModule, "cari.iller", "İller", "/api/location-definitions/provinces", [],
            List(Columns<CustomerLocationProvinceView>(), null));
        yield return Read(CustomerModule, "cari.ilceler", "İlçeler", "/api/location-definitions/districts",
            [Query("provinceId", "int"), Query("provinceName", "text")], List(Columns<CustomerLocationDistrictView>(), null));
        // Addresses are never deleted: Pasife al is the same PUT with isActive (and isDefault) fixed, the rest bound from the row.
        yield return Write(CustomerModule, "cari.adres.ekle", "Cari adresi ekle", "insert", "POST", customerRoute + "/addresses",
            [id, .. BodyParameters<CustomerAddressWriteRequest>(sourceBacked: false, exclude: "isActive")], Record(addressColumns), null,
            Fixed(("isActive", true)));
        yield return Write(CustomerModule, "cari.adres.pasifeAl", "Cari adresini pasife al", "update", "PUT", addressRoute,
            [id, Route("addressId"), .. BodyParameters<CustomerAddressWriteRequest>(sourceBacked: false, exclude: ["isActive", "isDefault"])],
            Record(addressColumns), null, Fixed(("isActive", false), ("isDefault", false)));
        yield return Write(CustomerModule, "cari.adres.aktifEt", "Cari adresini etkinleştir", "update", "PUT", addressRoute,
            [id, Route("addressId"), .. BodyParameters<CustomerAddressWriteRequest>(sourceBacked: false, exclude: "isActive")],
            Record(addressColumns), null, Fixed(("isActive", true)));
        // Statement: the route parameter must be "id" (permission resolution matches the route pattern by name), the period
        // is required so a page never reads every movement, and the display members are computed outside the record
        // constructors, so only this operation declares them.
        var statementColumns = Columns<CustomerStatementLine>()
            .Append(new ErpOperationColumn("isReversal", Label("isReversal"), "bool"))
            .Append(new ErpOperationColumn("debitAmount", Label("debitAmount"), "decimal"))
            .Append(new ErpOperationColumn("creditAmount", Label("creditAmount"), "decimal"))
            .Append(new ErpOperationColumn("balanceAmount", Label("balanceAmount"), "decimal"))
            .Append(new ErpOperationColumn("balanceSide", Label("balanceSide"), "text"))
            .Append(new ErpOperationColumn("foreignCurrencyCode", Label("foreignCurrencyCode"), "text"))
            // Source document (Belgeye git). Explicit labels: the shared "source*" codes are Finans labels, built after Cari.
            .Append(new ErpOperationColumn("sourceType", "Belge türü", "text"))
            .Append(new ErpOperationColumn("sourceId", "Belge kimliği", "guid"))
            .Append(new ErpOperationColumn("sourceCode", "Belge no", "text"))
            .Append(new ErpOperationColumn("sourceOpenId", "Açılacak belge", "guid")).ToArray();
        yield return Read(CustomerModule, "cari.ekstre", "Cari hesap ekstresi", customerRoute + "/statement",
            [id, new ErpOperationParameter("from", "query", "date", true), new ErpOperationParameter("to", "query", "date", true)],
            List(statementColumns, "items") with
            {
                MetaPaths = ["customerId", "customerCode", "customerName", "currencyCode", "from", "to", "openingBalance", "debitTotal",
                    "creditTotal", "closingBalance", "openingAmount", "openingSide", "closingAmount", "closingSide", "netMovement",
                    "openingAsOf", "hasForeignCurrency"]
            });
    }

    /// <summary>
    /// Finans: Kasalar / Bankalar (list, summary, statement, card, movements, transfers), Mizan with muavin, Hesap Planı and
    /// Yevmiye (list, entry, lines, manual entry, reversal). Account and transfer voids bind the account (<c>id</c>) and the
    /// movement (<c>transactionId</c>) explicitly: neither has a source read, so a page cannot take the account from the
    /// statement row's own id (G-F8). Status changes fix <c>isActive</c> in the query (<see cref="ErpOperation.FixedQuery"/>).
    /// The void, reversal and classification rules stay in the API as computed flags (<c>canVoid</c>, <c>canReverse</c>, …),
    /// members outside the view constructors, so only these operations declare them. Ledger writes, the manual entry, the
    /// reversal and the cash-flow category are TenantAdmin-only in their handlers.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildFinance(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string accountsRoute = "/api/finance/accounts";
        const string accountRoute = accountsRoute + "/{id}";
        const string accountRead = "finans.hesap.getir";
        const string ledgerRoute = "/api/finance/general-ledger";
        const string ledgerAccountRoute = ledgerRoute + "/accounts/{id}";
        const string ledgerAccountRead = "finans.muhasebe.hesap.getir";
        const string entryRoute = ledgerRoute + "/entries/{id}";
        var id = Route("id");
        var transactionId = Route("transactionId");
        static ErpOperationColumn Col(string code, string type) => new(code, Label(code), type);
        static ErpOperationColumn[] Cols(params string[] specs) => specs.Select(x => x.Split(':')).Select(x => Col(x[0], x[1])).ToArray();
        // Shared codes whose label elsewhere names another module's field ("type" = Cari türü) keep their code here.
        static ErpOperationColumn[] Relabel(IEnumerable<ErpOperationColumn> columns, params (string Code, string Label)[] labels) =>
            columns.Select(x => labels.FirstOrDefault(l => l.Code == x.Code) is { Label: { } label } ? x with { Label = label } : x).ToArray();
        static Dictionary<string, object?> Fixed(string key, object? value) => new(StringComparer.Ordinal) { [key] = value };

        var accountColumns = Relabel(Columns<FinancialAccountSummary>(), ("type", "Hesap türü"));
        var detailColumns = Relabel(Columns<FinancialAccountDetail>().Append(Col("totalCount", "int")), ("type", "Hesap türü"), ("totalCount", "Hareket sayısı"));
        var transactionColumns = Columns<FinancialAccountTransactionView>()
            .Concat(Cols("inflow:decimal", "outflow:decimal", "sourceKind:text", "isReversal:bool", "isReversed:bool", "canVoid:bool",
                "canVoidTransfer:bool", "canChangeCashFlow:bool")).ToArray();
        var typeQuery = Query("type", "text");

        // ---- Kasa / Banka ----
        yield return Read(FinanceModule, "finans.hesap.listele", "Kasa ve banka hesaplarını listele", accountsRoute, [typeQuery], List(accountColumns, null));
        yield return Read(FinanceModule, "finans.hesap.ozet", "Kasa ve banka hesap özeti", accountsRoute + "/summary", [typeQuery],
            Record(Relabel(Columns<FinancialAccountListSummary>(), ("activeCount", "Aktif hesap"), ("inactiveCount", "Pasif hesap"))));
        yield return Read(FinanceModule, accountRead, "Kasa/banka hesabı getir", accountRoute, [id, .. paging], Record(detailColumns));
        yield return Read(FinanceModule, "finans.hesap.ekstre", "Kasa/banka hesap ekstresi", accountRoute, [id, .. paging],
            List(transactionColumns, "transactions") with
            {
                MetaPaths = ["code", "name", "type", "currencyCode", "isActive", "balance", "transactionPage", "transactionPageSize",
                    "transactionTotalCount", "totalCount", "pageInflow", "pageOutflow"]
            });
        yield return Write(FinanceModule, "finans.hesap.olustur", "Kasa/banka hesabı oluştur", "insert", "POST", accountsRoute,
            BodyParameters<FinancialAccountWriteRequest>(sourceBacked: false), Record(accountColumns), null, null);
        // PUT replaces the card: unbound fields come from finans.hesap.getir; the handler rejects any opening balance on edit.
        yield return Write(FinanceModule, "finans.hesap.guncelle", "Kasa/banka hesabını güncelle", "update", "PUT", accountRoute,
            [id, .. BodyParameters<FinancialAccountWriteRequest>(sourceBacked: true, exclude: "openingBalance")], Record(accountColumns), accountRead,
            Fixed("openingBalance", 0m));
        yield return Write(FinanceModule, "finans.hesap.sil", "Kasa/banka hesabını sil", "delete", "DELETE", accountRoute, [id], None, null, null);
        var statusResult = Record(Cols("id:guid", "isActive:bool"));
        yield return Write(FinanceModule, "finans.hesap.pasifeAl", "Kasa/banka hesabını pasife al", "update", "POST", accountRoute + "/status", [id],
            statusResult, null, null) with { FixedQuery = Fixed("isActive", false) };
        yield return Write(FinanceModule, "finans.hesap.aktifEt", "Kasa/banka hesabını etkinleştir", "update", "POST", accountRoute + "/status", [id],
            statusResult, null, null) with { FixedQuery = Fixed("isActive", true) };
        // requestId is page-made (autoId): a retry with the same content returns the existing movement.
        yield return Write(FinanceModule, "finans.hareket.ekle", "Kasa/banka hareketi ekle", "insert", "POST", accountRoute + "/movements",
            [id, .. BodyParameters<FinancialAccountMovementWriteRequest>(sourceBacked: false)], Record(transactionColumns), null, null);
        yield return Write(FinanceModule, "finans.hareket.iptal", "Kasa/banka hareketini ters kayıtla iptal et", "update", "POST",
            accountRoute + "/transactions/{transactionId}/void", [id, transactionId], Record(Cols("id:guid", "status:text")), null, null);
        yield return Write(FinanceModule, "finans.hareket.nakitAkisi", "Hareketin nakit akışı sınıfını değiştir", "update", "POST",
            accountRoute + "/transactions/{transactionId}/cash-flow-category",
            [id, transactionId, .. BodyParameters<CashFlowCategoryUpdateRequest>(sourceBacked: false)],
            Record(Cols("id:guid", "cashFlowCategory:text", "reversalUpdated:bool")), null, null, requiresTenantAdmin: true);
        // The legacy screen has no description field: the transfer description is fixed.
        yield return Write(FinanceModule, "finans.transfer.olustur", "Kasa/banka transferi oluştur", "insert", "POST", "/api/finance/transfers",
            BodyParameters<FinancialAccountTransferWriteRequest>(sourceBacked: false, exclude: "description"), Record(Columns<FinancialAccountTransferSummary>()),
            null, Fixed("description", "Kasa/banka döviz transferi"));
        yield return Write(FinanceModule, "finans.transfer.iptal", "Kasa/banka transferini ters kayıtla iptal et", "update", "POST",
            "/api/finance/transfers/{transferId}/void", [Route("transferId")], Record(Cols("id:guid", "code:text", "status:text")), null, null);

        // ---- Mizan ----
        var trialColumns = Cols("accountId:text", "code:text", "name:text", "isActive:bool", "statementSection:text", "openingDebit:decimal",
            "openingCredit:decimal", "debit:decimal", "credit:decimal", "balanceDebit:decimal", "balanceCredit:decimal", "accountClass:text");
        yield return Read(FinanceModule, "finans.mizan", "Mizan", ledgerRoute + "/trial-balance",
            [new ErpOperationParameter("from", "query", "date", true), new ErpOperationParameter("to", "query", "date", true), Query("basis", "text"),
                Query("level", "text"), Query("movedOnly", "bool")],
            List(trialColumns, "accounts") with
            {
                MetaPaths = ["from", "to", "basis", "level", "movedOnly", "totalOpeningDebit", "totalOpeningCredit", "totalDebit", "totalCredit",
                    "totalBalanceDebit", "totalBalanceCredit", "unmappedAccountCount", "isComplete", "isBalanced", "accountCount", "movedAccountCount"]
            });
        // The server route names the account {accountId}; the runtime and the permission lookup match it by that name.
        yield return Read(FinanceModule, "finans.muhasebe.muavin", "Muavin (hesap hareketleri)", ledgerRoute + "/accounts/{accountId}/statement",
            [Route("accountId"), Query("from", "date"), Query("to", "date"), .. paging],
            List(Cols("journalEntryId:guid", "journalEntryCode:text", "entryDate:date", "journalDescription:text", "sourceType:text", "lineNumber:int",
                "lineDescription:text", "debit:decimal", "credit:decimal"), "lines") with
            {
                MetaPaths = ["from", "to", "openingDebit", "openingCredit", "openingBalanceDebit", "openingBalanceCredit", "totalDebit", "totalCredit",
                    "closingBalanceDebit", "closingBalanceCredit", "totalCount", "page", "pageSize", "totalPages"]
            });

        // ---- Hesap planı ----
        var ledgerColumns = Columns<LedgerAccountView>().Append(Col("accountClass", "text")).ToArray();
        yield return Read(FinanceModule, "finans.muhasebe.hesap.listele", "Hesap planını listele", ledgerRoute + "/accounts", [], List(ledgerColumns, null));
        yield return Read(FinanceModule, ledgerAccountRead, "Muhasebe hesabı getir", ledgerAccountRoute, [id], Record(ledgerColumns));
        yield return Write(FinanceModule, "finans.muhasebe.hesap.olustur", "Muhasebe hesabı oluştur", "insert", "POST", ledgerRoute + "/accounts",
            BodyParameters<LedgerAccountWriteRequest>(sourceBacked: false, exclude: "isActive"), Record(ledgerColumns), null, Fixed("isActive", true),
            requiresTenantAdmin: true);
        // PUT replaces the account: the fields the page does not bind (isActive included) come from finans.muhasebe.hesap.getir.
        yield return Write(FinanceModule, "finans.muhasebe.hesap.guncelle", "Muhasebe hesabını güncelle", "update", "PUT", ledgerAccountRoute,
            [id, .. BodyParameters<LedgerAccountWriteRequest>(sourceBacked: true, exclude: "isActive")], Record(ledgerColumns), ledgerAccountRead, null,
            requiresTenantAdmin: true);
        yield return Write(FinanceModule, "finans.muhasebe.hesap.pasifeAl", "Muhasebe hesabını pasife al", "update", "PUT", ledgerAccountRoute, [id],
            Record(ledgerColumns), ledgerAccountRead, Fixed("isActive", false), requiresTenantAdmin: true);
        yield return Write(FinanceModule, "finans.muhasebe.hesap.aktifEt", "Muhasebe hesabını etkinleştir", "update", "PUT", ledgerAccountRoute, [id],
            Record(ledgerColumns), ledgerAccountRead, Fixed("isActive", true), requiresTenantAdmin: true);
        yield return Write(FinanceModule, "finans.muhasebe.hesap.sil", "Muhasebe hesabını sil", "delete", "DELETE", ledgerAccountRoute, [id], None,
            null, null, requiresTenantAdmin: true);
        yield return Read(FinanceModule, "finans.muhasebe.tekDuzen.onizle", "Tek Düzen Hesap Planı önizlemesi", ledgerRoute + "/accounts/standard-chart", [],
            Record(Cols("template:text", "version:text", "sourceUrl:text", "totalAccounts:int", "existingAccounts:int", "accountsToAdd:int")));
        yield return Write(FinanceModule, "finans.muhasebe.tekDuzen.uygula", "Tek Düzen Hesap Planı eksik hesaplarını ekle", "insert", "POST",
            ledgerRoute + "/accounts/standard-chart/apply", [],
            Record(Cols("template:text", "addedCount:int", "preservedExistingCount:int", "totalAccounts:int")), null, null, requiresTenantAdmin: true);

        // ---- Yevmiye ----
        (string, string)[] entryLabels = [("entryDate", "Fiş tarihi"), ("code", "Fiş no")];
        var flagColumns = Cols("isSourced:bool", "isReversal:bool", "canReverse:bool", "sourceLabel:text");
        yield return Read(FinanceModule, "finans.fis.listele", "Yevmiye fişlerini listele", ledgerRoute + "/entries",
            [Query("from", "date"), Query("to", "date"), Query("accountingBasis", "text"), .. paging],
            List(Relabel(Columns<JournalEntryListItem>().Concat(flagColumns), entryLabels), "items") with { MetaPaths = ["page", "pageSize", "total", "totalCount"] });
        yield return Read(FinanceModule, "finans.fis.getir", "Yevmiye fişi getir", entryRoute, [id],
            Record(Relabel(Columns<JournalEntryView>().Concat(flagColumns)
                .Concat(Cols("reversedByEntryId:guid", "reversedByEntryCode:text", "reversalOfEntryCode:text")), entryLabels)));
        yield return Read(FinanceModule, "finans.fis.belge", "Yevmiye fişi belgesi", entryRoute + "/document", [id],
            Record(Relabel(Columns<JournalEntryView>().Concat(flagColumns), entryLabels)));
        yield return Read(FinanceModule, "finans.fis.satirlari", "Yevmiye fişinin satırları", entryRoute, [id], List(Columns<JournalEntryLineView>(), "lines"));
        var postedColumns = Relabel(Cols("id:guid", "code:text", "entryDate:date", "description:text", "sourceType:text", "sourceId:guid",
            "accountingBasis:text", "totalDebit:decimal", "totalCredit:decimal"), entryLabels);
        // No idempotency key on the server (G-F22): the page's busy lock is the only double-submit guard.
        yield return Write(FinanceModule, "finans.fis.olustur", "Yevmiye fişi kaydet", "insert", "POST", ledgerRoute + "/entries/manual",
            [.. BodyParameters<ManualJournalEntryWriteRequest>(sourceBacked: false), ListParameter<ManualJournalLineWriteRequest>("lines")],
            Record(postedColumns), null, null, requiresTenantAdmin: true);
        // The reversal date is bound by the page (today); the handler checks the closed period for it.
        yield return Write(FinanceModule, "finans.fis.tersKayit", "Yevmiye fişini ters kayıtla çevir", "insert", "POST", entryRoute + "/reverse",
            [id, .. BodyParameters<ManualJournalEntryReverseRequest>(sourceBacked: false)], Record(postedColumns), null, null, requiresTenantAdmin: true);
    }

    // A method, not a static field: Build() runs during static initialization, before later fields are assigned.
    private static bool IsDottedName(string name) =>
        Regex.IsMatch(name, @"^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\z", RegexOptions.CultureInvariant);

    /// <summary>
    /// Shape rules every operation meets (checked at startup): parameter names are unique ignoring case; a dotted name
    /// (<c>address.city</c>) is a scalar body parameter one level deep whose parent is not also a parameter. Dotted
    /// <c>fixedBody</c> keys follow the same rule, belong to a parent that has dotted parameters and are not parameters
    /// themselves. Null when the operation is valid.
    /// </summary>
    internal static string? ParameterShapeError(ErpOperation operation)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in operation.Parameters)
            if (!names.Add(parameter.Name)) return $"'{parameter.Name}' parametresi birden fazla kez tanımlı.";
        var plain = operation.Parameters.Where(x => !x.Name.Contains('.')).Select(x => x.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var parents = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in operation.Parameters.Where(x => x.Name.Contains('.')))
        {
            if (!IsDottedName(parameter.Name))
                return $"'{parameter.Name}': noktalı parametre adı tek düzeyli (üst.alt) olmalı ve iki parçası da tanımlayıcı olmalıdır.";
            if (parameter.In != "body") return $"'{parameter.Name}': noktalı ad yalnız gövde (body) parametresinde kullanılabilir.";
            if (parameter.Type is "list" or "map") return $"'{parameter.Name}': noktalı parametre skaler olmalıdır.";
            var parent = parameter.Name[..parameter.Name.IndexOf('.')];
            if (plain.Contains(parent)) return $"'{parameter.Name}': üst ad '{parent}' ayrıca bir parametre olamaz.";
            parents.Add(parent);
        }
        foreach (var key in operation.FixedBody?.Keys.Where(x => x.Contains('.')) ?? [])
        {
            if (!IsDottedName(key)) return $"fixedBody '{key}': noktalı anahtar tek düzeyli (üst.alt) olmalıdır.";
            var parent = key[..key.IndexOf('.')];
            if (!parents.Contains(parent)) return $"fixedBody '{key}': '{parent}' üst adının noktalı parametresi yok.";
            if (names.Contains(key)) return $"fixedBody '{key}' aynı zamanda bir parametre.";
        }
        foreach (var (key, value) in operation.FixedQuery ?? new Dictionary<string, object?>())
        {
            if (!Regex.IsMatch(key, @"^[A-Za-z_][A-Za-z0-9_]{0,63}\z", RegexOptions.CultureInvariant))
                return $"fixedQuery '{key}': anahtar bir tanımlayıcı olmalıdır.";
            if (names.Contains(key)) return $"fixedQuery '{key}' aynı zamanda bir parametre.";
            if (value is not (bool or string or int or long or decimal or double)) return $"fixedQuery '{key}': değer bool, sayı veya metin olmalıdır.";
        }
        return null;
    }

    // /api/reports/run accepts 1–12 columns; a report operation selects (and returns) the source's first 12.
    private static IReadOnlyList<ReportColumn> ReportColumns(ReportSource report) => report.Columns.Take(12).ToArray();

    /// <summary>
    /// The fixed /api/reports/run body for a report source. The sort column default ("code") does not exist on every
    /// source, so the first sort choice the endpoint's own validator accepts is used; a source with none fails startup.
    /// </summary>
    private static Dictionary<string, object?> ReportBody(string source, ReportSource report)
    {
        var columns = ReportColumns(report).Select(x => x.Code).ToArray();
        foreach (var sortBy in new string?[] { null }.Concat(report.Columns.Select(x => x.Code)))
        {
            if (!ReportEndpoints.Validate(new ReportRunRequest(source, columns, null, sortBy, false, PageSize: 100), out _, out _)) continue;
            var body = new Dictionary<string, object?>(StringComparer.Ordinal) { ["source"] = source, ["columns"] = columns, ["pageSize"] = 100 };
            if (sortBy is not null) body["sortBy"] = sortBy;
            return body;
        }
        throw new InvalidOperationException($"Rapor kaynağı için geçerli bir rapor isteği kurulamadı: {source}");
    }

    private static ErpOperationResult List(IReadOnlyList<ErpOperationColumn> columns, string? rowsPath) => new("list", rowsPath, columns);
    private static ErpOperationResult Record(IReadOnlyList<ErpOperationColumn> columns) => new("record", null, columns);
    private static ErpOperationParameter Route(string name) => new(name, "route", "guid", true);
    private static ErpOperationParameter Query(string name, string type) => new(name, "query", type, false);

    private static ErpOperation Read(string module, string name, string label, string route, IReadOnlyList<ErpOperationParameter> parameters,
        ErpOperationResult result) =>
        new(name, label, module, "read", "read", "GET", route, parameters, result, null, null, Since);

    private static ErpOperation Write(string module, string name, string label, string pageKind, string method, string route,
        IReadOnlyList<ErpOperationParameter> parameters, ErpOperationResult result, string? sourceOperation, IReadOnlyDictionary<string, object?>? fixedBody,
        bool requiresTenantAdmin = false) =>
        new(name, label, module, "write", pageKind, method, route, parameters, result, sourceOperation, fixedBody, Since,
            RequiresTenantAdmin: requiresTenantAdmin);

    /// <summary>Scalar fields of a view; with <paramref name="prefix"/> the codes are dotted (<c>balance.code</c>) and keep the inner code's label.</summary>
    private static IReadOnlyList<ErpOperationColumn> Columns<T>(string? prefix = null) =>
        ScalarMembers<T>().Select(x => new ErpOperationColumn(prefix is null ? x.Name : prefix + "." + x.Name, Label(x.Name), x.Type)).ToArray();

    /// <summary>
    /// Every scalar field of a request record. Required means non-nullable without a default; for an operation whose
    /// body starts from a source read (<paramref name="sourceBacked"/>) nothing is required because unbound fields keep
    /// the source record's values.
    /// </summary>
    private static IReadOnlyList<ErpOperationParameter> BodyParameters<T>(bool sourceBacked, params string[] exclude) =>
        ScalarMembers<T>().Where(x => !exclude.Contains(x.Name, StringComparer.Ordinal))
            .Select(x => new ErpOperationParameter(x.Name, "body", x.Type, !sourceBacked && x.Required) { Nullable = x.Nullable }).ToArray();

    /// <summary>
    /// A body <c>list</c> parameter whose items are the scalar fields of <typeparamref name="T"/> plus its string maps
    /// (<c>map</c>). Collection parameters are never required: an unbound one keeps the key out of the body.
    /// </summary>
    private static ErpOperationParameter ListParameter<T>(string name) =>
        new(name, "body", "list", false)
        {
            Items = ScalarMembers<T>(includeMaps: true).Select(x => new ErpOperationParameterItem(x.Name, Label(x.Name), x.Type, x.Required)).ToArray()
        };

    /// <summary>
    /// Scalar fields of a nested request record as dotted body parameters (<c>parent.field</c>), never required: the runtime
    /// nests them into one object and leaves the object out when none of them has a value.
    /// </summary>
    private static IReadOnlyList<ErpOperationParameter> NestedBodyParameters<T>(string parent, params string[] exclude) =>
        ScalarMembers<T>().Where(x => !exclude.Contains(x.Name, StringComparer.Ordinal))
            .Select(x => new ErpOperationParameter(parent + "." + x.Name, "body", x.Type, false)).ToArray();

    /// <summary>A body <c>map</c> parameter: a code → string value object (custom field values).</summary>
    private static ErpOperationParameter MapParameter(string name) => new(name, "body", "map", false);

    private static IEnumerable<(string Name, string Type, bool Required, bool Nullable)> ScalarMembers<T>(bool includeMaps = false)
    {
        var nullability = new NullabilityInfoContext();
        var constructor = typeof(T).GetConstructors().OrderByDescending(x => x.GetParameters().Length).First();
        foreach (var parameter in constructor.GetParameters())
        {
            var type = DataType(parameter.ParameterType) ?? (includeMaps && IsStringMap(parameter.ParameterType) ? "map" : null);
            if (type is null) continue;
            var nullable = Nullable.GetUnderlyingType(parameter.ParameterType) is not null
                || (!parameter.ParameterType.IsValueType && nullability.Create(parameter).WriteState == NullabilityState.Nullable);
            yield return (CamelCase(parameter.Name!), type, !nullable && !parameter.HasDefaultValue, nullable);
        }
    }

    private static string? DataType(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (type == typeof(Guid)) return "guid";
        if (type == typeof(string) || type == typeof(byte[]) || type.IsEnum) return "text";
        if (type == typeof(decimal) || type == typeof(double) || type == typeof(float)) return "decimal";
        if (type == typeof(int) || type == typeof(long) || type == typeof(short)) return "int";
        if (type == typeof(bool)) return "bool";
        if (type == typeof(DateOnly) || type == typeof(DateTime) || type == typeof(DateTimeOffset)) return "date";
        return null;
    }

    private static bool IsStringMap(Type type) =>
        type == typeof(IReadOnlyDictionary<string, string>) || type == typeof(IReadOnlyDictionary<string, string?>);

    private static string CamelCase(string name) => char.ToLowerInvariant(name[0]) + name[1..];

    // The shared dictionary wins on shared codes; a module's own codes come from the label block of the module being built.
    private static string Label(string code) => Labels.TryGetValue(code, out var label) ? label
        : moduleLabel?.Invoke(code) ?? throw new InvalidOperationException($"ERP işlem kataloğunda '{code}' alanının etiketi yok.");

    [ThreadStatic] private static Func<string, string?>? moduleLabel;

    /// <summary>Builds one module's operations with its label block in scope (builders are lazy, so they are listed here).</summary>
    private static List<ErpOperation> InModule(Func<string, string?> labels, Func<IEnumerable<ErpOperation>> build)
    {
        var previous = moduleLabel;
        moduleLabel = labels;
        try { return build().ToList(); }
        finally { moduleLabel = previous; }
    }

    // Endpoint lookup by "METHOD normalized-route" → raw route pattern, built once per endpoint data source.
    private static readonly ConditionalWeakTable<EndpointDataSource, IReadOnlyDictionary<string, string>> RoutePatterns = new();

    internal static void MapErpOperationCatalogEndpoints(this WebApplication app)
    {
        app.MapGroup("/api/custom-pages").WithTags("Tenant Custom Pages").RequireAuthorization()
            .MapGet("/erp-operations", async (ClaimsPrincipal user, EndpointDataSource endpoints,
                IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
            {
                if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId)
                    || !Guid.TryParse(user.FindFirstValue("sub"), out var userId)) return Results.Forbid();
                var role = user.FindFirstValue("role");
                if (string.IsNullOrWhiteSpace(role)) return Results.Forbid();
                var patterns = RoutePatterns.GetValue(endpoints, BuildRoutePatterns);
                // Many operations share a permission (every stock read, every report run); each distinct permission is
                // decided once, and the whole set in one authorizer batch (one membership and one rules lookup).
                var distinct = new List<ResolvedPlatformPermission>();
                var indexByKey = new Dictionary<string, int>(StringComparer.Ordinal);
                var needs = new int[Operations.Count][];
                for (var index = 0; index < Operations.Count; index++)
                {
                    var permissions = RequiredPermissions(Operations[index], patterns, tenantId, userId, role);
                    needs[index] = permissions?.Select(permission =>
                    {
                        var key = PermissionKey(permission);
                        if (!indexByKey.TryGetValue(key, out var position))
                        {
                            position = distinct.Count;
                            indexByKey[key] = position;
                            distinct.Add(permission);
                        }
                        return position;
                    }).ToArray() ?? [-1];
                }
                var decisions = await authorizer.IsAllowedManyAsync(tenantId, userId, role, distinct, ct);
                var views = new List<ErpOperationView>(Operations.Count);
                for (var index = 0; index < Operations.Count; index++)
                {
                    var op = Operations[index];
                    // Deprecated operations still report the caller's rights; Studio hides them by the deprecated flag.
                    var allowed = needs[index].All(position => position >= 0 && decisions[position]);
                    views.Add(new ErpOperationView(op.Name, op.Label, op.Module, op.Kind, op.PageKind, op.Method, op.Route, op.Parameters,
                        op.Result, op.SourceOperation, op.FixedBody, op.Since, op.Deprecated, allowed, op.RouteVariants, op.BodyMap, op.FixedQuery));
                }
                return Results.Ok(new { operations = views });
            });
    }

    private static IReadOnlyDictionary<string, string> BuildRoutePatterns(EndpointDataSource source)
    {
        var patterns = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var endpoint in source.Endpoints.OfType<RouteEndpoint>())
        {
            var methods = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods;
            if (methods is null || endpoint.RoutePattern.RawText is not { } raw) continue;
            foreach (var method in methods) patterns.TryAdd($"{method} {NormalizeRoutePattern(raw)}", raw);
        }
        return patterns;
    }

    /// <summary>
    /// Permissions the caller needs for this operation: the route permission the endpoint itself would check, plus the
    /// per-source read check of <c>/api/reports/run</c> for report operations. Null means never allowed: the endpoint or
    /// its permission cannot be resolved (fail closed), or the handler itself only accepts TenantAdmin.
    /// </summary>
    private static IReadOnlyList<ResolvedPlatformPermission>? RequiredPermissions(ErpOperation op, IReadOnlyDictionary<string, string> patterns,
        Guid tenantId, Guid userId, string role)
    {
        var isTenantAdmin = role == "TenantAdmin";
        if (op.RequiresTenantAdmin && !isTenantAdmin) return null;
        // The base route and every variant must resolve; the caller needs the permissions of all of them.
        var routePermissions = new List<ResolvedPlatformPermission>();
        foreach (var route in op.RouteVariants.Select(x => x.Route).Prepend(op.Route))
        {
            if (!patterns.TryGetValue($"{op.Method} {route}", out var rawPattern)) return null;
            var routeValues = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            var path = Regex.Replace(route, @"\{([A-Za-z]+)\}", match =>
            {
                var parameter = op.Parameters.First(x => x.In == "route" && x.Name == match.Groups[1].Value);
                var value = parameter.Type == "guid" ? Guid.Empty.ToString("D") : "0";
                routeValues[parameter.Name] = value;
                return value;
            });
            if (!PlatformPermissionCatalog.TryResolve(path, op.Method, rawPattern, routeValues, tenantId, userId, role, out var resolved)
                || resolved is null) return null;
            routePermissions.Add(RowRulesDecidedPerRecord(op.Method, path, routeValues, resolved)
                ? resolved with
                {
                    Attributes = new Dictionary<string, string>(resolved.Attributes, StringComparer.OrdinalIgnoreCase) { ["resource.collectionRowsFiltered"] = "true" }
                }
                : resolved);
        }
        if (op.Route != "/api/reports/run" || op.FixedBody?["source"] is not string source) return routePermissions;
        // Same order as RunAsync: workflowInstances is admin-only, then the source's own read permission.
        if (source == "workflowInstances" && !isTenantAdmin) return null;
        return ReportEndpoints.TryReportSourcePermission(source, tenantId, userId, role, out var sourcePermission)
            ? [routePermissions[0], sourcePermission] : null;
    }

    /// <summary>
    /// The catalog resolves a route without a record (empty GUIDs, no row attributes), so a row-attribute rule (e.g.
    /// <c>resource.customerType == Customer</c>) can never match it. Where the endpoint decides such rules per record — an
    /// <c>{id}</c> route of a resource whose record attributes the request handler resolves, or a collection read that
    /// filters its rows — a row-attribute Allow rule counts as "allowed for the page, the server decides per record"
    /// (the same evaluation as the filtered collection read). Elsewhere (e.g. a create without a record) the request is
    /// evaluated without row attributes, so the catalog keeps that evaluation too.
    /// </summary>
    private static bool RowRulesDecidedPerRecord(string method, string path, IReadOnlyDictionary<string, string?> routeValues,
        ResolvedPlatformPermission permission) =>
        PermissionAuthorizationHandler.IsStatusFilteredCollection(method, path, permission.Permission.ResourceType)
        || routeValues.ContainsKey("id") && PermissionAuthorizationHandler.RecordAttributeResourceTypes.Contains(permission.Permission.ResourceType);

    private static string PermissionKey(ResolvedPlatformPermission permission) =>
        permission.Permission.Code + "|" + string.Join(";", permission.Attributes
            .OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase).Select(x => $"{x.Key}={x.Value}"));
}
