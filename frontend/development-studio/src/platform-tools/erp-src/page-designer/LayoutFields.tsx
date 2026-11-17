import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { sanitizeSafeValue } from "./DesignLanguageFields";
import { parseFieldList } from "./layoutRefs";

const MAX_ITEMS = 12;
export type PickerInput = { id: string; name?: string; label: string; inputType: string; hasOptions: boolean };

/** Sunucunun SafeValue ve sütun kuralına uyan (kırpılmış, "=" içermeyen, en çok 128 karakter) sütun kodu mu. */
export const isSafeColumnCode = (code: string) => code.length > 0 && code.length <= 128 && code === code.trim() && sanitizeSafeValue(code) === code;

/** Onay kutulu giriş listesi; seçilenler sırayla taşınabilir. Başka sahibe ait girişler soluk ve seçilemez. */
export function InputPicker({ inputs, value, onChange, owned, filter, disabled }: {
  inputs: PickerInput[]; value: string[]; onChange: (next: string[]) => void; owned?: Record<string, string>; filter?: (input: PickerInput) => boolean; disabled?: boolean;
}) {
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const selected = value.filter((id) => byId.has(id));
  const rest = inputs.filter((input) => !value.includes(input.id) && (!filter || filter(input)));
  const move = (index: number, delta: number) => {
    const next = [...selected]; const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const labelCount = new Map<string, number>();
  for (const input of inputs) { const key = input.label || input.id; labelCount.set(key, (labelCount.get(key) ?? 0) + 1); }
  // Varsayılan ("Giriş") ya da yinelenen etiketlerde girişin adı/kimliği ayırt edici olarak eklenir.
  const nameOf = (input: PickerInput) => {
    const base = input.label || input.id;
    return base === "Giriş" || (labelCount.get(base) ?? 0) > 1 ? `${base} (${input.name || input.id})` : base;
  };
  const row = (input: PickerInput, index: number) => {
    const isOn = index >= 0;
    const taken = !isOn ? owned?.[input.id] : undefined;
    return <li key={input.id} className={`${isOn ? "is-on" : ""}${taken ? " is-taken" : ""}`} title={taken ? `Başka kartta: ${taken}` : undefined}>
      <label>
        <input type="checkbox" checked={isOn} disabled={disabled || !!taken || (!isOn && selected.length >= MAX_ITEMS)}
          onChange={(event) => onChange(event.target.checked ? [...selected, input.id] : selected.filter((id) => id !== input.id))}/>
        <span>{nameOf(input)}</span>
        {taken && <small className="pd-taken-hint">Başka kartta</small>}
      </label>
      {isOn && <>
        <button type="button" className="pd-icon-button" aria-label={`${nameOf(input)} yukarı taşı`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={12}/></button>
        <button type="button" className="pd-icon-button" aria-label={`${nameOf(input)} aşağı taşı`} disabled={disabled || index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12}/></button>
      </>}
    </li>;
  };
  if (selected.length === 0 && rest.length === 0) return null;
  return <ul className="pd-columns pd-input-picker">
    {selected.map((id, index) => row(byId.get(id) as PickerInput, index))}
    {rest.map((input) => row(input, -1))}
  </ul>;
}

/** "sütun=Etiket" listesi: sütun seçimi ve etiket metni; "=" ve SafeValue'nun reddettiği parçalar temizlenir. */
export function FieldListEditor({ columns, value, onChange, disabled }: {
  columns: { code: string; label: string }[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean;
}) {
  const rows = parseFieldList(value);
  const usable = columns.filter((column) => isSafeColumnCode(column.code) && !column.code.includes("="));
  const write = (next: { code: string; label: string }[]) => onChange(next.slice(0, MAX_ITEMS).map((item) => `${item.code}=${item.label}`));
  const labelFor = (column: { code: string; label: string }) => sanitizeSafeValue(column.label || column.code).slice(0, 60) || sanitizeSafeValue(column.code).slice(0, 60) || "Alan";
  const free = usable.find((column) => !rows.some((row) => row.code === column.code));
  return <div className="pd-tonemap">
    {rows.map((row, index) => <div className="pd-tonemap-row" key={index}>
      <select value={row.code} disabled={disabled} aria-label={`Alan ${index + 1} sütunu`} onChange={(event) => {
        const column = usable.find((item) => item.code === event.target.value);
        if (column) write(rows.map((item, i) => i === index ? { code: column.code, label: item.label || labelFor(column) } : item));
      }}>
        {usable.filter((column) => column.code === row.code || !rows.some((other) => other.code === column.code)).map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}
        {!usable.some((column) => column.code === row.code) && <option value={row.code}>{row.code}</option>}
      </select>
      <input key={`${index}:${row.label}`} defaultValue={row.label} disabled={disabled} maxLength={60} aria-label={`Alan ${index + 1} etiketi`} onBlur={(event) => {
        const label = sanitizeSafeValue(event.target.value);
        if (label && label !== row.label) write(rows.map((item, i) => i === index ? { ...item, label } : item)); else event.target.value = row.label;
      }}/>
      <button type="button" className="pd-icon-button" aria-label={`Alan ${index + 1} sil`} disabled={disabled} onClick={() => write(rows.filter((_, i) => i !== index))}><X size={13}/></button>
    </div>)}
    <button type="button" className="pd-button small" disabled={disabled || !free || rows.length >= MAX_ITEMS} onClick={() => { if (free) write([...rows, { code: free.code, label: labelFor(free) }]); }}><Plus size={13}/>Alan ekle</button>
  </div>;
}
