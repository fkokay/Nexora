using System.Data;
using System.Net;
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
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class TenantLicenseIntegrationTests
{
    private static readonly Guid TenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Signed_grant_activates_for_matching_tenant_and_reports_live_usage()
    {
        using var rsa = RSA.Create(2048);
        await using var app = await StartApplicationAsync(rsa, memberCount: 2);
        using var client = app.GetTestClient();
        var token = SignGrant(rsa, TenantId, "Medium");

        using var activation = await client.PostAsJsonAsync("/api/tenant-license/activate", new { signedGrant = token, rowVersion = (string?)null });

        Assert.Equal(HttpStatusCode.OK, activation.StatusCode);
        var activated = await activation.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Medium", activated.GetProperty("tier").GetString());
        Assert.Equal(2, activated.GetProperty("usage").GetProperty("users").GetInt32());
        Assert.Equal(0, activated.GetProperty("usage").GetProperty("customModules").GetInt32());

        var current = await client.GetFromJsonAsync<JsonElement>("/api/tenant-license/");
        Assert.Equal("Active", current.GetProperty("status").GetString());
        Assert.Equal(50, current.GetProperty("maxUsers").GetInt32());
        Assert.True(current.GetProperty("features").GetProperty("advancedWorkflow").GetBoolean());
        Assert.Equal(JsonValueKind.Null, current.GetProperty("usage").GetProperty("sqlDataBytes").ValueKind);
    }

    [Fact]
    public async Task Signed_package_profiles_apply_their_seat_module_storage_and_feature_limits()
    {
        Assert.Equal(10, LicenseTierCatalog.All["Small"].MaxStorageGb);
        Assert.Equal(50, LicenseTierCatalog.All["Medium"].MaxStorageGb);
        Assert.Equal(250, LicenseTierCatalog.All["Large"].MaxStorageGb);
        using var rsa = RSA.Create(2048);
        foreach (var tier in new[] { "Small", "Medium", "Large" })
        {
            await using var app = await StartApplicationAsync(rsa, memberCount: 2);
            using var client = app.GetTestClient();
            using var response = await client.PostAsJsonAsync("/api/tenant-license/activate", new
            {
                signedGrant = SignGrant(rsa, TenantId, tier), rowVersion = (string?)null
            });

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            var policy = LicenseTierCatalog.All[tier];
            Assert.Equal(policy.MaxUsers, body.GetProperty("maxUsers").GetInt32());
            Assert.Equal(policy.MaxCustomModules, body.GetProperty("maxCustomModules").GetInt32());
            Assert.Equal(policy.MaxStorageGb, body.GetProperty("maxStorageGb").GetInt32());
            Assert.Equal(policy.AdvancedWorkflow, body.GetProperty("features").GetProperty("advancedWorkflow").GetBoolean());
            Assert.Equal(policy.CustomModuleSource, body.GetProperty("features").GetProperty("customModuleSource").GetBoolean());
            Assert.Equal(policy.HighAvailability, body.GetProperty("features").GetProperty("highAvailability").GetBoolean());
        }
    }

    [Fact]
    public void Legacy_storage_claims_remain_valid_while_the_current_catalog_controls_enforced_quotas()
    {
        var medium = new TenantLicense
        {
            LicenseId = Guid.NewGuid(), Tier = "Medium", MaxUsers = 50,
            MaxCustomModules = 15, MaxStorageGb = 100, GrantSha256 = new string('A', 64)
        };
        var large = new TenantLicense
        {
            LicenseId = Guid.NewGuid(), Tier = "Large", MaxUsers = int.MaxValue,
            MaxCustomModules = int.MaxValue, MaxStorageGb = int.MaxValue, GrantSha256 = new string('B', 64)
        };

        Assert.True(LicenseTierCatalog.IsValidStoredLicense(medium));
        Assert.True(LicenseTierCatalog.IsValidStoredLicense(large));
        Assert.Equal(50, LicenseTierCatalog.All[medium.Tier].MaxStorageGb);
        Assert.Equal(250, LicenseTierCatalog.All[large.Tier].MaxStorageGb);
    }

    [SqlServerAcceptanceFact]
    public async Task License_storage_meter_reads_the_selected_tenant_database_and_tracks_allocated_data_pages()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        using var rsa = RSA.Create(2048);
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = $"AIERP_LicenseMeter_Platform_{suffix}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var tenantConnection = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = $"AIERP_LicenseMeter_Tenant_{suffix}",
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
        await using var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
        var platformCreated = false;
        var tenantCreated = false;
        WebApplication? app = null;
        try
        {
            platformCreated = await platformDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);

            var tenant = new Tenant { Id = TenantId, Name = "License meter", Slug = $"license-meter-{suffix}" };
            var user = new AppUser { Id = UserId, Email = $"license-meter-{suffix}@example.invalid", DisplayName = "License meter user", IsActive = true };
            platformDb.Tenants.Add(tenant);
            platformDb.Users.Add(user);
            platformDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
            await platformDb.SaveChangesAsync();

            app = await StartSqlServerApplicationAsync(rsa, platformConnection, tenantConnection);
            using var client = app.GetTestClient();
            var before = await client.GetFromJsonAsync<JsonElement>("/api/tenant-license/");
            var beforeBytes = before.GetProperty("usage").GetProperty("sqlDataBytes").GetInt64();

            await using (var connection = new SqlConnection(tenantConnection))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = "CREATE TABLE [dbo].[StorageProbe] ([Payload] varbinary(max) NOT NULL); INSERT INTO [dbo].[StorageProbe] ([Payload]) VALUES (@payload);";
                command.Parameters.Add(new SqlParameter("@payload", System.Data.SqlDbType.VarBinary, -1) { Value = new byte[1_000_000] });
                await command.ExecuteNonQueryAsync();
            }

            var after = await client.GetFromJsonAsync<JsonElement>("/api/tenant-license/");
            var afterBytes = after.GetProperty("usage").GetProperty("sqlDataBytes").GetInt64();
            Assert.True(beforeBytes > 0);
            Assert.True(afterBytes > beforeBytes, $"Expected the selected tenant database usage to increase after adding 1 MB; before={beforeBytes}, after={afterBytes}.");
        }
        finally
        {
            if (app is not null) await app.DisposeAsync();
            if (tenantCreated) await tenantDb.Database.EnsureDeletedAsync();
            if (platformCreated) await platformDb.Database.EnsureDeletedAsync();
        }
    }

    [Fact]
    public async Task Grant_for_another_tenant_and_over_limit_tier_are_rejected_without_storing_license()
    {
        using var rsa = RSA.Create(2048);
        await using var app = await StartApplicationAsync(rsa, memberCount: 11);
        using var client = app.GetTestClient();

        using var wrongTenant = await client.PostAsJsonAsync("/api/tenant-license/activate", new
        {
            signedGrant = SignGrant(rsa, Guid.NewGuid(), "Small"), rowVersion = (string?)null
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongTenant.StatusCode);

        using var overLimit = await client.PostAsJsonAsync("/api/tenant-license/activate", new
        {
            signedGrant = SignGrant(rsa, TenantId, "Small"), rowVersion = (string?)null
        });
        Assert.Equal(HttpStatusCode.Conflict, overLimit.StatusCode);
        var body = await overLimit.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("license.user_limit", body.GetProperty("code").GetString());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await db.TenantLicenses.ToListAsync());
    }

    [Fact]
    public async Task Small_license_is_rejected_when_existing_custom_modules_exceed_its_limit()
    {
        using var rsa = RSA.Create(2048);
        await using var app = await StartApplicationAsync(rsa, memberCount: 2, moduleCount: 4);
        using var client = app.GetTestClient();

        using var response = await client.PostAsJsonAsync("/api/tenant-license/activate", new
        {
            signedGrant = SignGrant(rsa, TenantId, "Small"), rowVersion = (string?)null
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("license.module_limit", body.GetProperty("code").GetString());
        Assert.Equal(3, body.GetProperty("limit").GetInt32());
        Assert.Equal(4, body.GetProperty("activeCount").GetInt32());
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await db.TenantLicenses.ToListAsync());
    }

    [Fact]
    public async Task Unknown_stored_tier_is_reported_as_invalid_and_can_be_reactivated_with_current_row_version()
    {
        using var rsa = RSA.Create(2048);
        await using var app = await StartApplicationAsync(rsa, memberCount: 2);
        using var client = app.GetTestClient();
        var oldLicenseId = Guid.NewGuid();
        var expiresAt = DateTimeOffset.UtcNow.AddDays(10);

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TenantLicenses.Add(new TenantLicense
            {
                TenantId = TenantId,
                LicenseId = oldLicenseId,
                Tier = "LegacyUnknown",
                MaxUsers = 10,
                MaxCustomModules = 3,
                MaxStorageGb = 10,
                IssuedAt = DateTimeOffset.UtcNow.AddDays(-1),
                ExpiresAt = expiresAt,
                GrantSha256 = new string('A', 64),
                RowVersion = [1, 2, 3, 4, 5, 6, 7, 8]
            });
            await db.SaveChangesAsync();
        }

        var invalid = await client.GetFromJsonAsync<JsonElement>("/api/tenant-license/");
        Assert.Equal("Invalid", invalid.GetProperty("status").GetString());
        Assert.Equal(oldLicenseId, invalid.GetProperty("licenseId").GetGuid());
        Assert.Equal("LegacyUnknown", invalid.GetProperty("tier").GetString());
        var rowVersion = invalid.GetProperty("rowVersion").GetString();
        Assert.Equal(8, Convert.FromBase64String(rowVersion!).Length);
        Assert.Equal(JsonValueKind.Null, invalid.GetProperty("maxUsers").ValueKind);
        Assert.Equal(JsonValueKind.Null, invalid.GetProperty("features").ValueKind);

        using var activation = await client.PostAsJsonAsync("/api/tenant-license/activate", new
        {
            signedGrant = SignGrant(rsa, TenantId, "Medium"),
            rowVersion
        });

        Assert.Equal(HttpStatusCode.OK, activation.StatusCode);
        var activated = await activation.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Active", activated.GetProperty("status").GetString());
        Assert.Equal("Medium", activated.GetProperty("tier").GetString());
    }

    [SqlServerAcceptanceFact]
    public async Task Concurrent_small_license_downgrade_and_member_addition_never_exceed_the_tier_limit()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        using var rsa = RSA.Create(2048);
        var databaseName = $"AIERP_TenantLicenseRace_{Guid.NewGuid():N}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(connectionString).Options;
        await using var seedDb = new PlatformDbContext(options);
        var databaseCreated = false;
        WebApplication? app = null;
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);

            var tenant = new Tenant { Id = TenantId, Name = "License race", Slug = $"license-race-{Guid.NewGuid():N}" };
            var users = Enumerable.Range(0, 11).Select(index => new AppUser
            {
                Id = index == 0 ? UserId : Guid.NewGuid(),
                Email = $"license-race-{index}@example.invalid",
                DisplayName = $"License race user {index}",
                PasswordHash = "not-used",
                IsActive = true
            }).ToArray();
            seedDb.Tenants.Add(tenant);
            seedDb.Users.AddRange(users);
            for (var index = 0; index < 10; index++)
                seedDb.TenantMemberships.Add(new TenantMembership
                {
                    TenantId = TenantId,
                    UserId = users[index].Id,
                    Role = index == 0 ? "TenantAdmin" : "TenantUser"
                });
            var license = new TenantLicense
            {
                TenantId = TenantId,
                LicenseId = Guid.NewGuid(),
                Tier = "Medium",
                MaxUsers = 50,
                MaxCustomModules = 15,
                MaxStorageGb = 50,
                IssuedAt = DateTimeOffset.UtcNow.AddDays(-1),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
                GrantSha256 = new string('A', 64)
            };
            seedDb.TenantLicenses.Add(license);
            await seedDb.SaveChangesAsync();
            var rowVersion = Convert.ToBase64String(license.RowVersion);

            app = await StartSqlServerApplicationAsync(rsa, connectionString);
            using var client = app.GetTestClient();
            var activateTask = client.PostAsJsonAsync("/api/tenant-license/activate", new
            {
                signedGrant = SignGrant(rsa, TenantId, "Small"), rowVersion
            });
            var addMemberTask = client.PostAsJsonAsync("/api/access-control/members", new
            {
                userId = users[10].Id, role = "TenantUser"
            });
            var responses = await Task.WhenAll(activateTask, addMemberTask);
            using var activation = responses[0];
            using var addMember = responses[1];

            if (activation.StatusCode == HttpStatusCode.OK)
                Assert.Equal(HttpStatusCode.Conflict, addMember.StatusCode);
            else
            {
                Assert.Equal(HttpStatusCode.Conflict, activation.StatusCode);
                Assert.Equal(HttpStatusCode.Created, addMember.StatusCode);
            }

            await using var verificationDb = new PlatformDbContext(options);
            var finalLicense = await verificationDb.TenantLicenses.SingleAsync(x => x.TenantId == TenantId);
            var finalUserCount = await verificationDb.TenantMemberships.CountAsync(x => x.TenantId == TenantId);
            Assert.True(finalUserCount <= LicenseTierCatalog.All[finalLicense.Tier].MaxUsers);
            Assert.Equal(activation.StatusCode == HttpStatusCode.OK ? "Small" : "Medium", finalLicense.Tier);
            Assert.Equal(activation.StatusCode == HttpStatusCode.OK ? 10 : 11, finalUserCount);
        }
        finally
        {
            if (app is not null) await app.DisposeAsync();
            if (databaseCreated) await seedDb.Database.EnsureDeletedAsync();
        }
    }

    [SqlServerAcceptanceFact]
    public async Task Small_license_downgrade_waits_for_in_flight_module_activation_and_rechecks_quota()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        using var rsa = RSA.Create(2048);
        var databaseName = $"AIERP_TenantModuleLicenseRace_{Guid.NewGuid():N}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(connectionString).Options;
        await using var seedDb = new PlatformDbContext(options);
        var databaseCreated = false;
        LicenseRaceApiFactory? factory = null;
        SqlConnection? gateConnection = null;
        Microsoft.Data.SqlClient.SqlTransaction? gateTransaction = null;
        CancellationTokenSource? requestTimeout = null;
        Task<HttpResponseMessage>? moduleActivationTask = null;
        Task<HttpResponseMessage>? downgradeTask = null;
        var packageRoot = Path.Combine(Path.GetTempPath(), $"aierp-license-race-packages-{Guid.NewGuid():N}");
        try
        {
            databaseCreated = await seedDb.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);

            seedDb.Tenants.Add(new Tenant { Id = TenantId, Name = "Module license race", Slug = $"module-license-race-{Guid.NewGuid():N}" });
            seedDb.Users.Add(new AppUser { Id = UserId, Email = "module-license-race@example.invalid", DisplayName = "Module license race", PasswordHash = "not-used", IsActive = true });
            seedDb.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = UserId, Role = "TenantAdmin" });
            seedDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = TenantId,
                DatabaseName = $"AIERPTenant_{TenantId:N}",
                State = TenantDatabaseProvisioningState.Ready,
                ReadyAt = DateTimeOffset.UtcNow
            });
            seedDb.TenantLicenses.Add(new TenantLicense
            {
                TenantId = TenantId,
                LicenseId = Guid.NewGuid(),
                Tier = "Medium",
                MaxUsers = 50,
                MaxCustomModules = 15,
                MaxStorageGb = 50,
                IssuedAt = DateTimeOffset.UtcNow.AddDays(-1),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
                GrantSha256 = new string('A', 64)
            });
            for (var index = 0; index < LicenseTierCatalog.All["Small"].MaxCustomModules; index++)
                seedDb.TenantModuleActivations.Add(new TenantModuleActivation
                {
                    TenantId = TenantId,
                    ModuleCode = $"race.module-{index}",
                    Version = "1.0.0",
                    ActivatedByUserId = UserId
                });

            using var moduleKey = RSA.Create(2048);
            const string moduleCode = "race.module-in-flight";
            const string moduleVersion = "1.0.0";
            const string publisher = "Nexora License Race Test";
            const string publisherKeyId = "license-race-key";
            var manifest = new ModuleManifest(moduleCode, "Quota race module", moduleVersion, publisher, "1.0.0",
                [], [new ModulePermission("quota.read", "Read quota test data")], [], []);
            var packageBytes = CreateModulePackage();
            var packageSha256 = Convert.ToHexStringLower(SHA256.HashData(packageBytes));
            var signingPayload = ModulePackageVerifier.CreateSigningPayload(manifest, publisherKeyId, packageSha256);
            var packageSignature = Convert.ToBase64String(moduleKey.SignData(signingPayload, HashAlgorithmName.SHA256, RSASignaturePadding.Pss));
            seedDb.PlatformModulePublisherKeys.Add(new PlatformModulePublisherKey
            {
                Publisher = publisher,
                KeyId = publisherKeyId,
                PublicKeyPem = moduleKey.ExportSubjectPublicKeyInfoPem(),
                CreatedByUserId = UserId
            });
            seedDb.PlatformModuleReleases.Add(new PlatformModuleRelease
            {
                ModuleCode = moduleCode,
                Version = moduleVersion,
                Publisher = publisher,
                ManifestJson = JsonSerializer.Serialize(manifest, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
                ArtifactSha256 = packageSha256,
                SignatureBase64 = packageSignature,
                KeyId = publisherKeyId,
                StorageKey = $"{packageSha256}.zip",
                RuntimeKind = "wasm-core-no-imports",
                RuntimeValidatedAt = DateTimeOffset.UtcNow,
                Status = "Published",
                CreatedByUserId = UserId,
                PublishedByUserId = UserId,
                PublishedAt = DateTimeOffset.UtcNow
            });
            var packagePath = ModulePackageStoragePath.ResolvePackage(packageRoot, packageSha256);
            Directory.CreateDirectory(Path.GetDirectoryName(packagePath)!);
            await File.WriteAllBytesAsync(packagePath, packageBytes);
            await seedDb.SaveChangesAsync();
            var rowVersion = Convert.ToBase64String((await seedDb.TenantLicenses.SingleAsync(x => x.TenantId == TenantId)).RowVersion);

            var licensePublicKeyPem = rsa.ExportSubjectPublicKeyInfoPem();
            using var startupConfiguration = ProcessEnvironmentOverride.Push(new Dictionary<string, string?>
            {
                ["Authentication__SigningKey"] = "synthetic-license-race-auth-signing-key-32-bytes",
                ["Authentication__Issuer"] = "AIERP",
                ["Authentication__Audience"] = "AIERP",
                ["PluginHost__SigningKey"] = "synthetic-license-race-plugin-signing-key-32-bytes",
                ["PluginHost__BaseUrl"] = "http://plugin-host",
                ["Licensing__PublicKeys__test-key"] = licensePublicKeyPem,
                ["ConnectionStrings__Platform"] = connectionString,
                ["ConnectionStrings__Tenant"] = connectionString,
                ["ConnectionStrings__AIStudio"] = connectionString,
                ["Database__SeparationEnabled"] = "true",
                ["Database__ApplyMigrationsOnStartup"] = "false",
                ["ModulePackages__RootPath"] = packageRoot
            });
            factory = new LicenseRaceApiFactory(connectionString, packageRoot, licensePublicKeyPem,
                new LicenseRaceTenantCredentialReader(TenantId));
            using var client = factory.CreateClient();

            // Hold the same SQL application lock used by both production routes. Start both
            // real HTTP requests and release the gate as soon as SQL confirms at least one is
            // queued. The production lock has a bounded 10-second wait, so the other request
            // may correctly return tenant.concurrent_write and must then be retried.
            gateConnection = new SqlConnection(connectionString);
            await gateConnection.OpenAsync();
            gateTransaction = (SqlTransaction)await gateConnection.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var blockerSessionId = await ExecuteScalarAsync<int>(gateConnection, gateTransaction, "SELECT @@SPID;");
            var gateResult = await AcquireQuotaGateAsync(gateConnection, gateTransaction, TenantId);
            Assert.True(gateResult >= 0, $"Test could not acquire tenant quota gate (sp_getapplock={gateResult}).");

            requestTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
            // Check DMV access before requests are parked behind the gate, so a missing
            // server-state permission skips cleanly without leaving HTTP requests in flight.
            await WaitForQuotaLockWaitersAsync(connectionString, blockerSessionId, expectedWaiters: 0, requestTimeout.Token);
            var signedGrant = SignGrant(rsa, TenantId, "Small");
            moduleActivationTask = client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode, version = moduleVersion }, requestTimeout.Token);
            downgradeTask = client.PostAsJsonAsync("/api/tenant-license/activate", new
            {
                signedGrant, rowVersion
            }, requestTimeout.Token);
            await WaitForQuotaLockWaitersAsync(connectionString, blockerSessionId, expectedWaiters: 1, requestTimeout.Token);
            await gateTransaction.CommitAsync(requestTimeout.Token);
            await gateTransaction.DisposeAsync();
            gateTransaction = null;

            var activationResponse = await moduleActivationTask;
            var downgradeResponse = await downgradeTask;
            activationResponse = await RetryTenantQuotaLockConflictAsync(activationResponse,
                () => client.PostAsJsonAsync("/api/tenant/modules/activate", new { moduleCode, version = moduleVersion }, requestTimeout.Token));
            downgradeResponse = await RetryTenantQuotaLockConflictAsync(downgradeResponse,
                () => client.PostAsJsonAsync("/api/tenant-license/activate", new { signedGrant, rowVersion }, requestTimeout.Token));
            using (activationResponse)
            using (downgradeResponse)
            {
                Assert.Contains(activationResponse.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
                Assert.Contains(downgradeResponse.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });

                await using var verificationDb = new PlatformDbContext(options);
                var finalLicense = await verificationDb.TenantLicenses.SingleAsync(x => x.TenantId == TenantId);
                var finalModuleCount = await verificationDb.TenantModuleActivations.CountAsync(x => x.TenantId == TenantId);
                Assert.True(finalModuleCount <= LicenseTierCatalog.All[finalLicense.Tier].MaxCustomModules);
                if (activationResponse.StatusCode == HttpStatusCode.OK)
                {
                    Assert.Equal(HttpStatusCode.Conflict, downgradeResponse.StatusCode);
                    Assert.Equal("license.module_limit", await ReadSyntheticErrorCodeAsync(downgradeResponse));
                    Assert.Equal("Medium", finalLicense.Tier);
                    Assert.Equal(LicenseTierCatalog.All["Small"].MaxCustomModules + 1, finalModuleCount);
                    Assert.Equal(1, await verificationDb.TenantModuleActivations.CountAsync(x => x.TenantId == TenantId && x.ModuleCode == moduleCode));
                }
                else
                {
                    Assert.Equal(HttpStatusCode.OK, downgradeResponse.StatusCode);
                    Assert.Equal("Small", finalLicense.Tier);
                    Assert.Equal(LicenseTierCatalog.All["Small"].MaxCustomModules, finalModuleCount);
                    var conflict = await activationResponse.Content.ReadFromJsonAsync<JsonElement>();
                    Assert.Equal("license.module_limit", conflict.GetProperty("code").GetString());
                }
            }
        }
        finally
        {
            if (gateTransaction is not null) await gateTransaction.DisposeAsync();
            if (gateConnection is not null) await gateConnection.DisposeAsync();
            requestTimeout?.Cancel();
            if (moduleActivationTask is not null)
            {
                try { using var response = await moduleActivationTask; }
                catch { }
            }
            if (downgradeTask is not null)
            {
                try { using var response = await downgradeTask; }
                catch { }
            }
            requestTimeout?.Dispose();
            if (factory is not null) await factory.DisposeAsync();
            if (Directory.Exists(packageRoot)) Directory.Delete(packageRoot, recursive: true);
            if (databaseCreated) await seedDb.Database.EnsureDeletedAsync();
        }
    }

    [SqlServerAcceptanceFact]
    public async Task License_activation_endpoint_waits_for_a_tenant_write_holding_the_storage_quota_lock()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        using var rsa = RSA.Create(2048);
        var tenantId = Guid.NewGuid();
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = $"AIERP_LicenseStorageRace_{suffix}",
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
        await using var seedDb = new PlatformDbContext(platformOptions);
        await using var tenantSeedDb = new TenantDbContext(tenantOptions);
        var platformCreated = false;
        var tenantCreated = false;
        PlatformDbContext? quotaPlatformDb = null;
        TenantStorageQuotaInterceptor? interceptor = null;
        WebApplication? app = null;
        try
        {
            platformCreated = await seedDb.Database.EnsureCreatedAsync();
            tenantCreated = await tenantSeedDb.Database.EnsureCreatedAsync();
            Assert.True(platformCreated);
            Assert.True(tenantCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Storage license race", Slug = $"storage-license-race-{suffix}" };
            seedDb.Tenants.Add(tenant);
            seedDb.Users.Add(new AppUser
            {
                Id = UserId, Email = $"storage-license-race-{suffix}@example.invalid",
                DisplayName = "Storage license race", PasswordHash = "not-used", IsActive = true
            });
            seedDb.TenantMemberships.Add(new TenantMembership { TenantId = tenantId, UserId = UserId, Role = "TenantAdmin" });
            seedDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = $"AIERPTenant_{tenantId:N}",
                State = TenantDatabaseProvisioningState.Ready
            });
            var currentLicense = new TenantLicense
            {
                TenantId = tenantId, LicenseId = Guid.NewGuid(), Tier = "Large",
                MaxUsers = LicenseTierCatalog.All["Large"].MaxUsers,
                MaxCustomModules = LicenseTierCatalog.All["Large"].MaxCustomModules,
                MaxStorageGb = LicenseTierCatalog.All["Large"].MaxStorageGb, IssuedAt = DateTimeOffset.UtcNow.AddDays(-1),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(30), GrantSha256 = new string('A', 64)
            };
            seedDb.TenantLicenses.Add(currentLicense);
            await seedDb.SaveChangesAsync();
            tenantSeedDb.Tenants.Add(new Tenant { Id = tenantId, Name = tenant.Name, Slug = tenant.Slug });
            await tenantSeedDb.SaveChangesAsync();

            app = await StartSqlServerApplicationAsync(rsa, platformConnection, tenantConnection, tenantId);
            using var client = app.GetTestClient();
            quotaPlatformDb = new PlatformDbContext(platformOptions);
            interceptor = new TenantStorageQuotaInterceptor(quotaPlatformDb,
                new TenantStorageLimitProvider(quotaPlatformDb), NullLogger<TenantStorageQuotaInterceptor>.Instance);

            await quotaPlatformDb.Database.OpenConnectionAsync();
            await using var blockerCommand = quotaPlatformDb.Database.GetDbConnection().CreateCommand();
            blockerCommand.CommandText = "SELECT @@SPID;";
            var blockerSessionId = Convert.ToInt32(await blockerCommand.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture);
            await using (var writeDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>()
                .UseSqlServer(tenantConnection).AddInterceptors(interceptor).Options))
            await using (var tenantTransaction = await writeDb.Database.BeginTransactionAsync(IsolationLevel.Serializable))
            {
                writeDb.TenantSavedReports.Add(new TenantSavedReport
                {
                    TenantId = tenantId, Name = "license-race-write", DefinitionJson = "{}",
                    CreatedByUserId = UserId, UpdatedByUserId = UserId
                });
                await writeDb.SaveChangesAsync();

                using var requestTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
                var activationTask = client.PostAsJsonAsync("/api/tenant-license/activate", new
                {
                    signedGrant = SignGrant(rsa, tenantId, "Small"),
                    rowVersion = Convert.ToBase64String(currentLicense.RowVersion)
                }, requestTimeout.Token);
                await WaitForQuotaLockWaitersAsync(platformConnection, blockerSessionId, expectedWaiters: 1,
                    requestTimeout.Token, activationTask);
                await tenantTransaction.CommitAsync(requestTimeout.Token);
                await interceptor.DisposeAsync();
                interceptor = null;

                using var activation = await activationTask;
                Assert.Equal(HttpStatusCode.OK, activation.StatusCode);
                var result = await activation.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Equal("Small", result.GetProperty("tier").GetString());
            }

            await using var verificationDb = new PlatformDbContext(platformOptions);
            Assert.Equal("Small", (await verificationDb.TenantLicenses.SingleAsync(x => x.TenantId == tenantId)).Tier);
            await using var verificationTenantDb = new TenantDbContext(tenantOptions);
            Assert.True(await verificationTenantDb.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Name == "license-race-write"));
        }
        finally
        {
            if (app is not null) await app.DisposeAsync();
            if (interceptor is not null) await interceptor.DisposeAsync();
            if (quotaPlatformDb is not null) await quotaPlatformDb.DisposeAsync();
            if (tenantCreated) await tenantSeedDb.Database.EnsureDeletedAsync();
            if (platformCreated) await seedDb.Database.EnsureDeletedAsync();
        }
    }

    private static async Task<WebApplication> StartApplicationAsync(RSA rsa, int memberCount, int moduleCount = 0)
    {
        var databaseName = $"tenant-license-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Licensing:PublicKeys:test-key"] = rsa.ExportSubjectPublicKeyInfoPem()
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-tenant"));
        builder.Services.AddAuthentication("license-test").AddScheme<AuthenticationSchemeOptions, LicenseAuthenticationHandler>("license-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantLicenseEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = new Tenant { Id = TenantId, Name = "Test", Slug = $"test-{Guid.NewGuid():N}" };
        db.Tenants.Add(tenant);
        for (var index = 0; index < memberCount; index++)
        {
            var userId = index == 0 ? UserId : Guid.NewGuid();
            var user = new AppUser { Id = userId, Email = $"user-{index}@example.invalid", DisplayName = $"User {index}" };
            db.Users.Add(user);
            db.TenantMemberships.Add(new TenantMembership { TenantId = TenantId, UserId = userId, Tenant = tenant, User = user, Role = index == 0 ? "TenantAdmin" : "TenantUser" });
        }
        for (var index = 0; index < moduleCount; index++)
            db.TenantModuleActivations.Add(new TenantModuleActivation { TenantId = TenantId, ModuleCode = $"test.module-{index}", Version = "1.0.0", ActivatedByUserId = UserId });
        await db.SaveChangesAsync();
        return app;
    }

    private static async Task<WebApplication> StartSqlServerApplicationAsync(RSA rsa, string connectionString,
        string? tenantConnectionString = null, Guid? tenantId = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Licensing:PublicKeys:test-key"] = rsa.ExportSubjectPublicKeyInfoPem(),
            ["TestAuthentication:TenantId"] = tenantId?.ToString()
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(connectionString));
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseSqlServer(tenantConnectionString ?? connectionString));
        builder.Services.AddAuthentication("license-test").AddScheme<AuthenticationSchemeOptions, LicenseAuthenticationHandler>("license-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantLicenseEndpoints();
        app.MapAccessControlEndpoints();
        await app.StartAsync();
        return app;
    }

    private static byte[] CreateModulePackage()
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        using (var wasm = archive.CreateEntry("module.wasm").Open())
            wasm.Write(new byte[] { 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 });
        return output.ToArray();
    }

    private static async Task<int> AcquireQuotaGateAsync(SqlConnection connection, SqlTransaction transaction, Guid tenantId)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "DECLARE @lockResult int; EXEC @lockResult = sys.sp_getapplock @Resource = @resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000; SELECT @lockResult;";
        var resource = command.CreateParameter();
        resource.ParameterName = "@resource";
        resource.DbType = System.Data.DbType.String;
        resource.Size = 255;
        resource.Value = $"Nexora:TenantQuota:{tenantId:N}";
        command.Parameters.Add(resource);
        return Convert.ToInt32(await command.ExecuteScalarAsync(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static async Task<T> ExecuteScalarAsync<T>(SqlConnection connection, SqlTransaction transaction, string sql)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        var value = await command.ExecuteScalarAsync() ?? throw new InvalidOperationException("The SQL scalar query returned no value.");
        return (T)(Convert.ChangeType(value, typeof(T), System.Globalization.CultureInfo.InvariantCulture)
            ?? throw new InvalidOperationException("The SQL scalar value could not be converted."));
    }

    private static async Task WaitForQuotaLockWaitersAsync(string connectionString, int blockerSessionId,
        int expectedWaiters, CancellationToken cancellationToken, params Task<HttpResponseMessage>[] inFlightRequests)
    {
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sys.dm_exec_requests AS request WHERE request.database_id = DB_ID() AND request.blocking_session_id = @blocker AND request.wait_type LIKE N'LCK_M_%';";
        command.Parameters.Add(new SqlParameter("@blocker", System.Data.SqlDbType.Int) { Value = blockerSessionId });

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var completedRequest = inFlightRequests.FirstOrDefault(request => request.IsCompleted);
                if (completedRequest is not null)
                {
                    var completedIndex = Array.IndexOf(inFlightRequests, completedRequest);
                    var requests = await DescribeRequestsAsync(inFlightRequests);
                    var sql = await DescribeQuotaSqlStateAsync(connection, blockerSessionId, cancellationToken);
                    throw new InvalidOperationException($"HTTP request {completedIndex + 1} completed before reaching the tenant quota lock. Requests: {requests}. SQL state: {sql}");
                }

                var waiters = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), System.Globalization.CultureInfo.InvariantCulture);
                if (waiters >= expectedWaiters) return;
                await Task.Delay(TimeSpan.FromMilliseconds(50), cancellationToken);
            }
        }
        catch (SqlException exception) when (exception.Number is 297 or 300)
        {
            throw Xunit.Sdk.SkipException.ForSkip("Deterministic SQL lock rendezvous requires permission to inspect sys.dm_exec_requests (VIEW SERVER STATE or VIEW SERVER PERFORMANCE STATE).");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            var requests = await DescribeRequestsAsync(inFlightRequests);
            var sql = await DescribeQuotaSqlStateAsync(connection, blockerSessionId, CancellationToken.None);
            throw new TimeoutException($"Expected {expectedWaiters} production HTTP requests blocked by SQL session {blockerSessionId}, but the rendezvous timed out. Requests: {requests}. SQL state: {sql}");
        }
    }

    private static async Task<string> DescribeRequestsAsync(IReadOnlyList<Task<HttpResponseMessage>> requests)
    {
        var descriptions = new List<string>(requests.Count);
        for (var index = 0; index < requests.Count; index++)
        {
            var request = requests[index];
            if (!request.IsCompleted)
            {
                descriptions.Add($"request {index + 1}: pending");
                continue;
            }

            try
            {
                using var response = await request;
                var code = await ReadSyntheticErrorCodeAsync(response);
                descriptions.Add($"request {index + 1}: HTTP {(int)response.StatusCode} ({response.StatusCode}){(code is null ? string.Empty : $", code={code}")}");
            }
            catch (Exception exception)
            {
                descriptions.Add($"request {index + 1}: {exception.GetType().Name}");
            }
        }

        return string.Join("; ", descriptions);
    }

    private static async Task<string?> ReadSyntheticErrorCodeAsync(HttpResponseMessage response)
    {
        try
        {
            if (response.Content.Headers.ContentLength is > 1024) return null;
            var body = await response.Content.ReadAsStringAsync();
            if (body.Length > 1024) return null;
            using var json = JsonDocument.Parse(body);
            return json.RootElement.ValueKind == JsonValueKind.Object
                && json.RootElement.TryGetProperty("code", out var code)
                && code.ValueKind == JsonValueKind.String
                    ? code.GetString()
                    : null;
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or IOException)
        {
            return null;
        }
    }

    private static async Task<HttpResponseMessage> RetryTenantQuotaLockConflictAsync(HttpResponseMessage response,
        Func<Task<HttpResponseMessage>> retry)
    {
        if (await ReadSyntheticErrorCodeAsync(response) != "tenant.concurrent_write") return response;
        response.Dispose();
        return await retry();
    }

    private static async Task<string> DescribeQuotaSqlStateAsync(SqlConnection connection, int blockerSessionId,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandTimeout = 3;
            command.CommandText = """
                SELECT request.session_id, request.wait_type, request.blocking_session_id, request.command,
                       LEFT(REPLACE(REPLACE(COALESCE(sql_text.text, N''), CHAR(13), N' '), CHAR(10), N' '), 180) AS sql_text
                FROM sys.dm_exec_requests AS request
                OUTER APPLY sys.dm_exec_sql_text(request.sql_handle) AS sql_text
                WHERE request.database_id = DB_ID()
                  AND (request.blocking_session_id = @blocker OR request.session_id <> @@SPID)
                ORDER BY request.session_id;

                SELECT request_session_id, request_mode, request_status, resource_description
                FROM sys.dm_tran_locks
                WHERE resource_type = N'APPLICATION'
                  AND resource_description LIKE N'%Nexora:TenantQuota:%'
                ORDER BY request_session_id;
                """;
            command.Parameters.Add(new SqlParameter("@blocker", System.Data.SqlDbType.Int) { Value = blockerSessionId });
            var rows = new List<string>();
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                rows.Add($"request sid={reader.GetInt16(0)}, wait={ValueOrNull(reader, 1)}, blocker={ValueOrNull(reader, 2)}, command={ValueOrNull(reader, 3)}, sql={ValueOrNull(reader, 4)}");
            if (await reader.NextResultAsync(cancellationToken))
            {
                while (await reader.ReadAsync(cancellationToken))
                    rows.Add($"app-lock sid={ValueOrNull(reader, 0)}, mode={ValueOrNull(reader, 1)}, status={ValueOrNull(reader, 2)}, resource={ValueOrNull(reader, 3)}");
            }
            return rows.Count == 0 ? "no matching requests or application locks" : string.Join(" | ", rows);
        }
        catch (Exception exception) when (exception is SqlException or OperationCanceledException)
        {
            return $"SQL diagnostics unavailable ({exception.GetType().Name})";
        }
    }

    private static string ValueOrNull(SqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? "null" : Convert.ToString(reader.GetValue(ordinal), System.Globalization.CultureInfo.InvariantCulture) ?? "null";

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

    private sealed class LicenseRaceApiFactory(string connectionString, string packageRoot, string licensePublicKeyPem,
        ITenantSqlCredentialReader credentialReader) : WebApplicationFactory<ApiEntryPointMarker>
    {
        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "license-race-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "license-race-test-secret"
            }));
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-license-race-auth-signing-key-32-bytes",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["Licensing:PublicKeys:test-key"] = licensePublicKeyPem,
                ["PluginHost:SigningKey"] = "synthetic-license-race-plugin-signing-key-32-bytes",
                ["PluginHost:BaseUrl"] = "http://plugin-host",
                ["ConnectionStrings:Platform"] = connectionString,
                ["ConnectionStrings:Tenant"] = connectionString,
                ["ConnectionStrings:AIStudio"] = connectionString,
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["ModulePackages:RootPath"] = packageRoot
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton(credentialReader);
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = "license-race-test";
                    options.DefaultChallengeScheme = "license-race-test";
                    options.DefaultForbidScheme = "license-race-test";
                }).AddScheme<AuthenticationSchemeOptions, LicenseAuthenticationHandler>("license-race-test", _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder("license-race-test").RequireAuthenticatedUser().Build());
                services.AddHttpClient("plugin-host").ConfigurePrimaryHttpMessageHandler(() => new ModuleValidationHandler());
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }
    }

    private sealed class LicenseRaceTenantCredentialReader(Guid tenantId) : ITenantSqlCredentialReader
    {
        public Task<TenantSqlCredential> ReadAsync(Guid requestedTenantId, TenantSqlDatabaseComponent component,
            string secretReference, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (requestedTenantId != tenantId || component != TenantSqlDatabaseComponent.Erp
                || !string.Equals(secretReference, TenantSqlCredentialPath.ForTenant(tenantId, component), StringComparison.Ordinal))
                throw new InvalidOperationException("The license race test credential is scoped to one ERP tenant.");
            return Task.FromResult(new TenantSqlCredential(TenantSqlCredentialPath.DatabaseName(tenantId, component),
                $"aierp_t_{tenantId:N}", "synthetic-license-race-password", 1));
        }
    }

    private sealed class ModuleValidationHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(request.Method == HttpMethod.Post && request.RequestUri?.AbsolutePath == "/internal/modules/validate"
                ? HttpStatusCode.OK : HttpStatusCode.NotFound));
    }

    private static string SignGrant(RSA rsa, Guid tenantId, string tier)
    {
        var issuedAt = DateTimeOffset.UtcNow;
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            schemaVersion = 1,
            licenseId = Guid.NewGuid(),
            tenantId,
            tier,
            issuedAt,
            expiresAt = issuedAt.AddDays(30)
        });
        var encodedPayload = Base64Url(payload);
        var signingInput = $"test-key.{encodedPayload}";
        var signature = rsa.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return $"{signingInput}.{Base64Url(signature)}";
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed class LicenseAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IConfiguration configuration)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new[]
            {
                new Claim("sub", UserId.ToString()),
                new Claim("tenant_id", Guid.TryParse(configuration["TestAuthentication:TenantId"], out var tenantId)
                    ? tenantId.ToString() : TenantId.ToString()),
                new Claim("role", "TenantAdmin")
            };
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
        }
    }
}
