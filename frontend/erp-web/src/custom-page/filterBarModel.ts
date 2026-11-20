import type { ColumnFormat } from "./cellFormat";

/**
 * Süzgeç alanı (filterBar) modeli. `filters` öğeleri `anahtar|tür|yer|parametre|Etiket|seçenekler` biçimindedir (sunucudaki
 * TenantCustomPageSchema.ValidateFilterBar ile aynı): tür auto/text/range/date/select/toggle, yer row/more; parametre verilmişse
 * değer `{{<ad>.<parametre>}}` bağlamasıyla listenin sorgusuna gider (sunucuda süzülür), verilmemişse yüklenen satırlara
 * uygulanır. Seçenekler `sorgu[:değerSütunu[:etiketSütunu[:açıklamaSütunu]]]`; açıklama verilirse seçenek "etiket · açıklama"
 * olarak çizilir (eski depo seçicilerinin "kod · ad" görünümü, ör. `depolar:id:code:name`). İsteğe bağlı yedinci bölüm virgülle
 * bayraklardır (yalnız seçim süzgecinde): `searchable` açılır listeyi yazarak aranır yapar, `defaultFirst` sayfa parametresi ya
 * da saklanan değer yokken seçenekler yüklenince ilk (boş olmayan) seçeneği seçer. Ör.
 * `warehouseId|select|row|warehouseId|Depo|depolar:id:code:name|searchable,defaultFirst`.
 */
export type FilterKind = "text" | "range" | "date" | "select" | "toggle";
export type FilterSpec = {
  key: string; kind: FilterKind | "auto"; place: "row" | "more"; param?: string; label?: string;
  options?: { query: string; valueColumn?: string; labelColumn?: string; descriptionColumn?: string };
  /** Yazarak aranan açılır liste (`searchable` bayrağı). */
  searchable?: boolean;
  /** Değer yokken ilk seçenek seçilir (`defaultFirst` bayrağı). */
  defaultFirst?: boolean;
};
export type RangeValue = { min: string; max: string };
export type FilterValue = string | boolean | RangeValue;
export type FilterBarValues = { search: string; values: Record<string, FilterValue> };
/** Seçenek; kaynak sorgudan geliyorsa `row` o satırdır (`{{<ad>.seciliSatir.<parametre>.<sütun>}}`). */
export type FilterOption = { value: string; label: string; row?: Record<string, unknown> };
/** Türü çözülmüş süzgeç: tabloya ve sorguya göre etiket, tür ve seçenekler. */
export type ResolvedFilter = FilterSpec & { kind: FilterKind; label: string; options?: FilterSpec["options"]; choices: FilterOption[] };

const KINDS = new Set(["auto", "text", "range", "date", "select", "toggle"]);
const PARAM = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const OPTIONS = /^([A-Za-z0-9_-]{1,64})(?::([^:|=]{1,128}))?(?::([^:|=]{1,128}))?(?::([^:|=]{1,128}))?$/;
const FLAGS = new Set(["searchable", "defaultFirst"]);
/** Bayrak bölümü: virgülle ayrılmış bilinen, yinelenmeyen adlar; bozuksa null (öğe atlanır). */
const parseFlags = (text: string): Set<string> | null => {
  if (text === "") return new Set();
  const names = text.split(",");
  const set = new Set(names);
  return names.every((name) => FLAGS.has(name)) && set.size === names.length ? set : null;
};
export const MAX_FILTERS = 20;
export const EMPTY_FILTER_VALUES: FilterBarValues = { search: "", values: {} };

/** `filters` dizisini savunmacı biçimde okur; geçersiz ya da yinelenen öğeler atlanır. */
export function parseFilterEntries(value: unknown): FilterSpec[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: FilterSpec[] = [];
  for (const item of value.slice(0, MAX_FILTERS)) {
    if (typeof item !== "string") continue;
    const parts = item.split("|");
    if (parts.length < 3 || parts.length > 7) continue;
    const [key, kind, place, param = "", label = "", options = "", flagText = ""] = parts;
    if (!key || key.length > 128 || key.includes("=") || !KINDS.has(kind) || (place !== "row" && place !== "more") || seen.has(key)) continue;
    if (param && !PARAM.test(param)) continue;
    const flags = parseFlags(flagText);
    if (!flags || (flags.size > 0 && kind !== "select" && kind !== "auto")) continue;
    seen.add(key);
    const source = options ? OPTIONS.exec(options) : null;
    result.push({
      key, kind: kind as FilterSpec["kind"], place,
      ...(param && kind !== "range" && kind !== "date" ? { param } : {}),
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(source ? { options: { query: source[1], ...(source[2] ? { valueColumn: source[2] } : {}), ...(source[3] ? { labelColumn: source[3] } : {}),
        ...(source[4] ? { descriptionColumn: source[4] } : {}) } } : {}),
      ...(flags.has("searchable") ? { searchable: true } : {}),
      ...(flags.has("defaultFirst") ? { defaultFirst: true } : {}),
    });
  }
  return result;
}

/** Bir öğenin metni (Studio aynı biçimi yazar); boş kalan sondaki bölümler atılır. */
export function formatFilterEntry(spec: FilterSpec): string {
  const options = spec.options ? [spec.options.query, spec.options.valueColumn, spec.options.labelColumn, spec.options.descriptionColumn].filter(Boolean).join(":") : "";
  const flags = [spec.searchable ? "searchable" : "", spec.defaultFirst ? "defaultFirst" : ""].filter(Boolean).join(",");
  const parts = [spec.key, spec.kind, spec.place, spec.param ?? "", spec.label ?? "", options, flags];
  while (parts.length > 3 && parts[parts.length - 1] === "") parts.pop();
  return parts.join("|");
}

/**
 * "auto" türünün çözümü: seçenek kaynağı ya da değer etiketi → seçim; sütun biçimi number/money → aralık, date → tarih,
 * status → seçim; sorgu sütununun dataType'ı (Boolean → aç/kapa, sayı → aralık, tarih → tarih); parametrenin türü bool →
 * aç/kapa. Parametreli süzgeç tek değer taşır: aralık/tarih çıkarsa metne düşer.
 */
export function resolveKind(spec: FilterSpec, context: { format?: ColumnFormat; hasValueLabels?: boolean; dataType?: string; paramType?: string }): FilterKind {
  let kind: FilterKind;
  if (spec.kind !== "auto") kind = spec.kind;
  else if (spec.options || context.hasValueLabels) kind = "select";
  else if (context.paramType === "bool") kind = "toggle";
  else if (context.format === "number" || context.format === "money") kind = "range";
  else if (context.format === "date") kind = "date";
  else if (context.format === "status") kind = "select";
  else {
    const type = (context.dataType ?? "").toLowerCase();
    kind = type === "boolean" || type === "bool" ? "toggle"
      : ["decimal", "int", "integer", "number", "money", "double"].includes(type) ? "range"
        : type === "date" || type === "datetime" ? "date" : "text";
  }
  return spec.param && (kind === "range" || kind === "date") ? "text" : kind;
}

export const isRange = (value: FilterValue | undefined): value is RangeValue => typeof value === "object" && value !== null;
/** Etkisiz değer: boş metin, kapalı aç/kapa, iki ucu boş aralık. */
export function isEmptyFilterValue(value: FilterValue | undefined): boolean {
  if (value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (isRange(value)) return value.min.trim() === "" && value.max.trim() === "";
  return false;
}

/** Satırdaki hücre: düzleştirilmiş anahtar ("balance.code") ya da iç içe nesne yolu. */
export function cellOf(row: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  let current: unknown = row;
  for (const part of key.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const fold = (text: string) => text.toLocaleLowerCase("tr-TR");
const truthy = (value: unknown) => value === true || value === 1 || (typeof value === "string" && /^(true|1|evet)$/i.test(value));
const toNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(",", ".")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Hücre metni: değer etiketi varsa o da aranır (ör. "Receipt" ve "Giriş"). */
const cellTexts = (row: Record<string, unknown>, key: string, labels?: Record<string, string>) => {
  const raw = cellOf(row, key);
  const text = raw == null || typeof raw === "object" ? "" : String(raw);
  return labels && Object.prototype.hasOwnProperty.call(labels, text) ? [text, labels[text]] : [text];
};

function matches(row: Record<string, unknown>, filter: ResolvedFilter, value: FilterValue, labels?: Record<string, string>): boolean {
  const cell = cellOf(row, filter.key);
  switch (filter.kind) {
    case "toggle": return value !== true || truthy(cell);
    case "select": return typeof value !== "string" || (cell == null ? "" : String(cell)) === value;
    case "range": {
      if (!isRange(value)) return true;
      const number = toNumber(cell);
      const min = toNumber(value.min);
      const max = toNumber(value.max);
      if (min === null && max === null) return true;
      return number !== null && (min === null || number >= min) && (max === null || number <= max);
    }
    case "date": {
      if (!isRange(value)) return true;
      const day = typeof cell === "string" ? cell.slice(0, 10) : "";
      const min = value.min.trim();
      const max = value.max.trim();
      if (!min && !max) return true;
      return day !== "" && (!min || day >= min) && (!max || day <= max);
    }
    default: {
      const needle = typeof value === "string" ? fold(value.trim()) : "";
      return !needle || cellTexts(row, filter.key, labels).some((text) => fold(text).includes(needle));
    }
  }
}

/**
 * Sayfada uygulanan süzgeçler: parametresiz süzgeçler ve (arama parametresi yoksa) arama kutusu yüklenen satırlara uygulanır.
 * Arama, seçili sütunlardan (yoksa verilen tüm sütunlardan) birinde metin geçen satırları bırakır.
 */
export function applyClientFilters(rows: Record<string, unknown>[], filters: ResolvedFilter[], values: FilterBarValues,
  search: { columns: string[]; server: boolean } | null, valueLabels: Record<string, Record<string, string>> = {}): Record<string, unknown>[] {
  const active = filters.filter((filter) => !filter.param && !isEmptyFilterValue(values.values[filter.key]));
  const needle = search && !search.server ? fold(values.search.trim()) : "";
  if (active.length === 0 && !needle) return rows;
  return rows.filter((row) => active.every((filter) => matches(row, filter, values.values[filter.key], valueLabels[filter.key]))
    && (!needle || search!.columns.some((column) => cellTexts(row, column, valueLabels[column]).some((text) => fold(text).includes(needle)))));
}

const setPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    current = (current[part] = next !== null && typeof next === "object" ? next : {}) as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
};

/**
 * Bağlama kapsamındaki değerler (`{{<ad>.<parametre ya da anahtar>}}`): metin/seçim boşsa null, aç/kapa true/false,
 * aralık { min, max } (boş uç null). `arama` arama kutusunun metnidir; arama parametresi verilmişse o ad da aynı değeri taşır.
 * Sorgudan seçenekli seçim süzgecinin seçili satırı `seciliSatir.<parametre ya da anahtar>` altındadır (seçim yoksa null), ör.
 * `{{suzgec.seciliSatir.warehouseId.name}}`; değerin kendisi düz kalır.
 */
export function filterScope(filters: ResolvedFilter[], values: FilterBarValues, searchParam?: string): Record<string, unknown> {
  const scope: Record<string, unknown> = { arama: values.search };
  if (searchParam) scope[searchParam] = values.search.trim() === "" ? null : values.search.trim();
  const selected: Record<string, unknown> = {};
  for (const filter of filters) {
    if (filter.kind !== "select" || !filter.options) continue;
    const value = values.values[filter.key];
    const text = typeof value === "string" ? value.trim() : "";
    selected[filter.param ?? filter.key] = text ? filter.choices.find((choice) => choice.value === text)?.row ?? null : null;
  }
  if (Object.keys(selected).length > 0) scope.seciliSatir = selected;
  for (const filter of filters) {
    const value = values.values[filter.key];
    const scoped = filter.kind === "toggle" ? value === true
      : filter.kind === "range" || filter.kind === "date"
        ? { min: isRange(value) && value.min.trim() ? value.min.trim() : null, max: isRange(value) && value.max.trim() ? value.max.trim() : null }
        : typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    if (filter.param) scope[filter.param] = scoped; else setPath(scope, filter.key, scoped);
  }
  return scope;
}

/** Etkin süzgeç çipleri; aç/kapa çipi yalnız etiketini gösterir. */
export function filterChips(filters: ResolvedFilter[], values: FilterBarValues): { key: string; label: string; text: string }[] {
  return filters.flatMap((filter) => {
    const value = values.values[filter.key];
    if (isEmptyFilterValue(value)) return [];
    if (filter.kind === "toggle") return [{ key: filter.key, label: filter.label, text: "" }];
    if (isRange(value)) {
      const min = value.min.trim();
      const max = value.max.trim();
      return [{ key: filter.key, label: filter.label, text: min && max ? `${min} – ${max}` : min ? `≥ ${min}` : `≤ ${max}` }];
    }
    const text = String(value);
    return [{ key: filter.key, label: filter.label, text: filter.choices.find((choice) => choice.value === text)?.label ?? text }];
  });
}

/** Seçim süzgecinin seçenekleri: kaynak sorgu satırları, değer etiketleri ya da yüklenen satırlardaki farklı değerler. */
export function filterChoices(filter: FilterSpec, source: { optionRows?: Record<string, unknown>[]; valueLabels?: Record<string, string>; rows: Record<string, unknown>[] }): FilterOption[] {
  if (filter.options && source.optionRows) {
    return source.optionRows.flatMap((row) => {
      const keys = Object.keys(row);
      const valueColumn = filter.options!.valueColumn ?? keys[0];
      const raw = valueColumn ? row[valueColumn] : undefined;
      if (raw == null || typeof raw === "object") return [];
      const label = row[filter.options!.labelColumn ?? filter.options!.valueColumn ?? keys[1] ?? valueColumn];
      const text = label == null || typeof label === "object" ? String(raw) : String(label);
      const description = filter.options!.descriptionColumn ? row[filter.options!.descriptionColumn] : undefined;
      const extra = description == null || typeof description === "object" ? "" : String(description).trim();
      return [{ value: String(raw), label: extra ? `${text} · ${extra}` : text, row }];
    }).slice(0, 200);
  }
  if (source.valueLabels && Object.keys(source.valueLabels).length > 0) {
    return Object.entries(source.valueLabels).filter(([value]) => value !== "").map(([value, label]) => ({ value, label }));
  }
  const distinct = new Set<string>();
  for (const row of source.rows) {
    const cell = cellOf(row, filter.key);
    if (cell != null && typeof cell !== "object" && String(cell) !== "") distinct.add(String(cell));
    if (distinct.size >= 50) break;
  }
  return [...distinct].sort((a, b) => a.localeCompare(b, "tr")).map((value) => ({ value, label: value }));
}

/**
 * Saklama anahtarı firma (belirtecin `tenant_id` talebi) + sayfa + bileşen başınadır: bir firmanın süzgeci (ör. seçili depo)
 * aynı tarayıcıda başka firmanın sayfasına taşınmaz. Firma bilinmiyorsa anahtar firmasızdır.
 */
export const filterStorageKey = (pageCode: string, componentId: string, tenantId = "") =>
  tenantId ? `nexora.filterBar.${tenantId}.${pageCode}.${componentId}` : `nexora.filterBar.${pageCode}.${componentId}`;

/** Saklanan süzgeç değerleri; yalnız tanımda olan anahtarlar ve doğru biçimli değerler okunur. Depolama kapalıysa boş. */
export function loadFilterValues(key: string, filters: FilterSpec[]): FilterBarValues {
  let parsed: unknown;
  try { parsed = JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return EMPTY_FILTER_VALUES; }
  if (!parsed || typeof parsed !== "object") return EMPTY_FILTER_VALUES;
  const stored = parsed as { search?: unknown; values?: unknown };
  const values: Record<string, FilterValue> = {};
  const raw = stored.values && typeof stored.values === "object" ? stored.values as Record<string, unknown> : {};
  for (const filter of filters) {
    const value = raw[filter.key];
    if (typeof value === "string" || typeof value === "boolean") values[filter.key] = value;
    else if (value && typeof value === "object" && typeof (value as RangeValue).min === "string" && typeof (value as RangeValue).max === "string") {
      values[filter.key] = { min: (value as RangeValue).min, max: (value as RangeValue).max };
    }
  }
  return { search: typeof stored.search === "string" ? stored.search.slice(0, 200) : "", values };
}

/**
 * "Sayfa aç" parametreleri (`{{sayfa.parametre.<ad>}}`) aynı adlı sorgu parametresine bağlı süzgeci doldurur: sayfa başka bir
 * ekrandan bir kayıtla açıldıysa (ör. Depolar → Raf ve Konumlar, `warehouseId`) süzgeç o değerle başlar ve saklanan değerin
 * önüne geçer. Yalnız tek değerli (`param` taşıyan) süzgeçler dolar; aç/kapa "true"/"false" metnini alır, boş parametre yok sayılır.
 */
export function presetFromPageParams(values: FilterBarValues, filters: FilterSpec[], params: Readonly<Record<string, string>>): FilterBarValues {
  let next: Record<string, FilterValue> | null = null;
  for (const filter of filters) {
    if (!filter.param || !Object.prototype.hasOwnProperty.call(params, filter.param)) continue;
    const raw = params[filter.param].trim();
    if (raw === "") continue;
    const value: FilterValue = filter.kind === "toggle" ? /^(true|1|evet)$/i.test(raw) : raw.slice(0, MAX_PRESET_LENGTH);
    next ??= { ...values.values };
    next[filter.key] = value;
  }
  return next ? { ...values, values: next } : values;
}
const MAX_PRESET_LENGTH = 200;

/**
 * Boş değerler saklanmaz; yalnız `keepEmpty` anahtarlarındaki boş metin (ilk seçenek varsayılanlı süzgeçte açıkça seçilen "Tümü")
 * yazılır, böylece yeniden açılışta varsayılan o seçimi ezmez.
 */
export function saveFilterValues(key: string, values: FilterBarValues, keepEmpty: readonly string[] = []) {
  try {
    const kept = Object.fromEntries(Object.entries(values.values).filter(([name, value]) => (value === "" && keepEmpty.includes(name)) || !isEmptyFilterValue(value)));
    if (!values.search && Object.keys(kept).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ search: values.search, values: kept }));
  } catch { /* depolama kapalı ya da dolu: süzgeçler yalnız bu oturumda kalır */ }
}

/** İlk (boş olmayan) seçenek; seçenek yoksa (henüz yüklenmedi) null. Sabit "Tümü" benzeri boş değerli seçenekler atlanır. */
export const firstChoiceValue = (choices: readonly { value: string }[]): string | null => choices.find((choice) => choice.value !== "")?.value ?? null;

/**
 * İlk seçenek varsayılanı (`defaultFirst`): değeri olmayan (anahtarı hiç bulunmayan) seçim süzgeçlerine seçenekler yüklenince ilk
 * seçeneği yazar. Anahtarın varlığı kullanıcının, sayfa parametresinin ya da saklanan değerin seçimidir — açık "Tümü" boş metin
 * olarak tutulur ve ezilmez. `applied` süzgeç başına bir kez uygulanmayı sağlar (seçenek sorgusu yeniden çalışınca değer sıçramaz);
 * değeri olan ya da seçeneği gelen süzgeç işaretlenir. Değişiklik yoksa aynı nesne döner.
 */
export function applyFirstChoices(values: FilterBarValues, filters: ResolvedFilter[], applied: Set<string>, prefix = ""): FilterBarValues {
  let next: Record<string, FilterValue> | null = null;
  for (const filter of filters) {
    const mark = `${prefix}${filter.key}`;
    if (!filter.defaultFirst || filter.kind !== "select" || applied.has(mark)) continue;
    if (Object.prototype.hasOwnProperty.call(values.values, filter.key)) { applied.add(mark); continue; }
    const first = firstChoiceValue(filter.choices);
    if (first === null) continue;
    applied.add(mark);
    next ??= { ...values.values };
    next[filter.key] = first;
  }
  return next ? { ...values, values: next } : values;
}
