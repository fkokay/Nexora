import { useEffect, useRef, type ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import "./list-page-v2.css";

export type ListChipOption = {
  value: string;
  label: string;
  /** Shown after the label; omit when the count is unknown. */
  count?: number | null;
};

type ChipGroupProps = {
  /** Accessible name of the group, e.g. "Durum". */
  label: string;
  options: ListChipOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * For groups without an "all" chip: clicking the active chip clears the filter ("").
   * Leave false when the options include their own "Tümü" chip with value "".
   */
  allowClear?: boolean;
  /** Hides chips whose count is 0, unless that chip is the active filter. */
  hideEmpty?: boolean;
};

/** A row of filter chips that replaces a filter <select> and the summary cards above a list. */
export function ListChipGroup({
  label,
  options,
  value,
  onChange,
  allowClear = false,
  hideEmpty = false,
}: ChipGroupProps) {
  const visible = hideEmpty
    ? options.filter((option) => option.count !== 0 || option.value === value)
    : options;
  return (
    <div className="list-v2-chips" role="group" aria-label={label}>
      {visible.map((option) => {
        const active = option.value === value;
        return (
          <button
            type="button"
            key={option.value || "all"}
            className={`list-v2-chip${active ? " is-active" : ""}`}
            aria-pressed={active}
            onClick={() => onChange(active && allowClear ? "" : option.value)}
          >
            <span>{option.label}</span>
            {option.count != null && (
              <span className="list-v2-chip-count">
                {option.count.toLocaleString("tr-TR")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type ToolbarProps = {
  /** Omit `search` (leave undefined) for lists without a text search. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /**
   * Called shortly after typing stops and on Enter. The page applies its current
   * search text here (typically: reset to page 1 and copy the text into the query).
   */
  onSearchApply?: () => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchDelayMs?: number;
  /** Chip groups and any other filter controls, in reading order. */
  children?: ReactNode;
  /**
   * Receives the element that hosts the grid's own tools. Keep it in state and pass it
   * to AdvancedDataGrid as `toolbarContainer` (usually together with `hideExport`).
   */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
  onRefresh?: () => void;
  refreshLabel?: string;
};

/** The single toolbar row of a list page: search, filter chips, grid tools, refresh. See README.md. */
export function ListToolbar({
  search,
  onSearchChange,
  onSearchApply,
  searchLabel = "Ara",
  searchPlaceholder,
  searchDelayMs = 350,
  children,
  toolsSlotRef,
  onRefresh,
  refreshLabel = "Listeyi yenile",
}: ToolbarProps) {
  // The latest onSearchApply is read through a ref because pages pass a new closure
  // (holding the current text) on every render.
  const applyRef = useRef(onSearchApply);
  applyRef.current = onSearchApply;
  const appliedSearch = useRef(search);
  useEffect(() => {
    if (search === undefined || appliedSearch.current === search) return;
    const timer = window.setTimeout(() => {
      appliedSearch.current = search;
      applyRef.current?.();
    }, searchDelayMs);
    return () => window.clearTimeout(timer);
  }, [search, searchDelayMs]);

  return (
    <div className="list-v2-toolbar">
      {search !== undefined && (
        <form
          className="list-v2-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            appliedSearch.current = search;
            onSearchApply?.();
          }}
        >
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
        </form>
      )}
      {children}
      {(toolsSlotRef || onRefresh) && (
        <div className="list-v2-toolbar-end">
          {toolsSlotRef && <div className="list-v2-grid-tools" ref={toolsSlotRef} />}
          {onRefresh && (
            <button
              type="button"
              className="list-v2-icon-button"
              onClick={onRefresh}
              aria-label={refreshLabel}
              title="Yenile"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
