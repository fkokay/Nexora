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

public sealed class StandaloneSupplierInvoiceDraftIntegrationTests
{
    [Fact]
    public async Task Standalone_invoice_can_be_saved_without_order_or_receipt_and_has_no_posting_effects()
    {
        var tenantId = Guid.NewGuid();
        var dbName = $"standalone-invoice-draft-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantId, Name = "Draft tenant", Slug = $"draft-{tenantId:N}" };
        var supplier = new CustomerAccount
        {
            TenantId = tenantId,
            Tenant = tenant,
            Code = "SUP-001",
            Name = "Draft supplier",
            Type = CounterpartyType.Supplier,
            CurrencyCode = "TRY",
            IsActive = true,
        };

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{dbName}-platform")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("standalone-invoice-draft-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("standalone-invoice-draft-test", _ => { });
        builder.Services.AddAuthorization();

        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPurchaseInvoiceDraftEndpoints();
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.Add(tenant);
            db.CustomerAccounts.Add(supplier);
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var request = new StandaloneSupplierInvoiceDraftCreateRequest(
            Guid.NewGuid(), supplier.Id, "INV-DRAFT-001", new DateOnly(2026, 10, 24), null, "TRY", "No order or receipt",
            100m, 0m, 20m, 120m,
            [new StandaloneSupplierInvoiceDraftLineCreateRequest(1, "Consulting service", 1m, "EA", 100m, 100m, 0m, 20m, 120m)]);

        using var response = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
        Assert.NotNull(created);
        Assert.Equal("Draft", created.Status);
        Assert.Equal(supplier.Id, created.SupplierId);
        Assert.Single(created.Lines);

        // Replaying the same request is idempotent and still only records the source draft.
        using var replayResponse = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", request);
        Assert.Equal(HttpStatusCode.OK, replayResponse.StatusCode);
        var replay = await replayResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
        Assert.NotNull(replay);
        Assert.Equal(created.Id, replay.Id);

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await verifyDb.PurchaseInvoiceDrafts.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(1, await verifyDb.PurchaseInvoiceDraftLines.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.PurchaseOrders.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.PurchaseReceipts.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.PurchaseInvoices.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.InventoryTransactions.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.JournalEntries.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.SupplierPayments.CountAsync(x => x.TenantId == tenantId));
    }
}
