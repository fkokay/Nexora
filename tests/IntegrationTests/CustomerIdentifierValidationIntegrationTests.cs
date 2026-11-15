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
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

// Identifiers are synthetic values computed for the VKN/TCKN/IBAN check-digit rules.
public sealed class CustomerIdentifierValidationIntegrationTests
{
    private const string ValidVkn = "9876543217";
    private const string ValidTckn = "10000000146";
    private const string ValidIban = "TR80 9999 9000 0000 0000 0000 01";

    [Fact]
    public async Task Create_rejects_nine_digit_vkn_with_a_tax_number_field_error()
    {
        await using var factory = new CustomerApiFactory();
        using var client = await CreateClientAsync(factory);

        using var response = await client.PostAsJsonAsync("/api/customers/", NewCustomer("C-VKN9", taxNumber: "123456789"));

        var errors = await AssertValidationProblemAsync(response);
        Assert.Equal("Vergi numarası 10 haneli olmalı ve geçerli bir VKN olmalıdır.", errors.GetProperty("taxNumber")[0].GetString());
    }

    [Fact]
    public async Task Create_rejects_invalid_iban_and_tckn()
    {
        await using var factory = new CustomerApiFactory();
        using var client = await CreateClientAsync(factory);

        using var iban = await client.PostAsJsonAsync("/api/customers/", NewCustomer("C-IBAN", iban: "TR12"));
        var ibanErrors = await AssertValidationProblemAsync(iban);
        Assert.Equal("IBAN geçersiz; ülke kodu, uzunluk ve kontrol basamaklarını kontrol edin.", ibanErrors.GetProperty("iban")[0].GetString());

        using var tckn = await client.PostAsJsonAsync("/api/customers/", NewCustomer("C-TCKN", identityNumber: "10000000147"));
        var tcknErrors = await AssertValidationProblemAsync(tckn);
        Assert.Equal("T.C. kimlik numarası geçersiz.", tcknErrors.GetProperty("identityNumber")[0].GetString());
    }

    // A successful POST /api/customers cannot run on EF InMemory (the create endpoint locks custom-field
    // definitions with raw SQL), so valid identifiers are proven through bulk import and update instead.
    [Fact]
    public async Task Bulk_import_applies_the_create_rules_and_accepts_valid_identifiers()
    {
        await using var factory = new CustomerApiFactory();
        using var client = await CreateClientAsync(factory);

        using var invalid = await client.PostAsJsonAsync("/api/customers/bulk-import", new
        {
            items = new[] { new { code = "C-BULK-1", name = "Synthetic bulk", type = "Customer", taxNumber = "123456789", identityNumber = (string?)null, taxOffice = (string?)null, currencyCode = "TRY", riskLimit = (decimal?)null, paymentTermDays = 0, isActive = true } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Contains("taxNumber", await invalid.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var valid = await client.PostAsJsonAsync("/api/customers/bulk-import", new
        {
            items = new[] { new { code = "C-BULK-1", name = "Synthetic bulk", type = "Customer", taxNumber = ValidVkn, identityNumber = ValidTckn, taxOffice = (string?)null, currencyCode = "TRY", riskLimit = (decimal?)null, paymentTermDays = 0, isActive = true } }
        });
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
    }

    [Fact]
    public async Task Update_keeps_unchanged_legacy_identifiers_but_rejects_a_new_invalid_value()
    {
        await using var factory = new CustomerApiFactory();
        using var client = await CreateClientAsync(factory);
        var customerId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.CustomerAccounts.Add(new CustomerAccount
            {
                Id = customerId, TenantId = factory.TenantId, Code = "C-LEGACY", Name = "Legacy synthetic",
                TaxNumber = "123456789", IdentityNumber = "11111111111", Iban = "TR12", CurrencyCode = "TRY",
                RowVersion = [1, 2, 3, 4, 5, 6, 7, 8]
            });
            await db.SaveChangesAsync();
        }

        using var unchanged = await client.PutAsJsonAsync($"/api/customers/{customerId:D}",
            UpdateCustomer("Legacy synthetic renamed", "123456789", "11111111111", "TR12"));
        Assert.True(unchanged.StatusCode == HttpStatusCode.OK, await unchanged.Content.ReadAsStringAsync());

        using var changedInvalid = await client.PutAsJsonAsync($"/api/customers/{customerId:D}",
            UpdateCustomer("Legacy synthetic renamed", "987654321", "11111111111", "TR12"));
        var errors = await AssertValidationProblemAsync(changedInvalid);
        Assert.True(errors.TryGetProperty("taxNumber", out _));
        Assert.False(errors.TryGetProperty("identityNumber", out _));
        Assert.False(errors.TryGetProperty("iban", out _));

        using var changedValid = await client.PutAsJsonAsync($"/api/customers/{customerId:D}",
            UpdateCustomer("Legacy synthetic renamed", ValidVkn, ValidTckn, ValidIban));
        Assert.True(changedValid.StatusCode == HttpStatusCode.OK, await changedValid.Content.ReadAsStringAsync());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var saved = await db.CustomerAccounts.AsNoTracking().SingleAsync(x => x.Id == customerId);
            Assert.Equal(ValidVkn, saved.TaxNumber);
            Assert.Equal("TR809999900000000000000001", saved.Iban);
        }
    }

    private static object NewCustomer(string code, string? taxNumber = null, string? identityNumber = null, string? iban = null) => new
    {
        code, name = "Synthetic customer", type = "Customer", taxNumber, identityNumber, iban,
        currencyCode = "TRY", paymentTermDays = 0, isActive = true
    };

    private static object UpdateCustomer(string name, string? taxNumber, string? identityNumber, string? iban) => new
    {
        code = "C-LEGACY", name, type = "Customer", taxNumber, identityNumber, iban,
        currencyCode = "TRY", paymentTermDays = 0, isActive = true,
        rowVersion = Convert.ToBase64String([1, 2, 3, 4, 5, 6, 7, 8])
    };

    private static async Task<JsonElement> AssertValidationProblemAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{(int)response.StatusCode}: {body}");
        using var document = JsonDocument.Parse(body);
        return document.RootElement.GetProperty("errors").Clone();
    }

    private static async Task<HttpClient> CreateClientAsync(CustomerApiFactory factory)
    {
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = new Tenant { Id = factory.TenantId, Name = "Synthetic customer tenant", Slug = $"synthetic-{factory.TenantId:N}" };
            platform.Tenants.Add(tenant);
            platform.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = factory.TenantId, Tenant = tenant, DatabaseName = $"AIERPTenant_{factory.TenantId:N}",
                State = TenantDatabaseProvisioningState.Ready
            });
            await platform.SaveChangesAsync();
            var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            tenantDb.Tenants.Add(new Tenant { Id = factory.TenantId, Name = "Synthetic customer tenant", Slug = $"synthetic-{factory.TenantId:N}" });
            await tenantDb.SaveChangesAsync();
        }
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", factory.TenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        return client;
    }

    private sealed class CustomerApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"customer-identifiers-{Guid.NewGuid():N}";
        public Guid TenantId { get; } = Guid.NewGuid();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName)
                    .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
                services.RemoveAll<TenantDbContext>();
                services.RemoveAll<DbContextOptions<TenantDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<TenantDbContext>>();
                services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{_databaseName}-tenant")
                    .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader, CustomerTenantCredentialReader>();
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = CustomerTestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = CustomerTestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = CustomerTestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, CustomerTestAuthenticationHandler>(
                    CustomerTestAuthenticationHandler.SchemeName, _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder(CustomerTestAuthenticationHandler.SchemeName)
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
                    ["Authentication:SigningKey"] = "synthetic-customer-api-auth-signing-key-32-bytes",
                    ["Authentication:Issuer"] = "AIERP",
                    ["Authentication:Audience"] = "AIERP",
                    ["PluginHost:SigningKey"] = "synthetic-customer-api-plugin-signing-key-32-bytes",
                    ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                    ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                    ["Database:SeparationEnabled"] = "true",
                    ["Database:ApplyMigrationsOnStartup"] = "false",
                    ["Vault:Address"] = "https://vault.test",
                    ["Vault:TenantSqlCredentialReader:RoleId"] = "customer-api-test-role",
                    ["Vault:TenantSqlCredentialReader:SecretId"] = "customer-api-test-secret",
                    ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
                    ["AI:LiveEvaluation:Enabled"] = "false"
                }));
            return base.CreateHost(builder);
        }

        private sealed class CustomerTestAuthenticationHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
        {
            public const string SchemeName = "customer-identifier-test";

            protected override Task<AuthenticateResult> HandleAuthenticateAsync()
            {
                if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)
                    || !Guid.TryParse(Request.Headers["X-Test-User"], out var userId))
                    return Task.FromResult(AuthenticateResult.NoResult());

                var claims = new[]
                {
                    new Claim("tenant_id", tenantId.ToString("D")),
                    new Claim("sub", userId.ToString("D")),
                    new Claim("role", "TenantAdmin")
                };
                var identity = new ClaimsIdentity(claims, Scheme.Name);
                return Task.FromResult(AuthenticateResult.Success(
                    new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
            }
        }

        private sealed class CustomerTenantCredentialReader : ITenantSqlCredentialReader
        {
            public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
                string secretReference, CancellationToken cancellationToken = default)
            {
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
