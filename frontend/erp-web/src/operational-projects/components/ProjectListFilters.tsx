import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

type Props = {
  en: boolean;
  search: string;
  statusFilter: string;
  taskFilter: string;
  overdueOnly: boolean;
  upcomingWithinDays: string;
  timeEntryDays: string;
  status: (value: string) => string;
  onSearch: (value: string) => void;
  /** Applies the current search text (called shortly after typing stops and on Enter). */
  onSearchApply: () => void;
  onStatus: (value: string) => void;
  onTask: (value: string) => void;
  onOverdue: (value: boolean) => void;
  onUpcoming: (value: string) => void;
  onTimeEntryDays: (value: string) => void;
  onRefresh: () => void;
  /** Receives the element where the project grid's own tools are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export function ProjectListFilters({
  en,
  search,
  statusFilter,
  taskFilter,
  overdueOnly,
  upcomingWithinDays,
  timeEntryDays,
  status,
  onSearch,
  onSearchApply,
  onStatus,
  onTask,
  onOverdue,
  onUpcoming,
  onTimeEntryDays,
  onRefresh,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearch}
      onSearchApply={onSearchApply}
      searchLabel={en ? "Search" : "Ara"}
      searchPlaceholder={en ? "Code or name" : "Kod veya ad"}
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
      refreshLabel={en ? "Refresh" : "Yenile"}
    >
      <ListChipGroup
        label={en ? "Status" : "Durum"}
        value={statusFilter}
        onChange={onStatus}
        options={[
          { value: "", label: en ? "All" : "Tümü" },
          { value: "Draft", label: status("Draft") },
          { value: "Active", label: status("Active") },
          { value: "OnHold", label: status("OnHold") },
          { value: "Completed", label: status("Completed") },
          { value: "Cancelled", label: status("Cancelled") },
        ]}
      />
      <ListChipGroup
        label={en ? "Tasks" : "Görevler"}
        value={taskFilter}
        onChange={onTask}
        allowClear
        options={[
          {
            value: "has-open",
            label: en ? "Has open tasks" : "Açık görevi olan",
          },
          {
            value: "all-complete",
            label: en ? "All tasks complete" : "Tüm görevleri tamamlanan",
          },
          { value: "no-tasks", label: en ? "No tasks" : "Görevi olmayan" },
        ]}
      />
      <ListChipGroup
        label={en ? "Overdue tasks" : "Geciken görevler"}
        value={overdueOnly ? "overdue" : ""}
        onChange={(value) => onOverdue(value === "overdue")}
        allowClear
        options={[
          {
            value: "overdue",
            label: en ? "Overdue tasks only" : "Yalnız geciken görevi olanlar",
          },
        ]}
      />
      <label className="list-v2-filter">
        {en ? "Upcoming date" : "Yaklaşan tarih"}
        <select
          value={upcomingWithinDays}
          onChange={(e) => onUpcoming(e.target.value)}
        >
          <option value="">{en ? "Any date" : "Tüm tarihler"}</option>
          <option value="30">
            {en ? "Next 30 days" : "Önümüzdeki 30 gün"}
          </option>
          <option value="90">
            {en ? "Next 90 days" : "Önümüzdeki 90 gün"}
          </option>
          <option value="365">
            {en ? "Next year" : "Önümüzdeki 365 gün"}
          </option>
        </select>
      </label>
      <label className="list-v2-filter">
        {en ? "Time records" : "Süre kayıtları"}
        <select
          value={timeEntryDays}
          onChange={(e) => onTimeEntryDays(e.target.value)}
        >
          <option value="">{en ? "Any time" : "Tüm dönemler"}</option>
          <option value="7">{en ? "Last 7 days" : "Son 7 gün"}</option>
          <option value="30">{en ? "Last 30 days" : "Son 30 gün"}</option>
          <option value="90">{en ? "Last 90 days" : "Son 90 gün"}</option>
        </select>
      </label>
    </ListToolbar>
  );
}
