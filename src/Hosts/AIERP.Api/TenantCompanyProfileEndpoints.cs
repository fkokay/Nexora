using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class TenantCompanyProfileEndpoints
{
    public static void MapTenantCompanyProfileEndpoints(this WebApplication app)
    {
        var profile = app.MapGroup("/api/tenant-company-profile").WithTags("Firma profili").RequireAuthorization();

        profile.MapGet("/", async (ClaimsPrincipal user, PlatformDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var membership = await db.TenantMemberships.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.UserId == userId && x.User.IsActive && x.Tenant.IsActive)
                .Select(x => new { x.Role })
                .SingleOrDefaultAsync(ct);
            if (membership is null) return Results.Forbid();

            var row = await db.TenantCompanyProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
            context.Response.Headers["Cache-Control"] = "no-store";
            var isTaxNumberMasked = membership.Role != "TenantAdmin" && row?.TaxNumber is not null;
            return Results.Ok(new TenantCompanyProfileView(tenantId, row?.LegalName ?? "", row?.TaxOffice,
                isTaxNumberMasked ? MaskTaxNumber(row!.TaxNumber!) : row?.TaxNumber, row?.UpdatedAt, isTaxNumberMasked));
        });

        profile.MapPut("/", async (TenantCompanyProfileUpdate request, ClaimsPrincipal user, PlatformDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var membership = await db.TenantMemberships.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId && x.User.IsActive && x.Tenant.IsActive, ct);
            if (membership is null || membership.Role != "TenantAdmin") return Results.Forbid();

            var errors = Validate(request);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var row = await db.TenantCompanyProfiles.SingleOrDefaultAsync(x => x.TenantId == tenantId, ct);
            if (row is null)
            {
                row = new TenantCompanyProfile { TenantId = tenantId };
                db.TenantCompanyProfiles.Add(row);
            }
            row.LegalName = request.LegalName!.Trim();
            row.TaxOffice = Normalize(request.TaxOffice);
            row.TaxNumber = Normalize(request.TaxNumber);
            row.UpdatedByUserId = userId;
            row.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                UserId = userId,
                Action = "tenant.company-profile.updated",
                Resource = "legal-identity"
            });
            await db.SaveChangesAsync(ct);

            context.Response.Headers["Cache-Control"] = "no-store";
            return Results.Ok(new TenantCompanyProfileView(tenantId, row.LegalName, row.TaxOffice, row.TaxNumber, row.UpdatedAt, false));
        });
    }

    private static Dictionary<string, string[]> Validate(TenantCompanyProfileUpdate request)
    {
        var errors = new Dictionary<string, string[]>();
        var legalName = request.LegalName?.Trim();
        var taxOffice = request.TaxOffice?.Trim();
        var taxNumber = request.TaxNumber?.Trim();
        if (string.IsNullOrWhiteSpace(legalName)) errors["legalName"] = ["Ticari unvan zorunludur."];
        else if (legalName.Length > 200) errors["legalName"] = ["Ticari unvan en fazla 200 karakter olabilir."];
        if (taxOffice?.Length > 100) errors["taxOffice"] = ["Vergi dairesi en fazla 100 karakter olabilir."];
        if (!string.IsNullOrEmpty(taxNumber) && (taxNumber.Length != 10 || taxNumber.Any(c => c is < '0' or > '9')))
            errors["taxNumber"] = ["Vergi numarası 10 rakamdan oluşmalıdır."];
        return errors;
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string MaskTaxNumber(string value) => value.Length <= 4
        ? new string('*', value.Length)
        : $"{new string('*', value.Length - 4)}{value[^4..]}";

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }
}

public sealed record TenantCompanyProfileUpdate(string? LegalName, string? TaxOffice, string? TaxNumber);
public sealed record TenantCompanyProfileView(Guid TenantId, string LegalName, string? TaxOffice, string? TaxNumber,
    DateTimeOffset? UpdatedAt, bool TaxNumberMasked);
