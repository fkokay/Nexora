import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

type Props = {
  query: string;
  status: "all" | "active" | "inactive";
  /** Counts shown on the status chips (already narrowed by the applied search). */
  counts?: { all: number; active: number; inactive: number } | null;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: Props["status"]) => void;
  /** Applies the typed search text; called while typing (debounced) and on Enter. */
  onApply: () => void;
  onRefresh?: () => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function FinanceAccountsToolbar({
  query,
  status,
  counts = null,
  onQueryChange,
  onStatusChange,
  onApply,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={query}
      onSearchChange={onQueryChange}
      onSearchApply={onApply}
      searchLabel="Kod, hesap veya dövize göre ara"
      searchPlaceholder="Kod, hesap veya döviz ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      <ListChipGroup
        label="Hesap durumu"
        value={status}
        onChange={(value) => onStatusChange(value as Props["status"])}
        options={[
          { value: "all", label: "Tüm durumlar", count: counts?.all },
          { value: "active", label: "Aktif", count: counts?.active },
          { value: "inactive", label: "Pasif", count: counts?.inactive },
        ]}
      />
    </ListToolbar>
  );
}
