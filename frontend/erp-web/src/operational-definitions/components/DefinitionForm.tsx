import type { FormEvent } from "react";
import type { Definition, DefinitionKind, Translate } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../inventory-record-forms.css";

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
  return (
    <section className="inv-rf-embedded op-definition-record-form">
      <RecordFormPage
        variant="dialog"
        title={
          editing
            ? tx("Tanımı düzenle", "Edit definition")
            : tx("Tanım ekle", "Add definition")
        }
        mode={editing ? "edit" : "create"}
        busy={busy}
        saveLabel={
          editing
            ? tx("Değişiklikleri kaydet", "Save changes")
            : tx("Tanım ekle", "Add definition")
        }
        onSubmit={onSubmit}
        onCancel={onCancel}
        status={
          <span>
            {editing
              ? tx("Seçili tanımı düzenleyin.", "Edit the selected definition.")
              : tx("Yeni tanım ekleyin.", "Add a new definition.")}
          </span>
        }
      >
        <RecordFormGroup
          title={tx("Tanım Kimliği", "Definition identity")}
          bodyClassName="rf-identity inv-rf-identity-3"
        >
          <label>
            <span>{tx("Kod", "Code")} <RequiredMark /></span>
            <input
              className="rf-must rf-mono"
              value={code}
              onChange={(event) => onCodeChange(event.target.value.toUpperCase())}
              maxLength={40}
              required
            />
          </label>
          <label>
            <span>{tx("Ad", "Name")} <RequiredMark /></span>
            <input
              className="rf-must"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label>
            {tx("Tanım türü", "Definition type")}
            <select
              value={kind}
              onChange={(event) =>
                onKindChange(event.target.value as DefinitionKind)
              }
            >
              <option value="Workplace">{tx("İş yeri", "Workplace")}</option>
              <option value="Branch">{tx("Şube", "Branch")}</option>
              <option value="Factory">{tx("Fabrika", "Factory")}</option>
            </select>
          </label>
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
