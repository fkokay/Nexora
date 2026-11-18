import { type FormEvent } from "react";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import "../../purchasing-record-forms.css";

export const defaultProvinceFields: BuiltInScreenLayoutField[] = [
  { key: "name", label: "İl", visible: true, position: 0 },
  { key: "status", label: "Durum", visible: true, position: 1 },
  { key: "districtCount", label: "İlçeler", visible: true, position: 2 },
  { key: "actions", label: "İşlemler", visible: true, position: 3, fixed: true },
];

type ProvinceFormProps = {
  editingId: number | null;
  name: string;
  active: boolean;
  busy: boolean;
  error?: string;
  onDismissError?: () => void;
  onNameChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function ProvinceForm({
  editingId,
  name,
  active,
  busy,
  error,
  onDismissError,
  onNameChange,
  onActiveChange,
  onSubmit,
  onCancel,
}: ProvinceFormProps) {
  return (
    <RecordFormPage
      variant="dialog"
      title={editingId ? "İli düzenle" : "Yeni il"}
      mode={editingId ? "edit" : "create"}
      busy={busy}
      saveLabel={editingId ? "Kaydet" : "İl ekle"}
      onSubmit={onSubmit}
      onCancel={onCancel}
      error={error}
      onDismissError={onDismissError}
      status={
        <span>
          Pasif iller ve ilçeleri yeni adres seçimlerinde gösterilmez.
        </span>
      }
    >
      <RecordFormGroup title="İl Kimliği" bodyClassName="rf-identity">
        <label>
          <span>İl adı <RequiredMark /></span>
          <input
            className="rf-must"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            required
            maxLength={100}
            placeholder="İl adı"
          />
        </label>
        <label>
          Durum
          <select
            value={active ? "active" : "inactive"}
            onChange={(event) =>
              onActiveChange(event.target.value === "active")
            }
          >
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </label>
      </RecordFormGroup>
    </RecordFormPage>
  );
}
