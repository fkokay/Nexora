using System.Net;
using System.Text.Json;
using AIERP.Platform.Application;
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

/// <summary>
/// <c>DELETE /api/customers/{id}</c>: only a card with no related records is deleted (with its addresses and current custom
/// field values); anything else answers 409 so the user deactivates it instead. The InMemory provider enforces no foreign
/// keys, so these tests exercise the explicit checks; the SQL 547 fallback is not reached here.
/// </summary>
public sealed class CustomerDeleteIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Empty = Guid.Parse("cccccccc-0000-0000-0000-000000000001");
    private static readonly Guid Busy = Guid.Parse("cccccccc-0000-0000-0000-000000000002");
    private static readonly Guid OtherTenant = Guid.Parse("cccccccc-0000-0000-0000-000000000003");
    private static readonly Guid Definition = Guid.Parse("dddddddd-0000-0000-0000-000000000001");

    [Fact]
    public async Task Admin_deletes_a_card_without_related_records_with_its_addresses_and_values_and_audits_it()
    {
        await using var app = await StartApplicationAsync(db =>
        {
            db.CustomerAddresses.Add(new CustomerAddress { TenantId = TenantA, CustomerId = Empty, Kind = CustomerAddressKind.General, Label = "Merkez", AddressLine = "Cadde 1", City = "Konya", IsDefault = true });
            db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = TenantA, CustomerId = Empty, DefinitionId = Definition, Value = "x", DefinitionVersion = 1 });
        });
        using var client = Client(app);

        using var response = await client.DeleteAsync($"/api/customers/{Empty:D}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.False(await db.CustomerAccounts.AnyAsync(x => x.Id == Empty));
        Assert.False(await db.CustomerAddresses.AnyAsync(x => x.CustomerId == Empty));
        Assert.False(await db.CustomerCustomFieldValues.AnyAsync(x => x.CustomerId == Empty));
        var audit = await db.AuditEvents.SingleAsync(x => x.Action == "customer.deleted");
        Assert.Equal(TenantA, audit.TenantId);
        Assert.Equal("E-001 Boş kart", audit.Resource);
        // The other cards stay.
        Assert.True(await db.CustomerAccounts.AnyAsync(x => x.Id == Busy));
    }

    public static TheoryData<string> RelatedRecords() => ["ledger", "salesQuote", "subsidiary", "customFieldHistory", "crmOpportunity"];

    [Theory]
    [MemberData(nameof(RelatedRecords))]
    public async Task A_card_with_related_records_is_not_deleted(string related)
    {
        await using var app = await StartApplicationAsync(db =>
        {
            switch (related)
            {
                case "ledger":
                    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = TenantA, CustomerId = Busy, EntryDate = new DateOnly(2026, 10, 1),
                        Direction = CustomerLedgerDirection.Debit, Amount = 10m, CurrencyCode = "TRY", Description = "Synthetic" });
                    break;
                case "salesQuote":
                    db.SalesQuotes.Add(new SalesQuote { TenantId = TenantA, CustomerId = Busy, Code = "TKL-1", QuoteDate = new DateOnly(2026, 10, 1),
                        ValidUntil = new DateOnly(2026, 10, 31) });
                    break;
                case "subsidiary":
                    db.CustomerAccounts.Add(new CustomerAccount { TenantId = TenantA, Code = "S-001", Name = "Bağlı firma", CurrencyCode = "TRY", ParentCompanyId = Busy });
                    break;
                case "customFieldHistory":
                    db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = TenantA, CustomerId = Busy, DefinitionId = Definition,
                        NewValue = "x", DefinitionVersion = 1 });
                    break;
                case "crmOpportunity":
                    db.CrmOpportunities.Add(new CrmOpportunity { TenantId = TenantA, CustomerId = Busy, Code = "F-1", Name = "Fırsat" });
                    break;
            }
        });
        using var client = Client(app);

        using var response = await client.DeleteAsync($"/api/customers/{Busy:D}");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(CustomerDeleteEndpoints.RelatedRecordsError, body.RootElement.GetProperty("error").GetString());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.True(await db.CustomerAccounts.AnyAsync(x => x.Id == Busy));
        Assert.False(await db.AuditEvents.AnyAsync(x => x.Action == "customer.deleted"));
    }

    [Fact]
    public async Task Only_a_tenant_admin_deletes_and_other_tenant_or_invisible_cards_are_not_found()
    {
        await using var app = await StartApplicationAsync(_ => { });
        using var client = Client(app);

        using var otherTenant = await client.DeleteAsync($"/api/customers/{OtherTenant:D}");
        Assert.Equal(HttpStatusCode.NotFound, otherTenant.StatusCode);
        using var missing = await client.DeleteAsync($"/api/customers/{Guid.NewGuid():D}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        // A TenantUser with no customer row rule sees no card: not found, never a hint that it exists.
        using var invisible = await client.DeleteAsync($"/api/customers/{Empty:D}");
        Assert.Equal(HttpStatusCode.NotFound, invisible.StatusCode);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var permission = await platform.PermissionDefinitions.SingleAsync(x => x.Code == "erp.customers.read");
            platform.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Allow, ResourceType = "erp.customers"
            });
            await platform.SaveChangesAsync();
        }
        // Visible but not an admin: forbidden, and the card stays.
        using var forbidden = await client.DeleteAsync($"/api/customers/{Empty:D}");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        await using var check = app.Services.CreateAsyncScope();
        Assert.True(await check.ServiceProvider.GetRequiredService<TenantDbContext>().CustomerAccounts.AnyAsync(x => x.Id == Empty));
    }

    [Fact]
    public void Every_foreign_key_to_a_customer_card_blocks_the_delete_except_its_addresses_and_current_values()
    {
        using var db = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase($"customer-delete-model-{Guid.NewGuid():N}").Options);
        var blocking = CustomerDeleteEndpoints.BlockingForeignKeys(db).Select(fk => fk.DeclaringEntityType.ClrType.Name).ToHashSet(StringComparer.Ordinal);
        Assert.DoesNotContain(nameof(CustomerAddress), blocking);
        Assert.DoesNotContain(nameof(CustomerCustomFieldValue), blocking);
        foreach (var expected in new[] { nameof(CustomerLedgerEntry), nameof(CustomerCustomFieldValueRevision), nameof(CustomerAccount), nameof(CrmOpportunity),
                     nameof(SalesQuote), nameof(SalesOrder), nameof(SalesInvoice), nameof(SalesReturn), nameof(SalesRequest), nameof(StandaloneSalesDelivery),
                     nameof(CustomerCollection), nameof(PurchaseOrder), nameof(PurchaseInvoice), nameof(PurchaseSupplierQuote), nameof(StandalonePurchaseReceipt),
                     nameof(SupplierPayment), nameof(SupplierReturn), nameof(PaymentInstrument), nameof(FixedAsset), nameof(OperationalProject), nameof(CommercialContract) })
            Assert.Contains(expected, blocking);
    }

    [Fact]
    public void Delete_route_resolves_to_the_customer_delete_permission()
    {
        var path = $"/api/customers/{Empty:D}";
        Assert.True(PlatformPermissionCatalog.TryResolve(path, "DELETE", "/api/customers/{id:guid}", new Dictionary<string, string?> { ["id"] = Empty.ToString("D") },
            TenantA, Guid.NewGuid(), "TenantAdmin", out var resolved));
        Assert.Equal("erp.customers.delete", resolved!.Permission.Code);
    }

    private static HttpClient Client(WebApplication app)
    {
        var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        return client;
    }

    private static async Task<WebApplication> StartApplicationAsync(Action<TenantDbContext> seed)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"customer-delete-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform", root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/customers").RequireAuthorization().MapCustomerDeleteEndpoint();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "synthetic-a" },
            new Tenant { Id = TenantB, Name = "Synthetic B", Slug = "synthetic-b" });
        db.CustomerAccounts.AddRange(
            new CustomerAccount { Id = Empty, TenantId = TenantA, Code = "E-001", Name = "Boş kart", CurrencyCode = "TRY" },
            new CustomerAccount { Id = Busy, TenantId = TenantA, Code = "E-002", Name = "Hareketli kart", CurrencyCode = "TRY" },
            new CustomerAccount { Id = OtherTenant, TenantId = TenantB, Code = "B-001", Name = "Diğer firma", CurrencyCode = "TRY" });
        seed(db);
        await db.SaveChangesAsync();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await platformDb.Database.EnsureCreatedAsync();
        platformDb.Tenants.Add(new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "synthetic-a" });
        await platformDb.SaveChangesAsync();
        return app;
    }
}
