import type { PageQuery, QueryParameterType } from "./QueriesPanel";

/**
 * Süzgeç alanı (filterBar) ayarları. `filters` öğeleri `anahtar|tür|yer|parametre|Etiket|seçenekler` biçimindedir (ERP ve sunucu
 * ile aynı): tür auto/text/range/date/select/toggle, yer row (Satırda) / more (Daha fazla). Parametre verilmişse değer listenin
 * sorgusundaki aynı adlı parametreye `{{<ad>.<parametre>}}` bağlamasıyla gider (sunucuda süzülür); verilmemişse süzgeç ERP'de
 * yüklenen satırlara uygulanır. Aralık ve tarih süzgeçleri iki uç taşıdığından yalnız sayfada uygulanır.
 */
export type FilterKind = "auto" | "text" | "range" | "date" | "select" | "toggle";
export type FilterPlace = "row" | "more";
export type FilterSpec = {
  key: string; kind: FilterKind; place: FilterPlace; param?: string; label?: string;
  options?: { query: string; valueColumn?: string; labelColumn?: string };
};
export const MAX_FILTERS = 20;
export const MAX_SEARCH_COLUMNS = 8;
export const FILTER_KIND_LABELS: Record<FilterKind, string> = { auto: "Kendiliğinden", text: "Metin (içerir)", range: "Aralık", date: "Tarih aralığı", select: "Seçim", toggle: "Aç/kapa" };
export const FILTER_PLACE_LABELS: Record<FilterPlace, string> = { row: "Satırda", more: "Daha fazla" };
/** Sunucuya giden (parametreli) süzgeç tek değer taşır: aralık ve tarih seçilemez. */
export const SERVER_KINDS: FilterKind[] = ["auto", "text", "select", "toggle"];

const KINDS = new Set<string>(["auto", "text", "range", "date", "select", "toggle"]);
const PARAM = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const OPTIONS = /^([A-Za-z0-9_-]{1,64})(?::([^:|=]{1,128}))?(?::([^:|=]{1,128}))?$/;

export function parseFilterEntries(value: unknown): FilterSpec[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: FilterSpec[] = [];
  for (const item of value.slice(0, MAX_FILTERS)) {
    if (typeof item !== "string") continue;
    const parts = item.split("|");
    if (parts.length < 3 || parts.length > 6) continue;
    const [key, kind, place, param = "", label = "", options = ""] = parts;
    if (!key || key.length > 128 || key.includes("=") || !KINDS.has(kind) || (place !== "row" && place !== "more") || seen.has(key)) continue;
    seen.add(key);
    const source = options ? OPTIONS.exec(options) : null;
    result.push({
      key, kind: kind as FilterKind, place,
      ...(param && PARAM.test(param) ? { param } : {}),
      ...(label.trim() ? { label } : {}),
      ...(source ? { options: { query: source[1], ...(source[2] ? { valueColumn: source[2] } : {}), ...(source[3] ? { labelColumn: source[3] } : {}) } } : {}),
    });
  }
  return result;
}

/** Öğe metni; boş kalan sondaki bölümler atılır. Etiketteki `|` atılır (biçimi bozmasın). */
export function formatFilterEntry(spec: FilterSpec): string {
  const options = spec.options ? [spec.options.query, spec.options.valueColumn, spec.options.labelColumn].filter(Boolean).join(":") : "";
  const parts = [spec.key, spec.kind, spec.place, spec.param ?? "", ((spec.label ?? "").trim() ? (spec.label ?? "").replace(/[|<>]/g, "").slice(0, 40) : ""), options];
  while (parts.length > 3 && parts[parts.length - 1] === "") parts.pop();
  return parts.join("|");
}

export type QueryParam = { name: string; type: string };
/**
 * Listenin sorgusunda süzgece verilebilecek parametreler: SQL sorgusunun tanımlı parametreleri ya da ERP işleminin sorgu
 * (query) parametreleri; sayfalama parametreleri hariç.
 */
export function filterableParams(query: PageQuery | undefined, operationParams: { name: string; in: string; type: string }[] | null, paging: string[]): QueryParam[] {
  if (!query) return [];
  const skip = new Set(paging.map((name) => name.toLowerCase()));
  const list = operationParams
    ? operationParams.filter((parameter) => parameter.in === "query" && !["list", "map"].includes(parameter.type)).map((parameter) => ({ name: parameter.name, type: parameter.type }))
    : query.parameters.filter((parameter) => parameter.type !== "list" && parameter.type !== "map").map((parameter) => ({ name: parameter.name, type: parameter.type }));
  return list.filter((parameter) => PARAM.test(parameter.name) && !skip.has(parameter.name.toLowerCase()));
}

/** Arama kutusunda seçilebilen sütun: metin ya da kod biçimli; sayı/tutar/tarih/durum değil. */
export function isSearchableColumn(format: string | undefined, dataType: string | undefined): boolean {
  if (format) return format === "text" || format === "code";
  const type = (dataType ?? "").toLowerCase();
  return type === "" || type === "text" || type === "string" || type === "nvarchar" || type === "varchar";
}

export const filterBinding = (barName: string, param: string) => `{{${barName}.${param}}}`;

/**
 * Süzgeç alanının parametrelerini listenin sorgusuna `{{<ad>.<parametre>}}` ile bağlar (eksik parametre eklenir, türü korunur).
 * Değişiklik yoksa aynı sorgu döner.
 */
export function withFilterBindings(query: PageQuery, barName: string, params: QueryParam[]): PageQuery {
  let parameters = query.parameters;
  for (const param of params) {
    const binding = filterBinding(barName, param.name);
    const index = parameters.findIndex((parameter) => parameter.name === param.name);
    if (index >= 0 && parameters[index].binding.trim() === binding) continue;
    parameters = index >= 0 ? parameters.map((parameter, at) => at === index ? { ...parameter, binding } : parameter)
      : [...parameters, { name: param.name, binding, type: (param.type || "text") as QueryParameterType }];
  }
  return parameters === query.parameters ? query : { ...query, parameters };
}

/**
 * Artık süzgeç alanına ait olmayan `{{<ad>.<x>}}` bağlamalarını boşaltır (`keep` dışındakiler). Yalnız ERP işlemi sorgusunda:
 * bağlanmamış işlem parametresi gönderilmez; SQL sorgusunda parametre SQL'de kullanıldığı için dokunulmaz.
 */
export function withoutFilterBindings(query: PageQuery, barName: string, keep: string[]): PageQuery {
  if (query.operation === undefined) return query;
  const prefix = `{{${barName}.`;
  let touched = false;
  const parameters = query.parameters.map((parameter) => {
    const binding = parameter.binding.trim();
    if (!binding.startsWith(prefix) || keep.includes(binding.slice(prefix.length, -2))) return parameter;
    touched = true;
    return { ...parameter, binding: "" };
  });
  return touched ? { ...query, parameters } : query;
}

/**
 * Bir sorguda kalacak `{{<ad>.<parametre>}}` bağlamaları: süzgeç alanı silindiyse (`params` null) hiçbiri; alan başka tabloya
 * taşındıysa eski listenin sorgusunda hiçbiri; diğer sorgularda alanın güncel parametreleri (ör. hareket sorgusunun
 * `{{suzgec.warehouseId}}` bağlaması süzgecin seçili deposunu okur).
 */
export function keptFilterBindings(queryId: string, params: string[] | null, currentQuery: string | undefined, previousQuery: string | undefined): string[] {
  if (!params) return [];
  return queryId !== currentQuery && queryId === previousQuery ? [] : params;
}

/** Sütuna denk gelen sorgu parametresi: aynı ad ya da noktalı kodun son bölümü (ör. stockItem.category → @category). */
export function paramForColumn(code: string, params: QueryParam[]): QueryParam | undefined {
  return params.find((param) => param.name === code) ?? params.find((param) => param.name === code.split(".").pop());
}

/** Sorguda artık olmayan parametreler süzgeçten (ve aramadan) düşer; bilinmeyen sorgu/katalogda (`params` null) dokunulmaz. */
export function withoutStaleParams(props: Record<string, unknown>, params: QueryParam[] | null): Record<string, unknown> {
  if (!params) return props;
  const known = new Set(params.map((param) => param.name));
  let next = props;
  if (typeof props.searchParam === "string" && !known.has(props.searchParam)) { next = { ...next }; delete next.searchParam; }
  const specs = parseFilterEntries(props.filters);
  if (specs.some((spec) => spec.param && !known.has(spec.param))) {
    // Yalnız parametreye bağlı satır (anahtarı parametre adı) kalkar; sütun süzgeci sayfada uygulanmaya döner.
    const kept = specs.flatMap((spec) => !spec.param || known.has(spec.param) ? [spec] : spec.key === spec.param ? [] : [{ ...spec, param: undefined }]);
    next = { ...next, filters: kept.map(formatFilterEntry) };
    if (kept.length === 0) delete (next as Record<string, unknown>).filters;
  }
  return next;
}

/** Bağlaması süzgeç alanına gitmeyen parametreler (sorgu düzenlenemiyorsa kullanıcıya gösterilir). */
export function unboundFilterParams(query: PageQuery | undefined, barName: string, params: string[]): string[] {
  return params.filter((name) => query?.parameters.find((parameter) => parameter.name === name)?.binding.trim() !== filterBinding(barName, name));
}

/** Süzgeç alanının kullandığı parametre adları (arama parametresi dahil). */
export function filterBarParams(props: Record<string, unknown>): string[] {
  const names = parseFilterEntries(props.filters).flatMap((spec) => spec.param && spec.kind !== "range" && spec.kind !== "date" ? [spec.param] : []);
  if (props.search === true && typeof props.searchParam === "string" && PARAM.test(props.searchParam)) names.unshift(props.searchParam);
  return names;
}

/** Bir süzgecin anahtarına göre değiştirilmesi/eklenmesi (`patch: null` kaldırır); en çok 20 öğe. */
export function setFilter(value: unknown, key: string, patch: Partial<FilterSpec> | null, fallback?: FilterSpec): string[] {
  const specs = parseFilterEntries(value);
  const index = specs.findIndex((spec) => spec.key === key);
  let next: FilterSpec[];
  if (patch === null) next = specs.filter((spec) => spec.key !== key);
  else if (index >= 0) next = specs.map((spec) => spec.key === key ? normalize({ ...spec, ...patch }) : spec);
  else next = specs.length >= MAX_FILTERS ? specs : [...specs, normalize({ ...(fallback ?? { key, kind: "auto", place: "row" }), ...patch })];
  return next.map(formatFilterEntry);
}

/** Parametreli süzgeçte aralık/tarih olmaz; seçenek kaynağı yalnız seçimde (ya da kendiliğinden) kalır. */
function normalize(spec: FilterSpec): FilterSpec {
  const next = { ...spec };
  if (!next.param) delete next.param;
  if (!next.label) delete next.label;
  if (next.param && (next.kind === "range" || next.kind === "date")) next.kind = "auto";
  if (!next.options || (next.kind !== "select" && next.kind !== "auto")) delete next.options;
  return next;
}

/** Arama sütunu listesinde aç/kapa (en çok 8, sıra korunur). */
export function toggleSearchColumn(list: unknown, code: string): string[] {
  const current = Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  return current.includes(code) ? current.filter((item) => item !== code) : current.length >= MAX_SEARCH_COLUMNS ? current : [...current, code];
}

/** Kayıt öncesi sorun: tablo yok ya da ne arama ne süzgeç var (sunucu da reddeder). */
export function filterBarProblem(props: Record<string, unknown>, label: string, tableOk: boolean): string | null {
  if (!tableOk) return `${label} için sorguya bağlı bir tablo seçin.`;
  if (props.search !== true && parseFilterEntries(props.filters).length === 0) return `${label} için arama kutusunu açın ya da en az bir süzgeç seçin.`;
  return null;
}

/** Arama kutusu kapanınca aramaya bağlı özellikler kalkar (sunucu yalnız search: true iken kabul eder). */
export const SEARCH_RESET = { searchPlaceholder: undefined, searchColumns: undefined, searchParam: undefined } as const;
