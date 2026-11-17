import type { MutableRefObject, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import type { BulkAction } from "../../list-page/BulkActionBar";
import type { InventoryBalance } from "../../erp-types";

const quantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

type Column = { key: string; label: string; width: number; minimum: number; number?: boolean };
/** Fixed columns (this screen has no tenant screen layout); the former cards showed the first four. */
const COLUMNS: Column[] = [
  { key: "code", label: "Stok kodu", width: 120, minimum: 80 },
  { key: "name", label: "Stok adı", width: 260, minimum: 140 },
  { key: "quantityOnHand", label: "Depo miktarı", width: 140, minimum: 90, number: true },
  { key: "valuationAmountBase", label: "Stok değeri", width: 160, minimum: 100, number: true },
  { key: "unvaluedQuantity", label: "Maliyetsiz miktar", width: 150, minimum: 100, number: true },
  { key: "actions", label: "İşlemler", width: 110, minimum: 90 },
];

type Props = {
  balances: InventoryBalance[];
  loading: boolean;
  busy: boolean;
  /** Opens the cost manager (row "Yönet"; the bar's Aç does the same for the current row). */
  onManage: (balance: InventoryBalance) => void;
  /** Line under the list (hints, selection, pagination). */
  footer: ReactNode;
  toolbarContainer?: HTMLElement | null;
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  bulkActions?: BulkAction[];
  /** Keys are stock item ids. Pass stable functions (the grid reports through an effect). */
  onSelectionChange?: (keys: string[]) => void;
  onCurrentRowChange?: (key: string | null) => void;
};

/** Stok Değerleme list: the selected warehouse's balances with quantity, value and uncosted quantity. */
export function InventoryCostGrid({
  balances,
  loading,
  busy,
  onManage,
  footer,
  toolbarContainer,
  exportActionsRef,
  bulkActions,
  onSelectionChange,
  onCurrentRowChange,
}: Props) {
  const cell = (column: Column, item: InventoryBalance): ReactNode => {
    switch (column.key) {
      case "code":
        return <span className="nx-code">{item.code}</span>;
      case "name":
        return item.name;
      case "quantityOnHand":
        return `${quantity(item.quantityOnHand)} ${item.unitCode}`;
      case "valuationAmountBase":
        return `${item.valuationAmountBase.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${item.baseCurrencyCode}`;
      case "unvaluedQuantity":
        return `${quantity(item.unvaluedQuantity)} ${item.unitCode}`;
      case "actions":
        return (
          <div className="warehouse-row-actions">
            <button type="button" className="row-action" disabled={busy} onClick={() => onManage(item)}>
              Yönet <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        );
      default:
        return null;
    }
  };
  const className = (column: Column) => (column.number ? "nx-num" : undefined);
  return (
    <section className="panel inventory-stock-grid-panel list-v2-list">
      <div className="customer-table-wrap">
        <AdvancedDataGrid
          className="customer-table inventory-cost-table"
          gridId="inventory-cost-balances"
          initialColumnWidths={COLUMNS.map((column) => column.width)}
          minimumColumnWidths={COLUMNS.map((column) => column.minimum)}
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
          aria-label="Stok maliyetleri"
        >
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={className(column)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="table-empty" role="status">
                  <span>Stok bakiyeleri yükleniyor…</span> <span>Seçili deponun miktar ve maliyet bilgileri alınıyor.</span>
                </td>
              </tr>
            ) : balances.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="table-empty">
                  <span>Yönetilecek stok bakiyesi yok</span> <span>Seçili depoda hareketi olan stok kartları burada görünür.</span>
                </td>
              </tr>
            ) : (
              balances.map((item) => (
                <tr key={item.stockItemId}>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className={className(column)}>
                      {cell(column, item)}
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
