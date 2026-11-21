// ERP işlem kataloğu: Studio kopyası. Sözleşme sunucudaki GET /api/custom-pages/erp-operations yanıtıdır;
// ERP Web'deki custom-page/erpOperations.ts ile aynı tipler. Sayfa hiçbir zaman URL vermez: yol ve yöntem yalnız katalogdan gelir.

/** Liste (`list`) parametresinin öğe alanı; `dataType` skaler bir tür ya da tek düzeyli `map`. */
export type ErpOperationParameterItem = { code: string; label: string; dataType: string; required: boolean };
/** `items` yalnız `list` parametrelerinde doludur, diğerlerinde `null` (eski katalogda hiç olmayabilir). */
export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean; items?: ErpOperationParameterItem[] | null };
export type ErpOperationColumn = { code: string; label: string; dataType: string };
export type ErpOperation = {
  name: string; label: string; module: string; kind: "read" | "write"; pageKind: "read" | "insert" | "update" | "delete";
  method: string; route: string; parameters: ErpOperationParameter[];
  /** Yol seçenekleri: `when` parametresi dolu olan ilk seçeneğin yolu kullanılır; hiçbiri değilse `route`. */
  routeVariants?: ErpRouteVariant[];
  result: {
    shape: "list" | "record" | "none"; rowsPath: string | null; columns: ErpOperationColumn[];
    /** Satırdaki bu iç nesnelerin skaler alanları "ad.alan" anahtarlarına kopyalanır (iç nesne korunur). */
    flatten?: string[];
    /** Yanıtın üst düzey özellikleri: `{{sorgu.meta.<ad>}}` olarak bağlanır. */
    metaPaths?: string[];
  };
  /** Gövde eşlemesi (ör. özel alan değerleri): sayfa, işlemin bildirmediği büyük harfli alan kodlarını bağlayabilir. */
  bodyMap?: ErpBodyMap | null;
  sourceOperation: string | null; fixedBody: Record<string, unknown> | null; since: string; deprecated: boolean; allowed: boolean;
  /** Katalogun sabit sorgu değerleri (ör. `isActive=false`): bağlanmaz, her isteğe eklenir (eski katalogda hiç olmayabilir). */
  fixedQuery?: Record<string, unknown> | null;
};
export type ErpRouteVariant = { route: string; when: string };
export type ErpBodyMap = { property: string; sourceOperation: string; keyColumn: string; valueColumn: string };

/** Katalog durumu: yükleniyor, alındı ya da alınamadı (alınamazsa ERP işlemi modu kapalı, SQL modu çalışır). */
export type ErpCatalog = { status: "loading" } | { status: "ready"; operations: ErpOperation[] } | { status: "failed" };

export const ERP_CATALOG_FAILED = "ERP işlem listesi alınamadı.";
export const ERP_NOT_ALLOWED = "Bu işlem için yetkiniz yok";
export const ERP_WRITE_PREVIEW_BLOCKED = "ERP yazma işlemleri Studio önizlemesinde çalıştırılmaz; sayfa yayımlandıktan sonra düğmeyle çalışır.";

export async function loadErpOperations(request: <T>(url: string, init?: RequestInit) => Promise<T>): Promise<ErpOperation[]> {
  const body = await request<{ operations?: unknown }>("/api/custom-pages/erp-operations");
  if (!body || !Array.isArray(body.operations)) throw new Error(ERP_CATALOG_FAILED);
  return body.operations as ErpOperation[];
}

export const findOperation = (catalog: ErpCatalog, name: string | undefined): ErpOperation | undefined =>
  catalog.status === "ready" && name ? catalog.operations.find((operation) => operation.name === name) : undefined;

/**
 * Kaydı engelleyen bağlanmamış zorunlu parametre. Sunucu şemasıyla aynı kural: kaynak işlemi olan bir işlemin
 * yol parametreleri kaynak kayıttan gelir, bağlanmaları gerekmez. Yalnız boş bağlama "bağlanmamış" sayılır.
 */
export function unboundRequiredParameter(operation: ErpOperation, parameters: { name: string; binding: string }[]): string | null {
  for (const parameter of operation.parameters) {
    if (!parameter.required || (parameter.in === "route" && operation.sourceOperation)) continue;
    const bound = parameters.find((item) => item.name.toLowerCase() === parameter.name.toLowerCase());
    if (!bound || bound.binding.trim() === "") return parameter.name;
  }
  return null;
}

const GUID = /^[0-9a-fA-F-]{36}$/;
const isEmpty = (value: unknown) => value === undefined || value === null || value === "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const valueOf = (values: Record<string, unknown>, name: string) => {
  const key = Object.keys(values).find((item) => item.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : values[key];
};

/** ERP Web'deki chooseRoute ile aynı: `when` parametresi dolu olan ilk yol seçeneği, yoksa temel yol. */
export function chooseRoute(operation: ErpOperation, values: Record<string, unknown>): string {
  for (const variant of operation.routeVariants ?? []) if (!isEmpty(valueOf(values, variant.when))) return variant.route;
  return operation.route;
}

/**
 * Okuma işleminin isteğini kurar (Studio önizlemesi). Yol değerleri doğrulanır ve kodlanır; sorgu parametrelerinde
 * boş değerler atlanır, sabit sorgu değerleri (fixedQuery) her zaman eklenir; gövde {...fixedBody, ...bağlı gövde parametreleri} olur.
 * Geçersiz değerde istek kurulmaz.
 */
export function buildReadRequest(operation: ErpOperation, values: Record<string, unknown>): { url: string; method: string; body?: string } {
  // Önizleme yalnız GET/POST okumalarını çağırır; başka yöntem yazma sayılır ve hiç kurulmaz.
  const method = operation.method.toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error(ERP_WRITE_PREVIEW_BLOCKED);
  let path = chooseRoute(operation, values);
  const query = new URLSearchParams();
  const body: Record<string, unknown> = { ...(operation.fixedBody ?? {}) };
  for (const parameter of operation.parameters) {
    const value = valueOf(values, parameter.name);
    if (parameter.in === "route") {
      // Seçilen yolda yer tutucusu olmayan yol parametresi (seçeneğin isteğe bağlı `when` parametresi) atlanır.
      if (!path.includes(`{${parameter.name}}`)) continue;
      const text = isEmpty(value) ? "" : String(value);
      if (parameter.type === "guid" && !GUID.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
      if (parameter.type === "int" && !/^-?\d+$/.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
      if (text === "") throw new Error(`Geçersiz parametre: ${parameter.name}`);
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(text));
    } else if (parameter.in === "query") {
      if (!isEmpty(value)) query.append(parameter.name, String(value));
    } else if (value !== undefined) {
      // "ad.alan" gövde parametresi iç nesneye yazılır: { ad: { alan } } (ERP Web çalışma zamanıyla aynı).
      const dot = parameter.name.indexOf(".");
      if (dot < 0) body[parameter.name] = value;
      else {
        const parent = parameter.name.slice(0, dot);
        body[parent] = { ...(isRecord(body[parent]) ? body[parent] as Record<string, unknown> : {}), [parameter.name.slice(dot + 1)]: value };
      }
    }
  }
  // Sabit sorgu değerleri bağlanmaz ve boş sayılmaz (ERP Web appendFixedQuery ile aynı): mantıksal değer "true"/"false" yazılır,
  // aynı adlı bağlı değerin yerine geçer; null ve nesne/dizi değerler atlanır.
  for (const [name, value] of Object.entries(operation.fixedQuery ?? {}))
    if (typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) query.set(name, String(value));
  const search = query.toString();
  const url = search ? `${path}?${search}` : path;
  return method === "GET" ? { url, method } : { url, method, body: JSON.stringify(body) };
}

/** Satırın kopyası: `flatten` adlarındaki iç nesnelerin skaler alanları "ad.alan" anahtarlarına yazılır; iç nesne korunur. */
function flattenRow(row: Record<string, unknown>, names: string[]): Record<string, unknown> {
  if (names.length === 0) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const name of names) {
    const nested = row[name];
    if (!isRecord(nested)) continue;
    for (const [key, value] of Object.entries(nested)) if (value === null || typeof value !== "object") copy[`${name}.${key}`] = value;
  }
  return copy;
}

/**
 * İşlem yanıtını satırlara çevirir: list → rowsPath dizisi (null ise gövde), record → tek satır, none → satır yok.
 * Satırlar `flatten` ile düzleştirilir (girdi değişmez); `metaPaths` yanıtın üst düzey özelliklerinden `meta` olur.
 */
export function mapReadResult(operation: ErpOperation, json: unknown): { columns: ErpOperationColumn[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; meta: Record<string, unknown> } {
  let rows: Record<string, unknown>[] = [];
  if (operation.result.shape === "list") {
    const source = operation.result.rowsPath && json && typeof json === "object" ? (json as Record<string, unknown>)[operation.result.rowsPath] : json;
    rows = Array.isArray(source) ? source.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
  } else if (operation.result.shape === "record" && json && typeof json === "object" && !Array.isArray(json)) {
    rows = [json as Record<string, unknown>];
  }
  const flatten = operation.result.flatten ?? [];
  rows = rows.map((row) => flattenRow(row, flatten));
  const meta: Record<string, unknown> = {};
  if (isRecord(json)) for (const key of operation.result.metaPaths ?? []) if (Object.prototype.hasOwnProperty.call(json, key)) meta[key] = json[key];
  const total = isRecord(json) ? json.totalCount : undefined;
  const columns = operation.result.columns.length > 0 ? operation.result.columns
    : Object.keys(rows[0] ?? {}).map((code) => ({ code, label: code, dataType: "text" }));
  return { columns, rows, rowCount: typeof total === "number" ? total : rows.length, truncated: false, meta };
}

/** Gövde eşlemeli işlemde sayfanın ekleyebileceği özel alan kodu (sunucudaki kural). */
export const CUSTOM_FIELD_CODE = /^[A-Z][A-Z0-9_]{0,39}$/;

/** İşlemin bildirmediği, gövde eşlemesine giden özel alan parametresi mi: ad kuralına uyar, bildirilenlerle çakışmaz. */
export function isCustomFieldParameter(operation: ErpOperation, name: string): boolean {
  return !!operation.bodyMap && CUSTOM_FIELD_CODE.test(name)
    && !operation.parameters.some((item) => item.name.toLowerCase() === name.toLowerCase());
}

/**
 * Kaydedilecek parametreler: bağlanmamış olanlar atılır (isteğe bağlılar ve kaynak kayıttan gelen yol parametreleri;
 * bağlanmamış zorunlu parametre zaten kaydı engeller). Katalogda olmayan ad gönderilmez; yalnız gövde eşlemeli işlemde
 * kurala uyan özel alan kodları korunur. Bildirilen `list`/`map` parametreleri de bağlamaları doluysa korunur (bağlanmamış
 * koleksiyon hiç gönderilmez).
 */
export function wireParameters<P extends { name: string; binding: string }>(operation: ErpOperation, parameters: P[]): P[] {
  return parameters.filter((parameter) => parameter.binding.trim() !== ""
    && (operation.parameters.some((item) => item.name.toLowerCase() === parameter.name.toLowerCase()) || isCustomFieldParameter(operation, parameter.name)));
}

/**
 * Katalog parametrelerini sayfadaki bağlamalarla birleştirir (ada göre); tür ve `spec` (liste öğeleri dahil) her zaman
 * katalogdan gelir. Gövde eşlemeli
 * işlemde özel alan satırları (bağlaması boş olsa da) katalog satırlarından sonra `text` türüyle eklenir.
 */
export function mergedParameters<T extends string>(operation: ErpOperation, parameters: { name: string; binding: string }[]): { name: string; binding: string; type: T; spec: ErpOperationParameter; custom: boolean }[] {
  const declared = operation.parameters.map((spec) => {
    const existing = parameters.find((item) => item.name.toLowerCase() === spec.name.toLowerCase());
    return { name: spec.name, binding: existing?.binding ?? "", type: spec.type as T, spec, custom: false };
  });
  const seen = new Set<string>();
  const custom = parameters.filter((item) => isCustomFieldParameter(operation, item.name) && !seen.has(item.name) && !!seen.add(item.name))
    .map((item) => ({ name: item.name, binding: item.binding, type: "text" as T, spec: { name: item.name, in: "body" as const, type: "text", required: false }, custom: true }));
  return [...declared, ...custom];
}

// Koleksiyon parametreleri (Faz B): erp-web/src/custom-page/erpOperations.ts koleksiyon kurallarıyla aynıdır; biri
// değişirse diğeri de güncellenmelidir. `list` yalnız {{<ızgara>.satirlar}}, `map` yalnız {{<blok>.degerler}} bağlanır.

export type CollectionKind = "list" | "map";
export const isCollectionType = (type: string): type is CollectionKind => type === "list" || type === "map";
const COLLECTION_FIELD: Record<CollectionKind, string> = { list: "satirlar", map: "degerler" };
const COLLECTION_BINDING = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.(satirlar|degerler)\s*\}\}$/;

type CollectionComponent = { type: string; name?: string; props?: Record<string, unknown> };

/**
 * Koleksiyon parametresine bağlanabilecek bileşen adları: `list` için `list`/`matrix` kipindeki adlı düzenlenebilir
 * tablolar, `map` için adlı özel alanlar blokları (sayfadaki sırayla).
 */
export function collectionCandidates(kind: CollectionKind, components: CollectionComponent[]): string[] {
  return components.filter((component) => !!component.name && (kind === "list"
    ? component.type === "editableGrid" && (component.props?.gridMode === "list" || component.props?.gridMode === "matrix")
    : component.type === "customFieldsBlock")).map((component) => component.name as string);
}

/** Koleksiyon bağlamasının metni: `{{<ad>.satirlar}}` ya da `{{<ad>.degerler}}`. */
export const collectionBinding = (kind: CollectionKind, name: string) => `{{${name}.${COLLECTION_FIELD[kind]}}}`;

/** Bağlamanın koleksiyon kökü (doğru alanla yazılmışsa), yoksa null. */
export function collectionRoot(kind: CollectionKind, binding: string): string | null {
  const match = COLLECTION_BINDING.exec(binding.trim());
  return match && match[2] === COLLECTION_FIELD[kind] ? match[1] : null;
}

/**
 * Bir düzenlenebilir tablonun (ya da bloğun) bağlı olduğu koleksiyon parametresi: sayfadaki ERP işlemi sorgularında
 * `{{<ad>.satirlar}}` / `{{<ad>.degerler}}` bağlamalı ilk `list`/`map` parametresi ve katalogdaki tanımı.
 */
export function collectionParameterFor(kind: CollectionKind, name: string, queries: { name: string; operation?: string; parameters: { name: string; binding: string }[] }[], catalog: ErpCatalog): { query: string; spec: ErpOperationParameter } | null {
  for (const query of queries) {
    const operation = findOperation(catalog, query.operation);
    if (!operation) continue;
    for (const parameter of query.parameters) {
      const spec = operation.parameters.find((item) => item.name.toLowerCase() === parameter.name.toLowerCase());
      if (spec?.type === kind && collectionRoot(kind, parameter.binding) === name) return { query: query.name, spec };
    }
  }
  return null;
}

/** Kayıt dizisi adımının dolaştığı ızgara listesi (erp-web saveSequence `iterationOf` ile aynı kural); yoksa null. */
const ITERATION_BINDING = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.(eklenenSatir|silinenSatir)\./;
export function iterationOf(query: { parameters: { binding: string }[] }): { grid: string; list: "eklenenSatir" | "silinenSatir" } | null {
  for (const parameter of query.parameters) {
    const match = ITERATION_BINDING.exec(parameter.binding);
    if (match) return { grid: match[1], list: match[2] as "eklenenSatir" | "silinenSatir" };
  }
  return null;
}
