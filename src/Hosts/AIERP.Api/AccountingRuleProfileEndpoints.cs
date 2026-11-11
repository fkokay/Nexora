using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal static class AccountingRuleProfileEndpoints
{
    internal sealed record TaxRuleMappingOption(string MappingKey, string Label);

    internal static string TaxRuleMappingKey(string profileCode, string operationType, string taxCode)
    {
        static string ShortHash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value.Trim().ToUpperInvariant()))[..6]).ToLowerInvariant();
        var operation = operationType.Equals("Sales", StringComparison.OrdinalIgnoreCase) ? "s" : "p";
        return $"{LedgerMappingKeys.TaxRulePrefix}{ShortHash(profileCode)}.{operation}.{ShortHash(taxCode)}";
    }

    internal static IReadOnlyList<TaxRuleMappingOption> GetTaxRuleMappings(AccountingRuleProfile profile)
    {
        var rules = new Dictionary<string, (string Name, string Treatment)>(StringComparer.OrdinalIgnoreCase)
        {
            ["VAT"] = ("KDV / VAT", "Additive")
        };
        try
        {
            using var document = JsonDocument.Parse(profile.ParametersJson);
            if (document.RootElement.TryGetProperty("taxRules", out var taxRules) && taxRules.ValueKind == JsonValueKind.Array)
            {
                foreach (var rule in taxRules.EnumerateArray())
                {
                    if (rule.ValueKind != JsonValueKind.Object || !rule.TryGetProperty("code", out var codeProperty) || codeProperty.ValueKind != JsonValueKind.String) continue;
                    var code = codeProperty.GetString()?.Trim().ToUpperInvariant();
                    if (string.IsNullOrWhiteSpace(code)) continue;
                    var name = rule.TryGetProperty("name", out var nameProperty) && nameProperty.ValueKind == JsonValueKind.String ? nameProperty.GetString() : code;
                    var treatment = rule.TryGetProperty("treatment", out var treatmentProperty) && treatmentProperty.ValueKind == JsonValueKind.String ? treatmentProperty.GetString() : "Additive";
                    rules[code] = (name ?? code, treatment ?? "Additive");
                }
            }
        }
        catch (JsonException) { return []; }
        return rules.SelectMany(rule => new[] { "Sales", "Purchase" }.Select(operation => new TaxRuleMappingOption(
            TaxRuleMappingKey(profile.ProfileCode, operation, rule.Key),
            $"{profile.Name} · {(operation == "Sales" ? "Satış" : "Alış")} · {rule.Value.Name} ({rule.Key}) · {(rule.Value.Treatment == "Withholding" ? "Tevkifat" : "Vergi")}"))).ToArray();
    }

    internal static async Task<(AccountingRuleProfile? Profile, string? Error)> ResolveDocumentProfileAsync(
        TenantDbContext db, Guid tenantId, DateOnly documentDate, string? requestedCode, CancellationToken ct = default)
    {
        var candidates = await db.AccountingRuleProfiles.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive &&
            x.EffectiveFrom <= documentDate && (x.EffectiveTo == null || x.EffectiveTo >= documentDate)).ToListAsync(ct);
        if (!string.IsNullOrWhiteSpace(requestedCode))
        {
            var selected = candidates.SingleOrDefault(x => x.ProfileCode == requestedCode.Trim().ToUpperInvariant());
            return selected is null ? (null, "İstenen mevzuat profili bu belge tarihinde etkin değil.") : (selected, null);
        }
        var taxProfiles = candidates.Where(HasTaxRules).ToArray();
        var configuredDefaults = taxProfiles.Where(IsDefaultForDocuments).ToArray();
        if (configuredDefaults.Length > 1)
            return (null, "Birden fazla varsayılan vergi profili bu belge tarihinde etkin. Mevzuat profillerinin varsayılan seçimini veya yürürlük tarihlerini düzeltin.");
        var defaultProfile = configuredDefaults.SingleOrDefault();
        // Backward compatibility for tenants that have not selected a default profile yet.
        defaultProfile ??= taxProfiles.SingleOrDefault(x => x.ProfileCode == "TR-LOCAL");
        if (defaultProfile is not null) return (defaultProfile, null);
        return taxProfiles.Length switch
        {
            0 => (null, null),
            1 => (taxProfiles[0], null),
            _ => (null, "Birden fazla etkin vergi profili var. Fatura isteğinde accountingProfileCode seçilmelidir.")
        };
    }

    private static bool HasTaxRules(AccountingRuleProfile profile)
    {
        try
        {
            using var document = JsonDocument.Parse(profile.ParametersJson);
            return document.RootElement.TryGetProperty("taxRules", out var rules) && rules.ValueKind == JsonValueKind.Array && rules.GetArrayLength() > 0;
        }
        catch (JsonException) { return false; }
    }

    private static bool IsDefaultForDocuments(AccountingRuleProfile profile)
    {
        try
        {
            using var document = JsonDocument.Parse(profile.ParametersJson);
            return document.RootElement.TryGetProperty("defaultForDocuments", out var value) && value.ValueKind == JsonValueKind.True;
        }
        catch (JsonException) { return false; }
    }

    public static RouteGroupBuilder MapAccountingProfileEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/rule-profiles", async (ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryTenant(principal, out var tenantId)) return Results.Forbid();
            var profiles = await db.AccountingRuleProfiles.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.JurisdictionCode).ThenBy(x => x.ProfileCode).ToListAsync();
            return Results.Ok(profiles.Select(ToView));
        });
        group.MapPut("/rule-profiles/{profileCode}", async (string profileCode, AccountingRuleProfileWriteRequest request,
            ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryTenant(principal, out var tenantId) || principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
            profileCode = profileCode.Trim().ToUpperInvariant();
            var name = request.Name.Trim();
            var jurisdiction = request.JurisdictionCode.Trim().ToUpperInvariant();
            var standard = request.ReportingStandard.Trim().ToUpperInvariant();
            var currency = request.BaseCurrencyCode.Trim().ToUpperInvariant();
            if (profileCode.Length is < 2 or > 32 || request.ProfileCode.Trim().ToUpperInvariant() != profileCode
                || name.Length is 0 or > 120 || jurisdiction.Length is < 2 or > 8 || standard.Length is < 2 or > 32
                || currency.Length != 3 || currency.Any(c => !char.IsAsciiLetter(c))
                || request.FiscalYearStartMonth is < 1 or > 12 || request.EffectiveTo is { } end && end < request.EffectiveFrom)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["profile"] = ["Profil kodu, ad, yetki alanı, raporlama standardı, üç harfli para birimi, mali yıl başlangıcı ve yürürlük aralığını kontrol edin."] });
            if (!TryNormalizeParameters(request.ParametersJson, out var parameters))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["parametersJson"] = ["Mevzuat parametreleri geçerli bir JSON nesnesi olmalıdır."] });
            if (request.IsActive && IsDefaultForDocuments(parameters))
            {
                var otherDefaults = await db.AccountingRuleProfiles.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    x.IsActive && x.ProfileCode != profileCode && x.EffectiveFrom <= (request.EffectiveTo ?? DateOnly.MaxValue) &&
                    (x.EffectiveTo == null || x.EffectiveTo >= request.EffectiveFrom)).ToListAsync();
                if (otherDefaults.Any(IsDefaultForDocuments))
                    return Results.Conflict(new { error = "Bu tarih aralığında başka bir etkin varsayılan profil var. Tek bir varsayılan seçin veya profillerin yürürlük tarihlerini ayırın." });
            }
            var officialSource = request.OfficialSourceUrl?.Trim() ?? "";
            if (officialSource.Length > 500 || officialSource.Length > 0 && !Uri.TryCreate(officialSource, UriKind.Absolute, out _))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["officialSourceUrl"] = ["Resmi kaynak bağlantısı en fazla 500 karakterlik mutlak URL olmalıdır."] });
            var profile = await db.AccountingRuleProfiles.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProfileCode == profileCode);
            if (profile is null)
            {
                profile = new AccountingRuleProfile { TenantId = tenantId, ProfileCode = profileCode };
                db.AccountingRuleProfiles.Add(profile);
            }
            profile.Name = name;
            profile.JurisdictionCode = jurisdiction;
            profile.ReportingStandard = standard;
            profile.BaseCurrencyCode = currency;
            profile.FiscalYearStartMonth = request.FiscalYearStartMonth;
            profile.EffectiveFrom = request.EffectiveFrom;
            profile.EffectiveTo = request.EffectiveTo;
            profile.ParametersJson = parameters;
            profile.OfficialSourceUrl = officialSource;
            profile.IsActive = request.IsActive;
            profile.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal),
                Action = "finance.accounting-rule-profile.saved", Resource = $"{profileCode}:{jurisdiction}:{standard}" });
            await db.SaveChangesAsync();
            return Results.Ok(ToView(profile));
        });
        group.MapPost("/rule-profiles/{profileCode}/tax-preview", async (string profileCode, AccountingTaxPreviewRequest request,
            ClaimsPrincipal principal, TenantDbContext db) =>
        {
            if (!TryTenant(principal, out var tenantId)) return Results.Forbid();
            profileCode = profileCode.Trim().ToUpperInvariant();
            var profile = await db.AccountingRuleProfiles.AsNoTracking().SingleOrDefaultAsync(x =>
                x.TenantId == tenantId && x.ProfileCode == profileCode && x.IsActive && x.EffectiveFrom <= request.DocumentDate &&
                (x.EffectiveTo == null || x.EffectiveTo >= request.DocumentDate));
            if (profile is null) return Results.NotFound(new { error = "Belge tarihi için etkin mevzuat profili bulunamadı." });
            if (request.TaxableAmount < 0 || request.TaxableAmount > 9999999999999999.99m ||
                request.TaxableAmount != decimal.Round(request.TaxableAmount, 2) ||
                request.OperationType is not ("Sales" or "Purchase"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = ["Matrah iki ondalık basamakta sıfır veya pozitif, işlem türü Sales veya Purchase olmalıdır."] });
            if (!TryReadTaxRules(profile.ParametersJson, out var rules))
                return Results.Conflict(new { error = "Profilin taxRules parametresi geçersiz. Vergi kuralı kodu, adı, oranı, uygulama türü ve hesaplama tabanı tanımlarını kontrol edin." });

            var due = request.TaxableAmount;
            var additive = 0m;
            var withholding = 0m;
            var calculated = new List<AccountingTaxPreviewLine>();
            foreach (var rule in rules.Where(x => x.Active && (x.OperationType == "Both" || x.OperationType == request.OperationType) &&
                         (x.EffectiveFrom is null || x.EffectiveFrom <= request.DocumentDate) &&
                         (x.EffectiveTo is null || x.EffectiveTo >= request.DocumentDate)))
            {
                var basis = rule.CalculationBase == "PreviousTaxInclusive" ? due : request.TaxableAmount;
                var amount = decimal.Round(basis * rule.Rate / 100m, 2, MidpointRounding.AwayFromZero);
                if (rule.Treatment == "Withholding") withholding += amount;
                else { additive += amount; due += amount; }
                calculated.Add(new AccountingTaxPreviewLine(rule.Code, rule.Name, rule.Rate, rule.Treatment,
                    rule.CalculationBase, basis, amount));
            }
            return Results.Ok(new AccountingTaxPreviewView(profile.ProfileCode, profile.JurisdictionCode, profile.BaseCurrencyCode,
                request.TaxableAmount, additive, withholding, request.TaxableAmount + additive - withholding, calculated));
        });
        return group;
    }

    private static bool TryNormalizeParameters(string? value, out string normalized)
    {
        normalized = "{}";
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(value) ? "{}" : value);
            if (document.RootElement.ValueKind != JsonValueKind.Object || Encoding.UTF8.GetByteCount(value ?? "{}") > 65_536) return false;
            if (document.RootElement.TryGetProperty("defaultForDocuments", out var defaultForDocuments) &&
                defaultForDocuments.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
            if (document.RootElement.TryGetProperty("taxRules", out var taxRules) && !TryParseTaxRules(taxRules, out _)) return false;
            normalized = document.RootElement.GetRawText();
            return true;
        }
        catch (JsonException) { return false; }
    }

    private sealed record TaxRule(string Code, string Name, decimal Rate, string OperationType, string Treatment,
        string CalculationBase, bool Active, DateOnly? EffectiveFrom, DateOnly? EffectiveTo);

    private static bool TryReadTaxRules(string json, out IReadOnlyList<TaxRule> rules)
    {
        rules = [];
        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("taxRules", out var property)) return true;
            return TryParseTaxRules(property, out rules);
        }
        catch (JsonException) { return false; }
    }

    private static bool IsDefaultForDocuments(string parametersJson)
    {
        try
        {
            using var document = JsonDocument.Parse(parametersJson);
            return document.RootElement.TryGetProperty("defaultForDocuments", out var value) && value.ValueKind == JsonValueKind.True;
        }
        catch (JsonException) { return false; }
    }

    private static bool TryParseTaxRules(JsonElement value, out IReadOnlyList<TaxRule> rules)
    {
        rules = [];
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 100) return false;
        var parsed = new List<TaxRule>();
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("code", out var codeValue) || codeValue.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("name", out var nameValue) || nameValue.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("rate", out var rateValue) || !rateValue.TryGetDecimal(out var rate)) return false;
            var code = codeValue.GetString()?.Trim().ToUpperInvariant() ?? "";
            var name = nameValue.GetString()?.Trim() ?? "";
            var operation = item.TryGetProperty("operationType", out var operationValue)
                ? operationValue.ValueKind == JsonValueKind.String ? operationValue.GetString() : null : "Both";
            var treatment = item.TryGetProperty("treatment", out var treatmentValue)
                ? treatmentValue.ValueKind == JsonValueKind.String ? treatmentValue.GetString() : null : "Additive";
            var calculationBase = item.TryGetProperty("calculationBase", out var baseValue)
                ? baseValue.ValueKind == JsonValueKind.String ? baseValue.GetString() : null : "Net";
            var active = true;
            if (item.TryGetProperty("active", out var activeValue))
            {
                if (activeValue.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
                active = activeValue.GetBoolean();
            }
            DateOnly? from = null; DateOnly? to = null;
            if (item.TryGetProperty("effectiveFrom", out var fromValue) && fromValue.ValueKind != JsonValueKind.Null)
            {
                if (fromValue.ValueKind != JsonValueKind.String || !DateOnly.TryParse(fromValue.GetString(), out var effectiveFrom)) return false;
                from = effectiveFrom;
            }
            if (item.TryGetProperty("effectiveTo", out var toValue) && toValue.ValueKind != JsonValueKind.Null)
            {
                if (toValue.ValueKind != JsonValueKind.String || !DateOnly.TryParse(toValue.GetString(), out var effectiveTo)) return false;
                to = effectiveTo;
            }
            if (code.Length is < 1 or > 32 || code.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_') || !codes.Add(code) ||
                name.Length is < 1 or > 100 || rate is < 0 or > 100 || rate != decimal.Round(rate, 4) ||
                operation is not ("Sales" or "Purchase" or "Both") || treatment is not ("Additive" or "Withholding") ||
                calculationBase is not ("Net" or "PreviousTaxInclusive") || from > to) return false;
            parsed.Add(new TaxRule(code, name, rate, operation!, treatment!, calculationBase!, active, from, to));
        }
        rules = parsed;
        return true;
    }

    private static bool TryTenant(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);

    private static Guid GetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : Guid.Empty;

    private static AccountingRuleProfileView ToView(AccountingRuleProfile profile) => new(profile.Id,
        profile.ProfileCode, profile.Name, profile.JurisdictionCode, profile.ReportingStandard, profile.BaseCurrencyCode,
        profile.FiscalYearStartMonth, profile.EffectiveFrom, profile.EffectiveTo, profile.ParametersJson,
        profile.OfficialSourceUrl, profile.IsActive, profile.UpdatedAt);
}
