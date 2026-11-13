import type { FormEvent, MouseEvent } from "react";
import type { Location } from "../types";
import {
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
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onParentChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function CreateLocationForm({
  locations,
  warehouseId,
  code,
  name,
  parentLocationId,
  busy,
  onCodeChange,
  onNameChange,
  onParentChange,
  onSubmit,
}: CreateLocationFormProps) {
  const blocked = !warehouseId || !code.trim() || !name.trim();
  function clear() {
    onCodeChange("");
    onNameChange("");
    onParentChange("");
  }

  return (
    <section className="inv-rf-embedded">
      <RecordFormPage
        variant="dialog"
        title="Konum oluştur"
        mode="create"
        busy={busy}
        saveLabel="Konumu kaydet"
        onSubmit={(event) => {
          // Same gate the old save button had through its disabled state.
          if (blocked) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
        onCancel={clear}
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

type EditLocationModalProps = {
  editing: Location;
  locations: Location[];
  editCode: string;
  editName: string;
  editParentLocationId: string;
  editIsActive: boolean;
  busy: boolean;
  onEditCodeChange: (value: string) => void;
  onEditNameChange: (value: string) => void;
  onEditParentChange: (value: string) => void;
  onEditIsActiveChange: (value: boolean) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export function EditLocationModal({
  editing,
  locations,
  editCode,
  editName,
  editParentLocationId,
  editIsActive,
  busy,
  onEditCodeChange,
  onEditNameChange,
  onEditParentChange,
  onEditIsActiveChange,
  onClose,
  onSubmit,
}: EditLocationModalProps) {
  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) onClose();
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={closeOnBackdrop}
    >
      <div
        className="modal inv-rf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-location-edit-title"
      >
        <span id="warehouse-location-edit-title" hidden>
          {editing.code} konumunu düzenle
        </span>
        <RecordFormPage
          variant="dialog"
          title={`${editing.code} konumunu düzenle`}
          mode="edit"
          busy={busy}
          saveLabel="Değişiklikleri kaydet"
          onSubmit={(event) => {
            // Same gate the old save button had through its disabled state.
            if (!editCode.trim() || !editName.trim()) {
              event.preventDefault();
              return;
            }
            onSubmit(event);
          }}
          onCancel={() => {
            if (!busy) onClose();
          }}
          status={
            <span>Güncelleme sürüm denetimiyle ve audit iziyle kaydedilir.</span>
          }
        >
          <RecordFormGroup title="Konum Kimliği" bodyClassName="rf-pair">
            <label>
              <span>Konum kodu <RequiredMark /></span>
              <input
                className="rf-must rf-mono"
                autoFocus
                value={editCode}
                onChange={(event) =>
                  onEditCodeChange(event.target.value.toUpperCase())
                }
                required
                maxLength={40}
              />
            </label>
            <label>
              <span>Konum adı <RequiredMark /></span>
              <input
                className="rf-must"
                value={editName}
                onChange={(event) => onEditNameChange(event.target.value)}
                required
                maxLength={120}
              />
            </label>
          </RecordFormGroup>
          <RecordFormGroup title="Yerleşim ve Durum" bodyClassName="rf-pair">
            <label>
              Üst konum
              <select
                value={editParentLocationId}
                onChange={(event) => onEditParentChange(event.target.value)}
              >
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
            <label className="rf-check inv-rf-check-bottom">
              <input
                type="checkbox"
                checked={editIsActive}
                onChange={(event) => onEditIsActiveChange(event.target.checked)}
              />
              Konum aktif
            </label>
          </RecordFormGroup>
        </RecordFormPage>
      </div>
    </div>
  );
}
