using System.Text.RegularExpressions;
using AIERP.AIService;

namespace AIERP.Platform.UnitTests;

public sealed class ApplicationServiceImpactTests
{
    private static readonly Dictionary<string, string> HostServices = new(StringComparer.OrdinalIgnoreCase)
    {
        ["src/Hosts/AIERP.Api/"] = "platform-api",
        ["src/AI/AIERP.AIService/"] = "ai-service",
        ["src/Extensions/AIERP.PluginHost/"] = "plugin-host",
        ["src/Extensions/AIERP.IntegrationHost/"] = "integration-host",
        ["src/Hosts/AIERP.TenantProvisioningWorker/"] = "tenant-provisioning-worker",
        ["src/AI/AIERP.WorkspaceRunner/"] = "workspace-runner",
        ["src/AI/AIERP.WorkspaceSandbox/"] = "workspace-sandbox",
    };

    [Fact]
    public void Project_table_matches_the_csproj_reference_graph_for_every_source_project()
    {
        var root = FindRepositoryRoot();
        var projects = Directory.EnumerateFiles(Path.Combine(root, "src"), "*.csproj", SearchOption.AllDirectories)
            .ToDictionary(file => ProjectDirectory(root, file), file => file, StringComparer.OrdinalIgnoreCase);
        var references = projects.ToDictionary(x => x.Key, x => Regex.Matches(File.ReadAllText(x.Value), "ProjectReference\\s+Include=\"([^\"]+)\"")
            .Select(m => ProjectDirectory(root, Path.GetFullPath(Path.Combine(Path.GetDirectoryName(x.Value)!, m.Groups[1].Value.Replace('\\', Path.DirectorySeparatorChar)))))
            .ToArray(), StringComparer.OrdinalIgnoreCase);

        Assert.Equal(projects.Keys.Order(StringComparer.OrdinalIgnoreCase), ApplicationServiceImpact.ProjectServices.Keys.Order(StringComparer.OrdinalIgnoreCase));
        foreach (var project in projects.Keys)
        {
            var expected = HostServices.Where(host => Closure(host.Key, references).Contains(project)).Select(host => host.Value).Order(StringComparer.Ordinal);
            Assert.Equal(expected, ApplicationServiceImpact.ProjectServices[project].Order(StringComparer.Ordinal));
        }
    }

    [Fact]
    public void Platform_changes_rebuild_only_the_services_that_compile_the_platform()
    {
        var services = ApplicationServiceImpact.Map(["src/Platform/AIERP.Platform.Infrastructure/Migrations/20261118_Add.cs"]);
        Assert.Equal(new[] { "ai-service", "platform-api", "tenant-provisioning-worker" }, services.Order(StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("src/Extensions/AIERP.ModuleSDK/ModuleManifest.cs", "platform-api", "plugin-host")]
    [InlineData("src/Extensions/AIERP.IntegrationSDK/Provider.cs", "integration-host", "platform-api")]
    public void Sdk_changes_rebuild_their_hosts(string path, params string[] expected) =>
        Assert.Equal(expected, ApplicationServiceImpact.Map([path]).Order(StringComparer.Ordinal));

    [Fact]
    public void Project_file_changes_also_rebuild_the_sandbox_package_feed()
    {
        var services = ApplicationServiceImpact.Map(["src/Platform/AIERP.Platform.Infrastructure/AIERP.Platform.Infrastructure.csproj"]);
        Assert.Contains("workspace-sandbox", services);
        Assert.Contains("platform-api", services);
        Assert.Contains("workspace-sandbox", ApplicationServiceImpact.Map(["AIERP.slnx"]));
    }

    [Theory]
    [InlineData("src/Platform/AIERP.Platform.NewThing/Class.cs")]
    [InlineData("Directory.Packages.props")]
    [InlineData("global.json")]
    public void Unknown_source_projects_and_solution_wide_files_fail_closed(string path) =>
        Assert.Equal(ApplicationServiceImpact.DotnetServices.Order(StringComparer.Ordinal), ApplicationServiceImpact.Map([path]).Order(StringComparer.Ordinal));

    [Fact]
    public void Frontend_docs_and_tests_map_as_expected()
    {
        Assert.Equal(new[] { "erp-web" }, ApplicationServiceImpact.Map(["frontend/erp-web/src/App.tsx", "docs/architecture.md", "tests/UnitTests/X.cs"]));
        Assert.Empty(ApplicationServiceImpact.Map(["src/AI/AIERP.ReleaseDeployer/Program.cs"]));
        Assert.Contains("erp-web", ApplicationServiceImpact.Map([ApplicationServiceImpact.AllRuntimeProjectsMarker]));
    }

    [Fact]
    public void Dotnet_service_dockerfiles_share_one_byte_identical_build_prefix_covering_every_project()
    {
        var root = FindRepositoryRoot();
        string[] dockerfiles = ["Platform.Api", "AIService", "PluginHost", "IntegrationHost", "TenantProvisioningWorker", "WorkspaceRunner"];
        const string endMarker = "# --- End of shared .NET build prefix";
        var prefixes = dockerfiles.Select(name =>
        {
            var text = File.ReadAllText(Path.Combine(root, "deploy", "docker", $"{name}.Dockerfile")).Replace("\r\n", "\n");
            var end = text.IndexOf(endMarker, StringComparison.Ordinal);
            Assert.True(end > 0, $"{name}.Dockerfile has no shared build prefix.");
            Assert.Contains("--no-restore -p:BuildProjectReferences=false", text[end..], StringComparison.Ordinal);
            return text[..end];
        }).ToArray();
        Assert.All(prefixes, prefix => Assert.Equal(prefixes[0], prefix));

        var prefixText = prefixes[0];
        var copiedDirectories = Regex.Matches(prefixText, "(?m)^COPY (src/\\S+/) \\1$").Select(m => m.Groups[1].Value).ToArray();
        foreach (var csproj in Directory.EnumerateFiles(Path.Combine(root, "src"), "*.csproj", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(root, csproj).Replace('\\', '/');
            var directory = ProjectDirectory(root, csproj);
            if (directory is "src/AI/AIERP.WorkspaceSandbox/" or "src/AI/AIERP.ReleaseDeployer/") continue; // own Dockerfiles
            Assert.Contains($"COPY {relative} {directory}\n", prefixText, StringComparison.Ordinal);
            if (HostServices.ContainsKey(directory))
            {
                Assert.Contains(relative, Regex.Match(prefixText, "(?m)^RUN (?:--mount=\S+ )?for project in .*dotnet restore.*$").Value, StringComparison.Ordinal);
                Assert.DoesNotContain(copiedDirectories, copied => directory.StartsWith(copied, StringComparison.OrdinalIgnoreCase));
            }
            else
            {
                // Libraries are compiled in the shared layer, so their whole directory must be copied first.
                Assert.Contains(copiedDirectories, copied => directory.StartsWith(copied, StringComparison.OrdinalIgnoreCase));
                Assert.Contains(relative, Regex.Match(prefixText, "(?m)^RUN (?:--mount=\S+ )?for project in .*dotnet build.*$").Value, StringComparison.Ordinal);
            }
        }
    }

    private static HashSet<string> Closure(string project, IReadOnlyDictionary<string, string[]> references)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var pending = new Stack<string>([project]);
        while (pending.TryPop(out var current))
            if (seen.Add(current) && references.TryGetValue(current, out var next))
                foreach (var reference in next) pending.Push(reference);
        return seen;
    }

    private static string ProjectDirectory(string root, string csproj) =>
        Path.GetRelativePath(root, Path.GetDirectoryName(csproj)!).Replace('\\', '/') + "/";

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("Repository root not found.");
    }
}
