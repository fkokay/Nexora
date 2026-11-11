import * as dialogs from './dialogs'
import * as finance from './finance'
import * as hrAssets from './hr-assets'
import * as inventoryManufacturing from './inventory-manufacturing'
import * as platformA from './platform-a'
import * as platformB from './platform-b'
import * as purchasingCustomers from './purchasing-customers'
import * as sales from './sales'

const groups = [platformA, platformB, sales, purchasingCustomers, inventoryManufacturing, finance, hrAssets, dialogs]


/** Module dictionaries; the first group that defines a key wins. */
export const supplementalEnglish: Record<string, string> = {}
for (const group of groups) {
  for (const [source, english] of Object.entries(group.english)) {
    if (!(source in supplementalEnglish)) supplementalEnglish[source] = english
  }
}

/** Literal characters a pattern requires; a pattern with more fixed text is more specific. */
function literalLength(pattern: RegExp): number {
  // Drop every unescaped (non-nested) group, including alternations and character-class captures.
  return pattern.source.replace(/(?<!\\)\((?:[^()\\]|\\.)*\)/g, '').replace(/\\(.)/g, '$1').replace(/[\^$]/g, '').length
}

/** Most specific patterns first, so a generic `^Sipariş (.+?)$` from one module cannot
 * shadow a longer pattern from another. The sort is stable within equal specificity. */
export const supplementalEnglishPatterns: Array<[RegExp, string]> = groups
  .flatMap((group) => group.englishPatterns)
  .map((entry, index) => ({ entry, index, weight: literalLength(entry[0]) }))
  .sort((a, b) => b.weight - a.weight || a.index - b.index)
  .map(({ entry }) => entry)
