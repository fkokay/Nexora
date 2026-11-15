using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// The module journal transfer dry run (<c>POST /transfer/preview</c>) must show exactly the lines <c>POST /transfer</c>
/// persists, report blocking conditions as <c>canTransfer=false</c> instead of errors, and never write journal or audit rows.
/// Runs on the in-memory provider, so the SQL Server tenant row lock of the transfer is not exercised here.
/// </summary>
public sealed class GeneralLedgerTransferPreviewIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid InvoiceId = Guid.Parse("cccccccc-0000-0000-0000-000000000001");
    private static readonly Guid ReceivableId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000120");
    private static readonly Guid RevenueId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000600");
    private static readonly Guid TaxId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000391");

    [Fact]
    public async Task Preview_lines_equal_the_lines_of_the_transferred_sales_invoice_entry_and_preview_writes_nothing()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var before = await CountsAsync(app);

        using var previewResponse = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", Request());
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        using var preview = JsonDocument.Parse(await previewResponse.Content.ReadAsStringAsync());
        var root = preview.RootElement;
        Assert.True(root.GetProperty("canTransfer").GetBoolean(), root.ToString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("blockingReason").ValueKind);
        Assert.Equal("SalesInvoice", root.GetProperty("sourceType").GetString());
        Assert.Equal("SF-2026-001", root.GetProperty("code").GetString());
        Assert.Equal("2026-03-10", root.GetProperty("entryDate").GetString());
        Assert.Equal("Satış faturası · SF-2026-001", root.GetProperty("description").GetString());
        Assert.Equal(1200m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(1200m, root.GetProperty("totalCredit").GetDecimal());
        var previewLines = root.GetProperty("lines").EnumerateArray().Select(line => (
            LineNumber: line.GetProperty("lineNumber").GetInt32(),
            AccountId: line.GetProperty("accountId").GetGuid(),
            Description: line.GetProperty("description").GetString()!,
            Debit: line.GetProperty("debit").GetDecimal(),
            Credit: line.GetProperty("credit").GetDecimal())).ToList();
        Assert.Equal(3, previewLines.Count);
        var receivableLine = root.GetProperty("lines")[0];
        Assert.Equal("120", receivableLine.GetProperty("accountCode").GetString());
        Assert.Equal("Alıcılar", receivableLine.GetProperty("accountName").GetString());
        Assert.Equal(before, await CountsAsync(app));

        using var transferResponse = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer", Request());
        Assert.Equal(HttpStatusCode.Created, transferResponse.StatusCode);
        using var transferred = JsonDocument.Parse(await transferResponse.Content.ReadAsStringAsync());
        var entryId = transferred.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("YV-2026-000001", transferred.RootElement.GetProperty("code").GetString());

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var entry = await db.JournalEntries.AsNoTracking().Include(x => x.Lines).SingleAsync(x => x.Id == entryId);
            Assert.Equal(TenantA, entry.TenantId);
            Assert.Equal(root.GetProperty("description").GetString(), entry.Description);
            Assert.Equal(new DateOnly(2026, 3, 10), entry.EntryDate);
            var persistedLines = entry.Lines.OrderBy(x => x.LineNumber)
                .Select(x => (x.LineNumber, x.AccountId, x.Description, x.Debit, x.Credit)).ToList();
            Assert.Equal(previewLines, persistedLines);
            Assert.Equal(1, await db.AuditEvents.CountAsync(x => x.TenantId == TenantA && x.Action == "finance.general-ledger.transferred"));
        }

        using var afterTransfer = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", Request());
        Assert.Equal(HttpStatusCode.OK, afterTransfer.StatusCode);
        using var afterJson = JsonDocument.Parse(await afterTransfer.Content.ReadAsStringAsync());
        Assert.False(afterJson.RootElement.GetProperty("canTransfer").GetBoolean());
        Assert.Equal("Bu kaynak daha önce deftere aktarılmıştır.", afterJson.RootElement.GetProperty("blockingReason").GetString());
        Assert.Equal(0, afterJson.RootElement.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Preview_reports_a_missing_mapping_as_blocking_reason_with_the_transfer_conflict_message()
    {
        await using var app = await StartApplicationAsync(mapTax: false);
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var before = await CountsAsync(app);

        using var previewResponse = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", Request());
        Assert.Equal(HttpStatusCode.OK, previewResponse.StatusCode);
        using var preview = JsonDocument.Parse(await previewResponse.Content.ReadAsStringAsync());
        Assert.False(preview.RootElement.GetProperty("canTransfer").GetBoolean());
        var reason = preview.RootElement.GetProperty("blockingReason").GetString();
        Assert.Contains("eşleştirilmemiş", reason);

        using var transferResponse = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer", Request());
        Assert.Equal(HttpStatusCode.Conflict, transferResponse.StatusCode);
        using var conflict = JsonDocument.Parse(await transferResponse.Content.ReadAsStringAsync());
        Assert.Equal(reason, conflict.RootElement.GetProperty("error").GetString());
        Assert.Equal(before, await CountsAsync(app));
    }

    [Fact]
    public async Task Preview_is_tenant_scoped_admin_only_and_validates_the_source_type()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        using var crossTenant = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", Request());
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        using var invalidType = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", new { sourceType = "Unknown", sourceId = InvoiceId });
        Assert.Equal(HttpStatusCode.BadRequest, invalidType.StatusCode);
        using var unknownSource = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", new { sourceType = "SalesInvoice", sourceId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.NotFound, unknownSource.StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var forbidden = await client.PostAsJsonAsync("/api/finance/general-ledger/transfer/preview", Request());
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    private static object Request() => new { sourceType = "SalesInvoice", sourceId = InvoiceId };

    private static async Task<string> CountsAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        return $"journals={await db.JournalEntries.CountAsync()}|lines={await db.JournalEntryLines.CountAsync()}|audit={await db.AuditEvents.CountAsync()}";
    }

    private static async Task<WebApplication> StartApplicationAsync(bool mapTax = true)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"gl-transfer-preview-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddAuthentication("gl-transfer-test").AddScheme<AuthenticationSchemeOptions, FiscalCloseTestAuthenticationHandler>("gl-transfer-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/finance/general-ledger").RequireAuthorization().MapGeneralLedgerTransferEndpoints();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "tenant-b" });
        var customer = new CustomerAccount { TenantId = TenantA, Code = "C-001", Name = "Örnek Müşteri", Type = CounterpartyType.Customer };
        db.CustomerAccounts.Add(customer);
        db.LedgerAccounts.AddRange(
            new LedgerAccount { Id = ReceivableId, TenantId = TenantA, Code = "120", Name = "Alıcılar", StatementSection = LedgerAccountStatementSection.Asset },
            new LedgerAccount { Id = RevenueId, TenantId = TenantA, Code = "600", Name = "Yurt içi satışlar", StatementSection = LedgerAccountStatementSection.Revenue },
            new LedgerAccount { Id = TaxId, TenantId = TenantA, Code = "391", Name = "Hesaplanan KDV", StatementSection = LedgerAccountStatementSection.Liability });
        db.LedgerAccountMappings.AddRange(
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.SalesReceivable, AccountId = ReceivableId },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.SalesRevenue, AccountId = RevenueId });
        if (mapTax)
            db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.SalesTaxPayable, AccountId = TaxId });
        db.SalesInvoices.Add(new SalesInvoice
        {
            Id = InvoiceId, TenantId = TenantA, CustomerId = customer.Id, Customer = customer, Code = "SF-2026-001",
            InvoiceDate = new DateOnly(2026, 3, 10), CurrencyCode = "TRY", Status = SalesInvoiceStatus.Posted,
            Subtotal = 1000m, TaxTotal = 200m, GrandTotal = 1200m
        });
        await db.SaveChangesAsync();
        return app;
    }
}
