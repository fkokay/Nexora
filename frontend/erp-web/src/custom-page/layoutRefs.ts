/** Yerleşim bileşenlerinin (formCard, facetPanel…) girişlere ve alan listelerine başvuru yardımcıları. */

type LayoutComponent = { id: string; type: string; props?: Record<string, unknown> };

/** Metin dizisinden tekil, boş olmayan, en fazla `max` kimlik (sıra korunur). */
export function idList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** `formCard` ve `facetPanel`'in `inputs` dizilerinde adı geçen giriş kimlikleri: bunlar üst düzeyde ayrıca çizilmez. */
export function ownedInputIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "formCard" && component.type !== "facetPanel") continue;
    for (const id of idList(component.props?.inputs)) owned.add(id);
  }
  return owned;
}

/** Sunucu sayfalı (`paging: "server"`) veri listelerinin `searchInput` girişleri: liste başlığında çizilir, üst düzeyde çizilmez. */
export function tableSearchInputIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "dataTable" || component.props?.paging !== "server") continue;
    const id = component.props?.searchInput;
    if (typeof id === "string" && id.trim()) owned.add(id.trim());
  }
  return owned;
}

const MAX_TABS = 8;
const MAX_TAB_IDS = 20;

/** `tabs` özelliğinin "Etiket=kimlik,kimlik" öğeleri; bozuk (dizgi olmayan, ayraçsız, etiketsiz) öğeler atlanır. En fazla 8 sekme, sekme başına 20 kimlik. */
export function parseTabs(value: unknown): { label: string; ids: string[] }[] {
  if (!Array.isArray(value)) return [];
  const tabs: { label: string; ids: string[] }[] = [];
  for (const item of value) {
    if (tabs.length >= MAX_TABS) break;
    if (typeof item !== "string") continue;
    const index = item.indexOf("=");
    if (index < 0) continue;
    const label = item.slice(0, index).trim();
    if (!label) continue;
    const ids = idList(item.slice(index + 1).split(","), MAX_TAB_IDS);
    tabs.push({ label, ids });
  }
  return tabs;
}

/** Sayfadaki tüm `tabs` bileşenlerinin sahiplendiği bileşen kimlikleri: bunlar üst düzeyde ayrıca çizilmez. */
export function tabOwnedIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "tabs") continue;
    for (const tab of parseTabs(component.props?.tabs)) for (const id of tab.ids) owned.add(id);
  }
  return owned;
}

/** "sütun=Etiket" girdileri; bozuk (ayraçsız veya boş kısımlı) girdiler atlanır. */
export function parseFieldList(value: unknown): { code: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  const fields: { code: string; label: string }[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const index = item.indexOf("=");
    if (index < 0) continue;
    const code = item.slice(0, index).trim();
    const label = item.slice(index + 1).trim();
    if (code && label) fields.push({ code, label });
  }
  return fields;
}
