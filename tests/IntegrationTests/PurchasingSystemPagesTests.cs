using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Satınalma system pages, Faz 1 (draft 21): the sales-requests, sales-purchase-quotes, sales-purchasing and
/// sales-purchase-delivery-notes standards (catalog bindings, write safeguards, "Eski ekranda aç" commands) and the erpPage
/// <c>legacy</c> flag of the page schema.
/// </summary>
public sealed class PurchasingSystemPagesTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    private static readonly string[] Keys = ["sales-requests", "sales-purchase-quotes", "sales-purchasing", "sales-purchase-delivery-notes"];

    /// <summary>
    /// Page params each legacy purchasing screen reads (decision K7, <c>sales/purchasingPageParams.ts</c> readers). A legacy
    /// command may only send these; the quotes screen reads none.
    /// </summary>
    private static readonly Dictionary<string, string[]> LegacyReaders = new(StringComparer.Ordinal)
    {
        ["sales-requests"] = ["requestId"],
        ["sales-purchasing"] = ["purchaseOrderId"],
        ["sales-purchase-receipts"] = ["receiptId"],
        ["sales-purchase-invoice-entry"] = ["receiptId"],
        ["sales-purchase-invoices"] = ["supplierId", "purchaseInvoiceId"],
        ["sales-purchase-quotes"] = [],
        ["sales-purchase-delivery-notes"] = ["purchaseOrderId"],
    };

    /// <summary>Every "→ eski ekran" command per standard: button id → (pageKey, params).</summary>
    private static readonly Dictionary<string, Dictionary<string, (string Page, string[] Params)>> LegacyCommands = new(StringComparer.Ordinal)
    {
        ["sales-requests"] = new()
        {
            ["acDugmesi"] = ("sales-requests", ["requestId={{liste.seciliSatir.id}}"]),
            ["detayAc"] = ("sales-requests", ["requestId={{liste.seciliSatir.id}}"]),
            ["yeniTalepDugmesi"] = ("sales-requests", []),
            ["teklifEkleDugmesi"] = ("sales-requests", ["requestId={{liste.seciliSatir.id}}"]),
            ["siparisOlusturDugmesi"] = ("sales-requests", ["requestId={{liste.seciliSatir.id}}"]),
            ["alanlarDugmesi"] = ("sales-requests", []),
        },
        ["sales-purchase-quotes"] = new()
        {
            ["acDugmesi"] = ("sales-requests", ["requestId={{liste.seciliSatir.purchaseRequestId}}"]),
            ["detayAc"] = ("sales-requests", ["requestId={{liste.seciliSatir.purchaseRequestId}}"]),
            ["talepsizTeklifDugmesi"] = ("sales-purchase-quotes", []),
        },
        ["sales-purchasing"] = new()
        {
            ["yeniSiparisDugmesi"] = ("sales-purchasing", []),
            ["malKabulDugmesi"] = ("sales-purchasing", ["purchaseOrderId={{liste.seciliSatir.id}}"]),
            ["belgeMalKabulDugmesi"] = ("sales-purchasing", ["purchaseOrderId={{siparisSecimi.value}}"]),
            ["detayMalKabul"] = ("sales-purchasing", ["purchaseOrderId={{liste.seciliSatir.id}}"]),
            ["eskiEkranDugmesi"] = ("sales-purchasing", ["purchaseOrderId={{liste.seciliSatir.id}}"]),
            // The receipts standard does not read receiptId, so a receipt link opens the legacy screen, which does.
            ["kabulAcDugmesi"] = ("sales-purchase-receipts", ["receiptId={{kabulTablosu.seciliSatir.id}}"]),
        },
        ["sales-purchase-delivery-notes"] = new()
        {
            ["yeniIrsaliyeDugmesi"] = ("sales-purchase-delivery-notes", []),
            ["baglantiDugmesi"] = ("sales-purchase-delivery-notes", ["purchaseOrderId={{liste.seciliSatir.purchaseOrderId}}"]),
            ["belgeBaglantiDugmesi"] = ("sales-purchase-delivery-notes", ["purchaseOrderId={{irsaliye.rows[0].purchaseOrderId}}"]),
            ["malKabuluAcDugmesi"] = ("sales-purchase-receipts", ["receiptId={{liste.seciliSatir.purchaseReceiptId}}"]),
        },
    };

    private static readonly Regex QueryPath = new(@"([A-Za-z_][A-Za-z0-9_]*)\.(rows\[0\]|meta)\.([A-Za-z0-9_.]+)", RegexOptions.CultureInvariant);
    private static readonly Regex RowPath = new(@"\b([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir\.([A-Za-z0-9_.]+)", RegexOptions.CultureInvariant);

    // ---- Standards ----

    [Fact]
    public void Own_standards_validate_on_their_own()
    {
        // Independent of the other purchasing standards written in parallel: envelope, items, screen views and schema.
        var files = SystemPageStandards.EmbeddedFiles().Where(x => Keys.Contains(Path.GetFileNameWithoutExtension(x.FileName))).ToArray();
        Assert.Equal(Keys.Length, files.Length);
        Assert.Empty(SystemPageStandards.Validate(files));
    }

    [Theory]
    [InlineData("sales-requests", "Satınalma talepleri", "purchase-requests")]
    [InlineData("sales-purchase-quotes", "Satınalma teklifleri", "purchase-supplier-quotes")]
    [InlineData("sales-purchasing", "Satınalma siparişleri", "purchase-orders")]
    [InlineData("sales-purchase-delivery-notes", "Satınalma İrsaliyeleri", "purchase-delivery-notes")]
    public void Standard_is_preview_version_1_and_binds_catalog_operations(string key, string title, string screenView)
    {
        var standard = Mine[key];
        Assert.Equal((1, "preview", title, "Satın Alma"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        Assert.Equal(screenView, Assert.Single(standard.ScreenViews).Key);
        Assert.Contains(key, StandardMenuEndpoints.PageKeys);

        foreach (var query in Queries(key))
        {
            var name = (string)query["operation"]!;
            Assert.True(name.StartsWith("satinalma.", StringComparison.Ordinal), name);
            Assert.True(ErpOperationCatalog.TryGet(name, out var op), name);
            Assert.False(op.Deprecated, name);
            Assert.Equal(op.Kind == "read" ? "read" : op.PageKind, (string)query["kind"]!);
            var bound = query["parameters"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["name"]!, x => (string)x["type"]!);
            foreach (var (parameter, type) in bound)
            {
                var declared = op.Parameters.SingleOrDefault(x => x.Name == parameter);
                Assert.True(declared is not null, $"{key}/{query["id"]}: {name} parametresi yok: {parameter}");
                Assert.Equal(declared.Type, type);
            }
            foreach (var required in op.Parameters.Where(x => x.Required))
                Assert.True(bound.ContainsKey(required.Name), $"{key}/{query["id"]}: zorunlu {required.Name} bağlanmadı");
        }
    }

    [Theory]
    [InlineData("sales-requests")]
    [InlineData("sales-purchase-quotes")]
    [InlineData("sales-purchasing")]
    [InlineData("sales-purchase-delivery-notes")]
    public void Columns_fields_and_bindings_exist_in_the_bound_operation(string key)
    {
        var definition = Definition(key);
        var operations = Queries(key).ToDictionary(x => (string)x["id"]!, x => Op((string)x["operation"]!));
        var components = AllComponents(definition).ToArray();
        var tableQuery = components.Where(x => (string)x["type"]! == "dataTable")
            .ToDictionary(x => (string)x["id"]!, x => (string)x["props"]!["query"]!);
        HashSet<string> ColumnsOf(string queryId) => operations[queryId].Result.Columns.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);

        foreach (var table in components.Where(x => (string)x["type"]! == "dataTable"))
        {
            var props = table["props"]!.AsObject();
            var columns = ColumnsOf((string)props["query"]!);
            var used = Strings(props["columns"])
                .Concat(MapKeys(props["columnLabels"], '=')).Concat(MapKeys(props["columnFormats"], '='))
                .Concat(MapKeys(props["columnUnits"], '=')).Concat(Strings(props["columnUnits"]).Select(x => x.Split('=', 2)[1]))
                .Concat(MapKeys(props["valueLabels"], ':')).Concat(Strings(props["totals"]));
            foreach (var column in used) Assert.True(columns.Contains(column), $"{key}/{table["id"]}: sütun yok: {column}");
        }
        foreach (var panel in components.Where(x => (string)x["type"]! == "contextPanel"))
        {
            var columns = ColumnsOf(tableQuery[(string)panel["props"]!["table"]!]);
            foreach (var field in MapKeys(panel["props"]!["fields"], '=')) Assert.True(columns.Contains(field), $"{key}/{panel["id"]}: alan yok: {field}");
        }

        var text = definition.ToJsonString(new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        foreach (Match match in QueryPath.Matches(text))
        {
            var (queryId, part, member) = (match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Value);
            Assert.True(operations.TryGetValue(queryId, out var op), $"{key}: sorgu yok: {queryId}");
            var known = part == "meta" ? op.Result.MetaPaths : op.Result.Columns.Select(x => x.Code).ToArray();
            Assert.True(known.Contains(member), $"{key}: {queryId}.{part}.{member} işlem sonucunda yok");
        }
        foreach (Match match in RowPath.Matches(text))
        {
            var (tableId, member) = (match.Groups[1].Value, match.Groups[2].Value);
            Assert.True(tableQuery.TryGetValue(tableId, out var queryId), $"{key}: tablo yok: {tableId}");
            Assert.True(ColumnsOf(queryId).Contains(member), $"{key}: {tableId}.seciliSatir.{member} işlem sonucunda yok");
        }
    }

    [Theory]
    [InlineData("sales-requests")]
    [InlineData("sales-purchase-quotes")]
    [InlineData("sales-purchasing")]
    [InlineData("sales-purchase-delivery-notes")]
    public void Write_commands_confirm_and_keep_the_server_error_text(string key)
    {
        var definition = Definition(key);
        var components = AllComponents(definition).ToArray();
        foreach (var query in Queries(key).Where(x => (string)x["kind"]! != "read"))
        {
            var id = (string)query["id"]!;
            var op = Op((string)query["operation"]!);
            Assert.Equal("write", op.Kind);
            var buttons = components.Where(x => (string?)x["props"]?["queryId"] == id).ToArray();
            var dialogs = components.Where(x => (string)x["type"]! == "dialog" && (string?)x["props"]?["saveQuery"] == id).ToArray();
            Assert.True(buttons.Length + dialogs.Length > 0, $"{key}/{id}: yazma sorgusu bir düğmeye bağlı değil");
            foreach (var button in buttons)
            {
                var props = button["props"]!.AsObject();
                // A prompt (promptLabel) is the confirmation dialog of the write; otherwise confirmEnabled asks first.
                Assert.True(props["confirmEnabled"]?.GetValue<bool>() == true || props["promptLabel"] is not null, $"{key}/{button["id"]}: onaysız yazma");
                // No errorMessage: the runtime then shows the server's 400/409 text unchanged (e.g. the self-approval rule).
                Assert.Null(props["errorMessage"]);
                Assert.NotNull(props["successMessage"]);
            }
            // A body requestId (idempotency key) is bound to a hidden autoId input.
            if (op.Parameters.Any(x => x is { Name: "requestId", In: "body" }))
            {
                var binding = Binding(query, "requestId");
                Assert.NotNull(binding);
                var input = components.Single(x => (string?)x["name"] == binding!.Trim('{', '}').Split('.')[0]);
                Assert.True(input["props"]!["autoId"]!.GetValue<bool>(), $"{key}/{id}: requestId autoId değil");
            }
        }
    }

    [Fact]
    public void Faz_1_write_operations_carry_no_request_id()
    {
        // F10: today no bound write declares a body requestId, so the autoId rule above has nothing to bind yet.
        foreach (var name in new[] { "satinalma.talep.onayla", "satinalma.talep.reddet" })
            Assert.DoesNotContain(Op(name).Parameters, x => x.Name == "requestId");
        var writes = Keys.SelectMany(Queries).Where(x => (string)x["kind"]! != "read").Select(x => (string)x["operation"]!).Distinct().Order();
        Assert.Equal(new[] { "satinalma.talep.onayla", "satinalma.talep.reddet" }, writes);
    }

    [Fact]
    public void Request_decisions_need_a_note_to_reject()
    {
        foreach (var (button, query, required) in new[] { ("onaylaDugmesi", "onay", false), ("reddetDugmesi", "ret", true),
                     ("panelOnayla", "panelOnay", false), ("panelReddet", "panelRet", true) })
        {
            var props = Props("sales-requests", button);
            Assert.Equal(query, (string)props["queryId"]!);
            Assert.Equal(500, (int)props["promptMaxLength"]!);
            Assert.Equal(required, props["promptRequired"]?.GetValue<bool>() == true);
            Assert.Equal("{{" + button + ".yanit}}", Binding(Queries("sales-requests").Single(x => (string)x["id"]! == query), "note"));
            Assert.Equal("{{liste.seciliSatir.id}}", Binding(Queries("sales-requests").Single(x => (string)x["id"]! == query), "id"));
        }
        Assert.Equal("satinalma.talep.reddet", (string)Queries("sales-requests").Single(x => (string)x["id"]! == "ret")["operation"]!);
        Assert.True(Op("satinalma.talep.onayla").RequiresTenantAdmin);
    }

    [Theory]
    [InlineData("sales-requests")]
    [InlineData("sales-purchase-quotes")]
    [InlineData("sales-purchasing")]
    [InlineData("sales-purchase-delivery-notes")]
    public void Legacy_commands_open_the_legacy_screen_with_its_params(string key)
    {
        var components = AllComponents(Definition(key)).ToArray();
        var legacy = components.Where(x => x["props"]?["legacy"] is not null).ToArray();
        Assert.Equal(LegacyCommands[key].Keys.Order(StringComparer.Ordinal), legacy.Select(x => (string)x["id"]!).Order(StringComparer.Ordinal));
        foreach (var button in legacy)
        {
            var props = button["props"]!.AsObject();
            var (page, parameters) = LegacyCommands[key][(string)button["id"]!];
            Assert.Equal(("button", "erpPage", true, page), ((string)button["type"]!, (string)props["actionType"]!, props["legacy"]!.GetValue<bool>(),
                (string)props["pageKey"]!));
            var actual = props["params"] is null ? [] : Strings(props["params"]);
            Assert.Equal(parameters, actual);
            Assert.All(actual, x => Assert.Contains(x.Split('=')[0], LegacyReaders[page]));
        }
        // Plain erpPage navigation (system page or legacy, whichever the firm serves) also sends only K7 params.
        foreach (var button in components.Where(x => (string?)x["props"]?["actionType"] == "erpPage" && x["props"]?["legacy"] is null))
        {
            var props = button["props"]!.AsObject();
            Assert.True(LegacyReaders.TryGetValue((string)props["pageKey"]!, out var readers), (string)button["id"]!);
            Assert.All(props["params"] is null ? [] : Strings(props["params"]), x => Assert.Contains(x.Split('=')[0], readers));
        }
    }

    [Theory]
    [InlineData("sales-purchasing", "siparisSecimi", "purchaseOrderId", "siparis")]
    [InlineData("sales-purchase-delivery-notes", "irsaliyeSecimi", null, "irsaliye")]
    public void Documents_open_in_page_from_the_list(string key, string selection, string? pageParam, string recordQuery)
    {
        var input = Props(key, selection);
        Assert.True(input["hidden"]!.GetValue<bool>());
        Assert.Equal(pageParam is null ? null : $"{{{{sayfa.parametre.{pageParam}}}}}", (string?)input["defaultValue"]);
        Assert.Equal(new[] { $"{selection}={{{{liste.seciliSatir.id}}}}" }, Strings(Props(key, "acDugmesi")["assignments"]));
        Assert.Equal(new[] { $"{selection}=" }, Strings(Props(key, "listeyeDonDugmesi")["assignments"]));
        Assert.Equal($"{{{{{selection}.value}}}}", Binding(Queries(key).Single(x => (string)x["id"]! == recordQuery), "id"));
        Assert.Equal($"{selection}.value == null", (string)Props(key, "liste")["visibleWhen"]!);
        Assert.Equal($"{selection}.value != null", (string)Props(key, "belgeBasligi")["visibleWhen"]!);
    }

    [Fact]
    public void Order_list_counts_and_filters_come_from_the_api()
    {
        Assert.Equal("{{gecikmisSecimi.value}}", Binding(Query("sales-purchasing", "siparisler"), "overdue"));
        Assert.Equal("{{durumSecimi.value}}", Binding(Query("sales-purchasing", "siparisler"), "status"));
        foreach (var (query, input, value) in new[] { ("sayAcik", "durumAcik", "Open"), ("sayKismen", "durumKismen", "PartiallyReceived") })
        {
            Assert.Equal($"{{{{{input}.value}}}}", Binding(Query("sales-purchasing", query), "status"));
            Assert.Equal(value, (string)Props("sales-purchasing", input)["defaultValue"]!);
        }
        Assert.Equal("{{gecikmisSabit.value}}", Binding(Query("sales-purchasing", "sayGecikmis"), "overdue"));
        Assert.Equal(("gecikmisSecimi", "true"), ((string)Props("sales-purchasing", "gecikmisGostergesi")["filterInput"]!,
            (string)Props("sales-purchasing", "gecikmisGostergesi")["filterValue"]!));
        foreach (var (query, status) in new[] { ("sayOnayBekliyor", "Submitted"), ("sayOnaylandi", "Approved"), ("sayDonustu", "Ordered"), ("sayReddedildi", "Rejected") })
        {
            var input = Binding(Query("sales-requests", query), "status")!.Trim('{', '}').Split('.')[0];
            Assert.Equal(status, (string)Props("sales-requests", input)["defaultValue"]!);
            Assert.Equal("{{suzgec.search}}", Binding(Query("sales-requests", query), "search"));
        }
        // The order document chain: lines, receipts (with their invoice) and "Faturala" into invoice entry.
        Assert.Equal("satinalma.siparis.malKabulleri", (string)Query("sales-purchasing", "malKabuller")["operation"]!);
        var invoice = Props("sales-purchasing", "faturalaDugmesi");
        Assert.Equal(("sales-purchase-invoice-entry", "receiptId={{kabulTablosu.seciliSatir.id}}"), ((string)invoice["pageKey"]!, Strings(invoice["params"]).Single()));
    }

    // ---- Runtime ----

    [Fact]
    public async Task Standards_are_served_as_preview_when_enabled()
    {
        await using (var app = await StartApplicationAsync(enabled: []))
        {
            using var client = app.GetTestClient();
            SetIdentity(client, Mehmet, "TenantUser");
            var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
            Assert.All(Keys, key => Assert.False(screens.TryGetProperty(key, out _), key));
        }
        await using (var app = await StartApplicationAsync(enabled: Keys))
        {
            using var client = app.GetTestClient();
            SetIdentity(client, Admin, "TenantAdmin");
            var catalog = (await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages"))!.ToDictionary(x => x.GetProperty("screenKey").GetString()!);
            SetIdentity(client, Mehmet, "TenantUser");
            var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
            foreach (var key in Keys)
            {
                Assert.Equal(("preview", 1), (catalog[key].GetProperty("stage").GetString(), catalog[key].GetProperty("version").GetInt32()));
                Assert.Equal("standard", screens.GetProperty(key).GetProperty("mode").GetString());
                var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{key}/published");
                Assert.Equal(("@" + key, 1, "standard"), (page.GetProperty("code").GetString(), page.GetProperty("standardVersion").GetInt32(),
                    page.GetProperty("source").GetString()));
                var definitionJson = page.GetProperty("definitionJson").GetString()!;
                Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Mine[key].DefinitionJson), JsonNode.Parse(definitionJson)), key);
                Assert.True(TenantCustomPageSchema.Validate(definitionJson, out var error), error);
            }
        }
    }

    // ---- Schema: erpPage legacy flag ----

    [Theory]
    [InlineData("""{"actionType":"erpPage","pageKey":"sales-purchasing","legacy":true,"params":["purchaseOrderId={{x.value}}"]}""")]
    [InlineData("""{"actionType":"erpPage","pageKey":"sales-purchasing","legacy":false}""")]
    [InlineData("""{"actionType":"erpPage","pageKey":"customers","legacy":true,"target":"newTab"}""")]
    public void Schema_accepts_the_legacy_flag_on_erp_page_buttons(string buttonProps)
    {
        Assert.True(TenantCustomPageSchema.Validate(PageWithButton(buttonProps), out var error), error);
    }

    [Theory]
    [InlineData("""{"actionType":"erpPage","pageKey":"sales-purchasing","legacy":"true"}""", "doğru/yanlış")]
    [InlineData("""{"actionType":"erpPage","pageKey":"sales-purchasing","legacy":1}""", "doğru/yanlış")]
    [InlineData("""{"actionType":"erpPage","pageKey":"sales-purchasing","legacy":null}""", "doğru/yanlış")]
    [InlineData("""{"actionType":"page","pageCode":"@customers","legacy":true}""", "erpPage")]
    [InlineData("""{"actionType":"link","href":"https://example.com/","legacy":true}""", "erpPage")]
    [InlineData("""{"actionType":"query","queryId":"q","legacy":true}""", "erpPage")]
    [InlineData("""{"actionType":"setInput","assignments":["x="],"legacy":true}""", "erpPage")]
    public void Schema_rejects_the_legacy_flag_outside_erp_page_or_when_not_boolean(string buttonProps, string expected)
    {
        Assert.False(TenantCustomPageSchema.Validate(PageWithButton(buttonProps), out var error));
        Assert.Contains(expected, error);
    }

    [Fact]
    public void Schema_rejects_the_legacy_flag_on_other_components()
    {
        var page = """{"schemaVersion":2,"components":[{"id":"t","type":"text","name":"t","props":{"text":"x","legacy":true}}],"queries":[]}""";
        Assert.False(TenantCustomPageSchema.Validate(page, out var error));
        Assert.Contains("erpPage", error);
        // Version 1 pages never knew navigation props.
        var v1 = """{"schemaVersion":1,"components":[{"id":"b","type":"button","props":{"text":"x","actionType":"erpPage","pageKey":"customers","legacy":true}}]}""";
        Assert.False(TenantCustomPageSchema.Validate(v1, out _));
    }

    // ---- Helpers ----

    private static string PageWithButton(string buttonProps)
    {
        var props = JsonNode.Parse(buttonProps)!.AsObject();
        props["text"] = "Eski ekranda aç";
        var page = new JsonObject
        {
            ["schemaVersion"] = 2,
            ["components"] = new JsonArray(
                JsonNode.Parse("""{"id":"x","type":"input","name":"x","props":{"inputType":"text","label":"X"}}"""),
                new JsonObject { ["id"] = "b", ["type"] = "button", ["name"] = "b", ["props"] = props }),
            ["queries"] = new JsonArray(JsonNode.Parse(
                """{"id":"q","name":"q","kind":"update","operation":"satinalma.talep.onayla","runOn":"manual","parameters":[{"name":"id","binding":"{{x.value}}","type":"guid"}]}""")),
        };
        return page.ToJsonString();
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    /// <summary>The four standards loaded on their own, so a parallel edit of another purchasing standard cannot mask these checks.</summary>
    private static readonly Lazy<IReadOnlyDictionary<string, SystemPageStandard>> MineLoaded = new(() =>
        SystemPageStandards.Load(SystemPageStandards.EmbeddedFiles().Where(x => Keys.Contains(Path.GetFileNameWithoutExtension(x.FileName)))));
    private static IReadOnlyDictionary<string, SystemPageStandard> Mine => MineLoaded.Value;

    private static JsonObject Definition(string key) => JsonNode.Parse(Mine[key].DefinitionJson)!.AsObject();

    private static IEnumerable<JsonObject> Queries(string key) => Definition(key)["queries"]!.AsArray().OfType<JsonObject>();

    private static JsonObject Query(string key, string id) => Queries(key).Single(x => (string)x["id"]! == id);

    private static IEnumerable<JsonObject> AllComponents(JsonObject definition)
    {
        var pending = new Stack<JsonObject>(definition["components"]!.AsArray().OfType<JsonObject>());
        while (pending.Count > 0)
        {
            var component = pending.Pop();
            yield return component;
            if (component["children"] is JsonArray children) foreach (var child in children.OfType<JsonObject>()) pending.Push(child);
        }
    }

    private static JsonObject Props(string key, string id) =>
        AllComponents(Definition(key)).Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static string? Binding(JsonObject query, string parameter) =>
        (string?)query["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node is null ? [] : node.AsArray().Select(x => (string)x!).ToArray();

    private static IEnumerable<string> MapKeys(JsonNode? node, char separator) => Strings(node).Select(x => x.Split(separator, 2)[0]);

    private static async Task<WebApplication> StartApplicationAsync(string[] enabled)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(enabled.Select((key, i) =>
            new KeyValuePair<string, string?>($"SystemPages:StandardEnabled:{i}", key)));
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"purchasing-standards-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"purchasing-standards-platform-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer, CustomizationTestPermissionAuthorizer>();
        builder.Services.AddSystemPages();
        builder.Services.AddSingleton<ITenantQueryConnectionFactory, UnusedQueryConnectionFactory>();
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(CustomPageQueryEndpoints.ConfigureRateLimiting);
        builder.Services.AddSingleton<CustomPageWriteRateLimiter>();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapTenantCustomPageEndpoints();
        app.MapSystemPageEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await tenantDb.Database.EnsureCreatedAsync();
        tenantDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" });
        await tenantDb.SaveChangesAsync();
        await CustomPageAccessEndpointsIntegrationTests.SeedPlatformAsync(scope.ServiceProvider.GetRequiredService<PlatformDbContext>());
        return app;
    }

    private static void SetIdentity(HttpClient client, Guid user, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", user.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    private sealed class UnusedQueryConnectionFactory : ITenantQueryConnectionFactory
    {
        public Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SQL is not reached in these tests.");
    }
}
