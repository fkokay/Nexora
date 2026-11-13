import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import type {
  BuiltInScreenLayoutField,
  InventoryBalance,
} from "../../erp-types";
import { screenViewGridDefaults } from "../../screenViewGridLayout";

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
  pagination: ReactNode;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
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
  pagination,
  toolbarContainer,
}: Props) {
  const widths: Record<string, number> = {
    code: 180,
    name: 190,
    category: 110,
    quantityOnHand: 120,
    reservedQuantity: 105,
    availableQuantity: 120,
    minimumStock: 90,
    valuationAmountBase: 135,
    unvaluedQuantity: 125,
    status: 110,
    actions: 180,
  };
  const minimumWidths: Record<string, number> = {
    code: 130,
    name: 140,
    category: 90,
    quantityOnHand: 100,
    reservedQuantity: 90,
    availableQuantity: 100,
    minimumStock: 80,
    valuationAmountBase: 110,
    unvaluedQuantity: 100,
    status: 90,
    actions: 165,
  };
  return (
    <section className="panel inventory-stock-grid-panel list-v2-list">
      <div className="customer-table-wrap">
        <AdvancedDataGrid
          className="customer-table inventory-table"
          gridId="inventory-stock-balances"
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
          enableRowSelection={false}
          aria-label="Depo stok bakiyeleri"
        >
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.key}>{field.label}</th>
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
                    <td key={field.key}>{renderCell(field, item)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
      {pagination}
    </section>
  );
}
