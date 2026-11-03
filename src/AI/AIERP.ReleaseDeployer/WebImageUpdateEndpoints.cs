using System.Collections.Concurrent;
using System.Security.Claims;

namespace AIERP.ReleaseDeployer;

public sealed record WebImageUpdateRequest(Guid DeploymentId, Guid TenantId, Guid ProjectId, Guid PackageId, string PackageSha256, string CommitSha, string Version, IReadOnlyList<string> Targets);
public sealed record WebImageUpdateStatus(Guid Id, Guid PackageId, string Status, string CommitSha, string Output, DateTimeOffset StartedAt);

public static class WebImageUpdateEndpoints
{
    private static readonly ConcurrentDictionary<Guid, (Guid Tenant, Guid Project, WebImageUpdateStatus Status)> Jobs = new();
    private static readonly string[] SupportedServices = ["platform-api", "erp-web", "ai-service", "plugin-host", "integration-host", "tenant-provisioning-worker", "workspace-runner", "workspace-sandbox"];
    private static int active;

    public static void MapWebImageUpdates(this WebApplication app, IConfiguration config, SemaphoreSlim gate,
        Func<WebImageUpdateRequest, string, CancellationToken, Task> extract,
        Func<IEnumerable<string>, TimeSpan, CancellationToken, Task<(int Code, string Output)>> docker)
    {
        bool Allowed(ClaimsPrincipal user, Guid tenant, Guid project) =>
            user.FindFirstValue("service") == "AIERP.AIService" && user.FindFirstValue("scope") == "release.application.update" &&
            user.FindFirstValue("tenant_id") == tenant.ToString("D") && user.FindFirstValue("project_id") == project.ToString("D") &&
            config.GetValue<Guid>("WebImageUpdate:TenantId") == tenant && config.GetValue<Guid>("WebImageUpdate:ProjectId") == project;

        app.MapGet("/internal/web-image-updates/{tenant:guid}/{project:guid}", (Guid tenant, Guid project, Guid packageId, ClaimsPrincipal user) =>
        {
            if (!Allowed(user, tenant, project)) return Results.Forbid();
            if (packageId == Guid.Empty) return Results.BadRequest(new { error = "Sürüm paketi kimliği gerekli." });
            return Results.Ok(Jobs.Values.Where(x => x.Tenant == tenant && x.Project == project && x.Status.PackageId == packageId)
                .Select(x => x.Status).OrderByDescending(x => x.StartedAt).FirstOrDefault());
        }).RequireAuthorization();

        app.MapGet("/internal/application-image-revisions/{tenant:guid}/{project:guid}", async (Guid tenant, Guid project, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!Allowed(user, tenant, project)) return Results.Forbid();
            var files = config.GetSection("WebImageUpdate:ComposeFiles").Get<string[]>() ?? [];
            var envFile = config["WebImageUpdate:EnvFile"];
            var composeProject = config["WebImageUpdate:ComposeProject"];
            if (files.Length == 0 || files.Any(x => !File.Exists(x)) || !File.Exists(envFile) || string.IsNullOrWhiteSpace(composeProject))
                return Results.Problem("Compose dağıtım ayarları eksik.", statusCode: 503);
            var prefix = new List<string> { "compose", "--project-name", composeProject, "--env-file", envFile! };
            foreach (var file in files) { prefix.Add("--file"); prefix.Add(file); }
            var configured = await docker(prefix.Concat(["config", "--services"]), TimeSpan.FromSeconds(30), ct);
            if (configured.Code != 0) return Results.Problem("Compose servis listesi okunamadı.", statusCode: 502);
            var configuredServices = configured.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToHashSet(StringComparer.Ordinal);
            var revisions = new Dictionary<string, string?>(StringComparer.Ordinal);
            foreach (var service in SupportedServices)
            {
                // Old containers can outlive their Compose service definition. Never let an
                // orphan block updates for services still managed by the active deployment.
                if (!configuredServices.Contains(service))
                {
                    app.Logger.LogWarning("Skipping application image revision lookup for {Service}: it is not defined in the active Compose files", service);
                    continue;
                }
                var running = await docker(prefix.Concat(["ps", "--status", "running", "-q", service]), TimeSpan.FromSeconds(20), ct);
                if (running.Code != 0) return Results.Problem($"{service} çalışan imajı sorgulanamadı.", statusCode: 502);
                var containerId = running.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
                if (containerId is null) continue;
                if (!System.Text.RegularExpressions.Regex.IsMatch(containerId, "^[a-fA-F0-9]{12,64}$")) return Results.Problem("Docker geçersiz konteyner kimliği döndürdü.", statusCode: 502);
                var inspect = await docker(["inspect", "--format", "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}", containerId], TimeSpan.FromSeconds(20), ct);
                if (inspect.Code != 0) return Results.Problem($"{service} sürüm etiketi okunamadı.", statusCode: 502);
                var revision = inspect.Output.Trim();
                revisions[service] = System.Text.RegularExpressions.Regex.IsMatch(revision, "^[a-fA-F0-9]{40}$") ? revision : null;
            }
            return Results.Ok(revisions);
        }).RequireAuthorization();

        app.MapPost("/internal/web-image-updates", (WebImageUpdateRequest body, ClaimsPrincipal user) =>
        {
            if (!Allowed(user, body.TenantId, body.ProjectId) || user.FindFirstValue("deployment_id") != body.DeploymentId.ToString("D")) return Results.Forbid();
            var files = config.GetSection("WebImageUpdate:ComposeFiles").Get<string[]>() ?? [];
            var envFile = config["WebImageUpdate:EnvFile"];
            var composeProject = config["WebImageUpdate:ComposeProject"];
            if (files.Length == 0 || files.Any(x => !File.Exists(x)) || !File.Exists(envFile) || string.IsNullOrWhiteSpace(composeProject))
                return Results.Problem("Uygulama güncellemesi için sunucudaki Compose dosyaları, ortam dosyası ve proje adı yapılandırılmalı.", statusCode: 503);
            if (body.DeploymentId == Guid.Empty || body.PackageId == Guid.Empty || string.IsNullOrWhiteSpace(body.CommitSha) || body.CommitSha.Length != 40 || body.CommitSha.Any(x => !Uri.IsHexDigit(x)) ||
                string.IsNullOrWhiteSpace(body.PackageSha256) || body.PackageSha256.Length != 64 || body.PackageSha256.Any(x => !Uri.IsHexDigit(x)) ||
                body.Targets is null || body.Targets.Count > 9 || body.Targets.Distinct(StringComparer.Ordinal).Count() != body.Targets.Count || body.Targets.Any(x => !SupportedServices.Contains(x, StringComparer.Ordinal))) return Results.BadRequest();
            if (body.Targets.Count == 0)
            {
                var unchanged = new WebImageUpdateStatus(body.DeploymentId, body.PackageId, "NoChanges", body.CommitSha, "Çalışan uygulama projelerinde bu committen kaynaklanan değişiklik bulunamadı.", DateTimeOffset.UtcNow);
                Jobs[body.DeploymentId] = (body.TenantId, body.ProjectId, unchanged);
                return Results.Ok(unchanged);
            }
            if (Interlocked.CompareExchange(ref active, 1, 0) != 0) return Results.Conflict(new { error = "Bir uygulama güncellemesi zaten çalışıyor." });
            Jobs[body.DeploymentId] = (body.TenantId, body.ProjectId, new(body.DeploymentId, body.PackageId, "Queued", body.CommitSha, $"Değişen servisler: {string.Join(", ", body.Targets)}. Güncelleme kuyruğa alındı.", DateTimeOffset.UtcNow));
            _ = Task.Run(async () =>
            {
                var ct = app.Lifetime.ApplicationStopping;
                var entered = false;
                void Report(string status, string output)
                {
                    var job = Jobs[body.DeploymentId];
                    Jobs[body.DeploymentId] = (job.Tenant, job.Project, job.Status with { Status = status, Output = output.Length > 48000 ? output[^48000..] : output });
                }
                try
                {
                    await gate.WaitAsync(ct); entered = true;
                    var root = Path.Combine(config["WebImageUpdate:WorkRoot"] ?? "/deployer-state/web-updates", body.DeploymentId.ToString("N"));
                    var source = Path.Combine(root, "source");
                    Directory.CreateDirectory(source);
                    Report("Building", "Doğrulanmış sürüm paketi açılıyor.");
                    await extract(body, source, ct);
                    var buildTargets = new Dictionary<string, (string Resource, string Dockerfile)>(StringComparer.Ordinal)
                    {
                        ["erp-web"] = ("WebUpdate.Dockerfile", "Dockerfile.web-update"),
                        ["platform-api"] = ("WebUpdate.PlatformApi.Dockerfile", "Dockerfile.platform-api-update"),
                        ["ai-service"] = ("WebUpdate.AIService.Dockerfile", "Dockerfile.ai-service-update"),
                        ["plugin-host"] = ("WebUpdate.PluginHost.Dockerfile", "Dockerfile.plugin-host-update"),
                        ["integration-host"] = ("WebUpdate.IntegrationHost.Dockerfile", "Dockerfile.integration-host-update"),
                        ["tenant-provisioning-worker"] = ("WebUpdate.TenantProvisioningWorker.Dockerfile", "Dockerfile.tenant-worker-update"),
                        ["workspace-runner"] = ("WebUpdate.WorkspaceRunner.Dockerfile", "Dockerfile.workspace-runner-update"),
                        ["workspace-sandbox"] = ("WebUpdate.WorkspaceSandbox.Dockerfile", "Dockerfile.workspace-sandbox-update")
                    };
                    foreach (var service in body.Targets)
                    {
                        var (resource, dockerfile) = buildTargets[service];
                        using var stream = typeof(WebImageUpdateEndpoints).Assembly.GetManifestResourceStream(resource)
                            ?? throw new InvalidDataException($"{service} derleme tarifi pakette yok.");
                        using var reader = new StreamReader(stream);
                        var path = Path.Combine(source, dockerfile);
                        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                        await File.WriteAllTextAsync(path, await reader.ReadToEndAsync(ct), ct);
                    }
                    var imageNames = body.Targets.ToDictionary(x => x, x => $"nexora-{x}:studio-{body.DeploymentId:N}", StringComparer.Ordinal);
                    var buildOutput = new List<string>();
                    foreach (var service in body.Targets)
                    {
                        Report("Building", string.Join('\n', buildOutput.Append($"{service} imajı derleniyor.")));
                        var args = new List<string> { "build", "--label", $"org.opencontainers.image.revision={body.CommitSha}" };
                        if (service is "platform-api" or "ai-service" or "tenant-provisioning-worker")
                        {
                            args.AddRange(["--build-arg", $"OCI_IMAGE_REVISION={body.CommitSha}", "--build-arg", $"OCI_IMAGE_VERSION={body.Version}"]);
                        }
                        if (service == "erp-web") args.AddRange(["--build-arg", $"VITE_STUDIO_URL={config["WebImageUpdate:StudioUrl"] ?? "/"}"]);
                        args.AddRange(["-t", imageNames[service], "-f", Path.Combine(source, buildTargets[service].Dockerfile), source]);
                        var build = await docker(args, TimeSpan.FromMinutes(service == "workspace-sandbox" ? 45 : 30), ct);
                        buildOutput.Add(build.Output);
                        if (build.Code != 0) { Report("Failed", string.Join('\n', buildOutput)); return; }
                    }
                    var overlay = Path.Combine(root, "image.json");
                    var images = imageNames;
                    var prefix = new List<string> { "compose", "--project-name", composeProject, "--env-file", envFile! };
                    foreach (var file in files.Append(overlay)) { prefix.Add("--file"); prefix.Add(file); }
                    var previousImages = new Dictionary<string, string>(StringComparer.Ordinal);
                    foreach (var service in images.Keys)
                    {
                        var previous = await docker(prefix.Take(prefix.Count - 2).Concat(["images", "-q", service]), TimeSpan.FromSeconds(30), ct);
                        var previousImage = previous.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
                        if (previous.Code != 0 || previousImage is null || !System.Text.RegularExpressions.Regex.IsMatch(previousImage, "^(sha256:)?[a-f0-9]{12,64}$"))
                            throw new InvalidOperationException($"Çalışan {service} imajı belirlenemedi; güncelleme uygulanmadı.");
                        previousImages[service] = previousImage;
                    }
                    await File.WriteAllTextAsync(overlay, System.Text.Json.JsonSerializer.Serialize(new { services = images.ToDictionary(x => x.Key, x => (object)new { image = x.Value }) }), ct);
                    Report("Deploying", string.Join('\n', buildOutput) + "\nYalnız değişen projelerin konteynerleri yenileniyor.");
                    (int Code, string Output) deploy;
                    try { deploy = await docker(prefix.Concat(["up", "-d", "--no-build", "--no-deps", "--wait", "--wait-timeout", "180", .. body.Targets]), TimeSpan.FromMinutes(4), ct); }
                    catch (Exception ex) { app.Logger.LogError(ex, "Application deployment interrupted; attempting rollback"); deploy = (-1, "Uygulama konteynerleri yenilenirken işlem kesildi."); }
                    if (deploy.Code != 0)
                    {
                        await File.WriteAllTextAsync(overlay, System.Text.Json.JsonSerializer.Serialize(new { services = previousImages.ToDictionary(x => x.Key, x => (object)new { image = x.Value }) }), CancellationToken.None);
                        var rollback = await docker(prefix.Concat(["up", "-d", "--no-build", "--no-deps", "--wait", "--wait-timeout", "180", .. body.Targets]), TimeSpan.FromMinutes(4), CancellationToken.None);
                        Report("Failed", string.Join('\n', buildOutput) + "\n" + deploy.Output + (rollback.Code == 0 ? "\nÖnceki imajlara dönüldü." : "\nÖnceki imajlara dönüş başarısız; sunucu müdahalesi gerekli.") + "\n" + rollback.Output);
                        return;
                    }
                    Report(deploy.Code == 0 ? "Succeeded" : "Failed", string.Join('\n', buildOutput) + "\n" + deploy.Output);
                }
                catch (Exception ex) { app.Logger.LogError(ex, "ERP application image update failed {JobId}", body.DeploymentId); Report("Failed", "Web ve API imaj güncellemesi tamamlanamadı. Sunucu kayıtlarını kontrol edin."); }
                finally { if (entered) gate.Release(); Interlocked.Exchange(ref active, 0); }
            });
            return Results.Accepted(value: Jobs[body.DeploymentId].Status);
        }).RequireAuthorization();
    }
}
