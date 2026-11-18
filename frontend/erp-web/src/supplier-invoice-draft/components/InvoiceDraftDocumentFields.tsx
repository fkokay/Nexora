import SearchableRecordPicker from "../../SearchableRecordPicker";
import type { DraftInput, Supplier } from "../types";
import { RecordFormGroup, RequiredMark } from "../../record-form/RecordForm";

type Props = {
  draft: DraftInput;
  suppliers: Supplier[];
  onUpdate: <K extends keyof DraftInput>(
    field: K,
    value: DraftInput[K],
  ) => void;
  onSelectSupplier: (id: string) => void;
  onSearchSuppliers: (value: string) => void;
};

/** Belge bilgileri: tedarikçi, fatura no ve tarihi, vade, para birimi, not (belge oluşturma ekranının dört sütunu). */
export function InvoiceDraftDocumentFields({
  draft,
  suppliers,
  onUpdate,
  onSelectSupplier,
  onSearchSuppliers,
}: Props) {
  return (
    <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
      <label className="rf-span-2">
        <span>Tedarikçi <RequiredMark /></span>
        <SearchableRecordPicker
          options={suppliers.map((x) => ({
            id: x.id,
            label: `${x.code ? `${x.code} · ` : ""}${x.name}`,
          }))}
          selectedId={draft.supplierId}
          onSelect={onSelectSupplier}
          onSearchChange={onSearchSuppliers}
          title="Tedarikçi seçin"
          placeholder="Tedarikçi seçin"
          searchPlaceholder="Tedarikçi kodu veya unvanıyla ara"
          emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı."
          required
        />
      </label>
      <label>
        <span>Tedarikçi fatura no <RequiredMark /></span>
        <input
          className="rf-must rf-mono"
          value={draft.invoiceNumber}
          onChange={(e) => onUpdate("invoiceNumber", e.target.value)}
          maxLength={100}
          required
        />
      </label>
      <label>
        <span>Fatura tarihi <RequiredMark /></span>
        <input
          className="rf-must"
          type="date"
          value={draft.invoiceDate}
          onChange={(e) => onUpdate("invoiceDate", e.target.value)}
          required
        />
      </label>
      <label>
        Vade tarihi
        <input
          type="date"
          value={draft.dueDate}
          onChange={(e) => onUpdate("dueDate", e.target.value)}
        />
      </label>
      <label>
        <span>Para birimi <RequiredMark /></span>
        <input
          className="rf-must rf-mono"
          value={draft.currencyCode}
          onChange={(e) =>
            onUpdate("currencyCode", e.target.value.toUpperCase())
          }
          maxLength={3}
          minLength={3}
          required
        />
      </label>
      <label className="rf-columns-wide">
        Not
        <textarea
          value={draft.notes}
          onChange={(e) => onUpdate("notes", e.target.value)}
          maxLength={1000}
          rows={2}
        />
      </label>
    </RecordFormGroup>
  );
}
