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
/// Duran Varlık system pages (fixed-assets, fixed-asset-create, fixed-asset-card): the duranVarlik.* ERP operations, the new
/// single-asset and summary endpoints, the status filter, the computed members, the schedules' next postable period and the
/// three standards. Dates are relative to today because the schedules and the summary use the server clock.
/// </summary>
public sealed class FixedAssetSystemPagesTests
{
    private static readonly Guid ReadUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid AssetA = Guid.Parse("f0000000-0000-0000-0000-00000000000a");
    private static readonly Guid AssetB = Guid.Parse("f0000000-0000-0000-0000-00000000000b");
    private static readonly Guid AssetC = Guid.Parse("f0000000-0000-0000-0000-00000000000c");
    private static readonly Guid OtherTenantAsset = Guid.Parse("f0000000-0000-0000-0000-00000000000d");
    private static readonly Guid Employee = Guid.Parse("e0000000-0000-0000-0000-000000000001");
    private static readonly Guid OpenAssignment = Guid.Parse("e1000000-0000-0000-0000-000000000001");
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);
    private static readonly DateOnly ThisMonth = new(Today.Year, Today.Month, 1);

    private static readonly string[] Operations =
    [
        "duranVarlik.kiymet.listele", "duranVarlik.kiymet.ozet", "duranVarlik.kiymet.getir", "duranVarlik.kiymet.olustur",
        "duranVarlik.alisFaturalari", "duranVarlik.vukOmurKatalogu", "duranVarlik.edinim.muhasebe", "duranVarlik.edinim.yevmiyele",
        "duranVarlik.amortisman.plani", "duranVarlik.amortisman.kaydet", "duranVarlik.vergiAmortismani.plani",
        "duranVarlik.vergiAmortismani.kaydet", "duranVarlik.eldenCikarma.kaydet", "duranVarlik.zimmet.listele", "duranVarlik.zimmet.iadeAl"
    ];
    private static readonly string[] Reads =
    [
        "duranVarlik.kiymet.listele", "duranVarlik.kiymet.ozet", "duranVarlik.kiymet.getir", "duranVarlik.alisFaturalari",
        "duranVarlik.vukOmurKatalogu", "duranVarlik.edinim.muhasebe", "duranVarlik.amortisman.plani", "duranVarlik.vergiAmortismani.plani",
        "duranVarlik.zimmet.listele"
    ];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_fixed_asset_operation_in_its_module()
    {
        foreach (var name in Operations)
        {
            var op = Op(name);
            Assert.Equal(("Duran Varlık", false, false), (op.Module, op.Deprecated, op.RequiresTenantAdmin));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
            Assert.Equal(Reads.Contains(name) ? "read" : "write", op.Kind);
        }
        Assert.Equal(Operations.Order(StringComparer.Ordinal), ErpOperationCatalog.All.Where(x => x.Name.StartsWith("duranVarlik.", StringComparison.Ordinal))
            .Select(x => x.Name).Order(StringComparer.Ordinal));

        var list = Op("duranVarlik.kiymet.listele");
        Assert.Equal(("GET", "/api/fixed-assets", "list", "items"), (list.Method, list.Route, list.Result.Shape, list.Result.RowsPath));
        Assert.Equal(new[] { "q:text", "status:text", "page:int", "pageSize:int" }, list.Parameters.Select(x => $"{x.Name}:{x.Type}"));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, list.Result.MetaPaths);
        Assert.Equal(new[] { "remainingBookValueBase", "monthlyDepreciationBase", "depreciatedMonths" }, list.Result.Columns.TakeLast(3).Select(x => x.Code));

        var record = Op("duranVarlik.kiymet.getir");
        Assert.Equal(("/api/fixed-assets/{id}", "record"), (record.Route, record.Result.Shape));
        Assert.Equal(new[] { "id:route" }, record.Parameters.Select(x => $"{x.Name}:{x.In}"));
        foreach (var code in new[] { "currentAssignee", "currentAssignmentId", "purchaseInvoiceCode", "hasVukProfile", "vukScheduleAssetId", "isDisposed",
                     "disposalDate", "disposalReason", "disposalProceedsBase", "disposalBookValueBase", "disposalGainLossBase", "disposalJournalEntryId" })
            Assert.Contains(record.Result.Columns, x => x.Code == code);

        var summary = Op("duranVarlik.kiymet.ozet");
        Assert.Equal(("/api/fixed-assets/summary", "record"), (summary.Route, summary.Result.Shape));
        Assert.Equal(new[] { "q" }, summary.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "count", "activeCount", "disposedCount", "acquisitionCostBase", "accumulatedDepreciationBase", "netBookValueBase",
            "currentMonthDepreciationEstimateBase" }, summary.Result.Columns.Select(x => x.Code));

        var create = Op("duranVarlik.kiymet.olustur");
        Assert.Equal(("POST", "/api/fixed-assets", "insert"), (create.Method, create.Route, create.PageKind));
        Assert.DoesNotContain(create.Parameters, x => x.Name == "supplierAccountId");
        Assert.Equal(new[] { "acquisitionDate", "inServiceDate", "acquisitionCostBase", "residualValueBase", "usefulLifeMonths" },
            create.Parameters.Where(x => x.Required).Select(x => x.Name));

        foreach (var name in new[] { "duranVarlik.amortisman.plani", "duranVarlik.vergiAmortismani.plani" })
        {
            var schedule = Op(name);
            Assert.Equal(("list", "rows"), (schedule.Result.Shape, schedule.Result.RowsPath));
            Assert.Equal(new[] { "id:route", "through:query" }, schedule.Parameters.Select(x => $"{x.Name}:{x.In}"));
            Assert.Contains("nextPeriodStart", schedule.Result.MetaPaths);
            Assert.Contains("nextAmountBase", schedule.Result.MetaPaths);
        }
        foreach (var name in new[] { "duranVarlik.amortisman.kaydet", "duranVarlik.vergiAmortismani.kaydet" })
            Assert.Equal(new[] { "id:route", "periodStart:body" }, Op(name).Parameters.Select(x => $"{x.Name}:{x.In}"));
        Assert.Equal(new[] { "id:route", "disposalDate:body", "reason:body", "proceedsBase:body", "idempotencyKey:body" },
            Op("duranVarlik.eldenCikarma.kaydet").Parameters.Select(x => $"{x.Name}:{x.In}"));
        Assert.Equal(new[] { "id:route", "offsetAccountId:body" }, Op("duranVarlik.edinim.yevmiyele").Parameters.Select(x => $"{x.Name}:{x.In}"));
        var acquisition = Op("duranVarlik.edinim.muhasebe");
        Assert.Equal("lines", acquisition.Result.RowsPath);
        Assert.Equal(new[] { "assetId", "purchaseInvoiceCode", "journalEntryId", "entryDate" }, acquisition.Result.MetaPaths);
        var giveBack = Op("duranVarlik.zimmet.iadeAl");
        Assert.Equal(("/api/fixed-assets/{id}/assignments/{assignmentId}/return", "update"), (giveBack.Route, giveBack.PageKind));
        Assert.Equal(new[] { "id:route", "assignmentId:route", "returnedDate:body", "rowVersion:body" }, giveBack.Parameters.Select(x => $"{x.Name}:{x.In}"));
        Assert.Null(Op("duranVarlik.zimmet.listele").Result.RowsPath);
        Assert.Equal("entries", Op("duranVarlik.vukOmurKatalogu").Result.RowsPath);
    }

    [Fact]
    public async Task Allowed_follows_the_fixed_asset_permissions()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, ReadUser);
            platform.TenantPermissionRules.Add(Rule("erp.fixed-assets.read", ReadUser));
        });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ReadUser, "TenantUser");
        var read = await OperationsAsync(client);
        Assert.All(Reads, name => Assert.True(read[name], name));
        Assert.All(Operations.Except(Reads), name => Assert.False(read[name], name));

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        Assert.All((await OperationsAsync(client)).Where(x => x.Key.StartsWith("duranVarlik.", StringComparison.Ordinal)), x => Assert.True(x.Value, x.Key));
    }

    // ---- Endpoints ----

    [Fact]
    public async Task List_filters_by_status_ignores_one_letter_search_and_returns_computed_members()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);

        Assert.Equal(new[] { "DV-A", "DV-B", "DV-C" }, await CodesAsync(client, ""));
        Assert.Equal(new[] { "DV-A", "DV-C" }, await CodesAsync(client, "?status=Active"));
        Assert.Equal(new[] { "DV-B" }, await CodesAsync(client, "?status=disposed"));
        // One letter no longer answers 400: the list is not filtered.
        Assert.Equal(new[] { "DV-A", "DV-B", "DV-C" }, await CodesAsync(client, "?q=D"));
        Assert.Equal(new[] { "DV-A" }, await CodesAsync(client, "?q=torna"));
        Assert.Equal(new[] { "DV-B" }, await CodesAsync(client, "?q=Taşıt&status=Disposed"));
        foreach (var bad in new[] { "?status=1", "?status=Closed", "?q=" + new string('x', 101) })
        {
            using var rejected = await client.GetAsync("/api/fixed-assets" + bad);
            Assert.True(rejected.StatusCode == HttpStatusCode.BadRequest, bad);
        }

        var page = await client.GetFromJsonAsync<JsonElement>("/api/fixed-assets?status=Active");
        Assert.Equal(2, page.GetProperty("totalCount").GetInt32());
        var a = page.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("assetCode").GetString() == "DV-A");
        Assert.Equal((1100m, 100m, 1), (a.GetProperty("remainingBookValueBase").GetDecimal(), a.GetProperty("monthlyDepreciationBase").GetDecimal(),
            a.GetProperty("depreciatedMonths").GetInt32()));
        // Every declared list column is in the response.
        AssertCovers(a, Op("duranVarlik.kiymet.listele").Result.Columns.Select(x => x.Code));
    }

    [Fact]
    public async Task Summary_covers_every_matching_asset_of_the_tenant()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);

        var all = await client.GetFromJsonAsync<JsonElement>("/api/fixed-assets/summary");
        AssertCovers(all, Op("duranVarlik.kiymet.ozet").Result.Columns.Select(x => x.Code));
        Assert.Equal((3, 2, 1), (all.GetProperty("count").GetInt32(), all.GetProperty("activeCount").GetInt32(), all.GetProperty("disposedCount").GetInt32()));
        Assert.Equal((2000m, 100m, 1900m), (all.GetProperty("acquisitionCostBase").GetDecimal(), all.GetProperty("accumulatedDepreciationBase").GetDecimal(),
            all.GetProperty("netBookValueBase").GetDecimal()));
        // Only DV-A: DV-B is disposed and DV-C entered service this month (depreciation starts the month after).
        Assert.Equal(100m, all.GetProperty("currentMonthDepreciationEstimateBase").GetDecimal());

        var searched = await client.GetFromJsonAsync<JsonElement>("/api/fixed-assets/summary?q=Taşıt");
        Assert.Equal((1, 0, 1, 500m, 0m), (searched.GetProperty("count").GetInt32(), searched.GetProperty("activeCount").GetInt32(),
            searched.GetProperty("disposedCount").GetInt32(), searched.GetProperty("acquisitionCostBase").GetDecimal(),
            searched.GetProperty("currentMonthDepreciationEstimateBase").GetDecimal()));

        ErpOperationCatalogTests.SetIdentity(client, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "TenantUser");
        using var forbidden = await client.GetAsync("/api/fixed-assets/summary");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Single_asset_is_tenant_scoped_and_carries_assignee_vuk_and_disposal()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);

        var a = await client.GetFromJsonAsync<JsonElement>($"/api/fixed-assets/{AssetA}");
        AssertCovers(a, Op("duranVarlik.kiymet.getir").Result.Columns.Select(x => x.Code));
        Assert.Equal(("P-014 · Ali Er", OpenAssignment, true, AssetA, false), (a.GetProperty("currentAssignee").GetString(),
            a.GetProperty("currentAssignmentId").GetGuid(), a.GetProperty("hasVukProfile").GetBoolean(), a.GetProperty("vukScheduleAssetId").GetGuid(),
            a.GetProperty("isDisposed").GetBoolean()));
        Assert.Equal((1100m, 100m, 1), (a.GetProperty("remainingBookValueBase").GetDecimal(), a.GetProperty("monthlyDepreciationBase").GetDecimal(),
            a.GetProperty("depreciatedMonths").GetInt32()));
        Assert.Equal(JsonValueKind.Null, a.GetProperty("disposalDate").ValueKind);

        var b = await client.GetFromJsonAsync<JsonElement>($"/api/fixed-assets/{AssetB}");
        Assert.Equal((true, false, JsonValueKind.Null, JsonValueKind.Null), (b.GetProperty("isDisposed").GetBoolean(), b.GetProperty("hasVukProfile").GetBoolean(),
            b.GetProperty("vukScheduleAssetId").ValueKind, b.GetProperty("currentAssignee").ValueKind));
        Assert.Equal((Today.ToString("yyyy-MM-dd"), "Satıldı", 50m, 500m, -450m), (b.GetProperty("disposalDate").GetString(), b.GetProperty("disposalReason").GetString(),
            b.GetProperty("disposalProceedsBase").GetDecimal(), b.GetProperty("disposalBookValueBase").GetDecimal(), b.GetProperty("disposalGainLossBase").GetDecimal()));

        using var foreign = await client.GetAsync($"/api/fixed-assets/{OtherTenantAsset}");
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        using var missing = await client.GetAsync($"/api/fixed-assets/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Schedules_return_the_next_postable_period()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = AdminClient(factory);

        var plan = await client.GetFromJsonAsync<JsonElement>($"/api/fixed-assets/{AssetA}/depreciation-schedule");
        // First period (two months ago) is posted; the next one is last month.
        Assert.Equal(3, plan.GetProperty("rows").GetArrayLength());
        Assert.Equal((ThisMonth.AddMonths(-1).ToString("yyyy-MM-dd"), 100m), (plan.GetProperty("nextPeriodStart").GetString(), plan.GetProperty("nextAmountBase").GetDecimal()));

        var tax = await client.GetFromJsonAsync<JsonElement>($"/api/fixed-assets/{AssetA}/tax-depreciation-schedule");
        Assert.Equal((ThisMonth.AddMonths(-2).ToString("yyyy-MM-dd"), 50m), (tax.GetProperty("nextPeriodStart").GetString(), tax.GetProperty("nextAmountBase").GetDecimal()));

        // Nothing left to post: null, not an error.
        var started = await client.GetFromJsonAsync<JsonElement>($"/api/fixed-assets/{AssetC}/depreciation-schedule");
        Assert.Equal((0, JsonValueKind.Null, JsonValueKind.Null), (started.GetProperty("rows").GetArrayLength(), started.GetProperty("nextPeriodStart").ValueKind,
            started.GetProperty("nextAmountBase").ValueKind));
        // Without a VUK profile the tax schedule stays 409; the card binds it to vukScheduleAssetId, so it never asks.
        using var noProfile = await client.GetAsync($"/api/fixed-assets/{AssetC}/tax-depreciation-schedule");
        Assert.Equal(HttpStatusCode.Conflict, noProfile.StatusCode);
    }

    [Fact]
    public async Task Purchase_invoice_options_carry_a_display_label()
    {
        var option = new FixedAssetPurchaseInvoiceOption(Guid.NewGuid(), "AF-1", Guid.NewGuid(), new DateOnly(2026, 11, 18), 1110000m, Guid.NewGuid());
        Assert.Equal("AF-1 · 18.11.2026 · 1.110.000,00 · yevmiye kayıtlı", option.Label);
        Assert.Equal("AF-1 · 18.11.2026 · 1.110.000,00", (option with { JournalEntryId = null }).Label);
        await Task.CompletedTask;
    }

    // ---- Standards ----

    [Theory]
    [InlineData("fixed-assets", "Duran Varlıklar", 2, "list")]
    [InlineData("fixed-asset-create", "Yeni edinim", 2, "record")]
    [InlineData("fixed-asset-card", "Kıymet kartı", 1, null)]
    public void Standard_is_preview_and_uses_catalog_operations(string key, string title, int version, string? template)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((version, "preview", title, "Duran Varlık"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.Equal(template, (string?)Definition(key)["template"]?["name"]);
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.Contains(key, StandardMenuEndpoints.PageKeys);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.All(operations, name => Assert.True((name.StartsWith("duranVarlik.", StringComparison.Ordinal) || name == "finans.muhasebe.hesap.listele")
            && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
    }

    [Fact]
    public void List_follows_the_screen_view_and_opens_the_card()
    {
        const string key = "fixed-assets";
        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal((key, "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(key, out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key), view.Fields.Keys);
        var list = Props(key, "liste");
        // G-V13: the legacy hidden-by-default columns are left out of the visible set.
        Assert.Equal(new[] { "assetCode", "name", "inServiceDate", "acquisitionCostBase", "remainingBookValueBase", "status" }, Strings(list["columns"]));
        Assert.Equal(("server", 25, "acDugmesi"), ((string)list["paging"]!, (int)list["pageSize"]!, (string)list["rowOpenAction"]!));
        Assert.Equal(new[] { "status:Active=Etkin", "status:Disposed=Elden çıkarıldı" }, Strings(list["valueLabels"]));
        var bar = Props(key, "komutlar");
        Assert.Equal(("@fixed-asset-create", "{{kiymetler.meta.totalCount}}"), ((string)bar["newPageCode"]!, (string)bar["titleCount"]!));
        Assert.Equal(new[] { "assetId={{liste.seciliSatir.id}}" }, Strings(Props(key, "acDugmesi")["params"]));
        Assert.Equal("@fixed-asset-card", (string)Props(key, "acDugmesi")["pageCode"]!);
        // Liste kalıbı: Sil ve "Eski ekranda aç" yok (kıymet silinmez, elden çıkarılır); işlemler kart grubunda ve pencerelerde.
        Assert.DoesNotContain(Definition(key)["components"]!.AsArray().OfType<JsonObject>(), x => (string)x["id"]! is "silDugmesi" or "eskiEkranDugmesi");
        Assert.Equal("@fixed-asset-card", (string)Props(key, "detayAc")["pageCode"]!);
        Assert.Equal(("amortismanPenceresi", "eldenCikarmaPenceresi"), ((string)Props(key, "detayAmortisman")["dialogId"]!, (string)Props(key, "detayEldenCikar")["dialogId"]!));
        Assert.Equal(("{{suzgec.q}}", "{{suzgec.status}}"), (Binding(key, "kiymetler", "q"), Binding(key, "kiymetler", "status")));
        Assert.Equal(("{{suzgec.q}}", null), (Binding(key, "ozet", "q"), Binding(key, "ozet", "status")));
        Assert.Equal("{{liste.seciliSatir.id}}", Binding(key, "kiymet", "id"));
        Assert.True((bool)Props(key, "detayZimmetle")["legacyScreen"]!);
        AssertWrites(key, "{{liste.seciliSatir.id}}");
    }

    [Fact]
    public void Acquisition_form_binds_the_create_body_and_requires_vuk_only_when_on()
    {
        const string key = "fixed-asset-create";
        var create = Op("duranVarlik.kiymet.olustur");
        var bound = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "olustur")["parameters"]!.AsArray()
            .OfType<JsonObject>().Select(x => (string)x["name"]!).ToArray();
        Assert.Equal(create.Parameters.Select(x => x.Name).Order(StringComparer.Ordinal), bound.Order(StringComparer.Ordinal));
        Assert.Equal(("60", "0", "Kalıntı değer"), ((string)Props(key, "omur")["defaultValue"]!, (string)Props(key, "kalinti")["defaultValue"]!,
            (string)Props(key, "kalinti")["label"]!));
        foreach (var input in new[] { "vukKodu", "vukAciklama", "vukTabloYili", "vukTebligNo", "vukOmur", "vukOran", "vukBaslangic", "vukOnay" })
            Assert.Equal("vukAcik.value == true", (string)Props(key, input)["requiredWhen"]!);
        Assert.Equal("vukAcik.value == true", (string)Props(key, "vukKarti")["visibleWhen"]!);
        Assert.Equal("label", (string)Props(key, "fatura")["optionLabelColumn"]!);
        var bar = Props(key, "komutlar");
        Assert.Equal(("olustur", "@fixed-assets"), ((string)bar["saveQuery"]!, (string)bar["afterSavePageCode"]!));
        Assert.False(bar.ContainsKey("saveAndNew"));
    }

    [Fact]
    public void Card_reads_the_page_parameter_and_skips_the_tax_schedule_without_a_profile()
    {
        const string key = "fixed-asset-card";
        Assert.Equal("{{sayfa.parametre.assetId}}", Binding(key, "kiymet", "id"));
        Assert.Equal("{{kiymet.rows[0].vukScheduleAssetId}}", Binding(key, "vergiPlan", "id"));
        Assert.Equal("{{vergiPlan.meta.nextPeriodStart}}", Binding(key, "vergiKaydet", "periodStart"));
        Assert.Equal(new[] { "fixed-asset-depreciation", "fixed-asset-assignments" }, SystemPageStandards.All[key].ScreenViews.Select(x => x.Key));
        Assert.Equal(("{{zimmetTablosu.seciliSatir.id}}", "{{zimmetTablosu.seciliSatir.rowVersion}}", "{{bugun}}"),
            (Binding(key, "iadeAl", "assignmentId"), Binding(key, "iadeAl", "rowVersion"), Binding(key, "iadeAl", "returnedDate")));
        Assert.False(Props(key, "iadeDugmesi").ContainsKey("confirmEnabled"));
        Assert.Equal("{{karsiHesap.value}}", Binding(key, "yevmiyele", "offsetAccountId"));
        foreach (var button in new[] { "vergiKaydiDugmesi", "edinimDugmesi" })
            Assert.Equal((true, "Bu kayıt yevmiyeye yazılır ve arayüzden geri alınamaz."),
                ((bool)Props(key, button)["confirmEnabled"]!, (string)Props(key, button)["confirmText"]!));
        AssertWrites(key, "{{kiymet.rows[0].id}}");
    }

    [Theory]
    [InlineData("fixed-assets", "fixedAssetsOperations.fixture.json")]
    [InlineData("fixed-asset-create", "fixedAssetCreateOperations.fixture.json")]
    [InlineData("fixed-asset-card", "fixedAssetCardOperations.fixture.json")]
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

    /// <summary>The four journal-writing actions confirm with the K5 text; the dialogs' writes bind the open asset and the next period.</summary>
    private static void AssertWrites(string key, string assetBinding)
    {
        Assert.Equal(assetBinding, Binding(key, "amortismanKaydet", "id"));
        Assert.Equal("{{plan.meta.nextPeriodStart}}", Binding(key, "amortismanKaydet", "periodStart"));
        Assert.Equal(assetBinding, Binding(key, "eldenCikar", "id"));
        Assert.Equal("{{cikarmaAnahtari.value}}", Binding(key, "eldenCikar", "idempotencyKey"));
        Assert.True((bool)Props(key, "cikarmaAnahtari")["autoId"]!);
        Assert.True((bool)Props(key, "eldenCikarmaPenceresi")["resetOnOpen"]!);
        Assert.Equal(("{{bugun}}", "0"), ((string)Props(key, "cikarmaTarihi")["defaultValue"]!, (string)Props(key, "cikarmaTahsilati")["defaultValue"]!));
        Assert.Equal((true, "Bu kayıt yevmiyeye yazılır ve arayüzden geri alınamaz."),
            ((bool)Props(key, "amortismanKaydetDugmesi")["confirmEnabled"]!, (string)Props(key, "amortismanKaydetDugmesi")["confirmText"]!));
        Assert.Equal((true, "Kıymet kalıcı olarak elden çıkarılır. Yevmiye fişi yazılır; arayüzden geri alınamaz."),
            ((bool)Props(key, "cikarmaKaydet")["confirmEnabled"]!, (string)Props(key, "cikarmaKaydet")["confirmText"]!));
    }

    private static async Task<ErpOperationCatalogTests.ErpOperationApiFactory> SeededFactoryAsync()
    {
        var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenant = ErpOperationCatalogTests.TenantA;
        var inService = ThisMonth.AddMonths(-3).AddDays(9);
        db.FixedAssets.AddRange(
            new FixedAsset
            {
                Id = AssetA, TenantId = tenant, AssetCode = "DV-A", Name = "CNC torna", Category = "Makine", AcquisitionDate = inService,
                InServiceDate = inService, AcquisitionCostBase = 1200m, ResidualValueBase = 0m, UsefulLifeMonths = 12, AccumulatedDepreciationBase = 100m,
                VukUsefulLifeCode = "1.1.1", VukUsefulLifeDescription = "Makine", VukUsefulLifeTableYear = 2026, VukUsefulLifeCommuniqueNumber = 333,
                VukUsefulLifeMonths = 12, VukNormalDepreciationRatePercent = 50m, VukTaxDepreciationStartDate = inService
            },
            new FixedAsset
            {
                Id = AssetB, TenantId = tenant, AssetCode = "DV-B", Name = "Eski araç", Category = "Taşıt", AcquisitionDate = inService,
                InServiceDate = inService, AcquisitionCostBase = 500m, UsefulLifeMonths = 60, Status = FixedAssetStatus.Disposed
            },
            new FixedAsset
            {
                Id = AssetC, TenantId = tenant, AssetCode = "DV-C", Name = "Dizüstü", Category = "Demirbaş", AcquisitionDate = Today,
                InServiceDate = Today, AcquisitionCostBase = 300m, UsefulLifeMonths = 10
            },
            new FixedAsset
            {
                Id = OtherTenantAsset, TenantId = ErpOperationCatalogTests.TenantB, AssetCode = "DV-X", Name = "Başka firma", AcquisitionDate = inService,
                InServiceDate = inService, AcquisitionCostBase = 9999m, UsefulLifeMonths = 12
            });
        db.FixedAssetDepreciationPostings.Add(new FixedAssetDepreciationPosting
        {
            TenantId = tenant, AssetId = AssetA, PeriodStart = ThisMonth.AddMonths(-2), PeriodEnd = ThisMonth.AddMonths(-1).AddDays(-1), AmountBase = 100m,
            JournalEntryId = Guid.NewGuid()
        });
        db.EmployeeRecords.Add(new EmployeeRecord { Id = Employee, TenantId = tenant, PersonnelCode = "P-014", FullName = "Ali Er", HireDate = inService });
        db.FixedAssetAssignments.AddRange(
            new FixedAssetAssignment { Id = OpenAssignment, TenantId = tenant, AssetId = AssetA, EmployeeId = Employee, AssignedDate = inService },
            new FixedAssetAssignment { TenantId = tenant, AssetId = AssetA, EmployeeId = Employee, AssignedDate = inService.AddDays(-30), ReturnedDate = inService.AddDays(-1) });
        db.FixedAssetDisposals.Add(new FixedAssetDisposal
        {
            TenantId = tenant, AssetId = AssetB, DisposalDate = Today, Reason = "Satıldı", ProceedsBase = 50m, BookValueBase = 500m, GainLossBase = -450m,
            IdempotencyKey = Guid.NewGuid()
        });
        await db.SaveChangesAsync();
        return factory;
    }

    private static HttpClient AdminClient(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        return client;
    }

    private static async Task<string[]> CodesAsync(HttpClient client, string query)
    {
        using var response = await client.GetAsync("/api/fixed-assets" + query);
        Assert.True(response.StatusCode == HttpStatusCode.OK, query + ": " + await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("assetCode").GetString()!).ToArray();
    }

    /// <summary>The declared columns are not reflected from one record any more, so the response must carry each of them.</summary>
    private static void AssertCovers(JsonElement element, IEnumerable<string> codes)
    {
        foreach (var code in codes) Assert.True(element.TryGetProperty(code, out _), $"Yanıtta '{code}' yok.");
    }

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

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
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "DV user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", id));
    }

    private static TenantPermissionRule Rule(string code, Guid user) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true
    };

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Flatten(Definition(key)["components"]!.AsArray().OfType<JsonObject>()).Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    /// <summary>Top-level components and the children of Liste's kart grubu.</summary>
    private static IEnumerable<JsonObject> Flatten(IEnumerable<JsonObject> components) =>
        components.SelectMany(x => new[] { x }.Concat(x["children"] is JsonArray kids ? Flatten(kids.OfType<JsonObject>()) : []));

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
