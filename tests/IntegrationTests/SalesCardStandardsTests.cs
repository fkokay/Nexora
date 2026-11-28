using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satış Aşama B: the engine additions in the page schema (the editableGrid fill engine shared with Satınalma Faz 2 — fillQuery /
/// fillColumns with "lookupCol@label" / lookupFills — calc:&lt;query&gt;:&lt;field&gt; columns, query runOn as component names + runDebounceMs, 16 columns, 40 queries,
/// 500 rows), the card operations and the card standards.
/// </summary>
public sealed class SalesCardStandardsTests
{
    private static JsonObject Definition(string key)
    {
        Assert.True(SystemPageStandards.TryGet(key, out var standard), key);
        var definition = JsonNode.Parse(standard.DefinitionJson)!.AsObject();
        if (key == "sales-purchase-order-create")
            definition["queries"]!.AsArray().Add(JsonNode.Parse("""{"id":"onizleme","name":"onizleme","kind":"read","operation":"satis.teklif.hesapla","runOn":["kalemler"],"parameters":[{"name":"lines","binding":"{{kalemler.satirlar}}","type":"list"}]}"""));
        return definition;
    }

    private static JsonObject Component(JsonObject definition, string id) =>
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id);

    private static JsonObject Props(JsonObject definition, string id) => Component(definition, id)["props"]!.AsObject();

    private static JsonObject Query(JsonObject definition, string id) =>
        definition["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id);

    private static JsonArray Strings(params string[] values) => new(values.Select(x => (JsonNode)JsonValue.Create(x)!).ToArray());

    private static void Valid(JsonObject definition)
    {
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error), error);
    }

    private static void Invalid(JsonObject definition, string fragment)
    {
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains(fragment, error);
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    [Fact]
    public void Card_operations_follow_their_endpoints()
    {
        foreach (var name in new[] { "satis.fatura.onizle", "satis.fatura.onizleVergileri", "satis.teklif.hesapla", "satis.teklif.hesaplaVergileri",
                     "satis.siparis.hesapla", "satis.siparis.hesaplaVergileri" })
        {
            var op = Op(name);
            Assert.Equal(("read", "read", "POST", "Satış"), (op.Kind, op.PageKind, op.Method, op.Module));
            Assert.EndsWith("/preview", op.Route);
            Assert.Equal(name.EndsWith("Vergileri") ? "taxes" : "lines", op.Result.RowsPath);
            Assert.Contains("grandTotal", op.Result.MetaPaths);
            Assert.Contains(op.Result.Columns, x => x.Code == (name.EndsWith("Vergileri") ? "rate" : "rowKey"));
        }
        Assert.Equal(("POST", "/api/sales/invoices"), (Op("satis.fatura.olustur").Method, Op("satis.fatura.olustur").Route));
        Assert.True(Op("satis.fatura.olustur").Parameters.Single(x => x.Name == "requestId").Required);
        Assert.Equal("datetime", Op("satis.fatura.olustur").Parameters.Single(x => x.Name == "eDocument.paymentDate").Type);
        Assert.Equal(21, Op("satis.fatura.olustur").Parameters.Count(x => x.Name.StartsWith("eDocument.", StringComparison.Ordinal)));
        Assert.Equal(("PUT", "/api/sales/quotes/{id}"), (Op("satis.teklif.guncelle").Method, Op("satis.teklif.guncelle").Route));
        Assert.DoesNotContain(Op("satis.teklif.guncelle").Parameters, x => x.Name is "revisesQuoteId" or "salesRequestId");
        Assert.Contains(Op("satis.teklif.olustur").Parameters, x => x.Name == "revisesQuoteId");
        Assert.Contains(Op("satis.teklif.getir").Result.Columns, x => x.Code == "prospectCustomerName") ;
        Assert.Equal("rates", Op("satis.kurlar").Result.RowsPath);
        Assert.Equal("/api/sales/quotes/exchange-rates", Op("satis.kurlar").Route);
        Assert.Equal("/api/sales/orders/{id}/deliveries", Op("satis.siparis.irsaliyeOlustur").Route);
        Assert.Equal(["orderLineNumber", "quantity", "unitCode", "storageLocationId", "unitPrice", "discountPercent", "vatPercent", "isFreeOfCharge"],
            Op("satis.siparis.irsaliyeOlustur").Parameters.Single(x => x.Name == "lines").Items!.Select(x => x.Code));
        Assert.Equal("satis.teklif.ozelAlanDegerleri", Op("satis.teklif.ozelAlanKaydet").BodyMap!.SourceOperation);
        Assert.Equal("satis.siparis.ozelAlanDegerleri", Op("satis.siparis.ozelAlanKaydet").BodyMap!.SourceOperation);
        Assert.Contains(Op("satinalma.faturaGirisi.mevzuatProfilleri").Result.Columns, x => x.Code == "isDefaultForDocuments");
        Assert.DoesNotContain(Op("satinalma.faturaGirisi.mevzuatProfilleri").Result.Columns, x => x.Code == "parametersJson");
        Assert.Equal("/api/hr/employees", Op("ik.personel.listele").Route);
    }

    // ---- Schema: fill engine on a card with computed (calc) columns ----

    [Fact]
    public void Fill_query_and_columns_are_checked_on_a_card()
    {
        JsonObject Page(Action<JsonObject, JsonObject> change)
        {
            var definition = Definition("sales-purchase-order-create");
            definition["queries"]!.AsArray().Add(JsonNode.Parse("""{"id":"kaynak","name":"kaynak","kind":"read","operation":"satis.teklif.satirlari","runOn":"load","parameters":[{"name":"id","binding":"{{sayfa.parametre.quoteId}}","type":"guid"}]}"""));
            change(definition, Props(definition, "kalemler"));
            return definition;
        }
        static JsonNode Map(string json) => JsonNode.Parse(json)!;
        Valid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"unitCode":"enteredUnitCode"}"""); }));
        Valid(Page((_, grid) => grid["fillQuery"] = "kaynak"));
        Valid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"stockItemId@label":"stockName"}"""); }));
        Invalid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"quantity@label":"stockName"}"""); }), "@label");
        Invalid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"stockItemId@label":"yokAlan"}"""); }), "sonucunda yok");
        Invalid(Page((_, grid) => grid["fillQuery"] = "olmayanSorgu"), "'fillQuery' sayfadaki bir okuma sorgusu");
        Invalid(Page((_, grid) => grid["fillQuery"] = "yok"), "'fillQuery' sayfadaki bir okuma sorgusu");
        Invalid(Page((definition, grid) =>
        {
            definition["queries"]!.AsArray().Add(JsonNode.Parse("""{"id":"kayit","name":"kayit","kind":"read","operation":"satis.teklif.getir","runOn":"load","parameters":[{"name":"id","binding":"{{sayfa.parametre.quoteId}}","type":"guid"}]}"""));
            grid["fillQuery"] = "kayit";
        }), "liste döndüren");
        Invalid(Page((_, grid) => grid["fillColumns"] = Map("""{"unitCode":"unitCode"}""")), "'fillColumns' yalnız 'fillQuery' ile");
        // A computed (calc) column comes from the preview: never a fill target.
        Invalid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"lineTotal":"lineTotal"}"""); }), "hesaplanan (calc)");
        Invalid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"yok":"unitCode"}"""); }), "ızgarada yok");
        Invalid(Page((_, grid) => { grid["fillQuery"] = "kaynak"; grid["fillColumns"] = Map("""{"unitCode":"olmayanAlan"}"""); }), "sonucunda yok");

        Valid(Page((_, grid) => grid["skipWhenZero"] = "quantity"));
        Invalid(Page((_, grid) => grid["skipWhenZero"] = "lineTotal"), "'skipWhenZero'");
        Invalid(Page((_, grid) => grid["skipWhenZero"] = "yok"), "'skipWhenZero'");
    }

    [Fact]
    public void Fill_and_skip_need_list_mode()
    {
        var definition = Definition("inventory-stock-create");
        var stage = definition["components"]!.AsArray().OfType<JsonObject>().FirstOrDefault(x => (string)x["type"]! == "editableGrid"
            && (string?)x["props"]!["gridMode"] == "stage");
        if (stage is null) return;
        var props = stage["props"]!.AsObject();
        props["fillQuery"] = (string)props["sourceQuery"]!;
        Invalid(definition, "'fillQuery' yalnız listeli (list) kipte");
        props.Remove("fillQuery");
        props["skipWhenZero"] = props["gridColumns"]!.AsArray()[0]!.GetValue<string>().Split('|')[0];
        Invalid(definition, "'skipWhenZero' yalnız listeli (list) kipte");
    }

    // ---- Schema: lookup fill on a card ----

    [Fact]
    public void Lookup_fills_are_checked_on_a_card()
    {
        JsonObject Page(string fills)
        {
            var definition = Definition("sales-purchase-order-create");
            Props(definition, "kalemler")["lookupFills"] = JsonNode.Parse(fills);
            return definition;
        }
        Valid(Page("""{"stockItemId":{"unitCode":"unitCode"}}"""));
        Invalid(Page("""{"quantity":{"unitCode":"unitCode"}}"""), "seçim (lookup) sütunu");
        Invalid(Page("""{"stockItemId":{"stockItemId":"id"}}"""), "hedefi");
        Invalid(Page("""{"stockItemId":{"lineTotal":"salesListPrice"}}"""), "hedefi");
        Invalid(Page("""{"stockItemId":{"yok":"salesListPrice"}}"""), "hedefi");
        Invalid(Page("""{"stockItemId":{"unitPrice":"olmayanAlan"}}"""), "sonucunda yok");
        Invalid(Page("""{"stockItemId":{"unitCode":""}}"""), "'lookupFills'");
    }

    // ---- Schema: E3 preview (runOn list, calc column) ----

    [Fact]
    public void Run_on_lists_and_debounce_are_checked()
    {
        var definition = Definition("sales-purchase-order-create");
        Query(definition, "onizleme")["runDebounceMs"] = 400;
        Valid(definition);
        Query(definition, "onizleme")["runDebounceMs"] = 100;
        Invalid(definition, "runDebounceMs");
        Query(definition, "onizleme")["runDebounceMs"] = 3001;
        Invalid(definition, "runDebounceMs");

        definition = Definition("sales-purchase-order-create");
        Query(definition, "depolar")["runDebounceMs"] = 400;
        Invalid(definition, "runDebounceMs yalnız runOn dizisiyle");

        definition = Definition("sales-purchase-order-create");
        Query(definition, "onizleme")["runOn"] = Strings("yokBilesen");
        Invalid(definition, "runOn dizisindeki 'yokBilesen'");
        Query(definition, "onizleme")["runOn"] = Strings("belgeKarti");
        Invalid(definition, "runOn dizisindeki 'belgeKarti'");
        Query(definition, "onizleme")["runOn"] = Strings("musteri", "musteri");
        Invalid(definition, "runOn dizisi");
        Query(definition, "onizleme")["runOn"] = new JsonArray();
        Invalid(definition, "runOn dizisi");

        definition = Definition("sales-purchase-order-create");
        Query(definition, "olustur")["runOn"] = Strings("musteri");
        Invalid(definition, "yalnız elle (manual)");
        definition = Definition("sales-purchase-order-create");
        Query(definition, "onizleme")["runOn"] = "sometimes";
        Invalid(definition, "runOn load, manual ya da bileşen adları dizisi");
    }

    [Fact]
    public void Calc_columns_need_a_row_keyed_preview_of_the_grid()
    {
        JsonObject Page(string column, Action<JsonObject>? change = null)
        {
            var definition = Definition("sales-purchase-order-create");
            var columns = Props(definition, "kalemler")["gridColumns"]!.AsArray();
            columns[^1] = column;
            change?.Invoke(definition);
            return definition;
        }
        Valid(Page("lineTotal|Tutar|calc:onizleme:taxAmount"));
        Invalid(Page("lineTotal|Tutar|calc:onizleme:lineTotal|readOnly"), "kural almaz");
        Invalid(Page("lineTotal|Tutar|calc:onizleme"), "calc:<sorgu>:<alan>");
        Invalid(Page("lineTotal|Tutar|calc:onizleme:olmayanAlan"), "rowKey ve 'olmayanAlan'");
        Invalid(Page("lineTotal|Tutar|calc:yok:lineTotal"), "ERP işlemi okuma sorgusu");
        Invalid(Page("lineTotal|Tutar|calc:stoklar:salesListPrice"), "rowKey alanlı bir list parametresini");
        // The preview must bind this grid's rows.
        Invalid(Page("lineTotal|Tutar|calc:onizleme:lineTotal", definition =>
            Query(definition, "onizleme")["parameters"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["name"]! == "lines")["binding"] = "{{baskaTablo.satirlar}}"),
            "düzenlenebilir tablo");
        // A calc column is never a total (not a number column).
        Invalid(Page("lineTotal|Tutar|calc:onizleme:lineTotal", definition => Props(definition, "kalemler")["totals"] = Strings("lineTotal")), "'totals'");
    }

    // ---- Schema: E4 limits ----

    [Fact]
    public void Grid_and_query_limits_are_raised()
    {
        JsonObject Grid(int columns, int maxRows = 10)
        {
            var props = new JsonObject { ["gridMode"] = "list", ["maxRows"] = maxRows,
                ["gridColumns"] = Strings(Enumerable.Range(1, columns).Select(i => $"c{i}|Sütun {i}|text").ToArray()) };
            return new JsonObject { ["schemaVersion"] = 2, ["queries"] = new JsonArray(),
                ["components"] = new JsonArray(new JsonObject { ["id"] = "g", ["type"] = "editableGrid", ["name"] = "g", ["props"] = props }) };
        }
        Valid(Grid(16));
        Invalid(Grid(17), "1–16 adet sütun");
        Valid(Grid(1, 500));
        Invalid(Grid(1, 501), "'maxRows' 1 ile 500");

        JsonObject Queries(int count) => new()
        {
            ["schemaVersion"] = 2, ["components"] = new JsonArray(),
            ["queries"] = new JsonArray(Enumerable.Range(1, count).Select(i => (JsonNode)new JsonObject
            {
                ["id"] = $"q{i}", ["name"] = $"q{i}", ["kind"] = "read", ["operation"] = "depo.listele", ["runOn"] = "load", ["parameters"] = new JsonArray()
            }).ToArray())
        };
        Valid(Queries(40));
        Invalid(Queries(41), "en fazla 40 sorgu");
    }

    [Fact]
    public void Calc_column_spec_is_parsed()
    {
        Assert.True(GridColumnSpec.TryParse("lineTotal|Tutar|calc:onizleme:lineTotal", out var code, out var type, out var lookup, out var calc, out _));
        Assert.Equal(("lineTotal", "calc", (GridColumnSpec.Lookup?)null, new GridColumnSpec.Calc("onizleme", "lineTotal")), (code, type, lookup, calc));
        Assert.True(GridColumnSpec.TryParse("t|T|calc:q-1:a.b", out _, out _, out _, out calc, out _));
        Assert.Equal("a.b", calc!.Field);
        foreach (var text in new[] { "a|A|calc:q", "a|A|calc:q:f:g", "a|A|calc:q q:f", "a|A|calc:q:f|readOnly", "a|A|calc::f", "a|A|calc:q:1f" })
            Assert.False(GridColumnSpec.TryParse(text, out _, out _, out _, out _), text);
    }
}
