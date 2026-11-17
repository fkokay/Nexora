import { Children, type CSSProperties, type ReactNode } from "react";
import { formatCell } from "./cellFormat";

/** Form kartı — taslak `.card` + `.fg3`: başlık ve girişlerin 1/2/3 sütunlu ızgarası. */
export function FormCard({ title, columns, children, style }: { title: string; columns: 1 | 2 | 3; children: ReactNode; style: CSSProperties }) {
  return <section className="tenant-page-block tenant-page-form-card" style={style}>
    {title && <h3>{title}</h3>}
    <div className={`tenant-page-form-card-grid is-cols-${columns}`}>
      {Children.map(children, (child) => child == null || child === false ? null : <div className="tenant-page-form-card-cell">{child}</div>)}
    </div>
  </section>;
}

type Option = { value: string; label: string };

/** Süzgeç çipinin metni: boş/etkisiz değer `null` (çip çizilmez). */
export function chipText(raw: unknown, inputType: string, options?: Option[]): string | null {
  if (inputType === "checkbox") return raw === true ? "Evet" : null;
  if (raw == null || raw === false || (typeof raw === "string" && raw.trim() === "")) return null;
  if (raw === true) return "Evet";
  const text = String(raw);
  if (inputType === "date") return formatCell(text, "date");
  if (inputType === "select") return options?.find((option) => option.value === text)?.label ?? text;
  return text;
}

/** Süzgeç çipleri — taslak `.chips`/`.chip`: "Etiket: değer ✕" ve hepsini kaldıran "Temizle". Çip yoksa hiçbir şey çizilmez. */
export function FilterChips({ chips, onClear, onClearAll, style }: {
  chips: { id: string; label: string; text: string }[]; onClear: (id: string) => void; onClearAll: () => void; style: CSSProperties;
}) {
  if (chips.length === 0) return null;
  return <div className="tenant-page-chips" style={style} role="group" aria-label="Etkin süzgeçler">
    {chips.map((chip) => <span className="tenant-page-chip" key={chip.id}>
      <span className="tenant-page-chip-label">{chip.label}:</span>
      <strong>{chip.text}</strong>
      <button type="button" aria-label={`${chip.label} süzgecini kaldır`} onClick={() => onClear(chip.id)}>✕</button>
    </span>)}
    <button type="button" className="tenant-page-chips-clear" onClick={onClearAll}>Temizle</button>
  </div>;
}

export type FacetGroup = {
  id: string; label: string; options: { value: string; label: string; count?: number }[];
  selected: string; loading: boolean; error?: string;
};

/** Yan filtre paneli — taslak `.facet`: gruplar halinde "Tümü" + seçenekler (radio); seçiliye tekrar tıklamak süzgeci kaldırır. */
export function FacetPanel({ title, groups, onSelect, style }: {
  title: string; groups: FacetGroup[]; onSelect: (inputId: string, value: string) => void; style: CSSProperties;
}) {
  return <aside className="tenant-page-block tenant-page-facet" style={style}>
    <div className="tenant-page-facet-head">
      <h3>{title}</h3>
      <button type="button" className="tenant-page-facet-clear" onClick={() => groups.filter((group) => group.selected !== "").forEach((group) => onSelect(group.id, ""))}>Temizle</button>
    </div>
    {groups.map((group) => <div className="tenant-page-facet-group" key={group.id} role="radiogroup" aria-label={group.label}>
      <div className="tenant-page-facet-label">{group.label}</div>
      {group.loading ? <p className="tenant-page-facet-state" role="status">Yükleniyor…</p> : <>
        <button type="button" role="radio" aria-checked={group.selected === ""} className={`tenant-page-facet-option${group.selected === "" ? " is-selected" : ""}`} onClick={() => onSelect(group.id, "")}>
          <span>Tümü</span>
        </button>
        {group.options.map((option, index) => {
          const selected = group.selected === option.value;
          return <button type="button" role="radio" aria-checked={selected} key={`${index}-${option.value}`} className={`tenant-page-facet-option${selected ? " is-selected" : ""}`} onClick={() => onSelect(group.id, selected ? "" : option.value)}>
            <span>{option.label}</span>
            {option.count !== undefined && <span className="tenant-page-facet-count">{option.count.toLocaleString("tr-TR")}</span>}
          </button>;
        })}
      </>}
      {group.error && <p className="tenant-page-facet-state is-error" role="alert">{group.error}</p>}
    </div>)}
  </aside>;
}
