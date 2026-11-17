import { AlertTriangle, BarChart3, Box, CheckCircle2, Clock, Plus, Receipt, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { COLUMN_FORMATS, parseColumnFormats, parseToneMap, type ColumnFormat, type Tone } from "./cellFormat";

const MAX_ENTRIES = 20;
const toneLabels: Record<Tone, string> = { info: "Bilgi", success: "Olumlu", warning: "Dikkat", danger: "Hata" };
const toneOrder: Tone[] = ["info", "success", "warning", "danger"];
const formatLabels: Record<ColumnFormat, string> = { text: "Metin", code: "Kod", number: "Sayı", money: "Para", date: "Tarih", status: "Durum etiketi" };

export const iconOptions: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "box", label: "Kutu", icon: Box },
  { value: "users", label: "Kişiler", icon: Users },
  { value: "receipt", label: "Fiş", icon: Receipt },
  { value: "wallet", label: "Cüzdan", icon: Wallet },
  { value: "chart", label: "Grafik", icon: BarChart3 },
  { value: "clock", label: "Saat", icon: Clock },
  { value: "check", label: "Onay", icon: CheckCircle2 },
  { value: "alert", label: "Uyarı", icon: AlertTriangle },
];

export function ToneSelect({ value, onChange, disabled, label = "Ton" }: { value: Tone | undefined; onChange: (tone: Tone) => void; disabled?: boolean; label?: string }) {
  return <div className="pd-segment" role="group" aria-label={label}>
    {toneOrder.map((tone) => <button type="button" key={tone} disabled={disabled} className={`tone-${tone} ${(value ?? "info") === tone ? "active" : ""}`} aria-pressed={(value ?? "info") === tone} onClick={() => onChange(tone)}>{toneLabels[tone]}</button>)}
  </div>;
}

export function IconSelect({ value, onChange, disabled }: { value: string | undefined; onChange: (icon: string | undefined) => void; disabled?: boolean }) {
  return <div className="pd-icon-grid" role="group" aria-label="İkon">
    <button type="button" disabled={disabled} className={!value ? "active" : ""} aria-pressed={!value} onClick={() => onChange(undefined)}>İkon yok</button>
    {iconOptions.map(({ value: key, label, icon: Icon }) => <button type="button" key={key} title={label} aria-label={label} disabled={disabled} className={value === key ? "active" : ""} aria-pressed={value === key} onClick={() => onChange(key)}><Icon size={15}/></button>)}
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
