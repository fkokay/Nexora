import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import "../list-page/list-page-v2.css";
import { SearchableSelect } from "./SearchableSelect";
import { filterChips, isRange, type FilterBarValues, type FilterValue, type ResolvedFilter } from "./filterBarModel";

/**
 * Süzgeç alanı (taslak 14): eski Stok Kartları süzgeç satırı gibi tek satır — arama kutusu, satırdaki süzgeçler ve fazlası
 * "＋ Daha fazla süzgeç (n)" açılır panelinde; altında etkin süzgeç çipleri ve "Tümünü temizle". Form kartının tek satır
 * diziliminin sınıflarını (`list-v2-*`) kullanır, böylece aynı görünür.
 */
export function FilterBar({ search, values, filters, style, searchInputId, onSearch, onChange, onClearAll }: {
  search: { placeholder: string; hint: string } | null;
  /** Arama kutusunun sabit kimliği (İşlem Çubuğu'nun Filtre komutu odaklanır); verilmezse üretilir. */
  searchInputId?: string;
  values: FilterBarValues; filters: ResolvedFilter[]; style: CSSProperties;
  onSearch: (text: string) => void;
  onChange: (key: string, value: FilterValue | undefined) => void;
  onClearAll: () => void;
}) {
  const baseId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const row = filters.filter((filter) => filter.place === "row");
  const more = filters.filter((filter) => filter.place === "more");
  const chips = filterChips(filters, values);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);
  const field = (filter: ResolvedFilter, inPopover: boolean) => {
    const id = `${baseId}-${filter.key}`;
    const value = values.values[filter.key];
    const text = typeof value === "string" ? value : "";
    if (filter.kind === "toggle") {
      const active = value === true;
      return <div className="tenant-page-input tenant-page-input-checkbox">
        <label htmlFor={id} className={`tenant-page-filter-toggle${active ? " is-active" : ""}`}>
          <input id={id} type="checkbox" checked={active} onChange={(event) => onChange(filter.key, event.target.checked || undefined)} /><span>{filter.label}</span>
        </label>
      </div>;
    }
    if (filter.kind === "range" || filter.kind === "date") {
      const range = isRange(value) ? value : { min: "", max: "" };
      const type = filter.kind === "date" ? "date" : "number";
      const set = (bound: "min" | "max", next: string) => {
        const updated = { ...range, [bound]: next };
        onChange(filter.key, updated.min === "" && updated.max === "" ? undefined : updated);
      };
      return <div className="tenant-page-input tenant-page-filter-range" role="group" aria-label={filter.label}>
        {!inPopover && <span className="tenant-page-filter-range-label">{filter.label}</span>}
        <input type={type} aria-label={`${filter.label} ${filter.kind === "date" ? "başlangıç" : "en az"}`} placeholder={filter.kind === "date" ? "başlangıç" : "en az"}
          value={range.min} onChange={(event) => set("min", event.target.value)} />
        <input type={type} aria-label={`${filter.label} ${filter.kind === "date" ? "bitiş" : "en çok"}`} placeholder={filter.kind === "date" ? "bitiş" : "en çok"}
          value={range.max} onChange={(event) => set("max", event.target.value)} />
      </div>;
    }
    if (filter.kind === "select" && filter.searchable) {
      // Aranabilir seçim (`searchable` bayrağı): yazarak süzülen açılır liste; "Tümü" boş değerdir.
      return <div className="tenant-page-input tenant-page-input-lookup tenant-page-filter-searchable">
        <SearchableSelect inputId={id} label={inPopover ? "" : filter.label} ariaLabel={filter.label} value={text} choices={filter.choices} emptyLabel="Tümü"
          onChange={(next) => onChange(filter.key, next || undefined)} />
      </div>;
    }
    if (filter.kind === "select") {
      const orphan = text !== "" && !filter.choices.some((choice) => choice.value === text);
      return <div className="tenant-page-input tenant-page-input-select">
        <label htmlFor={id} className="list-v2-filter">{!inPopover && <span>{filter.label}</span>}
          <select id={id} aria-label={inPopover ? filter.label : undefined} value={text} onChange={(event) => onChange(filter.key, event.target.value || undefined)}>
            <option value="">Tümü</option>
            {filter.choices.map((choice, index) => <option key={`${index}-${choice.value}`} value={choice.value}>{choice.label}</option>)}
            {orphan && <option value={text}>{text}</option>}
          </select>
        </label>
      </div>;
    }
    return <div className="tenant-page-input tenant-page-filter-text">
      <label htmlFor={id} className="list-v2-filter">{!inPopover && <span>{filter.label}</span>}
        <input id={id} type="text" aria-label={inPopover ? filter.label : undefined} placeholder="içerir" value={text} onChange={(event) => onChange(filter.key, event.target.value || undefined)} />
      </label>
    </div>;
  };
  const hintId = `${baseId}-hint`;
  const searchId = searchInputId || `${baseId}-search`;
  return <section className="tenant-page-block tenant-page-form-card is-inline list-v2 tenant-page-filter-bar" style={style} aria-label="Süzgeçler">
    <div className="tenant-page-form-card-grid is-inline list-v2-toolbar">
      {search && <div className="tenant-page-form-card-cell tenant-page-filter-search">
        <div className="tenant-page-input tenant-page-input-text">
          <label htmlFor={searchId} className="list-v2-search" title={search.hint || undefined}><Search size={16} aria-hidden="true" /><span>Ara</span>
            <input id={searchId} type="text" placeholder={search.placeholder} value={values.search} aria-describedby={search.hint ? hintId : undefined}
              onChange={(event) => onSearch(event.target.value)} />
          </label>
          {search.hint && <span id={hintId} className="tenant-page-filter-hint">{search.hint}</span>}
        </div>
      </div>}
      {row.map((filter) => <div key={filter.key} className="tenant-page-form-card-cell">{field(filter, false)}</div>)}
      {more.length > 0 && <div className="tenant-page-form-card-cell tenant-page-filter-more-cell" ref={moreRef}>
        <button type="button" className="tenant-page-filter-more" aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen((open) => !open)}>
          ＋ Daha fazla süzgeç ({more.length})
        </button>
        {moreOpen && <div className="tenant-page-filter-popover" role="dialog" aria-label="Daha fazla süzgeç"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setMoreOpen(false); } }}>
          <b>Daha fazla süzgeç</b>
          {more.map((filter) => <div key={filter.key} className="tenant-page-filter-popover-row">
            {filter.kind !== "toggle" && <span>{filter.label}</span>}{field(filter, true)}
          </div>)}
        </div>}
      </div>}
    </div>
    {chips.length > 0 && <div className="tenant-page-chips tenant-page-filter-chips" role="group" aria-label="Etkin süzgeçler">
      {chips.map((chip) => <span className="tenant-page-chip" key={chip.key}>
        {chip.text ? <><span className="tenant-page-chip-label">{chip.label}:</span><strong>{chip.text}</strong></> : <strong>{chip.label}</strong>}
        <button type="button" aria-label={`${chip.label} süzgecini kaldır`} onClick={() => onChange(chip.key, undefined)}>✕</button>
      </span>)}
      <button type="button" className="tenant-page-chips-clear" onClick={onClearAll}>Tümünü temizle</button>
    </div>}
  </section>;
}
