using System.Text;
using AIERP.Api;
using AIERP.Platform.Application;
using System.Text.Json.Nodes;
using Xunit;

/// <summary>
/// "Yeni stok kartı" standard (inventory-stock-create): the card form split from the Stok Kartları list. The page reads
/// <c>{{sayfa.parametre.id}}</c>: empty creates a card, set edits it. Pins the field map, the save sequence and the navigation.
/// </summary>
public sealed class InventoryStockCreateStandardTests
{
    private const string Key = "inventory-stock-create";

    [Fact]
    public void Header_is_preview_version_1()
    {
        var standard = SystemPageStandards.All[Key];
        Assert.Equal(2, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Empty(standard.ScreenViews);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since <= standard.Version && x.Label.Length is > 0 and <= 80, x.Key));
    }

    [Fact]
    public void Budget_leaves_headroom()
    {
        var standard = SystemPageStandards.All[Key];
        var components = AllComponents().ToArray();
        var queries = Definition()["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.Equal(54, components.Length);
        Assert.Equal(13, queries.Length);
        var size = Encoding.UTF8.GetByteCount(standard.DefinitionJson);
        Assert.True(size <= 100 * 1024, $"Tanım boyutu {size} bayt > 100 KiB");
        foreach (var component in components)
            Assert.True((component["props"] as JsonObject)?.Count is null or <= 30, $"'{component["id"]}' 30'dan fazla özellik içeriyor");
        Assert.DoesNotContain(components, x => (string)x["type"]! == "code");
        Assert.All(queries, x => Assert.Null(x["sql"]));
        Assert.All(queries, x => Assert.False(string.IsNullOrEmpty((string?)x["operation"])));
    }

    // ---- Card form: all scalar fields, composite save ----

    private sealed record Field(string Card, string Input, string Name, string Type, string Label,
        bool Required = false, int? MaxLength = null, bool UpperCase = false, double? Min = null, double? Max = null, double? Step = null,
        string? Pattern = null, string? Options = null);

    /// <summary>The 33-row card field map of the wire contract. Options: an optionsQuery id, or the joined staticOptions.</summary>
    private static readonly Field[] FieldMap =
    [
        new("kimlikKarti", "kod", "code", "text", "Stok kodu", Required: true, MaxLength: 64, UpperCase: true),
        new("kimlikKarti", "ad", "name", "text", "Stok adı", Required: true, MaxLength: 200),
        new("kimlikKarti", "barkod", "barcode", "text", "Barkod", MaxLength: 64),
        new("kimlikKarti", "kategori", "category", "select", "Kategori", Options: "kategoriler"),
        new("kimlikKarti", "takipTuru", "trackingMode", "select", "Lot / seri takibi", Options: "None=Yok|Lot=Lot|Serial=Seri"),
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
        Assert.Equal(34, Query("olustur")["parameters"]!.AsArray().Count);
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
            if (field.Type is "lookup" or "select")
            {
                if (field.Type == "lookup") Assert.Equal(0, (int)props["minChars"]!);
                var options = (string?)props["optionsQuery"] ?? string.Join("|", Strings(props["staticOptions"]));
                Assert.Equal(field.Options, options);
            }
        }
        var category = Props("kategori");
        Assert.Equal("name", (string)category["optionValueColumn"]!);
        Assert.Equal("name", (string)category["optionLabelColumn"]!);
        // Select inputs: the empty "Seçin" option clears; lookup-only props are absent.
        Assert.Null(category["allowClear"]);
        Assert.Null(category["minChars"]);
        Assert.Null(Props("takipTuru")["minChars"]);
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
    }

    [Fact]
    public void Card_tabs_cover_every_section()
    {
        Assert.Equal(new[]
        {
            "Genel=kimlikKarti,stokKarti",
            "Fiyat ve vergi=fiyatKarti,vergiKarti",
            "Lojistik ve muhasebe=lojistikKarti,muhasebeKarti,gorselKarti",
            "Birimler=birimIzgarasi,birimEkleDugmesi",
            "Varyantlar ve re\u00e7eteler=varyantListesi,receteListesi",
            "\u00d6zel alanlar=ozelAlanlar"
        }, Strings(Props("kartSekmeleri")["tabs"]));
        Assert.Equal("tabs", (string)Component("kartSekmeleri")["type"]!);
    }

    [Fact]
    public void Action_bar_save_sequence_guards_duplicate_creates()
    {
        var props = Props("komutlar");
        Assert.Equal("actionBar", (string)Component("komutlar")["type"]!);
        Assert.Equal(new[] { "olustur", "guncelle", "ozelKaydet" }, Strings(props["saveSequence"]));
        Assert.Equal(new[]
        {
            "olustur=kart.rows[0].id == null && olustur.sonuc.id == null",
            "guncelle=kart.rows[0].id != null",
            "ozelKaydet=kart.rows[0].id != null"
        }, Strings(props["sequenceWhen"]));
        Assert.True((bool)props["stopOnError"]!);
        Assert.Null(props["saveQuery"]);
        Assert.Null(props["formDialog"]);
        Assert.Equal("record", (string)Definition()["template"]!["name"]!);
        Assert.Contains(AllComponents(), x => (string)x["id"]! == "birimEklePenceresi");
    }

    [Fact]
    public void Page_reads_the_card_from_the_id_parameter()
    {
        Assert.Equal("stok.kart.getir", (string)Query("kart")["operation"]!);
        Assert.Equal("{{sayfa.parametre.id}}", Binding("kart", "id"));
        var summary = Props("kartOzeti");
        Assert.Equal("recordHeader", (string)Component("kartOzeti")["type"]!);
        Assert.Equal("summary", (string)summary["slot"]!);
        Assert.Equal("{{kart.rows[0].name}}", (string)summary["title"]!);
        Assert.Equal("{{kart.rows[0].code}}", (string)summary["subtitle"]!);
        Assert.Equal("Stok kart\u0131", SystemPageStandards.All[Key].Title);
    }

    [Fact]
    public void Save_returns_to_the_list_and_yeni_starts_a_fresh_card()
    {
        // Legacy create screen: a successful save closes the form and returns to Stok Kartları; Yeni clears for another card.
        var props = Props("komutlar");
        // After save: the action bar itself returns to the list in this tab and refreshes it (no hidden button).
        Assert.Null(props["afterSaveButton"]);
        Assert.Equal(("page", "@inventory-stock", "sameTab", true),
            ((string)props["afterSaveAction"]!, (string)props["afterSavePageCode"]!, (string)props["afterSaveTarget"]!, (bool)props["afterSaveRefresh"]!));
        Assert.DoesNotContain(AllComponents(), x => (string)x["id"]! == "listeyeDon");
        Assert.Equal("page", (string)props["newAction"]!);
        Assert.Null(props["openButton"]);
        Assert.Equal(("@inventory-stock-create", "sameTab"), ((string)props["newPageCode"]!, (string)props["newTarget"]!));
        var requires = SystemPageStandards.All[Key].Items.Single(x => x.Key == "component:komutlar").Requires;
        Assert.DoesNotContain("component:listeyeDon", requires);
        Assert.DoesNotContain("component:yeniKartDugmesi", requires);
        Assert.Contains("component:kartSekmeleri", requires);
    }

    [Fact]
    public void Units_use_a_tenant_admin_window_and_readonly_table()
    {
        var props = Props("birimIzgarasi");
        Assert.Equal("dataTable", (string)Component("birimIzgarasi")["type"]!);
        Assert.Equal("birimler", (string)props["query"]!);
        Assert.Equal(new[] { "unitCode", "factorToBase" }, Strings(props["columns"]));
        Assert.Equal(new[] { "birimSilDugmesi" }, Strings(props["rowActions"]));
        Assert.Equal("{{kart.rows[0].id}}", Binding("birimler", "id"));
        var add = Props("birimEkleDugmesi");
        Assert.Equal("birimEklePenceresi", (string)add["dialogId"]!);
        Assert.Equal("kullanici.rol != 'TenantAdmin'", (string)add["disabledWhen"]!);
        Assert.Equal(new[] { "yeniBirimKodu", "yeniBirimKatsayisi" }, Strings(Props("birimEkleFormu")["inputs"]));
        Assert.Equal("{{yeniBirimKodu.value}}", Binding("birimEkle", "unitCode"));
        Assert.Equal("{{yeniBirimKatsayisi.value}}", Binding("birimEkle", "factorToBase"));
        Assert.Equal("{{birimIzgarasi.seciliSatir.id}}", Binding("birimSil", "conversionId"));
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
    public void Negative_stock_policy_is_a_single_conditional_alert()
    {
        var props = Props("negatifStokNotu");
        Assert.Equal("alert", (string)Component("negatifStokNotu")["type"]!);
        Assert.Equal("negatifStok.rows[0].allowNegativeStock != null", (string)props["visibleWhen"]!);
        Assert.Equal("above", (string)props["slot"]!);
        Assert.Equal("ayar.negatifStok", (string)Query("negatifStok")["operation"]!);
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
