using System.Net;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CashForecastIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Forecast_rolls_open_cash_forward_and_nets_invoice_returns_payments_and_instruments_by_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=2")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var response = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=2");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, json.RootElement.GetProperty("currencies").GetArrayLength());
        var tryForecast = json.RootElement.GetProperty("currencies").EnumerateArray()
            .Single(x => x.GetProperty("currencyCode").GetString() == "TRY");
        var months = tryForecast.GetProperty("months").EnumerateArray().ToArray();
        Assert.Equal(2, months.Length);
        Assert.Equal(1000m, months[0].GetProperty("openingBalance").GetDecimal());
        Assert.Equal(700m, months[0].GetProperty("receivables").GetDecimal());
        Assert.Equal(350m, months[0].GetProperty("payables").GetDecimal());
        Assert.Equal(30m, months[0].GetProperty("postedMovements").GetDecimal());
        Assert.Equal(700m, months[0].GetProperty("overdueReceivables").GetDecimal());
        Assert.Equal(80m, months[0].GetProperty("overdueInstrumentReceivables").GetDecimal());
        Assert.Equal(25m, months[0].GetProperty("overdueInstrumentPayables").GetDecimal());
        Assert.Equal(1435m, months[0].GetProperty("closingBalance").GetDecimal());
        Assert.Equal(200m, months[1].GetProperty("instrumentReceivables").GetDecimal());
        Assert.Equal(1635m, months[1].GetProperty("closingBalance").GetDecimal());
        Assert.Equal(1635m, months[1].GetProperty("baseCurrencyClosingBalance").GetDecimal());

        var usdForecast = json.RootElement.GetProperty("currencies").EnumerateArray()
            .Single(x => x.GetProperty("currencyCode").GetString() == "USD");
        var usdJanuary = usdForecast.GetProperty("months")[0];
        Assert.Equal(100m, usdJanuary.GetProperty("openingBalance").GetDecimal());
        Assert.Equal(3200m, usdJanuary.GetProperty("baseCurrencyClosingBalance").GetDecimal());
        Assert.Equal(32m, usdJanuary.GetProperty("appliedExchangeRate").GetDecimal());
        Assert.Equal("2026-01-01", usdJanuary.GetProperty("appliedExchangeRateDate").GetString());

        using var invalidHorizon = await client.GetAsync("/api/finance/cash-flow/forecast?months=25");
        Assert.Equal(HttpStatusCode.BadRequest, invalidHorizon.StatusCode);
        using var invalidCurrency = await client.GetAsync("/api/finance/cash-flow/forecast?currencyCode=TRY1");
        Assert.Equal(HttpStatusCode.BadRequest, invalidCurrency.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var otherTenant = await client.GetAsync("/api/finance/cash-flow/forecast?from=2026-01-01&months=2");
        Assert.True(otherTenant.IsSuccessStatusCode, await otherTenant.Content.ReadAsStringAsync());
        using var otherJson = JsonDocument.Parse(await otherTenant.Content.ReadAsStringAsync());
        var tenantBCurrency = Assert.Single(otherJson.RootElement.GetProperty("currencies").EnumerateArray());
        Assert.Equal("USD", tenantBCurrency.GetProperty("currencyCode").GetString());
        Assert.Equal(50m, tenantBCurrency.GetProperty("months")[0].GetProperty("openingBalance").GetDecimal());
        Assert.Equal(JsonValueKind.Null, tenantBCurrency.GetProperty("months")[0].GetProperty("baseCurrencyClosingBalance").ValueKind);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        var dbName = $"cash-forecast-{Guid.NewGuid():N}"; var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase(dbName, root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization(); var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization();
        app.MapTenantCashForecastEndpoints(); await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "A", Slug = "cash-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "B", Slug = "cash-b" };
        var cashA = new FinancialAccount { TenantId = TenantA, Code = "100", Name = "TRY bank", Type = FinancialAccountType.Bank };
        var cashAUsd = new FinancialAccount { TenantId = TenantA, Code = "101", Name = "USD bank", Type = FinancialAccountType.Bank, CurrencyCode = "USD" };
        var cashB = new FinancialAccount { TenantId = TenantB, Code = "200", Name = "USD bank", Type = FinancialAccountType.Bank, CurrencyCode = "USD" };
        var warehouse = new Warehouse { TenantId = TenantA, Code = "MAIN", Name = "Main" };
        db.Tenants.AddRange(tenantA, tenantB); db.FinancialAccounts.AddRange(cashA, cashAUsd, cashB);
        db.Warehouses.Add(warehouse);
        db.FinancialAccountTransactions.AddRange(
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = cashA.Id, CurrencyCode = "TRY", TransactionDate = new DateOnly(2025, 12, 31), Direction = FinancialDirection.Inflow, Amount = 1000m, Description = "Opening" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = cashA.Id, CurrencyCode = "TRY", TransactionDate = new DateOnly(2026, 1, 15), Direction = FinancialDirection.Inflow, Amount = 30m, Description = "Future posted" },
            new FinancialAccountTransaction { TenantId = TenantA, FinancialAccountId = cashAUsd.Id, CurrencyCode = "USD", TransactionDate = new DateOnly(2025, 12, 31), Direction = FinancialDirection.Inflow, Amount = 100m, Description = "USD opening" },
            new FinancialAccountTransaction { TenantId = TenantB, FinancialAccountId = cashB.Id, CurrencyCode = "USD", TransactionDate = new DateOnly(2025, 12, 31), Direction = FinancialDirection.Inflow, Amount = 50m, Description = "Other opening" });
        db.TenantExchangeRates.Add(new TenantExchangeRate
        {
            TenantId = TenantA, CurrencyCode = "USD", RateDate = new DateOnly(2026, 1, 1), Revision = 1, Rate = 32m, Source = "Integration test"
        });

        var customer = new CustomerAccount { TenantId = TenantA, Code = "C-1", Name = "Customer", Type = CounterpartyType.Customer, PaymentTermDays = 30 };
        var supplier = new CustomerAccount { TenantId = TenantA, Code = "S-1", Name = "Supplier", Type = CounterpartyType.Supplier };
        var sale = new SalesInvoice { TenantId = TenantA, CustomerId = customer.Id, Customer = customer, Code = "SI-1", InvoiceDate = new DateOnly(2025, 12, 1), CurrencyCode = "TRY", GrandTotal = 1000m };
        var collection = new CustomerCollection { TenantId = TenantA, CustomerId = customer.Id, Customer = customer, Code = "RC-1", CurrencyCode = "TRY", Amount = 200m, CollectionDate = new DateOnly(2025, 12, 10) };
        db.CustomerCollectionAllocations.Add(new CustomerCollectionAllocation { TenantId = TenantA, CustomerCollectionId = collection.Id, CustomerCollection = collection, SalesInvoiceId = sale.Id, SalesInvoice = sale, Amount = 200m });
        db.SalesReturns.Add(new SalesReturn { TenantId = TenantA, SalesInvoiceId = sale.Id, SalesInvoice = sale, CustomerId = customer.Id, Customer = customer,
            Code = "SR-1", ReturnDate = new DateOnly(2025, 12, 12), GrandTotal = 100m });
        var purchase = new PurchaseInvoice { TenantId = TenantA, SupplierId = supplier.Id, Supplier = supplier, Code = "PI-1", InvoiceDate = new DateOnly(2025, 12, 1), DueDate = new DateOnly(2026, 1, 15), GrandTotal = 500m };
        db.SupplierPayments.Add(new SupplierPayment { TenantId = TenantA, PurchaseInvoiceId = purchase.Id, PurchaseInvoice = purchase, SupplierId = supplier.Id, Supplier = supplier,
            Code = "SP-1", PaymentDate = new DateOnly(2025, 12, 15), Amount = 100m });
        db.SupplierReturns.Add(new SupplierReturn { TenantId = TenantA, PurchaseInvoiceId = purchase.Id, PurchaseInvoice = purchase, SupplierId = supplier.Id, Supplier = supplier,
            WarehouseId = warehouse.Id, Warehouse = warehouse, Code = "SUPR-1", ReturnDate = new DateOnly(2025, 12, 20), GrandTotal = 50m });
        db.SalesInvoices.Add(sale); db.CustomerCollections.Add(collection); db.PurchaseInvoices.Add(purchase);
        db.PaymentInstruments.AddRange(
            new PaymentInstrument { TenantId = TenantA, Code = "CH-1", InstrumentNumber = "001", CounterpartyName = "Customer", BankName = "Bank", CurrencyCode = "TRY", Amount = 200m, IssueDate = new DateOnly(2026, 1, 1), DueDate = new DateOnly(2026, 2, 20), PortfolioDate = new DateOnly(2026, 1, 1), Direction = PaymentInstrumentDirection.Receivable },
            new PaymentInstrument { TenantId = TenantA, Code = "CH-OLD", InstrumentNumber = "003", CounterpartyName = "Overdue customer", BankName = "Bank", CurrencyCode = "TRY", Amount = 80m, IssueDate = new DateOnly(2025, 11, 1), DueDate = new DateOnly(2025, 12, 20), PortfolioDate = new DateOnly(2025, 11, 1), Direction = PaymentInstrumentDirection.Receivable },
            new PaymentInstrument { TenantId = TenantA, Code = "SN-OLD", InstrumentNumber = "004", CounterpartyName = "Overdue supplier", BankName = "Bank", CurrencyCode = "TRY", Amount = 25m, IssueDate = new DateOnly(2025, 11, 1), DueDate = new DateOnly(2025, 12, 22), PortfolioDate = new DateOnly(2025, 11, 1), Direction = PaymentInstrumentDirection.Payable },
            new PaymentInstrument { TenantId = TenantA, Code = "CH-2", InstrumentNumber = "002", CounterpartyName = "Cancelled", BankName = "Bank", CurrencyCode = "TRY", Amount = 90m, IssueDate = new DateOnly(2026, 1, 1), DueDate = new DateOnly(2026, 2, 1), PortfolioDate = new DateOnly(2026, 1, 1), Direction = PaymentInstrumentDirection.Receivable, Status = PaymentInstrumentStatus.Cancelled });
        await db.SaveChangesAsync(); return app;
    }
}
