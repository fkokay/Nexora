// erp-web/src/custom-page/layoutRefs.ts (ve chipText: LayoutComponents.tsx) ile aynıdır; biri değişirse diğeri de güncellenmelidir.
import { formatCell } from "./cellFormat";

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

/** Sekme girdisi "Etiket=kimlik,kimlik" (sunucudaki kural); kimlik listesi boş olabilir. */
const TAB_ENTRY = /^[^=,]{1,40}=([A-Za-z0-9_-]{1,64}(,[A-Za-z0-9_-]{1,64}){0,19})?$/;
export const MAX_TABS = 8;
export const MAX_TAB_IDS = 20;

/** `tabs` özelliğinin sekmeleri: bozuk girdiler atlanır; en çok 8 sekme, sekme başına en çok 20 tekil kimlik. */
export function parseTabs(value: unknown): { label: string; ids: string[] }[] {
  if (!Array.isArray(value)) return [];
  const tabs: { label: string; ids: string[] }[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !TAB_ENTRY.test(item)) continue;
    const index = item.indexOf("=");
    const rest = item.slice(index + 1);
    tabs.push({ label: item.slice(0, index), ids: idList(rest ? rest.split(",") : [], MAX_TAB_IDS) });
    if (tabs.length >= MAX_TABS) break;
  }
  return tabs;
}

/** Sekmeler bileşenlerinin sahiplendiği bileşen kimlikleri: bunlar üst düzeyde ayrıca çizilmez, sekmenin içinde çizilir. */
export function tabOwnedIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "tabs") continue;
    for (const tab of parseTabs(component.props?.tabs)) for (const id of tab.ids) owned.add(id);
  }
  return owned;
}

export const MAX_DIALOG_IDS = 20;
export const MAX_ROW_ACTIONS = 4;

/** Pencerelerin (`dialog`) `contains` dizisindeki bileşen kimlikleri: üst düzeyde çizilmez, pencere açıkken içinde çizilir. */
export function dialogOwnedIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "dialog") continue;
    for (const id of idList(component.props?.contains, MAX_DIALOG_IDS)) owned.add(id);
  }
  return owned;
}

/** Veri listelerinin `rowActions` düğmeleri: üst düzeyde çizilmez, listenin "İşlemler" sütununda satır başına çizilir. */
export function rowActionIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "dataTable") continue;
    for (const id of idList(component.props?.rowActions, MAX_ROW_ACTIONS)) owned.add(id);
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

/**
 * Yalnız Studio: bir Sekmeler ya da Pencere bileşeninin sahiplenebileceği üst düzey bileşenler (sunucudaki sekme/pencere
 * kuralı). Kendisi, İşlem Çubuğu, form kartı/yan filtre paneli girişleri, liste arama girişleri ve satır işlemi düğmeleri
 * hiç aday olmaz; sekmeler Sekmeler ya da Pencere, pencere başka Pencere sahiplenemez (pencere Sekmeler içerebilir).
 * Başka bir sahibin aldığı bileşenler adaydır; seçicide soluk gösterilir.
 */
export function ownableCandidates<C extends LayoutComponent>(components: C[], owner: { id: string; type: "tabs" | "dialog" }): C[] {
  const layoutOwned = ownedInputIds(components);
  const rowActions = rowActionIds(components);
  // Kayıt özetinin düğmeleri de satır işlemleri gibi özete aittir.
  for (const id of headerButtonIds(components)) rowActions.add(id);
  // Listenin "Satır açılınca" düğmesi de listeye aittir.
  for (const component of components) if (component.type === "dataTable" && typeof component.props?.rowOpenAction === "string") rowActions.add(component.props.rowOpenAction);
  const searchInputs = new Set(components.filter((component) => component.type === "dataTable" && typeof component.props?.searchInput === "string")
    .map((component) => String(component.props?.searchInput)));
  return components.filter((component) => component.id !== owner.id && component.type !== "actionBar" && component.type !== "dialog"
    && !(owner.type === "tabs" && component.type === "tabs")
    && !(component.type === "input" && (layoutOwned.has(component.id) || searchInputs.has(component.id)))
    && !rowActions.has(component.id));
}

// ---------------------------------------------------------------------------------------------------------------------
// Yalnız Studio: tuvalde sekmeleri kap olarak düzenleme yardımcıları. Kayıt biçimi değişmez: `tabs` özelliği
// "Etiket=kimlik,kimlik" girdileridir; bu yardımcılar yalnız o diziyi (ve `defaultTab`ı) yeniden yazar.
// ---------------------------------------------------------------------------------------------------------------------

export type TabEntry = { label: string; ids: string[] };
export const MAX_TAB_LABEL = 40;

/** Sekme listesinin kayıt biçimi: "Etiket=kimlik,kimlik". */
export const tabsValue = (tabs: TabEntry[]) => tabs.map((tab) => `${tab.label}=${tab.ids.join(",")}`);

/** Bileşenin sekmedeki yeri: ilk sahiplenen Sekmeler bileşeni (uzlaştırmadaki sırayla aynı). */
export function tabLocation(components: LayoutComponent[], id: string): { tabsId: string; tabIndex: number; position: number } | null {
  for (const component of components) {
    if (component.type !== "tabs") continue;
    const tabs = parseTabs(component.props?.tabs);
    for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
      const position = tabs[tabIndex].ids.indexOf(id);
      if (position >= 0) return { tabsId: component.id, tabIndex, position };
    }
  }
  return null;
}

/** Sekmeye alınamayan türler (sunucudaki sekme kuralı): Sekmeler, İşlem Çubuğu ve Pencere. */
export const TAB_FORBIDDEN_TYPES = ["tabs", "actionBar", "dialog"];

/**
 * Bir bileşen (var olan: `id` ile; paletten yeni: yalnız `type` ile) verilen sekmeye bırakılabilir mi? Uygunsa `null`,
 * değilse kullanıcıya gösterilecek neden. Kurallar `ownableCandidates` ve uzlaştırmadakiyle aynıdır.
 */
export function tabPlacementProblem(components: LayoutComponent[], tabsId: string, tabIndex: number, moving: { id?: string; type: string }): string | null {
  const owner = components.find((component) => component.id === tabsId && component.type === "tabs");
  if (!owner) return "Sekmeler bileşeni bulunamadı.";
  const tabs = parseTabs(owner.props?.tabs);
  if (!Number.isInteger(tabIndex) || tabIndex < 0 || tabIndex >= tabs.length) return "Sekme bulunamadı.";
  if (TAB_FORBIDDEN_TYPES.includes(moving.type)) return "Sekmeler, İşlem Çubuğu ve Pencere bir sekmeye konamaz.";
  if (moving.id !== undefined) {
    if (moving.id === tabsId) return "Sekmeler kendi içine konamaz.";
    if (!ownableCandidates(components, { id: tabsId, type: "tabs" }).some((component) => component.id === moving.id)) {
      return "Bu bileşen sekmeye alınamaz (form kartı, yan filtre paneli, liste araması ya da satır işlemine bağlı).";
    }
  }
  const ids = tabs[tabIndex].ids;
  if (ids.length >= MAX_TAB_IDS && !(moving.id !== undefined && ids.includes(moving.id))) return `Bir sekmede en fazla ${MAX_TAB_IDS} bileşen olabilir.`;
  return null;
}

/** Kimliği bütün Sekmeler bileşenlerinden çıkarır (bileşen sayfadaki kendi yerine döner). Değişmeyen bileşenler aynı kalır. */
export function removeFromTabs<C extends LayoutComponent>(components: C[], id: string): C[] {
  let changed = false;
  const next = components.map((component) => {
    if (component.type !== "tabs") return component;
    const tabs = parseTabs(component.props?.tabs);
    if (!tabs.some((tab) => tab.ids.includes(id))) return component;
    changed = true;
    return { ...component, props: { ...component.props, tabs: tabsValue(tabs.map((tab) => ({ ...tab, ids: tab.ids.filter((item) => item !== id) }))) } } as C;
  });
  return changed ? next : components;
}

/**
 * Var olan bileşeni sekmenin `position` sırasına yerleştirir: önce bütün sekmelerden çıkarılır (bir bileşen tek sekmede
 * olur), sonra hedef sekmeye eklenir. Aynı sekmede ileri taşımada çıkarılan yer hesaba katılır. Kural ihlalinde `null`.
 */
export function placeInTab<C extends LayoutComponent>(components: C[], tabsId: string, tabIndex: number, id: string, position: number): C[] | null {
  const moving = components.find((component) => component.id === id);
  if (!moving || tabPlacementProblem(components, tabsId, tabIndex, { id, type: moving.type })) return null;
  const from = tabLocation(components, id);
  let at = Math.max(0, Math.floor(Number.isFinite(position) ? position : Number.MAX_SAFE_INTEGER));
  if (from && from.tabsId === tabsId && from.tabIndex === tabIndex && from.position < at) at -= 1;
  const next = removeFromTabs(components, id).map((component) => {
    if (component.id !== tabsId) return component;
    const tabs = parseTabs(component.props?.tabs).map((tab, index) => {
      if (index !== tabIndex) return tab;
      const ids = [...tab.ids];
      ids.splice(Math.min(at, ids.length), 0, id);
      return { ...tab, ids };
    });
    return { ...component, props: { ...component.props, tabs: tabsValue(tabs) } } as C;
  });
  // Aynı yere bırakmak değişiklik sayılmaz (geri alma yığınına boş adım düşmesin).
  const unchanged = next.every((component, index) => component === components[index] || sameStrings(component.props?.tabs, components[index].props?.tabs));
  return unchanged ? components : next;
}

/** Sekmedeki bileşeni kendi sekmesinde bir öne (-1) ya da bir sonraya (+1) taşır; sekmede değilse ya da uçtaysa `null`. */
export function moveWithinTab<C extends LayoutComponent>(components: C[], id: string, delta: -1 | 1): C[] | null {
  const from = tabLocation(components, id);
  if (!from) return null;
  const owner = components.find((component) => component.id === from.tabsId);
  const tabs = parseTabs(owner?.props?.tabs);
  const ids = [...tabs[from.tabIndex].ids];
  const target = from.position + delta;
  if (target < 0 || target >= ids.length) return null;
  [ids[from.position], ids[target]] = [ids[target], ids[from.position]];
  tabs[from.tabIndex] = { ...tabs[from.tabIndex], ids };
  return components.map((component) => component.id === from.tabsId ? { ...component, props: { ...component.props, tabs: tabsValue(tabs) } } as C : component);
}

/** Varsayılan sekme sınırlar içinde tutulur (sekmesiz listede 0). */
export const clampDefaultTab = (defaultTab: number, count: number) =>
  count === 0 ? 0 : Number.isInteger(defaultTab) ? Math.max(0, Math.min(defaultTab, count - 1)) : 0;

/** Sekmeyi `from` sırasından `to` sırasına taşır (sürükle-bırak sıralaması); varsayılan sekme taşınan sekmeyle birlikte gider. */
export function moveTab(tabs: TabEntry[], defaultTab: number, from: number, to: number): { tabs: TabEntry[]; defaultTab: number } {
  const current = clampDefaultTab(defaultTab, tabs.length);
  if (from < 0 || from >= tabs.length || to < 0 || to >= tabs.length || from === to) return { tabs, defaultTab: current };
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  const defaultLabelHolder = tabs[current];
  return { tabs: next, defaultTab: next.indexOf(defaultLabelHolder) };
}

/** Sekmeyi siler; içindeki bileşenler sayfaya döner. Varsayılan sekme silinen sekmeden sonra geliyorsa bir geri kayar. */
export function removeTab(tabs: TabEntry[], defaultTab: number, index: number): { tabs: TabEntry[]; defaultTab: number } {
  const current = clampDefaultTab(defaultTab, tabs.length);
  if (index < 0 || index >= tabs.length) return { tabs, defaultTab: current };
  const next = tabs.filter((_, i) => i !== index);
  return { tabs: next, defaultTab: clampDefaultTab(current > index ? current - 1 : current === index ? 0 : current, next.length) };
}

/** Sona boş bir sekme ekler ("Yeni sekme", "Yeni sekme 2"…); en çok 8 sekme dolduysa `null`. */
export function addTab(tabs: TabEntry[]): TabEntry[] | null {
  if (tabs.length >= MAX_TABS) return null;
  let label = "Yeni sekme";
  for (let number = 2; tabs.some((tab) => tab.label === label); number++) label = `Yeni sekme ${number}`;
  return [...tabs, { label, ids: [] }];
}

/** Sekmeyi yeniden adlandırır; etiket sunucu kuralına (`^[^=,]{1,40}`) uymuyorsa ya da değişmiyorsa `null`. */
export function renameTab(tabs: TabEntry[], index: number, label: string): TabEntry[] | null {
  if (index < 0 || index >= tabs.length || !label || label.length > MAX_TAB_LABEL || /[=,]/.test(label) || tabs[index].label === label) return null;
  return tabs.map((tab, i) => i === index ? { ...tab, label } : tab);
}

function sameStrings(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
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

type Option = { value: string; label: string };

/** Süzgeç çipinin metni: boş/etkisiz değer `null` (çip çizilmez). */
export function chipText(raw: unknown, inputType: string, options?: Option[]): string | null {
  if (inputType === "checkbox") return raw === true ? "Evet" : null;
  if (raw == null || raw === false || (typeof raw === "string" && raw.trim() === "")) return null;
  if (raw === true) return "Evet";
  const text = String(raw);
  if (inputType === "date") return formatCell(text, "date");
  if (inputType === "select") return options?.find((option) => option.value === text)?.label ?? text;
  return text;
}
