using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;

namespace AIERP.Platform.UnitTests;

public sealed class ReleaseDeployerOrchestrationAcceptanceTests
{
    private const string SigningKey = "release-deployer-isolated-acceptance-test-key-2026";
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Deployment_secrets_no_longer_store_shared_tenant_runtime_password_and_read_legacy_records()
    {
        var stagingTenantId = Guid.NewGuid();
        var current = new global::DeploymentSecrets("admin@example.invalid", "bootstrap", "sql", "jwt", "tenant", 20001,
            "platform-runtime", "platform-migrator", stagingTenantId);
        var currentJson = JsonSerializer.Serialize(current);
        Assert.DoesNotContain("DataRuntimePassword", currentJson, StringComparison.Ordinal);
        Assert.Equal(stagingTenantId, JsonSerializer.Deserialize<global::DeploymentSecrets>(currentJson)?.SyntheticStagingTenantId);

        const string legacyJson = "{\"BootstrapEmail\":\"admin@example.invalid\",\"BootstrapPassword\":\"bootstrap\",\"SqlPassword\":\"sql\",\"JwtKey\":\"jwt\",\"TenantName\":\"tenant\",\"Port\":20001,\"PlatformRuntimePassword\":\"platform-runtime\",\"DataRuntimePassword\":\"legacy-unused\",\"PlatformMigratorPassword\":\"platform-migrator\"}";
        var legacy = JsonSerializer.Deserialize<global::DeploymentSecrets>(legacyJson);
        Assert.NotNull(legacy);
        Assert.Equal("platform-runtime", legacy.PlatformRuntimePassword);
        Assert.Equal("platform-migrator", legacy.PlatformMigratorPassword);
    }

    [Fact]
    public void Staging_tenant_identity_is_distinct_and_stable_when_persisted()
    {
        var ownerTenantId = Guid.NewGuid();
        var generated = global::AIERP.ReleaseDeployer.StagingTenantIdentity.Resolve(ownerTenantId, null);
        Assert.NotEqual(Guid.Empty, generated);
        Assert.NotEqual(ownerTenantId, generated);
        Assert.Equal(generated,
            global::AIERP.ReleaseDeployer.StagingTenantIdentity.Resolve(ownerTenantId, generated));
        Assert.Throws<InvalidOperationException>(() =>
            global::AIERP.ReleaseDeployer.StagingTenantIdentity.Resolve(ownerTenantId, ownerTenantId));
        Assert.Throws<ArgumentException>(() =>
            global::AIERP.ReleaseDeployer.StagingTenantIdentity.Resolve(Guid.Empty, null));
    }

    [Fact]
    public void Staging_readiness_requires_completed_job_and_both_canonical_database_components()
    {
        var tenantId = Guid.Parse("207af7e7-d83f-41c2-88d7-cba5856f1109");
        var query = global::AIERP.ReleaseDeployer.StagingProvisioningReadiness.BuildSql(tenantId);

        Assert.Contains("AIERPTenant_207af7e7d83f41c288d7cba5856f1109", query, StringComparison.Ordinal);
        Assert.Contains("AIERPStudio_207af7e7d83f41c288d7cba5856f1109", query, StringComparison.Ordinal);
        Assert.Contains("AIStudio:207af7e7d83f41c288d7cba5856f1109", query, StringComparison.Ordinal);
        Assert.Contains("[tenant].IsActive = 1", query, StringComparison.Ordinal);
        Assert.Contains("[job].Status = 3", query, StringComparison.Ordinal);
        Assert.Contains("[job].CompletedAt IS NOT NULL", query, StringComparison.Ordinal);
        Assert.True(global::AIERP.ReleaseDeployer.StagingProvisioningReadiness.IsReadyOutput(
            "\r\nNEXORA_STAGING_PROVISIONED\r\n"));
        Assert.False(global::AIERP.ReleaseDeployer.StagingProvisioningReadiness.IsReadyOutput(
            "NEXORA_STAGING_PENDING"));
        Assert.False(global::AIERP.ReleaseDeployer.StagingProvisioningReadiness.IsReadyOutput(
            "prefix NEXORA_STAGING_PROVISIONED suffix"));
        Assert.Throws<ArgumentException>(() =>
            global::AIERP.ReleaseDeployer.StagingProvisioningReadiness.BuildSql(Guid.Empty));
    }

    [Fact]
    public void Restore_requires_the_backup_to_cover_the_exact_current_database_set()
    {
        Assert.True(global::AIERP.ReleaseDeployer.DatabaseBackupSetPolicy.MatchesCurrentSet(
            ["AIERPPlatform", "AIERPStudio", "AIERPTenant_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
            ["AIERPTenant_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "AIERPStudio", "AIERPPlatform"]));
        Assert.False(global::AIERP.ReleaseDeployer.DatabaseBackupSetPolicy.MatchesCurrentSet(
            ["AIERPPlatform", "AIERPStudio", "AIERPTenant_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "AIERPTenant_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
            ["AIERPPlatform", "AIERPStudio", "AIERPTenant_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]));
        Assert.False(global::AIERP.ReleaseDeployer.DatabaseBackupSetPolicy.MatchesCurrentSet(
            ["AIERPPlatform", "AIERPStudio"], ["AIERPPlatform"]));
        Assert.False(global::AIERP.ReleaseDeployer.DatabaseBackupSetPolicy.MatchesCurrentSet([], ["AIERPPlatform"]));
    }

    [Fact]
    public void Safe_child_rejects_traversal_and_reparse_point_ancestors()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-deployer-path-{Guid.NewGuid():N}");
        var outside = Path.Combine(Path.GetTempPath(), $"aierp-deployer-outside-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(outside);
        try
        {
            Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(root, "../outside/file.txt"));
            var link = Path.Combine(root, "linked");
            try { Directory.CreateSymbolicLink(link, outside); }
            catch (Exception exception) when (exception is UnauthorizedAccessException or PlatformNotSupportedException or IOException)
            {
                return; // Windows configurations without symlink privileges cannot exercise this filesystem case.
            }

            Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(root, "linked/payload.txt"));
            Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(link, "payload.txt"));
        }
        finally
        {
            try { Directory.Delete(root, recursive: true); } catch (IOException) { }
            try { Directory.Delete(outside, recursive: true); } catch (IOException) { }
        }
    }

    [Fact]
    public void Safe_guid_segment_is_a_single_lowercase_hex_filename_component()
    {
        var id = Guid.NewGuid();
        var segment = global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeGuidSegment(id);

        Assert.Equal(id.ToString("N"), segment);
        Assert.Matches("^[0-9a-f]{32}$", segment);
        Assert.DoesNotContain('/', segment);
        Assert.DoesNotContain('\\', segment);
        Assert.DoesNotContain(':', segment);
    }

    [Fact]
    public void Safe_child_rejects_database_backup_and_manifest_links_that_target_another_file()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-deployer-backups-{Guid.NewGuid():N}");
        var outside = Path.Combine(Path.GetTempPath(), $"aierp-deployer-backup-target-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        File.WriteAllText(outside, "preserve");
        var projectId = Guid.NewGuid();
        var deploymentId = Guid.NewGuid();
        var names = new[]
        {
            $"AIERP-{projectId:N}-{deploymentId:N}.json",
            $"AIERP-{projectId:N}-{deploymentId:N}.json.tmp",
            $"AIERPPlatform-{projectId:N}-{deploymentId:N}.bak"
        };
        try
        {
            foreach (var name in names)
            {
                try { File.CreateSymbolicLink(Path.Combine(root, name), outside); }
                catch (Exception exception) when (exception is UnauthorizedAccessException or PlatformNotSupportedException or IOException)
                { return; } // Windows installations without symlink privileges cannot exercise this filesystem case.
                Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(root, name));
            }
            Assert.Equal("preserve", File.ReadAllText(outside));
        }
        finally
        {
            try { Directory.Delete(root, recursive: true); } catch (IOException) { }
            try { File.Delete(outside); } catch (IOException) { }
        }
    }
    [Fact]
    public void Safe_child_rejects_windows_trailing_dot_and_space_aliases()
    {
        if (!OperatingSystem.IsWindows()) return;

        var root = Path.Combine(Path.GetTempPath(), $"aierp-deployer-alias-{Guid.NewGuid():N}");
        Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(root, "release./current.json"));
        Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(root, "release /current.json"));
    }

    [Fact]
    public void Safe_child_rejects_windows_device_name_aliases()
    {
        if (!OperatingSystem.IsWindows()) return;

        var root = Path.Combine(Path.GetTempPath(), $"aierp-deployer-devices-{Guid.NewGuid():N}");
        foreach (var name in new[] { "CON", "nul.txt", "PRN.log", "AUX.data", "COM1.bin", "COM9", "COM¹.txt", "LPT3.csv", "LPT²", "CONIN$.txt", "CONOUT$" })
            Assert.Throws<InvalidDataException>(() => global::AIERP.ReleaseDeployer.ReleaseDeployerPath.SafeChild(root, $"packages/{name}"));
    }

    [Fact]
    public async Task Deployment_lock_rejects_reparse_point_lock_files()
    {
        var root = Path.Combine(Path.GetTempPath(), "nexora-release-deployer-tests", Environment.ProcessId.ToString());
        var outside = Path.Combine(Path.GetTempPath(), $"aierp-deployer-lock-outside-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(outside, string.Empty);
        try
        {
            try { File.CreateSymbolicLink(Path.Combine(root, "deployment.lock"), outside); }
            catch (Exception exception) when (exception is UnauthorizedAccessException or PlatformNotSupportedException or IOException)
            {
                return; // Windows configurations without symlink privileges cannot exercise this filesystem case.
            }

            await Assert.ThrowsAsync<InvalidDataException>(() =>
                global::AIERP.ReleaseDeployer.DistributedDeploymentLock.AcquireForTestAsync(CancellationToken.None));
            Assert.Equal(string.Empty, await File.ReadAllTextAsync(outside));
        }
        finally
        {
            try { Directory.Delete(root, recursive: true); } catch (IOException) { }
            try { File.Delete(outside); } catch (IOException) { }
        }
    }

    [Fact]
    public async Task Actual_deployer_api_handles_compose_failures_without_touching_external_docker_or_volumes()
    {
        Assert.False(global::ReleaseDeployerDockerExecutionPolicy.IsTestOverrideAllowed("Production"));
        Assert.False(global::ReleaseDeployerDockerExecutionPolicy.IsTestOverrideAllowed("Development"));
        Assert.True(global::ReleaseDeployerDockerExecutionPolicy.IsTestOverrideAllowed("Test"));
        Assert.True(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.CanUseUnsafeAcceptanceFixture("Test", true, true));
        Assert.False(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.CanUseUnsafeAcceptanceFixture("Staging", true, true));
        Assert.False(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.CanUseUnsafeAcceptanceFixture("Production", true, true));
        Assert.False(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.CanUseUnsafeAcceptanceFixture("Test", true, false));
        Assert.False(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.IsEnabled(false, false, "complete-looking-compose"));
        Assert.False(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.IsEnabled(true, false,
            global::StagingTemplates.StagingCompose));
        Assert.False(global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.IsEnabled(true, true,
            global::StagingTemplates.StagingCompose));
        Assert.DoesNotContain("tenant-provisioning-worker:",
            global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.MissingRequirements(global::StagingTemplates.StagingCompose));
        Assert.DoesNotContain("forbidden:aierp_data_runtime",
            global::AIERP.ReleaseDeployer.TenantSqlVaultStagingPolicy.MissingRequirements(global::StagingTemplates.StagingCompose));
        Assert.Contains("ConnectionStrings__Tenant: Server=sqlserver,1433;Database=AIERPPlatform;Encrypt=True;TrustServerCertificate=True",
            global::StagingTemplates.StagingCompose);
        Assert.Contains("ConnectionStrings__AIStudio: Server=sqlserver,1433;Database=AIERPStudio;Encrypt=True;TrustServerCertificate=True",
            global::StagingTemplates.StagingCompose);
        Assert.DoesNotContain("AIERP_DATA_RUNTIME_PASSWORD", global::StagingTemplates.StagingCompose);
        Assert.Contains("Vault__TenantSqlCredentialReader__RoleIdFile: /run/secrets/vault_tenant_sql_reader_role_id",
            global::StagingTemplates.StagingCompose);
        Assert.Contains("Vault__TenantSqlCredentialWriter__SecretIdFile: /run/provisioning-secrets/vault_tenant_sql_writer_secret_id",
            global::StagingTemplates.StagingCompose);
        Assert.Contains("file: ${TENANT_PROVISIONER_SQL_CONNECTION_FILE:?Set TENANT_PROVISIONER_SQL_CONNECTION_FILE}",
            global::StagingTemplates.StagingCompose);
        var stagingCompose = global::StagingTemplates.StagingCompose.Replace("\r\n", "\n", StringComparison.Ordinal);
        var workerStart = stagingCompose.IndexOf("\n  tenant-provisioning-worker:", StringComparison.Ordinal) + 1;
        Assert.True(workerStart > 0);
        var workerEnd = stagingCompose.IndexOf("\n  tenant-provisioning-secrets-init:\n    image:", workerStart, StringComparison.Ordinal);
        Assert.True(workerEnd > workerStart);
        var workerSection = stagingCompose[workerStart..workerEnd];
        Assert.Contains("ConnectionStrings__ProvisioningFile: /run/provisioning-secrets/tenant_provisioning_sql_connection", workerSection);
        Assert.Contains("Vault__TenantSqlCredentialWriter__RoleIdFile: /run/provisioning-secrets/vault_tenant_sql_writer_role_id", workerSection);
        Assert.Contains("tenant-provisioning-secrets:/run/provisioning-secrets:ro", workerSection);
        Assert.Contains("tenant-provisioning-secrets-init:", workerSection);
        Assert.Contains("condition: service_completed_successfully", workerSection);
        Assert.DoesNotContain("    secrets:", workerSection, StringComparison.Ordinal);
        Assert.DoesNotContain("ConnectionStrings__ProvisioningFile: /run/secrets/", workerSection, StringComparison.Ordinal);
        var secretInitEnd = stagingCompose.IndexOf("\n  workspace-runner:\n    build:", workerEnd, StringComparison.Ordinal);
        Assert.True(secretInitEnd > workerEnd);
        var secretInitSection = stagingCompose[workerEnd..secretInitEnd];
        Assert.Contains("test -s \"/run/secrets/$$name\"", secretInitSection, StringComparison.Ordinal);
        Assert.Contains("cp \"/run/secrets/$$name\" \"/prepared/$$name\"", secretInitSection, StringComparison.Ordinal);
        Assert.Contains("chown 1654:1654 \"/prepared/$$name\"", secretInitSection, StringComparison.Ordinal);
        Assert.Contains("chmod 0440 \"/prepared/$$name\"", secretInitSection, StringComparison.Ordinal);
        Assert.Contains("chmod 0550 /prepared", secretInitSection, StringComparison.Ordinal);
        Assert.Contains("network_mode: none", secretInitSection, StringComparison.Ordinal);
        Assert.Contains("cap_add: [CHOWN, DAC_OVERRIDE, FOWNER]", secretInitSection, StringComparison.Ordinal);
        var testRoot = Path.Combine(Path.GetTempPath(), $"aierp-deployer-acceptance-{Guid.NewGuid():N}");
        Directory.CreateDirectory(testRoot);
        var fakeLog = Path.Combine(testRoot, "docker-arguments.log");
        var modeFile = Path.Combine(testRoot, "fake-docker-mode.txt");
        await File.WriteAllTextAsync(fakeLog, string.Empty);
        await File.WriteAllTextAsync(modeFile, "success");
        Directory.CreateDirectory(Path.Combine(testRoot, "production-backups"));
        var deployer = StartDeployer(testRoot, fakeLog, modeFile);
        try
        {
            using var client = await ConnectAsync(deployer.Process, deployer.Port);

            foreach (var scenario in new[]
            {
                new Scenario("staging-vault-preflight", "success", "staging", HttpStatusCode.ServiceUnavailable),
                new Scenario("production-vault-preflight", "success", "production", HttpStatusCode.ServiceUnavailable)
            })
            {
                await File.WriteAllTextAsync(modeFile, scenario.FailureMode);
                await File.WriteAllTextAsync(Path.Combine(testRoot, "fake-effects.log"), string.Empty);
                var deployment = await PreparePackageAsync(testRoot, scenario.Name);
                using var request = new HttpRequestMessage(HttpMethod.Post,
                    scenario.Environment == "staging" ? "/internal/deployments/staging" : "/internal/deployments/production")
                {
                    Content = JsonContent.Create(deployment.Body, options: WebJson)
                };
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateToken(deployment.Body, scenario.Environment));
                using var response = await client.SendAsync(request);
                var responseText = await response.Content.ReadAsStringAsync();
                Assert.True(response.StatusCode == scenario.ExpectedStatus,
                    $"{scenario.Name}: expected {(int)scenario.ExpectedStatus}, got {(int)response.StatusCode}: {responseText}; fake effects: {string.Join(',', File.Exists(Path.Combine(testRoot, "fake-effects.log")) ? await File.ReadAllLinesAsync(Path.Combine(testRoot, "fake-effects.log")) : [])}");
                var releaseRoot = Path.Combine(testRoot, scenario.Environment == "staging" ? "staging-releases" : "production-releases");
                Assert.False(Directory.Exists(releaseRoot), $"{scenario.Name}: preflight must run before release directories are created.");
                Assert.Empty(await File.ReadAllLinesAsync(Path.Combine(testRoot, "fake-effects.log")));
            }

            Assert.Empty(await File.ReadAllLinesAsync(fakeLog));
        }
        finally
        {
            try { if (!deployer.Process.HasExited) deployer.Process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            try { await deployer.Process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); } catch (TimeoutException) { }
            deployer.Process.Dispose();
            // The target is a unique test-owned temporary directory created above.
            if (Directory.Exists(testRoot)) Directory.Delete(testRoot, recursive: true);
        }
    }

    [Fact]
    public async Task Test_only_unsafe_compose_fixture_preserves_orchestration_failure_cleanup_and_migration_rollback_coverage()
    {
        var testRoot = Path.Combine(Path.GetTempPath(), $"aierp-deployer-orchestration-{Guid.NewGuid():N}");
        Directory.CreateDirectory(testRoot);
        var fakeLog = Path.Combine(testRoot, "docker-arguments.log");
        var modeFile = Path.Combine(testRoot, "fake-docker-mode.txt");
        await File.WriteAllTextAsync(fakeLog, string.Empty);
        await File.WriteAllTextAsync(modeFile, "success");
        Directory.CreateDirectory(Path.Combine(testRoot, "production-backups"));
        var deployer = StartDeployer(testRoot, fakeLog, modeFile, allowUnsafeComposeForAcceptance: true);
        try
        {
            using var client = await ConnectAsync(deployer.Process, deployer.Port);
            foreach (var scenario in new[]
            {
                new Scenario("staging-config-failure", "config", "staging", HttpStatusCode.UnprocessableEntity),
                new Scenario("staging-start-failure", "up", "staging", HttpStatusCode.BadGateway),
                new Scenario("staging-health-failure", "health", "staging", HttpStatusCode.GatewayTimeout),
                new Scenario("staging-provisioning-failure", "provisioning", "staging", HttpStatusCode.GatewayTimeout),
                new Scenario("staging-success", "success", "staging", HttpStatusCode.OK),
                new Scenario("production-config-failure", "config", "production", HttpStatusCode.UnprocessableEntity),
                new Scenario("production-start-failure", "up", "production", HttpStatusCode.BadGateway, true),
                new Scenario("production-health-failure", "health", "production", HttpStatusCode.GatewayTimeout, true),
                new Scenario("production-success", "success", "production", HttpStatusCode.OK)
            })
            {
                await File.WriteAllTextAsync(modeFile, scenario.FailureMode);
                await File.WriteAllTextAsync(Path.Combine(testRoot, "fake-effects.log"), string.Empty);
                var deployment = await PreparePackageAsync(testRoot, scenario.Name);
                if (scenario.PreviousActive)
                {
                    var previous = Guid.NewGuid();
                    deployment = deployment with { Body = deployment.Body with { ExpectedActiveDeploymentId = previous } };
                    var activeDirectory = Path.Combine(testRoot, "production-releases", deployment.Body.ProjectId.ToString("N"));
                    Directory.CreateDirectory(activeDirectory);
                    await File.WriteAllTextAsync(Path.Combine(activeDirectory, "current.json"), JsonSerializer.Serialize(new { deploymentId = previous }, WebJson));
                }
                using var request = new HttpRequestMessage(HttpMethod.Post,
                    scenario.Environment == "staging" ? "/internal/deployments/staging" : "/internal/deployments/production")
                {
                    Content = JsonContent.Create(deployment.Body, options: WebJson)
                };
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateToken(deployment.Body, scenario.Environment));
                using var response = await client.SendAsync(request);
                var responseText = await response.Content.ReadAsStringAsync();
                Assert.True(response.StatusCode == scenario.ExpectedStatus,
                    $"{scenario.Name}: expected {(int)scenario.ExpectedStatus}, got {(int)response.StatusCode}: {responseText}; fake effects: {string.Join(',', File.Exists(Path.Combine(testRoot, "fake-effects.log")) ? await File.ReadAllLinesAsync(Path.Combine(testRoot, "fake-effects.log")) : [])}");

                var releaseRoot = Path.Combine(testRoot, scenario.Environment == "staging" ? "staging-releases" : "production-releases");
                var projectRoot = Path.Combine(releaseRoot, deployment.Body.ProjectId.ToString("N"));
                var currentPointer = Path.Combine(projectRoot, "current.json");
                if (scenario.FailureMode == "success")
                {
                    Assert.True(File.Exists(currentPointer), $"{scenario.Name}: healthy deployment should become current.");
                    using var pointer = JsonDocument.Parse(await File.ReadAllTextAsync(currentPointer));
                    Assert.Equal(deployment.Body.DeploymentId, pointer.RootElement.GetProperty("deploymentId").GetGuid());
                    if (scenario.Environment == "production")
                    {
                        var compose = await File.ReadAllTextAsync(Path.Combine(projectRoot, deployment.Body.DeploymentId.ToString("N"), "source", ".aierp-deploy", "compose.yml"));
                        Assert.Contains("platform-migrator: { condition: service_completed_successfully }", compose, StringComparison.Ordinal);
                        Assert.Contains("command: [\"--migrate-platform-only\"]", compose, StringComparison.Ordinal);
                        Assert.Contains("User Id=aierp_platform_migrator;Password=${AIERP_PLATFORM_MIGRATOR_PASSWORD:?Set AIERP_PLATFORM_MIGRATOR_PASSWORD}", compose, StringComparison.Ordinal);
                        Assert.DoesNotContain("--migrate-only", compose, StringComparison.Ordinal);
                        Assert.DoesNotContain("User Id=sa;Password=${MSSQL_SA_PASSWORD}", compose, StringComparison.Ordinal);
                        Assert.Contains("aierp-production-backups:/var/opt/mssql/backups", compose, StringComparison.Ordinal);
                        Assert.Contains("name: aierp-production-backups", compose, StringComparison.Ordinal);
                        Assert.DoesNotContain("sql-backups:", compose, StringComparison.Ordinal);
                    }
                }
                else
                {
                    Assert.Equal(scenario.PreviousActive, File.Exists(currentPointer));
                    if (scenario.PreviousActive && scenario.Environment == "production" && scenario.FailureMode is "up" or "health")
                    {
                        var statePath = Path.Combine(projectRoot, deployment.Body.DeploymentId.ToString("N"), "migration-rollback.json");
                        Assert.True(File.Exists(statePath), $"{scenario.Name}: failure after Compose up must leave a migration safety record.");
                        using var state = JsonDocument.Parse(await File.ReadAllTextAsync(statePath));
                        Assert.Equal(scenario.FailureMode == "up" ? "may_have_run" : "completed", state.RootElement.GetProperty("migrationStatus").GetString());
                        Assert.Equal("blocked_migration_may_have_run", state.RootElement.GetProperty("rollbackStatus").GetString());
                    }
                    if (scenario.Name == "production-start-failure")
                    {
                        var statePath = Path.Combine(projectRoot, deployment.Body.DeploymentId.ToString("N"), "migration-rollback.json");
                        var savedState = await File.ReadAllTextAsync(statePath);
                        var dockerCallsBeforeRetry = await File.ReadAllLinesAsync(fakeLog);
                        await File.WriteAllTextAsync(modeFile, "success");
                        using var retry = new HttpRequestMessage(HttpMethod.Post, "/internal/deployments/production")
                        {
                            Content = JsonContent.Create(deployment.Body, options: WebJson)
                        };
                        retry.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateToken(deployment.Body, "production"));
                        using var retryResponse = await client.SendAsync(retry);
                        Assert.Equal(HttpStatusCode.Conflict, retryResponse.StatusCode);
                        Assert.Equal(savedState, await File.ReadAllTextAsync(statePath));
                        Assert.Equal(dockerCallsBeforeRetry, await File.ReadAllLinesAsync(fakeLog));
                    }
                }
            }

            var commands = await File.ReadAllLinesAsync(fakeLog);
            var loggedCommandOutput = string.Join(Environment.NewLine, commands);
            Assert.Contains(commands, command => command.Contains("config -q", StringComparison.Ordinal));
            Assert.Contains(commands, command => command.Contains(" up --detach --build --remove-orphans", StringComparison.Ordinal));
            Assert.Contains(commands, command => command.Contains("exec -T development-studio wget", StringComparison.Ordinal));
            Assert.Contains("exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd", loggedCommandOutput, StringComparison.Ordinal);
            Assert.Contains("NEXORA_STAGING_PROVISIONED", loggedCommandOutput, StringComparison.Ordinal);
            Assert.Contains(commands, command => command.Contains("aierp-staging-", StringComparison.Ordinal) && command.Contains("down --volumes --remove-orphans", StringComparison.Ordinal));
            Assert.Contains(commands, command => command.Contains("aierp-production-", StringComparison.Ordinal) && command.Contains("down --remove-orphans", StringComparison.Ordinal));
            Assert.DoesNotContain(commands, command => command.Contains("aierp-production-", StringComparison.Ordinal) && command.Contains("down --volumes", StringComparison.Ordinal));
            Assert.All(commands, command => Assert.Contains("compose", command, StringComparison.Ordinal));
        }
        finally
        {
            try { if (!deployer.Process.HasExited) deployer.Process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            try { await deployer.Process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); } catch (TimeoutException) { }
            deployer.Process.Dispose();
            if (Directory.Exists(testRoot)) Directory.Delete(testRoot, recursive: true);
        }
    }

    private static DeployerProcess StartDeployer(string root, string fakeLog, string modeFile, bool allowUnsafeComposeForAcceptance = false)
    {
        var assembly = typeof(global::ProductionMigrationRollbackPolicy).Assembly.Location;
        var runtimeConfig = Path.ChangeExtension(assembly, ".runtimeconfig.json");
        Assert.True(File.Exists(runtimeConfig), $"ReleaseDeployer runtime config was not copied beside {assembly}.");
        var port = GetFreePort();
        var fakeDockerPath = Path.Combine(root, OperatingSystem.IsWindows() ? "fake-docker.ps1" : "fake-docker.sh");
        var fakeDockerExecutable = OperatingSystem.IsWindows() ? FindPowerShell() : "/bin/sh";
        File.WriteAllText(fakeDockerPath, OperatingSystem.IsWindows() ? FakeDockerPowerShellScript : FakeDockerShellScript, new UTF8Encoding(false));
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(fakeDockerPath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var start = new ProcessStartInfo("dotnet")
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = root
        };
        start.ArgumentList.Add(assembly);
        start.Environment["ASPNETCORE_URLS"] = $"http://127.0.0.1:{port}";
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Test";
        start.Environment["Authentication__SigningKey"] = SigningKey;
        start.Environment["Authentication__Issuer"] = "AIERP";
        start.Environment["Authentication__Audience"] = "AIERP.ReleaseDeployer";
        start.Environment["ReleaseDeployer__PackageRoot"] = Path.Combine(root, "packages");
        start.Environment["ReleaseDeployer__ReleaseRoot"] = Path.Combine(root, "staging-releases");
        start.Environment["ReleaseDeployer__ProductionRoot"] = Path.Combine(root, "production-releases");
        start.Environment["ReleaseDeployer__ProductionBackupRoot"] = Path.Combine(root, "production-backups");
        start.Environment["ReleaseDeployer__AllowUnsafeComposeForAcceptanceTests"] = allowUnsafeComposeForAcceptance ? "true" : "false";
        start.Environment["ReleaseDeployer__HealthCheckTimeoutSeconds"] = "1";
        start.Environment["ReleaseDeployer__HealthCheckIntervalMilliseconds"] = "10";
        start.Environment["ReleaseDeployer__StagingProvisioningTimeoutSeconds"] = "1";
        start.Environment["Database__SeparationEnabled"] = "true";
        start.Environment["AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_LOG"] = fakeLog;
        start.Environment["AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_MODE_FILE"] = modeFile;
        start.Environment["AIERP_RELEASE_DEPLOYER_FAKE_BACKUP_ROOT"] = Path.Combine(root, "production-backups");
        start.Environment["AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG"] = Path.Combine(root, "fake-effects.log");
        start.Environment["AIERP_RELEASE_DEPLOYER_DOCKER_EXECUTABLE"] = fakeDockerExecutable;
        start.Environment["AIERP_RELEASE_DEPLOYER_DOCKER_ARGUMENTS_PREFIX"] = JsonSerializer.Serialize(OperatingSystem.IsWindows()
            ? new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fakeDockerPath }
            : new[] { fakeDockerPath });
        var process = Process.Start(start) ?? throw new InvalidOperationException("ReleaseDeployer child process could not be started.");
        _ = process.StandardOutput.ReadToEndAsync();
        _ = process.StandardError.ReadToEndAsync();
        return new DeployerProcess(process, port);
    }

    private static async Task<HttpClient> ConnectAsync(Process deployer, int port)
    {
        var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
        for (var attempt = 0; attempt < 100; attempt++)
        {
            if (deployer.HasExited) throw new InvalidOperationException("ReleaseDeployer exited before its health endpoint became available.");
            try
            {
                using var response = await client.GetAsync("/health");
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
                    Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
                    Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
                    return client;
                }
            }
            catch (HttpRequestException) { }
            await Task.Delay(100);
        }
        client.Dispose();
        throw new TimeoutException("ReleaseDeployer health endpoint did not start within 10 seconds.");
    }

    private static async Task<PreparedDeployment> PreparePackageAsync(string root, string name)
    {
        var packageId = Guid.NewGuid();
        var deploymentId = Guid.NewGuid();
        var tenantId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var idempotencyKey = Guid.NewGuid();
        const string commit = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        const string version = "1.0.0";
        var packageRoot = Path.Combine(root, "packages");
        Directory.CreateDirectory(packageRoot);
        var packagePath = Path.Combine(packageRoot, $"{packageId:N}.zip");
        var fileContent = Encoding.UTF8.GetBytes($"isolated acceptance package: {name}");
        var manifest = new
        {
            packageId,
            version,
            commitSha = commit,
            testJobId = Guid.NewGuid(),
            testTargetPath = "tests/UnitTests/AIERP.Platform.UnitTests",
            testSnapshotSha256 = new string('a', 64),
            createdAt = DateTimeOffset.UtcNow,
            files = new[] { new { path = "README.md", sha256 = Convert.ToHexString(SHA256.HashData(fileContent)), sizeBytes = fileContent.LongLength } }
        };
        await using (var file = new FileStream(packagePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var archive = new ZipArchive(file, ZipArchiveMode.Create))
        {
            var manifestEntry = archive.CreateEntry("AIERP-RELEASE.json");
            await using (var output = manifestEntry.Open()) await JsonSerializer.SerializeAsync(output, manifest, WebJson);
            var contentEntry = archive.CreateEntry("README.md");
            await using (var output = contentEntry.Open()) await output.WriteAsync(fileContent);
        }
        var bytes = await File.ReadAllBytesAsync(packagePath);
        var hash = Convert.ToHexString(SHA256.HashData(bytes));
        var metadata = new { packageId, fileName = $"{packageId:N}.zip", version, commitSha = commit, packageSha256 = hash, sizeBytes = bytes.LongLength, fileCount = 1, createdAt = DateTimeOffset.UtcNow };
        await File.WriteAllTextAsync(Path.Combine(packageRoot, $"{packageId:N}.json"), JsonSerializer.Serialize(metadata, WebJson));
        var body = new DeploymentRequest(deploymentId, tenantId, projectId, packageId, idempotencyKey, null, hash, commit, version);
        return new PreparedDeployment(body);
    }

    private static string CreateToken(DeploymentRequest body, string environment)
    {
        var scope = environment == "staging" ? "release.staging.deploy" : "release.production.deploy";
        var claims = new[]
        {
            new Claim("deployment_id", body.DeploymentId.ToString("D")),
            new Claim("tenant_id", body.TenantId.ToString("D")),
            new Claim("project_id", body.ProjectId.ToString("D")),
            new Claim("scope", scope)
        };
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken("AIERP", "AIERP.ReleaseDeployer", claims, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10), credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static int GetFreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    private static string FindPowerShell()
    {
        foreach (var candidate in new[] { "pwsh.exe", "powershell.exe" })
        {
            var path = Environment.GetEnvironmentVariable("PATH")?.Split(Path.PathSeparator)
                .Select(directory => Path.Combine(directory, candidate)).FirstOrDefault(File.Exists);
            if (path is not null) return path;
        }
        throw new InvalidOperationException("PowerShell was not found for the isolated fake Docker CLI.");
    }

    private const string FakeDockerPowerShellScript = """
        $arguments = @($args)
        Add-Content -LiteralPath $env:AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_LOG -Value (($arguments -join ' ') -replace '[\r\n]+', ' ')
        $mode = Get-Content -LiteralPath $env:AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_MODE_FILE -Raw
        $queryIndex = [Array]::IndexOf($arguments, '-Q')
        if ($queryIndex -ge 0 -and $queryIndex + 1 -lt $arguments.Length) {
            $query = $arguments[$queryIndex + 1]
            if ($query.Contains('SELECT name FROM sys.databases')) { Add-Content $env:AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG 'database-list'; [Console]::Out.WriteLine('AIERPPlatform') }
            if ($query.Contains('NEXORA_STAGING_PROVISIONED')) {
                if ($mode -eq 'provisioning') { [Console]::Out.WriteLine('NEXORA_STAGING_PENDING') }
                else { [Console]::Out.WriteLine('NEXORA_STAGING_PROVISIONED') }
            }
            if ($query.Contains('BACKUP DATABASE')) {
                Add-Content $env:AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG 'backup-query'
                $match = [Regex]::Match($query, 'AIERPPlatform-[0-9a-fA-F]{32}-[0-9a-fA-F]{32}\.bak')
                if ($match.Success) {
                    New-Item -ItemType Directory -Force -Path $env:AIERP_RELEASE_DEPLOYER_FAKE_BACKUP_ROOT | Out-Null
                    Set-Content -LiteralPath (Join-Path $env:AIERP_RELEASE_DEPLOYER_FAKE_BACKUP_ROOT $match.Value) -Value 'fake verified backup'
                    Add-Content $env:AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG 'backup-created'
                }
            }
        }
        if ($mode -eq 'config' -and $arguments -contains 'config') { exit 1 }
        if ($mode -eq 'up' -and $arguments -contains 'up') { exit 1 }
        if ($mode -eq 'health' -and $arguments -contains 'exec' -and $arguments -contains 'development-studio') { exit 1 }
        exit 0
        """;

    private const string FakeDockerShellScript = """
        arguments=$(printf '%s' "$*" | tr '\r\n' '  ')
        printf '%s\n' "$arguments" >> "$AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_LOG"
        mode=$(cat "$AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_MODE_FILE")
        query_index=0
        for argument in "$@"; do
          if [ "$query_index" -eq 1 ]; then
            case "$argument" in
              *"SELECT name FROM sys.databases"*) printf '%s\n' "AIERPPlatform"; printf '%s\n' 'database-list' >> "$AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG" ;;
              *"NEXORA_STAGING_PROVISIONED"*) if [ "$mode" = "provisioning" ]; then printf '%s\n' 'NEXORA_STAGING_PENDING'; else printf '%s\n' 'NEXORA_STAGING_PROVISIONED'; fi ;;
              *"BACKUP DATABASE"*) backup_path=${argument#*DISK = N?}; backup_path=${backup_path%%\'*}; backup_file=${backup_path##*/}; if [ -n "$backup_file" ]; then mkdir -p "$AIERP_RELEASE_DEPLOYER_FAKE_BACKUP_ROOT"; printf 'fake verified backup' > "$AIERP_RELEASE_DEPLOYER_FAKE_BACKUP_ROOT/$backup_file"; printf '%s\n' 'backup-created' >> "$AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG"; fi ;;
            esac
            break
          fi
          if [ "$argument" = "-Q" ]; then query_index=1; fi
        done
        has_exec=0
        for argument in "$@"; do
          if [ "$mode" = "config" ] && [ "$argument" = "config" ]; then exit 1; fi
          if [ "$mode" = "up" ] && [ "$argument" = "up" ]; then exit 1; fi
          if [ "$argument" = "exec" ]; then has_exec=1; fi
          if [ "$mode" = "health" ] && [ "$has_exec" -eq 1 ] && [ "$argument" = "development-studio" ]; then exit 1; fi
        done
        exit 0
        """;

    private sealed record Scenario(string Name, string FailureMode, string Environment, HttpStatusCode ExpectedStatus, bool PreviousActive = false);
    private sealed record DeployerProcess(Process Process, int Port);
    private sealed record PreparedDeployment(DeploymentRequest Body);
    private sealed record DeploymentRequest(Guid DeploymentId, Guid TenantId, Guid ProjectId, Guid PackageId, Guid IdempotencyKey,
        Guid? ExpectedActiveDeploymentId, string PackageSha256, string CommitSha, string Version);
}
