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

public sealed class CustomerBalanceIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Balance_is_read_only_tenant_scoped_and_returns_signed_account_currency_totals()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        using var debit = await client.GetAsync($"/api/customers/{AccountIds.Debit:D}/balance");
        Assert.Equal(HttpStatusCode.OK, debit.StatusCode);
        using var debitJson = JsonDocument.Parse(await debit.Content.ReadAsStringAsync());
        Assert.Equal("TRY", debitJson.RootElement.GetProperty("currencyCode").GetString());
        Assert.Equal(100m, debitJson.RootElement.GetProperty("balance").GetDecimal());
        Assert.Equal("Debit", debitJson.RootElement.GetProperty("balanceSide").GetString());

        using var credit = await client.GetAsync($"/api/customers/{AccountIds.Credit:D}/balance");
        using var creditJson = JsonDocument.Parse(await credit.Content.ReadAsStringAsync());
        Assert.Equal(-100m, creditJson.RootElement.GetProperty("balance").GetDecimal());
        Assert.Equal("Credit", creditJson.RootElement.GetProperty("balanceSide").GetString());

        using var zero = await client.GetAsync($"/api/customers/{AccountIds.Zero:D}/balance");
        using var zeroJson = JsonDocument.Parse(await zero.Content.ReadAsStringAsync());
        Assert.Equal("EUR", zeroJson.RootElement.GetProperty("currencyCode").GetString());
        Assert.Equal(0m, zeroJson.RootElement.GetProperty("balance").GetDecimal());
        Assert.Equal("Balanced", zeroJson.RootElement.GetProperty("balanceSide").GetString());

        using var crossTenant = await client.GetAsync($"/api/customers/{AccountIds.TenantB:D}/balance");
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var databaseName = $"customer-balance-{Guid.NewGuid():N}";
        var root = new InMemoryDatabaseRoot();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName, root));
        builder.Services.AddAuthentication("report-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/customers").RequireAuthorization().MapCustomerBalanceEndpoint();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Synthetic A", Slug = "synthetic-a" },
            new Tenant { Id = TenantB, Name = "Synthetic B", Slug = "synthetic-b" });
        var debit = new CustomerAccount { Id = AccountIds.Debit, TenantId = TenantA, Code = "A-001", Name = "Synthetic debit", CurrencyCode = "TRY" };
        var credit = new CustomerAccount { Id = AccountIds.Credit, TenantId = TenantA, Code = "A-002", Name = "Synthetic credit", CurrencyCode = "TRY" };
        var zero = new CustomerAccount { Id = AccountIds.Zero, TenantId = TenantA, Code = "A-003", Name = "Synthetic zero", CurrencyCode = "EUR" };
        var otherTenant = new CustomerAccount { Id = AccountIds.TenantB, TenantId = TenantB, Code = "B-001", Name = "Other tenant", CurrencyCode = "TRY" };
        db.CustomerAccounts.AddRange(debit, credit, zero, otherTenant);
        db.CustomerLedgerEntries.AddRange(
            Entry(debit, CustomerLedgerDirection.Debit, 125m), Entry(debit, CustomerLedgerDirection.Credit, 25m),
            Entry(credit, CustomerLedgerDirection.Debit, 25m), Entry(credit, CustomerLedgerDirection.Credit, 125m),
            Entry(otherTenant, CustomerLedgerDirection.Debit, 999m));
        await db.SaveChangesAsync();
        return app;
    }

    private static CustomerLedgerEntry Entry(CustomerAccount account, CustomerLedgerDirection direction, decimal amount) =>
        new() { TenantId = account.TenantId, CustomerId = account.Id, Customer = account,
            EntryDate = new DateOnly(2026, 10, 1), Direction = direction, Amount = amount, CurrencyCode = account.CurrencyCode,
            Description = "Synthetic balance test" };

    private static class AccountIds
    {
        public static readonly Guid Debit = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
        public static readonly Guid Credit = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2");
        public static readonly Guid Zero = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3");
        public static readonly Guid TenantB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1");
    }
}
