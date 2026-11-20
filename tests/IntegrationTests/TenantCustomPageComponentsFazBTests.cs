using System.Text.Json;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Proje 2 Faz B component schema: save sequences, row actions and reason prompts, editable grids, custom fields
/// blocks, dialogs, images and formCard change tracking.
/// </summary>
public sealed class TenantCustomPageComponentsFazBTests
{
    private static string V2(object[] queries, object[] components) =>
        JsonSerializer.Serialize(new { schemaVersion = 2, queries, components });

    private static object P(string name, string binding, string type = "text") => new { name, binding, type };
    private static object Op(string id, string kind, string operation, string runOn, params object[] parameters) =>
        new { id, name = id, kind, operation, parameters, runOn };
    private static object C(string id, string type, object props) => new { id, type, props };
    private static object N(string id, string type, string name, object props) => new { id, type, name, props };
    private static object Input(string id, string name, string inputType = "text") => N(id, "input", name, new { inputType });

    private static void AssertAccepted(string json) =>
        Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void AssertRejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.NotNull(error);
        Assert.Contains(contains, error);
    }

    // ---- Shared stock card page ----

    private static object Liste() => Op("kartlar", "read", "stok.kart.listele", "load", P("q", "{{arama.value}}"));
    private static object Kart() => Op("kart", "read", "stok.kart.getir", "load", P("id", "{{liste.seciliSatir.id}}", "guid"));
    private static object Guncelle() => Op("guncelle", "update", "stok.kart.guncelle", "manual", P("name", "{{ad.value}}"));
    private static object Pasif() => Op("pasif", "update", "stok.kart.pasifeAl", "manual");
    private static object Olustur(params object[] extra) =>
        Op("olustur", "insert", "stok.kart.olustur", "manual", [P("code", "{{kod.value}}"), P("name", "{{ad.value}}"), .. extra]);
    private static object BirimOku() => Op("birimOku", "read", "stok.kart.birimleri", "load", P("id", "{{liste.seciliSatir.id}}", "guid"));
    private static object BirimEkle(string factorBinding = "{{birimler.eklenenSatir.factorToBase}}") =>
        Op("birimEkle", "insert", "stok.kart.birimEkle", "manual", P("id", "{{liste.seciliSatir.id}}", "guid"),
            P("unitCode", "{{birimler.eklenenSatir.unitCode}}"), P("factorToBase", factorBinding, "decimal"));
    private static object BirimSil() =>
        Op("birimSil", "delete", "stok.kart.birimSil", "manual", P("id", "{{liste.seciliSatir.id}}", "guid"),
            P("conversionId", "{{birimler.silinenSatir.id}}", "guid"));

    private static object[] CardQueries(params object[] extra) => [Liste(), Kart(), Guncelle(), Pasif(), Olustur(), BirimOku(), BirimEkle(), BirimSil(), .. extra];

    private static object StageGrid(object? props = null) => N("g1", "editableGrid", "birimler", props ?? new
    {
        gridMode = "stage", sourceQuery = "birimOku", rowKey = "id", addLabel = "Birim ekle", fixedRowLabel = "Ana birim: {{kart.rows[0].unitCode}}",
        maxRows = 20, gridColumns = new[] { "unitCode|Birim|text|required,unique,upperCase,maxLength:8", "factorToBase|Katsayı|number|required,min:0.000001" }
    });

    private static object[] CardComponents(params object[] extra) =>
    [
        Input("i0", "arama"), Input("i1", "kod"), Input("i2", "ad"),
        N("t1", "dataTable", "liste", new { query = "kartlar" }),
        StageGrid(),
        .. extra
    ];

    private static object ActionBar(object props) => C("ab", "actionBar", props);

    // ---- Column spec ----

    private static JsonElement ColumnVectors()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "GridColumnVectors.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Grid_column_vectors_valid_parse()
    {
        var valid = ColumnVectors().GetProperty("valid").EnumerateArray().ToList();
        Assert.NotEmpty(valid);
        foreach (var vector in valid)
        {
            var text = vector.GetProperty("text").GetString()!;
            Assert.True(GridColumnSpec.TryParse(text, out var code, out var inputType, out var error), $"{text}: {error}");
            Assert.Equal(vector.GetProperty("code").GetString(), code);
            Assert.Equal(vector.GetProperty("inputType").GetString(), inputType);
            Assert.Equal(vector.GetProperty("root").GetString(), GridColumnSpec.RootOf(code));
        }
    }

    [Fact]
    public void Grid_column_vectors_invalid_rejected()
    {
        var invalid = ColumnVectors().GetProperty("invalid").EnumerateArray().ToList();
        Assert.NotEmpty(invalid);
        foreach (var vector in invalid)
        {
            var text = vector.GetString()!;
            Assert.False(GridColumnSpec.TryParse(text, out _, out _, out var error), $"kabul edilmemeliydi: {text}");
            Assert.False(string.IsNullOrWhiteSpace(error));
        }
    }

    [Theory]
    // Strict reading: no trimming, empty rules segment or token invalid, the last repeated value wins.
    [InlineData("a|A|text|", false)]
    [InlineData("a|A|text|required,", false)]
    [InlineData("a|A|text| required", false)]
    [InlineData(" a|A|text", false)]
    [InlineData("a|A|text ", false)]
    [InlineData("a|   |text", false)]
    [InlineData("a|A|text\n", false)]
    [InlineData("a|A|text|required:1", false)]
    [InlineData("a|A|text|maxLength", false)]
    [InlineData("a|A|text|maxLength:99999999999999999999", false)]
    [InlineData("n|N|number|min:٣", false)]
    [InlineData("n|N|number|min:1,max:5,min:6", false)]
    [InlineData("n|N|number|min:6,max:5,min:1", true)]
    [InlineData("n|N|number|step:1000000000", true)]
    [InlineData("a|A|text|required,required", true)]
    [InlineData("attributes.Özel alan_1|Özel|text", true)]
    public void Grid_column_spec_is_strict(string text, bool valid)
    {
        Assert.Equal(valid, GridColumnSpec.TryParse(text, out _, out _, out _));
    }

    // ---- Save sequence ----

    [Fact]
    public void Accepts_actionBar_save_sequence_with_when()
    {
        AssertAccepted(V2(CardQueries(), CardComponents(ActionBar(new
        {
            saveSequence = new[] { "guncelle", "birimEkle", "birimSil" }, stopOnError = true,
            sequenceWhen = new[] { "guncelle=liste.seciliSatir.id != null", "birimSil=birimler.silinenSayisi != 0 && guncelle.sonuc.id != null" }
        }))));
    }

    [Fact]
    public void Rejects_save_sequence_with_read_query()
    {
        const string message = "'saveSequence' 1–8 adet farklı yazma sorgusu kimliği içermelidir.";
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "kart" } }))), message);
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle", "guncelle" } }))), message);
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = Array.Empty<string>() }))), message);
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "yok" } }))), message);
    }

    [Fact]
    public void Rejects_save_sequence_with_save_query()
    {
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, saveQuery = "guncelle" }))),
            "'saveSequence' ve 'saveQuery' birlikte kullanılamaz.");
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveQuery = "guncelle", stopOnError = false }))), "'stopOnError'");
    }

    [Fact]
    public void Rejects_sequence_when_referencing_onceki()
    {
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "guncelle=onceki.sonuc.id != null" } }))),
            "'sequenceWhen' koşulu 'onceki' kullanamaz; adımlar başlamadan değerlendirilir.");
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "guncelle=a.value = 1" } }))),
            "'sequenceWhen' koşulu geçersiz: ");
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "guncelle=yok.value == 1" } }))),
            "sayfada olmayan bir ada başvuruyor: yok");
    }

    [Fact]
    public void Sequence_when_accepts_ordering_but_never_markup()
    {
        AssertAccepted(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "guncelle=bugun >= bugun + -1" } }))));
        // < and > outside quotes only pass the text check; the condition parser still rejects anything that is not a condition.
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "guncelle=<img src=x>" } }))),
            "'sequenceWhen'");
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "guncelle=bugun == '<b>'" } }))),
            "'sequenceWhen'");
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { sequenceWhen = new[] { "guncelle=<img src=x>" } }))), "'sequenceWhen'");
    }

    [Fact]
    public void Rejects_sequence_when_step_not_in_sequence()
    {
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle" }, sequenceWhen = new[] { "pasif=bugun != null" } }))),
            "'sequenceWhen' adımı dizide yok: pasif");
    }

    [Fact]
    public void Rejects_two_source_backed_steps()
    {
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "guncelle", "pasif" } }))),
            "Bir kayıt dizisinde kaynak kayıttan başlayan en fazla bir adım olabilir.");
    }

    [Fact]
    public void Accepts_iterating_step_on_stage_grid()
    {
        AssertAccepted(V2(CardQueries(), CardComponents(ActionBar(new { saveSequence = new[] { "birimEkle" } }))));
        // A column outside gridColumns is refused for eklenenSatir; silinenSatir may use any source column.
        AssertRejected(V2([.. CardQueries().Take(6), BirimEkle("{{birimler.eklenenSatir.isActive}}"), BirimSil()],
                CardComponents(ActionBar(new { saveSequence = new[] { "birimEkle" } }))),
            "'birimEkle' sorgusundaki 'factorToBase' parametresi 'birimler' tablosunda olmayan bir sütuna bağlı: isActive");
        // silinenSatir.isActive is a source column of stok.kart.birimleri.
        AssertAccepted(V2([.. CardQueries().Take(7),
                Op("birimSil", "delete", "stok.kart.birimSil", "manual", P("id", "{{liste.seciliSatir.id}}", "guid"), P("conversionId", "{{birimler.silinenSatir.id}}", "guid"))],
            CardComponents(ActionBar(new { saveSequence = new[] { "birimEkle", "birimSil" } }))));
    }

    [Fact]
    public void Rejects_step_iterating_two_lists()
    {
        AssertRejected(V2([.. CardQueries().Take(6), BirimEkle("{{birimler.silinenSatir.factorToBase}}"), BirimSil()],
                CardComponents(ActionBar(new { saveSequence = new[] { "birimEkle" } }))),
            "'birimEkle' adımı en fazla bir ızgara listesini dolaşabilir.");
    }

    [Fact]
    public void Rejects_iterating_query_as_save_query()
    {
        const string message = "'birimEkle' sorgusu ızgara satırlarına bağlı; yalnız kayıt dizisinde kullanılabilir.";
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { saveQuery = "birimEkle" }))), message);
        AssertRejected(V2(CardQueries(), CardComponents(C("b1", "button", new { label = "Ekle", actionType = "query", queryId = "birimEkle" }))), message);
        AssertRejected(V2(CardQueries(), CardComponents(ActionBar(new { deleteQuery = "birimSil" }))),
            "'birimSil' sorgusu ızgara satırlarına bağlı; yalnız kayıt dizisinde kullanılabilir.");
    }

    [Fact]
    public void Rejects_iteration_root_that_is_not_a_stage_grid()
    {
        AssertRejected(V2([.. CardQueries().Take(5), BirimOku(),
                Op("birimEkle", "insert", "stok.kart.birimEkle", "manual", P("id", "{{liste.seciliSatir.id}}", "guid"),
                    P("unitCode", "{{ad.eklenenSatir.unitCode}}"), P("factorToBase", "{{ad.value}}", "decimal"))],
                CardComponents()),
            "'birimEkle' sorgusundaki 'unitCode' parametresi stage kipinde bir düzenlenebilir tabloya bağlanmalıdır.");
    }

    [Fact]
    public void Accepts_sequence_button()
    {
        AssertAccepted(V2(CardQueries(), CardComponents(C("b1", "button", new
        {
            label = "Kaydet", actionType = "sequence", saveSequence = new[] { "guncelle", "birimEkle" }, stopOnError = false,
            confirmEnabled = true, confirmText = "Kaydedilsin mi?", successMessage = "Kaydedildi", refreshQueries = new[] { "kartlar" }
        }))));
    }

    [Fact]
    public void Rejects_sequence_button_with_query_id()
    {
        AssertRejected(V2(CardQueries(), CardComponents(C("b1", "button", new { label = "K", actionType = "sequence", saveSequence = new[] { "guncelle" }, queryId = "guncelle" }))),
            "Kayıt dizisi düğmesinde 'queryId' kullanılamaz.");
        AssertRejected(V2(CardQueries(), CardComponents(C("b1", "button", new { label = "K", actionType = "sequence" }))),
            "Kayıt dizisi düğmesi için 'saveSequence' gerekli.");
        // saveSequence belongs to sequence buttons only.
        AssertRejected(V2(CardQueries(), CardComponents(C("b1", "button", new { label = "K", actionType = "query", queryId = "guncelle", saveSequence = new[] { "guncelle" } }))),
            "'saveSequence'");
        AssertRejected(V2(CardQueries(), CardComponents(C("h1", "heading", new { text = "x", saveSequence = new[] { "guncelle" } }))), "'saveSequence'");
    }

    [Fact]
    public void Accepts_dialog_save_sequence()
    {
        AssertAccepted(V2(CardQueries(), CardComponents(Input("i3", "not"),
            N("dlg", "dialog", "pencere", new
            {
                title = "Birimler: {{kart.rows[0].code}}", contains = new[] { "i3", "g1" }, presentation = "drawer",
                saveSequence = new[] { "birimEkle", "birimSil" }, saveLabel = "Kaydet", closeOnSave = true, resetOnOpen = false, refreshQueries = new[] { "birimOku" }
            }),
            C("b1", "button", new { label = "Birimler", actionType = "openDialog", dialogId = "dlg" }))));
        AssertRejected(V2(CardQueries(), CardComponents(Input("i3", "not"),
            C("dlg", "dialog", new { contains = new[] { "i3" }, saveSequence = new[] { "guncelle" }, saveQuery = "guncelle" }))),
            "'saveSequence' ve 'saveQuery' birlikte kullanılamaz.");
    }

    // ---- Row actions and reason prompt ----

    private static object[] MovementQueries() =>
    [
        Liste(),
        Op("hareketler", "read", "stok.hareket.listele", "load", P("warehouseId", "{{depo.value}}", "guid"), P("stockItemId", "{{liste.seciliSatir.id}}", "guid")),
        Op("tersKayit", "insert", "stok.hareket.tersKayit", "manual", P("warehouseId", "{{depo.value}}", "guid"),
            P("stockItemId", "{{liste.seciliSatir.id}}", "guid"), P("entryId", "{{hareketTablo.seciliSatir.id}}", "guid"), P("reason", "{{ters.yanit}}"))
    ];

    private static object ReverseButton(string? name = "ters", object? props = null)
    {
        props ??= new
        {
            label = "Ters kayıt", actionType = "query", queryId = "tersKayit", promptLabel = "Gerekçe ({{liste.seciliSatir.code}})", promptRequired = true,
            disabledWhen = "hareketTablo.seciliSatir.hasReversal", disabledReason = "Bu hareketin ters kaydı var."
        };
        return name is null ? C("b1", "button", props) : N("b1", "button", name, props);
    }

    private static object[] MovementComponents(object? table = null, params object[] extra) =>
    [
        Input("i0", "arama"), Input("i1", "depo"),
        N("t1", "dataTable", "liste", new { query = "kartlar" }),
        table ?? N("t2", "dataTable", "hareketTablo", new { query = "hareketler", rowActions = new[] { "b1" }, emptyText = "Hareket yok.", limit = 50 }),
        ReverseButton(),
        .. extra
    ];

    [Fact]
    public void Accepts_row_actions_on_named_table()
    {
        AssertAccepted(V2(MovementQueries(), MovementComponents()));
    }

    [Fact]
    public void Rejects_row_actions_on_unnamed_table()
    {
        AssertRejected(V2(MovementQueries(), MovementComponents(C("t2", "dataTable", new { query = "hareketler", rowActions = new[] { "b1" } }))),
            "Satır işlemleri için veri listesinin adı olmalıdır: t2");
        AssertRejected(V2(MovementQueries(), MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler", rowActions = new[] { "i1" } }))),
            "'rowActions' 1–4 adet sorgu, kayıt dizisi, pencere, bağlantı, ERP ekranı veya sayfa düğmesi içermelidir.");
        AssertRejected(V2(MovementQueries(), MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler", rowActions = new[] { "b1", "b1" } }))),
            "'rowActions' 1–4 adet sorgu, kayıt dizisi, pencere, bağlantı, ERP ekranı veya sayfa düğmesi içermelidir.");
    }

    [Fact]
    public void Rejects_row_action_button_in_more_buttons()
    {
        AssertRejected(V2(MovementQueries(), MovementComponents(null, ActionBar(new { moreButtons = new[] { "b1" } }))),
            "Satır işlemi düğmesi İşlem Çubuğu menüsünde kullanılamaz: b1");
    }

    [Fact]
    public void Rejects_row_action_button_owned_by_tab()
    {
        AssertRejected(V2(MovementQueries(), MovementComponents(null, C("tb", "tabs", new { tabs = new[] { "Genel=b1" } }))),
            "'b1' birden fazla sekmede veya yerleşimde kullanılamaz.");
    }

    [Fact]
    public void Rejects_limit_on_server_paged_table()
    {
        AssertRejected(V2(MovementQueries(), MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler", paging = "server", limit = 10 }))),
            "'limit' sunucu sayfalı listede kullanılamaz.");
        AssertRejected(V2(MovementQueries(), MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler", limit = 101 }))), "'limit'");
    }

    [Fact]
    public void Accepts_prompt_on_named_button()
    {
        AssertAccepted(V2(MovementQueries(), MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler" }))));
    }

    [Fact]
    public void Rejects_prompt_on_unnamed_button()
    {
        AssertRejected(V2(MovementQueries(), [.. MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler" })).SkipLast(1),
                ReverseButton(null)]),
            "Gerekçe soran düğmenin adı olmalıdır: b1");
        AssertRejected(V2(MovementQueries(), [.. MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler" })).SkipLast(1),
                ReverseButton("ters", new { label = "x", promptLabel = new string('a', 61), actionType = "query", queryId = "tersKayit" })]), "60");
    }

    [Fact]
    public void Rejects_prompt_required_without_label()
    {
        AssertRejected(V2(MovementQueries(), [.. MovementComponents(N("t2", "dataTable", "hareketTablo", new { query = "hareketler" })).SkipLast(1),
                ReverseButton("ters", new { label = "x", actionType = "query", queryId = "tersKayit", promptRequired = true })]),
            "'promptRequired' için 'promptLabel' de tanımlı olmalıdır.");
    }

    // ---- Editable grid ----

    [Fact]
    public void Accepts_stage_grid_on_units()
    {
        AssertAccepted(V2(CardQueries(), CardComponents()));
    }

    [Fact]
    public void Rejects_stage_grid_without_source()
    {
        const string message = "'sourceQuery' yalnız stage kipinde ve sayfadaki bir okuma sorgusu olabilir.";
        AssertRejected(V2([Liste(), Kart()], [N("g1", "editableGrid", "birimler", new { gridMode = "stage", gridColumns = new[] { "a|A|text" } })]), message);
        AssertRejected(V2([Liste(), Kart(), Guncelle()], [N("g1", "editableGrid", "birimler", new { gridMode = "stage", sourceQuery = "guncelle", gridColumns = new[] { "a|A|text" } })]), message);
        AssertRejected(V2([Liste(), Kart()], [N("g1", "editableGrid", "birimler", new { gridMode = "list", sourceQuery = "kart", gridColumns = new[] { "a|A|text" } })]), message);
        AssertRejected(V2([Liste(), Kart()], [N("g1", "editableGrid", "birimler", new { gridMode = "stage", sourceQuery = "kart", rowKey = "yok", gridColumns = new[] { "a|A|text" } })]),
            "'rowKey' kaynak sorgunun sütunu olmalıdır: yok");
        AssertRejected(V2([Liste(), Kart()], [N("g1", "editableGrid", "birimler", new { gridMode = "stage", sourceQuery = "kart", gridColumns = new[] { "a|A|money" } })]),
            "'gridColumns' öğesi geçersiz: ");
        AssertRejected(V2([Liste(), Kart()], [N("g1", "editableGrid", "birimler", new { gridMode = "stage", sourceQuery = "kart", gridColumns = new[] { "a|A|text", "a|B|text" } })]),
            "'gridColumns'");
        AssertRejected(V2([Liste(), Kart()], [N("g1", "editableGrid", "birimler", new { gridMode = "tablo", gridColumns = new[] { "a|A|text" } })]),
            "'gridMode' stage, list veya matrix olmalıdır.");
    }

    [Fact]
    public void Rejects_grid_without_name()
    {
        AssertRejected(V2([Liste(), Kart()], [C("g1", "editableGrid", new { gridMode = "list", gridColumns = new[] { "a|A|text" } })]),
            "Düzenlenebilir tablonun adı olmalıdır: g1");
        AssertRejected(V2([Liste(), Kart()], [new { id = "g1", type = "editableGrid", name = "birimler" }]), "props gerekli");
    }

    private static object VariantGrid(object? props = null) =>
        N("g2", "editableGrid", "varyant", props ?? new { gridMode = "matrix", matrixCode = "{{kod.value}}", matrixName = "{{ad.value}}", title = "Varyantlar" });

    [Fact]
    public void Accepts_matrix_grid_bound_to_variants()
    {
        AssertAccepted(V2([Olustur(P("variants", "{{varyant.satirlar}}", "list"))], [Input("i1", "kod"), Input("i2", "ad"), VariantGrid()]));
    }

    [Fact]
    public void Rejects_matrix_grid_without_prefixes()
    {
        AssertRejected(V2([Olustur(P("variants", "{{varyant.satirlar}}", "list"))], [Input("i1", "kod"), Input("i2", "ad"),
                VariantGrid(new { gridMode = "matrix", matrixCode = "{{kod.value}}" })]),
            "Varyant tablosu için 'matrixCode' ve 'matrixName' gerekli.");
        AssertRejected(V2([Olustur()], [Input("i1", "kod"), Input("i2", "ad"),
                VariantGrid(new { gridMode = "matrix", matrixCode = "{{kod.value}}", matrixName = "{{ad.value}}", gridColumns = new[] { "a|A|text" } })]),
            "'gridColumns'");
    }

    private static object HareketEkle(string trackingBinding = "{{lot.satirlar}}") =>
        Op("hareketEkle", "insert", "stok.hareket.ekle", "manual", P("warehouseId", "{{depo.value}}", "guid"), P("stockItemId", "{{liste.seciliSatir.id}}", "guid"),
            P("entryDate", "{{tarih.value}}", "date"), P("direction", "{{yon.value}}"), P("quantity", "{{miktar.value}}", "decimal"),
            P("description", "{{aciklama.value}}"), P("tracking", trackingBinding, "list"));

    private static object[] MovementInputs(params object[] extra) =>
    [
        Input("i1", "depo"), Input("i2", "tarih", "date"), Input("i3", "yon"), Input("i4", "miktar", "number"), Input("i5", "aciklama"),
        N("t1", "dataTable", "liste", new { query = "kartlar" }), Input("i0", "arama"),
        .. extra
    ];

    private static object LotGrid(params string[] extraColumns) => N("g3", "editableGrid", "lot", new
    {
        gridMode = "list", maxRows = 50,
        gridColumns = (string[])["trackingCode|Lot / seri|text|required,unique,upperCase", "quantity|Miktar|number|required,min:0.000001", "expiryDate|Son kullanma|date", .. extraColumns]
    });

    [Fact]
    public void Accepts_list_grid_bound_to_tracking()
    {
        AssertAccepted(V2([Liste(), HareketEkle()], MovementInputs(LotGrid())));
    }

    [Fact]
    public void Rejects_list_grid_column_not_in_items()
    {
        AssertRejected(V2([Liste(), HareketEkle()], MovementInputs(LotGrid("foo|Foo|text"))),
            "'lot' tablosunun 'foo' sütunu 'tracking' parametresinin alanlarında yok.");
        // A dotted column needs a map item: trackingCode is text.
        AssertRejected(V2([Liste(), HareketEkle()], MovementInputs(LotGrid("trackingCode.Renk|Renk|text"))),
            "'lot' tablosunun 'trackingCode.Renk' sütunu 'tracking' parametresinin alanlarında yok.");
    }

    [Fact]
    public void Rejects_stage_grid_bound_to_list_parameter()
    {
        AssertRejected(V2([Liste(), Kart(), BirimOku(), HareketEkle("{{birimler.satirlar}}")], MovementInputs(StageGrid())),
            "'hareketEkle' sorgusundaki 'tracking' parametresi listeli veya varyant kipinde bir düzenlenebilir tabloya bağlanmalıdır.");
        AssertRejected(V2([Liste(), HareketEkle("{{yok.satirlar}}")], MovementInputs()),
            "'hareketEkle' sorgusundaki 'tracking' parametresi listeli veya varyant kipinde bir düzenlenebilir tabloya bağlanmalıdır.");
    }

    // ---- Custom fields ----

    private static object Tanimlar(string operation = "stok.ozelAlanTanimlari") => Op("tanimlar", "read", operation, "load");
    private static object DegerOku() => Op("degerOku", "read", "stok.kart.ozelAlanDegerleri", "load", P("id", "{{liste.seciliSatir.id}}", "guid"));
    private static object AlanKaydet(string binding = "{{ozel.degerler}}") =>
        Op("alanKaydet", "update", "stok.kart.ozelAlanKaydet", "manual", P("id", "{{liste.seciliSatir.id}}", "guid"), P("values", binding, "map"));

    private static object Block(object? props = null) =>
        N("cf", "customFieldsBlock", "ozel", props ?? new { definitionsQuery = "tanimlar", valuesQuery = "degerOku", columns = 2, title = "Özel alanlar" });

    [Fact]
    public void Accepts_custom_fields_block_with_definitions_and_values()
    {
        AssertAccepted(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet()],
            [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block()]));
        AssertRejected(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet()],
            [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block(new { definitionsQuery = "tanimlar", columns = 4 })]),
            "Form kartının 'columns' değeri 1, 2 veya 3 olmalıdır.");
        AssertRejected(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet()],
            [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), C("cf", "customFieldsBlock", new { definitionsQuery = "tanimlar" })]),
            "Özel alanlar bloğunun adı olmalıdır: cf");
        AssertRejected(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet()],
            [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block(new { definitionsQuery = "tanimlar", valuesQuery = "tanimlar" })]),
            "'valuesQuery' sorgusunun sonucu code ve value sütunlarını içermelidir.");
    }

    [Fact]
    public void Rejects_body_map_block_whose_values_query_is_not_the_source_read()
    {
        const string message = "'alanKaydet' sorgusundaki 'values' parametresi: 'ozel' bloğunun 'valuesQuery' sorgusu 'stok.kart.ozelAlanDegerleri' okuma sorgusu olmalıdır; aksi halde kayıtlı özel alan değerleri silinebilir.";
        var components = new[] { Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block(new { definitionsQuery = "tanimlar" }) };
        // No valuesQuery: every untouched code would be sent as "" and wipe the stored values.
        AssertRejected(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet()], components), message);
        // A valuesQuery that is another read (here the definitions) is rejected too.
        AssertRejected(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet(), Op("baskaDeger", "read", "stok.ozelAlanTanimlari", "load")],
                [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block(new { definitionsQuery = "tanimlar", valuesQuery = "baskaDeger" })]),
            "'valuesQuery' sorgusunun sonucu code ve value sütunlarını içermelidir.");
        // A SQL read (columns unchecked) is still not the body map's source read.
        AssertRejected(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet(),
                new { id = "sqlDeger", name = "sqlDeger", kind = "read", sql = "SELECT N'A' AS code, N'B' AS value", parameters = Array.Empty<object>(), runOn = "load" }],
                [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block(new { definitionsQuery = "tanimlar", valuesQuery = "sqlDeger" })]),
            message);
        // A create (no body map) may use a block without valuesQuery.
        AssertAccepted(V2(CardQueries(Tanimlar(), Op("olustur2", "insert", "stok.kart.olustur", "manual", P("code", "{{kod.value}}"), P("name", "{{ad.value}}"),
            P("customFields", "{{ozel.degerler}}", "map"))), CardComponents(Block(new { definitionsQuery = "tanimlar" }))));
    }

    [Fact]
    public void Rejects_definitions_query_without_required_columns()
    {
        AssertRejected(V2([Liste(), Tanimlar("depo.listele"), DegerOku(), AlanKaydet()],
                [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Block()]),
            "'definitionsQuery' sorgusunun sonucu code, label ve dataType sütunlarını içermelidir.");
    }

    [Fact]
    public void Rejects_map_parameter_bound_to_grid()
    {
        AssertRejected(V2(CardQueries(Op("olustur2", "insert", "stok.kart.olustur", "manual", P("code", "{{kod.value}}"), P("name", "{{ad.value}}"),
                P("customFields", "{{birimler.degerler}}", "map"))), CardComponents()),
            "'olustur2' sorgusundaki 'customFields' parametresi bir özel alanlar bloğuna bağlanmalıdır.");
    }

    // ---- Dialog ----

    private static object[] DialogPage(object dialogProps, params object[] extra) =>
    [
        .. MovementInputs(LotGrid()),
        N("dlg", "dialog", "hareketPenceresi", dialogProps),
        C("b1", "button", new { label = "Hareket ekle", actionType = "openDialog", dialogId = "dlg" }),
        .. extra
    ];

    [Fact]
    public void Accepts_dialog_owning_inputs_and_table()
    {
        AssertAccepted(V2([Liste(), HareketEkle()], DialogPage(new
        {
            title = "Stok hareketi", contains = new[] { "i2", "i3", "i4", "i5", "g3", "t1" }, saveQuery = "hareketEkle", saveLabel = "Kaydet",
            refreshQueries = new[] { "kartlar" }
        })));
    }

    [Fact]
    public void Rejects_dialog_owning_actionBar()
    {
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "ab" } }, ActionBar(new { printEnabled = true }))),
            "Pencere pencere veya İşlem Çubuğu içeremez: ab");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "dlg2" } }, C("dlg2", "dialog", new { contains = new[] { "i2" } }))),
            "Pencere pencere veya İşlem Çubuğu içeremez: dlg2");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "yok" } })), "Pencerenin bileşeni sayfada yok: yok");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "h2" } },
                new { id = "s1", type = "section", children = new object[] { C("h2", "heading", new { text = "iç" }) } })),
            "Pencereler yalnız üst düzey bileşenleri içerebilir: h2");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" }, presentation = "modal" })), "'presentation'");
    }

    [Fact]
    public void Accepts_dialog_size_and_backdrop_close()
    {
        foreach (var size in new[] { "sm", "md", "lg", "full" })
            AssertAccepted(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" }, size, backdropClose = true })));
        AssertAccepted(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" }, presentation = "drawer", size = "lg", backdropClose = false })));
    }

    [Fact]
    public void Rejects_invalid_dialog_size_and_backdrop_close()
    {
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" }, size = "xl" })), "'size' sm, md, lg veya full olmalıdır.");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" }, size = 3 })), "'size' sm, md, lg veya full olmalıdır.");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" }, backdropClose = "true" })), "'backdropClose' true veya false olmalıdır.");
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" } }, C("b2", "button", new { label = "X", backdropClose = true }))),
            "'backdropClose' özelliği bu bileşen türünde kullanılamaz.");
    }

    [Fact]
    public void Rejects_tab_owning_dialog()
    {
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" } }, C("tb", "tabs", new { tabs = new[] { "Genel=dlg" } }))),
            "Sekmeler pencere bileşeni içeremez: dlg");
    }

    [Fact]
    public void Rejects_component_in_dialog_and_tab()
    {
        AssertRejected(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "i2" } }, C("tb", "tabs", new { tabs = new[] { "Genel=i2" } }))),
            "'i2' birden fazla sekmede veya yerleşimde kullanılamaz.");
        // A dialog may own a tabs component.
        AssertAccepted(V2([Liste(), HareketEkle()], DialogPage(new { contains = new[] { "tb" } }, C("tb", "tabs", new { tabs = new[] { "Genel=i2,i3" } }))));
    }

    [Fact]
    public void Rejects_open_dialog_button_without_dialog()
    {
        AssertRejected(V2([Liste()], [C("b1", "button", new { label = "Aç", actionType = "openDialog" })]), "Pencere açan düğme için 'dialogId' gerekli.");
        AssertRejected(V2([Liste()], [C("b1", "button", new { label = "Aç", actionType = "openDialog", dialogId = "yok" })]), "Açılacak pencere sayfada yok: yok");
        AssertRejected(V2([Liste()], [C("h1", "heading", new { text = "x" }), C("b1", "button", new { label = "Aç", actionType = "openDialog", dialogId = "h1" })]),
            "Açılacak pencere sayfada yok: h1");
        AssertRejected(V2([Liste()], [C("b1", "button", new { label = "Aç", actionType = "workflow", dialogId = "yok" })]), "'dialogId'");
    }

    // ---- Image and change tracking ----

    [Fact]
    public void Accepts_image_with_bound_value()
    {
        AssertAccepted(V2([Liste(), Kart()], [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }),
            C("img", "image", new { value = "{{kart.rows[0].productImageUrl}}", title = "Ürün görseli", height = 160, fit = "contain", visibleWhen = "kart.rows[0].productImageUrl != ''" })]));
    }

    [Fact]
    public void Rejects_image_height_out_of_range()
    {
        AssertRejected(V2([], [C("img", "image", new { value = "https://example.test/a.png", height = 20 })]), "'height'");
        AssertRejected(V2([], [C("img", "image", new { value = "https://example.test/a.png", height = 401 })]), "'height'");
        AssertRejected(V2([], [C("img", "image", new { value = "https://example.test/a.png", fit = "fill" })]), "'fit'");
        AssertRejected(V2([], [C("h1", "heading", new { text = "x", height = 100 })]), "'height'");
    }

    [Fact]
    public void Accepts_form_card_record_key_and_track_changes()
    {
        AssertAccepted(V2([Liste(), Kart()], [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }), Input("i2", "ad"),
            C("fc", "formCard", new { inputs = new[] { "i2" }, recordKey = "{{kart.rows[0].id}}", trackChanges = true })]));
        AssertRejected(V2([], [Input("i2", "ad"), C("fc", "formCard", new { inputs = new[] { "i2" }, trackChanges = "evet" })]), "'trackChanges'");
        AssertRejected(V2([], [C("h1", "heading", new { text = "x", recordKey = "{{bugun}}" })]), "'recordKey'");
    }

    // ---- Caps and shared props ----

    private static object[] Headings(int count) => Enumerable.Range(0, count).Select(i => C($"h{i}", "heading", new { text = "x" })).ToArray();

    [Fact]
    public void Accepts_120_components_in_v2()
    {
        AssertAccepted(V2([], Headings(120)));
        AssertRejected(V2([], Headings(121)), "120");
        AssertAccepted(V2([], [new { id = "s1", type = "section", children = Headings(120) }]));
    }

    [Fact]
    public void Keeps_80_components_in_v1()
    {
        Assert.True(TenantCustomPageSchema.Validate(JsonSerializer.Serialize(new { schemaVersion = 1, components = Headings(80) }), out var error), error);
        Assert.False(TenantCustomPageSchema.Validate(JsonSerializer.Serialize(new { schemaVersion = 1, components = Headings(81) }), out error));
        Assert.Contains("80", error);
        Assert.False(TenantCustomPageSchema.Validate(JsonSerializer.Serialize(new { schemaVersion = 1, components = new[] { new { id = "s1", type = "section", children = Headings(81) } } }), out _));
    }

    [Fact]
    public void Accepts_disabledWhen_on_editable_grid()
    {
        AssertAccepted(V2(CardQueries(), CardComponents()[..4]
            .Append(StageGrid(new
            {
                gridMode = "stage", sourceQuery = "birimOku", gridColumns = new[] { "unitCode|Birim|text|required", "factorToBase|Katsayı|number" },
                disabledWhen = "kullanici.rol != 'TenantAdmin'", disabledReason = "Birimleri yalnız yönetici değiştirebilir."
            })).ToArray()));
        AssertAccepted(V2([Liste(), Tanimlar(), DegerOku(), AlanKaydet()],
            [Input("i0", "arama"), N("t1", "dataTable", "liste", new { query = "kartlar" }),
                Block(new { definitionsQuery = "tanimlar", valuesQuery = "degerOku", disabledWhen = "liste.seciliSatir == null", disabledReason = "Önce bir kart seçin." })]));
    }
}
