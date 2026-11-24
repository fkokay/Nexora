using AIERP.Platform.Application;

namespace AIERP.Platform.UnitTests;

/// <summary>Irsaliye fiyatı ve bedelsiz satır: the pricing rules shared by sales deliveries, purchase receipts and delivery notes.</summary>
public sealed class DeliveryLinePricingTests
{
    private static readonly DeliveryLinePrice OrderDefault = new(100m, 10m, 20m, false);

    [Fact]
    public void Free_line_with_any_price_field_is_rejected_in_Turkish()
    {
        var errors = new Dictionary<string, string[]>();
        Assert.False(DeliveryLinePricing.Validate(new DeliveryLinePriceInput(UnitPrice: 5m, IsFreeOfCharge: true), "lines[0]", errors));
        Assert.Equal("Bedelsiz satırda fiyat girilemez.", Assert.Single(errors["lines[0].isFreeOfCharge"]));
        errors.Clear();
        Assert.False(DeliveryLinePricing.Validate(new DeliveryLinePriceInput(VatPercent: 20m, IsFreeOfCharge: true), "lines[1]", errors));
        Assert.True(errors.ContainsKey("lines[1].isFreeOfCharge"));
    }

    [Theory]
    [InlineData(-1, null, null, "lines[0].unitPrice")]
    [InlineData(1.00001, null, null, "lines[0].unitPrice")]
    [InlineData(10, -0.01, null, "lines[0].discountPercent")]
    [InlineData(10, 100.01, null, "lines[0].discountPercent")]
    [InlineData(10.0, null, 101.0, "lines[0].vatPercent")]
    [InlineData(10.0, null, -1.0, "lines[0].vatPercent")]
    public void Out_of_range_prices_are_rejected(double price, double? discount, double? vat, string key)
    {
        var errors = new Dictionary<string, string[]>();
        Assert.False(DeliveryLinePricing.Validate(new DeliveryLinePriceInput((decimal)price, (decimal?)discount, (decimal?)vat), "lines[0]", errors));
        Assert.True(errors.ContainsKey(key));
    }

    [Fact]
    public void Zero_price_and_bounds_are_valid()
    {
        var errors = new Dictionary<string, string[]>();
        Assert.True(DeliveryLinePricing.Validate(new DeliveryLinePriceInput(0m, 0m, 0m), "l", errors));
        Assert.True(DeliveryLinePricing.Validate(new DeliveryLinePriceInput(1.2345m, 100m, 100m), "l", errors));
        Assert.True(DeliveryLinePricing.Validate(new DeliveryLinePriceInput(IsFreeOfCharge: true), "l", errors));
        Assert.Empty(errors);
    }

    [Fact]
    public void Omitted_price_copies_the_order_default_and_free_clears_it()
    {
        Assert.Equal(OrderDefault, DeliveryLinePricing.Resolve(null, OrderDefault));
        Assert.Equal(OrderDefault, DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(), OrderDefault));
        Assert.Equal(DeliveryLinePrice.Free, DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(IsFreeOfCharge: true), OrderDefault));
        Assert.Equal(DeliveryLinePrice.Unpriced, DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(), null));
        Assert.Equal(DeliveryLinePrice.Unpriced, DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(), new DeliveryLinePrice(null, null, 20m, false)));
    }

    [Fact]
    public void Given_price_keeps_given_fields_and_fills_missing_ones_from_the_default()
    {
        var price = DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(80m), OrderDefault);
        Assert.Equal(new DeliveryLinePrice(80m, 10m, 20m, false), price);
        Assert.Equal(new DeliveryLinePrice(80m, 0m, 18m, false), DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(80m, 0m, 18m), OrderDefault));
        Assert.Equal(new DeliveryLinePrice(80m, 0m, null, false), DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(80m), null));
        // Discount or VAT without a unit price does not price the line.
        Assert.Equal(DeliveryLinePrice.Unpriced, DeliveryLinePricing.Resolve(new DeliveryLinePriceInput(DiscountPercent: 5m), OrderDefault));
    }

    [Fact]
    public void Entered_unit_prices_convert_to_and_from_the_base_unit()
    {
        // 2 boxes of 12 = 24 base units; base price 10 is 120 per box.
        Assert.Equal(120m, DeliveryLinePricing.FromBaseUnitPrice(10m, 24m, 2m));
        Assert.Equal(10m, DeliveryLinePricing.ToBaseUnitPrice(120m, 24m, 2m));
        Assert.Equal(10m, DeliveryLinePricing.FromBaseUnitPrice(10m, 24m, null));
        // An order price that converts exactly to the entered price is returned unchanged (no rounding drift).
        Assert.Equal(3.33333m, DeliveryLinePricing.ToBaseUnitPrice(DeliveryLinePricing.FromBaseUnitPrice(3.33333m, 3m, 1m), 3m, 1m, 3.33333m));
    }

    [Fact]
    public void Line_amounts_use_entered_quantity_and_are_null_when_free_or_unpriced()
    {
        var amounts = DeliveryLinePricing.Amounts(new DeliveryLinePrice(120m, 10m, 20m, false), 24m, 2m);
        Assert.Equal(216m, amounts.LineNetAmount);
        Assert.Equal(43.2m, amounts.LineVatAmount);
        Assert.Equal(259.2m, amounts.LineTotal);
        Assert.Equal(new DeliveryLineAmounts(null, null, null), DeliveryLinePricing.Amounts(DeliveryLinePrice.Free, 5m, 5m));
        Assert.Equal(new DeliveryLineAmounts(null, null, null), DeliveryLinePricing.Amounts(DeliveryLinePrice.Unpriced, 5m, 5m));
    }

    [Fact]
    public void Pricing_state_and_totals_follow_the_lines()
    {
        var priced = (new DeliveryLinePrice(10m, 0m, 20m, false), 2m, (decimal?)2m);
        var free = (DeliveryLinePrice.Free, 1m, (decimal?)1m);
        var unpriced = (DeliveryLinePrice.Unpriced, 1m, (decimal?)1m);

        var partlyFree = DeliveryLinePricing.Summarize([priced, free]);
        Assert.Equal(("PartlyFree", 20m, 4m, 24m, 1, 0), (partlyFree.PricingState, partlyFree.PricedNetTotal, partlyFree.PricedVatTotal,
            partlyFree.PricedGrandTotal, partlyFree.FreeLineCount, partlyFree.UnpricedLineCount));
        Assert.Equal("Priced", DeliveryLinePricing.Summarize([priced]).PricingState);
        Assert.Equal("Free", DeliveryLinePricing.Summarize([free, free]).PricingState);
        Assert.Equal("Unpriced", DeliveryLinePricing.Summarize([unpriced]).PricingState);
        Assert.Equal("PartlyUnpriced", DeliveryLinePricing.Summarize([priced, unpriced]).PricingState);
        Assert.Equal("PartlyUnpriced", DeliveryLinePricing.Summarize([free, unpriced]).PricingState);
        Assert.Equal(1, DeliveryLinePricing.Summarize([free, unpriced]).UnpricedLineCount);
    }

    [Fact]
    public void Invoice_price_prefers_override_then_delivery_then_order()
    {
        var order = (UnitPrice: 10m, DiscountPercent: 5m, VatPercent: 20m);
        var delivered = new DeliveryLinePrice(12m, 0m, 10m, false);

        Assert.Equal((15m, 0m, 10m), DeliveryLinePricing.ResolveInvoicePrice(new DeliveryLinePriceInput(15m), delivered, order, 1m, 1m));
        Assert.Equal((12m, 0m, 10m), DeliveryLinePricing.ResolveInvoicePrice(null, delivered, order, 1m, 1m));
        // Old S1 row without a stored price: the order line price.
        Assert.Equal(order, DeliveryLinePricing.ResolveInvoicePrice(null, DeliveryLinePrice.Unpriced, order, 1m, 1m));
        // Entered-unit override (per box of 12) becomes a base-unit invoice price.
        Assert.Equal((10m, 5m, 20m), DeliveryLinePricing.ResolveInvoicePrice(new DeliveryLinePriceInput(120m), DeliveryLinePrice.Unpriced, order, 24m, 2m));
    }

    [Fact]
    public void Free_or_unpriced_line_needs_an_entered_amount_and_zero_is_allowed()
    {
        var order = (UnitPrice: 10m, DiscountPercent: 0m, VatPercent: 20m);
        Assert.Null(DeliveryLinePricing.ResolveInvoicePrice(null, DeliveryLinePrice.Free, order, 1m, 1m));
        Assert.Null(DeliveryLinePricing.ResolveInvoicePrice(null, DeliveryLinePrice.Unpriced, null, 1m, 1m));
        Assert.Equal((0m, 0m, 20m), DeliveryLinePricing.ResolveInvoicePrice(new DeliveryLinePriceInput(0m), DeliveryLinePrice.Free, order, 1m, 1m));
        Assert.Equal((0m, 0m, 20m), DeliveryLinePricing.ResolveInvoicePrice(new DeliveryLinePriceInput(0m), DeliveryLinePrice.Free, null, 1m, 1m));
        Assert.Equal("Bedelsiz/fiyatsız satırların tutarını girin.", DeliveryLinePricing.InvoiceAmountRequiredMessage);
    }

    [Fact]
    public void Sales_delivery_write_validation_reports_free_line_with_price()
    {
        var request = new SalesDeliveryWriteRequest(Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 11, 24),
            [new SalesDeliveryLineWriteRequest(1, 2m, UnitPrice: 5m, IsFreeOfCharge: true)]);
        var errors = SalesDeliveryValidation.Validate(request);
        Assert.NotNull(errors);
        Assert.Equal("Bedelsiz satırda fiyat girilemez.", Assert.Single(errors!["lines[0].isFreeOfCharge"]));
        Assert.Null(SalesDeliveryValidation.Validate(request with { Lines = [new SalesDeliveryLineWriteRequest(1, 2m, IsFreeOfCharge: true)] }));
    }

    [Fact]
    public void Purchase_receipt_and_invoice_validation_cover_line_prices()
    {
        var receipt = new PurchaseReceiptWriteRequest(Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 11, 24),
            [new PurchaseReceiptLineWriteRequest(1, 1m, DiscountPercent: 101m)]);
        Assert.True(PurchaseReceiptValidation.Validate(receipt)!.ContainsKey("lines[0].discountPercent"));
        var invoice = new PurchaseInvoiceCreateRequest("ALF-1", new DateOnly(2026, 11, 24),
            Lines: [new PurchaseInvoiceLinePriceRequest(1, -1m), new PurchaseInvoiceLinePriceRequest(1, 1m)]);
        var errors = PurchaseInvoiceValidation.Validate(invoice)!;
        Assert.True(errors.ContainsKey("lines[0].unitPrice"));
        Assert.True(errors.ContainsKey("lines"));
    }
}
