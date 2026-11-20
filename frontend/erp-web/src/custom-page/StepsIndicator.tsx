import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { conditionHolds } from "./conditions";
import type { PageScope } from "./pageBindings";
import "./wizard.css";

/** `steps` bileşeninin etiketleri (2–6, en fazla 40 karakter); geçersiz öğe atlanır. */
export function stepLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item !== "").slice(0, 6)
    .map((item) => item.slice(0, 40));
}

/** Etkin adım: koşulu (`activeWhen[i]`, `visibleWhen` dilbilgisi) tutan SON adım; hiçbiri tutmuyorsa 0. */
export function activeStepIndex(count: number, activeWhen: unknown, scope: PageScope): number {
  const conditions = Array.isArray(activeWhen) ? activeWhen : [];
  let active = 0;
  for (let index = 0; index < count; index += 1) {
    const condition = conditions[index];
    if (typeof condition === "string" && condition.trim() !== "" && conditionHolds(condition, scope, false)) active = index;
  }
  return active;
}

/** Adımlar göstergesi (yalnız sunum): önceki adımlar tamamlandı (✓, yeşil), etkin adım vurgulu, sonrakiler soluk. */
export function StepsIndicator({ labels, active, style }: { labels: string[]; active: number; style?: CSSProperties }) {
  if (labels.length === 0) return null;
  return <ol className="tenant-page-steps" aria-label="Adımlar" style={style}>
    {labels.map((label, index) => {
      const state = index < active ? "is-done" : index === active ? "is-active" : "is-next";
      return <li key={`${index}-${label}`} className={`tenant-page-step ${state}`} aria-current={index === active ? "step" : undefined}>
        <span className="tenant-page-step-mark" aria-hidden="true">{index < active ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
        <span className="tenant-page-step-label">{label}</span>
        {index < active && <span className="tenant-page-sr-only"> (tamamlandı)</span>}
      </li>;
    })}
  </ol>;
}
