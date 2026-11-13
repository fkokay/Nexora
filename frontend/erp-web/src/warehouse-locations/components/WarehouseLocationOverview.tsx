import SearchableRecordPicker from "../../SearchableRecordPicker";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type { Location, WarehouseRow } from "../types";
import "../../inventory/inventory-list-v2.css";

type Props = {
  warehouses: WarehouseRow[];
  warehouseId: string;
  locations: Location[];
  warehousesLoading: boolean;
  loading: boolean;
  search: string;
  statusFilter: string;
  error: string;
  notice: string;
  onRefresh: () => void;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onWarehouseSelect: (warehouseId: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  /** Receives the element where the location list's own tools are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function WarehouseLocationOverview({
  warehouses,
  warehouseId,
  locations,
  warehousesLoading,
  loading,
  search,
  statusFilter,
  error,
  notice,
  onRefresh,
  onDismissError,
  onDismissNotice,
  onWarehouseSelect,
  onSearchChange,
  onStatusChange,
  toolsSlotRef,
}: Props) {
  return (
    <>
      <ListPageHeader
        className="customer-heading"
        title="Depo konumları"
        description="Ambar içindeki raf ve bölmeleri tanımlayın; konuma atanmış stok bakiyelerini izleyin."
        count={warehouseId && !loading ? locations.length : null}
      />
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button
            type="button"
            aria-label="Hata mesajını kapat"
            onClick={onDismissError}
          >
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" onClick={onDismissNotice}>
            Kapat
          </button>
        </div>
      )}
      <ListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchLabel="Kod, ad veya üst konum ara"
        searchPlaceholder="Kod, ad veya üst konum ara"
        toolsSlotRef={toolsSlotRef}
        onRefresh={onRefresh}
        refreshLabel="Depo, konum ve bakiyeleri yenile"
      >
        <label className="list-v2-filter">
          Depo
          <SearchableRecordPicker
            options={warehouses.map((row) => ({
              id: row.id,
              label: `${row.code} · ${row.name}`,
              description: row.isActive ? "Aktif" : "Pasif",
            }))}
            selectedId={warehouseId}
            onSelect={onWarehouseSelect}
            title="Depo seçin"
            placeholder={
              warehousesLoading ? "Depolar yükleniyor…" : "Depo seçin"
            }
            searchPlaceholder="Depo kodu veya adıyla ara"
            emptyMessage="Aramanızla eşleşen depo bulunamadı."
            disabled={warehousesLoading}
            clearable
            clearLabel="Depo seçimini kaldır"
          />
        </label>
        <ListChipGroup
          label="Durum"
          value={statusFilter}
          onChange={onStatusChange}
          allowClear
          hideEmpty
          options={[
            {
              value: "Active",
              label: "Aktif",
              count: locations.filter((row) => row.isActive).length,
            },
            {
              value: "Inactive",
              label: "Pasif",
              count: locations.filter((row) => !row.isActive).length,
            },
          ]}
        />
      </ListToolbar>
    </>
  );
}
