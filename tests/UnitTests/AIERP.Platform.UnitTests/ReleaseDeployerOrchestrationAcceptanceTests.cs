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
        var testRoot = Path.Combine(Path.GetTempPath(), $"aierp-deployer-acceptance-{Guid.NewGuid():N}");
        Directory.CreateDirectory(testRoot);
        var fakeLog = Path.Combine(testRoot, "docker-arguments.log");
        var modeFile = Path.Combine(testRoot, "fake-docker-mode.txt");
        await File.WriteAllTextAsync(modeFile, "success");
            Directory.CreateDirectory(Path.Combine(testRoot, "production-backups"));
        var deployer = StartDeployer(testRoot, fakeLog, modeFile);
        try
        {
            using var client = await ConnectAsync(deployer.Process, deployer.Port);

            foreach (var scenario in new[]
            {
                new Scenario("staging-config-failure", "config", "staging", HttpStatusCode.UnprocessableEntity),
                new Scenario("staging-start-failure", "up", "staging", HttpStatusCode.BadGateway),
                new Scenario("staging-health-failure", "health", "staging", HttpStatusCode.GatewayTimeout),
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
                    var pointer = JsonDocument.Parse(await File.ReadAllTextAsync(currentPointer));
                    Assert.Equal(deployment.Body.DeploymentId, pointer.RootElement.GetProperty("deploymentId").GetGuid());
                    if (scenario.Environment == "production")
                    {
                        var compose = await File.ReadAllTextAsync(Path.Combine(projectRoot, deployment.Body.DeploymentId.ToString("N"), "source", ".aierp-deploy", "compose.yml"));
                        Assert.Contains("platform-migrator: { condition: service_completed_successfully }", compose, StringComparison.Ordinal);
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
                        Assert.Equal(scenario.FailureMode == "up" ? "may_have_run" : "completed",
                            state.RootElement.GetProperty("migrationStatus").GetString());
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
            Assert.Contains(commands, command => command.Contains("config -q", StringComparison.Ordinal));
            Assert.Contains(commands, command => command.Contains(" up --detach --build --remove-orphans", StringComparison.Ordinal));
            Assert.Contains(commands, command => command.Contains("exec -T development-studio wget", StringComparison.Ordinal));
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
            // The target is a unique test-owned temporary directory created above.
            if (Directory.Exists(testRoot)) Directory.Delete(testRoot, recursive: true);
        }
    }

    private static DeployerProcess StartDeployer(string root, string fakeLog, string modeFile)
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
        start.Environment["ReleaseDeployer__HealthCheckTimeoutSeconds"] = "1";
        start.Environment["ReleaseDeployer__HealthCheckIntervalMilliseconds"] = "10";
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
        Add-Content -LiteralPath $env:AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_LOG -Value ($arguments -join ' ')
        $mode = Get-Content -LiteralPath $env:AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_MODE_FILE -Raw
        $queryIndex = [Array]::IndexOf($arguments, '-Q')
        if ($queryIndex -ge 0 -and $queryIndex + 1 -lt $arguments.Length) {
            $query = $arguments[$queryIndex + 1]
            if ($query.Contains('SELECT name FROM sys.databases')) { Add-Content $env:AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG 'database-list'; [Console]::Out.WriteLine('AIERPPlatform') }
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
        arguments="$*"
        printf '%s\n' "$arguments" >> "$AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_LOG"
        mode=$(cat "$AIERP_RELEASE_DEPLOYER_FAKE_DOCKER_MODE_FILE")
        query_index=0
        for argument in "$@"; do
          if [ "$query_index" -eq 1 ]; then
            case "$argument" in
              *"SELECT name FROM sys.databases"*) printf '%s\n' "AIERPPlatform"; printf '%s\n' 'database-list' >> "$AIERP_RELEASE_DEPLOYER_FAKE_EFFECTS_LOG" ;;
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
