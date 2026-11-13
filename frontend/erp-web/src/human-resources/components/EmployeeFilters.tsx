import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type { Translate } from "./types";

export type EmployeeFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  /** Counts shown on the status chips. */
  activeCount: number;
  terminatedCount: number;
  isEnglish: boolean;
  statusLabel: (status: string, isEnglish: boolean) => string;
  /** Receives the element where the grid's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
  onRefresh: () => void;
  translate: Translate;
};

/** Toolbar row of the employee list: search, status chips, grid tools, refresh. */
export default function EmployeeFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  activeCount,
  terminatedCount,
  isEnglish,
  statusLabel,
  toolsSlotRef,
  onRefresh,
  translate,
}: EmployeeFiltersProps) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchLabel={translate("Personel ara", "Search employees")}
      searchPlaceholder={translate(
        "Kod, ad, departman veya görev",
        "Code, name, department, or job title",
      )}
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      <ListChipGroup
        label={translate("Durum", "Status")}
        value={statusFilter}
        onChange={onStatusChange}
        allowClear
        hideEmpty
        options={[
          {
            value: "Active",
            label: statusLabel("Active", isEnglish),
            count: activeCount,
          },
          {
            value: "Terminated",
            label: statusLabel("Terminated", isEnglish),
            count: terminatedCount,
          },
        ]}
      />
    </ListToolbar>
  );
}
