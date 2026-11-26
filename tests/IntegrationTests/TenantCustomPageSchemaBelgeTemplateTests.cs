using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 2: the "belge" template. Header fields and line columns are chosen by document model code.</summary>
public sealed class TenantCustomPageSchemaBelgeTemplateTests
{
    private static object Template(string? document = "satis.siparis") =>
        document is null ? new { name = "belge" } : new { name = "belge", document };

    internal static string Page(object? template, object[] components, object[]? queries = null) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["schemaVersion"] = 2,
        ["template"] = template,
        ["queries"] = queries,
        ["components"] = components
    }.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value));

    private static readonly string[] RequiredFields = ["customerId", "orderDate"];
    private static readonly string[] RequiredColumns = ["stockItemId", "quantity", "unitPrice"];

    private static object Fields(string[]? fields = null, object? labels = null) =>
        new { id = "baslik", type = "documentFields", props = new { slot = "fields", fields = fields ?? RequiredFields, labels = labels ?? new { } } };
    private static object Lines(string[]? columns = null, object? labels = null, string slot = "lines") =>
        new { id = "satirlar", type = "documentLines", props = new { slot, columns = columns ?? RequiredColumns, labels = labels ?? new { }, density = "normal" } };
    private static object Summary() => new { id = "toplamlar", type = "documentSummary", props = new { slot = "summary", vatBreakdown = true, activity = true } };

    internal static object[] Minimal() => [Fields(), Lines(), Summary()];

    private static void Accepted(string json) => Assert.True(TenantCustomPageSchema.Validate(json, out var error), error);

    private static void Rejected(string json, string contains)
    {
        Assert.False(TenantCustomPageSchema.Validate(json, out var error));
        Assert.Contains(contains, error);
    }

    [Fact]
    public void Minimal_belge_page_is_accepted_with_actions_above_and_below()
    {
        Accepted(Page(Template(), Minimal()));
        var above = new { id = "h1", type = "heading", name = "h1", props = new { slot = "above", text = "Üst" } };
        var below = new { id = "h2", type = "heading", name = "h2", props = new { slot = "below", text = "Alt" } };
        var button = new { id = "yazdir", type = "button", name = "yazdir", props = new { slot = "actions", label = "Yazdır" } };
        Accepted(Page(Template(), [Fields(["code", "customerId", "orderDate", "requestedDeliveryDate"], new { customerId = "Cari" }), Lines(), Summary(),
            above, below, button]));
    }

    [Fact]
    public void Missing_or_unknown_document_is_rejected()
    {
        Rejected(Page(Template(null), Minimal()), "Belge kalıbı bilinen bir belge ister");
        Rejected(Page(Template("satis.yok"), Minimal()), "Belge kalıbı bilinen bir belge ister");
    }

    [Fact]
    public void Document_key_is_only_for_belge()
    {
        Rejected(Page(new { name = "record", document = "satis.siparis" }, []), "Kalıp yalnız \"list\", \"record\" ya da \"belge\" olabilir.");
    }

    [Fact]
    public void Each_part_is_needed_once()
    {
        Rejected(Page(Template(), [Fields(), Summary()]), "'documentLines'");
        Rejected(Page(Template(), [Fields(), Lines(), Summary(), new { id = "ikinci", type = "documentSummary", props = new { slot = "summary" } }]),
            "'documentSummary'");
    }

    [Fact]
    public void Parts_stay_in_their_own_slot_and_belge_parts_need_the_belge_template()
    {
        Rejected(Page(Template(), [Fields(), Lines(slot: "below"), Summary()]), "'documentLines' yalnız 'lines' yerine konabilir.");
        Rejected(Page(new { name = "record" }, [Lines()]), "yalnız belge kalıbında");
        Rejected(Page(null, [Lines()]), "yalnız belge kalıbında");
    }

    [Fact]
    public void Unknown_duplicate_and_required_codes_are_rejected()
    {
        Rejected(Page(Template(), [Fields(["customerId", "orderDate", "vergiNo"]), Lines(), Summary()]), "'vergiNo' bu belgenin alanı değil.");
        Rejected(Page(Template(), [Fields(), Lines(["stockItemId", "quantity", "unitPrice", "renk"]), Summary()]), "'renk' bu belgenin kolonu değil.");
        Rejected(Page(Template(), [Fields(["customerId", "orderDate", "orderDate"]), Lines(), Summary()]), "'orderDate' iki kez seçilmiş.");
        Rejected(Page(Template(), [Fields(["orderDate"]), Lines(), Summary()]), "'Müşteri' zorunlu, gizlenemez.");
        Rejected(Page(Template(), [Fields(), Lines(["stockItemId", "quantity"]), Summary()]), "'Birim fiyat' zorunlu, gizlenemez.");
    }

    [Fact]
    public void Labels_belong_to_chosen_codes_and_stay_short()
    {
        Accepted(Page(Template(), [Fields(labels: new { customerId = "Cari" }), Lines(), Summary()]));
        Rejected(Page(Template(), [Fields(labels: new { customerId = new string('x', 61) }), Lines(), Summary()]), "en fazla 60 karakter");
        Rejected(Page(Template(), [Fields(labels: new { code = "No" }), Lines(), Summary()]), "'code' etiketi seçili olmayan");
    }

    [Fact]
    public void Grid_action_bar_width_and_foreign_props_are_rejected()
    {
        var grid = new { id = "kalemler", type = "editableGrid", name = "kalemler", props = new { slot = "below", title = "Kalemler" } };
        Rejected(Page(Template(), [.. Minimal(), grid]), "Belge sayfasında 'editableGrid' kullanılamaz");
        var bar = new { id = "komutlar", type = "actionBar", name = "komutlar", props = new { slot = "above", moreButtons = new[] { "yazdir" } } };
        var print = new { id = "yazdir", type = "button", name = "yazdir", props = new { slot = "actions", label = "Yazdır" } };
        Rejected(Page(Template(), [.. Minimal(), print, bar]), "işlem çubuğu");
        var wide = new { id = "h1", type = "heading", name = "h1", props = new { slot = "above", text = "Üst", width = 6 } };
        Rejected(Page(Template(), [.. Minimal(), wide]), "genişlik ayarı");
        Rejected(Page(Template(), [Fields(), new { id = "satirlar", type = "documentLines", props = new { slot = "lines", columns = RequiredColumns, fillQuery = "kalemKaynak" } }, Summary()]),
            "'documentLines' bileşeninde 'fillQuery' kullanılamaz.");
        Rejected(Page(Template(), [Fields(), new { id = "satirlar", type = "documentLines", props = new { slot = "lines", columns = RequiredColumns, density = "huge" } }, Summary()]),
            "'density' değeri geçersiz");
    }

    [Fact]
    public void Summary_reads_belge()
    {
        Assert.Equal("belge", PageTemplateSummary.Read(Page(Template(), Minimal())).Template);
    }

    [Fact]
    public async Task Belge_template_round_trips_through_draft_preview_publish()
    {
        await using var app = await TenantCustomPageEndpointsIntegrationTests.StartApplicationAsync();
        using var client = app.GetTestClient();
        TenantCustomPageEndpointsIntegrationTests.SetIdentity(client, TenantCustomPageEndpointsIntegrationTests.TenantA, TenantCustomPageEndpointsIntegrationTests.UserA, "TenantAdmin");
        var definition = JsonDocument.Parse(Page(Template(), Minimal())).RootElement;

        var created = await client.PostAsJsonAsync("/api/custom-pages/drafts", new { code = "siparis-belgesi", name = "Sipariş", definition });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var bad = await client.PutAsJsonAsync($"/api/custom-pages/{id}", new { expectedRevision = 1, name = "Sipariş",
            definition = JsonDocument.Parse(Page(Template(), [Fields(["orderDate"]), Lines(), Summary()])).RootElement });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            platform.TenantCustomPageAccesses.Add(new TenantCustomPageAccess
            {
                TenantId = TenantCustomPageEndpointsIntegrationTests.TenantA, PageCode = "siparis-belgesi",
                Mode = CustomPageAccessModes.AllUsers, UpdatedByUserId = TenantCustomPageEndpointsIntegrationTests.UserA
            });
            await platform.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-pages/{id}/publish", new { expectedRevision = 1 })).StatusCode);
        var runtime = await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/siparis-belgesi/published");
        using var published = JsonDocument.Parse(runtime.GetProperty("definitionJson").GetString()!);
        Assert.Equal("satis.siparis", published.RootElement.GetProperty("template").GetProperty("document").GetString());
        Assert.Equal("documentLines", published.RootElement.GetProperty("components")[1].GetProperty("type").GetString());
    }
}
