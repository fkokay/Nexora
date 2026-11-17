// ERP işlem kataloğu: Studio kopyası. Sözleşme sunucudaki GET /api/custom-pages/erp-operations yanıtıdır;
// ERP Web'deki custom-page/erpOperations.ts ile aynı tipler. Sayfa hiçbir zaman URL vermez: yol ve yöntem yalnız katalogdan gelir.

export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean };
export type ErpOperationColumn = { code: string; label: string; dataType: string };
export type ErpOperation = {
  name: string; label: string; module: string; kind: "read" | "write"; pageKind: "read" | "insert" | "update" | "delete";
  method: string; route: string; parameters: ErpOperationParameter[];
  result: { shape: "list" | "record" | "none"; rowsPath: string | null; columns: ErpOperationColumn[] };
  sourceOperation: string | null; fixedBody: Record<string, unknown> | null; since: string; deprecated: boolean; allowed: boolean;
};

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

/**
 * Okuma işleminin isteğini kurar (Studio önizlemesi). Yol değerleri doğrulanır ve kodlanır; sorgu parametrelerinde
 * boş değerler atlanır; gövde {...fixedBody, ...bağlı gövde parametreleri} olur. Geçersiz değerde istek kurulmaz.
 */
export function buildReadRequest(operation: ErpOperation, values: Record<string, unknown>): { url: string; method: string; body?: string } {
  const valueOf = (name: string) => {
    const key = Object.keys(values).find((item) => item.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : values[key];
  };
  let path = operation.route;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = { ...(operation.fixedBody ?? {}) };
  for (const parameter of operation.parameters) {
    const value = valueOf(parameter.name);
    if (parameter.in === "route") {
      const text = isEmpty(value) ? "" : String(value);
      if (parameter.type === "guid" && !GUID.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
      if (parameter.type === "int" && !/^-?\d+$/.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
      if (text === "") throw new Error(`Geçersiz parametre: ${parameter.name}`);
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(text));
    } else if (parameter.in === "query") {
      if (!isEmpty(value)) query.append(parameter.name, String(value));
    } else if (value !== undefined) {
      body[parameter.name] = value;
    }
  }
  const search = query.toString();
  const url = search ? `${path}?${search}` : path;
  const method = operation.method.toUpperCase();
  return method === "GET" ? { url, method } : { url, method, body: JSON.stringify(body) };
}

/** İşlem yanıtını satırlara çevirir: list → rowsPath dizisi (null ise gövde), record → tek satır, none → satır yok. */
export function mapReadResult(operation: ErpOperation, json: unknown): { columns: ErpOperationColumn[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean } {
  let rows: Record<string, unknown>[] = [];
  if (operation.result.shape === "list") {
    const source = operation.result.rowsPath && json && typeof json === "object" ? (json as Record<string, unknown>)[operation.result.rowsPath] : json;
    rows = Array.isArray(source) ? source.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
  } else if (operation.result.shape === "record" && json && typeof json === "object" && !Array.isArray(json)) {
    rows = [json as Record<string, unknown>];
  }
  const total = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>).totalCount : undefined;
  const columns = operation.result.columns.length > 0 ? operation.result.columns
    : Object.keys(rows[0] ?? {}).map((code) => ({ code, label: code, dataType: "text" }));
  return { columns, rows, rowCount: typeof total === "number" ? total : rows.length, truncated: false };
}

/**
 * Kaydedilecek parametreler: bağlanmamış olanlar atılır (isteğe bağlılar ve kaynak kayıttan gelen yol parametreleri;
 * bağlanmamış zorunlu parametre zaten kaydı engeller). Katalogda olmayan ad da gönderilmez.
 */
export function wireParameters<P extends { name: string; binding: string }>(operation: ErpOperation, parameters: P[]): P[] {
  return parameters.filter((parameter) => parameter.binding.trim() !== ""
    && operation.parameters.some((item) => item.name.toLowerCase() === parameter.name.toLowerCase()));
}

/** Katalog parametrelerini sayfadaki bağlamalarla birleştirir (ada göre); tür her zaman katalogdan gelir. */
export function mergedParameters<T extends string>(operation: ErpOperation, parameters: { name: string; binding: string }[]): { name: string; binding: string; type: T; spec: ErpOperationParameter }[] {
  return operation.parameters.map((spec) => {
    const existing = parameters.find((item) => item.name.toLowerCase() === spec.name.toLowerCase());
    return { name: spec.name, binding: existing?.binding ?? "", type: spec.type as T, spec };
  });
}
