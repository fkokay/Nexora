using AIERP.Platform.Application;
using AIERP.Platform.Domain;

namespace AIERP.Api.DocumentModels;

/// <summary>The satış siparişi model (<c>satis.siparis</c>). Calculation stays with <c>satis.siparis.hesapla</c> (SalesDocumentCalculator).</summary>
internal static class SalesOrderDocumentModel
{
    internal const string Code = DocumentActivityLog.SalesOrder;

    private static DocumentStateView State(SalesOrderStatus status, bool terminal = false) =>
        new(status.ToString(), SalesOrderLifecycle.Label(status), terminal);

    internal static readonly DocumentModelView Model = new(Code, "Satış siparişi",
        [
            new("code", "Sipariş no", "text", false, null, ReadOnly: true),
            new("customerId", "Müşteri", "lookup", true, "cari.listele"),
            new("orderDate", "Sipariş tarihi", "date", true, null),
            new("requestedDeliveryDate", "İstenen teslim tarihi", "date", false, null),
            new("salespersonEmployeeId", "Plasiyer", "lookup", false, "ik.personel.listele")
        ],
        [
            new("stockItemId", "Stok", "lookup", true, false, "stok.kart.listele"),
            new("quantity", "Miktar", "number", true, false, null),
            new("unitCode", "Birim", "lookup", false, false, "stok.kart.birimleri"),
            new("unitPrice", "Birim fiyat", "number", true, false, null),
            new("currencyCode", "Döviz", "text", false, false, null),
            new("discountPercent", "İsk. %", "number", false, false, null),
            new("vatPercent", "KDV %", "number", false, false, null),
            new("isVatIncluded", "KDV dâhil", "checkbox", false, false, null),
            new("availableQuantity", "Kullanılabilir", "number", false, true, null),
            new("lineSubtotal", "Ara toplam", "money", false, true, null),
            new("discountAmount", "İskonto", "money", false, true, null),
            new("taxAmount", "KDV", "money", false, true, null),
            new("lineTotal", "Tutar", "money", false, true, null),
            new("deliveredQuantity", "Sevk edilen", "number", false, true, null, VisibleFrom: nameof(SalesOrderStatus.Open))
        ],
        [State(SalesOrderStatus.Draft), State(SalesOrderStatus.PendingApproval), State(SalesOrderStatus.Open), State(SalesOrderStatus.Fulfilled),
            State(SalesOrderStatus.Invoiced), State(SalesOrderStatus.Cancelled, terminal: true)],
        [
            new(SalesOrderTransitionEndpoints.Approve, "Onayla", ["Draft"], "Open", "satis.siparis.onayla", false),
            new(SalesOrderTransitionEndpoints.Unapprove, "Onayı geri al", ["Open"], "Draft", "satis.siparis.onayiGeriAl", false),
            new(SalesOrderTransitionEndpoints.Cancel, "İptal et", ["Draft", "Open"], "Cancelled", "satis.siparis.iptal", true)
        ],
        "satis.siparis.belge", "satis.siparis.hesapla", "satis.siparis.doldur",
        new Dictionary<string, IReadOnlyList<string>>
        {
            ["stockItemId"] = ["unitCode", "unitPrice", "vatPercent", "discountPercent", "currencyCode", "availableQuantity"]
        },
        "satis.siparis.olustur", "satis.siparis.guncelle");

    /// <summary>
    /// The Studio canvas' sample order in <paramref name="state"/>: fixed values, amounts worked out line by line, nothing read or written.
    /// </summary>
    internal static SalesOrderDocumentView Sample(SalesOrderStatus state)
    {
        var committed = state is SalesOrderStatus.Open or SalesOrderStatus.Fulfilled or SalesOrderStatus.Invoiced;
        SalesOrderLineView Line(int number, string code, string name, string unit, decimal quantity, decimal price, decimal discount, decimal vat, decimal delivered)
        {
            var subtotal = Math.Round(quantity * price, 2);
            var discountAmount = Math.Round(subtotal * discount / 100m, 2);
            var tax = Math.Round((subtotal - discountAmount) * vat / 100m, 2);
            var shipped = committed ? delivered : 0m;
            return new SalesOrderLineView(number, Guid.Empty, code, name, unit, quantity, price, discount, vat, subtotal, discountAmount, tax,
                subtotal - discountAmount + tax, shipped, quantity - shipped, null, null, null, 0m, "TRY", price, unit);
        }
        var fulfilled = state is SalesOrderStatus.Fulfilled or SalesOrderStatus.Invoiced;
        IReadOnlyList<SalesOrderLineView> lines =
        [
            Line(1, "ZYT-01", "Sızma zeytinyağı 5 L", "KOLİ", 40m, 250m, 5m, 20m, 40m),
            Line(2, "BAL-03", "Çiçek balı 850 g", "ADET", 25m, 170m, 5m, 10m, fulfilled ? 25m : 10m)
        ];
        var subtotal = lines.Sum(x => x.LineSubtotal);
        var discount = lines.Sum(x => x.DiscountAmount);
        var tax = lines.Sum(x => x.TaxAmount);
        var order = new SalesOrderView(Guid.Empty, "SO-ORNEK-0001", null, "", Guid.Empty, "Örnek Gıda A.Ş.", new DateOnly(2026, 11, 26), "TRY", state,
            subtotal, discount, tax, subtotal - discount + tax, new DateTimeOffset(2026, 11, 26, 9, 0, 0, TimeSpan.Zero), lines,
            RequestedDeliveryDate: new DateOnly(2026, 12, 5));
        var vat = lines.GroupBy(x => x.VatPercent).OrderBy(g => g.Key)
            .Select(g => new DocumentVatRow(g.Key, g.Sum(x => x.LineSubtotal - x.DiscountAmount), g.Sum(x => x.TaxAmount))).ToList();
        var transitions = Model.Transitions.Where(t => t.From.Contains(state.ToString()))
            .Where(t => !(fulfilled && t.Code == SalesOrderTransitionEndpoints.Cancel)).Select(t => t.Code).ToList();
        var at = new DateTimeOffset(2026, 11, 26, 9, 40, 0, TimeSpan.Zero);
        List<DocumentActivityView> activity = committed
            ? [new("onayla", "Kontroller", "core", "done", null, null, at), new("onayla", "Onaylandı", "core", "done", null, null, at)]
            : [];
        return new SalesOrderDocumentView(order, new DocumentAmounts("TRY", subtotal, discount, tax, subtotal - discount + tax, vat), transitions, activity, false);
    }
}
