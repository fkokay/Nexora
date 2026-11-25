using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// CRM Fırsatları system pages (crm-opportunities, crm-opportunity-create): the crm.firsat.* ERP operations, the summary
/// endpoint, the list's totalCount, the comma-separated cari type filter the customer picker uses, the datetime parameter
/// and input type, and the two standards.
/// </summary>
public sealed class CrmSystemPagesTests
{
    private static readonly Guid ReadUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid UpdateUser = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid Customer = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid Supplier = Guid.Parse("a0000000-0000-0000-0000-000000000002");
    private static readonly Guid Both = Guid.Parse("a0000000-0000-0000-0000-000000000003");
    private static readonly Guid Dealer = Guid.Parse("a0000000-0000-0000-0000-000000000004");

    private static readonly string[] Operations =
    [
        "crm.firsat.listele", "crm.firsat.getir", "crm.firsat.ozet", "crm.firsat.olustur", "crm.firsat.guncelle", "crm.firsat.nitelikliYap",
        "crm.firsat.teklifeGecir", "crm.firsat.muzakereyeGecir", "crm.firsat.kazanildi", "crm.firsat.kaybedildi", "crm.firsat.sil"
    ];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_crm_operation_in_the_crm_module()
    {
        foreach (var name in Operations)
        {
            var op = Op(name);
            Assert.Equal(("CRM", false, false), (op.Module, op.Deprecated, op.RequiresTenantAdmin));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
        }
        Assert.Equal(Operations.Order(StringComparer.Ordinal), ErpOperationCatalog.All.Where(x => x.Name.StartsWith("crm.", StringComparison.Ordinal))
            .Select(x => x.Name).Order(StringComparer.Ordinal));

        var list = Op("crm.firsat.listele");
        Assert.Equal(("GET", "/api/crm/opportunities", "list", "items"), (list.Method, list.Route, list.Result.Shape, list.Result.RowsPath));
        Assert.Equal(new[] { "q:text", "stage:text", "closeFrom:date", "closeTo:date", "valueFrom:decimal", "valueTo:decimal", "page:int", "pageSize:int" },
            list.Parameters.Select(x => $"{x.Name}:{x.Type}"));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, list.Result.MetaPaths);
        Assert.Equal(new[] { "id", "code", "name", "customerId", "customerName", "stage", "estimatedValue", "currencyCode", "probabilityPercent",
            "expectedCloseDate", "nextActivityAt", "notes", "createdAt", "updatedAt", "rowVersion" }, list.Result.Columns.Select(x => x.Code));

        var summary = Op("crm.firsat.ozet");
        Assert.Equal(("GET", "/api/crm/opportunities/summary", "record"), (summary.Method, summary.Route, summary.Result.Shape));
        Assert.Equal(new[] { "q" }, summary.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "totalCount", "prospectingCount", "qualifiedCount", "proposalCount", "negotiationCount", "wonCount", "lostCount",
            "openCount", "overdueCount", "openValueAmount", "openValueCurrencyCode", "otherCurrencyCount" }, summary.Result.Columns.Select(x => x.Code));
        Assert.Equal("Fırsat", summary.Result.Columns[0].Label);

        var create = Op("crm.firsat.olustur");
        Assert.Equal(("POST", "/api/crm/opportunities", "insert", null), (create.Method, create.Route, create.PageKind, create.SourceOperation));
        Assert.Equal(new[] { "code", "name", "customerId", "estimatedValue", "currencyCode", "probabilityPercent", "expectedCloseDate", "nextActivityAt", "notes" },
            create.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "probabilityPercent" }, create.Parameters.Where(x => x.Required).Select(x => x.Name));
        var update = Op("crm.firsat.guncelle");
        Assert.Equal(("PUT", "/api/crm/opportunities/{id}", "update", "crm.firsat.getir"), (update.Method, update.Route, update.PageKind, update.SourceOperation));
        Assert.DoesNotContain(update.Parameters, x => x.Required && x.In == "body");
        // Date and time with offset on writes only; the reflected DateTimeOffset type stays "date" everywhere else.
        foreach (var op in new[] { create, update })
            Assert.Equal("datetime", op.Parameters.Single(x => x.Name == "nextActivityAt").Type);
        Assert.Equal("date", list.Result.Columns.Single(x => x.Code == "nextActivityAt").DataType);
        // Satış Aşama B: the standalone invoice's e-archive payment date and due date (DateTimeOffset) are datetime too.
        Assert.DoesNotContain(ErpOperationCatalog.All.Where(x => !x.Name.StartsWith("crm.firsat.", StringComparison.Ordinal)).SelectMany(x => x.Parameters
                .Where(p => !(x.Name == "satis.fatura.olustur" && p.Name is "eDocument.paymentDate" or "eDocument.paymentDueDate"))),
            x => x.Type == "datetime");

        foreach (var (name, stage) in new[] { ("crm.firsat.nitelikliYap", "Qualified"), ("crm.firsat.teklifeGecir", "Proposal"),
                     ("crm.firsat.muzakereyeGecir", "Negotiation"), ("crm.firsat.kazanildi", "Won"), ("crm.firsat.kaybedildi", "Lost") })
        {
            var op = Op(name);
            Assert.Equal(("POST", "/api/crm/opportunities/{id}/stage", "update", null), (op.Method, op.Route, op.PageKind, op.SourceOperation));
            Assert.Equal(new[] { "id:route" }, op.Parameters.Select(x => $"{x.Name}:{x.In}"));
            Assert.Equal(new Dictionary<string, object?> { ["stage"] = stage }, op.FixedBody);
        }
        var delete = Op("crm.firsat.sil");
        Assert.Equal(("DELETE", "/api/crm/opportunities/{id}", "delete", "none"), (delete.Method, delete.Route, delete.PageKind, delete.Result.Shape));
    }

    [Fact]
    public async Task Allowed_follows_the_crm_permissions_per_action()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, ReadUser);
            AddUser(platform, UpdateUser);
            platform.TenantPermissionRules.Add(Rule("erp.crm-opportunities.read", ReadUser));
            platform.TenantPermissionRules.Add(Rule("erp.crm-opportunities.read", UpdateUser));
            platform.TenantPermissionRules.Add(Rule("erp.crm-opportunities.update", UpdateUser));
        });
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, ReadUser, "TenantUser");
        var read = await OperationsAsync(client);
        Assert.True(read["crm.firsat.listele"] && read["crm.firsat.getir"] && read["crm.firsat.ozet"]);
        Assert.All(Operations.Skip(3), name => Assert.False(read[name], name));

        // Stage changes are "execute" (…/stage), not "update": an update-only user may edit but not move the stage (decision 9).
        ErpOperationCatalogTests.SetIdentity(client, UpdateUser, "TenantUser");
        var updater = await OperationsAsync(client);
        Assert.True(updater["crm.firsat.guncelle"]);
        Assert.False(updater["crm.firsat.olustur"]);
        Assert.False(updater["crm.firsat.sil"]);
        foreach (var name in new[] { "crm.firsat.nitelikliYap", "crm.firsat.teklifeGecir", "crm.firsat.muzakereyeGecir", "crm.firsat.kazanildi", "crm.firsat.kaybedildi" })
            Assert.False(updater[name], name);

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        Assert.All((await OperationsAsync(client)).Where(x => x.Key.StartsWith("crm.", StringComparison.Ordinal)), x => Assert.True(x.Value, x.Key));
    }

    // ---- Endpoints ----

    [Fact]
    public async Task Summary_counts_every_matching_record_with_the_server_clock_and_the_main_currency()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, ReadUser);
            platform.TenantPermissionRules.Add(Rule("erp.crm-opportunities.read", ReadUser));
        });
        await SeedCustomersAsync(factory);
        var past = DateTimeOffset.UtcNow.AddHours(-2);
        var future = DateTimeOffset.UtcNow.AddDays(2);
        await SeedOpportunitiesAsync(factory,
            Opportunity("FRS-1", "ERP yenileme", CrmOpportunityStage.Prospecting, 100m, "TRY", past, Customer),
            Opportunity("FRS-2", "Depo otomasyonu", CrmOpportunityStage.Qualified, 250m, "TRY", future),
            Opportunity("FRS-3", "Bakım", CrmOpportunityStage.Proposal, 40m, "EUR", past),
            Opportunity("FRS-4", "Mobil", CrmOpportunityStage.Negotiation, null, "USD", past),
            // Closed ones count by stage but never as open, valued or overdue.
            Opportunity("FRS-5", "Kazanılan", CrmOpportunityStage.Won, 999m, "EUR", past, Customer),
            Opportunity("FRS-6", "Kaybedilen", CrmOpportunityStage.Lost, 999m, "EUR", past),
            Opportunity("FRS-7", "Başka firma", CrmOpportunityStage.Prospecting, 5m, "TRY", past, tenantId: ErpOperationCatalogTests.TenantB));
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ReadUser, "TenantUser");

        var all = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities/summary");
        Assert.Equal((6, 1, 1, 1, 1, 1, 1), (Int(all, "totalCount"), Int(all, "prospectingCount"), Int(all, "qualifiedCount"), Int(all, "proposalCount"),
            Int(all, "negotiationCount"), Int(all, "wonCount"), Int(all, "lostCount")));
        Assert.Equal((4, 3), (Int(all, "openCount"), Int(all, "overdueCount")));
        // Open valued: TRY ×2 (350), EUR ×1; FRS-4 has no value, so USD does not count as another currency.
        Assert.Equal((350m, "TRY", 1), (all.GetProperty("openValueAmount").GetDecimal(), all.GetProperty("openValueCurrencyCode").GetString(),
            Int(all, "otherCurrencyCount")));

        // Same q as the list: code, name or customer name.
        var searched = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities/summary?q=Örnek");
        Assert.Equal((2, 1, 1, 1), (Int(searched, "totalCount"), Int(searched, "openCount"), Int(searched, "wonCount"), Int(searched, "overdueCount")));
        var list = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities?q=Örnek");
        Assert.Equal(2, Int(list, "totalCount"));

        var none = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities/summary?q=yok-boyle-bir-sey");
        Assert.Equal((0, 0), (Int(none, "totalCount"), Int(none, "otherCurrencyCount")));
        Assert.Equal((JsonValueKind.Null, JsonValueKind.Null), (none.GetProperty("openValueAmount").ValueKind, none.GetProperty("openValueCurrencyCode").ValueKind));

        // Without a read rule the summary is forbidden like the list.
        ErpOperationCatalogTests.SetIdentity(client, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "TenantUser");
        using var forbidden = await client.GetAsync("/api/crm/opportunities/summary");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Summary_currency_tie_is_alphabetical()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedOpportunitiesAsync(factory,
            Opportunity("FRS-1", "A", CrmOpportunityStage.Prospecting, 10m, "USD", null),
            Opportunity("FRS-2", "B", CrmOpportunityStage.Prospecting, 20m, "EUR", null),
            Opportunity("FRS-3", "C", CrmOpportunityStage.Prospecting, 30m, "TRY", null));
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var summary = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities/summary");
        Assert.Equal((20m, "EUR", 2, 0), (summary.GetProperty("openValueAmount").GetDecimal(), summary.GetProperty("openValueCurrencyCode").GetString(),
            Int(summary, "otherCurrencyCount"), Int(summary, "overdueCount")));
    }

    [Fact]
    public async Task List_returns_total_count_with_total_and_keeps_the_time_of_next_activity()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedCustomersAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        foreach (var code in new[] { "FRS-1", "FRS-2", "FRS-3" })
        {
            using var created = await client.PostAsJsonAsync("/api/crm/opportunities", new
            {
                code, name = "Fırsat " + code, customerId = Customer, currencyCode = "TRY", probabilityPercent = 10,
                nextActivityAt = "2026-11-24T07:00:00.000Z"
            });
            Assert.True(created.StatusCode == HttpStatusCode.Created, await created.Content.ReadAsStringAsync());
        }
        var page = await client.GetFromJsonAsync<JsonElement>("/api/crm/opportunities?pageSize=2");
        Assert.Equal((3, 3, 2), (Int(page, "total"), Int(page, "totalCount"), page.GetProperty("items").GetArrayLength()));
        var next = page.GetProperty("items")[0].GetProperty("nextActivityAt").GetDateTimeOffset();
        Assert.Equal(new DateTimeOffset(2026, 11, 24, 7, 0, 0, TimeSpan.Zero), next);
    }

    [Fact]
    public async Task Customer_list_type_accepts_a_comma_separated_list()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedCustomersAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        async Task<string[]> Codes(string query) =>
            (await client.GetFromJsonAsync<JsonElement>("/api/customers?pageSize=100" + query)).GetProperty("items").EnumerateArray()
                .Select(x => x.GetProperty("code").GetString()!).Order(StringComparer.Ordinal).ToArray();

        Assert.Equal(new[] { "C-1", "C-3" }, await Codes("&type=Customer,Both"));
        Assert.Equal(new[] { "C-1", "C-3" }, await Codes("&type=customer%2C%20both"));
        Assert.Equal(new[] { "C-1" }, await Codes("&type=Customer"));
        Assert.Equal(new[] { "C-1" }, await Codes("&type=Customer,Unknown"));
        // Not parsed as a whole: "Customer,Both" must not become (1|3) = Both only, nor "Supplier,Customer" (2|1) = Both.
        Assert.Equal(new[] { "C-1", "C-2" }, await Codes("&type=Supplier,Customer"));
        Assert.Equal(new[] { "C-1", "C-2", "C-3", "C-4" }, await Codes("&type=Unknown"));
        Assert.Equal(new[] { "C-1", "C-3" }, await Codes("&type=Customer,Both&status=Active"));
        Assert.Equal(new[] { CounterpartyType.Customer, CounterpartyType.Both }, CounterpartyTypeFilter.Parse(" Customer , Both ,Customer"));
        Assert.Empty(CounterpartyTypeFilter.Parse("99,,"));
    }

    // ---- Schema: datetime ----

    [Fact]
    public void Schema_accepts_datetime_input_format_and_operation_parameter_only()
    {
        Assert.True(TenantCustomPageSchema.Validate(Page("""{ "id": "t", "type": "input", "name": "t", "props": { "inputType": "datetime", "label": "Takip" } }"""),
            out var error), error);
        Assert.True(TenantCustomPageSchema.Validate(Page("""{ "id": "l", "type": "dataTable", "name": "l", "props": { "query": "q", "columnFormats": ["nextActivityAt=datetime"] } }""",
            """{ "id": "q", "name": "q", "kind": "read", "operation": "crm.firsat.listele", "runOn": "load", "parameters": [] }"""), out error), error);
        // An ERP operation parameter declared datetime binds as datetime; a date one does not.
        var operationQuery = """{ "id": "w", "name": "w", "kind": "insert", "operation": "crm.firsat.olustur", "runOn": "manual", "parameters": [ """
            + """{ "name": "probabilityPercent", "binding": "{{t.value}}", "type": "int" }, { "name": "nextActivityAt", "binding": "{{t.value}}", "type": "TYPE" } ] }""";
        var input = """{ "id": "t", "type": "input", "name": "t", "props": { "inputType": "datetime", "label": "Takip" } }""";
        Assert.True(TenantCustomPageSchema.Validate(Page(input, operationQuery.Replace("TYPE", "datetime")), out error), error);
        Assert.False(TenantCustomPageSchema.Validate(Page(input, operationQuery.Replace("TYPE", "date")), out _));
        Assert.False(TenantCustomPageSchema.Validate(Page(input,
            """{ "id": "w", "name": "w", "kind": "read", "operation": "crm.firsat.listele", "runOn": "load", "parameters": [ { "name": "closeFrom", "binding": "{{t.value}}", "type": "datetime" } ] }"""), out _));
        // SQL queries have no datetime parameter.
        Assert.False(TenantCustomPageSchema.Validate(Page(input,
            """{ "id": "s", "name": "s", "kind": "read", "sql": "SELECT 1 AS x WHERE @t IS NOT NULL", "runOn": "load", "parameters": [ { "name": "t", "binding": "{{t.value}}", "type": "datetime" } ] }"""), out error));
        Assert.Contains("türü", error);
        Assert.False(TenantCustomPageSchema.Validate(Page("""{ "id": "l", "type": "dataTable", "name": "l", "props": { "columnFormats": ["x=datetimes"] } }"""), out _));
        Assert.False(TenantCustomPageSchema.Validate(Page("""{ "id": "t", "type": "input", "name": "t", "props": { "inputType": "time", "label": "Saat" } }"""), out _));
    }

    // ---- Standards ----

    [Theory]
    [InlineData("crm-opportunities", "CRM Fırsatları")]
    [InlineData("crm-opportunity-create", "Fırsat kartı")]
    public void Standard_is_preview_version_1_and_uses_catalog_operations(string key, string title)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((1, "preview", title, "Satış & cari"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.All(operations, name => Assert.True((name.StartsWith("crm.firsat.", StringComparison.Ordinal) || name == "cari.listele")
            && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
    }

    [Fact]
    public void Opportunities_list_follows_the_screen_view_and_reads_the_summary()
    {
        var standard = SystemPageStandards.All["crm-opportunities"];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal(("crm-opportunities", "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("crm-opportunities", out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key), view.Fields.Keys);
        var props = Props("crm-opportunities", "liste");
        Assert.Equal(fields.Where(x => x.DefaultVisible && x.Key != "actions").Select(x => view.Fields[x.Key]), Strings(props["columns"]));
        Assert.Equal(("server", 50), ((string)props["paging"]!, (int)props["pageSize"]!));
        Assert.Contains("nextActivityAt=datetime", Strings(props["columnFormats"]));
        Assert.Equal("{{firsatlar.meta.totalCount}}", (string)Props("crm-opportunities", "komutlar")["titleCount"]!);
        Assert.Equal(("sil", "acDugmesi"), ((string)Props("crm-opportunities", "komutlar")["deleteQuery"]!, (string)Props("crm-opportunities", "komutlar")["openButton"]!));
        Assert.Equal("Kapanmış fırsat düzenlenemez", (string)Props("crm-opportunities", "acDugmesi")["disabledReason"]!);
        Assert.Equal("{{ozet.rows[0].overdueCount}}", (string)Props("crm-opportunities", "takipGostergesi")["value"]!);
        Assert.Equal("{{suzgec.q}}", Binding("crm-opportunities", "ozet", "q"));
        Assert.Equal("{{suzgec.q}}", Binding("crm-opportunities", "firsatlar", "q"));
        // Aşama, Süzgeç alanındaki seçim süzgecidir (filterBar `stage`).
        Assert.Equal("{{suzgec.stage}}", Binding("crm-opportunities", "firsatlar", "stage"));
        Assert.Contains("stage|select|row|stage|Aşama", Strings(Props("crm-opportunities", "suzgec")["filters"]));
        foreach (var button in new[] { "nitelikliDugmesi", "teklifDugmesi", "muzakereDugmesi", "kazanildiDugmesi", "kaybedildiDugmesi" })
            Assert.Equal(new[] { "firsatlar", "ozet" }, Strings(Props("crm-opportunities", button)["refreshQueries"]));
        Assert.True((bool)Props("crm-opportunities", "kaybedildiDugmesi")["confirmEnabled"]!);
    }

    [Fact]
    public void Opportunity_card_is_one_standard_for_new_and_edit()
    {
        const string key = "crm-opportunity-create";
        Assert.Equal("{{sayfa.parametre.opportunityId}}", Binding(key, "kart", "id"));
        // The picker reads only active Müşteri / Müşteri & Tedarikçi cari cards; bindings are paths, so the literals sit in hidden inputs.
        Assert.Equal("{{musteriTuru.value}}", Binding(key, "musteriler", "type"));
        Assert.Equal(("Customer,Both", true), ((string)Props(key, "musteriTuru")["defaultValue"]!, (bool)Props(key, "musteriTuru")["hidden"]!));
        Assert.Equal(("Active", true), ((string)Props(key, "musteriDurumu")["defaultValue"]!, (bool)Props(key, "musteriDurumu")["hidden"]!));
        Assert.Equal("datetime", (string)Props(key, "takip")["inputType"]!);
        foreach (var query in new[] { "olustur", "guncelle" })
        {
            var parameter = Parameter(Definition(key), query, "nextActivityAt");
            Assert.Equal(("{{takip.value}}", "datetime"), ((string)parameter["binding"]!, (string)parameter["type"]!));
        }
        Assert.Equal(("{{dovizYeni.value}}", "{{doviz.value}}"), (Binding(key, "olustur", "currencyCode"), Binding(key, "guncelle", "currencyCode")));
        Assert.Equal(("{{olasilikYeni.value}}", "{{olasilik.value}}"), (Binding(key, "olustur", "probabilityPercent"), Binding(key, "guncelle", "probabilityPercent")));
        Assert.Equal(("TRY", "10"), ((string)Props(key, "dovizYeni")["defaultValue"]!, (string)Props(key, "olasilikYeni")["defaultValue"]!));
        // Olasılık kısayolları alanın kendi hazır değerleridir (presets); not çok satırlı, kod yeni kartta boş bırakılabilir.
        foreach (var input in new[] { "olasilikYeni", "olasilik" })
            Assert.Equal(new[] { "10=%10", "25=%25", "50=%50", "75=%75", "90=%90" }, Strings(Props(key, input)["presets"]));
        Assert.True((bool)Props(key, "not")["multiline"]!);
        Assert.Equal("kart.rows[0].id != null", (string)Props(key, "kod")["requiredWhen"]!);
        var bar = Props(key, "komutlar");
        Assert.Equal(("@crm-opportunities", true, true), ((string)bar["afterSavePageCode"]!, (bool)bar["afterSaveRefresh"]!, (bool)bar["saveAndNew"]!));
        Assert.Contains("save=kart.rows[0].stage != 'Won' && kart.rows[0].stage != 'Lost'", Strings(bar["commandWhen"]));
    }

    [Theory]
    [InlineData("crm-opportunities", "crmOpportunitiesOperations.fixture.json")]
    [InlineData("crm-opportunity-create", "crmOpportunityCreateOperations.fixture.json")]
    public async Task Frontend_fixture_matches_catalog(string key, string fixtureFile)
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => JsonNode.Parse(x.GetRawText())!);
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend", "erp-web", "src", "system-pages", fixtureFile)))!["operations"]!.AsArray();
        var used = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        Assert.Equal(used, fixture.Select(x => (string)x!["name"]!).Order(StringComparer.Ordinal));
        foreach (var operation in fixture)
            Assert.True(JsonNode.DeepEquals(live[(string)operation!["name"]!], operation), (string)operation["name"]!);
    }

    // ---- Helpers ----

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static int Int(JsonElement element, string name) => element.GetProperty(name).GetInt32();

    private static string Page(string component, string? query = null) =>
        $$"""{ "schemaVersion": 2, "components": [ {{component}} ], "queries": [ {{query ?? ""}} ] }""";

    private static async Task<Dictionary<string, bool>> OperationsAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("operations").EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.GetProperty("allowed").GetBoolean());
    }

    private static void AddUser(PlatformDbContext platform, Guid id)
    {
        var tenant = platform.Tenants.Local.Single(x => x.Id == ErpOperationCatalogTests.TenantA);
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "CRM user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", id));
    }

    private static TenantPermissionRule Rule(string code, Guid user) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true
    };

    private static CrmOpportunity Opportunity(string code, string name, CrmOpportunityStage stage, decimal? value, string currency,
        DateTimeOffset? nextActivityAt, Guid? customerId = null, Guid? tenantId = null) => new()
    {
        TenantId = tenantId ?? ErpOperationCatalogTests.TenantA, Code = code, Name = name, Stage = stage, EstimatedValue = value, CurrencyCode = currency,
        NextActivityAt = nextActivityAt, CustomerId = customerId
    };

    private static async Task SeedOpportunitiesAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory, params CrmOpportunity[] opportunities)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        db.CrmOpportunities.AddRange(opportunities);
        await db.SaveChangesAsync();
    }

    private static async Task SeedCustomersAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenantA = ErpOperationCatalogTests.TenantA;
        CustomerAccount Account(Guid id, string code, string name, CounterpartyType type) =>
            new() { Id = id, TenantId = tenantA, Code = code, Name = name, Type = type, CurrencyCode = "TRY", IsActive = true };
        db.CustomerAccounts.AddRange(Account(Customer, "C-1", "Örnek Gıda", CounterpartyType.Customer),
            Account(Supplier, "C-2", "Tedarik A.Ş.", CounterpartyType.Supplier), Account(Both, "C-3", "İkili Ticaret", CounterpartyType.Both),
            Account(Dealer, "C-4", "Bayi Ltd.", CounterpartyType.Dealer));
        await db.SaveChangesAsync();
    }

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject Parameter(JsonObject definition, string queryId, string name) =>
        definition["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().Single(x => (string)x["name"]! == name);

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
