import type { FormEvent } from "react";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import type { Customer } from "../types";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../sales/sales-record-forms.css";

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
    <RecordFormPage
      className="crm-create-page-surface sales-rf"
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
      status={
        <span>
          Fırsatı müşteri carisine bağlayın; kapanış ve sonraki takip tarihini
          planlayın.
        </span>
      }
    >
      <RecordFormGroup
        title="Fırsat Kimliği"
        bodyClassName="rf-identity sales-rf-identity-3"
      >
        <label>
          <span>
            Fırsat kodu <RequiredMark />
          </span>
          <input
            className="rf-must rf-mono"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            required
            maxLength={40}
            placeholder="FRS-2026-001"
          />
        </label>
        <label>
          <span>
            Fırsat adı <RequiredMark />
          </span>
          <input
            className="rf-must"
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
      </RecordFormGroup>
      <div className="rf-columns">
        <RecordFormGroup title="Tutar ve Olasılık">
          <label>
            Tahmini tutar
            <div className="crm-inline-input sales-rf-inline">
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
                className="rf-mono"
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
              className="rf-num"
              type="number"
              min="0"
              max="99"
              value={probability}
              onChange={(event) => onProbabilityChange(event.target.value)}
            />
          </label>
        </RecordFormGroup>
        <RecordFormGroup title="Takip">
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
        </RecordFormGroup>
        <RecordFormGroup title="Not">
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
        </RecordFormGroup>
      </div>
    </RecordFormPage>
  );
}
