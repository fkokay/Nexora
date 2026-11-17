import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { authenticatedFetch } from "./authApi";
import { BadgeCheck, CircleDollarSign, Clock3, Target, Trash2 } from "lucide-react";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { StatusTag } from "./list-page/StatusTag";
import { useStockDetailPanelOpen } from "./inventory/components/InventoryStockDetailPanel";
import { SalesListDetailEmpty, SalesListPanelToggle } from "./sales/components/SalesListDetailPanel";
import { SalesListFooter, pageAmountHint } from "./sales/components/SalesListFooter";
import "./sales/sales-list-v2.css";
import { CLOSED_OPPORTUNITY_REASON, stageTone } from "./crm-opportunities/stageTone";
import "./crm-opportunities.css";
import { CrmOpportunityHeader } from "./crm-opportunities/components/CrmOpportunityHeader";
import {
  CrmOpportunityFilters,
  type CrmStageCounts,
} from "./crm-opportunities/components/CrmOpportunityFilters";
import { CrmOpportunityGrid } from "./crm-opportunities/components/CrmOpportunityGrid";
import { CrmOpportunityDetail } from "./crm-opportunities/components/CrmOpportunityDetail";
import { CrmOpportunityCreateForm } from "./crm-opportunities/components/CrmOpportunityCreateForm";
import {
  defaultScreenFields,
  formatMoney,
  nextStage,
  stageLabels,
  stages,
  type Customer,
  type Opportunity,
  type Page,
  type ScreenField,
} from "./crm-opportunities/types";
import { problemDetail } from "./erpApi";

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
  // The row the user chose (click, ↑/↓); the list never picks one by itself.
  const [currentId, setCurrentId] = useState<string | null>(null),
    [ticked, setTicked] = useState<string[]>([]),
    [panelTab, setPanelTab] = useState("summary"),
    [createOpen, setCreateOpen] = useState(initialCreate);
  const exportRef = useRef<GridExportActions | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
            problemDetail(body) ||
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
      setCurrentId(updated.id);
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
      if (currentId === item.id) setCurrentId(null);
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
            <span className="crm-name" title={item.name}>
              {item.name}
            </span>
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
        return <StatusTag tone={stageTone(item.stage)}>{stageLabels[item.stage] || item.stage}</StatusTag>;
      case "estimatedValue":
        return item.estimatedValue === null
          ? "—"
          : formatMoney(item.estimatedValue, item.currencyCode, 2);
      case "probabilityPercent":
        return `%${item.probabilityPercent}`;
      case "expectedCloseDate":
        return item.expectedCloseDate ? (
          new Date(item.expectedCloseDate).toLocaleDateString("tr-TR")
        ) : (
          <span className="crm-muted">Tarih yok</span>
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

  const listActive = !createOpen;
  const panel = useStockDetailPanelOpen(listActive, rootRef);
  const current = currentId ? items.find((item) => item.id === currentId) : undefined;
  const target = current ?? (ticked.length === 1 ? items.find((item) => item.id === ticked[0]) : undefined);
  const isClosed = (item: Opportunity) => item.stage === "Won" || item.stage === "Lost";
  const busyReason = busy ? "İşlem sürüyor…" : undefined;
  const openDisabledReason = !target ? "Önce bir kayıt seçin" : isClosed(target) ? CLOSED_OPPORTUNITY_REASON : busyReason;
  const openItem = (item: Opportunity | undefined) => {
    if (item && !isClosed(item) && !busy) edit(item);
  };
  const commands: PageCommands = {
    new: { primary: true, run: () => setCreateOpen(true) },
    open: {
      disabledReason: openDisabledReason,
      run: () => {
        const id = focusedRecordId();
        openItem((id && items.find((item) => item.id === id)) || target);
      },
    },
    // Silme kalıcıdır (mevcut onay penceresi); kapanmış fırsat da silinebilir (bugünkü kural).
    // Same target as Aç: the focused row first (Ctrl+Del on a row), else the current / single ticked row.
    delete: {
      disabledReason: !target ? "Önce bir kayıt seçin" : busyReason,
      run: () => {
        const id = focusedRecordId();
        const item = (id && items.find((row) => row.id === id)) || target;
        return item ? remove(item) : undefined;
      },
    },
  };
  const more: MenuCommand[] = [];
  if (current && !isClosed(current)) {
    const next = nextStage[current.stage];
    if (next)
      more.push({
        id: "crm-advance",
        label: `Aşamayı ilerlet: ${stageLabels[next]}`,
        disabledReason: busyReason,
        run: () => move(current, next),
      });
    more.push({ id: "crm-lost", label: "Kaybedildi olarak işaretle", disabledReason: busyReason, run: () => move(current, "Lost") });
  }
  more.push(csvExportCommand(exportRef));
  commands.more = more;

  // Açık / Kazanıldı: the chips' server counts (search applied, all pages). Takibi geçmiş and açık değer: this page.
  const openStages = ["Prospecting", "Qualified", "Proposal", "Negotiation"];
  const openCount = stageCounts ? openStages.reduce((sum, stage) => sum + (stageCounts.byStage[stage] ?? 0), 0) : null;
  const openRows = items.filter((item) => !isClosed(item));
  const now = Date.now();
  const overdue = openRows.filter((item) => item.nextActivityAt && new Date(item.nextActivityAt).getTime() < now).length;
  const valued = openRows.filter((item) => item.estimatedValue !== null);
  const currencies = new Set(valued.map((item) => item.currencyCode));
  const openValue =
    currencies.size === 1
      ? formatMoney(valued.reduce((sum, item) => sum + (item.estimatedValue ?? 0), 0), valued[0].currencyCode, 2)
      : "—";
  const scope = query.trim() ? "aramayla eşleşen" : "tüm kayıtlar";
  const summary = (
    <ListSummaryCards
      cards={[
        { id: "open", label: "Açık fırsat", value: openCount === null ? "—" : openCount.toLocaleString("tr-TR"), icon: Target, hint: <span>{scope}</span> },
        {
          id: "won",
          label: "Kazanıldı",
          value: stageCounts ? (stageCounts.byStage.Won ?? 0).toLocaleString("tr-TR") : "—",
          icon: BadgeCheck,
          tone: "ok",
          hint: <span>{scope}</span>,
        },
        {
          id: "value",
          label: "Açık fırsat değeri",
          value: listLoading ? "—" : openValue,
          icon: CircleDollarSign,
          hint: pageAmountHint(valued),
        },
        {
          id: "overdue",
          label: "Takibi geçmiş",
          value: listLoading ? "—" : overdue.toLocaleString("tr-TR"),
          icon: Clock3,
          tone: "warn",
          hint: <span>bu sayfa</span>,
        },
      ]}
    />
  );
  const listPanel =
    panel.open && listActive ? (
      current ? (
        <CrmOpportunityDetail
          selected={current}
          tab={panelTab}
          onTabChange={setPanelTab}
          onOpen={() => openItem(current)}
          openDisabled={isClosed(current) || busy}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        />
      ) : (
        <SalesListDetailEmpty label="Fırsat özeti" text="Özetini görmek için listeden bir fırsat seçin." />
      )
    ) : null;

  return (
    <div className={`crm-page list-v2${createOpen ? " crm-page--form" : ""}`}>
      {/* The open form is the page (the CSS hides the rest): its own slot takes the action bar, so the list header,
          which holds the list's slot, is not mounted meanwhile. */}
      {!createOpen && <PageCommandsSlot commands={commands} />}
      {!createOpen && <CrmOpportunityHeader total={listLoading && totalCount === 0 ? null : totalCount} />}
      {!createOpen && summary}
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
          editing={editingOpportunity}
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
      >
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </CrmOpportunityFilters>
      <div ref={rootRef} className={`sales-list-body crm-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="crm-opportunity-workbench list-v2-list" aria-label="Satış hattı" aria-busy={listLoading}>
          <CrmOpportunityGrid
            items={items}
            fields={visibleFields}
            loading={listLoading}
            error={listError}
            query={query}
            filter={filter}
            toolbarContainer={gridToolsSlot}
            exportActionsRef={exportRef}
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              bulkActions: listActive
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void exportRef.current?.exportExcel() }]
                : undefined,
              onOpen: (id) => openItem(items.find((item) => item.id === id)),
            }}
            footer={
              <SalesListFooter
                ticked={ticked.length}
                shown={items.length}
                total={totalCount}
                page={page}
                pageSize={50}
                loading={listLoading}
                onPageChange={setPage}
              />
            }
            renderField={renderField}
            onRefresh={() => void refresh()}
            onCreate={() => setCreateOpen(true)}
            onClearFilters={clearFilters}
          />
        </section>
        {listPanel}
      </div>
    </div>
  );
}
