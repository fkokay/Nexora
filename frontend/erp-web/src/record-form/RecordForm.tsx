import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { CopyPlus, Eraser, Save, X } from "lucide-react";
import { useActivePageCommands, usePageCommands } from "../commands/CommandProvider";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import type { MenuCommand } from "../commands/types";
import "./record-form.css";

const DIALOG_SELECTOR = '.modal-backdrop, .modal, [role="dialog"], [aria-modal="true"]';
const TYPING_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const FIELD_SELECTOR = 'input:not([type="hidden"]), select, textarea, [aria-invalid="true"]';
const FOCUSABLE_FIELD_SELECTOR = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
/** The context panel (`aside`) is open by default from this width; below it Ctrl+. opens it. */
const WIDE_QUERY = "(min-width: 1280px)";

/**
 * Whether this form may act on a save shortcut or command: it is not in a hidden keep-alive view, and when dialogs
 * are open (modal backdrops or `aria-modal` elements) it lives inside the topmost one.
 */
function ownsKeyboard(form: HTMLFormElement | null): boolean {
  if (!form || form.closest("[hidden]")) return false;
  const dialogs = Array.from(document.querySelectorAll('.modal-backdrop, [aria-modal="true"]')).filter((el) => !el.closest("[hidden]"));
  const topmost = dialogs[dialogs.length - 1];
  return !topmost || topmost.contains(form);
}

/** Focus sits in another record form on the same screen: that form gets the section and record shortcuts. */
function focusIsInOtherForm(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  return !!active && !!active.closest(".record-form") && !root?.contains(active);
}

function firstInvalidField(scope: Element | null): HTMLElement | null {
  if (!scope) return null;
  return (
    Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).find(
      (field) => field.getAttribute("aria-invalid") === "true" || field.matches(":invalid"),
    ) ?? null
  );
}

function matchesWide(): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY).matches : window.innerWidth >= 1280;
}

function useWideViewport(): boolean {
  const [wide, setWide] = useState(matchesWide);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return wide;
}

type SectionsApi = { goToFirstError: () => void };

type RecordFormContextValue = {
  /** Where a page form's RecordFormTabs draws its section navigator; null while it stays inline (dialogs). */
  navTarget: HTMLElement | null;
  navigator: boolean;
  /** Whether this form may act on its section / record shortcuts right now. */
  ownsKeys: () => boolean;
  sectionsRef: MutableRefObject<SectionsApi | null>;
};

const RecordFormContext = createContext<RecordFormContextValue | null>(null);

export type RecordNav = {
  /** 1-based position of the open record in the list it was opened from. */
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
};

export type RecordFormPageProps = {
  /** Screen title, e.g. "Cari Kart Tanımlama". */
  title: string;
  /** "create" shows the YENİ KAYIT badge, "edit" shows DÜZENLEME. */
  mode: "create" | "edit";
  busy: boolean;
  /** Former header save button label; saving is now the action bar's Kaydet (Ctrl+S). Kept for callers. */
  saveLabel: string;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  /** Why saving is not possible right now (e.g. a required choice is missing); shown on the action bar's Kaydet. */
  saveDisabledReason?: string;
  /** Set a stable id when something outside the form needs to target it. */
  formId?: string;
  /**
   * Enables "Kaydet ve Yeni" (create mode only). Called with `true` right before a
   * save-and-new submit and with `false` before a plain save, so the container knows
   * whether to keep the form open after a successful save.
   */
  onSaveIntent?: (stayForNext: boolean) => void;
  /** Enables "Temizle" (create mode only). */
  onReset?: () => void;
  error?: string;
  onDismissError?: () => void;
  /** Status bar content; use <span>s. `rf-status-warning`, `rf-status-notice`, `rf-status-end` are available. */
  status?: ReactNode;
  /** Meta line under the title, after the mode badge: record code (`rf-code`), status tags, a short summary. */
  subtitle?: ReactNode;
  /** Image box left of the title (46px). */
  media?: ReactNode;
  /** Position in the list the record was opened from; PgUp / PgDn step through it. */
  recordNav?: RecordNav;
  /** Unsaved changes: a number shows "N alan değişti", `true` a generic note. */
  dirty?: boolean | number;
  /** Context panel on the right (cards); open from 1280px, Ctrl+. shows / hides it. */
  aside?: ReactNode;
  /** "dialog" fits the same structure inside an existing modal: tighter padding, no full-height stretch. */
  variant?: "page" | "dialog";
  className?: string;
  children: ReactNode;
};

/**
 * Standard record create/edit screen (mockup 01, record part): a header with title, meta line, change count and
 * record navigation; the action bar; an optional section navigator (from RecordFormTabs) left of the cards; an
 * optional context panel on the right; and a footer with the form's shortcuts and status.
 * While mounted it registers the action bar's Kaydet (Ctrl+S, primary) and, on a page, puts "Kaydet ve Yeni"
 * (Ctrl+F2) and "Temizle" into the İşlemler menu. Inside a modal (whose backdrop covers the bar) it keeps
 * Kaydet, Kaydet ve Yeni and Temizle as its own buttons. F2 is the bar's Yeni and is handled by the page.
 */
export function RecordFormPage({
  title,
  mode,
  busy,
  onSubmit,
  onCancel,
  formId,
  saveDisabledReason,
  onSaveIntent,
  onReset,
  error,
  onDismissError,
  status,
  subtitle,
  media,
  recordNav,
  dirty,
  aside,
  variant = "page",
  className,
  children,
}: RecordFormPageProps) {
  const generatedId = useId();
  const id = formId ?? generatedId;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const canSaveAndNew = mode === "create" && !!onSaveIntent;
  const canReset = mode === "create" && !!onReset;
  // A form inside a modal keeps its own buttons: the modal backdrop covers the action bar.
  const [inDialog, setInDialog] = useState(false);
  useLayoutEffect(() => {
    setInDialog(Boolean(rootRef.current?.parentElement?.closest(DIALOG_SELECTOR)));
  }, []);

  const { slotRef, breadcrumb } = useSlotBreadcrumb();
  const isPage = variant === "page";
  const showSlot = isPage && !inDialog;

  const submit = (stayForNext: boolean) => {
    // Only the form of the topmost dialog (or, without a dialog, the visible page) may save.
    if (!ownsKeyboard(formRef.current)) return;
    onSaveIntent?.(stayForNext);
    formRef.current?.requestSubmit();
  };
  const busyReason = busy ? "Kaydediliyor…" : undefined;
  const more: MenuCommand[] = [];
  if (!inDialog && canSaveAndNew)
    more.push({ id: "record-form-save-and-new", label: "Kaydet ve Yeni", shortcut: "Ctrl+F2", disabledReason: busyReason, run: () => submit(true) });
  if (!inDialog && canReset)
    more.push({ id: "record-form-reset", label: "Temizle", disabledReason: busyReason, run: onReset });
  // Saving is the action bar's Kaydet (Ctrl+S); on a page "Kaydet ve Yeni" and "Temizle" live in its İşlemler menu.
  const markActive = usePageCommands(
    { save: { primary: true, disabledReason: busyReason ?? saveDisabledReason, run: () => submit(false) }, more },
    "form",
    rootRef,
  );
  const undo = useActivePageCommands()?.undo;

  useEffect(() => {
    if (!canSaveAndNew) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || !event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!ownsKeyboard(formRef.current)) return;
      event.preventDefault();
      if (busy) return;
      onSaveIntent?.(true);
      formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, canSaveAndNew, onSaveIntent]);

  const ownsKeys = useCallback(() => ownsKeyboard(formRef.current) && !focusIsInOtherForm(rootRef.current), []);

  // After a failed save: the first invalid field on screen, else the first section marked as incomplete.
  const sectionsRef = useRef<SectionsApi | null>(null);
  const showFirstProblem = useCallback(() => {
    const invalid = firstInvalidField(formRef.current);
    if (invalid) invalid.focus();
    else sectionsRef.current?.goToFirstError();
  }, []);
  // Native validation fires `invalid` on each invalid control in tree order; the first one of an attempt gets focus.
  const invalidHandledRef = useRef(false);
  const onInvalidCapture = (event: FormEvent) => {
    if (invalidHandledRef.current) return;
    invalidHandledRef.current = true;
    queueMicrotask(() => {
      invalidHandledRef.current = false;
    });
    if (event.target instanceof HTMLElement) event.target.focus();
  };
  // A container's own validation reports through `error`: once the submit settles (not busy), show where.
  const awaitingResultRef = useRef(false);
  const [submitCount, setSubmitCount] = useState(0);
  const onSubmitCapture = () => {
    awaitingResultRef.current = true;
    setSubmitCount((count) => count + 1);
  };
  useEffect(() => {
    if (!awaitingResultRef.current || busy) return;
    awaitingResultRef.current = false;
    if (error) showFirstProblem();
  }, [submitCount, busy, error, showFirstProblem]);

  // PgUp / PgDn: previous / next record of the list, not while typing.
  const recordNavRef = useRef(recordNav);
  recordNavRef.current = recordNav;
  const hasRecordNav = !!recordNav;
  useEffect(() => {
    if (!hasRecordNav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "PageUp" && event.key !== "PageDown") return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest(TYPING_SELECTOR)) return;
      if (!ownsKeys()) return;
      const run = event.key === "PageUp" ? recordNavRef.current?.onPrev : recordNavRef.current?.onNext;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasRecordNav, ownsKeys]);

  // Context panel: open from 1280px; Ctrl+. overrides until the viewport crosses the breakpoint again.
  const wide = useWideViewport();
  const [asideOverride, setAsideOverride] = useState<boolean | null>(null);
  useEffect(() => setAsideOverride(null), [wide]);
  const asideOpen = asideOverride ?? wide;
  const hasAside = aside != null && aside !== false;
  useEffect(() => {
    if (!hasAside) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "." || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (!ownsKeys()) return;
      event.preventDefault();
      setAsideOverride((current) => !(current ?? matchesWide()));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasAside, ownsKeys]);

  const [navTarget, setNavTarget] = useState<HTMLDivElement | null>(null);
  const context = useMemo<RecordFormContextValue>(
    () => ({ navTarget, navigator: isPage && !inDialog, ownsKeys, sectionsRef }),
    [navTarget, isPage, inDialog, ownsKeys],
  );

  const dirtyText = typeof dirty === "number" ? (dirty > 0 ? `${dirty} alan değişti` : null) : dirty ? "Kaydedilmemiş değişiklik var" : null;
  const hints = isPage
    ? [
        "Tab sonraki alan",
        "Ctrl+S kaydet",
        undo ? "Ctrl+Z geri al" : null,
        recordNav ? "PgUp/PgDn önceki/sonraki kayıt" : null,
        hasAside ? "Ctrl+. bağlam paneli" : null,
      ].filter((hint): hint is string => !!hint)
    : [];

  return (
    <RecordFormContext.Provider value={context}>
      <div
        ref={rootRef}
        onFocusCapture={markActive}
        className={`record-form${variant === "dialog" ? " record-form--dialog" : ""}${className ? ` ${className}` : ""}`}
      >
        <header className="rf-toolbar">
          <div className="rf-head">
            {media != null && media !== false && <div className="rf-media">{media}</div>}
            <div className="rf-head-text">
              <div className={`rf-title${showSlot && breadcrumb ? " rf-title--crumb" : ""}`}>
                {showSlot && breadcrumb}
                <h1>{title}</h1>
              </div>
              <div className="rf-meta">
                <span className="rf-badge">{mode === "edit" ? "DÜZENLEME" : "YENİ KAYIT"}</span>
                {subtitle}
              </div>
            </div>
          </div>
          <div className="rf-actions">
            {dirtyText && (
              <span className="rf-dirty">
                <i aria-hidden="true" />
                {dirtyText}
              </span>
            )}
            {recordNav && (
              <div className="rf-rnav" role="group" aria-label="Kayıtlar arası gezinme">
                <button type="button" aria-label="Önceki kayıt" disabled={!recordNav.onPrev} onClick={recordNav.onPrev}>
                  ‹ <kbd>PgUp</kbd>
                </button>
                <span>{`${recordNav.index} / ${recordNav.total}`}</span>
                <button type="button" aria-label="Sonraki kayıt" disabled={!recordNav.onNext} onClick={recordNav.onNext}>
                  <kbd>PgDn</kbd> ›
                </button>
              </div>
            )}
            {inDialog && (
              <>
                <button
                  type="submit"
                  form={id}
                  className="rf-btn rf-btn--primary"
                  disabled={busy}
                  onClick={() => onSaveIntent?.(false)}
                >
                  <Save size={16} aria-hidden="true" />
                  {busy ? "Kaydediliyor…" : "Kaydet"}
                  <kbd>Ctrl+S</kbd>
                </button>
                {canSaveAndNew && (
                  <button
                    type="submit"
                    form={id}
                    className="rf-btn"
                    disabled={busy}
                    onClick={() => onSaveIntent?.(true)}
                  >
                    <CopyPlus size={16} aria-hidden="true" />
                    Kaydet ve Yeni
                    <kbd>Ctrl+F2</kbd>
                  </button>
                )}
                {canReset && (
                  <button type="button" className="rf-btn" disabled={busy} onClick={onReset}>
                    <Eraser size={16} aria-hidden="true" />
                    Temizle
                  </button>
                )}
              </>
            )}
            <button type="button" className="rf-btn" onClick={onCancel}>
              <X size={16} aria-hidden="true" />
              Vazgeç
            </button>
          </div>
        </header>
        {showSlot && <ActionBarSlot slotRef={slotRef} />}
        {error && (
          <div className="alert inline-alert rf-error" role="alert">
            {error}
            {onDismissError && (
              <button type="button" aria-label="Hatayı kapat" onClick={onDismissError}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
        {isPage && <div className="rf-snav" ref={setNavTarget} />}
        <form
          id={id}
          ref={formRef}
          className="rf-form"
          onSubmit={onSubmit}
          onSubmitCapture={onSubmitCapture}
          onInvalidCapture={onInvalidCapture}
        >
          {/* Default button: Enter in a single-line field saves, as the former header save button did. */}
          <button
            type="submit"
            className="rf-default-submit"
            tabIndex={-1}
            aria-hidden="true"
            disabled={busy}
            onClick={() => onSaveIntent?.(false)}
          />
          {children}
        </form>
        {hasAside && (
          <aside className="rf-aside" aria-label="Bağlam paneli" hidden={!asideOpen}>
            {aside}
          </aside>
        )}
        {(hints.length > 0 || status) && (
          <footer className="rf-status">
            {hints.length > 0 && (
              <span className="rf-keys">
                {hints.map((hint) => (
                  <span key={hint}>{hint}</span>
                ))}
              </span>
            )}
            {status && (
              <div className="rf-status-content" aria-live="polite">
                {status}
              </div>
            )}
          </footer>
        )}
      </div>
    </RecordFormContext.Provider>
  );
}

/**
 * Card holding a group of fields: title (and an optional `hint` on the right), then the fields as
 * `<label>Etiket<input/></label>` in a three-column grid. Anything other than a label spans the full width.
 */
export function RecordFormGroup({
  title,
  hint,
  bodyClassName,
  children,
}: {
  title: string;
  /** Short note right of the title, e.g. "* zorunlu alan". */
  hint?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="rf-group" aria-labelledby={id}>
      <div className="rf-group-head">
        <h2 id={id}>{title}</h2>
        {hint != null && hint !== false && <small>{hint}</small>}
      </div>
      <div className={`rf-group-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
    </section>
  );
}

/** Marks a changed field (yellow line on the control) and shows its previous value under it. */
export function RecordFieldChange({ previous, children }: { previous: ReactNode; children: ReactNode }) {
  return (
    <div className="rf-changed">
      {children}
      <small className="rf-previous">Önceki: {previous}</small>
    </div>
  );
}

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
      goToFirstError: () => {
        const first = latest.current.tabs.find((tab) => tab.state === "error" || (!tab.state && tab.warning));
        if (first) select(first.key, "invalid");
      },
    };
    sections.current = api;
    return () => {
      if (sections.current === api) sections.current = null;
    };
  }, [context, select]);

  // Ctrl+↑ / Ctrl+↓: previous / next section, also while typing (a Ctrl chord), not under a modal.
  const ownsKeys = context?.ownsKeys;
  useEffect(() => {
    if (!navigator || !ownsKeys) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (!ownsKeys()) return;
      const { tabs: current, active: activeKey } = latest.current;
      const next = current.findIndex((tab) => tab.key === activeKey) + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= current.length) return;
      event.preventDefault();
      select(current[next].key, "field");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigator, ownsKeys, select]);

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

/** Red asterisk for a required field's label. */
export function RequiredMark() {
  return (
    <b className="rf-req" aria-hidden="true">
      {" "}
      *
    </b>
  );
}
