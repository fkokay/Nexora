// Ortak kalıp özellikleri (spec 2026-11-28): Kayıt kartında / pencerede özel alan bloğu ve pencerede satır tablosu.
// Kurallar sunucuyla aynıdır (PageTemplateRules: OzelAlan*, Satir*). Bütün işlevler girdiyi değiştirmeden yenisini döndürür;
// değişiklik yoksa aynı nesne döner.
import { commandsBar, saveSteps } from "./commandsModel";
import { DIALOG_SLOT, dialogOwners, dialogsOf } from "./dialogsModel";
import { freeId, type ModelComponent, type ModelDefinition } from "./listPanelModel";

export const CUSTOM_FIELDS_SLOT = "customFields";
export const MAX_WINDOW_GRID_ROWS = 200;
export const MAX_WINDOW_GRID_COLUMNS = 8;
export const MAX_SAVE_STEPS = 8;
export const BLOCK_NO_SAVE = "Özel alan bloğunun değerleri kaydedilmiyor.";
export const GRID_NO_SAVE = "Satır tablosunun satırları kaydedilmiyor.";
export const GRID_NO_ACTION = "Bu pencerenin kayıt eylemi yok; önce Kaydet eylemini seçin.";
export const RECORD_NO_SAVE_STEP = "Kartın Komutlar bölümünde Kaydet adımı yok.";

type PropValue = string | number | boolean | string[];
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const patchProps = (def: ModelDefinition, id: string, patch: Record<string, PropValue | undefined>): ModelDefinition => ({
  ...def,
  components: def.components.map((component) => {
    if (component.id !== id) return component;
    const props = { ...component.props };
    for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete props[key]; else props[key] = value; }
    return { ...component, props };
  }),
});

/** Sayfadaki (ya da pencerenin) özel alan bloğu ve satır tablosu. */
export const customFieldsOf = (def: ModelDefinition, dialogId?: string): ModelComponent | undefined => {
  const owners = dialogOwners(def.components);
  return def.components.find((component) => component.type === "customFieldsBlock"
    && (dialogId === undefined ? component.props.slot === CUSTOM_FIELDS_SLOT : owners.get(component.id) === dialogId));
};
export const windowGridOf = (def: ModelDefinition, dialogId: string): ModelComponent | undefined => {
  const owners = dialogOwners(def.components);
  return def.components.find((component) => component.type === "editableGrid" && owners.get(component.id) === dialogId);
};
/** Bileşenin ait olduğu pencere (yoksa null: Kayıt kartının bloğu). */
export const windowOf = (def: ModelDefinition, componentId: string): string | null => dialogOwners(def.components).get(componentId) ?? null;

// ---------- pencereye ekleme ----------

function addToWindow(def: ModelDefinition, dialogId: string, component: ModelComponent): ModelDefinition {
  const dialog = dialogsOf(def.components).find((item) => item.id === dialogId);
  if (!dialog) return def;
  const contains = [...strings(dialog.props.contains), component.id];
  return { ...def, components: [...def.components.map((item) => item === dialog ? { ...item, props: { ...item.props, contains } } : item), component] };
}

/** Pencereye özel alan bloğu ekler (pencerede en çok bir). Tanım sorgusu panelden seçilir. */
export function addWindowCustomFields(def: ModelDefinition, dialogId: string): { def: ModelDefinition; blockId: string } {
  if (customFieldsOf(def, dialogId)) return { def, blockId: "" };
  const id = freeId(def, "ozelAlanlar");
  const next = addToWindow(def, dialogId, { id, type: "customFieldsBlock", name: id, props: { slot: DIALOG_SLOT, title: "Özel alanlar", columns: 2 } });
  return { def: next, blockId: next === def ? "" : id };
}

/** Pencereye satır tablosu ekler (pencerede en çok bir): list kipi, tek metin sütunu, en çok 200 satır. */
export function addWindowGrid(def: ModelDefinition, dialogId: string): { def: ModelDefinition; gridId: string } {
  if (windowGridOf(def, dialogId)) return { def, gridId: "" };
  const id = freeId(def, "satirlar");
  const next = addToWindow(def, dialogId, { id, type: "editableGrid", name: id, props: {
    slot: DIALOG_SLOT, gridMode: "list", title: "Satırlar", gridColumns: ["kod|Kod|text|required"], maxRows: MAX_WINDOW_GRID_ROWS, addLabel: "Satır ekle" } });
  return { def: next, gridId: next === def ? "" : id };
}

// ---------- ayarlar ----------

export type CustomFieldsPatch = { title?: string; definitionsQuery?: string | null; valuesQuery?: string | null; columns?: 1 | 2 | 3; disabledWhen?: string | null };
export function setCustomFieldsProps(def: ModelDefinition, id: string, patch: CustomFieldsPatch): ModelDefinition {
  if (!def.components.some((component) => component.id === id && component.type === "customFieldsBlock")) return def;
  const props: Record<string, PropValue | undefined> = {};
  if (patch.title !== undefined) props.title = patch.title.trim().slice(0, 120) || undefined;
  if (patch.definitionsQuery !== undefined) props.definitionsQuery = patch.definitionsQuery ?? undefined;
  if (patch.valuesQuery !== undefined) props.valuesQuery = patch.valuesQuery ?? undefined;
  if (patch.columns !== undefined) props.columns = patch.columns;
  if (patch.disabledWhen !== undefined) props.disabledWhen = patch.disabledWhen ?? undefined;
  return patchProps(def, id, props);
}

export type GridPatch = { title?: string; description?: string; addLabel?: string; minRows?: number | null; maxRows?: number; disabledWhen?: string | null;
  /** Satırları sayfanın bir okuma sorgusundan dolduran sorgu kimliği (aynı kodlu sütunlar dolar); null kaldırır. */
  fillQuery?: string | null };
export function setWindowGridProps(def: ModelDefinition, id: string, patch: GridPatch): ModelDefinition {
  const grid = def.components.find((component) => component.id === id && component.type === "editableGrid");
  if (!grid) return def;
  const props: Record<string, PropValue | undefined> = {};
  if (patch.title !== undefined) props.title = patch.title.trim().slice(0, 120) || undefined;
  if (patch.description !== undefined) props.description = patch.description.trim().slice(0, 300) || undefined;
  if (patch.addLabel !== undefined) props.addLabel = patch.addLabel.trim().slice(0, 40) || undefined;
  if (patch.maxRows !== undefined) props.maxRows = Math.max(1, Math.min(MAX_WINDOW_GRID_ROWS, Math.trunc(patch.maxRows) || 1));
  if (patch.minRows !== undefined) props.minRows = patch.minRows === null ? undefined : Math.max(0, Math.min(100, Math.trunc(patch.minRows) || 0));
  if (patch.disabledWhen !== undefined) props.disabledWhen = patch.disabledWhen ?? undefined;
  if (patch.fillQuery !== undefined) props.fillQuery = patch.fillQuery ?? undefined;
  const next = patchProps(def, id, props);
  // minRows en çok maxRows kadar olabilir (sunucu şeması).
  const placed = next.components.find((component) => component.id === id)!;
  return typeof placed.props.minRows === "number" && typeof placed.props.maxRows === "number" && placed.props.minRows > placed.props.maxRows
    ? patchProps(next, id, { minRows: placed.props.maxRows }) : next;
}

// ---------- satır tablosu sütunları (kod|Etiket|tür|kurallar) ----------

export type GridColumnType = "text" | "number" | "date" | "checkbox" | "lookup";
export const GRID_COLUMN_TYPES: [GridColumnType, string][] = [["text", "Metin"], ["number", "Sayı"], ["date", "Tarih"], ["checkbox", "Onay kutusu"], ["lookup", "Seçim (arama)"]];
/** Seçim sütununun seçenek kaynağı: sayfadaki okuma sorgusu, değer ve etiket sütunları. */
export type GridLookup = { query: string; value: string; label: string };
export type GridColumn = {
  code: string; label: string; type: GridColumnType; required: boolean; unique: boolean; readOnly?: boolean; lookup?: GridLookup;
  maxLength?: number; min?: number; max?: number; upperCase?: boolean;
};

const LOOKUP_QUERY = /^[A-Za-z0-9_-]{1,64}$/;
const LOOKUP_COLUMN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Pencere satır tablosunun biçimi: hesap (calc) sütunları ve adım (step) kuralı ayrıştırılmaz (null). */
export function parseGridColumn(item: string): GridColumn | null {
  const parts = item.split("|");
  if (parts.length < 3 || parts.length > 4) return null;
  const [code, label, rawType] = parts;
  let type: GridColumnType;
  let lookup: GridLookup | undefined;
  if (rawType.startsWith("lookup:")) {
    const [query, value, shown, ...rest] = rawType.slice("lookup:".length).split(":");
    if (rest.length > 0 || !LOOKUP_QUERY.test(query ?? "") || !LOOKUP_COLUMN.test(value ?? "") || !LOOKUP_COLUMN.test(shown ?? "")) return null;
    type = "lookup"; lookup = { query, value, label: shown };
  } else if (rawType === "text" || rawType === "number" || rawType === "date" || rawType === "checkbox") type = rawType;
  else return null;
  const column: GridColumn = { code, label, type, required: false, unique: false, ...(lookup ? { lookup } : {}) };
  for (const token of (parts[3] ?? "").split(",").filter(Boolean)) {
    const at = token.indexOf(":");
    const name = at < 0 ? token : token.slice(0, at);
    const value = at < 0 ? "" : token.slice(at + 1);
    if (name === "required") column.required = true;
    else if (name === "unique") column.unique = true;
    else if (name === "readOnly") column.readOnly = true;
    else if (type === "lookup") return null;
    else if (name === "upperCase") column.upperCase = true;
    else if (name === "maxLength" && Number.isFinite(Number(value))) column.maxLength = Number(value);
    else if (name === "min" && Number.isFinite(Number(value))) column.min = Number(value);
    else if (name === "max" && Number.isFinite(Number(value))) column.max = Number(value);
    else return null;
  }
  return column;
}
export function formatGridColumn(column: GridColumn): string {
  const rules = [column.required && "required", column.unique && "unique", column.readOnly && "readOnly",
    column.type === "text" && column.upperCase && "upperCase",
    column.type === "text" && column.maxLength !== undefined && `maxLength:${column.maxLength}`,
    column.type === "number" && column.min !== undefined && `min:${column.min}`,
    column.type === "number" && column.max !== undefined && `max:${column.max}`].filter(Boolean);
  const type = column.type === "lookup" && column.lookup ? `lookup:${column.lookup.query}:${column.lookup.value}:${column.lookup.label}` : column.type;
  return `${column.code}|${column.label}|${type}${rules.length > 0 ? `|${rules.join(",")}` : ""}`;
}
export const gridColumnsOf = (grid: ModelComponent): GridColumn[] => strings(grid.props.gridColumns).flatMap((item) => parseGridColumn(item) ?? []);

/** Sütun listesini yazar (1–8, kodlar benzersiz, etiket dolu); geçersiz liste tanımı değiştirmez. */
export function setGridColumns(def: ModelDefinition, id: string, columns: GridColumn[]): ModelDefinition {
  const codes = new Set(columns.map((column) => column.code));
  if (columns.length < 1 || columns.length > MAX_WINDOW_GRID_COLUMNS || codes.size !== columns.length
    || columns.some((column) => !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(column.code) || column.label.trim() === "" || column.label.length > 60
      || column.type === "lookup" && !(column.lookup && LOOKUP_QUERY.test(column.lookup.query) && LOOKUP_COLUMN.test(column.lookup.value) && LOOKUP_COLUMN.test(column.lookup.label)))) return def;
  return patchProps(def, id, { gridColumns: columns.map(formatGridColumn) });
}
export function addGridColumn(def: ModelDefinition, id: string): ModelDefinition {
  const grid = def.components.find((component) => component.id === id && component.type === "editableGrid");
  if (!grid) return def;
  const columns = gridColumnsOf(grid);
  if (columns.length >= MAX_WINDOW_GRID_COLUMNS) return def;
  let at = columns.length + 1;
  while (columns.some((column) => column.code === `sutun${at}`)) at++;
  return setGridColumns(def, id, [...columns, { code: `sutun${at}`, label: `Sütun ${at}`, type: "text", required: false, unique: false }]);
}

// ---------- kayıt adımı ----------

/** Sahibi (pencere ya da Kayıt kartı) ve kayıt adımlarının sorgu kimlikleri. */
function saveScope(def: ModelDefinition, dialogId: string | null): { ownerId: string | null; steps: string[] } {
  if (dialogId !== null) {
    const dialog = dialogsOf(def.components).find((item) => item.id === dialogId);
    const sequence = strings(dialog?.props.saveSequence);
    return { ownerId: dialog?.id ?? null, steps: sequence.length > 0 ? sequence : text(dialog?.props.saveQuery) ? [text(dialog!.props.saveQuery)] : [] };
  }
  const found = saveSteps(def);
  const owner = found.owner === "bar" ? commandsBar(def) : def.components.find((component) => component.type === "button" && component.props.slot === "actions" && component.props.actionType === "sequence");
  return { ownerId: owner?.id ?? null, steps: found.steps.map((step) => step.queryId) };
}

const bindingOf = (name: string, segment: "degerler" | "satirlar") => `{{${name}.${segment}}}`;
const normalize = (binding: string) => binding.trim().replace(/\s+/g, "");

export type SaveBinding = { bound: boolean; hasOwner: boolean; steps: string[] };
/** Değerlerin / satırların kayıt adımlarından birine bağlı olup olmadığı. `dialogId` null: Kayıt kartı. */
export function saveBinding(def: ModelDefinition, dialogId: string | null, name: string, segment: "degerler" | "satirlar"): SaveBinding {
  const { ownerId, steps } = saveScope(def, dialogId);
  const target = normalize(bindingOf(name, segment));
  const bound = steps.some((id) => def.queries.find((query) => query.id === id)?.parameters.some((parameter) => normalize(parameter.binding) === target));
  return { bound, hasOwner: ownerId !== null && (dialogId !== null ? steps.length > 0 : true), steps };
}

const wantedType = (segment: "degerler" | "satirlar") => (segment === "degerler" ? "map" : "list");

/**
 * "Bağla": önce kayıt adımlarındaki, sonra sayfadaki öteki yazma sorgularındaki `map` (değerler) / `list` (satırlar) parametresini
 * `{{ad.degerler}}` / `{{ad.satirlar}}`'a bağlar; kayıt adımı olmayan sorgu sahibin adımlarına eklenir. Uygun parametre yoksa değişmez.
 */
export function bindToSave(def: ModelDefinition, dialogId: string | null, name: string, segment: "degerler" | "satirlar"): ModelDefinition {
  const { ownerId, steps } = saveScope(def, dialogId);
  if (!ownerId) return def;
  const type = wantedType(segment);
  // Yalnız bağlanmamış ya da artık var olmayan bir bloğa / tabloya bağlı parametre alınır: canlı bir bloğun bağlaması bozulmaz.
  const target = normalize(bindingOf(name, segment));
  const free = (parameter: { type: string; binding: string }) => {
    if (parameter.type !== type) return false;
    const match = /^\{\{([A-Za-z_][A-Za-z0-9_]*)\.(degerler|satirlar)\}\}$/.exec(normalize(parameter.binding));
    if (!match) return normalize(parameter.binding) === "";
    return normalize(parameter.binding) === target || !def.components.some((component) => (component.name ?? component.id) === match[1]);
  };
  const candidates = [...steps.map((id) => def.queries.find((query) => query.id === id)), ...def.queries.filter((query) => !steps.includes(query.id))]
    .filter((query): query is NonNullable<typeof query> => !!query && query.kind !== "read" && query.parameters.some(free));
  const query = candidates[0];
  if (!query) return def;
  const parameter = query.parameters.find(free)!;
  let next: ModelDefinition = { ...def, queries: def.queries.map((item) => item !== query ? item : {
    ...item, parameters: item.parameters.map((p) => p === parameter ? { ...p, binding: bindingOf(name, segment) } : p) }) };
  if (!steps.includes(query.id)) {
    if (steps.length >= MAX_SAVE_STEPS) return def;
    const owner = next.components.find((component) => component.id === ownerId)!;
    const sequence = strings(owner.props.saveSequence).length > 0 ? [...strings(owner.props.saveSequence), query.id] : [...steps, query.id];
    next = patchProps(next, ownerId, { saveQuery: undefined, saveSequence: sequence });
  }
  return next;
}

/** Sunucunun "kayıt eylemi" kuralı: bu sahibin adımı var mı (pencerede saveQuery/saveSequence; kartta Komutlar'ın Kaydet'i). */
export const hasSaveAction = (def: ModelDefinition, dialogId: string | null) => saveScope(def, dialogId).steps.length > 0;
export function candidateExists(def: ModelDefinition, segment: "degerler" | "satirlar"): boolean {
  const type = wantedType(segment);
  return def.queries.some((query) => query.kind !== "read" && query.parameters.some((parameter) => parameter.type === type));
}
