import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { localizedUiText } from "./locale";

/**
 * In-app replacement for window.confirm / window.prompt. The browser boxes do not match the app, cannot carry a
 * reason field with validation and are unavailable in some embedded browsers. Call sites await the result:
 *
 *   if (!(await confirmDialog({ title: "Taslak silinsin mi?", message: code, tone: "danger", confirmLabel: "Sil" }))) return;
 *   const reason = await promptDialog({ title: "İptal gerekçesi", label: "Gerekçe", required: true });
 *
 * One <ConfirmDialogHost /> is mounted at the root (main.tsx); requests are queued and shown one at a time.
 */
export type DialogTone = "danger" | "warning" | "default";

export type ConfirmOptions = {
  title: string;
  /** Detail under the title: what is affected and whether it can be undone. */
  message?: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Shows the keys on the buttons (Esc on cancel, Enter on confirm), e.g. a blocked delete offering a safe alternative. */
  keyHints?: boolean;
};

export type PromptOptions = ConfirmOptions & {
  /** Field label; the title is used when omitted. */
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** An empty (whitespace-only) answer cannot be submitted. */
  required?: boolean;
  multiline?: boolean;
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

const t = (text: string) => localizedUiText(text);

export function ConfirmDialogHost() {
  const [, setVersion] = useState(0);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const listener = () => setVersion((version) => version + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    setValue(current.kind === "prompt" ? (current.options.defaultValue ?? "") : "");
    setTouched(false);
    const focus = window.setTimeout(() => (current.kind === "prompt" ? fieldRef.current : confirmRef.current)?.focus(), 0);
    return () => window.clearTimeout(focus);
  }, [current]);
  if (!current) return null;

  const { options } = current;
  const tone = options.tone ?? "warning";
  const missing = current.kind === "prompt" && current.options.required && !value.trim();
  function finish(accepted: boolean) {
    const request = queue.shift();
    if (!request) return;
    if (request.kind === "confirm") request.resolve(accepted);
    else request.resolve(accepted ? value : null);
    setVersion((version) => version + 1);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (missing) return;
    finish(true);
  }
  const Icon = tone === "danger" ? Trash2 : tone === "warning" ? AlertTriangle : RotateCcw;
  return (
    <div
      className="workspace-confirm-backdrop app-confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) finish(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          finish(false);
        }
      }}
    >
      <form
        className={`workspace-confirm-dialog app-confirm is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby={options.message ? "app-confirm-description" : undefined}
        onSubmit={submit}
      >
        <span className="workspace-confirm-icon">
          <Icon size={21} aria-hidden="true" />
        </span>
        <div className="workspace-confirm-copy">
          <h2 id="app-confirm-title">{t(options.title)}</h2>
          {options.message && <p id="app-confirm-description">{t(options.message)}</p>}
          {current.kind === "prompt" && (
            <label className="app-confirm-field">
              <span>
                {t(current.options.label ?? current.options.title)}
                {current.options.required && <span aria-hidden="true"> *</span>}
              </span>
              {current.options.multiline ? (
                <textarea
                  ref={fieldRef}
                  rows={3}
                  value={value}
                  placeholder={current.options.placeholder}
                  aria-invalid={touched && missing ? true : undefined}
                  onChange={(event) => setValue(event.target.value)}
                />
              ) : (
                <input
                  ref={fieldRef}
                  value={value}
                  placeholder={current.options.placeholder}
                  aria-invalid={touched && missing ? true : undefined}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
              {touched && missing && <small className="app-confirm-error">{t("Bu alan zorunludur.")}</small>}
            </label>
          )}
        </div>
        <div className="workspace-confirm-actions">
          <button type="button" className="secondary" onClick={() => finish(false)}>
            {t(options.cancelLabel ?? "Vazgeç")}
            {options.keyHints && <kbd className="app-confirm-key">Esc</kbd>}
          </button>
          <button ref={confirmRef} type="submit" className={tone === "danger" ? "danger" : "app-confirm-primary"}>
            {t(options.confirmLabel ?? "Onayla")}
            {options.keyHints && <kbd className="app-confirm-key">Enter</kbd>}
          </button>
        </div>
      </form>
    </div>
  );
}
