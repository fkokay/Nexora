/**
 * ERP işlem kataloğu (`GET /api/custom-pages/erp-operations`) girdileri için saf istek/yanıt eşleme.
 * Sayfa hiçbir zaman URL vermez: yol ve yöntem yalnız sunucu kataloğundan gelir; yol parametreleri doğrulanır ve kodlanır.
 */
// Koleksiyon kuralları (list/map parametreleri) Studio ikizi page-designer/erpOperations.ts ile aynı tutulmalıdır.
export type ErpOperationParameterItem = { code: string; label: string; dataType: string; required: boolean };
/** `items` yalnız `list` parametrelerinde doludur (öğe alanları); diğerlerinde null (eski sunucuda yok). */
export type ErpOperationParameter = { name: string; in: "route" | "query" | "body"; type: string; required: boolean;
  items?: ErpOperationParameterItem[] | null };
const isCollection = (parameter: ErpOperationParameter) => parameter.type === "list" || parameter.type === "map";
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

export const SOURCE_MISMATCH = "Kaynak kayıt seçili kayıtla eşleşmiyor.";
/** Nesne prototipini değiştirebilecek anahtarlar gövdeye hiçbir zaman yazılmaz. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const safeKey = (key: string) => !UNSAFE_KEYS.has(key);
function safeCopy(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source ?? {})) if (safeKey(key)) copy[key] = value;
  return copy;
}

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
 * `cleared`: kullanıcının bilerek boşalttığı gövde parametreleri; değerleri null ise kaynak kaydın değerini de ezerek null yazılır.
 */
export function buildOperationRequest(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null,
  mapSourceRows?: Record<string, unknown>[] | null, cleared?: ReadonlySet<string>): OperationRequest {
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

  const body: Record<string, unknown> = { ...safeCopy(source), ...safeCopy(op.fixedBody) };
  // `bodyMap.property` adlı bildirilmiş `map` parametresi eşlemin yerine geçmez; kaynak satırların üzerine birleştirilir.
  const mapParameter = op.bodyMap
    ? op.parameters.find((parameter) => parameter.in === "body" && parameter.type === "map" && parameter.name === op.bodyMap!.property)
    : undefined;
  if (op.bodyMap && mapSourceRows) {
    const map: Record<string, unknown> = {};
    for (const row of mapSourceRows) {
      const key = row[op.bodyMap.keyColumn];
      if (typeof key === "string" && key !== "" && safeKey(key)) map[key] = row[op.bodyMap.valueColumn];
    }
    const bound = mapParameter ? values[mapParameter.name] : undefined;
    if (isRecord(bound)) {
      for (const [key, value] of Object.entries(bound)) if (safeKey(key) && value !== null && value !== undefined) map[key] = value;
    }
    // Bildirilmemiş, özel alan kodu biçimindeki değerler eşleme yazılır; null/undefined kaynak değeri korur, "" temizler.
    for (const [name, value] of Object.entries(values)) {
      if (!MAP_KEY.test(name) || byName.has(name.toLowerCase()) || value === null || value === undefined) continue;
      map[name] = value;
    }
    body[op.bodyMap.property] = map;
  }
  for (const parameter of op.parameters) {
    if (parameter.in !== "body" || !safeKey(parameter.name) || !Object.prototype.hasOwnProperty.call(values, parameter.name)) continue;
    if (parameter === mapParameter) continue;
    const lower = parameter.name.toLowerCase();
    const value = values[parameter.name];
    // Çözülemeyen koleksiyon (list/map) anahtarı hiç yazılmaz.
    if (isCollection(parameter) && (value === null || value === undefined)) continue;
    // Çözülemeyen (null/undefined) bağlı değer kaynak kaydın değerini silmez; boş metin ise bilinçli olarak yazılır.
    // Kullanıcının boşalttığı (`cleared`) alan ise bilinçli temizlemedir: null kaynak değerin yerine yazılır.
    const clearedByUser = value === null && cleared?.has(parameter.name) === true;
    if ((value === null || value === undefined) && !clearedByUser && Object.keys(body).some((key) => key.toLowerCase() === lower)) continue;
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
 * Okuma isteği gönderilmemeli mi: bir yol parametresi eksik (`missingRouteValue`) ya da işlemin `required` bildirdiği bir
 * sorgu/gövde parametresinin çözülen değeri boş. Böylece zorunlu süzgeci boş okuma (ör. reçeteler) süzgeçsiz gönderilmez.
 */
export function missingRequiredValue(op: ErpOperation, values: Record<string, unknown>, source: Record<string, unknown> | null): boolean {
  if (missingRouteValue(op, values, source)) return true;
  return op.parameters.some((parameter) => parameter.required && parameter.in !== "route" && isEmpty(values[parameter.name]));
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
    if (isEmpty(own) || String(bound).toLowerCase() !== String(own).toLowerCase()) return SOURCE_MISMATCH;
  }
  return null;
}

/**
 * Kaynak sorgunun en son hangi parametrelerle çalıştığını (`ranWith`) yazma işleminin bağlı yol değerleriyle karşılaştırır.
 * Elle çalışan kaynak A kaydı için yüklüyken seçim B'ye geçtiyse (büyük/küçük harf duyarsız) uyuşmazlık metni döner.
 * Kaynakta karşılığı olmayan ya da boş değerler karşılaştırılmaz.
 */
export function staleSourceError(op: ErpOperation, values: Record<string, unknown>, ranWith: Record<string, unknown> | null | undefined): string | null {
  if (!ranWith) return null;
  const byName = new Map(op.parameters.map((parameter) => [parameter.name.toLowerCase(), parameter.name]));
  for (const match of chooseRoute(op, values).matchAll(ROUTE_PLACEHOLDER)) {
    const name = byName.get(match[1].toLowerCase()) ?? match[1];
    const bound = values[name];
    const ran = propertyCaseInsensitive(ranWith, name);
    if (isEmpty(bound) || isEmpty(ran)) continue;
    if (String(bound).toLowerCase() !== String(ran).toLowerCase()) return SOURCE_MISMATCH;
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
  const flatten = (op.result.flatten ?? []).filter((name): name is string => typeof name === "string");
  if (op.result.shape === "list") {
    const raw = op.result.rowsPath ? (isRecord(json) ? json[op.result.rowsPath] : undefined) : json;
    rows = Array.isArray(raw) ? raw.filter(isRecord).map((row) => flattenRow(row, flatten)) : [];
  } else if (op.result.shape === "record") {
    rows = isRecord(json) ? [flattenRow(json, flatten)] : [];
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
  const byName = (name: string) => op.parameters.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const target = fieldErrorTarget(key, byName);
    if (target === null) continue;
    const text = (Array.isArray(messages) ? messages : [messages]).filter((message) => typeof message === "string" && message).join(" ");
    if (text) result[target] = result[target] ? `${result[target]} ${text}` : text;
  }
  return result;
}

const MAP_ERROR_KEY = /^([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/;
const LIST_ERROR_KEY = /^([A-Za-z_][A-Za-z0-9_]*)\[(\d{1,4})\]\.(.+)$/;

/**
 * Sunucu hata anahtarının sayfa anahtarı: `<map>.<KOD>` ve `<list>[i].<alan>` (parametre adı katalogdaki yazımıyla) korunur;
 * diğer anahtarlar parametre adına eşlenir; eşleşmeyen anahtar null.
 */
function fieldErrorTarget(key: string, byName: (name: string) => ErpOperationParameter | undefined): string | null {
  const list = LIST_ERROR_KEY.exec(key);
  if (list) {
    const parameter = byName(list[1]);
    return parameter && parameter.type === "list" ? `${parameter.name}[${Number(list[2])}].${list[3]}` : null;
  }
  const map = MAP_ERROR_KEY.exec(key);
  if (map) {
    const parameter = byName(map[1]);
    if (parameter && parameter.type === "map") return `${parameter.name}.${map[2]}`;
  }
  return byName(key)?.name ?? null;
}
