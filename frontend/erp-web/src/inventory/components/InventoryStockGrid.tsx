import type { MutableRefObject, ReactNode } from "react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import type { BulkAction } from "../../list-page/BulkActionBar";
import type { StatusTagTone } from "../../list-page/StatusTag";
import type {
  BuiltInScreenLayoutField,
  InventoryBalance,
  StockItem,
} from "../../erp-types";
import { screenViewGridDefaults } from "../../screenViewGridLayout";

/**
 * Status of a stock list row: Pasif, then Minimum altı (the primary, red warning), then Maliyetsiz (uncosted
 * quantity), else Yeterli.
 */
export function stockListStatus(
  balance: InventoryBalance,
  stock: StockItem | undefined,
): { tone: StatusTagTone; label: string } {
  if (stock && !stock.isActive) return { tone: "off", label: "Pasif" };
  if (balance.belowMinimum) return { tone: "bad", label: "Minimum altı" };
  if (balance.unvaluedQuantity > 0) return { tone: "warn", label: "Maliyetsiz" };
  return { tone: "ok", label: "Yeterli" };
}

/**
 * Available quantity against the minimum: one basis for the shortage (minimum − available) everywhere. The ratio is
 * null when there is no minimum; the level tone follows the ratio itself (< 50% bad, < 100% warn, else ok).
 */
export function stockLevel(balance: InventoryBalance): {
  ratio: number | null;
  tone: "bad" | "warn" | "ok";
  shortage: number;
} {
  const shortage = Math.max(0, balance.minimumStock - balance.availableQuantity);
  if (balance.minimumStock <= 0) return { ratio: null, tone: "ok", shortage };
  const ratio = Math.max(0, balance.availableQuantity / balance.minimumStock);
  return { ratio, tone: ratio < 0.5 ? "bad" : ratio < 1 ? "warn" : "ok", shortage };
}

/** Kullanılabilir cell: the quantity (red while short) and a thin level bar (presentational; export reads the text). */
export function StockAvailableCell({ balance }: { balance: InventoryBalance }) {
  const level = stockLevel(balance);
  return (
    <>
      <span className={level.shortage > 0 ? "inventory-stock-low" : undefined}>
        {balance.availableQuantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} {balance.unitCode}
      </span>
      {level.ratio !== null && (
        <span className={`inventory-stock-level is-${level.tone}`} aria-hidden="true">
          <i style={{ width: `${Math.round(Math.min(1, level.ratio) * 100)}%` }} />
        </span>
      )}
    </>
  );
}

/** Right-aligned number columns of the stock list. */
export const STOCK_NUMBER_FIELDS = new Set([
  "quantityOnHand",
  "reservedQuantity",
  "availableQuantity",
  "minimumStock",
  "valuationAmountBase",
  "unvaluedQuantity",
]);

type Props = {
  fields: BuiltInScreenLayoutField[];
  balances: InventoryBalance[];
  pageBalances: InventoryBalance[];
  loading: boolean;
  balancesLoading: boolean;
  warehouseSelected: boolean;
  belowMinimumOnly: boolean;
  renderCell: (
    field: BuiltInScreenLayoutField,
    item: InventoryBalance,
  ) => ReactNode;
  /** Line under the list (hints, selection, pagination). */
  footer: ReactNode;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  /** Hides the grid's XLSX/CSV buttons; the page offers export through the action bar instead. */
  hideExport?: boolean;
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  bulkActions?: BulkAction[];
  /** Keys are stock item ids. Pass a stable function (the grid reports through an effect). */
  onSelectionChange?: (keys: string[]) => void;
  onCurrentRowChange?: (key: string | null) => void;
  onVisibleRowsChange?: (keys: string[]) => void;
};

export function InventoryStockGrid({
  fields,
  balances,
  pageBalances,
  loading,
  balancesLoading,
  warehouseSelected,
  belowMinimumOnly,
  renderCell,
  footer,
  toolbarContainer,
  hideExport,
  exportActionsRef,
  bulkActions,
  onSelectionChange,
  onCurrentRowChange,
  onVisibleRowsChange,
}: Props) {
  // Sized so the default columns fit beside the menu at 1440 and beside the detail panel at 1720 (no
  // horizontal scroll); saved layouts keep their own widths.
  const widths: Record<string, number> = {
    code: 95,
    name: 185,
    category: 85,
    quantityOnHand: 100,
    reservedQuantity: 80,
    availableQuantity: 135,
    minimumStock: 70,
    valuationAmountBase: 110,
    unvaluedQuantity: 100,
    status: 100,
  };
  const minimumWidths: Record<string, number> = {
    code: 80,
    name: 130,
    category: 75,
    quantityOnHand: 80,
    reservedQuantity: 65,
    availableQuantity: 100,
    minimumStock: 60,
    valuationAmountBase: 95,
    unvaluedQuantity: 75,
    status: 90,
  };
  const numberClass = (field: BuiltInScreenLayoutField) =>
    STOCK_NUMBER_FIELDS.has(field.key) ? "nx-num" : undefined;
  return (
    <section className="panel inventory-stock-grid-panel list-v2-list">
      <div className="customer-table-wrap">
        <AdvancedDataGrid
          className="customer-table inventory-table"
          // New id with the code column back at index 0: settings stored by column index under the old id
          // would land on the wrong columns, so they start fresh.
          gridId="inventory-stock-list"
          initialColumnWidths={fields.map(
            (field) => field.width || widths[field.key] || 110,
          )}
          initialPinned={screenViewGridDefaults(fields).initialPinned}
          minimumColumnWidths={fields.map(
            (field) => minimumWidths[field.key] || 80,
          )}
          externalPagination
          hideSearch
          toolbarContainer={toolbarContainer}
          hideExport={hideExport}
          exportActionsRef={exportActionsRef}
          enableRowSelection={false}
          selectable
          bulkActions={bulkActions}
          onSelectionChange={onSelectionChange}
          onCurrentRowChange={onCurrentRowChange}
          onVisibleRowsChange={onVisibleRowsChange}
          aria-label="Depo stok bakiyeleri"
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
            {loading || balancesLoading ? (
              <tr>
                <td
                  colSpan={fields.length}
                  className="table-empty"
                  role="status"
                >
                  {balancesLoading
                    ? "Depo stok bakiyeleri yükleniyor…"
                    : "Stok kartları yükleniyor…"}
                </td>
              </tr>
            ) : !warehouseSelected ? (
              <tr>
                <td colSpan={fields.length} className="table-empty">
                  Stok bakiyelerini görmek için bir depo oluşturun veya seçin.
                </td>
              </tr>
            ) : balances.length === 0 ? (
              <tr>
                <td colSpan={fields.length} className="table-empty">
                  {belowMinimumOnly
                    ? "Seçili depoda minimum stok altına düşen ürün yok."
                    : "Henüz aktif stok kartı yok."}
                </td>
              </tr>
            ) : (
              pageBalances.map((item) => (
                <tr key={item.stockItemId}>
                  {fields.map((field) => (
                    <td key={field.key} className={numberClass(field)}>
                      {renderCell(field, item)}
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
