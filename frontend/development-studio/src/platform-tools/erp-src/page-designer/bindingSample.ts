import { createContext } from "react";

/** Tasarım tuvalinin örnek kapsamıyla bir şablonu çözer; sağlayıcı yoksa null (önizleme gösterilmez). */
export const BindingSampleContext = createContext<((template: string) => string) | null>(null);

export type BindingChip = { expression: string; label: string };

/** Önizlemede gürültü sayılan yol parçaları: satır dizisi ve seçili satır. */
const NOISE = new Set(["rows", "seciliSatir"]);

/** Yol ifadesinden okunur etiket: parçalar " › " ile birleşir, satır dizini/seçili satır atlanır. */
function chipLabel(inner: string): string {
  if (!/^[A-Za-z0-9_$.[\]\s]+$/.test(inner)) return inner;
  const parts = inner.replace(/\s+/g, "").split(/\.|\[[^\]]*\]/).filter((part) => part && !NOISE.has(part));
  return parts.length ? parts.join(" › ") : inner;
}

/** Şablondaki her "{{ ... }}" bağlaması için ifade (tam metin) ve okunur etiket. */
export function bindingChips(template: string): BindingChip[] {
  const chips: BindingChip[] = [];
  for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const inner = match[1].trim();
    if (!inner) continue;
    chips.push({ expression: match[0], label: chipLabel(inner) });
  }
  return chips;
}
