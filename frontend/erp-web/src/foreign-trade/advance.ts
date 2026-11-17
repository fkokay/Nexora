import { localizedText } from "../locale";
import type { AdvanceInputs, TradeCapabilities, TradeCase, TradeStatus } from "./types";

const tr = (turkish: string, english: string) => localizedText(turkish, english);

export type AdvanceField = "plannedShipDate" | "declaredValue" | "incotermsCode" | "customsReference";

export type AdvanceCheck = {
  /** Prerequisite fields the backend checks for this step and the case lacks. */
  fields: AdvanceField[];
  /** The fields the user can fill in the panel (all of them, unless the update permission is missing). */
  editableFields: AdvanceField[];
  /** Prerequisites that cannot be entered here (linked document, arrival date, permission). */
  blockers: string[];
  /** Why the step cannot run now (İşlemler shows it on the disabled item); undefined when it can. */
  disabledReason?: string;
};

/**
 * Prerequisites of the case's next stage (the backend checks them on /transition, ForeignTradeEndpoints.cs): the
 * panel shows the inputs and blockers, İşlemler offers the step with the same conditions.
 */
export function advanceCheck(
  item: TradeCase,
  nextStatus: TradeStatus | undefined,
  capabilities: TradeCapabilities,
  inputs: AdvanceInputs,
  busy: boolean,
): AdvanceCheck {
  const fields: AdvanceField[] = [];
  const blockers: string[] = [];
  let fieldsEditable = true;
  if (nextStatus === "Shipped") {
    if (!item.plannedShipDate) fields.push("plannedShipDate");
    if (!(item.declaredValue > 0)) fields.push("declaredValue");
    if (!item.incotermsCode) fields.push("incotermsCode");
    // Ship prerequisites are file details saved through the edit endpoint.
    if (fields.length && !capabilities.canUpdate) {
      fieldsEditable = false;
      blockers.push(
        tr(
          "Planlanan sevk tarihi, pozitif beyan değeri ve Incoterms için dosya düzenleme izni (erp.foreign-trade.update) gerekir.",
          "Planned ship date, a positive declared value and Incoterms require the case update permission (erp.foreign-trade.update).",
        ),
      );
    }
  }
  if (nextStatus === "CustomsClearance") {
    if (!item.customsReference) fields.push("customsReference");
    if (item.direction === "Export" && item.inventoryPostingRequired && !item.salesDeliveryId)
      blockers.push(
        tr(
          "Kayıtlı teslimat belgesini aşağıdan bu dosyaya bağlayın.",
          "Link the posted delivery document to this case below.",
        ),
      );
  }
  if (nextStatus === "Closed") {
    if (!item.actualArrivalDate)
      blockers.push(tr("Gerçek varış tarihi kaydedilmelidir.", "An actual arrival date must be recorded."));
    if (item.direction === "Import" && item.inventoryPostingRequired && !item.purchaseReceiptId)
      blockers.push(
        tr(
          "Kayıtlı mal kabul belgesini aşağıdan bu dosyaya bağlayın.",
          "Link the posted goods receipt to this case below.",
        ),
      );
  }
  // Inputs stay visible next to other blockers so every prerequisite is shown up front.
  const editableFields = fieldsEditable ? fields : [];
  const fieldsFilled = editableFields.every((field) => {
    const value = inputs[field]?.trim() || "";
    if (field === "declaredValue") return Number(value) > 0;
    return value.length > 0;
  });
  const disabledReason = !capabilities.canAdvance
    ? tr("erp.foreign-trade.execute izni gerekir", "Requires the erp.foreign-trade.execute permission")
    : !nextStatus
      ? tr("Bu dosyanın sonraki aşaması yok", "This case has no next stage")
      : busy
        ? tr("İşlem sürüyor…", "An operation is in progress…")
        : blockers.length
          ? blockers[0]
          : !fieldsFilled
            ? tr("Önce paneldeki gerekli alanları doldurun", "Fill in the required fields in the panel first")
            : undefined;
  return { fields, editableFields, blockers, disabledReason };
}
