using System.Security.Claims;
using System.Security.Cryptography;
using System.Data;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

public static class TenantLicenseEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapTenantLicenseEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/tenant-license").WithTags("Firma lisansı").RequireAuthorization();
        group.MapGet("/", async (ClaimsPrincipal user, PlatformDbContext db, TenantDbContext tenantDb, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var license = await db.TenantLicenses.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
            var userCount = await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId, ct);
            var moduleCount = await db.TenantModuleActivations.CountAsync(x => x.TenantId == tenantId, ct);
            var sqlDataBytes = await ReadTenantSqlDataBytesAsync(tenantDb, ct);
            var usage = new TenantLicenseUsage(userCount, moduleCount, sqlDataBytes);
            if (license is null)
            {
                var defaultPolicy = LicenseTierCatalog.All["Small"];
                return Results.Ok(new TenantLicenseView("Unlicensed", null, defaultPolicy.Code, null,
                    defaultPolicy.MaxUsers, defaultPolicy.MaxCustomModules, defaultPolicy.MaxStorageGb,
                    new TenantLicenseFeatures(defaultPolicy.AdvancedWorkflow, defaultPolicy.CustomModuleSource, defaultPolicy.HighAvailability), null, usage));
            }

            if (!LicenseTierCatalog.TryGet(license.Tier, out var policy))
                return Results.Ok(new TenantLicenseView("Invalid", license.LicenseId, license.Tier, license.ExpiresAt,
                    null, null, null, null, Convert.ToBase64String(license.RowVersion), usage));

            var status = license.ExpiresAt <= DateTimeOffset.UtcNow ? "Expired" : "Active";
            return Results.Ok(new TenantLicenseView(status, license.LicenseId, policy.Code, license.ExpiresAt,
                policy.MaxUsers, policy.MaxCustomModules, policy.MaxStorageGb,
                new TenantLicenseFeatures(policy.AdvancedWorkflow, policy.CustomModuleSource, policy.HighAvailability),
                Convert.ToBase64String(license.RowVersion), usage));
        });

        group.MapPost("/activate", async (ActivateTenantLicenseRequest request, ClaimsPrincipal user,
            PlatformDbContext db, IConfiguration configuration, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            if (string.IsNullOrWhiteSpace(request.SignedGrant) || request.SignedGrant.Length > 8192)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["signedGrant"] = ["A signed license grant is required."] });
            if (!TryValidateGrant(request.SignedGrant.Trim(), tenantId, configuration, out var grant, out var error))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["signedGrant"] = [error] });

            var policy = LicenseTierCatalog.All[grant.Tier];
            // Membership and module activation writers also use serializable transactions and
            // read this license before enforcing their quotas. Lock the tenant's license first
            // so a downgrade and a quota-consuming write cannot both validate stale state.
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct)
                : null;
            var quotaLockResult = await AcquireTenantQuotaLockAsync(db, tenantId, ct);
            if (quotaLockResult < 0)
                return Results.Conflict(new { error = "Another company license or quota change is in progress. Retry the request.", code = "tenant.concurrent_write" });
            var current = db.Database.IsSqlServer()
                ? await db.TenantLicenses.FromSqlInterpolated($"SELECT * FROM [dbo].[TenantLicenses] WITH (XLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId}").SingleOrDefaultAsync(ct)
                : await db.TenantLicenses.SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);

            if (current is not null)
            {
                if (!TryDecodeVersion(request.RowVersion, out var version)
                    || !CryptographicOperations.FixedTimeEquals(version, current.RowVersion))
                    return Results.Conflict(new { error = "The current license version is required to replace this license.", rowVersion = Convert.ToBase64String(current.RowVersion) });
                db.Entry(current).Property(x => x.RowVersion).OriginalValue = version;
            }
            else if (!string.IsNullOrWhiteSpace(request.RowVersion))
                return Results.Conflict(new { error = "The license changed concurrently. Reload the page and try again." });

            var userCount = await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId, ct);
            if (userCount > policy.MaxUsers)
                return Results.Conflict(new { error = $"Bu firmada {userCount} kullanıcı var; {policy.Code} paketi en fazla {policy.MaxUsers} kullanıcı destekliyor.", code = "license.user_limit", limit = policy.MaxUsers, activeCount = userCount, tier = policy.Code });
            var moduleCount = await db.TenantModuleActivations.CountAsync(x => x.TenantId == tenantId, ct);
            if (moduleCount > policy.MaxCustomModules)
                return Results.Conflict(new { error = $"Bu firmada {moduleCount} özel modül etkin; {policy.Code} paketi en fazla {policy.MaxCustomModules} özel modül destekliyor.", code = "license.module_limit", limit = policy.MaxCustomModules, activeCount = moduleCount, tier = policy.Code });

            if (await db.TenantLicenses.AnyAsync(x => x.LicenseId == grant.LicenseId && x.TenantId != tenantId, ct))
                return Results.Conflict(new { error = "This license is already activated for another company." });
            if (current is null)
            {
                current = new TenantLicense { TenantId = tenantId };
                db.TenantLicenses.Add(current);
            }

            current.LicenseId = grant.LicenseId;
            current.Tier = policy.Code;
            current.MaxUsers = policy.MaxUsers;
            current.MaxCustomModules = policy.MaxCustomModules;
            current.MaxStorageGb = policy.MaxStorageGb;
            current.IssuedAt = grant.IssuedAt;
            current.ExpiresAt = grant.ExpiresAt;
            current.ActivatedAt = DateTimeOffset.UtcNow;
            current.GrantSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.SignedGrant.Trim())));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "tenant-license.activated",
                Resource = $"{policy.Code}:{grant.LicenseId:D}:{grant.ExpiresAt:O}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "The license changed concurrently. Reload the page and try again." }); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "The license or its usage changed concurrently. Reload the page and try again." }); }
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(new TenantLicenseView("Active", current.LicenseId, policy.Code, current.ExpiresAt,
                current.MaxUsers, current.MaxCustomModules, current.MaxStorageGb,
                new TenantLicenseFeatures(policy.AdvancedWorkflow, policy.CustomModuleSource, policy.HighAvailability),
                Convert.ToBase64String(current.RowVersion), new TenantLicenseUsage(userCount, moduleCount)));
        });
    }

    public static async Task<int> AcquireTenantQuotaLockAsync(PlatformDbContext db, Guid tenantId, CancellationToken ct)
    {
        if (!db.Database.IsSqlServer()) return 0;
        var transaction = db.Database.CurrentTransaction
            ?? throw new InvalidOperationException("A tenant quota lock requires an active database transaction.");
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        command.CommandText = "DECLARE @lockResult int; EXEC @lockResult = sys.sp_getapplock @Resource = @resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000; SELECT @lockResult;";
        var resource = command.CreateParameter();
        resource.ParameterName = "@resource";
        resource.DbType = DbType.String;
        resource.Size = 255;
        resource.Value = $"Nexora:TenantQuota:{tenantId:N}";
        command.Parameters.Add(resource);
        var result = await command.ExecuteScalarAsync(ct);
        return Convert.ToInt32(result, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static async Task<long?> ReadTenantSqlDataBytesAsync(TenantDbContext db, CancellationToken ct)
    {
        // TenantDbContext is routed to the selected company's dedicated database. This
        // reports allocated SQL data pages only; it is not a write-time quota or file-store meter.
        if (!db.Database.IsSqlServer()) return null;
        var wasClosed = db.Database.GetDbConnection().State != ConnectionState.Open;
        if (wasClosed) await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "SELECT COALESCE(SUM(CONVERT(bigint, FILEPROPERTY([name], 'SpaceUsed')) * CONVERT(bigint, 8192)), CONVERT(bigint, 0)) FROM sys.database_files WHERE [type_desc] = N'ROWS';";
            var result = await command.ExecuteScalarAsync(ct);
            return result is null or DBNull ? null : Convert.ToInt64(result, System.Globalization.CultureInfo.InvariantCulture);
        }
        finally
        {
            if (wasClosed) await db.Database.CloseConnectionAsync();
        }
    }

    private static bool TryValidateGrant(string token, Guid tenantId, IConfiguration configuration,
        out SignedLicenseGrant grant, out string error)
    {
        grant = null!;
        error = "The license grant is invalid.";
        var parts = token.Split('.', StringSplitOptions.None);
        if (parts.Length != 3 || parts.Any(string.IsNullOrWhiteSpace)) return false;
        try
        {
            var keyId = parts[0];
            if (keyId.Length > 80 || keyId.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))) return false;
            var pem = configuration[$"Licensing:PublicKeys:{keyId}"];
            if (string.IsNullOrWhiteSpace(pem)) { error = "The license issuer key is not configured on this server."; return false; }
            var payload = DecodeBase64Url(parts[1]);
            var signature = DecodeBase64Url(parts[2]);
            using var rsa = RSA.Create();
            rsa.ImportFromPem(pem);
            if (!rsa.VerifyData(Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}"), signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) return false;
            grant = JsonSerializer.Deserialize<SignedLicenseGrant>(payload, JsonOptions)!;
            if (grant is null || grant.SchemaVersion != 1 || grant.TenantId != tenantId || grant.LicenseId == Guid.Empty
                || !LicenseTierCatalog.TryGet(grant.Tier, out _) || grant.IssuedAt > DateTimeOffset.UtcNow.AddMinutes(5)
                || grant.ExpiresAt <= DateTimeOffset.UtcNow || grant.ExpiresAt <= grant.IssuedAt)
            { error = "The grant is expired, not yet valid, for another company, or contains unsupported license details."; return false; }
            return true;
        }
        catch (Exception exception) when (exception is FormatException or JsonException or CryptographicException or ArgumentException)
        {
            return false;
        }
    }

    private static byte[] DecodeBase64Url(string value)
    {
        var text = value.Replace('-', '+').Replace('_', '/');
        text += (text.Length % 4) switch { 0 => "", 2 => "==", 3 => "=", _ => throw new FormatException("Invalid base64url value.") };
        return Convert.FromBase64String(text);
    }

    private static bool TryTenant(ClaimsPrincipal user, out Guid tenantId) => Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
    private static Guid? UserId(ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue("sub"), out var id) ? id : null;
    private static bool TryDecodeVersion(string? value, out byte[] bytes)
    {
        try { bytes = string.IsNullOrWhiteSpace(value) ? [] : Convert.FromBase64String(value); return bytes.Length == 8; }
        catch (FormatException) { bytes = []; return false; }
    }

    private sealed record SignedLicenseGrant(int SchemaVersion, Guid LicenseId, Guid TenantId, string Tier,
        DateTimeOffset IssuedAt, DateTimeOffset ExpiresAt);
}

public sealed record ActivateTenantLicenseRequest(string SignedGrant, string? RowVersion);
public sealed record TenantLicenseFeatures(bool AdvancedWorkflow, bool CustomModuleSource, bool HighAvailability);
public sealed record TenantLicenseView(string Status, Guid? LicenseId, string? Tier, DateTimeOffset? ExpiresAt,
    int? MaxUsers, int? MaxCustomModules, int? MaxStorageGb, TenantLicenseFeatures? Features = null,
    string? RowVersion = null, TenantLicenseUsage? Usage = null);
public sealed record TenantLicenseUsage(int Users, int CustomModules, long? SqlDataBytes = null);
