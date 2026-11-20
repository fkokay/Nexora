import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { displayText } from "./pageBindings";
import type { QueryState } from "./usePageQueries";

export type LookupOption = { value: string; label: string; description: string; row: Record<string, unknown> | null };

/** Gösterilen en fazla seçenek sayısı (sabit seçenekler dahil). */
const MAX_LOOKUP_OPTIONS = 50;

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/** "değer=Etiket" sabit seçenekleri; "=Tüm depolar" boş değerlidir. Bozuk (ayraçsız veya etiketsiz) öğeler atlanır. */
export function staticLookupOptions(value: unknown): LookupOption[] {
  if (!Array.isArray(value)) return [];
  const options: LookupOption[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const index = item.indexOf("=");
    if (index < 0) continue;
    const label = item.slice(index + 1).trim();
    if (!label) continue;
    options.push({ value: item.slice(0, index).trim(), label, description: "", row: null });
  }
  return options;
}

/** Etiketi veya açıklaması aranan metni (tr-TR küçük harfle) içeren seçenekler; boş aramada hepsi. */
const matches = (option: LookupOption, needle: string) => needle === ""
  || option.label.toLocaleLowerCase("tr-TR").includes(needle) || option.description.toLocaleLowerCase("tr-TR").includes(needle);

/**
 * Arama kutusunun seçenekleri: önce sabit seçenekler (her zaman istemcide süzülür), sonra seçenek sorgusunun satırları.
 * Sunucu aramasında (sorgu `{{ad.search}}` bağlıyorsa) satırlar olduğu gibi kullanılır; değilse istemcide süzülür. En fazla 50.
 */
export function lookupOptions(props: Record<string, unknown>, state: QueryState | undefined, search: string, serverSearch: boolean): LookupOption[] {
  return lookupCandidates(props, state, search, serverSearch).slice(0, MAX_LOOKUP_OPTIONS);
}

/** `lookupOptions` ile aynı sıra, sınırsız: dışarıdan gelen değerin etiketi ve satırı 50 sınırının ötesinde de bulunur. */
export function lookupCandidates(props: Record<string, unknown>, state: QueryState | undefined, search: string, serverSearch: boolean): LookupOption[] {
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  const valueColumn = textOf(props.optionValueColumn) || state?.columns[0]?.code || "";
  const labelColumn = textOf(props.optionLabelColumn) || valueColumn;
  const descriptionColumn = textOf(props.optionDescriptionColumn);
  const rows = (state?.rows ?? []).map((row): LookupOption => ({
    value: displayText(row[valueColumn]),
    label: displayText(row[labelColumn]) || displayText(row[valueColumn]),
    description: descriptionColumn ? displayText(row[descriptionColumn]) : "",
    row,
  }));
  const fixed = staticLookupOptions(props.staticOptions).filter((option) => matches(option, needle));
  return [...fixed, ...(serverSearch ? rows : rows.filter((option) => matches(option, needle)))];
}

/** Arama yokken seçili değerin seçeneği 50 sınırının dışında kaldıysa son öğenin yerine konur (etiketi gösterilebilsin). */
export function lookupOptionsWithValue(props: Record<string, unknown>, state: QueryState | undefined, search: string, serverSearch: boolean, value: string): LookupOption[] {
  const all = lookupCandidates(props, state, search, serverSearch);
  const shown = all.slice(0, MAX_LOOKUP_OPTIONS);
  if (search !== "" || value === "" || shown.some((option) => option.value === value)) return shown;
  const own = all.find((option) => option.value === value);
  return own ? [...shown.slice(0, MAX_LOOKUP_OPTIONS - 1), own] : shown;
}

/**
 * Arama kutusu (combobox). Seçimde etiket saklanır; değer dışarıdan değişirse (varsayılan, setInput) eşleşen seçeneğin
 * etiketi, eşleşme yoksa ham değer gösterilir; değer hiçbir zaman seçeneklere göre temizlenmez.
 */
export function LookupInput({ inputId, label, raw, onChange, onSearch, options, loading, error, allowClear, disabled, placeholder, selected, appearance = "search", ariaLabel, floating = false }: {
  inputId: string; label: string; raw: string; onChange: (value: string, row: Record<string, unknown> | null, label: string) => void;
  onSearch: (text: string) => void; options: LookupOption[];
  loading: boolean; error?: string; allowClear: boolean; disabled: boolean; placeholder: string;
  /** Sayfa çalışma zamanının sakladığı son seçim (bileşen yeniden bağlansa da, ör. visibleWhen açılıp kapanınca, kaybolmaz). */
  selected?: { value: string; label: string } | null;
  /**
   * "select": tek satır süzgeç dizilimindeki açılır liste görünümü (eski ekranın depo seçicisi): değer metni ve ⌄; tıklayınca
   * liste açılır, odakta metin seçilir (yazmak aramayı başlatır). Boş değerli seçenek (ör. "Tüm depolar") varsa ✕ çizilmez.
   */
  appearance?: "search" | "select";
  /** Etiket çizilmediğinde (ör. "Daha fazla süzgeç" panelinde) girişin erişilebilir adı. */
  ariaLabel?: string;
  /**
   * Liste kaydırılan bir kabın (ör. pencere gövdesi, tablo) içinde kesilmesin diye ekrana sabitlenir (`position: fixed`);
   * aşağıda yer yoksa girişin üstüne açılır. Düzenlenebilir tablonun seçim hücreleri kullanır.
   */
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Yazılan arama metni; null iken kutuda seçili etiket görünür.
  const [text, setText] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const [localChosen, setChosen] = useState<{ value: string; label: string } | null>(null);
  const chosen = selected !== undefined ? selected : localChosen;
  const listId = `${inputId}-listbox`;
  const controlRef = useRef<HTMLDivElement>(null);
  const [floatStyle, setFloatStyle] = useState<CSSProperties | undefined>(undefined);
  const display = chosen && chosen.value === raw ? chosen.label : options.find((option) => option.value === raw)?.label ?? raw;
  const listOpen = open && !disabled;
  const isSelect = appearance === "select";
  // Açılır liste görünümünde boş değerli seçenek temizleme işini görür; ✕ yalnız böyle bir seçenek yoksa çizilir.
  const showClear = allowClear && raw !== "" && !disabled && !(isSelect && options.some((option) => option.value === ""));

  const close = () => {
    setOpen(false);
    setHighlight(-1);
    if (text !== null) { setText(null); onSearch(""); }
  };
  const choose = (option: LookupOption) => {
    setChosen({ value: option.value, label: option.label });
    onChange(option.value, option.row, option.label);
    close();
  };
  const clear = () => {
    setChosen(null);
    onChange("", null, "");
    close();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      // Vurgulu seçenek yoksa, aranan metin varken ilk sonuç seçilir (yaz + Enter).
      const index = highlight >= 0 ? highlight : text !== null && text.trim() !== "" ? 0 : -1;
      if (listOpen && !loading && index >= 0 && options[index]) { event.preventDefault(); choose(options[index]); }
    } else if (event.key === "Escape") {
      if (listOpen) { event.preventDefault(); close(); }
    }
  };
  const active = listOpen && !loading && highlight >= 0 && options[highlight] ? `${inputId}-option-${highlight}` : undefined;
  // Ok tuşlarıyla vurgulanan seçenek görünür alana kaydırılır (jsdom'da scrollIntoView yoktur).
  useEffect(() => { if (active) document.getElementById(active)?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  // Sabitlenen liste girişin ekrandaki yerini izler (kaydırma ve yeniden boyutlandırma).
  useLayoutEffect(() => {
    if (!floating || !listOpen) { setFloatStyle(undefined); return; }
    const place = () => {
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const up = below < 220 && rect.top > below;
      const width = Math.max(rect.width, 220);
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4));
      setFloatStyle({ position: "fixed", left, width, right: "auto", maxHeight: Math.max(120, Math.min(260, (up ? rect.top : below) - 8)),
        ...(up ? { top: "auto", bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2, bottom: "auto" }) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [floating, listOpen]);

  return <div className={`tenant-page-lookup${isSelect ? " is-select" : ""}`}>
    {label && <label htmlFor={inputId}><span>{label}</span></label>}
    <div className="tenant-page-lookup-control" ref={controlRef}>
      <input id={inputId} type="text" role="combobox" autoComplete="off" aria-label={!label && ariaLabel ? ariaLabel : undefined} aria-autocomplete="list" aria-expanded={listOpen} aria-controls={listId}
        aria-activedescendant={active} disabled={disabled} placeholder={placeholder} value={text ?? display}
        onChange={(event) => { setText(event.target.value); setOpen(true); setHighlight(-1); onSearch(event.target.value); }}
        onClick={() => { if (!disabled) setOpen(true); }}
        onFocus={isSelect ? (event) => event.currentTarget.select() : undefined}
        onKeyDown={onKeyDown} onBlur={close} />
      {isSelect && <ChevronDown className="tenant-page-lookup-chevron" size={16} aria-hidden="true" />}
      {showClear && <button type="button" className="tenant-page-lookup-clear" aria-label="Temizle"
        onMouseDown={(event) => event.preventDefault()} onClick={clear}><X size={14} aria-hidden="true" /></button>}
      {/* Listeye (kaydırma çubuğu dahil) basmak girişi bulanıklaştırıp listeyi kapatmasın. */}
      {listOpen && <ul id={listId} role="listbox" className={`tenant-page-lookup-list${floating ? " is-floating" : ""}`} style={floatStyle} aria-label={label || ariaLabel || undefined} onMouseDown={(event) => event.preventDefault()}>
        {loading ? <li className="tenant-page-lookup-state" role="status">Aranıyor…</li>
          : options.length === 0 ? <li className="tenant-page-lookup-state" role="status">Sonuç bulunamadı.</li>
            : options.map((option, index) => <li key={`${index}-${option.value}`} id={`${inputId}-option-${index}`} role="option"
              aria-selected={option.value === raw} className={index === highlight ? "is-active" : undefined}
              onClick={() => choose(option)}>
              <span>{option.label}</span>{option.description && <small>{option.description}</small>}
            </li>)}
      </ul>}
    </div>
    {error && <small className="tenant-page-input-error" role="alert">{error}</small>}
  </div>;
}
