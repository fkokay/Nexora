import type { FormEvent } from "react";
import type { Draft, Direction, Kind } from "../paymentInstrumentTypes";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../finance-record-forms.css";

type Props = {
  draft: Draft;
  busy: boolean;
  onDraftChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
};

export function PaymentInstrumentCreateForm({
  draft,
  busy,
  onDraftChange,
  onSubmit,
}: Props) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onDraftChange({ ...draft, [key]: value });
  return (
    <section className="panel payment-instrument-create fin-rf-host">
      <RecordFormPage
        variant="dialog"
        className="fin-rf-no-cancel"
        title="Portföye kayıt ekle"
        mode="create"
        busy={busy}
        saveLabel="Portföye ekle"
        onSubmit={onSubmit}
        onCancel={() => {}}
        status={
          <span>
            Kaydetmek finans hesabı bakiyesini değiştirmez; tahsil/ödeme ayrıca
            işlenir.
          </span>
        }
      >
        <p className="fin-rf-hint">
          Firma kapsamındaki çek veya senedi alınan/verilen yönüyle kaydedin.
        </p>
        <RecordFormGroup title="Çek / Senet Kimliği" bodyClassName="rf-identity">
          <label>
            <span>
              Çek/senet numarası
              <RequiredMark />
            </span>
            <input
              className="rf-must rf-mono"
              required
              maxLength={80}
              value={draft.instrumentNumber}
              onChange={(event) => set("instrumentNumber", event.target.value)}
            />
          </label>
          <label>
            <span>
              Cari unvanı
              <RequiredMark />
            </span>
            <input
              className="rf-must"
              required
              maxLength={160}
              value={draft.counterpartyName}
              onChange={(event) => set("counterpartyName", event.target.value)}
            />
          </label>
          <label>
            Tür
            <select
              value={draft.type}
              onChange={(event) => set("type", event.target.value as Kind)}
            >
              <option value="Check">Çek</option>
              <option value="PromissoryNote">Senet</option>
            </select>
          </label>
          <label>
            Yön
            <select
              value={draft.direction}
              onChange={(event) =>
                set("direction", event.target.value as Direction)
              }
            >
              <option value="Receivable">Alacak · alınan</option>
              <option value="Payable">Borç · verilen</option>
            </select>
          </label>
        </RecordFormGroup>
        <div className="rf-columns">
          <RecordFormGroup title="Banka ve Tutar">
            <label>
              <span>
                Banka
                <RequiredMark />
              </span>
              <input
                className="rf-must"
                required
                maxLength={120}
                value={draft.bankName}
                onChange={(event) => set("bankName", event.target.value)}
              />
            </label>
            <div className="rf-pair">
              <label>
                <span>
                  Tutar
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-num"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.amount}
                  onChange={(event) => set("amount", event.target.value)}
                />
              </label>
              <label>
                <span>
                  Para birimi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-mono"
                  required
                  minLength={3}
                  maxLength={3}
                  value={draft.currencyCode}
                  onChange={(event) =>
                    set("currencyCode", event.target.value.toUpperCase())
                  }
                />
              </label>
            </div>
          </RecordFormGroup>
          <RecordFormGroup title="Tarihler">
            <div className="rf-pair">
              <label>
                <span>
                  Düzenleme tarihi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  required
                  type="date"
                  value={draft.issueDate}
                  onChange={(event) => set("issueDate", event.target.value)}
                />
              </label>
              <label>
                <span>
                  Vade tarihi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  required
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
              </label>
            </div>
            <label>
              <span>
                Portföye giriş tarihi
                <RequiredMark />
              </span>
              <input
                className="rf-must"
                required
                type="date"
                value={draft.portfolioDate}
                onChange={(event) => set("portfolioDate", event.target.value)}
              />
            </label>
          </RecordFormGroup>
          <div className="rf-columns-wide">
            <RecordFormGroup title="Not">
              <label>
                Açıklama
                <textarea
                  maxLength={500}
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </label>
            </RecordFormGroup>
          </div>
        </div>
      </RecordFormPage>
    </section>
  );
}
