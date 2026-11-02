using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class InvoiceSettlementJournalPostingIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid CollectionId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid PaymentId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid ACollectionClearing = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid AReceivable = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid APaymentClearing = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid APayable = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private static readonly Guid BCollectionClearing = Guid.Parse("01010101-0101-0101-0101-010101010101");
    private static readonly Guid BReceivable = Guid.Parse("02020202-0202-0202-0202-020202020202");

    [Fact]
    public async Task Collection_and_payment_entries_require_tenant_mappings_balance_and_replay_safely()
    {
        await using var app = await StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));

        using var missingMapping = await client.PostAsJsonAsync("/test/CustomerCollection", new
        {
            sourceId = CollectionId, sourceCode = "RCPT-1", counterpartyName = "Customer", entryDate = "2026-01-10",
            currencyCode = "TRY", amount = 125m, paymentMethod = "Card", financialAccountId = (Guid?)null
        });
        Assert.Equal(HttpStatusCode.Conflict, missingMapping.StatusCode);
        using (var missingJson = JsonDocument.Parse(await missingMapping.Content.ReadAsStringAsync()))
            Assert.Contains("eşleştirmeleri etkin hesaplara", missingJson.RootElement.GetProperty("error").GetString());

        await AddTenantAMappingsAsync(app);
        using var collection = await client.PostAsJsonAsync("/test/CustomerCollection", new
        {
            sourceId = CollectionId, sourceCode = "RCPT-1", counterpartyName = "Customer", entryDate = "2026-01-10",
            currencyCode = "TRY", amount = 125m, paymentMethod = "Card", financialAccountId = (Guid?)null
        });
        Assert.Equal(HttpStatusCode.OK, collection.StatusCode);
        using var collectionJson = JsonDocument.Parse(await collection.Content.ReadAsStringAsync());
        var collectionJournalId = collectionJson.RootElement.GetProperty("id").GetGuid();

        using var replay = await client.PostAsJsonAsync("/test/CustomerCollection", new
        {
            sourceId = CollectionId, sourceCode = "RCPT-1", counterpartyName = "Customer", entryDate = "2026-01-10",
            currencyCode = "TRY", amount = 125m, paymentMethod = "Card", financialAccountId = (Guid?)null
        });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        using var replayJson = JsonDocument.Parse(await replay.Content.ReadAsStringAsync());
        Assert.Equal(collectionJournalId, replayJson.RootElement.GetProperty("id").GetGuid());

        using var payment = await client.PostAsJsonAsync("/test/SupplierPayment", new
        {
            sourceId = PaymentId, sourceCode = "PAY-1", counterpartyName = "Supplier", entryDate = "2026-01-11",
            currencyCode = "TRY", amount = 70m, paymentMethod = "Check", financialAccountId = (Guid?)null
        });
        Assert.Equal(HttpStatusCode.OK, payment.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString("D"));
        using var otherTenantCollection = await client.PostAsJsonAsync("/test/CustomerCollection", new
        {
            sourceId = CollectionId, sourceCode = "RCPT-1", counterpartyName = "Customer", entryDate = "2026-01-10",
            currencyCode = "TRY", amount = 125m, paymentMethod = "Card", financialAccountId = (Guid?)null
        });
        Assert.Equal(HttpStatusCode.OK, otherTenantCollection.StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var collectionEntry = await db.JournalEntries.Include(x => x.Lines)
            .SingleAsync(x => x.TenantId == TenantA && x.SourceType == "CustomerCollection" && x.SourceId == CollectionId);
        Assert.Equal(collectionJournalId, collectionEntry.Id);
        Assert.Equal(ACollectionClearing, collectionEntry.Lines.Single(x => x.Debit > 0).AccountId);
        Assert.Equal(AReceivable, collectionEntry.Lines.Single(x => x.Credit > 0).AccountId);
        Assert.Equal(125m, collectionEntry.Lines.Sum(x => x.Debit));
        Assert.Equal(collectionEntry.Lines.Sum(x => x.Debit), collectionEntry.Lines.Sum(x => x.Credit));
        Assert.Equal(1, await db.JournalEntries.CountAsync(x => x.TenantId == TenantA && x.SourceType == "CustomerCollection"));

        var paymentEntry = await db.JournalEntries.Include(x => x.Lines)
            .SingleAsync(x => x.TenantId == TenantA && x.SourceType == "SupplierPayment" && x.SourceId == PaymentId);
        Assert.Equal(APayable, paymentEntry.Lines.Single(x => x.Debit > 0).AccountId);
        Assert.Equal(APaymentClearing, paymentEntry.Lines.Single(x => x.Credit > 0).AccountId);
        Assert.Equal(paymentEntry.Lines.Sum(x => x.Debit), paymentEntry.Lines.Sum(x => x.Credit));

        var tenantBEntry = await db.JournalEntries.Include(x => x.Lines)
            .SingleAsync(x => x.TenantId == TenantB && x.SourceType == "CustomerCollection" && x.SourceId == CollectionId);
        Assert.NotEqual(collectionEntry.Id, tenantBEntry.Id);
        Assert.Equal(BCollectionClearing, tenantBEntry.Lines.Single(x => x.Debit > 0).AccountId);
        Assert.Equal(BReceivable, tenantBEntry.Lines.Single(x => x.Credit > 0).AccountId);
        Assert.Equal(1, await db.JournalEntries.CountAsync(x => x.TenantId == TenantB && x.SourceType == "CustomerCollection"));
    }

    private static async Task<WebApplication> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var dbName = $"settlement-journal-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(o => o.UseInMemoryDatabase(dbName, root));
        builder.Services.AddAuthentication("settlement-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("settlement-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPost("/test/{sourceType}", async (string sourceType, SettlementRequest request, System.Security.Claims.ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!Guid.TryParse(principal.FindFirst("tenant_id")?.Value, out var tenantId)) return Results.Forbid();
            var result = await InvoiceSettlementJournalPosting.CreateAsync(db, tenantId, sourceType, request.SourceId,
                request.SourceCode, request.CounterpartyName, request.EntryDate, request.CurrencyCode, request.Amount,
                request.PaymentMethod, request.FinancialAccountId, null);
            if (!result.Succeeded) return Results.Conflict(new { error = result.Error });
            await db.SaveChangesAsync();
            return Results.Ok(new { id = result.Entry!.Id });
        });
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(new Tenant { Id = TenantA, Name = "A", Slug = "settlement-a" }, new Tenant { Id = TenantB, Name = "B", Slug = "settlement-b" });
        db.LedgerAccounts.AddRange(
            new LedgerAccount { Id = ACollectionClearing, TenantId = TenantA, Code = "108", Name = "Card clearing", StatementSection = LedgerAccountStatementSection.Asset },
            new LedgerAccount { Id = AReceivable, TenantId = TenantA, Code = "120", Name = "Receivable", StatementSection = LedgerAccountStatementSection.Asset },
            new LedgerAccount { Id = APaymentClearing, TenantId = TenantA, Code = "308", Name = "Check clearing", StatementSection = LedgerAccountStatementSection.Liability },
            new LedgerAccount { Id = APayable, TenantId = TenantA, Code = "320", Name = "Payable", StatementSection = LedgerAccountStatementSection.Liability },
            new LedgerAccount { Id = BCollectionClearing, TenantId = TenantB, Code = "108", Name = "B Card clearing", StatementSection = LedgerAccountStatementSection.Asset },
            new LedgerAccount { Id = BReceivable, TenantId = TenantB, Code = "120", Name = "B Receivable", StatementSection = LedgerAccountStatementSection.Asset });
        await db.SaveChangesAsync();
        return app;
    }

    private static async Task AddTenantAMappingsAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        db.LedgerAccountMappings.AddRange(
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.CustomerCardClearing, AccountId = ACollectionClearing },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.SalesReceivable, AccountId = AReceivable },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.SupplierCheckClearing, AccountId = APaymentClearing },
            new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.PurchasePayable, AccountId = APayable },
            new LedgerAccountMapping { TenantId = TenantB, MappingKey = LedgerMappingKeys.CustomerCardClearing, AccountId = BCollectionClearing },
            new LedgerAccountMapping { TenantId = TenantB, MappingKey = LedgerMappingKeys.SalesReceivable, AccountId = BReceivable });
        await db.SaveChangesAsync();
    }

    private sealed record SettlementRequest(Guid SourceId, string SourceCode, string CounterpartyName, DateOnly EntryDate,
        string CurrencyCode, decimal Amount, string PaymentMethod, Guid? FinancialAccountId);
}
