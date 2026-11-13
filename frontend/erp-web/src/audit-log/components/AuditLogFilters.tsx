import { ListToolbar } from "../../list-page/ListToolbar";

type Props = {
  search: string;
  from: string;
  to: string;
  onSearchChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
  /** Receives the element where the grid's own tools (columns, export…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function AuditLogFilters({
  search,
  from,
  to,
  onSearchChange,
  onFromChange,
  onToChange,
  onApply,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={search}
      // The audit search accepts at most 120 characters.
      onSearchChange={(value) => onSearchChange(value.slice(0, 120))}
      onSearchApply={onApply}
      searchPlaceholder="İşlem veya kaynak ara"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      <label className="list-v2-filter">
        <span>Başlangıç tarihi</span>
        <input
          aria-label="Başlangıç tarihi"
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
        />
      </label>
      <label className="list-v2-filter">
        <span>Bitiş tarihi</span>
        <input
          aria-label="Bitiş tarihi"
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
        />
      </label>
    </ListToolbar>
  );
}
