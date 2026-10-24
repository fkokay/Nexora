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
        return errors;
    }
}
