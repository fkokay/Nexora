import { useRef, useState, type ReactNode } from "react";
import { CircleSlash, FileCheck2, ShieldAlert, Users } from "lucide-react";
import type { GridExportActions } from "../AdvancedDataGrid";
import type { CustomerBalance, CustomerItem } from "../erp-types";
import { focusedRecordId } from "../commands/gridCommands";
import type { MenuCommand, PageCommands } from "../commands/types";
import type { BulkAction } from "../list-page/BulkActionBar";
import { ListSummaryCards } from "../list-page/ListSummaryCards";
import { SalesListFooter } from "../sales/components/SalesListFooter";
import { SalesListDetailEmpty, SalesListPanelToggle } from "../sales/components/SalesListDetailPanel";
import type { SalesGridSelection } from "../sales/components/SalesDocumentGrid";
import { useSalesListPanel } from "../sales/useSalesListPanel";
import type { CustomerDirectoryCounts } from "./components/CustomerFilters";
import { SALES_PARTY_TYPES } from "./customerLabels";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
/** Cari kartları silinmez (silme uç noktası yok); pasife alınır. */
export const CUSTOMER_DELETE_REASON = "Cari silinmez, pasife alınır";
export const SALES_ONLY_REASON = "Satış işlemleri yalnız müşteri ve bayi kartlarında";

type Options = {
  /** The list is on screen (not a create / edit form). */
  active: boolean;
  token: string;
  isAdmin: boolean;
  busy: boolean;
  exportBusy: boolean;
  items: CustomerItem[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  /** Server counts of the chips (search applied, type / status not); null while loading or unavailable. */
  counts: CustomerDirectoryCounts | null;
  search: string;
  /** The row the user chose (click, ↑/↓); null = none. */
  currentId: string | null;
  onCurrentChange: (id: string | null) => void;
  onPageChange: (page: number) => void;
  onCreate: () => void;
  onOpen: (item: CustomerItem) => void;
  onExport: (format: "csv" | "xlsx") => void;
  onGroups: () => void;
  onImport: () => void;
  onToggleActive: (item: CustomerItem) => void;
  onSalesAction: (page: string) => void;
  onLedger: (item: CustomerItem) => void;
  onAddresses: (item: CustomerItem) => void;
  onFields: (item: CustomerItem) => void;
  /** The custom field definitions window (definitions, value history, restore). */
  onFieldDefinitions: (item: CustomerItem) => void;
  onInvoices: (item: CustomerItem) => void;
  onPurchaseInvoices: (item: CustomerItem) => void;
};

/**
 * Cari Hesaplar list wiring (mockup 08, list type of Stok / Satış): action bar commands and İşlemler, summary cards,
 * selection, footer and the detail panel's open state with the chosen account's `/balance`.
 */
export function useCustomerListScreen(o: Options) {
  const exportRef = useRef<GridExportActions | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const current = o.currentId ? o.items.find((item) => item.id === o.currentId) : undefined;
  const panel = useSalesListPanel<CustomerBalance>({
    active: o.active,
    token: o.token,
    currentId: current?.id ?? null,
    path: (id) => `/api/customers/${id}/balance`,
    reloadKey: current ? JSON.stringify(current) : undefined,
  });
  const openTarget = current ?? (ticked.length === 1 ? o.items.find((item) => item.id === ticked[0]) : undefined);

  const commands: PageCommands = {
    new: { primary: true, run: o.onCreate },
    open: {
      disabledReason: openTarget ? undefined : NO_RECORD,
      run: () => {
        const id = focusedRecordId();
        const target = (id && o.items.find((item) => item.id === id)) || openTarget;
        if (target) o.onOpen(target);
      },
    },
    delete: { disabledReason: CUSTOMER_DELETE_REASON },
    export: { disabledReason: o.exportBusy ? BUSY : undefined, run: () => o.onExport("xlsx") },
  };
  const more: MenuCommand[] = [];
  if (current) {
    const salesReason = SALES_PARTY_TYPES.includes(current.type) ? undefined : SALES_ONLY_REASON;
    more.push(
      { id: "customer-sales-order", label: "Yeni sipariş", disabledReason: salesReason, run: () => o.onSalesAction("sales-order-document") },
      { id: "customer-sales-quote", label: "Yeni teklif", disabledReason: salesReason, run: () => o.onSalesAction("sales-quote-create") },
      { id: "customer-sales-delivery", label: "Yeni irsaliye", disabledReason: salesReason, run: () => o.onSalesAction("sales-delivery-create") },
      { id: "customer-sales-invoice", label: "Yeni fatura", disabledReason: salesReason, run: () => o.onSalesAction("sales-invoice-create") },
      { id: "customer-ledger", label: "Cari mutabakatı", run: () => o.onLedger(current) },
      { id: "customer-addresses", label: "Adresler", run: () => o.onAddresses(current) },
      { id: "customer-fields", label: "Özel alanlar", run: () => o.onFields(current) },
      { id: "customer-field-definitions", label: "Özel alan tanımları ve geçmiş", run: () => o.onFieldDefinitions(current) },
    );
    if (current.type !== "Supplier") more.push({ id: "customer-invoices", label: "Satış faturaları", run: () => o.onInvoices(current) });
    if (current.type !== "Customer")
      more.push({ id: "customer-purchase-invoices", label: "Alış faturaları", run: () => o.onPurchaseInvoices(current) });
    more.push({
      id: "customer-toggle-active",
      label: current.isActive ? "Pasife al" : "Etkinleştir",
      disabledReason: o.busy ? BUSY : undefined,
      run: () => o.onToggleActive(current),
    });
  }
  more.push({ id: "customer-groups", label: "Gruplar", run: o.onGroups });
  if (o.isAdmin) more.push({ id: "customer-import", label: "CSV / Excel içe aktar", run: o.onImport });
  more.push({ id: "customer-export-csv", label: "CSV olarak dışa aktar", disabledReason: o.exportBusy ? BUSY : undefined, run: () => o.onExport("csv") });
  commands.more = more;

  const bulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void exportRef.current?.exportExcel() },
  ];
  const selection: SalesGridSelection = {
    currentId: o.currentId,
    onCurrentChange: o.onCurrentChange,
    onTickedChange: setTicked,
    bulkActions: o.active ? bulkActions : undefined,
    onOpen: (id) => {
      const item = o.items.find((row) => row.id === id);
      if (item) o.onOpen(item);
    },
  };

  // Cari kartı / Pasif: the chips' server counts (search applied, all pages). e-Fatura and risk limiti: the rows of
  // this page only ("bu sayfa"). The cards do not filter.
  const count = (value: number | undefined) => (o.counts && value != null ? value.toLocaleString("tr-TR") : "—");
  const pageCount = (predicate: (item: CustomerItem) => boolean) =>
    o.loading || !o.items.length ? "—" : `${o.items.filter(predicate).length} / ${o.items.length}`;
  const scope = o.search.trim() ? "aramayla eşleşen" : "tüm kayıtlar";
  const summary = (
    <ListSummaryCards
      cards={[
        {
          id: "total",
          label: "Cari kartı",
          value: count(o.counts?.total),
          icon: Users,
          hint: o.counts ? (
            <>
              <span>{scope}</span> · <span>{o.counts.active.toLocaleString("tr-TR")}</span> <span>aktif</span>
            </>
          ) : (
            <span>{scope}</span>
          ),
        },
        { id: "inactive", label: "Pasif", value: count(o.counts?.inactive), icon: CircleSlash, hint: <span>{scope}</span> },
        {
          id: "einvoice",
          label: "e-Fatura mükellefi",
          value: pageCount((item) => !!item.isEInvoiceRegistered),
          icon: FileCheck2,
          tone: "ok",
          hint: <span>bu sayfa</span>,
        },
        {
          id: "risk",
          label: "Risk limiti tanımlı",
          value: pageCount((item) => item.riskLimit != null),
          icon: ShieldAlert,
          tone: "warn",
          hint: <span>bu sayfa</span>,
        },
      ]}
    />
  );

  const footer = (
    <SalesListFooter
      ticked={ticked.length}
      shown={o.items.length}
      total={o.total}
      page={o.page}
      pageSize={o.pageSize}
      loading={o.loading}
      onPageChange={o.onPageChange}
      hints="↑↓ gez · Boşluk işaretle · Enter kartı aç · Çift tık aç · Ctrl+. detay paneli"
    />
  );

  const panelOpen = panel.open && o.active;
  const renderPanel = (content: (customer: CustomerItem) => ReactNode): ReactNode =>
    panelOpen ? current ? content(current) : <SalesListDetailEmpty label="Cari özeti" text="Özetini görmek için listeden bir cari seçin." /> : null;

  return {
    commands,
    summary,
    footer,
    selection,
    exportRef,
    panelRootRef: panel.rootRef,
    panelOpen,
    panelToggle: <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />,
    renderPanel,
    closePanel: panel.close,
    takeFocus: panel.takeFocus,
    balance: panel.detail,
    balanceError: panel.error,
  };
}
