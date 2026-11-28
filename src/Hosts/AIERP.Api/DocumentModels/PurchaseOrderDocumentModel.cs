using AIERP.Platform.Domain;

namespace AIERP.Api.DocumentModels;

internal static class PurchaseOrderDocumentModel
{
    internal const string Code = DocumentActivityLog.PurchaseOrder;
    internal static readonly DocumentModelView Model = new(Code, "Satınalma siparişi",
        [new("code", "Sipariş no", "text", false, null, true), new("supplierId", "Tedarikçi", "lookup", true, "satinalma.faturaTaslagi.tedarikciler"),
         new("orderDate", "Sipariş tarihi", "date", true, null), new("expectedReceiptDate", "Beklenen teslim", "date", false, null),
         new("targetWarehouseId", "Hedef depo", "lookup", false, "depo.listele"),
         new("currencyCode", "Para birimi", "text", true, null), new("notes", "Notlar", "text", false, null)],
        [new("stockItemId", "Stok", "lookup", true, false, "stok.kart.listele"), new("quantity", "Miktar", "number", true, false, null),
         new("unitCode", "Birim", "text", true, false, null), new("unitPrice", "Birim fiyat", "number", true, false, null),
         new("discountPercent", "İskonto %", "number", false, false, null), new("vatPercent", "KDV %", "number", false, false, null),
         new("lineTotal", "Satır toplamı", "number", false, true, null)],
        [new("Draft", "Taslak", false), new("Open", "Açık", false), new("PartiallyReceived", "Kısmen teslim alındı", false),
         new("Received", "Teslim alındı", true), new("Cancelled", "İptal", true), new("PendingApproval", "Onay bekliyor", false), new("Rejected", "Reddedildi", true)],
        [], "satinalma.siparis.belge", "satinalma.siparis.hesapla", "satinalma.siparis.doldur", new Dictionary<string, IReadOnlyList<string>>(),
        "satinalma.siparis.olustur", "");
}
