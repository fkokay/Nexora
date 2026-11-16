using System.Security.Claims;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Per-user access to tenant custom pages. Settings are keyed by page code in the Platform database, so
/// they apply to every draft/published row with that code and take effect as soon as they are saved.
/// </summary>
internal static class CustomPageAccessEndpoints
{
    private const int MaxSelectedUsers = 200;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void MapCustomPageAccessEndpoints(this WebApplication app)
    {
        var pages = app.MapGroup("/api/custom-pages").WithTags("Tenant Custom Pages").RequireAuthorization();

        pages.MapGet("/{code}/access", async (string code, ClaimsPrincipal user, PlatformDbContext platformDb,
            TenantDbContext tenantDb, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenant, out _)) return Results.Forbid();
            if (!TenantCustomPageEndpoints.ValidCode(code)) return Results.BadRequest(new { error = "Sayfa kodu geçersiz." });
            var pageCode = await FindPageCodeAsync(tenantDb, tenant, code, ct);
            if (pageCode is null) return Results.NotFound();
            var access = await platformDb.TenantCustomPageAccesses.AsNoTracking().Include(x => x.Users)
                .SingleOrDefaultAsync(x => x.TenantId == tenant && x.PageCode == pageCode, ct);
            return Results.Ok(await ToViewAsync(platformDb, tenant, pageCode, access, ct));
        });

        pages.MapPut("/{code}/access", async (string code, CustomPageAccessRequest? request, ClaimsPrincipal user,
            PlatformDbContext platformDb, TenantDbContext tenantDb, CancellationToken ct) =>
        {
            if (!TryAdminContext(user, out var tenant, out var userId)) return Results.Forbid();
            if (!TenantCustomPageEndpoints.ValidCode(code)) return Results.BadRequest(new { error = "Sayfa kodu geçersiz." });
            if (request is null) return Results.BadRequest(new { error = "İstek gövdesi gerekli." });
            var pageCode = await FindPageCodeAsync(tenantDb, tenant, code, ct);
            if (pageCode is null) return Results.NotFound();

            var mode = request.Mode?.Trim();
            if (!CustomPageAccessModes.IsKnown(mode)) return Results.BadRequest(new { error = "Erişim modu geçersiz." });
            // Only SelectedUsers keeps a user list; only AllUsers keeps shared write flags.
            var requestedUsers = mode == CustomPageAccessModes.SelectedUsers ? request.Users ?? [] : [];
            var allUsersMode = mode == CustomPageAccessModes.AllUsers;
            if (requestedUsers.Count > MaxSelectedUsers)
                return Results.BadRequest(new { error = $"En fazla {MaxSelectedUsers} kullanıcı seçilebilir." });
            if (requestedUsers.Select(x => x.UserId).Distinct().Count() != requestedUsers.Count)
                return Results.BadRequest(new { error = "Bir kullanıcı listede yalnız bir kez yer alabilir." });
            if (requestedUsers.Any(x => !x.CanView && (x.CanInsert || x.CanUpdate || x.CanDelete)))
                return Results.BadRequest(new { error = "Ekleme, güncelleme veya silme yetkisi için görüntüleme yetkisi de verilmelidir." });
            var requestedIds = requestedUsers.Select(x => x.UserId).ToArray();
            if (requestedIds.Length > 0)
            {
                var memberCount = await platformDb.TenantMemberships.CountAsync(x => x.TenantId == tenant && requestedIds.Contains(x.UserId), ct);
                if (memberCount != requestedIds.Length)
                    return Results.BadRequest(new { error = "Seçilen kullanıcıların tümü bu kiracının üyesi olmalıdır." });
            }

            var access = await platformDb.TenantCustomPageAccesses.Include(x => x.Users)
                .SingleOrDefaultAsync(x => x.TenantId == tenant && x.PageCode == pageCode, ct);
            var currentRevision = access?.Revision ?? 0;
            if (request.ExpectedRevision != currentRevision)
                return Results.Conflict(new { error = "Erişim ayarları başka biri tarafından değiştirildi. Son sürümü yeniden yükleyin.", currentRevision });
            if (access is null)
            {
                access = new TenantCustomPageAccess { TenantId = tenant, PageCode = pageCode };
                platformDb.TenantCustomPageAccesses.Add(access);
            }
            access.Mode = mode!;
            access.AllUsersCanInsert = allUsersMode && request.AllUsersCanInsert;
            access.AllUsersCanUpdate = allUsersMode && request.AllUsersCanUpdate;
            access.AllUsersCanDelete = allUsersMode && request.AllUsersCanDelete;
            access.Revision = currentRevision + 1;
            access.UpdatedByUserId = userId;
            access.UpdatedAt = DateTimeOffset.UtcNow;
            var byUser = requestedUsers.ToDictionary(x => x.UserId);
            foreach (var row in access.Users.Where(x => !byUser.ContainsKey(x.UserId)).ToList()) access.Users.Remove(row);
            foreach (var requested in requestedUsers)
            {
                var row = access.Users.FirstOrDefault(x => x.UserId == requested.UserId);
                if (row is null) access.Users.Add(row = new TenantCustomPageAccessUser { AccessId = access.Id, UserId = requested.UserId });
                row.CanView = requested.CanView; row.CanInsert = requested.CanInsert;
                row.CanUpdate = requested.CanUpdate; row.CanDelete = requested.CanDelete;
            }

            var view = await ToViewAsync(platformDb, tenant, pageCode, access, ct);
            platformDb.TenantCustomPageAccessRevisions.Add(new TenantCustomPageAccessRevision
            {
                TenantId = tenant, PageCode = pageCode, Revision = access.Revision,
                SnapshotJson = JsonSerializer.Serialize(view, JsonOptions), ChangedByUserId = userId, CreatedAt = access.UpdatedAt
            });
            platformDb.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = "custom-page.access-updated", Resource = $"custom-page:{pageCode}" });
            try
            {
                await platformDb.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // A concurrent save won the unique (TenantId, PageCode) or (TenantId, PageCode, Revision) index.
                return Results.Conflict(new { error = "Erişim ayarları başka biri tarafından değiştirildi. Son sürümü yeniden yükleyin." });
            }
            return Results.Ok(view);
        });
    }

    /// <summary>Returns the canonical code of a non-archived page with this code, or null.</summary>
    private static Task<string?> FindPageCodeAsync(TenantDbContext tenantDb, Guid tenant, string code, CancellationToken ct) =>
        tenantDb.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code && !x.IsArchived)
            .Select(x => x.Code).FirstOrDefaultAsync(ct);

    private static async Task<CustomPageAccessView> ToViewAsync(PlatformDbContext platformDb, Guid tenant, string pageCode,
        TenantCustomPageAccess? access, CancellationToken ct)
    {
        if (access is null) return new CustomPageAccessView(pageCode, CustomPageAccessModes.AllUsers, false, false, false, 0, []);
        var rows = access.Users.ToList();
        var ids = rows.Select(x => x.UserId).ToArray();
        // Users whose membership was removed keep their stored row but are neither listed nor granted rights.
        var members = ids.Length == 0 ? [] : await platformDb.TenantMemberships.AsNoTracking()
            .Where(x => x.TenantId == tenant && ids.Contains(x.UserId))
            .Join(platformDb.Users.AsNoTracking(), m => m.UserId, u => u.Id, (m, u) => new { u.Id, u.DisplayName, u.Email })
            .ToListAsync(ct);
        var users = rows.Join(members, r => r.UserId, m => m.Id, (r, m) => new CustomPageAccessUserView(
                r.UserId, m.DisplayName, m.Email, r.CanView, r.CanInsert, r.CanUpdate, r.CanDelete))
            .OrderBy(x => x.DisplayName, StringComparer.CurrentCulture).ThenBy(x => x.Email, StringComparer.Ordinal).ToArray();
        return new CustomPageAccessView(access.PageCode, access.Mode, access.AllUsersCanInsert, access.AllUsersCanUpdate,
            access.AllUsersCanDelete, access.Revision, users);
    }

    private static bool TryAdminContext(ClaimsPrincipal user, out Guid tenant, out Guid userId)
    {
        userId = default;
        return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenant)
            && Guid.TryParse(user.FindFirstValue("sub"), out userId)
            && user.FindFirstValue("role") == "TenantAdmin";
    }
}

/// <summary>Shared rights lookup for every place that serves or lists custom pages.</summary>
internal static class CustomPageAccess
{
    public static async Task<CustomPageRights> GetRightsAsync(PlatformDbContext platformDb, Guid tenantId, string pageCode,
        Guid userId, string role, CancellationToken ct)
    {
        var rights = await GetRightsAsync(platformDb, tenantId, [pageCode], userId, role, ct);
        return rights[pageCode];
    }

    /// <summary>Evaluates rights for several page codes with one membership and one access query.</summary>
    public static async Task<IReadOnlyDictionary<string, CustomPageRights>> GetRightsAsync(PlatformDbContext platformDb, Guid tenantId,
        IReadOnlyCollection<string> pageCodes, Guid userId, string role, CancellationToken ct)
    {
        var codes = pageCodes.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var result = new Dictionary<string, CustomPageRights>(StringComparer.OrdinalIgnoreCase);
        if (codes.Length == 0) return result;
        var isMember = await platformDb.TenantMemberships.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.UserId == userId, ct);
        var isTenantAdmin = role == "TenantAdmin";
        var accesses = !isMember || isTenantAdmin ? [] : await platformDb.TenantCustomPageAccesses.AsNoTracking()
            .Where(x => x.TenantId == tenantId && codes.Contains(x.PageCode))
            .Include(x => x.Users.Where(u => u.UserId == userId))
            .ToListAsync(ct);
        // SQL Server compares codes case-insensitively; match the same way so a casing difference never
        // falls back to the permissive "no access row" default.
        var byCode = accesses.ToDictionary(x => x.PageCode, StringComparer.OrdinalIgnoreCase);
        foreach (var code in codes)
            result[code] = CustomPageAccessRules.Evaluate(byCode.GetValueOrDefault(code), userId, isTenantAdmin, isMember);
        return result;
    }
}

internal sealed record CustomPageAccessView(string PageCode, string Mode, bool AllUsersCanInsert, bool AllUsersCanUpdate,
    bool AllUsersCanDelete, int Revision, IReadOnlyList<CustomPageAccessUserView> Users);
internal sealed record CustomPageAccessUserView(Guid UserId, string DisplayName, string Email, bool CanView, bool CanInsert,
    bool CanUpdate, bool CanDelete);
internal sealed record CustomPageAccessRequest(string? Mode, bool AllUsersCanInsert, bool AllUsersCanUpdate, bool AllUsersCanDelete,
    IReadOnlyList<CustomPageAccessUserRequest>? Users, int ExpectedRevision);
internal sealed record CustomPageAccessUserRequest(Guid UserId, bool CanView, bool CanInsert, bool CanUpdate, bool CanDelete);
