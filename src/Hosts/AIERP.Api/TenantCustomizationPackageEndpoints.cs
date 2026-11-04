using System.Security.Claims;
using System.Linq.Expressions;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Tenant-scoped transport for low-code configuration. Packages contain definitions only;
/// submitted form data, workflow executions, customer records, credentials, and audit data
/// are deliberately excluded.
/// </summary>
internal static class TenantCustomizationPackageEndpoints
{
    private const int SchemaVersion = 1;
    private const int MaximumItemsPerKind = 200;
    private const int MaximumPayloadBytes = 2 * 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> SupportedFeatures = new(StringComparer.Ordinal)
    {
        "custom-fields.v1", "custom-forms.v1", "workflows.v1", "business-rules.v1", "screen-views.v1",
        "reports-lists.v1", "custom-menus.v1", "standard-menu.v1"
    };
    private static readonly IReadOnlyDictionary<string, (Type Definition, Type Revision)> CustomFieldEntityTypes =
        new Dictionary<string, (Type, Type)>(StringComparer.Ordinal)
        {
            ["customers"] = (typeof(CustomerCustomFieldDefinition), typeof(CustomerCustomFieldDefinitionRevision)),
            ["stockItems"] = (typeof(StockItemCustomFieldDefinition), typeof(StockItemCustomFieldDefinitionRevision)),
            ["warehouses"] = (typeof(WarehouseCustomFieldDefinition), typeof(WarehouseCustomFieldDefinitionRevision)),
            ["purchaseRequests"] = (typeof(PurchaseRequestCustomFieldDefinition), typeof(PurchaseRequestCustomFieldDefinitionRevision)),
            ["purchaseSupplierQuotes"] = (typeof(PurchaseSupplierQuoteCustomFieldDefinition), typeof(PurchaseSupplierQuoteCustomFieldDefinitionRevision)),
            ["purchaseOrders"] = (typeof(PurchaseOrderCustomFieldDefinition), typeof(PurchaseOrderCustomFieldDefinitionRevision)),
            ["purchaseReceipts"] = (typeof(PurchaseReceiptCustomFieldDefinition), typeof(PurchaseReceiptCustomFieldDefinitionRevision)),
            ["salesQuotes"] = (typeof(SalesQuoteCustomFieldDefinition), typeof(SalesQuoteCustomFieldDefinitionRevision)),
            ["salesOrders"] = (typeof(SalesOrderCustomFieldDefinition), typeof(SalesOrderCustomFieldDefinitionRevision)),
            ["salesInvoices"] = (typeof(SalesInvoiceCustomFieldDefinition), typeof(SalesInvoiceCustomFieldDefinitionRevision))
        };
    private static readonly HashSet<string> AllowedCustomFieldEntities = new(CustomFieldEntityTypes.Keys, StringComparer.Ordinal);
    private static readonly HashSet<string> AllowedMenuTargets = new(StringComparer.Ordinal)
    {
        "dashboard", "customers", "inventory-stock", "inventory-warehouses", "sales-quotes", "sales-requests",
        "sales-orders", "sales-invoices", "sales-purchasing", "finance-accounts", "finance-statements", "finance-fx",
        "finance-ledger", "finance-exposure", "finance-maturities", "modules", "custom-forms", "workflows",
        "business-rules", "reports", "custom-lists"
    };

    public static void MapTenantCustomizationPackageEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/tenant-customizations/packages")
            .WithTags("Tenant Low-Code Packages").RequireAuthorization();

        group.MapGet("/export", async (ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "read", ct)) return Results.Forbid();
            var package = await ExportPackageAsync(db, tenantId, ct);
            return Results.Json(package, JsonOptions);
        });

        group.MapGet("/snapshots", async (ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "read", ct)) return Results.Forbid();
            var snapshots = await db.TenantCustomizationPackageSnapshots.AsNoTracking()
                .Where(x => x.TenantId == tenantId).OrderByDescending(x => x.Version).Take(20)
                .Select(x => new PackageSnapshotListItem(x.Id, x.Version, x.Name, x.Sha256, x.CreatedAt, x.CreatedByUserId))
                .ToListAsync(ct);
            return Results.Ok(snapshots);
        });

        group.MapPost("/snapshots", async (PackageSnapshotRequest? request, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "create", ct)) return Results.Forbid();
            var package = await ExportPackageAsync(db, tenantId, ct);
            var json = JsonSerializer.Serialize(package, JsonOptions);
            var bytes = System.Text.Encoding.UTF8.GetBytes(json);
            if (bytes.Length > MaximumPayloadBytes) return Results.BadRequest(new { error = "Özelleştirme snapshot boyutu 2 MiB sınırını aşıyor." });
            var name = string.IsNullOrWhiteSpace(request?.Name)
                ? $"Snapshot {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm}"
                : request.Name.Trim();
            if (name.Length > 120) return Results.BadRequest(new { error = "Snapshot adı en fazla 120 karakter olabilir." });
            var version = (await db.TenantCustomizationPackageSnapshots.Where(x => x.TenantId == tenantId)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var snapshot = new TenantCustomizationPackageSnapshot
            {
                TenantId = tenantId, Version = version, Name = name, PackageJson = json,
                Sha256 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)),
                CreatedByUserId = userId, CreatedAt = DateTimeOffset.UtcNow
            };
            db.TenantCustomizationPackageSnapshots.Add(snapshot);
            var oldest = await db.TenantCustomizationPackageSnapshots.Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.Version).Skip(19).ToListAsync(ct);
            db.TenantCustomizationPackageSnapshots.RemoveRange(oldest);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.low-code-package.snapshot-created", Resource = $"v{version}:{name}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new PackageSnapshotListItem(snapshot.Id, snapshot.Version, snapshot.Name,
                snapshot.Sha256, snapshot.CreatedAt, snapshot.CreatedByUserId));
        });

        group.MapPost("/snapshots/{snapshotId:guid}/restore", async (Guid snapshotId, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "execute", ct)) return Results.Forbid();
            var snapshot = await db.TenantCustomizationPackageSnapshots.SingleOrDefaultAsync(
                x => x.TenantId == tenantId && x.Id == snapshotId, ct);
            if (snapshot is null) return Results.NotFound();
            var digest = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(snapshot.PackageJson)));
            if (!string.Equals(digest, snapshot.Sha256, StringComparison.OrdinalIgnoreCase))
                return Results.Conflict(new { error = "Snapshot özeti doğrulanamadı; geri yükleme durduruldu." });
            TenantCustomizationPackage? package;
            try { package = JsonSerializer.Deserialize<TenantCustomizationPackage>(snapshot.PackageJson, JsonOptions); }
            catch (JsonException) { return Results.Conflict(new { error = "Snapshot paketi okunamıyor." }); }
            var validation = Validate(package);
            if (validation is not null) return validation;
            var compatibilityIssues = GetCompatibilityIssues(package!);
            compatibilityIssues = compatibilityIssues.Concat(GetScreenLayoutMappingIssues(package!,
                await ExportCustomFieldsAsync(db, tenantId, ct)))
                .Concat(await GetMissingWorkflowReferenceIssuesAsync(package!, tenantId, db, ct))
                .Distinct(StringComparer.Ordinal).ToArray();
            if (compatibilityIssues.Count > 0)
                return Results.Conflict(new { error = "Snapshot bu Nexora sürümüyle uyumlu değil.", issues = compatibilityIssues });
            var outcome = await RestorePackageAsync(package!, tenantId, userId, db, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.low-code-package.snapshot-restored", Resource = $"v{snapshot.Version}:{snapshot.Name};updated:{outcome.Updated};created:{outcome.Created}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { snapshot.Version, snapshot.Name, outcome.Updated, outcome.Created,
                note = "Snapshot’taki tanımlar geri yüklendi. Sonradan eklenen tanımlar korunur. Formlar, iş akışları, kurallar ve ekran düzenleri taslak durumuna alınır; raporlar, menüler, özel alanlar ve menü düzeni hemen uygulanır." });
        });

        group.MapPost("/preview", async (TenantCustomizationPackage? package, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "read", ct)) return Results.Forbid();
            var validation = Validate(package);
            if (validation is not null) return validation;
            var plan = await BuildImportPlanAsync(package!, tenantId, db, ct);
            return Results.Ok(plan);
        });

        group.MapPost("/import", async (PackageImportRequest? request, ClaimsPrincipal user,
            TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenantContext(user, out var tenantId, out var userId, out var role)
                || !await IsAllowedAsync(authorizer, tenantId, userId, role, "create", ct)) return Results.Forbid();
            var package = request?.Package;
            var validation = Validate(package);
            if (validation is not null) return validation;
            var plan = await BuildImportPlanAsync(package!, tenantId, db, ct);
            if (plan.CompatibilityIssues.Count > 0)
                return Results.Conflict(new { error = "Paket bu Nexora sürümüyle uyumlu değil.", issues = plan.CompatibilityIssues });
            if (plan.ImmediateApplyCount > 0 && request?.ConfirmImmediateApply != true)
                return Results.Conflict(new { error = "Paket bazı etkin tanımları hemen uygulayacak. Devam etmeden önce bu değişiklikleri onaylayın.", requiresImmediateConfirmation = true, plan.ImmediateApplyCount });
            var now = DateTimeOffset.UtcNow;
            var imported = new List<string>();

            foreach (var item in package!.Forms ?? [])
            {
                if (plan.Conflicts.Contains($"form:{item.Code}")) continue;
                var entity = new TenantCustomFormDefinition
                {
                    TenantId = tenantId, Code = item.Code.Trim(), Name = item.Name.Trim(), Description = item.Description,
                    Version = 1, Status = "Draft", FieldsJson = item.FieldsJson,
                    CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
                };
                db.TenantCustomFormDefinitions.Add(entity);
                db.TenantCustomFormRevisions.Add(new TenantCustomFormRevision
                {
                    TenantId = tenantId, Form = entity, Version = 1, Name = entity.Name, Description = entity.Description,
                    Status = "Draft", FieldsJson = entity.FieldsJson, ChangeKind = "Imported", ChangedByUserId = userId, CreatedAt = now
                });
                imported.Add($"form:{entity.Code}");
            }
            foreach (var item in package.Workflows ?? [])
            {
                if (plan.Conflicts.Contains($"workflow:{item.Code}")) continue;
                var entity = new TenantWorkflowDefinition
                {
                    TenantId = tenantId, Code = item.Code.Trim(), Name = item.Name.Trim(), Description = item.Description,
                    Version = 1, Status = "Draft", StepsJson = item.StepsJson,
                    CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
                };
                db.TenantWorkflowDefinitions.Add(entity);
                imported.Add($"workflow:{entity.Code}");
            }
            foreach (var item in package.BusinessRules ?? [])
            {
                if (plan.Conflicts.Contains($"rule:{item.Code}")) continue;
                var entity = new TenantBusinessRuleDefinition
                {
                    TenantId = tenantId, Code = item.Code.Trim(), Name = item.Name.Trim(), Description = item.Description,
                    Trigger = item.Trigger, Version = 1, Status = "Draft", ConditionsJson = item.ConditionsJson,
                    WorkflowCode = item.WorkflowCode, CreatedByUserId = userId, UpdatedByUserId = userId,
                    CreatedAt = now, UpdatedAt = now
                };
                db.TenantBusinessRuleDefinitions.Add(entity);
                imported.Add($"rule:{entity.Code}");
            }
            var existingCustomFields = await ExportCustomFieldsAsync(db, tenantId, ct);
            var customFieldIdMap = existingCustomFields.Where(field => field.SourceId is not null)
                .ToDictionary(field => field.SourceId!.Value, field => field.SourceId!.Value);
            foreach (var item in package.CustomFields ?? [])
            {
                var existing = existingCustomFields.FirstOrDefault(field =>
                    string.Equals(field.Entity, item.Entity, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(field.Code, item.Code, StringComparison.OrdinalIgnoreCase));
                if (item.SourceId is Guid sourceId && existing?.SourceId is Guid existingDestinationId)
                    customFieldIdMap[sourceId] = existingDestinationId;
                var key = $"field:{item.Entity}:{item.Code}";
                if (plan.Conflicts.Contains(key)) continue;
                // Business records and field values are intentionally excluded from packages.
                // Imported fields therefore start optional to avoid blocking existing records.
                if (!AddCustomField(db, tenantId, userId, item with { IsRequired = false }, now, out var createdDestinationId)) continue;
                if (item.SourceId is Guid importedSourceId) customFieldIdMap[importedSourceId] = createdDestinationId;
                imported.Add(key);
            }
            foreach (var item in package.ScreenViews ?? [])
            {
                if (plan.Conflicts.Contains($"screen:{item.ScreenKey}:{item.Name}")) continue;
                if (!TryRemapScreenLayout(item.LayoutJson, customFieldIdMap, out var layoutJson, out var layoutError))
                    return Results.BadRequest(new { error = "Ekran düzenindeki özel alanlar hedef tenant ile eşleştirilemedi.", screen = item.Name, detail = layoutError });
                var entity = new TenantScreenView
                {
                    TenantId = tenantId, ScreenKey = item.ScreenKey, Name = item.Name.Trim(), LayoutJson = layoutJson,
                    Revision = 1, IsPublished = false, CreatedByUserId = userId, UpdatedByUserId = userId,
                    CreatedAt = now, UpdatedAt = now
                };
                db.TenantScreenViews.Add(entity);
                db.TenantScreenViewRevisions.Add(new TenantScreenViewRevision
                {
                    TenantId = tenantId, ScreenView = entity, Revision = 1, ScreenKey = entity.ScreenKey,
                    Name = entity.Name, LayoutJson = entity.LayoutJson, ChangeKind = "Imported",
                    ChangedByUserId = userId, CreatedAt = now
                });
                imported.Add($"screen:{entity.ScreenKey}:{entity.Name}");
            }
            foreach (var item in package.Reports ?? [])
            {
                if (plan.Conflicts.Contains($"report:{item.Kind}:{item.Name}")) continue;
                var entity = new TenantSavedReport
                {
                    TenantId = tenantId, Name = item.Name.Trim(), Kind = item.Kind, Source = item.Source,
                    DefinitionJson = item.DefinitionJson, CreatedByUserId = userId, UpdatedByUserId = userId,
                    CreatedAt = now, UpdatedAt = now, DefinitionRevision = 1
                };
                db.TenantSavedReports.Add(entity);
                imported.Add($"report:{entity.Kind}:{entity.Name}");
            }
            foreach (var item in package.CustomMenus ?? [])
            {
                if (plan.Conflicts.Contains($"menu:{item.Code}")) continue;
                var entity = new TenantCustomMenuEntry
                {
                    TenantId = tenantId, Code = item.Code.Trim(), Label = item.Label.Trim(), TargetPage = item.TargetPage,
                    Position = item.Position, CreatedByUserId = userId, UpdatedByUserId = userId,
                    CreatedAt = now, UpdatedAt = now
                };
                db.TenantCustomMenuEntries.Add(entity);
                imported.Add($"menu:{entity.Code}");
            }
            if (!string.IsNullOrWhiteSpace(package.StandardMenuLayoutJson))
            {
                var layout = await db.TenantStandardMenuLayouts.SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
                if (layout is null)
                {
                    db.TenantStandardMenuLayouts.Add(new TenantStandardMenuLayout
                    {
                        TenantId = tenantId, LayoutJson = package.StandardMenuLayoutJson,
                        Revision = 1, UpdatedByUserId = userId, UpdatedAt = now
                    });
                    imported.Add("standard-menu");
                }
                else if (layout.LayoutJson != package.StandardMenuLayoutJson)
                {
                    layout.LayoutJson = package.StandardMenuLayoutJson;
                    layout.Revision++;
                    layout.UpdatedByUserId = userId;
                    layout.UpdatedAt = now;
                    imported.Add("standard-menu");
                }
            }

            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId, UserId = userId, Action = "erp.low-code-package.imported",
                Resource = $"schema:{SchemaVersion};items:{imported.Count};skipped:{plan.Conflicts.Count}"
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { imported, skipped = plan.Conflicts,
                note = "Formlar, iş akışları, kurallar ve ekran düzenleri taslak olarak oluşturuldu. Raporlar, menüler, özel alan tanımları ve standart menü düzeni hemen uygulanır. İçe aktarılan özel alanlar, hedef firmadaki kayıtları engellememesi için isteğe bağlı başlar." });
        });
    }

    private static async Task<TenantCustomizationPackage> ExportPackageAsync(TenantDbContext db, Guid tenantId, CancellationToken ct)
    {
        var forms = await db.TenantCustomFormDefinitions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && (x.Status == "Published" || x.Status == "Draft"))
            .OrderBy(x => x.Code).ThenByDescending(x => x.Version)
            .Select(x => new FormPackageItem(x.Code, x.Name, x.Description, x.FieldsJson)).ToListAsync(ct);
        forms = forms.GroupBy(x => x.Code, StringComparer.Ordinal).Select(x => x.First()).ToList();
        var workflows = await db.TenantWorkflowDefinitions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && (x.Status == "Published" || x.Status == "Draft"))
            .OrderBy(x => x.Code).ThenByDescending(x => x.Version)
            .Select(x => new WorkflowPackageItem(x.Code, x.Name, x.Description, x.StepsJson)).ToListAsync(ct);
        workflows = workflows.GroupBy(x => x.Code, StringComparer.Ordinal).Select(x => x.First()).ToList();
        var rules = await db.TenantBusinessRuleDefinitions.AsNoTracking()
            .Where(x => x.TenantId == tenantId && (x.Status == "Published" || x.Status == "Draft"))
            .OrderBy(x => x.Code).ThenByDescending(x => x.Version)
            .Select(x => new BusinessRulePackageItem(x.Code, x.Name, x.Description, x.Trigger, x.ConditionsJson, x.WorkflowCode)).ToListAsync(ct);
        rules = rules.GroupBy(x => x.Code, StringComparer.Ordinal).Select(x => x.First()).ToList();
        var customFields = await ExportCustomFieldsAsync(db, tenantId, ct);
        var views = await db.TenantScreenViews.AsNoTracking().Where(x => x.TenantId == tenantId)
            .OrderBy(x => x.ScreenKey).ThenBy(x => x.Name)
            .Select(x => new ScreenViewPackageItem(x.ScreenKey, x.Name, x.LayoutJson)).ToListAsync(ct);
        var reports = await db.TenantSavedReports.AsNoTracking().Where(x => x.TenantId == tenantId && (x.Kind == "Report" || x.Kind == "List"))
            .OrderBy(x => x.Kind).ThenBy(x => x.Name)
            .Select(x => new SavedReportPackageItem(x.Name, x.Kind, x.Source, x.DefinitionJson)).ToListAsync(ct);
        var menus = await db.TenantCustomMenuEntries.AsNoTracking().Where(x => x.TenantId == tenantId)
            .OrderBy(x => x.Position).ThenBy(x => x.Code)
            .Select(x => new CustomMenuPackageItem(x.Code, x.Label, x.TargetPage, x.Position)).ToListAsync(ct);
        var standardMenu = await db.TenantStandardMenuLayouts.AsNoTracking().Where(x => x.TenantId == tenantId)
            .Select(x => x.LayoutJson).SingleOrDefaultAsync(ct);
        return new TenantCustomizationPackage(SchemaVersion, DateTimeOffset.UtcNow,
            forms, workflows, rules, views, reports, menus, customFields, standardMenu,
            RequiredFeaturesFor(forms, workflows, rules, views, reports, menus, customFields, standardMenu));
    }

    private static IReadOnlyList<string> RequiredFeaturesFor(
        IReadOnlyCollection<FormPackageItem> forms, IReadOnlyCollection<WorkflowPackageItem> workflows,
        IReadOnlyCollection<BusinessRulePackageItem> rules, IReadOnlyCollection<ScreenViewPackageItem> views,
        IReadOnlyCollection<SavedReportPackageItem> reports, IReadOnlyCollection<CustomMenuPackageItem> menus,
        IReadOnlyCollection<CustomFieldPackageItem> fields, string? standardMenu)
    {
        var features = new List<string>();
        if (forms.Count > 0) features.Add("custom-forms.v1");
        if (workflows.Count > 0) features.Add("workflows.v1");
        if (rules.Count > 0) features.Add("business-rules.v1");
        if (views.Count > 0) features.Add("screen-views.v1");
        if (reports.Count > 0) features.Add("reports-lists.v1");
        if (menus.Count > 0) features.Add("custom-menus.v1");
        if (fields.Count > 0) features.Add("custom-fields.v1");
        if (!string.IsNullOrWhiteSpace(standardMenu)) features.Add("standard-menu.v1");
        return features;
    }

    private static IReadOnlyList<string> GetCompatibilityIssues(TenantCustomizationPackage package)
    {
        var issues = new List<string>();
        foreach (var feature in package.RequiredFeatures ?? RequiredFeaturesFor(package.Forms ?? [], package.Workflows ?? [],
            package.BusinessRules ?? [], package.ScreenViews ?? [], package.Reports ?? [], package.CustomMenus ?? [],
            package.CustomFields ?? [], package.StandardMenuLayoutJson))
        {
            if (!SupportedFeatures.Contains(feature)) issues.Add($"Bu sürüm desteklemiyor: {feature}");
        }
        foreach (var field in package.CustomFields ?? [])
            if (!AllowedCustomFieldEntities.Contains(field.Entity)) issues.Add($"Özel alan hedefi desteklenmiyor: {field.Entity}");
        foreach (var menu in package.CustomMenus ?? [])
            if (!AllowedMenuTargets.Contains(menu.TargetPage)) issues.Add($"Menü hedefi desteklenmiyor: {menu.TargetPage}");
        return issues.Distinct(StringComparer.Ordinal).ToArray();
    }

    private static async Task<RestoreOutcome> RestorePackageAsync(TenantCustomizationPackage package,
        Guid tenantId, Guid userId, TenantDbContext db, CancellationToken ct)
    {
        var created = 0;
        var updated = 0;
        var now = DateTimeOffset.UtcNow;
        foreach (var item in package.Forms ?? [])
        {
            var row = await db.TenantCustomFormDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct);
            if (row is null)
            {
                row = new TenantCustomFormDefinition { TenantId = tenantId, Code = item.Code, CreatedByUserId = userId, CreatedAt = now };
                db.TenantCustomFormDefinitions.Add(row); created++;
            }
            else { row.Version++; updated++; }
            row.Name = item.Name; row.Description = item.Description; row.FieldsJson = item.FieldsJson;
            row.Status = "Draft"; row.UpdatedByUserId = userId; row.UpdatedAt = now;
            db.TenantCustomFormRevisions.Add(new TenantCustomFormRevision { TenantId = tenantId, Form = row,
                Version = row.Version, Name = row.Name, Description = row.Description, Status = row.Status,
                FieldsJson = row.FieldsJson, ChangeKind = "PackageRestored", ChangedByUserId = userId, CreatedAt = now });
        }
        foreach (var item in package.Workflows ?? [])
        {
            var row = await db.TenantWorkflowDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct);
            if (row is null) { row = new TenantWorkflowDefinition { TenantId = tenantId, Code = item.Code, CreatedByUserId = userId, CreatedAt = now }; db.TenantWorkflowDefinitions.Add(row); created++; }
            else { row.Version++; updated++; }
            row.Name = item.Name; row.Description = item.Description; row.StepsJson = item.StepsJson;
            row.Status = "Draft"; row.UpdatedByUserId = userId; row.UpdatedAt = now;
        }
        foreach (var item in package.BusinessRules ?? [])
        {
            var row = await db.TenantBusinessRuleDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct);
            if (row is null) { row = new TenantBusinessRuleDefinition { TenantId = tenantId, Code = item.Code, CreatedByUserId = userId, CreatedAt = now }; db.TenantBusinessRuleDefinitions.Add(row); created++; }
            else { row.Version++; updated++; }
            row.Name = item.Name; row.Description = item.Description; row.Trigger = item.Trigger;
            row.ConditionsJson = item.ConditionsJson; row.WorkflowCode = item.WorkflowCode;
            row.Status = "Draft"; row.UpdatedByUserId = userId; row.UpdatedAt = now;
        }
        var currentCustomFields = await ExportCustomFieldsAsync(db, tenantId, ct);
        var customFieldIdMap = currentCustomFields.Where(field => field.SourceId is not null)
            .ToDictionary(field => field.SourceId!.Value, field => field.SourceId!.Value);
        foreach (var item in package.CustomFields ?? [])
        {
            var types = CustomFieldEntityTypes[item.Entity];
            var rows = await EntityFrameworkQueryableExtensions.ToListAsync(Queryable.Cast<object>(TenantScopedQuery(db, types.Definition, tenantId)), ct);
            var row = rows.FirstOrDefault(x => string.Equals(Read<string>(x, "Code"), item.Code, StringComparison.OrdinalIgnoreCase));
            Guid destinationId;
            if (row is null)
            {
                if (!AddCustomField(db, tenantId, userId, item, now, out destinationId)) continue;
                created++;
            }
            else
            {
                destinationId = Read<Guid>(row, "Id");
                var version = Read<int>(row, "Version") + 1;
                Set(row, "Label", item.Label); Set(row, "DataType", Enum.ToObject(ReadObject(row, "DataType")!.GetType(), item.DataType));
                Set(row, "MaxLength", item.MaxLength); Set(row, "Version", version);
                Set(row, "IsRequired", item.IsRequired); Set(row, "IsActive", item.IsActive);
                var revision = Activator.CreateInstance(types.Revision)!;
                Set(revision, "TenantId", tenantId); Set(revision, "DefinitionId", destinationId);
                Set(revision, "Version", version); Set(revision, "Code", item.Code); Set(revision, "Label", item.Label);
                Set(revision, "DataType", Enum.ToObject(ReadObject(revision, "DataType")!.GetType(), item.DataType));
                Set(revision, "MaxLength", item.MaxLength); Set(revision, "IsRequired", item.IsRequired);
                Set(revision, "IsActive", item.IsActive); Set(revision, "ChangeKind", "PackageRestored");
                Set(revision, "ChangedByUserId", userId); Set(revision, "CreatedAt", now); db.Add(revision); updated++;
            }
            if (item.SourceId is Guid sourceId) customFieldIdMap[sourceId] = destinationId;
        }
        foreach (var item in package.ScreenViews ?? [])
        {
            var row = await db.TenantScreenViews.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ScreenKey == item.ScreenKey && x.Name == item.Name, ct);
            if (row is null) { row = new TenantScreenView { TenantId = tenantId, ScreenKey = item.ScreenKey, Name = item.Name, CreatedByUserId = userId, CreatedAt = now }; db.TenantScreenViews.Add(row); created++; }
            else { row.Revision++; updated++; }
            if (!TryRemapScreenLayout(item.LayoutJson, customFieldIdMap, out var layoutJson, out var layoutError))
                throw new InvalidOperationException($"Snapshot ekran düzeni eşleştirilemedi: {layoutError}");
            row.LayoutJson = layoutJson; row.IsPublished = false; row.UpdatedByUserId = userId; row.UpdatedAt = now;
            db.TenantScreenViewRevisions.Add(new TenantScreenViewRevision { TenantId = tenantId, ScreenView = row,
                Revision = row.Revision, ScreenKey = row.ScreenKey, Name = row.Name, LayoutJson = row.LayoutJson,
                ChangeKind = "PackageRestored", ChangedByUserId = userId, CreatedAt = now });
        }
        foreach (var item in package.Reports ?? [])
        {
            var row = await db.TenantSavedReports.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Kind == item.Kind && x.Name == item.Name, ct);
            if (row is null) { row = new TenantSavedReport { TenantId = tenantId, Name = item.Name, Kind = item.Kind, CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now }; db.TenantSavedReports.Add(row); created++; }
            else { row.DefinitionRevision++; updated++; }
            row.Source = item.Source; row.DefinitionJson = item.DefinitionJson; row.UpdatedByUserId = userId; row.UpdatedAt = now;
            db.TenantSavedReportRevisions.Add(new TenantSavedReportRevision { TenantId = tenantId, SavedReport = row,
                Revision = row.DefinitionRevision, Name = row.Name, Kind = row.Kind, Source = row.Source,
                DefinitionJson = row.DefinitionJson, CreatedByUserId = userId, CreatedAt = now });
        }
        foreach (var item in package.CustomMenus ?? [])
        {
            var row = await db.TenantCustomMenuEntries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct);
            if (row is null) { row = new TenantCustomMenuEntry { TenantId = tenantId, Code = item.Code, CreatedByUserId = userId, CreatedAt = now }; db.TenantCustomMenuEntries.Add(row); created++; }
            else updated++;
            row.Label = item.Label; row.TargetPage = item.TargetPage; row.Position = item.Position; row.UpdatedByUserId = userId; row.UpdatedAt = now;
        }
        if (!string.IsNullOrWhiteSpace(package.StandardMenuLayoutJson))
        {
            var row = await db.TenantStandardMenuLayouts.SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
            if (row is null) { row = new TenantStandardMenuLayout { TenantId = tenantId }; db.TenantStandardMenuLayouts.Add(row); created++; }
            else updated++;
            row.LayoutJson = package.StandardMenuLayoutJson; row.Revision++; row.UpdatedByUserId = userId; row.UpdatedAt = now;
        }
        return new RestoreOutcome(created, updated);
    }

    private static async Task<CustomizationPackageImportPlan> BuildImportPlanAsync(TenantCustomizationPackage package,
        Guid tenantId, TenantDbContext db, CancellationToken ct)
    {
        var conflicts = new List<string>();
        var existingCustomFields = await ExportCustomFieldsAsync(db, tenantId, ct);
        var currentCustomFieldKeys = existingCustomFields
            .Select(x => $"{x.Entity}:{x.Code}").ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var item in package.Forms ?? [])
            if (await db.TenantCustomFormDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct)) conflicts.Add($"form:{item.Code}");
        foreach (var item in package.Workflows ?? [])
            if (await db.TenantWorkflowDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct)) conflicts.Add($"workflow:{item.Code}");
        foreach (var item in package.BusinessRules ?? [])
            if (await db.TenantBusinessRuleDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct)) conflicts.Add($"rule:{item.Code}");
        foreach (var item in package.ScreenViews ?? [])
            if (await db.TenantScreenViews.AnyAsync(x => x.TenantId == tenantId && x.ScreenKey == item.ScreenKey && x.Name == item.Name, ct)) conflicts.Add($"screen:{item.ScreenKey}:{item.Name}");
        foreach (var item in package.Reports ?? [])
            if (await db.TenantSavedReports.AnyAsync(x => x.TenantId == tenantId && x.Kind == item.Kind && x.Name == item.Name, ct)) conflicts.Add($"report:{item.Kind}:{item.Name}");
        foreach (var item in package.CustomMenus ?? [])
            if (await db.TenantCustomMenuEntries.AnyAsync(x => x.TenantId == tenantId && x.Code == item.Code, ct)) conflicts.Add($"menu:{item.Code}");
        foreach (var item in package.CustomFields ?? [])
            if (currentCustomFieldKeys.Contains($"{item.Entity}:{item.Code}")) conflicts.Add($"field:{item.Entity}:{item.Code}");

        var standardMenuExists = !string.IsNullOrWhiteSpace(package.StandardMenuLayoutJson)
            && await db.TenantStandardMenuLayouts.AnyAsync(x => x.TenantId == tenantId
                && x.LayoutJson == package.StandardMenuLayoutJson, ct);
        var importable = (package.Forms?.Count ?? 0) + (package.Workflows?.Count ?? 0) + (package.BusinessRules?.Count ?? 0)
            + (package.ScreenViews?.Count ?? 0) + (package.Reports?.Count ?? 0) + (package.CustomMenus?.Count ?? 0)
            + (package.CustomFields?.Count ?? 0)
            + (!string.IsNullOrWhiteSpace(package.StandardMenuLayoutJson) && !standardMenuExists ? 1 : 0);
        var immediateApplyCount = Math.Max(0,
            (package.Reports?.Count ?? 0) + (package.CustomMenus?.Count ?? 0) + (package.CustomFields?.Count ?? 0)
            - conflicts.Count(key => key.StartsWith("report:", StringComparison.Ordinal)
                || key.StartsWith("menu:", StringComparison.Ordinal)
                || key.StartsWith("field:", StringComparison.Ordinal)))
            + (!string.IsNullOrWhiteSpace(package.StandardMenuLayoutJson) && !standardMenuExists ? 1 : 0);
        var screenMappingIssues = GetScreenLayoutMappingIssues(package, existingCustomFields);
        var missingWorkflowIssues = await GetMissingWorkflowReferenceIssuesAsync(package, tenantId, db, ct);
        return new CustomizationPackageImportPlan(importable - conflicts.Count, immediateApplyCount, conflicts,
            ["Çakışan tanımlar korunur ve içe aktarılmaz.", "Form, iş akışı, iş kuralı ve ekran düzenleri taslak olarak gelir; yayımlama ayrıca yapılır.",
                "İş kuralını yayımlamadan önce bağlı iş akışını yayımlayın; paket içindeki iş akışları taslak olarak aktarılır.",
                "Kayıt verileri ve form yanıtları pakete dahil değildir; içe aktarılan özel alanlar isteğe bağlı başlar."],
            GetCompatibilityIssues(package).Concat(screenMappingIssues).Concat(missingWorkflowIssues)
                .Distinct(StringComparer.Ordinal).ToArray());
    }

    private static async Task<IReadOnlyList<string>> GetMissingWorkflowReferenceIssuesAsync(
        TenantCustomizationPackage package, Guid tenantId, TenantDbContext db, CancellationToken ct)
    {
        var rules = package.BusinessRules ?? [];
        if (rules.Count == 0) return [];

        var packagedWorkflowCodes = (package.Workflows ?? [])
            .Select(workflow => workflow.Code)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var referencedWorkflowCodes = rules
            .Select(rule => rule.WorkflowCode)
            .Where(code => !packagedWorkflowCodes.Contains(code))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (referencedWorkflowCodes.Length == 0) return [];

        var existingWorkflowCodes = await db.TenantWorkflowDefinitions
            .Where(workflow => workflow.TenantId == tenantId)
            .Select(workflow => workflow.Code)
            .ToListAsync(ct);
        var existing = existingWorkflowCodes.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return rules
            .Where(rule => !packagedWorkflowCodes.Contains(rule.WorkflowCode)
                && !existing.Contains(rule.WorkflowCode))
            .Select(rule => $"İş kuralı '{rule.Code}' için '{rule.WorkflowCode}' iş akışı pakette veya hedef tenant'ta bulunamadı.")
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    private static IReadOnlyList<string> GetScreenLayoutMappingIssues(TenantCustomizationPackage package,
        IReadOnlyList<CustomFieldPackageItem> currentCustomFields)
    {
        var fieldIdMap = currentCustomFields.Where(field => field.SourceId is not null)
            .ToDictionary(field => field.SourceId!.Value, field => field.SourceId!.Value);
        foreach (var item in package.CustomFields ?? [])
        {
            if (item.SourceId is not Guid sourceId) continue;
            var target = currentCustomFields.FirstOrDefault(field =>
                string.Equals(field.Entity, item.Entity, StringComparison.OrdinalIgnoreCase)
                && string.Equals(field.Code, item.Code, StringComparison.OrdinalIgnoreCase));
            fieldIdMap[sourceId] = target?.SourceId ?? sourceId;
        }
        var issues = new List<string>();
        foreach (var view in package.ScreenViews ?? [])
        {
            if (!TryRemapScreenLayout(view.LayoutJson, fieldIdMap, out _, out var error))
                issues.Add($"Ekran düzeni '{view.Name}': {error}");
        }
        return issues;
    }

    private static IResult? Validate(TenantCustomizationPackage? package)
    {
        if (package is null) return Results.BadRequest(new { error = "Özelleştirme paketi boş." });
        if (package.SchemaVersion != SchemaVersion) return Results.Conflict(new { error = "Paket şeması desteklenmiyor.", supportedSchemaVersion = SchemaVersion });
        var count = (package.Forms?.Count ?? 0) + (package.Workflows?.Count ?? 0) + (package.BusinessRules?.Count ?? 0)
            + (package.ScreenViews?.Count ?? 0) + (package.Reports?.Count ?? 0) + (package.CustomMenus?.Count ?? 0)
            + (package.CustomFields?.Count ?? 0);
        if (count > MaximumItemsPerKind * 7) return Results.BadRequest(new { error = "Paket öğe sınırını aşıyor." });
        if ((package.Forms?.Count ?? 0) > MaximumItemsPerKind || (package.Workflows?.Count ?? 0) > MaximumItemsPerKind
            || (package.BusinessRules?.Count ?? 0) > MaximumItemsPerKind || (package.ScreenViews?.Count ?? 0) > MaximumItemsPerKind
            || (package.Reports?.Count ?? 0) > MaximumItemsPerKind || (package.CustomMenus?.Count ?? 0) > MaximumItemsPerKind
            || (package.CustomFields?.Count ?? 0) > MaximumItemsPerKind)
            return Results.BadRequest(new { error = "Bir tanım türünde en fazla 200 öğe olabilir." });
        if (JsonSerializer.SerializeToUtf8Bytes(package, JsonOptions).Length > MaximumPayloadBytes)
            return Results.BadRequest(new { error = "Paket 2 MiB sınırını aşıyor." });
        if ((package.Forms ?? []).Any(x => x is null) || (package.Workflows ?? []).Any(x => x is null)
            || (package.BusinessRules ?? []).Any(x => x is null) || (package.ScreenViews ?? []).Any(x => x is null)
            || (package.Reports ?? []).Any(x => x is null) || (package.CustomMenus ?? []).Any(x => x is null)
            || (package.CustomFields ?? []).Any(x => x is null))
            return Results.BadRequest(new { error = "Paket boş tanım öğeleri içeremez." });
        if ((package.Forms ?? []).Any(x => !ValidCode(x.Code) || string.IsNullOrWhiteSpace(x.Name) || x.Name.Length > 120
                || x.Description?.Length > 500 || x.FieldsJson is null || x.FieldsJson.Length > 100_000 || !IsJson(x.FieldsJson))
            || (package.Workflows ?? []).Any(x => !TenantWorkflowSchema.IsValidCode(x.Code) || string.IsNullOrWhiteSpace(x.Name) || x.Name.Length > 120
                || x.Description?.Length > 500 || x.StepsJson is null || x.StepsJson.Length > 100_000 || !IsJson(x.StepsJson))
            || (package.BusinessRules ?? []).Any(x => !TenantBusinessRuleEngine.IsValidCode(x.Code) || string.IsNullOrWhiteSpace(x.Name) || x.Name.Length > 120
                || x.Description?.Length > 500 || !TenantBusinessRuleEngine.IsSupportedTrigger(x.Trigger)
                || !TenantWorkflowSchema.IsValidCode(x.WorkflowCode) || x.ConditionsJson is null || x.ConditionsJson.Length > 30_000 || !IsJson(x.ConditionsJson))
            || (package.ScreenViews ?? []).Any(x => string.IsNullOrWhiteSpace(x.ScreenKey) || x.ScreenKey.Length > 40 || string.IsNullOrWhiteSpace(x.Name) || x.Name.Length > 120 || x.LayoutJson is null || x.LayoutJson.Length > 100_000 || !IsJson(x.LayoutJson))
            || (package.Reports ?? []).Any(x => string.IsNullOrWhiteSpace(x.Name) || x.Name.Length > 120
                || x.Kind is not ("Report" or "List") || string.IsNullOrWhiteSpace(x.Source) || x.Source.Length > 80
                || x.DefinitionJson is null || x.DefinitionJson.Length > 100_000 || !IsJson(x.DefinitionJson))
            || (package.CustomMenus ?? []).Any(x => !ValidCode(x.Code) || string.IsNullOrWhiteSpace(x.Label) || x.Label.Length > 80 || x.TargetPage is null || !AllowedMenuTargets.Contains(x.TargetPage))
            || (package.CustomFields ?? []).Any(x => string.IsNullOrWhiteSpace(x.Entity) || x.Entity.Length > 40 || !ValidCode(x.Code)
                || string.IsNullOrWhiteSpace(x.Label) || x.Label.Length > 120 || x.DataType is < 1 or > 4 || x.MaxLength is < 0 or > 4000
                || x.SourceId == Guid.Empty))
            return Results.BadRequest(new { error = "Paket içinde geçersiz veya sınırı aşan tanımlar var." });
        if ((package.Forms ?? []).GroupBy(x => x.Code, StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1)
            || (package.Workflows ?? []).GroupBy(x => x.Code, StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1)
            || (package.BusinessRules ?? []).GroupBy(x => x.Code, StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1)
            || (package.ScreenViews ?? []).GroupBy(x => $"{x.ScreenKey}:{x.Name}", StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1)
            || (package.CustomMenus ?? []).GroupBy(x => x.Code, StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1))
            return Results.BadRequest(new { error = "Paket aynı kodla yinelenen tanımlar içeriyor." });
        if ((package.CustomFields ?? []).GroupBy(x => $"{x.Entity}:{x.Code}", StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1))
            return Results.BadRequest(new { error = "Paket aynı modülde yinelenen özel alan kodu içeriyor." });
        if ((package.CustomFields ?? []).Where(x => x.SourceId is not null).GroupBy(x => x.SourceId).Any(x => x.Count() > 1))
            return Results.BadRequest(new { error = "Paket yinelenen özel alan kaynak kimliği içeriyor." });
        var screenSchemaIssues = new Dictionary<string, string[]>();
        foreach (var view in package.ScreenViews ?? [])
        {
            var fieldEntity = view.ScreenKey switch { "customers" => "customers", "sales-invoices" => "salesInvoices", _ => null };
            var customFields = (package.CustomFields ?? []).Where(field => field.Entity == fieldEntity && field.SourceId is not null)
                .Select((field, index) => new TenantScreenViewEndpoints.ScreenViewFieldLayout(
                    $"custom:{field.SourceId!.Value:D}", field.Label.Length > 65 ? field.Label[..65] : field.Label, false, index)).ToArray();
            if (view.LayoutJson.Contains("custom:", StringComparison.Ordinal)
                && (package.CustomFields ?? []).Any(field => field.Entity == fieldEntity && field.SourceId is null))
                continue; // Legacy packages lack field ID mappings; import keeps matching same-tenant IDs when available.
            if (!TenantScreenViewEndpoints.ValidatePackageLayout(view.ScreenKey, view.LayoutJson, customFields, out var errors))
                screenSchemaIssues[$"{view.ScreenKey}:{view.Name}"] = errors;
        }
        if (screenSchemaIssues.Count > 0)
            return Results.BadRequest(new { error = "Paket içindeki ekran düzenleri geçersiz.", screenViews = screenSchemaIssues });
        var formSchemaIssues = new Dictionary<string, string[]>();
        foreach (var form in package.Forms ?? [])
        {
            List<DynamicFormField>? fields;
            try { fields = JsonSerializer.Deserialize<List<DynamicFormField>>(form.FieldsJson, JsonOptions); }
            catch (JsonException)
            {
                formSchemaIssues[form.Code] = ["Form alan şeması okunamadı."];
                continue;
            }
            if (fields?.Any(field => field is null) == true)
            {
                formSchemaIssues[form.Code] = ["Form alan listesi boş öğe içeremez."];
                continue;
            }
            var schema = DynamicFormSchema.ValidateFields(fields);
            if (!schema.IsValid) formSchemaIssues[form.Code] = schema.Errors.ToArray();
        }
        if (formSchemaIssues.Count > 0)
            return Results.BadRequest(new { error = "Paket içindeki özel form alanları geçersiz.", forms = formSchemaIssues });
        var workflowSchemaIssues = new Dictionary<string, string[]>();
        foreach (var workflow in package.Workflows ?? [])
        {
            List<TenantWorkflowStep>? steps;
            try { steps = JsonSerializer.Deserialize<List<TenantWorkflowStep>>(workflow.StepsJson, JsonOptions); }
            catch (JsonException)
            {
                workflowSchemaIssues[workflow.Code] = ["Onay adımları okunamadı."];
                continue;
            }
            var schema = TenantWorkflowSchema.Validate(steps);
            if (!schema.IsValid) workflowSchemaIssues[workflow.Code] = schema.Errors.ToArray();
        }
        if (workflowSchemaIssues.Count > 0)
            return Results.BadRequest(new { error = "Paket içindeki iş akışı adımları geçersiz.", workflows = workflowSchemaIssues });
        var businessRuleSchemaIssues = new Dictionary<string, string[]>();
        foreach (var rule in package.BusinessRules ?? [])
        {
            List<TenantBusinessRuleCondition>? conditions;
            try { conditions = JsonSerializer.Deserialize<List<TenantBusinessRuleCondition>>(rule.ConditionsJson, JsonOptions); }
            catch (JsonException)
            {
                businessRuleSchemaIssues[rule.Code] = ["Koşullar okunamadı."];
                continue;
            }
            var schema = TenantBusinessRuleEngine.Validate(conditions, rule.Trigger);
            if (!schema.IsValid) businessRuleSchemaIssues[rule.Code] = schema.Errors.ToArray();
        }
        if (businessRuleSchemaIssues.Count > 0)
            return Results.BadRequest(new { error = "Paket içindeki iş kuralı koşulları geçersiz.", businessRules = businessRuleSchemaIssues });
        var reportSchemaIssues = new Dictionary<string, string[]>();
        foreach (var report in package.Reports ?? [])
        {
            ReportRunRequest? definition;
            try { definition = JsonSerializer.Deserialize<ReportRunRequest>(report.DefinitionJson, JsonOptions); }
            catch (JsonException)
            {
                reportSchemaIssues[report.Name] = ["Rapor tanımı okunamadı."];
                continue;
            }
            if (!ReportEndpoints.Validate(definition, out var normalized, out var errors))
                reportSchemaIssues[report.Name] = errors?.Values.SelectMany(messages => messages).ToArray()
                    ?? new[] { "Rapor tanımı geçersiz." };
            else if (report.Kind == "List" && normalized!.GroupByFields.Count > 0)
                reportSchemaIssues[report.Name] = ["Dinamik listeler gruplama içeremez."];
            else if (!string.Equals(report.Source, normalized!.Source, StringComparison.Ordinal))
                reportSchemaIssues[report.Name] = ["Rapor kaynağı, tanım içindeki kaynakla eşleşmiyor."];
        }
        if (reportSchemaIssues.Count > 0)
            return Results.BadRequest(new { error = "Paket içindeki rapor veya liste tanımları geçersiz.", reports = reportSchemaIssues });
        if (!string.IsNullOrWhiteSpace(package.StandardMenuLayoutJson)
            && (package.StandardMenuLayoutJson.Length > 100_000 || !IsJson(package.StandardMenuLayoutJson)))
            return Results.BadRequest(new { error = "Standart menü düzeni geçersiz." });
        return null;
    }

    private static async Task<IReadOnlyList<CustomFieldPackageItem>> ExportCustomFieldsAsync(
        TenantDbContext db, Guid tenantId, CancellationToken ct)
    {
        var result = new List<CustomFieldPackageItem>();
        foreach (var (entityName, types) in CustomFieldEntityTypes)
        {
            var query = TenantScopedQuery(db, types.Definition, tenantId);
            var definitions = await EntityFrameworkQueryableExtensions.ToListAsync(
                Queryable.Cast<object>(query), ct);
            foreach (var definition in definitions)
            {
                result.Add(new CustomFieldPackageItem(
                    entityName,
                    Read<string>(definition, "Code"),
                    Read<string>(definition, "Label"),
                    Convert.ToInt32(ReadObject(definition, "DataType")),
                    Read<int>(definition, "MaxLength"),
                    Read<bool>(definition, "IsRequired"),
                    Read<bool>(definition, "IsActive"),
                    Read<Guid>(definition, "Id")));
            }
        }
        return result.OrderBy(x => x.Entity, StringComparer.Ordinal)
            .ThenBy(x => x.Code, StringComparer.Ordinal).ToArray();
    }

    private static IQueryable TenantScopedQuery(TenantDbContext db, Type entityType, Guid tenantId)
    {
        var setMethod = typeof(DbContext).GetMethod(nameof(DbContext.Set), Type.EmptyTypes)!
            .MakeGenericMethod(entityType);
        var source = (IQueryable)setMethod.Invoke(db, null)!;
        var row = Expression.Parameter(entityType, "row");
        var tenant = Expression.Property(row, "TenantId");
        var predicate = Expression.Lambda(Expression.Equal(tenant, Expression.Constant(tenantId)), row);
        var where = Expression.Call(typeof(Queryable), nameof(Queryable.Where), [entityType], source.Expression, predicate);
        return source.Provider.CreateQuery(where);
    }

    private static bool AddCustomField(TenantDbContext db, Guid tenantId, Guid userId,
        CustomFieldPackageItem item, DateTimeOffset now, out Guid id)
    {
        id = Guid.Empty;
        if (!CustomFieldEntityTypes.TryGetValue(item.Entity, out var types)) return false;
        var definition = Activator.CreateInstance(types.Definition);
        var revision = Activator.CreateInstance(types.Revision);
        if (definition is null || revision is null) return false;

        id = Guid.NewGuid();
        Set(definition, "Id", id);
        Set(definition, "TenantId", tenantId);
        Set(definition, "Code", item.Code.Trim());
        Set(definition, "Label", item.Label.Trim());
        Set(definition, "DataType", Enum.ToObject(ReadObject(definition, "DataType")!.GetType(), item.DataType));
        Set(definition, "MaxLength", item.MaxLength);
        Set(definition, "Version", 1);
        Set(definition, "IsRequired", item.IsRequired);
        Set(definition, "IsActive", item.IsActive);
        Set(definition, "CreatedAt", now);

        Set(revision, "TenantId", tenantId);
        Set(revision, "DefinitionId", id);
        Set(revision, "Version", 1);
        Set(revision, "Code", item.Code.Trim());
        Set(revision, "Label", item.Label.Trim());
        Set(revision, "DataType", Enum.ToObject(ReadObject(revision, "DataType")!.GetType(), item.DataType));
        Set(revision, "MaxLength", item.MaxLength);
        Set(revision, "IsRequired", item.IsRequired);
        Set(revision, "IsActive", item.IsActive);
        Set(revision, "ChangeKind", "Imported");
        Set(revision, "ChangedByUserId", userId);
        Set(revision, "CreatedAt", now);
        db.Add(definition);
        db.Add(revision);
        return true;
    }

    private static object? ReadObject(object instance, string property) =>
        instance.GetType().GetProperty(property)?.GetValue(instance);

    private static T Read<T>(object instance, string property)
    {
        var value = ReadObject(instance, property);
        return value is T typed ? typed : (T)Convert.ChangeType(value!, typeof(T));
    }

    private static void Set(object instance, string property, object value)
    {
        var target = instance.GetType().GetProperty(property)
            ?? throw new InvalidOperationException($"Missing expected package property: {property}");
        target.SetValue(instance, value);
    }

    private static bool TryTenantContext(ClaimsPrincipal user, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = default;
        userId = default;
        role = user.FindFirstValue("role") ?? "";
        return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId)
            && Guid.TryParse(user.FindFirstValue("sub"), out userId)
            && !string.IsNullOrWhiteSpace(role);
    }

    private static Task<bool> IsAllowedAsync(IPlatformPermissionAuthorizer authorizer, Guid tenantId,
        Guid userId, string role, string action, CancellationToken ct)
    {
        var definition = PlatformPermissionCatalog.Definitions.FirstOrDefault(x =>
            x.ResourceType == "erp.tenant-customizations" && x.Action == action);
        if (definition is null) return Task.FromResult(false);
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = definition.ResourceType,
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.method"] = action is "read" ? "GET" : "POST",
            ["request.action"] = action
        };
        return authorizer.IsAllowedAsync(tenantId, userId, role,
            new ResolvedPlatformPermission(definition, attributes), ct);
    }

    private static bool ValidCode(string? value) => !string.IsNullOrWhiteSpace(value)
        && value.Length <= 40 && value.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_');

    private static bool IsJson(string value)
    {
        try { using var _ = JsonDocument.Parse(value); return true; }
        catch (JsonException) { return false; }
    }

    private static bool TryRemapScreenLayout(string json, IReadOnlyDictionary<Guid, Guid> fieldIdMap,
        out string mappedJson, out string? error)
    {
        mappedJson = json;
        error = null;
        List<TenantScreenViewEndpoints.ScreenViewFieldLayout>? fields;
        try { fields = JsonSerializer.Deserialize<List<TenantScreenViewEndpoints.ScreenViewFieldLayout>>(json, JsonOptions); }
        catch (JsonException)
        {
            error = "Ekran alanları okunamadı.";
            return false;
        }
        if (fields is null)
        {
            error = "Ekran alan listesi boş.";
            return false;
        }
        var mapped = new List<TenantScreenViewEndpoints.ScreenViewFieldLayout>(fields.Count);
        foreach (var field in fields)
        {
            if (field is null) { error = "Ekran alan listesi boş öğe içeriyor."; return false; }
            if (string.IsNullOrWhiteSpace(field.Key)) { error = "Ekran alan anahtarı boş."; return false; }
            if (!field.Key.StartsWith("custom:", StringComparison.Ordinal)) { mapped.Add(field); continue; }
            if (!Guid.TryParse(field.Key[7..], out var sourceId) || !fieldIdMap.TryGetValue(sourceId, out var destinationId))
            {
                error = $"Özel alan '{field.Label}' pakette yok veya hedef tenant'ta eşleşmesi bulunamadı.";
                return false;
            }
            mapped.Add(field with { Key = $"custom:{destinationId:D}" });
        }
        mappedJson = JsonSerializer.Serialize(mapped, JsonOptions);
        return true;
    }

    public sealed record TenantCustomizationPackage(int SchemaVersion, DateTimeOffset ExportedAt,
        IReadOnlyList<FormPackageItem>? Forms, IReadOnlyList<WorkflowPackageItem>? Workflows,
        IReadOnlyList<BusinessRulePackageItem>? BusinessRules, IReadOnlyList<ScreenViewPackageItem>? ScreenViews,
        IReadOnlyList<SavedReportPackageItem>? Reports, IReadOnlyList<CustomMenuPackageItem>? CustomMenus,
        IReadOnlyList<CustomFieldPackageItem>? CustomFields,
        string? StandardMenuLayoutJson, IReadOnlyList<string>? RequiredFeatures = null);
    public sealed record PackageImportRequest(TenantCustomizationPackage? Package, bool ConfirmImmediateApply = false);
    public sealed record FormPackageItem(string Code, string Name, string? Description, string FieldsJson);
    public sealed record WorkflowPackageItem(string Code, string Name, string? Description, string StepsJson);
    public sealed record BusinessRulePackageItem(string Code, string Name, string? Description, string Trigger, string ConditionsJson, string WorkflowCode);
    public sealed record ScreenViewPackageItem(string ScreenKey, string Name, string LayoutJson);
    public sealed record SavedReportPackageItem(string Name, string Kind, string Source, string DefinitionJson);
    public sealed record CustomMenuPackageItem(string Code, string Label, string TargetPage, int Position);
    public sealed record CustomFieldPackageItem(string Entity, string Code, string Label, int DataType, int MaxLength,
        bool IsRequired, bool IsActive, Guid? SourceId = null);
    public sealed record CustomizationPackageImportPlan(int ImportableCount, int ImmediateApplyCount, IReadOnlyList<string> Conflicts,
        IReadOnlyList<string> Warnings, IReadOnlyList<string> CompatibilityIssues);
    public sealed record PackageSnapshotRequest(string? Name);
    public sealed record PackageSnapshotListItem(Guid Id, int Version, string Name, string Sha256,
        DateTimeOffset CreatedAt, Guid CreatedByUserId);
    private sealed record RestoreOutcome(int Created, int Updated);
}
