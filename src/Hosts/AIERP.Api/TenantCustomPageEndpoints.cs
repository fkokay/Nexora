using System.Security.Claims;
using System.Text.Json;
using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>Tenant-owned declarative pages. Existing ERP screens continue to use /api/screen-views overlays.</summary>
internal static class TenantCustomPageEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    /// <summary>Revisions that make a definition the published one ("Yayınlar"): a publish, a template migration and its rollback.</summary>
    private static readonly string[] PublicationKinds = ["Published", "TemplateMigrated", "TemplateMigrationRolledBack"];

    public static void MapTenantCustomPageEndpoints(this WebApplication app)
    {
        var pages = app.MapGroup("/api/custom-pages").WithTags("Tenant Custom Pages").RequireAuthorization();

        pages.MapGet("", async (ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var items = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && !x.IsArchived)
                .OrderBy(x => x.Code).ThenByDescending(x => x.IsPublished).ThenByDescending(x => x.UpdatedAt)
                .Select(x => new { x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.UpdatedAt, x.ScreenKey, x.DefinitionJson }).ToListAsync(ct);
            return Results.Ok(items.Select(x =>
            {
                var (template, level) = PageTemplateSummary.Read(x.DefinitionJson);
                return new PageSummary(x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.UpdatedAt, x.ScreenKey, template, level);
            }).ToList());
        });

        // Studio "Yayınlar": open drafts and published history (headers only, never definition JSON/SQL).
        pages.MapGet("/publications", async (int? take, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var limit = Math.Clamp(take ?? 100, 1, 200);
            var drafts = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && !x.IsPublished && !x.IsArchived)
                .OrderByDescending(x => x.UpdatedAt).Take(limit)
                .Select(x => new { x.Id, x.Code, x.Name, x.ScreenKey, x.UpdatedAt, x.UpdatedByUserId }).ToListAsync(ct);
            var published = await (from r in db.TenantCustomPageRevisions.AsNoTracking()
                                   join p in db.TenantCustomPages.AsNoTracking() on r.CustomPageId equals p.Id
                                   where r.TenantId == tenant && p.TenantId == tenant && PublicationKinds.Contains(r.ChangeKind)
                                   orderby r.CreatedAt descending, r.Revision descending
                                   select new { r.CustomPageId, RevisionId = r.Id, r.Revision, r.Code, r.Name, p.ScreenKey, r.CreatedAt, r.ChangedByUserId })
                .Take(limit).ToListAsync(ct);
            // The newest publish per code, regardless of the take window.
            var codes = published.Select(x => x.Code).Distinct().ToList();
            var latest = (await db.TenantCustomPageRevisions.AsNoTracking()
                    .Where(x => x.TenantId == tenant && PublicationKinds.Contains(x.ChangeKind) && codes.Contains(x.Code))
                    .Select(x => new { x.Code, x.Id, x.CreatedAt, x.Revision }).ToListAsync(ct))
                .GroupBy(x => x.Code).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Revision).First().Id);
            var userIds = drafts.Select(x => x.UpdatedByUserId).Concat(published.Select(x => x.ChangedByUserId)).Distinct().ToList();
            var names = await (from m in platformDb.TenantMemberships.AsNoTracking()
                               join u in platformDb.Users.AsNoTracking() on m.UserId equals u.Id
                               where m.TenantId == tenant && userIds.Contains(m.UserId)
                               select new { u.Id, u.DisplayName }).ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
            string? NameOf(Guid id) => names.TryGetValue(id, out var n) ? n : null;
            return Results.Ok(new PublicationsView(
                [.. drafts.Select(x => new PendingPublicationView(x.Id, x.Code, x.Name, x.ScreenKey, x.UpdatedAt, NameOf(x.UpdatedByUserId)))],
                [.. published.Select(x => new PublishedRevisionView(x.CustomPageId, x.RevisionId, x.Revision, x.Code, x.Name, x.ScreenKey, x.CreatedAt, NameOf(x.ChangedByUserId),
                    latest.TryGetValue(x.Code, out var current) && current == x.RevisionId))]));
        });

        pages.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Id == id)
                .Select(x => new PageDetail(x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.DefinitionJson, x.UpdatedAt, x.ScreenKey, x.StandardVersion))
                .SingleOrDefaultAsync(ct);
            if (page is null) return Results.NotFound();
            if (!await QuerySqlVisibleAsync(http, tenant, userId, role, ct, page.DefinitionJson))
                page = page with { DefinitionJson = TenantCustomPageQueries.WithoutQuerySql(page.DefinitionJson) };
            return Results.Ok(page);
        });

        // Studio preview uses the normal ERP runtime against an unpublished draft, without publishing it.
        pages.MapGet("/{id:guid}/preview", async (Guid id, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.Id == id && !x.IsPublished && !x.IsArchived)
                .Select(x => new PageDefinition(x.Id, x.Code, x.Name, x.Description, x.Revision, x.DefinitionJson))
                .SingleOrDefaultAsync(ct);
            if (page is null) return Results.NotFound();
            var rights = await CustomPageAccess.GetRightsAsync(platformDb, tenant, page.Code, CustomPageAccess.RestrictsMembersWithoutRow(page.Code, page.DefinitionJson), userId, role, ct);
            if (!rights.View) return ViewForbidden();
            var embeddedForms = await LoadEmbeddedFormsAsync(db, tenant, page.DefinitionJson, ct);
            return Results.Ok(new PublishedPage(page.Id, page.Code, page.Name, page.Description, page.Revision, await RuntimeDefinitionAsync(db, tenant, page.DefinitionJson, ct), embeddedForms, CustomPageRightsView.From(rights)));
        });

        // Designer canvas: a sample record key for a Kayıt kartı draft (CustomPageQueryEndpoints.SampleParamsAsync), gated
        // like GET /preview; the source runs only for verified TenantAdmins (others get {}). Anything short of authorization ("no source", "no row", a failed run) answers { params: {} }.
        pages.MapGet("/{id:guid}/preview/sample-params", async (Guid id, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking()
                .Where(x => x.TenantId == tenant && x.Id == id && !x.IsPublished && !x.IsArchived)
                .Select(x => new { x.Code, x.DefinitionJson })
                .SingleOrDefaultAsync(ct);
            if (page is null) return Results.NotFound();
            var rights = await CustomPageAccess.GetRightsAsync(platformDb, tenant, page.Code, CustomPageAccess.RestrictsMembersWithoutRow(page.Code, page.DefinitionJson), userId, role, ct);
            if (!rights.View) return ViewForbidden();
            // Running the catalog source is a preview query run, which is limited to verified TenantAdmins
            // (POST /{id}/preview/queries/{queryId}/run). Other viewers get no sample, so the canvas still renders.
            if (await CustomPageAccessEndpoints.AdminContextAsync(user, platformDb, ct) is null) return Results.Ok(new { @params = new Dictionary<string, string>() });
            var sample = await CustomPageQueryEndpoints.SampleParamsAsync(page.Code, page.DefinitionJson, tenant, userId, db, platformDb, http, ct);
            return Results.Ok(new { @params = sample });
        }).RequireRateLimiting(CustomPageQueryEndpoints.PreviewRateLimitPolicy);

        // Runtime consumers receive only the currently published declarative definition. Query SQL is never sent to the
        // runtime (queries run by id); the admin designer reads the full definition through GET /{id}.
        pages.MapGet("/{code}/published", async (string code, ClaimsPrincipal user, TenantDbContext db, PlatformDbContext platformDb,
            IPlatformPermissionAuthorizer auth, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct, "erp.custom-menus")) return Results.Forbid();
            var page = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code && x.IsPublished && x.ScreenKey == null)
                .Select(x => new PageDefinition(x.Id, x.Code, x.Name, x.Description, x.Revision, x.DefinitionJson)).SingleOrDefaultAsync(ct);
            if (page is null) return Results.NotFound();
            // Rights are keyed by the stored page code, never by the route value's casing.
            var rights = await CustomPageAccess.GetRightsAsync(platformDb, tenant, page.Code, CustomPageAccess.RestrictsMembersWithoutRow(page.Code, page.DefinitionJson), userId, role, ct);
            if (!rights.View) return ViewForbidden();
            var embeddedForms = await LoadEmbeddedFormsAsync(db, tenant, page.DefinitionJson, ct);
            return Results.Ok(new PublishedPage(page.Id, page.Code, page.Name, page.Description, page.Revision, await RuntimeDefinitionAsync(db, tenant, page.DefinitionJson, ct), embeddedForms, CustomPageRightsView.From(rights)));
        });

        pages.MapPost("/drafts", async (DraftRequest? request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "create", ct)) return Results.Forbid();
            if (request is null) return Results.BadRequest(new { error = "İstek gövdesi gerekli." });
            var code = request.Code?.Trim() ?? "";
            // A new draft for a code whose published page or open draft has queries is admin-only too; otherwise a
            // non-admin could replace a query page with a static one. Their operations also stay usable if deprecated.
            var liveDefinitions = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == code && !x.IsArchived)
                .Select(x => x.DefinitionJson).ToListAsync(ct);
            var catalog = await CatalogForAsync(db, tenant, request.Definition, ct);
            if (!ValidMetadata(request.Code, request.Name, request.Description, request.Definition,
                    TenantCustomPageQueries.OperationNames([.. liveDefinitions]), catalog, out var json, out var error)) return Results.BadRequest(new { error });
            if (!await QueryPageWriteAllowedAsync(http, tenant, userId, role, ct, [json!, .. liveDefinitions])) return Results.Forbid();
            if (await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Code == code && !x.IsPublished && !x.IsArchived, ct))
                return Results.Conflict(new { error = "Bu sayfa kodu için açık taslak zaten var." });
            // 5b-2: a templateless draft is accepted only for an existing templateless page: some live (published, not archived)
            // definition of this code must itself be templateless. A code whose live page is templated, or a new code (archived rows
            // do not count), needs a template. Schema version 1 cannot carry a template, so it is rejected the same way.
            if (PageTemplateRules.TemplateName(request.Definition) is null && !liveDefinitions.Any(IsTemplateless))
                return Results.BadRequest(new { error = PageTemplateRules.YeniSayfaKalipli });
            var now = DateTimeOffset.UtcNow;
            var page = new TenantCustomPage { TenantId = tenant, Code = code, Name = request.Name.Trim(), Description = CleanDescription(request.Description), DefinitionJson = json!, Revision = 1, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            db.TenantCustomPages.Add(page);
            db.TenantCustomPageRevisions.Add(RevisionOf(page, userId, "DraftCreated"));
            AddAudit(db, tenant, userId, "custom-page.draft-created", page.Code);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-pages/{page.Id}", ToDetail(page));
        });

        pages.MapPut("/{id:guid}", async (Guid id, UpdateRequest? request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "update", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (page is null) return Results.NotFound();
            if (!await SystemRowWriteAllowedAsync(http, tenant, userId, role, ct, page)) return SystemRowForbidden();
            if (page.IsPublished || page.IsArchived) return Results.Conflict(new { error = "Yayımlanmış/geçmiş sayfa doğrudan düzenlenemez; aynı code ile yeni taslak açın." });
            if (request is null) return Results.BadRequest(new { error = "İstek gövdesi gerekli." });
            if (request.ExpectedRevision != page.Revision) return Results.Conflict(new { error = "Taslak güncel değil. Son sürümü yeniden yükleyin.", currentRevision = page.Revision });
            if (!ValidStandardVersion(http, page, request.StandardVersion)) return Results.BadRequest(new { error = InvalidStandardVersion });
            // Operations the stored draft or the published page already use stay accepted even if since deprecated.
            var publishedDefinition = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == page.Code && x.IsPublished)
                .Select(x => x.DefinitionJson).FirstOrDefaultAsync(ct);
            // A system row's code is fixed ("@<screenKey>"); only its name, description and definition are checked.
            var catalog = await CatalogForAsync(db, tenant, request.Definition, ct);
            if (!ValidMetadata(page.Code, request.Name, request.Description, request.Definition,
                    TenantCustomPageQueries.OperationNames(page.DefinitionJson, publishedDefinition), catalog, out var json, out var error, page.ScreenKey is not null)) return Results.BadRequest(new { error });
            // Both the stored draft and the incoming definition count: a non-admin may neither add nor remove queries.
            if (!await QueryPageWriteAllowedAsync(http, tenant, userId, role, ct, page.DefinitionJson, json!)) return Results.Forbid();
            // 5b-2: a templated draft may not be turned into a templateless one unless the code's published page is itself
            // templateless (an existing legacy page). Drafts that are already templateless (legacy drafts, restored revisions)
            // stay editable; system rows follow their standard screen and are not new pages.
            if (page.ScreenKey is null && PageTemplateRules.TemplateName(request.Definition) is null && !IsTemplateless(page.DefinitionJson)
                && (publishedDefinition is null || !IsTemplateless(publishedDefinition)))
                return Results.BadRequest(new { error = PageTemplateRules.YeniSayfaKalipli });
            page.Name = request!.Name.Trim(); page.Description = CleanDescription(request.Description); page.DefinitionJson = json!;
            if (request.StandardVersion is { } standardVersion) page.StandardVersion = standardVersion;
            page.Revision++; page.UpdatedByUserId = userId; page.UpdatedAt = DateTimeOffset.UtcNow;
            db.TenantCustomPageRevisions.Add(RevisionOf(page, userId, "Updated"));
            AddAudit(db, tenant, userId, "custom-page.updated", page.Code);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetail(page));
        });

        pages.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "delete", ct)) return Results.Forbid();
            var page = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id && !x.IsArchived, ct);
            if (page is null) return Results.NotFound();
            if (!await SystemRowWriteAllowedAsync(http, tenant, userId, role, ct, page)) return SystemRowForbidden();
            if (!await QueryPageWriteAllowedAsync(http, tenant, userId, role, ct, page.DefinitionJson)) return Results.Forbid();

            // Retain the page and its revisions for audit/history, while removing it from
            // the catalog and published runtime.
            page.IsPublished = false;
            page.IsArchived = true;
            page.Revision++;
            page.UpdatedByUserId = userId;
            page.UpdatedAt = DateTimeOffset.UtcNow;
            db.TenantCustomPageRevisions.Add(RevisionOf(page, userId, "Deleted"));
            AddAudit(db, tenant, userId, "custom-page.deleted", page.Code);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        pages.MapPost("/{id:guid}/publish", async (Guid id, RevisionRequest? request, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "execute", ct)) return Results.Forbid();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
            var draft = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            if (draft is null) return Results.NotFound();
            if (!await SystemRowWriteAllowedAsync(http, tenant, userId, role, ct, draft)) return SystemRowForbidden();
            if (draft.IsPublished || request?.ExpectedRevision != draft.Revision) return Results.Conflict(new { error = "Taslak değişti veya zaten yayımlandı.", currentRevision = draft.Revision });
            var previous = await db.TenantCustomPages.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Code == draft.Code && x.IsPublished, ct);
            // A deprecated operation the published page already uses may be published again; new use is rejected.
            var catalog = await CatalogForAsync(db, tenant, draft.DefinitionJson, ct);
            if (!TenantCustomPageSchema.Validate(draft.DefinitionJson, out var error, TenantCustomPageQueries.OperationNames(previous?.DefinitionJson),
                    ErpOperationCatalog.TryGet, catalog))
                return Results.BadRequest(new { error });
            // Replacing a published query page (even with a static draft) is admin-only.
            if (!await QueryPageWriteAllowedAsync(http, tenant, userId, role, ct, previous is null ? [draft.DefinitionJson] : [draft.DefinitionJson, previous.DefinitionJson]))
                return Results.Forbid();
            // A system row needs an explicit access row only for SQL queries: without one its ERP operations stay
            // visible to members, as on the standard screen. Other pages keep the rule for any query or operation.
            // Catalog references count on both: HasSqlQueries and HasQueries include them.
            if (draft.ScreenKey is not null ? TenantCustomPageQueries.HasSqlQueries(draft.DefinitionJson) : TenantCustomPageQueries.HasQueries(draft.DefinitionJson))
            {
                // Without a saved row a query or ERP operation page would silently become AdminsOnly; require an explicit choice.
                var platformDb = http.RequestServices.GetRequiredService<PlatformDbContext>();
                if (!await platformDb.TenantCustomPageAccesses.AsNoTracking().AnyAsync(x => x.TenantId == tenant && x.PageCode == draft.Code, ct))
                    return Results.Conflict(new
                    {
                        error = TenantCustomPageQueries.HasSqlQueries(draft.DefinitionJson) && !TenantCustomPageQueries.HasCatalogQueryReferences(draft.DefinitionJson)
                            ? "Bu sayfa SQL sorgusu içeriyor; yayımlamadan önce erişimi açıkça seçin."
                            : "Bu sayfa sorgu veya ERP işlemi içeriyor; yayımlamadan önce erişim kuralı seçin."
                    });
            }
            if (HasUnconfiguredForm(draft.DefinitionJson)) return Results.Conflict(new { error = "Sayfadaki her özel form bileşeni için yayımlanmış bir form seçin." });
            var referencedForms = ReferencedFormCodes(draft.DefinitionJson);
            if (referencedForms.Count > 0)
            {
                var publishedForms = await db.TenantCustomFormDefinitions.AsNoTracking()
                    .Where(x => x.TenantId == tenant && x.Status == "Published" && referencedForms.Contains(x.Code))
                    .Select(x => x.Code).ToListAsync(ct);
                var missingForms = referencedForms.Except(publishedForms, StringComparer.Ordinal).ToArray();
                if (missingForms.Length > 0) return Results.Conflict(new { error = "Sayfada yayımlanmamış veya bulunamayan özel formlar var.", formCodes = missingForms });
            }
            if (previous is not null)
            {
                previous.IsPublished = false; previous.IsArchived = true; previous.Revision++; previous.UpdatedByUserId = userId; previous.UpdatedAt = DateTimeOffset.UtcNow;
                db.TenantCustomPageRevisions.Add(RevisionOf(previous, userId, "Superseded"));
                // The filtered unique index (one published row per code) is checked per statement and EF does not
                // order the two updates; the previous row is unpublished first, inside the same transaction.
                await db.SaveChangesAsync(ct);
            }
            draft.IsPublished = true; draft.Revision++; draft.UpdatedByUserId = userId; draft.UpdatedAt = DateTimeOffset.UtcNow;
            db.TenantCustomPageRevisions.Add(RevisionOf(draft, userId, "Published"));
            AddAudit(db, tenant, userId, "custom-page.published", draft.Code);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(ToDetail(draft));
        });

        pages.MapGet("/{id:guid}/history", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "read", ct)) return Results.Forbid();
            if (!await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Id == id, ct)) return Results.NotFound();
            var revisions = await db.TenantCustomPageRevisions.AsNoTracking().Where(x => x.TenantId == tenant && x.CustomPageId == id)
                .OrderByDescending(x => x.Revision).Select(x => new RevisionDetail(x.Id, x.Revision, x.Code, x.Name, x.Description, x.ChangeKind, x.ChangedByUserId, x.CreatedAt, x.DefinitionJson)).ToListAsync(ct);
            // Admin status is verified once for the whole list.
            if (!await QuerySqlVisibleAsync(http, tenant, userId, role, ct, [.. revisions.Select(x => x.DefinitionJson)]))
                revisions = revisions.Select(x => x with { DefinitionJson = TenantCustomPageQueries.WithoutQuerySql(x.DefinitionJson) }).ToList();
            return Results.Ok(revisions);
        });

        pages.MapPost("/{id:guid}/restore/{revisionId:guid}", async (Guid id, Guid revisionId, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer auth, HttpContext http, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenant, out var userId, out var role) || !await Allowed(auth, tenant, userId, role, "create", ct)) return Results.Forbid();
            var original = await db.TenantCustomPages.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct);
            var revision = await db.TenantCustomPageRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.CustomPageId == id && x.Id == revisionId, ct);
            if (original is null || revision is null) return Results.NotFound();
            if (!await SystemRowWriteAllowedAsync(http, tenant, userId, role, ct, original)) return SystemRowForbidden();
            // The restored revision, the row it belongs to and the currently published page of that code all count.
            var publishedDefinition = await db.TenantCustomPages.AsNoTracking().Where(x => x.TenantId == tenant && x.Code == original.Code && x.IsPublished)
                .Select(x => x.DefinitionJson).FirstOrDefaultAsync(ct);
            if (!await QueryPageWriteAllowedAsync(http, tenant, userId, role, ct,
                publishedDefinition is null ? [revision.DefinitionJson, original.DefinitionJson] : [revision.DefinitionJson, original.DefinitionJson, publishedDefinition]))
                return Results.Forbid();
            if (await db.TenantCustomPages.AnyAsync(x => x.TenantId == tenant && x.Code == original.Code && !x.IsPublished && !x.IsArchived, ct)) return Results.Conflict(new { error = "Bu sayfa için açık taslak zaten var." });
            var now = DateTimeOffset.UtcNow;
            var draft = new TenantCustomPage { TenantId = tenant, Code = revision.Code, Name = revision.Name, Description = revision.Description, DefinitionJson = revision.DefinitionJson, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            if (original.ScreenKey is not null)
            {
                // A revision written before StandardVersion existed falls back to the row's base version.
                draft.ScreenKey = original.ScreenKey;
                draft.StandardVersion = revision.StandardVersion ?? original.StandardVersion;
            }
            db.TenantCustomPages.Add(draft); db.TenantCustomPageRevisions.Add(RevisionOf(draft, userId, "Restored"));
            AddAudit(db, tenant, userId, "custom-page.restored", draft.Code);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-pages/{draft.Id}", ToDetail(draft));
        });
    }

    private static bool ValidMetadata(string? code, string? name, string? description, JsonElement definition,
        IReadOnlySet<string> existingOperations, CatalogBundle? catalog, out string? json, out string? error, bool systemRow = false)
    {
        json = null; error = null;
        if ((!systemRow && !ValidCode(code)) || string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120 || (description?.Length ?? 0) > 500)
        { error = "Kod, ad veya açıklama biçimi geçersiz."; return false; }
        if (definition.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) { error = "Sayfa tanımı gerekli."; return false; }
        json = definition.GetRawText();
        // Size limits depend on the schema version (v1: 64 KiB, v2: 128 KiB) and are enforced by the schema.
        if (!TenantCustomPageSchema.Validate(json, out error, existingOperations, ErpOperationCatalog.TryGet, catalog)) { json = null; return false; }
        // Catalog components are checked against the active catalog on save only (publish and activation do not re-check),
        // so a component removed by a later release leaves the page publishable and the runtime shows it as missing.
        if (TenantCustomPageQueries.CatalogComponentError(json, catalog) is { } componentError) { error = componentError; json = null; return false; }
        return true;
    }
    /// <summary>
    /// The tenant's active catalog, read only when the definition references it: definitions without references validate
    /// exactly as before and cost no catalog read.
    /// </summary>
    private static Task<CatalogBundle?> CatalogForAsync(TenantDbContext db, Guid tenant, string definitionJson, CancellationToken ct) =>
        TenantCustomPageQueries.HasCatalogReferences(definitionJson)
            ? TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, ct)
            : Task.FromResult<CatalogBundle?>(null);
    /// <summary>
    /// The definition the ERP runtime receives: catalog references resolved against the active catalog (read only when the
    /// definition has references), then every query's SQL removed.
    /// </summary>
    internal static async Task<string> RuntimeDefinitionAsync(TenantDbContext db, Guid tenant, string definitionJson, CancellationToken ct)
    {
        if (!TenantCustomPageQueries.HasCatalogReferences(definitionJson)) return TenantCustomPageQueries.WithoutQuerySql(definitionJson);
        var catalog = await TenantCatalogStore.ActiveAsync(db, tenant, ErpOperationCatalog.TryGet, ct);
        return TenantCustomPageQueries.WithoutQuerySql(TenantCustomPageQueries.ResolveCatalogReferences(definitionJson, catalog));
    }
    private static Task<CatalogBundle?> CatalogForAsync(TenantDbContext db, Guid tenant, JsonElement definition, CancellationToken ct) =>
        definition.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            ? Task.FromResult<CatalogBundle?>(null) : CatalogForAsync(db, tenant, definition.GetRawText(), ct);
    /// <summary>A stored definition without a well-formed template (legacy page). Unreadable JSON is not treated as templateless (fail closed).</summary>
    private static bool IsTemplateless(string definitionJson)
    {
        try
        {
            using var document = JsonDocument.Parse(definitionJson);
            return PageTemplateRules.TemplateName(document.RootElement) is null;
        }
        catch (JsonException) { return false; }
    }
    internal static bool ValidCode(string? code) => !string.IsNullOrWhiteSpace(code) && code.Length <= 40 && code.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
    private static string? CleanDescription(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    /// <summary>The published custom forms a page definition references, embedded in runtime responses.</summary>
    internal static async Task<IReadOnlyList<EmbeddedForm>> LoadEmbeddedFormsAsync(TenantDbContext db, Guid tenant, string definitionJson, CancellationToken ct)
    {
        var formCodes = ReferencedFormCodes(definitionJson);
        if (formCodes.Count == 0) return [];
        var forms = await db.TenantCustomFormDefinitions.AsNoTracking()
            .Where(x => x.TenantId == tenant && x.Status == "Published" && formCodes.Contains(x.Code))
            .Select(x => new { x.Id, x.Code, x.Name, x.Description, x.Version, x.FieldsJson })
            .ToListAsync(ct);
        return forms.Select(x => new EmbeddedForm(x.Id, x.Code, x.Name, x.Description, x.Version,
            JsonSerializer.Deserialize<List<DynamicFormField>>(x.FieldsJson, JsonOptions) ?? [])).ToArray();
    }
    internal static HashSet<string> ReferencedFormCodes(string json)
    {
        var codes = new HashSet<string>(StringComparer.Ordinal);
        using var document = JsonDocument.Parse(json);
        CollectFormCodes(document.RootElement, codes);
        return codes;
    }
    private static bool HasUnconfiguredForm(string json)
    {
        using var document = JsonDocument.Parse(json);
        return HasUnconfiguredForm(document.RootElement);
    }
    private static bool HasUnconfiguredForm(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Array) return element.EnumerateArray().Any(HasUnconfiguredForm);
        if (element.ValueKind != JsonValueKind.Object) return false;
        if (element.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "form"
            && (!element.TryGetProperty("props", out var props) || props.ValueKind != JsonValueKind.Object
                || !props.TryGetProperty("formCode", out var code) || code.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(code.GetString()))) return true;
        return element.EnumerateObject().Any(property => (property.Value.ValueKind is JsonValueKind.Array or JsonValueKind.Object) && HasUnconfiguredForm(property.Value));
    }
    private static void CollectFormCodes(JsonElement element, HashSet<string> codes)
    {
        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray()) CollectFormCodes(item, codes);
            return;
        }
        if (element.ValueKind != JsonValueKind.Object) return;
        if (element.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String
            && type.GetString() == "form" && element.TryGetProperty("props", out var props)
            && props.ValueKind == JsonValueKind.Object && props.TryGetProperty("formCode", out var code)
            && code.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(code.GetString()))
            codes.Add(code.GetString()!);
        foreach (var property in element.EnumerateObject())
            if (property.Value.ValueKind is JsonValueKind.Array or JsonValueKind.Object) CollectFormCodes(property.Value, codes);
    }
    internal static bool TryContext(ClaimsPrincipal user, out Guid tenant, out Guid userId, out string role)
    { tenant = default; userId = default; role = user.FindFirstValue("role") ?? ""; return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenant) && Guid.TryParse(user.FindFirstValue("sub"), out userId) && role.Length > 0; }
    internal static async Task<bool> Allowed(IPlatformPermissionAuthorizer auth, Guid tenant, Guid userId, string role, string action, CancellationToken ct, string resourceType = "erp.tenant-customizations")
    {
        var definition = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.ResourceType == resourceType && x.Action == action);
        if (definition is null) return false;
        var attributes = new Dictionary<string, string> { ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role, ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenant.ToString("D"), ["request.action"] = action };
        return await auth.IsAllowedAsync(tenant, userId, role, new ResolvedPlatformPermission(definition, attributes), ct);
    }
    /// <summary>
    /// Pages whose definition contains inline SQL queries, write ERP operation queries, or a code component with JavaScript
    /// (it can reach page data and operations) may only be written by a verified TenantAdmin (role claim and current
    /// membership). Catalog references (<c>dataSource</c> and <c>action</c>, whatever the item runs) carry only a code and
    /// need no such gate: the catalog version is activated by a verified TenantAdmin or Studio Developer and its SQL is
    /// re-validated on every run, so any user with page write permission may save them. The same holds for a catalog component
    /// (<c>catalogComponent</c>): the page carries only its code and setting values, never CSS/JavaScript (the schema rejects
    /// both alongside it), and the code comes from the activated catalog when the page is read. A release whose components
    /// differ from the active release's is activated only by a verified TenantAdmin
    /// (<see cref="TenantCatalogEndpoints.ComponentsChanged"/>), so component JavaScript reaches pages only with an admin's
    /// approval, as inline JavaScript does. Pages that only bind read ERP operations need no gate either:
    /// reads run against their own endpoints with the user's own token. The Platform database is read only when a
    /// definition needs the check.
    /// </summary>
    internal static async Task<bool> QueryPageWriteAllowedAsync(HttpContext http, Guid tenant, Guid userId, string role, CancellationToken ct,
        params string[] definitions)
    {
        var required = definitions.Any(x => TenantCustomPageQueries.HasInlineSqlQueries(x) || TenantCustomPageQueries.HasWriteOperationQueries(x)
            || TenantCustomPageQueries.HasCodeScript(x));
        return await VerifiedAdminRequiredAsync(http, tenant, userId, role, ct, required);
    }
    /// <summary>
    /// Query SQL in designer responses is shown only to a verified TenantAdmin (role claim and current membership); other
    /// users get the definition without <c>queries[].sql</c>. Definitions without SQL queries need no check.
    /// </summary>
    internal static Task<bool> QuerySqlVisibleAsync(HttpContext http, Guid tenant, Guid userId, string role, CancellationToken ct,
        params string[] definitions) =>
        VerifiedAdminRequiredAsync(http, tenant, userId, role, ct, definitions.Any(TenantCustomPageQueries.HasSqlQueries));
    private static async Task<bool> VerifiedAdminRequiredAsync(HttpContext http, Guid tenant, Guid userId, string role, CancellationToken ct, bool required)
    {
        if (!required) return true;
        var platformDb = http.RequestServices.GetRequiredService<PlatformDbContext>();
        return await CustomPageAccessEndpoints.IsVerifiedTenantAdminAsync(platformDb, tenant, userId, role, ct);
    }
    private const string InvalidStandardVersion = "Standart sürüm değeri geçersiz.";
    /// <summary>
    /// <c>standardVersion</c> is accepted only on a system draft, and only between the stored base version and the
    /// current standard version. Without a registered <see cref="ISystemPageVersionSource"/> no value is accepted.
    /// </summary>
    private static bool ValidStandardVersion(HttpContext http, TenantCustomPage page, int? requested)
    {
        if (requested is not { } value) return true;
        if (page.ScreenKey is null || page.StandardVersion is not { } stored) return false;
        var current = http.RequestServices.GetService<ISystemPageVersionSource>()?.CurrentVersion(page.ScreenKey);
        return current is not null && value >= stored && value <= current;
    }
    /// <summary>Writes to a system row (update, publish, delete, restore) additionally need a verified TenantAdmin.</summary>
    private static Task<bool> SystemRowWriteAllowedAsync(HttpContext http, Guid tenant, Guid userId, string role, CancellationToken ct, TenantCustomPage page) =>
        VerifiedAdminRequiredAsync(http, tenant, userId, role, ct, page.ScreenKey is not null);
    internal static IResult SystemRowForbidden() => Results.Json(new { error = "Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir." }, statusCode: StatusCodes.Status403Forbidden);
    internal static IResult ViewForbidden() => Results.Json(new { error = "Bu sayfayı görüntüleme yetkiniz yok." }, statusCode: StatusCodes.Status403Forbidden);
    internal static TenantCustomPageRevision RevisionOf(TenantCustomPage x, Guid userId, string kind) => new() { TenantId = x.TenantId, CustomPageId = x.Id, Revision = x.Revision, Code = x.Code, Name = x.Name, Description = x.Description, DefinitionJson = x.DefinitionJson, ChangeKind = kind, ChangedByUserId = userId, CreatedAt = DateTimeOffset.UtcNow, StandardVersion = x.StandardVersion };
    internal static void AddAudit(TenantDbContext db, Guid tenant, Guid userId, string action, string code) => db.AuditEvents.Add(new AuditEvent { TenantId = tenant, UserId = userId, Action = action, Resource = $"custom-page:{code}" });
    internal static PageDetail ToDetail(TenantCustomPage x) => new(x.Id, x.Code, x.Name, x.Description, x.Revision, x.IsPublished, x.IsArchived, x.DefinitionJson, x.UpdatedAt, x.ScreenKey, x.StandardVersion);

    internal sealed record PendingPublicationView(Guid PageId, string Code, string Name, string? ScreenKey, DateTimeOffset UpdatedAt, string? UpdatedByName);
    internal sealed record PublishedRevisionView(Guid PageId, Guid RevisionId, int Revision, string Code, string Name, string? ScreenKey, DateTimeOffset PublishedAt, string? ChangedByName, bool IsCurrent);
    internal sealed record PublicationsView(IReadOnlyList<PendingPublicationView> Pending, IReadOnlyList<PublishedRevisionView> History);
    private sealed record DraftRequest(string Code, string Name, string? Description, JsonElement Definition);
    private sealed record UpdateRequest(int ExpectedRevision, string Name, string? Description, JsonElement Definition, int? StandardVersion = null);
    private sealed record RevisionRequest(int ExpectedRevision);
    private sealed record PageSummary(Guid Id, string Code, string Name, string? Description, int Revision, bool IsPublished, bool IsArchived, DateTimeOffset UpdatedAt, string? ScreenKey, string? Template, int? TemplateLevel);
    private sealed record PageDefinition(Guid Id, string Code, string Name, string? Description, int Revision, string DefinitionJson);
    private sealed record PublishedPage(Guid Id, string Code, string Name, string? Description, int Revision, string DefinitionJson, IReadOnlyList<EmbeddedForm> Forms,
        CustomPageRightsView Rights);
    internal sealed record EmbeddedForm(Guid Id, string Code, string Name, string? Description, int Version, IReadOnlyList<DynamicFormField> Fields);
    internal sealed record PageDetail(Guid Id, string Code, string Name, string? Description, int Revision, bool IsPublished, bool IsArchived, string DefinitionJson, DateTimeOffset UpdatedAt,
        string? ScreenKey, int? StandardVersion);
    internal sealed record RevisionDetail(Guid Id, int Revision, string Code, string Name, string? Description, string ChangeKind, Guid ChangedByUserId, DateTimeOffset CreatedAt, string DefinitionJson);
}
