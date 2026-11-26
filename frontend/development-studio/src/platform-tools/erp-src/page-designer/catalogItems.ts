// Saf (React'siz) katalog seçici yardımcıları: firma kataloğundaki veri kaynakları ve eylemler (2a `GET /api/custom-pages/catalog`).
import type { PageQuery, PageQueryParameter, QueryKind, QueryParameterType } from "./QueriesPanel";
import type { ErpOperation } from "./erpOperations";

export type CatalogItem = {
  code: string; label: string; source: "sql" | "erpOperation"; erpOperation?: string;
  parameters: { name: string; type: string }[];
  /** Yalnız eylemlerde: insert, update ya da delete. */
  kind?: string;
};
export type CatalogRefs = { status: "loading" } | { status: "failed" } | { status: "ready"; dataSources: CatalogItem[]; actions: CatalogItem[] };
export type QuerySourceMode = "sql" | "erp" | "catalog";

export const CATALOG_FAILED = "Katalog alınamadı.";
export const CATALOG_ADMIN_ONLY = "Yalnızca firma yöneticisi bağlayabilir";
export const CATALOG_OPERATION_MISSING = "Bu yapı taşının ERP işlemi bulunamadı";

const items = (value: unknown, actions: boolean): CatalogItem[] => !Array.isArray(value) ? [] : value.flatMap((raw): CatalogItem[] => {
  const item = raw as Partial<CatalogItem> | null;
  if (!item || typeof item.code !== "string" || (item.source !== "sql" && item.source !== "erpOperation")) return [];
  return [{
    code: item.code, label: typeof item.label === "string" && item.label ? item.label : item.code, source: item.source,
    erpOperation: typeof item.erpOperation === "string" ? item.erpOperation : undefined,
    parameters: Array.isArray(item.parameters) ? item.parameters.filter((parameter) => typeof parameter?.name === "string") : [],
    kind: actions && typeof item.kind === "string" ? item.kind : undefined,
  }];
});

/** Etkin katalog sürümünün öğeleri; `invalidItems` hiçbir zaman okunmaz ya da gösterilmez. */
export async function loadCatalogRefs(request: <T>(url: string, init?: RequestInit) => Promise<T>): Promise<CatalogRefs> {
  const body = await request<{ dataSources?: unknown; actions?: unknown }>("/api/custom-pages/catalog");
  if (!body || !Array.isArray(body.dataSources) || !Array.isArray(body.actions)) throw new Error(CATALOG_FAILED);
  return { status: "ready", dataSources: items(body.dataSources, false), actions: items(body.actions, true) };
}

/** Okuma sorgusuna veri kaynakları, yazma sorgusuna aynı türdeki eylemler gelir. */
export const catalogItemsFor = (refs: CatalogRefs, kind: QueryKind): CatalogItem[] =>
  refs.status !== "ready" ? [] : kind === "read" ? refs.dataSources : refs.actions.filter((item) => item.kind === kind);

/** Pasif olma nedeni: SQL'e dayanan öğeler ve eylemler yalnız TenantAdmin'e açıktır; yoksa null. */
export const catalogItemDisabledReason = (item: CatalogItem, kind: QueryKind, isAdmin: boolean, operations: ErpOperation[]): string | null =>
  !isAdmin && (item.source === "sql" || kind !== "read") ? CATALOG_ADMIN_ONLY
    : item.source === "erpOperation" && !operations.some((operation) => operation.name === item.erpOperation) ? CATALOG_OPERATION_MISSING : null;

export const catalogCodeOf = (query: Pick<PageQuery, "dataSource" | "action">) =>
  typeof query.dataSource === "string" ? query.dataSource : typeof query.action === "string" ? query.action : undefined;

/** Başvurulan kod seçili türün listesinde yoksa true (boş kod "henüz seçilmedi" sayılır). Katalog hazır değilse false. */
export const catalogCodeMissing = (refs: CatalogRefs, query: Pick<PageQuery, "dataSource" | "action" | "kind">): boolean => {
  const code = catalogCodeOf(query);
  if (refs.status !== "ready" || !code) return false;
  return !(query.kind === "read" ? refs.dataSources : refs.actions.filter((item) => item.kind === query.kind)).some((item) => item.code === code);
};

/** Kaynak geçişi yaması: katalog anahtarı yalnız "Katalog" kaynağında bulunur; SQL/ERP işlemine dönülünce silinir. */
export function sourceModePatch(target: QuerySourceMode, query: Pick<PageQuery, "kind" | "sql">, allowedKinds?: QueryKind[]): Partial<PageQuery> {
  if (target === "erp") return { operation: "", dataSource: undefined, action: undefined, parameters: [] };
  if (target === "catalog") {
    const read = query.kind === "read";
    return { operation: undefined, dataSource: read ? "" : undefined, action: read ? undefined : "", parameters: [], ...(read ? {} : { runOn: "manual" as const, runDebounceMs: undefined }) };
  }
  // SQL'e dönüşte parametreler SQL metninden yeniden çıkarılır (sql yaması bunu tetikler).
  const sqlKind: QueryKind = !allowedKinds || allowedKinds.includes("read") ? "read" : allowedKinds[0];
  return { operation: undefined, dataSource: undefined, action: undefined, sql: query.sql ?? (sqlKind === "read" ? "SELECT 1 AS Deger" : ""), kind: sqlKind, runOn: sqlKind === "read" ? "load" : "manual", runDebounceMs: undefined, parameters: [] };
}

/** Öğe seçimi: sorgu `dataSource`/`action` koduna başvurur; parametre satırları öğeden (ERP işlemine dayanıyorsa işlem kataloğundan) gelir, bağlama boştur. */
export function catalogPickPatch(item: CatalogItem, isAction: boolean, operations: ErpOperation[]): Partial<PageQuery> {
  const operation = item.source === "erpOperation" ? operations.find((candidate) => candidate.name === item.erpOperation) : undefined;
  // İşlem kataloğunda bulunamayan işleme dayanan öğe seçilemez (parametreler yalnız işlem kataloğundan gelir).
  if (item.source === "erpOperation" && !operation) return {};
  const specs: { name: string; type: string }[] = operation ? operation.parameters : item.parameters;
  const parameters: PageQueryParameter[] = specs.map((parameter) => ({ name: parameter.name, binding: "", type: parameter.type as QueryParameterType }));
  return isAction
    ? { action: item.code, dataSource: undefined, kind: item.kind as QueryKind, runOn: "manual", runDebounceMs: undefined, parameters }
    : { dataSource: item.code, action: undefined, parameters };
}

/**
 * Bileşen kurallarının (sunucu sayfalaması) gördüğü ERP işlemi: sunucudaki `ComponentOperation` kuralının aynası.
 * Sorgunun kendi işlemi ya da başvurduğu, ERP işlemine dayanan katalog öğesinin işlemi. SQL sorgusu ve SQL'e dayanan
 * başvuru `sql`dir. Katalog yüklenmemiş/alınamamışsa ya da kod katalogda yoksa `unknown`: saklanan ayar silinmez.
 */
export type ComponentOperation = { kind: "operation"; name: string } | { kind: "sql" } | { kind: "unknown" };
export function componentOperation(query: PageQuery, refs: CatalogRefs | undefined): ComponentOperation {
  if (typeof query.operation === "string") return { kind: "operation", name: query.operation };
  const code = catalogCodeOf(query);
  if (code === undefined) return { kind: "sql" };
  if (!refs || refs.status !== "ready") return { kind: "unknown" };
  const item = (typeof query.dataSource === "string" ? refs.dataSources : refs.actions).find((candidate) => candidate.code === code);
  if (!item) return { kind: "unknown" };
  if (item.source === "sql") return { kind: "sql" };
  return item.erpOperation ? { kind: "operation", name: item.erpOperation } : { kind: "unknown" };
}
