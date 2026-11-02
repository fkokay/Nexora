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
    public async Task Customer_detail_layout_is_allowlisted_persisted_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "customer-details");
        Assert.Equal(new[] { "groupName", "taxNumber", "identityNumber", "taxOffice", "currencyCode", "paymentTermDays", "riskLimit" },
            catalog.GetProperty("fields").EnumerateArray().Select(field => field.GetProperty("key").GetString()).ToArray());

        var created = await client.PostAsJsonAsync("/api/screen-views/customer-details/draft", new { name = "Cari yan paneli" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var draft = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var draftId = draft.RootElement.GetProperty("id").GetGuid();
        var fields = draft.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new { key = field.GetProperty("key").GetString()!, label = field.GetProperty("label").GetString()!, visible = field.GetProperty("visible").GetBoolean(), position = field.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(field => field.key switch
        {
            "riskLimit" => new { field.key, label = "Kredi riski", visible = true, position = 0 },
            "taxNumber" => new { field.key, field.label, visible = false, position = 2 },
            _ => new { field.key, field.label, field.visible, position = field.position + 1 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Cari yan paneli", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customer-details/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("riskLimit", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Kredi riski", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "taxNumber").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customer-details/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Cari grubu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
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
            ? new { x.key, label = "Cari unvanı", visible = true, position = 0, width = (int?)260 }
            : x.key == "taxNumber"
                ? new { x.key, label = x.label!, visible = false, position = x.position, width = (int?)null }
                : new { x.key, label = x.label!, visible = x.visible, position = x.position, width = (int?)null }).ToArray();

        var invalid = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Geçersiz", fields = customized.Select(x => new { key = "unknown", label = x.label, visible = x.visible, position = x.position }).ToArray()
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var invalidWidth = customized.Select(x => new { x.key, x.label, x.visible, x.position, width = x.key == "name" ? 700 : x.width }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Geçersiz genişlik", fields = invalidWidth
        })).StatusCode);

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
        Assert.Equal(260, active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "name").GetProperty("width").GetInt32());
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
    public async Task Inventory_stock_movement_history_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "inventory-stock-movements");
        var fields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "entryDate", "direction", "description", "quantity", "unitCostBase", "actions" },
            fields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(fields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/inventory-stock-movements/draft", new { name = "Stok hareket geçmişi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var draftFields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = draftFields.Select(x => x.key switch
        {
            "entryDate" => new { x.key, label = "İşlem tarihi", visible = true, position = 0 },
            "description" => new { x.key, label = x.label, visible = false, position = 1 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Stok hareket geçmişi", fields = customized });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/inventory-stock-movements/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("İşlem tarihi", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "description").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/inventory-stock-movements/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tarih", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
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
    public async Task Inventory_trace_balance_layout_is_published_per_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "inventory-trace-balances");
        Assert.Equal(new[] { "trackingCode", "trackingMode", "stockItem", "warehouse", "quantityOnHand", "expiryDate", "lastMovementDate" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/inventory-trace-balances/draft", new { name = "Lot bakiyeleri" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "stockItem" => new { x.key, label = "Malzeme", visible = true, position = 0 },
            "trackingCode" => new { x.key, label = x.label, visible = true, position = 1 },
            "expiryDate" => new { x.key, label = x.label, visible = false, position = 5 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Lot bakiyeleri", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/inventory-trace-balances/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("stockItem", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Malzeme", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "expiryDate").GetProperty("visible").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/inventory-trace-balances/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Stok", otherTenant.GetProperty("fields")[2].GetProperty("label").GetString());
    }

    [Fact]
    public async Task General_ledger_journal_layout_is_tenant_scoped_and_keeps_entry_open_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-journals");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "entryDate", "sourceType", "description", "totalDebit", "totalCredit" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[0].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-journals/draft", new { name = "Aylık yevmiye" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var hiddenCode = fields.Select(x => new { x.key, label = x.label, visible = x.key != "code", position = x.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Fiş açılamasın", fields = hiddenCode })).StatusCode);

        var customized = fields.Select(x => x.key switch
        {
            "description" => new { x.key, label = "İşlem açıklaması", visible = true, position = 0 },
            "entryDate" => new { x.key, label = "Kayıt tarihi", visible = true, position = 1 },
            "sourceType" => new { x.key, label = x.label, visible = x.visible, position = 2 },
            "totalDebit" => new { x.key, label = x.label, visible = x.visible, position = 3 },
            "totalCredit" => new { x.key, label = x.label, visible = x.visible, position = 4 },
            _ => new { x.key, label = x.label, visible = x.visible, position = 5 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Aylık yevmiye", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-journals/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("description", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("İşlem açıklaması", activeFields[0].GetProperty("label").GetString());
        Assert.True(activeFields.Single(x => x.GetProperty("key").GetString() == "code").GetProperty("fixed").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-journals/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Fiş", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task General_ledger_transfer_source_layout_is_tenant_scoped_and_keeps_transfer_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-transfer-sources");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "source", "entryDate", "description", "amount", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-transfer-sources/draft", new { name = "Aktarım kaynakları" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "amount" => new { x.key, label = "Tutar · baz para", visible = true, position = 0 },
            "source" => new { x.key, label = x.label, visible = false, position = 1 },
            "entryDate" => new { x.key, label = x.label, visible = true, position = 2 },
            "description" => new { x.key, label = x.label, visible = true, position = 3 },
            _ => new { x.key, label = x.label, visible = x.visible, position = 4 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Aktarım kaynakları", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-transfer-sources/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("amount", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Tutar · baz para", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "source").GetProperty("visible").GetBoolean());
        Assert.True(activeFields.Single(x => x.GetProperty("key").GetString() == "actions").GetProperty("fixed").GetBoolean());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-transfer-sources/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kaynak", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
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
    public async Task Sales_order_line_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "sales-order-lines");
        Assert.Equal(new[] { "stockCode", "stockName", "quantity", "deliveredQuantity", "remainingQuantity", "reservedQuantity", "unitPrice", "lineTotal" },
            catalog.GetProperty("fields").EnumerateArray().Select(field => field.GetProperty("key").GetString()).ToArray());

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/sales-order-lines/draft", new { name = "Sipariş satırları" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "stockName" ? "Ürün" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("key").GetString() == "stockName" ? 0 : field.GetProperty("position").GetInt32() + 1,
            section = (string?)"Sipariş satırı"
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sipariş satırları", fields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-order-lines/active");
        Assert.Equal("stockName", active.GetProperty("fields")[0].GetProperty("key").GetString());
        Assert.Equal("Ürün", active.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Equal("Sipariş satırı", active.GetProperty("fields")[0].GetProperty("section").GetString());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var isolated = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-order-lines/active");
        Assert.False(isolated.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Stok kodu", isolated.GetProperty("fields")[0].GetProperty("label").GetString());
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
    public async Task Sales_invoice_detail_summary_layout_publishes_and_reads_only_within_its_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "sales-invoice-details");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Contains(catalogFields, field => field.GetProperty("key").GetString() == "outstandingAmount");
        Assert.DoesNotContain(catalogFields, field => field.GetProperty("key").GetString() == "actions");

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/sales-invoice-details/draft", new { name = "Fatura özeti" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "outstandingAmount" ? "Kalan alacak" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("key").GetString() != "ledgerEntry" && field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("key").GetString() == "grandTotal" ? 0 : field.GetProperty("position").GetInt32() + 1
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Fatura özeti", fields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var activeA = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-invoice-details/active");
        Assert.True(activeA.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kalan alacak", activeA.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "outstandingAmount").GetProperty("label").GetString());
        Assert.False(activeA.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "ledgerEntry").GetProperty("visible").GetBoolean());
        Assert.Equal("grandTotal", activeA.GetProperty("fields")[0].GetProperty("key").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var activeB = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-invoice-details/active");
        Assert.False(activeB.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Açık bakiye", activeB.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "outstandingAmount").GetProperty("label").GetString());
    }

    [Fact]
    public async Task Customer_sales_invoice_layout_is_separate_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "customer-sales-invoices");
        Assert.Equal("Cari satış faturaları", catalog.GetProperty("label").GetString());
        Assert.Equal("actions", catalog.GetProperty("fields")[catalog.GetProperty("fields").GetArrayLength() - 1].GetProperty("key").GetString());
        Assert.DoesNotContain(catalogs!, x => x.GetProperty("key").GetString() == "customer-invoice-history");

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/customer-sales-invoices/draft", new { name = "Cari fatura geçmişi" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "grandTotal" ? "Invoice amount" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("position").GetInt32()
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Cari fatura geçmişi", fields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var published = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customer-sales-invoices/active");
        Assert.True(published.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Invoice amount", published.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "grandTotal").GetProperty("label").GetString());
        Assert.Equal("actions", published.GetProperty("fields")[published.GetProperty("fields").GetArrayLength() - 1].GetProperty("key").GetString());
        var globalInvoices = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-invoices/active");
        Assert.False(globalInvoices.GetProperty("isPublished").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/customer-sales-invoices/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tutar", otherTenant.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "grandTotal").GetProperty("label").GetString());
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
    public async Task Purchase_invoice_receipt_selection_layout_is_tenant_scoped_and_keeps_invoice_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "purchase-invoice-receipt-selection");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "receipt", "supplier", "receiptDate", "warehouse", "lineCount", "purchaseOrderTotal", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/purchase-invoice-receipt-selection/draft", new { name = "Mal kabul seçimi" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("key").GetString() == "supplier" ? "Tedarikçi unvanı" : field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("key").GetString() == "supplier" ? 0 : field.GetProperty("position").GetInt32() + 1
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Mal kabul seçimi", fields })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-invoice-receipt-selection/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("supplier", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Tedarikçi unvanı", activeFields[0].GetProperty("label").GetString());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-invoice-receipt-selection/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tedarikçi", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
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
    public async Task Sales_return_list_layout_is_tenant_published_and_keeps_void_action_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "sales-returns");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "returnDate", "warehouseName", "lineCount", "grandTotal", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        using var created = JsonDocument.Parse(await (await client.PostAsJsonAsync("/api/screen-views/sales-returns/draft", new { name = "Satış iade listesi" })).Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
        {
            key = field.GetProperty("key").GetString()!,
            label = field.GetProperty("label").GetString()!,
            visible = field.GetProperty("visible").GetBoolean(),
            position = field.GetProperty("position").GetInt32(),
            section = (string?)null
        }).ToArray();
        var hiddenAction = fields.Select(x => new { x.key, x.label, visible = x.key == "actions" ? false : x.visible, x.position, x.section }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Satış iade listesi", fields = hiddenAction })).StatusCode);

        var customized = fields.Select(x => x.key switch
        {
            "code" => new { x.key, label = "İade belgesi", visible = true, position = 0, section = (string?)"Belge" },
            "warehouseName" => new { x.key, label = x.label, visible = false, position = x.position + 1, section = (string?)"İade" },
            "actions" => new { x.key, label = x.label, visible = true, position = 7, section = (string?)null },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position + 1, section = (string?)"İade" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Satış iade listesi", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var activeA = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-returns/active");
        var activeFields = activeA.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("code", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("İade belgesi", activeFields[0].GetProperty("label").GetString());
        Assert.Equal("Belge", activeFields[0].GetProperty("section").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "warehouseName").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var activeB = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-returns/active");
        Assert.False(activeB.GetProperty("isPublished").GetBoolean());
        Assert.Equal("İade no", activeB.GetProperty("fields")[0].GetProperty("label").GetString());
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
        Assert.Equal(new[] { "assetCode", "name", "category", "acquisitionDate", "inServiceDate", "acquisitionCostBase", "residualValueBase", "usefulLifeMonths", "accumulatedDepreciationBase", "remainingBookValueBase", "vukTaxYear", "vukDepreciationLowerLimitTry", "vukCommuniqueNumber", "status", "actions" },
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

        // Simulate a published layout saved before the VUK columns entered the catalog.
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var savedView = await db.TenantScreenViews.SingleAsync(x => x.TenantId == TenantA && x.ScreenKey == "fixed-assets" && x.IsPublished);
            var legacyFields = new[]
            {
                new { key = "assetCode", label = "Eski kod etiketi", visible = true, position = 0, fixedField = false },
                new { key = "actions", label = "İşlemler", visible = true, position = 1, fixedField = true }
            };
            savedView.LayoutJson = JsonSerializer.Serialize(legacyFields.Select(field => new { field.key, field.label, field.visible, field.position, @fixed = field.fixedField }));
            await db.SaveChangesAsync();
        }

        var upgradedActive = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/fixed-assets/active");
        var upgradedFields = upgradedActive.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("Eski kod etiketi", upgradedFields[0].GetProperty("label").GetString());
        Assert.True(upgradedFields.Single(x => x.GetProperty("key").GetString() == "vukTaxYear").GetProperty("visible").GetBoolean());
        Assert.True(upgradedFields.Single(x => x.GetProperty("key").GetString() == "vukDepreciationLowerLimitTry").GetProperty("visible").GetBoolean());
        Assert.True(upgradedFields.Single(x => x.GetProperty("key").GetString() == "vukCommuniqueNumber").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", upgradedFields[^1].GetProperty("key").GetString());

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
    public async Task Fixed_asset_detail_layouts_are_allowlisted_publishable_and_isolated_per_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var depreciation = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "fixed-asset-depreciation");
        Assert.Equal(new[] { "periodStart", "amountBase", "isPosted", "journalEntryId" },
            depreciation.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());
        var assignments = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "fixed-asset-assignments");
        var assignmentFields = assignments.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "employee", "assignedDate", "returnedDate", "location", "actions" }, assignmentFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(assignmentFields[^1].GetProperty("fixed").GetBoolean());

        foreach (var (key, firstKey, label) in new[]
        {
            ("fixed-asset-depreciation", "amountBase", "Amortisman tutarı"),
            ("fixed-asset-assignments", "employee", "Zimmetli personel")
        })
        {
            var create = await client.PostAsJsonAsync($"/api/screen-views/{key}/draft", new { name = "Sabit kıymet ayrıntıları" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var fields = created.RootElement.GetProperty("fields").EnumerateArray().ToArray();
            var updated = fields.Select((field, index) => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("key").GetString() == firstKey ? label : field.GetProperty("label").GetString()!,
                visible = field.GetProperty("key").GetString() != "location" || key != "fixed-asset-assignments",
                position = field.GetProperty("key").GetString() == firstKey ? 0 : index + 1
            }).ToArray();
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Sabit kıymet ayrıntıları", fields = updated })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

            SetIdentity(client, TenantA, UserA, "TenantUser");
            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.Equal(firstKey, active.GetProperty("fields")[0].GetProperty("key").GetString());
            Assert.Equal(label, active.GetProperty("fields")[0].GetProperty("label").GetString());
            if (key == "fixed-asset-assignments")
            {
                Assert.False(active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "location").GetProperty("visible").GetBoolean());
                Assert.True(active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "actions").GetProperty("fixed").GetBoolean());
            }

            SetIdentity(client, TenantB, UserB, "TenantAdmin");
            var otherTenant = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
            Assert.NotEqual(label, otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
            SetIdentity(client, TenantA, UserA, "TenantAdmin");
        }
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

        var fixedActionWidth = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İşlem genişliği",
            fields = new[]
            {
                new { key = "personnelCode", label = "Personel kodu", visible = true, position = 0, width = (int?)null },
                new { key = "fullName", label = "Ad soyad", visible = true, position = 1, width = (int?)null },
                new { key = "department", label = "Departman", visible = true, position = 2, width = (int?)null },
                new { key = "jobTitle", label = "Görev", visible = true, position = 3, width = (int?)null },
                new { key = "status", label = "Durum", visible = true, position = 4, width = (int?)null },
                new { key = "actions", label = "İşlemler", visible = true, position = 5, width = (int?)180 }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, fixedActionWidth.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "Personel görünümü",
            fields = new[]
            {
                new { key = "jobTitle", label = "Görev", visible = true, position = 0, width = (int?)240 },
                new { key = "personnelCode", label = "Personel kodu", visible = true, position = 1, width = (int?)null },
                new { key = "fullName", label = "Ad soyad", visible = true, position = 2, width = (int?)null },
                new { key = "department", label = "Departman", visible = false, position = 3, width = (int?)null },
                new { key = "status", label = "Durum", visible = true, position = 4, width = (int?)null },
                new { key = "actions", label = "İşlemler", visible = true, position = 5, width = (int?)null }
            }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-employees/active");
        var activeFields = active!.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("jobTitle", activeFields[0].GetProperty("key").GetString());
        Assert.Equal(240, activeFields[0].GetProperty("width").GetInt32());
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

    [Fact]
    public async Task Hr_attendance_screen_view_is_allowlisted_fixed_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "hr-attendance");
        var allowedFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "employee", "workDate", "workedMinutes", "overtimeMinutes", "note", "actions" },
            allowedFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(allowedFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/hr-attendance/draft", new { name = "Puantaj listesi" });
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
                new { key = "workDate", label = "Tarih", visible = true, position = 1 },
                new { key = "workedMinutes", label = "Çalışma", visible = true, position = 2 },
                new { key = "overtimeMinutes", label = "Fazla mesai", visible = true, position = 3 },
                new { key = "note", label = "Not", visible = true, position = 4 },
                new { key = "actions", label = "İşlem", visible = false, position = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, hiddenActions.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "Puantaj listesi",
            fields = new[]
            {
                new { key = "workDate", label = "Çalışma günü", visible = true, position = 0 },
                new { key = "employee", label = "Personel", visible = true, position = 1 },
                new { key = "workedMinutes", label = "Çalışma", visible = false, position = 2 },
                new { key = "overtimeMinutes", label = "Fazla mesai", visible = true, position = 3 },
                new { key = "note", label = "Not", visible = true, position = 4 },
                new { key = "actions", label = "İşlem", visible = true, position = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-attendance/active");
        var activeFields = active!.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("workDate", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Çalışma günü", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "workedMinutes").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/hr-attendance/active");
        Assert.False(otherTenant!.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Personel", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/hr-attendance/history"))!);
    }

    [Fact]
    public async Task Direct_cash_budget_screen_view_is_allowlisted_fixed_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "direct-cash-budgets");
        var allowedFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "name", "fiscalYear", "currencyCode", "status", "lineCount", "revision", "actions" },
            allowedFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(allowedFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/direct-cash-budgets/draft", new { name = "Nakit bütçesi kartları" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();

        var hiddenActionFields = allowedFields.Select((field, position) => new
        {
            key = field.GetProperty("key").GetString(),
            label = field.GetProperty("label").GetString(),
            visible = field.GetProperty("key").GetString() != "actions",
            position
        }).ToArray();
        var hiddenAction = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "İşlemi gizle",
            fields = hiddenActionFields
        });
        Assert.Equal(HttpStatusCode.BadRequest, hiddenAction.StatusCode);

        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1,
            name = "Nakit bütçesi kartları",
            fields = new[]
            {
                new { key = "fiscalYear", label = "Bütçe yılı", visible = true, position = 0 },
                new { key = "name", label = "Plan başlığı", visible = true, position = 1 },
                new { key = "currencyCode", label = "Para birimi", visible = true, position = 2 },
                new { key = "status", label = "Durum", visible = true, position = 3 },
                new { key = "lineCount", label = "Satır", visible = false, position = 4 },
                new { key = "revision", label = "Sürüm", visible = true, position = 5 },
                new { key = "actions", label = "Planı aç", visible = true, position = 6 }
            }
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/direct-cash-budgets/active");
        var activeFields = active!.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("fiscalYear", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Bütçe yılı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "lineCount").GetProperty("visible").GetBoolean());
        var fixedAction = activeFields.Single(field => field.GetProperty("key").GetString() == "actions");
        Assert.True(fixedAction.GetProperty("visible").GetBoolean());
        Assert.True(fixedAction.GetProperty("fixed").GetBoolean());
        Assert.Equal("Planı aç", fixedAction.GetProperty("label").GetString());

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/direct-cash-budgets/active");
        Assert.False(otherTenant!.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Plan adı", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/direct-cash-budgets/history"))!);
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
    public async Task Operational_project_detail_layouts_are_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var expectations = new[]
        {
            (Key: "operational-project-tasks", Keys: new[] { "code", "name", "status", "plannedHours", "startDate", "endDate", "actions" }, Label: "Görev başlığı"),
            (Key: "operational-project-time-entries", Keys: new[] { "workDate", "taskName", "hours", "description" }, Label: "Çalışma açıklaması")
        };
        foreach (var expected in expectations)
        {
            var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == expected.Key);
            var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal(expected.Keys, catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
            if (expected.Key == "operational-project-tasks")
                Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

            var create = await client.PostAsJsonAsync($"/api/screen-views/{expected.Key}/draft", new { name = "Proje detay düzenim" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var sourceFields = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32(),
                fixedField = field.TryGetProperty("fixed", out var fixedValue) && fixedValue.GetBoolean()
            }).OrderBy(field => field.key == "name" || field.key == "taskName" ? -1 : field.position).ToArray();
            var customized = sourceFields.Select((field, position) => new
            {
                field.key,
                label = field.key == "name" || field.key == "taskName" ? expected.Label : field.label,
                visible = field.key == "code" ? false : field.visible,
                position,
                section = field.fixedField ? null : (string?)"Project detail"
            }).ToArray();
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
            {
                expectedRevision = 1,
                name = "Proje detay düzenim",
                fields = customized
            })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

            SetIdentity(client, TenantA, UserA, "TenantUser");
            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{expected.Key}/active");
            var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal(expected.Keys[1], activeFields[0].GetProperty("key").GetString());
            Assert.Equal(expected.Label, activeFields[0].GetProperty("label").GetString());
            Assert.Equal("Project detail", activeFields[0].GetProperty("section").GetString());
            if (expected.Key == "operational-project-tasks")
            {
                Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "code").GetProperty("visible").GetBoolean());
                Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());
                Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
            }

            SetIdentity(client, TenantB, UserB, "TenantUser");
            var isolated = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{expected.Key}/active");
            Assert.False(isolated.GetProperty("isPublished").GetBoolean());
            Assert.Equal(catalogFields[0].GetProperty("label").GetString(), isolated.GetProperty("fields")[0].GetProperty("label").GetString());
            SetIdentity(client, TenantA, UserA, "TenantAdmin");
        }
    }

    [Fact]
    public async Task Purchase_delivery_note_detail_layouts_are_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var expectations = new[]
        {
            (Key: "purchase-delivery-order-lines", Keys: new[] { "lineNumber", "product", "orderedQuantity", "deliveryQuantity" }, Label: "Delivered quantity", FixedKey: "deliveryQuantity"),
            (Key: "purchase-order-delivery-notes", Keys: new[] { "documentNumber", "documentDate", "lineCount", "purchaseReceiptCode", "actions" }, Label: "Supplier document", FixedKey: "actions"),
            (Key: "purchase-delivery-note-lines", Keys: new[] { "orderLineNumber", "quantity" }, Label: "Order line", FixedKey: (string?)null)
        };
        foreach (var expected in expectations)
        {
            var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == expected.Key);
            var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal(expected.Keys, catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
            if (expected.FixedKey is not null)
                Assert.True(catalogFields.Single(field => field.GetProperty("key").GetString() == expected.FixedKey).GetProperty("fixed").GetBoolean());

            var create = await client.PostAsJsonAsync($"/api/screen-views/{expected.Key}/draft", new { name = "Supplier delivery detail" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var customized = created.RootElement.GetProperty("fields").EnumerateArray().Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("key").GetString() == expected.Keys[1] ? expected.Label : field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("key").GetString() == expected.Keys[1] ? 0 : field.GetProperty("position").GetInt32() + 1,
                section = expected.FixedKey == field.GetProperty("key").GetString() ? null : "Delivery detail"
            }).ToArray();
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
            {
                expectedRevision = 1,
                name = "Supplier delivery detail",
                fields = customized
            })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

            SetIdentity(client, TenantA, UserA, "TenantUser");
            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{expected.Key}/active");
            var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal(expected.Keys[1], activeFields[0].GetProperty("key").GetString());
            Assert.Equal(expected.Label, activeFields[0].GetProperty("label").GetString());
            Assert.Equal("Delivery detail", activeFields[0].GetProperty("section").GetString());
            if (expected.FixedKey is not null)
            {
                var fixedField = Assert.Single(activeFields, field => field.GetProperty("key").GetString() == expected.FixedKey);
                Assert.True(fixedField.GetProperty("fixed").GetBoolean());
                Assert.True(fixedField.GetProperty("visible").GetBoolean());
            }

            SetIdentity(client, TenantB, UserB, "TenantUser");
            var isolated = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{expected.Key}/active");
            Assert.False(isolated.GetProperty("isPublished").GetBoolean());
            Assert.Equal(catalogFields[0].GetProperty("label").GetString(), isolated.GetProperty("fields")[0].GetProperty("label").GetString());
            SetIdentity(client, TenantA, UserA, "TenantAdmin");
        }
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
    public async Task Purchase_receipt_list_layout_is_customizable_tenant_scoped_and_keeps_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var screen = Assert.Single(catalog!, item => item.GetProperty("key").GetString() == "purchase-receipts");
        var catalogFields = screen.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "purchaseOrderCode", "receiptDate", "warehouseName", "lineCount", "status", "actions" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var created = await client.PostAsJsonAsync("/api/screen-views/purchase-receipts/draft", new { name = "Mal kabul listem" });
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
            "code" => new { field.key, label = "Mal kabul belgesi", visible = true, position = 0, section = (string?)"Belge" },
            "warehouseName" => new { field.key, label = field.label, visible = false, position = 2, section = (string?)"Depo" },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)null },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)"Belge" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Mal kabul listem", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-receipts/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("code", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Mal kabul belgesi", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "warehouseName").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/purchase-receipts/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Mal kabul no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_quote_list_layout_is_customizable_tenant_scoped_and_keeps_actions_fixed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var screen = Assert.Single(catalog!, item => item.GetProperty("key").GetString() == "sales-quotes");
        var catalogFields = screen.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "customerName", "quoteDate", "validUntil", "lineCount", "grandTotal", "status", "actions" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var created = await client.PostAsJsonAsync("/api/screen-views/sales-quotes/draft", new { name = "Teklif listem" });
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
            "code" => new { field.key, label = "Teklif referansı", visible = true, position = 0, section = (string?)"Belge" },
            "validUntil" => new { field.key, label = field.label, visible = false, position = 3, section = (string?)"Tarih" },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)null },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position, section = (string?)"Belge" }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Teklif listem", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-quotes/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("code", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Teklif referansı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "validUntil").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-quotes/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Teklif no", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_promotion_list_layout_is_customizable_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var screen = Assert.Single(catalog!, item => item.GetProperty("key").GetString() == "sales-promotions");
        var catalogFields = screen.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "name", "discountPercent", "effectiveFrom", "effectiveThrough", "status", "applicationCount" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());

        var created = await client.PostAsJsonAsync("/api/screen-views/sales-promotions/draft", new { name = "Kampanyalarım" });
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
        var customized = fields.Select(field => field.key switch
        {
            "code" => new { field.key, label = "Kampanya referansı", visible = true, position = 0 },
            "effectiveThrough" => new { field.key, label = field.label, visible = false, position = 4 },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Kampanyalarım", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-promotions/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("Kampanya referansı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "effectiveThrough").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-promotions/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kampanya kodu", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_campaign_performance_layout_is_customizable_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var screen = Assert.Single(catalog!, item => item.GetProperty("key").GetString() == "sales-campaign-performance");
        var catalogFields = screen.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "campaign", "applications", "appliedQuotes", "discountTotals", "linkedOrders", "linkedOrderTotals" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());

        var created = await client.PostAsJsonAsync("/api/screen-views/sales-campaign-performance/draft", new { name = "Kampanya raporum" });
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
        var customized = fields.Select(field => field.key switch
        {
            "campaign" => new { field.key, label = "Kampanya özeti", visible = true, position = 1 },
            "linkedOrders" => new { field.key, label = field.label, visible = false, position = 4 },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Kampanya raporum", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-campaign-performance/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("Kampanya özeti", activeFields.Single(field => field.GetProperty("key").GetString() == "campaign").GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "linkedOrders").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-campaign-performance/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kampanya", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
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

    [Fact]
    public async Task Bank_statement_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-statements");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "account", "period", "openingBalance", "closingBalance", "matching", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-statements/draft", new { name = "Banka ekstre listem" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var invalidFields = fields.Select(x => x.key == "code"
            ? new { key = "tenantSecret", label = "Gizli alan", visible = true, position = x.position }
            : new { x.key, x.label, visible = x.visible, position = x.position }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Geçersiz", fields = invalidFields })).StatusCode);

        var customized = fields.Select(x => x.key switch
        {
            "account" => new { x.key, label = "Banka hesabı", visible = true, position = 0 },
            "period" => new { x.key, label = x.label, visible = false, position = 1 },
            "code" => new { x.key, label = x.label, visible = true, position = 2 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Banka ekstre listem", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-statements/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("account", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Banka hesabı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "period").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-statements/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Hesap", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Bank_statement_line_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-statement-lines");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "lineNumber", "transactionDate", "direction", "description", "externalId", "reference", "amount", "matchStatus", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-statement-lines/draft", new { name = "Ekstre satırlarım" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "description" => new { x.key, label = "İşlem açıklaması", visible = true, position = 0 },
            "lineNumber" => new { x.key, label = x.label, visible = false, position = 1 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Ekstre satırlarım", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-statement-lines/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("description", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("İşlem açıklaması", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "lineNumber").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-statement-lines/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Açıklama", otherTenant.GetProperty("fields")[3].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Unmatched_book_movement_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-statement-unmatched-book");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "date", "source", "description", "amount" }, catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.All(catalogFields, x => Assert.False(x.GetProperty("fixed").GetBoolean()));

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-statement-unmatched-book/draft", new { name = "Eşleşmeyen hareketlerim" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "description" => new { x.key, label = "Defter açıklaması", visible = true, position = 0 },
            "date" => new { x.key, label = x.label, visible = false, position = 1 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Eşleşmeyen hareketlerim", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-statement-unmatched-book/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("description", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Defter açıklaması", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "date").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-statement-unmatched-book/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tarih", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_fx_exposure_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-fx-exposure");
        Assert.Equal(new[] { "invoice", "counterparty", "direction", "invoiceDate", "currencyCode", "outstandingAmount", "invoiceDateRate", "currentRate", "estimatedChangeBase" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-fx-exposure/draft", new { name = "Döviz riskim" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "counterparty" => new { x.key, label = "Cari unvanı", visible = true, position = 0 },
            "invoice" => new { x.key, label = x.label, visible = true, position = 1 },
            "currentRate" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Döviz riskim", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-fx-exposure/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("counterparty", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Cari unvanı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "currentRate").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-fx-exposure/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Cari", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_maturity_aging_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-maturity-aging");
        Assert.Equal(new[] { "direction", "currencyCode", "invoiceCount", "outstandingAmount", "notDue", "days1To30", "days31To60", "days61To90", "over90Days" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-maturity-aging/draft", new { name = "Vade dağılımım" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "currencyCode" => new { x.key, label = "Para", visible = true, position = 0 },
            "direction" => new { x.key, label = "Yön", visible = true, position = 1 },
            "notDue" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Vade dağılımım", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-maturity-aging/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("currencyCode", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Para", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "notDue").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-maturity-aging/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Döviz", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_maturity_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-maturities");
        Assert.Equal(new[] { "invoice", "counterparty", "direction", "invoiceDate", "dueDate", "outstandingAmount", "status" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-maturities/draft", new { name = "Vade listem" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "counterparty" => new { x.key, label = "Cari unvanı", visible = true, position = 0 },
            "invoice" => new { x.key, label = x.label, visible = true, position = 1 },
            "dueDate" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Vade listem", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-maturities/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("counterparty", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Cari unvanı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "dueDate").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-maturities/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Cari", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_cash_flow_forecast_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-cash-flow-forecast");
        Assert.Equal(new[] { "periodStart", "openingBalance", "receivables", "payables", "instrumentReceivables", "instrumentPayables", "creditFacilityPayments", "directCashBudgetInflows", "directCashBudgetOutflows", "postedMovements", "netChange", "closingBalance", "overdueTotal" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-cash-flow-forecast/draft", new { name = "Nakit tahminim" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32(), section = string.Empty })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "receivables" => new { x.key, label = "Beklenen tahsilat", visible = true, position = 0, section = "Tahsilat ve ödeme" },
            "periodStart" => new { x.key, label = x.label, visible = true, position = 1, section = "Dönem" },
            "payables" => new { x.key, label = x.label, visible = false, position = 2, section = "Tahsilat ve ödeme" },
            _ => new { x.key, x.label, visible = x.visible, position = x.position, x.section }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Nakit tahminim", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-cash-flow-forecast/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("receivables", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Beklenen tahsilat", activeFields[0].GetProperty("label").GetString());
        Assert.Equal("Tahsilat ve ödeme", activeFields[0].GetProperty("section").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "payables").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-cash-flow-forecast/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Alacak faturaları", otherTenant.GetProperty("fields")[2].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_income_statement_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-income-statement");
        Assert.Equal(new[] { "account", "section", "debit", "credit", "balance" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-income-statement/draft", new { name = "Gelir raporum" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "section" => new { x.key, label = "Rapor sınıfı", visible = true, position = 0 },
            "account" => new { x.key, label = x.label, visible = true, position = 1 },
            "debit" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Gelir raporum", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-income-statement/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("section", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Rapor sınıfı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "debit").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-income-statement/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Sınıf", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task General_ledger_account_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-ledger-accounts");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "code", "name", "statementSection", "status", "actions" },
            catalogFields.Select(x => x.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-ledger-accounts/draft", new { name = "Hesap planı" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "statementSection" => new { x.key, label = "Bilanço sınıfı", visible = true, position = 0 },
            "code" => new { x.key, label = x.label, visible = true, position = 1 },
            "name" => new { x.key, label = x.label, visible = false, position = 2 },
            _ => new { x.key, label = x.label, visible = x.visible, position = x.position + 3 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Hesap planı", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-ledger-accounts/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("statementSection", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Bilanço sınıfı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "name").GetProperty("visible").GetBoolean());
        Assert.True(activeFields.Single(x => x.GetProperty("key").GetString() == "actions").GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-ledger-accounts/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kod", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task General_ledger_mapping_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-ledger-mappings");
        Assert.Equal(new[] { "sourceAccount", "tenantAccount", "status" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-ledger-mappings/draft", new { name = "Hesap eşleştirmeleri" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "status" => new { x.key, label = "Eşleme durumu", visible = true, position = 0 },
            "tenantAccount" => new { x.key, label = "Firma hesabı", visible = false, position = 1 },
            _ => new { x.key, x.label, visible = x.visible, position = 2 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Hesap eşleştirmeleri", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-ledger-mappings/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("status", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Eşleme durumu", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "tenantAccount").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-ledger-mappings/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Kaynak hesabı", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_balance_sheet_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-balance-sheet");
        Assert.Equal(new[] { "account", "section", "debit", "credit", "balance" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-balance-sheet/draft", new { name = "Bilanço düzenim" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "section" => new { x.key, label = "Bilanço sınıfı", visible = true, position = 0 },
            "account" => new { x.key, x.label, visible = true, position = 1 },
            "debit" => new { x.key, x.label, visible = false, position = 2 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Bilanço düzenim", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-balance-sheet/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("section", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Bilanço sınıfı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "debit").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-balance-sheet/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Sınıf", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_fx_revaluation_voucher_and_line_layouts_are_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var keys = new[] { "finance-fx-revaluations", "finance-fx-revaluation-lines" };
        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        foreach (var key in keys)
        {
            var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == key);
            var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
            Assert.NotEmpty(catalogFields);
            if (key == "finance-fx-revaluations")
                Assert.True(catalogFields.Single(x => x.GetProperty("key").GetString() == "actions").GetProperty("fixed").GetBoolean());

            var create = await client.PostAsJsonAsync($"/api/screen-views/{key}/draft", new { name = "Kur değerleme düzenim" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var fields = created.RootElement.GetProperty("fields").EnumerateArray()
                .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
                .ToArray();
            var changedKey = key == "finance-fx-revaluations" ? "totalDebit" : "adjustmentBase";
            var customized = fields.Select(x => x.key == changedKey
                ? new { x.key, label = "Değerleme · özel", visible = true, position = x.position }
                : new { x.key, x.label, x.visible, x.position }).ToArray();
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Kur değerleme düzenim", fields = customized })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);
        }

        SetIdentity(client, TenantA, UserA, "TenantUser");
        foreach (var key in keys)
        {
            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.True(active.GetProperty("isPublished").GetBoolean());
            var changedKey = key == "finance-fx-revaluations" ? "totalDebit" : "adjustmentBase";
            Assert.Equal("Değerleme · özel", active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == changedKey).GetProperty("label").GetString());
        }

        SetIdentity(client, TenantB, UserB, "TenantUser");
        foreach (var key in keys)
        {
            var otherTenant = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        }
    }

    [Fact]
    public async Task Finance_cash_flow_report_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-cash-flow-report");
        Assert.Equal(new[] { "currencyCode", "openingBalance", "operating", "investing", "financing", "internalTransfers", "unclassified", "openingAdjustments", "netChange", "closingBalance", "reconciles" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-cash-flow-report/draft", new { name = "Gerçekleşen nakit raporum" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "operating" => new { x.key, label = "Operasyon", visible = true, position = 0 },
            "unclassified" => new { x.key, x.label, visible = false, position = 6 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position + 1 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Gerçekleşen nakit raporum", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-cash-flow-report/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("operating", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Operasyon", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(x => x.GetProperty("key").GetString() == "unclassified").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-cash-flow-report/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Döviz", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_trial_balance_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-trial-balance");
        Assert.Equal(new[] { "account", "openingDebit", "openingCredit", "debit", "credit", "balanceDebit", "balanceCredit" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-trial-balance/draft", new { name = "Aylık mizan" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "balanceCredit" => new { x.key, label = "Alacak bakiye", visible = false, position = 0 },
            "account" => new { x.key, x.label, visible = true, position = 1 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Aylık mizan", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-trial-balance/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("balanceCredit", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Alacak bakiye", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields[0].GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-trial-balance/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Açılış borç", otherTenant.GetProperty("fields")[1].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_budget_scenario_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == "finance-budget-scenarios");
        Assert.Equal(new[] { "periodStart", "account", "section", "plannedAmount", "actualAmount", "variance", "notes" },
            catalog.GetProperty("fields").EnumerateArray().Select(x => x.GetProperty("key").GetString()).ToArray());

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-budget-scenarios/draft", new { name = "Bütçe gerçekleşen görünümü" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
            .ToArray();
        var customized = fields.Select(x => x.key switch
        {
            "plannedAmount" => new { x.key, label = "Bütçe tutarı", visible = true, position = 0 },
            "variance" => new { x.key, x.label, visible = false, position = 1 },
            _ => new { x.key, x.label, visible = x.visible, position = x.position + 2 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Bütçe gerçekleşen görünümü", fields = customized })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-budget-scenarios/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("plannedAmount", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Bütçe tutarı", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields[1].GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-budget-scenarios/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Dönem", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Finance_credit_schedule_and_movement_layouts_are_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var keys = new[] { "finance-credit-schedules", "finance-credit-movements" };
        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        foreach (var key in keys)
        {
            var catalog = Assert.Single(catalogs!, x => x.GetProperty("key").GetString() == key);
            var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
            Assert.NotEmpty(catalogFields);
            Assert.True(catalogFields.Single(x => x.GetProperty("key").GetString() == "actions").GetProperty("fixed").GetBoolean());

            var create = await client.PostAsJsonAsync($"/api/screen-views/{key}/draft", new { name = "Kredi hareket görünümü" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var fields = created.RootElement.GetProperty("fields").EnumerateArray()
                .Select(x => new { key = x.GetProperty("key").GetString()!, label = x.GetProperty("label").GetString()!, visible = x.GetProperty("visible").GetBoolean(), position = x.GetProperty("position").GetInt32() })
                .ToArray();
            var renamedKey = key == "finance-credit-schedules" ? "principalAmount" : "accountCode";
            var customized = fields.Select(x => x.key == renamedKey
                ? new { x.key, label = "Alan · özel", visible = true, position = 0 }
                : new { x.key, x.label, x.visible, position = x.position + 1 }).ToArray();
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new { expectedRevision = 1, name = "Kredi hareket görünümü", fields = customized })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);
        }

        SetIdentity(client, TenantA, UserA, "TenantUser");
        foreach (var key in keys)
        {
            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            var renamedKey = key == "finance-credit-schedules" ? "principalAmount" : "accountCode";
            Assert.True(active.GetProperty("isPublished").GetBoolean());
            Assert.Equal("Alan · özel", active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == renamedKey).GetProperty("label").GetString());
            Assert.True(active.GetProperty("fields").EnumerateArray().Single(x => x.GetProperty("key").GetString() == "actions").GetProperty("fixed").GetBoolean());
        }

        SetIdentity(client, TenantB, UserB, "TenantUser");
        foreach (var key in keys)
        {
            var otherTenant = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{key}/active");
            Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        }
    }

    [Fact]
    public async Task Finance_account_transactions_layout_is_allowlisted_published_and_tenant_scoped_with_fixed_actions()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "finance-account-transactions");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "transactionDate", "source", "description", "cashFlowCategory", "reference", "inflow", "outflow", "actions" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());
        Assert.True(catalogFields[^1].GetProperty("fixed").GetBoolean());

        var created = await client.PostAsJsonAsync("/api/screen-views/finance-account-transactions/draft", new { name = "Hesap hareketlerim" });
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
        var customized = fields.Select(field => field.key switch
        {
            "inflow" => new { field.key, label = "Para girişi", visible = true, position = 0 },
            "source" => new { field.key, label = field.label, visible = false, position = 3 },
            "actions" => new { field.key, label = field.label, visible = field.visible, position = field.position },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position + 1 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Hesap hareketlerim", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-account-transactions/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("inflow", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Para girişi", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "source").GetProperty("visible").GetBoolean());
        Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
        Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-account-transactions/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("Tarih", otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
    }

    [Fact]
    public async Task Sales_distribution_plan_layout_is_allowlisted_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");
        var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == "sales-distribution-plan");
        var catalogFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal(new[] { "stock", "openDemand", "onHand", "activeReserved", "available", "uncovered", "openOrderCount" },
            catalogFields.Select(field => field.GetProperty("key").GetString()).ToArray());

        var created = await client.PostAsJsonAsync("/api/screen-views/sales-distribution-plan/draft", new { name = "Depo ihtiyaç görünümü" });
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
        var customized = fields.Select(field => field.key switch
        {
            "uncovered" => new { field.key, label = "Karşılanmayan", visible = true, position = 0 },
            "activeReserved" => new { field.key, label = field.label, visible = false, position = 3 },
            _ => new { field.key, label = field.label, visible = field.visible, position = field.position + 1 }
        }).ToArray();
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Depo ihtiyaç görünümü", fields = customized
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        SetIdentity(client, TenantA, UserA, "TenantUser");
        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-distribution-plan/active");
        var activeFields = active.GetProperty("fields").EnumerateArray().ToArray();
        Assert.Equal("uncovered", activeFields[0].GetProperty("key").GetString());
        Assert.Equal("Karşılanmayan", activeFields[0].GetProperty("label").GetString());
        Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == "activeReserved").GetProperty("visible").GetBoolean());

        SetIdentity(client, TenantB, UserB, "TenantUser");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/sales-distribution-plan/active");
        Assert.False(otherTenant.GetProperty("isPublished").GetBoolean());
        Assert.Equal("stock", otherTenant.GetProperty("fields")[0].GetProperty("key").GetString());
    }

    [Fact]
    public async Task Hr_payroll_calendar_views_publish_independently_with_fixed_actions_and_tenant_isolation()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        var screens = new[]
        {
            (Key: "hr-workplace-assignments", First: "employee", Second: "workplaceCode", Third: "effectiveFrom", DefaultLabel: "Personel"),
            (Key: "hr-workplace-calendars", First: "workplaceCode", Second: "effectiveFrom", Third: "versionStatus", DefaultLabel: "İşyeri"),
            (Key: "hr-employee-calendar-overrides", First: "employee", Second: "effectiveFrom", Third: "versionStatus", DefaultLabel: "Personel")
        };
        SetIdentity(client, TenantA, UserA, "TenantAdmin");
        var catalogs = await client.GetFromJsonAsync<JsonElement[]>("/api/screen-views/catalog");

        foreach (var screen in screens)
        {
            var catalog = Assert.Single(catalogs!, item => item.GetProperty("key").GetString() == screen.Key);
            var allowedFields = catalog.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal("actions", allowedFields[^1].GetProperty("key").GetString());
            Assert.True(allowedFields[^1].GetProperty("fixed").GetBoolean());
            Assert.DoesNotContain(allowedFields.Select(field => field.GetProperty("key").GetString()), key => key is "personnelCode" or "workDate");

            var create = await client.PostAsJsonAsync($"/api/screen-views/{screen.Key}/draft", new { name = "Takvim görünümü" });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
            var draftId = created.RootElement.GetProperty("id").GetGuid();
            var currentFields = allowedFields.Select(field => field.GetProperty("key").GetString()!).ToArray();

            var hiddenActions = currentFields.Select((key, index) => new
            {
                key,
                label = key,
                visible = key != "actions",
                position = index
            }).ToArray();
            var rejected = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
            {
                expectedRevision = 1,
                name = "İşlem kolonunu gizle",
                fields = hiddenActions
            });
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);

            var updateFields = currentFields.Select((key, index) => new
            {
                key,
                label = key == screen.First ? "Özel kişi etiketi" : key,
                visible = key != screen.Third,
                position = key == screen.First ? 1 : key == screen.Second ? 0 : index
            }).ToArray();
            var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
            {
                expectedRevision = 1,
                name = "Takvim görünümü",
                fields = updateFields
            });
            Assert.Equal(HttpStatusCode.OK, update.StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

            var active = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{screen.Key}/active");
            var activeFields = active!.GetProperty("fields").EnumerateArray().ToArray();
            Assert.Equal(screen.Second, activeFields[0].GetProperty("key").GetString());
            Assert.Equal(screen.First, activeFields[1].GetProperty("key").GetString());
            Assert.Equal("Özel kişi etiketi", activeFields[1].GetProperty("label").GetString());
            Assert.False(activeFields.Single(field => field.GetProperty("key").GetString() == screen.Third).GetProperty("visible").GetBoolean());
            Assert.Equal("actions", activeFields[^1].GetProperty("key").GetString());
            Assert.True(activeFields[^1].GetProperty("visible").GetBoolean());
            Assert.True(activeFields[^1].GetProperty("fixed").GetBoolean());

            SetIdentity(client, TenantB, UserB, "TenantAdmin");
            var otherTenant = await client.GetFromJsonAsync<JsonElement>($"/api/screen-views/{screen.Key}/active");
            Assert.False(otherTenant!.GetProperty("isPublished").GetBoolean());
            Assert.Equal(screen.DefaultLabel, otherTenant.GetProperty("fields")[0].GetProperty("label").GetString());
            Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>($"/api/screen-views/{screen.Key}/history"))!);
            SetIdentity(client, TenantA, UserA, "TenantAdmin");
        }
    }

    [Fact]
    public async Task Finance_grid_column_width_is_validated_versioned_published_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, UserA, "TenantAdmin");

        var create = await client.PostAsJsonAsync("/api/screen-views/finance-accounts/draft", new { name = "Kasa listesi" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var draftId = created.RootElement.GetProperty("id").GetGuid();
        var fields = created.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32(),
                width = field.GetProperty("key").GetString() switch
                {
                    "name" => 320,
                    "actions" => 120,
                    _ => (int?)null
                }
            })
            .ToArray();

        var fixedWidth = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Sabit işlem genişliği", fields
        });
        Assert.Equal(HttpStatusCode.BadRequest, fixedWidth.StatusCode);

        var validFields = fields.Select(field => new
        {
            field.key, field.label, field.visible, field.position,
            width = field.key == "actions" ? (int?)null : field.width
        }).ToArray();
        var update = await client.PutAsJsonAsync($"/api/screen-views/{draftId}", new
        {
            expectedRevision = 1, name = "Kasa listesi", fields = validFields
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/screen-views/{draftId}/publish", new { expectedRevision = 2 })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-accounts/active");
        Assert.Equal(320, active!.GetProperty("fields").EnumerateArray()
            .Single(field => field.GetProperty("key").GetString() == "name").GetProperty("width").GetInt32());

        var unsupported = await client.PostAsJsonAsync("/api/screen-views/inventory-stock/draft", new { name = "Stok kartları" });
        Assert.Equal(HttpStatusCode.Created, unsupported.StatusCode);
        using var unsupportedDraft = JsonDocument.Parse(await unsupported.Content.ReadAsStringAsync());
        var stockDraftId = unsupportedDraft.RootElement.GetProperty("id").GetGuid();
        var stockFields = unsupportedDraft.RootElement.GetProperty("fields").EnumerateArray()
            .Select(field => new
            {
                key = field.GetProperty("key").GetString()!,
                label = field.GetProperty("label").GetString()!,
                visible = field.GetProperty("visible").GetBoolean(),
                position = field.GetProperty("position").GetInt32(),
                width = field.GetProperty("key").GetString() == "name" ? 320 : (int?)null
            }).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/screen-views/{stockDraftId}", new
        {
            expectedRevision = 1, name = "Stok kartları", fields = stockFields
        })).StatusCode);

        SetIdentity(client, TenantB, UserB, "TenantAdmin");
        var otherTenant = await client.GetFromJsonAsync<JsonElement>("/api/screen-views/finance-accounts/active");
        Assert.False(otherTenant!.GetProperty("isPublished").GetBoolean());
        Assert.Equal(JsonValueKind.Null, otherTenant.GetProperty("fields").EnumerateArray()
            .Single(field => field.GetProperty("key").GetString() == "name").GetProperty("width").ValueKind);
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
