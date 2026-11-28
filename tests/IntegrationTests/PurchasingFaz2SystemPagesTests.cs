using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satınalma system pages, Faz 2 (draft 21, line-document writes) for the request and order standards: the new
/// sales-purchase-order-create form, sales-requests v3 (create request, quote entry, order from request or quote) and
/// sales-purchasing v3 (goods receipt from the order's remaining lines). Checks the line grids against the bound write
/// operations and the grid engine props (fillQuery, fillColumns, skipWhenZero, lookupFills, formulas).
/// </summary>
public sealed class PurchasingFaz2SystemPagesTests
{
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    private static readonly string[] Keys = ["sales-purchase-order-create", "sales-requests", "sales-purchasing"];
    private static readonly Dictionary<string, int> Versions = new(StringComparer.Ordinal)
    {
        ["sales-purchase-order-create"] = 1, ["sales-requests"] = 3, ["sales-purchasing"] = 3,
    };

    /// <summary>Every line grid of these pages: grid → (page, write query, fill query or null).</summary>
    private static readonly (string Key, string Grid, string Write, string? Fill)[] LineGrids =
    [
        ("sales-purchase-order-create", "kalemler", "olustur", null),
        ("sales-requests", "talepKalemleri", "talepOlustur", null),
        ("sales-requests", "teklifKalemleri", "teklifKaydet", "kalemler"),
        ("sales-requests", "siparisKalemleri", "siparisOlustur", "kalemler"),
        ("sales-requests", "teklifSiparisKalemleri", "teklifliSiparisOlustur", "teklifKalemKaynak"),
        ("sales-purchasing", "kabulKalemleri", "malKabulOlustur", "kabulKaynak"),
    ];

    // ---- Envelopes ----

    [Fact]
    public void Own_standards_validate_on_their_own_with_every_restricted_version()
    {
        // Envelope, items (every since ≤ version and complete requires), screen views, schema and each restricted version.
        var files = SystemPageStandards.EmbeddedFiles().Where(x => Keys.Contains(Path.GetFileNameWithoutExtension(x.FileName))).ToArray();
        Assert.Equal(Keys.Length, files.Length);
        Assert.Empty(SystemPageStandards.Validate(files));
        foreach (var key in Keys)
        {
            var standard = Mine[key];
            Assert.Equal((Versions[key], "preview", "Satın Alma"), (standard.Version, standard.Stage, standard.Module));
            for (var k = 1; k <= standard.Version; k++)
                Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var error), $"{key} v{k}: {error}");
            Assert.True(Queries(key).Count() <= 30, key);
            Assert.All(AllComponents(Definition(key)), x => Assert.True(((JsonObject?)x["props"])?.Count is null or <= 30, (string)x["id"]!));
        }
    }

    [Fact]
    public void Request_and_order_list_items_are_versioned_and_the_order_form_is_a_purchasing_menu_page()
    {
        foreach (var key in new[] { "sales-requests", "sales-purchasing" })
        {
            var faz1 = Faz1Ids[key];
            foreach (var item in Mine[key].Items)
            {
                var v3 = key == "sales-requests"
                    ? new HashSet<string>(["component:talepDetayPenceresi", "component:talepDetayBasligi", "component:talepDetaySekmeleri"])
                    : new HashSet<string>(["component:siparisDetayPenceresi", "component:siparisDetayBasligi", "component:siparisDetaySekmeleri"]);
                Assert.True(item.Since == (v3.Contains(item.Key) ? 3 : faz1.Contains(item.Key) ? 1 : 2), $"{key}: {item.Key} since {item.Since}");
            }
        }
        Assert.All(Mine["sales-purchase-order-create"].Items, x => Assert.Equal(1, x.Since));
        Assert.Contains("sales-purchase-order-create", StandardMenuEndpoints.PageKeys);
        Assert.Contains("sales-purchase-order-create", StandardMenuEndpoints.NavigablePageKeys);
        Assert.Equal("Yeni satınalma siparişi", Mine["sales-purchase-order-create"].Title);
        Assert.Empty(Mine["sales-purchase-order-create"].ScreenViews);
    }

    [Theory]
    [InlineData("sales-purchase-order-create")]
    [InlineData("sales-requests")]
    [InlineData("sales-purchasing")]
    public void Queries_bind_catalog_operations_with_every_required_parameter(string key)
    {
        foreach (var query in Queries(key))
        {
            var name = (string)query["operation"]!;
            var op = Op(name);
            Assert.False(op.Deprecated, name);
            Assert.Equal(op.Kind == "read" ? "read" : op.PageKind, (string)query["kind"]!);
            var bound = query["parameters"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["name"]!, x => (string)x["type"]!);
            foreach (var (parameter, type) in bound)
            {
                var declared = op.Parameters.SingleOrDefault(x => x.Name == parameter);
                Assert.True(declared is not null, $"{key}/{query["id"]}: {name} parametresi yok: {parameter}");
                Assert.Equal(declared.Type, type);
            }
            foreach (var required in op.Parameters.Where(x => x.Required))
                Assert.True(bound.ContainsKey(required.Name), $"{key}/{query["id"]}: zorunlu {required.Name} bağlanmadı");
        }
    }

    // ---- Line grids ----

    [Fact]
    public void Line_grids_send_every_required_item_and_keep_display_columns_out_of_the_body()
    {
        foreach (var (key, gridId, writeId, fillId) in LineGrids)
        {
            var grid = Props(key, gridId);
            Assert.Equal("list", (string)grid["gridMode"]!);
            var write = Query(key, writeId);
            var lines = write["parameters"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["type"]! == "list");
            Assert.Equal($"{{{{{gridId}.satirlar}}}}", (string)lines["binding"]!);
            var items = Op((string)write["operation"]!).Parameters.Single(x => x.Name == (string)lines["name"]!).Items!;
            var columns = GridColumns(grid);
            var formulas = MapOf(grid["formulas"]);
            // Every required item is a grid column; it is filled, entered or (when readOnly) copied from the fill source.
            foreach (var item in items.Where(x => x.Required))
                Assert.True(columns.ContainsKey(item.Code), $"{key}/{gridId}: zorunlu alan sütun değil: {item.Code}");
            foreach (var (code, rules) in columns)
            {
                var sent = items.Any(x => x.Code == code);
                // A column the write does not take is display-only: readOnly or a formula (the runtime leaves it out).
                if (!sent) Assert.True(rules.Contains("readOnly") || formulas.ContainsKey(code), $"{key}/{gridId}: {code} gönderilmiyor ama düzenlenebilir");
                if (sent && rules.Contains("readOnly"))
                    Assert.True(fillId is not null && (FillSource(grid, code) is { } source && Columns(key, fillId).Contains(source)),
                        $"{key}/{gridId}: salt okunur gönderilen {code} doldurma kaynağından gelmiyor");
            }
            if (fillId is null)
            {
                Assert.Null(grid["fillQuery"]);
                continue;
            }
            Assert.Equal(fillId, (string)grid["fillQuery"]!);
            Assert.Equal("read", (string)Query(key, fillId)["kind"]!);
            // A fill can exceed maxRows (then a validation error): the grids allow the engine maximum.
            Assert.Equal(200, (int)grid["maxRows"]!);
            foreach (var (target, source) in MapOf(grid["fillColumns"]))
            {
                Assert.True(columns.ContainsKey(target), $"{key}/{gridId}: {target}");
                Assert.Contains(source, Columns(key, fillId));
            }
            // After a save the grid re-fills from its source: the dialog refreshes the fill query.
            var dialog = AllComponents(Definition(key)).Single(x => (string)x["type"]! == "dialog" && (string?)x["props"]?["saveQuery"] == writeId);
            Assert.Contains(gridId, Strings(dialog["props"]!["contains"]));
            Assert.Contains(fillId, Strings(dialog["props"]!["refreshQueries"]));
        }
    }

    [Fact]
    public void List_template_windows_keep_simple_line_inputs_and_leave_totals_to_the_server()
    {
        foreach (var (key, gridId) in new[] { ("sales-requests", "teklifKalemleri"), ("sales-requests", "siparisKalemleri"),
                     ("sales-requests", "teklifSiparisKalemleri"), ("sales-purchasing", "kabulKalemleri") })
        {
            var props = Props(key, gridId);
            Assert.InRange(Strings(props["gridColumns"]).Length, 1, 8);
            Assert.Null(props["formulas"]);
            Assert.Null(props["totals"]);
        }
        Assert.Contains("unitCode", GridColumns(Props("sales-requests", "talepKalemleri")).Keys);
        Assert.Null(Props("sales-requests", "talepKalemleri")["lookupFills"]);
    }

    // ---- sales-purchase-order-create ----

    [Fact]
    public void Order_form_saves_the_header_and_lines_then_opens_the_created_order()
    {
        const string key = "sales-purchase-order-create";
        var bar = Props(key, "komutlar");
        Assert.Equal(("olustur", "siparisiAcDugmesi"), ((string)bar["saveQuery"]!, (string)bar["afterSaveButton"]!));
        Assert.Equal(new[] { "new", "open", "delete", "filter", "print", "export" }, Strings(bar["hiddenCommands"]));
        var open = Props(key, "siparisiAcDugmesi");
        Assert.Equal(("erpPage", "sales-purchasing", "purchaseOrderId={{olustur.sonuc.id}}"),
            ((string)open["actionType"]!, (string)open["pageKey"]!, Strings(open["params"]).Single()));
        Assert.Null(open["legacyScreen"]);
        Assert.Contains("id", Op("satinalma.siparis.olustur").Result.Columns.Select(x => x.Code));

        var save = Query(key, "olustur");
        Assert.Equal(("insert", "satinalma.siparis.olustur"), ((string)save["kind"]!, (string)save["operation"]!));
        Assert.Equal(new Dictionary<string, string>
        {
            ["code"] = "{{siparisNo.value}}", ["supplierId"] = "{{tedarikci.value}}", ["orderDate"] = "{{siparisTarihi.value}}",
            ["currencyCode"] = "{{doviz.value}}", ["notes"] = "{{siparisNotu.value}}", ["expectedReceiptDate"] = "{{teslimTarihi.value}}",
            ["targetWarehouseId"] = "{{depo.value}}", ["lines"] = "{{kalemler.satirlar}}",
        }, Bindings(save));
        // No body requestId on the order write: the unique order code is the duplicate guard (409).
        Assert.DoesNotContain(Op("satinalma.siparis.olustur").Parameters, x => x.Name == "requestId");
        foreach (var input in new[] { "tedarikci", "siparisNo", "doviz", "siparisTarihi" })
            Assert.True(Props(key, input)["required"]!.GetValue<bool>(), input);
        // The order currency must be the supplier's: it follows the picked supplier row until edited.
        Assert.Equal("{{tedarikci.seciliSatir.currencyCode}}", (string)Props(key, "doviz")["defaultValue"]!);
        Assert.Contains("currencyCode", Columns(key, "tedarikciler"));
        AssertSupplierPicker(key, "tedarikciler", "tedarikci");
        Assert.Equal(1, (int)Props(key, "kalemler")["minRows"]!);
    }

    // ---- sales-purchasing v3: goods receipt ----

    [Fact]
    public void Goods_receipt_fills_the_remaining_order_lines_and_skips_zero_quantities()
    {
        const string key = "sales-purchasing";
        var grid = Props(key, "kabulKalemleri");
        Assert.Equal(("kabulKaynak", "quantity"), ((string)grid["fillQuery"]!, (string)grid["skipWhenZero"]!));
        // F2-17: the source also has quantity (ordered); the grid's quantity must come from remainingQuantity.
        Assert.Equal("remainingQuantity", MapOf(grid["fillColumns"])["quantity"]);
        // The order lines read (the retired satinalma.malKabul.siparisSatirlari was its duplicate).
        Assert.Equal(("satinalma.siparis.satirlari", "{{liste.seciliSatir.id}}"),
            ((string)Query(key, "kabulKaynak")["operation"]!, Bindings(Query(key, "kabulKaynak"))["id"]));
        Assert.Contains("trackingMode", GridColumns(grid).Keys);
        Assert.InRange(Strings(grid["gridColumns"]).Length, 1, 8);
        Assert.Null(grid["formulas"]);
        Assert.Null(grid["lockColumnsWhen"]);
        // Line prices are derived from the purchase order by the API; this compact window does not expose client-side totals.
        var columns = GridColumns(grid);
        Assert.Contains("quantity", columns.Keys);
        Assert.DoesNotContain("unitPrice", columns.Keys);

        var save = Query(key, "malKabulOlustur");
        Assert.Equal(new Dictionary<string, string>
        {
            ["id"] = "{{liste.seciliSatir.id}}", ["requestId"] = "{{kabulIstekKimligi.value}}", ["warehouseId"] = "{{kabulDepo.value}}",
            ["receiptDate"] = "{{kabulTarihi.value}}", ["lines"] = "{{kabulKalemleri.satirlar}}",
        }, Bindings(save));
        var requestId = Props(key, "kabulIstekKimligi");
        Assert.True(requestId["autoId"]!.GetValue<bool>() && requestId["hidden"]!.GetValue<bool>());
        var dialog = Props(key, "malKabulPenceresi");
        Assert.True(dialog["resetOnOpen"]!.GetValue<bool>() && dialog["closeOnSave"]!.GetValue<bool>());
        Assert.Contains("kabulIstekKimligi", Strings(dialog["contains"]));
        Assert.Superset(new HashSet<string>(["siparis", "satirlar", "malKabuller", "kabulKaynak", "siparisler"]), new HashSet<string>(Strings(dialog["refreshQueries"])));
        Assert.Equal("{{siparis.rows[0].targetWarehouseId}}", (string)Props(key, "kabulDepo")["defaultValue"]!);

        // The document opens the dialog; the list and panel commands open the order document first (one fill source).
        Assert.Equal(("openDialog", "malKabulPenceresi"), ((string)Props(key, "malKabulDugmesi")["actionType"]!, (string)Props(key, "malKabulDugmesi")["dialogId"]!));
        // The current receipt endpoint is order-bound and the list grid cannot serialize nested tracking allocations.
        Assert.Contains("izlemeliKabulDugmesi", Strings(dialog["contains"]));
        var create = Props(key, "yeniSiparisDugmesi");
        Assert.Equal(("erpPage", "sales-purchase-order-create"), ((string)create["actionType"]!, (string)create["pageKey"]!));
        Assert.Null(create["legacyScreen"]);
    }

    // ---- sales-requests v3 ----

    [Fact]
    public void Request_create_dialog_posts_the_lines_without_a_request_key()
    {
        const string key = "sales-requests";
        Assert.Equal(("openDialog", "yeniTalepPenceresi"), ((string)Props(key, "yeniTalepDugmesi")["actionType"]!, (string)Props(key, "yeniTalepDugmesi")["dialogId"]!));
        Assert.Equal(new Dictionary<string, string>
        {
            ["code"] = "{{talepNo.value}}", ["requestDate"] = "{{talepTarihi.value}}", ["neededByDate"] = "{{ihtiyacTarihi.value}}",
            ["description"] = "{{talepAciklamasi.value}}", ["lines"] = "{{talepKalemleri.satirlar}}",
        }, Bindings(Query(key, "talepOlustur")));
        // F2-2: the code is optional (the server numbers it) and the body has no requestId; the dialog's busy lock is the only
        // guard against a double submit with an empty code.
        Assert.DoesNotContain(Op("satinalma.talep.olustur").Parameters, x => x.Name == "requestId");
        Assert.False(Op("satinalma.talep.olustur").Parameters.Single(x => x.Name == "code").Required);
        Assert.Null(Props(key, "talepNo")["required"]);
        Assert.True(Props(key, "talepAciklamasi")["required"]!.GetValue<bool>());
        Assert.Equal(1, (int)Props(key, "talepKalemleri")["minRows"]!);
        Assert.Contains("talepler", Strings(Props(key, "yeniTalepPenceresi")["refreshQueries"]));
    }

    [Fact]
    public void Quote_and_order_from_request_price_every_request_line()
    {
        const string key = "sales-requests";
        // F2-4: no remaining quantity; every request line must be priced, so no grid skips rows.
        foreach (var grid in new[] { "teklifKalemleri", "siparisKalemleri", "teklifSiparisKalemleri" })
            Assert.Null(Props(key, grid)["skipWhenZero"]);
        Assert.Equal(new Dictionary<string, string> { ["requestLineNumber"] = "lineNumber" }, MapOf(Props(key, "teklifKalemleri")["fillColumns"]));
        Assert.Null(Props(key, "siparisKalemleri")["fillColumns"]);
        Assert.Equal("satinalma.talep.kalemleri", (string)Query(key, "kalemler")["operation"]!);
        foreach (var grid in new[] { "teklifKalemleri", "siparisKalemleri" })
            foreach (var code in new[] { "unitPrice", "discountPercent" })
                Assert.Contains("required", GridColumns(Props(key, grid))[code]);

        Assert.Equal(new Dictionary<string, string>
        {
            ["id"] = "{{liste.seciliSatir.id}}", ["code"] = "{{teklifNo.value}}", ["supplierId"] = "{{teklifTedarikci.value}}",
            ["quoteDate"] = "{{teklifTarihi.value}}", ["validUntil"] = "{{teklifGecerlilik.value}}", ["notes"] = "{{teklifNotlari.value}}",
            ["lines"] = "{{teklifKalemleri.satirlar}}",
        }, Bindings(Query(key, "teklifKaydet")));
        Assert.Equal(new Dictionary<string, string>
        {
            ["id"] = "{{liste.seciliSatir.id}}", ["code"] = "{{siparisNo.value}}", ["supplierId"] = "{{siparisTedarikci.value}}",
            ["orderDate"] = "{{siparisTarihi.value}}", ["notes"] = "{{siparisNotlari.value}}", ["expectedReceiptDate"] = "{{siparisTeslimTarihi.value}}",
            ["targetWarehouseId"] = "{{siparisDepo.value}}", ["lines"] = "{{siparisKalemleri.satirlar}}",
        }, Bindings(Query(key, "siparisOlustur")));
        AssertSupplierPicker(key, "teklifTedarikcileri", "teklifTedarikci");
        AssertSupplierPicker(key, "siparisTedarikcileri", "siparisTedarikci");

        // Order from a quote: supplier, quote and prices come from the quote unchanged (otherwise 409).
        var fromQuote = Query(key, "teklifliSiparisOlustur");
        Assert.Equal(("{{teklifTablosu.seciliSatir.supplierId}}", "{{teklifTablosu.seciliSatir.id}}"),
            (Bindings(fromQuote)["supplierId"], Bindings(fromQuote)["supplierQuoteId"]));
        Assert.Equal(("satinalma.teklif.kalemleri", "{{teklifTablosu.seciliSatir.id}}"),
            ((string)Query(key, "teklifKalemKaynak")["operation"]!, Bindings(Query(key, "teklifKalemKaynak"))["id"]));
        var quoteGrid = Props(key, "teklifSiparisKalemleri");
        Assert.Equal(new Dictionary<string, string> { ["lineNumber"] = "requestLineNumber" }, MapOf(quoteGrid["fillColumns"]));
        Assert.All(GridColumns(quoteGrid), x => Assert.Contains("readOnly", x.Value));
        // List template: the command sits in the read-only detail window instead of the quote table's row actions.
        Assert.Contains("tekliftenSiparisDugmesi", Strings(Props(key, "talepDetayPenceresi")["contains"]));

        // Both writes are TenantAdmin-only in the catalog; the commands say so before the server does.
        foreach (var op in new[] { "satinalma.talep.teklifKaydet", "satinalma.talep.siparisOlustur" })
            Assert.True(Op(op).RequiresTenantAdmin, op);
        foreach (var button in new[] { "teklifEkleDugmesi", "siparisOlusturDugmesi", "tekliftenSiparisDugmesi" })
        {
            Assert.Equal("openDialog", (string)Props(key, button)["actionType"]!);
            Assert.Contains("kullanici.rol != 'TenantAdmin'", (string)Props(key, button)["disabledWhen"]!);
            Assert.Null(Props(key, button)["legacyScreen"]);
        }
        Assert.Contains("liste.seciliSatir.purchaseOrderId != null", (string)Props(key, "siparisOlusturDugmesi")["disabledWhen"]!);
    }

    [Fact]
    public void Dialog_writes_show_the_server_error_text()
    {
        // No errorMessage anywhere: the dialog status line shows the server's 400/409 text unchanged (e.g. a priced-line
        // mismatch or a duplicate code); the dialog save button is locked while the write runs.
        foreach (var key in Keys)
        {
            Assert.All(AllComponents(Definition(key)), x => Assert.Null(x["props"]?["errorMessage"]));
            foreach (var dialog in AllComponents(Definition(key)).Where(x => (string)x["type"]! == "dialog" && x["props"]?["saveQuery"] is not null))
                Assert.True(dialog["props"]!["closeOnSave"]!.GetValue<bool>() && dialog["props"]!["resetOnOpen"]!.GetValue<bool>(), (string)dialog["id"]!);
        }
    }

    // ---- Runtime ----

    [Fact]
    public async Task Standards_are_served_at_their_versions_when_enabled()
    {
        await using var app = await PurchasingSystemPagesTests.StartApplicationAsync(Keys);
        using var client = app.GetTestClient();
        PurchasingSystemPagesTests.SetIdentity(client, Admin, "TenantAdmin");
        var catalog = (await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages"))!.ToDictionary(x => x.GetProperty("screenKey").GetString()!);
        PurchasingSystemPagesTests.SetIdentity(client, Mehmet, "TenantUser");
        var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
        foreach (var key in Keys)
        {
            Assert.Equal(("preview", Versions[key]), (catalog[key].GetProperty("stage").GetString(), catalog[key].GetProperty("version").GetInt32()));
            Assert.Equal("standard", screens.GetProperty(key).GetProperty("mode").GetString());
            var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{key}/published");
            Assert.Equal(("@" + key, Versions[key]), (page.GetProperty("code").GetString(), page.GetProperty("standardVersion").GetInt32()));
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Mine[key].DefinitionJson), JsonNode.Parse(page.GetProperty("definitionJson").GetString()!)), key);
        }
    }

    // ---- Helpers ----

    /// <summary>Keys present in the first published version before these standards moved to the list template.</summary>
    private static readonly Dictionary<string, HashSet<string>> Faz1Ids = new(StringComparer.Ordinal)
    {
        ["sales-requests"] = [.. new[] { "komutlar", "onayBekliyorGostergesi", "onaylandiGostergesi", "siparisGostergesi", "reddedildiGostergesi", "durumOnayBekliyor",
            "durumOnaylandi", "durumDonustu", "durumReddedildi", "sayacSayfaBoyutu", "suzgec", "secimCipleri", "suzgecSecimleri", "durumSecimi",
            "detayPaneli", "liste", "acDugmesi", "detayKarti", "ozetPaneli", "enIyiTeklif", "kalemTablosu", "teklifTablosu", "alanTablosu", "panelOnayla",
            "panelReddet", "yeniTalepDugmesi", "onaylaDugmesi", "reddetDugmesi", "teklifEkleDugmesi", "siparisOlusturDugmesi", "siparisiAcDugmesi",
            "alanlarDugmesi" }.Select(x => "component:" + x),
            .. new[] { "talepler", "sayOnayBekliyor", "sayOnaylandi", "sayDonustu", "sayReddedildi", "kalemler", "teklifler", "ozelDegerler", "onay", "ret",
            "panelOnay", "panelRet" }.Select(x => "query:" + x)],
        ["sales-purchasing"] = [.. new[] { "komutlar", "siparisSecimi", "acikGostergesi", "kismenGostergesi", "gecikmisGostergesi", "durumAcik", "durumKismen",
            "gecikmisSabit", "sayacSayfaBoyutu", "suzgec", "secimCipleri", "suzgecSecimleri", "durumSecimi", "gecikmisSecimi", "detayPaneli",
            "liste", "acDugmesi", "detayKarti", "ozetPaneli", "belgeBasligi", "belgeMalKabulDugmesi", "listeyeDonDugmesi", "durumAdimlari", "kapaliUyarisi",
            "toplamGostergesi", "teslimGostergesi", "faturaGostergesi", "gecikmeGostergesi", "belgeSekmeleri", "satirTablosu", "kabulTablosu", "kabulAcDugmesi",
            "faturalaDugmesi", "belgeZinciri", "siparisNotu", "alanTablosu", "yeniSiparisDugmesi", "malKabulDugmesi", "eskiEkranDugmesi" }.Select(x => "component:" + x),
            .. new[] { "siparisler", "sayAcik", "sayKismen", "sayGecikmis", "siparis", "satirlar", "malKabuller", "ozelDegerler" }.Select(x => "query:" + x)],
    };

    /// <summary>K6: suppliers come from cari.listele with type "Supplier,Both" and status "Active" (hidden inputs) and a search.</summary>
    private static void AssertSupplierPicker(string key, string queryId, string inputId)
    {
        var query = Query(key, queryId);
        Assert.Equal("cari.listele", (string)query["operation"]!);
        var bindings = Bindings(query);
        Assert.Equal($"{{{{{inputId}.search}}}}", bindings["q"]);
        Assert.Equal("Supplier,Both", (string)Props(key, bindings["type"].Trim('{', '}').Split('.')[0])["defaultValue"]!);
        Assert.Equal("Active", (string)Props(key, bindings["status"].Trim('{', '}').Split('.')[0])["defaultValue"]!);
        var input = Props(key, inputId);
        Assert.Equal(("lookup", queryId, "id", true), ((string)input["inputType"]!, (string)input["optionsQuery"]!, (string)input["optionValueColumn"]!,
            input["required"]!.GetValue<bool>()));
    }

    /// <summary>The fill source column of a grid column: its fillColumns mapping, else the same code.</summary>
    private static string? FillSource(JsonObject grid, string code) => MapOf(grid["fillColumns"]).TryGetValue(code, out var source) ? source : code;

    /// <summary>Grid column code → rule tokens ("kod|Etiket|tür[|kurallar]").</summary>
    private static Dictionary<string, string[]> GridColumns(JsonObject grid) =>
        Strings(grid["gridColumns"]).Select(x => x.Split('|')).ToDictionary(x => x[0], x => x.Length == 4 ? x[3].Split(',') : []);

    private static string GridColumnType(JsonObject grid, string code) =>
        Strings(grid["gridColumns"]).Select(x => x.Split('|')).Single(x => x[0] == code)[2];

    private static HashSet<string> Columns(string key, string queryId) =>
        Op((string)Query(key, queryId)["operation"]!).Result.Columns.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);

    private static Dictionary<string, string> MapOf(JsonNode? node) =>
        node is JsonObject map ? map.ToDictionary(x => x.Key, x => (string)x.Value!) : [];

    private static Dictionary<string, string> Bindings(JsonObject query) =>
        query["parameters"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["name"]!, x => (string)x["binding"]!);

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    /// <summary>The three standards loaded on their own, so a parallel edit of another purchasing standard cannot mask these checks.</summary>
    private static readonly Lazy<IReadOnlyDictionary<string, SystemPageStandard>> MineLoaded = new(() =>
        SystemPageStandards.Load(SystemPageStandards.EmbeddedFiles().Where(x => Keys.Contains(Path.GetFileNameWithoutExtension(x.FileName)))));
    private static IReadOnlyDictionary<string, SystemPageStandard> Mine => MineLoaded.Value;

    private static JsonObject Definition(string key) => JsonNode.Parse(Mine[key].DefinitionJson)!.AsObject();

    private static IEnumerable<JsonObject> Queries(string key) => Definition(key)["queries"]!.AsArray().OfType<JsonObject>();

    private static JsonObject Query(string key, string id) => Queries(key).Single(x => (string)x["id"]! == id);

    private static IEnumerable<JsonObject> AllComponents(JsonObject definition)
    {
        var pending = new Stack<JsonObject>(definition["components"]!.AsArray().OfType<JsonObject>());
        while (pending.Count > 0)
        {
            var component = pending.Pop();
            yield return component;
            if (component["children"] is JsonArray children) foreach (var child in children.OfType<JsonObject>()) pending.Push(child);
        }
    }

    private static JsonObject Props(string key, string id) =>
        AllComponents(Definition(key)).Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static string[] Strings(JsonNode? node) => node is null ? [] : node.AsArray().Select(x => (string)x!).ToArray();
}
