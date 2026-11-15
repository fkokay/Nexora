using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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

/// <summary>
/// Internal document series (goods receipt, journal entry, returns, settlements, transfers, cost adjustments) replace
/// the former GUID codes with short yearly sequences per tenant. Runs on the in-memory provider; the SQL Server counter
/// lock and the rollback/replay behaviour of the posting routes are covered by <see cref="InternalDocumentNumberingSqlAcceptanceTests"/>.
/// </summary>
public sealed class InternalDocumentNumberingIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Internal_series_are_sequential_per_tenant_per_type_and_reset_yearly()
    {
        await using var db = NewInMemoryDb();
        var date = new DateOnly(2026, 11, 15);
        Task<string> Next(Guid tenantId, string type, DateOnly? on = null) =>
            TenantDocumentNumbering.NextAsync(db, tenantId, type, null, on ?? date, CancellationToken.None);

        Assert.Equal("GR-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.PurchaseReceipt));
        Assert.Equal("GR-2026-000002", await Next(TenantA, TenantDocumentNumbering.Internal.PurchaseReceipt));
        Assert.Equal("GR-2026-000001", await Next(TenantB, TenantDocumentNumbering.Internal.PurchaseReceipt));
        Assert.Equal("GR-2027-000001", await Next(TenantA, TenantDocumentNumbering.Internal.PurchaseReceipt, new DateOnly(2027, 1, 2)));
        Assert.Equal("GR-2026-000003", await Next(TenantA, TenantDocumentNumbering.Internal.PurchaseReceipt));

        Assert.Equal("YV-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.JournalEntry));
        Assert.Equal("RET-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.SalesReturn));
        Assert.Equal("SRT-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.SupplierReturn));
        Assert.Equal("RCPT-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.CustomerCollection));
        Assert.Equal("PAY-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.SupplierPayment));
        Assert.Equal("TR-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.InventoryTransfer));
        Assert.Equal("TR-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.FinancialTransfer));
        Assert.Equal("RV-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.InventoryRevaluation));
        Assert.Equal("RVX-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.InventoryRevaluationReversal));
        Assert.Equal("LC-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.LandedCost));
        Assert.Equal("LCV-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.LandedCostReversal));
        Assert.Equal("IC-2026-000001", await Next(TenantA, TenantDocumentNumbering.Internal.InvoiceCostDifference));

        var counters = await db.TenantDocumentNumberCounters.AsNoTracking().ToListAsync();
        Assert.All(counters, x => Assert.True(x.DocumentType.Length <= 32, x.DocumentType));
        Assert.Equal(3, counters.Single(x => x.TenantId == TenantA && x.DocumentType == "PurchaseReceipt" && x.PeriodKey == "2026").LastValue);
        Assert.Equal(1, counters.Single(x => x.TenantId == TenantB && x.DocumentType == "PurchaseReceipt" && x.PeriodKey == "2026").LastValue);
    }

    [Fact]
    public async Task Internal_series_are_not_tenant_editable_nor_reservable_through_the_template_api()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var list = await client.GetAsync("/api/document-number-templates/");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using (var listJson = JsonDocument.Parse(await list.Content.ReadAsStringAsync()))
            Assert.DoesNotContain(listJson.RootElement.EnumerateArray(), x => x.GetProperty("documentType").GetString() is "PurchaseReceipt" or "JournalEntry");

        using var put = await client.PutAsJsonAsync("/api/document-number-templates/", new { documentType = "PurchaseReceipt", pattern = "X-{SEQ:3}", resetsYearly = true });
        Assert.Equal(HttpStatusCode.BadRequest, put.StatusCode);
        using var next = await client.PostAsync("/api/document-number-templates/JournalEntry/next", null);
        Assert.Equal(HttpStatusCode.NotFound, next.StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(0, await db.TenantDocumentNumberCounters.CountAsync());
        Assert.Equal(0, await db.TenantDocumentNumberTemplates.CountAsync());
    }

    private static TenantDbContext NewInMemoryDb() =>
        new(new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase($"internal-numbering-{Guid.NewGuid():N}").Options);

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"internal-numbering-api-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddAuthentication("numbering-test").AddScheme<AuthenticationSchemeOptions, FiscalCloseTestAuthenticationHandler>("numbering-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantDocumentNumbering();
        await app.StartAsync();
        return app;
    }
}
