import type { FormEvent } from "react";
import type { Target } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../platform-record-forms.css";

type Props = {
  canDesign: boolean;
  busy: boolean;
  editing: boolean;
  code: string;
  label: string;
  targetPage: string;
  targets: Target[];
  entryCount: number;
  onSubmit: (event: FormEvent) => void;
  onCodeChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onReset: () => void;
};

export function CustomMenuEditor({
  canDesign,
  busy,
  editing,
  code,
  label,
  targetPage,
  targets,
  entryCount,
  onSubmit,
  onCodeChange,
  onLabelChange,
  onTargetChange,
  onReset,
}: Props) {
  if (!canDesign)
    return (
      <section className="panel custom-menu-editor">
        <div className="panel-heading">
          <div>
            <h3>{editing ? "Menüyü düzenle" : "Yeni menü öğesi"}</h3>
            <p>Hedef, yetkili ERP sayfa kataloğundan seçilir.</p>
          </div>
        </div>
        <div className="custom-menu-readonly">
          Özel menü düzenleme yetkisi gerekir. Mevcut menüler çalışma alanı
          kenar çubuğunda görünür.
        </div>
      </section>
    );
  const limitReached = entryCount >= 30 && !editing;
  return (
    <RecordFormPage
      variant="dialog"
      className={`custom-menu-editor prf-embedded prf-stack${editing ? "" : " prf-no-cancel"}`}
      title={editing ? "Menüyü düzenle" : "Yeni menü öğesi"}
      mode={editing ? "edit" : "create"}
      busy={busy}
      saveLabel={editing ? "Değişiklikleri kaydet" : "Menü ekle"}
      onSubmit={(event) => {
        if (limitReached) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      onCancel={onReset}
      onReset={onReset}
      status={
        <>
          <span>Hedef, yetkili ERP sayfa kataloğundan seçilir.</span>
          {limitReached && (
            <span className="rf-status-warning">
              En fazla 30 menü öğesi tanımlanabilir.
            </span>
          )}
        </>
      }
    >
      <RecordFormGroup title="Menü Kimliği" bodyClassName="rf-identity">
        <label className="custom-menu-field">
          <span>
            Menü kodu <RequiredMark />
          </span>
          <input
            className="rf-must rf-mono"
            required
            maxLength={40}
            pattern="[a-z][a-z0-9_-]{0,39}"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            placeholder="depo-kisayolu"
          />
          <small>
            Küçük harfle başlar; harf, rakam, tire ve alt çizgi kullanılabilir.
          </small>
        </label>
        <label className="custom-menu-field">
          <span>
            Görünen ad <RequiredMark />
          </span>
          <input
            className="rf-must"
            required
            maxLength={80}
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder="Depo yönetimi"
          />
        </label>
        <label className="custom-menu-field">
          ERP sayfası
          <select
            value={targetPage}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {targets.map((target) => (
              <option key={target.page} value={target.page}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      </RecordFormGroup>
    </RecordFormPage>
  );
}
