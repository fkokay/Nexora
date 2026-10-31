using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AIERP.Observability;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

// These are fixed production container mounts. Runtime configuration must not
// broaden the workspace runner's filesystem authority.
const string WorkspaceRootPath = "/workspaces";
const string ReleasePackageRootPath = "/release-packages";
const string TestJobRootPath = "/test-jobs";

var builder = WebApplication.CreateBuilder(args);
var signingKey = builder.Configuration["Authentication:SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
    throw new InvalidOperationException("A signing key with at least 32 bytes is required.");
var issuer = builder.Configuration["Authentication:Issuer"] ?? "AIERP";
var audience = builder.Configuration["Authentication:Audience"] ?? "AIERP.WorkspaceRunner";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = issuer,
        ValidateAudience = true, ValidAudience = audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(15)
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AIServiceProvisioner", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.provision").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceBranchCreator", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.branch.create").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceReleasePackageCreator", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.release-package.create").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceReleasePackageReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.release-package.read").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceBranchPublisher", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.branch.push").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceGitStatusReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.git-status.read").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceGitDiffReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.git-diff.read").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.read").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceFileReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.read-file").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceFileHashReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.read-file-hash").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceAnalyzer", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.analyze").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceTestDiscoverer", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.tests.discover").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceTestExecutor", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.tests.execute").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceTestJobReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.tests.status").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceBuildExecutor", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.build.execute").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceBuildJobReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.build.status").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceWorkspaceSearcher", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.search").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceWriter", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.apply-file").RequireClaim("workspace_id"));
    options.AddPolicy("AIServicePatcher", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.apply-patches").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceFileCreator", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.create-file").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceChangeReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.changes.read").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceChangeRestorer", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.restore-file").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceApprovedChangeCommitter", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.changes.commit").RequireClaim("workspace_id"));
    options.AddPolicy("AIServiceBranchReader", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.AIService").RequireClaim("operation", "workspace.list-branches").RequireClaim("project_id"));
});
var app = builder.Build();
app.UseAierpSecurityHeaders();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "workspace-runner", mode = "approved-checkout-inspection-and-approved-file-apply-create-restore" }));
app.MapPost("/internal/projects/branches", async (RepositoryBranchesRequest request, ClaimsPrincipal caller, HttpRequest httpRequest, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsProjectScopedServiceCaller(caller, request.ProjectId)) return Results.Forbid();
    if (request.ProjectId == Guid.Empty) return Results.BadRequest(new { error = "Geçerli bir proje kimliği gerekli." });
    var validation = await WorkspaceSecurity.ValidateRepositoryAsync(request.RepositoryUrl,
        configuration.GetSection("Workspace:AllowedGitHosts").Get<string[]>() ?? ["github.com"], cancellationToken);
    if (!validation.IsValid) return Results.BadRequest(new { error = validation.Error });
    var gitEnvironment = WorkspaceSecurity.CreateGitHubReadEnvironment(validation.Uri!, httpRequest.Headers["X-GitHub-Installation-Token"].FirstOrDefault());

    var root = WorkspaceRootPath;
    Directory.CreateDirectory(root);
    try
    {
        var result = await WorkspaceSecurity.RunGit(root,
            ["-c", "protocol.ext.allow=never", "-c", "http.followRedirects=false", "ls-remote", "--symref", validation.Uri!.AbsoluteUri, "HEAD", "refs/heads/*"],
            TimeSpan.FromSeconds(30), cancellationToken, gitEnvironment);
        if (result.ExitCode != 0) return Results.BadRequest(new { error = "Depo dalları okunamadı. Depo ve dal erişimini kontrol edin." });
        var lines = result.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var defaultBranch = lines
            .Select(line => line.Split('\t', 2))
            .Where(parts => parts.Length == 2 && parts[0].StartsWith("ref: refs/heads/", StringComparison.Ordinal) && parts[1] == "HEAD")
            .Select(parts => parts[0]["ref: refs/heads/".Length..])
            .FirstOrDefault(WorkspaceSecurity.IsValidBranchName);
        var branches = lines
            .Select(line => line.Split('\t', 2))
            .Where(parts => parts.Length == 2 && parts[1].StartsWith("refs/heads/", StringComparison.Ordinal))
            .Select(parts => parts[1]["refs/heads/".Length..])
            .Where(WorkspaceSecurity.IsValidBranchName)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .Take(200)
            .ToList();
        return Results.Ok(new RepositoryBranchesResponse(defaultBranch, branches));
    }
    catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
    { return Results.Problem("Depo dal listesi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (HttpRequestException)
    { return Results.Problem("Depo dal listesi alınamadı.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization("AIServiceBranchReader");
app.MapPost("/internal/workspaces/provision", async (ProvisionRequest request, ClaimsPrincipal caller, HttpRequest httpRequest, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, request.WorkspaceId)) return Results.Forbid();
    if (request.WorkspaceId == Guid.Empty) return Results.BadRequest(new { error = "Geçerli bir workspace kimliği gerekli." });
    var validation = await WorkspaceSecurity.ValidateRepositoryAsync(request.RepositoryUrl,
        configuration.GetSection("Workspace:AllowedGitHosts").Get<string[]>() ?? ["github.com"], cancellationToken);
    if (!validation.IsValid) return Results.BadRequest(new { error = validation.Error });
    var gitEnvironment = WorkspaceSecurity.CreateGitHubReadEnvironment(validation.Uri!, httpRequest.Headers["X-GitHub-Installation-Token"].FirstOrDefault());
    if (!WorkspaceSecurity.IsValidBranchName(request.BranchName)) return Results.BadRequest(new { error = "Geçersiz Git dalı." });
    var branchName = request.BranchName!;

    var root = WorkspaceRootPath;
    if (WorkspaceSecurity.HasReparsePointInPath(root)) return Results.Problem("Workspace kök dizini güvenli değil.", statusCode: StatusCodes.Status500InternalServerError);
    Directory.CreateDirectory(root);
    var target = Path.GetFullPath(Path.Combine(root, request.WorkspaceId.ToString("N")));
    var workspaceRootPrefix = Path.EndsInDirectorySeparator(root) ? root : root + Path.DirectorySeparatorChar;
    if (!target.StartsWith(workspaceRootPrefix, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
        return Results.BadRequest(new { error = "Geçersiz workspace yolu." });
    if (WorkspaceSecurity.HasReparsePointInPath(target)) return Results.Conflict(new { error = "Workspace yolu sembolik bağlantı içeriyor." });
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    var createdTarget = false;
    try
    {
        if (Directory.Exists(target))
        {
            if (!Directory.Exists(Path.Combine(target, ".git"))) return Results.Conflict(new { error = "Workspace yolu zaten kullanımda." });
            var existing = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, request.WorkspaceId, cancellationToken);
            return existing.CommitSha is not null
                ? Results.Ok(new ProvisionResponse(request.WorkspaceId, existing.CommitSha, existing.BranchName!))
                : Results.Conflict(new { error = existing.Error ?? "Mevcut checkout doğrulanamadı." });
        }

        var branchCheck = await WorkspaceSecurity.RunGit(root, ["check-ref-format", "--branch", branchName], TimeSpan.FromSeconds(10), cancellationToken);
        if (branchCheck.ExitCode != 0) return Results.BadRequest(new { error = "Geçersiz Git dalı." });
        var clone = await WorkspaceSecurity.RunGit(root,
            ["-c", "core.hooksPath=/dev/null", "-c", "protocol.ext.allow=never", "-c", "credential.helper=", "-c", "http.followRedirects=false", "clone", "--depth", "1", "--single-branch", "--branch", branchName, "--filter=blob:none", validation.Uri!.AbsoluteUri, target],
            TimeSpan.FromMinutes(3), cancellationToken, gitEnvironment);
        if (clone.ExitCode != 0)
        {
            if (Directory.Exists(target)) Directory.Delete(target, recursive: true);
            return Results.BadRequest(new { error = "Depo klonlanamadı. Depo ve dalın erişilebilir olduğunu doğrulayın." });
        }
        createdTarget = true;
        var branch = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, request.WorkspaceId, cancellationToken);
        if (branch.CommitSha is null)
        {
            if (Directory.Exists(target)) Directory.Delete(target, recursive: true);
            return Results.BadRequest(new { error = branch.Error ?? "Checkout commit bilgisi doğrulanamadı." });
        }
        return Results.Ok(new ProvisionResponse(request.WorkspaceId, branch.CommitSha, branch.BranchName!));
    }
    catch (OperationCanceledException)
    {
        if (createdTarget && Directory.Exists(target)) Directory.Delete(target, recursive: true);
        if (cancellationToken.IsCancellationRequested) throw;
        return Results.Problem("Depo klonlama zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (IOException)
    {
        if (createdTarget && Directory.Exists(target)) Directory.Delete(target, recursive: true);
        return Results.Problem("Çalışma alanı oluşturulamadı.", statusCode: StatusCodes.Status500InternalServerError);
    }
    finally { WorkspaceSecurity.Gate.Release(); }
}).RequireAuthorization("AIServiceProvisioner");
app.MapPost("/internal/workspaces/{workspaceId:guid}/working-branch", async (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    try
    {
        var branch = await WorkspaceSecurity.EnsureWorkspaceBranchAsync(root, workspaceId, cancellationToken);
        if (branch.CommitSha is null) return Results.Conflict(new { error = branch.Error ?? "İzole çalışma dalı oluşturulamadı." });
        return Results.Ok(new WorkspaceBranchResponse(workspaceId, branch.BranchName!, branch.CommitSha));
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("İzole çalışma dalı oluşturma zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("İzole çalışma dalı açılamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
    finally { WorkspaceSecurity.Gate.Release(); }
}).RequireAuthorization("AIServiceBranchCreator");
app.MapPost("/internal/workspaces/{workspaceId:guid}/push-approved-branch", async (Guid workspaceId, PushApprovedBranchRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.ApprovalConfirmed || !WorkspaceSecurity.IsCommitSha(request.ExpectedHeadCommitSha ?? string.Empty) ||
        string.IsNullOrWhiteSpace(request.InstallationToken) || request.InstallationToken.Length > 4096 || request.InstallationToken.Any(char.IsControl))
        return Results.BadRequest(new { error = "Açık onay, geçerli HEAD ve kısa ömürlü GitHub kurulum tokenı gerekli." });
    var root = WorkspaceRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    try
    {
        var status = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(root, workspaceId, cancellationToken);
        var branchName = WorkspaceSecurity.GetWorkspaceBranchName(workspaceId);
        if (status is null) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
        if (status.Truncated || status.TotalChangedFiles != 0 || status.Files.Count != 0 || status.BranchName != branchName ||
            !string.Equals(status.HeadCommitSha, request.ExpectedHeadCommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Yalnız beklenen HEAD üzerindeki temiz Studio dalı gönderilebilir." });
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        var remoteResult = await WorkspaceSecurity.RunGit(root, ["-C", workspace, "remote", "get-url", "origin"], TimeSpan.FromSeconds(15), cancellationToken);
        if (remoteResult.ExitCode != 0) return Results.Conflict(new { error = "GitHub origin bulunamadı." });
        var remoteValidation = await WorkspaceSecurity.ValidateRepositoryAsync(remoteResult.Output.Trim(),
            configuration.GetSection("Workspace:AllowedGitHosts").Get<string[]>() ?? ["github.com"], cancellationToken);
        if (!remoteValidation.IsValid || !string.Equals(remoteValidation.Uri!.Host, "github.com", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { error = "Yalnızca izin verilen GitHub HTTPS depolarına gönderim yapılabilir." });
        var credential = Convert.ToBase64String(Encoding.UTF8.GetBytes($"x-access-token:{request.InstallationToken}"));
        var environment = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["GIT_CONFIG_COUNT"] = "1",
            ["GIT_CONFIG_KEY_0"] = "http.extraheader",
            ["GIT_CONFIG_VALUE_0"] = $"Authorization: basic {credential}"
        };
        var branchRef = $"refs/heads/{branchName}";
        var remoteHead = await WorkspaceSecurity.RunGit(root, ["-C", workspace, "-c", "http.followRedirects=false", "-c", "protocol.ext.allow=never", "ls-remote", "origin", branchRef], TimeSpan.FromSeconds(30), cancellationToken, environment);
        if (remoteHead.ExitCode != 0) return Results.Problem("GitHub dal durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var existingSha = remoteHead.Output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (existingSha is not null && !string.Equals(existingSha, status.HeadCommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Uzak çalışma dalında farklı bir commit var; üzerine yazılmadı." });
        var pushed = false;
        if (existingSha is null)
        {
            var push = await WorkspaceSecurity.RunGit(root, ["-C", workspace, "-c", "http.followRedirects=false", "-c", "protocol.ext.allow=never", "push", "origin", $"HEAD:{branchRef}"], TimeSpan.FromSeconds(90), cancellationToken, environment);
            if (push.ExitCode != 0) return Results.Problem("GitHub dalı güvenli biçimde gönderilemedi.", statusCode: StatusCodes.Status502BadGateway);
            pushed = true;
        }
        var verified = await WorkspaceSecurity.RunGit(root, ["-C", workspace, "-c", "http.followRedirects=false", "-c", "protocol.ext.allow=never", "ls-remote", "origin", branchRef], TimeSpan.FromSeconds(30), cancellationToken, environment);
        var verifiedSha = verified.Output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (verified.ExitCode != 0 || !string.Equals(verifiedSha, status.HeadCommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Uzak dal beklenen commit ile eşleşmedi." });
        return Results.Ok(new { branchName, commitSha = status.HeadCommitSha, pushed });
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("GitHub gönderimi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("GitHub dalı gönderilemedi.", statusCode: StatusCodes.Status500InternalServerError); }
    finally { WorkspaceSecurity.Gate.Release(); }
}).RequireAuthorization("AIServiceBranchPublisher");
app.MapPost("/internal/workspaces/{workspaceId:guid}/release-packages", async (Guid workspaceId, CreateReleasePackageRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.Confirmation || request.PackageId == Guid.Empty || !WorkspaceSecurity.IsCommitSha(request.CommitSha ?? string.Empty) ||
        !WorkspaceSecurity.IsValidReleaseVersion(request.Version) || request.TestJobId == Guid.Empty ||
        string.IsNullOrWhiteSpace(request.TestTargetPath) || request.TestTargetPath.Length > 512 ||
        !WorkspaceSecurity.IsSha256(request.TestSnapshotSha256 ?? string.Empty))
        return Results.BadRequest(new { error = "Açık onay ve geçerli sürüm/test metadata'sı gerekli." });
    var workspaceRoot = WorkspaceRootPath;
    var packageRoot = ReleasePackageRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    try
    {
        var status = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(workspaceRoot, workspaceId, cancellationToken);
        if (status is null) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
        var expectedBranch = WorkspaceSecurity.GetWorkspaceBranchName(workspaceId);
        if (status.Truncated || status.TotalChangedFiles != 0 || status.Files.Count != 0 || status.BranchName != expectedBranch ||
            !string.Equals(status.HeadCommitSha, request.CommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Sadece sürüm adayıyla aynı temiz commit paketlenebilir." });
        var testRoot = TestJobRootPath;
        if (!WorkspaceSecurity.TryResolveStorageChild(testRoot, request.TestJobId.ToString("N"), out var testDirectory) || !Directory.Exists(testDirectory))
            return Results.Conflict(new { error = "Sandbox test kanıtı bulunamadı veya süresi doldu." });
        var jsonOptions = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);
        await using var manifestStream = File.OpenRead(Path.Combine(testDirectory, "job.json"));
        var testManifest = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxJob>(manifestStream, jsonOptions, cancellationToken);
        if (testManifest is null || testManifest.Operation != "test" || testManifest.WorkspaceId != workspaceId || testManifest.Id != request.TestJobId ||
            testManifest.HasUncommittedChanges || testManifest.TargetPath != request.TestTargetPath ||
            !string.Equals(testManifest.CommitSha, request.CommitSha, StringComparison.OrdinalIgnoreCase) || !string.Equals(testManifest.SnapshotSha256, request.TestSnapshotSha256, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Sandbox snapshot metadata sürüm adayıyla eşleşmiyor." });
        var resultPath = Path.Combine(testDirectory, "result.json");
        if (!File.Exists(resultPath)) return Results.Conflict(new { error = "Sandbox test işi tamamlanmadı." });
        await using var resultStream = File.OpenRead(resultPath);
        var testResult = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxTestResult>(resultStream, jsonOptions, cancellationToken);
        if (testResult is null || testResult.Status != "Passed" || !testResult.Success)
            return Results.Conflict(new { error = "Sürüm paketi için başarılı sandbox testi gerekli." });
        var package = await WorkspaceSecurity.CreateReleasePackageAsync(workspaceRoot, workspaceId, packageRoot, request, cancellationToken);
        return Results.Ok(package);
    }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (InvalidDataException exception) { return Results.Conflict(new { error = exception.Message }); }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Sürüm paketi oluşturma zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Sürüm paketi hazırlanamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    finally { WorkspaceSecurity.Gate.Release(); }
}).RequireAuthorization("AIServiceReleasePackageCreator");
app.MapGet("/internal/workspaces/{workspaceId:guid}/release-packages/{packageId:guid}", (Guid workspaceId, Guid packageId, ClaimsPrincipal caller, IConfiguration configuration) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (packageId == Guid.Empty) return Results.BadRequest();
    var root = ReleasePackageRootPath;
    if (!WorkspaceSecurity.TryResolveStorageChild(root, $"{packageId:N}.zip", out var path) || !File.Exists(path)) return Results.NotFound();
    if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) return Results.NotFound();
    var metadataPath = Path.ChangeExtension(path, ".json");
    if (WorkspaceSecurity.HasReparsePointInPath(metadataPath) || !File.Exists(metadataPath)) return Results.NotFound();
    var metadata = File.ReadAllText(metadataPath);
    if (!metadata.Contains(packageId.ToString("D"), StringComparison.OrdinalIgnoreCase)) return Results.NotFound();
    var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
    return Results.File(stream, "application/zip", $"release-{packageId:N}.zip", enableRangeProcessing: true);
}).RequireAuthorization("AIServiceReleasePackageReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/git-status", async (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    try
    {
        var result = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(root, workspaceId, cancellationToken);
        return result is null ? Results.NotFound(new { error = "Çalışma alanı bulunamadı." }) : Results.Ok(result);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Git durumu okuma zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Git çalışma alanı durumu okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
}).RequireAuthorization("AIServiceGitStatusReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/git-diff", async (Guid workspaceId, string? path, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    try
    {
        var result = await WorkspaceSecurity.GetWorkspaceGitDiffAsync(root, workspaceId, path, cancellationToken);
        return result.Error switch
        {
            "workspace_missing" => Results.NotFound(new { error = "Çalışma alanı bulunamadı." }),
            "path_not_changed" => Results.NotFound(new { error = "Dosyada çalışma ağacı değişikliği bulunamadı." }),
            "too_large" => Results.StatusCode(StatusCodes.Status413PayloadTooLarge),
            "binary" => Results.Conflict(new { error = "İkili dosyalar metin diff'i olarak gösterilemiyor." }),
            "unsupported" => Results.Conflict(new { error = "Yalnızca eklenen, değiştirilen veya silinen dosyalar için metin diff'i destekleniyor." }),
            "invalid_path" => Results.BadRequest(new { error = "Dosya yolu güvenli kapsam dışında." }),
            "git_error" => Results.Problem("Git diff okunamadı.", statusCode: StatusCodes.Status500InternalServerError),
            _ => Results.Ok(result.Diff)
        };
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Git diff okuma zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Git diff okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
}).RequireAuthorization("AIServiceGitDiffReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/files", async (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken, string? path = null, int offset = 0) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (offset < 0 || offset > 50_000) return Results.BadRequest(new { error = "Dosya listesi başlangıcı geçersiz." });
    var root = WorkspaceRootPath;
    if (!WorkspaceSecurity.TryResolveDirectory(root, workspaceId, path, out var directory, out var error))
        return error == "workspace_missing" ? Results.NotFound(new { error = "Çalışma alanı bulunamadı." }) : Results.BadRequest(new { error = error ?? "Dosya yolu geçersiz." });
    try
    {
        var entries = Directory.EnumerateFileSystemEntries(directory!)
            .Select(entryPath => (Path: entryPath, Name: Path.GetFileName(entryPath)))
            .Where(entry => !string.Equals(entry.Name, ".git", StringComparison.OrdinalIgnoreCase))
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .Skip(offset).Take(101).Select(entry =>
            {
                var attributes = File.GetAttributes(entry.Path);
                var isLink = (attributes & FileAttributes.ReparsePoint) != 0;
                var isDirectory = !isLink && (attributes & FileAttributes.Directory) != 0;
                var relative = string.IsNullOrEmpty(path) ? entry.Name : $"{path!.TrimEnd('/')}/{entry.Name}";
                var size = !isLink && !isDirectory ? new FileInfo(entry.Path).Length : (long?)null;
                return new WorkspaceFileEntry(entry.Name, relative, isLink ? "Link" : isDirectory ? "Directory" : "File", size);
            }).ToList();
        var hasMore = entries.Count > 100;
        if (hasMore) entries.RemoveAt(entries.Count - 1);
        return Results.Ok(new WorkspaceFileListing(path ?? "", entries, hasMore ? offset + entries.Count : null));
    }
    catch (IOException) { return Results.Problem("Çalışma alanı dosya listesi okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/files/search", (Guid workspaceId, string? query, ClaimsPrincipal caller) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(query) || query.Length > 120 || query.Any(char.IsControl))
        return Results.BadRequest(new { error = "Arama metni 1–120 karakter olmalı." });
    try { return Results.Ok(WorkspaceSecurity.SearchWorkspaceFileNames(WorkspaceRootPath, workspaceId, query.Trim())); }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (IOException) { return Results.Problem("Çalışma alanında dosya adı araması yapılamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/file-content", async Task<IResult> (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken, string? path = null) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!WorkspaceSecurity.TryResolveFile(WorkspaceRootPath, workspaceId, path, out var filePath, out var error))
        return error is "workspace_missing" or "file_missing" ? Results.NotFound(new { error = "Çalışma alanı veya dosya bulunamadı." }) : Results.BadRequest(new { error = error ?? "Dosya yolu geçersiz." });
    const int maxBytes = WorkspaceFileLimits.MaxManualWorkspaceFileBytes;
    try
    {
        await using var stream = new FileStream(filePath!, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        if (stream.Length > maxBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        var bytes = new byte[maxBytes + 1];
        var total = 0;
        while (total < bytes.Length)
        {
            var count = await stream.ReadAsync(bytes.AsMemory(total, bytes.Length - total), cancellationToken);
            if (count == 0) break;
            total += count;
        }
        if (total > maxBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (bytes.AsSpan(0, total).Contains((byte)0)) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
        string content;
        try { content = new UTF8Encoding(false, true).GetString(bytes, 0, total).TrimStart('\uFEFF'); }
        catch (DecoderFallbackException) { return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType); }
        return Results.Ok(new WorkspaceFileContent(path!, content, total, Convert.ToHexString(SHA256.HashData(bytes.AsSpan(0, total)))));
    }
    catch (FileNotFoundException) { return Results.NotFound(new { error = "Dosya bulunamadı." }); }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Dosya bulunamadı." }); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
    catch (IOException) { return Results.Problem("Dosya okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
}).RequireAuthorization("AIServiceFileReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/file-hash", async Task<IResult> (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken, string? path = null) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!WorkspaceSecurity.IsWritableSourcePath(path)) return Results.BadRequest(new { error = "Dosya yolu izinli kaynak kapsamı dışında." });
    if (!WorkspaceSecurity.TryResolveFile(WorkspaceRootPath, workspaceId, path, out var filePath, out var error))
        return error is "workspace_missing" or "file_missing" ? Results.NotFound(new { error = "Çalışma alanı veya dosya bulunamadı." }) : Results.BadRequest(new { error = error ?? "Dosya yolu geçersiz." });
    try
    {
        var info = new FileInfo(filePath!);
        if (info.Length > WorkspaceSecurity.MaxPatchableSourceBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        await using var stream = new FileStream(filePath!, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        using var sha = System.Security.Cryptography.SHA256.Create();
        var hash = await sha.ComputeHashAsync(stream, cancellationToken);
        return Results.Ok(new WorkspaceFileHash(path!, info.Length, Convert.ToHexString(hash)));
    }
    catch (FileNotFoundException) { return Results.NotFound(new { error = "Dosya bulunamadı." }); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
    catch (IOException) { return Results.Problem("Dosya özeti okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
}).RequireAuthorization("AIServiceFileHashReader");
app.MapPost("/internal/workspaces/{workspaceId:guid}/apply-file", async (Guid workspaceId, WorkspaceFileApplyRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.ApprovalConfirmed) return Results.BadRequest(new { error = "Kullanıcı onayı gerekli." });
    if (!WorkspaceSecurity.IsWritableSourcePath(request.Path) || !WorkspaceSecurity.IsSha256(request.ExpectedSha256) ||
        request.ProposedContent is null || (string.IsNullOrWhiteSpace(request.ProposedContent) && !request.AllowEmptyContent) ||
        request.ProposedContent.Contains('\0') || Encoding.UTF8.GetByteCount(request.ProposedContent) > WorkspaceFileLimits.MaxManualWorkspaceFileBytes)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["Yalnızca mevcut, izinli kaynak dosyalarına 900 KiB sınırında içerik uygulanabilir."] });
    var root = WorkspaceRootPath;
    try
    {
        var result = await WorkspaceSecurity.ApplyFileContentAsync(root, workspaceId, request.ChangeId, request.Path, request.ExpectedSha256!,
            request.ProposedContent, cancellationToken, request.AllowEmptyContent);
        if (result.Applied) return Results.Ok(new WorkspaceFileApplyResponse(result.ChangeId!.Value, request.Path!, result.Sha256!, result.AppliedAt!.Value));
        return result.Error switch
        {
            "workspace_missing" or "file_missing" => Results.NotFound(new { error = "Çalışma alanı veya dosya bulunamadı." }),
            "stale" => Results.Conflict(new { error = "Dosya öneri oluşturulduktan sonra değişmiş. Güncel dosyayı yeniden açıp yeni öneri alın." }),
            "change_exists" or "change_limit" => Results.Conflict(new { error = "Değişiklik geçmişi sınırına ulaşıldı; yeni öneri uygulanamadı." }),
            "unsupported" => Results.StatusCode(StatusCodes.Status415UnsupportedMediaType),
            "too_large" => Results.StatusCode(StatusCodes.Status413PayloadTooLarge),
            "invalid_path" => Results.BadRequest(new { error = "Dosya yolu geçersiz veya yazılabilir kaynak kapsamı dışında." }),
            _ => Results.Problem("Dosya çalışma alanına uygulanamadı.", statusCode: StatusCodes.Status500InternalServerError)
        };
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (IOException) { return Results.Problem("Dosya çalışma alanına uygulanamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceWriter");
app.MapPost("/internal/workspaces/{workspaceId:guid}/apply-patches", async (Guid workspaceId, WorkspaceFilePatchApplyRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.ApprovalConfirmed || !WorkspaceSecurity.IsWritableSourcePath(request.Path) || !WorkspaceSecurity.IsSha256(request.ExpectedSha256) ||
        request.Patches is null || request.Patches.Count is 0 or > 20)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["patches"] = ["Açık onay, geçerli dosya özeti ve 1–20 güvenli dosya yaması gerekli."] });
    var root = WorkspaceRootPath;
    try
    {
        var result = await WorkspaceSecurity.ApplyFilePatchesAsync(root, workspaceId, request.ChangeId, request.Path!, request.ExpectedSha256!, request.Patches, cancellationToken);
        if (result.Applied) return Results.Ok(new WorkspaceFilePatchApplyResponse(result.ChangeId!.Value, request.Path!, result.Sha256!, result.AppliedAt!.Value));
        return result.Error switch
        {
            "workspace_missing" or "file_missing" => Results.NotFound(new { error = "Çalışma alanı veya dosya bulunamadı." }),
            "stale" => Results.Conflict(new { error = "Dosya taslak oluşturulduktan sonra değişmiş. Güncel dosya için yeni taslak oluşturun." }),
            "patch_mismatch" => Results.Conflict(new { error = "Yama metni dosyada tekil olarak bulunamadı. Güncel kaynakla yeni taslak oluşturun." }),
            "change_exists" or "change_limit" => Results.Conflict(new { error = "Değişiklik geçmişi sınırına ulaşıldı; öneri uygulanamadı." }),
            "unsupported" => Results.StatusCode(StatusCodes.Status415UnsupportedMediaType),
            "too_large" => Results.StatusCode(StatusCodes.Status413PayloadTooLarge),
            "invalid_path" => Results.BadRequest(new { error = "Dosya yolu geçersiz veya yazılabilir kaynak kapsamı dışında." }),
            _ => Results.Problem("Dosya yamaları çalışma alanına uygulanamadı.", statusCode: StatusCodes.Status500InternalServerError)
        };
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (IOException) { return Results.Problem("Dosya yamaları çalışma alanına uygulanamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServicePatcher");
app.MapGet("/internal/workspaces/{workspaceId:guid}/new-file-target", (Guid workspaceId, string? path, ClaimsPrincipal caller, IConfiguration configuration) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!WorkspaceSecurity.IsWritableSourcePath(path)) return Results.BadRequest(new { error = "Yeni dosya yolu izinli kaynak kapsamı dışında." });
    var root = WorkspaceRootPath;
    if (!WorkspaceSecurity.TryResolveNewFile(root, workspaceId, path, out _, out var error, allowMissingParentDirectories: true))
        return error switch
        {
            "workspace_missing" => Results.NotFound(new { error = "Çalışma alanı bulunamadı." }),
            "file_exists" => Results.Conflict(new { error = "Bu yol çalışma alanında zaten var." }),
            _ => Results.BadRequest(new { error = error ?? "Yeni dosya yolu geçersiz." })
        };
    return Results.Ok(new { path, exists = false });
}).RequireAuthorization("AIServiceFileCreator");
app.MapPost("/internal/workspaces/{workspaceId:guid}/create-file", async (Guid workspaceId, WorkspaceFileCreateRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.ApprovalConfirmed || !WorkspaceSecurity.IsWritableSourcePath(request.Path) ||
        !string.Equals(request.ExpectedSha256, WorkspaceSecurity.EmptyFileSha256, StringComparison.OrdinalIgnoreCase) ||
        string.IsNullOrWhiteSpace(request.ProposedContent) || request.ProposedContent.Contains('\0') || Encoding.UTF8.GetByteCount(request.ProposedContent) > 128 * 1024)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["Açık onay, boş dosya özeti ve 128 KiB sınırında izinli kaynak içeriği gerekli."] });
    var root = WorkspaceRootPath;
    try
    {
        var result = await WorkspaceSecurity.CreateFileContentAsync(root, workspaceId, request.ChangeId, request.Path!, request.ProposedContent!, cancellationToken);
        if (result.Applied) return Results.Ok(new WorkspaceFileApplyResponse(result.ChangeId!.Value, request.Path!, result.Sha256!, result.AppliedAt!.Value));
        return result.Error switch
        {
            "workspace_missing" => Results.NotFound(new { error = "Çalışma alanı bulunamadı." }),
            "file_exists" or "change_exists" or "change_limit" => Results.Conflict(new { error = "Dosya yolu zaten var veya değişiklik geçmişi sınırına ulaşıldı." }),
            "unsupported" => Results.StatusCode(StatusCodes.Status415UnsupportedMediaType),
            "too_large" => Results.StatusCode(StatusCodes.Status413PayloadTooLarge),
            "invalid_path" => Results.BadRequest(new { error = "Dosya yolu geçersiz veya yazılabilir kaynak kapsamı dışında." }),
            _ => Results.Problem("Yeni kaynak dosyası oluşturulamadı.", statusCode: StatusCodes.Status500InternalServerError)
        };
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (IOException) { return Results.Problem("Yeni kaynak dosyası oluşturulamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceFileCreator");
app.MapGet("/internal/workspaces/{workspaceId:guid}/changes", async (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    if (!WorkspaceSecurity.TryResolveDirectory(root, workspaceId, null, out _, out var error))
        return error == "workspace_missing" ? Results.NotFound(new { error = "Çalışma alanı bulunamadı." }) : Results.BadRequest(new { error = error ?? "Çalışma alanı yolu geçersiz." });
    try { return Results.Ok(await WorkspaceSecurity.GetChangesAsync(root, workspaceId, cancellationToken)); }
    catch (IOException) { return Results.Problem("Değişiklik geçmişi okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
}).RequireAuthorization("AIServiceChangeReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/changes/{changeId:guid}", async (Guid workspaceId, Guid changeId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    try
    {
        var diff = await WorkspaceSecurity.GetChangeDiffAsync(root, workspaceId, changeId, cancellationToken);
        return diff is null ? Results.NotFound(new { error = "Değişiklik kaydı bulunamadı." }) : Results.Ok(diff);
    }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (IOException) { return Results.Problem("Değişiklik karşılaştırması okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
}).RequireAuthorization("AIServiceChangeReader");
app.MapPost("/internal/workspaces/{workspaceId:guid}/changes/{changeId:guid}/restore", async (Guid workspaceId, Guid changeId, WorkspaceFileRestoreRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.ApprovalConfirmed || !WorkspaceSecurity.IsSha256(request.ExpectedSha256))
        return Results.BadRequest(new { error = "Açık onay ve geçerli dosya özeti gerekli." });
    var root = WorkspaceRootPath;
    try
    {
        var result = await WorkspaceSecurity.RestoreChangeAsync(root, workspaceId, changeId, request.ExpectedSha256!, cancellationToken);
        if (result.Restored) return Results.Ok(new WorkspaceFileRestoreResponse(changeId, result.Path!, result.Sha256!));
        return result.Error switch
        {
            "workspace_missing" or "change_missing" or "file_missing" => Results.NotFound(new { error = "Çalışma alanı, değişiklik veya dosya bulunamadı." }),
            "stale" => Results.Conflict(new { error = "Dosya geçmiş kaydından sonra değişmiş. Üzerine yazmamak için geri alma durduruldu." }),
            "already_restored" => Results.Conflict(new { error = "Bu değişiklik daha önce geri alınmış." }),
            "too_large" => Results.StatusCode(StatusCodes.Status413PayloadTooLarge),
            "invalid_path" => Results.BadRequest(new { error = "Geri alınacak dosya güvenli kapsam dışında." }),
            _ => Results.Problem("Dosya değişikliği geri alınamadı.", statusCode: StatusCodes.Status500InternalServerError)
        };
    }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (IOException) { return Results.Problem("Dosya değişikliği geri alınamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceChangeRestorer");
app.MapPost("/internal/workspaces/{workspaceId:guid}/commit-approved-changes", async (Guid workspaceId, WorkspaceApprovedCommitRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (!request.ApprovalConfirmed) return Results.BadRequest(new { error = "Açık commit onayı gerekli." });
    var root = WorkspaceRootPath;
    try
    {
        await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
        WorkspaceCommitResult result;
        try
        {
            result = await WorkspaceSecurity.CommitApprovedChangesAsync(root, workspaceId, request.ExpectedHeadCommitSha,
                request.Message, request.Files ?? [], cancellationToken);
        }
        finally { WorkspaceSecurity.Gate.Release(); }
        return result.Error switch
        {
            null => Results.Ok(new WorkspaceCommitResponse(workspaceId, result.BranchName!, result.ParentCommitSha!, result.CommitSha!, result.Files!)),
            "workspace_missing" => Results.NotFound(new { error = "Çalışma alanı bulunamadı." }),
            "invalid_request" => Results.BadRequest(new { error = "Commit mesajı, dosya listesi veya onay geçersiz." }),
            "stale_head" => Results.Conflict(new { error = "HEAD commit değişmiş. Git durumunu yenileyip tekrar deneyin." }),
            "staged_changes" => Results.Conflict(new { error = "Önceden stage edilmiş değişiklik bulundu; commit güvenlik için durduruldu." }),
            "unapproved_changes" => Results.Conflict(new { error = "Çalışma ağacındaki tüm değişiklikler mevcut Studio onayı ve hash kayıtlarıyla eşleşmiyor." }),
            "unsafe_path" => Results.BadRequest(new { error = "Commit listesinde güvenli olmayan veya desteklenmeyen bir dosya yolu var." }),
            "git_error" => Results.Problem("Onaylı değişiklikler izole dala commit edilemedi.", statusCode: StatusCodes.Status500InternalServerError),
            _ => Results.Problem("Onaylı değişiklikler commit edilemedi.", statusCode: StatusCodes.Status500InternalServerError)
        };
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
    catch (OperationCanceledException) { return Results.Problem("Git commit zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (IOException) { return Results.Problem("Git commit işlemi tamamlanamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceApprovedChangeCommitter");
app.MapGet("/internal/workspaces/{workspaceId:guid}/analysis", (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    try { return Results.Ok(WorkspaceSecurity.AnalyzeWorkspace(root, workspaceId)); }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (IOException) { return Results.Problem("Proje dosya envanteri okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceAnalyzer");
app.MapGet("/internal/workspaces/{workspaceId:guid}/test-discovery", (Guid workspaceId, ClaimsPrincipal caller, IConfiguration configuration) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var root = WorkspaceRootPath;
    try { return Results.Ok(WorkspaceSecurity.DiscoverTests(root, workspaceId)); }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (IOException) { return Results.Problem("Test hedefleri okunamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceTestDiscoverer");
app.MapPost("/internal/workspaces/{workspaceId:guid}/test-runs", async (Guid workspaceId, WorkspaceTestRunRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    const int maxPendingTestJobs = 8;
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var isDotNetTarget = WorkspaceSecurity.IsSafeDotNetTestTarget(request.TargetPath);
    var isNodeTarget = WorkspaceSecurity.IsSafeNodeTestTarget(request.TargetPath);
    var isPythonTarget = WorkspaceSecurity.IsSafePythonTestTarget(request.TargetPath);
    var isGoTarget = WorkspaceSecurity.IsSafeGoTestTarget(request.TargetPath);
    var isRustTarget = WorkspaceSecurity.IsSafeRustTestTarget(request.TargetPath);
    var isJavaTarget = WorkspaceSecurity.IsSafeJavaTarget(request.TargetPath);
    if (!isDotNetTarget && !isNodeTarget && !isPythonTarget && !isGoTarget && !isRustTarget && !isJavaTarget) return Results.BadRequest(new { error = "Yalnız güvenli bir .NET, Node.js, Python, Go, Rust veya Java test hedefi seçilebilir." });
    var workspaceRoot = WorkspaceRootPath;
    var jobRoot = TestJobRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    var jobId = Guid.NewGuid();
    var jobDirectory = string.Empty;
    try
    {
        if (!WorkspaceSecurity.TryResolveStorageChild(jobRoot, jobId.ToString("N"), out jobDirectory))
            return Results.Problem("Sandbox iş kuyruğu yolu güvenli değil.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (!Directory.Exists(jobRoot)) return Results.Problem("Sandbox iş kuyruğu yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
        foreach (var existingJobDirectory in Directory.EnumerateDirectories(jobRoot))
            await WorkspaceSecurity.ExpireStaleTestJobAsync(existingJobDirectory, cancellationToken);
        var pendingJobs = Directory.EnumerateDirectories(jobRoot)
            .Count(directory => !File.Exists(Path.Combine(directory, "result.json")));
        if (pendingJobs >= maxPendingTestJobs)
            return Results.Json(new { error = "Test sandbox kuyruğu dolu. Birkaç dakika sonra yeniden deneyin." }, statusCode: StatusCodes.Status429TooManyRequests);
        var discovery = WorkspaceSecurity.DiscoverTests(workspaceRoot, workspaceId);
        var ecosystem = isDotNetTarget ? ".NET" : isNodeTarget ? "Node.js" : isPythonTarget ? "Python" : isGoTarget ? "Go" : isRustTarget ? "Rust" : "Java";
        if (!discovery.Targets.Any(x => x.Ecosystem == ecosystem && x.CanTest && string.Equals(x.Path, request.TargetPath, StringComparison.Ordinal)))
            return Results.Conflict(new { error = "Seçilen proje güncel test keşfinde bulunamadı. Hedefleri yeniden keşfedin." });
        var status = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(workspaceRoot, workspaceId, cancellationToken);
        if (status is null) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
        Directory.CreateDirectory(jobDirectory);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(jobDirectory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var archivePath = Path.Combine(jobDirectory, "source.zip");
        await WorkspaceSecurity.CreateTestSnapshotAsync(workspaceRoot, workspaceId, request.TargetPath!, archivePath, cancellationToken);
        await using var snapshotStream = File.OpenRead(archivePath);
        var snapshotHash = Convert.ToHexString(await SHA256.HashDataAsync(snapshotStream, cancellationToken));
        var manifest = new WorkspaceSandboxJob(jobId, workspaceId, request.TargetPath!, status.HeadCommitSha, snapshotHash, status.TotalChangedFiles > 0, DateTimeOffset.UtcNow);
        var temporaryManifest = Path.Combine(jobDirectory, "job.tmp");
        await File.WriteAllTextAsync(temporaryManifest, System.Text.Json.JsonSerializer.Serialize(manifest), cancellationToken);
        File.Move(temporaryManifest, Path.Combine(jobDirectory, "job.json"));
        return Results.Accepted($"/internal/workspaces/{workspaceId:D}/test-runs/{jobId:D}", new WorkspaceTestRunCreated(jobId, manifest.TargetPath, manifest.CommitSha, manifest.SnapshotSha256, manifest.HasUncommittedChanges, manifest.CreatedAt));
    }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (InvalidDataException exception) { if (Directory.Exists(jobDirectory)) Directory.Delete(jobDirectory, recursive: true); return Results.Conflict(new { error = exception.Message }); }
    catch (IOException) { if (Directory.Exists(jobDirectory)) Directory.Delete(jobDirectory, recursive: true); return Results.Problem("Test için güvenli kaynak anlık görüntüsü hazırlanamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    finally { WorkspaceSecurity.Gate.Release(); }
}).RequireAuthorization("AIServiceTestExecutor");
app.MapPost("/internal/workspaces/{workspaceId:guid}/build-runs", async (Guid workspaceId, WorkspaceBuildRunRequest request, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    const int maxPendingJobs = 8;
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    var isDotNetTarget = WorkspaceSecurity.IsSafeDotNetTestTarget(request.TargetPath);
    var isNodeTarget = WorkspaceSecurity.IsSafeNodeTestTarget(request.TargetPath);
    var isPythonTarget = WorkspaceSecurity.IsSafePythonTestTarget(request.TargetPath);
    var isGoTarget = WorkspaceSecurity.IsSafeGoBuildTarget(request.TargetPath);
    var isRustTarget = WorkspaceSecurity.IsSafeRustTestTarget(request.TargetPath);
    var isJavaTarget = WorkspaceSecurity.IsSafeJavaTarget(request.TargetPath);
    if (!isDotNetTarget && !isNodeTarget && !isPythonTarget && !isGoTarget && !isRustTarget && !isJavaTarget)
        return Results.BadRequest(new { error = "Yalnız güvenli bir .NET, Node.js, Python, Go, Rust veya Java build hedefi seçilebilir." });
    var workspaceRoot = WorkspaceRootPath;
    var jobRoot = TestJobRootPath;
    await WorkspaceSecurity.Gate.WaitAsync(cancellationToken);
    var jobId = Guid.NewGuid();
    var jobDirectory = string.Empty;
    try
    {
        if (!WorkspaceSecurity.TryResolveStorageChild(jobRoot, jobId.ToString("N"), out jobDirectory))
            return Results.Problem("Sandbox iş kuyruğu yolu güvenli değil.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (!Directory.Exists(jobRoot)) return Results.Problem("Sandbox iş kuyruğu yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
        foreach (var existingJobDirectory in Directory.EnumerateDirectories(jobRoot))
            await WorkspaceSecurity.ExpireStaleTestJobAsync(existingJobDirectory, cancellationToken);
        if (Directory.EnumerateDirectories(jobRoot).Count(directory => !File.Exists(Path.Combine(directory, "result.json"))) >= maxPendingJobs)
            return Results.Json(new { error = "Sandbox kuyruğu dolu. Birkaç dakika sonra yeniden deneyin." }, statusCode: StatusCodes.Status429TooManyRequests);
        var discovery = WorkspaceSecurity.DiscoverTests(workspaceRoot, workspaceId);
        var ecosystem = isDotNetTarget ? ".NET" : isNodeTarget ? "Node.js" : isPythonTarget ? "Python" : isGoTarget ? "Go" : isRustTarget ? "Rust" : "Java";
        if (!discovery.Targets.Any(x => x.Ecosystem == ecosystem && x.CanBuild && string.Equals(x.Path, request.TargetPath, StringComparison.Ordinal)))
            return Results.Conflict(new { error = "Seçilen hedef güncel keşifte build edilebilir olarak bulunamadı. Hedefleri yeniden keşfedin." });
        var status = await WorkspaceSecurity.GetWorkspaceGitStatusAsync(workspaceRoot, workspaceId, cancellationToken);
        if (status is null) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
        Directory.CreateDirectory(jobDirectory);
        if (OperatingSystem.IsLinux()) File.SetUnixFileMode(jobDirectory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var archivePath = Path.Combine(jobDirectory, "source.zip");
        await WorkspaceSecurity.CreateTestSnapshotAsync(workspaceRoot, workspaceId, request.TargetPath!, archivePath, cancellationToken);
        await using var snapshotStream = File.OpenRead(archivePath);
        var snapshotHash = Convert.ToHexString(await SHA256.HashDataAsync(snapshotStream, cancellationToken));
        var manifest = new WorkspaceSandboxJob(jobId, workspaceId, request.TargetPath!, status.HeadCommitSha, snapshotHash, status.TotalChangedFiles > 0, DateTimeOffset.UtcNow, "build");
        var temporaryManifest = Path.Combine(jobDirectory, "job.tmp");
        await File.WriteAllTextAsync(temporaryManifest, System.Text.Json.JsonSerializer.Serialize(manifest), cancellationToken);
        File.Move(temporaryManifest, Path.Combine(jobDirectory, "job.json"));
        return Results.Accepted($"/internal/workspaces/{workspaceId:D}/build-runs/{jobId:D}", new WorkspaceTestRunCreated(jobId, manifest.TargetPath, manifest.CommitSha, manifest.SnapshotSha256, manifest.HasUncommittedChanges, manifest.CreatedAt));
    }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (InvalidDataException exception) { if (Directory.Exists(jobDirectory)) Directory.Delete(jobDirectory, recursive: true); return Results.Conflict(new { error = exception.Message }); }
    catch (IOException) { if (Directory.Exists(jobDirectory)) Directory.Delete(jobDirectory, recursive: true); return Results.Problem("Build için güvenli kaynak anlık görüntüsü hazırlanamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    finally { WorkspaceSecurity.Gate.Release(); }
}).RequireAuthorization("AIServiceBuildExecutor");
app.MapGet("/internal/workspaces/{workspaceId:guid}/build-runs/{jobId:guid}", async (Guid workspaceId, Guid jobId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (jobId == Guid.Empty) return Results.BadRequest(new { error = "Build işi kimliği geçersiz." });
    var root = TestJobRootPath;
    if (!WorkspaceSecurity.TryResolveStorageChild(root, jobId.ToString("N"), out var jobDirectory)) return Results.NotFound();
    if (!Directory.Exists(jobDirectory)) return Results.NotFound();
    try
    {
        var options = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);
        await using var manifestStream = File.OpenRead(Path.Combine(jobDirectory, "job.json"));
        var manifest = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxJob>(manifestStream, options, cancellationToken);
        if (manifest is null || manifest.Operation != "build" || manifest.WorkspaceId != workspaceId || manifest.Id != jobId) return Results.NotFound();
        await WorkspaceSecurity.ExpireStaleTestJobAsync(jobDirectory, cancellationToken);
        var resultPath = Path.Combine(jobDirectory, "result.json");
        if (!File.Exists(resultPath)) return Results.Ok(new WorkspaceTestRunStatus(jobId, manifest.TargetPath, manifest.CommitSha, manifest.SnapshotSha256, manifest.HasUncommittedChanges, "Queued", "Sandbox build işi bekliyor veya çalışıyor.", null, null, 0, "", null));
        await using var resultStream = File.OpenRead(resultPath);
        var result = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxTestResult>(resultStream, options, cancellationToken);
        return result is null ? Results.Problem("Sandbox geçersiz build sonucu döndürdü.", statusCode: StatusCodes.Status502BadGateway)
            : Results.Ok(new WorkspaceTestRunStatus(jobId, manifest.TargetPath, manifest.CommitSha, manifest.SnapshotSha256, manifest.HasUncommittedChanges, result.Status, result.Message, result.Success, result.ExitCode, result.DurationMilliseconds, result.Output, File.GetLastWriteTimeUtc(resultPath)));
    }
    catch (System.Text.Json.JsonException) { return Results.Problem("Sandbox build sonucu okunamadı.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization("AIServiceBuildJobReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/test-runs/{jobId:guid}", async (Guid workspaceId, Guid jobId, ClaimsPrincipal caller, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (jobId == Guid.Empty) return Results.BadRequest(new { error = "Test işi kimliği geçersiz." });
    var root = TestJobRootPath;
    if (!WorkspaceSecurity.TryResolveStorageChild(root, jobId.ToString("N"), out var jobDirectory)) return Results.NotFound();
    var resultPath = Path.Combine(jobDirectory, "result.json");
    if (!Directory.Exists(jobDirectory)) return Results.NotFound();
    try
    {
        var jsonOptions = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);
        var manifestPath = Path.Combine(jobDirectory, "job.json");
        await using var manifestStream = File.OpenRead(manifestPath);
        var manifest = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxJob>(manifestStream, jsonOptions, cancellationToken);
        if (manifest is null || manifest.WorkspaceId != workspaceId || manifest.Id != jobId) return Results.NotFound();
        await WorkspaceSecurity.ExpireStaleTestJobAsync(jobDirectory, cancellationToken);
        if (!File.Exists(resultPath)) return Results.Ok(new WorkspaceTestRunStatus(jobId, manifest.TargetPath, manifest.CommitSha, manifest.SnapshotSha256, manifest.HasUncommittedChanges, "Queued", "Sandbox işi bekliyor veya çalışıyor.", null, null, 0, "", null));
        await using var resultStream = File.OpenRead(resultPath);
        var result = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxTestResult>(resultStream, jsonOptions, cancellationToken);
        return result is null ? Results.Problem("Sandbox geçersiz sonuç döndürdü.", statusCode: StatusCodes.Status502BadGateway)
            : Results.Ok(new WorkspaceTestRunStatus(jobId, manifest.TargetPath, manifest.CommitSha, manifest.SnapshotSha256, manifest.HasUncommittedChanges, result.Status, result.Message, result.Success, result.ExitCode, result.DurationMilliseconds, result.Output, File.GetLastWriteTimeUtc(resultPath)));
    }
    catch (System.Text.Json.JsonException) { return Results.Problem("Sandbox sonucu okunamadı.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization("AIServiceTestJobReader");
app.MapGet("/internal/workspaces/{workspaceId:guid}/search", (Guid workspaceId, string? query, ClaimsPrincipal caller, IConfiguration configuration) =>
{
    if (!WorkspaceSecurity.IsWorkspaceScopedServiceCaller(caller, workspaceId)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(query) || query.Length > 120 || query.Any(char.IsControl))
        return Results.BadRequest(new { error = "Arama metni 1–120 karakter olmalı." });
    var root = WorkspaceRootPath;
    try { return Results.Ok(WorkspaceSecurity.SearchWorkspace(root, workspaceId, query.Trim())); }
    catch (DirectoryNotFoundException) { return Results.NotFound(new { error = "Çalışma alanı bulunamadı." }); }
    catch (IOException) { return Results.Problem("Çalışma alanında arama yapılamadı.", statusCode: StatusCodes.Status500InternalServerError); }
    catch (UnauthorizedAccessException) { return Results.Forbid(); }
}).RequireAuthorization("AIServiceWorkspaceSearcher");
app.Run();

internal sealed record ProvisionRequest(Guid WorkspaceId, string? RepositoryUrl, string? BranchName);
internal sealed record ProvisionResponse(Guid WorkspaceId, string CommitSha, string WorkspaceBranchName);
internal sealed record WorkspaceBranchResponse(Guid WorkspaceId, string BranchName, string CommitSha);
internal sealed record WorkspaceBranchResult(string? BranchName, string? CommitSha, string? Error);
internal sealed record RepositoryBranchesRequest(Guid ProjectId, string? RepositoryUrl);
internal sealed record RepositoryBranchesResponse(string? DefaultBranch, IReadOnlyList<string> Branches);
internal sealed record GitHostValidation(bool IsValid, Uri? Uri, string? Error);
internal sealed record WorkspaceFileEntry(string Name, string Path, string Kind, long? SizeBytes);
internal sealed record WorkspaceFileListing(string Path, IReadOnlyList<WorkspaceFileEntry> Entries, int? NextOffset);
internal sealed record WorkspaceFileSearchResult(int ScannedEntries, bool Truncated, IReadOnlyList<WorkspaceFileEntry> Entries);
internal sealed record WorkspaceFileContent(string Path, string Content, int SizeBytes, string Sha256);
internal sealed record WorkspaceFileHash(string Path, long SizeBytes, string Sha256);
internal sealed record WorkspaceFileApplyRequest(Guid ChangeId, string? Path, string? ExpectedSha256, string? ProposedContent, bool ApprovalConfirmed, bool AllowEmptyContent = false);
internal sealed record WorkspaceFilePatch(string? FindText, string? ReplaceText);
internal sealed record WorkspaceFilePatchApplyRequest(Guid ChangeId, string? Path, string? ExpectedSha256, IReadOnlyList<WorkspaceFilePatch>? Patches, bool ApprovalConfirmed);
internal sealed record WorkspaceFileCreateRequest(Guid ChangeId, string? Path, string? ExpectedSha256, string? ProposedContent, bool ApprovalConfirmed);
internal sealed record WorkspaceFileApplyResponse(Guid ChangeId, string Path, string Sha256, DateTimeOffset AppliedAt);
internal sealed record WorkspaceFilePatchApplyResponse(Guid ChangeId, string Path, string Sha256, DateTimeOffset AppliedAt);
internal sealed record WorkspaceFileRestoreRequest(string? ExpectedSha256, bool ApprovalConfirmed);
internal sealed record WorkspaceFileRestoreResponse(Guid ChangeId, string Path, string Sha256);
internal sealed record WorkspaceApprovedCommitRequest(string? ExpectedHeadCommitSha, string? Message, IReadOnlyList<WorkspaceApprovedCommitFile>? Files, bool ApprovalConfirmed);
internal sealed record PushApprovedBranchRequest(string? ExpectedHeadCommitSha, string? InstallationToken, bool ApprovalConfirmed);
internal sealed record CreateReleasePackageRequest(Guid PackageId, string? Version, string? CommitSha, Guid TestJobId, string? TestTargetPath, string? TestSnapshotSha256, bool Confirmation);
internal sealed record ReleasePackageResponse(Guid PackageId, string FileName, string Version, string CommitSha, string PackageSha256, long SizeBytes, int FileCount, DateTimeOffset CreatedAt);
internal sealed record ReleasePackageManifest(Guid PackageId, string Version, string CommitSha, Guid TestJobId, string TestTargetPath, string TestSnapshotSha256, DateTimeOffset CreatedAt, IReadOnlyList<ReleasePackageFile> Files);
internal sealed record ReleasePackageFile(string Path, string Sha256, long SizeBytes);
internal sealed record WorkspaceApprovedCommitFile(Guid ChangeId, string? Path, string? AppliedSha256);
internal sealed record WorkspaceCommitResponse(Guid WorkspaceId, string BranchName, string ParentCommitSha, string CommitSha, IReadOnlyList<string> Files);
internal sealed record WorkspaceChangesView(IReadOnlyList<WorkspaceChangeSummary> Changes, bool Truncated);
internal sealed record WorkspaceChangeSummary(Guid Id, string Path, string OriginalSha256, string AppliedSha256, DateTimeOffset AppliedAt, bool IsRestored, bool IsCurrent, bool WasCreated = false);
internal sealed record WorkspaceChangeDiff(Guid Id, string Path, string OriginalContent, string CurrentContent, string OriginalSha256, string AppliedSha256, DateTimeOffset AppliedAt, bool IsRestored, bool IsCurrent, bool WasCreated = false);
internal sealed record WorkspaceChangeBackup(Guid Id, Guid WorkspaceId, string Path, string OriginalContentBase64, string OriginalSha256, string AppliedSha256, DateTimeOffset AppliedAt, bool IsRestored, bool WasCreated = false);
internal sealed record WorkspaceFileRestoreResult(bool Restored, string? Error, string? Path, string? Sha256);
internal sealed record WorkspaceCommitResult(string? Error, string? BranchName = null, string? ParentCommitSha = null, string? CommitSha = null, IReadOnlyList<string>? Files = null);
internal sealed record WorkspaceAnalysis(int ScannedFiles, bool Truncated, IReadOnlyList<WorkspaceTechnologyCount> Technologies, IReadOnlyList<string> EntryPoints);
internal sealed record WorkspaceTechnologyCount(string Name, int FileCount);
internal sealed record WorkspaceTestDiscovery(int ScannedFiles, bool Truncated, IReadOnlyList<WorkspaceTestTarget> Targets);
internal sealed record WorkspaceSearchResult(int ScannedFiles, bool Truncated, IReadOnlyList<WorkspaceSearchMatch> Matches);
internal sealed record WorkspaceSearchMatch(string Path, int Line, string Excerpt);
internal sealed record WorkspaceTestTarget(string Path, string Ecosystem, string Evidence, string SuggestedCommand, bool CanTest = true, bool CanBuild = false);
internal sealed record WorkspaceTestRunRequest(string? TargetPath);
internal sealed record WorkspaceBuildRunRequest(string? TargetPath);
internal sealed record WorkspaceSandboxJob(Guid Id, Guid WorkspaceId, string TargetPath, string CommitSha, string SnapshotSha256, bool HasUncommittedChanges, DateTimeOffset CreatedAt, string Operation = "test");
internal sealed record WorkspaceTestRunCreated(Guid JobId, string TargetPath, string CommitSha, string SnapshotSha256, bool HasUncommittedChanges, DateTimeOffset CreatedAt);
internal sealed record WorkspaceSandboxTestResult(bool Success, string Status, string Message, int ExitCode, string Output, int DurationMilliseconds);
internal sealed record WorkspaceTestRunStatus(Guid JobId, string TargetPath, string CommitSha, string SnapshotSha256, bool HasUncommittedChanges, string Status, string? Message, bool? Success, int? ExitCode, int DurationMilliseconds, string Output, DateTime? CompletedAt);
internal sealed record WorkspaceGitStatus(string BranchName, string HeadCommitSha, int TotalChangedFiles, bool Truncated, IReadOnlyList<WorkspaceGitFileStatus> Files);
internal sealed record WorkspaceGitFileStatus(string Path, string Status);
internal sealed record WorkspaceGitDiff(string Path, string Status, string BaseContent, string CurrentContent, string BaseSha256, string CurrentSha256, string HeadCommitSha);
internal sealed record WorkspaceGitDiffResult(WorkspaceGitDiff? Diff, string? Error);
internal sealed record GitResult(int ExitCode, string Output, bool OutputTruncated = false);

internal static class WorkspaceSecurity
{
    private const int MaxSavedCodeChangesPerWorkspace = 200;
    internal const int MaxPatchableSourceBytes = 2 * 1024 * 1024;
    private const int MaxCodeChangeBackupBytes = 3 * 1024 * 1024;
    internal static readonly string EmptyFileSha256 = Convert.ToHexString(SHA256.HashData([]));
    internal static readonly SemaphoreSlim Gate = new(1, 1);
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, SemaphoreSlim> FileWriteGates = new();
    private static readonly HashSet<string> WritableSourceExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".cs", ".csx", ".razor", ".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".scss", ".sql", ".py", ".go", ".rs", ".java" };
    private static readonly HashSet<string> ExcludedDirectoryNames = new(StringComparer.OrdinalIgnoreCase)
        { ".git", ".vs", ".next", "node_modules", "bin", "obj", "dist", "build", "coverage", "packages", "vendor" };
    internal static IReadOnlyDictionary<string, string>? CreateGitHubReadEnvironment(Uri repositoryUri, string? installationToken)
    {
        if (string.IsNullOrWhiteSpace(installationToken)) return null;
        if (!string.Equals(repositoryUri.Host, "github.com", StringComparison.OrdinalIgnoreCase) ||
            installationToken.Length > 4096 || installationToken.Any(c => c < '!' || c > '~'))
            throw new InvalidOperationException("GitHub installation credential is invalid for this repository.");
        var credential = Convert.ToBase64String(Encoding.UTF8.GetBytes($"x-access-token:{installationToken}"));
        return new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["GIT_CONFIG_COUNT"] = "1",
            ["GIT_CONFIG_KEY_0"] = "http.extraheader",
            ["GIT_CONFIG_VALUE_0"] = $"AUTHORIZATION: basic {credential}"
        };
    }
    internal static async Task<GitHostValidation> ValidateRepositoryAsync(string? value, string[] allowedHosts, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var candidate) || candidate.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(candidate.UserInfo) || !string.IsNullOrEmpty(candidate.Query) || !string.IsNullOrEmpty(candidate.Fragment) ||
            candidate.IsDefaultPort == false || candidate.IsLoopback || IPAddress.TryParse(candidate.Host, out _) || candidate.AbsolutePath == "/")
            return new(false, null, "Depo adresi kimlik bilgisi içermeyen HTTPS Git deposu olmalıdır.");
        if (!allowedHosts.Any(host => string.Equals(candidate.IdnHost, host.Trim(), StringComparison.OrdinalIgnoreCase)))
            return new(false, null, "Depo sunucusu izinli değil.");
        try
        {
            var addresses = await Dns.GetHostAddressesAsync(candidate.DnsSafeHost, cancellationToken).WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
            if (addresses.Length == 0 || addresses.Any(IsPrivateAddress)) return new(false, null, "Depo sunucusu genel internet adresine çözülmüyor.");
        }
        catch (SocketException) { return new(false, null, "Depo sunucusuna ulaşılamadı."); }
        catch (TimeoutException) { return new(false, null, "Depo sunucusu doğrulaması zaman aşımına uğradı."); }
        return new(true, candidate, null);
    }
    internal static bool TryResolveDirectory(string root, Guid workspaceId, string? relativePath, out string? directory, out string? error)
    {
        directory = null; error = null;
        root = Path.GetFullPath(root);
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        var rootPrefix = Path.EndsInDirectorySeparator(root) ? root : root + Path.DirectorySeparatorChar;
        if (!workspace.StartsWith(rootPrefix, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal) ||
            HasReparsePointInPath(root) || HasReparsePointInPath(workspace) || !Directory.Exists(workspace))
        { error = "workspace_missing"; return false; }
        var gitDirectory = Path.Combine(workspace, ".git");
        if (!Directory.Exists(gitDirectory) || HasReparsePointInPath(gitDirectory))
        { error = "workspace_missing"; return false; }
        var current = workspace;
        if (!string.IsNullOrEmpty(relativePath))
        {
            if (relativePath.StartsWith('/') || relativePath.Contains('\\') || relativePath.Contains(':') || relativePath.Length > 500)
            { error = "Dosya yolu geçersiz."; return false; }
            foreach (var segment in relativePath.Split('/'))
            {
                if (segment.Length == 0 || segment is "." or ".." || HasWindowsTrailingDotOrSpace(segment) ||
                    string.Equals(segment, ".git", StringComparison.OrdinalIgnoreCase) || segment.Any(char.IsControl))
                { error = "Dosya yolu geçersiz."; return false; }
                current = Path.GetFullPath(Path.Combine(current, segment));
                if (!current.StartsWith(workspace + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                { error = "Dosya yolu workspace dışına çıkamaz."; return false; }
                if (!Directory.Exists(current)) { error = "Klasör bulunamadı."; return false; }
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                { error = "Bağlantı üzerinden klasör gezintisine izin verilmiyor."; return false; }
            }
        }
        directory = current; return true;
    }
    internal static bool HasReparsePointInPath(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var pathRoot = Path.GetPathRoot(fullPath);
        if (string.IsNullOrEmpty(pathRoot)) return true;
        var current = pathRoot;
        foreach (var segment in fullPath[pathRoot.Length..].Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            if (segment.Length == 0) continue;
            current = Path.Combine(current, segment);
            try
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return true;
            }
            catch (FileNotFoundException) { return false; }
            catch (DirectoryNotFoundException) { return false; }
        }
        return false;
    }
    internal static bool TryResolveStorageChild(string root, string childName, out string path)
    {
        path = null!;
        if (string.IsNullOrWhiteSpace(root) || string.IsNullOrWhiteSpace(childName) ||
            childName.IndexOfAny([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar, ':']) >= 0 ||
            childName is "." or "..") return false;
        var fullRoot = Path.GetFullPath(root);
        var candidate = Path.GetFullPath(Path.Combine(fullRoot, childName));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var prefix = Path.EndsInDirectorySeparator(fullRoot) ? fullRoot : fullRoot + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(prefix, comparison) || HasReparsePointInPath(fullRoot) || HasReparsePointInPath(candidate)) return false;
        path = candidate;
        return true;
    }
    internal static bool TryResolveFile(string root, Guid workspaceId, string? relativePath, out string? filePath, out string? error)
    {
        filePath = null; error = null;
        if (string.IsNullOrWhiteSpace(relativePath) || relativePath.StartsWith('/') || relativePath.Contains('\\') ||
            relativePath.Contains(':') || relativePath.Length > 500 || relativePath.Any(char.IsControl))
        { error = "Dosya yolu geçersiz."; return false; }
        // The runner's file-content endpoint is used by AI services. Never let it read
        // conventional local secret files, even when they are regular files in the checkout.
        if (IsSensitiveReadPath(relativePath))
        { error = "Dosya yolu güvenli kapsam dışında."; return false; }
        var separator = relativePath.LastIndexOf('/');
        var parent = separator < 0 ? "" : relativePath[..separator];
        var name = separator < 0 ? relativePath : relativePath[(separator + 1)..];
        if (string.IsNullOrWhiteSpace(name) || name is "." or ".." || HasWindowsTrailingDotOrSpace(name) ||
            string.Equals(name, ".git", StringComparison.OrdinalIgnoreCase))
        { error = "Dosya yolu geçersiz."; return false; }
        if (!TryResolveDirectory(root, workspaceId, parent, out var directory, out error)) return false;
        var candidate = Path.GetFullPath(Path.Combine(directory!, name));
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        if (!candidate.StartsWith(workspace + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        { error = "Dosya yolu workspace dışına çıkamaz."; return false; }
        if (!File.Exists(candidate)) { error = "file_missing"; return false; }
        if ((File.GetAttributes(candidate) & FileAttributes.ReparsePoint) != 0)
        { error = "Sembolik bağlantı dosyaları açılamaz."; return false; }
        filePath = candidate; return true;
    }
    private static bool IsSensitiveReadPath(string path) => path.Split('/').Any(segment =>
        segment.Equals(".env", StringComparison.OrdinalIgnoreCase) ||
        segment.StartsWith(".env.", StringComparison.OrdinalIgnoreCase) ||
        segment.Contains("secret", StringComparison.OrdinalIgnoreCase) ||
        segment.Contains("credential", StringComparison.OrdinalIgnoreCase));
    internal static bool TryResolveNewFile(string root, Guid workspaceId, string? relativePath, out string? filePath, out string? error,
        bool allowMissingParentDirectories = false)
    {
        filePath = null; error = null;
        if (string.IsNullOrWhiteSpace(relativePath) || relativePath.StartsWith('/') || relativePath.Contains('\\') ||
            relativePath.Contains(':') || relativePath.Length > 500 || relativePath.Any(char.IsControl))
        { error = "Dosya yolu geçersiz."; return false; }
        var separator = relativePath.LastIndexOf('/');
        var parent = separator < 0 ? "" : relativePath[..separator];
        var name = separator < 0 ? relativePath : relativePath[(separator + 1)..];
        if (string.IsNullOrWhiteSpace(name) || name is "." or ".." || HasWindowsTrailingDotOrSpace(name) ||
            string.Equals(name, ".git", StringComparison.OrdinalIgnoreCase))
        { error = "Dosya yolu geçersiz."; return false; }
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        if (!TryResolveDirectory(root, workspaceId, null, out _, out error)) return false;
        var rootPrefix = Path.EndsInDirectorySeparator(workspace) ? workspace : workspace + Path.DirectorySeparatorChar;
        var directory = workspace;
        if (!string.IsNullOrEmpty(parent))
        {
            foreach (var segment in parent.Split('/'))
            {
                if (segment.Length == 0 || segment is "." or ".." || HasWindowsTrailingDotOrSpace(segment) ||
                    string.Equals(segment, ".git", StringComparison.OrdinalIgnoreCase) || segment.Any(char.IsControl))
                { error = "Dosya yolu geçersiz."; return false; }
                var next = Path.GetFullPath(Path.Combine(directory, segment));
                if (!next.StartsWith(rootPrefix, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
                { error = "Dosya yolu workspace dışına çıkamaz."; return false; }
                if (Directory.Exists(next))
                {
                    if ((File.GetAttributes(next) & FileAttributes.ReparsePoint) != 0)
                    { error = "Bağlantı üzerinden klasör gezintisine izin verilmiyor."; return false; }
                }
                else if (File.Exists(next) || !allowMissingParentDirectories)
                { error = "Klasör bulunamadı."; return false; }
                directory = next;
            }
        }
        var candidate = Path.GetFullPath(Path.Combine(directory, name));
        if (!candidate.StartsWith(rootPrefix, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
        { error = "Dosya yolu workspace dışına çıkamaz."; return false; }
        if (File.Exists(candidate) || Directory.Exists(candidate)) { error = "file_exists"; return false; }
        filePath = candidate; return true;
    }
    private static bool EnsureSafeNewFileParentDirectories(string root, Guid workspaceId, string relativePath, out string? error)
    {
        error = null;
        var separator = relativePath.LastIndexOf('/');
        var parent = separator < 0 ? "" : relativePath[..separator];
        if (string.IsNullOrEmpty(parent)) return TryResolveDirectory(root, workspaceId, null, out _, out error);
        if (!TryResolveDirectory(root, workspaceId, null, out _, out error)) return false;
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        var rootPrefix = Path.EndsInDirectorySeparator(workspace) ? workspace : workspace + Path.DirectorySeparatorChar;
        var current = workspace;
        foreach (var segment in parent.Split('/'))
        {
            if (segment.Length == 0 || segment is "." or ".." || HasWindowsTrailingDotOrSpace(segment) ||
                string.Equals(segment, ".git", StringComparison.OrdinalIgnoreCase) || segment.Any(char.IsControl))
            { error = "Dosya yolu geçersiz."; return false; }
            var next = Path.GetFullPath(Path.Combine(current, segment));
            if (!next.StartsWith(rootPrefix, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
            { error = "Dosya yolu workspace dışına çıkamaz."; return false; }
            if (Directory.Exists(next))
            {
                if ((File.GetAttributes(next) & FileAttributes.ReparsePoint) != 0)
                { error = "Bağlantı üzerinden klasör gezintisine izin verilmiyor."; return false; }
            }
            else if (File.Exists(next))
            { error = "Klasör bulunamadı."; return false; }
            else
            {
                Directory.CreateDirectory(next);
                if (!Directory.Exists(next) || (File.GetAttributes(next) & FileAttributes.ReparsePoint) != 0)
                { error = "Yeni dosya klasörü güvenli biçimde oluşturulamadı."; return false; }
            }
            current = next;
        }
        return true;
    }
    private static bool HasWindowsTrailingDotOrSpace(string segment) => OperatingSystem.IsWindows() &&
        (segment.EndsWith(' ') || segment.EndsWith('.'));
    internal static bool IsWritableSourcePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 500 || path.StartsWith('/') || path.Contains('\\') || path.Contains(':') || path.Any(char.IsControl)) return false;
        var segments = path.Split('/');
        if (segments.Any(segment => string.IsNullOrWhiteSpace(segment) || segment is "." or ".." || segment.StartsWith('.') ||
            segment.Contains("secret", StringComparison.OrdinalIgnoreCase) || segment.Contains("credential", StringComparison.OrdinalIgnoreCase))) return false;
        var extension = Path.GetExtension(path);
        return WritableSourceExtensions.Contains(extension) ||
            (segments[0].Equals("modules", StringComparison.OrdinalIgnoreCase) &&
             (extension.Equals(".json", StringComparison.OrdinalIgnoreCase) || extension.Equals(".toml", StringComparison.OrdinalIgnoreCase)));
    }
    private static bool IsCommitPath(string? path) => IsWritableSourcePath(path) && !path!.Contains(',');
    internal static async Task<WorkspaceFileApplyResult> ApplyFileContentAsync(string root, Guid workspaceId, Guid changeId, string? relativePath,
        string expectedSha256, string proposedContent, CancellationToken cancellationToken, bool allowEmptyContent = false)
    {
        if (changeId == Guid.Empty || !IsWritableSourcePath(relativePath) || !IsSha256(expectedSha256)) return new(false, "invalid_path", null);
        if ((string.IsNullOrWhiteSpace(proposedContent) && !allowEmptyContent) || proposedContent.Contains('\0')) return new(false, "unsupported", null);
        if (Encoding.UTF8.GetByteCount(proposedContent) > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(false, "too_large", null);
        var gate = FileWriteGates.GetOrAdd(workspaceId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!TryResolveFile(root, workspaceId, relativePath, out var filePath, out var error))
                return new(false, error is "workspace_missing" or "file_missing" ? error : "invalid_path", null);
            if (new FileInfo(filePath!).Length > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(false, "too_large", null);
            var currentBytes = await File.ReadAllBytesAsync(filePath!, cancellationToken);
            if (currentBytes.Length > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(false, "too_large", null);
            if (currentBytes.AsSpan().Contains((byte)0)) return new(false, "unsupported", null);
            try { _ = new UTF8Encoding(false, true).GetString(currentBytes); }
            catch (DecoderFallbackException) { return new(false, "unsupported", null); }
            var currentHash = Convert.ToHexString(SHA256.HashData(currentBytes));
            if (!string.Equals(currentHash, expectedSha256, StringComparison.OrdinalIgnoreCase)) return new(false, "stale", currentHash);

            var proposedBytes = Encoding.UTF8.GetBytes(proposedContent);
            var hasBom = currentBytes.Length >= 3 && currentBytes[0] == 0xEF && currentBytes[1] == 0xBB && currentBytes[2] == 0xBF;
            byte[] finalBytes = hasBom ? [0xEF, 0xBB, 0xBF, .. proposedBytes] : proposedBytes;
            var appliedAt = DateTimeOffset.UtcNow;
            var appliedHash = Convert.ToHexString(SHA256.HashData(finalBytes));
            var backup = new WorkspaceChangeBackup(changeId, workspaceId, relativePath!, Convert.ToBase64String(currentBytes), currentHash, appliedHash, appliedAt, false);
            var backupPath = GetChangeBackupPath(root, workspaceId, changeId);
            if (File.Exists(backupPath)) return new(false, "change_exists", null);
            var backupDirectory = GetChangeBackupDirectory(root, workspaceId);
            if (Directory.Exists(backupDirectory) && Directory.EnumerateFiles(backupDirectory, "*.json").Take(MaxSavedCodeChangesPerWorkspace).Count() >= MaxSavedCodeChangesPerWorkspace)
                return new(false, "change_limit", null);
            await WriteBackupAsync(backupPath, backup, cancellationToken);
            UnixFileMode? unixMode = OperatingSystem.IsLinux() ? File.GetUnixFileMode(filePath!) : null;
            try
            {
                await WriteBytesAtomicallyAsync(filePath!, finalBytes, unixMode, cancellationToken);
                return new(true, null, appliedHash, changeId, appliedAt);
            }
            catch
            {
                if (File.Exists(backupPath)) File.Delete(backupPath);
                throw;
            }
        }
        finally { gate.Release(); }
    }
    internal static async Task<WorkspaceFileApplyResult> ApplyFilePatchesAsync(string root, Guid workspaceId, Guid changeId, string? relativePath,
        string expectedSha256, IReadOnlyList<WorkspaceFilePatch> patches, CancellationToken cancellationToken)
    {
        if (changeId == Guid.Empty || !IsWritableSourcePath(relativePath) || !IsSha256(expectedSha256) || patches.Count is 0 or > 20)
            return new(false, "invalid_path", null);
        var patchBytes = patches.Sum(patch => Encoding.UTF8.GetByteCount(patch.FindText ?? "") + Encoding.UTF8.GetByteCount(patch.ReplaceText ?? ""));
        if (patchBytes > 64 * 1024 || patches.Any(patch => string.IsNullOrEmpty(patch.FindText) || patch.FindText.Length > 8 * 1024 ||
            patch.ReplaceText is null || patch.ReplaceText.Length > 8 * 1024 || patch.FindText == patch.ReplaceText ||
            patch.FindText.Contains('\0') || patch.ReplaceText.Contains('\0')))
            return new(false, "unsupported", null);

        var gate = FileWriteGates.GetOrAdd(workspaceId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!TryResolveFile(root, workspaceId, relativePath, out var filePath, out var error))
                return new(false, error is "workspace_missing" or "file_missing" ? error : "invalid_path", null);
            if (new FileInfo(filePath!).Length > MaxPatchableSourceBytes) return new(false, "too_large", null);
            var currentBytes = await File.ReadAllBytesAsync(filePath!, cancellationToken);
            if (currentBytes.Length > MaxPatchableSourceBytes) return new(false, "too_large", null);
            if (currentBytes.AsSpan().Contains((byte)0)) return new(false, "unsupported", null);
            string content;
            try { content = new UTF8Encoding(false, true).GetString(currentBytes); }
            catch (DecoderFallbackException) { return new(false, "unsupported", null); }
            var currentHash = Convert.ToHexString(SHA256.HashData(currentBytes));
            if (!string.Equals(currentHash, expectedSha256, StringComparison.OrdinalIgnoreCase)) return new(false, "stale", currentHash);
            var hasBom = content.StartsWith('\uFEFF');
            if (hasBom) content = content[1..];
            foreach (var patch in patches)
            {
                var findText = patch.FindText!;
                var replaceText = patch.ReplaceText!;
                var index = content.IndexOf(findText, StringComparison.Ordinal);
                if (index < 0 || content.IndexOf(findText, index + findText.Length, StringComparison.Ordinal) >= 0)
                    return new(false, "patch_mismatch", null);
                content = content[..index] + replaceText + content[(index + findText.Length)..];
            }
            var proposedBytes = Encoding.UTF8.GetBytes(content);
            byte[] finalBytes = hasBom ? [0xEF, 0xBB, 0xBF, .. proposedBytes] : proposedBytes;
            if (finalBytes.Length > MaxPatchableSourceBytes) return new(false, "too_large", null);
            var appliedAt = DateTimeOffset.UtcNow;
            var appliedHash = Convert.ToHexString(SHA256.HashData(finalBytes));
            var backup = new WorkspaceChangeBackup(changeId, workspaceId, relativePath!, Convert.ToBase64String(currentBytes), currentHash, appliedHash, appliedAt, false);
            var backupPath = GetChangeBackupPath(root, workspaceId, changeId);
            if (File.Exists(backupPath)) return new(false, "change_exists", null);
            var backupDirectory = GetChangeBackupDirectory(root, workspaceId);
            if (Directory.Exists(backupDirectory) && Directory.EnumerateFiles(backupDirectory, "*.json").Take(MaxSavedCodeChangesPerWorkspace).Count() >= MaxSavedCodeChangesPerWorkspace)
                return new(false, "change_limit", null);
            await WriteBackupAsync(backupPath, backup, cancellationToken);
            UnixFileMode? unixMode = OperatingSystem.IsLinux() ? File.GetUnixFileMode(filePath!) : null;
            try
            {
                await WriteBytesAtomicallyAsync(filePath!, finalBytes, unixMode, cancellationToken);
                return new(true, null, appliedHash, changeId, appliedAt);
            }
            catch
            {
                if (File.Exists(backupPath)) File.Delete(backupPath);
                throw;
            }
        }
        finally { gate.Release(); }
    }
    internal static async Task<WorkspaceFileApplyResult> CreateFileContentAsync(string root, Guid workspaceId, Guid changeId, string relativePath,
        string proposedContent, CancellationToken cancellationToken)
    {
        if (changeId == Guid.Empty || !IsWritableSourcePath(relativePath)) return new(false, "invalid_path", null);
        if (string.IsNullOrWhiteSpace(proposedContent) || proposedContent.Contains('\0')) return new(false, "unsupported", null);
        var bytes = Encoding.UTF8.GetBytes(proposedContent);
        if (bytes.Length > 128 * 1024) return new(false, "too_large", null);
        var gate = FileWriteGates.GetOrAdd(workspaceId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!TryResolveNewFile(root, workspaceId, relativePath, out var filePath, out var error, allowMissingParentDirectories: true))
                return new(false, error is "workspace_missing" ? error : error == "file_exists" ? error : "invalid_path", null);
            var appliedAt = DateTimeOffset.UtcNow;
            var appliedHash = Convert.ToHexString(SHA256.HashData(bytes));
            var changeBackup = new WorkspaceChangeBackup(changeId, workspaceId, relativePath, Convert.ToBase64String([]), EmptyFileSha256,
                appliedHash, appliedAt, false, true);
            var backupPath = GetChangeBackupPath(root, workspaceId, changeId);
            if (File.Exists(backupPath)) return new(false, "change_exists", null);
            var backupDirectory = GetChangeBackupDirectory(root, workspaceId);
            if (Directory.Exists(backupDirectory) && Directory.EnumerateFiles(backupDirectory, "*.json").Take(MaxSavedCodeChangesPerWorkspace).Count() >= MaxSavedCodeChangesPerWorkspace)
                return new(false, "change_limit", null);
            if (!EnsureSafeNewFileParentDirectories(root, workspaceId, relativePath, out error) ||
                !TryResolveNewFile(root, workspaceId, relativePath, out filePath, out error))
                return new(false, error is "workspace_missing" ? error : "invalid_path", null);
            await WriteBackupAsync(backupPath, changeBackup, cancellationToken);
            try
            {
                await WriteNewBytesAtomicallyAsync(filePath!, bytes, cancellationToken);
                return new(true, null, appliedHash, changeId, appliedAt);
            }
            catch (IOException) when (File.Exists(filePath!) || Directory.Exists(filePath!))
            {
                if (File.Exists(backupPath)) File.Delete(backupPath);
                return new(false, "file_exists", null);
            }
            catch
            {
                if (File.Exists(backupPath)) File.Delete(backupPath);
                throw;
            }
        }
        finally { gate.Release(); }
    }
    internal static async Task<WorkspaceCommitResult> CommitApprovedChangesAsync(string root, Guid workspaceId, string? expectedHeadCommitSha,
        string? message, IReadOnlyList<WorkspaceApprovedCommitFile> requestedFiles, CancellationToken cancellationToken)
    {
        if (workspaceId == Guid.Empty) return new("invalid_request");
        if (!TryResolveDirectory(root, workspaceId, null, out _, out var resolveError))
            return new(resolveError == "workspace_missing" ? "workspace_missing" : "invalid_request");
        if (!IsCommitSha(expectedHeadCommitSha ?? string.Empty) || string.IsNullOrWhiteSpace(message) || message.Length is < 8 or > 160 ||
            message.Any(char.IsControl) || requestedFiles.Count is 0 or > 100 ||
            requestedFiles.Any(file => file.ChangeId == Guid.Empty || !IsSha256(file.AppliedSha256) || !IsCommitPath(file.Path)) ||
            requestedFiles.Select(file => file.ChangeId).Distinct().Count() != requestedFiles.Count ||
            requestedFiles.Select(file => file.Path).Distinct(StringComparer.Ordinal).Count() != requestedFiles.Count)
            return new("invalid_request");

        var gate = FileWriteGates.GetOrAdd(workspaceId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        var indexPath = Path.Combine(Path.GetTempPath(), $"aierp-index-{workspaceId:N}-{Guid.NewGuid():N}");
        try
        {
            var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
            var status = await GetWorkspaceGitStatusAsync(root, workspaceId, cancellationToken);
            if (status is null) return new("workspace_missing");
            var expectedBranch = GetWorkspaceBranchName(workspaceId);
            if (!string.Equals(status.BranchName, expectedBranch, StringComparison.Ordinal) ||
                !string.Equals(status.HeadCommitSha, expectedHeadCommitSha, StringComparison.OrdinalIgnoreCase)) return new("stale_head");
            var gitDirectory = Path.Combine(workspace, ".git");
            if (!Directory.Exists(gitDirectory) || (File.GetAttributes(gitDirectory) & FileAttributes.ReparsePoint) != 0) return new("git_error");
            var gitIndexPath = Path.Combine(gitDirectory, "index");
            if (File.Exists(gitIndexPath) && (File.GetAttributes(gitIndexPath) & FileAttributes.ReparsePoint) != 0) return new("git_error");
            if (status.Truncated || status.Files.Count != requestedFiles.Count ||
                status.Files.Any(file => file.Status is not ("Modified" or "Added" or "Untracked")) ||
                !status.Files.Select(file => file.Path).ToHashSet(StringComparer.Ordinal).SetEquals(requestedFiles.Select(file => file.Path!)))
                return new("unapproved_changes");
            var unstagedOnly = await RunGit(root, ["-C", workspace, "-c", "core.hooksPath=/dev/null", "diff", "--cached", "--quiet"], TimeSpan.FromSeconds(20), cancellationToken);
            if (unstagedOnly.ExitCode != 0) return new("staged_changes");

            var currentChanges = await GetChangesAsync(root, workspaceId, cancellationToken);
            if (currentChanges.Truncated) return new("unapproved_changes");
            var changesById = currentChanges.Changes.ToDictionary(change => change.Id);
            foreach (var requested in requestedFiles)
            {
                if (!changesById.TryGetValue(requested.ChangeId, out var change) || change.IsRestored || !change.IsCurrent ||
                    !string.Equals(change.Path, requested.Path, StringComparison.Ordinal) ||
                    !string.Equals(change.AppliedSha256, requested.AppliedSha256, StringComparison.OrdinalIgnoreCase))
                    return new("unapproved_changes");
                if (!TryResolveFile(root, workspaceId, requested.Path!, out var filePath, out _)) return new("unapproved_changes");
                var info = new FileInfo(filePath!);
                if (info.Length > MaxPatchableSourceBytes) return new("unapproved_changes");
                var bytes = await File.ReadAllBytesAsync(filePath!, cancellationToken);
                var currentHash = Convert.ToHexString(SHA256.HashData(bytes));
                if (bytes.AsSpan().Contains((byte)0) || !string.Equals(currentHash, requested.AppliedSha256, StringComparison.OrdinalIgnoreCase))
                    return new("unapproved_changes");
            }

            var environment = new Dictionary<string, string> { ["GIT_INDEX_FILE"] = indexPath };
            var readTree = await RunGit(root, ["-C", workspace, "-c", "commit.gpgSign=false", "read-tree", status.HeadCommitSha], TimeSpan.FromSeconds(20), cancellationToken, environment);
            if (readTree.ExitCode != 0) return new("git_error");
            foreach (var file in requestedFiles.OrderBy(file => file.Path, StringComparer.Ordinal))
            {
                var blob = await RunGit(root, ["-C", workspace, "-c", "core.hooksPath=/dev/null", "hash-object", "-w", "--no-filters", "--", file.Path!], TimeSpan.FromSeconds(20), cancellationToken, environment);
                if (blob.ExitCode != 0 || !IsCommitSha(blob.Output.Trim())) return new("git_error");
                var indexed = await RunGit(root, ["-C", workspace, "-c", "commit.gpgSign=false", "update-index", "--add", "--cacheinfo", $"100644,{blob.Output.Trim()},{file.Path}"], TimeSpan.FromSeconds(20), cancellationToken, environment);
                if (indexed.ExitCode != 0) return new("git_error");
            }
            var tree = await RunGit(root, ["-C", workspace, "-c", "commit.gpgSign=false", "write-tree"], TimeSpan.FromSeconds(20), cancellationToken, environment);
            if (tree.ExitCode != 0 || !IsCommitSha(tree.Output.Trim())) return new("git_error");
            environment["GIT_AUTHOR_NAME"] = "AI ERP Development Studio";
            environment["GIT_AUTHOR_EMAIL"] = "aierp-studio@localhost";
            environment["GIT_COMMITTER_NAME"] = "AI ERP Development Studio";
            environment["GIT_COMMITTER_EMAIL"] = "aierp-studio@localhost";
            var commit = await RunGit(root, ["-C", workspace, "-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "commit-tree", tree.Output.Trim(), "-p", status.HeadCommitSha, "-m", message.Trim()], TimeSpan.FromSeconds(30), cancellationToken, environment);
            if (commit.ExitCode != 0 || !IsCommitSha(commit.Output.Trim())) return new("git_error");
            var commitSha = commit.Output.Trim();
            var update = await RunGit(root, ["-C", workspace, "-c", "core.hooksPath=/dev/null", "update-ref", $"refs/heads/{status.BranchName}", commitSha, status.HeadCommitSha], TimeSpan.FromSeconds(20), cancellationToken, environment);
            if (update.ExitCode != 0) return new("stale_head");
            var stagedIndexPath = Path.Combine(gitDirectory, $"index.aierp-{Guid.NewGuid():N}");
            try
            {
                File.Copy(indexPath, stagedIndexPath);
                File.Move(stagedIndexPath, gitIndexPath, true);
            }
            catch (IOException)
            {
                var repaired = await RunGit(root, ["-C", workspace, "-c", "core.hooksPath=/dev/null", "reset", "--mixed", commitSha], TimeSpan.FromSeconds(20), cancellationToken);
                if (repaired.ExitCode != 0) throw;
            }
            finally { try { if (File.Exists(stagedIndexPath)) File.Delete(stagedIndexPath); } catch (IOException) { } }
            return new(null, status.BranchName, status.HeadCommitSha, commitSha, requestedFiles.Select(file => file.Path!).OrderBy(path => path, StringComparer.Ordinal).ToList());
        }
        finally
        {
            try { if (File.Exists(indexPath)) File.Delete(indexPath); } catch (IOException) { }
            gate.Release();
        }
    }
    internal static async Task<WorkspaceChangesView> GetChangesAsync(string root, Guid workspaceId, CancellationToken cancellationToken)
    {
        var backupDirectory = GetChangeBackupDirectory(root, workspaceId);
        if (!Directory.Exists(backupDirectory)) return new([], false);
        var backups = new List<WorkspaceChangeBackup>();
        var truncated = false;
        foreach (var file in Directory.EnumerateFiles(backupDirectory, "*.json"))
        {
            if (backups.Count >= 1000) { truncated = true; break; }
            var backup = await ReadChangeBackupAsync(file, workspaceId, cancellationToken);
            if (backup is not null) backups.Add(backup);
        }
        var changes = new List<WorkspaceChangeSummary>();
        foreach (var backup in backups.OrderByDescending(x => x.AppliedAt).Take(100))
        {
            var isCurrent = false;
            if (!backup.IsRestored && TryResolveFile(root, workspaceId, backup.Path, out var path, out _))
            {
                if (new FileInfo(path!).Length <= MaxPatchableSourceBytes)
                {
                    var bytes = await File.ReadAllBytesAsync(path!, cancellationToken);
                    isCurrent = string.Equals(Convert.ToHexString(SHA256.HashData(bytes)), backup.AppliedSha256, StringComparison.OrdinalIgnoreCase);
                }
            }
            changes.Add(new WorkspaceChangeSummary(backup.Id, backup.Path, backup.OriginalSha256, backup.AppliedSha256, backup.AppliedAt, backup.IsRestored, isCurrent, backup.WasCreated));
        }
        return new WorkspaceChangesView(changes, truncated || backups.Count > 100);
    }
    internal static async Task<WorkspaceChangeDiff?> GetChangeDiffAsync(string root, Guid workspaceId, Guid changeId, CancellationToken cancellationToken)
    {
        var backup = await ReadChangeBackupAsync(GetChangeBackupPath(root, workspaceId, changeId), workspaceId, cancellationToken);
        if (backup is null || !IsWritableSourcePath(backup.Path)) return null;
        if (!TryResolveFile(root, workspaceId, backup.Path, out var currentPath, out var error))
        {
            if (backup.WasCreated && backup.IsRestored && error == "file_missing")
                return new WorkspaceChangeDiff(backup.Id, backup.Path, "", "", backup.OriginalSha256, backup.AppliedSha256, backup.AppliedAt, true, false, true);
            if (error == "workspace_missing") throw new DirectoryNotFoundException();
            return null;
        }
        if (new FileInfo(currentPath!).Length > MaxPatchableSourceBytes) return null;
        var currentBytes = await File.ReadAllBytesAsync(currentPath!, cancellationToken);
        if (currentBytes.AsSpan().Contains((byte)0)) return null;
        var originalBytes = Convert.FromBase64String(backup.OriginalContentBase64);
        if (originalBytes.Length > MaxPatchableSourceBytes || originalBytes.AsSpan().Contains((byte)0)) return null;
        var encoding = new UTF8Encoding(false, true);
        var originalContent = encoding.GetString(originalBytes);
        var currentContent = encoding.GetString(currentBytes);
        var currentHash = Convert.ToHexString(SHA256.HashData(currentBytes));
        return new WorkspaceChangeDiff(backup.Id, backup.Path, originalContent, currentContent, backup.OriginalSha256,
            backup.AppliedSha256, backup.AppliedAt, backup.IsRestored,
            !backup.IsRestored && string.Equals(currentHash, backup.AppliedSha256, StringComparison.OrdinalIgnoreCase), backup.WasCreated);
    }
    internal static async Task<WorkspaceFileRestoreResult> RestoreChangeAsync(string root, Guid workspaceId, Guid changeId,
        string expectedSha256, CancellationToken cancellationToken)
    {
        var gate = FileWriteGates.GetOrAdd(workspaceId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            var backupPath = GetChangeBackupPath(root, workspaceId, changeId);
            var backup = await ReadChangeBackupAsync(backupPath, workspaceId, cancellationToken);
            if (backup is null) return new(false, "change_missing", null, null);
            if (backup.IsRestored) return new(false, "already_restored", backup.Path, null);
            if (!IsWritableSourcePath(backup.Path)) return new(false, "invalid_path", backup.Path, null);
            if (backup.WasCreated && !TryResolveFile(root, workspaceId, backup.Path, out _, out _) && backup.IsRestored)
                return new(false, "already_restored", backup.Path, backup.OriginalSha256);
            if (!TryResolveFile(root, workspaceId, backup.Path, out var filePath, out var error))
                return new(false, error is "workspace_missing" or "file_missing" ? error : "invalid_path", backup.Path, null);
            if (new FileInfo(filePath!).Length > MaxPatchableSourceBytes) return new(false, "too_large", backup.Path, null);
            var currentBytes = await File.ReadAllBytesAsync(filePath!, cancellationToken);
            var currentHash = Convert.ToHexString(SHA256.HashData(currentBytes));
            if (!string.Equals(currentHash, expectedSha256, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(currentHash, backup.AppliedSha256, StringComparison.OrdinalIgnoreCase))
                return new(false, "stale", backup.Path, currentHash);
            if (!string.Equals(backup.OriginalSha256, Convert.ToHexString(SHA256.HashData(Convert.FromBase64String(backup.OriginalContentBase64))), StringComparison.OrdinalIgnoreCase))
                return new(false, "invalid_backup", backup.Path, null);
            var originalBytes = Convert.FromBase64String(backup.OriginalContentBase64);
            if (originalBytes.Length > MaxPatchableSourceBytes) return new(false, "invalid_backup", backup.Path, null);
            if (backup.WasCreated)
                File.Delete(filePath!);
            else
            {
                var unixMode = OperatingSystem.IsLinux() ? File.GetUnixFileMode(filePath!) : (UnixFileMode?)null;
                await WriteBytesAtomicallyAsync(filePath!, originalBytes, unixMode, cancellationToken);
            }
            backup = backup with { IsRestored = true };
            await WriteBackupAsync(backupPath, backup, cancellationToken);
            return new(true, null, backup.Path, backup.OriginalSha256);
        }
        finally { gate.Release(); }
    }
    private static string GetChangeBackupDirectory(string root, Guid workspaceId) =>
        Path.Combine(Path.GetFullPath(root), ".aierp-change-backups", workspaceId.ToString("N"));
    private static string GetChangeBackupPath(string root, Guid workspaceId, Guid changeId) =>
        Path.Combine(GetChangeBackupDirectory(root, workspaceId), $"{changeId:N}.json");
    private static async Task<WorkspaceChangeBackup?> ReadChangeBackupAsync(string path, Guid workspaceId, CancellationToken cancellationToken)
    {
        if (!File.Exists(path)) return null;
        var info = new FileInfo(path);
        if (info.Length > MaxCodeChangeBackupBytes) return null;
        try
        {
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 8192, useAsync: true);
            var backup = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceChangeBackup>(stream, cancellationToken: cancellationToken);
            if (backup is null || backup.Id == Guid.Empty || backup.WorkspaceId != workspaceId || !IsWritableSourcePath(backup.Path) ||
                !IsSha256(backup.OriginalSha256) || !IsSha256(backup.AppliedSha256) || backup.OriginalContentBase64.Length > 2_800 * 1024) return null;
            var originalBytes = Convert.FromBase64String(backup.OriginalContentBase64);
            if (originalBytes.Length > MaxPatchableSourceBytes || originalBytes.AsSpan().Contains((byte)0) ||
                !string.Equals(Convert.ToHexString(SHA256.HashData(originalBytes)), backup.OriginalSha256, StringComparison.OrdinalIgnoreCase)) return null;
            return backup;
        }
        catch (System.Text.Json.JsonException) { return null; }
        catch (FormatException) { return null; }
    }
    private static async Task WriteBackupAsync(string path, WorkspaceChangeBackup backup, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(backup);
        await WriteBytesAtomicallyAsync(path, json, null, cancellationToken);
    }
    private static async Task WriteNewBytesAtomicallyAsync(string path, byte[] bytes, CancellationToken cancellationToken)
    {
        var tempPath = Path.Combine(Path.GetDirectoryName(path)!, $".aierp-create-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }
            File.Move(tempPath, path, overwrite: false);
        }
        finally { if (File.Exists(tempPath)) File.Delete(tempPath); }
    }
    private static async Task WriteBytesAtomicallyAsync(string path, byte[] bytes, UnixFileMode? unixMode, CancellationToken cancellationToken)
    {
        var tempPath = Path.Combine(Path.GetDirectoryName(path)!, $".aierp-write-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }
            if (OperatingSystem.IsLinux() && unixMode.HasValue) File.SetUnixFileMode(tempPath, unixMode.Value);
            File.Move(tempPath, path, overwrite: true);
        }
        finally { if (File.Exists(tempPath)) File.Delete(tempPath); }
    }
    internal static WorkspaceAnalysis AnalyzeWorkspace(string root, Guid workspaceId)
    {
        if (!TryResolveDirectory(root, workspaceId, null, out var workspace, out _)) throw new DirectoryNotFoundException("Workspace checkout not found.");
        const int maxFiles = 20_000;
        const int maxDirectories = 5_000;
        const int maxEntryPoints = 80;
        var directories = new Queue<(string FullPath, string RelativePath)>();
        directories.Enqueue((workspace!, ""));
        var technologies = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var entryPoints = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        var scannedFiles = 0;
        var scannedDirectories = 0;
        var truncated = false;
        while (directories.Count > 0)
        {
            if (++scannedDirectories > maxDirectories) { truncated = true; break; }
            var (current, relativeDirectory) = directories.Dequeue();
            foreach (var fullPath in Directory.EnumerateFileSystemEntries(current))
            {
                var attributes = File.GetAttributes(fullPath);
                if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
                var name = Path.GetFileName(fullPath);
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    if (!ExcludedDirectoryNames.Contains(name))
                    {
                        var childRelative = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                        directories.Enqueue((fullPath, childRelative));
                    }
                    continue;
                }
                if (++scannedFiles > maxFiles) { scannedFiles = maxFiles; truncated = true; break; }
                var relativePath = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                var extension = Path.GetExtension(name).ToLowerInvariant();
                var technology = extension switch
                {
                    ".cs" or ".csx" or ".razor" => "C#",
                    ".ts" or ".tsx" => "TypeScript",
                    ".js" or ".jsx" or ".mjs" or ".cjs" => "JavaScript",
                    ".json" => "JSON",
                    ".css" or ".scss" => "CSS",
                    ".html" or ".htm" => "HTML",
                    ".sql" => "SQL",
                    ".py" => "Python",
                    ".go" => "Go",
                    ".rs" => "Rust",
                    ".java" => "Java",
                    ".yml" or ".yaml" => "YAML",
                    ".md" => "Markdown",
                    ".xml" or ".csproj" or ".fsproj" or ".props" or ".targets" => "XML/.NET",
                    _ => string.IsNullOrEmpty(extension) ? "Other" : extension.TrimStart('.').ToUpperInvariant()
                };
                technologies[technology] = technologies.GetValueOrDefault(technology) + 1;
                var lowerName = name.ToLowerInvariant();
                if (lowerName.EndsWith(".sln", StringComparison.Ordinal) || lowerName.EndsWith(".slnx", StringComparison.Ordinal) ||
                    lowerName.EndsWith(".csproj", StringComparison.Ordinal) || lowerName.EndsWith(".fsproj", StringComparison.Ordinal) ||
                    lowerName is "package.json" or "pyproject.toml" or "go.mod" or "cargo.toml" or "dockerfile" or "readme.md")
                {
                    if (entryPoints.Count < maxEntryPoints) entryPoints.Add(relativePath);
                    else truncated = true;
                }
            }
            if (truncated && scannedFiles >= maxFiles) break;
        }
        var summary = technologies.OrderByDescending(x => x.Value).ThenBy(x => x.Key, StringComparer.OrdinalIgnoreCase)
            .Take(12).Select(x => new WorkspaceTechnologyCount(x.Key, x.Value)).ToList();
        return new WorkspaceAnalysis(scannedFiles, truncated, summary, entryPoints.ToList());
    }
    internal static WorkspaceTestDiscovery DiscoverTests(string root, Guid workspaceId)
    {
        if (!TryResolveDirectory(root, workspaceId, null, out var workspace, out _)) throw new DirectoryNotFoundException("Workspace checkout not found.");
        const int maxFiles = 20_000;
        const int maxDirectories = 5_000;
        const int maxTargets = 100;
        const int maxManifests = 200;
        const int maxManifestBytes = 64 * 1024;
        var directories = new Queue<(string FullPath, string RelativePath)>();
        directories.Enqueue((workspace!, ""));
        var files = new List<string>();
        var directoryCount = 0;
        var manifestsScanned = 0;
        var truncated = false;
        while (directories.Count > 0)
        {
            if (++directoryCount > maxDirectories) { truncated = true; break; }
            var (current, relativeDirectory) = directories.Dequeue();
            foreach (var fullPath in Directory.EnumerateFileSystemEntries(current))
            {
                var attributes = File.GetAttributes(fullPath);
                if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
                var name = Path.GetFileName(fullPath);
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    if (!ExcludedDirectoryNames.Contains(name))
                    {
                        var child = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                        directories.Enqueue((fullPath, child));
                    }
                    continue;
                }
                if (files.Count >= maxFiles) { truncated = true; break; }
                var relative = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                files.Add(relative);
            }
            if (truncated) break;
        }

        var targets = new List<WorkspaceTestTarget>();
        var projectFiles = files.Where(path => Path.GetExtension(path).Equals(".csproj", StringComparison.OrdinalIgnoreCase)).ToList();
        foreach (var path in projectFiles)
        {
            if (targets.Count >= maxTargets) { truncated = true; break; }
            if (manifestsScanned >= maxManifests) { truncated = true; break; }
            manifestsScanned++;
            if (!TryResolveFile(root, workspaceId, path, out var fullPath, out _)) continue;
            var info = new FileInfo(fullPath!);
            if (info.Length > maxManifestBytes) continue;
            try
            {
                using var stream = File.OpenRead(fullPath!);
                using var reader = System.Xml.XmlReader.Create(stream, new System.Xml.XmlReaderSettings { DtdProcessing = System.Xml.DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = maxManifestBytes });
                var isTestProject = false;
                var testPackage = false;
                while (reader.Read())
                {
                    if (reader.NodeType == System.Xml.XmlNodeType.Element && reader.LocalName.Equals("IsTestProject", StringComparison.OrdinalIgnoreCase) &&
                        reader.ReadElementContentAsString().Trim().Equals("true", StringComparison.OrdinalIgnoreCase)) isTestProject = true;
                    else if (reader.NodeType == System.Xml.XmlNodeType.Element && reader.LocalName.Equals("PackageReference", StringComparison.OrdinalIgnoreCase))
                    {
                        var package = reader.GetAttribute("Include") ?? reader.GetAttribute("Update") ?? "";
                        if (new[] { "Microsoft.NET.Test.Sdk", "xunit", "xunit.v3", "NUnit", "MSTest.TestFramework" }.Contains(package, StringComparer.OrdinalIgnoreCase)) testPackage = true;
                    }
                }
                var canTest = isTestProject || testPackage;
                targets.Add(new WorkspaceTestTarget(path, ".NET", canTest ? isTestProject ? "IsTestProject=true" : "Test framework package reference" : "Buildable .NET project", canTest ? "dotnet test --no-restore (offline; operator NuGet feed allowed)" : "dotnet build --no-restore (offline; operator NuGet feed allowed)", canTest, true));
            }
            catch (System.Xml.XmlException) { }
            catch (IOException) { }
        }

        foreach (var path in files.Where(path => Path.GetFileName(path).Equals("package.json", StringComparison.OrdinalIgnoreCase)))
        {
            if (targets.Count >= maxTargets) { truncated = true; break; }
            if (manifestsScanned >= maxManifests) { truncated = true; break; }
            manifestsScanned++;
            if (!TryResolveFile(root, workspaceId, path, out var fullPath, out _)) continue;
            var info = new FileInfo(fullPath!);
            if (info.Length > maxManifestBytes) continue;
            var directory = Path.GetDirectoryName(path)?.Replace('\\', '/') ?? "";
            var hasNativeNodeTests = files.Any(candidate =>
            {
                var relative = directory.Length == 0 ? candidate : candidate.StartsWith(directory + "/", StringComparison.OrdinalIgnoreCase) ? candidate[(directory.Length + 1)..] : "";
                if (relative.Length == 0) return false;
                var extension = Path.GetExtension(relative).ToLowerInvariant();
                var filename = Path.GetFileName(relative);
                var inTestDirectory = relative.Split('/').SkipLast(1).Any(segment => segment.Equals("test", StringComparison.OrdinalIgnoreCase) || segment.Equals("tests", StringComparison.OrdinalIgnoreCase));
                var usesNodeTestName = new[] { ".test", "-test", "_test" }.Any(suffix => filename.EndsWith(suffix + extension, StringComparison.OrdinalIgnoreCase));
                return extension is ".js" or ".cjs" or ".mjs" && (inTestDirectory || usesNodeTestName);
            });
            var hasNodeSources = files.Any(candidate =>
            {
                var relative = directory.Length == 0 ? candidate : candidate.StartsWith(directory + "/", StringComparison.OrdinalIgnoreCase) ? candidate[(directory.Length + 1)..] : "";
                return relative.Length > 0 && Path.GetExtension(relative).ToLowerInvariant() is ".js" or ".cjs" or ".mjs";
            });
            try
            {
                using var _ = System.Text.Json.JsonDocument.Parse(File.ReadAllBytes(fullPath!), new System.Text.Json.JsonDocumentOptions { MaxDepth = 24 });
                if (hasNativeNodeTests || hasNodeSources)
                    targets.Add(new WorkspaceTestTarget(directory.Length == 0 ? "package.json" : $"{directory}/package.json", "Node.js",
                        hasNativeNodeTests ? "Built-in node:test file patterns" : "JavaScript source files",
                        hasNativeNodeTests ? "node --test (offline; locked dependencies use the operator cache)" : "node --check (offline; source files only)",
                        hasNativeNodeTests, true));
            }
            catch (System.Text.Json.JsonException) { }
            catch (IOException) { }
        }

        var pythonTestFiles = files.Where(path => Path.GetExtension(path).Equals(".py", StringComparison.OrdinalIgnoreCase) &&
            (Path.GetFileName(path).StartsWith("test_", StringComparison.OrdinalIgnoreCase) ||
             Path.GetFileName(path).EndsWith("_test.py", StringComparison.OrdinalIgnoreCase)))
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (pythonTestFiles.Count > 0)
        {
            foreach (var path in pythonTestFiles)
            {
                if (targets.Count >= maxTargets) { truncated = true; break; }
                targets.Add(new WorkspaceTestTarget(path, "Python", "test_*.py or *_test.py file",
                    "python3 -m pytest (offline; requirements.txt uses the operator wheelhouse)", true, true));
            }
        }
        else
        {
            var pythonSourceFile = files.FirstOrDefault(path => Path.GetExtension(path).Equals(".py", StringComparison.OrdinalIgnoreCase));
            if (pythonSourceFile is not null && targets.Count < maxTargets)
                targets.Add(new WorkspaceTestTarget(pythonSourceFile, "Python", "Python source file", "python3 -m py_compile", false, true));
        }
        var goTestFile = files.FirstOrDefault(path => Path.GetFileName(path).EndsWith("_test.go", StringComparison.OrdinalIgnoreCase) &&
            files.Any(candidate => Path.GetFileName(candidate).Equals("go.mod", StringComparison.OrdinalIgnoreCase) &&
                (path.StartsWith(candidate[..(candidate.LastIndexOf('/') + 1)], StringComparison.Ordinal) || !candidate.Contains('/'))));
        if (goTestFile is not null && targets.Count < maxTargets)
            targets.Add(new WorkspaceTestTarget(goTestFile, "Go", "*_test.go file inside a Go module", "go test -mod=readonly . (offline; operator cache for module dependencies)", true, false));
        var goModule = files.FirstOrDefault(path => Path.GetFileName(path).Equals("go.mod", StringComparison.OrdinalIgnoreCase));
        if (goModule is not null && targets.Count < maxTargets)
            targets.Add(new WorkspaceTestTarget(goModule, "Go", "go.mod module manifest", "go build -mod=readonly ./... (offline; operator cache for module dependencies)", false, true));
        var cargoManifest = files.FirstOrDefault(path => Path.GetFileName(path).Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase));
        var hasRustTestFiles = cargoManifest is not null && files.Any(path =>
            (Path.GetFileName(path).EndsWith("_test.rs", StringComparison.OrdinalIgnoreCase) ||
             path.Split('/').Any(segment => segment.Equals("tests", StringComparison.OrdinalIgnoreCase)) && Path.GetExtension(path).Equals(".rs", StringComparison.OrdinalIgnoreCase)) &&
            (path.StartsWith(cargoManifest[..(cargoManifest.LastIndexOf('/') + 1)], StringComparison.Ordinal) || !cargoManifest.Contains('/')));
        if (cargoManifest is not null && hasRustTestFiles && targets.Count < maxTargets)
            targets.Add(new WorkspaceTestTarget(cargoManifest, "Rust", "Rust test files inside Cargo package", "cargo test --offline (locked dependencies use the operator cache)", true, true));
        else if (cargoManifest is not null && targets.Count < maxTargets)
            targets.Add(new WorkspaceTestTarget(cargoManifest, "Rust", "Cargo.toml package manifest", "cargo build --offline (locked dependencies use the operator cache)", false, true));
        foreach (var javaPath in files.Where(path => Path.GetExtension(path).Equals(".java", StringComparison.OrdinalIgnoreCase)))
        {
            if (targets.Count >= maxTargets) { truncated = true; break; }
            if (!IsSafeJavaTarget(javaPath) || !TryResolveFile(root, workspaceId, javaPath, out var javaFullPath, out _)) continue;
            var info = new FileInfo(javaFullPath!);
            if (info.Length is 0 or > maxManifestBytes) continue;
            string source;
            try { source = File.ReadAllText(javaFullPath!); }
            catch (IOException) { continue; }
            var hasMain = HasPlainJavaMain(javaPath, source);
            targets.Add(new WorkspaceTestTarget(javaPath, "Java", hasMain ? "Single-file plain-JDK main test harness" : "Single-file Java source",
                hasMain ? "javac --release 21 (offline, no dependencies); java -ea <main-class>" : "javac --release 21 -proc:none (offline, no dependencies)", hasMain, true));
        }
        return new WorkspaceTestDiscovery(files.Count, truncated, targets.OrderBy(x => x.Path, StringComparer.OrdinalIgnoreCase).Take(maxTargets).ToList());
    }
    internal static bool IsSafeDotNetTestTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetExtension(path).Equals(".csproj", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    internal static bool IsSafeNodeTestTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetFileName(path).Equals("package.json", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    internal static bool IsSafePythonTestTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetExtension(path).Equals(".py", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    internal static bool IsSafeGoTestTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetExtension(path).Equals(".go", StringComparison.OrdinalIgnoreCase) &&
        Path.GetFileName(path).EndsWith("_test.go", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    internal static bool IsSafeGoBuildTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetFileName(path).Equals("go.mod", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    internal static bool IsSafeRustTestTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetFileName(path).Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    internal static bool IsSafeJavaTarget(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
        !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
        Path.GetExtension(path).Equals(".java", StringComparison.OrdinalIgnoreCase) &&
        path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
            !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase) && !ExcludedDirectoryNames.Contains(segment));
    private static bool HasPlainJavaMain(string path, string source)
    {
        if (source.Length > 64 * 1024) return false;
        var typeName = Path.GetFileNameWithoutExtension(path);
        return System.Text.RegularExpressions.Regex.IsMatch(source,
                   $@"\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*class\s+{System.Text.RegularExpressions.Regex.Escape(typeName)}\b") &&
               System.Text.RegularExpressions.Regex.IsMatch(source,
                   @"\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\)");
    }
    internal static async Task ExpireStaleTestJobAsync(string jobDirectory, CancellationToken cancellationToken)
    {
        var manifestPath = Path.Combine(jobDirectory, "job.json");
        var resultPath = Path.Combine(jobDirectory, "result.json");
        if (File.Exists(resultPath) || !File.Exists(manifestPath)) return;
        var options = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);
        WorkspaceSandboxJob? manifest;
        try
        {
            await using var stream = File.OpenRead(manifestPath);
            manifest = await System.Text.Json.JsonSerializer.DeserializeAsync<WorkspaceSandboxJob>(stream, options, cancellationToken);
        }
        catch (System.Text.Json.JsonException) { return; }
        if (manifest is null || manifest.Id == Guid.Empty || manifest.WorkspaceId == Guid.Empty) return;
        var now = DateTimeOffset.UtcNow;
        var startedPath = Path.Combine(jobDirectory, "started.json");
        var expired = File.Exists(startedPath)
            ? now - File.GetLastWriteTimeUtc(startedPath) > TimeSpan.FromMinutes(10)
            : now - manifest.CreatedAt > TimeSpan.FromMinutes(20);
        if (!expired) return;

        var temporaryResultPath = resultPath + ".runner." + Guid.NewGuid().ToString("N") + ".tmp";
        var result = new WorkspaceSandboxTestResult(false, "QueueExpired", "Test işi sandbox kuyruğunda veya çalışırken zaman sınırını aştı.", -1, "", 0);
        try
        {
            await File.WriteAllTextAsync(temporaryResultPath, System.Text.Json.JsonSerializer.Serialize(result, options), cancellationToken);
            try { File.Move(temporaryResultPath, resultPath, overwrite: false); }
            catch (IOException) when (File.Exists(resultPath)) { }
            if (File.Exists(resultPath))
            {
                try { File.Delete(Path.Combine(jobDirectory, "source.zip")); }
                catch (FileNotFoundException) { }
            }
        }
        finally
        {
            try { File.Delete(temporaryResultPath); }
            catch (FileNotFoundException) { }
        }
    }
    internal static async Task<ReleasePackageResponse> CreateReleasePackageAsync(string root, Guid workspaceId, string packageRoot,
        CreateReleasePackageRequest request, CancellationToken cancellationToken)
    {
        if (!TryResolveDirectory(root, workspaceId, null, out var workspace, out _)) throw new DirectoryNotFoundException("Workspace checkout not found.");
        if (request.PackageId == Guid.Empty || !IsValidReleaseVersion(request.Version) || !IsCommitSha(request.CommitSha ?? string.Empty) ||
            request.TestJobId == Guid.Empty || !IsSha256(request.TestSnapshotSha256 ?? string.Empty) || string.IsNullOrWhiteSpace(request.TestTargetPath))
            throw new InvalidDataException("Release package metadata is invalid.");
        const int maxFiles = 20_000;
        const long maxBytes = 100 * 1024 * 1024;
        const long maxFileBytes = 16 * 1024 * 1024;
        var fullPackageRoot = Path.GetFullPath(packageRoot);
        Directory.CreateDirectory(fullPackageRoot);
        if (!TryResolveStorageChild(fullPackageRoot, $"{request.PackageId:N}.zip", out var archivePath) ||
            !TryResolveStorageChild(fullPackageRoot, $"{request.PackageId:N}.json", out var metadataPath) ||
            !TryResolveStorageChild(fullPackageRoot, $"{request.PackageId:N}.zip.{Guid.NewGuid():N}.tmp", out var temporaryPath))
            throw new InvalidDataException("Release package path is invalid.");
        var manifestCreatedAt = DateTimeOffset.UtcNow;
        var files = new List<ReleasePackageFile>();
        long sourceBytes = 0;
        var targetIncluded = false;
        try
        {
            using (var output = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None))
            using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: false))
            {
                var queue = new Queue<(string FullPath, string Relative)>();
                queue.Enqueue((workspace!, ""));
                while (queue.Count > 0)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var (directory, relativeDirectory) = queue.Dequeue();
                    foreach (var fullPath in Directory.EnumerateFileSystemEntries(directory))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        var attributes = File.GetAttributes(fullPath);
                        if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
                        var name = Path.GetFileName(fullPath);
                        if (name.StartsWith(".", StringComparison.Ordinal) || IsSecretTestPath(name)) continue;
                        var relative = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                        if (string.Equals(relative, "AIERP-RELEASE.json", StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("Source archive already contains reserved AIERP-RELEASE.json manifest path.");
                        if ((attributes & FileAttributes.Directory) != 0)
                        {
                            if (!ExcludedDirectoryNames.Contains(name)) queue.Enqueue((fullPath, relative));
                            continue;
                        }
                        var info = new FileInfo(fullPath);
                        if (info.Length > maxFileBytes) throw new InvalidDataException("Release package contains a file larger than 16 MiB.");
                        if (sourceBytes + info.Length > maxBytes) throw new InvalidDataException("Release package source exceeds 100 MiB.");
                        if (files.Count >= maxFiles) throw new InvalidDataException("Release package exceeds 20,000 files.");
                        await using var hashSource = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                        var digest = await SHA256.HashDataAsync(hashSource, cancellationToken);
                        files.Add(new ReleasePackageFile(relative, Convert.ToHexString(digest), info.Length));
                        sourceBytes += info.Length;
                        if (string.Equals(relative, request.TestTargetPath, StringComparison.Ordinal)) targetIncluded = true;
                        var entry = archive.CreateEntry(relative, CompressionLevel.Optimal);
                        entry.LastWriteTime = new DateTimeOffset(1980, 1, 1, 0, 0, 0, TimeSpan.Zero);
                        await using var source = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                        await using var target = entry.Open();
                        await source.CopyToAsync(target, cancellationToken);
                    }
                }
                if (files.Count == 0 || !targetIncluded) throw new InvalidDataException("Release package omitted its sandbox test target.");
                var manifest = new ReleasePackageManifest(request.PackageId, request.Version!, request.CommitSha!, request.TestJobId,
                    request.TestTargetPath!, request.TestSnapshotSha256!, manifestCreatedAt, files);
                var manifestEntry = archive.CreateEntry("AIERP-RELEASE.json", CompressionLevel.Optimal);
                manifestEntry.LastWriteTime = new DateTimeOffset(1980, 1, 1, 0, 0, 0, TimeSpan.Zero);
                await using var manifestStream = manifestEntry.Open();
                await System.Text.Json.JsonSerializer.SerializeAsync(manifestStream, manifest, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web), cancellationToken);
            }
            var compressedSize = new FileInfo(temporaryPath).Length;
            if (compressedSize > maxBytes) throw new InvalidDataException("Compressed release package exceeds 100 MiB.");
            await using var archiveStream = new FileStream(temporaryPath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            var packageSha = Convert.ToHexString(await SHA256.HashDataAsync(archiveStream, cancellationToken));
            var response = new ReleasePackageResponse(request.PackageId, $"release-{request.Version}.zip", request.Version!, request.CommitSha!, packageSha, compressedSize, files.Count, manifestCreatedAt);
            var temporaryMetadataPath = metadataPath + $".{Guid.NewGuid():N}.tmp";
            try
            {
                await File.WriteAllTextAsync(temporaryMetadataPath, System.Text.Json.JsonSerializer.Serialize(response, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)), cancellationToken);
                File.Move(temporaryPath, archivePath, true);
                File.Move(temporaryMetadataPath, metadataPath, true);
                return response;
            }
            finally { if (File.Exists(temporaryMetadataPath)) File.Delete(temporaryMetadataPath); }
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    internal static bool IsValidReleaseVersion(string? version) =>
        !string.IsNullOrWhiteSpace(version) && version.Length <= 128 &&
        System.Text.RegularExpressions.Regex.IsMatch(version,
            @"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));

    internal static async Task CreateTestSnapshotAsync(string root, Guid workspaceId, string targetPath, string archivePath, CancellationToken cancellationToken)
    {
        if (!TryResolveDirectory(root, workspaceId, null, out var workspace, out _)) throw new DirectoryNotFoundException("Workspace checkout not found.");
        const int maxFiles = 20_000;
        const long maxBytes = 100 * 1024 * 1024;
        const long maxFileBytes = 16 * 1024 * 1024;
        var queue = new Queue<(string FullPath, string Relative)>(); queue.Enqueue((workspace!, ""));
        long bytes = 0; var count = 0; var targetIncluded = false;
        using (var output = new FileStream(archivePath, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None))
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: false))
        {
            while (queue.Count > 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var (directory, relativeDirectory) = queue.Dequeue();
                foreach (var fullPath in Directory.EnumerateFileSystemEntries(directory))
                {
                    var attributes = File.GetAttributes(fullPath);
                    if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
                    var name = Path.GetFileName(fullPath);
                    if (name.StartsWith('.') || IsSecretTestPath(name)) continue;
                    var relative = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                    if ((attributes & FileAttributes.Directory) != 0)
                    {
                        if (!ExcludedDirectoryNames.Contains(name)) queue.Enqueue((fullPath, relative));
                        continue;
                    }
                    var info = new FileInfo(fullPath);
                    if (info.Length > maxFileBytes) throw new InvalidDataException("Test snapshot includes a file larger than 16 MiB.");
                    if (bytes + info.Length > maxBytes) throw new InvalidDataException("Test snapshot exceeds 100 MiB.");
                    if (++count > maxFiles) throw new InvalidDataException("Test snapshot exceeds 20,000 files.");
                    bytes += info.Length;
                    if (string.Equals(relative, targetPath, StringComparison.Ordinal)) targetIncluded = true;
                    var entry = archive.CreateEntry(relative, CompressionLevel.Fastest);
                    await using var source = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, useAsync: true);
                    await using var target = entry.Open();
                    await source.CopyToAsync(target, cancellationToken);
                }
            }
        }
        if (new FileInfo(archivePath).Length > maxBytes) throw new InvalidDataException("Compressed test snapshot exceeds 100 MiB.");
        if (!targetIncluded) throw new InvalidDataException("Selected test project was omitted from the safe source snapshot.");
    }
    private static bool IsSecretTestPath(string name) => name.Contains("secret", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("credential", StringComparison.OrdinalIgnoreCase) || name.Contains("password", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("apikey", StringComparison.OrdinalIgnoreCase) || name.Equals(".env", StringComparison.OrdinalIgnoreCase) ||
        name.StartsWith(".env.", StringComparison.OrdinalIgnoreCase);
    internal static WorkspaceSearchResult SearchWorkspace(string root, Guid workspaceId, string query)
    {
        if (!TryResolveDirectory(root, workspaceId, null, out var workspace, out _)) throw new DirectoryNotFoundException("Workspace checkout not found.");
        const int maxFiles = 8_000, maxDirectories = 3_000, maxMatches = 30, maxBytesPerFile = 64 * 1024;
        var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { ".cs", ".csx", ".razor", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".go", ".rs", ".java", ".sql", ".json", ".xml", ".csproj", ".fsproj", ".props", ".targets", ".yml", ".yaml", ".md", ".html", ".htm", ".css", ".scss" };
        var queue = new Queue<(string FullPath, string RelativePath)>();
        queue.Enqueue((workspace!, ""));
        var matches = new List<WorkspaceSearchMatch>();
        var scannedFiles = 0; var scannedDirectories = 0; var truncated = false;
        while (queue.Count > 0 && matches.Count < maxMatches)
        {
            if (++scannedDirectories > maxDirectories) { truncated = true; break; }
            var (directory, relativeDirectory) = queue.Dequeue();
            foreach (var fullPath in Directory.EnumerateFileSystemEntries(directory))
            {
                var attributes = File.GetAttributes(fullPath);
                if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
                var name = Path.GetFileName(fullPath);
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    if (!ExcludedDirectoryNames.Contains(name) && !name.StartsWith(".", StringComparison.Ordinal))
                        queue.Enqueue((fullPath, string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}"));
                    continue;
                }
                if (++scannedFiles > maxFiles) { truncated = true; break; }
                if (!allowedExtensions.Contains(Path.GetExtension(name)) || name.Contains("secret", StringComparison.OrdinalIgnoreCase) ||
                    name.Contains("credential", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".min.js", StringComparison.OrdinalIgnoreCase)) continue;
                var relative = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                var segments = relative.Split('/');
                if (segments.Any(segment => segment.StartsWith(".", StringComparison.Ordinal) || segment.Contains("secret", StringComparison.OrdinalIgnoreCase) || segment.Contains("credential", StringComparison.OrdinalIgnoreCase))) continue;
                try
                {
                    var info = new FileInfo(fullPath);
                    if (info.Length > maxBytesPerFile) continue;
                    var bytes = File.ReadAllBytes(fullPath);
                    if (bytes.AsSpan().Contains((byte)0)) continue;
                    var content = new UTF8Encoding(false, true).GetString(bytes);
                    var lines = content.Split('\n');
                    for (var lineIndex = 0; lineIndex < lines.Length && matches.Count < maxMatches; lineIndex++)
                    {
                        var line = lines[lineIndex].TrimEnd('\r');
                        if (!line.Contains(query, StringComparison.OrdinalIgnoreCase)) continue;
                        var start = line.Length > 500 ? Math.Max(0, line.IndexOf(query, StringComparison.OrdinalIgnoreCase) - 180) : 0;
                        var excerpt = line.Length > 500 ? line.Substring(start, Math.Min(500, line.Length - start)) : line;
                        matches.Add(new WorkspaceSearchMatch(relative, lineIndex + 1, excerpt));
                    }
                }
                catch (DecoderFallbackException) { }
                catch (IOException) { }
                if (truncated) break;
            }
            if (truncated) break;
        }
        if (matches.Count == maxMatches) truncated = true;
        return new WorkspaceSearchResult(Math.Min(scannedFiles, maxFiles), truncated, matches);
    }
    internal static WorkspaceFileSearchResult SearchWorkspaceFileNames(string root, Guid workspaceId, string query)
    {
        if (!TryResolveDirectory(root, workspaceId, null, out var workspace, out _)) throw new DirectoryNotFoundException("Workspace checkout not found.");
        const int maxEntries = 50_000, maxDirectories = 10_000, maxMatches = 200;
        var queue = new Queue<(string FullPath, string RelativePath)>();
        queue.Enqueue((workspace!, ""));
        var matches = new List<WorkspaceFileEntry>();
        var scannedEntries = 0; var scannedDirectories = 0; var truncated = false;
        while (queue.Count > 0 && matches.Count < maxMatches)
        {
            if (++scannedDirectories > maxDirectories) { truncated = true; break; }
            var (directory, relativeDirectory) = queue.Dequeue();
            foreach (var fullPath in Directory.EnumerateFileSystemEntries(directory))
            {
                var attributes = File.GetAttributes(fullPath);
                if ((attributes & FileAttributes.ReparsePoint) != 0) continue;
                var name = Path.GetFileName(fullPath);
                var isDirectory = (attributes & FileAttributes.Directory) != 0;
                if (isDirectory && string.Equals(name, ".git", StringComparison.OrdinalIgnoreCase)) continue;
                if (++scannedEntries > maxEntries) { truncated = true; break; }
                var relative = string.IsNullOrEmpty(relativeDirectory) ? name : $"{relativeDirectory}/{name}";
                if (name.Contains(query, StringComparison.OrdinalIgnoreCase))
                {
                    var size = isDirectory ? (long?)null : new FileInfo(fullPath).Length;
                    matches.Add(new WorkspaceFileEntry(name, relative, isDirectory ? "Directory" : "File", size));
                    if (matches.Count >= maxMatches) { truncated = true; break; }
                }
                if (isDirectory) queue.Enqueue((fullPath, relative));
            }
            if (truncated) break;
        }
        matches.Sort((left, right) => StringComparer.OrdinalIgnoreCase.Compare(left.Path, right.Path));
        return new WorkspaceFileSearchResult(Math.Min(scannedEntries, maxEntries), truncated, matches);
    }
    internal static bool IsValidBranchName(string? branch) => !string.IsNullOrWhiteSpace(branch) && branch.Length <= 256 &&
        !branch.StartsWith('/') && !branch.EndsWith('/') && !branch.StartsWith('-') && !branch.EndsWith('.') &&
        !branch.Contains("..", StringComparison.Ordinal) && !branch.Contains("//", StringComparison.Ordinal) &&
        !branch.Contains("@{", StringComparison.Ordinal) && !branch.Any(c => char.IsWhiteSpace(c) || char.IsControl(c) || "~^:?*[\\".Contains(c)) &&
        !branch.Split('/').Any(part => part.StartsWith('.') || part.EndsWith(".lock", StringComparison.OrdinalIgnoreCase));
    internal static string GetWorkspaceBranchName(Guid workspaceId) => $"aierp/workspace-{workspaceId:N}";
    internal static async Task<WorkspaceGitDiffResult> GetWorkspaceGitDiffAsync(string root, Guid workspaceId, string? relativePath, CancellationToken cancellationToken)
    {
        if (workspaceId == Guid.Empty || !TryResolveDirectory(root, workspaceId, null, out _, out _)) return new(null, "workspace_missing");
        if (string.IsNullOrWhiteSpace(relativePath) || relativePath.Length > 500 || relativePath.Contains('\\') || relativePath.Contains(':') || relativePath.Any(char.IsControl)) return new(null, "invalid_path");
        var summary = await GetWorkspaceGitStatusAsync(root, workspaceId, cancellationToken);
        if (summary is null) return new(null, "workspace_missing");
        var file = summary.Files.SingleOrDefault(x => string.Equals(x.Path, relativePath, StringComparison.Ordinal));
        if (file is null) return new(null, "path_not_changed");
        if (file.Status is not ("Modified" or "Added" or "Untracked" or "Deleted")) return new(null, "unsupported");
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        byte[] currentBytes = [];
        var currentExists = TryResolveFile(root, workspaceId, relativePath, out var currentPath, out var currentError);
        if (currentExists)
        {
            var info = new FileInfo(currentPath!);
            if (info.Length > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(null, "too_large");
            currentBytes = await File.ReadAllBytesAsync(currentPath!, cancellationToken);
        }
        else if (!(file.Status == "Deleted" && currentError == "file_missing" && TryResolveNewFile(root, workspaceId, relativePath, out _, out _)))
            return new(null, "invalid_path");
        if (currentBytes.Length > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(null, "too_large");

        byte[] baseBytes = [];
        var baseContent = "";
        if (file.Status is "Modified" or "Deleted")
        {
            var previous = await RunGit(root, ["-C", workspace, "show", $"HEAD:{relativePath}"], TimeSpan.FromSeconds(20), cancellationToken);
            if (previous.ExitCode != 0) return new(null, "git_error");
            if (previous.OutputTruncated) return new(null, "too_large");
            if (previous.Output.Length > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(null, "too_large");
            if (previous.Output.Contains('\0') || previous.Output.Contains('\uFFFD')) return new(null, "binary");
            baseContent = previous.Output;
            try { baseBytes = new UTF8Encoding(false, true).GetBytes(baseContent); }
            catch (EncoderFallbackException) { return new(null, "binary"); }
        }
        if (baseBytes.Length > WorkspaceFileLimits.MaxManualWorkspaceFileBytes) return new(null, "too_large");
        if (currentBytes.Contains((byte)0)) return new(null, "binary");
        string currentContent;
        try { currentContent = new UTF8Encoding(false, true).GetString(currentBytes); }
        catch (DecoderFallbackException) { return new(null, "binary"); }
        var diff = new WorkspaceGitDiff(relativePath, file.Status, baseContent, currentContent,
            Convert.ToHexString(SHA256.HashData(baseBytes)), Convert.ToHexString(SHA256.HashData(currentBytes)), summary.HeadCommitSha);
        return new(diff, null);
    }
    internal static async Task<WorkspaceGitStatus?> GetWorkspaceGitStatusAsync(string root, Guid workspaceId, CancellationToken cancellationToken)
    {
        if (workspaceId == Guid.Empty || !TryResolveDirectory(root, workspaceId, null, out _, out _)) return null;
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        var branch = await RunGit(root, ["-C", workspace, "branch", "--show-current"], TimeSpan.FromSeconds(20), cancellationToken);
        var head = await RunGit(root, ["-C", workspace, "rev-parse", "HEAD"], TimeSpan.FromSeconds(20), cancellationToken);
        if (branch.ExitCode != 0 || head.ExitCode != 0 || !IsCommitSha(head.Output.Trim()))
            throw new IOException("Git checkout bilgisi doğrulanamadı.");
        var status = await RunGit(root, ["-C", workspace, "status", "--porcelain=v1", "-z", "--untracked-files=all"], TimeSpan.FromSeconds(30), cancellationToken);
        if (status.ExitCode != 0) throw new IOException("Git status başarısız oldu.");
        var files = new List<WorkspaceGitFileStatus>();
        var total = 0;
        var output = status.Output.AsSpan();
        var cursor = 0;
        while (cursor < output.Length)
        {
            var end = output[cursor..].IndexOf('\0');
            if (end < 0) break;
            var entry = output.Slice(cursor, end);
            cursor += end + 1;
            if (entry.Length < 4 || entry[2] != ' ') continue;
            var code = entry[..2];
            var path = entry[3..].ToString().Replace('\\', '/');
            if (path.Length == 0 || path.StartsWith('/') || path.Split('/').Any(segment => segment is "" or "." or "..")) continue;
            var fileStatus = code.Contains('?') ? "Untracked"
                : code.Contains('U') ? "Conflict"
                : code.Contains('A') ? "Added"
                : code.Contains('D') ? "Deleted"
                : code.Contains('R') ? "Renamed"
                : code.Contains('C') ? "Copied"
                : code.Contains('M') ? "Modified" : "Changed";
            total++;
            if (files.Count < 200) files.Add(new WorkspaceGitFileStatus(path, fileStatus));
            if (code.Contains('R') || code.Contains('C'))
            {
                var oldPathEnd = output[cursor..].IndexOf('\0');
                if (oldPathEnd >= 0) cursor += oldPathEnd + 1;
            }
        }
        var truncated = status.OutputTruncated || (output.Length > 0 && output[^1] != '\0') || total > files.Count;
        return new WorkspaceGitStatus(branch.Output.Trim(), head.Output.Trim(), total, truncated, files);
    }
    internal static async Task<WorkspaceBranchResult> EnsureWorkspaceBranchAsync(string root, Guid workspaceId, CancellationToken cancellationToken)
    {
        if (workspaceId == Guid.Empty) return new(null, null, "Geçerli workspace kimliği gerekli.");
        if (!TryResolveDirectory(root, workspaceId, null, out _, out var resolveError))
            return new(null, null, resolveError ?? "Çalışma alanı bulunamadı.");
        var workspace = Path.GetFullPath(Path.Combine(root, workspaceId.ToString("N")));
        var branchName = GetWorkspaceBranchName(workspaceId);
        if (!IsValidBranchName(branchName)) return new(null, null, "Çalışma dalı adı geçersiz.");
        var current = await RunGit(root, ["-C", workspace, "branch", "--show-current"], TimeSpan.FromSeconds(20), cancellationToken);
        if (current.ExitCode != 0) return new(null, null, "Mevcut checkout dalı doğrulanamadı.");
        if (!string.Equals(current.Output.Trim(), branchName, StringComparison.Ordinal))
        {
            var exists = await RunGit(root, ["-C", workspace, "show-ref", "--verify", "--quiet", $"refs/heads/{branchName}"], TimeSpan.FromSeconds(20), cancellationToken);
            var args = exists.ExitCode == 0
                ? new[] { "-C", workspace, "-c", "core.hooksPath=/dev/null", "switch", branchName }
                : new[] { "-C", workspace, "-c", "core.hooksPath=/dev/null", "switch", "--create", branchName };
            var switched = await RunGit(root, args, TimeSpan.FromSeconds(20), cancellationToken);
            if (switched.ExitCode != 0) return new(null, null, "İzole çalışma dalı açılamadı; checkout içeriği korunarak işlem durduruldu.");
        }
        var confirmed = await RunGit(root, ["-C", workspace, "branch", "--show-current"], TimeSpan.FromSeconds(20), cancellationToken);
        if (confirmed.ExitCode != 0 || !string.Equals(confirmed.Output.Trim(), branchName, StringComparison.Ordinal))
            return new(null, null, "İzole çalışma dalı doğrulanamadı.");
        var head = await RunGit(root, ["-C", workspace, "rev-parse", "HEAD"], TimeSpan.FromSeconds(20), cancellationToken);
        if (head.ExitCode != 0 || !IsCommitSha(head.Output.Trim())) return new(null, null, "Checkout commit bilgisi doğrulanamadı.");
        return new(branchName, head.Output.Trim(), null);
    }
    internal static bool IsCommitSha(string value) => value.Length is 40 or 64 && value.All(Uri.IsHexDigit);
    internal static bool IsSha256(string? value) => value is { Length: 64 } && value.All(Uri.IsHexDigit);
    internal static bool IsWorkspaceScopedServiceCaller(ClaimsPrincipal caller, Guid workspaceId) =>
        string.Equals(caller.FindFirstValue("service"), "AIERP.AIService", StringComparison.Ordinal) &&
        Guid.TryParse(caller.FindFirstValue("workspace_id"), out var tokenWorkspaceId) && tokenWorkspaceId == workspaceId;
    internal static bool IsProjectScopedServiceCaller(ClaimsPrincipal caller, Guid projectId) =>
        string.Equals(caller.FindFirstValue("service"), "AIERP.AIService", StringComparison.Ordinal) &&
        Guid.TryParse(caller.FindFirstValue("project_id"), out var tokenProjectId) && tokenProjectId == projectId;
    internal static async Task<GitResult> RunGit(string root, IReadOnlyList<string> args, TimeSpan timeout, CancellationToken cancellationToken,
        IReadOnlyDictionary<string, string>? extraEnvironment = null)
    {
        using var process = new Process { StartInfo = new ProcessStartInfo
        {
            FileName = "git", WorkingDirectory = root, UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true
        }};
        process.StartInfo.Environment.Clear();
        process.StartInfo.Environment["PATH"] = "/usr/bin:/bin";
        process.StartInfo.Environment["HOME"] = root;
        process.StartInfo.Environment["GIT_TERMINAL_PROMPT"] = "0";
        process.StartInfo.Environment["GIT_CONFIG_NOSYSTEM"] = "1";
        process.StartInfo.Environment["GIT_CONFIG_GLOBAL"] = "/dev/null";
        if (extraEnvironment is not null)
            foreach (var (key, value) in extraEnvironment) process.StartInfo.Environment[key] = value;
        foreach (var arg in args) process.StartInfo.ArgumentList.Add(arg);
        process.Start();
        var outputTask = ReadBoundedOutputAsync(process.StandardOutput, 1_000_000);
        var errorTask = ReadBoundedOutputAsync(process.StandardError, 64_000);
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(timeout);
        try { await process.WaitForExitAsync(timeoutCts.Token); }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            await process.WaitForExitAsync(CancellationToken.None);
            _ = await outputTask; _ = await errorTask;
            throw;
        }
        var output = await outputTask;
        _ = await errorTask;
        return new GitResult(process.ExitCode, output.Text, output.Truncated);
    }
    private static async Task<(string Text, bool Truncated)> ReadBoundedOutputAsync(StreamReader reader, int maxCharacters)
    {
        var buffer = new char[8192];
        var text = new StringBuilder(Math.Min(maxCharacters, 8192));
        var truncated = false;
        int read;
        while ((read = await reader.ReadAsync(buffer.AsMemory())) > 0)
        {
            var remaining = maxCharacters - text.Length;
            if (remaining > 0) text.Append(buffer, 0, Math.Min(remaining, read));
            if (read > remaining) truncated = true;
        }
        return (text.ToString(), truncated);
    }
    private static bool IsPrivateAddress(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;
        var b = ip.GetAddressBytes();
        return ip.AddressFamily == AddressFamily.InterNetwork
            ? b[0] == 10 || b[0] == 127 || b[0] == 0 || (b[0] == 169 && b[1] == 254) || (b[0] == 172 && b[1] is >= 16 and <= 31) || (b[0] == 192 && b[1] == 168) || b[0] >= 224
            : (b[0] & 0xfe) == 0xfc;
    }
}
internal sealed record WorkspaceFileApplyResult(bool Applied, string? Error, string? Sha256, Guid? ChangeId = null, DateTimeOffset? AppliedAt = null);

internal static class WorkspaceFileLimits
{
    internal const int MaxManualWorkspaceFileBytes = 900 * 1024;
}
