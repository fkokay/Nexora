// Kayıt kartı (alt proje 4, taslak 08) saf modeli. Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Yazılan biçim sunucunun kayıt kartı kurallarına (PageTemplateRules, TenantCustomPageSchema) ve ERP'nin okumasına
// (recordTemplateModel, TenantCustomPage) uyar:
// - kayıt sorgusu `kayit` (kimlik ve ad), tek parametresi `{{sayfa.parametre.<p>}}`'ye bağlı;
// - bölüm `formCard` (`slot: "section"`, en çok 12 alan), alan `input` (`slot: "field"`, `defaultValue` kayıt satırına bağlı);
// - sekmeler `tabs` bileşeninin `"Etiket=id1,id2"` öğeleri (en çok 8 sekme, sekmede en çok 20 blok);
// - Kaydet `sequence` düğmesi, Sil `delete` sorgulu `query` düğmesi, ek eylemler aralarında.
// ERP işlemine dayanan kaynak ve eylemler çağırana `withOperationParameters` ile zenginleştirilmiş gelmelidir; zenginleşmemiş
// öğenin parametreleri boş olduğundan kaynak seçilemez, `blockedReason` taşıyan öğe hiçbir yerde kullanılmaz.
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { parseTabs, tabsValue, type TabEntry } from "../layoutRefs";
import { RECORD_SOURCE_HINT } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import { FIRST_COLUMNS, labelMap, MAX_LIST_COLUMNS, pageParamName, safeLabel, stringList, type ModelComponent, type ModelDefinition, type Usable } from "./listPanelModel";

type PropValue = string | number | boolean | string[];
type ParamType = PageQuery["parameters"][number]["type"];

export const RECORD_QUERY_ID = "kayit";
export const RECORD_SOURCE_NEEDS_KEY = "Bu kaynak tek bir kaydı anahtarıyla okumuyor; Kayıt kartında kullanılamaz.";
export const LINES_SOURCE_NEEDS_KEY = "Bu kaynak bu kaydın satırlarını anahtarıyla okumuyor; satır tablosu olarak kullanılamaz.";
export const RECORD_BULK_ACTION = "Toplu eylemler Kayıt kartında kullanılamaz.";
export const actionMissingField = (name: string) => `Bu eylemin ${name} bilgisi kartta yok.`;
export const KEY_LOCKED_REASON = "Kayıt kodu değiştirilemez.";
export const AUTO_KEY_PLACEHOLDER = "(otomatik)";
export const SAVE_LABEL = "Kaydet";
export const DELETE_LABEL = "Sil";
export const GENERAL_TAB = "Genel";
export const GENERAL_SECTION_TITLE = "Genel bilgiler";
export const OVERFLOW_SECTION_TITLE = "Diğer bilgiler";
export const NEW_SECTION_TITLE = "Yeni bölüm";
export const NEW_TAB_LABEL = "Yeni sekme";
/** Sunucu (`MaxLayoutInputs`) ve ERP (`idList`) bölümde en çok 12 alan okur. */
export const MAX_SECTION_FIELDS = 12;
/** Sunucu ve ERP'nin sekme sınırları (`layoutRefs`): en çok 8 sekme, sekmede en çok 20 blok, etiket 1–40 karakter, `=` ve `,` yok. */
export const MAX_RECORD_TABS = 8;
export const MAX_TAB_BLOCKS = 20;
const MAX_TAB_LABEL = 40;
export const MAX_SUMMARY_SUBTITLE = 3;
export const MAX_SUMMARY_VALUES = 3;
export const LINES_PAGE_SIZE = 10;
const MAX_TEXT = 120;
const MAX_NOTE_TEXT = 1000;
const MAX_DESCRIPTION = 300;

// ---------- genel yardımcılar (listPanelModel ile aynı kurallar) ----------

const RESERVED_NAMES = ["kullanici", "bugun", "sayilar", "onceki", "sayfa", "__proto__", "constructor", "prototype"];
const blockedOf = (item: object): string | undefined => (item as { blockedReason?: string }).blockedReason;
const keyColumnOf = (ds: CatalogDataSource) => ds.columns.find((column) => column.key)?.code;

function takenIds(def: ModelDefinition): Set<string> {
  const taken = new Set<string>();
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const component = item as ModelComponent;
      if (typeof component.id === "string") taken.add(component.id.toLowerCase());
      if (typeof component.name === "string") taken.add(component.name.toLowerCase());
      visit(component.children);
    }
  };
  visit(def.components);
  for (const query of def.queries) { taken.add(query.id.toLowerCase()); taken.add(query.name.toLowerCase()); }
  // Kayıt sorgusunun adı her zaman ayrılmıştır (kaynak seçilmeden önce de); kimlikler kolon adından türediği için sunucunun
  // ayrılmış adları da (TenantCustomPageQueries.ReservedNames, RuntimeReservedNames, ObjectKeyNames) alınamaz.
  for (const name of [RECORD_QUERY_ID, ...RESERVED_NAMES]) taken.add(name);
  return taken;
}
/** Sayfada kullanılmayan ilk ad: base, base2, base3… Kimlik sunucunun bileşen kimliği kuralına uyar. */
function freeId(def: ModelDefinition, base: string, extra: Set<string> = new Set()): string {
  const taken = takenIds(def);
  const clean = base.replace(/[^A-Za-z0-9_]/g, "").slice(0, 56) || "alan";
  const root = /^[A-Za-z_]/.test(clean) ? clean : `k${clean}`;
  for (let index = 1; ; index++) {
    const id = index === 1 ? root : `${root}${index}`;
    if (!taken.has(id.toLowerCase()) && !extra.has(id.toLowerCase())) return id;
  }
}

const withProps = (component: ModelComponent, patch: Record<string, PropValue | undefined>): ModelComponent => {
  const props: Record<string, PropValue> = { ...component.props };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete props[key]; else props[key] = value;
  }
  return { ...component, props };
};
const patchComponent = <D extends ModelDefinition>(def: D, id: string, patch: Record<string, PropValue | undefined>): D =>
  ({ ...def, components: def.components.map((component) => component.id === id ? withProps(component, patch) : component) });
const clamp = (index: number, length: number) => Math.max(0, Math.min(Number.isFinite(index) ? Math.trunc(index) : length, length));
const insertAt = <T,>(list: T[], index: number, item: T) => { const at = clamp(index, list.length); return [...list.slice(0, at), item, ...list.slice(at)]; };

const rowPath = (column: string) => `${RECORD_QUERY_ID}.rows[0].${column}`;
const rowBinding = (column: string) => `{{${rowPath(column)}}}`;
const ROW_BINDING = /^\{\{kayit\.rows\[0\]\.([^\s{}]+)\}\}$/;
const valueBinding = (inputId: string) => `{{${inputId}.value}}`;

// ---------- okuma ----------

const slotOf = (component: ModelComponent) => typeof component.props.slot === "string" ? component.props.slot : "";
const isSection = (component: ModelComponent) => component.type === "formCard" && slotOf(component) === "section";
const isField = (component: ModelComponent) => component.type === "input" && slotOf(component) === "field";
const isLines = (component: ModelComponent) => component.type === "dataTable" && slotOf(component) === "lines";
const isNote = (component: ModelComponent) => component.type === "text" && slotOf(component) === "note";
const isBlock = (component: ModelComponent) => isSection(component) || isLines(component) || isNote(component);

/** Kayıt sorgusu: `kayit`, okuma, katalog veri kaynağına bağlı. */
export function recordQuery(def: ModelDefinition): PageQuery | undefined {
  return def.queries.find((query) => query.id === RECORD_QUERY_ID && query.kind === "read" && typeof query.dataSource === "string");
}
/** Kaydın anahtar kolonu: kayıt sorgusunun tek parametresinin adı (Karar 3: anahtarla aynı adı taşır). */
export function recordKey(def: ModelDefinition): string | null {
  return recordQuery(def)?.parameters[0]?.name ?? null;
}
/** Kayıt sorgusunun bağlandığı sayfa parametresinin bağlaması (`{{sayfa.parametre.<p>}}`). */
const recordParamBinding = (def: ModelDefinition) => recordQuery(def)?.parameters[0]?.binding ?? null;
const recordSourceOf = (def: ModelDefinition, catalog: ActiveCatalog) => {
  const code = recordQuery(def)?.dataSource;
  return code === undefined ? undefined : catalog.dataSources.find((source) => source.code === code);
};

const tabsComponent = (def: ModelDefinition) => def.components.find((component) => component.type === "tabs" && slotOf(component) === "tabs");
/** Kayıt kartının sekmeleri (etiket ve blok kimlikleri, sekmedeki sırayla). */
export function recordTabs(def: ModelDefinition): TabEntry[] {
  return parseTabs(tabsComponent(def)?.props.tabs);
}
function withTabs<D extends ModelDefinition>(def: D, tabs: TabEntry[]): D {
  const owner = tabsComponent(def);
  return owner ? patchComponent(def, owner.id, { tabs: tabsValue(tabs) }) : def;
}
const withoutInTabs = (tabs: TabEntry[], ids: Set<string>) => tabs.map((tab) => ({ ...tab, ids: tab.ids.filter((id) => !ids.has(id)) }));

const findSection = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id && isSection(component));
const findField = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id && isField(component));
const sectionOf = (def: ModelDefinition, inputId: string) => def.components.find((component) => isSection(component) && stringList(component.props.inputs).includes(inputId));

/** Alanın bağlı olduğu kolon (`defaultValue: "{{kayit.rows[0].<kolon>}}"`); alan değilse ya da bağ okunamazsa null. */
export function fieldKey(def: ModelDefinition, inputId: string): string | null {
  const field = findField(def, inputId);
  const value = field && typeof field.props.defaultValue === "string" ? field.props.defaultValue : "";
  return ROW_BINDING.exec(value)?.[1] ?? null;
}
/** Kartta alanı olan kolonlar. */
export function usedColumns(def: ModelDefinition): Set<string> {
  const used = new Set<string>();
  for (const component of def.components) {
    if (!isField(component)) continue;
    const column = fieldKey(def, component.id);
    if (column) used.add(column);
  }
  return used;
}
const fieldForColumn = (def: ModelDefinition, column: string) =>
  def.components.find((component) => isField(component) && fieldKey(def, component.id) === column);

// ---------- eylem okuma ----------

const actionButtons = (def: ModelDefinition) => def.components.filter((component) => component.type === "button" && slotOf(component) === "actions");
const queryById = (def: ModelDefinition, id: unknown) => def.queries.find((query) => query.id === id);
const isSaveButton = (button: ModelComponent) => button.props.actionType === "sequence";
const isDeleteButton = (def: ModelDefinition, button: ModelComponent) =>
  button.props.actionType === "query" && queryById(def, button.props.queryId)?.kind === "delete";
const saveButtonOf = (def: ModelDefinition) => actionButtons(def).find(isSaveButton);
const deleteButtonOf = (def: ModelDefinition) => actionButtons(def).find((button) => isDeleteButton(def, button));
const buttonQueryIds = (button: ModelComponent): string[] =>
  button.props.actionType === "sequence" ? stringList(button.props.saveSequence) : typeof button.props.queryId === "string" ? [button.props.queryId] : [];

/** Kaydet'in bağlı eylem kodları. */
export function saveActions(def: ModelDefinition): { insert: string | null; update: string | null } {
  const button = saveButtonOf(def);
  const queries = button ? buttonQueryIds(button).map((id) => queryById(def, id)) : [];
  return {
    insert: queries.find((query) => query?.kind === "insert")?.action ?? null,
    update: queries.find((query) => query?.kind === "update")?.action ?? null,
  };
}
/** Sil'in bağlı eylem kodu. */
export function deleteAction(def: ModelDefinition): string | null {
  const button = deleteButtonOf(def);
  return button ? queryById(def, button.props.queryId)?.action ?? null : null;
}
/** Kaydet ile Sil arasındaki ek eylemlerin kodları, sırayla. */
export function extraActions(def: ModelDefinition): string[] {
  return actionButtons(def).filter((button) => button.props.actionType === "query" && !isDeleteButton(def, button))
    .flatMap((button) => { const code = queryById(def, button.props.queryId)?.action; return code ? [code] : []; });
}

// ---------- kaynak ----------

/** Karar 3: kaynağın tek parametresi anahtar kolonla aynı adı taşımalı ve anahtardan sayfa parametresi adı türetilebilmeli. */
export function recordSourceUsable(ds: CatalogDataSource): Usable {
  const blocked = blockedOf(ds);
  if (blocked) return { usable: false, reason: blocked };
  const key = keyColumnOf(ds);
  return key && pageParamName(key) && ds.parameters.length === 1 && ds.parameters[0].name === key
    ? { usable: true } : { usable: false, reason: RECORD_SOURCE_NEEDS_KEY };
}

/** Tasarım §5.1: katalog türünden girdi; anahtarın kipi `applyKeyMode` ile yazılır. */
function fieldProps(column: CatalogColumn): Record<string, PropValue> {
  const inputType = column.type === "int" || column.type === "decimal" ? "number" : column.type === "date" ? "date" : column.type === "bool" ? "checkbox" : "text";
  return {
    slot: "field", inputType, label: column.label.trim().slice(0, MAX_TEXT) || column.code, defaultValue: rowBinding(column.code),
    ...(column.type === "text" && column.longText ? { multiline: true } : {}),
    // ERP'de zorunlu onay kutusu işaretlenmeden kaydedilemez; katalogdaki `required` "değer boş olamaz" demektir, kopyalanmaz.
    ...(column.required && column.type !== "bool" ? { required: true } : {}),
    ...(column.type === "text" && column.maxLength !== null ? { maxLength: column.maxLength } : {}),
    ...(column.type === "guid" && !column.key ? { readOnly: true } : {}),
  };
}

const sectionComponent = (id: string, title: string, key: string, inputs: string[]): ModelComponent =>
  ({ id, type: "formCard", name: id, props: { slot: "section", title, columns: 2, inputs, recordKey: rowBinding(key), trackChanges: true } });

/**
 * Anahtar alanı (Global Constraints): Kaydet'in *ekle* eyleminde anahtarla aynı adlı bilgi varsa anahtarı kullanıcı yazar ve
 * alan yalnız var olan kayıtta kilitlenir; yoksa anahtarı sistem üretir, alan salt okunurdur ve "(otomatik)" gösterir.
 */
export function applyKeyMode<D extends ModelDefinition>(def: D): D {
  const key = recordKey(def);
  const field = key ? fieldForColumn(def, key) : undefined;
  if (!key || !field) return def;
  const button = saveButtonOf(def);
  const insert = button ? buttonQueryIds(button).map((id) => queryById(def, id)).find((query) => query?.kind === "insert") : undefined;
  const typed = !!insert?.parameters.some((parameter) => parameter.name === key);
  const patch = typed
    ? { disabledWhen: `${rowPath(key)} != null`, disabledReason: KEY_LOCKED_REASON, readOnly: undefined, placeholder: undefined }
    : { readOnly: true, placeholder: AUTO_KEY_PLACEHOLDER, disabledWhen: undefined, disabledReason: undefined };
  const next = withProps(field, patch);
  return JSON.stringify(next.props) === JSON.stringify(field.props) ? def : patchComponent(def, field.id, patch);
}

/** Hiçbir düğmenin, tablonun ya da Kaydet sırasının kullanmadığı eylem ve satır sorgularını atar (kayıt sorgusu kalır). */
function dropUnusedQueries<D extends ModelDefinition>(def: D, candidates: Set<string>): D {
  const used = new Set<string>([RECORD_QUERY_ID]);
  for (const component of def.components) {
    for (const key of ["query", "queryId", "bulkDeleteQuery"]) if (typeof component.props[key] === "string") used.add(component.props[key] as string);
    for (const id of stringList(component.props.saveSequence)) used.add(id);
  }
  const queries = def.queries.filter((query) => !candidates.has(query.id) || used.has(query.id));
  return queries.length === def.queries.length ? def : { ...def, queries };
}

/** Bileşenleri ve onların kullandığı (artık başka yerde kullanılmayan) sorguları siler; sekmelerden de çıkarır. */
function removeComponents<D extends ModelDefinition>(def: D, ids: Set<string>): D {
  if (ids.size === 0) return def;
  const removed = def.components.filter((component) => ids.has(component.id));
  const candidates = new Set<string>();
  for (const component of removed) {
    for (const key of ["query", "queryId"]) if (typeof component.props[key] === "string") candidates.add(component.props[key] as string);
    for (const id of stringList(component.props.saveSequence)) candidates.add(id);
  }
  const kept = { ...def, components: def.components.filter((component) => !ids.has(component.id)) };
  const tabs = recordTabs(kept);
  const pruned = tabs.some((tab) => tab.ids.some((id) => ids.has(id))) ? withTabs(kept, withoutInTabs(tabs, ids)) : kept;
  return dropUnusedQueries(pruned, candidates);
}

/**
 * Kaynağı seçer: kayıt sorgusunu yazar ve kartı kurar (Karar 2). Kaynak değişirse eski alanlar, bölümler, satır tabloları,
 * notlar ve eylem düğmeleri (sorgularıyla) silinir; özet ve sekme bileşeni ile üst/alt ek alanlar kalır. Aynı kaynak yeniden
 * seçilirse tanım değişmez.
 *
 * Kurulan kart: "Genel" sekmesi, `genel` bölümü (2 kolon, "Genel bilgiler"), her kolon için bir alan (anahtar başta). Bölüm en çok
 * 12 alan alır (sunucu sınırı); fazlası aynı sekmede "Diğer bilgiler" bölümlerine taşar. Özet: başlık anahtar olmayan ilk metin
 * kolonu, alt satır anahtar. Kaydet ve Sil kataloğa göre kendiliğinden bağlanır (Karar 12).
 */
export function chooseRecordSource<D extends ModelDefinition>(def: D, ds: CatalogDataSource, catalog: ActiveCatalog): D {
  if (!recordSourceUsable(ds).usable) return def;
  if (recordQuery(def)?.dataSource === ds.code) return def;
  const key = keyColumnOf(ds)!;
  const parameter = ds.parameters[0];

  // Eski kart: bölüm, alan, satır tablosu, not ve eylem düğmeleri; özetin sahiplendiği düğme listesi de geçersizleşir.
  const stale = new Set(def.components.filter((component) => isBlock(component) || isField(component)
    || (component.type === "button" && slotOf(component) === "actions")).map((component) => component.id));
  let next = removeComponents(def, stale);
  next = { ...next, queries: next.queries.filter((query) => query.id !== RECORD_QUERY_ID) };
  const query: PageQuery = {
    id: RECORD_QUERY_ID, name: RECORD_QUERY_ID, kind: "read", dataSource: ds.code, runOn: "load",
    parameters: [{ name: parameter.name, type: parameter.type as ParamType, binding: `{{sayfa.parametre.${pageParamName(key)}}}` }],
  };
  next = { ...next, queries: [...next.queries, query] };
  if (!next.components.some((component) => component.type === "recordHeader" && slotOf(component) === "summary")) {
    const id = freeId(next, "ozet");
    next = { ...next, components: [{ id, type: "recordHeader", name: id, props: { slot: "summary" } }, ...next.components] };
  }
  if (!tabsComponent(next)) {
    const id = freeId(next, "sekmeler");
    next = { ...next, components: [...next.components, { id, type: "tabs", name: id, props: { slot: "tabs", tabs: [] } }] };
  }
  // Özetin değerleri ve düğmeleri eski kaynağa aitti.
  next = { ...next, components: next.components.map((component) => component.type === "recordHeader" && slotOf(component) === "summary"
    ? withProps(component, { title: undefined, subtitle: undefined, fields: undefined, fieldFormats: undefined, fieldUnits: undefined, buttons: undefined })
    : component) };

  const ordered = [...ds.columns.filter((column) => column.code === key), ...ds.columns.filter((column) => column.code !== key)];
  const sectionIds = [freeId(next, "genel")];
  const fields: ModelComponent[] = [];
  for (const column of ordered) {
    const reserved = new Set([...sectionIds, ...fields.map((field) => field.id)].map((id) => id.toLowerCase()));
    const id = freeId(next, column.code, reserved);
    fields.push({ id, type: "input", name: id, props: fieldProps(column) });
  }
  const chunks: string[][] = [];
  for (let at = 0; at < fields.length; at += MAX_SECTION_FIELDS) chunks.push(fields.slice(at, at + MAX_SECTION_FIELDS).map((field) => field.id));
  if (chunks.length === 0) chunks.push([]);
  while (sectionIds.length < chunks.length) {
    const reserved = new Set([...sectionIds, ...fields.map((field) => field.id)].map((id) => id.toLowerCase()));
    sectionIds.push(freeId(next, "bolum", reserved));
  }
  const sections = chunks.map((inputs, index) => sectionComponent(sectionIds[index], index === 0 ? GENERAL_SECTION_TITLE : OVERFLOW_SECTION_TITLE, key, inputs));
  next = { ...next, components: [...next.components, ...sections, ...fields] };
  next = withTabs(next, [{ label: GENERAL_TAB, ids: sectionIds }]);

  const title = ordered.find((column) => column.code !== key && column.type === "text");
  next = setSummary(next, title?.code ?? key, title ? [key] : [], [], ds.columns);

  // Güncelle ve sil bu kaydı anahtarıyla hedeflemeli: anahtar bilgisi olmayan (ör. zenginleşmemiş ERP işlemi) eylem kendiliğinden bağlanmaz.
  const matching = (kind: CatalogAction["kind"]) => catalog.actions.filter((action) => action.kind === kind && recordActionUsable(next, action).usable
    && (kind === "insert" || action.parameters.some((item) => item.name === key)));
  const inserts = matching("insert"); const updates = matching("update"); const deletes = matching("delete");
  // Karar 12: yalnız tek eşleşme kendiliğinden bağlanır; *ekle* ya da *güncelle* için birden çok aday varsa Kaydet boş kalır.
  if (inserts.length <= 1 && updates.length <= 1 && inserts.length + updates.length > 0) next = setSaveActions(next, inserts[0] ?? null, updates[0] ?? null);
  if (deletes.length === 1) next = setDeleteAction(next, deletes[0]);
  return applyKeyMode(next);
}

// ---------- alanlar ----------

const ABLATIVE_BACK = /[aıou]/;
/** Özel adın ayrılma eki: Kaydet'ten, Sil'den, Onayla'dan. */
function ablative(word: string): string {
  const lower = word.trim().toLocaleLowerCase("tr");
  const vowels = lower.match(/[aıoueiöü]/g);
  const back = vowels ? ABLATIVE_BACK.test(vowels[vowels.length - 1]) : false;
  return `${/[fstkçşhp]$/.test(lower) ? "t" : "d"}${back ? "an" : "en"}`;
}
const buttonName = (button: ModelComponent) => isSaveButton(button) ? SAVE_LABEL
  : (typeof button.props.text === "string" && button.props.text.trim()) || (typeof button.props.label === "string" && button.props.label.trim()) || "Eylem";

/** Alana bir eylem bağlıysa kaldırılamaz; nedeni (eylemin düğme adıyla). Bağlı değilse null. */
export function fieldRemovalBlocked(def: ModelDefinition, inputId: string): string | null {
  const binding = valueBinding(inputId);
  for (const button of def.components) {
    if (button.type !== "button") continue;
    const bound = buttonQueryIds(button).some((id) => queryById(def, id)?.parameters.some((parameter) => parameter.binding.trim() === binding));
    if (!bound) continue;
    const name = buttonName(button);
    return `Bu alan ${name} için gerekli; önce ${name}'${ablative(name)} eylemi kaldırın.`;
  }
  return null;
}

/** Kolonu bölüme alan olarak ekler. Kolon zaten kullanılıyorsa, bölüm yoksa ya da doluysa tanım değişmez. */
export function addField<D extends ModelDefinition>(def: D, column: CatalogColumn, sectionId: string, index: number): D {
  const key = recordKey(def);
  const section = findSection(def, sectionId);
  if (!key || !section || usedColumns(def).has(column.code)) return def;
  const inputs = stringList(section.props.inputs);
  if (inputs.length >= MAX_SECTION_FIELDS) return def;
  const id = freeId(def, column.code);
  const field: ModelComponent = { id, type: "input", name: id, props: fieldProps({ ...column, key: column.code === key }) };
  const next = { ...def, components: [...def.components, field] };
  return applyKeyMode(patchComponent(next, sectionId, { inputs: insertAt(inputs, index, id) }));
}

/** Alanı bir bölüme (aynı bölümde başka sıraya) taşır; alan her zaman tek bir bölüme aittir. Hedef doluysa tanım değişmez. */
export function moveField<D extends ModelDefinition>(def: D, inputId: string, toSectionId: string, index: number): D {
  const from = sectionOf(def, inputId);
  const to = findSection(def, toSectionId);
  if (!from || !to || !findField(def, inputId)) return def;
  const target = stringList(to.props.inputs).filter((id) => id !== inputId);
  if (from.id !== to.id && target.length >= MAX_SECTION_FIELDS) return def;
  const moved = insertAt(target, index, inputId);
  // Son alanı taşınan bölüm silinmez, boş kalır (Review Focus 3).
  const next = from.id === to.id ? def : patchComponent(def, from.id, { inputs: stringList(from.props.inputs).filter((id) => id !== inputId) });
  return patchComponent(next, to.id, { inputs: moved });
}

/** Alanı karttan çıkarır; kolonu sol listede yeniden kullanılabilir olur. Bir eyleme bağlıysa tanım değişmez. */
export function removeField<D extends ModelDefinition>(def: D, inputId: string): D {
  if (!findField(def, inputId) || fieldRemovalBlocked(def, inputId)) return def;
  const section = sectionOf(def, inputId);
  const next = section ? patchComponent(def, section.id, { inputs: stringList(section.props.inputs).filter((id) => id !== inputId) }) : def;
  return { ...next, components: next.components.filter((component) => component.id !== inputId) };
}

// ---------- bölümler ve sekmeler ----------

/** Sekmeye (sonuna) 2 kolonlu boş bir "Yeni bölüm" ekler. Sekme yoksa, doluysa ya da kaynak seçilmemişse kimlik boş döner. */
export function addSection<D extends ModelDefinition>(def: D, tabIndex: number): { def: D; sectionId: string } {
  const key = recordKey(def);
  const tabs = recordTabs(def);
  const tab = tabs[tabIndex];
  if (!key || !tab || tab.ids.length >= MAX_TAB_BLOCKS) return { def, sectionId: "" };
  const sectionId = freeId(def, "bolum");
  const next = { ...def, components: [...def.components, sectionComponent(sectionId, NEW_SECTION_TITLE, key, [])] };
  return { def: withTabs(next, tabs.map((item, index) => index === tabIndex ? { ...item, ids: [...item.ids, sectionId] } : item)), sectionId };
}


/** Bölümü alanlarıyla siler; kolonları sol listede yeniden kullanılabilir olur. Bir alanı eyleme bağlıysa tanım değişmez. */
export function removeSection<D extends ModelDefinition>(def: D, sectionId: string): D {
  const section = findSection(def, sectionId);
  if (!section || sectionRemovalBlocked(def, sectionId)) return def;
  return removeComponents(def, new Set([sectionId, ...stringList(section.props.inputs).filter((id) => findField(def, id))]));
}

export function setSectionColumns<D extends ModelDefinition>(def: D, sectionId: string, columns: 1 | 2 | 3): D {
  if (!findSection(def, sectionId) || ![1, 2, 3].includes(columns)) return def;
  return patchComponent(def, sectionId, { columns });
}

/** Boş başlık yok sayılır. */
export function setSectionTitle<D extends ModelDefinition>(def: D, sectionId: string, title: string): D {
  const clean = title.trim().slice(0, MAX_TEXT);
  if (!findSection(def, sectionId) || !clean) return def;
  return patchComponent(def, sectionId, { title: clean });
}

/** *Ne zaman görünsün*: bugünkü `visibleWhen` biçimi; null ya da boş koşul kaldırır. */
export function setSectionVisibleWhen<D extends ModelDefinition>(def: D, sectionId: string, condition: string | null): D {
  if (!findSection(def, sectionId)) return def;
  const clean = condition?.trim() ?? "";
  return patchComponent(def, sectionId, { visibleWhen: clean || undefined });
}

const tabLabel = (label: string) => label.replace(/[=,]/g, "").trim().slice(0, MAX_TAB_LABEL).trim();

/** "Yeni sekme" ve içinde bir yeni bölüm ekler. Sekme sınırında ya da kaynak seçilmemişse tanım değişmez, sıra -1 döner. */
export function addTab<D extends ModelDefinition>(def: D): { def: D; tabIndex: number } {
  const key = recordKey(def);
  const tabs = recordTabs(def);
  if (!key || !tabsComponent(def) || tabs.length >= MAX_RECORD_TABS) return { def, tabIndex: -1 };
  const labels = new Set(tabs.map((tab) => tab.label));
  let label = NEW_TAB_LABEL;
  for (let index = 2; labels.has(label); index++) label = `${NEW_TAB_LABEL} ${index}`;
  const sectionId = freeId(def, "bolum");
  const next = { ...def, components: [...def.components, sectionComponent(sectionId, NEW_SECTION_TITLE, key, [])] };
  return { def: withTabs(next, [...tabs, { label, ids: [sectionId] }]), tabIndex: tabs.length };
}

/** Etiketten `=` ve `,` atılır, en çok 40 karakter; boş etiket yok sayılır. */
export function renameTab<D extends ModelDefinition>(def: D, tabIndex: number, label: string): D {
  const tabs = recordTabs(def);
  const clean = tabLabel(label);
  if (!tabs[tabIndex] || !clean) return def;
  return withTabs(def, tabs.map((tab, index) => index === tabIndex ? { ...tab, label: clean } : tab));
}

/** Sekmeyi bloklarıyla siler. Son sekme silinemez; bir alanı eyleme bağlı bölüm taşıyorsa tanım değişmez. */
export function removeTab<D extends ModelDefinition>(def: D, tabIndex: number): D {
  const tabs = recordTabs(def);
  const tab = tabs[tabIndex];
  if (!tab || tabs.length <= 1) return def;
  const blocks = tab.ids.map((id) => def.components.find((component) => component.id === id && isBlock(component))).filter((block): block is ModelComponent => !!block);
  if (blocks.some((block) => isSection(block) && sectionRemovalBlocked(def, block.id) !== null)) return def;
  const ids = new Set<string>(tab.ids);
  for (const block of blocks) if (isSection(block)) for (const id of stringList(block.props.inputs)) if (findField(def, id)) ids.add(id);
  const next = withTabs(def, tabs.filter((_, index) => index !== tabIndex));
  return removeComponents(next, new Set([...ids].filter((id) => def.components.some((component) => component.id === id))));
}

// ---------- alan ayarları ----------

/** Danışman kuralı yalnız sıkılaştırabilir: katalogda zorunlu alanın "Zorunlu"su, anahtar alanın "Değiştirilemez"i kilitlidir. */
export function fieldLocks(def: ModelDefinition, inputId: string, catalog: ActiveCatalog): { required: boolean; readOnly: boolean } {
  const column = fieldKey(def, inputId);
  if (!column) return { required: false, readOnly: false };
  const catalogColumn = recordSourceOf(def, catalog)?.columns.find((item) => item.code === column);
  return { required: catalogColumn?.required === true && catalogColumn.type !== "bool", readOnly: catalogColumn?.key === true || column === recordKey(def) };
}

/**
 * Alanın etiket, zorunlu, değiştirilemez, yardım metni ve görünme koşulunu yazar. Kilitli özellik gevşetilemez: katalogda zorunlu
 * alanın `required`'ı kaldırılamaz (katalog verilirse), anahtar alanın değiştirilemezliği kaydın kipinden gelir ve hiç değişmez.
 * Boş etiket yok sayılır; boş yardım metni ve koşul kaldırılır.
 */
export function setFieldProps<D extends ModelDefinition>(def: D, inputId: string,
  patch: { label?: string; required?: boolean; readOnly?: boolean; description?: string; visibleWhen?: string }, catalog?: ActiveCatalog): D {
  if (!findField(def, inputId)) return def;
  const locks = catalog ? fieldLocks(def, inputId, catalog) : { required: false, readOnly: fieldKey(def, inputId) === recordKey(def) };
  const props: Record<string, PropValue | undefined> = {};
  if (patch.label !== undefined && patch.label.trim()) props.label = patch.label.trim().slice(0, MAX_TEXT);
  if (patch.required !== undefined && !(locks.required && !patch.required)) props.required = patch.required ? true : undefined;
  if (patch.readOnly !== undefined && !locks.readOnly) props.readOnly = patch.readOnly ? true : undefined;
  if (patch.description !== undefined) props.description = patch.description.trim().slice(0, MAX_DESCRIPTION) || undefined;
  if (patch.visibleWhen !== undefined) props.visibleWhen = patch.visibleWhen.trim() || undefined;
  return Object.keys(props).length === 0 ? def : patchComponent(def, inputId, props);
}

// ---------- eylemler ----------

/**
 * Karar 12: eylemin her bilgisinin kartta aynı adlı bir alanı olmalı. *Güncelle* ve *sil* (ve ek eylemlerin) anahtar bilgisi
 * kayıt satırına bağlanır, alan istemez; *ekle*'nin anahtar bilgisi anahtar alanına bağlanır. Toplu eylem kullanılamaz.
 */
export function recordActionUsable(def: ModelDefinition, action: CatalogAction): Usable {
  const blocked = blockedOf(action);
  if (blocked) return { usable: false, reason: blocked };
  const key = recordKey(def);
  if (!key) return { usable: false, reason: RECORD_SOURCE_HINT };
  if (action.target === "bulk") return { usable: false, reason: RECORD_BULK_ACTION };
  const missing = action.parameters.find((parameter) => !(parameter.name === key && action.kind !== "insert") && !fieldForColumn(def, parameter.name));
  return missing ? { usable: false, reason: actionMissingField(missing.name) } : { usable: true };
}

export function actionQuery(def: ModelDefinition, action: CatalogAction, reserved: Set<string> = new Set()): PageQuery {
  const key = recordKey(def);
  const id = freeId(def, action.code, reserved);
  return {
    id, name: id, kind: action.kind, action: action.code, runOn: "manual",
    parameters: action.parameters.map((parameter) => ({
      name: parameter.name, type: parameter.type as ParamType,
      binding: parameter.name === key && action.kind !== "insert" ? rowBinding(key) : valueBinding(fieldForColumn(def, parameter.name)!.id),
    })),
  };
}

/** İşlem çubuğu sırası: Kaydet, ek eylemler (sırasıyla), Sil. Öteki bileşenlerin yeri değişmez. */
function orderActions<D extends ModelDefinition>(def: D): D {
  const positions: number[] = [];
  const buttons: ModelComponent[] = [];
  def.components.forEach((component, index) => {
    if (component.type === "button" && slotOf(component) === "actions") { positions.push(index); buttons.push(component); }
  });
  const rank = (button: ModelComponent) => isSaveButton(button) ? 0 : isDeleteButton(def, button) ? 2 : 1;
  const sorted = buttons.map((button, index) => ({ button, index })).sort((a, b) => rank(a.button) - rank(b.button) || a.index - b.index).map((item) => item.button);
  if (sorted.every((button, index) => button === buttons[index])) return def;
  const components = [...def.components];
  positions.forEach((position, index) => { components[position] = sorted[index]; });
  return { ...def, components };
}

const confirmProps = (action: CatalogAction): Record<string, PropValue> => action.confirmText ? { confirmEnabled: true, confirmText: action.confirmText } : {};

/**
 * Kaydet: kayıt sorgusunda satır yoksa *ekle*, varsa *güncelle* (`saveSequence` + `sequenceWhen`). İkisi de null ise Kaydet
 * kalkar. Türü yanlış ya da kullanılamayan eylem verilirse tanım değişmez. Anahtar alanının kipi yeniden yazılır.
 */
export function setSaveActions<D extends ModelDefinition>(def: D, insert: CatalogAction | null, update: CatalogAction | null): D {
  const key = recordKey(def);
  if (!key) return def;
  if (insert && (insert.kind !== "insert" || !recordActionUsable(def, insert).usable)) return def;
  if (update && (update.kind !== "update" || !recordActionUsable(def, update).usable)) return def;
  const old = saveButtonOf(def);
  // Ana ekle/güncelle dışındaki adımlar (Komutlar › Kaydet'te eklenenler) koşulları ve "hata olursa dur"la korunur.
  // Sınır: ana adımlar ile eklenen adımlar biçimde işaretli değildir, yalnız sırayla ayrılır: dizideki ilk *ekle* türü adım ana
  // ekle, ilk *güncelle* türü adım ana güncelle sayılır. Örneğin `setSaveActions(def, ekle, null)` sonrası eklenmiş bir güncelle
  // adımı ana güncelle olarak okunur ("Var olan kayıtta" seçimine geçer) ve o seçim değişince yerine yenisi yazılır. Ayırmak
  // biçimde bir işaret gerektirir.
  const oldQueries = old ? buttonQueryIds(old).map((id) => queryById(def, id)) : [];
  const mainIds = new Set([oldQueries.find((query) => query?.kind === "insert")?.id, oldQueries.find((query) => query?.kind === "update")?.id]);
  const chosen = new Set([insert?.code, update?.code].filter((code): code is string => !!code));
  const extras = oldQueries.filter((query): query is PageQuery => !!query && !mainIds.has(query.id) && !(query.action && chosen.has(query.action)));
  const oldWhen = old ? Object.fromEntries(stringList(old.props.sequenceWhen).flatMap((item) => {
    const at = item.indexOf("=");
    return at > 0 ? [[item.slice(0, at), item.slice(at)]] : [];
  })) as Record<string, string> : {};
  let next = old ? removeComponents(def, new Set([old.id])) : def;
  next = { ...next, queries: [...next.queries, ...extras.filter((query) => !next.queries.includes(query))] };
  if (insert || update || extras.length > 0) {
    const insertQuery = insert ? actionQuery(next, insert) : null;
    const updateQuery = update ? actionQuery(next, update, new Set(insertQuery ? [insertQuery.id.toLowerCase()] : [])) : null;
    const steps = [insertQuery, updateQuery].filter((query): query is PageQuery => !!query);
    const reserved = new Set(steps.map((query) => query.id.toLowerCase()));
    const buttonId = freeId(next, "kaydet", reserved);
    const button: ModelComponent = { id: buttonId, type: "button", name: buttonId, props: {
      slot: "actions", text: SAVE_LABEL, actionType: "sequence", saveSequence: [...steps, ...extras].map((query) => query.id),
      sequenceWhen: [
        ...(insertQuery ? [`${insertQuery.id}=${rowPath(key)} == null`] : []),
        ...(updateQuery ? [`${updateQuery.id}=${rowPath(key)} != null`] : []),
        ...extras.flatMap((query) => query.id in oldWhen ? [`${query.id}${oldWhen[query.id]}`] : []),
      ],
      ...(old?.props.stopOnError === false ? { stopOnError: false } : {}),
    } };
    next = { ...next, queries: [...next.queries, ...steps], components: [...next.components, button] };
  }
  return applyKeyMode(orderActions(next));
}

/** Sil: `delete` eylemini çalıştıran düğme; null Sil'i kaldırır. Türü yanlış ya da kullanılamayan eylemde tanım değişmez. */
export function setDeleteAction<D extends ModelDefinition>(def: D, action: CatalogAction | null): D {
  if (!recordKey(def)) return def;
  if (action && (action.kind !== "delete" || !recordActionUsable(def, action).usable)) return def;
  const old = deleteButtonOf(def);
  let next = old ? removeComponents(def, new Set([old.id])) : def;
  if (action) {
    const query = actionQuery(next, action);
    const buttonId = freeId(next, "sil", new Set([query.id.toLowerCase()]));
    const button: ModelComponent = { id: buttonId, type: "button", name: buttonId, props: {
      slot: "actions", text: DELETE_LABEL, actionType: "query", queryId: query.id, ...confirmProps(action) } };
    next = { ...next, queries: [...next.queries, query], components: [...next.components, button] };
  }
  return orderActions(next);
}

/** Ek eylem: Kaydet ile Sil arasına bir sorgu düğmesi. Silme eylemi (Sil'in yeri) ve zaten eklenmiş eylem tanımı değiştirmez. */
export function addExtraAction<D extends ModelDefinition>(def: D, action: CatalogAction): D {
  if (action.kind === "delete" || !recordActionUsable(def, action).usable || extraActions(def).includes(action.code)) return def;
  const query = actionQuery(def, action);
  const buttonId = freeId(def, `${action.code}Dugmesi`, new Set([query.id.toLowerCase()]));
  const button: ModelComponent = { id: buttonId, type: "button", name: buttonId, props: {
    slot: "actions", text: action.label.trim().slice(0, MAX_TEXT) || action.code, actionType: "query", queryId: query.id,
    ...confirmProps(action), refreshQueries: [RECORD_QUERY_ID] } };
  return orderActions({ ...def, queries: [...def.queries, query], components: [...def.components, button] });
}

export function removeExtraAction<D extends ModelDefinition>(def: D, code: string): D {
  const ids = new Set(actionButtons(def).filter((button) => button.props.actionType === "query" && !isDeleteButton(def, button)
    && queryById(def, button.props.queryId)?.action === code).map((button) => button.id));
  return removeComponents(def, ids);
}

// ---------- özet ----------

/** Kayıt özeti: başlık bir kolon, alt satır en çok 3 kolon (` · ` ile), en çok 3 değer (etiketler tekil). Boş başlık kaldırılır. */
export function setSummary<D extends ModelDefinition>(def: D, title: string, subtitle: string[], values: { column: string; label: string }[],
  columns: CatalogColumn[] = []): D {
  const summary = def.components.find((component) => component.type === "recordHeader" && slotOf(component) === "summary");
  if (!summary) return def;
  // Sayı ve tarih kolonlarının değeri ERP'de biçimlenir (sunucu: Etiket=number|money|date|datetime|text). Kolon tipi bilinmiyorsa eski biçim korunur.
  const previous = new Map(stringList(summary.props.fieldFormats).map((item) => { const at = item.lastIndexOf("="); return [item.slice(0, at), item.slice(at + 1)] as const; }));
  const labels = new Set<string>();
  const formats: string[] = [];
  const fields = values.flatMap((value) => {
    const label = safeLabel(value.label, value.column);
    if (!value.column || labels.has(label) || labels.size >= MAX_SUMMARY_VALUES) return [];
    labels.add(label);
    const column = columns.find((item) => item.code === value.column);
    const format = column ? summaryFormat(column.type) : previous.get(label);
    if (format) formats.push(`${label}=${format}`);
    return [`${label}=${rowBinding(value.column)}`];
  });
  const sub = subtitle.filter((column) => column).slice(0, MAX_SUMMARY_SUBTITLE).map(rowBinding).join(" · ");
  return patchComponent(def, summary.id, { title: title ? rowBinding(title) : undefined, subtitle: sub || undefined, fields: fields.length > 0 ? fields : undefined,
    fieldFormats: formats.length > 0 ? formats : undefined });
}

/** Özet değerinin ERP biçimi: sayı kolonları `number` (para birimi eklenmez), tarih `date`; öteki ham yazılır. */
function summaryFormat(type: string): string | null {
  return type === "int" || type === "decimal" ? "number" : type === "date" ? "date" : type === "datetime" ? "datetime" : null;
}

/** Bir kartın parçasının (bölüm, alan, satır tablosu, not) yer aldığı sekme; kartın parçası değilse ya da hiçbir sekmede değilse -1. */
export function recordPartTab(def: ModelDefinition, id: string): number {
  const owner = sectionOf(def, id)?.id ?? id;
  return recordTabs(def).findIndex((tab) => tab.ids.includes(owner));
}

/** Bölüm kaldırılamıyorsa nedeni (alanlarından biri bir eyleme bağlıysa, o alanın etiketiyle); yoksa null. */
export function sectionRemovalBlocked(def: ModelDefinition, sectionId: string): string | null {
  const section = findSection(def, sectionId);
  if (!section) return null;
  for (const input of stringList(section.props.inputs)) {
    if (fieldRemovalBlocked(def, input) === null) continue;
    const field = findField(def, input);
    const label = (typeof field?.props.label === "string" && field.props.label.trim()) || input;
    const binding = valueBinding(input);
    const button = def.components.find((item) => item.type === "button"
      && buttonQueryIds(item).some((id) => queryById(def, id)?.parameters.some((parameter) => parameter.binding.trim() === binding)));
    const name = button ? buttonName(button) : SAVE_LABEL;
    return `Bu bölümdeki "${label}" alanı ${name} için gerekli; önce ${name}'${ablative(name)} eylemi kaldırın.`;
  }
  return null;
}

// ---------- satır tablosu ve not ----------

/** Satır tablosu kaynağı: kaydın anahtarıyla aynı adlı tek parametre ister. */
export function linesSourceUsable(def: ModelDefinition, ds: CatalogDataSource): Usable {
  const blocked = blockedOf(ds);
  if (blocked) return { usable: false, reason: blocked };
  const key = recordKey(def);
  if (!key) return { usable: false, reason: RECORD_SOURCE_HINT };
  return ds.parameters.length === 1 && ds.parameters[0].name === key ? { usable: true } : { usable: false, reason: LINES_SOURCE_NEEDS_KEY };
}

function addBlock<D extends ModelDefinition>(def: D, tabIndex: number, index: number, block: ModelComponent, queries: PageQuery[] = []): D {
  const tabs = recordTabs(def);
  const tab = tabs[tabIndex];
  if (!tab || tab.ids.length >= MAX_TAB_BLOCKS) return def;
  const next = { ...def, queries: [...def.queries, ...queries], components: [...def.components, block] };
  return withTabs(next, tabs.map((item, at) => at === tabIndex ? { ...item, ids: insertAt(item.ids, index, block.id) } : item));
}

/** Satır tablosu: parametresi kaydın sayfa parametresine bağlı okuma sorgusu, ilk 6 kolon, sayfa başına 10. */
export function addLines<D extends ModelDefinition>(def: D, ds: CatalogDataSource, tabIndex: number, index: number): D {
  const binding = recordParamBinding(def);
  if (!linesSourceUsable(def, ds).usable || !binding) return def;
  const queryId = freeId(def, ds.code);
  const query: PageQuery = { id: queryId, name: queryId, kind: "read", dataSource: ds.code, runOn: "load",
    parameters: [{ name: ds.parameters[0].name, type: ds.parameters[0].type as ParamType, binding }] };
  const tableId = freeId(def, "tablo", new Set([queryId.toLowerCase()]));
  const columns = ds.columns.slice(0, FIRST_COLUMNS);
  const table: ModelComponent = { id: tableId, type: "dataTable", name: tableId, props: {
    slot: "lines", title: ds.label.trim().slice(0, MAX_TEXT) || ds.code, query: queryId, pageSize: LINES_PAGE_SIZE,
    columns: columns.map((column) => column.code), columnLabels: columns.map((column) => `${column.code}=${safeLabel(column.label, column.code)}`),
  } };
  return addBlock(def, tabIndex, index, table, [query]);
}

/** Açıklama metni: sekmede tam genişlikte ayrı bir blok (Karar 1). Boş metin yok sayılır. */
export function addNote<D extends ModelDefinition>(def: D, tabIndex: number, index: number, text: string): D {
  const clean = text.trim().slice(0, MAX_NOTE_TEXT);
  if (!clean || !recordKey(def)) return def;
  const id = freeId(def, "aciklama");
  return addBlock(def, tabIndex, index, { id, type: "text", name: id, props: { slot: "note", text: clean } });
}

/** Bölümü, satır tablosunu ya da notu bir sekmeye (aynı sekmede başka sıraya) taşır. Hedef doluysa tanım değişmez. */
export function moveBlock<D extends ModelDefinition>(def: D, blockId: string, tabIndex: number, index: number): D {
  const tabs = recordTabs(def);
  const from = tabs.findIndex((tab) => tab.ids.includes(blockId));
  const target = tabs[tabIndex];
  if (from < 0 || !target || !def.components.some((component) => component.id === blockId && isBlock(component))) return def;
  const rest = target.ids.filter((id) => id !== blockId);
  if (from !== tabIndex && rest.length >= MAX_TAB_BLOCKS) return def;
  return withTabs(def, tabs.map((tab, at) => at === tabIndex ? { ...tab, ids: insertAt(rest, index, blockId) }
    : { ...tab, ids: tab.ids.filter((id) => id !== blockId) }));
}

/** Satır tablosunun adı (başlık), kolonları (en çok 20, sırayla; etiketler birleşir), sayfa başına (10/25) ve boş liste metni. */
export function setLinesProps<D extends ModelDefinition>(def: D, tableId: string,
  patch: { name?: string; columns?: string[]; labels?: Record<string, string>; pageSize?: 10 | 25; emptyText?: string }): D {
  const table = def.components.find((component) => component.id === tableId && isLines(component));
  if (!table) return def;
  const props: Record<string, PropValue | undefined> = {};
  if (patch.name !== undefined) props.title = patch.name.trim().slice(0, MAX_TEXT) || undefined;
  if (patch.columns !== undefined || patch.labels !== undefined) {
    const chosen = (patch.columns ?? stringList(table.props.columns)).slice(0, MAX_LIST_COLUMNS);
    const merged = { ...labelMap(table.props.columnLabels), ...patch.labels };
    const columnLabels = chosen.filter((code) => merged[code] !== undefined).map((code) => `${code}=${safeLabel(merged[code], code)}`);
    props.columns = chosen;
    props.columnLabels = columnLabels.length > 0 ? columnLabels : undefined;
  }
  if (patch.pageSize === 10 || patch.pageSize === 25) props.pageSize = patch.pageSize;
  if (patch.emptyText !== undefined) props.emptyText = patch.emptyText.trim().slice(0, MAX_TEXT) || undefined;
  return Object.keys(props).length === 0 ? def : patchComponent(def, tableId, props);
}

/** Boş metin yok sayılır. */
export function setNoteText<D extends ModelDefinition>(def: D, noteId: string, text: string): D {
  const clean = text.trim().slice(0, MAX_NOTE_TEXT);
  if (!clean || !def.components.some((component) => component.id === noteId && isNote(component))) return def;
  return patchComponent(def, noteId, { text: clean });
}

/** Bloğu siler: bölüm `removeSection` kuralıyla, satır tablosu sorgusuyla, not tek başına. */
export function removeBlock<D extends ModelDefinition>(def: D, blockId: string): D {
  const block = def.components.find((component) => component.id === blockId && isBlock(component));
  if (!block) return def;
  return isSection(block) ? removeSection(def, blockId) : removeComponents(def, new Set([blockId]));
}

// ---------- katalog denetimi ----------

/** Review Focus 2: kartta alanı olan ama kayıt kaynağında (ya da katalogda kaynağın kendisi) artık olmayan kolonlar. */
export function missingRecordColumns(def: ModelDefinition, catalog: ActiveCatalog): string[] {
  const source = recordSourceOf(def, catalog);
  const columns = new Set(source?.columns.map((column) => column.code) ?? []);
  return [...usedColumns(def)].filter((column) => !columns.has(column));
}
