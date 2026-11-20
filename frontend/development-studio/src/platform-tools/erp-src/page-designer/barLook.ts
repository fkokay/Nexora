// Saf (React'siz) kurallar: İşlem Çubuğu görünümü (`barLook`), gizli komutlar (`hiddenCommands`) ve komut koşulları
// (`commandWhen`). Sunucudaki ValidateBarAppearance ile aynı anahtarlar; varsayılana eşit değer yazılmaz, boş liste undefined
// döner (özellik silinir).

export const BAR_COMMAND_IDS = ["new", "open", "save", "delete", "refresh", "filter", "print", "export", "more"] as const;
export type BarCommandId = typeof BAR_COMMAND_IDS[number];

/** Seçenekli anahtarların geçerli değerleri (sunucuyla aynı); her anahtarın varsayılanı BAR_LOOK_DEFAULTS'tadır. */
export const BAR_LOOK_OPTIONS = {
  align: ["start", "center", "end"],
  density: ["compact", "normal", "wide"],
  sticky: ["true", "false"],
  separators: ["true", "false"],
  size: ["sm", "md", "lg"],
  style: ["outline", "solid", "plain"],
  content: ["both", "text", "icon"],
  unbound: ["dim", "hide"],
  hints: ["true", "false"],
  border: ["none", "bottom", "box"],
  radius: ["sharp", "soft", "round"],
  title: ["true", "false"],
} as const;
export type BarLookEnumKey = keyof typeof BAR_LOOK_OPTIONS;
export type BarLookColorKey = "accent" | "background";
export type BarLookKey = BarLookEnumKey | BarLookColorKey;

export const BAR_LOOK_DEFAULTS: Record<BarLookEnumKey, string> = {
  align: "start", density: "normal", sticky: "false", separators: "true", size: "md", style: "outline", content: "both",
  unbound: "dim", hints: "true", border: "box", radius: "soft", title: "true",
};

const COLOR = /^#[0-9A-Fa-f]{6}$/;
const KEY_ORDER: BarLookKey[] = [...Object.keys(BAR_LOOK_OPTIONS) as BarLookEnumKey[], "accent", "background"];

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const orUndefined = (items: string[]) => items.length === 0 ? undefined : items;
const isColorKey = (key: string): key is BarLookColorKey => key === "accent" || key === "background";

/** `barLook` öğelerini sözlüğe çevirir (yalnız bilinen anahtar ve geçerli değer; aynı anahtarda ilk öğe geçer). */
export function parseBarLook(value: unknown): Partial<Record<BarLookKey, string>> {
  const look: Partial<Record<BarLookKey, string>> = {};
  for (const item of strings(value)) {
    const at = item.indexOf("=");
    if (at < 0) continue;
    const key = item.slice(0, at) as BarLookKey;
    const text = item.slice(at + 1);
    if (key in look || !KEY_ORDER.includes(key)) continue;
    if (isColorKey(key) ? COLOR.test(text) : (BAR_LOOK_OPTIONS[key] as readonly string[]).includes(text)) look[key] = text;
  }
  return look;
}

/** Bir anahtarın geçerli değeri: yazılmamışsa varsayılan (renkler için ""). */
export function getBarLook(value: unknown, key: BarLookKey): string {
  return parseBarLook(value)[key] ?? (isColorKey(key) ? "" : BAR_LOOK_DEFAULTS[key]);
}

/** Sözlük biçimi (tuval önizlemesi için): yalnız varsayılandan farklı anahtarlar. */
export const barLookMap = (value: unknown): Record<string, string> => parseBarLook(value) as Record<string, string>;

/**
 * Bir anahtarı ayarlar; undefined, "" ya da varsayılana eşit değer anahtarı kaldırır. Diğer öğeler korunur (yerinde
 * değiştirilir, yeni anahtar sona eklenir). Renk büyük harfli #RRGGBB yazılır.
 */
export function setBarLook(value: unknown, key: BarLookKey, next: string | undefined): string[] | undefined {
  const items = strings(value);
  const normalized = next === undefined || next === "" ? undefined : isColorKey(key) ? next.toUpperCase() : next;
  const keep = normalized !== undefined && (isColorKey(key) ? COLOR.test(normalized) : normalized !== BAR_LOOK_DEFAULTS[key]
    && (BAR_LOOK_OPTIONS[key] as readonly string[]).includes(normalized));
  const entry = `${key}=${normalized}`;
  const result: string[] = [];
  let placed = false;
  for (const item of items) {
    if (item.startsWith(`${key}=`)) {
      if (keep && !placed) result.push(entry);
      placed = true;
      continue;
    }
    result.push(item);
  }
  if (keep && !placed) result.push(entry);
  return orUndefined(result);
}

/** `hiddenCommands` içindeki geçerli komutlar (sabit sırada, tekil). */
export const hiddenCommands = (value: unknown): BarCommandId[] => {
  const items = strings(value);
  return BAR_COMMAND_IDS.filter((id) => items.includes(id));
};

export const isCommandHidden = (value: unknown, id: string) => strings(value).includes(id);

/** Bir komutu gizler ya da gösterir; sonuç sabit sıradadır, boşsa undefined. */
export function setCommandHidden(value: unknown, id: BarCommandId, hidden: boolean): string[] | undefined {
  const items = new Set(hiddenCommands(value));
  if (hidden) items.add(id); else items.delete(id);
  return orUndefined(BAR_COMMAND_IDS.filter((item) => items.has(item)));
}

/** `commandWhen` içinden bir komutun koşulu ("komut=koşul"; koşul ilk "="den sonrasıdır). */
export function getCommandCondition(value: unknown, id: string): string | undefined {
  const item = strings(value).find((entry) => entry.startsWith(`${id}=`));
  if (item === undefined) return undefined;
  const condition = item.slice(id.length + 1);
  return condition === "" ? undefined : condition;
}

/** Bir komutun koşulunu yazar (komut başına tek öğe; yerinde değiştirilir, yeni öğe sona eklenir); boş koşul öğeyi siler. */
export function setCommandCondition(value: unknown, id: BarCommandId, condition: string | undefined): string[] | undefined {
  const result: string[] = [];
  let placed = false;
  for (const item of strings(value)) {
    if (item.startsWith(`${id}=`)) {
      if (condition && !placed) result.push(`${id}=${condition}`);
      placed = true;
      continue;
    }
    result.push(item);
  }
  if (condition && !placed) result.push(`${id}=${condition}`);
  return orUndefined(result);
}

/** Önizlemenin gizlediği komutlar: `hiddenCommands` öğeleri. */
export const hiddenForPreview = (props: Record<string, unknown>): string[] => hiddenCommands(props.hiddenCommands);
