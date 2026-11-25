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

/**
 * Veri listelerinin "Detay paneli" düğmesine bağlı onay kutusu girişleri (`dataTable.detailToggleInput`): düğme listenin araç
 * çubuğunda çizilir ve girişin değerini okur/yazar; giriş üst düzeyde ayrıca çizilmez.
 */
export function tableDetailToggleIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "dataTable") continue;
    // Düğme yalnız sorguya bağlı tam ızgarada çizilir (dar `bars`/`list` görünümlerinde araç çubuğu yoktur).
    const props = component.props;
    if (typeof props?.query !== "string" || props.variant === "bars" || props.variant === "list") continue;
    const id = props.detailToggleInput;
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

/** Pencerelerin (`dialog.contains`, en fazla 20) sahiplendiği bileşen kimlikleri: yalnız pencere açıkken pencerede çizilir. */
export function dialogOwnedIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "dialog") continue;
    for (const id of idList(component.props?.contains, 20)) owned.add(id);
  }
  return owned;
}

/**
 * Veri listelerinin satır işlemi düğmeleri (`dataTable.rowActions`, en fazla 6; her satırın İşlemler hücresinde çizilir) ve
 * "Satır açılınca" düğmesi (`dataTable.rowOpenAction`; satıra çift tıklama / Enter çalıştırır): ikisi de listeye aittir,
 * üst düzeyde ayrıca çizilmez.
 */
export function rowActionIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "dataTable") continue;
    for (const id of idList(component.props?.rowActions, 6)) owned.add(id);
    const open = component.props?.rowOpenAction;
    if (typeof open === "string" && open.trim()) owned.add(open.trim());
  }
  return owned;
}

/** Kayıt özetlerinin düğmeleri (`recordHeader.buttons`, en fazla 3): özetin sağında çizilir, üst düzeyde ayrıca çizilmez. */
export function headerButtonIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "recordHeader") continue;
    for (const id of idList(component.props?.buttons, 3)) owned.add(id);
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
