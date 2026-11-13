import type { FormEvent } from "react";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import type { Customer } from "../types";
import { RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import "../../sales/sales-record-forms.css";

const PROBABILITY_PRESETS = [10, 25, 50, 75, 90];

/** Display-only weighted value; an unknown currency code falls back to a plain number. */
function formatWeightedValue(amount: number, currency: string) {
  const code = currency.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Not a valid ISO 4217 code; use the plain format below.
    }
  }
  const number = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return code ? `${number} ${code}` : number;
}

type Props = {
  mode?: "create" | "edit";
  customerError: string;
  customers: Customer[];
  customerId: string;
  selectedCustomer: Customer | null;
  selectedCustomerName?: string | null;
  customerLoading: boolean;
  code: string;
  name: string;
  value: string;
  currency: string;
  probability: string;
  closeDate: string;
  activity: string;
  notes: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onCustomerSelect: (id: string) => void;
  onCustomerSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onProbabilityChange: (value: string) => void;
  onCloseDateChange: (value: string) => void;
  onActivityChange: (value: string) => void;
  onNotesChange: (value: string) => void;
};

export function CrmOpportunityCreateForm({
  mode = "create",
  customerError,
  customers,
  customerId,
  selectedCustomer,
  selectedCustomerName,
  customerLoading,
  code,
  name,
  value,
  currency,
  probability,
  closeDate,
  activity,
  notes,
  busy,
  onClose,
  onSubmit,
  onCodeChange,
  onNameChange,
  onCustomerSelect,
  onCustomerSearchChange,
  onValueChange,
  onCurrencyChange,
  onProbabilityChange,
  onCloseDateChange,
  onActivityChange,
  onNotesChange,
}: Props) {
  const amount = Number(value);
  const percent = Number(probability);
  const weighted =
    Number.isFinite(amount) && Number.isFinite(percent)
      ? (amount * Math.min(100, Math.max(0, percent))) / 100
      : 0;

  return (
    <RecordFormPage
      className="crm-create-page-surface sales-rf crm-opp-rf"
      title={mode === "edit" ? "Fırsatı düzenle" : "Yeni fırsat"}
      mode={mode}
      busy={busy}
      saveLabel={mode === "edit" ? "Değişiklikleri kaydet" : "Fırsat oluştur"}
      formId="crm-opportunity-form"
      onSubmit={(event) => onSubmit(event as FormEvent<HTMLFormElement>)}
      onCancel={onClose}
      error={
        customerError
          ? `Müşteri listesi yüklenemedi: ${customerError}`
          : undefined
      }
    >
      <div className="crm-opp-layout">
        <section className="crm-opp-card crm-opp-main">
          <label className="crm-opp-name">
            <span>
              Fırsat adı <RequiredMark />
            </span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              required
              maxLength={160}
              placeholder="ERP yenileme projesi"
            />
          </label>
          <div className="crm-opp-row crm-opp-row--customer">
            <label>
              Müşteri
              <SearchableRecordPicker
                options={customers.map((item) => ({
                  id: item.id,
                  label: `${item.code} · ${item.name}`,
                }))}
                selectedId={customerId}
                selectedLabel={
                  selectedCustomer
                    ? `${selectedCustomer.code} · ${selectedCustomer.name}`
                    : selectedCustomerName || undefined
                }
                onSelect={onCustomerSelect}
                onSearchChange={onCustomerSearchChange}
                title="Müşteri seçin"
                placeholder="Henüz bağlanmadı"
                searchPlaceholder="Müşteri kodu veya unvanıyla ara"
                emptyMessage={
                  customerLoading
                    ? "Müşteriler aranıyor…"
                    : "Aramanızla eşleşen aktif müşteri bulunamadı."
                }
                overlayClassName="crm-customer-picker-backdrop"
              />
            </label>
            <label>
              <span>
                Fırsat kodu <RequiredMark />
              </span>
              <input
                className="rf-mono"
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                required
                maxLength={40}
                placeholder="FRS-2026-001"
              />
            </label>
          </div>
          <div className="crm-opp-row crm-opp-row--three">
            <label>
              Tahmini tutar
              <div className="crm-opp-amount">
                <input
                  className="rf-num"
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(event) => onValueChange(event.target.value)}
                  placeholder="0,00"
                />
                <input
                  className="rf-mono crm-opp-currency"
                  aria-label="Para birimi"
                  value={currency}
                  onChange={(event) =>
                    onCurrencyChange(event.target.value.toUpperCase())
                  }
                  maxLength={3}
                />
              </div>
            </label>
            <label>
              Beklenen kapanış
              <input
                type="date"
                value={closeDate}
                onChange={(event) => onCloseDateChange(event.target.value)}
              />
            </label>
            <label>
              Sonraki takip
              <input
                type="datetime-local"
                value={activity}
                onChange={(event) => onActivityChange(event.target.value)}
              />
            </label>
          </div>
          <label className="crm-notes">
            Not
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Görüşme özeti veya sonraki adım"
            />
          </label>
        </section>
        <aside className="crm-opp-side">
          <section
            className="crm-opp-card"
            aria-labelledby="crm-opp-probability-title"
          >
            <h2 id="crm-opp-probability-title">Kazanma olasılığı</h2>
            <div
              className="crm-opp-presets"
              role="group"
              aria-label="Hazır olasılık değerleri"
            >
              {PROBABILITY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={probability !== "" && percent === preset}
                  onClick={() => onProbabilityChange(String(preset))}
                >
                  %{preset}
                </button>
              ))}
            </div>
            <label>
              Kazanma olasılığı (%)
              <input
                className="rf-num"
                type="number"
                min="0"
                max="99"
                value={probability}
                onChange={(event) => onProbabilityChange(event.target.value)}
              />
              <small>Ya da 0–99 arası değer yazın</small>
            </label>
          </section>
          <section
            className="crm-opp-card crm-opp-weighted"
            aria-labelledby="crm-opp-weighted-title"
          >
            <h2 id="crm-opp-weighted-title">Ağırlıklı değer</h2>
            <output aria-live="polite">
              {formatWeightedValue(weighted, currency)}
            </output>
            <small>Tahmini tutar × kazanma olasılığı</small>
          </section>
          <p className="crm-opp-tip">
            Fırsatı müşteri carisine bağlayın; kapanış ve sonraki takip tarihini
            planlayın.
          </p>
        </aside>
      </div>
    </RecordFormPage>
  );
}
