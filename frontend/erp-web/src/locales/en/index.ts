import * as dialogs from './dialogs'
import * as finance from './finance'
import * as hrAssets from './hr-assets'
import * as inventoryManufacturing from './inventory-manufacturing'
import * as pageReview from './page-review'
import * as platformA from './platform-a'
import * as platformB from './platform-b'
import * as purchasingCustomers from './purchasing-customers'
import * as sales from './sales'
import * as recordFormsSales from './record-forms-sales'
import * as recordFormsInventory from './record-forms-inventory'
import * as recordFormsManufacturing from './record-forms-manufacturing'
import * as recordFormsHrProjects from './record-forms-hr-projects'
import * as recordFormsFinance from './record-forms-finance'
import * as recordFormsPurchasing from './record-forms-purchasing'
import * as recordFormsPlatform from './record-forms-platform'

const groups = [platformA, platformB, sales, purchasingCustomers, inventoryManufacturing, finance, hrAssets, dialogs, pageReview, recordFormsSales, recordFormsInventory, recordFormsManufacturing, recordFormsHrProjects, recordFormsFinance, recordFormsPurchasing, recordFormsPlatform]


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
