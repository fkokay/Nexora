/** English labels added while moving the sales record forms to the RecordForm layout. Keys are exact Turkish source texts as rendered. */
export const english: Record<string, string> = {
  // Shared group titles and status texts
  "Toplamlar": "Totals",
  "Satır:": "Lines:",
  "Kalem:": "Items:",
  "Döviz kurları yükleniyor…": "Loading exchange rates…",
  // Sales order
  "Sipariş Düzenleme": "Edit Order",
  "Sipariş Kimliği": "Order Identity",
  "Sipariş Satırları": "Order Lines",
  "Sipariş Özel Alanları": "Order Custom Fields",
  "Kuru bulunmayan satır var; sipariş kaydedilemez.": "A line has no exchange rate; the order cannot be saved.",
  // Sales quote
  "Teklif Kimliği": "Quote Identity",
  "Teklif Satırları": "Quote Lines",
  "Koşullar ve Açıklama": "Terms and Description",
  "Teklif Özel Alanları": "Quote Custom Fields",
  "Kuru bulunmayan satır var; teklif kaydedilemez.": "A line has no exchange rate; the quote cannot be saved.",
  // Sales invoice
  "Fatura Kimliği": "Invoice Identity",
  "Fatura Satırları": "Invoice Lines",
  "Fatura Özel Alanları": "Invoice Custom Fields",
  "Fatura bilgileri": "Invoice details",
  "E-belge Bilgileri": "E-document Details",
  "E-belge ve E-ticaret Bilgileri": "E-document and E-commerce Details",
  "Vergi Mevzuatı Profili": "Tax Legislation Profile",
  "Her satırın stok çıkışı seçilen depodan yapılır.": "Each line's stock issue is made from the selected warehouse.",
  "Kaydetmek için müşteri ile her satırın stok ve deposunu seçin.": "To save, choose the customer and each line's stock item and warehouse.",
  "Fatura toplamı": "Invoice total",
  // Deliveries and receipts
  "Satış irsaliyesi": "Sales delivery note",
  "Sevk Bilgileri": "Shipment Details",
  "Teslim Edilecek Kalemler": "Items to Deliver",
  "İrsaliye Kimliği": "Delivery Note Identity",
  "İrsaliye Satırları": "Delivery Note Lines",
  "Mal kabul": "Goods receipt",
  "Mal Kabul Kimliği": "Goods Receipt Identity",
  "Mal Kabul Satırları": "Goods Receipt Lines",
  "Mal Kabul Özel Alanları": "Goods Receipt Custom Fields",
  "Kabul Edilen Kalemler": "Received Items",
  "Kaydetmek için en az bir kalemde miktar girin.": "To save, enter a quantity for at least one item.",
  "Lot / seri takipli stoklarda takip kodu zorunludur.": "A tracking code is required for lot / serial tracked stock items.",
  // Purchasing
  "Teslimat": "Delivery",
  "Sipariş Notu": "Order Note",
  "Her satır için stok, miktar, birim ve fiyat girin.": "Enter the stock item, quantity, unit and price for each line.",
  "Talep Kimliği": "Request Identity",
  "Talep Özel Alanları": "Request Custom Fields",
  "İstenen Stok Kalemleri": "Requested Stock Items",
  "Alış Faturası": "Purchase Invoice",
  // Campaigns
  "Kampanya Kimliği": "Campaign Identity",
  "İndirim ve Geçerlilik": "Discount and Validity",
  // CRM opportunities
  "Fırsat Kimliği": "Opportunity Identity",
  "Tutar ve Olasılık": "Amount and Probability",
  "Takip": "Follow-up",
  "Hazır olasılık değerleri": "Probability presets",
  "Ya da 0–99 arası değer yazın": "Or type a value between 0 and 99",
  "Ağırlıklı değer": "Weighted value",
  "Tahmini tutar × kazanma olasılığı": "Estimated amount × win probability",
  // Commercial contracts
  "Sözleşme Kimliği": "Contract Identity",
  "Cari Hesap": "Account",
  "Kaynak Belge": "Source Document",
  "Geçerlilik": "Validity",
  "Sözleşme taslak olarak oluşturulur.": "The contract is created as a draft.",
  "Kaydetmek için cari hesap seçin.": "Choose an account to save.",
  "Kaydetmek için kaynak belge seçin veya bağlantıyı kaldırın.": "Choose a source document or remove the link to save.",
}

export const englishPatterns: Array<[RegExp, string]> = [
  [/^Müşteri: (.+)$/, "Customer: $1"],
  [/^Müşteri listesi yüklenemedi: (.+)$/, "Customer list could not be loaded: $1"],
]
