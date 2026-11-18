// Sunucu sayfalı liste (paging: "server") yardımcıları. Sunucu kuralı: tablo adlı olmalı, ERP işlemi sorgusuna bağlı
// olmalı; işlemin int `query` parametreleri pageParam/pageSizeParam ({{<tablo>.sayfa}} / {{<tablo>.sayfaBoyutu}} ile bağlı).
import type { ErpOperation } from "./erpOperations";
import type { PageQuery } from "./QueriesPanel";

export const DEFAULT_PAGE_PARAM = "page";
export const DEFAULT_PAGE_SIZE_PARAM = "pageSize";
export const DEFAULT_PAGE_SIZE = 25;
export const MIN_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 100;
export const MAX_FOOTER_META = 6;
/** Yalnız `paging: "server"` ile geçerli özellikler (paging dahil). */
export const PAGING_PROPS = ["paging", "pageParam", "pageSizeParam", "pageSize", "searchInput", "footerMeta"] as const;

type PagedComponent = { type: string; name?: string; props: Record<string, unknown> };

export const isPagedTable = (component: PagedComponent) => component.type === "dataTable" && component.props.paging === "server";
export const pageBinding = (table: string) => `{{${table}.sayfa}}`;
export const pageSizeBinding = (table: string) => `{{${table}.sayfaBoyutu}}`;

const hasIntQueryParameter = (operation: ErpOperation, name: string) =>
  operation.parameters.some((parameter) => parameter.in === "query" && parameter.type === "int" && parameter.name.toLowerCase() === name.toLowerCase());

/** İşlem sunucu sayfalamasını destekliyor mu: int `query` parametreleri `page` ve `pageSize`. */
export const supportsServerPaging = (operation: ErpOperation | undefined) =>
  !!operation && hasIntQueryParameter(operation, DEFAULT_PAGE_PARAM) && hasIntQueryParameter(operation, DEFAULT_PAGE_SIZE_PARAM);

/** Tablonun sayfa / sayfa boyutu parametre adları (özellik yoksa varsayılanlar). */
export const pagingParams = (props: Record<string, unknown>) => ({
  page: typeof props.pageParam === "string" && props.pageParam ? props.pageParam : DEFAULT_PAGE_PARAM,
  pageSize: typeof props.pageSizeParam === "string" && props.pageSizeParam ? props.pageSizeParam : DEFAULT_PAGE_SIZE_PARAM,
});

/** Sorgunun parametrelerine (ada göre, büyük/küçük harf duyarsız) sayfa bağlamalarını yazar; olmayan satır eklenir. */
export function withPagingBindings(query: PageQuery, table: string, params: { page: string; pageSize: string }): PageQuery {
  const wanted: [string, string][] = [[params.page, pageBinding(table)], [params.pageSize, pageSizeBinding(table)]];
  let parameters = [...query.parameters];
  for (const [name, binding] of wanted) {
    const index = parameters.findIndex((parameter) => parameter.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) parameters[index] = { ...parameters[index], binding, type: "int" };
    else parameters = [...parameters, { name, binding, type: "int" }];
  }
  return { ...query, parameters };
}

/** `{{<tablo>.sayfa}}` / `{{<tablo>.sayfaBoyutu}}` bağlamalarını boşaltır. Değişiklik yoksa aynı sorgu döner. */
export function withoutPagingBindings(query: PageQuery, table: string | undefined): PageQuery {
  if (!table) return query;
  const stale = new Set([pageBinding(table), pageSizeBinding(table)]);
  if (!query.parameters.some((parameter) => stale.has(parameter.binding.trim()))) return query;
  return { ...query, parameters: query.parameters.map((parameter) => stale.has(parameter.binding.trim()) ? { ...parameter, binding: "" } : parameter) };
}

/** Sayfalama özelliklerini siler (props kopyası). */
export function stripPagingProps<T extends Record<string, unknown>>(props: T): T {
  const next = { ...props };
  for (const key of PAGING_PROPS) delete next[key];
  return next;
}

/** Sunucu sayfalı listelerin arama girişleri: liste sahiplenir; üst düzeyde ayrıca çizilmez, başka yerleşime alınamaz. */
export function tableSearchInputIds(components: PagedComponent[]): Set<string> {
  const ids = new Set<string>();
  for (const component of components) if (isPagedTable(component) && typeof component.props.searchInput === "string" && component.props.searchInput) ids.add(component.props.searchInput);
  return ids;
}

/** Sunucu sayfalı listenin kayıt öncesi sorunu (sunucudaki metinle); yoksa null. */
export function pagedTableProblem(component: PagedComponent & { id: string }, query: PageQuery | undefined): string | null {
  if (!isPagedTable(component)) return null;
  if (!component.name || !query || typeof query.operation !== "string") return `Sunucu sayfalı liste adlı ve ERP işlemine bağlı olmalıdır: ${component.id}`;
  if (query.runOn === "manual") return "Sayfalı listenin sorgusu sayfa açılınca çalışmalı (runOn: load).";
  const params = pagingParams(component.props);
  for (const [name, binding, label] of [[params.page, pageBinding(component.name), "sayfa"], [params.pageSize, pageSizeBinding(component.name), "sayfaBoyutu"]] as const) {
    const bound = query.parameters.find((parameter) => parameter.name.toLowerCase() === name.toLowerCase());
    if (!bound || bound.binding.trim() !== binding) return `'${component.name}' listesinin '${name}' parametresi {{${component.name}.${label}}} ile bağlanmalıdır.`;
  }
  const size = component.props.pageSize;
  if (size !== undefined && !(typeof size === "number" && Number.isInteger(size) && size >= MIN_PAGE_SIZE && size <= MAX_PAGE_SIZE)) return `Sayfa boyutu ${MIN_PAGE_SIZE} ile ${MAX_PAGE_SIZE} arasında bir tam sayı olmalıdır.`;
  return null;
}
