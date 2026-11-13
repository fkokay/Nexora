import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { stages, stageLabels } from "../types";

/** Opportunity counts for the current search text, per stage; `total` ignores the stage. */
export type CrmStageCounts = { total: number; byStage: Record<string, number> };

type Props = {
  search: string;
  filter: string;
  onSearchChange: (value: string) => void;
  onSearchApply: () => void;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  /** Counts shown on the stage chips; null while loading or unavailable. */
  counts?: CrmStageCounts | null;
  /** Receives the element where the grid's own tools (columns, export…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function CrmOpportunityFilters({
  search,
  filter,
  onSearchChange,
  onSearchApply,
  onFilterChange,
  onRefresh,
  counts = null,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      onSearchApply={onSearchApply}
      searchLabel="Fırsatlarda ara"
      searchPlaceholder="Kod, fırsat veya müşteri ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      <ListChipGroup
        label="Aşamaya göre filtrele"
        value={filter}
        onChange={onFilterChange}
        options={[
          { value: "", label: "Tümü", count: counts?.total },
          ...stages.map((stage) => ({
            value: stage as string,
            label: stageLabels[stage],
            count: counts?.byStage[stage],
          })),
        ]}
      />
    </ListToolbar>
  );
}
