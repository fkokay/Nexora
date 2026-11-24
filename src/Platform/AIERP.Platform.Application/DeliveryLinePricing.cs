namespace AIERP.Platform.Application;

/// <summary>Price fields a delivery / receipt line write may carry. All optional; <c>IsFreeOfCharge</c> defaults to false.</summary>
public sealed record DeliveryLinePriceInput(decimal? UnitPrice = null, decimal? DiscountPercent = null, decimal? VatPercent = null,
    bool? IsFreeOfCharge = null)
{
    public bool HasAnyPrice => UnitPrice is not null || DiscountPercent is not null || VatPercent is not null;
}

/// <summary>The stored price of a line: free (all null), unpriced (UnitPrice null, not free) or priced.</summary>
public sealed record DeliveryLinePrice(decimal? UnitPrice, decimal? DiscountPercent, decimal? VatPercent, bool IsFreeOfCharge)
{
    public static readonly DeliveryLinePrice Free = new(null, null, null, true);
    public static readonly DeliveryLinePrice Unpriced = new(null, null, null, false);
    public bool IsPriced => !IsFreeOfCharge && UnitPrice is not null;
}

/// <summary>Amounts of one line; all null when the line is free of charge or unpriced.</summary>
public sealed record DeliveryLineAmounts(decimal? LineNetAmount, decimal? LineVatAmount, decimal? LineTotal);

/// <summary>Header totals of the priced lines plus the free / unpriced counts and the derived pricing state.</summary>
public sealed record DeliveryPricingSummary(decimal PricedNetTotal, decimal PricedVatTotal, decimal PricedGrandTotal,
    int FreeLineCount, int UnpricedLineCount, string PricingState);

/// <summary>
/// Pricing rules shared by sales deliveries (S1/S2), purchase receipts (P1/P2) and purchase delivery notes (P3).
/// Line prices are in the document currency per <b>entered unit</b> of the line; invoices and stock costs work on the stock card
/// base unit, so <see cref="ToBaseUnitPrice"/> / <see cref="FromBaseUnitPrice"/> convert with the line's own quantities.
/// </summary>
public static class DeliveryLinePricing
{
    public const string Priced = "Priced";
    public const string PartlyFree = "PartlyFree";
    public const string Free = "Free";
    public const string Unpriced = "Unpriced";
    public const string PartlyUnpriced = "PartlyUnpriced";

    public const string FreeLineHasPriceMessage = "Bedelsiz satırda fiyat girilemez.";
    public const string InvoiceAmountRequiredMessage = "Bedelsiz/fiyatsız satırların tutarını girin.";
    private const decimal MaxPrice = 99999999999999.9999m;

    /// <summary>Adds Turkish validation errors under <c>{key}.unitPrice</c> etc. Returns true when the line input is valid.</summary>
    public static bool Validate(DeliveryLinePriceInput? input, string key, IDictionary<string, string[]> errors)
    {
        if (input is null) return true;
        if (input.IsFreeOfCharge == true && input.HasAnyPrice)
        {
            errors[$"{key}.isFreeOfCharge"] = [FreeLineHasPriceMessage];
            return false;
        }
        var valid = true;
        if (input.UnitPrice is { } price && (price < 0m || price > MaxPrice || price != decimal.Round(price, 4)))
        {
            errors[$"{key}.unitPrice"] = ["Birim fiyat sıfır veya pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
            valid = false;
        }
        if (input.DiscountPercent is { } discount && (discount < 0m || discount > 100m || discount != decimal.Round(discount, 2)))
        {
            errors[$"{key}.discountPercent"] = ["İskonto oranı 0 ile 100 arasında olmalı ve en fazla 2 ondalık basamak içermelidir."];
            valid = false;
        }
        if (input.VatPercent is { } vat && (vat < 0m || vat > 100m || vat != decimal.Round(vat, 2)))
        {
            errors[$"{key}.vatPercent"] = ["KDV oranı 0 ile 100 arasında olmalı ve en fazla 2 ondalık basamak içermelidir."];
            valid = false;
        }
        return valid;
    }

    /// <summary>
    /// The price to store. Free ⇒ all null. When no price field is given the default applies (order line for S1/P1, list price for S2,
    /// none for P2/P3). A given unit price fills a missing discount with the default's or 0 and a missing VAT with the default's.
    /// A line that sends only discount / VAT without a unit price stays unpriced.
    /// </summary>
    public static DeliveryLinePrice Resolve(DeliveryLinePriceInput? input, DeliveryLinePrice? defaults)
    {
        if (input?.IsFreeOfCharge == true) return DeliveryLinePrice.Free;
        if (input is null || !input.HasAnyPrice)
            return defaults is { IsPriced: true } ? defaults with { IsFreeOfCharge = false } : DeliveryLinePrice.Unpriced;
        if (input.UnitPrice is null) return DeliveryLinePrice.Unpriced;
        return new DeliveryLinePrice(input.UnitPrice, input.DiscountPercent ?? defaults?.DiscountPercent ?? 0m,
            input.VatPercent ?? defaults?.VatPercent, false);
    }

    /// <summary>Stored entity values back as a price.</summary>
    public static DeliveryLinePrice FromStored(decimal? unitPrice, decimal? discountPercent, decimal? vatPercent, bool isFreeOfCharge) =>
        isFreeOfCharge ? DeliveryLinePrice.Free : new DeliveryLinePrice(unitPrice, discountPercent, vatPercent, false);

    /// <summary>Entered-unit factor of a line: base quantity per entered quantity (1 when the line was entered in the base unit).</summary>
    public static decimal UnitFactor(decimal baseQuantity, decimal? enteredQuantity) =>
        enteredQuantity is { } entered && entered > 0m && baseQuantity > 0m ? baseQuantity / entered : 1m;

    /// <summary>A base-unit price (order line, invoice line) expressed per entered unit of the line, 4 decimals.</summary>
    public static decimal FromBaseUnitPrice(decimal basePrice, decimal baseQuantity, decimal? enteredQuantity)
    {
        var factor = UnitFactor(baseQuantity, enteredQuantity);
        return factor == 1m ? basePrice : decimal.Round(basePrice * factor, 4, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// An entered-unit price expressed per base unit, 4 decimals. When <paramref name="knownBasePrice"/> converts to exactly the same
    /// entered price (the price came from the order line) it is returned unchanged so no rounding is introduced.
    /// </summary>
    public static decimal ToBaseUnitPrice(decimal enteredPrice, decimal baseQuantity, decimal? enteredQuantity, decimal? knownBasePrice = null)
    {
        var factor = UnitFactor(baseQuantity, enteredQuantity);
        if (factor == 1m) return enteredPrice;
        if (knownBasePrice is { } known && FromBaseUnitPrice(known, baseQuantity, enteredQuantity) == enteredPrice) return known;
        return decimal.Round(enteredPrice / factor, 4, MidpointRounding.AwayFromZero);
    }

    /// <summary>Line amounts on the entered quantity: net = qty × price × (1 − disc), VAT on net, both rounded to 2 decimals.</summary>
    public static DeliveryLineAmounts Amounts(DeliveryLinePrice price, decimal baseQuantity, decimal? enteredQuantity)
    {
        if (!price.IsPriced) return new DeliveryLineAmounts(null, null, null);
        var quantity = enteredQuantity ?? baseQuantity;
        var gross = decimal.Round(quantity * price.UnitPrice!.Value, 2, MidpointRounding.AwayFromZero);
        var net = gross - decimal.Round(gross * (price.DiscountPercent ?? 0m) / 100m, 2, MidpointRounding.AwayFromZero);
        var vat = decimal.Round(net * (price.VatPercent ?? 0m) / 100m, 2, MidpointRounding.AwayFromZero);
        return new DeliveryLineAmounts(net, vat, net + vat);
    }

    public static DeliveryPricingSummary Summarize(IEnumerable<(DeliveryLinePrice Price, decimal Quantity, decimal? EnteredQuantity)> lines)
    {
        decimal net = 0m, vat = 0m;
        int free = 0, unpriced = 0, priced = 0;
        foreach (var line in lines)
        {
            if (line.Price.IsFreeOfCharge) { free++; continue; }
            if (!line.Price.IsPriced) { unpriced++; continue; }
            priced++;
            var amounts = Amounts(line.Price, line.Quantity, line.EnteredQuantity);
            net += amounts.LineNetAmount!.Value;
            vat += amounts.LineVatAmount!.Value;
        }
        return new DeliveryPricingSummary(net, vat, net + vat, free, unpriced, State(priced, free, unpriced));
    }

    /// <summary>"Free" = every line free; "PartlyFree" = some free and the rest priced; unpriced variants when a non-free line has no price.</summary>
    public static string State(int pricedCount, int freeCount, int unpricedCount)
    {
        if (unpricedCount > 0) return pricedCount == 0 && freeCount == 0 ? Unpriced : PartlyUnpriced;
        if (freeCount > 0) return pricedCount == 0 ? Free : PartlyFree;
        return pricedCount == 0 ? Unpriced : Priced;
    }

    /// <summary>
    /// Invoice price of a delivery line, in the base unit: (1) the request override, (2) the delivery line price, (3) the order line
    /// price (old rows written before delivery prices existed, or unpriced lines of an order-based delivery). Null when the line is
    /// free or unpriced and no override is given: the caller answers <see cref="InvoiceAmountRequiredMessage"/>.
    /// Override and delivery prices are per entered unit of the line; order line prices are per base unit.
    /// </summary>
    public static (decimal UnitPrice, decimal DiscountPercent, decimal VatPercent)? ResolveInvoicePrice(
        DeliveryLinePriceInput? requestOverride, DeliveryLinePrice delivery,
        (decimal UnitPrice, decimal DiscountPercent, decimal VatPercent)? orderLine,
        decimal baseQuantity, decimal? enteredQuantity, decimal defaultVatPercent = 20m)
    {
        var knownBase = orderLine?.UnitPrice;
        if (requestOverride?.UnitPrice is { } overridePrice)
            return (ToBaseUnitPrice(overridePrice, baseQuantity, enteredQuantity, knownBase),
                requestOverride.DiscountPercent ?? delivery.DiscountPercent ?? orderLine?.DiscountPercent ?? 0m,
                requestOverride.VatPercent ?? delivery.VatPercent ?? orderLine?.VatPercent ?? defaultVatPercent);
        if (delivery.IsPriced)
            return (ToBaseUnitPrice(delivery.UnitPrice!.Value, baseQuantity, enteredQuantity, knownBase),
                delivery.DiscountPercent ?? orderLine?.DiscountPercent ?? 0m,
                delivery.VatPercent ?? orderLine?.VatPercent ?? defaultVatPercent);
        if (!delivery.IsFreeOfCharge && orderLine is { } order) return order;
        return null;
    }
}
