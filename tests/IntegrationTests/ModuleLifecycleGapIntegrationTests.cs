using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO.Compression;
using AIERP.Api;
using AIERP.ModuleSDK;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
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
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[CollectionDefinition(nameof(ModuleLifecycleGapIntegrationTests), DisableParallelization = true)]
public sealed class ModuleLifecycleGapIntegrationCollection { }

[Collection(nameof(ModuleLifecycleGapIntegrationTests))]
public sealed class ModuleLifecycleGapIntegrationTests
{
    private const string SigningKey = "synthetic-module-gap-api-signing-key-32-bytes";
    private const string PluginSigningKey = "synthetic-module-gap-plugin-signing-key-32-bytes";
    private const string Publisher = "Synthetic Lifecycle Publisher";
    private const string KeyId = "module-gap-key";
    private const string ModuleCode = "sample.catalog";
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid TenantAdmin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid SuperAdmin = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task Invocation_route_uses_signed_bearers_is_tenant_scoped_and_returns_pluginhost_422()
    {
        using var startupConfiguration = ProcessEnvironmentOverride.Push(StartupEnvironment());
        var pluginHost = new PluginHostStub(HttpStatusCode.UnprocessableEntity);
        await using var factory = new ModuleGapApiFactory(pluginHost);
        using var client = factory.CreateClient();
        using var rsa = RSA.Create(2048);
        var release = await SeedPublishedReleaseAsync(factory, rsa, "1.0.0");
        await SeedActivationAsync(factory, TenantA, release.Version);
        await using (var membershipScope = factory.Services.CreateAsyncScope())
        {
            var membershipDb = membershipScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            membershipDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantB, UserId = TenantAdmin, Role = "TenantAdmin" });
            await membershipDb.SaveChangesAsync();
        }

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, TenantAdmin, "TenantAdmin");
        using var tenantAResponse = await client.PostAsJsonAsync($"/api/tenant/modules/{ModuleCode}/invoke", new
        {
            action = "list",
            input = new { query = "synthetic" }
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, tenantAResponse.StatusCode);
        Assert.Equal(1, pluginHost.InvocationCount);
        Assert.True(pluginHost.LastInvocationTokenValidated);
        Assert.Equal(TenantA, pluginHost.LastTenantId);
        Assert.Equal(TenantAdmin, pluginHost.LastUserId);
        Assert.Equal("module.invoke", pluginHost.LastOperation);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantB, TenantAdmin, "TenantAdmin");
        using var tenantBResponse = await client.PostAsJsonAsync($"/api/tenant/modules/{ModuleCode}/invoke", new
        {
            action = "list",
            input = new { query = "synthetic" }
        });

        Assert.Equal(HttpStatusCode.NotFound, tenantBResponse.StatusCode);
        Assert.Equal(1, pluginHost.InvocationCount);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await db.AuditEvents.Where(x => x.Action == "module.tenant.invoked").ToListAsync());
    }

    [Fact]
    public async Task Failed_v2_activation_preserves_v1_and_does_not_record_success_audit()
    {
        using var startupConfiguration = ProcessEnvironmentOverride.Push(StartupEnvironment());
        var pluginHost = new PluginHostStub(HttpStatusCode.OK);
        await using var factory = new ModuleGapApiFactory(pluginHost);
        using var client = factory.CreateClient();
        using var rsa = RSA.Create(2048);
        var v1 = await SeedPublishedReleaseAsync(factory, rsa, "1.0.0");
        var v2 = await SeedPublishedReleaseAsync(factory, rsa, "2.0.0");
        await SeedActivationAsync(factory, TenantA, v1.Version);
        pluginHost.ValidationStatus = HttpStatusCode.BadRequest;

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, TenantAdmin, "TenantAdmin");
        using var response = await client.PostAsJsonAsync("/api/tenant/modules/activate", new
        {
            moduleCode = ModuleCode,
            version = v2.Version
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var activation = await db.TenantModuleActivations.SingleAsync(x => x.TenantId == TenantA && x.ModuleCode == ModuleCode);
        Assert.Equal(v1.Version, activation.Version);
        Assert.Single(await db.AuditEvents.Where(x => x.Action == "module.tenant.activated" && x.TenantId == TenantA).ToListAsync());
    }

    [Fact]
    public async Task Revoked_publisher_key_cannot_sign_a_new_upload()
    {
        using var startupConfiguration = ProcessEnvironmentOverride.Push(StartupEnvironment());
        var pluginHost = new PluginHostStub(HttpStatusCode.OK);
        await using var factory = new ModuleGapApiFactory(pluginHost);
        using var client = factory.CreateClient();
        using var rsa = RSA.Create(2048);
        await SeedTenantsAsync(factory);
        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, SuperAdmin, "TenantAdmin", "PlatformSuperAdmin");
        using var created = await client.PostAsJsonAsync("/api/platform/modules/publisher-keys", new
        {
            publisher = Publisher,
            keyId = KeyId,
            publicKeyPem = rsa.ExportSubjectPublicKeyInfoPem()
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, SuperAdmin, "TenantAdmin", "PlatformReleaseManager");
        using var firstUpload = await UploadAsync(client, rsa, "1.0.0");
        Assert.Equal(HttpStatusCode.Created, firstUpload.StatusCode);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, SuperAdmin, "TenantAdmin", "PlatformSuperAdmin");
        using var revoked = await client.DeleteAsync($"/api/platform/modules/publisher-keys/{Publisher}/{KeyId}");
        Assert.Equal(HttpStatusCode.NoContent, revoked.StatusCode);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, SuperAdmin, "TenantAdmin", "PlatformReleaseManager");
        using var revokedKeyUpload = await UploadAsync(client, rsa, "2.0.0");
        Assert.Equal(HttpStatusCode.BadRequest, revokedKeyUpload.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.False((await db.PlatformModulePublisherKeys.SingleAsync()).IsActive);
        Assert.Single(await db.PlatformModuleReleases.ToListAsync());
        Assert.Single(await db.AuditEvents.Where(x => x.Action == "module.publisher-key.revoked").ToListAsync());
    }

    [Fact]
    public async Task Publisher_revoke_and_key_management_require_their_platform_roles()
    {
        using var startupConfiguration = ProcessEnvironmentOverride.Push(StartupEnvironment());
        var pluginHost = new PluginHostStub(HttpStatusCode.OK);
        await using var factory = new ModuleGapApiFactory(pluginHost);
        using var client = factory.CreateClient();
        await SeedTenantsAsync(factory);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, TenantAdmin, "TenantAdmin");
        using (var createKey = await client.PostAsJsonAsync("/api/platform/modules/publisher-keys", new
               { publisher = Publisher, keyId = KeyId, publicKeyPem = "synthetic-invalid-key" }))
            Assert.Equal(HttpStatusCode.Forbidden, createKey.StatusCode);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, SuperAdmin, "TenantAdmin", "PlatformDeveloper");
        using (var publish = await client.PostAsync($"/api/platform/modules/releases/{Guid.NewGuid():D}/publish", null))
            Assert.Equal(HttpStatusCode.Forbidden, publish.StatusCode);
        using (var revoke = await client.PostAsJsonAsync($"/api/platform/modules/releases/{Guid.NewGuid():D}/revoke", new { reason = "synthetic" }))
            Assert.Equal(HttpStatusCode.Forbidden, revoke.StatusCode);
        using (var listKeys = await client.GetAsync("/api/platform/modules/publisher-keys"))
            Assert.Equal(HttpStatusCode.Forbidden, listKeys.StatusCode);
        using (var deleteKey = await client.DeleteAsync($"/api/platform/modules/publisher-keys/{Publisher}/{KeyId}"))
            Assert.Equal(HttpStatusCode.Forbidden, deleteKey.StatusCode);

        client.DefaultRequestHeaders.Authorization = Bearer(TenantA, SuperAdmin, "TenantAdmin", "PlatformReleaseManager");
        using (var createKey = await client.PostAsJsonAsync("/api/platform/modules/publisher-keys", new
               { publisher = Publisher, keyId = KeyId, publicKeyPem = "synthetic-invalid-key" }))
            Assert.Equal(HttpStatusCode.Forbidden, createKey.StatusCode);
        using (var listKeys = await client.GetAsync("/api/platform/modules/publisher-keys"))
            Assert.Equal(HttpStatusCode.Forbidden, listKeys.StatusCode);
        using (var deleteKey = await client.DeleteAsync($"/api/platform/modules/publisher-keys/{Publisher}/{KeyId}"))
            Assert.Equal(HttpStatusCode.Forbidden, deleteKey.StatusCode);
    }

    private static async Task<PlatformModuleRelease> SeedPublishedReleaseAsync(ModuleGapApiFactory factory, RSA rsa, string version)
    {
        await SeedTenantsAsync(factory);
        var manifest = CreateManifest(version);
        var packageBytes = CreatePackage();
        var checksum = Convert.ToHexStringLower(SHA256.HashData(packageBytes));
        var payload = ModulePackageVerifier.CreateSigningPayload(manifest, KeyId, checksum);
        var signature = Convert.ToBase64String(rsa.SignData(payload, HashAlgorithmName.SHA256, RSASignaturePadding.Pss));
        var storageKey = $"{checksum}.zip";
        Directory.CreateDirectory(factory.PackageRoot);
        await File.WriteAllBytesAsync(Path.Combine(factory.PackageRoot, storageKey), packageBytes);
        var release = new PlatformModuleRelease
        {
            ModuleCode = ModuleCode,
            Version = version,
            Publisher = Publisher,
            ManifestJson = JsonSerializer.Serialize(manifest, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
            ArtifactSha256 = checksum,
            SignatureBase64 = signature,
            KeyId = KeyId,
            StorageKey = storageKey,
            RuntimeKind = "wasm-core-no-imports",
            RuntimeValidatedAt = DateTimeOffset.UtcNow,
            Status = "Published",
            CreatedByUserId = SuperAdmin,
            PublishedByUserId = TenantAdmin,
            PublishedAt = DateTimeOffset.UtcNow
        };
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        if (!await db.PlatformModulePublisherKeys.AnyAsync(x => x.Publisher == Publisher && x.KeyId == KeyId))
            db.PlatformModulePublisherKeys.Add(new PlatformModulePublisherKey
            {
                Publisher = Publisher, KeyId = KeyId, PublicKeyPem = rsa.ExportSubjectPublicKeyInfoPem(), CreatedByUserId = SuperAdmin
            });
        db.PlatformModuleReleases.Add(release);
        await db.SaveChangesAsync();
        return release;
    }

    private static async Task SeedActivationAsync(ModuleGapApiFactory factory, Guid tenantId, string version)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        db.TenantModuleActivations.Add(new TenantModuleActivation
        {
            TenantId = tenantId, ModuleCode = ModuleCode, Version = version, ActivatedByUserId = TenantAdmin
        });
        db.AuditEvents.Add(new AuditEvent
        {
            TenantId = tenantId, UserId = TenantAdmin, Action = "module.tenant.activated", Resource = $"{ModuleCode}@{version}"
        });
        await db.SaveChangesAsync();
    }

    private static async Task SeedTenantsAsync(ModuleGapApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.EnsureCreatedAsync();
        if (await db.Tenants.AnyAsync()) return;
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Synthetic Tenant A", Slug = "module-gap-a" },
            new Tenant { Id = TenantB, Name = "Synthetic Tenant B", Slug = "module-gap-b" });
        db.TenantDatabaseCatalog.AddRange(
            new TenantDatabaseCatalogEntry { TenantId = TenantA, DatabaseName = $"AIERPTenant_{TenantA:N}", State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow },
            new TenantDatabaseCatalogEntry { TenantId = TenantB, DatabaseName = $"AIERPTenant_{TenantB:N}", State = TenantDatabaseProvisioningState.Ready, ReadyAt = DateTimeOffset.UtcNow });
        db.Users.AddRange(
            new AppUser { Id = TenantAdmin, Email = "module-gap-admin@example.invalid", DisplayName = "Synthetic Tenant Admin" },
            new AppUser { Id = SuperAdmin, Email = "module-gap-superadmin@example.invalid", DisplayName = "Synthetic Platform User" });
        db.TenantMemberships.Add(new TenantMembership { TenantId = TenantA, UserId = TenantAdmin, Role = "TenantAdmin" });
        await db.SaveChangesAsync();
    }

    private static ModuleManifest CreateManifest(string version) => new(
        ModuleCode,
        "Synthetic catalog module",
        version,
        Publisher,
        "1.0.0",
        [],
        [new ModulePermission("catalog.read", "Read the synthetic catalog")],
        [new ModuleMenuEntry("list", "List", "/catalog", "catalog.read")],
        []);

    private static byte[] CreatePackage()
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        using (var wasm = archive.CreateEntry("module.wasm").Open())
            wasm.Write(new byte[] { 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 });
        return output.ToArray();
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, RSA rsa, string version)
    {
        var manifest = CreateManifest(version);
        var package = CreatePackage();
        var checksum = Convert.ToHexStringLower(SHA256.HashData(package));
        var signature = rsa.SignData(ModulePackageVerifier.CreateSigningPayload(manifest, KeyId, checksum),
            HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(JsonSerializer.Serialize(manifest, new JsonSerializerOptions(JsonSerializerDefaults.Web))), "manifest");
        content.Add(new StringContent(KeyId), "keyId");
        content.Add(new StringContent(checksum), "artifactSha256");
        content.Add(new StringContent(Convert.ToBase64String(signature)), "signatureBase64");
        var artifact = new ByteArrayContent(package);
        artifact.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        content.Add(artifact, "artifact", "module.zip");
        return await client.PostAsync("/api/platform/modules/releases", content);
    }

    private static AuthenticationHeaderValue Bearer(Guid tenantId, Guid userId, string role, string? platformRole = null)
    {
        var claims = new List<Claim>
        {
            new("tenant_id", tenantId.ToString("D")),
            new(JwtRegisteredClaimNames.Sub, userId.ToString("D")),
            new("role", role)
        };
        if (platformRole is not null) claims.Add(new Claim("platform_role", platformRole));
        var token = new JwtSecurityToken("AIERP", "AIERP", claims,
            DateTime.UtcNow.AddSeconds(-5), DateTime.UtcNow.AddMinutes(5),
            new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey)), SecurityAlgorithms.HmacSha256));
        return new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
    }

    private static Dictionary<string, string?> StartupEnvironment() => new()
    {
        ["Authentication__SigningKey"] = SigningKey,
        ["Authentication__Issuer"] = "AIERP",
        ["Authentication__Audience"] = "AIERP",
        ["PluginHost__SigningKey"] = PluginSigningKey,
        ["PluginHost__BaseUrl"] = "http://plugin-host",
        ["ConnectionStrings__Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
        ["ConnectionStrings__Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
        ["ConnectionStrings__AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
        ["Database__SeparationEnabled"] = "true",
        ["Database__ApplyMigrationsOnStartup"] = "false"
    };

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

    private sealed class ModuleGapApiFactory(PluginHostStub pluginHost) : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"module-gap-{Guid.NewGuid():N}";
        public string PackageRoot { get; } = Path.Combine(Path.GetTempPath(), $"aierp-module-gap-{Guid.NewGuid():N}");

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = SigningKey,
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["PluginHost:SigningKey"] = PluginSigningKey,
                ["PluginHost:BaseUrl"] = "http://plugin-host",
                ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["ModulePackages:RootPath"] = PackageRoot
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName)
                    .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
                services.AddHttpClient("plugin-host").ConfigurePrimaryHttpMessageHandler(() => pluginHost);
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing && Directory.Exists(PackageRoot)) Directory.Delete(PackageRoot, recursive: true);
        }
    }

    private sealed class PluginHostStub(HttpStatusCode invocationStatus) : HttpMessageHandler
    {
        public HttpStatusCode ValidationStatus { get; set; } = HttpStatusCode.OK;
        public int InvocationCount { get; private set; }
        public bool LastInvocationTokenValidated { get; private set; }
        public Guid? LastTenantId { get; private set; }
        public Guid? LastUserId { get; private set; }
        public string? LastOperation { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method != HttpMethod.Post) return new HttpResponseMessage(HttpStatusCode.NotFound);
            if (request.RequestUri?.AbsolutePath == "/internal/modules/validate") return new HttpResponseMessage(ValidationStatus);
            if (request.RequestUri?.AbsolutePath != "/internal/modules/invoke") return new HttpResponseMessage(HttpStatusCode.NotFound);
            InvocationCount++;
            var token = request.Headers.Authorization?.Parameter;
            if (string.IsNullOrWhiteSpace(token)) return new HttpResponseMessage(HttpStatusCode.Unauthorized);
            try
            {
                var validation = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = "AIERP",
                    ValidateAudience = true,
                    ValidAudience = "AIERP.PluginHost",
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(PluginSigningKey)),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(5)
                };
                var principal = new JwtSecurityTokenHandler { MapInboundClaims = false }.ValidateToken(token, validation, out _);
                LastInvocationTokenValidated = true;
                LastTenantId = Guid.Parse(principal.FindFirst("tenant_id")!.Value);
                LastUserId = Guid.Parse(principal.FindFirst(JwtRegisteredClaimNames.Sub)!.Value);
                LastOperation = principal.FindFirst("operation")!.Value;
            }
            catch (Exception exception) when (exception is SecurityTokenException or ArgumentException or NullReferenceException)
            {
                return new HttpResponseMessage(HttpStatusCode.Unauthorized);
            }
            await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(invocationStatus);
        }
    }
}
