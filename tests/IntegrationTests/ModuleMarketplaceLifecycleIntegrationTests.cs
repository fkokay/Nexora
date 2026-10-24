using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.IO.Compression;
using AIERP.Api;
using AIERP.ModuleSDK;
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

public sealed class ModuleMarketplaceLifecycleIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid MaintainerId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid PublisherId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid TenantAdminId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private const string Publisher = "Nexora Synthetic Publisher";
    private const string KeyId = "integration-test-key";
    private const string ModuleCode = "sample.catalog";

    [Fact]
    public async Task Signed_module_catalog_publish_tenant_activation_upgrade_rollback_revoke_and_audit_are_enforced()
    {
        using var rsa = RSA.Create(2048);
        using var startupConfiguration = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
        {
            ["Authentication__SigningKey"] = "synthetic-module-lifecycle-auth-signing-key-32-bytes",
            ["Authentication__Issuer"] = "AIERP",
            ["Authentication__Audience"] = "AIERP",
            ["PluginHost__SigningKey"] = "synthetic-module-lifecycle-plugin-signing-key-32-bytes",
            ["PluginHost__BaseUrl"] = "http://plugin-host",
            ["ConnectionStrings__Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
            ["ConnectionStrings__Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
            ["ConnectionStrings__AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
            ["Database__SeparationEnabled"] = "true",
            ["Database__ApplyMigrationsOnStartup"] = "false"
        });
        await using var factory = new ModuleApiFactory();
        using var client = factory.CreateClient();

        await SeedAsync(factory);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/platform/modules/")).StatusCode);

        SetIdentity(client, TenantA, TenantAdminId, "TenantAdmin");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/platform/modules/")).StatusCode);

        SetIdentity(client, TenantA, MaintainerId, "TenantAdmin", "PlatformSuperAdmin");
        using (var keyResponse = await client.PostAsJsonAsync("/api/platform/modules/publisher-keys", new
        {
            publisher = Publisher,
            keyId = KeyId,
            publicKeyPem = rsa.ExportSubjectPublicKeyInfoPem()
        }))
            Assert.Equal(HttpStatusCode.Created, keyResponse.StatusCode);

        var manifestV1 = CreateManifest("1.0.0");
        var invalidSignature = await UploadAsync(client, rsa, manifestV1, invalidSignature: true);
        Assert.Equal(HttpStatusCode.BadRequest, invalidSignature.StatusCode);
        invalidSignature.Dispose();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Empty(await db.PlatformModuleReleases.ToListAsync());
        }

        SetIdentity(client, TenantA, MaintainerId, "TenantAdmin", "PlatformReleaseManager");
        using var uploadedV1 = await UploadAsync(client, rsa, manifestV1);
        Assert.Equal(HttpStatusCode.Created, uploadedV1.StatusCode);
        using var uploadV1Json = JsonDocument.Parse(await uploadedV1.Content.ReadAsStringAsync());
        var releaseV1Id = uploadV1Json.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Draft", uploadV1Json.RootElement.GetProperty("status").GetString());

        using var selfApproval = await client.PostAsync($"/api/platform/modules/releases/{releaseV1Id:D}/publish", content: null);
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);

        SetIdentity(client, TenantA, PublisherId, "TenantAdmin", "PlatformReleaseManager");
        using var publishV1 = await client.PostAsync($"/api/platform/modules/releases/{releaseV1Id:D}/publish", content: null);
        Assert.Equal(HttpStatusCode.OK, publishV1.StatusCode);

        SetIdentity(client, TenantA, TenantAdminId, "TenantAdmin");
        var marketplaceV1 = await client.GetFromJsonAsync<JsonElement[]>("/api/tenant/modules/marketplace");
        var itemV1 = Assert.Single(marketplaceV1!);
        Assert.Equal("1.0.0", itemV1.GetProperty("version").GetString());
        Assert.False(itemV1.GetProperty("isActivated").GetBoolean());

        SetIdentity(client, TenantA, TenantAdminId, "TenantUser");
        using var deniedActivation = await client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode = ModuleCode, version = "1.0.0" });
        Assert.Equal(HttpStatusCode.Forbidden, deniedActivation.StatusCode);

        SetIdentity(client, TenantA, TenantAdminId, "TenantAdmin");
        using var activatedV1 = await client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode = ModuleCode, version = "1.0.0" });
        Assert.Equal(HttpStatusCode.OK, activatedV1.StatusCode);

        SetIdentity(client, TenantA, MaintainerId, "TenantAdmin", "PlatformDeveloper");
        using var uploadedV2 = await UploadAsync(client, rsa, CreateManifest("2.0.0"));
        Assert.Equal(HttpStatusCode.Created, uploadedV2.StatusCode);
        using var uploadV2Json = JsonDocument.Parse(await uploadedV2.Content.ReadAsStringAsync());
        var releaseV2Id = uploadV2Json.RootElement.GetProperty("id").GetGuid();
        SetIdentity(client, TenantA, PublisherId, "TenantAdmin", "PlatformReleaseManager");
        using var publishV2 = await client.PostAsync($"/api/platform/modules/releases/{releaseV2Id:D}/publish", content: null);
        Assert.Equal(HttpStatusCode.OK, publishV2.StatusCode);

        SetIdentity(client, TenantA, TenantAdminId, "TenantAdmin");
        using var upgraded = await client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode = ModuleCode, version = "2.0.0" });
        Assert.Equal(HttpStatusCode.OK, upgraded.StatusCode);
        using var upgradedJson = JsonDocument.Parse(await upgraded.Content.ReadAsStringAsync());
        Assert.Equal("2.0.0", upgradedJson.RootElement.GetProperty("version").GetString());

        using var rolledBack = await client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode = ModuleCode, version = "1.0.0" });
        Assert.Equal(HttpStatusCode.OK, rolledBack.StatusCode);
        using var rolledBackJson = JsonDocument.Parse(await rolledBack.Content.ReadAsStringAsync());
        Assert.Equal("1.0.0", rolledBackJson.RootElement.GetProperty("version").GetString());

        SetIdentity(client, TenantB, Guid.NewGuid(), "TenantAdmin");
        var otherTenantActivations = await client.GetFromJsonAsync<JsonElement[]>("/api/tenant/modules/");
        Assert.Empty(otherTenantActivations!);
        using var crossTenantDelete = await client.DeleteAsync($"/api/tenant/modules/{ModuleCode}");
        Assert.Equal(HttpStatusCode.NotFound, crossTenantDelete.StatusCode);

        SetIdentity(client, TenantA, TenantAdminId, "TenantAdmin");
        using var deactivated = await client.DeleteAsync($"/api/tenant/modules/{ModuleCode}");
        Assert.Equal(HttpStatusCode.NoContent, deactivated.StatusCode);

        SetIdentity(client, TenantA, PublisherId, "TenantAdmin", "PlatformReleaseManager");
        using var revoked = await client.PostAsJsonAsync($"/api/platform/modules/releases/{releaseV2Id:D}/revoke", new { reason = "Synthetic integration test revocation" });
        Assert.Equal(HttpStatusCode.OK, revoked.StatusCode);

        SetIdentity(client, TenantA, TenantAdminId, "TenantAdmin");
        using var revokedActivation = await client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode = ModuleCode, version = "2.0.0" });
        Assert.Equal(HttpStatusCode.NotFound, revokedActivation.StatusCode);
        var availableAfterRevocation = await client.GetFromJsonAsync<JsonElement[]>("/api/tenant/modules/marketplace");
        Assert.Equal("1.0.0", Assert.Single(availableAfterRevocation!).GetProperty("version").GetString());

        SetIdentity(client, TenantA, MaintainerId, "TenantAdmin", "PlatformDeveloper");
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/platform/modules/");
        Assert.Equal(2, catalog!.Length);
        Assert.Contains(catalog, release => release.GetProperty("status").GetString() == "Revoked");

        await using var auditScope = factory.Services.CreateAsyncScope();
        var auditDb = auditScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(2, await auditDb.AuditEvents.CountAsync(x => x.Action == "module.release.uploaded"));
        Assert.Equal(2, await auditDb.AuditEvents.CountAsync(x => x.Action == "module.release.published"));
        Assert.Equal(3, await auditDb.AuditEvents.CountAsync(x => x.Action == "module.tenant.activated" && x.TenantId == TenantA));
        Assert.Single(await auditDb.AuditEvents.Where(x => x.Action == "module.tenant.deactivated" && x.TenantId == TenantA).ToListAsync());
        Assert.Single(await auditDb.AuditEvents.Where(x => x.Action == "module.release.revoked").ToListAsync());
    }

    private static ModuleManifest CreateManifest(string version) => new(
        ModuleCode,
        "Sample catalog module",
        version,
        Publisher,
        "1.0.0",
        [],
        [new ModulePermission("catalog.read", "Read sample catalog")],
        [],
        []);

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, RSA rsa, ModuleManifest manifest, bool invalidSignature = false)
    {
        var packageBytes = CreatePackage();
        var checksum = Convert.ToHexStringLower(SHA256.HashData(packageBytes));
        var payload = ModulePackageVerifier.CreateSigningPayload(manifest, KeyId, checksum);
        var signature = rsa.SignData(payload, HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
        if (invalidSignature) signature[^1] ^= 0x01;

        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(JsonSerializer.Serialize(manifest, new JsonSerializerOptions(JsonSerializerDefaults.Web))), "manifest");
        content.Add(new StringContent(KeyId), "keyId");
        content.Add(new StringContent(checksum), "artifactSha256");
        content.Add(new StringContent(Convert.ToBase64String(signature)), "signatureBase64");
        var artifact = new ByteArrayContent(packageBytes);
        artifact.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        content.Add(artifact, "artifact", "module.zip");
        return await client.PostAsync("/api/platform/modules/releases", content);
    }

    private static byte[] CreatePackage()
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        using (var wasm = archive.CreateEntry("module.wasm").Open())
            wasm.Write(new byte[] { 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 });
        return output.ToArray();
    }

    private static async Task SeedAsync(ModuleApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Synthetic Tenant A", Slug = "module-test-a" },
            new Tenant { Id = TenantB, Name = "Synthetic Tenant B", Slug = "module-test-b" });
        db.TenantDatabaseCatalog.AddRange(
            new TenantDatabaseCatalogEntry
            {
                TenantId = TenantA,
                DatabaseName = $"AIERPTenant_{TenantA:N}",
                State = TenantDatabaseProvisioningState.Ready,
                ReadyAt = DateTimeOffset.UtcNow
            },
            new TenantDatabaseCatalogEntry
            {
                TenantId = TenantB,
                DatabaseName = $"AIERPTenant_{TenantB:N}",
                State = TenantDatabaseProvisioningState.Ready,
                ReadyAt = DateTimeOffset.UtcNow
            });
        db.Users.AddRange(
            new AppUser { Id = MaintainerId, Email = "module-maintainer@example.invalid", DisplayName = "Module Maintainer" },
            new AppUser { Id = PublisherId, Email = "module-publisher@example.invalid", DisplayName = "Module Publisher" },
            new AppUser { Id = TenantAdminId, Email = "module-admin@example.invalid", DisplayName = "Tenant Admin" });
        await db.SaveChangesAsync();
    }

    private static void SetIdentity(HttpClient client, Guid tenantId, Guid userId, string role, string? platformRole = null)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Remove("X-Test-Platform-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        if (platformRole is not null) client.DefaultRequestHeaders.Add("X-Test-Platform-Role", platformRole);
    }

    private sealed class ProcessEnvironmentOverride(IReadOnlyDictionary<string, string?> previousValues) : IDisposable
    {
        private bool _disposed;

        public static ProcessEnvironmentOverride Push(IReadOnlyDictionary<string, string?> values)
        {
            var previous = values.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
            foreach (var (key, value) in values) Environment.SetEnvironmentVariable(key, value);
            return new ProcessEnvironmentOverride(previous);
        }

        public void Dispose()
        {
            if (_disposed) return;
            foreach (var (key, value) in previousValues) Environment.SetEnvironmentVariable(key, value);
            _disposed = true;
        }
    }

    private sealed class ModuleApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"module-lifecycle-{Guid.NewGuid():N}";
        private readonly string _packageRoot = Path.Combine(Path.GetTempPath(), $"aierp-module-lifecycle-{Guid.NewGuid():N}");

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-module-lifecycle-auth-signing-key-32-bytes",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["PluginHost:SigningKey"] = "synthetic-module-lifecycle-plugin-signing-key-32-bytes",
                ["PluginHost:BaseUrl"] = "http://plugin-host",
                ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["ModulePackages:RootPath"] = _packageRoot
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options
                    .UseInMemoryDatabase(_databaseName)
                    .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = ModuleTestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = ModuleTestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = ModuleTestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, ModuleTestAuthenticationHandler>(ModuleTestAuthenticationHandler.SchemeName, _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder(ModuleTestAuthenticationHandler.SchemeName)
                        .RequireAuthenticatedUser().Build());
                services.AddHttpClient("plugin-host").ConfigurePrimaryHttpMessageHandler(() => new ModuleValidationHandler());
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing && Directory.Exists(_packageRoot)) Directory.Delete(_packageRoot, recursive: true);
        }
    }

    private sealed class ModuleTestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "module-lifecycle-test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Guid.TryParse(Request.Headers["X-Test-User"], out var parsedUserId)
                ? parsedUserId : Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
            var claims = new List<Claim>
            {
                new("tenant_id", tenantId.ToString("D")),
                new("sub", userId.ToString("D")),
                new("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
            };
            var platformRole = Request.Headers["X-Test-Platform-Role"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(platformRole)) claims.Add(new Claim("platform_role", platformRole));
            var identity = new ClaimsIdentity(claims, SchemeName);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }

    private sealed class ModuleValidationHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method != HttpMethod.Post || request.RequestUri?.AbsolutePath != "/internal/modules/validate")
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        }
    }
}
