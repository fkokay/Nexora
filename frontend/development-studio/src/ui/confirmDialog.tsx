import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { useFocusTrap } from "./useFocusTrap";

/**
 * In-app replacement for window.confirm / window.prompt, with the same API as erp-web's confirmDialog (#47):
 *
 *   if (!(await confirmDialog({ title: "Proje silinsin mi?", message, tone: "danger", confirmLabel: "Sil" }))) return;
 *   const note = await promptDialog({ title: "İnceleme notu", label: "Not", multiline: true });
 *
 * `confirmText` asks the user to type a word (for example a version) before the confirm button is enabled;
 * use it for production and other irreversible steps. `details` lists label/value facts above the field.
 * One <ConfirmDialogHost /> is mounted at the root (main.tsx); requests are queued and shown one at a time.
 */
export type DialogTone = "danger" | "warning" | "default";

export type ConfirmOptions = {
  title: string;
  /** What is affected and whether it can be undone. Line breaks are kept. */
  message?: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  details?: Array<[label: string, value: string]>;
  /** The user must type this exact text before confirming. */
  confirmText?: string;
};

export type PromptOptions = Omit<ConfirmOptions, "confirmText"> & {
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** An empty (whitespace-only) answer cannot be submitted. */
  required?: boolean;
  multiline?: boolean;
  hint?: string;
};

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

const queue: Request[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ kind: "confirm", options, resolve });
    notify();
  });
}

/** Resolves to the entered text (untrimmed) or null when cancelled. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ kind: "prompt", options, resolve });
    notify();
  });
}

export function ConfirmDialogHost() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((version) => version + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const current = queue[0];
  if (!current) return null;
  return (
    <ConfirmPanel
      // A fresh panel per request resets the field and focus.
      key={queue.length + current.options.title}
      request={current}
      onDone={(accepted, value) => {
        const request = queue.shift();
        if (!request) return;
        if (request.kind === "confirm") request.resolve(accepted);
        else request.resolve(accepted ? value : null);
        setVersion((version) => version + 1);
      }}
    />
  );
}

function ConfirmPanel({ request, onDone }: { request: Request; onDone: (accepted: boolean, value: string) => void }) {
  const { options } = request;
  const tone = options.tone ?? "warning";
  const isPrompt = request.kind === "prompt";
  const confirmText = request.kind === "confirm" ? request.options.confirmText : undefined;
  const [value, setValue] = useState(isPrompt ? (request.options.defaultValue ?? "") : "");
  const [touched, setTouched] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(
    panelRef,
    true,
    () => onDone(false, ""),
    // Destructive confirmations start on "Vazgeç" so Enter does not confirm by accident.
    isPrompt || confirmText ? fieldRef : tone === "danger" ? cancelRef : confirmRef,
  );

  const missing = isPrompt && request.options.required && !value.trim();
  const mismatch = confirmText !== undefined && value.trim() !== confirmText;
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (missing || mismatch) return;
    onDone(true, value);
  }
  const Icon = tone === "danger" ? Trash2 : tone === "warning" ? AlertTriangle : Info;
  const hasField = isPrompt || confirmText !== undefined;
  const fieldLabel = isPrompt
    ? (request.options.label ?? options.title)
    : `Onaylamak için ${confirmText} yazın`;
  const hint = isPrompt ? request.options.hint : "Metin eşleşmeden onay düğmesi çalışmaz.";
  const error = touched && missing ? "Bu alan zorunludur." : touched && mismatch ? `Tam olarak ${confirmText} yazın.` : "";
  return (
    <div
      className="ns-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDone(false, "");
      }}
    >
      <form
        ref={panelRef}
        className={`ns-dialog ns-confirm is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ns-confirm-title"
        aria-describedby={options.message ? "ns-confirm-description" : undefined}
        data-ns-dialog="open"
        tabIndex={-1}
        onSubmit={submit}
      >
        <div className="ns-confirm-head">
          <span className="ns-confirm-icon">
            <Icon size={19} aria-hidden="true" />
          </span>
          <div className="ns-confirm-copy">
            <h2 id="ns-confirm-title">{options.title}</h2>
            {options.message && <p id="ns-confirm-description">{options.message}</p>}
          </div>
        </div>
        {(options.details?.length || hasField) && (
          <div className="ns-confirm-body">
            {options.details && options.details.length > 0 && (
              <dl className="ns-confirm-facts">
                {options.details.map(([label, detail]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{detail}</dd>
                  </div>
                ))}
              </dl>
            )}
            {hasField && (
              <label className="ns-field">
                <span className="ns-field-label">
                  {fieldLabel}
                  {isPrompt && request.options.required && <span aria-hidden="true"> *</span>}
                </span>
                {isPrompt && request.options.multiline ? (
                  <textarea
                    ref={fieldRef}
                    rows={4}
                    value={value}
                    placeholder={request.options.placeholder}
                    aria-invalid={error ? true : undefined}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submit(event);
                    }}
                  />
                ) : (
                  <input
                    ref={fieldRef}
                    value={value}
                    className={confirmText ? "ns-mono" : undefined}
                    placeholder={isPrompt ? request.options.placeholder : confirmText}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    onChange={(event) => setValue(event.target.value)}
                  />
                )}
                {error ? (
                  <small className="ns-field-error">{error}</small>
                ) : (
                  hint && <small className="ns-field-hint">{hint}</small>
                )}
              </label>
            )}
          </div>
        )}
        <div className="ns-dialog-foot">
          <button ref={cancelRef} type="button" className="ns-btn" onClick={() => onDone(false, "")}>
            {options.cancelLabel ?? "Vazgeç"}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className={`ns-btn ${tone === "danger" ? "ns-btn-danger" : "ns-btn-primary"}`}
            aria-disabled={mismatch || missing ? true : undefined}
          >
            {options.confirmLabel ?? "Onayla"}
          </button>
        </div>
      </form>
    </div>
  );
}
