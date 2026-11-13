/** English labels added while moving the finance record forms to the RecordForm layout. Keys are exact Turkish source texts as rendered. */
export const english: Record<string, string> = {
  // Shared group titles
  'Tarihler': 'Dates',
  'Not': 'Note',
  'Tutarlar': 'Amounts',
  'Taraflar': 'Parties',
  'Vade': 'Term',
  // Payment instruments
  'Çek / Senet Kimliği': 'Check / note identity',
  'Banka ve Tutar': 'Bank and amount',
  // Exchange rates
  'Kur Bilgileri': 'Rate details',
  // Budgets
  'Bütçe Kimliği': 'Budget identity',
  'Plan Kimliği': 'Plan identity',
  'Kaydetmek için en az bir bütçe satırı ekleyin.': 'Add at least one budget line to save.',
  // Credit facilities
  'Kredi Kimliği': 'Facility identity',
  'Limit ve Faiz': 'Limit and interest',
  'Taksit Kimliği': 'Instalment identity',
  'Hareket Kimliği': 'Movement identity',
  'Teminat kaydı': 'Security record',
  'Teminat Kimliği': 'Security identity',
  'Tutar ve Vade': 'Amount and term',
  // Manual journal
  'Fiş Kimliği': 'Voucher identity',
  'Fiş Satırları': 'Voucher lines',
  'Borç:': 'Debit:',
  'Alacak:': 'Credit:',
  'Aktif hesap yok; fiş kaydedilemez.': 'No active account; the voucher cannot be saved.',
  'Fiş kaydedildikten sonra değiştirilemez.': 'A voucher cannot be changed after it is saved.',
  // Cash and bank accounts
  'Kasa Kimliği': 'Cash account identity',
  'Banka Kimliği': 'Bank account identity',
  'Ekstre Kimliği': 'Statement identity',
  'Dönem ve Bakiyeler': 'Period and balances',
  'Hareket Bilgileri': 'Movement details',
  'Transfer Bilgileri': 'Transfer details',
  // Ledger accounts
  'Hesap Kimliği': 'Account identity',
  // Accounting rule profiles
  'Mevzuat profili': 'Regulation profile',
  'Profil Kimliği': 'Profile identity',
  'Parametreler ve Kaynak': 'Parameters and source',
  'Mevzuat profili bölümleri': 'Regulation profile sections',
  'Varsayılan belge mevzuatı': 'Default document regulation',
}

export const englishPatterns: Array<[RegExp, string]> = [
  [/^(\d+) vergi kuralı$/, '$1 tax rules'],
]
