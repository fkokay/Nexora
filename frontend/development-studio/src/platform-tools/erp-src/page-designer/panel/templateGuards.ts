// Kalıplı sayfanın güvenlik ağı (sunucu kuralları, PageTemplateRules): her üst düzey bileşenin geçerli bir `slot`'u olur,
// ağacın hiçbir yerinde `width` / `widthWhen` kalmaz. Eski ayar yollarından (satır düğmesi, kopyalama, standart öğeler…)
// gelen bileşenler de böylece kaydı bozmaz. Değişiklik yoksa aynı nesne döner.
import { readPageTemplate } from "../pageTemplates";
import {
  freeBlocks, freeTabs, isFreeBlock, isFreeItem, MAX_BLOCK_MEMBERS, MAX_FREE_BLOCKS, newFreeBlock, removeBlock as removeFreeBlock, removeItem as removeFreeItem,
  removePageAction, setFreeTabs,
} from "./freeModel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { fieldRemovalBlocked, removeBlock, removeField, removeSection, sectionRemovalBlocked } from "./recordModel";

export const TEMPLATE_SLOTS = new Set(["indicators", "filters", "list", "actions", "rowActions", "detail", "above", "below"]);
export const RECORD_TEMPLATE_SLOTS = new Set(["summary", "actions", "tabs", "section", "field", "lines", "note", "above", "below"]);
const RECORD_SLOT_TYPES: Record<string, string> = { summary: "recordHeader", tabs: "tabs", actions: "button", section: "formCard", field: "input", lines: "dataTable", note: "text" };
export const BELGE_TEMPLATE_SLOTS = new Set(["fields", "lines", "summary", "actions", "above", "below"]);
const BELGE_SLOT_TYPES: Record<string, string> = { fields: "documentFields", lines: "documentLines", summary: "documentSummary", actions: "button" };
export const FREE_TEMPLATE_SLOTS = new Set(["actions", "tabs", "block", "item"]);
/** Serbest gövdede `item` yerine konabilen tipler (sunucu: PageTemplateRules); `code` yalnız katalog bileşeniyle (`isFreeItemType`). */
export const FREE_ITEM_TYPES = new Set(["heading", "text", "label", "section", "alert", "card", "list", "metric", "progress", "badge", "image", "dataTable"]);
/** Serbest gövde öğesi olabilir mi: `FREE_ITEM_TYPES` ya da katalog bileşenine başvuran `code` (satır içi kodlu `code` olamaz; sunucu da reddeder). */
export function isFreeItemType(component: ModelComponent): boolean {
  if (component.type === "code") {
    const ref = (component.props as Record<string, unknown>).catalogComponent;
    return typeof ref === "string" && ref !== "";
  }
  return FREE_ITEM_TYPES.has(component.type);
}
const FREE_SLOT_TYPES: Record<string, string> = { actions: "button", tabs: "tabs", block: "section" };
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

/**
 * Yeri olmayan ya da türüne uymayan bileşene yer verir: satır düğmesi `rowActions`, öteki her şey listenin altı (`below`).
 * Serbest gövdede düğme işlem çubuğuna (`actions`), öteki her şey `item` olarak bir bölüme girer (`freeMembership`).
 */
export function ensureTemplateSlots<D extends ModelDefinition>(def: D): D {
  const template = readPageTemplate(def.template);
  if (!template) return def;
  if (template.name === "free") return ensureFreeSlots(def);
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

function ensureFreeSlots<D extends ModelDefinition>(def: D): D {
  let changed = false;
  const components = def.components.map((component) => {
    let next = stripWidth(component);
    const slot = typeof next.props.slot === "string" ? next.props.slot : "";
    const fits = FREE_TEMPLATE_SLOTS.has(slot) && (slot === "item" ? isFreeItemType(next) : FREE_SLOT_TYPES[slot] === next.type);
    if (!fits) next = { ...next, props: { ...next.props, slot: next.type === "button" ? "actions" : "item" } };
    if (next !== component) changed = true;
    return next;
  });
  const slotted = changed ? { ...def, components } : def;
  // Boş olmayan `children` onarılmaz (sunucu reddeder); yalnız `width` / `widthWhen` atılır.
  return freeMembership(slotted);
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * Serbest gövdenin üyelik kuralları (sunucu: her bileşen tam bir bölümde, sekme varsa her bölüm tam bir sekmede, en az bir
 * bölüm): bölümün `members`'ından olmayan bileşenler, ikinci kez geçen kimlikler ve 12'yi aşanlar çıkarılır; bölümsüz bileşen
 * yeri olan son bölüme (hepsi doluysa, 20 bölüm sınırına kadar yeni bir bölüme; sınırda son bölüme) girer; hiç bölüm yoksa boş
 * bir bölüm açılır. Sekmede olmayan bölüm son sekmeye girer, bilinmeyen kimlikler ve boş sekmeler atılır, tek sekme ya da hiç
 * sekme kalmazsa sekme bileşeni kalkar.
 * Boş olmayan `children` burada onarılmaz: sunucu onu kendi metniyle reddeder (iç içe bileşen serbest gövdede kullanılmaz).
 */
function freeMembership<D extends ModelDefinition>(def: D): D {
  const items = new Set(def.components.filter((component) => component.props.slot === "item").map((component) => component.id));
  const seen = new Set<string>();
  const order = freeBlocks(def).map((block) => block.id);
  const members = new Map<string, string[]>();
  for (const id of order) {
    const block = def.components.find((component) => component.id === id)!;
    const kept = ids(block.props.members).filter((member) => items.has(member) && !seen.has(member)).slice(0, MAX_BLOCK_MEMBERS);
    kept.forEach((member) => seen.add(member));
    members.set(id, kept);
  }
  // Yeni bölümler çalışma tanımına eklenerek kurulur: kimlik ve "Bölüm N" başlığı öncekilerle çakışmaz.
  const extraBlocks: ModelComponent[] = [];
  const openBlock = () => {
    const block = newFreeBlock({ ...def, components: [...def.components, ...extraBlocks] });
    extraBlocks.push(block);
    order.push(block.id);
    members.set(block.id, []);
    return block.id;
  };
  for (const item of items) {
    if (seen.has(item)) continue;
    let target = [...order].reverse().find((id) => members.get(id)!.length < MAX_BLOCK_MEMBERS);
    if (!target) target = order.length < MAX_FREE_BLOCKS ? openBlock() : order.at(-1)!;
    members.get(target)!.push(item);
    seen.add(item);
  }
  if (order.length === 0) openBlock();
  let next: D = def;
  const patched = def.components.map((component) => {
    const list = isFreeBlock(component) ? members.get(component.id) : undefined;
    return list && !sameList(ids(component.props.members), list) ? { ...component, props: { ...component.props, members: list } } : component;
  });
  if (patched.some((component, index) => component !== def.components[index]) || extraBlocks.length > 0) next = { ...def, components: [...patched,
    ...extraBlocks.map((block) => ({ ...block, props: { ...block.props, members: members.get(block.id)! } }))] };
  const tabs = freeTabs(next);
  if (!tabs) return next;
  // Sekme bileşeni hiç geçerli sekme taşımıyorsa kaldırılır; bölümler sekmesiz çizilir.
  if (tabs.length === 0) return setFreeTabs(next, []);
  // Yeni (taşma) bölümleri `order`'da; sekmeler onları da son sekmeye alır.
  const blockIds = new Set(order);
  const placed = new Set<string>();
  const cleaned = tabs.map((tab) => ({ ...tab, blockIds: tab.blockIds.filter((id) => blockIds.has(id) && !placed.has(id) && (placed.add(id), true)) }));
  const loose = order.filter((id) => !placed.has(id));
  const lastWithBlocks = cleaned.map((tab) => tab.blockIds.length > 0).lastIndexOf(true);
  if (loose.length > 0) {
    const at = lastWithBlocks >= 0 ? lastWithBlocks : cleaned.length - 1;
    cleaned[at] = { ...cleaned[at], blockIds: [...cleaned[at].blockIds, ...loose] };
  }
  const unchanged = cleaned.length === tabs.length && cleaned.every((tab, index) => tab.blockIds.length > 0 && sameList(tab.blockIds, tabs[index].blockIds));
  return unchanged && cleaned.length > 1 ? next : setFreeTabs(next, cleaned);
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

/**
 * Tasarımcının genel silme yolunun serbest gövdedeki karşılığı (üyelik geçerli kalsın diye): bölüm `freeModel.removeBlock`
 * kuralıyla (üyesi olan ya da son bölüm silinmez, neden döner), bileşen `removeItem` ile, sayfa eylemi `removePageAction` ile
 * silinir; sekme bileşeni silinmez (sekmeleri sayfa paneli yönetir). Serbest olmayan sayfada genel yol.
 */
export function freeRemoval<D extends ModelDefinition>(def: D, id: string): RecordRemoval<D> {
  if (readPageTemplate(def.template)?.name !== "free") return { kind: "generic" };
  const component = def.components.find((item) => item.id === id);
  if (!component) return { kind: "none" };
  if (isFreeBlock(component)) {
    const result = removeFreeBlock(def, id);
    return "reason" in result ? { kind: "blocked", reason: result.reason } : { kind: "removed", def: result.def };
  }
  if (isFreeItem(component)) return { kind: "removed", def: removeFreeItem(def, id) };
  if (component.type === "tabs") return { kind: "none" };
  if (component.type === "button" && component.props.slot === "actions") {
    const query = def.queries.find((item) => item.id === component.props.queryId);
    const code = typeof query?.action === "string" ? query.action : null;
    const next = code ? removePageAction(def, code) : def;
    if (next !== def) return { kind: "removed", def: next };
  }
  return { kind: "removed", def: { ...def, components: def.components.filter((item) => item !== component) } };
}

/** Kalıplı sayfada kopyalanamayanlar: liste, detay paneli, listenin satır açma ("Aç") düğmesi ve kayıt kartının her parçası. */
export function templateDuplicateBlocked(def: ModelDefinition, id: string): boolean {
  const template = readPageTemplate(def.template);
  if (!template) return false;
  // Serbest gövdede kopya bölüm üyeliğini bozardı (kopya hiçbir bölümde olmaz ya da üyeleri iki bölümde olur); kopyalama kapalı.
  if (template.name === "free") return def.components.some((item) => item.id === id);
  if (isRecordPart(def, id)) return true;
  const component = def.components.find((item) => item.id === id);
  if (!component) return false;
  if (component.props.slot === "list" || component.props.slot === "detail") return true;
  return def.components.some((item) => item.type === "dataTable" && item.props.rowOpenAction === id);
}
