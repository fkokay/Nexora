/** English labels found missing by the authenticated English review of every workspace page.
 * Keys are exact Turkish source texts as rendered (trimmed, single-spaced). Tenant-owned values
 * (chart-of-accounts names, workflow, menu and record names, provinces) are intentionally absent. */
export const english: Record<string, string> = {
  // Column labels that also feed the grid's generated aria-labels.
  'Fatura': 'Invoice', 'Fatura no': 'Invoice no', 'Fatura kuru': 'Invoice rate', 'Kalan tutar': 'Remaining amount',
  'Hesap': 'Account', 'Stok': 'Stock item', 'Depo mevcudu': 'Warehouse on hand', 'Vade (gün)': 'Due (days)',
  'Bağlı firma sayısı': 'Linked companies', 'Sektör': 'Sector', 'Fatura tarihi *': 'Invoice date *',
  'Depo konumu': 'Warehouse location', 'Hedef depo': 'Target warehouse', 'Uygun hesap': 'Eligible account',
  'Aktif hesap': 'Asset account', 'Pasif hesap': 'Liability account',

  // Search boxes, filters and list landmarks.
  'Cari ara': 'Search accounts', 'Cari detay sekmeleri': 'Account detail tabs', 'Cari listesini yenile': 'Refresh account list',
  'Hesap durumu': 'Account status', 'Hesap filtreleri': 'Account filters', 'Fatura veya cari ara': 'Search invoices or accounts',
  'Kaynakta ara': 'Search sources', 'Stok maliyeti filtreleri': 'Stock cost filters', 'Depo stok bakiyeleri': 'Warehouse stock balances',
  'Stok ara': 'Search stock items', 'Stok filtreleri': 'Stock filters', 'Stok listesi': 'Stock item list',
  'Lot/seri kodu, stok veya depo ara': 'Search lot/serial code, stock item or warehouse', 'Depo ara': 'Search warehouses',
  'Depo filtreleri': 'Warehouse filters', 'Depo listesi': 'Warehouse list', 'Kampanya ara': 'Search campaigns',
  'Gelen irsaliyelerde ara': 'Search incoming delivery notes', 'Listelenen stok kalemi': 'Listed stock items',
  'ERP CORE · STOK': 'ERP CORE · STOCK', 'depo-kisayolu': 'warehouse-shortcut',
  // Default page and navigation titles (the customer page title can be renamed per tenant).
  'Cari Hesaplar': 'Customer accounts', 'Stok & Depo': 'Inventory & Warehousing',

  // Fragments rendered next to counts and values, e.g. `{count} hesap`.
  'hesap': 'accounts', 'fatura': 'invoices', 'toplam': 'total', 'stok kalemi': 'stock items', 'aktif depo': 'active warehouses',
  'stok · Sayfa': 'stock items · Page', 'Tutar (': 'Amount (', 'Eksik P&L eşlemesi:': 'Missing P&L mapping:',
  'Additive veya Withholding ·': 'Additive or Withholding ·', 'Sales, Purchase veya Both ·': 'Sales, Purchase or Both ·',
  'Türkiye · UCA': 'Turkey · UCA', 'Türkiye · Uniform Chart of Accounts': 'Turkey · Uniform Chart of Accounts',

  // Business events, report sources and screen-view surfaces from the platform catalogs.
  'Satın alma siparişi oluşturuldu': 'Purchase order created', 'Satın alma talebi gönderildi': 'Purchase request submitted',
  'Satış teklifi kabul edildi': 'Sales quote accepted', 'Satın alma siparişi karşılama durumu': 'Purchase order fulfillment status',
  'Tedarikçi hesap hareketleri': 'Supplier account transactions', 'Cari detay kartı': 'Account detail card', 'Cari listesi': 'Account list',
  'Depo konum bakiyeleri': 'Warehouse location balances', 'Lot/seri stok bakiyeleri': 'Lot/serial stock balances',
  'Satış faturası detay özeti': 'Sales invoice detail summary', 'Satış siparişi satırları': 'Sales order lines',
  'Cari bakiye sorgula': 'Look up account balance', 'Mal kabul alanları': 'Goods receipt fields',
  'Her mal kabul kaydı alan tanım sürümünü saklar.': 'Each goods receipt keeps the version of the field definitions it used.',
  'e-Fatura': 'e-Invoice', 'Temel e-Fatura': 'Basic e-Invoice', 'Ticari e-Fatura': 'Commercial e-Invoice',

  // Default chart-of-accounts labels used by the fixed-asset and payment pickers.
  'Alınan çek ve senetler portföyü': 'Received checks and notes portfolio', 'Verilen çek ve senet portföyü': 'Issued checks and notes portfolio',
  'Satıcı ticari borçları': 'Trade payables to suppliers', 'Ticari alacaklar – müşteriler': 'Trade receivables – customers',

  // Explanatory notes.
  'Taslak TMS 7 raporudur; firma hesap sınıflandırmaları ve mutabakatı tamamlanmadan finansal tablo olarak kullanılmamalıdır.':
    'This is a draft TAS 7 report; do not use it as a financial statement until the company account classifications and reconciliation are complete.',
  'Baz para birimi karşılığı, her tahmin ayının ilk gününde geçerli son tenant kuru ile yalnızca gösterim amacıyla hesaplanır; muhasebe değerlemesi değildir. Kur bulunmayan para birimlerinin baz para karşılığı boş kalır. Yalnız onaylı doğrudan nakit bütçeleri ayrı giriş/çıkış alanlarıyla dahil edilir; tahakkuk bütçeleri nakit olarak sayılmaz. Nakit bütçe satırları açık fatura veya portföy enstrümanı tahminleriyle çakışıyorsa çift sayımı önlemek için aynı planı bir kez kullanın. Gecikmiş fatura ve enstrüman kalemleri ilk tahmin ayına yerleştirilir.':
    'The base-currency equivalent is calculated for display only, using the latest tenant rate valid on the first day of each forecast month; it is not an accounting valuation. Currencies without a rate have no base-currency equivalent. Only approved direct cash budgets are included, with separate inflow/outflow fields; accrual budgets are not counted as cash. If cash budget lines overlap open invoice or portfolio instrument forecasts, use that plan only once to avoid double counting. Overdue invoice and instrument items are placed in the first forecast month.',
  'Planlanan enerji ve fire dahil malzeme maliyetleri emir anındaki anlık görüntülerden raporlanır. Fiili malzeme yalnızca doğrudan üretim emrine bağlı bileşen hareketlerinden hesaplanır; mamul giriş hareketi bileşen maliyetinden çıkarılır. Eski bağlantısız stok hareketlerinin hangi emre ait olduğu kanıtlanamadığından toplam fiili maliyet ve toplam maliyet farkı ayrıca doğrulanana kadar gösterilmez.':
    'Planned material costs, including energy and scrap, are reported from snapshots taken when the order was created. Actual material is calculated only from component movements linked directly to the production order; the finished-goods receipt movement is excluded from component cost. Because older unlinked stock movements cannot be proven to belong to an order, total actual cost and total cost variance are not shown until they are verified separately.',
  'Talep, karşılanan miktar ve aktif rezervasyonlardan hesaplanır. Kullanılabilir stok = depo mevcudu − aktif rezervasyon. Sonuç salt okunurdur; sipariş önceliği veya dağıtım tahsisi varsayılmaz.':
    'Calculated from demand, fulfilled quantity and active reservations. Available stock = warehouse on hand − active reservations. The result is read-only; no order priority or distribution allocation is assumed.',
}

const months: Record<string, string> = {
  Ocak: 'January', Şubat: 'February', Mart: 'March', Nisan: 'April', Mayıs: 'May', Haziran: 'June',
  Temmuz: 'July', Ağustos: 'August', Eylül: 'September', Ekim: 'October', Kasım: 'November', Aralık: 'December',
}
Object.assign(english, months)

/** Grid and editor aria-labels are composed in English around a Turkish column or menu label;
 * the label capture is translated when it is itself a dictionary entry. */
export const englishPatterns: Array<[RegExp, string]> = [
  [/^(.+) column width in pixels$/, '$1 column width in pixels'],
  [/^(.+) column width$/, '$1 column width'],
  [/^(.+) pin$/, '$1 pin'],
  [/^(.+) sütun genişliği piksel$/, '$1 column width in pixels'],
  [/^(.+) için işlemler$/, 'Actions for $1'],
  [/^Move (.+) up$/, 'Move $1 up'],
  [/^Move (.+) down$/, 'Move $1 down'],
  [/^Show (.+)$/, 'Show $1'],
  [/^Section for (.+)$/, 'Section for $1'],
  [/^Width for (.+)$/, 'Width for $1'],
  [/^Column label for (.+)$/, 'Column label for $1'],
  [/^Close (.+)$/, 'Close $1'],
  [/^Start workflow (.+)$/, 'Start workflow $1'],
  [/^(.+) menu name$/, '$1 menu name'],
  [/^Şu anda seçili: (.+)$/, 'Currently selected: $1'],
  [/^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) (\d{4})$/, '$1 $2'],
]
