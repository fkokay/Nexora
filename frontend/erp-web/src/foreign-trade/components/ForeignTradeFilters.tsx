import { localizedText } from "../../locale";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { tradeStageFlow, type Direction, type TradeStatus } from "../types";

type Props = {
  query: string;
  direction: "All" | Direction;
  /** Counts shown on the direction chips; null while unknown. */
  counts?: { all: number; imports: number; exports: number } | null;
  onQueryChange: (value: string) => void;
  onDirectionChange: (value: "All" | Direction) => void;
  /** Stage filter (the former stage strip): one status, null = all. */
  stage: TradeStatus | null;
  onStageChange: (value: TradeStatus | null) => void;
  statusLabel: (status: TradeStatus) => string;
  onRefresh?: () => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

/**
 * Toolbar of the case list: search, direction chips and stage chips. The stage chips carry no counts: the page
 * loads one page of cases, so a count would not be the real total (mockup 10, Dış Ticaret).
 */
export function ForeignTradeFilters({
  query,
  direction,
  counts = null,
  onQueryChange,
  onDirectionChange,
  stage,
  onStageChange,
  statusLabel,
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
      <ListChipGroup
        label={localizedText("Aşama filtresi", "Stage filter")}
        value={stage ?? ""}
        onChange={(value) => onStageChange((value || null) as TradeStatus | null)}
        allowClear
        options={[...tradeStageFlow, "Cancelled" as TradeStatus].map((status) => ({
          value: status,
          label: statusLabel(status),
        }))}
      />
    </ListToolbar>
  );
}
