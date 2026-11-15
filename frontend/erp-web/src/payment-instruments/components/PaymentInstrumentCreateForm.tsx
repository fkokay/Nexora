import { useEffect, useState, type FormEvent } from "react";
import type {
  Counterparty,
  Draft,
  Direction,
  Kind,
} from "../paymentInstrumentTypes";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import "../../finance-record-forms.css";

type Props = {
  draft: Draft;
  busy: boolean;
  error?: string;
  onDismissError?: () => void;
  onDraftChange: (draft: Draft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  /**
   * Searches active counterparties for the direction: customers for received (Receivable),
   * suppliers for given (Payable) instruments. Accounts of type "Both" appear in either list.
   */
  searchCounterparties: (
    query: string,
    direction: Direction,
  ) => Promise<Counterparty[]>;
};

export function PaymentInstrumentCreateForm({
  draft,
  busy,
  error,
  onDismissError,
  onDraftChange,
  onSubmit,
  onCancel,
  searchCounterparties,
}: Props) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onDraftChange({ ...draft, [key]: value });
  const [manual, setManual] = useState(
    () => !!draft.counterpartyName && !draft.counterpartyAccountId,
  );
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Counterparty[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const receivable = draft.direction === "Receivable";

  useEffect(() => {
    if (manual) return;
    let active = true;
    setOptionsLoading(true);
    setOptionsError("");
    const timer = window.setTimeout(() => {
      searchCounterparties(query.trim(), draft.direction)
        .then((rows) => {
          if (active) setOptions(rows);
        })
        .catch((cause) => {
          if (active) {
            setOptions([]);
            setOptionsError((cause as Error).message);
          }
        })
        .finally(() => {
          if (active) setOptionsLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [manual, query, draft.direction, searchCounterparties]);

  return (
    <RecordFormPage
      variant="dialog"
      className="fin-rf-host pi-create-form"
      title="Portföye ekle"
      mode="create"
      busy={busy}
      saveLabel="Portföye ekle"
      onSubmit={onSubmit}
      onCancel={onCancel}
      error={error}
      onDismissError={onDismissError}
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
              // The picked account belongs to the old direction's list: clear it.
              onDraftChange({
                ...draft,
                direction: event.target.value as Direction,
                counterpartyAccountId: null,
                counterpartyName: manual ? draft.counterpartyName : "",
              })
            }
          >
            <option value="Receivable">Alacak · alınan</option>
            <option value="Payable">Borç · verilen</option>
          </select>
        </label>
      </RecordFormGroup>
      <RecordFormGroup title="Cari">
        {manual ? (
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
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  counterpartyName: event.target.value,
                  counterpartyAccountId: null,
                })
              }
            />
          </label>
        ) : (
          <label>
            <span>
              {receivable ? "Müşteri" : "Tedarikçi"}
              <RequiredMark />
            </span>
            <SearchableRecordPicker
              required
              options={options.map((item) => ({
                id: item.id,
                label: `${item.code} · ${item.name}`,
              }))}
              selectedId={draft.counterpartyAccountId ?? ""}
              selectedLabel={draft.counterpartyName || undefined}
              onSelect={(id) => {
                const picked = options.find((item) => item.id === id);
                if (!picked) return;
                // The API checks that the name equals the account's name exactly.
                onDraftChange({
                  ...draft,
                  counterpartyAccountId: picked.id,
                  counterpartyName: picked.name,
                });
              }}
              onSearchChange={setQuery}
              title={receivable ? "Müşteri seçin" : "Tedarikçi seçin"}
              placeholder="Cari seçin"
              searchPlaceholder="Cari kodu veya unvanıyla ara"
              emptyMessage={
                optionsLoading
                  ? "Cariler aranıyor…"
                  : optionsError
                    ? `Cari listesi yüklenemedi: ${optionsError}`
                    : "Aramanızla eşleşen aktif cari bulunamadı."
              }
            />
          </label>
        )}
        <label className="rf-check pi-manual-toggle">
          <input
            type="checkbox"
            checked={manual}
            onChange={(event) => {
              setManual(event.target.checked);
              onDraftChange({
                ...draft,
                counterpartyAccountId: null,
                counterpartyName: event.target.checked
                  ? draft.counterpartyName
                  : "",
              });
            }}
          />
          <span>Kayıtlı olmayan cari</span>
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
  );
}
