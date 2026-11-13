import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type * as AppTypes from "../erp-types";
import { api } from "../erpApi";
import { promptLocalized } from "../locale";
import { ListPageHeader } from "../list-page/ListPageHeader";
import { ListPagination } from "../list-page/ListPagination";
import { ListToolbar } from "../list-page/ListToolbar";
import { DocumentStatusBadge } from "../document-page/DocumentStatusBadge";
import { salesRequestStatus } from "../document-page/documentStatus";
import SalesDocumentGrid from "../sales/components/SalesDocumentGrid";
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
  { key: "code", label: "Talep no", width: 150 },
  { key: "requestDate", label: "Tarih", width: 110 },
  { key: "customerName", label: "Müşteri", width: 280 },
  { key: "neededByDate", label: "İhtiyaç tarihi", width: 120 },
  { key: "lineCount", label: "Satır", width: 80 },
  { key: "quoteCount", label: "Teklif", width: 80 },
  { key: "status", label: "Durum", width: 140 },
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
    const reason = promptLocalized("İptal gerekçesi:")?.trim();
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
      case "status": return <DocumentStatusBadge status={salesRequestStatus(item.status)} />;
      default: return null;
    }
  };

  return (
    <div className="sales-lv2-stack list-v2" ref={rootRef}>
      <ListPageHeader
        title="Satış Talepleri"
        description="Müşterilerden gelen ürün talepleri. Talepten teklif hazırlanır; satış akışının ilk adımıdır."
        count={loading && total === 0 ? null : total}
      >
        <button type="button" className="primary" onClick={() => setCreating(true)}>Yeni talep</button>
      </ListPageHeader>
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchApply={() => { setPage(1); setFilter(search.trim()); }}
        searchLabel="Talep no veya müşteri ara"
        searchPlaceholder="Talep no veya müşteri ara"
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
          gridId="sales-customer-requests"
          fields={fields}
          items={items}
          selectedId={selectedId}
          loading={loading}
          loadingMessage="Talepler yükleniyor…"
          emptyMessage="Henüz satış talebi yok. Yeni talep ile ilk kaydı oluşturun."
          search={filter}
          searchEmptyMessage="Aramanızla eşleşen talep yok."
          toolbarContainer={toolsSlot}
          onSelect={(id) => void openDetail(id)}
          renderCell={renderCell}
          ariaLabel="Satış talebi kayıtları"
        />
      </section>
      <ListPagination page={page} total={total} pageSize={pageSize} loading={loading} onPageChange={setPage} />
      {detail && (
        <SalesRequestDetailSurface
          detail={detail}
          busy={detailBusy}
          error={detailError}
          notice={detailNotice}
          onDismissError={() => setDetailError("")}
          onDismissNotice={() => setDetailNotice("")}
          onClose={() => setDetail(null)}
          onCreateQuote={() => createQuote(detail.id)}
          onCancelRequest={() => void cancelRequest()}
        />
      )}
    </div>
  );
}
