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
/// Finans system pages (Kasalar, Bankalar, Kasa/Banka kartı, Mizan, Hesap Planı, Yevmiye Defterleri, Yevmiye Fişi): the finans.*
/// ERP operations, the catalog fixedQuery (E1), editableGrid totals (E2), the server additions (account type filter and summary,
/// single ledger account read, trial balance level/movedOnly, top-level totalCount members, computed flags) and the standards.
/// The manual entry and reversal handlers take SQL row locks, so their rule pieces are tested as pure functions here (the
/// SQL acceptance tests cover the routes).
/// </summary>
public sealed class FinanceSystemPagesTests
{
    private static readonly Guid TenantA = ErpOperationCatalogTests.TenantA;
    private static readonly Guid CashA = Guid.Parse("f0000000-0000-0000-0000-000000000001");
    private static readonly Guid CashB = Guid.Parse("f0000000-0000-0000-0000-000000000002");
    private static readonly Guid BankEur = Guid.Parse("f0000000-0000-0000-0000-000000000003");
    private static readonly Guid BankNegative = Guid.Parse("f0000000-0000-0000-0000-000000000004");
    private static readonly Guid OtherTenantAccount = Guid.Parse("f0000000-0000-0000-0000-000000000009");
    private static readonly Guid ManualMovement = Guid.Parse("e0000000-0000-0000-0000-000000000001");
    private static readonly Guid ManualReversed = Guid.Parse("e0000000-0000-0000-0000-000000000002");
    private static readonly Guid ReversalRow = Guid.Parse("e0000000-0000-0000-0000-000000000003");
    private static readonly Guid TransferOut = Guid.Parse("e0000000-0000-0000-0000-000000000004");
    private static readonly Guid OpeningRow = Guid.Parse("e0000000-0000-0000-0000-000000000005");
    private static readonly Guid TransferId = Guid.Parse("d0000000-0000-0000-0000-000000000001");

    internal static readonly string[] Keys =
        ["finance-accounts", "finance-banks", "finance-account-create", "finance-trial-balance", "finance-ledger-chart",
         "finance-journal-ledger"];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_the_finance_operations_in_the_finans_module()
    {
        var finance = ErpOperationCatalog.All.Where(x => x.Name.StartsWith("finans.", StringComparison.Ordinal)).ToArray();
        Assert.Equal(31, finance.Length);
        Assert.All(finance, op =>
        {
            Assert.Equal(("Finans", false), (op.Module, op.Deprecated));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
        });
        var admin = finance.Where(x => x.RequiresTenantAdmin).Select(x => x.Name).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(new[] { "finans.fis.olustur", "finans.fis.tersKayit", "finans.hareket.nakitAkisi", "finans.muhasebe.hesap.aktifEt",
            "finans.muhasebe.hesap.guncelle", "finans.muhasebe.hesap.olustur", "finans.muhasebe.hesap.pasifeAl", "finans.muhasebe.hesap.sil",
            "finans.muhasebe.tekDuzen.uygula" }, admin);

        Assert.Equal(new[] { "type:query:text:False" }, Op("finans.hesap.listele").Parameters.Select(Shape));
        Assert.Equal(("GET", "/api/finance/accounts/summary"), (Op("finans.hesap.ozet").Method, Op("finans.hesap.ozet").Route));
        Assert.Equal(new[] { "accountCount", "activeCount", "inactiveCount", "negativeBalanceCount", "currencyCount", "totalBalance", "currencyCode" },
            Op("finans.hesap.ozet").Result.Columns.Select(x => x.Code));
        var statement = Op("finans.hesap.ekstre");
        Assert.Equal(("transactions", "/api/finance/accounts/{id}"), (statement.Result.RowsPath, statement.Route));
        Assert.Contains("totalCount", statement.Result.MetaPaths);
        Assert.Contains("pageInflow", statement.Result.MetaPaths);
        Assert.Equal(new[] { "inflow", "outflow", "sourceKind", "isReversal", "isReversed", "canVoid", "canVoidTransfer", "canChangeCashFlow" },
            statement.Result.Columns.TakeLast(8).Select(x => x.Code));
        var update = Op("finans.hesap.guncelle");
        Assert.Equal(("PUT", "finans.hesap.getir", 0m), (update.Method, update.SourceOperation, (decimal)update.FixedBody!["openingBalance"]!));
        Assert.DoesNotContain(update.Parameters, x => x.Name == "openingBalance" || x.In == "body" && x.Required);
        // The account list's "type" keeps its own label here (the shared code is "Cari türü" for customers).
        Assert.Equal("Hesap türü", Op("finans.hesap.listele").Result.Columns.Single(x => x.Code == "type").Label);
        Assert.Equal("Cari türü", Op("cari.listele").Result.Columns.Single(x => x.Code == "type").Label);
    }

    [Fact]
    public void Status_changes_fix_isActive_in_the_query_and_voids_bind_two_route_parameters()
    {
        foreach (var (name, active) in new[] { ("finans.hesap.pasifeAl", false), ("finans.hesap.aktifEt", true) })
        {
            var op = Op(name);
            Assert.Equal(("POST", "/api/finance/accounts/{id}/status", "update"), (op.Method, op.Route, op.PageKind));
            Assert.Equal(new[] { "id:route:guid:True" }, op.Parameters.Select(Shape));
            Assert.Equal(new Dictionary<string, object?> { ["isActive"] = active }, op.FixedQuery);
            Assert.Null(op.FixedBody);
        }
        // The Dış Ticaret order options also fix their direction in the query (ForeignTradeSystemPagesTests);
        // satinalma.faturaTaslagi.giderHesaplari fixes its expense filter (PurchasingErpOperationCatalogTests).
        Assert.All(ErpOperationCatalog.All.Where(x => x.Name is not ("finans.hesap.pasifeAl" or "finans.hesap.aktifEt"
            or "disTicaret.siparis.ithalatSecenekleri" or "disTicaret.siparis.ihracatSecenekleri" or "satinalma.faturaTaslagi.giderHesaplari")),
            x => Assert.Null(x.FixedQuery));

        // G-F8: neither void has a source read, so both route parameters are required bindings of the page.
        var voidMovement = Op("finans.hareket.iptal");
        Assert.Equal(("/api/finance/accounts/{id}/transactions/{transactionId}/void", null), (voidMovement.Route, voidMovement.SourceOperation));
        Assert.Equal(new[] { "id:route:guid:True", "transactionId:route:guid:True" }, voidMovement.Parameters.Select(Shape));
        Assert.Equal(new[] { "id:route:guid:True", "transactionId:route:guid:True", "cashFlowCategory:body:text:True" },
            Op("finans.hareket.nakitAkisi").Parameters.Select(Shape));
        Assert.Equal(new[] { "transferId:route:guid:True" }, Op("finans.transfer.iptal").Parameters.Select(Shape));
        Assert.Equal("/api/finance/transfers/{transferId}/void", Op("finans.transfer.iptal").Route);
        Assert.Equal("Kasa/banka döviz transferi", Op("finans.transfer.olustur").FixedBody!["description"]);
        Assert.DoesNotContain(Op("finans.transfer.olustur").Parameters, x => x.Name == "description");
        // Idempotent writes carry a required requestId (the page's autoId input).
        Assert.Contains(Op("finans.hareket.ekle").Parameters, x => x is { Name: "requestId", Type: "guid", Required: true });
        Assert.Contains(Op("finans.transfer.olustur").Parameters, x => x is { Name: "requestId", Type: "guid", Required: true });
    }

    [Fact]
    public void Ledger_and_journal_operations_follow_the_server_contract()
    {
        Assert.Equal(new[] { "from:query:date:True", "to:query:date:True", "basis:query:text:False", "level:query:text:False", "movedOnly:query:bool:False" },
            Op("finans.mizan").Parameters.Select(Shape));
        Assert.Equal("accounts", Op("finans.mizan").Result.RowsPath);
        Assert.Contains("isBalanced", Op("finans.mizan").Result.MetaPaths);
        Assert.Contains(Op("finans.mizan").Result.Columns, x => x.Code == "accountClass");
        var muavin = Op("finans.muhasebe.muavin");
        Assert.Equal(("/api/finance/general-ledger/accounts/{accountId}/statement", "lines"), (muavin.Route, muavin.Result.RowsPath));
        Assert.Equal(("GET", "/api/finance/general-ledger/accounts/{id}"), (Op("finans.muhasebe.hesap.getir").Method, Op("finans.muhasebe.hesap.getir").Route));
        Assert.Equal("finans.muhasebe.hesap.getir", Op("finans.muhasebe.hesap.guncelle").SourceOperation);
        Assert.Equal(true, Op("finans.muhasebe.hesap.olustur").FixedBody!["isActive"]);
        Assert.Equal(false, Op("finans.muhasebe.hesap.pasifeAl").FixedBody!["isActive"]);
        Assert.DoesNotContain(Op("finans.muhasebe.hesap.guncelle").Parameters, x => x.Name == "isActive");

        Assert.Equal(new[] { "page", "pageSize", "total", "totalCount" }, Op("finans.fis.listele").Result.MetaPaths);
        Assert.Contains(Op("finans.fis.listele").Result.Columns, x => x.Code == "canReverse");
        Assert.Contains(Op("finans.fis.getir").Result.Columns, x => x.Code == "reversedByEntryCode");
        Assert.Equal("lines", Op("finans.fis.satirlari").Result.RowsPath);
        var post = Op("finans.fis.olustur");
        Assert.Equal(new[] { "entryDate:body:date:True", "description:body:text:True", "accountingBasis:body:text:False", "lines:body:list:False" },
            post.Parameters.Select(Shape));
        // G-F5: only the account is a required line field; an empty description takes the entry's, an empty side is 0.
        Assert.Equal(new[] { "accountId:True", "description:False", "debit:False", "credit:False" },
            post.Parameters.Single(x => x.Name == "lines").Items!.Select(x => $"{x.Code}:{x.Required}"));
        Assert.Equal(new[] { "id:route:guid:True", "entryDate:body:date:True", "reason:body:text:True" }, Op("finans.fis.tersKayit").Parameters.Select(Shape));
    }

    [Theory]
    [InlineData("isActive", false, null)]
    [InlineData("flag_2", "x", null)]
    [InlineData("count", 3, null)]
    [InlineData("id", false, "aynı zamanda bir parametre")]
    [InlineData("ID", false, "aynı zamanda bir parametre")]
    [InlineData("is-active", false, "tanımlayıcı")]
    [InlineData("isActive", null, "bool, sayı veya metin")]
    public void FixedQuery_shape_rules(string key, object? value, string? expected)
    {
        var op = new ErpOperation("test.op", "Test", "Test", "write", "update", "POST", "/api/test/{id}", [new ErpOperationParameter("id", "route", "guid", true)],
            new ErpOperationResult("none", null, []), null, null, "2026-11-21") { FixedQuery = new Dictionary<string, object?> { [key] = value } };
        var error = ErpOperationCatalog.ParameterShapeError(op);
        if (expected is null) Assert.Null(error);
        else Assert.Contains(expected, error);
    }

    [Fact]
    public async Task Catalog_endpoint_exposes_fixedQuery_and_admin_may_run_every_finance_operation()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var operations = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operations").EnumerateArray()
            .ToDictionary(x => x.GetProperty("name").GetString()!);
        // Every route (and its permission) resolves: a mismatched route token would leave allowed false even for an admin.
        Assert.All(operations.Where(x => x.Key.StartsWith("finans.", StringComparison.Ordinal)), x => Assert.True(x.Value.GetProperty("allowed").GetBoolean(), x.Key));
        Assert.False(operations["finans.hesap.pasifeAl"].GetProperty("fixedQuery").GetProperty("isActive").GetBoolean());
        Assert.True(operations["finans.hesap.aktifEt"].GetProperty("fixedQuery").GetProperty("isActive").GetBoolean());
        // Null fixedQuery is left out of the wire (older operation fixtures stay equal).
        Assert.False(operations["finans.hesap.listele"].TryGetProperty("fixedQuery", out _));

        // A TenantUser without rules may run none; the handler-only TenantAdmin operations stay closed even with an Allow rule.
        ErpOperationCatalogTests.SetIdentity(client, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "TenantUser");
        using var userResponse = await client.GetAsync("/api/custom-pages/erp-operations");
        if (userResponse.StatusCode == HttpStatusCode.OK)
        {
            var user = (await userResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operations").EnumerateArray()
                .ToDictionary(x => x.GetProperty("name").GetString()!, x => x.GetProperty("allowed").GetBoolean());
            foreach (var name in new[] { "finans.fis.olustur", "finans.fis.tersKayit", "finans.hareket.nakitAkisi", "finans.muhasebe.hesap.olustur" })
                Assert.False(user[name], name);
        }
    }

    [Theory]
    [InlineData("GET", "/api/finance/accounts/summary", "erp.finance-accounts.read")]
    [InlineData("GET", "/api/finance/general-ledger/accounts/{id}", "erp.general-ledger.read")]
    [InlineData("POST", "/api/finance/accounts/{id}/status", "erp.finance-accounts.create")]
    [InlineData("POST", "/api/finance/accounts/{id}/transactions/{transactionId}/void", "erp.finance-accounts.execute")]
    [InlineData("POST", "/api/finance/transfers/{transferId}/void", "erp.financial-transfers.execute")]
    [InlineData("POST", "/api/finance/general-ledger/entries/manual", "erp.general-ledger.create")]
    [InlineData("POST", "/api/finance/general-ledger/entries/{id}/reverse", "erp.general-ledger.execute")]
    public void New_and_used_routes_resolve_to_the_expected_permission(string method, string route, string permission)
    {
        var path = route.Replace("{id}", Guid.Empty.ToString("D")).Replace("{transactionId}", Guid.Empty.ToString("D")).Replace("{transferId}", Guid.Empty.ToString("D"));
        Assert.True(PlatformPermissionCatalog.TryResolve(path, method, route, new Dictionary<string, string?>(), TenantA, ErpOperationCatalogTests.Admin,
            "TenantUser", out var resolved));
        Assert.Equal(permission, resolved!.Permission.Code);
    }

    // ---- Computed members ----

    [Fact]
    public void Transaction_flags_mirror_the_void_and_classification_handlers()
    {
        static FinancialAccountTransactionView View(string kind, bool reversed = false, Guid? transferId = null, Guid? reversalOf = null,
            CashFlowCategory category = CashFlowCategory.Operating, FinancialDirection direction = FinancialDirection.Inflow) =>
            new(Guid.NewGuid(), new DateOnly(2026, 11, 1), direction, 10m, "TRY", "x", null, null, null, reversalOf, DateTimeOffset.UtcNow, transferId, category)
            { SourceKind = kind, IsReversed = reversed };
        var manual = View(FinancialTransactionSourceKinds.Manual);
        Assert.Equal((true, false, true, 10m, (decimal?)null), (manual.CanVoid, manual.CanVoidTransfer, manual.CanChangeCashFlow, manual.Inflow!.Value, manual.Outflow));
        Assert.False(View(FinancialTransactionSourceKinds.Manual, reversed: true).CanVoid);
        var reversal = View(FinancialTransactionSourceKinds.Reversal, reversalOf: Guid.NewGuid(), direction: FinancialDirection.Outflow);
        Assert.Equal((false, true, 10m), (reversal.CanVoid, reversal.IsReversal, reversal.Outflow!.Value));
        var transfer = View(FinancialTransactionSourceKinds.Transfer, transferId: Guid.NewGuid(), category: CashFlowCategory.InternalTransfer);
        Assert.Equal((false, true, false), (transfer.CanVoid, transfer.CanVoidTransfer, transfer.CanChangeCashFlow));
        Assert.False(View(FinancialTransactionSourceKinds.Transfer, reversed: true, transferId: Guid.NewGuid()).CanVoidTransfer);
        Assert.False(View(FinancialTransactionSourceKinds.Opening, category: CashFlowCategory.OpeningBalance).CanChangeCashFlow);
        // A transfer reversal row has no transfer id but keeps the InternalTransfer category: still locked.
        Assert.False(View(FinancialTransactionSourceKinds.Reversal, reversalOf: Guid.NewGuid(), category: CashFlowCategory.InternalTransfer).CanChangeCashFlow);
        Assert.False(View(FinancialTransactionSourceKinds.CreditFacility).CanVoid);
        var json = JsonSerializer.SerializeToElement(manual, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(("Manual", true), (json.GetProperty("sourceKind").GetString(), json.GetProperty("canVoid").GetBoolean()));
    }

    [Theory]
    [InlineData("Manual", false, true, false)]
    [InlineData("SalesInvoice", false, true, true)]
    [InlineData("CustomerCollection", false, true, true)]
    [InlineData("InventoryCostAdjustment", false, true, true)]
    [InlineData("SalesInvoice", true, false, true)]
    [InlineData("ManualReversal", false, false, true)]
    [InlineData("FiscalYearClose", false, false, true)]
    [InlineData("FiscalYearOpening", false, false, true)]
    [InlineData("PaymentInstrumentEvent", false, false, true)]
    [InlineData("FixedAssetDepreciation", false, false, true)]
    public void Entry_flags_use_the_reverse_handlers_source_set(string sourceType, bool reversed, bool canReverse, bool sourced)
    {
        var view = new JournalEntryView(Guid.NewGuid(), "YV-1", new DateOnly(2026, 11, 1), "x", sourceType, Guid.NewGuid(), DateTimeOffset.UtcNow,
            10m, 10m, [], reversed);
        var row = new JournalEntryListItem(Guid.NewGuid(), "YV-1", new DateOnly(2026, 11, 1), "x", sourceType, Guid.NewGuid(), DateTimeOffset.UtcNow,
            "TDHP", 10m, 10m, reversed);
        Assert.Equal((canReverse, sourced), (view.CanReverse, view.IsSourced));
        Assert.Equal((canReverse, sourced), (row.CanReverse, row.IsSourced));
        Assert.Equal(sourceType == "ManualReversal", view.IsReversal);
        Assert.NotEqual("", view.SourceLabel);
    }

    [Fact]
    public void Paging_totals_and_classes_are_members_outside_the_constructors()
    {
        var detail = new FinancialAccountDetail(Guid.NewGuid(), "K", "Kasa", FinancialAccountType.Cash, "TRY", true, 5m, DateTimeOffset.UtcNow,
            [new FinancialAccountTransactionView(Guid.NewGuid(), new DateOnly(2026, 1, 1), FinancialDirection.Inflow, 7m, "TRY", "a", null, null, null, null, DateTimeOffset.UtcNow),
             new FinancialAccountTransactionView(Guid.NewGuid(), new DateOnly(2026, 1, 1), FinancialDirection.Outflow, 2m, "TRY", "b", null, null, null, null, DateTimeOffset.UtcNow)],
            1, 50, 120);
        Assert.Equal((120, 7m, 2m), (detail.TotalCount, detail.PageInflow, detail.PageOutflow));
        Assert.Equal(26, new JournalEntryPage([], 1, 50, 26).TotalCount);
        var json = JsonSerializer.SerializeToElement(new JournalEntryPage([], 1, 50, 26), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal((26, 26), (json.GetProperty("total").GetInt32(), json.GetProperty("totalCount").GetInt32()));
        Assert.Equal("1", new LedgerAccountView(Guid.NewGuid(), "100.001", "Kasa", true, "Asset").AccountClass);
        Assert.Equal(("100", "100", "60", ""), (LedgerAccountRules.MainAccountCode("100.001"), LedgerAccountRules.MainAccountCode("1001"),
            LedgerAccountRules.MainAccountCode("60"), LedgerAccountRules.AccountClass(" ")));
        // The catalog columns come from the constructors; the computed members are declared only by the finans.* operations.
        Assert.DoesNotContain(Op("finans.hesap.listele").Result.Columns, x => x.Code == "canVoid");
        Assert.Contains(Op("finans.hesap.getir").Result.Columns, x => x.Code == "totalCount");
    }

    [Theory]
    [InlineData(null, "Satır", "Satır")]
    [InlineData("", "Fiş açıklaması", "Fiş açıklaması")]
    [InlineData("   ", "Fiş açıklaması", "Fiş açıklaması")]
    [InlineData(" Kira ", "Fiş açıklaması", "Kira")]
    public void Empty_manual_line_description_takes_the_entry_description(string? line, string entry, string expected)
    {
        var request = new ManualJournalLineWriteRequest(Guid.NewGuid(), line, 10m);
        Assert.Equal(expected, LedgerAccountApiSupport.ManualJournalLineDescription(request, entry == "Satır" ? "Satır" : entry));
        // The grid omits empty cells: a line without description and credit still deserializes (credit 0).
        var parsed = JsonSerializer.Deserialize<ManualJournalLineWriteRequest>($$"""{"accountId":"{{Guid.Empty:D}}","debit":5}""",
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(((string?)null, 5m, 0m), (parsed.Description, parsed.Debit, parsed.Credit));
    }

    // ---- Endpoints ----

    [Fact]
    public async Task Account_list_filters_by_type_and_summary_reports_single_currency_totals_only()
    {
        await using var factory = await SeededAsync();
        using var client = AdminClient(factory);

        var cash = await client.GetFromJsonAsync<JsonElement>("/api/finance/accounts?type=Cash");
        Assert.Equal<IEnumerable<string?>>(new[] { "K-01", "K-02" }, cash.EnumerateArray().Select(x => x.GetProperty("code").GetString()));
        var bank = await client.GetFromJsonAsync<JsonElement>("/api/finance/accounts?type=bank");
        Assert.Equal<IEnumerable<string?>>(new[] { "B-EUR", "B-NEG" }, bank.EnumerateArray().Select(x => x.GetProperty("code").GetString()));
        Assert.Equal(4, (await client.GetFromJsonAsync<JsonElement>("/api/finance/accounts")).GetArrayLength());
        using var invalid = await client.GetAsync("/api/finance/accounts?type=1");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var cashSummary = await client.GetFromJsonAsync<JsonElement>("/api/finance/accounts/summary?type=Cash");
        Assert.Equal((2, 1, 1, 0, 1, 70m, "TRY"), (cashSummary.GetProperty("accountCount").GetInt32(), cashSummary.GetProperty("activeCount").GetInt32(),
            cashSummary.GetProperty("inactiveCount").GetInt32(), cashSummary.GetProperty("negativeBalanceCount").GetInt32(),
            cashSummary.GetProperty("currencyCount").GetInt32(), cashSummary.GetProperty("totalBalance").GetDecimal(),
            cashSummary.GetProperty("currencyCode").GetString()));
        var bankSummary = await client.GetFromJsonAsync<JsonElement>("/api/finance/accounts/summary?type=Bank");
        Assert.Equal((2, 1, 2), (bankSummary.GetProperty("accountCount").GetInt32(), bankSummary.GetProperty("negativeBalanceCount").GetInt32(),
            bankSummary.GetProperty("currencyCount").GetInt32()));
        Assert.Equal(JsonValueKind.Null, bankSummary.GetProperty("totalBalance").ValueKind);
        Assert.Equal(JsonValueKind.Null, bankSummary.GetProperty("currencyCode").ValueKind);
        using var invalidSummary = await client.GetAsync("/api/finance/accounts/summary?type=Kasa");
        Assert.Equal(HttpStatusCode.BadRequest, invalidSummary.StatusCode);
    }

    [Fact]
    public async Task Account_read_returns_totalCount_page_sums_and_movement_flags()
    {
        await using var factory = await SeededAsync();
        using var client = AdminClient(factory);
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/finance/accounts/{CashA:D}?page=1&pageSize=50");
        Assert.Equal((5, 5), (detail.GetProperty("totalCount").GetInt32(), detail.GetProperty("transactionTotalCount").GetInt32()));
        var rows = detail.GetProperty("transactions").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetGuid());
        Assert.Equal(detail.GetProperty("pageInflow").GetDecimal(), rows.Values.Sum(x => x.GetProperty("inflow").ValueKind == JsonValueKind.Number ? x.GetProperty("inflow").GetDecimal() : 0m));

        static string Flags(JsonElement row) => string.Join(",", row.GetProperty("sourceKind").GetString(), row.GetProperty("isReversed").GetBoolean(),
            row.GetProperty("canVoid").GetBoolean(), row.GetProperty("canVoidTransfer").GetBoolean(), row.GetProperty("canChangeCashFlow").GetBoolean());
        Assert.Equal("Manual,False,True,False,True", Flags(rows[ManualMovement]));
        Assert.Equal("Manual,True,False,False,True", Flags(rows[ManualReversed]));
        Assert.Equal("Reversal,False,False,False,True", Flags(rows[ReversalRow]));
        Assert.Equal("Transfer,False,False,True,False", Flags(rows[TransferOut]));
        Assert.Equal("Opening,False,False,False,False", Flags(rows[OpeningRow]));
        // The legacy text field is unchanged.
        Assert.Equal("Manuel hareket", rows[ManualMovement].GetProperty("sourceType").GetString());
        Assert.Equal(30m, rows[ManualMovement].GetProperty("inflow").GetDecimal());
        Assert.Equal(JsonValueKind.Null, rows[ManualMovement].GetProperty("outflow").ValueKind);
    }

    [Fact]
    public async Task Ledger_account_read_is_tenant_scoped_and_sources_the_replacing_put()
    {
        await using var factory = await SeededAsync();
        using var client = AdminClient(factory);
        var accounts = await client.GetFromJsonAsync<JsonElement>("/api/finance/general-ledger/accounts");
        var cash = accounts.EnumerateArray().Single(x => x.GetProperty("code").GetString() == "100.001");
        Assert.Equal("1", cash.GetProperty("accountClass").GetString());
        var id = cash.GetProperty("id").GetGuid();
        var single = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/accounts/{id:D}");
        Assert.Equal(("100.001", true, "1", "Asset"), (single.GetProperty("code").GetString(), single.GetProperty("hasMovements").GetBoolean(),
            single.GetProperty("accountClass").GetString(), single.GetProperty("statementSection").GetString()));
        Guid foreign;
        await using (var scope = factory.Services.CreateAsyncScope())
            foreign = scope.ServiceProvider.GetRequiredService<TenantDbContext>().LedgerAccounts.Single(x => x.TenantId == ErpOperationCatalogTests.TenantB).Id;
        using var crossTenant = await client.GetAsync($"/api/finance/general-ledger/accounts/{foreign:D}");
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);
    }

    [Fact]
    public async Task Trial_balance_level_main_nets_main_accounts_and_movedOnly_hides_rows_but_not_totals()
    {
        await using var factory = await SeededAsync();
        using var client = AdminClient(factory);
        const string range = "from=2026-01-01&to=2026-12-31";
        var sub = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/trial-balance?{range}");
        Assert.Equal(("sub", false), (sub.GetProperty("level").GetString(), sub.GetProperty("movedOnly").GetBoolean()));
        Assert.Equal(new[] { "100", "100.001", "100.002", "600", "770" }, Codes(sub));
        Assert.Equal((5, 3), (sub.GetProperty("accountCount").GetInt32(), sub.GetProperty("movedAccountCount").GetInt32()));
        Assert.Equal("6", sub.GetProperty("accounts").EnumerateArray().Single(x => x.GetProperty("code").GetString() == "600").GetProperty("accountClass").GetString());

        var main = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/trial-balance?{range}&level=main");
        Assert.Equal(new[] { "100", "600", "770" }, Codes(main));
        var kasa = main.GetProperty("accounts").EnumerateArray().First();
        // 100.001: 200 debit / 100 credit, 100.002: 30 credit → main 100 nets to 70 debit; the name is the main account's own.
        Assert.Equal(("MAIN:100", "KASA", 200m, 130m, 70m, 0m), (kasa.GetProperty("accountId").GetString(), kasa.GetProperty("name").GetString(),
            kasa.GetProperty("debit").GetDecimal(), kasa.GetProperty("credit").GetDecimal(), kasa.GetProperty("balanceDebit").GetDecimal(),
            kasa.GetProperty("balanceCredit").GetDecimal()));
        // Balance totals are over the netted main rows (70 / 70); at sub level the sub-account balances stay apart (100 B, 30 + 70 A).
        Assert.Equal((70m, 70m), (main.GetProperty("totalBalanceDebit").GetDecimal(), main.GetProperty("totalBalanceCredit").GetDecimal()));
        Assert.True(main.GetProperty("isBalanced").GetBoolean());
        Assert.Equal((100m, 100m), (sub.GetProperty("totalBalanceDebit").GetDecimal(), sub.GetProperty("totalBalanceCredit").GetDecimal()));

        var moved = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/trial-balance?{range}&movedOnly=true");
        Assert.Equal(new[] { "100.001", "100.002", "600" }, Codes(moved));
        Assert.Equal(sub.GetProperty("totalDebit").GetDecimal(), moved.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(5, moved.GetProperty("accountCount").GetInt32());

        // IFRS ignores the level (rows are grouped by IFRS code); an unknown level is rejected.
        var ifrs = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/trial-balance?{range}&basis=IFRS&level=main");
        Assert.Equal("sub", ifrs.GetProperty("level").GetString());
        using var invalid = await client.GetAsync($"/api/finance/general-ledger/trial-balance?{range}&level=group");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        static string[] Codes(JsonElement root) => root.GetProperty("accounts").EnumerateArray().Select(x => x.GetProperty("code").GetString()!).ToArray();
    }

    [Fact]
    public async Task Entry_list_and_read_carry_totalCount_reversal_flags_and_the_chain()
    {
        await using var factory = await SeededAsync();
        using var client = AdminClient(factory);
        var page = await client.GetFromJsonAsync<JsonElement>("/api/finance/general-ledger/entries?pageSize=50");
        Assert.Equal((4, 4), (page.GetProperty("total").GetInt32(), page.GetProperty("totalCount").GetInt32()));
        var rows = page.GetProperty("items").EnumerateArray().ToDictionary(x => x.GetProperty("code").GetString()!);
        static string Flags(JsonElement row) => string.Join(",", row.GetProperty("isReversed").GetBoolean(), row.GetProperty("isSourced").GetBoolean(),
            row.GetProperty("canReverse").GetBoolean(), row.GetProperty("sourceLabel").GetString());
        Assert.Equal("True,False,False,Manuel", Flags(rows["YV-1"]));
        Assert.Equal("False,True,False,Ters kayıt", Flags(rows["YV-2"]));
        Assert.Equal("False,True,True,Satış faturası", Flags(rows["YV-3"]));
        Assert.Equal("False,True,False,Dönem kapanışı", Flags(rows["FY-CLOSE-20250101-20251231"]));
        // Wire names of the former anonymous rows are kept.
        Assert.Equal(100m, rows["YV-1"].GetProperty("totalDebit").GetDecimal());

        var original = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/entries/{rows["YV-1"].GetProperty("id").GetGuid():D}");
        Assert.Equal((true, false, "YV-2"), (original.GetProperty("isReversed").GetBoolean(), original.GetProperty("canReverse").GetBoolean(),
            original.GetProperty("reversedByEntryCode").GetString()));
        var reversal = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/entries/{rows["YV-2"].GetProperty("id").GetGuid():D}");
        Assert.Equal((true, false, "YV-1"), (reversal.GetProperty("isReversal").GetBoolean(), reversal.GetProperty("canReverse").GetBoolean(),
            reversal.GetProperty("reversalOfEntryCode").GetString()));
        var sourced = await client.GetFromJsonAsync<JsonElement>($"/api/finance/general-ledger/entries/{rows["YV-3"].GetProperty("id").GetGuid():D}");
        Assert.Equal((true, true), (sourced.GetProperty("canReverse").GetBoolean(), sourced.GetProperty("isSourced").GetBoolean()));
        Assert.Equal(JsonValueKind.Null, sourced.GetProperty("reversedByEntryCode").ValueKind);
    }

    // ---- Schema (E2 editableGrid totals) ----

    [Theory]
    [InlineData("""["debit", "credit"]""", "list", null)]
    [InlineData("""["debit"]""", "stage", null)]
    [InlineData("""["description"]""", "list", "sayı (number) sütunu")]
    [InlineData("""["debit", "debit"]""", "list", "farklı sütun")]
    [InlineData("""[]""", "list", "farklı sütun")]
    [InlineData("""["yok"]""", "list", "sayı (number) sütunu")]
    [InlineData("\"debit\"", "list", "farklı sütun")]
    public void Editable_grid_totals_name_number_columns_of_the_grid(string totals, string mode, string? expected)
    {
        var source = mode == "stage" ? """, "sourceQuery": "kaynak", "rowKey": "lineNumber" """ : "";
        var json = """
        { "schemaVersion": 2,
          "components": [
            { "id": "satirlar", "type": "editableGrid", "name": "satirlar",
              "props": { "gridMode": "MODE"SOURCE, "gridColumns": ["description|Açıklama|text", "debit|Borç|number", "credit|Alacak|number"],
                         "totals": TOTALS } },
            { "id": "dengeli", "type": "badge", "name": "dengeli",
              "props": { "text": "Dengeli {{satirlar.toplam.debit}}", "visibleWhen": "satirlar.toplam.debit == satirlar.toplam.credit && satirlar.toplam.debit > 0" } } ],
          "queries": [ { "id": "kaynak", "name": "kaynak", "kind": "read", "operation": "finans.fis.satirlari", "runOn": "load",
                         "parameters": [ { "name": "id", "binding": "{{sayfa.parametre.id}}", "type": "guid" } ] } ] }
        """.Replace("MODE", mode).Replace("SOURCE", source).Replace("TOTALS", totals);
        var valid = TenantCustomPageSchema.Validate(json, out var error);
        if (expected is null) Assert.True(valid, error);
        else { Assert.False(valid); Assert.Contains(expected, error); }
    }

    [Fact]
    public void Data_table_totals_rule_is_unchanged_and_matrix_grid_has_no_totals()
    {
        var table = """{ "schemaVersion": 2, "components": [ { "id": "t", "type": "dataTable", "name": "t", "props": { "totals": ["a"] } } ] }""";
        Assert.False(TenantCustomPageSchema.Validate(table, out var error));
        Assert.Contains("sorguya bağlı", error);
        var matrix = """{ "schemaVersion": 2, "components": [ { "id": "m", "type": "editableGrid", "name": "m", "props": { "gridMode": "matrix", "matrixCode": "A", "matrixName": "B", "totals": ["x"] } } ] }""";
        Assert.False(TenantCustomPageSchema.Validate(matrix, out error));
        Assert.Contains("matrix", error);
    }

    // ---- Standards ----

    [Theory]
    [InlineData("finance-accounts", "Kasalar", "Finans")]
    [InlineData("finance-banks", "Bankalar", "Finans")]
    [InlineData("finance-account-create", "Kasa/Banka kartı", "Finans")]
    [InlineData("finance-trial-balance", "Mizan", "Finans")]
    [InlineData("finance-journal-ledger", "Yevmiye Defterleri", "Genel Muhasebe")]
    [InlineData("finance-journal-voucher-document", "Yevmiye fişi (belge)", "Genel Muhasebe")]
    public void Standard_is_preview_version_1_and_uses_finance_operations(string key, string title, string module)
    {
        var standard = SystemPageStandards.All[key];
        var expectedVersion = key is "finance-accounts" or "finance-banks" or "finance-trial-balance" or "finance-account-create" ? 2 : key == "finance-journal-ledger" ? 3 : 1;
        Assert.Equal((expectedVersion, "preview", title, module), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since <= standard.Version && x.Label.Length is > 0 and <= 80, x.Key));
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.All(operations, name => Assert.True(name.StartsWith("finans.", StringComparison.Ordinal) && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
    }

    [Fact]
    public void Ledger_chart_is_a_list_with_a_card_group_and_windows_for_create_edit_and_ledger()
    {
        const string key = "finance-ledger-chart";
        var standard = SystemPageStandards.All[key];
        Assert.Equal((2, "preview", "Hesap Planı", "Genel Muhasebe"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.Equal("list", (string)Definition(key)["template"]!["name"]!);
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["id"]!, x => (string)x["operation"]!);
        Assert.All(operations.Values, name => Assert.True(name.StartsWith("finans.", StringComparison.Ordinal) && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
        // Workflow: reads vs writes (TenantAdmin writes), create and update are separate window saves.
        Assert.Equal(new[] { "hesap", "hesaplar", "muavin", "tekDuzen" },
            Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Where(x => (string)x["kind"]! == "read").Select(x => (string)x["id"]!).Order(StringComparer.Ordinal).ToArray());
        Assert.Equal(new[] { "aktifEt", "guncelle", "hesapSil", "olustur", "pasifeAl", "tekDuzenUygula" },
            Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Where(x => (string)x["kind"]! != "read").Select(x => (string)x["id"]!).Order(StringComparer.Ordinal).ToArray());
        var components = Definition(key)["components"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["id"]!);
        Assert.Equal(("olustur", "guncelle"), ((string)components["yeniHesapPenceresi"]["props"]!["saveQuery"]!, (string)components["duzenlePenceresi"]["props"]!["saveQuery"]!));
        Assert.Equal("yeniHesapDugmesi", (string)components["komutlar"]["props"]!["newButton"]!);
        Assert.Equal("{{yeniKod.value}}", Binding(key, "olustur", "code"));
        Assert.Equal(("{{kod.value}}", "{{hesap.rows[0].id}}"), (Binding(key, "guncelle", "code"), Binding(key, "guncelle", "id")));
        var card = components["detayKarti"]["children"]!.AsArray().OfType<JsonObject>().ToDictionary(x => (string)x["id"]!);
        Assert.All(new[] { "duzenleDugmesi", "muavinDugmesi", "pasifeAlDugmesi", "etkinlestirDugmesi", "silDugmesi" }, id => Assert.Contains(id, card.Keys));
        Assert.Contains("TenantAdmin", (string)card["pasifeAlDugmesi"]["props"]!["visibleWhen"]!);
        Assert.Contains("hasMovements == true", (string)card["silDugmesi"]["props"]!["disabledWhen"]!);
        Assert.Equal("muavinPenceresi", (string)card["muavinDugmesi"]["props"]!["dialogId"]!);
    }

    [Fact]
    public void Cash_and_bank_standards_share_the_list_template_and_keep_their_type_specific_summary()
    {
        Assert.Equal("list", (string)Definition("finance-accounts")["template"]!["name"]!);
        Assert.Equal("list", (string)Definition("finance-banks")["template"]!["name"]!);
        Assert.Equal("card", Component("finance-accounts", "hesapKarti")["type"]!.GetValue<string>());
        Assert.Equal("Ekstre", (string)Props("finance-accounts", "acDugmesi")["text"]!);
        Assert.Equal("Ekstre", (string)Props("finance-banks", "acDugmesi")["text"]!);
        Assert.Equal("Cash", (string)Props("finance-accounts", "hesapTuru")["defaultValue"]!);
        Assert.Equal("Bank", (string)Props("finance-banks", "hesapTuru")["defaultValue"]!);
        Assert.Contains("accountType=Bank", Strings(Props("finance-banks", "yeniDugmesi")["params"]));
        Assert.Contains(Definition("finance-banks")["components"]!.AsArray(), x => (string?)x?["id"] == "eksiBakiyeGostergesi");
    }

    [Fact]
    public void Statement_voids_bind_the_selected_account_and_the_row()
    {
        foreach (var key in new[] { "finance-accounts", "finance-banks" })
        {
            Assert.Equal("{{liste.seciliSatir.id}}", Binding(key, "hareketIptal", "id"));
            Assert.Equal("{{hareketler.seciliSatir.id}}", Binding(key, "hareketIptal", "transactionId"));
            Assert.Equal("{{hareketler.seciliSatir.transferId}}", Binding(key, "transferIptal", "transferId"));
            Assert.Equal("{{liste.seciliSatir.id}}", Binding(key, "nakitAkisiDegistir", "id"));
            Assert.Equal("hareketler.seciliSatir.canVoid == true", (string)Props(key, "hareketIptalDugmesi")["visibleWhen"]!);
            Assert.Equal("hareketler.seciliSatir.canVoidTransfer == true", (string)Props(key, "transferIptalDugmesi")["visibleWhen"]!);
            // The transfer target list is every account (cash and bank), not the page's type.
            Assert.Empty(Query(key, "tumHesaplar")["parameters"]!.AsArray());
            var views = SystemPageStandards.All[key].ScreenViews;
            Assert.Equal(new[] { "finance-accounts", "finance-account-transactions" }, views.Select(x => x.Key));
            Assert.Equal("isActive", views[0].Fields["status"]);
            Assert.Equal("sourceType", views[1].Fields["source"]);
        }
    }

    [Fact]
    public void Journal_standards_bind_reversal_to_canReverse_today_and_the_voucher_lines()
    {
        Assert.Equal("{{bugun}}", Binding("finance-journal-ledger", "tersKayit", "entryDate"));
        Assert.Equal("{{tersKayitSourced.yanit}}", Binding("finance-journal-ledger", "tersKayitKaynakli", "reason"));
        Assert.Contains("canReverse", (string)Props("finance-journal-ledger", "tersKayitSourced")["visibleWhen"]!);
        Assert.Contains("kendi ekranından iptal edin", (string)Props("finance-journal-ledger", "tersKayitSourced")["promptText"]!);
        Assert.Equal("{{liste.seciliSatir.accountId}}", Binding("finance-trial-balance", "muavin", "accountId"));
        Assert.Equal("{{duzey.value}}", Binding("finance-trial-balance", "mizan", "level"));
    }

    [Fact]
    public void Finance_list_standards_keep_their_read_and_write_workflows()
    {
        Assert.Equal("list", (string)Definition("finance-accounts")["template"]!["name"]!);
        Assert.Equal("list", (string)Definition("finance-banks")["template"]!["name"]!);
        Assert.Contains("finans.hareket.ekle", Definition("finance-accounts")["queries"]!.ToJsonString());
        Assert.Contains("finans.transfer.olustur", Definition("finance-banks")["queries"]!.ToJsonString());
        Assert.Contains("finans.hareket.iptal", Definition("finance-accounts")["queries"]!.ToJsonString());
        Assert.Contains("finans.hesap.pasifeAl", Definition("finance-accounts")["queries"]!.ToJsonString());
    }

    [Fact]
    public void Journal_ledger_list_keeps_read_and_reversal_workflows()
    {
        var definition = Definition("finance-journal-ledger");
        Assert.Equal("list", (string)definition["template"]!["name"]!);
        Assert.Equal("rowActions", (string)Props("finance-journal-ledger", "tersKayitDugmesi")["slot"]!);
        Assert.Contains("finans.fis.listele", definition["queries"]!.ToJsonString());
        Assert.Contains("finans.fis.tersKayit", definition["queries"]!.ToJsonString());
        Assert.Contains("{{liste.seciliSatir.id}}", Binding("finance-journal-ledger", "tersKayit", "id"));
    }

    [Fact]
    public void Trial_balance_list_keeps_read_only_trial_balance_and_ledger_flows()
    {
        var definition = Definition("finance-trial-balance");
        Assert.Equal("list", (string)definition["template"]!["name"]!);
        Assert.Equal("dialogs", (string)Props("finance-trial-balance", "muavinPenceresi")["slot"]!);
        Assert.Contains("finans.mizan", definition["queries"]!.ToJsonString());
        Assert.Contains("finans.muhasebe.muavin", definition["queries"]!.ToJsonString());
        Assert.Equal("{{liste.seciliSatir.accountId}}", Binding("finance-trial-balance", "muavin", "accountId"));
    }

    // ---- Helpers ----

    private static string Shape(ErpOperationParameter x) => $"{x.Name}:{x.In}:{x.Type}:{x.Required}";

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Components(Definition(key)["components"]).Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject Component(string key, string id) =>
        Components(Definition(key)["components"]).Single(x => (string)x["id"]! == id);

    private static IEnumerable<JsonObject> Components(JsonNode? node)
    {
        if (node is JsonArray array)
            foreach (var item in array)
                foreach (var component in Components(item)) yield return component;
        else if (node is JsonObject obj)
        {
            if (obj.ContainsKey("id") && obj.ContainsKey("type")) yield return obj;
            if (obj.TryGetPropertyValue("children", out var children))
                foreach (var component in Components(children)) yield return component;
        }
    }

    private static JsonObject Query(string key, string id) =>
        Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id);

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Query(key, queryId)["parameters"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["name"]! == parameter)["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();

    private static HttpClient AdminClient(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        return client;
    }

    private static async Task<ErpOperationCatalogTests.ErpOperationApiFactory> SeededAsync()
    {
        var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var cashA = new FinancialAccount { Id = CashA, TenantId = TenantA, Code = "K-01", Name = "Merkez kasa", Type = FinancialAccountType.Cash, CurrencyCode = "TRY" };
        var cashB = new FinancialAccount { Id = CashB, TenantId = TenantA, Code = "K-02", Name = "Kapanan kasa", Type = FinancialAccountType.Cash, CurrencyCode = "TRY", IsActive = false };
        var bankEur = new FinancialAccount { Id = BankEur, TenantId = TenantA, Code = "B-EUR", Name = "Euro banka", Type = FinancialAccountType.Bank, CurrencyCode = "EUR" };
        var bankNeg = new FinancialAccount { Id = BankNegative, TenantId = TenantA, Code = "B-NEG", Name = "Eksi banka", Type = FinancialAccountType.Bank, CurrencyCode = "TRY", IsActive = false };
        var other = new FinancialAccount { Id = OtherTenantAccount, TenantId = ErpOperationCatalogTests.TenantB, Code = "K-01", Name = "Başka", Type = FinancialAccountType.Cash, CurrencyCode = "TRY" };
        db.FinancialAccounts.AddRange(cashA, cashB, bankEur, bankNeg, other);
        FinancialAccountTransaction Movement(Guid id, FinancialAccount account, FinancialDirection direction, decimal amount, string description) => new()
        {
            Id = id, TenantId = TenantA, FinancialAccount = account, CurrencyCode = account.CurrencyCode, TransactionDate = new DateOnly(2026, 11, 1),
            Direction = direction, Amount = amount, Description = description, CashFlowCategory = CashFlowCategory.Operating
        };
        var transfer = new FinancialAccountTransfer { Id = TransferId, TenantId = TenantA, Code = "TR-1", FromAccountId = CashA, ToAccountId = BankNegative,
            TransferDate = new DateOnly(2026, 11, 2), Amount = 10m, DestinationAmount = 10m, Description = "Kasa/banka döviz transferi", RequestId = Guid.NewGuid() };
        db.FinancialAccountTransfers.Add(transfer);
        var opening = Movement(OpeningRow, cashA, FinancialDirection.Inflow, 50m, "Açılış bakiyesi");
        opening.CashFlowCategory = CashFlowCategory.OpeningBalance;
        var manual = Movement(ManualMovement, cashA, FinancialDirection.Inflow, 30m, "Satış");
        manual.RequestId = Guid.NewGuid();
        var reversed = Movement(ManualReversed, cashA, FinancialDirection.Inflow, 20m, "Hatalı");
        reversed.RequestId = Guid.NewGuid();
        var reversal = Movement(ReversalRow, cashA, FinancialDirection.Outflow, 20m, "Finans hareketi iptali");
        reversal.ReversalOfId = ManualReversed;
        var transferOut = Movement(TransferOut, cashA, FinancialDirection.Outflow, 10m, "Kasa/banka döviz transferi");
        transferOut.TransferId = TransferId;
        transferOut.CashFlowCategory = CashFlowCategory.InternalTransfer;
        var transferIn = Movement(Guid.NewGuid(), bankNeg, FinancialDirection.Inflow, 10m, "Kasa/banka döviz transferi");
        transferIn.TransferId = TransferId;
        transferIn.CashFlowCategory = CashFlowCategory.InternalTransfer;
        db.FinancialAccountTransactions.AddRange(opening, manual, reversed, reversal, transferOut, transferIn,
            Movement(Guid.NewGuid(), bankNeg, FinancialDirection.Outflow, 25m, "Masraf"), Movement(Guid.NewGuid(), bankEur, FinancialDirection.Inflow, 5m, "Faiz"));
        // Cash total: K-01 50 + 30 + 20 - 20 - 10 = 70, K-02 0. Banks: B-NEG 10 - 25 = -15 (TRY), B-EUR 5 (EUR).

        LedgerAccount Account(string code, string name, LedgerAccountStatementSection section) =>
            new() { TenantId = TenantA, Code = code, Name = name, StatementSection = section, IfrsAccountCode = code[..1] + "X", IfrsAccountName = "IFRS " + code[..1] };
        var kasa = Account("100", "KASA", LedgerAccountStatementSection.Asset);
        var merkez = Account("100.001", "Merkez kasa", LedgerAccountStatementSection.Asset);
        var sube = Account("100.002", "Şube kasası", LedgerAccountStatementSection.Asset);
        var sales = Account("600", "Yurt içi satışlar", LedgerAccountStatementSection.Revenue);
        var expense = Account("770", "Genel yönetim giderleri", LedgerAccountStatementSection.Expense);
        db.LedgerAccounts.AddRange(kasa, merkez, sube, sales, expense,
            new LedgerAccount { TenantId = ErpOperationCatalogTests.TenantB, Code = "100", Name = "Başka", StatementSection = LedgerAccountStatementSection.Asset });
        JournalEntry Entry(string code, string sourceType, Guid sourceId, DateOnly date, params (LedgerAccount Account, decimal Debit, decimal Credit)[] lines)
        {
            var entry = new JournalEntry { TenantId = TenantA, Code = code, EntryDate = date, Description = code, SourceType = sourceType, SourceId = sourceId };
            var number = 0;
            foreach (var (account, debit, credit) in lines)
                entry.Lines.Add(new JournalEntryLine { TenantId = TenantA, JournalEntryId = entry.Id, AccountId = account.Id, LineNumber = ++number,
                    Description = code, Debit = debit, Credit = credit });
            return entry;
        }
        // YV-1 and its reversal YV-2 cancel out on 100.001 / 600; YV-3 (sales invoice) leaves 100.001 +100, 100.002 -30, 600 -70.
        var first = Entry("YV-1", "Manual", Guid.NewGuid(), new DateOnly(2026, 3, 1), (merkez, 100m, 0m), (sales, 0m, 100m));
        var second = Entry("YV-2", "ManualReversal", first.Id, new DateOnly(2026, 3, 2), (merkez, 0m, 100m), (sales, 100m, 0m));
        var third = Entry("YV-3", "SalesInvoice", Guid.NewGuid(), new DateOnly(2026, 4, 1), (merkez, 100m, 0m), (sube, 0m, 30m), (sales, 0m, 70m));
        var close = Entry("FY-CLOSE-20250101-20251231", "FiscalYearClose", Guid.NewGuid(), new DateOnly(2025, 12, 31));
        db.JournalEntries.AddRange(first, second, third, close);
        await db.SaveChangesAsync();
        return factory;
    }
}
