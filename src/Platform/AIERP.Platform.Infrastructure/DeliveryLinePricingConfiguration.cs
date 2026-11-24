using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AIERP.Platform.Infrastructure;

/// <summary>
/// Price columns shared by the delivery / receipt line tables (irsaliye fiyatı ve bedelsiz satır). All columns are nullable or
/// defaulted so the change is expand-only; a free-of-charge line never carries a price.
/// </summary>
internal static class DeliveryLinePricingConfiguration
{
    internal static void ConfigureLinePrice<T>(EntityTypeBuilder<T> e, string tableName) where T : class
    {
        e.Property<decimal?>("UnitPrice").HasPrecision(18, 4);
        e.Property<decimal?>("DiscountPercent").HasPrecision(9, 4);
        e.Property<decimal?>("VatPercent").HasPrecision(9, 4);
        e.ToTable(t =>
        {
            t.HasCheckConstraint($"CK_{tableName}_FreeOfChargeUnpriced",
                "[IsFreeOfCharge] = 0 OR ([UnitPrice] IS NULL AND [DiscountPercent] IS NULL AND [VatPercent] IS NULL)");
            t.HasCheckConstraint($"CK_{tableName}_PriceRanges",
                "([UnitPrice] IS NULL OR [UnitPrice] >= 0) AND ([DiscountPercent] IS NULL OR ([DiscountPercent] >= 0 AND [DiscountPercent] <= 100)) AND ([VatPercent] IS NULL OR ([VatPercent] >= 0 AND [VatPercent] <= 100))");
        });
    }

    internal static void ConfigureHeaderCurrency<T>(EntityTypeBuilder<T> e) where T : class =>
        e.Property<string?>("CurrencyCode").HasMaxLength(3);
}
