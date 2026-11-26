// Belge panelinin saf modeli (belge kuralları PR 2, taslak 09): seçilen başlık alanları ve satır kolonları, sıraları, etiketleri,
// görünüm ve katalogdan ek eylemler. Her fonksiyon yeni bir tanım döndürür; değişiklik yoksa aynı nesne döner.
import type { CatalogAction } from "../catalogClient";
import type { DocumentModel } from "../documentModelClient";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";

export type BelgeKind = "fields" | "columns";
type PropValue = ModelComponent["props"][string];

const PART: Record<BelgeKind, string> = { fields: "documentFields", columns: "documentLines" };
export const BELGE_PART_TYPES = new Set(["documentFields", "documentLines", "documentSummary"]);
export const MAX_BELGE_LABEL = 60;
export const BELGE_PAGE_PARAM = "id";

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

function partOf(def: ModelDefinition, type: string): ModelComponent | undefined {
  return def.components.find((component) => component.type === type);
}

function setPartProps<D extends ModelDefinition>(def: D, type: string, patch: Record<string, PropValue | undefined>): D {
  const part = partOf(def, type);
  if (!part) return def;
  const props = { ...part.props };
  for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete props[key]; else props[key] = value; }
  return { ...def, components: def.components.map((component) => (component === part ? { ...part, props } : component)) };
}

/** Etiketler nesnesi bir PropValue değildir; JSON'da nesne olarak saklanır (sunucu `labels` nesnesini bekler). */
function labelsOf(def: ModelDefinition, kind: BelgeKind): Record<string, string> {
  const raw = partOf(def, PART[kind])?.props.labels as unknown;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"))
    : {};
}

export function belgeParts(def: ModelDefinition) {
  const lines = partOf(def, "documentLines")?.props ?? {};
  const summary = partOf(def, "documentSummary")?.props ?? {};
  return {
    fields: strings(partOf(def, "documentFields")?.props.fields), fieldLabels: labelsOf(def, "fields"),
    columns: strings(lines.columns), columnLabels: labelsOf(def, "columns"),
    density: (lines.density === "dense" || lines.density === "comfy" ? lines.density : "normal") as "dense" | "normal" | "comfy",
    vatBreakdown: summary.vatBreakdown !== false, activity: summary.activity !== false,
  };
}

/** Modeldeki tüm kodlar, sayfadaki sırayla önce seçilenler, sonra seçilmeyenler (modelin sırasıyla). */
export function belgeItems(def: ModelDefinition, model: DocumentModel, kind: BelgeKind) {
  const chosen = kind === "fields" ? belgeParts(def).fields : belgeParts(def).columns;
  const labels = kind === "fields" ? belgeParts(def).fieldLabels : belgeParts(def).columnLabels;
  const all = kind === "fields"
    ? model.fields.map((f) => ({ code: f.code, label: f.label, required: f.required, calculated: false, readOnly: f.readOnly, visibleFrom: null as string | null }))
    : model.lineColumns.map((c) => ({ code: c.code, label: c.label, required: c.required, calculated: c.calculated, readOnly: false, visibleFrom: c.visibleFrom }));
  const order = [...chosen.filter((code) => all.some((x) => x.code === code)), ...all.map((x) => x.code).filter((code) => !chosen.includes(code))];
  return order.map((code) => {
    const item = all.find((x) => x.code === code)!;
    return { ...item, on: chosen.includes(code), shownLabel: labels[code] ?? item.label, renamed: code in labels };
  });
}

const listKey = (kind: BelgeKind) => (kind === "fields" ? "fields" : "columns");

/** İşaretle/kaldır. Zorunlu kod kaldırılamaz (sunucu da reddeder); kaldırılan kodun etiketi de silinir. */
export function toggleBelgeItem<D extends ModelDefinition>(def: D, model: DocumentModel, kind: BelgeKind, code: string): D {
  const required = (kind === "fields" ? model.fields : model.lineColumns).find((x) => x.code === code)?.required;
  const parts = belgeParts(def);
  const chosen = kind === "fields" ? parts.fields : parts.columns;
  if (chosen.includes(code)) {
    if (required) return def;
    const labels = { ...(kind === "fields" ? parts.fieldLabels : parts.columnLabels) };
    delete labels[code];
    return setPartProps(def, PART[kind], { [listKey(kind)]: chosen.filter((x) => x !== code), labels: labels as unknown as PropValue });
  }
  // Yeni işaretlenen, modeldeki sırasına en yakın yere girer.
  const modelOrder = (kind === "fields" ? model.fields : model.lineColumns).map((x) => x.code);
  const at = modelOrder.indexOf(code);
  const next = [...chosen];
  const before = next.findIndex((x) => modelOrder.indexOf(x) > at);
  next.splice(before < 0 ? next.length : before, 0, code);
  return setPartProps(def, PART[kind], { [listKey(kind)]: next });
}

/** Seçili bir kodu seçililer arasında `to` sırasına taşır. */
export function moveBelgeItem<D extends ModelDefinition>(def: D, kind: BelgeKind, code: string, to: number): D {
  const chosen = kind === "fields" ? belgeParts(def).fields : belgeParts(def).columns;
  const from = chosen.indexOf(code);
  if (from < 0) return def;
  const next = chosen.filter((x) => x !== code);
  const index = Math.max(0, Math.min(to, next.length));
  next.splice(index, 0, code);
  return next.every((x, i) => x === chosen[i]) ? def : setPartProps(def, PART[kind], { [listKey(kind)]: next });
}

/** Etiketi değiştirir; boş ya da modelin etiketiyle aynı etiket kaldırılır. En çok 60 karakter. */
export function renameBelgeItem<D extends ModelDefinition>(def: D, model: DocumentModel, kind: BelgeKind, code: string, label: string): D {
  const parts = belgeParts(def);
  if (!(kind === "fields" ? parts.fields : parts.columns).includes(code)) return def;
  const original = (kind === "fields" ? model.fields : model.lineColumns).find((x) => x.code === code)?.label;
  const labels = { ...(kind === "fields" ? parts.fieldLabels : parts.columnLabels) };
  const text = label.trim().slice(0, MAX_BELGE_LABEL);
  if (!text || text === original) delete labels[code]; else labels[code] = text;
  return setPartProps(def, PART[kind], { labels: labels as unknown as PropValue });
}

export const setBelgeDensity = <D extends ModelDefinition>(def: D, density: "dense" | "normal" | "comfy") =>
  setPartProps(def, "documentLines", { density });
export const setBelgeVatBreakdown = <D extends ModelDefinition>(def: D, on: boolean) => setPartProps(def, "documentSummary", { vatBreakdown: on });
export const setBelgeActivity = <D extends ModelDefinition>(def: D, on: boolean) => setPartProps(def, "documentSummary", { activity: on });

// ---------- ek eylemler ----------

/** Belgede kullanılabilen katalog eylemi: tek bir belge kaydına çalışır ve yalnız belgenin kimliğini (`id`) ister. */
export function belgeActionUsable(action: CatalogAction): { usable: true } | { usable: false; reason: string } {
  if (action.target === "bulk") return { usable: false, reason: "Toplu eylem belgede kullanılmaz." };
  if (action.kind === "insert" || action.kind === "delete") return { usable: false, reason: "Ekleme ve silme belgenin kendi düğmeleridir." };
  if (action.parameters.some((parameter) => parameter.name !== BELGE_PAGE_PARAM)) return { usable: false, reason: "Bu eylem belgede olmayan bilgi istiyor." };
  return { usable: true };
}

const actionButtons = (def: ModelDefinition) =>
  def.components.filter((component) => component.type === "button" && component.props.slot === "actions" && component.props.actionType === "query");

export function belgeExtraActions(def: ModelDefinition): string[] {
  return actionButtons(def).flatMap((button) => {
    const query = def.queries.find((q) => q.id === button.props.queryId) as { action?: string } | undefined;
    return query?.action ? [query.action] : [];
  });
}

function freeId(def: ModelDefinition, base: string): string {
  const taken = new Set([...def.components.map((c) => c.id.toLowerCase()), ...def.queries.map((q) => q.id.toLowerCase())]);
  const clean = base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 56) || "eylem";
  let id = clean, n = 2;
  while (taken.has(id.toLowerCase())) id = `${clean}${n++}`;
  return id;
}

export function addBelgeAction<D extends ModelDefinition>(def: D, action: CatalogAction): D {
  if (!belgeActionUsable(action).usable || belgeExtraActions(def).includes(action.code)) return def;
  const queryId = freeId(def, action.code);
  const query = { id: queryId, name: queryId, kind: action.kind, action: action.code, runOn: "manual",
    parameters: action.parameters.map((p) => ({ name: p.name, type: p.type, binding: `{{sayfa.parametre.${BELGE_PAGE_PARAM}}}` })) };
  const withQuery = { ...def, queries: [...def.queries, query as unknown as D["queries"][number]] };
  const buttonId = freeId(withQuery, `${action.code}Dugmesi`);
  const button: ModelComponent = { id: buttonId, type: "button", name: buttonId, props: {
    slot: "actions", text: action.label.trim().slice(0, 120) || action.code, actionType: "query", queryId,
    ...(action.confirmText ? { confirmEnabled: true, confirmText: action.confirmText } : {}) } };
  return { ...withQuery, components: [...def.components, button] };
}

export function removeBelgeAction<D extends ModelDefinition>(def: D, code: string): D {
  const buttons = actionButtons(def).filter((button) => (def.queries.find((q) => q.id === button.props.queryId) as { action?: string } | undefined)?.action === code);
  if (buttons.length === 0) return def;
  const ids = new Set(buttons.map((b) => b.id));
  const queryIds = new Set(buttons.map((b) => String(b.props.queryId)));
  return { ...def, components: def.components.filter((c) => !ids.has(c.id)), queries: def.queries.filter((q) => !queryIds.has(q.id)) };
}
