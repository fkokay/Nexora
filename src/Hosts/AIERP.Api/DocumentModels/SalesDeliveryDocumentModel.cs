using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// The satış irsaliyesi model (<c>satis.irsaliye</c>). The editable document is the siparişsiz (standalone) delivery: Taslak, saved with
/// the existing standalone endpoints, then "Sevk et" posts it (<c>satis.irsaliye.sevket</c>, stock leaves the warehouse). Order-based
/// and invoice-born deliveries open read-only; an order-based one can be voided (<c>satis.irsaliye.iptal</c>). Creating the order
/// delivery, invoicing, lot/serial allocation at posting and printing are not part of the model. Totals show the saved prices only
/// (there is no calculation endpoint), so they appear after the draft is saved.
/// </summary>
internal static class SalesDeliveryDocumentModel
{
    internal const string Code = DocumentActivityLog.SalesDelivery;
    internal const string Post = "sevket";
    internal const string Void = "iptal";

    private static DocumentStateView State(SalesDeliveryDocumentState status, string label, bool terminal = false) => new(status.ToString(), label, terminal);

    internal static string Label(SalesDeliveryDocumentState status) => status switch
    {
        SalesDeliveryDocumentState.Draft => "Taslak",
        SalesDeliveryDocumentState.Posted => "Sevk edildi",
        SalesDeliveryDocumentState.Voided => "İptal edildi",
        _ => status.ToString()
    };

    internal static SalesDeliveryDocumentState StateOf(SalesDeliveryStatus status) =>
        status == SalesDeliveryStatus.Posted ? SalesDeliveryDocumentState.Posted : SalesDeliveryDocumentState.Voided;

    internal static SalesDeliveryDocumentState StateOf(StandaloneInventoryDocumentStatus status) => status switch
    {
        StandaloneInventoryDocumentStatus.Draft => SalesDeliveryDocumentState.Draft,
        StandaloneInventoryDocumentStatus.Posted => SalesDeliveryDocumentState.Posted,
        _ => SalesDeliveryDocumentState.Voided
    };

    internal static readonly DocumentModelView Model = new(Code, "Satış irsaliyesi",
        [
            new("code", "İrsaliye no", "text", true, null),
            new("customerId", "Müşteri", "lookup", true, "cari.listele"),
            new("deliveryDate", "İrsaliye tarihi", "date", true, null),
            new("warehouseId", "Depo", "lookup", true, "depo.listele")
        ],
        // The delivery's own prices are optional (free or unpriced lines), so the line columns are the shared ones; the quantity is the entered one.
        SalesDocumentModelParts.LineColumns(),
        [State(SalesDeliveryDocumentState.Draft, Label(SalesDeliveryDocumentState.Draft)), State(SalesDeliveryDocumentState.Posted, Label(SalesDeliveryDocumentState.Posted)),
            State(SalesDeliveryDocumentState.Voided, Label(SalesDeliveryDocumentState.Voided), terminal: true)],
        [
            new(Post, "Sevk et", ["Draft"], "Posted", "satis.irsaliye.sevket", false),
            new(Void, "İptal et", ["Posted"], "Voided", "satis.irsaliye.iptal", true)
        ],
        "satis.irsaliye.belge", "", "satis.irsaliye.doldur",
        SalesDocumentModelParts.StockFills(),
        "satis.irsaliye.olustur", "satis.irsaliye.guncelle");

    /// <summary>The transitions the state chain allows: a standalone draft is posted; an order-based delivery without an invoice can be voided.</summary>
    internal static List<string> Candidates(SalesDeliveryDocumentState state, bool isStandalone, bool hasInvoice)
    {
        if (state == SalesDeliveryDocumentState.Draft && isStandalone) return [Post];
        if (state == SalesDeliveryDocumentState.Posted && !isStandalone && !hasInvoice) return [Void];
        return [];
    }

    /// <summary>The Studio canvas' sample delivery in <paramref name="state"/>: fixed values, nothing read or written.</summary>
    internal static SalesDeliveryDocumentView Sample(SalesDeliveryDocumentState state)
    {
        SalesDeliveryDocumentLine Line(int number, string code, string name, string unit, decimal quantity, decimal price, decimal discount, decimal vat)
        {
            var amounts = SalesDocumentModelParts.SampleAmounts(quantity, price, discount, vat);
            return new SalesDeliveryDocumentLine(number, Guid.Empty, code, name, unit, quantity, price, discount, vat, false, null, null, null,
                amounts.Subtotal, amounts.Discount, amounts.Tax, amounts.Total);
        }
        IReadOnlyList<SalesDeliveryDocumentLine> lines =
        [
            Line(1, "ZYT-01", "Sızma zeytinyağı 5 L", "KOLİ", 40m, 250m, 5m, 20m),
            Line(2, "BAL-03", "Çiçek balı 850 g", "ADET", 25m, 170m, 5m, 10m)
        ];
        var subtotal = lines.Sum(x => x.LineSubtotal);
        var discount = lines.Sum(x => x.DiscountAmount);
        var tax = lines.Sum(x => x.TaxAmount);
        var delivery = new SalesDeliveryDocumentRecord(Guid.Empty, "IRS-ORNEK-0001", Guid.Empty, "Örnek Gıda A.Ş.", new DateOnly(2026, 11, 26), "TRY", state,
            Guid.Empty, "Ana depo", state == SalesDeliveryDocumentState.Draft, null, null, lines);
        var vat = SalesDocumentModelParts.VatRows(lines.Select(x => (x.VatPercent ?? 0m, x.LineSubtotal, x.DiscountAmount, x.TaxAmount)));
        var at = new DateTimeOffset(2026, 11, 26, 9, 40, 0, TimeSpan.Zero);
        List<DocumentActivityView> activity = state == SalesDeliveryDocumentState.Draft ? [] : [new("sevket", "Sevk edildi", "core", "done", null, null, at)];
        return new SalesDeliveryDocumentView(delivery, new DocumentAmounts("TRY", subtotal, discount, tax, subtotal - discount + tax, vat),
            Candidates(state, state == SalesDeliveryDocumentState.Draft, false), activity, false);
    }
}
