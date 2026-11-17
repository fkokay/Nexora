import type { MutableRefObject, ReactNode } from "react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import type { BulkAction } from "../../list-page/BulkActionBar";
import { StatusTag, type StatusTagTone } from "../../list-page/StatusTag";
import type { BuiltInScreenLayoutField, InventoryTransfer } from "../../erp-types";
import { screenViewGridDefaults } from "../../screenViewGridLayout";

/** Transfer status: Kaydedildi (posted, ok), İptal edildi (voided by linked reversal movements, off). */
export function transferStatus(transfer: InventoryTransfer): { tone: StatusTagTone; label: string } {
  return transfer.status === "Posted" ? { tone: "ok", label: "Kaydedildi" } : { tone: "off", label: "İptal edildi" };
}

// Sized so the default columns fit at 1440 without a horizontal scroll; saved layouts keep their own widths.
const WIDTHS: Record<string, number> = {
  code: 120,
  transferDate: 95,
  fromWarehouseName: 160,
  toWarehouseName: 160,
  lineCount: 90,
  status: 110,
  createdAt: 145,
  actions: 220,
};

type Props = {
  fields: BuiltInScreenLayoutField[];
  transfers: InventoryTransfer[];
  busy: boolean;
  /** Row buttons (no detail panel on this screen, so they stay in the row; the bar offers the same). */
  onOpen: (transfer: InventoryTransfer) => void;
  onVoid: (transfer: InventoryTransfer) => void;
  /** Line under the list (hints, selection, pagination). */
  footer: ReactNode;
  /** Shown instead of the grid when there is no row. */
  empty: ReactNode;
  toolbarContainer?: HTMLElement | null;
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  bulkActions?: BulkAction[];
  /** Keys are transfer ids. Pass stable functions (the grid reports through an effect). */
  onSelectionChange?: (keys: string[]) => void;
  onCurrentRowChange?: (key: string | null) => void;
};

/** Depolar arası transferler list (mockup 01 list language): selectable rows, status tags, the footer. */
export function InventoryTransferGrid({
  fields,
  transfers,
  busy,
  onOpen,
  onVoid,
  footer,
  empty,
  toolbarContainer,
  exportActionsRef,
  bulkActions,
  onSelectionChange,
  onCurrentRowChange,
}: Props) {
  const cell = (field: BuiltInScreenLayoutField, transfer: InventoryTransfer): ReactNode => {
    switch (field.key) {
      case "code":
        return <span className="nx-code">{transfer.code}</span>;
      case "transferDate":
        return transfer.transferDate.split("-").reverse().join(".");
      case "fromWarehouseName":
        return transfer.fromWarehouseName;
      case "toWarehouseName":
        return transfer.toWarehouseName;
      case "lineCount":
        return transfer.lineCount;
      case "status": {
        const status = transferStatus(transfer);
        return <StatusTag tone={status.tone}>{status.label}</StatusTag>;
      }
      case "createdAt":
        return new Date(transfer.createdAt).toLocaleString("tr-TR");
      case "actions":
        return (
          <div className="warehouse-row-actions">
            <button type="button" className="row-action" onClick={() => onOpen(transfer)}>
              Kalemler
            </button>
            {transfer.status === "Posted" && (
              <button type="button" className="row-action danger-action" disabled={busy} onClick={() => onVoid(transfer)}>
                Transferi iptal et
              </button>
            )}
          </div>
        );
      default:
        return null;
    }
  };
  const numberClass = (field: BuiltInScreenLayoutField) => (field.key === "lineCount" ? "nx-num" : undefined);
  return (
    <section className="panel inventory-stock-grid-panel warehouse-transfer-grid list-v2-list">
      {transfers.length > 0 ? (
        <div className="customer-table-wrap">
          <AdvancedDataGrid
            className="customer-table"
            gridId="inventory-transfers"
            {...screenViewGridDefaults(fields, (field) => WIDTHS[field.key])}
            externalPagination
            hideSearch
            enableRowSelection={false}
            selectable
            bulkActions={bulkActions}
            onSelectionChange={onSelectionChange}
            onCurrentRowChange={onCurrentRowChange}
            toolbarContainer={toolbarContainer}
            hideExport
            exportActionsRef={exportActionsRef}
            aria-label="Depolar arası transferler"
          >
            <thead>
              <tr>
                {fields.map((field) => (
                  <th key={field.key} className={numberClass(field)}>
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id}>
                  {fields.map((field) => (
                    <td key={field.key} className={numberClass(field)}>
                      {cell(field, transfer)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
      ) : (
        empty
      )}
      {footer}
    </section>
  );
}
