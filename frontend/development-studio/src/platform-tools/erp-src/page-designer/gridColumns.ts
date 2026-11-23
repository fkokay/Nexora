// erp-web/src/custom-page/gridState.ts ile aynıdır; biri değişirse diğeri de güncellenmelidir.
// (Yalnız sütun tanımı kısmı: parseGridColumn / parseGridColumns; ortak vektörler gridColumns.vectors.json.)
//
// Düzenlenebilir tablo sütunu: "<kod>|<Etiket>|<tür>[|<kurallar>]".
// Seçim sütunu: tür "lookup:<sorgu>:<değerSütunu>:<etiketSütunu>[:<açıklamaSütunu>]".
// Hesaplanan sütun: tür "calc:<sorgu>:<alan>"; değer o sorgunun sonuç satırından (rowKey = satır anahtarı) gelir, salt okunurdur
// ve kural almaz; kayda gönderilmez.

export type GridColumnType = "text" | "number" | "date" | "checkbox" | "lookup" | "calc";
export type GridColumnRules = { required: boolean; unique: boolean; upperCase: boolean; readOnly: boolean; maxLength?: number; min?: number; max?: number; step?: number };
/** Seçim sütununun seçenek kaynağı: sayfadaki okuma sorgusu ve sütunları. */
export type GridColumnLookup = { query: string; valueColumn: string; labelColumn: string; descriptionColumn?: string };
/** Hesaplanan sütunun kaynağı: sayfadaki (önizleme) sorgusu ve sonuç satırının alanı. */
export type GridColumnCalc = { query: string; field: string };
export type GridColumn = { code: string; label: string; inputType: GridColumnType; rules: GridColumnRules; lookup?: GridColumnLookup; calc?: GridColumnCalc };

export const GRID_COLUMN_TYPES: readonly GridColumnType[] = ["text", "number", "date", "checkbox", "lookup", "calc"];
export const MAX_GRID_COLUMNS = 16;
export const MAX_GRID_LABEL = 60;
export const MAX_GRID_TEXT_LENGTH = 4000;
const CODE = /^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[\p{L}\p{N}_ -]{1,40})?$/u;
const NUMBER = /^-?\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;
/** Seçim sütunu türü: sorgu kimliği ve sütun yolları (erp-web LOOKUP_QUERY / LOOKUP_COLUMN ile aynı). */
const LOOKUP_QUERY = /^[A-Za-z0-9_-]{1,64}$/;
export const LOOKUP_COLUMN = /^[A-Za-z_][A-Za-z0-9_]{0,63}(\.[A-Za-z_][A-Za-z0-9_]{0,63})*$/;

/** "lookup:<sorgu>:<değer>:<etiket>[:<açıklama>]" türünü okur; seçim türü değilse undefined, bozuksa null. */
function parseLookupType(type: string): GridColumnLookup | null | undefined {
  if (!type.startsWith("lookup:")) return undefined;
  const parts = type.slice("lookup:".length).split(":");
  if (parts.length < 3 || parts.length > 4) return null;
  const [query, valueColumn, labelColumn, descriptionColumn] = parts;
  if (!LOOKUP_QUERY.test(query) || !LOOKUP_COLUMN.test(valueColumn) || !LOOKUP_COLUMN.test(labelColumn)) return null;
  if (descriptionColumn !== undefined && !LOOKUP_COLUMN.test(descriptionColumn)) return null;
  return { query, valueColumn, labelColumn, ...(descriptionColumn !== undefined ? { descriptionColumn } : {}) };
}

/** "calc:<sorgu>:<alan>" türünü okur; hesaplanan tür değilse undefined, bozuksa null. */
function parseCalcType(type: string): GridColumnCalc | null | undefined {
  if (!type.startsWith("calc:")) return undefined;
  const parts = type.slice("calc:".length).split(":");
  if (parts.length !== 2) return null;
  const [query, field] = parts;
  if (!LOOKUP_QUERY.test(query) || !LOOKUP_COLUMN.test(field)) return null;
  return { query, field };
}

// erp-web gridState.ts'teki adlarla (parseGridColumn birebir kopyadır).
const COLUMN_CODE = CODE;
const INPUT_TYPES: readonly string[] = ["text", "number", "date", "checkbox"];
const RULE_NUMBER = NUMBER;
const RULE_INTEGER = INTEGER;
const MAX_LABEL = MAX_GRID_LABEL;
type GridInputType = GridColumnType;

/** Sütun tanımını ayrıştırır; geçersizse Türkçe neden döner (erp-web parseGridColumn'un birebir kopyası). */
export function parseGridColumn(text: string): { ok: true; column: GridColumn } | { ok: false; error: string } {
  const fail = (reason: string) => ({ ok: false as const, error: `Sütun tanımı geçersiz (${reason}): ${text}` });
  if (typeof text !== "string") return fail("metin değil");
  const parts = text.split("|");
  if (parts.length < 3 || parts.length > 4) return fail("biçim kod|Etiket|tür[|kurallar] olmalı");
  const [code, label, type, ruleText] = parts;
  if (!COLUMN_CODE.test(code)) return fail("kod");
  if (label.length < 1 || label.length > MAX_LABEL || label.trim() === "") return fail("etiket 1-60 karakter olmalı");
  const lookup = parseLookupType(type);
  if (lookup === null) return fail("seçim türü lookup:<sorgu>:<değer>:<etiket>[:<açıklama>] olmalı");
  const calc = lookup ? undefined : parseCalcType(type);
  if (calc === null) return fail("hesaplanan tür calc:<sorgu>:<alan> olmalı");
  if (lookup === undefined && calc === undefined && !INPUT_TYPES.includes(type)) return fail("tür text, number, date, checkbox, lookup ya da calc olmalı");
  const inputType: GridInputType = lookup ? "lookup" : calc ? "calc" : type as GridInputType;
  const rules: GridColumnRules = { required: false, unique: false, upperCase: false, readOnly: false };
  if (calc && ruleText !== undefined) return fail("hesaplanan sütun kural almaz");
  if (ruleText !== undefined) {
    for (const token of ruleText.split(",")) {
      const colon = token.indexOf(":");
      const name = colon < 0 ? token : token.slice(0, colon);
      const argument = colon < 0 ? null : token.slice(colon + 1);
      if (argument === null && (name === "required" || name === "unique" || name === "readOnly")) { rules[name] = true; continue; }
      if (argument === null && name === "upperCase") {
        if (inputType !== "text") return fail("upperCase yalnız text sütununda");
        rules.upperCase = true;
        continue;
      }
      if (argument !== null && name === "maxLength") {
        if (inputType !== "text") return fail("maxLength yalnız text sütununda");
        if (!RULE_INTEGER.test(argument)) return fail("maxLength tamsayı olmalı");
        const value = Number(argument);
        if (value < 1 || value > 4000) return fail("maxLength 1-4000 olmalı");
        rules.maxLength = value;
        continue;
      }
      if (argument !== null && (name === "min" || name === "max" || name === "step")) {
        if (inputType !== "number") return fail(`${name} yalnız number sütununda`);
        if (!RULE_NUMBER.test(argument)) return fail(`${name} sayı olmalı`);
        const value = Number(argument);
        if (name === "step" && !(value > 0)) return fail("step sıfırdan büyük olmalı");
        rules[name] = value;
        continue;
      }
      return fail(`bilinmeyen kural '${token}'`);
    }
  }
  if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) return fail("min max'tan büyük olamaz");
  return { ok: true, column: { code, label, inputType, rules, ...(lookup ? { lookup } : {}), ...(calc ? { calc } : {}) } };
}

/** `gridColumns` özelliğini okur: metin olmayan ve geçersiz girdiler atlanır, en fazla 16 sütun. */
export function parseGridColumns(value: unknown): GridColumn[] {
  if (!Array.isArray(value)) return [];
  const columns: GridColumn[] = [];
  for (const item of value) {
    if (columns.length >= MAX_GRID_COLUMNS) break;
    if (typeof item !== "string") continue;
    const parsed = parseGridColumn(item);
    if (parsed.ok) columns.push(parsed.column);
  }
  return columns;
}

/**
 * Sayıyı üssüz yazar (kural sözdizimi `-?\d+(\.\d+)?`): String(1e-7) "1e-7" verir ve sunucu/erp-web onu reddeder.
 */
export function plainNumber(value: number): string {
  const text = String(value);
  if (!/e/i.test(text)) return text;
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/** Studio: sütunu kayıt biçimine yazar (parseGridColumn'un tersi); türe uymayan kurallar yazılmaz. */
export function gridColumnText(column: GridColumn): string {
  const { rules, inputType } = column;
  if (inputType === "calc") return `${column.code}|${column.label}|${lookupTypeText(column)}`;
  const tokens: string[] = [];
  if (rules.required) tokens.push("required");
  if (rules.unique) tokens.push("unique");
  if (rules.upperCase && inputType === "text") tokens.push("upperCase");
  if (rules.readOnly) tokens.push("readOnly");
  if (inputType === "text" && rules.maxLength !== undefined) tokens.push(`maxLength:${rules.maxLength}`);
  if (inputType === "number") {
    if (rules.min !== undefined) tokens.push(`min:${plainNumber(rules.min)}`);
    if (rules.max !== undefined) tokens.push(`max:${plainNumber(rules.max)}`);
    if (rules.step !== undefined) tokens.push(`step:${plainNumber(rules.step)}`);
  }
  const base = `${column.code}|${column.label}|${lookupTypeText(column)}`;
  return tokens.length > 0 ? `${base}|${tokens.join(",")}` : base;
}

/** Sütunun tür bölümü: seçim sütununda "lookup:sorgu:değer:etiket[:açıklama]", hesaplananda "calc:sorgu:alan", diğerlerinde tür adı. */
export function lookupTypeText(column: GridColumn): string {
  if (column.inputType === "calc") return ["calc", column.calc?.query ?? "", column.calc?.field ?? ""].join(":");
  if (column.inputType !== "lookup") return column.inputType;
  const lookup = column.lookup ?? { query: "", valueColumn: "", labelColumn: "" };
  return ["lookup", lookup.query, lookup.valueColumn, lookup.labelColumn, ...(lookup.descriptionColumn ? [lookup.descriptionColumn] : [])].join(":");
}

/** Sütun kodunun kökü: "attributes.Renk" → "attributes". */
export const gridColumnRoot = (code: string) => code.split(".")[0];

// ---- Studio: seçim sütunlarının ızgara düzeyi ayarları (columnOptionsWhen, columnStaticOptions) ----

/** Ayar girdisi "<sütun>=<değer>": sütun kodu ilk "=" işaretine kadardır (koşul "==" içerebilir). Geçersizse null. */
export function splitColumnEntry(entry: unknown): { code: string; rest: string } | null {
  if (typeof entry !== "string") return null;
  const index = entry.indexOf("=");
  if (index < 1) return null;
  return { code: entry.slice(0, index), rest: entry.slice(index + 1) };
}

/** Bir sütunun sabit seçeneği "değer=Etiket" (değer boş olabilir: "unitCode==Ana birim" → değer "", etiket "Ana birim"). */
export const COLUMN_STATIC_OPTION = /^[^=]{0,128}=[^=]{1,60}$/;
export const MAX_COLUMN_STATIC_OPTIONS = 20;

/** `columnOptionsWhen` ve `columnStaticOptions` sütun koduna göre: geçersiz girdiler atlanır. */
export function columnEntries(value: unknown): { code: string; rest: string }[] {
  return (Array.isArray(value) ? value : []).map(splitColumnEntry).filter((entry): entry is { code: string; rest: string } => entry !== null);
}

/** Sütun kodu değişince ya da sütun silinince (`next` null) iki ayar listesinin yeni değeri; değişmeyen liste dönmez. */
export function renamedColumnEntries(props: Record<string, unknown>, from: string, next: string | null): Record<string, string[] | undefined> {
  const patch: Record<string, string[] | undefined> = {};
  for (const key of ["columnOptionsWhen", "columnStaticOptions"]) {
    const list = Array.isArray(props[key]) ? (props[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];
    if (!list.some((item) => splitColumnEntry(item)?.code === from)) continue;
    const mapped = list.flatMap((item) => {
      const entry = splitColumnEntry(item);
      if (entry?.code !== from) return [item];
      return next === null ? [] : [`${next}=${entry.rest}`];
    });
    patch[key] = mapped.length > 0 ? mapped : undefined;
  }
  return patch;
}

/** Düzenlenebilir tablonun alt toplam sütunları (`totals`): yalnız tablonun sayı sütunlarının kodları, sırasıyla (varyant kipinde yok). */
export function gridTotalCodes(props: Record<string, unknown>): string[] {
  if (props.gridMode === "matrix" || !Array.isArray(props.totals)) return [];
  const numbers = new Set(parseGridColumns(props.gridColumns).filter((column) => column.inputType === "number").map((column) => column.code));
  return props.totals.filter((code, index, list): code is string => typeof code === "string" && numbers.has(code) && list.indexOf(code) === index);
}

/** Sütun yeniden adlanınca ya da sayı sütunu olmaktan çıkınca (`next` null) `totals` girdisini taşır / kaldırır; değişiklik yoksa boş yama. */
export function renamedTotals(props: Record<string, unknown>, from: string, next: string | null): { totals?: string[] | undefined } {
  const list = Array.isArray(props.totals) ? props.totals.filter((item): item is string => typeof item === "string") : [];
  if (!list.includes(from) || from === next) return {};
  const mapped = list.flatMap((item) => item !== from ? [item] : next === null ? [] : [next]);
  return { totals: mapped.length > 0 ? mapped : undefined };
}
