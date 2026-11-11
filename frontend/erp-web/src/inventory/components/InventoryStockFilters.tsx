import { Filter, Search } from "lucide-react";
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
  onApplyFilters: () => void;
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
  onApplyFilters,
  showMinimumFilter = true,
}: Props) {
  const controls = (
    <div className="customer-toolbar inventory-stock-filters">
      <label className="inventory-stock-search">
        <Search size={16} />
        <input
          aria-label="Stok ara"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Kod veya stok adıyla ara"
        />
      </label>
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
      <button type="button" className="primary" disabled={balancesLoading} onClick={onApplyFilters}>
        <Filter size={15} /> Filtrele
      </button>
    </div>
  );
  return (
    <section className="inventory-stock-filter-card" aria-label={showMinimumFilter ? "Stok filtreleri" : "Stok maliyeti filtreleri"}>
      <div className="inventory-stock-filter-heading">
        <div>
          <h2>Filtreler</h2>
          <p>{showMinimumFilter ? "Stok kartlarını arama, depo ve minimum seviye durumuna göre daraltın." : "Stok bakiyelerini kod veya depo seçimine göre daraltın."}</p>
        </div>
      </div>
      {controls}
    </section>
  );
}
