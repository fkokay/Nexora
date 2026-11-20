import { interpolate, type PageScope } from "./pageBindings";

/** `setInput` düğmesinin atamaları: `"<girişKimliği>=<şablon>"` (en fazla 8); boş şablon girişi temizler. */
export type InputAssignment = { inputId: string; template: string };

export const MAX_ASSIGNMENTS = 8;

/**
 * `assignments` dizisi: ilk "=" ayraçtır, sağ taraf boş olabilir ("stokSecimi=" girişi temizler). Ayraçsız, kimliksiz ya da
 * dizgi olmayan öğe atlanır; aynı giriş birden çok kez geçerse sonuncusu geçerlidir.
 */
export function parseAssignments(value: unknown): InputAssignment[] {
  if (!Array.isArray(value)) return [];
  const result: InputAssignment[] = [];
  for (const item of value.slice(0, MAX_ASSIGNMENTS)) {
    if (typeof item !== "string") continue;
    const at = item.indexOf("=");
    if (at <= 0) continue;
    const inputId = item.slice(0, at).trim();
    if (!inputId) continue;
    const existing = result.findIndex((entry) => entry.inputId === inputId);
    if (existing >= 0) result.splice(existing, 1);
    result.push({ inputId, template: item.slice(at + 1) });
  }
  return result;
}

/** Atamalar geçerli mi: en az bir atama var ve hepsi sayfadaki bir girişe gidiyor. */
export function assignmentsValid(value: unknown, inputIds: ReadonlySet<string>): boolean {
  const assignments = parseAssignments(value);
  return assignments.length > 0 && assignments.every((entry) => inputIds.has(entry.inputId));
}

/**
 * Atamaların girişlere yazılacak ham değerleri; şablonların hepsi önce aynı kapsamla çözülür (bir atama diğerini etkilemez).
 * Boş sonuç girişi temizler: onay kutusu false, diğerleri "". Onay kutusunda "true", "1" ya da "evet" işaretler.
 */
export function resolveAssignments(value: unknown, scope: PageScope, isCheckbox: (inputId: string) => boolean): { inputId: string; raw: string | boolean }[] {
  return parseAssignments(value).map(({ inputId, template }) => {
    const text = interpolate(template, scope).trim();
    return { inputId, raw: isCheckbox(inputId) ? /^(true|1|evet)$/i.test(text) : text };
  });
}
