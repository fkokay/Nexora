import type { FormEvent, FormEventHandler } from "react";
import type { ProvisioningRequest } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../platform-record-forms.css";

type Props = {
  form: ProvisioningRequest;
  error: string;
  busy: boolean;
  onChange: (field: keyof ProvisioningRequest, value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export default function ProvisioningForm({
  form,
  error,
  busy,
  onChange,
  onSubmit,
}: Props) {
  return (
    <RecordFormPage
      variant="dialog"
      className="prf-embedded prf-no-cancel prf-three"
      title="Firma bilgileri"
      mode="create"
      busy={busy}
      saveLabel="Firma oluştur"
      onSubmit={(event) => onSubmit(event as FormEvent<HTMLFormElement>)}
      onCancel={() => undefined}
      error={error}
      status={
        <span>
          İlk firma yöneticisi mevcut ve etkin bir kullanıcı olmalıdır.
        </span>
      }
    >
      <RecordFormGroup title="Firma Kimliği" bodyClassName="rf-identity">
        <label>
          <span>
            Firma adı <RequiredMark />
          </span>
          <input
            className="rf-must"
            value={form.name}
            onChange={(event) => onChange("name", event.target.value)}
            maxLength={200}
            required
            autoComplete="organization"
          />
        </label>
        <label>
          <span>
            Firma kısa adı <RequiredMark />
          </span>
          <input
            className="rf-must rf-mono"
            value={form.slug}
            onChange={(event) => onChange("slug", event.target.value)}
            maxLength={100}
            required
            placeholder="ornek-firma"
            autoCapitalize="none"
          />
        </label>
        <label>
          <span>
            Temel para birimi <RequiredMark />
          </span>
          <input
            className="rf-must rf-mono"
            value={form.baseCurrencyCode}
            onChange={(event) =>
              onChange(
                "baseCurrencyCode",
                event.target.value.slice(0, 3).toUpperCase(),
              )
            }
            maxLength={3}
            minLength={3}
            required
          />
        </label>
      </RecordFormGroup>
      <RecordFormGroup title="Firma Yöneticisi" bodyClassName="rf-pair">
        <label>
          <span>
            Firma yöneticisi e-posta <RequiredMark />
          </span>
          <input
            className="rf-must"
            type="email"
            value={form.adminEmail}
            onChange={(event) => onChange("adminEmail", event.target.value)}
            maxLength={320}
            required
            autoComplete="email"
          />
        </label>
        <label className="platform-provisioning-admin-name">
          <span>
            Firma yöneticisi adı <RequiredMark />
          </span>
          <input
            className="rf-must"
            value={form.adminDisplayName}
            onChange={(event) =>
              onChange("adminDisplayName", event.target.value)
            }
            maxLength={160}
            required
            autoComplete="name"
          />
        </label>
      </RecordFormGroup>
      <p className="prf-note">
        Bu ekranda parola veya veritabanı bilgisi alınmaz. Yönetici hesabı
        önceden oluşturulmuş olmalıdır.
      </p>
    </RecordFormPage>
  );
}
