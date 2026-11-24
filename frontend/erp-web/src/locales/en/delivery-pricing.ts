/** English labels for delivery-note line prices and free-of-charge lines (taslak 20). Keys are the exact Turkish texts. */
export const english: Record<string, string> = {
  'Bedelsiz': 'Free of charge', 'Kısmen bedelsiz': 'Partly free of charge', 'Fiyatsız': 'Unpriced', 'Kısmen fiyatsız': 'Partly unpriced', 'Fiyat durumu': 'Pricing',
  'Tümünü bedelsiz yap': 'Mark all free of charge', 'Bedelsizi kaldır': 'Clear free of charge', 'Fiyatları siparişten yenile': 'Refresh prices from the order',
  'İsk. %': 'Disc. %', 'KDV dahil': 'Incl. VAT', '— fiyatsız': '— unpriced', 'faturada': 'on invoice', 'Fiyatlı satırlar': 'Priced lines',
  'Genel toplam (fiyatlı)': 'Grand total (priced)', 'Bedelsiz satır': 'Free-of-charge lines', 'tutarı faturada girilir': 'amount entered on the invoice',
  'İrsaliye fiyat toplamları': 'Delivery note price totals', 'Mal kabul fiyat toplamları': 'Goods receipt price totals',
  'irsaliyeden': 'from delivery note', 'siparişten': 'from order', 'tutar girin': 'enter amount', 'Stok maliyeti': 'Stock cost',
  'fatura gelince': 'when invoiced', 'faturadan': 'from invoice', 'Bedelsiz/fiyatsız satırların tutarını girin.': 'Enter the amounts of the free-of-charge / unpriced lines.',
  'Bedelsiz işaretlenen satırın fiyat, iskonto ve KDV hücreleri kilitlenir ve boşalır; işaret kaldırılınca fiyat yeniden önerilir. Miktar, stok ve maliyet kaydı bedelsiz satırda da aynen yapılır.':
    'A line marked free of charge has its price, discount and VAT cells cleared and locked; clearing the mark suggests the price again. Quantity, stock and cost postings are made for free lines too.',
  'Bedelsiz işaretlenen satırın fiyat, iskonto ve KDV hücreleri kilitlenir ve boşalır; işaret kaldırılınca fiyat yeniden önerilir.':
    'A line marked free of charge has its price, discount and VAT cells cleared and locked; clearing the mark suggests the price again.',
  'Fiyatlı satırın stok maliyeti irsaliye fiyatından (iskonto ve kur uygulanmış) yazılır. Bedelsiz satırın stok maliyeti alış faturası girilince faturadaki tutardan tamamlanır.':
    'A priced line is costed from its delivery note price (after discount and exchange rate). A free line is costed from the purchase invoice amount once the invoice is entered.',
  'Fiyatlı satırın stok maliyeti fiyattan (iskonto ve kur uygulanmış) yazılır. Bedelsiz satırın stok maliyeti alış faturası girilince faturadaki tutardan tamamlanır.':
    'A priced line is costed from its price (after discount and exchange rate). A free line is costed from the purchase invoice amount once the invoice is entered.',
  'Bedelsiz kesilen satırların tutarını girin. Fiyatlı satırlar irsaliye fiyatıyla gelir; burada değiştirilebilir (irsaliye değişmez). Bedelsiz satır 0 olarak da faturalanabilir; fatura toplamı sıfırdan büyük olmalı.':
    'Enter the amounts of the free-of-charge lines. Priced lines come with the delivery note price and can be changed here (the delivery note does not change). A free line can be invoiced at 0; the invoice total must be greater than zero.',
  // System-page standard texts (sales-deliveries / purchase receipts / invoice entry / invoice drafts).
  'Siparişten irsaliye': 'Delivery note from order', 'Satış irsaliyesini eski ekranda aç': 'Open the sales delivery note in the classic screen',
  'Eski ekranda aç (satış irsaliyesi)': 'Open in the classic screen (sales delivery note)', 'Fiyatlı': 'Priced', 'Fiyat': 'Pricing',
  'Tutar girin': 'Enter amount', 'Fatura bekliyor (geçici maliyet)': 'Awaiting invoice (provisional cost)', 'Fatura fiyatları': 'Invoice prices',
  'Yeni satınalma faturası taslağı': 'New purchase invoice draft', 'Siparişe bağlı olmayan irsaliye': 'Delivery note not tied to an order',
  'İrsaliye fiyatları kullanılır; burada değiştirilebilir (irsaliye değişmez).': 'Delivery note prices are used; they can be changed here (the delivery note does not change).',
  'Fiyatlı satırlar irsaliye fiyatıyla gelir. Zorunlu fatura özel alanlarını tamamlayın.': 'Priced lines come with the delivery note price. Complete the required invoice custom fields.',
  'Birim fiyatı girin veya satırı bedelsiz işaretleyin; fatura geldiğinde maliyet farkı işlenir.': 'Enter the unit price or mark the line free of charge; the cost difference is posted when the invoice arrives.',
}

export const englishPatterns: Array<[RegExp, string]> = [
  [/^siparişte (.+?) · değiştirildi$/, 'order price $1 · changed'],
  [/^siparişte (.+)$/, 'order price $1'],
  [/^liste fiyatı (.+?) · öner$/, 'list price $1 · suggest'],
  [/^liste fiyatı (.+?) · değiştirildi$/, 'list price $1 · changed'],
  [/^liste fiyatı (.+)$/, 'list price $1'],
  [/^(\d+) satırın tutarı eksik$/, '$1 lines missing an amount'],
  [/^Bedelsiz satır: (\d+) · tutarı faturada girilir\.$/, 'Free-of-charge lines: $1 · amount entered on the invoice.'],
  [/^Fiyatsız satır: (\d+) · tutarı faturada girilir\.$/, 'Unpriced lines: $1 · amount entered on the invoice.'],
  [/^ · (\d+) fiyatsız satır$/, ' · $1 unpriced lines'],
]
