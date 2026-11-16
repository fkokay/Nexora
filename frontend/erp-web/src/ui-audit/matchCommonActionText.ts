export type CommonActionCommand = 'new' | 'save' | 'delete' | 'print' | 'export' | 'refresh'

const commonActions: Array<[string, CommonActionCommand]> = [
  ['yeni', 'new'],
  ['kaydet', 'save'],
  ['sil', 'delete'],
  ['yazdır', 'print'],
  ['excel', 'export'],
  ['xlsx', 'export'],
  ['csv', 'export'],
  ['dışa aktar', 'export'],
  ['yenile', 'refresh'],
]

/** Whole-word match of a page-header button text against the shared action bar commands. */
export function matchCommonActionText(text: string): CommonActionCommand | null {
  const normalized = text.trim().toLocaleLowerCase('tr-TR')
  for (const [word, command] of commonActions) {
    if (normalized.startsWith(word) && !/^\p{L}/u.test(normalized.slice(word.length))) return command
  }
  return null
}
