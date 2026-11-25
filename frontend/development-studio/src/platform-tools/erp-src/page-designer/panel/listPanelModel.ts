// Liste paneli (alt proje 3, taslak 01) saf modeli. Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Yazılan biçim sunucunun kalıp ve şema kurallarına uyar: katalog başvurusu sorgusu `{ id, name, kind, dataSource|action,
// parameters, runOn }`, parametre `{ name, binding, type }`; her üst düzey bileşenin `props.slot`'u vardır.
import type { ActiveCatalog, CatalogAction, CatalogDataSource, CatalogParameter } from "../catalogClient";
import type { ErpOperation } from "../erpOperations";
import type { PageQuery } from "../QueriesPanel";
import type { PageTemplate } from "../pageTemplates";

type PropValue = string | number | boolean | string[];
export type ModelComponent = { id: string; type: string; name?: string; props: Record<string, PropValue>; children?: unknown };
export type ModelDefinition = { schemaVersion: 2; template?: PageTemplate; queries: PageQuery[]; components: ModelComponent[] };
export type Usable = { usable: true } | { usable: false; reason: string };
export type RowOpenChoice = "card" | "panel" | "none";
export type ActionPlace = "above" | "row";

export const SOURCE_NEEDS_INPUT = "Bu kaynak ek bilgi istiyor; Listede henüz kullanılamaz.";
export const BULK_ONLY_DELETE = "Toplu eylemlerden yalnız silme Listede kullanılabilir.";
export const CARD_UNAVAILABLE = "Bu kaynağın açılacak kartı ya da anahtar kolonu yok.";
export const PAGE_ACTION_NOT_ROW = "Bu eylem satıra değil sayfaya ait; yalnız listenin üstünde kullanılabilir.";
export const BULK_NEEDS_ROW = "Bu toplu silme seçili satırın hiçbir bilgisini kullanmıyor; Listede kullanılamaz.";
const PAGE_PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;
export const actionMissingColumn =(name: string) => `Bu eylemin ${name} bilgisi listede yok.`;
export const FIRST_COLUMNS = 6;
export const MAX_ROW_ACTIONS = 6;
export const MAX_DETAIL_FIELDS = 12;
export const DEFAULT_LIST_PAGE_SIZE = 25;
const SEARCH_PARAM = "q";

/**
 * ERP işlemine dayanan katalog öğesi parametre bildiremez (katalog kuralı); sayfa sorgusu işlemin kurallarıyla doğrulanır.
 * Panelin kullanacağı parametreler işlemden doldurulur: zorunlu yol/gövde parametreleri, veri kaynağında ayrıca `q` metin
 * sorgu parametresi. İsteğe bağlı öteki parametreler (ör. page, pageSize) bağlanmaz.
 */
export type OperationListStatus = "loading" | "ready" | "failed";
export const OPERATIONS_LOADING = "ERP işlem listesi yükleniyor…";
export const OPERATIONS_FAILED = "ERP işlem listesi alınamadı; bu kaynak şimdilik seçilemez.";
/** İşlem bilinmeden (liste yükleniyor, alınamadı ya da işlem listede yok) ERP işlemine dayanan öğe seçilemez. */
export type Enriched<T> = T & { blockedReason?: string };
const blockedOf = (item: object): string | undefined => (item as { blockedReason?: string }).blockedReason;

export function withOperationParameters<T extends { source: "sql" | "erpOperation"; parameters: CatalogParameter[] }>(
  item: T, operation: ErpOperation | undefined, forAction: boolean, status: OperationListStatus = "ready"): Enriched<T> {
  if (item.source !== "erpOperation") return item;
  if (!operation) return { ...item, blockedReason: status === "loading" ? OPERATIONS_LOADING : OPERATIONS_FAILED };
  const parameters = operation.parameters
    .filter((parameter) => parameter.required && !(parameter.in === "route" && operation.sourceOperation)
      || (!forAction && parameter.name === SEARCH_PARAM && parameter.in === "query" && parameter.type === "text"))
    .map((parameter) => ({ name: parameter.name, type: parameter.type }));
  return { ...item, parameters };
}

/** Karar 4: yalnız parametresiz ya da yalnız `q` metin parametreli kaynak. Karar 1: yönetici olmak katalog kaynağında fark etmez. */
export function dataSourceUsable(ds: CatalogDataSource, isTenantAdmin: boolean): Usable {
  void isTenantAdmin;
  const blocked = blockedOf(ds);
  if (blocked) return { usable: false, reason: blocked };
  return ds.parameters.every((parameter) => parameter.name === SEARCH_PARAM && parameter.type === "text")
    ? { usable: true } : { usable: false, reason: SOURCE_NEEDS_INPUT };
}

export const sourceHasSearch = (ds: CatalogDataSource) => ds.parameters.some((parameter) => parameter.name === SEARCH_PARAM);

/** Karar 5: her parametre aynı adlı liste kolonuna bağlanabilmeli; toplu eylem yalnız silme olabilir. */
export function actionUsable(action: CatalogAction, listColumns: string[]): Usable {
  const blocked = blockedOf(action);
  if (blocked) return { usable: false, reason: blocked };
  if (action.target === "bulk" && action.kind !== "delete") return { usable: false, reason: BULK_ONLY_DELETE };
  // Toplu silme satır başına çalışır: sunucu en az bir parametresinin seçili satıra bağlı olmasını ister.
  if (action.target === "bulk" && action.parameters.length === 0) return { usable: false, reason: BULK_NEEDS_ROW };
  const missing = action.parameters.find((parameter) => !listColumns.includes(parameter.name));
  return missing ? { usable: false, reason: actionMissingColumn(missing.name) } : { usable: true };
}

/** Bir yerde kullanılabilir mi: sayfa eylemi satır sonuna konmaz. */
export function actionUsableAt(action: CatalogAction, listColumns: string[], place: ActionPlace): Usable {
  if (place === "row" && action.target !== "row") return { usable: false, reason: action.target === "bulk" ? BULK_ONLY_DELETE : PAGE_ACTION_NOT_ROW };
  return actionUsable(action, listColumns);
}

/**
 * Kolon kodundan sunucunun sayfa parametresi adı kuralına (`^[a-z][a-zA-Z0-9]{0,31}$`) uyan ad türetir.
 * Kural: `_` + harf camelCase olur (`Cari_Kodu` → `cariKodu`), `[a-zA-Z0-9]` dışındaki diğer karakterler atılır, ilk harf
 * küçültülür, 32 karaktere kesilir. Sonuç yine kurala uymuyorsa (örn. rakamla başlıyor) null döner.
 */
export function pageParamName(column: string): string | null {
  const joined = column.replace(/_+([a-zA-Z])/g, (_, letter: string) => letter.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
  const name = (joined.charAt(0).toLowerCase() + joined.slice(1)).slice(0, 32);
  return PAGE_PARAM_NAME.test(name) ? name : null;
}

export function rowOpenUsable(ds: CatalogDataSource): Usable {
  const key = keyColumn(ds);
  // Sayfa düğmesinin parametre adı kolon adından türetilir; bağlama gerçek kolon kodunu okur.
  return ds.opens && key && pageParamName(key) ? { usable: true } : { usable: false, reason: CARD_UNAVAILABLE };
}

// ---------- okuma yardımcıları ----------

const keyColumn = (ds: CatalogDataSource) => ds.columns.find((column) => column.key)?.code;
export const findList = (def: ModelDefinition, listId: string) => def.components.find((component) => component.id === listId && component.type === "dataTable");
const tableName = (table: ModelComponent) => table.name || table.id;
const listQueryOf = (def: ModelDefinition, table: ModelComponent | undefined) =>
  table && typeof table.props.query === "string" ? def.queries.find((query) => query.id === table.props.query) : undefined;

/** Liste tablosunun bağlı olduğu katalog veri kaynağı kodu (yoksa undefined). */
export function listDataSourceCode(def: ModelDefinition, listId: string): string | undefined {
  return listQueryOf(def, findList(def, listId))?.dataSource;
}

export const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
/** `kod=Etiket` öğelerini haritaya çevirir. */
export function labelMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of stringList(value)) {
    const at = item.indexOf("=");
    if (at > 0) result[item.slice(0, at)] = item.slice(at + 1);
  }
  return result;
}
/** Sunucunun `kod=Etiket` kuralı: etikette `=` olmaz, en fazla 60 karakter. */
export const safeLabel = (label: string, fallback: string) => (label.replace(/=/g, "").trim().slice(0, 60) || fallback.slice(0, 60));

const filterBarOf = (def: ModelDefinition, listId: string) =>
  def.components.find((component) => component.type === "filterBar" && component.props.slot === "filters" && component.props.table === listId);
const detailOf = (def: ModelDefinition, listId: string) =>
  def.components.find((component) => component.type === "contextPanel" && component.props.slot === "detail" && component.props.table === listId);

export function rowOpenChoice(def: ModelDefinition, listId: string): RowOpenChoice {
  const table = findList(def, listId);
  if (table && typeof table.props.rowOpenAction === "string" && table.props.rowOpenAction) return "card";
  return detailOf(def, listId) ? "panel" : "none";
}

/** Listeye bağlı arama: kaynakta `q` varsa süzgeç alanı, yoksa tablonun kendi arama kutusu. */
export function searchState(def: ModelDefinition, listId: string): { on: boolean; server: boolean } {
  const bar = filterBarOf(def, listId);
  if (bar && bar.props.searchParam === SEARCH_PARAM) return { on: bar.props.search === true, server: true };
  return { on: findList(def, listId)?.props.showGridSearch !== false, server: false };
}

/** Yerleştirilmiş katalog eylemleri: üstte (düğme ya da toplu silme) ve satır sonunda. */
export function placedActions(def: ModelDefinition, listId: string): { above: string[]; row: string[] } {
  const table = findList(def, listId);
  const actionOf = (queryId: unknown) => def.queries.find((query) => query.id === queryId)?.action;
  const above: string[] = []; const row: string[] = [];
  for (const component of def.components) {
    if (component.type !== "button" || component.props.actionType !== "query") continue;
    const code = actionOf(component.props.queryId);
    if (!code) continue;
    if (component.props.slot === "actions") above.push(code);
    else if (component.props.slot === "rowActions" && table && stringList(table.props.rowActions).includes(component.id)) row.push(code);
  }
  const bulk = table ? actionOf(table.props.bulkDeleteQuery) : undefined;
  if (bulk) above.push(bulk);
  return { above, row };
}

/** Review Focus 1: kayıtlı sayfanın başvurduğu ama etkin katalogda (aynı türde) olmayan kodlar. */
export function missingCatalogCodes(def: ModelDefinition, catalog: ActiveCatalog): string[] {
  const sources = new Set(catalog.dataSources.map((item) => item.code));
  const actions = new Set(catalog.actions.map((item) => item.code));
  const missing: string[] = [];
  for (const query of def.queries) {
    const code = typeof query.dataSource === "string" ? (sources.has(query.dataSource) ? null : query.dataSource)
      : typeof query.action === "string" ? (actions.has(query.action) ? null : query.action) : null;
    if (code !== null && !missing.includes(code)) missing.push(code);
  }
  return missing;
}

// ---------- yazma yardımcıları ----------

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
  return taken;
}
/** Sayfada (bileşen kimliği/adı ya da sorgu kimliği/adı olarak) kullanılmayan ilk ad: base, base2, base3… */
function freeId(def: ModelDefinition, base: string, extra: Set<string> = new Set()): string {
  const taken = takenIds(def);
  const clean = base.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "oge";
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
const replaceComponent = (components: ModelComponent[], id: string, next: (component: ModelComponent) => ModelComponent) =>
  components.map((component) => component.id === id ? next(component) : component);
const rowBinding = (table: ModelComponent, column: string) => `{{${tableName(table)}.seciliSatir.${column}}}`;

/** Tablonun basit özelliklerini yazar (undefined siler). Sayfa başına 25 varsayılandır ve yazılmaz. */
export function setListProps<D extends ModelDefinition>(def: D, listId: string, patch: Record<string, PropValue | undefined>): D {
  if (!findList(def, listId)) return def;
  return { ...def, components: replaceComponent(def.components, listId, (table) => withProps(table, patch)) };
}

export function setPageSize<D extends ModelDefinition>(def: D, listId: string, size: number): D {
  return setListProps(def, listId, { pageSize: size === DEFAULT_LIST_PAGE_SIZE ? undefined : size });
}

/** Karar 3: kaynakta `q` varsa süzgeç alanı sunucu aramasını taşır ve açık kalır; yoksa tablonun istemci araması açılır/kapanır. */
export function setSearch<D extends ModelDefinition>(def: D, listId: string, on: boolean): D {
  if (searchState(def, listId).server) return def;
  return setListProps(def, listId, { showGridSearch: on ? undefined : false });
}

/**
 * Liste tablosunu katalog veri kaynağına bağlar: okuma sorgusu ekler ya da var olan katalog sorgusunu günceller, ilk 6 kolonu
 * ve tüm kolon etiketlerini yazar. Kaynakta `q` varsa `filters` yerine arama kutulu bir süzgeç alanı koyar.
 */
export function chooseDataSource<D extends ModelDefinition>(def: D, listId: string, ds: CatalogDataSource): D {
  const table = findList(def, listId);
  if (!table) return def;
  const name = tableName(table);
  const current = listQueryOf(def, table);
  const reuse = current && typeof current.dataSource === "string" ? current : undefined;
  const queryId = reuse?.id ?? freeId(def, "kaynak");
  const reserved = new Set([queryId.toLowerCase()]);
  const search = sourceHasSearch(ds);
  const oldBar = filterBarOf(def, listId);
  const barId = search ? (oldBar?.id ?? freeId(def, "suzgec", reserved)) : undefined;
  const barName = oldBar?.name || barId;

  const parameters = ds.parameters.map((parameter) => ({
    name: parameter.name, type: parameter.type as PageQuery["parameters"][number]["type"],
    binding: parameter.name === SEARCH_PARAM && barName ? `{{${barName}.${SEARCH_PARAM}}}` : "",
  }));
  const query: PageQuery = { id: queryId, name: queryId, kind: "read", dataSource: ds.code, parameters, runOn: "load" };
  const queries = reuse ? def.queries.map((item) => item.id === reuse.id ? query : item) : [...def.queries, query];

  let components = def.components.filter((component) => component.id !== oldBar?.id || search);
  components = replaceComponent(components, listId, (item) => withProps({ ...item, name }, {
    query: queryId, source: undefined, paging: undefined, pageParam: undefined, pageSizeParam: undefined, searchInput: undefined, footerMeta: undefined,
    columns: ds.columns.slice(0, FIRST_COLUMNS).map((column) => column.code),
    // Sunucu en fazla 20 kolon etiketi kabul eder: yalnız seçili kolonların etiketi yazılır.
    columnLabels: ds.columns.slice(0, FIRST_COLUMNS).map((column) => `${column.code}=${safeLabel(column.label, column.code)}`),
  }));
  if (search && barId) {
    const bar: ModelComponent = { id: barId, type: "filterBar", name: barName, props: { slot: "filters", table: listId, search: true, searchParam: SEARCH_PARAM } };
    const at = components.findIndex((component) => component.id === barId);
    if (at >= 0) components = components.map((component, index) => index === at ? { ...bar, props: { ...component.props, ...bar.props } } : component);
    else {
      const listAt = components.findIndex((component) => component.id === listId);
      components = [...components.slice(0, listAt), bar, ...components.slice(listAt)];
    }
  }
  const next = { ...def, queries, components };
  const previousCode = current?.dataSource;
  return previousCode !== undefined && previousCode !== ds.code ? rebindToSource(next, listId, ds) : next;
}

/**
 * Kaynak değişince eski kaynağa bağlı parçalar yenilenir: "Aç" düğmesi yeni kaynağa göre yeniden kurulur ya da kalkar
 * (Karar 6), yan panelin alanları yeni kaynağın ilk kolonları olur, parametresi yeni kolonlarla eşleşmeyen eylemler kalkar (Karar 5).
 */
function rebindToSource<D extends ModelDefinition>(def: D, listId: string, ds: CatalogDataSource): D {
  let next = def;
  const choice = rowOpenChoice(next, listId);
  if (choice === "card") next = rowOpenUsable(ds).usable ? setRowDoubleClick(next, listId, "card", ds) : setRowDoubleClick(next, listId, "none", ds);
  if (choice === "panel") next = setRowDoubleClick(next, listId, ds.columns.length > 0 ? "panel" : "none", ds);
  const columns = new Set(ds.columns.map((column) => column.code));
  const prefix = (() => { const table = findList(next, listId); return table ? `{{${tableName(table)}.seciliSatir.` : ""; })();
  const stale = next.queries.filter((query) => typeof query.action === "string" && query.parameters.some((parameter) => {
    if (!parameter.binding.startsWith(prefix)) return false;
    return !columns.has(parameter.binding.slice(prefix.length, -2));
  })).map((query) => query.action!);
  for (const code of new Set(stale)) next = removePlacedAction(next, listId, code);
  return next;
}

export const MAX_LIST_COLUMNS = 20;
/**
 * Kolonlar: işaretli olanlar sırasıyla (sıra = önem sırası), en fazla 20. Etiket yalnız seçili kolonlar için yazılır (sunucu
 * sınırı 20); verilen etiketler var olanların üstüne yazılır.
 */
export function setColumns<D extends ModelDefinition>(def: D, listId: string, columns: string[], labels: Record<string, string>): D {
  const table = findList(def, listId);
  if (!table) return def;
  const chosen = columns.slice(0, MAX_LIST_COLUMNS);
  const merged = { ...labelMap(table.props.columnLabels), ...labels };
  const columnLabels = chosen.filter((code) => merged[code] !== undefined).map((code) => `${code}=${safeLabel(merged[code], code)}`);
  return setListProps(def, listId, { columns: chosen, columnLabels: columnLabels.length > 0 ? columnLabels : undefined });
}

/**
 * Katalog eylemini listeye ekler: bir eylem sorgusu (parametreleri seçili satırın aynı adlı kolonlarına bağlı) ve bir sorgu
 * düğmesi (`actions` ya da `rowActions` yerinde; onay metni katalogdan kopyalanır, Karar 2). Satır eylemi tablonun
 * `rowActions`'ına da yazılır. Toplu silme düğme yerine tablonun `bulkDeleteQuery`'sini kullanır (ERP "Seçilenleri sil").
 */
export function addListAction<D extends ModelDefinition>(def: D, listId: string, action: CatalogAction, place: ActionPlace): D {
  const table = findList(def, listId);
  if (!table) return def;
  const placed = placedActions(def, listId);
  if ((place === "row" ? placed.row : placed.above).includes(action.code)) return def;
  const bulk = action.target === "bulk";
  if (bulk && (place !== "above" || action.kind !== "delete" || typeof table.props.bulkDeleteQuery === "string")) return def;
  const rowActions = stringList(table.props.rowActions);
  if (place === "row" && (action.target !== "row" || rowActions.length >= MAX_ROW_ACTIONS)) return def;

  const queryId = freeId(def, action.code);
  const query: PageQuery = {
    id: queryId, name: queryId, kind: action.kind, action: action.code, runOn: "manual",
    parameters: action.parameters.map((parameter) => ({ name: parameter.name, type: parameter.type as PageQuery["parameters"][number]["type"], binding: rowBinding(table, parameter.name) })),
  };
  const queries = [...def.queries, query];
  const name = tableName(table);
  if (bulk) {
    return { ...def, queries, components: replaceComponent(def.components, listId, (item) => withProps({ ...item, name }, { bulkDeleteQuery: queryId })) };
  }
  const buttonId = freeId(def, `${action.code}Dugmesi`, new Set([queryId.toLowerCase()]));
  const listQuery = typeof table.props.query === "string" ? table.props.query : undefined;
  const button: ModelComponent = { id: buttonId, type: "button", props: {
    slot: place === "row" ? "rowActions" : "actions", text: action.label.slice(0, 120), actionType: "query", queryId,
    ...(action.confirmText ? { confirmEnabled: true, confirmText: action.confirmText } : {}),
    ...(listQuery ? { refreshQueries: [listQuery] } : {}),
  } };
  let components = replaceComponent(def.components, listId, (item) => withProps({ ...item, name }, place === "row" ? { rowActions: [...rowActions, buttonId] } : {}));
  components = [...components, button];
  return { ...def, queries, components };
}

/** Eylemi o yerden kaldırır; artık hiçbir yerden kullanılmayan eylem sorgusu da silinir. */
export function removeListAction<D extends ModelDefinition>(def: D, listId: string, actionCode: string, place: ActionPlace): D {
  const table = findList(def, listId);
  if (!table) return def;
  const queryIds = new Set(def.queries.filter((query) => query.action === actionCode).map((query) => query.id));
  const rowActions = stringList(table.props.rowActions);
  const slot = place === "row" ? "rowActions" : "actions";
  const removed = new Set(def.components.filter((component) => component.type === "button" && component.props.slot === slot
    && queryIds.has(String(component.props.queryId)) && (place === "above" || rowActions.includes(component.id))).map((component) => component.id));
  const dropBulk = place === "above" && queryIds.has(String(table.props.bulkDeleteQuery));
  let components = def.components.filter((component) => !removed.has(component.id));
  components = replaceComponent(components, listId, (item) => withProps(item, {
    ...(place === "row" ? { rowActions: rowActions.filter((id) => !removed.has(id)).length > 0 ? rowActions.filter((id) => !removed.has(id)) : undefined } : {}),
    ...(dropBulk ? { bulkDeleteQuery: undefined } : {}),
  }));
  const stillUsed = new Set<string>();
  for (const component of components) {
    if (typeof component.props.queryId === "string") stillUsed.add(component.props.queryId);
    if (typeof component.props.bulkDeleteQuery === "string") stillUsed.add(component.props.bulkDeleteQuery);
  }
  const queries = def.queries.filter((query) => !queryIds.has(query.id) || stillUsed.has(query.id));
  return { ...def, queries, components };
}

/** Eylemi her yerden kaldırır (üstte, satır sonunda, toplu silme); katalogdan kalkmış eylemler için de kullanılır. */
export function removePlacedAction<D extends ModelDefinition>(def: D, listId: string, actionCode: string): D {
  return removeListAction(removeListAction(def, listId, actionCode, "above"), listId, actionCode, "row");
}

/**
 * Karar 6: *Kartı aç* kaynağın `opens` sayfasına anahtar kolonla giden bir sayfa düğmesi üretir ve `rowOpenAction` ile
 * bağlar; *Yan panelde göster* `detail` yerine bir bağlam paneli koyar; *Hiçbir şey* ikisini de kaldırır. `opens` ya da
 * anahtar kolon yoksa *Kartı aç* hiçbir şey değiştirmez.
 */
export function setRowDoubleClick<D extends ModelDefinition>(def: D, listId: string, choice: RowOpenChoice, ds: CatalogDataSource): D {
  const table = findList(def, listId);
  if (!table) return def;
  if (choice === "card" && !rowOpenUsable(ds).usable) return def;
  if (choice === "panel" && ds.columns.length === 0) return def;
  const openId = typeof table.props.rowOpenAction === "string" ? table.props.rowOpenAction : undefined;
  const detail = detailOf(def, listId);
  const name = tableName(table);
  let components = def.components.filter((component) => !(openId && component.id === openId && component.type === "button") && component.id !== detail?.id);
  components = replaceComponent(components, listId, (item) => withProps({ ...item, name }, { rowOpenAction: undefined }));
  const cleared = { ...def, components };
  if (choice === "card") {
    const key = keyColumn(ds)!;
    const buttonId = freeId(cleared, "satiriAc");
    const button: ModelComponent = { id: buttonId, type: "button", props: {
      slot: "rowActions", text: "Aç", actionType: "page", pageCode: ds.opens!, params: [`${pageParamName(key)}=${rowBinding({ ...table, name }, key)}`],
    } };
    components = [...replaceComponent(components, listId, (item) => withProps(item, { rowOpenAction: buttonId })), button];
  } else if (choice === "panel") {
    const panelId = freeId(cleared, "detay");
    const panel: ModelComponent = { id: panelId, type: "contextPanel", props: {
      slot: "detail", table: listId, title: safeLabel(ds.label, "Ayrıntı"),
      fields: ds.columns.slice(0, MAX_DETAIL_FIELDS).map((column) => `${column.code}=${safeLabel(column.label, column.code)}`),
    } };
    components = [...components, panel];
  }
  return { ...def, components };
}
