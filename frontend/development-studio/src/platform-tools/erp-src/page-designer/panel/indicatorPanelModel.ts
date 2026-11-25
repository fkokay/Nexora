// Gösterge panelinin saf modeli (alt proje 5a, Karar 4). Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Değerler parametresiz katalog veri kaynaklarından gelir: kaynak bir okuma sorgusu olur, değer `{{<sorgu>.rows[0].<kolon>}}` bağlamasıdır.
import type { CatalogDataSource } from "../catalogClient";
import type { PageQuery } from "../QueriesPanel";
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
const formatOf = (columnType?: string) => (columnType === "number" || columnType === "money" ? columnType : "text");

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

const isCatalogRead = (query: PageQuery) => query.kind === "read" && typeof query.dataSource === "string";
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
  const counted = c.type === "metric" && typeof c.props.query === "string";
  return {
    ...base, size, source: query.dataSource as string,
    column: counted ? "count" : columnOf(c.props[valueKey(c.type)], query),
    compareColumn: columnOf(c.props.compareValue, query), totalColumn: columnOf(c.props.progressTotal, query),
  };
}

/** Bir sorgu başka hiçbir yerden (bileşen, öteki sorgu) anılmıyorsa; ad ya da kimlik sözcük olarak aranır (şüphede "kullanılıyor" sayılır). */
function queryInUse(def: ModelDefinition, query: PageQuery): boolean {
  const text = JSON.stringify([def.components, def.queries.filter((item) => item.id !== query.id)]);
  return [query.id, query.name].some((token) =>
    new RegExp(`(^|[^A-Za-z0-9_])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`).test(text));
}
function pruneOrphan<D extends ModelDefinition>(def: D, query: PageQuery | undefined): D {
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
  let props = without(c.props, "query", "format", "compareValue", "progressTotal", "size", ...(carried !== undefined || c.props[fromKey] === "" ? [fromKey] : []));
  if (carried !== undefined) props[valueKey(type)] = carried;
  if (props.slot === "indicators" && type !== "metric") props.slot = "above";
  return pruneOrphan(mapComponent(def, id, (item) => ({ ...item, type, props })), before);
}

/**
 * Kaynağı seçer: aynı kaynağa bağlı parametresiz bir okuma sorgusu varsa onu kullanır, yoksa ekler. Sayıda "Kayıt sayısı",
 * ilerleme ve durumda kaynağın ilk uygun kolonu varsayılan olur. Artık kullanılmayan eski gösterge sorgusu silinir.
 */
export function chooseIndicatorSource<D extends ModelDefinition>(def: D, id: string, ds: CatalogDataSource): D {
  const c = find(def, id);
  if (!c) return def;
  const before = sourceQueryOf(def, c);
  if (before?.dataSource === ds.code) return def;
  const first = (c.type === "progress" ? ds.columns.find((column) => column.type === "number" || column.type === "money") : undefined) ?? ds.columns[0];
  if (c.type !== "metric" && !first) return def;
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
  const props = without(c.props, "query", "format", "compareValue", "progressTotal", ...(c.type === "metric" || parse(current) ? [key] : []));
  if (c.type === "metric") props.query = target.id;
  else if (first && writable) props[key] = binding(target.name, first.code);
  return pruneOrphan(mapComponent({ ...def, queries }, id, (item) => ({ ...item, props })) as D, before);
}

export function setIndicatorValue<D extends ModelDefinition>(def: D, id: string, column: string | "count", columnType?: string): D {
  const c = find(def, id);
  const query = c && sourceQueryOf(def, c);
  if (!c || !query) return def;
  if (c.type === "metric") {
    if (column === "count") return mapComponent(def, id, (item) => ({ ...item, props: { ...without(item.props, "value", "format", "compareValue"), query: query.id } }));
    return mapComponent(def, id, (item) => ({ ...item, props: { ...without(item.props, "query"), value: binding(query.name, column), format: formatOf(columnType) } }));
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

/** Boyut yalnız sayıda yazılır; küçük varsayılandır ve yazılmaz. */
export function setIndicatorSize<D extends ModelDefinition>(def: D, id: string, size: IndicatorSize): D {
  if (find(def, id)?.type !== "metric") return def;
  return mapComponent(def, id, (c) => ({ ...c, props: size === "lg" ? { ...c.props, size: "lg" } : without(c.props, "size") }));
}

/** Liste kalıbında göstergenin yerleri: ilerleme ve durum `indicators` sırasına konamaz. */
export function indicatorPlaces(def: ModelDefinition, c: ModelComponent): IndicatorPlace[] {
  void def;
  return c.type === "metric" ? ["indicators", "above", "below"] : ["above", "below"];
}

export function setIndicatorPlace<D extends ModelDefinition>(def: D, id: string, place: IndicatorPlace): D {
  const c = find(def, id);
  if (!c || !indicatorPlaces(def, c).includes(place)) return def;
  return mapComponent(def, id, (item) => ({ ...item, props: { ...item.props, slot: place } }));
}