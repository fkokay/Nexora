// Kalıplı sayfanın Komutlar'ı (5b-2a, taslak 11) saf modeli. Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Biçim (Karar 1): Liste, Kayıt kartı ve Serbest kalıbında en çok bir üst düzey `actionBar`, `props.slot: "commands"`; ayarları
// eski işlem çubuğuyla aynı ad ve değerdedir. Çubuğa yazan her işlev `patchBarCommands` üzerinden yazar (eski düğme bağı
// kalkınca artık kullanılmayan düğme de silinir).
// Kayıt kartında Kaydet ve Sil'in "sahibi" (Karar 7): çubukta `saveQuery`/`saveSequence` (`deleteQuery`) varsa çubuk, yoksa
// kartın Kaydet (Sil) düğmesi. Danışman adımları katalog eylemi olarak ekler; standarttan gelen ham sorgu adımları korunur.
import type { CatalogAction } from "../catalogClient";
import { patchBarCommands, barModes, type Patch } from "../barCommands";
import { getCommandCondition, isCommandHidden, setCommandCondition, setCommandHidden, type BarCommandId } from "../barLook";
import { readPageTemplate } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import { fromConsultantText, type FieldToken } from "./consultantText";
import { actionUsable, freeId, stringList, tableName, type ModelComponent, type ModelDefinition } from "./listPanelModel";
import { actionQuery, applyKeyMode, recordActionUsable, recordKey, recordQuery, setDeleteAction } from "./recordModel";

type PropValue = string | number | boolean | string[];

export const COMMANDS_SLOT = "commands";
export const COMMANDS_ID = "komutlar";
/** Sunucunun kayıt dizisi sınırı (`MaxSequenceSteps`). */
const MAX_STEPS = 8;

export type TemplateCommandId = "new" | "open" | "save" | "saveNew" | "delete" | "refresh" | "filter" | "print" | "export";
type CommandRow = { id: TemplateCommandId; label: string; key: string };

const LIST_ROWS: CommandRow[] = [
  { id: "new", label: "Yeni", key: "F2" }, { id: "open", label: "Düzenle · Görüntüle", key: "Enter" }, { id: "save", label: "Kaydet", key: "Ctrl+S" },
  { id: "delete", label: "Sil", key: "Ctrl+Del" }, { id: "refresh", label: "Yenile", key: "F5" }, { id: "filter", label: "Filtre", key: "Ctrl+F" },
  { id: "print", label: "Yazdır", key: "Ctrl+P" }, { id: "export", label: "Excel", key: "Ctrl+E" },
];
/** Komutlar bölümünün satırları (taslak 11 sırası, kısayollarıyla). */
export const TEMPLATE_COMMAND_ROWS: Record<"list" | "record" | "free", CommandRow[]> = {
  record: [
    { id: "new", label: "Yeni", key: "F2" }, { id: "save", label: "Kaydet", key: "Ctrl+S" }, { id: "saveNew", label: "Kaydet ve yeni", key: "Ctrl+F2" },
    { id: "delete", label: "Sil", key: "Ctrl+Del" }, { id: "refresh", label: "Yenile", key: "F5" }, { id: "print", label: "Yazdır", key: "Ctrl+P" },
  ],
  list: LIST_ROWS,
  free: LIST_ROWS,
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const slotOf = (component: ModelComponent) => (typeof component.props.slot === "string" ? component.props.slot : "");
const isRecordPage = (def: ModelDefinition) => readPageTemplate(def.template)?.name === "record";

// ---------- çubuk ----------

/** Sayfanın Komutlar çubuğu: `commands` yerindeki üst düzey `actionBar`; yoksa null. */
export function commandsBar(def: ModelDefinition): ModelComponent | null {
  return def.components.find((component) => component.type === "actionBar" && slotOf(component) === COMMANDS_SLOT) ?? null;
}

/** Çubuk yoksa boş bir Komutlar çubuğu ekler (kimlik `komutlar`, alınmışsa `komutlar2`…); varsa tanım aynen döner. */
export function ensureCommandsBar<D extends ModelDefinition>(def: D): { def: D; barId: string } {
  const bar = commandsBar(def);
  if (bar) return { def, barId: bar.id };
  const id = freeId(def, COMMANDS_ID);
  return { def: { ...def, components: [...def.components, { id, type: "actionBar", props: { slot: COMMANDS_SLOT } }] }, barId: id };
}

const barProps = (def: ModelDefinition): Record<string, PropValue> => commandsBar(def)?.props ?? {};

/** Çubuğu (gerekirse kurarak) yamalar; undefined değer anahtarı siler. */
function patchBar<D extends ModelDefinition>(def: D, patch: Patch): D {
  const { def: withBar, barId } = ensureCommandsBar(def);
  return patchBarCommands(withBar, barId, patch);
}
/** Çubuk varsa yamalar; yoksa tanım aynen döner (silmek için çubuk kurulmaz). */
function patchExistingBar<D extends ModelDefinition>(def: D, patch: Patch): D {
  const bar = commandsBar(def);
  return bar ? patchBarCommands(def, bar.id, patch) : def;
}

// ---------- göz ve "ne zaman" ----------

/** Komut çubukta gösteriliyor mu: `hiddenCommands`'ta değil; Kaydet ve yeni için `saveAndNew: true`. Çubuksuz sayfa boş çubuk sayılır. */
export function commandShown(def: ModelDefinition, id: TemplateCommandId): boolean {
  const props = barProps(def);
  return id === "saveNew" ? props.saveAndNew === true : !isCommandHidden(props.hiddenCommands, id);
}

/** Kaydet ve yeni açılabilir mi: sayfada bir Kaydet (çubukta ya da kartın düğmesinde) ve çubukta bir Yeni komutu var. */
function saveNewPossible(def: ModelDefinition): boolean {
  const mode = barModes(barProps(def)).new;
  return saveOwner(def) !== null && (mode === "clear" || mode === "page" || mode === "dialog" || mode === "button");
}

/**
 * Gözü çevirir. Gizlenen komutun ayarları (sorgu, hedef, onay metni…) korunur; göz açılınca geri gelir. Kaydet ve yeni,
 * Kaydet ya da Yeni komutu yokken açılmaz (sunucunun `saveAndNew` kuralı); tanım değişmez.
 */
export function toggleCommand<D extends ModelDefinition>(def: D, id: TemplateCommandId): D {
  const shown = commandShown(def, id);
  if (id === "saveNew") return shown ? patchExistingBar(def, { saveAndNew: undefined }) : saveNewPossible(def) ? patchBar(def, { saveAndNew: true }) : def;
  return patchBar(def, { hiddenCommands: setCommandHidden(barProps(def).hiddenCommands, id as BarCommandId, shown) });
}

export type WhenChoice = "always" | "new" | "edit" | "cond";

/** Kaydın yeni olduğu koşulu (`kayit.rows[0].<anahtar> == null`); kayıt sorgusu yoksa null. */
function recordCondition(def: ModelDefinition, isNew: boolean): string | null {
  const query = recordQuery(def);
  const key = recordKey(def);
  return query && key ? `${query.name}.rows[0].${key} ${isNew ? "==" : "!="} null` : null;
}

export function commandWhenChoice(def: ModelDefinition, id: TemplateCommandId): { choice: WhenChoice; condition: string | null } {
  const condition = getCommandCondition(barProps(def).commandWhen, id) ?? null;
  if (condition === null) return { choice: "always", condition: null };
  if (condition === recordCondition(def, true)) return { choice: "new", condition };
  if (condition === recordCondition(def, false)) return { choice: "edit", condition };
  return { choice: "cond", condition };
}

/**
 * "Ne zaman görünsün": `always` koşulu siler; `new`/`edit` kayıt anahtarı koşulunu yazar (kayıt sorgusu yoksa tanım değişmez);
 * `cond` kural kurucunun ifadesini yazar (boş ifade koşulu siler).
 */
export function setCommandWhen<D extends ModelDefinition>(def: D, id: TemplateCommandId, choice: WhenChoice, condition?: string): D {
  const value = choice === "always" ? undefined : choice === "cond" ? condition?.trim() || undefined : recordCondition(def, choice === "new");
  if (value === null) return def;
  if (value === undefined && !commandsBar(def)) return def;
  return patchBar(def, { commandWhen: setCommandCondition(barProps(def).commandWhen, id, value) });
}

// ---------- Kaydet ----------

export type StepOwner = "bar" | "button";
export type SaveStep = { queryId: string; label: string; when: string | null; raw: boolean };

const queryById = (def: ModelDefinition, id: string) => def.queries.find((query) => query.id === id);
/** Katalog eylemine bağlı sorgu (ham SQL ya da ERP işlemi değil). */
const isCatalogStep = (query: PageQuery | undefined) => typeof query?.action === "string" && query.action !== "";

const parseWhen = (value: unknown): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const item of stringList(value)) {
    const at = item.indexOf("=");
    if (at > 0 && !(item.slice(0, at) in result)) result[item.slice(0, at)] = item.slice(at + 1);
  }
  return result;
};

/** Kayıt kartının Kaydet düğmesi: `actions` yerindeki kayıt dizisi (`sequence`) düğmesi. Yalnız Kayıt kartında. */
const saveButtonOf = (def: ModelDefinition) => isRecordPage(def)
  ? def.components.find((component) => component.type === "button" && slotOf(component) === "actions" && component.props.actionType === "sequence")
  : undefined;
const barSaves = (props: Record<string, PropValue>) => text(props.saveQuery) !== "" || stringList(props.saveSequence).length > 0;

type SaveOwner = { owner: StepOwner; component: ModelComponent; steps: string[] } | null;
function saveOwner(def: ModelDefinition): SaveOwner {
  const bar = commandsBar(def);
  if (bar && barSaves(bar.props)) {
    const sequence = stringList(bar.props.saveSequence);
    return { owner: "bar", component: bar, steps: sequence.length > 0 ? sequence : [text(bar.props.saveQuery)] };
  }
  const button = saveButtonOf(def);
  return button ? { owner: "button", component: button, steps: stringList(button.props.saveSequence) } : null;
}

/**
 * Kaydet'in adımları. Sahip: çubukta `saveQuery`/`saveSequence` varsa çubuk, yoksa kartın Kaydet düğmesi. `label`: katalog
 * adımında eylem kodu (panel kataloğun etiketini gösterir), ham adımda sorgunun adı. `raw`: katalog eylemine bağlı olmayan sorgu.
 * `stopOnError` varsayılanı açıktır (yalnız `false` yazılır).
 */
export function saveSteps(def: ModelDefinition): { owner: StepOwner | null; steps: SaveStep[]; stopOnError: boolean } {
  const owner = saveOwner(def);
  if (!owner) return { owner: null, steps: [], stopOnError: true };
  const when = parseWhen(owner.component.props.sequenceWhen);
  const steps = owner.steps.map((queryId) => {
    const query = queryById(def, queryId);
    const raw = !isCatalogStep(query);
    return { queryId, label: raw ? query?.name || queryId : query!.action!, when: when[queryId] ?? null, raw };
  });
  return { owner: owner.owner, steps, stopOnError: owner.component.props.stopOnError !== false };
}

/** Sorgunun hâlâ bir bileşen tarafından kullanılıp kullanılmadığı (tekil değer ya da liste öğesi). */
const queryUsed = (def: ModelDefinition, id: string) => def.components.some((component) => Object.values(component.props)
  .some((value) => value === id || Array.isArray(value) && value.includes(id)));
function dropQueryIfUnused<D extends ModelDefinition>(def: D, id: string | null): D {
  if (!id || id === recordQuery(def)?.id || queryUsed(def, id)) return def;
  return def.queries.some((query) => query.id === id) ? { ...def, queries: def.queries.filter((query) => query.id !== id) } : def;
}
const patchComponent = <D extends ModelDefinition>(def: D, id: string, patch: Record<string, PropValue | undefined>): D => ({
  ...def,
  components: def.components.map((component) => {
    if (component.id !== id) return component;
    const props: Record<string, PropValue> = { ...component.props };
    for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete props[key]; else props[key] = value; }
    return { ...component, props };
  }),
});

/** Sahibin dizisini yazar: adımlar, koşullar (yalnız dizideki adımlar için), "hata olursa dur"; boş dizide üçü de kalkar. */
function sequencePatch(steps: string[], when: Record<string, string>, stopOnError: boolean): Record<string, PropValue | undefined> {
  const conditions = steps.filter((id) => id in when).map((id) => `${id}=${when[id]}`);
  return steps.length === 0 ? { saveQuery: undefined, saveSequence: undefined, sequenceWhen: undefined, stopOnError: undefined } : {
    saveQuery: undefined, saveSequence: steps, sequenceWhen: conditions.length > 0 ? conditions : undefined, stopOnError: stopOnError ? undefined : false,
  };
}
/** Yamanın yalnız değer taşıyan anahtarları (yeni bileşende `undefined` anahtar kalmasın). */
const defined = (patch: Record<string, PropValue | undefined>): Record<string, PropValue> =>
  Object.fromEntries(Object.entries(patch).filter((entry): entry is [string, PropValue] => entry[1] !== undefined));
function writeSequence<D extends ModelDefinition>(def: D, owner: NonNullable<SaveOwner>, steps: string[], when: Record<string, string>, stopOnError: boolean): D {
  const patch = sequencePatch(steps, when, stopOnError);
  if (owner.owner === "bar") return patchBarCommands(def, owner.component.id, patch);
  // Adımı kalmayan Kaydet düğmesi kalkar (`setSaveActions(null, null)` gibi).
  if (steps.length === 0) return { ...def, components: def.components.filter((component) => component.id !== owner.component.id) };
  return patchComponent(def, owner.component.id, patch);
}

/**
 * Sahibin dizisine katalog eylemi adımı ekler. Kayıt kartında *ekle* adımı yalnız yeni kayıtta, *güncelle* adımı yalnız var olan
 * kayıtta çalışır (Kaydet düğmesinin kuralı). Sahip yoksa kartın Kaydet düğmesi kurulur. Kayıt kartı olmayan sayfada, kartta
 * kullanılamayan, silme türünde, zaten eklenmiş eylemde ya da 8 adım sınırında tanım değişmez.
 */
export function addSaveStep<D extends ModelDefinition>(def: D, action: CatalogAction): D {
  const key = recordKey(def);
  if (!isRecordPage(def) || !key || action.kind === "delete" || !recordActionUsable(def, action).usable) return def;
  const owner = saveOwner(def);
  const current = owner?.steps ?? [];
  if (current.length >= MAX_STEPS || current.some((id) => queryById(def, id)?.action === action.code)) return def;
  const query = actionQuery(def, action);
  let next: D = { ...def, queries: [...def.queries, query] };
  const when = { ...parseWhen(owner?.component.props.sequenceWhen), [query.id]: recordCondition(def, action.kind === "insert")! };
  const stop = owner ? owner.component.props.stopOnError !== false : true;
  if (owner) next = writeSequence(next, owner, [...current, query.id], when, stop);
  else {
    const id = freeId(next, "kaydet");
    const button: ModelComponent = { id, type: "button", name: id, props: { slot: "actions", text: "Kaydet", actionType: "sequence", ...defined(sequencePatch([query.id], when, true)) } };
    // Kaydet ilk düğmedir (kartın sırası: Kaydet, ek eylemler, Sil).
    const first = next.components.findIndex((component) => component.type === "button" && slotOf(component) === "actions");
    const components = [...next.components];
    components.splice(first < 0 ? components.length : first, 0, button);
    next = { ...next, components };
  }
  return applyKeyMode(next);
}

/** Katalog adımını kaldırır (sorgusu başka yerde kullanılmıyorsa o da). Ham adım silinemez: tanım değişmeden döner. */
export function removeSaveStep<D extends ModelDefinition>(def: D, queryId: string): D {
  const owner = saveOwner(def);
  if (!owner || !owner.steps.includes(queryId) || !isCatalogStep(queryById(def, queryId))) return def;
  const steps = owner.steps.filter((id) => id !== queryId);
  let next = writeSequence(def, owner, steps, parseWhen(owner.component.props.sequenceWhen), owner.component.props.stopOnError !== false);
  // Kaydet kalmayınca Kaydet ve yeni de kalkar (sunucunun `saveAndNew` kuralı).
  if (!saveOwner(next) && barProps(next).saveAndNew === true) next = patchExistingBar(next, { saveAndNew: undefined });
  return applyKeyMode(dropQueryIfUnused(next, queryId));
}

/** "Bir adım hata verirse dur". Varsayılan açık olduğundan yalnız kapalısı (`false`) yazılır. Kaydet yoksa tanım değişmez. */
export function setStopOnError<D extends ModelDefinition>(def: D, on: boolean): D {
  const owner = saveOwner(def);
  if (!owner || (owner.component.props.stopOnError !== false) === on) return def;
  return writeSequence(def, owner, owner.steps, parseWhen(owner.component.props.sequenceWhen), on);
}

// ---------- Sil ----------

const deleteButtonOf = (def: ModelDefinition) => isRecordPage(def) ? def.components.find((component) => component.type === "button"
  && slotOf(component) === "actions" && component.props.actionType === "query" && queryById(def, text(component.props.queryId))?.kind === "delete") : undefined;

/** Sil'in sahibi, eylem kodu (ham sorguda null) ve kayıtlı onay metni (bağlamalı biçimde; boşsa ""). */
export function deleteCommand(def: ModelDefinition): { owner: StepOwner | null; actionCode: string | null; confirmText: string } {
  const bar = commandsBar(def);
  if (bar && text(bar.props.deleteQuery)) {
    const query = queryById(def, text(bar.props.deleteQuery));
    return { owner: "bar", actionCode: isCatalogStep(query) ? query!.action! : null, confirmText: text(bar.props.deleteConfirmText) };
  }
  const button = deleteButtonOf(def);
  if (!button) return { owner: null, actionCode: null, confirmText: "" };
  const query = queryById(def, text(button.props.queryId));
  return { owner: "button", actionCode: isCatalogStep(query) ? query!.action! : null, confirmText: text(button.props.confirmText) };
}

/**
 * Silme eylemi. Kayıt kartında: çubuk sahibinde `deleteQuery` yeni katalog sorgusunu gösterir, öteki durumda kartın Sil düğmesi
 * `setDeleteAction` ile kurulur. Listede: çubuğun `deleteQuery`'si, parametreleri seçili satırın aynı adlı kolonlarına bağlı
 * (yalnız satır eylemi; her parametre listede kolon olmalı). Eski sorgu başka yerde kullanılmıyorsa kalkar. null Sil'i kaldırır
 * (her kalıpta). Serbest gövdede eylem seçilemez (seçili satır yok); türü yanlış ya da kullanılamayan eylemde tanım değişmez.
 */
export function setDeleteCommand<D extends ModelDefinition>(def: D, action: CatalogAction | null): D {
  const template = readPageTemplate(def.template)?.name;
  const bar = commandsBar(def);
  const old = bar ? text(bar.props.deleteQuery) : "";
  if (!action) {
    if (bar && old) return dropQueryIfUnused(patchBarCommands(def, bar.id, { deleteQuery: undefined, deleteConfirmText: undefined }), old);
    return template === "record" && recordKey(def) ? setDeleteAction(def, null) : def;
  }
  if (action.kind !== "delete") return def;
  let query: PageQuery;
  let next: D = def;
  if (template === "record") {
    if (!recordKey(def) || !recordActionUsable(def, action).usable) return def;
    if (!old) return setDeleteAction(def, action);
    query = actionQuery(def, action);
  } else if (template === "list") {
    const table = def.components.find((component) => component.type === "dataTable" && slotOf(component) === "list");
    if (!table || action.target !== "row" || !actionUsable(action, stringList(table.props.columns)).usable) return def;
    const id = freeId(def, action.code);
    const name = tableName(table);
    query = { id, name: id, kind: "delete", action: action.code, runOn: "manual", parameters: action.parameters.map((parameter) => ({
      name: parameter.name, type: parameter.type as PageQuery["parameters"][number]["type"], binding: `{{${name}.seciliSatir.${parameter.name}}}` })) };
    // Bağlama tablonun adını okur; adsız tabloya kimliği ad olarak yazılır (`addListAction` gibi).
    if (table.name !== name) next = { ...next, components: next.components.map((component) => component.id === table.id ? { ...component, name } : component) };
  } else return def;
  next = patchBar({ ...next, queries: [...next.queries, query] }, { deleteQuery: query.id });
  return dropQueryIfUnused(next, old || null);
}

/**
 * Onay metni: danışmanın `{Alan}` metni `tokens` ile bağlamaya çevrilir (`fromConsultantText`). Düğme sahibinde `confirmText`
 * (onay açık kalır; boş metinde "Kayıt silinsin mi?" sorulur), çubuk sahibinde `deleteConfirmText`. Sil yoksa tanım değişmez.
 */
export function setDeleteConfirmText<D extends ModelDefinition>(def: D, value: string, tokens: FieldToken[] = []): D {
  const command = deleteCommand(def);
  if (!command.owner) return def;
  const stored = fromConsultantText(value.trim(), tokens, command.confirmText).trim() || undefined;
  if (command.owner === "bar") return patchExistingBar(def, { deleteConfirmText: stored });
  return patchComponent(def, deleteButtonOf(def)!.id, { confirmEnabled: true, confirmText: stored });
}

// ---------- Kaydettikten sonra ----------

const AFTER_SAVE_KEYS = ["afterSaveAction", "afterSavePageCode", "afterSaveTarget", "afterSaveRefresh", "afterSaveButton"] as const;
const none = (keys: readonly string[]): Patch => Object.fromEntries(keys.map((key) => [key, undefined]));

/** "Kartın kuralı" (`afterRecordSave`) ya da "Ekran aç" (`afterSave*`; eski düğme bağı da ekran açar). */
export function afterSaveChoice(def: ModelDefinition): "card" | "page" {
  return barModes(barProps(def)).afterSave === "off" ? "card" : "page";
}

/** `card` bütün `afterSave*` anahtarlarını siler; `page` sayfayı, sekmeyi ve yenilemeyi yazar (eski düğme bağı kalkar). */
export function setAfterSave<D extends ModelDefinition>(def: D, choice: "card" | "page",
  page?: { pageCode: string; target: "sameTab" | "newTab"; refresh: boolean }): D {
  if (choice === "card") return patchExistingBar(def, none(AFTER_SAVE_KEYS));
  if (!page) return def;
  return patchBar(def, { afterSaveButton: undefined, afterSaveAction: "page", afterSavePageCode: page.pageCode.trim() || undefined,
    afterSaveTarget: page.target, afterSaveRefresh: page.refresh ? true : undefined });
}

// ---------- Yeni, Düzenle ----------

const target = (value: unknown): "sameTab" | "newTab" => (value === "newTab" ? "newTab" : "sameTab");
const orUndefined = (items: string[] | undefined) => (items && items.length > 0 ? items : undefined);

export type NewCommand = { action: "off" | "clear" | "dialog" | "page" | "button"; pageCode: string; target: "sameTab" | "newTab"; inputs: string[]; legacyButton: string | null };
/** Yeni: ne yaptığı ("Formu temizle" / "Ekran aç"), hangi ekran, nerede, temizlenecek alanlar ve salt okunur eski düğme bağı. */
export function newCommand(def: ModelDefinition): NewCommand {
  const props = barProps(def);
  return { action: barModes(props).new, pageCode: text(props.newPageCode), target: target(props.newTarget), inputs: stringList(props.newInputs),
    legacyButton: text(props.newButton) || null };
}
/** Verilen alanları yazar (verilmeyen kalır; boş metin ve boş liste siler). Seçim eski düğme bağını kaldırır. */
export function setNewCommand<D extends ModelDefinition>(def: D, value: { action?: "clear" | "page"; pageCode?: string; target?: "sameTab" | "newTab"; inputs?: string[] }): D {
  const patch: Patch = {};
  if (value.action !== undefined) { patch.newAction = value.action; patch.newButton = undefined; }
  if (value.pageCode !== undefined) patch.newPageCode = value.pageCode.trim() || undefined;
  if (value.target !== undefined) patch.newTarget = value.target;
  if (value.inputs !== undefined) patch.newInputs = orUndefined(value.inputs);
  return Object.keys(patch).length === 0 ? def : patchBar(def, patch);
}

export type OpenCommand = { action: "off" | "dialog" | "page" | "button"; pageCode: string; target: "sameTab" | "newTab"; table: string; params: string[]; legacyButton: string | null };
/** Düzenle (eski "Aç"; Görüntüle aynı ekranı salt okunur açar). */
export function openCommand(def: ModelDefinition): OpenCommand {
  const props = barProps(def);
  return { action: barModes(props).open, pageCode: text(props.openPageCode), target: target(props.openTarget), table: text(props.openTable),
    params: stringList(props.openParams), legacyButton: text(props.openButton) || null };
}
/** Düzenle her zaman ekran açar (`openAction: "page"`); verilen alanları yazar, eski düğme bağını kaldırır. */
export function setOpenCommand<D extends ModelDefinition>(def: D, value: { pageCode?: string; target?: "sameTab" | "newTab"; table?: string; params?: string[] }): D {
  const patch: Patch = { openAction: "page", openButton: undefined };
  if (value.pageCode !== undefined) patch.openPageCode = value.pageCode.trim() || undefined;
  if (value.target !== undefined) patch.openTarget = value.target;
  if (value.table !== undefined) patch.openTable = value.table.trim() || undefined;
  if (value.params !== undefined) patch.openParams = orUndefined(value.params);
  return patchBar(def, patch);
}

// ---------- Filtre, Excel, ⋯ Diğer, başlıkta kayıt sayısı ----------

/** Filtre (Ctrl+F) bu alana odaklanır; null siler. */
export function setFocusInput<D extends ModelDefinition>(def: D, inputId: string | null): D {
  return inputId ? patchBar(def, { focusInput: inputId }) : patchExistingBar(def, { focusInput: undefined });
}
/** Excel'in indirdiği liste; null siler. */
export function setExportTable<D extends ModelDefinition>(def: D, tableId: string | null): D {
  return tableId ? patchBar(def, { exportTable: tableId }) : patchExistingBar(def, { exportTable: undefined });
}
/** "⋯ Diğer" menüsünün düğmeleri (sırayla). */
export function moreButtons(def: ModelDefinition): string[] {
  return stringList(barProps(def).moreButtons);
}
export function setMoreButtons<D extends ModelDefinition>(def: D, ids: string[]): D {
  return ids.length > 0 ? patchBar(def, { moreButtons: [...ids] }) : patchExistingBar(def, { moreButtons: undefined });
}

/** Listenin okuma sorgusunun adı (`slot: "list"` tablosunun `query`'si). */
function listQueryName(def: ModelDefinition): string | null {
  const table = def.components.find((component) => component.type === "dataTable" && slotOf(component) === "list");
  const query = table ? queryById(def, text(table.props.query)) : undefined;
  return query ? query.name : null;
}
export function titleCountOn(def: ModelDefinition): boolean {
  return text(barProps(def).titleCount) !== "";
}
/** Başlıkta kayıt sayısı: sunucudaki toplam (`{{<liste sorgusu>.meta.totalCount}}`). Kayıt kartında ya da listesiz sayfada açılmaz. */
export function setTitleCount<D extends ModelDefinition>(def: D, on: boolean): D {
  if (!on) return patchExistingBar(def, { titleCount: undefined });
  const name = isRecordPage(def) ? null : listQueryName(def);
  return name ? patchBar(def, { titleCount: `{{${name}.meta.totalCount}}` }) : def;
}
