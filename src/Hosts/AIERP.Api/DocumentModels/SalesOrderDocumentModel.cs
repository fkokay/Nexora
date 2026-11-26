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
            new("code", "Sipariş no", "text", false, null),
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
            new("deliveredQuantity", "Sevk edilen", "number", false, true, null)
        ],
        [State(SalesOrderStatus.Draft), State(SalesOrderStatus.PendingApproval), State(SalesOrderStatus.Open), State(SalesOrderStatus.Fulfilled),
            State(SalesOrderStatus.Invoiced), State(SalesOrderStatus.Cancelled, terminal: true)],
        [
            new(SalesOrderTransitionEndpoints.Approve, "Onayla", ["Draft"], "Open", "satis.siparis.onayla", false),
            new(SalesOrderTransitionEndpoints.Unapprove, "Onayı geri al", ["Open"], "Draft", "satis.siparis.onayiGeriAl", false),
            new(SalesOrderTransitionEndpoints.Cancel, "İptal et", ["Draft", "Open"], "Cancelled", "satis.siparis.iptal", true)
        ],
        "satis.siparis.belge", "satis.siparis.hesapla", "satis.siparis.doldur");
}
