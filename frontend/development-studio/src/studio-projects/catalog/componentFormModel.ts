/**
 * Yazılımcı bileşeni formunun saf modeli: ayar satırları ve kayıttan önce sunucu sınırlarının Studio eşi
 * (TenantCatalogSchema'daki katalog bileşeni kuralları). Sunucu yayında aynı kuralları yeniden uygular.
 */
export const SETTING_TYPES = ["text", "number", "bool", "choice"] as const;
export type SettingType = (typeof SETTING_TYPES)[number];
export const SETTING_TYPE_LABELS: Record<SettingType, string> = { text: "Metin", number: "Sayı", bool: "Evet/hayır", choice: "Seçim" };

/** Pakette ve bilesen.json'da ayar. */
export type ComponentSetting = { name: string; label: string; type: string; options?: string[]; default?: string | number | boolean };
/** Formdaki ayar satırı: seçenekler virgülle ayrılmış metin, varsayılan metin (evet/hayırda bool). */
export type SettingRow = { name: string; label: string; type: SettingType; options: string; def: string | boolean };

export const MAX_SETTINGS = 10;
export const MAX_OPTIONS = 20;
export const MAX_CSS = 4000;
export const MAX_JAVASCRIPT = 20000;
export const DEFAULT_HEIGHT = 240;
export const MIN_HEIGHT = 80;
export const MAX_HEIGHT = 1200;
export const COMPONENT_CODE_PATTERN = /^[a-z][a-zA-Z0-9]{0,39}$/;
export const SETTING_NAME_PATTERN = /^[a-z][a-zA-Z0-9]{0,31}$/;
const COMPONENT_KEYS = new Set(["code", "label", "description", "height", "settings"]);
const SETTING_KEYS = new Set(["name", "label", "type", "options", "default"]);
const SAMPLE_OPTIONS = "Seçenek 1, Seçenek 2";

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isSettingType = (value: unknown): value is SettingType => SETTING_TYPES.includes(value as SettingType);
const splitOptions = (text: string) => text.split(",").map(o => o.trim()).filter(Boolean);

export function addSetting(rows: SettingRow[]): SettingRow[] {
  if (rows.length >= MAX_SETTINGS) return rows;
  const used = new Set(rows.map(r => r.name));
  let n = rows.length + 1;
  while (used.has(`ayar${n}`)) n += 1;
  return [...rows, { name: `ayar${n}`, label: "", type: "text", options: "", def: "" }];
}

export const removeSetting = (rows: SettingRow[], index: number) => rows.filter((_, i) => i !== index);

export function moveSetting(rows: SettingRow[], index: number, delta: number): SettingRow[] {
  const target = index + delta;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Tür değişince varsayılan sıfırlanır (evet/hayırda false); seçim türü boşsa örnek seçeneklerle başlar. */
export function setSetting(rows: SettingRow[], index: number, patch: Partial<SettingRow>): SettingRow[] {
  return rows.map((row, i) => {
    if (i !== index) return row;
    const next = { ...row, ...patch };
    if (patch.type && patch.type !== row.type) {
      next.def = patch.type === "bool" ? false : "";
      if (patch.type === "choice" && !next.options.trim()) next.options = SAMPLE_OPTIONS;
    }
    return next;
  });
}

export function readSettings(json: Record<string, unknown>): SettingRow[] {
  if (!Array.isArray(json.settings)) return [];
  return json.settings.filter(isRecord).map(s => {
    const type: SettingType = isSettingType(s.type) ? s.type : "text";
    const def = type === "bool" ? s.default === true : s.default === undefined || s.default === null ? "" : String(s.default);
    return {
      name: typeof s.name === "string" ? s.name : "",
      label: typeof s.label === "string" ? s.label : "",
      type,
      options: Array.isArray(s.options) ? s.options.filter(o => typeof o === "string").join(", ") : "",
      def,
    };
  });
}

/** Seçenekler yalnız seçim türünde; varsayılan türüne çevrilir, boşsa yazılmaz (evet/hayırda her zaman yazılır). */
export function settingsJson(rows: SettingRow[]): ComponentSetting[] {
  return rows.map(row => {
    const setting: ComponentSetting = { name: row.name.trim(), label: row.label.trim(), type: row.type };
    if (row.type === "choice") setting.options = splitOptions(row.options);
    if (row.type === "bool") setting.default = row.def === true;
    else {
      const raw = typeof row.def === "string" ? row.def.trim() : "";
      if (raw !== "") {
        // Sayıya çevrilemeyen değer metin kalır; componentProblems tür hatası verir.
        const number = Number(raw);
        setting.default = row.type === "number" && Number.isFinite(number) ? number : raw;
      }
    }
    return setting;
  });
}

/** Önizlemenin örnek ayar değerleri: varsayılanlar, yoksa null. */
export function sampleSettingValues(settings: ComponentSetting[]): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {};
  for (const s of settings) values[s.name] = s.default ?? null;
  return values;
}

/** Sunucunun HasExternalCss kuralı. */
export const hasExternalCss = (css: string) => /@import|url\(|expression\(/i.test(css);

const defaultFits = (setting: Record<string, unknown>) => {
  const value = setting.default;
  if (value === undefined) return true;
  switch (setting.type) {
    case "text": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "bool": return typeof value === "boolean";
    case "choice": return typeof value === "string" && Array.isArray(setting.options) && setting.options.includes(value);
    default: return true;
  }
};

/** bilesen.json (css/javascript olmadan), stil.css ve kod.js için kayıttan önceki sorunlar; boş dizi: kayda uygun. */
export function componentProblems(json: Record<string, unknown>, css: string, javascript: string): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(json)) if (!COMPONENT_KEYS.has(key)) problems.push(`Bilinmeyen anahtar: ${key}.`);
  if (typeof json.code !== "string" || !COMPONENT_CODE_PATTERN.test(json.code))
    problems.push("Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
  const label = typeof json.label === "string" ? json.label.trim() : "";
  if (label.length < 1 || label.length > 80) problems.push("Danışmanın göreceği ad 1–80 karakter olmalı.");
  if (json.description !== undefined && (typeof json.description !== "string" || json.description.length > 200))
    problems.push("Açıklama en çok 200 karakter olabilir.");
  if (json.height !== undefined && (typeof json.height !== "number" || !Number.isInteger(json.height) || json.height < MIN_HEIGHT || json.height > MAX_HEIGHT))
    problems.push(`Başlangıç yüksekliği ${MIN_HEIGHT} ile ${MAX_HEIGHT} arasında bir tam sayı olmalı.`);
  if (css.length > MAX_CSS) problems.push(`CSS en çok ${MAX_CSS} karakter olabilir.`);
  if (hasExternalCss(css)) problems.push("CSS'te harici kaynak kullanılamaz.");
  if (!javascript.trim()) problems.push("Katalog bileşeninin kodu ve JavaScript'i olmalı.");
  if (javascript.length > MAX_JAVASCRIPT) problems.push(`JavaScript en çok ${MAX_JAVASCRIPT} karakter olabilir.`);
  const settings = json.settings === undefined ? [] : json.settings;
  if (!Array.isArray(settings)) { problems.push("Ayarlar bir liste olmalı."); return problems; }
  if (settings.length > MAX_SETTINGS) problems.push(`Katalog bileşeni en fazla ${MAX_SETTINGS} ayar tanımlayabilir.`);
  const seen = new Set<string>();
  for (const setting of settings) {
    if (!isRecord(setting)) { problems.push("Her ayar bir nesne olmalı."); continue; }
    const name = typeof setting.name === "string" ? setting.name : "";
    for (const key of Object.keys(setting)) if (!SETTING_KEYS.has(key)) problems.push(`Bilinmeyen anahtar: ${key}.`);
    if (!SETTING_NAME_PATTERN.test(name)) problems.push(`Ayar adı '${name}' küçük harfle başlamalı; harf ve rakamlardan oluşmalı (en çok 32).`);
    else if (seen.has(name)) problems.push(`Ayar adı '${name}' birden fazla kez kullanılmış.`);
    seen.add(name);
    const settingLabel = typeof setting.label === "string" ? setting.label.trim() : "";
    if (settingLabel.length < 1 || settingLabel.length > 60) problems.push(`'${name}' ayarının etiketi 1–60 karakter olmalı.`);
    if (!isSettingType(setting.type)) { problems.push(`'${name}' ayarının türü metin, sayı, evet/hayır ya da seçim olmalı.`); continue; }
    if (setting.type === "choice") {
      const options = setting.options;
      if (!Array.isArray(options) || options.length < 1 || options.length > MAX_OPTIONS || options.some(o => typeof o !== "string" || !o.trim()))
        problems.push(`'${name}' seçim ayarı 1–${MAX_OPTIONS} seçenek tanımlamalı.`);
    } else if (setting.options !== undefined) problems.push(`'${name}' ayarında seçenekler yalnız seçim türünde yazılır.`);
    if (!defaultFits(setting)) problems.push(`Bileşen ayarı '${name}' için değer türü uygun değil.`);
  }
  return problems;
}
