using AIERP.Api;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Net;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.Observability;
using AIERP.ModuleSDK;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddAierpHttpMetrics();
var jwtKey = builder.Configuration["Authentication:SigningKey"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Authentication:SigningKey must be configured with at least 32 bytes.");
var pluginHostSigningKey = builder.Configuration["PluginHost:SigningKey"];
if (string.IsNullOrWhiteSpace(pluginHostSigningKey) || Encoding.UTF8.GetByteCount(pluginHostSigningKey) < 32)
    throw new InvalidOperationException("PluginHost:SigningKey must be a separate secret with at least 32 bytes.");
var connectionString = builder.Configuration.GetConnectionString("Platform") ?? throw new InvalidOperationException("ConnectionStrings:Platform is required.");
DatabaseIsolationConfiguration.RequireEnabled(builder.Configuration, "Platform API", "Tenant", "AIStudio");
var tenantConnectionString = builder.Configuration.GetConnectionString("Tenant")!;
builder.Services.AddDbContext<PlatformDbContext>(o => o.UseSqlServer(connectionString));
builder.Services.AddHttpClient("nvidia-models", client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient("openai-models", client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient("openai-live-evaluation", client => client.Timeout = TimeSpan.FromSeconds(45));
builder.Services.AddHttpClient("tcmb-rates", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("NexoraERP/1.0");
});
builder.Services.AddHttpClient("plugin-host", client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddHttpClient("integration-host", client => client.Timeout = TimeSpan.FromSeconds(35));
builder.Services.AddHttpClient("ai-service", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AIService:BaseUrl"] ?? "http://ai-service:8080");
    client.Timeout = TimeSpan.FromSeconds(70);
});
builder.Services.AddHostedService<IntegrationOperationWorker>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddDbContext<TenantDbContext>((services, options) =>
{
    var http = services.GetRequiredService<IHttpContextAccessor>().HttpContext;
    options.UseSqlServer(TenantDatabaseRouting.Resolve(http));
});
builder.Services.AddScoped<IAuditExecutionContext>(services =>
{
    var user = services.GetRequiredService<IHttpContextAccessor>().HttpContext?.User;
    return new AuditExecutionContext(
        Guid.TryParse(user?.FindFirstValue("tenant_id"), out var tenantId) ? tenantId : null,
        Guid.TryParse(user?.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId) ? userId : null,
        "erp-api");
});
builder.Services.AddHostedService<AuditRetentionWorker>();
builder.Services.AddHostedService<TcmbExchangeRateWorker>();
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
builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().AddRequirements(new PermissionRequirement()).Build();
    options.AddPolicy("PlatformModuleMaintainer", policy => policy.RequireAuthenticatedUser().RequireAssertion(context =>
        context.User.FindAll("platform_role").Any(x => x.Value is "PlatformDeveloper" or "PlatformSuperAdmin" or "PlatformReleaseManager")));
    options.AddPolicy("PlatformModulePublisher", policy => policy.RequireAuthenticatedUser().RequireAssertion(context =>
        context.User.FindAll("platform_role").Any(x => x.Value is "PlatformSuperAdmin" or "PlatformReleaseManager")));
    options.AddPolicy("PlatformSuperAdmin", policy => policy.RequireAuthenticatedUser().RequireClaim("platform_role", "PlatformSuperAdmin"));
});
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddRateLimiter(o =>
{
    o.AddFixedWindowLimiter("login", x => { x.PermitLimit = 10; x.Window = TimeSpan.FromMinutes(1); x.QueueLimit = 0; });
    o.AddFixedWindowLimiter("module-invoke", x => { x.PermitLimit = 12; x.Window = TimeSpan.FromSeconds(10); x.QueueLimit = 0; });
    o.AddFixedWindowLimiter("integration-execute", x => { x.PermitLimit = 6; x.Window = TimeSpan.FromSeconds(10); x.QueueLimit = 0; });
    o.AddPolicy("ai-assistant", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
    LiveAiEvaluationEndpoints.ConfigureRateLimiting(o);
});
var frontendOrigins = builder.Configuration.GetSection("Frontend:Origins").Get<string[]>() ?? [builder.Configuration["Frontend:Origin"] ?? "http://localhost:5173"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(frontendOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddOpenApi();
var app = builder.Build();
app.UseExceptionHandler();
app.UseAierpSecurityHeaders();
app.UseAierpHttpMetrics();
if (args.Contains("--migrate-only", StringComparer.Ordinal))
{
    var platformDatabaseWasCreatedDuringBootstrap = !await PlatformDatabaseExistsAsync(connectionString);
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
    await BaselineEnsureCreatedDatabaseAsync(db);
    await db.Database.MigrateAsync();
    await SeedBootstrapUserAsync(db, builder.Configuration);
    if (!string.IsNullOrWhiteSpace(builder.Configuration["Database:PlatformRuntimeLogin"]))
        await TenantDatabaseProvisioner.GrantDatabaseRuntimeAccessAsync(connectionString, "AIERPPlatform", builder.Configuration["Database:PlatformRuntimeLogin"]!, cancellationToken: CancellationToken.None);
    await ProvisionAllTenantDatabasesAsync(connectionString, builder.Configuration["Database:DataRuntimeLogin"] ?? "aierp_data_runtime", builder.Configuration["Database:SeparationBackupPath"], platformDatabaseWasCreatedDuringBootstrap);
    return;
}
var provisionArgument = args.FirstOrDefault(x => x.StartsWith("--provision-tenant=", StringComparison.Ordinal));
if (provisionArgument is not null)
{
    if (!Guid.TryParse(provisionArgument["--provision-tenant=".Length..], out var provisionTenantId))
        throw new ArgumentException("Use --provision-tenant=<tenant-guid>.");
    await new TenantDatabaseProvisioner(connectionString, separationBackupPath: builder.Configuration["Database:SeparationBackupPath"]).ProvisionAsync(provisionTenantId);
    return;
}
if (args.Contains("--create-company", StringComparer.Ordinal))
{
    var tenantId = await CreateCompanyForProvisioningAsync(connectionString, builder.Configuration);
    await new TenantDatabaseProvisioner(connectionString, separationBackupPath: builder.Configuration["Database:SeparationBackupPath"])
        .ProvisionAsync(tenantId);
    Console.WriteLine($"Company database is Ready. TenantId={tenantId:D}; Database=AIERPTenant_{tenantId:N}");
    return;
}
if (args.Contains("--verify-separation-backup", StringComparer.Ordinal))
{
    await new TenantDatabaseProvisioner(connectionString, separationBackupPath: builder.Configuration["Database:SeparationBackupPath"])
        .VerifySeparationBackupAsync();
    return;
}
if (args.Contains("--verify-separation", StringComparer.Ordinal))
{
    await TenantDatabaseSeparationVerifier.VerifyAllAsync(connectionString);
    return;
}
if (args.Contains("--legacy-tenant-data-purge-preview", StringComparer.Ordinal) || args.Contains("--purge-legacy-tenant-data", StringComparer.Ordinal))
{
    var purge = args.Contains("--purge-legacy-tenant-data", StringComparer.Ordinal);
    if (purge && !args.Contains("--confirm-legacy-tenant-data-purge=I_HAVE_VERIFIED_BACKUP_AND_COPIES", StringComparer.Ordinal))
        throw new ArgumentException("Destructive cutover requires --confirm-legacy-tenant-data-purge=I_HAVE_VERIFIED_BACKUP_AND_COPIES.");

    // A fresh checksum-verified full backup is required on both preview and execution;
    // this explicit command is never invoked by normal API startup or migrations.
    await new TenantDatabaseProvisioner(connectionString, separationBackupPath: builder.Configuration["Database:SeparationBackupPath"])
        .VerifySeparationBackupAsync();
    var purger = new LegacyTenantDataPurger(connectionString);
    var report = purge ? await purger.PurgeAsync() : await purger.PreviewAsync();
    Console.WriteLine($"Legacy tenant-data {(purge ? "purge completed" : "purge preview")}: tenants={report.TenantCount}; operationalRows={report.TotalRows}; tables={report.Tables.Count}.");
    foreach (var table in report.Tables)
        Console.WriteLine($"{table.Schema}.{table.Table}: {table.Rows}");
    return;
}
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.UseCors(); app.UseAuthentication(); app.UseRateLimiter();
app.Use(async (context, next) =>
{
    await TenantDatabaseRouting.ResolveRequestAsync(context, app.Services, tenantConnectionString);
    if (context.Items.ContainsKey(TenantDatabaseRouting.TenantSelectionRequiredKey))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { error = "tenant_selection_required", message = "Select an active company before accessing company data." });
        return;
    }
    if (context.Items.ContainsKey("AIERP.TenantDatabaseUnavailable"))
    {
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { error = "tenant_database_not_ready", message = "Tenant database provisioning has not completed." });
        return;
    }
    await next();
});
app.UseAuthorization();
app.MapAccessControlEndpoints();
app.MapCustomFormEndpoints();
app.MapTenantScreenViewEndpoints();
app.MapWorkflowEndpoints();
app.MapBusinessRuleEndpoints();
app.MapReportEndpoints();
app.MapDashboardWidgetEndpoints();
app.MapCustomMenuEndpoints();
app.MapCrmEndpoints();
app.MapManufacturingEndpoints();
app.MapHumanResourcesEndpoints();
app.MapFixedAssetEndpoints();
app.MapTenantOperationalSettingsEndpoints();
app.MapTenantCompanyProfileEndpoints();
app.MapTenantBudgetEndpoints();
app.MapTenantCashForecastEndpoints();
app.MapDirectCashBudgetEndpoints();
app.MapFinanceCreditFacilityEndpoints();
app.MapTenantLicenseEndpoints();
app.MapPaymentInstrumentEndpoints();
app.MapInventoryTrackingInquiryEndpoints();
app.MapSalesOrderEndpoints();
app.MapSalesPromotionEndpoints();
app.MapSalesPlanningInquiryEndpoints();
app.MapPurchaseInvoiceEntryEndpoints();
app.MapPurchaseInvoiceDraftEndpoints();
app.MapPurchaseDeliveryNoteEndpoints();
app.MapForeignTradeEndpoints();
app.MapCommercialContractEndpoints();
app.MapOperationalProjectEndpoints();
app.MapIntegrationExecutionApi();

if (app.Environment.IsDevelopment() && builder.Configuration.GetValue("Database:ApplyMigrationsOnStartup", true))
{
    var platformDatabaseWasCreatedDuringBootstrap = !await PlatformDatabaseExistsAsync(connectionString);
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
    await BaselineEnsureCreatedDatabaseAsync(db);
    await db.Database.MigrateAsync();
    await SeedBootstrapUserAsync(db, builder.Configuration);
    await ProvisionAllTenantDatabasesAsync(connectionString, builder.Configuration["Database:DataRuntimeLogin"] ?? "aierp_data_runtime", builder.Configuration["Database:SeparationBackupPath"], platformDatabaseWasCreatedDuringBootstrap);
}

app.MapGet("/health", async (PlatformDbContext db, CancellationToken cancellationToken) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync(cancellationToken))
            return Results.Json(new { status = "not_ready", service = "platform-api", dependency = "platform-database" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        return Results.Ok(new { status = "ready", service = "platform-api", dependency = "platform-database" });
    }
    catch
    {
        return Results.Json(new { status = "not_ready", service = "platform-api", dependency = "platform-database" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});
var auth = app.MapGroup("/api/auth").WithTags("Authentication");
auth.MapPost("/login", async (LoginRequest request, PlatformDbContext db, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password)) return Results.BadRequest(new { error = "Email and password are required." });
    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.Users.Include(x => x.Memberships).ThenInclude(x => x.Tenant).SingleOrDefaultAsync(x => x.Email == email && x.IsActive);
    if (user is null || !PasswordHashing.Verify(request.Password, user.PasswordHash))
    {
        db.AuditEvents.Add(new AuditEvent { Action = "auth.login.failed", Resource = "credentials-rejected" });
        await db.SaveChangesAsync();
        return Results.Unauthorized();
    }
    var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim("name", user.DisplayName),
        new Claim("email", user.Email), new Claim("session", "tenant-selection") };
    var token = TokenIssuer.Issue(claims, config);
    var platformAdminAvailable = await db.PlatformUserRoles.AsNoTracking()
        .AnyAsync(x => x.UserId == user.Id && x.Role == "PlatformSuperAdmin");
    db.AuditEvents.Add(new AuditEvent { UserId = user.Id, Action = "auth.login", Resource = "session" });
    await db.SaveChangesAsync();
    return Results.Ok(new { accessToken = token, displayName = user.DisplayName, platformAdminAvailable,
        tenants = user.Memberships.Where(m => m.Tenant.IsActive).Select(m => new TenantSummary(m.TenantId, m.Tenant.Name, m.Tenant.Slug, m.Role)) });
}).RequireRateLimiting("login");

auth.MapSelectTenantEndpoint();
auth.MapRefreshEndpoint();
auth.MapLogoutEndpoint();
auth.MapPlatformAdminSessionEndpoints();
app.MapTenantProvisioningEndpoints();
var moduleCatalog = app.MapGroup("/api/platform/modules").WithTags("Platform Module Catalog");
moduleCatalog.MapGet("/", async (PlatformDbContext db) => Results.Ok(await db.PlatformModuleReleases.AsNoTracking()
    .OrderBy(x => x.ModuleCode).ThenByDescending(x => x.CreatedAt)
    .Select(x => new { x.Id, x.ModuleCode, x.Version, x.Publisher, x.ArtifactSha256, x.KeyId, x.Status, x.CreatedAt, x.PublishedAt, x.RevokedAt, x.RevocationReason }).ToListAsync()))
    .RequireAuthorization("PlatformModuleMaintainer");
moduleCatalog.MapPost("/publisher-keys", async (PublisherKeyWriteRequest request, ClaimsPrincipal user, PlatformDbContext db) =>
{
    var publisher = request.Publisher?.Trim(); var keyId = request.KeyId?.Trim(); var pem = request.PublicKeyPem?.Trim();
    if (string.IsNullOrWhiteSpace(publisher) || publisher.Length > 120 || string.IsNullOrWhiteSpace(keyId) || keyId.Length > 80 || string.IsNullOrWhiteSpace(pem) || pem.Length > 4096)
        return Results.BadRequest(new { error = "publisher, keyId ve 4096 karakteri aşmayan publicKeyPem gereklidir." });
    try { using var rsa = RSA.Create(); rsa.ImportFromPem(pem); if (rsa.KeySize < 2048) return Results.BadRequest(new { error = "Yayıncı anahtarı en az 2048 bit RSA olmalı." }); }
    catch (CryptographicException) { return Results.BadRequest(new { error = "RSA public key PEM geçersiz." }); }
    if (!Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId)) return Results.Unauthorized();
    if (await db.PlatformModulePublisherKeys.AnyAsync(x => x.Publisher == publisher && x.KeyId == keyId)) return Results.Conflict(new { error = "Bu yayıncı anahtar kimliği zaten kayıtlı." });
    db.PlatformModulePublisherKeys.Add(new PlatformModulePublisherKey { Publisher = publisher, KeyId = keyId, PublicKeyPem = pem, CreatedByUserId = userId });
    db.AuditEvents.Add(new AuditEvent { UserId = userId, Action = "module.publisher-key.created", Resource = $"{publisher}/{keyId}" });
    await db.SaveChangesAsync(); return Results.Created($"/api/platform/modules/publisher-keys/{publisher}/{keyId}", new { publisher, keyId });
}).RequireAuthorization("PlatformSuperAdmin");
moduleCatalog.MapGet("/publisher-keys", async (PlatformDbContext db) => Results.Ok(await db.PlatformModulePublisherKeys.AsNoTracking()
    .OrderBy(x => x.Publisher).ThenBy(x => x.KeyId)
    .Select(x => new { x.Publisher, x.KeyId, x.IsActive, x.CreatedAt, x.CreatedByUserId }).ToListAsync()))
    .RequireAuthorization("PlatformSuperAdmin");
moduleCatalog.MapDelete("/publisher-keys/{publisher}/{keyId}", async (string publisher, string keyId, ClaimsPrincipal user, PlatformDbContext db) =>
{
    var key = await db.PlatformModulePublisherKeys.SingleOrDefaultAsync(x => x.Publisher == publisher && x.KeyId == keyId);
    if (key is null) return Results.NotFound();
    if (!key.IsActive) return Results.NoContent();
    key.IsActive = false;
    db.AuditEvents.Add(new AuditEvent { UserId = Guid.Parse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!), Action = "module.publisher-key.revoked", Resource = $"{publisher}/{keyId}" });
    await db.SaveChangesAsync(); return Results.NoContent();
}).RequireAuthorization("PlatformSuperAdmin");
moduleCatalog.MapPost("/roles", async (PlatformRoleWriteRequest request, ClaimsPrincipal user, PlatformDbContext db) =>
{
    var email = request.Email?.Trim().ToLowerInvariant(); var role = request.Role?.Trim();
    if (string.IsNullOrWhiteSpace(email) || role is not ("PlatformDeveloper" or "PlatformReleaseManager"))
        return Results.BadRequest(new { error = "Email ve PlatformDeveloper veya PlatformReleaseManager rolü gereklidir. SuperAdmin yalnız yapılandırma ile atanır." });
    var target = await db.Users.SingleOrDefaultAsync(x => x.Email == email && x.IsActive);
    if (target is null) return Results.NotFound(new { error = "Aktif kullanıcı bulunamadı." });
    if (await db.PlatformUserRoles.AnyAsync(x => x.UserId == target.Id && x.Role == role)) return Results.Conflict(new { error = "Rol zaten atanmış." });
    var actorId = Guid.Parse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
    db.PlatformUserRoles.Add(new PlatformUserRole { UserId = target.Id, Role = role, AssignedByUserId = actorId });
    db.AuditEvents.Add(new AuditEvent { UserId = actorId, Action = "platform.role.assigned", Resource = $"{target.Email}:{role}" });
    await db.SaveChangesAsync(); return Results.Created($"/api/platform/modules/roles/{target.Id}/{role}", new { target.Email, role });
}).RequireAuthorization("PlatformSuperAdmin");
moduleCatalog.MapPost("/releases", async (HttpRequest request, ClaimsPrincipal user, PlatformDbContext db, IConfiguration config, IHttpClientFactory clients, ILogger<Program> logger, CancellationToken ct) =>
{
    const long maximumPackageBytes = 25L * 1024 * 1024;
    if (request.ContentLength is > maximumPackageBytes + 100_000) return Results.BadRequest(new { error = "Modül paketi en fazla 25 MiB olabilir." });
    if (!request.HasFormContentType) return Results.BadRequest(new { error = "multipart/form-data gereklidir." });
    var form = await request.ReadFormAsync(ct); var artifact = form.Files.GetFile("artifact");
    if (artifact is null || artifact.Length == 0 || artifact.Length > maximumPackageBytes) return Results.BadRequest(new { error = "artifact dosyası boş veya 25 MiB sınırını aşıyor." });
    if (form["manifest"].ToString() is not { Length: > 0 and <= 65_536 } manifestJson) return Results.BadRequest(new { error = "manifest alanı gereklidir ve 64 KiB sınırını aşamaz." });
    ModuleManifest? manifest;
    try { manifest = JsonSerializer.Deserialize<ModuleManifest>(manifestJson, new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
    catch (JsonException) { return Results.BadRequest(new { error = "manifest JSON geçersiz." }); }
    if (manifest is null) return Results.BadRequest(new { error = "manifest JSON geçersiz." });
    var keyId = form["keyId"].ToString(); var checksum = form["artifactSha256"].ToString(); var signature = form["signatureBase64"].ToString();
    var package = new SignedModulePackage(manifest, keyId, checksum, signature);
    byte[] packageBytes;
    await using (var source = artifact.OpenReadStream())
    using (var buffer = new MemoryStream((int)artifact.Length))
    {
        await source.CopyToAsync(buffer, ct);
        packageBytes = buffer.ToArray();
    }
    try { _ = ModulePackageArchive.ExtractWasm(packageBytes); }
    catch (InvalidDataException exception) { return Results.BadRequest(new { error = exception.Message }); }
    catch (InvalidOperationException) { return Results.BadRequest(new { error = "Modül ZIP paketi geçersiz." }); }
    var verification = await ModulePackageVerifier.VerifyAsync(package, new MemoryStream(packageBytes, writable: false), new DatabaseModulePublisherKeyResolver(db), ct);
    if (!verification.IsValid) return Results.BadRequest(new { error = verification.Error });
    if (!Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId)) return Results.Unauthorized();
    if (await db.PlatformModuleReleases.AnyAsync(x => x.ModuleCode == manifest.ModuleCode && x.Version == manifest.Version, ct)) return Results.Conflict(new { error = "Bu modül sürümü katalogda zaten var." });
    var root = Path.GetFullPath(config["ModulePackages:RootPath"] ?? "/module-packages");
    var storageKey = checksum.ToLowerInvariant() + ".zip";
    using var packageLease = await ModulePackageUploadCoordinator.AcquireAsync(checksum, ct);
    var packageCreatedByThisUpload = false;
    var releaseRegistered = false;
    try
    {
        string destination;
        try
        {
            ModulePackageStoragePath.AssertNoReparsePoints(root);
            Directory.CreateDirectory(root);
            destination = ModulePackageStoragePath.ResolvePackage(root, checksum);
        }
        catch (InvalidDataException) { return Results.Problem("Modül paketi deposu güvenli değil.", statusCode: StatusCodes.Status500InternalServerError); }
        if (!File.Exists(destination))
        {
            var temporary = ModulePackageStoragePath.ResolveChild(root, $".{Guid.NewGuid():N}.upload");
            try
            {
                await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.WriteThrough))
                    await output.WriteAsync(packageBytes, ct);
                try
                {
                    File.Move(temporary, destination, overwrite: false);
                    packageCreatedByThisUpload = true;
                }
                catch (IOException) when (File.Exists(destination))
                {
                    // Another API process may have installed the same immutable hash.
                    // This request did not create that package, so it must never delete it.
                }
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }

        if (!TryPluginHostUri(config, out var pluginHostUri)) return Results.Problem("PluginHost yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
        try
        {
            using var client = clients.CreateClient("plugin-host"); client.BaseAddress = pluginHostUri;
            using var validationRequest = new HttpRequestMessage(HttpMethod.Post, "/internal/modules/validate");
            validationRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",
                TokenIssuer.IssueForAudience(PluginHostClaims("module.validate", manifest.ModuleCode, manifest.Version, checksum.ToLowerInvariant()), config, "AIERP.PluginHost", TimeSpan.FromMinutes(1), config["PluginHost:SigningKey"]!));
            using var validationResponse = await client.SendAsync(validationRequest, ct);
            if (validationResponse.StatusCode == HttpStatusCode.UnprocessableEntity)
                return Results.BadRequest(new { error = "Modül WebAssembly dosyası AIERP çalışma zamanı sözleşmesini karşılamıyor." });
            if (!validationResponse.IsSuccessStatusCode)
                return Results.Problem("PluginHost modül doğrulaması başarısız oldu.", statusCode: StatusCodes.Status502BadGateway);
        }
        catch (HttpRequestException) { return Results.Problem("PluginHost hizmetine ulaşılamadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
        catch (TaskCanceledException) { return Results.Problem("PluginHost doğrulaması zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
        var release = new PlatformModuleRelease { ModuleCode = manifest.ModuleCode, Version = manifest.Version, Publisher = manifest.Publisher,
            ManifestJson = ModulePackageVerifier.SerializeManifest(manifest), ArtifactSha256 = checksum.ToLowerInvariant(), SignatureBase64 = signature, KeyId = keyId,
            StorageKey = storageKey, RuntimeKind = "wasm-core-no-imports", RuntimeValidatedAt = DateTimeOffset.UtcNow, CreatedByUserId = userId };
        db.PlatformModuleReleases.Add(release);
        db.AuditEvents.Add(new AuditEvent { UserId = userId, Action = "module.release.uploaded", Resource = $"{manifest.ModuleCode}@{manifest.Version}" });
        await db.SaveChangesAsync(ct);
        releaseRegistered = true;
        return Results.Created($"/api/platform/modules/releases/{release.Id}", new { release.Id, release.ModuleCode, release.Version, release.Status, release.ArtifactSha256 });
    }
    finally
    {
        if (packageCreatedByThisUpload && !releaseRegistered)
        {
            // SaveChanges can fail after the database has committed (for example, a
            // dropped response). Preserve any package referenced by a durable release.
            var isReferenced = true;
            try
            {
                isReferenced = await db.PlatformModuleReleases.AsNoTracking()
                    .AnyAsync(x => x.StorageKey == storageKey && x.ArtifactSha256 == checksum.ToLowerInvariant(), CancellationToken.None);
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Could not confirm module package {StorageKey} is unreferenced; keeping it for safety.", storageKey);
            }
            if (!isReferenced)
            {
                try { ModulePackageUploadCoordinator.DeleteOwnedPackage(root, checksum, createdByThisUpload: true); }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidDataException)
                { logger.LogWarning(exception, "Could not remove unreferenced module package {StorageKey} after failed upload.", storageKey); }
            }
        }
    }
}).RequireAuthorization("PlatformModuleMaintainer");
moduleCatalog.MapPost("/releases/{id:guid}/publish", async (Guid id, ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
{
    var release = await db.PlatformModuleReleases.SingleOrDefaultAsync(x => x.Id == id, ct);
    if (release is null) return Results.NotFound();
    if (release.Status != "Draft") return Results.Conflict(new { error = "Yalnızca taslak sürüm yayınlanabilir." });
    if (Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId) && release.CreatedByUserId == userId)
        return Results.Conflict(new { error = "Yayınlayan kişi kendi yüklediği sürümü onaylayamaz." });
    release.Status = "Published"; release.PublishedByUserId = Guid.Parse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!); release.PublishedAt = DateTimeOffset.UtcNow;
    db.AuditEvents.Add(new AuditEvent { UserId = release.PublishedByUserId, Action = "module.release.published", Resource = $"{release.ModuleCode}@{release.Version}" });
    await db.SaveChangesAsync(ct); return Results.Ok(new { release.Id, release.Status, release.PublishedAt });
}).RequireAuthorization("PlatformModulePublisher");
moduleCatalog.MapPost("/releases/{id:guid}/revoke", async (Guid id, ModuleRevocationRequest request, ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
{
    var release = await db.PlatformModuleReleases.SingleOrDefaultAsync(x => x.Id == id, ct);
    if (release is null) return Results.NotFound();
    if (release.Status != "Published") return Results.Conflict(new { error = "Yalnızca yayınlanmış sürüm iptal edilebilir." });
    if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 500) return Results.BadRequest(new { error = "İptal nedeni 1-500 karakter olmalı." });
    release.Status = "Revoked"; release.RevocationReason = request.Reason.Trim(); release.RevokedAt = DateTimeOffset.UtcNow;
    db.AuditEvents.Add(new AuditEvent { UserId = Guid.Parse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!), Action = "module.release.revoked", Resource = $"{release.ModuleCode}@{release.Version}: {release.RevocationReason}" });
    await db.SaveChangesAsync(ct); return Results.Ok(new { release.Id, release.Status, release.RevokedAt });
}).RequireAuthorization("PlatformModulePublisher");
var tenantModules = app.MapGroup("/api/tenant/modules").WithTags("Tenant Module Marketplace").RequireAuthorization();
tenantModules.MapGet("/marketplace", async (ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
{
    if (!TryGetTenantId(user, out var tenantId)) return Results.Forbid();
    var activations = await db.TenantModuleActivations.AsNoTracking().Where(x => x.TenantId == tenantId)
        .ToDictionaryAsync(x => x.ModuleCode, cancellationToken: ct);
    var releases = await db.PlatformModuleReleases.AsNoTracking().Where(x => x.Status == "Published")
        .OrderBy(x => x.ModuleCode).ThenByDescending(x => x.PublishedAt).ToListAsync(ct);
    var latest = releases.GroupBy(x => x.ModuleCode, StringComparer.Ordinal).Select(x => x.First());
    var items = latest.Select(x => new
    {
        x.ModuleCode, x.Version, x.Publisher, x.ArtifactSha256, x.PublishedAt,
        Manifest = JsonSerializer.Deserialize<ModuleManifest>(x.ManifestJson, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
        IsActivated = activations.TryGetValue(x.ModuleCode, out var activation),
        ActivatedVersion = activation?.Version,
        RuntimeStatus = x.RuntimeKind == "wasm-core-no-imports" && x.RuntimeValidatedAt is not null ? "Ready" : "Unsupported"
    }).ToList();
    return Results.Ok(items);
});
tenantModules.MapGet("/", async (ClaimsPrincipal user, PlatformDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
{
    if (!TryGetTenantId(user, out var tenantId) || GetUserId(user) is not Guid userId || user.FindFirstValue("role") is not { Length: > 0 } role)
        return Results.Forbid();
    var items = await (from activation in db.TenantModuleActivations.AsNoTracking()
                       join release in db.PlatformModuleReleases.AsNoTracking()
                         on new { activation.ModuleCode, activation.Version } equals new { release.ModuleCode, release.Version }
                       where activation.TenantId == tenantId && release.Status == "Published"
                       orderby activation.ModuleCode
                       select new { activation.ModuleCode, activation.Version, activation.ActivatedAt, Manifest = release.ManifestJson,
                           RuntimeStatus = release.RuntimeKind == "wasm-core-no-imports" && release.RuntimeValidatedAt != null ? "Ready" : "Unsupported" }).ToListAsync(ct);
    var visible = new List<object>();
    foreach (var item in items.Where(x => x.RuntimeStatus == "Ready"))
    {
        ModuleManifest manifest;
        try { manifest = JsonSerializer.Deserialize<ModuleManifest>(item.Manifest, new JsonSerializerOptions(JsonSerializerDefaults.Web))!; }
        catch (JsonException) { return Results.Problem("Etkin modül manifesti okunamadı.", statusCode: StatusCodes.Status409Conflict); }
        if (manifest is null) return Results.Problem("Etkin modül manifesti boş.", statusCode: StatusCodes.Status409Conflict);
        var definitions = ModulePermissionPolicy.FromManifest(manifest);
        var allowedEntries = new List<ModuleMenuEntry>();
        foreach (var entry in manifest.MenuEntries)
        {
            var declared = definitions.SingleOrDefault(x => x.ModulePermissionCode == entry.PermissionCode);
            if (declared is null) continue;
            var permission = new ResolvedPlatformPermission(declared.Policy,
                ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, entry.Code));
            if (await authorizer.IsAllowedAsync(tenantId, userId, role, permission, ct)) allowedEntries.Add(entry);
        }
        visible.Add(new { item.ModuleCode, item.Version, item.ActivatedAt,
            Manifest = manifest with { MenuEntries = allowedEntries }, item.RuntimeStatus });
    }
    return Results.Ok(visible);
});
tenantModules.MapPost("/activate", async (TenantModuleActivationRequest request, ClaimsPrincipal user, PlatformDbContext db,
    IHttpClientFactory clients, IConfiguration config, CancellationToken ct) =>
{
    if (!TryGetTenantId(user, out var tenantId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (string.IsNullOrWhiteSpace(request.ModuleCode) || string.IsNullOrWhiteSpace(request.Version)) return Results.BadRequest(new { error = "Modül kodu ve sürümü gereklidir." });
    var targetRelease = await db.PlatformModuleReleases.SingleOrDefaultAsync(x => x.ModuleCode == request.ModuleCode && x.Version == request.Version && x.Status == "Published", ct);
    if (targetRelease is null) return Results.NotFound(new { error = "Yayınlanmış modül sürümü bulunamadı." });
    if (targetRelease.RuntimeKind != "wasm-core-no-imports") return Results.Conflict(new { error = "Bu modül sürümünde doğrulanmış çalıştırılabilir WASM modülü yok." });
    var (moduleWasm, moduleError) = await VerifyModuleReleaseArtifactAsync(db, config, targetRelease, ct);
    if (moduleWasm is null) return Results.Conflict(new { error = moduleError });
    if (!TryPluginHostUri(config, out var pluginHostUri)) return Results.Problem("PluginHost yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("plugin-host"); client.BaseAddress = pluginHostUri;
        using var validationRequest = new HttpRequestMessage(HttpMethod.Post, "/internal/modules/validate");
        validationRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",
            TokenIssuer.IssueForAudience(PluginHostClaims("module.validate", targetRelease.ModuleCode, targetRelease.Version, targetRelease.ArtifactSha256, userId: GetUserId(user)), config, "AIERP.PluginHost", TimeSpan.FromMinutes(1), config["PluginHost:SigningKey"]!));
        using var validationResponse = await client.SendAsync(validationRequest, ct);
        if (!validationResponse.IsSuccessStatusCode) return Results.Conflict(new { error = "PluginHost modül runtime doğrulamasını tamamlayamadı." });
    }
    catch (HttpRequestException) { return Results.Problem("PluginHost hizmetine ulaşılamadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (TaskCanceledException) { return Results.Problem("PluginHost doğrulaması zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    var current = await (from installed in db.TenantModuleActivations.AsNoTracking()
                         join release in db.PlatformModuleReleases.AsNoTracking()
                           on new { installed.ModuleCode, installed.Version } equals new { release.ModuleCode, release.Version }
                         where installed.TenantId == tenantId && installed.ModuleCode != request.ModuleCode && release.Status == "Published"
                         select release.ManifestJson).ToListAsync(ct);
    var manifests = new List<ModuleManifest>();
    try
    {
        manifests.AddRange(current.Select(json => JsonSerializer.Deserialize<ModuleManifest>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!));
        manifests.Add(JsonSerializer.Deserialize<ModuleManifest>(targetRelease.ManifestJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!);
    }
    catch (JsonException) { return Results.Problem("Katalogda geçersiz modül manifesti bulundu.", statusCode: StatusCodes.Status409Conflict); }
    if (manifests.Any(x => x is null)) return Results.Problem("Katalogda geçersiz modül manifesti bulundu.", statusCode: StatusCodes.Status409Conflict);
    var resolution = ModuleDependencyResolver.Resolve(request.ModuleCode, manifests);
    if (!resolution.IsValid) return Results.Conflict(new { error = "Modül bağımlılıkları karşılanmıyor.", details = resolution.Errors });
    var installedDependents = manifests.Where(x => x.ModuleCode != request.ModuleCode && x.Dependencies.Any(d => d.ModuleCode == request.ModuleCode)).ToList();
    foreach (var dependent in installedDependents)
    {
        var dependentResolution = ModuleDependencyResolver.Resolve(dependent.ModuleCode, manifests);
        if (!dependentResolution.IsValid)
            return Results.Conflict(new { error = $"Sürüm değişikliği etkin {dependent.ModuleCode} modülünün bağımlılıklarını karşılamıyor.", details = dependentResolution.Errors });
    }
    var targetManifest = manifests.Single(x => x.ModuleCode == request.ModuleCode);
    var declaredPermissions = ModulePermissionPolicy.FromManifest(targetManifest);
    var declaredCodes = declaredPermissions.Select(x => x.Entity.Code).ToArray();
    var existingPermissions = await db.PermissionDefinitions.Where(x => declaredCodes.Contains(x.Code)).ToDictionaryAsync(x => x.Code, ct);
    foreach (var declared in declaredPermissions)
    {
        if (existingPermissions.TryGetValue(declared.Entity.Code, out var existing))
        {
            if (existing.ResourceType != declared.Entity.ResourceType || existing.Action != declared.Entity.Action)
                return Results.Conflict(new { error = "Modül izni, kayıtlı başka bir kaynak tanımıyla çakışıyor." });
            existing.Description = declared.Entity.Description;
        }
        else db.PermissionDefinitions.Add(declared.Entity);
    }
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();
    await using var activationTransaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
    // Serialize quota-consuming module writes on the same tenant license row used by
    // license replacement. Taking this lock first avoids concurrent activations of
    // different module codes deadlocking while each holds serializable range locks
    // on TenantModuleActivations and then attempts to insert into that range.
    var quotaLockResult = await TenantLicenseEndpoints.AcquireTenantQuotaLockAsync(db, tenantId, ct);
    if (quotaLockResult < 0)
        return Results.Conflict(new { error = "Another company license or quota change is in progress. Retry the request.", code = "tenant.concurrent_write" });
    var license = db.Database.IsSqlServer()
        ? await db.TenantLicenses.FromSqlInterpolated($"SELECT * FROM [dbo].[TenantLicenses] WITH (XLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId}").SingleOrDefaultAsync(ct)
        : await db.TenantLicenses.SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
    var activation = await db.TenantModuleActivations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ModuleCode == request.ModuleCode, ct);
    if (activation is null)
    {
        if (license is not null && license.ExpiresAt <= DateTimeOffset.UtcNow)
            return Results.Conflict(new { error = "Firma lisansının süresi dolmuş. Yeni modül etkinleştirmek için lisansı yenileyin.", code = "license.expired" });
        if (license is not null && !LicenseTierCatalog.IsValidStoredLicense(license))
            return Results.Conflict(new { error = "Firma lisansı geçersiz. Yeni modül etkinleştirmek için geçerli bir lisans etkinleştirin.", code = "license.invalid" });
        var limit = license?.MaxCustomModules ?? LicenseTierCatalog.All["Small"].MaxCustomModules;
        var activeCount = await db.TenantModuleActivations.CountAsync(x => x.TenantId == tenantId, ct);
        if (activeCount >= limit)
            return Results.Conflict(new { error = $"Firma lisansındaki özel modül sınırına ({limit}) ulaşıldı.", code = "license.module_limit", limit, activeCount, tier = license?.Tier ?? "Small" });
        activation = new TenantModuleActivation { TenantId = tenantId, ModuleCode = request.ModuleCode, Version = request.Version, ActivatedByUserId = userId.Value };
        db.TenantModuleActivations.Add(activation);
    }
    else { activation.Version = request.Version; activation.ActivatedByUserId = userId.Value; activation.ActivatedAt = DateTimeOffset.UtcNow; }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "module.tenant.activated", Resource = $"{request.ModuleCode}@{request.Version}" });
    await db.SaveChangesAsync(ct);
    await activationTransaction.CommitAsync(ct);
    return Results.Ok(new { activation.ModuleCode, activation.Version, activation.ActivatedAt, runtimeStatus = "Ready", installOrder = resolution.InstallOrder.Select(x => x.ModuleCode) });
}).RequireAuthorization();
tenantModules.MapPost("/{moduleCode}/invoke", async (string moduleCode, TenantModuleInvocationRequest request, ClaimsPrincipal user,
    PlatformDbContext db, TenantDbContext tenantDb, IHttpClientFactory clients, IConfiguration config, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
{
    if (!TryGetTenantId(user, out var tenantId) || GetUserId(user) is not Guid userId) return Results.Forbid();
    var action = request.Action?.Trim();
    if (!ModuleManifestValidator.IsValidModuleCode(moduleCode) || string.IsNullOrWhiteSpace(action) || action.Length > 80 ||
        !char.IsAsciiLetterLower(action[0]) || action.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '.') ||
        request.Input.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        return Results.BadRequest(new { error = "Modül kodu, eylem ve JSON girdisi geçerli olmalıdır." });
    var activation = await db.TenantModuleActivations.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ModuleCode == moduleCode, ct);
    if (activation is null) return Results.NotFound(new { error = "Modül bu tenant için etkinleştirilmemiş." });
    var currentLicense = await db.TenantLicenses.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
    if (currentLicense is not null && currentLicense.ExpiresAt <= DateTimeOffset.UtcNow)
        return Results.Conflict(new { error = "Firma lisansının süresi dolmuş. Özel modülleri çalıştırmak için lisansı yenileyin.", code = "license.expired" });
    if (currentLicense is not null && !LicenseTierCatalog.IsValidStoredLicense(currentLicense))
        return Results.Conflict(new { error = "Firma lisansı geçersiz. Özel modülleri çalıştırmak için geçerli bir lisans etkinleştirin.", code = "license.invalid" });
    var release = await db.PlatformModuleReleases.AsNoTracking()
        .SingleOrDefaultAsync(x => x.ModuleCode == activation.ModuleCode && x.Version == activation.Version && x.Status == "Published", ct);
    if (release is null) return Results.Conflict(new { error = "Modül sürümü artık yayımlanmış değil." });
    if (release.RuntimeKind != "wasm-core-no-imports") return Results.Conflict(new { error = "Modülün izole runtime paketi kullanılamıyor." });
    var (moduleWasm, moduleError) = await VerifyModuleReleaseArtifactAsync(db, config, release, ct);
    if (moduleWasm is null) return Results.Conflict(new { error = moduleError });
    ModuleManifest manifest;
    try { manifest = JsonSerializer.Deserialize<ModuleManifest>(release.ManifestJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!; }
    catch (JsonException) { return Results.Conflict(new { error = "Modül manifesti okunamadı." }); }
    if (manifest is null || manifest.ModuleCode != release.ModuleCode) return Results.Conflict(new { error = "Modül manifesti katalog sürümüyle eşleşmiyor." });
    var manifestValidation = ModuleManifestValidator.Validate(manifest);
    if (!manifestValidation.IsValid) return Results.Conflict(new { error = "Modül manifesti geçersiz.", details = manifestValidation.Errors });
    var menuEntry = manifest.MenuEntries.SingleOrDefault(x => x.Code == action);
    var modulePermission = menuEntry is null ? null : ModulePermissionPolicy.FromManifest(manifest)
        .SingleOrDefault(x => x.ModulePermissionCode == menuEntry.PermissionCode);
    var role = user.FindFirstValue("role");
    if (modulePermission is null || string.IsNullOrWhiteSpace(role)) return Results.Forbid();
    var resolvedPermission = new ResolvedPlatformPermission(modulePermission.Policy,
        ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, menuEntry!.Code));
    if (!await authorizer.IsAllowedAsync(tenantId, userId, role, resolvedPermission, ct)) return Results.Forbid();
    if (JsonSerializer.SerializeToUtf8Bytes(new { action, input = request.Input }).Length > 256 * 1024)
        return Results.BadRequest(new { error = "Modül girdisi 256 KiB sınırını aşıyor." });
    if (request.Capabilities?.Any(capability => capability is null || menuEntry.View?.DataCapabilities?.Contains(capability.Code, StringComparer.Ordinal) != true) == true)
        return Results.BadRequest(new { error = "İstenen veri capability’si bu menü eyleminin imzalı görünümünde tanımlı değil." });
    var capabilityRead = await ModuleDataCapabilityReader.ReadAsync(manifest, request.Capabilities, tenantId, userId, role, tenantDb, authorizer, ct);
    if (capabilityRead.Forbidden)
    {
        var deniedCapabilities = request.Capabilities is { Count: > 0 } ? string.Join(',', request.Capabilities.Select(x => x.Code)) : "unknown";
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "module.tenant.capability-denied", Resource = $"{moduleCode}:{action}:{deniedCapabilities}" });
        await db.SaveChangesAsync(ct);
        return Results.Forbid();
    }
    if (!capabilityRead.Allowed) return Results.BadRequest(new { error = capabilityRead.Error });
    var moduleInput = request.Capabilities is { Count: > 0 }
        ? JsonSerializer.SerializeToElement(new { input = request.Input, capabilities = capabilityRead.Data }, new JsonSerializerOptions(JsonSerializerDefaults.Web))
        : request.Input;
    var encodedInput = JsonSerializer.SerializeToUtf8Bytes(new { action, input = moduleInput });
    if (encodedInput.Length > 256 * 1024) return Results.BadRequest(new { error = "Modül girdisi 256 KiB sınırını aşıyor." });
    if (!TryPluginHostUri(config, out var pluginHostUri)) return Results.Problem("PluginHost yapılandırılmamış.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        using var client = clients.CreateClient("plugin-host"); client.BaseAddress = pluginHostUri;
        using var invocation = new HttpRequestMessage(HttpMethod.Post, "/internal/modules/invoke")
        {
            Content = System.Net.Http.Json.JsonContent.Create(new ModuleInvocationRequest(action, moduleInput))
        };
        invocation.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",
            TokenIssuer.IssueForAudience(PluginHostClaims("module.invoke", release.ModuleCode, release.Version, release.ArtifactSha256, tenantId, userId), config, "AIERP.PluginHost", TimeSpan.FromMinutes(1), config["PluginHost:SigningKey"]!));
        using var response = await client.SendAsync(invocation, ct);
        if (response.StatusCode == HttpStatusCode.UnprocessableEntity) return Results.Problem("Modül çağrısı runtime sözleşmesine uymadı veya sandbox sınırını aştı.", statusCode: StatusCodes.Status422UnprocessableEntity);
        if (!response.IsSuccessStatusCode) return Results.Problem("İzole modül çalıştırması tamamlanamadı.", statusCode: StatusCodes.Status502BadGateway);
        var result = await response.Content.ReadFromJsonAsync<PluginHostInvocationResponse>(cancellationToken: ct);
        if (result is null) return Results.Problem("PluginHost geçersiz modül sonucu döndürdü.", statusCode: StatusCodes.Status502BadGateway);
        var capabilityCodes = request.Capabilities is { Count: > 0 } ? $":capabilities={string.Join(',', request.Capabilities.Select(x => x.Code))}" : string.Empty;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "module.tenant.invoked", Resource = $"{moduleCode}@{activation.Version}:{action}{capabilityCodes}" });
        await db.SaveChangesAsync(ct);
        return Results.Ok(result);
    }
    catch (HttpRequestException) { return Results.Problem("PluginHost hizmetine ulaşılamadı.", statusCode: StatusCodes.Status503ServiceUnavailable); }
    catch (TaskCanceledException) { return Results.Problem("Modül çağrısı zaman aşımına uğradı.", statusCode: StatusCodes.Status504GatewayTimeout); }
    catch (JsonException) { return Results.Problem("PluginHost geçersiz JSON sonucu döndürdü.", statusCode: StatusCodes.Status502BadGateway); }
}).RequireAuthorization().RequireRateLimiting("module-invoke");
tenantModules.MapDelete("/{moduleCode}", async (string moduleCode, ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct) =>
{
    if (!TryGetTenantId(user, out var tenantId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var activation = await db.TenantModuleActivations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ModuleCode == moduleCode, ct);
    if (activation is null) return Results.NotFound();
    var dependents = await (from installed in db.TenantModuleActivations.AsNoTracking()
                            join release in db.PlatformModuleReleases.AsNoTracking()
                              on new { installed.ModuleCode, installed.Version } equals new { release.ModuleCode, release.Version }
                            where installed.TenantId == tenantId && installed.ModuleCode != moduleCode
                            select release.ManifestJson).ToListAsync(ct);
    foreach (var json in dependents)
    {
        var manifest = JsonSerializer.Deserialize<ModuleManifest>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        if (manifest?.Dependencies.Any(x => x.ModuleCode == moduleCode) == true)
            return Results.Conflict(new { error = $"{manifest.ModuleCode} modülü bu modüle bağlı; önce bağımlı modülü devre dışı bırakın." });
    }
    var userId = GetUserId(user);
    db.TenantModuleActivations.Remove(activation);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "module.tenant.deactivated", Resource = $"{activation.ModuleCode}@{activation.Version}" });
    await db.SaveChangesAsync(ct); return Results.NoContent();
}).RequireAuthorization();
auth.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { user = user.Identity?.Name, tenantId = user.FindFirstValue("tenant_id"), roles = user.FindAll("role").Select(x => x.Value) })).RequireAuthorization();
app.MapGet("/api/dashboard", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
    var tenant = await db.Tenants.Where(t => t.Id == tenantId && t.IsActive).Select(t => t.Name).SingleOrDefaultAsync();
    if (tenant is null) return Results.Forbid();
    var openRequests = await db.DevelopmentRequests.CountAsync(r => r.TenantId == tenantId && r.Status != "Completed");
    return Results.Ok(new DashboardSummary(tenant, openRequests, "Platform API ready"));
}).RequireAuthorization();
app.MapGet("/api/ai-settings", async (ClaimsPrincipal principal, PlatformDbContext db, IConfiguration configuration) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var settings = await db.TenantAIProviderSettings.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId);
    return Results.Ok(new AIProviderSettingsView(settings?.Provider ?? "OpenAI", settings?.OpenAIKeyCipherText is not null,
        settings?.OpenAIModel ?? "gpt-6-astra", settings?.NvidiaKeyCipherText is not null, settings?.NvidiaModel ?? "",
        configuration.GetValue<bool>("AI:LiveEvaluation:Enabled")));
}).RequireAuthorization();
app.MapPut("/api/ai-settings", async (AIProviderSettingsWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db, IConfiguration configuration) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var provider = request.Provider?.Trim();
    if (provider is not ("OpenAI" or "NVIDIA"))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["provider"] = ["OpenAI veya NVIDIA seçin."] });
    if (request.OpenAIKey?.Length > 1024 || request.NvidiaKey?.Length > 1024 || request.OpenAIModel?.Trim().Length is > 200 || request.NvidiaModel?.Trim().Length is > 200)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["settings"] = ["API anahtarı veya model adı izin verilen uzunluğu aşıyor."] });
    if (!ApiKeyCipher.IsConfigured(configuration))
        return Results.Problem("API anahtarlarını güvenli saklamak için AI_SETTINGS_ENCRYPTION_KEY yapılandırılmalı.", statusCode: StatusCodes.Status503ServiceUnavailable);

    var settings = await db.TenantAIProviderSettings.SingleOrDefaultAsync(x => x.TenantId == tenantId);
    if (settings is null)
    {
        settings = new TenantAIProviderSettings { TenantId = tenantId };
        db.TenantAIProviderSettings.Add(settings);
    }
    if (request.ClearOpenAIKey) settings.OpenAIKeyCipherText = null;
    else if (!string.IsNullOrWhiteSpace(request.OpenAIKey)) settings.OpenAIKeyCipherText = ApiKeyCipher.Encrypt(request.OpenAIKey.Trim(), tenantId, ApiKeyPurpose.OpenAiApiKey, configuration);
    if (request.ClearNvidiaKey) settings.NvidiaKeyCipherText = null;
    else if (!string.IsNullOrWhiteSpace(request.NvidiaKey)) settings.NvidiaKeyCipherText = ApiKeyCipher.Encrypt(request.NvidiaKey.Trim(), tenantId, ApiKeyPurpose.NvidiaApiKey, configuration);
    settings.OpenAIModel = request.OpenAIModel?.Trim() ?? settings.OpenAIModel;
    var model = request.NvidiaModel?.Trim() ?? "";
    if (model.Length > 200) return Results.ValidationProblem(new Dictionary<string, string[]> { ["nvidiaModel"] = ["Model adı en fazla 200 karakter olabilir."] });
    settings.NvidiaModel = model;
    settings.Provider = provider;
    settings.UpdatedAt = DateTimeOffset.UtcNow;
    if (provider == "OpenAI" && settings.OpenAIKeyCipherText is null)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["openAIKey"] = ["OpenAI seçiliyken bir OpenAI API anahtarı kaydedin."] });
    if (provider == "NVIDIA" && (settings.NvidiaKeyCipherText is null || string.IsNullOrWhiteSpace(settings.NvidiaModel)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["nvidiaKey"] = ["NVIDIA seçiliyken API anahtarı ve model adı gereklidir."] });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "ai.provider.settings.updated", Resource = provider });
    await db.SaveChangesAsync();
    return Results.Ok(new AIProviderSettingsView(settings.Provider, settings.OpenAIKeyCipherText is not null,
        settings.OpenAIModel, settings.NvidiaKeyCipherText is not null, settings.NvidiaModel,
        configuration.GetValue<bool>("AI:LiveEvaluation:Enabled")));
}).RequireAuthorization();
app.MapPost("/api/ai-settings/erp-assistant", async (ERPAssistantProxyRequest request, HttpContext context,
    IHttpClientFactory clients, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Question) || request.Question.Trim().Length > 2000)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["question"] = ["Soru gerekli ve en fazla 2000 karakter olabilir."] });
    using var forwarded = new HttpRequestMessage(HttpMethod.Post, "/api/ai/erp-assistant")
    {
        Content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json")
    };
    if (context.Request.Headers.Authorization.Count != 1) return Results.Unauthorized();
    forwarded.Headers.Authorization = System.Net.Http.Headers.AuthenticationHeaderValue.Parse(context.Request.Headers.Authorization.ToString());
    using var response = await clients.CreateClient("ai-service").SendAsync(forwarded, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    var content = await response.Content.ReadAsStringAsync(cancellationToken);
    return Results.Content(content, response.Content.Headers.ContentType?.MediaType ?? "application/json", statusCode: (int)response.StatusCode);
}).RequireAuthorization().RequireRateLimiting("ai-assistant");
LiveAiEvaluationEndpoints.Map(app);
app.MapPost("/api/ai-settings/openai-models", async (OpenAIModelsRequest request, ClaimsPrincipal principal, PlatformDbContext db, IConfiguration configuration, IHttpClientFactory clients, CancellationToken cancellationToken) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var settings = await db.TenantAIProviderSettings.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
    var apiKey = !string.IsNullOrWhiteSpace(request.ApiKey)
        ? request.ApiKey.Trim()
        : settings?.OpenAIKeyCipherText is { Length: > 0 } cipherText
            ? ApiKeyCipher.Decrypt(cipherText, tenantId, ApiKeyPurpose.OpenAiApiKey, configuration)
            : null;
    if (string.IsNullOrWhiteSpace(apiKey))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["openAIKey"] = ["Önce OpenAI API anahtarını girin."] });

    using var message = new HttpRequestMessage(HttpMethod.Get, "https://api.openai.com/v1/models");
    message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    message.Headers.Accept.ParseAdd("application/json");
    using var response = await clients.CreateClient("openai-models").SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["openAIKey"] = ["OpenAI anahtarı kabul edilmedi. Anahtarı kontrol edip yeniden deneyin."] });
    if (!response.IsSuccessStatusCode)
        return Results.Problem("OpenAI model listesi şu anda alınamadı. Biraz sonra yeniden deneyin.", statusCode: StatusCodes.Status502BadGateway);

    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
    using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    var models = document.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array
        ? data.EnumerateArray()
            .Where(item => item.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String)
            .Select(item => item.GetProperty("id").GetString()!)
            .Where(id => IsOpenAITextModel(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(id => id, StringComparer.OrdinalIgnoreCase)
            .Take(300)
            .ToArray()
        : [];
    if (models.Length == 0)
        return Results.Problem("OpenAI bu anahtar için kullanılabilir metin modeli döndürmedi.", statusCode: StatusCodes.Status502BadGateway);
    return Results.Ok(new OpenAIModelsView(models));
}).RequireAuthorization();
app.MapPost("/api/ai-settings/nvidia-models", async (NvidiaModelsRequest request, ClaimsPrincipal principal, PlatformDbContext db, IConfiguration configuration, IHttpClientFactory clients, CancellationToken cancellationToken) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var settings = await db.TenantAIProviderSettings.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, cancellationToken);
    var apiKey = !string.IsNullOrWhiteSpace(request.ApiKey)
        ? request.ApiKey.Trim()
        : settings?.NvidiaKeyCipherText is { Length: > 0 } cipherText
            ? ApiKeyCipher.Decrypt(cipherText, tenantId, ApiKeyPurpose.NvidiaApiKey, configuration)
            : null;
    if (string.IsNullOrWhiteSpace(apiKey))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["nvidiaKey"] = ["Önce NVIDIA API anahtarını girin."] });

    using var message = new HttpRequestMessage(HttpMethod.Get, "https://integrate.api.nvidia.com/v1/models");
    message.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
    message.Headers.Accept.ParseAdd("application/json");
    using var response = await clients.CreateClient("nvidia-models").SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["nvidiaKey"] = ["NVIDIA anahtarı kabul edilmedi. Anahtarı kontrol edip yeniden deneyin."] });
    if (!response.IsSuccessStatusCode)
        return Results.Problem("NVIDIA model listesi şu anda alınamadı. Biraz sonra yeniden deneyin.", statusCode: StatusCodes.Status502BadGateway);

    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
    using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    var models = document.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array
        ? data.EnumerateArray()
            .Where(item => item.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String)
            .Select(item => item.GetProperty("id").GetString()!)
            .Where(id => !string.IsNullOrWhiteSpace(id) && IsNvidiaChatModel(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(id => id, StringComparer.OrdinalIgnoreCase)
            .Take(300)
            .ToArray()
        : [];
    if (models.Length == 0)
        return Results.Problem("NVIDIA bu anahtar için kullanılabilir model döndürmedi.", statusCode: StatusCodes.Status502BadGateway);
    return Results.Ok(new NvidiaModelsView(models));
}).RequireAuthorization();
app.MapGet("/api/audit-events", async (ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 50, DateOnly? from = null, DateOnly? to = null, string? q = null) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (from is { } fromDate && to is { } toDate && fromDate > toDate)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."] });
    if (to == DateOnly.MaxValue) return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["Bitiş tarihi desteklenen son günden önce olmalıdır."] });
    page = Math.Clamp(page, 1, 1_000_000); pageSize = Math.Clamp(pageSize, 1, 100);
    q = string.IsNullOrWhiteSpace(q) ? null : q.Trim();
    if (q?.Length > 120) return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["Arama en fazla 120 karakter olabilir."] });
    var query = db.AuditEvents.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (from is { } start) query = query.Where(x => x.OccurredAt >= new DateTimeOffset(start.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)));
    if (to is { } end) query = query.Where(x => x.OccurredAt <= new DateTimeOffset(end.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc)));
    if (q is not null) query = query.Where(x => x.Action.Contains(q) || x.Resource.Contains(q));
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.OccurredAt).ThenByDescending(x => x.Id)
        .Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new
        {
            x.Id, x.Action, x.Resource, x.UserId, x.OccurredAt,
            DisplayName = db.Users.Where(user => user.Id == x.UserId).Select(user => user.DisplayName).FirstOrDefault()
        }).ToListAsync();
    var items = rows.Select(x => new AuditEventView(x.Id, x.Action, AuditResourceSanitizer.Sanitize(x.Resource), x.UserId,
        x.DisplayName, x.OccurredAt)).ToList();
    return Results.Ok(new AuditEventPage(items, page, pageSize, total));
}).RequireAuthorization();

var auditRetention = app.MapGroup("/api/audit-retention").RequireAuthorization();
auditRetention.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var settings = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
        .Select(x => new AuditRetentionPolicyView(x.AuditRetentionDays, 30, 3650, x.AuditLastPurgeAt)).SingleOrDefaultAsync();
    return settings is null ? Results.NotFound() : Results.Ok(settings);
});
auditRetention.MapPut("/", async (AuditRetentionPolicyWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (request.RetentionDays is < 30 or > 3650)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["retentionDays"] = ["Saklama süresi 30 ile 3650 gün arasında olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    var previous = tenant.AuditRetentionDays;
    if (previous != request.RetentionDays)
    {
        tenant.AuditRetentionDays = request.RetentionDays;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal),
            Action = "audit.retention.updated", Resource = $"days={previous}->{request.RetentionDays}" });
        await db.SaveChangesAsync();
    }
    await transaction.CommitAsync();
    return Results.Ok(new AuditRetentionPolicyView(tenant.AuditRetentionDays, 30, 3650, tenant.AuditLastPurgeAt));
});

var customers = app.MapGroup("/api/customers").WithTags("Cari Yönetimi").RequireAuthorization();
customers.MapCustomerBalanceEndpoint();
var customerGroups = app.MapGroup("/api/customer-groups").WithTags("Cari Grupları").RequireAuthorization();
customers.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var fields = await db.CustomerCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new CustomerCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(fields);
});
customers.MapPost("/custom-fields", async (CustomerCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") ||
        string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.CustomerCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu cari özel alan kodu bu firmada zaten kullanılıyor." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    if (body.IsRequired && await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Mevcut cari kartları için değerler tamamlanmadan yeni bir alan zorunlu açılamaz. Önce isteğe bağlı oluşturup kartları doldurun." });
    var definition = new CustomerCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.CustomerCustomFieldDefinitions.Add(definition);
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu cari özel alan kodu bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/customers/custom-fields/{definition.Id}", new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
customers.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, CustomerCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120) return Results.ValidationProblem(new Dictionary<string, string[]> { ["label"] = ["Alan etiketi zorunludur ve en fazla 120 karakter olabilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Devre dışı cari alan düzenlenemez." });
    if (definition.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 arasında olmalıdır."] });
    var isRequired = body.IsRequired ?? definition.IsRequired;
    if (isRequired && await db.CustomerAccounts.AnyAsync(customer => customer.TenantId == tenantId && !db.CustomerCustomFieldValues.Any(value => value.TenantId == tenantId && value.CustomerId == customer.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Alanı zorunlu yapmak için mevcut tüm cari kartlarında değer bulunmalıdır." });
    var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    if (definition.DataType == CustomFieldDataType.Text && await db.CustomerCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength))
        return Results.Conflict(new { error = "Mevcut değerler yeni metin sınırını aşıyor." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == isRequired)
        return Results.Ok(new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = isRequired; definition.Version++;
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
customers.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerCustomFieldDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.CustomerCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50)
        .Select(x => new CustomerCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
customers.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, CustomerCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation || body.Version < 1) return Results.BadRequest(new { error = "Geçerli sürüm ve açık geri yükleme onayı gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.CustomerCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Veri türü geri yüklemeyle değiştirilemez." });
    if (revision.IsActive && revision.DataType == CustomFieldDataType.Text && await db.CustomerCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Geçmiş sürümün metin sınırı mevcut değerlerle uyumsuz." });
    if (revision.IsActive && revision.IsRequired && await db.CustomerAccounts.AnyAsync(customer => customer.TenantId == tenantId && !db.CustomerCustomFieldValues.Any(value => value.TenantId == tenantId && value.CustomerId == customer.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Bu tanımı zorunlu yapmak için tüm mevcut carilerde değer gerekir." });
    if (definition.Label == revision.Label && definition.MaxLength == revision.MaxLength && definition.IsRequired == revision.IsRequired && definition.IsActive == revision.IsActive)
        return Results.Conflict(new { error = "Cari özel alan tanımı zaten bu sürümle aynı." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.restored", Resource = $"{definition.Code}:v{body.Version}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
customers.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Cari özel alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++;
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.NoContent();
});
customers.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var definitions = await db.CustomerCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var values = await db.CustomerCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id).ToDictionaryAsync(x => x.DefinitionId);
    return Results.Ok(definitions.Select(x => new CustomerCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength,
        values.TryGetValue(x.Id, out var value) && value.DefinitionVersion > 0 ? value.DefinitionVersion : x.Version, x.IsRequired,
        values.GetValueOrDefault(x.Id)?.Value ?? "")).ToArray());
});
customers.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var definition = await db.CustomerCustomFieldDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId);
    if (definition is null) return Results.NotFound();
    var history = await db.CustomerCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.CreatedAt).Take(50)
        .Select(x => new CustomerCustomFieldValueRevisionView(x.Id, x.DefinitionId, definition.Code, definition.Label, x.PreviousValue, x.NewValue, x.DefinitionVersion, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
customers.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, CustomerCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Değer geri yükleme için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId} AND [IsActive] = 1").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var revision = await db.CustomerCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CustomerId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (revision is null) return Results.NotFound();
    var rawTargetValue = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawTargetValue, out var targetValue))
        return Results.Conflict(new { error = "Geçmiş değer güncel alan tanımıyla uyumlu değil." });
    if (definition.IsRequired && targetValue.Length == 0) return Results.Conflict(new { error = "Zorunlu alanın boş değeri geri yüklenemez." });
    var current = await db.CustomerCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CustomerId == id && x.DefinitionId == definitionId);
    var previousValue = current?.Value;
    if (string.Equals(previousValue ?? "", targetValue, StringComparison.Ordinal)) return Results.Conflict(new { error = "Cari özel alan değeri zaten bu durumda." });
    if (targetValue.Length == 0)
    {
        if (current is not null) db.CustomerCustomFieldValues.Remove(current);
    }
    else if (current is null)
        db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = tenantId, CustomerId = id, DefinitionId = definitionId, Value = targetValue, DefinitionVersion = definition.Version });
    else { current.Value = targetValue; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = tenantId, CustomerId = id, DefinitionId = definitionId, PreviousValue = previousValue, NewValue = targetValue.Length == 0 ? null : targetValue, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.value-restored", Resource = $"{customer.Code}:{definition.Code}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new CustomerCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, targetValue));
});
customers.MapPut("/{id:guid}/custom-fields", async (Guid id, CustomerCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is null || body.Values.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (body.Values.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !byCode.ContainsKey(x))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["Bilinmeyen veya etkin olmayan bir cari özel alan kodu gönderildi."] });
    var normalized = new Dictionary<Guid, (CustomerCustomFieldDefinition Definition, string Value)>();
    foreach (var (fieldCode, rawValue) in body.Values)
    {
        var definition = byCode[fieldCode];
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{fieldCode}"] = [$"'{definition.Label}' alanı değer türü veya uzunluk sınırına uymuyor."] });
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(definition => definition.IsRequired && !normalized.ContainsKey(definition.Id));
    if (missingRequired is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var definitionIds = definitions.Select(x => x.Id).ToHashSet();
    var existing = await db.CustomerCustomFieldValues.Where(x => x.TenantId == tenantId && x.CustomerId == id && definitionIds.Contains(x.DefinitionId)).ToListAsync();
    var previousByDefinition = existing.ToDictionary(x => x.DefinitionId, x => x.Value);
    foreach (var definition in definitions)
    {
        var previous = previousByDefinition.GetValueOrDefault(definition.Id);
        var next = normalized.GetValueOrDefault(definition.Id).Value;
        if (string.Equals(previous ?? "", next ?? "", StringComparison.Ordinal)) continue;
        db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = tenantId, CustomerId = id, DefinitionId = definition.Id,
            PreviousValue = string.IsNullOrEmpty(previous) ? null : previous, NewValue = string.IsNullOrEmpty(next) ? null : next,
            DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.CustomerCustomFieldValues.RemoveRange(existing);
    foreach (var (definitionId, entry) in normalized)
        db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = tenantId, CustomerId = id, DefinitionId = definitionId, Value = entry.Value, DefinitionVersion = entry.Definition.Version });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.values-updated", Resource = customer.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(definitions.Select(x => new CustomerCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, normalized.GetValueOrDefault(x.Id).Value ?? "")).ToArray());
});
customerGroups.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var items = await db.CustomerGroups.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderBy(x => x.Name).Select(x => new CustomerGroupView(x.Id, x.Code, x.Name, x.IsActive)).ToListAsync();
    return Results.Ok(items);
});
customerGroups.MapPost("/", async (CustomerGroupWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var code = request.Code?.Trim().ToUpperInvariant() ?? ""; var name = request.Name?.Trim() ?? "";
    var errors = new Dictionary<string, string[]>();
    if (code.Length is 0 or > 40) errors["code"] = ["Grup kodu zorunludur ve en fazla 40 karakter olabilir."];
    if (name.Length is 0 or > 120) errors["name"] = ["Grup adı zorunludur ve en fazla 120 karakter olabilir."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    if (await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu grup kodu bu firmada zaten kullanılıyor." });
    var group = new CustomerGroup { TenantId = tenantId, Code = code, Name = name };
    db.CustomerGroups.Add(group);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-group.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu grup kodu bu firmada zaten kullanılıyor." }); }
    return Results.Created($"/api/customer-groups/{group.Id}", new CustomerGroupView(group.Id, group.Code, group.Name, group.IsActive));
});
customerGroups.MapPut("/{id:guid}", async (Guid id, CustomerGroupWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var group = await db.CustomerGroups.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (group is null) return Results.NotFound();
    var code = request.Code?.Trim().ToUpperInvariant() ?? ""; var name = request.Name?.Trim() ?? "";
    var errors = new Dictionary<string, string[]>();
    if (code.Length is 0 or > 40) errors["code"] = ["Grup kodu zorunludur ve en fazla 40 karakter olabilir."];
    if (name.Length is 0 or > 120) errors["name"] = ["Grup adı zorunludur ve en fazla 120 karakter olabilir."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    if (await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code))
        return Results.Conflict(new { error = "Bu grup kodu bu firmada zaten kullanılıyor." });
    group.Code = code; group.Name = name;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-group.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu grup kodu bu firmada zaten kullanılıyor." }); }
    return Results.Ok(new CustomerGroupView(group.Id, group.Code, group.Name, group.IsActive));
});
customerGroups.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var group = await db.CustomerGroups.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (group is null) return Results.NotFound();
    if (await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.GroupId == id))
        return Results.Conflict(new { error = "Bu gruba bağlı cari kartları var. Önce bu kartları başka bir gruba taşıyın veya grup alanını boşaltın." });
    db.CustomerGroups.Remove(group);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-group.deleted", Resource = group.Code });
    await db.SaveChangesAsync();
    return Results.NoContent();
});
customers.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await CustomerCollectionPermissionFilter.ApplyAsync(platformDb, tenantId, userId.Value,
        principal.FindFirstValue("role") ?? string.Empty, query, ct);
    if (!string.IsNullOrWhiteSpace(q))
    {
        var term = q.Trim();
        query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) || (x.TaxNumber != null && x.TaxNumber.Contains(term)));
    }
    var total = await query.CountAsync();
    var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Code).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new CustomerView(x.Id, x.Code, x.Name, x.Type, x.TaxNumber, x.IsActive, x.CreatedAt, x.RowVersion,
            x.GroupId, x.Group == null ? null : x.Group.Name, x.CurrencyCode, x.RiskLimit, x.PaymentTermDays)).ToListAsync();
    return Results.Ok(new CustomerPage(items, page, pageSize, total));
});
customers.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var customer = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new CustomerView(x.Id, x.Code, x.Name, x.Type, x.TaxNumber, x.IsActive, x.CreatedAt, x.RowVersion,
            x.GroupId, x.Group == null ? null : x.Group.Name, x.CurrencyCode, x.RiskLimit, x.PaymentTermDays)).SingleOrDefaultAsync();
    return customer is null ? Results.NotFound() : Results.Ok(customer);
});
customers.MapPost("/", async (CustomerWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var validation = CustomerValidation.Validate(request);
    if (validation is not null) return Results.ValidationProblem(validation);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." });
    if (request.GroupId is { } groupId && !await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Id == groupId && x.IsActive))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["groupId"] = ["Seçilen cari grubu bulunamadı veya pasif."] });
    if (request.CustomFields?.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var definitionsByCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    var requestedValues = request.CustomFields ?? new Dictionary<string, string?>();
    if (requestedValues.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !definitionsByCode.ContainsKey(x)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["Bilinmeyen veya etkin olmayan bir cari özel alan kodu gönderildi."] });
    var normalizedValues = new Dictionary<Guid, (CustomerCustomFieldDefinition Definition, string Value)>();
    foreach (var (fieldCode, rawValue) in requestedValues)
    {
        var definition = definitionsByCode[fieldCode];
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{fieldCode}"] = [$"'{definition.Label}' alanı değer türü veya uzunluk sınırına uymuyor."] });
        if (value.Length > 0) normalizedValues[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(x => x.IsRequired && !normalizedValues.ContainsKey(x.Id));
    if (missingRequired is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var customer = new CustomerAccount { TenantId = tenantId, Code = code, Name = request.Name.Trim(), Type = request.Type,
        TaxNumber = NormalizeTaxNumber(request.TaxNumber), IsActive = request.IsActive, GroupId = request.GroupId,
        CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant(), RiskLimit = request.RiskLimit, PaymentTermDays = request.PaymentTermDays };
    db.CustomerAccounts.Add(customer);
    foreach (var (definitionId, entry) in normalizedValues)
    {
        db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = tenantId, CustomerId = customer.Id, DefinitionId = definitionId, Value = entry.Value, DefinitionVersion = entry.Definition.Version });
        db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = tenantId, CustomerId = customer.Id, DefinitionId = definitionId, NewValue = entry.Value, DefinitionVersion = entry.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    var view = new CustomerView(customer.Id, customer.Code, customer.Name, customer.Type, customer.TaxNumber, customer.IsActive, customer.CreatedAt,
        customer.RowVersion, customer.GroupId, null, customer.CurrencyCode, customer.RiskLimit, customer.PaymentTermDays);
    return Results.Created($"/api/customers/{customer.Id}", view);
});
customers.MapPut("/{id:guid}", async (Guid id, CustomerWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var validation = CustomerValidation.Validate(request);
    if (validation is not null) return Results.ValidationProblem(validation);
    if (request.RowVersion is null || request.RowVersion.Length == 0)
        return Results.BadRequest(new { error = "RowVersion is required to prevent overwriting a concurrent edit." });
    if (request.GroupId is { } groupId && !await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Id == groupId && x.IsActive))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["groupId"] = ["Seçilen cari grubu bulunamadı veya pasif."] });
    var customer = await db.CustomerAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (customer is null) return Results.NotFound();
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code))
        return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." });
    customer.Code = code; customer.Name = request.Name.Trim(); customer.Type = request.Type;
    customer.TaxNumber = NormalizeTaxNumber(request.TaxNumber); customer.IsActive = request.IsActive; customer.GroupId = request.GroupId;
    customer.CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant(); customer.RiskLimit = request.RiskLimit; customer.PaymentTermDays = request.PaymentTermDays;
    db.Entry(customer).Property(x => x.RowVersion).OriginalValue = request.RowVersion;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Cari kart başka bir oturumda değiştirildi. Kaydı yenileyip tekrar deneyin." }); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." }); }
    return Results.Ok(new CustomerView(customer.Id, customer.Code, customer.Name, customer.Type, customer.TaxNumber, customer.IsActive, customer.CreatedAt,
        customer.RowVersion, customer.GroupId, null, customer.CurrencyCode, customer.RiskLimit, customer.PaymentTermDays));
});
customers.MapGet("/{id:guid}/addresses", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var addresses = await db.CustomerAddresses.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id)
        .OrderByDescending(x => x.IsDefault).ThenBy(x => x.Label)
        .Select(x => new CustomerAddressView(x.Id, x.Kind, x.Label, x.AddressLine, x.City, x.District, x.PostalCode, x.CountryCode, x.IsDefault, x.IsActive)).ToListAsync();
    return Results.Ok(addresses);
});
customers.MapPost("/{id:guid}/addresses", async (Guid id, CustomerAddressWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var errors = CustomerAddressValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var makeDefault = request.IsDefault && request.IsActive;
    if (makeDefault)
    {
        var previousDefaults = await db.CustomerAddresses.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Kind == request.Kind && x.IsDefault).ToListAsync();
        foreach (var previous in previousDefaults) previous.IsDefault = false;
    }
    var address = new CustomerAddress { TenantId = tenantId, CustomerId = id, Kind = request.Kind, Label = request.Label.Trim(),
        AddressLine = request.AddressLine.Trim(), City = request.City.Trim(), District = NormalizeTaxNumber(request.District),
        PostalCode = NormalizeTaxNumber(request.PostalCode), CountryCode = request.CountryCode.Trim().ToUpperInvariant(), IsDefault = makeDefault, IsActive = request.IsActive };
    db.CustomerAddresses.Add(address);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-address.created", Resource = id.ToString() });
    await db.SaveChangesAsync();
    return Results.Created($"/api/customers/{id}/addresses/{address.Id}", ToAddressView(address));
});
customers.MapPut("/{id:guid}/addresses/{addressId:guid}", async (Guid id, Guid addressId, CustomerAddressWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var address = await db.CustomerAddresses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CustomerId == id && x.Id == addressId);
    if (address is null) return Results.NotFound();
    var errors = CustomerAddressValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var makeDefault = request.IsDefault && request.IsActive;
    if (makeDefault)
    {
        var previousDefaults = await db.CustomerAddresses.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Kind == request.Kind && x.Id != addressId && x.IsDefault).ToListAsync();
        foreach (var previous in previousDefaults) previous.IsDefault = false;
    }
    address.Kind = request.Kind; address.Label = request.Label.Trim(); address.AddressLine = request.AddressLine.Trim(); address.City = request.City.Trim();
    address.District = NormalizeTaxNumber(request.District); address.PostalCode = NormalizeTaxNumber(request.PostalCode);
    address.CountryCode = request.CountryCode.Trim().ToUpperInvariant(); address.IsDefault = makeDefault; address.IsActive = request.IsActive;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-address.updated", Resource = id.ToString() });
    await db.SaveChangesAsync();
    return Results.Ok(ToAddressView(address));
});
customers.MapGet("/{id:guid}/statement", async (Guid id, DateOnly from, DateOnly to, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (to < from) return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."] });
    var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (customer is null) return Results.NotFound();
    var ledger = db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id);
    var openingDebit = await ledger.Where(x => x.EntryDate < from && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var openingCredit = await ledger.Where(x => x.EntryDate < from && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var openingBalance = openingDebit - openingCredit;
    var entries = await ledger.Where(x => x.EntryDate >= from && x.EntryDate <= to)
        .OrderBy(x => x.EntryDate).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
        .Select(x => new { x.Id, x.EntryDate, x.Direction, x.Amount, x.CurrencyCode, x.Description, x.ReversalOfId,
            HasReversal = db.CustomerLedgerEntries.Any(y => y.TenantId == x.TenantId && y.ReversalOfId == x.Id) })
        .ToListAsync();
    var runningBalance = openingBalance;
    var items = entries.Select(x =>
    {
        runningBalance += x.Direction == CustomerLedgerDirection.Debit ? x.Amount : -x.Amount;
        return new CustomerStatementLine(x.Id, x.EntryDate, x.Direction, x.Amount, x.CurrencyCode, x.Description,
            x.ReversalOfId, x.HasReversal, runningBalance);
    }).ToList();
    var debitTotal = entries.Where(x => x.Direction == CustomerLedgerDirection.Debit).Sum(x => x.Amount);
    var creditTotal = entries.Where(x => x.Direction == CustomerLedgerDirection.Credit).Sum(x => x.Amount);
    return Results.Ok(new CustomerStatementView(customer.Id, customer.Code, customer.Name, customer.CurrencyCode,
        from, to, openingBalance, debitTotal, creditTotal, runningBalance, items));
});
customers.MapGet("/{id:guid}/ledger", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, DateOnly? from, DateOnly? to, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id);
    if (from is not null) query = query.Where(x => x.EntryDate >= from);
    if (to is not null) query = query.Where(x => x.EntryDate <= to);
    var total = await query.CountAsync();
    var items = await query.OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new CustomerLedgerView(x.Id, x.EntryDate, x.Direction, x.Amount, x.CurrencyCode, x.Description,
            x.ReversalOfId, x.ReversalOfId != null, db.CustomerLedgerEntries.Any(y => y.TenantId == x.TenantId && y.ReversalOfId == x.Id))).ToListAsync();
    return Results.Ok(new CustomerLedgerPage(items, page, pageSize, total));
});
customers.MapPost("/{id:guid}/ledger", async (Guid id, CustomerLedgerWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = CustomerLedgerValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    if (!customer.IsActive) return Results.Conflict(new { error = "Pasif cari hesaba yeni hareket eklenemez." });
    var currencyCode = request.CurrencyCode.Trim().ToUpperInvariant();
    if (currencyCode != customer.CurrencyCode) return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Hareket dövizi cari döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
    if (request.Direction == CustomerLedgerDirection.Debit && customer.RiskLimit is { } limit && customer.Type is CounterpartyType.Customer or CounterpartyType.Both)
    {
        var currentDebit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var currentCredit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var projectedBalance = currentDebit - currentCredit + request.Amount;
        if (projectedBalance > limit) return Results.Conflict(new { error = "Hareket risk limitini aşacağı için kaydedilmedi.", currentBalance = currentDebit - currentCredit, projectedBalance, riskLimit = limit });
    }
    var entry = new CustomerLedgerEntry { TenantId = tenantId, CustomerId = id, EntryDate = request.EntryDate, Direction = request.Direction,
        Amount = request.Amount, CurrencyCode = currencyCode, Description = request.Description.Trim() };
    db.CustomerLedgerEntries.Add(entry);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-ledger.created", Resource = id.ToString() });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/customers/{id}/ledger/{entry.Id}", new CustomerLedgerView(entry.Id, entry.EntryDate, entry.Direction, entry.Amount, entry.CurrencyCode, entry.Description, null, false, false));
});
customers.MapPost("/{id:guid}/ledger/{entryId:guid}/reverse", async (Guid id, Guid entryId, CustomerLedgerReverseRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = CustomerLedgerValidation.ValidateReversal(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {id} AND [Id] = {entryId}").SingleOrDefaultAsync();
    if (original is null) return Results.NotFound();
    if (original.ReversalOfId is not null) return Results.Conflict(new { error = "Bir ters kayıt yeniden ters çevrilemez." });
    if (original.SalesInvoiceId is not null) return Results.Conflict(new { error = "Fatura kaynaklı cari hareket, fatura iptal işlemiyle geri alınmalıdır." });
    if (original.CustomerCollectionId is not null) return Results.Conflict(new { error = "Tahsilat kaynaklı cari hareket, tahsilat iptal işlemiyle geri alınmalıdır." });
    if (original.SalesReturnId is not null) return Results.Conflict(new { error = "Satış iadesi kaynaklı cari hareket, iade iptal işlemiyle geri alınmalıdır." });
    if (original.PurchaseInvoiceId is not null) return Results.Conflict(new { error = "Alış faturası kaynaklı cari hareket, alış faturası iptal işlemiyle geri alınmalıdır." });
    if (original.SupplierPaymentId is not null) return Results.Conflict(new { error = "Tedarikçi ödemesi kaynaklı cari hareket, ödeme iptal işlemiyle geri alınmalıdır." });
    if (original.SupplierReturnId is not null) return Results.Conflict(new { error = "Alış iadesi kaynaklı cari hareket, alış iadesi iptal işlemiyle geri alınmalıdır." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id))
        return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." });
    var reversal = new CustomerLedgerEntry { TenantId = tenantId, CustomerId = id, EntryDate = DateOnly.FromDateTime(DateTime.UtcNow),
        Direction = original.Direction == CustomerLedgerDirection.Debit ? CustomerLedgerDirection.Credit : CustomerLedgerDirection.Debit,
        Amount = original.Amount, CurrencyCode = original.CurrencyCode, Description = $"Ters kayıt: {request.Reason.Trim()}", ReversalOfId = original.Id };
    db.CustomerLedgerEntries.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-ledger.reversed", Resource = original.Id.ToString() });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/customers/{id}/ledger/{reversal.Id}", new CustomerLedgerView(reversal.Id, reversal.EntryDate, reversal.Direction,
        reversal.Amount, reversal.CurrencyCode, reversal.Description, reversal.ReversalOfId, true, false));
});

var stockItems = app.MapGroup("/api/stock/items").RequireAuthorization();
stockItems.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) || (x.Barcode != null && x.Barcode.Contains(term))); }
    var total = await query.CountAsync();
    var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Code).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new StockItemView(x.Id, x.Code, x.Name, x.Barcode, x.UnitCode, x.Category, x.MinimumStock, x.IsActive, x.CreatedAt, x.RowVersion, x.TrackingMode, x.ProcurementLeadTimeDays, x.ManufacturingLeadTimeDays)).ToListAsync();
    return Results.Ok(new StockItemPage(items, page, pageSize, total));
});
stockItems.MapPost("/", async (StockItemWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu stok kodu bu firmada zaten kullanılıyor." });
    var barcode = string.IsNullOrWhiteSpace(request.Barcode) ? null : request.Barcode.Trim();
    if (barcode is not null && await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Barcode == barcode)) return Results.Conflict(new { error = "Bu barkod bu firmada zaten kullanılıyor." });
    if (request.CustomFields?.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var definitionsByCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    var requestedValues = request.CustomFields ?? new Dictionary<string, string?>();
    if (requestedValues.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !definitionsByCode.ContainsKey(x)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["Bilinmeyen veya bu tenant için etkin olmayan bir özel alan kodu gönderildi."] });
    var normalizedValues = new Dictionary<Guid, (StockItemCustomFieldDefinition Definition, string Value)>();
    foreach (var (fieldCode, rawValue) in requestedValues)
    {
        var definition = definitionsByCode[fieldCode];
        if (!StockCustomFieldValidation.TryNormalize(definition, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{fieldCode}"] = [$"'{definition.Label}' alanı tanımlı veri türü veya sınıra uymuyor."] });
        if (value.Length > 0) normalizedValues[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(x => x.IsRequired && !normalizedValues.ContainsKey(x.Id));
    if (missingRequired is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var item = new StockItem { TenantId = tenantId, Code = code, Name = request.Name.Trim(), Barcode = barcode,
        UnitCode = request.UnitCode.Trim().ToUpperInvariant(), Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(),
        MinimumStock = request.MinimumStock, IsActive = request.IsActive, TrackingMode = request.TrackingMode,
        ProcurementLeadTimeDays = request.ProcurementLeadTimeDays, ManufacturingLeadTimeDays = request.ManufacturingLeadTimeDays };
    db.StockItems.Add(item);
    foreach (var (definitionId, entry) in normalizedValues)
    {
        db.StockItemCustomFieldValues.Add(new StockItemCustomFieldValue { TenantId = tenantId, StockItemId = item.Id, DefinitionId = definitionId, Value = entry.Value, DefinitionVersion = entry.Definition.Version });
        db.StockItemCustomFieldValueRevisions.Add(new StockItemCustomFieldValueRevision { TenantId = tenantId, StockItemId = item.Id, DefinitionId = definitionId, NewValue = entry.Value, DefinitionVersion = entry.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Stok kodu veya barkod başka bir kayıtta kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/stock/items/{item.Id}", new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion, item.TrackingMode, item.ProcurementLeadTimeDays, item.ManufacturingLeadTimeDays));
});
stockItems.MapPut("/{id:guid}", async (Guid id, StockItemUpdateRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(new StockItemWriteRequest(request.Code, request.Name, request.Barcode, request.UnitCode, request.Category, request.MinimumStock, TrackingMode: request.TrackingMode ?? InventoryTrackingMode.None,
        ProcurementLeadTimeDays: request.ProcurementLeadTimeDays, ManufacturingLeadTimeDays: request.ManufacturingLeadTimeDays));
    if (errors is not null) return Results.ValidationProblem(errors);
    if (request.RowVersion is null || request.RowVersion.Length == 0) return Results.BadRequest(new { error = "RowVersion alanı zorunludur; güncel olmayan düzenlemeler reddedilir." });
    var code = request.Code.Trim().ToUpperInvariant();
    var barcode = string.IsNullOrWhiteSpace(request.Barcode) ? null : request.Barcode.Trim();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(item.RowVersion, request.RowVersion))
        return Results.Conflict(new { error = "Stok kartı başka bir kullanıcı tarafından güncellendi. Güncel kaydı yeniden açın." });
    if (request.TrackingMode is { } mode && mode != item.TrackingMode && await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id))
        return Results.Conflict(new { error = "Hareket geçmişi olan stok kartının lot/seri takip modu değiştirilemez." });
    if (await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code)) return Results.Conflict(new { error = "Bu stok kodu bu firmada zaten kullanılıyor." });
    if (barcode is not null && await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Barcode == barcode)) return Results.Conflict(new { error = "Bu barkod bu firmada zaten kullanılıyor." });
    item.Code = code; item.Name = request.Name.Trim(); item.Barcode = barcode; item.UnitCode = request.UnitCode.Trim().ToUpperInvariant();
    item.Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(); item.MinimumStock = request.MinimumStock;
    item.ProcurementLeadTimeDays = request.ProcurementLeadTimeDays; item.ManufacturingLeadTimeDays = request.ManufacturingLeadTimeDays;
    if (request.TrackingMode is { } trackingMode) item.TrackingMode = trackingMode;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Stok kodu veya barkod başka bir kayıtta kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Ok(new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion, item.TrackingMode, item.ProcurementLeadTimeDays, item.ManufacturingLeadTimeDays));
});
stockItems.MapPost("/{id:guid}/deactivate", async (Guid id, StockItemStateChangeRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!request.Confirmation) return Results.BadRequest(new { error = "Stok kartını devre dışı bırakmak için açık onay gerekir." });
    if (request.RowVersion is null || request.RowVersion.Length == 0) return Results.BadRequest(new { error = "RowVersion alanı zorunludur." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(item.RowVersion, request.RowVersion)) return Results.Conflict(new { error = "Stok kartı güncel değil. Yeniden açıp tekrar deneyin." });
    if (!item.IsActive) return Results.Conflict(new { error = "Stok kartı zaten devre dışı." });
    var balances = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == id)
        .GroupBy(x => x.WarehouseId).Select(group => group.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)).ToListAsync();
    if (balances.Any(quantity => quantity != 0)) return Results.Conflict(new { error = "Depolarda bakiyesi olan stok kartı devre dışı bırakılamaz; önce stok bakiyesini sıfırlayın." });
    if (await db.SalesOrderLines.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.Order.Status == SalesOrderStatus.Open))
        return Results.Conflict(new { error = "Bekleyen satış siparişi satırları bulunan stok kartı devre dışı bırakılamaz." });
    if (await db.PurchaseOrderLines.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id && (x.PurchaseOrder.Status == PurchaseOrderStatus.Open || x.PurchaseOrder.Status == PurchaseOrderStatus.PartiallyReceived || x.PurchaseOrder.Status == PurchaseOrderStatus.PendingApproval)))
        return Results.Conflict(new { error = "Bekleyen satın alma siparişi satırları bulunan stok kartı devre dışı bırakılamaz." });
    item.IsActive = false;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.deactivated", Resource = item.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion, item.TrackingMode, item.ProcurementLeadTimeDays, item.ManufacturingLeadTimeDays));
});
stockItems.MapPost("/{id:guid}/activate", async (Guid id, StockItemStateChangeRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!request.Confirmation) return Results.BadRequest(new { error = "Stok kartını etkinleştirmek için açık onay gerekir." });
    if (request.RowVersion is null || request.RowVersion.Length == 0) return Results.BadRequest(new { error = "RowVersion alanı zorunludur." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(item.RowVersion, request.RowVersion)) return Results.Conflict(new { error = "Stok kartı güncel değil. Yeniden açıp tekrar deneyin." });
    if (item.IsActive) return Results.Conflict(new { error = "Stok kartı zaten etkin." });
    item.IsActive = true;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.activated", Resource = item.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion, item.TrackingMode, item.ProcurementLeadTimeDays, item.ManufacturingLeadTimeDays));
});
stockItems.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var fields = await db.StockItemCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new StockCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(fields);
});
stockItems.MapPost("/custom-fields", async (StockCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") ||
        string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) ||
        (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu A-Z ile başlamalı; etiket ve veri türü geçerli olmalı. Metin alanı uzunluğu 1–500 karakter arasında olmalıdır."] });
    if (await db.StockItemCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu tenant için özel alan kodu daha önce kullanılmış." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var definition = new StockItemCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label,
        DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    if (definition.IsRequired && await db.StockItems.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Mevcut stok kartları için değerler tamamlanmadan yeni bir alan zorunlu olarak açılamaz. Önce alanı isteğe bağlı oluşturup tüm kartları doldurun." });
    db.StockItemCustomFieldDefinitions.Add(definition);
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu tenant için özel alan kodu daha önce kullanılmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/stock/items/custom-fields/{definition.Id}", new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
stockItems.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Özel alan zaten devre dışı." });
    definition.IsActive = false;
    definition.Version++;
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.NoContent();
});
stockItems.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, StockCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Alan etiketi zorunlu ve en fazla 120 karakter olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Devre dışı alan düzenlenemez; önceki sürüme geri yükleyin." });
    if (definition.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 arasında olmalıdır."] });
    var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    var isRequired = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && await db.StockItemCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength))
        return Results.Conflict(new { error = "Bazı mevcut değerler yeni metin uzunluğu sınırını aşıyor." });
    if (isRequired && await db.StockItems.AnyAsync(item => item.TenantId == tenantId && !db.StockItemCustomFieldValues.Any(value => value.TenantId == tenantId && value.StockItemId == item.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Zorunlu yapmak için mevcut tüm stok kartlarında bu alana değer girilmiş olmalıdır." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == isRequired)
        return Results.Ok(new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label;
    definition.MaxLength = maxLength;
    definition.IsRequired = isRequired;
    definition.Version++;
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
stockItems.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.StockItemCustomFieldDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.StockItemCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50)
        .Select(x => new StockCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
stockItems.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, StockCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation || body.Version < 1) return Results.BadRequest(new { error = "Geçerli sürüm ve açık geri yükleme onayı gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.StockItemCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Veri türü değişiklikleri geri yüklemeyle değiştirilemez." });
    if (revision.IsActive && revision.DataType == CustomFieldDataType.Text && await db.StockItemCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Geçmiş sürümün uzunluk sınırı mevcut değerlerle uyumsuz." });
    if (revision.IsActive && revision.IsRequired && await db.StockItems.AnyAsync(item => item.TenantId == tenantId && !db.StockItemCustomFieldValues.Any(value => value.TenantId == tenantId && value.StockItemId == item.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Bu tanımı zorunlu yapmak için mevcut tüm stok kartlarında alan değeri gerekir." });
    if (definition.Label == revision.Label && definition.MaxLength == revision.MaxLength && definition.IsRequired == revision.IsRequired && definition.IsActive == revision.IsActive)
        return Results.Conflict(new { error = "Alan tanımı zaten bu sürümle aynı." });
    definition.Label = revision.Label;
    definition.MaxLength = revision.MaxLength;
    definition.IsRequired = revision.IsRequired;
    definition.IsActive = revision.IsActive;
    definition.Version++;
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.restored", Resource = $"{definition.Code}:v{body.Version}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
stockItems.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var item = await db.StockItems.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id);
    if (!item) return Results.NotFound();
    var definitions = await db.StockItemCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var values = await db.StockItemCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == id).ToDictionaryAsync(x => x.DefinitionId, x => x.Value);
    return Results.Ok(definitions.Select(x => new StockCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, values.GetValueOrDefault(x.Id) ?? "")).ToArray());
});
stockItems.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.StockItems.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    if (!await db.StockItemCustomFieldDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await (from revision in db.StockItemCustomFieldValueRevisions.AsNoTracking()
                         join definition in db.StockItemCustomFieldDefinitions.AsNoTracking()
                             on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
                         where revision.TenantId == tenantId && revision.StockItemId == id && revision.DefinitionId == definitionId
                         orderby revision.CreatedAt descending
                         select new StockCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label,
                             revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt))
        .Take(50).ToListAsync();
    return Results.Ok(history);
});
stockItems.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, StockCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Özel alan değerini geri yüklemek için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Devre dışı özel alanın değeri geri yüklenemez." });
    var revision = await db.StockItemCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (revision is null) return Results.NotFound();
    var targetRaw = revision.PreviousValue;
    if (!StockCustomFieldValidation.TryNormalize(definition, targetRaw, out var targetValue))
        return Results.Conflict(new { error = "Geçmiş değer güncel alan tanımıyla uyumlu değil; önce alan tanımını uyumlu bir sürüme geri yükleyin." });
    if (definition.IsRequired && targetValue.Length == 0)
        return Results.Conflict(new { error = "Zorunlu alan boş bir geçmiş değerine geri yüklenemez." });
    var current = await db.StockItemCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.DefinitionId == definitionId);
    var currentValue = current?.Value;
    if (string.Equals(currentValue, targetValue, StringComparison.Ordinal)) return Results.Conflict(new { error = "Stok kartı değeri zaten seçilen geçmiş durumunda." });
    if (targetValue.Length == 0)
    {
        if (current is not null) db.StockItemCustomFieldValues.Remove(current);
    }
    else if (current is null)
    {
        db.StockItemCustomFieldValues.Add(new StockItemCustomFieldValue { TenantId = tenantId, StockItemId = id, DefinitionId = definitionId, Value = targetValue, DefinitionVersion = definition.Version });
    }
    else
    {
        current.Value = targetValue;
        current.DefinitionVersion = definition.Version;
        current.UpdatedAt = DateTimeOffset.UtcNow;
    }
    db.StockItemCustomFieldValueRevisions.Add(new StockItemCustomFieldValueRevision
    {
        TenantId = tenantId, StockItemId = id, DefinitionId = definitionId, PreviousValue = currentValue,
        NewValue = targetValue.Length == 0 ? null : targetValue, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal)
    });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.value-restored", Resource = $"{item.Code}:{definition.Code}:{revision.Id:D}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, targetValue));
});
stockItems.MapPut("/{id:guid}/custom-fields", async (Guid id, StockCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is null || body.Values.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (body.Values.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !byCode.ContainsKey(x))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["İstek tenant içindeki etkin özel alanlardan bilinmeyen bir kod içeriyor."] });
    var normalized = new Dictionary<Guid, (StockItemCustomFieldDefinition Definition, string Value)>();
    foreach (var (code, rawValue) in body.Values)
    {
        if (!byCode.TryGetValue(code, out var definition)) continue;
        if (!StockCustomFieldValidation.TryNormalize(definition, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{code}"] = [$"'{definition.Label}' alanı için değer {definition.DataType} türüne veya tanımlı sınıra uymuyor."] });
        if (value.Length == 0) continue;
        normalized[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(definition => definition.IsRequired && !normalized.ContainsKey(definition.Id));
    if (missingRequired is not null)
        return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var activeIds = definitions.Select(x => x.Id).ToHashSet();
    var existing = await db.StockItemCustomFieldValues.Where(x => x.TenantId == tenantId && x.StockItemId == id && activeIds.Contains(x.DefinitionId)).ToListAsync();
    var existingById = existing.ToDictionary(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var oldValue = existingById.GetValueOrDefault(definition.Id)?.Value;
        var newValue = normalized.GetValueOrDefault(definition.Id).Value ?? "";
        if (string.Equals(oldValue, newValue, StringComparison.Ordinal)) continue;
        db.StockItemCustomFieldValueRevisions.Add(new StockItemCustomFieldValueRevision
        {
            TenantId = tenantId,
            StockItemId = id,
            DefinitionId = definition.Id,
            PreviousValue = oldValue,
            NewValue = newValue.Length == 0 ? null : newValue,
            DefinitionVersion = definition.Version,
            ChangedByUserId = GetUserId(principal)
        });
    }
    db.StockItemCustomFieldValues.RemoveRange(existing);
    foreach (var (definitionId, value) in normalized)
        db.StockItemCustomFieldValues.Add(new StockItemCustomFieldValue { TenantId = tenantId, StockItemId = id, DefinitionId = definitionId, Value = value.Value, DefinitionVersion = value.Definition.Version });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.values-updated", Resource = id.ToString("D") });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    var result = definitions.Select(x => new StockCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, normalized.GetValueOrDefault(x.Id).Value ?? "")).ToArray();
    return Results.Ok(result);
});

stockItems.MapGet("/{id:guid}/units", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var item = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.UnitCode }).SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    var conversions = await db.StockItemUnitConversions.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.StockItemId == id && x.IsActive)
        .OrderBy(x => x.UnitCode)
        .Select(x => new StockItemUnitConversionView(x.Id, x.UnitCode, x.FactorToBase, x.IsActive)).ToListAsync();
    return Results.Ok(new { baseUnitCode = item.UnitCode, conversions });
});
stockItems.MapPost("/{id:guid}/units", async (Guid id, StockItemUnitConversionWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = request.UnitCode?.Trim().ToUpperInvariant();
    if (string.IsNullOrWhiteSpace(code) || code.Length > 8 || request.FactorToBase <= 0m || request.FactorToBase > 9999999999.99999999m || request.FactorToBase != decimal.Round(request.FactorToBase, 8))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["unit"] = ["Birim kodu en fazla 8 karakter olmalı; dönüşüm katsayısı pozitif ve en fazla 8 ondalık basamak içermelidir."] });
    var item = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => new { x.Id, x.UnitCode }).SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (string.Equals(code, item.UnitCode, StringComparison.OrdinalIgnoreCase)) return Results.Conflict(new { error = "Temel birim için ayrıca dönüşüm tanımlanamaz." });
    if (await db.StockItemUnitConversions.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.UnitCode == code))
        return Results.Conflict(new { error = "Bu stok kartında birim kodu daha önce tanımlanmış." });
    var conversion = new StockItemUnitConversion { TenantId = tenantId, StockItemId = id, UnitCode = code, FactorToBase = request.FactorToBase };
    db.StockItemUnitConversions.Add(conversion);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-unit-conversion.created", Resource = $"{item.Id:D}:{code}" });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu stok kartında birim kodu daha önce tanımlanmış." }); }
    return Results.Created($"/api/stock/items/{id}/units/{conversion.Id}", new StockItemUnitConversionView(conversion.Id, conversion.UnitCode, conversion.FactorToBase, conversion.IsActive));
});
stockItems.MapPut("/{id:guid}/units/{conversionId:guid}", async (Guid id, Guid conversionId, StockItemUnitConversionWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = request.UnitCode?.Trim().ToUpperInvariant();
    if (string.IsNullOrWhiteSpace(code) || code.Length > 8 || request.FactorToBase <= 0m || request.FactorToBase > 9999999999.99999999m || request.FactorToBase != decimal.Round(request.FactorToBase, 8))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["unit"] = ["Birim kodu en fazla 8 karakter olmalı; dönüşüm katsayısı pozitif ve en fazla 8 ondalık basamak içermelidir."] });
    var item = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => new { x.Id, x.UnitCode }).SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (string.Equals(code, item.UnitCode, StringComparison.OrdinalIgnoreCase)) return Results.Conflict(new { error = "Temel birim için ayrıca dönüşüm tanımlanamaz." });
    var conversion = await db.StockItemUnitConversions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.Id == conversionId);
    if (conversion is null) return Results.NotFound();
    if (conversion.UnitCode != code && await db.StockItemUnitConversions.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.UnitCode == code))
        return Results.Conflict(new { error = "Bu stok kartında birim kodu daha önce tanımlanmış." });
    conversion.UnitCode = code; conversion.FactorToBase = request.FactorToBase; conversion.IsActive = true;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-unit-conversion.updated", Resource = $"{item.Id:D}:{code}" });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu stok kartında birim kodu daha önce tanımlanmış." }); }
    return Results.Ok(new StockItemUnitConversionView(conversion.Id, conversion.UnitCode, conversion.FactorToBase, conversion.IsActive));
});
stockItems.MapDelete("/{id:guid}/units/{conversionId:guid}", async (Guid id, Guid conversionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var conversion = await db.StockItemUnitConversions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.Id == conversionId);
    if (conversion is null) return Results.NotFound();
    if (!conversion.IsActive) return Results.NoContent();
    conversion.IsActive = false;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-unit-conversion.deactivated", Resource = $"{id:D}:{conversion.UnitCode}" });
    await db.SaveChangesAsync();
    return Results.NoContent();
});

var warehouses = app.MapGroup("/api/warehouses").RequireAuthorization();
warehouses.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var fields = await db.WarehouseCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new WarehouseCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(fields);
});
warehouses.MapPost("/custom-fields", async (WarehouseCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") ||
        string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) ||
        (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.WarehouseCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu tenant için özel alan kodu daha önce kullanılmış." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = new WarehouseCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType,
        MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    if (definition.IsRequired && await db.Warehouses.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Mevcut depolar doldurulmadan yeni alan zorunlu yapılamaz. Önce isteğe bağlı oluşturun." });
    db.WarehouseCustomFieldDefinitions.Add(definition);
    db.WarehouseCustomFieldDefinitionRevisions.Add(ToWarehouseCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu tenant için özel alan kodu daha önce kullanılmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/custom-fields/{definition.Id}", new WarehouseCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
warehouses.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, WarehouseCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket ve uzunluk sınırları geçerli olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.WarehouseCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var required = body.IsRequired ?? definition.IsRequired; var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin alanı uzunluğu 1–500 olmalıdır."] });
    if (maxLength < definition.MaxLength && await db.WarehouseCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut depo değerlerini geçersiz kılıyor." });
    if (required && await db.Warehouses.AnyAsync(w => w.TenantId == tenantId && !db.WarehouseCustomFieldValues.Any(v => v.TenantId == tenantId && v.WarehouseId == w.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Alan zorunlu yapılmadan önce tüm mevcut depolara değer girin." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == required) return Results.Ok(new WarehouseCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.WarehouseCustomFieldDefinitionRevisions.Add(ToWarehouseCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new WarehouseCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
warehouses.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.WarehouseCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Özel alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++;
    db.WarehouseCustomFieldDefinitionRevisions.Add(ToWarehouseCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.NoContent();
});
warehouses.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.WarehouseCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.WarehouseCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId).OrderByDescending(x => x.Version).Take(50)
        .Select(x => new WarehouseCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
warehouses.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, WarehouseCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Tanımı geri yüklemek için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.WarehouseCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.WarehouseCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Alan veri türü değiştirilemez." });
    if (revision.DataType == CustomFieldDataType.Text && await db.WarehouseCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength)) return Results.Conflict(new { error = "Bu sürüm mevcut değerleri geçersiz kılıyor." });
    if (revision.IsRequired && await db.Warehouses.AnyAsync(w => w.TenantId == tenantId && !db.WarehouseCustomFieldValues.Any(v => v.TenantId == tenantId && v.WarehouseId == w.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı geri yüklemek için tüm depolarda değer olmalıdır." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.WarehouseCustomFieldDefinitionRevisions.Add(ToWarehouseCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new WarehouseCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
warehouses.MapGet("/{warehouseId:guid}/custom-fields", async (Guid warehouseId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId)) return Results.NotFound();
    var values = await (from definition in db.WarehouseCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.WarehouseCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
            on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty()
        orderby definition.Label
        select new WarehouseCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(values);
});
warehouses.MapPut("/{warehouseId:guid}/custom-fields", async (Guid warehouseId, WarehouseCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is { Count: > 40 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound(); if (!warehouse.IsActive) return Results.Conflict(new { error = "Devre dışı depoların özel alanları değiştirilemez." });
    var definitions = await db.WarehouseCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.OrdinalIgnoreCase); var errors = new Dictionary<string, string[]>(); var normalized = new Dictionary<Guid, (WarehouseCustomFieldDefinition Definition, string Value)>();
    if (body.Values is not null) foreach (var pair in body.Values)
    {
        if (!byCode.TryGetValue(pair.Key, out var definition)) { errors[$"values.{pair.Key}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { errors[$"values.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id));
    if (missing is not null) errors[$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var existing = await db.WarehouseCustomFieldValues.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToDictionaryAsync(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var newValue = normalized.GetValueOrDefault(definition.Id).Value;
        existing.TryGetValue(definition.Id, out var current); var oldValue = current?.Value;
        if (string.Equals(oldValue ?? "", newValue ?? "", StringComparison.Ordinal) && (current is null || current.DefinitionVersion == definition.Version)) continue;
        if (string.IsNullOrEmpty(newValue)) { if (current is not null) db.WarehouseCustomFieldValues.Remove(current); }
        else if (current is null) db.WarehouseCustomFieldValues.Add(new WarehouseCustomFieldValue { TenantId = tenantId, WarehouseId = warehouseId, DefinitionId = definition.Id, Value = newValue, DefinitionVersion = definition.Version });
        else { current.Value = newValue; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
        db.WarehouseCustomFieldValueRevisions.Add(new WarehouseCustomFieldValueRevision { TenantId = tenantId, WarehouseId = warehouseId, DefinitionId = definition.Id, PreviousValue = oldValue, NewValue = newValue, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse-custom-fields.updated", Resource = warehouse.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    var result = await (from definition in db.WarehouseCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.WarehouseCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new WarehouseCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(result);
});
warehouses.MapGet("/{warehouseId:guid}/custom-fields/{definitionId:guid}/history", async (Guid warehouseId, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId) || !await db.WarehouseCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await (from revision in db.WarehouseCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.DefinitionId == definitionId)
        join definition in db.WarehouseCustomFieldDefinitions.AsNoTracking() on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        orderby revision.CreatedAt descending select new WarehouseCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label, revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt)).Take(50).ToListAsync();
    return Results.Ok(history);
});
warehouses.MapPost("/{warehouseId:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid warehouseId, Guid definitionId, Guid revisionId, WarehouseCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Değeri geri yüklemek için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound(); if (!warehouse.IsActive) return Results.Conflict(new { error = "Devre dışı depoların özel alanları değiştirilemez." });
    var definition = await db.WarehouseCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    var revision = await db.WarehouseCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.DefinitionId == definitionId && x.Id == revisionId);
    if (definition is null || revision is null) return Results.NotFound();
    var target = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, target, out target) || (definition.IsRequired && target.Length == 0)) return Results.Conflict(new { error = "Önceki değer mevcut tanım veya zorunlulukla uyumlu değil." });
    var current = await db.WarehouseCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.DefinitionId == definitionId); var old = current?.Value;
    if (target.Length == 0) { if (current is not null) db.WarehouseCustomFieldValues.Remove(current); }
    else if (current is null) db.WarehouseCustomFieldValues.Add(new WarehouseCustomFieldValue { TenantId = tenantId, WarehouseId = warehouseId, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.WarehouseCustomFieldValueRevisions.Add(new WarehouseCustomFieldValueRevision { TenantId = tenantId, WarehouseId = warehouseId, DefinitionId = definitionId, PreviousValue = old, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new WarehouseCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});
warehouses.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var items = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Name)
        .Select(x => new WarehouseView(x.Id, x.Code, x.Name, x.IsActive, x.RowVersion)).ToListAsync();
    return Results.Ok(items);
});
warehouses.MapPost("/", async (WarehouseWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.WarehouseCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var normalized = new Dictionary<Guid, (WarehouseCustomFieldDefinition Definition, string Value)>(); var customFieldErrors = new Dictionary<string, string[]>();
    if (request.CustomFields is { Count: > 40 }) customFieldErrors["customFields"] = ["En fazla 40 özel alan gönderilebilir."];
    if (request.CustomFields is not null) foreach (var pair in request.CustomFields)
    {
        var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
        if (definition is null) { customFieldErrors[$"customFields.{pair.Key}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { customFieldErrors[$"customFields.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id));
    if (missing is not null) customFieldErrors[$"customFields.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (customFieldErrors.Count > 0) return Results.ValidationProblem(customFieldErrors);
    var warehouse = new Warehouse { TenantId = tenantId, Code = code, Name = request.Name.Trim() };
    db.Warehouses.Add(warehouse);
    foreach (var field in normalized.Values)
    {
        db.WarehouseCustomFieldValues.Add(new WarehouseCustomFieldValue { TenantId = tenantId, WarehouseId = warehouse.Id, DefinitionId = field.Definition.Id, Value = field.Value, DefinitionVersion = field.Definition.Version });
        db.WarehouseCustomFieldValueRevisions.Add(new WarehouseCustomFieldValueRevision { TenantId = tenantId, WarehouseId = warehouse.Id, DefinitionId = field.Definition.Id, NewValue = field.Value, DefinitionVersion = field.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/{warehouse.Id}", new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
});
warehouses.MapPut("/{warehouseId:guid}", async (Guid warehouseId, WarehouseUpdateRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.RowVersion.SequenceEqual(request.RowVersion!)) return Results.Conflict(new { error = "Depo başka bir işlemde değiştirildi. Güncel kaydı yükleyip yeniden deneyin." });
    if (await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Code == code && x.Id != warehouseId)) return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." });
    var name = request.Name.Trim();
    if (warehouse.Code == code && warehouse.Name == name) return Results.Ok(new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
    warehouse.Code = code; warehouse.Name = name;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." }); }
    catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Depo eşzamanlı olarak değiştirildi. Güncel kaydı yükleyip yeniden deneyin." }); }
    await transaction.CommitAsync();
    return Results.Ok(new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
});
warehouses.MapPost("/{warehouseId:guid}/status", async (Guid warehouseId, WarehouseStateChangeRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (warehouse.IsActive == request.IsActive) return Results.Conflict(new { error = request.IsActive ? "Depo zaten etkin." : "Depo zaten devre dışı." });
    if (!request.IsActive)
    {
        var nonzeroBalance = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
            .GroupBy(x => x.StockItemId)
            .Select(group => new { StockItemId = group.Key, Balance = group.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
            .FirstOrDefaultAsync(x => x.Balance != 0m);
        if (nonzeroBalance is not null)
        {
            var stockCode = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == nonzeroBalance.StockItemId).Select(x => x.Code).SingleAsync();
            return Results.Conflict(new { error = $"{stockCode} için stok bakiyesi sıfır olmadan depo devre dışı bırakılamaz.", stockItemId = nonzeroBalance.StockItemId, currentBalance = nonzeroBalance.Balance });
        }
    }
    warehouse.IsActive = request.IsActive;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = request.IsActive ? "warehouse.activated" : "warehouse.deactivated", Resource = warehouse.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
});
warehouses.MapWarehouseLocationEndpoints();
warehouses.MapGet("/transfers", async (ClaimsPrincipal principal, TenantDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.InventoryTransfers.AsNoTracking().Where(x => x.TenantId == tenantId);
    var totalCount = await query.CountAsync();
    var transfers = await query.OrderByDescending(x => x.TransferDate).ThenByDescending(x => x.CreatedAt)
        .Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new InventoryTransferSummary(x.Id, x.Code, x.FromWarehouseId,
            db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.FromWarehouseId).Select(w => w.Name).FirstOrDefault() ?? "",
            x.ToWarehouseId, db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.ToWarehouseId).Select(w => w.Name).FirstOrDefault() ?? "",
            x.TransferDate, x.Status,
            db.InventoryTransactions.Count(t => t.TenantId == tenantId && t.InventoryTransferId == x.Id && t.WarehouseId == x.FromWarehouseId), x.CreatedAt))
        .ToListAsync();
    return Results.Ok(new { items = transfers, page, pageSize, totalCount });
});
warehouses.MapGet("/transfers/{transferId:guid}", async (Guid transferId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var transferRecord = await db.InventoryTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == transferId);
    if (transferRecord is null) return Results.NotFound();
    var fromName = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == transferRecord.FromWarehouseId).Select(x => x.Name).SingleAsync();
    var toName = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == transferRecord.ToWarehouseId).Select(x => x.Name).SingleAsync();
    var lineCount = await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.FromWarehouseId);
    var summary = new InventoryTransferSummary(transferRecord.Id, transferRecord.Code, transferRecord.FromWarehouseId, fromName,
        transferRecord.ToWarehouseId, toName, transferRecord.TransferDate, transferRecord.Status, lineCount, transferRecord.CreatedAt);
    var sourceLines = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.FromWarehouseId)
        .OrderBy(x => x.StockItem.Code).Select(x => new { x.StockItemId, x.StockItem.Code, x.StockItem.Name, x.StockItem.UnitCode, x.Quantity,
            x.EnteredQuantity, x.EnteredUnitCode, x.StorageLocationId }).ToListAsync();
    var targetLocations = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.ToWarehouseId)
        .Select(x => new { x.StockItemId, x.StorageLocationId }).ToDictionaryAsync(x => x.StockItemId, x => x.StorageLocationId);
    var locationIds = sourceLines.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value)
        .Concat(targetLocations.Values.Where(x => x.HasValue).Select(x => x!.Value)).Distinct().ToArray();
    var locations = await db.WarehouseLocations.AsNoTracking().Where(x => x.TenantId == tenantId && locationIds.Contains(x.Id))
        .ToDictionaryAsync(x => x.Id);
    var lines = sourceLines.Select(x =>
    {
        var targetLocationId = targetLocations.GetValueOrDefault(x.StockItemId);
        locations.TryGetValue(x.StorageLocationId ?? Guid.Empty, out var fromLocation);
        locations.TryGetValue(targetLocationId ?? Guid.Empty, out var toLocation);
        return new InventoryTransferLineView(x.StockItemId, x.Code, x.Name, x.UnitCode, x.Quantity, x.EnteredQuantity, x.EnteredUnitCode,
            x.StorageLocationId, fromLocation?.Code, fromLocation?.Name, targetLocationId, toLocation?.Code, toLocation?.Name);
    }).ToList();
    return Results.Ok(new InventoryTransferDetailView(summary, lines));
});
warehouses.MapPost("/transfers", async (InventoryTransferWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var stockItems = new Dictionary<Guid, StockItem>();
    foreach (var stockItemId in request.Lines.Select(x => x.StockItemId).Order())
    {
        var stockItem = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {stockItemId}").SingleOrDefaultAsync();
        if (stockItem is null || !stockItem.IsActive) return Results.Conflict(new { error = "Transfer satırlarından en az birinin stok kartı bulunamadı veya pasif." });
        stockItems.Add(stockItemId, stockItem);
    }
    var enteredTransferLines = request.Lines.ToDictionary(x => x.StockItemId, x => (x.Quantity,
        UnitCode: string.IsNullOrWhiteSpace(x.UnitCode) ? stockItems[x.StockItemId].UnitCode : x.UnitCode.Trim().ToUpperInvariant()));
    var normalizedTransferLines = new List<InventoryTransferLineWriteRequest>(request.Lines.Count);
    foreach (var input in request.Lines)
    {
        var item = stockItems[input.StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.StockItemId}].unitCode"] = [$"{input.UnitCode} bu stok kartı için etkin birim değil."] });
        var baseQuantity = input.Quantity * factor.Value;
        if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.StockItemId}].quantity"] = ["Temel birime çevrilen miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."] });
        normalizedTransferLines.Add(input with { Quantity = baseQuantity, UnitCode = item.UnitCode });
    }
    request = request with { Lines = normalizedTransferLines };
    var existingTransfer = await db.InventoryTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existingTransfer is not null)
    {
        var existingFrom = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == existingTransfer.FromWarehouseId).Select(x => x.Name).SingleAsync();
        var existingTo = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == existingTransfer.ToWarehouseId).Select(x => x.Name).SingleAsync();
        var existingCount = await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId && x.InventoryTransferId == existingTransfer.Id && x.WarehouseId == existingTransfer.FromWarehouseId);
        var existingLines = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == existingTransfer.Id && x.WarehouseId == existingTransfer.FromWarehouseId)
            .Select(x => new { x.StockItemId, Quantity = x.EnteredQuantity ?? x.Quantity, UnitCode = x.EnteredUnitCode ?? x.StockItem.UnitCode, FromStorageLocationId = x.StorageLocationId }).OrderBy(x => x.StockItemId).ToListAsync();
        var existingTargetLocations = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == existingTransfer.Id && x.WarehouseId == existingTransfer.ToWarehouseId)
            .Select(x => new { x.StockItemId, x.StorageLocationId }).ToDictionaryAsync(x => x.StockItemId, x => x.StorageLocationId);
        var requestedLines = request.Lines.Select(x => new { x.StockItemId, Quantity = enteredTransferLines[x.StockItemId].Quantity,
            UnitCode = enteredTransferLines[x.StockItemId].UnitCode, x.FromStorageLocationId, x.ToStorageLocationId }).OrderBy(x => x.StockItemId).ToArray();
        if (existingTransfer.FromWarehouseId != request.FromWarehouseId || existingTransfer.ToWarehouseId != request.ToWarehouseId ||
            existingTransfer.TransferDate != request.TransferDate || existingLines.Count != requestedLines.Length ||
            existingLines.Where((line, index) => line.StockItemId != requestedLines[index].StockItemId || line.Quantity != requestedLines[index].Quantity || line.UnitCode != requestedLines[index].UnitCode ||
                line.FromStorageLocationId != requestedLines[index].FromStorageLocationId || existingTargetLocations.GetValueOrDefault(line.StockItemId) != requestedLines[index].ToStorageLocationId).Any())
            return Results.Conflict(new { error = "requestId daha önce farklı içerikli bir depo transferinde kullanılmış." });
        return Results.Ok(new InventoryTransferSummary(existingTransfer.Id, existingTransfer.Code, existingTransfer.FromWarehouseId, existingFrom,
            existingTransfer.ToWarehouseId, existingTo, existingTransfer.TransferDate, existingTransfer.Status, existingCount, existingTransfer.CreatedAt));
    }
    var warehouseIds = new[] { request.FromWarehouseId, request.ToWarehouseId }.Order().ToArray();
    var lockedWarehouses = new Dictionary<Guid, Warehouse>();
    foreach (var warehouseId in warehouseIds)
    {
        var locked = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
        if (locked is null) return Results.NotFound();
        lockedWarehouses.Add(warehouseId, locked);
    }
    var fromWarehouse = lockedWarehouses[request.FromWarehouseId];
    var toWarehouse = lockedWarehouses[request.ToWarehouseId];
    if (!fromWarehouse.IsActive || !toWarehouse.IsActive) return Results.Conflict(new { error = "Depo transferinde kaynak ve hedef depolar etkin olmalıdır." });
    var requestedFromLocationIds = request.Lines.Where(x => x.FromStorageLocationId.HasValue).Select(x => x.FromStorageLocationId!.Value).Distinct().ToArray();
    var requestedToLocationIds = request.Lines.Where(x => x.ToStorageLocationId.HasValue).Select(x => x.ToStorageLocationId!.Value).Distinct().ToArray();
    var fromLocationResolution = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantId, fromWarehouse.Id, requestedFromLocationIds);
    var toLocationResolution = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantId, toWarehouse.Id, requestedToLocationIds);
    if (fromLocationResolution.Failure != SalesDeliveryLocationFailure.None || toLocationResolution.Failure != SalesDeliveryLocationFailure.None)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Kaynak ve hedef konumlar etkin olmalı ve ilgili depoya ait olmalıdır."] });
    var allowNegativeStock = await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(db, tenantId);
    foreach (var line in request.Lines)
    {
        var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == fromWarehouse.Id && x.StockItemId == line.StockItemId)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == fromWarehouse.Id
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == line.StockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m;
        if (line.Quantity > current - reserved && !TenantOperationalSettingsEndpoints.CanPostNegativeBalance(allowNegativeStock, reserved,
                stockItems[line.StockItemId].TrackingMode, line.FromStorageLocationId.HasValue))
            return Results.Conflict(new { error = $"{stockItems[line.StockItemId].Code} için kaynak depoda rezervasyonlar düşüldükten sonra yeterli stok yok.", stockItemId = line.StockItemId, currentBalance = current, reservedQuantity = reserved, requestedQuantity = line.Quantity });
        if (line.FromStorageLocationId is { } sourceLocationId)
        {
            var locationBalance = await SalesDeliveryLocationGuard.GetBalanceAsync(db, tenantId, fromWarehouse.Id, line.StockItemId, sourceLocationId);
            if (line.Quantity > locationBalance)
                return Results.Conflict(new { error = $"{stockItems[line.StockItemId].Code} için seçilen kaynak konumda yeterli stok yok.", stockItemId = line.StockItemId, locationBalance, requestedQuantity = line.Quantity });
        }
    }

    var code = $"TR-{Guid.NewGuid():N}".ToUpperInvariant();
    var transferRecord = new InventoryTransfer { TenantId = tenantId, RequestId = request.RequestId, FromWarehouseId = fromWarehouse.Id,
        ToWarehouseId = toWarehouse.Id, Code = code, TransferDate = request.TransferDate };
    db.InventoryTransfers.Add(transferRecord);
    foreach (var line in request.Lines.OrderBy(x => stockItems[x.StockItemId].Code, StringComparer.Ordinal))
    {
        var item = stockItems[line.StockItemId];
        var unitCostBase = await GetWeightedAverageUnitCostBaseAsync(db, tenantId, item.Id, request.TransferDate);
        var tracking = await AllocateAvailableTrackingAsync(db, tenantId, fromWarehouse.Id, item, line.Quantity, line.FromStorageLocationId);
        if (tracking is null) return Results.Conflict(new { error = $"{item.Code} için lot/seri bazında kaynak stok yetersiz." });
        var outgoing = new InventoryTransaction { TenantId = tenantId, WarehouseId = fromWarehouse.Id, StockItemId = item.Id, InventoryTransfer = transferRecord,
            EntryDate = request.TransferDate, Direction = InventoryDirection.Issue, Quantity = line.Quantity, EnteredQuantity = enteredTransferLines[item.Id].Quantity,
            EnteredUnitCode = enteredTransferLines[item.Id].UnitCode, UnitCostBase = unitCostBase, StorageLocationId = line.FromStorageLocationId, Description = $"Depo transferi {code} · kaynak" };
        var incoming = new InventoryTransaction { TenantId = tenantId, WarehouseId = toWarehouse.Id, StockItemId = item.Id, InventoryTransfer = transferRecord,
            EntryDate = request.TransferDate, Direction = InventoryDirection.Receipt, Quantity = line.Quantity, EnteredQuantity = enteredTransferLines[item.Id].Quantity,
            EnteredUnitCode = enteredTransferLines[item.Id].UnitCode, UnitCostBase = unitCostBase, StorageLocationId = line.ToStorageLocationId, Description = $"Depo transferi {code} · hedef" };
        outgoing.Tracking = ToTraceEntities(tenantId, item, tracking);
        incoming.Tracking = ToTraceEntities(tenantId, item, tracking);
        db.InventoryTransactions.AddRange(
            outgoing, incoming);
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transfer.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu requestId ile bir transfer zaten kaydedilmiş; listeyi yenileyin." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/transfers/{transferRecord.Id}", new InventoryTransferSummary(transferRecord.Id, code, fromWarehouse.Id,
        fromWarehouse.Name, toWarehouse.Id, toWarehouse.Name, transferRecord.TransferDate, transferRecord.Status, request.Lines.Count, transferRecord.CreatedAt));
});
warehouses.MapPost("/transfers/{transferId:guid}/void", async (Guid transferId, InventoryTransferVoidRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var transferRecord = await db.InventoryTransfers.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransfers] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {transferId}").SingleOrDefaultAsync();
    if (transferRecord is null) return Results.NotFound();
    if (transferRecord.Status != InventoryTransferStatus.Posted) return Results.Conflict(new { error = "Depo transferi daha önce iptal edilmiş." });
    var lockedWarehouses = new Dictionary<Guid, Warehouse>();
    foreach (var warehouseId in new[] { transferRecord.FromWarehouseId, transferRecord.ToWarehouseId }.Order())
    {
        var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
        if (warehouse is null) return Results.Conflict(new { error = "Transfer deposu artık bulunamadı." });
        lockedWarehouses.Add(warehouseId, warehouse);
    }
    var originals = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id)
        .OrderBy(x => x.StockItemId).ThenBy(x => x.WarehouseId).ToListAsync();
    if (originals.Count == 0 || originals.Any(x => db.InventoryTransactions.Any(y => y.TenantId == tenantId && y.ReversalOfId == x.Id)))
        return Results.Conflict(new { error = "Transfer hareketleri eksik veya daha önce ters kayıt oluşturulmuş." });
    foreach (var original in originals.Where(x => x.Direction == InventoryDirection.Receipt))
    {
        var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == original.WarehouseId && x.StockItemId == original.StockItemId)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == original.WarehouseId
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == original.StockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m;
        if (original.Quantity > current - reserved)
            return Results.Conflict(new { error = "Transfer iptali hedef depodaki rezervasyonları karşılayamaz; önce stok kullanımını veya rezervasyonları düzenleyin.", stockItemId = original.StockItemId, currentBalance = current, reservedQuantity = reserved, transferQuantity = original.Quantity });
    }
    var transferTraceRows = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && originals.Select(y => y.Id).Contains(x.InventoryTransactionId)).ToListAsync();
    foreach (var original in originals)
    {
        var reversal = new InventoryTransaction { TenantId = tenantId, WarehouseId = original.WarehouseId, StockItemId = original.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = original.Direction == InventoryDirection.Receipt ? InventoryDirection.Issue : InventoryDirection.Receipt,
            Quantity = original.Quantity, UnitCostBase = original.UnitCostBase, StorageLocationId = original.StorageLocationId,
            Description = $"Transfer iptali {transferRecord.Code} · {request.Reason.Trim()}", ReversalOfId = original.Id };
        reversal.Tracking = transferTraceRows.Where(x => x.InventoryTransactionId == original.Id).Select(x => new InventoryTransactionTrace { TenantId = tenantId,
            StockItemId = original.StockItemId, TrackingMode = x.TrackingMode, TrackingCode = x.TrackingCode, Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList();
        db.InventoryTransactions.Add(reversal);
    }
    transferRecord.Status = InventoryTransferStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transfer.voided", Resource = transferRecord.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { transferRecord.Id, transferRecord.Code, transferRecord.Status });
});
warehouses.MapGet("/{warehouseId:guid}/balances", async (Guid warehouseId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId)) return Results.NotFound();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Name).Select(x => new { x.Id, x.Code, x.Name, x.UnitCode, x.MinimumStock }).ToListAsync();
    var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
    var totals = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key,
            Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
            Valuation = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m,
            Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m })
        .ToDictionaryAsync(x => x.StockItemId);
    var valueAdjustments = await db.InventoryCostAdjustmentLines.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key, Amount = g.Sum(x => x.AmountBase) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Amount);
    var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Status == SalesOrderReservationStatus.Active)
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) }).ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    return Results.Ok(items.Select(x =>
    {
        var total = totals.GetValueOrDefault(x.Id); var quantity = total?.Quantity ?? 0m; var reservedQuantity = reserved.GetValueOrDefault(x.Id);
        return new InventoryBalanceView(x.Id, x.Code, x.Name, x.UnitCode, x.MinimumStock, quantity, quantity < x.MinimumStock,
            reservedQuantity, Math.Max(0m, quantity - reservedQuantity), (total?.Valuation ?? 0m) + valueAdjustments.GetValueOrDefault(x.Id), Math.Max(0m, total?.Unvalued ?? 0m), baseCurrency);
    }));
});
warehouses.MapGet("/{warehouseId:guid}/stock/{stockItemId:guid}/transactions", async (Guid warehouseId, Guid stockItemId, ClaimsPrincipal principal, TenantDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId) || !await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id == stockItemId)) return Results.NotFound();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId);
    var total = await query.CountAsync();
    var movements = await query.OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
    var ids = movements.Select(x => x.Id).ToArray();
    var allocations = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && ids.Contains(x.InventoryTransactionId))
        .GroupBy(x => x.InventoryTransactionId).ToDictionaryAsync(g => g.Key, g => (IReadOnlyList<InventoryTrackingAllocationView>)g
            .Select(x => new InventoryTrackingAllocationView(x.TrackingCode, x.Quantity, x.ExpiryDate)).ToList());
    var locationIds = movements.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value).Distinct().ToArray();
    var locations = await db.WarehouseLocations.AsNoTracking().Where(x => x.TenantId == tenantId && locationIds.Contains(x.Id))
        .ToDictionaryAsync(x => x.Id, x => (x.Code, x.Name));
    var rows = movements.Select(x => new InventoryTransactionView(x.Id, x.EntryDate, x.Direction, x.Quantity, x.Description, x.ReversalOfId, x.ReversalOfId != null,
        db.InventoryTransactions.Any(y => y.TenantId == x.TenantId && y.ReversalOfId == x.Id), x.UnitCostBase, x.EnteredQuantity, x.EnteredUnitCode,
        allocations.GetValueOrDefault(x.Id), x.StorageLocationId,
        x.StorageLocationId is { } locationId && locations.TryGetValue(locationId, out var location) ? location.Code : null,
        x.StorageLocationId is { } selectedLocationId && locations.TryGetValue(selectedLocationId, out var selectedLocation) ? selectedLocation.Name : null)).ToList();
    return Results.Ok(new InventoryTransactionPage(rows, page, pageSize, total));
});
warehouses.MapPost("/{warehouseId:guid}/stock/{stockItemId:guid}/transactions", async (Guid warehouseId, Guid stockItemId, InventoryTransactionWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {stockItemId}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive || !item.IsActive) return Results.Conflict(new { error = "Pasif depo veya stok kartına hareket eklenemez." });
    WarehouseLocation? storageLocation = null;
    if (request.StorageLocationId is { } storageLocationId)
    {
        storageLocation = await db.WarehouseLocations.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseLocations] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [WarehouseId] = {warehouseId} AND [Id] = {storageLocationId}").SingleOrDefaultAsync();
        if (storageLocation is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["storageLocationId"] = ["Konum seçilen deponun içinde bulunamadı."] });
        if (!storageLocation.IsActive) return Results.Conflict(new { error = "Pasif konuma stok hareketi eklenemez." });
    }
    var enteredUnitCode = string.IsNullOrWhiteSpace(request.UnitCode) ? item.UnitCode : request.UnitCode.Trim().ToUpperInvariant();
    var conversionFactor = 1m;
    if (!string.Equals(enteredUnitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase))
    {
        var conversion = await db.StockItemUnitConversions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId
            && x.StockItemId == item.Id && x.UnitCode == enteredUnitCode && x.IsActive);
        if (conversion is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["unitCode"] = ["Seçilen birim bu stok kartı için tanımlı değil."] });
        conversionFactor = conversion.FactorToBase;
    }
    if (conversionFactor > 99999999999999.9999m / request.Quantity)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["quantity"] = ["Temel birime çevrilen miktar sınırı aşar."] });
    var baseQuantity = decimal.Round(request.Quantity * conversionFactor, 4, MidpointRounding.AwayFromZero);
    if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["quantity"] = ["Temel birime çevrilen miktar sınır dışında."] });
    var trackingError = ValidateTrackingAllocations(item.TrackingMode, request.Tracking, baseQuantity);
    if (trackingError is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["tracking"] = [trackingError] });
    if (item.TrackingMode != InventoryTrackingMode.None)
    {
        foreach (var trace in request.Tracking ?? [])
        {
            var matches = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.TrackingCode == trace.TrackingCode.Trim()).ToListAsync();
            if (item.TrackingMode == InventoryTrackingMode.Lot && matches.Any(x => x.ExpiryDate != trace.ExpiryDate))
                return Results.Conflict(new { error = $"Lot {trace.TrackingCode} için son kullanma tarihi değiştirilemez." });
            if (request.Direction == InventoryDirection.Issue)
            {
                var availableTrace = await (from t in db.InventoryTransactionTraces.AsNoTracking()
                    join m in db.InventoryTransactions.AsNoTracking() on new { t.TenantId, t.InventoryTransactionId } equals new { m.TenantId, InventoryTransactionId = m.Id }
                    where t.TenantId == tenantId && t.StockItemId == item.Id && t.TrackingCode == trace.TrackingCode.Trim()
                        && t.ExpiryDate == trace.ExpiryDate && m.WarehouseId == warehouseId
                        && (request.StorageLocationId == null || m.StorageLocationId == request.StorageLocationId)
                    select m.Direction == InventoryDirection.Receipt ? t.Quantity : -t.Quantity).SumAsync();
                if (trace.Quantity > availableTrace) return Results.Conflict(new { error = $"{trace.TrackingCode} için izlenen miktar bu depoda yetersiz.", availableQuantity = availableTrace });
            }
            if (request.Direction == InventoryDirection.Receipt && item.TrackingMode == InventoryTrackingMode.Serial)
            {
                if (matches.Count > 0) return Results.Conflict(new { error = $"Seri numarası {trace.TrackingCode} daha önce kullanılmış." });
            }
        }
    }
    var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId)
        .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
    var reservedQuantity = request.Direction == InventoryDirection.Issue
        ? await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == stockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m
        : 0m;
    var allowNegativeStock = request.Direction == InventoryDirection.Issue
        && await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(db, tenantId);
    if (request.Direction == InventoryDirection.Issue && request.StorageLocationId is { } issueLocationId)
    {
        var locationBalance = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                && x.StockItemId == stockItemId && x.StorageLocationId == issueLocationId)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        if (baseQuantity > locationBalance) return Results.Conflict(new { error = "Çıkış miktarı seçilen konumdaki stoktan fazla olamaz.", locationBalance, requestedQuantity = baseQuantity });
    }
    if (request.Direction == InventoryDirection.Issue && baseQuantity > current - reservedQuantity &&
        !TenantOperationalSettingsEndpoints.CanPostNegativeBalance(allowNegativeStock, reservedQuantity, item.TrackingMode, request.StorageLocationId.HasValue))
        return Results.Conflict(new { error = "Çıkış miktarı rezervasyonlar düşüldükten sonra kullanılabilir stoktan fazla olamaz.", currentBalance = current, reservedQuantity, availableQuantity = current - reservedQuantity, requestedQuantity = baseQuantity });
    var unitCostBase = request.Direction == InventoryDirection.Receipt ? request.UnitCostBase
        : await GetWeightedAverageUnitCostBaseAsync(db, tenantId, stockItemId, request.EntryDate);
    var movement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouseId, StockItemId = stockItemId,
        StorageLocationId = storageLocation?.Id,
        EntryDate = request.EntryDate, Direction = request.Direction, Quantity = baseQuantity, EnteredQuantity = request.Quantity,
        EnteredUnitCode = enteredUnitCode, UnitCostBase = unitCostBase, Description = request.Description.Trim() };
    movement.Tracking = (request.Tracking ?? []).Select(x => new InventoryTransactionTrace { TenantId = tenantId, StockItemId = item.Id,
        TrackingMode = item.TrackingMode, TrackingCode = x.TrackingCode.Trim(), Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList();
    db.InventoryTransactions.Add(movement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transaction.created", Resource = movement.Id.ToString() });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions/{movement.Id}",
        new InventoryTransactionView(movement.Id, movement.EntryDate, movement.Direction, movement.Quantity, movement.Description, null, false, false,
            movement.UnitCostBase, movement.EnteredQuantity, movement.EnteredUnitCode, null, movement.StorageLocationId, storageLocation?.Code, storageLocation?.Name));
});
warehouses.MapPost("/{warehouseId:guid}/stock/{stockItemId:guid}/transactions/{entryId:guid}/reverse", async (Guid warehouseId, Guid stockItemId, Guid entryId, InventoryReverseRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var original = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [WarehouseId] = {warehouseId} AND [StockItemId] = {stockItemId} AND [Id] = {entryId}").SingleOrDefaultAsync();
    if (original is null) return Results.NotFound();
    if (original.InventoryTransferId is not null) return Results.Conflict(new { error = "Depo transferi yalnızca transferin tamamı olarak iptal edilebilir." });
    if (original.SalesDeliveryLineId is not null) return Results.Conflict(new { error = "Satış irsaliyesi hareketi, irsaliye iptal işlemiyle geri alınmalıdır." });
    if (original.SalesReturnLineId is not null) return Results.Conflict(new { error = "Satış iadesi hareketi, iade iptal işlemiyle geri alınmalıdır." });
    if (original.PurchaseReceiptLineId is not null) return Results.Conflict(new { error = "Satın alma mal kabul hareketi, mal kabul iptal işlemiyle geri alınmalıdır." });
    if (original.SupplierReturnLineId is not null) return Results.Conflict(new { error = "Alış iadesi hareketi, iade iptal işlemiyle geri alınmalıdır." });
    if (original.ReversalOfId is not null) return Results.Conflict(new { error = "Bir ters kayıt yeniden ters çevrilemez." });
    if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." });
    var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId)
        .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
    var reverseDirection = original.Direction == InventoryDirection.Receipt ? InventoryDirection.Issue : InventoryDirection.Receipt;
    var reservedQuantity = reverseDirection == InventoryDirection.Issue
        ? await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == stockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m
        : 0m;
    if (reverseDirection == InventoryDirection.Issue && original.Quantity > current - reservedQuantity)
        return Results.Conflict(new { error = "Ters kayıt kullanılabilir bakiyeyi negatife düşüreceği için uygulanamadı.", currentBalance = current, reservedQuantity, reversalQuantity = original.Quantity });
    var reversal = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouseId, StockItemId = stockItemId,
        StorageLocationId = original.StorageLocationId,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = reverseDirection, Quantity = original.Quantity,
        EnteredQuantity = original.EnteredQuantity, EnteredUnitCode = original.EnteredUnitCode,
        UnitCostBase = original.UnitCostBase, Description = $"Ters kayıt: {request.Reason.Trim()}", ReversalOfId = original.Id,
        ManufacturingOrderId = original.ManufacturingOrderId };
    var originalTracking = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransactionId == original.Id).ToListAsync();
    reversal.Tracking = originalTracking.Select(x => new InventoryTransactionTrace { TenantId = tenantId, StockItemId = stockItemId,
        TrackingMode = x.TrackingMode, TrackingCode = x.TrackingCode, Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList();
    db.InventoryTransactions.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transaction.reversed", Resource = original.Id.ToString() });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions/{reversal.Id}",
        new InventoryTransactionView(reversal.Id, reversal.EntryDate, reversal.Direction, reversal.Quantity, reversal.Description, reversal.ReversalOfId, true, false,
            reversal.UnitCostBase, reversal.EnteredQuantity, reversal.EnteredUnitCode));
});

warehouses.MapGet("/{warehouseId:guid}/stock/{stockItemId:guid}/cost-adjustments", async (Guid warehouseId, Guid stockItemId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId) || !await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id == stockItemId)) return Results.NotFound();
    var headers = await db.InventoryCostAdjustments.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Lines.Any(line => line.WarehouseId == warehouseId && line.StockItemId == stockItemId))
        .OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.CreatedAt).Take(100).ToListAsync();
    var results = new List<InventoryCostAdjustmentView>();
    foreach (var header in headers) results.Add(await BuildInventoryCostAdjustmentViewAsync(db, tenantId, header));
    return Results.Ok(results);
});
warehouses.MapPost("/{warehouseId:guid}/stock/{stockItemId:guid}/revaluations", async (Guid warehouseId, Guid stockItemId, InventoryCostRevaluationRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (request.AmountBase == 0m || request.AmountBase < -9999999999999999.99m || request.AmountBase > 9999999999999999.99m || request.AmountBase != decimal.Round(request.AmountBase, 2) || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 240)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["adjustment"] = ["Değerleme tutarı sıfır olamaz, en fazla iki ondalık basamak içermeli ve açıklama 240 karakteri aşmamalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {stockItemId}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var latestMovementDate = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId)
        .Select(x => (DateOnly?)x.EntryDate).MaxAsync();
    var latestAdjustmentDate = await db.InventoryCostAdjustmentLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId)
        .Select(x => (DateOnly?)x.Adjustment.EntryDate).MaxAsync();
    var latestCostDate = latestMovementDate is null ? latestAdjustmentDate : latestAdjustmentDate is null ? latestMovementDate : (latestMovementDate > latestAdjustmentDate ? latestMovementDate : latestAdjustmentDate);
    if (request.EntryDate > today || latestCostDate is { } lastDate && request.EntryDate < lastDate)
        return Results.Conflict(new { error = "Yeniden değerleme tarihi bugünden ileri veya bu stok bakiyesinin son hareket/değerleme tarihinden önce olamaz.", latestDate = latestCostDate });
    var rows = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId && x.EntryDate <= request.EntryDate)
        .GroupBy(_ => 1).Select(g => new
        {
            Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
            Unvalued = g.Sum(x => x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m),
            Value = g.Sum(x => x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)
        }).SingleOrDefaultAsync();
    if (rows is null || rows.Quantity <= 0m) return Results.Conflict(new { error = "Yalnızca pozitif bakiyesi olan stok için maliyet yeniden değerlenebilir." });
    if (rows.Unvalued > 0m) return Results.Conflict(new { error = "Maliyetsiz miktar varken yeniden değerleme yapılamaz; önce stok giriş maliyetini tamamlayın.", unvaluedQuantity = rows.Unvalued });
    var priorAdjustments = await db.InventoryCostAdjustmentLines.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId && x.Adjustment.EntryDate <= request.EntryDate)
        .SumAsync(x => (decimal?)x.AmountBase) ?? 0m;
    if (rows.Value + priorAdjustments + request.AmountBase < 0m)
        return Results.Conflict(new { error = "Yeniden değerleme stok değerini negatife düşüremez.", currentValueBase = rows.Value + priorAdjustments });
    var record = new InventoryCostAdjustment { TenantId = tenantId, Code = $"RV-{Guid.NewGuid():N}".ToUpperInvariant(),
        EntryDate = request.EntryDate, Kind = InventoryCostAdjustmentKind.Revaluation, Description = request.Reason.Trim(), CreatedByUserId = GetUserId(principal) };
    record.Lines.Add(new InventoryCostAdjustmentLine { TenantId = tenantId, Adjustment = record, WarehouseId = warehouseId, StockItemId = stockItemId,
        QuantitySnapshot = rows.Quantity, UnitCostSnapshotBase = decimal.Round((rows.Value + priorAdjustments) / rows.Quantity, 8, MidpointRounding.AwayFromZero), AmountBase = request.AmountBase });
    db.InventoryCostAdjustments.Add(record);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-cost.revalued", Resource = record.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/{warehouseId}/stock/{stockItemId}/cost-adjustments/{record.Id}", await BuildInventoryCostAdjustmentViewAsync(db, tenantId, record));
});
warehouses.MapPost("/cost-adjustments/{id:guid}/reverse", async (Guid id, InventoryReverseRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var original = await db.InventoryCostAdjustments.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryCostAdjustments] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (original is null || original.Kind != InventoryCostAdjustmentKind.Revaluation || original.ReversalOfId is not null) return Results.NotFound();
    if (await db.InventoryCostAdjustments.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Bu yeniden değerleme daha önce ters kayıtla iptal edilmiştir." });
    var lines = await db.InventoryCostAdjustmentLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.AdjustmentId == original.Id).ToListAsync();
    var reversal = new InventoryCostAdjustment { TenantId = tenantId, Code = $"RVX-{Guid.NewGuid():N}".ToUpperInvariant(),
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Kind = InventoryCostAdjustmentKind.Reversal,
        Description = $"{original.Code} ters kayıt · {request.Reason.Trim()}", ReversalOfId = original.Id, CreatedByUserId = GetUserId(principal) };
    foreach (var line in lines) reversal.Lines.Add(new InventoryCostAdjustmentLine { TenantId = tenantId, Adjustment = reversal,
        WarehouseId = line.WarehouseId, StockItemId = line.StockItemId, QuantitySnapshot = line.QuantitySnapshot,
        UnitCostSnapshotBase = line.UnitCostSnapshotBase, AmountBase = -line.AmountBase });
    db.InventoryCostAdjustments.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-cost-revaluation.reversed", Resource = original.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu yeniden değerleme daha önce ters kayıtla iptal edilmiştir." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/cost-adjustments/{reversal.Id}", await BuildInventoryCostAdjustmentViewAsync(db, tenantId, reversal));
});

var salesQuotes = app.MapGroup("/api/sales/quotes").RequireAuthorization();
salesQuotes.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var fields = await db.SalesQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label)
        .Select(x => new SalesQuoteCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(fields);
});
salesQuotes.MapPost("/custom-fields", async (SalesQuoteCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.SalesQuoteCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." });
    if (body.IsRequired && await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId && x.Status == SalesQuoteStatus.Draft)) return Results.Conflict(new { error = "Mevcut taslak tekliflere değer girilmeden alan zorunlu açılamaz. Önce isteğe bağlı oluşturun." });
    var definition = new SalesQuoteCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.SalesQuoteCustomFieldDefinitions.Add(definition); db.SalesQuoteCustomFieldDefinitionRevisions.Add(ToSalesQuoteCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-quote-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." }); }
    return Results.Created($"/api/sales/quotes/custom-fields/{definition.Id}", new SalesQuoteCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesQuotes.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, SalesQuoteCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim(); if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket veya metin uzunluğu geçersiz."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var required = body.IsRequired ?? definition.IsRequired; var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 olmalıdır."] });
    if (definition.DataType == CustomFieldDataType.Text && await db.SalesQuoteCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut teklif değerlerini geçersiz kılıyor." });
    if (required && await db.SalesQuotes.AnyAsync(q => q.TenantId == tenantId && q.Status == SalesQuoteStatus.Draft && !db.SalesQuoteCustomFieldValues.Any(v => v.TenantId == tenantId && v.QuoteId == q.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı etkinleştirmek için tüm taslak tekliflerde değer olmalıdır." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == required) return Results.Ok(new SalesQuoteCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.SalesQuoteCustomFieldDefinitionRevisions.Add(ToSalesQuoteCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new SalesQuoteCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesQuotes.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++; db.SalesQuoteCustomFieldDefinitionRevisions.Add(ToSalesQuoteCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
salesQuotes.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.SalesQuoteCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var rows = await db.SalesQuoteCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId).OrderByDescending(x => x.Version).Take(50)
        .Select(x => new SalesQuoteCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(rows);
});
salesQuotes.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, SalesQuoteCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Tanımı geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.SalesQuoteCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound(); if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Alan veri türü değiştirilemez." });
    if (revision.DataType == CustomFieldDataType.Text && await db.SalesQuoteCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength)) return Results.Conflict(new { error = "Bu sürüm mevcut değerleri geçersiz kılıyor." });
    if (revision.IsRequired && await db.SalesQuotes.AnyAsync(q => q.TenantId == tenantId && q.Status == SalesQuoteStatus.Draft && !db.SalesQuoteCustomFieldValues.Any(v => v.TenantId == tenantId && v.QuoteId == q.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı geri yüklemek için tüm taslak tekliflerde değer olmalıdır." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.SalesQuoteCustomFieldDefinitionRevisions.Add(ToSalesQuoteCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new SalesQuoteCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesQuotes.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var rows = await (from definition in db.SalesQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(rows);
});
salesQuotes.MapPut("/{id:guid}/custom-fields", async (Guid id, SalesQuoteCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (body.Values is { Count: > 40 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan gönderilebilir."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound(); if (quote.Status != SalesQuoteStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak teklif özel alanları değiştirilebilir." });
    var definitions = await db.SalesQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var errors = new Dictionary<string, string[]>(); var normalized = new Dictionary<Guid, (SalesQuoteCustomFieldDefinition Definition, string Value)>();
    if (body.Values is not null) foreach (var pair in body.Values)
    {
        var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
        if (definition is null) { errors[$"values.{pair.Key}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { errors[$"values.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id)); if (missing is not null) errors[$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var existing = await db.SalesQuoteCustomFieldValues.Where(x => x.TenantId == tenantId && x.QuoteId == id && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToDictionaryAsync(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var newValue = normalized.GetValueOrDefault(definition.Id).Value; existing.TryGetValue(definition.Id, out var current); var oldValue = current?.Value;
        if (string.Equals(oldValue ?? "", newValue ?? "", StringComparison.Ordinal) && (current is null || current.DefinitionVersion == definition.Version)) continue;
        if (string.IsNullOrEmpty(newValue)) { if (current is not null) db.SalesQuoteCustomFieldValues.Remove(current); }
        else if (current is null) db.SalesQuoteCustomFieldValues.Add(new SalesQuoteCustomFieldValue { TenantId = tenantId, QuoteId = id, DefinitionId = definition.Id, Value = newValue, DefinitionVersion = definition.Version });
        else { current.Value = newValue; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
        db.SalesQuoteCustomFieldValueRevisions.Add(new SalesQuoteCustomFieldValueRevision { TenantId = tenantId, QuoteId = id, DefinitionId = definition.Id, PreviousValue = oldValue, NewValue = newValue, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(await (from definition in db.SalesQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
salesQuotes.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId && x.Id == id) || !await db.SalesQuoteCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await (from revision in db.SalesQuoteCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id && x.DefinitionId == definitionId)
        join definition in db.SalesQuoteCustomFieldDefinitions.AsNoTracking() on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        orderby revision.CreatedAt descending select new SalesQuoteCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label, revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt)).Take(50).ToListAsync();
    return Results.Ok(history);
});
salesQuotes.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, SalesQuoteCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Değeri geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound(); if (quote.Status != SalesQuoteStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak teklif alanları geri yüklenebilir." });
    var definition = await db.SalesQuoteCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    var revision = await db.SalesQuoteCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.QuoteId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (definition is null || revision is null) return Results.NotFound(); var target = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, target, out target) || (definition.IsRequired && target.Length == 0)) return Results.Conflict(new { error = "Önceki değer güncel tanım veya zorunlulukla uyumlu değil." });
    var current = await db.SalesQuoteCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.QuoteId == id && x.DefinitionId == definitionId); var oldValue = current?.Value;
    if (target.Length == 0) { if (current is not null) db.SalesQuoteCustomFieldValues.Remove(current); }
    else if (current is null) db.SalesQuoteCustomFieldValues.Add(new SalesQuoteCustomFieldValue { TenantId = tenantId, QuoteId = id, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.SalesQuoteCustomFieldValueRevisions.Add(new SalesQuoteCustomFieldValueRevision { TenantId = tenantId, QuoteId = id, DefinitionId = definitionId, PreviousValue = oldValue, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new SalesQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});
salesQuotes.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesQuotes.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, principal.FindFirstValue("role")!, "erp.sales-quotes.read", "erp.sales-quotes", query, x => x.Status, x => x.CustomerId) ?? query;
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Customer.Name.Contains(term) || x.Customer.Code.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.QuoteDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesQuoteSummary(x.Id, x.Code, x.CustomerId, x.Customer.Name, x.QuoteDate, x.ValidUntil,
            x.CurrencyCode, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt,
            db.SalesOrders.Any(y => y.TenantId == x.TenantId && y.QuoteId == x.Id))).ToListAsync();
    return Results.Ok(new SalesQuotePage(rows, page, pageSize, total));
});
salesQuotes.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var quote = await db.SalesQuotes.AsNoTracking().Include(x => x.Customer).Include(x => x.Lines).Include(x => x.Order)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (quote is null) return Results.NotFound();
    var lines = quote.Lines.OrderBy(x => x.LineNumber).Select(x => new SalesQuoteLineView(x.LineNumber, x.StockItemId,
        x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
    var customFields = await (from definition in db.SalesQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(new SalesQuoteView(quote.Id, quote.Code, quote.CustomerId, quote.Customer.Name, quote.QuoteDate,
        quote.ValidUntil, quote.CurrencyCode, quote.Status, quote.Notes, quote.Subtotal, quote.DiscountTotal,
        quote.TaxTotal, quote.GrandTotal, quote.CreatedAt, lines, quote.Order is not null, customFields));
});
salesQuotes.MapPost("/", async (SalesQuoteWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SalesQuoteValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu teklif numarası bu firmada zaten kullanılıyor." });
    var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive);
    if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });
    var currencyCode = request.CurrencyCode.Trim().ToUpperInvariant();
    if (currencyCode != customer.CurrencyCode)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Teklif dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var customDefinitions = await db.SalesQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var customFieldErrors = new Dictionary<string, string[]>(); var normalizedCustomFields = new Dictionary<Guid, (SalesQuoteCustomFieldDefinition Definition, string Value)>();
    if (request.CustomFields is { Count: > 40 }) customFieldErrors["customFields"] = ["En fazla 40 özel alan gönderilebilir."];
    if (request.CustomFields is not null) foreach (var pair in request.CustomFields)
    {
        var definition = customDefinitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
        if (definition is null) { customFieldErrors[$"customFields.{pair.Key}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { customFieldErrors[$"customFields.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalizedCustomFields[definition.Id] = (definition, value);
    }
    var missingCustomField = customDefinitions.FirstOrDefault(x => x.IsRequired && !normalizedCustomFields.ContainsKey(x.Id));
    if (missingCustomField is not null) customFieldErrors[$"customFields.{missingCustomField.Code}"] = [$"'{missingCustomField.Label}' alanı zorunludur."];
    if (customFieldErrors.Count > 0) return Results.ValidationProblem(customFieldErrors);
    var requestedItemIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
    var stockItemsById = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && requestedItemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItemsById.Count != requestedItemIds.Length)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satırlardaki stok kartlarından biri bulunamadı veya pasif."] });
    var normalizedLines = new List<(SalesQuoteLineWriteRequest Input, SalesQuoteLineWriteRequest Base)>();
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var item = stockItemsById[input.StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için bu birim etkin değil."] });
        try
        {
            var baseQuantity = checked(input.Quantity * factor.Value); var basePrice = input.UnitPrice / factor.Value;
            if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4) || basePrice > 99999999999999.9999m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü temel miktar ve fiyat için desteklenen hassasiyet sınırını aşıyor."] });
            normalizedLines.Add((input, input with { Quantity = baseQuantity, UnitPrice = basePrice, UnitCode = item.UnitCode }));
        }
        catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor."] }); }
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(normalizedLines.Select(x => SalesQuoteValidation.Calculate(x.Base))); }
    catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Teklif toplamı desteklenen decimal(18,2) sınırını aşıyor."] }); }
    var quote = new SalesQuote { TenantId = tenantId, CustomerId = customer.Id, Code = code, QuoteDate = request.QuoteDate,
        ValidUntil = request.ValidUntil, CurrencyCode = currencyCode, Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = normalizedLines[i].Base; var item = stockItemsById[input.StockItemId]; var amounts = SalesQuoteValidation.Calculate(input);
        quote.Lines.Add(new SalesQuoteLine { TenantId = tenantId, Quote = quote, LineNumber = i + 1, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = input.Quantity, UnitPrice = input.UnitPrice,
            DiscountPercent = input.DiscountPercent, VatPercent = input.VatPercent, LineSubtotal = amounts.LineSubtotal,
            DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    db.SalesQuotes.Add(quote);
    foreach (var field in normalizedCustomFields.Values)
    {
        db.SalesQuoteCustomFieldValues.Add(new SalesQuoteCustomFieldValue { TenantId = tenantId, QuoteId = quote.Id, DefinitionId = field.Definition.Id, Value = field.Value, DefinitionVersion = field.Definition.Version });
        db.SalesQuoteCustomFieldValueRevisions.Add(new SalesQuoteCustomFieldValueRevision { TenantId = tenantId, QuoteId = quote.Id, DefinitionId = field.Definition.Id, NewValue = field.Value, DefinitionVersion = field.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-quote.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu teklif numarası bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    var summary = new SalesQuoteSummary(quote.Id, quote.Code, customer.Id, customer.Name, quote.QuoteDate, quote.ValidUntil,
        quote.CurrencyCode, quote.Status, quote.GrandTotal, quote.Lines.Count, quote.CreatedAt);
    return Results.Created($"/api/sales/quotes/{quote.Id}", summary);
});
salesQuotes.MapPost("/{id:guid}/send", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound();
    if (quote.Status != SalesQuoteStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak teklif iletildi durumuna alınabilir." });
    if (quote.ValidUntil < DateOnly.FromDateTime(DateTime.UtcNow)) return Results.Conflict(new { error = "Geçerlilik tarihi geçmiş teklif iletilemez." });
    quote.Status = SalesQuoteStatus.Sent;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-quote.sent", Resource = quote.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    var customerName = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == quote.CustomerId).Select(x => x.Name).SingleAsync();
    var lineCount = await db.SalesQuoteLines.CountAsync(x => x.TenantId == tenantId && x.QuoteId == quote.Id);
    return Results.Ok(new SalesQuoteSummary(quote.Id, quote.Code, quote.CustomerId, customerName, quote.QuoteDate, quote.ValidUntil,
        quote.CurrencyCode, quote.Status, quote.GrandTotal, lineCount, quote.CreatedAt));
});
salesQuotes.MapPost("/{id:guid}/accept", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
    await UpdateSalesQuoteStatusAsync(id, SalesQuoteStatus.Accepted, principal, db, ct));
salesQuotes.MapPost("/{id:guid}/reject", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
    await UpdateSalesQuoteStatusAsync(id, SalesQuoteStatus.Rejected, principal, db, ct));
salesQuotes.MapPost("/{id:guid}/convert-to-order", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound();
    var alreadyConverted = await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.QuoteId == id);
    if (!SalesQuoteWorkflow.CanConvertToOrder(quote.Status, alreadyConverted))
        return alreadyConverted ? Results.Conflict(new { error = "Bu teklif daha önce satış siparişine dönüştürüldü." }) : Results.Conflict(new { error = "Yalnızca kabul edilmiş teklif siparişe dönüştürülebilir." });
    if (await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, tenantId, quote.Id, ct))
        return Results.Conflict(new { error = "Teklif onay iş akışı tamamlanmadan siparişe dönüştürülemez." });
    var orderFieldDefinitions = await db.SalesOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var quoteFieldValues = await (from value in db.SalesQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id)
        join definition in db.SalesQuoteCustomFieldDefinitions.AsNoTracking() on new { value.TenantId, value.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        select new { definition.Code, value.Value }).ToListAsync();
    var quoteValuesByCode = quoteFieldValues.ToDictionary(x => x.Code, x => x.Value, StringComparer.OrdinalIgnoreCase);
    var copiedOrderFields = new Dictionary<Guid, (SalesOrderCustomFieldDefinition Definition, string Value)>();
    foreach (var definition in orderFieldDefinitions)
    {
        if (!quoteValuesByCode.TryGetValue(definition.Code, out var sourceValue))
        {
            if (definition.IsRequired) return Results.Conflict(new { error = $"'{definition.Label}' alanı zorunludur. Önce kabul edilen teklife bu alanı ve değeri ekleyin." });
            continue;
        }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, sourceValue, out var normalizedValue))
            return Results.Conflict(new { error = $"Teklifteki '{definition.Code}' değeri sipariş alanının veri türü veya uzunluk sınırıyla uyumlu değil." });
        copiedOrderFields[definition.Id] = (definition, normalizedValue);
    }
    var sourceLines = await db.SalesQuoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id).OrderBy(x => x.LineNumber).ToListAsync();
    if (sourceLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen teklif siparişe dönüştürülemez." });
    var orderCode = $"SO-{quote.Id:N}".ToUpperInvariant();
    var order = new SalesOrder { TenantId = tenantId, QuoteId = quote.Id, CustomerId = quote.CustomerId, Code = orderCode,
        OrderDate = DateOnly.FromDateTime(DateTime.UtcNow), CurrencyCode = quote.CurrencyCode, Status = SalesOrderStatus.Open,
        Subtotal = quote.Subtotal, DiscountTotal = quote.DiscountTotal, TaxTotal = quote.TaxTotal, GrandTotal = quote.GrandTotal };
    foreach (var source in sourceLines)
        order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = source.LineNumber,
            StockItemId = source.StockItemId, StockCode = source.StockCode, StockName = source.StockName, UnitCode = source.UnitCode,
            Quantity = source.Quantity, UnitPrice = source.UnitPrice, DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent,
            LineSubtotal = source.LineSubtotal, DiscountAmount = source.DiscountAmount, TaxAmount = source.TaxAmount, LineTotal = source.LineTotal });
    foreach (var field in copiedOrderFields.Values)
    {
        db.SalesOrderCustomFieldValues.Add(new SalesOrderCustomFieldValue { TenantId = tenantId, OrderId = order.Id, DefinitionId = field.Definition.Id, Value = field.Value, DefinitionVersion = field.Definition.Version });
        db.SalesOrderCustomFieldValueRevisions.Add(new SalesOrderCustomFieldValueRevision { TenantId = tenantId, OrderId = order.Id, DefinitionId = field.Definition.Id, NewValue = field.Value, DefinitionVersion = field.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.SalesOrders.Add(order);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-order.created-from-quote", Resource = orderCode });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu teklif daha önce satış siparişine dönüştürüldü." }); }
    await transaction.CommitAsync();
    var customerName = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == order.CustomerId).Select(x => x.Name).SingleAsync();
    return Results.Created($"/api/sales/orders/{order.Id}", new SalesOrderSummary(order.Id, order.Code, quote.Id, quote.Code,
        order.CustomerId, customerName, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt, order.RequestedDeliveryDate));
});
var salesOrders = app.MapGroup("/api/sales/orders").RequireAuthorization();
salesOrders.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    return Results.Ok(await db.SalesOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label)
        .Select(x => new SalesOrderCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync());
});
salesOrders.MapPost("/custom-fields", async (SalesOrderCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.SalesOrderCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." });
    if (body.IsRequired && await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Status == SalesOrderStatus.Open)) return Results.Conflict(new { error = "Açık siparişler doldurulmadan zorunlu alan açılamaz." });
    if (body.IsRequired && await db.SalesQuotes.AnyAsync(q => q.TenantId == tenantId && q.Status == SalesQuoteStatus.Accepted && !db.SalesOrders.Any(o => o.TenantId == tenantId && o.QuoteId == q.Id) &&
        !db.SalesQuoteCustomFieldValues.Any(v => v.TenantId == tenantId && v.QuoteId == q.Id && v.Value != "" && db.SalesQuoteCustomFieldDefinitions.Any(d => d.TenantId == tenantId && d.Id == v.DefinitionId && d.Code == code))))
        return Results.Conflict(new { error = "Siparişe dönüşmemiş kabul edilmiş teklifler bu kod için değer taşımalıdır. Önce teklif alanını oluşturup değeri teklifte saklayın." });
    var definition = new SalesOrderCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.SalesOrderCustomFieldDefinitions.Add(definition); db.SalesOrderCustomFieldDefinitionRevisions.Add(ToSalesOrderCustomFieldRevision(definition, GetUserId(principal), "Created"));
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." }); }
    return Results.Created($"/api/sales/orders/custom-fields/{definition.Id}", new SalesOrderCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesOrders.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, SalesOrderCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim(); if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket veya metin uzunluğu geçersiz."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0; var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 olmalıdır."] });
    if (definition.DataType == CustomFieldDataType.Text && await db.SalesOrderCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut sipariş değerlerini geçersiz kılıyor." });
    if (required && await db.SalesOrders.AnyAsync(o => o.TenantId == tenantId && o.Status == SalesOrderStatus.Open && !db.SalesOrderCustomFieldValues.Any(v => v.TenantId == tenantId && v.OrderId == o.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı etkinleştirmek için tüm açık siparişlerde değer olmalıdır." });
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.SalesOrderCustomFieldDefinitionRevisions.Add(ToSalesOrderCustomFieldRevision(definition, GetUserId(principal), "Updated")); await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new SalesOrderCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesOrders.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++; db.SalesOrderCustomFieldDefinitionRevisions.Add(ToSalesOrderCustomFieldRevision(definition, GetUserId(principal), "Deactivated")); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
salesOrders.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.SalesOrderCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    return Results.Ok(await db.SalesOrderCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId).OrderByDescending(x => x.Version).Take(50)
        .Select(x => new SalesOrderCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync());
});
salesOrders.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, SalesOrderCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Tanımı geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var revision = await db.SalesOrderCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound(); if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Alan veri türü değiştirilemez." });
    if (revision.DataType == CustomFieldDataType.Text && await db.SalesOrderCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength)) return Results.Conflict(new { error = "Bu sürüm mevcut değerleri geçersiz kılıyor." });
    if (revision.IsRequired && await db.SalesOrders.AnyAsync(o => o.TenantId == tenantId && o.Status == SalesOrderStatus.Open && !db.SalesOrderCustomFieldValues.Any(v => v.TenantId == tenantId && v.OrderId == o.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı geri yüklemek için tüm açık siparişlerde değer olmalıdır." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.SalesOrderCustomFieldDefinitionRevisions.Add(ToSalesOrderCustomFieldRevision(definition, GetUserId(principal), "Restored")); await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new SalesOrderCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesOrders.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var rows = await (from definition in db.SalesOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(rows);
});
salesOrders.MapPut("/{id:guid}/custom-fields", async (Guid id, SalesOrderCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (body.Values is { Count: > 40 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 alan gönderilebilir."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound(); if (order.Status != SalesOrderStatus.Open) return Results.Conflict(new { error = "Yalnızca açık sipariş özel alanları değiştirilebilir." });
    var definitions = await db.SalesOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var errors = new Dictionary<string, string[]>(); var normalized = new Dictionary<Guid, (SalesOrderCustomFieldDefinition Definition, string Value)>();
    if (body.Values is not null) foreach (var pair in body.Values)
    {
        var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
        if (definition is null) { errors[$"values.{pair.Key}"] = ["Alan kodu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { errors[$"values.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id)); if (missing is not null) errors[$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var existing = await db.SalesOrderCustomFieldValues.Where(x => x.TenantId == tenantId && x.OrderId == id && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToDictionaryAsync(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var next = normalized.GetValueOrDefault(definition.Id).Value; existing.TryGetValue(definition.Id, out var current); var previous = current?.Value;
        if (string.Equals(previous ?? "", next ?? "", StringComparison.Ordinal) && (current is null || current.DefinitionVersion == definition.Version)) continue;
        if (string.IsNullOrEmpty(next)) { if (current is not null) db.SalesOrderCustomFieldValues.Remove(current); }
        else if (current is null) db.SalesOrderCustomFieldValues.Add(new SalesOrderCustomFieldValue { TenantId = tenantId, OrderId = id, DefinitionId = definition.Id, Value = next, DefinitionVersion = definition.Version });
        else { current.Value = next; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
        db.SalesOrderCustomFieldValueRevisions.Add(new SalesOrderCustomFieldValueRevision { TenantId = tenantId, OrderId = id, DefinitionId = definition.Id, PreviousValue = previous, NewValue = next, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(await (from definition in db.SalesOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
salesOrders.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var history = await (from revision in db.SalesOrderCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.DefinitionId == definitionId)
        join definition in db.SalesOrderCustomFieldDefinitions.AsNoTracking() on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        orderby revision.CreatedAt descending select new SalesOrderCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label, revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt)).Take(50).ToListAsync();
    return Results.Ok(history);
});
salesOrders.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, SalesOrderCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Değeri geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound(); if (order.Status != SalesOrderStatus.Open) return Results.Conflict(new { error = "Yalnızca açık sipariş değerleri geri yüklenebilir." });
    var definition = await db.SalesOrderCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    var revision = await db.SalesOrderCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.OrderId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (definition is null || revision is null) return Results.NotFound(); var target = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, target, out target) || (definition.IsRequired && target.Length == 0)) return Results.Conflict(new { error = "Önceki değer güncel alan tanımıyla uyumlu değil." });
    var current = await db.SalesOrderCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.OrderId == id && x.DefinitionId == definitionId); var previous = current?.Value;
    if (target.Length == 0) { if (current is not null) db.SalesOrderCustomFieldValues.Remove(current); }
    else if (current is null) db.SalesOrderCustomFieldValues.Add(new SalesOrderCustomFieldValue { TenantId = tenantId, OrderId = id, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.SalesOrderCustomFieldValueRevisions.Add(new SalesOrderCustomFieldValueRevision { TenantId = tenantId, OrderId = id, DefinitionId = definitionId, PreviousValue = previous, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new SalesOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});
salesOrders.MapPost("/{id:guid}/reservations", async (Guid id, SalesOrderReservationWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SalesOrderReservationValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var priorRequest = await db.SalesOrderReservations.AsNoTracking().Include(x => x.Warehouse).Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.RequestId == request.RequestId).ToListAsync();
    if (priorRequest.Count > 0)
    {
        if (priorRequest.Any(x => x.OrderId != id || x.WarehouseId != request.WarehouseId))
            return Results.Conflict(new { error = "Bu rezervasyon istek anahtarı başka sipariş veya depoda kullanılmış." });
        return Results.Ok(priorRequest.Select(x => new SalesOrderReservationSummary(x.Id, x.OrderId, x.OrderLineNumber,
            x.WarehouseId, x.Warehouse.Name, x.OrderLine.StockItemId, x.OrderLine.StockCode, x.Quantity, x.FulfilledQuantity,
            x.Status == SalesOrderReservationStatus.Active ? x.Quantity - x.FulfilledQuantity : 0m, x.Status, x.CreatedAt, x.ReleasedAt)));
    }
    if (order.Status != SalesOrderStatus.Open) return Results.Conflict(new { error = "Yalnızca açık satış siparişi için stok ayrılabilir." });
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depodan stok ayrılamaz." });
    if (await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active))
        return Results.Conflict(new { error = "Sipariş satırlarında zaten aktif rezervasyon var. Önce mevcut rezervasyonu bırakın." });
    var orderLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id).OrderBy(x => x.LineNumber).ToListAsync();
    var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var toReserve = orderLines.Select(x => new { Line = x, Quantity = x.Quantity - delivered.GetValueOrDefault(x.LineNumber) }).Where(x => x.Quantity > 0).ToList();
    if (toReserve.Count == 0) return Results.Conflict(new { error = "Siparişte ayrılabilecek açık miktar kalmadı." });
    var stockIds = toReserve.Select(x => x.Line.StockItemId).Distinct().ToArray();
    var stockItems = await db.StockItems.Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItems.Count != stockIds.Length || stockItems.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Sipariş satırlarından en az bir stok kartı bulunamadı veya pasif." });
    var requiredByStock = toReserve.GroupBy(x => x.Line.StockItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    var activeReserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && stockIds.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var balances = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && stockIds.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    foreach (var required in requiredByStock)
    {
        var available = balances.GetValueOrDefault(required.Key) - activeReserved.GetValueOrDefault(required.Key);
        if (required.Value > available)
            return Results.Conflict(new { error = $"{stockItems[required.Key].Code} için depoda rezervasyona uygun stok yok.", stockItemId = required.Key,
                quantityOnHand = balances.GetValueOrDefault(required.Key), alreadyReservedQuantity = activeReserved.GetValueOrDefault(required.Key),
                availableQuantity = Math.Max(0m, available), requestedQuantity = required.Value });
    }
    var reservations = toReserve.Select(x => new SalesOrderReservation { TenantId = tenantId, RequestId = request.RequestId,
        OrderId = id, OrderLineNumber = x.Line.LineNumber, WarehouseId = warehouse.Id, Quantity = x.Quantity }).ToList();
    db.SalesOrderReservations.AddRange(reservations);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.stock-reserved", Resource = order.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/sales/orders/{id}", reservations.Select(x => new SalesOrderReservationSummary(x.Id, x.OrderId,
        x.OrderLineNumber, warehouse.Id, warehouse.Name, toReserve.Single(y => y.Line.LineNumber == x.OrderLineNumber).Line.StockItemId,
        toReserve.Single(y => y.Line.LineNumber == x.OrderLineNumber).Line.StockCode, x.Quantity, 0m, x.Quantity, x.Status, x.CreatedAt, null)));
});
salesOrders.MapPost("/{id:guid}/reservations/release", async (Guid id, SalesOrderReservationReleaseRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = SalesOrderReservationValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var reservations = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active).ToListAsync();
    if (reservations.Count == 0) return Results.Conflict(new { error = "Bu sipariş için aktif stok rezervasyonu yok." });
    foreach (var reservation in reservations) { reservation.Status = SalesOrderReservationStatus.Released; reservation.ReleasedAt = DateTimeOffset.UtcNow; }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.stock-reservation-released", Resource = $"{order.Code}:{request.Reason.Trim()}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { order.Id, order.Code, releasedCount = reservations.Count });
});
salesOrders.MapPost("/{id:guid}/deliveries", async (Guid id, SalesDeliveryWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SalesDeliveryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    // Reserve this tenant-scoped idempotency key for the whole mutation. The
    // unique index also protects the insert if a competing transaction wins.
    var requestKeyOwner = await db.SalesDeliveries.FromSqlInterpolated(
        $"SELECT * FROM [dbo].[SalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [RequestId] = {request.RequestId}")
        .SingleOrDefaultAsync();
    if (requestKeyOwner is not null)
    {
        if (requestKeyOwner.OrderId != id || requestKeyOwner.Status != SalesDeliveryStatus.Posted)
            return Results.Conflict(new { error = "Bu sevkiyat istek anahtarı farklı veya iptal edilmiş bir irsaliyede kullanılmış." });
        var replay = await db.SalesDeliveries.AsNoTracking().Include(x => x.Order).Include(x => x.Warehouse)
            .Include(x => x.Lines).SingleAsync(x => x.TenantId == tenantId && x.Id == requestKeyOwner.Id);
        var replayLineIds = replay.Lines.Select(x => x.Id).ToArray();
        var replayLocations = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId
                && x.SalesDeliveryLineId.HasValue && replayLineIds.Contains(x.SalesDeliveryLineId.Value) && x.ReversalOfId == null)
            .ToDictionaryAsync(x => x.SalesDeliveryLineId!.Value, x => x.StorageLocationId);
        if (!SalesDeliveryIdempotency.MatchesPayload(replay, id, request, replayLocations))
            return Results.Conflict(new { error = "Bu sevkiyat istek anahtarı farklı bir irsaliye içeriğiyle daha önce kullanılmış." });
        return Results.Created($"/api/sales/deliveries/{replay.Id}", new SalesDeliverySummary(replay.Id, replay.Code,
            replay.OrderId, replay.Order.Code, replay.WarehouseId, replay.Warehouse.Name, replay.DeliveryDate,
            replay.Status, replay.Lines.Count, replay.CreatedAt));
    }
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    if (order.Status != SalesOrderStatus.Open) return Results.Conflict(new { error = "Yalnızca açık satış siparişi sevk edilebilir." });
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depodan sevkiyat yapılamaz." });
    var requestedLocationIds = request.Lines.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value).Distinct().ToArray();
    var locationResolution = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantId, warehouse.Id, requestedLocationIds);
    if (locationResolution.Failure == SalesDeliveryLocationFailure.NotFound)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Seçilen stok konumlarından en az biri bu depoya ait değil veya bulunamadı."] });
    if (locationResolution.Failure == SalesDeliveryLocationFailure.Inactive)
        return Results.Conflict(new { error = "Pasif konumdan sevkiyat yapılamaz." });
    var orderLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id).OrderBy(x => x.LineNumber).ToListAsync();
    var orderLinesByNumber = orderLines.ToDictionary(x => x.LineNumber);
    if (request.Lines.Any(x => !orderLinesByNumber.ContainsKey(x.OrderLineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İrsaliye satırlarından biri siparişte bulunamadı."] });
    var requestedStockIds = request.Lines.Select(x => orderLinesByNumber[x.OrderLineNumber].StockItemId).Distinct().ToArray();
    var stockItems = await db.StockItems.Where(x => x.TenantId == tenantId && requestedStockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItems.Count != requestedStockIds.Length || stockItems.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Sevkiyat satırlarından en az birinin stok kartı bulunamadı veya pasif." });
    var enteredQuantities = request.Lines.ToDictionary(x => x.OrderLineNumber, x => (x.Quantity, UnitCode: string.IsNullOrWhiteSpace(x.UnitCode) ? orderLinesByNumber[x.OrderLineNumber].UnitCode : x.UnitCode.Trim().ToUpperInvariant()));
    var normalizedLines = new List<SalesDeliveryLineWriteRequest>(request.Lines.Count);
    foreach (var input in request.Lines)
    {
        var item = stockItems[orderLinesByNumber[input.OrderLineNumber].StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.OrderLineNumber}].unitCode"] = [$"{input.UnitCode} bu stok kartı için etkin birim değil."] });
        var baseQuantity = input.Quantity * factor.Value;
        if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.OrderLineNumber}].quantity"] = ["Temel birime çevrilen miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."] });
        normalizedLines.Add(input with { Quantity = baseQuantity, UnitCode = orderLinesByNumber[input.OrderLineNumber].UnitCode });
    }
    request = request with { Lines = normalizedLines };
    var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var activeReservations = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active)
        .ToDictionaryAsync(x => x.OrderLineNumber);
    foreach (var input in request.Lines)
    {
        var orderLine = orderLinesByNumber[input.OrderLineNumber];
        var remaining = orderLine.Quantity - delivered.GetValueOrDefault(input.OrderLineNumber);
        if (input.Quantity > remaining)
            return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için kalan miktar {remaining}.", orderLineNumber = input.OrderLineNumber, remainingQuantity = remaining });
        if (activeReservations.TryGetValue(input.OrderLineNumber, out var reservation))
        {
            var reservedRemaining = reservation.Quantity - reservation.FulfilledQuantity;
            if (reservation.WarehouseId != warehouse.Id)
                return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} {reservation.WarehouseId} deposunda rezerve edildi.", orderLineNumber = input.OrderLineNumber, reservationWarehouseId = reservation.WarehouseId });
            if (input.Quantity > reservedRemaining)
                return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için rezervasyonda kalan miktar {reservedRemaining}.", orderLineNumber = input.OrderLineNumber, reservedRemainingQuantity = reservedRemaining });
        }
    }
    var requiredByStock = request.Lines.GroupBy(x => orderLinesByNumber[x.OrderLineNumber].StockItemId)
        .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    var requiredByLocationStock = request.Lines.Where(x => x.StorageLocationId.HasValue)
        .GroupBy(x => (StockItemId: orderLinesByNumber[x.OrderLineNumber].StockItemId, StorageLocationId: x.StorageLocationId!.Value));
    foreach (var required in requiredByLocationStock)
    {
        var locationBalance = await SalesDeliveryLocationGuard.GetBalanceAsync(db, tenantId, warehouse.Id, required.Key.StockItemId, required.Key.StorageLocationId);
        var requested = required.Sum(x => x.Quantity);
        if (requested > locationBalance)
            return Results.Conflict(new { error = $"{stockItems[required.Key.StockItemId].Code} için seçilen konumdaki stok yetersiz.",
                required.Key.StorageLocationId, locationBalance, requestedQuantity = requested });
    }
    var reservedElsewhereByStock = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && requestedStockIds.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var allowNegativeStock = await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(db, tenantId);
    var consumedReservationByStock = request.Lines.Where(x => activeReservations.ContainsKey(x.OrderLineNumber))
        .GroupBy(x => orderLinesByNumber[x.OrderLineNumber].StockItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    foreach (var required in requiredByStock)
    {
        var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && x.StockItemId == required.Key)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        var available = current - reservedElsewhereByStock.GetValueOrDefault(required.Key) + consumedReservationByStock.GetValueOrDefault(required.Key);
        var otherOrderReservations = Math.Max(0m, reservedElsewhereByStock.GetValueOrDefault(required.Key) - consumedReservationByStock.GetValueOrDefault(required.Key));
        var hasStorageLocation = request.Lines.Any(x => orderLinesByNumber[x.OrderLineNumber].StockItemId == required.Key && x.StorageLocationId.HasValue);
        if (required.Value > available && !TenantOperationalSettingsEndpoints.CanPostNegativeBalance(allowNegativeStock, otherOrderReservations,
                stockItems[required.Key].TrackingMode, hasStorageLocation))
            return Results.Conflict(new { error = $"{stockItems[required.Key].Code} için depoda rezervasyonlar düşüldükten sonra yeterli stok yok.", stockItemId = required.Key,
                currentBalance = current, reservedQuantity = reservedElsewhereByStock.GetValueOrDefault(required.Key), availableQuantity = available, requestedQuantity = required.Value });
    }
    var code = $"DN-{Guid.NewGuid():N}".ToUpperInvariant();
    var delivery = new SalesDelivery { TenantId = tenantId, RequestId = request.RequestId, OrderId = order.Id, WarehouseId = warehouse.Id, Code = code, DeliveryDate = request.DeliveryDate };
    foreach (var input in request.Lines.OrderBy(x => x.OrderLineNumber))
    {
        var orderLine = orderLinesByNumber[input.OrderLineNumber];
        activeReservations.TryGetValue(input.OrderLineNumber, out var reservation);
        var line = new SalesDeliveryLine { TenantId = tenantId, Delivery = delivery, OrderId = id, OrderLineNumber = orderLine.LineNumber,
            ReservationId = reservation?.Id, StockItemId = orderLine.StockItemId, StockCode = orderLine.StockCode, StockName = orderLine.StockName, UnitCode = orderLine.UnitCode, Quantity = input.Quantity,
            EnteredQuantity = enteredQuantities[input.OrderLineNumber].Quantity, EnteredUnitCode = enteredQuantities[input.OrderLineNumber].UnitCode };
        if (reservation is not null) reservation.FulfilledQuantity += input.Quantity;
        delivery.Lines.Add(line);
        var unitCostBase = await GetWeightedAverageUnitCostBaseAsync(db, tenantId, orderLine.StockItemId, request.DeliveryDate);
        var item = stockItems[orderLine.StockItemId];
        var tracking = await AllocateAvailableTrackingAsync(db, tenantId, warehouse.Id, item, input.Quantity, input.StorageLocationId);
        if (tracking is null) return Results.Conflict(new { error = $"{item.Code} için lot/seri bazında sevk edilebilir miktar yok." });
        var movement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = orderLine.StockItemId,
            StorageLocationId = input.StorageLocationId,
            EntryDate = request.DeliveryDate, Direction = InventoryDirection.Issue, Quantity = input.Quantity,
            UnitCostBase = unitCostBase, Description = $"Satış irsaliyesi {code}", SalesDeliveryLine = line };
        movement.Tracking = ToTraceEntities(tenantId, item, tracking);
        db.InventoryTransactions.Add(movement);
    }
    db.SalesDeliveries.Add(delivery);
    var deliveredAfter = new Dictionary<int, decimal>(delivered);
    foreach (var input in request.Lines) deliveredAfter[input.OrderLineNumber] = deliveredAfter.GetValueOrDefault(input.OrderLineNumber) + input.Quantity;
    order.Status = orderLines.All(x => deliveredAfter.GetValueOrDefault(x.LineNumber) >= x.Quantity) ? SalesOrderStatus.Fulfilled : SalesOrderStatus.Open;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-delivery.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex))
    {
        await transaction.RollbackAsync();
        return Results.Conflict(new { error = "Bu sevkiyat istek anahtarı eşzamanlı başka bir işlemde kullanıldı; stok hareketi oluşturulmadı." });
    }
    await transaction.CommitAsync();
    return Results.Created($"/api/sales/deliveries/{delivery.Id}", new SalesDeliverySummary(delivery.Id, delivery.Code, order.Id, order.Code,
        warehouse.Id, warehouse.Name, delivery.DeliveryDate, delivery.Status, delivery.Lines.Count, delivery.CreatedAt));
});
salesOrders.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, principal.FindFirstValue("role")!, "erp.sales-orders.read", "erp.sales-orders", query, x => x.Status, x => x.CustomerId) ?? query;
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Quote.Code.Contains(term) || x.Customer.Name.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesOrderSummary(x.Id, x.Code, x.QuoteId, x.Quote.Code, x.CustomerId, x.Customer.Name,
            x.OrderDate, x.CurrencyCode, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt, x.RequestedDeliveryDate)).ToListAsync();
    return Results.Ok(new SalesOrderPage(rows, page, pageSize, total));
});
salesOrders.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var order = await db.SalesOrders.AsNoTracking().Include(x => x.Quote).Include(x => x.Customer).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (order is null) return Results.NotFound();
    var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var reservations = await db.SalesOrderReservations.AsNoTracking().Include(x => x.Warehouse)
        .Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active)
        .ToDictionaryAsync(x => x.OrderLineNumber);
    var lines = order.Lines.OrderBy(x => x.LineNumber).Select(x =>
    {
        reservations.TryGetValue(x.LineNumber, out var reservation);
        var deliveredQuantity = delivered.GetValueOrDefault(x.LineNumber);
        return new SalesOrderLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity,
            x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal,
            deliveredQuantity, Math.Max(0m, x.Quantity - deliveredQuantity), reservation?.Id, reservation?.WarehouseId,
            reservation?.Warehouse.Name, reservation is null ? 0m : reservation.Quantity - reservation.FulfilledQuantity);
    }).ToList();
    var customFields = await (from definition in db.SalesOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(new SalesOrderView(order.Id, order.Code, order.QuoteId, order.Quote.Code, order.CustomerId, order.Customer.Name,
        order.OrderDate, order.CurrencyCode, order.Status, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, order.CreatedAt, lines, customFields, order.RequestedDeliveryDate));
});
var salesDeliveries = app.MapGroup("/api/sales/deliveries").RequireAuthorization();
salesDeliveries.MapGet("/", async (Guid? orderId, ClaimsPrincipal principal, TenantDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (orderId is { } requestedOrderId) query = query.Where(x => x.OrderId == requestedOrderId);
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesDeliverySummary(x.Id, x.Code, x.OrderId, x.Order.Code, x.WarehouseId, x.Warehouse.Name,
            x.DeliveryDate, x.Status, x.Lines.Count, x.CreatedAt, db.SalesInvoices.Any(y => y.TenantId == x.TenantId && y.DeliveryId == x.Id),
            db.SalesInvoices.Where(y => y.TenantId == x.TenantId && y.DeliveryId == x.Id).Select(y => (SalesInvoiceStatus?)y.Status).FirstOrDefault(),
            db.SalesInvoices.Where(y => y.TenantId == x.TenantId && y.DeliveryId == x.Id).Select(y => (Guid?)y.Id).FirstOrDefault())).ToListAsync();
    return Results.Ok(new SalesDeliveryPage(rows, page, pageSize, total));
});
salesDeliveries.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var delivery = await db.SalesDeliveries.AsNoTracking().Include(x => x.Order).Include(x => x.Warehouse).Include(x => x.Lines).Include(x => x.Invoice)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (delivery is null) return Results.NotFound();
    var lineIds = delivery.Lines.Select(x => x.Id).ToArray();
    var locationByDeliveryLine = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId
            && x.SalesDeliveryLineId.HasValue && lineIds.Contains(x.SalesDeliveryLineId.Value) && x.ReversalOfId == null)
        .ToDictionaryAsync(x => x.SalesDeliveryLineId!.Value, x => x.StorageLocationId);
    var lines = delivery.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesDeliveryLineView(x.OrderLineNumber,
        x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity, StorageLocationId: locationByDeliveryLine.GetValueOrDefault(x.Id))).ToList();
    return Results.Ok(new SalesDeliveryView(delivery.Id, delivery.Code, delivery.OrderId, delivery.Order.Code, delivery.WarehouseId,
        delivery.Warehouse.Name, delivery.DeliveryDate, delivery.Status, delivery.CreatedAt, lines, delivery.Invoice is not null, delivery.Invoice?.Status, delivery.Invoice?.Id));
});
salesDeliveries.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.OrderId, x.WarehouseId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.OrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var delivery = await db.SalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (delivery is null) return Results.NotFound();
    if (delivery.Status != SalesDeliveryStatus.Posted) return Results.Conflict(new { error = "İrsaliye daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "SalesDelivery", delivery.Id))
        return Results.Conflict(new { error = "İrsaliye yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    if (await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.DeliveryId == id && x.Status == SalesInvoiceStatus.Posted))
        return Results.Conflict(new { error = "İrsaliye önce bağlı satış faturası iptal edilerek kapatılmalıdır." });
    var lines = await db.SalesDeliveryLines.Where(x => x.TenantId == tenantId && x.DeliveryId == id).OrderBy(x => x.Id).ToListAsync();
    foreach (var line in lines)
    {
        if (line.ReservationId is { } reservationId)
        {
            var reservation = await db.SalesOrderReservations.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderReservations] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {reservationId}").SingleOrDefaultAsync();
            if (reservation is null || reservation.FulfilledQuantity < line.Quantity)
                return Results.Conflict(new { error = "İrsaliye satırının stok rezervasyonu bulunamadı veya miktarı tutarsız." });
            reservation.FulfilledQuantity -= line.Quantity;
        }
        var movements = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.SalesDeliveryLineId == line.Id && x.ReversalOfId == null).ToListAsync();
        foreach (var movement in movements)
        {
            if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == movement.Id))
                return Results.Conflict(new { error = "İrsaliye hareketlerinden biri zaten ters kayıtla geri alınmış." });
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
                StorageLocationId = movement.StorageLocationId,
                EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Receipt, Quantity = movement.Quantity,
                UnitCostBase = movement.UnitCostBase, Description = $"İrsaliye iptali {delivery.Code}", ReversalOfId = movement.Id, SalesDeliveryLineId = line.Id,
                Tracking = await CopyTrackingAsync(db, tenantId, movement) });
        }
    }
    delivery.Status = SalesDeliveryStatus.Voided;
    if (order.Status != SalesOrderStatus.Cancelled)
    {
        var orderLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == order.Id).ToListAsync();
        var remainingDeliveries = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Delivery.Status == SalesDeliveryStatus.Posted && x.DeliveryId != id)
            .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
        order.Status = orderLines.All(x => remainingDeliveries.GetValueOrDefault(x.LineNumber) >= x.Quantity) ? SalesOrderStatus.Fulfilled : SalesOrderStatus.Open;
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-delivery.voided", Resource = delivery.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { delivery.Id, delivery.Code, deliveryStatus = delivery.Status, orderStatus = order.Status });
});
salesDeliveries.MapPost("/{id:guid}/invoice", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var delivery = await db.SalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (delivery is null) return Results.NotFound();
    var existing = await db.SalesInvoices.AsNoTracking().Include(x => x.Delivery).Include(x => x.Order).Include(x => x.Customer)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DeliveryId == id);
    if (existing is not null)
        return Results.Ok(new SalesInvoiceSummary(existing.Id, existing.Code, existing.DeliveryId, existing.Delivery.Code, existing.OrderId,
            existing.Order.Code, existing.CustomerId, existing.Customer.Name, existing.InvoiceDate, existing.CurrencyCode,
            existing.Status, existing.GrandTotal, await db.SalesInvoiceLines.CountAsync(x => x.TenantId == tenantId && x.InvoiceId == existing.Id), existing.CreatedAt));
    if (delivery.Status != SalesDeliveryStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş irsaliyeden fatura oluşturulamaz." });
    var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == delivery.OrderId);
    if (order is null) return Results.NotFound();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {order.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    if (customer.CurrencyCode != order.CurrencyCode) return Results.Conflict(new { error = "Müşteri dövizi sipariş dövizinden farklı; fatura oluşturulamadı." });
    var deliveryLines = await db.SalesDeliveryLines.AsNoTracking().Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.DeliveryId == id).OrderBy(x => x.OrderLineNumber).ToListAsync();
    if (deliveryLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen irsaliyeden fatura oluşturulamaz." });
    var invoiceLines = deliveryLines.Select(x =>
    {
        var pricing = x.OrderLine;
        var amounts = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(pricing.StockItemId, x.Quantity,
            pricing.UnitPrice, pricing.DiscountPercent, pricing.VatPercent));
        return (DeliveryLine: x, Pricing: pricing, Amounts: amounts);
    }).ToArray();
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(invoiceLines.Select(x => x.Amounts)); }
    catch (OverflowException) { return Results.Conflict(new { error = "Fatura toplamı desteklenen decimal(18,2) sınırını aşıyor." }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Cari borç kaydı oluşturulabilmesi için fatura toplamı sıfırdan büyük olmalıdır." });
    if (customer.RiskLimit is { } limit && customer.Type is CounterpartyType.Customer or CounterpartyType.Both)
    {
        var currentDebit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var currentCredit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var projectedBalance = currentDebit - currentCredit + totals.GrandTotal;
        if (projectedBalance > limit) return Results.Conflict(new { error = "Fatura tutarı müşteri risk limitini aşacağı için kaydedilmedi.", currentBalance = currentDebit - currentCredit, projectedBalance, riskLimit = limit });
    }
    var code = $"INV-{Guid.NewGuid():N}".ToUpperInvariant();
    var invoice = new SalesInvoice { TenantId = tenantId, DeliveryId = id, OrderId = order.Id, CustomerId = customer.Id,
        Code = code, InvoiceDate = DateOnly.FromDateTime(DateTime.UtcNow), CurrencyCode = order.CurrencyCode,
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    foreach (var row in invoiceLines)
        invoice.Lines.Add(new SalesInvoiceLine { TenantId = tenantId, Invoice = invoice, DeliveryLineId = row.DeliveryLine.Id,
            OrderLineNumber = row.Pricing.LineNumber, StockItemId = row.Pricing.StockItemId, StockCode = row.DeliveryLine.StockCode,
            StockName = row.DeliveryLine.StockName, UnitCode = row.DeliveryLine.UnitCode, Quantity = row.DeliveryLine.Quantity,
            UnitPrice = row.Pricing.UnitPrice, DiscountPercent = row.Pricing.DiscountPercent, VatPercent = row.Pricing.VatPercent,
            LineSubtotal = row.Amounts.LineSubtotal, DiscountAmount = row.Amounts.DiscountAmount, TaxAmount = row.Amounts.TaxAmount, LineTotal = row.Amounts.LineTotal });
    db.SalesInvoices.Add(invoice);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesInvoice = invoice,
        EntryDate = invoice.InvoiceDate, Direction = CustomerLedgerDirection.Debit, Amount = totals.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Satış faturası {code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-invoice.posted", Resource = code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/sales/invoices/{invoice.Id}", new SalesInvoiceSummary(invoice.Id, invoice.Code, invoice.DeliveryId,
        delivery.Code, invoice.OrderId, order.Code, invoice.CustomerId, customer.Name, invoice.InvoiceDate, invoice.CurrencyCode,
        invoice.Status, invoice.GrandTotal, invoice.Lines.Count, invoice.CreatedAt));
});
var salesInvoiceCustomFields = app.MapGroup("/api/sales/invoices").RequireAuthorization();
salesInvoiceCustomFields.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    return Results.Ok(await db.SalesInvoiceCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label)
        .Select(x => new SalesInvoiceCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync());
});
salesInvoiceCustomFields.MapPost("/custom-fields", async (SalesInvoiceCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.SalesInvoiceCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." });
    if (body.IsRequired && await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)) return Results.Conflict(new { error = "Açık faturalarda doldurulmadan zorunlu alan açılamaz." });
    var definition = new SalesInvoiceCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.SalesInvoiceCustomFieldDefinitions.Add(definition); db.SalesInvoiceCustomFieldDefinitionRevisions.Add(ToSalesInvoiceCustomFieldRevision(definition, GetUserId(principal), "Created"));
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." }); }
    return Results.Created($"/api/sales/invoices/custom-fields/{definition.Id}", new SalesInvoiceCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesInvoiceCustomFields.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, SalesInvoiceCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim(); if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket veya metin uzunluğu geçersiz."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesInvoiceCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoiceCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0; var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 olmalıdır."] });
    if (definition.DataType == CustomFieldDataType.Text && await db.SalesInvoiceCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut fatura değerlerini geçersiz kılıyor." });
    if (required && await db.SalesInvoices.AnyAsync(o => o.TenantId == tenantId && o.Status == SalesInvoiceStatus.Posted && !db.SalesInvoiceCustomFieldValues.Any(v => v.TenantId == tenantId && v.InvoiceId == o.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı etkinleştirmek için tüm açık faturalardade değer olmalıdır." });
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.SalesInvoiceCustomFieldDefinitionRevisions.Add(ToSalesInvoiceCustomFieldRevision(definition, GetUserId(principal), "Updated")); await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new SalesInvoiceCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesInvoiceCustomFields.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesInvoiceCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoiceCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++; db.SalesInvoiceCustomFieldDefinitionRevisions.Add(ToSalesInvoiceCustomFieldRevision(definition, GetUserId(principal), "Deactivated")); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
salesInvoiceCustomFields.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.SalesInvoiceCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    return Results.Ok(await db.SalesInvoiceCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId).OrderByDescending(x => x.Version).Take(50)
        .Select(x => new SalesInvoiceCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync());
});
salesInvoiceCustomFields.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, SalesInvoiceCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Tanımı geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.SalesInvoiceCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoiceCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var revision = await db.SalesInvoiceCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound(); if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Alan veri türü değiştirilemez." });
    if (revision.DataType == CustomFieldDataType.Text && await db.SalesInvoiceCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength)) return Results.Conflict(new { error = "Bu sürüm mevcut değerleri geçersiz kılıyor." });
    if (revision.IsRequired && await db.SalesInvoices.AnyAsync(o => o.TenantId == tenantId && o.Status == SalesInvoiceStatus.Posted && !db.SalesInvoiceCustomFieldValues.Any(v => v.TenantId == tenantId && v.InvoiceId == o.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı geri yüklemek için tüm açık faturalardade değer olmalıdır." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.SalesInvoiceCustomFieldDefinitionRevisions.Add(ToSalesInvoiceCustomFieldRevision(definition, GetUserId(principal), "Restored")); await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new SalesInvoiceCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
salesInvoiceCustomFields.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var rows = await (from definition in db.SalesInvoiceCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesInvoiceCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesInvoiceCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(rows);
});
salesInvoiceCustomFields.MapPut("/{id:guid}/custom-fields", async (Guid id, SalesInvoiceCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (body.Values is { Count: > 40 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 alan gönderilebilir."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound(); if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "Yalnızca açık fatura özel alanları değiştirilebilir." });
    var definitions = await db.SalesInvoiceCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoiceCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var errors = new Dictionary<string, string[]>(); var normalized = new Dictionary<Guid, (SalesInvoiceCustomFieldDefinition Definition, string Value)>();
    if (body.Values is not null) foreach (var pair in body.Values)
    {
        var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
        if (definition is null) { errors[$"values.{pair.Key}"] = ["Alan kodu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { errors[$"values.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id)); if (missing is not null) errors[$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var existing = await db.SalesInvoiceCustomFieldValues.Where(x => x.TenantId == tenantId && x.InvoiceId == id && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToDictionaryAsync(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var next = normalized.GetValueOrDefault(definition.Id).Value; existing.TryGetValue(definition.Id, out var current); var previous = current?.Value;
        if (string.Equals(previous ?? "", next ?? "", StringComparison.Ordinal) && (current is null || current.DefinitionVersion == definition.Version)) continue;
        if (string.IsNullOrEmpty(next)) { if (current is not null) db.SalesInvoiceCustomFieldValues.Remove(current); }
        else if (current is null) db.SalesInvoiceCustomFieldValues.Add(new SalesInvoiceCustomFieldValue { TenantId = tenantId, InvoiceId = id, DefinitionId = definition.Id, Value = next, DefinitionVersion = definition.Version });
        else { current.Value = next; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
        db.SalesInvoiceCustomFieldValueRevisions.Add(new SalesInvoiceCustomFieldValueRevision { TenantId = tenantId, InvoiceId = id, DefinitionId = definition.Id, PreviousValue = previous, NewValue = next, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(await (from definition in db.SalesInvoiceCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesInvoiceCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesInvoiceCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
salesInvoiceCustomFields.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var history = await (from revision in db.SalesInvoiceCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == id && x.DefinitionId == definitionId)
        join definition in db.SalesInvoiceCustomFieldDefinitions.AsNoTracking() on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        orderby revision.CreatedAt descending select new SalesInvoiceCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label, revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt)).Take(50).ToListAsync();
    return Results.Ok(history);
});
salesInvoiceCustomFields.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, SalesInvoiceCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!body.Confirmation) return Results.BadRequest(new { error = "Değeri geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound(); if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "Yalnızca açık fatura değerleri geri yüklenebilir." });
    var definition = await db.SalesInvoiceCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    var revision = await db.SalesInvoiceCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.InvoiceId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (definition is null || revision is null) return Results.NotFound(); var target = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, target, out target) || (definition.IsRequired && target.Length == 0)) return Results.Conflict(new { error = "Önceki değer güncel alan tanımıyla uyumlu değil." });
    var current = await db.SalesInvoiceCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.InvoiceId == id && x.DefinitionId == definitionId); var previous = current?.Value;
    if (target.Length == 0) { if (current is not null) db.SalesInvoiceCustomFieldValues.Remove(current); }
    else if (current is null) db.SalesInvoiceCustomFieldValues.Add(new SalesInvoiceCustomFieldValue { TenantId = tenantId, InvoiceId = id, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.SalesInvoiceCustomFieldValueRevisions.Add(new SalesInvoiceCustomFieldValueRevision { TenantId = tenantId, InvoiceId = id, DefinitionId = definitionId, PreviousValue = previous, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new SalesInvoiceCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});

var salesInvoices = app.MapGroup("/api/sales/invoices").RequireAuthorization();
salesInvoices.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, principal.FindFirstValue("role")!, "erp.sales-invoices.read", "erp.sales-invoices", query, x => x.Status, x => x.CustomerId) ?? query;
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Delivery.Code.Contains(term) || x.Order.Code.Contains(term) || x.Customer.Name.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.InvoiceDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesInvoiceSummary(x.Id, x.Code, x.DeliveryId, x.Delivery.Code, x.OrderId, x.Order.Code, x.CustomerId,
            x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(new SalesInvoicePage(rows, page, pageSize, total));
});
salesInvoices.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var invoice = await db.SalesInvoices.AsNoTracking().Include(x => x.Delivery).Include(x => x.Order).Include(x => x.Customer)
        .Include(x => x.Lines).Include(x => x.LedgerEntries).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (invoice is null) return Results.NotFound();
    var customFields = await (from definition in db.SalesInvoiceCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.SalesInvoiceCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new SalesInvoiceCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    var lines = invoice.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesInvoiceLineView(x.Id, x.OrderLineNumber,
        x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.StockItemId)).ToList();
    var ledgerEntryId = invoice.LedgerEntries.Where(x => x.ReversalOfId == null).Select(x => (Guid?)x.Id).FirstOrDefault();
    var collections = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id)
        .OrderBy(x => x.CustomerCollection.CollectionDate).ThenBy(x => x.CustomerCollection.CreatedAt)
        .Select(x => new CustomerCollectionSummary(x.CustomerCollection.Id, x.CustomerCollection.Code,
            x.CustomerCollection.CustomerId, x.CustomerCollection.Customer.Name, invoice.Id, invoice.Code,
            x.CustomerCollection.CollectionDate, x.Amount, x.CustomerCollection.CurrencyCode,
            x.CustomerCollection.PaymentMethod, x.CustomerCollection.Reference, x.CustomerCollection.Status,
            x.CustomerCollection.CreatedAt)).ToListAsync();
    var paidAmount = collections.Where(x => x.Status == CustomerCollectionStatus.Posted).Sum(x => x.Amount);
    var returnEntities = await db.SalesReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id)
        .OrderBy(x => x.ReturnDate).ThenBy(x => x.CreatedAt).ToListAsync();
    var salesReturnLineIds = returnEntities.SelectMany(x => x.Lines).Select(x => x.Id).ToArray();
    var salesReturnLocations = salesReturnLineIds.Length == 0 ? new Dictionary<Guid, Guid?>() : await db.InventoryTransactions.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.SalesReturnLineId.HasValue && salesReturnLineIds.Contains(x.SalesReturnLineId.Value) && x.ReversalOfId == null)
        .ToDictionaryAsync(x => x.SalesReturnLineId!.Value, x => x.StorageLocationId);
    var returns = returnEntities.Select(x => new SalesReturnSummary(x.Id, x.Code, x.SalesInvoiceId, invoice.Code, x.WarehouseId, x.Warehouse.Name,
        x.ReturnDate, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt,
        x.Lines.OrderBy(line => line.OrderLineNumber).Select(line => new SalesReturnLineView(line.SalesInvoiceLineId,
            line.OrderLineNumber, line.StockCode, line.StockName, line.UnitCode, line.Quantity, line.UnitPrice,
            line.DiscountPercent, line.VatPercent, line.LineSubtotal, line.DiscountAmount, line.TaxAmount, line.LineTotal,
            line.EnteredQuantity, line.EnteredUnitCode, salesReturnLocations.GetValueOrDefault(line.Id))).ToList())).ToList();
    var returnedAmount = returns.Where(x => x.Status == SalesReturnStatus.Posted).Sum(x => x.GrandTotal);
    return Results.Ok(new SalesInvoiceView(invoice.Id, invoice.Code, invoice.DeliveryId, invoice.Delivery.Code, invoice.OrderId,
        invoice.Order.Code, invoice.CustomerId, invoice.Customer.Name, invoice.InvoiceDate, invoice.CurrencyCode, invoice.Status,
        invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal, invoice.GrandTotal, ledgerEntryId, invoice.CreatedAt, lines,
        paidAmount, returnedAmount, Math.Max(0, invoice.GrandTotal - paidAmount - returnedAmount), collections, returns, customFields));
});
salesInvoices.MapPost("/{id:guid}/collections", async (Guid id, CustomerCollectionWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = new Dictionary<string, string[]>();
    if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
    if (request.Amount <= 0 || request.Amount > 9999999999999999.99m || request.Amount != decimal.Round(request.Amount, 2)) errors["amount"] = ["Tahsilat tutarı pozitif olmalı ve en fazla iki ondalık basamak içermelidir."];
    var method = request.PaymentMethod?.Trim();
    if (method is not ("Cash" or "Bank transfer" or "Card" or "Check")) errors["paymentMethod"] = ["Ödeme yöntemi Cash, Bank transfer, Card veya Check olmalıdır."];
    if ((method is "Cash" or "Bank transfer") && request.FinancialAccountId is null) errors["financialAccountId"] = ["Nakit veya havale tahsilatı için finans hesabı seçilmelidir."];
    if (method is not ("Cash" or "Bank transfer") && request.FinancialAccountId is not null) errors["financialAccountId"] = ["Finans hesabı yalnızca nakit veya havale tahsilatında kullanılabilir."];
    var reference = request.Reference?.Trim();
    if (reference?.Length > 100) errors["reference"] = ["Referans en fazla 100 karakter olabilir."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
    var tenantExists = await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId);
    if (!tenantExists) return Results.NotFound();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var existingCollection = await db.CustomerCollections.AsNoTracking().Include(x => x.Customer).Include(x => x.FinancialAccount).Include(x => x.Allocations)
        .ThenInclude(x => x.SalesInvoice).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existingCollection is not null)
    {
        var allocation = existingCollection.Allocations.SingleOrDefault(x => x.SalesInvoiceId == invoice.Id);
        if (allocation is null) return Results.Conflict(new { error = "requestId başka bir tahsilat işleminde kullanılmış." });
        return Results.Ok(new CustomerCollectionSummary(existingCollection.Id, existingCollection.Code, existingCollection.CustomerId,
            existingCollection.Customer.Name, invoice.Id, invoice.Code, existingCollection.CollectionDate, allocation.Amount,
            existingCollection.CurrencyCode, existingCollection.PaymentMethod, existingCollection.Reference,
            existingCollection.Status, existingCollection.CreatedAt, existingCollection.FinancialAccountId, existingCollection.FinancialAccount?.Name));
    }
    if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş faturaya tahsilat alınamaz." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    FinancialAccount? financialAccount = null;
    if (request.FinancialAccountId is { } accountId)
    {
        financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (financialAccount is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["financialAccountId"] = ["Finans hesabı bulunamadı."] });
        var expectedType = method == "Cash" ? FinancialAccountType.Cash : FinancialAccountType.Bank;
        if (!financialAccount.IsActive || financialAccount.Type != expectedType || financialAccount.CurrencyCode != invoice.CurrencyCode)
            return Results.Conflict(new { error = "Seçilen finans hesabı tahsilat yöntemi, para birimi veya aktiflik durumu ile uyumlu değil." });
    }
    var paid = await db.CustomerCollectionAllocations.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == id && x.CustomerCollection.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var returned = await db.SalesReturns.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == id && x.Status == SalesReturnStatus.Posted).SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
    var outstanding = Math.Max(0m, invoice.GrandTotal - paid - returned);
    if (outstanding <= 0) return Results.Conflict(new { error = "Fatura tamamen tahsil edilmiş.", outstandingAmount = 0m });
    if (request.Amount > outstanding) return Results.Conflict(new { error = "Tahsilat tutarı kalan fatura bakiyesini aşamaz.", outstandingAmount = outstanding });
    var code = $"RCPT-{Guid.NewGuid():N}".ToUpperInvariant();
    var collection = new CustomerCollection { TenantId = tenantId, CustomerId = customer.Id, RequestId = request.RequestId, Code = code,
        CollectionDate = request.CollectionDate, CurrencyCode = invoice.CurrencyCode, Amount = request.Amount,
        PaymentMethod = method!, Reference = string.IsNullOrWhiteSpace(reference) ? null : reference,
        FinancialAccountId = financialAccount?.Id };
    collection.Allocations.Add(new CustomerCollectionAllocation { TenantId = tenantId, CustomerCollection = collection,
        SalesInvoiceId = invoice.Id, Amount = request.Amount });
    db.CustomerCollections.Add(collection);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id,
        CustomerCollection = collection, EntryDate = request.CollectionDate, Direction = CustomerLedgerDirection.Credit,
        Amount = request.Amount, CurrencyCode = invoice.CurrencyCode, Description = $"Tahsilat {code} · Fatura {invoice.Code}" });
    if (financialAccount is not null) db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId,
        FinancialAccount = financialAccount, CurrencyCode = invoice.CurrencyCode, TransactionDate = request.CollectionDate,
        Direction = FinancialDirection.Inflow, CashFlowCategory = CashFlowCategory.Operating, Amount = request.Amount, Description = $"Müşteri tahsilatı {code}",
        Reference = string.IsNullOrWhiteSpace(reference) ? null : reference, CustomerCollection = collection });
    var collectionJournal = await InvoiceSettlementJournalPosting.CreateAsync(db, tenantId, "CustomerCollection", collection.Id,
        code, customer.Name, request.CollectionDate, invoice.CurrencyCode, request.Amount, method!, financialAccount?.Id, GetUserId(principal));
    if (!collectionJournal.Succeeded) return Results.Conflict(new { error = collectionJournal.Error });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-collection.posted", Resource = code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/customer-collections/{collection.Id}", new CustomerCollectionSummary(collection.Id,
        collection.Code, customer.Id, customer.Name, invoice.Id, invoice.Code, collection.CollectionDate, collection.Amount,
        collection.CurrencyCode, collection.PaymentMethod, collection.Reference, collection.Status, collection.CreatedAt,
        financialAccount?.Id, financialAccount?.Name));
});
salesInvoices.MapPost("/{id:guid}/returns", async (Guid id, SalesReturnWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = new Dictionary<string, string[]>();
    if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
    if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["İade ürünlerinin alınacağı depo seçilmelidir."];
    if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["İade 1 ile 100 arasında fatura satırı içermelidir."];
    if (request.Lines is not null)
    {
        if (request.Lines.GroupBy(x => x.SalesInvoiceLineId).Any(g => g.Count() > 1)) errors["lines"] = ["Aynı fatura satırı iade talebinde yalnızca bir kez bulunabilir."];
        for (var i = 0; i < request.Lines.Count; i++)
        {
            if (request.Lines[i].SalesInvoiceLineId == Guid.Empty || request.Lines[i].Quantity <= 0 || request.Lines[i].Quantity > 99999999999999.9999m || request.Lines[i].Quantity != decimal.Round(request.Lines[i].Quantity, 4))
                errors[$"lines[{i}].quantity"] = ["İade miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            if (request.Lines[i].StorageLocationId == Guid.Empty)
                errors[$"lines[{i}].storageLocationId"] = ["Depo konumu boş GUID olamaz."];
        }
    }
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var returnRequests = request.Lines ?? Array.Empty<SalesReturnLineWriteRequest>();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var existing = await db.SalesReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existing is not null)
    {
        if (existing.SalesInvoiceId != invoice.Id) return Results.Conflict(new { error = "requestId başka bir satış iadesinde kullanılmış." });
        var existingLineIds = existing.Lines.Select(x => x.Id).ToArray();
        var existingLocations = existingLineIds.Length == 0 ? new Dictionary<Guid, Guid?>() : await db.InventoryTransactions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SalesReturnLineId.HasValue && existingLineIds.Contains(x.SalesReturnLineId.Value) && x.ReversalOfId == null)
            .ToDictionaryAsync(x => x.SalesReturnLineId!.Value, x => x.StorageLocationId);
        var replayRequestedLineIds = returnRequests.Select(x => x.SalesInvoiceLineId).ToArray();
        var requestedInvoiceLines = replayRequestedLineIds.Length == 0 ? new Dictionary<Guid, SalesInvoiceLine>() : await db.SalesInvoiceLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.InvoiceId == invoice.Id && replayRequestedLineIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id);
        var existingLinesByInvoiceLine = existing.Lines.ToDictionary(x => x.SalesInvoiceLineId);
        var samePayload = existing.WarehouseId == request.WarehouseId && existing.ReturnDate == request.ReturnDate
            && existing.Lines.Count == returnRequests.Count
            && returnRequests.All(input => requestedInvoiceLines.TryGetValue(input.SalesInvoiceLineId, out var source)
                && existingLinesByInvoiceLine.TryGetValue(input.SalesInvoiceLineId, out var saved)
                && saved.EnteredQuantity == input.Quantity
                && string.Equals(saved.EnteredUnitCode ?? saved.UnitCode,
                    string.IsNullOrWhiteSpace(input.UnitCode) ? source.UnitCode : input.UnitCode.Trim().ToUpperInvariant(), StringComparison.OrdinalIgnoreCase)
                && existingLocations.GetValueOrDefault(saved.Id) == input.StorageLocationId);
        if (!samePayload) return Results.Conflict(new { error = "Bu requestId farklı içerikle daha önce kullanılmış. Yeni bir requestId oluşturun." });
        var existingLines = existing.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesReturnLineView(x.SalesInvoiceLineId,
            x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
            x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.EnteredQuantity, x.EnteredUnitCode, existingLocations.GetValueOrDefault(x.Id))).ToList();
        return Results.Ok(new SalesReturnSummary(existing.Id, existing.Code, existing.SalesInvoiceId, invoice.Code,
            existing.WarehouseId, existing.Warehouse.Name, existing.ReturnDate, existing.Status, existing.GrandTotal,
            existing.Lines.Count, existing.CreatedAt, existingLines));
    }
    if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş faturadan iade oluşturulamaz." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoya satış iadesi alınamaz." });
    var requestedReturnLocationIds = returnRequests.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value).Distinct().ToArray();
    var returnLocationResolution = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantId, warehouse.Id, requestedReturnLocationIds);
    if (returnLocationResolution.Failure != SalesDeliveryLocationFailure.None)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İade konumları etkin olmalı ve seçilen depoya ait olmalıdır."] });
    var invoiceLines = await db.SalesInvoiceLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == invoice.Id).ToDictionaryAsync(x => x.Id);
    if (returnRequests.Any(x => !invoiceLines.ContainsKey(x.SalesInvoiceLineId))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İade satırlarından biri bu faturaya ait değil."] });
    var returnStockIds = returnRequests.Select(x => invoiceLines[x.SalesInvoiceLineId].StockItemId).Distinct().ToArray();
    var returnStockItems = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && returnStockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    var normalizedReturnRequests = new List<SalesReturnLineWriteRequest>(returnRequests.Count);
    var enteredReturnQuantities = new Dictionary<Guid, (decimal Quantity, string UnitCode)>();
    foreach (var input in returnRequests)
    {
        var invoiceLine = invoiceLines[input.SalesInvoiceLineId];
        var item = returnStockItems[invoiceLine.StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.SalesInvoiceLineId}].unitCode"] = [$"{input.UnitCode} bu stok kartı için etkin birim değil."] });
        var baseQuantity = input.Quantity * factor.Value;
        if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.SalesInvoiceLineId}].quantity"] = ["Temel birime çevrilen miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."] });
        enteredReturnQuantities[input.SalesInvoiceLineId] = (input.Quantity, string.IsNullOrWhiteSpace(input.UnitCode) ? invoiceLine.UnitCode : input.UnitCode.Trim().ToUpperInvariant());
        normalizedReturnRequests.Add(input with { Quantity = baseQuantity, UnitCode = invoiceLine.UnitCode });
    }
    returnRequests = normalizedReturnRequests;
    var requestedLineIds = returnRequests.Select(x => x.SalesInvoiceLineId).ToArray();
    var previousTotalsRows = await db.SalesReturnLines.Where(x => x.TenantId == tenantId && requestedLineIds.Contains(x.SalesInvoiceLineId) && x.SalesReturn.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) }).ToListAsync();
    var previouslyReturned = previousTotalsRows.ToDictionary(x => x.Id, x => (x.Quantity, x.Subtotal, x.Discount, x.Tax, x.Total));
    var returnAmounts = new List<(SalesInvoiceLine InvoiceLine, decimal Quantity, SalesQuoteLineAmounts Amounts)>();
    foreach (var line in returnRequests)
    {
        var invoiceLine = invoiceLines[line.SalesInvoiceLineId];
        var prior = previouslyReturned.GetValueOrDefault(invoiceLine.Id);
        if (line.Quantity > invoiceLine.Quantity - prior.Quantity)
            return Results.Conflict(new { error = $"{invoiceLine.StockCode} için iade miktarı faturada kalan miktarı aşamaz.", remainingQuantity = invoiceLine.Quantity - prior.Quantity });
        var amounts = SalesReturnValidation.CalculateIncrementalAmounts(invoiceLine.StockItemId, invoiceLine.UnitPrice,
            invoiceLine.DiscountPercent, invoiceLine.VatPercent, prior.Quantity,
            new SalesQuoteLineAmounts(prior.Subtotal, prior.Discount, prior.Tax, prior.Total), line.Quantity);
        returnAmounts.Add((invoiceLine, line.Quantity, amounts));
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(returnAmounts.Select(x => x.Amounts)); }
    catch (OverflowException) { return Results.Conflict(new { error = "İade toplamı desteklenen decimal(18,2) sınırını aşıyor." }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "İade cari alacak kaydı oluşturabilmek için sıfırdan büyük olmalıdır." });
    var returnCode = $"RET-{Guid.NewGuid():N}".ToUpperInvariant();
    var salesReturn = new SalesReturn { TenantId = tenantId, RequestId = request.RequestId, SalesInvoiceId = invoice.Id,
        CustomerId = customer.Id, WarehouseId = warehouse.Id, Code = returnCode, ReturnDate = request.ReturnDate,
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    foreach (var row in returnAmounts)
    {
        var invoiceLine = row.InvoiceLine;
        var line = new SalesReturnLine { TenantId = tenantId, SalesReturn = salesReturn, SalesInvoiceLineId = invoiceLine.Id,
            OrderLineNumber = invoiceLine.OrderLineNumber, StockItemId = invoiceLine.StockItemId, StockCode = invoiceLine.StockCode,
            StockName = invoiceLine.StockName, UnitCode = invoiceLine.UnitCode, Quantity = row.Quantity, UnitPrice = invoiceLine.UnitPrice,
            EnteredQuantity = enteredReturnQuantities[invoiceLine.Id].Quantity, EnteredUnitCode = enteredReturnQuantities[invoiceLine.Id].UnitCode,
            DiscountPercent = invoiceLine.DiscountPercent, VatPercent = invoiceLine.VatPercent, LineSubtotal = row.Amounts.LineSubtotal,
            DiscountAmount = row.Amounts.DiscountAmount, TaxAmount = row.Amounts.TaxAmount, LineTotal = row.Amounts.LineTotal };
        salesReturn.Lines.Add(line);
        var unitCostBase = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId
            && x.SalesDeliveryLineId == invoiceLine.DeliveryLineId && x.ReversalOfId == null).Select(x => x.UnitCostBase).SingleOrDefaultAsync();
        var stockItem = await db.StockItems.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == invoiceLine.StockItemId);
        IReadOnlyList<InventoryTrackingAllocationRequest> returnTracking = [];
        if (stockItem.TrackingMode != InventoryTrackingMode.None)
        {
            var deliveredMovement = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SalesDeliveryLineId == invoiceLine.DeliveryLineId && x.ReversalOfId == null).SingleOrDefaultAsync();
            if (deliveredMovement is null) return Results.Conflict(new { error = $"{invoiceLine.StockCode} için kaynak sevkiyat hareketi bulunamadı." });
            var originalTraces = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransactionId == deliveredMovement.Id).ToListAsync();
            var alreadyReturned = await (from trace in db.InventoryTransactionTraces.AsNoTracking()
                join movement in db.InventoryTransactions.AsNoTracking() on new { trace.TenantId, trace.InventoryTransactionId } equals new { movement.TenantId, InventoryTransactionId = movement.Id }
                where trace.TenantId == tenantId && movement.SalesReturnLine != null && movement.SalesReturnLine.SalesInvoiceLineId == invoiceLine.Id
                    && movement.Direction == InventoryDirection.Receipt && movement.ReversalOfId == null && movement.SalesReturnLine.SalesReturn.Status == SalesReturnStatus.Posted
                group trace by trace.TrackingCode into g select new { Code = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.Code, x => x.Quantity);
            var left = row.Quantity;
            var selected = new List<InventoryTrackingAllocationRequest>();
            foreach (var trace in originalTraces.OrderBy(x => x.ExpiryDate).ThenBy(x => x.TrackingCode))
            {
                var remainingTrace = trace.Quantity - alreadyReturned.GetValueOrDefault(trace.TrackingCode);
                var take = Math.Min(left, remainingTrace);
                if (take <= 0m) continue;
                selected.Add(new InventoryTrackingAllocationRequest(trace.TrackingCode, take, trace.ExpiryDate));
                left -= take;
                if (left == 0m) break;
            }
            if (left != 0m) return Results.Conflict(new { error = $"{invoiceLine.StockCode} iadesi için orijinal lot/seri kaydı yetersiz." });
            returnTracking = selected;
        }
        var returnMovement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id,
            StockItemId = invoiceLine.StockItemId, EntryDate = request.ReturnDate, Direction = InventoryDirection.Receipt,
            Quantity = row.Quantity, UnitCostBase = unitCostBase,
            StorageLocationId = returnRequests.Single(x => x.SalesInvoiceLineId == invoiceLine.Id).StorageLocationId,
            Description = $"Satış iadesi {returnCode}", SalesReturnLine = line };
        returnMovement.Tracking = ToTraceEntities(tenantId, stockItem, returnTracking);
        db.InventoryTransactions.Add(returnMovement);
    }
    db.SalesReturns.Add(salesReturn);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesReturn = salesReturn,
        EntryDate = request.ReturnDate, Direction = CustomerLedgerDirection.Credit, Amount = totals.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Satış iadesi {returnCode} · Fatura {invoice.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-return.posted", Resource = returnCode });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    var returnLines = salesReturn.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesReturnLineView(x.SalesInvoiceLineId,
        x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.EnteredQuantity, x.EnteredUnitCode,
        returnRequests.Single(r => r.SalesInvoiceLineId == x.SalesInvoiceLineId).StorageLocationId)).ToList();
    return Results.Created($"/api/sales/returns/{salesReturn.Id}", new SalesReturnSummary(salesReturn.Id, salesReturn.Code,
        invoice.Id, invoice.Code, warehouse.Id, warehouse.Name, salesReturn.ReturnDate, salesReturn.Status, salesReturn.GrandTotal,
        salesReturn.Lines.Count, salesReturn.CreatedAt, returnLines));
});
salesInvoices.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "Fatura daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "SalesInvoice", invoice.Id)) return Results.Conflict(new { error = "Fatura yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var activePaid = await db.CustomerCollectionAllocations.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id && x.CustomerCollection.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var activeReturns = await db.SalesReturns.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id && x.Status == SalesReturnStatus.Posted).SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
    if (activePaid > 0 || activeReturns > 0) return Results.Conflict(new { error = "Bu faturada aktif tahsilat veya iade bulunuyor. Önce bağlı kayıtları iptal edin.", paidAmount = activePaid, returnedAmount = activeReturns });
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {invoice.CustomerId} AND [SalesInvoiceId] = {invoice.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (invoice.GrandTotal > 0 && original is null) return Results.Conflict(new { error = "Faturanın cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (original is not null)
    {
        if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id))
            return Results.Conflict(new { error = "Fatura cari hareketi daha önce ters kayıtla kapatılmış." });
        db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesInvoiceId = invoice.Id,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Credit, Amount = original.Amount,
            CurrencyCode = original.CurrencyCode, Description = $"Fatura iptali {invoice.Code}", ReversalOfId = original.Id });
    }
    invoice.Status = SalesInvoiceStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-invoice.voided", Resource = invoice.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { invoice.Id, invoice.Code, invoice.Status });
});
var customerCollections = app.MapGroup("/api/customer-collections").RequireAuthorization();
customerCollections.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var context = await db.CustomerCollections.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.CustomerId, x.FinancialAccountId, x.CurrencyCode, x.Amount, x.PaymentMethod,
            InvoiceId = x.Allocations.Select(a => (Guid?)a.SalesInvoiceId).FirstOrDefault() }).SingleOrDefaultAsync();
    if (context is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    if (context.InvoiceId is { } linkedInvoiceId && await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {linkedInvoiceId}").SingleOrDefaultAsync() is null)
        return Results.Conflict(new { error = "Tahsilatın bağlı faturası bulunamadı." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {context.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var collection = await db.CustomerCollections.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCollections] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (collection is null) return Results.NotFound();
    if (collection.Status != CustomerCollectionStatus.Posted) return Results.Conflict(new { error = "Tahsilat daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "CustomerCollection", collection.Id)) return Results.Conflict(new { error = "Tahsilat yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    FinancialAccount? financialAccount = null;
    FinancialAccountTransaction? financialMovement = null;
    if (context.FinancialAccountId is { } accountId)
    {
        financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (financialAccount is null) return Results.Conflict(new { error = "Tahsilata bağlı finans hesabı bulunamadı." });
        financialMovement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerCollectionId] = {collection.Id}").SingleOrDefaultAsync();
        if (financialMovement is null || financialMovement.Direction != FinancialDirection.Inflow || financialMovement.Amount != collection.Amount)
            return Results.Conflict(new { error = "Tahsilatın finans hareketi kaynak belgeyle eşleşmediği için güvenli iptal yapılamadı." });
        if (financialAccount.Type == FinancialAccountType.Cash)
        {
            var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == accountId)
                .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
            if (balance < financialMovement.Amount) return Results.Conflict(new { error = "Tahsilat iptali mevcut kasa bakiyesini negatife düşüreceği için uygulanamadı.", currentBalance = balance });
        }
        if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == financialMovement.Id))
            return Results.Conflict(new { error = "Tahsilatın finans hareketi daha önce ters kayıtla kapatılmış." });
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccountId = financialAccount.Id,
            CurrencyCode = financialMovement.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = FinancialDirection.Outflow, CashFlowCategory = financialMovement.CashFlowCategory, Amount = financialMovement.Amount, Description = $"Tahsilat iptali {collection.Code}",
            Reference = financialMovement.Reference, ReversalOfId = financialMovement.Id });
    }
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {customer.Id} AND [CustomerCollectionId] = {collection.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (original is null) return Results.Conflict(new { error = "Tahsilatın cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Tahsilat hareketi daha önce ters kayıtla kapatılmış." });
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, CustomerCollectionId = collection.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Debit, Amount = original.Amount,
        CurrencyCode = original.CurrencyCode, Description = $"Tahsilat iptali {collection.Code}", ReversalOfId = original.Id });
    collection.Status = CustomerCollectionStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-collection.voided", Resource = collection.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { collection.Id, collection.Code, collection.Status });
});
var salesReturns = app.MapGroup("/api/sales/returns").RequireAuthorization();
salesReturns.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var invoiceId = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => (Guid?)x.SalesInvoiceId).SingleOrDefaultAsync();
    if (invoiceId is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoiceId.Value}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var salesReturn = await db.SalesReturns.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesReturns] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (salesReturn is null) return Results.NotFound();
    if (salesReturn.Status != SalesReturnStatus.Posted) return Results.Conflict(new { error = "Satış iadesi daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "SalesReturn", salesReturn.Id)) return Results.Conflict(new { error = "Satış iadesi yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {salesReturn.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {salesReturn.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var lines = await db.SalesReturnLines.Where(x => x.TenantId == tenantId && x.SalesReturnId == id).ToListAsync();
    var movements = new List<InventoryTransaction>();
    foreach (var line in lines)
    {
        var lineMovements = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [SalesReturnLineId] = {line.Id} AND [ReversalOfId] IS NULL").ToListAsync();
        movements.AddRange(lineMovements);
    }
    var sourceMovementIds = movements.Select(x => x.Id).ToArray();
    if (await db.InventoryTransactions.AnyAsync(y => y.TenantId == tenantId && y.ReversalOfId != null && sourceMovementIds.Contains(y.ReversalOfId.Value)))
        return Results.Conflict(new { error = "İade stok hareketlerinden biri zaten ters kayıtla geri alınmış." });
    var requiredByItem = movements.GroupBy(x => x.StockItemId).ToDictionary(x => x.Key, x => x.Sum(y => y.Quantity));
    var currentByItem = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && requiredByItem.Keys.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var reservedByItem = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && requiredByItem.Keys.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var unavailable = requiredByItem.FirstOrDefault(x => currentByItem.GetValueOrDefault(x.Key) - reservedByItem.GetValueOrDefault(x.Key) < x.Value);
    if (unavailable.Value > 0) return Results.Conflict(new { error = "İade iptali stok rezervasyonlarını karşılayamaz; önce ilgili rezervasyonları bırakın.", stockItemId = unavailable.Key,
        currentBalance = currentByItem.GetValueOrDefault(unavailable.Key), reservedQuantity = reservedByItem.GetValueOrDefault(unavailable.Key), requiredQuantity = unavailable.Value });
    var originalLedger = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {customer.Id} AND [SalesReturnId] = {salesReturn.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (originalLedger is null) return Results.Conflict(new { error = "İadenin cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == originalLedger.Id)) return Results.Conflict(new { error = "İade cari hareketi daha önce ters kayıtla kapatılmış." });
    foreach (var movement in movements)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Issue, Quantity = movement.Quantity,
            UnitCostBase = movement.UnitCostBase, StorageLocationId = movement.StorageLocationId,
            Description = $"Satış iadesi iptali {salesReturn.Code}", ReversalOfId = movement.Id, SalesReturnLineId = movement.SalesReturnLineId,
            Tracking = await CopyTrackingAsync(db, tenantId, movement) });
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesReturnId = salesReturn.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Debit, Amount = originalLedger.Amount,
        CurrencyCode = originalLedger.CurrencyCode, Description = $"Satış iadesi iptali {salesReturn.Code}", ReversalOfId = originalLedger.Id });
    salesReturn.Status = SalesReturnStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-return.voided", Resource = salesReturn.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { salesReturn.Id, salesReturn.Code, salesReturn.Status });
});
var purchaseRequests = app.MapGroup("/api/purchasing/requests").RequireAuthorization();
purchaseRequests.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new PurchaseRequestCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(definitions);
});
purchaseRequests.MapPost("/custom-fields", async (PurchaseRequestCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$")
        || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType)
        || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Kod, etiket, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.PurchaseRequestCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu özel alan kodu tenant kapsamında daha önce kullanıldı." });
    if (body.IsRequired && await db.PurchaseRequests.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Zorunlu alan oluşturmadan önce mevcut satın alma taleplerini tamamlayın veya alanı isteğe bağlı oluşturun." });
    var definition = new PurchaseRequestCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType,
        MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.PurchaseRequestCustomFieldDefinitions.Add(definition);
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.created", Resource = code });
    await db.SaveChangesAsync();
    return Results.Created($"/api/purchasing/requests/custom-fields/{definition.Id}", new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseRequests.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, PurchaseRequestCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120) return Results.ValidationProblem(new Dictionary<string, string[]> { ["label"] = ["Etiket zorunludur ve en fazla 120 karakter olabilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (definition.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 arasında olmalıdır."] });
    var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && await db.PurchaseRequestCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength))
        return Results.Conflict(new { error = "Mevcut talep değerleri yeni metin uzunluğu sınırını aşıyor." });
    if (required && await db.PurchaseRequests.AnyAsync(request => request.TenantId == tenantId && !db.PurchaseRequestCustomFieldValues.Any(value => value.TenantId == tenantId && value.PurchaseRequestId == request.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Zorunlu yapmak için mevcut tüm satın alma taleplerinde bu alan doldurulmuş olmalıdır." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == required)
        return Results.Ok(new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseRequests.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Özel alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++;
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync(); return Results.NoContent();
});
purchaseRequests.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseRequestCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.PurchaseRequestCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50).Select(x => new PurchaseRequestCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
purchaseRequests.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, PurchaseRequestCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation || body.Version < 1) return Results.BadRequest(new { error = "Geçerli sürüm ve açık geri yükleme onayı gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.PurchaseRequestCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Veri türü geçmiş sürümden geri yüklenemez." });
    if (revision.IsActive && revision.DataType == CustomFieldDataType.Text && await db.PurchaseRequestCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Geçmiş sürümün uzunluk sınırı mevcut talep değerleriyle uyumsuz." });
    if (revision.IsActive && revision.IsRequired && await db.PurchaseRequests.AnyAsync(request => request.TenantId == tenantId && !db.PurchaseRequestCustomFieldValues.Any(value => value.TenantId == tenantId && value.PurchaseRequestId == request.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Bu tanımı zorunlu yapmak için tüm satın alma taleplerinde değer olmalıdır." });
    if (definition.Label == revision.Label && definition.MaxLength == revision.MaxLength && definition.IsRequired == revision.IsRequired && definition.IsActive == revision.IsActive)
        return Results.Conflict(new { error = "Alan tanımı zaten bu sürümle aynı." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.restored", Resource = $"{definition.Code}:v{body.Version}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseRequests.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseRequests.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var values = await db.PurchaseRequestCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id).ToDictionaryAsync(x => x.DefinitionId, x => x.Value);
    return Results.Ok(definitions.Select(x => new PurchaseRequestCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, values.GetValueOrDefault(x.Id) ?? "")).ToArray());
});
purchaseRequests.MapPut("/{id:guid}/custom-fields", async (Guid id, PurchaseRequestCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is null || body.Values.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Submitted) return Results.Conflict(new { error = "Özel alanlar yalnız onay bekleyen talepte değiştirilebilir." });
    var actor = GetUserId(principal);
    if (actor != request.RequestedByUserId && principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (body.Values.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !byCode.ContainsKey(x))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["İstek etkin olmayan veya tenant dışı alan kodu içeriyor."] });
    var normalized = new Dictionary<Guid, (PurchaseRequestCustomFieldDefinition Definition, string Value)>();
    foreach (var (code, raw) in body.Values)
    {
        var definition = byCode[code];
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, raw, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{code}"] = [$"'{definition.Label}' alanının değeri veri türüne veya sınıra uymuyor."] });
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    PurchaseRequestCustomFieldDefinition? missing = null;
    foreach (var definition in definitions)
        if (definition.IsRequired && !normalized.ContainsKey(definition.Id)) { missing = definition; break; }
    if (missing is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."] });
    var existing = await db.PurchaseRequestCustomFieldValues.Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToListAsync();
    var existingById = existing.ToDictionary(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var previous = existingById.GetValueOrDefault(definition.Id)?.Value;
        var next = normalized.GetValueOrDefault(definition.Id).Value ?? "";
        if (string.Equals(previous, next, StringComparison.Ordinal)) continue;
        db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId,
            PurchaseRequestId = id, DefinitionId = definition.Id, PreviousValue = previous, NewValue = next.Length == 0 ? null : next,
            DefinitionVersion = definition.Version, ChangedByUserId = actor });
    }
    db.PurchaseRequestCustomFieldValues.RemoveRange(existing);
    foreach (var (definitionId, value) in normalized) db.PurchaseRequestCustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId,
        PurchaseRequestId = id, DefinitionId = definitionId, Value = value.Value, DefinitionVersion = value.Definition.Version });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actor, Action = "purchase-request-custom-field.values-updated", Resource = request.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(definitions.Select(x => new PurchaseRequestCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, normalized.GetValueOrDefault(x.Id).Value ?? "")).ToArray());
});
purchaseRequests.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseRequests.AnyAsync(x => x.TenantId == tenantId && x.Id == id) || !await db.PurchaseRequestCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await (from value in db.PurchaseRequestCustomFieldValueRevisions.AsNoTracking()
                         join definition in db.PurchaseRequestCustomFieldDefinitions.AsNoTracking() on new { value.TenantId, value.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
                         where value.TenantId == tenantId && value.PurchaseRequestId == id && value.DefinitionId == definitionId
                         orderby value.CreatedAt descending
                         select new PurchaseRequestCustomFieldValueRevisionView(value.Id, value.DefinitionId, definition.Code, definition.Label, value.PreviousValue, value.NewValue, value.DefinitionVersion, value.ChangedByUserId, value.CreatedAt)).Take(50).ToListAsync();
    return Results.Ok(history);
});
purchaseRequests.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, PurchaseRequestCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Geçmiş değeri geri yüklemek için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Submitted) return Results.Conflict(new { error = "Yalnız onay bekleyen taleplerin alan değerleri geri yüklenebilir." });
    var actor = GetUserId(principal);
    if (actor != request.RequestedByUserId && principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    if (definition is null) return Results.NotFound();
    var revision = await db.PurchaseRequestCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseRequestId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (revision is null) return Results.NotFound();
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, revision.PreviousValue, out var target) || (definition.IsRequired && target.Length == 0))
        return Results.Conflict(new { error = "Geçmiş değer güncel alan tanımına uymuyor veya zorunlu alanı boş bırakıyor." });
    var current = await db.PurchaseRequestCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseRequestId == id && x.DefinitionId == definitionId);
    var previous = current?.Value;
    if (string.Equals(previous ?? "", target, StringComparison.Ordinal)) return Results.Conflict(new { error = "Alan değeri zaten seçilen geçmiş durumunda." });
    if (target.Length == 0) { if (current is not null) db.PurchaseRequestCustomFieldValues.Remove(current); }
    else if (current is null) db.PurchaseRequestCustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId, PurchaseRequestId = id, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId, PurchaseRequestId = id, DefinitionId = definitionId, PreviousValue = previous, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = actor });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actor, Action = "purchase-request-custom-field.value-restored", Resource = $"{request.Code}:{definition.Code}:{revision.Id:D}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new PurchaseRequestCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});
purchaseRequests.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, principal.FindFirstValue("role")!, "erp.purchase-requests.read", "erp.purchase-requests", query, x => x.Status, null, null, x => x.RequestedByUserId) ?? query;
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseRequestSummary(x.Id, x.Code, x.RequestDate, x.NeededByDate, x.Description,
            x.RequestedByUserId, x.RequestedBy.User.DisplayName, x.Status, x.ReviewedByUserId,
            x.ReviewedBy == null ? null : x.ReviewedBy.User.DisplayName, x.ReviewNote, x.CreatedAt, x.ReviewedAt, x.Lines.Count,
            x.PurchaseOrder == null ? null : x.PurchaseOrder.Id, x.PurchaseOrder == null ? null : x.PurchaseOrder.Code))
        .ToListAsync();
    return Results.Ok(new PurchaseRequestPage(rows, page, pageSize, total));
});
purchaseRequests.MapPost("/", async (PurchaseRequestWriteRequest request, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseRequestValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var customDefinitions = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    if (!TryNormalizePurchaseRequestFields(request.CustomFields, customDefinitions, out var customValues, out var customErrors))
        return Results.ValidationProblem(customErrors);
    var itemIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (items.Count != itemIds.Length || items.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Talep satırlarından en az bir stok kartı bulunamadı veya pasif." });
    var normalizedQuantities = new decimal[request.Lines.Count];
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var factor = await ResolveStockUnitFactorAsync(db, tenantId, items[input.StockItemId], input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için bu birim etkin değil."] });
        try
        {
            normalizedQuantities[i] = checked(input.Quantity * factor.Value);
            if (normalizedQuantities[i] <= 0m || normalizedQuantities[i] > 99999999999999.9999m || normalizedQuantities[i] != decimal.Round(normalizedQuantities[i], 4))
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Temel birime çevrilen miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."] });
        }
        catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].quantity"] = ["Birim dönüşümü desteklenen miktar sınırını aşıyor."] }); }
    }
    var requesterName = await platformDb.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
    var purchaseRequest = new PurchaseRequest { TenantId = tenantId, RequestedByUserId = userId.Value,
        Code = request.Code.Trim(), RequestDate = request.RequestDate, NeededByDate = request.NeededByDate,
        Description = request.Description.Trim(), Status = PurchaseRequestStatus.Submitted };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var item = items[input.StockItemId];
        purchaseRequest.Lines.Add(new PurchaseRequestLine { TenantId = tenantId, PurchaseRequest = purchaseRequest,
            LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
            UnitCode = item.UnitCode, Quantity = normalizedQuantities[i] });
    }
    db.PurchaseRequests.Add(purchaseRequest);
    foreach (var (definitionId, value) in customValues)
    {
        purchaseRequest.CustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId, DefinitionId = definitionId,
            Value = value.Value, DefinitionVersion = value.Definition.Version });
        db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId,
            PurchaseRequestId = purchaseRequest.Id, DefinitionId = definitionId, NewValue = value.Value,
            DefinitionVersion = value.Definition.Version, ChangedByUserId = userId });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-request.submitted", Resource = purchaseRequest.Code });
    await BusinessRuleEndpoints.ApplyPurchaseRequestRulesAsync(db, purchaseRequest, ct);
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu talep numarası bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    var summary = new PurchaseRequestSummary(purchaseRequest.Id, purchaseRequest.Code, purchaseRequest.RequestDate,
        purchaseRequest.NeededByDate, purchaseRequest.Description, userId.Value, requesterName, purchaseRequest.Status,
        null, null, null, purchaseRequest.CreatedAt, null, purchaseRequest.Lines.Count, null, null);
    return Results.Created($"/api/purchasing/requests/{purchaseRequest.Id}", summary);
});
purchaseRequests.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var request = await db.PurchaseRequests.AsNoTracking().Include(x => x.PurchaseOrder).Include(x => x.RequestedBy).ThenInclude(x => x.User)
        .Include(x => x.ReviewedBy).ThenInclude(x => x!.User).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (request is null) return Results.NotFound();
    var lines = request.Lines.OrderBy(x => x.LineNumber)
        .Select(x => new PurchaseRequestLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity)).ToList();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var savedValues = await db.PurchaseRequestCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id).ToDictionaryAsync(x => x.DefinitionId, x => x.Value);
    var customFields = definitions.Select(x => new PurchaseRequestCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version,
        x.IsRequired, savedValues.GetValueOrDefault(x.Id) ?? "")).ToList();
    return Results.Ok(new PurchaseRequestView(request.Id, request.Code, request.RequestDate, request.NeededByDate,
        request.Description, request.RequestedByUserId, request.RequestedBy.User.DisplayName, request.Status,
        request.ReviewedByUserId, request.ReviewedBy?.User.DisplayName, request.ReviewNote, request.CreatedAt,
        request.ReviewedAt, lines, request.PurchaseOrder?.Id, request.PurchaseOrder?.Code, customFields));
});
var purchaseSupplierQuotes = app.MapGroup("/api/purchasing/supplier-quotes").RequireAuthorization();
purchaseSupplierQuotes.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    return Results.Ok(await db.PurchaseSupplierQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label)
        .Select(x => new PurchaseSupplierQuoteCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync());
});
purchaseSupplierQuotes.MapPost("/custom-fields", async (PurchaseSupplierQuoteCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, türü ve uzunluğu geçerli olmalıdır."] });
    if (await db.PurchaseSupplierQuoteCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Alan kodu tenant içinde zaten kullanılmış." });
    if (body.IsRequired && await db.PurchaseSupplierQuotes.AnyAsync(x => x.TenantId == tenantId && x.Status == PurchaseSupplierQuoteStatus.Submitted)) return Results.Conflict(new { error = "Mevcut teklifler doldurulmadan zorunlu alan açılamaz." });
    var definition = new PurchaseSupplierQuoteCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.PurchaseSupplierQuoteCustomFieldDefinitions.Add(definition); db.PurchaseSupplierQuoteCustomFieldDefinitionRevisions.Add(ToPurchaseSupplierQuoteCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-supplier-quote-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Alan kodu tenant içinde zaten kullanılmış." }); }
    return Results.Created($"/api/purchasing/supplier-quotes/custom-fields/{definition.Id}", new PurchaseSupplierQuoteCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseSupplierQuotes.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, PurchaseSupplierQuoteCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim(); if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket veya metin uzunluğu geçersiz."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseSupplierQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0; var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 olmalıdır."] });
    if (definition.DataType == CustomFieldDataType.Text && await db.PurchaseSupplierQuoteCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut teklif değerlerini geçersiz kılıyor." });
    if (required && await db.PurchaseSupplierQuotes.AnyAsync(q => q.TenantId == tenantId && q.Status == PurchaseSupplierQuoteStatus.Submitted && !db.PurchaseSupplierQuoteCustomFieldValues.Any(v => v.TenantId == tenantId && v.QuoteId == q.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alan için tüm değerlendirmedeki tekliflere değer girilmelidir." });
    if (definition.Label != label || definition.MaxLength != maxLength || definition.IsRequired != required)
    {
        definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
        db.PurchaseSupplierQuoteCustomFieldDefinitionRevisions.Add(ToPurchaseSupplierQuoteCustomFieldRevision(definition, GetUserId(principal), "Updated"));
        await db.SaveChangesAsync();
    }
    await tx.CommitAsync(); return Results.Ok(new PurchaseSupplierQuoteCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseSupplierQuotes.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseSupplierQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++; db.PurchaseSupplierQuoteCustomFieldDefinitionRevisions.Add(ToPurchaseSupplierQuoteCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
purchaseSupplierQuotes.MapGet("/{quoteId:guid}/custom-fields", async (Guid quoteId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.PurchaseSupplierQuotes.AnyAsync(x => x.TenantId == tenantId && x.Id == quoteId)) return Results.NotFound();
    return Results.Ok(await (from definition in db.PurchaseSupplierQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.PurchaseSupplierQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == quoteId) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new PurchaseSupplierQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
purchaseSupplierQuotes.MapPut("/{quoteId:guid}/custom-fields", async (Guid quoteId, PurchaseSupplierQuoteCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (body.Values is { Count: > 40 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 alan gönderilebilir."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var quote = await db.PurchaseSupplierQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {quoteId}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound(); if (quote.Status != PurchaseSupplierQuoteStatus.Submitted) return Results.Conflict(new { error = "Yalnızca değerlendirmedeki teklifler düzenlenebilir." });
    var definitions = await db.PurchaseSupplierQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var errors = new Dictionary<string, string[]>(); var normalized = new Dictionary<Guid, string>();
    if (body.Values is not null) foreach (var pair in body.Values)
    {
        var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
        if (definition is null) { errors[$"values.{pair.Key}"] = ["Alan kodu etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { errors[$"values.{pair.Key}"] = [$"'{definition.Label}' alanı geçersiz."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = value;
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id)); if (missing is not null) errors[$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var existing = await db.PurchaseSupplierQuoteCustomFieldValues.Where(x => x.TenantId == tenantId && x.QuoteId == quoteId && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToDictionaryAsync(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        existing.TryGetValue(definition.Id, out var current); var previous = current?.Value; var next = normalized.GetValueOrDefault(definition.Id) ?? "";
        if (string.Equals(previous ?? "", next, StringComparison.Ordinal) && (current is null || current.DefinitionVersion == definition.Version)) continue;
        if (next.Length == 0) { if (current is not null) db.PurchaseSupplierQuoteCustomFieldValues.Remove(current); }
        else if (current is null) db.PurchaseSupplierQuoteCustomFieldValues.Add(new PurchaseSupplierQuoteCustomFieldValue { TenantId = tenantId, QuoteId = quoteId, DefinitionId = definition.Id, Value = next, DefinitionVersion = definition.Version });
        else { current.Value = next; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
        db.PurchaseSupplierQuoteCustomFieldValueRevisions.Add(new PurchaseSupplierQuoteCustomFieldValueRevision { TenantId = tenantId, QuoteId = quoteId, DefinitionId = definition.Id, PreviousValue = previous, NewValue = next.Length == 0 ? null : next, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-supplier-quote-custom-fields.updated", Resource = quote.Code });
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(await (from definition in db.PurchaseSupplierQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.PurchaseSupplierQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == quoteId) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new PurchaseSupplierQuoteCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
purchaseRequests.MapGet("/{id:guid}/supplier-quotes", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var request = await db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.Id, x.Code }).SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    var tenant = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => new { x.BaseCurrencyCode }).SingleAsync();
    var quotes = await db.PurchaseSupplierQuotes.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines).Include(x => x.CustomFieldValues)
        .Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        .OrderBy(x => x.CreatedAt).ToListAsync();
    var customFieldDefinitions = await db.PurchaseSupplierQuoteCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var currencies = quotes.Select(x => x.CurrencyCode).Where(x => x != tenant.BaseCurrencyCode).Distinct().ToArray();
    var rates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && currencies.Contains(x.CurrencyCode))
        .OrderBy(x => x.RateDate).ThenBy(x => x.Revision).ToListAsync();
    var quoteViews = quotes.Select(x =>
    {
        var applied = x.CurrencyCode == tenant.BaseCurrencyCode ? null : rates.Where(r => r.CurrencyCode == x.CurrencyCode && r.RateDate <= x.QuoteDate)
            .GroupBy(r => r.RateDate).Select(g => g.OrderByDescending(r => r.Revision).First()).OrderByDescending(r => r.RateDate).FirstOrDefault();
        var conversion = x.CurrencyCode == tenant.BaseCurrencyCode ? 1m : applied?.Rate;
        decimal? comparable = null;
        if (conversion is not null) { try { comparable = decimal.Round(x.GrandTotal * conversion.Value, 2, MidpointRounding.AwayFromZero); } catch (OverflowException) { } }
        return new PurchaseSupplierQuoteView(x.Id, x.PurchaseRequestId, request.Code, x.Code, x.SupplierId,
            x.Supplier.Name, x.QuoteDate, x.ValidUntil, x.CurrencyCode, x.Status, x.Subtotal, x.DiscountTotal,
            x.TaxTotal, x.GrandTotal, x.Notes, x.CreatedAt, x.Lines.OrderBy(l => l.RequestLineNumber)
                .Select(l => new PurchaseSupplierQuoteLineView(l.RequestLineNumber, l.StockCode, l.StockName, l.UnitCode,
                    l.Quantity, l.UnitPrice, l.DiscountPercent, l.VatPercent, l.LineSubtotal, l.DiscountAmount, l.TaxAmount, l.LineTotal)).ToList(),
            tenant.BaseCurrencyCode, comparable, conversion, applied?.RateDate,
            customFieldDefinitions.Select(field => new PurchaseSupplierQuoteCustomFieldValueView(field.Id, field.Code, field.Label, field.DataType, field.MaxLength, field.Version, field.IsRequired,
                x.CustomFieldValues.FirstOrDefault(value => value.DefinitionId == field.Id)?.Value ?? "")).ToList());
    }).ToList();
    quoteViews = quoteViews.OrderBy(x => x.ComparableGrandTotal is null ? 1 : 0).ThenBy(x => x.ComparableGrandTotal ?? x.GrandTotal).ThenBy(x => x.CreatedAt).ToList();
    return Results.Ok(quoteViews);
});
purchaseRequests.MapPost("/{id:guid}/supplier-quotes", async (Guid id, PurchaseSupplierQuoteWriteRequest input, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = PurchaseSupplierQuoteValidation.Validate(input);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Approved)
        return Results.Conflict(new { error = "Tedarikçi teklifi yalnızca onaylanmış ve henüz siparişe dönüşmemiş talebe kaydedilebilir." });
    var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == input.SupplierId);
    if (supplier is null) return Results.NotFound();
    if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
        return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });
    var requestLines = await db.PurchaseRequestLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        .OrderBy(x => x.LineNumber).ToListAsync();
    var quoteLinesByNumber = input.Lines.ToDictionary(x => x.RequestLineNumber);
    if (requestLines.Count != quoteLinesByNumber.Count || requestLines.Any(x => !quoteLinesByNumber.ContainsKey(x.LineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Her talep satırı için tam olarak bir tedarikçi fiyatı girilmelidir."] });
    var pricedLines = requestLines.Select(line =>
    {
        var price = quoteLinesByNumber[line.LineNumber];
        return new SalesQuoteLineWriteRequest(line.StockItemId, line.Quantity, price.UnitPrice, price.DiscountPercent, price.VatPercent);
    }).ToArray();
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(pricedLines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    var customFieldDefinitions = await db.PurchaseSupplierQuoteCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuoteCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var customFieldErrors = new Dictionary<string, string[]>(); var customFieldValues = new Dictionary<Guid, string>();
    foreach (var field in customFieldDefinitions)
    {
        string? rawValue = null; input.CustomFields?.TryGetValue(field.Code, out rawValue);
        if (!StockCustomFieldValidation.TryNormalize(field.DataType, field.MaxLength, rawValue, out var normalized)) { customFieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı geçersiz."]; continue; }
        if (normalized.Length > 0) customFieldValues[field.Id] = normalized;
        else if (field.IsRequired) customFieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı zorunludur."];
    }
    if (customFieldErrors.Count > 0) return Results.ValidationProblem(customFieldErrors);
    var quote = new PurchaseSupplierQuote { TenantId = tenantId, PurchaseRequestId = id, SupplierId = supplier.Id,
        Code = input.Code.Trim(), QuoteDate = input.QuoteDate, ValidUntil = input.ValidUntil, CurrencyCode = supplier.CurrencyCode,
        Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(), Subtotal = totals.Subtotal,
        DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < requestLines.Count; i++)
    {
        var line = requestLines[i]; var price = quoteLinesByNumber[line.LineNumber]; var amounts = SalesQuoteValidation.Calculate(pricedLines[i]);
        quote.Lines.Add(new PurchaseSupplierQuoteLine { TenantId = tenantId, Quote = quote, PurchaseRequestId = id,
            RequestLineNumber = line.LineNumber, StockCode = line.StockCode, StockName = line.StockName,
            UnitCode = line.UnitCode, Quantity = line.Quantity, UnitPrice = price.UnitPrice, DiscountPercent = price.DiscountPercent,
            VatPercent = price.VatPercent, LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount,
            TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    foreach (var (definitionId, value) in customFieldValues)
    {
        var field = customFieldDefinitions.Single(x => x.Id == definitionId);
        quote.CustomFieldValues.Add(new PurchaseSupplierQuoteCustomFieldValue { TenantId = tenantId, Quote = quote, DefinitionId = definitionId, Value = value, DefinitionVersion = field.Version });
        quote.CustomFieldValueRevisions.Add(new PurchaseSupplierQuoteCustomFieldValueRevision { TenantId = tenantId, Quote = quote, DefinitionId = definitionId, NewValue = value, DefinitionVersion = field.Version, ChangedByUserId = userId });
    }
    db.PurchaseSupplierQuotes.Add(quote);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.created", Resource = $"{quote.Code}:{request.Code}:{supplier.Name}" });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex))
    { return Results.Conflict(new { error = "Bu tedarikçi teklif numarası bu tedarikçi için daha önce kullanılmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/requests/{id}/supplier-quotes", new PurchaseSupplierQuoteView(quote.Id,
        id, request.Code, quote.Code, supplier.Id, supplier.Name, quote.QuoteDate, quote.ValidUntil, quote.CurrencyCode,
        quote.Status, quote.Subtotal, quote.DiscountTotal, quote.TaxTotal, quote.GrandTotal, quote.Notes, quote.CreatedAt,
        quote.Lines.OrderBy(x => x.RequestLineNumber).Select(x => new PurchaseSupplierQuoteLineView(x.RequestLineNumber,
            x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
            x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList(), CustomFields: customFieldDefinitions.Select(field => new PurchaseSupplierQuoteCustomFieldValueView(field.Id,
                field.Code, field.Label, field.DataType, field.MaxLength, field.Version, field.IsRequired, customFieldValues.GetValueOrDefault(field.Id) ?? "")).ToList()));
});
purchaseRequests.MapPost("/{id:guid}/decision", async (Guid id, PurchaseRequestDecisionRequest decision, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = PurchaseRequestValidation.Validate(decision);
    if (errors is not null) return Results.ValidationProblem(errors);
    var reviewerId = GetUserId(principal);
    if (reviewerId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Submitted) return Results.Conflict(new { error = "Yalnızca inceleme bekleyen talepler karara bağlanabilir." });
    if (await db.TenantWorkflowInstances.AnyAsync(x => x.TenantId == tenantId && x.SubjectType == "PurchaseRequest"
        && x.SubjectId == request.Id && x.Status == "Pending"))
        return Results.Conflict(new { error = "Bu talep için iş akışı onayı bekleniyor. Kararı İş Akışları ekranından verin." });
    if (request.RequestedByUserId == reviewerId) return Results.Conflict(new { error = "Talep sahibi kendi talebini onaylayamaz veya reddedemez." });
    request.Status = decision.Approved ? PurchaseRequestStatus.Approved : PurchaseRequestStatus.Rejected;
    request.ReviewedByUserId = reviewerId; request.ReviewedAt = DateTimeOffset.UtcNow;
    request.ReviewNote = string.IsNullOrWhiteSpace(decision.Note) ? null : decision.Note.Trim();
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = reviewerId,
        Action = decision.Approved ? "purchase-request.approved" : "purchase-request.rejected", Resource = request.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { request.Id, request.Code, request.Status, request.ReviewNote, request.ReviewedAt });
});
purchaseRequests.MapPost("/{id:guid}/order", async (Guid id, PurchaseRequestOrderWriteRequest input, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = PurchaseRequestOrderValidation.Validate(input);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Approved)
        return Results.Conflict(new { error = "Yalnızca onaylanmış ve henüz siparişe dönüşmemiş talepler siparişe çevrilebilir." });
    PurchaseSupplierQuote? sourceQuote = null;
    if (input.SupplierQuoteId is not null)
    {
        sourceQuote = await db.PurchaseSupplierQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [PurchaseRequestId] = {id} AND [Id] = {input.SupplierQuoteId}").SingleOrDefaultAsync();
        if (sourceQuote is null) return Results.NotFound();
        if (sourceQuote.Status != PurchaseSupplierQuoteStatus.Submitted || sourceQuote.SupplierId != input.SupplierId)
            return Results.Conflict(new { error = "Seçilen tedarikçi teklifi bu talep için siparişe uygun değil." });
        if (sourceQuote.ValidUntil is not null && sourceQuote.ValidUntil < DateOnly.FromDateTime(DateTime.UtcNow))
            return Results.Conflict(new { error = "Seçilen tedarikçi teklifinin geçerlilik süresi dolmuş." });
    }
    var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == input.SupplierId);
    if (supplier is null) return Results.NotFound();
    if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
        return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });
    if (sourceQuote is not null && sourceQuote.CurrencyCode != supplier.CurrencyCode)
        return Results.Conflict(new { error = "Tedarikçinin para birimi teklif kaydından sonra değişmiş. Güncel para birimiyle yeni teklif kaydedin." });
    var requestLines = await db.PurchaseRequestLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        .OrderBy(x => x.LineNumber).ToListAsync();
    var pricesByLine = input.Lines.ToDictionary(x => x.LineNumber);
    if (pricesByLine.Count != requestLines.Count || requestLines.Any(x => !pricesByLine.ContainsKey(x.LineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Her talep satırı için tam olarak bir fiyat girilmelidir."] });
    if (sourceQuote is not null)
    {
        var quotePrices = await db.PurchaseSupplierQuoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == sourceQuote.Id)
            .ToDictionaryAsync(x => x.RequestLineNumber);
        if (quotePrices.Count != requestLines.Count || requestLines.Any(line => !quotePrices.TryGetValue(line.LineNumber, out var quoteLine)
            || pricesByLine[line.LineNumber].UnitPrice != quoteLine.UnitPrice
            || pricesByLine[line.LineNumber].DiscountPercent != quoteLine.DiscountPercent
            || pricesByLine[line.LineNumber].VatPercent != quoteLine.VatPercent))
            return Results.Conflict(new { error = "Sipariş fiyatları seçilen tedarikçi teklifindeki fiyatlarla aynı olmalıdır." });
    }
    var stockIds = requestLines.Select(x => x.StockItemId).Distinct().ToArray();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (items.Count != stockIds.Length || items.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Talep satırlarından en az birinin stok kartı bulunamadı veya pasif." });
    var pricedLines = requestLines.Select(line =>
    {
        var price = pricesByLine[line.LineNumber];
        return new SalesQuoteLineWriteRequest(line.StockItemId, line.Quantity, price.UnitPrice, price.DiscountPercent, price.VatPercent);
    }).ToArray();
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(pricedLines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    var orderFieldDefinitions = await db.PurchaseOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var requestFieldValues = await (from value in db.PurchaseRequestCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        join definition in db.PurchaseRequestCustomFieldDefinitions.AsNoTracking() on new { value.TenantId, value.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        select new { definition.Code, value.Value }).ToDictionaryAsync(x => x.Code, x => x.Value, StringComparer.OrdinalIgnoreCase);
    var supplierQuoteFieldValues = sourceQuote is null ? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        : await (from value in db.PurchaseSupplierQuoteCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == sourceQuote.Id)
            join definition in db.PurchaseSupplierQuoteCustomFieldDefinitions.AsNoTracking() on new { value.TenantId, value.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
            select new { definition.Code, value.Value }).ToDictionaryAsync(x => x.Code, x => x.Value, StringComparer.OrdinalIgnoreCase);
    var orderValues = new Dictionary<Guid, string>(); var fieldErrors = new Dictionary<string, string[]>();
    foreach (var field in orderFieldDefinitions)
    {
        var value = requestFieldValues.GetValueOrDefault(field.Code);
        if (input.CustomFields?.TryGetValue(field.Code, out var supplied) == true && !string.IsNullOrWhiteSpace(supplied)) value = supplied;
        if (supplierQuoteFieldValues.TryGetValue(field.Code, out var quoteValue) && !string.IsNullOrWhiteSpace(quoteValue)) value = quoteValue;
        if (!StockCustomFieldValidation.TryNormalize(field.DataType, field.MaxLength, value, out var normalizedValue))
        { fieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı tür veya uzunluk sınırına uymuyor."]; continue; }
        if (normalizedValue.Length > 0) orderValues[field.Id] = normalizedValue;
        else if (field.IsRequired) fieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı zorunludur; talep değerini girin veya siparişte tamamlayın."];
    }
    if (fieldErrors.Count > 0) return Results.ValidationProblem(fieldErrors);
    if (input.ExpectedReceiptDate is { } receiptDate && receiptDate < input.OrderDate)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["expectedReceiptDate"] = ["Beklenen teslim tarihi sipariş tarihinden önce olamaz."] });
    if (input.TargetWarehouseId is { } targetWarehouseId && !await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == targetWarehouseId && x.IsActive))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["targetWarehouseId"] = ["Hedef depo bu tenant içinde aktif olmalıdır."] });
    var order = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, SourcePurchaseRequestId = request.Id,
        SourceSupplierQuoteId = sourceQuote?.Id,
        Code = input.Code.Trim(), OrderDate = input.OrderDate, CurrencyCode = supplier.CurrencyCode,
        ExpectedReceiptDate = input.ExpectedReceiptDate ?? request.NeededByDate, TargetWarehouseId = input.TargetWarehouseId,
        Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(), Subtotal = totals.Subtotal,
        DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < requestLines.Count; i++)
    {
        var line = requestLines[i]; var item = items[line.StockItemId]; var price = pricesByLine[line.LineNumber];
        var amounts = SalesQuoteValidation.Calculate(pricedLines[i]);
        order.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrder = order, LineNumber = line.LineNumber,
            StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = line.Quantity,
            UnitPrice = price.UnitPrice, DiscountPercent = price.DiscountPercent, VatPercent = price.VatPercent,
            LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    foreach (var (definitionId, value) in orderValues)
    {
        var definition = orderFieldDefinitions.Single(x => x.Id == definitionId);
        order.CustomFieldValues.Add(new PurchaseOrderCustomFieldValue { TenantId = tenantId, PurchaseOrder = order, DefinitionId = definitionId, Value = value, DefinitionVersion = definition.Version });
        order.CustomFieldValueRevisions.Add(new PurchaseOrderCustomFieldValueRevision { TenantId = tenantId, PurchaseOrder = order, DefinitionId = definitionId, NewValue = value, DefinitionVersion = definition.Version, ChangedByUserId = userId });
    }
    request.Status = PurchaseRequestStatus.Ordered;
    if (sourceQuote is not null)
    {
        sourceQuote.Status = PurchaseSupplierQuoteStatus.Selected;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.selected", Resource = sourceQuote.Code });
        var otherQuotes = await db.PurchaseSupplierQuotes.Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id && x.Id != sourceQuote.Id
            && x.Status == PurchaseSupplierQuoteStatus.Submitted).ToListAsync();
        foreach (var quote in otherQuotes)
        {
            quote.Status = PurchaseSupplierQuoteStatus.NotSelected;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.not-selected", Resource = quote.Code });
        }
    }
    else
    {
        var unselectedQuotes = await db.PurchaseSupplierQuotes.Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id
            && x.Status == PurchaseSupplierQuoteStatus.Submitted).ToListAsync();
        foreach (var quote in unselectedQuotes)
        {
            quote.Status = PurchaseSupplierQuoteStatus.NotSelected;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.not-selected", Resource = quote.Code });
        }
    }
    if (await BusinessRuleEndpoints.ApplyPurchaseOrderCreatedRulesAsync(db, order, userId.Value, ct))
        order.Status = PurchaseOrderStatus.PendingApproval;
    db.PurchaseOrders.Add(order);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-order.created-from-request", Resource = $"{order.Code}:{request.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-request.ordered", Resource = request.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex))
    { return Results.Conflict(new { error = "Talep zaten siparişe dönüştürülmüş veya sipariş numarası bu firmada kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/orders/{order.Id}", new PurchaseOrderSummary(order.Id, order.Code, supplier.Id,
        supplier.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt, order.ExpectedReceiptDate, order.TargetWarehouseId));
});

var purchaseReceiptFields = app.MapGroup("/api/purchasing/receipts").RequireAuthorization();
purchaseReceiptFields.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    return Results.Ok(await db.PurchaseReceiptCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label)
        .Select(x => new PurchaseReceiptCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync());
});
purchaseReceiptFields.MapPost("/custom-fields", async (PurchaseReceiptCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve uzunluğu geçerli olmalıdır."] });
    if (await db.PurchaseReceiptCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Alan kodu tenant içinde zaten kullanılmış." });
    var definition = new PurchaseReceiptCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.PurchaseReceiptCustomFieldDefinitions.Add(definition); db.PurchaseReceiptCustomFieldDefinitionRevisions.Add(ToPurchaseReceiptCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-receipt-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Alan kodu tenant içinde zaten kullanılmış." }); }
    return Results.Created($"/api/purchasing/receipts/custom-fields/{definition.Id}", new PurchaseReceiptCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseReceiptFields.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, PurchaseReceiptCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim(); if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket veya uzunluk geçersiz."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseReceiptCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceiptCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0; var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 olmalıdır."] });
    if (definition.DataType == CustomFieldDataType.Text && await db.PurchaseReceiptCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut değerleri geçersiz kılıyor." });
    if (definition.Label != label || definition.MaxLength != maxLength || definition.IsRequired != required)
    {
        definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
        db.PurchaseReceiptCustomFieldDefinitionRevisions.Add(ToPurchaseReceiptCustomFieldRevision(definition, GetUserId(principal), "Updated")); await db.SaveChangesAsync();
    }
    await tx.CommitAsync(); return Results.Ok(new PurchaseReceiptCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseReceiptFields.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseReceiptCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceiptCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++; db.PurchaseReceiptCustomFieldDefinitionRevisions.Add(ToPurchaseReceiptCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
purchaseReceiptFields.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.PurchaseReceiptCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    return Results.Ok(await db.PurchaseReceiptCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId).OrderByDescending(x => x.Version).Take(50)
        .Select(x => new PurchaseReceiptCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync());
});

var purchaseOrders = app.MapGroup("/api/purchasing/orders").RequireAuthorization();
purchaseOrders.MapGet("/custom-fields", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    return Results.Ok(await db.PurchaseOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label)
        .Select(x => new PurchaseOrderCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync());
});
purchaseOrders.MapPost("/custom-fields", async (PurchaseOrderCustomFieldCreateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.PurchaseOrderCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." });
    if (body.IsRequired && await db.PurchaseOrders.AnyAsync(x => x.TenantId == tenantId && (x.Status == PurchaseOrderStatus.Open || x.Status == PurchaseOrderStatus.PartiallyReceived || x.Status == PurchaseOrderStatus.PendingApproval))) return Results.Conflict(new { error = "Açık siparişler doldurulmadan zorunlu alan açılamaz." });
    var definition = new PurchaseOrderCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.PurchaseOrderCustomFieldDefinitions.Add(definition); db.PurchaseOrderCustomFieldDefinitionRevisions.Add(ToPurchaseOrderCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-order-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu alan kodu tenant içinde daha önce kullanılmış." }); }
    return Results.Created($"/api/purchasing/orders/custom-fields/{definition.Id}", new PurchaseOrderCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseOrders.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, PurchaseOrderCustomFieldUpdateRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim(); if (string.IsNullOrWhiteSpace(label) || label.Length > 120 || body.MaxLength is < 0 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Etiket veya uzunluk sınırı geçersiz."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0; var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && maxLength < 1) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 olmalıdır."] });
    if (definition.DataType == CustomFieldDataType.Text && await db.PurchaseOrderCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength)) return Results.Conflict(new { error = "Yeni uzunluk mevcut sipariş değerlerini geçersiz kılıyor." });
    if (required && await db.PurchaseOrders.AnyAsync(o => o.TenantId == tenantId && (o.Status == PurchaseOrderStatus.Open || o.Status == PurchaseOrderStatus.PartiallyReceived || o.Status == PurchaseOrderStatus.PendingApproval) && !db.PurchaseOrderCustomFieldValues.Any(v => v.TenantId == tenantId && v.PurchaseOrderId == o.Id && v.DefinitionId == definitionId && v.Value != ""))) return Results.Conflict(new { error = "Zorunlu alanı etkinleştirmek için tüm açık siparişlerde değer olmalıdır." });
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.PurchaseOrderCustomFieldDefinitionRevisions.Add(ToPurchaseOrderCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new PurchaseOrderCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseOrders.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var tx = await db.Database.BeginTransactionAsync(); var definition = await db.PurchaseOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound(); if (!definition.IsActive) return Results.Conflict(new { error = "Alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++; db.PurchaseOrderCustomFieldDefinitionRevisions.Add(ToPurchaseOrderCustomFieldRevision(definition, GetUserId(principal), "Deactivated")); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
purchaseOrders.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseOrderCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    return Results.Ok(await db.PurchaseOrderCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50).Select(x => new PurchaseOrderCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code,
            x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync());
});
purchaseOrders.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, PurchaseOrderCustomFieldRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Tanımı geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.PurchaseOrderCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Alan veri türü değiştirilemez." });
    if (revision.DataType == CustomFieldDataType.Text && await db.PurchaseOrderCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Bu sürüm mevcut değerleri geçersiz kılıyor." });
    if (revision.IsRequired && await db.PurchaseOrders.AnyAsync(o => o.TenantId == tenantId && (o.Status == PurchaseOrderStatus.Open || o.Status == PurchaseOrderStatus.PartiallyReceived || o.Status == PurchaseOrderStatus.PendingApproval)
        && !db.PurchaseOrderCustomFieldValues.Any(v => v.TenantId == tenantId && v.PurchaseOrderId == o.Id && v.DefinitionId == definitionId && v.Value != "")))
        return Results.Conflict(new { error = "Zorunlu alanı geri yüklemek için tüm açık siparişlerde değer olmalıdır." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.PurchaseOrderCustomFieldDefinitionRevisions.Add(ToPurchaseOrderCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new PurchaseOrderCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseOrders.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.PurchaseOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    return Results.Ok(await (from definition in db.PurchaseOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.PurchaseOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new PurchaseOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
purchaseOrders.MapPut("/{id:guid}/custom-fields", async (Guid id, PurchaseOrderCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (body.Values is { Count: > 40 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan gönderilebilir."] });
    await using var tx = await db.Database.BeginTransactionAsync(); var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound(); if (!PurchaseOrderWorkflow.CanEdit(order.Status)) return Results.Conflict(new { error = "Yalnızca açık veya kısmi mal kabul durumundaki sipariş alanları değiştirilebilir." });
    var definitions = await db.PurchaseOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var errors = new Dictionary<string, string[]>(); var normalized = new Dictionary<Guid, (PurchaseOrderCustomFieldDefinition Definition, string Value)>();
    if (body.Values is not null) foreach (var pair in body.Values)
    {
        var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase)); if (definition is null) { errors[$"values.{pair.Key}"] = ["Alan kodu tenant içinde etkin değil."]; continue; }
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value)) { errors[$"values.{pair.Key}"] = [$"'{definition.Label}' alanı tür veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missing = definitions.FirstOrDefault(x => x.IsRequired && !normalized.ContainsKey(x.Id)); if (missing is not null) errors[$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var existing = await db.PurchaseOrderCustomFieldValues.Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToDictionaryAsync(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var next = normalized.GetValueOrDefault(definition.Id).Value; existing.TryGetValue(definition.Id, out var current); var previous = current?.Value;
        if (string.Equals(previous ?? "", next ?? "", StringComparison.Ordinal) && (current is null || current.DefinitionVersion == definition.Version)) continue;
        if (string.IsNullOrEmpty(next)) { if (current is not null) db.PurchaseOrderCustomFieldValues.Remove(current); }
        else if (current is null) db.PurchaseOrderCustomFieldValues.Add(new PurchaseOrderCustomFieldValue { TenantId = tenantId, PurchaseOrderId = id, DefinitionId = definition.Id, Value = next, DefinitionVersion = definition.Version });
        else { current.Value = next; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
        db.PurchaseOrderCustomFieldValueRevisions.Add(new PurchaseOrderCustomFieldValueRevision { TenantId = tenantId, PurchaseOrderId = id, DefinitionId = definition.Id, PreviousValue = previous, NewValue = next, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-order-custom-fields.updated", Resource = order.Code }); await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(await (from definition in db.PurchaseOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.PurchaseOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new PurchaseOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync());
});
purchaseOrders.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid(); if (!await db.PurchaseOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    return Results.Ok(await (from revision in db.PurchaseOrderCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.DefinitionId == definitionId)
        join definition in db.PurchaseOrderCustomFieldDefinitions.AsNoTracking() on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        orderby revision.CreatedAt descending select new PurchaseOrderCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label, revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt)).Take(50).ToListAsync());
});
purchaseOrders.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, PurchaseOrderCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Değeri geri yüklemek için açık onay gerekir." });
    await using var tx = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    if (!PurchaseOrderWorkflow.CanEdit(order.Status)) return Results.Conflict(new { error = "Yalnızca açık veya kısmi mal kabul siparişleri değiştirilebilir." });
    var definition = await db.PurchaseOrderCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    var revision = await db.PurchaseOrderCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (definition is null || revision is null) return Results.NotFound();
    var target = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, target, out target) || (definition.IsRequired && target.Length == 0))
        return Results.Conflict(new { error = "Önceki değer güncel alan tanımıyla uyumlu değil." });
    var current = await db.PurchaseOrderCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.DefinitionId == definitionId);
    var previous = current?.Value;
    if (target.Length == 0) { if (current is not null) db.PurchaseOrderCustomFieldValues.Remove(current); }
    else if (current is null) db.PurchaseOrderCustomFieldValues.Add(new PurchaseOrderCustomFieldValue { TenantId = tenantId, PurchaseOrderId = id, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.PurchaseOrderCustomFieldValueRevisions.Add(new PurchaseOrderCustomFieldValueRevision { TenantId = tenantId, PurchaseOrderId = id, DefinitionId = definitionId,
        PreviousValue = previous, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Ok(new PurchaseOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});
purchaseOrders.MapPost("/", async (PurchaseOrderWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseOrderValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SupplierId);
    if (supplier is null) return Results.NotFound();
    if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
        return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });
    var currency = request.CurrencyCode.Trim().ToUpperInvariant();
    if (currency != supplier.CurrencyCode) return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Tedarikçi para birimi {supplier.CurrencyCode} olmalıdır."] });
    if (request.ExpectedReceiptDate is { } expectedDate && expectedDate < request.OrderDate) return Results.ValidationProblem(new Dictionary<string, string[]> { ["expectedReceiptDate"] = ["Beklenen teslim tarihi sipariş tarihinden önce olamaz."] });
    if (request.TargetWarehouseId is { } warehouseId && !await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId && x.IsActive)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["targetWarehouseId"] = ["Hedef depo bu tenant içinde aktif olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var fieldDefinitions = await db.PurchaseOrderCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrderCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var fieldErrors = new Dictionary<string, string[]>(); var fieldValues = new Dictionary<Guid, string>();
    foreach (var field in fieldDefinitions)
    {
        string? input = null; request.CustomFields?.TryGetValue(field.Code, out input);
        if (!StockCustomFieldValidation.TryNormalize(field.DataType, field.MaxLength, input, out var value)) { fieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı tür veya uzunluk sınırına uymuyor."]; continue; }
        if (value.Length > 0) fieldValues[field.Id] = value;
        else if (field.IsRequired) fieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı zorunludur."];
    }
    if (fieldErrors.Count > 0) return Results.ValidationProblem(fieldErrors);
    var stockIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (items.Count != stockIds.Length || items.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Sipariş satırlarından en az birinin stok kartı bulunamadı veya pasif." });
    var normalizedLines = new List<SalesQuoteLineWriteRequest>();
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var item = items[input.StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}].unitCode"] = ["Stok kartı için bu birim etkin değil."] });
        try
        {
            var baseQuantity = checked(input.Quantity * factor.Value); var basePrice = input.UnitPrice / factor.Value;
            if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4) || basePrice > 99999999999999.9999m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü temel miktar ve fiyat için desteklenen hassasiyet sınırını aşıyor."] });
            normalizedLines.Add(input with { Quantity = baseQuantity, UnitPrice = basePrice, UnitCode = item.UnitCode });
        }
        catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{i}]"] = ["Birim dönüşümü desteklenen miktar veya fiyat sınırını aşıyor."] }); }
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(normalizedLines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    var order = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, Code = request.Code.Trim(), OrderDate = request.OrderDate,
        ExpectedReceiptDate = request.ExpectedReceiptDate, TargetWarehouseId = request.TargetWarehouseId,
        CurrencyCode = currency, Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = normalizedLines[i]; var item = items[input.StockItemId]; var amounts = SalesQuoteValidation.Calculate(input);
        order.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrder = order, LineNumber = i + 1,
            StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = input.Quantity,
            UnitPrice = input.UnitPrice, DiscountPercent = input.DiscountPercent, VatPercent = input.VatPercent,
            LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    foreach (var (definitionId, value) in fieldValues)
    {
        var field = fieldDefinitions.Single(x => x.Id == definitionId);
        order.CustomFieldValues.Add(new PurchaseOrderCustomFieldValue { TenantId = tenantId, PurchaseOrder = order, DefinitionId = definitionId, Value = value, DefinitionVersion = field.Version });
        order.CustomFieldValueRevisions.Add(new PurchaseOrderCustomFieldValueRevision { TenantId = tenantId, PurchaseOrder = order, DefinitionId = definitionId, NewValue = value, DefinitionVersion = field.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.PurchaseOrders.Add(order);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-order.created", Resource = order.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu satın alma sipariş numarası bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/orders/{order.Id}", new PurchaseOrderSummary(order.Id, order.Code, supplier.Id, supplier.Name,
        order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt, order.ExpectedReceiptDate, order.TargetWarehouseId));
});
purchaseOrders.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, principal.FindFirstValue("role")!, "erp.purchase-orders.read", "erp.purchase-orders", query, x => x.Status, null, x => x.SupplierId) ?? query;
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Supplier.Name.Contains(term) || x.Supplier.Code.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseOrderSummary(x.Id, x.Code, x.SupplierId, x.Supplier.Name, x.OrderDate, x.CurrencyCode,
            x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt, x.ExpectedReceiptDate, x.TargetWarehouseId)).ToListAsync();
    return Results.Ok(new PurchaseOrderPage(rows, page, pageSize, total));
});
purchaseOrders.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var order = await db.PurchaseOrders.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (order is null) return Results.NotFound();
    var received = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.Receipt.Status == PurchaseReceiptStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var lines = order.Lines.OrderBy(x => x.LineNumber).Select(x => new PurchaseOrderLineView(x.LineNumber, x.StockItemId, x.StockCode,
        x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount,
        x.TaxAmount, x.LineTotal, received.GetValueOrDefault(x.LineNumber), Math.Max(0m, x.Quantity - received.GetValueOrDefault(x.LineNumber)))).ToList();
    var activeInvoices = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, x.PurchaseReceiptId, ReceiptCode = x.PurchaseReceipt.Code, x.PurchaseOrderId, OrderCode = x.PurchaseReceipt.PurchaseOrder.Code,
            x.SupplierId, SupplierName = x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.Status, x.GrandTotal,
            Paid = x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m,
            Returned = x.Returns.Where(r => r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m,
            LineCount = x.Lines.Count, x.CreatedAt }).ToListAsync();
    var receipts = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id)
        .OrderByDescending(x => x.ReceiptDate).ThenByDescending(x => x.CreatedAt)
        .Select(x => new PurchaseReceiptSummary(x.Id, x.Code, x.PurchaseOrderId, x.PurchaseOrder.Code, x.WarehouseId, x.Warehouse.Name,
            x.ReceiptDate, x.Status, x.Lines.Count, x.CreatedAt,
            x.Lines.OrderBy(l => l.OrderLineNumber).Select(l => new PurchaseReceiptLineView(l.OrderLineNumber, l.StockItemId, l.StockCode, l.StockName,
                l.UnitCode, l.Quantity, null, l.EnteredQuantity, l.EnteredUnitCode,
                l.InventoryTransactions.Select(m => m.StorageLocationId).FirstOrDefault())).ToList())).ToListAsync();
    var receiptFieldDefinitions = await db.PurchaseReceiptCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var receiptFieldValues = await db.PurchaseReceiptCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.Receipt.PurchaseOrderId == id)
        .ToDictionaryAsync(x => (x.ReceiptId, x.DefinitionId), x => x.Value);
    receipts = receipts.Select(r =>
    {
        var invoice = activeInvoices.SingleOrDefault(x => x.PurchaseReceiptId == r.Id);
        var summary = invoice is null ? null : new PurchaseInvoiceSummary(invoice.Id, invoice.Code, invoice.PurchaseReceiptId,
            invoice.ReceiptCode, invoice.PurchaseOrderId, invoice.OrderCode, invoice.SupplierId, invoice.SupplierName,
            invoice.InvoiceDate, invoice.DueDate, invoice.CurrencyCode, invoice.Status, invoice.GrandTotal, invoice.Paid,
            PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, invoice.Paid, invoice.Returned), invoice.LineCount, invoice.CreatedAt);
        var fields = receiptFieldDefinitions.Select(field => new PurchaseReceiptCustomFieldValueView(field.Id, field.Code, field.Label, field.DataType, field.MaxLength, field.Version, field.IsRequired,
            receiptFieldValues.GetValueOrDefault((r.Id, field.Id)) ?? "")).ToList();
        return r with { Invoice = summary, CustomFields = fields };
    }).ToList();
    var customFields = await (from definition in db.PurchaseOrderCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        join value in db.PurchaseOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id) on new { definition.TenantId, DefinitionId = definition.Id } equals new { value.TenantId, value.DefinitionId } into grouped
        from value in grouped.DefaultIfEmpty() orderby definition.Label select new PurchaseOrderCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, value == null ? "" : value.Value)).ToListAsync();
    return Results.Ok(new PurchaseOrderView(order.Id, order.Code, order.SupplierId, order.Supplier.Name, order.OrderDate,
        order.CurrencyCode, order.Status, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, order.Notes,
        order.CreatedAt, lines, receipts, customFields, order.ExpectedReceiptDate, order.TargetWarehouseId));
});
purchaseOrders.MapPost("/{id:guid}/receipts", async (Guid id, PurchaseReceiptWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseReceiptValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var prior = await db.PurchaseReceipts.AsNoTracking().Include(x => x.Warehouse).Where(x => x.TenantId == tenantId && x.RequestId == request.RequestId).SingleOrDefaultAsync();
    if (prior is not null)
    {
        if (prior.PurchaseOrderId != order.Id) return Results.Conflict(new { error = "Bu istek anahtarı başka bir satın alma siparişinde kullanılmış." });
        return Results.Ok(new PurchaseReceiptSummary(prior.Id, prior.Code, prior.PurchaseOrderId, order.Code, prior.WarehouseId,
            prior.Warehouse.Name, prior.ReceiptDate, prior.Status, await db.PurchaseReceiptLines.CountAsync(x => x.TenantId == tenantId && x.ReceiptId == prior.Id), prior.CreatedAt));
    }
    if (!PurchaseOrderWorkflow.CanReceive(order.Status)) return Results.Conflict(new { error = "Bu sipariş için yeni mal kabul yapılamaz." });
    var receiptFieldDefinitions = await db.PurchaseReceiptCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceiptCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var receiptFieldErrors = new Dictionary<string, string[]>(); var receiptFieldValues = new Dictionary<Guid, string>();
    var orderFieldValues = await (from value in db.PurchaseOrderCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id)
        join definition in db.PurchaseOrderCustomFieldDefinitions.AsNoTracking() on new { value.TenantId, value.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
        select new { definition.Code, value.Value }).ToDictionaryAsync(x => x.Code, x => x.Value, StringComparer.OrdinalIgnoreCase);
    foreach (var field in receiptFieldDefinitions)
    {
        string? raw = null;
        if (request.CustomFields?.TryGetValue(field.Code, out var supplied) == true) raw = supplied;
        else orderFieldValues.TryGetValue(field.Code, out raw);
        if (!StockCustomFieldValidation.TryNormalize(field.DataType, field.MaxLength, raw, out var normalized)) { receiptFieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı geçersiz."]; continue; }
        if (normalized.Length > 0) receiptFieldValues[field.Id] = normalized;
        else if (field.IsRequired) receiptFieldErrors[$"customFields.{field.Code}"] = [$"'{field.Label}' alanı zorunludur."];
    }
    if (receiptFieldErrors.Count > 0) return Results.ValidationProblem(receiptFieldErrors);
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoya mal kabul yapılamaz." });
    var requestedLocationIds = request.Lines.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value).Distinct().ToArray();
    var receiptLocations = requestedLocationIds.Length == 0
        ? new Dictionary<Guid, WarehouseLocation>()
        : (await db.WarehouseLocations.FromSqlInterpolated($"SELECT * FROM [dbo].[WarehouseLocations] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [WarehouseId] = {warehouse.Id}")
            .Where(x => requestedLocationIds.Contains(x.Id)).ToListAsync()).ToDictionary(x => x.Id);
    var receiptLocationResolution = SalesDeliveryLocationGuard.Validate(tenantId, warehouse.Id, requestedLocationIds, receiptLocations.Values);
    if (receiptLocationResolution.Failure == SalesDeliveryLocationFailure.NotFound)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines.storageLocationId"] = ["Seçilen konum bu firmaya veya depoya ait değil."] });
    if (receiptLocationResolution.Failure == SalesDeliveryLocationFailure.Inactive)
        return Results.Conflict(new { error = "Pasif konuma mal kabul yapılamaz." });
    var orderLines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id).OrderBy(x => x.LineNumber).ToListAsync();
    var linesByNumber = orderLines.ToDictionary(x => x.LineNumber);
    if (request.Lines.Any(x => !linesByNumber.ContainsKey(x.OrderLineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Mal kabul satırlarından biri siparişte bulunamadı."] });
    var received = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.Receipt.Status == PurchaseReceiptStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var itemIds = request.Lines.Select(x => linesByNumber[x.OrderLineNumber].StockItemId).Distinct().ToArray();
    var stockItems = await db.StockItems.Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItems.Count != itemIds.Length || stockItems.Values.Any(x => !x.IsActive)) return Results.Conflict(new { error = "Sipariş stok kartı bulunamadı veya pasif." });
    var enteredReceiptQuantities = request.Lines.ToDictionary(x => x.OrderLineNumber, x => (x.Quantity, UnitCode: string.IsNullOrWhiteSpace(x.UnitCode) ? linesByNumber[x.OrderLineNumber].UnitCode : x.UnitCode.Trim().ToUpperInvariant()));
    var normalizedReceiptLines = new List<PurchaseReceiptLineWriteRequest>(request.Lines.Count);
    foreach (var input in request.Lines)
    {
        var item = stockItems[linesByNumber[input.OrderLineNumber].StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.OrderLineNumber}].unitCode"] = [$"{input.UnitCode} bu stok kartı için etkin birim değil."] });
        var baseQuantity = input.Quantity * factor.Value;
        if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.OrderLineNumber}].quantity"] = ["Temel birime çevrilen miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."] });
        normalizedReceiptLines.Add(input with { Quantity = baseQuantity, UnitCode = linesByNumber[input.OrderLineNumber].UnitCode });
    }
    request = request with { Lines = normalizedReceiptLines };
    foreach (var input in request.Lines)
    {
        var remaining = linesByNumber[input.OrderLineNumber].Quantity - received.GetValueOrDefault(input.OrderLineNumber);
        if (input.Quantity > remaining) return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için kalan miktar {remaining}.", orderLineNumber = input.OrderLineNumber, remainingQuantity = remaining });
    }
    var purchaseRate = await GetTenantRateAsync(db, tenantId, order.CurrencyCode, request.ReceiptDate);
    if (purchaseRate is null) return Results.Conflict(new { error = $"{order.CurrencyCode} için {request.ReceiptDate:yyyy-MM-dd} tarihinde veya öncesinde tenant baz para birimine çevrilebilen kur yok. Önce Finans ekranından kuru kaydedin." });
    var code = $"GR-{Guid.NewGuid():N}".ToUpperInvariant();
    var receipt = new PurchaseReceipt { TenantId = tenantId, RequestId = request.RequestId, PurchaseOrderId = id, WarehouseId = warehouse.Id, Code = code, ReceiptDate = request.ReceiptDate };
    foreach (var (definitionId, value) in receiptFieldValues)
    {
        var field = receiptFieldDefinitions.Single(x => x.Id == definitionId);
        receipt.CustomFieldValues.Add(new PurchaseReceiptCustomFieldValue { TenantId = tenantId, Receipt = receipt, DefinitionId = definitionId, Value = value, DefinitionVersion = field.Version });
        receipt.CustomFieldValueRevisions.Add(new PurchaseReceiptCustomFieldValueRevision { TenantId = tenantId, Receipt = receipt, DefinitionId = definitionId, NewValue = value, DefinitionVersion = field.Version, ChangedByUserId = GetUserId(principal) });
    }
    foreach (var input in request.Lines.OrderBy(x => x.OrderLineNumber))
    {
        var line = linesByNumber[input.OrderLineNumber];
        var receiptLine = new PurchaseReceiptLine { TenantId = tenantId, Receipt = receipt, PurchaseOrderId = id, OrderLineNumber = line.LineNumber,
            StockItemId = line.StockItemId, StockCode = line.StockCode, StockName = line.StockName, UnitCode = line.UnitCode, Quantity = input.Quantity,
            EnteredQuantity = enteredReceiptQuantities[input.OrderLineNumber].Quantity, EnteredUnitCode = enteredReceiptQuantities[input.OrderLineNumber].UnitCode };
        receipt.Lines.Add(receiptLine);
        decimal? unitCostBase = purchaseRate is null ? null : decimal.Round(line.UnitPrice * (1m - line.DiscountPercent / 100m) * purchaseRate.Value, 8, MidpointRounding.AwayFromZero);
        if (unitCostBase > 9999999999.99999999m) return Results.Conflict(new { error = $"Sipariş satırı {line.LineNumber} maliyeti decimal(18,8) sınırını aşıyor." });
        var item = stockItems[line.StockItemId];
        var trackingError = ValidateTrackingAllocations(item.TrackingMode, input.Tracking, input.Quantity);
        if (trackingError is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.OrderLineNumber}].tracking"] = [trackingError] });
        foreach (var trace in input.Tracking ?? [])
        {
            var priorTrace = await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.TrackingCode == trace.TrackingCode.Trim()).ToListAsync();
            if (item.TrackingMode == InventoryTrackingMode.Lot && priorTrace.Any(x => x.ExpiryDate != trace.ExpiryDate))
                return Results.Conflict(new { error = $"Lot {trace.TrackingCode} için son kullanma tarihi değiştirilemez." });
            if (item.TrackingMode == InventoryTrackingMode.Serial && priorTrace.Count > 0)
                return Results.Conflict(new { error = $"Seri numarası {trace.TrackingCode} daha önce kullanılmış." });
        }
        var stockMovement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = line.StockItemId,
            EntryDate = request.ReceiptDate, Direction = InventoryDirection.Receipt, Quantity = input.Quantity,
            UnitCostBase = unitCostBase, Description = $"Satın alma mal kabul {code}", PurchaseReceiptLine = receiptLine,
            StorageLocationId = input.StorageLocationId };
        stockMovement.Tracking = ToTraceEntities(tenantId, item, input.Tracking ?? []);
        db.InventoryTransactions.Add(stockMovement);
    }
    db.PurchaseReceipts.Add(receipt);
    var receivedAfter = new Dictionary<int, decimal>(received);
    foreach (var input in request.Lines) receivedAfter[input.OrderLineNumber] = receivedAfter.GetValueOrDefault(input.OrderLineNumber) + input.Quantity;
    order.Status = PurchaseOrderWorkflow.GetStatus(orderLines.Select(x => (x.Quantity, receivedAfter.GetValueOrDefault(x.LineNumber))));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-receipt.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Mal kabul istek anahtarı veya belge numarası daha önce kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/receipts/{receipt.Id}", new PurchaseReceiptSummary(receipt.Id, receipt.Code, order.Id, order.Code,
        warehouse.Id, warehouse.Name, receipt.ReceiptDate, receipt.Status, receipt.Lines.Count, receipt.CreatedAt, CustomFields: receiptFieldDefinitions.Select(field => new PurchaseReceiptCustomFieldValueView(field.Id,
            field.Code, field.Label, field.DataType, field.MaxLength, field.Version, field.IsRequired, receiptFieldValues.GetValueOrDefault(field.Id) ?? "")).ToList()));
});
var purchaseReceipts = app.MapGroup("/api/purchasing/receipts").RequireAuthorization();
purchaseReceipts.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId);
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.ReceiptDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseReceiptSummary(x.Id, x.Code, x.PurchaseOrderId, x.PurchaseOrder.Code, x.WarehouseId, x.Warehouse.Name,
            x.ReceiptDate, x.Status, x.Lines.Count, x.CreatedAt))
        .ToListAsync();
    return Results.Ok(new PurchaseReceiptPage(rows, page, pageSize, total));
});
purchaseReceipts.MapGet("/{id:guid}/landed-costs", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseReceipts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var headers = await db.InventoryCostAdjustments.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseReceiptId == id)
        .OrderBy(x => x.CreatedAt).ToListAsync();
    var results = new List<InventoryCostAdjustmentView>();
    foreach (var header in headers) results.Add(await BuildInventoryCostAdjustmentViewAsync(db, tenantId, header));
    return Results.Ok(results);
});
purchaseReceipts.MapPost("/{id:guid}/landed-costs", async (Guid id, LandedCostWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var method = request.AllocationMethod?.Trim().ToUpperInvariant();
    if (request.AmountBase <= 0m || request.AmountBase > 9999999999999999.99m || request.AmountBase != decimal.Round(request.AmountBase, 2) ||
        method is not ("VALUE" or "QUANTITY" or "EQUAL") || string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 240)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["landedCost"] = ["Tutar pozitif ve iki ondalık basamaklı olmalı; dağıtım yöntemi Value, Quantity veya Equal olmalı; açıklama en fazla 240 karakter olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    if (receipt.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "Yalnızca işlenmiş mal kabullere ek maliyet dağıtılabilir." });
    if (request.EntryDate < receipt.ReceiptDate || request.EntryDate > DateOnly.FromDateTime(DateTime.UtcNow))
        return Results.Conflict(new { error = "Ek maliyet tarihi mal kabul tarihinden önce veya bugünden ileri olamaz." });
    var sourceLines = await db.PurchaseReceiptLines.AsNoTracking().Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.ReceiptId == id).OrderBy(x => x.OrderLineNumber).ToListAsync();
    if (sourceLines.Count == 0) return Results.Conflict(new { error = "Satırı olmayan mal kabule ek maliyet dağıtılamaz." });
    var lineIds = sourceLines.Select(x => x.Id).ToArray();
    var movements = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseReceiptLineId != null && lineIds.Contains(x.PurchaseReceiptLineId.Value) && x.ReversalOfId == null)
        .ToDictionaryAsync(x => x.PurchaseReceiptLineId!.Value);
    if (movements.Count != sourceLines.Count || movements.Values.Any(x => x.UnitCostBase is null))
        return Results.Conflict(new { error = "Ek maliyet dağıtımı için her mal kabul satırının etkin ve değerlenmiş stok girişi bulunmalıdır." });
    if (sourceLines.Any(line => db.InventoryTransactions.Any(x => x.TenantId == tenantId && x.ReversalOfId == movements[line.Id].Id)))
        return Results.Conflict(new { error = "Ters kaydı olan mal kabul satırına ek maliyet dağıtılamaz." });
    var itemIds = sourceLines.Select(x => x.StockItemId).Distinct().ToArray();
    var receiptCreatedAt = movements.Values.Max(x => x.CreatedAt);
    if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.WarehouseId == receipt.WarehouseId && itemIds.Contains(x.StockItemId)
        && x.Direction == InventoryDirection.Issue && x.CreatedAt > receiptCreatedAt))
        return Results.Conflict(new { error = "Bu mal kabulden sonra stok çıkışı yapılmış; tüketilen miktara ilişkin maliyet ayrıştırması olmadan ek maliyet dağıtılamaz." });
    var weights = sourceLines.Select(line => method switch
    {
        "QUANTITY" => line.Quantity,
        "VALUE" => line.Quantity * movements[line.Id].UnitCostBase!.Value,
        _ => 1m
    }).ToArray();
    var totalWeight = weights.Sum();
    if (totalWeight <= 0m) return Results.Conflict(new { error = "Maliyet dağıtımı için pozitif bir ağırlık toplamı bulunamadı." });
    var record = new InventoryCostAdjustment { TenantId = tenantId, Code = $"LC-{Guid.NewGuid():N}".ToUpperInvariant(),
        EntryDate = request.EntryDate, Kind = InventoryCostAdjustmentKind.LandedCost, PurchaseReceiptId = id,
        Description = request.Description.Trim(), CreatedByUserId = GetUserId(principal) };
    var assigned = 0m;
    for (var index = 0; index < sourceLines.Count; index++)
    {
        var source = sourceLines[index];
        var amount = index == sourceLines.Count - 1
            ? request.AmountBase - assigned
            : decimal.Round(request.AmountBase * weights[index] / totalWeight, 2, MidpointRounding.AwayFromZero);
        assigned += amount;
        if (amount == 0m) continue;
        var movement = movements[source.Id];
        record.Lines.Add(new InventoryCostAdjustmentLine { TenantId = tenantId, Adjustment = record,
            WarehouseId = receipt.WarehouseId, StockItemId = source.StockItemId, PurchaseReceiptLineId = source.Id,
            QuantitySnapshot = source.Quantity, UnitCostSnapshotBase = movement.UnitCostBase, AmountBase = amount });
    }
    if (record.Lines.Count == 0) return Results.Conflict(new { error = "Dağıtılan tutar satır hassasiyetinde sıfıra yuvarlandı." });
    db.InventoryCostAdjustments.Add(record);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-landed-cost.posted", Resource = record.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/receipts/{id}/landed-costs/{record.Id}", await BuildInventoryCostAdjustmentViewAsync(db, tenantId, record));
});
purchaseReceipts.MapPost("/{id:guid}/landed-costs/{adjustmentId:guid}/reverse", async (Guid id, Guid adjustmentId, InventoryReverseRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    var original = await db.InventoryCostAdjustments.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryCostAdjustments] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {adjustmentId}").SingleOrDefaultAsync();
    if (original is null || original.PurchaseReceiptId != id || original.Kind != InventoryCostAdjustmentKind.LandedCost || original.ReversalOfId is not null) return Results.NotFound();
    if (await db.InventoryCostAdjustments.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Bu ek maliyet daha önce ters kayıtla iptal edilmiştir." });
    var lines = await db.InventoryCostAdjustmentLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.AdjustmentId == original.Id).ToListAsync();
    if (lines.Count == 0) return Results.Conflict(new { error = "Ek maliyet dağıtım satırları bulunamadı." });
    var reversal = new InventoryCostAdjustment { TenantId = tenantId, Code = $"LCV-{Guid.NewGuid():N}".ToUpperInvariant(),
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Kind = InventoryCostAdjustmentKind.Reversal,
        PurchaseReceiptId = id, ReversalOfId = original.Id, Description = $"{original.Code} ters kayıt · {request.Reason.Trim()}", CreatedByUserId = GetUserId(principal) };
    foreach (var line in lines) reversal.Lines.Add(new InventoryCostAdjustmentLine { TenantId = tenantId, Adjustment = reversal,
        WarehouseId = line.WarehouseId, StockItemId = line.StockItemId, PurchaseReceiptLineId = line.PurchaseReceiptLineId,
        QuantitySnapshot = line.QuantitySnapshot, UnitCostSnapshotBase = line.UnitCostSnapshotBase, AmountBase = -line.AmountBase });
    db.InventoryCostAdjustments.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-landed-cost.reversed", Resource = original.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu ek maliyet daha önce ters kayıtla iptal edilmiştir." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/receipts/{id}/landed-costs/{reversal.Id}", await BuildInventoryCostAdjustmentViewAsync(db, tenantId, reversal));
});
purchaseReceipts.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseOrderId, x.WarehouseId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseOrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    if (receipt.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "Mal kabul daha önce iptal edildi." });
    if (await db.PurchaseDeliveryNotes.AnyAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == receipt.Id))
        return Results.Conflict(new { error = "Mal kabule bağlı tedarikçi irsaliyesi var. Önce irsaliye bağlantısını kaldırın." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "PurchaseReceipt", receipt.Id))
        return Results.Conflict(new { error = "Mal kabul yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    if (await db.PurchaseInvoices.AnyAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == receipt.Id && x.Status == PurchaseInvoiceStatus.Posted))
        return Results.Conflict(new { error = "Mal kabul önce bağlı alış faturası iptal edilerek kapatılmalıdır." });
    if (await db.InventoryCostAdjustments.AnyAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == receipt.Id && x.Kind == InventoryCostAdjustmentKind.LandedCost
        && !db.InventoryCostAdjustments.Any(reversal => reversal.TenantId == tenantId && reversal.ReversalOfId == x.Id)))
        return Results.Conflict(new { error = "Mal kabul önce bağlı ek maliyetler ters kayıtla iptal edilmelidir." });
    var lines = await db.PurchaseReceiptLines.Where(x => x.TenantId == tenantId && x.ReceiptId == id).OrderBy(x => x.Id).ToListAsync();
    var movements = new List<InventoryTransaction>();
    foreach (var line in lines)
    {
        var linked = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [PurchaseReceiptLineId] = {line.Id} AND [ReversalOfId] IS NULL").ToListAsync();
        movements.AddRange(linked);
    }
    var movementIds = movements.Select(x => x.Id).ToArray();
    if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId != null && movementIds.Contains(x.ReversalOfId.Value)))
        return Results.Conflict(new { error = "Mal kabul stok hareketlerinden biri daha önce ters kayıtla geri alınmış." });
    var required = movements.GroupBy(x => x.StockItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    var balances = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && required.Keys.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) }).ToDictionaryAsync(x => x.Id, x => x.Quantity);
    var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && required.Keys.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) }).ToDictionaryAsync(x => x.Id, x => x.Quantity);
    var shortage = required.FirstOrDefault(x => balances.GetValueOrDefault(x.Key) - reserved.GetValueOrDefault(x.Key) < x.Value);
    if (shortage.Value > 0) return Results.Conflict(new { error = "Mal kabul iptali stok rezervasyonlarını karşılayamaz; önce ilgili rezervasyonları bırakın.", stockItemId = shortage.Key,
        currentBalance = balances.GetValueOrDefault(shortage.Key), reservedQuantity = reserved.GetValueOrDefault(shortage.Key), requiredQuantity = shortage.Value });
    foreach (var movement in movements)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Issue, Quantity = movement.Quantity,
            UnitCostBase = movement.UnitCostBase, Description = $"Mal kabul iptali {receipt.Code}", ReversalOfId = movement.Id, PurchaseReceiptLineId = movement.PurchaseReceiptLineId,
            StorageLocationId = movement.StorageLocationId,
            Tracking = await CopyTrackingAsync(db, tenantId, movement) });
    receipt.Status = PurchaseReceiptStatus.Voided;
    var orderLines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == order.Id).ToListAsync();
    var received = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == order.Id && x.Receipt.Status == PurchaseReceiptStatus.Posted && x.ReceiptId != receipt.Id)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { Number = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.Number, x => x.Quantity);
    order.Status = PurchaseOrderWorkflow.GetStatus(orderLines.Select(x => (x.Quantity, received.GetValueOrDefault(x.LineNumber))));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-receipt.voided", Resource = receipt.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { receipt.Id, receipt.Code, receipt.Status, orderStatus = order.Status });
});

purchaseReceipts.MapPost("/{id:guid}/invoice", async (Guid id, PurchaseInvoiceCreateRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseInvoiceValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var receiptIdentity = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseOrderId, SupplierId = x.PurchaseOrder.SupplierId }).SingleOrDefaultAsync();
    if (receiptIdentity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {receiptIdentity.PurchaseOrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    if (receipt.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş mal kabul için alış faturası oluşturulamaz." });
    var activeInvoice = await db.PurchaseInvoices.AsNoTracking().Include(x => x.Supplier)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == id && x.Status == PurchaseInvoiceStatus.Posted);
    if (activeInvoice is not null)
    {
        if (!string.Equals(activeInvoice.Code, request.Code.Trim(), StringComparison.OrdinalIgnoreCase)
            || activeInvoice.InvoiceDate != request.InvoiceDate)
            return Results.Conflict(new { error = "Bu mal kabul için farklı bilgilerle aktif alış faturası zaten var.", invoiceId = activeInvoice.Id });
        var replayPaid = await db.SupplierPayments.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == activeInvoice.Id && x.Status == SupplierPaymentStatus.Posted)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var replayReturned = await db.SupplierReturns.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == activeInvoice.Id && x.Status == SupplierReturnStatus.Posted)
            .SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
        return Results.Ok(new PurchaseInvoiceSummary(activeInvoice.Id, activeInvoice.Code, id,
            receipt.Code, order.Id, order.Code, activeInvoice.SupplierId, activeInvoice.Supplier.Name, activeInvoice.InvoiceDate,
            activeInvoice.DueDate, activeInvoice.CurrencyCode, activeInvoice.Status, activeInvoice.GrandTotal, replayPaid,
            Math.Max(0m, activeInvoice.GrandTotal - replayPaid - replayReturned), await db.PurchaseInvoiceLines.CountAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceId == activeInvoice.Id), activeInvoice.CreatedAt));
    }
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {order.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both)) return Results.Conflict(new { error = "Sipariş tedarikçi hesabı kullanılamıyor." });
    if (supplier.CurrencyCode != order.CurrencyCode) return Results.Conflict(new { error = "Tedarikçinin döviz kodu sipariş para birimiyle eşleşmiyor." });
    if (request.InvoiceDate.DayNumber > DateOnly.MaxValue.DayNumber - supplier.PaymentTermDays)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["invoiceDate"] = ["Tedarikçi vadesiyle hesaplanan son ödeme tarihi desteklenen tarih aralığını aşıyor."] });
    var receiptLines = await db.PurchaseReceiptLines.AsNoTracking().Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.ReceiptId == id).OrderBy(x => x.OrderLineNumber).ToListAsync();
    if (receiptLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen mal kabul faturalanamaz." });
    var historicalLines = await db.PurchaseInvoiceLines.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.PurchaseReceiptLine.PurchaseOrderId == order.Id && x.PurchaseInvoice.Status == PurchaseInvoiceStatus.Posted)
        .GroupBy(x => x.OrderLineNumber)
        .Select(g => new { Number = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) })
        .ToDictionaryAsync(x => x.Number, x => (Quantity: x.Quantity, Amounts: new SalesQuoteLineAmounts(x.Subtotal, x.Discount, x.Tax, x.Total)));
    var invoice = new PurchaseInvoice { TenantId = tenantId, PurchaseReceiptId = receipt.Id, PurchaseOrderId = order.Id,
        SupplierId = supplier.Id, Code = request.Code.Trim(), InvoiceDate = request.InvoiceDate,
        DueDate = request.InvoiceDate.AddDays(supplier.PaymentTermDays), CurrencyCode = order.CurrencyCode };
    var invoiceAmounts = new List<SalesQuoteLineAmounts>();
    foreach (var source in receiptLines)
    {
        var previous = historicalLines.GetValueOrDefault(source.OrderLineNumber);
        var orderLine = source.OrderLine;
        var amounts = PurchaseInvoiceWorkflow.CalculateIncrementalAmounts(orderLine.StockItemId, orderLine.UnitPrice,
            orderLine.DiscountPercent, orderLine.VatPercent, previous.Quantity, previous.Amounts ?? new SalesQuoteLineAmounts(0, 0, 0, 0), source.Quantity);
        invoiceAmounts.Add(amounts);
        invoice.Lines.Add(new PurchaseInvoiceLine { TenantId = tenantId, PurchaseInvoice = invoice, PurchaseReceiptLineId = source.Id,
            PurchaseReceiptId = receipt.Id,
            OrderLineNumber = source.OrderLineNumber, StockItemId = source.StockItemId, StockCode = source.StockCode,
            StockName = source.StockName, UnitCode = source.UnitCode, Quantity = source.Quantity, UnitPrice = orderLine.UnitPrice,
            DiscountPercent = orderLine.DiscountPercent, VatPercent = orderLine.VatPercent, LineSubtotal = amounts.LineSubtotal,
            DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(invoiceAmounts); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Toplamı sıfır veya negatif olan mal kabulden alış faturası oluşturulamaz." });
    invoice.Subtotal = totals.Subtotal; invoice.DiscountTotal = totals.DiscountTotal; invoice.TaxTotal = totals.TaxTotal; invoice.GrandTotal = totals.GrandTotal;
    db.PurchaseInvoices.Add(invoice);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, PurchaseInvoice = invoice,
        EntryDate = invoice.InvoiceDate, Direction = CustomerLedgerDirection.Credit, Amount = invoice.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Alış faturası {invoice.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-invoice.posted", Resource = invoice.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Fatura numarası zaten kullanılıyor veya bu mal kabul faturalanmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/invoices/{invoice.Id}", new PurchaseInvoiceSummary(invoice.Id, invoice.Code,
        receipt.Id, receipt.Code, order.Id, order.Code, supplier.Id, supplier.Name, invoice.InvoiceDate, invoice.DueDate,
        invoice.CurrencyCode, invoice.Status, invoice.GrandTotal, 0m, invoice.GrandTotal, invoice.Lines.Count, invoice.CreatedAt));
});

var purchaseInvoices = app.MapGroup("/api/purchasing/invoices").RequireAuthorization();
purchaseInvoices.MapGet("/", async (string? q, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId);
    query = await PermissionStatusFilter.ApplyAsync(platformDb, tenantId, userId.Value, principal.FindFirstValue("role")!, "erp.purchase-invoices.read", "erp.purchase-invoices", query, x => x.Status, null, x => x.SupplierId) ?? query;
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Supplier.Name.Contains(term) || x.PurchaseReceipt.Code.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.InvoiceDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseInvoiceSummary(x.Id, x.Code, x.PurchaseReceiptId, x.PurchaseReceipt.Code, x.PurchaseOrderId,
            x.PurchaseReceipt.PurchaseOrder.Code, x.SupplierId, x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.Status,
            x.GrandTotal, x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m,
            Math.Max(0m, x.GrandTotal - (x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m)
                - (x.Returns.Where(r => r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m)),
            x.Lines.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(new PurchaseInvoicePage(rows, page, pageSize, total));
});
purchaseInvoices.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var invoice = await db.PurchaseInvoices.AsNoTracking().Include(x => x.PurchaseReceipt).ThenInclude(x => x.PurchaseOrder)
        .Include(x => x.Supplier).Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (invoice is null) return Results.NotFound();
    var payments = await db.SupplierPayments.AsNoTracking().Include(x => x.FinancialAccount).Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id)
        .OrderByDescending(x => x.PaymentDate).ThenByDescending(x => x.CreatedAt)
        .Select(x => new SupplierPaymentSummary(x.Id, x.Code, x.PurchaseInvoiceId, invoice.Code, x.PaymentDate, x.Amount,
            x.CurrencyCode, x.PaymentMethod, x.Reference, x.Status, x.CreatedAt, x.FinancialAccountId, x.FinancialAccount == null ? null : x.FinancialAccount.Name)).ToListAsync();
    var paid = payments.Where(x => x.Status == SupplierPaymentStatus.Posted).Sum(x => x.Amount);
    var returns = await db.SupplierReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id).OrderByDescending(x => x.ReturnDate).ThenByDescending(x => x.CreatedAt).ToListAsync();
    var supplierReturnLineIds = returns.SelectMany(x => x.Lines).Select(x => x.Id).ToArray();
    var supplierReturnLocations = supplierReturnLineIds.Length == 0 ? new Dictionary<Guid, Guid?>() : await db.InventoryTransactions.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.SupplierReturnLineId.HasValue && supplierReturnLineIds.Contains(x.SupplierReturnLineId.Value) && x.ReversalOfId == null)
        .ToDictionaryAsync(x => x.SupplierReturnLineId!.Value, x => x.StorageLocationId);
    var returnSummaries = returns.Select(r => new SupplierReturnSummary(r.Id, r.Code, r.PurchaseInvoiceId, invoice.Code,
        r.WarehouseId, r.Warehouse.Name, r.ReturnDate, r.Status, r.GrandTotal, r.Lines.Count, r.CreatedAt,
        r.Lines.OrderBy(l => l.OrderLineNumber).Select(l => new SupplierReturnLineView(l.PurchaseInvoiceLineId, l.OrderLineNumber,
            l.StockCode, l.StockName, l.UnitCode, l.Quantity, l.UnitPrice, l.DiscountPercent, l.VatPercent,
            l.LineSubtotal, l.DiscountAmount, l.TaxAmount, l.LineTotal, l.EnteredQuantity, l.EnteredUnitCode,
            supplierReturnLocations.GetValueOrDefault(l.Id))).ToList())).ToList();
    var returned = returns.Where(x => x.Status == SupplierReturnStatus.Posted).Sum(x => x.GrandTotal);
    var lines = invoice.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new PurchaseInvoiceLineView(x.Id, x.PurchaseReceiptLineId,
        x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.StockItemId)).ToList();
    return Results.Ok(new PurchaseInvoiceView(invoice.Id, invoice.Code, invoice.PurchaseReceiptId, invoice.PurchaseReceipt.Code,
        invoice.PurchaseOrderId, invoice.PurchaseReceipt.PurchaseOrder.Code, invoice.SupplierId, invoice.Supplier.Name,
        invoice.InvoiceDate, invoice.DueDate, invoice.CurrencyCode, invoice.Status, invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal,
        invoice.GrandTotal, paid, PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, paid, returned), invoice.CreatedAt, lines, payments, returnSummaries));
});
purchaseInvoices.MapPost("/{id:guid}/payments", async (Guid id, SupplierPaymentWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SupplierPaymentValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
    var tenantExists = await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId);
    if (!tenantExists) return Results.NotFound();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var prior = await db.SupplierPayments.AsNoTracking().Include(x => x.FinancialAccount).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        if (prior.PurchaseInvoiceId != invoice.Id) return Results.Conflict(new { error = "Bu istek anahtarı başka bir tedarikçi ödemesinde kullanılmış." });
        return Results.Ok(new SupplierPaymentSummary(prior.Id, prior.Code, invoice.Id, invoice.Code, prior.PaymentDate, prior.Amount,
            prior.CurrencyCode, prior.PaymentMethod, prior.Reference, prior.Status, prior.CreatedAt, prior.FinancialAccountId, prior.FinancialAccount?.Name));
    }
    if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş alış faturası ödenemez." });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    FinancialAccount? financialAccount = null;
    if (request.FinancialAccountId is { } accountId)
    {
        financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        var expectedType = request.PaymentMethod == "Cash" ? FinancialAccountType.Cash : FinancialAccountType.Bank;
        if (financialAccount is null || !financialAccount.IsActive || financialAccount.Type != expectedType || financialAccount.CurrencyCode != invoice.CurrencyCode)
            return Results.Conflict(new { error = "Seçilen finans hesabı ödeme yöntemi, para birimi veya aktiflik durumu ile uyumlu değil." });
        if (financialAccount.Type == FinancialAccountType.Cash)
        {
            var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == accountId)
                .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
            if (request.Amount > balance) return Results.Conflict(new { error = "Kasa bakiyesi ödemeyi karşılamıyor.", currentBalance = balance });
        }
    }
    var paid = await db.SupplierPayments.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierPaymentStatus.Posted).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var returned = await db.SupplierReturns.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierReturnStatus.Posted).SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
    var outstanding = PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, paid, returned);
    if (outstanding <= 0) return Results.Conflict(new { error = "Alış faturası tamamen ödendi.", outstandingAmount = 0m });
    if (request.Amount > outstanding) return Results.Conflict(new { error = "Ödeme tutarı kalan tedarikçi bakiyesini aşamaz.", outstandingAmount = outstanding });
    var method = request.PaymentMethod.Trim(); var reference = request.Reference?.Trim();
    var code = $"PAY-{Guid.NewGuid():N}".ToUpperInvariant();
    var payment = new SupplierPayment { TenantId = tenantId, RequestId = request.RequestId, PurchaseInvoiceId = invoice.Id,
        SupplierId = supplier.Id, Code = code, PaymentDate = request.PaymentDate, CurrencyCode = invoice.CurrencyCode,
        Amount = request.Amount, PaymentMethod = method, Reference = string.IsNullOrWhiteSpace(reference) ? null : reference,
        FinancialAccountId = financialAccount?.Id };
    db.SupplierPayments.Add(payment);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, SupplierPayment = payment,
        EntryDate = payment.PaymentDate, Direction = CustomerLedgerDirection.Debit, Amount = payment.Amount,
        CurrencyCode = payment.CurrencyCode, Description = $"Tedarikçi ödemesi {code} · Fatura {invoice.Code}" });
    if (financialAccount is not null) db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId,
        FinancialAccount = financialAccount, CurrencyCode = invoice.CurrencyCode, TransactionDate = payment.PaymentDate,
        Direction = FinancialDirection.Outflow, CashFlowCategory = CashFlowCategory.Operating, Amount = payment.Amount, Description = $"Tedarikçi ödemesi {code}",
        Reference = string.IsNullOrWhiteSpace(reference) ? null : reference, SupplierPayment = payment });
    var paymentJournal = await InvoiceSettlementJournalPosting.CreateAsync(db, tenantId, "SupplierPayment", payment.Id,
        code, supplier.Name, request.PaymentDate, invoice.CurrencyCode, request.Amount, method, financialAccount?.Id, GetUserId(principal));
    if (!paymentJournal.Succeeded) return Results.Conflict(new { error = paymentJournal.Error });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-payment.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Ödeme istek anahtarı daha önce kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/payments/{payment.Id}", new SupplierPaymentSummary(payment.Id, payment.Code,
        invoice.Id, invoice.Code, payment.PaymentDate, payment.Amount, payment.CurrencyCode, payment.PaymentMethod,
        payment.Reference, payment.Status, payment.CreatedAt, financialAccount?.Id, financialAccount?.Name));
});
purchaseInvoices.MapPost("/{id:guid}/returns", async (Guid id, SupplierReturnWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = new Dictionary<string, string[]>();
    if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
    if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["İade ürünlerinin çıkacağı depo seçilmelidir."];
    if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["İade 1 ile 100 arasında fatura satırı içermelidir."];
    if (request.Lines is not null)
    {
        if (request.Lines.GroupBy(x => x.PurchaseInvoiceLineId).Any(g => g.Count() > 1)) errors["lines"] = ["Aynı fatura satırı iade talebinde yalnızca bir kez bulunabilir."];
        for (var i = 0; i < request.Lines.Count; i++)
        {
            if (request.Lines[i].PurchaseInvoiceLineId == Guid.Empty || request.Lines[i].Quantity <= 0 || request.Lines[i].Quantity > 99999999999999.9999m || request.Lines[i].Quantity != decimal.Round(request.Lines[i].Quantity, 4))
                errors[$"lines[{i}].quantity"] = ["İade miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            if (request.Lines[i].StorageLocationId == Guid.Empty)
                errors[$"lines[{i}].storageLocationId"] = ["Depo konumu boş GUID olamaz."];
        }
    }
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var returnRequests = request.Lines ?? Array.Empty<SupplierReturnLineWriteRequest>();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var existing = await db.SupplierReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existing is not null)
    {
        if (existing.PurchaseInvoiceId != invoice.Id) return Results.Conflict(new { error = "requestId başka bir alış iadesinde kullanılmış." });
        var existingLineIds = existing.Lines.Select(x => x.Id).ToArray();
        var existingLocations = existingLineIds.Length == 0 ? new Dictionary<Guid, Guid?>() : await db.InventoryTransactions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.SupplierReturnLineId.HasValue && existingLineIds.Contains(x.SupplierReturnLineId.Value) && x.ReversalOfId == null)
            .ToDictionaryAsync(x => x.SupplierReturnLineId!.Value, x => x.StorageLocationId);
        var requestedLineIds = returnRequests.Select(x => x.PurchaseInvoiceLineId).ToArray();
        var requestedInvoiceLines = requestedLineIds.Length == 0 ? new Dictionary<Guid, PurchaseInvoiceLine>() : await db.PurchaseInvoiceLines.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == invoice.Id && requestedLineIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id);
        var existingLinesByInvoiceLine = existing.Lines.ToDictionary(x => x.PurchaseInvoiceLineId);
        var samePayload = existing.WarehouseId == request.WarehouseId && existing.ReturnDate == request.ReturnDate
            && existing.Lines.Count == returnRequests.Count
            && returnRequests.All(input => requestedInvoiceLines.TryGetValue(input.PurchaseInvoiceLineId, out var source)
                && existingLinesByInvoiceLine.TryGetValue(input.PurchaseInvoiceLineId, out var saved)
                && saved.EnteredQuantity == input.Quantity
                && string.Equals(saved.EnteredUnitCode ?? saved.UnitCode,
                    string.IsNullOrWhiteSpace(input.UnitCode) ? source.UnitCode : input.UnitCode.Trim().ToUpperInvariant(), StringComparison.OrdinalIgnoreCase)
                && existingLocations.GetValueOrDefault(saved.Id) == input.StorageLocationId);
        if (!samePayload) return Results.Conflict(new { error = "Bu requestId farklı içerikle daha önce kullanılmış. Yeni bir requestId oluşturun." });
        var oldLines = existing.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SupplierReturnLineView(x.PurchaseInvoiceLineId,
            x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent,
            x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.EnteredQuantity, x.EnteredUnitCode,
            existingLocations.GetValueOrDefault(x.Id))).ToList();
        return Results.Ok(new SupplierReturnSummary(existing.Id, existing.Code, existing.PurchaseInvoiceId, invoice.Code,
            existing.WarehouseId, existing.Warehouse.Name, existing.ReturnDate, existing.Status, existing.GrandTotal,
            existing.Lines.Count, existing.CreatedAt, oldLines));
    }
    if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş alış faturasından iade oluşturulamaz." });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depodan alış iadesi yapılamaz." });
    var requestedReturnLocationIds = returnRequests.Where(x => x.StorageLocationId.HasValue).Select(x => x.StorageLocationId!.Value).Distinct().ToArray();
    var returnLocationResolution = await SalesDeliveryLocationGuard.ResolveAsync(db, tenantId, warehouse.Id, requestedReturnLocationIds);
    if (returnLocationResolution.Failure != SalesDeliveryLocationFailure.None)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İade konumları etkin olmalı ve seçilen depoya ait olmalıdır."] });
    var invoiceLines = await db.PurchaseInvoiceLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == invoice.Id).ToDictionaryAsync(x => x.Id);
    if (returnRequests.Any(x => !invoiceLines.ContainsKey(x.PurchaseInvoiceLineId))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İade satırlarından biri bu alış faturasına ait değil."] });
    var returnStockIds = returnRequests.Select(x => invoiceLines[x.PurchaseInvoiceLineId].StockItemId).Distinct().ToArray();
    var returnStockItems = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && returnStockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    var normalizedReturnRequests = new List<SupplierReturnLineWriteRequest>(returnRequests.Count);
    var enteredReturnQuantities = new Dictionary<Guid, (decimal Quantity, string UnitCode)>();
    foreach (var input in returnRequests)
    {
        var source = invoiceLines[input.PurchaseInvoiceLineId];
        var item = returnStockItems[source.StockItemId];
        var factor = await ResolveStockUnitFactorAsync(db, tenantId, item, input.UnitCode);
        if (factor is null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.PurchaseInvoiceLineId}].unitCode"] = [$"{input.UnitCode} bu stok kartı için etkin birim değil."] });
        var baseQuantity = input.Quantity * factor.Value;
        if (baseQuantity <= 0m || baseQuantity > 99999999999999.9999m || baseQuantity != decimal.Round(baseQuantity, 4))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{input.PurchaseInvoiceLineId}].quantity"] = ["Temel birime çevrilen miktar pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."] });
        enteredReturnQuantities[input.PurchaseInvoiceLineId] = (input.Quantity, string.IsNullOrWhiteSpace(input.UnitCode) ? source.UnitCode : input.UnitCode.Trim().ToUpperInvariant());
        normalizedReturnRequests.Add(input with { Quantity = baseQuantity, UnitCode = source.UnitCode });
    }
    returnRequests = normalizedReturnRequests;
    var requestedIds = returnRequests.Select(x => x.PurchaseInvoiceLineId).ToArray();
    var priorRows = await db.SupplierReturnLines.Where(x => x.TenantId == tenantId && requestedIds.Contains(x.PurchaseInvoiceLineId) && x.SupplierReturn.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) })
        .ToDictionaryAsync(x => x.Id, x => (x.Quantity, Amounts: new SalesQuoteLineAmounts(x.Subtotal, x.Discount, x.Tax, x.Total)));
    foreach (var row in returnRequests)
        if (row.Quantity > invoiceLines[row.PurchaseInvoiceLineId].Quantity - priorRows.GetValueOrDefault(row.PurchaseInvoiceLineId).Quantity)
            return Results.Conflict(new { error = "İade miktarı faturada kalan miktarı aşamaz.", purchaseInvoiceLineId = row.PurchaseInvoiceLineId,
                remainingQuantity = invoiceLines[row.PurchaseInvoiceLineId].Quantity - priorRows.GetValueOrDefault(row.PurchaseInvoiceLineId).Quantity });
    var itemIds = returnRequests.Select(x => invoiceLines[x.PurchaseInvoiceLineId].StockItemId).Distinct().ToArray();
    var allowNegativeStock = await TenantOperationalSettingsEndpoints.AllowsNegativeStockAsync(db, tenantId);
    var stockTrackingModes = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id))
        .ToDictionaryAsync(x => x.Id, x => x.TrackingMode);
    var stock = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && itemIds.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
        .ToDictionaryAsync(x => x.Id, x => x.Quantity);
    var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && itemIds.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.Id, x => x.Quantity);
    foreach (var group in returnRequests.GroupBy(x => invoiceLines[x.PurchaseInvoiceLineId].StockItemId))
    {
        var needed = group.Sum(x => x.Quantity);
        var reservedQuantity = reserved.GetValueOrDefault(group.Key);
        var hasStorageLocation = group.Any(x => x.StorageLocationId.HasValue);
        if (stock.GetValueOrDefault(group.Key) - reservedQuantity < needed &&
            !TenantOperationalSettingsEndpoints.CanPostNegativeBalance(allowNegativeStock, reservedQuantity,
                stockTrackingModes.GetValueOrDefault(group.Key), hasStorageLocation)) return Results.Conflict(new { error = "İade miktarı rezervasyonlar düşüldükten sonra kullanılabilir stok bakiyesini aşamaz.", stockItemId = group.Key,
            currentBalance = stock.GetValueOrDefault(group.Key), reservedQuantity = reserved.GetValueOrDefault(group.Key), requestedQuantity = needed });
    }
    foreach (var group in returnRequests.Where(x => x.StorageLocationId.HasValue)
                 .GroupBy(x => (StockItemId: invoiceLines[x.PurchaseInvoiceLineId].StockItemId, LocationId: x.StorageLocationId!.Value)))
    {
        var locationBalance = await SalesDeliveryLocationGuard.GetBalanceAsync(db, tenantId, warehouse.Id, group.Key.StockItemId, group.Key.LocationId);
        var requestedQuantity = group.Sum(x => x.Quantity);
        if (requestedQuantity > locationBalance)
            return Results.Conflict(new { error = "Seçilen konumdaki kullanılabilir stok, alış iadesi miktarını karşılamıyor.", stockItemId = group.Key.StockItemId,
                storageLocationId = group.Key.LocationId, locationBalance, requestedQuantity });
    }
    var code = $"SRT-{Guid.NewGuid():N}".ToUpperInvariant();
    var supplierReturn = new SupplierReturn { TenantId = tenantId, RequestId = request.RequestId, PurchaseInvoiceId = invoice.Id,
        SupplierId = supplier.Id, WarehouseId = warehouse.Id, Code = code, ReturnDate = request.ReturnDate };
    var amountsList = new List<SalesQuoteLineAmounts>();
    foreach (var row in returnRequests)
    {
        var source = invoiceLines[row.PurchaseInvoiceLineId];
        var previous = priorRows.GetValueOrDefault(source.Id);
        var amounts = SalesReturnValidation.CalculateIncrementalAmounts(source.StockItemId, source.UnitPrice, source.DiscountPercent,
            source.VatPercent, previous.Quantity, previous.Amounts ?? new SalesQuoteLineAmounts(0, 0, 0, 0), row.Quantity);
        amountsList.Add(amounts);
        var line = new SupplierReturnLine { TenantId = tenantId, SupplierReturn = supplierReturn, PurchaseInvoiceId = invoice.Id,
            PurchaseInvoiceLineId = source.Id, OrderLineNumber = source.OrderLineNumber, StockItemId = source.StockItemId,
            StockCode = source.StockCode, StockName = source.StockName, UnitCode = source.UnitCode, Quantity = row.Quantity,
            EnteredQuantity = enteredReturnQuantities[row.PurchaseInvoiceLineId].Quantity, EnteredUnitCode = enteredReturnQuantities[row.PurchaseInvoiceLineId].UnitCode,
            UnitPrice = source.UnitPrice, DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent,
            LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal };
        supplierReturn.Lines.Add(line);
        var receiptCost = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId
                && x.PurchaseReceiptLineId == source.PurchaseReceiptLineId && x.Direction == InventoryDirection.Receipt && x.ReversalOfId == null)
            .GroupBy(_ => 1).Select(g => new { Quantity = g.Sum(x => x.Quantity), TotalCost = g.Sum(x => x.Quantity * (x.UnitCostBase ?? 0m)) })
            .SingleOrDefaultAsync();
        var unitCostBase = receiptCost is { Quantity: > 0m } ? receiptCost.TotalCost / receiptCost.Quantity : 0m;
        var stockItem = await db.StockItems.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == source.StockItemId);
        var tracking = await AllocateAvailableTrackingAsync(db, tenantId, warehouse.Id, stockItem, row.Quantity, row.StorageLocationId);
        if (tracking is null) return Results.Conflict(new { error = $"{source.StockCode} için lot/seri bazında alış iadesi stoğu yetersiz." });
        var issueMovement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id,
            StockItemId = source.StockItemId, EntryDate = request.ReturnDate, Direction = InventoryDirection.Issue,
            Quantity = row.Quantity, UnitCostBase = unitCostBase, StorageLocationId = row.StorageLocationId,
            Description = $"Alış iadesi {code}", SupplierReturnLine = line };
        issueMovement.Tracking = ToTraceEntities(tenantId, stockItem, tracking);
        db.InventoryTransactions.Add(issueMovement);
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(amountsList); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Toplamı sıfır olan alış iadesi kaydedilemez." });
    supplierReturn.Subtotal = totals.Subtotal; supplierReturn.DiscountTotal = totals.DiscountTotal;
    supplierReturn.TaxTotal = totals.TaxTotal; supplierReturn.GrandTotal = totals.GrandTotal;
    db.SupplierReturns.Add(supplierReturn);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, SupplierReturn = supplierReturn,
        EntryDate = request.ReturnDate, Direction = CustomerLedgerDirection.Debit, Amount = totals.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Alış iadesi {code} · Fatura {invoice.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-return.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "İade istek anahtarı daha önce kullanıldı." }); }
    await transaction.CommitAsync();
    var returnLines = supplierReturn.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SupplierReturnLineView(x.PurchaseInvoiceLineId,
        x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal, x.EnteredQuantity, x.EnteredUnitCode,
        returnRequests.Single(r => r.PurchaseInvoiceLineId == x.PurchaseInvoiceLineId).StorageLocationId)).ToList();
    return Results.Created($"/api/purchasing/returns/{supplierReturn.Id}", new SupplierReturnSummary(supplierReturn.Id, code,
        invoice.Id, invoice.Code, warehouse.Id, warehouse.Name, supplierReturn.ReturnDate, supplierReturn.Status,
        supplierReturn.GrandTotal, supplierReturn.Lines.Count, supplierReturn.CreatedAt, returnLines));
});
purchaseInvoices.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseOrderId, x.PurchaseReceiptId, x.SupplierId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseOrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseReceiptId}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "Alış faturası daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "PurchaseInvoice", invoice.Id)) return Results.Conflict(new { error = "Alış faturası yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    if (await db.SupplierPayments.AnyAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierPaymentStatus.Posted))
        return Results.Conflict(new { error = "Alış faturası önce bağlı tedarikçi ödemeleri iptal edilerek kapatılmalıdır." });
    if (await db.SupplierReturns.AnyAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierReturnStatus.Posted))
        return Results.Conflict(new { error = "Alış faturası önce bağlı alış iadeleri iptal edilerek kapatılmalıdır." });
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {supplier.Id} AND [PurchaseInvoiceId] = {id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (invoice.GrandTotal > 0 && original is null) return Results.Conflict(new { error = "Alış faturasının cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (original is not null)
    {
        if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Alış faturasının cari hareketi zaten ters kayıtla kapatılmış." });
        db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Debit, Amount = original.Amount,
            CurrencyCode = original.CurrencyCode, Description = $"Alış faturası iptali {invoice.Code}", ReversalOfId = original.Id });
    }
    invoice.Status = PurchaseInvoiceStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-invoice.voided", Resource = invoice.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { invoice.Id, invoice.Code, invoice.Status });
});
var supplierReturns = app.MapGroup("/api/purchasing/returns").RequireAuthorization();
supplierReturns.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseInvoiceId, x.SupplierId, x.WarehouseId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseInvoiceId}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    var supplierReturn = await db.SupplierReturns.FromSqlInterpolated($"SELECT * FROM [dbo].[SupplierReturns] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (supplierReturn is null) return Results.NotFound();
    if (supplierReturn.Status != SupplierReturnStatus.Posted) return Results.Conflict(new { error = "Alış iadesi daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "SupplierReturn", supplierReturn.Id)) return Results.Conflict(new { error = "Alış iadesi yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    var lines = await db.SupplierReturnLines.Where(x => x.TenantId == tenantId && x.SupplierReturnId == id).ToListAsync();
    var movements = new List<InventoryTransaction>();
    foreach (var line in lines)
    {
        var source = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [SupplierReturnLineId] = {line.Id} AND [ReversalOfId] IS NULL").ToListAsync();
        movements.AddRange(source);
    }
    if (movements.Count != lines.Count || movements.Any(x => x.Direction != InventoryDirection.Issue)
        || lines.Any(line => movements.Count(x => x.SupplierReturnLineId == line.Id && x.Quantity == line.Quantity) != 1))
        return Results.Conflict(new { error = "İade stok hareketleri kaynak satırlarla eşleşmediği için güvenli iptal yapılamadı." });
    var originalLedger = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {supplier.Id} AND [SupplierReturnId] = {id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (originalLedger is null || originalLedger.Direction != CustomerLedgerDirection.Debit || originalLedger.Amount != supplierReturn.GrandTotal)
        return Results.Conflict(new { error = "İadenin cari hareketi kaynak belgeyle eşleşmediği için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == originalLedger.Id)) return Results.Conflict(new { error = "İade cari hareketi daha önce ters kayıtla kapatılmış." });
    foreach (var movement in movements)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Receipt, Quantity = movement.Quantity,
            UnitCostBase = movement.UnitCostBase, StorageLocationId = movement.StorageLocationId,
            Description = $"Alış iadesi iptali {supplierReturn.Code}", ReversalOfId = movement.Id, SupplierReturnLineId = movement.SupplierReturnLineId,
            Tracking = await CopyTrackingAsync(db, tenantId, movement) });
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, SupplierReturnId = supplierReturn.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Credit, Amount = originalLedger.Amount,
        CurrencyCode = originalLedger.CurrencyCode, Description = $"Alış iadesi iptali {supplierReturn.Code}", ReversalOfId = originalLedger.Id });
    supplierReturn.Status = SupplierReturnStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-return.voided", Resource = supplierReturn.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { supplierReturn.Id, supplierReturn.Code, supplierReturn.Status });
});
var supplierPayments = app.MapGroup("/api/purchasing/payments").RequireAuthorization();
supplierPayments.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseInvoiceId, x.SupplierId, x.FinancialAccountId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseInvoiceId}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    var payment = await db.SupplierPayments.FromSqlInterpolated($"SELECT * FROM [dbo].[SupplierPayments] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (payment is null) return Results.NotFound();
    if (payment.Status != SupplierPaymentStatus.Posted) return Results.Conflict(new { error = "Tedarikçi ödemesi daha önce iptal edildi." });
    if (await HasUnreversedJournalEntryAsync(db, tenantId, "SupplierPayment", payment.Id)) return Results.Conflict(new { error = "Tedarikçi ödemesi yevmiyeye aktarılmış. Önce yevmiye fişini ters kayıtla kapatın." });
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {supplier.Id} AND [SupplierPaymentId] = {payment.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (original is null) return Results.Conflict(new { error = "Ödemenin cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Ödeme cari hareketi zaten ters kayıtla kapatılmış." });
    if (identity.FinancialAccountId is { } accountId)
    {
        var financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (financialAccount is null) return Results.Conflict(new { error = "Ödemeye bağlı finans hesabı bulunamadı." });
        var financialMovement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [SupplierPaymentId] = {payment.Id}").SingleOrDefaultAsync();
        if (financialMovement is null || financialMovement.Direction != FinancialDirection.Outflow || financialMovement.Amount != payment.Amount)
            return Results.Conflict(new { error = "Ödemenin finans hareketi kaynak belgeyle eşleşmediği için güvenli iptal yapılamadı." });
        if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == financialMovement.Id))
            return Results.Conflict(new { error = "Ödemenin finans hareketi daha önce ters kayıtla kapatılmış." });
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccountId = financialAccount.Id,
            CurrencyCode = financialMovement.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = FinancialDirection.Inflow, CashFlowCategory = financialMovement.CashFlowCategory, Amount = financialMovement.Amount, Description = $"Tedarikçi ödemesi iptali {payment.Code}",
            Reference = financialMovement.Reference, ReversalOfId = financialMovement.Id });
    }
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Credit, Amount = original.Amount,
        CurrencyCode = original.CurrencyCode, Description = $"Tedarikçi ödemesi iptali {payment.Code}", ReversalOfId = original.Id });
    payment.Status = SupplierPaymentStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-payment.voided", Resource = payment.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { payment.Id, payment.Code, payment.Status });
});

app.MapGet("/api/finance/currency", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var currency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
    return currency is null ? Results.NotFound() : Results.Ok(new TenantCurrencySettingsView(currency));
}).RequireAuthorization();
app.MapPut("/api/finance/currency", async (TenantCurrencySettingsWriteRequest body, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.BaseCurrencyCode?.Trim().ToUpperInvariant();
    if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z]{3}$"))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["baseCurrencyCode"] = ["Baz para birimi üç harfli ISO kodu olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    if (tenant.BaseCurrencyCode != code)
    {
        var hasActivity = await db.TenantExchangeRates.AnyAsync(x => x.TenantId == tenantId)
            || await db.FinancialAccounts.AnyAsync(x => x.TenantId == tenantId)
            || await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId)
            || await db.PurchaseSupplierQuotes.AnyAsync(x => x.TenantId == tenantId)
            || await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId)
            || await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId)
            || await db.PurchaseInvoices.AnyAsync(x => x.TenantId == tenantId);
        if (hasActivity) return Results.Conflict(new { error = "Baz para birimi döviz kuru veya finansal hareket kaydedildikten sonra değiştirilemez." });
        tenant.BaseCurrencyCode = code;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.base-currency.changed", Resource = code });
        await db.SaveChangesAsync();
    }
    await transaction.CommitAsync();
    return Results.Ok(new TenantCurrencySettingsView(tenant.BaseCurrencyCode));
}).RequireAuthorization();
app.MapExchangeRateEndpoints();

app.MapGet("/api/finance/fx-exposure", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
        .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
    if (baseCurrency is null) return Results.NotFound();
    var asOf = DateOnly.FromDateTime(DateTime.UtcNow);
    var sales = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, Counterparty = x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal }).ToListAsync();
    var collected = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.CustomerCollection.Status == CustomerCollectionStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var salesReturns = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, Counterparty = x.Supplier.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal }).ToListAsync();
    var paid = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchaseReturns = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var exchangeRates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
        .Select(x => new { x.CurrencyCode, x.RateDate, x.Rate }).ToListAsync();
    decimal? RateAt(string currencyCode, DateOnly date) => currencyCode == baseCurrency ? 1m
        : exchangeRates.FirstOrDefault(x => x.CurrencyCode == currencyCode && x.RateDate <= date)?.Rate;

    var open = sales.Select(x => (Direction: "Receivable", x.Id, x.Code, x.Counterparty, x.InvoiceDate, x.CurrencyCode,
            Outstanding: Math.Max(0m, x.GrandTotal - collected.GetValueOrDefault(x.Id) - salesReturns.GetValueOrDefault(x.Id))))
        .Concat(purchases.Select(x => (Direction: "Payable", x.Id, x.Code, x.Counterparty, x.InvoiceDate, x.CurrencyCode,
            Outstanding: Math.Max(0m, x.GrandTotal - paid.GetValueOrDefault(x.Id) - purchaseReturns.GetValueOrDefault(x.Id)))))
        .Where(x => x.Outstanding > 0).ToList();
    var lines = new List<FxExposureLineView>(open.Count);
    foreach (var invoice in open)
    {
        var historicalRate = RateAt(invoice.CurrencyCode, invoice.InvoiceDate);
        var currentRate = RateAt(invoice.CurrencyCode, asOf);
        decimal? historicalAmount = historicalRate is null ? null : decimal.Round(invoice.Outstanding * historicalRate.Value, 2, MidpointRounding.AwayFromZero);
        decimal? currentAmount = currentRate is null ? null : decimal.Round(invoice.Outstanding * currentRate.Value, 2, MidpointRounding.AwayFromZero);
        lines.Add(new FxExposureLineView(invoice.Direction, invoice.Id, invoice.Code, invoice.Counterparty,
            invoice.InvoiceDate, invoice.CurrencyCode, invoice.Outstanding, historicalRate, currentRate,
            historicalAmount, currentAmount, historicalAmount is null || currentAmount is null ? null : currentAmount - historicalAmount));
    }
    var orderedLines = lines.OrderBy(x => x.Direction).ThenBy(x => x.CurrencyCode).ThenBy(x => x.InvoiceCode).ToList();
    var summaries = orderedLines.GroupBy(x => new { x.Direction, x.CurrencyCode }).Select(group =>
    {
        var unconverted = group.Count(x => x.HistoricalBaseAmount is null || x.CurrentBaseAmount is null);
        return new FxExposureCurrencySummary(group.Key.Direction, group.Key.CurrencyCode, group.Count(), group.Sum(x => x.OutstandingAmount),
            unconverted == 0 ? group.Sum(x => x.HistoricalBaseAmount!.Value) : null,
            unconverted == 0 ? group.Sum(x => x.CurrentBaseAmount!.Value) : null,
            unconverted == 0 ? group.Sum(x => x.EstimatedChangeBase!.Value) : null, unconverted);
    }).OrderBy(x => x.Direction).ThenBy(x => x.CurrencyCode).ToList();
    return Results.Ok(new FxExposureReport(baseCurrency, asOf, summaries, orderedLines));
}).RequireAuthorization();

var fxRevaluations = app.MapGroup("/api/finance/fx-revaluations").RequireAuthorization();
fxRevaluations.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var vouchers = await db.FxRevaluationVouchers.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.AsOfDate).Select(x => new { x.Id, x.Code, x.AsOfDate, x.BaseCurrencyCode, x.CreatedAt,
            LineCount = x.Lines.Count, TotalDebit = x.Lines.Sum(line => (decimal?)line.DebitBaseAmount) ?? 0m,
            TotalCredit = x.Lines.Sum(line => (decimal?)line.CreditBaseAmount) ?? 0m }).ToListAsync();
    return Results.Ok(vouchers);
});
fxRevaluations.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var voucher = await db.FxRevaluationVouchers.AsNoTracking().Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (voucher is null) return Results.NotFound();
    var lines = voucher.Lines.OrderBy(x => x.Direction).ThenBy(x => x.CurrencyCode).ThenBy(x => x.InvoiceCode)
        .Select(x => new FxRevaluationVoucherLineView(x.Id, x.Direction, x.InvoiceId, x.InvoiceCode, x.CounterpartyName,
            x.CurrencyCode, x.OutstandingAmount, x.InvoiceDateRate, x.ClosingRate, x.PreviousAdjustmentBase,
            x.TargetAdjustmentBase, x.AdjustmentBase, x.DebitAccount, x.CreditAccount, x.DebitBaseAmount, x.CreditBaseAmount)).ToList();
    return Results.Ok(new FxRevaluationVoucherView(voucher.Id, voucher.Code, voucher.AsOfDate, voucher.BaseCurrencyCode,
        voucher.CreatedAt, voucher.CreatedByUserId, lines.Sum(x => x.DebitBaseAmount), lines.Sum(x => x.CreditBaseAmount), lines));
});
fxRevaluations.MapPost("/", async (FxRevaluationCreateRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    if (request.AsOfDate > today)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["asOfDate"] = ["Değerleme tarihi bugün veya geçmiş bir tarih olmalıdır."] });

    await using var transaction = await db.Database.BeginTransactionAsync();
    // Serialize tenant valuation runs so the prior-period snapshot cannot change during calculation.
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    if (await db.FxRevaluationVouchers.AnyAsync(x => x.TenantId == tenantId && x.AsOfDate == request.AsOfDate))
        return Results.Conflict(new { error = "Bu dönem tarihi için değerleme fişi zaten oluşturulmuş. Fişler değiştirilemez." });
    if (await db.FxRevaluationVouchers.AnyAsync(x => x.TenantId == tenantId && x.AsOfDate > request.AsOfDate))
        return Results.Conflict(new { error = "Değerleme fişleri dönem sonu tarihine göre kronolojik oluşturulmalıdır." });

    var sales = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, Counterparty = x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal }).ToListAsync();
    var collected = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.CustomerCollection.Status == CustomerCollectionStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var salesReturns = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, Counterparty = x.Supplier.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal }).ToListAsync();
    var paid = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchaseReturns = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var openInvoices = sales.Select(x => (Direction: FxRevaluationDirection.Receivable, x.Id, x.Code, x.Counterparty,
            x.InvoiceDate, x.CurrencyCode, Outstanding: Math.Max(0m, x.GrandTotal - collected.GetValueOrDefault(x.Id) - salesReturns.GetValueOrDefault(x.Id))))
        .Concat(purchases.Select(x => (Direction: FxRevaluationDirection.Payable, x.Id, x.Code, x.Counterparty,
            x.InvoiceDate, x.CurrencyCode, Outstanding: Math.Max(0m, x.GrandTotal - paid.GetValueOrDefault(x.Id) - purchaseReturns.GetValueOrDefault(x.Id)))))
        .Where(x => x.Outstanding > 0 && x.CurrencyCode != tenant.BaseCurrencyCode).ToList();

    var rates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.RateDate <= request.AsOfDate)
        .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
        .Select(x => new { x.CurrencyCode, x.RateDate, x.Rate }).ToListAsync();
    decimal? RateAt(string currency, DateOnly date) => currency == tenant.BaseCurrencyCode ? 1m
        : rates.FirstOrDefault(x => x.CurrencyCode == currency && x.RateDate <= date)?.Rate;
    var missing = openInvoices.Where(x => RateAt(x.CurrencyCode, x.InvoiceDate) is null || RateAt(x.CurrencyCode, request.AsOfDate) is null)
        .Select(x => $"{x.Code} ({x.CurrencyCode})").Distinct().Order().ToList();
    if (missing.Count > 0)
        return Results.Conflict(new { error = "Değerleme yapılamadı; fatura tarihi veya dönem sonu kuru eksik.", invoices = missing });

    var priorLines = await db.FxRevaluationVoucherLines.AsNoTracking().Include(x => x.Voucher)
        .Where(x => x.TenantId == tenantId && x.Voucher.AsOfDate < request.AsOfDate)
        .OrderByDescending(x => x.Voucher.AsOfDate).ThenByDescending(x => x.Voucher.CreatedAt).ToListAsync();
    var priorByInvoice = priorLines.GroupBy(x => (x.Direction, x.InvoiceId)).ToDictionary(x => x.Key, x => x.First());
    var currentByInvoice = openInvoices.ToDictionary(x => (x.Direction, InvoiceId: x.Id));
    if (currentByInvoice.Count == 0 && priorByInvoice.Count == 0)
        return Results.Conflict(new { error = "Bu tarih için değerleme gerektiren açık döviz faturası veya önceki değerleme bakiyesi yok." });
    var voucher = new FxRevaluationVoucher { TenantId = tenantId, Code = $"DVK-{request.AsOfDate:yyyyMMdd}",
        AsOfDate = request.AsOfDate, BaseCurrencyCode = tenant.BaseCurrencyCode, CreatedByUserId = GetUserId(principal) };
    var keys = currentByInvoice.Keys.Union(priorByInvoice.Keys).ToList();
    foreach (var key in keys)
    {
        currentByInvoice.TryGetValue(key, out var invoice);
        priorByInvoice.TryGetValue(key, out var prior);
        var outstanding = invoice.Outstanding;
        var invoiceRate = invoice.Id == Guid.Empty ? prior!.InvoiceDateRate : RateAt(invoice.CurrencyCode, invoice.InvoiceDate)!.Value;
        var closingRate = invoice.Id == Guid.Empty ? prior!.ClosingRate : RateAt(invoice.CurrencyCode, request.AsOfDate)!.Value;
        var previousAdjustment = prior?.TargetAdjustmentBase ?? 0m;
        var target = FxRevaluationCalculator.TargetAdjustment(key.Direction, outstanding, invoiceRate, closingRate);
        var adjustment = target - previousAdjustment;
        var amount = Math.Abs(adjustment);
        voucher.Lines.Add(new FxRevaluationVoucherLine { TenantId = tenantId, Voucher = voucher, Direction = key.Direction,
            InvoiceId = key.Item2, InvoiceCode = invoice.Id == Guid.Empty ? prior!.InvoiceCode : invoice.Code,
            CounterpartyName = invoice.Id == Guid.Empty ? prior!.CounterpartyName : invoice.Counterparty,
            CurrencyCode = invoice.Id == Guid.Empty ? prior!.CurrencyCode : invoice.CurrencyCode,
            OutstandingAmount = outstanding, InvoiceDateRate = invoiceRate, ClosingRate = closingRate,
            PreviousAdjustmentBase = previousAdjustment, TargetAdjustmentBase = target, AdjustmentBase = adjustment,
            DebitAccount = "", CreditAccount = "", DebitBaseAmount = amount, CreditBaseAmount = amount });
    }
    db.FxRevaluationVouchers.Add(voucher);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.fx-revaluation.created",
        Resource = $"{voucher.Code}:{voucher.Lines.Count}:debit={voucher.Lines.Sum(x => x.DebitBaseAmount):0.00}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    var responseLines = voucher.Lines.OrderBy(x => x.Direction).ThenBy(x => x.CurrencyCode).ThenBy(x => x.InvoiceCode)
        .Select(x => new FxRevaluationVoucherLineView(x.Id, x.Direction, x.InvoiceId, x.InvoiceCode, x.CounterpartyName,
            x.CurrencyCode, x.OutstandingAmount, x.InvoiceDateRate, x.ClosingRate, x.PreviousAdjustmentBase,
            x.TargetAdjustmentBase, x.AdjustmentBase, x.DebitAccount, x.CreditAccount, x.DebitBaseAmount, x.CreditBaseAmount)).ToList();
    return Results.Created($"/api/finance/fx-revaluations/{voucher.Id}", new FxRevaluationVoucherView(voucher.Id, voucher.Code,
        voucher.AsOfDate, voucher.BaseCurrencyCode, voucher.CreatedAt, voucher.CreatedByUserId,
        responseLines.Sum(x => x.DebitBaseAmount), responseLines.Sum(x => x.CreditBaseAmount), responseLines));
});

var financeAccounts = app.MapGroup("/api/finance/accounts").RequireAuthorization();
var generalLedger = app.MapGroup("/api/finance/general-ledger").RequireAuthorization();
var ledgerMappingLabels = new Dictionary<string, string>(StringComparer.Ordinal)
{
    [LedgerMappingKeys.CreditFacilityPrincipal] = "Kredi kullandırım/geri ödeme · anapara borç hesabı",
    [LedgerMappingKeys.CreditFacilityInterestExpense] = "Kredi geri ödemesi · faiz gideri hesabı",
    [LedgerMappingKeys.CreditFacilityFeeExpense] = "Kredi geri ödemesi · ücret/komisyon gideri hesabı",
    [LedgerMappingKeys.SalesReceivable] = "Satış faturası · alacak hesabı",
    [LedgerMappingKeys.SalesRevenue] = "Satış faturası · gelir hesabı",
    [LedgerMappingKeys.SalesCost] = "Satış irsaliyesi · satılan mal maliyeti hesabı",
    [LedgerMappingKeys.SalesTaxPayable] = "Satış faturası · hesaplanan KDV hesabı",
    [LedgerMappingKeys.CustomerCardClearing] = "Kart tahsilatı · kart alacak/clearing hesabı",
    [LedgerMappingKeys.CustomerCheckClearing] = "Çek tahsilatı · portföy hesabı",
    [LedgerMappingKeys.PurchasePayable] = "Alış faturası · borç hesabı",
    [LedgerMappingKeys.PurchaseCost] = "Alış faturası · maliyet hesabı",
    [LedgerMappingKeys.PurchaseTaxRecoverable] = "Alış faturası · indirilecek KDV hesabı",
    [LedgerMappingKeys.PurchaseReceiptAccrual] = "Mal kabul · faturası gelmemiş mal hesabı",
    [LedgerMappingKeys.SupplierCardClearing] = "Kart ödemesi · kart clearing hesabı",
    [LedgerMappingKeys.SupplierCheckClearing] = "Çek ödemesi · çek hesabı",
    [LedgerMappingKeys.InstrumentReceivablePortfolio] = "Alacak çek/senet · portföy hesabı",
    [LedgerMappingKeys.InstrumentPayablePortfolio] = "Borç çek/senet · portföy hesabı",
    [LedgerMappingKeys.InstrumentReceivableOffset] = "Alacak çek/senet · karşı cari hesabı",
    [LedgerMappingKeys.InstrumentPayableOffset] = "Borç çek/senet · karşı cari hesabı",
    [LedgerMappingKeys.InstrumentEndorsementOffset] = "Ciro edilen alacak çeki · borç/ciro karşı hesabı",
    [LedgerMappingKeys.FxReceivable] = "Kur değerleme · alacak kontrol hesabı",
    [LedgerMappingKeys.FxPayable] = "Kur değerleme · borç kontrol hesabı",
    [LedgerMappingKeys.FxGain] = "Kur değerleme · gelir karşı hesabı",
    [LedgerMappingKeys.FxLoss] = "Kur değerleme · gider karşı hesabı",
    [LedgerMappingKeys.InventoryAsset] = "Stok maliyet hareketi · stok hesabı",
    [LedgerMappingKeys.InventoryReturnCostOffset] = "İade stok hareketi · maliyet karşı hesabı",
    [LedgerMappingKeys.InventoryRevaluationOffset] = "Stok yeniden değerleme · karşı hesap",
    [LedgerMappingKeys.InventoryLandedCostOffset] = "Ek maliyet · karşı hesap",
    [LedgerMappingKeys.InventoryReversalOffset] = "Stok ters kayıt · karşı hesap",
    [LedgerMappingKeys.FixedAssetDepreciationExpense] = "Sabit kıymet · amortisman gideri",
    [LedgerMappingKeys.FixedAssetAccumulatedDepreciation] = "Sabit kıymet · birikmiş amortisman",
    [LedgerMappingKeys.FixedAssetCost] = "Sabit kıymet · edinim maliyeti hesabı",
    [LedgerMappingKeys.FixedAssetDisposalProceeds] = "Sabit kıymet · elden çıkarma tahsilat hesabı",
    [LedgerMappingKeys.FixedAssetDisposalGain] = "Sabit kıymet · elden çıkarma kârı",
    [LedgerMappingKeys.FixedAssetDisposalLoss] = "Sabit kıymet · elden çıkarma zararı"
};
generalLedger.MapGet("/accounts", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    return Results.Ok(await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderBy(x => x.Code).Select(x => new LedgerAccountView(x.Id, x.Code, x.Name, x.IsActive, x.StatementSection.ToString())).ToListAsync());
});
generalLedger.MapPost("/accounts", async (LedgerAccountWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = request.Code.Trim(); var name = request.Name.Trim();
    if (code.Length is 0 or > 32 || name.Length is 0 or > 160) return Results.ValidationProblem(new Dictionary<string, string[]> { ["account"] = ["Hesap kodu (1–32) ve adı (1–160) gereklidir."] });
    var statementSection = LedgerAccountStatementSection.Unclassified;
    if (!string.IsNullOrWhiteSpace(request.StatementSection) && (!Enum.TryParse(request.StatementSection, true, out statementSection) || !Enum.IsDefined(statementSection)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["statementSection"] = ["Geçerli bir finansal tablo sınıfı seçin."] });
    if (await db.LedgerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu hesap kodu zaten tanımlı." });
    var account = new LedgerAccount { TenantId = tenantId, Code = code, Name = name, IsActive = request.IsActive, StatementSection = statementSection };
    db.LedgerAccounts.Add(account);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.account-created", Resource = code });
    await db.SaveChangesAsync();
    return Results.Created($"/api/finance/general-ledger/accounts/{account.Id}", new LedgerAccountView(account.Id, account.Code, account.Name, account.IsActive, account.StatementSection.ToString()));
});
generalLedger.MapPut("/accounts/{id:guid}", async (Guid id, LedgerAccountWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var account = await db.LedgerAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (account is null) return Results.NotFound();
    var code = request.Code.Trim(); var name = request.Name.Trim();
    if (code.Length is 0 or > 32 || name.Length is 0 or > 160) return Results.ValidationProblem(new Dictionary<string, string[]> { ["account"] = ["Hesap kodu (1–32) ve adı (1–160) gereklidir."] });
    var statementSection = account.StatementSection;
    if (!string.IsNullOrWhiteSpace(request.StatementSection) && (!Enum.TryParse(request.StatementSection, true, out statementSection) || !Enum.IsDefined(statementSection)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["statementSection"] = ["Geçerli bir finansal tablo sınıfı seçin."] });
    if ((account.Code != code || account.Name != name) && await db.JournalEntryLines.AnyAsync(x => x.TenantId == tenantId && x.AccountId == id))
        return Results.Conflict(new { error = "Yevmiye kaydı bulunan hesabın kodu ve adı değiştirilemez; hesabı pasife alın ve yeni hesap açın." });
    if (await db.LedgerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code)) return Results.Conflict(new { error = "Bu hesap kodu zaten tanımlı." });
    account.Code = code; account.Name = name; account.IsActive = request.IsActive; account.StatementSection = statementSection;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.account-updated", Resource = code });
    await db.SaveChangesAsync();
    return Results.Ok(new LedgerAccountView(account.Id, account.Code, account.Name, account.IsActive, account.StatementSection.ToString()));
});
generalLedger.MapGet("/mappings", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var mappings = await db.LedgerAccountMappings.AsNoTracking().Where(x => x.TenantId == tenantId)
        .Join(db.LedgerAccounts.AsNoTracking(), m => new { m.TenantId, Id = m.AccountId }, a => new { a.TenantId, a.Id }, (m, a) => new { m.MappingKey, a.Id, a.Code, a.Name }).ToListAsync();
    var result = ledgerMappingLabels.Select(x => { var account = mappings.FirstOrDefault(m => m.MappingKey == x.Key); return new LedgerMappingView(x.Key, x.Value, account?.Id, account?.Code, account?.Name); }).ToList();
    var financialAccounts = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Name)
        .Select(x => new { x.Id, x.Name, x.CurrencyCode, x.IsActive }).ToListAsync();
    foreach (var source in financialAccounts)
    {
        var key = LedgerMappingKeys.FinancialAccountPrefix + source.Id;
        var account = mappings.FirstOrDefault(m => m.MappingKey == key);
        result.Add(new LedgerMappingView(key, $"Kasa/banka · {source.Name} ({source.CurrencyCode}){(source.IsActive ? "" : " · Pasif")}", account?.Id, account?.Code, account?.Name));
    }
    return Results.Ok(result);
});
generalLedger.MapGet("/sources", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var tenantBaseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
    var transferred = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId
            && (x.SourceType == "FxRevaluation" || x.SourceType == "InventoryCostAdjustment"))
        .Select(x => new { x.SourceType, x.SourceId }).ToListAsync();
    var fxDone = transferred.Where(x => x.SourceType == "FxRevaluation").Select(x => x.SourceId).ToHashSet();
    var inventoryDone = transferred.Where(x => x.SourceType == "InventoryCostAdjustment").Select(x => x.SourceId).ToHashSet();
    var salesDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "SalesInvoice")
        .Select(x => x.SourceId).ToListAsync();
    var salesDeliveryDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "SalesDelivery")
        .Select(x => x.SourceId).ToListAsync();
    var purchaseDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "PurchaseInvoice")
        .Select(x => x.SourceId).ToListAsync();
    var purchaseReceiptDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "PurchaseReceipt")
        .Select(x => x.SourceId).ToListAsync();
    var collectionDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "CustomerCollection")
        .Select(x => x.SourceId).ToListAsync();
    var paymentDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "SupplierPayment")
        .Select(x => x.SourceId).ToListAsync();
    var salesReturnDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "SalesReturn")
        .Select(x => x.SourceId).ToListAsync();
    var supplierReturnDone = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == "SupplierReturn")
        .Select(x => x.SourceId).ToListAsync();
    var salesInvoices = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted && !salesDone.Contains(x.Id))
        .OrderByDescending(x => x.InvoiceDate).Take(200).Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.InvoiceDate, amount = x.GrandTotal,
            currencyCode = x.CurrencyCode,
            description = x.Customer.Name,
            requiredMappings = x.TaxTotal > 0
                ? new[] { LedgerMappingKeys.SalesReceivable, LedgerMappingKeys.SalesRevenue, LedgerMappingKeys.SalesTaxPayable }
                : new[] { LedgerMappingKeys.SalesReceivable, LedgerMappingKeys.SalesRevenue }
        }).ToListAsync();
    var salesDeliveries = await db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesDeliveryStatus.Posted && !salesDeliveryDone.Contains(x.Id))
        .OrderByDescending(x => x.DeliveryDate).Take(200).Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.DeliveryDate,
            amount = x.Lines.SelectMany(l => l.InventoryTransactions).Where(t => t.UnitCostBase.HasValue && t.Direction == InventoryDirection.Issue && t.ReversalOfId == null)
                .Sum(t => t.Quantity * t.UnitCostBase!.Value),
            currencyCode = tenantBaseCurrency, description = x.Order.Customer.Name,
            requiredMappings = new[] { LedgerMappingKeys.InventoryAsset, LedgerMappingKeys.SalesCost }
        }).ToListAsync();
    var purchaseInvoices = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted && !purchaseDone.Contains(x.Id))
        .OrderByDescending(x => x.InvoiceDate).Take(200).Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.InvoiceDate, amount = x.GrandTotal, currencyCode = x.CurrencyCode,
            description = x.Supplier.Name,
            requiredMappings = (x.TaxTotal > 0
                ? new[] { LedgerMappingKeys.PurchasePayable, LedgerMappingKeys.PurchaseCost, LedgerMappingKeys.PurchaseTaxRecoverable }
                : new[] { LedgerMappingKeys.PurchasePayable, LedgerMappingKeys.PurchaseCost })
            .Concat(purchaseReceiptDone.Contains(x.PurchaseReceiptId) ? new[] { LedgerMappingKeys.PurchaseReceiptAccrual } : Array.Empty<string>()).ToArray()
        }).ToListAsync();
    var purchaseReceipts = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseReceiptStatus.Posted
            && !purchaseReceiptDone.Contains(x.Id) && !x.Invoices.Any(i => i.Status == PurchaseInvoiceStatus.Posted && purchaseDone.Contains(i.Id)))
        .OrderByDescending(x => x.ReceiptDate).Take(200).Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.ReceiptDate,
            amount = x.Lines.SelectMany(l => l.InventoryTransactions).Where(t => t.UnitCostBase.HasValue).Sum(t => t.Quantity * t.UnitCostBase!.Value),
            currencyCode = tenantBaseCurrency, description = x.PurchaseOrder.Supplier.Name,
            requiredMappings = new[] { LedgerMappingKeys.InventoryAsset, LedgerMappingKeys.PurchaseReceiptAccrual }
        }).ToListAsync();
    var collectionRows = await db.CustomerCollections.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == CustomerCollectionStatus.Posted
            && !collectionDone.Contains(x.Id))
        .OrderByDescending(x => x.CollectionDate).Take(200).Select(x => new
        {
            x.Id, x.Code, EntryDate = x.CollectionDate, x.Amount, x.CurrencyCode, CounterpartyName = x.Customer.Name,
            x.PaymentMethod, x.FinancialAccountId
        }).ToListAsync();
    var customerCollections = collectionRows.Select(x => new
    {
        id = x.Id, code = x.Code, entryDate = x.EntryDate, amount = x.Amount, currencyCode = x.CurrencyCode,
        description = x.CounterpartyName,
        requiredMappings = new[] { LedgerMappingKeys.SalesReceivable, x.FinancialAccountId is { } accountId
            ? LedgerMappingKeys.FinancialAccountPrefix + accountId
            : x.PaymentMethod == "Card" ? LedgerMappingKeys.CustomerCardClearing : LedgerMappingKeys.CustomerCheckClearing }
    }).ToList();
    var paymentRows = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted
            && !paymentDone.Contains(x.Id))
        .OrderByDescending(x => x.PaymentDate).Take(200).Select(x => new
        {
            x.Id, x.Code, EntryDate = x.PaymentDate, x.Amount, CurrencyCode = x.PurchaseInvoice.CurrencyCode,
            CounterpartyName = x.Supplier.Name, x.PaymentMethod, x.FinancialAccountId
        }).ToListAsync();
    var supplierPayments = paymentRows.Select(x => new
    {
        id = x.Id, code = x.Code, entryDate = x.EntryDate, amount = x.Amount, currencyCode = x.CurrencyCode,
        description = x.CounterpartyName,
        requiredMappings = new[] { LedgerMappingKeys.PurchasePayable, x.FinancialAccountId is { } accountId
            ? LedgerMappingKeys.FinancialAccountPrefix + accountId
            : x.PaymentMethod == "Card" ? LedgerMappingKeys.SupplierCardClearing : LedgerMappingKeys.SupplierCheckClearing }
    }).ToList();
    var salesReturns = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted && !salesReturnDone.Contains(x.Id))
        .OrderByDescending(x => x.ReturnDate).Take(200).Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.ReturnDate, amount = x.GrandTotal,
            currencyCode = x.SalesInvoice.CurrencyCode, description = x.Customer.Name,
            requiredMappings = x.TaxTotal > 0
                ? new[] { LedgerMappingKeys.SalesReceivable, LedgerMappingKeys.SalesRevenue, LedgerMappingKeys.SalesTaxPayable, LedgerMappingKeys.InventoryAsset, LedgerMappingKeys.SalesCost }
                : new[] { LedgerMappingKeys.SalesReceivable, LedgerMappingKeys.SalesRevenue, LedgerMappingKeys.InventoryAsset, LedgerMappingKeys.SalesCost }
        }).ToListAsync();
    var supplierReturns = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted && !supplierReturnDone.Contains(x.Id))
        .OrderByDescending(x => x.ReturnDate).Take(200).Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.ReturnDate, amount = x.GrandTotal,
            currencyCode = x.PurchaseInvoice.CurrencyCode, description = x.Supplier.Name,
            requiredMappings = x.TaxTotal > 0
                ? new[] { LedgerMappingKeys.PurchasePayable, LedgerMappingKeys.PurchaseCost, LedgerMappingKeys.PurchaseTaxRecoverable, LedgerMappingKeys.InventoryAsset }
                : new[] { LedgerMappingKeys.PurchasePayable, LedgerMappingKeys.PurchaseCost, LedgerMappingKeys.InventoryAsset }
        }).ToListAsync();
    var fx = await db.FxRevaluationVouchers.AsNoTracking().Where(x => x.TenantId == tenantId && !fxDone.Contains(x.Id))
        .OrderByDescending(x => x.AsOfDate).Take(200).Include(x => x.Lines).ToListAsync();
    var inventory = await db.InventoryCostAdjustments.AsNoTracking().Where(x => x.TenantId == tenantId && !inventoryDone.Contains(x.Id))
        .OrderByDescending(x => x.EntryDate).Take(200).Include(x => x.Lines).ToListAsync();
    return Results.Ok(new
    {
        salesInvoices,
        salesDeliveries,
        purchaseInvoices,
        purchaseReceipts,
        customerCollections,
        supplierPayments,
        salesReturns,
        supplierReturns,
        fxRevaluations = fx.Select(x => new
        {
            id = x.Id, code = x.Code, entryDate = x.AsOfDate, amount = x.Lines.Sum(l => l.DebitBaseAmount),
            requiredMappings = x.Lines.Where(l => l.AdjustmentBase != 0).SelectMany(l => l.AdjustmentBase > 0
                ? new[] { l.Direction == FxRevaluationDirection.Receivable ? LedgerMappingKeys.FxReceivable : LedgerMappingKeys.FxPayable, LedgerMappingKeys.FxGain }
                : new[] { l.Direction == FxRevaluationDirection.Receivable ? LedgerMappingKeys.FxReceivable : LedgerMappingKeys.FxPayable, LedgerMappingKeys.FxLoss }).Distinct().ToList()
        }),
        inventoryAdjustments = inventory.Select(x => new { id = x.Id, code = x.Code, entryDate = x.EntryDate, amount = x.Lines.Sum(l => Math.Abs(l.AmountBase)),
                kind = x.Kind.ToString(), description = x.Description, requiredMappings = new[] { LedgerMappingKeys.InventoryAsset,
                    x.Kind == InventoryCostAdjustmentKind.LandedCost ? LedgerMappingKeys.InventoryLandedCostOffset
                    : x.Kind == InventoryCostAdjustmentKind.Reversal ? LedgerMappingKeys.InventoryReversalOffset : LedgerMappingKeys.InventoryRevaluationOffset } })
    });
});
generalLedger.MapPut("/mappings/{mappingKey}", async (string mappingKey, LedgerMappingWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    string label;
    if (ledgerMappingLabels.TryGetValue(mappingKey, out var staticLabel)) label = staticLabel;
    else if (mappingKey.StartsWith(LedgerMappingKeys.FinancialAccountPrefix, StringComparison.Ordinal)
        && Guid.TryParse(mappingKey[LedgerMappingKeys.FinancialAccountPrefix.Length..], out var financialAccountId))
    {
        var sourceAccount = await db.FinancialAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == financialAccountId);
        if (sourceAccount is null) return Results.NotFound();
        label = $"Kasa/banka · {sourceAccount.Name} ({sourceAccount.CurrencyCode}){(sourceAccount.IsActive ? "" : " · Pasif")}";
    }
    else return Results.NotFound();
    if (mappingKey != request.MappingKey) return Results.NotFound();
    var account = await db.LedgerAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.AccountId && x.IsActive);
    if (account is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["accountId"] = ["Aktif bir tenant hesabı seçin."] });
    var mapping = await db.LedgerAccountMappings.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.MappingKey == mappingKey);
    if (mapping is null) db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = tenantId, MappingKey = mappingKey, AccountId = account.Id });
    else { mapping.AccountId = account.Id; mapping.UpdatedAt = DateTimeOffset.UtcNow; }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.mapping-updated", Resource = $"{mappingKey}:{account.Code}" });
    await db.SaveChangesAsync();
    return Results.Ok(new LedgerMappingView(mappingKey, label, account.Id, account.Code, account.Name));
});
generalLedger.MapGet("/entries", async (DateOnly? from, DateOnly? to, ClaimsPrincipal principal, TenantDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (from.HasValue && to.HasValue && from.Value > to.Value)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["dateRange"] = ["Başlangıç tarihi bitiş tarihinden sonra olamaz."] });
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (from.HasValue) query = query.Where(x => x.EntryDate >= from.Value);
    if (to.HasValue) query = query.Where(x => x.EntryDate <= to.Value);
    var total = await query.CountAsync();
    var entries = await query.OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new { x.Id, x.Code, x.EntryDate, x.Description, x.SourceType, x.SourceId, x.CreatedAt,
            TotalDebit = x.Lines.Sum(l => l.Debit), TotalCredit = x.Lines.Sum(l => l.Credit) }).ToListAsync();
    return Results.Ok(new { items = entries, page, pageSize, total });
});
generalLedger.MapPost("/entries/manual", async (ManualJournalEntryWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var description = request.Description?.Trim() ?? "";
    if (description.Length is 0 or > 240 || request.Lines is null || request.Lines.Count is < 2 or > 100)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["entry"] = ["Açıklama (1–240 karakter) ve 2–100 yevmiye satırı gereklidir."] });
    const decimal maxJournalLineAmount = 9_999_999_999_999_999.99m; // decimal(18,2) in the journal schema
    if (request.Lines.Any(line => line.AccountId == Guid.Empty || line.Debit < 0 || line.Credit < 0
        || line.Debit > maxJournalLineAmount || line.Credit > maxJournalLineAmount
        || (line.Debit > 0) == (line.Credit > 0) || decimal.Round(line.Debit, 2) != line.Debit || decimal.Round(line.Credit, 2) != line.Credit
        || string.IsNullOrWhiteSpace(line.Description) || line.Description.Trim().Length > 240))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Her satırda tenant hesabı, açıklama ve yalnız bir tarafta sıfırdan büyük iki ondalıklı tutar bulunmalıdır."] });
    var debitTotal = request.Lines.Sum(line => line.Debit);
    var creditTotal = request.Lines.Sum(line => line.Credit);
    if (debitTotal <= 0 || debitTotal != creditTotal)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Yevmiye fişinde borç ve alacak toplamları eşit ve sıfırdan büyük olmalıdır."] });
    var accountIds = request.Lines.Select(line => line.AccountId).Distinct().ToArray();
    var accounts = await db.LedgerAccounts.Where(x => x.TenantId == tenantId && x.IsActive && accountIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (accounts.Count != accountIds.Length) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Tüm satırlar aynı tenant'a ait aktif hesapları kullanmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (!await LockTenantForMutationAsync(db, tenantId)) return Results.NotFound();
    var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.EntryDate);
    if (closedPeriod is { } closed)
        return Results.Conflict(new { error = $"{closed.FromDate:yyyy-MM-dd}–{closed.ToDate:yyyy-MM-dd} dönemi kapalı; bu tarihe yevmiye eklenemez." });
    var entry = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = request.EntryDate,
        Description = description, SourceType = "Manual", SourceId = Guid.NewGuid(), CreatedByUserId = GetUserId(principal) };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var line = request.Lines[i];
        entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = line.AccountId,
            LineNumber = i + 1, Description = line.Description.Trim(), Debit = line.Debit, Credit = line.Credit });
    }
    db.JournalEntries.Add(entry);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.manual-entry-created", Resource = entry.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/general-ledger/entries/{entry.Id}", new { entry.Id, entry.Code, entry.EntryDate, entry.Description,
        entry.SourceType, entry.SourceId, TotalDebit = debitTotal, TotalCredit = creditTotal });
});
generalLedger.MapPost("/entries/{id:guid}/reverse", async (Guid id, ManualJournalEntryReverseRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var reason = request.Reason?.Trim() ?? "";
    if (reason.Length is 0 or > 240) return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["Ters kayıt gerekçesi 1–240 karakter olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, request.EntryDate);
    if (closedPeriod is { } closed)
        return Results.Conflict(new { error = $"{closed.FromDate:yyyy-MM-dd}–{closed.ToDate:yyyy-MM-dd} dönemi kapalı; bu tarihe ters kayıt eklenemez." });
    var original = await db.JournalEntries.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (original is null) return Results.NotFound();
    if (original.SourceType is not ("Manual" or "SalesInvoice" or "PurchaseInvoice" or "PurchaseReceipt" or "SalesDelivery" or "SalesReturn" or "SupplierReturn" or "CustomerCollection" or "SupplierPayment" or "FxRevaluation" or "InventoryCostAdjustment"))
        return Results.Conflict(new { error = "Bu kaynak türü ters kayıtla kapatılamaz." });
    if (await db.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "ManualReversal" && x.SourceId == original.Id))
        return Results.Conflict(new { error = "Bu fiş daha önce ters çevrilmiştir." });
    if (original.Lines.Count < 2) return Results.Conflict(new { error = "Ters çevrilecek fişte yeterli yevmiye satırı bulunamadı." });
    var reversalDescription = $"Ters kayıt · {original.Code} · {reason}";
    if (reversalDescription.Length > 240) reversalDescription = reversalDescription[..240];
    var reversal = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = request.EntryDate,
        Description = reversalDescription,
        SourceType = "ManualReversal", SourceId = original.Id, CreatedByUserId = GetUserId(principal) };
    foreach (var line in original.Lines.OrderBy(x => x.LineNumber))
        reversal.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = reversal.Id, AccountId = line.AccountId,
            LineNumber = line.LineNumber, Description = reversalDescription,
            Debit = line.Credit, Credit = line.Debit });
    db.JournalEntries.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.entry-reversed", Resource = $"{original.Code}:{reversal.Code}:{reason}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Created($"/api/finance/general-ledger/entries/{reversal.Id}", new { reversal.Id, reversal.Code, reversal.EntryDate,
        reversal.Description, reversal.SourceType, reversal.SourceId, TotalDebit = reversal.Lines.Sum(x => x.Debit), TotalCredit = reversal.Lines.Sum(x => x.Credit) });
});
generalLedger.MapTrialBalanceEndpoint();
generalLedger.MapBalanceSheetEndpoint();
generalLedger.MapFiscalYearCloseEndpoints();
generalLedger.MapGet("/entries/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var entry = await db.JournalEntries.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (entry is null) return Results.NotFound();
    var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && entry.Lines.Select(l => l.AccountId).Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    var lines = entry.Lines.OrderBy(x => x.LineNumber).Select(x => new JournalEntryLineView(x.LineNumber, x.AccountId,
        accounts[x.AccountId].Code, accounts[x.AccountId].Name, x.Description, x.Debit, x.Credit)).ToList();
    var isReversed = await db.JournalEntries.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.SourceType == "ManualReversal" && x.SourceId == entry.Id);
    return Results.Ok(new JournalEntryView(entry.Id, entry.Code, entry.EntryDate, entry.Description, entry.SourceType,
        entry.SourceId, entry.CreatedAt, lines.Sum(x => x.Debit), lines.Sum(x => x.Credit), lines, isReversed));
});
generalLedger.MapPost("/transfer", async (JournalTransferRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var sourceType = request.SourceType.Trim();
    if (sourceType is not ("SalesInvoice" or "PurchaseInvoice" or "PurchaseReceipt" or "SalesDelivery" or "SalesReturn" or "SupplierReturn" or "CustomerCollection" or "SupplierPayment" or "FxRevaluation" or "InventoryCostAdjustment")) return Results.ValidationProblem(new Dictionary<string, string[]> { ["sourceType"] = ["Desteklenen kaynak: satış/alış faturası, irsaliye, mal kabul, satış/tedarikçi iadesi, tahsilat, ödeme, kur değerleme veya stok maliyeti."] });
    await using var tx = await db.Database.BeginTransactionAsync();
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    if (await db.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == request.SourceId)) return Results.Conflict(new { error = "Bu kaynak daha önce deftere aktarılmıştır." });
    var map = await db.LedgerAccountMappings.Where(x => x.TenantId == tenantId).ToDictionaryAsync(x => x.MappingKey, x => x.AccountId);
    var activeAccounts = await db.LedgerAccounts.Where(x => x.TenantId == tenantId && x.IsActive).ToDictionaryAsync(x => x.Id);
    var lines = new List<(Guid AccountId, string Description, decimal Debit, decimal Credit)>();
    DateOnly entryDate; string sourceCode; string description;
    if (sourceType == "SalesReturn")
    {
        var source = await db.SalesReturns.Include(x => x.SalesInvoice).Include(x => x.Customer).Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != SalesReturnStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş satış iadesi deftere aktarılamaz." });
        var netRevenue = source.Subtotal - source.DiscountTotal;
        if (source.GrandTotal <= 0 || netRevenue < 0 || source.TaxTotal < 0 || netRevenue + source.TaxTotal != source.GrandTotal)
            return Results.Conflict(new { error = "Satış iadesi toplamları deftere aktarım için tutarlı değil." });
        var currencyCode = source.SalesInvoice.CurrencyCode;
        var baseCurrency = tenant.BaseCurrencyCode;
        var exchangeRate = currencyCode == baseCurrency ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= source.ReturnDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{source.ReturnDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; satış iadesi aktarılmadı." });
        decimal invoiceBase, taxBase;
        try
        {
            invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
            taxBase = decimal.Round(source.TaxTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
        }
        catch (OverflowException) { return Results.Conflict(new { error = "Satış iadesi baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        var revenueBase = invoiceBase - taxBase;
        if (invoiceBase <= 0 || revenueBase < 0 || invoiceBase > 9999999999999999.99m || taxBase > 9999999999999999.99m)
            return Results.Conflict(new { error = "Satış iadesi baz para birimi tutarları yevmiye sınırları dışında." });
        if (!map.TryGetValue(LedgerMappingKeys.SalesReceivable, out var receivableId)
            || !map.TryGetValue(LedgerMappingKeys.SalesRevenue, out var revenueId)
            || !activeAccounts.ContainsKey(receivableId) || !activeAccounts.ContainsKey(revenueId))
            return Results.Conflict(new { error = "Satış iadesinin alacak ve gelir hesap eşleştirmeleri tamamlanmamış." });
        if (receivableId == revenueId) return Results.Conflict(new { error = "Satış iadesi alacak ve gelir hesapları farklı olmalıdır." });
        if (source.TaxTotal > 0 && (!map.TryGetValue(LedgerMappingKeys.SalesTaxPayable, out var taxId) || !activeAccounts.ContainsKey(taxId)))
            return Results.Conflict(new { error = "Satış iadesinin hesaplanan KDV hesabı eşleştirilmemiş." });
        entryDate = source.ReturnDate; sourceCode = source.Code;
        description = currencyCode == baseCurrency ? $"Satış iadesi · {source.Code}" : $"Satış iadesi · {source.Code} · {currencyCode}/{baseCurrency} {exchangeRate}";
        if (source.TaxTotal > 0)
        {
            var taxAccountId = map[LedgerMappingKeys.SalesTaxPayable];
            if (taxAccountId == receivableId || taxAccountId == revenueId) return Results.Conflict(new { error = "İade alacak, gelir ve KDV hesapları birbirinden farklı olmalıdır." });
            if (taxBase > 0) lines.Add((taxAccountId, $"{source.Code} · KDV iade düzeltmesi", taxBase, 0));
        }
        if (revenueBase > 0) lines.Add((revenueId, $"{source.Code} · Satış iade düzeltmesi", revenueBase, 0));
        lines.Add((receivableId, $"{source.Code} · {source.Customer.Name}", 0, invoiceBase));
        var returnLineIds = source.Lines.Select(x => x.Id).ToArray();
        var movements = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SalesReturnLineId.HasValue
                && returnLineIds.Contains(x.SalesReturnLineId.Value) && x.ReversalOfId == null)
            .Select(x => new { x.Quantity, x.UnitCostBase }).ToListAsync();
        if (movements.Count != returnLineIds.Length || movements.Any(x => x.UnitCostBase is null))
            return Results.Conflict(new { error = "Satış iadesinin stok maliyet hareketleri eksik veya maliyetsiz; deftere aktarılmadı." });
        var stockCostBase = movements.Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
        if (stockCostBase > 9999999999999999.99m) return Results.Conflict(new { error = "Satış iadesi stok maliyeti yevmiye tutar sınırını aşıyor." });
        if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
            || !map.TryGetValue(LedgerMappingKeys.SalesCost, out var cogsId)
            || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(cogsId))
            return Results.Conflict(new { error = "Satış iadesinin stok ve maliyet karşı hesabı eşleştirilmemiş." });
        if (inventoryId == cogsId) return Results.Conflict(new { error = "İade stok ve maliyet karşı hesapları farklı olmalıdır." });
        if (stockCostBase > 0)
        {
            lines.Add((inventoryId, $"{source.Code} · İade stok maliyeti", stockCostBase, 0));
            lines.Add((cogsId, $"{source.Code} · Satılan mal maliyeti düzeltmesi", 0, stockCostBase));
        }
    }
    else if (sourceType == "SupplierReturn")
    {
        var source = await db.SupplierReturns.Include(x => x.PurchaseInvoice).Include(x => x.Supplier).Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != SupplierReturnStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş tedarikçi iadesi deftere aktarılamaz." });
        var netCost = source.Subtotal - source.DiscountTotal;
        if (source.GrandTotal <= 0 || netCost < 0 || source.TaxTotal < 0 || netCost + source.TaxTotal != source.GrandTotal)
            return Results.Conflict(new { error = "Tedarikçi iadesi toplamları deftere aktarım için tutarlı değil." });
        var currencyCode = source.PurchaseInvoice.CurrencyCode;
        var baseCurrency = tenant.BaseCurrencyCode;
        var exchangeRate = currencyCode == baseCurrency ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= source.ReturnDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{source.ReturnDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; tedarikçi iadesi aktarılmadı." });
        decimal invoiceBase, taxBase;
        try
        {
            invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
            taxBase = decimal.Round(source.TaxTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
        }
        catch (OverflowException) { return Results.Conflict(new { error = "Tedarikçi iadesi baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        var costBase = invoiceBase - taxBase;
        if (invoiceBase <= 0 || costBase < 0 || invoiceBase > 9999999999999999.99m || taxBase > 9999999999999999.99m)
            return Results.Conflict(new { error = "Tedarikçi iadesi baz para birimi tutarları yevmiye sınırları dışında." });
        if (!map.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payableId)
            || !map.TryGetValue(LedgerMappingKeys.PurchaseCost, out var costId)
            || !activeAccounts.ContainsKey(payableId) || !activeAccounts.ContainsKey(costId))
            return Results.Conflict(new { error = "Tedarikçi iadesinin borç ve maliyet hesap eşleştirmeleri tamamlanmamış." });
        if (payableId == costId) return Results.Conflict(new { error = "Tedarikçi iadesi borç ve maliyet hesapları farklı olmalıdır." });
        if (source.TaxTotal > 0 && (!map.TryGetValue(LedgerMappingKeys.PurchaseTaxRecoverable, out var taxId) || !activeAccounts.ContainsKey(taxId)))
            return Results.Conflict(new { error = "Tedarikçi iadesinin indirilecek KDV hesabı eşleştirilmemiş." });
        entryDate = source.ReturnDate; sourceCode = source.Code;
        description = currencyCode == baseCurrency ? $"Tedarikçi iadesi · {source.Code}" : $"Tedarikçi iadesi · {source.Code} · {currencyCode}/{baseCurrency} {exchangeRate}";
        lines.Add((payableId, $"{source.Code} · {source.Supplier.Name}", invoiceBase, 0));
        if (costBase > 0) lines.Add((costId, $"{source.Code} · Alış iade düzeltmesi", 0, costBase));
        if (source.TaxTotal > 0)
        {
            var taxAccountId = map[LedgerMappingKeys.PurchaseTaxRecoverable];
            if (taxAccountId == payableId || taxAccountId == costId) return Results.Conflict(new { error = "İade borç, maliyet ve KDV hesapları birbirinden farklı olmalıdır." });
            if (taxBase > 0) lines.Add((taxAccountId, $"{source.Code} · KDV iade düzeltmesi", 0, taxBase));
        }
        var returnLineIds = source.Lines.Select(x => x.Id).ToArray();
        var movements = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SupplierReturnLineId.HasValue
                && returnLineIds.Contains(x.SupplierReturnLineId.Value) && x.ReversalOfId == null)
            .Select(x => new { x.Quantity, x.UnitCostBase }).ToListAsync();
        if (movements.Count != returnLineIds.Length || movements.Any(x => x.UnitCostBase is null))
            return Results.Conflict(new { error = "Tedarikçi iadesinin stok maliyet hareketleri eksik veya maliyetsiz; deftere aktarılmadı." });
        var stockCostBase = movements.Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
        if (stockCostBase > 9999999999999999.99m) return Results.Conflict(new { error = "Tedarikçi iadesi stok maliyeti yevmiye tutar sınırını aşıyor." });
        if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
            || !map.TryGetValue(LedgerMappingKeys.PurchaseCost, out var cogsId)
            || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(cogsId))
            return Results.Conflict(new { error = "Tedarikçi iadesinin stok ve maliyet karşı hesabı eşleştirilmemiş." });
        if (inventoryId == cogsId) return Results.Conflict(new { error = "İade stok ve maliyet karşı hesapları farklı olmalıdır." });
        if (stockCostBase > 0)
        {
            lines.Add((cogsId, $"{source.Code} · Tedarikçi iade stok maliyeti", stockCostBase, 0));
            lines.Add((inventoryId, $"{source.Code} · Stok azalışı", 0, stockCostBase));
        }
    }
    else if (sourceType == "CustomerCollection")
    {
        var source = await db.CustomerCollections.Include(x => x.Customer).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != CustomerCollectionStatus.Posted)
            return Results.Conflict(new { error = "İptal edilmiş tahsilat deftere aktarılamaz." });
        var baseCurrency = tenant.BaseCurrencyCode;
        var exchangeRate = source.CurrencyCode == baseCurrency ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == source.CurrencyCode && x.RateDate <= source.CollectionDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{source.CollectionDate:yyyy-MM-dd} tarihli {source.CurrencyCode} kuru bulunamadı; tahsilat deftere aktarılmadı." });
        decimal amountBase;
        try { amountBase = decimal.Round(source.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero); }
        catch (OverflowException) { return Results.Conflict(new { error = "Tahsilat baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        if (amountBase <= 0 || amountBase > 9999999999999999.99m) return Results.Conflict(new { error = "Tahsilat baz para birimi tutarı yevmiye sınırları dışında." });
        var cashKey = source.FinancialAccountId is { } financialAccountId
            ? LedgerMappingKeys.FinancialAccountPrefix + financialAccountId
            : source.PaymentMethod == "Card" ? LedgerMappingKeys.CustomerCardClearing : LedgerMappingKeys.CustomerCheckClearing;
        if (!map.TryGetValue(cashKey, out var cashId) || !map.TryGetValue(LedgerMappingKeys.SalesReceivable, out var receivableId)
            || !activeAccounts.ContainsKey(cashId) || !activeAccounts.ContainsKey(receivableId))
            return Results.Conflict(new { error = "Tahsilatın kasa/banka ve müşteri alacak hesap eşleştirmeleri tamamlanmamış." });
        if (cashId == receivableId) return Results.Conflict(new { error = "Tahsilat karşı hesabı ve müşteri alacak hesabı farklı olmalıdır." });
        entryDate = source.CollectionDate; sourceCode = source.Code;
        description = source.CurrencyCode == baseCurrency ? $"Müşteri tahsilatı · {source.Code}" : $"Müşteri tahsilatı · {source.Code} · {source.CurrencyCode}/{baseCurrency} {exchangeRate}";
        lines.Add((cashId, $"{source.Code} · {source.Customer.Name}", amountBase, 0));
        lines.Add((receivableId, $"{source.Code} · {source.Customer.Name}", 0, amountBase));
    }
    else if (sourceType == "SupplierPayment")
    {
        var source = await db.SupplierPayments.Include(x => x.Supplier).Include(x => x.PurchaseInvoice)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != SupplierPaymentStatus.Posted)
            return Results.Conflict(new { error = "İptal edilmiş ödeme deftere aktarılamaz." });
        var currencyCode = source.PurchaseInvoice.CurrencyCode;
        var baseCurrency = tenant.BaseCurrencyCode;
        var exchangeRate = currencyCode == baseCurrency ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= source.PaymentDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{source.PaymentDate:yyyy-MM-dd} tarihli {currencyCode} kuru bulunamadı; ödeme deftere aktarılmadı." });
        decimal amountBase;
        try { amountBase = decimal.Round(source.Amount * exchangeRate, 2, MidpointRounding.AwayFromZero); }
        catch (OverflowException) { return Results.Conflict(new { error = "Tedarikçi ödemesi baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        if (amountBase <= 0 || amountBase > 9999999999999999.99m) return Results.Conflict(new { error = "Tedarikçi ödemesi baz para birimi tutarı yevmiye sınırları dışında." });
        var cashKey = source.FinancialAccountId is { } financialAccountId
            ? LedgerMappingKeys.FinancialAccountPrefix + financialAccountId
            : source.PaymentMethod == "Card" ? LedgerMappingKeys.SupplierCardClearing : LedgerMappingKeys.SupplierCheckClearing;
        if (!map.TryGetValue(cashKey, out var cashId) || !map.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payableId)
            || !activeAccounts.ContainsKey(cashId) || !activeAccounts.ContainsKey(payableId))
            return Results.Conflict(new { error = "Ödemenin kasa/banka ve tedarikçi borç hesap eşleştirmeleri tamamlanmamış." });
        if (cashId == payableId) return Results.Conflict(new { error = "Ödeme karşı hesabı ve tedarikçi borç hesabı farklı olmalıdır." });
        entryDate = source.PaymentDate; sourceCode = source.Code;
        description = currencyCode == baseCurrency ? $"Tedarikçi ödemesi · {source.Code}" : $"Tedarikçi ödemesi · {source.Code} · {currencyCode}/{baseCurrency} {exchangeRate}";
        lines.Add((payableId, $"{source.Code} · {source.Supplier.Name}", amountBase, 0));
        lines.Add((cashId, $"{source.Code} · {source.Supplier.Name}", 0, amountBase));
    }
    else if (sourceType == "PurchaseReceipt")
    {
        var source = await db.PurchaseReceipts.Include(x => x.PurchaseOrder).ThenInclude(x => x.Supplier)
            .Include(x => x.Lines).ThenInclude(x => x.InventoryTransactions)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş mal kabul deftere aktarılamaz." });
        var invoiceIds = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseReceiptId == source.Id)
            .Select(x => x.Id).ToListAsync();
        if (invoiceIds.Count > 0 && await db.JournalEntries.AnyAsync(x => x.TenantId == tenantId && x.SourceType == "PurchaseInvoice" && invoiceIds.Contains(x.SourceId)))
            return Results.Conflict(new { error = "Alış faturası zaten deftere aktarılmış. Önce faturayı ters kayıtla kapatıp yeniden aktarın." });
        var stockCostBase = source.Lines.SelectMany(x => x.InventoryTransactions).Where(x => x.UnitCostBase.HasValue)
            .Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
        if (source.Lines.Count == 0 || source.Lines.SelectMany(x => x.InventoryTransactions).Any(x => !x.UnitCostBase.HasValue) || stockCostBase <= 0)
            return Results.Conflict(new { error = "Mal kabul stok maliyetleri eksik veya sıfır; deftere aktarılmadı." });
        if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
            || !map.TryGetValue(LedgerMappingKeys.PurchaseReceiptAccrual, out var accrualId)
            || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(accrualId))
            return Results.Conflict(new { error = "Mal kabul stok ve faturası gelmemiş mal hesap eşleştirmeleri tamamlanmamış." });
        if (inventoryId == accrualId) return Results.Conflict(new { error = "Stok ve faturası gelmemiş mal hesapları farklı olmalıdır." });
        entryDate = source.ReceiptDate; sourceCode = source.Code;
        description = $"Mal kabul · {source.Code} · {source.PurchaseOrder.Supplier.Name}";
        lines.Add((inventoryId, $"{source.Code} · Stok girişi", stockCostBase, 0));
        lines.Add((accrualId, $"{source.Code} · Faturası gelmemiş mal", 0, stockCostBase));
    }
    else if (sourceType == "PurchaseInvoice")
    {
        var source = await db.PurchaseInvoices.Include(x => x.Lines).Include(x => x.Supplier).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş alış faturası deftere aktarılamaz." });
        var netCost = source.Subtotal - source.DiscountTotal;
        if (source.GrandTotal <= 0 || netCost < 0 || source.TaxTotal < 0 || netCost + source.TaxTotal != source.GrandTotal)
            return Results.Conflict(new { error = "Alış faturası toplamları deftere aktarım için tutarlı değil." });
        var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
        var exchangeRate = source.CurrencyCode == baseCurrency ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == source.CurrencyCode && x.RateDate <= source.InvoiceDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{source.InvoiceDate:yyyy-MM-dd} tarihli {source.CurrencyCode} kuru bulunamadı; alış faturası deftere aktarılmadı." });
        decimal invoiceBase, taxBase;
        try
        {
            invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
            taxBase = decimal.Round(source.TaxTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
        }
        catch (OverflowException) { return Results.Conflict(new { error = "Alış faturası baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        var costBase = invoiceBase - taxBase;
        if (invoiceBase <= 0 || taxBase < 0 || costBase < 0 || invoiceBase > 9999999999999999.99m
            || taxBase > 9999999999999999.99m || costBase > 9999999999999999.99m)
            return Results.Conflict(new { error = "Alış faturası baz para birimi tutarları yevmiye sınırları dışında." });
        var receiptEntry = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == "PurchaseReceipt" && x.SourceId == source.PurchaseReceiptId);
        var clearReceiptAccrual = receiptEntry is not null
            && await HasUnreversedJournalEntryAsync(db, tenantId, "PurchaseReceipt", source.PurchaseReceiptId);
        entryDate = source.InvoiceDate; sourceCode = source.Code;
        description = source.CurrencyCode == baseCurrency ? $"Alış faturası · {source.Code}" : $"Alış faturası · {source.Code} · {source.CurrencyCode}/{baseCurrency} {exchangeRate}";
        if (!map.TryGetValue(LedgerMappingKeys.PurchasePayable, out var payableId)
            || !map.TryGetValue(LedgerMappingKeys.PurchaseCost, out var costId)
            || !activeAccounts.ContainsKey(payableId) || !activeAccounts.ContainsKey(costId))
            return Results.Conflict(new { error = "Alış faturası borç ve maliyet hesap eşleştirmeleri tamamlanmamış." });
        if (payableId == costId) return Results.Conflict(new { error = "Alış borç ve maliyet hesapları farklı hesaplara eşlenmelidir." });
        lines.Add((payableId, $"{source.Code} · {source.Supplier.Name}", 0, invoiceBase));
        if (clearReceiptAccrual)
        {
            if (!map.TryGetValue(LedgerMappingKeys.PurchaseReceiptAccrual, out var accrualId) || !activeAccounts.ContainsKey(accrualId))
                return Results.Conflict(new { error = "Mal kabul aktarılmış; faturası gelmemiş mal hesabı eşleştirmesi tamamlanmamış." });
            if (accrualId == payableId || accrualId == costId)
                return Results.Conflict(new { error = "Faturası gelmemiş mal, borç ve maliyet hesapları birbirinden farklı olmalıdır." });
            var accruedBase = receiptEntry!.Lines.Where(x => x.AccountId == accrualId).Sum(x => x.Credit - x.Debit);
            if (accruedBase <= 0) return Results.Conflict(new { error = "Mal kabul yevmiyesinde kapatılabilir GRNI alacağı bulunamadı." });
            lines.Add((accrualId, $"{source.Code} · Mal kabul tahakkukunun kapatılması", accruedBase, 0));
            var variance = costBase - accruedBase;
            if (variance > 0) lines.Add((costId, $"{source.Code} · Alış maliyet farkı", variance, 0));
            else if (variance < 0) lines.Add((costId, $"{source.Code} · Alış maliyet farkı", 0, -variance));
        }
        else if (costBase > 0) lines.Add((costId, $"{source.Code} · Alış maliyeti", costBase, 0));
        if (source.TaxTotal > 0)
        {
            if (!map.TryGetValue(LedgerMappingKeys.PurchaseTaxRecoverable, out var taxId) || !activeAccounts.ContainsKey(taxId))
                return Results.Conflict(new { error = "Alış faturası indirilecek KDV hesabı eşleştirilmemiş." });
            if (taxId == payableId || taxId == costId || clearReceiptAccrual && taxId == map[LedgerMappingKeys.PurchaseReceiptAccrual])
                return Results.Conflict(new { error = "Borç, maliyet, GRNI ve indirilecek KDV hesapları birbirinden farklı olmalıdır." });
            if (taxBase > 0) lines.Add((taxId, $"{source.Code} · İndirilecek KDV", taxBase, 0));
        }
    }
    else if (sourceType == "SalesDelivery")
    {
        var source = await db.SalesDeliveries.Include(x => x.Order).ThenInclude(x => x.Customer)
            .Include(x => x.Lines).ThenInclude(x => x.InventoryTransactions)
            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != SalesDeliveryStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş irsaliye deftere aktarılamaz." });
        var movements = source.Lines.SelectMany(x => x.InventoryTransactions).Where(x => x.ReversalOfId == null).ToList();
        if (source.Lines.Count == 0 || movements.Count != source.Lines.Count || movements.Any(x => x.Direction != InventoryDirection.Issue || x.UnitCostBase is null))
            return Results.Conflict(new { error = "İrsaliye stok hareketleri eksik veya maliyet anlık görüntüsü bulunmuyor; deftere aktarılmadı." });
        var stockCostBase = movements.Sum(x => decimal.Round(x.Quantity * x.UnitCostBase!.Value, 2, MidpointRounding.AwayFromZero));
        if (stockCostBase <= 0 || stockCostBase > 9999999999999999.99m)
            return Results.Conflict(new { error = "İrsaliye stok maliyeti yevmiye tutar sınırları dışında." });
        if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var inventoryId)
            || !map.TryGetValue(LedgerMappingKeys.SalesCost, out var costId)
            || !activeAccounts.ContainsKey(inventoryId) || !activeAccounts.ContainsKey(costId))
            return Results.Conflict(new { error = "İrsaliye stok ve satılan mal maliyeti hesap eşleştirmeleri tamamlanmamış." });
        if (inventoryId == costId) return Results.Conflict(new { error = "İrsaliye stok ve satılan mal maliyeti hesapları farklı olmalıdır." });
        entryDate = source.DeliveryDate; sourceCode = source.Code;
        description = $"Satış irsaliyesi · {source.Code} · {source.Order.Customer.Name}";
        lines.Add((costId, $"{source.Code} · Satılan mal maliyeti", stockCostBase, 0));
        lines.Add((inventoryId, $"{source.Code} · Stok çıkışı", 0, stockCostBase));
    }
    else if (sourceType == "SalesInvoice")
    {
        var source = await db.SalesInvoices.Include(x => x.Lines).Include(x => x.Customer).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        if (source.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş satış faturası deftere aktarılamaz." });
        var netRevenue = source.Subtotal - source.DiscountTotal;
        if (source.GrandTotal <= 0 || netRevenue < 0 || source.TaxTotal < 0 || netRevenue + source.TaxTotal != source.GrandTotal)
            return Results.Conflict(new { error = "Satış faturası toplamları deftere aktarım için tutarlı değil." });
        var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
        var exchangeRate = source.CurrencyCode == baseCurrency ? 1m
            : await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == source.CurrencyCode && x.RateDate <= source.InvoiceDate)
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync() ?? 0m;
        if (exchangeRate <= 0) return Results.Conflict(new { error = $"{source.InvoiceDate:yyyy-MM-dd} tarihli {source.CurrencyCode} kuru bulunamadı; satış faturası deftere aktarılmadı." });
        decimal invoiceBase, taxBase;
        try
        {
            invoiceBase = decimal.Round(source.GrandTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
            taxBase = decimal.Round(source.TaxTotal * exchangeRate, 2, MidpointRounding.AwayFromZero);
        }
        catch (OverflowException) { return Results.Conflict(new { error = "Satış faturası baz para birimine çevrildiğinde yevmiye tutar sınırını aşıyor." }); }
        var revenueBase = invoiceBase - taxBase;
        if (invoiceBase <= 0 || taxBase < 0 || revenueBase < 0 || invoiceBase > 9999999999999999.99m
            || taxBase > 9999999999999999.99m || revenueBase > 9999999999999999.99m)
            return Results.Conflict(new { error = "Satış faturası baz para birimi tutarları yevmiye sınırları dışında." });
        entryDate = source.InvoiceDate; sourceCode = source.Code;
        description = source.CurrencyCode == baseCurrency ? $"Satış faturası · {source.Code}" : $"Satış faturası · {source.Code} · {source.CurrencyCode}/{baseCurrency} {exchangeRate}";
        if (!map.TryGetValue(LedgerMappingKeys.SalesReceivable, out var receivableId)
            || !map.TryGetValue(LedgerMappingKeys.SalesRevenue, out var revenueId)
            || !activeAccounts.ContainsKey(receivableId) || !activeAccounts.ContainsKey(revenueId))
            return Results.Conflict(new { error = "Satış faturası alacak ve gelir hesap eşleştirmeleri tamamlanmamış." });
        if (receivableId == revenueId) return Results.Conflict(new { error = "Satış alacak ve gelir hesapları farklı hesaplara eşlenmelidir." });
        lines.Add((receivableId, $"{source.Code} · {source.Customer.Name}", invoiceBase, 0));
        if (revenueBase > 0) lines.Add((revenueId, $"{source.Code} · Satış geliri", 0, revenueBase));
        if (source.TaxTotal > 0)
        {
            if (!map.TryGetValue(LedgerMappingKeys.SalesTaxPayable, out var taxId) || !activeAccounts.ContainsKey(taxId))
                return Results.Conflict(new { error = "Satış faturası hesaplanan KDV hesabı eşleştirilmemiş." });
            if (taxId == receivableId || taxId == revenueId) return Results.Conflict(new { error = "Alacak, gelir ve hesaplanan KDV hesapları birbirinden farklı olmalıdır." });
            if (taxBase > 0) lines.Add((taxId, $"{source.Code} · Hesaplanan KDV", 0, taxBase));
        }
    }
    else if (sourceType == "FxRevaluation")
    {
        var source = await db.FxRevaluationVouchers.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        entryDate = source.AsOfDate; sourceCode = source.Code; description = $"Kur değerleme · {source.Code}";
        foreach (var line in source.Lines.Where(x => x.AdjustmentBase != 0))
        {
            var controlKey = line.Direction == FxRevaluationDirection.Receivable ? LedgerMappingKeys.FxReceivable : LedgerMappingKeys.FxPayable;
            var debitKey = line.AdjustmentBase > 0 ? controlKey : LedgerMappingKeys.FxLoss;
            var creditKey = line.AdjustmentBase > 0 ? LedgerMappingKeys.FxGain : controlKey;
            if (!map.TryGetValue(debitKey, out var debitId) || !map.TryGetValue(creditKey, out var creditId) || !activeAccounts.ContainsKey(debitId) || !activeAccounts.ContainsKey(creditId))
                return Results.Conflict(new { error = "Kur değerlemenin kullandığı hesap eşleştirmeleri tamamlanmamış. Genel muhasebe ayarlarını tamamlayın; kaynak fiş değişmedi." });
            if (debitId == creditId) return Results.Conflict(new { error = "Borç ve alacak tarafı aynı hesaba eşlenmiş. Eşleştirmeleri ayrı tenant hesaplarına yönlendirin." });
            var amount = Math.Abs(line.AdjustmentBase);
            lines.Add((debitId, $"{line.InvoiceCode} · {line.CounterpartyName}", amount, 0));
            lines.Add((creditId, $"{line.InvoiceCode} · {line.CounterpartyName}", 0, amount));
        }
    }
    else
    {
        var source = await db.InventoryCostAdjustments.Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SourceId);
        if (source is null) return Results.NotFound();
        entryDate = source.EntryDate; sourceCode = source.Code; description = $"Stok maliyet hareketi · {source.Code} · {source.Description}";
        var offsetKey = source.Kind switch { InventoryCostAdjustmentKind.LandedCost => LedgerMappingKeys.InventoryLandedCostOffset, InventoryCostAdjustmentKind.Reversal => LedgerMappingKeys.InventoryReversalOffset, _ => LedgerMappingKeys.InventoryRevaluationOffset };
        if (!map.TryGetValue(LedgerMappingKeys.InventoryAsset, out var stockId) || !map.TryGetValue(offsetKey, out var offsetId) || !activeAccounts.ContainsKey(stockId) || !activeAccounts.ContainsKey(offsetId))
            return Results.Conflict(new { error = "Stok hareketinin kullandığı hesap eşleştirmeleri tamamlanmamış. Genel muhasebe ayarlarını tamamlayın; kaynak hareket değişmedi." });
        if (stockId == offsetId) return Results.Conflict(new { error = "Stok ve karşı hesap aynı hesaba eşlenmiş. Eşleştirmeleri ayrı tenant hesaplarına yönlendirin." });
        var stockInfo = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && source.Lines.Select(l => l.StockItemId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Code);
        foreach (var line in source.Lines.Where(x => x.AmountBase != 0))
        {
            var amount = Math.Abs(line.AmountBase); var stockCode = stockInfo.GetValueOrDefault(line.StockItemId, "Stok");
            if (line.AmountBase > 0) { lines.Add((stockId, $"{source.Code} · {stockCode}", amount, 0)); lines.Add((offsetId, $"{source.Code} · {stockCode}", 0, amount)); }
            else { lines.Add((offsetId, $"{source.Code} · {stockCode}", amount, 0)); lines.Add((stockId, $"{source.Code} · {stockCode}", 0, amount)); }
        }
    }
    var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, entryDate);
    if (closedPeriod is { } closed)
        return Results.Conflict(new { error = $"{closed.FromDate:yyyy-MM-dd}–{closed.ToDate:yyyy-MM-dd} dönemi kapalı; kaynak fiş bu tarihe aktarılamaz." });
    if (lines.Count < 2 || lines.Sum(x => x.Debit) <= 0 || lines.Sum(x => x.Debit) != lines.Sum(x => x.Credit)) return Results.Conflict(new { error = "Kaynak fişte aktarılabilir dengeli bir tutar bulunamadı." });
    var entry = new JournalEntry { TenantId = tenantId, Code = $"YV-{Guid.NewGuid():N}", EntryDate = entryDate,
        Description = description.Length > 240 ? description[..240] : description, SourceType = sourceType, SourceId = request.SourceId, CreatedByUserId = GetUserId(principal) };
    for (var i = 0; i < lines.Count; i++) entry.Lines.Add(new JournalEntryLine { TenantId = tenantId, JournalEntryId = entry.Id, AccountId = lines[i].AccountId,
        LineNumber = i + 1, Description = lines[i].Description.Length > 240 ? lines[i].Description[..240] : lines[i].Description, Debit = lines[i].Debit, Credit = lines[i].Credit });
    db.JournalEntries.Add(entry);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.general-ledger.transferred", Resource = $"{sourceType}:{sourceCode}:{entry.Code}" });
    await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Created($"/api/finance/general-ledger/entries/{entry.Id}", new { entry.Id, entry.Code, entry.EntryDate, entry.Description, entry.SourceType, entry.SourceId, TotalDebit = entry.Lines.Sum(x => x.Debit), TotalCredit = entry.Lines.Sum(x => x.Credit) });
});
app.MapGet("/api/finance/maturities", async (DateOnly? asOfDate, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var asOf = asOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
    var sales = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal, PaymentTermDays = x.Customer.PaymentTermDays })
        .ToListAsync();
    var collected = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.CustomerCollection.Status == CustomerCollectionStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var salesReturns = await db.SalesReturns.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);

    var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, CounterpartyName = x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.GrandTotal })
        .ToListAsync();
    var paid = await db.SupplierPayments.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchaseReturns = await db.SupplierReturns.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);

    var rows = sales.Select(x =>
    {
        var dueDate = x.InvoiceDate.AddDays(x.PaymentTermDays);
        var outstanding = Math.Max(0m, x.GrandTotal - collected.GetValueOrDefault(x.Id) - salesReturns.GetValueOrDefault(x.Id));
        return new { direction = "Receivable", invoiceId = x.Id, invoiceCode = x.Code, counterpartyName = x.Name,
            invoiceDate = x.InvoiceDate, dueDate, currencyCode = x.CurrencyCode, originalAmount = x.GrandTotal,
            outstandingAmount = outstanding, daysOverdue = Math.Max(0, asOf.DayNumber - dueDate.DayNumber) };
    }).Where(x => x.outstandingAmount > 0)
      .Concat(purchases.Select(x =>
      {
          var outstanding = Math.Max(0m, x.GrandTotal - paid.GetValueOrDefault(x.Id) - purchaseReturns.GetValueOrDefault(x.Id));
          return new { direction = "Payable", invoiceId = x.Id, invoiceCode = x.Code, counterpartyName = x.CounterpartyName,
              invoiceDate = x.InvoiceDate, dueDate = x.DueDate, currencyCode = x.CurrencyCode, originalAmount = x.GrandTotal,
              outstandingAmount = outstanding, daysOverdue = Math.Max(0, asOf.DayNumber - x.DueDate.DayNumber) };
      }).Where(x => x.outstandingAmount > 0))
      .OrderByDescending(x => x.daysOverdue).ThenBy(x => x.dueDate).ThenBy(x => x.counterpartyName).ToList();
    var summaries = rows.GroupBy(x => new { x.direction, x.currencyCode }).Select(g => new
    {
        g.Key.direction, g.Key.currencyCode, invoiceCount = g.Count(), outstandingAmount = g.Sum(x => x.outstandingAmount),
        notDue = g.Where(x => x.daysOverdue == 0).Sum(x => x.outstandingAmount),
        days1To30 = g.Where(x => x.daysOverdue is >= 1 and <= 30).Sum(x => x.outstandingAmount),
        days31To60 = g.Where(x => x.daysOverdue is >= 31 and <= 60).Sum(x => x.outstandingAmount),
        days61To90 = g.Where(x => x.daysOverdue is >= 61 and <= 90).Sum(x => x.outstandingAmount),
        over90Days = g.Where(x => x.daysOverdue > 90).Sum(x => x.outstandingAmount)
    }).OrderBy(x => x.direction).ThenBy(x => x.currencyCode).ToList();
    return Results.Ok(new { asOfDate = asOf, summaries, items = rows });
});
financeAccounts.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var accounts = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderBy(x => x.Type).ThenBy(x => x.Code)
        .Select(x => new FinancialAccountSummary(x.Id, x.Code, x.Name, x.Type, x.CurrencyCode, x.IsActive,
            x.Transactions.Sum(t => (decimal?)(t.Direction == FinancialDirection.Inflow ? t.Amount : -t.Amount)) ?? 0m,
            x.Transactions.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(accounts);
});
financeAccounts.MapPost("/", async (FinancialAccountWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = FinancialAccountValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.FinancialAccounts.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu hesap kodu bu firma için zaten kullanılıyor." });
    var account = new FinancialAccount { TenantId = tenantId, Code = code, Name = request.Name.Trim(), Type = request.Type,
        CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant() };
    db.FinancialAccounts.Add(account);
    if (request.OpeningBalance != 0)
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
            CurrencyCode = account.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = request.OpeningBalance > 0 ? FinancialDirection.Inflow : FinancialDirection.Outflow,
            CashFlowCategory = CashFlowCategory.OpeningBalance, Amount = Math.Abs(request.OpeningBalance), Description = "Açılış bakiyesi" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu hesap kodu bu firma için zaten kullanılıyor." }); }
    return Results.Created($"/api/finance/accounts/{account.Id}", new FinancialAccountSummary(account.Id, account.Code,
        account.Name, account.Type, account.CurrencyCode, account.IsActive, request.OpeningBalance,
        request.OpeningBalance == 0 ? 0 : 1, account.CreatedAt));
});
financeAccounts.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var account = await db.FinancialAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (account is null) return Results.NotFound();
    var rows = await db.FinancialAccountTransactions.AsNoTracking().Include(x => x.CustomerCollection).Include(x => x.SupplierPayment).Include(x => x.Transfer)
        .Where(x => x.TenantId == tenantId && x.FinancialAccountId == id).OrderByDescending(x => x.TransactionDate).ThenByDescending(x => x.CreatedAt).ToListAsync();
    var transactionIds = rows.Select(x => x.Id).ToArray();
    var creditMovementTransactionIds = await db.CreditFacilityMovements.AsNoTracking().Where(x => x.TenantId == tenantId && transactionIds.Contains(x.FinancialAccountTransactionId))
        .Select(x => x.FinancialAccountTransactionId).ToListAsync();
    var transactions = rows.Select(x => new FinancialAccountTransactionView(x.Id, x.TransactionDate, x.Direction, x.Amount,
        x.CurrencyCode, x.Description, x.Reference, x.ReversalOfId is not null ? "Ters kayıt" : x.CustomerCollectionId is not null ? "Tahsilat" : x.SupplierPaymentId is not null ? "Tedarikçi ödemesi" : x.TransferId is not null ? "Hesap transferi" : creditMovementTransactionIds.Contains(x.Id) ? "Kredi / finansman" : x.RequestId is not null ? "Manuel hareket" : x.Description == "Açılış bakiyesi" ? "Açılış bakiyesi" : null,
        x.CustomerCollection?.Code ?? x.SupplierPayment?.Code ?? x.Transfer?.Code, x.ReversalOfId, x.CreatedAt, x.TransferId, x.CashFlowCategory)).ToList();
    var balance = rows.Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount);
    return Results.Ok(new FinancialAccountDetail(account.Id, account.Code, account.Name, account.Type, account.CurrencyCode,
        account.IsActive, balance, account.CreatedAt, transactions));
});
financeAccounts.MapPost("/{id:guid}/transactions/{transactionId:guid}/cash-flow-category", async (Guid id, Guid transactionId,
    CashFlowCategoryUpdateRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!Enum.IsDefined(request.CashFlowCategory) || request.CashFlowCategory is CashFlowCategory.InternalTransfer or CashFlowCategory.OpeningBalance)
        return Results.BadRequest(new { error = "Hareket için İşletme, Yatırım, Finansman veya Sınıflandırılmamış seçin." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var movement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [FinancialAccountId] = {id} AND [Id] = {transactionId}").SingleOrDefaultAsync();
    if (movement is null) return Results.NotFound();
    if (movement.TransferId is not null || movement.CashFlowCategory is CashFlowCategory.InternalTransfer or CashFlowCategory.OpeningBalance)
        return Results.Conflict(new { error = "İç transfer ve açılış bakiyesi sınıflandırması değiştirilemez." });
    movement.CashFlowCategory = request.CashFlowCategory;
    var reversal = await db.FinancialAccountTransactions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ReversalOfId == movement.Id);
    if (reversal is not null) reversal.CashFlowCategory = request.CashFlowCategory;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.cash-flow-classified", Resource = $"{movement.Id:N}:{request.CashFlowCategory}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { movement.Id, movement.CashFlowCategory, reversalUpdated = reversal is not null });
});
financeAccounts.MapPost("/{id:guid}/movements", async (Guid id, FinancialAccountMovementWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = FinancialMovementValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var description = request.Description.Trim();
    var reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim();
    var prior = await db.FinancialAccountTransactions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        if (prior.FinancialAccountId != id || prior.TransactionDate != request.TransactionDate || prior.Direction != request.Direction || prior.Amount != request.Amount || prior.Description != description || prior.Reference != reference || prior.CashFlowCategory != request.CashFlowCategory)
            return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir finans hareketinde kullanıldı." });
        return Results.Ok(new FinancialAccountTransactionView(prior.Id, prior.TransactionDate, prior.Direction, prior.Amount,
            prior.CurrencyCode, prior.Description, prior.Reference, "Manuel hareket", null, prior.ReversalOfId, prior.CreatedAt, null, prior.CashFlowCategory));
    }
    await using var transaction = await db.Database.BeginTransactionAsync();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    if (!account.IsActive) return Results.Conflict(new { error = "Pasif hesaba hareket kaydedilemez." });
    if (request.Direction == FinancialDirection.Outflow && account.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < request.Amount) return Results.Conflict(new { error = "Kasa bakiyesi manuel çıkış için yetersiz." });
    }
    var movement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account, CurrencyCode = account.CurrencyCode,
        TransactionDate = request.TransactionDate, Direction = request.Direction, CashFlowCategory = request.CashFlowCategory, Amount = request.Amount, Description = description,
        Reference = reference, RequestId = request.RequestId };
    db.FinancialAccountTransactions.Add(movement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.movement-posted", Resource = account.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı başka bir işlemde kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/accounts/{id}/transactions/{movement.Id}", new FinancialAccountTransactionView(movement.Id,
        movement.TransactionDate, movement.Direction, movement.Amount, movement.CurrencyCode, movement.Description, movement.Reference,
        "Manuel hareket", null, null, movement.CreatedAt, null, movement.CashFlowCategory));
});
financeAccounts.MapPost("/{id:guid}/transactions/{transactionId:guid}/void", async (Guid id, Guid transactionId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    var original = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {transactionId} AND [FinancialAccountId] = {id}").SingleOrDefaultAsync();
    if (original is null) return Results.NotFound();
    if (original.RequestId is null || original.TransferId is not null || original.CustomerCollectionId is not null || original.SupplierPaymentId is not null)
        return Results.Conflict(new { error = "Yalnızca manuel finans hareketleri bu işlemle iptal edilebilir." });
    if (await db.CreditFacilityMovements.AnyAsync(x => x.TenantId == tenantId && x.FinancialAccountTransactionId == original.Id))
        return Results.Conflict(new { error = "Kredi kullandırım ve ödemeleri genel hesap hareketleri ekranından iptal edilemez." });
    if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id))
        return Results.Conflict(new { error = "Finans hareketi daha önce iptal edilmiş." });
    var reverseDirection = original.Direction == FinancialDirection.Inflow ? FinancialDirection.Outflow : FinancialDirection.Inflow;
    if (reverseDirection == FinancialDirection.Outflow && account.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < original.Amount) return Results.Conflict(new { error = "Kasa bakiyesi bu hareketi ters kayıtla iptal etmek için yetersiz." });
    }
    db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
        CurrencyCode = account.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = reverseDirection,
        CashFlowCategory = original.CashFlowCategory, Amount = original.Amount, Description = $"Finans hareketi iptali {original.Id:N}", Reference = original.Reference, ReversalOfId = original.Id });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.movement-voided", Resource = account.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { original.Id, status = "Voided" });
});
financeAccounts.MapPost("/{id:guid}/status", async (Guid id, bool isActive, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    if (account.IsActive == isActive) return Results.Ok(new { account.Id, account.IsActive });
    account.IsActive = isActive;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = isActive ? "financial-account.activated" : "financial-account.deactivated", Resource = account.Code });
    await db.SaveChangesAsync();
    return Results.Ok(new { account.Id, account.IsActive });
});

var financialTransfers = app.MapGroup("/api/finance/transfers").RequireAuthorization();
financialTransfers.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var rows = await db.FinancialAccountTransfers.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.TransferDate).ThenByDescending(x => x.CreatedAt).Take(200).ToListAsync();
    var accountIds = rows.SelectMany(x => new[] { x.FromAccountId, x.ToAccountId }).Distinct().ToArray();
    var names = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && accountIds.Contains(x.Id))
        .ToDictionaryAsync(x => x.Id, x => x.Name);
    return Results.Ok(rows.Select(x => new FinancialAccountTransferSummary(x.Id, x.Code, x.FromAccountId, names[x.FromAccountId],
        x.ToAccountId, names[x.ToAccountId], x.CurrencyCode, x.TransferDate, x.Amount, x.Reference, x.Description, x.Status, x.CreatedAt,
        x.ToCurrencyCode, x.DestinationAmount, x.ExchangeRate)));
});
financialTransfers.MapPost("/", async (FinancialAccountTransferWriteRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = FinancialMovementValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var description = request.Description.Trim();
    var reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim();
    var prior = await db.FinancialAccountTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        if (prior.FromAccountId != request.FromAccountId || prior.ToAccountId != request.ToAccountId || prior.TransferDate != request.TransferDate || prior.Amount != request.Amount || prior.ExchangeRate != request.ExchangeRate || prior.Description != description || prior.Reference != reference)
            return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir hesap transferinde kullanıldı." });
        var priorNames = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && (x.Id == prior.FromAccountId || x.Id == prior.ToAccountId)).ToDictionaryAsync(x => x.Id, x => x.Name);
        return Results.Ok(new FinancialAccountTransferSummary(prior.Id, prior.Code, prior.FromAccountId, priorNames[prior.FromAccountId],
            prior.ToAccountId, priorNames[prior.ToAccountId], prior.CurrencyCode, prior.TransferDate, prior.Amount, prior.Reference, prior.Description,
            prior.Status, prior.CreatedAt, prior.ToCurrencyCode, prior.DestinationAmount, prior.ExchangeRate));
    }
    await using var transaction = await db.Database.BeginTransactionAsync();
    FinancialAccount? fromAccount = null;
    FinancialAccount? toAccount = null;
    foreach (var accountId in new[] { request.FromAccountId, request.ToAccountId }.OrderBy(x => x))
    {
        var locked = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (accountId == request.FromAccountId) fromAccount = locked; else toAccount = locked;
    }
    if (fromAccount is null || toAccount is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["accountId"] = ["Kaynak veya hedef hesap bulunamadı."] });
    if (!fromAccount.IsActive || !toAccount.IsActive) return Results.Conflict(new { error = "Transfer için her iki hesap da aktif olmalıdır." });
    if (fromAccount.CurrencyCode == toAccount.CurrencyCode && request.ExchangeRate != 1m)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["exchangeRate"] = ["Aynı dövizli hesaplar arasında kur 1 olmalıdır."] });
    decimal destinationAmount;
    try { destinationAmount = decimal.Round(request.Amount * request.ExchangeRate, 2, MidpointRounding.AwayFromZero); }
    catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["exchangeRate"] = ["Hedef tutar decimal(18,2) sınırını aşıyor."] }); }
    if (destinationAmount <= 0 || destinationAmount > 9999999999999999.99m)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["exchangeRate"] = ["Kur sonucu oluşan hedef tutar sıfırdan büyük olmalı ve decimal(18,2) sınırını aşmamalıdır."] });
    if (fromAccount.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == fromAccount.Id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < request.Amount) return Results.Conflict(new { error = "Kaynak kasa bakiyesi transfer için yetersiz." });
    }
    var transfer = new FinancialAccountTransfer { TenantId = tenantId, RequestId = request.RequestId,
        Code = $"TR-{Guid.NewGuid():N}".ToUpperInvariant(), FromAccountId = fromAccount.Id, ToAccountId = toAccount.Id,
        CurrencyCode = fromAccount.CurrencyCode, ToCurrencyCode = toAccount.CurrencyCode, TransferDate = request.TransferDate,
        Amount = request.Amount, DestinationAmount = destinationAmount, ExchangeRate = request.ExchangeRate,
        Reference = reference, Description = description };
    db.FinancialAccountTransfers.Add(transfer);
    db.FinancialAccountTransactions.AddRange(
        new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = fromAccount, CurrencyCode = transfer.CurrencyCode,
            TransactionDate = transfer.TransferDate, Direction = FinancialDirection.Outflow, Amount = transfer.Amount,
            CashFlowCategory = CashFlowCategory.InternalTransfer, Description = transfer.Description, Reference = transfer.Reference, Transfer = transfer },
        new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = toAccount, CurrencyCode = transfer.ToCurrencyCode,
            TransactionDate = transfer.TransferDate, Direction = FinancialDirection.Inflow, Amount = transfer.DestinationAmount,
            CashFlowCategory = CashFlowCategory.InternalTransfer, Description = transfer.Description, Reference = transfer.Reference, Transfer = transfer });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-transfer.posted", Resource = transfer.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Transfer tekrar gönderim anahtarı başka bir istekte kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/transfers/{transfer.Id}", new FinancialAccountTransferSummary(transfer.Id, transfer.Code,
        fromAccount.Id, fromAccount.Name, toAccount.Id, toAccount.Name, transfer.CurrencyCode, transfer.TransferDate,
        transfer.Amount, transfer.Reference, transfer.Description, transfer.Status, transfer.CreatedAt,
        transfer.ToCurrencyCode, transfer.DestinationAmount, transfer.ExchangeRate));
});
financialTransfers.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var transfer = await db.FinancialAccountTransfers.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransfers] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (transfer is null) return Results.NotFound();
    if (transfer.Status != FinancialTransferStatus.Posted) return Results.Conflict(new { error = "Transfer daha önce iptal edilmiş." });
    var accounts = new Dictionary<Guid, FinancialAccount>();
    foreach (var accountId in new[] { transfer.FromAccountId, transfer.ToAccountId }.OrderBy(x => x))
    {
        var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (account is null) return Results.Conflict(new { error = "Transfer hesabı bulunamadı; iptal işlemi yapılamadı." });
        accounts[accountId] = account;
    }
    var originals = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [TransferId] = {transfer.Id}").ToListAsync();
    if (originals.Count != 2 || !originals.Any(x => x.FinancialAccountId == transfer.FromAccountId && x.CurrencyCode == transfer.CurrencyCode && x.Direction == FinancialDirection.Outflow && x.Amount == transfer.Amount)
        || !originals.Any(x => x.FinancialAccountId == transfer.ToAccountId && x.CurrencyCode == transfer.ToCurrencyCode && x.Direction == FinancialDirection.Inflow && x.Amount == transfer.DestinationAmount))
        return Results.Conflict(new { error = "Transfer finans hareketleri tutarsız; iptal işlemi durduruldu." });
    if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && originals.Select(m => m.Id).Contains(x.ReversalOfId ?? Guid.Empty)))
        return Results.Conflict(new { error = "Transfer hareketlerinden biri daha önce ters kayıtla iptal edilmiş." });
    var destination = accounts[transfer.ToAccountId];
    if (destination.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == destination.Id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < transfer.DestinationAmount) return Results.Conflict(new { error = "Hedef kasa bakiyesi transferi ters kayıtla iptal etmek için yetersiz." });
    }
    foreach (var movement in originals)
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = accounts[movement.FinancialAccountId],
            CurrencyCode = movement.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = movement.Direction == FinancialDirection.Inflow ? FinancialDirection.Outflow : FinancialDirection.Inflow,
            CashFlowCategory = movement.CashFlowCategory, Amount = movement.Amount, Description = $"Transfer iptali {transfer.Code}", Reference = transfer.Reference, ReversalOfId = movement.Id });
    transfer.Status = FinancialTransferStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-transfer.voided", Resource = transfer.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { transfer.Id, transfer.Code, transfer.Status });
});

var bankStatements = app.MapGroup("/api/finance/statements").RequireAuthorization();
bankStatements.MapGet("/", async (ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var statements = await db.BankStatements.AsNoTracking().Include(x => x.Account).Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.EndDate).ThenByDescending(x => x.CreatedAt).Take(200)
        .Select(x => new BankStatementSummary(x.Id, x.Code, x.AccountId, x.Account.Name, x.CurrencyCode, x.StartDate, x.EndDate,
            x.OpeningBalance, x.ClosingBalance, x.Lines.Count, x.Lines.Count(l => l.FinancialAccountTransactionId != null), x.Status, x.CreatedAt)).ToListAsync();
    return Results.Ok(statements);
});
bankStatements.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var statement = await db.BankStatements.AsNoTracking().Include(x => x.Account).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (statement is null) return Results.NotFound();
    var lines = statement.Lines.OrderBy(x => x.LineNumber).Select(x => new BankStatementLineView(x.Id, x.LineNumber, x.ExternalId,
        x.TransactionDate, x.Direction, x.Amount, x.Description, x.Reference, x.FinancialAccountTransactionId, x.IsBookEntryCreated, x.MatchedAt)).ToList();
    return Results.Ok(new BankStatementDetail(statement.Id, statement.Code, statement.AccountId, statement.Account.Name,
        statement.CurrencyCode, statement.StartDate, statement.EndDate, statement.OpeningBalance, statement.ClosingBalance,
        statement.Status, statement.CreatedAt, lines));
});
bankStatements.MapGet("/{id:guid}/unmatched-book-movements", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var statement = await db.BankStatements.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (statement is null) return Results.NotFound();
    var movements = await db.FinancialAccountTransactions.AsNoTracking().Include(x => x.CustomerCollection).Include(x => x.SupplierPayment).Include(x => x.Transfer)
        .Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate >= statement.StartDate && x.TransactionDate <= statement.EndDate && !db.BankStatementLines.Any(line => line.TenantId == tenantId && line.FinancialAccountTransactionId == x.Id))
        .OrderBy(x => x.TransactionDate).ThenBy(x => x.CreatedAt).Select(x => new BankStatementUnmatchedMovementView(x.Id, x.TransactionDate,
            x.Direction, x.Amount, x.CurrencyCode, x.Description, x.Reference,
            x.CustomerCollectionId != null ? "Tahsilat" : x.SupplierPaymentId != null ? "Tedarikçi ödemesi" : x.TransferId != null ? "Hesap transferi" : x.RequestId != null ? "Manuel hareket" : null,
            x.CustomerCollection!.Code ?? x.SupplierPayment!.Code ?? x.Transfer!.Code)).ToListAsync();
    return Results.Ok(movements);
});
financeAccounts.MapPost("/{id:guid}/statements", async (Guid id, BankStatementImportRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = BankStatementValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var prior = await db.BankStatements.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        var sameLines = prior.AccountId == id && prior.StartDate == request.StartDate && prior.EndDate == request.EndDate && prior.OpeningBalance == request.OpeningBalance && prior.ClosingBalance == request.ClosingBalance && prior.Lines.Count == request.Lines.Count;
        if (sameLines)
        {
            var oldLines = prior.Lines.OrderBy(x => x.LineNumber).ToArray();
            for (var i = 0; i < oldLines.Length; i++)
            {
                var input = request.Lines[i];
                if (oldLines[i].TransactionDate != input.TransactionDate || oldLines[i].Direction != (input.SignedAmount > 0 ? FinancialDirection.Inflow : FinancialDirection.Outflow) || oldLines[i].Amount != Math.Abs(input.SignedAmount) || oldLines[i].Description != input.Description.Trim() || oldLines[i].Reference != (string.IsNullOrWhiteSpace(input.Reference) ? null : input.Reference.Trim()) || oldLines[i].ExternalId != (string.IsNullOrWhiteSpace(input.ExternalId) ? null : input.ExternalId.Trim())) { sameLines = false; break; }
            }
        }
        if (!sameLines) return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir ekstre içe aktarımında kullanıldı." });
        var oldAccountName = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => x.Name).SingleAsync();
        return Results.Ok(new BankStatementSummary(prior.Id, prior.Code, prior.AccountId, oldAccountName, prior.CurrencyCode,
            prior.StartDate, prior.EndDate, prior.OpeningBalance, prior.ClosingBalance, prior.Lines.Count,
            prior.Lines.Count(x => x.FinancialAccountTransactionId != null), prior.Status, prior.CreatedAt));
    }
    await using var transaction = await db.Database.BeginTransactionAsync();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    if (account.Type != FinancialAccountType.Bank) return Results.Conflict(new { error = "Banka ekstresi yalnızca banka hesabına aktarılabilir." });
    if (!account.IsActive) return Results.Conflict(new { error = "Pasif banka hesabına ekstre aktarılamaz." });
    var overlapping = await db.BankStatements.AnyAsync(x => x.TenantId == tenantId && x.AccountId == account.Id && x.StartDate <= request.EndDate && x.EndDate >= request.StartDate);
    if (overlapping) return Results.Conflict(new { error = "Bu dönemle çakışan bir banka ekstresi zaten aktarılmış." });
    var statement = new BankStatement { TenantId = tenantId, Account = account, CurrencyCode = account.CurrencyCode,
        RequestId = request.RequestId, Code = $"BS-{Guid.NewGuid():N}".ToUpperInvariant(), StartDate = request.StartDate,
        EndDate = request.EndDate, OpeningBalance = request.OpeningBalance, ClosingBalance = request.ClosingBalance };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i];
        statement.Lines.Add(new BankStatementLine { TenantId = tenantId, Statement = statement, FinancialAccountId = account.Id,
            CurrencyCode = account.CurrencyCode, LineNumber = i + 1, ExternalId = string.IsNullOrWhiteSpace(input.ExternalId) ? null : input.ExternalId.Trim(),
            TransactionDate = input.TransactionDate, Direction = input.SignedAmount > 0 ? FinancialDirection.Inflow : FinancialDirection.Outflow,
            Amount = Math.Abs(input.SignedAmount), Description = input.Description.Trim(), Reference = string.IsNullOrWhiteSpace(input.Reference) ? null : input.Reference.Trim() });
    }
    db.BankStatements.Add(statement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.imported", Resource = statement.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Ekstre dönem veya satır kimlikleri başka bir kayıtta kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/statements/{statement.Id}", new BankStatementSummary(statement.Id, statement.Code,
        account.Id, account.Name, account.CurrencyCode, statement.StartDate, statement.EndDate, statement.OpeningBalance,
        statement.ClosingBalance, statement.Lines.Count, 0, statement.Status, statement.CreatedAt));
});
bankStatements.MapPost("/{id:guid}/auto-match", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Mutabakatı tamamlanmış ekstre değiştirilemez." });
    var lines = await db.BankStatementLines.Where(x => x.TenantId == tenantId && x.StatementId == id && x.FinancialAccountTransactionId == null).OrderBy(x => x.LineNumber).ToListAsync();
    var claimed = new HashSet<Guid>();
    var matched = 0;
    var ambiguous = 0;
    foreach (var line in lines)
    {
        var candidates = await db.FinancialAccountTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.CurrencyCode == statement.CurrencyCode && x.TransactionDate == line.TransactionDate && x.Direction == line.Direction && x.Amount == line.Amount && !db.BankStatementLines.Any(l => l.TenantId == tenantId && l.FinancialAccountTransactionId == x.Id))
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(2).Select(x => x.Id).ToListAsync();
        if (candidates.Count == 1 && claimed.Add(candidates[0]))
        {
            line.FinancialAccountTransactionId = candidates[0]; line.MatchedAt = DateTimeOffset.UtcNow; matched++;
        }
        else if (candidates.Count > 1) ambiguous++;
    }
    if (matched > 0)
    {
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.auto-matched", Resource = statement.Code });
        await db.SaveChangesAsync();
    }
    await transaction.CommitAsync();
    var remaining = await db.BankStatementLines.CountAsync(x => x.TenantId == tenantId && x.StatementId == id && x.FinancialAccountTransactionId == null);
    return Results.Ok(new { matched, remaining, ambiguous });
});
bankStatements.MapPost("/{id:guid}/lines/{lineId:guid}/match", async (Guid id, Guid lineId, BankStatementMatchRequest request, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Mutabakatı tamamlanmış ekstre değiştirilemez." });
    var line = await db.BankStatementLines.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StatementId == id && x.Id == lineId);
    if (line is null) return Results.NotFound();
    if (line.FinancialAccountTransactionId is not null) return Results.Conflict(new { error = "Ekstre satırı zaten bir finans hareketiyle eşleştirilmiş." });
    var movement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.FinancialAccountTransactionId}").SingleOrDefaultAsync();
    if (movement is null || movement.FinancialAccountId != statement.AccountId || movement.CurrencyCode != statement.CurrencyCode || movement.TransactionDate != line.TransactionDate || movement.Direction != line.Direction || movement.Amount != line.Amount)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["financialAccountTransactionId"] = ["Seçilen hareket hesap, tarih, yön ve tutar bakımından ekstre satırıyla eşleşmiyor."] });
    if (await db.BankStatementLines.AnyAsync(x => x.TenantId == tenantId && x.FinancialAccountTransactionId == movement.Id))
        return Results.Conflict(new { error = "Bu finans hareketi başka bir ekstre satırına bağlanmış." });
    line.FinancialAccountTransactionId = movement.Id; line.MatchedAt = DateTimeOffset.UtcNow;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.line-matched", Resource = statement.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Finans hareketi eşzamanlı olarak başka bir ekstre satırına bağlandı." }); }
    await transaction.CommitAsync();
    return Results.Ok(new { line.Id, line.FinancialAccountTransactionId, line.MatchedAt });
});
bankStatements.MapPost("/{id:guid}/lines/{lineId:guid}/create-book-entry", async (Guid id, Guid lineId, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Mutabakatı tamamlanmış ekstre değiştirilemez." });
    var line = await db.BankStatementLines.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StatementId == id && x.Id == lineId);
    if (line is null) return Results.NotFound();
    if (line.FinancialAccountTransactionId is not null) return Results.Conflict(new { error = "Ekstre satırı zaten bir finans hareketine bağlanmış." });
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {statement.AccountId}").SingleOrDefaultAsync();
    if (account is null || account.Type != FinancialAccountType.Bank) return Results.Conflict(new { error = "Ekstre banka hesabı bulunamadı." });
    var movement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account, CurrencyCode = statement.CurrencyCode,
        TransactionDate = line.TransactionDate, Direction = line.Direction, Amount = line.Amount,
        Description = $"Ekstre {statement.Code}: {line.Description}", Reference = line.Reference, RequestId = line.Id };
    line.FinancialAccountTransaction = movement; line.IsBookEntryCreated = true; line.MatchedAt = DateTimeOffset.UtcNow;
    db.FinancialAccountTransactions.Add(movement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.book-entry-created", Resource = statement.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Ekstre satırı için finans hareketi zaten oluşturulmuş." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/accounts/{account.Id}/transactions/{movement.Id}", new { LineId = line.Id, TransactionId = movement.Id, line.IsBookEntryCreated, line.MatchedAt });
});
bankStatements.MapPost("/{id:guid}/reconcile", async (Guid id, ClaimsPrincipal principal, TenantDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Ekstre mutabakatı daha önce tamamlandı." });
    if (await db.BankStatementLines.AnyAsync(x => x.TenantId == tenantId && x.StatementId == id && x.FinancialAccountTransactionId == null))
        return Results.Conflict(new { error = "Eşleşmemiş ekstre satırları var." });
    var hasUnmatchedBookEntries = await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate >= statement.StartDate && x.TransactionDate <= statement.EndDate && !db.BankStatementLines.Any(l => l.TenantId == tenantId && l.FinancialAccountTransactionId == x.Id));
    if (hasUnmatchedBookEntries) return Results.Conflict(new { error = "Ekstre döneminde bankada bulunmayan kayıtlı finans hareketleri var." });
    var openingBalance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate < statement.StartDate)
        .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
    var closingBalance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate <= statement.EndDate)
        .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
    if (openingBalance != statement.OpeningBalance || closingBalance != statement.ClosingBalance)
        return Results.Conflict(new { error = "Ekstre açılış veya kapanış bakiyesi finans defteriyle eşleşmiyor.", bookOpeningBalance = openingBalance, bookClosingBalance = closingBalance });
    statement.Status = BankStatementStatus.Reconciled;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.reconciled", Resource = statement.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { statement.Id, statement.Code, statement.Status, statement.OpeningBalance, statement.ClosingBalance });
});

app.MapAierpMetrics();
app.Run();

static bool TryNormalizePurchaseRequestFields(IReadOnlyDictionary<string, string?>? rawValues,
    IReadOnlyCollection<PurchaseRequestCustomFieldDefinition> definitions,
    out Dictionary<Guid, (PurchaseRequestCustomFieldDefinition Definition, string Value)> normalized,
    out Dictionary<string, string[]> errors)
{
    normalized = new Dictionary<Guid, (PurchaseRequestCustomFieldDefinition, string)>();
    errors = new Dictionary<string, string[]>();
    if (rawValues is { Count: > 40 }) errors["customFields"] = ["En fazla 40 özel alan gönderilebilir."];
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (rawValues is not null)
    {
        foreach (var (code, rawValue) in rawValues)
        {
            if (string.IsNullOrWhiteSpace(code) || !byCode.TryGetValue(code, out var definition))
            {
                errors[$"customFields.{code}"] = ["Alan kodu bu tenant içinde etkin değil."];
                continue;
            }
            if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
            {
                errors[$"customFields.{code}"] = [$"'{definition.Label}' alanı veri türüne veya uzunluk sınırına uymuyor."];
                continue;
            }
            if (value.Length > 0) normalized[definition.Id] = (definition, value);
        }
    }
    PurchaseRequestCustomFieldDefinition? missing = null;
    foreach (var definition in definitions)
        if (definition.IsRequired && !normalized.ContainsKey(definition.Id)) { missing = definition; break; }
    if (missing is not null) errors[$"customFields.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    return errors.Count == 0;
}

static PurchaseRequestCustomFieldDefinitionRevision ToPurchaseRequestCustomFieldRevision(PurchaseRequestCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code, Label = definition.Label,
    DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired, IsActive = definition.IsActive,
    ChangeKind = changeKind, ChangedByUserId = userId
};

static CustomerCustomFieldDefinitionRevision ToCustomerCustomFieldRevision(CustomerCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId,
    DefinitionId = definition.Id,
    Version = definition.Version,
    Code = definition.Code,
    Label = definition.Label,
    DataType = definition.DataType,
    MaxLength = definition.MaxLength,
    IsRequired = definition.IsRequired,
    IsActive = definition.IsActive,
    ChangeKind = changeKind,
    ChangedByUserId = userId
};

static StockItemCustomFieldDefinitionRevision ToStockCustomFieldRevision(StockItemCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId,
    DefinitionId = definition.Id,
    Version = definition.Version,
    Code = definition.Code,
    Label = definition.Label,
    DataType = definition.DataType,
    MaxLength = definition.MaxLength,
    IsRequired = definition.IsRequired,
    IsActive = definition.IsActive,
    ChangeKind = changeKind,
    ChangedByUserId = userId
};

static WarehouseCustomFieldDefinitionRevision ToWarehouseCustomFieldRevision(WarehouseCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId,
    DefinitionId = definition.Id,
    Version = definition.Version,
    Code = definition.Code,
    Label = definition.Label,
    DataType = definition.DataType,
    MaxLength = definition.MaxLength,
    IsRequired = definition.IsRequired,
    IsActive = definition.IsActive,
    ChangeKind = changeKind,
    ChangedByUserId = userId
};

static SalesQuoteCustomFieldDefinitionRevision ToSalesQuoteCustomFieldRevision(SalesQuoteCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code,
    Label = definition.Label, DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired,
    IsActive = definition.IsActive, ChangeKind = changeKind, ChangedByUserId = userId
};

static PurchaseSupplierQuoteCustomFieldDefinitionRevision ToPurchaseSupplierQuoteCustomFieldRevision(PurchaseSupplierQuoteCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code,
    Label = definition.Label, DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired,
    IsActive = definition.IsActive, ChangeKind = changeKind, ChangedByUserId = userId
};

static PurchaseReceiptCustomFieldDefinitionRevision ToPurchaseReceiptCustomFieldRevision(PurchaseReceiptCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code,
    Label = definition.Label, DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired,
    IsActive = definition.IsActive, ChangeKind = changeKind, ChangedByUserId = userId
};

static SalesOrderCustomFieldDefinitionRevision ToSalesOrderCustomFieldRevision(SalesOrderCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code,
    Label = definition.Label, DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired,
    IsActive = definition.IsActive, ChangeKind = changeKind, ChangedByUserId = userId
};

static SalesInvoiceCustomFieldDefinitionRevision ToSalesInvoiceCustomFieldRevision(SalesInvoiceCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code,
    Label = definition.Label, DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired,
    IsActive = definition.IsActive, ChangeKind = changeKind, ChangedByUserId = userId
};

static PurchaseOrderCustomFieldDefinitionRevision ToPurchaseOrderCustomFieldRevision(PurchaseOrderCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code,
    Label = definition.Label, DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired,
    IsActive = definition.IsActive, ChangeKind = changeKind, ChangedByUserId = userId
};

static async Task<IResult> UpdateSalesQuoteStatusAsync(Guid id, SalesQuoteStatus target, ClaimsPrincipal principal, TenantDbContext db, CancellationToken ct)
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var actorUserId = GetUserId(principal);
    if (target == SalesQuoteStatus.Accepted && actorUserId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound();
    if (!SalesQuoteWorkflow.CanTransition(quote.Status, target)) return Results.Conflict(new { error = "Teklif durumu bu işlem için uygun değil." });
    if (target == SalesQuoteStatus.Accepted && quote.ValidUntil < DateOnly.FromDateTime(DateTime.UtcNow))
        return Results.Conflict(new { error = "Geçerlilik tarihi geçmiş teklif kabul edilemez." });
    quote.Status = target;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actorUserId, Action = target == SalesQuoteStatus.Accepted ? "sales-quote.accepted" : "sales-quote.rejected", Resource = quote.Code });
    if (target == SalesQuoteStatus.Accepted)
        await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, quote, actorUserId!.Value, ct);
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    var customerName = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == quote.CustomerId).Select(x => x.Name).SingleAsync();
    var lineCount = await db.SalesQuoteLines.CountAsync(x => x.TenantId == tenantId && x.QuoteId == quote.Id);
    var hasSalesOrder = await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.QuoteId == quote.Id);
    return Results.Ok(new SalesQuoteSummary(quote.Id, quote.Code, quote.CustomerId, customerName, quote.QuoteDate, quote.ValidUntil,
        quote.CurrencyCode, quote.Status, quote.GrandTotal, lineCount, quote.CreatedAt, hasSalesOrder));
}

static async Task SeedBootstrapUserAsync(PlatformDbContext db, IConfiguration c)
{
    var email = c["Bootstrap:Email"]?.Trim().ToLowerInvariant(); var password = c["Bootstrap:Password"];
    if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(password) && !await db.Users.AnyAsync())
    {
        var tenant = new Tenant { Name = c["Bootstrap:TenantName"] ?? "Nexora Demo", Slug = "nexora-demo" };
        var user = new AppUser { Email = email, DisplayName = c["Bootstrap:DisplayName"] ?? "Platform Admin", PasswordHash = PasswordHashing.Hash(password) };
        db.AddRange(tenant, user); db.TenantMemberships.Add(new TenantMembership { User = user, Tenant = tenant, Role = "TenantAdmin" }); await db.SaveChangesAsync();
        await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenant.Id, user.Id);
    }
    var superAdminEmail = (string.IsNullOrWhiteSpace(c["Platform:SuperAdminEmail"]) ? email : c["Platform:SuperAdminEmail"])?.Trim().ToLowerInvariant();
    if (!string.IsNullOrWhiteSpace(superAdminEmail))
    {
        var superAdmin = await db.Users.SingleOrDefaultAsync(x => x.Email == superAdminEmail && x.IsActive);
        if (superAdmin is not null && !await db.PlatformUserRoles.AnyAsync(x => x.UserId == superAdmin.Id && x.Role == "PlatformSuperAdmin"))
            db.PlatformUserRoles.Add(new PlatformUserRole { UserId = superAdmin.Id, Role = "PlatformSuperAdmin" });
    }
    await db.SaveChangesAsync();
}
static async Task<Guid> CreateCompanyForProvisioningAsync(string platformConnection, IConfiguration c)
{
    var normalized = TenantProvisioningRequestNormalizer.Normalize(
        c["TenantProvisioning:Name"],
        c["TenantProvisioning:Slug"],
        c["TenantProvisioning:BaseCurrencyCode"],
        c["TenantProvisioning:AdminEmail"],
        c["TenantProvisioning:AdminDisplayName"]);
    var name = normalized.Name;
    var slug = normalized.Slug;
    var currency = normalized.BaseCurrencyCode;
    var email = normalized.AdminEmail;
    var displayName = normalized.AdminDisplayName;
    var password = c["TenantProvisioning:AdminPassword"];

    await using var db = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
    var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Slug == slug);
    if (tenant is null)
    {
        tenant = new Tenant { Name = name, Slug = slug, BaseCurrencyCode = currency };
        db.Tenants.Add(tenant);
    }
    else if (!tenant.IsActive || tenant.Name != name || tenant.BaseCurrencyCode != currency)
        throw new InvalidOperationException("The company slug already belongs to a different or inactive tenant.");

    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email);
    if (user is null)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12 || password.Length > 256)
            throw new InvalidOperationException("For a new admin user, TenantProvisioning:AdminPassword must be 12–256 characters and supplied via a secret environment variable.");
        user = new AppUser { Email = email, DisplayName = displayName, PasswordHash = PasswordHashing.Hash(password) };
        db.Users.Add(user);
    }
    else if (!user.IsActive)
        throw new InvalidOperationException("The selected admin account is inactive.");

    var membership = await db.TenantMemberships.SingleOrDefaultAsync(x => x.UserId == user.Id && x.TenantId == tenant.Id);
    if (membership is null) db.TenantMemberships.Add(new TenantMembership { User = user, Tenant = tenant, Role = "TenantAdmin" });
    else if (membership.Role != "TenantAdmin")
        throw new InvalidOperationException("The selected user's existing tenant role is not TenantAdmin; resolve it explicitly before retrying.");

    db.AuditEvents.Add(new AuditEvent { UserId = user.Id, TenantId = tenant.Id, Action = "tenant.provisioning.requested", Resource = slug });
    await db.SaveChangesAsync();
    if (!await db.TenantPermissionRules.AnyAsync(x => x.TenantId == tenant.Id))
    {
        await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenant.Id, user.Id);
        await db.SaveChangesAsync();
    }
    return tenant.Id;
}
static async Task<bool> PlatformDatabaseExistsAsync(string platformConnection)
{
    var builder = new SqlConnectionStringBuilder(platformConnection);
    var databaseName = builder.InitialCatalog;
    if (string.IsNullOrWhiteSpace(databaseName))
        throw new InvalidOperationException("ConnectionStrings:Platform must specify a database.");
    builder.InitialCatalog = "master";
    await using var connection = new SqlConnection(builder.ConnectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT CASE WHEN DB_ID(@databaseName) IS NULL THEN 0 ELSE 1 END";
    command.Parameters.AddWithValue("@databaseName", databaseName);
    return Convert.ToInt32(await command.ExecuteScalarAsync()) == 1;
}
static async Task ProvisionAllTenantDatabasesAsync(string platformConnection, string dataRuntimeLogin, string? separationBackupPath,
    bool platformDatabaseWasCreatedDuringBootstrap)
{
    await using var db = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
    var tenantIds = await db.Tenants.AsNoTracking().Select(x => x.Id).ToListAsync();
    var provisioner = new TenantDatabaseProvisioner(platformConnection, dataRuntimeLogin, separationBackupPath);
    foreach (var tenantId in tenantIds)
        await provisioner.ProvisionAsync(tenantId, sourceDatabaseWasCreatedDuringCurrentBootstrap: platformDatabaseWasCreatedDuringBootstrap);
    await provisioner.ProvisionAIStudioAsync(sourceDatabaseWasCreatedDuringCurrentBootstrap: platformDatabaseWasCreatedDuringBootstrap);
    await TenantDatabaseSeparationVerifier.VerifyAllAsync(platformConnection);
}
static async Task BaselineEnsureCreatedDatabaseAsync(PlatformDbContext db)
{
    // Phase 1 used EnsureCreated before migrations existed. Adopt that exact schema
    // without dropping data, so future migrations can evolve the same database.
    try { await db.Database.OpenConnectionAsync(); }
    catch (SqlException ex) when (ex.Number == 4060) { return; } // Database does not exist yet; Migrate creates it.
    try
    {
        await db.Database.ExecuteSqlRawAsync("""
        IF OBJECT_ID(N'[dbo].[Users]', N'U') IS NOT NULL
           AND OBJECT_ID(N'[dbo].[__EFMigrationsHistory]', N'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[__EFMigrationsHistory] (
                [MigrationId] nvarchar(150) NOT NULL,
                [ProductVersion] nvarchar(32) NOT NULL,
                CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
            );
            INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
            VALUES (N'20261014203054_InitialPlatformSchema', N'10.0.13');
        END
        """);
    }
    finally { await db.Database.CloseConnectionAsync(); }
}
static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) => Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
static bool IsOpenAITextModel(string id)
{
    var model = id.ToLowerInvariant();
    var supportedFamily = model.StartsWith("gpt-", StringComparison.Ordinal) || model.StartsWith("o1", StringComparison.Ordinal)
        || model.StartsWith("o3", StringComparison.Ordinal) || model.StartsWith("o4", StringComparison.Ordinal)
        || model.StartsWith("chatgpt-", StringComparison.Ordinal) || model.StartsWith("codex-", StringComparison.Ordinal);
    return supportedFamily && !new[] { "audio", "image", "realtime", "transcribe", "tts", "embedding", "moderation" }
        .Any(excluded => model.Contains(excluded, StringComparison.Ordinal));
}
static bool IsNvidiaChatModel(string id)
{
    var model = id.ToLowerInvariant();
    return !new[] { "embed", "retriever", "rerank", "clip", "flux", "diffusion", "video-detector" }
        .Any(excluded => model.Contains(excluded, StringComparison.Ordinal));
}
static Guid? GetUserId(ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
static async Task<decimal?> GetWeightedAverageUnitCostBaseAsync(TenantDbContext db, Guid tenantId, Guid stockItemId, DateOnly asOfDate)
{
    var totals = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.EntryDate <= asOfDate)
        .GroupBy(_ => 1).Select(g => new
        {
            OnHand = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
            Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m,
            Value = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m
        }).SingleOrDefaultAsync();
    if (totals is null || totals.OnHand <= 0m || totals.Unvalued > 0m) return null;
    var costAdjustments = await db.InventoryCostAdjustmentLines.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.Adjustment.EntryDate <= asOfDate)
        .SumAsync(x => (decimal?)x.AmountBase) ?? 0m;
    return decimal.Round((totals.Value + costAdjustments) / totals.OnHand, 8, MidpointRounding.AwayFromZero);
}
static async Task<bool> HasUnreversedJournalEntryAsync(TenantDbContext db, Guid tenantId, string sourceType, Guid sourceId)
{
    var entryId = await db.JournalEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == sourceId)
        .Select(x => (Guid?)x.Id).SingleOrDefaultAsync();
    return entryId is { } id && !await db.JournalEntries.AsNoTracking()
        .AnyAsync(x => x.TenantId == tenantId && x.SourceType == "ManualReversal" && x.SourceId == id);
}

static async Task<bool> LockTenantForMutationAsync(TenantDbContext db, Guid tenantId)
    => await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").AnyAsync();

static async Task<InventoryCostAdjustmentView> BuildInventoryCostAdjustmentViewAsync(TenantDbContext db, Guid tenantId, InventoryCostAdjustment header)
{
    var lines = await (from line in db.InventoryCostAdjustmentLines.AsNoTracking()
                       join item in db.StockItems.AsNoTracking() on new { line.TenantId, line.StockItemId } equals new { item.TenantId, StockItemId = item.Id }
                       join warehouse in db.Warehouses.AsNoTracking() on new { line.TenantId, line.WarehouseId } equals new { warehouse.TenantId, WarehouseId = warehouse.Id }
                       where line.TenantId == tenantId && line.AdjustmentId == header.Id
                       orderby item.Code, warehouse.Code
                       select new InventoryCostAdjustmentLineView(line.Id, item.Id, item.Code, item.Name, warehouse.Id, warehouse.Code,
                           line.QuantitySnapshot, line.UnitCostSnapshotBase, line.AmountBase, line.PurchaseReceiptLineId)).ToListAsync();
    return new InventoryCostAdjustmentView(header.Id, header.Code, header.EntryDate, header.Kind, header.PurchaseReceiptId,
        header.Description, header.ReversalOfId, header.CreatedAt, lines.Sum(x => x.AmountBase), lines);
}
static async Task<decimal?> GetTenantRateAsync(TenantDbContext db, Guid tenantId, string currencyCode, DateOnly rateDate)
{
    var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
    if (currencyCode == baseCurrency) return 1m;
    return await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= rateDate)
        .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync();
}
static async Task<decimal?> ResolveStockUnitFactorAsync(TenantDbContext db, Guid tenantId, StockItem item, string? requestedUnitCode)
{
    var unitCode = string.IsNullOrWhiteSpace(requestedUnitCode) ? item.UnitCode : requestedUnitCode.Trim().ToUpperInvariant();
    if (string.Equals(unitCode, item.UnitCode, StringComparison.OrdinalIgnoreCase)) return 1m;
    return await db.StockItemUnitConversions.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.StockItemId == item.Id && x.IsActive && x.UnitCode == unitCode)
        .Select(x => (decimal?)x.FactorToBase).SingleOrDefaultAsync();
}
static string? ValidateTrackingAllocations(InventoryTrackingMode mode, IReadOnlyList<InventoryTrackingAllocationRequest>? allocations, decimal quantity)
{
    allocations ??= [];
    if (allocations.Count == 0) return mode == InventoryTrackingMode.None ? null : "Lot veya seri takibi açıkken izleme kodları zorunludur.";
    if (mode == InventoryTrackingMode.None) return "Takip modu kapalı stok kartı için lot/seri kodu gönderilemez.";
    if (allocations.Any(x => string.IsNullOrWhiteSpace(x.TrackingCode) || x.TrackingCode.Trim().Length > 80 || x.Quantity <= 0m)) return "Takip kodu ve miktar geçerli olmalıdır.";
    if (allocations.GroupBy(x => x.TrackingCode.Trim(), StringComparer.OrdinalIgnoreCase).Any(g => g.Count() > 1)) return "Aynı harekette takip kodu tekrarlanamaz.";
    if (mode == InventoryTrackingMode.Serial && allocations.Any(x => x.Quantity != 1m || x.ExpiryDate is not null)) return "Her seri numarası 1 adet olmalı ve son kullanma tarihi taşımamalıdır.";
    if (mode == InventoryTrackingMode.Lot && allocations.Any(x => x.ExpiryDate is null)) return "Lot hareketlerinde son kullanma tarihi belirtilmelidir.";
    if (allocations.Sum(x => x.Quantity) != quantity) return "Takip satırlarının toplamı hareket miktarına eşit olmalıdır.";
    return null;
}
static List<InventoryTransactionTrace> ToTraceEntities(Guid tenantId, StockItem item, IReadOnlyList<InventoryTrackingAllocationRequest> allocations) =>
    allocations.Select(x => new InventoryTransactionTrace { TenantId = tenantId, StockItemId = item.Id, TrackingMode = item.TrackingMode,
        TrackingCode = x.TrackingCode, Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList();
static async Task<List<InventoryTransactionTrace>> CopyTrackingAsync(TenantDbContext db, Guid tenantId, InventoryTransaction original) =>
    (await db.InventoryTransactionTraces.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransactionId == original.Id).ToListAsync())
        .Select(x => new InventoryTransactionTrace { TenantId = tenantId, StockItemId = original.StockItemId, TrackingMode = x.TrackingMode,
            TrackingCode = x.TrackingCode, Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList();
static async Task<List<InventoryTrackingAllocationRequest>?> AllocateAvailableTrackingAsync(TenantDbContext db, Guid tenantId, Guid warehouseId, StockItem item, decimal quantity, Guid? storageLocationId = null)
{
    if (item.TrackingMode == InventoryTrackingMode.None) return [];
    var stock = await (from trace in db.InventoryTransactionTraces.AsNoTracking()
        join movement in db.InventoryTransactions.AsNoTracking() on new { trace.TenantId, trace.InventoryTransactionId } equals new { movement.TenantId, InventoryTransactionId = movement.Id }
        where trace.TenantId == tenantId && movement.WarehouseId == warehouseId && trace.StockItemId == item.Id
            && (storageLocationId == null || movement.StorageLocationId == storageLocationId)
        group new { trace, movement } by new { trace.TrackingCode, trace.ExpiryDate } into groupRows
        select new { groupRows.Key.TrackingCode, groupRows.Key.ExpiryDate,
            Quantity = groupRows.Sum(x => x.movement.Direction == InventoryDirection.Receipt ? x.trace.Quantity : -x.trace.Quantity) })
        .Where(x => x.Quantity > 0m).OrderBy(x => x.ExpiryDate).ThenBy(x => x.TrackingCode).ToListAsync();
    var allocations = new List<InventoryTrackingAllocationRequest>();
    var remaining = quantity;
    foreach (var row in stock)
    {
        var take = item.TrackingMode == InventoryTrackingMode.Serial ? Math.Min(1m, row.Quantity) : Math.Min(remaining, row.Quantity);
        if (take <= 0m) continue;
        if (item.TrackingMode == InventoryTrackingMode.Serial && take != 1m) return null;
        allocations.Add(new InventoryTrackingAllocationRequest(row.TrackingCode, take, row.ExpiryDate));
        remaining -= take;
        if (remaining <= 0m) break;
    }
    return remaining == 0m ? allocations : null;
}
static string? NormalizeTaxNumber(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
static CustomerAddressView ToAddressView(CustomerAddress x) => new(x.Id, x.Kind, x.Label, x.AddressLine, x.City, x.District, x.PostalCode, x.CountryCode, x.IsDefault, x.IsActive);
static bool IsUniqueViolation(DbUpdateException exception) => exception.InnerException is SqlException { Number: 2601 or 2627 };
static bool TryPluginHostUri(IConfiguration configuration, out Uri? uri)
{
    uri = null;
    if (!Uri.TryCreate(configuration["PluginHost:BaseUrl"], UriKind.Absolute, out var candidate) ||
        candidate.Scheme != Uri.UriSchemeHttp || !string.IsNullOrEmpty(candidate.UserInfo) ||
        !string.IsNullOrEmpty(candidate.Query) || !string.IsNullOrEmpty(candidate.Fragment)) return false;
    uri = candidate;
    return true;
}
static Claim[] PluginHostClaims(string operation, string moduleCode, string version, string artifactSha256,
    Guid? tenantId = null, Guid? userId = null) =>
CreatePluginHostClaims(operation, moduleCode, version, artifactSha256, tenantId, userId);
static Claim[] CreatePluginHostClaims(string operation, string moduleCode, string version, string artifactSha256,
    Guid? tenantId, Guid? userId)
{
    var claims = new List<Claim>
    {
        new(JwtRegisteredClaimNames.Sub, userId?.ToString("D") ?? "AIERP.Api"),
        new("service", "AIERP.Api"), new("operation", operation), new("module_code", moduleCode),
        new("module_version", version), new("artifact_sha256", artifactSha256.ToLowerInvariant())
    };
    if (tenantId is not null) claims.Add(new Claim("tenant_id", tenantId.Value.ToString("D")));
    return claims.ToArray();
}
static async Task<(byte[]? Wasm, string? Error)> VerifyModuleReleaseArtifactAsync(PlatformDbContext db, IConfiguration configuration,
    PlatformModuleRelease release, CancellationToken cancellationToken)
{
    if (!ModuleManifestValidator.IsValidSha256(release.ArtifactSha256) ||
        !string.Equals(release.StorageKey, $"{release.ArtifactSha256.ToLowerInvariant()}.zip", StringComparison.Ordinal))
        return (null, "Modül yayın kaydı geçersiz.");
    var root = Path.GetFullPath(configuration["ModulePackages:RootPath"] ?? "/module-packages");
    string path;
    try { path = ModulePackageStoragePath.ResolvePackage(root, release.ArtifactSha256); }
    catch (InvalidDataException) { return (null, "Modül paket yolu geçersiz."); }
    byte[] packageBytes;
    try
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        if (stream.Length is <= 0 or > ModulePackageArchive.MaximumPackageBytes) return (null, "Modül paketi boyut sınırını aşıyor.");
        using var buffer = new MemoryStream((int)stream.Length);
        await stream.CopyToAsync(buffer, cancellationToken);
        packageBytes = buffer.ToArray();
    }
    catch (FileNotFoundException) { return (null, "Modül paketi bulunamadı."); }
    catch (IOException) { return (null, "Modül paketi okunamadı."); }
    var manifest = JsonSerializer.Deserialize<ModuleManifest>(release.ManifestJson, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    if (manifest is null) return (null, "Modül manifesti geçersiz.");
    var package = new SignedModulePackage(manifest, release.KeyId, release.ArtifactSha256, release.SignatureBase64);
    var verification = await ModulePackageVerifier.VerifyAsync(package, new MemoryStream(packageBytes, writable: false), new DatabaseModulePublisherKeyResolver(db), cancellationToken);
    if (!verification.IsValid) return (null, "Modül imzası veya yayıncı anahtarı artık doğrulanamıyor.");
    try { return (ModulePackageArchive.ExtractWasm(packageBytes), null); }
    catch (InvalidDataException) { return (null, "Modül paketi geçerli bir module.wasm içermiyor."); }
}
internal sealed record LoginRequest(string Email, string Password);
internal sealed record SelectTenantRequest(Guid TenantId);
internal sealed record PublisherKeyWriteRequest(string? Publisher, string? KeyId, string? PublicKeyPem);
internal sealed record ModuleRevocationRequest(string? Reason);
internal sealed record TenantModuleActivationRequest(string ModuleCode, string Version);
internal sealed record TenantModuleInvocationRequest(string? Action, JsonElement Input, IReadOnlyList<ModuleDataCapabilityRequest>? Capabilities = null);
internal sealed record ModuleInvocationRequest(string Action, JsonElement Input);
internal sealed record PluginHostInvocationResponse(string ModuleCode, string Version, JsonElement Result, DateTimeOffset ExecutedAt);
internal sealed record PlatformRoleWriteRequest(string? Email, string? Role);
internal sealed record AIProviderSettingsView(string Provider, bool OpenAIKeyConfigured, string OpenAIModel, bool NvidiaKeyConfigured, string NvidiaModel, bool LiveEvaluationEnabled);
internal sealed record AIProviderSettingsWriteRequest(string? Provider, string? OpenAIKey, string? OpenAIModel, string? NvidiaKey, string? NvidiaModel,
    bool ClearOpenAIKey = false, bool ClearNvidiaKey = false);
internal sealed record ERPAssistantChatTurn(string Role, string Content);
internal sealed record ERPAssistantProxyRequest(string? Question, bool AISharingConfirmed, IReadOnlyList<ERPAssistantChatTurn>? History = null);
internal sealed record OpenAIModelsRequest(string? ApiKey);
internal sealed record LiveAiEvaluationRequest(string? CaseId);
internal sealed record LiveAiEvaluationResponse(string EvaluationSetId, string CaseId, string Answer, bool Store, bool HumanReviewRequired);
internal sealed record OpenAIModelsView(string[] Models);
internal sealed record NvidiaModelsRequest(string? ApiKey);
internal sealed record NvidiaModelsView(string[] Models);
internal static class TokenIssuer
{
    public static string Issue(IEnumerable<Claim> claims, IConfiguration c)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(c["Authentication:SigningKey"]!));
        var token = new JwtSecurityToken(c["Authentication:Issuer"] ?? "AIERP", c["Authentication:Audience"] ?? "AIERP", claims,
            DateTime.UtcNow.AddSeconds(-10), DateTime.UtcNow.AddMinutes(30), new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
    public static string IssueForAudience(IEnumerable<Claim> claims, IConfiguration c, string audience, TimeSpan lifetime, string signingKey)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(c["Authentication:Issuer"] ?? "AIERP", audience, claims,
            now.AddSeconds(-5), now.Add(lifetime), new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
internal sealed record RefreshRequest(string? RefreshToken = null);
internal static class RefreshTokenIssuer
{
    public static (string Token, PlatformRefreshSession Session) Create(Guid userId, Guid tenantId, DateTimeOffset? absoluteExpiry = null, DateTimeOffset? createdAt = null)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var now = DateTimeOffset.UtcNow;
        var session = new PlatformRefreshSession
        {
            UserId = userId, TenantId = tenantId, TokenHash = Hash(token),
            CreatedAt = createdAt ?? now, ExpiresAt = absoluteExpiry is { } limit && limit < now.AddDays(14) ? limit : now.AddDays(14)
        };
        return (token, session);
    }

    public static string Hash(string? token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token ?? ""))).ToLowerInvariant();
}
internal static class PasswordHashing
{
    private const int Iterations = 210_000;
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"v1.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }
    public static bool Verify(string password, string encoded)
    {
        try
        {
            var p = encoded.Split('.'); if (p.Length != 4 || p[0] != "v1" || !int.TryParse(p[1], out var n)) return false;
            var expected = Convert.FromBase64String(p[3]); var actual = Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(p[2]), n, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException) { return false; }
    }
}
internal sealed class DatabaseModulePublisherKeyResolver(PlatformDbContext db) : IModulePublisherKeyResolver
{
    public async ValueTask<string?> GetPublicKeyPemAsync(string publisher, string keyId, CancellationToken cancellationToken) =>
        await db.PlatformModulePublisherKeys.AsNoTracking().Where(x => x.Publisher == publisher && x.KeyId == keyId && x.IsActive)
            .Select(x => x.PublicKeyPem).SingleOrDefaultAsync(cancellationToken);
}

public partial class Program { }
