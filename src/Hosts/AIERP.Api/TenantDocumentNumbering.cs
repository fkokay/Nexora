using System.Security.Claims;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

public static class TenantDocumentNumbering
{
    private static readonly string[] Types = ["SalesQuote", "PurchaseRequest", "SalesOrder", "SalesDelivery", "SalesInvoice", "EInvoice", "EDelivery", "EArchive"];
    private static readonly Regex Tokens = new(@"\{(YYYY|YY|SEQ:[1-9][0-9]?)\}", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static void MapTenantDocumentNumbering(this WebApplication app)
    {
        var group = app.MapGroup("/api/document-number-templates").RequireAuthorization().WithTags("Belge numara şablonları");
        group.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!GetTenant(user, out var tenantId)) return Results.Json(new { error = "tenant_context_required", message = "An active company session is required." }, statusCode: StatusCodes.Status403Forbidden);
            var rows = await db.TenantDocumentNumberTemplates.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync(ct);
            return Results.Ok(Types.SelectMany(type => Scenarios(type).Select(scenario =>
            {
                var row = rows.SingleOrDefault(x => x.DocumentType == type && x.ScenarioCode == scenario);
                return new { documentType = type, scenarioCode = scenario, pattern = row?.Pattern ?? DefaultPattern(type), resetsYearly = row?.ResetsYearly ?? true };
            })));
        });
        group.MapPut("/", async (TemplateWrite request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!GetTenant(user, out var tenantId)) return Results.Json(new { error = "tenant_context_required", message = "An active company session is required." }, statusCode: StatusCodes.Status403Forbidden);
            var type = request.DocumentType?.Trim();
            var scenario = string.IsNullOrWhiteSpace(request.ScenarioCode) ? null : request.ScenarioCode.Trim().ToUpperInvariant();
            if (type is null || !Types.Contains(type) || !Scenarios(type).Contains(scenario, StringComparer.OrdinalIgnoreCase))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["documentType"] = ["Belge türü veya senaryo geçersiz."] });
            if (!ValidPattern(type!, request.Pattern)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["pattern"] = [IsElectronic(type!) ? "E-belge şablonu 3 harf/rakam + {YYYY} + {SEQ:9} biçiminde olmalı ve tam 16 karakter üretmelidir." : "Şablon {YYYY}, {YY}, sabit metin ve tek bir {SEQ:n} belirteci içerebilir."] });
            var row = await db.TenantDocumentNumberTemplates.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DocumentType == type && x.ScenarioCode == scenario, ct);
            if (row is null) db.TenantDocumentNumberTemplates.Add(new TenantDocumentNumberTemplate { TenantId = tenantId, DocumentType = type, ScenarioCode = scenario, Pattern = request.Pattern.Trim(), ResetsYearly = request.ResetsYearly });
            else { row.Pattern = request.Pattern.Trim(); row.ResetsYearly = request.ResetsYearly; row.UpdatedAt = DateTimeOffset.UtcNow; }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { documentType = type, scenarioCode = scenario, pattern = request.Pattern.Trim(), resetsYearly = request.ResetsYearly });
        });
        group.MapPost("/preview", (TemplatePreview request) => !ValidPattern(request.DocumentType, request.Pattern)
            ? Results.ValidationProblem(new Dictionary<string, string[]> { ["pattern"] = ["Geçerli bir {SEQ:n} sıra belirteci ekleyin."] })
            : Results.Ok(new { code = Render(request.Pattern, DateTime.UtcNow, Math.Max(1, request.Sequence ?? 1)), length = Render(request.Pattern, DateTime.UtcNow, Math.Max(1, request.Sequence ?? 1)).Length }));
        group.MapPost("/{documentType}/next", async (string documentType, string? scenarioCode, DateOnly? date, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!GetTenant(user, out var tenantId)) return Results.Json(new { error = "tenant_context_required", message = "An active company session is required." }, statusCode: StatusCodes.Status403Forbidden);
            var type = documentType.Trim();
            var scenario = string.IsNullOrWhiteSpace(scenarioCode) ? null : scenarioCode.Trim().ToUpperInvariant();
            if (!Types.Contains(type) || !Scenarios(type).Contains(scenario, StringComparer.OrdinalIgnoreCase)) return Results.NotFound();
            var documentDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var code = await NextAsync(db, tenantId, type, scenario, documentDate, ct);
            return Results.Ok(new { documentType = type, scenarioCode = scenario, code, length = code.Length });
        });
    }

    public static async Task<string> NextAsync(TenantDbContext db, Guid tenantId, string type, string? scenario, DateOnly date, CancellationToken ct)
    {
        await using var ownTransaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var template = await db.TenantDocumentNumberTemplates.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DocumentType == type && x.ScenarioCode == scenario, ct);
        var pattern = template?.Pattern ?? DefaultPattern(type);
        var period = template?.ResetsYearly ?? true ? date.Year.ToString("0000") : "GLOBAL";
        var scenarioKey = type == "EInvoice" ? "" : scenario ?? "";
        var counter = db.Database.IsSqlServer()
            ? await db.TenantDocumentNumberCounters.FromSqlInterpolated($"SELECT * FROM [dbo].[TenantDocumentNumberCounters] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [DocumentType] = {type} AND [ScenarioKey] = {scenarioKey} AND [PeriodKey] = {period}").SingleOrDefaultAsync(ct)
            : await db.TenantDocumentNumberCounters.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DocumentType == type && x.ScenarioKey == scenarioKey && x.PeriodKey == period, ct);
        if (counter is null)
        {
            counter = new TenantDocumentNumberCounter { TenantId = tenantId, DocumentType = type, ScenarioKey = scenarioKey, PeriodKey = period, LastValue = 1 };
            db.TenantDocumentNumberCounters.Add(counter);
        }
        else counter.LastValue = checked(counter.LastValue + 1);
        await db.SaveChangesAsync(ct);
        if (IsElectronic(type) && counter.LastValue > 999_999_999) throw new InvalidOperationException("Bu e-belge serisinde 9 haneli sıra numarası tükendi; yeni bir seri tanımlayın.");
        var result = Render(pattern, date.ToDateTime(TimeOnly.MinValue), counter.LastValue);
        if (IsElectronic(type) && result.Length != 16) throw new InvalidOperationException("E-belge numarası 16 karakter olmalıdır.");
        if (ownTransaction is not null) await ownTransaction.CommitAsync(ct);
        return result;
    }

    public static (string Type, string? Scenario) InvoiceSeries(string? scenario)
    {
        var normalized = scenario?.Trim().ToUpperInvariant();
        return normalized switch
        {
            "EARSIVFATURA" => ("EArchive", "EARSIVFATURA"),
            "TEMELFATURA" or "TICARIFATURA" or "IHRACAT" or "YOLCUBERABERFATURA" or "KAMU" or "HKS" or "ENERJI" or "ILAC_TIBBICIHAZ" => ("EInvoice", normalized),
            _ => ("SalesInvoice", null)
        };
    }

    private static IEnumerable<string?> Scenarios(string type) => type switch
    {
        "EInvoice" => ["TEMELFATURA", "TICARIFATURA", "IHRACAT", "YOLCUBERABERFATURA", "KAMU", "HKS", "ENERJI", "ILAC_TIBBICIHAZ"],
        "EDelivery" => ["EIRSALIYE"], "EArchive" => ["EARSIVFATURA"], _ => [null]
    };
    private static string DefaultPattern(string type) => type switch
    {
        "EArchive" => "NXA{YYYY}{SEQ:9}", "EDelivery" => "NXD{YYYY}{SEQ:9}",
        "EInvoice" => "NXR{YYYY}{SEQ:9}", _ => "NXR{YYYY}{SEQ:6}"
    };
    private static bool IsElectronic(string type) => type is "EInvoice" or "EDelivery" or "EArchive";
    private static bool ValidPattern(string type, string? pattern)
    {
        if (string.IsNullOrWhiteSpace(pattern) || pattern.Length > 80) return false;
        if (IsElectronic(type)) return Regex.IsMatch(pattern, @"^[A-Za-z0-9]{3}\{YYYY\}\{SEQ:9\}$", RegexOptions.CultureInvariant);
        return Tokens.Matches(pattern).Count(m => m.Groups[1].Value.StartsWith("SEQ:", StringComparison.Ordinal)) == 1 && Regex.Replace(pattern, @"\{(YYYY|YY|SEQ:[1-9][0-9]?)\}", "", RegexOptions.CultureInvariant).IndexOfAny(['{', '}']) < 0;
    }
    private static string Render(string pattern, DateTime date, long value) => Tokens.Replace(pattern, m => m.Groups[1].Value switch
    {
        "YYYY" => date.ToString("yyyy"), "YY" => date.ToString("yy"), _ => value.ToString(new string('0', int.Parse(m.Groups[1].Value.AsSpan(4))))
    });
    private static bool GetTenant(ClaimsPrincipal user, out Guid tenantId) => Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
    public sealed record TemplateWrite(string? DocumentType, string? ScenarioCode, string Pattern, bool ResetsYearly = true);
    public sealed record TemplatePreview(string DocumentType, string Pattern, long? Sequence);
}
