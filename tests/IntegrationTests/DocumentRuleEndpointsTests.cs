using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 3, task 3: rule set draft, publish, history, Dene and the people picker.</summary>
public sealed class DocumentRuleEndpointsTests
{
    private const string Route = "/api/document-rules/satis.siparis/onayla";

    internal static object ApprovalRule(Guid person, string value = "100", string code = "buyukTutar") => new
    {
        code, order = 1, enabled = true, always = false, field = "grandTotal", op = "GreaterThan", value, action = "approval", approverUserIds = new[] { person }
    };

    internal static async Task PublishAsync(HttpClient client, params object[] rules)
    {
        using var draft = await client.PutAsJsonAsync(Route + "/draft", new { rules });
        Assert.True(draft.StatusCode == HttpStatusCode.OK, await draft.Content.ReadAsStringAsync());
        using var publish = await client.PostAsJsonAsync(Route + "/publish", new { });
        Assert.True(publish.StatusCode == HttpStatusCode.OK, await publish.Content.ReadAsStringAsync());
    }

    private static Task AllowAsync(SalesOrderApiFactory factory, SalesOrderSeed seed, params string[] codes) => factory.WithPlatformDbAsync(async platform =>
    {
        foreach (var code in codes)
        {
            var permission = await platform.PermissionDefinitions.SingleAsync(x => x.Code == code);
            platform.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = seed.TenantId, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser", PermissionCode = code,
                Permission = permission, Effect = TenantPermissionEffect.Allow, ResourceType = permission.ResourceType
            });
        }
        await platform.SaveChangesAsync();
    });

    [Fact]
    public async Task Draft_publish_and_history()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        await PublishAsync(client, ApprovalRule(seed.AdminUserId));
        using (var second = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>() })) Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var view = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync(Route));

        Assert.Equal(1, view.GetProperty("published").GetProperty("version").GetInt32());
        Assert.Equal(1, view.GetProperty("published").GetProperty("rules").GetArrayLength());
        Assert.Equal(2, view.GetProperty("draft").GetProperty("version").GetInt32());
        Assert.Equal<IEnumerable<string?>>(["Draft", "Published"], view.GetProperty("history").EnumerateArray().Select(x => x.GetProperty("status").GetString()));
        Assert.Equal(11, view.GetProperty("fields").GetArrayLength());

        using (var publish = await client.PostAsJsonAsync(Route + "/publish", new { })) Assert.Equal(HttpStatusCode.OK, publish.StatusCode);
        var after = await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync(Route));
        Assert.Equal(2, after.GetProperty("published").GetProperty("version").GetInt32());
        Assert.Equal(JsonValueKind.Null, after.GetProperty("draft").ValueKind);
        Assert.Equal<IEnumerable<string?>>(["Published", "Archived"], after.GetProperty("history").EnumerateArray().Select(x => x.GetProperty("status").GetString()));
        using var nothing = await client.PostAsJsonAsync(Route + "/publish", new { });
        Assert.Equal(HttpStatusCode.Conflict, nothing.StatusCode);
    }

    [Fact]
    public async Task Invalid_rules_foreign_people_and_stale_drafts_are_rejected()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        var other = await factory.SeedAsync("other");
        using var client = factory.Client(seed);

        using var invalid = await client.PutAsJsonAsync(Route + "/draft", new { rules = new[] { new { code = "a", action = "approval", always = true } } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var foreign = await client.PutAsJsonAsync(Route + "/draft", new { rules = new[] { ApprovalRule(other.AdminUserId) } });
        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
        Assert.Contains("bu firmanın kullanıcıları", await foreign.Content.ReadAsStringAsync());

        using (var first = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>() })) Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        using var stale = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>(), expectedUpdatedAt = DateTimeOffset.UnixEpoch });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Tenant_user_needs_the_document_rule_permissions()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed, "TenantUser");

        using (var denied = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>() })) Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        await AllowAsync(factory, seed, "erp.document-rules.read", "erp.document-rules.update");
        using (var allowed = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>() })) Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        using (var publish = await client.PostAsJsonAsync(Route + "/publish", new { })) Assert.Equal(HttpStatusCode.Forbidden, publish.StatusCode);
    }

    [Fact]
    public async Task Try_runs_the_draft_on_an_order_and_writes_nothing()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 20m);
        using var client = factory.Client(seed);
        await PublishAsync(client, ApprovalRule(seed.UserId, value: "100000"));
        using (var draft = await client.PutAsJsonAsync(Route + "/draft", new { rules = new[] { ApprovalRule(seed.UserId), ApprovalRule(seed.AdminUserId, code: "ikinci") } }))
            Assert.Equal(HttpStatusCode.OK, draft.StatusCode);
        var before = await CountsAsync(factory);

        using var response = await client.PostAsJsonAsync(Route + "/try", new { orderId, actorUserId = seed.AdminUserId });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await SalesOrderApiFactory.ReadJsonAsync(response);
        Assert.Equal("approval", result.GetProperty("result").GetString());
        Assert.True(result.GetProperty("usedDraft").GetBoolean());
        Assert.True(result.GetProperty("actorExcluded").GetBoolean());
        Assert.Equal([seed.UserId], result.GetProperty("approvers").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal("done", result.GetProperty("steps")[0].GetProperty("outcome").GetString());
        Assert.Equal(before, await CountsAsync(factory));
        await factory.WithTenantDbAsync(async db => Assert.Equal(SalesOrderStatus.Draft, (await db.SalesOrders.SingleAsync(x => x.Id == orderId)).Status));
    }

    [Fact]
    public async Task Try_with_sample_facts_blocks_warns_or_approves()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);
        using (var draft = await client.PutAsJsonAsync(Route + "/draft", new
        {
            rules = new object[]
            {
                new { code = "engel", order = 1, enabled = true, always = false, field = "customerGroup", op = "Equals", value = "Kara liste", action = "block", message = "Onaylanamaz." },
                new { code = "uyari", order = 2, enabled = true, always = false, field = "maxLineDiscount", op = "GreaterThan", value = "15", action = "warn", message = "İskonto yüksek." }
            }
        })) Assert.Equal(HttpStatusCode.OK, draft.StatusCode);

        async Task<JsonElement> Try(object facts) => await SalesOrderApiFactory.ReadJsonAsync(await client.PostAsJsonAsync(Route + "/try", new { facts }));

        var blocked = await Try(new { customerGroup = "kara liste", maxLineDiscount = "20" });
        Assert.Equal("blocked", blocked.GetProperty("result").GetString());
        Assert.Equal("Onaylanamaz.", blocked.GetProperty("steps").EnumerateArray().Last().GetProperty("message").GetString());
        var warned = await Try(new { customerGroup = "Toptan", maxLineDiscount = "20" });
        Assert.Equal("approved", warned.GetProperty("result").GetString());
        Assert.Contains(warned.GetProperty("steps").EnumerateArray(), x => x.GetProperty("outcome").GetString() == "warned");
        Assert.Equal("skipped", warned.GetProperty("steps")[0].GetProperty("outcome").GetString());
    }

    [Fact]
    public async Task People_lists_only_this_tenants_members()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync("own");
        await factory.SeedAsync("other");
        using var client = factory.Client(seed);

        var people = (await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-rules/people"))).EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid()).ToHashSet();

        Assert.Equal(new HashSet<Guid> { seed.AdminUserId, seed.UserId }, people);
    }

    private static Task<(int Activities, int Audits, int Workflows, int Sets)> CountsAsync(SalesOrderApiFactory factory) =>
        factory.WithTenantDbAsync(async db => (await db.TenantDocumentActivities.CountAsync(), await db.AuditEvents.CountAsync(),
            await db.TenantWorkflowInstances.CountAsync(), await db.TenantDocumentRuleSets.CountAsync()));

    [Fact]
    public async Task Unexpected_draft_and_stale_publish_conflict()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);
        using (var first = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>(), expectDraft = false }))
            Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Someone else's view had no draft: saving must not overwrite the draft created meanwhile.
        using var overwrite = await client.PutAsJsonAsync(Route + "/draft", new { rules = Array.Empty<object>(), expectDraft = false });
        Assert.Equal(HttpStatusCode.Conflict, overwrite.StatusCode);
        // Publishing what one has not seen is refused too.
        using var stale = await client.PostAsJsonAsync(Route + "/publish", new { expectedUpdatedAt = DateTimeOffset.UnixEpoch });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task People_returns_only_ids_and_names()
    {
        await using var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        using var client = factory.Client(seed);

        var first = (await SalesOrderApiFactory.ReadJsonAsync(await client.GetAsync("/api/document-rules/people")))[0];

        Assert.Equal(["displayName", "id"], first.EnumerateObject().Select(x => x.Name).Order().ToArray());
    }
}
