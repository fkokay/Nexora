import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Plus, Search, ShieldAlert, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { metricIconOptions } from "./metricIcons";
import { COLUMN_FORMATS, parseColumnFormats, parseToneMap, type ColumnFormat, type Tone } from "./cellFormat";

const MAX_ENTRIES = 20;
const toneLabels: Record<Tone, string> = { info: "Bilgi", success: "Olumlu", warning: "Dikkat", danger: "Hata" };
const toneOrder: Tone[] = ["info", "success", "warning", "danger"];
const formatLabels: Record<ColumnFormat, string> = { text: "Metin", code: "Kod", number: "Sayı", money: "Para", date: "Tarih", status: "Durum etiketi" };

/** Göstergenin simgeleri: tek liste `metricIcons.ts` (sunucu ve ERP ile eşitlenir). */
export const iconOptions = metricIconOptions;

export function ToneSelect({ value, onChange, disabled, label = "Ton" }: { value: Tone | undefined; onChange: (tone: Tone) => void; disabled?: boolean; label?: string }) {
  return <div className="pd-segment" role="group" aria-label={label}>
    {toneOrder.map((tone) => <button type="button" key={tone} disabled={disabled} className={`tone-${tone} ${(value ?? "info") === tone ? "active" : ""}`} aria-pressed={(value ?? "info") === tone} onClick={() => onChange(tone)}>{toneLabels[tone]}</button>)}
  </div>;
}

/** Uyarının durum şeridi simgeleri (sunucudaki AlertIcons); simge verilen uyarı ERP'de şerit olarak çizilir. */
export const alertIconOptions: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "shield", label: "Kalkan", icon: ShieldCheck },
  { value: "shieldAlert", label: "Uyarılı kalkan", icon: ShieldAlert },
  { value: "check", label: "Onay", icon: CheckCircle2 },
  { value: "alert", label: "Uyarı", icon: AlertTriangle },
  { value: "info", label: "Bilgi", icon: Info },
];

type IconOption = { value: string; label: string; icon: LucideIcon; keywords?: string };
const INLINE_ICON_LIMIT = 10;
const fold = (text: string) => text.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

export function IconSelect({ value, onChange, disabled, options = iconOptions }: { value: string | undefined; onChange: (icon: string | undefined) => void; disabled?: boolean;
  options?: IconOption[] }) {
  if (options.length > INLINE_ICON_LIMIT) return <IconPicker value={value} onChange={onChange} disabled={disabled} options={options}/>;
  return <div className="pd-icon-grid" role="group" aria-label="İkon">
    <button type="button" disabled={disabled} className={!value ? "active" : ""} aria-pressed={!value} onClick={() => onChange(undefined)}>İkon yok</button>
    {options.map(({ value: key, label, icon: Icon }) => <button type="button" key={key} title={label} aria-label={label} disabled={disabled} className={value === key ? "active" : ""} aria-pressed={value === key} onClick={() => onChange(key)}><Icon size={15}/></button>)}
  </div>;
}

/** Çok simgeli seçici: tetikleyici seçili simgeyi gösterir; açılır panelde Türkçe adla arama ve simge ızgarası. */
function IconPicker({ value, onChange, disabled, options }: { value: string | undefined; onChange: (icon: string | undefined) => void; disabled?: boolean; options: IconOption[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const needle = fold(query.trim());
  const visible = needle ? options.filter((option) => fold(`${option.label} ${option.keywords ?? ""} ${option.value}`).includes(needle)) : options;
  const pick = (icon: string | undefined) => { onChange(icon); setOpen(false); setQuery(""); };
  const SelectedIcon = selected?.icon;
  return <div className="pd-icon-picker" ref={root} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="pd-icon-picker-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-label={`İkon: ${selected?.label ?? (value ? value : "İkon yok")}`} onClick={() => setOpen(!open)}>
      {SelectedIcon ? <SelectedIcon size={15}/> : <span className="pd-icon-picker-none" aria-hidden="true"/>}
      <span>{selected?.label ?? (value ? value : "İkon yok")}</span>
      <ChevronDown size={13}/>
    </button>
    {open && <div className="pd-icon-picker-panel" role="dialog" aria-label="İkon seç">
      <label className="pd-icon-picker-search"><Search size={13}/><input ref={search} value={query} style={{ paddingLeft: 28 }} placeholder="Ara: depo, kamyon…" aria-label="İkon ara" onChange={(event) => setQuery(event.target.value)}/></label>
      <div className="pd-icon-picker-grid" role="group" aria-label="İkonlar">
        {!needle && <button type="button" className={`pd-icon-picker-clear ${!value ? "active" : ""}`} aria-pressed={!value} onClick={() => pick(undefined)}>İkon yok</button>}
        {visible.map(({ value: key, label, icon: Icon }) => <button type="button" key={key} title={label} aria-label={label} className={value === key ? "active" : ""} aria-pressed={value === key} onClick={() => pick(key)}><Icon size={15}/></button>)}
        {visible.length === 0 && <small className="pd-icon-picker-empty">Eşleşen ikon yok.</small>}
      </div>
    </div>}
  </div>;
}

/** Sunucudaki SafeValue'nun reddettiği karakter/dizileri ayıklar (=, <, >, {{, }}, javascript:, data:). */
export function sanitizeSafeValue(text: string, trim = true): string {
  let next = text;
  for (let previous = ""; previous !== next;) {
    previous = next;
    next = next.replace(/[=<>]/g, "").replace(/\{\{|\}\}/g, "").replace(/javascript:|data:/gi, "");
  }
  return trim ? next.trim() : next;
}

export function ToneMapEditor({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const rows = parseToneMap(value);
  const write = (next: { key: string; tone: Tone }[]) => onChange(next.map((row) => `${row.key}=${row.tone}`));
  const addRow = () => {
    let index = rows.length + 1;
    while (rows.some((row) => row.key === `Değer ${index}`)) index++;
    write([...rows, { key: `Değer ${index}`, tone: "info" }]);
  };
  return <div className="pd-tonemap">
    {rows.map((row, index) => <div className="pd-tonemap-row" key={index}>
      <input key={`${index}:${row.key}`} defaultValue={row.key} disabled={disabled} maxLength={60} aria-label="Değer" onBlur={(event) => { const key = sanitizeSafeValue(event.target.value); if (key && key !== row.key) write(rows.map((item, i) => i === index ? { ...item, key } : item)); else event.target.value = row.key; }}/>
      <ToneSelect value={row.tone} label={`${row.key} tonu`} disabled={disabled} onChange={(tone) => write(rows.map((item, i) => i === index ? { ...item, tone } : item))}/>
      <button type="button" className="pd-icon-button" aria-label="Satırı sil" disabled={disabled} onClick={() => write(rows.filter((_, i) => i !== index))}><X size={13}/></button>
    </div>)}
    <button type="button" className="pd-button small" disabled={disabled || rows.length >= MAX_ENTRIES} onClick={addRow}><Plus size={13}/>Değer ekle</button>
  </div>;
}

export function ColumnFormatEditor({ columns, value, onChange, disabled }: { columns: { code: string; label: string }[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const formats = parseColumnFormats(value);
  const used = Object.keys(formats).length;
  const visible = columns.filter((column) => column.code.length <= 128 && column.code === column.code.trim() && !column.code.includes("="));
  const change = (code: string, format: ColumnFormat) => {
    const next = { ...formats };
    if (format === "text") delete next[code]; else next[code] = format;
    onChange(Object.entries(next).filter(([key]) => !key.includes("=")).map(([key, item]) => `${key}=${item}`).slice(0, MAX_ENTRIES));
  };
  return <ul className="pd-format-list">
    {visible.map((column) => <li key={column.code}>
      <span>{column.label || column.code}</span>
      <select value={formats[column.code] ?? "text"} disabled={disabled} aria-label={`${column.label || column.code} biçimi`} onChange={(event) => change(column.code, event.target.value as ColumnFormat)}>
        {COLUMN_FORMATS.map((format) => <option key={format} value={format} disabled={format !== "text" && !formats[column.code] && used >= MAX_ENTRIES}>{formatLabels[format]}</option>)}
      </select>
    </li>)}
  </ul>;
}
