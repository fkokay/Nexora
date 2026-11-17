import type { MutableRefObject, ReactNode } from "react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import type { BulkAction } from "../../list-page/BulkActionBar";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import type { Balance, ScreenField } from "../types";

/** Grid row key of a tracked balance (the API groups by stock, warehouse, tracking code and expiry). */
export const trackingRowKey = (row: Balance) =>
  `${row.stockItemId}:${row.warehouseId}:${row.trackingCode}:${row.expiryDate ?? ""}`;

// Sized so the default columns fit beside the detail panel at 1440 without a horizontal scroll; saved layouts keep
// their own widths.
const WIDTHS: Partial<Record<ScreenField["key"], number>> = {
  trackingCode: 100,
  trackingMode: 60,
  stockItem: 150,
  warehouse: 130,
  quantityOnHand: 95,
  expiryDate: 185,
  lastMovementDate: 85,
};

type Props = {
  fields: ScreenField[];
  rows: Balance[];
  loading: boolean;
  error: string;
  hasFilters: boolean;
  renderField: (row: Balance, field: ScreenField) => ReactNode;
  /** Line under the list (hints, selection, pagination). */
  footer: ReactNode;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  /** Hides the grid's XLSX/CSV buttons; the page offers export through the action bar instead. */
  hideExport?: boolean;
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  bulkActions?: BulkAction[];
  /** Keys are `trackingRowKey`. Pass stable functions (the grid reports through an effect). */
  onSelectionChange?: (keys: string[]) => void;
  onCurrentRowChange?: (key: string | null) => void;
};

export default function InventoryTrackingBalanceTable({
  fields,
  rows,
  loading,
  error,
  hasFilters,
  renderField,
  footer,
  toolbarContainer,
  hideExport,
  exportActionsRef,
  bulkActions,
  onSelectionChange,
  onCurrentRowChange,
}: Props) {
  const numberClass = (field: ScreenField) => (field.key === "quantityOnHand" ? "nx-num" : undefined);
  return (
    <section
      className="panel inventory-stock-grid-panel list-v2-list"
      aria-label="Lot ve seri bakiye listesi"
    >
      <div className="customer-table-wrap inventory-tracking-table-wrap">
        <AdvancedDataGrid
          hideSearch
          externalPagination
          toolbarContainer={toolbarContainer}
          hideExport={hideExport}
          exportActionsRef={exportActionsRef}
          enableRowSelection={false}
          selectable
          bulkActions={bulkActions}
          onSelectionChange={onSelectionChange}
          onCurrentRowChange={onCurrentRowChange}
          className="customer-table inventory-tracking-table"
          gridId="inventory-trace-balances"
          aria-label="Lot ve seri bakiyeleri tablosu"
          {...screenViewGridDefaults(fields, (field) => WIDTHS[field.key as ScreenField["key"]])}
        >
          <caption className="inventory-tracking-sr-only">
            Lot ve seri bazında stok bakiyesi, depo, son kullanma ve son hareket
            bilgileri
          </caption>
          <thead>
            <ScreenViewGroupHeader fields={fields} />
            <tr>
              {fields.map((field) => (
                <th key={field.key} scope="col" className={numberClass(field)}>
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={Math.max(1, fields.length)}
                  className="table-empty"
                  role="status"
                >
                  İz kayıtları yükleniyor…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={Math.max(1, fields.length)}
                  className="table-empty"
                >
                  Sonuçlar gösterilemiyor. Yeniden denemek için üstteki düğmeyi
                  kullanın.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, fields.length)}
                  className="table-empty"
                >
                  {hasFilters
                    ? "Bu filtrelerle aktif lot veya seri bakiyesi bulunamadı."
                    : "Aktif lot veya seri bakiyesi bulunamadı."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={trackingRowKey(row)}>
                  {fields.map((field) => (
                    <td key={field.key} className={numberClass(field)}>
                      {renderField(row, field)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
      {footer}
    </section>
  );
}
