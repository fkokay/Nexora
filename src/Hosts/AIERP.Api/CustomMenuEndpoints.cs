using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class CustomMenuEndpoints
{
    private const int MaxEntries = 30;
    private static readonly IReadOnlyDictionary<string, string> Targets = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["dashboard"] = "Genel Bakış", ["customers"] = "Cari Yönetimi", ["inventory-stock"] = "Stok Kartları",
        ["inventory-warehouses"] = "Depo Yönetimi", ["sales-quotes"] = "Satış Teklifleri", ["sales-requests"] = "Satın Alma Talepleri",
        ["sales-orders"] = "Satış Siparişleri", ["sales-invoices"] = "Satış Faturaları", ["sales-purchasing"] = "Satın Alma",
        ["finance-accounts"] = "Kasa & Banka", ["finance-statements"] = "Banka Ekstreleri", ["finance-fx"] = "Kur & Değerleme",
        ["finance-ledger"] = "Genel Muhasebe", ["finance-exposure"] = "Döviz Pozisyonu", ["finance-maturities"] = "Vade Takibi",
        ["modules"] = "Modül Pazaryeri", ["custom-forms"] = "Özel Formlar", ["workflows"] = "İş Akışları",
        ["business-rules"] = "İş Kuralları", ["reports"] = "Rapor Oluşturucu", ["custom-lists"] = "Dinamik Listeler"
    };

    public static void MapCustomMenuEndpoints(this WebApplication app)
    {
        var menus = app.MapGroup("/api/custom-menus").WithTags("Tenant Custom Navigation").RequireAuthorization();

        menus.MapGet("/targets", () => Results.Ok(Targets.Select(item => new CustomMenuTarget(item.Key, item.Value))));

        menus.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out _, out _)) return Results.Forbid();
            var entries = await db.TenantCustomMenuEntries.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Position).ThenBy(x => x.CreatedAt)
                .Select(x => new { x.Id, x.Code, x.Label, x.TargetPage, x.Position, x.CreatedAt, x.UpdatedAt })
                .Take(MaxEntries).ToListAsync(ct);
            return Results.Ok(entries.Select(x => new CustomMenuEntryView(x.Id, x.Code, x.Label, x.TargetPage,
                Targets.GetValueOrDefault(x.TargetPage, ""), x.Position, x.CreatedAt, x.UpdatedAt)));
        });

        menus.MapPost("/", async (CustomMenuWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!Validate(request, out var code, out var label, out var targetPage, out var errors)) return Results.ValidationProblem(errors!);
            if (await db.TenantCustomMenuEntries.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu menü kodu zaten kullanılıyor." });
            var count = await db.TenantCustomMenuEntries.CountAsync(x => x.TenantId == tenantId, ct);
            if (count >= MaxEntries) return Results.Problem($"Tenant başına en fazla {MaxEntries} özel menü öğesi oluşturulabilir.", statusCode: StatusCodes.Status422UnprocessableEntity);
            var now = DateTimeOffset.UtcNow;
            var entry = new TenantCustomMenuEntry
            {
                TenantId = tenantId, Code = code!, Label = label!, TargetPage = targetPage!, Position = count,
                CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.TenantCustomMenuEntries.Add(entry);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.custom-menu.created", Resource = entry.Code });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/custom-menus/{entry.Id}", ToView(entry));
        });

        menus.MapPut("/{entryId:guid}", async (Guid entryId, CustomMenuWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (!Validate(request, out var code, out var label, out var targetPage, out var errors)) return Results.ValidationProblem(errors!);
            var entry = await db.TenantCustomMenuEntries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == entryId, ct);
            if (entry is null) return Results.NotFound();
            if (await db.TenantCustomMenuEntries.AnyAsync(x => x.TenantId == tenantId && x.Id != entry.Id && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu menü kodu zaten kullanılıyor." });
            entry.Code = code!; entry.Label = label!; entry.TargetPage = targetPage!; entry.UpdatedByUserId = userId; entry.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.custom-menu.updated", Resource = entry.Code });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(entry));
        });

        menus.MapPut("/order", async (ReorderCustomMenuRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            if (request.EntryIds is null || request.EntryIds.Count > MaxEntries || request.EntryIds.Distinct().Count() != request.EntryIds.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["entryIds"] = ["Sıralama benzersiz ve en fazla 30 menü öğesi içermelidir."] });
            var entries = await db.TenantCustomMenuEntries.Where(x => x.TenantId == tenantId).ToListAsync(ct);
            if (entries.Count != request.EntryIds.Count || entries.Any(entry => !request.EntryIds.Contains(entry.Id)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["entryIds"] = ["Sıralama tenant'ın tüm özel menü öğelerini içermelidir."] });
            var byId = entries.ToDictionary(x => x.Id);
            for (var index = 0; index < request.EntryIds.Count; index++) byId[request.EntryIds[index]].Position = index;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.custom-menu.reordered", Resource = entries.Count.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            await db.SaveChangesAsync(ct);
            return Results.Ok(request.EntryIds);
        });

        menus.MapDelete("/{entryId:guid}", async (Guid entryId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId, out var userId, out var role) || role != "TenantAdmin") return Results.Forbid();
            var entry = await db.TenantCustomMenuEntries.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == entryId, ct);
            if (entry is null) return Results.NotFound();
            db.TenantCustomMenuEntries.Remove(entry);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "erp.custom-menu.deleted", Resource = entry.Code });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    private static bool Validate(CustomMenuWriteRequest request, out string? code, out string? label, out string? targetPage,
        out Dictionary<string, string[]>? errors)
    {
        code = request.Code?.Trim().ToLowerInvariant(); label = request.Label?.Trim(); targetPage = request.TargetPage?.Trim();
        errors = [];
        if (string.IsNullOrEmpty(code) || code.Length > 40 || code[0] is < 'a' or > 'z' || code.Any(ch => !(ch is >= 'a' and <= 'z' or >= '0' and <= '9' or '-' or '_')))
            errors["code"] = ["Kod küçük harfle başlamalı ve en fazla 40 küçük harf, rakam, tire veya alt çizgi içermelidir."];
        if (string.IsNullOrWhiteSpace(label) || label.Length > 80)
            errors["label"] = ["Menü adı 1-80 karakter olmalıdır."];
        if (string.IsNullOrWhiteSpace(targetPage) || !Targets.ContainsKey(targetPage))
            errors["targetPage"] = ["Yalnız katalogdaki güvenli ERP sayfaları hedeflenebilir."];
        if (errors.Count == 0) { errors = null; return true; }
        return false;
    }

    private static CustomMenuEntryView ToView(TenantCustomMenuEntry entry) =>
        new(entry.Id, entry.Code, entry.Label, entry.TargetPage, Targets[entry.TargetPage], entry.Position, entry.CreatedAt, entry.UpdatedAt);

    private static bool TryTenant(ClaimsPrincipal principal, out Guid tenantId, out Guid userId, out string role)
    {
        tenantId = default; userId = default; role = principal.FindFirstValue("role") ?? "";
        return Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId)
            && Guid.TryParse(principal.FindFirstValue("sub"), out userId) && !string.IsNullOrWhiteSpace(role);
    }
}

public sealed record CustomMenuTarget(string Page, string Label);
public sealed record CustomMenuEntryView(Guid Id, string Code, string Label, string TargetPage, string TargetLabel,
    int Position, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record CustomMenuWriteRequest(string? Code, string? Label, string? TargetPage);
public sealed record ReorderCustomMenuRequest(IReadOnlyList<Guid>? EntryIds);
