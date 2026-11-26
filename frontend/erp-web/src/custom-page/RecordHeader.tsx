import type { CSSProperties, ReactNode } from "react";
import { formatCell, type ColumnFormat } from "./cellFormat";
import { METRIC_ICONS } from "./metricIcons";
import { bindingPath, interpolate, literalText, resolvePath, type PageScope } from "./pageBindings";
import "./wizard.css";

const EMPTY = "—";
const MAX_FIELDS = 6;
const FIELD_FORMATS = new Set(["number", "money", "date", "datetime", "text"]);

/** "Etiket=değer" öğeleri: ilk "=" ayraçtır; etiketsiz ya da ayraçsız öğe atlanır (değer boş olabilir). */
const labeledEntries = (value: unknown): [string, string][] => (Array.isArray(value) ? value : []).flatMap((item): [string, string][] => {
  if (typeof item !== "string") return [];
  const at = item.indexOf("=");
  const label = at > 0 ? item.slice(0, at).trim() : "";
  return label ? [[label, item.slice(at + 1)]] : [];
});

/**
 * Şablonun metni: içindeki bağlamaların hepsi boş çözülüyorsa (ör. okuma henüz yanıt vermedi) boş; böylece " · ana birim "
 * gibi yalnız sabit metinden oluşan yarım satır görünmez. Bağlamasız şablon olduğu gibi kalır.
 */
export function templateText(template: string, scope: PageScope): string {
  if (!template.includes("{{")) return template.trim();
  const text = interpolate(template, scope).trim();
  return text === literalText(template).trim() ? "" : text;
}

/** Tek bağlamalı şablonun ham değeri (sayı biçimi için), değilse çözülen metin. */
const templateValue = (template: string, scope: PageScope): unknown => {
  const path = bindingPath(template.trim());
  return path ? resolvePath(scope, path) : templateText(template, scope);
};

export type RecordHeaderField = { label: string; text: string };

/** `fields` / `fieldFormats` / `fieldUnits`: etiket başına biçimlenmiş değer ve birimi; boş ya da null değer "—". */
export function recordHeaderFields(props: Record<string, unknown>, scope: PageScope): RecordHeaderField[] {
  const formats = Object.fromEntries(labeledEntries(props.fieldFormats).map(([label, format]) => [label, format.trim()])
    .filter(([, format]) => FIELD_FORMATS.has(format)));
  const units = Object.fromEntries(labeledEntries(props.fieldUnits));
  return labeledEntries(props.fields).slice(0, MAX_FIELDS).map(([label, template]) => {
    const raw = templateValue(template, scope);
    const value = raw === null || raw === undefined || (typeof raw === "object") ? EMPTY : formatCell(raw, formats[label] as ColumnFormat | undefined);
    const unit = units[label] !== undefined ? templateText(units[label], scope) : "";
    return { label, text: unit && value !== EMPTY ? `${value} ${unit}` : value };
  });
}

/**
 * Kayıt özeti (yalnız sunum; taslak 16'nın 2. adımı): simge karesi, kalın başlık ve soluk alt satır, anahtar/değer çiftleri,
 * sağa yaslı düğmeler. Düğmeleri çağıran çizer (sayfa düğmeleri gibi çalışırlar).
 */
export function RecordHeader({ icon, title, subtitle, fields, buttons, style, record }: {
  icon?: string; title: string; subtitle: string; fields: RecordHeaderField[]; buttons?: ReactNode; style?: CSSProperties;
  /**
   * Kayıt kartı özeti: simge yoksa baş harfli kare (yeni kayıtta "+"), en çok 3 değer, kısaltılan metnin tamamı `title`'da.
   * Verilmezse eski özet birebir çizilir.
   */
  record?: { isNew: boolean };
}) {
  const Icon = icon && Object.hasOwn(METRIC_ICONS, icon) ? METRIC_ICONS[icon] : undefined;
  const full = (text: string) => (record && text ? text : undefined);
  const shown = record ? fields.slice(0, 3) : fields;
  return <section className="tenant-page-record-header" style={style} aria-label={title || undefined}>
    {Icon && <span className="tenant-page-record-header-icon" aria-hidden="true"><Icon size={17} /></span>}
    {!Icon && record && <span className="tenant-page-record-header-icon record-summary-avatar" aria-hidden="true">{record.isNew ? "+" : initials(title)}</span>}
    <span className="tenant-page-record-header-title"><b title={full(title)}>{title || EMPTY}</b>{subtitle && <small title={full(subtitle)}>{subtitle}</small>}</span>
    {shown.length > 0 && <dl className="tenant-page-record-header-fields">
      {shown.map((field) => <div key={field.label}><dt>{field.label}</dt><dd title={full(field.text)}>{field.text}</dd></div>)}
    </dl>}
    {buttons && <span className="tenant-page-record-header-actions">{buttons}</span>}
  </section>;
}

/** Başlığın ilk iki sözcüğünün baş harfleri ("Akdeniz Gıda A.Ş." → "AG"); başlık yoksa boş. */
function initials(title: string): string {
  return title.split(/\s+/).filter((word) => /\p{L}|\p{N}/u.test(word)).slice(0, 2).map((word) => [...word.replace(/[^\p{L}\p{N}]/gu, "")][0] ?? "").join("").toLocaleUpperCase("tr-TR");
}
