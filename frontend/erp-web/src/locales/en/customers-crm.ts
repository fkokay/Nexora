/**
 * English labels for the Cari Hesaplar, Cari Hesap Hareketleri and CRM Fırsatları screens in the ERP design language
 * (mockup 08). Keys are exact Turkish source texts as rendered (trimmed, single-spaced).
 */
export const english: Record<string, string> = {
  // Cari Hesaplar list
  'Cari silinmez, pasife alınır': 'Accounts are not deleted; deactivate instead',
  'Satış işlemleri yalnız müşteri ve bayi kartlarında': 'Sales actions are only for customer and dealer cards',
  'Cari mutabakatı': 'Account reconciliation', Gruplar: 'Groups', 'Cari kartı': 'Account cards',
  'e-Fatura mükellefi': 'E-invoice taxpayers', 'Risk limiti tanımlı': 'Risk limit set', 'tüm kayıtlar': 'all records',
  'Özetini görmek için listeden bir cari seçin.': 'Select an account in the list to see its summary.',
  'Alış faturaları': 'Purchase invoices', 'Cari kayıtları': 'Account records',
  '↑↓ gez · Boşluk işaretle · Enter kartı aç · Çift tık aç · Ctrl+. detay paneli':
    '↑↓ move · Space tick · Enter open card · Double-click open · Ctrl+. detail panel',
  '— yeni sipariş, teklif, irsaliye, fatura ve pasife alma': '— new order, quote, delivery note, invoice and deactivation',
  'Borç bakiyesi': 'Debit balance', 'Alacak bakiyesi': 'Credit balance',
  'Kurumsal e-posta': 'Company e-mail', 'Yetkili telefon': 'Contact phone',
  // Cari Hesap Hareketleri (mockup 03)
  'Açılış bakiyesi': 'Opening balance', 'Kapanış bakiyesi': 'Closing balance',
  'ters kayıt dahil': 'reversals included', 'Son 3 ay': 'Last 3 months',
  'Yıl başından': 'Year to date', 'Hesap hareketleri': 'Account transactions', 'Devir — açılış bakiyesi': 'Brought forward — opening balance',
  'Belgeye git ›': 'Go to document ›', 'Elle girilen hareket; bağlı belge yok': 'Manual movement; no linked document', 'Bağlı belge açılamıyor.': 'The linked document cannot be opened.', 'Alış faturası taslağı': 'Purchase invoice draft',
  'Dönem toplamı': 'Period total', Açılış: 'Opening', Kapanış: 'Closing',
  'B borç bakiyesi · A alacak bakiyesi · Ters kayıt orijinal hareketin karşı kaydıdır, hareketler silinmez':
    'B debit balance · A credit balance · A reversal is the counter entry of the original transaction; transactions are never deleted',
  'Cari hesap hareketleri': 'Account transactions',
};
Object.assign(english, {
  // CRM Fırsatları (list type, record form v3)
  'Açık fırsat': 'Open opportunities', 'Açık fırsat değeri': 'Open opportunity value', 'Takibi geçmiş': 'Follow-up overdue',
  'Kapanmış fırsat düzenlenemez': 'A closed opportunity cannot be edited',
  'Şu an': 'Current', 'Aşama akışı': 'Stage flow',
  'Özetini görmek için listeden bir fırsat seçin.': 'Select an opportunity in the list to see its summary.',
  'Fırsat kayıtları': 'Opportunity records', 'Tahmin ve takip': 'Forecast and follow-up',
  'tahmini tutar × olasılık': 'estimated amount × probability', 'zorunlu alan': 'required field',
  'Kazanma olasılığı (%)': 'Win probability (%)',
  // Fix round 1
  'cari dövizi; farklı dövizli hareketler ayrıştırılmaz': 'account currency; movements in other currencies are not separated',
  'Farklı dövizli hareket var; toplamlar ve bakiye dövize göre ayrıştırılmaz':
    'There are movements in another currency; totals and balance are not separated by currency',
  'e-Fatura alıcı etiketi': 'E-invoice recipient alias', 'Harita konumu:': 'Map location:',
  'Yeni adres': 'New address', adres: 'addresses', 'Adres kaydedildi.': 'Address saved.',
  'Özel alan tanımları ve geçmiş': 'Custom field definitions and history',
} satisfies Record<string, string>);
/** Anchored patterns for Turkish text rendered with dynamic values. */
export const englishPatterns: Array<[RegExp, string]> = [
  [/^Aşamayı ilerlet: (.+)$/, 'Advance stage: $1'],
];
