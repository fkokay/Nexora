using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using System.Collections.Concurrent;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace AIERP.Api.IntegrationTests;

[Collection("Tenant SQL/Vault acceptance")]
public sealed class TenantSqlVaultIsolationAcceptanceTests
{
    private readonly WorkerAcceptanceLogger _workerLogger = new();

    [TenantSqlVaultAcceptanceFact]
    public async Task API_queues_two_tenants_Worker_completes_jobs_and_SQL_Vault_enforce_isolation()
    {
        var rootConnection = Required("AIERP_TENANT_ISOLATION_ACCEPTANCE_SQL_CONNECTION_STRING");
        var server = new SqlConnectionStringBuilder(rootConnection);
        if (!string.Equals(server.InitialCatalog, "master", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The disposable acceptance SQL connection must target master.");

        var platformDatabase = $"AIERPPlatform_TenantAccept_{Guid.NewGuid():N}";
        var platformConnection = new SqlConnectionStringBuilder(rootConnection) { InitialCatalog = platformDatabase }.ConnectionString;
        var provisioningWorkerLogin = $"NexoraVaultAcceptWorker_{Guid.NewGuid():N}";
        var provisioningWorkerPassword = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)) + "aA1!";
        var masterKeyCreated = false;
        var tenantIds = new Guid[2];
        var tenantDatabases = new string[2];
        var tenantLogins = new string[2];
        var studioDatabases = new string[2];
        var studioLogins = new string[2];
        var vaultAddress = new Uri(Required("AIERP_TENANT_ISOLATION_ACCEPTANCE_VAULT_ADDRESS"));
        var mount = Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_VAULT_MOUNT") ?? "secret";
        var allowHttp = string.Equals(Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_VAULT_ALLOW_HTTP_LOCAL"),
            "true", StringComparison.OrdinalIgnoreCase);
        var handler = new SocketsHttpHandler { AllowAutoRedirect = false };
        using var http = new HttpClient(handler);
        var (readerRoleId, readerSecretId, writerRoleId, writerSecretId) =
            await ConfigureDisposableVaultAppRolesAsync(http, vaultAddress);
        var reader = new VaultTenantSqlCredentialReader(http, Options.Create(new VaultTenantSqlCredentialReadOptions
        {
            Address = vaultAddress,
            Mount = mount,
            RoleId = readerRoleId,
            SecretId = readerSecretId,
            AllowHttpForLocalDevelopment = allowHttp
        }));
        var writer = new VaultTenantSqlCredentialWriter(http, Options.Create(new VaultTenantSqlCredentialWriteOptions
        {
            Address = vaultAddress,
            Mount = mount,
            RoleId = writerRoleId,
            SecretId = writerSecretId,
            AllowHttpForLocalDevelopment = allowHttp
        }));

        try
        {
            await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
                .UseSqlServer(platformConnection).Options))
            {
                await platform.Database.MigrateAsync();
                platform.Users.Add(new AppUser
                {
                    Id = Guid.NewGuid(),
                    Email = $"tenant-acceptance-{Guid.NewGuid():N}@example.invalid",
                    DisplayName = "Disposable tenant acceptance admin",
                    PasswordHash = "not-used-by-test",
                    IsActive = true
                });
                await platform.SaveChangesAsync();
            }

            masterKeyCreated = await InstallProvisioningBoundaryAsync(rootConnection, platformDatabase,
                provisioningWorkerLogin, provisioningWorkerPassword);

            var adminId = await GetAcceptanceAdminIdAsync(platformConnection);
            await using var api = await StartProvisioningApiAsync(platformConnection, adminId);
            using var apiClient = api.GetTestClient();
            var createdJobs = new List<TenantProvisioningEndpoints.ProvisioningStatusResponse>();
            for (var index = 0; index < tenantIds.Length; index++)
            {
                var idempotencyKey = $"tenant-acceptance-{Guid.NewGuid():N}";
                apiClient.DefaultRequestHeaders.Remove("Idempotency-Key");
                apiClient.DefaultRequestHeaders.Add("Idempotency-Key", idempotencyKey);
                var request = new TenantProvisioningEndpoints.CreateTenantProvisioningRequest(
                    $"Tenant isolation acceptance {index + 1}", $"tenant-isolation-{Guid.NewGuid():N}", "TRY",
                    await GetAcceptanceAdminEmailAsync(platformConnection), "Disposable tenant acceptance admin");
                using var accepted = await apiClient.PostAsJsonAsync("/api/platform/tenants/", request);
                Assert.Equal(System.Net.HttpStatusCode.Accepted, accepted.StatusCode);
                var job = await accepted.Content.ReadFromJsonAsync<TenantProvisioningEndpoints.ProvisioningStatusResponse>()
                    ?? throw new InvalidOperationException("Tenant provisioning API returned no job status.");
                Assert.Equal(TenantProvisioningJobStatus.Queued, job.Status);
                Assert.Equal(TenantDatabaseProvisioningState.Provisioning, job.ProvisioningState);
                createdJobs.Add(job);
                tenantIds[index] = job.TenantId;
                tenantDatabases[index] = TenantSqlCredentialPath.DatabaseName(job.TenantId, TenantSqlDatabaseComponent.Erp);
                tenantLogins[index] = $"aierp_t_{job.TenantId:N}";
                studioDatabases[index] = TenantSqlCredentialPath.DatabaseName(job.TenantId, TenantSqlDatabaseComponent.AiStudio);
                studioLogins[index] = $"aierp_s_{job.TenantId:N}";

                using var repeated = await apiClient.PostAsJsonAsync("/api/platform/tenants/", request);
                Assert.Equal(System.Net.HttpStatusCode.Accepted, repeated.StatusCode);
                var replay = await repeated.Content.ReadFromJsonAsync<TenantProvisioningEndpoints.ProvisioningStatusResponse>();
                Assert.Equal(job.JobId, replay?.JobId);
            }

            // Simulate a worker that crashed after claiming this queued job. Its lease
            // is already expired, so the real worker must reclaim and increment attempt 1.
            var reclaimedLeaseJobId = createdJobs[1].JobId;
            await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
                .UseSqlServer(platformConnection).Options))
            {
                var staleLease = await platform.TenantProvisioningJobs.SingleAsync(x => x.Id == reclaimedLeaseJobId);
                staleLease.Status = TenantProvisioningJobStatus.Running;
                staleLease.AttemptCount = 1;
                staleLease.LeaseOwner = "acceptance-worker-that-crashed";
                staleLease.LeaseExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
                staleLease.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(-2);
                staleLease.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
                await platform.SaveChangesAsync();
            }

            var workerConfiguration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Provisioning"] = platformConnection
            }).Build();
        var retryWriter = new FailOnceTenantSqlCredentialWriter(writer);
        var worker = new TenantProvisioningWorker(workerConfiguration, reader, retryWriter,
                _workerLogger);
            try
            {
                await worker.StartAsync(CancellationToken.None);
                await WaitForJobsToCompleteAsync(platformConnection, createdJobs.Select(x => x.JobId).ToArray(),
                    TimeSpan.FromMinutes(12), () => _workerLogger.Entries);
            }
            finally
            {
                using var workerStopTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                await worker.StopAsync(workerStopTimeout.Token);
                worker.Dispose();
            }

            foreach (var job in createdJobs)
            {
                using var statusResponse = await apiClient.GetAsync(job.StatusUrl);
                Assert.Equal(System.Net.HttpStatusCode.OK, statusResponse.StatusCode);
                var status = await statusResponse.Content.ReadFromJsonAsync<TenantProvisioningEndpoints.ProvisioningStatusResponse>();
                Assert.Equal(TenantProvisioningJobStatus.Completed, status?.Status);
                Assert.Equal(TenantDatabaseProvisioningState.Ready, status?.ProvisioningState);
                var expectedAttempts = 1
                    + (job.TenantId == retryWriter.FailedTenantId ? 1 : 0)
                    + (job.JobId == reclaimedLeaseJobId ? 1 : 0);
                Assert.Equal(expectedAttempts, status?.AttemptCount);
            }

            // Exercise the real company-selection token issuer and the API's signed
            // bearer validation + TenantDatabaseRouting middleware against SQL/Vault.
            var signingKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48));
            await using (var selectionApi = await StartTenantSelectionApiAsync(platformConnection, adminId, signingKey))
            await using (var routingApi = await StartSignedTenantRoutingApiAsync(platformConnection, rootConnection,
                reader, signingKey))
            {
                using var selectionClient = selectionApi.GetTestClient();
                using var routingClient = routingApi.GetTestClient();
                foreach (var job in createdJobs)
                {
                    using var selectionResponse = await selectionClient.PostAsJsonAsync("/api/auth/select-tenant",
                        new { tenantId = job.TenantId });
                    Assert.Equal(System.Net.HttpStatusCode.OK, selectionResponse.StatusCode);
                    using var selectionJson = await JsonDocument.ParseAsync(await selectionResponse.Content.ReadAsStreamAsync());
                    var token = selectionJson.RootElement.GetProperty("accessToken").GetString()
                        ?? throw new InvalidOperationException("Tenant selection returned no access token.");

                    using var routedRequest = new HttpRequestMessage(HttpMethod.Get, "/api/tenant/sentinel");
                    routedRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                    using var routedResponse = await routingClient.SendAsync(routedRequest);
                    Assert.Equal(System.Net.HttpStatusCode.OK, routedResponse.StatusCode);
                    Assert.Equal(job.TenantId, await routedResponse.Content.ReadFromJsonAsync<Guid>());

                    var tokenParts = token.Split('.');
                    Assert.Equal(3, tokenParts.Length);
                    var signature = tokenParts[2];
                    tokenParts[2] = (signature[0] == 'A' ? 'B' : 'A') + signature[1..];
                    using var tamperedRequest = new HttpRequestMessage(HttpMethod.Get, "/api/tenant/sentinel");
                    tamperedRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
                        "Bearer", string.Join('.', tokenParts));
                    using var tamperedResponse = await routingClient.SendAsync(tamperedRequest);
                    Assert.Equal(System.Net.HttpStatusCode.Unauthorized, tamperedResponse.StatusCode);
                }
            }

            foreach (var (tenantId, ownDatabase) in tenantIds.Zip(tenantDatabases))
            {
                var credential = await reader.ReadAsync(tenantId, TenantSqlDatabaseComponent.Erp,
                    TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.Erp));
                Assert.Equal(ownDatabase, credential.DatabaseName);
                var ownConnection = new SqlConnectionStringBuilder(platformConnection)
                {
                    InitialCatalog = ownDatabase,
                    UserID = credential.UserName,
                    Password = credential.Password,
                    IntegratedSecurity = false,
                    PersistSecurityInfo = false
                }.ConnectionString;
                await using (var connection = new SqlConnection(ownConnection))
                {
                    await connection.OpenAsync();
                    await using var command = connection.CreateCommand();
                    command.CommandText = "SELECT [Id] FROM [dbo].[Tenants] WHERE [Id] = @tenantId;";
                    command.Parameters.AddWithValue("@tenantId", tenantId);
                    Assert.Equal(tenantId, await command.ExecuteScalarAsync());
                }

                var otherDatabase = tenantDatabases.Single(database => !string.Equals(database, ownDatabase, StringComparison.Ordinal));
                await AssertDatabaseDeniedAsync(platformConnection, credential, otherDatabase);
                await AssertDatabaseDeniedAsync(platformConnection, credential, platformDatabase);
            }

            foreach (var (tenantId, ownDatabase) in tenantIds.Zip(studioDatabases))
            {
                var credential = await reader.ReadAsync(tenantId, TenantSqlDatabaseComponent.AiStudio,
                    TenantSqlCredentialPath.ForTenant(tenantId, TenantSqlDatabaseComponent.AiStudio));
                Assert.Equal(ownDatabase, credential.DatabaseName);
                var ownConnection = new SqlConnectionStringBuilder(platformConnection)
                {
                    InitialCatalog = ownDatabase,
                    UserID = credential.UserName,
                    Password = credential.Password,
                    IntegratedSecurity = false,
                    PersistSecurityInfo = false
                }.ConnectionString;
                await using (var connection = new SqlConnection(ownConnection))
                {
                    await connection.OpenAsync();
                    await using var command = connection.CreateCommand();
                    command.CommandText = "SELECT [Id] FROM [dbo].[Tenants] WHERE [Id] = @tenantId;";
                    command.Parameters.AddWithValue("@tenantId", tenantId);
                    Assert.Equal(tenantId, await command.ExecuteScalarAsync());
                }

                var otherDatabase = studioDatabases.Single(database => !string.Equals(database, ownDatabase, StringComparison.Ordinal));
                await AssertDatabaseDeniedAsync(platformConnection, credential, otherDatabase);
                await AssertDatabaseDeniedAsync(platformConnection, credential, platformDatabase);
            }

            await using var verifyPlatform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
                .UseSqlServer(platformConnection).Options);
            foreach (var tenantId in tenantIds)
            {
                var catalog = await verifyPlatform.TenantDatabaseCatalog.SingleAsync(x => x.TenantId == tenantId);
                Assert.Equal(TenantDatabaseProvisioningState.Ready, catalog.State);
                Assert.NotNull(catalog.ReadyAt);
                var studioCatalog = await verifyPlatform.DatabaseSeparationComponentStates
                    .SingleAsync(x => x.Component == TenantDatabaseRouting.StudioComponentKey(tenantId));
                Assert.Equal(studioDatabases[Array.IndexOf(tenantIds, tenantId)], studioCatalog.DatabaseName);
                Assert.Equal(TenantDatabaseProvisioningState.Ready, studioCatalog.State);
                Assert.NotNull(studioCatalog.ReadyAt);
                Assert.True(await verifyPlatform.Tenants.Where(x => x.Id == tenantId).Select(x => x.IsActive).SingleAsync());
            }

            var credentialsBeforeCutover = new Dictionary<(Guid TenantId, TenantSqlDatabaseComponent Component), string>();
            foreach (var tenantId in tenantIds)
            foreach (var component in new[] { TenantSqlDatabaseComponent.Erp, TenantSqlDatabaseComponent.AiStudio })
            {
                var credential = await reader.ReadAsync(tenantId, component, TenantSqlCredentialPath.ForTenant(tenantId, component));
                credentialsBeforeCutover[(tenantId, component)] = credential.Password;
            }

            // Exercise the explicit maintenance operation against already active tenants:
            // it rotates both isolated SQL principals, publishes to Vault, reads back, and
            // verifies own-DB access plus cross-tenant/Platform denial without changing data.
            var cutover = new TenantDatabaseProvisioner(platformConnection, credentialWriter: writer, credentialReader: reader);
            await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
                .UseSqlServer(platformConnection).Options))
            {
                var incompleteStudio = await platform.DatabaseSeparationComponentStates
                    .SingleAsync(x => x.Component == TenantDatabaseRouting.StudioComponentKey(tenantIds[0]));
                incompleteStudio.State = TenantDatabaseProvisioningState.Failed;
                await platform.SaveChangesAsync();
            }
            await Assert.ThrowsAsync<InvalidOperationException>(() => cutover.MigrateExistingReadyTenantCredentialsAsync());
            foreach (var pair in credentialsBeforeCutover)
            {
                var credential = await reader.ReadAsync(pair.Key.TenantId, pair.Key.Component,
                    TenantSqlCredentialPath.ForTenant(pair.Key.TenantId, pair.Key.Component));
                Assert.Equal(pair.Value, credential.Password);
            }
            await using (var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
                .UseSqlServer(platformConnection).Options))
            {
                var incompleteStudio = await platform.DatabaseSeparationComponentStates
                    .SingleAsync(x => x.Component == TenantDatabaseRouting.StudioComponentKey(tenantIds[0]));
                incompleteStudio.State = TenantDatabaseProvisioningState.Ready;
                await platform.SaveChangesAsync();
            }

            var cutoverResult = await cutover.MigrateExistingReadyTenantCredentialsAsync();
            Assert.Equal(tenantIds.Length, cutoverResult.ErpDatabaseCount);
            Assert.Equal(tenantIds.Length, cutoverResult.AiStudioDatabaseCount);
            foreach (var tenantId in tenantIds)
            foreach (var component in new[] { TenantSqlDatabaseComponent.Erp, TenantSqlDatabaseComponent.AiStudio })
            {
                var credential = await reader.ReadAsync(tenantId, component, TenantSqlCredentialPath.ForTenant(tenantId, component));
                Assert.NotEqual(credentialsBeforeCutover[(tenantId, component)], credential.Password);
                var connectionString = TenantDatabaseRouting.BuildComponentConnectionString(platformConnection, tenantId, component, credential);
                await using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();
                await AssertDatabaseDeniedAsync(platformConnection, credential,
                    component == TenantSqlDatabaseComponent.Erp
                        ? tenantDatabases.Single(database => database != credential.DatabaseName)
                        : studioDatabases.Single(database => database != credential.DatabaseName));
                await AssertDatabaseDeniedAsync(platformConnection, credential, platformDatabase);
            }
        }
        finally
        {
            await DropAcceptanceDatabasesAsync(rootConnection, platformDatabase,
                tenantDatabases.Concat(studioDatabases).ToArray(), tenantLogins.Concat(studioLogins).Append(provisioningWorkerLogin).ToArray(),
                masterKeyCreated);
        }
    }

    private static async Task<WebApplication> StartTenantSelectionApiAsync(string platformConnection, Guid adminId,
        string signingKey)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        builder.Configuration["Authentication:SigningKey"] = signingKey;
        builder.Configuration["Authentication:Issuer"] = "AIERP.TenantSqlVaultAcceptance";
        builder.Configuration["Authentication:Audience"] = "AIERP.TenantSqlVaultAcceptance";
        builder.Configuration["TenantAcceptance:AdminId"] = adminId.ToString("D");
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(platformConnection));
        builder.Services.AddAuthentication("tenant-selection-acceptance")
            .AddScheme<AuthenticationSchemeOptions, TenantProvisioningAcceptanceAuthenticationHandler>(
                "tenant-selection-acceptance", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGroup("/api/auth").MapSelectTenantEndpoint();
        await app.StartAsync();
        return app;
    }

    private static async Task<WebApplication> StartSignedTenantRoutingApiAsync(string platformConnection,
        string tenantRuntimeConnection, ITenantSqlCredentialReader credentialReader, string signingKey)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        builder.Configuration["Authentication:SigningKey"] = signingKey;
        builder.Configuration["Authentication:Issuer"] = "AIERP.TenantSqlVaultAcceptance";
        builder.Configuration["Authentication:Audience"] = "AIERP.TenantSqlVaultAcceptance";
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(platformConnection));
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddSingleton(credentialReader);
        builder.Services.AddDbContext<TenantDbContext>((services, options) =>
        {
            var http = services.GetRequiredService<IHttpContextAccessor>().HttpContext;
            options.UseSqlServer(TenantDatabaseRouting.Resolve(http));
        });
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = "AIERP.TenantSqlVaultAcceptance",
                ValidateAudience = true,
                ValidAudience = "AIERP.TenantSqlVaultAcceptance",
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                NameClaimType = "name",
                RoleClaimType = "role"
            };
        });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.Use(async (context, next) =>
        {
            await TenantDatabaseRouting.ResolveRequestAsync(context, app.Services, tenantRuntimeConnection);
            if (context.Items.ContainsKey(TenantDatabaseRouting.TenantSelectionRequiredKey))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            if (context.Items.ContainsKey("AIERP.TenantDatabaseUnavailable"))
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                return;
            }
            await next();
        });
        app.UseAuthorization();
        app.MapGet("/api/tenant/sentinel", async (TenantDbContext tenant) =>
            await tenant.Tenants.AsNoTracking().Select(x => x.Id).SingleAsync()).RequireAuthorization();
        await app.StartAsync();
        return app;
    }

    private static async Task<Guid> GetAcceptanceAdminIdAsync(string platformConnection)
    {
        await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
            .UseSqlServer(platformConnection).Options);
        return await platform.Users.Select(x => x.Id).SingleAsync();
    }

    private static async Task<string> GetAcceptanceAdminEmailAsync(string platformConnection)
    {
        await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
            .UseSqlServer(platformConnection).Options);
        return await platform.Users.Select(x => x.Email).SingleAsync();
    }

    private static async Task<WebApplication> StartProvisioningApiAsync(string platformConnection, Guid adminId)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseTestServer();
        builder.Configuration["TenantAcceptance:AdminId"] = adminId.ToString("D");
        builder.Logging.ClearProviders();
        builder.Logging.SetMinimumLevel(LogLevel.Warning);
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(platformConnection));
        builder.Services.AddAuthentication("tenant-acceptance")
            .AddScheme<AuthenticationSchemeOptions, TenantProvisioningAcceptanceAuthenticationHandler>("tenant-acceptance", _ => { });
        builder.Services.AddAuthorization(options => options.AddPolicy("PlatformSuperAdmin", policy =>
            policy.RequireAuthenticatedUser().RequireClaim("platform_role", "PlatformSuperAdmin")));
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapTenantProvisioningEndpoints();
        await app.StartAsync();
        return app;
    }

    private static async Task WaitForJobsToCompleteAsync(string platformConnection, IReadOnlyCollection<Guid> jobIds,
        TimeSpan timeout, Func<IReadOnlyCollection<string>> getWorkerLogEntries)
    {
        using var deadline = new CancellationTokenSource(timeout);
        while (true)
        {
            deadline.Token.ThrowIfCancellationRequested();
            await using var platform = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
                .UseSqlServer(platformConnection).Options);
            var jobs = await platform.TenantProvisioningJobs.AsNoTracking().Where(x => jobIds.Contains(x.Id))
                .Select(x => new { x.Id, x.TenantId, x.Status, x.ErrorCode, x.AttemptCount }).ToListAsync(deadline.Token);
            if (jobs.Count == jobIds.Count && jobs.All(x => x.Status == TenantProvisioningJobStatus.Completed)) return;
            var failed = jobs.FirstOrDefault(x => x.Status == TenantProvisioningJobStatus.Failed);
            if (failed is not null)
            {
                var catalog = await platform.TenantDatabaseCatalog.AsNoTracking()
                    .Where(x => x.TenantId == failed.TenantId)
                    .Select(x => new { x.State, x.LastError }).SingleOrDefaultAsync(deadline.Token);
                var safeWorkerDiagnostics = string.Join(" | ", getWorkerLogEntries().TakeLast(12));
                throw new InvalidOperationException(
                    $"Tenant provisioning job {failed.Id} failed with safe code '{failed.ErrorCode}' after {failed.AttemptCount} attempts. " +
                    $"Catalog state: {catalog?.State}; safe catalog diagnostic: {catalog?.LastError ?? "none"}; " +
                    $"worker diagnostics: {safeWorkerDiagnostics}");
            }
            await Task.Delay(TimeSpan.FromSeconds(2), deadline.Token);
        }
    }

    private sealed class WorkerAcceptanceLogger : ILogger<TenantProvisioningWorker>
    {
        private readonly ConcurrentQueue<string> _entries = new();
        public IReadOnlyCollection<string> Entries => _entries.ToArray();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel)) _entries.Enqueue(formatter(state, exception));
        }
    }

    private static async Task AssertDatabaseDeniedAsync(string platformConnection, TenantSqlCredential credential, string database)
    {
        var connectionString = new SqlConnectionStringBuilder(platformConnection)
        {
            InitialCatalog = database,
            UserID = credential.UserName,
            Password = credential.Password,
            IntegratedSecurity = false,
            PersistSecurityInfo = false
        }.ConnectionString;
        try
        {
            await using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT TOP (1) [Id] FROM [dbo].[Tenants];";
            _ = await command.ExecuteScalarAsync();
            Assert.Fail($"Tenant SQL principal unexpectedly read database '{database}'.");
        }
        catch (SqlException exception) when (exception.Number is 229 or 916 or 4060) { }
    }

    private sealed class FailOnceTenantSqlCredentialWriter(ITenantSqlCredentialWriter inner) : ITenantSqlCredentialWriter
    {
        private int _shouldFail = 1;

        public Guid? FailedTenantId { get; private set; }

        public Task WriteAsync(Guid tenantId, TenantSqlDatabaseComponent component, TenantSqlCredential credential,
            CancellationToken cancellationToken = default)
        {
            if (Interlocked.Exchange(ref _shouldFail, 0) == 1)
            {
                FailedTenantId = tenantId;
                throw new HttpRequestException("Simulated transient Vault write failure in the disposable acceptance.");
            }
            return inner.WriteAsync(tenantId, component, credential, cancellationToken);
        }
    }

    private static async Task<bool> InstallProvisioningBoundaryAsync(string rootConnection, string platformDatabase,
        string workerLogin, string workerPassword)
    {
        await using var master = new SqlConnection(new SqlConnectionStringBuilder(rootConnection) { InitialCatalog = "master" }.ConnectionString);
        await master.OpenAsync();
        var masterKeyCreated = await ScalarAsync<int>(master,
            "SELECT CASE WHEN EXISTS(SELECT 1 FROM sys.symmetric_keys WHERE name=N'##MS_DatabaseMasterKey##') THEN 0 ELSE 1 END;") == 1;
        if (masterKeyCreated)
            await ExecuteAsync(master,
                "DECLARE @sql nvarchar(max)=N'CREATE MASTER KEY ENCRYPTION BY PASSWORD=N''' + REPLACE(@password,N'''',N'''''') + N''';'; EXEC sys.sp_executesql @sql;",
                ("@password", workerPassword));
        await ExecuteAsync(master,
            "DECLARE @sql nvarchar(max)=N'CREATE LOGIN '+QUOTENAME(@login)+N' WITH PASSWORD=N'''+REPLACE(@password,N'''',N'''''')+N''', CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;'; EXEC sys.sp_executesql @sql;",
            ("@login", workerLogin), ("@password", workerPassword));

        var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Install-TenantProvisioningBoundary.sql"));
        script = System.Text.RegularExpressions.Regex.Replace(script, "(?m)^\\s*:ON ERROR EXIT\\s*$", string.Empty,
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
        script = script.Replace("$(TenantProvisioningLoginName)", workerLogin, StringComparison.Ordinal)
            .Replace("AIERPPlatform", platformDatabase, StringComparison.Ordinal);
        foreach (var batch in System.Text.RegularExpressions.Regex.Split(script,
                     "(?im)^\\s*GO\\s*(?:--[^\\r\\n]*)?$", System.Text.RegularExpressions.RegexOptions.CultureInvariant)
                 .Where(x => !string.IsNullOrWhiteSpace(x)))
            await ExecuteAsync(master, batch);
        return masterKeyCreated;
    }

    private static async Task DropAcceptanceDatabasesAsync(string rootConnection, string platformDatabase,
        IReadOnlyList<string> tenantDatabases, IReadOnlyList<string> tenantLogins, bool dropMasterKey)
    {
        await using var connection = new SqlConnection(new SqlConnectionStringBuilder(rootConnection) { InitialCatalog = "master" }.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "IF OBJECT_ID(N'dbo.NexoraEnsureTenantDatabase',N'P') IS NOT NULL DROP PROCEDURE dbo.NexoraEnsureTenantDatabase; IF OBJECT_ID(N'dbo.NexoraEnsureTenantSqlLogin',N'P') IS NOT NULL DROP PROCEDURE dbo.NexoraEnsureTenantSqlLogin; IF OBJECT_ID(N'dbo.NexoraTenantDatabaseExists',N'P') IS NOT NULL DROP PROCEDURE dbo.NexoraTenantDatabaseExists; IF SUSER_ID(N'NexoraTenantProvisioningSignerLogin') IS NOT NULL DROP LOGIN [NexoraTenantProvisioningSignerLogin]; IF CERT_ID(N'NexoraTenantProvisioningSigner') IS NOT NULL DROP CERTIFICATE [NexoraTenantProvisioningSigner];";
        await command.ExecuteNonQueryAsync();
        var provisioningWorkerLogin = tenantLogins.LastOrDefault(login => !string.IsNullOrWhiteSpace(login));
        if (provisioningWorkerLogin is not null)
        {
            command.CommandText = "IF USER_ID(@user) IS NOT NULL BEGIN DECLARE @dropUser nvarchar(max)=N'DROP USER '+QUOTENAME(@user); EXEC sys.sp_executesql @dropUser; END;";
            command.Parameters.Clear();
            command.Parameters.AddWithValue("@user", provisioningWorkerLogin);
            await command.ExecuteNonQueryAsync();
        }
        var databases = tenantDatabases.Append(platformDatabase)
            .Where(database => !string.IsNullOrWhiteSpace(database))
            .Distinct(StringComparer.OrdinalIgnoreCase);
        foreach (var database in databases)
        {
            var quoted = $"[{database.Replace("]", "]]", StringComparison.Ordinal)}]";
            command.CommandText = $"IF DB_ID(@db) IS NOT NULL BEGIN ALTER DATABASE {quoted} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE {quoted}; END";
            command.Parameters.Clear();
            command.Parameters.AddWithValue("@db", database);
            await command.ExecuteNonQueryAsync();
        }
        foreach (var login in tenantLogins.Where(login => !string.IsNullOrWhiteSpace(login)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            command.CommandText = "IF SUSER_ID(@login) IS NOT NULL BEGIN DECLARE @sql nvarchar(max) = N'DROP LOGIN ' + QUOTENAME(@login); EXEC sys.sp_executesql @sql; END";
            command.Parameters.Clear();
            command.Parameters.AddWithValue("@login", login);
            await command.ExecuteNonQueryAsync();
        }
        if (dropMasterKey)
        {
            command.CommandText = "IF EXISTS(SELECT 1 FROM sys.symmetric_keys WHERE name=N'##MS_DatabaseMasterKey##') DROP MASTER KEY;";
            await command.ExecuteNonQueryAsync();
        }
    }

    private static async Task ExecuteAsync(SqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        await using var command = connection.CreateCommand();
        command.CommandTimeout = 60;
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<T> ScalarAsync<T>(SqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        await using var command = connection.CreateCommand();
        command.CommandTimeout = 60;
        command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        return (T)(await command.ExecuteScalarAsync() ?? throw new InvalidOperationException("SQL probe returned no value."));
    }

    private static string Required(string name) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
            ? value
            : throw new InvalidOperationException($"{name} is required for the disposable tenant SQL/Vault acceptance test.");

    private static async Task<(string ReaderRoleId, string ReaderSecretId, string WriterRoleId, string WriterSecretId)>
        ConfigureDisposableVaultAppRolesAsync(HttpClient http, Uri vaultAddress)
    {
        http.BaseAddress = vaultAddress;
        var rootToken = Required("AIERP_TENANT_ISOLATION_ACCEPTANCE_VAULT_ROOT_TOKEN");
        http.DefaultRequestHeaders.Add("X-Vault-Token", rootToken);
        using (var enable = await http.PostAsJsonAsync("v1/sys/auth/approle", new { type = "approle" }))
        {
            // The acceptance Vault is disposable and starts empty. Treat an already
            // enabled AppRole backend as an idempotent rerun; all other errors fail.
            if (!enable.IsSuccessStatusCode && (int)enable.StatusCode != 400)
                throw new InvalidOperationException("Could not enable the acceptance Vault AppRole backend.");
        }

        const string readerPolicy = "path \"secret/data/tenants/+/sql/*\" { capabilities = [\"read\"] }";
        const string writerPolicy = "path \"secret/data/tenants/+/sql/*\" { capabilities = [\"create\", \"update\"] }";
        await RequireVaultSuccessAsync(http.PostAsJsonAsync("v1/sys/policies/acl/tenant-sql-reader", new { policy = readerPolicy }));
        await RequireVaultSuccessAsync(http.PostAsJsonAsync("v1/sys/policies/acl/tenant-sql-writer", new { policy = writerPolicy }));
        await RequireVaultSuccessAsync(http.PostAsJsonAsync("v1/auth/approle/role/tenant-sql-reader",
            new { token_policies = "tenant-sql-reader", token_ttl = "5m", token_max_ttl = "10m" }));
        await RequireVaultSuccessAsync(http.PostAsJsonAsync("v1/auth/approle/role/tenant-sql-writer",
            new { token_policies = "tenant-sql-writer", token_ttl = "5m", token_max_ttl = "10m" }));

        var readerRoleId = await ReadVaultRoleIdAsync(http, "tenant-sql-reader");
        var readerSecretId = await CreateVaultSecretIdAsync(http, "tenant-sql-reader");
        var writerRoleId = await ReadVaultRoleIdAsync(http, "tenant-sql-writer");
        var writerSecretId = await CreateVaultSecretIdAsync(http, "tenant-sql-writer");
        http.DefaultRequestHeaders.Remove("X-Vault-Token");
        return (readerRoleId, readerSecretId, writerRoleId, writerSecretId);
    }

    private static async Task<string> ReadVaultRoleIdAsync(HttpClient http, string role)
    {
        using var response = await http.GetAsync($"v1/auth/approle/role/{role}/role-id");
        await RequireVaultSuccessAsync(response);
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        return document.RootElement.GetProperty("data").GetProperty("role_id").GetString()
            ?? throw new InvalidOperationException("Vault returned no AppRole role id.");
    }

    private static async Task<string> CreateVaultSecretIdAsync(HttpClient http, string role)
    {
        using var response = await http.PostAsJsonAsync($"v1/auth/approle/role/{role}/secret-id", new { });
        await RequireVaultSuccessAsync(response);
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        return document.RootElement.GetProperty("data").GetProperty("secret_id").GetString()
            ?? throw new InvalidOperationException("Vault returned no AppRole secret id.");
    }

    private static async Task RequireVaultSuccessAsync(Task<HttpResponseMessage> pendingResponse)
    {
        using var response = await pendingResponse;
        await RequireVaultSuccessAsync(response);
    }

    private static async Task RequireVaultSuccessAsync(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"The disposable Vault AppRole setup failed with HTTP {(int)response.StatusCode}.");
    }
}

internal sealed class TenantProvisioningAcceptanceAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly IConfiguration _configuration;

    public TenantProvisioningAcceptanceAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder, IConfiguration configuration) : base(options, logger, encoder) =>
        _configuration = configuration;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var userId = _configuration["TenantAcceptance:AdminId"];
        if (!Guid.TryParse(userId, out var parsedUserId))
            return Task.FromResult(AuthenticateResult.Fail("Acceptance admin identity is missing."));
        var identity = new ClaimsIdentity(
        [
            new Claim(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub, parsedUserId.ToString("D")),
            new Claim("platform_role", "PlatformSuperAdmin")
        ], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}

internal sealed class TenantSqlVaultAcceptanceFactAttribute : FactAttribute
{
    public TenantSqlVaultAcceptanceFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_DISPOSABLE_INSTANCE")
            != "YES_CREATE_AND_DROP_ISOLATED_TENANT_DATABASES")
            Skip = "Requires an explicitly disposable SQL Server and Vault acceptance environment.";
        else if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_SQL_CONNECTION_STRING"))
            || string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_VAULT_ADDRESS"))
            || string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AIERP_TENANT_ISOLATION_ACCEPTANCE_VAULT_ROOT_TOKEN")))
            Skip = "Requires disposable SQL Server connection and Vault endpoint/root token settings.";
    }
}
