using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Sub-project 3: the root <c>template</c> ("list") and the <c>slot</c> rules of a templated page.</summary>
public sealed class TenantCustomPageSchemaListTemplateTests
{
    private static readonly object[] ReadQuery =
        [new { id = "q1", name = "veri", kind = "read", sql = "SELECT 1 AS x", parameters = Array.Empty<object>(), runOn = "load" }];

    private static string Page(object? template, object[] components, object[]? queries = null) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["template"] = template,
        ["queries"] = queries ?? ReadQuery,
        ["components"] = components
    }.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value));

    private static object List(string slot = "list", object? extra = null, string id = "t1", string query = "q1") =>
        new { id, type = "dataTable", name = id, props = Merge(new Dictionary<string, object?> { ["query"] = query, ["slot"] = slot }, extra) };

    private static Dictionary<string, object?> Merge(Dictionary<string, object?> props, object? extra)
    {
        if (extra is not null)
            foreach (var property in extra.GetType().GetProperties()) props[property.Name] = property.GetValue(extra);
        return props;
    }

    private static object Template => new { name = "list" };

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void List_template_minimal_page_is_accepted()
    {
        Accepted(Page(Template, [List()]));
        Accepted(Page(Template, [List(extra: new { striped = true, hideOnMobile = false })]));
        Accepted(Page(Template, [new { id = "m1", type = "metric", name = "m1", props = new { title = "Toplam", value = "1", slot = "indicators" } }, List()]));
    }

    [Fact]
    public void Unknown_template_name_is_rejected() =>
        Rejected(Page(new { name = "card" }, [List()]), "Kalıp yalnız \"list\" olabilir.");

    [Fact]
    public void Extra_template_key_is_rejected()
    {
        Rejected(Page(new { name = "list", level = 2 }, [List()]), "Kalıp yalnız \"list\" olabilir.");
        Rejected(Page("list", [List()]), "Kalıp yalnız \"list\" olabilir.");
    }

    [Fact]
    public void Component_without_slot_is_rejected_on_template_page()
    {
        var noSlot = new { id = "h1", type = "heading", name = "h1", props = new { text = "x" } };
        Rejected(Page(Template, [List(), noSlot]), "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.");
        Rejected(Page(Template, [List(), new { id = "h1", type = "heading", name = "h1", props = new { text = "x", slot = "yok" } }]), "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.");
    }

    [Fact]
    public void Two_list_tables_are_rejected()
    {
        Rejected(Page(Template, [List(), List(id: "t2")]), "Liste kalıbında tam bir liste (dataTable) olmalı.");
        Rejected(Page(Template, [new { id = "h1", type = "heading", name = "h1", props = new { text = "x", slot = "above" } }]), "Liste kalıbında tam bir liste (dataTable) olmalı.");
    }

    [Fact]
    public void List_table_must_be_bound_to_a_page_query()
    {
        var unbound = new { id = "t1", type = "dataTable", name = "t1", props = new { slot = "list" } };
        Rejected(Page(Template, [unbound]), "Liste kalıbında tam bir liste (dataTable) olmalı.");
    }

    [Fact]
    public void Width_is_rejected_on_template_page()
    {
        Rejected(Page(Template, [List(extra: new { width = 8 })]), "Kalıplı sayfada genişlik ayarı kullanılmaz.");
    }

    [Fact]
    public void ActionBar_is_rejected_on_template_page()
    {
        var bar = new { id = "ab", type = "actionBar", name = "ab", props = new { slot = "actions", exportTable = "t1" } };
        Rejected(Page(Template, [List(), bar]), "Kalıplı sayfada işlem çubuğu bileşeni kullanılmaz; düğmeler 'actions' yerine konur.");
    }

    [Fact]
    public void Spacer_and_divider_are_rejected_on_template_page()
    {
        foreach (var type in new[] { "spacer", "divider" })
            Rejected(Page(Template, [List(), new { id = "x1", type, props = new { slot = "above" } }]), "Kalıplı sayfada boşluk ve ayırıcı bileşenleri kullanılmaz.");
    }

    [Fact]
    public void Metric_only_in_indicators()
    {
        var metric = new { id = "m1", type = "metric", name = "m1", props = new { title = "Toplam", value = "1", slot = "list" } };
        Rejected(Page(Template, [metric, List(id: "t2")]), "bu yere yalnız 'dataTable' konabilir");
        var heading = new { id = "h1", type = "heading", name = "h1", props = new { text = "x", slot = "indicators" } };
        Rejected(Page(Template, [List(), heading]), "bu yere yalnız 'metric' konabilir");
    }

    [Fact]
    public void At_most_one_detail_panel_is_allowed()
    {
        object Panel(string id) => new { id, type = "contextPanel", name = id, props = new { slot = "detail", table = "t1", fields = new[] { "x=X" } } };
        Accepted(Page(Template, [List(), Panel("p1")]));
        Rejected(Page(Template, [List(), Panel("p1"), Panel("p2")]), "en fazla bir detay paneli");
    }

    [Fact]
    public void Slot_props_have_the_right_types()
    {
        Rejected(Page(Template, [List(extra: new { striped = "yes" })]), "'striped' doğru ya da yanlış olmalıdır.");
        Rejected(Page(Template, [List(extra: new { hideOnMobile = 1 })]), "'hideOnMobile' doğru ya da yanlış olmalıdır.");
        Rejected(Page(null, [new { id = "h1", type = "heading", props = new { text = "x", striped = true } }]), "'striped' özelliği bu bileşen türünde kullanılamaz.");
    }

    [Fact]
    public void Legacy_page_with_slot_prop_still_accepted_and_unchanged()
    {
        Accepted(Page(null, [List("above", id: "t1")]));
        Accepted(Page(null, [new { id = "h1", type = "heading", name = "h1", props = new { text = "x", width = 6, slot = "list" } }]));
        // No template: the v2 root keeps rejecting unknown keys, and v1 never accepts a template.
        Rejected(JsonSerializer.Serialize(new { schemaVersion = 1, template = new { name = "list" }, components = Array.Empty<object>() }), "components");
    }

    [Theory]
    [InlineData(10)]
    [InlineData(25)]
    [InlineData(50)]
    [InlineData(100)]
    public void List_slot_table_accepts_page_size_without_server_paging(int pageSize) =>
        Accepted(Page(Template, [List(extra: new { pageSize })]));

    [Fact]
    public void List_slot_table_rejects_page_size_outside_choices()
    {
        Rejected(Page(Template, [List(extra: new { pageSize = 7 })]), "Sayfa başına kayıt 10, 25, 50 ya da 100 olmalı.");
        Rejected(Page(Template, [List(extra: new { pageSize = "25" })]), "Sayfa başına kayıt 10, 25, 50 ya da 100 olmalı.");
        // Other server paging props stay forbidden without paging: server.
        Rejected(Page(Template, [List(extra: new { pageSize = 25, pageParam = "p" })]), "'pageParam' yalnız sunucu sayfalı");
    }

    [Fact]
    public void Legacy_table_still_requires_server_paging_for_page_size() =>
        Rejected(Page(null, [List(extra: new { pageSize = 25 })]), "'pageSize' yalnız sunucu sayfalı (paging: server) veri listesinde kullanılabilir.");

    [Fact]
    public void Nested_list_slot_table_cannot_use_page_size_exemption()
    {
        object nested = new { id = "n1", type = "dataTable", name = "n1", props = new { query = "q1", slot = "list", pageSize = 25 } };
        var card = new { id = "c1", type = "card", name = "c1", props = new { slot = "above" }, children = new[] { nested } };
        Rejected(Page(Template, [List(), card]), "'pageSize' yalnız sunucu sayfalı");
    }

    [Fact]
    public void Page_size_25_point_0_is_rejected() =>
        Rejected(Page(Template, [List(extra: new { pageSize = 25 })]).Replace("\"pageSize\":25", "\"pageSize\":25.0"), "Sayfa başına kayıt 10, 25, 50 ya da 100 olmalı.");

    [Fact]
    public void Non_list_slot_table_on_template_page_still_requires_server_paging() =>
        Rejected(Page(Template, [List(), List("below", new { pageSize = 25 }, id: "t2")]), "'pageSize' yalnız sunucu sayfalı");

    [Fact]
    public void System_standard_envelope_with_template_is_accepted()
    {
        var envelope = JsonNode.Parse(WarehouseStandardV1.Json)!.AsObject();
        var definition = envelope["definition"]!.AsObject();
        definition["template"] = new JsonObject { ["name"] = "list" };
        definition["components"]![0]!["props"]!["slot"] = "list";
        Assert.Empty(SystemPageStandards.Validate([(WarehouseStandardV1.ScreenKey + ".json", envelope.ToJsonString())]));

        definition["components"]![0]!["props"]!.AsObject().Remove("slot");
        var errors = SystemPageStandards.Validate([(WarehouseStandardV1.ScreenKey + ".json", envelope.ToJsonString())]);
        Assert.Contains(errors, x => x.Contains("Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Template_round_trips_through_draft_preview_publish_history_restore()
    {
        await using var app = await TenantCustomPageEndpointsIntegrationTests.StartApplicationAsync();
        using var client = app.GetTestClient();
        TenantCustomPageEndpointsIntegrationTests.SetIdentity(client, TenantCustomPageEndpointsIntegrationTests.TenantA, TenantCustomPageEndpointsIntegrationTests.UserA, "TenantAdmin");
        var definition = JsonDocument.Parse(Page(Template, [List()])).RootElement;

        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "kalipli-liste", name = "Kalıplı liste", definition });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var detail = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = detail.GetProperty("id").GetGuid();
        AssertTemplate(detail.GetProperty("definitionJson").GetString()!);

        var preview = await client.GetFromJsonAsync<JsonElement>($"/api/custom-pages/{id}/preview");
        AssertTemplate(preview.GetProperty("definitionJson").GetString()!);

        var bad = await client.PutAsJsonAsync($"/api/custom-pages/{id}", new { expectedRevision = 1, name = "Kalıplı liste", definition = JsonDocument.Parse(Page(new { name = "card" }, [List()])).RootElement });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        // A page with queries needs an explicit access row before it can be published.
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            platform.TenantCustomPageAccesses.Add(new TenantCustomPageAccess
            {
                TenantId = TenantCustomPageEndpointsIntegrationTests.TenantA, PageCode = "kalipli-liste",
                Mode = CustomPageAccessModes.AllUsers, UpdatedByUserId = TenantCustomPageEndpointsIntegrationTests.UserA
            });
            await platform.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        var runtime = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/kalipli-liste/published");
        AssertTemplate(runtime.GetProperty("definitionJson").GetString()!);

        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/custom-pages/{id}/history");
        Assert.All(history!, row => AssertTemplate(row.GetProperty("definitionJson").GetString()!));
        var revisionId = history![0].GetProperty("id").GetGuid();
        var restored = await client.PostAsync($"/api/custom-pages/{id}/restore/{revisionId}", null);
        Assert.Equal(HttpStatusCode.Created, restored.StatusCode);
        AssertTemplate((await restored.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("definitionJson").GetString()!);
    }

    private static void AssertTemplate(string definitionJson)
    {
        using var document = JsonDocument.Parse(definitionJson);
        Assert.Equal("list", document.RootElement.GetProperty("template").GetProperty("name").GetString());
        Assert.Equal("list", document.RootElement.GetProperty("components")[0].GetProperty("props").GetProperty("slot").GetString());
    }
}
