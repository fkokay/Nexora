import SearchableRecordPicker from "../../SearchableRecordPicker";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type { Warehouse } from "../types";
import "../../inventory/inventory-list-v2.css";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  trackingMode: string;
  onTrackingModeChange: (value: string) => void;
  warehouseId: string;
  onWarehouseSelect: (value: string) => void;
  warehouses: Warehouse[];
  warehousesLoading: boolean;
  warehouseError: string;
  hasFilters: boolean;
  /** Applies the typed search text (shortly after typing stops and on Enter). */
  onApply: () => void;
  onClear: () => void;
  onRefresh: () => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export default function InventoryTrackingFilters({
  query,
  onQueryChange,
  trackingMode,
  onTrackingModeChange,
  warehouseId,
  onWarehouseSelect,
  warehouses,
  warehousesLoading,
  warehouseError,
  hasFilters,
  onApply,
  onClear,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={query}
      onSearchChange={onQueryChange}
      onSearchApply={onApply}
      searchLabel="Lot ve seri bakiyelerini filtrele"
      searchPlaceholder="Lot/seri kodu, stok veya depo ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
      refreshLabel="Lot ve seri bakiyelerini yenile"
    >
      <ListChipGroup
        label="İz türü"
        value={trackingMode}
        onChange={onTrackingModeChange}
        options={[
          { value: "", label: "Tümü" },
          { value: "Lot", label: "Lot" },
          { value: "Serial", label: "Seri" },
        ]}
      />
      <label className="list-v2-filter">
        Depo
        <SearchableRecordPicker
          id="inventory-tracking-warehouse"
          describedBy={
            warehouseError ? "inventory-tracking-warehouse-error" : undefined
          }
          options={warehouses.map((row) => ({
            id: row.id,
            label: `${row.code} · ${row.name}`,
          }))}
          selectedId={warehouseId}
          onSelect={onWarehouseSelect}
          title="Depo seçin"
          placeholder="Tüm depolar"
          clearable
          clearLabel="Tüm depolar"
          searchPlaceholder="Depo kodu veya adıyla ara"
          emptyMessage="Aramanızla eşleşen depo bulunamadı."
          disabled={warehousesLoading}
        />
        {warehouseError && (
          <span
            id="inventory-tracking-warehouse-error"
            className="inventory-tracking-field-error"
          >
            Depo seçenekleri kullanılamıyor.
          </span>
        )}
      </label>
      {hasFilters && (
        <button
          className="inventory-tracking-clear"
          type="button"
          onClick={onClear}
        >
          Filtreleri temizle
        </button>
      )}
    </ListToolbar>
  );
}
