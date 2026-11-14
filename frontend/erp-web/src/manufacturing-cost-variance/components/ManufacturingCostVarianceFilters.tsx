import { ListToolbar } from "../../list-page/ListToolbar";

type Props = {
  from: string;
  to: string;
  maxTo?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onRefresh: () => void;
  /** Receives the toolbar slot the list grid renders its own tools into. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

/**
 * Toolbar row of the cost analysis list. The report reloads as soon as a date
 * changes, so there is no separate "apply" button.
 */
export function ManufacturingCostVarianceFilters({
  from,
  to,
  maxTo,
  onFromChange,
  onToChange,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar onRefresh={onRefresh} toolsSlotRef={toolsSlotRef}>
      <label className="list-v2-filter">
        Plan tarihi başlangıcı
        <input
          type="date"
          value={from}
          max={to}
          onChange={(event) => onFromChange(event.target.value)}
          required
        />
      </label>
      <label className="list-v2-filter">
        Plan tarihi bitişi
        <input
          type="date"
          value={to}
          min={from}
          max={maxTo}
          onChange={(event) => onToChange(event.target.value)}
          required
        />
      </label>
    </ListToolbar>
  );
}
