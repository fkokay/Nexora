using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class SalesQuoteTests
{
    [Theory]
    [InlineData(SalesQuoteStatus.Draft, SalesQuoteStatus.Sent, true)]
    [InlineData(SalesQuoteStatus.Sent, SalesQuoteStatus.Accepted, true)]
    [InlineData(SalesQuoteStatus.Sent, SalesQuoteStatus.Rejected, true)]
    [InlineData(SalesQuoteStatus.Accepted, SalesQuoteStatus.Rejected, false)]
    [InlineData(SalesQuoteStatus.Rejected, SalesQuoteStatus.Accepted, false)]
    public void Allows_only_supported_quote_transitions(SalesQuoteStatus current, SalesQuoteStatus target, bool expected)
    {
        Assert.Equal(expected, SalesQuoteWorkflow.CanTransition(current, target));
    }

    [Theory]
    [InlineData(SalesQuoteStatus.Accepted, false, true)]
    [InlineData(SalesQuoteStatus.Accepted, true, false)]
    [InlineData(SalesQuoteStatus.Sent, false, false)]
    [InlineData(SalesQuoteStatus.Rejected, false, false)]
    public void Converts_only_accepted_quotes_once(SalesQuoteStatus status, bool alreadyConverted, bool expected)
    {
        Assert.Equal(expected, SalesQuoteWorkflow.CanConvertToOrder(status, alreadyConverted));
    }

    [Fact]
    public void Calculates_discount_then_tax_with_currency_rounding()
    {
        var line = new SalesQuoteLineWriteRequest(Guid.NewGuid(), 2m, 100.55m, 10m, 20m);

        var amounts = SalesQuoteValidation.Calculate(line);

        Assert.Equal(201.10m, amounts.LineSubtotal);
        Assert.Equal(20.11m, amounts.DiscountAmount);
        Assert.Equal(36.20m, amounts.TaxAmount);
        Assert.Equal(217.19m, amounts.LineTotal);
    }

    [Fact]
    public void Rounds_midpoint_away_from_zero()
    {
        var amounts = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(Guid.NewGuid(), 1m, 0.005m, 0m, 0m));

        Assert.Equal(0.01m, amounts.LineSubtotal);
        Assert.Equal(0.01m, amounts.LineTotal);
    }

    [Fact]
    public void Calculates_partial_return_amounts_from_cumulative_rounded_totals()
    {
        var itemId = Guid.NewGuid();
        var first = SalesReturnValidation.CalculateIncrementalAmounts(itemId, 0.05m, 50m, 0m, 0m,
            new SalesQuoteLineAmounts(0m, 0m, 0m, 0m), 1m);
        var second = SalesReturnValidation.CalculateIncrementalAmounts(itemId, 0.05m, 50m, 0m, 1m, first, 1m);

        Assert.Equal(0.02m, first.LineTotal);
        Assert.Equal(0.03m, second.LineTotal);
        Assert.Equal(0.05m, first.LineTotal + second.LineTotal);
    }

    [Fact]
    public void Partial_return_amounts_reconcile_to_the_original_invoice_line()
    {
        var itemId = Guid.NewGuid();
        var original = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(itemId, 3m, 10.55m, 7.5m, 20m));
        var first = SalesReturnValidation.CalculateIncrementalAmounts(itemId, 10.55m, 7.5m, 20m, 0m,
            new SalesQuoteLineAmounts(0m, 0m, 0m, 0m), 1m);
        var second = SalesReturnValidation.CalculateIncrementalAmounts(itemId, 10.55m, 7.5m, 20m, 1m, first, 2m);

        Assert.Equal(original, new SalesQuoteLineAmounts(first.LineSubtotal + second.LineSubtotal,
            first.DiscountAmount + second.DiscountAmount, first.TaxAmount + second.TaxAmount, first.LineTotal + second.LineTotal));
    }

    [Fact]
    public void Rejects_rates_outside_supported_range()
    {
        var request = ValidRequest() with
        {
            Lines = [new SalesQuoteLineWriteRequest(Guid.NewGuid(), 1m, 10m, 0m, 150m)]
        };

        var errors = SalesQuoteValidation.Validate(request);

        Assert.NotNull(errors);
        Assert.Contains("lines[0].vatPercent", errors.Keys);
    }

    [Fact]
    public void Rejects_quote_without_lines_and_invalid_date_range()
    {
        var request = ValidRequest() with { ValidUntil = new DateOnly(2026, 1, 1), Lines = [] };

        var errors = SalesQuoteValidation.Validate(request);

        Assert.NotNull(errors);
        Assert.Contains("validUntil", errors.Keys);
        Assert.Contains("lines", errors.Keys);
    }

    [Fact]
    public void Rejects_document_total_that_exceeds_decimal_18_2()
    {
        var line = new SalesQuoteLineAmounts(9999999999999999.99m, 0m, 0m, 9999999999999999.99m);

        Assert.Throws<OverflowException>(() => SalesQuoteValidation.Sum([line, line]));
    }

    [Theory]
    [InlineData(0, 0, PurchaseOrderStatus.Open)]
    [InlineData(10, 2, PurchaseOrderStatus.PartiallyReceived)]
    [InlineData(10, 10, PurchaseOrderStatus.Received)]
    [InlineData(10, 12, PurchaseOrderStatus.Received)]
    public void Purchase_order_status_tracks_posted_receipt_quantities(decimal ordered, decimal received, PurchaseOrderStatus expected)
    {
        Assert.Equal(expected, PurchaseOrderWorkflow.GetStatus([(ordered, received)]));
    }

    [Theory]
    [InlineData(PurchaseOrderStatus.Open, true, true, true)]
    [InlineData(PurchaseOrderStatus.PartiallyReceived, true, true, true)]
    [InlineData(PurchaseOrderStatus.PendingApproval, false, false, true)]
    [InlineData(PurchaseOrderStatus.Rejected, false, false, false)]
    [InlineData(PurchaseOrderStatus.Received, false, false, false)]
    [InlineData(PurchaseOrderStatus.Cancelled, false, false, false)]
    public void Purchase_order_actions_respect_approval_state(PurchaseOrderStatus status, bool canEdit, bool canReceive, bool outstanding)
    {
        Assert.Equal(canEdit, PurchaseOrderWorkflow.CanEdit(status));
        Assert.Equal(canReceive, PurchaseOrderWorkflow.CanReceive(status));
        Assert.Equal(outstanding, PurchaseOrderWorkflow.HasOutstandingOrder(status));
    }

    [Fact]
    public void Purchase_receipt_requires_idempotency_warehouse_and_positive_unique_lines()
    {
        var valid = new PurchaseReceiptWriteRequest(Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 10, 15),
            [new PurchaseReceiptLineWriteRequest(1, 2m)]);
        Assert.Null(PurchaseReceiptValidation.Validate(valid));

        var invalid = valid with { RequestId = Guid.Empty, WarehouseId = Guid.Empty,
            Lines = [new PurchaseReceiptLineWriteRequest(1, 0m), new PurchaseReceiptLineWriteRequest(1, 1m)] };
        var errors = PurchaseReceiptValidation.Validate(invalid);
        Assert.NotNull(errors);
        Assert.Contains("requestId", errors.Keys);
        Assert.Contains("warehouseId", errors.Keys);
        Assert.Contains("lines", errors.Keys);
    }

    [Fact]
    public void Partial_purchase_invoices_reconcile_with_the_order_line_total()
    {
        var itemId = Guid.NewGuid();
        var original = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(itemId, 3m, 10.55m, 7.5m, 20m));
        var first = PurchaseInvoiceWorkflow.CalculateIncrementalAmounts(itemId, 10.55m, 7.5m, 20m, 0m,
            new SalesQuoteLineAmounts(0m, 0m, 0m, 0m), 1m);
        var second = PurchaseInvoiceWorkflow.CalculateIncrementalAmounts(itemId, 10.55m, 7.5m, 20m, 1m, first, 2m);

        Assert.Equal(original, new SalesQuoteLineAmounts(first.LineSubtotal + second.LineSubtotal,
            first.DiscountAmount + second.DiscountAmount, first.TaxAmount + second.TaxAmount, first.LineTotal + second.LineTotal));
    }

    [Theory]
    [InlineData(100, 30, 70)]
    [InlineData(100, 100, 0)]
    [InlineData(100, 120, 0)]
    public void Supplier_invoice_outstanding_never_exceeds_the_invoice_balance(decimal total, decimal paid, decimal expected)
    {
        Assert.Equal(expected, PurchaseInvoiceWorkflow.Outstanding(total, paid));
    }

    [Fact]
    public void Supplier_payment_requires_idempotency_and_valid_amount_and_method()
    {
        var valid = new SupplierPaymentWriteRequest(Guid.NewGuid(), new DateOnly(2026, 10, 15), 25m, "Bank transfer", FinancialAccountId: Guid.NewGuid());
        Assert.Null(SupplierPaymentValidation.Validate(valid));

        var errors = SupplierPaymentValidation.Validate(valid with { RequestId = Guid.Empty, Amount = 1.001m, PaymentMethod = "Crypto" });
        Assert.NotNull(errors);
        Assert.Contains("requestId", errors.Keys);
        Assert.Contains("amount", errors.Keys);
        Assert.Contains("paymentMethod", errors.Keys);
    }

    [Fact]
    public void Supplier_return_requires_idempotency_warehouse_and_positive_unique_lines()
    {
        var valid = new SupplierReturnWriteRequest(Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 10, 15),
            [new SupplierReturnLineWriteRequest(Guid.NewGuid(), 2.5m)]);
        Assert.Null(SupplierReturnValidation.Validate(valid));

        var invalid = valid with { RequestId = Guid.Empty, WarehouseId = Guid.Empty,
            Lines = [new SupplierReturnLineWriteRequest(Guid.Empty, 0m), new SupplierReturnLineWriteRequest(Guid.Empty, 1m)] };
        var errors = SupplierReturnValidation.Validate(invalid);
        Assert.NotNull(errors);
        Assert.Contains("requestId", errors.Keys);
        Assert.Contains("warehouseId", errors.Keys);
        Assert.Contains("lines", errors.Keys);
        Assert.Contains("lines[0].quantity", errors.Keys);
    }

    [Theory]
    [InlineData(100, 30, 20, 50)]
    [InlineData(100, 30, 70, 0)]
    [InlineData(100, 100, 20, 0)]
    public void Supplier_invoice_outstanding_accounts_for_posted_returns(decimal total, decimal paid, decimal returned, decimal expected)
    {
        Assert.Equal(expected, PurchaseInvoiceWorkflow.Outstanding(total, paid, returned));
    }

    private static SalesQuoteWriteRequest ValidRequest() => new(
        "Q-001", Guid.NewGuid(), new DateOnly(2026, 10, 15), new DateOnly(2026, 10, 29), "TRY", null,
        [new SalesQuoteLineWriteRequest(Guid.NewGuid(), 1m, 10m)]);
}
