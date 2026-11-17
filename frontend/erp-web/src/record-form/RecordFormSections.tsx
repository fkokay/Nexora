import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE_FIELD_SELECTOR, firstInvalidField, isInPopup, useWindowKeyDown } from "./recordFormKeys";

/** What RecordFormPage asks of its sections: show the section `key` and focus its first invalid field. */
export type SectionsApi = { showInvalid: (key: string) => void };

export type RecordFormContextValue = {
  /** Where a page form's RecordFormTabs draws its section navigator; null while it stays inline (dialogs). */
  navTarget: HTMLElement | null;
  navigator: boolean;
  /** Whether this form may act on its section / record shortcuts right now. */
  ownsKeys: () => boolean;
  sectionsRef: MutableRefObject<SectionsApi | null>;
};

export const RecordFormContext = createContext<RecordFormContextValue | null>(null);

export type RecordFormSectionState = "done" | "error" | "empty";

export type RecordFormTab = {
  key: string;
  label: string;
  /** Marks the section as incomplete or invalid (same as `state: "error"`). */
  warning?: boolean;
  /** ✓ complete, ! incomplete or invalid, ○ empty. */
  state?: RecordFormSectionState;
  /** Number shown at the right of the section (e.g. rows it holds). */
  count?: number;
};

const SECTION_STATE_TEXT: Record<RecordFormSectionState, string> = {
  done: "Tamamlandı",
  error: "Eksik veya hatalı",
  empty: "Boş",
};

/**
 * Sections of a record form. On a page it draws the section navigator left of the cards (✓ / ! / ○ states, counts,
 * "Kart doluluğu %N"; Ctrl+↑/↓ switches sections). In a dialog it is a horizontal tab strip above the content.
 */
export function RecordFormTabs({
  tabs,
  active,
  onChange,
  label,
  completion,
  children,
}: {
  tabs: RecordFormTab[];
  active: string;
  onChange: (key: string) => void;
  /** Accessible name of the section list. */
  label: string;
  /** Percentage of the card that is filled in; shown under the navigator. */
  completion?: number;
  children: ReactNode;
}) {
  const context = useContext(RecordFormContext);
  const navigator = !!context?.navigator;
  const baseId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ tabs, active, onChange });
  latest.current = { tabs, active, onChange };
  // What gets focus once the selected section has rendered.
  const pendingFocusRef = useRef<"field" | "invalid" | "tab" | null>(null);

  const tabId = (key: string) => `${baseId}-tab-${key}`;
  const panelId = `${baseId}-panel`;

  const select = useCallback((key: string, focus: "field" | "invalid" | "tab") => {
    pendingFocusRef.current = focus;
    if (key === latest.current.active) focusPending();
    else latest.current.onChange(key);
  }, []);

  function focusPending() {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const panel = panelRef.current;
    const tab = navRef.current?.querySelector<HTMLElement>(`[aria-selected="true"]`);
    const target =
      (pending === "invalid" ? firstInvalidField(panel) : null) ??
      (pending !== "tab" ? panel?.querySelector<HTMLElement>(FOCUSABLE_FIELD_SELECTOR) : null) ??
      tab;
    target?.focus();
  }

  useLayoutEffect(() => {
    focusPending();
  });

  useEffect(() => {
    if (!context) return;
    const sections = context.sectionsRef;
    const api: SectionsApi = {
      showInvalid: (key) => {
        if (latest.current.tabs.some((tab) => tab.key === key)) select(key, "invalid");
      },
    };
    sections.current = api;
    return () => {
      if (sections.current === api) sections.current = null;
    };
  }, [context, select]);

  // Ctrl+↑ / Ctrl+↓: previous / next section, also while typing (a Ctrl chord), not under a modal.
  const ownsKeys = context?.ownsKeys;
  useWindowKeyDown(navigator && !!ownsKeys, (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    // A textarea (paragraph moves) and open pickers keep their own Ctrl+arrow handling.
    if (event.target instanceof HTMLTextAreaElement || isInPopup(event.target)) return;
    if (!ownsKeys?.()) return;
    const { tabs: current, active: activeKey } = latest.current;
    const next = current.findIndex((tab) => tab.key === activeKey) + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0 || next >= current.length) return;
    event.preventDefault();
    select(current[next].key, "field");
  });

  if (!navigator) {
    return (
      <div className="rf-tabbed">
        <nav className="rf-tabs" aria-label={label}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-current={active === tab.key ? "page" : undefined}
              onClick={() => onChange(tab.key)}
            >
              {tab.label}
              {(tab.state === "error" || (!tab.state && tab.warning)) && (
                <span className="rf-tab-dot" role="img" aria-label="Uyarı var" />
              )}
            </button>
          ))}
        </nav>
        <div className="rf-tab-panel" ref={panelRef}>
          {children}
        </div>
      </div>
    );
  }

  // Arrow keys move along the list (roving focus), as in any vertical tab list.
  const onListKeyDown = (event: ReactKeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const index = tabs.findIndex((tab) => tab.key === active);
    const target =
      event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -2;
    if (target === -2) return;
    event.preventDefault();
    if (target >= 0 && target < tabs.length) select(tabs[target].key, "tab");
  };

  const percent = completion == null ? null : Math.max(0, Math.min(100, Math.round(completion)));
  // State circles only when the screen reports section states; a blank column would just indent the labels.
  const showStates = tabs.some((tab) => tab.state || tab.warning);
  const navigatorContent = (
    <div className="rf-snav-inner" ref={navRef}>
      <div role="tablist" aria-orientation="vertical" aria-label={label} className="rf-snav-list" onKeyDown={onListKeyDown}>
        {tabs.map((tab) => {
          const state = tab.state ?? (tab.warning ? "error" : undefined);
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              id={tabId(tab.key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className="rf-snav-item"
              onClick={() => onChange(tab.key)}
            >
              {showStates && (
                <span className={`rf-snav-state is-${state ?? "none"}`} aria-hidden="true">
                  {state === "done" ? "✓" : state === "error" ? "!" : ""}
                </span>
              )}
              <span className="rf-snav-label">{tab.label}</span>
              {state && <span className="rf-visually-hidden">{SECTION_STATE_TEXT[state]}</span>}
              {tab.count != null && <small>{tab.count}</small>}
            </button>
          );
        })}
      </div>
      {percent != null && (
        <div className="rf-snav-progress">
          <span>{`Kart doluluğu %${percent}`}</span>
          <div
            className="rf-snav-bar"
            role="progressbar"
            aria-label="Kart doluluğu"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <i style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <p className="rf-snav-hint">
        <span>Bölümler arası:</span> <kbd>Ctrl+↑/↓</kbd>
      </p>
    </div>
  );

  return (
    <div className="rf-tabbed rf-tabbed--sections">
      {context?.navTarget && createPortal(navigatorContent, context.navTarget)}
      <div className="rf-tab-panel" role="tabpanel" id={panelId} aria-labelledby={tabId(active)} ref={panelRef}>
        {children}
      </div>
    </div>
  );
}
