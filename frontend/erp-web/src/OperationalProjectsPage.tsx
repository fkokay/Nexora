import SearchableRecordPicker from "./SearchableRecordPicker";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import { authenticatedFetch } from "./authApi";
import { localDateString } from "./dateUtils";
import "./operational-projects.css";
import ModuleRecordForm from "./human-resources/components/ModuleRecordForm";
import { RecordFormGroup } from "./record-form/RecordForm";
import { ListPageHeader } from "./list-page/ListPageHeader";
import "./operational-projects/operational-projects-list-v2.css";
import { ProjectDashboardSummary } from "./operational-projects/components/ProjectDashboardSummary";
import { ProjectListFilters } from "./operational-projects/components/ProjectListFilters";
import { ProjectRegister } from "./operational-projects/components/ProjectRegister";
import { ProjectCostSummaryCard } from "./operational-projects/components/ProjectCostSummaryCard";
import type {
  ProjectSummary as Summary,
  ProjectPage as Page,
  ProjectDashboardSummary as DashboardSummary,
  ProjectCostSummary as CostSummary,
  ProjectScreenField,
} from "./operational-projects/types";

type Project = {
  id: string;
  code: string;
  name: string;
  customerAccountId: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  budgetAmount: number;
  currencyCode: string;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};
type Task = {
  id: string;
  projectId: string;
  code: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  plannedHours: number;
  status: string;
  createdAt: string;
};
type Allocation = {
  id: string;
  projectId: string;
  taskId: string | null;
  employeeId: string | null;
  resourceName: string;
  plannedHours: number;
  plannedHourlyCost: number | null;
  currencyCode: string;
  notes: string | null;
  createdAt: string;
};
type TimeEntry = {
  id: string;
  projectId: string;
  taskId: string | null;
  userId: string;
  workDate: string;
  hours: number;
  description: string | null;
  createdAt: string;
};
type Detail = {
  project: Project;
  tasks: Task[];
  allocations: Allocation[];
  timeEntries: TimeEntry[];
};
type Employee = {
  id: string;
  personnelCode: string;
  fullName: string;
  status: string;
};
const defaultProjectScreenFields: ProjectScreenField[] = [
  { key: "code", label: "Proje kodu", visible: true, position: 0 },
  { key: "name", label: "Proje adı", visible: true, position: 1 },
  { key: "status", label: "Durum", visible: true, position: 2 },
  { key: "endDate", label: "Bitiş", visible: true, position: 3 },
  { key: "budgetAmount", label: "Bütçe", visible: true, position: 4 },
  { key: "taskCount", label: "Görev", visible: true, position: 5 },
  {
    key: "overdueTaskCount",
    label: "Geciken görev",
    visible: false,
    position: 6,
  },
  {
    key: "actualHours",
    label: "Gerçekleşen saat",
    visible: false,
    position: 7,
  },
  { key: "nextTaskDate", label: "Sıradaki görev", visible: false, position: 8 },
  { key: "startDate", label: "Başlangıç", visible: false, position: 9 },
  { key: "currencyCode", label: "Döviz", visible: false, position: 10 },
  {
    key: "completedTaskCount",
    label: "Tamamlanan görev",
    visible: false,
    position: 11,
  },
  {
    key: "actions",
    label: "İşlemler",
    visible: true,
    position: 12,
    fixed: true,
  },
];
const defaultProjectTaskFields: ProjectScreenField[] = [
  { key: "code", label: "Görev kodu", visible: true, position: 0 },
  { key: "name", label: "Görev", visible: true, position: 1 },
  { key: "status", label: "Durum", visible: true, position: 2 },
  { key: "plannedHours", label: "Planlanan saat", visible: true, position: 3 },
  { key: "startDate", label: "Başlangıç", visible: true, position: 4 },
  { key: "endDate", label: "Bitiş", visible: true, position: 5 },
  {
    key: "actions",
    label: "Durum işlemi",
    visible: true,
    position: 6,
    fixed: true,
  },
];
const defaultProjectTimeFields: ProjectScreenField[] = [
  { key: "workDate", label: "Çalışma tarihi", visible: true, position: 0 },
  { key: "taskName", label: "Görev", visible: true, position: 1 },
  { key: "hours", label: "Gerçekleşen saat", visible: true, position: 2 },
  { key: "description", label: "Açıklama", visible: true, position: 3 },
];
async function api<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const r = await authenticatedFetch(url, token, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!r.ok) {
    let msg = `İstek başarısız (${r.status})`;
    try {
      const b = await r.json();
      msg =
        b.error ||
        b.title ||
        Object.values(b.errors || {})
          .flat()
          .join(" ") ||
        msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

function isTenantAdmin(token: string) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (
      JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")))
        .role === "TenantAdmin"
    );
  } catch {
    return false;
  }
}

export default function OperationalProjectsPage({
  token,
  locale = "tr",
}: {
  token: string;
  locale?: "tr" | "en";
}) {
  const en = locale === "en",
    canManage = isTenantAdmin(token),
    [page, setPage] = useState<Page | null>(null),
    [pageNumber, setPageNumber] = useState(1),
    [gridSort, setGridSort] = useState<{
      field: string;
      direction: "asc" | "desc";
    }>({ field: "updatedAt", direction: "desc" }),
    [dashboard, setDashboard] = useState<DashboardSummary | null>(null),
    [selected, setSelected] = useState<Detail | null>(null),
    [costSummary, setCostSummary] = useState<CostSummary | null>(null),
    [employees, setEmployees] = useState<Employee[]>([]),
    // `searchText` is the text in the search box; `search` is the applied search.
    [searchText, setSearchText] = useState(""),
    [search, setSearch] = useState(""),
    [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(null),
    [statusFilter, setStatusFilter] = useState(""),
    [taskFilter, setTaskFilter] = useState(""),
    [overdueOnly, setOverdueOnly] = useState(false),
    [upcomingWithinDays, setUpcomingWithinDays] = useState(""),
    [timeEntryDays, setTimeEntryDays] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const hourUnit = en ? "h" : "saat",
    formatHours = (value: number) =>
      value.toLocaleString(en ? "en-US" : "tr-TR", {
        maximumFractionDigits: 2,
      });
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [customer, setCustomer] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [budget, setBudget] = useState("0"),
    [currency, setCurrency] = useState("TRY"),
    [notes, setNotes] = useState(""),
    stayAfterCreate = useRef(false),
    [projectFormOpen, setProjectFormOpen] = useState(false);
  const [taskCode, setTaskCode] = useState(""),
    [taskName, setTaskName] = useState(""),
    [taskHours, setTaskHours] = useState("0"),
    [taskStart, setTaskStart] = useState(""),
    [taskEnd, setTaskEnd] = useState("");
  const [resource, setResource] = useState(""),
    [employee, setEmployee] = useState(""),
    [task, setTask] = useState(""),
    [hours, setHours] = useState("1"),
    [hourlyCost, setHourlyCost] = useState(""),
    [allocationCurrency, setAllocationCurrency] = useState("TRY");
  const [timeTask, setTimeTask] = useState(""),
    [workDate, setWorkDate] = useState(localDateString()),
    [actualHours, setActualHours] = useState("1"),
    [timeDescription, setTimeDescription] = useState("");
  const [projectScreenFields, setProjectScreenFields] = useState<
    ProjectScreenField[]
  >(defaultProjectScreenFields);
  useEffect(() => {
    let active = true;
    void api<{ fields: ProjectScreenField[] }>(
      "/api/screen-views/operational-projects/active",
      token,
    )
      .then((view) => {
        if (active && view.fields?.length)
          setProjectScreenFields(
            view.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  const shownProjectFields = projectScreenFields
    .filter((field) => field.fixed || field.visible)
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
  // The code is shown under the name, so it gets no column of its own while the name
  // column is visible.
  const hasProjectNameColumn = shownProjectFields.some(
    (field) => field.key === "name",
  );
  const visibleProjectFields = shownProjectFields.filter(
    (field) => !(hasProjectNameColumn && field.key === "code"),
  );
  const [taskScreenFields, setTaskScreenFields] = useState<
    ProjectScreenField[]
  >(defaultProjectTaskFields);
  const [timeScreenFields, setTimeScreenFields] = useState<
    ProjectScreenField[]
  >(defaultProjectTimeFields);
  useEffect(() => {
    let active = true;
    setTaskScreenFields(defaultProjectTaskFields);
    setTimeScreenFields(defaultProjectTimeFields);
    if (!selected)
      return () => {
        active = false;
      };
    const projectId = selected.project.id;
    void Promise.all([
      api<{ fields: ProjectScreenField[] }>(
        `/api/screen-views/operational-project-tasks/active?projectId=${encodeURIComponent(projectId)}`,
        token,
      ),
      api<{ fields: ProjectScreenField[] }>(
        `/api/screen-views/operational-project-time-entries/active?projectId=${encodeURIComponent(projectId)}`,
        token,
      ),
    ])
      .then(([tasks, times]) => {
        if (!active) return;
        if (tasks.fields?.length)
          setTaskScreenFields(
            tasks.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
        if (times.fields?.length)
          setTimeScreenFields(
            times.fields.map((field, index) => ({
              ...field,
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, selected?.project.id]);
  const visibleTaskFields = taskScreenFields
    .filter((field) => field.fixed || field.visible)
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
  const visibleTimeFields = timeScreenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const listLoadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++listLoadSequence.current;
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(pageNumber),
        pageSize: "100",
        overdueOnly: String(overdueOnly),
        sortBy: gridSort.field,
        sortDirection: gridSort.direction,
      });
      if (timeEntryDays) query.set("timeEntryDays", timeEntryDays);
      if (search.trim()) query.set("search", search.trim());
      if (statusFilter) query.set("status", statusFilter);
      if (taskFilter) query.set("taskCompletion", taskFilter);
      if (upcomingWithinDays)
        query.set("upcomingWithinDays", upcomingWithinDays);
      const [p, d] = await Promise.all([
        api<Page>(`/api/projects?${query}`, token),
        api<DashboardSummary>(
          `/api/projects/dashboard-summary${timeEntryDays ? `?timeEntryDays=${timeEntryDays}` : ""}`,
          token,
        ),
      ]);
      if (sequence !== listLoadSequence.current) return;
      setPage(p);
      setDashboard(d);
      setSelected((old) =>
        old
          ? p.items.some((x) => x.id === old.project.id)
            ? old
            : null
          : null,
      );
    } catch (e) {
      if (sequence === listLoadSequence.current) setError((e as Error).message);
    }
  }, [
    token,
    search,
    statusFilter,
    taskFilter,
    overdueOnly,
    upcomingWithinDays,
    timeEntryDays,
    pageNumber,
    gridSort,
  ]);
  useEffect(() => {
    setPageNumber(1);
  }, [
    search,
    statusFilter,
    taskFilter,
    overdueOnly,
    upcomingWithinDays,
    timeEntryDays,
  ]);
  const detailLoadSequence = useRef(0);
  const loadDetail = useCallback(
    async (id: string) => {
      const sequence = ++detailLoadSequence.current;
      setError("");
      setSelected(null);
      setCostSummary(null);
      try {
        const [detail, summary] = await Promise.all([
          api<Detail>(`/api/projects/${id}`, token),
          api<CostSummary>(`/api/projects/${id}/cost-summary`, token),
        ]);
        if (sequence !== detailLoadSequence.current) return;
        setSelected(detail);
        setCostSummary(summary);
      } catch (e) {
        if (sequence === detailLoadSequence.current)
          setError((e as Error).message);
      }
    },
    [token],
  );
  useEffect(() => {
    void load();
    void api<Employee[]>("/api/hr/employees", token)
      .then((x) => setEmployees(x.filter((e) => e.status !== "Terminated")))
      .catch(() => {});
  }, [load, token]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
      if (selected) await loadDetail(selected.project.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function resetProjectForm() {
    setCode("");
    setName("");
    setCustomer("");
    setStart("");
    setEnd("");
    setBudget("0");
    setCurrency("TRY");
    setNotes("");
  }
  function createProject(e: React.FormEvent) {
    e.preventDefault();
    return run(
      async () => {
        const p = await api<Project>("/api/projects", token, {
          method: "POST",
          body: JSON.stringify({
            code,
            name,
            customerAccountId: customer || null,
            startDate: start || null,
            endDate: end || null,
            budgetAmount: Number(budget),
            currencyCode: currency,
            notes: notes || null,
          }),
        });
        await loadDetail(p.id);
        resetProjectForm();
        if (!stayAfterCreate.current) setProjectFormOpen(false);
      },
      en ? "Project created" : "Proje oluşturuldu",
    );
  }
  async function importProjectRows(rows: Record<string, unknown>[]) {
    if (!canManage)
      throw new Error("Proje içe aktarma yalnızca firma yöneticisine açıktır.");
    let imported = 0;
    for (let index = 0; index < rows.length; index++) {
      const fields = Object.entries(rows[index]).map(
          ([key, value]) =>
            [
              key.trim().toLocaleLowerCase("tr-TR"),
              String(value ?? "").trim(),
            ] as const,
        ),
        read = (...keys: string[]) =>
          fields.find(([key]) => keys.includes(key))?.[1] ?? "",
        projectCode = read("proje kodu", "code", "project code"),
        projectName = read("proje adı", "name", "project name");
      if (!projectCode || !projectName)
        throw new Error(
          `Excel satır ${index + 2}: proje kodu ve proje adı zorunludur.`,
        );
      const budgetText =
          read("operasyonel bütçe", "budget", "budget amount") || "0",
        budgetAmount = Number(
          budgetText.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."),
        );
      if (!Number.isFinite(budgetAmount) || budgetAmount < 0)
        throw new Error(`Excel satır ${index + 2}: bütçe geçersiz.`);
      try {
        await api<Project>("/api/projects", token, {
          method: "POST",
          body: JSON.stringify({
            code: projectCode,
            name: projectName,
            customerAccountId:
              read("cari hesap kimliği", "customer account id") || null,
            startDate: read("başlangıç", "start date") || null,
            endDate: read("bitiş", "end date") || null,
            budgetAmount,
            currencyCode: (
              read("döviz", "currency", "currency code") || "TRY"
            ).toUpperCase(),
            notes: read("not", "notes") || null,
          }),
        });
        imported++;
      } catch (error) {
        throw new Error(
          `${imported} proje eklendi. Excel satır ${index + 2} kaydedilemedi: ${(error as Error).message}`,
        );
      }
    }
    await load();
    setNotice(`${imported} proje Excel'den aktarıldı.`);
  }
  function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    return run(
      async () => {
        await api(`/api/projects/${selected.project.id}/tasks`, token, {
          method: "POST",
          body: JSON.stringify({
            code: taskCode,
            name: taskName,
            startDate: taskStart || null,
            endDate: taskEnd || null,
            plannedHours: Number(taskHours),
          }),
        });
        setTaskCode("");
        setTaskName("");
        setTaskStart("");
        setTaskEnd("");
        setTaskHours("0");
      },
      en ? "Task added" : "Görev eklendi",
    );
  }
  function allocate(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    return run(
      () =>
        api(`/api/projects/${selected.project.id}/resources`, token, {
          method: "POST",
          body: JSON.stringify({
            taskId: task || null,
            employeeId: employee || null,
            resourceName: employee ? null : resource,
            plannedHours: Number(hours),
            plannedHourlyCost: hourlyCost === "" ? null : Number(hourlyCost),
            currencyCode: allocationCurrency,
            notes: null,
          }),
        }),
      en ? "Resource allocation recorded" : "Kaynak planlaması kaydedildi",
    );
  }
  function recordTime(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    return run(
      () =>
        api(`/api/projects/${selected.project.id}/time-entries`, token, {
          method: "POST",
          body: JSON.stringify({
            taskId: timeTask || null,
            workDate,
            hours: Number(actualHours),
            description: timeDescription || null,
          }),
        }),
      en ? "Time recorded" : "Çalışma süresi kaydedildi",
    );
  }
  const status = (s: string) =>
    ({
      Draft: en ? "Draft" : "Taslak",
      Active: en ? "Active" : "Devam ediyor",
      OnHold: en ? "On hold" : "Beklemede",
      Completed: en ? "Completed" : "Tamamlandı",
      Cancelled: en ? "Cancelled" : "İptal",
    })[s] || s;
  const taskStatus = (s: string) =>
    ({
      Open: en ? "Open" : "Açık",
      InProgress: en ? "In progress" : "Devam ediyor",
      Blocked: en ? "Blocked" : "Engellendi",
      Completed: en ? "Completed" : "Tamamlandı",
      Cancelled: en ? "Cancelled" : "İptal",
    })[s] || s;
  const formatProjectDate = (value: string | null) =>
    value
      ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(
          en ? "en-US" : "tr-TR",
        )
      : "—";
  const projectFieldValue = (project: Summary, key: string) => {
    switch (key) {
      case "code":
        return project.code;
      case "name":
        return (
          <>
            <b>{project.name}</b>
            <small className="cell-subtitle list-v2-name-code">
              {project.code}
            </small>
          </>
        );
      case "status":
        return (
          <span className={`op-project-status ${project.status.toLowerCase()}`}>
            {status(project.status)}
          </span>
        );
      case "startDate":
        return formatProjectDate(project.startDate);
      case "endDate":
        return formatProjectDate(project.endDate);
      case "budgetAmount":
        return project.budgetAmount.toLocaleString(en ? "en-US" : "tr-TR", {
          style: "currency",
          currency: project.currencyCode,
        });
      case "currencyCode":
        return project.currencyCode;
      case "taskCount":
        return `${project.taskCount}`;
      case "completedTaskCount":
        return `${project.completedTaskCount}/${project.taskCount}`;
      case "overdueTaskCount":
        return `${project.overdueTaskCount}`;
      case "actualHours":
        return `${formatHours(project.actualHours)} ${hourUnit}`;
      case "nextTaskDate":
        return formatProjectDate(project.nextTaskDate);
      default:
        return "—";
    }
  };
  const hasProjectFilters = Boolean(
    search.trim() ||
      statusFilter ||
      taskFilter ||
      overdueOnly ||
      upcomingWithinDays ||
      timeEntryDays,
  );
  function clearProjectFilters() {
    setSearchText("");
    setSearch("");
    setStatusFilter("");
    setTaskFilter("");
    setOverdueOnly(false);
    setUpcomingWithinDays("");
    setTimeEntryDays("");
    setPageNumber(1);
  }
  return (
    <main className="operational-projects list-v2">
      <ListPageHeader
        title={en ? "Projects" : "Projeler"}
        description={
          en
            ? "Track delivery, dates, budget and planned resources. Budget and cost fields are operational planning values."
            : "Teslimat, tarihler, bütçe ve planlanan kaynakları takip edin. Bütçe ve maliyet alanları operasyonel planlama değeridir."
        }
        count={page?.total ?? null}
        countLabel={en ? "records" : "kayıt"}
      >
        {canManage && (
          <button className="primary" onClick={() => setProjectFormOpen(true)}>
            <Plus size={16} />
            {en ? "New project" : "Yeni proje"}
          </button>
        )}
      </ListPageHeader>
      {dashboard && (
        <ProjectDashboardSummary
          summary={dashboard}
          en={en}
          timeEntryDays={timeEntryDays}
          hourUnit={hourUnit}
          formatHours={formatHours}
        />
      )}
      {error && <div className="alert inline-alert">{error}</div>}
      {notice && <div className="op-project-notice">{notice}</div>}
      <ProjectListFilters
        en={en}
        search={searchText}
        statusFilter={statusFilter}
        taskFilter={taskFilter}
        overdueOnly={overdueOnly}
        upcomingWithinDays={upcomingWithinDays}
        timeEntryDays={timeEntryDays}
        status={status}
        onSearch={setSearchText}
        onSearchApply={() => setSearch(searchText.trim())}
        onStatus={setStatusFilter}
        onTask={setTaskFilter}
        onOverdue={setOverdueOnly}
        onUpcoming={setUpcomingWithinDays}
        onTimeEntryDays={setTimeEntryDays}
        onRefresh={() => void load()}
        toolsSlotRef={setGridToolsSlot}
      />
      <section
        className={`op-project-layout${selected ? " has-selection" : ""}`}
      >
        <aside
          className="panel op-project-list list-v2-list"
          aria-label={en ? "Project register" : "Proje listesi"}
        >
          <ProjectRegister
            page={page}
            pageNumber={pageNumber}
            search={search}
            loading={page === null}
            en={en}
            canManage={canManage}
            busy={busy}
            hasFilters={hasProjectFilters}
            fields={visibleProjectFields}
            selectedId={selected?.project.id ?? null}
            toolbarContainer={gridToolsSlot}
            renderValue={projectFieldValue}
            onQueryChange={(gridQuery) => {
              setSearch(gridQuery.search);
              setPageNumber(gridQuery.page);
              const sort = gridQuery.sorts[0],
                field = sort
                  ? visibleProjectFields[sort.index]?.key
                  : undefined;
              if (field)
                setGridSort({ field, direction: sort?.direction ?? "desc" });
            }}
            onSelect={(project) => void loadDetail(project.id)}
            onPageChange={setPageNumber}
            onClearFilters={clearProjectFilters}
            onCreate={() => setProjectFormOpen(true)}
            onImportRows={canManage ? importProjectRows : undefined}
          />
        </aside>
        <section className="panel op-project-detail">
          {selected ? (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">
                    {selected.project.code} · {status(selected.project.status)}
                  </p>
                  <h2>{selected.project.name}</h2>
                  <p>
                    {selected.project.startDate || "—"} →{" "}
                    {selected.project.endDate || "—"} ·{" "}
                    {selected.project.budgetAmount.toLocaleString(
                      en ? "en-US" : "tr-TR",
                      {
                        style: "currency",
                        currency: selected.project.currencyCode,
                      },
                    )}
                  </p>
                </div>
                <select
                  value={selected.project.status}
                  disabled={
                    busy ||
                    ["Completed", "Cancelled"].includes(selected.project.status)
                  }
                  onChange={(e) =>
                    void run(
                      () =>
                        api(
                          `/api/projects/${selected.project.id}/status`,
                          token,
                          {
                            method: "POST",
                            body: JSON.stringify({ status: e.target.value }),
                          },
                        ),
                      en ? "Status updated" : "Durum güncellendi",
                    )
                  }
                >
                  <option value="Draft">{status("Draft")}</option>
                  <option value="Active">{status("Active")}</option>
                  <option value="OnHold">{status("OnHold")}</option>
                  <option value="Completed">{status("Completed")}</option>
                  <option value="Cancelled">{status("Cancelled")}</option>
                </select>
              </div>
              <ProjectCostSummaryCard summary={costSummary} en={en} />{" "}
              <div className="op-project-split">
                <section>
                  <h3>{en ? "Tasks" : "Görevler"}</h3>
                  <AdvancedDataGrid
                    hideSearch
                    className="op-project-detail-grid"
                  >
                    <thead>
                      <ScreenViewGroupHeader
                        fields={visibleTaskFields}
                        generalLabel={en ? "Task" : "Görev"}
                      />
                      <tr>
                        {visibleTaskFields.map((field) => (
                          <th key={field.key}>
                            {en
                              ? ((
                                  {
                                    code: "Code",
                                    name: "Task",
                                    status: "Status",
                                    plannedHours: "Planned hours",
                                    startDate: "Start date",
                                    endDate: "End date",
                                    actions: "Status action",
                                  } as Record<string, string>
                                )[field.key] ?? field.label)
                              : field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.tasks.map((t) => (
                        <tr key={t.id}>
                          {visibleTaskFields.map((field) => (
                            <td key={field.key}>
                              {field.key === "code" ? (
                                t.code
                              ) : field.key === "name" ? (
                                t.name
                              ) : field.key === "status" ? (
                                taskStatus(t.status)
                              ) : field.key === "plannedHours" ? (
                                `${formatHours(t.plannedHours)} ${hourUnit}`
                              ) : field.key === "startDate" ? (
                                t.startDate || "—"
                              ) : field.key === "endDate" ? (
                                t.endDate || "—"
                              ) : field.key === "actions" && canManage ? (
                                <select
                                  aria-label={
                                    en
                                      ? `Status for ${t.name}`
                                      : `${t.name} görevinin durumu`
                                  }
                                  value={t.status}
                                  disabled={
                                    busy ||
                                    ["Completed", "Cancelled"].includes(
                                      t.status,
                                    ) ||
                                    ["Completed", "Cancelled"].includes(
                                      selected.project.status,
                                    )
                                  }
                                  onChange={(e) =>
                                    void run(
                                      () =>
                                        api(
                                          `/api/projects/${selected.project.id}/tasks/${t.id}/status`,
                                          token,
                                          {
                                            method: "POST",
                                            body: JSON.stringify({
                                              status: e.target.value,
                                            }),
                                          },
                                        ),
                                      en
                                        ? "Task status updated"
                                        : "Görev durumu güncellendi",
                                    )
                                  }
                                >
                                  <option value="Open">
                                    {taskStatus("Open")}
                                  </option>
                                  <option value="InProgress">
                                    {taskStatus("InProgress")}
                                  </option>
                                  <option value="Blocked">
                                    {taskStatus("Blocked")}
                                  </option>
                                  <option value="Completed">
                                    {taskStatus("Completed")}
                                  </option>
                                  <option value="Cancelled">
                                    {taskStatus("Cancelled")}
                                  </option>
                                </select>
                              ) : field.key === "actions" ? (
                                "—"
                              ) : (
                                "—"
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!selected.tasks.length && (
                        <tr>
                          <td
                            colSpan={visibleTaskFields.length}
                            className="muted"
                          >
                            {en ? "No tasks" : "Görev eklenmemiş."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </AdvancedDataGrid>
                  <ModuleRecordForm
                    title={en ? "Add task" : "Görev ekle"}
                    mode="create"
                    busy={busy}
                    saveLabel={en ? "Add task" : "Görev ekle"}
                    onSubmit={createTask}
                  >
                    <RecordFormGroup
                      title={en ? "Task identity" : "Görev Kimliği"}
                      bodyClassName="rf-identity hrp-identity-even"
                    >
                      <label>
                        {en ? "Code" : "Kod"}
                        <input
                          required
                          value={taskCode}
                          onChange={(e) => setTaskCode(e.target.value)}
                        />
                      </label>
                      <label>
                        {en ? "Name" : "Ad"}
                        <input
                          required
                          value={taskName}
                          onChange={(e) => setTaskName(e.target.value)}
                        />
                      </label>
                    </RecordFormGroup>
                    <RecordFormGroup
                      title={en ? "Plan" : "Planlama"}
                      bodyClassName="hrp-grid"
                    >
                      <label>
                        {en ? "Planned hours" : "Planlanan saat"}
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={taskHours}
                          onChange={(e) => setTaskHours(e.target.value)}
                        />
                      </label>
                      <label>
                        {en ? "Start" : "Başlangıç"}
                        <input
                          type="date"
                          value={taskStart}
                          onChange={(e) => setTaskStart(e.target.value)}
                        />
                      </label>
                      <label>
                        {en ? "End" : "Bitiş"}
                        <input
                          type="date"
                          value={taskEnd}
                          onChange={(e) => setTaskEnd(e.target.value)}
                        />
                      </label>
                    </RecordFormGroup>
                  </ModuleRecordForm>
                </section>
                <section>
                  <h3>{en ? "Resource allocations" : "Kaynak planlamaları"}</h3>
                  <div className="op-project-table">
                    {selected.allocations.map((a) => (
                      <div key={a.id}>
                        <b>{a.resourceName}</b>
                        <span>
                          {formatHours(a.plannedHours)} {hourUnit}
                          {a.plannedHourlyCost !== null
                            ? ` · ${a.plannedHourlyCost} ${a.currencyCode}/${hourUnit}`
                            : ""}
                        </span>
                      </div>
                    ))}
                    {!selected.allocations.length && (
                      <p className="muted">
                        {en ? "No allocations" : "Kaynak planlaması yok."}
                      </p>
                    )}
                  </div>
                  <ModuleRecordForm
                    title={en ? "Record allocation" : "Kaynak planla"}
                    mode="create"
                    busy={busy}
                    saveLabel={en ? "Save allocation" : "Planlamayı kaydet"}
                    onSubmit={allocate}
                  >
                    <RecordFormGroup
                      title={en ? "Resource" : "Kaynak"}
                      bodyClassName="rf-identity hrp-identity-even"
                    >
                      <label>
                        {en ? "Employee" : "Personel"}
                        <SearchableRecordPicker
                          options={employees.map((x) => ({
                            id: x.id,
                            label: `${x.personnelCode} · ${x.fullName}`,
                          }))}
                          selectedId={employee}
                          onSelect={(id) => {
                            setEmployee(id);
                            if (id) setResource("");
                          }}
                          title={en ? "Select employee" : "Personel seçin"}
                          placeholder={
                            en ? "Select employee" : "Personel seçin"
                          }
                          searchPlaceholder={
                            en
                              ? "Search by code or name"
                              : "Personel kodu veya adıyla ara"
                          }
                          emptyMessage={
                            en
                              ? "No matching employee"
                              : "Eşleşen personel bulunamadı"
                          }
                          clearable
                          clearLabel={
                            en
                              ? "External / named resource"
                              : "Harici / adı girilen kaynak"
                          }
                        />
                      </label>
                      <label>
                        {en ? "Resource name" : "Kaynak adı"}
                        <input
                          value={resource}
                          disabled={!!employee}
                          onChange={(e) => setResource(e.target.value)}
                        />
                      </label>
                      <label>
                        {en ? "Task" : "Görev"}
                        <select
                          value={task}
                          onChange={(e) => setTask(e.target.value)}
                        >
                          <option value="">
                            {en ? "Project level" : "Proje geneli"}
                          </option>
                          {selected.tasks.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.code} · {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </RecordFormGroup>
                    <RecordFormGroup
                      title={en ? "Planned effort and cost" : "Planlanan Süre ve Maliyet"}
                      bodyClassName="hrp-grid"
                    >
                      <label>
                        {en ? "Planned hours" : "Planlanan saat"}
                        <input
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={hours}
                          onChange={(e) => setHours(e.target.value)}
                        />
                      </label>
                      <label>
                        {en ? "Planned hourly cost" : "Plan saatlik maliyet"}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={hourlyCost}
                          onChange={(e) => setHourlyCost(e.target.value)}
                        />
                      </label>
                      <label>
                        {en ? "Currency" : "Para birimi"}
                        <input
                          maxLength={3}
                          value={allocationCurrency}
                          onChange={(e) =>
                            setAllocationCurrency(e.target.value.toUpperCase())
                          }
                        />
                      </label>
                    </RecordFormGroup>
                  </ModuleRecordForm>
                </section>
              </div>
              <section className="op-project-time">
                <div className="panel-heading">
                  <div>
                    <h3>
                      {en ? "Actual time" : "Gerçekleşen çalışma süreleri"}
                    </h3>
                    <p>
                      {en
                        ? `${formatHours(selected.timeEntries.reduce((sum, x) => sum + x.hours, 0))} h visible in this view`
                        : `Bu görünümde ${selected.timeEntries.reduce((sum, x) => sum + x.hours, 0)} saat`}
                    </p>
                  </div>
                </div>
                <AdvancedDataGrid hideSearch className="op-project-detail-grid">
                  <thead>
                    <ScreenViewGroupHeader
                      fields={visibleTimeFields}
                      generalLabel={en ? "Time entry" : "Süre kaydı"}
                    />
                    <tr>
                      {visibleTimeFields.map((field) => (
                        <th key={field.key}>
                          {en
                            ? ((
                                {
                                  workDate: "Work date",
                                  taskName: "Task",
                                  hours: "Actual hours",
                                  description: "Description",
                                } as Record<string, string>
                              )[field.key] ?? field.label)
                            : field.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.timeEntries.map((x) => (
                      <tr key={x.id}>
                        {visibleTimeFields.map((field) => (
                          <td key={field.key}>
                            {field.key === "workDate"
                              ? x.workDate
                              : field.key === "taskName"
                                ? x.taskId
                                  ? selected.tasks.find(
                                      (t) => t.id === x.taskId,
                                    )?.name || "—"
                                  : en
                                    ? "Project level"
                                    : "Proje geneli"
                                : field.key === "hours"
                                  ? `${formatHours(x.hours)} ${hourUnit}`
                                  : field.key === "description"
                                    ? x.description || "—"
                                    : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!selected.timeEntries.length && (
                      <tr>
                        <td
                          colSpan={Math.max(1, visibleTimeFields.length)}
                          className="muted"
                        >
                          {en
                            ? "No time entries visible"
                            : "Henüz görünür süre kaydı yok."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </AdvancedDataGrid>
                <ModuleRecordForm
                  title={en ? "Record work time" : "Çalışma süresi gir"}
                  mode="create"
                  busy={busy}
                  saveLabel={en ? "Record time" : "Süreyi kaydet"}
                  onSubmit={recordTime}
                >
                  <RecordFormGroup
                    title={en ? "Time entry" : "Süre Kaydı"}
                    bodyClassName="rf-identity hrp-identity-even"
                  >
                    <label>
                      {en ? "Task" : "Görev"}
                      <select
                        value={timeTask}
                        onChange={(e) => setTimeTask(e.target.value)}
                      >
                        <option value="">
                          {en ? "Project level" : "Proje geneli"}
                        </option>
                        {selected.tasks
                          .filter((x) => x.status !== "Cancelled")
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.code} · {x.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {en ? "Work date" : "Çalışma tarihi"}
                      <input
                        required
                        type="date"
                        max={localDateString()}
                        value={workDate}
                        onChange={(e) => setWorkDate(e.target.value)}
                      />
                    </label>
                    <label>
                      {en ? "Actual hours" : "Gerçekleşen saat"}
                      <input
                        required
                        type="number"
                        min="0.25"
                        max="24"
                        step="0.25"
                        value={actualHours}
                        onChange={(e) => setActualHours(e.target.value)}
                      />
                    </label>
                  </RecordFormGroup>
                  <RecordFormGroup title={en ? "Description" : "Açıklama"}>
                    <label>
                      {en ? "Description" : "Açıklama"}
                      <input
                        maxLength={500}
                        value={timeDescription}
                        onChange={(e) => setTimeDescription(e.target.value)}
                      />
                    </label>
                  </RecordFormGroup>
                </ModuleRecordForm>
                <p className="op-project-footnote">
                  {en
                    ? "Entries are append-only, limited to 24 hours per user per day, and do not post to payroll or accounting."
                    : "Kayıtlar değiştirilemez; kullanıcı başına günlük 24 saatle sınırlıdır ve bordro/muhasebeye aktarılmaz."}
                </p>
              </section>
              <p className="op-project-footnote">
                {en
                  ? "Operational project plans do not post to statutory accounting, payroll or actual-cost ledgers."
                  : "Operasyonel proje planları yasal muhasebeye, bordroya veya gerçekleşen maliyet defterlerine kayıt atmaz."}
              </p>
            </>
          ) : (
            <div className="op-project-empty">
              <h2>{en ? "Select a project" : "Bir proje seçin"}</h2>
              <p>
                {en
                  ? "Or create one using the form."
                  : "Detayları görmek veya görev ve kaynak planlamak için listeden proje seçin."}
              </p>
            </div>
          )}
        </section>
      </section>
      {projectFormOpen && (
        <div
          className="op-project-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProjectFormOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setProjectFormOpen(false);
          }}
        >
          <section
            className="op-project-modal"
            role="dialog"
            aria-modal="true"
            aria-label={en ? "New project" : "Yeni proje"}
          >
            <ModuleRecordForm
              title={en ? "New project" : "Yeni proje"}
              mode="create"
              busy={busy}
              saveLabel={en ? "Create project" : "Projeyi oluştur"}
              onSubmit={createProject}
              onCancel={() => setProjectFormOpen(false)}
              onSaveIntent={(stay) => {
                stayAfterCreate.current = stay;
              }}
              onReset={resetProjectForm}
              error={error}
              onDismissError={() => setError("")}
              status={
                <>
                  <span>
                    {en
                      ? "You can plan tasks and resources after saving."
                      : "Kaydettikten sonra görevleri ve kaynakları planlayabilirsiniz."}
                  </span>
                  {notice && <span className="rf-status-notice">{notice}</span>}
                </>
              }
            >
              <RecordFormGroup
                title={en ? "Project identity" : "Proje Kimliği"}
                bodyClassName="rf-identity hrp-identity-3"
              >
                <label>
                  {en ? "Code" : "Proje kodu"}
                  <input
                    required
                    maxLength={40}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <label>
                  {en ? "Name" : "Proje adı"}
                  <input
                    required
                    maxLength={160}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  {en
                    ? "Customer account ID"
                    : "Cari hesap kimliği (isteğe bağlı)"}
                  <input
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder={en ? "UUID" : "Kimlik numarası"}
                  />
                </label>
              </RecordFormGroup>
              <div className="rf-columns">
                <RecordFormGroup title={en ? "Budget" : "Bütçe"}>
                  <div className="rf-pair">
                <label>
                  {en ? "Budget" : "Operasyonel bütçe"}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </label>
                <label>
                  {en ? "Currency" : "Para birimi"}
                  <input
                    required
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </label>
                  </div>
                </RecordFormGroup>
                <RecordFormGroup title={en ? "Schedule" : "Takvim"}>
                  <div className="rf-pair">
                <label>
                  {en ? "Start" : "Başlangıç"}
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  {en ? "End" : "Bitiş"}
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                  </div>
                </RecordFormGroup>
                <div className="rf-columns-wide">
                  <RecordFormGroup title={en ? "Notes" : "Notlar"}>
              <label>
                {en ? "Notes" : "Not"}
                <textarea
                  value={notes}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
                  </RecordFormGroup>
                </div>
              </div>
            </ModuleRecordForm>
          </section>
        </div>
      )}
    </main>
  );
}
