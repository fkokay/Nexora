// Kalıplı sayfanın güvenlik ağı (sunucu kuralları, PageTemplateRules): her üst düzey bileşenin geçerli bir `slot`'u olur,
// ağacın hiçbir yerinde `width` / `widthWhen` kalmaz. Eski ayar yollarından (satır düğmesi, kopyalama, standart öğeler…)
// gelen bileşenler de böylece kaydı bozmaz. Değişiklik yoksa aynı nesne döner.
import { readPageTemplate } from "../pageTemplates";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { fieldRemovalBlocked, removeBlock, removeField, removeSection, sectionRemovalBlocked } from "./recordModel";

export const TEMPLATE_SLOTS = new Set(["indicators", "filters", "list", "actions", "rowActions", "detail", "above", "below"]);
export const RECORD_TEMPLATE_SLOTS = new Set(["summary", "actions", "tabs", "section", "field", "lines", "note", "above", "below"]);
const RECORD_SLOT_TYPES: Record<string, string> = { summary: "recordHeader", tabs: "tabs", actions: "button", section: "formCard", field: "input", lines: "dataTable", note: "text" };
export const BELGE_TEMPLATE_SLOTS = new Set(["fields", "lines", "summary", "actions", "above", "below"]);
const BELGE_SLOT_TYPES: Record<string, string> = { fields: "documentFields", lines: "documentLines", summary: "documentSummary", actions: "button" };
const SLOT_TYPES: Record<string, string> = { indicators: "metric", filters: "filterBar", list: "dataTable", actions: "button", rowActions: "button", detail: "contextPanel" };

const ids = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function stripWidth(component: ModelComponent): ModelComponent {
  let next = component;
  if ("width" in component.props || "widthWhen" in component.props) {
    const props = { ...component.props };
    delete props.width; delete props.widthWhen;
    next = { ...component, props };
  }
  if (Array.isArray(component.children)) {
    const children = (component.children as ModelComponent[]).map((child) => child && typeof child === "object" && child.props ? stripWidth(child) : child);
    if (children.some((child, index) => child !== (component.children as ModelComponent[])[index])) next = { ...next, children };
  }
  return next;
}

/** Yeri olmayan ya da türüne uymayan bileşene yer verir: satır düğmesi `rowActions`, öteki her şey listenin altı (`below`). */
export function ensureTemplateSlots<D extends ModelDefinition>(def: D): D {
  const template = readPageTemplate(def.template);
  if (!template) return def;
  const slots = template.name === "record" ? RECORD_TEMPLATE_SLOTS : template.name === "belge" ? BELGE_TEMPLATE_SLOTS : TEMPLATE_SLOTS;
  const slotTypes = template.name === "record" ? RECORD_SLOT_TYPES : template.name === "belge" ? BELGE_SLOT_TYPES : SLOT_TYPES;
  const rowButtons = new Set(def.components.flatMap((component) => component.type === "dataTable"
    ? [...ids(component.props.rowActions), ...(typeof component.props.rowOpenAction === "string" ? [component.props.rowOpenAction] : [])] : []));
  let changed = false;
  const components = def.components.map((component) => {
    let next = stripWidth(component);
    const slot = typeof next.props.slot === "string" ? next.props.slot : "";
    const fits = slots.has(slot) && (!slotTypes[slot] || slotTypes[slot] === next.type);
    if (!fits) next = { ...next, props: { ...next.props, slot: next.type === "button" && rowButtons.has(next.id) ? "rowActions" : "below" } };
    if (next !== component) changed = true;
    return next;
  });
  return changed ? { ...def, components } : def;
}

export type RecordSelection = { kind: "page" } | { kind: "section"; id: string } | { kind: "field"; id: string } | { kind: "lines"; id: string } | { kind: "note"; id: string };

/** Kayıt kartında seçili bileşenin panel seçimi: kartın parçaları kendi paneline, ek alanlar (`above`/`below`) null, öteki her şey sayfaya. */
export function recordSelectionOf(def: ModelDefinition, componentId: string | null): RecordSelection | null {
  const component = componentId ? def.components.find((item) => item.id === componentId) : undefined;
  if (!component) return { kind: "page" };
  const slot = typeof component.props.slot === "string" ? component.props.slot : "";
  if (slot === "above" || slot === "below") return null;
  if (slot === "section" && component.type === "formCard") return { kind: "section", id: component.id };
  if (slot === "field" && component.type === "input") return { kind: "field", id: component.id };
  if (slot === "lines" && component.type === "dataTable") return { kind: "lines", id: component.id };
  if (slot === "note" && component.type === "text") return { kind: "note", id: component.id };
  return { kind: "page" };
}

const isRecordPage = (def: ModelDefinition) => readPageTemplate(def.template)?.name === "record";
/** Kayıt kartının üst düzey parçası mı (ek alanlar ve iç içe bileşenler değil). */
const isRecordPart = (def: ModelDefinition, id: string) =>
  isRecordPage(def) && def.components.some((item) => item.id === id) && recordSelectionOf(def, id) !== null;

export type RecordRemoval<D> = { kind: "generic" } | { kind: "none" } | { kind: "blocked"; reason: string } | { kind: "removed"; def: D };
/**
 * Tasarımcının genel silme yolunun (Delete tuşu, çöp düğmeleri) kayıt kartındaki karşılığı: alan, bölüm, satır tablosu ve not
 * modelin kuralıyla silinir (eyleme bağlı alan silinmez, neden döner); özet, sekmeler ve eylem düğmeleri silinmez. Kalıp kayıt
 * kartı değilse ya da bileşen ek alan / iç içe bileşense genel yol kullanılır.
 */
export function recordRemoval<D extends ModelDefinition>(def: D, id: string): RecordRemoval<D> {
  if (!isRecordPart(def, id)) return { kind: "generic" };
  const selection = recordSelectionOf(def, id)!;
  if (selection.kind === "page") return { kind: "none" };
  if (selection.kind === "field") {
    const reason = fieldRemovalBlocked(def, id);
    return reason ? { kind: "blocked", reason } : { kind: "removed", def: removeField(def, id) };
  }
  if (selection.kind === "section") {
    const reason = sectionRemovalBlocked(def, id);
    return reason ? { kind: "blocked", reason } : { kind: "removed", def: removeSection(def, id) };
  }
  return { kind: "removed", def: removeBlock(def, id) };
}

/** Kalıplı sayfada kopyalanamayanlar: liste, detay paneli, listenin satır açma ("Aç") düğmesi ve kayıt kartının her parçası. */
export function templateDuplicateBlocked(def: ModelDefinition, id: string): boolean {
  if (!readPageTemplate(def.template)) return false;
  if (isRecordPart(def, id)) return true;
  const component = def.components.find((item) => item.id === id);
  if (!component) return false;
  if (component.props.slot === "list" || component.props.slot === "detail") return true;
  return def.components.some((item) => item.type === "dataTable" && item.props.rowOpenAction === id);
}
