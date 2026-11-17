// erp-web/src/custom-page/layoutRefs.ts ile aynıdır (Studio erp-web içinden içe aktaramaz); biri değişirse diğeri de güncellenmelidir.
import { formatCell } from "./cellFormat";

type LayoutComponent = { id: string; type: string; props?: Record<string, unknown> };

/** formCard ve facetPanel bileşenlerinin `inputs` listesinde yer alan giriş kimlikleri (sahiplenilen girişler). */
export function ownedInputIds(components: LayoutComponent[]): Set<string> {
  const owned = new Set<string>();
  for (const component of components) {
    if (component.type !== "formCard" && component.type !== "facetPanel") continue;
    for (const id of idList(component.props?.inputs)) owned.add(id);
  }
  return owned;
}

/** Tekil, boş olmayan, kırpılmış dizgilerin listesi (en çok `max` öğe). */
export function idList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (id && !result.includes(id)) result.push(id);
    if (result.length >= max) break;
  }
  return result;
}

const FIELD_PATTERN = /^([^=]{1,128})=([^=]{1,60})$/;

/** "sütun=Etiket" girdilerini ayrıştırır; geçersizler atlanır. */
export function parseFieldList(value: unknown): { code: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  const result: { code: string; label: string }[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const match = FIELD_PATTERN.exec(entry);
    if (!match) continue;
    const code = match[1].trim();
    const label = match[2].trim();
    if (code && label) result.push({ code, label });
  }
  return result;
}

/** Filtre çipinde gösterilecek metin; boş değer için null. */
export function chipText(raw: unknown, inputType: string, options?: { value: string; label: string }[]): string | null {
  if (raw === null || raw === undefined) return null;
  if (inputType === "checkbox") return raw === true || raw === "true" ? "Evet" : null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  if (inputType === "date") return formatCell(raw, "date");
  if (inputType === "select") {
    const text = String(raw);
    return options?.find((option) => option.value === text)?.label ?? text;
  }
  return String(raw);
}
