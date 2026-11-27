using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Api.DocumentModels;

/// <summary>
/// The satış teklifi model (<c>satis.teklif</c>). Lines, fills and calculation are the sales documents' shared parts; the states and
/// transitions map onto the existing quote operations (İlet, Kabul et, Reddet). Revision, order conversion and printing are not
/// transitions of this model (they create documents or files) and stay with their own operations.
/// </summary>
internal static class SalesQuoteDocumentModel
{
    internal const string Code = DocumentActivityLog.SalesQuote;
    internal const string Send = "ilet";
    internal const string Accept = "kabulEt";
    internal const string Reject = "reddet";

    private static DocumentStateView State(SalesQuoteStatus status, string label, bool terminal = false) => new(status.ToString(), label, terminal);

    internal static string Label(SalesQuoteStatus status) => status switch
    {
        SalesQuoteStatus.Draft => "Taslak",
        SalesQuoteStatus.Sent => "İletildi",
        SalesQuoteStatus.Accepted => "Kabul edildi",
        SalesQuoteStatus.Rejected => "Reddedildi",
        SalesQuoteStatus.Expired => "Süresi doldu",
        _ => status.ToString()
    };

    internal static readonly DocumentModelView Model = new(Code, "Satış teklifi",
        [
            new("code", "Teklif no", "text", false, null, ReadOnly: true),
            new("customerId", "Müşteri", "lookup", true, "cari.listele"),
            new("quoteDate", "Teklif tarihi", "date", true, null),
            new("validUntil", "Geçerlilik", "date", true, null),
            new("salespersonEmployeeId", "Plasiyer", "lookup", false, "ik.personel.listele"),
            new("deliveryTerms", "Teslimat koşulları", "text", false, null),
            new("notes", "Notlar", "text", false, null)
        ],
        SalesDocumentModelParts.LineColumns(),
        // Kabul edildi closes the chain; Reddedildi and Süresi doldu sit beside it (a rejected quote can still be accepted).
        [State(SalesQuoteStatus.Draft, Label(SalesQuoteStatus.Draft)), State(SalesQuoteStatus.Sent, Label(SalesQuoteStatus.Sent)),
            State(SalesQuoteStatus.Accepted, Label(SalesQuoteStatus.Accepted)),
            State(SalesQuoteStatus.Rejected, Label(SalesQuoteStatus.Rejected), terminal: true),
            State(SalesQuoteStatus.Expired, Label(SalesQuoteStatus.Expired), terminal: true)],
        [
            new(Send, "İlet", ["Draft"], "Sent", "satis.teklif.ilet", false),
            new(Accept, "Kabul et", ["Sent", "Rejected"], "Accepted", "satis.teklif.kabulEt", false),
            new(Reject, "Reddet", ["Sent"], "Rejected", "satis.teklif.reddet", false)
        ],
        "satis.teklif.belge", "satis.teklif.hesapla", "satis.teklif.doldur",
        SalesDocumentModelParts.StockFills(),
        "satis.teklif.olustur", "satis.teklif.guncelle");

    /// <summary>The transitions the state chain allows (<see cref="SalesQuoteWorkflow"/>); a converted quote is closed.</summary>
    internal static List<string> Candidates(SalesQuoteStatus status, bool hasOrder)
    {
        var candidates = new List<string>();
        if (hasOrder) return candidates;
        if (SalesQuoteWorkflow.CanTransition(status, SalesQuoteStatus.Sent)) candidates.Add(Send);
        if (SalesQuoteWorkflow.CanTransition(status, SalesQuoteStatus.Accepted)) candidates.Add(Accept);
        if (SalesQuoteWorkflow.CanTransition(status, SalesQuoteStatus.Rejected)) candidates.Add(Reject);
        return candidates;
    }

    /// <summary>The Studio canvas' sample quote in <paramref name="state"/>: fixed values, nothing read or written.</summary>
    internal static SalesQuoteDocumentView Sample(SalesQuoteStatus state)
    {
        SalesQuoteLineView Line(int number, string code, string name, string unit, decimal quantity, decimal price, decimal discount, decimal vat)
        {
            var amounts = SalesDocumentModelParts.SampleAmounts(quantity, price, discount, vat);
            return new SalesQuoteLineView(number, Guid.Empty, code, name, unit, quantity, price, discount, vat, amounts.Subtotal, amounts.Discount,
                amounts.Tax, amounts.Total, "TRY", price, unit);
        }
        IReadOnlyList<SalesQuoteLineView> lines =
        [
            Line(1, "ZYT-01", "Sızma zeytinyağı 5 L", "KOLİ", 40m, 250m, 5m, 20m),
            Line(2, "BAL-03", "Çiçek balı 850 g", "ADET", 25m, 170m, 5m, 10m)
        ];
        var subtotal = lines.Sum(x => x.LineSubtotal);
        var discount = lines.Sum(x => x.DiscountAmount);
        var tax = lines.Sum(x => x.TaxAmount);
        var quote = new SalesQuoteView(Guid.Empty, "TKL-ORNEK-0001", Guid.Empty, "Örnek Gıda A.Ş.", new DateOnly(2026, 11, 26), new DateOnly(2026, 12, 26),
            "TRY", state, null, subtotal, discount, tax, subtotal - discount + tax, new DateTimeOffset(2026, 11, 26, 9, 0, 0, TimeSpan.Zero), lines);
        var vat = SalesDocumentModelParts.VatRows(lines.Select(x => (x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount)));
        var transitions = Candidates(state, hasOrder: false);
        var at = new DateTimeOffset(2026, 11, 26, 9, 40, 0, TimeSpan.Zero);
        List<DocumentActivityView> activity = state == SalesQuoteStatus.Draft ? [] : [new("ilet", "Müşteriye iletildi", "core", "done", null, null, at)];
        return new SalesQuoteDocumentView(quote, new DocumentAmounts("TRY", subtotal, discount, tax, subtotal - discount + tax, vat), transitions, activity, false);
    }
}
