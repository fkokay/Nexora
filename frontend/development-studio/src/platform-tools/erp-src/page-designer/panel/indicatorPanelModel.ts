// Gösterge panelinin saf modeli (alt proje 5a, Karar 4). Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Değerler parametresiz katalog veri kaynaklarından gelir: kaynak bir okuma sorgusu olur, değer `{{<sorgu>.rows[0].<kolon>}}` bağlamasıdır.
import type { CatalogDataSource } from "../catalogClient";
import type { PageQuery } from "../QueriesPanel";
import { readPageTemplate } from "../pageTemplates";
import { METRIC_ICONS } from "../metricIcons";
import { freeId, type ModelComponent, type ModelDefinition, type Usable } from "./listPanelModel";

export type IndicatorKind = "number" | "progress" | "status";
export type IndicatorPlace = "indicators" | "above" | "below";
export type IndicatorSize = "sm" | "lg";
export type IndicatorState = {
  kind: IndicatorKind; source: string | null; column: string | "count" | null; compareColumn: string | null; totalColumn: string | null; size: IndicatorSize;
};
export const INDICATOR_SOURCE_NEEDS_INPUT = "Bu kaynak ek bilgi istiyor; göstergede kullanılamaz.";

type Props = ModelComponent["props"];
const TYPE_OF: Record<IndicatorKind, string> = { number: "metric", progress: "progress", status: "badge" };
/** Değerin yazıldığı anahtar: gösterge ve ilerleme `value`, durum rozeti `text`. */
const valueKey = (type: string) => (type === "badge" ? "text" : "value");
const BINDING = /^\{\{\s*([^.{}\s]+)\.rows\[0\]\.([^{}]+?)\s*\}\}$/;

const parse = (value: unknown): { query: string; column: string } | null => {
  const match = typeof value === "string" ? BINDING.exec(value.trim()) : null;
  return match ? { query: match[1], column: match[2] } : null;
};
const binding = (queryName: string, column: string) => `{{${queryName}.rows[0].${column}}}`;
const without = (props: Props, ...keys: string[]): Props => Object.fromEntries(Object.entries(props).filter(([key]) => !keys.includes(key)));
// Katalog kolon türleri `int` ve `decimal`dır (sunucu: text, int, decimal, date, bool, guid); ikisi de sayı biçimiyle gösterilir.
// `number` / `money` eski ve elle yazılmış tanımlar için kabul edilir.
const formatOf = (columnType?: string) => (columnType === "int" || columnType === "decimal" ? "number" : columnType === "number" || columnType === "money" ? columnType : "text");
const isNumeric = (type?: string) => type === "int" || type === "decimal" || type === "number" || type === "money";

/** Koşul yolunun bir parçası olabilecek ad (sunucu ve ERP koşul dilbilgisi: ASCII tanımlayıcı). */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * "Kayıt sayısı": ERP `QueryMetric`, `countWhen` koşulunu sağlayan yüklenmiş satırları sayar. Her satırda dolu olan anahtar kolonu
 * (yoksa ilk uygun kolon) koşul olur: `<sorgu>.satir.<kolon> != null`. Sunucu koşulun kökünde sorgunun adını ister.
 */
const countCondition = (queryName: string, column: string) => `${queryName}.satir.${column} != null`;
const COUNT_CONDITION = /^\s*([A-Za-z_][A-Za-z0-9_]*)\.satir\.([A-Za-z_][A-Za-z0-9_]*)\s*!=\s*null\s*$/;
const countColumnIn = (value: unknown, query: PageQuery): string | null => {
  const match = typeof value === "string" ? COUNT_CONDITION.exec(value) : null;
  return match && match[1] === query.name ? match[2] : null;
};
/** Sayımın koşul kolonu: anahtar kolon, yoksa ilk tanımlayıcı adlı kolon; hiçbiri yoksa sayılamaz (null). */
export function countColumnOf(ds: CatalogDataSource): string | null {
  const key = ds.columns.find((column) => column.key && IDENT.test(column.code));
  return key?.code ?? ds.columns.find((column) => IDENT.test(column.code))?.code ?? null;
}

/** Göstergenin davranış ayarları: başka türde sunucu reddeder (`trendQuery`, `filterInput`, `filterValue`, `descriptionFormat` yalnız göstergede). */
const METRIC_ONLY = ["query", "countWhen", "format", "compareValue", "size", "trendQuery", "filterInput", "filterValue", "descriptionFormat"];
const VARIANTS = ["info", "success", "warning", "danger"];

function mapComponent<D extends ModelDefinition>(def: D, id: string, change: (c: ModelComponent) => ModelComponent): D {
  return { ...def, components: def.components.map((c) => (c.id === id ? change(c) : c)) };
}
const find = (def: ModelDefinition, id: string) => def.components.find((c) => c.id === id);

/** Karar 4: yalnız parametresiz kaynak; ERP işlemine dayanan kaynakta engel nedeni işlem bilgisinden gelir. */
export function indicatorSourceUsable(ds: CatalogDataSource): Usable {
  const blocked = (ds as { blockedReason?: string }).blockedReason;
  if (blocked) return { usable: false, reason: blocked };
  return ds.parameters.length === 0 ? { usable: true } : { usable: false, reason: INDICATOR_SOURCE_NEEDS_INPUT };
}

export const isCatalogRead = (query: PageQuery) => query.kind === "read" && typeof query.dataSource === "string";
const kindOf = (type: string): IndicatorKind => (type === "progress" ? "progress" : type === "badge" ? "status" : "number");

/** Göstergenin bağlı olduğu katalog okuma sorgusu: sayım yolunda `query`, kolon yolunda değer bağlaması. */
function sourceQueryOf(def: ModelDefinition, c: ModelComponent): PageQuery | undefined {
  const counted = c.type === "metric" && typeof c.props.query === "string" ? c.props.query : null;
  if (counted !== null) return def.queries.find((query) => query.id === counted && isCatalogRead(query));
  const bound = parse(c.props[valueKey(c.type)]);
  return bound ? def.queries.find((query) => (query.name === bound.query || query.id === bound.query) && isCatalogRead(query)) : undefined;
}
const columnOf = (value: unknown, query: PageQuery): string | null => {
  const bound = parse(value);
  return bound && (bound.query === query.name || bound.query === query.id) ? bound.column : null;
};

export function indicatorOf(def: ModelDefinition, id: string): IndicatorState {
  const c = find(def, id);
  const base: IndicatorState = { kind: c ? kindOf(c.type) : "number", source: null, column: null, compareColumn: null, totalColumn: null, size: "sm" };
  if (!c) return base;
  const size = c.props.size === "lg" ? "lg" : "sm";
  const query = sourceQueryOf(def, c);
  if (!query) return { ...base, size };
  const queried = c.type === "metric" && typeof c.props.query === "string";
  // Sorgulu göstergede yalnız Studio'nun yazdığı sayım koşulu "Kayıt sayısı"dır; koşulsuz ya da başka koşullu sayım seçilmemiş görünür.
  return {
    ...base, size, source: query.dataSource as string,
    column: queried ? (countColumnIn(c.props.countWhen, query) ? "count" : null) : columnOf(c.props[valueKey(c.type)], query),
    compareColumn: columnOf(c.props.compareValue, query), totalColumn: columnOf(c.props.progressTotal, query),
  };
}

/** Bir sorgu başka hiçbir yerden (bileşen, öteki sorgu) anılmıyorsa; ad ya da kimlik sözcük olarak aranır (şüphede "kullanılıyor" sayılır). */
export function queryInUse(def: ModelDefinition, query: PageQuery): boolean {
  const text = JSON.stringify([def.components, def.queries.filter((item) => item.id !== query.id)]);
  return [query.id, query.name].some((token) =>
    new RegExp(`(^|[^A-Za-z0-9_])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`).test(text));
}
export function pruneOrphan<D extends ModelDefinition>(def: D, query: PageQuery | undefined): D {
  if (!query || !isCatalogRead(query) || query.parameters.length > 0 || queryInUse(def, query)) return def;
  return { ...def, queries: def.queries.filter((item) => item.id !== query.id) };
}

export function setIndicatorKind<D extends ModelDefinition>(def: D, id: string, kind: IndicatorKind): D {
  const c = find(def, id);
  const type = TYPE_OF[kind];
  if (!c || c.type === type) return def;
  const before = sourceQueryOf(def, c);
  const fromKey = valueKey(c.type);
  const carried = parse(c.props[fromKey]) ? c.props[fromKey] : undefined;
  // Bağlama dışındaki (eski, düz) değerler yerinde kalır ve "Eski ayarlar"da görünür.
  // Yeni türün sunucuda reddettiği ayarlar atılır: göstergeye özgü davranışlar, ilerleme hedefi, rozet dışında `toneMap`,
  // göstergede tanımsız simge ve dört görünüm türü dışındaki `variant`.
  const dropped = [...METRIC_ONLY, "progressTotal", ...(type === "badge" ? [] : ["toneMap"])];
  if (type === "metric" && c.props.icon !== undefined && !(typeof c.props.icon === "string" && c.props.icon in METRIC_ICONS)) dropped.push("icon");
  if (type !== "progress" && c.props.variant !== undefined && !VARIANTS.includes(String(c.props.variant))) dropped.push("variant");
  const props = without(c.props, ...dropped, ...(carried !== undefined || c.props[fromKey] === "" ? [fromKey] : []));
  if (carried !== undefined) props[valueKey(type)] = carried;
  if (props.slot === "indicators" && type !== "metric") props.slot = "above";
  return pruneOrphan(mapComponent(def, id, (item) => ({ ...item, type, props })), before);
}

/**
 * Kaynağı seçer: aynı kaynağa bağlı parametresiz bir okuma sorgusu varsa onu kullanır, yoksa ekler. Sayıda ilk sayı/tutar kolonu,
 * yoksa "Kayıt sayısı"; ilerleme ve durumda kaynağın ilk uygun kolonu varsayılan olur. Eski `source` kaldırılır; artık kullanılmayan
 * eski gösterge sorgusu silinir.
 */
export function chooseIndicatorSource<D extends ModelDefinition>(def: D, id: string, ds: CatalogDataSource): D {
  const c = find(def, id);
  if (!c) return def;
  const before = sourceQueryOf(def, c);
  if (before?.dataSource === ds.code) return def;
  const numeric = ds.columns.find((column) => isNumeric(column.type));
  const counter = c.type === "metric" && !numeric ? countColumnOf(ds) : null;
  const first = (c.type === "metric" || c.type === "progress" ? numeric : undefined) ?? ds.columns[0];
  if (!first) return def;
  let queries = def.queries;
  let query = queries.find((item) => isCatalogRead(item) && item.dataSource === ds.code && item.parameters.length === 0 && item.runOn === "load");
  if (!query) {
    const queryId = freeId(def, "kaynak");
    query = { id: queryId, name: queryId, kind: "read", dataSource: ds.code, parameters: [], runOn: "load" };
    queries = [...queries, query];
  }
  const target = query;
  const key = valueKey(c.type);
  const current = c.props[key];
  // Eski düz değer (ör. rozet metni) korunur; varsayılan bağlama yalnız boş ya da zaten bağlama olan değerin yerine yazılır.
  const writable = current === undefined || current === "" || parse(current) !== null;
  const props = without(c.props, "query", "countWhen", "source", "format", "compareValue", "progressTotal", ...(c.type === "metric" || parse(current) ? [key] : []));
  if (c.type === "metric" && counter) { props.query = target.id; props.countWhen = countCondition(target.name, counter); }
  else if (c.type === "metric") { props[key] = binding(target.name, first.code); props.format = formatOf(first.type); }
  else if (writable) props[key] = binding(target.name, first.code);
  return pruneOrphan(mapComponent({ ...def, queries }, id, (item) => ({ ...item, props })) as D, before);
}

/**
 * Değeri seçer. Sayıda "count" (Kayıt sayısı) `query` + `countWhen` yazar; koşul kolonu `countColumn` (bkz. `countColumnOf`), verilmezse
 * var olan sayım koşulunun kolonudur, ikisi de yoksa tanım değişmez. Kolon yolu `query`, `countWhen` ve eski `source`'u kaldırır.
 */
export function setIndicatorValue<D extends ModelDefinition>(def: D, id: string, column: string | "count", columnType?: string, countColumn?: string | null): D {
  const c = find(def, id);
  const query = c && sourceQueryOf(def, c);
  if (!c || !query) return def;
  if (c.type === "metric") {
    if (column === "count") {
      const counter = countColumn ?? (c.props.query === query.id ? countColumnIn(c.props.countWhen, query) : null);
      if (!counter) return def;
      return mapComponent(def, id, (item) => ({ ...item, props: { ...without(item.props, "value", "format", "compareValue", "source"), query: query.id, countWhen: countCondition(query.name, counter) } }));
    }
    return mapComponent(def, id, (item) => ({ ...item, props: { ...without(item.props, "query", "countWhen", "source"), value: binding(query.name, column), format: formatOf(columnType) } }));
  }
  if (column === "count") return def;
  return mapComponent(def, id, (item) => ({ ...item, props: { ...item.props, [valueKey(item.type)]: binding(query.name, column) } }));
}

function setBound<D extends ModelDefinition>(def: D, id: string, type: string, key: string, column: string | null): D {
  const c = find(def, id);
  const query = c && c.type === type ? sourceQueryOf(def, c) : undefined;
  if (!c || !query) return def;
  return mapComponent(def, id, (item) => ({ ...item, props: column === null ? without(item.props, key) : { ...item.props, [key]: binding(query.name, column) } }));
}
export const setIndicatorCompare = <D extends ModelDefinition>(def: D, id: string, column: string | null): D => setBound(def, id, "metric", "compareValue", column);
export const setIndicatorTotal = <D extends ModelDefinition>(def: D, id: string, column: string | null): D => setBound(def, id, "progress", "progressTotal", column);

/** Paletin koyduğu başlık (consultantPalette); kendiliğinden başlık yalnız bunun, boş başlığın ya da önceki kendiliğinden başlığın yerine yazılır. */
export const INDICATOR_DEFAULT_TITLE = "Gösterge";

/** Seçimden gelen başlık (taslak 03 ve 09): sayıda değerin etiketi, "Kayıt sayısı"nda kaynağın adı, ilerlemede değerin etiketi. Durumda yok. */
function derivedTitle(def: ModelDefinition, id: string, sources: CatalogDataSource[]): string | null {
  const state = indicatorOf(def, id);
  const ds = sources.find((item) => item.code === state.source);
  if (!ds || state.column === null || state.kind === "status") return null;
  if (state.column === "count") return state.kind === "number" ? ds.label.trim() || null : null;
  return ds.columns.find((column) => column.code === state.column)?.label.trim() || null;
}

/**
 * Panelde yapılan bir değişiklikten (`before` → `after`) sonra göstergenin başlığını seçime uydurur: başlık boşsa, paletin
 * varsayılanıysa ya da önceki seçimden gelen başlıksa yeni seçimin başlığı yazılır; danışmanın elle verdiği öteki başlıklar kalır.
 * Yeni seçimin başlığı yoksa (durum, kaynaksız) önceki kendiliğinden başlık varsayılana döner.
 */
export function withIndicatorTitle<D extends ModelDefinition>(before: ModelDefinition, after: D, id: string, sources: CatalogDataSource[]): D {
  const c = find(after, id);
  if (!c) return after;
  const current = typeof c.props.title === "string" ? c.props.title.trim() : "";
  const previous = derivedTitle(before, id, sources);
  if (current !== "" && current !== INDICATOR_DEFAULT_TITLE && current !== previous) return after;
  const next = derivedTitle(after, id, sources) ?? (current === previous && previous !== null ? INDICATOR_DEFAULT_TITLE : null);
  if (next === null || next === c.props.title) return after;
  return mapComponent(after, id, (item) => ({ ...item, props: { ...item.props, title: next.slice(0, 200) } }));
}

/** Boyut yalnız sayıda yazılır; küçük varsayılandır ve yazılmaz. */
export function setIndicatorSize<D extends ModelDefinition>(def: D, id: string, size: IndicatorSize): D {
  if (find(def, id)?.type !== "metric") return def;
  return mapComponent(def, id, (c) => ({ ...c, props: size === "lg" ? { ...c.props, size: "lg" } : without(c.props, "size") }));
}

/**
 * Liste kalıbında göstergenin yerleri: ilerleme ve durum `indicators` sırasına konamaz. Kayıt kartında yalnız `above` / `below`;
 * serbest gövdede yerleri bölüm seçimi verir (boş).
 */
export function indicatorPlaces(def: ModelDefinition, c: ModelComponent): IndicatorPlace[] {
  const template = readPageTemplate(def.template)?.name;
  if (template === "free") return [];
  if (template === "record") return ["above", "below"];
  return c.type === "metric" ? ["indicators", "above", "below"] : ["above", "below"];
}

export function setIndicatorPlace<D extends ModelDefinition>(def: D, id: string, place: IndicatorPlace): D {
  const c = find(def, id);
  if (!c || !indicatorPlaces(def, c).includes(place)) return def;
  return mapComponent(def, id, (item) => ({ ...item, props: { ...item.props, slot: place } }));
}