using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using AIERP.AIService.AI;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var jwtKey = builder.Configuration["Authentication:SigningKey"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32) throw new InvalidOperationException("Authentication:SigningKey must be configured with at least 32 bytes.");
var connectionString = builder.Configuration.GetConnectionString("Platform") ?? throw new InvalidOperationException("ConnectionStrings:Platform is required.");
var separationEnabled = builder.Configuration.GetValue<bool>("Database:SeparationEnabled");
var studioConnection = separationEnabled ? builder.Configuration.GetConnectionString("AIStudio") ?? connectionString : connectionString;
builder.Services.AddDbContext<PlatformDbContext>(o => o.UseSqlServer(connectionString));
builder.Services.AddHttpContextAccessor();
builder.Services.AddDbContext<AIStudioDbContext>((services, options) =>
{
    var http = services.GetRequiredService<IHttpContextAccessor>().HttpContext;
    options.UseSqlServer(TenantDatabaseRouting.ResolveStudio(http, studioConnection, separationEnabled));
});
builder.Services.AddScoped<IAuditExecutionContext>(services =>
{
    var user = services.GetRequiredService<IHttpContextAccessor>().HttpContext?.User;
    return new AuditExecutionContext(
        Guid.TryParse(user?.FindFirstValue("tenant_id"), out var tenantId) ? tenantId : null,
        Guid.TryParse(user?.FindFirstValue("sub"), out var userId) ? userId : null,
        "studio-api");
});
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
    ValidateIssuer = true, ValidIssuer = builder.Configuration["Authentication:Issuer"] ?? "AIERP",
    ValidateAudience = true, ValidAudience = builder.Configuration["Authentication:Audience"] ?? "AIERP",
    ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
    ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30), NameClaimType = "name", RoleClaimType = "role"
    };
});
builder.Services.AddScoped<IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddAuthorization(options => options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
    .RequireAuthenticatedUser().AddRequirements(new PermissionRequirement()).Build());
builder.Services.AddHttpClient("workspace-runner", client => client.Timeout = TimeSpan.FromMinutes(4));
builder.Services.AddHttpClient("release-deployer", client => client.Timeout = TimeSpan.FromMinutes(25));
builder.Services.AddHttpClient<GitHubAppInstallationTokenProvider>(client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient("github-api", client =>
{
    client.BaseAddress = new Uri("https://api.github.com/");
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("AIERP-Development-Studio/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    client.DefaultRequestHeaders.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
});
builder.Services.AddHttpClient<IAIModelProvider, OpenAIResponsesProvider>(client => client.Timeout = TimeSpan.FromSeconds(50));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("ai-architect", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    options.AddPolicy("ai-developer", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    options.AddPolicy("ai-tester", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 3, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    options.AddPolicy("ai-chat", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    options.AddPolicy("workspace-write", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    options.AddPolicy("workspace-read", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
});
var frontendOrigins = builder.Configuration.GetSection("Frontend:Origins").Get<string[]>() ?? [builder.Configuration["Frontend:Origin"] ?? "http://localhost:5173"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(frontendOrigins).AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build(); app.UseCors(); app.UseAuthentication();
app.Use(async (context, next) =>
{
    await TenantDatabaseRouting.ResolveAIStudioRequestAsync(context, app.Services, studioConnection, separationEnabled);
    if (context.Items.ContainsKey(TenantDatabaseRouting.LegacyModeUnavailableKey))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = "database_mode_mismatch", message = "AIStudio is provisioned separately; enable Database:SeparationEnabled before serving Studio data." });
        return;
    }
    if (context.Items.ContainsKey("AIERP.AIStudioDatabaseUnavailable"))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = "studio_database_not_ready", message = "AIStudio database provisioning has not completed." });
        return;
    }
    await next();
});
app.UseAuthorization(); app.UseRateLimiter();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "ai-development-service", mode = "request-intake-project-registry-and-project-explorer" }));
app.MapGet("/studio/capabilities", (ClaimsPrincipal user, IConfiguration configuration) =>
{
    if (!TryScope(user, out _, out _)) return Results.Forbid();
    return Results.Ok(new { aiConfigured = !string.IsNullOrWhiteSpace(configuration["AI:OpenAI:ApiKey"]) });
}).RequireAuthorization();
var studio = app.MapGroup("/studio/requests").RequireAuthorization();
studio.MapGet("/", async (Guid? projectId, ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var isTenantAdmin = user.IsInRole("TenantAdmin");
    var requests = await db.DevelopmentRequests.AsNoTracking().Where(x => x.TenantId == tenantId && (!projectId.HasValue || x.ProjectId == projectId) &&
            (x.ProjectId == null || isTenantAdmin || (x.Project!.IsActive && x.Project.AccessGrants.Any(a => a.UserId == userId))))
        .OrderByDescending(x => x.CreatedAt)
        .Take(100)
        .Select(x => new RequestView(x.Id, x.Title, x.Description, x.Status, x.CreatedAt, x.ProjectId, x.Project == null ? null : x.Project.Name)).ToListAsync();
    return Results.Ok(requests);
});
studio.MapPost("/", async (CreateRequest body, ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var title = body.Title?.Trim(); var description = body.Description?.Trim();
    if (string.IsNullOrWhiteSpace(title) || title.Length > 180 || string.IsNullOrWhiteSpace(description) || description.Length > 8000)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["Title and description are required; title must be at most 180 and description at most 8000 characters."] });
    DevelopmentProject? project = null;
    if (body.ProjectId is { } projectId)
    {
        project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive);
        if (project is null) return Results.NotFound(new { error = "Proje bulunamadı veya etkin değil." });
        var canContribute = user.IsInRole("TenantAdmin") || project.AccessGrants.Any(x => x.UserId == userId && x.AccessLevel is "Contributor" or "Maintainer");
        if (!canContribute) return Results.Forbid();
    }
    var request = new DevelopmentRequest { TenantId = tenantId, ProjectId = project?.Id,
        CreatedByUserId = userId, Title = title, Description = description };
    db.DevelopmentRequests.Add(request); db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.request.created", Resource = request.Id.ToString() });
    await db.SaveChangesAsync();
    return Results.Created($"/studio/requests/{request.Id}", new RequestView(request.Id, request.Title, request.Description,
        request.Status, request.CreatedAt, request.ProjectId, project?.Name));
});
var projects = app.MapGroup("/studio/projects").RequireAuthorization();
projects.MapGet("/", async (ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var isTenantAdmin = user.IsInRole("TenantAdmin");
    var rows = await db.DevelopmentProjects.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.IsActive && (isTenantAdmin || x.AccessGrants.Any(a => a.UserId == userId)))
        .OrderBy(x => x.Name)
        .Select(x => new
        {
            project = x,
            accessLevel = isTenantAdmin ? "TenantAdmin" : x.AccessGrants.Where(a => a.UserId == userId).Select(a => a.AccessLevel).FirstOrDefault()
        }).ToListAsync();
    return Results.Ok(rows.Select(x => new ProjectView(x.project.Id, x.project.Name, x.project.RepositoryUrl,
        x.project.DefaultBranch, x.accessLevel ?? "Viewer", x.project.CreatedAt, x.project.GitHubInstallationId is not null)));
});
projects.MapGet("/{id:guid}/branches", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, GitHubAppInstallationTokenProvider githubTokens, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    string? installationToken;
    try { installationToken = await CreateGitHubReadTokenAsync(project.RepositoryUrl, project.GitHubInstallationId, githubTokens, cancellationToken); }
    catch (GitHubAppConfigurationException) { return Results.Problem("Özel GitHub deposu için GitHub App yetkilendirmesi yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (GitHubIntegrationException) { return Results.Problem("GitHub App bu depo için yetki veremedi. Kurulumu ve depo erişimini kontrol edin.", statusCode: StatusCodes.Status403Forbidden); }
    try
    {
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/projects/branches")
        {
            Content = JsonContent.Create(new RunnerProjectBranchesRequest(id, project.RepositoryUrl))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateProjectRunnerToken(configuration, id, "workspace.list-branches"));
        if (installationToken is not null) message.Headers.TryAddWithoutValidation("X-GitHub-Installation-Token", installationToken);
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.BadRequest)
            return Results.Problem("Depo dalları okunamadı. Depo ve dal erişimini kontrol edin.", statusCode: StatusCodes.Status422UnprocessableEntity);
        if (!response.IsSuccessStatusCode)
            return Results.Problem("Workspace Runner depo dallarını sağlayamadı.", statusCode: (int)response.StatusCode is >= 500 and <= 599 ? (int)response.StatusCode : StatusCodes.Status502BadGateway);
        var result = await response.Content.ReadFromJsonAsync<RunnerProjectBranchesResponse>(cancellationToken: cancellationToken);
        if (result is null || result.Branches.Count > 200 || result.Branches.Any(branch => !IsValidBranchName(branch)))
            return Results.Problem("Workspace Runner geçersiz dal listesi döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.project.branches.listed", Resource = id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new ProjectBranchesView(project.DefaultBranch, result.Branches));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Depo dal listesi isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz dal listesi döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
projects.MapPost("/{id:guid}/github/authorization", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var slug = configuration["GitHub:AppSlug"]?.Trim();
    var callback = configuration["GitHub:SetupCallbackUrl"]?.Trim();
    if (string.IsNullOrWhiteSpace(slug) || slug.Length > 100 || slug.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-') ||
        !Uri.TryCreate(callback, UriKind.Absolute, out var callbackUri) ||
        (callbackUri.Scheme != Uri.UriSchemeHttps && !(callbackUri.Scheme == Uri.UriSchemeHttp && callbackUri.IsLoopback)))
        return Results.Problem("GitHub App bağlantısı yönetici tarafından bir kez yapılandırılmalıdır.", statusCode: StatusCodes.Status503ServiceUnavailable);
    var randomState = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    var stateHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(randomState)));
    var now = DateTimeOffset.UtcNow;
    await db.GitHubInstallationAuthorizationStates.Where(x => x.ExpiresAt <= now || x.ConsumedAt != null).ExecuteDeleteAsync(cancellationToken);
    db.GitHubInstallationAuthorizationStates.Add(new GitHubInstallationAuthorizationState
    {
        TenantId = tenantId, ProjectId = id, UserId = userId, StateHash = stateHash, ExpiresAt = now.AddMinutes(10)
    });
    await db.SaveChangesAsync(cancellationToken);
    var authorizationUrl = QueryHelpers.AddQueryString($"https://github.com/apps/{Uri.EscapeDataString(slug)}/installations/new", "state", randomState);
    return Results.Ok(new { authorizationUrl, expiresAt = now.AddMinutes(10) });
}).RequireAuthorization().RequireRateLimiting("workspace-write");
projects.MapDelete("/{id:guid}/github/authorization", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    project.GitHubInstallationId = null;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.project.github.authorization.revoked", Resource = id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/github/setup-callback", async (long? installation_id, string? setup_action, string? state,
    AIStudioDbContext db, PlatformDbContext platformDb, GitHubAppInstallationTokenProvider tokenProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    var studioUrl = configuration["GitHub:StudioRedirectUrl"] ?? "http://localhost:5174/?app=studio";
    string Return(string outcome, Guid? projectId = null) => QueryHelpers.AddQueryString(studioUrl,
        new Dictionary<string, string?> { ["github"] = outcome, ["projectId"] = projectId?.ToString("D") });
    if (installation_id is null or <= 0 || setup_action is not ("install" or "update") || string.IsNullOrWhiteSpace(state) || state.Length > 200)
        return Results.Redirect(Return("invalid"));
    var stateHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(state)));
    var now = DateTimeOffset.UtcNow;
    var authorization = await db.GitHubInstallationAuthorizationStates.AsNoTracking()
        .SingleOrDefaultAsync(x => x.StateHash == stateHash && x.ExpiresAt > now && x.ConsumedAt == null, cancellationToken);
    if (authorization is null) return Results.Redirect(Return("expired"));
    var project = await db.DevelopmentProjects.Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == authorization.TenantId && x.Id == authorization.ProjectId && x.IsActive, cancellationToken);
    var membership = await platformDb.TenantMemberships.Include(x => x.User)
        .SingleOrDefaultAsync(x => x.TenantId == authorization.TenantId && x.UserId == authorization.UserId, cancellationToken);
    if (project is null || membership?.User.IsActive != true ||
        (membership.Role != "TenantAdmin" && !project.AccessGrants.Any(x => x.UserId == authorization.UserId && x.AccessLevel == "Maintainer")))
        return Results.Redirect(Return("not-authorized", authorization.ProjectId));
    try
    {
        var repository = GetGitHubRepositoryIdentifier(project.RepositoryUrl);
        if (repository is null) return Results.Redirect(Return("unsupported", project.Id));
        _ = await tokenProvider.CreateRepositoryReadTokenAsync(installation_id.Value, repository, cancellationToken);
    }
    catch (GitHubAppConfigurationException) { return Results.Redirect(Return("not-configured", project.Id)); }
    catch (GitHubIntegrationException) { return Results.Redirect(Return("repository-access-denied", project.Id)); }
    catch (HttpRequestException) { return Results.Redirect(Return("repository-access-denied", project.Id)); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Redirect(Return("repository-access-denied", project.Id)); }
    await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
    var consumed = await db.GitHubInstallationAuthorizationStates.Where(x => x.Id == authorization.Id && x.ExpiresAt > now && x.ConsumedAt == null)
        .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.ConsumedAt, now), cancellationToken);
    if (consumed != 1) return Results.Redirect(Return("expired", project.Id));
    project.GitHubInstallationId = installation_id.Value;
    db.AuditEvents.Add(new AuditEvent { TenantId = authorization.TenantId, UserId = authorization.UserId, Action = "studio.project.github.authorization.connected", Resource = project.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    await transaction.CommitAsync(cancellationToken);
    return Results.Redirect(Return("connected", project.Id));
}).AllowAnonymous();
projects.MapPost("/", async (CreateProject body, ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!user.IsInRole("TenantAdmin")) return Results.Forbid();
    var errors = ValidateProject(body);
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var name = body.Name!.Trim();
    if (await db.DevelopmentProjects.AnyAsync(x => x.TenantId == tenantId && x.Name == name))
        return Results.Conflict(new { error = "Bu adla kayıtlı bir proje zaten var." });
    var url = NormalizeRepositoryUrl(body.RepositoryUrl!);
    var project = new DevelopmentProject { TenantId = tenantId, CreatedByUserId = userId, Name = name,
        RepositoryUrl = url, DefaultBranch = body.DefaultBranch!.Trim() };
    db.DevelopmentProjects.Add(project);
    db.DevelopmentProjectAccesses.Add(new DevelopmentProjectAccess { TenantId = tenantId, Project = project,
        UserId = userId, GrantedByUserId = userId, AccessLevel = "Maintainer" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.project.registered", Resource = project.Id.ToString() });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Proje adı eşzamanlı olarak başka bir kayıtta kullanıldı." }); }
    return Results.Created($"/studio/projects/{project.Id}", new ProjectView(project.Id, project.Name, project.RepositoryUrl,
        project.DefaultBranch, "Maintainer", project.CreatedAt, false));
});
projects.MapGet("/{id:guid}/members", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, PlatformDbContext platformDb) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.IsActive);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var grants = await db.DevelopmentProjectAccesses.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == id).ToListAsync();
    var memberIds = grants.Select(x => x.UserId).Distinct().ToArray();
    var users = await platformDb.Users.AsNoTracking().Where(x => memberIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Email);
    return Results.Ok(grants.Where(x => users.ContainsKey(x.UserId)).Select(x => new ProjectMemberView(x.UserId, users[x.UserId], x.AccessLevel, x.GrantedAt)).OrderBy(x => x.Email));
});
projects.MapPost("/{id:guid}/members", async (Guid id, GrantProjectAccess body, ClaimsPrincipal user, AIStudioDbContext db, PlatformDbContext platformDb) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var accessLevel = body.AccessLevel?.Trim();
    var email = body.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(email) || email.Length > 320 || !email.Contains('@') ||
        accessLevel is not ("Viewer" or "Contributor" or "Maintainer"))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["access"] = ["Geçerli bir firma e-postası ve Viewer, Contributor veya Maintainer yetkisi gerekli."] });
    var project = await db.DevelopmentProjects.FromSqlInterpolated($"SELECT * FROM [dbo].[DevelopmentProjects] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id} AND [IsActive] = 1").SingleOrDefaultAsync();
    if (project is null) return Results.NotFound();
    var currentGrants = await db.DevelopmentProjectAccesses.Where(x => x.TenantId == tenantId && x.ProjectId == id).ToListAsync();
    if (!CanManageProject(user, currentGrants, userId)) return Results.Forbid();
    var target = await platformDb.TenantMemberships.Where(x => x.TenantId == tenantId && x.Tenant.IsActive && x.User.IsActive && x.User.Email == email)
        .Select(x => new { x.UserId, x.User.Email }).SingleOrDefaultAsync();
    if (target is null) return Results.NotFound(new { error = "Bu e-posta etkin bir firma üyesine ait değil." });
    var grant = currentGrants.SingleOrDefault(x => x.UserId == target.UserId);
    if (grant is null) db.DevelopmentProjectAccesses.Add(new DevelopmentProjectAccess { TenantId = tenantId, ProjectId = id,
        UserId = target.UserId, GrantedByUserId = userId, AccessLevel = accessLevel });
    else { grant.AccessLevel = accessLevel; grant.GrantedByUserId = userId; grant.GrantedAt = DateTimeOffset.UtcNow; }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.project.access.granted", Resource = $"{id}:{target.UserId}:{accessLevel}" });
    await db.SaveChangesAsync();
    return Results.Ok(new ProjectMemberView(target.UserId, target.Email, accessLevel, DateTimeOffset.UtcNow));
});
projects.MapDelete("/{id:guid}/members/{memberId:guid}", async (Guid id, Guid memberId, ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.FromSqlInterpolated($"SELECT * FROM [dbo].[DevelopmentProjects] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id} AND [IsActive] = 1").SingleOrDefaultAsync();
    if (project is null) return Results.NotFound();
    var grants = await db.DevelopmentProjectAccesses.Where(x => x.TenantId == tenantId && x.ProjectId == id).ToListAsync();
    if (!CanManageProject(user, grants, userId)) return Results.Forbid();
    var grant = grants.SingleOrDefault(x => x.UserId == memberId);
    if (grant is null) return Results.NotFound();
    if (grant.AccessLevel == "Maintainer" && grants.Count(x => x.AccessLevel == "Maintainer") == 1)
        return Results.Conflict(new { error = "Projede en az bir Maintainer erişimi kalmalıdır." });
    db.DevelopmentProjectAccesses.Remove(grant);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.project.access.revoked", Resource = $"{id}:{memberId}" });
    await db.SaveChangesAsync();
    return Results.NoContent();
});
projects.MapGet("/{id:guid}/workspace-requests", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.IsActive);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var rows = await db.DevelopmentWorkspaceRequests.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == id)
        .OrderByDescending(x => x.CreatedAt)
        .Select(x => new { x.Id, x.ProjectId, x.RequestedByUserId, x.BranchName, x.WorkspaceBranchName, x.Status, x.CreatedAt, x.ReviewedByUserId, x.ReviewedAt, x.ReviewNote, x.CommitSha, x.ProvisioningError, x.ProvisionedAt, x.DevelopmentRequestId,
            DevelopmentRequestTitle = x.DevelopmentRequest == null ? null : x.DevelopmentRequest.Title,
            DevelopmentRequestDescription = x.DevelopmentRequest == null ? null : x.DevelopmentRequest.Description }).ToListAsync();
    var canManage = CanManageProject(user, project.AccessGrants, userId);
    var isTenantAdmin = user.IsInRole("TenantAdmin");
    return Results.Ok(rows.Select(x => new WorkspaceRequestView(x.Id, x.ProjectId, x.RequestedByUserId, x.BranchName,
        x.Status, x.CreatedAt, x.ReviewedByUserId, x.ReviewedAt, x.ReviewNote,
        canManage && (x.RequestedByUserId != userId || isTenantAdmin),
        x.CommitSha, x.ProvisioningError, x.ProvisionedAt,
        x.Status == "PendingApproval" && (x.RequestedByUserId == userId || canManage),
        x.DevelopmentRequestId, x.DevelopmentRequestTitle, x.DevelopmentRequestDescription, x.WorkspaceBranchName)));
});
app.MapGet("/studio/workspace-requests/pending", async (int? offset, ClaimsPrincipal user, AIStudioDbContext db, PlatformDbContext platformDb, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var start = offset ?? 0;
    if (start < 0 || start > 10_000) return Results.ValidationProblem(new Dictionary<string, string[]> { ["offset"] = ["Onay kuyruğu sayfa başlangıcı geçersiz."] });
    var isTenantAdmin = user.IsInRole("TenantAdmin");
    var pending = await (
        from request in db.DevelopmentWorkspaceRequests.AsNoTracking()
        join project in db.DevelopmentProjects.AsNoTracking()
            on new { request.TenantId, request.ProjectId } equals new { project.TenantId, ProjectId = project.Id }
        where request.TenantId == tenantId && request.Status == "PendingApproval" &&
            (request.RequestedByUserId != userId || isTenantAdmin) && project.IsActive &&
            (isTenantAdmin || db.DevelopmentProjectAccesses.Any(access => access.TenantId == tenantId && access.ProjectId == request.ProjectId &&
                access.UserId == userId && access.AccessLevel == "Maintainer"))
        orderby request.CreatedAt, request.Id
        select new { request.Id, request.ProjectId, project.Name, request.RequestedByUserId,
            request.BranchName, request.CreatedAt, request.ReviewNote,
            Title = request.DevelopmentRequest == null ? null : request.DevelopmentRequest.Title,
            Description = request.DevelopmentRequest == null ? null : request.DevelopmentRequest.Description }
    ).Skip(start).Take(101).ToListAsync(cancellationToken);
    var requesterIds = pending.Select(x => x.RequestedByUserId).Distinct().ToArray();
    var requesterEmails = await platformDb.Users.AsNoTracking().Where(x => requesterIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Email, cancellationToken);
    var nextOffset = pending.Count > 100 ? start + 100 : (int?)null;
    if (pending.Count > 100) pending.RemoveAt(pending.Count - 1);
    return Results.Ok(new PendingWorkspaceApprovalsPage(pending.Select(x => new PendingWorkspaceApprovalView(x.Id, x.ProjectId, x.Name,
        x.RequestedByUserId, requesterEmails.GetValueOrDefault(x.RequestedByUserId) ?? string.Empty, x.BranchName, x.CreatedAt,
        x.ReviewNote, x.Title, x.Description)).ToList(), nextOffset));
}).RequireAuthorization();
projects.MapPost("/{id:guid}/workspace-requests", async (Guid id, CreateWorkspaceRequest body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.IsActive);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var branch = string.IsNullOrWhiteSpace(body.BranchName) ? project.DefaultBranch : body.BranchName.Trim();
    if (!IsValidBranchName(branch))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["branchName"] = ["Geçerli bir Git branch adı girin (en fazla 256 karakter)."] });
    DevelopmentRequest? developmentRequest = null;
    if (body.DevelopmentRequestId is { } developmentRequestId)
    {
        developmentRequest = await db.DevelopmentRequests.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId &&
            x.Id == developmentRequestId && x.ProjectId == id, cancellationToken);
        if (developmentRequest is null) return Results.NotFound(new { error = "Seçilen talep bu proje çalışma alanında bulunamadı." });
    }
    var request = new DevelopmentWorkspaceRequest { TenantId = tenantId, ProjectId = id, DevelopmentRequestId = developmentRequest?.Id,
        RequestedByUserId = userId, BranchName = branch };
    db.DevelopmentWorkspaceRequests.Add(request);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.requested", Resource = request.DevelopmentRequestId is { } linkedRequestId ? $"{request.Id}:{linkedRequestId}" : request.Id.ToString() });
    await db.SaveChangesAsync();
    return Results.Created($"/studio/workspace-requests/{request.Id}", new WorkspaceRequestView(request.Id, id, userId,
        branch, request.Status, request.CreatedAt, null, null, null, false, null, null, null, true,
        developmentRequest?.Id, developmentRequest?.Title, developmentRequest?.Description));
});
app.MapPost("/studio/workspace-requests/{id:guid}/cancel", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[DevelopmentWorkspaceRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}")
        .SingleOrDefaultAsync(cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "PendingApproval") return Results.Conflict(new { error = "Yalnızca onay bekleyen çalışma alanı talepleri iptal edilebilir." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.ProjectId, cancellationToken);
    if (project is null) return Results.NotFound();
    if (request.RequestedByUserId != userId && !CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    request.Status = "Cancelled";
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.cancelled", Resource = request.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    return Results.Ok(ToWorkspaceView(request, false));
}).RequireAuthorization();
app.MapPost("/studio/workspace-requests/{id:guid}/review", async (Guid id, ReviewWorkspaceRequest body, ClaimsPrincipal user, AIStudioDbContext db) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var outcome = body.Outcome?.Trim(); var note = body.Note?.Trim();
    if (outcome is not ("Approve" or "Reject") || (note?.Length ?? 0) > 500 || (outcome == "Reject" && string.IsNullOrWhiteSpace(note)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["review"] = ["Approve veya Reject seçin. Ret için en fazla 500 karakterlik gerekçe girin."] });
    var request = await db.DevelopmentWorkspaceRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[DevelopmentWorkspaceRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != "PendingApproval") return Results.Conflict(new { error = "Çalışma alanı talebi daha önce değerlendirilmiş." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.ProjectId);
    if (project is null) return Results.Conflict(new { error = "Proje bulunamadı; talep değerlendirilemedi." });
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    if (request.RequestedByUserId == userId && !user.IsInRole("TenantAdmin")) return Results.Forbid();
    request.Status = outcome == "Approve" ? "Approved" : "Rejected";
    request.ReviewedByUserId = userId; request.ReviewedAt = DateTimeOffset.UtcNow; request.ReviewNote = note;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = $"studio.workspace.{request.Status.ToLowerInvariant()}", Resource = request.Id.ToString() });
    await db.SaveChangesAsync();
    return Results.Ok(new WorkspaceRequestView(request.Id, request.ProjectId, request.RequestedByUserId, request.BranchName,
        request.Status, request.CreatedAt, request.ReviewedByUserId, request.ReviewedAt, request.ReviewNote, false,
        request.CommitSha, request.ProvisioningError, request.ProvisionedAt));
});
app.MapPost("/studio/workspace-requests/{id:guid}/provision", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, GitHubAppInstallationTokenProvider githubTokens, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[DevelopmentWorkspaceRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(cancellationToken);
    if (request is null) return Results.NotFound();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.ProjectId && x.IsActive, cancellationToken);
    if (project is null) return Results.Conflict(new { error = "Proje bulunamadı veya etkin değil." });
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    if (request.Status == "Ready") return Results.Ok(ToWorkspaceView(request, false));
    if (request.Status == "Provisioning") return Results.Conflict(new { error = "Çalışma alanı şu anda oluşturuluyor." });
    if (request.Status is not ("Approved" or "ProvisioningFailed"))
        return Results.Conflict(new { error = "Yalnızca onaylanmış talepler için çalışma alanı oluşturulabilir." });
    var baseUrl = configuration["WorkspaceRunner:BaseUrl"];
    if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    string? installationToken;
    try { installationToken = await CreateGitHubReadTokenAsync(project.RepositoryUrl, project.GitHubInstallationId, githubTokens, cancellationToken); }
    catch (GitHubAppConfigurationException) { return Results.Problem("Özel GitHub deposu için GitHub App yetkilendirmesi yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (GitHubIntegrationException) { return Results.Problem("GitHub App bu depo için yetki veremedi. Kurulumu ve depo erişimini kontrol edin.", statusCode: StatusCodes.Status403Forbidden); }

    request.Status = "Provisioning"; request.ProvisioningError = null;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.provisioning.started", Resource = request.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/workspaces/provision")
        {
            Content = JsonContent.Create(new RunnerProvisionRequest(request.Id, project.RepositoryUrl, request.BranchName))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.provision"));
        if (installationToken is not null) message.Headers.TryAddWithoutValidation("X-GitHub-Installation-Token", installationToken);
        using var response = await client.SendAsync(message, CancellationToken.None);
        if (!response.IsSuccessStatusCode)
        {
            request.Status = "ProvisioningFailed";
            request.ProvisioningError = response.StatusCode == HttpStatusCode.BadRequest
                ? "Depoya erişim veya dal doğrulanamadı. Depo özelse GitHub App yetkilendirmesi gereklidir; kurulumun bu depoya erişimi olduğunu kontrol edin."
                : response.StatusCode == HttpStatusCode.Forbidden
                    ? "Özel depoya erişim için GitHub App yetkilendirmesi gerekli. GitHub App kurulumunu ve depo izinlerini kontrol edin."
                    : "Workspace Runner checkout işlemini tamamlayamadı.";
        }
        else
        {
            var result = await response.Content.ReadFromJsonAsync<RunnerProvisionResponse>(cancellationToken: CancellationToken.None);
            var expectedWorkspaceBranch = GetWorkspaceBranchName(request.Id);
            if (result is null || result.WorkspaceId != request.Id || !IsCommitSha(result.CommitSha) ||
                !string.Equals(result.WorkspaceBranchName, expectedWorkspaceBranch, StringComparison.Ordinal))
            {
                request.Status = "ProvisioningFailed"; request.ProvisioningError = "Runner geçerli bir checkout sonucu döndürmedi.";
            }
            else
            {
                request.Status = "Ready"; request.CommitSha = result.CommitSha; request.WorkspaceBranchName = result.WorkspaceBranchName; request.ProvisionedAt = DateTimeOffset.UtcNow;
                request.ProvisioningError = null;
            }
        }
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException)
    {
        request.Status = "ProvisioningFailed";
        request.ProvisioningError = ex is TaskCanceledException ? "Workspace Runner zaman aşımına uğradı." : "Workspace Runner bağlantısı kurulamadı veya geçersiz yanıt verdi.";
    }
    if (request.Status == "Ready")
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.provisioned", Resource = request.Id.ToString() });
    else
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.provisioning.failed", Resource = request.Id.ToString() });
    await db.SaveChangesAsync(CancellationToken.None);
    return request.Status == "Ready" ? Results.Ok(ToWorkspaceView(request, false)) : Results.Problem(request.ProvisioningError,
        statusCode: request.ProvisioningError?.Contains("yetkilendirme", StringComparison.OrdinalIgnoreCase) == true
            ? StatusCodes.Status403Forbidden : StatusCodes.Status502BadGateway);
});
app.MapPost("/studio/workspace-requests/{id:guid}/working-branch", async (Guid id, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Dal yalnızca hazır workspace için oluşturulabilir." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.ProjectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var expectedBranch = GetWorkspaceBranchName(request.Id);
    if (string.Equals(request.WorkspaceBranchName, expectedBranch, StringComparison.Ordinal)) return Results.Ok(ToWorkspaceView(request, false));
    if (request.WorkspaceBranchName is not null) return Results.Conflict(new { error = "Workspace çalışma dalı beklenen izole adla eşleşmiyor." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.branch.requested", Resource = request.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{request.Id:D}/working-branch");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.branch.create"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner izole çalışma dalını oluşturamadı.", statusCode: StatusCodes.Status502BadGateway);
        var result = await response.Content.ReadFromJsonAsync<RunnerWorkspaceBranch>(cancellationToken: cancellationToken);
        if (result is null || result.WorkspaceId != request.Id || !string.Equals(result.BranchName, expectedBranch, StringComparison.Ordinal) || !IsCommitSha(result.CommitSha))
            return Results.Problem("Workspace Runner geçersiz çalışma dalı bilgisi döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        request.WorkspaceBranchName = result.BranchName;
        request.CommitSha = result.CommitSha;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.branch.created", Resource = $"{request.Id}:{result.BranchName}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToWorkspaceView(request, false));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Çalışma dalı oluşturma zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/files", async (Guid projectId, Guid requestId, string? path, int? offset, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Dosya gezgini yalnızca hazır çalışma alanlarında kullanılabilir." });
    var start = offset ?? 0;
    if (start < 0 || start > 50_000 || (path?.Length ?? 0) > 500)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["path"] = ["Dosya yolu veya sayfa başlangıcı geçersiz."] });
    var baseUrl = configuration["WorkspaceRunner:BaseUrl"];
    if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    using var client = clients.CreateClient("workspace-runner");
    client.BaseAddress = runnerUri;
    var relativePath = string.IsNullOrEmpty(path) ? "" : $"&path={Uri.EscapeDataString(path)}";
    using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/files?offset={start}{relativePath}");
    message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.read"));
    try
    {
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            var listing = await response.Content.ReadFromJsonAsync<RunnerFileListing>(cancellationToken: cancellationToken);
            return listing is null ? Results.Problem("Runner geçersiz dosya listesi döndürdü.", statusCode: StatusCodes.Status502BadGateway) : Results.Ok(listing);
        }
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Checkout bulunamadı; çalışma alanı durumunu yenileyin." });
        if (response.StatusCode == HttpStatusCode.BadRequest) return Results.ValidationProblem(new Dictionary<string, string[]> { ["path"] = ["Dosya yolu geçersiz veya klasör bulunamadı."] });
        return Results.Problem("Workspace Runner dosya listesini sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Dosya listesi isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization();
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/file-content", async (Guid projectId, Guid requestId, string? path, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Dosya önizlemesi yalnızca hazır çalışma alanlarında kullanılabilir." });
    if (string.IsNullOrWhiteSpace(path) || path.Length > 500)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["path"] = ["Bir dosya yolu gerekli."] });
    var baseUrl = configuration["WorkspaceRunner:BaseUrl"];
    if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    using var client = clients.CreateClient("workspace-runner");
    client.BaseAddress = runnerUri;
    using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/file-content?path={Uri.EscapeDataString(path)}");
    message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.read-file"));
    try
    {
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadFromJsonAsync<RunnerFileContent>(cancellationToken: cancellationToken);
            if (content is not null)
            {
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.file.previewed", Resource = request.Id.ToString() });
                await db.SaveChangesAsync(cancellationToken);
            }
            return content is null ? Results.Problem("Runner geçersiz dosya içeriği döndürdü.", statusCode: StatusCodes.Status502BadGateway) : Results.Ok(content);
        }
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Dosya bulunamadı." });
        if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (response.StatusCode == HttpStatusCode.UnsupportedMediaType) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
        if (response.StatusCode == HttpStatusCode.BadRequest) return Results.ValidationProblem(new Dictionary<string, string[]> { ["path"] = ["Dosya yolu geçersiz veya dosya açılamıyor."] });
        return Results.Problem("Workspace Runner dosya önizlemesi sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Dosya önizlemesi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization();
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/analysis", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Proje haritası yalnızca hazır çalışma alanlarında üretilebilir." });
    var baseUrl = configuration["WorkspaceRunner:BaseUrl"];
    if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    using var client = clients.CreateClient("workspace-runner");
    client.BaseAddress = runnerUri;
    using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/analysis");
    message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.analyze"));
    try
    {
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            var analysis = await response.Content.ReadFromJsonAsync<RunnerWorkspaceAnalysis>(cancellationToken: cancellationToken);
            if (analysis is not null)
            {
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.analyzed", Resource = request.Id.ToString() });
                await db.SaveChangesAsync(cancellationToken);
            }
            return analysis is null ? Results.Problem("Runner geçersiz proje envanteri döndürdü.", statusCode: StatusCodes.Status502BadGateway) : Results.Ok(analysis);
        }
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Checkout bulunamadı; çalışma alanı durumunu yenileyin." });
        return Results.Problem("Workspace Runner proje envanterini oluşturamadı.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Proje envanteri isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization();
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/test-discovery", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Test hedefleri yalnızca hazır çalışma alanlarında bulunabilir." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-discovery");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.discover"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner test hedeflerini bulamadı.", statusCode: StatusCodes.Status502BadGateway);
        var discovery = await response.Content.ReadFromJsonAsync<RunnerTestDiscovery>(cancellationToken: cancellationToken);
        if (discovery is null) return Results.Problem("Runner geçersiz test keşif yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.tests.discovered", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(discovery);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Test hedefleri taraması zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization();
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/test-runs", async (Guid projectId, Guid requestId, [FromBody] CreateWorkspaceTestRun body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.ExecutionConfirmed) return Results.BadRequest(new { error = "Proje kodunu yalıtılmış sandbox içinde çalıştırmak için açık onay gerekli." });
    var isDotNetTarget = Path.GetExtension(body.TargetPath ?? "").Equals(".csproj", StringComparison.OrdinalIgnoreCase);
    var isNodeTarget = Path.GetFileName(body.TargetPath ?? "").Equals("package.json", StringComparison.OrdinalIgnoreCase);
    var isPythonTarget = Path.GetExtension(body.TargetPath ?? "").Equals(".py", StringComparison.OrdinalIgnoreCase);
    var isGoTarget = Path.GetExtension(body.TargetPath ?? "").Equals(".go", StringComparison.OrdinalIgnoreCase);
    var isRustTarget = Path.GetFileName(body.TargetPath ?? "").Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase);
    if ((!IsStudioSourcePath(body.TargetPath) && !IsStudioCargoManifestPath(body.TargetPath)) || (!isDotNetTarget && !isNodeTarget && !isPythonTarget && !isGoTarget && !isRustTarget))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["targetPath"] = ["Yalnız keşfedilmiş bir .NET, Node.js, Python, Go veya Rust test hedefi çalıştırılabilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Test çalıştırmadan önce izole çalışma dalı oluşturulmalı." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{request.Id:D}/test-runs")
        { Content = System.Net.Http.Json.JsonContent.Create(new RunnerTestRunRequest(body.TargetPath)) };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.execute"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Conflict) return Results.Conflict(await response.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken));
        if (response.StatusCode == HttpStatusCode.BadRequest) return Results.BadRequest(await response.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken));
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
            return Results.Json(await response.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken) ?? new { error = "Test sandbox kuyruğu dolu. Birkaç dakika sonra yeniden deneyin." }, statusCode: StatusCodes.Status429TooManyRequests);
        if (response.StatusCode == HttpStatusCode.ServiceUnavailable) return Results.Problem("Workspace sandbox kuyruğu kullanılamıyor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (response.StatusCode != HttpStatusCode.Accepted) return Results.Problem("Sandbox testi kuyruğa alınamadı.", statusCode: StatusCodes.Status502BadGateway);
        var job = await response.Content.ReadFromJsonAsync<RunnerTestRunCreated>(cancellationToken: cancellationToken);
        if (job is null) return Results.Problem("Runner geçersiz test işi yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.tests.requested", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Accepted($"/studio/projects/{projectId:D}/workspace-requests/{requestId:D}/test-runs/{job.JobId:D}", job);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sandbox test işi kuyruğa alınırken zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/test-runs/{jobId:guid}", async (Guid projectId, Guid requestId, Guid jobId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-runs/{jobId:D}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.status"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound();
        if (!response.IsSuccessStatusCode) return Results.Problem("Sandbox test durumu okunamadı.", statusCode: StatusCodes.Status502BadGateway);
        var status = await response.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (status is null) return Results.Problem("Runner geçersiz test durumu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        var isTerminal = status.Status is "Passed" or "Failed" or "TimedOut" or "QueueExpired" or "DependencyUnavailable" or "Rejected" or "SandboxError";
        if (isTerminal)
        {
            var resource = $"{request.Id:D}:{jobId:D}";
            if (!await db.AuditEvents.AnyAsync(x => x.TenantId == tenantId && x.Action == "studio.workspace.tests.completed" && x.Resource == resource, cancellationToken))
            {
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.tests.completed", Resource = resource });
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        return Results.Ok(status);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sandbox test durumu isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/build-runs", async (Guid projectId, Guid requestId, CreateWorkspaceTestRun body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.ExecutionConfirmed) return Results.BadRequest(new { error = "Proje kodunu sandbox içinde build etmek için açık onay gerekli." });
    if (!IsStudioSourcePath(body.TargetPath) || !Path.GetExtension(body.TargetPath ?? "").Equals(".csproj", StringComparison.OrdinalIgnoreCase))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["targetPath"] = ["Yalnız keşfedilmiş .NET proje dosyaları build edilebilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Build çalıştırmadan önce izole çalışma dalı oluşturulmalı." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{request.Id:D}/build-runs") { Content = System.Net.Http.Json.JsonContent.Create(new RunnerWorkspaceBuildRequest(body.TargetPath)) };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.build.execute"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Conflict) return Results.Conflict(await response.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken));
        if (response.StatusCode == HttpStatusCode.BadRequest) return Results.BadRequest(await response.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken));
        if (response.StatusCode == HttpStatusCode.TooManyRequests) return Results.Json(await response.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken) ?? new { error = "Sandbox kuyruğu dolu." }, statusCode: StatusCodes.Status429TooManyRequests);
        if (response.StatusCode == HttpStatusCode.ServiceUnavailable) return Results.Problem("Workspace Sandbox kuyruğu kullanılamıyor.", statusCode: StatusCodes.Status503ServiceUnavailable);
        if (response.StatusCode != HttpStatusCode.Accepted) return Results.Problem("Sandbox build işi kuyruğa alınamadı.", statusCode: StatusCodes.Status502BadGateway);
        var job = await response.Content.ReadFromJsonAsync<RunnerTestRunCreated>(cancellationToken: cancellationToken);
        if (job is null) return Results.Problem("Runner geçersiz build işi yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.builds.requested", Resource = $"{request.Id:D}:{job.JobId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Accepted($"/studio/projects/{projectId:D}/workspace-requests/{requestId:D}/build-runs/{job.JobId:D}", job);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sandbox build işi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/build-runs/{jobId:guid}", async (Guid projectId, Guid requestId, Guid jobId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/build-runs/{jobId:D}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.build.status"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound();
        if (!response.IsSuccessStatusCode) return Results.Problem("Sandbox build durumu okunamadı.", statusCode: StatusCodes.Status502BadGateway);
        var status = await response.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (status is null) return Results.Problem("Runner geçersiz build durumu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        if (status.Status is "Built" or "BuildFailed" or "TimedOut" or "QueueExpired" or "DependencyUnavailable" or "Rejected" or "SandboxError")
        {
            var resource = $"{request.Id:D}:{jobId:D}";
            if (!await db.AuditEvents.AnyAsync(x => x.TenantId == tenantId && x.Action == "studio.workspace.builds.completed" && x.Resource == resource, cancellationToken))
            {
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.builds.completed", Resource = resource });
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        return Results.Ok(status);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sandbox build durumu zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz build yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/sandbox-error-analysis/{jobId:guid}", async (Guid projectId, Guid requestId, Guid jobId, CreateSandboxErrorAnalysis body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.AISharingConfirmed) return Results.BadRequest(new { error = "Sandbox çıktısını maskeleyip OpenAI’ye göndermek için açık onay gerekli." });
    if (body.Operation is not ("test" or "build")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["operation"] = ["İşlem test veya build olmalıdır."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "İzole çalışma dalı hazır değil." });
    if (string.IsNullOrWhiteSpace(configuration["AI:OpenAI:ApiKey"])) return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        var scope = body.Operation == "test" ? "workspace.tests.status" : "workspace.build.status";
        var route = body.Operation == "test" ? "test-runs" : "build-runs";
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/{route}/{jobId:D}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, scope));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound();
        if (!response.IsSuccessStatusCode) return Results.Problem("Sandbox işi okunamadı.", statusCode: StatusCodes.Status502BadGateway);
        var status = await response.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (status is null) return Results.Problem("Runner geçersiz sandbox sonucu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        var failed = body.Operation == "test" ? status.Status is "Failed" or "TimedOut" or "QueueExpired" or "DependencyUnavailable" or "Rejected" or "SandboxError"
            : status.Status is "BuildFailed" or "TimedOut" or "QueueExpired" or "DependencyUnavailable" or "Rejected" or "SandboxError";
        if (!failed) return Results.Conflict(new { error = "Yalnızca başarısız veya tamamlanamayan sandbox işleri analiz edilebilir.", status = status.Status });
        var context = new SandboxErrorContext(body.Operation, status.TargetPath, status.Status, status.ExitCode,
            SandboxLogRedactor.Redact(status.Message), SandboxLogRedactor.Redact(status.Output), status.CommitSha);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.sandbox-error-analysis.requested", Resource = $"{request.Id:D}:{jobId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        var analysis = await aiProvider.AnalyzeSandboxErrorAsync(project.Name, request.WorkspaceBranchName, context, cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.sandbox-error-analysis.completed", Resource = $"{request.Id:D}:{jobId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { jobId, analysis, operation = body.Operation, targetPath = status.TargetPath, status = status.Status, commitSha = status.CommitSha, outputWasRedacted = true, sourceOutputPersisted = false });
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI sandbox hata analizi yanıtı alınamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner veya AI sağlayıcısına bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Runner veya AI sağlayıcısı geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sandbox hata analizi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("ai-tester");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-candidates", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var requestExists = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .AnyAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (!requestExists) return Results.NotFound();
    var candidates = await db.ReleaseCandidateRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId)
        .OrderByDescending(x => x.CreatedAt)
        .Take(100)
        .ToListAsync(cancellationToken);
    var candidateIds = candidates.Select(x => x.Id).ToArray();
    var reviews = await db.ReleaseCandidateReviewRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && candidateIds.Contains(x.ReleaseCandidateId))
        .ToDictionaryAsync(x => x.ReleaseCandidateId, cancellationToken);
    return Results.Ok(candidates.Select(candidate =>
    {
        reviews.TryGetValue(candidate.Id, out var review);
        return new ReleaseCandidateView(candidate.Id, candidate.WorkspaceRequestId, candidate.BranchName, candidate.CommitSha, candidate.TestJobId,
            candidate.TestTargetPath, candidate.TestSnapshotSha256, candidate.TestCompletedAt, candidate.CreatedAt, candidate.CreatedByUserId,
            review?.Decision, review?.Note, review?.CreatedAt, review?.ReviewedByUserId,
            user.IsInRole("TenantAdmin") && candidate.CreatedByUserId != userId && review is null);
    }));
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-versions", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var candidateIds = await db.ReleaseCandidateRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId)
        .Select(x => x.Id).ToListAsync(cancellationToken);
    var versions = await db.StudioReleaseVersionRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && candidateIds.Contains(x.ReleaseCandidateId))
        .OrderByDescending(x => x.CreatedAt)
        .Select(x => new StudioReleaseVersionView(x.Id, x.ReleaseCandidateId, x.Version, x.CommitSha, x.CreatedAt, x.CreatedByUserId))
        .ToListAsync(cancellationToken);
    return Results.Ok(versions);
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-packages", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var candidateIds = await db.ReleaseCandidateRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId)
        .Select(x => x.Id).ToListAsync(cancellationToken);
    var versionIds = await db.StudioReleaseVersionRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && candidateIds.Contains(x.ReleaseCandidateId))
        .Select(x => x.Id).ToListAsync(cancellationToken);
    var packages = await db.StudioReleasePackageRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && versionIds.Contains(x.ReleaseVersionId))
        .OrderByDescending(x => x.CreatedAt)
        .Select(x => new StudioReleasePackageView(x.Id, x.ReleaseVersionId, x.Version, x.CommitSha, x.TestSnapshotSha256, x.PackageSha256, x.FileName, x.SizeBytes, x.CreatedAt, x.CreatedByUserId))
        .ToListAsync(cancellationToken);
    return Results.Ok(packages);
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-versions/{versionId:guid}/package", async (Guid projectId, Guid requestId, Guid versionId, ConfirmReleasePackage body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Sürüm paketi oluşturmak için açık onay gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var version = await db.StudioReleaseVersionRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == versionId, cancellationToken);
    if (version is null) return Results.NotFound();
    if (await db.StudioReleasePackageRecords.AnyAsync(x => x.TenantId == tenantId && x.ReleaseVersionId == versionId, cancellationToken))
        return Results.Conflict(new { error = "Bu sürüm için paket zaten oluşturulmuş; paket kaydı değiştirilemez." });
    var candidate = await db.ReleaseCandidateRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == version.ReleaseCandidateId, cancellationToken);
    if (candidate is null || !string.Equals(candidate.CommitSha, version.CommitSha, StringComparison.OrdinalIgnoreCase)) return Results.Conflict(new { error = "Sürüm adayı ve sürüm metadata'sı eşleşmiyor." });
    var review = await db.ReleaseCandidateReviewRecords.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidate.Id, cancellationToken);
    if (review?.Decision != "Approved" || review.ReviewedByUserId == candidate.CreatedByUserId)
        return Results.Conflict(new { error = "Paket için sürüm adayını oluşturan kişiden bağımsız yetkili onayı gerekli." });
    var workspaceRequest = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (workspaceRequest is null || workspaceRequest.WorkspaceBranchName != candidate.BranchName)
        return Results.Conflict(new { error = "Sürüm adayının izole çalışma alanı artık hazır değil." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var gitMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{requestId:D}/git-status");
        gitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, requestId, "workspace.git-status.read"));
        using var gitResponse = await client.SendAsync(gitMessage, cancellationToken);
        if (!gitResponse.IsSuccessStatusCode) return Results.Problem("Sürüm adayı Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await gitResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || git.TotalChangedFiles != 0 || git.Files.Count != 0 || git.BranchName != candidate.BranchName || !string.Equals(git.HeadCommitSha, version.CommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Aynı temiz commit üzerindeki sürüm adayı gerekli." });
        using var testMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{requestId:D}/test-runs/{candidate.TestJobId:D}");
        testMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, requestId, "workspace.tests.status"));
        using var testResponse = await client.SendAsync(testMessage, cancellationToken);
        if (testResponse.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Başarılı sandbox test kanıtı bulunamadı." });
        if (!testResponse.IsSuccessStatusCode) return Results.Problem("Sandbox test kanıtı doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var test = await testResponse.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (test is null || test.Status != "Passed" || test.Success != true || test.CompletedAt is null || test.HasUncommittedChanges ||
            !string.Equals(test.CommitSha, version.CommitSha, StringComparison.OrdinalIgnoreCase) || !string.Equals(test.SnapshotSha256, candidate.TestSnapshotSha256, StringComparison.OrdinalIgnoreCase) || test.TargetPath != candidate.TestTargetPath)
            return Results.Conflict(new { error = "Paket için aynı commit ve snapshot üzerindeki başarılı sandbox testi gerekli." });
        var packageId = Guid.NewGuid();
        var createMessage = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{requestId:D}/release-packages")
        {
            Content = JsonContent.Create(new RunnerCreateReleasePackage(packageId, version.Version, version.CommitSha, candidate.TestJobId, candidate.TestTargetPath, candidate.TestSnapshotSha256, true))
        };
        createMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, requestId, "workspace.release-package.create"));
        using var createResponse = await client.SendAsync(createMessage, cancellationToken);
        if (!createResponse.IsSuccessStatusCode) return Results.Problem("Sürüm paketi Runner tarafından oluşturulamadı.", statusCode: (int)createResponse.StatusCode >= 500 ? StatusCodes.Status502BadGateway : StatusCodes.Status409Conflict);
        var package = await createResponse.Content.ReadFromJsonAsync<RunnerReleasePackage>(cancellationToken: cancellationToken);
        if (package is null || package.PackageId != packageId || package.Version != version.Version || package.CommitSha != version.CommitSha || package.SizeBytes is <= 0 or > 100 * 1024 * 1024 || !IsSha256(package.PackageSha256) || package.FileCount <= 0 || package.FileCount > 20_000)
            return Results.Problem("Workspace Runner geçersiz paket metadata'sı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        var record = new StudioReleasePackageRecord { Id = packageId, TenantId = tenantId, ProjectId = projectId, ReleaseVersionId = versionId, CreatedByUserId = userId,
            Version = version.Version, CommitSha = version.CommitSha, TestSnapshotSha256 = candidate.TestSnapshotSha256, PackageSha256 = package.PackageSha256.ToUpperInvariant(),
            FileName = package.FileName, SizeBytes = package.SizeBytes, CreatedAt = package.CreatedAt };
        db.StudioReleasePackageRecords.Add(record);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.package.created", Resource = $"{requestId:D}:{versionId:D}:{packageId:D}:{record.PackageSha256}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new StudioReleasePackageView(record.Id, record.ReleaseVersionId, record.Version, record.CommitSha, record.TestSnapshotSha256, record.PackageSha256, record.FileName, record.SizeBytes, record.CreatedAt, userId));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sürüm paketi oluşturma zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (DbUpdateException) { return Results.Conflict(new { error = "Bu sürüm için paket zaten oluşturulmuş." }); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-packages/{packageId:guid}/deployments/staging", async (Guid projectId, Guid requestId, Guid packageId, CreateStagingDeployment body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirmation || body.IdempotencyKey == Guid.Empty) return Results.BadRequest(new { error = "Açık staging onayı ve idempotency anahtarı gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var workspaceRequest = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (workspaceRequest is null) return Results.NotFound();
    var package = await db.StudioReleasePackageRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == packageId, cancellationToken);
    if (package is null) return Results.NotFound();
    var version = await db.StudioReleaseVersionRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == package.ReleaseVersionId, cancellationToken);
    var candidate = version is null ? null : await db.ReleaseCandidateRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == version.ReleaseCandidateId, cancellationToken);
    if (candidate is null || version is null || candidate.CommitSha != package.CommitSha || version.CommitSha != package.CommitSha)
        return Results.Conflict(new { error = "Paket, sürüm adayı ve commit aynı proje/istek kapsamında eşleşmiyor." });
    if (body.RollbackTargetDeploymentId is null && candidate.WorkspaceRequestId != requestId)
        return Results.Conflict(new { error = "Normal dağıtım paketi seçili workspace isteğine ait olmalıdır." });
    var review = await db.ReleaseCandidateReviewRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidate.Id, cancellationToken);
    if (review?.Decision != "Approved" || review.ReviewedByUserId == candidate.CreatedByUserId)
        return Results.Conflict(new { error = "Staging dağıtımı için adayı oluşturandan bağımsız yetkili onayı gerekli." });
    var activeDeployment = await db.StudioReleaseDeploymentRecords
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Staging && x.Status == StudioReleaseDeploymentRules.Succeeded)
        .OrderByDescending(x => x.CompletedAt).FirstOrDefaultAsync(cancellationToken);
    var existing = await db.StudioReleaseDeploymentRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.IdempotencyKey == body.IdempotencyKey, cancellationToken);
    if (activeDeployment?.Id != body.ExpectedActiveDeploymentId &&
        !(existing is not null && existing.ProjectId == projectId && existing.ReleasePackageId == packageId && existing.RollbackOfDeploymentId == body.ExpectedActiveDeploymentId))
        return Results.Conflict(new { error = "Staging dağıtımı değişti; geçmişi yenileyip tekrar deneyin." });
    if (body.RollbackTargetDeploymentId is Guid rollbackId)
    {
        var rollbackTarget = await db.StudioReleaseDeploymentRecords.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == rollbackId, cancellationToken);
        if (activeDeployment is null || rollbackTarget is null || rollbackTarget.ReleasePackageId != packageId ||
            !StudioReleaseDeploymentRules.CanRollback(activeDeployment, rollbackTarget))
            return Results.Conflict(new { error = "Rollback hedefi aynı projedeki daha eski ve başarılı bir dağıtım olmalıdır." });
    }
    if (existing is not null && (existing.ProjectId != projectId || existing.ReleasePackageId != packageId || existing.Environment != StudioReleaseDeploymentRules.Staging))
        return Results.Conflict(new { error = "Idempotency anahtarı farklı dağıtım metadata'sıyla kullanılmış." });
    var deployment = existing ?? new StudioReleaseDeploymentRecord
    {
        TenantId = tenantId, ProjectId = projectId, ReleasePackageId = packageId, CreatedByUserId = userId,
        RollbackOfDeploymentId = body.ExpectedActiveDeploymentId, RollbackTargetDeploymentId = body.RollbackTargetDeploymentId, IdempotencyKey = body.IdempotencyKey,
        Environment = StudioReleaseDeploymentRules.Staging, Provider = "DockerCompose", Status = StudioReleaseDeploymentRules.Queued,
        PackageSha256 = package.PackageSha256, CommitSha = package.CommitSha
    };
    if (existing is null)
    {
        db.StudioReleaseDeploymentRecords.Add(deployment);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = body.RollbackTargetDeploymentId is null ? "studio.release.staging.requested" : "studio.release.staging.rollback.requested", Resource = $"{requestId:D}:{deployment.Id:D}:{packageId:D}:{package.PackageSha256}" });
        await db.SaveChangesAsync(cancellationToken);
    }
    if (!Uri.TryCreate(configuration["ReleaseDeployer:BaseUrl"], UriKind.Absolute, out var deployerUri) || deployerUri.Scheme != Uri.UriSchemeHttp)
    {
        deployment.Status = StudioReleaseDeploymentRules.Failed; deployment.FailureCode = "DeployerUnavailable"; deployment.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Results.Problem("Yerel staging deployer yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    try
    {
        deployment.Status = StudioReleaseDeploymentRules.Building; deployment.StartedAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        using var client = clients.CreateClient("release-deployer"); client.BaseAddress = deployerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/deployments/staging")
        {
            Content = JsonContent.Create(new DeployerStagingDeployment(deployment.Id, tenantId, projectId, packageId, deployment.IdempotencyKey, body.ExpectedActiveDeploymentId, package.PackageSha256, package.CommitSha, package.Version))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateReleaseDeployerToken(configuration, deployment, "release.staging.deploy"));
        using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, CancellationToken.None);
        if (!response.IsSuccessStatusCode)
        {
            deployment.Status = StudioReleaseDeploymentRules.Failed; deployment.FailureCode = response.StatusCode == HttpStatusCode.Conflict ? "ArtifactVerificationFailed" : "DeploymentFailed"; deployment.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
            return Results.Problem("Staging dağıtımı başarısız oldu. Hata ayrıntıları hassas kaynak veya ortam değerleri içerebileceğinden API üzerinden gösterilmedi.", statusCode: response.StatusCode == HttpStatusCode.Conflict ? StatusCodes.Status409Conflict : StatusCodes.Status502BadGateway);
        }
        var result = await response.Content.ReadFromJsonAsync<DeployerStagingDeploymentResult>(cancellationToken: CancellationToken.None);
        if (result is null || result.DeploymentId != deployment.Id || result.PackageId != packageId || !string.Equals(result.PackageSha256, package.PackageSha256, StringComparison.OrdinalIgnoreCase) || result.CommitSha != package.CommitSha || !Uri.TryCreate(result.Url, UriKind.Absolute, out var stagingUrl) || stagingUrl.Scheme != Uri.UriSchemeHttp || stagingUrl.Host is not ("localhost" or "127.0.0.1"))
        {
            deployment.Status = StudioReleaseDeploymentRules.Failed; deployment.FailureCode = "InvalidDeployerResponse"; deployment.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
            return Results.Problem("Staging deployer geçersiz dağıtım metadata'sı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        }
        deployment.Status = StudioReleaseDeploymentRules.Succeeded; deployment.ProviderDeploymentId = result.ProviderDeploymentId;
        deployment.EnvironmentUrl = result.Url; deployment.CompletedAt = result.CreatedAt;
        if (activeDeployment is not null) activeDeployment.Status = StudioReleaseDeploymentRules.Superseded;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.staging.succeeded", Resource = $"{deployment.Id:D}:{package.PackageSha256}" });
        await db.SaveChangesAsync(CancellationToken.None);
        var showBootstrapCredentials = body.ExpectedActiveDeploymentId is null;
        return Results.Ok(new StudioStagingDeploymentOperationResult(ToReleaseDeploymentView(deployment),
            showBootstrapCredentials ? result.BootstrapEmail : "", showBootstrapCredentials ? result.BootstrapPassword : ""));
    }
    catch (HttpRequestException)
    {
        deployment.Status = StudioReleaseDeploymentRules.Failed; deployment.FailureCode = "DeployerUnavailable"; deployment.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(CancellationToken.None);
        return Results.Problem("Staging deployer bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (TaskCanceledException)
    {
        deployment.Status = StudioReleaseDeploymentRules.Failed; deployment.FailureCode = "DeploymentTimeout"; deployment.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(CancellationToken.None);
        return Results.Problem("Staging dağıtımı zaman aşımına uğradı; aynı idempotency anahtarıyla güvenli biçimde yeniden deneyin.", statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (System.Text.Json.JsonException)
    {
        deployment.Status = StudioReleaseDeploymentRules.Failed; deployment.FailureCode = "InvalidDeployerResponse"; deployment.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(CancellationToken.None);
        return Results.Problem("Staging deployer geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway);
    }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-deployments", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var requestExists = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .AnyAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (!requestExists) return Results.NotFound();
    var deployments = await (from deployment in db.StudioReleaseDeploymentRecords.AsNoTracking()
        join package in db.StudioReleasePackageRecords.AsNoTracking() on new { deployment.TenantId, Id = deployment.ReleasePackageId } equals new { package.TenantId, package.Id }
        join version in db.StudioReleaseVersionRecords.AsNoTracking() on new { package.TenantId, Id = package.ReleaseVersionId } equals new { version.TenantId, version.Id }
        where deployment.TenantId == tenantId && deployment.ProjectId == projectId
        orderby deployment.CreatedAt descending
        select new { Deployment = deployment, Version = version.Version }).Take(100).ToListAsync(cancellationToken);
    return Results.Ok(deployments.Select(item => ToReleaseDeploymentView(item.Deployment) with { Version = item.Version }));
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/release-deployments/{deploymentId:guid}/production-approval", async (Guid projectId, Guid deploymentId, CreateProductionApproval body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var note = body.Note?.Trim();
    if (!body.Confirmation || string.IsNullOrWhiteSpace(note) || note.Length > 1000)
        return Results.BadRequest(new { error = "Üretim onay talebi için açık onay ve 1–1000 karakterlik gerekçe gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var staging = await db.StudioReleaseDeploymentRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == deploymentId, cancellationToken);
    if (staging is null) return Results.NotFound();
    if (!StudioReleaseDeploymentRules.CanRequestProductionApproval(staging))
        return Results.Conflict(new { error = "Yalnız başarılı staging dağıtımı üretim onayına gönderilebilir." });
    var existing = await db.StudioProductionPromotionApprovalRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StagingDeploymentId == deploymentId, cancellationToken);
    if (existing is not null) return Results.Ok(ToProductionApprovalView(existing, staging));
    var package = await db.StudioReleasePackageRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == staging.ReleasePackageId, cancellationToken);
    var version = package is null ? null : await db.StudioReleaseVersionRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == package.ReleaseVersionId, cancellationToken);
    var candidate = version is null ? null : await db.ReleaseCandidateRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == version.ReleaseCandidateId, cancellationToken);
    var candidateReview = candidate is null ? null : await db.ReleaseCandidateReviewRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidate.Id, cancellationToken);
    if (package is null || version is null || candidate is null || candidateReview?.Decision != "Approved" || candidateReview.ReviewedByUserId == candidate.CreatedByUserId)
        return Results.Conflict(new { error = "Paketin bağımsız aday onayı doğrulanamadı." });
    var approval = new StudioProductionPromotionApprovalRecord
    {
        TenantId = tenantId, ProjectId = projectId, StagingDeploymentId = staging.Id, ReleasePackageId = package.Id,
        RequestedByUserId = userId, Status = StudioReleaseDeploymentRules.AwaitingReview, RequestNote = note
    };
    db.StudioProductionPromotionApprovalRecords.Add(approval);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production-approval.requested", Resource = $"{approval.Id:D}:{staging.Id:D}:{package.PackageSha256}" });
    try { await db.SaveChangesAsync(cancellationToken); }
    catch (DbUpdateException exception) when (IsUniqueViolation(exception))
    {
        var concurrent = await db.StudioProductionPromotionApprovalRecords.AsNoTracking()
            .SingleAsync(x => x.TenantId == tenantId && x.StagingDeploymentId == deploymentId, cancellationToken);
        return Results.Ok(ToProductionApprovalView(concurrent, staging));
    }
    return Results.Ok(ToProductionApprovalView(approval, staging));
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/production-approvals", async (Guid projectId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var approvals = await (from approval in db.StudioProductionPromotionApprovalRecords.AsNoTracking()
        join deployment in db.StudioReleaseDeploymentRecords.AsNoTracking() on new { approval.TenantId, Id = approval.StagingDeploymentId } equals new { deployment.TenantId, deployment.Id }
        join package in db.StudioReleasePackageRecords.AsNoTracking() on new { approval.TenantId, Id = approval.ReleasePackageId } equals new { package.TenantId, package.Id }
        join version in db.StudioReleaseVersionRecords.AsNoTracking() on new { package.TenantId, Id = package.ReleaseVersionId } equals new { version.TenantId, version.Id }
        where approval.TenantId == tenantId && approval.ProjectId == projectId
        orderby approval.CreatedAt descending
        select new { Approval = approval, Deployment = deployment, Version = version.Version }).Take(100).ToListAsync(cancellationToken);
    var approvalIds = approvals.Select(item => item.Approval.Id).ToHashSet();
    var productionDeployments = await db.StudioReleaseDeploymentRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Production && approvalIds.Contains(x.IdempotencyKey))
        .ToDictionaryAsync(x => x.IdempotencyKey, cancellationToken);
    return Results.Ok(approvals.Select(item =>
    {
        productionDeployments.TryGetValue(item.Approval.Id, out var deployed);
        return ToProductionApprovalView(item.Approval, item.Deployment, item.Version) with
        {
            ProductionDeploymentStarted = deployed?.Status == StudioReleaseDeploymentRules.Succeeded,
            ProductionDeploymentId = deployed?.Id,
            ProductionDeploymentStatus = deployed?.Status,
            ProductionEnvironmentUrl = deployed?.EnvironmentUrl
        };
    }));
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapGet("/studio/projects/{projectId:guid}/production-deployments", async (Guid projectId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var active = await db.StudioReleaseDeploymentRecords.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Production && x.Status == StudioReleaseDeploymentRules.Succeeded)
        .OrderByDescending(x => x.CompletedAt).FirstOrDefaultAsync(cancellationToken);
    var deployments = await (from deployment in db.StudioReleaseDeploymentRecords.AsNoTracking()
        join package in db.StudioReleasePackageRecords.AsNoTracking() on new { deployment.TenantId, Id = deployment.ReleasePackageId } equals new { package.TenantId, package.Id }
        join version in db.StudioReleaseVersionRecords.AsNoTracking() on new { package.TenantId, Id = package.ReleaseVersionId } equals new { version.TenantId, version.Id }
        where deployment.TenantId == tenantId && deployment.ProjectId == projectId && deployment.Environment == StudioReleaseDeploymentRules.Production
        orderby deployment.CreatedAt descending
        select new { Deployment = deployment, Version = version.Version }).Take(100).ToListAsync(cancellationToken);
    return Results.Ok(deployments.Select(item => ToReleaseDeploymentView(item.Deployment) with
    {
        Version = item.Version,
        CanRestoreDatabase = (active?.Id == item.Deployment.Id &&
            (item.Deployment.RollbackOfDeploymentId is not null || item.Deployment.RollbackTargetDeploymentId is not null)) ||
            (item.Deployment.Status == StudioReleaseDeploymentRules.Failed &&
                (item.Deployment.RollbackTargetDeploymentId == active?.Id || item.Deployment.RollbackOfDeploymentId == active?.Id))
    }));
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/production-approvals/{approvalId:guid}/review", async (Guid projectId, Guid approvalId, ReviewProductionApproval body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!user.IsInRole("TenantAdmin")) return Results.Forbid();
    var decision = body.Decision?.Trim(); var note = body.Note?.Trim();
    if (decision is not (StudioReleaseDeploymentRules.Approved or StudioReleaseDeploymentRules.Rejected) || string.IsNullOrWhiteSpace(note) || note.Length > 1000)
        return Results.BadRequest(new { error = "Onay veya ret kararı ile 1–1000 karakterlik inceleme notu gerekli." });
    var approval = await db.StudioProductionPromotionApprovalRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == approvalId, cancellationToken);
    if (approval is null) return Results.NotFound();
    if (!StudioReleaseDeploymentRules.CanReviewProductionApproval(approval, userId))
        return Results.Conflict(new { error = "İstek sahibi kendi talebini onaylayamaz; karar yalnız bir kez kaydedilebilir." });
    if (!StudioReleaseDeploymentRules.CanTransitionProductionApproval(approval.Status, decision))
        return Results.Conflict(new { error = "Üretim onay talebi bu karara geçirilemez." });
    var staging = await db.StudioReleaseDeploymentRecords.AsNoTracking()
        .SingleAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == approval.StagingDeploymentId, cancellationToken);
    if (!StudioReleaseDeploymentRules.CanRequestProductionApproval(staging))
        return Results.Conflict(new { error = "Staging dağıtımı artık üretim incelemesine uygun durumda değil." });
    var reviewedAt = DateTimeOffset.UtcNow;
    await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
    var updated = await db.StudioProductionPromotionApprovalRecords
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == approvalId && x.Status == StudioReleaseDeploymentRules.AwaitingReview && x.RequestedByUserId != userId)
        .ExecuteUpdateAsync(setters => setters
            .SetProperty(x => x.Status, decision)
            .SetProperty(x => x.ReviewedByUserId, (Guid?)userId)
            .SetProperty(x => x.ReviewNote, note)
            .SetProperty(x => x.ReviewedAt, (DateTimeOffset?)reviewedAt), cancellationToken);
    if (updated != 1) return Results.Conflict(new { error = "İstek başka bir yönetici tarafından zaten incelendi." });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = decision == StudioReleaseDeploymentRules.Approved ? "studio.release.production-approval.approved" : "studio.release.production-approval.rejected", Resource = $"{approval.Id:D}:{approval.StagingDeploymentId:D}" });
    await db.SaveChangesAsync(cancellationToken);
    await transaction.CommitAsync(cancellationToken);
    var reviewedApproval = await db.StudioProductionPromotionApprovalRecords.AsNoTracking()
        .SingleAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == approvalId, cancellationToken);
    var versionName = await (from package in db.StudioReleasePackageRecords.AsNoTracking()
        join version in db.StudioReleaseVersionRecords.AsNoTracking() on new { package.TenantId, Id = package.ReleaseVersionId } equals new { version.TenantId, version.Id }
        where package.TenantId == tenantId && package.Id == approval.ReleasePackageId select version.Version).SingleAsync(cancellationToken);
    return Results.Ok(ToProductionApprovalView(reviewedApproval, staging, versionName));
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/production-approvals/{approvalId:guid}/deploy", async (Guid projectId, Guid approvalId, CreateProductionDeployment body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!user.IsInRole("TenantAdmin")) return Results.Forbid();
    if (!body.Confirmation || !body.MigrationConfirmation || body.IdempotencyKey != approvalId) return Results.BadRequest(new { error = "Üretim dağıtımı, migration adımı ve onaya bağlı idempotency anahtarı için ayrı açık onaylar gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var approval = await db.StudioProductionPromotionApprovalRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == approvalId, cancellationToken);
    if (approval is null) return Results.NotFound();
    if (approval.Status != StudioReleaseDeploymentRules.Approved || approval.ReviewedByUserId is null || approval.ReviewedByUserId == userId)
        return Results.Conflict(new { error = "Yalnız başka bir TenantAdmin tarafından onaylanmış talep üretime dağıtılabilir." });
    var package = await db.StudioReleasePackageRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == approval.ReleasePackageId, cancellationToken);
    if (package is null) return Results.Conflict(new { error = "Onaylı release paketi bulunamadı." });
    if (!Uri.TryCreate(configuration["ReleaseDeployer:BaseUrl"], UriKind.Absolute, out var deployerUri) || deployerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Yerel production deployer yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    var active = await db.StudioReleaseDeploymentRecords
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Production && x.Status == StudioReleaseDeploymentRules.Succeeded)
        .OrderByDescending(x => x.CompletedAt).FirstOrDefaultAsync(cancellationToken);
    if (active?.Id != body.ExpectedActiveDeploymentId)
        return Results.Conflict(new { error = "Etkin production sürümü değişti; dağıtım geçmişini yenileyip tekrar deneyin." });
    var existing = await db.StudioReleaseDeploymentRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.IdempotencyKey == approval.Id, cancellationToken);
    var isRetry = existing is not null;
    if (isRetry && existing!.Status != StudioReleaseDeploymentRules.Failed)
        return Results.Conflict(new { error = "Bu onay için üretim dağıtımı zaten başladı veya tamamlandı." });
    if (existing is null)
    {
        if (await db.StudioReleaseDeploymentRecords.AnyAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Production &&
            (x.Status == StudioReleaseDeploymentRules.Queued || x.Status == StudioReleaseDeploymentRules.Building || x.Status == StudioReleaseDeploymentRules.Deploying), cancellationToken))
            return Results.Conflict(new { error = "Bu proje için başka bir production dağıtımı sürüyor." });
        existing = new StudioReleaseDeploymentRecord
        {
            Id = Guid.NewGuid(), TenantId = tenantId, ProjectId = projectId, ReleasePackageId = package.Id, CreatedByUserId = userId,
            IdempotencyKey = approval.Id, Environment = StudioReleaseDeploymentRules.Production, Provider = "DockerCompose",
            Status = StudioReleaseDeploymentRules.Queued, PackageSha256 = package.PackageSha256, CommitSha = package.CommitSha,
            RollbackTargetDeploymentId = active?.Id
        };
        db.StudioReleaseDeploymentRecords.Add(existing);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production.requested", Resource = $"{approval.Id:D}:{existing.Id:D}:{package.PackageSha256}" });
        await db.SaveChangesAsync(cancellationToken);
    }
    else existing!.RollbackTargetDeploymentId = active?.Id;
    try
    {
        using var client = clients.CreateClient("release-deployer"); client.BaseAddress = deployerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/deployments/production")
        {
            Content = JsonContent.Create(new DeployerStagingDeployment(existing.Id, tenantId, projectId, package.Id, existing.IdempotencyKey,
                body.ExpectedActiveDeploymentId, package.PackageSha256, package.CommitSha, package.Version))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateReleaseDeployerToken(configuration, existing, "release.production.deploy"));
        existing.Status = StudioReleaseDeploymentRules.Building; existing.StartedAt ??= DateTimeOffset.UtcNow; await db.SaveChangesAsync(cancellationToken);
        using var response = await client.SendAsync(message, CancellationToken.None);
        if (!response.IsSuccessStatusCode)
        {
            existing.Status = StudioReleaseDeploymentRules.Failed; existing.FailureCode = "ProductionDeploymentFailed"; existing.CompletedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production.failed", Resource = $"{existing.Id:D}:{existing.PackageSha256}" });
            await db.SaveChangesAsync(CancellationToken.None);
            return Results.Problem("Production Compose dağıtımı başarısız oldu.", statusCode: StatusCodes.Status502BadGateway);
        }
        var result = await response.Content.ReadFromJsonAsync<DeployerStagingDeploymentResult>(cancellationToken: CancellationToken.None);
        if (result is null || result.DeploymentId != existing.Id || result.PackageId != package.Id || !string.Equals(result.PackageSha256, package.PackageSha256, StringComparison.OrdinalIgnoreCase) || result.CommitSha != package.CommitSha || !Uri.TryCreate(result.Url, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttp || url.Host is not ("localhost" or "127.0.0.1"))
        {
            existing.Status = StudioReleaseDeploymentRules.Failed; existing.FailureCode = "InvalidDeployerResponse"; existing.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
            return Results.Problem("Production deployer doğrulanamayan metadata döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        }
        existing.Status = StudioReleaseDeploymentRules.Succeeded; existing.ProviderDeploymentId = result.ProviderDeploymentId; existing.EnvironmentUrl = result.Url; existing.CompletedAt = DateTimeOffset.UtcNow;
        var prior = await db.StudioReleaseDeploymentRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == existing.RollbackTargetDeploymentId, CancellationToken.None);
        if (prior is not null) prior.Status = StudioReleaseDeploymentRules.Superseded;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production.succeeded", Resource = $"{existing.Id:D}:{existing.PackageSha256}" });
        await db.SaveChangesAsync(CancellationToken.None);
        var view = ToReleaseDeploymentView(existing) with { Version = package.Version };
        return Results.Ok(new StudioProductionDeploymentOperationResult(view, isRetry ? "" : result.BootstrapEmail, isRetry ? "" : result.BootstrapPassword));
    }
    catch (HttpRequestException) { existing.Status = StudioReleaseDeploymentRules.Failed; existing.FailureCode = "DeployerUnavailable"; existing.CompletedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(CancellationToken.None); return Results.Problem("Production deployer bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { existing.Status = StudioReleaseDeploymentRules.Failed; existing.FailureCode = "DeploymentTimeout"; existing.CompletedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(CancellationToken.None); return Results.Problem("Production dağıtımı zaman aşımına uğradı; aynı talep güvenle yeniden denenebilir.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/production-deployments/restore", async (Guid projectId, RestoreProductionDatabase body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!user.IsInRole("TenantAdmin")) return Results.Forbid();
    if (!body.Confirmation || body.IdempotencyKey == Guid.Empty || body.ExpectedActiveDeploymentId == Guid.Empty || body.BackupDeploymentId == Guid.Empty)
        return Results.BadRequest(new { error = "Açık üretim veritabanı geri yükleme onayı ve işlem kimliği gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var active = await db.StudioReleaseDeploymentRecords
        .Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Production && x.Status == StudioReleaseDeploymentRules.Succeeded)
        .OrderByDescending(x => x.CompletedAt).FirstOrDefaultAsync(cancellationToken);
    if (active is null || active.Id != body.ExpectedActiveDeploymentId)
        return Results.Conflict(new { error = "Etkin production sürümü değişti; geçmişi yenileyip tekrar deneyin." });
    var backupDeployment = await db.StudioReleaseDeploymentRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == body.BackupDeploymentId && x.Environment == StudioReleaseDeploymentRules.Production, cancellationToken);
    if (backupDeployment is null) return Results.NotFound();
    if (!string.Equals(body.ConfirmationText?.Trim(), $"RESTORE {backupDeployment.Id:N}", StringComparison.Ordinal))
        return Results.BadRequest(new { error = $"Devam etmek için RESTORE {backupDeployment.Id:N} metnini aynen yazın." });
    Guid? targetId = backupDeployment.Id == active.Id
        ? active.RollbackOfDeploymentId ?? active.RollbackTargetDeploymentId
        : backupDeployment.Status == StudioReleaseDeploymentRules.Failed &&
            (backupDeployment.RollbackTargetDeploymentId == active.Id || backupDeployment.RollbackOfDeploymentId == active.Id)
            ? active.Id
            : null;
    if (targetId is null) return Results.Conflict(new { error = "Seçili yedek, etkin production uygulamasıyla eşleşmiyor." });
    var target = await db.StudioReleaseDeploymentRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == targetId && x.Environment == StudioReleaseDeploymentRules.Production &&
            (x.Status == StudioReleaseDeploymentRules.Succeeded || x.Status == StudioReleaseDeploymentRules.Superseded), cancellationToken);
    if (target is null || target.Id == active.Id)
        return Results.Conflict(new { error = "Önceki production uygulama paketi doğrulanamadı." });
    if (!Uri.TryCreate(configuration["ReleaseDeployer:BaseUrl"], UriKind.Absolute, out var deployerUri) || deployerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Yerel production deployer yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (await db.StudioReleaseDeploymentRecords.AnyAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Environment == StudioReleaseDeploymentRules.Production &&
        (x.Status == StudioReleaseDeploymentRules.Queued || x.Status == StudioReleaseDeploymentRules.Building || x.Status == StudioReleaseDeploymentRules.Deploying), cancellationToken))
        return Results.Conflict(new { error = "Bu proje için başka bir production işlemi sürüyor." });
    if (await db.StudioReleaseDeploymentRecords.AnyAsync(x => x.TenantId == tenantId && x.IdempotencyKey == body.IdempotencyKey, cancellationToken))
        return Results.Conflict(new { error = "Bu işlem anahtarı daha önce kullanılmış." });
    var package = await db.StudioReleasePackageRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == target.ReleasePackageId, cancellationToken);
    var version = package is null ? null : await db.StudioReleaseVersionRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == package.ReleaseVersionId, cancellationToken);
    if (package is null || version is null || package.PackageSha256 != target.PackageSha256 || package.CommitSha != target.CommitSha)
        return Results.Conflict(new { error = "Önceki production paketinin SHA-256 metadata'sı eşleşmiyor." });
    var restore = new StudioReleaseDeploymentRecord
    {
        TenantId = tenantId, ProjectId = projectId, ReleasePackageId = package.Id, CreatedByUserId = userId,
        RollbackOfDeploymentId = active.Id, RollbackTargetDeploymentId = target.Id, IdempotencyKey = body.IdempotencyKey,
        Environment = StudioReleaseDeploymentRules.Production, Provider = "DockerCompose", Status = StudioReleaseDeploymentRules.Building,
        PackageSha256 = package.PackageSha256, CommitSha = package.CommitSha, StartedAt = DateTimeOffset.UtcNow
    };
    db.StudioReleaseDeploymentRecords.Add(restore);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production.database-restore.requested", Resource = $"{active.Id:D}:{target.Id:D}:{restore.Id:D}" });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        using var client = clients.CreateClient("release-deployer"); client.BaseAddress = deployerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, "/internal/deployments/production/restore")
        {
            Content = JsonContent.Create(new DeployerRestoreProductionDeployment(restore.Id, tenantId, projectId, package.Id, restore.IdempotencyKey,
                active.Id, backupDeployment.Id, target.Id, package.PackageSha256, package.CommitSha, version.Version))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateReleaseDeployerToken(configuration, restore, "release.production.restore"));
        using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, CancellationToken.None);
        if (!response.IsSuccessStatusCode)
        {
            restore.Status = StudioReleaseDeploymentRules.Failed; restore.FailureCode = "ProductionRestoreFailed"; restore.CompletedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production.database-restore.failed", Resource = $"{restore.Id:D}:{response.StatusCode}" });
            await db.SaveChangesAsync(CancellationToken.None);
            return Results.Problem("Production geri yüklemesi başarısız oldu. Deployer mevcut veriyi ve uygulamayı kurtarmayı denedi.", statusCode: StatusCodes.Status502BadGateway);
        }
        var result = await response.Content.ReadFromJsonAsync<DeployerStagingDeploymentResult>(cancellationToken: CancellationToken.None);
        if (result is null || result.DeploymentId != restore.Id || result.PackageId != package.Id || !string.Equals(result.PackageSha256, package.PackageSha256, StringComparison.OrdinalIgnoreCase) ||
            result.CommitSha != package.CommitSha || !Uri.TryCreate(result.Url, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttp || url.Host is not ("localhost" or "127.0.0.1"))
        {
            restore.Status = StudioReleaseDeploymentRules.Failed; restore.FailureCode = "InvalidDeployerResponse"; restore.CompletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(CancellationToken.None);
            return Results.Problem("Production geri yükleme sonucu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        }
        restore.Status = StudioReleaseDeploymentRules.Succeeded; restore.ProviderDeploymentId = result.ProviderDeploymentId;
        restore.EnvironmentUrl = result.Url; restore.CompletedAt = result.CreatedAt; active.Status = StudioReleaseDeploymentRules.Superseded;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.production.database-restore.succeeded", Resource = $"{active.Id:D}:{target.Id:D}:{restore.Id:D}" });
        await db.SaveChangesAsync(CancellationToken.None);
        return Results.Ok(new StudioProductionDeploymentOperationResult(ToReleaseDeploymentView(restore) with { Version = version.Version }, "", ""));
    }
    catch (HttpRequestException) { restore.Status = StudioReleaseDeploymentRules.Failed; restore.FailureCode = "DeployerUnavailable"; restore.CompletedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(CancellationToken.None); return Results.Problem("Production deployer bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { restore.Status = StudioReleaseDeploymentRules.Failed; restore.FailureCode = "RestoreTimeout"; restore.CompletedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(CancellationToken.None); return Results.Problem("Production geri yüklemesi zaman aşımına uğradı; canlı veriyi doğrulayın.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { restore.Status = StudioReleaseDeploymentRules.Failed; restore.FailureCode = "InvalidDeployerResponse"; restore.CompletedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(CancellationToken.None); return Results.Problem("Production geri yükleme sonucu okunamadı.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapDelete("/studio/projects/{projectId:guid}/release-deployments/{deploymentId:guid}/staging", async (Guid projectId, Guid deploymentId, [FromBody] ConfirmReleasePackage body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Staging verisini ve servislerini silmek için açık onay gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var deployment = await db.StudioReleaseDeploymentRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == deploymentId, cancellationToken);
    if (deployment is null) return Results.NotFound();
    if (deployment.Environment != StudioReleaseDeploymentRules.Staging || deployment.Provider != "DockerCompose" || deployment.Status is not (StudioReleaseDeploymentRules.Succeeded or StudioReleaseDeploymentRules.Failed))
        return Results.Conflict(new { error = "Yalnız tamamlanmış yerel staging ortamı temizlenebilir." });
    if (!Uri.TryCreate(configuration["ReleaseDeployer:BaseUrl"], UriKind.Absolute, out var deployerUri) || deployerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Yerel staging deployer yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("release-deployer"); client.BaseAddress = deployerUri;
        using var message = new HttpRequestMessage(HttpMethod.Delete, $"/internal/deployments/staging/{deployment.Id:D}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateReleaseDeployerToken(configuration, deployment, "release.staging.destroy"));
        using var response = await client.SendAsync(message, CancellationToken.None);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Deployer staging kaynaklarını bulamadı; kayıt değiştirilmedi." });
        if (!response.IsSuccessStatusCode) return Results.Problem("Staging servisleri veya verisi silinemedi.", statusCode: StatusCodes.Status502BadGateway);
        deployment.Status = StudioReleaseDeploymentRules.Destroyed;
        deployment.CompletedAt = DateTimeOffset.UtcNow;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.staging.destroyed", Resource = $"{deployment.Id:D}:{deployment.PackageSha256}" });
        await db.SaveChangesAsync(CancellationToken.None);
        return Results.Ok(ToReleaseDeploymentView(deployment));
    }
    catch (HttpRequestException) { return Results.Problem("Staging deployer bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Staging temizleme zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-packages/{packageId:guid}/download", async (Guid projectId, Guid requestId, Guid packageId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var candidateIds = await db.ReleaseCandidateRecords.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId).Select(x => x.Id).ToListAsync(cancellationToken);
    var versionIds = await db.StudioReleaseVersionRecords.AsNoTracking().Where(x => x.TenantId == tenantId && candidateIds.Contains(x.ReleaseCandidateId)).Select(x => x.Id).ToListAsync(cancellationToken);
    var record = await db.StudioReleasePackageRecords.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == packageId && versionIds.Contains(x.ReleaseVersionId), cancellationToken);
    if (record is null) return Results.NotFound();
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp) return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        var versionRecord = await db.StudioReleaseVersionRecords.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == record.ReleaseVersionId, cancellationToken);
        var candidate = versionRecord is null ? null : await db.ReleaseCandidateRecords.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == versionRecord.ReleaseCandidateId, cancellationToken);
        if (candidate is null) return Results.NotFound();
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{requestId:D}/release-packages/{packageId:D}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, requestId, "workspace.release-package.read"));
        using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode) return Results.Problem("Sürüm paketi Runner’dan alınamadı.", statusCode: StatusCodes.Status502BadGateway);
        if (response.Content.Headers.ContentLength is > 100 * 1024 * 1024) return Results.Problem("Sürüm paketi sınırlandırılan boyutu aşıyor.", statusCode: StatusCodes.Status502BadGateway);
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[64 * 1024]; int read;
        while ((read = await input.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (output.Length + read > 100 * 1024 * 1024) return Results.Problem("Sürüm paketi sınırlandırılan boyutu aşıyor.", statusCode: StatusCodes.Status502BadGateway);
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        var bytes = output.ToArray();
        if (bytes.LongLength != record.SizeBytes || !string.Equals(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)), record.PackageSha256, StringComparison.OrdinalIgnoreCase))
            return Results.Problem("Paket SHA-256 veya boyut doğrulaması başarısız.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.package.downloaded", Resource = $"{requestId:D}:{packageId:D}:{record.PackageSha256}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.File(bytes, "application/zip", record.FileName);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-candidates/{candidateId:guid}/version", async (Guid projectId, Guid requestId, Guid candidateId, AssignReleaseVersion body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirmation || !StudioReleaseVersionRules.IsValid(body.Version?.Trim()))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["version"] = ["Açık onay ve SemVer 2.0 biçiminde sürüm (ör. 1.2.3 veya 1.2.3-rc.1) gerekli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var candidate = await db.ReleaseCandidateRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == candidateId, cancellationToken);
    if (candidate is null) return Results.NotFound();
    if (await db.StudioReleaseVersionRecords.AnyAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidateId, cancellationToken))
        return Results.Conflict(new { error = "Bu sürüm adayına zaten sürüm numarası atanmış; kayıtlar değiştirilemez." });
    var review = await db.ReleaseCandidateReviewRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidateId, cancellationToken);
    if (review?.Decision != "Approved" || review.ReviewedByUserId == candidate.CreatedByUserId)
        return Results.Conflict(new { error = "Sürüm ataması için adayı oluşturandan bağımsız yetkili onayı gerekli." });
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null || !string.Equals(request.WorkspaceBranchName, candidate.BranchName, StringComparison.Ordinal))
        return Results.Conflict(new { error = "Sürüm adayının izole dalı artık hazır değil." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var gitMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-status");
        gitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-status.read"));
        using var gitResponse = await client.SendAsync(gitMessage, cancellationToken);
        if (!gitResponse.IsSuccessStatusCode) return Results.Problem("Sürüm adayı Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await gitResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || git.TotalChangedFiles != 0 || git.Files.Count != 0 || git.BranchName != candidate.BranchName || !string.Equals(git.HeadCommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Aynı commit üzerindeki temiz sürüm adayı gerekli." });
        using var testMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-runs/{candidate.TestJobId:D}");
        testMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.status"));
        using var testResponse = await client.SendAsync(testMessage, cancellationToken);
        if (testResponse.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Sürüm adayının sandbox test kanıtı bulunamadı." });
        if (!testResponse.IsSuccessStatusCode) return Results.Problem("Sandbox test kanıtı doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var test = await testResponse.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (test is null || test.Status != "Passed" || test.Success != true || test.CompletedAt is null || test.HasUncommittedChanges ||
            !string.Equals(test.CommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase) || !string.Equals(test.SnapshotSha256, candidate.TestSnapshotSha256, StringComparison.OrdinalIgnoreCase) || test.TargetPath != candidate.TestTargetPath)
            return Results.Conflict(new { error = "Aynı commit ve test snapshot için başarılı sandbox kanıtı gerekli." });
        var version = body.Version!.Trim();
        var record = new StudioReleaseVersionRecord { TenantId = tenantId, ProjectId = projectId, ReleaseCandidateId = candidateId,
            CreatedByUserId = userId, Version = version, CommitSha = candidate.CommitSha };
        db.StudioReleaseVersionRecords.Add(record);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.version.assigned", Resource = $"{requestId:D}:{candidateId:D}:{version}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new StudioReleaseVersionView(record.Id, candidateId, record.Version, record.CommitSha, record.CreatedAt, userId));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sürüm numarası atama zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (DbUpdateException) { return Results.Conflict(new { error = "Bu SemVer numarası proje içinde kullanılıyor veya adaya zaten sürüm atanmış." }); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-candidates", async (Guid projectId, Guid requestId, CreateReleaseCandidate body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (body.TestJobId == Guid.Empty) return Results.BadRequest(new { error = "Başarılı sandbox test işi gereklidir." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Önce izole çalışma dalı oluşturulmalı." });
    if (await db.ReleaseCandidateRecords.AnyAsync(x => x.TenantId == tenantId && x.WorkspaceRequestId == requestId && x.TestJobId == body.TestJobId, cancellationToken))
        return Results.Conflict(new { error = "Bu test işi için sürüm adayı zaten kaydedilmiş." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var gitMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-status");
        gitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-status.read"));
        using var gitResponse = await client.SendAsync(gitMessage, cancellationToken);
        if (!gitResponse.IsSuccessStatusCode) return Results.Problem("Güncel Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await gitResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || git.TotalChangedFiles != 0 || git.Files.Count != 0 ||
            !string.Equals(git.BranchName, request.WorkspaceBranchName, StringComparison.Ordinal) || !IsCommitSha(git.HeadCommitSha))
            return Results.Conflict(new { error = "Sürüm adayı için Git çalışma ağacı temiz ve dal durumu eksiksiz olmalı." });
        using var testMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-runs/{body.TestJobId:D}");
        testMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.status"));
        using var testResponse = await client.SendAsync(testMessage, cancellationToken);
        if (testResponse.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Sandbox test kanıtı bulunamadı veya süresi doldu." });
        if (!testResponse.IsSuccessStatusCode) return Results.Problem("Sandbox test kanıtı doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var test = await testResponse.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (test is null || test.JobId != body.TestJobId || test.Status != "Passed" || test.Success != true || test.CompletedAt is null ||
            test.HasUncommittedChanges || !string.Equals(test.CommitSha, git.HeadCommitSha, StringComparison.OrdinalIgnoreCase) ||
            !IsSha256(test.SnapshotSha256) || string.IsNullOrWhiteSpace(test.TargetPath) || test.TargetPath.Length > 512)
            return Results.Conflict(new { error = "Test kanıtı güncel temiz HEAD için başarılı değil." });
        var candidate = new ReleaseCandidateRecord
        {
            TenantId = tenantId,
            ProjectId = projectId,
            WorkspaceRequestId = requestId,
            CreatedByUserId = userId,
            TestJobId = test.JobId,
            BranchName = git.BranchName,
            CommitSha = git.HeadCommitSha,
            TestTargetPath = test.TargetPath,
            TestSnapshotSha256 = test.SnapshotSha256,
            TestCompletedAt = new DateTimeOffset(DateTime.SpecifyKind(test.CompletedAt.Value, DateTimeKind.Utc))
        };
        db.ReleaseCandidateRecords.Add(candidate);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release-candidate.created", Resource = $"{requestId:D}:{candidate.Id:D}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new ReleaseCandidateView(candidate.Id, candidate.WorkspaceRequestId, candidate.BranchName, candidate.CommitSha, candidate.TestJobId, candidate.TestTargetPath, candidate.TestSnapshotSha256, candidate.TestCompletedAt, candidate.CreatedAt, candidate.CreatedByUserId, null, null, null, null, false));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sürüm hazırlığı doğrulaması zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz doğrulama yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (DbUpdateException) { return Results.Conflict(new { error = "Bu test işi için sürüm adayı daha önce kaydedilmiş." }); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-candidates/{candidateId:guid}/pull-request-draft", async (Guid projectId, Guid requestId, Guid candidateId, CreateReleaseCandidateDraft body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.AISharingConfirmed) return Results.BadRequest(new { error = "Özet ve sürüm metadata'sını OpenAI'ye göndermek için açık onay gerekli." });
    var summary = body.ChangeSummary?.Trim();
    if (string.IsNullOrWhiteSpace(summary) || summary.Length > 1500 || summary.Any(char.IsControl))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["changeSummary"] = ["Değişiklik özeti 1–1500 karakter olmalı ve kontrol karakteri içermemeli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var candidate = await db.ReleaseCandidateRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == candidateId, cancellationToken);
    if (candidate is null) return Results.NotFound();
    var review = await db.ReleaseCandidateReviewRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidateId, cancellationToken);
    if (review?.Decision != "Approved" || review.ReviewedByUserId == candidate.CreatedByUserId)
        return Results.Conflict(new { error = "PR taslağı için adayı oluşturan kişiden bağımsız yetkilinin onayı gerekli." });
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null || !string.Equals(request.WorkspaceBranchName, candidate.BranchName, StringComparison.Ordinal))
        return Results.Conflict(new { error = "Sürüm adayının izole çalışma dalı artık hazır değil." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var gitMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-status");
        gitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-status.read"));
        using var gitResponse = await client.SendAsync(gitMessage, cancellationToken);
        if (!gitResponse.IsSuccessStatusCode) return Results.Problem("Adayın güncel Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await gitResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || git.TotalChangedFiles != 0 || git.Files.Count != 0 ||
            !string.Equals(git.BranchName, candidate.BranchName, StringComparison.Ordinal) || !string.Equals(git.HeadCommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Taslak için adayın aynı commit'te ve temiz çalışma ağacında olması gerekli." });
        using var testMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-runs/{candidate.TestJobId:D}");
        testMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.status"));
        using var testResponse = await client.SendAsync(testMessage, cancellationToken);
        if (testResponse.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Adayın sandbox test kanıtı bulunamadı veya süresi doldu." });
        if (!testResponse.IsSuccessStatusCode) return Results.Problem("Adayın sandbox test kanıtı doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var test = await testResponse.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (test is null || test.JobId != candidate.TestJobId || test.Status != "Passed" || test.Success != true || test.CompletedAt is null || test.HasUncommittedChanges ||
            !string.Equals(test.CommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase) || !string.Equals(test.SnapshotSha256, candidate.TestSnapshotSha256, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(test.TargetPath, candidate.TestTargetPath, StringComparison.Ordinal))
            return Results.Conflict(new { error = "Adayın başarılı test kanıtı aynı commit, hedef ve snapshot için doğrulanamıyor." });
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.pr-draft.requested", Resource = $"{requestId:D}:{candidateId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        var draft = await aiProvider.CreateStudioPullRequestDraftAsync(new StudioPullRequestContext(
            project.Name, candidate.BranchName, request.BranchName, candidate.CommitSha, candidate.TestTargetPath, summary), cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.pr-draft.completed", Resource = $"{requestId:D}:{candidateId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { draft.Title, draft.Body, draft.Risks, draft.Limitations, sourceBranch = candidate.BranchName,
            baseBranch = request.BranchName, candidate.CommitSha, testTargetPath = candidate.TestTargetPath,
            testCompletedAt = candidate.TestCompletedAt, remotePullRequestCreated = false });
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI sağlayıcısından geçerli PR taslağı alınamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner veya AI sağlayıcısına bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner veya AI sağlayıcısı geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("PR taslağı hazırlama zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("ai-tester");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-candidates/{candidateId:guid}/publish-pull-request", async (Guid projectId, Guid requestId, Guid candidateId, PublishStudioPullRequest body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, GitHubAppInstallationTokenProvider tokenProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Açık push/PR onayı gerekli." });
    var title = body.Title?.Trim();
    var description = body.Body?.Trim();
    if (string.IsNullOrWhiteSpace(title) || title.Length > 120 || title.Any(char.IsControl) || string.IsNullOrWhiteSpace(description) || description.Length > 5000 || description.Any(c => char.IsControl(c) && c is not ('\r' or '\n' or '\t')))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["title"] = ["PR başlığı en fazla 120, açıklaması en fazla 5000 karakter olmalı."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var githubInstallationId = project.GitHubInstallationId ?? body.GitHubInstallationId;
    if (githubInstallationId <= 0) return Results.Problem("Önce Studio’da bu proje için GitHub yetkilendirmesi yapın.", statusCode: StatusCodes.Status403Forbidden);
    var candidate = await db.ReleaseCandidateRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == candidateId, cancellationToken);
    if (candidate is null) return Results.NotFound();
    var review = await db.ReleaseCandidateReviewRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidateId, cancellationToken);
    if (review?.Decision != "Approved" || review.ReviewedByUserId == candidate.CreatedByUserId)
        return Results.Conflict(new { error = "Uzak PR için sürüm adayını oluşturan kişiden bağımsız yetkili onayı gerekli." });
    var workspaceRequest = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (workspaceRequest is null || !string.Equals(workspaceRequest.WorkspaceBranchName, candidate.BranchName, StringComparison.Ordinal))
        return Results.Conflict(new { error = "Sürüm adayının izole dalı artık hazır değil." });
    if (!TryRepositoryUrl(project.RepositoryUrl, out var repositoryUri) || !string.Equals(repositoryUri!.Host, "github.com", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { error = "Uzak PR yalnız HTTPS GitHub depoları için desteklenir." });
    var segments = repositoryUri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
    if (segments.Length != 2) return Results.BadRequest(new { error = "GitHub repository URL owner/repository biçiminde olmalı." });
    var owner = segments[0];
    var repositoryName = segments[1].EndsWith(".git", StringComparison.OrdinalIgnoreCase) ? segments[1][..^4] : segments[1];
    if (string.IsNullOrWhiteSpace(owner) || string.IsNullOrWhiteSpace(repositoryName) || owner.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_')) || repositoryName.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('.' or '-' or '_')))
        return Results.BadRequest(new { error = "GitHub repository URL geçersiz." });
    var repository = $"{owner}/{repositoryName}";
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var runner = clients.CreateClient("workspace-runner"); runner.BaseAddress = runnerUri;
        using var gitMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{workspaceRequest.Id:D}/git-status");
        gitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, workspaceRequest.Id, "workspace.git-status.read"));
        using var gitResponse = await runner.SendAsync(gitMessage, cancellationToken);
        if (!gitResponse.IsSuccessStatusCode) return Results.Problem("Adayın Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await gitResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || git.TotalChangedFiles != 0 || git.Files.Count != 0 || git.BranchName != candidate.BranchName || !string.Equals(git.HeadCommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Yalnızca aynı commit üzerindeki temiz sürüm adayı gönderilebilir." });
        using var testMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{workspaceRequest.Id:D}/test-runs/{candidate.TestJobId:D}");
        testMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, workspaceRequest.Id, "workspace.tests.status"));
        using var testResponse = await runner.SendAsync(testMessage, cancellationToken);
        if (testResponse.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Sürüm adayının sandbox test kanıtı bulunamadı." });
        if (!testResponse.IsSuccessStatusCode) return Results.Problem("Sandbox test kanıtı doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var test = await testResponse.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (test is null || test.Status != "Passed" || test.Success != true || test.CompletedAt is null || test.HasUncommittedChanges ||
            !string.Equals(test.CommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase) || !string.Equals(test.SnapshotSha256, candidate.TestSnapshotSha256, StringComparison.OrdinalIgnoreCase) || test.TargetPath != candidate.TestTargetPath)
            return Results.Conflict(new { error = "Aynı commit için başarılı sandbox test kanıtı doğrulanamadı." });
        var installationToken = await tokenProvider.CreateRepositoryTokenAsync(githubInstallationId, repository, cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.release.pull-request.requested", Resource = $"{requestId:D}:{candidateId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        using var push = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{workspaceRequest.Id:D}/push-approved-branch");
        push.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, workspaceRequest.Id, "workspace.branch.push"));
        push.Content = JsonContent.Create(new { expectedHeadCommitSha = candidate.CommitSha, installationToken, approvalConfirmed = true });
        using var pushResponse = await runner.SendAsync(push, cancellationToken);
        if (!pushResponse.IsSuccessStatusCode) return Results.Problem("Uzak dal gönderilemedi; PR oluşturulmadı.", statusCode: pushResponse.StatusCode == HttpStatusCode.Conflict ? StatusCodes.Status409Conflict : StatusCodes.Status502BadGateway);
        var pushed = await pushResponse.Content.ReadFromJsonAsync<RunnerPushBranchResponse>(cancellationToken: cancellationToken);
        if (pushed is null || pushed.CommitSha != candidate.CommitSha || pushed.BranchName != candidate.BranchName)
            return Results.Problem("Runner uzak dal sonucunu doğrulayamadı.", statusCode: StatusCodes.Status502BadGateway);

        using var github = clients.CreateClient("github-api");
        github.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", installationToken);
        var baseBranch = Uri.EscapeDataString(workspaceRequest.BranchName);
        var head = Uri.EscapeDataString($"{owner}:{candidate.BranchName}");
        using var existingResponse = await github.GetAsync($"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repositoryName)}/pulls?state=open&head={head}&base={baseBranch}", cancellationToken);
        if (!existingResponse.IsSuccessStatusCode) return Results.Problem("Dal gönderildi ancak açık PR durumu okunamadı.", statusCode: StatusCodes.Status502BadGateway);
        var existing = await existingResponse.Content.ReadFromJsonAsync<List<GitHubPullRequestResponse>>(cancellationToken: cancellationToken) ?? [];
        var pull = existing.FirstOrDefault();
        var created = false;
        if (pull is null)
        {
            using var createResponse = await github.PostAsJsonAsync($"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repositoryName)}/pulls",
                new { title, body = description, head = candidate.BranchName, @base = workspaceRequest.BranchName, draft = true }, cancellationToken);
            if (!createResponse.IsSuccessStatusCode) return Results.Problem("Dal gönderildi ancak GitHub PR oluşturmayı reddetti.", statusCode: StatusCodes.Status502BadGateway);
            pull = await createResponse.Content.ReadFromJsonAsync<GitHubPullRequestResponse>(cancellationToken: cancellationToken);
            created = true;
        }
        if (pull is null || pull.Number <= 0 || string.IsNullOrWhiteSpace(pull.HtmlUrl)) return Results.Problem("GitHub geçersiz PR yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = created ? "studio.release.pull-request.created" : "studio.release.pull-request.reused", Resource = $"{requestId:D}:{candidateId:D}:{pull.Number}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { pullNumber = pull.Number, htmlUrl = pull.HtmlUrl, state = pull.State, draft = pull.Draft, created,
            branchName = candidate.BranchName, baseBranch = workspaceRequest.BranchName, commitSha = candidate.CommitSha, pushed.Pushed });
    }
    catch (GitHubAppConfigurationException) { return Results.Problem("GitHub App yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (GitHubIntegrationException) { return Results.Problem("GitHub App bu repository için yetki veremedi.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner veya GitHub'a bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Runner veya GitHub geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Uzak PR işlemi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/release-candidates/{candidateId:guid}/review", async (Guid projectId, Guid requestId, Guid candidateId, ReviewReleaseCandidate body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!user.IsInRole("TenantAdmin")) return Results.Forbid();
    var decision = body.Decision?.Trim();
    var note = body.Note?.Trim();
    if (decision is not ("Approved" or "Rejected")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["decision"] = ["Karar Approved veya Rejected olmalı."] });
    if (string.IsNullOrWhiteSpace(note) || note.Length > 1000 || note.Any(char.IsControl)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["note"] = ["İnceleme notu 1–1000 karakter olmalı ve kontrol karakteri içermemeli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    var candidate = await db.ReleaseCandidateRecords.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == candidateId, cancellationToken);
    if (candidate is null) return Results.NotFound();
    if (candidate.CreatedByUserId == userId) return Results.Conflict(new { error = "Sürüm adayını oluşturan kişi bu aday için karar veremez." });
    if (await db.ReleaseCandidateReviewRecords.AnyAsync(x => x.TenantId == tenantId && x.ReleaseCandidateId == candidateId, cancellationToken))
        return Results.Conflict(new { error = "Bu aday için karar zaten kaydedilmiş. Yeni inceleme için yeni sürüm adayı oluşturun." });
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null || !string.Equals(request.WorkspaceBranchName, candidate.BranchName, StringComparison.Ordinal))
        return Results.Conflict(new { error = "Adayın bağlı çalışma dalı artık hazır değil." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var gitMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-status");
        gitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-status.read"));
        using var gitResponse = await client.SendAsync(gitMessage, cancellationToken);
        if (!gitResponse.IsSuccessStatusCode) return Results.Problem("Adayın güncel Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await gitResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || git.TotalChangedFiles != 0 || git.Files.Count != 0 ||
            !string.Equals(git.BranchName, candidate.BranchName, StringComparison.Ordinal) || !string.Equals(git.HeadCommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Adayın HEAD değeri veya temiz çalışma ağacı değişmiş; inceleme yapılamaz." });
        using var testMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-runs/{candidate.TestJobId:D}");
        testMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.status"));
        using var testResponse = await client.SendAsync(testMessage, cancellationToken);
        if (testResponse.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Adayın sandbox test kanıtı bulunamadı veya süresi doldu." });
        if (!testResponse.IsSuccessStatusCode) return Results.Problem("Adayın sandbox test kanıtı doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var test = await testResponse.Content.ReadFromJsonAsync<RunnerTestRunStatus>(cancellationToken: cancellationToken);
        if (test is null || test.Status != "Passed" || test.Success != true || test.CompletedAt is null || test.HasUncommittedChanges ||
            !string.Equals(test.CommitSha, candidate.CommitSha, StringComparison.OrdinalIgnoreCase) || !string.Equals(test.SnapshotSha256, candidate.TestSnapshotSha256, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Adayın test kanıtı artık aynı temiz commit ile doğrulanamıyor." });
        var review = new ReleaseCandidateReviewRecord
        {
            TenantId = tenantId,
            ProjectId = projectId,
            WorkspaceRequestId = requestId,
            ReleaseCandidateId = candidateId,
            ReviewedByUserId = userId,
            Decision = decision,
            Note = note,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.ReleaseCandidateReviewRecords.Add(review);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = decision == "Approved" ? "studio.release-candidate.approved" : "studio.release-candidate.rejected", Resource = $"{requestId:D}:{candidateId:D}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new ReleaseCandidateReviewView(review.Id, review.ReleaseCandidateId, review.Decision, review.Note, review.CreatedAt, review.ReviewedByUserId));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Sürüm adayı incelemesi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz inceleme yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (DbUpdateException) { return Results.Conflict(new { error = "Bu sürüm adayına ait inceleme kararı zaten kaydedilmiş." }); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/search", async (Guid projectId, Guid requestId, string? query, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(query) || query.Trim().Length > 120 || query.Any(char.IsControl))
        return Results.BadRequest(new { error = "Arama metni 1–120 karakter olmalı." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/search?query={Uri.EscapeDataString(query.Trim())}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.search"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
        if (response.StatusCode == HttpStatusCode.BadRequest) return Results.BadRequest(new { error = "Arama metni geçersiz." });
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner kod araması sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var result = await response.Content.ReadFromJsonAsync<RunnerWorkspaceSearchResult>(cancellationToken: cancellationToken);
        if (result is null) return Results.Problem("Runner geçersiz arama sonucu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.source-search", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(result);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Kod araması zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Runner geçersiz arama yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/source-analysis", async (Guid projectId, Guid requestId, AnalyzeSelectedSource body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.AISharingConfirmed) return Results.BadRequest(new { error = "Seçilen kaynak kodu AI’ye göndermek için açık onay gerekli." });
    if (string.IsNullOrWhiteSpace(body.Question) || body.Question.Trim().Length > 1000 || body.Sources is null || body.Sources.Count is 0 or > 5 ||
        body.Sources.Any(source => !IsStudioSourcePath(source.Path) || source.Line < 1 || string.IsNullOrWhiteSpace(source.Excerpt) || source.Excerpt.Length > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["sources"] = ["En fazla 5 seçili kaynak parçası ve toplam 6.000 karakter gönderilebilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "İzole çalışma dalı hazır değil." });
    if (string.IsNullOrWhiteSpace(configuration["AI:OpenAI:ApiKey"])) return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        var sources = new List<StudioCodeContext>(body.Sources.Count);
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        foreach (var source in body.Sources)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/file-content?path={Uri.EscapeDataString(source.Path)}");
            message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.read-file"));
            using var response = await client.SendAsync(message, cancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Seçilen dosya artık bulunamıyor. Aramayı yenileyin." });
            if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner seçilen kaynak satırını okuyamadı.", statusCode: StatusCodes.Status502BadGateway);
            var file = await response.Content.ReadFromJsonAsync<RunnerFileContent>(cancellationToken: cancellationToken);
            if (file is null) return Results.Problem("Runner geçersiz dosya içeriği döndürdü.", statusCode: StatusCodes.Status502BadGateway);
            var lines = file.Content.Split('\n');
            if (source.Line > lines.Length) return Results.Conflict(new { error = "Seçilen satır değişmiş. Aramayı yenileyin." });
            var currentLine = lines[source.Line - 1].TrimEnd('\r');
            if (!currentLine.Contains(source.Excerpt, StringComparison.Ordinal)) return Results.Conflict(new { error = "Seçilen satır değişmiş. Aramayı yenileyin." });
            sources.Add(new StudioCodeContext(source.Path, source.Line, source.Excerpt));
        }
        if (sources.Sum(source => source.Excerpt.Length) > 6000)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["sources"] = ["Seçili kod parçalarının toplamı 6.000 karakteri aşıyor."] });
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.source-analysis.requested", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        var answer = await aiProvider.AnalyzeStudioSourceAsync(body.Question.Trim(), project.Name, request.WorkspaceBranchName, sources, cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.source-analysis.completed", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { answer, sourceCount = body.Sources.Count });
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI kaynak analizi yanıtı alınamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner veya AI sağlayıcısına bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (System.Text.Json.JsonException) { return Results.Problem("AI sağlayıcısı geçersiz bir yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Kaynak analizi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("ai-tester");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/test-plan", async (Guid projectId, Guid requestId, CreateTestPlan body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.AISharingConfirmed) return Results.BadRequest(new { error = "AI paylaşımı için açık kullanıcı onayı gerekli." });
    if (string.IsNullOrWhiteSpace(body.Request) || body.Request.Length > 2000)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["Test planı talebi zorunludur ve en fazla 2000 karakter olabilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Test planı yalnızca hazır çalışma alanında oluşturulabilir." });
    var runnerUrl = configuration["WorkspaceRunner:BaseUrl"];
    if (!Uri.TryCreate(runnerUrl, UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.tester.plan.requested", Resource = request.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/test-discovery");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.tests.discover"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner test hedeflerini sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var discovery = await response.Content.ReadFromJsonAsync<RunnerTestDiscovery>(cancellationToken: cancellationToken);
        if (discovery is null) return Results.Problem("Runner geçersiz test keşif yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        var targets = discovery.Targets.Select(x => new AITestTarget(x.Path, x.Ecosystem, x.Evidence)).Take(50).ToList();
        var plan = await aiProvider.CreateTestPlanAsync(body.Request.Trim(), project.Name, request.WorkspaceBranchName ?? request.BranchName, targets, cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.tester.plan.created", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(plan);
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI Tester sağlayıcısı yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI sağlayıcısı geçerli bir test planı döndürmedi.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("AI sağlayıcısına veya Workspace Runner’a bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Test planı isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("AI sağlayıcısı geçersiz bir yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("ai-tester");
app.MapGet("/studio/projects/{projectId:guid}/test-plans", async (Guid projectId, Guid? workspaceRequestId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var canManage = CanManageProject(user, project.AccessGrants, userId);
    var query = db.AITestPlanRecords.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == projectId);
    if (workspaceRequestId is { } requestId) query = query.Where(x => x.WorkspaceRequestId == requestId);
    var rows = await query.OrderByDescending(x => x.CreatedAt).Take(50)
        .Select(x => new SavedAITestPlanView(x.Id, x.WorkspaceRequestId, x.BranchName, x.CommitSha, x.Summary, x.CreatedAt, x.CreatedByUserId, canManage || x.CreatedByUserId == userId))
        .ToListAsync(cancellationToken);
    return Results.Ok(rows);
}).RequireAuthorization();
app.MapGet("/studio/projects/{projectId:guid}/test-plans/{planId:guid}", async (Guid projectId, Guid planId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var canManage = CanManageProject(user, project.AccessGrants, userId);
    var record = await db.AITestPlanRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == planId, cancellationToken);
    if (record is null) return Results.NotFound();
    var plan = System.Text.Json.JsonSerializer.Deserialize<AITestPlan>(record.PlanJson,
        new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
    if (plan is null) return Results.Problem("Saklanan test planı okunamadı.", statusCode: StatusCodes.Status500InternalServerError);
    return Results.Ok(new SavedAITestPlanDetail(new SavedAITestPlanView(record.Id, record.WorkspaceRequestId,
        record.BranchName, record.CommitSha, record.Summary, record.CreatedAt, record.CreatedByUserId, canManage || record.CreatedByUserId == userId), plan));
}).RequireAuthorization();
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/test-plans", async (Guid projectId, Guid requestId, SaveAITestPlan body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready" || string.IsNullOrWhiteSpace(request.CommitSha))
        return Results.Conflict(new { error = "Yalnız commit bilgisi bulunan hazır çalışma alanlarının test planları saklanabilir." });
    if (!TrySerializeAITestPlan(body.Plan, out var planJson))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["plan"] = ["Test planı alanları veya boyutu geçersiz."] });
    var record = new AITestPlanRecord { TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = request.Id,
        CreatedByUserId = userId, BranchName = request.WorkspaceBranchName ?? request.BranchName, CommitSha = request.CommitSha!, Summary = body.Plan!.Summary, PlanJson = planJson! };
    db.AITestPlanRecords.Add(record);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.tester.plan.saved", Resource = record.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/studio/projects/{projectId}/test-plans/{record.Id}",
        new SavedAITestPlanView(record.Id, record.WorkspaceRequestId, record.BranchName, record.CommitSha, record.Summary, record.CreatedAt, record.CreatedByUserId, true));
}).RequireAuthorization();
app.MapDelete("/studio/projects/{projectId:guid}/test-plans/{planId:guid}", async (Guid projectId, Guid planId, [FromBody] DeleteSavedStudioPlan body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirm) return Results.BadRequest(new { error = "Planı silmek için açık onay gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var plan = await db.AITestPlanRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == planId, cancellationToken);
    if (plan is null) return Results.NotFound();
    if (plan.CreatedByUserId != userId && !CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.tester.plan.deleted", Resource = plan.Id.ToString() });
    db.AITestPlanRecords.Remove(plan);
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/code-suggestion", async (Guid projectId, Guid requestId, CreateCodeSuggestion body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(body.Request) || body.Request.Trim().Length > 2000 || !body.SourceSharingConfirmed ||
        !CodeSourcePolicy.IsEligibleFilePath(body.FilePath))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["İstek, izinli bir kaynak dosya yolu ve kaynak paylaşım onayı gereklidir; istek en fazla 2000 karakter olabilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Kod önerisi yalnızca hazır çalışma alanında oluşturulabilir." });
    if (string.IsNullOrWhiteSpace(request.CommitSha)) return Results.Conflict(new { error = "Checkout commit bilgisi doğrulanamadı." });
    if (string.IsNullOrWhiteSpace(configuration["AI:OpenAI:ApiKey"]))
        return Results.Problem("AI Developer sağlayıcısı yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        RunnerFileContent? source;
        if (body.CreateNewFile)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/new-file-target?path={Uri.EscapeDataString(body.FilePath!)}");
            message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.create-file"));
            using var response = await client.SendAsync(message, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Conflict) return Results.Conflict(new { error = "Bu dosya yolu çalışma alanında zaten var." });
            if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
            if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner yeni dosya yolunu doğrulayamadı.", statusCode: StatusCodes.Status502BadGateway);
            var target = await response.Content.ReadFromJsonAsync<RunnerNewFileTarget>(cancellationToken: cancellationToken);
            if (target is null || target.Exists || !string.Equals(target.Path, body.FilePath, StringComparison.Ordinal))
                return Results.Problem("Workspace Runner yeni dosya yolu için geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway);
            source = new RunnerFileContent(target.Path, "", 0, GetEmptyFileSha256());
        }
        else
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/file-content?path={Uri.EscapeDataString(body.FilePath!)}");
            message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.read-file"));
            using var response = await client.SendAsync(message, cancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Seçilen dosya bulunamadı." });
            if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            if (response.StatusCode == HttpStatusCode.UnsupportedMediaType) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
            if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner dosya içeriğini sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
            source = await response.Content.ReadFromJsonAsync<RunnerFileContent>(cancellationToken: cancellationToken);
        }
        if (source is null || !string.Equals(source.Path, body.FilePath, StringComparison.Ordinal))
            return Results.Problem("Workspace Runner geçersiz dosya içeriği döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        if (source.SizeBytes > 32 * 1024 || Encoding.UTF8.GetByteCount(source.Content) > 32 * 1024)
            return Results.Problem("AI Developer için kaynak dosya sınırı 32 KiB.", statusCode: StatusCodes.Status413PayloadTooLarge);

        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
            Action = body.CreateNewFile ? "studio.ai-developer.new-file-request-shared" : "studio.ai-developer.source-shared",
            Resource = WorkspaceAuditResource(request.Id, source.Path) });
        await db.SaveChangesAsync(cancellationToken);
        var suggestion = await aiProvider.CreateCodeSuggestionAsync(body.Request.Trim(), project.Name, request.WorkspaceBranchName ?? request.BranchName,
            source.Path, source.Content, cancellationToken, body.CreateNewFile);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.ai-developer.suggestion-created", Resource = WorkspaceAuditResource(request.Id, source.Path) });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new CodeSuggestionPreview(source.Path, source.Sha256, source.Content, suggestion.Summary, suggestion.ProposedContent, suggestion.Notes, body.CreateNewFile));
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI Developer sağlayıcısı yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI sağlayıcısı geçerli bir kod önerisi döndürmedi.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("AI sağlayıcısına veya Workspace Runner’a bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Kod önerisi isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("AI sağlayıcısı geçersiz bir yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("ai-developer");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/multi-file-code-suggestion", async (Guid projectId, Guid requestId, CreateMultiFileCodeSuggestion body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var paths = body.FilePaths?.Select(x => x?.Trim()).ToArray();
    if (string.IsNullOrWhiteSpace(body.Request) || body.Request.Trim().Length > 2000 || !body.SourceSharingConfirmed ||
        paths is null || paths.Length is < 2 or > 5 || paths.Any(x => string.IsNullOrWhiteSpace(x) || !CodeSourcePolicy.IsEligibleFilePath(x)) ||
        paths.Distinct(StringComparer.Ordinal).Count() != paths.Length)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["2–5 farklı izinli kaynak dosya yolu, 2000 karakteri aşmayan talep ve açık kaynak paylaşım onayı gerekli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Kod önerisi yalnızca hazır çalışma alanında oluşturulabilir." });
    if (string.IsNullOrWhiteSpace(configuration["AI:OpenAI:ApiKey"]))
        return Results.Problem("AI Developer sağlayıcısı yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        var sources = new List<CodeSourceFile>(paths.Length);
        var totalBytes = 0;
        foreach (var path in paths)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/file-content?path={Uri.EscapeDataString(path!)}");
            message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.read-file"));
            using var response = await client.SendAsync(message, cancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = $"Seçilen dosya bulunamadı: {path}" });
            if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            if (response.StatusCode == HttpStatusCode.UnsupportedMediaType) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
            if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner seçilen dosya içeriğini sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
            var source = await response.Content.ReadFromJsonAsync<RunnerFileContent>(cancellationToken: cancellationToken);
            if (source is null || !string.Equals(source.Path, path, StringComparison.Ordinal) || !IsSha256(source.Sha256))
                return Results.Problem("Workspace Runner seçilen yol için geçersiz dosya içeriği döndürdü.", statusCode: StatusCodes.Status502BadGateway);
            var size = Encoding.UTF8.GetByteCount(source.Content);
            if (source.SizeBytes > 32 * 1024 || size > 32 * 1024)
                return Results.Problem("AI Developer dosya başına 32 KiB sınırını destekliyor.", statusCode: StatusCodes.Status413PayloadTooLarge);
            totalBytes += size;
            if (totalBytes > 64 * 1024)
                return Results.Problem("AI Developer çoklu kaynak toplamı 64 KiB sınırını aşıyor.", statusCode: StatusCodes.Status413PayloadTooLarge);
            sources.Add(new CodeSourceFile(source.Path, source.Content, source.Sha256));
        }
        foreach (var source in sources)
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.ai-developer.multi-file-source-shared", Resource = WorkspaceAuditResource(request.Id, source.Path) });
        await db.SaveChangesAsync(cancellationToken);
        var suggestion = await aiProvider.CreateMultiFileCodeSuggestionAsync(body.Request.Trim(), project.Name,
            request.WorkspaceBranchName ?? request.BranchName, sources, cancellationToken);
        var requestedPaths = sources.Select(x => x.Path).ToHashSet(StringComparer.Ordinal);
        if (suggestion.Changes.Any(x => !requestedPaths.Contains(x.Path)) || suggestion.Changes.Count != requestedPaths.Count)
            return Results.Problem("AI sağlayıcısı seçilmeyen dosyalar için öneri döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        foreach (var change in suggestion.Changes)
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.ai-developer.multi-file-suggestion-created", Resource = WorkspaceAuditResource(request.Id, change.Path) });
        await db.SaveChangesAsync(cancellationToken);
        var originals = sources.ToDictionary(x => x.Path, StringComparer.Ordinal);
        return Results.Ok(new MultiFileCodeSuggestionPreview(suggestion.Summary, suggestion.Changes.Select(x =>
        {
            var source = originals[x.Path];
            return new MultiFileCodeChangePreview(x.Path, source.Sha256, source.Content, x.ProposedContent, x.Notes);
        }).ToArray(), suggestion.Risks));
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI Developer sağlayıcısı yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI sağlayıcısı geçerli bir çoklu dosya önerisi döndürmedi.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("AI sağlayıcısına veya Workspace Runner’a bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Çoklu dosya önerisi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("AI sağlayıcısı geçersiz bir yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("ai-developer");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/apply-code-suggestion", async (Guid projectId, Guid requestId, ApplyCodeSuggestion body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var expectedSha256 = body.CreateNewFile ? GetEmptyFileSha256() : body.ExpectedSha256;
    if (!body.ApprovalConfirmed || !CodeSourcePolicy.IsEligibleFilePath(body.FilePath) || !IsSha256(expectedSha256) ||
        string.IsNullOrWhiteSpace(body.ProposedContent) || body.ProposedContent.Contains('\0') || Encoding.UTF8.GetByteCount(body.ProposedContent) > 128 * 1024)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["approval"] = ["Açık kullanıcı onayı, geçerli bir kaynak dosyası özeti ve 128 KiB sınırında öneri içeriği gerekli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Öneri yalnızca hazır çalışma alanına uygulanabilir." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);

    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = body.ManualEdit ? "studio.workspace.manual-code.approved" : "studio.ai-developer.change.approved", Resource = WorkspaceAuditResource(request.Id, body.FilePath!) });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        var changeId = Guid.NewGuid();
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = runnerUri;
        var operation = body.CreateNewFile ? "workspace.create-file" : "workspace.apply-file";
        using var message = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{request.Id:D}/{(body.CreateNewFile ? "create-file" : "apply-file")}")
        {
            Content = System.Net.Http.Json.JsonContent.Create(new RunnerApplyFileRequest(changeId, body.FilePath, expectedSha256, body.ProposedContent, true))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, operation));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Conflict)
            return Results.Conflict(new { error = "Dosya öneri oluşturulduktan sonra değişmiş. Güncel dosyayı yeniden açıp yeni öneri alın." });
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Çalışma alanı veya dosya bulunamadı." });
        if (response.StatusCode == HttpStatusCode.UnsupportedMediaType) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
        if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner değişikliği uygulayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var applied = await response.Content.ReadFromJsonAsync<RunnerApplyFileResponse>(cancellationToken: cancellationToken);
        if (applied is null) return Results.Problem("Workspace Runner geçersiz uygulama yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = body.ManualEdit ? "studio.workspace.manual-code.applied" : "studio.ai-developer.change.applied", Resource = WorkspaceAuditResource(request.Id, applied.Path) });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new AppliedCodeSuggestion(applied.ChangeId, applied.Path, applied.Sha256, applied.AppliedAt));
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Değişiklik uygulama isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/changes", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Değişiklik geçmişi yalnızca hazır çalışma alanlarında görüntülenebilir." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/changes");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.changes.read"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner değişiklik geçmişini sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var changes = await response.Content.ReadFromJsonAsync<RunnerWorkspaceChanges>(cancellationToken: cancellationToken);
        if (changes is null) return Results.Problem("Runner geçersiz değişiklik geçmişi döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.changes.viewed", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(changes);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Değişiklik geçmişi isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization();
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/commit-approved-changes", async (Guid projectId, Guid requestId, CommitWorkspaceChanges body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.ApprovalConfirmed || !IsCommitSha(body.ExpectedHeadCommitSha) || body.ChangeIds is null || body.ChangeIds.Length is 0 or > 100 ||
        body.ChangeIds.Any(id => id == Guid.Empty) || body.ChangeIds.Distinct().Count() != body.ChangeIds.Length ||
        string.IsNullOrWhiteSpace(body.Message) || body.Message.Trim().Length is < 8 or > 160 || body.Message.Any(char.IsControl))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["approval"] = ["Açık onay, güncel HEAD, benzersiz değişiklik kimlikleri ve 8–160 karakterlik tek satır commit mesajı gereklidir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "İzole çalışma dalı hazır değil." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var statusMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-status");
        statusMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-status.read"));
        using var statusResponse = await client.SendAsync(statusMessage, cancellationToken);
        if (!statusResponse.IsSuccessStatusCode) return Results.Problem("Commit öncesi Git durumu doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var git = await statusResponse.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (git is null || git.Truncated || !string.Equals(git.BranchName, request.WorkspaceBranchName, StringComparison.Ordinal) ||
            !string.Equals(git.HeadCommitSha, body.ExpectedHeadCommitSha, StringComparison.OrdinalIgnoreCase))
            return Results.Conflict(new { error = "Git dalı veya HEAD değişmiş. Durumu yenileyin." });
        using var changesMessage = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/changes");
        changesMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.changes.read"));
        using var changesResponse = await client.SendAsync(changesMessage, cancellationToken);
        if (!changesResponse.IsSuccessStatusCode) return Results.Problem("Studio onaylı değişiklikleri doğrulanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var changeSet = await changesResponse.Content.ReadFromJsonAsync<RunnerWorkspaceChanges>(cancellationToken: cancellationToken);
        if (changeSet is null || changeSet.Truncated) return Results.Conflict(new { error = "Değişiklik geçmişi eksik veya kesilmiş; commit durduruldu." });
        var currentById = changeSet.Changes.Where(change => change.IsCurrent && !change.IsRestored).ToDictionary(change => change.Id);
        var selected = new List<RunnerCommitFile>(body.ChangeIds.Length);
        foreach (var id in body.ChangeIds)
        {
            if (!currentById.TryGetValue(id, out var change) || !IsStudioSourcePath(change.Path) || !IsSha256(change.AppliedSha256))
                return Results.Conflict(new { error = "Seçilen değişiklik artık Studio onaylı güncel hash ile eşleşmiyor." });
            selected.Add(new RunnerCommitFile(change.Id, change.Path, change.AppliedSha256));
        }
        if (selected.Select(file => file.Path).Distinct(StringComparer.Ordinal).Count() != selected.Count ||
            !git.Files.Select(file => file.Path).ToHashSet(StringComparer.Ordinal).SetEquals(selected.Select(file => file.Path!)))
            return Results.Conflict(new { error = "Çalışma ağacında seçilmemiş dosya var veya bir onaylı değişiklik eksik." });
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.commit.requested", Resource = $"{request.Id:D}:{body.ExpectedHeadCommitSha}" });
        await db.SaveChangesAsync(cancellationToken);
        using var commitMessage = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{request.Id:D}/commit-approved-changes")
        {
            Content = System.Net.Http.Json.JsonContent.Create(new RunnerCommitApprovedChanges(body.ExpectedHeadCommitSha, body.Message.Trim(), selected, true))
        };
        commitMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.changes.commit"));
        using var commitResponse = await client.SendAsync(commitMessage, cancellationToken);
        if (commitResponse.StatusCode == HttpStatusCode.Conflict) return Results.Conflict(await commitResponse.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken));
        if (commitResponse.StatusCode == HttpStatusCode.BadRequest) return Results.BadRequest(await commitResponse.Content.ReadFromJsonAsync<object>(cancellationToken: cancellationToken));
        if (!commitResponse.IsSuccessStatusCode) return Results.Problem("Workspace Runner commit işlemini tamamlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var commit = await commitResponse.Content.ReadFromJsonAsync<RunnerCommitResult>(cancellationToken: cancellationToken);
        if (commit is null || !IsCommitSha(commit.CommitSha) || !IsCommitSha(commit.ParentCommitSha))
            return Results.Problem("Runner geçersiz Git commit sonucu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.commit.completed", Resource = $"{request.Id:D}:{commit.CommitSha}" });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(commit);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz commit yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("Git commit isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/git-status", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Git durumu yalnızca hazır çalışma alanlarında görüntülenebilir." });
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Önce izole çalışma dalı oluşturulmalı." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-status");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-status.read"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Çalışma alanı bulunamadı." });
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner Git durumu sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var status = await response.Content.ReadFromJsonAsync<RunnerWorkspaceGitStatus>(cancellationToken: cancellationToken);
        if (status is null || !string.Equals(status.BranchName, request.WorkspaceBranchName, StringComparison.Ordinal) || !IsCommitSha(status.HeadCommitSha))
            return Results.Problem("Workspace Runner geçersiz Git durumu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.git-status.viewed", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(status);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Git durumu isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/git-diff", async (Guid projectId, Guid requestId, string? path, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Git diff yalnızca hazır çalışma alanlarında görüntülenebilir." });
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Önce izole çalışma dalı oluşturulmalı." });
    if (string.IsNullOrWhiteSpace(path) || path.Length > 500) return Results.BadRequest(new { error = "Dosya yolu geçersiz." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-diff?path={Uri.EscapeDataString(path)}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-diff.read"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Dosyada değişiklik bulunamadı." });
        if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (response.StatusCode == HttpStatusCode.Conflict) return Results.Conflict(new { error = "Bu dosya için metin diff'i üretilemiyor." });
        if (response.StatusCode == HttpStatusCode.BadRequest) return Results.BadRequest(new { error = "Dosya yolu geçersiz." });
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner Git diff sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var diff = await response.Content.ReadFromJsonAsync<RunnerWorkspaceGitDiff>(cancellationToken: cancellationToken);
        if (diff is null || !string.Equals(diff.Path, path, StringComparison.Ordinal) || !IsCommitSha(diff.HeadCommitSha) || !IsSha256(diff.BaseSha256) || !IsSha256(diff.CurrentSha256))
            return Results.Problem("Workspace Runner geçersiz Git diff döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.git-diff.viewed", Resource = WorkspaceAuditResource(request.Id, diff.Path) });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(diff);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Git diff isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/code-review", async (Guid projectId, Guid requestId, ReviewStudioDiff body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.AISharingConfirmed) return Results.BadRequest(new { error = "Seçilen dosya diff’ini AI’ye göndermek için açık onay gerekli." });
    if (!IsStudioSourcePath(body.Path)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["path"] = ["İnceleme için izinli tek bir kaynak dosya yolu seçin."] });
    var selectedPath = body.Path!;
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "İzole çalışma dalı hazır değil." });
    if (string.IsNullOrWhiteSpace(configuration["AI:OpenAI:ApiKey"])) return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/git-diff?path={Uri.EscapeDataString(selectedPath)}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.git-diff.read"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.Conflict(new { error = "Seçilen dosyada güncel diff bulunamadı." });
        if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner dosya diff’ini okuyamadı.", statusCode: StatusCodes.Status502BadGateway);
        var diff = await response.Content.ReadFromJsonAsync<RunnerWorkspaceGitDiff>(cancellationToken: cancellationToken);
        if (diff is null || !string.Equals(diff.Path, selectedPath, StringComparison.Ordinal) || !IsCommitSha(diff.HeadCommitSha) ||
            !IsSha256(diff.BaseSha256) || !IsSha256(diff.CurrentSha256))
            return Results.Problem("Workspace Runner geçersiz Git diff döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        if (Encoding.UTF8.GetByteCount(diff.BaseContent) + Encoding.UTF8.GetByteCount(diff.CurrentContent) > 20 * 1024)
            return Results.Problem("AI incelemesi tek dosyada toplam 20 KiB ile sınırlıdır; daha küçük bir diff seçin.", statusCode: StatusCodes.Status413PayloadTooLarge);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.code-review.requested", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        var review = await aiProvider.ReviewStudioDiffAsync(project.Name, request.WorkspaceBranchName,
            new StudioDiffContext(diff.Path, diff.Status, diff.BaseContent, diff.CurrentContent, diff.HeadCommitSha), cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.code-review.completed", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(review);
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI kod inceleme yanıtı alınamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner veya AI sağlayıcısına bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (System.Text.Json.JsonException) { return Results.Problem("AI sağlayıcısı geçersiz bir yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return Results.Problem("AI kod incelemesi zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
}).RequireAuthorization().RequireRateLimiting("ai-tester");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/conversations", async (Guid projectId, Guid requestId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    var conversations = db.StudioConversations.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId);
    var canManage = CanManageProject(user, project.AccessGrants, userId);
    if (!canManage) conversations = conversations.Where(x => x.CreatedByUserId == userId);
    var rows = await conversations.OrderByDescending(x => x.UpdatedAt).Take(50)
        .Select(x => new StudioConversationView(x.Id, x.Title, x.WorkspaceRequestId, x.CreatedAt, x.UpdatedAt, x.CreatedByUserId, canManage || x.CreatedByUserId == userId)).ToListAsync(cancellationToken);
    return Results.Ok(rows);
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/conversations", async (Guid projectId, Guid requestId, CreateStudioConversation body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Önce izole çalışma dalı oluşturulmalı." });
    var title = string.IsNullOrWhiteSpace(body.Title) ? $"AI Chat · {DateTimeOffset.UtcNow:dd.MM.yyyy HH:mm}" : body.Title.Trim();
    if (title.Length > 180) return Results.ValidationProblem(new Dictionary<string, string[]> { ["title"] = ["Başlık en fazla 180 karakter olabilir."] });
    var conversation = new StudioConversation { TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = requestId,
        CreatedByUserId = userId, Title = title };
    db.StudioConversations.Add(conversation);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.created", Resource = conversation.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/studio/projects/{projectId}/workspace-requests/{requestId}/conversations/{conversation.Id}",
        new StudioConversationView(conversation.Id, conversation.Title, conversation.WorkspaceRequestId, conversation.CreatedAt, conversation.UpdatedAt, conversation.CreatedByUserId, true));
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapDelete("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/conversations/{conversationId:guid}", async (Guid projectId, Guid requestId, Guid conversationId, [FromBody] DeleteStudioConversation body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirm) return Results.ValidationProblem(new Dictionary<string, string[]> { ["confirm"] = ["Sohbeti silmek için açık onay gerekli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var conversation = await db.StudioConversations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId &&
        x.WorkspaceRequestId == requestId && x.Id == conversationId, cancellationToken);
    if (conversation is null) return Results.NotFound();
    if (conversation.CreatedByUserId != userId && !CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.deleted", Resource = conversation.Id.ToString() });
    db.StudioConversations.Remove(conversation);
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/conversations/{conversationId:guid}/messages", async (Guid projectId, Guid requestId, Guid conversationId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    var conversation = await db.StudioConversations.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == conversationId, cancellationToken);
    if (conversation is null) return Results.NotFound();
    if (conversation.CreatedByUserId != userId && !CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var messages = await db.StudioConversationMessages.AsNoTracking().Where(x => x.TenantId == tenantId && x.ConversationId == conversationId)
        .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(100).ToListAsync(cancellationToken);
    var result = messages.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Select(x => new StudioConversationMessageView(x.Id, x.Role, x.Content, x.CreatedAt)).ToList();
    return Results.Ok(result);
}).RequireAuthorization().RequireRateLimiting("workspace-read");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/conversations/{conversationId:guid}/messages", async (Guid projectId, Guid requestId, Guid conversationId, SendStudioChatMessage body, ClaimsPrincipal user, AIStudioDbContext db, IAIModelProvider aiProvider, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.AISharingConfirmed) return Results.BadRequest(new { error = "AI paylaşımı için açık kullanıcı onayı gerekli." });
    var content = body.Content?.Trim();
    if (string.IsNullOrWhiteSpace(content) || content.Length > 4000)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["content"] = ["Mesaj gerekli ve en fazla 4000 karakter olabilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId && x.Status == "Ready", cancellationToken);
    if (request is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(request.WorkspaceBranchName)) return Results.Conflict(new { error = "Önce izole çalışma dalı oluşturulmalı." });
    var conversation = await db.StudioConversations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.WorkspaceRequestId == requestId && x.Id == conversationId, cancellationToken);
    if (conversation is null) return Results.NotFound();
    if (conversation.CreatedByUserId != userId && !CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var previous = await db.StudioConversationMessages.AsNoTracking().Where(x => x.TenantId == tenantId && x.ConversationId == conversationId)
        .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(11).ToListAsync(cancellationToken);
    var history = previous.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
        .Select(x => new StudioChatTurn(x.Role, x.Content)).Append(new StudioChatTurn("user", content)).ToList();
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.message.requested", Resource = conversation.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        var reply = await aiProvider.ReplyToStudioChatAsync(project.Name, request.WorkspaceBranchName, history, cancellationToken);
        var userMessage = new StudioConversationMessage { TenantId = tenantId, ConversationId = conversationId, Role = "user", Content = content };
        var assistantMessage = new StudioConversationMessage { TenantId = tenantId, ConversationId = conversationId, Role = "assistant", Content = reply };
        db.StudioConversationMessages.AddRange(userMessage, assistantMessage);
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.message.completed", Resource = conversation.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new StudioChatReplyView(new StudioConversationMessageView(userMessage.Id, userMessage.Role, userMessage.Content, userMessage.CreatedAt),
            new StudioConversationMessageView(assistantMessage.Id, assistantMessage.Role, assistantMessage.Content, assistantMessage.CreatedAt)));
    }
    catch (AIProviderNotConfiguredException)
    {
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.message.unavailable", Resource = conversation.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Problem("AI sağlayıcısı yapılandırılmadı.", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (AIProviderResponseException)
    {
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.message.failed", Resource = conversation.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Problem("AI sohbet yanıtı alınamadı.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
    {
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.chat.message.failed", Resource = conversation.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Problem("AI sohbet isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout);
    }
}).RequireAuthorization().RequireRateLimiting("ai-chat");
app.MapGet("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/changes/{changeId:guid}", async (Guid projectId, Guid requestId, Guid changeId, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Diff yalnızca hazır çalışma alanlarında görüntülenebilir." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/changes/{changeId:D}");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.changes.read"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Değişiklik kaydı bulunamadı." });
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner diff sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var diff = await response.Content.ReadFromJsonAsync<RunnerWorkspaceChangeDiff>(cancellationToken: cancellationToken);
        if (diff is null) return Results.Problem("Runner geçersiz diff döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.workspace.change.diff.viewed", Resource = WorkspaceAuditResource(request.Id, diff.Path) });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(diff);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Diff isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization();
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/changes/{changeId:guid}/restore", async (Guid projectId, Guid requestId, Guid changeId, RestoreCodeChange body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.ApprovalConfirmed || !IsSha256(body.ExpectedSha256))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["approval"] = ["Açık onay ve geçerli dosya özeti gerekli."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Değişiklik yalnızca hazır çalışma alanında geri alınabilir." });
    if (!Uri.TryCreate(configuration["WorkspaceRunner:BaseUrl"], UriKind.Absolute, out var runnerUri) || runnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.ai-developer.change.restore-approved", Resource = $"{request.Id:D}:{changeId:D}" });
    await db.SaveChangesAsync(cancellationToken);
    try
    {
        using var client = clients.CreateClient("workspace-runner"); client.BaseAddress = runnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Post, $"/internal/workspaces/{request.Id:D}/changes/{changeId:D}/restore")
        {
            Content = System.Net.Http.Json.JsonContent.Create(new RunnerRestoreFileRequest(body.ExpectedSha256, true))
        };
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.restore-file"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Conflict) return Results.Conflict(new { error = "Dosya değişmiş veya bu kayıt daha önce geri alınmış." });
        if (response.StatusCode == HttpStatusCode.NotFound) return Results.NotFound(new { error = "Değişiklik kaydı bulunamadı." });
        if (response.StatusCode == HttpStatusCode.RequestEntityTooLarge) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (!response.IsSuccessStatusCode) return Results.Problem("Workspace Runner değişikliği geri alamadı.", statusCode: StatusCodes.Status502BadGateway);
        var restored = await response.Content.ReadFromJsonAsync<RunnerRestoreFileResponse>(cancellationToken: cancellationToken);
        if (restored is null) return Results.Problem("Runner geçersiz geri alma yanıtı döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.ai-developer.change.restored", Resource = WorkspaceAuditResource(request.Id, restored.Path) });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(restored);
    }
    catch (HttpRequestException) { return Results.Problem("Workspace Runner bağlantısı kurulamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Geri alma isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("Workspace Runner geçersiz yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.MapPost("/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/architecture-plan", async (Guid projectId, Guid requestId, CreateArchitecturePlan body, ClaimsPrincipal user, AIStudioDbContext db, IHttpClientFactory clients, IAIModelProvider aiProvider, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(body.Request) || body.Request.Trim().Length > 2000)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["Geliştirme talebi zorunludur ve en fazla 2000 karakter olabilir."] });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == requestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready") return Results.Conflict(new { error = "Mimari plan yalnızca hazır çalışma alanında oluşturulabilir." });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.architecture.plan.requested", Resource = request.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    var runnerUri = configuration["WorkspaceRunner:BaseUrl"];
    if (!Uri.TryCreate(runnerUri, UriKind.Absolute, out var parsedRunnerUri) || parsedRunnerUri.Scheme != Uri.UriSchemeHttp)
        return Results.Problem("Workspace Runner yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("workspace-runner");
        client.BaseAddress = parsedRunnerUri;
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/internal/workspaces/{request.Id:D}/analysis");
        message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", CreateRunnerToken(configuration, request.Id, "workspace.analyze"));
        using var response = await client.SendAsync(message, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return response.StatusCode == HttpStatusCode.NotFound
                ? Results.Conflict(new { error = "Checkout bulunamadı; çalışma alanı durumunu yenileyin." })
                : Results.Problem("Workspace Runner envanteri sağlayamadı.", statusCode: StatusCodes.Status502BadGateway);
        var inventory = await response.Content.ReadFromJsonAsync<RunnerWorkspaceAnalysis>(cancellationToken: cancellationToken);
        if (inventory is null) return Results.Problem("Runner geçersiz proje envanteri döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        var plan = await aiProvider.CreateArchitecturePlanAsync(body.Request.Trim(), project.Name, request.WorkspaceBranchName ?? request.BranchName,
            inventory.Technologies.Select(x => new ArchitectureTechnology(x.Name, x.FileCount)).ToList(), inventory.EntryPoints, cancellationToken);
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.architecture.plan.created", Resource = request.Id.ToString() });
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(plan);
    }
    catch (AIProviderNotConfiguredException) { return Results.Problem("AI Architect sağlayıcısı yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (AIProviderResponseException) { return Results.Problem("AI sağlayıcısı geçerli bir plan döndürmedi.", statusCode: StatusCodes.Status502BadGateway); }
    catch (HttpRequestException) { return Results.Problem("AI sağlayıcısına veya Workspace Runner’a bağlanılamadı.", statusCode: StatusCodes.Status502BadGateway); }
    catch (TaskCanceledException) { return Results.Problem("Mimari plan isteği zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (System.Text.Json.JsonException) { return Results.Problem("AI sağlayıcısı geçersiz bir yanıt döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("ai-architect");
app.MapGet("/studio/projects/{projectId:guid}/architecture-plans", async (Guid projectId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var canManage = CanManageProject(user, project.AccessGrants, userId);
    var rows = await db.ArchitecturePlanRecords.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == projectId)
        .OrderByDescending(x => x.CreatedAt).Take(50)
        .Select(x => new SavedArchitecturePlanView(x.Id, x.WorkspaceRequestId, x.BranchName, x.CommitSha, x.Summary, x.CreatedAt, x.CreatedByUserId, canManage || x.CreatedByUserId == userId))
        .ToListAsync(cancellationToken);
    return Results.Ok(rows);
}).RequireAuthorization();
app.MapGet("/studio/projects/{projectId:guid}/architecture-plans/{planId:guid}", async (Guid projectId, Guid planId, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var canManage = CanManageProject(user, project.AccessGrants, userId);
    var record = await db.ArchitecturePlanRecords.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == planId, cancellationToken);
    if (record is null) return Results.NotFound();
    var plan = System.Text.Json.JsonSerializer.Deserialize<ArchitecturePlan>(record.PlanJson);
    if (plan is null) return Results.Problem("Saklanan mimari plan okunamadı.", statusCode: StatusCodes.Status500InternalServerError);
    return Results.Ok(new SavedArchitecturePlanDetail(new SavedArchitecturePlanView(record.Id, record.WorkspaceRequestId,
        record.BranchName, record.CommitSha, record.Summary, record.CreatedAt, record.CreatedByUserId, canManage || record.CreatedByUserId == userId), plan));
}).RequireAuthorization();
app.MapPost("/studio/projects/{projectId:guid}/architecture-plans", async (Guid projectId, SaveArchitecturePlan body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanContributeToProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var request = await db.DevelopmentWorkspaceRequests.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == body.WorkspaceRequestId, cancellationToken);
    if (request is null) return Results.NotFound();
    if (request.Status != "Ready" || string.IsNullOrWhiteSpace(request.CommitSha))
        return Results.Conflict(new { error = "Yalnız commit bilgisi bulunan hazır çalışma alanlarının planları saklanabilir." });
    if (!TrySerializeArchitecturePlan(body.Plan, out var planJson))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["plan"] = ["Plan alanları veya boyutu geçersiz."] });
    var record = new ArchitecturePlanRecord { TenantId = tenantId, ProjectId = projectId, WorkspaceRequestId = request.Id,
        CreatedByUserId = userId, BranchName = request.WorkspaceBranchName ?? request.BranchName, CommitSha = request.CommitSha!, Summary = body.Plan!.Summary, PlanJson = planJson! };
    db.ArchitecturePlanRecords.Add(record);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.architecture.plan.saved", Resource = record.Id.ToString() });
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/studio/projects/{projectId}/architecture-plans/{record.Id}",
        new SavedArchitecturePlanView(record.Id, record.WorkspaceRequestId, record.BranchName, record.CommitSha, record.Summary, record.CreatedAt, record.CreatedByUserId, true));
}).RequireAuthorization();
app.MapDelete("/studio/projects/{projectId:guid}/architecture-plans/{planId:guid}", async (Guid projectId, Guid planId, [FromBody] DeleteSavedStudioPlan body, ClaimsPrincipal user, AIStudioDbContext db, CancellationToken cancellationToken) =>
{
    if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
    if (!body.Confirm) return Results.BadRequest(new { error = "Planı silmek için açık onay gerekli." });
    var project = await db.DevelopmentProjects.AsNoTracking().Include(x => x.AccessGrants)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == projectId && x.IsActive, cancellationToken);
    if (project is null) return Results.NotFound();
    if (!CanViewProject(user, project.AccessGrants, userId)) return Results.Forbid();
    var plan = await db.ArchitecturePlanRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == projectId && x.Id == planId, cancellationToken);
    if (plan is null) return Results.NotFound();
    if (plan.CreatedByUserId != userId && !CanManageProject(user, project.AccessGrants, userId)) return Results.Forbid();
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "studio.architecture.plan.deleted", Resource = plan.Id.ToString() });
    db.ArchitecturePlanRecords.Remove(plan);
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
}).RequireAuthorization().RequireRateLimiting("workspace-write");
app.Run();

static bool TrySerializeArchitecturePlan(ArchitecturePlan? plan, out string? json)
{
    json = null;
    if (plan is null || string.IsNullOrWhiteSpace(plan.Summary) || plan.Summary.Length > 3000 ||
        plan.AffectedAreas is null || plan.AffectedAreas.Count > 12 || plan.Steps is null || plan.Steps.Count is 0 or > 12 ||
        plan.Assumptions is null || plan.Assumptions.Count > 12 || plan.Risks is null || plan.Risks.Count > 12 ||
        plan.AffectedAreas.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 180) ||
        plan.Assumptions.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 500) ||
        plan.Risks.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 500) ||
        plan.Steps.Any(x => x is null || string.IsNullOrWhiteSpace(x.Title) || x.Title.Length > 180 ||
            string.IsNullOrWhiteSpace(x.Description) || x.Description.Length > 1000 || x.Files is null || x.Files.Count > 20 ||
            x.Files.Any(file => string.IsNullOrWhiteSpace(file) || file.Length > 300))) return false;
    json = System.Text.Json.JsonSerializer.Serialize(plan, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
    return System.Text.Encoding.UTF8.GetByteCount(json) <= 64_000;
}

static bool TrySerializeAITestPlan(AITestPlan? plan, out string? json)
{
    json = null;
    var categories = new HashSet<string>(["Unit", "Integration", "Regression", "Security", "Edge"], StringComparer.Ordinal);
    var priorities = new HashSet<string>(["Low", "Medium", "High"], StringComparer.Ordinal);
    if (plan is null || string.IsNullOrWhiteSpace(plan.Summary) || plan.Summary.Length > 2000 || plan.Scenarios is null || plan.Scenarios.Count is 0 or > 8 ||
        plan.Assumptions is null || plan.Assumptions.Count > 10 || plan.Risks is null || plan.Risks.Count > 10 ||
        plan.Assumptions.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 400) || plan.Risks.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 400) ||
        plan.Scenarios.Any(x => x is null || string.IsNullOrWhiteSpace(x.Title) || x.Title.Length > 160 || !categories.Contains(x.Category) ||
            string.IsNullOrWhiteSpace(x.Objective) || x.Objective.Length > 500 || x.Steps is null || x.Steps.Count is 0 or > 8 ||
            x.Steps.Any(step => string.IsNullOrWhiteSpace(step) || step.Length > 300) || string.IsNullOrWhiteSpace(x.ExpectedResult) ||
            x.ExpectedResult.Length > 500 || !priorities.Contains(x.Priority))) return false;
    json = System.Text.Json.JsonSerializer.Serialize(plan, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
    return System.Text.Encoding.UTF8.GetByteCount(json) <= 64_000;
}

static bool TryScope(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
{
    var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
    var hasUser = Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out userId);
    return hasTenant && hasUser;
}
static Dictionary<string, string[]> ValidateProject(CreateProject body)
{
    var errors = new Dictionary<string, string[]>();
    if (string.IsNullOrWhiteSpace(body.Name) || body.Name.Trim().Length > 120) errors["name"] = ["Proje adı zorunludur ve en fazla 120 karakter olabilir."];
    if (string.IsNullOrWhiteSpace(body.RepositoryUrl) || body.RepositoryUrl.Trim().Length > 2048 || !TryRepositoryUrl(body.RepositoryUrl, out _))
        errors["repositoryUrl"] = ["Depo adresi en fazla 2048 karakter olmalı ve HTTPS, kimlik bilgisi içermeyen geçerli bir adres olmalıdır."];
    if (!IsValidBranchName(body.DefaultBranch?.Trim()))
        errors["defaultBranch"] = ["Geçerli bir Git branch adı girin (en fazla 256 karakter)."];
    return errors;
}

static bool TryRepositoryUrl(string? value, out Uri? uri)
{
    uri = null;
    if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var candidate) || candidate.Scheme != Uri.UriSchemeHttps ||
        !string.IsNullOrEmpty(candidate.UserInfo) || !string.IsNullOrEmpty(candidate.Query) || !string.IsNullOrEmpty(candidate.Fragment) ||
        string.IsNullOrWhiteSpace(candidate.Host) || candidate.IsLoopback || candidate.IsDefaultPort == false || candidate.AbsolutePath == "/") return false;
    if (IPAddress.TryParse(candidate.Host, out var address) && (IPAddress.IsLoopback(address) || address.IsIPv6LinkLocal ||
        address.IsIPv6SiteLocal || address.GetAddressBytes()[0] == 10 || address.GetAddressBytes()[0] == 127 ||
        (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && address.GetAddressBytes()[0] == 192 && address.GetAddressBytes()[1] == 168) ||
        (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && address.GetAddressBytes()[0] == 172 && address.GetAddressBytes()[1] is >= 16 and <= 31))) return false;
    uri = candidate;
    return true;
}

static async Task<string?> CreateGitHubReadTokenAsync(string repositoryUrl, long? installationId,
    GitHubAppInstallationTokenProvider tokenProvider, CancellationToken cancellationToken)
{
    if (!TryRepositoryUrl(repositoryUrl, out var uri) || !string.Equals(uri!.Host, "github.com", StringComparison.OrdinalIgnoreCase)) return null;
    if (installationId is null) return null;
    var repository = GetGitHubRepositoryIdentifier(repositoryUrl);
    if (repository is null) throw new GitHubIntegrationException("GitHub repository URL is invalid.");
    return await tokenProvider.CreateRepositoryReadTokenAsync(installationId.Value, repository, cancellationToken);
}

static string? GetGitHubRepositoryIdentifier(string repositoryUrl)
{
    if (!TryRepositoryUrl(repositoryUrl, out var uri) || !string.Equals(uri!.Host, "github.com", StringComparison.OrdinalIgnoreCase)) return null;
    var parts = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
    if (parts.Length != 2) return null;
    var owner = Uri.UnescapeDataString(parts[0]);
    var name = Uri.UnescapeDataString(parts[1]);
    if (name.EndsWith(".git", StringComparison.OrdinalIgnoreCase)) name = name[..^4];
    if (owner.Length is < 1 or > 100 || name.Length is < 1 or > 100 ||
        owner.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-') ||
        name.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_' or '.'))) return null;
    return $"{owner}/{name}";
}

static string NormalizeRepositoryUrl(string value)
{
    var uri = new Uri(value.Trim());
    var builder = new UriBuilder(uri) { Host = uri.Host.ToLowerInvariant(), Path = uri.AbsolutePath.TrimEnd('/') };
    return builder.Uri.AbsoluteUri.TrimEnd('/');
}

static bool CanManageProject(ClaimsPrincipal user, IEnumerable<DevelopmentProjectAccess> grants, Guid userId) =>
    user.IsInRole("TenantAdmin") || grants.Any(x => x.UserId == userId && x.AccessLevel == "Maintainer");
static bool CanViewProject(ClaimsPrincipal user, IEnumerable<DevelopmentProjectAccess> grants, Guid userId) =>
    user.IsInRole("TenantAdmin") || grants.Any(x => x.UserId == userId);
static bool CanContributeToProject(ClaimsPrincipal user, IEnumerable<DevelopmentProjectAccess> grants, Guid userId) =>
    user.IsInRole("TenantAdmin") || grants.Any(x => x.UserId == userId && x.AccessLevel is "Contributor" or "Maintainer");
static bool IsValidBranchName(string? branch) => !string.IsNullOrWhiteSpace(branch) && branch.Length <= 256 &&
    !branch.StartsWith('/') && !branch.EndsWith('/') && !branch.StartsWith('-') && !branch.EndsWith('.') &&
    !branch.Contains("..", StringComparison.Ordinal) && !branch.Contains("//", StringComparison.Ordinal) &&
    !branch.Contains("@{", StringComparison.Ordinal) && !branch.Any(c => char.IsWhiteSpace(c) || char.IsControl(c) || "~^:?*[\\".Contains(c)) &&
    !branch.Split('/').Any(part => part.StartsWith('.') || part.EndsWith(".lock", StringComparison.OrdinalIgnoreCase));
static bool IsUniqueViolation(DbUpdateException exception) => exception.InnerException is SqlException { Number: 2601 or 2627 };
static bool IsCommitSha(string? value) => value is { Length: 40 or 64 } && value.All(Uri.IsHexDigit);
static bool IsSha256(string? value) => value is { Length: 64 } && value.All(Uri.IsHexDigit);
static string GetEmptyFileSha256() => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData([]));
static string GetWorkspaceBranchName(Guid workspaceId) => $"aierp/workspace-{workspaceId:N}";
static string WorkspaceAuditResource(Guid requestId, string path) => $"{requestId:D}:{path[..Math.Min(path.Length, 200)]}";
static bool IsStudioSourcePath(string? path)
{
    if (string.IsNullOrWhiteSpace(path) || path.Length > 500 || path.StartsWith('/') || path.Contains('\\') || path.Contains(':') || path.Any(char.IsControl)) return false;
    if (path.Split('/').Any(segment => string.IsNullOrWhiteSpace(segment) || segment is "." or ".." || segment.StartsWith('.') ||
        segment.Contains("secret", StringComparison.OrdinalIgnoreCase) || segment.Contains("credential", StringComparison.OrdinalIgnoreCase))) return false;
    return Path.GetExtension(path).ToLowerInvariant() is ".cs" or ".csx" or ".razor" or ".ts" or ".tsx" or ".js" or ".jsx" or ".mjs" or
        ".py" or ".go" or ".rs" or ".java" or ".sql" or ".json" or ".xml" or ".csproj" or ".fsproj" or ".props" or ".targets" or
        ".yml" or ".yaml" or ".md" or ".html" or ".htm" or ".css" or ".scss";
}
static bool IsStudioCargoManifestPath(string? path) => !string.IsNullOrWhiteSpace(path) && path.Length <= 500 &&
    !path.StartsWith('/') && !path.Contains('\\') && !path.Contains(':') && !path.Any(char.IsControl) &&
    Path.GetFileName(path).Equals("Cargo.toml", StringComparison.OrdinalIgnoreCase) &&
    path.Split('/').All(segment => !string.IsNullOrWhiteSpace(segment) && segment is not ("." or "..") &&
        !segment.StartsWith('.') && !segment.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
        !segment.Contains("credential", StringComparison.OrdinalIgnoreCase) && !segment.Contains("password", StringComparison.OrdinalIgnoreCase) &&
        !segment.Contains("apikey", StringComparison.OrdinalIgnoreCase));
static string CreateRunnerToken(IConfiguration configuration, Guid workspaceId, string operation)
{
    var now = DateTime.UtcNow;
    var token = new JwtSecurityToken(configuration["Authentication:Issuer"] ?? "AIERP", "AIERP.WorkspaceRunner",
        [new Claim(JwtRegisteredClaimNames.Sub, "AIERP.AIService"), new Claim("service", "AIERP.AIService"),
         new Claim("operation", operation), new Claim("workspace_id", workspaceId.ToString("D"))], now, now.AddMinutes(2),
        new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Authentication:SigningKey"]!)), SecurityAlgorithms.HmacSha256));
    return new JwtSecurityTokenHandler().WriteToken(token);
}
static string CreateReleaseDeployerToken(IConfiguration configuration, StudioReleaseDeploymentRecord deployment, string operation)
{
    var now = DateTime.UtcNow;
    var token = new JwtSecurityToken(configuration["Authentication:Issuer"] ?? "AIERP", "AIERP.ReleaseDeployer",
        [new Claim(JwtRegisteredClaimNames.Sub, "AIERP.AIService"), new Claim("service", "AIERP.AIService"),
         new Claim("scope", operation), new Claim("deployment_id", deployment.Id.ToString("D")),
         new Claim("tenant_id", deployment.TenantId.ToString("D")), new Claim("project_id", deployment.ProjectId.ToString("D"))],
        now, now.AddMinutes(2), new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Authentication:SigningKey"]!)), SecurityAlgorithms.HmacSha256));
    return new JwtSecurityTokenHandler().WriteToken(token);
}
static string CreateProjectRunnerToken(IConfiguration configuration, Guid projectId, string operation)
{
    var now = DateTime.UtcNow;
    var token = new JwtSecurityToken(configuration["Authentication:Issuer"] ?? "AIERP", "AIERP.WorkspaceRunner",
        [new Claim(JwtRegisteredClaimNames.Sub, "AIERP.AIService"), new Claim("service", "AIERP.AIService"),
         new Claim("operation", operation), new Claim("project_id", projectId.ToString("D"))], now, now.AddMinutes(2),
        new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Authentication:SigningKey"]!)), SecurityAlgorithms.HmacSha256));
    return new JwtSecurityTokenHandler().WriteToken(token);
}
static WorkspaceRequestView ToWorkspaceView(DevelopmentWorkspaceRequest request, bool canReview) => new(request.Id, request.ProjectId,
    request.RequestedByUserId, request.BranchName, request.Status, request.CreatedAt, request.ReviewedByUserId,
    request.ReviewedAt, request.ReviewNote, canReview, request.CommitSha, request.ProvisioningError, request.ProvisionedAt,
    WorkspaceBranchName: request.WorkspaceBranchName);
static StudioReleaseDeploymentView ToReleaseDeploymentView(StudioReleaseDeploymentRecord deployment) => new(
    deployment.Id, deployment.ReleasePackageId, deployment.RollbackOfDeploymentId, deployment.Environment, deployment.Provider,
    deployment.Status, deployment.PackageSha256, deployment.CommitSha, deployment.EnvironmentUrl, deployment.CreatedAt,
    deployment.StartedAt, deployment.CompletedAt, deployment.FailureCode, RollbackTargetDeploymentId: deployment.RollbackTargetDeploymentId);
static StudioProductionApprovalView ToProductionApprovalView(StudioProductionPromotionApprovalRecord approval, StudioReleaseDeploymentRecord staging, string version = "") => new(
    approval.Id, approval.StagingDeploymentId, approval.ReleasePackageId, version, approval.Status, staging.EnvironmentUrl,
    approval.RequestNote, approval.ReviewNote, approval.RequestedByUserId, approval.ReviewedByUserId, approval.CreatedAt,
    approval.ReviewedAt, ProductionDeploymentStarted: false);

internal sealed record CreateRequest(string? Title, string? Description, Guid? ProjectId = null);
internal sealed record RequestView(Guid Id, string Title, string Description, string Status, DateTimeOffset CreatedAt, Guid? ProjectId, string? ProjectName);
internal sealed record CreateProject(string? Name, string? RepositoryUrl, string? DefaultBranch);
internal sealed record GrantProjectAccess(string? Email, string? AccessLevel);
internal sealed record ProjectView(Guid Id, string Name, string RepositoryUrl, string DefaultBranch, string AccessLevel, DateTimeOffset CreatedAt, bool GitHubAuthorized = false);
internal sealed record ProjectBranchesView(string DefaultBranch, IReadOnlyList<string> Branches);
internal sealed record RunnerProjectBranchesRequest(Guid ProjectId, string RepositoryUrl);
internal sealed record RunnerProjectBranchesResponse(IReadOnlyList<string> Branches);
internal sealed record PendingWorkspaceApprovalView(Guid Id, Guid ProjectId, string ProjectName, Guid RequestedByUserId,
    string RequesterEmail, string BranchName, DateTimeOffset CreatedAt, string? ReviewNote, string? DevelopmentRequestTitle, string? DevelopmentRequestDescription);
internal sealed record PendingWorkspaceApprovalsPage(IReadOnlyList<PendingWorkspaceApprovalView> Items, int? NextOffset);
internal sealed record ProjectMemberView(Guid UserId, string Email, string AccessLevel, DateTimeOffset GrantedAt);
internal sealed record CreateWorkspaceRequest(string? BranchName, Guid? DevelopmentRequestId = null);
internal sealed record ReviewWorkspaceRequest(string? Outcome, string? Note);
internal sealed record CreateArchitecturePlan(string? Request);
internal sealed record CreateTestPlan(string? Request, bool AISharingConfirmed);
internal sealed record CreateWorkspaceTestRun(string? TargetPath, bool ExecutionConfirmed);
internal sealed record CreateSandboxErrorAnalysis(string Operation, bool AISharingConfirmed);
internal sealed record SaveAITestPlan(AITestPlan? Plan);
internal sealed record CreateStudioConversation(string? Title);
internal sealed record DeleteStudioConversation(bool Confirm);
internal sealed record DeleteSavedStudioPlan(bool Confirm);
internal sealed record SendStudioChatMessage(string? Content, bool AISharingConfirmed);
internal sealed record AnalyzeSelectedSource(string? Question, IReadOnlyList<StudioSourceReference>? Sources, bool AISharingConfirmed);
internal sealed record StudioSourceReference(string Path, int Line, string Excerpt);
internal sealed record ReviewStudioDiff(string? Path, bool AISharingConfirmed);
internal sealed record StudioConversationView(Guid Id, string Title, Guid WorkspaceRequestId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, Guid CreatedByUserId, bool CanDelete);
internal sealed record StudioConversationMessageView(Guid Id, string Role, string Content, DateTimeOffset CreatedAt);
internal sealed record StudioChatReplyView(StudioConversationMessageView UserMessage, StudioConversationMessageView AssistantMessage);
internal sealed record CreateCodeSuggestion(string? Request, string? FilePath, bool SourceSharingConfirmed, bool CreateNewFile = false);
internal sealed record CreateMultiFileCodeSuggestion(string? Request, IReadOnlyList<string>? FilePaths, bool SourceSharingConfirmed);
internal sealed record ApplyCodeSuggestion(string? FilePath, string? ExpectedSha256, string? ProposedContent, bool ApprovalConfirmed, bool CreateNewFile = false, bool ManualEdit = false);
internal sealed record RestoreCodeChange(string? ExpectedSha256, bool ApprovalConfirmed);
internal sealed record CommitWorkspaceChanges(Guid[]? ChangeIds, string? ExpectedHeadCommitSha, string? Message, bool ApprovalConfirmed);
internal sealed record CodeSuggestionPreview(string FilePath, string SourceSha256, string OriginalContent, string Summary, string ProposedContent, IReadOnlyList<string> Notes, bool CreateNewFile = false);
internal sealed record MultiFileCodeSuggestionPreview(string Summary, IReadOnlyList<MultiFileCodeChangePreview> Changes, IReadOnlyList<string> Risks);
internal sealed record MultiFileCodeChangePreview(string FilePath, string SourceSha256, string OriginalContent, string ProposedContent, IReadOnlyList<string> Notes);
internal sealed record AppliedCodeSuggestion(Guid ChangeId, string FilePath, string Sha256, DateTimeOffset AppliedAt);
internal sealed record RunnerApplyFileRequest(Guid ChangeId, string? Path, string? ExpectedSha256, string? ProposedContent, bool ApprovalConfirmed);
internal sealed record RunnerApplyFileResponse(Guid ChangeId, string Path, string Sha256, DateTimeOffset AppliedAt);
internal sealed record RunnerRestoreFileRequest(string? ExpectedSha256, bool ApprovalConfirmed);
internal sealed record RunnerRestoreFileResponse(Guid ChangeId, string Path, string Sha256);
internal sealed record RunnerWorkspaceChanges(IReadOnlyList<RunnerWorkspaceChangeSummary> Changes, bool Truncated);
internal sealed record RunnerCommitFile(Guid ChangeId, string? Path, string? AppliedSha256);
internal sealed record RunnerCommitApprovedChanges(string? ExpectedHeadCommitSha, string? Message, IReadOnlyList<RunnerCommitFile> Files, bool ApprovalConfirmed);
internal sealed record RunnerCommitResult(Guid WorkspaceId, string BranchName, string ParentCommitSha, string CommitSha, IReadOnlyList<string> Files);
internal sealed record RunnerWorkspaceGitStatus(string BranchName, string HeadCommitSha, int TotalChangedFiles, bool Truncated, IReadOnlyList<RunnerWorkspaceGitFileStatus> Files);
internal sealed record RunnerWorkspaceGitFileStatus(string Path, string Status);
internal sealed record RunnerWorkspaceGitDiff(string Path, string Status, string BaseContent, string CurrentContent, string BaseSha256, string CurrentSha256, string HeadCommitSha);
internal sealed record RunnerWorkspaceChangeSummary(Guid Id, string Path, string OriginalSha256, string AppliedSha256, DateTimeOffset AppliedAt, bool IsRestored, bool IsCurrent, bool WasCreated = false);
internal sealed record RunnerWorkspaceChangeDiff(Guid Id, string Path, string OriginalContent, string CurrentContent, string OriginalSha256, string AppliedSha256, DateTimeOffset AppliedAt, bool IsRestored, bool IsCurrent, bool WasCreated = false);
internal sealed record SaveArchitecturePlan(Guid WorkspaceRequestId, ArchitecturePlan? Plan);
internal sealed record SavedArchitecturePlanView(Guid Id, Guid WorkspaceRequestId, string BranchName, string CommitSha, string Summary, DateTimeOffset CreatedAt, Guid CreatedByUserId, bool CanDelete);
internal sealed record SavedArchitecturePlanDetail(SavedArchitecturePlanView Metadata, ArchitecturePlan Plan);
internal sealed record RunnerProvisionRequest(Guid WorkspaceId, string RepositoryUrl, string BranchName);
internal sealed record RunnerProvisionResponse(Guid WorkspaceId, string CommitSha, string WorkspaceBranchName);
internal sealed record RunnerWorkspaceBranch(Guid WorkspaceId, string BranchName, string CommitSha);
internal sealed record RunnerFileListing(string Path, IReadOnlyList<RunnerFileEntry> Entries, int? NextOffset);
internal sealed record RunnerFileEntry(string Name, string Path, string Kind, long? SizeBytes);
internal sealed record RunnerFileContent(string Path, string Content, int SizeBytes, string Sha256);
internal sealed record RunnerNewFileTarget(string Path, bool Exists);
internal sealed record RunnerWorkspaceAnalysis(int ScannedFiles, bool Truncated, IReadOnlyList<RunnerTechnologyCount> Technologies, IReadOnlyList<string> EntryPoints);
internal sealed record RunnerTechnologyCount(string Name, int FileCount);
internal sealed record RunnerTestDiscovery(int ScannedFiles, bool Truncated, IReadOnlyList<RunnerTestTarget> Targets);
internal sealed record RunnerTestTarget(string Path, string Ecosystem, string Evidence, string SuggestedCommand);
internal sealed record RunnerTestRunRequest(string? TargetPath);
internal sealed record RunnerWorkspaceBuildRequest(string? TargetPath);
internal sealed record RunnerTestRunCreated(Guid JobId, string TargetPath, string CommitSha, string SnapshotSha256, bool HasUncommittedChanges, DateTimeOffset CreatedAt);
internal sealed record RunnerTestRunStatus(Guid JobId, string TargetPath, string CommitSha, string SnapshotSha256, bool HasUncommittedChanges, string Status, string? Message, bool? Success, int? ExitCode, int DurationMilliseconds, string Output, DateTime? CompletedAt);
internal sealed record CreateReleaseCandidate(Guid TestJobId);
internal sealed record ReleaseCandidateView(Guid Id, Guid WorkspaceRequestId, string BranchName, string CommitSha, Guid TestJobId, string TestTargetPath, string TestSnapshotSha256, DateTimeOffset TestCompletedAt, DateTimeOffset CreatedAt, Guid CreatedByUserId, string? Decision, string? ReviewNote, DateTimeOffset? ReviewedAt, Guid? ReviewedByUserId, bool CanReview);
internal sealed record ReviewReleaseCandidate(string? Decision, string? Note);
internal sealed record CreateReleaseCandidateDraft(string? ChangeSummary, bool AISharingConfirmed);
internal sealed record PublishStudioPullRequest(long GitHubInstallationId, string? Title, string? Body, bool Confirmation);
internal sealed record AssignReleaseVersion(string? Version, bool Confirmation);
internal sealed record StudioReleaseVersionView(Guid Id, Guid ReleaseCandidateId, string Version, string CommitSha, DateTimeOffset CreatedAt, Guid CreatedByUserId);
internal sealed record ConfirmReleasePackage(bool Confirmation);
internal sealed record RunnerCreateReleasePackage(Guid PackageId, string Version, string CommitSha, Guid TestJobId, string TestTargetPath, string TestSnapshotSha256, bool Confirmation);
internal sealed record RunnerReleasePackage(Guid PackageId, string FileName, string Version, string CommitSha, string PackageSha256, long SizeBytes, int FileCount, DateTimeOffset CreatedAt);
internal sealed record StudioReleasePackageView(Guid Id, Guid ReleaseVersionId, string Version, string CommitSha, string TestSnapshotSha256, string PackageSha256, string FileName, long SizeBytes, DateTimeOffset CreatedAt, Guid CreatedByUserId);
internal sealed record CreateStagingDeployment(Guid IdempotencyKey, bool Confirmation, Guid? ExpectedActiveDeploymentId = null, Guid? RollbackTargetDeploymentId = null);
internal sealed record CreateProductionApproval(bool Confirmation, string? Note);
internal sealed record ReviewProductionApproval(string? Decision, string? Note);
internal sealed record CreateProductionDeployment(Guid IdempotencyKey, bool Confirmation, bool MigrationConfirmation, Guid? ExpectedActiveDeploymentId);
internal sealed record StudioProductionDeploymentOperationResult(StudioReleaseDeploymentView Deployment, string BootstrapEmail, string BootstrapPassword);
internal sealed record StudioProductionApprovalView(Guid Id, Guid StagingDeploymentId, Guid ReleasePackageId, string Version, string Status,
    string? StagingUrl, string RequestNote, string? ReviewNote, Guid RequestedByUserId, Guid? ReviewedByUserId,
    DateTimeOffset CreatedAt, DateTimeOffset? ReviewedAt, bool ProductionDeploymentStarted, Guid? ProductionDeploymentId = null,
    string? ProductionDeploymentStatus = null, string? ProductionEnvironmentUrl = null);
internal sealed record DeployerStagingDeployment(Guid DeploymentId, Guid TenantId, Guid ProjectId, Guid PackageId, Guid IdempotencyKey, Guid? ExpectedActiveDeploymentId, string PackageSha256, string CommitSha, string Version);
internal sealed record DeployerStagingDeploymentResult(Guid DeploymentId, Guid IdempotencyKey, Guid PackageId, string PackageSha256, string CommitSha, string Url, string ProviderDeploymentId, string BootstrapEmail, string BootstrapPassword, DateTimeOffset CreatedAt);
internal sealed record StudioReleaseDeploymentView(Guid Id, Guid ReleasePackageId, Guid? RollbackOfDeploymentId, string Environment, string Provider, string Status, string PackageSha256, string CommitSha, string? EnvironmentUrl, DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? CompletedAt, string? FailureCode, string Version = "", Guid? RollbackTargetDeploymentId = null, bool CanRestoreDatabase = false);
internal sealed record RestoreProductionDatabase(Guid IdempotencyKey, Guid ExpectedActiveDeploymentId, Guid BackupDeploymentId, bool Confirmation, string? ConfirmationText);
internal sealed record DeployerRestoreProductionDeployment(Guid DeploymentId, Guid TenantId, Guid ProjectId, Guid PackageId, Guid IdempotencyKey, Guid ExpectedActiveDeploymentId, Guid BackupDeploymentId, Guid TargetDeploymentId, string PackageSha256, string CommitSha, string Version);
internal sealed record StudioStagingDeploymentOperationResult(StudioReleaseDeploymentView Deployment, string BootstrapEmail, string BootstrapPassword);
internal sealed record RunnerPushBranchResponse(string BranchName, string CommitSha, bool Pushed);
internal sealed record GitHubPullRequestResponse(int Number, [property: JsonPropertyName("html_url")] string? HtmlUrl, string? State, bool Draft);
internal sealed record ReleaseCandidateReviewView(Guid Id, Guid ReleaseCandidateId, string Decision, string Note, DateTimeOffset CreatedAt, Guid ReviewedByUserId);
internal sealed record RunnerWorkspaceSearchResult(int ScannedFiles, bool Truncated, IReadOnlyList<RunnerWorkspaceSearchMatch> Matches);
internal sealed record RunnerWorkspaceSearchMatch(string Path, int Line, string Excerpt);
internal sealed record SavedAITestPlanView(Guid Id, Guid WorkspaceRequestId, string BranchName, string CommitSha, string Summary, DateTimeOffset CreatedAt, Guid CreatedByUserId, bool CanDelete);
internal sealed record SavedAITestPlanDetail(SavedAITestPlanView Metadata, AITestPlan Plan);
internal sealed record WorkspaceRequestView(Guid Id, Guid ProjectId, Guid RequestedByUserId, string BranchName, string Status,
    DateTimeOffset CreatedAt, Guid? ReviewedByUserId, DateTimeOffset? ReviewedAt, string? ReviewNote, bool CanReview,
    string? CommitSha, string? ProvisioningError, DateTimeOffset? ProvisionedAt, bool CanCancel = false,
    Guid? DevelopmentRequestId = null, string? DevelopmentRequestTitle = null, string? DevelopmentRequestDescription = null,
    string? WorkspaceBranchName = null);
