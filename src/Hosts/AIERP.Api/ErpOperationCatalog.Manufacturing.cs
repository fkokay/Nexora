using AIERP.Platform.Application;

namespace AIERP.Api;

/// <summary>
/// Üretim system pages (taslak 24): Üretim emirleri (list, detail, route, components, workflow steps, completion), Yeni üretim
/// emri, Reçeteler (list, delete, activate / deactivate; the recipe card stays legacy) and Maliyet analizi. Kept in its own file so
/// other modules' catalog changes do not collide. No static fields here (the label map lives in the main file, before
/// Operations): the initialization order of static fields across partial files is not something to rely on.
/// </summary>
internal static partial class ErpOperationCatalog
{
    /// <summary>
    /// Every order read uses the one order projection (OrderView). Its product fields are trailing constructor members; the
    /// route counters, workflow flags, planned costs and display texts are computed outside the constructor, so only these
    /// operations declare them. Workflow steps send the route ids only (the endpoints take no body); the completion sends the
    /// quantities and the finished-goods lot / serial rows (one row per lot or serial). Every rule (state, scheduling, FEFO,
    /// closed period, costing) stays in the API. uretim.recete.listele (stock card standard) keeps its required product
    /// filter; uretim.recete.tumunuListele is the unfiltered list.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildManufacturing(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string orders = "/api/manufacturing/orders";
        const string order = orders + "/{id}";
        const string operation = order + "/operations/{operationId}";
        const string boms = "/api/manufacturing/boms";
        const string bom = boms + "/{id}";
        var id = Route("id");
        var operationId = Route("operationId");
        static ErpOperationColumn Col(string code, string type) => new(code, Label(code), type);
        static ErpOperationColumn[] Cols(params string[] specs) => specs.Select(x => x.Split(':')).Select(x => Col(x[0], x[1])).ToArray();

        var orderColumns = Columns<OrderView>().Concat(Cols("operationCount:int", "scheduledOperationCount:int", "startedOperationCount:int",
            "completedOperationCount:int", "canSchedule:bool", "canRelease:bool", "canComplete:bool", "canCancel:bool", "componentCodes:text",
            "plannedMaterialCostBase:decimal", "plannedOperationCostBase:decimal", "plannedCostBase:decimal", "actualOperationCostBase:decimal",
            "routeSummary:text", "sourceText:text")).ToArray();
        var orderRecord = Record(orderColumns);
        // Shared "lineCount" names a document's lines; a recipe's lines are its components.
        var bomColumns = Columns<BomView>().Concat(Cols("lineCount:int", "operationCount:int"))
            .Select(x => x.Code == "lineCount" ? x with { Label = "Bileşen sayısı" } : x).ToArray();

        // ---- Üretim emirleri ----
        yield return Read(ManufacturingModule, "uretim.emir.listele", "Üretim emirlerini listele", orders,
            [Query("q", "text"), Query("status", "text"), .. paging],
            List(orderColumns, "items") with
            {
                // The counters are company-wide (every order of the tenant, whatever the filters).
                MetaPaths = ["page", "pageSize", "totalCount", "openOrderCount", "unscheduledOrderCount", "completedOrderCount", "openPlannedCostBase"]
            });
        yield return Read(ManufacturingModule, "uretim.emir.getir", "Üretim emri getir", order, [id], orderRecord);
        yield return Read(ManufacturingModule, "uretim.emir.operasyonlari", "Üretim emrinin rota operasyonları", order, [id],
            List(Columns<ManufacturingOrderOperationView>(), "operations"));
        yield return Read(ManufacturingModule, "uretim.emir.bilesenleri", "Üretim emrinin bileşenleri", order, [id],
            List(Columns<OrderLineView>(), "lines"));
        // No idempotency key: the order code is unique per tenant, so a repeated create is a 409.
        yield return Write(ManufacturingModule, "uretim.emir.olustur", "Üretim emri planla", "insert", "POST", orders,
            BodyParameters<ManufacturingOrderWriteRequest>(sourceBacked: false), orderRecord, null, null);
        yield return Write(ManufacturingModule, "uretim.emir.cizelgele", "Üretim emrini kapasiteye çizelgele", "update", "POST", order + "/schedule",
            [id], orderRecord, null, null);
        yield return Write(ManufacturingModule, "uretim.emir.serbestBirak", "Üretim emrini serbest bırak", "update", "POST", order + "/release",
            [id], orderRecord, null, null);
        yield return Write(ManufacturingModule, "uretim.emir.operasyonBaslat", "Rota operasyonunu başlat", "update", "POST", operation + "/start",
            [id, operationId], orderRecord, null, null);
        yield return Write(ManufacturingModule, "uretim.emir.operasyonTamamla", "Rota operasyonunun fiili kaydını gir", "update", "POST", operation + "/complete",
            [id, operationId, .. BodyParameters<ManufacturingOperationCompleteRequest>(sourceBacked: false)], orderRecord, null, null);
        // The response's nested order is left out of the columns; the page refreshes its order reads instead.
        yield return Write(ManufacturingModule, "uretim.emir.tamamla", "Üretimi bildir ve emri tamamla", "update", "POST", order + "/complete",
            [id, .. BodyParameters<ManufacturingCompleteRequest>(sourceBacked: false),
                ListParameter<InventoryTrackingAllocationRequest>("finishedGoodsTracking")],
            Record(Cols("baseCurrencyCode:text", "totalCostBase:decimal", "unitCostBase:decimal", "operationCostBase:decimal", "costStatus:text")),
            null, null);
        yield return Write(ManufacturingModule, "uretim.emir.iptal", "Üretim emrini iptal et", "update", "POST", order + "/cancel", [id], None, null, null);
        yield return Read(ManufacturingModule, "uretim.operatorler", "Üretim operatörleri (aktif personel)", "/api/manufacturing/operators", [],
            List(Columns<ManufacturingOperatorView>(), null));

        // ---- Reçeteler ----
        yield return Read(ManufacturingModule, "uretim.recete.tumunuListele", "Ürün reçetelerini listele", boms,
            [Query("productStockItemId", "guid"), Query("isActive", "bool")], List(bomColumns, null));
        yield return Read(ManufacturingModule, "uretim.recete.getir", "Ürün reçetesi getir", bom, [id], Record(bomColumns));
        yield return Read(ManufacturingModule, "uretim.recete.bilesenleri", "Ürün reçetesinin bileşenleri", bom, [id],
            List(Columns<BomLineView>(), "lines"));
        // Only a recipe no order used; otherwise 409 and Pasife al.
        yield return Write(ManufacturingModule, "uretim.recete.sil", "Ürün reçetesini sil", "delete", "DELETE", bom, [id], None, null, null);
        yield return Write(ManufacturingModule, "uretim.recete.etkinlestir", "Ürün reçetesini etkinleştir", "update", "POST", bom + "/activate",
            [id], None, null, null);
        yield return Write(ManufacturingModule, "uretim.recete.pasifeAl", "Ürün reçetesini pasife al", "update", "POST", bom + "/deactivate",
            [id], None, null, null);

        // ---- Maliyet analizi ----
        // The handler also requires the TenantAdmin or TenantUser role and the manufacturingOrders report source right; the
        // catalog resolves only the route permission, so a page shows the server's 403 for anyone else.
        yield return Read(ManufacturingModule, "uretim.maliyetAnalizi", "Üretim maliyet analizi", "/api/reports/manufacturing-cost-variance",
            [new ErpOperationParameter("from", "query", "date", true), new ErpOperationParameter("to", "query", "date", true), .. paging],
            List(Columns<ManufacturingCostVarianceOrder>(), "orders") with
            {
                MetaPaths = ["from", "to", "periodBasis", "baseCurrencyCode", "page", "pageSize", "totalCount", "limitations",
                    "pagePlannedMaterialBase", "pagePlannedConversionBase", "pageActualMaterialBase"]
            });
    }

    /// <summary>Üretim label codes (only codes the shared dictionary does not already define).</summary>
    private static KeyValuePair<string, string>[] ManufacturingLabels() =>
    [
        // Üretim emri
        new("billOfMaterialId", "Reçete kimliği"), new("billOfMaterialName", "Reçete"), new("sourceSalesOrderId", "Kaynak sipariş kimliği"),
        new("sourceSalesOrderLineNumber", "Sipariş satırı"), new("sourceSalesOrderCode", "Kaynak sipariş"), new("plannedQuantity", "Planlanan miktar"),
        new("actualGoodQuantity", "İyi ürün miktarı"), new("scrapQuantity", "Fire miktarı"), new("scrapReason", "Fire nedeni"),
        new("plannedDate", "Plan tarihi"), new("completedAt", "Tamamlanma"), new("productCode", "Mamul kodu"),
        new("operationCount", "Operasyon sayısı"), new("scheduledOperationCount", "Çizelgelenen operasyon"),
        new("startedOperationCount", "Başlamış operasyon"), new("completedOperationCount", "Tamamlanan operasyon"),
        new("canSchedule", "Çizelgelenebilir"), new("canRelease", "Serbest bırakılabilir"), new("canComplete", "Tamamlanabilir"),
        new("canCancel", "İptal edilebilir"), new("componentCodes", "Bileşenler"), new("plannedMaterialCostBase", "Planlanan malzeme"),
        new("plannedOperationCostBase", "Planlanan operasyon maliyeti"), new("plannedCostBase", "Planlanan maliyet"),
        new("actualOperationCostBase", "Fiili işlem maliyeti"), new("routeSummary", "Rota"), new("sourceText", "Üretim türü / sipariş"),
        // Rota operasyonu
        new("sequence", "Sıra"), new("workCenterId", "İş merkezi kimliği"), new("workCenterCode", "İş merkezi kodu"),
        new("workCenterName", "İş merkezi"), new("setupMinutes", "Kurulum dk"), new("runMinutes", "Çalışma dk"),
        new("minimumWaitDaysAfterPrevious", "Bekleme (gün)"), new("setupFamilyCode", "Kurulum ailesi"),
        new("sequenceSetupMinutes", "Sıralı kurulum dk"), new("scheduledStartDate", "Planlanan başlangıç"),
        new("scheduledEndDate", "Planlanan bitiş"), new("scheduledStartMinuteOfDay", "Başlangıç dakikası"),
        new("scheduledEndMinuteOfDay", "Bitiş dakikası"), new("laborCostPerHourBase", "İşçilik (saat)"),
        new("overheadCostPerHourBase", "Genel gider (saat)"), new("plannedEnergyQuantityKwh", "Planlanan enerji kWh"),
        new("plannedEnergyCostPerKwhBase", "Planlanan kWh bedeli"), new("plannedEnergyCostBase", "Planlanan enerji maliyeti"),
        new("actualSetupMinutes", "Fiili kurulum dk"), new("actualRunMinutes", "Fiili çalışma dk"),
        new("actualEnergyQuantityKwh", "Fiili enerji kWh"), new("actualEnergyCostPerKwhBase", "Fiili kWh bedeli"),
        new("actualEnergyCostBase", "Fiili enerji maliyeti"), new("actualCostBase", "Fiili maliyet"),
        new("performedByEmployeeId", "Operatör kimliği"), new("performedByEmployeeName", "Operatör"), new("startedAt", "Başlama"),
        new("scheduledStartSecondOfDay", "Başlangıç saniyesi"), new("scheduledEndSecondOfDay", "Bitiş saniyesi"),
        // Bileşen satırı (emir ve reçete)
        new("componentStockItemId", "Bileşen stok kartı"), new("componentCode", "Bileşen kodu"), new("componentName", "Bileşen"),
        new("requiredQuantity", "Gereken miktar"), new("standardUnitCostBaseSnapshot", "Birim maliyet (emir anı)"),
        new("scrapPercent", "Fire %"), new("standardUnitCostBase", "Standart birim maliyet"),
        // Tamamlama sonucu ve operatör
        new("totalCostBase", "Toplam maliyet"), new("operationCostBase", "Operasyon maliyeti"), new("costStatus", "Maliyet durumu"),
        new("fullName", "Ad soyad"),
        // Maliyet analizi
        new("orderCode", "Üretim emri"), new("plannedLaborBase", "Planlanan işçilik"), new("actualLaborBase", "Fiilî işçilik"),
        new("plannedOverheadBase", "Planlanan genel gider"), new("actualOverheadBase", "Fiilî genel gider"),
        new("plannedEnergyBase", "Planlanan enerji"), new("actualEnergyBase", "Fiilî enerji"), new("plannedMaterialBase", "Planlanan malzeme"),
        new("actualMaterialBase", "Fiilî malzeme"), new("plannedConversionBase", "Planlanan dönüşüm"), new("actualConversionBase", "Fiilî dönüşüm"),
        new("conversionVarianceBase", "Dönüşüm farkı"), new("actualTotalCostBase", "Fiilî toplam"), new("totalVarianceBase", "Toplam fark"),
    ];
}
