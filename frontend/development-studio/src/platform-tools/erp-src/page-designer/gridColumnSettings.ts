// Izgaranın sütun başına ayarları (Sütunlar sekmesi): saf, React'siz kurallar. Kayıt biçimi DEĞİŞMEZ:
//   columnLabels  ["kolon=Başlık"]            (erp-web pairMap: ilk "=" ayraçtır, son girdi geçerlidir)
//   columnUnits   ["kolon=birimKolonu"]       (aynı)
//   valueLabels   ["kolon:değer=Etiket"]      (erp-web parseValueLabels; son girdi geçerlidir)
//   toneMap       ["gösterilen metin=ton"]    (tüm durum sütunlarında ortak; metin etiket ve birimden sonraki metindir)
// Düzenleme yalnız ilgili girdiyi değiştirir, ekler ya da siler; diğer girdiler (sıra, bozuk ya da sorguda olmayan
// sütunlara ait olanlar dahil) bayt bayt korunur. Sınırlar sunucudaki TenantCustomPageSchema ile aynıdır.
import { TONES, type Tone } from "./cellFormat";

export const MAX_COLUMN_MAPS = 20;
export const MAX_VALUE_LABELS = 40;
export const MAX_TONE_MAP = 20;
export const MAX_LABEL_LENGTH = 60;
export const MAX_CODE_LENGTH = 128;

export type EntriesResult = { ok: true; entries: string[] } | { ok: false; error: string };

/** Dizi özelliğinin metin girdileri (metin olmayanlar okunmaz; yazarken korunmaları gerekmez, sunucu zaten reddeder). */
export const stringEntries = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** "anahtar=değer" girdisi (erp-web pairMap ile aynı): ilk "=" ayraçtır; anahtar ya da değer boşsa bozuktur. */
export function parsePair(entry: string): { key: string; value: string } | null {
  const at = entry.indexOf("=");
  return at > 0 && at < entry.length - 1 ? { key: entry.slice(0, at), value: entry.slice(at + 1) } : null;
}

/** Kolonun geçerli değeri (son eşleşen girdi). */
export function pairValue(entries: readonly string[], code: string): string | undefined {
  let found: string | undefined;
  for (const entry of entries) { const pair = parsePair(entry); if (pair?.key === code) found = pair.value; }
  return found;
}

export function pairMapOf(entries: readonly string[]): Record<string, string> {
  const map: Record<string, string> = Object.create(null);
  for (const entry of entries) { const pair = parsePair(entry); if (pair) map[pair.key] = pair.value; }
  return map;
}

/**
 * Kolonun "kolon=değer" girdisini yazar. Boş değer kolonun tüm girdilerini siler; girdi varsa son (geçerli) girdi
 * yerinde değişir, yoksa sona eklenir. `maxValue` değer uzunluğu sınırıdır (başlık 60, birim kolonu 128).
 */
export function setPair(entries: readonly string[], code: string, value: string | undefined, { max = MAX_COLUMN_MAPS, maxValue = MAX_LABEL_LENGTH, what = "sütun" } = {}): EntriesResult {
  const indices = entries.flatMap((entry, index) => parsePair(entry)?.key === code ? [index] : []);
  if (value === undefined || value === "") return { ok: true, entries: entries.filter((_, index) => !indices.includes(index)) };
  if (code.includes("=") || code.length > MAX_CODE_LENGTH) return { ok: false, error: "Bu sütunun kodu ayar için kullanılamaz." };
  if (value.includes("=")) return { ok: false, error: "“=” karakteri kullanılamaz." };
  if (value.length > maxValue) return { ok: false, error: `En fazla ${maxValue} karakter yazılabilir.` };
  const text = `${code}=${value}`;
  if (indices.length > 0) { const next = [...entries]; next[indices[indices.length - 1]] = text; return { ok: true, entries: next }; }
  if (entries.length >= max) return { ok: false, error: `En fazla ${max} ${what} için ayrı ayar yapılabilir.` };
  return { ok: true, entries: [...entries, text] };
}

// --- valueLabels -------------------------------------------------------------------------------------------------

const VALUE_LABEL = /^([^=:]{1,128}):([^=]{0,60})=([^=]{1,60})$/;

export function parseValueLabel(entry: string): { code: string; value: string; label: string } | null {
  const match = VALUE_LABEL.exec(entry);
  return match ? { code: match[1], value: match[2], label: match[3] } : null;
}

/** Kolonun değer → etiket satırları, ilk görülme sırasıyla (aynı değerde son etiket geçerlidir). */
export function columnValueLabels(entries: readonly string[], code: string): { value: string; label: string }[] {
  const rows: { value: string; label: string }[] = [];
  for (const entry of entries) {
    const parsed = parseValueLabel(entry);
    if (!parsed || parsed.code !== code) continue;
    const row = rows.find((item) => item.value === parsed.value);
    if (row) row.label = parsed.label; else rows.push({ value: parsed.value, label: parsed.label });
  }
  return rows;
}

export const valueLabelsAllowed = (code: string) => code !== "" && !code.includes(":") && !code.includes("=") && code.length <= MAX_CODE_LENGTH;

/**
 * Kolonun bir değerinin etiketini yazar (`label` undefined ise siler). `previousValue` verilirse o değerin girdisi
 * yeni değerle yeniden adlandırılır (yerinde).
 */
export function setValueLabel(entries: readonly string[], code: string, value: string, label: string | undefined, previousValue = value): EntriesResult {
  const indicesOf = (target: string) => entries.flatMap((entry, index) => { const parsed = parseValueLabel(entry); return parsed && parsed.code === code && parsed.value === target ? [index] : []; });
  const old = indicesOf(previousValue);
  if (label === undefined) return { ok: true, entries: entries.filter((_, index) => !old.includes(index)) };
  if (!valueLabelsAllowed(code)) return { ok: false, error: "Bu sütunun kodunda “:” ya da “=” olduğu için değer etiketi verilemez." };
  if (value.includes("=") || label.includes("=")) return { ok: false, error: "“=” karakteri kullanılamaz." };
  if (value.length > MAX_LABEL_LENGTH || label.length > MAX_LABEL_LENGTH) return { ok: false, error: `Değer ve etiket en fazla ${MAX_LABEL_LENGTH} karakter olabilir.` };
  if (label === "") return { ok: false, error: "Etiket boş olamaz." };
  if (value !== previousValue && indicesOf(value).length > 0) return { ok: false, error: `“${value}” değeri bu sütunda zaten var.` };
  const text = `${code}:${value}=${label}`;
  if (old.length > 0) {
    const keep = old[old.length - 1];
    return { ok: true, entries: entries.flatMap((entry, index) => index === keep ? [text] : old.includes(index) ? [] : [entry]) };
  }
  if (entries.length >= MAX_VALUE_LABELS) return { ok: false, error: `Sayfada en fazla ${MAX_VALUE_LABELS} değer etiketi olabilir.` };
  return { ok: true, entries: [...entries, text] };
}

// --- toneMap ------------------------------------------------------------------------------------------------------

/** "metin=ton" girdisi (cellFormat.parseToneMap ile aynı: son "=" ayraçtır, ton bilinmeli). */
export function parseToneEntry(entry: string): { key: string; tone: Tone } | null {
  const at = entry.lastIndexOf("=");
  if (at <= 0) return null;
  const key = entry.slice(0, at).trim();
  const tone = entry.slice(at + 1).trim() as Tone;
  return key && TONES.includes(tone) ? { key, tone } : null;
}

const toneKey = (text: string) => text.toLocaleLowerCase("tr-TR").trim();

/** Metnin tonu (ERP toneFor ile aynı: ilk eşleşen, büyük/küçük harf duyarsız). */
export function toneOf(entries: readonly string[], text: string): Tone | undefined {
  for (const entry of entries) { const parsed = parseToneEntry(entry); if (parsed && toneKey(parsed.key) === toneKey(text)) return parsed.tone; }
  return undefined;
}

/** Metnin tonunu yazar (undefined siler). İlk eşleşen girdi yerinde değişir; aynı metnin diğer girdileri kaldırılır. */
export function setTone(entries: readonly string[], text: string, tone: Tone | undefined): EntriesResult {
  const indices = entries.flatMap((entry, index) => { const parsed = parseToneEntry(entry); return parsed && toneKey(parsed.key) === toneKey(text) ? [index] : []; });
  if (tone === undefined) return { ok: true, entries: entries.filter((_, index) => !indices.includes(index)) };
  const key = text.trim();
  if (key === "" || key.includes("=") || key.length > MAX_LABEL_LENGTH) return { ok: false, error: `Renk verilecek metin 1–${MAX_LABEL_LENGTH} karakter olmalı ve “=” içermemelidir.` };
  const entry = `${key}=${tone}`;
  if (indices.length > 0) {
    // Var olan girdinin metni (büyük/küçük harf) korunur; yalnız ton değişir.
    const existing = parseToneEntry(entries[indices[0]])!;
    const same = existing.tone === tone ? entries[indices[0]] : `${existing.key}=${tone}`;
    return { ok: true, entries: entries.flatMap((item, index) => index === indices[0] ? [same] : indices.includes(index) ? [] : [item]) };
  }
  if (entries.length >= MAX_TONE_MAP) return { ok: false, error: `En fazla ${MAX_TONE_MAP} değere renk verilebilir.` };
  return { ok: true, entries: [...entries, entry] };
}

/** Renk anahtarını yeniden adlandırır (etiket değişince renk etiketle birlikte gider). Yeni anahtarda renk varsa dokunulmaz. */
export function renameTone(entries: readonly string[], from: string, to: string): string[] {
  if (toneKey(from) === toneKey(to) || toneOf(entries, to) !== undefined) return [...entries];
  const tone = toneOf(entries, from);
  if (tone === undefined || to.trim() === "" || to.includes("=") || to.length > MAX_LABEL_LENGTH) return [...entries];
  const result = setTone(entries, from, undefined);
  if (!result.ok) return [...entries];
  const index = entries.findIndex((entry) => { const parsed = parseToneEntry(entry); return !!parsed && toneKey(parsed.key) === toneKey(from); });
  const next = [...result.entries];
  next.splice(Math.min(index, next.length), 0, `${to.trim()}=${tone}`);
  return next;
}

// --- Sütun ayrıntısı: değer → etiket → renk satırları ----------------------------------------------------------------

export type ValueRow = { value: string; label: string; tone?: Tone; toneOnly?: boolean };

/**
 * Sütunun ▸ ayrıntısındaki satırlar: önce kolonun değer etiketleri (renk etiketin metninden okunur); durum sütununda
 * ardından hiçbir değer etiketine bağlı olmayan renk eşlemeleri (ortak; ham değere göre çalışır).
 */
export function valueRowsFor(code: string, valueLabels: readonly string[], toneMap: readonly string[], isStatus: boolean): ValueRow[] {
  const rows: ValueRow[] = columnValueLabels(valueLabels, code).map((row) => ({ ...row, tone: isStatus ? toneOf(toneMap, row.label) : undefined }));
  if (!isStatus) return rows;
  const allLabels = new Set(valueLabels.flatMap((entry) => { const parsed = parseValueLabel(entry); return parsed ? [toneKey(parsed.label)] : []; }));
  for (const entry of toneMap) {
    const parsed = parseToneEntry(entry);
    if (!parsed || allLabels.has(toneKey(parsed.key)) || rows.some((row) => row.toneOnly && toneKey(row.value) === toneKey(parsed.key))) continue;
    rows.push({ value: parsed.key, label: "", tone: parsed.tone, toneOnly: true });
  }
  return rows;
}

// --- Sorguda olmayan sütunların ayarları -------------------------------------------------------------------------------

export type OrphanEntry = { prop: "columnLabels" | "columnUnits" | "valueLabels"; entry: string; code: string | null };

/** Sorgu sütunlarında olmayan (ya da bozuk) başlık, birim ve değer etiketi girdileri: listelenip silinebilsin. */
export function orphanEntries(props: { columnLabels?: unknown; columnUnits?: unknown; valueLabels?: unknown }, codes: readonly string[]): OrphanEntry[] {
  const known = new Set(codes);
  const result: OrphanEntry[] = [];
  for (const prop of ["columnLabels", "columnUnits"] as const) for (const entry of stringEntries(props[prop])) {
    const pair = parsePair(entry);
    if (!pair || !known.has(pair.key)) result.push({ prop, entry, code: pair?.key ?? null });
  }
  for (const entry of stringEntries(props.valueLabels)) {
    const parsed = parseValueLabel(entry);
    if (!parsed || !known.has(parsed.code)) result.push({ prop: "valueLabels", entry, code: parsed?.code ?? null });
  }
  return result;
}

/** Bir girdiyi (ilk eşleşen) diziden çıkarır; boş kalırsa undefined (özellik silinir). */
export function withoutEntry(entries: readonly string[], entry: string): string[] | undefined {
  const index = entries.indexOf(entry);
  const next = index < 0 ? [...entries] : [...entries.slice(0, index), ...entries.slice(index + 1)];
  return next.length > 0 ? next : undefined;
}

// --- widthWhen: "genişlik=koşul" ---------------------------------------------------------------------------------------

export const WIDTH_WHEN = /^([1-9]|1[0-2])=([\s\S]+)$/;

export function parseWidthWhen(value: unknown): { width: number; condition: string } | null {
  if (typeof value !== "string") return null;
  const match = WIDTH_WHEN.exec(value);
  return match ? { width: Number(match[1]), condition: match[2] } : null;
}

export const widthWhenText = (width: number, condition: string) => `${width}=${condition}`;

/** Koşul formunun hazır terimleri: pencere açık, listede satır seçili, giriş dolu. */
export type ConditionTerm = { expression: string; label: string };

export function conditionTerms(components: readonly { type: string; name?: string; props: Record<string, unknown> }[], columnsOf: (component: { props: Record<string, unknown> }) => string[]): ConditionTerm[] {
  const terms: ConditionTerm[] = [];
  const name = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const column = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
  for (const component of components) {
    if (!component.name || !name.test(component.name)) continue;
    if (component.type === "dialog") terms.push({ expression: `${component.name}.acik`, label: `${component.name} penceresi açık` });
    if (component.type === "dataTable") {
      // Seçili satır nesnesi koşulda null sayılır; bir sütunu üzerinden sınanır (ör. liste.seciliSatir.id != null).
      // Kimlik sütunlarının her biri aynı anlama gelir (ör. stockItem.id, balance.stockItemId); kayıtlı kural hangisini
      // kullanıyorsa tanınır. Kimlik sütunu yoksa ilk sütun.
      const codes = columnsOf(component).filter((code) => column.test(code));
      const ids = codes.filter((code) => { const lower = code.toLowerCase(); return lower === "id" || lower.endsWith(".id") || lower.endsWith("id") && code.includes("."); });
      for (const key of ids.length > 0 ? ids : codes.slice(0, 1))
        terms.push({ expression: `${component.name}.seciliSatir.${key} != null`, label: `${component.name} listesinde satır seçili${ids.length > 1 ? ` (${key})` : ""}` });
    }
    if (component.type === "input") {
      const label = typeof component.props.label === "string" && component.props.label ? component.props.label : component.name;
      if (component.props.inputType === "checkbox") terms.push({ expression: `${component.name}.value == true`, label: `“${label}” işaretli` });
      else terms.push({ expression: `${component.name}.value != null`, label: `${component.name} girişi dolu` });
    }
  }
  return terms;
}

/** Koşul yalnız hazır terimlerin "&&" ile birleşimiyse terimleri döner; aksi halde null (ham ifade olarak düzenlenir). */
export function splitConditionTerms(condition: string, terms: readonly ConditionTerm[]): string[] | null {
  const parts = condition.split("&&").map((part) => part.trim());
  if (parts.some((part) => part === "")) return null;
  const known = new Set(terms.map((term) => term.expression));
  return parts.every((part) => known.has(part)) ? parts : null;
}

export const joinConditionTerms = (parts: readonly string[]) => parts.join(" && ");
