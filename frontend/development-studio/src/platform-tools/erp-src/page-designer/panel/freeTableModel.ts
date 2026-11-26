// Serbest gövdedeki salt okunur Liste (alt proje 5c, Karar 7) saf modeli. Her işlev yeni bir tanım döner, girdiyi değiştirmez.
// Biçim alt proje 4'ün satır tablosunu (`recordModel.addLines`) örnek alır: `slot: "item"` bir `dataTable`; `query` parametresiz bir
// katalog okuma sorgusu, `title` kaynağın adı, `pageSize` (10 / 25 / 50), ilk 6 kolon ve etiketleri. Satır eylemi, çift tıklama,
// arama ve süzgeç yoktur.
import type { CatalogDataSource } from "../catalogClient";
import { indicatorSourceUsable, isCatalogRead, pruneOrphan } from "./indicatorPanelModel";
import { FIRST_COLUMNS, freeId, labelMap, safeLabel, setListProps, stringList, type ModelComponent, type ModelDefinition, type Usable } from "./listPanelModel";

export type FreeTablePageSize = 10 | 25 | 50 | 100;
export type FreeTableState = {
  /** Bağlı katalog veri kaynağının kodu; kaynak seçilmemişse null. */
  source: string | null; title: string; columns: string[]; labels: Record<string, string>; pageSize: number; emptyText: string;
};

/** Panelin sunduğu değerler; eski kayıttaki 100 (sunucu kabul eder) yalnız seçiliyken sunulur. */
export const FREE_TABLE_PAGE_SIZES: readonly FreeTablePageSize[] = [10, 25, 50];
export const FREE_TABLE_LEGACY_PAGE_SIZE: FreeTablePageSize = 100;
/** Yeni Listenin sayfa başına değeri; kaydında `pageSize` olmayan tablo da böyle okunur (ERP varsayılanı, listResponsive: 25). */
export const DEFAULT_FREE_TABLE_PAGE_SIZE: FreeTablePageSize = 25;
export const FREE_TABLE_SOURCE_NEEDS_INPUT = "Bu kaynak ek bilgi istiyor; burada kullanılamaz.";
const MAX_TEXT = 120;

const isFreeTable = (component: ModelComponent) => component.type === "dataTable" && component.props.slot === "item";
const findTable = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id && isFreeTable(component));
const queryOf = (def: ModelDefinition, table: ModelComponent) =>
  typeof table.props.query === "string" ? def.queries.find((query) => query.id === table.props.query) : undefined;

/** Karar 7: Gösterge'deki kural (yalnız parametresiz kaynak); ek bilgi isteyen kaynağın nedeni Listeye göre yazılır. */
export function freeTableSourceUsable(ds: CatalogDataSource): Usable {
  const usable = indicatorSourceUsable(ds);
  if (usable.usable || (ds as { blockedReason?: string }).blockedReason) return usable;
  return { usable: false, reason: FREE_TABLE_SOURCE_NEEDS_INPUT };
}

export function tableOf(def: ModelDefinition, id: string): FreeTableState | null {
  const table = findTable(def, id);
  if (!table) return null;
  const query = queryOf(def, table);
  return {
    source: query && isCatalogRead(query) ? query.dataSource as string : null,
    title: typeof table.props.title === "string" ? table.props.title : "",
    columns: stringList(table.props.columns), labels: labelMap(table.props.columnLabels),
    pageSize: typeof table.props.pageSize === "number" ? table.props.pageSize : DEFAULT_FREE_TABLE_PAGE_SIZE,
    emptyText: typeof table.props.emptyText === "string" ? table.props.emptyText : "",
  };
}

/**
 * Kaynağı seçer: aynı kaynağa bağlı parametresiz bir okuma sorgusu varsa (ör. bir göstergenin) onu paylaşır, yoksa ekler. Başlık
 * kaynağın adı olur, ilk 6 kolon ve etiketleri yazılır, sayfa başına korunur (yoksa 25). Artık hiçbir yerde anılmayan eski sorgu
 * silinir. Ek bilgi isteyen kaynakta ya da aynı kaynakta tanım değişmez.
 */
export function chooseTableSource<D extends ModelDefinition>(def: D, id: string, ds: CatalogDataSource): D {
  const table = findTable(def, id);
  if (!table || !freeTableSourceUsable(ds).usable) return def;
  const before = queryOf(def, table);
  if (before && isCatalogRead(before) && before.dataSource === ds.code) return def;
  let queries = def.queries;
  let query = queries.find((item) => isCatalogRead(item) && item.dataSource === ds.code && item.parameters.length === 0 && item.runOn === "load");
  if (!query) {
    const queryId = freeId(def, ds.code);
    query = { id: queryId, name: queryId, kind: "read", dataSource: ds.code, parameters: [], runOn: "load" };
    queries = [...queries, query];
  }
  const columns = ds.columns.slice(0, FIRST_COLUMNS);
  const pageSize = typeof table.props.pageSize === "number" ? table.props.pageSize : DEFAULT_FREE_TABLE_PAGE_SIZE;
  const next = setListProps({ ...def, queries }, id, {
    query: query.id, source: undefined, title: ds.label.trim().slice(0, MAX_TEXT) || ds.code, pageSize,
    columns: columns.map((column) => column.code),
    columnLabels: columns.length > 0 ? columns.map((column) => `${column.code}=${safeLabel(column.label, column.code)}`) : undefined,
  });
  return pruneOrphan(next, before);
}

/** Sayfa başına 10 / 25 / 50 / 100 (sunucunun kabul ettikleri). Her zaman açıkça yazılır. */
export function setTablePageSize<D extends ModelDefinition>(def: D, id: string, size: FreeTablePageSize): D {
  const table = findTable(def, id);
  if (!table || ![...FREE_TABLE_PAGE_SIZES, FREE_TABLE_LEGACY_PAGE_SIZE].includes(size) || table.props.pageSize === size) return def;
  return setListProps(def, id, { pageSize: size });
}

/** Liste boşken yazılacak metin: kırpılır (en çok 120); boş metin kaldırır (ERP kendi metnini yazar). */
export function setTableEmptyText<D extends ModelDefinition>(def: D, id: string, text: string): D {
  const table = findTable(def, id);
  if (!table) return def;
  const clean = text.trim().slice(0, MAX_TEXT) || undefined;
  if (clean === table.props.emptyText) return def;
  return setListProps(def, id, { emptyText: clean });
}
