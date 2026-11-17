import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import SupplierQuotesFilters from "./purchase-supplier-quotes/components/SupplierQuotesFilters";
import SupplierQuotesHeader from "./purchase-supplier-quotes/components/SupplierQuotesHeader";
import SupplierQuotesTable, {
  defaultSupplierQuoteFields,
} from "./purchase-supplier-quotes/components/SupplierQuotesTable";
import type {
  Quote,
  QuoteDetail,
  QuotePage,
  ScreenField,
} from "./purchase-supplier-quotes/types";
import { problemDetail } from "./erpApi";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { PageCommands } from "./commands/types";
import { SalesListFooter } from "./sales/components/SalesListFooter";
import { SalesListPanelToggle } from "./sales/components/SalesListDetailPanel";
import { PurchaseQuoteListEmpty, PurchaseQuoteListPanel } from "./purchasing/purchaseQuoteList";
import { requestPurchaseRequestOpen, usePurchaseListPanel } from "./purchasing/purchaseRequestList";
import "./sales/sales-list-v2.css";

type Props = { token: string; onOpenRequests: () => void };

const pageSize = 50;

async function request<T>(url: string, token: string): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || problemDetail(body) || message;
    } catch {
      // Response may be empty.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

/**
 * Satınalma Teklifleri (taslak 07): taleplere bağlı tedarikçi tekliflerinin salt okunur listesi. Liste tipi Satış
 * listeleriyle aynıdır: tek tık satırı seçer (sağ panel), çift tık / Enter / Aç teklifin talebini açar.
 */
export default function PurchaseSupplierQuotesPage({
  token,
  onOpenRequests,
}: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // Search text that is applied to the query (set shortly after typing stops).
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<QuotePage | null>(null);
  // The row the user chose (click, ↑/↓); never an implicit first row.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ id: string; quote: QuoteDetail | null; error: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [screenFields, setScreenFields] = useState<ScreenField[]>(
    defaultSupplierQuoteFields,
  );
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const panel = usePurchaseListPanel(true);
  const items = data?.items ?? [];
  const current = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    request<{ fields: ScreenField[] }>(
      "/api/screen-views/purchase-supplier-quotes/active",
      token,
    )
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filter) params.set("search", filter);
    if (status) params.set("status", status);
    request<QuotePage>(`/api/purchasing/supplier-quotes/?${params}`, token)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setSelectedId((id) => (id && result.items.some((item) => item.id === id) ? id : null));
      })
      .catch((error) => {
        if (!cancelled) setError((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, page, filter, status, reload]);

  // The panel's lines come from the request's supplier quotes (the endpoint this screen used before), only while the
  // panel shows the row.
  const panelVisible = panel.open && !!current;
  useEffect(() => {
    if (!panelVisible || !current) return;
    if (detail?.id === current.id) return;
    let cancelled = false;
    request<QuoteDetail[]>(
      `/api/purchasing/requests/${current.purchaseRequestId}/supplier-quotes`,
      token,
    )
      .then((quotes) => {
        if (!cancelled) setDetail({ id: current.id, quote: quotes.find((item) => item.id === current.id) ?? null, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setDetail({ id: current.id, quote: null, error: (error as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [token, panelVisible, current?.id]);

  /** Aç: the quote is read-only here; its request opens in Satınalma talepleri. */
  function openRequest(quote: Quote) {
    requestPurchaseRequestOpen(quote.purchaseRequestId);
    onOpenRequests();
  }

  const target = current ?? (ticked.length === 1 ? items.find((item) => item.id === ticked[0]) : undefined);
  const commands: PageCommands = {
    open: {
      disabledReason: target ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? target?.id;
        const quote = items.find((item) => item.id === id);
        if (quote) openRequest(quote);
      },
    },
    more: [
      { id: "quote-request-entry", label: "Talep üzerinden teklif gir", run: onOpenRequests },
      csvExportCommand(gridExportRef),
    ],
  };
  const shownDetail = current && detail?.id === current.id ? detail : null;
  const listPanel = panel.open ? (
    current ? (
      <PurchaseQuoteListPanel
        row={current}
        detail={shownDetail?.quote ?? null}
        error={shownDetail ? shownDetail.error || (shownDetail.quote ? "" : "Teklif bulunamadı.") : ""}
        onOpen={() => openRequest(current)}
        onClose={panel.close}
        takeFocus={panel.takeFocus}
      />
    ) : (
      <PurchaseQuoteListEmpty />
    )
  ) : null;

  return (
    <div className="pq-lv2 sales-lv2-stack list-v2">
      <PageCommandsSlot commands={commands} />
      <SupplierQuotesHeader total={data?.totalCount ?? null} />
      {error && (
        <div role="alert" className="alert inline-alert">
          {error}
        </div>
      )}
      <SupplierQuotesFilters
        search={search}
        status={status}
        onSearchChange={setSearch}
        onSearchApply={() => {
          setPage(1);
          setFilter(search.trim());
        }}
        onStatusChange={(value) => {
          setPage(1);
          setStatus(value);
        }}
        toolsSlotRef={setToolsSlot}
        onRefresh={() => {
          if (!loading) setReload((value) => value + 1);
        }}
      >
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </SupplierQuotesFilters>
      <div ref={panel.rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list" aria-label="Tedarikçi teklif listesi">
          <SupplierQuotesTable
            items={items}
            fields={screenFields}
            loading={loading}
            toolbarContainer={toolsSlot}
            exportActionsRef={gridExportRef}
            selection={{
              currentId: selectedId,
              onCurrentChange: setSelectedId,
              onTickedChange: setTicked,
              bulkActions: [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }],
              onOpen: (id) => {
                const quote = items.find((item) => item.id === id);
                if (quote) openRequest(quote);
              },
            }}
            footer={
              <SalesListFooter
                ticked={ticked.length}
                shown={items.length}
                total={data?.totalCount ?? 0}
                page={page}
                pageSize={pageSize}
                loading={loading}
                onPageChange={setPage}
              />
            }
          />
        </section>
        {listPanel}
      </div>
    </div>
  );
}
