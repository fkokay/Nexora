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
  'aramayla eşleşen': 'matching the search', aktif: 'active', 'e-Fatura': 'E-invoice', 'Limit kullanımı': 'Limit usage',
  'Özetini görmek için listeden bir cari seçin.': 'Select an account in the list to see its summary.',
  'Cari özeti': 'Account summary', 'Alış faturaları': 'Purchase invoices', 'Cari kayıtları': 'Account records',
  '↑↓ gez · Boşluk işaretle · Enter kartı aç · Çift tık aç · Ctrl+. detay paneli':
    '↑↓ move · Space tick · Enter open card · Double-click open · Ctrl+. detail panel',
  '— yeni sipariş, teklif, irsaliye, fatura ve pasife alma': '— new order, quote, delivery note, invoice and deactivation',
  'Borç bakiyesi': 'Debit balance', 'Alacak bakiyesi': 'Credit balance',
  'Kurumsal e-posta': 'Company e-mail', 'Yetkili kişi': 'Contact person', 'Yetkili telefon': 'Contact phone',
};

/** Anchored patterns for Turkish text rendered with dynamic values. */
export const englishPatterns: Array<[RegExp, string]> = [];
