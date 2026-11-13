import type { DraftInput } from "../types";
import { RecordFormGroup, RequiredMark } from "../../record-form/RecordForm";

type Props = {
  draft: DraftInput;
  onUpdate: <K extends keyof DraftInput>(
    field: K,
    value: DraftInput[K],
  ) => void;
};

export function InvoiceDraftTotals({
  draft,
  onUpdate,
}: Props) {
  return (
    <RecordFormGroup title="Belge Toplamları" bodyClassName="prf-totals">
      <small className="rf-columns-wide">Toplamları tedarikçi belgesinden aynen aktarın.</small>
        <label>
          <span>Ara toplam <RequiredMark /></span>
          <input
            className="rf-num"
            type="number"
            min="0"
            step="0.01"
            value={draft.subtotal}
            onChange={(e) => onUpdate("subtotal", e.target.value)}
            required
          />
        </label>
        <label>
          <span>İskonto toplamı <RequiredMark /></span>
          <input
            className="rf-num"
            type="number"
            min="0"
            step="0.01"
            value={draft.discountTotal}
            onChange={(e) => onUpdate("discountTotal", e.target.value)}
            required
          />
        </label>
        <label>
          <span>Vergi toplamı <RequiredMark /></span>
          <input
            className="rf-num"
            type="number"
            min="0"
            step="0.01"
            value={draft.taxTotal}
            onChange={(e) => onUpdate("taxTotal", e.target.value)}
            required
          />
        </label>
        <label>
          <span>Genel toplam <RequiredMark /></span>
          <input
            className="rf-num"
            type="number"
            min="0"
            step="0.01"
            value={draft.grandTotal}
            onChange={(e) => onUpdate("grandTotal", e.target.value)}
            required
          />
        </label>
    </RecordFormGroup>
  );
}
