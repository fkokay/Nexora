using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomFormEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid UserB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Custom_form_publish_restore_submit_and_decision_are_tenant_scoped_and_audited()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var create = await client.PostAsJsonAsync("/api/custom-forms/", new
        {
            code = "stock-warranty",
            name = "Stok garantisi",
            description = "Stok kartındaki garanti bilgisi",
            fields = new[] { new { code = "warranty_months", label = "Garanti süresi (ay)", dataType = "Decimal", isRequired = true } }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var firstId = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(1, created.RootElement.GetProperty("version").GetInt32());

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/custom-forms/"))!);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/custom-forms/{firstId}/publish", null)).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var firstPublish = await client.PostAsync($"/api/custom-forms/{firstId}/publish", null);
        Assert.True(firstPublish.StatusCode == HttpStatusCode.OK, $"Publish returned {(int)firstPublish.StatusCode}: {await firstPublish.Content.ReadAsStringAsync()}");
        var createDraft = await client.PostAsync($"/api/custom-forms/{firstId}/draft", null);
        Assert.Equal(HttpStatusCode.Created, createDraft.StatusCode);
        using var draftJson = JsonDocument.Parse(await createDraft.Content.ReadAsStringAsync());
        var draftId = draftJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(2, draftJson.RootElement.GetProperty("version").GetInt32());

        var update = await client.PutAsJsonAsync($"/api/custom-forms/{draftId}", new
        {
            name = "Stok garanti süresi",
            description = "Güncellenmiş taslak",
            fields = new[] { new { code = "warranty_months", label = "Garanti dönemi (ay)", dataType = "Decimal", isRequired = true } }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/custom-forms/{draftId}/history");
        var priorDefinition = Assert.Single(history!, item => item.GetProperty("changeKind").GetString() == "Updated");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-forms/{draftId}/restore", new
        {
            revisionId = priorDefinition.GetProperty("id").GetGuid()
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/custom-forms/{draftId}/publish", null)).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var visibleForms = await client.GetFromJsonAsync<JsonElement[]>("/api/custom-forms/");
        var published = Assert.Single(visibleForms!);
        Assert.Equal(draftId, published.GetProperty("id").GetGuid());
        Assert.Equal("Garanti süresi (ay)", published.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/custom-forms/{draftId}/submissions", new
        {
            values = new Dictionary<string, string?> { ["warranty_months"] = "24", ["unrecognized"] = "unexpected" }
        })).StatusCode);

        var submission = await client.PostAsJsonAsync($"/api/custom-forms/{draftId}/submissions", new
        {
            values = new Dictionary<string, string?> { ["warranty_months"] = "24.00" }
        });
        Assert.Equal(HttpStatusCode.Created, submission.StatusCode);
        using var submissionJson = JsonDocument.Parse(await submission.Content.ReadAsStringAsync());
        var submissionId = submissionJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(4, submissionJson.RootElement.GetProperty("formVersion").GetInt32());
        Assert.Equal("24", submissionJson.RootElement.GetProperty("values").GetProperty("warranty_months").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/custom-forms/submissions/{submissionId}/decision", new
        {
            decision = "Approved", reason = "Tenant user cannot decide"
        })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/custom-forms/"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/custom-forms/{draftId}/history")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/custom-forms/submissions/{submissionId}/decision", new
        {
            decision = "Rejected", reason = "Cross-tenant access must not resolve"
        })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/custom-forms/submissions/{submissionId}/decision", new
        {
            decision = "Approved", reason = "Onaylandı"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/custom-forms/submissions/{submissionId}/decision", new
        {
            decision = "Rejected", reason = "Karar tekrar değiştirilemez"
        })).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var savedSubmission = await db.TenantCustomFormSubmissions.SingleAsync(x => x.TenantId == TenantA && x.Id == submissionId);
        Assert.Equal("Approved", savedSubmission.Status);
        Assert.Equal(UserA, savedSubmission.DecidedByUserId);
        Assert.Equal(8, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action.StartsWith("custom-form.")));
        Assert.Empty(await db.AuditEvents.Where(x => x.TenantId == TenantB && x.Action.StartsWith("custom-form.")).ToListAsync());
    }

    [Fact]
    public async Task Custom_form_schema_enforces_one_published_version_per_tenant_and_code()
    {
        await using var app = await StartApplicationAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var index = db.Model.FindEntityType(typeof(TenantCustomFormDefinition))!.GetIndexes()
            .Single(x => x.Properties.Select(property => property.Name).SequenceEqual(["TenantId", "Code"]));

        Assert.True(index.IsUnique);
        Assert.Equal("[Status] = 'Published'", index.GetFilter());
    }

    [Fact]
    public async Task Built_in_screen_layout_is_allowlisted_versioned_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var create = await client.PostAsJsonAsync("/api/screen-views/customers/draft", new { name = "Cari çalışma listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key == "name"
            ? new { x.key, label = "Cari unvanı", visible = true, position = 0 }
            : x.key == "taxNumber"
                ? new { x.key, label = x.label!, visible = false, position = x.position }
                : new { x.key, label = x.label!, visible = x.visible, position = x.position }).ToArray();

        var invalid = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Geçersiz", fields = customized.Select(x => new { key = "unknown", label = x.label, visible = x.visible, position = x.position }).ToArray()
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var movedFixedField = fields.Select(x => new { x.key, label = x.label, visible = x.visible, position = x.key == "actions" ? 0 : x.position + 1 }).ToArray();
        var fixedFieldUpdate = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Sabit alan taşındı", fields = movedFixedField
        });
        Assert.Equal(HttpStatusCode.BadRequest, fixedFieldUpdate.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Cari çalışma listesi", fields = customized });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customers/active");
        Assert.True(active.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Cari unvanı", active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "name").GetProperty("label").GetString());
        Assert.False(active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "taxNumber").GetProperty("visible").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customers/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Cari kodu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var nextDraft = await client.PostAsJsonAsync("/api/screen-views/customers/draft", new { name = "Cari çalışma listesi" });
        Assert.Equal(HttpStatusCode.Created, nextDraft.StatusCode);
        var history = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/customers/history");
        Assert.Contains(history!, x => x.GetProperty("changeKind").GetString() == "Published");
        var publishedRevision = history!.First(x => x.GetProperty("changeKind").GetString() == "Published").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync($"/api/screen-views/customers/draft-from-revision/{publishedRevision}", null)).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Contains(await db.AuditEvents.Where(x => x.TenantId == TenantA).Select(x => x.Action).ToListAsync(), x => x == "screen-view.published");
        Assert.Empty(await db.AuditEvents.Where(x => x.TenantId == TenantB && x.Action.StartsWith("screen-view.")).ToListAsync());
    }

    [Fact]
    public async Task Crm_opportunity_layout_is_tenant_scoped_and_keeps_stage_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var crm = Assert.Single(catalog!, x => x.GetProperty("key").GetString() == "crm-opportunities");
        var catalogFields = crm.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("actions", catalogFields[^1].GetProperty("key").GetString());

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/crm-opportunities/draft", new { name = "CRM satış hattı" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "estimatedValue" ? "Beklenen ciro" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("position").GetInt32(),
            section = field.GetProperty("key").GetString() is "code" or "name" ? "Fırsat" : (string?)null
        }).ToArray();

        var hiddenActions = fields.Select(field => new { field.key, field.label, visible = field.key == "actions" ? false : field.visible, field.position, field.section }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Geçersiz", fields = hiddenActions })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "CRM satış hattı", fields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var activeA = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/crm-opportunities/active");
        Assert.Equal("Beklenen ciro", activeA.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "estimatedValue").GetProperty("label").GetString());
        Assert.Equal("actions", activeA.GetProperty("fields")[activeA.GetProperty("fields").GetArrayLength() - 1].GetProperty("key").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var activeB = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/crm-opportunities/active");
        Assert.False(activeB.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tahmini değer", activeB.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "estimatedValue").GetProperty("label").GetString());
    }

    [Fact]
    public async Task Built_in_screen_field_sections_are_tenant_scoped_versioned_and_keep_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/customers/draft", new { name = "Cari bölümlü görünüm" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("position").GetInt32(),
            section = field.GetProperty("key").GetString() switch
            {
                "code" or "name" => "Kimlik",
                "currencyCode" or "paymentTermDays" => "Ticari",
                _ => (string?)null
            }
        }).ToArray();

        var fixedFieldGrouped = fields.Select(field => new { field.key, field.label, field.visible, field.position, section = field.key == "actions" ? "System" : field.section }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sabit alan gruplanamaz", fields = fixedFieldGrouped })).StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Cari bölümlü görünüm", fields });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        using var updated = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
        Assert.Equal("Kimlik", updated.RootElement.GetProperty("fields").EnumerateArray().Single(field => field.GetProperty("key").GetString() == "name").GetProperty("section").GetString());
        Assert.Equal("Ticari", updated.RootElement.GetProperty("fields").EnumerateArray().Single(field => field.GetProperty("key").GetString() == "currencyCode").GetProperty("section").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var activeA = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customers/active");
        Assert.Equal("Kimlik", activeA.GetProperty("fields").EnumerateArray().Single(field => field.GetProperty("key").GetString() == "name").GetProperty("section").GetString());
        var activeAFields = activeA.GetProperty("fields");
        Assert.Equal("actions", activeAFields[activeAFields.GetArrayLength() - 1].GetProperty("key").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var activeB = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customers/active");
        Assert.False(activeB.GetProperty("isPublished").GetBoolean());
        Assert.Null(activeB.GetProperty("fields").EnumerateArray().Single(field => field.GetProperty("key").GetString() == "name").GetProperty("section").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var history = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/customers/history");
        var published = Assert.Single(history!, revision => revision.GetProperty("changeKind").GetString() == "Published");
        Assert.Equal("Kimlik", published.GetProperty("fields").EnumerateArray().Single(field => field.GetProperty("key").GetString() == "name").GetProperty("section").GetString());
    }

    [Fact]
    public async Task Inventory_stock_screen_layout_is_allowlisted_and_keeps_actions_fixed_when_published()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var stockCatalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "inventory-stock");
        var catalogFields = stockCatalog.GetProperty("fields").EnumerateArray().ToArray();
        var expectedKeys = new[] { "code", "name", "category", "quantityOnHand", "reservedQuantity", "availableQuantity", "minimumStock", "valuationAmountBase", "unvaluedQuantity", "status", "actions" };
        Assert.Equal(expectedKeys, catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        var action = catalogFields[^1];
        Assert.True(action.GetProperty("fixed").GetBoolean());
        Assert.True(action.GetProperty("defaultVisible").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/inventory-stock/draft", new { name = "Stok kartları" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();

        var movedActions = fields.Select(x => new { x.key, x.label, x.visible, position = x.key == "actions" ? 0 : x.position + 1 }).ToArray();
        var invalidMove = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sabit eylemler taşındı", fields = movedActions });
        Assert.Equal(HttpStatusCode.BadRequest, invalidMove.StatusCode);
        var hiddenActions = fields.Select(x => new { x.key, x.label, visible = x.key == "actions" ? false : x.visible, x.position }).ToArray();
        var invalidHide = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Eylemler gizlendi", fields = hiddenActions });
        Assert.Equal(HttpStatusCode.BadRequest, invalidHide.StatusCode);

        var customized = fields.Select(x => x.key switch
        {
            "name" => new { x.key, label = "Malzeme adı", visible = true, position = 0 },
            "code" => new { x.key, label = x.label, visible = true, position = 1 },
            "category" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Stok kartları", fields = customized });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/inventory-stock/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("name", activeFields[0].GetProperty("key").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "category").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/inventory-stock/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Stok kodu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Exchange_rate_screen_layout_is_allowlisted_validated_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "exchange-rates");
        var fields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "rateDate", "currencyCode", "rate", "revision", "source" },
            fields.Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/exchange-rates/draft", new { name = "Kur listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var requested = fields.Select((field, index) => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "rate" ? "Kur değeri" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("key").GetString() != "source",
            position = index
        }).ToArray();
        var invalid = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Geçersiz alan", fields = requested.Select(field => new { key = "unknown", field.label, field.visible, field.position }).ToArray()
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Kur listesi", fields = requested });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/exchange-rates/active");
        Assert.Equal("Kur değeri", active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "rate").GetProperty("label").GetString());
        Assert.False(active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "source").GetProperty("visible").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/exchange-rates/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kur", otherTenant.GetProperty("fields")[2].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Warehouse_location_balance_layout_supports_tenant_scoped_publish_and_revision_restore()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "warehouse-location-balances");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "stockItemCode", "stockItemName", "quantity", "unitCode" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/warehouse-location-balances/draft", new { name = "Raf bakiyeleri" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "stockItemName" => new { x.key, label = "Malzeme", visible = true, position = 0 },
            "quantity" => new { x.key, label = "Raf miktarı", visible = true, position = 1 },
            "stockItemCode" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        var invalid = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Bilinmeyen alan", fields = customized.Select(x => new { key = "unknown", label = x.label, visible = x.visible, position = x.position }).ToArray()
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Raf bakiyeleri", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/warehouse-location-balances/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("stockItemName", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Malzeme", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "stockItemCode").GetProperty("visible").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var history = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/warehouse-location-balances/history");
        var publishedRevision = Assert.Single(history!, x => x.GetProperty("changeKind").GetString() == "Published");
        var restore = await client.PostAsync($"/api/screen-views/warehouse-location-balances/draft-from-revision/{publishedRevision.GetProperty("id").GetGuid()}", null);
        Assert.Equal(HttpStatusCode.Created, restore.StatusCode);
        var editor = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/warehouse-location-balances/draft");
        Assert.Equal("Malzeme", editor.GetProperty("draft").GetProperty("fields")[0].GetProperty("label").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/warehouse-location-balances/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Stok adı", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_order_layout_is_allowlisted_tenant_scoped_and_keeps_actions_fixed_through_restore()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "sales-orders");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "quoteCode", "customerName", "orderDate", "lineCount", "grandTotal", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/sales-orders/draft", new { name = "Sipariş listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var actionFirst = fields.Select(x => x.key == "actions"
            ? new { x.key, label = x.label, visible = true, position = 0 }
            : new { x.key, label = x.label, visible = x.visible, position = x.position + 1 }).ToArray();
        var invalid = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "İşlem alanını taşı", fields = actionFirst });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var customized = fields.Select(x => x.key switch
        {
            "customerName" => new { x.key, label = "Alıcı", visible = true, position = 0 },
            "grandTotal" => new { x.key, label = "Sipariş tutarı", visible = true, position = 1 },
            "quoteCode" => new { x.key, label = x.label, visible = false, position = 2 },
            "code" => new { x.key, label = x.label, visible = true, position = 3 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sipariş listesi", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-orders/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("customerName", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Alıcı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "quoteCode").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var history = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/sales-orders/history");
        var publishedRevision = Assert.Single(history!, x => x.GetProperty("changeKind").GetString() == "Published");
        var restored = await client.PostAsync($"/api/screen-views/sales-orders/draft-from-revision/{publishedRevision.GetProperty("id").GetGuid()}", null);
        Assert.Equal(HttpStatusCode.Created, restored.StatusCode);
        var editor = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-orders/draft");
        var restoredFields = editor.GetProperty("draft").GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("actions", restoredFields[^1].GetProperty("key").GetString());
        Assert.True(restoredFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-orders/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Sipariş no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_invoice_layout_is_tenant_scoped_and_keeps_invoice_detail_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "sales-invoices");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("actions", catalogFields[^1].GetProperty("key").GetString());

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/sales-invoices/draft", new { name = "Satış fatura listesi" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "grandTotal" ? "Fatura toplamı" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("position").GetInt32(),
            section = field.GetProperty("key").GetString() is "code" or "deliveryCode" ? "Belge" : (string?)null
        }).ToArray();
        var movedActions = fields.Select(field => new { field.key, field.label, field.visible, position = field.key == "actions" ? 0 : field.position + 1, field.section }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Geçersiz", fields = movedActions })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Satış fatura listesi", fields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var activeA = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-invoices/active");
        var activeAFields = activeA.GetProperty("fields");
        Assert.Equal("Fatura toplamı", activeAFields.EnumerateArray().Single(x => x.GetProperty("key").GetString() == "grandTotal").GetProperty("label").GetString());
        Assert.Equal("actions", activeAFields[activeAFields.GetArrayLength() - 1].GetProperty("key").GetString());
        Assert.Equal("Belge", activeAFields.EnumerateArray().Single(x => x.GetProperty("key").GetString() == "deliveryCode").GetProperty("section").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var activeB = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-invoices/active");
        Assert.False(activeB.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Genel toplam", activeB.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "grandTotal").GetProperty("label").GetString());
    }

    [Fact]
    public async Task Purchase_invoice_layout_is_allowlisted_tenant_scoped_and_keeps_details_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "purchase-invoices");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "supplierName", "receiptCode", "purchaseOrderCode", "invoiceDate", "dueDate", "currencyCode", "grandTotal", "paidAmount", "outstandingAmount", "lineCount", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/purchase-invoices/draft", new { name = "Alış faturaları" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "supplierName" => new { x.key, label = "Satıcı", visible = true, position = 0 },
            "outstandingAmount" => new { x.key, label = "Kalan borç", visible = true, position = 1 },
            "receiptCode" => new { x.key, label = x.label, visible = false, position = 2 },
            "code" => new { x.key, label = x.label, visible = true, position = 3 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Alış faturaları", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-invoices/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("supplierName", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Satıcı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "receiptCode").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-invoices/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Fatura no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Purchase_order_layout_is_allowlisted_tenant_scoped_and_keeps_receiving_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "purchase-orders");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "supplierName", "orderDate", "expectedReceiptDate", "targetWarehouseCode", "lineCount", "grandTotal", "currencyCode", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/purchase-orders/draft", new { name = "Satın alma çalışma listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "supplierName" => new { x.key, label = "Satıcı", visible = true, position = 0 },
            "targetWarehouseCode" => new { x.key, label = "Teslim deposu", visible = false, position = 2 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position + 1 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Satın alma çalışma listesi", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-orders/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("supplierName", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Satıcı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "targetWarehouseCode").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-orders/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tedarikçi", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_delivery_layout_is_allowlisted_tenant_scoped_and_keeps_invoice_and_void_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "sales-deliveries");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "orderCode", "deliveryDate", "warehouseName", "lineCount", "status", "invoiceStatus", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/sales-deliveries/draft", new { name = "Sevk listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var hiddenAction = fields.Select(x => new { x.key, label = x.label, visible = x.key == "actions" ? false : x.visible, position = x.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sevk listesi", fields = hiddenAction })).StatusCode);
        var customized = fields.Select(x => x.key switch
        {
            "code" => new { x.key, label = "Sevk belgesi", visible = true, position = 0 },
            "invoiceStatus" => new { x.key, label = "Faturalama", visible = false, position = 2 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position + 1 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sevk listesi", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-deliveries/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("code", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Sevk belgesi", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "invoiceStatus").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-deliveries/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("İrsaliye no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Fixed_asset_register_layout_is_customizable_published_and_restorable_per_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "fixed-assets");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "assetCode", "name", "category", "acquisitionDate", "inServiceDate", "acquisitionCostBase", "residualValueBase", "usefulLifeMonths", "accumulatedDepreciationBase", "remainingBookValueBase", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/fixed-assets/draft", new { name = "Demirbaş görünümü" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "name" => new { x.key, label = "Demirbaş adı", visible = true, position = 0 },
            "acquisitionCostBase" => new { x.key, label = "İlk maliyet", visible = true, position = 1 },
            "category" => new { x.key, label = x.label, visible = false, position = 2 },
            "assetCode" => new { x.key, label = x.label, visible = true, position = 3 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Demirbaş görünümü", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/fixed-assets/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("name", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Demirbaş adı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "category").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var history = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/fixed-assets/history");
        var publishedRevision = Assert.Single(history!, x => x.GetProperty("changeKind").GetString() == "Published");
        var secondDraftResponse = await client.PostAsJsonAsync("/api/screen-views/fixed-assets/draft", new { name = "Yeni sabit kıymet listesi" });
        Assert.Equal(HttpStatusCode.Created, secondDraftResponse.StatusCode);
        using var secondDraft = JsonDocument.Parse(await secondDraftResponse.Content.ReadAsStringAsync());
        var secondDraftId = secondDraft.RootElement.GetProperty("id").GetGuid();
        var secondFields = secondDraft.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("key").GetString() == "name" ? "Ad" : x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{secondDraftId}", new { expectedRevision = 1, name = "Yeni sabit kıymet listesi", fields = secondFields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{secondDraftId}/publish", new { expectedRevision = 2 })).StatusCode);
        var restore = await client.PostAsync($"/api/screen-views/fixed-assets/draft-from-revision/{publishedRevision.GetProperty("id").GetGuid()}", null);
        Assert.Equal(HttpStatusCode.Created, restore.StatusCode);
        var editor = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/fixed-assets/draft");
        Assert.Equal("Demirbaş adı", editor.GetProperty("draft").GetProperty("fields")[0].GetProperty("label").GetString());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/fixed-assets/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kıymet kodu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/screen-views/fixed-assets/draft-from-revision/{publishedRevision.GetProperty("id").GetGuid()}", null)).StatusCode);
    }

    [Fact]
    public async Task Payment_instrument_layout_is_allowlisted_tenant_scoped_and_keeps_portfolio_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "payment-instruments");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "instrumentNumber", "code", "type", "direction", "counterpartyName", "bankName", "dueDate", "amount", "currencyCode", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/payment-instruments/draft", new { name = "Çek/senet portföyü" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().ToArray();
        var hiddenActions = fields.Select((field, index) => new
        {
            key = field.GetProperty("key").GetString(), label = field.GetProperty("label").GetString(),
            visible = field.GetProperty("key").GetString() != "actions" && field.GetProperty("visible").GetBoolean(), position = index
        }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "İşlemler gizlendi", fields = hiddenActions })).StatusCode);

        var movedActions = fields.Select((field, index) => new
        {
            key = field.GetProperty("key").GetString(), label = field.GetProperty("label").GetString(),
            visible = field.GetProperty("visible").GetBoolean(), position = field.GetProperty("key").GetString() == "actions" ? 0 : index + 1
        }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "İşlemler taşındı", fields = movedActions })).StatusCode);

        var customized = fields.Select((field, index) => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "counterpartyName" ? "Firma" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("key").GetString() != "bankName" && field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("key").GetString() == "code" ? 0 : index + 1
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Portföy görünümü", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/payment-instruments/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("code", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Firma", activeFields.Single(x => x.GetProperty("key").GetString() == "counterpartyName").GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "bankName").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/payment-instruments/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Çek/senet no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/payment-instruments/history"))!);
    }

    [Fact]
    public async Task Commercial_contract_layout_is_allowlisted_tenant_scoped_and_keeps_details_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "commercial-contracts");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "type", "counterpartyName", "effectiveFrom", "effectiveThrough", "currencyCode", "status", "revision", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/commercial-contracts/draft", new { name = "Ticari sözleşmeler" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().ToArray();
        var customized = fields.Select((field, index) => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "counterpartyName" ? "Firma" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("key").GetString() != "revision" && field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("key").GetString() == "code" ? 0 : index + 1
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Ticari sözleşmeler", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/commercial-contracts/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("Firma", activeFields.Single(x => x.GetProperty("key").GetString() == "counterpartyName").GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "revision").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/commercial-contracts/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Sözleşme kodu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Hr_employee_screen_view_limits_fields_keeps_actions_fixed_and_is_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "hr-employees");
        var allowedFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "personnelCode", "fullName", "department", "jobTitle", "status", "actions" },
            allowedFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(allowedFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/hr-employees/draft", new { name = "Personel görünümü" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();

        var hiddenActions = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İşlemleri gizle",
            fields = new[]
            {
                new { key = "personnelCode", label = "Personel kodu", visible = true, position = 0 },
                new { key = "fullName", label = "Ad soyad", visible = true, position = 1 },
                new { key = "department", label = "Departman", visible = true, position = 2 },
                new { key = "jobTitle", label = "Görev", visible = true, position = 3 },
                new { key = "status", label = "Durum", visible = true, position = 4 },
                new { key = "actions", label = "İşlemler", visible = false, position = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, hiddenActions.StatusCode);

        var arbitraryField = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İzin verilmeyen alan",
            fields = new[]
            {
                new { key = "personnelCode", label = "Personel kodu", visible = true, position = 0 },
                new { key = "fullName", label = "Ad soyad", visible = true, position = 1 },
                new { key = "department", label = "Departman", visible = true, position = 2 },
                new { key = "jobTitle", label = "Görev", visible = true, position = 3 },
                new { key = "workEmail", label = "E-posta", visible = true, position = 4 },
                new { key = "actions", label = "İşlemler", visible = true, position = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, arbitraryField.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/screen-views/hr-employees/draft", new { name = "Yetkisiz" })).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "Personel görünümü",
            fields = new[]
            {
                new { key = "jobTitle", label = "Görev", visible = true, position = 0 },
                new { key = "personnelCode", label = "Personel kodu", visible = true, position = 1 },
                new { key = "fullName", label = "Ad soyad", visible = true, position = 2 },
                new { key = "department", label = "Departman", visible = false, position = 3 },
                new { key = "status", label = "Durum", visible = true, position = 4 },
                new { key = "actions", label = "İşlemler", visible = true, position = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-employees/active");
        var activeFields = active!.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("jobTitle", activeFields[0].GetProperty("key").GetString());
        Assert.False(activeFields[3].GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-employees/active");
        Assert.False(otherTenant!.GetProperty("isPublished").GetBoolean());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/hr-employees/history"))!);
    }

    [Fact]
    public async Task Hr_leave_request_screen_view_is_allowlisted_fixed_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "hr-leave-requests");
        var allowedFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "employee", "leaveType", "startDate", "endDate", "requestedDays", "status", "actions" },
            allowedFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(allowedFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/hr-leave-requests/draft", new { name = "İzin listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();

        var hiddenActions = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İşlemleri gizle",
            fields = new[]
            {
                new { key = "employee", label = "Personel", visible = true, position = 0 },
                new { key = "leaveType", label = "Tür", visible = true, position = 1 },
                new { key = "startDate", label = "Başlangıç", visible = true, position = 2 },
                new { key = "endDate", label = "Bitiş", visible = true, position = 3 },
                new { key = "requestedDays", label = "Gün", visible = true, position = 4 },
                new { key = "status", label = "Durum", visible = true, position = 5 },
                new { key = "actions", label = "İşlem", visible = false, position = 6 }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, hiddenActions.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İzin listesi",
            fields = new[]
            {
                new { key = "leaveType", label = "İzin türü", visible = true, position = 0 },
                new { key = "employee", label = "Çalışan", visible = true, position = 1 },
                new { key = "startDate", label = "Başlangıç", visible = false, position = 2 },
                new { key = "endDate", label = "Bitiş", visible = true, position = 3 },
                new { key = "requestedDays", label = "Gün", visible = true, position = 4 },
                new { key = "status", label = "Durum", visible = true, position = 5 },
                new { key = "actions", label = "İşlem", visible = true, position = 6 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-leave-requests/active");
        var activeFields = active!.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("leaveType", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("İzin türü", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "startDate").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-leave-requests/active");
        Assert.False(otherTenant!.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Personel", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/hr-leave-requests/history"))!);
    }

    private static void SetIdentity(HttpClient client, Guid tenantId, Guid userId, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    [Fact]
    public async Task Operational_project_list_layout_is_allowlisted_live_ready_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "operational-projects");
        var fields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "name", "status", "startDate", "endDate", "budgetAmount", "currencyCode", "taskCount", "completedTaskCount", "overdueTaskCount", "actualHours", "nextTaskDate", "actions" },
            fields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(fields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/operational-projects/draft", new { name = "Proje listem" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var layoutFields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32()
            }).ToArray();

        var invalidAction = layoutFields.Select(field => field.key == "actions"
            ? new { field.key, field.label, visible = false, position = field.position }
            : new { field.key, field.label, visible = field.visible, position = field.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İşlemler gizlendi",
            fields = invalidAction
        })).StatusCode);

        var customized = layoutFields.Select(field => field.key switch
        {
            "name" => new { field.key, label = "Proje başlığı", visible = true, position = 0, section = (string?)"Genel" },
            "status" => new { field.key, label = field.label, visible = true, position = 1, section = (string?)"Genel" },
            "budgetAmount" => new { field.key, label = "Plan bütçesi", visible = true, position = 2, section = (string?)"Finans" },
            "code" => new { field.key, label = field.label, visible = false, position = 3, section = (string?)"Genel" },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)null },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)"Diğer" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "Proje listem",
            fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/operational-projects/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("name", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Proje başlığı", activeFields[0].GetProperty("label").GetString());
        Assert.Equal("Genel", activeFields[0].GetProperty("section").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "code").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/operational-projects/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Proje kodu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Standalone_supplier_invoice_draft_list_layout_is_allowlisted_and_keeps_edit_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "standalone-invoice-drafts");
        var fields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "invoiceNumber", "supplierName", "invoiceDate", "dueDate", "currencyCode", "grandTotal", "lineCount", "createdAt", "status", "actions" },
            fields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(fields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/standalone-invoice-drafts/draft", new { name = "Tedarikçi taslak listem" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var layoutFields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32()
            }).ToArray();
        var hiddenAction = layoutFields.Select(field => field.key == "actions"
            ? new { field.key, field.label, visible = false, position = field.position }
            : new { field.key, field.label, visible = field.visible, position = field.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İşlem sütunu gizlendi",
            fields = hiddenAction
        })).StatusCode);
        var customized = layoutFields.Select(field => field.key switch
        {
            "invoiceNumber" => new { field.key, label = "Belge numarası", visible = true, position = 0, section = (string?)"Belge" },
            "grandTotal" => new { field.key, label = "Fatura toplamı", visible = true, position = 1, section = (string?)"Tutar" },
            "supplierName" => new { field.key, label = field.label, visible = false, position = 2, section = (string?)"Belge" },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)null },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)"Diğer" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "Tedarikçi taslak listem",
            fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/standalone-invoice-drafts/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("invoiceNumber", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Belge numarası", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "supplierName").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/standalone-invoice-drafts/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Fatura no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Purchase_delivery_note_list_layout_is_customizable_tenant_scoped_and_keeps_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var screen = Assert.Single(catalog!, item => item.GetProperty("key").GetString() == "purchase-delivery-notes");
        var catalogFields = screen.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "documentNumber", "documentDate", "purchaseOrderCode", "supplierName", "lineCount", "purchaseReceiptCode", "actions" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var created = await client.PostAsJsonAsync("/api/screen-views/purchase-delivery-notes/draft", new { name = "Gelen irsaliyeler" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var draft = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var draftId = draft.RootElement.GetProperty("id").GetGuid();
        var fields = draft.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32()
            }).ToArray();

        var hideAction = fields.Select(field => field.key == "actions"
            ? new { field.key, label = field.label, visible = false, position = field.position }
            : new { field.key, label = field.label, visible = field.visible, position = field.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "İşlem sütununu gizle", fields = hideAction
        })).StatusCode);

        var customized = fields.Select(field => field.key switch
        {
            "documentNumber" => new { field.key, label = "Belge no", visible = true, position = 0, section = (string?)"Belge" },
            "supplierName" => new { field.key, label = "Tedarikçi ünvanı", visible = true, position = 1, section = (string?)"Belge" },
            "purchaseReceiptCode" => new { field.key, label = "Mal kabul no", visible = false, position = 2, section = (string?)"Mutabakat" },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)null },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)"Belge" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Gelen irsaliyeler", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-delivery-notes/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("documentNumber", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Belge no", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "purchaseReceiptCode").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-delivery-notes/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tedarikçi irsaliye no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Manufacturing_order_list_layout_is_customizable_tenant_scoped_and_keeps_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var screen = Assert.Single(catalog!, item => item.GetProperty("key").GetString() == "manufacturing-orders");
        var catalogFields = screen.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "plannedDate", "billOfMaterialName", "warehouseName", "plannedQuantity", "components", "status", "actions" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var created = await client.PostAsJsonAsync("/api/screen-views/manufacturing-orders/draft", new { name = "Üretim panosu" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var draft = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var draftId = draft.RootElement.GetProperty("id").GetGuid();
        var fields = draft.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32()
            }).ToArray();

        var hiddenActions = fields.Select(field => field.key == "actions"
            ? new { field.key, label = field.label, visible = false, position = field.position }
            : new { field.key, label = field.label, visible = field.visible, position = field.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "İşlemler gizli", fields = hiddenActions
        })).StatusCode);

        var movedActions = fields.Select(field => field.key == "actions"
            ? new { field.key, label = field.label, visible = field.visible, position = 0 }
            : new { field.key, label = field.label, visible = field.visible, position = field.key == "code" ? 1 : field.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "İşlemler taşındı", fields = movedActions
        })).StatusCode);

        var customized = fields.Select(field => field.key switch
        {
            "code" => new { field.key, label = "Emir no", visible = true, position = 0, section = (string?)"Plan" },
            "plannedDate" => new { field.key, label = "Termin", visible = true, position = 1, section = (string?)"Plan" },
            "warehouseName" => new { field.key, label = "Üretim deposu", visible = false, position = 2, section = (string?)"Üretim" },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)null },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)"Üretim" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Üretim panosu", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/manufacturing-orders/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("Emir no", activeFields[0].GetProperty("label").GetString());
        Assert.Equal("Plan", activeFields[0].GetProperty("section").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "warehouseName").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/manufacturing-orders/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Üretim emri", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"custom-form-{Guid.NewGuid():N}";
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapCustomFormEndpoints();
        app.MapTenantScreenViewEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        return app;
    }
}
