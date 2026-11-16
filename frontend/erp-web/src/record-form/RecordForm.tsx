import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CopyPlus, Eraser, Save, X } from "lucide-react";
import { usePageCommands } from "../commands/CommandProvider";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import type { MenuCommand } from "../commands/types";
import "./record-form.css";

const DIALOG_SELECTOR = '.modal-backdrop, .modal, [role="dialog"], [aria-modal="true"]';

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
  /** "dialog" fits the same structure inside an existing modal: tighter padding, no full-height stretch. */
  variant?: "page" | "dialog";
  className?: string;
  children: ReactNode;
};

/**
 * Standard record create/edit screen: title row with Vazgeç, an error strip, the form body and a status bar.
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
  const showSlot = variant === "page" && !inDialog;

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

  return (
    <div
      ref={rootRef}
      onFocusCapture={markActive}
      className={`record-form${variant === "dialog" ? " record-form--dialog" : ""}${className ? ` ${className}` : ""}`}
    >
      <header className="rf-toolbar">
        <div className={`rf-title${showSlot && breadcrumb ? " rf-title--crumb" : ""}`}>
          {showSlot && breadcrumb}
          <h1>{title}</h1>
          <span className="rf-badge">{mode === "edit" ? "DÜZENLEME" : "YENİ KAYIT"}</span>
        </div>
        <div className="rf-actions">
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
      <form id={id} ref={formRef} className="rf-form" onSubmit={onSubmit}>
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
      {status && (
        <footer className="rf-status" aria-live="polite">
          {status}
        </footer>
      )}
    </div>
  );
}

/** Titled group box. Put fields (labels) directly inside, or wrap them in `rf-pair` / `rf-identity` grids. */
export function RecordFormGroup({
  title,
  bodyClassName,
  children,
}: {
  title: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="rf-group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className={`rf-group-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
    </section>
  );
}

export type RecordFormTab = {
  key: string;
  label: string;
  /** Shows an attention dot on the tab, e.g. when it holds an incomplete field. */
  warning?: boolean;
};

/** Tab strip plus the bordered panel that holds the active tab's content. */
export function RecordFormTabs({
  tabs,
  active,
  onChange,
  label,
  children,
}: {
  tabs: RecordFormTab[];
  active: string;
  onChange: (key: string) => void;
  /** Accessible name of the tab strip. */
  label: string;
  children: ReactNode;
}) {
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
            {tab.warning && <span className="rf-tab-dot" role="img" aria-label="Uyarı var" />}
          </button>
        ))}
      </nav>
      <div className="rf-tab-panel">{children}</div>
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
