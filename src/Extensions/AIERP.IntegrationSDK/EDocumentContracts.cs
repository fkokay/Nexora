namespace AIERP.IntegrationSDK;

/// <summary>Provider-neutral e-document submission envelope. It describes an ERP document, not a vendor wire format.</summary>
public sealed record EDocumentSubmissionRequest(
    string DocumentType,
    Guid DocumentId,
    string DocumentNumber,
    DateOnly IssueDate,
    string CurrencyCode,
    System.Text.Json.JsonElement Document);

/// <summary>Provider-neutral acknowledgment. Provider certification and legal acceptance remain out of scope.</summary>
public sealed record EDocumentSubmissionResponse(
    string Status,
    string? ProviderReference,
    DateTimeOffset? AcceptedAt);

/// <summary>Provider adapter contract. Implementations must send the supplied stable idempotency key unchanged.</summary>
public interface IEDocumentProviderAdapter : IERPIntegrationAdapter<EDocumentSubmissionRequest, EDocumentSubmissionResponse>
{
}

public static class EDocumentSubmissionRules
{
    public static IReadOnlyList<string> Validate(EDocumentSubmissionRequest? request)
    {
        if (request is null) return ["request_required"];
        var errors = new List<string>();
        if (request.DocumentType is not ("e-invoice" or "e-dispatch" or "e-archive")) errors.Add("unsupported_document_type");
        if (request.DocumentId == Guid.Empty) errors.Add("document_id_required");
        if (string.IsNullOrWhiteSpace(request.DocumentNumber) || request.DocumentNumber.Length > 64 || request.DocumentNumber.Any(char.IsControl)) errors.Add("invalid_document_number");
        if (request.IssueDate == default || request.IssueDate > DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1)) errors.Add("invalid_issue_date");
        if (string.IsNullOrEmpty(request.CurrencyCode) || request.CurrencyCode.Length != 3 || request.CurrencyCode.Any(c => c is < 'A' or > 'Z')) errors.Add("invalid_currency");
        if (request.Document.ValueKind != System.Text.Json.JsonValueKind.Object) errors.Add("document_object_required");
        else ValidateSourceEnvelope(request, errors);
        return errors;
    }

    private static void ValidateSourceEnvelope(EDocumentSubmissionRequest request, ICollection<string> errors)
    {
        var document = request.Document;
        if (!document.TryGetProperty("source", out var source) || source.ValueKind != System.Text.Json.JsonValueKind.Object)
        {
            errors.Add("source_identity_required");
            return;
        }

        var expectedKind = request.DocumentType == "e-dispatch" ? "sales-delivery" : "sales-invoice";
        if (!TryGetString(source, "kind", out var kind) || kind != expectedKind ||
            !TryGetGuid(source, "id", out var sourceId) || sourceId != request.DocumentId ||
            !TryGetString(source, "code", out var sourceCode) || sourceCode != request.DocumentNumber)
            errors.Add("source_identity_mismatch");

        if (!TryGetDate(document, "issueDate", out var issueDate) || issueDate != request.IssueDate)
            errors.Add("source_issue_date_mismatch");

        if (!document.TryGetProperty("customer", out var customer) || customer.ValueKind != System.Text.Json.JsonValueKind.Object)
            errors.Add("recipient_required");
        else
        {
            if (!TryGetString(customer, "name", out _)) errors.Add("recipient_name_required");
            var hasValidTaxId = IsValidTaxId(customer, "taxNumber") || IsValidTaxId(customer, "identityNumber");
            if (!hasValidTaxId)
                errors.Add("recipient_tax_id_required");
            if (!customer.TryGetProperty("addresses", out var addresses) || addresses.ValueKind != System.Text.Json.JsonValueKind.Array ||
                !addresses.EnumerateArray().Any(address => address.ValueKind == System.Text.Json.JsonValueKind.Object &&
                    TryGetString(address, "addressLine", out _) && TryGetString(address, "city", out _) && TryGetString(address, "countryCode", out _)))
                errors.Add("recipient_address_required");
        }

        if (!document.TryGetProperty("lines", out var lines) || lines.ValueKind != System.Text.Json.JsonValueKind.Array || lines.GetArrayLength() == 0)
        {
            errors.Add("document_lines_required");
            return;
        }

        foreach (var line in lines.EnumerateArray())
        {
            if (line.ValueKind != System.Text.Json.JsonValueKind.Object)
            {
                errors.Add("invalid_document_line");
                break;
            }
            if (!TryGetString(line, "stockName", out _) || !TryGetString(line, "unitCode", out _))
            {
                errors.Add("document_line_identity_required");
                break;
            }
            if (!line.TryGetProperty("quantity", out var quantity) ||
                quantity.ValueKind != System.Text.Json.JsonValueKind.Number ||
                !quantity.TryGetDecimal(out var amount) || amount <= 0)
            {
                errors.Add("invalid_document_line_quantity");
                break;
            }
        }
    }

    private static bool TryGetString(System.Text.Json.JsonElement element, string name, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(name, out var property) || property.ValueKind != System.Text.Json.JsonValueKind.String) return false;
        value = property.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool IsValidTaxId(System.Text.Json.JsonElement element, string name)
    {
        if (!TryGetString(element, name, out var value) || value.Length is not (10 or 11)) return false;
        return value.All(character => character is >= '0' and <= '9');
    }

    private static bool TryGetGuid(System.Text.Json.JsonElement element, string name, out Guid value)
    {
        value = Guid.Empty;
        return element.TryGetProperty(name, out var property) && property.ValueKind == System.Text.Json.JsonValueKind.String && property.TryGetGuid(out value);
    }

    private static bool TryGetDate(System.Text.Json.JsonElement element, string name, out DateOnly value)
    {
        value = default;
        return element.TryGetProperty(name, out var property) && property.ValueKind == System.Text.Json.JsonValueKind.String &&
            DateOnly.TryParse(property.GetString(), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out value);
    }
}

/// <summary>Fail-closed checks for the standard Trendyol outgoing e-invoice payload inputs.</summary>
public static class TrendyolEInvoiceReadinessRules
{
    private static readonly HashSet<string> Scenarios = new(StringComparer.Ordinal)
    { "EARSIVFATURA", "TEMELFATURA", "TICARIFATURA", "TEMELIRSALIYE", "HKS", "IHRACAT", "KAMU", "ENERJI", "ILAC_TIBBICIHAZ", "YOLCUBERABERFATURA" };
    private static readonly HashSet<string> InvoiceTypeCodes = new(StringComparer.Ordinal)
    { "SATIS", "IADE", "TEVKIFAT", "ISTISNA", "OZELMATRAH", "IHRACKAYITLI", "TEVKIFATIADE", "SEVK", "MATBUDAN", "KONAKLAMAVERGISI", "SARJ", "SARJANLIK", "TEKNOLOJIDESTEK", "KOMISYONCU", "HKSSATIS", "HKSKOMISYONCU" };
    private static readonly HashSet<string> UnitCodes = new(StringComparer.Ordinal)
    { "T3", "D40", "R9", "C62", "NIU", "AMVT", "MON", "D30", "PR", "CLT", "CMT", "CMK", "CMQ", "D61", "BE", "DMK", "DZN", "GRM", "GT", "DAY", "HAR", "HAGR", "NCL", "NCR", "KGM", "B32", "KJO", "KTM", "BX", "KWH", "LTR", "MTR", "MTQ", "MGM", "MLT", "MMT", "MMQ", "BZ", "MWH", "F88", "NT", "PA", "HUR", "LPA", "D62", "SM3", "SET", "TNE", "CCT", "ANN", "TWH", "OTB", "MTK", "MC", "KWT", "KUR", "KSH", "KSD", "KPR", "KPH", "KOH", "KNI", "KH6", "CPR", "CTM", "GFI", "GMS", "H62", "K20", "K58", "K62", "PK" };
    private static readonly HashSet<string> PaymentMeans = new(StringComparer.Ordinal)
    { "CREDIT_CARD", "EFT", "ON_DELIVERY", "MEDIATOR", "OTHER" };

    public static bool IsSupportedUnitCode(string? unitCode) => unitCode is not null && UnitCodes.Contains(unitCode);

    public static IReadOnlyList<string> Validate(EDocumentSubmissionRequest? request)
    {
        if (request is null) return [];
        if (request.DocumentType == "e-dispatch") return ["trendyol_dispatch_creation_unsupported"];
        if (request.DocumentType is not ("e-invoice" or "e-archive")) return [];
        var errors = new List<string>();
        var document = request.Document;
        if (document.ValueKind != System.Text.Json.JsonValueKind.Object) return ["trendyol_invoice_source_invalid"];
        var scenario = GetString(document, "eDocumentScenario");
        var invoiceTypeCode = GetString(document, "eDocumentTypeCode");
        if (scenario is null || !Scenarios.Contains(scenario)) errors.Add("trendyol_scenario_unsupported_or_missing");
        if (invoiceTypeCode is null || !InvoiceTypeCodes.Contains(invoiceTypeCode)) errors.Add("trendyol_invoice_type_unsupported_or_missing");
        if (request.DocumentType == "e-archive" && scenario != "EARSIVFATURA") errors.Add("trendyol_archive_scenario_mismatch");
        if (request.DocumentType == "e-invoice" && scenario == "EARSIVFATURA") errors.Add("trendyol_invoice_scenario_mismatch");
        if (!string.Equals(request.CurrencyCode, "TRY", StringComparison.Ordinal)) errors.Add("trendyol_currency_conversion_not_configured");
        if (!document.TryGetProperty("lines", out var lines) || lines.ValueKind != System.Text.Json.JsonValueKind.Array) return errors;
        foreach (var line in lines.EnumerateArray())
        {
            var unitCode = GetString(line, "unitCode");
            if (unitCode is null || !UnitCodes.Contains(unitCode))
            {
                errors.Add("trendyol_unit_code_mapping_required");
                break;
            }
        }

        if (scenario == "EARSIVFATURA" && document.TryGetProperty("eCommerce", out var eCommerce) && eCommerce.ValueKind == System.Text.Json.JsonValueKind.Object &&
            !string.IsNullOrWhiteSpace(GetString(eCommerce, "purchaseUrl")))
        {
            var purchaseUrl = GetString(eCommerce, "purchaseUrl");
            if (purchaseUrl is null || purchaseUrl.Length > 255 || !Uri.TryCreate(purchaseUrl, UriKind.Absolute, out var parsedPurchaseUrl) || parsedPurchaseUrl.Scheme != Uri.UriSchemeHttps)
                errors.Add("trendyol_purchase_url_must_use_https");
            var paymentMeans = GetString(eCommerce, "paymentMeans");
            if (GetString(eCommerce, "paymentAgentName") is null || GetString(eCommerce, "paymentType") is null ||
                paymentMeans is null || !PaymentMeans.Contains(paymentMeans) || !HasDateTime(eCommerce, "paymentDate"))
                errors.Add("trendyol_ecommerce_payment_information_incomplete");
            if (GetString(eCommerce, "paymentAgentName") is { Length: > 127 } ||
                GetString(eCommerce, "instructionNote") is { Length: > 255 } ||
                (GetString(eCommerce, "paymentDueDate") is { } dueDate &&
                    !DateTimeOffset.TryParse(dueDate, System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.RoundtripKind, out _)))
                errors.Add("trendyol_ecommerce_payment_information_invalid");
            var carrierTaxId = GetString(eCommerce, "carrierTaxId");
            if (carrierTaxId is null || carrierTaxId.Length is not (10 or 11) || carrierTaxId.Any(c => c is < '0' or > '9') ||
                GetString(eCommerce, "carrierName") is null || !HasDate(eCommerce, "sentAt"))
                errors.Add("trendyol_ecommerce_delivery_information_incomplete");
        }
        return errors;
    }

    private static string? GetString(System.Text.Json.JsonElement element, string name) =>
        element.TryGetProperty(name, out var property) && property.ValueKind == System.Text.Json.JsonValueKind.String
            ? property.GetString()?.Trim() is { Length: > 0 } value ? value : null
            : null;

    private static bool HasDateTime(System.Text.Json.JsonElement element, string name) =>
        GetString(element, name) is { } value && DateTimeOffset.TryParse(value, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.RoundtripKind, out _);

    private static bool HasDate(System.Text.Json.JsonElement element, string name) =>
        GetString(element, name) is { } value && DateOnly.TryParse(value, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out _);
}
