import { Search } from "lucide-react";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import type { Warehouse } from "../../erp-types";

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
  showMinimumFilter?: boolean;
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
  showMinimumFilter = true,
}: Props) {
  return (
    <div className="customer-toolbar">
      <label className="warehouse-picker">
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
      <label className="inventory-stock-search">
        <Search size={16} />
        <input
          aria-label="Stok ara"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Kod veya stok adıyla ara"
        />
      </label>
      {showMinimumFilter && (
        <button
          type="button"
          className={belowMinimumOnly ? "primary" : "secondary"}
          aria-pressed={belowMinimumOnly}
          disabled={balancesLoading}
          onClick={onToggleBelowMinimum}
        >
          Minimum altı · {balancesLoading ? "…" : belowMinimumCount}
        </button>
      )}
    </div>
  );
}
