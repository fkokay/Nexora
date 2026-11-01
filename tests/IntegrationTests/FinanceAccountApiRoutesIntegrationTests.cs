using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class FinanceAccountApiRoutesIntegrationTests
{
    [Fact]
    public async Task Account_and_bank_statement_list_routes_accept_the_frontend_paths()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        await using var factory = new FinanceApiFactory();
        await SeedTenantCatalogAsync(factory, tenantId);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.FinancialAccounts.Add(new FinancialAccount
            {
                Id = accountId,
                TenantId = tenantId,
                Code = "SYN-BANK",
                Name = "Synthetic bank",
                Type = FinancialAccountType.Bank,
                CurrencyCode = "TRY"
            });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        using var accountsResponse = await client.GetAsync("/api/finance/accounts");
        await AssertStatusCodeAsync(HttpStatusCode.OK, accountsResponse);
        using var accounts = await accountsResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(accounts);
        Assert.Contains(accounts.RootElement.EnumerateArray(), x =>
            x.GetProperty("id").GetGuid() == accountId);

        using var accountsWithSlashResponse = await client.GetAsync("/api/finance/accounts/");
        await AssertStatusCodeAsync(HttpStatusCode.OK, accountsWithSlashResponse);

        using var detailResponse = await client.GetAsync($"/api/finance/accounts/{accountId:D}");
        await AssertStatusCodeAsync(HttpStatusCode.OK, detailResponse);

        using var statementsResponse = await client.GetAsync("/api/finance/statements");
        await AssertStatusCodeAsync(HttpStatusCode.OK, statementsResponse);
    }

    [Fact]
    public async Task Payment_instrument_search_is_bounded_by_term_and_tenant()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        await using var factory = new FinanceApiFactory();
        await SeedTenantCatalogAsync(factory, tenantId);
        await SeedTenantCatalogAsync(factory, otherTenantId);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.PaymentInstruments.AddRange(
                new PaymentInstrument
                {
                    TenantId = tenantId, RequestId = Guid.NewGuid(), Type = PaymentInstrumentType.Check,
                    Direction = PaymentInstrumentDirection.Receivable, Code = "CEK-LOCAL-1", InstrumentNumber = "CHK-001",
                    CounterpartyName = "Acme Local", BankName = "Local bank", CurrencyCode = "TRY", Amount = 120m,
                    IssueDate = new DateOnly(2026, 1, 1), DueDate = new DateOnly(2026, 2, 1), PortfolioDate = new DateOnly(2026, 1, 1)
                },
                new PaymentInstrument
                {
                    TenantId = otherTenantId, RequestId = Guid.NewGuid(), Type = PaymentInstrumentType.Check,
                    Direction = PaymentInstrumentDirection.Receivable, Code = "CEK-OTHER-1", InstrumentNumber = "CHK-999",
                    CounterpartyName = "Acme Other", BankName = "Other bank", CurrencyCode = "TRY", Amount = 999m,
                    IssueDate = new DateOnly(2026, 1, 1), DueDate = new DateOnly(2026, 2, 1), PortfolioDate = new DateOnly(2026, 1, 1)
                });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));

        using var response = await client.GetAsync("/api/finance/payment-instruments/?term=Acme&page=1&pageSize=10");
        await AssertStatusCodeAsync(HttpStatusCode.OK, response);
        using var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(body);
        Assert.Equal(1, body.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(body.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("CEK-LOCAL-1", item.GetProperty("code").GetString());

        using var invalidTerm = await client.GetAsync("/api/finance/payment-instruments/?term=x");
        Assert.Equal(HttpStatusCode.BadRequest, invalidTerm.StatusCode);
    }

    [Fact]
    public async Task Finance_screen_collection_routes_accept_the_frontend_paths()
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await using var factory = new FinanceApiFactory();
        await SeedTenantCatalogAsync(factory, tenantId);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            // Cash-flow forecast and currency settings read the tenant's base currency.
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.Tenants.Add(new Tenant { Id = tenantId, Name = "Synthetic finance tenant", Slug = $"synthetic-{tenantId:N}" });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));

        var frontendCollectionPaths = new[]
        {
            "/api/finance/currency",
            "/api/finance/exchange-rates",
            "/api/finance/fx-exposure",
            "/api/finance/fx-revaluations/",
            "/api/finance/maturities",
            "/api/finance/general-ledger/accounts",
            "/api/finance/general-ledger/mappings",
            "/api/finance/general-ledger/entries?page=1&pageSize=50",
            "/api/finance/general-ledger/sources",
            "/api/finance/general-ledger/trial-balance",
            "/api/finance/general-ledger/financial-statements/cash-flow?from=2026-10-01&to=2026-10-31",
            "/api/finance/cash-flow/forecast?from=2026-10-01&months=12",
            "/api/finance/cash-budgets/",
            "/api/finance/budgets/",
            "/api/finance/credit-facilities/",
            "/api/finance/payment-instruments/?page=1&pageSize=50",
            "/api/finance/transfers/"
        };

        foreach (var path in frontendCollectionPaths)
        {
            using var response = await client.GetAsync(path);
            await AssertStatusCodeAsync(HttpStatusCode.OK, response);
        }
    }

    [Fact]
    public async Task Turkish_uniform_chart_preview_and_apply_are_tenant_scoped_idempotent_and_preserve_existing_accounts()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var existingAccountId = Guid.NewGuid();
        await using var factory = new FinanceApiFactory();
        await SeedTenantCatalogAsync(factory, tenantId);
        await SeedTenantCatalogAsync(factory, otherTenantId);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.LedgerAccounts.AddRange(
                new LedgerAccount
                {
                    Id = existingAccountId, TenantId = tenantId, Code = "100", Name = "Firma kasa hesabı",
                    IsActive = false, StatementSection = LedgerAccountStatementSection.Expense
                },
                new LedgerAccount
                {
                    TenantId = otherTenantId, Code = "100", Name = "Diğer firma kasa hesabı",
                    StatementSection = LedgerAccountStatementSection.Asset
                });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        using var previewResponse = await client.GetAsync("/api/finance/general-ledger/accounts/standard-chart");
        await AssertStatusCodeAsync(HttpStatusCode.OK, previewResponse);
        using var preview = await previewResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(preview);
        Assert.Equal(238, preview.RootElement.GetProperty("totalAccounts").GetInt32());
        Assert.Equal(1, preview.RootElement.GetProperty("existingAccounts").GetInt32());
        Assert.Equal(237, preview.RootElement.GetProperty("accountsToAdd").GetInt32());
        Assert.Equal("https://www.gib.gov.tr/mevzuat/kanun/434/teblig/8181", preview.RootElement.GetProperty("sourceUrl").GetString());

        using var forbidden = await client.PostAsync("/api/finance/general-ledger/accounts/standard-chart/apply", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        using var apply = await client.PostAsync("/api/finance/general-ledger/accounts/standard-chart/apply", content: null);
        await AssertStatusCodeAsync(HttpStatusCode.OK, apply);
        using var applied = await apply.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(applied);
        Assert.Equal(237, applied.RootElement.GetProperty("addedCount").GetInt32());
        Assert.Equal(1, applied.RootElement.GetProperty("preservedExistingCount").GetInt32());

        using var repeatedApply = await client.PostAsync("/api/finance/general-ledger/accounts/standard-chart/apply", content: null);
        await AssertStatusCodeAsync(HttpStatusCode.OK, repeatedApply);
        using var repeated = await repeatedApply.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(repeated);
        Assert.Equal(0, repeated.RootElement.GetProperty("addedCount").GetInt32());
        Assert.Equal(238, repeated.RootElement.GetProperty("preservedExistingCount").GetInt32());

        using var accountsResponse = await client.GetAsync("/api/finance/general-ledger/accounts");
        await AssertStatusCodeAsync(HttpStatusCode.OK, accountsResponse);
        using var accounts = await accountsResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(accounts);
        Assert.Equal(238, accounts.RootElement.GetArrayLength());
        var preservedAccount = Assert.Single(accounts.RootElement.EnumerateArray(), x => x.GetProperty("id").GetGuid() == existingAccountId);
        Assert.Equal("Firma kasa hesabı", preservedAccount.GetProperty("name").GetString());
        Assert.Equal("Expense", preservedAccount.GetProperty("statementSection").GetString());
        Assert.False(preservedAccount.GetProperty("isActive").GetBoolean());
        Assert.Equal("Revenue", Assert.Single(accounts.RootElement.EnumerateArray(), x => x.GetProperty("code").GetString() == "600").GetProperty("statementSection").GetString());
        Assert.Equal("Unclassified", Assert.Single(accounts.RootElement.EnumerateArray(), x => x.GetProperty("code").GetString() == "610").GetProperty("statementSection").GetString());
        Assert.Equal("Expense", Assert.Single(accounts.RootElement.EnumerateArray(), x => x.GetProperty("code").GetString() == "620").GetProperty("statementSection").GetString());
        Assert.Equal("Unclassified", Assert.Single(accounts.RootElement.EnumerateArray(), x => x.GetProperty("code").GetString() == "690").GetProperty("statementSection").GetString());
        Assert.DoesNotContain(accounts.RootElement.EnumerateArray(), x => x.GetProperty("name").GetString() == "Diğer firma kasa hesabı");
    }

    [Fact]
    public async Task Assistant_chart_search_is_bounded_tenant_scoped_and_omits_ids_and_balances()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        await using var factory = new FinanceApiFactory();
        await SeedTenantCatalogAsync(factory, tenantId);
        await SeedTenantCatalogAsync(factory, otherTenantId);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.LedgerAccounts.AddRange(
                new LedgerAccount { TenantId = tenantId, Code = "120", Name = "ALICILAR", StatementSection = LedgerAccountStatementSection.Asset },
                new LedgerAccount { TenantId = tenantId, Code = "120.01", Name = "YURTİÇİ ALICILAR", StatementSection = LedgerAccountStatementSection.Asset },
                new LedgerAccount { TenantId = otherTenantId, Code = "120", Name = "GİZLİ DİĞER FİRMA HESABI", StatementSection = LedgerAccountStatementSection.Asset });
            await db.SaveChangesAsync();
        }

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        using var invalid = await client.GetAsync("/api/finance/general-ledger/accounts/assistant-search?term=x");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var response = await client.GetAsync("/api/finance/general-ledger/accounts/assistant-search?term=120");
        await AssertStatusCodeAsync(HttpStatusCode.OK, response);
        using var result = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.NotNull(result);
        Assert.Equal(2, result.RootElement.GetProperty("totalCount").GetInt32());
        var account = Assert.Single(result.RootElement.GetProperty("accounts").EnumerateArray(), x => x.GetProperty("code").GetString() == "120");
        Assert.Equal("ALICILAR", account.GetProperty("name").GetString());
        Assert.False(account.TryGetProperty("id", out _));
        Assert.False(account.TryGetProperty("balance", out _));
        Assert.DoesNotContain("GİZLİ", result.RootElement.GetRawText());
    }

    private static async Task AssertStatusCodeAsync(HttpStatusCode expected, HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected,
            $"Expected {(int)expected} {expected}, received {(int)response.StatusCode} {response.StatusCode}. Response: {body}");
    }

    private static async Task SeedTenantCatalogAsync(FinanceApiFactory factory, Guid tenantId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant
        {
            Id = tenantId,
            Name = "Synthetic finance tenant",
            Slug = $"synthetic-{tenantId:N}"
        };
        db.Tenants.Add(tenant);
        db.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId,
            Tenant = tenant,
            DatabaseName = $"AIERPTenant_{tenantId:N}",
            State = TenantDatabaseProvisioningState.Ready
        });
        await db.SaveChangesAsync();
    }

    private sealed class FinanceApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"finance-api-routes-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName));
                services.RemoveAll<TenantDbContext>();
                services.RemoveAll<DbContextOptions<TenantDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<TenantDbContext>>();
                services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{_databaseName}-tenant"));
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader, FinanceTenantCredentialReader>();
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = FinanceTestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = FinanceTestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = FinanceTestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, FinanceTestAuthenticationHandler>(
                    FinanceTestAuthenticationHandler.SchemeName, _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder(FinanceTestAuthenticationHandler.SchemeName)
                        .RequireAuthenticatedUser().Build());
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["Authentication:SigningKey"] = "synthetic-finance-api-auth-signing-key-32-bytes",
                    ["Authentication:Issuer"] = "AIERP",
                    ["Authentication:Audience"] = "AIERP",
                    ["PluginHost:SigningKey"] = "synthetic-finance-api-plugin-signing-key-32-bytes",
                    ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                    ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["Database:SeparationEnabled"] = "true",
                    ["Database:ApplyMigrationsOnStartup"] = "false",
                    ["Vault:Address"] = "https://vault.test",
                    ["Vault:TenantSqlCredentialReader:RoleId"] = "finance-api-route-test-role",
                    ["Vault:TenantSqlCredentialReader:SecretId"] = "finance-api-route-test-secret",
                    ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
                    ["AI:LiveEvaluation:Enabled"] = "false"
                }));
            return base.CreateHost(builder);
        }

        private sealed class FinanceTestAuthenticationHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
        {
            public const string SchemeName = "finance-api-routes-test";

            protected override Task<AuthenticateResult> HandleAuthenticateAsync()
            {
                if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)
                    || !Guid.TryParse(Request.Headers["X-Test-User"], out var userId))
                    return Task.FromResult(AuthenticateResult.NoResult());

                var claims = new[]
                {
                    new Claim("tenant_id", tenantId.ToString("D")),
                    new Claim("sub", userId.ToString("D")),
                    new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
                };
                var identity = new ClaimsIdentity(claims, Scheme.Name);
                return Task.FromResult(AuthenticateResult.Success(
                    new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
            }
        }

        private sealed class FinanceTenantCredentialReader : ITenantSqlCredentialReader
        {
            public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
                string secretReference, CancellationToken cancellationToken = default)
            {
                Assert.Equal(TenantSqlCredentialPath.ForTenant(tenantId, component), secretReference);
                var userName = component switch
                {
                    TenantSqlDatabaseComponent.Erp => $"aierp_t_{tenantId:N}",
                    TenantSqlDatabaseComponent.AiStudio => $"aierp_s_{tenantId:N}",
                    _ => throw new ArgumentOutOfRangeException(nameof(component))
                };
                return Task.FromResult(new TenantSqlCredential(
                    TenantSqlCredentialPath.DatabaseName(tenantId, component), userName, "synthetic-password", 1));
            }
        }
    }
}
