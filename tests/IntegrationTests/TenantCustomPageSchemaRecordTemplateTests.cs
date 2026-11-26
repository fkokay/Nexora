using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Sub-project 4: the "record" (Kayıt kartı) template, the input <c>readOnly</c> prop and <c>pageSize</c> on lines tables.</summary>
public sealed class TenantCustomPageSchemaRecordTemplateTests
{
    private static readonly object[] RecordQuery =
        [new { id = "kayit", name = "kayit", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" }];

    private static object Template => new { name = "record" };

    private static string Page(object? template, object[] components, object[]? queries = null) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["template"] = template,
        ["queries"] = queries ?? RecordQuery,
        ["components"] = components
    }.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value));

    private static object Summary(string id = "ozet") => new { id, type = "recordHeader", name = id, props = new { slot = "summary", title = "Kart" } };
    private static object Tabs(params string[] tabs) => TabsAs("sekmeler", tabs);
    private static object TabsAs(string id, params string[] tabs) => new { id, type = "tabs", name = id, props = new { slot = "tabs", tabs } };
    private static object Section(string id, params string[] inputs) => new { id, type = "formCard", name = id, props = new { slot = "section", inputs } };
    private static object Field(string id, object? extra = null) =>
        new { id, type = "input", name = id, props = Merge(new Dictionary<string, object?> { ["slot"] = "field", ["label"] = "Ad" }, extra) };
    private static object Lines(string id = "l1", object? extra = null) =>
        new { id, type = "dataTable", name = id, props = Merge(new Dictionary<string, object?> { ["query"] = "kayit", ["slot"] = "lines" }, extra) };
    private static object Note(string id = "n1") => new { id, type = "text", name = id, props = new { slot = "note", text = "Açıklama" } };

    /// <summary>Summary, one tab with one section holding one field.</summary>
    private static object[] Minimal() => [Summary(), Tabs("Genel=b1"), Section("b1", "a1"), Field("a1")];

    private static Dictionary<string, object?> Merge(Dictionary<string, object?> props, object? extra)
    {
        if (extra is not null)
            foreach (var property in extra.GetType().GetProperties()) props[property.Name] = property.GetValue(extra);
        return props;
    }

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Minimal_record_page_is_accepted()
    {
        Accepted(Page(Template, Minimal()));
        // Every slot used once: actions, lines, note, above, below and an empty tab.
        var button = new { id = "k1", type = "button", name = "k1", props = new { slot = "actions", label = "Kaydet" } };
        var above = new { id = "h1", type = "heading", name = "h1", props = new { slot = "above", text = "Üst" } };
        var below = new { id = "h2", type = "heading", name = "h2", props = new { slot = "below", text = "Alt" } };
        Accepted(Page(Template, [Summary(), button, Tabs(["Genel=b1,n1", "Satırlar=l1", "Boş="]), Section("b1", "a1"), Field("a1"), Lines(), Note(), above, below]));
    }

    [Fact]
    public void Unknown_template_name_is_rejected()
    {
        Rejected(Page(new { name = "card" }, Minimal()), "Kalıp yalnız \"list\", \"record\" ya da \"belge\" olabilir.");
        Rejected(Page(new { name = "record", level = 1 }, Minimal()), "Kalıp yalnız \"list\", \"record\" ya da \"belge\" olabilir.");
    }

    [Fact]
    public void Component_without_record_slot_is_rejected()
    {
        // List slots are not record slots.
        var heading = new { id = "h1", type = "heading", name = "h1", props = new { slot = "indicators", text = "x" } };
        Rejected(Page(Template, [.. Minimal(), heading]), "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.");
    }

    [Fact]
    public void Record_without_summary_is_rejected()
    {
        Rejected(Page(Template, [Tabs("Genel=b1"), Section("b1", "a1"), Field("a1")]), "Kayıt kartında tam bir kayıt özeti (recordHeader) olmalı.");
        Rejected(Page(Template, [.. Minimal(), Summary("ozet2")]), "Kayıt kartında tam bir kayıt özeti (recordHeader) olmalı.");
    }

    [Fact]
    public void Record_with_two_tabs_components_is_rejected()
    {
        Rejected(Page(Template, [.. Minimal(), TabsAs("sekmeler2", "Diğer=")]), "Kayıt kartında tam bir sekme bileşeni (tabs) olmalı.");
        Rejected(Page(Template, [Summary(), Section("b1", "a1"), Field("a1")]), "Kayıt kartında tam bir sekme bileşeni (tabs) olmalı.");
    }

    [Fact]
    public void Section_not_in_any_tab_is_rejected() =>
        Rejected(Page(Template, [.. Minimal(), Section("b2", "a2"), Field("a2")]), "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı.");

    [Fact]
    public void Lines_table_not_in_any_tab_is_rejected()
    {
        Rejected(Page(Template, [.. Minimal(), Lines()]), "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı.");
        Rejected(Page(Template, [.. Minimal(), Note()]), "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı.");
    }

    [Fact]
    public void Field_without_section_is_rejected() =>
        Rejected(Page(Template, [.. Minimal(), Field("a2")]), "Kayıt kartında her alan tam bir bölüme ait olmalı.");

    [Fact]
    public void Metric_in_section_slot_is_rejected()
    {
        var metric = new { id = "m1", type = "metric", name = "m1", props = new { slot = "section", title = "Toplam", value = "1" } };
        Rejected(Page(Template, [Summary(), Tabs("Genel=m1"), metric]), "'section' yerine 'metric' bileşeni konamaz; bu yere yalnız 'formCard' konabilir.");
        var heading = new { id = "h1", type = "heading", name = "h1", props = new { slot = "summary", text = "x" } };
        Rejected(Page(Template, [heading, Tabs("Genel=b1"), Section("b1", "a1"), Field("a1")]), "'summary' yerine 'heading' bileşeni konamaz; bu yere yalnız 'recordHeader' konabilir.");
    }

    [Fact]
    public void Empty_section_is_accepted_on_record_page()
    {
        Accepted(Page(Template, [Summary(), Tabs("Genel=b1"), Section("b1")]));
        Accepted(Page(Template, [Summary(), Tabs("Genel=b1,b2", "Boş="), Section("b1", "a1"), Field("a1"), Section("b2")]));
    }

    [Fact]
    public void Nested_empty_section_is_rejected_on_record_page()
    {
        object nested = new { id = "b2", type = "formCard", name = "b2", props = new { slot = "section", inputs = Array.Empty<string>() } };
        var card = new { id = "c1", type = "card", name = "c1", props = new { slot = "above" }, children = new[] { nested } };
        Rejected(Page(Template, [.. Minimal(), card]), "'inputs' 1–12 adet giriş bileşeni kimliği içeren bir dizi olmalıdır.");
    }

    [Fact]
    public void Empty_form_card_still_rejected_on_legacy_page()
    {
        var card = new { id = "b1", type = "formCard", name = "b1", props = new { inputs = Array.Empty<string>() } };
        Rejected(Page(null, [card]), "'inputs' 1–12 adet giriş bileşeni kimliği içeren bir dizi olmalıdır.");
        var listCard = new { id = "b1", type = "formCard", name = "b1", props = new { slot = "above", inputs = Array.Empty<string>() } };
        var list = new { id = "t1", type = "dataTable", name = "t1", props = new { query = "kayit", slot = "list" } };
        Rejected(Page(new { name = "list" }, [list, listCard]), "'inputs' 1–12 adet giriş bileşeni kimliği içeren bir dizi olmalıdır.");
    }

    [Fact]
    public void ReadOnly_only_on_input()
    {
        Accepted(Page(Template, [Summary(), Tabs("Genel=b1"), Section("b1", "a1"), Field("a1", new { readOnly = true, placeholder = "(otomatik)" })]));
        Rejected(Page(Template, [Summary(), Tabs("Genel=b1"), Section("b1", "a1"), Field("a1", new { readOnly = "evet" })]), "'readOnly' doğru ya da yanlış olmalıdır.");
        var heading = new { id = "h1", type = "heading", name = "h1", props = new { text = "x", readOnly = true } };
        Rejected(Page(null, [heading]), "'readOnly' özelliği bu bileşen türünde kullanılamaz.");
    }

    [Fact]
    public void ReadOnly_input_is_accepted_on_legacy_page()
    {
        var input = new { id = "a1", type = "input", name = "a1", props = new { label = "Kod", readOnly = true } };
        Accepted(Page(null, [input]));
        Accepted(Page(null, [new { id = "a1", type = "input", name = "a1", props = new { label = "Kod", readOnly = false } }]));
        // v1 pages never had it (v1 has no input type either; a v1 heading cannot carry it).
        Rejected(JsonSerializer.Serialize(new { schemaVersion = 1, components = new[] { new { id = "h1", type = "heading", props = new { text = "x", readOnly = true } } } }),
            "Bileşen özellikleri izin verilen statik alanlarla sınırlıdır.");
    }

    [Theory]
    [InlineData(10)]
    [InlineData(25)]
    [InlineData(100)]
    public void Lines_table_page_size_is_accepted_on_record_page(int pageSize) =>
        Accepted(Page(Template, [Summary(), Tabs(["Genel=b1", "Satırlar=l1"]), Section("b1", "a1"), Field("a1"), Lines(extra: new { pageSize })]));

    [Fact]
    public void Lines_table_page_size_outside_choices_is_rejected()
    {
        object[] Components(object extra) => [Summary(), Tabs(["Genel=b1", "Satırlar=l1"]), Section("b1", "a1"), Field("a1"), Lines(extra: extra)];
        Rejected(Page(Template, Components(new { pageSize = 7 })), "Sayfa başına kayıt 10, 25, 50 ya da 100 olmalı.");
        Rejected(Page(Template, Components(new { pageSize = 25, pageParam = "p" })), "'pageParam' yalnız sunucu sayfalı");
    }

    [Fact]
    public void Page_size_still_rejected_on_legacy_table()
    {
        Rejected(Page(null, [Lines(extra: new { pageSize = 25 })]), "'pageSize' yalnız sunucu sayfalı (paging: server) veri listesinde kullanılabilir.");
        // A list template's lines-slot table and a nested lines table get no exemption.
        var list = new { id = "t1", type = "dataTable", name = "t1", props = new { query = "kayit", slot = "list" } };
        Rejected(Page(new { name = "list" }, [list, Lines(extra: new { pageSize = 25 })]), "'pageSize' yalnız sunucu sayfalı");
        object nested = new { id = "l2", type = "dataTable", name = "l2", props = new { query = "kayit", slot = "lines", pageSize = 25 } };
        var card = new { id = "c1", type = "card", name = "c1", props = new { slot = "above" }, children = new[] { nested } };
        Rejected(Page(Template, [.. Minimal(), card]), "'pageSize' yalnız sunucu sayfalı");
    }

    [Fact]
    public void Width_and_action_bar_rejected_on_record_page()
    {
        Rejected(Page(Template, [Summary(), Tabs("Genel=b1"), Section("b1", "a1"), Field("a1", new { width = 6 })]), "Kalıplı sayfada genişlik ayarı kullanılmaz.");
        Rejected(Page(Template, [Summary(), Tabs("Genel=b1"), Section("b1", "a1"), Field("a1", new { widthWhen = "6=a1.value == 1" })]), "Kalıplı sayfada genişlik ayarı kullanılmaz.");
        var bar = new { id = "ab", type = "actionBar", name = "ab", props = new { slot = "actions", exportTable = "l1" } };
        Rejected(Page(Template, [Summary(), Tabs(["Genel=b1", "Satırlar=l1"]), Section("b1", "a1"), Field("a1"), Lines(), bar]),
            "Kalıplı sayfada işlem çubuğu bileşeni kullanılmaz; düğmeler 'actions' yerine konur.");
        foreach (var type in new[] { "spacer", "divider" })
            Rejected(Page(Template, [.. Minimal(), new { id = "x1", type, props = new { slot = "above" } }]), "Kalıplı sayfada boşluk ve ayırıcı bileşenleri kullanılmaz.");
    }

    [Fact]
    public async Task Record_template_round_trips_through_draft_preview_publish()
    {
        await using var app = await TenantCustomPageEndpointsIntegrationTests.StartApplicationAsync();
        using var client = app.GetTestClient();
        TenantCustomPageEndpointsIntegrationTests.SetIdentity(client, TenantCustomPageEndpointsIntegrationTests.TenantA, TenantCustomPageEndpointsIntegrationTests.UserA, "TenantAdmin");
        var definition = JsonDocument.Parse(Page(Template, [Summary(), Tabs("Genel=b1,b2", "Boş="), Section("b1", "a1"), Field("a1", new { readOnly = true }), Section("b2")])).RootElement;

        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "kayit-karti", name = "Kayıt kartı", definition });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var detail = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = detail.GetProperty("id").GetGuid();
        AssertRecord(detail.GetProperty("definitionJson").GetString()!);

        var preview = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{id}/preview");
        AssertRecord(preview.GetProperty("definitionJson").GetString()!);

        var bad = await client.PutAsJsonAsync($"/api/custom-pages/{id}", new { expectedRevision = 1, name = "Kayıt kartı", definition = JsonDocument.Parse(Page(Template, Minimal()[1..])).RootElement });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            platform.TenantCustomPageAccesses.Add(new TenantCustomPageAccess
            {
                TenantId = TenantCustomPageEndpointsIntegrationTests.TenantA, PageCode = "kayit-karti",
                Mode = CustomPageAccessModes.AllUsers, UpdatedByUserId = TenantCustomPageEndpointsIntegrationTests.UserA
            });
            await platform.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        var runtime = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/kayit-karti/published");
        AssertRecord(runtime.GetProperty("definitionJson").GetString()!);
    }

    private static void AssertRecord(string definitionJson)
    {
        using var document = JsonDocument.Parse(definitionJson);
        Assert.Equal("record", document.RootElement.GetProperty("template").GetProperty("name").GetString());
        var components = document.RootElement.GetProperty("components");
        Assert.Equal("summary", components[0].GetProperty("props").GetProperty("slot").GetString());
        Assert.True(components[3].GetProperty("props").GetProperty("readOnly").GetBoolean());
        Assert.Equal(0, components[4].GetProperty("props").GetProperty("inputs").GetArrayLength());
    }
}
