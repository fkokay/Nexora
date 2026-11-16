/** English text for the application frame. Keys are exact Turkish source texts.
 * The sub-menu renders its module titles from [tr, en] tuples (shell/moduleMenus.ts); the other titles
 * ("Stok", "Depo", "Finans", "Özel", "Tanımlar" …) already have entries in earlier dictionaries. */
export const english: Record<string, string> = {
  'Modül menüsü': 'Module menu',
  'Duran Varlıklar': 'Fixed assets',
  'Dış Ticaret': 'Foreign trade',
  'Raporlar': 'Reports',
}

export const englishPatterns: Array<[RegExp, string]> = []
