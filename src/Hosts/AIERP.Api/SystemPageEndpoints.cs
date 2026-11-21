using System.Data;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// System pages: standard ERP screens served from a declarative standard definition, or from the firm's own design (an
/// ordinary custom-page row with code <c>@&lt;screenKey&gt;</c>). Firm designs are written only by a verified TenantAdmin;
/// a published firm design is never rewritten by the server.
/// </summary>
internal static class SystemPageEndpoints
{
    private const string NotFoundText = "Sistem sayfası bulunamadı.";
    private const string StaleDraftText = "Taslak güncel değil. Son sürümü yeniden yükleyin.";
    private const string Customizations = "erp.tenant-customizations";
    private const string Runtime = "erp.custom-menus";

    /// <summary>The standard set (embedded unless replaced) and the version bound for <c>PUT /api/custom-pages/{id}</c>.</summary>
    public static IServiceCollection AddSystemPages(this IServiceCollection services)
    {
        services.TryAddSingleton<ISystemPageStandardSet, EmbeddedSystemPageStandardSet>();
        services.TryAddSingleton<ISystemPageVersionSource, StandardSetVersionSource>();
        return services;
    }

    public static void MapSystemPageEndpoints(this WebApplication app)
    {
        var pages = app.MapGroup("/api/system-pages").WithTags("Tenant System Pages").RequireAuthorization();

        pages.MapGet("", async (ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb, ISystemPageStandardSet standards,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct, Customizations)) return Results.Forbid();
            var rows = await db.TenantCustomPages.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.ScreenKey != null && !x.IsArchived)
                .Select(x => new { x.Id, x.ScreenKey, x.IsPublished, x.StandardVersion, x.DefinitionJson }).ToListAsync(ct);
            var canEdit = await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct);
            var items = standards.All.OrderBy(x => x.Module, StringComparer.Ordinal).ThenBy(x => x.Title, StringComparer.Ordinal).Select(standard =>
            {
                var draft = rows.FirstOrDefault(x => x.ScreenKey == standard.ScreenKey && !x.IsPublished);
                var published = rows.FirstOrDefault(x => x.ScreenKey == standard.ScreenKey && x.IsPublished);
                var design = draft ?? published;
                var newItemCount = design is null ? 0
                    : SystemPageMerge.NewItems(standard, design.DefinitionJson, design.StandardVersion ?? standard.Version).Count;
                return new SystemPageSummary(standard.ScreenKey, standard.Title, standard.Description, standard.Module, standard.Version,
                    standard.Stage, standard.ScreenViews.Select(x => x.Key).Distinct(StringComparer.Ordinal).ToArray(), draft?.Id, published?.Id,
                    design?.StandardVersion, newItemCount, canEdit);
            }).ToArray();
            return Results.Ok(items);
        });

        // The ERP runtime map: a published firm design overrides; without one an enabled standard is served. Drafts never count.
        pages.MapGet("/runtime", async (ClaimsPrincipal user, TenantDbContext db, ISystemPageStandardSet standards, IConfiguration configuration,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct, Runtime)) return Results.Forbid();
            var published = await db.TenantCustomPages.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.ScreenKey != null && x.IsPublished)
                .Select(x => new { ScreenKey = x.ScreenKey!, x.Revision }).ToListAsync(ct);
            var screens = new SortedDictionary<string, SystemPageRuntimeScreen>(StringComparer.Ordinal);
            foreach (var row in published.Where(x => standards.TryGet(x.ScreenKey, out _)))
                screens[row.ScreenKey] = new SystemPageRuntimeScreen("override", row.Revision);
            foreach (var key in EnabledStandards(configuration))
                if (!screens.ContainsKey(key) && standards.TryGet(key, out var standard))
                    screens[key] = new SystemPageRuntimeScreen("standard", standard.Version);
            // Alias screens (e.g. customer-edit) open their standard's screen while that screen is served as a system page.
            var aliases = new SortedDictionary<string, SystemPageRuntimeAlias>(StringComparer.Ordinal);
            foreach (var standard in standards.All.Where(x => screens.ContainsKey(x.ScreenKey)))
                foreach (var alias in standard.Aliases)
                    aliases[alias.Key] = new SystemPageRuntimeAlias(standard.ScreenKey, alias.Param);
            return Results.Ok(new SystemPageRuntimeMap(screens, aliases));
        });

        // Runtime definition: the published firm design, else the enabled standard. Query SQL is never sent to the runtime.
        pages.MapGet("/{screenKey}/published", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            ISystemPageStandardSet standards, IConfiguration configuration, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct, Runtime)) return Results.Forbid();
            if (!standards.TryGet(screenKey, out var standard)) return NotFound();
            var code = SystemPageCodes.CodeFor(standard.ScreenKey);
            var page = await db.TenantCustomPages.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.Code == code && x.IsPublished, ct);
            if (page is not null)
            {
                var rights = await CustomPageAccess.GetRightsAsync(platformDb, tenant, page.Code,
                    CustomPageAccess.RestrictsMembersWithoutRow(page.Code, page.DefinitionJson), userId, role, ct);
                if (!rights.View) return TenantCustomPageEndpoints.ViewForbidden();
                var forms = await TenantCustomPageEndpoints.LoadEmbeddedFormsAsync(db, tenant, page.DefinitionJson, ct);
                return Results.Ok(new SystemPagePublished(page.Id, page.Code, page.Name, page.Description, page.Revision,
                    TenantCustomPageQueries.WithoutQuerySql(page.DefinitionJson), forms, RuntimeRights(rights, page.DefinitionJson),
                    standard.ScreenKey, "override", page.StandardVersion));
            }
            if (!EnabledStandards(configuration).Contains(standard.ScreenKey)) return NotFound();
            // A standard has no SQL and no access row of its own: every member may view it, and so (RuntimeRights) write
            // through its ERP operations, which the ERP endpoints authorize.
            var isMember = await platformDb.TenantMemberships.AsNoTracking().AnyAsync(x => x.TenantId == tenant && x.UserId == userId, ct);
            if (!isMember) return TenantCustomPageEndpoints.ViewForbidden();
            return Results.Ok(new SystemPagePublished(SystemPageStandards.SyntheticId(standard.ScreenKey), code, standard.Title, standard.Description,
                standard.Version, standard.DefinitionJson, [], RuntimeRights(new CustomPageRights(true, false, false, false), standard.DefinitionJson),
                standard.ScreenKey, "standard", standard.Version));
        });

        // "Tasarımcıda aç": the open draft, else a new one (from the published design, or from the standard).
        pages.MapPost("/{screenKey}/draft", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            ISystemPageStandardSet standards, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)) return Results.Forbid();
            if (!standards.TryGet(screenKey, out var standard)) return NotFound();
            if (!await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct)) return TenantCustomPageEndpoints.SystemRowForbidden();
            if (!await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "create", ct, Customizations)) return Results.Forbid();
            var code = SystemPageCodes.CodeFor(standard.ScreenKey);

            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            // Archived rows count too: the screen-view import runs only for the very first design of the screen.
            var rows = await db.TenantCustomPages.Where(x => x.TenantId == tenant && x.Code == code).ToListAsync(ct);
            var open = rows.FirstOrDefault(x => !x.IsPublished && !x.IsArchived);
            if (open is not null)
            {
                TenantCustomPageEndpoints.AddAudit(db, tenant, userId, "system-page.draft-opened", code);
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                return Results.Ok(DraftView(open, []));
            }
            var published = rows.FirstOrDefault(x => x.IsPublished);
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantCustomPage
            {
                TenantId = tenant, Code = code, ScreenKey = standard.ScreenKey, Name = standard.Title, Description = standard.Description,
                Revision = 1, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            IReadOnlyList<string> notes = [];
            string changeKind;
            if (published is not null)
            {
                draft.DefinitionJson = published.DefinitionJson;
                draft.StandardVersion = published.StandardVersion;
                changeKind = "DraftCreated";
            }
            else
            {
                draft.DefinitionJson = standard.DefinitionJson;
                draft.StandardVersion = standard.Version;
                changeKind = "CreatedFromStandard";
                if (rows.Count == 0)
                {
                    var import = SystemPageMerge.ImportScreenViews(standard, await PublishedScreenViewsAsync(db, tenant, standard, ct));
                    draft.DefinitionJson = import.DefinitionJson;
                    notes = import.Notes;
                }
            }
            db.TenantCustomPages.Add(draft);
            db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(draft, userId, changeKind));
            TenantCustomPageEndpoints.AddAudit(db, tenant, userId, "system-page.draft-created", code);
            try
            {
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            }
            catch (DbUpdateException)
            {
                // A concurrent "Tasarımcıda aç" won the per-code draft index: answer with its draft.
                var winner = await WinnerDraftAsync(db, transaction, tenant, code, ct);
                if (winner is null) throw;
                return Results.Ok(DraftView(winner, []));
            }
            return Results.Created($"/api/custom-pages/{draft.Id}", DraftView(draft, notes));
        });

        // "Standarda dön": the open draft (or a new one) gets the current standard definition. Nothing is imported.
        pages.MapPost("/{screenKey}/reset", async (string screenKey, SystemPageResetRequest? request, ClaimsPrincipal user, TenantDbContext db,
            PlatformDbContext platformDb, ISystemPageStandardSet standards, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)) return Results.Forbid();
            if (!standards.TryGet(screenKey, out var standard)) return NotFound();
            if (!await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct)) return TenantCustomPageEndpoints.SystemRowForbidden();
            if (!await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "update", ct, Customizations)) return Results.Forbid();
            var code = SystemPageCodes.CodeFor(standard.ScreenKey);

            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var now = DateTimeOffset.UtcNow;
            var draft = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Code == code && !x.IsPublished && !x.IsArchived, ct);
            if (draft is not null)
            {
                if (request?.ExpectedRevision != draft.Revision) return Results.Conflict(new { error = StaleDraftText, currentRevision = draft.Revision });
                draft.DefinitionJson = standard.DefinitionJson;
                draft.StandardVersion = standard.Version;
                draft.Revision++; draft.UpdatedByUserId = userId; draft.UpdatedAt = now;
            }
            else
            {
                draft = new TenantCustomPage
                {
                    TenantId = tenant, Code = code, ScreenKey = standard.ScreenKey, Name = standard.Title, Description = standard.Description,
                    DefinitionJson = standard.DefinitionJson, StandardVersion = standard.Version, Revision = 1,
                    CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
                };
                db.TenantCustomPages.Add(draft);
            }
            db.TenantCustomPageRevisions.Add(TenantCustomPageEndpoints.RevisionOf(draft, userId, "ResetToStandard"));
            TenantCustomPageEndpoints.AddAudit(db, tenant, userId, "system-page.reset", code);
            try
            {
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            }
            catch (DbUpdateException)
            {
                // A concurrent writer created or changed the draft; the caller reloads it.
                if (await WinnerDraftAsync(db, transaction, tenant, code, ct) is null) throw;
                return Results.Conflict(new { error = StaleDraftText });
            }
            return Results.Ok(TenantCustomPageEndpoints.ToDetail(draft));
        });

        // "Yeni": standard items the firm design lacks, against the open draft or else the published design.
        pages.MapGet("/{screenKey}/new-items", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, ISystemPageStandardSet standards,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct, Customizations)) return Results.Forbid();
            if (!standards.TryGet(screenKey, out var standard)) return NotFound();
            var code = SystemPageCodes.CodeFor(standard.ScreenKey);
            var design = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code && !x.IsArchived)
                .OrderBy(x => x.IsPublished).Select(x => new { x.DefinitionJson, x.StandardVersion }).FirstOrDefaultAsync(ct);
            if (design is null) return Results.Ok(new SystemPageNewItems(standard.Version, standard.Version, []));
            var baseVersion = design.StandardVersion ?? standard.Version;
            return Results.Ok(new SystemPageNewItems(standard.Version, baseVersion, OfferedItems(standard, design.DefinitionJson, baseVersion)));
        });

        // Revisions of every row of the screen (publish and restore open new rows), newest first.
        pages.MapGet("/{screenKey}/history", async (string screenKey, ClaimsPrincipal user, TenantDbContext db, ISystemPageStandardSet standards,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TenantCustomPageEndpoints.TryContext(user, out var tenant, out var userId, out var role)
                || !await TenantCustomPageEndpoints.Allowed(auth, tenant, userId, role, "read", ct, Customizations)) return Results.Forbid();
            if (!standards.TryGet(screenKey, out var standard)) return NotFound();
            var code = SystemPageCodes.CodeFor(standard.ScreenKey);
            var revisions = await db.TenantCustomPageRevisions.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code)
                .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Revision)
                .Select(x => new SystemPageRevision(x.Id, x.Revision, x.Code, x.Name, x.Description, x.ChangeKind, x.ChangedByUserId, x.CreatedAt,
                    x.DefinitionJson, x.CustomPageId)).ToListAsync(ct);
            if (!await TenantCustomPageEndpoints.QuerySqlVisibleAsync(http, tenant, userId, role, ct, [.. revisions.Select(x => x.DefinitionJson)]))
                revisions = revisions.Select(x => x with { DefinitionJson = TenantCustomPageQueries.WithoutQuerySql(x.DefinitionJson) }).ToList();
            return Results.Ok(revisions);
        });
    }

    /// <summary>
    /// The "Yeni" items (<see cref="SystemPageMerge.NewItems"/>) plus, transitively, every absent item they require. A
    /// required item the firm deleted (<c>since ≤ base</c>) is never offered on its own; it comes along only so the
    /// offered item can be added with it.
    /// </summary>
    internal static IReadOnlyList<SystemPageNewItem> OfferedItems(SystemPageStandard standard, string designJson, int baseVersion)
    {
        var offered = SystemPageMerge.NewItems(standard, designJson, baseVersion).ToList();
        var keys = offered.Select(x => x.Key).ToHashSet(StringComparer.Ordinal);
        var absent = SystemPageMerge.NewItems(standard, designJson, 0).ToDictionary(x => x.Key, StringComparer.Ordinal);
        var pending = new Queue<string>(offered.SelectMany(x => x.Requires));
        while (pending.TryDequeue(out var key))
        {
            if (!absent.TryGetValue(key, out var item) || !keys.Add(key)) continue;
            offered.Add(item);
            foreach (var required in item.Requires) pending.Enqueue(required);
        }
        return offered;
    }

    private static IReadOnlySet<string> EnabledStandards(IConfiguration configuration) =>
        (configuration.GetSection("SystemPages:StandardEnabled").Get<string[]>() ?? []).ToHashSet(StringComparer.Ordinal);

    private static async Task<IReadOnlyDictionary<string, IReadOnlyList<ScreenViewFieldState>>> PublishedScreenViewsAsync(TenantDbContext db,
        Guid tenant, SystemPageStandard standard, CancellationToken ct)
    {
        var views = new Dictionary<string, IReadOnlyList<ScreenViewFieldState>>(StringComparer.Ordinal);
        foreach (var key in standard.ScreenViews.Select(x => x.Key).Distinct(StringComparer.Ordinal))
            if (await TenantScreenViewEndpoints.ReadPublishedFieldStatesAsync(db, tenant, key, ct) is { } fields) views[key] = fields;
        return views;
    }

    /// <summary>After a failed write: rolls back, forgets the pending entities and reads the open draft another request committed.</summary>
    private static async Task<TenantCustomPage?> WinnerDraftAsync(TenantDbContext db, Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction,
        Guid tenant, string code, CancellationToken ct)
    {
        try { await transaction.RollbackAsync(ct); }
        catch (InvalidOperationException) { } // Already rolled back by the server (e.g. a deadlock victim).
        db.ChangeTracker.Clear();
        return await db.TenantCustomPages.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.Code == code && !x.IsPublished && !x.IsArchived, ct);
    }

    private static IResult NotFound() => Results.NotFound(new { error = NotFoundText });

    /// <summary>
    /// Runtime page rights of a system page. Without SQL queries the page-level write rights equal the view right: they are
    /// UX gates only, and every ERP operation is authorized by its own endpoint with the user's token (Proje 1 decision 3).
    /// A definition with any SQL query (or a malformed query entry, see <see cref="TenantCustomPageQueries.HasSqlQueries"/>)
    /// keeps the access rules unchanged, because page write rights gate the SQL writes run by the server. Fails closed: an
    /// unparseable definition counts as one with SQL and is never widened.
    /// </summary>
    internal static CustomPageRightsView RuntimeRights(CustomPageRights rights, string definitionJson) =>
        !IsParseableJson(definitionJson) || TenantCustomPageQueries.HasSqlQueries(definitionJson)
            ? CustomPageRightsView.From(rights)
            : new CustomPageRightsView(rights.View, rights.View, rights.View, rights.View);

    /// <summary>Whether the definition parses with the same options as <see cref="TenantCustomPageQueries.HasSqlQueries"/>.</summary>
    private static bool IsParseableJson(string definitionJson)
    {
        try
        {
            using var _ = System.Text.Json.JsonDocument.Parse(definitionJson, new System.Text.Json.JsonDocumentOptions { MaxDepth = 16 });
            return true;
        }
        catch (System.Text.Json.JsonException) { return false; }
    }

    private static SystemPageDraft DraftView(TenantCustomPage x, IReadOnlyList<string> notes) => new(x.Id, x.Code, x.Name, x.Description, x.Revision,
        x.IsPublished, x.IsArchived, x.DefinitionJson, x.UpdatedAt, x.ScreenKey, x.StandardVersion, notes);

    private sealed class StandardSetVersionSource(ISystemPageStandardSet standards) : ISystemPageVersionSource
    {
        public int? CurrentVersion(string screenKey) => standards.TryGet(screenKey, out var standard) ? standard.Version : null;
    }

    internal sealed record SystemPageResetRequest(int? ExpectedRevision);
    private sealed record SystemPageSummary(string ScreenKey, string Title, string? Description, string Module, int Version, string Stage,
        IReadOnlyList<string> ScreenViewKeys, Guid? DraftId, Guid? PublishedId, int? StandardVersion, int NewItemCount, bool CanEdit);
    private sealed record SystemPageRuntimeScreen(string Mode, int Revision);
    private sealed record SystemPageRuntimeAlias(string ScreenKey, string Param);
    private sealed record SystemPageRuntimeMap(IReadOnlyDictionary<string, SystemPageRuntimeScreen> Screens,
        IReadOnlyDictionary<string, SystemPageRuntimeAlias> Aliases);
    private sealed record SystemPagePublished(Guid Id, string Code, string Name, string? Description, int Revision, string DefinitionJson,
        IReadOnlyList<TenantCustomPageEndpoints.EmbeddedForm> Forms, CustomPageRightsView Rights, string ScreenKey, string Source, int? StandardVersion);
    private sealed record SystemPageDraft(Guid Id, string Code, string Name, string? Description, int Revision, bool IsPublished, bool IsArchived,
        string DefinitionJson, DateTimeOffset UpdatedAt, string? ScreenKey, int? StandardVersion, IReadOnlyList<string> ImportNotes);
    private sealed record SystemPageNewItems(int StandardVersion, int BaseVersion, IReadOnlyList<SystemPageNewItem> Items);
    private sealed record SystemPageRevision(Guid Id, int Revision, string Code, string Name, string? Description, string ChangeKind,
        Guid ChangedByUserId, DateTimeOffset CreatedAt, string DefinitionJson, Guid CustomPageId);
}
