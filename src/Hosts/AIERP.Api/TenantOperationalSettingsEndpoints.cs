using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class TenantOperationalSettingsEndpoints
{
    public static void MapTenantOperationalSettingsEndpoints(this WebApplication app)
    {
        var settings = app.MapGroup("/api/tenant-settings/operations").WithTags("Firma ayarları").RequireAuthorization();

        settings.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var row = await db.TenantOperationalSettings.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
            return Results.Ok(new TenantOperationalSettingsView(tenantId, row?.AllowNegativeStock ?? false,
                row?.UpdatedByUserId, row?.UpdatedAt, row is null ? null : Convert.ToBase64String(row.RowVersion)));
        });

        settings.MapPut("/", async (TenantOperationalSettingsUpdate request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || user.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            var row = await db.TenantOperationalSettings.SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
            if (row is null)
            {
                row = new TenantOperationalSettings { TenantId = tenantId };
                db.TenantOperationalSettings.Add(row);
            }
            else if (!TryDecodeVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Firma ayarlarını güncellemek için güncel kayıt sürümü gerekli.", rowVersion = Convert.ToBase64String(row.RowVersion) });
            else db.Entry(row).Property(x => x.RowVersion).OriginalValue = version;

            var previousValue = row.AllowNegativeStock;
            row.AllowNegativeStock = request.AllowNegativeStock;
            row.UpdatedByUserId = userId;
            row.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "tenant-settings.operations.updated", Resource = $"allowNegativeStock:{previousValue}->{row.AllowNegativeStock}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new { error = "Firma ayarları başka bir kullanıcı tarafından değiştirildi. Sayfayı yenileyin." });
            }
            return Results.Ok(new TenantOperationalSettingsView(tenantId, row.AllowNegativeStock, row.UpdatedByUserId,
                row.UpdatedAt, Convert.ToBase64String(row.RowVersion)));
        });
    }

    internal static async Task<bool> AllowsNegativeStockAsync(TenantDbContext db, Guid tenantId, CancellationToken ct = default)
    {
        var settings = db.TenantOperationalSettings.AsNoTracking();
        if (db.Database.IsSqlServer())
        {
            // Posting callers hold an explicit transaction. HOLDLOCK keeps the setting row (or
            // its missing-key range) stable until the stock movement commits, so an admin toggle
            // cannot commit between the policy read and the inventory write.
            settings = db.TenantOperationalSettings
                .FromSqlInterpolated($"SELECT * FROM [dbo].[TenantOperationalSettings] WITH (HOLDLOCK) WHERE [TenantId] = {tenantId}")
                .AsNoTracking();
        }
        return await settings.Where(x => x.TenantId == tenantId)
            .Select(x => (bool?)x.AllowNegativeStock).SingleOrDefaultAsync(ct) ?? false;
    }

    internal static bool CanPostNegativeBalance(bool allowNegativeStock, decimal activeReservedQuantity,
        InventoryTrackingMode trackingMode, bool hasStorageLocation) =>
        allowNegativeStock && activeReservedQuantity <= 0m && trackingMode == InventoryTrackingMode.None && !hasStorageLocation;

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }

    private static bool TryDecodeVersion(string? value, out byte[] bytes)
    {
        try { bytes = string.IsNullOrWhiteSpace(value) ? [] : Convert.FromBase64String(value); return bytes.Length == 8; }
        catch (FormatException) { bytes = []; return false; }
    }
}

public sealed record TenantOperationalSettingsUpdate(bool AllowNegativeStock, string? RowVersion);
public sealed record TenantOperationalSettingsView(Guid TenantId, bool AllowNegativeStock, Guid? UpdatedByUserId,
    DateTimeOffset? UpdatedAt, string? RowVersion);
