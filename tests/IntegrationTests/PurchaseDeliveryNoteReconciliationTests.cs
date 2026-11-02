using AIERP.Api;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class PurchaseDeliveryNoteReconciliationTests
{
    [Fact]
    public void Exact_order_line_quantities_reconcile()
    {
        var note = new[] { (1, 2.5m), (3, 4m) };
        var receipt = new[] { (3, 4m), (1, 2.5m) };

        Assert.True(PurchaseDeliveryNoteReconciliation.IsExactMatch(note, receipt));
    }

    [Theory]
    [MemberData(nameof(Mismatches))]
    public void Different_lines_or_quantities_do_not_reconcile((int OrderLineNumber, decimal Quantity)[] note,
        (int OrderLineNumber, decimal Quantity)[] receipt)
    {
        Assert.False(PurchaseDeliveryNoteReconciliation.IsExactMatch(note, receipt));
    }

    public static IEnumerable<object[]> Mismatches =>
    [
        [new[] { (1, 2m) }, new[] { (1, 1.9999m) }],
        [new[] { (1, 2m) }, new[] { (2, 2m) }],
        [new[] { (1, 2m), (2, 3m) }, new[] { (1, 2m) }],
        [new (int, decimal)[] { } , new (int, decimal)[] { }]
    ];
}
