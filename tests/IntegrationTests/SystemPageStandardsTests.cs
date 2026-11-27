using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

public sealed class SystemPageStandardsTests
{
    private const string Key = "inventory-warehouses";

    [Fact]
    public void Embedded_standards_are_valid()
    {
        Assert.Empty(SystemPageStandards.Validate(SystemPageStandards.EmbeddedFiles()));
        var standard = SystemPageStandards.All[Key];
        // Version 2 completes Depo Yönetimi; the version 1 items keep their ids and since.
        Assert.Equal(2, standard.Version);
        Assert.Equal("preview", standard.Stage);
        Assert.Equal("Depo Yönetimi", standard.Title);
        Assert.Equal("Stok & Depo", standard.Module);
        Assert.Contains(standard.Items, x => x.Key == "component:depoListesi" && x.Kind == "component" && x.Id == "depoListesi"
            && x.Since == 1 && x.Requires.SequenceEqual(new[] { "query:depolar" }));
        Assert.Contains(standard.Items, x => x.Key == "query:depolar" && x.Kind == "query" && x.Id == "depolar" && x.Since == 1);
        Assert.All(standard.Items.Where(x => x.Key is not ("component:depoListesi" or "query:depolar")), x => Assert.Equal(2, x.Since));
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal("depoListesi", view.Component);
        Assert.Equal("isActive", view.Fields["status"]);
        Assert.True(SystemPageStandards.TryGet(Key, out var same));
        Assert.Same(standard, same);
        Assert.False(SystemPageStandards.TryGet("no-such-screen", out _));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        var locations = SystemPageStandards.All["inventory-locations"];
        Assert.Equal((1, "preview", "Raf ve Konumlar"), (locations.Version, locations.Stage, locations.Title));
        Assert.Equal(["inventory-warehouse-locations", "warehouse-location-balances", "inventory-warehouse-reconciliation"],
            locations.ScreenViews.Select(x => x.Key));
        Assert.Equal(new[] { "crm-opportunities", "crm-opportunity-create", "customer-create", "customer-ledger", "customers", "finance-account-create", "finance-accounts", "finance-banks",
            "finance-journal-ledger", "finance-journal-vouchers", "finance-ledger-chart", "finance-trial-balance", "fixed-asset-card", "fixed-asset-create", "fixed-assets", "foreign-trade", "foreign-trade-case", "hr-attendance", "hr-employee-create", "hr-employees", "hr-leave-requests", "hr-period-summary", "inventory-cost", "inventory-locations", "inventory-stock", "inventory-stock-create", "inventory-stock-movements", "inventory-tracking", "inventory-transfers", Key, "manufacturing-cost-variance", "manufacturing-order-create", "manufacturing-orders", "manufacturing-recipes",
            "sales-deliveries", "sales-invoice-create", "sales-invoices", "sales-order-create", "sales-order-document", "sales-orders", "sales-purchase-delivery-notes", "sales-purchase-invoice-drafts", "sales-purchase-invoice-entry", "sales-purchase-invoices", "sales-purchase-order-create", "sales-purchase-quotes", "sales-purchase-receipts", "sales-purchase-returns", "sales-purchasing", "sales-quote-document", "sales-quotes", "sales-requests" }, SystemPageStandards.All.Keys.OrderBy(x => x, StringComparer.Ordinal));
        foreach (var each in SystemPageStandards.All.Values)
            Assert.True(TenantCustomPageSchema.Validate(each.DefinitionJson, out var eachError), $"{each.ScreenKey}: {eachError}");
    }

    [Fact]
    public void Embedded_set_wraps_static_standards()
    {
        ISystemPageStandardSet set = new EmbeddedSystemPageStandardSet();
        Assert.True(set.TryGet(Key, out var standard));
        Assert.Same(SystemPageStandards.All[Key], standard);
        Assert.Equal(SystemPageStandards.All.Count, set.All.Count);
    }

    [Fact]
    public void Versions_file_matches()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "SystemPageStandards.versions.txt");
        var lines = File.ReadAllLines(path).Select(x => x.Trim()).Where(x => x.Length > 0).ToArray();
        // Sorted by screen key ("inventory-stock" before "inventory-stock-create").
        Assert.Equal(lines.OrderBy(x => x.Split('=')[0], StringComparer.Ordinal), lines);
        foreach (var line in lines)
        {
            var parts = line.Split('=');
            Assert.True(SystemPageStandards.TryGet(parts[0], out var standard), $"Standart kaldırılamaz: {parts[0]}");
            Assert.True(standard.Version >= int.Parse(parts[1]), $"Standart sürümü düşemez: {parts[0]}");
        }
        // Every current standard is recorded, so the next change has a floor to compare against.
        Assert.Equal(SystemPageStandards.All.Keys.OrderBy(x => x, StringComparer.Ordinal), lines.Select(x => x.Split('=')[0]));
    }

    [Fact]
    public void Every_restricted_version_validates()
    {
        foreach (var standard in SystemPageStandards.All.Values)
            for (var k = 1; k <= standard.Version; k++)
                Assert.True(TenantCustomPageSchema.Validate(SystemPageStandards.Restrict(standard, k), out var error), $"{standard.ScreenKey} v{k}: {error}");
    }

    /// <summary>
    /// "Yeni" offers each later item on its own: a firm design of version k plus one item of a later version and its
    /// transitive requirements must validate, so every item's requires list is complete.
    /// </summary>
    [Fact]
    public void Every_later_item_validates_alone_on_each_earlier_version()
    {
        foreach (var standard in SystemPageStandards.All.Values)
            for (var k = 1; k < standard.Version; k++)
                foreach (var item in standard.Items.Where(x => x.Since > k))
                {
                    var json = Restrict(standard with { Items = standard.Items.Select(x => x.Since <= k || x.Key == item.Key ? x with { Since = Math.Min(x.Since, k) } : x).ToArray() }, k);
                    Assert.True(TenantCustomPageSchema.Validate(json, out var error), $"{standard.ScreenKey} v{k} + {item.Key}: {error}");
                }

        static string Restrict(SystemPageStandard standard, int version) => SystemPageStandards.Restrict(standard, version);
    }

    [Fact]
    public void SyntheticId_is_stable()
    {
        Assert.Equal(Guid.Parse("34787a42-4aa1-54ec-a9da-3a23e2bb2cf0"), SystemPageStandards.SyntheticId(Key));
        Assert.Equal(SystemPageStandards.SyntheticId(Key), SystemPageStandards.SyntheticId(Key));
        Assert.NotEqual(SystemPageStandards.SyntheticId(Key), SystemPageStandards.SyntheticId("inventory-transfers"));
    }

    [Fact]
    public void Restrict_drops_later_items_and_their_layout_references()
    {
        var envelope = Demo();
        envelope["version"] = 2;
        var items = envelope["items"]!.AsObject();
        items["component:yeniDugme"] = new JsonObject { ["since"] = 2, ["label"] = "Yeni düğme" };
        items["component:islemCubugu"] = new JsonObject { ["since"] = 1, ["label"] = "İşlem çubuğu" };
        items["component:sekmeler"] = new JsonObject { ["since"] = 1, ["label"] = "Sekmeler", ["requires"] = new JsonArray("component:depoListesi") };
        var components = envelope["definition"]!["components"]!.AsArray();
        components.Add(JsonNode.Parse("""{ "id": "yeniDugme", "type": "button", "name": "yeniDugme", "props": { "label": "Yeni" } }"""));
        components.Add(JsonNode.Parse("""{ "id": "islemCubugu", "type": "actionBar", "name": "islemCubugu", "props": { "moreButtons": ["yeniDugme"], "exportTable": "depoListesi" } }"""));
        components.Add(JsonNode.Parse("""{ "id": "sekmeler", "type": "tabs", "name": "sekmeler", "props": { "tabs": ["Liste=depoListesi", "Diğer=yeniDugme"] } }"""));
        var json = envelope.ToJsonString();

        // The full v2 definition and the v1 restriction (without yeniDugme) both validate.
        Assert.Empty(Errors(json));
        var standard = SystemPageStandards.Load([(Key + ".json", json)])[Key];
        var v1 = JsonNode.Parse(SystemPageStandards.Restrict(standard, 1))!;
        var ids = v1["components"]!.AsArray().Select(x => (string)x!["id"]!).ToArray();
        Assert.Equal(new[] { "depoListesi", "islemCubugu", "sekmeler" }, ids);
        var actionBar = v1["components"]!.AsArray().Single(x => (string)x!["id"]! == "islemCubugu")!;
        Assert.Null(actionBar["props"]!["moreButtons"]);
        Assert.Equal("depoListesi", (string)actionBar["props"]!["exportTable"]!);
        var tabs = v1["components"]!.AsArray().Single(x => (string)x!["id"]! == "sekmeler")!["props"]!["tabs"]!.AsArray();
        Assert.Equal(new[] { "Liste=depoListesi", "Diğer=" }, tabs.Select(x => (string)x!));
        Assert.Single(v1["queries"]!.AsArray());
        Assert.Equal(4, JsonNode.Parse(SystemPageStandards.Restrict(standard, 2))!["components"]!.AsArray().Count);
    }

    [Fact]
    public void Restrict_drops_form_dialog_of_a_later_dialog()
    {
        var envelope = Demo();
        envelope["version"] = 2;
        var items = envelope["items"]!.AsObject();
        items["component:notGirisi"] = new JsonObject { ["since"] = 2, ["label"] = "Not" };
        items["component:pencere"] = new JsonObject { ["since"] = 2, ["label"] = "Pencere", ["requires"] = new JsonArray("component:notGirisi") };
        items["component:islemCubugu"] = new JsonObject { ["since"] = 1, ["label"] = "İşlem çubuğu" };
        var components = envelope["definition"]!["components"]!.AsArray();
        components.Add(JsonNode.Parse("""{ "id": "notGirisi", "type": "input", "name": "notGirisi", "props": { "inputType": "text" } }"""));
        components.Add(JsonNode.Parse("""{ "id": "pencere", "type": "dialog", "name": "pencere", "props": { "contains": ["notGirisi"] } }"""));
        components.Add(JsonNode.Parse("""{ "id": "islemCubugu", "type": "actionBar", "name": "islemCubugu", "props": { "formDialog": "pencere", "exportTable": "depoListesi" } }"""));
        var json = envelope.ToJsonString();

        Assert.Empty(Errors(json));
        var standard = SystemPageStandards.Load([(Key + ".json", json)])[Key];
        var v1Json = SystemPageStandards.Restrict(standard, 1);
        Assert.True(TenantCustomPageSchema.Validate(v1Json, out var error), error);
        var actionBar = JsonNode.Parse(v1Json)!["components"]!.AsArray().Single(x => (string)x!["id"]! == "islemCubugu")!;
        Assert.Null(actionBar["props"]!["formDialog"]);
        Assert.Equal("pencere", (string)JsonNode.Parse(SystemPageStandards.Restrict(standard, 2))!["components"]!.AsArray()
            .Single(x => (string)x!["id"]! == "islemCubugu")!["props"]!["formDialog"]!);
    }

    [Fact]
    public void Restrict_keeps_required_items_of_included_items()
    {
        var envelope = Demo();
        envelope["version"] = 2;
        envelope["items"]!["query:depolar"]!["since"] = 2;
        var json = envelope.ToJsonString();
        Assert.Empty(Errors(json));
        var standard = SystemPageStandards.Load([(Key + ".json", json)])[Key];
        var v1 = JsonNode.Parse(SystemPageStandards.Restrict(standard, 1))!;
        Assert.Equal("depolar", (string)v1["queries"]![0]!["id"]!);
    }

    [Fact]
    public void Rejects_sql_query()
    {
        var envelope = Demo();
        envelope["items"]!["query:sqlSorgu"] = new JsonObject { ["since"] = 1, ["label"] = "SQL" };
        envelope["definition"]!["queries"]!.AsArray().Add(JsonNode.Parse(
            """{ "id": "sqlSorgu", "name": "sqlSorgu", "kind": "read", "sql": "SELECT 1 AS x", "parameters": [], "runOn": "load" }"""));
        AssertError(envelope, "sqlSorgu");
    }

    [Fact]
    public void Rejects_code_component_at_any_depth()
    {
        var envelope = Demo();
        envelope["items"]!["component:bolum"] = new JsonObject { ["since"] = 1, ["label"] = "Bölüm" };
        envelope["definition"]!["components"]!.AsArray().Add(JsonNode.Parse(
            """{ "id": "bolum", "type": "section", "props": { "title": "Bölüm" }, "children": [ { "id": "kodParcasi", "type": "code", "props": { "javascript": "1" } } ] }"""));
        AssertError(envelope, "kodParcasi");
    }

    [Fact]
    public void Rejects_missing_item_for_top_level_id()
    {
        var envelope = Demo();
        envelope["items"]!.AsObject().Remove("query:depolar");
        envelope["items"]!["component:depoListesi"]!.AsObject().Remove("requires");
        AssertError(envelope, "query:depolar");
    }

    [Fact]
    public void Rejects_extra_item()
    {
        var envelope = Demo();
        envelope["items"]!["component:hayalet"] = new JsonObject { ["since"] = 1, ["label"] = "Hayalet" };
        AssertError(envelope, "component:hayalet");
    }

    [Fact]
    public void Rejects_since_greater_than_version()
    {
        var envelope = Demo();
        envelope["items"]!["query:depolar"]!["since"] = 2;
        AssertError(envelope, "query:depolar");
    }

    [Fact]
    public void Rejects_unknown_requires()
    {
        var envelope = Demo();
        envelope["items"]!["component:depoListesi"]!["requires"] = new JsonArray("query:yok");
        AssertError(envelope, "query:yok");
    }

    [Fact]
    public void Rejects_screen_key_not_in_menu()
    {
        var envelope = Demo();
        envelope["screenKey"] = "olmayan-ekran";
        Assert.Contains(Errors(envelope.ToJsonString(), "olmayan-ekran.json"), x => x.Contains("olmayan-ekran", StringComparison.Ordinal));
    }

    [Fact]
    public void Rejects_file_name_different_from_screen_key()
    {
        var errors = Errors(Demo().ToJsonString(), "inventory-transfers.json");
        Assert.Contains(errors, x => x.Contains("inventory-transfers", StringComparison.Ordinal) && x.Contains(Key, StringComparison.Ordinal));
    }

    [Fact]
    public void Rejects_screen_view_field_not_in_catalog()
    {
        var envelope = Demo();
        envelope["screenViews"]![0]!["fields"]!["olmayanAlan"] = "code";
        AssertError(envelope, "olmayanAlan");
    }

    [Fact]
    public void Rejects_mapped_column_not_in_operation_result()
    {
        var envelope = Demo();
        envelope["screenViews"]![0]!["fields"]!["availability"] = "olmayanSutun";
        AssertError(envelope, "olmayanSutun");
    }

    [Fact]
    public void Rejects_v1_definition()
    {
        var envelope = Demo();
        envelope["definition"] = JsonNode.Parse("""{ "schemaVersion": 1, "components": [ { "id": "depoListesi", "type": "text", "props": { "text": "x" } } ] }""");
        envelope["items"] = JsonNode.Parse("""{ "component:depoListesi": { "since": 1, "label": "Metin" } }""");
        envelope["screenViews"] = new JsonArray();
        AssertError(envelope, "schemaVersion");
    }

    [Fact]
    public void Rejects_invalid_restricted_version()
    {
        // v1 holds the table but not its query, and nothing declares the dependency.
        var envelope = Demo();
        envelope["version"] = 2;
        envelope["items"]!["query:depolar"]!["since"] = 2;
        envelope["items"]!["component:depoListesi"]!.AsObject().Remove("requires");
        AssertError(envelope, "v1");
    }

    [Fact]
    public void All_errors_are_reported()
    {
        var envelope = Demo();
        envelope["items"]!["component:hayalet"] = new JsonObject { ["since"] = 1, ["label"] = "Hayalet" };
        envelope["screenViews"]![0]!["fields"]!["olmayanAlan"] = "code";
        var errors = Errors(envelope.ToJsonString());
        Assert.Contains(errors, x => x.Contains("component:hayalet", StringComparison.Ordinal));
        Assert.Contains(errors, x => x.Contains("olmayanAlan", StringComparison.Ordinal));
    }

    [Fact]
    public void Load_throws_listing_every_error()
    {
        var envelope = Demo();
        envelope["items"]!["component:hayalet"] = new JsonObject { ["since"] = 1, ["label"] = "Hayalet" };
        var exception = Assert.Throws<InvalidOperationException>(() => SystemPageStandards.Load([(Key + ".json", envelope.ToJsonString())]));
        Assert.Contains("component:hayalet", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Catalog_adapters_expose_menu_and_screen_view_fields()
    {
        Assert.Contains(Key, StandardMenuEndpoints.PageKeys);
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(Key, out var fields));
        Assert.Contains(fields, x => x.Key == "status" && x.DefaultVisible);
        Assert.False(TenantScreenViewEndpoints.TryGetCatalogFields("INVENTORY-WAREHOUSES", out _));
        Assert.False(TenantScreenViewEndpoints.TryGetCatalogFields("no-such-view", out _));
    }

    /// <summary>The version 1 envelope of Depo Yönetimi: a small, stable base for the envelope rules (the embedded one grows).</summary>
    private static JsonObject Demo() => JsonNode.Parse(WarehouseStandardV1.Json)!.AsObject();

    private static IReadOnlyList<string> Errors(string json, string fileName = Key + ".json") =>
        SystemPageStandards.Validate([(fileName, json)]);

    private static void AssertError(JsonObject envelope, string offending)
    {
        var errors = Errors(envelope.ToJsonString());
        Assert.True(errors.Any(x => x.Contains(offending, StringComparison.Ordinal)), $"'{offending}' içeren hata yok: {string.Join(" | ", errors)}");
    }
}
