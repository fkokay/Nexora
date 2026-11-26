// Belge kalıbının saf düzeni: sayfanın üç parçası (başlık alanları, satır kolonları, toplamlar) ve modelden görünürlük kuralları.
import type { DocumentLineColumn, DocumentModel } from "./documentApi";

export type BelgeComponent = { id: string; type: string; props?: Record<string, unknown>; children?: unknown };

export type BelgeLayout<C extends BelgeComponent> = {
  fields: string[]; fieldLabels: Record<string, string>;
  columns: string[]; columnLabels: Record<string, string>; density: "dense" | "normal" | "comfy";
  vatBreakdown: boolean; activity: boolean;
  actions: C[]; above: C[]; below: C[];
  /** Parçaların bileşen kimlikleri (Studio tuvalinde seçim işaretçisi için). */
  ids: { fields: string | null; lines: string | null; summary: string | null };
};

export const BELGE_PARTS = ["documentFields", "documentLines", "documentSummary"] as const;

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);
const labels = (value: unknown): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"))
    : {};

export function layoutDocumentTemplate<C extends BelgeComponent>(components: C[]): BelgeLayout<C> {
  const part = (type: string) => components.find((c) => c.type === type)?.props ?? {};
  const idOf = (type: string) => components.find((c) => c.type === type)?.id ?? null;
  const fields = part("documentFields"), lines = part("documentLines"), summary = part("documentSummary");
  const slot = (name: string) => components.filter((c) => c.props?.slot === name && !(BELGE_PARTS as readonly string[]).includes(c.type));
  const density = lines.density === "dense" || lines.density === "comfy" ? lines.density : "normal";
  return {
    fields: strings(fields.fields), fieldLabels: labels(fields.labels),
    columns: strings(lines.columns), columnLabels: labels(lines.labels), density,
    vatBreakdown: summary.vatBreakdown !== false, activity: summary.activity !== false,
    actions: slot("actions"), above: slot("above"), below: slot("below"),
    ids: { fields: idOf("documentFields"), lines: idOf("documentLines"), summary: idOf("documentSummary") },
  };
}

/** Durumların sırası (modeldeki sıra). */
const stateIndex = (model: DocumentModel, status: string) => model.states.findIndex((s) => s.code === status);

/** `visibleFrom` taşıyan kolon (ör. sevk edilen) yalnız o durumdan itibaren görünür; iptal edilmiş belgede de görünür değildir. */
export function columnVisible(model: DocumentModel, column: DocumentLineColumn, status: string): boolean {
  if (!column.visibleFrom) return true;
  const from = stateIndex(model, column.visibleFrom), at = stateIndex(model, status);
  const terminal = model.states.find((s) => s.code === status)?.terminal ?? false;
  return from >= 0 && at >= from && !terminal;
}

/** Seçili kolonlar, sayfadaki sırayla ve belgenin durumuna göre. */
export function visibleColumns(model: DocumentModel, chosen: string[], status: string): DocumentLineColumn[] {
  return chosen.map((code) => model.lineColumns.find((c) => c.code === code)).filter((c): c is DocumentLineColumn => !!c)
    .filter((c) => columnVisible(model, c, status));
}

/** Belge yalnız Taslak'ta (ve yeni belgede) düzenlenir. */
export const isEditable = (status: string) => status === "Draft";
export function fieldEditable(model: DocumentModel, code: string, status: string): boolean {
  const field = model.fields.find((f) => f.code === code);
  return !!field && !field.readOnly && isEditable(status);
}
