using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
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
/// Purchasing document system pages, Faz 2 (draft 21, line-document writes): Satınalma İrsaliyeleri v2 (delivery note from the
/// order's remaining lines, link / unlink receipt), Satınalma Faturaları v2 and Satınalma İadeleri v2 (return from the
/// invoice's returnable lines) and the new Bağımsız fatura taslakları v1 (create / edit with numbered lines, expense account
/// and receipt-line pickers, chained formulas and totals, Muhasebeleştir). The grids use the generic engine props
/// (fillQuery, fillColumns, skipWhenZero, lookupFills, formulas, rowNumberColumn).
/// </summary>
public sealed class PurchasingFaz2DocumentSystemPagesTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    public static TheoryData<string, string, int> Keys => new()
    {
        { "sales-purchase-delivery-notes", "Satınalma İrsaliyeleri", 2 },
        { "sales-purchase-invoices", "Satınalma Faturaları", 3 },
        { "sales-purchase-returns", "Satınalma İadeleri", 2 },
        { "sales-purchase-invoice-drafts", "Satınalma faturası taslakları", 1 },
    };

    /// <summary>Every fill grid: (page, grid, fill query, fill operation, the dialog that saves it).</summary>
    public static TheoryData<string, string, string, string, string> FillGrids => new()
    {
        { "sales-purchase-delivery-notes", "irsaliyeSatirlari", "irsaliyeKaynak", "satinalma.irsaliye.siparisSatirlari", "yeniIrsaliyePenceresi" },
        { "sales-purchase-returns", "iadeKalemleri", "iadeKaynak", "satinalma.fatura.iadeEdilebilirSatirlar", "iadePenceresi" },
    };

    // ---- Standards ----

    [Fact]
    public void The_four_standards_validate_on_their_own()
    {
        var names = KeyList().Select(x => x.Key + ".json").ToHashSet(StringComparer.Ordinal);
        var files = SystemPageStandards.EmbeddedFiles().Where(x => names.Contains(x.FileName)).ToArray();
        Assert.Equal(4, files.Length);
        // Includes the restricted v1 definitions of the v2 standards.
        var errors = SystemPageStandards.Validate(files);
        Assert.True(errors.Count == 0, string.Join(Environment.NewLine, errors));
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Standard_is_preview_at_its_version_and_within_the_limits(string key, string title, int version)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((version, "preview", title, "Satın Alma"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since >= 1 && x.Since <= version && x.Label.Length is > 0 and <= 80, x.Key));
        Assert.Contains(key, StandardMenuEndpoints.PageKeys);
        var definition = Definition(key);
        Assert.InRange(Queries(definition).Count(), 1, 30);
        Assert.All(Components(definition).Where(x => (string?)x["type"] == "dataTable"),
            table => Assert.InRange(Strings(table["props"]!["columns"]).Length, 1, 12));
        Assert.All(Components(definition).Where(x => (string?)x["type"] == "editableGrid"),
            grid => Assert.InRange(Strings(grid["props"]!["gridColumns"]).Length, 1, 12));
        Assert.All(Components(definition), component => Assert.InRange(component["props"]?.AsObject().Count ?? 0, 0, 30));
        if (version == 1) return;
        // The restricted v1 definition still validates and keeps the v1 commands.
        var v1 = SystemPageStandards.Restrict(standard, 1);
        Assert.True(TenantCustomPageSchema.Validate(v1, out var v1Error), v1Error);
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Every_bound_operation_exists_with_its_parameters_and_types(string key, string _, int __)
    {
        foreach (var query in Queries(Definition(key)))
        {
            var name = (string)query["operation"]!;
            Assert.True(ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name);
            Assert.True(name.StartsWith("satinalma.", StringComparison.Ordinal) || name.StartsWith("depo.", StringComparison.Ordinal), name);
            Assert.Equal(op.Kind == "read" ? "read" : op.PageKind, (string)query["kind"]!);
            var bound = query["parameters"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["name"]!, x => (string)x["type"]!);
            foreach (var (parameter, type) in bound)
            {
                var declared = op.Parameters.SingleOrDefault(x => x.Name == parameter);
                Assert.True(declared is not null, $"{key}/{query["id"]}: {name} parametresi yok: {parameter}");
                Assert.Equal(declared.Type, type);
            }
            Assert.All(op.Parameters.Where(x => x.Required), x => Assert.True(bound.ContainsKey(x.Name), $"{key}/{query["id"]}: zorunlu {x.Name}"));
        }
    }

    [Fact]
    public async Task Bound_operations_are_in_the_live_catalog_and_allowed_for_the_admin()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.GetProperty("allowed").GetBoolean());
        foreach (var (key, _, _) in KeyList())
            foreach (var name in Queries(Definition(key)).Select(x => (string)x["operation"]!))
                Assert.True(live.TryGetValue(name, out var allowed) && allowed, $"{key}: {name}");
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Every_write_has_confirm_or_a_dialog_and_an_auto_request_id_where_the_body_has_one(string key, string _, int __)
    {
        var definition = Definition(key);
        var components = Components(definition).ToArray();
        foreach (var query in Queries(definition).Where(x => (string)x["kind"]! != "read"))
        {
            var id = (string)query["id"]!;
            var buttons = components.Where(x => (string?)x["type"] == "button" && (string?)x["props"]!["queryId"] == id).ToArray();
            var dialogs = components.Where(x => (string?)x["type"] == "dialog" && (string?)x["props"]!["saveQuery"] == id).ToArray();
            Assert.True(buttons.Length + dialogs.Length > 0, $"{key}: '{id}' hiçbir komuta bağlı değil.");
            foreach (var button in buttons)
            {
                var props = button["props"]!;
                Assert.True((bool?)props["confirmEnabled"] == true && !string.IsNullOrWhiteSpace((string?)props["confirmText"]), $"{key}: {button["id"]}");
                Assert.False(string.IsNullOrWhiteSpace((string?)props["successMessage"]), $"{key}: {button["id"]}");
            }
            // A dialog is the input step (and the busy lock) of the write: it owns a required input bound to the query, closes on
            // save and refreshes what it changed.
            foreach (var dialog in dialogs)
            {
                var props = dialog["props"]!;
                Assert.Equal((true, true), ((bool?)props["closeOnSave"], (bool?)props["resetOnOpen"]));
                Assert.NotEmpty(Strings(props["refreshQueries"]));
                Assert.Contains(query["parameters"]!.AsArray().OfType<JsonObject>(),
                    x => Input(definition, BindingRoot((string)x["binding"]!))?["props"]?["required"] is not null);
            }
            ErpOperationCatalog.TryGet((string)query["operation"]!, out var op);
            var requestId = query["parameters"]!.AsArray().OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == "requestId");
            Assert.Equal(op.Parameters.Any(x => x.Name == "requestId"), requestId is not null);
            if (requestId is null) continue;
            var input = Input(definition, BindingRoot((string)requestId["binding"]!));
            Assert.NotNull(input);
            Assert.Equal((true, true), ((bool?)input!["props"]!["autoId"], (bool?)input["props"]!["hidden"]));
            Assert.Contains((string)input["id"]!, Strings(Assert.Single(dialogs)["props"]!["contains"]));
        }
    }

    [Fact]
    public void Request_ids_are_on_the_return_and_draft_writes_only()
    {
        var writes = KeyList().SelectMany(x => Queries(Definition(x.Key))).Where(x => (string)x["kind"]! != "read")
            .Where(x => x["parameters"]!.AsArray().OfType<JsonObject>().Any(p => (string)p["name"]! == "requestId"))
            .Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "satinalma.fatura.odemeEkle", "satinalma.faturaTaslagi.olustur", "satinalma.iade.olustur" }, writes);
        // No body key: delivery note create (duplicate document number → 409) and the draft update (expectedRowVersion → 409).
        Assert.DoesNotContain(Op("satinalma.irsaliye.olustur").Parameters, x => x.Name == "requestId");
        Assert.DoesNotContain(Op("satinalma.faturaTaslagi.guncelle").Parameters, x => x.Name == "requestId");
    }

    // ---- Fill grids (E1) ----

    [Theory]
    [MemberData(nameof(FillGrids))]
    public void Fill_grid_starts_from_the_remaining_quantities_and_skips_zero_rows(string key, string grid, string fillQuery, string operation, string dialog)
    {
        var props = Props(key, grid);
        Assert.Equal(("list", fillQuery, "quantity"), ((string)props["gridMode"]!, (string)props["fillQuery"]!, (string)props["skipWhenZero"]!));
        // F2-17: the quantity cell starts from the remaining quantity, never from the ordered/invoiced one.
        Assert.Equal("remainingQuantity", (string)props["fillColumns"]!["quantity"]!);
        Assert.Equal((200, 1), ((int)props["maxRows"]!, (int)props["minRows"]!));
        Assert.Equal(operation, Operation(key, fillQuery));
        var dialogProps = Props(key, dialog);
        Assert.Contains(grid, Strings(dialogProps["contains"]));
        // After a save the grid re-fills from the fill query.
        Assert.Contains(fillQuery, Strings(dialogProps["refreshQueries"]));

        var fillColumns = Op(operation).Result.Columns.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        var write = Queries(Definition(key)).Single(x => (string?)x["parameters"]!.AsArray().OfType<JsonObject>()
            .SingleOrDefault(p => (string)p["name"]! == "lines")?["binding"] == $"{{{{{grid}.satirlar}}}}");
        var items = Op((string)write["operation"]!).Parameters.Single(x => x.Name == "lines").Items!.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        foreach (var column in Strings(props["gridColumns"]).Select(x => x.Split('|')))
        {
            var (code, rules) = (column[0], column.Length == 4 ? column[3].Split(',') : []);
            // The supplier's line price is typed on the note (no fill: an omitted price stays unpriced).
            if (code is "isFreeOfCharge" or "unitPrice" or "discountPercent" or "vatPercent" && items.Contains(code)) continue;
            // Display-only columns come from the fill query; every sent column is a list item.
            if (!items.Contains(code)) Assert.Contains("readOnly", rules);
            if (code != "storageLocationId") Assert.True(fillColumns.Contains(code) || code == "quantity", $"{key}/{grid}: {code}");
            if (code != "quantity" && code != "storageLocationId") Assert.Contains("readOnly", rules);
        }
        // Every required line item is a grid column.
        foreach (var item in Op((string)write["operation"]!).Parameters.Single(x => x.Name == "lines").Items!.Where(x => x.Required))
            Assert.Contains(item.Code, Strings(props["gridColumns"]).Select(x => x.Split('|')[0]));
    }

    // ---- Satınalma İrsaliyeleri v2 ----

    [Fact]
    public void Delivery_note_is_created_from_the_order_lines_and_linked_or_unlinked_on_the_list_and_the_document()
    {
        const string key = "sales-purchase-delivery-notes";
        Assert.Equal(("openDialog", "yeniIrsaliyePenceresi"), ((string)Props(key, "yeniIrsaliyeDugmesi")["actionType"]!, (string)Props(key, "yeniIrsaliyeDugmesi")["dialogId"]!));
        Assert.Equal("yeniIrsaliyeDugmesi", (string)Props(key, "komutlar")["newButton"]!);
        // The order picker offers the statuses the server accepts (not Cancelled, PendingApproval, Rejected).
        var order = Props(key, "irsaliyeSiparisi");
        Assert.Equal(("lookup", "siparisler", true), ((string)order["inputType"]!, (string)order["optionsQuery"]!, (bool)order["required"]!));
        Assert.Equal("satir.status in ['Open', 'PartiallyReceived', 'Received']", (string)order["optionsWhen"]!);
        Assert.Equal(("satinalma.siparis.listele", "{{irsaliyeSiparisi.search}}"), (Operation(key, "siparisler"), Binding(key, "siparisler", "q")));
        foreach (var query in new[] { "irsaliyeKaynak", "siparisIrsaliyeleri" })
            Assert.Equal("{{irsaliyeSiparisi.value}}", Binding(key, query, "orderId"));
        Assert.Equal(("satinalma.siparis.malKabulleri", "{{irsaliyeSiparisi.value}}"), (Operation(key, "irsaliyeKabulleri"), Binding(key, "irsaliyeKabulleri", "id")));
        Assert.Equal(("satinalma.irsaliye.olustur", "{{irsaliyeSiparisi.value}}", "{{belgeNo.value}}", "{{belgeTarihi.value}}", "{{irsaliyeKabulu.value}}"),
            (Operation(key, "irsaliyeOlustur"), Binding(key, "irsaliyeOlustur", "orderId"), Binding(key, "irsaliyeOlustur", "documentNumber"),
             Binding(key, "irsaliyeOlustur", "documentDate"), Binding(key, "irsaliyeOlustur", "purchaseReceiptId")));
        Assert.Null(Props(key, "irsaliyeKabulu")["required"]);
        Assert.Equal((true, 80), ((bool)Props(key, "belgeNo")["required"]!, (int)Props(key, "belgeNo")["maxLength"]!));
        // F2-10: the quantity is in the order line's base unit; the grid sends the source unit and offers no other.
        Assert.Contains("unitCode|Birim|text|readOnly", Strings(Props(key, "irsaliyeSatirlari")["gridColumns"]));

        // Link: one dialog per context (list row, open document); unlink: a confirmed command per context.
        foreach (var (opener, dialog, select, options, write, recordId, orderId) in new[] {
                     ("baglantiDugmesi", "baglaPenceresi", "baglaKabulu", "baglaKabulleri", "bagla", "{{liste.seciliSatir.id}}", "{{liste.seciliSatir.purchaseOrderId}}"),
                     ("belgeBaglantiDugmesi", "belgeBaglaPenceresi", "belgeBaglaKabulu", "belgeBaglaKabulleri", "belgeBagla", "{{irsaliye.rows[0].id}}", "{{irsaliye.rows[0].purchaseOrderId}}") })
        {
            Assert.Equal(("openDialog", dialog), ((string)Props(key, opener)["actionType"]!, (string)Props(key, opener)["dialogId"]!));
            Assert.Equal(write, (string)Props(key, dialog)["saveQuery"]!);
            Assert.Equal(("satinalma.siparis.malKabulleri", orderId), (Operation(key, options), Binding(key, options, "id")));
            Assert.Equal("satir.status == 'Posted'", (string)Props(key, select)["optionsWhen"]!);
            Assert.Equal(("satinalma.irsaliye.malKabulBagla", recordId, $"{{{{{select}.value}}}}"),
                (Operation(key, write), Binding(key, write, "id"), Binding(key, write, "purchaseReceiptId")));
        }
        foreach (var (button, query, recordId) in new[] { ("baglantiKaldirDugmesi", "baglantiKaldir", "{{liste.seciliSatir.id}}"),
                     ("belgeBaglantiKaldirDugmesi", "belgeBaglantiKaldir", "{{irsaliye.rows[0].id}}") })
        {
            var props = Props(key, button);
            Assert.Equal((query, true), ((string)props["queryId"]!, (bool)props["confirmEnabled"]!));
            Assert.Null(props["errorMessage"]);
            Assert.Equal(("satinalma.irsaliye.malKabulBaglantisiKaldir", recordId), (Operation(key, query), Binding(key, query, "id")));
        }
        Assert.Equal("liste.seciliSatir.purchaseReceiptId == null", (string)Props(key, "baglantiKaldirDugmesi")["disabledWhen"]!);
        Assert.Contains("liste.seciliSatir.purchaseReceiptId != null", (string)Props(key, "baglantiDugmesi")["disabledWhen"]!);
        Assert.Equal(new[] { "listeyeDonDugmesi", "belgeBaglantiDugmesi", "belgeBaglantiKaldirDugmesi" }, Strings(Props(key, "belgeBasligi")["buttons"]));
        // Only the receipt link stays on the legacy screen (the receipts standard does not read receiptId).
        var legacy = Components(Definition(key)).Where(x => (bool?)x["props"]?["legacyScreen"] == true).Select(x => (string)x["id"]!).ToArray();
        Assert.Equal(new[] { "malKabuluAcDugmesi" }, legacy);
    }

    // ---- Satınalma Faturaları v2 / Satınalma İadeleri v2 ----

    [Theory]
    [InlineData("sales-purchase-returns", "yeniIadeDugmesi", "{{iadeFatura.value}}")]
    public void Return_is_created_from_the_returnable_invoice_lines(string key, string opener, string invoiceId)
    {
        Assert.Equal(("openDialog", "iadePenceresi"), ((string)Props(key, opener)["actionType"]!, (string)Props(key, opener)["dialogId"]!));
        Assert.Null(Props(key, opener)["legacyScreen"]);
        Assert.Equal(invoiceId, Binding(key, "iadeKaynak", "id"));
        Assert.Equal(("satinalma.iade.olustur", invoiceId, "{{iadeKimligi.value}}", "{{iadeDepo.value}}", "{{iadeTarihi.value}}", "{{iadeKalemleri.satirlar}}"),
            (Operation(key, "iadeOlustur"), Binding(key, "iadeOlustur", "id"), Binding(key, "iadeOlustur", "requestId"), Binding(key, "iadeOlustur", "warehouseId"),
             Binding(key, "iadeOlustur", "returnDate"), Binding(key, "iadeOlustur", "lines")));
        Assert.Equal(("depo.listele", "depo.konumlari", "{{iadeDepo.value}}"), (Operation(key, "depolar"), Operation(key, "iadeKonumlar"), Binding(key, "iadeKonumlar", "warehouseId")));
        Assert.Equal(new[] { "iadeKalemleri.storageLocationId" }, Strings(Props(key, "iadeDepo")["clearsOnChange"]));
        // The invoice line is a read-only picker over the fill query: it shows the stock, sends the line id.
        Assert.Contains("purchaseInvoiceLineId|Fatura satırı|lookup:iadeKaynak:purchaseInvoiceLineId:stockCode:stockName|required,readOnly",
            Strings(Props(key, "iadeKalemleri")["gridColumns"]));
        Assert.Contains("iadeler", Strings(Props(key, "iadePenceresi")["refreshQueries"]));
        if (key == "sales-purchase-returns")
        {
            var invoice = Props(key, "iadeFatura");
            Assert.Equal(("faturalar", "satir.status == 'Posted'", true), ((string)invoice["optionsQuery"]!, (string)invoice["optionsWhen"]!, (bool)invoice["required"]!));
            Assert.Equal(("satinalma.fatura.listele", "{{iadeFatura.search}}"), (Operation(key, "faturalar"), Binding(key, "faturalar", "q")));
        }
    }

    [Fact]
    public void Invoices_Iade_olustur_opens_the_returns_page_until_the_window_has_a_line_grid()
    {
        // satın alma 1. dalga: the invoices Liste template has no editable line grid in its windows; the return is made on its own page.
        var props = Props("sales-purchase-invoices", "iadeDugmesi");
        Assert.Equal(("erpPage", "sales-purchase-returns"), ((string)props["actionType"]!, (string)props["pageKey"]!));
        Assert.Null(props["legacyScreen"]);
        Assert.Equal("liste.seciliSatir.id == null || liste.seciliSatir.status != 'Posted'", (string)props["disabledWhen"]!);
        Assert.DoesNotContain(Queries(Definition("sales-purchase-invoices")), x => (string)x["operation"]! is "satinalma.iade.olustur" or "depo.listele");
    }

    // ---- Satınalma faturası taslakları v1 ----

    [Theory]
    [InlineData("yeniSatirlar", "yeniKabulSatirlari", null)]
    [InlineData("duzenleSatirlar", "duzenleKabulSatirlari", "taslakSatirlari")]
    public void Draft_lines_are_numbered_computed_and_totalled(string grid, string receiptLines, string? fillQuery)
    {
        const string key = "sales-purchase-invoice-drafts";
        var props = Props(key, grid);
        Assert.Equal(("list", "lineNumber", 100, 1), ((string)props["gridMode"]!, (string)props["rowNumberColumn"]!, (int)props["maxRows"]!, (int)props["minRows"]!));
        Assert.Equal(fillQuery, (string?)props["fillQuery"]);
        // Chained formulas: the total uses the rounded parts, so total = subtotal − discount + tax holds on every line (F2-3).
        var formulas = props["formulas"]!.AsObject().ToDictionary(x => x.Key, x => (string)x.Value!);
        Assert.Equal(new Dictionary<string, string>
        {
            ["subtotal"] = "quantity * unitPrice",
            ["taxAmount"] = "(subtotal - discountAmount) * vatRate / 100",
            ["total"] = "subtotal - discountAmount + taxAmount",
        }, formulas);
        Assert.Equal(new[] { "subtotal", "discountAmount", "taxAmount", "total" }, Strings(props["totals"]));
        var columns = Strings(props["gridColumns"]).Select(x => x.Split('|')[0]).ToArray();
        Assert.Equal(12, columns.Length);
        // Every line item of the write is a grid column (the server needs unique positive line numbers: rowNumberColumn).
        var items = Op("satinalma.faturaTaslagi.olustur").Parameters.Single(x => x.Name == "lines").Items!.Select(x => x.Code).ToArray();
        Assert.Equal(items.Order(StringComparer.Ordinal), columns.Order(StringComparer.Ordinal));
        Assert.Contains($"standalonePurchaseReceiptLineId|Mal kabul satırı|lookup:{receiptLines}:lineId:receiptCode:stockName", Strings(props["gridColumns"]));
        Assert.Contains("expenseAccountId|Gider hesabı|lookup:giderHesaplari:id:code:name", Strings(props["gridColumns"]));
        var fills = props["lookupFills"]!.AsObject();
        Assert.Equal(("stockName", "quantity", "unitCode", "unitCostBase"),
            ((string)fills["standalonePurchaseReceiptLineId"]!["description"]!, (string)fills["standalonePurchaseReceiptLineId"]!["quantity"]!,
             (string)fills["standalonePurchaseReceiptLineId"]!["unitCode"]!, (string)fills["standalonePurchaseReceiptLineId"]!["unitPrice"]!));
        Assert.Equal("name", (string)fills["expenseAccountId"]!["description"]!);
        Assert.Equal(("satinalma.faturaTaslagi.giderHesaplari", "satinalma.faturaTaslagi.malKabulSatirlari"), (Operation(key, "giderHesaplari"), Operation(key, receiptLines)));

        // The header amounts are the grid totals.
        var write = grid == "yeniSatirlar" ? "taslakOlustur" : "taslakGuncelle";
        foreach (var (parameter, column) in new[] { ("subtotal", "subtotal"), ("discountTotal", "discountAmount"), ("taxTotal", "taxAmount"), ("grandTotal", "total") })
            Assert.Equal($"{{{{{grid}.toplam.{column}}}}}", Binding(key, write, parameter));
        Assert.Equal($"{{{{{grid}.satirlar}}}}", Binding(key, write, "lines"));
    }

    [Fact]
    public void Draft_create_edit_and_post()
    {
        const string key = "sales-purchase-invoice-drafts";
        Assert.Equal(("satinalma.faturaTaslagi.listele", "{{suzgec.q}}", "{{liste.sayfa}}", "{{liste.sayfaBoyutu}}"),
            (Operation(key, "taslaklar"), Binding(key, "taslaklar", "q"), Binding(key, "taslaklar", "page"), Binding(key, "taslaklar", "pageSize")));
        foreach (var (query, operation) in new[] { ("taslak", "satinalma.faturaTaslagi.getir"), ("taslakSatirlari", "satinalma.faturaTaslagi.satirlari") })
            Assert.Equal((operation, "{{liste.seciliSatir.id}}"), (Operation(key, query), Binding(key, query, "id")));

        // Create: own dialog (fresh inputs, no fill), request key, supplier picker of the draft endpoint.
        Assert.Equal(("taslakOlustur", "satinalma.faturaTaslagi.olustur"), ((string)Props(key, "yeniTaslakPenceresi")["saveQuery"]!, Operation(key, "taslakOlustur")));
        Assert.Equal(("{{yeniIstekKimligi.value}}", "{{yeniTedarikci.value}}", "{{yeniDoviz.value}}"),
            (Binding(key, "taslakOlustur", "requestId"), Binding(key, "taslakOlustur", "supplierId"), Binding(key, "taslakOlustur", "currencyCode")));
        foreach (var (query, picker) in new[] { ("yeniTedarikciler", "yeniTedarikci"), ("duzenleTedarikciler", "duzenleTedarikci") })
        {
            Assert.Equal(("satinalma.faturaTaslagi.tedarikciler", $"{{{{{picker}.search}}}}"), (Operation(key, query), Binding(key, query, "q")));
            Assert.Equal(("{{secenekSayfasi.value}}", "{{secenekBoyutu.value}}"), (Binding(key, query, "page"), Binding(key, query, "pageSize")));
            Assert.Equal(new[] { (picker == "yeniTedarikci" ? "yeniSatirlar" : "duzenleSatirlar") + ".standalonePurchaseReceiptLineId" }, Strings(Props(key, picker)["clearsOnChange"]));
        }
        Assert.Equal(("1", "100"), ((string)Props(key, "secenekSayfasi")["defaultValue"]!, (string)Props(key, "secenekBoyutu")["defaultValue"]!));
        Assert.Equal(("{{yeniTedarikci.value}}", "{{yeniFaturaTarihi.value}}"), (Binding(key, "yeniKabulSatirlari", "supplierId"), Binding(key, "yeniKabulSatirlari", "invoiceDate")));
        Assert.Equal("{{taslak.rows[0].id}}", Binding(key, "duzenleKabulSatirlari", "draftId"));

        // Edit: the saved draft, its row version and its lines; refreshes the record after the save.
        Assert.Equal(("taslakGuncelle", "satinalma.faturaTaslagi.guncelle"), ((string)Props(key, "duzenlePenceresi")["saveQuery"]!, Operation(key, "taslakGuncelle")));
        Assert.Equal(("{{taslak.rows[0].id}}", "{{taslak.rows[0].rowVersion}}"), (Binding(key, "taslakGuncelle", "id"), Binding(key, "taslakGuncelle", "expectedRowVersion")));
        Assert.Equal(new[] { "taslaklar", "taslak", "taslakSatirlari" }, Strings(Props(key, "duzenlePenceresi")["refreshQueries"]));
        foreach (var (input, column) in new[] { ("duzenleTedarikci", "supplierId"), ("duzenleFaturaNo", "invoiceNumber"), ("duzenleFaturaTarihi", "invoiceDate"),
                     ("duzenleVade", "dueDate"), ("duzenleDoviz", "currencyCode"), ("duzenleNotlar", "notes") })
            Assert.Equal($"{{{{taslak.rows[0].{column}}}}}", (string)Props(key, input)["defaultValue"]!);
        foreach (var opener in new[] { "duzenleDugmesi", "duzenleSatir", "detayDuzenle" })
            Assert.Equal(("openDialog", "duzenlePenceresi"), ((string)Props(key, opener)["actionType"]!, (string)Props(key, opener)["dialogId"]!));
        Assert.Equal("liste.seciliSatir.id == null || liste.seciliSatir.status != 'Draft'", (string)Props(key, "duzenleDugmesi")["disabledWhen"]!);

        // Muhasebeleştir: the saved selected draft, confirmed, only while it is a draft.
        Assert.Equal(("satinalma.faturaTaslagi.muhasebelestir", "{{liste.seciliSatir.id}}"), (Operation(key, "muhasebelestir"), Binding(key, "muhasebelestir", "id")));
        foreach (var button in new[] { "muhasebelestirDugmesi", "muhasebelestirSatir" })
        {
            var props = Props(key, button);
            Assert.Equal(("muhasebelestir", true), ((string)props["queryId"]!, (bool)props["confirmEnabled"]!));
            Assert.False(string.IsNullOrWhiteSpace((string?)props["errorMessage"]));
            Assert.Equal(new[] { "taslaklar", "taslak" }, Strings(props["refreshQueries"]));
        }
        Assert.Equal("liste.seciliSatir.id == null || liste.seciliSatir.status != 'Draft'", (string)Props(key, "muhasebelestirDugmesi")["disabledWhen"]!);
        Assert.Equal("liste.seciliSatir.status == 'Draft'", (string)Props(key, "muhasebelestirSatir")["visibleWhen"]!);

        // The legacy screen stays reachable as the last İşlemler command; the invoices page opens this standard.
        var legacy = Assert.Single(Components(Definition(key)), x => (bool?)x["props"]?["legacyScreen"] == true);
        Assert.Equal(("eskiEkranDugmesi", "sales-purchase-invoice-drafts"), ((string)legacy["id"]!, (string)legacy["props"]!["pageKey"]!));
        Assert.Null(legacy["props"]!["params"]);
        Assert.Equal("eskiEkranDugmesi", Strings(Props(key, "komutlar")["moreButtons"]).Last());
        var drafts = Props("sales-purchase-invoices", "taslaklarDugmesi");
        Assert.Equal(("erpPage", "sales-purchase-invoice-drafts"), ((string)drafts["actionType"]!, (string)drafts["pageKey"]!));
        Assert.Null(drafts["legacyScreen"]);

        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(("standalone-invoice-drafts", "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("standalone-invoice-drafts", out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key).Order(StringComparer.Ordinal), view.Fields.Keys.Order(StringComparer.Ordinal));
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Row_and_record_bindings_exist_in_the_bound_operation(string key, string _, int __)
    {
        var definition = Definition(key);
        var operations = Queries(definition).ToDictionary(x => (string)x["id"]!, x => Op((string)x["operation"]!));
        var tables = Components(definition).Where(x => (string?)x["type"] == "dataTable").ToDictionary(x => (string)x["id"]!, x => (string)x["props"]!["query"]!);
        var text = definition.ToJsonString();
        foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(text, @"([A-Za-z_][A-Za-z0-9_]*)\.rows\[0\]\.([A-Za-z0-9_.]+)"))
            Assert.True(operations[match.Groups[1].Value].Result.Columns.Any(x => x.Code == match.Groups[2].Value), match.Value);
        foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(text, @"\b([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir\.([A-Za-z0-9_.]+)"))
            Assert.True(operations[tables[match.Groups[1].Value]].Result.Columns.Any(x => x.Code == match.Groups[2].Value), match.Value);
    }

    // ---- Runtime ----

    [Fact]
    public async Task Standards_load_through_the_system_page_routes_as_preview()
    {
        string[] keys = [.. KeyList().Select(x => x.Key)];
        await using var app = await StartApplicationAsync(enabled: keys);
        using var client = app.GetTestClient();
        SetIdentity(client, Admin, "TenantAdmin");
        var catalog = (await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages"))!.ToDictionary(x => x.GetProperty("screenKey").GetString()!);
        foreach (var (key, title, version) in KeyList())
            Assert.Equal((title, "preview", version), (catalog[key].GetProperty("title").GetString(), catalog[key].GetProperty("stage").GetString(), catalog[key].GetProperty("version").GetInt32()));
        foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Admin, "TenantAdmin") })
        {
            SetIdentity(client, user, role);
            var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
            foreach (var (key, _, version) in KeyList())
            {
                Assert.Equal("standard", screens.GetProperty(key).GetProperty("mode").GetString());
                var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{key}/published");
                Assert.Equal(("@" + key, version), (page.GetProperty("code").GetString(), page.GetProperty("standardVersion").GetInt32()));
                Assert.True(JsonNode.DeepEquals(JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson), JsonNode.Parse(page.GetProperty("definitionJson").GetString()!)), key);
            }
        }
    }

    // ---- Helpers ----

    private static IEnumerable<(string Key, string Title, int Version)> KeyList() => Keys.Select(x => ((string)x[0], (string)x[1], (int)x[2]));

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static IEnumerable<JsonObject> Components(JsonObject definition)
    {
        var stack = new Stack<JsonObject>(definition["components"]!.AsArray().OfType<JsonObject>().Reverse());
        while (stack.Count > 0)
        {
            var component = stack.Pop();
            yield return component;
            if (component["children"] is JsonArray children)
                foreach (var child in children.OfType<JsonObject>().Reverse()) stack.Push(child);
        }
    }

    private static IEnumerable<JsonObject> Queries(JsonObject definition) => definition["queries"]!.AsArray().OfType<JsonObject>();

    private static JsonObject Props(string key, string id) =>
        Components(Definition(key)).Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject? Input(JsonObject definition, string? name) =>
        name is null ? null : Components(definition).SingleOrDefault(x => (string?)x["type"] == "input" && (string?)x["name"] == name);

    private static string? BindingRoot(string binding)
    {
        var path = binding.Trim().TrimStart('{').TrimEnd('}').Trim();
        var dot = path.IndexOf('.');
        return dot > 0 && path.EndsWith(".value", StringComparison.Ordinal) ? path[..dot] : null;
    }

    private static string Operation(string key, string queryId) =>
        (string)Queries(Definition(key)).Single(x => (string)x["id"]! == queryId)["operation"]!;

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Queries(Definition(key)).Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();

    private static async Task<WebApplication> StartApplicationAsync(string[]? enabled = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection((enabled ?? []).Select((key, i) =>
            new KeyValuePair<string, string?>($"SystemPages:StandardEnabled:{i}", key)));
        var suffix = Guid.NewGuid().ToString("N");
        builder.Services.AddDbContext<TenantDbContext>(options => options
            .UseInMemoryDatabase($"purchasing-faz2-document-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"purchasing-faz2-document-platform-{suffix}")
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
