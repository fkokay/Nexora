using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class TenantStorageQuotaHttpAcceptanceTests
{
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [SqlServerAcceptanceFact]
    public async Task Full_storage_quota_blocks_company_setting_write_without_side_effects_but_allows_reads()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = $"AIERP_StorageQuotaHttp_{suffix}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var tenantConnection = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = $"AIERPTenant_{tenantId:N}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options;
        await using var platformDb = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var platformCreated = false;
        var tenantCreated = false;
        WebApplication? app = null;
        try
        {
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Storage quota HTTP acceptance", Slug = $"quota-http-{suffix}" };
            platformDb.Tenants.Add(tenant);
            await platformDb.SaveChangesAsync();
            tenantDb.Tenants.Add(new Tenant { Id = tenantId, Name = tenant.Name, Slug = tenant.Slug });
            await tenantDb.SaveChangesAsync();

            var fullBytes = await ReadSqlDataBytesAsync(tenantConnection);
            Assert.True(fullBytes > 0);
            var auditCountBefore = await tenantDb.AuditEvents.CountAsync(x => x.TenantId == tenantId);
            var settingsCountBefore = await tenantDb.TenantOperationalSettings.CountAsync(x => x.TenantId == tenantId);

            app = await StartApplicationAsync(platformConnection, tenantConnection, tenantId, fullBytes);
            using var client = app.GetTestClient();

            using var read = await client.GetAsync("/api/tenant-settings/operations/");
            Assert.Equal(HttpStatusCode.OK, read.StatusCode);
            var readBody = await read.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.Equal(tenantId, readBody.GetProperty("tenantId").GetGuid());

            using var write = await client.PutAsJsonAsync("/api/tenant-settings/operations/", new
            {
                allowNegativeStock = true,
                rowVersion = (string?)null
            });
            Assert.Equal(HttpStatusCode.Conflict, write.StatusCode);
            var error = await write.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.Equal("license.storage_limit", error.GetProperty("code").GetString());
            Assert.True(error.GetProperty("usedBytes").GetInt64() >= fullBytes);
            Assert.Equal(fullBytes, error.GetProperty("maxBytes").GetInt64());

            await using var verificationDb = new TenantDbContext(tenantOptions);
            Assert.Equal(settingsCountBefore, await verificationDb.TenantOperationalSettings.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(auditCountBefore, await verificationDb.AuditEvents.CountAsync(x => x.TenantId == tenantId));
        }
        finally
        {
            if (app is not null) await app.DisposeAsync();
            if (tenantCreated) await tenantDb.Database.EnsureDeletedAsync();
            if (platformCreated) await platformDb.Database.EnsureDeletedAsync();
        }
    }

    private static async Task<WebApplication> StartApplicationAsync(string platformConnection, string tenantConnection,
        Guid tenantId, long maxBytes)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["TestAuthentication:TenantId"] = tenantId.ToString()
        });
        builder.Services.AddProblemDetails();
        builder.Services.AddExceptionHandler<ApiExceptionHandler>();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(platformConnection));
        builder.Services.AddSingleton<ITenantStorageLimitProvider>(new FixedStorageLimitProvider(maxBytes));
        builder.Services.AddScoped<TenantStorageQuotaInterceptor>();
        builder.Services.AddDbContext<TenantDbContext>((services, options) => options
            .UseSqlServer(tenantConnection)
            .AddInterceptors(services.GetRequiredService<TenantStorageQuotaInterceptor>()));
        builder.Services.AddAuthentication("storage-quota-test")
            .AddScheme<AuthenticationSchemeOptions, StorageQuotaAuthenticationHandler>("storage-quota-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseExceptionHandler();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantOperationalSettingsEndpoints();
        await app.StartAsync();
        return app;
    }

    private static async Task<long> ReadSqlDataBytesAsync(string connectionString)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT SUM(CONVERT(bigint, FILEPROPERTY([name], 'SpaceUsed')) * CONVERT(bigint, 8192)) FROM sys.database_files WHERE [type_desc] = N'ROWS';";
        return Convert.ToInt64(await command.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private sealed class FixedStorageLimitProvider(long maxBytes) : ITenantStorageLimitProvider
    {
        public Task<long> GetLimitBytesAsync(Guid tenantId, CancellationToken cancellationToken) => Task.FromResult(maxBytes);
    }

    private sealed class StorageQuotaAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IConfiguration configuration)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var tenantId = Guid.Parse(configuration["TestAuthentication:TenantId"]!);
            var claims = new[]
            {
                new Claim("sub", UserId.ToString()),
                new Claim("tenant_id", tenantId.ToString()),
                new Claim("role", "TenantAdmin")
            };
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
        }
    }
}
