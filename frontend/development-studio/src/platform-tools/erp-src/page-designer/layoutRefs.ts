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

/**
 * Yalnız Studio: bir Sekmeler ya da Pencere bileşeninin sahiplenebileceği üst düzey bileşenler (sunucudaki sekme/pencere
 * kuralı). Kendisi, İşlem Çubuğu, form kartı/yan filtre paneli girişleri, liste arama girişleri ve satır işlemi düğmeleri
 * hiç aday olmaz; sekmeler Sekmeler ya da Pencere, pencere başka Pencere sahiplenemez (pencere Sekmeler içerebilir).
 * Başka bir sahibin aldığı bileşenler adaydır; seçicide soluk gösterilir.
 */
export function ownableCandidates<C extends LayoutComponent>(components: C[], owner: { id: string; type: "tabs" | "dialog" }): C[] {
  const layoutOwned = ownedInputIds(components);
  const rowActions = rowActionIds(components);
  const searchInputs = new Set(components.filter((component) => component.type === "dataTable" && typeof component.props?.searchInput === "string")
    .map((component) => String(component.props?.searchInput)));
  return components.filter((component) => component.id !== owner.id && component.type !== "actionBar" && component.type !== "dialog"
    && !(owner.type === "tabs" && component.type === "tabs")
    && !(component.type === "input" && (layoutOwned.has(component.id) || searchInputs.has(component.id)))
    && !rowActions.has(component.id));
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
