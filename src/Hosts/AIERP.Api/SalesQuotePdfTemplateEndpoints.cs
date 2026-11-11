using System.Security.Claims;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal static class SalesQuotePdfTemplateEndpoints
{
    private static readonly Regex ColorPattern = new("^#[0-9A-Fa-f]{6}$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static void MapSalesQuotePdfTemplateEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/sales/quote-pdf-templates").RequireAuthorization().WithTags("Teklif PDF şablonları");
        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId)) return Results.Forbid();
            var rows = await db.SalesQuotePdfTemplates.AsNoTracking().Where(x => x.TenantId == tenantId).OrderByDescending(x => x.IsDefault).ThenBy(x => x.Name).ToListAsync(ct);
            if (rows.Count == 0)
            {
                rows = [
                    new SalesQuotePdfTemplate { TenantId = tenantId, Name = "Kurumsal", IsDefault = true },
                    new SalesQuotePdfTemplate { TenantId = tenantId, Name = "Sade", Heading = "Fiyat teklifi", IntroText = "Talebiniz için hazırlanan teklif aşağıdadır.", FooterText = "Saygılarımızla", Layout = "compact" }
                ];
                db.SalesQuotePdfTemplates.AddRange(rows);
                await db.SaveChangesAsync(ct);
            }
            return Results.Ok(rows);
        });
        group.MapPost("/", async (SalesQuotePdfTemplateWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            if (Validate(request) is { } errors) return Results.ValidationProblem(errors);
            if (await db.SalesQuotePdfTemplates.AnyAsync(x => x.TenantId == tenantId && x.Name == request.Name!.Trim(), ct)) return Results.Conflict(new { error = "Bu şablon adı zaten kullanılıyor." });
            if (request.IsDefault) await db.SalesQuotePdfTemplates.Where(x => x.TenantId == tenantId && x.IsDefault).ExecuteUpdateAsync(update => update.SetProperty(x => x.IsDefault, false), ct);
            var row = new SalesQuotePdfTemplate { TenantId = tenantId, Name = request.Name!.Trim(), Heading = request.Heading!.Trim(), IntroText = request.IntroText!.Trim(), FooterText = request.FooterText!.Trim(), AccentColor = request.AccentColor!.ToUpperInvariant(), FontFamily = request.FontFamily!, Layout = request.Layout!, LogoDataUrl = request.LogoDataUrl ?? "", LogoPosition = request.LogoPosition!, ShowNotes = request.ShowNotes, IsDefault = request.IsDefault };
            db.SalesQuotePdfTemplates.Add(row);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-quote-pdf-template.created", Resource = row.Name });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/sales/quote-pdf-templates/{row.Id}", row);
        });
        group.MapPut("/{id:guid}", async (Guid id, SalesQuotePdfTemplateWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            if (Validate(request) is { } errors) return Results.ValidationProblem(errors);
            var row = await db.SalesQuotePdfTemplates.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (row is null) return Results.NotFound();
            var name = request.Name!.Trim();
            if (await db.SalesQuotePdfTemplates.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Name == name, ct)) return Results.Conflict(new { error = "Bu şablon adı zaten kullanılıyor." });
            if (request.IsDefault) await db.SalesQuotePdfTemplates.Where(x => x.TenantId == tenantId && x.Id != id && x.IsDefault).ExecuteUpdateAsync(update => update.SetProperty(x => x.IsDefault, false), ct);
            row.Name = name; row.Heading = request.Heading!.Trim(); row.IntroText = request.IntroText!.Trim(); row.FooterText = request.FooterText!.Trim(); row.AccentColor = request.AccentColor!.ToUpperInvariant(); row.FontFamily = request.FontFamily!; row.Layout = request.Layout!; row.LogoDataUrl = request.LogoDataUrl ?? ""; row.LogoPosition = request.LogoPosition!; row.ShowNotes = request.ShowNotes; row.IsDefault = request.IsDefault; row.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-quote-pdf-template.updated", Resource = row.Name });
            await db.SaveChangesAsync(ct);
            return Results.Ok(row);
        });
        group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            var row = await db.SalesQuotePdfTemplates.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (row is null) return Results.NotFound();
            if (await db.SalesQuotePdfTemplates.CountAsync(x => x.TenantId == tenantId, ct) <= 1) return Results.Conflict(new { error = "En az bir teklif PDF şablonu kalmalıdır." });
            db.SalesQuotePdfTemplates.Remove(row);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-quote-pdf-template.deleted", Resource = row.Name });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    private static Dictionary<string, string[]>? Validate(SalesQuotePdfTemplateWrite request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 80) errors["name"] = ["Şablon adı zorunludur ve 80 karakteri aşamaz."];
        if (string.IsNullOrWhiteSpace(request.Heading) || request.Heading.Trim().Length > 100) errors["heading"] = ["Başlık zorunludur ve 100 karakteri aşamaz."];
        if (request.IntroText?.Length > 500) errors["introText"] = ["Giriş metni 500 karakteri aşamaz."];
        if (request.FooterText?.Length > 500) errors["footerText"] = ["Alt bilgi 500 karakteri aşamaz."];
        if (request.AccentColor is null || !ColorPattern.IsMatch(request.AccentColor)) errors["accentColor"] = ["Vurgu rengi #RRGGBB biçiminde olmalıdır."];
        if (request.FontFamily is not ("Arial" or "Inter" or "Georgia" or "Verdana" or "Tahoma")) errors["fontFamily"] = ["Desteklenen bir yazı tipi seçin."];
        if (request.Layout is not ("classic" or "modern" or "compact")) errors["layout"] = ["Desteklenen bir sayfa yerleşimi seçin."];
        if (request.LogoPosition is not ("left" or "center" or "right")) errors["logoPosition"] = ["Logo konumu sol, orta veya sağ olmalıdır."];
        if (request.LogoDataUrl is { Length: > 350_000 }) errors["logoDataUrl"] = ["Logo dosyası 256 KB sınırını aşamaz."];
        if (!string.IsNullOrEmpty(request.LogoDataUrl) && !Regex.IsMatch(request.LogoDataUrl, "^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$", RegexOptions.CultureInvariant)) errors["logoDataUrl"] = ["Logo yalnızca PNG, JPEG veya WebP biçiminde olabilir."];
        return errors.Count == 0 ? null : errors;
    }

    private static bool TryTenant(ClaimsPrincipal user, out Guid tenantId) => Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
    private static bool TryAdmin(ClaimsPrincipal user, out Guid tenantId, out Guid? userId)
    {
        userId = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var parsed) ? parsed : null;
        return TryTenant(user, out tenantId) && user.FindFirstValue("role") == "TenantAdmin";
    }
}

internal sealed record SalesQuotePdfTemplateWrite(string? Name, string? Heading, string? IntroText, string? FooterText, string? AccentColor, bool ShowNotes, bool IsDefault = false, string? FontFamily = "Arial", string? Layout = "classic", string? LogoDataUrl = "", string? LogoPosition = "left");
