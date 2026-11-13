import SearchableRecordPicker from "../../SearchableRecordPicker";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type { Warehouse } from "../../erp-types";
import "../inventory-list-v2.css";

type Props = {
  warehouses: Warehouse[];
  warehouseId: string;
  search: string;
  belowMinimumOnly: boolean;
  belowMinimumCount: number;
  balancesLoading: boolean;
  allowAll?: boolean;
  onWarehouseChange: (id: string) => void;
  onSearchChange: (value: string) => void;
  onToggleBelowMinimum: () => void;
  /** Reloads the list with the current filters (the toolbar's refresh button). */
  onApplyFilters: () => void;
  showMinimumFilter?: boolean;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function InventoryStockFilters({
  warehouses,
  warehouseId,
  search,
  belowMinimumOnly,
  belowMinimumCount,
  balancesLoading,
  allowAll = false,
  onWarehouseChange,
  onSearchChange,
  onToggleBelowMinimum,
  onApplyFilters,
  showMinimumFilter = true,
  toolsSlotRef,
}: Props) {
  // The page reloads on every filter change by itself, so the search needs no apply step.
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchLabel="Stok ara"
      searchPlaceholder="Kod veya stok adıyla ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onApplyFilters}
    >
      <label className="list-v2-filter warehouse-picker">
        Depo
        <SearchableRecordPicker
          options={[
            ...(allowAll
              ? [
                  {
                    id: "",
                    label: "Tüm depolar",
                    description: "Aktif depolardaki toplam bakiye",
                  },
                ]
              : []),
            ...warehouses
              .filter((item) => item.isActive)
              .map((item) => ({
                id: item.id,
                label: `${item.code} · ${item.name}`,
                description: "Aktif",
              })),
          ]}
          selectedId={warehouseId}
          selectedLabel={allowAll && !warehouseId ? "Tüm depolar" : undefined}
          onSelect={onWarehouseChange}
          title="Depo seçin"
          placeholder="Depo seçin"
          searchPlaceholder="Depo kodu veya adıyla ara"
          emptyMessage="Aramanızla eşleşen depo bulunamadı."
        />
      </label>
      {showMinimumFilter && (
        <ListChipGroup
          label="Stok filtreleri"
          value={belowMinimumOnly ? "below" : ""}
          onChange={() => onToggleBelowMinimum()}
          allowClear
          options={[
            {
              value: "below",
              label: "Minimum altı",
              count: balancesLoading ? null : belowMinimumCount,
            },
          ]}
        />
      )}
    </ListToolbar>
  );
}
