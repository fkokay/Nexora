using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>Belge kuralları PR 3, task 4 (spec §7): consultant rules on Onayla and the approval workflow they start.</summary>
public sealed class SalesOrderRuleApprovalTests
{
    private const string Rules = "/api/document-rules/satis.siparis/onayla";

    private sealed record World(SalesOrderApiFactory Factory, SalesOrderSeed Seed, Guid Mehmet, Guid Ayse, Guid OrderId) : IAsyncDisposable
    {
        public HttpClient As(Guid user, string role)
        {
            var client = Factory.CreateClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", Seed.TenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", user.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Role", role);
            return client;
        }
        public HttpClient Admin => Factory.Client(Seed);
        public ValueTask DisposeAsync() => Factory.DisposeAsync();
    }

    /// <summary>An order of 20 × 10 TRY (+20 % VAT = 240), two extra TenantUsers (Mehmet, Ayşe) allowed to approve and decide.</summary>
    private static async Task<World> WorldAsync()
    {
        var factory = new SalesOrderApiFactory();
        var seed = await factory.SeedAsync();
        Guid mehmet = Guid.NewGuid(), ayse = Guid.NewGuid();
        await factory.WithPlatformDbAsync(async platform =>
        {
            var tenant = await platform.Tenants.SingleAsync(x => x.Id == seed.TenantId);
            foreach (var (id, name) in new[] { (mehmet, "Mehmet Demir"), (ayse, "Ayşe Kaya") })
            {
                var account = new AppUser { Id = id, Email = $"{id:N}@example.test", DisplayName = name };
                platform.Users.Add(account);
                platform.TenantMemberships.Add(new TenantMembership { UserId = id, User = account, TenantId = seed.TenantId, Tenant = tenant, Role = "TenantUser" });
            }
            foreach (var code in new[] { "erp.sales-orders.read", "erp.sales-orders.execute", "erp.workflows.read", "erp.workflows.execute" })
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
        var orderId = await factory.SeedOrderAsync(seed, SalesOrderStatus.Draft, quantity: 20m);
        return new World(factory, seed, mehmet, ayse, orderId);
    }

    private static object Rule(string code, string action, int order = 1, string field = "grandTotal", string op = "GreaterThan", string value = "100",
        Guid[]? people = null, string? message = null) =>
        new { code, order, enabled = true, always = false, field, op, value, action, approverUserIds = people ?? [], message };

    private static async Task<HttpResponseMessage> ApproveAsync(HttpClient client, Guid orderId, bool acknowledge = false) =>
        await client.PostAsJsonAsync($"/api/sales/orders/{orderId}/approve", new { requestId = Guid.NewGuid(), acknowledgeWarnings = acknowledge });

    private static Task<SalesOrderStatus> StatusAsync(World w) => w.Factory.WithTenantDbAsync(async db => (await db.SalesOrders.SingleAsync(x => x.Id == w.OrderId)).Status);

    private static Task<TenantWorkflowInstance?> InstanceAsync(World w) =>
        w.Factory.WithTenantDbAsync(db => db.TenantWorkflowInstances.AsNoTracking().SingleOrDefaultAsync(x => x.SubjectType == "SalesOrder" && x.SubjectId == w.OrderId));

    private static async Task<HttpResponseMessage> DecideAsync(HttpClient client, Guid instanceId, string decision, string? comment = null) =>
        await client.PostAsJsonAsync($"/api/workflows/instances/{instanceId}/decision", new { decision, comment });

    [Fact]
    public async Task Without_rules_the_saver_approves()
    {
        await using var w = await WorldAsync();
        using var response = await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(w));
        Assert.Null(await InstanceAsync(w));
    }

    [Fact]
    public async Task Draft_rules_do_not_apply()
    {
        await using var w = await WorldAsync();
        using (var draft = await w.Admin.PutAsJsonAsync(Rules + "/draft", new { rules = new[] { Rule("onay", "approval", people: [w.Mehmet]) } }))
            Assert.Equal(HttpStatusCode.OK, draft.StatusCode);
        using var response = await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(w));
    }

    [Fact]
    public async Task Approval_rule_puts_the_order_on_hold_and_a_listed_person_approves()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet, w.Seed.UserId]));

        using var response = await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("PendingApproval", (await SalesOrderApiFactory.ReadJsonAsync(response)).GetProperty("status").GetString());
        var instance = (await InstanceAsync(w))!;
        Assert.Equal("Pending", instance.Status);
        Assert.Equal(w.Seed.UserId, instance.StartedByUserId);
        Assert.Contains(w.Mehmet.ToString("D"), instance.StepsJsonSnapshot, StringComparison.OrdinalIgnoreCase);

        // The saver is listed and has the step role, yet cannot decide; nor can an unlisted person, admin included.
        using (var self = await DecideAsync(w.As(w.Seed.UserId, "TenantUser"), instance.Id, "Approved")) Assert.Equal(HttpStatusCode.Forbidden, self.StatusCode);
        using (var other = await DecideAsync(w.As(w.Ayse, "TenantUser"), instance.Id, "Approved")) Assert.Equal(HttpStatusCode.Forbidden, other.StatusCode);
        using (var admin = await DecideAsync(w.Admin, instance.Id, "Approved")) Assert.Equal(HttpStatusCode.Forbidden, admin.StatusCode);
        Assert.Equal(SalesOrderStatus.PendingApproval, await StatusAsync(w));

        using var decided = await DecideAsync(w.As(w.Mehmet, "TenantUser"), instance.Id, "Approved");
        Assert.Equal(HttpStatusCode.OK, decided.StatusCode);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(w));
        var steps = await w.Factory.WithTenantDbAsync(db => db.TenantDocumentActivities.Where(x => x.DocumentId == w.OrderId).Select(x => x.Step + ":" + x.Outcome).ToListAsync());
        Assert.Contains("Onay bekleniyor:waiting", steps);
        Assert.Contains("Onaylandı:done", steps);
    }

    [Fact]
    public async Task Two_approval_rules_are_two_steps_in_rule_order()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("ikinci", "approval", order: 2, people: [w.Ayse]), Rule("birinci", "approval", order: 1, people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        var instance = (await InstanceAsync(w))!;

        using (var early = await DecideAsync(w.As(w.Ayse, "TenantUser"), instance.Id, "Approved")) Assert.Equal(HttpStatusCode.Forbidden, early.StatusCode);
        using (var first = await DecideAsync(w.As(w.Mehmet, "TenantUser"), instance.Id, "Approved")) Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(SalesOrderStatus.PendingApproval, await StatusAsync(w));
        using (var second = await DecideAsync(w.As(w.Ayse, "TenantUser"), instance.Id, "Approved")) Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(w));
    }

    [Fact]
    public async Task Rejection_needs_a_reason_and_returns_the_order_to_draft()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        var instance = (await InstanceAsync(w))!;

        using (var bare = await DecideAsync(w.As(w.Mehmet, "TenantUser"), instance.Id, "Rejected")) Assert.Equal(HttpStatusCode.BadRequest, bare.StatusCode);
        using (var rejected = await DecideAsync(w.As(w.Mehmet, "TenantUser"), instance.Id, "Rejected", "Fiyat yanlış")) Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);

        Assert.Equal(SalesOrderStatus.Draft, await StatusAsync(w));
        var log = await w.Factory.WithTenantDbAsync(db => db.TenantDocumentActivities.SingleAsync(x => x.DocumentId == w.OrderId && x.Step == "Reddedildi"));
        Assert.Equal("Fiyat yanlış", log.Message);
    }

    [Fact]
    public async Task Block_rule_stops_with_its_message_and_logs_it()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("engel", "block", message: "Bu tutar onaylanamaz."));

        using var response = await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("Bu tutar onaylanamaz.", await response.Content.ReadAsStringAsync());
        Assert.Equal(SalesOrderStatus.Draft, await StatusAsync(w));
        Assert.True(await w.Factory.WithTenantDbAsync(db => db.TenantDocumentActivities.AnyAsync(x => x.DocumentId == w.OrderId && x.Outcome == "blocked" && x.Source == "rule")));
    }

    [Fact]
    public async Task Warning_rule_needs_confirmation_then_approves()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("uyari", "warn", message: "Tutar yüksek."));
        var client = w.As(w.Seed.UserId, "TenantUser");

        using var first = await ApproveAsync(client, w.OrderId);
        Assert.Equal(HttpStatusCode.Conflict, first.StatusCode);
        var body = await SalesOrderApiFactory.ReadJsonAsync(first);
        Assert.Equal("needsConfirmation", body.GetProperty("code").GetString());
        Assert.Equal<IEnumerable<string?>>(["Tutar yüksek."], body.GetProperty("warnings").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(SalesOrderStatus.Draft, await StatusAsync(w));

        using var second = await ApproveAsync(client, w.OrderId, acknowledge: true);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(SalesOrderStatus.Open, await StatusAsync(w));
    }

    [Fact]
    public async Task Only_approver_being_the_saver_blocks_the_approval()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Seed.UserId]));

        using var response = await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(SalesOrderStatus.Draft, await StatusAsync(w));
    }

    [Fact]
    public async Task Cancelling_a_pending_order_closes_its_workflow()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);

        using var cancel = await w.Admin.PostAsJsonAsync($"/api/sales/orders/{w.OrderId}/cancel", new { reason = "Vazgeçildi" });

        Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);
        Assert.Equal(SalesOrderStatus.Cancelled, await StatusAsync(w));
        Assert.Equal("Cancelled", (await InstanceAsync(w))!.Status);
    }

    [Fact]
    public async Task Sales_order_workflows_cannot_be_started_or_edited_by_hand()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        var definitionId = (await InstanceAsync(w))!.DefinitionId;

        using var start = await w.Admin.PostAsJsonAsync($"/api/workflows/definitions/{definitionId}/instances",
            new { subjectType = "SalesOrder", subjectTitle = "Elle", subjectId = w.OrderId });
        Assert.True(start.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Conflict, start.StatusCode.ToString());
        using var edit = await w.Admin.PostAsJsonAsync($"/api/workflows/definitions/{definitionId}/draft", new { });
        Assert.True(edit.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Conflict, edit.StatusCode.ToString());
        Assert.Equal(1, await w.Factory.WithTenantDbAsync(db => db.TenantWorkflowInstances.CountAsync()));
    }

    [Fact]
    public async Task Listed_person_sees_the_pending_workflow()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);

        var mine = await SalesOrderApiFactory.ReadJsonAsync(await w.As(w.Mehmet, "TenantUser").GetAsync("/api/workflows/instances"));
        var theirs = await SalesOrderApiFactory.ReadJsonAsync(await w.As(w.Ayse, "TenantUser").GetAsync("/api/workflows/instances"));

        Assert.Single(mine.EnumerateArray());
        Assert.Empty(theirs.EnumerateArray());
    }

    [Fact]
    public async Task Document_shows_the_pending_approval_and_who_may_decide()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet, w.Seed.UserId]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);

        var forMehmet = await SalesOrderApiFactory.ReadJsonAsync(await w.As(w.Mehmet, "TenantUser").GetAsync($"/api/sales/orders/{w.OrderId}/document"));
        var forSaver = await SalesOrderApiFactory.ReadJsonAsync(await w.As(w.Seed.UserId, "TenantUser").GetAsync($"/api/sales/orders/{w.OrderId}/document"));

        Assert.True(forMehmet.GetProperty("approval").GetProperty("canDecide").GetBoolean());
        Assert.Equal<IEnumerable<string?>>(["Mehmet Demir"], forMehmet.GetProperty("approval").GetProperty("approvers").EnumerateArray().Select(x => x.GetString()));
        Assert.False(forSaver.GetProperty("approval").GetProperty("canDecide").GetBoolean());
        Assert.Equal<IEnumerable<string?>>(["iptal"], forSaver.GetProperty("allowedTransitions").EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task Legacy_sales_order_workflow_does_not_decide_the_order()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        var legacyId = await w.Factory.WithTenantDbAsync(async db =>
        {
            var legacy = new TenantWorkflowInstance
            {
                TenantId = w.Seed.TenantId, DefinitionId = Guid.NewGuid(), DefinitionCode = "eski-akis", DefinitionName = "Eski", DefinitionVersion = 1,
                StepsJsonSnapshot = "[{\"name\":\"Adım\",\"approverRole\":\"TenantUser\"}]", SubjectType = "SalesOrder", SubjectTitle = "Elle",
                SubjectId = w.OrderId, ContextJson = "{}", StartedByUserId = w.Seed.AdminUserId
            };
            db.TenantWorkflowInstances.Add(legacy);
            await db.SaveChangesAsync();
            return legacy.Id;
        });

        await DecideAsync(w.As(w.Ayse, "TenantUser"), legacyId, "Approved");

        Assert.Equal(SalesOrderStatus.PendingApproval, await StatusAsync(w));
    }

    [Fact]
    public async Task Final_approval_reruns_the_core_checks()
    {
        await using var w = await WorldAsync();
        await DocumentRuleEndpointsTests.PublishAsync(w.Admin, Rule("onay", "approval", people: [w.Mehmet]));
        await ApproveAsync(w.As(w.Seed.UserId, "TenantUser"), w.OrderId);
        var instance = (await InstanceAsync(w))!;
        await w.Factory.WithTenantDbAsync(async db =>
        {
            (await db.CustomerAccounts.SingleAsync(x => x.Id == w.Seed.CustomerId)).IsActive = false;
            await db.SaveChangesAsync();
        });

        using var decided = await DecideAsync(w.As(w.Mehmet, "TenantUser"), instance.Id, "Approved");

        Assert.True(decided.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.BadRequest, decided.StatusCode.ToString());
        Assert.Equal(SalesOrderStatus.PendingApproval, await StatusAsync(w));
        Assert.Equal("Pending", (await InstanceAsync(w))!.Status);
    }
}
