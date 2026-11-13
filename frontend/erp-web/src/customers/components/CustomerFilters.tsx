import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

export type CustomerDirectoryCounts = {
  total: number;
  customers: number;
  suppliers: number;
  dealers: number;
  employees: number;
  others: number;
  active: number;
  inactive: number;
};

type Props = {
  search: string;
  typeFilter: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
  /** Counts shown on the filter chips; null while loading or unavailable. */
  counts?: CustomerDirectoryCounts | null;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  typeFilterLabel?: string;
  statusFilterLabel?: string;
  /** Kept for saved page settings; the search now applies as you type. */
  applyLabel?: string;
  showTypeFilter?: boolean;
  showStatusFilter?: boolean;
};

export function CustomerFilters({
  search,
  typeFilter,
  statusFilter,
  onSearchChange,
  onTypeChange,
  onStatusChange,
  onApply,
  onRefresh,
  counts = null,
  toolsSlotRef,
  searchLabel = "Cari ara",
  searchPlaceholder = "Cari kodu, unvanı veya vergi no ile ara",
  typeFilterLabel = "Cari türü",
  statusFilterLabel = "Durum",
  showTypeFilter = true,
  showStatusFilter = true,
}: Props) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      onSearchApply={onApply}
      searchLabel={searchLabel}
      searchPlaceholder={searchPlaceholder}
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
      refreshLabel="Cari listesini yenile"
    >
      {showTypeFilter && (
        <ListChipGroup
          label={typeFilterLabel}
          value={typeFilter}
          onChange={onTypeChange}
          hideEmpty
          options={[
            { value: "", label: "Tümü", count: counts?.total },
            { value: "Customer", label: "Müşteri", count: counts?.customers },
            { value: "Supplier", label: "Tedarikçi", count: counts?.suppliers },
            { value: "Dealer", label: "Bayi", count: counts?.dealers },
            { value: "Employee", label: "Personel", count: counts?.employees },
            { value: "Both", label: "Diğer", count: counts?.others },
          ]}
        />
      )}
      {showStatusFilter && (
        <ListChipGroup
          label={statusFilterLabel}
          value={statusFilter}
          onChange={onStatusChange}
          allowClear
          options={[
            { value: "Active", label: "Aktif", count: counts?.active },
            { value: "Inactive", label: "Pasif", count: counts?.inactive },
          ]}
        />
      )}
    </ListToolbar>
  );
}
