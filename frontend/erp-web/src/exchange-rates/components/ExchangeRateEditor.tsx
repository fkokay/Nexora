import type { FormEvent, FormEventHandler } from "react";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";

type Props = {
  base: string;
  code: string;
  date: string;
  rate: string;
  source: string;
  busy: boolean;
  role: string;
  onBaseChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onRateChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSaveBase: FormEventHandler<HTMLFormElement>;
  onSaveRate: FormEventHandler<HTMLFormElement>;
};

export default function ExchangeRateEditor({
  base,
  code,
  date,
  rate,
  source,
  busy,
  role,
  onBaseChange,
  onCodeChange,
  onDateChange,
  onRateChange,
  onSourceChange,
  onSaveBase,
  onSaveRate,
}: Props) {
  return (
    <section className="finance-workbench-card finance-rate-editor">
      <h4>Firma para birimi</h4>
      <BaseCurrencyForm
        base={base}
        busy={busy}
        role={role}
        onChange={onBaseChange}
        onSubmit={onSaveBase}
      />
      {role === "TenantAdmin" && (
        <RateEntryForm
          base={base}
          code={code}
          date={date}
          rate={rate}
          source={source}
          busy={busy}
          onCodeChange={onCodeChange}
          onDateChange={onDateChange}
          onRateChange={onRateChange}
          onSourceChange={onSourceChange}
          onSubmit={onSaveRate}
        />
      )}
    </section>
  );
}

type BaseCurrencyFormProps = {
  base: string;
  busy: boolean;
  role: string;
  onChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

function BaseCurrencyForm({
  base,
  busy,
  role,
  onChange,
  onSubmit,
}: BaseCurrencyFormProps) {
  return (
    <form className="collection-form" onSubmit={onSubmit}>
      <div className="form-two">
        <label>
          Baz para birimi
          <input
            value={base}
            onChange={(e) => onChange(e.target.value)}
            minLength={3}
            maxLength={3}
            required
            disabled={role !== "TenantAdmin"}
          />
        </label>
        <div className="modal-foot">
          <span>
            İlk finansal kayıt veya kur girilene kadar değiştirilebilir.
          </span>
          {role === "TenantAdmin" && (
            <button className="secondary" disabled={busy}>
              Baz para birimini kaydet
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

type RateEntryFormProps = {
  base: string;
  code: string;
  date: string;
  rate: string;
  source: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onRateChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

function RateEntryForm({
  base,
  code,
  date,
  rate,
  source,
  busy,
  onCodeChange,
  onDateChange,
  onRateChange,
  onSourceChange,
  onSubmit,
}: RateEntryFormProps) {
  return (
    <RecordFormPage
      variant="dialog"
      className="fin-rf-no-cancel"
      title="Kur tanımla"
      mode="create"
      busy={busy}
      saveLabel="Kuru kaydet"
      onSubmit={onSubmit as (event: FormEvent) => void}
      onCancel={() => {}}
      status={
        <span>
          Geçmiş tarih için kur girilebilir. Aynı gün düzeltmesi yeni revizyon
          oluşturur.
        </span>
      }
    >
      <RecordFormGroup title="Kur Bilgileri" bodyClassName="fin-rf-grid-2">
        <label>
          <span>
            Döviz kodu
            <RequiredMark />
          </span>
          <input
            className="rf-must rf-mono"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            minLength={3}
            maxLength={3}
            required
          />
        </label>
        <label>
          <span>
            Tarih
            <RequiredMark />
          </span>
          <input
            className="rf-must"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            required
          />
        </label>
        <label>
          Kur · 1 {code || "döviz"} = ? {base}
          <input
            className="rf-must rf-num"
            type="number"
            min="0.00000001"
            step="0.00000001"
            value={rate}
            onChange={(e) => onRateChange(e.target.value)}
            required
          />
        </label>
        <label>
          Kaynak / not
          <input
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            maxLength={160}
            placeholder="Örn. banka satış kuru"
          />
        </label>
      </RecordFormGroup>
    </RecordFormPage>
  );
}
