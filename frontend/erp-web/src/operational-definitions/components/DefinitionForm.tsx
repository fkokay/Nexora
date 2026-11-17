import { useEffect, useRef, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Definition, DefinitionKind, Translate } from "../types";
import { RequiredMark } from "../../record-form/RecordForm";
import { FormSaveCommand } from "../../record-form/FormSaveCommand";

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

/** Side panel for adding or editing a workplace, branch or factory. Ctrl+S (the action bar's Kaydet) saves. */
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

  return (
    <aside className="op-def-form-card" aria-label={title}>
      <FormSaveCommand formRef={formRef} disabledReason={busy ? tx("Kaydediliyor…", "Saving…") : undefined} />
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
            {tx("Kaydet", "Save")} <kbd>Ctrl+S</kbd>
          </button>
        </footer>
      </form>
    </aside>
  );
}
