import type { FormEvent } from "react";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../sales/sales-record-forms.css";

type Props = {
  editing: boolean;
  code: string;
  name: string;
  percent: string;
  from: string;
  through: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPercentChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onThroughChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export default function CampaignDialog({
  editing,
  code,
  name,
  percent,
  from,
  through,
  busy,
  onCodeChange,
  onNameChange,
  onPercentChange,
  onFromChange,
  onThroughChange,
  onClose,
  onSubmit,
}: Props) {
  const title = editing ? "Kampanyayı düzenle" : "Kampanya oluştur";
  return (
    <div
      className="sales-promotion-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="panel sales-campaign-create sales-rf-host"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <RecordFormPage
          variant="dialog"
          className="sales-rf"
          title={title}
          mode={editing ? "edit" : "create"}
          busy={busy}
          saveLabel={editing ? "Değişiklikleri kaydet" : "Kampanya oluştur"}
          onSubmit={onSubmit}
          onCancel={onClose}
          status={
            <>
              <span>İndirim tutarları sunucuda hesaplanır.</span>
              <span className="rf-status-end">
                Yönetim işlemleri firma yöneticisi yetkisi gerektirir.
              </span>
            </>
          }
        >
          <RecordFormGroup
            title="Kampanya Kimliği"
            bodyClassName="rf-identity sales-rf-identity-2"
          >
            <label>
              <span>
                Kampanya kodu <RequiredMark />
              </span>
              <input
                className="rf-must rf-mono"
                value={code}
                onChange={(event) =>
                  onCodeChange(event.target.value.toUpperCase())
                }
                required
                maxLength={40}
              />
            </label>
            <label>
              <span>
                Kampanya adı <RequiredMark />
              </span>
              <input
                className="rf-must"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                required
                maxLength={120}
              />
            </label>
          </RecordFormGroup>
          <RecordFormGroup
            title="İndirim ve Geçerlilik"
            bodyClassName="sales-rf-triple"
          >
            <label>
              <span>
                İndirim yüzdesi <RequiredMark />
              </span>
              <input
                className="rf-num"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={percent}
                onChange={(event) => onPercentChange(event.target.value)}
                required
              />
            </label>
            <label>
              <span>
                Başlangıç tarihi <RequiredMark />
              </span>
              <input
                type="date"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                required
              />
            </label>
            <label>
              <span>
                Bitiş tarihi <RequiredMark />
              </span>
              <input
                type="date"
                value={through}
                onChange={(event) => onThroughChange(event.target.value)}
                required
              />
            </label>
          </RecordFormGroup>
        </RecordFormPage>
      </section>
    </div>
  );
}
