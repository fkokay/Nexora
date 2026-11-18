import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CopyPlus, Eraser, Save, X } from "lucide-react";
import { useActionBarMounted, useActivePageCommands, usePageCommands } from "../commands/CommandProvider";
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
  otherFormOwnsKeyboard,
  isTextEntry,
  ownsKeyboard,
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
  /** Tooltip of the disabled ‹ / › button (e.g. the start / end of the list page). */
  prevDisabledReason?: string;
  nextDisabledReason?: string;
};

/**
 * The context panel opens by default when the record form itself (not the viewport) is at least ASIDE_ROOM wide and
 * closes again below ASIDE_CLOSE: the gap keeps a scrollbar appearing or a resize near the edge from toggling it.
 */
const ASIDE_ROOM = 1100;
const ASIDE_CLOSE = 1060;

/**
 * Document chrome for a line-item document being created or edited (mockup 02): the header of the document screen
 * (type above, number · cari, mode, status flow) in place of the record header. Behaviour is the record form's.
 */
export type RecordFormDocument = {
  /** Document type, singular: "Satış teklifi". Top line of the header, after the breadcrumb. */
  type: string;
  /** Document number as entered; the heading shows it (named "{type} {code}"), else `title`. */
  code?: string;
  /** Cari (customer) next to the number. */
  party?: ReactNode;
  /** `DocumentStatusFlow` with the step the save produces as current. */
  statusFlow?: ReactNode;
  /** Shortcuts of the screen, listed in the footer after "Ctrl+S kaydet" ("Ctrl+Shift+Enter satır ekle"). */
  hints?: string[];
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
  /**
   * The header's Vazgeç asks first, like Esc: with typed or changed values (or `dirty`) it shows "Kaydedilmemiş
   * değişiklikler kaybolacak. Devam edilsin mi?" and calls `onCancel` only when confirmed. Default: Vazgeç calls
   * `onCancel` at once (the container decides).
   */
  confirmCancel?: boolean;
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
  /** Context panel on the right (cards); open while the form is at least 1100px wide, Ctrl+. shows / hides it. */
  aside?: ReactNode;
  /** "dialog" fits the same structure inside an existing modal: tighter padding, no full-height stretch. */
  variant?: "page" | "dialog";
  /** Document chrome (page variant): the document screen's header instead of the record header. */
  document?: RecordFormDocument;
  /**
   * False while the form stays mounted but is not on screen (a document opened over the list that holds it): it then
   * registers no bar commands (Kaydet, Kaydet ve Yeni, Temizle) and its keys (Ctrl+F2, Ctrl+S without a bar, Esc) do
   * nothing, so they cannot act on the hidden form. The form and its input are kept. Default true.
   */
  commandsActive?: boolean;
  /**
   * The form sits on a list screen (under or beside the list) rather than being the screen: the action bar stays a
   * list bar (Aç, Filtre, Excel remain) while still offering this form's Kaydet. A form inside a definition screen's
   * pane (`.nx-def-pane`) counts as beside its list without this prop.
   */
  besideList?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Standard record create/edit screen (mockup 01, record part): a header with title, meta line, change count and
 * record navigation; the action bar; an optional section navigator (from RecordFormTabs) left of the cards; an
 * optional context panel on the right; and a footer with the form's shortcuts and status.
 * While mounted it registers the action bar's Kaydet (Ctrl+S, primary) and, on a page, puts "Kaydet ve Yeni"
 * (Ctrl+F2) and "Temizle" into the İşlemler menu. Inside a modal (whose backdrop covers the bar), and wherever no
 * action bar is mounted (platform admin, launcher), it keeps Kaydet, Kaydet ve Yeni and Temizle as its own buttons.
 * F2 is the bar's Yeni and is handled by the page.
 */
export function RecordFormPage({
  title,
  mode,
  busy,
  onSubmit,
  onCancel,
  confirmCancel = false,
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
  document: documentChrome,
  commandsActive = true,
  besideList = false,
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
  // A form in a definition screen's pane (DefinitionLayout) sits beside its list: the bar stays a list bar.
  const [inListPane, setInListPane] = useState(false);
  useLayoutEffect(() => {
    setInDialog(Boolean(rootRef.current?.parentElement?.closest(DIALOG_SELECTOR)));
    setInListPane(Boolean(rootRef.current?.closest(".nx-def-pane")));
  }, []);

  const { slotRef, breadcrumb } = useSlotBreadcrumb();
  const isPage = variant === "page";
  const showSlot = isPage && !inDialog;
  // Without an action bar (platform admin, launcher, outside the shell) the form keeps its own buttons as well.
  const barMounted = useActionBarMounted();
  const ownButtons = inDialog || !barMounted;

  const submit = (stayForNext: boolean) => {
    // Only the form of the topmost dialog (or, without a dialog, the visible page) may save.
    if (!ownsKeyboard(formRef.current)) return;
    onSaveIntent?.(stayForNext);
    formRef.current?.requestSubmit();
  };
  const busyReason = busy ? "Kaydediliyor…" : undefined;
  const more: MenuCommand[] = [];
  if (!ownButtons && canSaveAndNew)
    more.push({ id: "record-form-save-and-new", label: "Kaydet ve Yeni", shortcut: "Ctrl+F2", disabledReason: busyReason, run: () => submit(true) });
  if (!ownButtons && canReset)
    more.push({ id: "record-form-reset", label: "Temizle", disabledReason: busyReason, run: onReset });
  // Saving is the action bar's Kaydet (Ctrl+S); on a page "Kaydet ve Yeni" and "Temizle" live in its İşlemler menu.
  const markActive = usePageCommands(
    commandsActive ? { save: { primary: true, disabledReason: busyReason ?? saveDisabledReason, run: () => submit(false) }, more, ...(besideList || inListPane ? { besideList: true } : {}) } : {},
    "form",
    rootRef,
  );
  const undo = useActivePageCommands()?.undo;

  // Form-local save keys (Ctrl+F2, and Ctrl+S without a bar). With several forms on screen only the one holding the
  // focus answers; with the focus in none of them, only a form that is alone in the keyboard scope does.
  const isSaveKeyTarget = () => {
    if (!ownsKeyboard(formRef.current) || focusIsInOtherForm(rootRef.current)) return false;
    return !!rootRef.current?.contains(document.activeElement) || !otherFormOwnsKeyboard(rootRef.current);
  };
  // Ctrl+F2 = Kaydet ve Yeni.
  useWindowKeyDown(canSaveAndNew && commandsActive, (event) => {
    if (event.key !== "F2" || !event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!isSaveKeyTarget()) return;
    event.preventDefault();
    if (busy || saveDisabledReason) return;
    onSaveIntent?.(true);
    formRef.current?.requestSubmit();
  });

  // Without an action bar nothing else dispatches Ctrl+S: the form's own Kaydet answers it. In the shell the command
  // registry runs first (capture phase) and marks the event handled.
  useWindowKeyDown(!barMounted && commandsActive, (event) => {
    if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
    if (event.key !== "s" && event.key !== "S") return;
    if (!isSaveKeyTarget()) return;
    event.preventDefault();
    if (busy || saveDisabledReason) return;
    onSaveIntent?.(false);
    formRef.current?.requestSubmit();
  });

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
  useWindowKeyDown(escapeEnabled && commandsActive, (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || confirmingRef.current || !ownsKeys()) return;
    event.preventDefault();
    cancelAfterConfirm();
  });
  /** Vazgeç with the unsaved-changes question (Esc on a page form; the header button with `confirmCancel`). */
  function cancelAfterConfirm() {
    if (confirmingRef.current) return;
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
  }

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

  // Context panel: open while the form itself has room (≥ ASIDE_ROOM wide, so a shell rail or menu counts);
  // Ctrl+. overrides until the form crosses that width again.
  const hasAside = aside != null && aside !== false;
  const [roomy, setRoomy] = useState(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!hasAside || !root) return;
    // A hidden keep-alive view measures 0 wide; the last state stays.
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      if (width > 0) setRoomy((open) => (width >= ASIDE_ROOM ? true : width < ASIDE_CLOSE ? false : open));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [hasAside]);
  const [asideOverride, setAsideOverride] = useState<boolean | null>(null);
  useEffect(() => setAsideOverride(null), [roomy]);
  const asideOpen = asideOverride ?? roomy;
  useWindowKeyDown(hasAside, (event) => {
    if (event.key !== "." || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (!ownsKeys()) return;
    event.preventDefault();
    setAsideOverride((current) => !(current ?? roomy));
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
        ...(documentChrome?.hints ?? []),
        undo?.run && !undo.disabledReason ? "Ctrl+Z geri al" : null,
        recordNav ? "PgUp/PgDn önceki/sonraki kayıt" : null,
        hasAside ? "Ctrl+. bağlam paneli" : null,
        escapeEnabled ? "Esc kapat" : null,
      ].filter((hint): hint is string => !!hint)
    : [];

  const modeBadge = mode === "edit" ? "DÜZENLEME" : "YENİ KAYIT";
  // Right side of the header: change note, record navigation, the form's own buttons (no bar), Vazgeç.
  const headerSide = (className: string) => (
    <div className={className}>
      {dirtyText && (
        <span className="rf-dirty">
          <i aria-hidden="true" />
          {dirtyText}
        </span>
      )}
      {recordNav && (
        <div className="rf-rnav" role="group" aria-label="Kayıtlar arası gezinme">
          <button
            type="button"
            aria-label="Önceki kayıt"
            disabled={!recordNav.onPrev}
            title={!recordNav.onPrev ? recordNav.prevDisabledReason : undefined}
            onClick={recordNav.onPrev}
          >
            ‹ <kbd>PgUp</kbd>
          </button>
          <span>{`${recordNav.index} / ${recordNav.total}`}</span>
          <button
            type="button"
            aria-label="Sonraki kayıt"
            disabled={!recordNav.onNext}
            title={!recordNav.onNext ? recordNav.nextDisabledReason : undefined}
            onClick={recordNav.onNext}
          >
            <kbd>PgDn</kbd> ›
          </button>
        </div>
      )}
      {ownButtons && (
        <>
          <button
            type="submit"
            form={id}
            className="rf-btn rf-btn--primary"
            disabled={busy || !!saveDisabledReason}
            title={saveDisabledReason}
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
              disabled={busy || !!saveDisabledReason}
              title={saveDisabledReason}
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
      <button type="button" className="rf-btn" onClick={confirmCancel ? cancelAfterConfirm : onCancel}>
        <X size={16} aria-hidden="true" />
        Vazgeç
      </button>
    </div>
  );

  return (
    <RecordFormContext.Provider value={context}>
      <div
        ref={rootRef}
        onFocusCapture={markActive}
        className={`record-form${variant === "dialog" ? " record-form--dialog" : ""}${documentChrome ? " doc-form" : ""}${className ? ` ${className}` : ""}`}
      >
        {documentChrome ? (
          <header className="doc-surface-head">
            <div className="doc-surface-title">
              <div className="doc-surface-eyebrow">
                {showSlot && breadcrumb && <span className="doc-surface-crumb">{breadcrumb}</span>}
                <span>{documentChrome.type}</span>
              </div>
              <div className="doc-surface-code-row">
                <h1>
                  {documentChrome.code ? (
                    <>
                      <span className="doc-surface-sr">{documentChrome.type} </span>
                      <b>{documentChrome.code}</b>
                    </>
                  ) : (
                    <b>{title}</b>
                  )}
                </h1>
                {documentChrome.party != null && documentChrome.party !== false && documentChrome.party !== "" && (
                  <>
                    <span className="doc-surface-sep" aria-hidden="true">·</span>
                    <div className="doc-surface-party">{documentChrome.party}</div>
                  </>
                )}
              </div>
              <div className="doc-surface-meta">
                <span className="rf-badge">{modeBadge}</span>
                {subtitle}
              </div>
            </div>
            {documentChrome.statusFlow && <div className="doc-surface-flow">{documentChrome.statusFlow}</div>}
            {headerSide("doc-surface-side")}
          </header>
        ) : (
          <header className="rf-toolbar">
            <div className="rf-head">
              {media != null && media !== false && <div className="rf-media">{media}</div>}
              <div className="rf-head-text">
                <div className={`rf-title${showSlot && breadcrumb ? " rf-title--crumb" : ""}`}>
                  {showSlot && breadcrumb}
                  <h1>{title}</h1>
                </div>
                <div className="rf-meta">
                  <span className="rf-badge">{modeBadge}</span>
                  {subtitle}
                </div>
              </div>
            </div>
            {headerSide("rf-actions")}
          </header>
        )}
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
