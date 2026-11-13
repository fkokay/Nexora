import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { authenticatedFetch } from "./authApi";
import { CalendarClock, Trash2 } from "lucide-react";
import "./crm-opportunities.css";
import { CrmOpportunityHeader } from "./crm-opportunities/components/CrmOpportunityHeader";
import {
  CrmOpportunityFilters,
  type CrmStageCounts,
} from "./crm-opportunities/components/CrmOpportunityFilters";
import {
  CrmOpportunityGrid,
  CrmOpportunityPagination,
} from "./crm-opportunities/components/CrmOpportunityGrid";
import { CrmOpportunityDetail } from "./crm-opportunities/components/CrmOpportunityDetail";
import { CrmOpportunityCreateForm } from "./crm-opportunities/components/CrmOpportunityCreateForm";
import {
  defaultScreenFields,
  formatMoney,
  stageLabels,
  stages,
  type Customer,
  type Opportunity,
  type Page,
  type ScreenField,
} from "./crm-opportunities/types";

export default function CrmOpportunitiesPage({
  token,
  initialCreate = false,
  onNavigate,
}: {
  token: string;
  initialCreate?: boolean;
  onNavigate: (page: string) => void;
}) {
  const [items, setItems] = useState<Opportunity[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [totalCount, setTotalCount] = useState(0),
    [page, setPage] = useState(1),
    [customerQuery, setCustomerQuery] = useState(""),
    [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null),
    [customerLoading, setCustomerLoading] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] =
      useState<Opportunity | null>(null),
    [createOpen, setCreateOpen] = useState(initialCreate);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Opportunity | null>(null);
  const [screenFields, setScreenFields] =
    useState<ScreenField[]>(defaultScreenFields);
  // `search` is the text in the search box; `query` is the applied search.
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [stageCounts, setStageCounts] = useState<CrmStageCounts | null>(null),
    [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(null),
    [busy, setBusy] = useState(false),
    [listLoading, setListLoading] = useState(true),
    [listError, setListError] = useState(""),
    [customerError, setCustomerError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [customerId, setCustomerId] = useState(""),
    [value, setValue] = useState(""),
    [currency, setCurrency] = useState("TRY"),
    [probability, setProbability] = useState("10"),
    [closeDate, setCloseDate] = useState(""),
    [activity, setActivity] = useState(""),
    [notes, setNotes] = useState("");
  const listRequestId = useRef(0),
    countsRequestId = useRef(0);
  const queryRef = useRef(query),
    filterRef = useRef(filter),
    pageRef = useRef(page);
  queryRef.current = query;
  filterRef.current = filter;
  pageRef.current = page;
  const request = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const response = await authenticatedFetch(url, token, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          title?: string;
          errors?: Record<string, string[]>;
        } | null;
        throw new Error(
          body?.error ||
            Object.values(body?.errors ?? {})
              .flat()
              .join(" ") ||
            body?.title ||
            `İstek başarısız (${response.status})`,
        );
      }
      return response.status === 204
        ? (undefined as T)
        : (response.json() as Promise<T>);
    },
    [token],
  );
  const refresh = useCallback(async () => {
    const requestId = ++listRequestId.current;
    const currentQuery = queryRef.current,
      currentFilter = filterRef.current;
    const q = new URLSearchParams({
      page: String(pageRef.current),
      pageSize: "50",
    });
    if (currentQuery.trim()) q.set("q", currentQuery.trim());
    if (currentFilter) q.set("stage", currentFilter);
    setListLoading(true);
    setListError("");
    try {
      const result = await request<Page<Opportunity>>(
        `/api/crm/opportunities/?${q}`,
      );
      if (requestId === listRequestId.current) {
        setItems(result.items);
        setTotalCount(result.total);
      }
    } catch (e) {
      if (requestId === listRequestId.current)
        setListError((e as Error).message);
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  }, [request]);
  // Chip counts: how many opportunities match the current search, in total and per stage.
  const loadStageCounts = useCallback(async () => {
    const requestId = ++countsRequestId.current;
    const text = queryRef.current.trim();
    const count = async (stage?: string) => {
      const q = new URLSearchParams({ page: "1", pageSize: "1" });
      if (text) q.set("q", text);
      if (stage) q.set("stage", stage);
      return (await request<Page<Opportunity>>(`/api/crm/opportunities/?${q}`))
        .total;
    };
    try {
      const [total, ...perStage] = await Promise.all([
        count(),
        ...stages.map((stage) => count(stage)),
      ]);
      if (requestId === countsRequestId.current)
        setStageCounts({
          total,
          byStage: Object.fromEntries(
            stages.map((stage, index) => [stage, perStage[index]]),
          ),
        });
    } catch {
      if (requestId === countsRequestId.current) setStageCounts(null);
    }
  }, [request]);
  useEffect(() => {
    void loadStageCounts();
  }, [query, loadStageCounts]);
  function clearFilters() {
    setSearch("");
    setQuery("");
    setFilter("");
    setPage(1);
  }
  useEffect(() => {
    let active = true;
    void request<{ fields: ScreenField[] }>(
      "/api/screen-views/crm-opportunities/active",
    )
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 200);
    return () => window.clearTimeout(timer);
  }, [filter, query, page, refresh]);
  useEffect(() => {
    if (!createOpen) return;
    let active = true;
    setCustomerLoading(true);
    setCustomerError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (customerQuery.trim()) params.set("q", customerQuery.trim());
      void request<Page<Customer>>(`/api/customers/?${params}`)
        .then((result) => {
          if (active)
            setCustomers(
              result.items.filter(
                (x) =>
                  x.isActive && (x.type === "Customer" || x.type === "Both"),
              ),
            );
        })
        .catch((e) => {
          if (active) {
            setCustomers([]);
            setCustomerError((e as Error).message);
          }
        })
        .finally(() => {
          if (active) setCustomerLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [createOpen, customerQuery, request]);
  async function create(e: FormEvent): Promise<boolean> {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/api/crm/opportunities/", {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          customerId: customerId || null,
          estimatedValue: value ? Number(value) : null,
          currencyCode: currency,
          probabilityPercent: Number(probability),
          expectedCloseDate: closeDate || null,
          nextActivityAt: activity ? new Date(activity).toISOString() : null,
          notes: notes || null,
        }),
      });
      setCode("");
      setName("");
      setCustomerId("");
      setSelectedCustomer(null);
      setValue("");
      setCloseDate("");
      setActivity("");
      setNotes("");
      setNotice("Fırsat kaydedildi.");
      await refresh();
      void loadStageCounts();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function edit(item: Opportunity) {
    setEditingOpportunity(item);
    setCode(item.code);
    setName(item.name);
    setCustomerId(item.customerId || "");
    setSelectedCustomer(null);
    setValue(item.estimatedValue === null ? "" : String(item.estimatedValue));
    setCurrency(item.currencyCode);
    setProbability(String(item.probabilityPercent));
    setCloseDate(item.expectedCloseDate || "");
    setActivity(item.nextActivityAt ? new Date(item.nextActivityAt).toISOString().slice(0, 16) : "");
    setNotes(item.notes || "");
    setError("");
    setNotice("");
    setCreateOpen(true);
  }
  async function update(e: FormEvent): Promise<boolean> {
    e.preventDefault();
    if (!editingOpportunity) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await request<Opportunity>(`/api/crm/opportunities/${editingOpportunity.id}`, {
        method: "PUT",
        body: JSON.stringify({
          code, name, customerId: customerId || null,
          estimatedValue: value ? Number(value) : null,
          currencyCode: currency, probabilityPercent: Number(probability),
          expectedCloseDate: closeDate || null,
          nextActivityAt: activity ? new Date(activity).toISOString() : null,
          notes: notes || null,
        }),
      });
      setSelectedOpportunity(updated);
      setEditingOpportunity(null);
      setCreateOpen(false);
      setNotice("Fırsat güncellendi.");
      await refresh();
      void loadStageCounts();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function closeCreate() {
    setEditingOpportunity(null);
    if (initialCreate && !editingOpportunity) onNavigate("crm-opportunities");
    else setCreateOpen(false);
  }
  async function move(item: Opportunity, stage: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/crm/opportunities/${item.id}/stage`, {
        method: "POST",
        body: JSON.stringify({ stage }),
      });
      setSelectedOpportunity({ ...item, stage });
      setNotice(
        `${item.name}: ${stageLabels[stage] || stage} aşamasına taşındı.`,
      );
      await refresh();
      void loadStageCounts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Opportunity) {
    setDeleteTarget(item);
  }
  async function confirmRemove() {
    const item = deleteTarget;
    if (!item) return;
    setDeleteTarget(null);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/crm/opportunities/${item.id}`, { method: "DELETE" });
      if (selectedOpportunity?.id === item.id) setSelectedOpportunity(null);
      setNotice("Fırsat silindi.");
      await refresh();
      void loadStageCounts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // The code is shown under the name and row actions live in the detail panel, so
  // neither gets a column of its own. The code column stays if the name is hidden.
  const shownFields = screenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const hasNameColumn = shownFields.some((field) => field.key === "name");
  const visibleFields = shownFields.filter(
    (field) =>
      field.key !== "actions" && !(hasNameColumn && field.key === "code"),
  );
  const renderField = (item: Opportunity, field: ScreenField) => {
    switch (field.key) {
      case "code":
        return (
          <span className="crm-code crm-truncate" title={item.code}>
            {item.code}
          </span>
        );
      case "name":
        return (
          <>
            <b className="crm-truncate" title={item.name}>
              {item.name}
            </b>
            <small className="cell-subtitle list-v2-name-code">{item.code}</small>
          </>
        );
      case "customerName":
        return item.customerName ? (
          <span className="crm-truncate" title={item.customerName}>
            {item.customerName}
          </span>
        ) : (
          <span className="crm-muted">Bağlanmadı</span>
        );
      case "stage":
        return (
          <span className={`crm-stage crm-stage-${item.stage.toLowerCase()}`}>
            {stageLabels[item.stage] || item.stage}
          </span>
        );
      case "estimatedValue":
        return item.estimatedValue === null
          ? "—"
          : formatMoney(item.estimatedValue, item.currencyCode, 2);
      case "probabilityPercent":
        return (
          <div
            className="crm-probability"
            aria-label={`Kazanma olasılığı yüzde ${item.probabilityPercent}`}
          >
            <i aria-hidden="true">
              <span
                style={{
                  width: `${Math.min(100, Math.max(0, item.probabilityPercent))}%`,
                }}
              />
            </i>
            <b>%{item.probabilityPercent}</b>
          </div>
        );
      case "expectedCloseDate":
        return (
          <span className="crm-date">
            {item.expectedCloseDate && (
              <CalendarClock size={14} aria-hidden="true" />
            )}
            {item.expectedCloseDate
              ? new Date(item.expectedCloseDate).toLocaleDateString("tr-TR")
              : "Tarih yok"}
          </span>
        );
      case "nextActivityAt":
        return item.nextActivityAt
          ? new Date(item.nextActivityAt).toLocaleString("tr-TR", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "Takip planlanmadı";
      default:
        return "—";
    }
  };

  return (
    <div className={`crm-page list-v2${createOpen ? " crm-page--form" : ""}`}>
      <CrmOpportunityHeader
        onCreate={() => setCreateOpen(true)}
        total={listLoading && totalCount === 0 ? null : totalCount}
      />
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button
            type="button"
            aria-label="Hata mesajını kapat"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      {createOpen && (
        <CrmOpportunityCreateForm
          mode={editingOpportunity ? "edit" : "create"}
          customerError={customerError}
          customers={customers}
          customerId={customerId}
          selectedCustomer={selectedCustomer}
          selectedCustomerName={editingOpportunity?.customerName}
          customerLoading={customerLoading}
          code={code}
          name={name}
          value={value}
          currency={currency}
          probability={probability}
          closeDate={closeDate}
          activity={activity}
          notes={notes}
          busy={busy}
          onClose={closeCreate}
          onSubmit={(event) => {
            void (editingOpportunity ? update(event) : create(event)).then((saved) => {
              if (saved) {
                if (initialCreate && !editingOpportunity) onNavigate("crm-opportunities");
                else setCreateOpen(false);
              }
            });
          }}
          onCodeChange={setCode}
          onNameChange={setName}
          onCustomerSelect={(id) => {
            setCustomerId(id);
            setSelectedCustomer(customers.find((x) => x.id === id) || null);
          }}
          onCustomerSearchChange={setCustomerQuery}
          onValueChange={setValue}
          onCurrencyChange={setCurrency}
          onProbabilityChange={setProbability}
          onCloseDateChange={setCloseDate}
          onActivityChange={setActivity}
          onNotesChange={setNotes}
        />
      )}
      {deleteTarget && (
        <div
          className="crm-modal-backdrop crm-delete-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setDeleteTarget(null);
          }}
        >
          <section
            className="crm-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="crm-delete-title"
            aria-describedby="crm-delete-description"
            aria-busy={busy}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) setDeleteTarget(null);
            }}
          >
            <div className="crm-delete-heading">
              <span className="crm-delete-icon" aria-hidden="true"><Trash2 size={20} /></span>
              <div>
                <p className="eyebrow">KALICI SİLME</p>
                <h2 id="crm-delete-title">Fırsat silinsin mi?</h2>
              </div>
            </div>
            <p id="crm-delete-description" className="crm-delete-copy">
              Bu fırsat satış hattından kaldırılacak. Silme işlemi geri alınamaz.
            </p>
            <div className="crm-delete-record">
              <strong>{deleteTarget.name}</strong>
              <span>{deleteTarget.code}</span>
            </div>
            <div className="crm-delete-actions">
              <button type="button" className="secondary" autoFocus disabled={busy} onClick={() => setDeleteTarget(null)}>
                Vazgeç
              </button>
              <button type="button" className="crm-delete-confirm" disabled={busy} onClick={() => void confirmRemove()}>
                <Trash2 size={15} aria-hidden="true" />
                {busy ? "Siliniyor…" : "Fırsatı sil"}
              </button>
            </div>
          </section>
        </div>
      )}
      <CrmOpportunityFilters
        search={search}
        filter={filter}
        counts={stageCounts}
        toolsSlotRef={setGridToolsSlot}
        onSearchChange={setSearch}
        onSearchApply={() => {
          setQuery(search.trim());
          setPage(1);
        }}
        onFilterChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
        onRefresh={() => {
          void refresh();
          void loadStageCounts();
        }}
      />
      <section
        className="crm-panel crm-opportunity-workbench list-v2-list"
        aria-label="Satış hattı"
        aria-busy={listLoading}
      >
        <div
          className={`crm-record-workspace${selectedOpportunity ? " is-inspecting" : ""}${items.length === 0 && !listLoading ? " is-empty" : ""}`}
        >
          <CrmOpportunityGrid
            items={items}
            fields={visibleFields}
            loading={listLoading}
            error={listError}
            query={query}
            filter={filter}
            selectedId={selectedOpportunity?.id ?? null}
            toolbarContainer={gridToolsSlot}
            renderField={renderField}
            onSelect={setSelectedOpportunity}
            onRefresh={() => void refresh()}
            onCreate={() => setCreateOpen(true)}
            onClearFilters={clearFilters}
          />
          <CrmOpportunityDetail
            selected={selectedOpportunity}
            itemsCount={items.length}
            loading={listLoading}
            listError={listError}
            query={query}
            filter={filter}
            busy={busy}
            formatMoney={formatMoney}
            onClear={clearFilters}
            onCreate={() => setCreateOpen(true)}
            onClose={() => setSelectedOpportunity(null)}
            onEdit={edit}
            onMove={(stage) => {
              if (selectedOpportunity) void move(selectedOpportunity, stage);
            }}
            onDelete={(item) => void remove(item)}
          />
        </div>
        <CrmOpportunityPagination
          loading={listLoading}
          page={page}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}
