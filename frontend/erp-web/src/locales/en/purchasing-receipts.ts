/** English labels for Satınalma İrsaliyeleri and Mal kabulleri (list, panel, document, delivery note create view). */
export const english: Record<string, string> = {
  'Mal kabulleri': 'Goods receipts',
  'Mal kabul eşleşti': 'Receipt matched',
  'Bağlantısı yok': 'Not linked',
  'Bu mal kabul': 'This goods receipt',
  'Mal kabul özeti': 'Goods receipt summary',
  'Tedarikçi irsaliyesi özeti': 'Supplier delivery note summary',
  'Özetini görmek için listeden bir mal kabul seçin.': 'Select a goods receipt in the list to see its summary.',
  'Bu sayfada ara: mal kabul, sipariş veya depo': 'Search this page: receipt, order or warehouse',
  'Bu sayfada aramanızla eşleşen mal kabul yok.': 'No goods receipt on this page matches your search.',
  'Kabul edilmiş belge silinemez — iptal sipariş belgesinden yapılır': 'An accepted document cannot be deleted — cancel it from the purchase order',
  'Mal kabul bulunamadı.': 'Goods receipt not found.',
  'Mal kabul bilgileri': 'Goods receipt information',
  'Mal kabul satırları': 'Goods receipt lines',
  'Kabul miktarı': 'Received quantity',
  'Yeni tedarikçi irsaliyesi': 'New supplier delivery note',
  'Önce bir sipariş seçin': 'Select an order first',
  "İrsaliye kaydı silinemez — mal kabul bağlantısı İşlemler › Siparişi aç'ta yönetilir":
    'A delivery note cannot be deleted — manage its receipt link under Actions › Open order',
  'Siparişsiz mal kabul': 'Goods receipt without an order',
  'Gelen irsaliyeler': 'Incoming delivery notes',
}

export const englishPatterns: Array<[RegExp, string]> = [
  [/^(.+?) mal kabul ayrıntılarını aç$/, 'Open goods receipt $1 details'],
]
