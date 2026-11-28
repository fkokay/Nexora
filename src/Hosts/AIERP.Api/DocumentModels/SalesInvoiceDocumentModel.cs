using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// The satış faturası model (<c>satis.fatura</c>). A new invoice is the unsaved Taslak; saving it is the existing "Faturayı kes"
/// (<c>satis.fatura.olustur</c>: invoice, delivery and stock movement in one write), after which the invoice is Kesildi and no longer
/// editable. The only transition is İptal et (<c>satis.fatura.iptal</c>). e-Arşiv details, withholding lines, collections, returns,
/// printing and e-document sending are not part of the model.
/// </summary>
internal static class SalesInvoiceDocumentModel
{
    internal const string Code = DocumentActivityLog.SalesInvoice;
    internal const string Void = "iptal";

    private static DocumentStateView State(SalesInvoiceDocumentState status, string label, bool terminal = false) => new(status.ToString(), label, terminal);

    internal static string Label(SalesInvoiceDocumentState status) => status switch
    {
        SalesInvoiceDocumentState.Draft => "Taslak",
        SalesInvoiceDocumentState.Posted => "Kesildi",
        SalesInvoiceDocumentState.Voided => "İptal edildi",
        _ => status.ToString()
    };

    internal static SalesInvoiceDocumentState StateOf(SalesInvoiceStatus status) =>
        status == SalesInvoiceStatus.Voided ? SalesInvoiceDocumentState.Voided : SalesInvoiceDocumentState.Posted;

    internal static readonly DocumentModelView Model = new(Code, "Satış faturası",
        [
            new("code", "Fatura no", "text", false, null, ReadOnly: true),
            new("customerId", "Müşteri", "lookup", true, "cari.listele"),
            new("invoiceDate", "Fatura tarihi", "date", true, null),
            new("warehouseId", "Depo", "lookup", true, "depo.listele"),
            new("invoiceType", "Fatura türü", "select", true, null, Options:
                [new("Wholesale", "Toptan"), new("Retail", "Perakende (KDV dâhil)")]),
            new("accountingProfileCode", "Vergi profili", "lookup", false, "satinalma.faturaGirisi.mevzuatProfilleri"),
            new("eDocumentScenario", "e-Belge senaryosu", "text", false, null),
            new("eDocumentTypeCode", "e-Belge tür kodu", "text", false, null),
            new("eDocumentRecipientAlias", "Alıcı e-Fatura etiketi", "text", false, null),
            new("notes", "Fatura notu", "text", false, null)
        ],
        SalesDocumentModelParts.LineColumns(),
        [State(SalesInvoiceDocumentState.Draft, Label(SalesInvoiceDocumentState.Draft)), State(SalesInvoiceDocumentState.Posted, Label(SalesInvoiceDocumentState.Posted)),
            State(SalesInvoiceDocumentState.Voided, Label(SalesInvoiceDocumentState.Voided), terminal: true)],
        [new(Void, "İptal et", ["Posted"], "Voided", "satis.fatura.iptal", true)],
        "satis.fatura.belge", "satis.fatura.onizle", "satis.fatura.doldur",
        SalesDocumentModelParts.StockFills(),
        "satis.fatura.olustur", "");

    /// <summary>The transitions the state chain allows: only a cut invoice can be voided.</summary>
    internal static List<string> Candidates(SalesInvoiceStatus status) => status == SalesInvoiceStatus.Posted ? [Void] : [];

    /// <summary>The Studio canvas' sample invoice in <paramref name="state"/>: fixed values, nothing read or written.</summary>
    internal static SalesInvoiceDocumentView Sample(SalesInvoiceDocumentState state)
    {
        SalesInvoiceDocumentLine Line(int number, string code, string name, string unit, decimal quantity, decimal price, decimal discount, decimal vat)
        {
            var amounts = SalesDocumentModelParts.SampleAmounts(quantity, price, discount, vat);
            return new SalesInvoiceDocumentLine(number, Guid.Empty, code, name, unit, quantity, price, discount, vat, amounts.Subtotal, amounts.Discount, amounts.Tax, amounts.Total);
        }
        IReadOnlyList<SalesInvoiceDocumentLine> lines =
        [
            Line(1, "ZYT-01", "Sızma zeytinyağı 5 L", "KOLİ", 40m, 250m, 5m, 20m),
            Line(2, "BAL-03", "Çiçek balı 850 g", "ADET", 25m, 170m, 5m, 10m)
        ];
        var subtotal = lines.Sum(x => x.LineSubtotal);
        var discount = lines.Sum(x => x.DiscountAmount);
        var tax = lines.Sum(x => x.TaxAmount);
        var invoice = new SalesInvoiceDocumentRecord(Guid.Empty, state == SalesInvoiceDocumentState.Draft ? "" : "FTR-ORNEK-0001", Guid.Empty, "Örnek Gıda A.Ş.",
            new DateOnly(2026, 11, 26), "TRY", state, SalesInvoiceType.Wholesale, null, null, null, null, null, Guid.Empty, "Ana depo", null, null, lines, []);
        var vat = SalesDocumentModelParts.VatRows(lines.Select(x => (x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount)));
        var transitions = state == SalesInvoiceDocumentState.Posted ? [Void] : new List<string>();
        var at = new DateTimeOffset(2026, 11, 26, 9, 40, 0, TimeSpan.Zero);
        List<DocumentActivityView> activity = state == SalesInvoiceDocumentState.Draft ? [] : [new("kes", "Fatura kesildi", "core", "done", null, null, at)];
        return new SalesInvoiceDocumentView(invoice, new DocumentAmounts("TRY", subtotal, discount, tax, subtotal - discount + tax, vat), transitions, activity, false);
    }
}
