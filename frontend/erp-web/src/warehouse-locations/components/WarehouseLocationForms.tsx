import type { FormEvent } from "react";
import type { Location } from "../types";
import {
  RecordFieldChange,
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../inventory-record-forms.css";

type CreateLocationFormProps = {
  locations: Location[];
  warehouseId: string;
  code: string;
  name: string;
  parentLocationId: string;
  busy: boolean;
  /** Lets the page's action bar submit this form. */
  formId?: string;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onParentChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  /** Vazgeç: closes the form (the page asks first when something was entered). */
  onCancel: () => void;
};

export function CreateLocationForm({
  locations,
  warehouseId,
  code,
  name,
  parentLocationId,
  busy,
  formId,
  onCodeChange,
  onNameChange,
  onParentChange,
  onSubmit,
  onCancel,
}: CreateLocationFormProps) {
  const blocked = !warehouseId || !code.trim() || !name.trim();

  return (
    <section className="inv-rf-embedded">
      <RecordFormPage
        variant="dialog"
        title="Konum oluştur"
        mode="create"
        busy={busy}
        saveLabel="Konumu kaydet"
        formId={formId}
        saveDisabledReason={
          !warehouseId
            ? "Konum eklemek için önce depo seçin."
            : !code.trim() || !name.trim()
              ? "Konum kodu ve adı zorunludur."
              : undefined
        }
        onSubmit={(event) => {
          // Same gate the old save button had through its disabled state.
          if (blocked) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
        onCancel={onCancel}
        status={
          <>
            <span>TenantAdmin yetkisiyle kaydedilir ve audit izi oluşturulur.</span>
            {!warehouseId && (
              <span className="rf-status-warning">
                Konum eklemek için önce depo seçin.
              </span>
            )}
          </>
        }
      >
        <RecordFormGroup
          title="Konum Kimliği"
          bodyClassName="rf-identity inv-rf-identity-3"
        >
          <label>
            <span>Konum kodu <RequiredMark /></span>
            <input
              className="rf-must rf-mono"
              value={code}
              onChange={(event) => onCodeChange(event.target.value.toUpperCase())}
              required
              maxLength={40}
              placeholder="A-01-03"
            />
          </label>
          <label>
            <span>Konum adı <RequiredMark /></span>
            <input
              className="rf-must"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              required
              maxLength={120}
              placeholder="Raf 3 · Göz 1"
            />
          </label>
          <label>
            Üst konum
            <select
              value={parentLocationId}
              onChange={(event) => onParentChange(event.target.value)}
            >
              <option value="">Üst düzey konum</option>
              {locations
                .filter((row) => row.isActive)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.name}
                  </option>
                ))}
            </select>
          </label>
          <small className="inv-rf-span-all">
            Kod depo içinde benzersiz olmalıdır. Üst konum seçerek hiyerarşi
            kurabilirsiniz.
          </small>
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}

export type LocationEditValues = { code: string; name: string; parentLocationId: string; isActive: boolean };

type EditLocationFormProps = {
  editing: Location;
  locations: Location[];
  values: LocationEditValues;
  /** Values the form was opened with: previous values of changed fields. */
  baseline: LocationEditValues;
  busy: boolean;
  formId?: string;
  onChange: (values: LocationEditValues) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
};

/** Number of fields that differ from the values the form was opened with. */
export function changedLocationFields(values: LocationEditValues, baseline: LocationEditValues) {
  return (
    Number(values.code.trim() !== baseline.code) +
    Number(values.name.trim() !== baseline.name) +
    Number(values.parentLocationId !== baseline.parentLocationId) +
    Number(values.isActive !== baseline.isActive)
  );
}

const parentText = (locations: Location[], id: string) => {
  const parent = locations.find((row) => row.id === id);
  return parent ? `${parent.code} · ${parent.name}` : "Üst düzey konum";
};

/** Edit form of the selected location, beside the list (the former edit dialog's fields and checks). */
export function EditLocationForm({
  editing,
  locations,
  values,
  baseline,
  busy,
  formId,
  onChange,
  onCancel,
  onSubmit,
}: EditLocationFormProps) {
  const set = (patch: Partial<LocationEditValues>) => onChange({ ...values, ...patch });
  const missing = !values.code.trim() || !values.name.trim();
  return (
    <section className="inv-rf-embedded">
      <RecordFormPage
        variant="dialog"
        title={`${editing.code} konumunu düzenle`}
        mode="edit"
        busy={busy}
        saveLabel="Değişiklikleri kaydet"
        formId={formId}
        dirty={changedLocationFields(values, baseline)}
        saveDisabledReason={
          missing
            ? "Konum kodu ve adı zorunludur."
            : changedLocationFields(values, baseline) === 0
              ? "Kaydedilecek değişiklik yok"
              : undefined
        }
        onSubmit={(event) => {
          // Same gate the old save button had through its disabled state.
          if (missing) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
        onCancel={onCancel}
        status={<span>Güncelleme sürüm denetimiyle ve audit iziyle kaydedilir.</span>}
      >
        <RecordFormGroup title="Konum Kimliği" bodyClassName="rf-pair">
          <RecordFieldChange changed={values.code.trim() !== baseline.code} previous={baseline.code}>
            <label>
              <span>Konum kodu <RequiredMark /></span>
              <input
                className="rf-must rf-mono"
                value={values.code}
                onChange={(event) => set({ code: event.target.value.toUpperCase() })}
                required
                maxLength={40}
              />
            </label>
          </RecordFieldChange>
          <RecordFieldChange changed={values.name.trim() !== baseline.name} previous={baseline.name}>
            <label>
              <span>Konum adı <RequiredMark /></span>
              <input
                className="rf-must"
                value={values.name}
                onChange={(event) => set({ name: event.target.value })}
                required
                maxLength={120}
              />
            </label>
          </RecordFieldChange>
        </RecordFormGroup>
        <RecordFormGroup title="Yerleşim ve Durum" bodyClassName="rf-pair">
          <RecordFieldChange
            changed={values.parentLocationId !== baseline.parentLocationId}
            previous={parentText(locations, baseline.parentLocationId)}
          >
            <label>
              Üst konum
              <select value={values.parentLocationId} onChange={(event) => set({ parentLocationId: event.target.value })}>
                <option value="">Üst düzey konum</option>
                {locations
                  .filter((row) => row.isActive && row.id !== editing.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name}
                    </option>
                  ))}
              </select>
            </label>
          </RecordFieldChange>
          <RecordFieldChange changed={values.isActive !== baseline.isActive} previous={baseline.isActive ? "Aktif" : "Pasif"}>
            <label className="rf-check inv-rf-check-bottom">
              <input type="checkbox" checked={values.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
              Konum aktif
            </label>
          </RecordFieldChange>
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
