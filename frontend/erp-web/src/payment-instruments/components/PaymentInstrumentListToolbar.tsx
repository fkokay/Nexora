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
        label="Türe göre filtrele"
        value={kindFilter}
        onChange={(value) => onKindFilterChange(value as KindFilter)}
        options={[
          { value: "All", label: "Çek ve senet" },
          { value: "Check", label: "Çekler" },
          { value: "PromissoryNote", label: "Senetler" },
        ]}
      />
      <ListChipGroup
        label="Duruma göre filtrele"
        value={filter}
        onChange={(value) => onFilterChange(value as StatusFilter)}
        options={[
          { value: "All", label: "Tüm durumlar" },
          ...(Object.keys(statusText) as Status[]).map((value) => ({
            value,
            label: statusText[value],
          })),
        ]}
      />
    </ListToolbar>
  );
}
