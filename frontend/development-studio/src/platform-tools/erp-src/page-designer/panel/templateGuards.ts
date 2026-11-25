// Kalıplı sayfanın güvenlik ağı (sunucu kuralları, PageTemplateRules): her üst düzey bileşenin geçerli bir `slot`'u olur,
// ağacın hiçbir yerinde `width` / `widthWhen` kalmaz. Eski ayar yollarından (satır düğmesi, kopyalama, standart öğeler…)
// gelen bileşenler de böylece kaydı bozmaz. Değişiklik yoksa aynı nesne döner.
import { readPageTemplate } from "../pageTemplates";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";

export const TEMPLATE_SLOTS = new Set(["indicators", "filters", "list", "actions", "rowActions", "detail", "above", "below"]);
export const RECORD_TEMPLATE_SLOTS = new Set(["summary", "actions", "tabs", "section", "field", "lines", "note", "above", "below"]);
const RECORD_SLOT_TYPES: Record<string, string> = { summary: "recordHeader", tabs: "tabs" };
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
  const slots = template.name === "record" ? RECORD_TEMPLATE_SLOTS : TEMPLATE_SLOTS;
  const slotTypes = template.name === "record" ? RECORD_SLOT_TYPES : SLOT_TYPES;
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

/** Kalıplı sayfada kopyalanamayanlar: liste, detay paneli ve listenin satır açma ("Aç") düğmesi. */
export function templateDuplicateBlocked(def: ModelDefinition, id: string): boolean {
  if (!readPageTemplate(def.template)) return false;
  const component = def.components.find((item) => item.id === id);
  if (!component) return false;
  if (component.props.slot === "list" || component.props.slot === "detail") return true;
  return def.components.some((item) => item.type === "dataTable" && item.props.rowOpenAction === id);
}
