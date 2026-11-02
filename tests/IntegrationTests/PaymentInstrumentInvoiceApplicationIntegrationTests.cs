using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class PaymentInstrumentInvoiceApplicationIntegrationTests
{
    [Fact]
    public async Task Collected_receivable_instrument_can_be_partially_applied_once_to_matching_invoice()
    {
        var tenantId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var instrumentId = Guid.NewGuid();
        var databaseName = $"instrument-invoice-{Guid.NewGuid():N}";
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        await using (var seed = new TenantDbContext(options))
        {
            var tenant = new Tenant { Id = tenantId, Name = "Synthetic tenant", Slug = $"instrument-{tenantId:N}" };
            var customer = new CustomerAccount { Id = customerId, TenantId = tenantId, Tenant = tenant, Code = "CUS-1", Name = "Synthetic customer" };
            seed.Tenants.Add(tenant);
            seed.CustomerAccounts.Add(customer);
            seed.SalesInvoices.Add(new SalesInvoice
            {
                Id = invoiceId, TenantId = tenantId, Tenant = tenant, CustomerId = customerId, Customer = customer,
                DeliveryId = Guid.NewGuid(), OrderId = Guid.NewGuid(), Code = "INV-1", InvoiceDate = new DateOnly(2026, 1, 1),
                CurrencyCode = "TRY", GrandTotal = 500m, Subtotal = 500m
            });
            seed.PaymentInstruments.Add(new PaymentInstrument
            {
                Id = instrumentId, TenantId = tenantId, Tenant = tenant, RequestId = Guid.NewGuid(), Type = PaymentInstrumentType.Check,
                Direction = PaymentInstrumentDirection.Receivable, Status = PaymentInstrumentStatus.Collected, Code = "CHK-1",
                InstrumentNumber = "001", CounterpartyName = customer.Name, CounterpartyAccountId = customerId,
                BankName = "Synthetic bank", CurrencyCode = "TRY", Amount = 300m, IssueDate = new DateOnly(2026, 1, 1),
                DueDate = new DateOnly(2026, 2, 1), PortfolioDate = new DateOnly(2026, 1, 1), RowVersion = [1, 0, 0, 0, 0, 0, 0, 0]
            });
            await seed.SaveChangesAsync();
        }

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(db => db.UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPaymentInstrumentEndpoints();
        await app.StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));

        var requestId = Guid.NewGuid();
        var rowVersion = Convert.ToBase64String([1, 0, 0, 0, 0, 0, 0, 0]);
        var payload = new { requestId, rowVersion, invoiceId, amount = 120m, eventDate = "2026-02-01" };
        using var applied = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{instrumentId}/apply-to-invoice", payload);
        Assert.True(applied.StatusCode == HttpStatusCode.OK, await applied.Content.ReadAsStringAsync());
        using var replay = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{instrumentId}/apply-to-invoice", payload);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        using var overInstrumentBalance = await client.PostAsJsonAsync($"/api/finance/payment-instruments/{instrumentId}/apply-to-invoice", new
        {
            requestId = Guid.NewGuid(), rowVersion, invoiceId, amount = 181m, eventDate = "2026-02-02"
        });
        Assert.Equal(HttpStatusCode.Conflict, overInstrumentBalance.StatusCode);

        await using var verify = new TenantDbContext(options);
        Assert.Equal(1, await verify.CustomerCollections.CountAsync(x => x.TenantId == tenantId && x.Reference == $"PaymentInstrument:{instrumentId:D}"));
        Assert.Equal(120m, await verify.CustomerCollectionAllocations.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoiceId).SumAsync(x => x.Amount));
        Assert.Equal(1, await verify.PaymentInstrumentEvents.CountAsync(x => x.TenantId == tenantId && x.EventType == "AppliedToInvoice"));
        Assert.Equal(1, await verify.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.instrument.applied-to-invoice"));
        Assert.Empty(await verify.FinancialAccountTransactions.Where(x => x.TenantId == tenantId).ToListAsync());
    }
}
