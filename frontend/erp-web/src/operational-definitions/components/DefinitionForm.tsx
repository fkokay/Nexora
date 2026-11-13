import { useEffect, useRef, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Definition, DefinitionKind, Translate } from "../types";
import { RequiredMark } from "../../record-form/RecordForm";

type Props = {
  tx: Translate;
  kind: DefinitionKind;
  code: string;
  name: string;
  editing: Definition | null;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onKindChange: (kind: DefinitionKind) => void;
  onCodeChange: (code: string) => void;
  onNameChange: (name: string) => void;
  onCancel: () => void;
};

const kinds: DefinitionKind[] = ["Workplace", "Branch", "Factory"];

/** Side panel for adding or editing a workplace, branch or factory. F2 saves. */
export function DefinitionForm({
  tx,
  kind,
  code,
  name,
  editing,
  busy,
  onSubmit,
  onKindChange,
  onCodeChange,
  onNameChange,
  onCancel,
}: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const kindLabel = (value: DefinitionKind) =>
    value === "Workplace"
      ? tx("İş yeri", "Workplace")
      : value === "Branch"
        ? tx("Şube", "Branch")
        : tx("Fabrika", "Factory");
  const title = editing
    ? tx("Tanımı düzenle", "Edit definition")
    : tx("Yeni tanım", "New definition");

  useEffect(() => {
    codeRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.altKey || event.shiftKey) return;
      // The topmost dialog owns the keyboard: skip unless this form lives inside it.
      const backdrops = document.querySelectorAll(".modal-backdrop");
      const topmost = backdrops[backdrops.length - 1];
      if (topmost && !topmost.contains(formRef.current)) return;
      event.preventDefault();
      if (busy) return;
      formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy]);

  return (
    <aside className="op-def-form-card" aria-label={title}>
      <form ref={formRef} onSubmit={onSubmit}>
        <header className="op-def-form-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="op-def-form-close"
            onClick={onCancel}
            aria-label={tx("Kapat", "Close")}
            title={tx("Kapat", "Close")}
          >
            <X size={16} />
          </button>
        </header>
        <div className="op-def-form-body">
          <div className="op-def-field">
            <span>{tx("Tanım türü", "Definition type")}</span>
            <div className="op-def-segmented" role="radiogroup" aria-label={tx("Tanım türü", "Definition type")}>
              {kinds.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  className={kind === value ? "is-active" : undefined}
                  onClick={() => onKindChange(value)}
                >
                  {kindLabel(value)}
                </button>
              ))}
            </div>
          </div>
          <label className="op-def-field">
            <span>{tx("Kod", "Code")} <RequiredMark /></span>
            <input
              ref={codeRef}
              className="op-def-mono"
              value={code}
              onChange={(event) => onCodeChange(event.target.value.toUpperCase())}
              maxLength={40}
              required
            />
          </label>
          <label className="op-def-field">
            <span>{tx("Ad", "Name")} <RequiredMark /></span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={120}
              required
            />
          </label>
        </div>
        <footer className="op-def-form-foot">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            {tx("Vazgeç", "Cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {tx("Kaydet", "Save")} <kbd>F2</kbd>
          </button>
        </footer>
      </form>
    </aside>
  );
}
