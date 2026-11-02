using System.Text.Json;
using AIERP.AIService.AI;
using Xunit;

namespace AIERP.Platform.UnitTests;

public sealed class ERPAssistantInvoiceToolsTests
{
    [Theory]
    [InlineData("  ab  ", true, "ab")]
    [InlineData("a", false, "a")]
    [InlineData("", false, "")]
    [InlineData(null, false, "")]
    [InlineData("abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz1", false,
        "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz1")]
    public void Search_term_is_trimmed_and_bounded(string? input, bool expectedValid, string expectedTerm)
    {
        Assert.Equal(expectedValid, ERPAssistantInvoiceTools.TryValidateSearchTerm(input, out var term));
        Assert.Equal(expectedTerm, term);
    }

    [Fact]
    public void Sales_invoice_summary_keeps_only_small_non_identity_projection()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"items":[{"id":"00000000-0000-0000-0000-000000000001","code":"S-1","customerName":"Synthetic Customer","customerId":"00000000-0000-0000-0000-000000000002","invoiceDate":"2026-10-01","currencyCode":"TRY","status":"Posted","grandTotal":125.50,"lineCount":2} ]}
            """);

        var serialized = ERPAssistantInvoiceTools.SummarizeSalesInvoices(response.RootElement);
        using var result = JsonDocument.Parse(serialized);
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());

        Assert.Equal("S-1", item.GetProperty("code").GetString());
        Assert.Equal(125.50m, item.GetProperty("total").GetDecimal());
        Assert.False(item.TryGetProperty("customerName", out _));
        Assert.False(item.TryGetProperty("customerId", out _));
        Assert.False(item.TryGetProperty("id", out _));
        Assert.Equal(1, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.False(result.RootElement.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public void Purchase_invoice_summary_keeps_due_and_outstanding_amount_without_supplier_identity()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":2,"items":[{"id":"00000000-0000-0000-0000-000000000001","code":"P-1","supplierName":"Synthetic Supplier","supplierId":"00000000-0000-0000-0000-000000000002","invoiceDate":"2026-10-01","dueDate":"2026-10-30","currencyCode":"EUR","status":"Posted","grandTotal":100.00,"outstandingAmount":40.00,"lineCount":3}]}
            """);

        var serialized = ERPAssistantInvoiceTools.SummarizePurchaseInvoices(response.RootElement);
        using var result = JsonDocument.Parse(serialized);
        var item = Assert.Single(result.RootElement.GetProperty("items").EnumerateArray());

        Assert.Equal("2026-10-30", item.GetProperty("dueDate").GetString());
        Assert.Equal(40.00m, item.GetProperty("outstanding").GetDecimal());
        Assert.False(item.TryGetProperty("supplierName", out _));
        Assert.False(item.TryGetProperty("supplierId", out _));
        Assert.True(result.RootElement.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public void Invoice_summary_rejects_unbounded_or_inconsistent_shapes()
    {
        using var tooManyRows = JsonDocument.Parse("""
            {"totalCount":11,"items":[{"code":"1"},{"code":"2"},{"code":"3"},{"code":"4"},{"code":"5"},{"code":"6"},{"code":"7"},{"code":"8"},{"code":"9"},{"code":"10"},{"code":"11"}]}
            """);
        using var inconsistent = JsonDocument.Parse("""
            {"totalCount":0,"items":[{"code":"1"}]}
            """);

        Assert.Throws<JsonException>(() => ERPAssistantInvoiceTools.SummarizeSalesInvoices(tooManyRows.RootElement));
        Assert.Throws<JsonException>(() => ERPAssistantInvoiceTools.SummarizeSalesInvoices(inconsistent.RootElement));
    }

    [Fact]
    public void Sales_invoice_details_keep_bounded_lines_and_remove_identity_and_payment_references()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"unique":true,"invoice":{"id":"secret-id","customerName":"Private Customer","code":"S-9","invoiceDate":"2026-10-01","currencyCode":"TRY","status":"Posted","total":150,"paid":40,"returned":10,"outstanding":100,"lineCount":1,"linesTruncated":false,"collections":[{"reference":"secret"}],"lines":[{"stockCode":"STK-1","item":"Widget","unit":"EA","quantity":2,"unitPrice":75,"vatPercent":20,"total":150,"stockItemId":"secret-stock-id"}]}}
            """);

        using var result = JsonDocument.Parse(ERPAssistantInvoiceTools.SummarizeSalesInvoiceDetails(response.RootElement));
        var invoice = result.RootElement.GetProperty("invoice");
        Assert.Equal("S-9", invoice.GetProperty("code").GetString());
        Assert.Equal(100m, invoice.GetProperty("outstanding").GetDecimal());
        Assert.Equal("STK-1", Assert.Single(invoice.GetProperty("lines").EnumerateArray()).GetProperty("stockCode").GetString());
        Assert.False(invoice.TryGetProperty("customerName", out _));
        Assert.False(invoice.TryGetProperty("collections", out _));
        Assert.False(invoice.GetProperty("lines")[0].TryGetProperty("stockItemId", out _));
        Assert.DoesNotContain("secret", result.RootElement.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public void Sales_invoice_details_reject_non_unique_or_unbounded_responses()
    {
        using var inconsistent = JsonDocument.Parse("""{"totalCount":1,"unique":false,"matches":[]}""");
        using var unbounded = JsonDocument.Parse("""{"totalCount":1,"unique":true,"invoice":{"linesTruncated":false,"lines":[{"stockCode":"x"}]}}""");

        Assert.Throws<JsonException>(() => ERPAssistantInvoiceTools.SummarizeSalesInvoiceDetails(inconsistent.RootElement));
        Assert.Throws<JsonException>(() => ERPAssistantInvoiceTools.SummarizeSalesInvoiceDetails(unbounded.RootElement));
    }

    [Fact]
    public void Purchase_invoice_details_keep_bounded_lines_and_remove_supplier_and_payment_identity()
    {
        using var response = JsonDocument.Parse("""
            {"totalCount":1,"unique":true,"invoice":{"id":"secret-id","supplierName":"Private Supplier","code":"P-9","invoiceDate":"2026-10-01","dueDate":"2026-10-30","currencyCode":"EUR","status":"Posted","total":150,"paid":40,"returned":10,"outstanding":100,"lineCount":1,"linesTruncated":false,"payments":[{"reference":"secret"}],"lines":[{"stockCode":"STK-1","item":"Widget","unit":"EA","quantity":2,"unitPrice":75,"vatPercent":20,"total":150,"stockItemId":"secret-stock-id"}]}}
            """);

        using var result = JsonDocument.Parse(ERPAssistantInvoiceTools.SummarizePurchaseInvoiceDetails(response.RootElement));
        var invoice = result.RootElement.GetProperty("invoice");
        Assert.Equal("P-9", invoice.GetProperty("code").GetString());
        Assert.Equal(100m, invoice.GetProperty("outstanding").GetDecimal());
        Assert.Equal("STK-1", Assert.Single(invoice.GetProperty("lines").EnumerateArray()).GetProperty("stockCode").GetString());
        Assert.False(invoice.TryGetProperty("supplierName", out _));
        Assert.False(invoice.TryGetProperty("payments", out _));
        Assert.False(invoice.GetProperty("lines")[0].TryGetProperty("stockItemId", out _));
        Assert.DoesNotContain("secret", result.RootElement.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public void Purchase_invoice_details_reject_non_unique_or_unbounded_responses()
    {
        using var inconsistent = JsonDocument.Parse("""{"totalCount":1,"unique":false,"matches":[]}""");
        using var unbounded = JsonDocument.Parse("""{"totalCount":1,"unique":true,"invoice":{"linesTruncated":false,"lines":[{"stockCode":"x"}]}}""");

        Assert.Throws<JsonException>(() => ERPAssistantInvoiceTools.SummarizePurchaseInvoiceDetails(inconsistent.RootElement));
        Assert.Throws<JsonException>(() => ERPAssistantInvoiceTools.SummarizePurchaseInvoiceDetails(unbounded.RootElement));
    }
}
