import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type * as AppTypes from "../erp-types";
import { api } from "../erpApi";
import { promptDialog } from "../confirmDialog";
import { ListPageHeader } from "../list-page/ListPageHeader";
import { ListToolbar } from "../list-page/ListToolbar";
import { ListSummaryCards } from "../list-page/ListSummaryCards";
import { Clock3 } from "lucide-react";
import SalesDocumentGrid from "../sales/components/SalesDocumentGrid";
import { useSalesListPanel } from "../sales/useSalesListPanel";
import { SalesListPanelToggle } from "../sales/components/SalesListDetailPanel";
import { SalesListFooter } from "../sales/components/SalesListFooter";
import { RequestListPanel, SalesListPanelEmpty } from "../sales/components/SalesListPanels";
import { SALES_CODE_FIELDS, SALES_NUMBER_FIELDS, listTag } from "../sales/components/salesListCells";
import type { GridExportActions } from "../AdvancedDataGrid";
import { PageCommandsSlot, documentOpenCommands } from "../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../commands/gridCommands";
import type { MenuCommand, PageCommands } from "../commands/types";
import { SalesRequestCreateForm } from "./components/SalesRequestCreateForm";
import { SalesRequestDetailSurface } from "./components/SalesRequestDetailSurface";
import { formatRequestDate, quoteFromRequestStorageKey, type SalesRequestDetail, type SalesRequestSummary } from "./types";
import "../sales/sales-list-v2.css";

type Props = {
  token: string;
  onNavigate: (page: AppTypes.SalesPageKey) => void;
};

const pageSize = 25;
const basePath = "/api/sales/requests";

const fields: AppTypes.BuiltInScreenLayoutField[] = [
  { key: "code", label: "Talep no", width: 130 },
  { key: "requestDate", label: "Tarih", width: 100 },
  { key: "customerName", label: "Müşteri", width: 260 },
  { key: "neededByDate", label: "İhtiyaç tarihi", width: 115 },
  { key: "lineCount", label: "Satır", width: 65 },
  { key: "quoteCount", label: "Teklif", width: 65 },
  { key: "status", label: "Durum", width: 125 },
].map((field, position) => ({ ...field, visible: true, position }));

/** Satış talepleri: müşteriden gelen ürün talepleri listelenir, kaydedilir ve teklife dönüştürülür. */
export default function SalesCustomerRequestsPage({ token, onNavigate }: Props) {
  const [items, setItems] = useState<SalesRequestSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SalesRequestDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailNotice, setDetailNotice] = useState("");
  const gridExportRef = useRef<GridExportActions | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  // The row the user chose (click, ↑/↓); never an implicit first row.
  const current = items.find((item) => item.id === selectedId);
  const listActive = !creating && !detail;
  const panel = useSalesListPanel<SalesRequestDetail>({
    active: listActive,
    token,
    currentId: current?.id ?? null,
    path: (id) => `${basePath}/${id}`,
    reloadKey: current ? JSON.stringify(current) : undefined,
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: SalesRequestSummary[]; totalCount: number }>(
        `${basePath}/?page=${page}&pageSize=${pageSize}${filter ? `&q=${encodeURIComponent(filter)}` : ""}`,
        token,
      );
      setItems(result.items);
      setTotal(result.totalCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token, page, filter]);

  async function openDetail(id: string, notice = "") {
    setSelectedId(id);
    setError("");
    setDetailError("");
    setDetailNotice(notice);
    try {
      setDetail(await api<SalesRequestDetail>(`${basePath}/${id}`, token));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelRequest() {
    if (!detail) return;
    const reason = (
      await promptDialog({
        title: "Talep iptal edilsin mi?",
        message: detail.code ? `${detail.code} talebi iptal edilecek.` : undefined,
        label: "İptal gerekçesi",
        required: true,
        multiline: true,
        tone: "danger",
        confirmLabel: "İptal et",
      })
    )?.trim();
    if (!reason) return;
    setDetailBusy(true);
    setDetailError("");
    setDetailNotice("");
    try {
      setDetail(await api<SalesRequestDetail>(`${basePath}/${detail.id}/cancel`, token, { method: "POST", body: JSON.stringify({ reason }) }));
      setDetailNotice("Talep iptal edildi.");
      await load();
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailBusy(false);
    }
  }

  function createQuote(requestId: string) {
    sessionStorage.setItem(quoteFromRequestStorageKey, requestId);
    // Teklif başka sekmede kaydedilir; bu sekmeye dönüldüğünde liste yenilenir.
    refreshOnReturn.current = true;
    setDetail(null);
    onNavigate("sales-quote-create");
  }

  // Sekmeler açık tutulduğu için sayfa yeniden kurulmaz; görünür olduğunda bayrak varsa liste yenilenir.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const refreshOnReturn = useRef(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && refreshOnReturn.current) {
        refreshOnReturn.current = false;
        void load();
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [token, page, filter, creating]);

  if (creating) {
    return (
      <SalesRequestCreateForm
        token={token}
        onCancel={() => { setCreating(false); void load(); }}
        onSaved={(created, stayForNext) => {
          if (stayForNext) return;
          setCreating(false);
          setPage(1);
          void load();
          void openDetail(created.id, "Talep kaydedildi.");
        }}
      />
    );
  }

  const renderCell = (field: AppTypes.BuiltInScreenLayoutField, item: SalesRequestSummary) => {
    switch (field.key) {
      case "code":
        return (
          <button type="button" className="erp-link-button customer-code" aria-haspopup="dialog" aria-label={`${item.code} talep ayrıntılarını aç`} onClick={(event) => { event.stopPropagation(); void openDetail(item.id); }}>
            {item.code}
          </button>
        );
      case "requestDate": return formatRequestDate(item.requestDate);
      case "customerName": return item.customerName;
      case "neededByDate": return formatRequestDate(item.neededByDate);
      case "lineCount": return item.lineCount;
      case "quoteCount": return item.quoteCount;
      case "status": return listTag("request", item.status);
      default: return null;
    }
  };

  // Action bar of the request list and of an open request (requests are cancelled, not deleted).
  const selected = current ?? (ticked.length === 1 ? items.find((item) => item.id === ticked[0]) : undefined);
  const commands: PageCommands = { new: { primary: !detail, run: () => setCreating(true) } };
  const more: MenuCommand[] = [];
  if (detail) {
    Object.assign(commands, documentOpenCommands(() => openDetail(detail.id)));
    if (detail.status !== "Cancelled")
      more.push({ id: "request-quote", label: "Teklif hazırla", disabledReason: detailBusy ? "İşleniyor…" : undefined, run: () => createQuote(detail.id) });
    if (detail.status === "Open")
      more.push({ id: "request-cancel", label: "Talebi iptal et", disabledReason: detailBusy ? "İptal ediliyor…" : undefined, run: () => cancelRequest() });
  } else {
    commands.open = {
      disabledReason: selected ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? selected?.id;
        if (id) return openDetail(id);
      },
    };
    more.push(csvExportCommand(gridExportRef));
  }
  commands.more = more;
  const listPanel =
    panel.open && listActive ? (
      current ? (
        <RequestListPanel
          row={current}
          detail={panel.detail}
          error={panel.error}
          onOpen={() => void openDetail(current.id)}
          openDisabled={detailBusy}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        />
      ) : (
        <SalesListPanelEmpty kind="request" />
      )
    ) : null;

  return (
    <div className="sales-lv2-stack list-v2" ref={rootRef}>
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Satış Talepleri"
        description="Müşterilerden gelen ürün talepleri. Talepten teklif hazırlanır; satış akışının ilk adımıdır."
        count={loading && total === 0 ? null : total}
      />
      <ListSummaryCards
        cards={[
          {
            id: "open",
            label: "Teklif bekleyen",
            value: loading ? "—" : items.filter((item) => item.status === "Open").length.toLocaleString("tr-TR"),
            icon: Clock3,
            tone: "warn",
            hint: "bu sayfa",
          },
        ]}
      />
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchApply={() => { setPage(1); setFilter(search.trim()); }}
        searchLabel="Talep no veya müşteri ara"
        searchPlaceholder="Talep no veya müşteri ara"
        toolsSlotRef={setToolsSlot}
        onRefresh={() => { if (!loading) void load(); }}
      >
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={15} /></button>
        </div>
      )}
      <div ref={panel.rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list">
          <SalesDocumentGrid
            gridId="sales-customer-requests"
            hideExport
            exportActionsRef={gridExportRef}
            fields={fields}
            items={items}
            loading={loading}
            loadingMessage="Talepler yükleniyor…"
            emptyMessage="Henüz satış talebi yok. Yeni talep ile ilk kaydı oluşturun."
            search={filter}
            searchEmptyMessage="Aramanızla eşleşen talep yok."
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel="Satış talebi kayıtları"
            selection={{
              currentId: selectedId,
              onCurrentChange: setSelectedId,
              onTickedChange: setTicked,
              // Only while the list is on screen: a document or form over it must not show the floating bar.
              bulkActions: listActive
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                : undefined,
              onOpen: (id) => void openDetail(id),
            }}
            footer={
              <SalesListFooter
                ticked={ticked.length}
                shown={items.length}
                total={total}
                page={page}
                pageSize={pageSize}
                loading={loading}
                onPageChange={setPage}
              />
            }
            numberFields={SALES_NUMBER_FIELDS}
            codeFields={SALES_CODE_FIELDS}
          />
        </section>
        {listPanel}
      </div>
      {detail && (
        <SalesRequestDetailSurface
          detail={detail}
          error={detailError}
          notice={detailNotice}
          onDismissError={() => setDetailError("")}
          onDismissNotice={() => setDetailNotice("")}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
