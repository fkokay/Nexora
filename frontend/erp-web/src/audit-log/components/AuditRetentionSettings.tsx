import type { FormEvent } from "react";
import type { AuditRetentionPolicy } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../platform-record-forms.css";

type Props = {
  retention: AuditRetentionPolicy | null;
  retentionDays: string;
  busy: boolean;
  error: string;
  notice: string;
  onDaysChange: (value: string) => void;
  onClearError: () => void;
  onClearNotice: () => void;
  onSubmit: (event: FormEvent) => void;
};

export function AuditRetentionSettings({
  retention,
  retentionDays,
  busy,
  error,
  notice,
  onDaysChange,
  onClearError,
  onClearNotice,
  onSubmit,
}: Props) {
  const minimumDays = retention?.minimumRetentionDays ?? 30;
  const maximumDays = retention?.maximumRetentionDays ?? 3650;
  return (
    <RecordFormPage
      variant="dialog"
      className="prf-embedded prf-no-cancel prf-two"
      title="Audit kayıtlarının saklanması"
      mode="edit"
      busy={busy}
      saveLabel="Politikayı kaydet"
      onSubmit={onSubmit}
      onCancel={() => undefined}
      error={error}
      onDismissError={onClearError}
      status={
        <>
          <span id="audit-retention-help">
            {retention?.lastPurgeAt
              ? `Son temizlik: ${new Date(retention.lastPurgeAt).toLocaleString("tr-TR")}`
              : "Henüz temizlik çalışmadı."}{" "}
            · İzin verilen aralık: {minimumDays}–{maximumDays} gün
          </span>
          {notice && (
            <span className="rf-status-notice">
              {notice}
              <button
                type="button"
                className="prf-status-dismiss"
                onClick={onClearNotice}
              >
                ×
              </button>
            </span>
          )}
        </>
      }
    >
      <RecordFormGroup title="Saklama Politikası" bodyClassName="rf-identity">
        <label htmlFor="audit-retention-days">
          <span>
            Saklama süresi <RequiredMark />
          </span>
          <span className="prf-unit">
            <input
              id="audit-retention-days"
              className="rf-must rf-num"
              type="number"
              min={minimumDays}
              max={maximumDays}
              step="1"
              value={retentionDays}
              onChange={(event) => onDaysChange(event.target.value)}
              aria-describedby="audit-retention-help"
              required
            />
            <span aria-hidden="true">gün</span>
          </span>
        </label>
        <p className="prf-field-note">
          Süre tenant bazındadır. Süresi dolan kayıtlar her gün 02.00 UTC’de
          denetlenebilir temizlik işiyle silinir.
        </p>
      </RecordFormGroup>
    </RecordFormPage>
  );
}
