namespace AIERP.Api.DocumentModels;

internal static class PurchaseInvoiceDocumentModel
{
    internal const string Code = DocumentActivityLog.PurchaseInvoice;
    internal static readonly DocumentModelView Model = new(Code, "Satınalma faturası",
        [new("invoiceNumber", "Tedarikçi fatura no", "text", true, null), new("supplierId", "Tedarikçi", "lookup", true, "satinalma.faturaTaslagi.tedarikciler"),
         new("invoiceDate", "Fatura tarihi", "date", true, null), new("dueDate", "Vade", "date", false, null),
         new("currencyCode", "Para birimi", "text", true, null), new("notes", "Notlar", "text", false, null),
         new("receiptCode", "Kaynak mal kabul", "text", false, null, ReadOnly: true),
         ],
        [new("description", "Açıklama", "text", true, false, null), new("quantity", "Miktar", "number", true, false, null),
         new("unitCode", "Birim", "text", false, false, null), new("unitPrice", "Birim fiyat", "number", true, false, null),
         new("expenseAccountId", "Gider hesabı", "lookup", true, false, "satinalma.faturaTaslagi.giderHesaplari"), new("vatRate", "KDV %", "number", false, false, null),
         new("total", "Satır toplamı", "number", false, true, null)],
        [new("Draft", "Taslak", false), new("Posted", "Muhasebeleşti", false), new("Voided", "İptal", true)],
        [new("muhasebelestir", "Muhasebeleştir", ["Draft"], "Posted", "satinalma.faturaTaslagi.muhasebelestir", false),
         new("iptal", "İptal et", ["Posted"], "Voided", "satinalma.fatura.iptal", false)],
        "satinalma.fatura.belge", "satinalma.fatura.hesapla", "satinalma.fatura.doldur", new Dictionary<string, IReadOnlyList<string>>(),
        "satinalma.faturaTaslagi.olustur", "satinalma.faturaTaslagi.guncelle");
}
