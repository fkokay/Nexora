import { Children, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { formatCell } from "./cellFormat";

/** Form kartı — taslak `.card` + `.fg3`: başlık ve girişlerin 1/2/3 sütunlu ızgarası. */
export function FormCard({ title, columns, children, style, meta }: { title: string; columns: 1 | 2 | 3; children: ReactNode; style: CSSProperties;
  /** Başlık yanındaki kısa bilgi (değişiklik izleme: "<n> değişiklik"). */
  meta?: string }) {
  return <section className="tenant-page-block tenant-page-form-card" style={style}>
    {title && <h3>{title}</h3>}
    {meta && <span className="tenant-page-form-card-meta" role="status">{meta}</span>}
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
  const groupRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    const group = groupRef.current;
    if (!group) return;
    const buttons = group.querySelectorAll<HTMLButtonElement>(".tenant-page-chip button");
    (buttons[Math.min(index, buttons.length - 1)] ?? group.querySelector<HTMLButtonElement>(".tenant-page-chips-clear"))?.focus();
  }, [chips.length]);
  if (chips.length === 0) return null;
  return <div ref={groupRef} className="tenant-page-chips" style={style} role="group" aria-label="Etkin süzgeçler">
    {chips.map((chip, index) => <span className="tenant-page-chip" key={chip.id}>
      <span className="tenant-page-chip-label">{chip.label}:</span>
      <strong>{chip.text}</strong>
      <button type="button" aria-label={`${chip.label} süzgecini kaldır`} onClick={() => { pendingFocus.current = index; onClear(chip.id); }}>✕</button>
    </span>)}
    <button type="button" className="tenant-page-chips-clear" aria-label="Tüm süzgeçleri temizle" onClick={onClearAll}>Temizle</button>
  </div>;
}

const RELATED_MAX = 5;

/** Bağlam paneli — taslak `.det`: seçili tablo satırının alanları (2 sütunlu kutular) ve isteğe bağlı ilgili kayıt listesi. */
export function ContextPanel({ title, row, fields, related, style }: {
  title: string; row: Record<string, unknown> | null; fields: { code: string; label: string; text: string }[];
  related?: { title: string; rows: string[]; loading: boolean; error?: string }; style: CSSProperties;
}) {
  return <aside className="tenant-page-block tenant-page-context" style={style}>
    {title && <h3>{title}</h3>}
    {row === null ? <p className="tenant-page-context-empty" role="status">Bir satır seçin</p> : <>
      <dl className="tenant-page-context-fields">
        {fields.map((field) => <div className="tenant-page-context-field" key={field.code}>
          <dt>{field.label}</dt>
          <dd>{field.text}</dd>
        </div>)}
      </dl>
      {related && <section className="tenant-page-context-related">
        <h4>{related.title}</h4>
        {related.loading ? <p className="tenant-page-context-note" role="status">Yükleniyor…</p>
          : related.error ? <p className="tenant-page-context-note is-error" role="alert">{related.error}</p>
          : related.rows.length === 0 ? <p className="tenant-page-context-note">Kayıt yok</p>
          : <ul>{related.rows.slice(0, RELATED_MAX).map((text, index) => <li key={index}>{text}</li>)}</ul>}
      </section>}
    </>}
  </aside>;
}

/** Seçenek satırındaki sayı sütunu değeri: boş/null/sonlu olmayan değer sayı sayılmaz ("0" göstermez). */
export function facetCount(cell: unknown): number | undefined {
  if (cell == null || cell === "") return undefined;
  const count = Number(cell);
  return Number.isFinite(count) ? count : undefined;
}

export type FacetGroup = {
  id: string; label: string; options: { value: string; label: string; count?: number }[];
  selected: string; loading: boolean; error?: string;
  /** Girişin `disabledWhen` koşulu doğru: seçenekler pasif, "Temizle" bu grubu atlar. */
  disabled?: boolean;
};

/** Yan filtre paneli — taslak `.facet`: gruplar halinde "Tümü" + seçenekler (düğme grubu, aria-pressed); seçiliye tekrar tıklamak süzgeci kaldırır. */
export function FacetPanel({ title, groups, onSelect, style }: {
  title: string; groups: FacetGroup[]; onSelect: (inputId: string, value: string) => void; style: CSSProperties;
}) {
  return <aside className="tenant-page-block tenant-page-facet" style={style}>
    <div className="tenant-page-facet-head">
      <h3>{title}</h3>
      <button type="button" className="tenant-page-facet-clear" aria-label={`${title || "Süzgeç"} süzgeçlerini temizle`} onClick={() => groups.filter((group) => group.selected !== "" && !group.disabled).forEach((group) => onSelect(group.id, ""))}>Temizle</button>
    </div>
    {groups.map((group) => <div className="tenant-page-facet-group" key={group.id} role="group" aria-label={group.label}>
      <div className="tenant-page-facet-label">{group.label}</div>
      {group.loading ? <p className="tenant-page-facet-state" role="status">Yükleniyor…</p> : <>
        <button type="button" aria-pressed={group.selected === ""} disabled={group.disabled} className={`tenant-page-facet-option${group.selected === "" ? " is-selected" : ""}`} onClick={() => onSelect(group.id, "")}>
          <span>Tümü</span>
        </button>
        {group.options.map((option, index) => {
          const selected = group.selected === option.value;
          return <button type="button" aria-pressed={selected} disabled={group.disabled} key={`${index}-${option.value}`} className={`tenant-page-facet-option${selected ? " is-selected" : ""}`} onClick={() => onSelect(group.id, selected ? "" : option.value)}>
            <span>{option.label}</span>
            {option.count !== undefined && <span className="tenant-page-facet-count">{option.count.toLocaleString("tr-TR")}</span>}
          </button>;
        })}
      </>}
      {group.error && <p className="tenant-page-facet-state is-error" role="alert">{group.error}</p>}
    </div>)}
  </aside>;
}
