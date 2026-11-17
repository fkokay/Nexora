import { useEffect, useMemo, useRef, useState } from "react";
import type * as AppTypes from "./erp-types";
import { api } from "./erpApi";
import { CircleSlash, X } from "lucide-react";
import type { GridExportActions } from "./AdvancedDataGrid";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { StandaloneFulfillmentPanel } from "./StandaloneFulfillmentPanel";
import { PurchaseInvoiceModal } from "./PurchaseInvoiceModal";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import { SalesListPanelToggle } from "./sales/components/SalesListDetailPanel";
import { SalesListFooter } from "./sales/components/SalesListFooter";
import { useSalesListPanel } from "./sales/useSalesListPanel";
import { PageCommandsSlot, documentOpenCommands } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import {
  PurchaseReceiptDocument,
  PurchaseReceiptListPanel,
  PurchaseReceiptListPanelEmpty,
  purchaseReceiptTag,
  receiptOfOrder,
  type PurchaseReceiptRow,
} from "./purchasing/purchaseReceiptDocument";
import { formatDate } from "./document-detail/DocumentDetailLayout";
import "./sales/sales-list-v2.css";
import "./purchasing/purchase-receipts.css";
type BuiltInScreenLayoutField = AppTypes.BuiltInScreenLayoutField;
type PurchaseOrderDetail = AppTypes.PurchaseOrderDetail;
type SalesCustomer = AppTypes.SalesCustomer;
type StockItem = AppTypes.StockItem;
type Warehouse = AppTypes.Warehouse;

const pageSize = 25;
const NUMBER_FIELDS: ReadonlySet<string> = new Set(["lineCount"]);
const CODE_FIELDS: ReadonlySet<string> = new Set(["code", "purchaseOrderCode"]);
const COLUMN_WIDTHS: Record<string, number> = {
  code: 150, purchaseOrderCode: 130, receiptDate: 105, warehouseName: 200, lineCount: 60, status: 115,
};

/**
 * Mal kabulleri (taslak 07, liste tipi): tek tık satırı seçer (sağ panel), çift tık / Enter / Aç / numara bağlantısı
 * mal kabulü belge ekranında açar. Mal kabul listesinde sunucu araması yoktur; arama yüklenen sayfayı süzer ("bu
 * sayfa"). Mal kabul satın alma siparişi ayrıntısından kaydedilir; siparişsiz mal kabul formu listenin altındadır.
 */
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
  const [items, setItems] = useState<PurchaseReceiptRow[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [ticked, setTicked] = useState<string[]>([]);
  // The open receipt: its order's detail (today's call) and the receipt's id inside it.
  const [opened, setOpened] = useState<{ order: PurchaseOrderDetail; receiptId: string } | null>(null),
    [opening, setOpening] = useState(false),
    [invoiceId, setInvoiceId] = useState<string | null>(null),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: PurchaseReceiptRow[]; totalCount: number }>(
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
        // Row actions live in the detail panel and the bar's İşlemler menu.
        .filter((field) => field.visible && field.key !== "actions")
        .sort((a, b) => a.position - b.position),
    [screenFields],
  );
  // No search parameter on the endpoint: the search filters the loaded page.
  const filtered = items.filter(
    (x) =>
      !search ||
      `${x.code} ${x.purchaseOrderCode} ${x.warehouseName}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  // The row the user chose (click, ↑/↓) among the shown rows; never an implicit first row.
  const current = filtered.find((x) => x.id === selectedId);
  const openedReceipt = opened ? receiptOfOrder(opened.order, opened.receiptId) : null;
  const listActive = !opened && !invoiceId;

  async function open(item: Pick<PurchaseReceiptRow, "id" | "purchaseOrderId">) {
    setError("");
    setSelectedId(item.id);
    setOpening(true);
    try {
      const order = await api<PurchaseOrderDetail>(
        `/api/purchasing/orders/${item.purchaseOrderId}`,
        token,
      );
      if (receiptOfOrder(order, item.id)) setOpened({ order, receiptId: item.id });
      else setError("Mal kabul bulunamadı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
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
  const openById = (id: string) => {
    const item = items.find((x) => x.id === id);
    if (item) return open(item);
  };
  function renderField(item: PurchaseReceiptRow, field: BuiltInScreenLayoutField) {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-haspopup="dialog"
            aria-label={`${item.code} mal kabul ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              void open(item);
            }}
          >
            {item.code}
          </button>
        );
      case "purchaseOrderCode":
        return item.purchaseOrderCode;
      case "receiptDate":
        return formatDate(item.receiptDate);
      case "warehouseName":
        return item.warehouseName;
      case "lineCount":
        return item.lineCount;
      case "status":
        return purchaseReceiptTag(item.status);
      default:
        return null;
    }
  }

  // Action bar of the receipt list and of an open receipt. A receipt is created from its order (or below, without
  // an order) and cancelled from the order; it is never deleted. An open invoice holds the bar itself.
  const target: PurchaseReceiptRow | undefined = opened
    ? items.find((x) => x.id === opened.receiptId)
    : current ?? (ticked.length === 1 ? filtered.find((x) => x.id === ticked[0]) : undefined);
  const targetStatus = openedReceipt?.status ?? target?.status;
  const commands: PageCommands = {};
  const more: MenuCommand[] = [];
  commands.delete = {
    disabledReason: !targetStatus
      ? "Önce bir kayıt seçin"
      : targetStatus === "Posted"
        ? "Kabul edilmiş belge silinemez — iptal sipariş belgesinden yapılır"
        : "Mal kabul kaydı silinemez",
  };
  if (opened) {
    Object.assign(commands, documentOpenCommands(() => open({ id: opened.receiptId, purchaseOrderId: opened.order.id })));
    const invoice = openedReceipt?.invoice;
    if (invoice) more.push({ id: "receipt-open-invoice", label: "Alış faturasını aç", run: () => openInvoice(invoice.id) });
  } else {
    commands.open = {
      disabledReason: opening ? "Açılıyor…" : target ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? target?.id;
        if (id) return openById(id);
      },
    };
    more.push(csvExportCommand(gridExportRef));
  }
  commands.more = more;

  const panel = useSalesListPanel<PurchaseOrderDetail>({
    active: listActive,
    token,
    currentId: current?.id ?? null,
    // The list row carries neither lines nor invoice; its order's detail does (the same call as Aç).
    path: () => `/api/purchasing/orders/${current?.purchaseOrderId}`,
    reloadKey: current ? JSON.stringify(current) : undefined,
  });
  const listPanel =
    panel.open && listActive ? (
      current ? (
        <PurchaseReceiptListPanel
          row={current}
          order={panel.detail}
          error={panel.error}
          onOpen={() => void open(current)}
          openDisabled={opening}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        />
      ) : (
        <PurchaseReceiptListPanelEmpty />
      )
    ) : null;

  return (
    <div className="receipt-screen list-v2 sales-lv2-stack">
      {!invoiceId && <PageCommandsSlot commands={commands} />}
      <ListPageHeader
        title="Mal kabulleri"
        description="Tedarikçi siparişlerinden depoya giren mal kabul belgelerini inceleyin."
        count={loading && total === 0 ? null : total}
      />
      <ListSummaryCards
        cards={[
          {
            id: "voided",
            label: "İptal",
            value: loading ? "—" : items.filter((item) => item.status === "Voided").length.toLocaleString("tr-TR"),
            icon: CircleSlash,
            hint: "bu sayfa",
          },
        ]}
      />
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel="Bu sayfada ara: mal kabul, sipariş veya depo"
        searchPlaceholder="Bu sayfada ara: mal kabul, sipariş veya depo"
        toolsSlotRef={setToolsSlot}
        onRefresh={() => {
          if (!loading) void load();
        }}
      >
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div ref={panel.rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list">
          <SalesDocumentGrid
            gridId="purchase-receipts"
            hideExport
            exportActionsRef={gridExportRef}
            fields={visibleFields}
            items={filtered}
            loading={loading}
            loadingMessage="Mal kabulleri yükleniyor…"
            emptyMessage="Henüz mal kabul yok. Kabul, satın alma siparişi ayrıntısından kaydedilir."
            search={search}
            searchEmptyMessage="Bu sayfada aramanızla eşleşen mal kabul yok."
            toolbarContainer={toolsSlot}
            renderCell={(field, item) => renderField(item, field)}
            ariaLabel="Mal kabul kayıtları"
            selection={{
              currentId: selectedId,
              onCurrentChange: setSelectedId,
              onTickedChange: setTicked,
              // Only while the list is on screen: a document over it must not show the floating bar.
              bulkActions: listActive
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                : undefined,
              onOpen: (id) => void openById(id),
            }}
            footer={
              <SalesListFooter
                ticked={ticked.length}
                shown={filtered.length}
                total={total}
                page={page}
                pageSize={pageSize}
                loading={loading}
                onPageChange={setPage}
              />
            }
            columnWidths={COLUMN_WIDTHS}
            numberFields={NUMBER_FIELDS}
            codeFields={CODE_FIELDS}
          />
        </section>
        {listPanel}
      </div>
      {/* Receipts without an order: the form stays as it is, in one card under the list. */}
      <section className="purchase-receipt-standalone" aria-label="Siparişsiz mal kabul">
        <StandaloneFulfillmentPanel
          token={token}
          customers={customers}
          stockItems={stockItems}
          warehouses={warehouseOptions}
          // While a receipt document or its invoice is open, Kaydet / Ctrl+S / Temizle must not act on this hidden form.
          commandsActive={listActive}
        />
      </section>
      {opened && openedReceipt && (
        <PurchaseReceiptDocument
          order={opened.order}
          receipt={openedReceipt}
          onClose={() => setOpened(null)}
          onOpenInvoice={(id) => void openInvoice(id)}
        />
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
