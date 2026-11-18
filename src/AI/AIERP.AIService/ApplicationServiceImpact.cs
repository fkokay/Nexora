namespace AIERP.AIService;

/// <summary>
/// Maps the files a release changed to the running application services whose
/// images must be rebuilt. The project table mirrors the csproj reference graph
/// (a unit test derives the graph from the csproj files and fails when they
/// drift). Unknown source paths fail closed: they rebuild every .NET service.
/// </summary>
public static class ApplicationServiceImpact
{
    public const string AllRuntimeProjectsMarker = "__all_runtime_projects__";

    public static readonly IReadOnlyList<string> DotnetServices =
        ["platform-api", "ai-service", "plugin-host", "integration-host", "tenant-provisioning-worker", "workspace-runner", "workspace-sandbox"];

    /// <summary>Project directory → services whose published output includes that project.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> ProjectServices = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["src/Platform/AIERP.Platform.Domain/"] = ["platform-api", "ai-service", "tenant-provisioning-worker"],
        ["src/Platform/AIERP.Platform.Application/"] = ["platform-api", "ai-service", "tenant-provisioning-worker"],
        ["src/Platform/AIERP.Platform.Infrastructure/"] = ["platform-api", "ai-service", "tenant-provisioning-worker"],
        ["src/Observability/AIERP.Observability/"] = ["platform-api", "ai-service", "plugin-host", "integration-host", "workspace-runner"],
        ["src/Extensions/AIERP.ModuleSDK/"] = ["platform-api", "plugin-host"],
        ["src/Extensions/AIERP.IntegrationSDK/"] = ["platform-api", "integration-host"],
        ["src/Hosts/AIERP.Api/"] = ["platform-api"],
        ["src/AI/AIERP.AIService/"] = ["ai-service"],
        ["src/Extensions/AIERP.PluginHost/"] = ["plugin-host"],
        ["src/Extensions/AIERP.IntegrationHost/"] = ["integration-host"],
        ["src/Hosts/AIERP.TenantProvisioningWorker/"] = ["tenant-provisioning-worker"],
        ["src/AI/AIERP.WorkspaceRunner/"] = ["workspace-runner"],
        ["src/AI/AIERP.WorkspaceSandbox/"] = ["workspace-sandbox"],
        // The deployer cannot update itself; its changes need an operator update.
        ["src/AI/AIERP.ReleaseDeployer/"] = [],
    };

    private static readonly Dictionary<string, string> DockerfileServices = new(StringComparer.OrdinalIgnoreCase)
    {
        ["deploy/docker/ErpWeb.Dockerfile"] = "erp-web",
        ["deploy/docker/erp-web.nginx.conf"] = "erp-web",
        ["deploy/docker/Platform.Api.Dockerfile"] = "platform-api",
        ["deploy/docker/AIService.Dockerfile"] = "ai-service",
        ["deploy/docker/PluginHost.Dockerfile"] = "plugin-host",
        ["deploy/docker/IntegrationHost.Dockerfile"] = "integration-host",
        ["deploy/docker/TenantProvisioningWorker.Dockerfile"] = "tenant-provisioning-worker",
        ["deploy/docker/tenant-provisioning-worker-entrypoint.sh"] = "tenant-provisioning-worker",
        ["deploy/docker/WorkspaceRunner.Dockerfile"] = "workspace-runner",
        ["deploy/docker/WorkspaceSandbox.Dockerfile"] = "workspace-sandbox",
        ["deploy/pip-patches/requirements.txt"] = "workspace-sandbox",
        ["deploy/pip-patches/update-vendored-sbom.py"] = "workspace-sandbox",
        ["deploy/npm-patches/package.json"] = "workspace-sandbox",
        ["deploy/npm-patches/package-lock.json"] = "workspace-sandbox",
    };

    private static readonly string[] SolutionWideBuildFiles =
        ["Directory.Build.props", "Directory.Build.targets", "Directory.Packages.props", "NuGet.config", "nuget.config", "global.json", ".dockerignore"];

    public static IReadOnlySet<string> Map(IEnumerable<string> paths)
    {
        ArgumentNullException.ThrowIfNull(paths);
        var services = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in paths)
        {
            var path = raw.Replace('\\', '/');
            if (path == AllRuntimeProjectsMarker || SolutionWideBuildFiles.Contains(path, StringComparer.OrdinalIgnoreCase))
            {
                services.UnionWith(DotnetServices);
                if (path == AllRuntimeProjectsMarker || path == ".dockerignore") services.Add("erp-web");
                continue;
            }
            if (path.StartsWith("frontend/erp-web/", StringComparison.OrdinalIgnoreCase)) services.Add("erp-web");
            if (DockerfileServices.TryGetValue(path, out var dockerService)) services.Add(dockerService);
            if (path.StartsWith("deploy/docker/sandbox-overrides/", StringComparison.OrdinalIgnoreCase)) services.Add("workspace-sandbox");
            // The sandbox image ships the restored package folder of the whole solution, so any
            // project or solution file change can alter what it must contain.
            if (path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) || path.Equals("AIERP.slnx", StringComparison.OrdinalIgnoreCase))
                services.Add("workspace-sandbox");
            if (path.StartsWith("src/", StringComparison.OrdinalIgnoreCase))
            {
                var project = ProjectServices.FirstOrDefault(x => path.StartsWith(x.Key, StringComparison.OrdinalIgnoreCase));
                if (project.Key is null) services.UnionWith(DotnetServices); // unknown project: fail closed
                else services.UnionWith(project.Value);
            }
        }
        return services;
    }
}
