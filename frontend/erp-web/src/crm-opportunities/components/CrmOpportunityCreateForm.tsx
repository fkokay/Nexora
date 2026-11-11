import type { FormEvent } from "react";
import { BriefcaseBusiness, ShieldCheck, X } from "lucide-react";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import type { Customer } from "../types";

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
  return (
      <section className="customer-create-page-surface crm-create-page-surface" aria-labelledby="crm-create-title">
        <header className="customer-create-page-heading crm-create-page-heading">
          <div className="customer-create-page-title crm-create-page-title">
          <span className="customer-create-page-icon crm-create-heading-icon" aria-hidden="true">
            <BriefcaseBusiness size={20} />
          </span>
          <div>
            <p className="eyebrow">CRM · SATIŞ HATTI</p>
            <h1 id="crm-create-title">{mode === "edit" ? "Fırsatı düzenle" : "Yeni fırsat"}</h1>
            <p>
              Fırsatı müşteri carisine bağlayın; kapanış ve sonraki takip
              tarihini planlayın.
            </p>
          </div>
          </div>
          <div className="crm-create-page-actions">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            <X size={17} />
            Vazgeç
          </button>
          <button className="primary" type="submit" form="crm-opportunity-form" disabled={busy}>
            <ShieldCheck size={16} aria-hidden="true" />
            {busy ? "Kaydediliyor…" : mode === "edit" ? "Değişiklikleri kaydet" : "Fırsat oluştur"}
          </button>
          </div>
        </header>
        {customerError && (
          <p className="crm-inline-error crm-create-page-error" role="status">
            Müşteri listesi yüklenemedi: {customerError}
          </p>
        )}
        <form id="crm-opportunity-form" className="crm-form crm-record-form" onSubmit={onSubmit}>
          <fieldset className="crm-form-section">
            <legend>Fırsat bilgileri</legend>
            <div className="crm-form-fields">
          <label>
            Fırsat kodu
            <input
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              required
              maxLength={40}
              placeholder="FRS-2026-001"
            />
          </label>
          <label>
            Fırsat adı
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              required
              maxLength={160}
              placeholder="ERP yenileme projesi"
            />
          </label>
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
            </div>
          </fieldset>
          <fieldset className="crm-form-section">
            <legend>Tutar ve takip</legend>
            <div className="crm-form-fields">
          <label>
            Tahmini tutar
            <div className="crm-inline-input">
              <input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                placeholder="0,00"
              />
              <input
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
            Kazanma olasılığı (%)
            <input
              type="number"
              min="0"
              max="99"
              value={probability}
              onChange={(event) => onProbabilityChange(event.target.value)}
            />
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
          <label className="crm-notes">
            Not
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Görüşme özeti veya sonraki adım"
            />
          </label>
            </div>
          </fieldset>
        </form>
      </section>
  );
}
