namespace AIERP.Api;

// Dış Ticaret system pages (taslak 26): foreign trade cases list and the case card (new + edit). Kept in its own partial file
// so other modules' catalog changes do not collide. No static fields here (see ErpOperationCatalog.Purchasing.cs).
internal static partial class ErpOperationCatalog
{
    private const string ForeignTradeModule = "Dış Ticaret";

    /// <summary>
    /// Foreign trade cases. Stage changes are one fixed-body operation per target status on POST …/transition (execute), so a
    /// page never binds the status; the API keeps every transition rule (ship prerequisites, customs reference, linked stock
    /// documents, actual dates not in the future). The view's display members (order code, counterparty, route, ship and
    /// arrival date) are computed outside the record constructor and declared only here. Order options keep the legacy
    /// endpoint: one operation per direction with a fixed query.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildForeignTrade(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string casesRoute = "/api/foreign-trade/cases";
        const string caseRoute = casesRoute + "/{id}";
        const string caseRead = "disTicaret.dosya.getir";
        var id = Route("id");
        var columns = Columns<ForeignTradeCaseView>()
            .Concat(new[] { "orderCode:text", "counterpartyName:text", "route:text", "shipDate:date", "arrivalDate:date" }
                .Select(x => x.Split(':')).Select(x => new ErpOperationColumn(x[0], Label(x[0]), x[1]))).ToArray();
        // The shared "totalCount" label belongs to the cari list; the summary names its own.
        var summaryColumns = Columns<ForeignTradeCaseSummary>().Select(x => x.Code == "totalCount" ? x with { Label = "Dosya" } : x).ToArray();
        static Dictionary<string, object?> Status(string status) => new(StringComparer.Ordinal) { ["status"] = status };
        static Dictionary<string, object?> Direction(string direction) => new(StringComparer.Ordinal) { ["direction"] = direction };
        IReadOnlyList<ErpOperationParameter> Transition(params string[] body) =>
            [id, .. BodyParameters<ForeignTradeTransitionRequest>(sourceBacked: false).Where(x => body.Contains(x.Name, StringComparer.Ordinal))];

        yield return Read(ForeignTradeModule, "disTicaret.dosya.listele", "Dış ticaret dosyalarını listele", casesRoute,
            [Query("q", "text"), Query("direction", "text"), Query("status", "text"), .. paging],
            List(columns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
        yield return Read(ForeignTradeModule, caseRead, "Dış ticaret dosyası getir", caseRoute, [id], Record(columns));
        yield return Read(ForeignTradeModule, "disTicaret.dosya.ozet", "Dış ticaret dosyası özeti", casesRoute + "/summary", [Query("q", "text")],
            Record(summaryColumns));
        // declaredValue may be left empty: the API then writes the linked order's grand total. The HS code may contain dots.
        yield return Write(ForeignTradeModule, "disTicaret.dosya.olustur", "Dış ticaret dosyası oluştur", "insert", "POST", casesRoute,
            BodyParameters<ForeignTradeCaseWriteRequest>(sourceBacked: false), Record(columns), null, null);
        // PUT replaces the case: unbound fields come from disTicaret.dosya.getir; direction and order cannot change.
        yield return Write(ForeignTradeModule, "disTicaret.dosya.guncelle", "Dış ticaret dosyasını güncelle", "update", "PUT", caseRoute,
            [id, .. BodyParameters<ForeignTradeCaseWriteRequest>(sourceBacked: true)], Record(columns), caseRead, null);
        foreach (var (name, label, status, body) in new (string, string, string, string[])[]
                 {
                     ("disTicaret.dosya.planla", "Dış ticaret dosyasını Planlandı aşamasına geçir", "Booked", []),
                     ("disTicaret.dosya.sevkEt", "Dış ticaret dosyasını Sevkte aşamasına geçir", "Shipped", ["actualDate", "carrierReference"]),
                     ("disTicaret.dosya.gumrugeGecir", "Dış ticaret dosyasını Gümrükte aşamasına geçir", "CustomsClearance", ["customsReference"]),
                     ("disTicaret.dosya.varisKaydet", "Dış ticaret dosyasının varışını kaydet", "Arrived", ["actualDate"]),
                     ("disTicaret.dosya.kapat", "Dış ticaret dosyasını kapat", "Closed", []),
                     ("disTicaret.dosya.iptalEt", "Dış ticaret dosyasını iptal et", "Cancelled", []),
                 })
            yield return Write(ForeignTradeModule, name, label, "update", "POST", caseRoute + "/transition", Transition(body), Record(columns), null,
                Status(status));
        yield return Read(ForeignTradeModule, "disTicaret.dosya.stokBelgeleri", "Dış ticaret dosyasına bağlanabilir stok belgeleri",
            caseRoute + "/inventory-documents", [id], List(Columns<ForeignTradeInventoryDocumentOption>(), null));
        // Links an existing posted receipt (import) or delivery (export); nothing is posted to stock again. Resolves to execute.
        yield return Write(ForeignTradeModule, "disTicaret.dosya.stokBelgesiBagla", "Dış ticaret dosyasına stok belgesi bağla", "update", "POST",
            caseRoute + "/inventory-document", [id, .. BodyParameters<ForeignTradeInventoryDocumentRequest>(sourceBacked: false)], Record(columns), null, null);
        var orderColumns = Columns<ForeignTradeOrderOption>();
        yield return Read(ForeignTradeModule, "disTicaret.siparis.ithalatSecenekleri", "İthalat dosyası için satınalma siparişleri", "/api/foreign-trade/orders",
            [], List(orderColumns, null)) with { FixedQuery = Direction("Import") };
        yield return Read(ForeignTradeModule, "disTicaret.siparis.ihracatSecenekleri", "İhracat dosyası için satış siparişleri", "/api/foreign-trade/orders",
            [], List(orderColumns, null)) with { FixedQuery = Direction("Export") };
    }
}
