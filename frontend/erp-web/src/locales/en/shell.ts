/** English text for the application frame. Keys are exact Turkish source texts.
 * The sub-menu renders its module titles from [tr, en] tuples (shell/moduleMenus.ts); the other titles
 * ("Stok", "Depo", "Finans", "Özel", "Tanımlar" …) already have entries in earlier dictionaries. */
export const english: Record<string, string> = {
  'Modül menüsü': 'Module menu',
  'Duran Varlıklar': 'Fixed assets',
  'Dış Ticaret': 'Foreign trade',
  'Raporlar': 'Reports',
  // List kit (list-page/ListSummaryCards): a summary card that filters the list. 'Filtrele' is in locale.ts.
  'süzülüyor': 'filtering',
  // List selection (AdvancedDataGrid `selectable`, list-page/BulkActionBar). 'seçili' and 'Satırı seç' are in platform-a.
  'Tümünü seç': 'Select all',
  'Toplu işlemler': 'Bulk actions',
  'Seçimi temizle': 'Clear selection',
  // Record screen kit (record-form/RecordForm): header, section navigator, context panel, footer hints.
  'Kayıtlar arası gezinme': 'Record navigation',
  'Önceki kayıt': 'Previous record',
  'Sonraki kayıt': 'Next record',
  'Bağlam paneli': 'Context panel',
  'Eksik veya hatalı': 'Incomplete or invalid',
  'Kart doluluğu': 'Card completeness',
  'Bölümler arası:': 'Between sections:',
  'Önceki:': 'Previous:',
  'Tab sonraki alan': 'Tab next field',
  'Ctrl+S kaydet': 'Ctrl+S save',
  'Ctrl+Z geri al': 'Ctrl+Z undo',
  'PgUp/PgDn önceki/sonraki kayıt': 'PgUp/PgDn previous/next record',
  'Ctrl+. bağlam paneli': 'Ctrl+. context panel',
}

export const englishPatterns: Array<[RegExp, string]> = [
  [/^(\d+) alan değişti$/, '$1 fields changed'],
  [/^Kart doluluğu %(\d+)$/, 'Card completeness $1%'],
]
