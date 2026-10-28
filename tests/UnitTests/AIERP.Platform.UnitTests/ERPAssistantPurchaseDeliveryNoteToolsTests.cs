using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantPurchaseDeliveryNoteToolsTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" SDN-2026-001 ", true)]
    [InlineData("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantPurchaseDeliveryNoteTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(input?.Trim() ?? string.Empty, term);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData(" x ", false)]
    [InlineData(" SDN-2026-001 ", true)]
    [InlineData("SDN-\n001", false)]
    [InlineData("012345678901234567890123456789012345678901234567890123456789012345678901234567890", false)]
    public void Detail_document_number_is_trimmed_bounded_and_control_free(string? input, bool expected)
    {
        Assert.Equal(expected, ERPAssistantPurchaseDeliveryNoteTools.TryValidateDocumentNumber(input, out var documentNumber));
        Assert.Equal(input?.Trim() ?? string.Empty, documentNumber);
    }

    [Fact]
    public async Task Note_read_requires_the_specific_purchase_delivery_note_permission()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(true, tenantId);
        var allowed = await ERPAssistantPurchaseDeliveryNoteTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "PurchasingUser",
            authorizer, CancellationToken.None);
        Assert.True(allowed);
        Assert.Equal(tenantId, authorizer.TenantId);
        Assert.Equal("erp.purchase-delivery-notes.read", authorizer.PermissionCode);
    }

    [Fact]
    public async Task Note_read_denies_when_permission_authorizer_rejects()
    {
        var tenantId = Guid.NewGuid();
        var authorizer = new RecordingPermissionAuthorizer(false, tenantId);
        Assert.False(await ERPAssistantPurchaseDeliveryNoteTools.IsReadAllowedAsync(tenantId, Guid.NewGuid(), "PurchasingUser",
            authorizer, CancellationToken.None));
        Assert.Equal("erp.purchase-delivery-notes.read", authorizer.PermissionCode);
    }

    [Fact]
    public void Summary_projects_only_bounded_delivery_note_facts()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":12,"returned":10,"hasMore":true,"items":[
              {"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","documentNumber":"SDN-2026-001","purchaseOrderCode":"PO-2026-001","documentDate":"2026-10-25","lineCount":3,"linkedToReceipt":true,"supplierName":"Private Supplier"}
            ]}
            """);
        using var result = JsonDocument.Parse(ERPAssistantPurchaseDeliveryNoteTools.SummarizeNotes(response.RootElement));
        Assert.Equal(12, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("SDN-2026-001", item.GetProperty("documentNumber").GetString());
        Assert.Equal("PO-2026-001", item.GetProperty("purchaseOrderCode").GetString());
        Assert.True(item.GetProperty("linkedToReceipt").GetBoolean());
        Assert.False(item.TryGetProperty("id", out _));
        Assert.False(item.TryGetProperty("supplierName", out _));
    }

    [Fact]
    public void Summary_rejects_oversized_or_inconsistent_responses()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":0,"items":[{"documentNumber":"SDN-1","purchaseOrderCode":"PO-1","documentDate":"2026-10-25","lineCount":1,"linkedToReceipt":false}]}
            """);
        Assert.Throws<JsonException>(() => ERPAssistantPurchaseDeliveryNoteTools.SummarizeNotes(response.RootElement));
    }

    [Fact]
    public void Detail_summary_projects_at_most_50_line_facts_and_omits_private_fields()
    {
        using var response = JsonDocument.Parse("""
            {"id":"private-id","documentNumber":"SDN-2026-001","purchaseOrderCode":"PO-2026-001","supplierName":"Private supplier","notes":"private",
             "documentDate":"2026-10-25","linkedToReceipt":true,"lineCount":51,"returnedLines":1,"hasMoreLines":true,
             "lines":[{"lineNumber":1,"unitCode":"EA","quantity":5,"stockCode":"private-stock","note":"private"}]}
            """);

        using var result = JsonDocument.Parse(ERPAssistantPurchaseDeliveryNoteTools.SummarizeNoteDetails(response.RootElement));
        var root = result.RootElement;
        Assert.Equal("SDN-2026-001", root.GetProperty("documentNumber").GetString());
        Assert.Equal(51, root.GetProperty("lineCount").GetInt32());
        Assert.True(root.GetProperty("hasMoreLines").GetBoolean());
        var line = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal(5m, line.GetProperty("quantity").GetDecimal());
        Assert.False(root.TryGetProperty("supplierName", out _));
        Assert.False(root.TryGetProperty("id", out _));
        Assert.False(root.TryGetProperty("notes", out _));
        Assert.False(line.TryGetProperty("stockCode", out _));
        Assert.False(line.TryGetProperty("note", out _));
    }

    [Theory]
    [InlineData("""{"documentNumber":"SDN-1","purchaseOrderCode":"PO-1","documentDate":"2026-10-25","linkedToReceipt":false,"lineCount":51,"returnedLines":51,"hasMoreLines":false,"lines":[]}""")]
    [InlineData("""{"documentNumber":"SDN-1","purchaseOrderCode":"PO-1","documentDate":"2026-10-25","linkedToReceipt":false,"lineCount":1,"returnedLines":1,"hasMoreLines":false,"lines":[{}]}""")]
    public void Detail_summary_rejects_unbounded_or_malformed_shape(string json)
    {
        using var response = JsonDocument.Parse(json);
        Assert.Throws<JsonException>(() => ERPAssistantPurchaseDeliveryNoteTools.SummarizeNoteDetails(response.RootElement));
    }

    private sealed class RecordingPermissionAuthorizer(bool allowed, Guid expectedTenantId) : IPlatformPermissionAuthorizer
    {
        public Guid? TenantId { get; private set; }
        public string? PermissionCode { get; private set; }

        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
            CancellationToken cancellationToken = default)
        {
            TenantId = tenantId;
            PermissionCode = permission.Permission.Code;
            return Task.FromResult(allowed && expectedTenantId == tenantId);
        }
    }
}
