/**
 * ERP işlem kataloğu (`GET /api/custom-pages/erp-operations`) girdileri için saf istek/yanıt eşleme.
 * Sayfa hiçbir zaman URL vermez: yol ve yöntem yalnız sunucu kataloğundan gelir; yol parametreleri doğrulanır ve kodlanır.
 */
export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean };
export type ErpOperation = {
  name: string; label: string; module: string; kind: "read" | "write"; pageKind: "read" | "insert" | "update" | "delete";
  method: string; route: string; parameters: ErpOperationParameter[];
  result: {
    shape: "list" | "record" | "none"; rowsPath: string | null; columns: { code: string; label: string; dataType: string }[];
    /** Satırdaki bu iç nesnelerin skaler alanları `ad.alan` anahtarlarına kopyalanır (eski sunucuda yok: []). */
    flatten?: string[] | null;
    /** Yanıt nesnesinin üst düzey alanları; `QueryState.meta`ya kopyalanır (eski sunucuda yok: []). */
    metaPaths?: string[] | null;
  };
  sourceOperation: string | null; fixedBody: Record<string, unknown> | null; since: string; deprecated: boolean; allowed: boolean;
  /** Seçmeli yol parametresi doluyken kullanılan yollar; ilk eşleşen kazanır (eski sunucuda yok: []). */
  routeVariants?: { route: string; when: string }[] | null;
  /** Bildirilmemiş sayfa parametrelerini gövdedeki bir eşlem alanına yazar (özel alan değerleri; eski sunucuda yok: null). */
  bodyMap?: ErpBodyMap | null;
};
export type ErpBodyMap = { property: string; sourceOperation: string; keyColumn: string; valueColumn: string };
export type OperationRequest = { url: string; method: string; body?: string };

const ROUTE_PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}/g;
const GUID = /^[0-9a-fA-F-]{36}$/;
const INTEGER = /^-?\d+$/;

const MAP_KEY = /^[A-Z][A-Z0-9_]{0,39}$/;
export const MAP_SOURCE_MISSING = "Kaynak kayıt yüklenmedi; önce bir kayıt seçin.";

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
  // encodeURIComponent "." ve ".." değerlerini kodlamaz; yol gezinmesini önlemek için açıkça reddedilir.
  if (text === "." || text === "..") throw new Error(`Geçersiz parametre: ${parameter.name}`);
  if (parameter.type === "guid" && !GUID.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
  if (parameter.type === "int" && !INTEGER.test(text)) throw new Error(`Geçersiz parametre: ${parameter.name}`);
  return encodeURIComponent(text);
}

/** Değeri dolu olan ilk `routeVariants` yolunu, yoksa temel `route`u döner. */
export function chooseRoute(op: ErpOperation, values: Record<string, unknown>): string {
  for (const variant of op.routeVariants ?? []) {
    if (variant && typeof variant.route === "string" && !isEmpty(values[variant.when])) return variant.route;
  }
  return op.route;
}

/**
 * İşlem isteğini kurar. Gövde `{...kaynak, ...fixedBody}` ile başlar, bağlı gövde parametreleri üzerine yazılır.
 * Yol parametresi bağlı değerden, yoksa kaynak kaydın aynı adlı alanından (büyük/küçük harf duyarsız) gelir;
 * geçersiz ya da eksik yol parametresi "Geçersiz parametre: <ad>" ile reddedilir. GET ve DELETE gövde göndermez.
 */
export function buildOperationRequest(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null,
  mapSourceRows?: Record<string, unknown>[] | null): OperationRequest {
  // Gövde eşlemesi kaynak satırlar olmadan kurulmaz: başka bir kaydın değerleri ya da boş eşlem yazılmasın.
  if (op.bodyMap && !mapSourceRows) throw new Error(MAP_SOURCE_MISSING);
  const byName = new Map(op.parameters.map((parameter) => [parameter.name.toLowerCase(), parameter]));
  const url = chooseRoute(op, values).replace(ROUTE_PLACEHOLDER, (_match, name: string) => {
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
  if (op.bodyMap && mapSourceRows) {
    const map: Record<string, unknown> = {};
    for (const row of mapSourceRows) {
      const key = row[op.bodyMap.keyColumn];
      if (typeof key === "string" && key !== "") map[key] = row[op.bodyMap.valueColumn];
    }
    // Bildirilmemiş, özel alan kodu biçimindeki değerler eşleme yazılır; null/undefined kaynak değeri korur, "" temizler.
    for (const [name, value] of Object.entries(values)) {
      if (!MAP_KEY.test(name) || byName.has(name.toLowerCase()) || value === null || value === undefined) continue;
      map[name] = value;
    }
    body[op.bodyMap.property] = map;
  }
  for (const parameter of op.parameters) {
    if (parameter.in !== "body" || !Object.prototype.hasOwnProperty.call(values, parameter.name)) continue;
    const lower = parameter.name.toLowerCase();
    const value = values[parameter.name];
    // Çözülemeyen (null/undefined) bağlı değer kaynak kaydın değerini silmez; boş metin ise bilinçli olarak yazılır.
    if ((value === null || value === undefined) && Object.keys(body).some((key) => key.toLowerCase() === lower)) continue;
    for (const key of Object.keys(body)) if (key !== parameter.name && key.toLowerCase() === lower) delete body[key];
    body[parameter.name] = value;
  }
  request.body = JSON.stringify(body);
  return request;
}

/** Bir yol parametresinin ne bağlı değeri ne de kaynak kayıtta karşılığı varsa true (henüz seçim yapılmamış ayrıntı okuması). */
export function missingRouteValue(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null): boolean {
  const byName = new Map(op.parameters.map((parameter) => [parameter.name.toLowerCase(), parameter.name]));
  for (const match of chooseRoute(op, values).matchAll(ROUTE_PLACEHOLDER)) {
    const name = byName.get(match[1].toLowerCase()) ?? match[1];
    if (isEmpty(values[name]) && isEmpty(propertyCaseInsensitive(source, name))) return true;
  }
  return false;
}

/**
 * Kaynak kayıttan başlayan (sourceOperation) yazma işlemi için ön denetim: kaynak satır yoksa ya da bağlı bir yol
 * değeri kaynak satırın aynı adlı alanından (büyük/küçük harf duyarsız metin karşılaştırması) farklıysa hata metni döner.
 * Böylece başka bir kaydın gizli alanları ve rowVersion'ı seçili kayda yazılmaz. Kaynaksız işlemde null.
 */
export function sourceRecordError(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null): string | null {
  if (!op.sourceOperation) return null;
  if (!source) return MAP_SOURCE_MISSING;
  const byName = new Map(op.parameters.map((parameter) => [parameter.name.toLowerCase(), parameter.name]));
  for (const match of chooseRoute(op, values).matchAll(ROUTE_PLACEHOLDER)) {
    const name = byName.get(match[1].toLowerCase()) ?? match[1];
    const bound = values[name];
    if (isEmpty(bound)) continue;
    const own = propertyCaseInsensitive(source, name);
    if (isEmpty(own) || String(bound).toLowerCase() !== String(own).toLowerCase()) return "Kaynak kayıt seçili kayıtla eşleşmiyor.";
  }
  return null;
}

/** `flatten` adlarındaki iç nesnelerin skaler alanlarını `ad.alan` anahtarlarına kopyalar; satır kopyalanır, değiştirilmez. */
function flattenRow(row: Record<string, unknown>, names: string[]): Record<string, unknown> {
  if (names.length === 0) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const name of names) {
    const nested = row[name];
    if (!isRecord(nested)) continue;
    for (const [key, value] of Object.entries(nested)) {
      if (value !== null && typeof value === "object") continue;
      copy[`${name}.${key}`] = value;
    }
  }
  return copy;
}

/**
 * İşlem yanıtını sayfa sorgu durumu biçimine çevirir; `rowCount` sayısal `totalCount` varsa odur, yoksa satır sayısı.
 * `meta`, yanıt nesnesinin `metaPaths` adlı üst düzey alanlarıdır (nesne olmayan yanıtta {}).
 */
export function mapOperationResult(op: ErpOperation, json: unknown): {
  rows: Record<string, unknown>[]; rowCount: number; columns: { code: string; label: string; dataType?: string }[]; meta: Record<string, unknown>;
} {
  const columns = op.result.columns ?? [];
  let rows: Record<string, unknown>[] = [];
  if (op.result.shape === "list") {
    const raw = op.result.rowsPath ? (isRecord(json) ? json[op.result.rowsPath] : undefined) : json;
    const flatten = (op.result.flatten ?? []).filter((name): name is string => typeof name === "string");
    rows = Array.isArray(raw) ? raw.filter(isRecord).map((row) => flattenRow(row, flatten)) : [];
  } else if (op.result.shape === "record") {
    rows = isRecord(json) ? [json] : [];
  }
  const meta: Record<string, unknown> = {};
  if (isRecord(json)) {
    for (const path of op.result.metaPaths ?? []) {
      if (typeof path === "string" && Object.prototype.hasOwnProperty.call(json, path)) meta[path] = json[path];
    }
  }
  const totalCount = isRecord(json) ? json.totalCount : undefined;
  return { rows, rowCount: op.result.shape === "list" && typeof totalCount === "number" ? totalCount : rows.length, columns, meta };
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
