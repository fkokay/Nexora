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
