using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Platform.UnitTests;

public sealed class SalesOrderLifecycleTests
{
    [Fact]
    public void Enum_values_keep_existing_numbers()
    {
        Assert.Equal(1, (int)SalesOrderStatus.Open);
        Assert.Equal(2, (int)SalesOrderStatus.Fulfilled);
        Assert.Equal(3, (int)SalesOrderStatus.Cancelled);
        Assert.Equal(4, (int)SalesOrderStatus.Draft);
        Assert.Equal(5, (int)SalesOrderStatus.PendingApproval);
        Assert.Equal(6, (int)SalesOrderStatus.Invoiced);
    }

    [Theory]
    [InlineData(SalesOrderStatus.Draft, true)]
    [InlineData(SalesOrderStatus.PendingApproval, false)]
    [InlineData(SalesOrderStatus.Open, false)]
    [InlineData(SalesOrderStatus.Fulfilled, false)]
    [InlineData(SalesOrderStatus.Invoiced, false)]
    [InlineData(SalesOrderStatus.Cancelled, false)]
    public void Only_drafts_can_be_edited_or_approved(SalesOrderStatus status, bool expected)
    {
        Assert.Equal(expected, SalesOrderLifecycle.CanEdit(status));
        Assert.Equal(expected, SalesOrderLifecycle.CanApprove(status));
    }

    [Theory]
    [InlineData(SalesOrderStatus.Draft, true)]
    [InlineData(SalesOrderStatus.Open, true)]
    [InlineData(SalesOrderStatus.PendingApproval, false)]
    [InlineData(SalesOrderStatus.Fulfilled, false)]
    [InlineData(SalesOrderStatus.Cancelled, false)]
    public void Delivery_date_and_custom_fields_open_on_draft_and_approved(SalesOrderStatus status, bool expected) =>
        Assert.Equal(expected, SalesOrderLifecycle.CanEditDeliveryDateOrCustomFields(status));

    [Theory]
    [InlineData(SalesOrderStatus.Open, false, false, false, true)]
    [InlineData(SalesOrderStatus.Open, true, false, false, false)]
    [InlineData(SalesOrderStatus.Open, false, true, false, false)]
    [InlineData(SalesOrderStatus.Open, false, false, true, false)]
    [InlineData(SalesOrderStatus.Draft, false, false, false, false)]
    [InlineData(SalesOrderStatus.Fulfilled, false, false, false, false)]
    public void Unapprove_needs_a_clean_approved_order(SalesOrderStatus status, bool deliveries, bool invoices, bool reservations, bool expected) =>
        Assert.Equal(expected, SalesOrderLifecycle.CanUnapprove(status, deliveries, invoices, reservations));

    [Theory]
    [InlineData(SalesOrderStatus.Draft, false, true)]
    [InlineData(SalesOrderStatus.Open, false, true)]
    [InlineData(SalesOrderStatus.Open, true, false)]
    [InlineData(SalesOrderStatus.PendingApproval, false, true)] // belge kuralları PR 3: a held order may be cancelled
    [InlineData(SalesOrderStatus.Fulfilled, false, false)]
    [InlineData(SalesOrderStatus.Cancelled, false, false)]
    public void Cancel_only_draft_or_unshipped_approved(SalesOrderStatus status, bool deliveries, bool expected) =>
        Assert.Equal(expected, SalesOrderLifecycle.CanCancel(status, deliveries));

    [Theory]
    [InlineData(SalesOrderStatus.Open, true)]
    [InlineData(SalesOrderStatus.Fulfilled, true)]
    [InlineData(SalesOrderStatus.Invoiced, true)]
    [InlineData(SalesOrderStatus.Draft, false)]
    [InlineData(SalesOrderStatus.PendingApproval, false)]
    [InlineData(SalesOrderStatus.Cancelled, false)]
    public void Committed_orders_are_approved_shipped_or_invoiced(SalesOrderStatus status, bool expected) =>
        Assert.Equal(expected, SalesOrderLifecycle.IsCommitted(status));

    [Theory]
    [InlineData(SalesOrderStatus.Open, true, true, true, SalesOrderStatus.Invoiced)]
    [InlineData(SalesOrderStatus.Open, true, false, true, SalesOrderStatus.Fulfilled)]
    [InlineData(SalesOrderStatus.Invoiced, true, false, true, SalesOrderStatus.Fulfilled)]
    [InlineData(SalesOrderStatus.Fulfilled, false, false, true, SalesOrderStatus.Open)]
    [InlineData(SalesOrderStatus.Fulfilled, false, false, false, SalesOrderStatus.Open)]
    [InlineData(SalesOrderStatus.Cancelled, true, true, true, SalesOrderStatus.Cancelled)]
    [InlineData(SalesOrderStatus.Draft, true, true, true, SalesOrderStatus.Draft)]
    [InlineData(SalesOrderStatus.PendingApproval, true, true, true, SalesOrderStatus.PendingApproval)]
    public void Derive_follows_deliveries_and_invoices(SalesOrderStatus current, bool fullyDelivered, bool allInvoiced,
        bool hasPostedDelivery, SalesOrderStatus expected) =>
        Assert.Equal(expected, SalesOrderLifecycle.Derive(current, fullyDelivered, allInvoiced, hasPostedDelivery));

    [Fact]
    public void Page_summary_counts_only_committed_orders()
    {
        SalesOrderSummary Row(SalesOrderStatus status, decimal total) => new(Guid.NewGuid(), "SO", null, "Bağımsız", Guid.NewGuid(), "C",
            new DateOnly(2026, 11, 2), "TRY", status, total, 1, DateTimeOffset.UtcNow, null, null);
        var page = new SalesOrderPage([Row(SalesOrderStatus.Open, 100m), Row(SalesOrderStatus.Draft, 40m),
            Row(SalesOrderStatus.PendingApproval, 7m), Row(SalesOrderStatus.Cancelled, 1m), Row(SalesOrderStatus.Invoiced, 10m)], 1, 25, 5);

        Assert.Equal(110m, page.PageGrandTotal);
    }

    [Theory]
    [InlineData(SalesOrderStatus.Draft, "Taslak")]
    [InlineData(SalesOrderStatus.PendingApproval, "Onay bekliyor")]
    [InlineData(SalesOrderStatus.Open, "Onaylı")]
    [InlineData(SalesOrderStatus.Fulfilled, "Sevk edildi")]
    [InlineData(SalesOrderStatus.Invoiced, "Faturalandı")]
    [InlineData(SalesOrderStatus.Cancelled, "İptal")]
    public void Labels_are_turkish(SalesOrderStatus status, string label) =>
        Assert.Equal(label, SalesOrderLifecycle.Label(status));
}
