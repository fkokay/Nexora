import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CopyPlus, Eraser, Save, X } from "lucide-react";
import { useActivePageCommands, usePageCommands } from "../commands/CommandProvider";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import type { MenuCommand } from "../commands/types";
import { confirmDialog } from "../confirmDialog";
import { RecordFormContext, type RecordFormContextValue, type SectionsApi } from "./RecordFormSections";
import {
  DIALOG_SELECTOR,
  firstInvalidField,
  focusIsInOtherForm,
  isInPopup,
  isInScrollableRegion,
  isTextEntry,
  matchesWide,
  ownsKeyboard,
  useWideViewport,
  useWindowKeyDown,
} from "./recordFormKeys";
import "./record-form.css";

export { RecordFormTabs } from "./RecordFormSections";
export type { RecordFormSectionState, RecordFormTab } from "./RecordFormSections";

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

  // After a failed save, only for field-level problems: focus the first invalid control (`:invalid` or
  // `aria-invalid="true"`). When it sits in a section the container keeps mounted but hidden
  // (`data-rf-section="key"` + `hidden`), that section is shown first. Other errors (server, permission) move nothing.
  const sectionsRef = useRef<SectionsApi | null>(null);
  const showInvalidField = useCallback((field: HTMLElement) => {
    const section = field.closest<HTMLElement>("[data-rf-section]");
    const hiddenSection = section && field.closest("[hidden]") && formRef.current?.contains(section);
    if (hiddenSection && sectionsRef.current) sectionsRef.current.showInvalid(section.getAttribute("data-rf-section") ?? "");
    else field.focus();
  }, []);
  // Native validation fires `invalid` on each invalid control in tree order; the first one of an attempt gets focus.
  const invalidHandledRef = useRef(false);
  const onInvalidCapture = (event: FormEvent) => {
    if (invalidHandledRef.current) return;
    invalidHandledRef.current = true;
    queueMicrotask(() => {
      invalidHandledRef.current = false;
    });
    if (event.target instanceof HTMLElement) showInvalidField(event.target);
  };
  // A container's own validation reports through `error` (and marks fields `aria-invalid`): once the submit
  // settles (not busy), show the first invalid field. A save without an error clears the "touched" mark.
  const awaitingResultRef = useRef(false);
  const touchedRef = useRef(false);
  const [submitCount, setSubmitCount] = useState(0);
  const onSubmitCapture = () => {
    awaitingResultRef.current = true;
    setSubmitCount((count) => count + 1);
  };
  useEffect(() => {
    if (!awaitingResultRef.current || busy) return;
    awaitingResultRef.current = false;
    if (!error) {
      touchedRef.current = false;
      return;
    }
    const invalid = firstInvalidField(formRef.current);
    if (invalid) showInvalidField(invalid);
  }, [submitCount, busy, error, showInvalidField]);
  const markTouched = () => {
    touchedRef.current = true;
  };

  // Esc on a page form = Vazgeç; with entered or changed values it asks first.
  const escapeEnabled = isPage && !inDialog;
  const confirmingRef = useRef(false);
  useWindowKeyDown(escapeEnabled, (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || confirmingRef.current || !ownsKeys()) return;
    event.preventDefault();
    if (!touchedRef.current && !dirty) {
      onCancel();
      return;
    }
    confirmingRef.current = true;
    void confirmDialog({ title: "Vazgeç", message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Devam" })
      .then((confirmed) => {
        if (confirmed) onCancel();
      })
      .finally(() => {
        confirmingRef.current = false;
      });
  });

  // PgUp / PgDn: previous / next record of the list; not in a text field and not in a scrollable region
  // (a line-item table scrolls with them).
  useWindowKeyDown(!!recordNav, (event) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (isTextEntry(event.target) || isInScrollableRegion(event.target, rootRef.current)) return;
    if (!ownsKeys()) return;
    const run = event.key === "PageUp" ? recordNav?.onPrev : recordNav?.onNext;
    if (!run) return;
    event.preventDefault();
    run();
  });

  // Context panel: open from 1280px; Ctrl+. overrides until the viewport crosses the breakpoint again.
  const wide = useWideViewport();
  const [asideOverride, setAsideOverride] = useState<boolean | null>(null);
  useEffect(() => setAsideOverride(null), [wide]);
  const asideOpen = asideOverride ?? wide;
  const hasAside = aside != null && aside !== false;
  useWindowKeyDown(hasAside, (event) => {
    if (event.key !== "." || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (!ownsKeys()) return;
    event.preventDefault();
    setAsideOverride((current) => !(current ?? matchesWide()));
  });

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
        undo?.run && !undo.disabledReason ? "Ctrl+Z geri al" : null,
        recordNav ? "PgUp/PgDn önceki/sonraki kayıt" : null,
        hasAside ? "Ctrl+. bağlam paneli" : null,
        escapeEnabled ? "Esc kapat" : null,
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
          onInputCapture={markTouched}
          onChangeCapture={markTouched}
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

/**
 * Marks a changed field (yellow line on the control) and shows its previous value under it. Pass `changed` to wrap
 * a field that is not always changed: the same wrapper stays in place (an `rf-field` cell while unchanged), so the
 * control is not remounted and keeps focus while typing. `className` is for layout classes such as `rf-span-2`.
 */
export function RecordFieldChange({
  previous,
  changed = true,
  className,
  children,
}: {
  previous: ReactNode;
  changed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${changed ? "rf-changed" : "rf-field"}${className ? ` ${className}` : ""}`}>
      {children}
      {changed && <small className="rf-previous">Önceki: {previous}</small>}
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
