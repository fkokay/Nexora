using System.Text;
using AIERP.Api;
using AIERP.Platform.Application;
using System.Text.Json.Nodes;
using Xunit;

/// <summary>
/// Proje 4 "Stok Kartları" standard (inventory-stock): the embedded envelope, as loaded by <see cref="SystemPageStandards"/>,
/// pins the ids, bindings and copy of the wire contract. <c>Budget_leaves_headroom</c> is re-run as later tasks extend it.
/// </summary>
public sealed class InventoryStockStandardTests
{
    private const string Key = "inventory-stock";

    [Fact]
    public void Header_is_preview_version_1()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal(1, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Stok Kartları", standard.Title);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
    }

    [Fact]
    public void List_is_server_paged_on_balances()
    {
        var props = Props("liste");
        Assert.Equal("bakiye", (string)props["query"]!);
        Assert.Equal("server", (string)props["paging"]!);
        Assert.Equal(25, (int)props["pageSize"]!);
        Assert.Equal("aramaKutusu", (string)props["searchInput"]!);
        Assert.Equal("Stok kartları", (string)props["title"]!);
        Assert.Equal(new[] { "belowMinimumCount=Minimum altı" }, Strings(props["footerMeta"]));

        Assert.Equal("stok.bakiye.sayfa", (string)Query("bakiye")["operation"]!);
        Assert.Equal("load", (string)Query("bakiye")["runOn"]!);
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{depoSecimi.value}}", ["q"] = "{{aramaKutusu.value}}", ["belowMinimumOnly"] = "{{minimumAlti.value}}",
            ["includeInactive"] = "{{pasifler.value}}", ["page"] = "{{liste.sayfa}}", ["pageSize"] = "{{liste.sayfaBoyutu}}"
        };
        Assert.Equal(expected.Count, Query("bakiye")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("bakiye", parameter));

        var search = Props("aramaKutusu");
        Assert.Equal("text", (string)search["inputType"]!);
        Assert.Equal("Ara", (string)search["label"]!);
        Assert.Equal("Kod, ad, barkod veya kategori", (string)search["placeholder"]!);
    }

    [Fact]
    public void List_columns_follow_screen_view_mapping()
    {
        var standard = SystemPageStandards.All[Key];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal(Key, view.Key);
        Assert.Equal("liste", view.Component);
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out var fields));
        var mapped = fields.Where(x => view.Fields.ContainsKey(x.Key)).Select(x => view.Fields[x.Key]).ToArray();
        Assert.Equal(view.Fields.Count, mapped.Length);
        Assert.Equal(mapped, Strings(Props("liste")["columns"]));
        // Only the fixed actions field is unmapped.
        Assert.Equal(new[] { "actions" }, fields.Where(x => !view.Fields.ContainsKey(x.Key)).Select(x => x.Key));
    }

    [Fact]
    public void Status_column_has_tone_map_and_format()
    {
        var props = Props("liste");
        Assert.Equal(new[] { "Minimum altı=danger", "Maliyetsiz=warning", "Yeterli=success", "Pasif=info" }, Strings(props["toneMap"]));
        var formats = Strings(props["columnFormats"]);
        Assert.Contains("status=status", formats);
        Assert.Contains("balance.code=code", formats);
        Assert.Contains("balance.valuationAmountBase=money", formats);
        foreach (var column in new[] { "quantityOnHand", "reservedQuantity", "availableQuantity", "minimumStock", "unvaluedQuantity" })
            Assert.Contains($"balance.{column}=number", formats);
        Assert.Equal(8, formats.Length);
    }

    [Fact]
    public void Warehouse_lookup_offers_all_warehouses()
    {
        var props = Props("depoSecimi");
        Assert.Equal("lookup", (string)props["inputType"]!);
        Assert.Equal(new[] { "=Tüm depolar" }, Strings(props["staticOptions"]));
        Assert.Equal("depolar", (string)props["optionsQuery"]!);
        Assert.Equal("id", (string)props["optionValueColumn"]!);
        Assert.Equal("name", (string)props["optionLabelColumn"]!);
        Assert.Equal("code", (string)props["optionDescriptionColumn"]!);
        Assert.Equal(0, (int)props["minChars"]!);
        Assert.True((bool)props["allowClear"]!);
        Assert.Equal("depo.listele", (string)Query("depolar")["operation"]!);
        Assert.Equal(new[] { "depoSecimi", "minimumAlti", "pasifler" }, Strings(Props("suzgecKarti")["inputs"]));
        Assert.Equal("Minimum altı ({{bakiye.meta.belowMinimumCount}})", (string)Props("minimumAlti")["label"]!);
        Assert.Equal("checkbox", (string)Props("pasifler")["inputType"]!);
    }

    [Fact]
    public void Metrics_bind_page_meta()
    {
        var expected = new (string Id, string Value, string Format, string? VisibleWhen)[]
        {
            ("stokDegeriGostergesi", "{{bakiye.meta.pageValuationAmountBase}}", "money", null),
            ("kullanilabilirGostergesi", "{{bakiye.meta.pageAvailableQuantity}}", "number", "bakiye.meta.pageUnitCode != null"),
            ("kullanilabilirKartGostergesi", "{{bakiye.meta.pageAvailableCount}}", "number", "bakiye.meta.pageUnitCode == null"),
            ("minimumAltiGostergesi", "{{bakiye.meta.belowMinimumCount}}", "number", null),
            ("maliyetsizGostergesi", "{{bakiye.meta.pageUnvaluedCount}}", "number", null)
        };
        var metrics = AllComponents().Where(x => (string)x["type"]! == "metric").Select(x => (string)x["id"]!).ToArray();
        Assert.Equal(expected.Select(x => x.Id), metrics);
        foreach (var (id, value, format, visibleWhen) in expected)
        {
            var props = Props(id);
            Assert.Equal(value, (string)props["value"]!);
            Assert.Equal(format, (string)props["format"]!);
            Assert.Equal(visibleWhen, (string?)props["visibleWhen"]);
            Assert.Null(props["query"]);
        }
        Assert.Equal("Bu sayfa · {{bakiye.meta.baseCurrencyCode}}", (string)Props("stokDegeriGostergesi")["description"]!);
        Assert.Equal("Bu sayfa · {{bakiye.meta.pageUnitCode}}", (string)Props("kullanilabilirGostergesi")["description"]!);
        var minimum = Props("minimumAltiGostergesi");
        Assert.Equal("minimumAlti", (string)minimum["filterInput"]!);
        Assert.Equal("true", (string)minimum["filterValue"]!);
        Assert.Equal("danger", (string)minimum["variant"]!);
        Assert.Equal("Seçili kapsam (arama hariç)", (string)minimum["description"]!);
    }

    [Fact]
    public void Detail_tabs_show_summary_warehouses_and_last_movements()
    {
        var tabs = Props("detaySekmeleri");
        Assert.Equal(new[] { "Özet=ozetPaneli", "Depolar=kartDepoTablosu", "Hareketler=sonHareketTablosu" }, Strings(tabs["tabs"]));
        Assert.Equal("liste.seciliSatir.stockItem.id != null", (string)tabs["visibleWhen"]!);

        var panel = Props("ozetPaneli");
        Assert.Equal("liste", (string)panel["table"]!);
        Assert.Equal("{{liste.seciliSatir.balance.code}} · {{liste.seciliSatir.balance.name}}", (string)panel["title"]!);
        Assert.Equal(new[]
        {
            "balance.quantityOnHand=Bakiye", "balance.availableQuantity=Kullanılabilir", "balance.reservedQuantity=Rezerve",
            "balance.minimumStock=Minimum", "balance.valuationAmountBase=Stok değeri", "balance.unvaluedQuantity=Maliyetsiz",
            "stockItem.category=Kategori", "balance.unitCode=Birim", "stockItem.trackingMode=Lot / seri", "status=Durum"
        }, Strings(panel["fields"]));

        var warehouses = Props("kartDepoTablosu");
        Assert.Equal("kartDepolari", (string)warehouses["query"]!);
        Assert.Equal(new[] { "warehouseCode", "warehouseName", "quantityOnHand", "reservedQuantity", "availableQuantity", "valuationAmountBase", "unvaluedQuantity" },
            Strings(warehouses["columns"]));
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kartDepolari", "id"));

        var movements = Props("sonHareketTablosu");
        Assert.Equal("sonHareketler", (string)movements["query"]!);
        Assert.Equal(5, (int)movements["limit"]!);
        Assert.Equal(new[] { "entryDate", "warehouseCode", "direction", "quantity", "description" }, Strings(movements["columns"]));
        Assert.Equal("stok.kart.hareketleri", (string)Query("sonHareketler")["operation"]!);
        var parameter = Assert.Single(Query("sonHareketler")["parameters"]!.AsArray());
        Assert.Equal("stockItemId", (string)parameter!["name"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("sonHareketler", "stockItemId"));
    }

    [Fact]
    public void State_commands_are_menu_buttons()
    {
        // Task 6 appends the movements button after the two state commands.
        Assert.Equal(new[] { "devreDisiBirak", "etkinlestir", "hareketlerDugmesi" }, Strings(Props("komutlar")["moreButtons"]));
        var deactivate = Props("devreDisiBirak");
        Assert.Equal("Devre dışı bırak", (string)deactivate["text"]!);
        Assert.Equal("query", (string)deactivate["actionType"]!);
        Assert.Equal("pasifeAl", (string)deactivate["queryId"]!);
        Assert.True((bool)deactivate["confirmEnabled"]!);
        Assert.Equal("liste.seciliSatir.stockItem.isActive == true", (string)deactivate["visibleWhen"]!);
        Assert.Equal(new[] { "bakiye" }, Strings(deactivate["refreshQueries"]));
        Assert.Equal("Stok kartı devre dışı bırakıldı.", (string)deactivate["successMessage"]!);

        var activate = Props("etkinlestir");
        Assert.Equal("Etkinleştir", (string)activate["text"]!);
        Assert.Equal("aktifEt", (string)activate["queryId"]!);
        Assert.True((bool)activate["confirmEnabled"]!);
        Assert.Equal("liste.seciliSatir.stockItem.isActive == false", (string)activate["visibleWhen"]!);
        Assert.Equal(new[] { "bakiye" }, Strings(activate["refreshQueries"]));
        Assert.Equal("“{{liste.seciliSatir.balance.name}}” yeniden etkinleştirilsin mi?", (string)activate["confirmText"]!);

        Assert.Equal("stok.kart.pasifeAl", (string)Query("pasifeAl")["operation"]!);
        Assert.Equal("stok.kart.aktifEt", (string)Query("aktifEt")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("pasifeAl", "id"));
        Assert.Equal("{{kart.rows[0].id}}", Binding("aktifEt", "id"));
        Assert.Single(Query("pasifeAl")["parameters"]!.AsArray());
        Assert.Single(Query("aktifEt")["parameters"]!.AsArray());
        Assert.Equal("stok.kart.getir", (string)Query("kart")["operation"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kart", "id"));
    }

    [Fact]
    public void Action_bar_part_1()
    {
        var props = Props("komutlar");
        Assert.Equal("actionBar", (string)Component("komutlar")["type"]!);
        Assert.Equal("kartSil", (string)props["deleteQuery"]!);
        Assert.Equal("liste", (string)props["exportTable"]!);
        Assert.Equal("aramaKutusu", (string)props["focusInput"]!);
        Assert.Equal("stok.kart.sil", (string)Query("kartSil")["operation"]!);
        Assert.Equal("delete", (string)Query("kartSil")["kind"]!);
        Assert.Equal("{{liste.seciliSatir.stockItem.id}}", Binding("kartSil", "id"));
    }

    [Fact]
    public void Screen_view_import_hides_mapped_columns()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out var fields));
        var states = fields.Select(x => new ScreenViewFieldState(x.Key, x.Label, x.Key is not ("status" or "category"), false)).ToArray();
        var result = SystemPageMerge.ImportScreenViews(standard, new Dictionary<string, IReadOnlyList<ScreenViewFieldState>> { [Key] = states });

        Assert.Empty(result.Notes);
        var props = JsonNode.Parse(result.DefinitionJson)!["components"]!.AsArray().OfType<JsonObject>()
            .Single(x => (string)x["id"]! == "liste")["props"]!;
        var columns = Strings(props["columns"]);
        Assert.DoesNotContain("status", columns);
        Assert.DoesNotContain("stockItem.category", columns);
        Assert.Equal(8, columns.Length);
        var formats = Strings(props["columnFormats"]);
        Assert.DoesNotContain(formats, x => x.StartsWith("status=", StringComparison.Ordinal) || x.StartsWith("stockItem.category=", StringComparison.Ordinal));
        Assert.Equal(7, formats.Length);
        Assert.True(TenantCustomPageSchema.Validate(result.DefinitionJson, out var error), error);
    }

    [Fact]
    public void Budget_leaves_headroom()
    {
        var standard = SystemPageStandards.All[Key];
        var components = AllComponents().ToArray();
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.True(components.Length <= 90, $"Bileşen sayısı {components.Length} > 90");
        Assert.True(queries.Length <= 26, $"Sorgu sayısı {queries.Length} > 26");
        // Final pilot numbers after Task 6 (wire contract: 82 components, 25 queries).
        Assert.Equal(82, components.Length);
        Assert.Equal(25, queries.Length);
        var size = Encoding.UTF8.GetByteCount(standard.DefinitionJson);
        Assert.True(size <= 100 * 1024, $"Tanım boyutu {size} bayt > 100 KiB");
        foreach (var component in components)
            Assert.True((component["props"] as JsonObject)?.Count is null or <= 30, $"'{component["id"]}' 30'dan fazla özellik içeriyor");
        Assert.DoesNotContain(components, x => (string)x["type"]! == "code");
        Assert.All(components, x => Assert.Null(x["props"]?["javascript"]));
        Assert.All(queries, x => Assert.Null(x["sql"]));
        Assert.All(queries, x => Assert.False(string.IsNullOrEmpty((string?)x["operation"])));
    }

    // ---- Task 5: card dialog, all scalar fields, composite save ----

    private sealed record Field(string Card, string Input, string Name, string Type, string Label,
        bool Required = false, int? MaxLength = null, bool UpperCase = false, double? Min = null, double? Max = null, double? Step = null,
        string? Pattern = null, string? Options = null);

    /// <summary>The 33-row card field map of the wire contract. Options: an optionsQuery id, or the joined staticOptions.</summary>
    private static readonly Field[] FieldMap =
    [
        new("kimlikKarti", "kod", "code", "text", "Stok kodu", Required: true, MaxLength: 64, UpperCase: true),
        new("kimlikKarti", "ad", "name", "text", "Stok adı", Required: true, MaxLength: 200),
        new("kimlikKarti", "barkod", "barcode", "text", "Barkod", MaxLength: 64),
        new("kimlikKarti", "kategori", "category", "lookup", "Kategori", Options: "kategoriler"),
        new("kimlikKarti", "takipTuru", "trackingMode", "lookup", "Lot / seri takibi", Options: "None=Takip yok|Lot=Lot|Serial=Seri"),
        new("kimlikKarti", "anaBirim", "unitCode", "text", "Ana birim", Required: true, MaxLength: 8, UpperCase: true),
        new("stokKarti", "minimumStok", "minimumStock", "number", "Minimum stok", Min: 0, Step: 0.0001),
        new("stokKarti", "maksimumStok", "maximumStock", "number", "Maksimum stok", Min: 0, Step: 0.0001),
        new("stokKarti", "yenidenSiparisNoktasi", "reorderPoint", "number", "Yeniden sipariş noktası", Min: 0, Step: 0.0001),
        new("stokKarti", "emniyetStoku", "safetyStock", "number", "Emniyet stoku", Min: 0, Step: 0.0001),
        new("stokKarti", "tedarikSuresi", "procurementLeadTimeDays", "number", "Tedarik süresi (gün)", Min: 0, Max: 3650, Step: 1),
        new("stokKarti", "uretimSuresi", "manufacturingLeadTimeDays", "number", "Üretim süresi (gün)", Min: 0, Max: 3650, Step: 1),
        new("fiyatKarti", "alisFiyati", "purchaseListPrice", "number", "Alış liste fiyatı", Min: 0, Step: 0.0001),
        new("fiyatKarti", "satisFiyati", "salesListPrice", "number", "Satış liste fiyatı", Min: 0, Step: 0.0001),
        new("fiyatKarti", "fiyatParaBirimi", "priceCurrencyCode", "text", "Fiyat para birimi", MaxLength: 3, UpperCase: true, Pattern: "^[A-Z]{3}$"),
        new("fiyatKarti", "alisIndirimi", "purchaseDiscountPercent", "number", "Alış iskonto %", Min: 0, Max: 100, Step: 0.0001),
        new("fiyatKarti", "satisIndirimi", "salesDiscountPercent", "number", "Satış iskonto %", Min: 0, Max: 100, Step: 0.0001),
        new("vergiKarti", "alisKdv", "purchaseVatPercent", "number", "Alış KDV %", Min: 0, Max: 100, Step: 0.0001),
        new("vergiKarti", "satisKdv", "salesVatPercent", "number", "Satış KDV %", Min: 0, Max: 100, Step: 0.0001),
        new("vergiKarti", "otv", "exciseTaxPercent", "number", "ÖTV %", Min: 0, Max: 100, Step: 0.0001),
        new("vergiKarti", "oiv", "communicationTaxPercent", "number", "ÖİV %", Min: 0, Max: 100, Step: 0.0001),
        new("vergiKarti", "tevkifat", "withholdingTaxPercent", "number", "Tevkifat %", Min: 0, Max: 100, Step: 0.0001),
        new("vergiKarti", "damgaVergisi", "stampTaxPercent", "number", "Damga vergisi %", Min: 0, Max: 100, Step: 0.0001),
        new("lojistikKarti", "netAgirlik", "netWeight", "number", "Net ağırlık", Min: 0, Step: 0.0001),
        new("lojistikKarti", "brutAgirlik", "grossWeight", "number", "Brüt ağırlık", Min: 0, Step: 0.0001),
        new("lojistikKarti", "uzunluk", "length", "number", "Uzunluk", Min: 0, Step: 0.0001),
        new("lojistikKarti", "genislik", "width", "number", "Genişlik", Min: 0, Step: 0.0001),
        new("lojistikKarti", "yukseklik", "height", "number", "Yükseklik", Min: 0, Step: 0.0001),
        new("muhasebeKarti", "alisHesabi", "purchaseAccountCode", "text", "Alış hesap kodu", MaxLength: 40),
        new("muhasebeKarti", "satisHesabi", "salesAccountCode", "text", "Satış hesap kodu", MaxLength: 40),
        new("muhasebeKarti", "maliyetHesabi", "costAccountCode", "text", "Maliyet hesap kodu", MaxLength: 40),
        new("gorselKarti", "gorsel", "productImageUrl", "text", "Ürün görseli bağlantısı", MaxLength: 1000),
        new("gorselKarti", "pazaryeriKimligi", "marketplaceProductId", "text", "Pazaryeri ürün kimliği", MaxLength: 120)
    ];

    private static readonly string[] CardFormCards = ["kimlikKarti", "stokKarti", "fiyatKarti", "vergiKarti", "lojistikKarti", "muhasebeKarti", "gorselKarti"];

    /// <summary>Scalar constructor parameters in camelCase, as the catalog's BodyParameters reflects them.</summary>
    private static string[] ScalarParameters<T>(params string[] exclude)
    {
        static bool Scalar(Type type)
        {
            type = Nullable.GetUnderlyingType(type) ?? type;
            return type == typeof(Guid) || type == typeof(string) || type == typeof(byte[]) || type.IsEnum || type == typeof(decimal)
                || type == typeof(double) || type == typeof(float) || type == typeof(int) || type == typeof(long) || type == typeof(short)
                || type == typeof(bool) || type == typeof(DateOnly) || type == typeof(DateTime) || type == typeof(DateTimeOffset);
        }
        var constructor = typeof(T).GetConstructors().OrderByDescending(x => x.GetParameters().Length).First();
        return constructor.GetParameters().Where(x => Scalar(x.ParameterType))
            .Select(x => char.ToLowerInvariant(x.Name![0]) + x.Name[1..]).Where(x => !exclude.Contains(x)).ToArray();
    }

    [Fact]
    public void Every_create_field_has_an_input()
    {
        var fields = ScalarParameters<StockItemWriteRequest>("isActive", "customFields");
        Assert.Equal(33, fields.Length);
        Assert.Equal(fields.Order(StringComparer.Ordinal), FieldMap.Select(x => x.Name).Order(StringComparer.Ordinal));
        foreach (var field in FieldMap)
        {
            Assert.Equal($"{{{{{field.Input}.value}}}}", Binding("olustur", field.Name));
            Assert.Equal("input", (string)Component(field.Input)["type"]!);
        }
        Assert.Equal("{{ozelAlanlar.degerler}}", Binding("olustur", "customFields"));
        Assert.Equal("{{varyantMatrisi.satirlar}}", Binding("olustur", "variants"));
        Assert.Equal(35, Query("olustur")["parameters"]!.AsArray().Count);
        Assert.Equal("stok.kart.olustur", (string)Query("olustur")["operation"]!);
        Assert.Equal("insert", (string)Query("olustur")["kind"]!);
    }

    [Fact]
    public void Every_update_field_has_an_input()
    {
        var fields = ScalarParameters<StockItemUpdateRequest>("rowVersion");
        Assert.Equal(fields.Order(StringComparer.Ordinal), FieldMap.Select(x => x.Name).Order(StringComparer.Ordinal));
        foreach (var field in FieldMap) Assert.Equal($"{{{{{field.Input}.value}}}}", Binding("guncelle", field.Name));
        Assert.Equal("{{kart.rows[0].id}}", Binding("guncelle", "id"));
        Assert.Null(Binding("guncelle", "rowVersion"));
        Assert.Equal(34, Query("guncelle")["parameters"]!.AsArray().Count);
        Assert.Equal("stok.kart.guncelle", (string)Query("guncelle")["operation"]!);
        Assert.Equal("update", (string)Query("guncelle")["kind"]!);
    }

    [Fact]
    public void Non_nullable_numeric_update_members_are_required_while_editing()
    {
        // A cleared optional number is sent as null (it overrides the source record); a member that cannot be null must
        // instead be refilled while an existing card is edited. Creation leaves blanks to the server defaults.
        var constructor = typeof(StockItemUpdateRequest).GetConstructors().OrderByDescending(x => x.GetParameters().Length).First();
        var numeric = constructor.GetParameters()
            .Where(x => x.ParameterType == typeof(decimal) || x.ParameterType == typeof(int) || x.ParameterType == typeof(decimal?) || x.ParameterType == typeof(int?))
            .ToDictionary(x => char.ToLowerInvariant(x.Name![0]) + x.Name[1..], x => Nullable.GetUnderlyingType(x.ParameterType) is null);
        Assert.Equal(21, numeric.Count);
        Assert.Equal(12, numeric.Count(x => x.Value));
        foreach (var field in FieldMap.Where(x => numeric.ContainsKey(x.Name)))
        {
            var requiredWhen = (string?)Props(field.Input)["requiredWhen"];
            Assert.True((numeric[field.Name] ? "kart.rows[0].id != null" : null) == requiredWhen, $"{field.Input} requiredWhen");
        }
        Assert.All(FieldMap.Where(x => !numeric.ContainsKey(x.Name)), field => Assert.Null(Props(field.Input)["requiredWhen"]));
    }

    [Fact]
    public void Inputs_default_to_card_record()
    {
        foreach (var field in FieldMap)
            Assert.Equal($"{{{{kart.rows[0].{field.Name}}}}}", (string?)Props(field.Input)["defaultValue"]);
    }

    [Fact]
    public void Input_rules_match_field_map()
    {
        static double? Number(JsonNode? node) => node is null ? null : (double)node;
        foreach (var field in FieldMap)
        {
            var props = Props(field.Input);
            Assert.True(field.Type == (string)props["inputType"]!, field.Input);
            Assert.True(field.Label == (string)props["label"]!, field.Input);
            Assert.True(field.Required == ((bool?)props["required"] ?? false), $"{field.Input} required");
            Assert.True(field.MaxLength == (int?)props["maxLength"], $"{field.Input} maxLength");
            Assert.True(field.UpperCase == ((bool?)props["upperCase"] ?? false), $"{field.Input} upperCase");
            Assert.True(field.Min == Number(props["min"]), $"{field.Input} min");
            Assert.True(field.Max == Number(props["max"]), $"{field.Input} max");
            Assert.True(field.Step == Number(props["step"]), $"{field.Input} step");
            Assert.True(field.Pattern == (string?)props["pattern"], $"{field.Input} pattern");
            if (field.Type == "lookup")
            {
                Assert.Equal(0, (int)props["minChars"]!);
                var options = (string?)props["optionsQuery"] ?? string.Join("|", Strings(props["staticOptions"]));
                Assert.Equal(field.Options, options);
            }
        }
        var category = Props("kategori");
        Assert.Equal("name", (string)category["optionValueColumn"]!);
        Assert.Equal("name", (string)category["optionLabelColumn"]!);
        Assert.True((bool)category["allowClear"]!);
        Assert.Equal("stok.kategoriler", (string)Query("kategoriler")["operation"]!);
        var currency = Props("fiyatParaBirimi");
        Assert.Equal("Üç harfli para birimi kodu girin (ör. TRY).", (string)currency["patternMessage"]!);
        Assert.Equal("TRY", (string)currency["placeholder"]!);
        Assert.Equal("20", (string)Props("alisKdv")["placeholder"]!);
        Assert.Equal("20", (string)Props("satisKdv")["placeholder"]!);
        Assert.Equal("https://…", (string)Props("gorsel")["placeholder"]!);
    }

    [Fact]
    public void Form_cards_track_the_card_record()
    {
        var tracked = AllComponents().Where(x => (string)x["type"]! == "formCard" && x["props"]?["recordKey"] is not null)
            .Select(x => (string)x["id"]!).ToArray();
        Assert.Equal(CardFormCards, tracked);
        var titles = new Dictionary<string, (string Title, int Columns)>
        {
            ["kimlikKarti"] = ("Kimlik", 3), ["stokKarti"] = ("Stok yönetimi", 3), ["fiyatKarti"] = ("Fiyat ve indirim", 3),
            ["vergiKarti"] = ("Vergi", 3), ["lojistikKarti"] = ("Lojistik", 3), ["muhasebeKarti"] = ("Muhasebe", 3),
            ["gorselKarti"] = ("Görsel ve pazaryeri", 2)
        };
        foreach (var card in CardFormCards)
        {
            var props = Props(card);
            Assert.Equal("{{kart.rows[0].id}}", (string)props["recordKey"]!);
            Assert.True((bool)props["trackChanges"]!);
            var inputs = Strings(props["inputs"]);
            Assert.True(inputs.Length <= 12, card);
            Assert.Equal(FieldMap.Where(x => x.Card == card).Select(x => x.Input), inputs);
            Assert.Equal(titles[card].Title, (string)props["title"]!);
            Assert.Equal(titles[card].Columns, (int)props["columns"]!);
        }
        Assert.Null(Props("suzgecKarti")["recordKey"]);
        Assert.Null(Props("suzgecKarti")["trackChanges"]);
    }

    [Fact]
    public void Card_tabs_cover_every_section()
    {
        Assert.Equal(new[]
        {
            "Genel=kimlikKarti,stokKarti,negatifStokYasak,negatifStokIzinli,negatifStokBilinmiyor",
            "Fiyat ve vergi=fiyatKarti,vergiKarti",
            "Lojistik ve muhasebe=lojistikKarti,muhasebeKarti",
            "Görsel=gorselKarti,gorselOnizleme",
            "Birimler=birimIzgarasi",
            "Özel alanlar=ozelAlanlar",
            "Varyantlar=varyantMatrisi,varyantListesi",
            "Reçeteler=receteListesi"
        }, Strings(Props("kartSekmeleri")["tabs"]));
        Assert.Equal("tabs", (string)Component("kartSekmeleri")["type"]!);
        var image = Props("gorselOnizleme");
        Assert.Equal("{{gorsel.value}}", (string)image["value"]!);
        Assert.Equal("Ürün görseli", (string)image["title"]!);
        Assert.Equal(160, (int)image["height"]!);
        Assert.Equal("contain", (string)image["fit"]!);
    }

    [Fact]
    public void Card_dialog_save_sequence_guards_duplicate_creates()
    {
        var dialog = Component("kartPenceresi");
        Assert.Equal("dialog", (string)dialog["type"]!);
        var props = dialog["props"]!.AsObject();
        Assert.Equal("drawer", (string)props["presentation"]!);
        Assert.Equal("Stok kartı {{kart.rows[0].code}}", (string)props["title"]!);
        Assert.Equal(new[] { "kartSekmeleri" }, Strings(props["contains"]));
        Assert.Equal(new[] { "olustur", "guncelle", "birimEkleYeni", "birimEkle", "birimSil", "ozelKaydet" }, Strings(props["saveSequence"]));
        Assert.Equal(new[]
        {
            "olustur=kart.rows[0].id == null && olustur.sonuc.id == null",
            "guncelle=kart.rows[0].id != null",
            "birimEkleYeni=kart.rows[0].id == null",
            "birimEkle=kart.rows[0].id != null",
            "ozelKaydet=kart.rows[0].id != null"
        }, Strings(props["sequenceWhen"]));
        Assert.True((bool)props["stopOnError"]!);
        Assert.Equal("Kaydet", (string)props["saveLabel"]!);
        Assert.True((bool)props["closeOnSave"]!);
        Assert.True((bool)props["resetOnOpen"]!);
        Assert.Equal(new[] { "bakiye" }, Strings(props["refreshQueries"]));
        Assert.Null(props["saveQuery"]);
    }

    [Fact]
    public void Action_bar_opens_card_dialog()
    {
        var props = Props("komutlar");
        Assert.Equal("kartPenceresi", (string)props["formDialog"]!);
        Assert.Equal(new[] { "kod" }, Strings(props["newInputs"]));
        Assert.Null(props["saveQuery"]);
        var requires = SystemPageStandards.All[Key].Items.Single(x => x.Key == "component:komutlar").Requires;
        Assert.Contains("component:kartPenceresi", requires);
        Assert.Contains("component:kod", requires);
    }

    [Fact]
    public void Units_grid_is_admin_only_and_staged()
    {
        var props = Props("birimIzgarasi");
        Assert.Equal("editableGrid", (string)Component("birimIzgarasi")["type"]!);
        Assert.Equal("stage", (string)props["gridMode"]!);
        Assert.Equal("birimler", (string)props["sourceQuery"]!);
        Assert.Equal("id", (string)props["rowKey"]!);
        Assert.Equal(new[] { "unitCode|Birim|text|required,unique,upperCase,maxLength:8", "factorToBase|Ana birim katsayısı|number|required,min:0.000001" },
            Strings(props["gridColumns"]));
        Assert.Equal("Ana birim: {{anaBirim.value}} (1)", (string)props["fixedRowLabel"]!);
        Assert.Equal("kullanici.rol != 'TenantAdmin'", (string)props["disabledWhen"]!);
        Assert.Equal("Birim dönüşümlerini yalnız firma yöneticisi değiştirebilir.", (string)props["disabledReason"]!);
        Assert.Equal("Birim dönüşümleri", (string)props["title"]!);

        Assert.Equal("stok.kart.birimleri", (string)Query("birimler")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("birimler", "id"));
        foreach (var (query, id) in new[] { ("birimEkle", "{{kart.rows[0].id}}"), ("birimEkleYeni", "{{olustur.sonuc.id}}") })
        {
            Assert.Equal("stok.kart.birimEkle", (string)Query(query)["operation"]!);
            Assert.Equal(id, Binding(query, "id"));
            Assert.Equal("{{birimIzgarasi.eklenenSatir.unitCode}}", Binding(query, "unitCode"));
            Assert.Equal("{{birimIzgarasi.eklenenSatir.factorToBase}}", Binding(query, "factorToBase"));
            Assert.Equal(3, Query(query)["parameters"]!.AsArray().Count);
        }
        Assert.Equal("stok.kart.birimSil", (string)Query("birimSil")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("birimSil", "id"));
        Assert.Equal("{{birimIzgarasi.silinenSatir.id}}", Binding("birimSil", "conversionId"));
    }

    [Fact]
    public void Custom_fields_variants_and_recipes()
    {
        var block = Props("ozelAlanlar");
        Assert.Equal("customFieldsBlock", (string)Component("ozelAlanlar")["type"]!);
        Assert.Equal("ozelTanimlar", (string)block["definitionsQuery"]!);
        Assert.Equal("ozelDegerler", (string)block["valuesQuery"]!);
        Assert.Equal(2, (int)block["columns"]!);
        Assert.Equal("Özel alanlar", (string)block["title"]!);
        Assert.Equal("stok.ozelAlanTanimlari", (string)Query("ozelTanimlar")["operation"]!);
        Assert.Equal("stok.kart.ozelAlanDegerleri", (string)Query("ozelDegerler")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("ozelDegerler", "id"));
        Assert.Equal("stok.kart.ozelAlanKaydet", (string)Query("ozelKaydet")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("ozelKaydet", "id"));
        Assert.Equal("{{ozelAlanlar.degerler}}", Binding("ozelKaydet", "values"));

        var matrix = Props("varyantMatrisi");
        Assert.Equal("matrix", (string)matrix["gridMode"]!);
        Assert.Equal("{{kod.value}}", (string)matrix["matrixCode"]!);
        Assert.Equal("{{ad.value}}", (string)matrix["matrixName"]!);
        Assert.Equal("Varyant boyutları", (string)matrix["title"]!);
        Assert.Equal("kart.rows[0].id == null", (string)matrix["visibleWhen"]!);

        var variants = Props("varyantListesi");
        Assert.Equal("varyantlar", (string)variants["query"]!);
        Assert.Equal(new[] { "code", "name", "barcode", "isActive" }, Strings(variants["columns"]));
        Assert.Equal("Bu kartın varyantı yok.", (string)variants["emptyText"]!);
        Assert.Equal("kart.rows[0].id != null", (string)variants["visibleWhen"]!);
        Assert.Equal("stok.kart.varyantlari", (string)Query("varyantlar")["operation"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("varyantlar", "id"));

        var recipes = Props("receteListesi");
        Assert.Equal("receteler", (string)recipes["query"]!);
        Assert.Equal(new[] { "code", "name", "outputQuantity", "isActive", "orderCount" }, Strings(recipes["columns"]));
        Assert.Equal("Bu stok kartını üreten reçete yok.", (string)recipes["emptyText"]!);
        Assert.Equal("kart.rows[0].id != null", (string)recipes["visibleWhen"]!);
        Assert.Equal("uretim.recete.listele", (string)Query("receteler")["operation"]!);
        Assert.Equal("load", (string)Query("receteler")["runOn"]!);
        var parameter = Assert.Single(Query("receteler")["parameters"]!.AsArray());
        Assert.Equal("productStockItemId", (string)parameter!["name"]!);
        Assert.Equal("{{kart.rows[0].id}}", (string)parameter["binding"]!);
        // R5: an empty required parameter keeps the read from being sent, so no unfiltered recipe list is ever read.
        Assert.True(ErpOperationCatalog.TryGet("uretim.recete.listele", out var operation));
        Assert.True(Assert.Single(operation.Parameters, x => x.Name == "productStockItemId").Required);
    }

    [Fact]
    public void Negative_stock_notes_cover_three_states()
    {
        var expected = new (string Id, string Text, string VisibleWhen)[]
        {
            ("negatifStokYasak", "Negatif stoka izin verilmez (sistem kuralı)", "negatifStok.rows[0].allowNegativeStock == false"),
            ("negatifStokIzinli", "Negatif stoka izin veriliyor (sistem kuralı)", "negatifStok.rows[0].allowNegativeStock == true"),
            ("negatifStokBilinmiyor", "Negatif stok kuralı şirket ayarlarından gelir (sistem kuralı)", "negatifStok.rows[0].allowNegativeStock == null")
        };
        foreach (var (id, text, visibleWhen) in expected)
        {
            Assert.Equal("text", (string)Component(id)["type"]!);
            Assert.Equal(text, (string)Props(id)["text"]!);
            Assert.Equal(visibleWhen, (string)Props(id)["visibleWhen"]!);
        }
        Assert.Equal("ayar.negatifStok", (string)Query("negatifStok")["operation"]!);
        Assert.Equal("load", (string)Query("negatifStok")["runOn"]!);
        Assert.Empty(Query("negatifStok")["parameters"]!.AsArray());
    }

    // ---- Task 6: movement dialog, list and reversal ----

    [Fact]
    public void Movement_dialog_contains_form_tracking_and_list()
    {
        Assert.Equal("dialog", (string)Component("hareketPenceresi")["type"]!);
        var props = Props("hareketPenceresi");
        Assert.Equal("dialog", (string)props["presentation"]!);
        Assert.Equal("Stok hareketleri · {{liste.seciliSatir.balance.code}} · {{depoSecimi.seciliSatir.name}}", (string)props["title"]!);
        Assert.Equal(new[] { "hareketFormu", "izlemeSatirlari", "hareketTablosu" }, Strings(props["contains"]));
        Assert.Equal("hareketEkle", (string)props["saveQuery"]!);
        Assert.Null(props["saveSequence"]);
        Assert.Equal("Hareketi kaydet", (string)props["saveLabel"]!);
        Assert.True((bool)props["closeOnSave"]!);
        Assert.True((bool)props["resetOnOpen"]!);
        Assert.Equal(new[] { "hareketler", "kartDepolari", "sonHareketler", "bakiye" }, Strings(props["refreshQueries"]));

        var form = Props("hareketFormu");
        Assert.Equal("formCard", (string)Component("hareketFormu")["type"]!);
        Assert.Equal("Yeni hareket", (string)form["title"]!);
        Assert.Equal(2, (int)form["columns"]!);
        Assert.Equal(new[] { "hareketYonu", "hareketTarihi", "hareketBirimi", "hareketMiktari", "hareketAciklamasi", "hareketKonumu", "birimMaliyet" },
            Strings(form["inputs"]));
        // A recordKey here would reset the movement entry on every list row change.
        Assert.Null(form["recordKey"]);
        Assert.Null(form["trackChanges"]);

        var grid = Props("izlemeSatirlari");
        Assert.Equal("list", (string)grid["gridMode"]!);
        Assert.Equal("Lot / seri satırları", (string)grid["title"]!);
        Assert.Equal(200, (int)grid["maxRows"]!);
        Assert.Equal(new[]
        {
            "trackingCode|Lot / seri kodu|text|required,unique,maxLength:80", "quantity|Miktar|number|required,min:0.0001",
            "expiryDate|Son kullanma tarihi|date"
        }, Strings(grid["gridColumns"]));
        Assert.Equal("Seri numaralarında miktar 1 olmalı ve son kullanma tarihi boş kalmalıdır; lotlarda son kullanma tarihi zorunludur.",
            (string)grid["description"]!);
        Assert.Null(grid["sourceQuery"]);
    }

    [Fact]
    public void Every_movement_parameter_is_bound()
    {
        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{depoSecimi.value}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["entryDate"] = "{{hareketTarihi.value}}", ["direction"] = "{{hareketYonu.value}}", ["quantity"] = "{{hareketMiktari.value}}",
            ["description"] = "{{hareketAciklamasi.value}}", ["unitCostBase"] = "{{birimMaliyet.value}}", ["unitCode"] = "{{hareketBirimi.value}}",
            ["storageLocationId"] = "{{hareketKonumu.value}}", ["tracking"] = "{{izlemeSatirlari.satirlar}}"
        };
        var insert = Query("hareketEkle");
        Assert.Equal(("stok.hareket.ekle", "insert", "manual"), ((string)insert["operation"]!, (string)insert["kind"]!, (string)insert["runOn"]!));
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.ekle", out var operation));
        // Every catalog parameter is bound, and nothing else.
        Assert.Equal(operation.Parameters.Select(x => x.Name).Order(StringComparer.Ordinal), expected.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(expected.Count, insert["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("hareketEkle", parameter));

        var reversal = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{depoSecimi.value}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["entryId"] = "{{hareketTablosu.seciliSatir.id}}", ["reason"] = "{{tersKayitDugmesi.yanit}}"
        };
        var reverse = Query("tersKayit");
        Assert.Equal(("stok.hareket.tersKayit", "insert", "manual"), ((string)reverse["operation"]!, (string)reverse["kind"]!, (string)reverse["runOn"]!));
        Assert.True(ErpOperationCatalog.TryGet("stok.hareket.tersKayit", out var reverseOperation));
        Assert.Equal(reverseOperation.Parameters.Select(x => x.Name).Order(StringComparer.Ordinal), reversal.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(reversal.Count, reverse["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in reversal) Assert.Equal(binding, Binding("tersKayit", parameter));

        Assert.Equal("depo.konumlari", (string)Query("konumlar")["operation"]!);
        Assert.Equal("load", (string)Query("konumlar")["runOn"]!);
        Assert.Equal("{{depoSecimi.value}}", Binding("konumlar", "warehouseId"));
        Assert.Single(Query("konumlar")["parameters"]!.AsArray());
    }

    [Fact]
    public void Movement_inputs_follow_legacy_rules()
    {
        var direction = Props("hareketYonu");
        Assert.Equal(("lookup", "Yön"), ((string)direction["inputType"]!, (string)direction["label"]!));
        Assert.Equal(new[] { "Receipt=Giriş", "Issue=Çıkış" }, Strings(direction["staticOptions"]));
        Assert.Equal(0, (int)direction["minChars"]!);
        Assert.True((bool)direction["required"]!);
        Assert.Equal("Receipt", (string)direction["defaultValue"]!);

        var date = Props("hareketTarihi");
        Assert.Equal(("date", "Tarih"), ((string)date["inputType"]!, (string)date["label"]!));
        Assert.True((bool)date["required"]!);
        Assert.Equal("{{bugun}}", (string)date["defaultValue"]!);

        var unit = Props("hareketBirimi");
        Assert.Equal(("lookup", "Hareket birimi"), ((string)unit["inputType"]!, (string)unit["label"]!));
        Assert.Equal("birimler", (string)unit["optionsQuery"]!);
        Assert.Equal(("unitCode", "unitCode"), ((string)unit["optionValueColumn"]!, (string)unit["optionLabelColumn"]!));
        Assert.Equal(0, (int)unit["minChars"]!);
        Assert.True((bool)unit["allowClear"]!);
        Assert.Null(unit["required"]);
        Assert.Equal("Ana birim ({{liste.seciliSatir.balance.unitCode}})", (string)unit["placeholder"]!);

        var quantity = Props("hareketMiktari");
        Assert.Equal(("number", "Miktar"), ((string)quantity["inputType"]!, (string)quantity["label"]!));
        Assert.True((bool)quantity["required"]!);
        Assert.Equal(0.0001, (double)quantity["min"]!);
        Assert.Equal(0.0001, (double)quantity["step"]!);

        var description = Props("hareketAciklamasi");
        Assert.Equal(("text", "Açıklama"), ((string)description["inputType"]!, (string)description["label"]!));
        Assert.True((bool)description["required"]!);
        Assert.Equal(240, (int)description["maxLength"]!);

        var location = Props("hareketKonumu");
        Assert.Equal(("lookup", "Depo konumu"), ((string)location["inputType"]!, (string)location["label"]!));
        Assert.Equal("konumlar", (string)location["optionsQuery"]!);
        Assert.Equal(("id", "name", "code"),
            ((string)location["optionValueColumn"]!, (string)location["optionLabelColumn"]!, (string)location["optionDescriptionColumn"]!));
        Assert.True((bool)location["allowClear"]!);
        Assert.Null(location["required"]);
        Assert.Equal("konumlar.rows[0].id != null", (string)location["visibleWhen"]!);

        var cost = Props("birimMaliyet");
        Assert.Equal(("number", "Birim maliyet"), ((string)cost["inputType"]!, (string)cost["label"]!));
        Assert.Equal(0, (double)cost["min"]!);
        Assert.Null(cost["required"]);
        Assert.Equal("hareketYonu.value == 'Receipt'", (string)cost["visibleWhen"]!);

        Assert.Equal("liste.seciliSatir.stockItem.trackingMode != 'None'", (string)Props("izlemeSatirlari")["visibleWhen"]!);
    }

    [Fact]
    public void Movement_list_is_server_paged_by_50()
    {
        var table = Props("hareketTablosu");
        Assert.Equal("dataTable", (string)Component("hareketTablosu")["type"]!);
        Assert.Equal("hareketler", (string)table["query"]!);
        Assert.Equal("server", (string)table["paging"]!);
        Assert.Equal(50, (int)table["pageSize"]!);
        Assert.Equal(new[]
        {
            "entryDate", "direction", "quantity", "enteredQuantity", "enteredUnitCode", "unitCostBase", "storageLocationCode",
            "description", "isReversal", "hasReversal"
        }, Strings(table["columns"]));
        Assert.Equal(new[] { "tersKayitDugmesi" }, Strings(table["rowActions"]));
        Assert.Equal("Bu depoda hareket yok.", (string)table["emptyText"]!);

        var expected = new Dictionary<string, string>
        {
            ["warehouseId"] = "{{depoSecimi.value}}", ["stockItemId"] = "{{liste.seciliSatir.stockItem.id}}",
            ["page"] = "{{hareketTablosu.sayfa}}", ["pageSize"] = "{{hareketTablosu.sayfaBoyutu}}"
        };
        Assert.Equal(("stok.hareket.listele", "read", "load"),
            ((string)Query("hareketler")["operation"]!, (string)Query("hareketler")["kind"]!, (string)Query("hareketler")["runOn"]!));
        Assert.Equal(expected.Count, Query("hareketler")["parameters"]!.AsArray().Count);
        foreach (var (parameter, binding) in expected) Assert.Equal(binding, Binding("hareketler", parameter));
    }

    [Fact]
    public void Reversal_asks_for_a_reason_and_skips_reversed_rows()
    {
        var button = Props("tersKayitDugmesi");
        Assert.Equal("button", (string)Component("tersKayitDugmesi")["type"]!);
        Assert.Equal("Ters kayıt", (string)button["text"]!);
        Assert.Equal("query", (string)button["actionType"]!);
        Assert.Equal("tersKayit", (string)button["queryId"]!);
        Assert.Equal("Ters kayıt gerekçesi", (string)button["promptLabel"]!);
        Assert.True((bool)button["promptRequired"]!);
        Assert.Equal("hareketTablosu.seciliSatir.hasReversal || hareketTablosu.seciliSatir.isReversal", (string)button["disabledWhen"]!);
        Assert.Equal("Bu hareket zaten ters kayıtla düzeltilmiş ya da kendisi bir ters kayıt.", (string)button["disabledReason"]!);
        Assert.Equal("Ters kayıt oluşturuldu.", (string)button["successMessage"]!);
        // A bakiye rerun would drop the list selection while the dialog is still open.
        Assert.Equal(new[] { "hareketler", "kartDepolari", "sonHareketler" }, Strings(button["refreshQueries"]));
    }

    [Fact]
    public void Movements_button_needs_a_warehouse()
    {
        var button = Props("hareketlerDugmesi");
        Assert.Equal("button", (string)Component("hareketlerDugmesi")["type"]!);
        Assert.Equal("Hareketler / ekle", (string)button["text"]!);
        Assert.Equal("openDialog", (string)button["actionType"]!);
        Assert.Equal("hareketPenceresi", (string)button["dialogId"]!);
        Assert.Equal("liste.seciliSatir.stockItem.id != null", (string)button["visibleWhen"]!);
        Assert.Equal("depoSecimi.value == null", (string)button["disabledWhen"]!);
        Assert.Equal("Hareket için önce bir depo seçin.", (string)button["disabledReason"]!);
        Assert.Contains("hareketlerDugmesi", Strings(Props("komutlar")["moreButtons"]));
        var item = SystemPageStandards.All[Key].Items.Single(x => x.Key == "component:komutlar");
        Assert.Contains("component:hareketlerDugmesi", item.Requires);
    }

    private static JsonObject Definition() =>JsonNode.Parse(SystemPageStandards.All[Key].DefinitionJson)!.AsObject();

    private static IEnumerable<JsonObject> AllComponents()
    {
        var pending = new Stack<JsonObject>(Definition()["components"]!.AsArray().OfType<JsonObject>().Reverse());
        while (pending.Count > 0)
        {
            var component = pending.Pop();
            yield return component;
            if (component["children"] is JsonArray children)
                foreach (var child in children.OfType<JsonObject>().Reverse()) pending.Push(child);
        }
    }

    private static JsonObject Component(string id) =>
        AllComponents().SingleOrDefault(x => (string)x["id"]! == id) ?? throw new Xunit.Sdk.XunitException($"Bileşen yok: {id}");

    private static JsonObject Props(string id) => Component(id)["props"]!.AsObject();

    private static JsonObject Query(string id) =>
        Definition()["queries"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["id"]! == id)
        ?? throw new Xunit.Sdk.XunitException($"Sorgu yok: {id}");

    private static string? Binding(string queryId, string parameter) =>
        (string?)Query(queryId)["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
