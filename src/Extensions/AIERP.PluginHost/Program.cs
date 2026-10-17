using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.ModuleSDK;
using AIERP.PluginHost;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Wasmtime;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 512 * 1024);
var signingKey = builder.Configuration["PluginHost:SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
    throw new InvalidOperationException("PluginHost:SigningKey must contain at least 32 bytes.");
builder.Services.AddSingleton(new WasmModuleRuntime());
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = builder.Configuration["PluginHost:Issuer"] ?? "AIERP",
        ValidateAudience = true, ValidAudience = builder.Configuration["PluginHost:Audience"] ?? "AIERP.PluginHost",
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(10)
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ModuleInvocation", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.Api").RequireClaim("operation", "module.invoke")
        .RequireClaim("tenant_id").RequireClaim("module_code").RequireClaim("module_version").RequireClaim("artifact_sha256"));
    options.AddPolicy("ModuleValidation", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("service", "AIERP.Api").RequireClaim("operation", "module.validate")
        .RequireClaim("module_code").RequireClaim("module_version").RequireClaim("artifact_sha256"));
});
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("module-runtime", limiter =>
{
    limiter.PermitLimit = 12;
    limiter.Window = TimeSpan.FromSeconds(10);
    limiter.QueueLimit = 0;
}));
var app = builder.Build();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "plugin-host", runtime = "wasm-core-no-imports" }));
app.MapPost("/internal/modules/validate", async (ClaimsPrincipal caller, IConfiguration configuration, WasmModuleRuntime runtime, CancellationToken cancellationToken) =>
{
    if (!TryReleaseClaims(caller, out var release)) return Results.Forbid();
    try
    {
        var wasm = await ReadWasmPackageAsync(configuration, release.ArtifactSha256, cancellationToken);
        runtime.Validate(wasm);
        return Results.Ok(new { release.ModuleCode, release.Version, runtime = "wasm-core-no-imports", valid = true });
    }
    catch (FileNotFoundException) { return Results.NotFound(new { error = "Modül paketi bulunamadı." }); }
    catch (InvalidDataException exception) { return Results.UnprocessableEntity(new { error = exception.Message }); }
    catch (WasmtimeException) { return Results.UnprocessableEntity(new { error = "Modül WebAssembly dosyası veya AIERP ABI sözleşmesi geçersiz." }); }
}).RequireAuthorization("ModuleValidation").RequireRateLimiting("module-runtime");
app.MapPost("/internal/modules/invoke", async (ModuleInvocationRequest request, ClaimsPrincipal caller, IConfiguration configuration, WasmModuleRuntime runtime, CancellationToken cancellationToken) =>
{
    if (!TryReleaseClaims(caller, out var release) || !Guid.TryParse(caller.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
    if (string.IsNullOrWhiteSpace(request.Action) || request.Action.Length > 80 || request.Action.Any(char.IsControl) ||
        request.Input.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        return Results.BadRequest(new { error = "Modül eylemi ve JSON girdisi gereklidir." });
    try
    {
        var wasm = await ReadWasmPackageAsync(configuration, release.ArtifactSha256, cancellationToken);
        var result = await Task.Run(() => runtime.Invoke(wasm, new ModuleInvocationInput(tenantId, release.ModuleCode, release.Version, request.Action, request.Input)), cancellationToken);
        return Results.Ok(new ModuleInvocationResponse(release.ModuleCode, release.Version, result, DateTimeOffset.UtcNow));
    }
    catch (FileNotFoundException) { return Results.NotFound(new { error = "Modül paketi bulunamadı." }); }
    catch (InvalidDataException exception) { return Results.UnprocessableEntity(new { error = exception.Message }); }
    catch (WasmtimeException) { return Results.UnprocessableEntity(new { error = "Modül çağrısı sandbox sınırını aştı veya geçersiz çıktı üretti." }); }
}).RequireAuthorization("ModuleInvocation").RequireRateLimiting("module-runtime");
app.Run();

static bool TryReleaseClaims(ClaimsPrincipal caller, out VerifiedModuleRelease release)
{
    var moduleCode = caller.FindFirstValue("module_code");
    var version = caller.FindFirstValue("module_version");
    var hash = caller.FindFirstValue("artifact_sha256");
    release = new VerifiedModuleRelease(moduleCode ?? "", version ?? "", hash ?? "");
    return ModuleManifestValidator.IsValidModuleCode(moduleCode) && ModuleManifestValidator.IsValidSemVersion(version)
        && ModuleManifestValidator.IsValidSha256(hash);
}

static async Task<byte[]> ReadWasmPackageAsync(IConfiguration configuration, string artifactSha256, CancellationToken cancellationToken)
{
    var root = Path.GetFullPath(configuration["ModulePackages:RootPath"] ?? "/module-packages");
    var path = Path.GetFullPath(Path.Combine(root, $"{artifactSha256.ToLowerInvariant()}.zip"));
    if (!path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        throw new InvalidDataException("Modül paketi yolu geçersiz.");
    await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
    if (stream.Length is <= 0 or > ModulePackageVerifier.MaximumArtifactBytes) throw new InvalidDataException("Modül paketi boyut sınırını aşıyor.");
    var actualHash = await ModulePackageVerifier.ComputeSha256Async(stream, cancellationToken);
    if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(actualHash), Convert.FromHexString(artifactSha256)))
        throw new InvalidDataException("Modül paketi özeti yayın kaydıyla eşleşmiyor.");
    stream.Position = 0;
    using var buffer = new MemoryStream((int)stream.Length);
    await stream.CopyToAsync(buffer, cancellationToken);
    return ModulePackageArchive.ExtractWasm(buffer.ToArray());
}

public sealed record ModuleInvocationRequest(string? Action, JsonElement Input);
public sealed record ModuleInvocationInput(Guid TenantId, string ModuleCode, string Version, string Action, JsonElement Data);
public sealed record ModuleInvocationResponse(string ModuleCode, string Version, JsonElement Result, DateTimeOffset ExecutedAt);
public sealed record VerifiedModuleRelease(string ModuleCode, string Version, string ArtifactSha256);
