import { useEffect, useId, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { CopyPlus, Eraser, Save, X } from "lucide-react";
import "./record-form.css";

export type RecordFormPageProps = {
  /** Screen title, e.g. "Cari Kart Tanımlama". */
  title: string;
  /** "create" shows the YENİ KAYIT badge, "edit" shows DÜZENLEME. */
  mode: "create" | "edit";
  busy: boolean;
  /** Label of the primary save button. */
  saveLabel: string;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
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
  className?: string;
  children: ReactNode;
};

/**
 * Standard record create/edit screen: command bar (save, save-and-new, clear, cancel
 * with F2 / Ctrl+F2), an error strip, the form body and a status bar.
 */
export function RecordFormPage({
  title,
  mode,
  busy,
  saveLabel,
  onSubmit,
  onCancel,
  formId,
  onSaveIntent,
  onReset,
  error,
  onDismissError,
  status,
  className,
  children,
}: RecordFormPageProps) {
  const generatedId = useId();
  const id = formId ?? generatedId;
  const formRef = useRef<HTMLFormElement | null>(null);
  const canSaveAndNew = mode === "create" && !!onSaveIntent;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.altKey || event.shiftKey) return;
      // A record picker or confirmation dialog owns the keyboard while it is open.
      if (document.querySelector(".modal-backdrop")) return;
      event.preventDefault();
      if (busy) return;
      onSaveIntent?.(event.ctrlKey && canSaveAndNew);
      formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, canSaveAndNew, onSaveIntent]);

  return (
    <div className={`record-form${className ? ` ${className}` : ""}`}>
      <header className="rf-toolbar">
        <div className="rf-title">
          <h1>{title}</h1>
          <span className="rf-badge">{mode === "edit" ? "DÜZENLEME" : "YENİ KAYIT"}</span>
        </div>
        <div className="rf-actions">
          <button
            type="submit"
            form={id}
            className="rf-btn rf-btn--primary"
            disabled={busy}
            onClick={() => onSaveIntent?.(false)}
          >
            <Save size={16} aria-hidden="true" />
            {busy ? "Kaydediliyor…" : saveLabel}
            <kbd>F2</kbd>
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
          {mode === "create" && onReset && (
            <button type="button" className="rf-btn" disabled={busy} onClick={onReset}>
              <Eraser size={16} aria-hidden="true" />
              Temizle
            </button>
          )}
          <button type="button" className="rf-btn" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
            Vazgeç
          </button>
        </div>
      </header>
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
