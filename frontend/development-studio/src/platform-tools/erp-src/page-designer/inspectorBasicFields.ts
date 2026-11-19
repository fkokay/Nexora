// Saf (React'siz) tablo: Özellikler panelinin "Basit" kipinde her bileşen türü için gösterilen alanlar.
export type InspectorMode = "basic" | "advanced";
export type BasicField =
  | "title" | "text" | "label"
  | "dataQuery" | "columns" | "width"
  | "metricValue" | "icon" | "tone"
  | "inputType" | "required"
  | "actionType" | "actionMain";

/** Türe özgü seçilmiş alanlar; listede olmayan türler başlık/metin + genişlik gösterir. */
export const BASIC_FIELDS: Readonly<Record<string, readonly BasicField[]>> = {
  dataTable: ["title", "dataQuery", "columns", "width"],
  metric: ["title", "metricValue", "icon", "tone"],
  alert: ["title", "text", "icon", "tone"],
  input: ["label", "inputType", "required"],
  button: ["label", "actionType", "actionMain"],
};

/** "Daha fazla ayar: …" satırında anılan Gelişmiş bölümleri. */
export const MORE_SETTINGS: Readonly<Record<string, readonly string[]>> = {
  dataTable: ["Sayfalama", "Satır eylemleri", "Koşullar", "Görünüm"],
  metric: ["Açıklama", "Eğilim", "Tıklayınca süz", "Koşullar"],
  input: ["Yer tutucu", "Varsayılan değer", "Doğrulama", "Koşullar"],
  button: ["Onay", "Sonra yenile", "Mesajlar", "Koşullar"],
  filterBar: ["Bağlı tablo", "Arama kutusu", "Süzgeçler", "Koşullar"],
};
const DEFAULT_MORE = ["Koşullar", "Görünüm"];

const PRIMARY_TEXT_KEYS: readonly BasicField[] = ["title", "text", "label"];

/**
 * Basit kipte gösterilecek alanlar. `contentKeys` bileşenin "İçerik" bölümündeki özellik anahtarlarıdır; tabloda
 * olmayan türlerde bunların ilk başlık/metin/etiket alanı ve genişlik gösterilir.
 */
export function basicFieldsFor(type: string, contentKeys: readonly string[]): BasicField[] {
  const curated = BASIC_FIELDS[type];
  if (curated) return [...curated];
  const primary = contentKeys.find((key): key is BasicField => (PRIMARY_TEXT_KEYS as readonly string[]).includes(key));
  return primary ? [primary, "width"] : ["width"];
}

export function moreSettingsText(type: string): string {
  return `Daha fazla ayar: ${(MORE_SETTINGS[type] ?? DEFAULT_MORE).join(", ")}…`;
}

export const inspectorModeKey = (type: string) => `nexora.studio.inspectorMode.${type}`;

type ModeStorage = Pick<Storage, "getItem" | "setItem">;
const defaultStorage = (): ModeStorage | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

/** Bileşen türü başına hatırlanan kip; depolama yoksa ya da erişilemezse "basic". */
export function readInspectorMode(type: string, storage: ModeStorage | null = defaultStorage()): InspectorMode {
  try { return storage?.getItem(inspectorModeKey(type)) === "advanced" ? "advanced" : "basic"; } catch { return "basic"; }
}

export function writeInspectorMode(type: string, mode: InspectorMode, storage: ModeStorage | null = defaultStorage()): void {
  try { storage?.setItem(inspectorModeKey(type), mode); } catch { /* depolama kapalı */ }
}
