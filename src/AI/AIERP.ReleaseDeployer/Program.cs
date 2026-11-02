using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.IO.Compression;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.ReleaseDeployer;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.Observability;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
DeployerState.AllowTestDockerOverride = ReleaseDeployerDockerExecutionPolicy.IsTestOverrideAllowed(builder.Environment.EnvironmentName);
builder.Services.AddAierpHttpMetrics();
var signingKey = builder.Configuration["Authentication:SigningKey"];
DatabaseIsolationConfiguration.RequireEnabled(builder.Configuration, "Release Deployer");
const bool separationEnabled = true;
if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
    throw new InvalidOperationException("Authentication:SigningKey must contain at least 32 bytes.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = builder.Configuration["Authentication:Issuer"] ?? "AIERP",
        ValidateAudience = true, ValidAudience = builder.Configuration["Authentication:Audience"] ?? "AIERP.ReleaseDeployer",
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(15)
    };
});
builder.Services.AddAuthorization();
var app = builder.Build();
var environmentName = builder.Environment.EnvironmentName;
// Capture process configuration outside request handlers. IConfiguration is a
// host service, not request data; making it a minimal-API parameter causes
// static analysis to treat configured storage roots as user-controlled paths.
var configuration = builder.Configuration;
app.UseAierpSecurityHeaders();
app.UseAierpHttpMetrics();
app.UseAuthentication();
app.UseAuthorization();

var scheduledBackupStopping = app.Lifetime.ApplicationStopping;
app.Lifetime.ApplicationStarted.Register(() => _ = Task.Run(async () =>
{
    while (!scheduledBackupStopping.IsCancellationRequested)
    {
        var now = DateTimeOffset.UtcNow;
        var nextRun = new DateTimeOffset(now.Year, now.Month, now.Day, 2, 0, 0, TimeSpan.Zero);
        if (nextRun <= now) nextRun = nextRun.AddDays(1);
        try { await Task.Delay(nextRun - now, scheduledBackupStopping); }
        catch (OperationCanceledException) when (scheduledBackupStopping.IsCancellationRequested) { break; }
        try { await BackupActiveProductionProjectsAsync(configuration, signingKey, app.Logger, scheduledBackupStopping); }
        catch (OperationCanceledException) when (scheduledBackupStopping.IsCancellationRequested) { break; }
        catch (Exception exception) { app.Logger.LogError(exception, "Scheduled production database backup failed."); }
    }
}));

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "release-deployer" }));
app.MapAierpMetrics();
app.MapPost("/internal/deployments/staging", async (CreateStagingDeployment body, ClaimsPrincipal caller, CancellationToken cancellationToken) =>
{
    if (!HasScope(caller, body, "release.staging.deploy")) return Results.Forbid();
    if (body.DeploymentId == Guid.Empty || body.TenantId == Guid.Empty || body.ProjectId == Guid.Empty || body.PackageId == Guid.Empty ||
        body.IdempotencyKey == Guid.Empty || !IsSha256(body.PackageSha256) || !IsSha256(body.CommitSha) ||
        !StudioReleaseVersionRules.IsValid(body.Version))
        return Results.BadRequest(new { error = "Dağıtım metadata'sı geçersiz." });

    // Staging currently inherits a shared SQL login and has no isolated
    // synthetic-tenant Worker/Vault lifecycle. Reject before creating files,
    // allocating secrets, or invoking Docker until both conditions are met.
    var stagingVaultLifecycleEnabled = configuration.GetValue<bool>("ReleaseDeployer:StagingTenantSqlVaultLifecycleEnabled");
    var unsafeAcceptanceFixture = TenantSqlVaultStagingPolicy.CanUseUnsafeAcceptanceFixture(
        environmentName,
        configuration.GetValue<bool>("ReleaseDeployer:AllowUnsafeComposeForAcceptanceTests"),
        DeployerState.AllowTestDockerOverride);
    if (!unsafeAcceptanceFixture && !TenantSqlVaultStagingPolicy.IsEnabled(stagingVaultLifecycleEnabled, syntheticIdentityLifecycleImplemented: false, compose: StagingTemplates.StagingCompose))
        return Results.Problem(
            "Staging dağıtımı kapalı: sentetik tenant SQL/Vault yaşam döngüsü ve DBA tarafından onaylı Worker bağlantısı yapılandırılmamış.",
            statusCode: StatusCodes.Status503ServiceUnavailable,
            title: "Staging tenant SQL Vault hazırlığı eksik");

    var packagesRoot = Path.GetFullPath(configuration["ReleaseDeployer:PackageRoot"] ?? "/release-packages");
    var releaseRoot = Path.GetFullPath(configuration["ReleaseDeployer:ReleaseRoot"] ?? "/staging-releases");
    var packagePath = ReleaseDeployerPath.SafeChild(packagesRoot, $"{ReleaseDeployerPath.SafeGuidSegment(body.PackageId)}.zip");
    var packageMetadataPath = ReleaseDeployerPath.SafeChild(packagesRoot, $"{ReleaseDeployerPath.SafeGuidSegment(body.PackageId)}.json");
    var projectDirectory = ReleaseDeployerPath.SafeChild(releaseRoot, ReleaseDeployerPath.SafeGuidSegment(body.ProjectId));
    var deploymentDirectory = ReleaseDeployerPath.SafeChild(projectDirectory, ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId));
    string? temporaryEnvFile = null;
    var deploymentSucceeded = false;
    var projectName = $"aierp-staging-{body.ProjectId:N}";
    Guid? currentDeploymentId = null;
    await DeployerState.Gate.WaitAsync(cancellationToken);
    try
    {
        await using var deploymentLock = await DistributedDeploymentLock.AcquireAsync(cancellationToken);
        if (!File.Exists(packagePath) || !File.Exists(packageMetadataPath)) return Results.NotFound(new { error = "Sürüm paketi veya metadata dosyası bulunamadı." });
        var existingResultPath = ReleaseDeployerPath.SafeChild(deploymentDirectory, "result.json");
        if (File.Exists(existingResultPath))
        {
            var existing = await ReadEncryptedResultAsync(existingResultPath, signingKey, cancellationToken);
            if (existing is null || existing.DeploymentId != body.DeploymentId || existing.IdempotencyKey != body.IdempotencyKey || existing.PackageSha256 != body.PackageSha256)
                return Results.Conflict(new { error = "Dağıtım kimliği başka metadata ile kullanılmış." });
            deploymentSucceeded = true;
            return Results.Ok(existing);
        }

        var currentPath = ReleaseDeployerPath.SafeChild(projectDirectory, "current.json");
        if (File.Exists(currentPath))
        {
            await using var currentStream = File.OpenRead(currentPath);
            currentDeploymentId = (await JsonSerializer.DeserializeAsync<DeploymentCurrentPointer>(currentStream, JsonConfig.Options, cancellationToken))?.DeploymentId;
        }
        if (currentDeploymentId != body.ExpectedActiveDeploymentId)
            return Results.Conflict(new { error = "Staging ortamı başka bir dağıtımla değişti; güncel geçmişi yenileyin." });
        if (currentDeploymentId is null && Directory.Exists(releaseRoot))
        {
            var maxActiveProjects = int.TryParse(configuration["ReleaseDeployer:MaxActiveStagingProjects"], out var configuredLimit)
                ? Math.Clamp(configuredLimit, 1, 10) : 2;
            var activeProjectCount = Directory.EnumerateDirectories(releaseRoot).Take(1000).Count(directory =>
            {
                var projectPath = ReleaseDeployerPath.SafeChild(releaseRoot, Path.GetFileName(directory));
                return File.Exists(ReleaseDeployerPath.SafeChild(projectPath, "current.json"));
            });
            if (activeProjectCount >= maxActiveProjects)
                return Results.Problem("Yerel staging ortamı sınırına ulaşıldı; kullanılmayan bir ortamı temizleyip yeniden deneyin.", statusCode: StatusCodes.Status429TooManyRequests);
        }

        Directory.CreateDirectory(deploymentDirectory);
        var actualPackageSha = await HashFileAsync(packagePath, cancellationToken);
        if (!string.Equals(actualPackageSha, body.PackageSha256, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Sürüm paketinin SHA-256 değeri kayıtla eşleşmiyor." });
        PackageMetadata? packageMetadata;
        await using (var metadataStream = File.OpenRead(packageMetadataPath))
        {
            packageMetadata = await JsonSerializer.DeserializeAsync<PackageMetadata>(metadataStream, JsonConfig.Options, cancellationToken);
            if (packageMetadata is null || packageMetadata.PackageId != body.PackageId || packageMetadata.Version != body.Version || packageMetadata.CommitSha != body.CommitSha ||
                packageMetadata.SizeBytes != new FileInfo(packagePath).Length || packageMetadata.FileCount is <= 0 or > 20_000 || !string.Equals(packageMetadata.PackageSha256, body.PackageSha256, StringComparison.OrdinalIgnoreCase))
                return Results.Conflict(new { error = "Sürüm paketi metadata'sı beklenen sürümle eşleşmiyor." });
        }
        Directory.CreateDirectory(projectDirectory);
        var sourceDirectory = ReleaseDeployerPath.SafeChild(deploymentDirectory, "source");
        Directory.CreateDirectory(sourceDirectory);
        await ExtractVerifiedPackageAsync(packagePath, body.PackageSha256, sourceDirectory, body.PackageId, body.Version, body.CommitSha, packageMetadata!.FileCount, cancellationToken);
        WriteTrustedBuildFiles(sourceDirectory);

        var secretsPath = ReleaseDeployerPath.SafeChild(projectDirectory, "secrets.enc.json");
        var secrets = File.Exists(secretsPath)
            ? await ReadEncryptedAsync<DeploymentSecrets>(secretsPath, signingKey, cancellationToken)
            : null;
        if (secrets is null)
        {
            var allocatedPort = 20000 + (int)(BitConverter.ToUInt32(body.ProjectId.ToByteArray(), 0) % 10000);
            var email = $"staging-admin-{body.ProjectId:N}@aierp.local";
            var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', 'A').Replace('/', 'B').TrimEnd('=');
            var sql = Convert.ToBase64String(RandomNumberGenerator.GetBytes(36)).Replace('+', 'A').Replace('/', 'B').TrimEnd('=') + "aA1!";
            var jwt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
            secrets = new DeploymentSecrets(email, password, sql, jwt, $"Nexora Staging {body.Version}", allocatedPort, NewRuntimePassword("pP2!"), NewRuntimePassword("mM3!"));
            Directory.CreateDirectory(projectDirectory);
            await WriteEncryptedAsync(secretsPath, secrets, signingKey, cancellationToken);
            if (OperatingSystem.IsLinux()) File.SetUnixFileMode(secretsPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        var syntheticStagingTenantId = StagingTenantIdentity.Resolve(body.TenantId, secrets.SyntheticStagingTenantId);
        if (secrets.SyntheticStagingTenantId != syntheticStagingTenantId)
        {
            secrets = secrets with { SyntheticStagingTenantId = syntheticStagingTenantId };
            await WriteEncryptedAsync(secretsPath, secrets, signingKey, cancellationToken);
            if (OperatingSystem.IsLinux()) File.SetUnixFileMode(secretsPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        if (string.IsNullOrWhiteSpace(secrets.PlatformRuntimePassword) || string.IsNullOrWhiteSpace(secrets.PlatformMigratorPassword))
        {
            secrets = secrets with { PlatformRuntimePassword = NewRuntimePassword("pP2!"), PlatformMigratorPassword = NewRuntimePassword("mM3!") };
            await WriteEncryptedAsync(secretsPath, secrets, signingKey, cancellationToken);
        }
        var port = secrets.Port;
        var composeFile = ReleaseDeployerPath.SafeChild(sourceDirectory, ".aierp-deploy/compose.yml");
        var envFile = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-staging-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.env");
        temporaryEnvFile = envFile;
        var cleanupEnvFile = ReleaseDeployerPath.SafeChild(projectDirectory, "cleanup.env");
        var env = $"SOURCE_ROOT={sourceDirectory}\nSTAGING_PORT={port}\nAIERP_STAGING_TENANT_ID={syntheticStagingTenantId:D}\nOCI_IMAGE_REVISION={body.CommitSha}\nOCI_IMAGE_VERSION={body.Version}\nMSSQL_SA_PASSWORD={secrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={secrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={secrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={secrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(secrets.JwtKey)}\nBOOTSTRAP_EMAIL={secrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={secrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={secrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separationEnabled.ToString().ToLowerInvariant()}\n";
        await File.WriteAllTextAsync(envFile, env, new UTF8Encoding(false), cancellationToken);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(envFile, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        if (!File.Exists(cleanupEnvFile))
        {
            var cleanupEnv = $"SOURCE_ROOT={sourceDirectory}\nSTAGING_PORT={port}\nMSSQL_SA_PASSWORD=unused\nAIERP_PLATFORM_RUNTIME_PASSWORD=unused\nAIERP_PLATFORM_MIGRATOR_PASSWORD=unused\nAUTH_SIGNING_KEY=unused\nPLUGIN_HOST_SIGNING_KEY=unused\nBOOTSTRAP_EMAIL=unused@example.invalid\nBOOTSTRAP_PASSWORD=unused\nBOOTSTRAP_TENANT_NAME=unused\n";
            await File.WriteAllTextAsync(cleanupEnvFile, cleanupEnv, new UTF8Encoding(false), cancellationToken);
            if (OperatingSystem.IsLinux()) File.SetUnixFileMode(cleanupEnvFile, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }

        var commandPrefix = new[] { "compose", "--project-name", projectName, "--file", composeFile, "--env-file", envFile };
        var config = await RunDockerAsync(commandPrefix.Concat(["config", "-q"]), TimeSpan.FromMinutes(1), cancellationToken);
        if (config.ExitCode != 0) return Results.Problem("Staging Compose yapılandırması doğrulanamadı.", statusCode: StatusCodes.Status422UnprocessableEntity);
        var up = await RunDockerAsync(commandPrefix.Concat(["up", "--detach", "--build", "--remove-orphans"]), TimeSpan.FromMinutes(20), cancellationToken);
        if (up.ExitCode != 0) return Results.Problem("Staging servisleri başlatılamadı. Deployer hata çıktısını gizlilik için saklamadı.", statusCode: StatusCodes.Status502BadGateway);
        var healthy = await WaitForHealthyAsync(commandPrefix, configuration, cancellationToken);
        if (!healthy) return Results.Problem("Staging servisleri başlatıldı ancak health check süresi içinde sağlıklı olmadı.", statusCode: StatusCodes.Status504GatewayTimeout);
        var tenantProvisioned = await WaitForStagingProvisioningAsync(commandPrefix, secrets.SqlPassword,
            syntheticStagingTenantId, configuration, cancellationToken);
        if (!tenantProvisioned)
            return Results.Problem("Staging servisleri sağlıklı ancak sentetik firmanın ERP/AI Studio veritabanları ve Worker işi hazır olmadı.",
                statusCode: StatusCodes.Status504GatewayTimeout, title: "Staging tenant hazırlığı tamamlanmadı");

        var result = new StagingDeploymentResult(body.DeploymentId, body.IdempotencyKey, body.PackageId, body.PackageSha256.ToUpperInvariant(), body.CommitSha,
            $"http://localhost:{port}", projectName, secrets.BootstrapEmail, secrets.BootstrapPassword, DateTimeOffset.UtcNow, body.Version);
        var resultPath = ReleaseDeployerPath.SafeChild(deploymentDirectory, "result.json");
        await WriteEncryptedResultAsync(resultPath, result, signingKey, cancellationToken);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(resultPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        await File.WriteAllTextAsync(currentPath, JsonSerializer.Serialize(new DeploymentCurrentPointer(body.DeploymentId), JsonConfig.Options), new UTF8Encoding(false), cancellationToken);
        var activeCleanupEnv = $"SOURCE_ROOT={sourceDirectory}\nSTAGING_PORT={port}\nMSSQL_SA_PASSWORD=unused\nAIERP_PLATFORM_RUNTIME_PASSWORD=unused\nAIERP_PLATFORM_MIGRATOR_PASSWORD=unused\nAUTH_SIGNING_KEY=unused\nPLUGIN_HOST_SIGNING_KEY=unused\nBOOTSTRAP_EMAIL=unused@example.invalid\nBOOTSTRAP_PASSWORD=unused\nBOOTSTRAP_TENANT_NAME=unused\n";
        await File.WriteAllTextAsync(cleanupEnvFile, activeCleanupEnv, new UTF8Encoding(false), cancellationToken);
        deploymentSucceeded = true;
        return Results.Ok(result);
    }
    catch (InvalidDataException exception) { return Results.Conflict(new { error = exception.Message }); }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Staging dağıtımı zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Staging kaynak paketi okunamadı veya yazılamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    finally
    {
        if (!deploymentSucceeded && Directory.Exists(deploymentDirectory))
        {
            var composeFile = ReleaseDeployerPath.SafeChild(deploymentDirectory, "source/.aierp-deploy/compose.yml");
            var restored = currentDeploymentId is null;
            if (currentDeploymentId is Guid previousId)
            {
                try
                {
                    var previousSource = ReleaseDeployerPath.SafeChild(projectDirectory, $"{ReleaseDeployerPath.SafeGuidSegment(previousId)}/source");
                    var previousCompose = ReleaseDeployerPath.SafeChild(previousSource, ".aierp-deploy/compose.yml");
                    var previousEnv = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-staging-restore-{ReleaseDeployerPath.SafeGuidSegment(body.ProjectId)}.env");
                    var savedSecrets = await ReadEncryptedAsync<DeploymentSecrets>(ReleaseDeployerPath.SafeChild(projectDirectory, "secrets.enc.json"), signingKey, CancellationToken.None);
                    if (File.Exists(previousCompose) && savedSecrets is not null)
                    {
                        var restoreValues = $"SOURCE_ROOT={previousSource}\nSTAGING_PORT={savedSecrets.Port}\nAIERP_STAGING_TENANT_ID={savedSecrets.SyntheticStagingTenantId:D}\nMSSQL_SA_PASSWORD={savedSecrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={savedSecrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={savedSecrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={savedSecrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(savedSecrets.JwtKey)}\nBOOTSTRAP_EMAIL={savedSecrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={savedSecrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={savedSecrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separationEnabled.ToString().ToLowerInvariant()}\n";
                        await File.WriteAllTextAsync(previousEnv, restoreValues, new UTF8Encoding(false), CancellationToken.None);
                        var restore = await RunDockerAsync(["compose", "--project-name", projectName, "--file", previousCompose, "--env-file", previousEnv, "up", "--detach", "--build", "--remove-orphans"], TimeSpan.FromMinutes(20), CancellationToken.None);
                        restored = restore.ExitCode == 0;
                        if (File.Exists(previousEnv)) File.Delete(previousEnv);
                    }
                }
                catch { restored = false; }
            }
            else
            {
                if (File.Exists(composeFile) && temporaryEnvFile is not null && File.Exists(temporaryEnvFile))
                {
                    var cleanup = await RunDockerAsync(["compose", "--project-name", projectName, "--file", composeFile, "--env-file", temporaryEnvFile, "down", "--volumes", "--remove-orphans"], TimeSpan.FromMinutes(3), CancellationToken.None);
                    restored = cleanup.ExitCode == 0;
                }
                if (restored)
                {
                    try { Directory.Delete(projectDirectory, recursive: true); } catch (IOException) { }
                }
            }
            if (currentDeploymentId is not null && restored) try { Directory.Delete(deploymentDirectory, recursive: true); } catch (IOException) { }
        }
        if (temporaryEnvFile is not null && File.Exists(temporaryEnvFile)) File.Delete(temporaryEnvFile);
        DeployerState.Gate.Release();
    }
}).RequireAuthorization();

app.MapDelete("/internal/deployments/staging/{deploymentId:guid}", async (Guid deploymentId, ClaimsPrincipal caller, CancellationToken cancellationToken) =>
{
    if (deploymentId == Guid.Empty || caller.FindFirstValue("deployment_id") != deploymentId.ToString("D") || caller.FindFirstValue("scope") != "release.staging.destroy") return Results.Forbid();
    if (!Guid.TryParse(caller.FindFirstValue("project_id"), out var projectId)) return Results.Forbid();
    var root = Path.GetFullPath(configuration["ReleaseDeployer:ReleaseRoot"] ?? "/staging-releases");
    var directory = ReleaseDeployerPath.SafeChild(root, ReleaseDeployerPath.SafeGuidSegment(projectId));
    if (!Directory.Exists(directory)) return Results.NotFound();
    await DeployerState.Gate.WaitAsync(cancellationToken);
    try
    {
        await using var deploymentLock = await DistributedDeploymentLock.AcquireAsync(cancellationToken);
        var currentPath = ReleaseDeployerPath.SafeChild(directory, "current.json");
        if (!File.Exists(currentPath)) return Results.NotFound();
        await using var currentStream = File.OpenRead(currentPath);
        var current = await JsonSerializer.DeserializeAsync<DeploymentCurrentPointer>(currentStream, JsonConfig.Options, cancellationToken);
        if (current?.DeploymentId != deploymentId) return Results.Conflict(new { error = "Yalnız etkin staging dağıtımı temizlenebilir." });
        var composePath = ReleaseDeployerPath.SafeChild(directory, $"{ReleaseDeployerPath.SafeGuidSegment(deploymentId)}/source/.aierp-deploy/compose.yml");
        var envPath = ReleaseDeployerPath.SafeChild(directory, "cleanup.env");
        if (File.Exists(composePath) && File.Exists(envPath))
        {
            var projectName = $"aierp-staging-{projectId:N}";
            var result = await RunDockerAsync(["compose", "--project-name", projectName, "--file", composePath, "--env-file", envPath, "down", "--volumes", "--remove-orphans"], TimeSpan.FromMinutes(3), cancellationToken);
            if (result.ExitCode != 0) return Results.Problem("Staging kaynakları temizlenemedi; dağıtım dosyaları korundu.", statusCode: StatusCodes.Status502BadGateway);
        }
        Directory.Delete(directory, recursive: true);
        return Results.NoContent();
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Staging temizleme zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Staging dosyaları temizlenemedi.", statusCode: StatusCodes.Status500InternalServerError); }
    finally { DeployerState.Gate.Release(); }
}).RequireAuthorization();

app.MapPost("/internal/deployments/production", async (CreateStagingDeployment body, ClaimsPrincipal caller, CancellationToken cancellationToken) =>
{
    if (!HasScope(caller, body, "release.production.deploy")) return Results.Forbid();
    if (body.DeploymentId == Guid.Empty || body.TenantId == Guid.Empty || body.ProjectId == Guid.Empty || body.PackageId == Guid.Empty ||
        body.IdempotencyKey == Guid.Empty || !IsSha256(body.PackageSha256) || !IsSha256(body.CommitSha) || !StudioReleaseVersionRules.IsValid(body.Version))
        return Results.BadRequest(new { error = "Üretim dağıtım metadata'sı geçersiz." });
    // Production is generated from the same tenant-separated Compose
    // template. A flag alone cannot bypass this check: the template must also
    // contain the synthetic-tenant Worker/Vault contract and must not contain
    // the shared tenant SQL login or a Vault token.
    var stagingVaultLifecycleEnabled = configuration.GetValue<bool>("ReleaseDeployer:StagingTenantSqlVaultLifecycleEnabled");
    var unsafeAcceptanceFixture = TenantSqlVaultStagingPolicy.CanUseUnsafeAcceptanceFixture(
        environmentName,
        configuration.GetValue<bool>("ReleaseDeployer:AllowUnsafeComposeForAcceptanceTests"),
        DeployerState.AllowTestDockerOverride);
    if (!unsafeAcceptanceFixture && !TenantSqlVaultStagingPolicy.IsEnabled(stagingVaultLifecycleEnabled, syntheticIdentityLifecycleImplemented: false, compose: StagingTemplates.StagingCompose))
        return Results.Problem(
            "Üretim dağıtımı kapalı: sentetik tenant SQL/Vault yaşam döngüsü ve DBA tarafından onaylı Worker bağlantısı yapılandırılmamış.",
            statusCode: StatusCodes.Status503ServiceUnavailable,
            title: "Tenant SQL Vault dağıtım hazırlığı eksik");
    var packagesRoot = Path.GetFullPath(configuration["ReleaseDeployer:PackageRoot"] ?? "/release-packages");
    var releaseRoot = Path.GetFullPath(configuration["ReleaseDeployer:ProductionRoot"] ?? "/production-releases");
    var packagePath = ReleaseDeployerPath.SafeChild(packagesRoot, $"{ReleaseDeployerPath.SafeGuidSegment(body.PackageId)}.zip");
    var packageMetadataPath = ReleaseDeployerPath.SafeChild(packagesRoot, $"{ReleaseDeployerPath.SafeGuidSegment(body.PackageId)}.json");
    var projectDirectory = ReleaseDeployerPath.SafeChild(releaseRoot, ReleaseDeployerPath.SafeGuidSegment(body.ProjectId));
    var deploymentDirectory = ReleaseDeployerPath.SafeChild(projectDirectory, ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId));
    var projectName = $"aierp-production-{body.ProjectId:N}";
    var secretsPath = ReleaseDeployerPath.SafeChild(projectDirectory, "secrets.enc.json");
    var envPath = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-production-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.env");
    var migrationRollbackPath = ReleaseDeployerPath.SafeChild(deploymentDirectory, "migration-rollback.json");
    Guid? previousDeploymentId = null;
    var succeeded = false;
    var attemptStarted = false;
    var migrationMayHaveRun = false;
    var migrationStatus = "not_started";
    await DeployerState.Gate.WaitAsync(cancellationToken);
    try
    {
        await using var deploymentLock = await DistributedDeploymentLock.AcquireAsync(cancellationToken);
        if (!File.Exists(packagePath) || !File.Exists(packageMetadataPath)) return Results.NotFound(new { error = "Sürüm paketi bulunamadı." });
        var existingResultPath = ReleaseDeployerPath.SafeChild(deploymentDirectory, "result.json");
        if (File.Exists(existingResultPath))
        {
            var existing = await ReadEncryptedResultAsync(existingResultPath, signingKey, cancellationToken);
            if (existing is null || existing.IdempotencyKey != body.IdempotencyKey || existing.PackageSha256 != body.PackageSha256)
                return Results.Conflict(new { error = "Üretim dağıtım kimliği farklı metadata ile kullanılmış." });
            succeeded = true;
            return Results.Ok(existing);
        }
        if (File.Exists(migrationRollbackPath))
            return Results.Conflict(new { error = "Bu deployment kimliği daha önce kullanılmış; güvenli tekrar için yeni bir deployment oluşturun." });
        Directory.CreateDirectory(projectDirectory);
        var currentPath = ReleaseDeployerPath.SafeChild(projectDirectory, "current.json");
        if (File.Exists(currentPath))
        {
            await using var stream = File.OpenRead(currentPath);
            previousDeploymentId = (await JsonSerializer.DeserializeAsync<DeploymentCurrentPointer>(stream, JsonConfig.Options, cancellationToken))?.DeploymentId;
        }
        if (previousDeploymentId != body.ExpectedActiveDeploymentId)
            return Results.Conflict(new { error = "Üretim sürümü değişti; dağıtım geçmişini yenileyip tekrar deneyin." });
        // A failed attempt may have started a database migration. Keep its
        // recovery record and require a fresh deployment ID for every retry.
        if (Directory.Exists(deploymentDirectory))
            return Results.Conflict(new { error = "Bu deployment kimliği daha önce kullanılmış; güvenli tekrar için yeni bir deployment oluşturun." });
        if (!string.Equals(await HashFileAsync(packagePath, cancellationToken), body.PackageSha256, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Paket SHA-256 doğrulaması başarısız." });
        PackageMetadata? metadata;
        await using (var stream = File.OpenRead(packageMetadataPath)) metadata = await JsonSerializer.DeserializeAsync<PackageMetadata>(stream, JsonConfig.Options, cancellationToken);
        if (metadata is null || metadata.PackageId != body.PackageId || metadata.Version != body.Version || metadata.CommitSha != body.CommitSha ||
            metadata.SizeBytes != new FileInfo(packagePath).Length || metadata.FileCount is <= 0 or > 20_000 || !string.Equals(metadata.PackageSha256, body.PackageSha256, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Paket metadata'sı beklenen sürümle eşleşmiyor." });
        attemptStarted = true;
        Directory.CreateDirectory(deploymentDirectory);
        var sourceDirectory = ReleaseDeployerPath.SafeChild(deploymentDirectory, "source");
        Directory.CreateDirectory(sourceDirectory);
        await ExtractVerifiedPackageAsync(packagePath, body.PackageSha256, sourceDirectory, body.PackageId, body.Version, body.CommitSha, metadata.FileCount, cancellationToken);
        await WriteProductionMigrationRollbackStateAsync(migrationRollbackPath,
            new ProductionMigrationRollbackState(body.DeploymentId, previousDeploymentId, migrationStatus, "deployment_in_progress", null, DateTimeOffset.UtcNow), cancellationToken);
        WriteTrustedBuildFiles(sourceDirectory, production: true);
        var secrets = File.Exists(secretsPath) ? await ReadEncryptedAsync<DeploymentSecrets>(secretsPath, signingKey, cancellationToken) : null;
        if (secrets is null)
        {
            var port = 40000 + (int)(BitConverter.ToUInt32(body.ProjectId.ToByteArray(), 0) % 10000);
            secrets = new DeploymentSecrets($"production-admin-{body.ProjectId:N}@aierp.local", Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
                NewRuntimePassword("aA1!"), Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)), $"Nexora Production {body.Version}", port,
                NewRuntimePassword("pP2!"), NewRuntimePassword("mM3!"));
            await WriteEncryptedAsync(secretsPath, secrets, signingKey, cancellationToken);
            if (OperatingSystem.IsLinux()) File.SetUnixFileMode(secretsPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        if (string.IsNullOrWhiteSpace(secrets.PlatformRuntimePassword) || string.IsNullOrWhiteSpace(secrets.PlatformMigratorPassword))
        {
            secrets = secrets with { PlatformRuntimePassword = NewRuntimePassword("pP2!"), PlatformMigratorPassword = NewRuntimePassword("mM3!") };
            await WriteEncryptedAsync(secretsPath, secrets, signingKey, cancellationToken);
        }
        var separationBackupPath = previousDeploymentId is null ? "" : $"/var/opt/mssql/backups/AIERPPlatform-{ReleaseDeployerPath.SafeGuidSegment(body.ProjectId)}-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.bak";
        var env = $"SOURCE_ROOT={sourceDirectory}\nPRODUCTION_PORT={secrets.Port}\nOCI_IMAGE_REVISION={body.CommitSha}\nOCI_IMAGE_VERSION={body.Version}\nMSSQL_SA_PASSWORD={secrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={secrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={secrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={secrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(secrets.JwtKey)}\nBOOTSTRAP_EMAIL={secrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={secrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={secrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separationEnabled.ToString().ToLowerInvariant()}\nDATABASE_SEPARATION_BACKUP_PATH={separationBackupPath}\n";
        await File.WriteAllTextAsync(envPath, env, new UTF8Encoding(false), cancellationToken);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(envPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        var composeFile = ReleaseDeployerPath.SafeChild(sourceDirectory, ".aierp-deploy/compose.yml");
        var prefix = new[] { "compose", "--project-name", projectName, "--file", composeFile, "--env-file", envPath };
        if ((await RunDockerAsync(prefix.Concat(["config", "-q"]), TimeSpan.FromMinutes(1), cancellationToken)).ExitCode != 0)
            return Results.Problem("Production Compose yapılandırması doğrulanamadı.", statusCode: StatusCodes.Status422UnprocessableEntity);
        if (previousDeploymentId is Guid activeId)
        {
            var activeSource = ReleaseDeployerPath.SafeChild(projectDirectory, $"{ReleaseDeployerPath.SafeGuidSegment(activeId)}/source");
            var activeCompose = ReleaseDeployerPath.SafeChild(activeSource, ".aierp-deploy/compose.yml");
            var backupEnv = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-production-backup-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.env");
            try
            {
                var backupEnvironment = $"SOURCE_ROOT={activeSource}\nPRODUCTION_PORT={secrets.Port}\nMSSQL_SA_PASSWORD={secrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={secrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={secrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={secrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(secrets.JwtKey)}\nBOOTSTRAP_EMAIL={secrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={secrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={secrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separationEnabled.ToString().ToLowerInvariant()}\n";
                await File.WriteAllTextAsync(backupEnv, backupEnvironment, new UTF8Encoding(false), cancellationToken);
                if (OperatingSystem.IsLinux()) File.SetUnixFileMode(backupEnv, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                var backupPrefix = new[] { "compose", "--project-name", projectName, "--file", activeCompose, "--env-file", backupEnv };
                var quiesced = await RunDockerAsync(backupPrefix.Concat(["stop", "platform-api", "ai-service", "platform-migrator"]), TimeSpan.FromMinutes(2), cancellationToken);
                if (quiesced.ExitCode != 0)
                    return Results.Problem("Production servisleri yedek için durdurulamadı; dağıtım başlatılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable);
                var sqlcmd = new[] { "exec", "-T", "sqlserver", "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", secrets.SqlPassword, "-C", "-b", "-d", "master", "-Q" };
                var backupNames = await ListAierpDatabasesAsync(backupPrefix, sqlcmd, cancellationToken);
                if (backupNames.Count == 0 || !await BackupDatabaseSetAsync(backupPrefix, sqlcmd, backupNames, body.ProjectId, body.DeploymentId, ProductionBackupRoot(configuration), cancellationToken))
                    return Results.Problem("Production veritabanı yedeği alınamadı veya doğrulanamadı; yeni sürüm başlatılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable);
                await File.WriteAllTextAsync(BackupManifestPath(body.ProjectId, body.DeploymentId, ProductionBackupRoot(configuration)), JsonSerializer.Serialize(backupNames, JsonConfig.Options), cancellationToken);
            }
            finally { if (File.Exists(backupEnv)) File.Delete(backupEnv); }
        }
        // Write ahead of Compose: an interrupted command may have started the one-shot migrator.
        migrationMayHaveRun = true;
        migrationStatus = "may_have_run";
        await WriteProductionMigrationRollbackStateAsync(migrationRollbackPath,
            new ProductionMigrationRollbackState(body.DeploymentId, previousDeploymentId, migrationStatus, "pending_operator_review", null, DateTimeOffset.UtcNow), cancellationToken);
        if ((await RunDockerAsync(prefix.Concat(["up", "--detach", "--build", "--remove-orphans"]), TimeSpan.FromMinutes(20), cancellationToken)).ExitCode != 0)
            return Results.Problem("Production Compose servisleri başlatılamadı.", statusCode: StatusCodes.Status502BadGateway);
        migrationStatus = "completed"; // Compose waits for platform-migrator to complete successfully before starting platform-api.
        await WriteProductionMigrationRollbackStateAsync(migrationRollbackPath,
            new ProductionMigrationRollbackState(body.DeploymentId, previousDeploymentId, migrationStatus, "pending_operator_review", null, DateTimeOffset.UtcNow), cancellationToken);
        if (!await WaitForHealthyAsync(prefix, configuration, cancellationToken))
            return Results.Problem("Production servisleri health check süresinde hazır olmadı.", statusCode: StatusCodes.Status504GatewayTimeout);
        var result = new StagingDeploymentResult(body.DeploymentId, body.IdempotencyKey, body.PackageId, body.PackageSha256.ToUpperInvariant(), body.CommitSha,
            $"http://localhost:{secrets.Port}", projectName, secrets.BootstrapEmail, secrets.BootstrapPassword, DateTimeOffset.UtcNow, body.Version);
        await WriteEncryptedResultAsync(existingResultPath, result, signingKey, cancellationToken);
        await File.WriteAllTextAsync(currentPath, JsonSerializer.Serialize(new DeploymentCurrentPointer(body.DeploymentId), JsonConfig.Options), new UTF8Encoding(false), cancellationToken);
        succeeded = true;
        try
        {
            await WriteProductionMigrationRollbackStateAsync(migrationRollbackPath,
                new ProductionMigrationRollbackState(body.DeploymentId, previousDeploymentId, migrationStatus, "not_required", "deployment_succeeded", DateTimeOffset.UtcNow), cancellationToken);
        }
        catch (Exception exception) { app.Logger.LogError(exception, "Could not persist successful migration state for deployment {DeploymentId}.", body.DeploymentId); }
        return Results.Ok(result);
    }
    catch (InvalidDataException exception) { return Results.Conflict(new { error = exception.Message }); }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Production dağıtımı zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Production paket veya dağıtım dosyaları okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    finally
    {
        if (!succeeded && attemptStarted && previousDeploymentId is Guid previousId && ProductionMigrationRollbackPolicy.ShouldRestartPreviousApplication(migrationMayHaveRun))
        {
            var rollbackOutcome = "previous_application_restart_failed";
            var rollbackMessage = "Previous application was not confirmed healthy.";
            try
            {
                var oldSource = ReleaseDeployerPath.SafeChild(projectDirectory, $"{ReleaseDeployerPath.SafeGuidSegment(previousId)}/source");
                var oldCompose = ReleaseDeployerPath.SafeChild(oldSource, ".aierp-deploy/compose.yml");
                var oldSecrets = await ReadEncryptedAsync<DeploymentSecrets>(secretsPath, signingKey, CancellationToken.None);
                var oldResult = await ReadEncryptedResultAsync(ReleaseDeployerPath.SafeChild(projectDirectory, $"{ReleaseDeployerPath.SafeGuidSegment(previousId)}/result.json"), signingKey, CancellationToken.None);
                if (File.Exists(oldCompose) && oldSecrets is not null)
                {
                    var restoreEnv = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-production-restore-{ReleaseDeployerPath.SafeGuidSegment(body.ProjectId)}.env");
                    await File.WriteAllTextAsync(restoreEnv, $"SOURCE_ROOT={oldSource}\nPRODUCTION_PORT={oldSecrets.Port}\nOCI_IMAGE_REVISION={oldResult?.CommitSha ?? "unknown"}\nOCI_IMAGE_VERSION={oldResult?.Version ?? "unknown"}\nMSSQL_SA_PASSWORD={oldSecrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={oldSecrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={oldSecrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={oldSecrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(oldSecrets.JwtKey)}\nBOOTSTRAP_EMAIL={oldSecrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={oldSecrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={oldSecrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separationEnabled.ToString().ToLowerInvariant()}\nDATABASE_SEPARATION_BACKUP_PATH=/var/opt/mssql/backups/AIERPPlatform-{ReleaseDeployerPath.SafeGuidSegment(body.ProjectId)}-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.bak\n", new UTF8Encoding(false), CancellationToken.None);
                    if (OperatingSystem.IsLinux()) File.SetUnixFileMode(restoreEnv, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                    try
                    {
                        var restorePrefix = new[] { "compose", "--project-name", projectName, "--file", oldCompose, "--env-file", restoreEnv };
                        var restore = await RunDockerAsync(restorePrefix.Concat(["up", "--detach", "--build", "--remove-orphans"]), TimeSpan.FromMinutes(20), CancellationToken.None);
                        if (restore.ExitCode == 0 && await WaitForHealthyAsync(restorePrefix, configuration, CancellationToken.None))
                        {
                            rollbackOutcome = "previous_application_restarted_healthy_probe_only";
                            rollbackMessage = "Previous application passed its configured health probe; database schema compatibility was not verified.";
                        }
                    }
                    finally { if (File.Exists(restoreEnv)) File.Delete(restoreEnv); }
                }
            }
            catch (Exception exception)
            {
                rollbackMessage = $"Previous application restart failed: {exception.GetType().Name}.";
            }
            try
            {
                await WriteProductionMigrationRollbackStateAsync(migrationRollbackPath,
                    new ProductionMigrationRollbackState(body.DeploymentId, previousId, migrationStatus, rollbackOutcome, rollbackMessage, DateTimeOffset.UtcNow), CancellationToken.None);
            }
            catch (Exception exception) { app.Logger.LogError(exception, "Could not persist production rollback state for deployment {DeploymentId}.", body.DeploymentId); }
            app.Logger.LogWarning("Production deployment {DeploymentId} failed before migration; rollback outcome: {RollbackOutcome}. {RollbackMessage}", body.DeploymentId, rollbackOutcome, rollbackMessage);
        }
        else if (!succeeded && attemptStarted && previousDeploymentId is Guid blockedPreviousId)
        {
            const string outcome = "blocked_migration_may_have_run";
            const string message = "Previous application was not restarted because the new migration may have changed the database. Database restore is a separate operator decision.";
            try
            {
                await WriteProductionMigrationRollbackStateAsync(migrationRollbackPath,
                    new ProductionMigrationRollbackState(body.DeploymentId, blockedPreviousId, migrationStatus, outcome, message, DateTimeOffset.UtcNow), CancellationToken.None);
            }
            catch (Exception exception) { app.Logger.LogError(exception, "Could not persist production migration safety state for deployment {DeploymentId}.", body.DeploymentId); }
            app.Logger.LogError("Production deployment {DeploymentId} failed after migration may have started. Previous application restart is blocked; migration status {MigrationStatus}.", body.DeploymentId, migrationStatus);
        }
        else if (!succeeded && attemptStarted && Directory.Exists(deploymentDirectory))
        {
            try
            {
                var failedCompose = ReleaseDeployerPath.SafeChild(deploymentDirectory, "source/.aierp-deploy/compose.yml");
                if (File.Exists(failedCompose) && File.Exists(envPath))
                    await RunDockerAsync(ProductionMigrationRollbackPolicy.FailedDeploymentCleanupArguments(projectName, failedCompose, envPath), TimeSpan.FromMinutes(3), CancellationToken.None);
                Directory.Delete(deploymentDirectory, recursive: true);
            }
            catch { }
        }
        if (File.Exists(envPath)) File.Delete(envPath);
        DeployerState.Gate.Release();
    }
}).RequireAuthorization();

app.MapPost("/internal/deployments/production/restore", async (RestoreProductionDeployment body, ClaimsPrincipal caller, CancellationToken cancellationToken) =>
{
    if (!HasRestoreScope(caller, body, "release.production.restore")) return Results.Forbid();
    if (body.DeploymentId == Guid.Empty || body.TenantId == Guid.Empty || body.ProjectId == Guid.Empty || body.PackageId == Guid.Empty ||
        body.IdempotencyKey == Guid.Empty || body.ExpectedActiveDeploymentId == Guid.Empty || body.BackupDeploymentId == Guid.Empty ||
        body.TargetDeploymentId == Guid.Empty || !IsSha256(body.PackageSha256) || !IsSha256(body.CommitSha) || !StudioReleaseVersionRules.IsValid(body.Version))
        return Results.BadRequest(new { error = "Üretim geri yükleme metadata'sı geçersiz." });

    var root = Path.GetFullPath(configuration["ReleaseDeployer:ProductionRoot"] ?? "/production-releases");
    var projectDirectory = ReleaseDeployerPath.SafeChild(root, ReleaseDeployerPath.SafeGuidSegment(body.ProjectId));
    var operationDirectory = ReleaseDeployerPath.SafeChild(projectDirectory, ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId));
    var activeDirectory = ReleaseDeployerPath.SafeChild(projectDirectory, ReleaseDeployerPath.SafeGuidSegment(body.ExpectedActiveDeploymentId));
    var targetDirectory = ReleaseDeployerPath.SafeChild(projectDirectory, ReleaseDeployerPath.SafeGuidSegment(body.TargetDeploymentId));
    var secretsPath = ReleaseDeployerPath.SafeChild(projectDirectory, "secrets.enc.json");
    var currentPath = ReleaseDeployerPath.SafeChild(projectDirectory, "current.json");
    var projectName = $"aierp-production-{body.ProjectId:N}";
    var envPath = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-production-restore-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.env");
    var targetEnvPath = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-production-restore-target-{ReleaseDeployerPath.SafeGuidSegment(body.DeploymentId)}.env");
    var succeeded = false;
    var applicationStopped = false;
    var databaseRestoreAttempted = false;
    List<string> safetyDatabaseNames = [];
    await DeployerState.Gate.WaitAsync(cancellationToken);
    try
    {
        await using var deploymentLock = await DistributedDeploymentLock.AcquireAsync(cancellationToken);
        if (!File.Exists(currentPath) || !Directory.Exists(activeDirectory) || !Directory.Exists(targetDirectory))
            return Results.Conflict(new { error = "Etkin sürüm, hedef paket veya production işaretçisi bulunamadı." });
        await using (var stream = File.OpenRead(currentPath))
        {
            var pointer = await JsonSerializer.DeserializeAsync<DeploymentCurrentPointer>(stream, JsonConfig.Options, cancellationToken);
            if (pointer?.DeploymentId != body.ExpectedActiveDeploymentId && pointer?.DeploymentId != body.BackupDeploymentId)
                return Results.Conflict(new { error = "Etkin production sürümü değişti; geçmişi yenileyip tekrar deneyin." });
        }
        var activeSource = ReleaseDeployerPath.SafeChild(activeDirectory, "source");
        var targetSource = ReleaseDeployerPath.SafeChild(targetDirectory, "source");
        var activeCompose = ReleaseDeployerPath.SafeChild(activeSource, ".aierp-deploy/compose.yml");
        var targetCompose = ReleaseDeployerPath.SafeChild(targetSource, ".aierp-deploy/compose.yml");
        var targetResult = await ReadEncryptedResultAsync(ReleaseDeployerPath.SafeChild(targetDirectory, "result.json"), signingKey, cancellationToken);
        if (targetResult is null || targetResult.PackageId != body.PackageId || targetResult.PackageSha256 != body.PackageSha256 || targetResult.CommitSha != body.CommitSha ||
            (targetResult.Version is not null && targetResult.Version != body.Version) ||
            !File.Exists(activeCompose) || !File.Exists(targetCompose))
            return Results.Conflict(new { error = "Geri yükleme hedefinin kayıtlı production paketi doğrulanamadı." });
        var secrets = await ReadEncryptedAsync<DeploymentSecrets>(secretsPath, signingKey, cancellationToken);
        if (secrets is null) return Results.Conflict(new { error = "Production kimlik bilgileri çözümlenemedi." });
        var activeResult = await ReadEncryptedResultAsync(ReleaseDeployerPath.SafeChild(activeDirectory, "result.json"), signingKey, cancellationToken);
        if (activeResult is null) return Results.Conflict(new { error = "Etkin production sürümünün onaylı commit bilgisi okunamadı." });
        var activeEnv = $"SOURCE_ROOT={activeSource}\nPRODUCTION_PORT={secrets.Port}\nOCI_IMAGE_REVISION={activeResult.CommitSha}\nOCI_IMAGE_VERSION={activeResult.Version ?? "unknown"}\nMSSQL_SA_PASSWORD={secrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={secrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={secrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={secrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(secrets.JwtKey)}\nBOOTSTRAP_EMAIL={secrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={secrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={secrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separationEnabled.ToString().ToLowerInvariant()}\n";
        await File.WriteAllTextAsync(envPath, activeEnv, new UTF8Encoding(false), cancellationToken);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(envPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        var targetEnv = activeEnv.Replace($"SOURCE_ROOT={activeSource}", $"SOURCE_ROOT={targetSource}", StringComparison.Ordinal)
            .Replace($"OCI_IMAGE_REVISION={activeResult.CommitSha}", $"OCI_IMAGE_REVISION={body.CommitSha}", StringComparison.Ordinal)
            .Replace($"OCI_IMAGE_VERSION={activeResult.Version ?? "unknown"}", $"OCI_IMAGE_VERSION={body.Version}", StringComparison.Ordinal);
        await File.WriteAllTextAsync(targetEnvPath, targetEnv, new UTF8Encoding(false), cancellationToken);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(targetEnvPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        var activePrefix = new[] { "compose", "--project-name", projectName, "--file", activeCompose, "--env-file", envPath };
        var targetPrefix = new[] { "compose", "--project-name", projectName, "--file", targetCompose, "--env-file", targetEnvPath };
        var sqlcmd = new[] { "exec", "-T", "sqlserver", "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", secrets.SqlPassword, "-C", "-b", "-d", "master", "-Q" };
        var backupRoot = ProductionBackupRoot(configuration);
        var backupNames = await ReadBackupManifestAsync(body.ProjectId, body.BackupDeploymentId, backupRoot, cancellationToken);
        if (backupNames is null && File.Exists(DatabaseBackupVolumePath("AIERPPlatform", body.ProjectId, body.BackupDeploymentId, backupRoot)))
            backupNames = ["AIERPPlatform"]; // Compatibility with backups created before database-set manifests.
        if (backupNames is null || backupNames.Count == 0 || !await VerifyDatabaseSetAsync(activePrefix, sqlcmd, backupNames, body.ProjectId, body.BackupDeploymentId, backupRoot, cancellationToken))
            return Results.Conflict(new { error = "Geri yüklenecek veritabanı yedek seti doğrulanamadı; production değişmeden bırakıldı." });
        var currentDatabaseNames = await ListAierpDatabasesAsync(activePrefix, sqlcmd, cancellationToken);
        if (!DatabaseBackupSetPolicy.MatchesCurrentSet(currentDatabaseNames, backupNames))
            return Results.Conflict(new { error = "Geri yükleme yedeğinin veritabanı kümesi mevcut production ile eşleşmiyor; farklı zamana ait veritabanları karışmaması için production değiştirilmedi." });
        safetyDatabaseNames = await ListAierpDatabasesAsync(activePrefix, sqlcmd, cancellationToken);
        if (safetyDatabaseNames.Count == 0 || !await BackupDatabaseSetAsync(activePrefix, sqlcmd, safetyDatabaseNames, body.ProjectId, body.DeploymentId, backupRoot, cancellationToken))
            return Results.Problem("Geri yükleme öncesi mevcut veritabanı yedek seti alınamadı; production değişmeden bırakıldı.", statusCode: StatusCodes.Status503ServiceUnavailable);
        var stopped = await RunDockerAsync(activePrefix.Concat(["stop", "platform-api", "ai-service", "platform-migrator"]), TimeSpan.FromMinutes(2), cancellationToken);
        if (stopped.ExitCode != 0) return Results.Problem("Production API durdurulamadı; veritabanı geri yüklenmedi.", statusCode: StatusCodes.Status503ServiceUnavailable);
        applicationStopped = true;
        // Tenant creation can race with the earlier preflight while the live application is
        // still serving requests. Recheck after all database writers are stopped so a set
        // mismatch cannot turn into a partial point-in-time restore.
        var stoppedDatabaseNames = await ListAierpDatabasesAsync(activePrefix, sqlcmd, cancellationToken);
        if (!DatabaseBackupSetPolicy.MatchesCurrentSet(stoppedDatabaseNames, backupNames))
            return Results.Conflict(new { error = "Production veritabanı kümesi yedek doğrulamasından sonra değişti; geri yükleme iptal edildi." });
        databaseRestoreAttempted = true;
        if (!await RestoreDatabaseSetAsync(activePrefix, sqlcmd, backupNames, body.ProjectId, body.BackupDeploymentId, backupRoot, cancellationToken))
            return Results.Problem("Veritabanı yedek seti geri yüklenemedi; Deployer mevcut uygulama ve veriyi kurtarmayı deneyecek.", statusCode: StatusCodes.Status502BadGateway);
        if ((await RunDockerAsync(targetPrefix.Concat(["up", "--detach", "--build", "--remove-orphans"]), TimeSpan.FromMinutes(20), cancellationToken)).ExitCode != 0 ||
            !await WaitForHealthyAsync(targetPrefix, configuration, cancellationToken))
            return Results.Problem("Önceki uygulama sürümü geri yüklendi ancak health check geçmedi; Deployer mevcut veritabanı yedeğini geri almaya çalıştı.", statusCode: StatusCodes.Status504GatewayTimeout);
        var operationSource = ReleaseDeployerPath.SafeChild(operationDirectory, "source");
        if (Directory.Exists(operationDirectory)) Directory.Delete(operationDirectory, recursive: true);
        CopyDirectory(targetSource, operationSource);
        var result = new StagingDeploymentResult(body.DeploymentId, body.IdempotencyKey, body.PackageId, body.PackageSha256.ToUpperInvariant(), body.CommitSha,
            $"http://localhost:{secrets.Port}", projectName, "", "", DateTimeOffset.UtcNow, body.Version);
        await WriteEncryptedResultAsync(ReleaseDeployerPath.SafeChild(operationDirectory, "result.json"), result, signingKey, cancellationToken);
        await File.WriteAllTextAsync(currentPath, JsonSerializer.Serialize(new DeploymentCurrentPointer(body.DeploymentId), JsonConfig.Options), new UTF8Encoding(false), cancellationToken);
        succeeded = true;
        return Results.Ok(result);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Production veritabanı geri yüklemesi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Production geri yükleme dosyaları okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    finally
    {
        if (!succeeded && applicationStopped)
        {
            try
            {
                var activeSource = ReleaseDeployerPath.SafeChild(activeDirectory, "source");
                var activeCompose = ReleaseDeployerPath.SafeChild(activeSource, ".aierp-deploy/compose.yml");
                var activePrefix = new[] { "compose", "--project-name", projectName, "--file", activeCompose, "--env-file", envPath };
                var oldSecrets = await ReadEncryptedAsync<DeploymentSecrets>(secretsPath, signingKey, CancellationToken.None);
                if (oldSecrets is not null && File.Exists(activeCompose))
                {
                    var sqlcmd = new[] { "exec", "-T", "sqlserver", "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", oldSecrets.SqlPassword, "-C", "-b", "-d", "master", "-Q" };
                    var safetyRestored = !databaseRestoreAttempted || await RestoreDatabaseSetAsync(activePrefix, sqlcmd, safetyDatabaseNames, body.ProjectId, body.DeploymentId, ProductionBackupRoot(configuration), CancellationToken.None);
                    var start = await RunDockerAsync(activePrefix.Concat(["up", "--detach", "--build", "--remove-orphans"]), TimeSpan.FromMinutes(20), CancellationToken.None);
                    var healthy = start.ExitCode == 0 && safetyRestored && await WaitForHealthyAsync(activePrefix, configuration, CancellationToken.None);
                    Console.Error.WriteLine(healthy ? $"Production database restore rolled back safely for operation {body.DeploymentId:D}." : $"Production database restore recovery failed for operation {body.DeploymentId:D}.");
                }
            }
            catch { Console.Error.WriteLine($"Production database restore recovery failed for operation {body.DeploymentId:D}."); }
        }
        if (File.Exists(envPath)) File.Delete(envPath);
        if (File.Exists(targetEnvPath)) File.Delete(targetEnvPath);
        DeployerState.Gate.Release();
    }
}).RequireAuthorization();

app.Run();

static async Task BackupActiveProductionProjectsAsync(IConfiguration configuration, string signingKey, ILogger logger, CancellationToken cancellationToken)
{
    var releaseRoot = Path.GetFullPath(configuration["ReleaseDeployer:ProductionRoot"] ?? "/production-releases");
    if (!Directory.Exists(releaseRoot)) return;
    await DeployerState.Gate.WaitAsync(cancellationToken);
    try
    {
        await using var deploymentLock = await DistributedDeploymentLock.AcquireAsync(cancellationToken);
        foreach (var projectDirectory in Directory.EnumerateDirectories(releaseRoot).Take(1000))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!Guid.TryParseExact(Path.GetFileName(projectDirectory), "N", out var projectId)) continue;
            var currentPath = ReleaseDeployerPath.SafeChild(projectDirectory, "current.json");
            var secretsPath = ReleaseDeployerPath.SafeChild(projectDirectory, "secrets.enc.json");
            if (!File.Exists(currentPath) || !File.Exists(secretsPath)) continue;
            DeploymentCurrentPointer? pointer;
            await using (var stream = File.OpenRead(currentPath))
                pointer = await JsonSerializer.DeserializeAsync<DeploymentCurrentPointer>(stream, JsonConfig.Options, cancellationToken);
            if (pointer?.DeploymentId is not Guid deploymentId || deploymentId == Guid.Empty) continue;
            var secrets = await ReadEncryptedAsync<DeploymentSecrets>(secretsPath, signingKey, cancellationToken);
            if (secrets is null || string.IsNullOrWhiteSpace(secrets.SqlPassword)) continue;
            var source = ReleaseDeployerPath.SafeChild(projectDirectory, $"{ReleaseDeployerPath.SafeGuidSegment(deploymentId)}/source");
            var composeFile = ReleaseDeployerPath.SafeChild(source, ".aierp-deploy/compose.yml");
            if (!File.Exists(composeFile)) continue;
            var backupId = Guid.NewGuid();
            var envFile = ReleaseDeployerPath.SafeChild(Path.GetFullPath(Path.GetTempPath()), $"aierp-scheduled-backup-{ReleaseDeployerPath.SafeGuidSegment(projectId)}-{ReleaseDeployerPath.SafeGuidSegment(backupId)}.env");
            try
            {
                var separation = configuration.GetValue<bool>("Database:SeparationEnabled").ToString().ToLowerInvariant();
                var env = $"SOURCE_ROOT={source}\nPRODUCTION_PORT={secrets.Port}\nMSSQL_SA_PASSWORD={secrets.SqlPassword}\nAIERP_PLATFORM_MIGRATOR_PASSWORD={secrets.PlatformMigratorPassword}\nAIERP_PLATFORM_RUNTIME_PASSWORD={secrets.PlatformRuntimePassword}\nAUTH_SIGNING_KEY={secrets.JwtKey}\nPLUGIN_HOST_SIGNING_KEY={DerivePluginHostSigningKey(secrets.JwtKey)}\nBOOTSTRAP_EMAIL={secrets.BootstrapEmail}\nBOOTSTRAP_PASSWORD={secrets.BootstrapPassword}\nBOOTSTRAP_TENANT_NAME={secrets.TenantName}\nDATABASE_SEPARATION_ENABLED={separation}\n";
                await File.WriteAllTextAsync(envFile, env, new UTF8Encoding(false), cancellationToken);
                if (OperatingSystem.IsLinux()) File.SetUnixFileMode(envFile, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                var prefix = new[] { "compose", "--project-name", $"aierp-production-{projectId:N}", "--file", composeFile, "--env-file", envFile };
                var sqlcmd = new[] { "exec", "-T", "sqlserver", "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", secrets.SqlPassword, "-C", "-b", "-d", "master", "-Q" };
                var stopped = await RunDockerAsync(prefix.Concat(["stop", "platform-api", "ai-service", "platform-migrator"]), TimeSpan.FromMinutes(2), cancellationToken);
                if (stopped.ExitCode != 0)
                {
                    await RunDockerAsync(prefix.Concat(["start", "platform-api", "ai-service"]), TimeSpan.FromMinutes(3), CancellationToken.None);
                    throw new IOException($"Production writers could not be stopped for project {projectId:N}.");
                }
                try
                {
                    var databases = await ListAierpDatabasesAsync(prefix, sqlcmd, cancellationToken);
                    var backupRoot = ProductionBackupRoot(configuration);
                    if (databases.Count == 0 || !await BackupDatabaseSetAsync(prefix, sqlcmd, databases, projectId, backupId, backupRoot, cancellationToken))
                        throw new IOException($"No verified AIERP database set was produced for project {projectId:N}.");
                    foreach (var database in databases)
                    {
                        var stagingBackup = DatabaseBackupVolumePath(database, projectId, backupId, backupRoot);
                        var activeBackup = DatabaseBackupVolumePath(database, projectId, deploymentId, backupRoot);
                        File.Move(stagingBackup, activeBackup, overwrite: true);
                    }
                    var stagingManifest = BackupManifestPath(projectId, backupId, backupRoot);
                    var activeManifest = BackupManifestPath(projectId, deploymentId, backupRoot);
                    var manifestStagingPath = ReleaseDeployerPath.SafeChild(backupRoot, $"AIERP-{ReleaseDeployerPath.SafeGuidSegment(projectId)}-{ReleaseDeployerPath.SafeGuidSegment(backupId)}.json.tmp");
                    await File.WriteAllTextAsync(manifestStagingPath, JsonSerializer.Serialize(databases, JsonConfig.Options), new UTF8Encoding(false), cancellationToken);
                    File.Move(manifestStagingPath, activeManifest, overwrite: true);
                }
                finally
                {
                    var restarted = await RunDockerAsync(prefix.Concat(["start", "platform-api", "ai-service"]), TimeSpan.FromMinutes(3), CancellationToken.None);
                    if (restarted.ExitCode != 0) throw new IOException($"Production writers could not be restarted after backup for project {projectId:N}.");
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception exception) { logger.LogError(exception, "Scheduled production database backup failed for project {ProjectId}.", projectId); }
            finally { if (File.Exists(envFile)) File.Delete(envFile); }
        }
    }
    finally { DeployerState.Gate.Release(); }
}

static bool HasScope(ClaimsPrincipal caller, CreateStagingDeployment body, string scope) =>
    caller.FindFirstValue("deployment_id") == body.DeploymentId.ToString("D") &&
    caller.FindFirstValue("tenant_id") == body.TenantId.ToString("D") &&
    caller.FindFirstValue("project_id") == body.ProjectId.ToString("D") &&
    caller.FindFirstValue("scope") == scope;

static bool HasRestoreScope(ClaimsPrincipal caller, RestoreProductionDeployment body, string scope) =>
    caller.FindFirstValue("deployment_id") == body.DeploymentId.ToString("D") &&
    caller.FindFirstValue("tenant_id") == body.TenantId.ToString("D") &&
    caller.FindFirstValue("project_id") == body.ProjectId.ToString("D") &&
    caller.FindFirstValue("scope") == scope;


static bool IsSha256(string? value) => value is { Length: 64 } && value.All(Uri.IsHexDigit);

static void CopyDirectory(string source, string destination)
{
    ReleaseDeployerPath.AssertNoReparsePoints(source);
    ReleaseDeployerPath.AssertNoReparsePoints(destination);
    Directory.CreateDirectory(destination);
    foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
    {
        ReleaseDeployerPath.AssertNoReparsePoints(directory);
        var target = ReleaseDeployerPath.SafeChild(destination, Path.GetRelativePath(source, directory));
        Directory.CreateDirectory(target);
    }
    foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
    {
        ReleaseDeployerPath.AssertNoReparsePoints(file);
        var target = ReleaseDeployerPath.SafeChild(destination, Path.GetRelativePath(source, file));
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.Copy(file, target, overwrite: false);
    }
}

static async Task<string> HashFileAsync(string path, CancellationToken cancellationToken)
{
    await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
    return Convert.ToHexString(await SHA256.HashDataAsync(stream, cancellationToken));
}

static async Task WriteEncryptedResultAsync(string path, StagingDeploymentResult result, string signingKey, CancellationToken cancellationToken)
    => await WriteEncryptedAsync(path, result, signingKey, cancellationToken);

static async Task WriteEncryptedAsync<T>(string path, T value, string signingKey, CancellationToken cancellationToken)
{
    var key = SHA256.HashData(Encoding.UTF8.GetBytes(signingKey + "|AIERP.StagingBootstrap.v1"));
    var nonce = RandomNumberGenerator.GetBytes(12); var plain = JsonSerializer.SerializeToUtf8Bytes(value, JsonConfig.Options);
    var ciphertext = new byte[plain.Length]; var tag = new byte[16];
    using (var aes = new AesGcm(key, tag.Length)) aes.Encrypt(nonce, plain, ciphertext, tag);
    var envelope = new EncryptedResult(Convert.ToBase64String(nonce), Convert.ToBase64String(tag), Convert.ToBase64String(ciphertext));
    await File.WriteAllTextAsync(path, JsonSerializer.Serialize(envelope, JsonConfig.Options), new UTF8Encoding(false), cancellationToken);
    CryptographicOperations.ZeroMemory(plain);
}

static async Task<StagingDeploymentResult?> ReadEncryptedResultAsync(string path, string signingKey, CancellationToken cancellationToken)
    => await ReadEncryptedAsync<StagingDeploymentResult>(path, signingKey, cancellationToken);

static async Task<T?> ReadEncryptedAsync<T>(string path, string signingKey, CancellationToken cancellationToken) where T : class
{
    await using var stream = File.OpenRead(path);
    var envelope = await JsonSerializer.DeserializeAsync<EncryptedResult>(stream, JsonConfig.Options, cancellationToken);
    if (envelope is null) return null;
    var nonce = Convert.FromBase64String(envelope.Nonce); var tag = Convert.FromBase64String(envelope.Tag); var ciphertext = Convert.FromBase64String(envelope.Ciphertext);
    if (nonce.Length != 12 || tag.Length != 16 || ciphertext.Length > 16_000) throw new InvalidDataException("Dağıtım sonucu şifreli zarfı geçersiz.");
    var key = SHA256.HashData(Encoding.UTF8.GetBytes(signingKey + "|AIERP.StagingBootstrap.v1"));
    var plain = new byte[ciphertext.Length];
    using (var aes = new AesGcm(key, tag.Length)) aes.Decrypt(nonce, ciphertext, tag, plain);
    try { return JsonSerializer.Deserialize<T>(plain, JsonConfig.Options); }
    finally { CryptographicOperations.ZeroMemory(plain); }
}

static async Task ExtractVerifiedPackageAsync(string packagePath, string expectedPackageSha256, string sourceDirectory, Guid packageId, string version, string commitSha, int expectedFileCount, CancellationToken cancellationToken)
{
    // Keep one handle from package hashing through extraction. This prevents a
    // package path replacement between the hash check and ZIP parsing.
    await using var packageStream = new FileStream(packagePath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
    var packageHash = Convert.ToHexString(await SHA256.HashDataAsync(packageStream, cancellationToken));
    if (!string.Equals(packageHash, expectedPackageSha256, StringComparison.OrdinalIgnoreCase))
        throw new InvalidDataException("Sürüm paketinin SHA-256 değeri kayıtla eşleşmiyor.");
    packageStream.Position = 0;
    using var archive = new ZipArchive(packageStream, ZipArchiveMode.Read, leaveOpen: true);
    var manifestEntry = archive.GetEntry("AIERP-RELEASE.json") ?? throw new InvalidDataException("Sürüm manifesti arşivde yok.");
    ReleaseManifest? manifest;
    await using (var input = manifestEntry.Open()) manifest = await JsonSerializer.DeserializeAsync<ReleaseManifest>(input, JsonConfig.Options, cancellationToken);
    if (manifest is null || manifest.PackageId != packageId || manifest.Version != version || manifest.CommitSha != commitSha ||
        manifest.Files.Count is 0 or > 20_000 || manifest.Files.Count != expectedFileCount)
        throw new InvalidDataException("Sürüm manifesti dağıtım metadata'sıyla eşleşmiyor.");
    var expected = manifest.Files.ToDictionary(file => NormalizeArchivePath(file.Path), StringComparer.Ordinal);
    long expandedBytes = 0;
    var found = new HashSet<string>(StringComparer.Ordinal);
    foreach (var entry in archive.Entries)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (entry.FullName == "AIERP-RELEASE.json") continue;
        var relative = NormalizeArchivePath(entry.FullName);
        if (!expected.TryGetValue(relative, out var file) || !found.Add(relative)) throw new InvalidDataException("Sürüm arşivinde manifest dışı veya yinelenen dosya bulundu.");
        if (entry.Length > 16 * 1024 * 1024 || expandedBytes + entry.Length > 100 * 1024 * 1024) throw new InvalidDataException("Sürüm arşivi boyut sınırını aşıyor.");
        var unixMode = (entry.ExternalAttributes >> 16) & 0xF000;
        if (unixMode == 0xA000 || entry.Name.Length == 0) throw new InvalidDataException("Sembolik bağlantı veya geçersiz arşiv kaydı reddedildi.");
        expandedBytes += entry.Length;
        var safeRelativePath = SanitizeArchivePath(relative);
        var target = ReleaseDeployerPath.SafeChild(sourceDirectory, safeRelativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        var temporaryTarget = ReleaseDeployerPath.SafeChild(Path.GetDirectoryName(target)!, $".{Path.GetFileName(target)}.{ReleaseDeployerPath.SafeGuidSegment(Guid.NewGuid())}.tmp");
        try
        {
            using var contentHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            long copiedBytes = 0;
            await using (var input = entry.Open())
            await using (var output = new FileStream(temporaryTarget, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                var buffer = new byte[64 * 1024];
                int read;
                while ((read = await input.ReadAsync(buffer, cancellationToken)) != 0)
                {
                    copiedBytes += read;
                    if (copiedBytes > 16 * 1024 * 1024 || expandedBytes - entry.Length + copiedBytes > 100 * 1024 * 1024)
                        throw new InvalidDataException("Sürüm arşivi boyut sınırını aşıyor.");
                    contentHash.AppendData(buffer, 0, read);
                    await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
                await output.FlushAsync(cancellationToken);
            }
            if (copiedBytes != file.SizeBytes || copiedBytes != entry.Length ||
                !string.Equals(Convert.ToHexString(contentHash.GetHashAndReset()), file.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Arşiv dosyasının hash veya boyut doğrulaması başarısız.");
            File.Move(temporaryTarget, target, overwrite: false);
        }
        finally
        {
            if (File.Exists(temporaryTarget)) File.Delete(temporaryTarget);
        }
    }
    if (found.Count != expected.Count) throw new InvalidDataException("Arşiv dosyaları manifestle tam eşleşmiyor.");
}

static string NormalizeArchivePath(string path)
{
    var normalized = path.Replace('\\', '/');
    if (string.IsNullOrWhiteSpace(normalized) || normalized.StartsWith('/') || normalized.Contains(':') ||
        normalized.Split('/').Any(part => part is "" or "." or "..")) throw new InvalidDataException("Sürüm arşivi güvenli olmayan yol içeriyor.");
    return normalized;
}

static string SanitizeArchivePath(string normalizedRelativePath)
{
    var segments = normalizedRelativePath.Split('/');
    var safeSegments = segments.Select(Path.GetFileName).ToArray();
    if (safeSegments.Any(string.IsNullOrEmpty) || !segments.SequenceEqual(safeSegments, StringComparer.Ordinal))
        throw new InvalidDataException("Sürüm arşivi güvenli olmayan yol içeriyor.");
    return string.Join('/', safeSegments);
}

void WriteTrustedBuildFiles(string sourceRoot, bool production = false)
{
    var deployDirectory = ReleaseDeployerPath.SafeChild(sourceRoot, ".aierp-deploy");
    Directory.CreateDirectory(deployDirectory);
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "Platform.Api.Dockerfile"), StagingTemplates.DotnetDockerfile("src/Hosts/AIERP.Api/AIERP.Api.csproj", "AIERP.Api.dll", true, true));
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "AIService.Dockerfile"), StagingTemplates.DotnetDockerfile("src/AI/AIERP.AIService/AIERP.AIService.csproj", "AIERP.AIService.dll", true, true));
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "WorkspaceRunner.Dockerfile"), StagingTemplates.DotnetDockerfile("src/AI/AIERP.WorkspaceRunner/AIERP.WorkspaceRunner.csproj", "AIERP.WorkspaceRunner.dll", false));
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "PluginHost.Dockerfile"), StagingTemplates.DotnetDockerfile("src/Extensions/AIERP.PluginHost/AIERP.PluginHost.csproj", "AIERP.PluginHost.dll", true));
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "WorkspaceSandbox.Dockerfile"), StagingTemplates.SandboxDockerfile);
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "DevelopmentStudio.Dockerfile"), StagingTemplates.StudioDockerfile);
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "development-studio.nginx.conf"), StagingTemplates.StudioNginxConfig);
    var compose = production
        ? StagingTemplates.StagingCompose
            .Replace("Staging", "Production", StringComparison.Ordinal)
            .Replace("STAGING_PORT", "PRODUCTION_PORT", StringComparison.Ordinal)
            .Replace("sql-backups:/var/opt/mssql/backups", "aierp-production-backups:/var/opt/mssql/backups", StringComparison.Ordinal)
            .Replace("sql-backups:/backups", "aierp-production-backups:/backups", StringComparison.Ordinal)
        : StagingTemplates.StagingCompose;
    if (production)
    {
        // Match the root-level networks key independent of source checkout CRLF/LF endings.
        compose = System.Text.RegularExpressions.Regex.Replace(compose, "(?m)^  sql-backups:\\r?\\n", "");
        compose = System.Text.RegularExpressions.Regex.Replace(compose, "(?m)^networks:",
            "  aierp-production-backups:\n    external: true\n    name: aierp-production-backups\nnetworks:",
            new System.Text.RegularExpressions.RegexOptions());
    }
    if (production && (!compose.Contains("aierp-production-backups:/var/opt/mssql/backups", StringComparison.Ordinal) ||
                       !compose.Contains("aierp-production-backups:/backups", StringComparison.Ordinal) ||
                       !compose.Contains("name: aierp-production-backups", StringComparison.Ordinal)))
        throw new InvalidDataException("Production Compose yedek volume'u oluşturulamadı.");
    File.WriteAllText(ReleaseDeployerPath.SafeChild(deployDirectory, "compose.yml"), compose);
}

static async Task<bool> WaitForHealthyAsync(string[] composePrefix, IConfiguration configuration, CancellationToken cancellationToken)
{
    var timeoutSeconds = int.TryParse(configuration["ReleaseDeployer:HealthCheckTimeoutSeconds"], out var configuredTimeout)
        ? Math.Clamp(configuredTimeout, 1, 300) : 300;
    var intervalMilliseconds = int.TryParse(configuration["ReleaseDeployer:HealthCheckIntervalMilliseconds"], out var configuredInterval)
        ? Math.Clamp(configuredInterval, 10, 5_000) : 5_000;
    var deadline = DateTimeOffset.UtcNow.AddSeconds(timeoutSeconds);
    while (DateTimeOffset.UtcNow < deadline)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = await RunDockerAsync(composePrefix.Concat(["exec", "-T", "development-studio", "wget", "-q", "--spider", "http://127.0.0.1/health"]), TimeSpan.FromSeconds(10), cancellationToken);
        if (result.ExitCode == 0) return true;
        await Task.Delay(TimeSpan.FromMilliseconds(intervalMilliseconds), cancellationToken);
    }
    return false;
}

static async Task<bool> WaitForStagingProvisioningAsync(string[] composePrefix, string sqlPassword, Guid tenantId,
    IConfiguration configuration, CancellationToken cancellationToken)
{
    var timeoutSeconds = int.TryParse(configuration["ReleaseDeployer:StagingProvisioningTimeoutSeconds"], out var configuredTimeout)
        ? Math.Clamp(configuredTimeout, 1, 1_800) : 300;
    var intervalMilliseconds = int.TryParse(configuration["ReleaseDeployer:HealthCheckIntervalMilliseconds"], out var configuredInterval)
        ? Math.Clamp(configuredInterval, 10, 5_000) : 5_000;
    var sqlcmd = new[]
    {
        "exec", "-T", "sqlserver", "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", sqlPassword,
        "-C", "-b", "-d", "AIERPPlatform", "-h", "-1", "-W", "-Q", StagingProvisioningReadiness.BuildSql(tenantId)
    };
    var deadline = DateTimeOffset.UtcNow.AddSeconds(timeoutSeconds);
    while (DateTimeOffset.UtcNow < deadline)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = await RunDockerAsync(composePrefix.Concat(sqlcmd), TimeSpan.FromSeconds(15), cancellationToken);
        if (result.ExitCode == 0 && StagingProvisioningReadiness.IsReadyOutput(result.StandardOutput)) return true;
        await Task.Delay(TimeSpan.FromMilliseconds(intervalMilliseconds), cancellationToken);
    }
    return false;
}

static string ProductionBackupRoot(IConfiguration configuration) => Path.GetFullPath(configuration["ReleaseDeployer:ProductionBackupRoot"] ?? "/production-backups");
static string BackupManifestPath(Guid projectId, Guid deploymentId, string backupRoot) => ReleaseDeployerPath.SafeChild(backupRoot, $"AIERP-{ReleaseDeployerPath.SafeGuidSegment(projectId)}-{ReleaseDeployerPath.SafeGuidSegment(deploymentId)}.json");
static string DatabaseBackupPath(string database, Guid projectId, Guid deploymentId) => $"/var/opt/mssql/backups/{database}-{ReleaseDeployerPath.SafeGuidSegment(projectId)}-{ReleaseDeployerPath.SafeGuidSegment(deploymentId)}.bak";
static string DatabaseBackupVolumePath(string database, Guid projectId, Guid deploymentId, string backupRoot)
{
    if (!IsSafeAierpDatabaseName(database)) throw new InvalidDataException("Veritabanı yedek adı geçersiz.");
    return ReleaseDeployerPath.SafeChild(backupRoot, Path.GetFileName(DatabaseBackupPath(database, projectId, deploymentId)));
}

static async Task WriteProductionMigrationRollbackStateAsync(string path, ProductionMigrationRollbackState state, CancellationToken cancellationToken)
{
    var temporaryDirectory = Path.GetDirectoryName(path) ?? throw new InvalidDataException("Dağıtım durum yolu geçersiz.");
    var temporaryPath = ReleaseDeployerPath.SafeChild(temporaryDirectory, Path.GetFileName(path) + ".tmp");
    await File.WriteAllTextAsync(temporaryPath, JsonSerializer.Serialize(state, JsonConfig.Options), new UTF8Encoding(false), cancellationToken);
    File.Move(temporaryPath, path, overwrite: true);
}

static async Task<List<string>> ListAierpDatabasesAsync(IEnumerable<string> composePrefix, IEnumerable<string> sqlcmdPrefix, CancellationToken cancellationToken)
{
    var sql = "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 AND name LIKE N'AIERP%' ORDER BY name";
    var result = await RunDockerAsync(composePrefix.Concat(sqlcmdPrefix).Append(sql), TimeSpan.FromMinutes(2), cancellationToken);
    if (result.ExitCode != 0) return [];
    return result.StandardOutput.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(IsSafeAierpDatabaseName).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToList();
}

static bool IsSafeAierpDatabaseName(string name) => name == "AIERPPlatform" || name == "AIERPStudio" ||
    System.Text.RegularExpressions.Regex.IsMatch(name, "^AIERPTenant_[0-9a-fA-F]{32}$", System.Text.RegularExpressions.RegexOptions.CultureInvariant);

static async Task<List<string>?> ReadBackupManifestAsync(Guid projectId, Guid deploymentId, string backupRoot, CancellationToken cancellationToken)
{
    var path = BackupManifestPath(projectId, deploymentId, backupRoot);
    if (!File.Exists(path)) return null;
    try
    {
        await using var stream = File.OpenRead(path);
        var names = await JsonSerializer.DeserializeAsync<List<string>>(stream, JsonConfig.Options, cancellationToken);
        return names is { Count: > 0 } && names.All(IsSafeAierpDatabaseName) && names.Distinct(StringComparer.OrdinalIgnoreCase).Count() == names.Count ? names : null;
    }
    catch (JsonException) { return null; }
}

static async Task<bool> BackupDatabaseSetAsync(IEnumerable<string> composePrefix, IEnumerable<string> sqlcmdPrefix, IReadOnlyList<string> databases, Guid projectId, Guid operationId, string backupRoot, CancellationToken cancellationToken)
{
    foreach (var database in databases)
    {
        if (!IsSafeAierpDatabaseName(database)) return false;
        var volumePath = DatabaseBackupVolumePath(database, projectId, operationId, backupRoot);
        var path = DatabaseBackupPath(database, projectId, operationId);
        var sql = $"BACKUP DATABASE {SqlIdentifier(database)} TO DISK = N'{path}' WITH INIT, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'{path}' WITH CHECKSUM";
        var result = await RunDockerAsync(composePrefix.Concat(sqlcmdPrefix).Append(sql), TimeSpan.FromMinutes(15), cancellationToken);
        if (result.ExitCode != 0 || !File.Exists(volumePath)) return false;
    }
    return true;
}

static async Task<bool> VerifyDatabaseSetAsync(IEnumerable<string> composePrefix, IEnumerable<string> sqlcmdPrefix, IReadOnlyList<string> databases, Guid projectId, Guid operationId, string backupRoot, CancellationToken cancellationToken)
{
    foreach (var database in databases)
    {
        if (!IsSafeAierpDatabaseName(database)) return false;
        var volumePath = DatabaseBackupVolumePath(database, projectId, operationId, backupRoot);
        var path = DatabaseBackupPath(database, projectId, operationId);
        if (!File.Exists(volumePath)) return false;
        var result = await RunDockerAsync(composePrefix.Concat(sqlcmdPrefix).Append($"RESTORE VERIFYONLY FROM DISK = N'{path}' WITH CHECKSUM"), TimeSpan.FromMinutes(5), cancellationToken);
        if (result.ExitCode != 0) return false;
    }
    return true;
}

static async Task<bool> RestoreDatabaseSetAsync(IEnumerable<string> composePrefix, IEnumerable<string> sqlcmdPrefix, IReadOnlyList<string> databases, Guid projectId, Guid operationId, string backupRoot, CancellationToken cancellationToken)
{
    foreach (var database in databases)
    {
        if (!IsSafeAierpDatabaseName(database)) return false;
        var volumePath = DatabaseBackupVolumePath(database, projectId, operationId, backupRoot);
        var path = DatabaseBackupPath(database, projectId, operationId);
        if (!File.Exists(volumePath)) return false;
        var sql = $"IF DB_ID(N'{database}') IS NOT NULL ALTER DATABASE {SqlIdentifier(database)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; RESTORE DATABASE {SqlIdentifier(database)} FROM DISK = N'{path}' WITH REPLACE, CHECKSUM; ALTER DATABASE {SqlIdentifier(database)} SET MULTI_USER";
        var result = await RunDockerAsync(composePrefix.Concat(sqlcmdPrefix).Append(sql), TimeSpan.FromMinutes(20), cancellationToken);
        if (result.ExitCode != 0) return false;
    }
    return true;
}

static string SqlIdentifier(string identifier) => $"[{identifier.Replace("]", "]]", StringComparison.Ordinal)}]";
static string NewRuntimePassword(string suffix) => Convert.ToBase64String(RandomNumberGenerator.GetBytes(36)).Replace('+', 'A').Replace('/', 'B').TrimEnd('=') + suffix;
static string DerivePluginHostSigningKey(string apiSigningKey) => Convert.ToBase64String(
    HMACSHA256.HashData(Encoding.UTF8.GetBytes(apiSigningKey), Encoding.UTF8.GetBytes("AIERP.PluginHost.ServiceToken.v1")));

static async Task<CommandResult> RunDockerAsync(IEnumerable<string> arguments, TimeSpan timeout, CancellationToken cancellationToken)
{
    // The executable override is used by isolated release-orchestration acceptance tests.
    // Production keeps the Docker CLI default; no request data can select the executable.
    var executable = DeployerState.AllowTestDockerOverride
        ? Environment.GetEnvironmentVariable("AIERP_RELEASE_DEPLOYER_DOCKER_EXECUTABLE") : null;
    var start = new ProcessStartInfo(string.IsNullOrWhiteSpace(executable) ? "docker" : executable)
        { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
    var argumentPrefix = DeployerState.AllowTestDockerOverride
        ? Environment.GetEnvironmentVariable("AIERP_RELEASE_DEPLOYER_DOCKER_ARGUMENTS_PREFIX") : null;
    if (!string.IsNullOrWhiteSpace(argumentPrefix))
    {
        var parsedPrefix = JsonSerializer.Deserialize<string[]>(argumentPrefix, JsonConfig.Options)
            ?? throw new InvalidOperationException("Docker command argument prefix must be a JSON string array.");
        foreach (var argument in parsedPrefix) start.ArgumentList.Add(argument);
    }
    foreach (var argument in arguments) start.ArgumentList.Add(argument);
    using var process = new Process { StartInfo = start };
    process.Start();
    var stdoutTask = ReadBoundedAsync(process.StandardOutput, 32_000, cancellationToken);
    var stderrTask = ReadBoundedAsync(process.StandardError, 16_000, cancellationToken);
    using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
    timeoutSource.CancelAfter(timeout);
    try { await process.WaitForExitAsync(timeoutSource.Token); }
    catch (OperationCanceledException)
    {
        try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
        if (cancellationToken.IsCancellationRequested) throw;
        throw new OperationCanceledException("Docker command timed out.");
    }
    return new CommandResult(process.ExitCode, await stdoutTask, await stderrTask);
}

static async Task<string> ReadBoundedAsync(StreamReader reader, int maxChars, CancellationToken cancellationToken)
{
    var buffer = new char[4096]; var output = new StringBuilder(Math.Min(maxChars, 4096));
    int count;
    while ((count = await reader.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0)
        if (output.Length < maxChars) output.Append(buffer, 0, Math.Min(count, maxChars - output.Length));
    return output.ToString();
}

static class JsonConfig { public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web); }
sealed class DeployerState
{
    public static readonly SemaphoreSlim Gate = new(1, 1);
    public static bool AllowTestDockerOverride { get; set; }
}
public static class ReleaseDeployerDockerExecutionPolicy
{
    public static bool IsTestOverrideAllowed(string? environmentName) =>
        string.Equals(environmentName, "Test", StringComparison.OrdinalIgnoreCase);
}
sealed record CreateStagingDeployment(Guid DeploymentId, Guid TenantId, Guid ProjectId, Guid PackageId, Guid IdempotencyKey, Guid? ExpectedActiveDeploymentId, string PackageSha256, string CommitSha, string Version);
sealed record RestoreProductionDeployment(Guid DeploymentId, Guid TenantId, Guid ProjectId, Guid PackageId, Guid IdempotencyKey, Guid ExpectedActiveDeploymentId, Guid BackupDeploymentId, Guid TargetDeploymentId, string PackageSha256, string CommitSha, string Version);
sealed record StagingDeploymentResult(Guid DeploymentId, Guid IdempotencyKey, Guid PackageId, string PackageSha256, string CommitSha, string Url, string ProviderDeploymentId, string BootstrapEmail, string BootstrapPassword, DateTimeOffset CreatedAt, string? Version = null);
sealed record DeploymentCurrentPointer(Guid DeploymentId);
public sealed record ProductionMigrationRollbackState(Guid DeploymentId, Guid? PreviousDeploymentId, string MigrationStatus, string RollbackStatus, string? Message, DateTimeOffset UpdatedAt);
public static class ProductionMigrationRollbackPolicy
{
    public static bool ShouldRestartPreviousApplication(bool migrationMayHaveRun) => !migrationMayHaveRun;

    public static string[] FailedDeploymentCleanupArguments(string projectName, string composeFile, string envFile) =>
        ["compose", "--project-name", projectName, "--file", composeFile, "--env-file", envFile, "down", "--remove-orphans"];
}
sealed record DeploymentSecrets(string BootstrapEmail, string BootstrapPassword, string SqlPassword, string JwtKey, string TenantName, int Port,
    string? PlatformRuntimePassword = null, string? PlatformMigratorPassword = null, Guid? SyntheticStagingTenantId = null);
sealed record PackageMetadata(Guid PackageId, string FileName, string Version, string CommitSha, string PackageSha256, long SizeBytes, int FileCount, DateTimeOffset CreatedAt);
sealed record EncryptedResult(string Nonce, string Tag, string Ciphertext);
sealed record ReleaseManifest(Guid PackageId, string Version, string CommitSha, Guid TestJobId, string TestTargetPath, string TestSnapshotSha256, DateTimeOffset CreatedAt, IReadOnlyList<ReleaseManifestFile> Files);
sealed record ReleaseManifestFile(string Path, string Sha256, long SizeBytes);
sealed record CommandResult(int ExitCode, string StandardOutput, string StandardError);
