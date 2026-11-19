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
}

/// <summary>Resolves an operation by name; <see cref="ErpOperationCatalog.TryGet"/> in production.</summary>
internal delegate bool ErpOperationLookup(string name, out ErpOperation operation);

/// <summary>Wire form of a catalog entry: the operation plus whether the caller may run it.</summary>
internal sealed record ErpOperationView(string Name, string Label, string Module, string Kind, string PageKind, string Method, string Route,
    IReadOnlyList<ErpOperationParameter> Parameters, ErpOperationResult Result, string? SourceOperation,
    IReadOnlyDictionary<string, object?>? FixedBody, string Since, bool Deprecated, bool Allowed,
    IReadOnlyList<ErpOperationRouteVariant> RouteVariants, ErpOperationBodyMap? BodyMap);

/// <summary>
/// Named ERP operations that custom pages may bind to instead of SQL. Each entry describes an existing API endpoint; the
/// page runtime calls that endpoint with the user's own token, so no new privilege is created. Names are stable forever:
/// entries are only added or marked deprecated, never removed or renamed (<c>ErpOperationCatalog.names.txt</c> in the
/// integration tests enforces this). If an operation's contract has to change, add a new name.
/// </summary>
internal static class ErpOperationCatalog
{
    private const string Since = "2026-11-18";
    private const string StockModule = "Stok";
    private const string WarehouseModule = "Depo";
    private const string ReportModule = "Raporlar";
    private const string ManufacturingModule = "Üretim";
    private const string SettingsModule = "Ayarlar";
    private const string PurchasingModule = "Satınalma";
    private const string StockItemRoute = "/api/stock/items/{id}";
    private const string StockItemRead = "stok.kart.getir";

    private static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>(StringComparer.Ordinal)
    {
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
        ["kind"] = "Kayıt türü", ["purchaseReceiptId"] = "Mal kabul kimliği", ["totalAmountBase"] = "Toplam tutar",
        ["amountBase"] = "Tutar", ["reason"] = "Gerekçe", ["allocationMethod"] = "Dağıtım yöntemi",
        ["purchaseOrderId"] = "Satınalma siparişi kimliği", ["purchaseOrderCode"] = "Satınalma siparişi", ["receiptDate"] = "Kabul tarihi",
        ["lineCount"] = "Satır sayısı"
    };

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
        operations.AddRange(BuildStockCost(paging));

        var reportSources = ReportEndpoints.CatalogSources(includeAdminSources: true).ToDictionary(x => x.Code, StringComparer.Ordinal);
        foreach (var source in ReportEndpoints.ReportSourcePermissions.Keys.OrderBy(x => x, StringComparer.Ordinal))
        {
            if (!reportSources.TryGetValue(source, out var report))
                throw new InvalidOperationException($"Rapor kaynağı katalogda yok: {source}");
            operations.Add(new ErpOperation($"rapor.{source}", "Rapor: " + report.Label, ReportModule, "read", "read", "POST", "/api/reports/run",
                [], new ErpOperationResult("list", "rows", ReportColumns(report).Select(x => new ErpOperationColumn(x.Code, x.Label, x.DataType)).ToArray()),
                null, ReportBody(source, report), Since));
        }
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

        // warehouseId is optional: when it is set the per-warehouse route is used, otherwise all active warehouses.
        yield return Read(StockModule, "stok.bakiye.sayfa", "Stok bakiyeleri (sayfalı)", "/api/warehouses/balances/page",
            [new ErpOperationParameter("warehouseId", "route", "guid", false), Query("q", "text"), Query("belowMinimumOnly", "bool"),
                Query("includeInactive", "bool"), .. paging],
            List(balanceColumns, "items") with
            {
                Flatten = ["balance", "stockItem"],
                // The page summary members are computed over the returned page items only.
                MetaPaths = ["page", "pageSize", "totalCount", "belowMinimumCount", "pageValuationAmountBase", "pageAvailableQuantity",
                    "pageUnitCode", "pageAvailableCount", "pageUnvaluedCount", "baseCurrencyCode"]
            })
            with { RouteVariants = [new ErpOperationRouteVariant("/api/warehouses/{warehouseId}/balances/page", "warehouseId")] };
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
            .Select(x => new ErpOperationParameter(x.Name, "body", x.Type, !sourceBacked && x.Required)).ToArray();

    /// <summary>
    /// A body <c>list</c> parameter whose items are the scalar fields of <typeparamref name="T"/> plus its string maps
    /// (<c>map</c>). Collection parameters are never required: an unbound one keeps the key out of the body.
    /// </summary>
    private static ErpOperationParameter ListParameter<T>(string name) =>
        new(name, "body", "list", false)
        {
            Items = ScalarMembers<T>(includeMaps: true).Select(x => new ErpOperationParameterItem(x.Name, Label(x.Name), x.Type, x.Required)).ToArray()
        };

    /// <summary>A body <c>map</c> parameter: a code → string value object (custom field values).</summary>
    private static ErpOperationParameter MapParameter(string name) => new(name, "body", "map", false);

    private static IEnumerable<(string Name, string Type, bool Required)> ScalarMembers<T>(bool includeMaps = false)
    {
        var nullability = new NullabilityInfoContext();
        var constructor = typeof(T).GetConstructors().OrderByDescending(x => x.GetParameters().Length).First();
        foreach (var parameter in constructor.GetParameters())
        {
            var type = DataType(parameter.ParameterType) ?? (includeMaps && IsStringMap(parameter.ParameterType) ? "map" : null);
            if (type is null) continue;
            var nullable = Nullable.GetUnderlyingType(parameter.ParameterType) is not null
                || (!parameter.ParameterType.IsValueType && nullability.Create(parameter).WriteState == NullabilityState.Nullable);
            yield return (CamelCase(parameter.Name!), type, !nullable && !parameter.HasDefaultValue);
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

    private static string Label(string code) => Labels.TryGetValue(code, out var label)
        ? label : throw new InvalidOperationException($"ERP işlem kataloğunda '{code}' alanının etiketi yok.");

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
                        op.Result, op.SourceOperation, op.FixedBody, op.Since, op.Deprecated, allowed, op.RouteVariants, op.BodyMap));
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
            routePermissions.Add(resolved);
        }
        if (op.Route != "/api/reports/run" || op.FixedBody?["source"] is not string source) return routePermissions;
        // Same order as RunAsync: workflowInstances is admin-only, then the source's own read permission.
        if (source == "workflowInstances" && !isTenantAdmin) return null;
        return ReportEndpoints.TryReportSourcePermission(source, tenantId, userId, role, out var sourcePermission)
            ? [routePermissions[0], sourcePermission] : null;
    }

    private static string PermissionKey(ResolvedPlatformPermission permission) =>
        permission.Permission.Code + "|" + string.Join(";", permission.Attributes
            .OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase).Select(x => $"{x.Key}={x.Value}"));
}
