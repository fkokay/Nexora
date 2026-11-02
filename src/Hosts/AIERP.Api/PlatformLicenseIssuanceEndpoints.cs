using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class PlatformLicenseIssuanceEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapPlatformLicenseIssuanceEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/platform/licenses")
            .WithTags("Platform License Issuance")
            .RequireAuthorization("PlatformSuperAdmin");

        group.MapGet("/configuration", (IConfiguration configuration) =>
        {
            var keyId = configuration["Licensing:IssuerKeyId"];
            var ready = TryLoadSigningKey(configuration, keyId, out var key, out _);
            key?.Dispose();
            return Results.Ok(new { ready, keyId = ready ? keyId : null });
        });

        group.MapGet("/tenants", async (PlatformDbContext db, CancellationToken cancellationToken) =>
            Results.Ok(await db.Tenants.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new PlatformLicenseTenant(x.Id, x.Name, x.Slug, x.IsActive))
                .ToListAsync(cancellationToken)));

        group.MapPost("/issue", IssueAsync);
    }

    private static async Task<IResult> IssueAsync(
        IssuePlatformLicenseRequest request,
        ClaimsPrincipal principal,
        PlatformDbContext db,
        IConfiguration configuration,
        CancellationToken cancellationToken)
    {
        if (request.TenantId == Guid.Empty)
            return Results.BadRequest(new { error = "tenant_required", message = "Bir firma seçin." });
        if (string.IsNullOrWhiteSpace(request.Tier) || !LicenseTierCatalog.TryGet(request.Tier, out var policy))
            return Results.BadRequest(new { error = "invalid_tier", message = "Desteklenmeyen lisans paketi." });

        var issuedAt = DateTimeOffset.UtcNow;
        var expiresAt = new DateTimeOffset(request.ExpiresOn.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc));
        if (expiresAt <= issuedAt)
            return Results.BadRequest(new { error = "invalid_expiry", message = "Bitiş tarihi gelecekte olmalıdır." });

        var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.TenantId, cancellationToken);
        if (tenant is null) return Results.NotFound(new { error = "tenant_not_found", message = "Firma bulunamadı." });
        if (!tenant.IsActive) return Results.Conflict(new { error = "tenant_not_ready", message = "Lisans üretmeden önce firma hazırlığının tamamlanması gerekir." });

        var configuredKeyId = configuration["Licensing:IssuerKeyId"];
        if (!TryLoadSigningKey(configuration, configuredKeyId, out var rsa, out var keyError))
            return Results.Problem(title: "Lisans imzalayıcısı hazır değil", detail: keyError, statusCode: StatusCodes.Status503ServiceUnavailable);

        using (var signer = rsa!)
        {
            if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Results.Unauthorized();

            var licenseId = Guid.NewGuid();
            var grant = new SignedLicenseGrant(1, licenseId, tenant.Id, policy.Code, issuedAt, expiresAt);
            var payload = ToBase64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(grant, JsonOptions)));
            var signingInput = $"{configuredKeyId}.{payload}";
            var signature = ToBase64Url(signer.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
            var signedGrant = $"{signingInput}.{signature}";

            db.AuditEvents.Add(new AuditEvent
            {
                UserId = userId,
                TenantId = tenant.Id,
                Action = "tenant-license.issued",
                Resource = $"{licenseId:D}:{policy.Code}:{configuredKeyId}"
            });
            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new IssuedPlatformLicense(tenant.Id, tenant.Name, licenseId, policy.Code,
                configuredKeyId!, issuedAt, expiresAt, signedGrant));
        }
    }

    private static bool TryLoadSigningKey(IConfiguration configuration, string? keyId, out RSA? rsa, out string error)
    {
        rsa = null;
        error = "Configure the license issuer key ID, its private signing key, and the matching public verification key in the server secret store.";
        if (string.IsNullOrWhiteSpace(keyId) || keyId.Length > 80
            || keyId.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))) return false;

        var privatePem = LicensingKeyConfiguration.Read(
            configuration, $"Licensing:SigningKeys:{keyId}", "Licensing:SigningKeyFile");
        var publicPem = LicensingKeyConfiguration.Read(
            configuration, $"Licensing:PublicKeys:{keyId}", "Licensing:PublicKeyFile");
        if (string.IsNullOrWhiteSpace(privatePem) || string.IsNullOrWhiteSpace(publicPem)) return false;

        RSA? signingKey = null;
        try
        {
            signingKey = RSA.Create();
            signingKey.ImportFromPem(privatePem);
            _ = signingKey.ExportParameters(true);
            using var verificationKey = RSA.Create();
            verificationKey.ImportFromPem(publicPem);
            if (!signingKey.ExportSubjectPublicKeyInfo().SequenceEqual(verificationKey.ExportSubjectPublicKeyInfo()))
            {
                error = "The configured license signing key does not match its public verification key.";
                return false;
            }
            rsa = signingKey;
            signingKey = null;
            error = "";
            return true;
        }
        catch (Exception exception) when (exception is CryptographicException or ArgumentException)
        {
            error = "The configured license signing or verification key is invalid.";
            return false;
        }
        finally { signingKey?.Dispose(); }
    }

    private static string ToBase64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed record SignedLicenseGrant(int SchemaVersion, Guid LicenseId, Guid TenantId, string Tier,
        DateTimeOffset IssuedAt, DateTimeOffset ExpiresAt);
}

public sealed record IssuePlatformLicenseRequest(Guid TenantId, string Tier, DateOnly ExpiresOn);
public sealed record PlatformLicenseTenant(Guid Id, string Name, string Slug, bool IsActive);
public sealed record IssuedPlatformLicense(Guid TenantId, string TenantName, Guid LicenseId, string Tier,
    string KeyId, DateTimeOffset IssuedAt, DateTimeOffset ExpiresAt, string SignedGrant);
