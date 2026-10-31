using System.Text.Json;
using AIERP.IntegrationSDK;

namespace AIERP.Platform.UnitTests;

public sealed class EDocumentSubmissionRulesTests
{
    [Theory]
    [InlineData("e-invoice", "sales-invoice")]
    [InlineData("e-archive", "sales-invoice")]
    [InlineData("e-dispatch", "sales-delivery")]
    public void Validate_AcceptsAConsistentSourceBoundEnvelope(string type, string sourceKind)
    {
        var id = Guid.NewGuid();
        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        using var document = JsonDocument.Parse($$"""{"source":{"kind":"{{sourceKind}}","id":"{{id:D}}","code":"INV-42"},"issueDate":"{{date:yyyy-MM-dd}}","lines":[{"quantity":2}]}""");

        var request = new EDocumentSubmissionRequest(type, id, "INV-42", date, "TRY", document.RootElement);

        Assert.Empty(EDocumentSubmissionRules.Validate(request));
    }

    [Fact]
    public void Validate_RejectsSourceIdentityAndDateThatDoNotMatchTheEnvelope()
    {
        using var document = JsonDocument.Parse("""{"source":{"kind":"sales-invoice","id":"00000000-0000-0000-0000-000000000001","code":"OTHER"},"issueDate":"2026-01-01","lines":[{"quantity":1}]}""");
        var request = new EDocumentSubmissionRequest("e-invoice", Guid.NewGuid(), "INV-42", new DateOnly(2026, 1, 2), "TRY", document.RootElement);

        var errors = EDocumentSubmissionRules.Validate(request);

        Assert.Contains("source_identity_mismatch", errors);
        Assert.Contains("source_issue_date_mismatch", errors);
    }

    [Theory]
    [InlineData("[]", "document_object_required")]
    [InlineData("{}", "source_identity_required")]
    [InlineData("{\"source\":{\"kind\":\"sales-invoice\",\"id\":\"00000000-0000-0000-0000-000000000001\",\"code\":\"INV-42\"},\"issueDate\":\"2026-01-01\",\"lines\":[]}", "document_lines_required")]
    [InlineData("{\"source\":{\"kind\":\"sales-invoice\",\"id\":\"00000000-0000-0000-0000-000000000001\",\"code\":\"INV-42\"},\"issueDate\":\"2026-01-01\",\"lines\":[{\"quantity\":0}]}", "invalid_document_line_quantity")]
    public void Validate_RejectsIncompleteOrInvalidSourceDocument(string json, string expectedError)
    {
        using var document = JsonDocument.Parse(json);
        var id = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var request = new EDocumentSubmissionRequest("e-invoice", id, "INV-42", new DateOnly(2026, 1, 1), "TRY", document.RootElement);

        Assert.Contains(expectedError, EDocumentSubmissionRules.Validate(request));
    }
}
