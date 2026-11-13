/** English labels added while moving the manufacturing record forms to the RecordForm layout. Keys are exact Turkish source texts as rendered. */
export const english: Record<string, string> = {
  'Ürün Reçetesi Tanımlama': 'Define Bill of Materials',
  'Ürün Reçetesini Düzenle': 'Edit Bill of Materials',
  'Reçeteyi Kaydet': 'Save Bill of Materials',
  'Reçete Kimliği': 'Bill of Materials Identity',
  'Operasyon Rotası': 'Operation Routing',
  'Bileşen:': 'Components:',
  'Operasyon:': 'Operations:',
  'Stok kartı bulunmadığı için reçete kaydedilemez.': 'The bill of materials cannot be saved because there are no stock cards.',
  'Firma kapsamı · Reçeteler': 'Company scope · Bills of materials',
  'Üretim Emri Planlama': 'Plan Production Order',
  'Emir Planla': 'Plan Order',
  'Emir Kimliği': 'Order Identity',
  'Üretim Kaynağı': 'Production Source',
  'Planlama': 'Planning',
  'Emir planlamak için en az bir reçete ve üretim deposu gerekir.': 'Planning an order requires at least one bill of materials and one production warehouse.',
  'İş Merkezi Tanımlama': 'Define Work Center',
  'İş Merkezini Kaydet': 'Save Work Center',
  'İş Merkezi Kimliği': 'Work Center Identity',
  'Saatlik Maliyetler': 'Hourly Costs',
  'Tanım kaydedildikten sonra iş merkezleri listesinde görünür.': 'Once saved, the definition appears in the work center list.',
  'Bildir ve Tamamla': 'Report and Complete',
  'Üretim Miktarları': 'Production Quantities',
  'Lot / Seri İzleme': 'Lot / Serial Tracking',
  'Planlanan:': 'Planned:',
  'Bildirilen:': 'Reported:',
}

export const englishPatterns: Array<[RegExp, string]> = [
  [/^Üretimi bildir · (.+)$/, 'Report production · $1'],
]
