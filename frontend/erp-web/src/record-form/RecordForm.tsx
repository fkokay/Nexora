import { useEffect, useId, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { usePageCommands } from "../commands/CommandProvider";
import type { MenuCommand } from "../commands/types";
import "./record-form.css";

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
 * While mounted it registers the action bar's Kaydet (Ctrl+S, primary) and puts "Kaydet ve Yeni" (Ctrl+F2) and
 * "Temizle" into the İşlemler menu. F2 is the bar's Yeni and is handled by the page.
 */
export function RecordFormPage({
  title,
  mode,
  busy,
  onSubmit,
  onCancel,
  formId,
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
  const formRef = useRef<HTMLFormElement | null>(null);
  const canSaveAndNew = mode === "create" && !!onSaveIntent;

  const submit = (stayForNext: boolean) => {
    onSaveIntent?.(stayForNext);
    formRef.current?.requestSubmit();
  };
  const busyReason = busy ? "Kaydediliyor…" : undefined;
  const more: MenuCommand[] = [];
  if (canSaveAndNew)
    more.push({ id: "record-form-save-and-new", label: "Kaydet ve Yeni", shortcut: "Ctrl+F2", disabledReason: busyReason, run: () => submit(true) });
  if (mode === "create" && onReset)
    more.push({ id: "record-form-reset", label: "Temizle", disabledReason: busyReason, run: onReset });
  // Saving is the action bar's Kaydet (Ctrl+S); "Kaydet ve Yeni" and "Temizle" live in its İşlemler menu.
  usePageCommands({ save: { primary: true, disabledReason: busyReason, run: () => submit(false) }, more }, "form");

  useEffect(() => {
    if (!canSaveAndNew) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || !event.ctrlKey || event.altKey || event.shiftKey) return;
      // A form in a hidden keep-alive view (another workspace tab) must not save.
      if (formRef.current?.closest("[hidden]")) return;
      // The topmost dialog owns the keyboard: skip unless this form lives inside it.
      const backdrops = document.querySelectorAll(".modal-backdrop");
      const topmost = backdrops[backdrops.length - 1];
      if (topmost && !topmost.contains(formRef.current)) return;
      event.preventDefault();
      if (!busy) submit(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      className={`record-form${variant === "dialog" ? " record-form--dialog" : ""}${className ? ` ${className}` : ""}`}
    >
      <header className="rf-toolbar">
        <div className="rf-title">
          <h1>{title}</h1>
          <span className="rf-badge">{mode === "edit" ? "DÜZENLEME" : "YENİ KAYIT"}</span>
        </div>
        <div className="rf-actions">
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
