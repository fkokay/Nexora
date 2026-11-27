using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// Golden numbers of the sales write handlers' amount calculation (Satış Aşama B, P2): the values the quote / order / standalone
/// invoice handlers stored before the shared calculator was extracted (SalesQuoteValidation.Calculate per base line, then the tax
/// profile for invoices). The handlers and the preview endpoints now both call <see cref="SalesDocumentCalculator"/>; these
/// expectations must not change with it. The handler-level twins (write vs preview on SQL Server) are in
/// SalesDocumentPreviewSqlAcceptanceTests.
/// </summary>
public sealed class SalesDocumentCalculatorGoldenTests
{
    private static readonly DateOnly Date = new(2026, 11, 20);

    private static StockItem Item(string unit = "EA") => new() { Id = Guid.NewGuid(), Code = "S-1", Name = "Stok", UnitCode = unit };

    private static SalesQuoteLineWriteRequest Line(Guid stockItemId, decimal quantity, decimal price, decimal discount = 0, decimal vat = 20) =>
        new(stockItemId, quantity, price, discount, vat);

    [Fact]
    public void Retail_invoice_line_splits_vat_out_of_the_entered_price()
    {
        var item = Item();
        var normalized = SalesDocumentCalculator.NormalizeInvoiceLine(Line(item.Id, 3m, 118m, vat: 18m), item, Guid.NewGuid(), SalesInvoiceType.Retail);
        Assert.True(normalized.IsVatIncluded);
        Assert.Equal("EA", normalized.UnitCode);
        var (amounts, breakdown) = SalesDocumentCalculator.InvoiceLine(normalized, null, Date);
        Assert.Equal(new SalesQuoteLineAmounts(300.00m, 0m, 54.00m, 354.00m), amounts);
        Assert.Equal(54.00m, Assert.Single(AccountingRuleTaxCalculator.ReadBreakdown(breakdown)).Amount);
    }

    [Fact]
    public void Wholesale_invoice_with_discount_and_mixed_vat_rates()
    {
        var item = Item();
        var lines = new[] { Line(item.Id, 100m, 450m, 5m, 20m), Line(item.Id, 40m, 300m, 0m, 10m) }
            .Select(x => SalesDocumentCalculator.NormalizeInvoiceLine(x, item, Guid.NewGuid(), SalesInvoiceType.Wholesale)).ToArray();
        var computed = lines.Select(x => SalesDocumentCalculator.InvoiceLine(x, null, Date)).ToArray();
        Assert.Equal(new SalesQuoteLineAmounts(45000.00m, 2250.00m, 8550.00m, 51300.00m), computed[0].Amounts);
        Assert.Equal(new SalesQuoteLineAmounts(12000.00m, 0m, 1200.00m, 13200.00m), computed[1].Amounts);
        Assert.Equal(new SalesQuoteTotals(57000.00m, 2250.00m, 9750.00m, 64500.00m), SalesQuoteValidation.Sum(computed.Select(x => x.Amounts)));
        // The stored invoice breakdown keys on the tax code: both VAT rates are one "VAT" row today (kept as is).
        var stored = AccountingRuleTaxCalculator.ReadBreakdown(AccountingRuleTaxCalculator.Aggregate(computed.Select(x => x.TaxBreakdownJson)));
        var vat = Assert.Single(stored);
        Assert.Equal(("VAT", 54750.00m, 9750.00m), (vat.Code, vat.TaxableAmount, vat.Amount));

        // The preview groups VAT by rate instead.
        var preview = SalesDocumentCalculator.InvoicePreview("TRY", null, Date, lines, ["a", "b"]);
        Assert.Equal((57000.00m, 2250.00m, 54750.00m, 9750.00m, 0m, 64500.00m, 64500.00m),
            (preview.Subtotal, preview.DiscountTotal, preview.TaxableTotal, preview.TaxTotal, preview.WithholdingTotal, preview.GrossTotal, preview.GrandTotal));
        Assert.Equal([("VAT", 20m, 42750.00m, 8550.00m), ("VAT", 10m, 12000.00m, 1200.00m)],
            preview.Taxes.Select(x => (x.Code, x.Rate, x.TaxableAmount, x.Amount)).ToArray());
        Assert.Equal<IEnumerable<string?>>(["a", "b"], preview.Lines.Select(x => x.RowKey).ToArray());
        Assert.Equal(51300.00m, preview.Lines[0].LineTotal);
    }

    [Fact]
    public void Tax_profile_adds_extra_tax_and_withholds()
    {
        var profile = new AccountingRuleProfile
        {
            ProfileCode = "TR-TEST", EffectiveFrom = new DateOnly(2026, 1, 1),
            ParametersJson = JsonSerializer.Serialize(new
            {
                taxRules = new object[]
                {
                    new { code = "OTV", name = "ÖTV", rate = 10m, operationType = "Sales", treatment = "Additive", calculationBase = "Net" },
                    new { code = "TEV", name = "Tevkifat", rate = 5m, operationType = "Sales", treatment = "Withholding", calculationBase = "Net" },
                    new { code = "ALIS", name = "Yalnız alış", rate = 50m, operationType = "Purchase", treatment = "Additive", calculationBase = "Net" }
                }
            })
        };
        var item = Item();
        var normalized = SalesDocumentCalculator.NormalizeInvoiceLine(Line(item.Id, 10m, 100m), item, Guid.NewGuid(), SalesInvoiceType.Wholesale);
        var (amounts, breakdown) = SalesDocumentCalculator.InvoiceLine(normalized, profile, Date);
        // VAT 200 + ÖTV 100 = tax 300; total = 1000 + 300 − tevkifat 50.
        Assert.Equal(new SalesQuoteLineAmounts(1000.00m, 0m, 300.00m, 1250.00m), amounts);
        Assert.Equal(50.00m, AccountingRuleTaxCalculator.SumWithholding(breakdown));

        var preview = SalesDocumentCalculator.InvoicePreview("TRY", profile, Date, [normalized], [null]);
        Assert.Equal(("TR-TEST", 300.00m, 50.00m, 1300.00m, 1250.00m),
            (preview.AccountingProfileCode, preview.TaxTotal, preview.WithholdingTotal, preview.GrossTotal, preview.GrandTotal));
        Assert.Equal([("VAT", "Additive", 200.00m), ("OTV", "Additive", 100.00m), ("TEV", "Withholding", 50.00m)],
            preview.Taxes.Select(x => (x.Code, x.Treatment, x.Amount)).ToArray());
        Assert.Equal(50.00m, preview.Lines[0].WithholdingAmount);
        Assert.Null(preview.Lines[0].RowKey);
    }

    [Fact]
    public void Quote_preview_uses_the_base_unit_and_document_currency_values()
    {
        var item = Item("KG");
        var input = new SalesQuoteLineWriteRequest(item.Id, 2m, 100m, 10m, 20m, "TON", CurrencyCode: "USD");
        // As NormalizeQuoteLinesAsync builds it: 2 TON = 2000 KG; 100 USD/TON × 32.5 / 1000 = 3.25 TRY/KG.
        var normalized = new NormalizedSalesLine(input, input with { Quantity = 2000m, UnitPrice = 3.25m, UnitCode = "KG" }, "USD", 32.5m);
        var preview = SalesDocumentCalculator.Preview("TRY", [normalized], ["k1"]);
        var line = Assert.Single(preview.Lines);
        Assert.Equal(("k1", "KG", 2000m, 3.25m, "TON", 2m, "USD", 100m, 32.5m),
            (line.RowKey, line.UnitCode, line.Quantity, line.UnitPrice, line.EnteredUnitCode, line.EnteredQuantity, line.EnteredCurrencyCode, line.EnteredUnitPrice, line.ExchangeRate));
        Assert.Equal((6500.00m, 650.00m, 5850.00m, 1170.00m, 7020.00m), (line.LineSubtotal, line.DiscountAmount, line.TaxableAmount, line.TaxAmount, line.LineTotal));
        Assert.Equal(new SalesQuoteTotals(6500.00m, 650.00m, 1170.00m, 7020.00m), SalesDocumentCalculator.Totals([normalized]));
        Assert.Equal((7020.00m, 7020.00m, 0m), (preview.GrandTotal, preview.GrossTotal, preview.WithholdingTotal));
        Assert.Equal(("VAT", 20m, 5850.00m, 1170.00m), (preview.Taxes[0].Code, preview.Taxes[0].Rate, preview.Taxes[0].TaxableAmount, preview.Taxes[0].Amount));
    }

    [Fact]
    public void Vat_included_quote_line_and_rounding_match_the_write()
    {
        var item = Item();
        var input = new SalesQuoteLineWriteRequest(item.Id, 3m, 33.335m, 2.5m, 8m, IsVatIncluded: true);
        var normalized = new NormalizedSalesLine(input, input with { UnitCode = "EA" }, "TRY", 1m);
        // 3 × 33.335 = 100.005 → 100.01; ÷ 1.08 = 92.60; discount 2.5% = 2.32 (2.315 away from zero); tax 8% of 90.28 = 7.22.
        Assert.Equal(new SalesQuoteLineAmounts(92.60m, 2.32m, 7.22m, 97.50m), SalesQuoteValidation.Calculate(normalized.Base));
        Assert.Equal(97.50m, SalesDocumentCalculator.Preview("TRY", [normalized], [null]).GrandTotal);
    }
}
