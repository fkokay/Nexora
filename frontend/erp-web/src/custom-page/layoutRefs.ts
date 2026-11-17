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
