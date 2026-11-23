using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satış Aşama B: the engine additions in the page schema (editableGrid initialRowsQuery / initialRowsMap / skipRowsWhenEmpty /
/// lookupFill, calc:&lt;query&gt;:&lt;field&gt; columns, query runOn as component names + runDebounceMs, 16 columns, 40 queries,
/// 500 rows), the card operations and the card standards.
/// </summary>
public sealed class SalesCardStandardsTests
{
    private static JsonObject Definition(string key)
    {
        Assert.True(SystemPageStandards.TryGet(key, out var standard), key);
        return JsonNode.Parse(standard.DefinitionJson)!.AsObject();
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

    // ---- Invoice card ----

    [Fact]
    public void Invoice_card_uses_the_engine_additions()
    {
        var definition = Definition("sales-invoice-create");
        Valid(definition);
        var grid = Props(definition, "kalemler");
        Assert.Contains("lineTotal|Tutar|calc:onizleme:lineTotal", grid["gridColumns"]!.AsArray().Select(x => (string)x!));
        Assert.Contains("stockItemId:unitPrice=salesListPrice", grid["lookupFill"]!.AsArray().Select(x => (string)x!));
        Assert.Equal(200, (int)grid["maxRows"]!);
        var preview = Query(definition, "onizleme");
        Assert.Equal(("read", "satis.fatura.onizle"), ((string)preview["kind"]!, (string)preview["operation"]!));
        Assert.Contains("kalemler", preview["runOn"]!.AsArray().Select(x => (string)x!));
        // The header warehouse is the first line's warehouse (G-SI6: the server issues stock from the header warehouse).
        Assert.Equal("{{kalemler.satirlar[0].warehouseId}}", (string)Query(definition, "faturaKes")["parameters"]!.AsArray()
            .OfType<JsonObject>().Single(x => (string)x["name"]! == "warehouseId")["binding"]!);
        // The save body is the user's inputs: the write's line items have no rowKey, so the runtime never sends it there.
        Assert.DoesNotContain(Op("satis.fatura.olustur").Parameters.Single(x => x.Name == "lines").Items!, x => x.Code == "rowKey");
        Assert.Contains(Op("satis.fatura.onizle").Parameters.Single(x => x.Name == "lines").Items!, x => x.Code == "rowKey");
        // P3: the list keeps opening the legacy card until the G-SI6 server fix.
        var yeni = Props(Definition("sales-invoices"), "yeniDugmesi");
        Assert.True((bool)yeni["legacyScreen"]!);
    }

    // ---- Order card ----

    [Fact]
    public void Order_card_edits_from_the_order_and_previews_its_amounts()
    {
        var definition = Definition("sales-order-create");
        Valid(definition);
        var grid = Props(definition, "kalemler");
        Assert.Equal("kalemKaynak", (string)grid["initialRowsQuery"]!);
        Assert.Equal(("satis.siparis.kalemleri", "{{sayfa.parametre.orderId}}"), ((string)Query(definition, "kalemKaynak")["operation"]!,
            (string)Query(definition, "kalemKaynak")["parameters"]![0]!["binding"]!));
        Assert.Contains("unitPrice=enteredUnitPrice", grid["initialRowsMap"]!.AsArray().Select(x => (string)x!));
        Assert.Equal(4, grid["gridColumns"]!.AsArray().Count(x => ((string)x!).Contains("|calc:onizleme:", StringComparison.Ordinal)));
        Assert.Equal(["olustur", "guncelle"], Props(definition, "komutlar")["saveSequence"]!.AsArray().Select(x => (string)x!));
        Assert.Equal("{{musteriKarti.rows[0].currencyCode}}", (string)Query(definition, "olustur")["parameters"]!.AsArray().OfType<JsonObject>()
            .Single(x => (string)x["name"]! == "currencyCode")["binding"]!);
        // The preview takes the customer's currency itself; it does not wait for the customer read.
        Assert.False(Op("satis.siparis.hesapla").Parameters.Single(x => x.Name == "currencyCode").Required);
        Assert.DoesNotContain(Query(definition, "onizleme")["parameters"]!.AsArray().OfType<JsonObject>(), x => (string)x["name"]! == "currencyCode");
        // The list sends what the card's header defaults read (the engine has no "from the record, else" default).
        var orders = Definition("sales-orders");
        Assert.Contains("orderDate={{bugun}}", Props(orders, "yeniDugmesi")["params"]!.AsArray().Select(x => (string)x!));
        Assert.Equal(["orderId={{liste.seciliSatir.id}}", "customerId={{liste.seciliSatir.customerId}}", "orderDate={{liste.seciliSatir.orderDate}}"],
            Props(orders, "duzenleDugmesi")["params"]!.AsArray().Select(x => (string)x!));
        Assert.True(SystemPageStandards.TryGet("sales-order-create", out var standard));
        Assert.Equal((1, "preview"), (standard.Version, standard.Stage));
    }

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
        Assert.Equal(Op("satis.kurlar").Route, Op("satis.teklif.kurlar").Route);
        Assert.Equal("/api/sales/orders/{id}/deliveries", Op("satis.siparis.irsaliyeOlustur").Route);
        Assert.Equal(["orderLineNumber", "quantity", "unitCode", "storageLocationId"],
            Op("satis.siparis.irsaliyeOlustur").Parameters.Single(x => x.Name == "lines").Items!.Select(x => x.Code));
        Assert.Equal("satis.teklif.ozelAlanDegerleri", Op("satis.teklif.ozelAlanKaydet").BodyMap!.SourceOperation);
        Assert.Equal("satis.siparis.ozelAlanDegerleri", Op("satis.siparis.ozelAlanKaydet").BodyMap!.SourceOperation);
        Assert.Contains(Op("muhasebe.vergiProfilleri").Result.Columns, x => x.Code == "isDefaultForDocuments");
        Assert.DoesNotContain(Op("muhasebe.vergiProfilleri").Result.Columns, x => x.Code == "parametersJson");
        Assert.Equal("/api/hr/employees", Op("ik.personel").Route);
    }

    // ---- Schema: E1 initial rows, skip empty rows ----

    [Fact]
    public void Initial_rows_query_and_map_are_checked()
    {
        JsonObject Page(Action<JsonObject, JsonObject> change)
        {
            var definition = Definition("sales-invoice-create");
            definition["queries"]!.AsArray().Add(JsonNode.Parse("""{"id":"kaynak","name":"kaynak","kind":"read","operation":"satis.teklif.satirlari","runOn":"load","parameters":[{"name":"id","binding":"{{sayfa.parametre.quoteId}}","type":"guid"}]}"""));
            change(definition, Props(definition, "kalemler"));
            return definition;
        }
        Valid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("unitCode=enteredUnitCode"); }));
        Valid(Page((_, grid) => grid["initialRowsQuery"] = "kaynak"));
        Valid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("stockItemId@label=stockName"); }));
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("quantity@label=stockName"); }), "@label");
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("stockItemId@label=yokAlan"); }), "sonucunda yok");
        Invalid(Page((_, grid) => grid["initialRowsQuery"] = "faturaKes"), "'initialRowsQuery' sayfadaki bir okuma sorgusu");
        Invalid(Page((_, grid) => grid["initialRowsQuery"] = "yok"), "'initialRowsQuery' sayfadaki bir okuma sorgusu");
        Invalid(Page((definition, grid) =>
        {
            definition["queries"]!.AsArray().Add(JsonNode.Parse("""{"id":"kayit","name":"kayit","kind":"read","operation":"satis.teklif.getir","runOn":"load","parameters":[{"name":"id","binding":"{{sayfa.parametre.quoteId}}","type":"guid"}]}"""));
            grid["initialRowsQuery"] = "kayit";
        }), "liste döndüren");
        Invalid(Page((_, grid) => grid["initialRowsMap"] = Strings("unitCode=unitCode")), "'initialRowsMap' yalnız 'initialRowsQuery' ile");
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("lineTotal=lineTotal"); }), "hesaplanmayan");
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("yok=unitCode"); }), "hesaplanmayan");
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("unitCode=olmayanAlan"); }), "sonucunda yok");
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("unitCode=unitCode", "unitCode=stockCode"); }), "bir kez");
        Invalid(Page((_, grid) => { grid["initialRowsQuery"] = "kaynak"; grid["initialRowsMap"] = Strings("unitCode"); }), "hücre=kaynakAlan");

        Valid(Page((_, grid) => grid["skipRowsWhenEmpty"] = "quantity"));
        Invalid(Page((_, grid) => grid["skipRowsWhenEmpty"] = "lineTotal"), "'skipRowsWhenEmpty'");
        Invalid(Page((_, grid) => grid["skipRowsWhenEmpty"] = "yok"), "'skipRowsWhenEmpty'");
    }

    [Fact]
    public void Initial_rows_and_skip_need_list_mode()
    {
        var definition = Definition("inventory-stock-create");
        var stage = definition["components"]!.AsArray().OfType<JsonObject>().FirstOrDefault(x => (string)x["type"]! == "editableGrid"
            && (string?)x["props"]!["gridMode"] == "stage");
        if (stage is null) return;
        var props = stage["props"]!.AsObject();
        props["initialRowsQuery"] = (string)props["sourceQuery"]!;
        Invalid(definition, "'initialRowsQuery' yalnız list kipinde");
        props.Remove("initialRowsQuery");
        props["skipRowsWhenEmpty"] = props["gridColumns"]!.AsArray()[0]!.GetValue<string>().Split('|')[0];
        Invalid(definition, "'skipRowsWhenEmpty' yalnız list kipinde");
    }

    // ---- Schema: E2 lookup fill ----

    [Fact]
    public void Lookup_fill_items_are_checked()
    {
        JsonObject Page(params string[] fill)
        {
            var definition = Definition("sales-invoice-create");
            Props(definition, "kalemler")["lookupFill"] = Strings(fill);
            return definition;
        }
        Valid(Page("stockItemId:unitCode=unitCode", "warehouseId:unitCode=code"));
        Invalid(Page("quantity:unitCode=unitCode"), "seçim (lookup) sütunu");
        Invalid(Page("stockItemId:stockItemId=id"), "hedefi");
        Invalid(Page("stockItemId:lineTotal=salesListPrice"), "hedefi");
        Invalid(Page("stockItemId:yok=salesListPrice"), "hedefi");
        Invalid(Page("stockItemId:unitPrice=olmayanAlan"), "sonucunda yok");
        Invalid(Page("stockItemId:unitPrice=salesListPrice", "stockItemId:unitPrice=purchaseListPrice"), "bir kez");
        Invalid(Page("stockItemId=unitCode"), "seçimSütunu:hedefSütun=seçenekAlanı");
        Invalid(Page("stockItemId:unitCode="), "seçenek alanı geçersiz");
    }

    // ---- Schema: E3 preview (runOn list, calc column) ----

    [Fact]
    public void Run_on_lists_and_debounce_are_checked()
    {
        var definition = Definition("sales-invoice-create");
        Query(definition, "onizleme")["runDebounceMs"] = 400;
        Valid(definition);
        Query(definition, "onizleme")["runDebounceMs"] = 100;
        Invalid(definition, "runDebounceMs");
        Query(definition, "onizleme")["runDebounceMs"] = 3001;
        Invalid(definition, "runDebounceMs");

        definition = Definition("sales-invoice-create");
        Query(definition, "profiller")["runDebounceMs"] = 400;
        Invalid(definition, "runDebounceMs yalnız runOn dizisiyle");

        definition = Definition("sales-invoice-create");
        Query(definition, "onizleme")["runOn"] = Strings("yokBilesen");
        Invalid(definition, "runOn dizisindeki 'yokBilesen'");
        Query(definition, "onizleme")["runOn"] = Strings("belgeKarti");
        Invalid(definition, "runOn dizisindeki 'belgeKarti'");
        Query(definition, "onizleme")["runOn"] = Strings("musteri", "musteri");
        Invalid(definition, "runOn dizisi");
        Query(definition, "onizleme")["runOn"] = new JsonArray();
        Invalid(definition, "runOn dizisi");

        definition = Definition("sales-invoice-create");
        Query(definition, "faturaKes")["runOn"] = Strings("musteri");
        Invalid(definition, "yalnız elle (manual)");
        definition = Definition("sales-invoice-create");
        Query(definition, "onizleme")["runOn"] = "sometimes";
        Invalid(definition, "runOn load, manual ya da bileşen adları dizisi");
    }

    [Fact]
    public void Calc_columns_need_a_row_keyed_preview_of_the_grid()
    {
        JsonObject Page(string column, Action<JsonObject>? change = null)
        {
            var definition = Definition("sales-invoice-create");
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
