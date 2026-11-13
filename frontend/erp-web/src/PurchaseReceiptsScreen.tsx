import { useEffect, useMemo, useState } from "react";
import type * as AppTypes from "./erp-types";
import { api } from "./erpApi";
import { X } from "lucide-react";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import "./purchase-list-v2/purchase-list-v2.css";
import { StandaloneFulfillmentPanel } from "./StandaloneFulfillmentPanel";
import { PurchaseInvoiceModal } from "./PurchaseInvoiceModal";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import { ListPagination } from "./list-page/ListPagination";
import { DocumentSurface } from "./document-page/DocumentSurface";
import { DocumentStatusBadge } from "./document-page/DocumentStatusBadge";
import { purchaseOrderStatus, purchaseReceiptStatus } from "./document-page/documentStatus";
type BuiltInScreenLayoutField = AppTypes.BuiltInScreenLayoutField;
type PurchaseOrderDetail = AppTypes.PurchaseOrderDetail;
type SalesCustomer = AppTypes.SalesCustomer;
type StockItem = AppTypes.StockItem;
type Warehouse = AppTypes.Warehouse;

export function PurchaseReceiptsScreen({
  token,
  warehouses: warehouseOptions,
  customers,
  stockItems,
}: {
  token: string;
  role: string;
  warehouses: Warehouse[];
  customers: SalesCustomer[];
  stockItems: StockItem[];
}) {
  type ReceiptSummary = {
    id: string;
    code: string;
    purchaseOrderId: string;
    purchaseOrderCode: string;
    warehouseId: string;
    warehouseName: string;
    receiptDate: string;
    status: "Posted" | "Voided";
    lineCount: number;
    createdAt: string;
  };
  const defaultScreenFields: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Mal kabul no", visible: true, position: 0 },
    {
      key: "purchaseOrderCode",
      label: "Tedarikçi siparişi",
      visible: true,
      position: 1,
    },
    { key: "receiptDate", label: "Kabul tarihi", visible: true, position: 2 },
    { key: "warehouseName", label: "Depo", visible: true, position: 3 },
    { key: "lineCount", label: "Satır", visible: true, position: 4 },
    { key: "status", label: "Durum", visible: true, position: 5 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 6,
      fixed: true,
    },
  ];
  const [screenFields, setScreenFields] =
    useState<BuiltInScreenLayoutField[]>(defaultScreenFields);
  const [items, setItems] = useState<ReceiptSummary[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null),
    [invoiceId, setInvoiceId] = useState<string | null>(null),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const pageSize = 25;
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: ReceiptSummary[]; totalCount: number }>(
        `/api/purchasing/receipts/?page=${page}&pageSize=${pageSize}`,
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
  }, [token, page]);
  useEffect(() => {
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-receipts/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setScreenFields(
            view.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  const visibleFields = useMemo(
    () =>
      screenFields
        // Row actions live in the detail panel below the list.
        .filter((field) => field.visible && field.key !== "actions")
        .sort((a, b) => a.position - b.position),
    [screenFields],
  );
  const filtered = items.filter(
    (x) =>
      !search ||
      `${x.code} ${x.purchaseOrderCode} ${x.warehouseName}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const selected =
    filtered.find((x) => x.id === selectedId) ?? filtered[0] ?? null;
  async function open(item: ReceiptSummary) {
    setError("");
    try {
      setOrder(
        await api<PurchaseOrderDetail>(
          `/api/purchasing/orders/${item.purchaseOrderId}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function openInvoice(id: string) {
    setError("");
    try {
      if (warehouses.length === 0)
        setWarehouses(
          (await api<Warehouse[]>("/api/warehouses/", token)).filter(
            (x) => x.isActive,
          ),
        );
      setInvoiceId(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function renderField(item: ReceiptSummary, field: BuiltInScreenLayoutField) {
    switch (field.key) {
      case "code":
        return <span className="customer-code">{item.code}</span>;
      case "purchaseOrderCode":
        return item.purchaseOrderCode;
      case "receiptDate":
        return item.receiptDate.split("-").reverse().join(".");
      case "warehouseName":
        return item.warehouseName;
      case "lineCount":
        return item.lineCount;
      case "status":
        return (
          <DocumentStatusBadge status={purchaseReceiptStatus(item.status)} />
        );
      default:
        return null;
    }
  }
  return (
    <div className="receipt-screen list-v2 purchase-lv2-stack">
      <ListPageHeader
        title="Mal kabulleri"
        description="Tedarikçi siparişlerinden depoya giren mal kabul belgelerini inceleyin."
        count={loading && total === 0 ? null : total}
      />
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Mal kabul, sipariş veya depo ara"
        toolsSlotRef={setToolsSlot}
        onRefresh={() => {
          if (!loading) void load();
        }}
      />
      <section className="list-v2-list">
        <SalesDocumentGrid
          gridId="purchase-receipts"
          fields={visibleFields}
          items={filtered}
          selectedId={selected?.id ?? null}
          loading={loading}
          loadingMessage="Mal kabulleri yükleniyor…"
          emptyMessage="Henüz mal kabul yok. Kabul, satın alma siparişi ayrıntısından kaydedilir."
          search={search}
          searchEmptyMessage="Aramanızla eşleşen mal kabul yok."
          toolbarContainer={toolsSlot}
          onSelect={setSelectedId}
          renderCell={(field, item) => renderField(item, field)}
          ariaLabel="Mal kabul kayıtları"
        />
      </section>
      {selected && (
        <aside className="erp-record-pane sales-selected-record">
          <header className="list-v2-detail-head">
            <div>
              <span className="list-v2-kind">SATINALMA · MAL KABULÜ</span>
              <h2>{selected.code}</h2>
            </div>
            <div className="list-v2-detail-head-actions">
              <button
                className="secondary small-button"
                onClick={() => void open(selected)}
              >
                Detayları aç
              </button>
            </div>
          </header>
          <div className="list-v2-detail-meta">
            <span>
              <span>Sipariş</span>{" "}
              <span className="list-v2-detail-code">
                {selected.purchaseOrderCode}
              </span>
            </span>
            <span>{selected.warehouseName}</span>
            <span
              className={`list-v2-status${selected.status === "Posted" ? " is-active" : ""}`}
            >
              <i aria-hidden="true" />
              {selected.status === "Posted" ? "Kabul edildi" : "İptal"}
            </span>
          </div>
          <dl className="list-v2-facts">
            <div>
              <dt>Kabul tarihi</dt>
              <dd>{selected.receiptDate}</dd>
            </div>
            <div>
              <dt>Satır sayısı</dt>
              <dd>{selected.lineCount}</dd>
            </div>
          </dl>
        </aside>
      )}{" "}
      <ListPagination
        page={page}
        total={total}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
      />
      <StandaloneFulfillmentPanel
        token={token}
        customers={customers}
        stockItems={stockItems}
        warehouses={warehouseOptions}
      />
      {order && (
          <DocumentSurface
            title="Mal kabul"
            code={order.code}
            subtitle={order.supplierName}
            status={purchaseOrderStatus(order.status)}
            onClose={() => setOrder(null)}
            bodyClassName="modal"
          >
            <div className="requests-list">
              {order.receipts.map((receipt) => (
                <article className="request-row" key={receipt.id}>
                  <div className="request-info">
                    <b>
                      {receipt.code} · {receipt.warehouseName}
                    </b>
                    <small>
                      {receipt.receiptDate} · {receipt.lineCount} satır ·{" "}
                      {receipt.status === "Posted" ? "Kabul edildi" : "İptal"}
                    </small>
                    {receipt.lines?.map((line, index) => (
                      <small key={`${line.orderLineNumber}-${index}`}>
                        {line.stockCode} ·{" "}
                        {line.quantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {line.unitCode}
                      </small>
                    ))}
                  </div>
                  {receipt.invoice ? (
                    <button
                      className="row-action"
                      onClick={() => void openInvoice(receipt.invoice!.id)}
                    >
                      Alış faturasını aç
                    </button>
                  ) : (
                    receipt.status === "Posted" && (
                      <span className="cell-subtitle">Henüz faturalanmadı</span>
                    )
                  )}
                </article>
              ))}
            </div>
            <div className="modal-foot">
              <span>Bağlı sipariş {order.code}</span>
              <button className="secondary" onClick={() => setOrder(null)}>
                Kapat
              </button>
            </div>
          </DocumentSurface>
          )}
      {invoiceId && (
        <PurchaseInvoiceModal
          invoiceId={invoiceId}
          token={token}
          warehouses={warehouses}
          onClose={() => setInvoiceId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
