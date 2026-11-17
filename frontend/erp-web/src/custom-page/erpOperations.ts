/**
 * ERP işlem kataloğu (`GET /api/custom-pages/erp-operations`) girdileri için saf istek/yanıt eşleme.
 * Sayfa hiçbir zaman URL vermez: yol ve yöntem yalnız sunucu kataloğundan gelir; yol parametreleri doğrulanır ve kodlanır.
 */
export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean };
export type ErpOperation = {
  name: string; label: string; module: string; kind: "read" | "write"; pageKind: "read" | "insert" | "update" | "delete";
  method: string; route: string; parameters: ErpOperationParameter[];
  result: { shape: "list" | "record" | "none"; rowsPath: string | null; columns: { code: string; label: string; dataType: string }[] };
  sourceOperation: string | null; fixedBody: Record<string, unknown> | null; since: string; deprecated: boolean; allowed: boolean;
};
export type OperationRequest = { url: string; method: string; body?: string };

const GUID = /^[0-9a-fA-F-]{36}$/;
const INTEGER = /^-?\d+$/;

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function propertyCaseInsensitive(source: Record<string, unknown> | null, name: string): unknown {
  if (!source) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  const lower = name.toLowerCase();
  const key = Object.keys(source).find((candidate) => candidate.toLowerCase() === lower);
  return key === undefined ? undefined : source[key];
}

function routeValue(parameter: ErpOperationParameter, value: unknown): string {
  if (isEmpty(value) || typeof value === "object") throw new Error(`Geçersiz parametre: ${parameter.name}`);
  const text = String(value);
  if (parameter.type === "guid" && !GUID.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
  if (parameter.type === "int" && !INTEGER.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
  return encodeURIComponent(text);
}

/**
 * İşlem isteğini kurar. Gövde `{...kaynak, ...fixedBody}` ile başlar, bağlı gövde parametreleri üzerine yazılır.
 * Yol parametresi bağlı değerden, yoksa kaynak kaydın aynı adlı alanından (büyük/küçük harf duyarsız) gelir;
 * geçersiz ya da eksik yol parametresi "Geçersiz parametre: <ad>" ile reddedilir. GET ve DELETE gövde göndermez.
 */
export function buildOperationRequest(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null): OperationRequest {
  const byName = new Map(op.parameters.map((parameter) => [parameter.name.toLowerCase(), parameter]));
  const url = op.route.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}/g, (_match, name: string) => {
    const parameter = byName.get(name.toLowerCase()) ?? { name, in: "route" as const, type: "text", required: true };
    const bound = values[parameter.name];
    return routeValue(parameter, isEmpty(bound) ? propertyCaseInsensitive(source, parameter.name) : bound);
  });

  const query = new URLSearchParams();
  for (const parameter of op.parameters) {
    if (parameter.in !== "query") continue;
    const value = values[parameter.name];
    if (isEmpty(value)) continue;
    query.append(parameter.name, String(value));
  }
  const search = query.toString();
  const method = op.method.toUpperCase();
  const request: OperationRequest = { url: search ? `${url}?${search}` : url, method };
  if (method === "GET" || method === "DELETE") return request;

  const body: Record<string, unknown> = { ...(source ?? {}), ...(op.fixedBody ?? {}) };
  for (const parameter of op.parameters) {
    if (parameter.in !== "body" || !Object.prototype.hasOwnProperty.call(values, parameter.name)) continue;
    const lower = parameter.name.toLowerCase();
    for (const key of Object.keys(body)) if (key !== parameter.name && key.toLowerCase() === lower) delete body[key];
    body[parameter.name] = values[parameter.name];
  }
  request.body = JSON.stringify(body);
  return request;
}

/** İşlem yanıtını sayfa sorgu durumu biçimine çevirir; `rowCount` sayısal `totalCount` varsa odur, yoksa satır sayısı. */
export function mapOperationResult(op: ErpOperation, json: unknown): { rows: Record<string, unknown>[]; rowCount: number; columns: { code: string; label: string; dataType?: string }[] } {
  const columns = op.result.columns ?? [];
  let rows: Record<string, unknown>[] = [];
  if (op.result.shape === "list") {
    const raw = op.result.rowsPath ? (isRecord(json) ? json[op.result.rowsPath] : undefined) : json;
    rows = Array.isArray(raw) ? raw.filter(isRecord) : [];
  } else if (op.result.shape === "record") {
    rows = isRecord(json) ? [json] : [];
  }
  const totalCount = isRecord(json) ? json.totalCount : undefined;
  return { rows, rowCount: op.result.shape === "list" && typeof totalCount === "number" ? totalCount : rows.length, columns };
}

/** Sunucu doğrulama hatalarını (`errors: { Alan: [...] }`) işlem parametre adlarına eşler (büyük/küçük harf duyarsız). */
export function fieldErrorsByParameter(op: ErpOperation, fieldErrors: Record<string, string[]> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isRecord(fieldErrors)) return result;
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const parameter = op.parameters.find((candidate) => candidate.name.toLowerCase() === key.toLowerCase());
    if (!parameter) continue;
    const text = (Array.isArray(messages) ? messages : [messages]).filter((message) => typeof message === "string" && message).join(" ");
    if (text) result[parameter.name] = result[parameter.name] ? `${result[parameter.name]} ${text}` : text;
  }
  return result;
}
