import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type * as AppTypes from "../erp-types";
import { api } from "../erpApi";
import { confirmDialog } from "../confirmDialog";
import { ListPageHeader } from "../list-page/ListPageHeader";
import { ListPagination } from "../list-page/ListPagination";
import { ListToolbar } from "../list-page/ListToolbar";
import { DocumentStatusBadge } from "../document-page/DocumentStatusBadge";
import { returnStatus } from "../document-page/documentStatus";
import SalesDocumentGrid from "../sales/components/SalesDocumentGrid";
import type { GridExportActions } from "../AdvancedDataGrid";
import { PageCommandsSlot } from "../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../commands/gridCommands";
import type { MenuCommand, PageCommands } from "../commands/types";
import { SalesInvoiceModal } from "../SalesInvoiceModal";
import { PurchaseInvoiceModal } from "../PurchaseInvoiceModal";
import { ReturnDetailSurface } from "./components/ReturnDetailSurface";
import {
  formatReturnAmount, formatReturnDate, returnSides, toReturnDetail, toReturnListItem,
  type ReturnDetail, type ReturnListItem, type ReturnSide,
} from "./types";
import "../sales/sales-list-v2.css";

type Props = {
  token: string;
  role: string;
  side: ReturnSide;
  onNavigate: (page: AppTypes.SalesPageKey) => void;
};

const pageSize = 25;

/** Satış ve alış iadelerinin liste sayfası. İade faturadan oluşturulur; burada listelenir, incelenir ve iptal edilir. */
export function DocumentReturnsPage({ token, role, side, onNavigate }: Props) {
  const config = returnSides[side];
  const [items, setItems] = useState<ReturnListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailNotice, setDetailNotice] = useState("");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<AppTypes.Warehouse[]>([]);
  const gridExportRef = useRef<GridExportActions | null>(null);

  const fields: AppTypes.BuiltInScreenLayoutField[] = [
    { key: "code", label: "İade no", width: 130 },
    { key: "returnDate", label: "Tarih", width: 105 },
    { key: "partyName", label: config.partyLabel, width: 220 },
    { key: "invoiceCode", label: "Fatura", width: 130 },
    { key: "warehouseName", label: "Depo", width: 120 },
    { key: "lineCount", label: "Satır", width: 65 },
    { key: "grandTotal", label: "Tutar", width: 140 },
    { key: "status", label: "Durum", width: 110 },
  ].map((field, position) => ({ ...field, visible: true, position }));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: Parameters<typeof toReturnListItem>[0][]; totalCount: number }>(
        `${config.basePath}/?page=${page}&pageSize=${pageSize}${filter ? `&q=${encodeURIComponent(filter)}` : ""}`,
        token,
      );
      setItems(result.items.map(toReturnListItem));
      setTotal(result.totalCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token, page, filter, config.basePath]);
  useEffect(() => {
    let active = true;
    api<AppTypes.Warehouse[]>("/api/warehouses/", token)
      .then((result) => { if (active) setWarehouses(result); })
      .catch(() => {});
    return () => { active = false; };
  }, [token]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setError("");
    setDetailError("");
    setDetailNotice("");
    try {
      setDetail(toReturnDetail(await api(`${config.basePath}/${id}`, token)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function voidReturn() {
    if (
      !detail ||
      !(await confirmDialog({
        title: "İade iptal edilsin mi?",
        message: config.voidConfirm(detail.code),
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setDetailBusy(true);
    setDetailError("");
    setDetailNotice("");
    try {
      await api(`${config.basePath}/${detail.id}/void`, token, { method: "POST" });
      setDetail(toReturnDetail(await api(`${config.basePath}/${detail.id}`, token)));
      setDetailNotice(config.voidedNotice);
      await load();
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailBusy(false);
    }
  }
  async function refreshAfterInvoiceChange() {
    await load();
    if (detail) {
      try { setDetail(toReturnDetail(await api(`${config.basePath}/${detail.id}`, token))); } catch { /* fatura ekranı kendi hatasını gösterir */ }
    }
  }

  const renderCell = (field: AppTypes.BuiltInScreenLayoutField, item: ReturnListItem) => {
    switch (field.key) {
      case "code":
        return (
          <button type="button" className="erp-link-button customer-code" aria-haspopup="dialog" aria-label={`${item.code} iade ayrıntılarını aç`} onClick={(event) => { event.stopPropagation(); void openDetail(item.id); }}>
            {item.code}
          </button>
        );
      case "returnDate": return formatReturnDate(item.returnDate);
      case "partyName": return item.partyName || "—";
      case "invoiceCode": return item.invoiceCode;
      case "warehouseName": return item.warehouseName;
      case "lineCount": return item.lineCount;
      case "grandTotal": return <b><span>{formatReturnAmount(item.grandTotal)}</span> <span>{item.currencyCode}</span></b>;
      case "status": return <DocumentStatusBadge status={returnStatus(item.status)} />;
      default: return null;
    }
  };

  // Action bar of the return list and of an open return. A return is created from its invoice (Yeni opens the
  // invoice list) and a posted return is cancelled, never deleted. An open invoice holds the bar itself.
  const selected = items.find((item) => item.id === selectedId);
  const commands: PageCommands = { new: { primary: !detail, run: () => onNavigate(config.invoicePage) } };
  const more: MenuCommand[] = [];
  if (detail) {
    if (detail.status === "Posted") commands.delete = { disabledReason: "Kesilmiş belge silinemez — İşlemler › İadeyi iptal et" };
    more.push({ id: "return-open-invoice", label: "Faturayı aç", run: () => setInvoiceId(detail.invoiceId) });
    if (detail.status === "Posted")
      more.push({ id: "return-void", label: "İadeyi iptal et", disabledReason: detailBusy ? "İptal ediliyor…" : undefined, run: () => voidReturn() });
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

  return (
    <div className="sales-lv2-stack list-v2">
      {!invoiceId && <PageCommandsSlot commands={commands} />}
      <ListPageHeader title={config.title} description={config.description} count={loading && total === 0 ? null : total} />
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchApply={() => { setPage(1); setFilter(search.trim()); }}
        searchLabel={config.searchPlaceholder}
        searchPlaceholder={config.searchPlaceholder}
        toolsSlotRef={setToolsSlot}
        onRefresh={() => { if (!loading) void load(); }}
      />
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={15} /></button>
        </div>
      )}
      <section className="list-v2-list">
        <SalesDocumentGrid
          gridId={config.gridId}
          hideExport
          exportActionsRef={gridExportRef}
          fields={fields}
          items={items}
          selectedId={selectedId}
          loading={loading}
          loadingMessage="İadeler yükleniyor…"
          emptyMessage={config.emptyMessage}
          search={filter}
          searchEmptyMessage="Aramanızla eşleşen iade yok."
          toolbarContainer={toolsSlot}
          onSelect={(id) => void openDetail(id)}
          renderCell={renderCell}
          ariaLabel="İade kayıtları"
        />
      </section>
      <ListPagination page={page} total={total} pageSize={pageSize} loading={loading} onPageChange={setPage} />
      {detail && (
        <ReturnDetailSurface
          detail={detail}
          config={config}
          busy={detailBusy}
          error={detailError}
          notice={detailNotice}
          onDismissError={() => setDetailError("")}
          onDismissNotice={() => setDetailNotice("")}
          onClose={() => setDetail(null)}
          onOpenInvoice={() => setInvoiceId(detail.invoiceId)}
          onVoid={() => void voidReturn()}
        />
      )}
      {invoiceId && side === "sales" && (
        <SalesInvoiceModal invoiceId={invoiceId} token={token} role={role} warehouses={warehouses} onClose={() => setInvoiceId(null)} onSaved={refreshAfterInvoiceChange} />
      )}
      {invoiceId && side === "purchase" && (
        <PurchaseInvoiceModal invoiceId={invoiceId} token={token} warehouses={warehouses} onClose={() => setInvoiceId(null)} onChanged={refreshAfterInvoiceChange} />
      )}
    </div>
  );
}
