using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using AIERP.WorkspaceSandbox;

public sealed record SandboxTestJob(Guid Id, Guid WorkspaceId, string TargetPath, DateTimeOffset CreatedAt, string Operation = "test");

internal sealed class TestJobWorker(IConfiguration configuration, ILogger<TestJobWorker> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const long MaxArchiveBytes = 100 * 1024 * 1024;
    private const int MaxFiles = 20_000;
    private const int MaxOutputCharacters = 32_000;
    private const int MaxPackageCacheEntries = 50_000;
    private static readonly TimeSpan DotNetRestoreTimeout = TimeSpan.FromSeconds(120);
    private static readonly HashSet<string> ExcludedDirectories = new(StringComparer.OrdinalIgnoreCase)
        { ".git", ".vs", ".next", "node_modules", "bin", "obj", "dist", "build", "coverage", "packages", "vendor" };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("Workspace sandbox must run on Linux.");
        var jobRoot = Path.GetFullPath(configuration["WorkspaceSandbox:JobRoot"] ?? "/test-jobs");
        var tempRoot = Path.GetFullPath(configuration["WorkspaceSandbox:TempRoot"] ?? "/tmp/test-jobs");
        Directory.CreateDirectory(jobRoot);
        Directory.CreateDirectory(tempRoot);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                foreach (var directory in Directory.EnumerateDirectories(jobRoot).OrderBy(x => x, StringComparer.Ordinal))
                {
                    if (stoppingToken.IsCancellationRequested) break;
                    await ProcessJobAsync(directory, tempRoot, stoppingToken);
                    CleanupStaleJob(directory);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (IOException exception) { logger.LogWarning("Sandbox queue read failed: {Message}", exception.Message); }
            await Task.Delay(TimeSpan.FromMilliseconds(500), stoppingToken);
        }
    }

    private async Task ProcessJobAsync(string jobDirectory, string tempRoot, CancellationToken stoppingToken)
    {
        var manifestPath = Path.Combine(jobDirectory, "job.json");
        var archivePath = Path.Combine(jobDirectory, "source.zip");
        var resultPath = Path.Combine(jobDirectory, "result.json");
        if (!File.Exists(manifestPath) || !File.Exists(archivePath) || File.Exists(resultPath)) return;
        SandboxTestJob? job;
        try { job = JsonSerializer.Deserialize<SandboxTestJob>(await File.ReadAllTextAsync(manifestPath, stoppingToken), JsonOptions); }
        catch (Exception exception) when (exception is IOException or JsonException)
        { logger.LogWarning(exception, "Sandbox job metadata could not be read from {ManifestPath}", manifestPath); await WriteResultAsync(resultPath, new(false, "InvalidJob", "Sandbox job metadata could not be read.", 0, ""), stoppingToken); return; }
        if (job is null || job.Id == Guid.Empty || job.WorkspaceId == Guid.Empty || job.Operation is not ("test" or "build") || !IsSafeProjectPath(job.TargetPath))
        { await WriteResultAsync(resultPath, new(false, "InvalidJob", "Sandbox job metadata was rejected.", 0, ""), stoppingToken); return; }
        await File.WriteAllTextAsync(Path.Combine(jobDirectory, "started.json"), DateTimeOffset.UtcNow.ToString("O"), stoppingToken);
        if (DateTimeOffset.UtcNow - job.CreatedAt > TimeSpan.FromMinutes(20))
        {
            await WriteResultAsync(resultPath, new(false, "QueueExpired", "Test işi sandbox kuyruğunda 20 dakikadan fazla bekledi.", -1, ""), stoppingToken);
            return;
        }

        var workDirectory = Path.Combine(tempRoot, job.Id.ToString("N"));
        var stopwatch = Stopwatch.StartNew();
        SandboxTestResult result;
        try
        {
            if (new FileInfo(archivePath).Length > MaxArchiveBytes) throw new SandboxRejectedException("Source archive exceeds the size limit.");
            Directory.CreateDirectory(workDirectory);
            ExtractArchive(archivePath, workDirectory);
            File.Delete(archivePath);
            var target = Path.GetFullPath(Path.Combine(workDirectory, job.TargetPath.Replace('/', Path.DirectorySeparatorChar)));
            if (!target.StartsWith(workDirectory + Path.DirectorySeparatorChar, StringComparison.Ordinal) || !File.Exists(target))
                throw new SandboxRejectedException("Selected test project was not found in the snapshot.");
            MakeSnapshotWritableForSandboxUser(workDirectory);
            if (job.Operation == "build")
            {
                if (Path.GetExtension(job.TargetPath).Equals(".csproj", StringComparison.OrdinalIgnoreCase))
                {
                    if (!TryCreateNugetRestoreConfig(workDirectory, out var restoreConfigPath, out var cacheError, out var cacheStatus))
                        result = new(false, cacheStatus, cacheError, -1, "");
                    else
                    {
                        var restore = await RunCommandAsync(workDirectory, "dotnet", ["restore", target, "--configfile", restoreConfigPath, "--ignore-failed-sources", "-p:NuGetAudit=false", "--disable-parallel"], DotNetRestoreTimeout, stoppingToken);
                        if (restore.ExitCode != 0)
                            result = new(false, restore.TimedOut ? "TimedOut" : "DependencyUnavailable", restore.TimedOut ? "Offline NuGet restore exceeded its time limit." : "Offline dependency restore failed. The sandbox has no network access; dependencies must be available in its approved package cache.", restore.ExitCode, CombineOutput(restore));
                        else
                        {
                            var build = await RunCommandAsync(workDirectory, "dotnet", ["build", target, "--no-restore", "--configuration", "Release", "--verbosity", "minimal"], TimeSpan.FromSeconds(55), stoppingToken);
                            result = new(build.ExitCode == 0, build.TimedOut ? "TimedOut" : build.ExitCode == 0 ? "Built" : "BuildFailed",
                                build.TimedOut ? "Build exceeded its time limit." : build.ExitCode == 0 ? ".NET build completed successfully." : ".NET build failed.", build.ExitCode, CombineOutput(build));
                        }
                    }
                }
                else if (Path.GetFileName(target).Equals("package.json", StringComparison.OrdinalIgnoreCase))
                {
                    var projectDirectory = Path.GetDirectoryName(target)!;
                    var sources = Directory.EnumerateFiles(projectDirectory, "*", SearchOption.AllDirectories)
                        .Where(path => Path.GetExtension(path).ToLowerInvariant() is ".js" or ".cjs" or ".mjs")
                        .OrderBy(path => path, StringComparer.Ordinal).Take(201).ToArray();
                    if (sources.Length == 0 || sources.Length > 200)
                    {
                        result = new(false, "Rejected", "Node.js build requires 1–200 JavaScript source files in the selected project.", -1, "");
                    }
                    else
                    {
                        var output = new List<string>();
                        var nodeStopwatch = Stopwatch.StartNew();
                        var exitCode = 0;
                        var timedOut = false;
                        foreach (var source in sources)
                        {
                            if (nodeStopwatch.Elapsed >= TimeSpan.FromSeconds(55)) { timedOut = true; exitCode = -1; break; }
                            var relative = Path.GetRelativePath(projectDirectory, source);
                            var check = await RunCommandAsync(projectDirectory, "node", ["--check", source], TimeSpan.FromSeconds(5), stoppingToken);
                            var text = CombineOutput(check);
                            if (text.Length > 0) output.Add($"$ node --check {relative}{Environment.NewLine}{text}");
                            if (check.ExitCode != 0) { exitCode = check.ExitCode; timedOut = check.TimedOut; break; }
                        }
                        result = new(exitCode == 0, timedOut ? "TimedOut" : exitCode == 0 ? "Built" : "BuildFailed",
                            timedOut ? "Node.js syntax checks exceeded their time limit." : exitCode == 0 ? $"Node.js syntax check passed for {sources.Length} files. No source modules were executed." : "Node.js syntax check failed.", exitCode, string.Join(Environment.NewLine, output));
                    }
                }
                else if (Path.GetExtension(target).Equals(".py", StringComparison.OrdinalIgnoreCase))
                {
                    var build = await RunCommandAsync(workDirectory, "python3", ["-m", "py_compile", target], TimeSpan.FromSeconds(35), stoppingToken);
                    result = new(build.ExitCode == 0, build.TimedOut ? "TimedOut" : build.ExitCode == 0 ? "Built" : "BuildFailed",
                        build.TimedOut ? "Python syntax compilation exceeded its time limit." : build.ExitCode == 0 ? "Python source compiled successfully." : "Python syntax compilation failed.", build.ExitCode, CombineOutput(build));
                }
                else if (Path.GetExtension(target).Equals(".java", StringComparison.OrdinalIgnoreCase) && IsSafePlainJavaTarget(job.TargetPath))
                {
                    if (new FileInfo(target).Length > 64 * 1024)
                        throw new SandboxRejectedException("Plain-JDK Java source files are limited to 64 KiB.");
                    var classesDirectory = Path.Combine(workDirectory, ".java-classes");
                    var sourcePathDirectory = Path.Combine(workDirectory, ".java-empty-sourcepath");
                    Directory.CreateDirectory(classesDirectory);
                    Directory.CreateDirectory(sourcePathDirectory);
                    var compile = await RunCommandAsync(workDirectory, "javac", CreatePlainJavaCompileArguments(target, classesDirectory, sourcePathDirectory), TimeSpan.FromSeconds(55), stoppingToken);
                    result = new(compile.ExitCode == 0, compile.TimedOut ? "TimedOut" : compile.ExitCode == 0 ? "Built" : "BuildFailed",
                        compile.TimedOut ? "Java compilation exceeded its time limit." : compile.ExitCode == 0 ? "Plain-JDK Java source compiled successfully without dependency resolution." : "Java compilation failed.", compile.ExitCode, CombineOutput(compile));
                }
                else if (Path.GetFileName(target).Equals("go.mod", StringComparison.OrdinalIgnoreCase))
                {
                    var moduleDirectory = Path.GetDirectoryName(target)!;
                    if (HasExternalGoDependencies(target))
                    {
                        if (!TryPreparePackageCache(workDirectory, "go-mod", out var cacheError))
                            result = new(false, "DependencyUnavailable", $"Go dependencies are unavailable in the operator package cache. {cacheError}", -1, "");
                        else
                        {
                            var build = await RunCommandAsync(moduleDirectory, "go", ["build", "-mod=readonly", "./..."], TimeSpan.FromSeconds(55), stoppingToken);
                            result = new(build.ExitCode == 0, build.TimedOut ? "TimedOut" : build.ExitCode == 0 ? "Built" : "BuildFailed",
                                build.TimedOut ? "Build exceeded its time limit." : build.ExitCode == 0 ? "Go build completed successfully." : "Go build failed.", build.ExitCode, CombineOutput(build));
                        }
                    }
                    else
                    {
                        var build = await RunCommandAsync(moduleDirectory, "go", ["build", "-mod=readonly", "./..."], TimeSpan.FromSeconds(55), stoppingToken);
                        result = new(build.ExitCode == 0, build.TimedOut ? "TimedOut" : build.ExitCode == 0 ? "Built" : "BuildFailed",
                            build.TimedOut ? "Go build exceeded its time limit." : build.ExitCode == 0 ? "Go build completed successfully." : "Go build failed.", build.ExitCode, CombineOutput(build));
                    }
                }
                else if (Path.GetFileName(target).Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase))
                {
                    if (HasExternalRustDependencies(target) && !File.Exists(Path.Combine(Path.GetDirectoryName(target)!, "Cargo.lock")))
                    {
                        result = new(false, "DependencyUnavailable", "Rust dependencies require a Cargo.lock file for offline builds.", -1, "");
                    }
                    else if (HasExternalRustDependencies(target) && !TryPreparePackageCache(workDirectory, "cargo-home", out var cacheError))
                    {
                        result = new(false, "DependencyUnavailable", $"Rust dependencies are unavailable in the operator package cache. {cacheError}", -1, "");
                    }
                    else
                    {
                        var build = await RunCommandAsync(Path.GetDirectoryName(target)!, "cargo", ["build", "--offline"], TimeSpan.FromSeconds(55), stoppingToken);
                        var output = CombineOutput(build);
                        var unavailable = output.Contains("no matching package named", StringComparison.OrdinalIgnoreCase) || output.Contains("failed to download", StringComparison.OrdinalIgnoreCase);
                        result = new(build.ExitCode == 0, build.TimedOut ? "TimedOut" : build.ExitCode == 0 ? "Built" : unavailable ? "DependencyUnavailable" : "BuildFailed",
                            build.TimedOut ? "Rust build exceeded its time limit." : unavailable ? "Rust crate dependencies are not available in the offline sandbox." : build.ExitCode == 0 ? "Rust build completed successfully." : "Rust build failed.", build.ExitCode, output);
                    }
                }
                else
                {
                    result = new(false, "Rejected", "The selected build target is not supported.", -1, "");
                }
            }
            else if (Path.GetExtension(job.TargetPath).Equals(".csproj", StringComparison.OrdinalIgnoreCase))
            {
                if (!TryCreateNugetRestoreConfig(workDirectory, out var restoreConfigPath, out var cacheError, out var cacheStatus))
                {
                    result = new(false, cacheStatus, cacheError, -1, "");
                }
                else
                {
                    var restore = await RunCommandAsync(workDirectory, "dotnet", ["restore", target, "--configfile", restoreConfigPath, "--ignore-failed-sources", "-p:NuGetAudit=false", "--disable-parallel"], DotNetRestoreTimeout, stoppingToken);
                    if (restore.ExitCode != 0)
                        result = new(false, restore.TimedOut ? "TimedOut" : "DependencyUnavailable", restore.TimedOut ? "Offline NuGet restore exceeded its time limit." : "Offline dependency restore failed. The sandbox has no network access; dependencies must be available in its approved package cache.", restore.ExitCode, CombineOutput(restore));
                    else
                    {
                        var test = await RunCommandAsync(workDirectory, "dotnet", ["test", target, "--no-restore", "--logger", "console;verbosity=minimal"], TimeSpan.FromSeconds(55), stoppingToken);
                        result = new(test.ExitCode == 0, test.TimedOut ? "TimedOut" : test.ExitCode == 0 ? "Passed" : "Failed",
                            test.TimedOut ? "Test execution exceeded its time limit." : test.ExitCode == 0 ? "Tests completed successfully." : "Tests failed.", test.ExitCode, CombineOutput(test));
                    }
                }
            }
            else
            {
                if (Path.GetExtension(target).Equals(".java", StringComparison.OrdinalIgnoreCase) && IsSafePlainJavaTarget(job.TargetPath))
                {
                    if (new FileInfo(target).Length > 64 * 1024)
                        throw new SandboxRejectedException("Plain-JDK Java source files are limited to 64 KiB.");
                    var source = await File.ReadAllTextAsync(target, stoppingToken);
                    if (!TryGetPlainJavaTestMainClass(job.TargetPath, source, out var mainClass))
                    {
                        result = new(false, "Rejected", "Java tests require a public top-level class matching the filename with public static void main(String[] args).", -1, "");
                    }
                    else
                    {
                        var classesDirectory = Path.Combine(workDirectory, ".java-classes");
                        var sourcePathDirectory = Path.Combine(workDirectory, ".java-empty-sourcepath");
                        Directory.CreateDirectory(classesDirectory);
                        Directory.CreateDirectory(sourcePathDirectory);
                        var compile = await RunCommandAsync(workDirectory, "javac", CreatePlainJavaCompileArguments(target, classesDirectory, sourcePathDirectory), TimeSpan.FromSeconds(55), stoppingToken);
                        if (compile.ExitCode != 0)
                            result = new(false, compile.TimedOut ? "TimedOut" : "BuildFailed", compile.TimedOut ? "Java test compilation exceeded its time limit." : "Java test compilation failed.", compile.ExitCode, CombineOutput(compile));
                        else
                        {
                            var run = await RunCommandAsync(workDirectory, "java", CreatePlainJavaRunArguments(classesDirectory, mainClass, Path.Combine(workDirectory, ".tmp")), TimeSpan.FromSeconds(55), stoppingToken);
                            result = new(run.ExitCode == 0, run.TimedOut ? "TimedOut" : run.ExitCode == 0 ? "Passed" : "Failed",
                                run.TimedOut ? "Java test execution exceeded its time limit." : run.ExitCode == 0 ? "Plain-JDK Java test harness completed successfully." : "Java test harness failed.", run.ExitCode, CombineOutput(run));
                        }
                    }
                }
                else if (Path.GetFileName(target).Equals("package.json", StringComparison.OrdinalIgnoreCase) && HasExternalNodeDependencies(target))
                {
                    var projectDirectory = Path.GetDirectoryName(target)!;
                    if (!File.Exists(Path.Combine(projectDirectory, "package-lock.json")))
                        result = new(false, "DependencyUnavailable", "Offline Node.js dependency tests require a package-lock.json file.", -1, "");
                    else if (!TryPreparePackageCache(workDirectory, "npm", out var cacheError))
                        result = new(false, "DependencyUnavailable", $"Node.js dependencies are unavailable in the operator package cache. {cacheError}", -1, "");
                    else
                    {
                        var cachePath = Path.Combine(workDirectory, ".operator-cache", "npm");
                        var install = await RunCommandAsync(projectDirectory, "npm", ["ci", "--offline", "--cache", cachePath, "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], TimeSpan.FromSeconds(35), stoppingToken);
                        if (install.ExitCode != 0)
                            result = new(false, install.TimedOut ? "TimedOut" : "DependencyUnavailable", install.TimedOut ? "Offline Node.js dependency restore exceeded its time limit." : "Node.js dependencies could not be restored from the operator cache.", install.ExitCode, CombineOutput(install));
                        else
                        {
                            var test = await RunCommandAsync(projectDirectory, "node", ["--max-old-space-size=768", "--test"], TimeSpan.FromSeconds(55), stoppingToken);
                            result = new(test.ExitCode == 0, test.TimedOut ? "TimedOut" : test.ExitCode == 0 ? "Passed" : "Failed",
                                test.TimedOut ? "Test execution exceeded its time limit." : test.ExitCode == 0 ? "Node.js tests completed successfully." : "Node.js tests failed.", test.ExitCode, CombineOutput(test));
                        }
                    }
                }
                else if (Path.GetExtension(target).Equals(".py", StringComparison.OrdinalIgnoreCase))
                {
                    var requirements = Path.Combine(workDirectory, "requirements.txt");
                    var pythonPath = new Dictionary<string, string>();
                    var dependencyError = "";
                    var dependencyExitCode = 0;
                    var dependencyTimedOut = false;
                    if (File.Exists(requirements))
                    {
                        if (!TryPreparePackageCache(workDirectory, "python-wheels", out dependencyError)) dependencyExitCode = -1;
                        else
                        {
                            var wheels = Path.Combine(workDirectory, ".operator-cache", "python-wheels");
                            var dependencies = Path.Combine(workDirectory, ".python-deps");
                            var install = await RunCommandAsync(workDirectory, "python3", ["-m", "pip", "install", "--no-index", "--only-binary=:all:", "--find-links", wheels, "--target", dependencies, "--requirement", requirements, "--disable-pip-version-check"], TimeSpan.FromSeconds(35), stoppingToken);
                            dependencyExitCode = install.ExitCode;
                            dependencyTimedOut = install.TimedOut;
                            dependencyError = CombineOutput(install);
                            if (install.ExitCode == 0) pythonPath["PYTHONPATH"] = dependencies;
                        }
                    }
                    if (dependencyExitCode != 0)
                        result = new(false, dependencyTimedOut ? "TimedOut" : "DependencyUnavailable", dependencyTimedOut ? "Offline Python dependency restore exceeded its time limit." : "Python dependencies could not be restored from the operator wheelhouse.", dependencyExitCode, dependencyError);
                    else
                    {
                        var test = await RunCommandAsync(workDirectory, "python3", ["-m", "pytest", job.TargetPath, "--no-header", "-q", "-p", "no:cacheprovider", "--disable-warnings"], TimeSpan.FromSeconds(55), stoppingToken, pythonPath);
                        var output = CombineOutput(test);
                        var missingDependency = output.Contains("ModuleNotFoundError", StringComparison.Ordinal) || output.Contains("No module named", StringComparison.OrdinalIgnoreCase);
                        result = new(test.ExitCode == 0, test.TimedOut ? "TimedOut" : test.ExitCode == 0 ? "Passed" : missingDependency ? "DependencyUnavailable" : "Failed",
                            test.TimedOut ? "Test execution exceeded its time limit." : missingDependency ? "Python package dependencies are unavailable in the offline sandbox." : test.ExitCode == 0 ? "Python tests completed successfully." : "Python tests failed.", test.ExitCode, output);
                    }
                }
                else if (Path.GetExtension(target).Equals(".go", StringComparison.OrdinalIgnoreCase))
                {
                    var moduleDirectory = FindGoModuleDirectory(workDirectory, target);
                    if (moduleDirectory is null)
                    {
                        result = new(false, "Rejected", "Selected Go test is not inside a Go module.", -1, "");
                    }
                    else if (HasExternalGoDependencies(Path.Combine(moduleDirectory, "go.mod")) && !TryPreparePackageCache(workDirectory, "go-mod", out var cacheError))
                    {
                        result = new(false, "DependencyUnavailable", $"Go dependencies are unavailable in the operator package cache. {cacheError}", -1, "");
                    }
                    else
                    {
                        var goPackageDirectory = Path.GetDirectoryName(target)!;
                        var test = await RunCommandAsync(goPackageDirectory, "go", ["test", "-mod=readonly", "."], TimeSpan.FromSeconds(55), stoppingToken);
                        var output = CombineOutput(test);
                        var missingDependency = output.Contains("no required module provides package", StringComparison.OrdinalIgnoreCase) || output.Contains("module lookup disabled by GOPROXY=off", StringComparison.OrdinalIgnoreCase);
                        result = new(test.ExitCode == 0, test.TimedOut ? "TimedOut" : test.ExitCode == 0 ? "Passed" : missingDependency ? "DependencyUnavailable" : "Failed",
                            test.TimedOut ? "Test execution exceeded its time limit." : missingDependency ? "Go module dependencies are not available in the offline sandbox." : test.ExitCode == 0 ? "Go tests completed successfully." : "Go tests failed.", test.ExitCode, output);
                    }
                }
                else if (Path.GetFileName(target).Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase))
                {
                    if (HasExternalRustDependencies(target) && !File.Exists(Path.Combine(Path.GetDirectoryName(target)!, "Cargo.lock")))
                    {
                        result = new(false, "DependencyUnavailable", "Rust dependencies require a Cargo.lock file for offline tests.", -1, "");
                    }
                    else if (HasExternalRustDependencies(target) && !TryPreparePackageCache(workDirectory, "cargo-home", out var cacheError))
                    {
                        result = new(false, "DependencyUnavailable", $"Rust dependencies are unavailable in the operator package cache. {cacheError}", -1, "");
                    }
                    else
                    {
                        var rustPackageDirectory = Path.GetDirectoryName(target)!;
                        var test = await RunCommandAsync(rustPackageDirectory, "cargo", ["test", "--offline"], TimeSpan.FromSeconds(55), stoppingToken);
                        var output = CombineOutput(test);
                        var unavailable = output.Contains("no matching package named", StringComparison.OrdinalIgnoreCase) || output.Contains("failed to download", StringComparison.OrdinalIgnoreCase);
                        result = new(test.ExitCode == 0, test.TimedOut ? "TimedOut" : test.ExitCode == 0 ? "Passed" : unavailable ? "DependencyUnavailable" : "Failed",
                            test.TimedOut ? "Test execution exceeded its time limit." : unavailable ? "Rust crate dependencies are not available in the offline sandbox." : test.ExitCode == 0 ? "Rust tests completed successfully." : "Rust tests failed.", test.ExitCode, output);
                    }
                }
                else if (Path.GetExtension(target).Equals(".java", StringComparison.OrdinalIgnoreCase))
                {
                    result = new(false, "Rejected", "Selected Java test target is not safe for plain-JDK execution.", -1, "");
                }
                else
                {
                    var nodeProjectDirectory = Path.GetDirectoryName(target)!;
                    var test = await RunCommandAsync(nodeProjectDirectory, "node", ["--max-old-space-size=768", "--test"], TimeSpan.FromSeconds(55), stoppingToken);
                    result = new(test.ExitCode == 0, test.TimedOut ? "TimedOut" : test.ExitCode == 0 ? "Passed" : "Failed",
                        test.TimedOut ? "Test execution exceeded its time limit." : test.ExitCode == 0 ? "Node.js tests completed successfully." : "Node.js tests failed.", test.ExitCode, CombineOutput(test));
                }
            }
        }
        catch (SandboxRejectedException exception) { result = new(false, "Rejected", exception.Message, -1, ""); }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidDataException or System.Xml.XmlException or JsonException)
        { result = new(false, "SandboxError", "Sandbox could not prepare the isolated source snapshot.", -1, ""); logger.LogWarning("Sandbox job {JobId} failed during preparation: {Message}", job.Id, exception.Message); }
        finally
        {
            stopwatch.Stop();
            try { if (Directory.Exists(workDirectory)) Directory.Delete(workDirectory, recursive: true); }
            catch (IOException exception) { logger.LogWarning("Sandbox temp cleanup failed: {Message}", exception.Message); }
        }
        result = result with { DurationMilliseconds = (int)Math.Min(stopwatch.ElapsedMilliseconds, int.MaxValue) };
        await WriteResultAsync(resultPath, result, stoppingToken);
    }

    internal static void ExtractArchive(string archivePath, string destination)
    {
        destination = Path.GetFullPath(destination);
        RejectReparsePoint(destination);
        using var archive = ZipFile.OpenRead(archivePath);
        if (archive.Entries.Count > MaxFiles) throw new SandboxRejectedException("Source snapshot has too many files.");
        long extractedBytes = 0;
        foreach (var entry in archive.Entries)
        {
            var path = entry.FullName.Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(path) || path.StartsWith('/') || path.Contains(':') || path.Any(char.IsControl) || path.Split('/').Any(x => x is "" or "." or ".."))
                throw new SandboxRejectedException("Source snapshot contains an unsafe path.");
            if (path.Split('/').Any(x => ExcludedDirectories.Contains(x) || x.StartsWith('.') || IsSecretName(x))) continue;
            var unixType = (entry.ExternalAttributes >> 16) & 0xF000;
            if (unixType == 0xA000) throw new SandboxRejectedException("Source snapshot contains a symbolic link.");
            if (entry.Name.Length == 0) continue;
            if (entry.Length > 16 * 1024 * 1024 || extractedBytes + entry.Length > MaxArchiveBytes)
                throw new SandboxRejectedException("Source snapshot expands beyond the size limit.");
            extractedBytes += entry.Length;
            var target = Path.GetFullPath(Path.Combine(destination, path.Replace('/', Path.DirectorySeparatorChar)));
            if (!target.StartsWith(destination + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                throw new SandboxRejectedException("Source snapshot path escapes its temporary directory.");
            var parent = Path.GetDirectoryName(target)!;
            EnsureNoReparsePointAncestors(destination, parent);
            Directory.CreateDirectory(parent);
            using var input = entry.Open(); using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            input.CopyTo(output);
        }
    }

    private static void EnsureNoReparsePointAncestors(string destination, string parent)
    {
        var current = parent;
        while (current.StartsWith(destination + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            RejectReparsePoint(current);
            current = Path.GetDirectoryName(current)!;
        }
        RejectReparsePoint(destination);
    }

    private static void RejectReparsePoint(string path)
    {
        if (!Directory.Exists(path) && !File.Exists(path)) return;
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new SandboxRejectedException("Source snapshot destination contains a symbolic link or reparse point.");
    }

    private static void MakeSnapshotWritableForSandboxUser(string root)
    {
        if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("Sandbox file permissions require Linux.");
        foreach (var directory in Directory.EnumerateDirectories(root, "*", SearchOption.AllDirectories).Prepend(root))
            File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute);
        foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
            File.SetUnixFileMode(file, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.OtherRead | UnixFileMode.OtherWrite);
    }

    private static async Task<ProcessResult> RunCommandAsync(string workingDirectory, string executable, IReadOnlyList<string> arguments,
        TimeSpan timeout, CancellationToken cancellationToken, IReadOnlyDictionary<string, string>? environmentOverrides = null)
    {
        var tempDirectory = Path.Combine(workingDirectory, ".tmp");
        Directory.CreateDirectory(tempDirectory);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(tempDirectory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute);
        var setprivPath = File.Exists("/usr/bin/setpriv") ? "/usr/bin/setpriv" : "/bin/setpriv";
        using var process = new Process { StartInfo = new ProcessStartInfo
        {
            FileName = "/usr/bin/setsid", WorkingDirectory = workingDirectory, UseShellExecute = false,
            RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
        }};
        process.StartInfo.ArgumentList.Add(setprivPath);
        process.StartInfo.ArgumentList.Add("--reuid=65532"); process.StartInfo.ArgumentList.Add("--regid=65532");
        process.StartInfo.ArgumentList.Add("--clear-groups"); process.StartInfo.ArgumentList.Add("--bounding-set=-all");
        process.StartInfo.ArgumentList.Add("--inh-caps=-all"); process.StartInfo.ArgumentList.Add("--ambient-caps=-all");
        process.StartInfo.ArgumentList.Add(executable);
        foreach (var argument in arguments) process.StartInfo.ArgumentList.Add(argument);
        process.StartInfo.Environment.Clear();
        process.StartInfo.Environment["PATH"] = "/usr/local/bin:/usr/local/go/bin:/usr/share/dotnet:/usr/bin:/bin";
        process.StartInfo.Environment["HOME"] = workingDirectory;
        process.StartInfo.Environment["TMPDIR"] = tempDirectory;
        process.StartInfo.Environment["DOTNET_CLI_HOME"] = Path.Combine(workingDirectory, ".dotnet");
        process.StartInfo.Environment["NUGET_PACKAGES"] = Path.Combine(workingDirectory, ".nuget");
        process.StartInfo.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        process.StartInfo.Environment["DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE"] = "1";
        process.StartInfo.Environment["DOTNET_SKIP_FIRST_TIME_EXPERIENCE"] = "1";
        process.StartInfo.Environment["DOTNET_NOLOGO"] = "1";
        process.StartInfo.Environment["PYTHONDONTWRITEBYTECODE"] = "1";
        process.StartInfo.Environment["PYTHONNOUSERSITE"] = "1";
        process.StartInfo.Environment["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1";
        process.StartInfo.Environment["CGO_ENABLED"] = "0";
        process.StartInfo.Environment["GOTOOLCHAIN"] = "local";
        process.StartInfo.Environment["GOPROXY"] = "off";
        process.StartInfo.Environment["GOSUMDB"] = "off";
        process.StartInfo.Environment["GONOSUMDB"] = "*";
        process.StartInfo.Environment["GOMODCACHE"] = Path.Combine(workingDirectory, ".gomodcache");
        process.StartInfo.Environment["GOCACHE"] = Path.Combine(workingDirectory, ".gocache");
        process.StartInfo.Environment["CARGO_HOME"] = Path.Combine(workingDirectory, ".cargo");
        process.StartInfo.Environment["CARGO_NET_OFFLINE"] = "true";
        process.StartInfo.Environment["CARGO_TERM_COLOR"] = "never";
        process.StartInfo.Environment["RUSTFLAGS"] = "-C debuginfo=0";
        if (environmentOverrides is not null)
            foreach (var (key, value) in environmentOverrides)
                process.StartInfo.Environment[key] = value;
        process.Start();
        var stdoutTask = ReadBoundedAsync(process.StandardOutput, MaxOutputCharacters / 2);
        var stderrTask = ReadBoundedAsync(process.StandardError, MaxOutputCharacters / 2);
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(timeout);
        var timedOut = false;
        try { await process.WaitForExitAsync(timeoutCts.Token); }
        catch (OperationCanceledException)
        {
            timedOut = !cancellationToken.IsCancellationRequested;
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            if (cancellationToken.IsCancellationRequested) throw;
            await process.WaitForExitAsync(CancellationToken.None);
        }
        KillProcessGroup(process.Id);
        return new(process.ExitCode, timedOut, await stdoutTask, await stderrTask);
    }

    internal static bool IsSafePlainJavaTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetExtension(path).Equals(".java", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectories.Contains(segment));

    internal static bool TryGetPlainJavaTestMainClass(string targetPath, string source, out string mainClass)
    {
        mainClass = "";
        if (!IsSafePlainJavaTarget(targetPath) || source.Length is 0 or > 64 * 1024) return false;
        var className = Path.GetFileNameWithoutExtension(targetPath);
        var typePattern = $@"\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*class\s+{Regex.Escape(className)}\b";
        if (!Regex.IsMatch(source, typePattern) || !Regex.IsMatch(source,
                @"\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\)")) return false;
        var package = Regex.Match(source, @"(?m)^\s*package\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;");
        mainClass = package.Success ? $"{package.Groups[1].Value}.{className}" : className;
        return true;
    }

    internal static IReadOnlyList<string> CreatePlainJavaCompileArguments(string sourcePath, string classesDirectory, string emptySourcePathDirectory) =>
    ["-J-Xmx512m", "-J-XX:ActiveProcessorCount=1", "--release", "21", "-proc:none", "-implicit:none", "-classpath", classesDirectory, "-sourcepath", emptySourcePathDirectory, "-d", classesDirectory, sourcePath];

    internal static IReadOnlyList<string> CreatePlainJavaRunArguments(string classesDirectory, string mainClass, string tempDirectory) =>
    ["-Xmx512m", "-XX:ActiveProcessorCount=1", "--limit-modules", "java.base", "-ea", $"-Djava.io.tmpdir={tempDirectory}", "-cp", classesDirectory, mainClass];

    private static void KillProcessGroup(int processId) => _ = kill(-processId, 9);

    [DllImport("libc", SetLastError = true)]
    private static extern int kill(int processId, int signal);

    private static async Task<(string Text, bool Truncated)> ReadBoundedAsync(StreamReader reader, int maxCharacters)
    {
        var buffer = new char[4096]; var output = new StringBuilder(Math.Min(maxCharacters, 4096)); var truncated = false; int count;
        while ((count = await reader.ReadAsync(buffer)) > 0)
        {
            var remaining = maxCharacters - output.Length;
            if (remaining > 0) output.Append(buffer, 0, Math.Min(count, remaining));
            if (count > remaining) truncated = true;
        }
        return (output.ToString(), truncated);
    }

    private static string CombineOutput(ProcessResult result)
    {
        var value = (result.Stdout.Text + "\n" + result.Stderr.Text).Trim();
        if (result.Stdout.Truncated || result.Stderr.Truncated) value += "\n[çıktı kısaltıldı]";
        return value.Length <= MaxOutputCharacters ? value : value[..MaxOutputCharacters];
    }

    private static async Task WriteResultAsync(string path, SandboxTestResult result, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("Sandbox job queue permissions require Linux.");
        var temporary = path + ".tmp";
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(result, JsonOptions), Encoding.UTF8, cancellationToken);
        File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead);
        File.Move(temporary, path, overwrite: true);
    }

    private bool TryPreparePackageCache(string workDirectory, string cacheName, out string error)
    {
        var destinationName = cacheName switch
        {
            "go-mod" => ".gomodcache",
            "cargo-home" => ".cargo",
            _ => Path.Combine(".operator-cache", cacheName)
        };
        var destination = Path.Combine(workDirectory, destinationName);
        var configuredMaxBytes = configuration.GetValue<long?>("WorkspaceSandbox:MaxDependencyCacheBytes") ?? 512L * 1024 * 1024;
        var maxBytes = Math.Clamp(configuredMaxBytes, 1024L * 1024, 1024L * 1024 * 1024);
        if (!OperatorPackageCache.TryCopy(configuration["WorkspaceSandbox:PackageCacheRoot"] ?? "/package-cache", cacheName,
                destination, maxBytes, MaxPackageCacheEntries, out error)) return false;
        MakeSnapshotWritableForSandboxUser(destination);
        return true;
    }

    private bool TryCreateNugetRestoreConfig(string workDirectory, out string configPath, out string error, out string failureStatus)
    {
        error = "";
        failureStatus = "DependencyUnavailable";
        var cacheRoot = configuration["WorkspaceSandbox:PackageCacheRoot"] ?? "/package-cache";
        var operatorFeedSource = Path.Combine(cacheRoot, "nuget");
        var operatorFeed = Path.Combine(workDirectory, ".operator-cache", "nuget");
        configPath = Path.Combine(workDirectory, ".operator-cache", "NuGet.Config");
        var restoreSources = new List<XElement> { new("clear") };
        var hasOperatorFeed = Directory.Exists(operatorFeedSource) && Directory.EnumerateFileSystemEntries(operatorFeedSource).Any();
        if (hasOperatorFeed)
        {
            if (!TryPreparePackageCache(workDirectory, "nuget", out error))
            {
                error = $".NET dependencies are unavailable in the operator NuGet feed. {error}";
                return false;
            }
            try
            {
                var feedFiles = Directory.EnumerateFiles(operatorFeed, "*", SearchOption.AllDirectories).ToArray();
                if (feedFiles.Length == 0 || feedFiles.Any(file => !Path.GetExtension(file).Equals(".nupkg", StringComparison.OrdinalIgnoreCase)))
                {
                    error = "Operator NuGet feed accepts only .nupkg package files.";
                    failureStatus = "Rejected";
                    return false;
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                error = "Operator NuGet feed could not be inspected.";
                return false;
            }
            restoreSources.Add(new XElement("add", new XAttribute("key", "operator-packages"), new XAttribute("value", operatorFeed)));
        }
        else
        {
            restoreSources.Add(new XElement("add", new XAttribute("key", "sandbox-built-in"), new XAttribute("value", "/opt/nuget-feed")));
        }
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
            new XDocument(new XElement("configuration",
                    new XElement("packageSources", restoreSources),
                    new XElement("fallbackPackageFolders",
                        new XElement("add", new XAttribute("key", "sandbox-built-in-cache"), new XAttribute("value", "/opt/nuget-feed"))))
                )
                .Save(configPath, SaveOptions.DisableFormatting);
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException)
        {
            error = "Offline NuGet restore sources could not be configured.";
            return false;
        }
    }

    private static bool IsSafeProjectPath(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 && !path.StartsWith('/') &&
        !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        (Path.GetExtension(path).Equals(".csproj", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(path).Equals("package.json", StringComparison.OrdinalIgnoreCase) || Path.GetExtension(path).Equals(".py", StringComparison.OrdinalIgnoreCase) || Path.GetExtension(path).Equals(".go", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(path).Equals("go.mod", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(path).Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase)) &&
        path.Split('/').All(x => !string.IsNullOrWhiteSpace(x) && x is not ("." or "..") && !x.StartsWith('.'));

    private static bool HasExternalNodeDependencies(string packageManifestPath)
    {
        using var document = JsonDocument.Parse(File.ReadAllBytes(packageManifestPath), new JsonDocumentOptions { MaxDepth = 24 });
        if (document.RootElement.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Node.js package manifest is not a JSON object.");
        foreach (var sectionName in new[] { "dependencies", "devDependencies", "optionalDependencies", "peerDependencies" })
            if (document.RootElement.TryGetProperty(sectionName, out var section) && section.ValueKind == JsonValueKind.Object && section.EnumerateObject().Any()) return true;
        return false;
    }

    private static string? FindGoModuleDirectory(string root, string target)
    {
        var fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        var current = Path.GetDirectoryName(Path.GetFullPath(target));
        while (!string.IsNullOrEmpty(current) && (current.Equals(fullRoot, StringComparison.Ordinal) || current.StartsWith(fullRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal)))
        {
            if (File.Exists(Path.Combine(current, "go.mod"))) return current;
            current = Path.GetDirectoryName(current);
        }
        return null;
    }

    private static bool HasExternalGoDependencies(string goModPath)
    {
        var inRequireBlock = false;
        foreach (var rawLine in File.ReadLines(goModPath))
        {
            var line = rawLine.Split("//", 2, StringSplitOptions.None)[0].Trim();
            if (line.Length == 0) continue;
            if (inRequireBlock)
            {
                if (line.StartsWith(')')) { inRequireBlock = false; continue; }
                if (!line.StartsWith('(')) return true;
                continue;
            }
            if (line.StartsWith("require ", StringComparison.Ordinal) || line.Equals("require", StringComparison.Ordinal))
            {
                if (line.Contains('(')) inRequireBlock = true;
                else return true;
            }
            else if (line.StartsWith("replace ", StringComparison.Ordinal) || line.Equals("replace", StringComparison.Ordinal) ||
                     line.StartsWith("toolchain ", StringComparison.Ordinal)) return true;
        }
        return inRequireBlock;
    }

    private static bool HasExternalRustDependencies(string cargoManifestPath)
    {
        var inDependencies = false;
        foreach (var rawLine in File.ReadLines(cargoManifestPath))
        {
            var line = rawLine.Split('#', 2, StringSplitOptions.None)[0].Trim();
            if (line.Length == 0) continue;
            if (line.StartsWith('[') && line.EndsWith(']'))
            {
                var section = line[1..^1].Trim();
                if (section.Equals("workspace", StringComparison.OrdinalIgnoreCase) || section.StartsWith("workspace.", StringComparison.OrdinalIgnoreCase)) return true;
                inDependencies = section.Equals("dependencies", StringComparison.OrdinalIgnoreCase) ||
                    section.Equals("dev-dependencies", StringComparison.OrdinalIgnoreCase) ||
                    section.Equals("build-dependencies", StringComparison.OrdinalIgnoreCase) ||
                    section.StartsWith("dependencies.", StringComparison.OrdinalIgnoreCase) ||
                    section.StartsWith("dev-dependencies.", StringComparison.OrdinalIgnoreCase) ||
                    section.StartsWith("build-dependencies.", StringComparison.OrdinalIgnoreCase) ||
                    section.EndsWith(".dependencies", StringComparison.OrdinalIgnoreCase) ||
                    section.EndsWith(".dev-dependencies", StringComparison.OrdinalIgnoreCase) ||
                    section.EndsWith(".build-dependencies", StringComparison.OrdinalIgnoreCase) ||
                    section.Contains(".dependencies.", StringComparison.OrdinalIgnoreCase) ||
                    section.Contains(".dev-dependencies.", StringComparison.OrdinalIgnoreCase) ||
                    section.Contains(".build-dependencies.", StringComparison.OrdinalIgnoreCase);
                continue;
            }
            if (line.StartsWith("workspace =", StringComparison.OrdinalIgnoreCase)) return true;
            if (inDependencies && line.Contains('=')) return true;
        }
        return false;
    }

    private static bool IsSecretName(string name) => name.Contains("secret", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("credential", StringComparison.OrdinalIgnoreCase) || name.Equals(".env", StringComparison.OrdinalIgnoreCase) ||
        name.StartsWith(".env.", StringComparison.OrdinalIgnoreCase) || name.Contains("apikey", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("password", StringComparison.OrdinalIgnoreCase);

    private void CleanupStaleJob(string directory)
    {
        if (!Directory.Exists(directory)) return;
        var resultPath = Path.Combine(directory, "result.json");
        var jobAge = DateTime.UtcNow - Directory.GetLastWriteTimeUtc(directory);
        if (File.Exists(resultPath) && DateTime.UtcNow - File.GetLastWriteTimeUtc(resultPath) > TimeSpan.FromDays(7) ||
            !File.Exists(Path.Combine(directory, "job.json")) && jobAge > TimeSpan.FromMinutes(10))
        {
            try { Directory.Delete(directory, recursive: true); }
            catch (IOException exception) { logger.LogWarning("Stale sandbox job cleanup failed: {Message}", exception.Message); }
        }
    }

    private sealed record SandboxTestResult(bool Success, string Status, string Message, int ExitCode, string Output, int DurationMilliseconds = 0);
    private sealed record ProcessResult(int ExitCode, bool TimedOut, (string Text, bool Truncated) Stdout, (string Text, bool Truncated) Stderr);
    private sealed class SandboxRejectedException(string message) : Exception(message);
}
