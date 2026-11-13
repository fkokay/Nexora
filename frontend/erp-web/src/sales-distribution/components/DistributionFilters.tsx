import SearchableRecordPicker from "../../SearchableRecordPicker";
import { ListToolbar } from "../../list-page/ListToolbar";
import type { Warehouse } from "./types";

type Props = {
  warehouses: Warehouse[];
  warehouseId: string;
  query: string;
  onWarehouseChange: (id: string) => void;
  /** The plan reloads as the text changes. */
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export default function DistributionFilters({
  warehouses,
  warehouseId,
  query,
  onWarehouseChange,
  onQueryChange,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={query}
      onSearchChange={(value) => onQueryChange(value.slice(0, 120))}
      searchLabel="Stok kodu veya adı"
      searchPlaceholder="Kod veya stok adı ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      <label className="sales-lv2-picker">
        <span>Depo</span>
        <SearchableRecordPicker
          options={warehouses.map((x) => ({
            id: x.id,
            label: `${x.code} · ${x.name}`,
          }))}
          selectedId={warehouseId}
          onSelect={onWarehouseChange}
          title="Depo seçin"
          placeholder="Depo seçin"
          clearable
          clearLabel="Depo filtresini kaldır"
          searchPlaceholder="Depo kodu veya adıyla ara"
          emptyMessage="Aramanızla eşleşen depo bulunamadı."
        />
      </label>
    </ListToolbar>
  );
}
