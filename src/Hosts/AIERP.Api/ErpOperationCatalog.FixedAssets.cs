namespace AIERP.Api;

// Duran Varlık system pages (taslak 27): fixed-assets (list + dialogs), fixed-asset-create (acquisition) and fixed-asset-card.
// Kept in its own partial file so other modules' catalog changes do not collide. No static fields here: Build() runs during
// the main file's static initialization, and the initialization order of static fields across partial files is not something
// to rely on. Constants, locals and methods only.
internal static partial class ErpOperationCatalog
{
    private const string FixedAssetModule = "Duran Varlık";

    /// <summary>
    /// Duran Varlık reads and writes. Every server rule stays in FixedAssetEndpoints: depreciation and tax depreciation are
    /// posted one month at a time in order (the schedules return the only postable month as <c>nextPeriodStart</c>), the
    /// disposal carries the page-made <c>idempotencyKey</c> (autoId; a retry returns the existing disposal), the acquisition
    /// posting is source-keyed and the return binds the assignment explicitly (<c>assignmentId</c>, <c>rowVersion</c>).
    /// Computed members outside the record constructors (net defter, aylık amortisman, ilerleme, getir-only fields) are declared
    /// only here. There is no zimmet write in v1 (the personnel picker belongs to İK) and no delete, edit or reversal at all.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildFixedAssets(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string assets = "/api/fixed-assets";
        const string asset = assets + "/{id}";
        const string assetRead = "duranVarlik.kiymet.getir";
        var id = Route("id");
        static ErpOperationColumn Col(string code, string type) => new(code, Label(code), type);
        static ErpOperationColumn[] Cols(params string[] specs) => specs.Select(x => x.Split(':')).Select(x => Col(x[0], x[1])).ToArray();
        // Shared codes whose shared label names another module's field keep their code here with a fixed-asset label.
        static ErpOperationColumn[] Relabel(IEnumerable<ErpOperationColumn> columns, params (string Code, string Label)[] labels) =>
            columns.Select(x => labels.FirstOrDefault(l => l.Code == x.Code) is { Label: { } label } ? x with { Label = label } : x).ToArray();

        var viewColumns = Columns<FixedAssetView>()
            .Concat(Cols("remainingBookValueBase:decimal", "monthlyDepreciationBase:decimal", "depreciatedMonths:int")).ToArray();
        var recordColumns = viewColumns.Concat(Cols("currentAssignee:text", "currentAssignmentId:guid", "purchaseInvoiceCode:text",
            "hasVukProfile:bool", "vukScheduleAssetId:guid", "isDisposed:bool", "disposalDate:date", "disposalReason:text",
            "disposalProceedsBase:decimal", "disposalBookValueBase:decimal", "disposalGainLossBase:decimal", "disposalJournalEntryId:guid")).ToArray();
        string[] scheduleMeta = ["assetId", "nextPeriodStart", "nextAmountBase"];
        var postingColumns = Cols("id:guid", "assetId:guid", "periodStart:date", "periodEnd:date", "amountBase:decimal", "journalEntryId:guid");

        // ---- Kıymet ----
        yield return Read(FixedAssetModule, "duranVarlik.kiymet.listele", "Duran varlıkları listele", assets,
            [Query("q", "text"), Query("status", "text"), .. paging],
            List(viewColumns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
        yield return Read(FixedAssetModule, "duranVarlik.kiymet.ozet", "Duran varlık özeti", assets + "/summary", [Query("q", "text")],
            Record(Relabel(Cols("count:int", "activeCount:int", "disposedCount:int", "acquisitionCostBase:decimal",
                "accumulatedDepreciationBase:decimal", "netBookValueBase:decimal", "currentMonthDepreciationEstimateBase:decimal"),
                ("activeCount", "Etkin kıymet"))));
        yield return Read(FixedAssetModule, assetRead, "Duran varlık getir", asset, [id], Record(recordColumns));
        // The legacy form never sends a supplier: the linked purchase invoice decides it on the server.
        yield return Write(FixedAssetModule, "duranVarlik.kiymet.olustur", "Duran varlık edinimini kaydet", "insert", "POST", assets,
            BodyParameters<FixedAssetCreateRequest>(sourceBacked: false, exclude: "supplierAccountId"), Record(viewColumns), null, null);
        yield return Read(FixedAssetModule, "duranVarlik.alisFaturalari", "Edinime bağlanabilir alış faturaları", assets + "/purchase-invoices", [],
            List(Relabel(Columns<FixedAssetPurchaseInvoiceOption>().Append(Col("label", "text")), ("label", "Fatura seçeneği")), null));
        yield return Read(FixedAssetModule, "duranVarlik.vukOmurKatalogu", "VUK faydalı ömür kataloğu", assets + "/vuk-useful-life-catalog",
            [Query("q", "text")], List(Columns<VukUsefulLifeCatalogEntry>(), "entries"));

        // ---- Edinim muhasebesi ----
        // One read: the journal lines are the rows, the entry and the linked invoice are meta (three states on the card).
        yield return Read(FixedAssetModule, "duranVarlik.edinim.muhasebe", "Duran varlık edinim muhasebesi", asset + "/acquisition-posting", [id],
            List(Columns<FixedAssetAcquisitionJournalLineView>(), "lines") with { MetaPaths = ["assetId", "purchaseInvoiceCode", "journalEntryId", "entryDate"] });
        yield return Write(FixedAssetModule, "duranVarlik.edinim.yevmiyele", "Duran varlık edinimini yevmiyeleştir", "insert", "POST", asset + "/acquisition-posting",
            [id, .. BodyParameters<FixedAssetAcquisitionPostingRequest>(sourceBacked: false)],
            Record(Relabel(Columns<FixedAssetAcquisitionPostingView>(), ("entryDate", "Fiş tarihi"))), null, null);

        // ---- Amortisman ----
        yield return Read(FixedAssetModule, "duranVarlik.amortisman.plani", "Duran varlık amortisman planı", asset + "/depreciation-schedule",
            [id, Query("through", "date")],
            List(Columns<DepreciationScheduleLine>(), "rows") with
            {
                MetaPaths = [.. scheduleMeta, "acquisitionCostBase", "residualValueBase", "accumulatedDepreciationBase"]
            });
        yield return Write(FixedAssetModule, "duranVarlik.amortisman.kaydet", "Duran varlık amortismanını kaydet", "insert", "POST", asset + "/depreciation-postings",
            [id, .. BodyParameters<FixedAssetDepreciationRequest>(sourceBacked: false)], Record(postingColumns), null, null);
        yield return Read(FixedAssetModule, "duranVarlik.vergiAmortismani.plani", "Duran varlık VUK vergi amortismanı planı", asset + "/tax-depreciation-schedule",
            [id, Query("through", "date")],
            List(Columns<DepreciationScheduleLine>(), "rows") with
            {
                MetaPaths = [.. scheduleMeta, "vukUsefulLifeCode", "vukUsefulLifeDescription", "vukUsefulLifeTableYear", "vukUsefulLifeCommuniqueNumber",
                    "vukUsefulLifeMonths", "annualRatePercent", "taxDepreciationStartDate", "isStatutoryFiling"]
            });
        yield return Write(FixedAssetModule, "duranVarlik.vergiAmortismani.kaydet", "Duran varlık VUK vergi amortismanını kaydet", "insert", "POST",
            asset + "/tax-depreciation-postings", [id, .. BodyParameters<FixedAssetDepreciationRequest>(sourceBacked: false)],
            Record(postingColumns.Append(Col("isStatutoryFiling", "bool")).ToArray()), null, null);

        // ---- Elden çıkarma ----
        yield return Write(FixedAssetModule, "duranVarlik.eldenCikarma.kaydet", "Duran varlığı elden çıkar", "insert", "POST", asset + "/disposals",
            [id, .. BodyParameters<FixedAssetDisposalRequest>(sourceBacked: false)],
            Record(Relabel(Columns<FixedAssetDisposalView>(), ("reason", "Açıklama"))), null, null);

        // ---- Zimmet ----
        yield return Read(FixedAssetModule, "duranVarlik.zimmet.listele", "Duran varlık zimmet geçmişi", asset + "/assignments", [id],
            List(Columns<AssetAssignmentView>(), null));
        yield return Write(FixedAssetModule, "duranVarlik.zimmet.iadeAl", "Duran varlık zimmetini iade al", "update", "POST",
            asset + "/assignments/{assignmentId}/return",
            [id, Route("assignmentId"), .. BodyParameters<AssetAssignmentReturnRequest>(sourceBacked: false)],
            Record(Cols("id:guid", "returnedDate:date", "rowVersion:text")), null, null);
    }

    /// <summary>Labels of Duran Varlık codes; null for an unknown code. The main <c>Labels</c> dictionary wins on shared codes.</summary>
    private static string? FixedAssetLabel(string code) => code switch
    {
        // Kıymet
        "assetId" => "Kıymet kimliği", "assetCode" => "Kıymet kodu", "acquisitionDate" => "Edinim tarihi", "inServiceDate" => "Kullanıma giriş",
        "acquisitionCostBase" => "Edinim maliyeti", "residualValueBase" => "Kalıntı değer", "usefulLifeMonths" => "Faydalı ömür (ay)",
        "accumulatedDepreciationBase" => "Birikmiş amortisman", "remainingBookValueBase" => "Net defter değeri",
        "monthlyDepreciationBase" => "Aylık amortisman", "depreciatedMonths" => "Amortisman ayrılan ay",
        "supplierAccountId" => "Tedarikçi kimliği", "sourceReference" => "Kaynak referansı", "purchaseInvoiceId" => "Bağlı alış faturası kimliği",
        "purchaseInvoiceCode" => "Bağlı alış faturası", "currentAssignee" => "Zimmet", "currentAssignmentId" => "Açık zimmet kimliği",
        "hasVukProfile" => "VUK profili var", "vukScheduleAssetId" => "VUK planı kıymet kimliği", "isDisposed" => "Elden çıkarıldı",
        // VUK
        "vukTaxYear" => "VUK yılı", "vukDepreciationLowerLimitTry" => "VUK alt sınırı (TL)", "vukCommuniqueNumber" => "VUK tebliği",
        "vukSourceUrl" => "VUK kaynağı", "vukUsefulLifeCode" => "VUK tablo kodu", "vukUsefulLifeDescription" => "VUK kıymet sınıfı",
        "vukUsefulLifeTableYear" => "VUK tablo yılı", "vukUsefulLifeCommuniqueNumber" => "VUK tablo tebliğ no", "vukUsefulLifeMonths" => "Vergi faydalı ömrü (ay)",
        "vukNormalDepreciationRatePercent" => "Normal amortisman oranı %", "vukTaxDepreciationStartDate" => "Vergi amortisman başlangıcı",
        "usefulLifeYears" => "Faydalı ömür (yıl)", "normalRatePercent" => "Normal amortisman oranı %", "communiqueNumber" => "Tebliğ no",
        "annualRatePercent" => "Yıllık oran %", "taxDepreciationStartDate" => "Vergi amortisman başlangıcı", "isStatutoryFiling" => "Yasal beyan",
        // Özet
        "count" => "Kıymet", "disposedCount" => "Elden çıkarılan", "netBookValueBase" => "Net defter değeri",
        "currentMonthDepreciationEstimateBase" => "Bu ay amortisman (tahmin)",
        // Alış faturası seçeneği
        "supplierId" => "Tedarikçi kimliği", "invoiceDate" => "Fatura tarihi", "grandTotal" => "Genel toplam",
        // Edinim muhasebesi
        "offsetAccountId" => "Edinim karşı hesabı", "journalEntryId" => "Yevmiye fişi", "accountId" => "Hesap kimliği",
        "accountCode" => "Hesap kodu", "accountName" => "Hesap adı", "debit" => "Borç", "credit" => "Alacak",
        // Amortisman
        "periodStart" => "Dönem", "periodEnd" => "Dönem sonu", "isPosted" => "Kaydedildi", "through" => "Bitiş tarihi",
        "nextPeriodStart" => "Sıradaki dönem", "nextAmountBase" => "Sıradaki dönem tutarı",
        // Elden çıkarma
        "disposalDate" => "Elden çıkarma tarihi", "disposalReason" => "Elden çıkarma açıklaması", "proceedsBase" => "Tahsilat",
        "idempotencyKey" => "İşlem anahtarı", "postedAccumulatedDepreciationBase" => "Kayıtlı birikmiş amortisman",
        "scheduleAccumulatedDepreciationBase" => "Plana göre birikmiş amortisman", "bookValueBase" => "Defter değeri",
        "gainLossBase" => "Kâr / zarar", "scheduleThroughPeriod" => "Plan son dönemi", "disposedAt" => "Kayıt zamanı",
        "disposedByUserId" => "Kaydeden", "accountingTreatment" => "Muhasebe durumu", "disposalProceedsBase" => "Tahsilat",
        "disposalBookValueBase" => "Defter değeri", "disposalGainLossBase" => "Kâr / zarar", "disposalJournalEntryId" => "Elden çıkarma fişi",
        // Zimmet
        "employeeId" => "Personel kimliği", "employee" => "Personel", "assignedDate" => "Teslim", "returnedDate" => "İade",
        "location" => "Konum", "notes" => "Not", "assignmentId" => "Zimmet kimliği",
        _ => null
    };
}
