import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type {
  KindFilter,
  Status,
  StatusFilter,
} from "../paymentInstrumentTypes";
import { statusText } from "../paymentInstrumentTypes";

type Props = {
  searchDraft: string;
  filter: StatusFilter;
  kindFilter: KindFilter;
  /** Counts for the active direction tab (with the type and search filters); omit while unknown. */
  statusCounts?: Partial<Record<Status, number>>;
  totalCount?: number;
  onSearchDraftChange: (value: string) => void;
  /** Applies the typed search text; called while typing (debounced) and on Enter. */
  onSearch: () => void;
  onFilterChange: (value: StatusFilter) => void;
  onKindFilterChange: (value: KindFilter) => void;
  onRefresh: () => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function PaymentInstrumentListToolbar({
  searchDraft,
  filter,
  kindFilter,
  statusCounts,
  totalCount,
  onSearchDraftChange,
  onSearch,
  onFilterChange,
  onKindFilterChange,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={searchDraft}
      onSearchChange={(value) => onSearchDraftChange(value.slice(0, 100))}
      onSearchApply={onSearch}
      searchLabel="Çek/senet no, portföy kodu veya cari ara"
      searchPlaceholder="Çek/senet no, portföy kodu veya cari ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      <ListChipGroup
        label="Duruma göre filtrele"
        value={filter}
        onChange={(value) => onFilterChange(value as StatusFilter)}
        hideEmpty={!!statusCounts}
        options={[
          { value: "All", label: "Tümü", count: totalCount },
          ...(Object.keys(statusText) as Status[]).map((value) => ({
            value,
            label: statusText[value],
            count: statusCounts ? (statusCounts[value] ?? 0) : undefined,
          })),
        ]}
      />
      <ListChipGroup
        label="Türe göre filtrele"
        value={kindFilter === "All" ? "" : kindFilter}
        allowClear
        onChange={(value) => onKindFilterChange((value || "All") as KindFilter)}
        options={[
          { value: "Check", label: "Çek" },
          { value: "PromissoryNote", label: "Senet" },
        ]}
      />
    </ListToolbar>
  );
}
