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
/// Cari Hesaplar system pages (customers, customer-create, customer-ledger): the cari.* ERP operations, dotted body
/// parameters, computed display members, the counters endpoint, row-rule aware <c>allowed</c> flags (G-C3), the standards
/// and the schema additions they use (saveAndNew, erpPage params, tarih root, standard aliases).
/// </summary>
public sealed class CustomerSystemPagesTests
{
    private static readonly Guid RowUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid DenyUser = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid CustomerA = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    private static readonly Guid SupplierA = Guid.Parse("a0000000-0000-0000-0000-000000000002");
    private static readonly Guid PassiveA = Guid.Parse("a0000000-0000-0000-0000-000000000003");
    private static readonly Guid OtherTenantCustomer = Guid.Parse("b0000000-0000-0000-0000-000000000001");

    private static readonly string[] Operations =
    [
        "cari.listele", "cari.getir", "cari.olustur", "cari.guncelle", "cari.pasifeAl", "cari.aktifEt", "cari.bakiye", "cari.adresleri",
        "cari.anaFirmaSecenekleri", "cari.gruplar", "cari.ozelAlanTanimlari", "cari.ozelAlanDegerleri", "cari.ozelAlanKaydet", "cari.iller",
        "cari.ilceler", "cari.adres.ekle", "cari.adres.pasifeAl", "cari.adres.aktifEt", "cari.ekstre", "cari.sayaclar"
    ];

    private static readonly string[] AddressParameters =
        ["address.label", "address.addressLine", "address.city", "address.district", "address.postalCode", "address.countryCode", "address.latitude", "address.longitude"];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_customer_operation_in_the_cari_module()
    {
        foreach (var name in Operations)
        {
            Assert.True(ErpOperationCatalog.TryGet(name, out var op), name);
            Assert.Equal(("Cari", false, false), (op.Module, op.Deprecated, op.RequiresTenantAdmin));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
        }
        Assert.Equal(Operations.Append("cari.sil").Order(StringComparer.Ordinal), ErpOperationCatalog.All.Where(x => x.Name.StartsWith("cari.", StringComparison.Ordinal))
            .Select(x => x.Name).Order(StringComparer.Ordinal));
        // Sil: only a TenantAdmin, the card route with its id, no source record and no result (204).
        var delete = Op("cari.sil");
        Assert.Equal(("Cari", "delete", "DELETE", "/api/customers/{id}", true), (delete.Module, delete.PageKind, delete.Method, delete.Route, delete.RequiresTenantAdmin));
        Assert.Equal(new[] { "id" }, delete.Parameters.Select(x => x.Name));
        Assert.Null(delete.SourceOperation);
        Assert.Equal("none", delete.Result.Shape);
        Assert.Null(ErpOperationCatalog.ParameterShapeError(delete));

        var list = Op("cari.listele");
        Assert.Equal(("GET", "/api/customers", "items"), (list.Method, list.Route, list.Result.RowsPath));
        Assert.Equal(new[] { "q", "type", "status", "page", "pageSize" }, list.Parameters.Select(x => x.Name));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, list.Result.MetaPaths);
        Assert.Equal(("GET", "/api/customers/counts", "record"), (Op("cari.sayaclar").Method, Op("cari.sayaclar").Route, Op("cari.sayaclar").Result.Shape));
        Assert.Equal(new[] { "totalCount", "activeCount", "inactiveCount", "customerCount", "supplierCount", "bothCount", "dealerCount",
            "employeeCount", "eInvoiceRegisteredCount", "riskLimitDefinedCount" }, Op("cari.sayaclar").Result.Columns.Select(x => x.Code));

        foreach (var (name, active) in new[] { ("cari.pasifeAl", false), ("cari.aktifEt", true) })
        {
            var op = Op(name);
            Assert.Equal(("PUT", "/api/customers/{id}", "cari.getir"), (op.Method, op.Route, op.SourceOperation));
            Assert.Equal(new[] { "id" }, op.Parameters.Select(x => x.Name));
            Assert.Equal(active, op.FixedBody!["isActive"]);
        }
        var save = Op("cari.ozelAlanKaydet");
        Assert.Equal(("values", "cari.ozelAlanDegerleri", "code", "value"), (save.BodyMap!.Property, save.BodyMap.SourceOperation, save.BodyMap.KeyColumn, save.BodyMap.ValueColumn));
        Assert.Equal(new[] { "provinceId:query:int:False", "provinceName:query:text:False" }, Op("cari.ilceler").Parameters.Select(x => $"{x.Name}:{x.In}:{x.Type}:{x.Required}"));
        var deactivate = Op("cari.adres.pasifeAl");
        Assert.Equal("/api/customers/{id}/addresses/{addressId}", deactivate.Route);
        Assert.Equal((false, false), ((bool)deactivate.FixedBody!["isActive"]!, (bool)deactivate.FixedBody["isDefault"]!));
        Assert.DoesNotContain(deactivate.Parameters, x => x.Name is "isActive" or "isDefault");
        Assert.Contains(Op("cari.adres.aktifEt").Parameters, x => x.Name == "isDefault");
    }

    [Fact]
    public void Create_and_update_carry_the_primary_address_as_dotted_body_parameters()
    {
        var create = Op("cari.olustur");
        Assert.Equal(("POST", "/api/customers", "insert", null), (create.Method, create.Route, create.PageKind, create.SourceOperation));
        Assert.Equal(new[] { "code:True", "name:True", "type:True" }, create.Parameters.Where(x => x.Required).Select(x => $"{x.Name}:{x.Required}"));
        Assert.DoesNotContain(create.Parameters, x => x.Name is "isActive" or "rowVersion" or "address");
        Assert.Contains(create.Parameters, x => x is { Name: "customFields", Type: "map" });
        Assert.Equal(AddressParameters, create.Parameters.Where(x => x.Name.Contains('.')).Select(x => x.Name));
        Assert.All(create.Parameters.Where(x => x.Name.Contains('.')), x => Assert.Equal(("body", false), (x.In, x.Required)));
        Assert.Equal("decimal", create.Parameters.Single(x => x.Name == "address.latitude").Type);
        Assert.Equal(new Dictionary<string, object?> { ["isActive"] = true, ["address.kind"] = "General", ["address.isDefault"] = true }, create.FixedBody);

        var update = Op("cari.guncelle");
        Assert.Equal(("PUT", "/api/customers/{id}", "update", "cari.getir"), (update.Method, update.Route, update.PageKind, update.SourceOperation));
        Assert.DoesNotContain(update.Parameters, x => x.Required && x.In == "body");
        Assert.DoesNotContain(update.Parameters, x => x.Name is "isActive" or "rowVersion" or "customFields");
        Assert.Equal(AddressParameters, update.Parameters.Where(x => x.Name.Contains('.')).Select(x => x.Name));
        Assert.Equal(new Dictionary<string, object?> { ["address.kind"] = "General", ["address.isDefault"] = true }, update.FixedBody);
    }

    public static TheoryData<string[], string[], string?> ShapeCases => new()
    {
        { ["address.city", "address.label"], [], null },
        { ["address.city"], ["address.kind"], null },
        { ["address.city.name"], [], "tek düzeyli" },
        { ["address."], [], "tek düzeyli" },
        { [".city"], [], "tek düzeyli" },
        { ["1address.city"], [], "tek düzeyli" },
        { ["address", "address.city"], [], "üst ad 'address'" },
        { ["Address", "address.city"], [], "üst ad 'address'" },
        { ["address.city", "ADDRESS.CITY"], [], "birden fazla" },
        { ["code"], ["address.kind"], "noktalı parametresi yok" },
        { ["address.kind"], ["address.kind"], "aynı zamanda bir parametre" },
        { ["address.city"], ["address.kind.x"], "tek düzeyli" },
    };

    [Theory]
    [MemberData(nameof(ShapeCases))]
    public void Dotted_parameter_shape_rules(string[] names, string[] fixedKeys, string? expected)
    {
        var parameters = names.Select(x => new ErpOperationParameter(x, "body", "text", false)).ToArray();
        var fixedBody = fixedKeys.Length == 0 ? null : fixedKeys.ToDictionary(x => x, x => (object?)"v");
        var op = new ErpOperation("test.op", "Test", "Test", "write", "insert", "POST", "/api/test", parameters, new ErpOperationResult("none", null, []),
            null, fixedBody, "2026-11-21");
        var error = ErpOperationCatalog.ParameterShapeError(op);
        if (expected is null) Assert.Null(error);
        else Assert.Contains(expected, error);
    }

    [Theory]
    [InlineData("query", "text")]
    [InlineData("route", "guid")]
    [InlineData("body", "map")]
    [InlineData("body", "list")]
    public void Dotted_parameters_are_scalar_body_parameters_only(string location, string type)
    {
        var op = new ErpOperation("test.op", "Test", "Test", "write", "insert", "POST", "/api/test", [new ErpOperationParameter("address.city", location, type, false)],
            new ErpOperationResult("none", null, []), null, null, "2026-11-21");
        Assert.NotNull(ErpOperationCatalog.ParameterShapeError(op));
    }

    [Fact]
    public void Computed_members_are_appended_only_where_declared()
    {
        Assert.Equal(new[] { "balanceAmount", "balanceSideCode", "limitUsagePercent" }, Op("cari.bakiye").Result.Columns.TakeLast(3).Select(x => x.Code));
        Assert.Equal(new[] { "isReversal", "debitAmount", "creditAmount", "balanceAmount", "balanceSide", "foreignCurrencyCode",
                "sourceType", "sourceId", "sourceCode", "sourceOpenId" },
            Op("cari.ekstre").Result.Columns.TakeLast(10).Select(x => x.Code));
        Assert.Contains("openingAsOf", Op("cari.ekstre").Result.MetaPaths);
        Assert.Contains("hasForeignCurrency", Op("cari.ekstre").Result.MetaPaths);
        // The primary address members are cari.getir columns only; the list keeps the constructor columns.
        Assert.Contains(Op("cari.getir").Result.Columns, x => x is { Code: "defaultAddressCity", DataType: "text" });
        Assert.Contains(Op("cari.getir").Result.Columns, x => x is { Code: "defaultAddressLatitude", DataType: "decimal" });
        Assert.DoesNotContain(Op("cari.listele").Result.Columns, x => x.Code.StartsWith("defaultAddress", StringComparison.Ordinal));
        Assert.DoesNotContain(Op("cari.listele").Result.Columns, x => x.Code == "customFields");
        var ekstre = Op("cari.ekstre");
        Assert.Equal(new[] { "id:route:True", "from:query:True", "to:query:True" }, ekstre.Parameters.Select(x => $"{x.Name}:{x.In}:{x.Required}"));
    }

    [Theory]
    [InlineData(150, 200, "B", 75)]
    [InlineData(-50, 200, "A", 0)]
    [InlineData(0, 200, "", 0)]
    [InlineData(250, 200, "B", 125)]
    [InlineData(10, 3, "B", 333.33)]
    public void Balance_display_members(double balance, double limit, string side, double percent)
    {
        var value = new CustomerLedgerBalance("TRY", (decimal)balance, "x", (decimal)limit);
        Assert.Equal((Math.Abs((decimal)balance), side, (decimal?)(decimal)percent), (value.BalanceAmount, value.BalanceSideCode, value.LimitUsagePercent));
        Assert.Null((value with { RiskLimit = null }).LimitUsagePercent);
        Assert.Null((value with { RiskLimit = 0m }).LimitUsagePercent);
        var json = JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(side, json.GetProperty("balanceSideCode").GetString());
        Assert.Equal("x", json.GetProperty("balanceSide").GetString());
    }

    [Fact]
    public void Statement_display_members()
    {
        var debit = new CustomerStatementLine(Guid.NewGuid(), new DateOnly(2026, 3, 5), CustomerLedgerDirection.Debit, 150m, "TRY", "Fatura", null, true, 162m);
        var reversal = new CustomerStatementLine(Guid.NewGuid(), new DateOnly(2026, 4, 13), CustomerLedgerDirection.Credit, 5m, "EUR", "Ters", Guid.NewGuid(), false, -3m)
            { ForeignCurrencyCode = "EUR" };
        Assert.Equal((150m, (decimal?)null, 162m, "B", false), (debit.DebitAmount!.Value, debit.CreditAmount, debit.BalanceAmount, debit.BalanceSide, debit.IsReversal));
        Assert.Equal(((decimal?)null, 5m, 3m, "A", true), (reversal.DebitAmount, reversal.CreditAmount!.Value, reversal.BalanceAmount, reversal.BalanceSide, reversal.IsReversal));
        var view = new CustomerStatementView(Guid.NewGuid(), "C-1", "Cari", "TRY", new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31),
            12m, 150m, 5m, -3m, [debit, reversal]);
        Assert.Equal((12m, "B", 3m, "A", 145m, new DateOnly(2025, 12, 31), true),
            (view.OpeningAmount, view.OpeningSide, view.ClosingAmount, view.ClosingSide, view.NetMovement, view.OpeningAsOf, view.HasForeignCurrency));
        Assert.False((view with { Items = [debit] }).HasForeignCurrency);
        var json = JsonSerializer.SerializeToElement(view, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal("2025-12-31", json.GetProperty("openingAsOf").GetString());
        Assert.Equal("EUR", json.GetProperty("items")[1].GetProperty("foreignCurrencyCode").GetString());
    }

    // ---- Endpoints ----

    [Fact]
    public async Task Counts_are_tenant_scoped_search_aware_and_follow_row_rules()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, RowUser);
            platform.TenantPermissionRules.Add(RowRule("erp.customers.read", TenantPermissionEffect.Allow, RowUser, "resource.customerType", "Customer"));
        });
        await SeedCustomersAsync(factory);
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var all = await client.GetFromJsonAsync<JsonElement>("/api/customers/counts");
        Assert.Equal((3, 2, 1, 2, 1, 1, 2), (all.GetProperty("totalCount").GetInt32(), all.GetProperty("activeCount").GetInt32(),
            all.GetProperty("inactiveCount").GetInt32(), all.GetProperty("customerCount").GetInt32(), all.GetProperty("supplierCount").GetInt32(),
            all.GetProperty("eInvoiceRegisteredCount").GetInt32(), all.GetProperty("riskLimitDefinedCount").GetInt32()));
        var searched = await client.GetFromJsonAsync<JsonElement>("/api/customers/counts?q=TED");
        Assert.Equal((1, 1), (searched.GetProperty("totalCount").GetInt32(), searched.GetProperty("supplierCount").GetInt32()));

        // A TenantUser whose only read rule is row-conditional reaches the counters (as the list) and counts visible rows only.
        ErpOperationCatalogTests.SetIdentity(client, RowUser, "TenantUser");
        using var response = await client.GetAsync("/api/customers/counts");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var visible = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal((2, 2, 0), (visible.GetProperty("totalCount").GetInt32(), visible.GetProperty("customerCount").GetInt32(),
            visible.GetProperty("supplierCount").GetInt32()));
        var list = await client.GetFromJsonAsync<JsonElement>("/api/customers?pageSize=100");
        Assert.Equal(2, list.GetProperty("totalCount").GetInt32());

        // Without a read rule the counters are forbidden.
        ErpOperationCatalogTests.SetIdentity(client, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "TenantUser");
        using var forbidden = await client.GetAsync("/api/customers/counts");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Districts_load_by_province_id_or_trimmed_province_name_and_neither_returns_an_empty_list()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.CustomerLocationProvinces.AddRange(new CustomerLocationProvince { Id = 9001, Name = "Deneme İli" },
                new CustomerLocationProvince { Id = 9002, Name = "Öteki İl" });
            db.CustomerLocationDistricts.AddRange(
                new CustomerLocationDistrict { Id = 90011, ProvinceId = 9001, Name = "Merkez" },
                new CustomerLocationDistrict { Id = 90012, ProvinceId = 9001, Name = "Ayrık" },
                new CustomerLocationDistrict { Id = 90013, ProvinceId = 9001, Name = "Kapalı", IsActive = false },
                new CustomerLocationDistrict { Id = 90021, ProvinceId = 9002, Name = "Başka" });
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        async Task<JsonElement[]> Districts(string query)
        {
            using var response = await client.GetAsync("/api/location-definitions/districts" + query);
            Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
            return (await response.Content.ReadFromJsonAsync<JsonElement[]>())!;
        }

        var byId = await Districts("?provinceId=9001");
        Assert.Equal(new[] { "Ayrık", "Merkez" }, byId.Select(x => x.GetProperty("name").GetString()));
        var byName = await Districts($"?provinceName={Uri.EscapeDataString(" Deneme İli ")}");
        Assert.Equal(new[] { 90012, 90011 }, byName.Select(x => x.GetProperty("id").GetInt32()));
        Assert.Equal(new[] { "id", "provinceId", "name", "isActive" }, byName[0].EnumerateObject().Select(x => x.Name));
        Assert.Empty(await Districts(""));
        Assert.Empty(await Districts("?provinceName=%20"));
        Assert.Empty(await Districts("?provinceName=Yok"));
        // Both given must agree.
        Assert.Empty(await Districts($"?provinceId=9002&provinceName={Uri.EscapeDataString("Deneme İli")}"));
    }

    [Fact]
    public async Task Statement_lines_carry_their_source_document()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedCustomersAsync(factory);
        var tenantA = ErpOperationCatalogTests.TenantA;
        var invoiceId = Guid.NewGuid();
        var collectionId = Guid.NewGuid();
        var looseCollectionId = Guid.NewGuid();
        var returnId = Guid.NewGuid();
        var invoiceEntryId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.SalesInvoices.Add(new SalesInvoice { Id = invoiceId, TenantId = tenantA, CustomerId = CustomerA, Code = "NXR-T1", InvoiceDate = new DateOnly(2026, 6, 1) });
            db.CustomerCollections.AddRange(
                new CustomerCollection { Id = collectionId, TenantId = tenantA, CustomerId = CustomerA, Code = "THS-T1", CollectionDate = new DateOnly(2026, 6, 2), Amount = 40m },
                new CustomerCollection { Id = looseCollectionId, TenantId = tenantA, CustomerId = CustomerA, Code = "THS-T2", CollectionDate = new DateOnly(2026, 6, 3), Amount = 5m });
            db.CustomerCollectionAllocations.Add(new CustomerCollectionAllocation { TenantId = tenantA, CustomerCollectionId = collectionId, SalesInvoiceId = invoiceId, Amount = 40m });
            db.SalesReturns.Add(new SalesReturn { Id = returnId, TenantId = tenantA, CustomerId = CustomerA, SalesInvoiceId = invoiceId, Code = "IAD-T1" });
            CustomerLedgerEntry Line(int day, CustomerLedgerDirection direction, decimal amount) => new()
            {
                TenantId = tenantA, CustomerId = CustomerA, EntryDate = new DateOnly(2026, 6, day), Direction = direction, Amount = amount, CurrencyCode = "TRY",
                Description = "Kaynaklı", CreatedAt = DateTimeOffset.UnixEpoch.AddMinutes(day)
            };
            var invoiceEntry = Line(1, CustomerLedgerDirection.Debit, 100m);
            invoiceEntry.Id = invoiceEntryId;
            invoiceEntry.SalesInvoiceId = invoiceId;
            var collectionEntry = Line(2, CustomerLedgerDirection.Credit, 40m);
            collectionEntry.CustomerCollectionId = collectionId;
            var looseEntry = Line(3, CustomerLedgerDirection.Credit, 5m);
            looseEntry.CustomerCollectionId = looseCollectionId;
            var returnEntry = Line(4, CustomerLedgerDirection.Credit, 10m);
            returnEntry.SalesReturnId = returnId;
            var reversal = Line(5, CustomerLedgerDirection.Credit, 100m);
            reversal.ReversalOfId = invoiceEntryId;
            db.CustomerLedgerEntries.AddRange(invoiceEntry, collectionEntry, looseEntry, returnEntry, reversal);
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var statement = await client.GetFromJsonAsync<JsonElement>($"/api/customers/{CustomerA:D}/statement?from=2026-06-01&to=2026-06-30");
        static string? Text(JsonElement line, string name) => line.GetProperty(name).ValueKind == JsonValueKind.Null ? null : line.GetProperty(name).GetString();
        var lines = statement.GetProperty("items").EnumerateArray()
            .Select(x => (Text(x, "sourceType"), Text(x, "sourceId"), Text(x, "sourceCode"), Text(x, "sourceOpenId"))).ToArray();
        string Id(Guid id) => id.ToString("D");
        Assert.Equal(new (string?, string?, string?, string?)[]
        {
            ("SalesInvoice", Id(invoiceId), "NXR-T1", Id(invoiceId)),
            ("CustomerCollection", Id(collectionId), "THS-T1", Id(invoiceId)),
            ("CustomerCollection", Id(looseCollectionId), "THS-T2", null),
            ("SalesReturn", Id(returnId), "IAD-T1", Id(returnId)),
            // The cancellation's reversal keeps no source key of its own: it points at the original movement's document.
            ("SalesInvoice", Id(invoiceId), "NXR-T1", Id(invoiceId)),
        }, lines);

        // A manual movement has no document.
        var manual = await client.GetFromJsonAsync<JsonElement>($"/api/customers/{CustomerA:D}/statement?from=2026-03-01&to=2026-03-31");
        var manualLine = Assert.Single(manual.GetProperty("items").EnumerateArray());
        Assert.Equal((JsonValueKind.Null, JsonValueKind.Null, JsonValueKind.Null, JsonValueKind.Null),
            (manualLine.GetProperty("sourceType").ValueKind, manualLine.GetProperty("sourceId").ValueKind,
             manualLine.GetProperty("sourceCode").ValueKind, manualLine.GetProperty("sourceOpenId").ValueKind));
    }

    [Fact]
    public async Task Supplier_statement_lines_open_the_purchase_document_and_never_another_tenants()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedCustomersAsync(factory);
        var tenantA = ErpOperationCatalogTests.TenantA;
        var invoiceId = Guid.NewGuid();
        var paymentId = Guid.NewGuid();
        var returnId = Guid.NewGuid();
        var draftId = Guid.NewGuid();
        var foreignInvoiceId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.PurchaseInvoices.AddRange(
                new PurchaseInvoice { Id = invoiceId, TenantId = tenantA, SupplierId = SupplierA, Code = "AF-T1", InvoiceDate = new DateOnly(2026, 7, 1), DueDate = new DateOnly(2026, 8, 1) },
                // Another tenant's invoice: an entry pointing at it must not reveal its number or open it.
                new PurchaseInvoice { Id = foreignInvoiceId, TenantId = ErpOperationCatalogTests.TenantB, SupplierId = OtherTenantCustomer, Code = "AF-B",
                    InvoiceDate = new DateOnly(2026, 7, 1), DueDate = new DateOnly(2026, 8, 1) });
            db.SupplierPayments.Add(new SupplierPayment { Id = paymentId, TenantId = tenantA, SupplierId = SupplierA, PurchaseInvoiceId = invoiceId, Code = "TO-T1",
                PaymentDate = new DateOnly(2026, 7, 2) });
            db.SupplierReturns.Add(new SupplierReturn { Id = returnId, TenantId = tenantA, SupplierId = SupplierA, PurchaseInvoiceId = invoiceId, Code = "AI-T1",
                ReturnDate = new DateOnly(2026, 7, 3) });
            db.PurchaseInvoiceDrafts.Add(new PurchaseInvoiceDraft { Id = draftId, TenantId = tenantA, SupplierId = SupplierA, InvoiceNumber = "TF-T1",
                InvoiceDate = new DateOnly(2026, 7, 4) });
            CustomerLedgerEntry Line(int day, CustomerLedgerDirection direction) => new()
            {
                TenantId = tenantA, CustomerId = SupplierA, EntryDate = new DateOnly(2026, 7, day), Direction = direction, Amount = 10m, CurrencyCode = "EUR",
                Description = "Kaynaklı", CreatedAt = DateTimeOffset.UnixEpoch.AddMinutes(day)
            };
            var invoice = Line(1, CustomerLedgerDirection.Credit); invoice.PurchaseInvoiceId = invoiceId;
            var payment = Line(2, CustomerLedgerDirection.Debit); payment.SupplierPaymentId = paymentId;
            var supplierReturn = Line(3, CustomerLedgerDirection.Debit); supplierReturn.SupplierReturnId = returnId;
            var draft = Line(4, CustomerLedgerDirection.Credit); draft.PurchaseInvoiceDraftId = draftId;
            var foreign = Line(5, CustomerLedgerDirection.Credit); foreign.PurchaseInvoiceId = foreignInvoiceId;
            db.CustomerLedgerEntries.AddRange(invoice, payment, supplierReturn, draft, foreign);
            await db.SaveChangesAsync();
        }
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var statement = await client.GetFromJsonAsync<JsonElement>($"/api/customers/{SupplierA:D}/statement?from=2026-07-01&to=2026-07-31");
        static string? Text(JsonElement line, string name) => line.GetProperty(name).ValueKind == JsonValueKind.Null ? null : line.GetProperty(name).GetString();
        var lines = statement.GetProperty("items").EnumerateArray()
            .Select(x => (Text(x, "sourceType"), Text(x, "sourceCode"), Text(x, "sourceOpenId"))).ToArray();
        string Id(Guid id) => id.ToString("D");
        Assert.Equal(new (string?, string?, string?)[]
        {
            ("PurchaseInvoice", "AF-T1", Id(invoiceId)),
            ("SupplierPayment", "TO-T1", Id(invoiceId)),
            ("SupplierReturn", "AI-T1", Id(returnId)),
            ("PurchaseInvoiceDraft", "TF-T1", Id(draftId)),
            ("PurchaseInvoice", null, null),
        }, lines);
    }

    [Fact]
    public async Task Card_read_returns_the_primary_address_and_the_statement_its_display_members()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        await SeedCustomersAsync(factory);
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var card = await client.GetFromJsonAsync<JsonElement>($"/api/customers/{CustomerA:D}");
        Assert.Equal(("Merkez", "Konya", "Selçuklu", "TR"), (card.GetProperty("defaultAddressLabel").GetString(),
            card.GetProperty("defaultAddressCity").GetString(), card.GetProperty("defaultAddressDistrict").GetString(),
            card.GetProperty("defaultAddressCountryCode").GetString()));
        Assert.Equal(37.87m, card.GetProperty("defaultAddressLatitude").GetDecimal());
        // Only an active default General address counts.
        var supplier = await client.GetFromJsonAsync<JsonElement>($"/api/customers/{SupplierA:D}");
        Assert.Equal(JsonValueKind.Null, supplier.GetProperty("defaultAddressId").ValueKind);

        var statement = await client.GetFromJsonAsync<JsonElement>($"/api/customers/{CustomerA:D}/statement?from=2026-02-01&to=2026-12-31");
        Assert.Equal((12m, "B", "2026-01-31", true), (statement.GetProperty("openingAmount").GetDecimal(), statement.GetProperty("openingSide").GetString(),
            statement.GetProperty("openingAsOf").GetString(), statement.GetProperty("hasForeignCurrency").GetBoolean()));
        var items = statement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal((150m, "B", JsonValueKind.Null), (items[0].GetProperty("debitAmount").GetDecimal(), items[0].GetProperty("balanceSide").GetString(),
            items[0].GetProperty("foreignCurrencyCode").ValueKind));
        Assert.Equal((200m, "A", "EUR"), (items[1].GetProperty("creditAmount").GetDecimal(), items[1].GetProperty("balanceSide").GetString(),
            items[1].GetProperty("foreignCurrencyCode").GetString()));
        Assert.Equal((38m, "A", -50m), (statement.GetProperty("closingAmount").GetDecimal(), statement.GetProperty("closingSide").GetString(),
            statement.GetProperty("netMovement").GetDecimal()));
        using var crossTenant = await client.GetAsync($"/api/customers/{OtherTenantCustomer:D}/statement?from=2026-01-01&to=2026-12-31");
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);
        using var invalid = await client.GetAsync($"/api/customers/{CustomerA:D}/statement?from=2026-05-01&to=2026-04-01");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Allowed_counts_row_conditional_rules_where_the_server_decides_per_record()
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, RowUser);
            AddUser(platform, DenyUser);
            foreach (var code in new[] { "erp.customers.read", "erp.customers.update", "erp.customers.create" })
                platform.TenantPermissionRules.Add(RowRule(code, TenantPermissionEffect.Allow, RowUser, "resource.customerType", "Customer"));
            // DenyUser: a row Allow plus an unconditional Deny on read; only a row Deny on update.
            platform.TenantPermissionRules.Add(RowRule("erp.customers.read", TenantPermissionEffect.Allow, DenyUser, "resource.customerType", "Customer"));
            platform.TenantPermissionRules.Add(RowRule("erp.customers.read", TenantPermissionEffect.Deny, DenyUser, null, null));
            platform.TenantPermissionRules.Add(RowRule("erp.customers.update", TenantPermissionEffect.Deny, DenyUser, "resource.customerType", "Supplier"));
        });
        using var client = factory.CreateClient();

        ErpOperationCatalogTests.SetIdentity(client, RowUser, "TenantUser");
        var ops = await OperationsAsync(client);
        // Collection reads filter rows, {id} routes resolve the record's attributes: the page may run them.
        foreach (var name in new[] { "cari.listele", "cari.sayaclar", "cari.getir", "cari.bakiye", "cari.ekstre", "cari.adresleri",
                     "cari.guncelle", "cari.pasifeAl", "cari.aktifEt", "cari.adres.ekle", "cari.adres.pasifeAl", "cari.ozelAlanKaydet" })
            Assert.True(ops[name], name);
        // A create has no record, so the server evaluates the rule without row attributes and rejects it.
        Assert.False(ops["cari.olustur"]);
        // company-options is a filtered read but not one the request handler marks; no locations rule at all.
        Assert.False(ops["cari.iller"]);
        Assert.False(ops["cari.gruplar"]);

        ErpOperationCatalogTests.SetIdentity(client, DenyUser, "TenantUser");
        var denied = await OperationsAsync(client);
        // An unconditional Deny still wins; a row Deny alone grants nothing.
        Assert.False(denied["cari.listele"]);
        Assert.False(denied["cari.getir"]);
        Assert.False(denied["cari.guncelle"]);

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        Assert.All((await OperationsAsync(client)).Where(x => x.Key.StartsWith("cari.", StringComparison.Ordinal)), x => Assert.True(x.Value, x.Key));
    }

    // ---- Standards ----

    [Theory]
    // customers v2 (Satış Aşama B): "Yeni sipariş" also sends orderDate for the order card; changed in place (since 1).
    [InlineData("customers", "Cari Hesaplar", 2)]
    [InlineData("customer-create", "Cari kart", 1)]
    [InlineData("customer-ledger", "Cari Hesap Hareketleri", 2)]
    public void Standard_is_preview_and_uses_catalog_operations(string key, string title, int version)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((version, "preview", title, "Satış & cari"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since >= 1 && x.Since <= version && x.Label.Length is > 0 and <= 80, x.Key));
        var operations = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).ToArray();
        Assert.All(operations, name => Assert.True(name.StartsWith("cari.", StringComparison.Ordinal) && ErpOperationCatalog.TryGet(name, out var op) && !op.Deprecated, name));
    }

    [Fact]
    public void Customers_list_follows_the_screen_view_and_reads_the_counters()
    {
        var standard = SystemPageStandards.All["customers"];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal(("customers", "liste"), (view.Key, view.Component));
        Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields("customers", out var fields));
        Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key), view.Fields.Keys);
        Assert.Equal("isActive", view.Fields["status"]);
        var props = Props("customers", "liste");
        Assert.Equal(fields.Where(x => x.DefaultVisible && x.Key != "actions").Select(x => view.Fields[x.Key]), Strings(props["columns"]));
        var labels = Strings(props["columnLabels"]).Select(x => x.Split('=', 2)).ToDictionary(x => x[0], x => x[1]);
        foreach (var field in fields.Where(x => x.Key != "actions")) Assert.Equal(field.Label, labels[view.Fields[field.Key]]);
        Assert.Equal(("server", 25), ((string)props["paging"]!, (int)props["pageSize"]!));
        Assert.Equal("{{suzgec.q}}", Binding("customers", "cariler", "q"));
        Assert.Equal("{{suzgec.type}}", Binding("customers", "cariler", "type"));
        Assert.Equal("{{suzgec.status}}", Binding("customers", "cariler", "status"));
        // Tür ve durum süzgeç alanının satırında; Pasif göstergesi süzgeç alanının Durum süzgecini süzer.
        Assert.Equal(new[] { "type|select|row|type|Cari türü", "status|select|row|status|Durum" }, Strings(Props("customers", "suzgec")["filters"]));
        Assert.Equal(("suzgec.status", "Inactive"), ((string)Props("customers", "pasifGostergesi")["filterInput"]!, (string)Props("customers", "pasifGostergesi")["filterValue"]!));
        Assert.Equal("{{suzgec.q}}", Binding("customers", "sayaclar", "q"));
        var bar = Props("customers", "komutlar");
        Assert.Equal(("@customer-create", "@customer-create", "{{cariler.meta.totalCount}}"),
            ((string)bar["newPageCode"]!, (string)bar["openPageCode"]!, (string)bar["titleCount"]!));
        Assert.Equal(new[] { "customerId={{liste.seciliSatir.id}}" }, Strings(bar["openParams"]));
        Assert.Equal(9, Strings(bar["moreButtons"]).Length);
        foreach (var (button, page) in new[] { ("yeniTeklif", "sales-quote-create"), ("yeniSiparis", "sales-order-create"),
                     ("yeniIrsaliye", "sales-delivery-create"), ("yeniFatura", "sales-invoice-create"), ("faturalarDugmesi", "sales-invoices") })
        {
            var p = Props("customers", button);
            Assert.Equal(("erpPage", page), ((string)p["actionType"]!, (string)p["pageKey"]!));
            Assert.Equal(button == "yeniSiparis" ? new[] { "customerId={{liste.seciliSatir.id}}", "orderDate={{bugun}}" }
                : new[] { "customerId={{liste.seciliSatir.id}}" }, Strings(p["params"]));
        }
        Assert.True((bool)Props("customers", "pasifeAlDugmesi")["confirmEnabled"]!);
        Assert.Equal("{{kart.rows[0].id}}", Binding("customers", "pasifeAl", "id"));
        Assert.Equal("@customer-ledger", (string)Props("customers", "hareketlerDugmesi")["pageCode"]!);
    }

    [Fact]
    public void Customer_card_is_one_standard_for_new_and_edit()
    {
        var standard = SystemPageStandards.All["customer-create"];
        Assert.Equal(new[] { new SystemPageAlias("customer-edit", "customerId") }, standard.Aliases);
        Assert.Equal("{{sayfa.parametre.customerId}}", Binding("customer-create", "kart", "id"));
        var bar = Props("customer-create", "komutlar");
        Assert.Equal(new[] { "olustur", "guncelle", "ozelKaydet" }, Strings(bar["saveSequence"]));
        Assert.True((bool)bar["saveAndNew"]!);
        Assert.Equal(new[] { "saveNew=kart.rows[0].id == null" }, Strings(bar["commandWhen"]));
        Assert.Equal(("page", "@customer-create", "@customers"), ((string)bar["newAction"]!, (string)bar["newPageCode"]!, (string)bar["afterSavePageCode"]!));
        // The primary address goes with the card in one request (dotted body parameters).
        foreach (var query in new[] { "olustur", "guncelle" })
        {
            Assert.Equal("{{il.value}}", Binding("customer-create", query, "address.city"));
            Assert.Equal("{{ulke.value}}", Binding("customer-create", query, "address.countryCode"));
            Assert.Equal("{{enlem.value}}", Binding("customer-create", query, "address.latitude"));
        }
        Assert.Equal("{{ozelAlanlar.degerler}}", Binding("customer-create", "olustur", "customFields"));
        Assert.Null(Binding("customer-create", "guncelle", "customFields"));
        Assert.Equal("{{ozelAlanlar.degerler}}", Binding("customer-create", "ozelKaydet", "values"));
        Assert.Contains("Adresler=adreslerNotu,adresTablosu,yeniAdresDugmesi", Strings(Props("customer-create", "kartSekmeleri")["tabs"]));
        Assert.Equal("{{adresTablosu.seciliSatir.id}}", Binding("customer-create", "adresPasifeAlSorgusu", "addressId"));
    }

    [Fact]
    public void Ledger_shows_the_statement_once_a_customer_is_chosen()
    {
        var standard = SystemPageStandards.All["customer-ledger"];
        var view = Assert.Single(standard.ScreenViews);
        Assert.Equal(("customer-ledger-entries", "liste"), (view.Key, view.Component));
        Assert.Equal(new Dictionary<string, string> { ["entryDate"] = "entryDate", ["source"] = "sourceCode", ["description"] = "description", ["direction"] = "direction",
            ["debit"] = "debitAmount", ["credit"] = "creditAmount", ["balance"] = "balanceAmount", ["currencyCode"] = "currencyCode" }, view.Fields);
        // No wizard: the customer lookup sits in the filter card; the statement shows as soon as it has a value.
        var selection = Props("customer-ledger", "cariSecimi");
        Assert.Equal(("lookup", "cariListesi", "id"), ((string)selection["inputType"]!, (string)selection["optionsQuery"]!, (string)selection["optionValueColumn"]!));
        Assert.Equal("{{sayfa.parametre.customerId}}", (string)selection["defaultValue"]!);
        Assert.Equal("{{cariSecimi.search}}", Binding("customer-ledger", "cariListesi", "q"));
        Assert.Equal(new[] { "cariSecimi", "baslangic", "bitis" }, Strings(Props("customer-ledger", "suzgecKarti")["inputs"]));
        Assert.Equal("cariSecimi.value == null", (string)Props("customer-ledger", "secimIpucu")["visibleWhen"]!);
        foreach (var id in new[] { "secilenCari", "liste" }) Assert.Equal("cariSecimi.value != null", (string)Props("customer-ledger", id)["visibleWhen"]!);
        Assert.False(Props("customer-ledger", "secilenCari").ContainsKey("buttons"));
        Assert.Equal(("{{cariSecimi.value}}", "{{baslangic.value}}", "{{bitis.value}}"),
            (Binding("customer-ledger", "ekstre", "id"), Binding("customer-ledger", "ekstre", "from"), Binding("customer-ledger", "ekstre", "to")));
        Assert.Equal("{{tarih.yilBasi}}", (string)Props("customer-ledger", "baslangic")["defaultValue"]!);
        Assert.Equal(new[] { "baslangic={{tarih.ucAyOnce}}", "bitis={{bugun}}" }, Strings(Props("customer-ledger", "sonUcAy")["assignments"]));
        Assert.Equal(new[] { "debitAmount=foreignCurrencyCode", "creditAmount=foreignCurrencyCode", "balanceAmount=balanceSide" },
            Strings(Props("customer-ledger", "liste")["columnUnits"]));
        Assert.Equal("{{ekstre.satirSayisi}}", (string)Props("customer-ledger", "komutlar")["titleCount"]!);
    }

    [Fact]
    public void Ledger_lines_go_to_their_document_one_button_per_kind()
    {
        var liste = Props("customer-ledger", "liste");
        Assert.Equal(new[] { "entryDate", "sourceType", "sourceCode", "description" }, Strings(liste["columns"]).Take(4));
        Assert.Contains("sourceType:CustomerCollection=Tahsilat", Strings(liste["valueLabels"]));
        Assert.Contains("sourceType:PurchaseInvoiceDraft=Alış faturası taslağı", Strings(liste["valueLabels"]));
        var expected = new (string Id, string Page, string Kinds, string[] Params)[]
        {
            ("belgeSatisFaturasi", "sales-invoices", "SalesInvoice", ["invoiceId={{liste.seciliSatir.sourceOpenId}}"]),
            ("belgeTahsilat", "sales-invoices", "CustomerCollection", ["invoiceId={{liste.seciliSatir.sourceOpenId}}", "tab=transactions"]),
            ("belgeSatisIadesi", "sales-returns", "SalesReturn", ["returnId={{liste.seciliSatir.sourceOpenId}}"]),
            ("belgeAlisFaturasi", "sales-purchase-invoices", "PurchaseInvoice|SupplierPayment", ["invoiceId={{liste.seciliSatir.sourceOpenId}}"]),
            ("belgeAlisIadesi", "sales-purchase-returns", "SupplierReturn", ["returnId={{liste.seciliSatir.sourceOpenId}}"]),
            ("belgeTaslak", "sales-purchase-invoice-drafts", "PurchaseInvoiceDraft", ["draftId={{liste.seciliSatir.sourceOpenId}}"]),
        };
        Assert.Equal(expected.Select(x => x.Id), Strings(liste["rowActions"]));
        // Every kind has exactly one button, so a line with a document draws one "Belgeye git ›"; a manual line draws none.
        Assert.Equal(7, expected.SelectMany(x => x.Kinds.Split('|')).Distinct().Count());
        foreach (var (id, page, kinds, parameters) in expected)
        {
            var props = Props("customer-ledger", id);
            Assert.Equal(("Belgeye git ›", "erpPage", page, "newTab", true), ((string)props["text"]!, (string)props["actionType"]!, (string)props["pageKey"]!,
                (string)props["target"]!, (bool)props["legacyScreen"]!));
            Assert.Equal(parameters, Strings(props["params"]));
            Assert.Equal(string.Join(" || ", kinds.Split('|').Select(k => $"liste.seciliSatir.sourceType == '{k}'")), (string)props["visibleWhen"]!);
            Assert.Equal("liste.seciliSatir.sourceOpenId == null", (string)props["disabledWhen"]!);
        }
        // A firm's v1 design has no row buttons: the restricted v1 table drops them and still validates.
        var v1 = SystemPageStandards.Restrict(SystemPageStandards.All["customer-ledger"], 1);
        Assert.True(TenantCustomPageSchema.Validate(v1, out var v1Error), v1Error);
        Assert.Null(Props(JsonNode.Parse(v1)!.AsObject(), "liste")["rowActions"]);
    }

    // ---- Schema additions ----

    [Fact]
    public void Schema_accepts_declared_dotted_parameters_on_operation_queries_only()
    {
        var definition = Definition("customer-create");
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error), error);

        AddParameter(definition, "olustur", "address.unknown", "{{il.value}}", "text");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("address.unknown", error);

        definition = Definition("customer-create");
        AddParameter(definition, "olustur", "address.city.name", "{{il.value}}", "text");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("parametre adları", error);

        definition = Definition("customer-create");
        AddParameter(definition, "olustur", "address.__proto__", "{{il.value}}", "text");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));

        definition = Definition("customer-create");
        Parameter(definition, "olustur", "address.latitude")["type"] = "text";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("decimal", error);

        // SQL queries keep plain parameter names.
        var sql = """{"schemaVersion":2,"components":[],"queries":[{"id":"q","name":"q","kind":"read","sql":"SELECT @a_b AS x","runOn":"load","parameters":[{"name":"a.b","binding":"{{bugun}}","type":"text"}]}]}""";
        Assert.False(TenantCustomPageSchema.Validate(sql, out _));
        Assert.True(TenantCustomPageSchema.IsDottedParameterName("address.city"));
        Assert.False(TenantCustomPageSchema.IsDottedParameterName("address"));
        Assert.False(TenantCustomPageSchema.IsDottedParameterName("a.b.c"));
    }

    [Fact]
    public void Schema_save_and_new_needs_a_save_and_a_new_command()
    {
        var definition = Definition("customer-create");
        Props(definition, "komutlar")["saveAndNew"] = "evet";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error));
        Assert.Contains("saveAndNew", error);

        definition = Definition("customer-create");
        foreach (var key in new[] { "newAction", "newPageCode", "newTarget" }) Props(definition, "komutlar").Remove(key);
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("Yeni komutu", error);

        definition = Definition("customer-create");
        foreach (var key in new[] { "saveSequence", "stopOnError", "sequenceWhen" }) Props(definition, "komutlar").Remove(key);
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("kayıt", error);

        definition = Definition("customer-create");
        Props(definition, "kartBasligi")["saveAndNew"] = true;
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("İşlem Çubuğu", error);

        // saveNew is a commandWhen key, not a hidden command.
        definition = Definition("customer-create");
        Props(definition, "komutlar")["hiddenCommands"] = new JsonArray("saveNew");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));

        definition = Definition("customer-create");
        Props(definition, "komutlar")["saveAndNew"] = false;
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error), error);
    }

    [Fact]
    public void Schema_erp_page_buttons_take_params_and_navigable_screens()
    {
        var definition = Definition("customers");
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error), error);

        Props(definition, "yeniSiparis")["pageKey"] = "sales-unknown-create";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("ERP ekranı bulunamadı", error);

        definition = Definition("customers");
        Props(definition, "yeniSiparis")["params"] = new JsonArray("CustomerId=x");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));

        // params stays refused on actions that do not navigate to a page or screen.
        definition = Definition("customers");
        Props(definition, "pasifeAlDugmesi")["params"] = new JsonArray("customerId={{liste.seciliSatir.id}}");
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error));
        Assert.Contains("erpPage", error);

        Assert.Contains("sales-order-create", StandardMenuEndpoints.NavigablePageKeys);
        Assert.DoesNotContain("sales-order-create", StandardMenuEndpoints.PageKeys);
        Assert.Superset(new HashSet<string>(StandardMenuEndpoints.PageKeys), new HashSet<string>(StandardMenuEndpoints.NavigablePageKeys));
    }

    [Fact]
    public void Schema_knows_the_tarih_scope_root()
    {
        var definition = Definition("customer-ledger");
        Props(definition, "tarihUyarisi")["visibleWhen"] = "baslangic.value < tarih.yilBasi";
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out var error), error);

        // tarih is not reserved (saved pages have inputs named "tarih"); such a page name shadows the root.
        definition = Definition("customer-ledger");
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == "altBilgi")["name"] = "tarih";
        Assert.True(TenantCustomPageSchema.Validate(definition.ToJsonString(), out error), error);
        definition = Definition("customer-ledger");
        Props(definition, "tarihUyarisi")["visibleWhen"] = "baslangic.value < takvim.yilBasi";
        Assert.False(TenantCustomPageSchema.Validate(definition.ToJsonString(), out _));
    }

    [Theory]
    [InlineData("""[{"key":"customer-edit","param":"customerId"}]""", null)]
    [InlineData("""[{"key":"customer-create","param":"customerId"}]""", "takma ad anahtarı")]
    [InlineData("""[{"key":"customers","param":"customerId"}]""", "başka bir standardın")]
    [InlineData("""[{"key":"customer-edit","param":"stockItemId"}]""", "okunmuyor")]
    [InlineData("""[{"key":"customer-edit","param":"Customer-Id"}]""", "param")]
    [InlineData("""[{"key":"customer-edit","param":"customerId","x":1}]""", "key ve param")]
    [InlineData("""{"key":"customer-edit"}""", "dizi")]
    public void Standard_aliases_are_validated(string aliases, string? expected)
    {
        var files = SystemPageStandards.EmbeddedFiles().Select(file =>
        {
            if (file.FileName != "customer-create.json") return file;
            var root = JsonNode.Parse(file.Json)!.AsObject();
            root["aliases"] = JsonNode.Parse(aliases);
            return (file.FileName, root.ToJsonString());
        }).ToArray();
        var errors = SystemPageStandards.Validate(files);
        if (expected is null) Assert.Empty(errors);
        else Assert.Contains(errors, x => x.Contains(expected, StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("customers", "customersOperations.fixture.json")]
    [InlineData("customer-create", "customerCreateOperations.fixture.json")]
    [InlineData("customer-ledger", "customerLedgerOperations.fixture.json")]
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

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    // ---- Helpers ----

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
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "Row user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = "TenantUser" });
        // The operation catalog itself is read with the runtime (custom menus) permission.
        platform.TenantPermissionRules.Add(RowRule("erp.custom-menus.read", TenantPermissionEffect.Allow, id, null, null));
    }

    private static TenantPermissionRule RowRule(string code, TenantPermissionEffect effect, Guid user, string? attribute, string? value) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = effect, IsActive = true,
        AttributeName = attribute, AttributeOperator = attribute is null ? null : TenantPermissionConditionOperator.Equals, AttributeValue = value
    };

    private static async Task SeedCustomersAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var tenantA = ErpOperationCatalogTests.TenantA;
        var customer = new CustomerAccount { Id = CustomerA, TenantId = tenantA, Code = "C-1001", Name = "Örnek Müşteri", Type = CounterpartyType.Customer,
            CurrencyCode = "TRY", IsActive = true, IsEInvoiceRegistered = true, RiskLimit = 1000m };
        var supplier = new CustomerAccount { Id = SupplierA, TenantId = tenantA, Code = "S-2001", Name = "TEDARİK A.Ş.", Type = CounterpartyType.Supplier,
            CurrencyCode = "EUR", IsActive = true, RiskLimit = 50m };
        var passive = new CustomerAccount { Id = PassiveA, TenantId = tenantA, Code = "C-1003", Name = "Eski Müşteri", Type = CounterpartyType.Customer,
            CurrencyCode = "TRY", IsActive = false };
        var other = new CustomerAccount { Id = OtherTenantCustomer, TenantId = ErpOperationCatalogTests.TenantB, Code = "X-1", Name = "TEDARİK B",
            Type = CounterpartyType.Supplier, CurrencyCode = "TRY", IsActive = true };
        db.CustomerAccounts.AddRange(customer, supplier, passive, other);
        db.CustomerAddresses.AddRange(
            new CustomerAddress { TenantId = tenantA, CustomerId = CustomerA, Kind = CustomerAddressKind.General, Label = "Merkez", AddressLine = "Feritpaşa Mah.",
                City = "Konya", District = "Selçuklu", CountryCode = "TR", IsDefault = true, IsActive = true, Latitude = 37.87m, Longitude = 32.48m },
            new CustomerAddress { TenantId = tenantA, CustomerId = CustomerA, Kind = CustomerAddressKind.Billing, Label = "Fatura", AddressLine = "Başka",
                City = "Ankara", CountryCode = "TR", IsDefault = true, IsActive = true },
            new CustomerAddress { TenantId = tenantA, CustomerId = SupplierA, Kind = CustomerAddressKind.General, Label = "Eski", AddressLine = "Pasif",
                City = "İzmir", CountryCode = "TR", IsDefault = true, IsActive = false });
        CustomerLedgerEntry Entry(DateOnly date, CustomerLedgerDirection direction, decimal amount, string currency) => new()
        {
            TenantId = tenantA, CustomerId = CustomerA, EntryDate = date, Direction = direction, Amount = amount, CurrencyCode = currency, Description = "Sentetik"
        };
        db.CustomerLedgerEntries.AddRange(
            Entry(new DateOnly(2026, 1, 10), CustomerLedgerDirection.Debit, 12m, "TRY"),
            Entry(new DateOnly(2026, 3, 5), CustomerLedgerDirection.Debit, 150m, "TRY"),
            Entry(new DateOnly(2026, 4, 13), CustomerLedgerDirection.Credit, 200m, "EUR"));
        await db.SaveChangesAsync();
    }

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(JsonObject definition, string id) =>
        definition["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static JsonObject Props(string key, string id) => Props(Definition(key), id);

    private static JsonObject Parameter(JsonObject definition, string queryId, string name) =>
        definition["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().Single(x => (string)x["name"]! == name);

    private static void AddParameter(JsonObject definition, string queryId, string name, string binding, string type) =>
        definition["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .Add(new JsonObject { ["name"] = name, ["binding"] = binding, ["type"] = type });

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
