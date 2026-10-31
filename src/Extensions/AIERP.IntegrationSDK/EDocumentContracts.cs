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

        if (!document.TryGetProperty("lines", out var lines) || lines.ValueKind != System.Text.Json.JsonValueKind.Array || lines.GetArrayLength() == 0)
        {
            errors.Add("document_lines_required");
            return;
        }

        foreach (var line in lines.EnumerateArray())
        {
            if (line.ValueKind != System.Text.Json.JsonValueKind.Object ||
                !line.TryGetProperty("quantity", out var quantity) ||
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
