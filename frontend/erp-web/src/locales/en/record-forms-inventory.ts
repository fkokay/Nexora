/** English labels added while moving the inventory record forms to the RecordForm layout. Keys are exact Turkish source texts as rendered. */
export const english: Record<string, string> = {
  // Shared command bar
  'Temizle': 'Clear',
  // Stock item card
  'Stok Kimliği': 'Stock identity', 'Genel ve Stok Yönetimi': 'General and stock control',
  'Fiyat ve Vergi': 'Pricing and tax', 'Lojistik ve Muhasebe': 'Logistics and accounting',
  'Birim ve Özel Alanlar': 'Units and custom fields', 'Varyantlar': 'Variants',
  'Üretim Reçeteleri': 'Production recipes', 'Tanımlama ve Takip': 'Identification and tracking',
  'Stok Seviyeleri': 'Stock levels', 'Temin Süreleri': 'Lead times', 'Liste Fiyatları': 'List prices',
  'Vergi Oranları': 'Tax rates', 'Varsayılan İndirimler': 'Default discounts',
  'Ağırlık ve Boyut': 'Weight and dimensions', 'Muhasebe Hesapları': 'Accounting accounts',
  'Görsel ve Pazaryeri': 'Image and marketplace', 'Birim Dönüşümleri': 'Unit conversions',
  'Stok Varyantları': 'Stock variants', 'Tanımlı Üretim Reçeteleri': 'Defined production recipes',
  'Zorunlu özel alanlar doldurulmadı.': 'Required custom fields are not filled in.',
  'Stok kartı oluşturuldu. Yeni kart girebilirsiniz.': 'Stock item created. You can enter a new one.',
  'Stok Özel Alan Değerleri': 'Stock custom field values',
  // Transfer
  'Transfer Bilgileri': 'Transfer details', 'Transfer Kalemleri': 'Transfer lines', 'Kalem:': 'Lines:',
  'Kaydetmek için hedef depo seçin ve en az bir kaleme miktar girin.':
    'To save, select a target warehouse and enter a quantity for at least one line.',
  // Warehouse
  'Depo Kimliği': 'Warehouse identity', 'Depo Özel Alanları': 'Warehouse custom fields',
  'Depo oluşturuldu. Yeni depo girebilirsiniz.': 'Warehouse created. You can enter a new one.',
  'Depo Özel Alan Değerleri': 'Warehouse custom field values',
  'Devre dışı depoda değerler kaydedilemez.': 'Values cannot be saved for an inactive warehouse.',
  // Stock movement
  'Stok Hareketi': 'Stock transaction', 'Açıklama ve Konum': 'Description and location',
  'Maliyet ve İzleme': 'Cost and tracking',
  // Warehouse locations
  'Konum Kimliği': 'Location identity', 'Yerleşim ve Durum': 'Placement and status',
  'Konum eklemek için önce depo seçin.': 'Select a warehouse first to add a location.',
}

export const englishPatterns: Array<[RegExp, string]> = [
]
