import { localizedText } from "../../locale";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type { Direction } from "../types";

type Props = {
  query: string;
  direction: "All" | Direction;
  /** Counts shown on the direction chips; null while unknown. */
  counts?: { all: number; imports: number; exports: number } | null;
  onQueryChange: (value: string) => void;
  onDirectionChange: (value: "All" | Direction) => void;
  onRefresh?: () => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function ForeignTradeFilters({
  query,
  direction,
  counts = null,
  onQueryChange,
  onDirectionChange,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={query}
      onSearchChange={onQueryChange}
      searchLabel={localizedText("Referans ara", "Search references")}
      searchPlaceholder={localizedText("Referans ara…", "Search references…")}
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
      refreshLabel={localizedText("Yenile", "Refresh")}
    >
      <ListChipGroup
        label={localizedText("Yön filtresi", "Filter by direction")}
        value={direction}
        onChange={(value) => onDirectionChange(value as "All" | Direction)}
        options={[
          {
            value: "All",
            label: localizedText("Tüm yönler", "All directions"),
            count: counts?.all,
          },
          {
            value: "Import",
            label: localizedText("İthalat", "Import"),
            count: counts?.imports,
          },
          {
            value: "Export",
            label: localizedText("İhracat", "Export"),
            count: counts?.exports,
          },
        ]}
      />
    </ListToolbar>
  );
}
