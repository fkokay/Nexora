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
/// Purchasing document system pages, Faz 1 (draft 21): Mal kabulleri, Mal kabul faturası girişi, Satınalma Faturaları and
/// Satınalma İadeleri. The standards validate, bind only catalog operations, guard every write (confirm or a dialog, autoId
/// request keys, an error message), save invoices through the server preview's receipt, and open the legacy screens with the
/// page params their readers take (E-L "legacyScreen").
/// </summary>
public sealed class PurchasingDocumentSystemPagesTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid Mehmet = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");

    public static TheoryData<string, string> Keys => new()
    {
        { "sales-purchase-receipts", "Mal kabulleri" },
        { "sales-purchase-invoice-entry", "Mal kabul faturası girişi" },
        { "sales-purchase-invoices", "Satınalma Faturaları" },
        { "sales-purchase-returns", "Satınalma İadeleri" },
    };

    /// <summary>Versions: receipts v2 and invoices v3 are Liste-template standards (satın alma 1. dalga); returns stays v2.</summary>
    private static readonly Dictionary<string, int> Versions = new(StringComparer.Ordinal)
    {
        ["sales-purchase-receipts"] = 2, ["sales-purchase-invoice-entry"] = 1, ["sales-purchase-invoices"] = 3, ["sales-purchase-returns"] = 2,
    };

    /// <summary>The page params each legacy purchasing screen reads (K7 readers); a legacy command sends only these.</summary>
    private static readonly Dictionary<string, string[]> LegacyReaders = new(StringComparer.Ordinal)
    {
        ["sales-purchase-receipts"] = ["receiptId"],
        ["sales-purchase-invoice-entry"] = ["receiptId"],
        ["sales-purchase-invoices"] = ["supplierId", "purchaseInvoiceId"],
        ["sales-purchase-returns"] = [],
    };

    // ---- Standards ----

    [Fact]
    public void The_four_standards_validate_on_their_own()
    {
        var names = KeyList().Select(x => x.Key + ".json").ToHashSet(StringComparer.Ordinal);
        var files = SystemPageStandards.EmbeddedFiles().Where(x => names.Contains(x.FileName)).ToArray();
        Assert.Equal(4, files.Length);
        var errors = SystemPageStandards.Validate(files);
        Assert.True(errors.Count == 0, string.Join(Environment.NewLine, errors));
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Standard_is_preview_at_its_version_and_validates(string key, string title)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((Versions[key], "preview", title, "Satın Alma"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since >= 1 && x.Since <= Versions[key] && x.Label.Length is > 0 and <= 80, x.Key));
        Assert.Contains(key, StandardMenuEndpoints.PageKeys);
        // Within the schema limits the standards are designed to.
        var definition = Definition(key);
        Assert.InRange(Queries(definition).Count(), 1, 30);
        Assert.All(Components(definition).Where(x => (string?)x["type"] == "dataTable"),
            table => Assert.InRange(Strings(table["props"]!["columns"]).Length, 1, 12));
        Assert.All(Components(definition).Where(x => (string?)x["type"] == "contextPanel"),
            panel => Assert.InRange(Strings(panel["props"]!["fields"]).Length, 1, 12));
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Every_bound_operation_exists_with_its_parameters(string key, string _)
    {
        foreach (var query in Queries(Definition(key)))
        {
            var name = (string)query["operation"]!;
            Assert.True(ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name);
            // Faz 2: the return dialogs also pick a warehouse and its locations.
            Assert.True(name.StartsWith("satinalma.", StringComparison.Ordinal) || name is "depo.listele" or "depo.konumlari", name);
            Assert.Equal(op.Kind == "read" ? "read" : op.PageKind, (string)query["kind"]!);
            var bound = query["parameters"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["name"]!).ToArray();
            Assert.All(bound, parameter => Assert.Contains(op.Parameters, x => x.Name == parameter));
            // Every required parameter is bound (e.g. faturaGirisi.malKabulleri page/pageSize, odemeEkle requestId).
            Assert.All(op.Parameters.Where(x => x.Required), x => Assert.Contains(x.Name, bound));
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
        foreach (var (key, _) in KeyList())
            foreach (var name in Queries(Definition(key)).Select(x => (string)x["operation"]!))
                Assert.True(live.TryGetValue(name, out var allowed) && allowed, $"{key}: {name}");
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Every_write_has_confirm_or_a_dialog_an_auto_request_id_and_an_error_message(string key, string _)
    {
        var definition = Definition(key);
        var components = Components(definition).ToArray();
        foreach (var query in Queries(definition).Where(x => (string)x["kind"]! != "read"))
        {
            var id = (string)query["id"]!;
            var buttons = components.Where(x => (string?)x["type"] == "button" && (string?)x["props"]!["queryId"] == id).ToArray();
            var dialogs = components.Where(x => (string?)x["type"] == "dialog" && (string?)x["props"]!["saveQuery"] == id).ToArray();
            var bars = components.Where(x => (string?)x["type"] == "actionBar" && (string?)x["props"]!["saveQuery"] == id).ToArray();
            Assert.True(buttons.Length + dialogs.Length + bars.Length > 0, $"{key}: '{id}' hiçbir komuta bağlı değil.");
            foreach (var button in buttons)
            {
                var props = button["props"]!;
                Assert.True((bool?)props["confirmEnabled"] == true && !string.IsNullOrWhiteSpace((string?)props["confirmText"]), $"{key}: {button["id"]}");
                // The error alert: the configured text, followed by the server's 400/403/409 text unchanged.
                Assert.False(string.IsNullOrWhiteSpace((string?)props["errorMessage"]), $"{key}: {button["id"]}");
                Assert.False(string.IsNullOrWhiteSpace((string?)props["successMessage"]), $"{key}: {button["id"]}");
            }
            // A dialog or the bar save are the input step of the write: they own required inputs bound to the query. Neither
            // takes errorMessage (button-only); the server's error text reaches the user as is.
            foreach (var owner in dialogs.Concat(bars))
                Assert.Contains(query["parameters"]!.AsArray().OfType<JsonObject>(), x => Input(definition, BindingRoot((string)x["binding"]!))?["props"]?["required"] is not null);
            // A body requestId is a hidden input that keeps a new GUID per attempt.
            foreach (var parameter in query["parameters"]!.AsArray().OfType<JsonObject>().Where(x => (string)x["name"]! == "requestId"))
            {
                var input = Input(definition, BindingRoot((string)parameter["binding"]!));
                Assert.NotNull(input);
                Assert.Equal((true, true), ((bool?)input!["props"]!["autoId"], (bool?)input["props"]!["hidden"]));
                Assert.NotEmpty(dialogs);
                Assert.Contains(input["id"]!.GetValue<string>(), Strings(dialogs[0]["props"]!["contains"]));
            }
            ErpOperationCatalog.TryGet((string)query["operation"]!, out var op);
            Assert.Equal(op.Parameters.Any(x => x.Name == "requestId"), query["parameters"]!.AsArray().OfType<JsonObject>().Any(x => (string)x["name"]! == "requestId"));
        }
    }

    [Fact]
    public void Only_the_payment_and_return_writes_carry_a_request_id()
    {
        var writes = KeyList().SelectMany(x => Queries(Definition(x.Key))).Where(x => (string)x["kind"]! != "read")
            .Where(x => x["parameters"]!.AsArray().OfType<JsonObject>().Any(p => (string)p["name"]! == "requestId"))
            .Select(x => (string)x["operation"]!).Distinct().ToArray();
        Assert.Equal(new[] { "satinalma.fatura.odemeEkle", "satinalma.iade.olustur" }, writes.Order(StringComparer.Ordinal));
        Assert.Equal("{{istekKimligi.value}}", Binding("sales-purchase-invoices", "odemeEkle", "requestId"));
        Assert.Equal("{{iadeKimligi.value}}", Binding("sales-purchase-returns", "iadeOlustur", "requestId"));
    }

    // ---- Mal kabul faturası girişi ----

    [Fact]
    public void Invoice_entry_preselects_the_receipt_previews_on_the_server_and_saves_through_the_receipt()
    {
        const string key = "sales-purchase-invoice-entry";
        Assert.Equal("{{sayfa.parametre.receiptId}}", (string)Props(key, "kabulSecimi")["defaultValue"]!);
        Assert.True((bool)Props(key, "kabulSecimi")["hidden"]!);
        Assert.Equal(new[] { "kabulSecimi.value == null", "kabulSecimi.value != null" }, Strings(Props(key, "adimlar")["activeWhen"]));
        Assert.Equal(new[] { "kabulSecimi={{liste.seciliSatir.id}}" }, Strings(Props(key, "secDugmesi")["assignments"]));

        // The eligible receipts list (page/pageSize are required by the endpoint).
        Assert.Equal("satinalma.faturaGirisi.malKabulleri", Operation(key, "kabuller"));
        Assert.Equal(("{{suzgec.q}}", "{{liste.sayfa}}", "{{liste.sayfaBoyutu}}"),
            (Binding(key, "kabuller", "q"), Binding(key, "kabuller", "page"), Binding(key, "kabuller", "pageSize")));

        // Totals, due date and lines come from the server preview of the chosen receipt, date and profile.
        foreach (var (query, operation) in new[] { ("onizleme", "satinalma.faturaGirisi.onizleme"), ("onizlemeSatirlari", "satinalma.faturaGirisi.onizlemeSatirlari") })
        {
            Assert.Equal(operation, Operation(key, query));
            Assert.Equal(("{{kabulSecimi.value}}", "{{faturaTarihi.value}}", "{{profil.value}}"),
                (Binding(key, query, "id"), Binding(key, query, "invoiceDate"), Binding(key, query, "accountingProfileCode")));
        }
        Assert.Equal("onizlemeSatirlari", (string)Props(key, "satirlar")["query"]!);
        var header = Strings(Props(key, "kabulBasligi")["fields"]);
        Assert.Contains("Genel toplam={{onizleme.rows[0].grandTotal}}", header);
        Assert.Contains("Vade={{onizleme.rows[0].dueDate}}", header);
        Assert.Contains("Vergi={{onizleme.rows[0].taxTotal}}", header);
        Assert.Equal("{{onizleme.error}}", (string)Props(key, "onizlemeHatasi")["text"]!);
        Assert.Equal("satinalma.faturaGirisi.mevzuatProfilleri", Operation(key, "profiller"));
        Assert.Equal("satir.isActive == true && satir.hasTaxRules == true", (string)Props(key, "profil")["optionsWhen"]!);

        // Save: satinalma.malKabul.faturala on the selected receipt, then the invoice list.
        Assert.Equal("satinalma.malKabul.faturala", Operation(key, "faturala"));
        Assert.Equal(("{{kabulSecimi.value}}", "{{faturaNo.value}}", "{{faturaTarihi.value}}", "{{profil.value}}"),
            (Binding(key, "faturala", "id"), Binding(key, "faturala", "code"), Binding(key, "faturala", "invoiceDate"), Binding(key, "faturala", "accountingProfileCode")));
        Assert.Equal("{{belgeUuid.value}}", Binding(key, "faturala", "providerInvoiceUuid"));
        var bar = Props(key, "komutlar");
        Assert.Equal(("faturala", "page", "@sales-purchase-invoices", "sameTab"),
            ((string)bar["saveQuery"]!, (string)bar["afterSaveAction"]!, (string)bar["afterSavePageCode"]!, (string)bar["afterSaveTarget"]!));
        Assert.Contains("save=kabulSecimi.value != null", Strings(bar["commandWhen"]));
        Assert.Equal((true, 64), ((bool)Props(key, "faturaNo")["required"]!, (int)Props(key, "faturaNo")["maxLength"]!));
        Assert.Equal(("{{bugun}}", true), ((string)Props(key, "faturaTarihi")["defaultValue"]!, (bool)Props(key, "faturaTarihi")["required"]!));
    }

    // ---- Mal kabulleri ----

    [Fact]
    public void Receipts_invoice_command_opens_invoice_entry_with_the_receipt()
    {
        const string key = "sales-purchase-receipts";
        foreach (var button in new[] { "faturalaDugmesi", "faturalaSatir" })
        {
            var props = Props(key, button);
            Assert.Equal(("page", "@sales-purchase-invoice-entry"), ((string)props["actionType"]!, (string)props["pageCode"]!));
            Assert.Equal(new[] { "receiptId={{liste.seciliSatir.id}}" }, Strings(props["params"]));
        }
        Assert.Contains("kabul.rows[0].invoice.id != null", (string)Props(key, "faturalaDugmesi")["disabledWhen"]!);
        Assert.Equal("satinalma.malKabul.sayfaliListe", Operation(key, "kabuller"));
        Assert.Equal("{{kabuller.meta.totalCount}}", (string)Props(key, "komutlar")["titleCount"]!);
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, Op("satinalma.malKabul.sayfaliListe").Result.MetaPaths);
        Assert.Equal(("satinalma.malKabul.getir", "satinalma.malKabul.satirlari"), (Operation(key, "kabul"), Operation(key, "kabulSatirlari")));
        Assert.Contains("invoice", Op("satinalma.malKabul.getir").Result.Flatten);
        // Void: confirm on the selected receipt; the menu command waits for the record and is disabled while an invoice is active.
        Assert.Equal(("satinalma.malKabul.iptal", "{{kabul.rows[0].id}}"), (Operation(key, "kabulIptal"), Binding(key, "kabulIptal", "id")));
        Assert.Equal("{{liste.seciliSatir.id}}", Binding(key, "kabulIptalSatir", "id"));
        Assert.Equal("kabul.rows[0].invoice.id != null", (string)Props(key, "iptalMenuDugmesi")["disabledWhen"]!);
        Assert.All(new[] { "acDugmesi", "faturalaSatir", "iptalSatir" }, id => Assert.Equal("rowActions", (string)Props(key, id)["slot"]!));
        Assert.Equal("list", (string)Definition(key)["template"]!["name"]!);
        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(("purchase-receipts", "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("purchase-receipts", out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key), view.Fields.Keys);
    }

    [Fact]
    public void Receipt_links_from_other_pages_open_the_legacy_receipts_screen()
    {
        // The receipts standard opens a receipt from its own list (dialog bound to liste.seciliSatir) and does not read the
        // receiptId page param, so the orders and delivery-notes pages send it to the legacy screen, which does.
        Assert.DoesNotContain("sayfa.parametre.receiptId", SystemPageStandards.All["sales-purchase-receipts"].DefinitionJson);
        Assert.Contains("receiptId", LegacyReaders["sales-purchase-receipts"]);
        foreach (var (key, button, binding) in new[] { ("sales-purchasing", "kabulAcDugmesi", "{{kabulTablosu.seciliSatir.id}}"),
                     ("sales-purchase-delivery-notes", "malKabuluAcDugmesi", "{{liste.seciliSatir.purchaseReceiptId}}") })
        {
            var props = Props(key, button);
            Assert.Equal(("erpPage", "sales-purchase-receipts", true), ((string)props["actionType"]!, (string)props["pageKey"]!, (bool)props["legacyScreen"]!));
            Assert.Equal(new[] { "receiptId=" + binding }, Strings(props["params"]));
        }
    }

    // ---- Satınalma Faturaları ----

    [Fact]
    public void Invoices_show_the_derived_payment_state_outstanding_and_overdue_days()
    {
        const string key = "sales-purchase-invoices";
        var list = Props(key, "liste");
        var columns = Strings(list["columns"]);
        Assert.Contains("paymentState", columns);
        Assert.Contains("displayOutstanding", columns);
        Assert.Contains("overdueDays", columns);
        Assert.DoesNotContain("status", columns);
        Assert.Superset(new HashSet<string> { "paymentState", "overdueDays", "displayOutstanding" },
            new HashSet<string>(Op("satinalma.fatura.listele").Result.Columns.Select(x => x.Code)));
        var labels = Strings(list["valueLabels"]);
        foreach (var label in new[] { "paymentState:Voided=İptal", "paymentState:Paid=Ödendi", "paymentState:Overdue=Vadesi geçti",
                     "paymentState:Partial=Kısmen ödendi", "paymentState:Posted=İşlendi", "overdueDays:0=—" })
            Assert.Contains(label, labels);
        var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
        Assert.Equal(("paymentState", "displayOutstanding"), (view.Fields["status"], view.Fields["outstandingAmount"]));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("purchase-invoices", out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key).Order(StringComparer.Ordinal), view.Fields.Keys.Order(StringComparer.Ordinal));
        Assert.Equal("faturalar.satir.paymentState == 'Overdue'", (string)Props(key, "vadesiGecenGostergesi")["countWhen"]!);
        Assert.Contains("Kalan={{fatura.rows[0].displayOutstanding}}", Strings(Props(key, "belgeBasligi")["fields"]));
        Assert.Equal("list", (string)Definition(key)["template"]!["name"]!);

        // Opened from Cari Hesaplar with ?supplierId= (a removable filter).
        Assert.Equal(("{{sayfa.parametre.supplierId}}", "{{suzgec.q}}"), (Binding(key, "faturalar", "supplierId"), Binding(key, "faturalar", "q")));
        Assert.Equal("sayfa.parametre.supplierId != null", (string)Props(key, "tedarikciNotu")["visibleWhen"]!);
        var bar = Props(key, "komutlar");
        Assert.Equal(("page", "@sales-purchase-invoice-entry"), ((string)bar["newAction"]!, (string)bar["newPageCode"]!));

        // The document reads lines, payments and returns of the selected invoice.
        foreach (var (query, operation) in new[] { ("fatura", "satinalma.fatura.getir"), ("faturaSatirlari", "satinalma.fatura.satirlari"),
                     ("odemeler", "satinalma.fatura.odemeleri"), ("iadeler", "satinalma.fatura.iadeleri") })
            Assert.Equal((operation, "{{liste.seciliSatir.id}}"), (Operation(key, query), Binding(key, query, "id")));
        Assert.Equal(new[] { "Satırlar=belgeSatirlari", "Ödemeler {{odemeler.satirSayisi}}=belgeOdemeleri,odemeIptalNotu", "İadeler {{iadeler.satirSayisi}}=belgeIadeleri" },
            Strings(Props(key, "belgeSekmeleri")["tabs"]));
        // Void: disabled while payments exist; the server's 409 covers returns and journal entries.
        foreach (var button in new[] { "iptalMenuDugmesi", "iptalSatir" })
            Assert.Equal("liste.seciliSatir.paidAmount > 0", (string)Props(key, button)["disabledWhen"]!);
    }

    [Fact]
    public void Invoice_payment_dialog_and_payment_void()
    {
        const string key = "sales-purchase-invoices";
        var dialog = Props(key, "odemePenceresi");
        Assert.Equal(("odemeEkle", true, true), ((string)dialog["saveQuery"]!, (bool)dialog["resetOnOpen"]!, (bool)dialog["closeOnSave"]!));
        Assert.Contains("istekKimligi", Strings(dialog["contains"]));
        Assert.Equal(("{{fatura.rows[0].id}}", "{{odemeTarihi.value}}", "{{tutar.value}}", "{{yontem.value}}", "{{hesap.value}}"),
            (Binding(key, "odemeEkle", "id"), Binding(key, "odemeEkle", "paymentDate"), Binding(key, "odemeEkle", "amount"),
             Binding(key, "odemeEkle", "paymentMethod"), Binding(key, "odemeEkle", "financialAccountId")));
        Assert.Equal("satinalma.fatura.odemeHesaplari", Operation(key, "hesaplar"));
        var account = Props(key, "hesap");
        Assert.Equal("hesaplar", (string)account["optionsQuery"]!);
        Assert.Contains("satir.currencyCode == fatura.rows[0].currencyCode", (string)account["optionsWhen"]!);
        Assert.Equal("yontem.value in ['Cash', 'Bank transfer']", (string)account["requiredWhen"]!);
        Assert.Equal(new[] { "hesap" }, Strings(Props(key, "yontem")["clearsOnChange"]));
        Assert.Equal(new[] { "Bank transfer=Havale / EFT", "Cash=Nakit", "Card=Kart", "Check=Çek" }, Strings(Props(key, "yontem")["staticOptions"]));
        foreach (var opener in new[] { "odemeEkleDugmesi", "odemeEkleSatir" })
            Assert.Equal(("openDialog", "odemePenceresi"), ((string)Props(key, opener)["actionType"]!, (string)Props(key, opener)["dialogId"]!));

        // Ödeme iptal is a per-payment row action with confirm.
        Assert.Equal(("satinalma.fatura.odemeIptal", "{{belgeOdemeleri.seciliSatir.id}}"), (Operation(key, "odemeIptal"), Binding(key, "odemeIptal", "id")));
        Assert.Equal(new[] { "odemeIptalSatir" }, Strings(Props(key, "belgeOdemeleri")["rowActions"]));
        Assert.Equal("belgeOdemeleri.seciliSatir.status == 'Posted'", (string)Props(key, "odemeIptalSatir")["visibleWhen"]!);
    }

    // ---- Satınalma İadeleri ----

    [Fact]
    public void Returns_list_document_and_void()
    {
        const string key = "sales-purchase-returns";
        Assert.Equal(("satinalma.iade.listele", "{{suzgec.q}}"), (Operation(key, "iadeler"), Binding(key, "iadeler", "q")));
        Assert.Equal(("satinalma.iade.getir", "satinalma.iade.satirlari"), (Operation(key, "iade"), Operation(key, "iadeSatirlari")));
        Assert.Equal(("satinalma.iade.iptal", "{{iade.rows[0].id}}"), (Operation(key, "iadeIptal"), Binding(key, "iadeIptal", "id")));
        Assert.Equal("{{liste.seciliSatir.id}}", Binding(key, "iadeIptalSatir", "id"));
        Assert.Equal("liste.seciliSatir.status == 'Posted'", (string)Props(key, "iptalSatir")["visibleWhen"]!);
        Assert.Empty(SystemPageStandards.All[key].ScreenViews);
    }

    // ---- Legacy screens (E-L) ----

    public static TheoryData<string, string, string, string[]> LegacyCommands => new()
    {
        { "sales-purchase-receipts", "faturaAcDugmesi", "sales-purchase-invoices", ["purchaseInvoiceId={{kabul.rows[0].invoice.id}}"] },
        { "sales-purchase-invoice-entry", "eskiEkranDugmesi", "sales-purchase-invoice-entry", ["receiptId={{kabulSecimi.value}}"] },
        { "sales-purchase-returns", "eskiEkranDugmesi", "sales-purchase-returns", [] },
        { "sales-purchase-returns", "faturaAcDugmesi", "sales-purchase-invoices", ["purchaseInvoiceId={{liste.seciliSatir.purchaseInvoiceId}}"] },
    };

    [Theory]
    [MemberData(nameof(LegacyCommands))]
    public void Legacy_command_opens_the_legacy_screen_with_its_params(string key, string button, string pageKey, string[] parameters)
    {
        var props = Props(key, button);
        Assert.Equal(("erpPage", pageKey, true), ((string)props["actionType"]!, (string)props["pageKey"]!, (bool)props["legacyScreen"]!));
        Assert.Equal(parameters, props["params"] is null ? [] : Strings(props["params"]));
    }

    [Theory]
    [MemberData(nameof(Keys))]
    public void Every_legacy_command_sends_only_params_its_screen_reads(string key, string _)
    {
        var definition = Definition(key);
        var legacy = Components(definition).Where(x => (bool?)x["props"]?["legacyScreen"] == true).ToArray();
        // Receipts and invoices are Liste-template standards (satın alma 1. dalga): no "Eski ekranda aç" command any more.
        if (key is "sales-purchase-receipts" or "sales-purchase-invoices")
            Assert.DoesNotContain(legacy, x => (string?)x["props"]!["text"] == "Eski ekranda aç");
        else
        {
            Assert.NotEmpty(legacy);
            // "Eski ekranda aç": the page's own legacy screen, as the last İşlemler command.
            var own = Assert.Single(legacy, x => (string?)x["props"]!["text"] == "Eski ekranda aç");
            Assert.Equal(key, (string)own["props"]!["pageKey"]!);
            Assert.Equal("eskiEkranDugmesi", Strings(Props(key, "komutlar")["moreButtons"]).Last());
        }
        Assert.Equal(LegacyCommands.Count(x => (string)x[0] == key), legacy.Length);
        foreach (var button in legacy)
        {
            var props = button["props"]!;
            Assert.Equal("erpPage", (string)props["actionType"]!);
            var readers = LegacyReaders[(string)props["pageKey"]!];
            var names = props["params"] is null ? [] : Strings(props["params"]).Select(x => x.Split('=', 2)[0]).ToArray();
            Assert.All(names, name => Assert.Contains(name, readers));
        }
    }

    // ---- Runtime ----

    [Fact]
    public async Task Standards_load_through_the_system_page_routes_as_preview()
    {
        string[] keys = [.. KeyList().Select(x => x.Key)];
        await using (var app = await StartApplicationAsync())
        {
            using var client = app.GetTestClient();
            SetIdentity(client, Admin, "TenantAdmin");
            var catalog = (await client.GetFromJsonAsync<JsonElement[]>("/api/system-pages"))!.ToDictionary(x => x.GetProperty("screenKey").GetString()!);
            foreach (var (key, title) in KeyList())
            {
                Assert.True(catalog.TryGetValue(key, out var entry), key);
                Assert.Equal((title, "preview", Versions[key]), (entry.GetProperty("title").GetString(), entry.GetProperty("stage").GetString(), entry.GetProperty("version").GetInt32()));
            }
            // Preview: the legacy screen stays the default.
            var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
            Assert.All(keys, key => Assert.False(screens.TryGetProperty(key, out _), key));
        }
        await using (var app = await StartApplicationAsync(enabled: keys))
        {
            using var client = app.GetTestClient();
            foreach (var (user, role) in new[] { (Mehmet, "TenantUser"), (Admin, "TenantAdmin") })
            {
                SetIdentity(client, user, role);
                var screens = (await client.GetFromJsonAsync<JsonElement>("/api/system-pages/runtime")).GetProperty("screens");
                foreach (var key in keys)
                {
                    Assert.Equal("standard", screens.GetProperty(key).GetProperty("mode").GetString());
                    var page = await client.GetFromJsonAsync<JsonElement>($"/api/system-pages/{key}/published");
                    Assert.Equal(("@" + key, Versions[key]), (page.GetProperty("code").GetString(), page.GetProperty("standardVersion").GetInt32()));
                    var definitionJson = page.GetProperty("definitionJson").GetString()!;
                    Assert.True(JsonNode.DeepEquals(JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson), JsonNode.Parse(definitionJson)), key);
                    Assert.DoesNotContain("\"sql\"", definitionJson);
                }
            }
        }
    }

    // ---- Helpers ----

    private static IEnumerable<(string Key, string Title)> KeyList() => Keys.Select(x => ((string)x[0], (string)x[1]));

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    /// <summary>Every component at any depth (card children included).</summary>
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

    /// <summary>"{{istekKimligi.value}}" → "istekKimligi".</summary>
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
            .UseInMemoryDatabase($"purchasing-document-standard-tenant-{suffix}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options
            .UseInMemoryDatabase($"purchasing-document-standard-platform-{suffix}")
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
