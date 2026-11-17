import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleDollarSign, CircleSlash, Clock3, X } from "lucide-react";
import type { GridExportActions } from "../AdvancedDataGrid";
import { PageCommandsSlot } from "../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../commands/gridCommands";
import type { CommandSpec, MenuCommand, PageCommands } from "../commands/types";
import { localDateString } from "../dateUtils";
import { api } from "../erpApi";
import type { BuiltInScreenLayoutField, PurchaseInvoiceDetail, PurchaseInvoiceSummary, SalesPageKey, Warehouse } from "../erp-types";
import { ListPageHeader } from "../list-page/ListPageHeader";
import { ListSummaryCards } from "../list-page/ListSummaryCards";
import { ListChipGroup, ListToolbar } from "../list-page/ListToolbar";
import { StatusTag } from "../list-page/StatusTag";
import { PurchaseInvoiceModal, type PurchaseInvoiceInitialAction } from "../PurchaseInvoiceModal";
import SalesDocumentGrid from "../sales/components/SalesDocumentGrid";
import { SalesListPanelToggle } from "../sales/components/SalesListDetailPanel";
import { SalesListFooter, pageAmountHint } from "../sales/components/SalesListFooter";
import { listAmount } from "../sales/components/salesListCells";
import { useSalesListPanel } from "../sales/useSalesListPanel";
import "../sales/sales-list-v2.css";
import "../purchase-list-v2/purchase-list-v2.css";
import { PurchaseInvoiceListPanel, PurchaseInvoiceListPanelEmpty } from "./PurchaseInvoiceListPanel";
import { purchaseInvoiceListTag, purchaseInvoiceOverdueDays } from "./purchaseInvoiceStatus";

const PAGE_SIZE = 25;

/**
 * Default columns (taslak 07): used while the tenant has no published screen view (the server then answers with its
 * catalog default, `id: null`). A published view wins as it is, without the former "⋯" column.
 */
const DEFAULT_FIELDS: BuiltInScreenLayoutField[] = [
  { key: "code", label: "Fatura no", visible: true, position: 0 },
  { key: "invoiceDate", label: "Tarih", visible: true, position: 1 },
  { key: "supplierName", label: "Tedarikçi", visible: true, position: 2 },
  { key: "receiptCode", label: "Mal kabul", visible: true, position: 3 },
  { key: "dueDate", label: "Vade", visible: true, position: 4 },
  { key: "grandTotal", label: "Genel toplam", visible: true, position: 5 },
  { key: "paidAmount", label: "Ödenen", visible: true, position: 6 },
  { key: "outstandingAmount", label: "Kalan", visible: true, position: 7 },
  { key: "status", label: "Durum", visible: true, position: 8 },
  { key: "purchaseOrderCode", label: "Sipariş no", visible: false, position: 9 },
  { key: "currencyCode", label: "Döviz", visible: false, position: 10 },
  { key: "lineCount", label: "Satır", visible: false, position: 11 },
];
/** Sized so the default columns and the checkbox column fit beside the menu at 1440 (no horizontal scroll). */
const COLUMN_WIDTHS: Record<string, number> = {
  code: 112, invoiceDate: 86, supplierName: 184, receiptCode: 120, dueDate: 126, grandTotal: 122, paidAmount: 98,
  outstandingAmount: 98, status: 106, purchaseOrderCode: 115, currencyCode: 60, lineCount: 55,
};
const NUMBER_FIELDS: ReadonlySet<string> = new Set(["grandTotal", "paidAmount", "outstandingAmount", "lineCount"]);
const CODE_FIELDS: ReadonlySet<string> = new Set(["code", "receiptCode", "purchaseOrderCode"]);

const date = (value: string) => value.slice(0, 10).split("-").reverse().join(".");
const amount = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PurchaseInvoicesScreen({
  token,
  initialSupplier,
  onInitialSupplierOpened,
  onNavigate,
}: {
  token: string;
  initialSupplier?: { id: string; name: string } | null;
  onInitialSupplierOpened?: () => void;
  onNavigate: (page: SalesPageKey) => void;
}) {
  const [items, setItems] = useState<PurchaseInvoiceSummary[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(initialSupplier ?? null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [invoiceId, setInvoiceId] = useState<string | null>(null),
    [invoiceAction, setInvoiceAction] = useState<PurchaseInvoiceInitialAction | undefined>(undefined),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [screenFields, setScreenFields] = useState(DEFAULT_FIELDS);
  // List type (taslak 06 / 07): the current row is the one the user chose (click, ↑/↓), never an implicit first row.
  const [currentId, setCurrentId] = useState<string | null>(null),
    [ticked, setTicked] = useState<string[]>([]);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const today = localDateString();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q: query.trim() });
      if (supplierFilter) params.set("supplierId", supplierFilter.id);
      const result = await api<{ items: PurchaseInvoiceSummary[]; page: number; pageSize: number; totalCount: number }>(
        `/api/purchasing/invoices/?${params}`,
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
  }, [token, page, query, supplierFilter?.id]);
  useEffect(() => {
    if (initialSupplier) onInitialSupplierOpened?.();
  }, [initialSupplier, onInitialSupplierOpened]);
  useEffect(() => {
    let cancelled = false;
    api<{ id?: string | null; fields: BuiltInScreenLayoutField[] }>("/api/screen-views/purchase-invoices/active", token)
      .then((view) => {
        // Only a published tenant view (it has an id) replaces the default columns.
        if (!cancelled && view.id && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  async function openInvoice(id: string, action?: PurchaseInvoiceInitialAction) {
    setError("");
    try {
      if (warehouses.length === 0)
        setWarehouses((await api<Warehouse[]>("/api/warehouses/", token)).filter((x) => x.isActive));
      setInvoiceAction(action);
      setInvoiceId(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // The bar, the panel and the bulk bar belong to the list only while no invoice is open over it.
  const listActive = !invoiceId;
  const current = items.find((item) => item.id === currentId);
  const target = current ?? (ticked.length === 1 ? items.find((item) => item.id === ticked[0]) : undefined);
  const panel = useSalesListPanel<PurchaseInvoiceDetail>({
    active: listActive,
    token,
    currentId: current?.id ?? null,
    path: (id) => `/api/purchasing/invoices/${id}`,
    reloadKey: current ? JSON.stringify(current) : undefined,
  });
  const openReceiptEntry = () => onNavigate("sales-purchase-invoice-entry");
  const newCommand: CommandSpec = { primary: true, run: openReceiptEntry };
  const commands: PageCommands = {
    new: newCommand,
    open: {
      disabledReason: target ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? target?.id;
        if (id) return openInvoice(id);
      },
    },
    // There is no delete for purchase invoices: a posted invoice is cancelled with a reversal.
    delete: {
      disabledReason: !target
        ? "Önce bir kayıt seçin"
        : target.status === "Posted"
          ? "İşlenmiş belge silinemez — İşlemler › İptal et"
          : "İptal edilmiş belge silinemez",
    },
  };
  // "Fatura ekle" (the bar's Yeni cannot carry a menu: F2 opens the receipt path) and the former row menu ("⋯")
  // with its conditions.
  const more: MenuCommand[] = [
    { id: "purchase-invoice-from-receipt", label: "Mal kabulünden fatura", run: openReceiptEntry },
    { id: "purchase-invoice-standalone", label: "Mal kabulsüz fatura", run: () => onNavigate("sales-purchase-invoice-drafts") },
  ];
  if (target?.status === "Posted") {
    if (target.outstandingAmount > 0)
      more.push({ id: "purchase-invoice-payment", label: "Ödeme ekle", run: () => openInvoice(target.id, "payment") });
    more.push({ id: "purchase-invoice-return", label: "İade oluştur", run: () => openInvoice(target.id, "return") });
    more.push({
      id: "purchase-invoice-void",
      label: "İptal et",
      disabledReason: target.paidAmount > 0 ? "İptal için önce ödemeleri iptal edin." : undefined,
      run: () => openInvoice(target.id, "void"),
    });
  }
  more.push(csvExportCommand(gridExportRef));
  commands.more = more;

  // Summary cards (taslak 07): figures of the loaded page ("bu sayfa"); amounts in several currencies are not added.
  const posted = items.filter((item) => item.status === "Posted");
  const unpaid = posted.filter((item) => item.outstandingAmount > 0);
  const overdue = unpaid.filter((item) => purchaseInvoiceOverdueDays(item, today) > 0);
  const voided = items.filter((item) => item.status !== "Posted");
  const pageSum = (rows: PurchaseInvoiceSummary[], pick: (row: PurchaseInvoiceSummary) => number): string | null => {
    const currencies = new Set((rows.length ? rows : items).map((row) => row.currencyCode));
    if (loading || currencies.size !== 1) return null;
    return `${amount(rows.reduce((sum, row) => sum + pick(row), 0))} ${[...currencies][0]}`;
  };
  const countHint = (count: number) => (
    <>
      <span>bu sayfa</span> · <span>{count.toLocaleString("tr-TR")}</span> <span>fatura</span>
    </>
  );
  const count = (rows: unknown[]) => (loading ? "—" : rows.length.toLocaleString("tr-TR"));
  const overdueSum = pageSum(overdue, (row) => row.outstandingAmount);
  const cards = (
    <ListSummaryCards
      cards={[
        {
          id: "invoice-total",
          label: "Fatura toplamı",
          value: pageSum(posted, (row) => row.grandTotal) ?? "—",
          icon: CircleDollarSign,
          hint: pageAmountHint(posted.length ? posted : items, countHint(posted.length)),
        },
        {
          id: "invoice-unpaid",
          label: "Ödenmemiş",
          value: pageSum(unpaid, (row) => row.outstandingAmount) ?? "—",
          icon: Clock3,
          tone: "warn",
          hint: pageAmountHint(unpaid.length ? unpaid : items, countHint(unpaid.length)),
        },
        {
          id: "invoice-overdue",
          label: "Vadesi geçen",
          value: count(overdue),
          icon: CircleAlert,
          tone: "bad",
          hint: overdue.length && overdueSum ? <><span>{overdueSum}</span> · <span>bu sayfa</span></> : pageAmountHint(overdue.length ? overdue : items, <span>bu sayfa</span>),
        },
        { id: "invoice-voided", label: "İptal", value: count(voided), icon: CircleSlash, hint: <span>bu sayfa</span> },
      ]}
    />
  );

  const visibleFields = [...screenFields]
    .filter((field) => field.visible && field.key !== "actions")
    .sort((a, b) => a.position - b.position);
  function cell(item: PurchaseInvoiceSummary, field: BuiltInScreenLayoutField): ReactNode {
    const days = purchaseInvoiceOverdueDays(item, today);
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-haspopup="dialog"
            aria-label={`${item.code} fatura ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              setCurrentId(item.id);
              void openInvoice(item.id);
            }}
          >
            {item.code}
          </button>
        );
      case "supplierName":
        return <span className="customer-name">{item.supplierName}</span>;
      case "receiptCode":
        return item.receiptCode || "—";
      case "purchaseOrderCode":
        return item.purchaseOrderCode || "—";
      case "invoiceDate":
        return date(item.invoiceDate);
      case "dueDate":
        return days > 0 ? (
          <span className="purchase-inv-overdue">
            <span>{date(item.dueDate).slice(0, 5)}</span> <span>{`· ${days} gün geçti`}</span>
          </span>
        ) : (
          date(item.dueDate)
        );
      case "currencyCode":
        return item.currencyCode;
      case "grandTotal":
        return listAmount(item.grandTotal, item.currencyCode);
      case "paidAmount":
        return amount(item.paidAmount);
      case "outstandingAmount": {
        // A voided invoice owes nothing; the list still returns its total, so no amount is shown.
        if (item.status !== "Posted") return "—";
        const tone = days > 0 ? " is-bad" : item.outstandingAmount > 0 && item.paidAmount > 0 ? " is-warn" : "";
        return <span className={`purchase-inv-amount${tone}`}>{amount(item.outstandingAmount)}</span>;
      }
      case "lineCount":
        return item.lineCount;
      case "status": {
        const tag = purchaseInvoiceListTag(item, today);
        return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
      }
      default:
        return null;
    }
  }

  const panelOpen = panel.open && listActive;
  const listPanel = !panelOpen ? null : current ? (
    <PurchaseInvoiceListPanel
      row={current}
      today={today}
      detail={panel.detail}
      error={panel.error}
      onClose={panel.close}
      takeFocus={panel.takeFocus}
      onOpen={() => void openInvoice(current.id)}
    />
  ) : (
    <PurchaseInvoiceListPanelEmpty />
  );
  return (
    <>
      {listActive && <PageCommandsSlot commands={commands} />}
      <div className="sales-lv2-stack">
        <ListPageHeader
          className="customer-heading"
          title="Satınalma Faturaları"
          description="Mal kabullerinden oluşan tedarikçi faturalarını, vadeleri ve kalan borçları izleyin."
          count={total}
        />
        {cards}
        <ListToolbar
          search={query}
          onSearchChange={(value) => {
            setPage(1);
            setQuery(value);
          }}
          searchLabel="Fatura numarası, tedarikçi veya mal kabul ara"
          searchPlaceholder="Fatura no, tedarikçi veya mal kabul ara"
          toolsSlotRef={setToolsSlot}
          onRefresh={() => void load()}
        >
          {supplierFilter && (
            <ListChipGroup
              label="Tedarikçi"
              value={supplierFilter.id}
              onChange={(value) => {
                if (value) return;
                setSupplierFilter(null);
                setPage(1);
              }}
              options={[
                { value: "", label: "Tüm tedarikçiler" },
                { value: supplierFilter.id, label: supplierFilter.name },
              ]}
            />
          )}
          <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
        </ListToolbar>
      </div>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Hatayı kapat" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div ref={panel.rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="purchase-invoice-list list-v2-list" aria-label="Alış faturası listesi">
          <SalesDocumentGrid
            gridId="purchase-invoices"
            ariaLabel="Alış faturası kayıtları"
            hideExport
            exportActionsRef={gridExportRef}
            fields={visibleFields}
            items={items}
            loading={loading}
            loadingMessage="Alış faturaları yükleniyor…"
            emptyMessage={
              supplierFilter
                ? `${supplierFilter.name} için görüntülenebilir alış faturası yok.`
                : "Henüz alış faturası yok. Fatura eklemek için faturalanabilir bir mal kabul seçin."
            }
            search={query}
            searchEmptyMessage="Aramanızla eşleşen alış faturası yok."
            toolbarContainer={toolsSlot}
            renderCell={(field, item) => cell(item, field)}
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              // Only while the list is on screen: an open invoice must not show the floating bar.
              bulkActions: listActive
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                : undefined,
              onOpen: (id) => void openInvoice(id),
            }}
            footer={
              <SalesListFooter
                ticked={ticked.length}
                shown={items.length}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
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
      {invoiceId && (
        <PurchaseInvoiceModal
          invoiceId={invoiceId}
          token={token}
          warehouses={warehouses}
          initialAction={invoiceAction}
          newCommand={{ run: openReceiptEntry }}
          onClose={() => {
            setInvoiceId(null);
            setInvoiceAction(undefined);
          }}
          onChanged={load}
        />
      )}
    </>
  );
}
