import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import SalesListToolbar from "./sales/components/SalesListToolbar";
import SalesInvoiceFromDeliveryDialog from "./sales/components/SalesInvoiceFromDeliveryDialog";
import SalesRowActionsMenu from "./sales/components/SalesRowActionsMenu";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import "./sales/sales-list-v2.css";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import {
  INVOICE_LIST_WIDTHS,
  ORDER_LIST_WIDTHS,
  QUOTE_LIST_WIDTHS,
  SALES_CODE_FIELDS,
  SALES_NUMBER_FIELDS,
  listAmount,
  listTag,
} from "./sales/components/salesListCells";
import { useSalesListPanel } from "./sales/useSalesListPanel";
import { SalesListPanelToggle } from "./sales/components/SalesListDetailPanel";
import { SalesListFooter, pageAmount, pageAmountHint } from "./sales/components/SalesListFooter";
import { InvoiceListPanel, OrderListPanel, QuoteListPanel, SalesListPanelEmpty } from "./sales/components/SalesListPanels";
import { PURCHASE_REQUEST_CODE_FIELDS, PURCHASE_REQUEST_LIST_WIDTHS, PURCHASE_REQUEST_NUMBER_FIELDS, PURCHASE_REQUEST_OPEN_EVENT, PurchaseRequestFlow, PurchaseRequestListEmpty, PurchaseRequestListPanel, PurchaseRequestTag, purchaseRequestSummaryCards, supplierQuoteDocumentStatus, takePurchaseRequestOpen, usePurchaseListPanel } from "./purchasing/purchaseRequestList";
import { PURCHASE_ORDER_CODE_FIELDS, PURCHASE_ORDER_LIST_WIDTHS, PURCHASE_ORDER_NUMBER_FIELDS, PurchaseOrderFlow, PurchaseOrderListEmpty, PurchaseOrderListPanel, PurchaseOrderTag, isPurchaseOrderOverdue, purchaseOrderSummaryCards } from "./purchasing/purchaseOrderList";
import type { BulkAction } from "./list-page/BulkActionBar";
import { CircleDollarSign, CircleSlash, Clock3, Truck } from "lucide-react";
import { SalesQuotePdfTools } from "./sales/components/SalesQuotePdfTools";
import AdvancedDataGrid, { type GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot, confirmStartNew, documentOpenCommands } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { CommandSpec, MenuCommand, PageCommands } from "./commands/types";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import PurchaseInvoiceEntryPage from "./PurchaseInvoiceEntryPage";
import PurchaseSupplierQuotesPage from "./PurchaseSupplierQuotesPage";
import StandaloneSupplierInvoiceDraftPage from "./StandaloneSupplierInvoiceDraftPage";
import {
  api,
  loadAllPages,
  loadStockItemCatalog,
  localDateString,
} from "./erpApi";
import type * as AppTypes from "./erp-types";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import SearchableRecordPicker from "./SearchableRecordPicker";
import AsyncStockItemPicker from "./sales/AsyncStockItemPicker";
import { SalesDeliveriesScreen } from "./SalesDeliveriesPage";
import { PurchaseReceiptsScreen } from "./PurchaseReceiptsScreen";
import { PurchaseInvoiceModal } from "./PurchaseInvoiceModal";
import { PurchaseInvoicesScreen } from "./purchasing/PurchaseInvoicesScreen";
import { SalesInvoiceModal } from "./SalesInvoiceModal";
import { confirmDialog, promptDialog } from "./confirmDialog";
import { DocumentSurface } from "./document-page/DocumentSurface";
import { DocumentStatusBadge } from "./document-page/DocumentStatusBadge";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailKeyValues,
  DetailLinesFooter,
  DetailLinesHead,
  DetailNotes,
  DetailSection,
  DetailTabs,
  DetailTiles,
  daysFromToday,
  formatAmount,
  formatDate,
  formatQuantity,
} from "./document-detail/DocumentDetailLayout";
import { purchaseInvoiceStatus, purchaseOrderStatus, purchaseReceiptStatus, purchaseRequestStatus, salesDeliveryStatus, salesInvoiceStatus, salesOrderStatus, salesQuoteStatus } from "./document-page/documentStatus";
import { SALES_DETAIL_HINTS, SalesFooterStatus, SalesLinesMeta, SalesOrderFlow, SalesQuoteFlow, salesTotalRows, vatByRate } from "./sales/salesDocumentDetail";
import { LineAddLabel, SALES_FORM_HINTS, SalesFormLines, salesFormTotalRows } from "./sales/salesDocumentForm";
import { PurchaseCreateOrderFlow, purchaseCreateOrderTotals } from "./purchasing/purchaseCreateForms";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./sales/sales-record-forms.css";
import "./sales/purchase-order-create.css";
import "./sales/purchase-orders-list.css";
type BuiltInScreenLayoutField = AppTypes.BuiltInScreenLayoutField;
type PurchaseInvoiceSummary = AppTypes.PurchaseInvoiceSummary;
type PurchaseOrderDetail = AppTypes.PurchaseOrderDetail;
type PurchaseOrderFieldDefinition = AppTypes.PurchaseOrderFieldDefinition;
type PurchaseOrderFieldRevision = AppTypes.PurchaseOrderFieldRevision;
type PurchaseOrderFieldValue = AppTypes.PurchaseOrderFieldValue;
type PurchaseOrderSummary = AppTypes.PurchaseOrderSummary;
type PurchaseReceipt = AppTypes.PurchaseReceipt;
type PurchaseReceiptFieldDefinition = AppTypes.PurchaseReceiptFieldDefinition;
type PurchaseRequestDetail = AppTypes.PurchaseRequestDetail;
type PurchaseRequestFieldDefinition = AppTypes.PurchaseRequestFieldDefinition;
type PurchaseRequestFieldMetadataRevision =
  AppTypes.PurchaseRequestFieldMetadataRevision;
type PurchaseRequestFieldValue = AppTypes.PurchaseRequestFieldValue;
type PurchaseRequestFieldValueRevision =
  AppTypes.PurchaseRequestFieldValueRevision;
type PurchaseRequestPage = AppTypes.PurchaseRequestPage;
type PurchaseRequestSummary = AppTypes.PurchaseRequestSummary;
type PurchaseSupplierQuote = AppTypes.PurchaseSupplierQuote;
type PurchaseSupplierQuoteFieldDefinition =
  AppTypes.PurchaseSupplierQuoteFieldDefinition;
type SalesCustomer = AppTypes.SalesCustomer;
type SalesDeliverySummary = AppTypes.SalesDeliverySummary;
type SalesInvoiceSummary = AppTypes.SalesInvoiceSummary;
type SalesOrderCustomFieldDefinition = AppTypes.SalesOrderCustomFieldDefinition;
type SalesOrderCustomFieldValue = AppTypes.SalesOrderCustomFieldValue;
type SalesOrderDetail = AppTypes.SalesOrderDetail;
type SalesOrderSummary = AppTypes.SalesOrderSummary;
type SalesPageKey = AppTypes.SalesPageKey;

type CustomerSalesAction = { page: string; customerId: string; customer?: SalesCustomer };
const customerSalesActionStorageKey = "nexora.customer-sales-action";
const customerSalesActionPrefillKey = "nexora.customer-sales-action-prefill";
function takeCustomerSalesAction(page: string): string {
  const raw = sessionStorage.getItem(customerSalesActionStorageKey);
  if (!raw) return "";
  try {
    const action = JSON.parse(raw) as CustomerSalesAction;
    if (action.page !== page) return "";
    sessionStorage.removeItem(customerSalesActionStorageKey);
    if (action.customer?.id === action.customerId)
      sessionStorage.setItem(customerSalesActionPrefillKey, JSON.stringify(action.customer));
    return action.customerId;
  } catch {
    sessionStorage.removeItem(customerSalesActionStorageKey);
    return "";
  }
}
type SalesQuoteCustomFieldDefinition = AppTypes.SalesQuoteCustomFieldDefinition;
type SalesQuoteCustomFieldRevision = AppTypes.SalesQuoteCustomFieldRevision;
type SalesQuoteCustomFieldValue = AppTypes.SalesQuoteCustomFieldValue;
type SalesQuoteDetail = AppTypes.SalesQuoteDetail;
type SalesQuoteRevisionSummary = AppTypes.SalesQuoteRevisionSummary;
type SalesQuoteSummary = AppTypes.SalesQuoteSummary;
type QuoteSalesperson = { id: string; personnelCode: string; fullName: string; status: string };
async function loadCustomerPickerPage(token: string): Promise<{ items: SalesCustomer[]; totalCount: number }> {
  const [customers, combined] = await Promise.all([
    api<{ items: SalesCustomer[]; totalCount: number }>("/api/customers/?type=Customer&status=Active&page=1&pageSize=100", token),
    api<{ items: SalesCustomer[]; totalCount: number }>("/api/customers/?type=Both&status=Active&page=1&pageSize=100", token),
  ]);
  return { items: [...customers.items, ...combined.items], totalCount: customers.totalCount + combined.totalCount };
}
async function loadStockItemPickerPage(token: string): Promise<{ items: StockItem[]; totalCount: number }> {
  const page = await api<{ items: StockItem[]; totalCount: number }>(
    "/api/stock/items/?page=1&pageSize=100",
    token,
  );
  return { items: page.items.filter((item) => item.isActive), totalCount: page.totalCount };
}
type StockItem = AppTypes.StockItem;
type StockItemUnitConversion = AppTypes.StockItemUnitConversion;
type Warehouse = AppTypes.Warehouse;
type WarehouseLocationOption = AppTypes.WarehouseLocationOption;
type SalesQuoteExchangeRates = { baseCurrencyCode: string; rates: { currencyCode: string; rate: number; rateDate: string }[] };

export function SalesPage({
  token,
  role,
  section,
  onNavigate,
  initialInvoiceId,
  onInitialInvoiceOpened,
  initialSupplier,
  onInitialSupplierOpened,
  openInvoiceCreate = false,
  createInvoicePage = false,
  createOrderPage = false,
  createQuotePage = false,
  createDeliveryPage = false,
  createPurchaseOrderPage = false,
}: {
  token: string;
  role: string;
  section: SalesPageKey;
  onNavigate: (page: SalesPageKey, label?: string) => void;
  initialInvoiceId?: string | null;
  onInitialInvoiceOpened?: () => void;
  initialSupplier?: { id: string; name: string } | null;
  onInitialSupplierOpened?: () => void;
  openInvoiceCreate?: boolean;
  createInvoicePage?: boolean;
  createOrderPage?: boolean;
  createQuotePage?: boolean;
  createDeliveryPage?: boolean;
  createPurchaseOrderPage?: boolean;
}) {
  const salesActionPage = createOrderPage
    ? "sales-order-create"
    : createQuotePage
      ? "sales-quote-create"
      : createInvoicePage
        ? "sales-invoice-create"
        : createDeliveryPage
          ? "sales-delivery-create"
          : "";
  const [actionCustomerId, setActionCustomerId] = useState(() =>
    salesActionPage ? takeCustomerSalesAction(salesActionPage) : "",
  );
  useEffect(() => {
    if (!salesActionPage) return;
    const pendingCustomerId = takeCustomerSalesAction(salesActionPage);
    if (pendingCustomerId) setActionCustomerId(pendingCustomerId);
    const receiveCustomerAction = (event: Event) => {
      const action = (event as CustomEvent<CustomerSalesAction>).detail;
      if (!action || action.page !== salesActionPage) return;
      sessionStorage.removeItem(customerSalesActionStorageKey);
      setActionCustomerId(action.customerId);
      if (action.customer?.id === action.customerId)
        setCustomers((current) => current.some((item) => item.id === action.customerId)
          ? current
          : [...current, action.customer!]);
    };
    window.addEventListener("nexora:customer-sales-action", receiveCustomerAction);
    return () => window.removeEventListener("nexora:customer-sales-action", receiveCustomerAction);
  }, [salesActionPage]);
  const today = localDateString(),
    validDefault = localDateString(new Date(Date.now() + 14 * 86400000));
  const [quotes, setQuotes] = useState<SalesQuoteSummary[]>([]),
    [orders, setOrders] = useState<SalesOrderSummary[]>([]),
    [invoices, setInvoices] = useState<SalesInvoiceSummary[]>([]),
    [customers, setCustomers] = useState<SalesCustomer[]>([]),
    [stockItems, setStockItems] = useState<StockItem[]>([]),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    if (!actionCustomerId) return;
    try {
      const cachedCustomer = sessionStorage.getItem(customerSalesActionPrefillKey);
      if (cachedCustomer) {
        sessionStorage.removeItem(customerSalesActionPrefillKey);
        const customer = JSON.parse(cachedCustomer) as SalesCustomer;
        if (customer.id === actionCustomerId) {
          setCustomers((current) => current.some((item) => item.id === customer.id)
            ? current
            : [...current, customer]);
          return;
        }
      }
    } catch {
      sessionStorage.removeItem(customerSalesActionPrefillKey);
    }
    let active = true;
    void api<SalesCustomer>(`/api/customers/${actionCustomerId}`, token)
      .then((customer) => {
        if (!active) return;
        setCustomers((current) =>
          current.some((item) => item.id === customer.id)
            ? current
            : [...current, customer],
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [actionCustomerId, token]);
  const [salesListPage, setSalesListPage] = useState(1),
    [salesListTotal, setSalesListTotal] = useState(0);
  const [invoiceCreateOpen, setInvoiceCreateOpen] = useState(openInvoiceCreate);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("");
  const [quoteDateFrom, setQuoteDateFrom] = useState("");
  const [quoteDateTo, setQuoteDateTo] = useState("");
  const [salesGridToolsSlot, setSalesGridToolsSlot] =
    useState<HTMLDivElement | null>(null);
  // Export of the quote / order list grid: XLSX is the bar's Excel command, CSV an İşlemler item.
  const salesGridExportRef = useRef<GridExportActions | null>(null);
  const defaultOrderLayout: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Sipariş no", visible: true, position: 0 },
    { key: "quoteCode", label: "Kaynak teklif", visible: true, position: 1 },
    { key: "customerName", label: "Müşteri", visible: true, position: 2 },
    { key: "orderDate", label: "Sipariş tarihi", visible: true, position: 3 },
    { key: "lineCount", label: "Satır", visible: true, position: 4 },
    { key: "grandTotal", label: "Genel toplam", visible: true, position: 5 },
    { key: "status", label: "Durum", visible: true, position: 6 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 7,
      fixed: true,
    },
  ];
  const defaultQuoteLayout: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Teklif no", visible: true, position: 0 },
    { key: "customerName", label: "Müşteri", visible: true, position: 1 },
    { key: "salesperson", label: "Plasiyer", visible: true, position: 2 },
    { key: "salesOrderCode", label: "Sipariş no", visible: true, position: 3 },
    { key: "quoteDate", label: "Teklif tarihi", visible: true, position: 4 },
    { key: "validUntil", label: "Geçerlilik", visible: true, position: 5 },
    { key: "lineCount", label: "Satır", visible: true, position: 6 },
    { key: "grandTotal", label: "Genel toplam", visible: true, position: 7 },
    { key: "status", label: "Durum", visible: true, position: 8 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 9,
      fixed: true,
    },
  ];
  const [quoteScreenFields, setQuoteScreenFields] =
    useState(defaultQuoteLayout);
  const [orderScreenFields, setOrderScreenFields] =
    useState(defaultOrderLayout);
  const [invoiceScreenFields, setInvoiceScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >([
    { key: "code", label: "Fatura no", visible: true, position: 0 },
    { key: "deliveryCode", label: "İrsaliye", visible: true, position: 1 },
    { key: "orderCode", label: "Sipariş", visible: true, position: 2 },
    { key: "customerName", label: "Müşteri", visible: true, position: 3 },
    { key: "invoiceDate", label: "Fatura tarihi", visible: true, position: 4 },
    { key: "lineCount", label: "Satır", visible: true, position: 5 },
    { key: "grandTotal", label: "Genel toplam", visible: true, position: 6 },
    { key: "status", label: "Durum", visible: true, position: 7 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 8,
      fixed: true,
    },
  ]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [selectedSalesId, setSelectedSalesId] = useState<string | null>(null),
    // Ticked rows of the visible list page (checkbox column).
    [salesTicked, setSalesTicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<SalesQuoteDetail | null>(null),
    [quoteRevisions, setQuoteRevisions] = useState<SalesQuoteRevisionSummary[]>([]),
    [quoteDetailTab, setQuoteDetailTab] = useState<"information" | "revisions">("information"),
    [quotePrintOpen, setQuotePrintOpen] = useState(false),
    [revisesQuoteId, setRevisesQuoteId] = useState<string | null>(null),
    // Teklif bir satış talebinden hazırlanıyorsa kaynak talep; kayıtta salesRequestId olarak gönderilir.
    [sourceSalesRequest, setSourceSalesRequest] = useState<{ id: string; code: string } | null>(null),
    [editingQuoteId, setEditingQuoteId] = useState<string | null>(null),
    [orderDetail, setOrderDetail] = useState<SalesOrderDetail | null>(null),
    [invoiceId, setInvoiceId] = useState<string | null>(null),
    [directOrderCode, setDirectOrderCode] = useState(""),
    [directOrderDate, setDirectOrderDate] = useState(today),
    [directDeliveryDate, setDirectDeliveryDate] = useState(""),
    [directOrderSalespersonId, setDirectOrderSalespersonId] = useState(""),
    [directOrderFields, setDirectOrderFields] = useState<
      Record<string, string>
    >({}),
    [directOrderLines, setDirectOrderLines] = useState([
      {
        stockItemId: "",
        quantity: "1",
        unitPrice: "0",
        discountPercent: "0",
        vatPercent: "20",
        isVatIncluded: false,
        unitCode: "",
        currencyCode: "TRY",
      },
    ]);
  useEffect(() => {
    if (!detail && !orderDetail) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (quotePrintOpen) {
          setQuotePrintOpen(false);
          return;
        }
        setDetail(null);
        setOrderDetail(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detail, orderDetail, quotePrintOpen]);
  useEffect(() => {
    if (section === "sales-invoices" && initialInvoiceId) {
      setInvoiceId(initialInvoiceId);
      onInitialInvoiceOpened?.();
    }
  }, [section, initialInvoiceId]);
  useEffect(() => {
    if (section === "sales-invoices" && openInvoiceCreate)
      void prepareInvoiceCreate();
  }, [section, openInvoiceCreate]);
  useEffect(() => {
    if (section === "sales-purchase-invoices" && initialSupplier)
      onInitialSupplierOpened?.();
  }, [section, initialSupplier, onInitialSupplierOpened]);
  const activeTab =
    section === "sales-quotes"
      ? "quotes"
      : section === "sales-requests"
        ? "requests"
        : section === "sales-purchase-quotes"
          ? "purchase-quotes"
          : section === "sales-orders"
            ? "orders"
            : section === "sales-invoices"
              ? "invoices"
              : section === "sales-deliveries"
                ? "deliveries"
                : section === "sales-purchase-invoices"
                  ? "purchase-invoices"
                  : section === "sales-purchase-receipts"
                    ? "purchase-receipts"
                    : section === "sales-purchase-invoice-entry"
                      ? "purchase-invoice-entry"
                      : section === "sales-purchase-invoice-drafts"
                        ? "purchase-invoice-drafts"
                        : "purchases";
  useEffect(() => {
    setNotice("");
    setError("");
  }, [activeTab]);
  const [code, setCode] = useState(""),
    [customerId, setCustomerId] = useState(() =>
      createOrderPage || createQuotePage ? actionCustomerId : "",
    ),
    [isProspectQuote, setIsProspectQuote] = useState(false),
    [prospectCustomerName, setProspectCustomerName] = useState(""),
    [quoteDate, setQuoteDate] = useState(today),
    [validUntil, setValidUntil] = useState(validDefault),
    [currencyCode, setCurrencyCode] = useState("TRY"),
    [notes, setNotes] = useState(""),
    [deliveryTerms, setDeliveryTerms] = useState(""),
    [salespersonEmployeeId, setSalespersonEmployeeId] = useState("");
  useEffect(() => {
    if (actionCustomerId && (createOrderPage || createQuotePage))
      setCustomerId(actionCustomerId);
  }, [actionCustomerId, createOrderPage, createQuotePage]);
  useEffect(() => {
    if (!actionCustomerId || (!createOrderPage && !createQuotePage)) return;
    const customer = customers.find((item) => item.id === actionCustomerId);
    if (customer) setCurrencyCode(customer.currencyCode);
  }, [actionCustomerId, createOrderPage, createQuotePage, customers]);
  const [quoteSalespeople, setQuoteSalespeople] = useState<QuoteSalesperson[]>([]);
  const [quoteExchangeRates, setQuoteExchangeRates] = useState<SalesQuoteExchangeRates>({ baseCurrencyCode: "TRY", rates: [] });
  const [quoteExchangeRatesLoading, setQuoteExchangeRatesLoading] = useState(false);
  const [lines, setLines] = useState([
    {
      stockItemId: "",
      quantity: "1",
      unitPrice: "0",
      discountPercent: "0",
      vatPercent: "20",
      isVatIncluded: false,
      unitCode: "",
      currencyCode: "",
      exchangeRateOverride: "",
    },
  ]);
  const [quoteUnits, setQuoteUnits] = useState<
    Record<string, StockItemUnitConversion[]>
  >({});
  const [quoteStockLabels, setQuoteStockLabels] = useState<Record<string, string>>({});
  const [quoteStockTotalCount, setQuoteStockTotalCount] = useState(0);
  const [customerPickerTotalCount, setCustomerPickerTotalCount] = useState(0);
  const quoteStockBaseTotalCount = useRef(0);
  const quoteStockSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteStockSearchSequence = useRef(0);
  function searchQuoteStockItems(value: string) {
    quoteStockSearchSequence.current += 1;
    const requestSequence = quoteStockSearchSequence.current;
    if (quoteStockSearchTimer.current) clearTimeout(quoteStockSearchTimer.current);
    const query = value.trim();
    if (query.length < 2) {
      setQuoteStockTotalCount(quoteStockBaseTotalCount.current);
      return;
    }
    quoteStockSearchTimer.current = setTimeout(async () => {
      try {
        const page = await api<{ items: StockItem[]; totalCount: number }>(
          `/api/stock/items/?q=${encodeURIComponent(query)}&page=1&pageSize=50`,
          token,
        );
        if (requestSequence !== quoteStockSearchSequence.current) return;
        setQuoteStockTotalCount(page.totalCount);
        setStockItems((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          page.items.filter((item) => item.isActive).forEach((item) => byId.set(item.id, item));
          return [...byId.values()];
        });
      } catch (e) {
        if (requestSequence === quoteStockSearchSequence.current) setError((e as Error).message);
      }
    }, 300);
  }
  const [orderFieldDefinitions, setOrderFieldDefinitions] = useState<
      SalesOrderCustomFieldDefinition[]
    >([]),
    [orderFieldCatalogOpen, setOrderFieldCatalogOpen] = useState(false),
    [orderFieldBusy, setOrderFieldBusy] = useState(false),
    [orderFieldCode, setOrderFieldCode] = useState(""),
    [orderFieldLabel, setOrderFieldLabel] = useState(""),
    [orderFieldType, setOrderFieldType] =
      useState<SalesOrderCustomFieldDefinition["dataType"]>("Text"),
    [orderFieldMaxLength, setOrderFieldMaxLength] = useState("200"),
    [orderFieldRequired, setOrderFieldRequired] = useState(false);
  const [quoteFieldDefinitions, setQuoteFieldDefinitions] = useState<
      SalesQuoteCustomFieldDefinition[]
    >([]),
    [quoteFieldValues, setQuoteFieldValues] = useState<Record<string, string>>(
      {},
    ),
    [quoteFieldCatalogOpen, setQuoteFieldCatalogOpen] = useState(false),
    [quoteFieldBusy, setQuoteFieldBusy] = useState(false),
    [quoteFieldCode, setQuoteFieldCode] = useState(""),
    [quoteFieldLabel, setQuoteFieldLabel] = useState(""),
    [quoteFieldType, setQuoteFieldType] =
      useState<SalesQuoteCustomFieldDefinition["dataType"]>("Text"),
    [quoteFieldMaxLength, setQuoteFieldMaxLength] = useState("200"),
    [quoteFieldRequired, setQuoteFieldRequired] = useState(false),
    [quoteDetailValues, setQuoteDetailValues] = useState<
      Record<string, string>
    >({}),
    [quoteValueHistory, setQuoteValueHistory] = useState<
      SalesQuoteCustomFieldRevision[]
    >([]),
    [quoteValueHistoryField, setQuoteValueHistoryField] =
      useState<SalesQuoteCustomFieldDefinition | null>(null);
  // Every sales workspace tab is its own SalesPage instance (keep-alive). A write in one tab
  // (e.g. "Yeni Teklif") announces itself so the other open lists reload instead of going stale.
  const salesInstanceId = useRef(Math.random().toString(36).slice(2));
  const latestLoad = useRef<() => Promise<void>>(async () => undefined);
  const notifySalesChanged = () =>
    window.dispatchEvent(
      new CustomEvent(SALES_CHANGED_EVENT, { detail: salesInstanceId.current }),
    );
  useEffect(() => {
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === salesInstanceId.current) return;
      void latestLoad.current();
    };
    window.addEventListener(SALES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SALES_CHANGED_EVENT, onChanged);
  }, []);
  async function load(
    targetPage = salesListPage,
    query = search,
    tab = activeTab,
  ) {
    setLoading(true);
    setError("");
    try {
      if (tab === "quotes" || tab === "orders" || tab === "invoices") {
        const endpoint =
          tab === "quotes"
            ? "/api/sales/quotes/"
            : tab === "orders"
              ? "/api/sales/orders/"
              : "/api/sales/invoices/";
        const quoteFilterParams = new URLSearchParams();
        if (tab === "quotes") {
          if (quoteStatusFilter) quoteFilterParams.set("status", quoteStatusFilter);
          if (quoteDateFrom) quoteFilterParams.set("dateFrom", quoteDateFrom);
          if (quoteDateTo) quoteFilterParams.set("dateTo", quoteDateTo);
        }
        const quoteFilterQuery = quoteFilterParams.toString();
        const [page, warehouseItems, orderPage] = await Promise.all([
          api<{
            items:
              | SalesQuoteSummary[]
              | SalesOrderSummary[]
              | SalesInvoiceSummary[];
            page: number;
            totalCount: number;
          }>(
            `${endpoint}?q=${encodeURIComponent(query.trim())}&page=${targetPage}&pageSize=25${quoteFilterQuery ? `&${quoteFilterQuery}` : ""}`,
            token,
          ),
          api<Warehouse[]>("/api/warehouses/", token),
          tab === "invoices"
            ? api<{ items: SalesOrderSummary[] }>(
                "/api/sales/orders/?page=1&pageSize=100",
                token,
              )
            : Promise.resolve(null),
        ]);
        setQuotes(tab === "quotes" ? (page.items as SalesQuoteSummary[]) : []);
        setOrders(
          tab === "orders"
            ? (page.items as SalesOrderSummary[])
            : orderPage?.items || [],
        );
        setInvoices(
          tab === "invoices" ? (page.items as SalesInvoiceSummary[]) : [],
        );
        setSalesListPage(page.page);
        setSalesListTotal(page.totalCount);
        setWarehouses(warehouseItems.filter((x) => x.isActive));
        return;
      }
      if (tab === "purchases" || tab === "requests") {
        // Both tabs pick suppliers: purchase orders, and on requests the supplier quotes and the
        // request-to-order conversion (an empty list there made both impossible).
        const [supplierPage, combinedPage, warehouseItems] = await Promise.all([
          api<{ items: SalesCustomer[] }>(
            "/api/customers/?type=Supplier&status=Active&page=1&pageSize=100",
            token,
          ),
          api<{ items: SalesCustomer[] }>(
            "/api/customers/?type=Both&status=Active&page=1&pageSize=100",
            token,
          ),
          api<Warehouse[]>("/api/warehouses/", token),
        ]);
        setCustomers([...supplierPage.items, ...combinedPage.items]);
        setStockItems([]);
        setWarehouses(warehouseItems.filter((x) => x.isActive));
        return;
      }
      const [
        quotes,
        orders,
        invoices,
        customers,
        stockCatalog,
        warehouseItems,
      ] = await Promise.all([
        loadAllPages<SalesQuoteSummary>("/api/sales/quotes/", token),
        loadAllPages<SalesOrderSummary>("/api/sales/orders/", token),
        loadAllPages<SalesInvoiceSummary>("/api/sales/invoices/", token),
        loadAllPages<SalesCustomer>("/api/customers/", token),
        loadStockItemPickerPage(token),
        api<Warehouse[]>("/api/warehouses/", token),
      ]);
      setQuotes(quotes);
      setOrders(orders);
      setInvoices(invoices);
      setCustomers(customers);
      setStockItems(stockCatalog.items.filter((x) => x.isActive));
      setWarehouses(warehouseItems.filter((x) => x.isActive));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  // Only list tabs follow other tabs' writes; create pages keep their in-progress form data.
  latestLoad.current = () =>
    activeTab === "quotes" || activeTab === "orders" || activeTab === "invoices"
      ? load()
      : Promise.resolve();
  async function prepareInvoiceCreate() {
    setError("");
    try {
      if (!customers.length || !stockItems.length) {
        const [loadedCustomers, stockCatalog] = await Promise.all([
          customers.length
            ? Promise.resolve(customers)
            : loadAllPages<SalesCustomer>("/api/customers/", token),
          stockItems.length
            ? Promise.resolve(stockItems)
            : loadStockItemCatalog(token),
        ]);
        setCustomers(loadedCustomers);
        setStockItems(stockCatalog.filter((item) => item.isActive));
      }
      setInvoiceCreateOpen(true);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const salesRequestKey = useRef({ tab: activeTab, query: search, quoteStatusFilter, quoteDateFrom, quoteDateTo });
  useEffect(() => {
    const changed =
      salesRequestKey.current.tab !== activeTab ||
      salesRequestKey.current.query !== search ||
      salesRequestKey.current.quoteStatusFilter !== quoteStatusFilter ||
      salesRequestKey.current.quoteDateFrom !== quoteDateFrom ||
      salesRequestKey.current.quoteDateTo !== quoteDateTo;
    salesRequestKey.current = { tab: activeTab, query: search, quoteStatusFilter, quoteDateFrom, quoteDateTo };
    const page = changed ? 1 : salesListPage;
    if (changed && salesListPage !== 1) setSalesListPage(1);
    const delay =
      activeTab === "quotes" ||
      activeTab === "orders" ||
      activeTab === "invoices"
        ? 250
        : 0;
    const timer = window.setTimeout(() => {
      void load(page, search, activeTab);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [token, activeTab, search, salesListPage, quoteStatusFilter, quoteDateFrom, quoteDateTo]);
  useEffect(() => {
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/sales-quotes/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setQuoteScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/sales-orders/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setOrderScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/sales-invoices/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setInvoiceScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  async function openQuoteFieldCatalog() {
    setQuoteFieldBusy(true);
    setError("");
    try {
      setQuoteFieldDefinitions(
        await api<SalesQuoteCustomFieldDefinition[]>(
          "/api/sales/quotes/custom-fields",
          token,
        ),
      );
      setQuoteFieldCatalogOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoteFieldBusy(false);
    }
  }
  async function openQuoteCreatePage(navigateToPage = true) {
    setError("");
    setSourceSalesRequest(null);
    setRevisesQuoteId(null);
    setEditingQuoteId(null);
    setQuoteFieldValues({});
    setQuoteUnits({});
    setQuoteStockLabels({});
    setCustomerId("");
    setIsProspectQuote(false);
    setProspectCustomerName("");
    setCode(`T-${today.slice(0, 4)}-${String(Date.now()).slice(-4)}`);
    setQuoteDate(today);
    setValidUntil(validDefault);
    setNotes("");
    setDeliveryTerms("");
    setSalespersonEmployeeId("");
    setLines([
      {
        stockItemId: "",
        quantity: "1",
        unitPrice: "0",
        discountPercent: "0",
        vatPercent: "20",
        isVatIncluded: false,
        unitCode: "",
        currencyCode: "",
        exchangeRateOverride: "",
      },
    ]);
    setBusy(true);
    try {
      const [fields, loadedCustomers, stockCatalog, salespeople] = await Promise.all([
        api<SalesQuoteCustomFieldDefinition[]>(
          "/api/sales/quotes/custom-fields",
          token,
        ),
        customers.length
          ? Promise.resolve({ items: customers, totalCount: customerPickerTotalCount || customers.length })
          : loadCustomerPickerPage(token),
        stockItems.length
          ? Promise.resolve({ items: stockItems, totalCount: quoteStockTotalCount || stockItems.length })
          : loadStockItemPickerPage(token),
        quoteSalespeople.length ? Promise.resolve(quoteSalespeople) : api<QuoteSalesperson[]>("/api/hr/employees/", token),
      ]);
      setQuoteFieldDefinitions(fields);
      setCustomers(loadedCustomers.items);
      setCustomerPickerTotalCount(loadedCustomers.totalCount);
      setStockItems(stockCatalog.items);
      quoteStockBaseTotalCount.current = stockCatalog.totalCount;
      setQuoteStockTotalCount(stockCatalog.totalCount);
      setQuoteSalespeople(salespeople.filter((employee) => employee.status === "Active"));
      if (navigateToPage) onNavigate("sales-quote-create");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const quoteRequestPrefill = useRef(false);
  /** Satış talebinden teklif: boş teklif formunu açar, müşteriyi ve satırları talepten doldurur. */
  async function beginQuoteFromRequest(requestId: string) {
    await openQuoteCreatePage(false);
    try {
      const request = await api<{
        id: string; code: string; customerId: string; customerName: string; currencyCode: string; description: string | null;
        lines: { stockItemId: string; stockCode: string; stockName: string; unitCode: string; quantity: number }[];
      }>(`/api/sales/requests/${requestId}`, token);
      // Müşteri seçicinin ilk sayfasında olmayabilir; kartı ayrıca alınır ve listeye eklenir.
      const requestCustomer = await api<SalesCustomer>(`/api/customers/${request.customerId}`, token)
        .catch(() => ({ id: request.customerId, code: "", name: request.customerName, type: "Customer", isActive: true, currencyCode: request.currencyCode }) as SalesCustomer);
      setCustomers((current) => current.some((item) => item.id === requestCustomer.id && item.code)
        ? current
        : [requestCustomer, ...current.filter((item) => item.id !== requestCustomer.id)]);
      setCustomerId(request.customerId);
      setCurrencyCode(request.currencyCode || "TRY");
      setNotes(request.description || "");
      // Fiyat, iskonto ve KDV stok kartından gelir; kart bulunamazsa kullanıcı satırda girer.
      const cards = new Map((await loadStockItemPickerPage(token).catch(() => ({ items: [] as StockItem[] }))).items.map((item) => [item.id, item]));
      setQuoteStockLabels(Object.fromEntries(request.lines.map((line) => [line.stockItemId, `${line.stockCode} · ${line.stockName}`])));
      setLines(request.lines.map((line) => ({
        stockItemId: line.stockItemId,
        quantity: String(line.quantity),
        unitPrice: String(cards.get(line.stockItemId)?.salesListPrice ?? 0),
        discountPercent: String(cards.get(line.stockItemId)?.salesDiscountPercent ?? 0),
        vatPercent: String(cards.get(line.stockItemId)?.salesVatPercent ?? 20),
        isVatIncluded: false,
        unitCode: line.unitCode,
        currencyCode: cards.get(line.stockItemId)?.priceCurrencyCode || "",
        exchangeRateOverride: "",
      })));
      for (const line of request.lines) void loadQuoteUnits(line.stockItemId);
      setSourceSalesRequest({ id: request.id, code: request.code });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!createQuotePage) return;
    const pendingRequestId = sessionStorage.getItem("nexora.sales-quote.request-id");
    if (pendingRequestId) {
      sessionStorage.removeItem("nexora.sales-quote.request-id");
      quoteRequestPrefill.current = true;
      void beginQuoteFromRequest(pendingRequestId).finally(() => { quoteRequestPrefill.current = false; });
      return;
    }
    // Talepten ön doldurma sürerken efektin yeniden çalışması formu boşaltmamalı.
    if (quoteRequestPrefill.current) return;
    const pendingEditId = sessionStorage.getItem("nexora.sales-quote.edit-id");
    if (pendingEditId) {
      sessionStorage.removeItem("nexora.sales-quote.edit-id");
      if (pendingEditId !== editingQuoteId) void beginQuoteEdit(pendingEditId, false);
      return;
    }
    if (!revisesQuoteId && !editingQuoteId) void openQuoteCreatePage(false);
  }, [createQuotePage, token, revisesQuoteId, editingQuoteId]);
  useEffect(() => {
    if (!createQuotePage) return;
    let cancelled = false;
    setQuoteExchangeRatesLoading(true);
    api<SalesQuoteExchangeRates>(`/api/sales/quotes/exchange-rates?rateDate=${encodeURIComponent(quoteDate)}`, token)
      .then((rates) => { if (!cancelled) setQuoteExchangeRates(rates); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setQuoteExchangeRatesLoading(false); });
    return () => { cancelled = true; };
  }, [createQuotePage, quoteDate, token]);
  useEffect(() => {
    if (!createOrderPage) return;
    let cancelled = false;
    setQuoteExchangeRatesLoading(true);
    api<SalesQuoteExchangeRates>(`/api/sales/quotes/exchange-rates?rateDate=${encodeURIComponent(directOrderDate)}`, token)
      .then((rates) => { if (!cancelled) setQuoteExchangeRates(rates); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setQuoteExchangeRatesLoading(false); });
    return () => { cancelled = true; };
  }, [createOrderPage, directOrderDate, token]);
  async function loadQuoteUnits(itemId: string) {
    if (!itemId || quoteUnits[itemId]) return;
    try {
      const result = await api<{ conversions: StockItemUnitConversion[] }>(
        `/api/stock/items/${itemId}/units`,
        token,
      );
      setQuoteUnits((current) => ({
        ...current,
        [itemId]: result.conversions,
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openDirectOrderModal() {
    setError("");
    setCustomerId(actionCustomerId);
    setDirectOrderFields({});
    setDirectOrderSalespersonId("");
    setQuoteUnits({});
    setBusy(true);
    try {
      const [fields, loadedCustomers, stockCatalog, salespeople] = await Promise.all([
        api<SalesOrderCustomFieldDefinition[]>(
          "/api/sales/orders/custom-fields",
          token,
        ),
        customers.length
          ? Promise.resolve(customers)
          : loadAllPages<SalesCustomer>("/api/customers/", token),
        stockItems.length
          ? Promise.resolve(stockItems)
          : loadStockItemCatalog(token),
        quoteSalespeople.length ? Promise.resolve(quoteSalespeople) : api<QuoteSalesperson[]>("/api/hr/employees/", token),
      ]);
      setOrderFieldDefinitions(fields);
      setCustomers(loadedCustomers);
      setStockItems(stockCatalog.filter((item) => item.isActive));
      setQuoteSalespeople(salespeople.filter((employee) => employee.status === "Active"));
      setDirectOrderDate(today);
      setDirectDeliveryDate("");
      setDirectOrderLines([
        {
          stockItemId: "",
          quantity: "1",
          unitPrice: "0",
          discountPercent: "0",
          vatPercent: "20",
          isVatIncluded: false,
          unitCode: "",
          currencyCode: currencyCode || "TRY",
        },
      ]);
      setDirectOrderCode(
        `S-${today.replaceAll("-", "")}-${String(Date.now()).slice(-4)}`,
      );
      const editOrderId = sessionStorage.getItem("nexora.sales-order.edit-id");
      if (editOrderId) {
        const existing = await api<SalesOrderDetail>(`/api/sales/orders/${editOrderId}`, token);
        setDirectOrderCode(existing.code);
        setCustomerId(existing.customerId);
        setDirectOrderSalespersonId(existing.salespersonEmployeeId || "");
        setCurrencyCode(existing.currencyCode);
        setDirectOrderDate(existing.orderDate);
        setDirectDeliveryDate(existing.requestedDeliveryDate || "");
        setDirectOrderFields(Object.fromEntries((existing.customFields || []).map((field) => [field.code, field.value])));
        setDirectOrderLines(existing.lines.map((line) => ({
          stockItemId: line.stockItemId,
          quantity: String(line.quantity),
          unitPrice: String(line.enteredUnitPrice ?? line.unitPrice),
          discountPercent: String(line.discountPercent),
          vatPercent: String(line.vatPercent),
          isVatIncluded: line.isVatIncluded ?? false,
          unitCode: line.enteredUnitCode || line.unitCode,
          currencyCode: line.enteredCurrencyCode || existing.currencyCode,
        })));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (createOrderPage) void openDirectOrderModal();
  }, [actionCustomerId, createOrderPage, token]);
  function updateDirectOrderLine(
    index: number,
    key: keyof (typeof directOrderLines)[number],
    value: string | boolean,
  ) {
    setDirectOrderLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  }
  async function selectDirectOrderStock(index: number, stockItemId: string) {
    const selectedItem = stockItems.find((item) => item.id === stockItemId);
    if (!selectedItem) return;
    const previousLine = directOrderLines[index];
    const editingOrder = Boolean(sessionStorage.getItem("nexora.sales-order.edit-id"));
    const shouldRefreshPrice = !editingOrder || !previousLine?.stockItemId || previousLine.stockItemId === stockItemId || (await confirmDialog({
      title: "Satış fiyatı güncellensin mi?",
      message: `Stok kartı değişti. Tanımlı satış fiyatı ${selectedItem.salesListPrice ?? 0} ${selectedItem.priceCurrencyCode || currencyCode} olarak satıra uygulanır.`,
      tone: "default",
      confirmLabel: "Fiyatı güncelle",
      cancelLabel: "Mevcut fiyatı koru",
    }));
    void loadQuoteUnits(stockItemId);
    setDirectOrderLines((current) => current.map((line, rowIndex) => rowIndex !== index ? line : {
      ...line,
      stockItemId,
      unitCode: selectedItem.unitCode || "",
      ...(shouldRefreshPrice ? {
        unitPrice: String(selectedItem.salesListPrice ?? 0),
        currencyCode: selectedItem.priceCurrencyCode || customers.find((customer) => customer.id === customerId)?.currencyCode || "TRY",
        vatPercent: String(selectedItem.salesVatPercent ?? 20),
        discountPercent: String(selectedItem.salesDiscountPercent ?? 0),
      } : {}),
    }));
  }
  const quoteLineFxRate = (sourceCurrency: string) => {
    const source = sourceCurrency.toUpperCase();
    const target = currencyCode.toUpperCase();
    if (source === target) return 1;
    const rates = new Map(quoteExchangeRates.rates.map((item) => [item.currencyCode.toUpperCase(), item.rate]));
    const sourceRate = source === quoteExchangeRates.baseCurrencyCode ? 1 : rates.get(source);
    const targetRate = target === quoteExchangeRates.baseCurrencyCode ? 1 : rates.get(target);
    return sourceRate && targetRate ? sourceRate / targetRate : null;
  };
  const quoteLineEffectiveFxRate = (line: (typeof lines)[number]) => {
    const entered = line.currencyCode || currencyCode;
    if (entered.toUpperCase() === currencyCode.toUpperCase()) return 1;
    if (line.exchangeRateOverride.trim()) {
      const override = Number(line.exchangeRateOverride);
      return Number.isFinite(override) && override > 0 ? override : null;
    }
    const computed = quoteLineFxRate(entered);
    return computed === null ? null : Math.round(computed * 100000000) / 100000000;
  };
  const directOrderTotals = directOrderLines.reduce(
    (totals, line) => {
      const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0) * (quoteLineFxRate(line.currencyCode || currencyCode) ?? 0);
      const discount = (gross * Number(line.discountPercent || 0)) / 100;
      const net = gross - discount;
      const vatPercent = Number(line.vatPercent || 0);
      const vat = (net * vatPercent) / 100;
      return {
        subtotal: totals.subtotal + gross,
        discount: totals.discount + discount,
        vat: totals.vat + vat,
        total: totals.total + net + vat,
        taxableByRate: { ...totals.taxableByRate, [vatPercent]: (totals.taxableByRate[vatPercent] || 0) + net },
        vatByRate: { ...totals.vatByRate, [vatPercent]: (totals.vatByRate[vatPercent] || 0) + vat },
      };
    },
    { subtotal: 0, discount: 0, vat: 0, total: 0, taxableByRate: {} as Record<number, number>, vatByRate: {} as Record<number, number> },
  );
  const formatOrderMoney = (value: number) =>
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const renderOrderCurrency = (value: number, currency: string) => {
    const formatted = formatOrderMoney(Number.isFinite(value) ? value : 0);
    return (
      <output className="sales-total-amount" aria-label={`${formatted} ${currency}`}>
        <b>{formatted}</b>
        <small>{currency === "TRY" ? "TL" : currency}</small>
      </output>
    );
  };
  const quoteLineAmounts = (line: (typeof lines)[number]) => {
    const round = (value: number) => Math.round(value * 100) / 100;
    const enteredSubtotal = round(Number(line.quantity || 0) * Number(line.unitPrice || 0) * (quoteLineEffectiveFxRate(line) ?? 0));
    const vatPercent = Number(line.vatPercent || 0);
    const subtotal = line.isVatIncluded && vatPercent > 0 ? round(enteredSubtotal / (1 + vatPercent / 100)) : enteredSubtotal;
    const discount = round(subtotal * Number(line.discountPercent || 0) / 100);
    const tax = round((subtotal - discount) * vatPercent / 100);
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  };
  const quoteTotals = lines.reduce(
    (totals, line) => {
      const amount = quoteLineAmounts(line);
      const vatPercent = Number(line.vatPercent || 0);
      const taxable = amount.subtotal - amount.discount;
      return {
        subtotal: totals.subtotal + amount.subtotal,
        discount: totals.discount + amount.discount,
        tax: totals.tax + amount.tax,
        total: totals.total + amount.total,
        taxableByRate: { ...totals.taxableByRate, [vatPercent]: (totals.taxableByRate[vatPercent] || 0) + taxable },
        taxByRate: { ...totals.taxByRate, [vatPercent]: (totals.taxByRate[vatPercent] || 0) + amount.tax },
      };
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0, taxableByRate: {} as Record<number, number>, taxByRate: {} as Record<number, number> },
  );
  const hasMissingQuoteFx = lines.some((line) => quoteLineEffectiveFxRate(line) === null);
  const directOrderEditId = createOrderPage ? sessionStorage.getItem("nexora.sales-order.edit-id") : null;
  const directOrderSaveBlocked = quoteExchangeRatesLoading || directOrderLines.some((line) => quoteLineFxRate(line.currencyCode || currencyCode) === null);
  const quoteCurrencies = [...new Set([currencyCode, quoteExchangeRates.baseCurrencyCode, "TRY", "USD", "EUR", "GBP", ...quoteExchangeRates.rates.map((rate) => rate.currencyCode), ...stockItems.map((item) => item.priceCurrencyCode || "")])].filter(Boolean).sort();
  async function createDirectOrder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const customer = customers.find((x) => x.id === customerId);
    if (!customer) {
      setError("Müşteri seçin.");
      setBusy(false);
      return;
    }
    if (quoteExchangeRatesLoading || directOrderLines.some((line) => quoteLineFxRate(line.currencyCode || customer.currencyCode || "TRY") === null)) {
      setError(quoteExchangeRatesLoading ? "Sipariş tarihi için döviz kurları yükleniyor. Lütfen bekleyin." : "Seçili satır dövizlerinden sipariş dövizine çevrim için kur bulunamadı.");
      setBusy(false);
      return;
    }
    try {
      const editOrderId = sessionStorage.getItem("nexora.sales-order.edit-id");
      const created = await api<SalesOrderSummary>(
        editOrderId ? `/api/sales/orders/${editOrderId}` : "/api/sales/orders/",
        token,
        {
          method: editOrderId ? "PUT" : "POST",
          body: JSON.stringify({
            code: directOrderCode,
            customerId,
            orderDate: directOrderDate,
            requestedDeliveryDate: directDeliveryDate || null,
            currencyCode: customer.currencyCode,
            salespersonEmployeeId: directOrderSalespersonId || null,
            customFields: directOrderFields,
            lines: directOrderLines.map((x) => ({
              stockItemId: x.stockItemId,
              quantity: Number(x.quantity),
              unitPrice: Number(x.unitPrice),
              discountPercent: Number(x.discountPercent),
              vatPercent: Number(x.vatPercent),
              isVatIncluded: x.isVatIncluded,
              unitCode:
                x.unitCode ||
                stockItems.find((item) => item.id === x.stockItemId)?.unitCode,
              currencyCode: x.currencyCode || customer.currencyCode || "TRY",
            })),
          }),
        },
      );
      sessionStorage.removeItem("nexora.sales-order.edit-id");
      setCustomerId("");
      setDirectOrderFields({});
      setNotice(`${created.code} siparişi ${editOrderId ? "güncellendi" : "oluşturuldu"}.`);
      notifySalesChanged();
      onNavigate("sales-orders");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createQuoteField(e: React.FormEvent) {
    e.preventDefault();
    setQuoteFieldBusy(true);
    setError("");
    try {
      await api<SalesQuoteCustomFieldDefinition>(
        "/api/sales/quotes/custom-fields",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code: quoteFieldCode,
            label: quoteFieldLabel,
            dataType: quoteFieldType,
            maxLength: Number(quoteFieldMaxLength),
            isRequired: role === "TenantAdmin" && quoteFieldRequired,
          }),
        },
      );
      setQuoteFieldCode("");
      setQuoteFieldLabel("");
      setQuoteFieldMaxLength("200");
      setQuoteFieldRequired(false);
      setQuoteFieldDefinitions(
        await api<SalesQuoteCustomFieldDefinition[]>(
          "/api/sales/quotes/custom-fields",
          token,
        ),
      );
      setNotice("Teklif özel alanı tanımlandı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoteFieldBusy(false);
    }
  }
  async function openOrderFieldCatalog() {
    setOrderFieldBusy(true);
    setError("");
    try {
      setOrderFieldDefinitions(
        await api<SalesOrderCustomFieldDefinition[]>(
          "/api/sales/orders/custom-fields",
          token,
        ),
      );
      setOrderFieldCatalogOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOrderFieldBusy(false);
    }
  }
  async function createOrderField(e: React.FormEvent) {
    e.preventDefault();
    setOrderFieldBusy(true);
    setError("");
    try {
      await api<SalesOrderCustomFieldDefinition>(
        "/api/sales/orders/custom-fields",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code: orderFieldCode,
            label: orderFieldLabel,
            dataType: orderFieldType,
            maxLength: Number(orderFieldMaxLength),
            isRequired: role === "TenantAdmin" && orderFieldRequired,
          }),
        },
      );
      setOrderFieldCode("");
      setOrderFieldLabel("");
      setOrderFieldMaxLength("200");
      setOrderFieldRequired(false);
      setOrderFieldDefinitions(
        await api<SalesOrderCustomFieldDefinition[]>(
          "/api/sales/orders/custom-fields",
          token,
        ),
      );
      setNotice("Satış siparişi alanı tanımlandı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOrderFieldBusy(false);
    }
  }
  async function editQuoteField(field: SalesQuoteCustomFieldDefinition) {
    const label = await promptDialog({
      title: "Alan etiketi düzenlensin mi?",
      label: "Yeni alan etiketi",
      message: `${field.label} için yeni bir sürüm oluşturulur.`,
      defaultValue: field.label,
      required: true,
      tone: "default",
      confirmLabel: "Devam",
    });
    if (label === null) return;
    let maxLength = field.maxLength;
    if (field.dataType === "Text") {
      const raw = await promptDialog({
        title: "En fazla metin uzunluğu",
        label: "En fazla metin uzunluğu (1–500)",
        defaultValue: String(field.maxLength),
        required: true,
        tone: "default",
        confirmLabel: "Devam",
      });
      if (raw === null) return;
      maxLength = Number(raw);
    }
    let isRequired: boolean | undefined;
    if (role === "TenantAdmin") {
      const answer = await promptDialog({
        title: "Taslaklarda zorunlu olsun mu?",
        label: "Evet / Hayır",
        message: "Zorunlu yapmak için tüm taslak tekliflerde değer olmalıdır.",
        defaultValue: field.isRequired ? "Evet" : "Hayır",
        required: true,
        tone: "default",
        confirmLabel: "Kaydet",
      });
      if (answer === null) return;
      const normalized = answer.trim().toLocaleLowerCase("tr-TR");
      if (!["evet", "hayır", "hayir", "yes", "no"].includes(normalized)) {
        setError("Zorunluluk için Evet veya Hayır yazın.");
        return;
      }
      isRequired = normalized === "evet" || normalized === "yes";
    }
    setQuoteFieldBusy(true);
    setError("");
    try {
      await api<SalesQuoteCustomFieldDefinition>(
        `/api/sales/quotes/custom-fields/${field.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            label,
            maxLength,
            ...(isRequired === undefined ? {} : { isRequired }),
          }),
        },
      );
      setQuoteFieldDefinitions(
        await api<SalesQuoteCustomFieldDefinition[]>(
          "/api/sales/quotes/custom-fields",
          token,
        ),
      );
      setNotice("Teklif alan tanımı yeni sürüm olarak kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoteFieldBusy(false);
    }
  }
  async function deactivateQuoteField(field: SalesQuoteCustomFieldDefinition) {
    if (
      !(await confirmDialog({
        title: "Teklif alanı devre dışı bırakılsın mı?",
        message: `${field.label} yeni teklifler için devre dışı bırakılır. Mevcut teklif değerleri korunur.`,
        tone: "warning",
        confirmLabel: "Devre dışı bırak",
      }))
    )
      return;
    setQuoteFieldBusy(true);
    setError("");
    try {
      await api<void>(`/api/sales/quotes/custom-fields/${field.id}`, token, {
        method: "DELETE",
      });
      setQuoteFieldDefinitions(
        await api<SalesQuoteCustomFieldDefinition[]>(
          "/api/sales/quotes/custom-fields",
          token,
        ),
      );
      setNotice("Teklif alanı devre dışı bırakıldı; değer geçmişi korundu.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoteFieldBusy(false);
    }
  }
  function updateLine(
    index: number,
    key: keyof (typeof lines)[number],
    value: string | boolean,
  ) {
    setLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  }
  async function beginQuoteEdit(id: string, navigateToPage = true) {
    setBusy(true);
    setError("");
    try {
      const [quote, fields, loadedCustomers, stockCatalog, salespeople] = await Promise.all([
        api<SalesQuoteDetail>(`/api/sales/quotes/${id}`, token),
        api<SalesQuoteCustomFieldDefinition[]>("/api/sales/quotes/custom-fields", token),
        customers.length ? Promise.resolve({ items: customers, totalCount: customerPickerTotalCount || customers.length }) : loadCustomerPickerPage(token),
        stockItems.length ? Promise.resolve({ items: stockItems, totalCount: quoteStockTotalCount || stockItems.length }) : loadStockItemPickerPage(token),
        quoteSalespeople.length ? Promise.resolve(quoteSalespeople) : api<QuoteSalesperson[]>("/api/hr/employees/", token),
      ]);
      if (quote.status !== "Draft" || quote.hasSalesOrder) {
        setError("Yalnızca siparişe dönüşmemiş taslak teklifler düzenlenebilir.");
        return;
      }
      setCustomers(loadedCustomers.items);
      setCustomerPickerTotalCount(loadedCustomers.totalCount);
      setStockItems(stockCatalog.items);
      quoteStockBaseTotalCount.current = stockCatalog.totalCount;
      setQuoteStockTotalCount(stockCatalog.totalCount);
      setQuoteSalespeople(salespeople.filter((employee) => employee.status === "Active"));
      setQuoteStockLabels(Object.fromEntries(quote.lines.map((line) => [line.stockItemId, `${line.stockCode} · ${line.stockName}`])));
      setQuoteFieldDefinitions(fields);
      setEditingQuoteId(quote.id);
      setRevisesQuoteId(null);
      setCode(quote.code);
      setCustomerId(quote.customerId ?? "");
      setIsProspectQuote(!quote.customerId);
      setProspectCustomerName(quote.customerId ? "" : quote.customerName);
      setCurrencyCode(quote.currencyCode);
      setQuoteDate(quote.quoteDate);
      setValidUntil(quote.validUntil);
      setNotes(quote.notes || "");
      setDeliveryTerms(quote.deliveryTerms || "");
      setSalespersonEmployeeId(quote.salespersonEmployeeId || "");
      setQuoteFieldValues(Object.fromEntries((quote.customFields || []).map((field) => [field.code, field.value])));
      setLines(quote.lines.map((line) => ({
        stockItemId: line.stockItemId,
        quantity: String(line.quantity),
        unitPrice: String(line.enteredUnitPrice ?? line.unitPrice),
        discountPercent: String(line.discountPercent),
        vatPercent: String(line.vatPercent),
        isVatIncluded: line.isVatIncluded ?? false,
        unitCode: line.enteredUnitCode || line.unitCode,
        currencyCode: line.enteredCurrencyCode || quote.currencyCode,
        exchangeRateOverride: String(line.exchangeRateToQuoteCurrency ?? 1),
      })));
      setDetail(null);
      if (navigateToPage) {
        sessionStorage.setItem("nexora.sales-quote.edit-id", quote.id);
        onNavigate("sales-quote-create", "Teklif Düzenleme");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const customer = customers.find((x) => x.id === customerId);
    if ((!isProspectQuote && !customer) || (isProspectQuote && !prospectCustomerName.trim())) {
      setError(isProspectQuote ? "Teklif alıcısının adını girin." : "Müşteri seçin veya kayıtsız alıcı seçeneğini açın.");
      setBusy(false);
      return;
    }
    if (quoteExchangeRatesLoading || hasMissingQuoteFx) {
      setError(quoteExchangeRatesLoading
        ? "Teklif tarihi için döviz kurları yükleniyor. Lütfen bekleyin."
        : "Seçili satır dövizlerinden teklif dövizine çevrim için kur bulunamadı.");
      setBusy(false);
      return;
    }
    try {
      const saved = await api<SalesQuoteSummary>(
        editingQuoteId ? `/api/sales/quotes/${editingQuoteId}` : "/api/sales/quotes/",
        token,
        {
          method: editingQuoteId ? "PUT" : "POST",
          body: JSON.stringify({
            code,
            customerId: isProspectQuote ? null : customerId,
            prospectCustomerName: isProspectQuote ? prospectCustomerName.trim() : null,
            quoteDate,
            validUntil,
            currencyCode: isProspectQuote ? currencyCode : customer!.currencyCode,
            notes: notes || null,
            deliveryTerms: deliveryTerms || null,
            salespersonEmployeeId: salespersonEmployeeId || null,
            customFields: quoteFieldValues,
            revisesQuoteId,
            salesRequestId: editingQuoteId ? null : sourceSalesRequest?.id ?? null,
            lines: lines.map((x) => ({
              stockItemId: x.stockItemId,
              quantity: Number(x.quantity),
              unitPrice: Number(x.unitPrice),
              discountPercent: Number(x.discountPercent),
              vatPercent: Number(x.vatPercent),
              isVatIncluded: x.isVatIncluded,
              currencyCode: x.currencyCode || currencyCode,
              exchangeRateToQuoteCurrency: quoteLineEffectiveFxRate(x),
              unitCode:
                x.unitCode ||
                stockItems.find((item) => item.id === x.stockItemId)?.unitCode,
            })),
          }),
        },
      );
      notifySalesChanged();
      setCode("");
      setNotes("");
      setDeliveryTerms("");
      setQuoteFieldValues({});
      setRevisesQuoteId(null);
      setEditingQuoteId(null);
      setLines([
        {
          stockItemId: "",
          quantity: "1",
          unitPrice: "0",
          discountPercent: "0",
          vatPercent: "20",
          isVatIncluded: false,
          unitCode: "",
          currencyCode: "",
          exchangeRateOverride: "",
        },
      ]);
      setNotice(editingQuoteId ? "Teklif taslağı güncellendi." : "Teklif taslağı kaydedildi.");
      onNavigate("sales-quotes");
      await load();
      await openQuote(saved.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openQuote(id: string) {
    setError("");
    try {
      const [quote, revisions] = await Promise.all([
        api<SalesQuoteDetail>(`/api/sales/quotes/${id}`, token),
        api<SalesQuoteRevisionSummary[]>(`/api/sales/quotes/${id}/revisions`, token),
      ]);
      setDetail(quote);
      setQuoteRevisions(revisions);
      setQuoteDetailTab("information");
      setQuotePrintOpen(false);
      setQuoteDetailValues(
        Object.fromEntries(
          (quote.customFields || []).map((field) => [field.code, field.value]),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function beginQuoteRevision() {
    if (!detail) return;
    const source = detail;
    await openQuoteCreatePage(false);
    setCustomerId(source.customerId ?? "");
    setCurrencyCode(source.currencyCode);
    setQuoteDate(today);
    setValidUntil(source.validUntil > today ? source.validUntil : validDefault);
    setNotes(source.notes || "");
    setDeliveryTerms(source.deliveryTerms || "");
    setSalespersonEmployeeId(source.salespersonEmployeeId || "");
    setCode(`${source.code}-R${source.revisionNumber + 1}`.slice(0, 40));
    setQuoteStockLabels(Object.fromEntries(source.lines.map((line) => [line.stockItemId, `${line.stockCode} · ${line.stockName}`])));
    setLines(source.lines.map((line) => ({
      stockItemId: line.stockItemId,
      quantity: String(line.quantity),
      unitPrice: String(line.enteredUnitPrice ?? line.unitPrice),
      discountPercent: String(line.discountPercent),
      vatPercent: String(line.vatPercent),
        isVatIncluded: line.isVatIncluded ?? false,
      unitCode: line.enteredUnitCode || line.unitCode,
      currencyCode: line.enteredCurrencyCode || source.currencyCode,
      exchangeRateOverride: String(line.exchangeRateToQuoteCurrency ?? 1),
    })));
    setQuoteFieldValues(Object.fromEntries((source.customFields || []).map((field) => [field.code, field.value])));
    setRevisesQuoteId(source.id);
    setEditingQuoteId(null);
    setDetail(null);
    onNavigate("sales-quote-create");
  }
  async function saveQuoteFieldValues(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setQuoteFieldBusy(true);
    setError("");
    try {
      const values = await api<SalesQuoteCustomFieldValue[]>(
        `/api/sales/quotes/${detail.id}/custom-fields`,
        token,
        { method: "PUT", body: JSON.stringify({ values: quoteDetailValues }) },
      );
      setQuoteDetailValues(
        Object.fromEntries(values.map((field) => [field.code, field.value])),
      );
      setDetail((current) =>
        current ? { ...current, customFields: values } : current,
      );
      setNotice("Teklif özel alanları kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoteFieldBusy(false);
    }
  }
  async function loadQuoteFieldHistory(field: SalesQuoteCustomFieldDefinition) {
    if (!detail) return;
    setQuoteValueHistoryField(field);
    setQuoteValueHistory([]);
    try {
      setQuoteValueHistory(
        await api<SalesQuoteCustomFieldRevision[]>(
          `/api/sales/quotes/${detail.id}/custom-fields/${field.id}/history`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restoreQuoteFieldRevision(
    revision: SalesQuoteCustomFieldRevision,
  ) {
    if (
      !detail ||
      !quoteValueHistoryField ||
      !(await confirmDialog({
        title: "Önceki değer geri yüklensin mi?",
        message: `${quoteValueHistoryField.label} alanının önceki değeri geri yüklenir. Bu işlem yeni bir geçmiş kaydı oluşturur.`,
        tone: "warning",
        confirmLabel: "Geri yükle",
      }))
    )
      return;
    setQuoteFieldBusy(true);
    setError("");
    try {
      await api<SalesQuoteCustomFieldValue>(
        `/api/sales/quotes/${detail.id}/custom-fields/${revision.definitionId}/history/${revision.id}/restore`,
        token,
        { method: "POST", body: JSON.stringify({ confirmation: true }) },
      );
      await openQuote(detail.id);
      await loadQuoteFieldHistory(quoteValueHistoryField);
      setNotice("Teklif alan değeri geçmişten geri yüklendi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoteFieldBusy(false);
    }
  }
  async function sendQuote(item: SalesQuoteSummary) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SalesQuoteSummary>(`/api/sales/quotes/${item.id}/send`, token, {
        method: "POST",
      });
      setNotice(`${item.code} numaralı teklif iletildi durumuna alındı.`);
      notifySalesChanged();
      await load();
      // The open detail shows the status and its actions; refresh it like accept/reject do.
      if (detail?.id === item.id) await openQuote(item.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteQuote(item: SalesQuoteSummary) {
    if (
      !(await confirmDialog({
        title: "Taslak teklif silinsin mi?",
        message: `${item.code} taslak teklifi ve özel alan geçmişi silinecek.`,
        tone: "danger",
        confirmLabel: "Sil",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/sales/quotes/${item.id}`, token, { method: "DELETE" });
      setSelectedSalesId(null);
      // Deleted from its own detail: return to the list.
      setDetail((current) => (current?.id === item.id ? null : current));
      await load(salesListPage);
      setNotice(`${item.code} teklifi silindi.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decideQuote(
    item: SalesQuoteSummary,
    decision: "accept" | "reject",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SalesQuoteSummary>(
        `/api/sales/quotes/${item.id}/${decision}`,
        token,
        { method: "POST" },
      );
      setNotice(
        decision === "accept"
          ? `${item.code} teklifi kabul edildi.`
          : `${item.code} teklifi reddedildi.`,
      );
      notifySalesChanged();
      await load();
      if (detail?.id === item.id) await openQuote(item.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function convertQuote(item: SalesQuoteSummary) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SalesOrderSummary>(
        `/api/sales/quotes/${item.id}/convert-to-order`,
        token,
        { method: "POST" },
      );
      setNotice(`${item.code} teklifinden satış siparişi oluşturuldu.`);
      notifySalesChanged();
      onNavigate("sales-orders");
      await load();
      if (detail?.id === item.id) await openQuote(item.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openOrder(id: string) {
    setError("");
    try {
      setOrderDetail(
        await api<SalesOrderDetail>(`/api/sales/orders/${id}`, token),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteOrder(item: SalesOrderSummary) {
    if (
      !(await confirmDialog({
        title: "Sipariş silinsin mi?",
        message: `${item.code} siparişi ve özel alan geçmişi silinecek.`,
        tone: "danger",
        confirmLabel: "Sil",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/sales/orders/${item.id}`, token, { method: "DELETE" });
      setSelectedSalesId(null);
      await load(
        orders.length === 1 && salesListPage > 1
          ? salesListPage - 1
          : salesListPage,
      );
      setNotice(`${item.code} siparişi silindi.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openInvoice(id: string) {
    setError("");
    setInvoiceId(id);
  }
  const filtered = quotes.filter(
    (x) =>
      !search ||
      x.code.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")) ||
      x.customerName
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const filteredOrders = orders.filter(
    (x) =>
      !search ||
      `${x.code} ${x.quoteCode} ${x.customerName}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  // The quote row menu moved to İşlemler (current row) and the detail panel: no "⋯" column.
  const visibleQuoteFields = quoteScreenFields
    .filter((field) => field.key !== "revisionNumber" && field.key !== "actions" && field.visible)
    .sort((a, b) => a.position - b.position);
  const visibleOrderFields = orderScreenFields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
  function renderQuoteField(
    field: BuiltInScreenLayoutField,
    item: SalesQuoteSummary,
  ) {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-haspopup="dialog"
            aria-label={`${item.code} teklif ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedSalesId(item.id);
              void openQuote(item.id);
            }}
          >
            {item.code} ({item.revisionNumber})
          </button>
        );
      case "customerName":
        return <span className="quote-customer-cell"><b className="customer-name">{item.customerName}</b>{item.customerCode && <small className="cell-subtitle list-v2-name-code">{item.customerCode}</small>}</span>;
      case "revisionNumber":
        return item.revisionNumber;
      case "salesperson":
        return item.salespersonName || "—";
      case "salesOrderCode":
        return item.salesOrderId && item.salesOrderCode ? (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-label={`${item.salesOrderCode} sipariş ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              void openOrder(item.salesOrderId!);
            }}
          >
            {item.salesOrderCode}
          </button>
        ) : "—";
      case "quoteDate":
        return item.quoteDate.split("-").reverse().join(".");
      case "validUntil":
        return item.validUntil.split("-").reverse().join(".");
      case "lineCount":
        return item.lineCount;
      case "grandTotal":
        return listAmount(item.grandTotal, item.currencyCode);
      case "status":
        return listTag("quote", item.status);
      default:
        return null;
    }
  }
  function renderOrderField(
    field: BuiltInScreenLayoutField,
    item: SalesOrderSummary,
  ) {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-haspopup="dialog"
            aria-label={`${item.code} sipariş ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedSalesId(item.id);
              void openOrder(item.id);
            }}
          >
            {item.code}
          </button>
        );
      case "quoteCode":
        return item.quoteCode;
      case "customerName":
        return <b className="customer-name">{item.customerName}</b>;
      case "orderDate":
        return item.orderDate.split("-").reverse().join(".");
      case "lineCount":
        return item.lineCount;
      case "grandTotal":
        return listAmount(item.grandTotal, item.currencyCode);
      case "status":
        return listTag("order", item.status);
      case "actions":
        return (
          <SalesRowActionsMenu label={item.code}>
            <button role="menuitem" className="sales-row-menu-item" onClick={() => void openOrder(item.id)}>Detay</button>
            {item.status === "Open" && (
              <button role="menuitem" className="sales-row-menu-item" onClick={() => {
                sessionStorage.setItem("nexora.sales-order.edit-id", item.id);
                onNavigate("sales-order-create");
              }}>Düzenle</button>
            )}
            {role === "TenantAdmin" && (
              <button role="menuitem" className="sales-row-menu-item danger-action" disabled={busy} onClick={() => void deleteOrder(item)}>Sil</button>
            )}
          </SalesRowActionsMenu>
        );
      default:
        return null;
    }
  }
  // Action bar. SalesPage owns it on the quote and order screens and their create pages; the invoice list and
  // create page register in SalesInvoiceTable, deliveries in SalesDeliveriesScreen, and the purchase sections
  // (Task 12) not at all. An open order or invoice detail registers its own commands.
  const busyReason = busy ? "Kaydediliyor…" : undefined;
  const quoteListScreen = activeTab === "quotes" && !createQuotePage && !createOrderPage;
  const orderListScreen = activeTab === "orders" && !createQuotePage && !createOrderPage;
  const salesPageDialogOpen = quoteFieldCatalogOpen || orderFieldCatalogOpen;
  // List type (mockup 06): the current row is the one the user chose (click, ↑/↓; `selectedSalesId`), never an
  // implicit first row. Aç / Sil act on it, else on a single ticked row; the detail panel shows the current row.
  const invoiceListScreen = activeTab === "invoices" && !createQuotePage && !createOrderPage && !createInvoicePage;
  const visibleInvoices = invoices.filter(
    (x) =>
      !search ||
      `${x.code} ${x.deliveryCode} ${x.orderCode} ${x.customerName} ${x.customerTaxNumber ?? ""}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const listRows: Array<SalesQuoteSummary | SalesOrderSummary | SalesInvoiceSummary> = quoteListScreen
    ? filtered
    : orderListScreen
      ? filteredOrders
      : invoiceListScreen
        ? visibleInvoices
        : [];
  const listCurrent = listRows.find((row) => row.id === selectedSalesId);
  const listTarget = listCurrent ?? (salesTicked.length === 1 ? listRows.find((row) => row.id === salesTicked[0]) : undefined);
  const salesListActive =
    (quoteListScreen || orderListScreen || invoiceListScreen) &&
    !detail && !orderDetail && !invoiceId && !salesPageDialogOpen && !invoiceCreateOpen;
  const salesPanel = useSalesListPanel<SalesQuoteDetail | SalesOrderDetail | AppTypes.SalesInvoiceDetail>({
    active: salesListActive,
    token,
    currentId: listCurrent?.id ?? null,
    path: (id) => `/api/sales/${quoteListScreen ? "quotes" : orderListScreen ? "orders" : "invoices"}/${id}`,
    reloadKey: listCurrent ? JSON.stringify(listCurrent) : undefined,
  });
  const ownsActionBar =
    !orderDetail && !invoiceId && (createQuotePage || createOrderPage || quoteListScreen || orderListScreen);
  const salesNewCommand: CommandSpec | undefined = salesPageDialogOpen
    ? undefined
    : createQuotePage
      ? {
          run: async () => {
            const dirty = Boolean(
              editingQuoteId || revisesQuoteId || customerId || prospectCustomerName.trim() ||
                lines.some((line) => line.stockItemId),
            );
            if (await confirmStartNew(dirty)) await openQuoteCreatePage(false);
          },
        }
      : createOrderPage
        ? {
            run: async () => {
              const dirty = Boolean(directOrderEditId || customerId || directOrderLines.some((line) => line.stockItemId));
              if (!(await confirmStartNew(dirty))) return;
              sessionStorage.removeItem("nexora.sales-order.edit-id");
              await openDirectOrderModal();
            },
          }
        : quoteListScreen
          ? { primary: !detail, run: () => openQuoteCreatePage() }
          : orderListScreen
            ? { primary: true, run: () => onNavigate("sales-order-create") }
            : undefined;
  const salesCommands: PageCommands = {};
  if (salesNewCommand) salesCommands.new = salesNewCommand;
  if (quoteListScreen && detail) {
    const canDelete = detail.status === "Draft" && role === "TenantAdmin";
    const isLatestRevision = quoteRevisions[quoteRevisions.length - 1]?.id === detail.id;
    const canRevise = !detail.hasSalesOrder && isLatestRevision;
    if (role === "TenantAdmin")
      salesCommands.delete = {
        disabledReason: canDelete ? busyReason : "Yalnızca taslak teklifler silinebilir.",
        run: () => deleteQuote(detail),
      };
    salesCommands.print = { run: () => setQuotePrintOpen(true) };
    Object.assign(salesCommands, documentOpenCommands(() => openQuote(detail.id)));
    const more: MenuCommand[] = [];
    if (detail.status === "Draft" && !detail.hasSalesOrder)
      more.push({ id: "quote-edit", label: "Düzenle", disabledReason: busyReason, run: () => beginQuoteEdit(detail.id) });
    if (detail.status === "Draft")
      more.push({ id: "quote-send", label: "İletildi yap", disabledReason: busyReason, run: () => sendQuote(detail) });
    if (detail.status === "Sent") {
      more.push({ id: "quote-reject", label: "Reddet", disabledReason: busyReason, run: () => decideQuote(detail, "reject") });
      more.push({ id: "quote-accept", label: "Kabul et", disabledReason: busyReason, run: () => decideQuote(detail, "accept") });
    }
    if (detail.status === "Rejected")
      more.push({ id: "quote-accept-rejected", label: "Reddedilen teklifi kabul et", disabledReason: busyReason, run: () => decideQuote(detail, "accept") });
    if (detail.status === "Accepted" && !detail.hasSalesOrder)
      more.push({ id: "quote-convert", label: "Siparişe dönüştür", disabledReason: busyReason, run: () => convertQuote(detail) });
    if (canRevise)
      more.push({ id: "quote-revise", label: "Revizyon oluştur", disabledReason: busyReason, run: () => beginQuoteRevision() });
    salesCommands.more = more;
  } else if (quoteListScreen || orderListScreen) {
    const selectedQuote = quoteListScreen ? (listTarget as SalesQuoteSummary | undefined) : undefined;
    const selectedOrder = orderListScreen ? (listTarget as SalesOrderSummary | undefined) : undefined;
    const selectedRecord = selectedQuote ?? selectedOrder;
    salesCommands.open = {
      disabledReason: selectedRecord ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? selectedRecord?.id;
        if (!id) return;
        return quoteListScreen ? openQuote(id) : openOrder(id);
      },
    };
    if (role === "TenantAdmin")
      salesCommands.delete = {
        disabledReason: !selectedRecord
          ? "Önce bir kayıt seçin"
          : selectedQuote && selectedQuote.status !== "Draft"
            ? "Yalnızca taslak teklifler silinebilir."
            : busyReason,
        run: () => (selectedQuote ? deleteQuote(selectedQuote) : selectedOrder ? deleteOrder(selectedOrder) : undefined),
      };
    const more: MenuCommand[] = [];
    // Former row menu ("⋯") of the quote list, with its conditions; Detay is Aç, Sil is the bar's Sil.
    if (selectedQuote?.status === "Draft") {
      more.push({ id: "quote-row-edit", label: "Düzenle", disabledReason: busyReason, run: () => beginQuoteEdit(selectedQuote.id) });
      more.push({ id: "quote-row-send", label: "İletildi yap", disabledReason: busyReason, run: () => sendQuote(selectedQuote) });
    }
    if (selectedQuote?.status === "Sent") {
      more.push({ id: "quote-row-accept", label: "Kabul et", disabledReason: busyReason, run: () => decideQuote(selectedQuote, "accept") });
      more.push({ id: "quote-row-reject", label: "Reddet", disabledReason: busyReason, run: () => decideQuote(selectedQuote, "reject") });
    }
    if (selectedQuote?.status === "Accepted" && !selectedQuote.hasSalesOrder)
      more.push({ id: "quote-row-convert", label: "Sipariş oluştur", disabledReason: busyReason, run: () => convertQuote(selectedQuote) });
    if (role === "TenantAdmin" || role === "TenantDeveloper")
      more.push(
        quoteListScreen
          ? { id: "quote-fields", label: "Teklif alanları", run: () => openQuoteFieldCatalog() }
          : { id: "order-fields", label: "Sipariş alanları", run: () => openOrderFieldCatalog() },
      );
    more.push(csvExportCommand(salesGridExportRef));
    salesCommands.more = more;
  }
  // Passed to an open order / invoice detail, which owns the bar while it is open.
  const detailNewCommand = salesNewCommand ? { run: salesNewCommand.run } : undefined;
  // Summary cards: figures of the loaded page only ("bu sayfa"); the list endpoints return no totals, due dates or
  // outstanding amounts, so there is no Tahsil edilmemiş / Vadesi geçen card.
  const amountCard = (id: string, label: string, rows: Array<{ grandTotal: number; currencyCode: string }>, hint: React.ReactNode) => ({
    id,
    label,
    value: loading ? "—" : pageAmount(rows) ?? "—",
    icon: CircleDollarSign,
    hint: pageAmountHint(rows, hint),
  });
  const countValue = (count: number) => (loading ? "—" : count.toLocaleString("tr-TR"));
  let listSummary: React.ReactNode = null;
  if (quoteListScreen)
    listSummary = (
      <ListSummaryCards
        cards={[
          amountCard("quote-total", "Teklif tutarı", filtered, <span>bu sayfa · tüm durumlar</span>),
          {
            id: "quote-sent",
            label: "Yanıt bekleyen",
            value: countValue(filtered.filter((item) => item.status === "Sent").length),
            icon: Clock3,
            tone: "warn",
            hint: "bu sayfa",
            // The list's existing status filter (İletildi).
            filterActive: quoteStatusFilter === "Sent",
            onFilter: () => setQuoteStatusFilter((value) => (value === "Sent" ? "" : "Sent")),
          },
        ]}
      />
    );
  else if (orderListScreen)
    listSummary = (
      <ListSummaryCards
        cards={[
          amountCard(
            "order-total",
            "Sipariş tutarı",
            filteredOrders.filter((item) => item.status !== "Cancelled"),
            <span>bu sayfa · iptaller hariç</span>,
          ),
          {
            id: "order-open",
            label: "Sevk bekleyen",
            value: countValue(filteredOrders.filter((item) => item.status === "Open").length),
            icon: Truck,
            tone: "warn",
            hint: "bu sayfa",
          },
        ]}
      />
    );
  else if (invoiceListScreen) {
    const posted = visibleInvoices.filter((item) => item.status === "Posted");
    listSummary = (
      <ListSummaryCards
        cards={[
          {
            ...amountCard(
              "invoice-posted",
              "Kesilen",
              posted,
              <>
                <span>{posted.length.toLocaleString("tr-TR")}</span> <span>fatura · bu sayfa</span>
              </>,
            ),
            tone: "ok",
          },
          {
            id: "invoice-voided",
            label: "İptal",
            value: countValue(visibleInvoices.filter((item) => item.status === "Voided").length),
            icon: CircleSlash,
            hint: "bu sayfa",
          },
        ]}
      />
    );
  }
  const salesPanelOpen = salesPanel.open && salesListActive;
  const panelControls = {
    error: salesPanel.error,
    onClose: salesPanel.close,
    takeFocus: salesPanel.takeFocus,
    openDisabled: busy,
  };
  let salesListPanel: React.ReactNode = null;
  if (salesPanelOpen) {
    if (quoteListScreen)
      salesListPanel = listCurrent ? (
        <QuoteListPanel
          {...panelControls}
          row={listCurrent as SalesQuoteSummary}
          detail={salesPanel.detail as SalesQuoteDetail | null}
          onOpen={() => void openQuote(listCurrent.id)}
        />
      ) : (
        <SalesListPanelEmpty kind="quote" />
      );
    else if (orderListScreen)
      salesListPanel = listCurrent ? (
        <OrderListPanel
          {...panelControls}
          row={listCurrent as SalesOrderSummary}
          detail={salesPanel.detail as SalesOrderDetail | null}
          onOpen={() => void openOrder(listCurrent.id)}
        />
      ) : (
        <SalesListPanelEmpty kind="order" />
      );
    else if (invoiceListScreen)
      salesListPanel = listCurrent ? (
        <InvoiceListPanel
          {...panelControls}
          row={listCurrent as SalesInvoiceSummary}
          detail={salesPanel.detail as AppTypes.SalesInvoiceDetail | null}
          onOpen={() => void openInvoice(listCurrent.id)}
        />
      ) : (
        <SalesListPanelEmpty kind="invoice" />
      );
  }
  const salesListFooter = (
    <SalesListFooter
      ticked={salesTicked.length}
      shown={listRows.length}
      total={salesListTotal}
      page={salesListPage}
      loading={loading}
      onPageChange={setSalesListPage}
    />
  );
  const salesBulkActions: BulkAction[] = [
    { id: "export-selected", label: "Excel (seçilenler)", run: () => void salesGridExportRef.current?.exportExcel() },
  ];
  const salesGridSelection = {
    currentId: selectedSalesId,
    onCurrentChange: setSelectedSalesId,
    onTickedChange: setSalesTicked,
    // Only while the list is on screen: a document or form over it must not show the floating bar.
    bulkActions: salesListActive ? salesBulkActions : undefined,
    onOpen: (id: string) => void (quoteListScreen ? openQuote(id) : openOrder(id)),
  };
  const salesListBodyClass = `sales-list-body${salesListPanel ? " has-detail" : ""}`;
  return (
    <div className="list-v2 sales-lv2-root">
      {ownsActionBar && <PageCommandsSlot commands={salesCommands} />}
      {!createOrderPage && !createQuotePage &&
        activeTab !== "purchases" &&
        activeTab !== "requests" &&
        activeTab !== "purchase-quotes" &&
        activeTab !== "purchase-invoices" &&
        activeTab !== "purchase-receipts" &&
        activeTab !== "purchase-invoice-entry" &&
        activeTab !== "purchase-invoice-drafts" &&
        activeTab !== "deliveries" && !createInvoicePage && (
          <div className="sales-lv2-stack">
            <ListPageHeader
              className="customer-heading"
              title={
                activeTab === "quotes"
                  ? "Satış Teklifleri"
                  : activeTab === "orders"
                    ? "Satış Siparişleri"
                    : "Satış Faturaları"
              }
              description={
                activeTab === "quotes"
                  ? "Müşteri taleplerini iskonto ve KDV hesaplarıyla teklif taslağına dönüştürün."
                  : activeTab === "orders"
                    ? "Bağımsız veya kabul edilen tekliflerden oluşan siparişleri ve sevkiyat süreçlerini yönetin."
                    : "Kesilen satış faturalarını ve cari borç kayıtlarını izleyin."
              }
              count={salesListTotal}
            />
            {listSummary}
            <SalesListToolbar
              activeTab={activeTab as "quotes" | "orders" | "invoices"}
              search={search}
              onSearchChange={setSearch}
              quoteStatus={quoteStatusFilter}
              onQuoteStatusChange={setQuoteStatusFilter}
              quoteDateFrom={quoteDateFrom}
              onQuoteDateFromChange={setQuoteDateFrom}
              quoteDateTo={quoteDateTo}
              onQuoteDateToChange={setQuoteDateTo}
              toolsSlotRef={setSalesGridToolsSlot}
              onRefresh={() => void load()}
              extra={<SalesListPanelToggle open={salesPanel.open} onToggle={salesPanel.toggle} />}
            />
          </div>
        )}
      {error && !createInvoicePage && !createOrderPage && !createQuotePage && (
        <div className="alert inline-alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && !createInvoicePage && !createOrderPage && !createQuotePage && (
        <div className="notice">
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {!createOrderPage && !createQuotePage &&
        (activeTab === "purchase-quotes" ? (
          <PurchaseSupplierQuotesPage
            token={token}
            role={role}
            onOpenRequests={() => onNavigate("sales-requests")}
          />
        ) : activeTab === "purchase-invoice-drafts" ? (
          <StandaloneSupplierInvoiceDraftPage token={token} role={role} />
        ) : activeTab === "purchase-invoice-entry" ? (
          <PurchaseInvoiceEntryPage
            token={token}
            role={role}
            onInvoiceCreated={() => onNavigate("sales-purchase-invoices")}
          />
        ) : activeTab === "purchases" && createPurchaseOrderPage ? (
          <PurchaseOrderCreatePage
            token={token}
            customers={customers}
            warehouses={warehouses}
            onNavigate={onNavigate}
          />
        ) : activeTab === "purchases" || activeTab === "requests" ? (
          <PurchasingPanel
            token={token}
            role={role}
            customers={customers}
            stockItems={stockItems}
            warehouses={warehouses}
            mode={activeTab === "requests" ? "requests" : "purchasing"}
            onNavigate={onNavigate}
          />
        ) : activeTab === "purchase-invoices" ? (
          <PurchaseInvoicesScreen
            token={token}
            initialSupplier={initialSupplier}
            onInitialSupplierOpened={onInitialSupplierOpened}
            onNavigate={onNavigate}
          />
        ) : activeTab === "purchase-receipts" ? (
          <PurchaseReceiptsScreen
            token={token}
            role={role}
            warehouses={warehouses}
            customers={customers}
            stockItems={stockItems}
          />
        ) : activeTab === "deliveries" ? (
          <SalesDeliveriesScreen
            token={token}
            role={role}
            warehouses={warehouses}
            customers={customers}
            stockItems={stockItems}
            initialCreate={createDeliveryPage}
            initialCustomerId={actionCustomerId}
          />
        ) : activeTab === "invoices" ? (
          <SalesInvoiceTable
            invoices={visibleInvoices}
            orders={orders}
            customers={customers}
            stockItems={stockItems}
            warehouses={warehouses}
            onOpen={openInvoice}
            onSelect={setSelectedSalesId}
            selectedId={selectedSalesId}
            ticked={salesTicked}
            onTickedChange={setSalesTicked}
            listFooter={salesListFooter}
            listPanel={salesListPanel}
            listBodyRef={salesPanel.rootRef}
            listBodyClass={salesListBodyClass}
            search={search}
            fields={invoiceScreenFields}
            toolbarContainer={salesGridToolsSlot}
            token={token}
            role={role}
            createOpen={invoiceCreateOpen}
            entryPage={createInvoicePage}
            createFromOrder={true}
            initialCustomerId={createInvoicePage ? actionCustomerId : ""}
            setCreateOpen={(open) =>
              open
                ? void prepareInvoiceCreate()
                : createInvoicePage
                  ? onNavigate("sales-invoices")
                  : setInvoiceCreateOpen(false)
            }
            onInvoiceCreated={async (id) => {
              await load();
              if (createInvoicePage) {
                onNavigate("sales-invoices");
              } else {
                openInvoice(id);
              }
            }}
            onChanged={() => load()}
            onNew={() => onNavigate("sales-invoice-create")}
            commandsSuspended={!!invoiceId || !!orderDetail}
          />
        ) : activeTab === "quotes" ? (
          <div ref={salesPanel.rootRef} className={salesListBodyClass}>
            <section
              className="sales-document-list-card list-v2-list"
              aria-label="Satış teklifi listesi"
            >
              <SalesDocumentGrid
                gridId="sales-quotes"
                hideExport
                exportActionsRef={salesGridExportRef}
                fields={visibleQuoteFields}
                items={filtered}
                loading={loading}
                loadingMessage="Teklifler yükleniyor…"
                emptyMessage="Henüz satış teklifi yok."
                search={search}
                searchEmptyMessage="Aramanızla eşleşen teklif yok."
                toolbarContainer={salesGridToolsSlot}
                renderCell={renderQuoteField}
                selection={salesGridSelection}
                footer={salesListFooter}
                columnWidths={QUOTE_LIST_WIDTHS}
                numberFields={SALES_NUMBER_FIELDS}
                codeFields={SALES_CODE_FIELDS}
              />
            </section>
            {salesListPanel}
          </div>
        ) : (
          <div ref={salesPanel.rootRef} className={salesListBodyClass}>
            <section
              className="sales-document-list-card list-v2-list"
              aria-label="Satış siparişi listesi"
            >
              <SalesDocumentGrid
                gridId="sales-orders"
                hideExport
                exportActionsRef={salesGridExportRef}
                fields={visibleOrderFields}
                items={filteredOrders}
                loading={loading}
                loadingMessage="Siparişler yükleniyor…"
                emptyMessage="Henüz satış siparişi yok. Yeni sipariş oluşturabilir veya kabul edilen bir teklifi dönüştürebilirsiniz."
                search={search}
                searchEmptyMessage="Aramanızla eşleşen sipariş yok."
                toolbarContainer={salesGridToolsSlot}
                renderCell={renderOrderField}
                selection={salesGridSelection}
                footer={salesListFooter}
                columnWidths={ORDER_LIST_WIDTHS}
                numberFields={SALES_NUMBER_FIELDS}
                codeFields={SALES_CODE_FIELDS}
              />
            </section>
            {salesListPanel}
          </div>
        ))}
      {quoteFieldCatalogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !quoteFieldBusy)
              setQuoteFieldCatalogOpen(false);
          }}
        >
          <div className="modal quote-field-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="sales-quote-fields-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">SATIŞ YÖNETİMİ · TENANT ALANLARI</p>
                <h2 id="sales-quote-fields-title">Teklif özel alanları</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setQuoteFieldCatalogOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <p className="muted">
              Taslak tekliflerde alan değerleri güncellenebilir; teklif
              iletildikten sonra alanlar sabitlenir.
            </p>
            <div className="requests-list">
              {quoteFieldDefinitions.map((field) => (
                <article className="request-row" key={field.id}>
                  <div className="request-info">
                    <b>{field.label}</b>
                    <small>
                      {field.code} · {field.dataType}
                      {field.dataType === "Text"
                        ? ` · en fazla ${field.maxLength} karakter`
                        : ""}
                      {field.isRequired ? " · zorunlu" : ""} · v{field.version}
                    </small>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="row-action"
                      disabled={quoteFieldBusy}
                      onClick={() => void editQuoteField(field)}
                    >
                      Tanımı düzenle
                    </button>{" "}
                    {role === "TenantAdmin" && (
                      <button
                        type="button"
                        className="row-action danger-action"
                        disabled={quoteFieldBusy}
                        onClick={() => void deactivateQuoteField(field)}
                      >
                        Devre dışı bırak
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {quoteFieldDefinitions.length === 0 && (
                <div className="empty-small">
                  Henüz teklif alanı tanımlanmadı.
                </div>
              )}
            </div>
            {(role === "TenantAdmin" || role === "TenantDeveloper") && (
              <form
                onSubmit={createQuoteField}
                className="panel"
                style={{ marginTop: 14 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>Yeni teklif alanı</b>
                    <small>Tenant içinde benzersiz kod.</small>
                  </div>
                </div>
                <div className="form-two">
                  <label>
                    Alan kodu
                    <input
                      value={quoteFieldCode}
                      onChange={(e) =>
                        setQuoteFieldCode(e.target.value.toUpperCase())
                      }
                      required
                      maxLength={40}
                    />
                  </label>
                  <label>
                    Ekran etiketi
                    <input
                      value={quoteFieldLabel}
                      onChange={(e) => setQuoteFieldLabel(e.target.value)}
                      required
                      maxLength={120}
                    />
                  </label>
                </div>
                <div className="form-two">
                  <label>
                    Veri türü
                    <select
                      value={quoteFieldType}
                      onChange={(e) =>
                        setQuoteFieldType(
                          e.target
                            .value as SalesQuoteCustomFieldDefinition["dataType"],
                        )
                      }
                    >
                      <option value="Text">Metin</option>
                      <option value="Decimal">Ondalık sayı</option>
                      <option value="Date">Tarih</option>
                      <option value="Boolean">Evet/Hayır</option>
                    </select>
                  </label>
                  {quoteFieldType === "Text" && (
                    <label>
                      En fazla karakter
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={quoteFieldMaxLength}
                        onChange={(e) => setQuoteFieldMaxLength(e.target.value)}
                        required
                      />
                    </label>
                  )}
                </div>
                {role === "TenantAdmin" ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={quoteFieldRequired}
                      onChange={(e) => setQuoteFieldRequired(e.target.checked)}
                    />{" "}
                    Bu alanı zorunlu yap
                  </label>
                ) : (
                  <p className="muted">Geliştirici alanları isteğe bağlıdır.</p>
                )}
                <div className="modal-foot">
                  <span>Mevcut taslak teklifleri önce doldurun.</span>
                  <button className="secondary" disabled={quoteFieldBusy}>
                    Alan tanımı ekle
                  </button>
                </div>
              </form>
            )}
            <div className="modal-foot">
              <span>Alan değişiklikleri sürüm geçmişinde tutulur.</span>
              <button
                className="secondary"
                onClick={() => setQuoteFieldCatalogOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}{" "}
      {orderFieldCatalogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !orderFieldBusy)
              setOrderFieldCatalogOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sales-order-fields-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">SATIŞ · SİPARİŞ ALANLARI</p>
                <h2 id="sales-order-fields-title">Sipariş alan tanımları</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setOrderFieldCatalogOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <p className="muted">
              Tekliften aynı kodla eşleşen değerler siparişe taşınır. Sipariş
              açıkken değerler düzenlenebilir.
            </p>
            <div className="requests-list">
              {orderFieldDefinitions.map((field) => (
                <article className="request-row" key={field.id}>
                  <div className="request-info">
                    <b>{field.label}</b>
                    <small>
                      {field.code} · {field.dataType}
                      {field.isRequired ? " · zorunlu" : ""} · v{field.version}
                    </small>
                  </div>
                </article>
              ))}
              {orderFieldDefinitions.length === 0 && (
                <div className="empty-small">Henüz sipariş alanı yok.</div>
              )}
            </div>
            {(role === "TenantAdmin" || role === "TenantDeveloper") && (
              <form
                onSubmit={createOrderField}
                className="panel"
                style={{ marginTop: 14 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>Yeni sipariş alanı</b>
                    <small>
                      Tekliften değer taşımak için alan kodunu eşleştirin.
                    </small>
                  </div>
                </div>
                <div className="form-two">
                  <label>
                    Alan kodu
                    <input
                      value={orderFieldCode}
                      onChange={(e) =>
                        setOrderFieldCode(e.target.value.toUpperCase())
                      }
                      required
                      maxLength={40}
                    />
                  </label>
                  <label>
                    Ekran etiketi
                    <input
                      value={orderFieldLabel}
                      onChange={(e) => setOrderFieldLabel(e.target.value)}
                      required
                      maxLength={120}
                    />
                  </label>
                </div>
                <div className="form-two">
                  <label>
                    Veri türü
                    <select
                      value={orderFieldType}
                      onChange={(e) =>
                        setOrderFieldType(
                          e.target
                            .value as SalesOrderCustomFieldDefinition["dataType"],
                        )
                      }
                    >
                      <option value="Text">Metin</option>
                      <option value="Decimal">Ondalık sayı</option>
                      <option value="Date">Tarih</option>
                      <option value="Boolean">Evet/Hayır</option>
                    </select>
                  </label>
                  {orderFieldType === "Text" && (
                    <label>
                      En fazla karakter
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={orderFieldMaxLength}
                        onChange={(e) => setOrderFieldMaxLength(e.target.value)}
                        required
                      />
                    </label>
                  )}
                </div>
                {role === "TenantAdmin" ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={orderFieldRequired}
                      onChange={(e) => setOrderFieldRequired(e.target.checked)}
                    />{" "}
                    Bu alanı zorunlu yap
                  </label>
                ) : (
                  <p className="muted">Geliştirici alanları isteğe bağlıdır.</p>
                )}
                <div className="modal-foot">
                  <span>Açık sipariş varsa önce değerleri tamamlayın.</span>
                  <button className="secondary" disabled={orderFieldBusy}>
                    Alan tanımı ekle
                  </button>
                </div>
              </form>
            )}
            <div className="modal-foot">
              <button
                className="secondary"
                onClick={() => setOrderFieldCatalogOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}{" "}
      {createOrderPage && (
          <RecordFormPage
            className="sales-rf"
            document={{
              type: "Satış siparişi",
              code: directOrderCode.trim() || undefined,
              party: customers.find((x) => x.id === customerId)?.name,
              // A new order is Açık only once saved; an edited order already is.
              statusFlow: <SalesOrderFlow status={directOrderEditId ? "Open" : undefined} />,
              hints: SALES_FORM_HINTS,
            }}
            title={directOrderEditId ? "Sipariş Düzenleme" : "Yeni Sipariş"}
            mode={directOrderEditId ? "edit" : "create"}
            busy={busy}
            saveLabel={directOrderEditId ? "Siparişi kaydet" : "Sipariş oluştur"}
            formId="sales-direct-order-form"
            saveDisabledReason={
              quoteExchangeRatesLoading
                ? "Döviz kurları yükleniyor…"
                : directOrderSaveBlocked
                  ? "Kuru bulunmayan satır var; sipariş kaydedilemez."
                  : undefined
            }
            onSubmit={(event) => {
              // The old save button was disabled while rates load or a line has no rate.
              if (directOrderSaveBlocked) {
                event.preventDefault();
                return;
              }
              void createDirectOrder(event);
            }}
            onCancel={() => onNavigate("sales-orders")}
            error={error}
            onDismissError={() => setError("")}
            status={
              <>
                <span>Müşteri, teslim tarihi ve sipariş satırlarını düzenleyin.</span>
                {quoteExchangeRatesLoading && <span className="rf-status-warning">Döviz kurları yükleniyor…</span>}
                {!quoteExchangeRatesLoading && directOrderSaveBlocked && <span className="rf-status-warning">Kuru bulunmayan satır var; sipariş kaydedilemez.</span>}
                {notice && <span className="rf-status-notice">{notice}</span>}
                <span className="rf-status-end">Satır: <b>{directOrderLines.length}</b></span>
              </>
            }
          >
            <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
                <label>
                  <span>Sipariş no <RequiredMark /></span>
                  <input
                    className="rf-must rf-mono"
                    value={directOrderCode}
                    onChange={(e) => setDirectOrderCode(e.target.value)}
                    required
                    maxLength={40}
                  />
                </label>
                <label>
                  Müşteri
                  <SalesCustomerPopupSelect
                    customers={customers}
                    selectedId={customerId}
                    totalCount={customerPickerTotalCount || customers.length}
                    token={token}
                    onSearchResults={(results) => setCustomers((current) => {
                      const byId = new Map(current.map((customer) => [customer.id, customer]));
                      results.forEach((customer) => byId.set(customer.id, customer));
                      return [...byId.values()];
                    })}
                    onSelect={(customer) => {
                      setCustomerId(customer.id);
                      setCurrencyCode(customer.currencyCode || "TRY");
                    }}
                  />
                </label>
                <label>
                  <span>Sipariş tarihi <RequiredMark /></span>
                  <input
                    type="date"
                    value={directOrderDate}
                    onChange={(e) => setDirectOrderDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  İstenen teslim tarihi
                  <input
                    type="date"
                    min={directOrderDate}
                    value={directDeliveryDate}
                    onChange={(e) => setDirectDeliveryDate(e.target.value)}
                  />
                </label>
                <label>
                  Plasiyer
                  <SearchableRecordPicker
                    options={quoteSalespeople.map((employee) => ({
                      id: employee.id,
                      label: `${employee.personnelCode} · ${employee.fullName}`,
                      searchText: `${employee.personnelCode} ${employee.fullName}`,
                    }))}
                    selectedId={directOrderSalespersonId}
                    onSelect={setDirectOrderSalespersonId}
                    title="Plasiyer seçin"
                    placeholder="Plasiyer seçin (isteğe bağlı)"
                    searchPlaceholder="Personel kodu veya adıyla ara"
                    emptyMessage="Aramanızla eşleşen plasiyer bulunamadı."
                    clearable
                    clearLabel="Plasiyer seçimini kaldır"
                  />
                </label>
            </RecordFormGroup>
            <SalesFormLines
              label="Sipariş satırları"
              lines={directOrderLines.length}
              extra={customers.find((x) => x.id === customerId)?.currencyCode || undefined}
              totals={salesFormTotalRows(directOrderTotals, (value) => renderOrderCurrency(value, customers.find((x) => x.id === customerId)?.currencyCode || "TRY"))}
              totalsLabel="Sipariş toplamları"
            >
                <table className="dd-lines">
                  <thead><tr><th className="dd-ix">#</th><th>Stok kartı</th><th className="dd-num">Miktar</th><th>Birim</th><th className="dd-num">Birim fiyat</th><th>Döviz</th><th className="dd-num">Kur</th><th className="dd-num">İskonto %</th><th className="dd-num">KDV %</th><th>KDV türü</th><th className="dd-num">Ara toplam</th><th className="dd-num">İskonto</th><th className="dd-num">KDV tutarı</th><th className="dd-num">Satır toplamı</th></tr></thead>
                  <tbody>
                    {directOrderLines.map((line, index) => {
                      const itemUnit = stockItems.find((item) => item.id === line.stockItemId)?.unitCode || "";
                      const lineCurrency = line.currencyCode || currencyCode || "TRY";
                      const fxRate = quoteLineFxRate(lineCurrency);
                      const enteredSubtotal = Number(line.quantity || 0) * Number(line.unitPrice || 0) * (fxRate ?? 0);
                      const subtotal = line.isVatIncluded && Number(line.vatPercent) > 0 ? enteredSubtotal / (1 + Number(line.vatPercent) / 100) : enteredSubtotal;
                      const discount = subtotal * Number(line.discountPercent || 0) / 100;
                      const tax = (subtotal - discount) * Number(line.vatPercent || 0) / 100;
                      return <tr key={index}>
                        <td className="dd-ix"><span>{index + 1}</span><button type="button" className="dd-line-remove" aria-label={`Satır ${index + 1} kaldır`} title="Satırı kaldır" onClick={() => setDirectOrderLines((current) => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [{ stockItemId: "", quantity: "1", unitPrice: "0", discountPercent: "0", vatPercent: "20", isVatIncluded: false, unitCode: "", currencyCode: currencyCode || "TRY" }])}>×</button></td>
                        <td className="dd-stock-cell"><SearchableRecordPicker options={stockItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}`, description: item.unitCode, searchText: item.unitCode }))} selectedId={line.stockItemId} onSelect={(id) => void selectDirectOrderStock(index, id)} title="Stok kartı seçin" placeholder="Stok seçin" searchPlaceholder="Stok kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen stok kartı bulunamadı." required /></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} miktar`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateDirectOrderLine(index, "quantity", event.target.value)} required /></td>
                        <td><select aria-label={`Satır ${index + 1} birim`} value={line.unitCode || itemUnit} onChange={(event) => updateDirectOrderLine(index, "unitCode", event.target.value)} required><option value={itemUnit || line.unitCode}>{itemUnit || line.unitCode || "Temel birim"}</option>{(quoteUnits[line.stockItemId] || []).filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.unitCode}>{unit.unitCode} (×{unit.factorToBase})</option>)}</select></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} birim fiyat`} type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(event) => updateDirectOrderLine(index, "unitPrice", event.target.value)} required /></td>
                        <td><select aria-label={`Satır ${index + 1} para birimi`} value={lineCurrency} onChange={(event) => updateDirectOrderLine(index, "currencyCode", event.target.value)}>{quoteCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} döviz kuru`} value={fxRate === null ? "Kur yok" : formatOrderMoney(fxRate)} disabled /></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} iskonto yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => updateDirectOrderLine(index, "discountPercent", event.target.value)} required /></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} KDV yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.vatPercent} onChange={(event) => updateDirectOrderLine(index, "vatPercent", event.target.value)} required /></td>
                        <td><select aria-label={`Satır ${index + 1} KDV dahil veya hariç`} value={line.isVatIncluded ? "included" : "excluded"} onChange={(event) => updateDirectOrderLine(index, "isVatIncluded", event.target.value === "included")}><option value="excluded">KDV hariç</option><option value="included">KDV dâhil</option></select></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} ara toplam`} value={formatOrderMoney(subtotal)} disabled /></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} iskonto tutarı`} value={formatOrderMoney(discount)} disabled /></td>
                        <td className="dd-num"><input aria-label={`Satır ${index + 1} KDV tutarı`} value={formatOrderMoney(tax)} disabled /></td>
                        <td className="dd-num dd-total"><input aria-label={`Satır ${index + 1} satır toplamı`} value={formatOrderMoney(subtotal - discount + tax)} disabled /></td>
                      </tr>;
                    })}
                    <tr className="dd-new-line"><td colSpan={14}><button type="button" data-line-add-shortcut title="Ctrl+Shift+Enter ile satır ekle" onClick={() => setDirectOrderLines((current) => [...current, { stockItemId: "", quantity: "1", unitPrice: "0", discountPercent: "0", vatPercent: "20", isVatIncluded: false, unitCode: "", currencyCode: currencyCode || "TRY" }])}><LineAddLabel /></button></td></tr>
                  </tbody>
                </table>
            </SalesFormLines>
              {orderFieldDefinitions.length > 0 && (
                <RecordFormGroup title="Sipariş Özel Alanları">
                  <small>Tenant alan tanımlarına göre doğrulanır.</small>
                  <div className="rf-custom-grid">
                    {orderFieldDefinitions.map((field) => (
                      <label key={field.id}>
                        <span>
                          {field.label}
                          {field.isRequired && <RequiredMark />}
                        </span>
                        <small>
                          {field.code} · {field.dataType}
                        </small>
                        {field.dataType === "Boolean" ? (
                          <select
                            required={field.isRequired}
                            value={directOrderFields[field.code] || ""}
                            onChange={(e) =>
                              setDirectOrderFields((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Seçin</option>
                            <option value="true">Evet</option>
                            <option value="false">Hayır</option>
                          </select>
                        ) : (
                          <input
                            type={
                              field.dataType === "Decimal"
                                ? "number"
                                : field.dataType === "Date"
                                  ? "date"
                                  : "text"
                            }
                            step={
                              field.dataType === "Decimal" ? "any" : undefined
                            }
                            maxLength={
                              field.dataType === "Text"
                                ? field.maxLength
                                : undefined
                            }
                            required={field.isRequired}
                            value={directOrderFields[field.code] || ""}
                            onChange={(e) =>
                              setDirectOrderFields((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </RecordFormGroup>
              )}
          </RecordFormPage>
      )}
      {createQuotePage && (
          <RecordFormPage
            className="sales-rf"
            document={{
              type: "Satış teklifi",
              code: code.trim() || undefined,
              party: isProspectQuote ? prospectCustomerName.trim() : customers.find((x) => x.id === customerId)?.name,
              statusFlow: <SalesQuoteFlow status="Draft" />,
              hints: SALES_FORM_HINTS,
            }}
            aside={
              sourceSalesRequest ? (
                <DetailContext title="Belge zinciri">
                  <DetailChain
                    items={[
                      { key: "request", code: sourceSalesRequest.code, label: "Satış talebi" },
                      { key: "self", code: code.trim() || undefined, label: "Bu teklif", kind: "Satış teklifi", current: true },
                    ]}
                  />
                </DetailContext>
              ) : undefined
            }
            title={editingQuoteId ? "Teklif Düzenleme" : revisesQuoteId ? "Teklif Revizyonu" : "Yeni Teklif"}
            mode={editingQuoteId ? "edit" : "create"}
            busy={busy}
            saveLabel={editingQuoteId ? "Değişiklikleri kaydet" : revisesQuoteId ? "Revizyon taslağını oluştur" : "Teklif taslağı oluştur"}
            formId="sales-quote-create-form"
            saveDisabledReason={
              quoteExchangeRatesLoading
                ? "Döviz kurları yükleniyor…"
                : hasMissingQuoteFx
                  ? "Kuru bulunmayan satır var; teklif kaydedilemez."
                  : undefined
            }
            onSubmit={(event) => {
              // The old save button was disabled while rates load or a line has no rate.
              if (quoteExchangeRatesLoading || hasMissingQuoteFx) {
                event.preventDefault();
                return;
              }
              void createQuote(event);
            }}
            onCancel={() => onNavigate("sales-quotes")}
            error={error}
            onDismissError={() => setError("")}
            status={
              <>
                <span>{editingQuoteId ? "Taslak teklif bilgilerini ve satırlarını güncelleyin." : revisesQuoteId ? "Önceki teklif korunur; değişiklikler yeni revizyon taslağı olarak kaydedilir." : "Müşteri ve teklif satırlarını girerek yeni bir satış teklifi oluşturun."}</span>
                {quoteExchangeRatesLoading && <span className="rf-status-warning">Döviz kurları yükleniyor…</span>}
                {!quoteExchangeRatesLoading && hasMissingQuoteFx && <span className="rf-status-warning">Kuru bulunmayan satır var; teklif kaydedilemez.</span>}
                {sourceSalesRequest && <span className="rf-status-notice"><span>Kaynak talep:</span> <b>{sourceSalesRequest.code}</b></span>}
                {notice && <span className="rf-status-notice">{notice}</span>}
                <span className="rf-status-end">Satır: <b>{lines.length}</b></span>
              </>
            }
          >
            <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
              <label className="rf-check rf-columns-wide quote-prospect-toggle">
                <input type="checkbox" checked={isProspectQuote} onChange={(event) => {
                  setIsProspectQuote(event.target.checked);
                  setCustomerId("");
                  setProspectCustomerName("");
                }} />
                <span className="quote-prospect-toggle-copy">
                  <b>Kayıtlı cari olmadan teklif oluştur</b>{" "}
                  <small>Cari kartı açmadan yeni bir müşteri adına teklif hazırlayın.</small>
                </span>
              </label>
                <label>
                  <span>Teklif no <RequiredMark /></span>
                  <input
                    className="rf-must rf-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={40}
                    placeholder="T-2026-0001"
                  />
                </label>
                {isProspectQuote ? <>
                  <label><span>Teklif alıcısı adı <RequiredMark /></span><input className="rf-must" value={prospectCustomerName} onChange={(event) => setProspectCustomerName(event.target.value)} required maxLength={200} placeholder="Firma veya kişi adı" /></label>
                  <label><span>Teklif dövizi <RequiredMark /></span><input className="rf-must rf-mono" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required maxLength={3} minLength={3} placeholder="TRY" /></label>
                </> : <label>
                  Müşteri
                  <SalesCustomerPopupSelect
                    customers={customers}
                    selectedId={customerId}
                    totalCount={customerPickerTotalCount || customers.length}
                    token={token}
                    onSearchResults={(results) => setCustomers((current) => {
                      const byId = new Map(current.map((customer) => [customer.id, customer]));
                      results.forEach((customer) => byId.set(customer.id, customer));
                      return [...byId.values()];
                    })}
                    onSelect={(customer) => {
                      setCustomerId(customer.id);
                      setCurrencyCode(customer.currencyCode || "TRY");
                    }}
                  />
                </label>}
                <label>
                  <span>Teklif tarihi <RequiredMark /></span>
                  <input
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Geçerlilik tarihi <RequiredMark /></span>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Plasiyer
                  <SearchableRecordPicker
                    options={quoteSalespeople.map((employee) => ({
                      id: employee.id,
                      label: `${employee.personnelCode} · ${employee.fullName}`,
                      searchText: `${employee.personnelCode} ${employee.fullName}`,
                    }))}
                    selectedId={salespersonEmployeeId}
                    onSelect={setSalespersonEmployeeId}
                    title="Plasiyer seçin"
                    placeholder="Plasiyer seçin (isteğe bağlı)"
                    searchPlaceholder="Personel kodu veya adıyla ara"
                    emptyMessage="Aramanızla eşleşen plasiyer bulunamadı."
                    clearable
                    clearLabel="Plasiyer seçimini kaldır"
                  />
                </label>
            </RecordFormGroup>
            <SalesFormLines
              label="Teklif satırları"
              lines={lines.length}
              extra={currencyCode || undefined}
              totals={salesFormTotalRows(
                { subtotal: quoteTotals.subtotal, discount: quoteTotals.discount, vat: quoteTotals.tax, total: quoteTotals.total, taxableByRate: quoteTotals.taxableByRate, vatByRate: quoteTotals.taxByRate },
                (value) => renderOrderCurrency(value, currencyCode),
              )}
              totalsLabel="Teklif toplamları"
              notes={
                <>
                  <label>
                    <span>Teslimat koşulları <span className="optional-label">İsteğe bağlı</span></span>
                    <textarea
                      value={deliveryTerms}
                      onChange={(e) => setDeliveryTerms(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="sales-rf-tall"
                      placeholder="Teslimat süresi, yeri ve teslim şekli gibi bilgileri yazın."
                    />
                  </label>
                  <label>
                    <span>Açıklama ve satış koşulları <span className="optional-label">İsteğe bağlı</span></span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={1000}
                      rows={7}
                      className="sales-rf-tall"
                      placeholder="Teklife ilişkin açıklama, ödeme ve diğer satış koşullarını yazın."
                    />
                  </label>
                </>
              }
            >
                <table className="dd-lines">
                  <thead>
                    <tr>
                      <th className="dd-ix">#</th><th>Stok kartı</th><th className="dd-num">Miktar</th><th>Birim</th>
                      <th className="dd-num">Birim fiyat</th><th>Döviz</th><th className="dd-num">Kur</th><th className="dd-num">İskonto %</th><th className="dd-num">KDV %</th>
                      <th>KDV</th><th className="dd-num">Ara toplam</th><th className="dd-num">İskonto</th><th className="dd-num">KDV tutarı</th><th className="dd-num">Satır toplamı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const amount = quoteLineAmounts(line);
                      const itemUnit = stockItems.find((item) => item.id === line.stockItemId)?.unitCode || "";
                      const lineCurrency = line.currencyCode || currencyCode;
                      const lineFxRate = quoteLineEffectiveFxRate(line);
                      return (
                        <tr key={index}>
                          <td className="dd-ix"><span>{index + 1}</span><button type="button" className="dd-line-remove" aria-label={`Satır ${index + 1} kaldır`} title="Satırı kaldır" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button></td>
                          <td className="dd-stock-cell">
                            <SearchableRecordPicker
                              options={stockItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}`, description: item.unitCode, searchText: item.unitCode }))}
                              selectedId={line.stockItemId}
                              selectedLabel={quoteStockLabels[line.stockItemId]}
                              onSearchChange={searchQuoteStockItems}
                              totalCount={quoteStockTotalCount}
                              triggerVariant="ellipsis"
                              onSelect={(id) => {
                                void loadQuoteUnits(id);
                                const selectedItem = stockItems.find((item) => item.id === id);
                                setLines((current) => current.map((currentLine, rowIndex) => rowIndex === index ? {
                                  ...currentLine,
                                  stockItemId: id,
                                  unitCode: selectedItem?.unitCode || "",
                                  unitPrice: String(selectedItem?.salesListPrice ?? 0),
                                  discountPercent: String(selectedItem?.salesDiscountPercent ?? 0),
                                  vatPercent: String(selectedItem?.salesVatPercent ?? 20),
                                  isVatIncluded: false,
                                  currencyCode: selectedItem?.priceCurrencyCode || currencyCode,
                                } : currentLine));
                                if (selectedItem) setQuoteStockLabels((current) => ({ ...current, [id]: `${selectedItem.code} · ${selectedItem.name}` }));
                              }}
                              title="Stok kartı seçin"
                              placeholder="Stok seçin"
                              searchPlaceholder="Stok kodu veya adıyla ara"
                              emptyMessage="Aramanızla eşleşen stok kartı bulunamadı."
                              required
                            />
                          </td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} miktar`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required /></td>
                          <td>
                            <select aria-label={`Satır ${index + 1} birim`} value={line.unitCode || itemUnit} onChange={(event) => updateLine(index, "unitCode", event.target.value)} required>
                              <option value={itemUnit || line.unitCode}>{itemUnit || line.unitCode || "Temel birim"}</option>
                              {(quoteUnits[line.stockItemId] || []).filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.unitCode}>{unit.unitCode} (×{unit.factorToBase})</option>)}
                            </select>
                          </td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} birim fiyat`} type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} required /></td>
                          <td>
                              <select aria-label={`Satır ${index + 1} para birimi`} value={lineCurrency} onChange={(event) => {
                                updateLine(index, "currencyCode", event.target.value);
                                updateLine(index, "exchangeRateOverride", "");
                              }}>
                              {quoteCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                            </select>
                            {line.currencyCode && line.currencyCode !== currencyCode && (
                              <small className="quote-fx-hint">
                                {quoteLineFxRate(line.currencyCode) === null
                                  ? "Kur bulunamadı"
                                  : `1 ${line.currencyCode} = ${formatOrderMoney(quoteLineFxRate(line.currencyCode)!)} ${currencyCode}`}
                              </small>
                            )}
                          </td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} döviz kuru`} type="number" min="0.00000001" step="0.00000001" value={lineCurrency.toUpperCase() === currencyCode.toUpperCase() ? "1" : line.exchangeRateOverride || (lineFxRate === null ? "" : String(lineFxRate))} disabled={lineCurrency.toUpperCase() === currencyCode.toUpperCase()} onChange={(event) => updateLine(index, "exchangeRateOverride", event.target.value)} /></td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} iskonto yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => updateLine(index, "discountPercent", event.target.value)} required /></td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} KDV yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.vatPercent} onChange={(event) => updateLine(index, "vatPercent", event.target.value)} required /></td>
                          <td><select aria-label={`Satır ${index + 1} KDV dahil mi`} value={line.isVatIncluded ? "included" : "excluded"} onChange={(event) => updateLine(index, "isVatIncluded", event.target.value === "included")}><option value="excluded">Hariç</option><option value="included">Dahil</option></select></td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} ara toplam`} value={formatOrderMoney(amount.subtotal)} disabled /></td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} iskonto tutarı`} value={formatOrderMoney(amount.discount)} disabled /></td>
                          <td className="dd-num"><input aria-label={`Satır ${index + 1} KDV tutarı`} value={formatOrderMoney(amount.tax)} disabled /></td>
                          <td className="dd-num dd-total"><input aria-label={`Satır ${index + 1} satır toplamı`} value={formatOrderMoney(amount.total)} disabled /></td>
                        </tr>
                      );
                    })}
                    <tr className="dd-new-line">
                      <td colSpan={14}>
                        <button
                          type="button"
                          data-line-add-shortcut
                          title="Ctrl+Shift+Enter ile satır ekle"
                          onClick={() => setLines((current) => [...current, {
                            stockItemId: "",
                            quantity: "1",
                            unitPrice: "0",
                            discountPercent: "0",
                            vatPercent: "20",
                            isVatIncluded: false,
                            unitCode: "",
                            currencyCode: "",
                            exchangeRateOverride: "",
                          }])}
                        >
                          <LineAddLabel />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
            </SalesFormLines>
              {quoteFieldDefinitions.length > 0 && (
              <RecordFormGroup title="Teklif Özel Alanları">
                <small>Tenant alan tanımlarına göre doğrulanır.</small>
                <div className="rf-custom-grid">
                  {quoteFieldDefinitions.map((field) => (
                    <label key={field.id}>
                      <span>
                        {field.label}
                        {field.isRequired && <RequiredMark />}
                      </span>
                      <small>
                        {field.code} · {field.dataType}
                      </small>
                      {field.dataType === "Boolean" ? (
                        <select
                          required={field.isRequired}
                          value={quoteFieldValues[field.code] || ""}
                          onChange={(e) =>
                            setQuoteFieldValues((current) => ({
                              ...current,
                              [field.code]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Seçin</option>
                          <option value="true">Evet</option>
                          <option value="false">Hayır</option>
                        </select>
                      ) : (
                        <input
                          type={
                            field.dataType === "Decimal"
                              ? "number"
                              : field.dataType === "Date"
                                ? "date"
                                : "text"
                          }
                          step={
                            field.dataType === "Decimal" ? "any" : undefined
                          }
                          maxLength={
                            field.dataType === "Text"
                              ? field.maxLength
                              : undefined
                          }
                          required={field.isRequired}
                          value={quoteFieldValues[field.code] || ""}
                          onChange={(e) =>
                            setQuoteFieldValues((current) => ({
                              ...current,
                              [field.code]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </RecordFormGroup>
              )}
          </RecordFormPage>
      )}
      {detail && (() => {
        const quoteMoney = (value: number) => formatAmount(value, detail.currencyCode);
        const validDays = daysFromToday(detail.validUntil);
        const expired = detail.status === "Expired" || (validDays < 0 && (detail.status === "Draft" || detail.status === "Sent"));
        const usesForeignCurrency = detail.lines.some(
          (line) => !!line.enteredCurrencyCode && line.enteredCurrencyCode !== detail.currencyCode,
        );
        const isLatestRevision = quoteRevisions[quoteRevisions.length - 1]?.id === detail.id;
        const canRevise = !detail.hasSalesOrder && isLatestRevision;
        return (
          <DocumentSurface
            variant="detail"
            title="Satış teklifi"
            eyebrow={`Satış teklifi · Revizyon ${detail.revisionNumber}`}
            code={detail.code}
            closeLabel="Geri"
            subtitle={
              <span>
                {detail.customerName}
                {detail.customerCode && <span className="dd-muted"> · {detail.customerCode}</span>}
                {!detail.customerId && <span className="dd-muted"> · Kayıtsız alıcı</span>}
              </span>
            }
            status={salesQuoteStatus(detail.status)}
            meta={<span>{formatDate(detail.quoteDate)}</span>}
            statusFlow={<SalesQuoteFlow status={detail.status} />}
            onClose={() => setDetail(null)}
            className="sales-quote-detail"
            aside={
              <>
                <DetailContext title="Belge zinciri">
                  <DetailChain
                    items={[
                      ...(detail.salesRequestCode ? [{ key: "request", code: detail.salesRequestCode, label: "Satış talebi" }] : []),
                      { key: "self", code: detail.code, label: "Bu teklif", kind: "Satış teklifi", current: true, status: salesQuoteStatus(detail.status) },
                      ...(detail.salesOrderId && detail.salesOrderCode
                        ? [{ key: "order", code: detail.salesOrderCode, label: "Satış siparişi", onOpen: () => void openOrder(detail.salesOrderId!) }]
                        : []),
                    ]}
                  />
                </DetailContext>
                <DetailContext title="Cari" hint={detail.customerCode || undefined}>
                  <DetailKeyValues
                    items={[
                      { label: "Unvan", value: detail.customerName },
                      ...(!detail.customerId ? [{ label: "Kayıt", value: "Kayıtsız alıcı" }] : []),
                      { label: "Plasiyer", value: detail.salespersonName || "—" },
                    ]}
                  />
                </DetailContext>
              </>
            }
            hints={SALES_DETAIL_HINTS}
            footerStatus={<SalesFooterStatus lines={detail.lines.length} total={quoteMoney(detail.grandTotal)} />}
          >
            {error && (
              <div className="alert inline-alert">
                {error}
                <button type="button" aria-label="Hatayı kapat" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice">
                {notice}
                <button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            <DetailTiles
              label="Teklif özeti"
              items={[
                { label: "Genel toplam", value: quoteMoney(detail.grandTotal) },
                {
                  label: "Geçerlilik",
                  value: formatDate(detail.validUntil),
                  tone: expired ? "danger" : "default",
                  hint: expired
                    ? "Süresi doldu"
                    : detail.status === "Draft" || detail.status === "Sent"
                      ? validDays === 0
                        ? "Bugün sona eriyor"
                        : `${validDays} gün kaldı`
                      : undefined,
                },
                { label: "Satır", value: detail.lines.length },
                {
                  label: "Sipariş",
                  tone: detail.salesOrderId && detail.salesOrderCode ? "default" : "muted",
                  value:
                    detail.salesOrderId && detail.salesOrderCode ? (
                      <button
                        type="button"
                        className="dd-link"
                        aria-label={`${detail.salesOrderCode} sipariş ayrıntılarını aç`}
                        onClick={() => void openOrder(detail.salesOrderId!)}
                      >
                        {detail.salesOrderCode}
                      </button>
                    ) : detail.hasSalesOrder ? (
                      "Oluşturuldu"
                    ) : (
                      "Henüz yok"
                    ),
                },
              ]}
            />
            <DetailTabs<"information" | "revisions">
              label="Teklif detay bölümleri"
              value={quoteDetailTab}
              onChange={setQuoteDetailTab}
              tabs={[
                { key: "information", label: "Teklif bilgileri" },
                { key: "revisions", label: "Geçmiş", count: quoteRevisions.length },
              ]}
            />
            {quoteDetailTab === "information" && (
              <>
                <div className="dd-box">
                  <DetailInfoGrid
                    label="Teklif üst bilgileri"
                    items={[
                      { label: "Teklif tarihi", value: formatDate(detail.quoteDate) },
                      { label: "Para birimi", value: detail.currencyCode },
                      { label: "Plasiyer", value: detail.salespersonName || "—" },
                      { label: "Kaynak talep", value: detail.salesRequestCode || "—" },
                    ]}
                  />
                </div>
                <div className="dd-box">
                  <DetailLinesHead
                    title="Satırlar"
                    meta={<SalesLinesMeta lines={detail.lines.length} extra={usesForeignCurrency ? undefined : detail.currencyCode} />}
                  />
                  <div className="dd-lines-wrap">
                    <table className="dd-lines" aria-label="Teklif satırları">
                      <thead>
                        <tr>
                          <th className="dd-ix">#</th>
                          <th>Stok</th>
                          <th className="dd-num">Miktar</th>
                          {usesForeignCurrency && <th className="dd-num">Döviz fiyatı</th>}
                          {usesForeignCurrency && <th className="dd-num">Kur</th>}
                          <th className="dd-num">Birim fiyat</th>
                          <th className="dd-num">İskonto</th>
                          <th className="dd-num">KDV</th>
                          <th className="dd-num">Tutar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line, index) => {
                          const foreign = !!line.enteredCurrencyCode && line.enteredCurrencyCode !== detail.currencyCode;
                          return (
                            <tr key={line.lineNumber}>
                              <td className="dd-ix">{index + 1}</td>
                              <td className="dd-stock">
                                <b>{line.stockCode}</b>
                                <small>{line.stockName}</small>
                              </td>
                              <td className="dd-num">
                                {formatQuantity(line.quantity)} {line.unitCode}
                              </td>
                              {usesForeignCurrency && (
                                <td className="dd-num">
                                  {foreign
                                    ? `${(line.enteredUnitPrice ?? line.unitPrice).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${line.enteredCurrencyCode}`
                                    : "—"}
                                </td>
                              )}
                              {usesForeignCurrency && (
                                <td className="dd-num">
                                  {foreign
                                    ? Number(line.exchangeRateToQuoteCurrency || 1).toLocaleString("tr-TR", { maximumFractionDigits: 8 })
                                    : "—"}
                                </td>
                              )}
                              <td className="dd-num">
                                {(foreign ? line.unitPrice : (line.enteredUnitPrice ?? line.unitPrice)).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 4,
                                })}
                                {line.isVatIncluded && !foreign && <small>KDV dahil</small>}
                              </td>
                              <td className="dd-num">
                                {line.discountAmount > 0 ? (
                                  <>
                                    {formatAmount(line.discountAmount)}
                                    <small>%{line.discountPercent}</small>
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="dd-num">%{line.vatPercent}</td>
                              <td className="dd-num">
                                <b>{formatAmount(line.lineSubtotal - line.discountAmount)}</b>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <DetailLinesFooter
                    label="Teklif toplamları"
                    aside={
                      <DetailNotes
                        items={[
                          { label: "Teslimat koşulları", value: detail.deliveryTerms },
                          { label: "Açıklama ve satış koşulları", value: detail.notes },
                        ]}
                      />
                    }
                    totals={salesTotalRows(
                      detail,
                      quoteMoney,
                      vatByRate(
                        detail.lines.map((line) => ({ vatPercent: line.vatPercent, taxable: line.lineSubtotal - line.discountAmount, vat: line.taxAmount })),
                        { taxable: detail.subtotal - detail.discountTotal, vat: detail.taxTotal },
                      ),
                    )}
                  />
                </div>
                {detail.status === "Draft" && detail.customFields.length > 0 && (
                  <DetailSection title="Teklif özel alanları" description="Teklif iletildiğinde değerler kilitlenir.">
                    <form onSubmit={saveQuoteFieldValues}>
                      <div className="form-two">
                        {detail.customFields.map((field) => (
                          <label key={field.definitionId}>
                            {field.label}
                            {field.isRequired ? " *" : ""}
                            <small>
                              {field.code} · {field.dataType}
                            </small>
                            {field.dataType === "Boolean" ? (
                              <select
                                required={field.isRequired}
                                value={quoteDetailValues[field.code] || ""}
                                onChange={(e) =>
                                  setQuoteDetailValues((current) => ({
                                    ...current,
                                    [field.code]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Seçin</option>
                                <option value="true">Evet</option>
                                <option value="false">Hayır</option>
                              </select>
                            ) : (
                              <input
                                type={field.dataType === "Decimal" ? "number" : field.dataType === "Date" ? "date" : "text"}
                                step={field.dataType === "Decimal" ? "any" : undefined}
                                maxLength={field.dataType === "Text" ? field.maxLength : undefined}
                                required={field.isRequired}
                                value={quoteDetailValues[field.code] || ""}
                                onChange={(e) =>
                                  setQuoteDetailValues((current) => ({
                                    ...current,
                                    [field.code]: e.target.value,
                                  }))
                                }
                              />
                            )}
                          </label>
                        ))}
                      </div>
                      <div className="dd-form-foot">
                        <span className="dd-muted">İşlem geçmişi her değişikliği saklar.</span>
                        <button className="primary" disabled={quoteFieldBusy}>
                          Değerleri kaydet
                        </button>
                      </div>
                    </form>
                  </DetailSection>
                )}
                {quoteValueHistoryField && (
                  <DetailSection
                    title={`${quoteValueHistoryField.label} · değer geçmişi`}
                    description="Son 50 değişiklik"
                    actions={
                      <button type="button" className="secondary" onClick={() => setQuoteValueHistoryField(null)}>
                        Kapat
                      </button>
                    }
                  >
                    <div className="requests-list">
                      {quoteValueHistory.map((revision) => (
                        <article className="request-row" key={revision.id}>
                          <div className="request-info">
                            <b>
                              {revision.previousValue ?? "—"} → {revision.newValue ?? "—"}
                            </b>
                            <small>
                              Tanım v{revision.definitionVersion} · {new Date(revision.createdAt).toLocaleString("tr-TR")}
                            </small>
                          </div>
                          {detail.status === "Draft" && (
                            <button
                              type="button"
                              className="secondary small-button"
                              disabled={quoteFieldBusy}
                              onClick={() => void restoreQuoteFieldRevision(revision)}
                            >
                              Önceki değeri geri yükle
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  </DetailSection>
                )}
              </>
            )}
            {quoteDetailTab === "revisions" && (
              <DetailSection
                title="Revizyon geçmişi"
                count={quoteRevisions.length}
                description="Önceki teklif sürümleri korunur."
                actions={
                  canRevise && (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void beginQuoteRevision()}>
                      Yeni revizyon oluştur
                    </button>
                  )
                }
              >
                <div className="dd-lines-wrap">
                  <table className="dd-lines" aria-label="Revizyon geçmişi">
                    <thead>
                      <tr>
                        <th>Revizyon</th>
                        <th>Teklif no</th>
                        <th>Durum</th>
                        <th>Teklif tarihi</th>
                        <th className="dd-num">Genel toplam</th>
                        <th className="dd-menu">
                          <span className="dd-sr">İşlemler</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteRevisions.map((revision) => (
                        <tr key={revision.id}>
                          <td>
                            <b>Revizyon {revision.revisionNumber}</b>
                          </td>
                          <td>{revision.code}</td>
                          <td>
                            <DocumentStatusBadge status={salesQuoteStatus(revision.status)} />
                          </td>
                          <td>{formatDate(revision.quoteDate)}</td>
                          <td className="dd-num">{formatAmount(revision.grandTotal, revision.currencyCode)}</td>
                          <td className="dd-menu">
                            {revision.id === detail.id ? (
                              <span className="dd-muted">Açık</span>
                            ) : (
                              <button
                                type="button"
                                className="dd-link"
                                aria-label={`Revizyon ${revision.revisionNumber} aç`}
                                onClick={() => void openQuote(revision.id)}
                              >
                                Aç
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailSection>
            )}
          </DocumentSurface>
        );
      })()}
      {detail && quotePrintOpen && createPortal(
        <SalesQuotePdfTools
          quote={detail}
          token={token}
          isAdmin={role === "TenantAdmin"}
          onClose={() => setQuotePrintOpen(false)}
        />,
        document.body,
      )}
      {orderDetail && (
        <SalesOrderModal
          order={orderDetail}
          token={token}
          role={role}
          warehouses={warehouses}
          onClose={() => setOrderDetail(null)}
          onSaved={async () => {
            await load();
            await openOrder(orderDetail.id);
          }}
          onInvoiceCreated={openInvoice}
          newCommand={detailNewCommand}
          ownsActionBar={!invoiceId}
          onReload={() => openOrder(orderDetail.id)}
        />
      )}
      {invoiceId && (
        <SalesInvoiceModal
          invoiceId={invoiceId}
          token={token}
          role={role}
          warehouses={warehouses}
          onClose={() => setInvoiceId(null)}
          onSaved={load}
          newCommand={activeTab === "invoices" && !createInvoicePage ? { run: () => onNavigate("sales-invoice-create") } : detailNewCommand}
        />
      )}
    </div>
  );
}

const PURCHASE_ORDERS_CHANGED_EVENT = "nexora:purchase-orders-changed";
const SALES_CHANGED_EVENT = "nexora:sales-changed";
const createdPurchaseOrderStorageKey = "nexora.purchase-order.created";
/** Order hand-off to the "Satınalma siparişleri" tab: the create page stores a new order, the request
 * list an existing one to open (`intent: "open"`, no "oluşturuldu" notice). */
function takeCreatedPurchaseOrder(): { id: string; code: string; openOnly: boolean } | null {
  try {
    const raw = sessionStorage.getItem(createdPurchaseOrderStorageKey);
    if (!raw) return null;
    sessionStorage.removeItem(createdPurchaseOrderStorageKey);
    const value = JSON.parse(raw) as { id?: unknown; code?: unknown; intent?: unknown };
    return typeof value.id === "string"
      ? { id: value.id, code: typeof value.code === "string" ? value.code : "", openOnly: value.intent === "open" }
      : null;
  } catch {
    return null;
  }
}
type PurchaseOrderDraftLine = {
  /** Stable React key: line pickers keep their own search text. */
  rowKey: string;
  stockItemId: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  vatPercent: string;
  unitCode: string;
  /** Base unit of the picked stock card; the stock catalog is not preloaded on this page. */
  baseUnitCode: string;
};
const defaultPurchaseOrderVatPercent = "20";
const emptyPurchaseOrderLine = (): PurchaseOrderDraftLine => ({
  rowKey: crypto.randomUUID(),
  stockItemId: "",
  quantity: "1",
  unitPrice: "0",
  discountPercent: "0",
  vatPercent: defaultPurchaseOrderVatPercent,
  unitCode: "",
  baseUnitCode: "",
});
function purchaseOrderLineAmounts(line: PurchaseOrderDraftLine) {
  const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  const discount = gross * ((Number(line.discountPercent) || 0) / 100);
  const net = gross - discount;
  const vat = net * ((Number(line.vatPercent) || 0) / 100);
  return { gross, discount, net, vat };
}
function formatPurchaseOrderMoney(value: number, currencyCode: string) {
  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currencyCode === "TRY" ? "TL" : currencyCode}`;
}
const isUntouchedAmount = (value: string) =>
  value.trim() === "" || Number(value) === 0;

/** "Yeni satınalma siparişi" sekmesi: siparişi tam sayfa kayıt formunda oluşturur. */
function PurchaseOrderCreatePage({
  token,
  customers,
  warehouses,
  onNavigate,
}: {
  token: string;
  customers: SalesCustomer[];
  warehouses: Warehouse[];
  onNavigate: (page: SalesPageKey) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [formKey, setFormKey] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [supplierId, setSupplierId] = useState(""),
    [orderDate, setOrderDate] = useState(() => localDateString()),
    [expectedReceiptDate, setExpectedReceiptDate] = useState(""),
    [targetWarehouseId, setTargetWarehouseId] = useState(""),
    [notes, setNotes] = useState(""),
    [lines, setLines] = useState<PurchaseOrderDraftLine[]>(() => [
      emptyPurchaseOrderLine(),
    ]),
    [units, setUnits] = useState<Record<string, StockItemUnitConversion[]>>(
      {},
    ),
    [fieldDefinitions, setFieldDefinitions] = useState<
      PurchaseOrderFieldDefinition[]
    >([]),
    [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    api<PurchaseOrderFieldDefinition[]>(
      "/api/purchasing/orders/custom-fields",
      token,
    )
      .then((fields) => {
        if (active) setFieldDefinitions(fields);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const supplierOptions = customers.filter(
    (x) => x.isActive && (x.type === "Supplier" || x.type === "Both"),
  );
  const supplier = customers.find((x) => x.id === supplierId);
  const currencyCode = supplier?.currencyCode || "TRY";
  const totals = purchaseCreateOrderTotals(lines);
  /** The tab stays mounted (keep-alive) after save or cancel; the next visit must start clean. */
  function resetForm() {
    setCode("");
    setSupplierId("");
    setOrderDate(localDateString());
    setExpectedReceiptDate("");
    setTargetWarehouseId("");
    setNotes("");
    setLines([emptyPurchaseOrderLine()]);
    setFieldValues({});
    setError("");
    setBusy(false);
    // Remounts the pickers so their search text is cleared too.
    setFormKey((key) => key + 1);
  }
  function updateLine(index: number, patch: Partial<PurchaseOrderDraftLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }
  async function loadUnits(itemId: string) {
    if (!itemId || units[itemId]) return;
    try {
      const result = await api<{ conversions: StockItemUnitConversion[] }>(
        `/api/stock/items/${itemId}/units`,
        token,
      );
      setUnits((current) => ({ ...current, [itemId]: result.conversions }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function selectStockItem(index: number, item: StockItem) {
    void loadUnits(item.id);
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next: PurchaseOrderDraftLine = {
          ...line,
          stockItemId: item.id,
          unitCode: item.unitCode || "",
          baseUnitCode: item.unitCode || "",
        };
        // Stok kartının alış koşulları yalnızca alan hâlâ varsayılan değerindeyse önerilir.
        // Sipariş tek para birimlidir (tedarikçininki); farklı dövizdeki liste fiyatı önerilmez.
        const priceCurrency = (item.priceCurrencyCode || "TRY").toUpperCase();
        if (
          isUntouchedAmount(line.unitPrice) &&
          item.purchaseListPrice != null &&
          priceCurrency === currencyCode.toUpperCase()
        )
          next.unitPrice = String(item.purchaseListPrice);
        if (
          isUntouchedAmount(line.discountPercent) &&
          item.purchaseDiscountPercent != null
        )
          next.discountPercent = String(item.purchaseDiscountPercent);
        if (
          (line.vatPercent.trim() === "" ||
            line.vatPercent === defaultPurchaseOrderVatPercent) &&
          item.purchaseVatPercent != null
        )
          next.vatPercent = String(item.purchaseVatPercent);
        return next;
      }),
    );
  }
  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    // RecordFormPage save keys (Ctrl+S, Ctrl+F2) reach every mounted form; a hidden keep-alive tab must not submit.
    if (hostRef.current?.closest("[hidden]")) return;
    if (!supplier) {
      setError("Tedarikçi seçin.");
      return;
    }
    if (lines.some((line) => !line.stockItemId)) {
      setError("Her satır için stok kartı seçin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api<PurchaseOrderSummary>(
        "/api/purchasing/orders/",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code,
            supplierId,
            orderDate,
            expectedReceiptDate: expectedReceiptDate || null,
            targetWarehouseId: targetWarehouseId || null,
            currencyCode: supplier.currencyCode,
            notes: notes || null,
            customFields: fieldValues,
            lines: lines.map((x) => ({
              stockItemId: x.stockItemId,
              quantity: Number(x.quantity),
              unitPrice: Number(x.unitPrice),
              discountPercent: Number(x.discountPercent),
              vatPercent: Number(x.vatPercent),
              unitCode: x.unitCode || x.baseUnitCode || undefined,
            })),
          }),
        },
      );
      try {
        sessionStorage.setItem(
          createdPurchaseOrderStorageKey,
          JSON.stringify({ id: created.id, code: created.code }),
        );
      } catch {
        /* Session storage is optional; the list still refreshes through the event. */
      }
      resetForm();
      window.dispatchEvent(
        new CustomEvent(PURCHASE_ORDERS_CHANGED_EVENT, {
          detail: { id: created.id },
        }),
      );
      onNavigate("sales-purchasing");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const money = (value: number) => formatPurchaseOrderMoney(value, currencyCode);
  return (
    <div className="purchase-order-create-page" ref={hostRef}>
      <RecordFormPage
        key={formKey}
        className="sales-rf purchase-order-create"
        title="Yeni satınalma siparişi"
        document={{
          type: "Satınalma siparişi",
          code: code.trim() || undefined,
          party: supplier?.name,
          // The save creates the order as Onay bekliyor or Açık: no current step before that.
          statusFlow: <PurchaseCreateOrderFlow />,
          hints: SALES_FORM_HINTS,
        }}
        mode="create"
        busy={busy}
        saveLabel="Sipariş oluştur"
        formId="purchase-order-create-form"
        onSubmit={(event) => void createOrder(event)}
        onCancel={() => {
          resetForm();
          onNavigate("sales-purchasing");
        }}
        error={error}
        onDismissError={() => setError("")}
        status={
          <>
            <span>
              Miktar ve fiyat seçilen birim içindir; sipariş stok kartının
              temel biriminde saklanır.
            </span>
            <span className="rf-status-end">
              Satır: <b>{lines.length}</b>
            </span>
          </>
        }
      >
        <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
          <label>
            <span>
              Sipariş no <RequiredMark />
            </span>
            <input
              className="rf-must rf-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={40}
              placeholder="SA-2026-0001"
            />
          </label>
          <label className="rf-span-2">
            <span>
              Tedarikçi <RequiredMark />
            </span>
            <SearchableRecordPicker
              options={supplierOptions.map((x) => ({
                id: x.id,
                label: `${x.code} · ${x.name}`,
                description: x.currencyCode,
                searchText: x.currencyCode,
              }))}
              selectedId={supplierId}
              onSelect={setSupplierId}
              title="Tedarikçi seçin"
              placeholder="Tedarikçi seçin"
              searchPlaceholder="Tedarikçi kodu veya unvanıyla ara"
              emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı."
              required
            />
          </label>
          <label>
            <span>
              Sipariş tarihi <RequiredMark />
            </span>
            <input
              className="rf-must"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              required
            />
          </label>
          <label>
            <span>
              Beklenen teslim{" "}
              <span className="optional-label">İsteğe bağlı</span>
            </span>
            <input
              type="date"
              min={orderDate}
              value={expectedReceiptDate}
              onChange={(e) => setExpectedReceiptDate(e.target.value)}
            />
          </label>
          <label className="rf-span-2">
            <span>
              Hedef depo <span className="optional-label">İsteğe bağlı</span>
            </span>
            <SearchableRecordPicker
              options={warehouses
                .filter((x) => x.isActive)
                .map((x) => ({ id: x.id, label: `${x.code} · ${x.name}` }))}
              selectedId={targetWarehouseId}
              onSelect={setTargetWarehouseId}
              title="Hedef depo seçin"
              placeholder="Belirtilmedi"
              searchPlaceholder="Depo kodu veya adıyla ara"
              emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
            />
          </label>
        </RecordFormGroup>
        <SalesFormLines
          label="Sipariş satırları"
          lines={lines.length}
          extra={currencyCode}
          totals={salesFormTotalRows(totals, money)}
          totalsLabel="Sipariş toplamları"
          notes={
            <label className="po-create-note">
              <span>
                Sipariş notu{" "}
                <span className="optional-label">İsteğe bağlı</span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={4}
              />
              <small className="sales-invoice-note-counter" aria-hidden="true">
                {notes.length} / 1000
              </small>
            </label>
          }
        >
          <table className="dd-lines po-create-lines">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok kartı</th>
                <th className="dd-num">Miktar</th>
                <th>Birim</th>
                <th className="dd-num">Birim fiyat</th>
                <th className="dd-num">İsk. %</th>
                <th className="dd-num">KDV %</th>
                <th className="dd-num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const baseUnit = line.baseUnitCode || line.unitCode;
                return (
                  <tr key={line.rowKey}>
                    <td className="dd-ix">
                      <span>{index + 1}</span>
                      <button
                        type="button"
                        className="dd-line-remove"
                        aria-label={`Satır ${index + 1} kaldır`}
                        title="Satırı kaldır"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </td>
                    <td className="dd-stock-cell">
                      <AsyncStockItemPicker
                        token={token}
                        selectedId={line.stockItemId}
                        initialItems={[]}
                        onSelect={(item) => selectStockItem(index, item)}
                      />
                    </td>
                    <td className="dd-num">
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        aria-label={`Satır ${index + 1} miktar`}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, { quantity: e.target.value })
                        }
                        required
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Satır ${index + 1} birim`}
                        value={line.unitCode || baseUnit}
                        onChange={(e) =>
                          updateLine(index, { unitCode: e.target.value })
                        }
                        required
                      >
                        <option value={baseUnit}>
                          {baseUnit || "Temel birim"}
                        </option>
                        {(units[line.stockItemId] || [])
                          .filter((x) => x.isActive && x.unitCode !== baseUnit)
                          .map((unit) => (
                            <option key={unit.id} value={unit.unitCode}>
                              {unit.unitCode} (×{unit.factorToBase})
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="dd-num">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        aria-label={`Satır ${index + 1} birim fiyat`}
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateLine(index, { unitPrice: e.target.value })
                        }
                        required
                      />
                    </td>
                    <td className="dd-num">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        aria-label={`Satır ${index + 1} iskonto yüzdesi`}
                        value={line.discountPercent}
                        onChange={(e) =>
                          updateLine(index, { discountPercent: e.target.value })
                        }
                        required
                      />
                    </td>
                    <td className="dd-num">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        aria-label={`Satır ${index + 1} KDV yüzdesi`}
                        value={line.vatPercent}
                        onChange={(e) =>
                          updateLine(index, { vatPercent: e.target.value })
                        }
                        required
                      />
                    </td>
                    <td className="dd-num dd-total">
                      <output aria-label={`Satır ${index + 1} tutar`}>
                        {money(purchaseOrderLineAmounts(line).net)}
                      </output>
                    </td>
                  </tr>
                );
              })}
              <tr className="dd-new-line">
                <td colSpan={8}>
                  <button
                    type="button"
                    data-line-add-shortcut
                    title="Ctrl+Shift+Enter ile satır ekle"
                    onClick={() =>
                      setLines((current) => [...current, emptyPurchaseOrderLine()])
                    }
                  >
                    <LineAddLabel />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </SalesFormLines>
        {fieldDefinitions.length > 0 && (
          <RecordFormGroup title="Sipariş Özel Alanları">
            <div className="rf-custom-grid">
              {fieldDefinitions.map((field) => (
                <label key={field.id}>
                  {field.label}
                  {field.isRequired ? " *" : ""}
                  <small>{field.code}</small>
                  {field.dataType === "Boolean" ? (
                    <select
                      required={field.isRequired}
                      value={fieldValues[field.code] || ""}
                      onChange={(e) =>
                        setFieldValues((current) => ({
                          ...current,
                          [field.code]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Seçin</option>
                      <option value="true">Evet</option>
                      <option value="false">Hayır</option>
                    </select>
                  ) : (
                    <input
                      type={
                        field.dataType === "Decimal"
                          ? "number"
                          : field.dataType === "Date"
                            ? "date"
                            : "text"
                      }
                      step={field.dataType === "Decimal" ? "any" : undefined}
                      maxLength={
                        field.dataType === "Text" ? field.maxLength : undefined
                      }
                      required={field.isRequired}
                      value={fieldValues[field.code] || ""}
                      onChange={(e) =>
                        setFieldValues((current) => ({
                          ...current,
                          [field.code]: e.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          </RecordFormGroup>
        )}
      </RecordFormPage>
    </div>
  );
}

function PurchasingPanel({
  token,
  role,
  customers,
  stockItems,
  warehouses,
  mode,
  onNavigate,
}: {
  token: string;
  role: string;
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  mode: "requests" | "purchasing";
  onNavigate?: (page: SalesPageKey) => void;
}) {
  const today = localDateString();
  const currentUserId = (() => {
    try {
      const payload = token.split(".")[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(
        atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
      ) as { sub?: unknown };
      return typeof decoded.sub === "string" ? decoded.sub : null;
    } catch {
      return null;
    }
  })();
  const requestsOnly = mode === "requests";
  // Default layout (used while the tenant has no published screen view): the order cell carries its
  // dates, the supplier cell its target warehouse, and "receivedProgress" shows received / ordered quantity.
  // "receivedProgress" is a client-side column; it is not in the server screen-view catalog yet.
  const defaultOrderScreenFields: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Sipariş", visible: true, position: 0 },
    { key: "supplierName", label: "Tedarikçi", visible: true, position: 1 },
    { key: "receivedProgress", label: "Teslim alınan", visible: true, position: 2 },
    { key: "grandTotal", label: "Genel toplam", visible: true, position: 3 },
    { key: "status", label: "Durum", visible: true, position: 4 },
    { key: "orderDate", label: "Sipariş tarihi", visible: false, position: 5 },
    {
      key: "expectedReceiptDate",
      label: "Beklenen teslim",
      visible: false,
      position: 6,
    },
    {
      key: "targetWarehouseCode",
      label: "Hedef depo",
      visible: false,
      position: 7,
    },
    { key: "lineCount", label: "Satır", visible: false, position: 8 },
    { key: "currencyCode", label: "Döviz", visible: false, position: 9 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 10,
      fixed: true,
      pinned: "right",
      width: 64,
    },
  ];
  const [orderScreenFields, setOrderScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >(defaultOrderScreenFields);
  // Default layout (used while the tenant has no published screen view): the request cell carries its
  // description and line count, "İhtiyaç" its remaining days. "quotes" is a client-side column
  // (supplier quotes of approved/ordered requests); it is not in the server screen-view catalog yet.
  const defaultRequestScreenFields: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Talep", visible: true, position: 0 },
    { key: "requestedByName", label: "Talep sahibi", visible: true, position: 1 },
    { key: "neededByDate", label: "İhtiyaç", visible: true, position: 2 },
    { key: "quotes", label: "Teklif", visible: true, position: 3 },
    { key: "status", label: "Durum", visible: true, position: 4 },
    { key: "description", label: "Açıklama", visible: false, position: 5 },
    { key: "requestDate", label: "Talep tarihi", visible: false, position: 6 },
    { key: "lineCount", label: "Kalem", visible: false, position: 7 },
    {
      key: "purchaseOrderCode",
      label: "Bağlı sipariş",
      visible: false,
      position: 8,
    },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 9,
      fixed: true,
      pinned: "right",
      width: 64,
    },
  ];
  const [requestScreenFields, setRequestScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >(defaultRequestScreenFields);
  const defaultReceiptScreenFields: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Mal kabul", visible: true, position: 0 },
    { key: "receiptDate", label: "Tarih", visible: true, position: 1 },
    { key: "warehouseName", label: "Depo", visible: true, position: 2 },
    { key: "lineCount", label: "Satır", visible: true, position: 3 },
    { key: "status", label: "Durum", visible: true, position: 4 },
    { key: "invoice", label: "Alış faturası", visible: true, position: 5 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 6,
      fixed: true,
    },
  ];
  const [receiptScreenFields, setReceiptScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >(defaultReceiptScreenFields);
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]),
    [orderPage, setOrderPage] = useState(1),
    [orderTotal, setOrderTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  /** Status chip on the order list. The list API has no status filter, so chips filter a client-side index. */
  const [orderStatusFilter, setOrderStatusFilter] = useState<"" | "Open" | "PartiallyReceived" | "Received" | "Overdue">(""),
    [orderIndex, setOrderIndex] = useState<{ items: PurchaseOrderSummary[]; complete: boolean } | null>(null),
    [orderIndexVersion, setOrderIndexVersion] = useState(0),
    [orderFieldsOpen, setOrderFieldsOpen] = useState(false),
    [orderFieldsTab, setOrderFieldsTab] = useState<"quote" | "order" | "receipt">("quote");
  /** Order details fetched for the visible rows (received quantities, receipts); cleared on every list load. */
  const orderDetailCache = useRef(new Map<string, PurchaseOrderDetail | "error">());
  const [orderDetailCacheVersion, setOrderDetailCacheVersion] = useState(0);
  const [purchaseRequests, setPurchaseRequests] = useState<
      PurchaseRequestSummary[]
    >([]),
    [requestPage, setRequestPage] = useState(1),
    [requestTotal, setRequestTotal] = useState(0),
    [requestEditor, setRequestEditor] = useState(false),
    [requestDetail, setRequestDetail] = useState<PurchaseRequestDetail | null>(
      null,
    ),
    [requestCode, setRequestCode] = useState(""),
    [requestDate, setRequestDate] = useState(today),
    [neededByDate, setNeededByDate] = useState(""),
    [requestDescription, setRequestDescription] = useState(""),
    [requestLines, setRequestLines] = useState([
      { stockItemId: "", quantity: "1", unitCode: "" },
    ]),
    [requestUnits, setRequestUnits] = useState<
      Record<string, StockItemUnitConversion[]>
    >({}),
    [orderConversion, setOrderConversion] = useState(false),
    [conversionCode, setConversionCode] = useState(""),
    [conversionSupplierId, setConversionSupplierId] = useState(""),
    [conversionDate, setConversionDate] = useState(today),
    [conversionTargetWarehouseId, setConversionTargetWarehouseId] =
      useState(""),
    [conversionNotes, setConversionNotes] = useState(""),
    [conversionPrices, setConversionPrices] = useState<
      Record<
        number,
        { unitPrice: string; discountPercent: string; vatPercent: string }
      >
    >({}),
    [selectedQuoteForOrder, setSelectedQuoteForOrder] = useState<string | null>(
      null,
    ),
    [supplierQuotes, setSupplierQuotes] = useState<PurchaseSupplierQuote[]>([]),
    [quoteEditor, setQuoteEditor] = useState(false),
    [quoteCode, setQuoteCode] = useState(""),
    [quoteSupplierId, setQuoteSupplierId] = useState(""),
    [quoteDate, setQuoteDate] = useState(today),
    [quoteValidUntil, setQuoteValidUntil] = useState(""),
    [quoteNotes, setQuoteNotes] = useState(""),
    [quotePrices, setQuotePrices] = useState<
      Record<
        number,
        { unitPrice: string; discountPercent: string; vatPercent: string }
      >
    >({});
  const [requestFieldSettingsOpen, setRequestFieldSettingsOpen] =
      useState(false),
    [requestFieldDefinitions, setRequestFieldDefinitions] = useState<
      PurchaseRequestFieldDefinition[]
    >([]),
    [requestFieldValues, setRequestFieldValues] = useState<
      Record<string, string>
    >({}),
    [requestFieldCode, setRequestFieldCode] = useState(""),
    [requestFieldLabel, setRequestFieldLabel] = useState(""),
    [requestFieldType, setRequestFieldType] =
      useState<PurchaseRequestFieldDefinition["dataType"]>("Text"),
    [requestFieldMaxLength, setRequestFieldMaxLength] = useState("200"),
    [requestFieldRequired, setRequestFieldRequired] = useState(false);
  const [orderFieldDefinitions, setOrderFieldDefinitions] = useState<
      PurchaseOrderFieldDefinition[]
    >([]),
    [orderFieldValues, setOrderFieldValues] = useState<Record<string, string>>(
      {},
    ),
    [conversionFieldValues, setConversionFieldValues] = useState<
      Record<string, string>
    >({}),
    [orderFieldCode, setOrderFieldCode] = useState(""),
    [orderFieldLabel, setOrderFieldLabel] = useState(""),
    [orderFieldType, setOrderFieldType] =
      useState<PurchaseOrderFieldDefinition["dataType"]>("Text"),
    [orderFieldMaxLength, setOrderFieldMaxLength] = useState("200"),
    [orderFieldRequired, setOrderFieldRequired] = useState(false);
  const [orderFieldHistoryDefinition, setOrderFieldHistoryDefinition] =
      useState<PurchaseOrderFieldDefinition | null>(null),
    [orderFieldHistory, setOrderFieldHistory] = useState<
      PurchaseOrderFieldRevision[]
    >([]);
  const [supplierQuoteFieldDefinitions, setSupplierQuoteFieldDefinitions] =
      useState<PurchaseSupplierQuoteFieldDefinition[]>([]),
    [supplierQuoteFieldValues, setSupplierQuoteFieldValues] = useState<
      Record<string, string>
    >({}),
    [supplierQuoteFieldCode, setSupplierQuoteFieldCode] = useState(""),
    [supplierQuoteFieldLabel, setSupplierQuoteFieldLabel] = useState(""),
    [supplierQuoteFieldType, setSupplierQuoteFieldType] =
      useState<PurchaseSupplierQuoteFieldDefinition["dataType"]>("Text"),
    [supplierQuoteFieldMaxLength, setSupplierQuoteFieldMaxLength] =
      useState("200"),
    [supplierQuoteFieldRequired, setSupplierQuoteFieldRequired] =
      useState(false);
  const [receiptFieldDefinitions, setReceiptFieldDefinitions] = useState<
      PurchaseReceiptFieldDefinition[]
    >([]),
    [receiptFieldValues, setReceiptFieldValues] = useState<
      Record<string, string>
    >({}),
    [receiptFieldCode, setReceiptFieldCode] = useState(""),
    [receiptFieldLabel, setReceiptFieldLabel] = useState(""),
    [receiptFieldType, setReceiptFieldType] =
      useState<PurchaseReceiptFieldDefinition["dataType"]>("Text"),
    [receiptFieldMaxLength, setReceiptFieldMaxLength] = useState("200"),
    [receiptFieldRequired, setReceiptFieldRequired] = useState(false);
  const [requestFieldHistoryDefinition, setRequestFieldHistoryDefinition] =
      useState<PurchaseRequestFieldDefinition | null>(null),
    [requestFieldMetadataHistory, setRequestFieldMetadataHistory] = useState<
      PurchaseRequestFieldMetadataRevision[]
    >([]),
    [requestValueHistoryField, setRequestValueHistoryField] =
      useState<PurchaseRequestFieldValue | null>(null),
    [requestFieldValueHistory, setRequestFieldValueHistory] = useState<
      PurchaseRequestFieldValueRevision[]
    >([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [requestSearch, setRequestSearch] = useState(""),
    [requestStatus, setRequestStatus] = useState(""),
    [orderSearch, setOrderSearch] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  /** Request status chip counts: one `pageSize=1` call per status (the list API filters by status). */
  const [requestStatusCounts, setRequestStatusCounts] = useState<Record<
      "all" | PurchaseRequestSummary["status"],
      number
    > | null>(null),
    [requestCountsVersion, setRequestCountsVersion] = useState(0),
    [requestFieldsTab, setRequestFieldsTab] = useState<"request" | "quote">("request"),
    [requestGridToolsSlot, setRequestGridToolsSlot] = useState<HTMLDivElement | null>(null);
  /** Supplier quotes of the visible approved/ordered requests ("Teklif" column, side panel); cleared on every list load. */
  const requestQuoteCache = useRef(new Map<string, PurchaseSupplierQuote[] | "error">());
  const [requestQuoteCacheVersion, setRequestQuoteCacheVersion] = useState(0);
  /** Inline approve/reject flow shared by the side panel and the request detail; bound to one request id. */
  const [decision, setDecision] = useState<{
    requestId: string;
    note: string;
    confirm: "approve" | "reject" | null;
    error: string;
  } | null>(null);
  const [orderGridToolsSlot, setOrderGridToolsSlot] =
    useState<HTMLDivElement | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null),
    [invoiceReceiptId, setInvoiceReceiptId] = useState<string | null>(null),
    [invoiceCode, setInvoiceCode] = useState(""),
    [invoiceDate, setInvoiceDate] = useState(today);
  const [receiptEditor, setReceiptEditor] = useState(false),
    [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || ""),
    [receiptDate, setReceiptDate] = useState(today),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [quantities, setQuantities] = useState<Record<number, string>>({}),
    [receiptUnits, setReceiptUnits] = useState<
      Record<number, StockItemUnitConversion[]>
    >({}),
    [enteredReceiptUnits, setEnteredReceiptUnits] = useState<
      Record<number, string>
    >({}),
    [receiptLocations, setReceiptLocations] = useState<
      WarehouseLocationOption[]
    >([]),
    [receiptLocationIds, setReceiptLocationIds] = useState<
      Record<number, string>
    >({});
  const purchasePageSize = 25;
  async function load(
    targetRequestPage = requestPage,
    targetOrderPage = orderPage,
  ) {
    setLoading(true);
    setError("");
    try {
      const requestParams = new URLSearchParams({
        page: String(targetRequestPage),
        pageSize: String(purchasePageSize),
      });
      if (requestSearch.trim())
        requestParams.set("search", requestSearch.trim());
      if (requestStatus) requestParams.set("status", requestStatus);
      if (requestsOnly) {
        // Field definitions feed the "Alanlar" dialog, the quote form and the order conversion form;
        // each is optional, so a failed definition read never blanks the list.
        // Order and quote definitions are only used by TenantAdmin/TenantDeveloper (dialog, quote and order forms).
        const optionalDefinitions = <T,>(url: string) => api<T[]>(url, token).catch(() => null);
        const managesFields = role === "TenantAdmin" || role === "TenantDeveloper";
        const [requests, fields, poFields, quoteFields] = await Promise.all([
          api<PurchaseRequestPage>(`/api/purchasing/requests/?${requestParams}`, token),
          optionalDefinitions<PurchaseRequestFieldDefinition>("/api/purchasing/requests/custom-fields"),
          managesFields
            ? optionalDefinitions<PurchaseOrderFieldDefinition>("/api/purchasing/orders/custom-fields")
            : Promise.resolve(null),
          managesFields
            ? optionalDefinitions<PurchaseSupplierQuoteFieldDefinition>("/api/purchasing/supplier-quotes/custom-fields")
            : Promise.resolve(null),
        ]);
        if (fields) setRequestFieldDefinitions(fields);
        if (poFields) setOrderFieldDefinitions(poFields);
        if (quoteFields) setSupplierQuoteFieldDefinitions(quoteFields);
        requestQuoteCache.current.clear();
        setRequestQuoteCacheVersion((value) => value + 1);
        setRequestCountsVersion((value) => value + 1);
        setPurchaseRequests(requests.items);
        setRequestPage(requests.page);
        setRequestTotal(requests.totalCount);
        // List type: the current row is the one the user chose; a reload keeps it while it is on the page.
        setSelectedRequestId((current) =>
          current && requests.items.some((item) => item.id === current) ? current : null,
        );
        return;
      }
      const [page, requests, fields, poFields, quoteFields, receiptFields] =
        await Promise.all([
          api<{
            items: PurchaseOrderSummary[];
            page: number;
            totalCount: number;
          }>(
            `/api/purchasing/orders/?page=${targetOrderPage}&pageSize=${purchasePageSize}${orderSearch.trim() ? `&q=${encodeURIComponent(orderSearch.trim())}` : ""}`,
            token,
          ),
          api<PurchaseRequestPage>(
            `/api/purchasing/requests/?${requestParams}`,
            token,
          ),
          api<PurchaseRequestFieldDefinition[]>(
            "/api/purchasing/requests/custom-fields",
            token,
          ),
          api<PurchaseOrderFieldDefinition[]>(
            "/api/purchasing/orders/custom-fields",
            token,
          ),
          api<PurchaseSupplierQuoteFieldDefinition[]>(
            "/api/purchasing/supplier-quotes/custom-fields",
            token,
          ),
          api<PurchaseReceiptFieldDefinition[]>(
            "/api/purchasing/receipts/custom-fields",
            token,
          ),
        ]);
      orderDetailCache.current.clear();
      setOrderDetailCacheVersion((value) => value + 1);
      setOrderIndexVersion((value) => value + 1);
      setOrders(page.items);
      setOrderPage(page.page);
      setOrderTotal(page.totalCount);
      setPurchaseRequests(requests.items);
      setRequestPage(requests.page);
      setRequestTotal(requests.totalCount);
      setRequestFieldDefinitions(fields);
      setOrderFieldDefinitions(poFields);
      setSupplierQuoteFieldDefinitions(quoteFields);
      setReceiptFieldDefinitions(receiptFields);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(requestsOnly ? 1 : requestPage, requestsOnly ? 1 : orderPage);
    }, (requestsOnly ? requestSearch.trim() : orderSearch.trim()) ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [token, requestsOnly, requestSearch, requestStatus, orderSearch]);
  // "Yeni satınalma siparişi" ayrı bir sekmede açılır; oluşturulan sipariş bu listeye döndüğünde
  // liste yenilenir ve sipariş detayı (mal kabul işlemleri) açılır.
  const purchaseOrdersChangedHandler = useRef<() => void>(() => undefined);
  purchaseOrdersChangedHandler.current = () => {
    if (requestsOnly) return;
    void load(requestPage, 1);
    const created = takeCreatedPurchaseOrder();
    if (created) {
      if (!created.openOnly) setNotice(`${created.code} satın alma siparişi oluşturuldu.`);
      void openOrder(created.id);
    }
  };
  useEffect(() => {
    if (requestsOnly) return;
    const created = takeCreatedPurchaseOrder();
    if (created) {
      if (!created.openOnly) setNotice(`${created.code} satın alma siparişi oluşturuldu.`);
      void openOrder(created.id);
    }
    const onChanged = () => purchaseOrdersChangedHandler.current();
    window.addEventListener(PURCHASE_ORDERS_CHANGED_EVENT, onChanged);
    return () =>
      window.removeEventListener(PURCHASE_ORDERS_CHANGED_EVENT, onChanged);
  }, [requestsOnly]);
  // Satınalma Teklifleri › Aç opens the quote's request here (the hand-off is read on mount and on the event).
  const purchaseRequestOpenHandler = useRef<() => void>(() => undefined);
  purchaseRequestOpenHandler.current = () => {
    if (!requestsOnly) return;
    const id = takePurchaseRequestOpen();
    if (id) void openRequest(id);
  };
  useEffect(() => {
    if (!requestsOnly) return;
    purchaseRequestOpenHandler.current();
    const onOpen = () => purchaseRequestOpenHandler.current();
    window.addEventListener(PURCHASE_REQUEST_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PURCHASE_REQUEST_OPEN_EVENT, onOpen);
  }, [requestsOnly]);
  useEffect(() => {
    if (requestsOnly) return;
    let cancelled = false;
    api<{ id?: string | null; fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-orders/active",
      token,
    )
      .then((view) => {
        // Without a published tenant view the server returns its catalog default; keep this screen's own default.
        if (!cancelled && view.id && view.fields?.length)
          setOrderScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, requestsOnly]);
  const visibleOrderScreenFields = useMemo(
    () =>
      orderScreenFields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position)
        // Keep the ⋯ menu reachable without scrolling sideways unless the tenant layout pins it elsewhere.
        .map((field) =>
          field.key === "actions" && !field.pinned
            ? { ...field, pinned: "right" as const, width: field.width || 64 }
            : field,
        ),
    [orderScreenFields],
  );
  const orderFieldVisible = (key: string) => visibleOrderScreenFields.some((field) => field.key === key);
  // Client-side status index: the list API filters by text only, so chip counts and chip filtering
  // read up to 1000 order summaries for the current search. It is rebuilt after every list load
  // (search changes, refreshes and mutations all go through load()).
  useEffect(() => {
    if (requestsOnly || orderIndexVersion === 0) return;
    let active = true;
    void (async () => {
      const items: PurchaseOrderSummary[] = [];
      let total = Infinity;
      for (let next = 1; next <= 10 && items.length < total && active; next += 1) {
        const page = await api<{ items: PurchaseOrderSummary[]; totalCount: number }>(
          `/api/purchasing/orders/?page=${next}&pageSize=100${orderSearch.trim() ? `&q=${encodeURIComponent(orderSearch.trim())}` : ""}`,
          token,
        );
        total = page.totalCount;
        items.push(...page.items);
        if (page.items.length === 0) break;
      }
      if (active) setOrderIndex({ items, complete: items.length >= total });
    })().catch(() => {
      if (active) setOrderIndex(null);
    });
    return () => {
      active = false;
    };
  }, [token, requestsOnly, orderIndexVersion]);
  const orderStatusMatches = (item: PurchaseOrderSummary, filter: typeof orderStatusFilter) =>
    filter === "" ? true : filter === "Overdue" ? isPurchaseOrderOverdue(item, today) : item.status === filter;
  const orderStatusCounts = orderIndex?.complete
    ? {
        all: orderIndex.items.length,
        Open: orderIndex.items.filter((item) => item.status === "Open").length,
        PartiallyReceived: orderIndex.items.filter((item) => item.status === "PartiallyReceived").length,
        Received: orderIndex.items.filter((item) => item.status === "Received").length,
        Overdue: orderIndex.items.filter((item) => isPurchaseOrderOverdue(item, today)).length,
      }
    : null;
  const filteredOrderIndex =
    orderStatusFilter && orderIndex ? orderIndex.items.filter((item) => orderStatusMatches(item, orderStatusFilter)) : null;
  const orderIndexPending = !!orderStatusFilter && !orderIndex;
  const displayedOrders = filteredOrderIndex
    ? filteredOrderIndex.slice((orderPage - 1) * purchasePageSize, orderPage * purchasePageSize)
    : orderIndexPending
      ? []
      : orders;
  const displayedOrderTotal = filteredOrderIndex ? filteredOrderIndex.length : orderTotal;
  // Visible rows need their order detail for the "Teslim alınan" column; the selected row always does
  // (lines and receipts in the side panel).
  const receivedColumnVisible = orderFieldVisible("receivedProgress");
  const selectedOrderForDetail = displayedOrders.find((item) => item.id === selectedOrderId)?.id;
  const orderDetailTargets = receivedColumnVisible
    ? displayedOrders.map((item) => item.id)
    : selectedOrderForDetail
      ? [selectedOrderForDetail]
      : [];
  useEffect(() => {
    if (requestsOnly) return;
    const ids = orderDetailTargets.filter((id) => !orderDetailCache.current.has(id));
    if (!ids.length) return;
    let active = true;
    void (async () => {
      for (let start = 0; start < ids.length && active; start += 5) {
        await Promise.all(
          ids.slice(start, start + 5).map(async (id) => {
            try {
              orderDetailCache.current.set(id, await api<PurchaseOrderDetail>(`/api/purchasing/orders/${id}`, token));
            } catch {
              orderDetailCache.current.set(id, "error");
            }
          }),
        );
        if (active) setOrderDetailCacheVersion((value) => value + 1);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, requestsOnly, orderDetailTargets.join(","), orderDetailCacheVersion]);
  const cachedOrderDetail = (id: string) => {
    const value = orderDetailCache.current.get(id);
    return value && value !== "error" ? value : null;
  };
  const orderReceivedTotals = (id: string) => {
    const order = cachedOrderDetail(id);
    if (!order) return null;
    return order.lines.reduce(
      (sum, line) => ({ ordered: sum.ordered + line.quantity, received: sum.received + line.receivedQuantity }),
      { ordered: 0, received: 0 },
    );
  };
  useEffect(() => {
    if (!requestsOnly) return;
    let cancelled = false;
    api<{ id?: string | null; fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-requests/active",
      token,
    )
      .then((view) => {
        // Without a published tenant view the server returns its catalog default; keep this screen's own default.
        if (!cancelled && view.id && view.fields?.length)
          setRequestScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, requestsOnly]);
  // Chip counts follow the current search but not the active chip; rebuilt after every list load.
  useEffect(() => {
    if (!requestsOnly || requestCountsVersion === 0) return;
    let active = true;
    const statuses = ["", "Submitted", "Approved", "Ordered", "Rejected"] as const;
    void Promise.all(
      statuses.map(async (status) => {
        const params = new URLSearchParams({ page: "1", pageSize: "1" });
        if (requestSearch.trim()) params.set("search", requestSearch.trim());
        if (status) params.set("status", status);
        const page = await api<PurchaseRequestPage>(`/api/purchasing/requests/?${params}`, token);
        return [status || "all", page.totalCount] as const;
      }),
    )
      .then((rows) => {
        if (active)
          setRequestStatusCounts(
            Object.fromEntries(rows) as Record<"all" | PurchaseRequestSummary["status"], number>,
          );
      })
      .catch(() => {
        if (active) setRequestStatusCounts(null);
      });
    return () => {
      active = false;
    };
  }, [token, requestsOnly, requestCountsVersion]);
  useEffect(() => {
    if (requestsOnly) return;
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-order-receipts/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setReceiptScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, requestsOnly]);
  const visibleRequestScreenFields = useMemo(
    () =>
      requestScreenFields
        .filter((field) => field.key === "actions" || field.visible)
        .sort((a, b) =>
          a.key === "actions"
            ? 1
            : b.key === "actions"
              ? -1
              : a.position - b.position,
        )
        // Keep the ⋯ menu reachable without scrolling sideways unless the tenant layout pins it elsewhere.
        .map((field) =>
          field.key === "actions" && !field.pinned
            ? { ...field, pinned: "right" as const, width: field.width || 64 }
            : field,
        ),
    [requestScreenFields],
  );
  const requestFieldVisible = (key: string) => visibleRequestScreenFields.some((field) => field.key === key);
  /** "N gün" until the need date, red "N gün geçti" after it; only while the request is still open. */
  const requestNeedHint = (request: PurchaseRequestSummary) => {
    if (!request.neededByDate || (request.status !== "Submitted" && request.status !== "Approved")) return null;
    const days = daysFromToday(request.neededByDate);
    if (days < 0) return { text: `${-days} gün geçti`, overdue: true };
    return { text: days === 0 ? "bugün" : `${days} gün`, overdue: false };
  };
  const visibleReceiptScreenFields = useMemo(
    () =>
      receiptScreenFields
        .filter((field) => field.key === "actions" || field.visible)
        .sort((a, b) =>
          a.key === "actions"
            ? 1
            : b.key === "actions"
              ? -1
              : a.position - b.position,
        ),
    [receiptScreenFields],
  );
  function renderPurchaseRequestCell(
    field: BuiltInScreenLayoutField,
    request: PurchaseRequestSummary,
  ) {
    switch (field.key) {
      case "code": {
        // Description and line count sit under the code unless the layout shows them as their own columns.
        const parts = [
          !requestFieldVisible("description") ? request.description : "",
          !requestFieldVisible("lineCount") ? `${request.lineCount} kalem` : "",
        ].filter(Boolean);
        return (
          <span className="po-list-code-cell">
            <button
              type="button"
              className="erp-link-button customer-code"
              aria-label={`${request.code} talep ayrıntılarını aç`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedRequestId(request.id);
                void openRequest(request.id);
              }}
            >
              {request.code}
            </button>
            {parts.length > 0 && (
              <small className="cell-subtitle pr-list-subtitle" title={request.description}>
                {parts.join(" · ")}
              </small>
            )}
          </span>
        );
      }
      case "description":
        return <span className="pr-list-description" title={request.description}>{request.description}</span>;
      case "requestedByName":
        return request.requestedByName || "—";
      case "requestDate":
        return formatDate(request.requestDate);
      case "neededByDate": {
        if (!request.neededByDate) return "—";
        const hint = requestNeedHint(request);
        return (
          <span className="po-list-code-cell">
            <span>{formatDate(request.neededByDate)}</span>
            {hint && (
              <small className={`cell-subtitle${hint.overdue ? " po-list-overdue" : ""}`}>{hint.text}</small>
            )}
          </span>
        );
      }
      case "quotes": {
        if (!requestHasQuotes(request.status)) return "—";
        const quotes = cachedRequestQuotes(request.id);
        if (!quotes)
          return requestQuoteCache.current.get(request.id) === "error" ? "—" : <span className="po-list-muted">…</span>;
        if (quotes.length === 0) return "—";
        const best = bestRequestQuote(quotes);
        return (
          <span className="pr-list-quotes">
            {best && best.comparableGrandTotal !== null
              ? `${quotes.length} · en iyi ${formatAmount(best.comparableGrandTotal, best.baseCurrencyCode)}`
              : `${quotes.length} teklif`}
          </span>
        );
      }
      case "lineCount":
        return request.lineCount;
      case "status":
        return <PurchaseRequestTag status={request.status} />;
      case "purchaseOrderCode":
        return request.purchaseOrderCode || "—";
      case "actions":
        return (
          <SalesRowActionsMenu label={request.code}>
            <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void openRequest(request.id)}>
              <Eye size={15} aria-hidden="true" /> İncele
            </button>
            {canDecideRequest(request) && (
              <>
                <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void decideFromList(request.id, true)}>
                  <Check size={15} aria-hidden="true" /> Onayla
                </button>
                <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void decideFromList(request.id, false)}>
                  <Ban size={15} aria-hidden="true" /> Reddet
                </button>
              </>
            )}
            {role === "TenantAdmin" && request.status === "Approved" && (
              <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void beginRequestQuoteFromList(request.id)}>
                <Plus size={15} aria-hidden="true" /> Teklif ekle
              </button>
            )}
            {role === "TenantAdmin" && request.status === "Approved" && !request.purchaseOrderId && (
              <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void beginRequestConversionFromList(request.id)}>
                <ShoppingCart size={15} aria-hidden="true" /> Siparişe dönüştür
              </button>
            )}
            {request.status === "Ordered" && request.purchaseOrderId && (
              <button
                type="button"
                role="menuitem"
                className="sales-row-menu-item"
                onClick={() => openLinkedPurchaseOrder(request.purchaseOrderId!, request.purchaseOrderCode || "")}
              >
                <ExternalLink size={15} aria-hidden="true" /> Siparişi aç
              </button>
            )}
          </SalesRowActionsMenu>
        );
      default:
        return null;
    }
  }
  function renderPurchaseReceiptCell(
    field: BuiltInScreenLayoutField,
    receipt: PurchaseReceipt,
  ) {
    switch (field.key) {
      case "code":
        return (
          <td key={field.key}>
            <span className="customer-code">{receipt.code}</span>
            {receipt.customFields?.some((item) => item.value) && (
              <small className="cell-subtitle">
                {receipt.customFields
                  .filter((item) => item.value)
                  .map((item) => `${item.label}: ${item.value}`)
                  .join(" · ")}
              </small>
            )}
          </td>
        );
      case "receiptDate":
        return (
          <td key={field.key}>
            {receipt.receiptDate.split("-").reverse().join(".")}
          </td>
        );
      case "warehouseName":
        return <td key={field.key}>{receipt.warehouseName}</td>;
      case "lineCount":
        return <td key={field.key}>{receipt.lineCount}</td>;
      case "status":
        return (
          <td key={field.key}>
            <DocumentStatusBadge status={purchaseReceiptStatus(receipt.status)} />
          </td>
        );
      case "invoice":
        return (
          <td key={field.key}>
            {receipt.invoice ? (
              <button
                className="row-action"
                disabled={busy}
                onClick={() => setInvoiceId(receipt.invoice!.id)}
              >
                {receipt.invoice.code} · kalan{" "}
                {receipt.invoice.outstandingAmount.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                })}{" "}
                {receipt.invoice.currencyCode}
              </button>
            ) : receipt.status === "Posted" ? (
              <button
                className="row-action"
                disabled={busy}
                onClick={() => {
                  setInvoiceReceiptId(receipt.id);
                  setInvoiceDate(receipt.receiptDate);
                  setInvoiceCode("");
                }}
              >
                Fatura oluştur
              </button>
            ) : (
              "—"
            )}
          </td>
        );
      case "actions":
        return (
          <td key={field.key}>
            {receipt.status === "Posted" && !receipt.invoice && (
              <button
                className="row-action danger-action"
                disabled={busy}
                onClick={() => void voidReceipt(receipt)}
              >
                İptal et
              </button>
            )}
          </td>
        );
      default:
        return <td key={field.key}>—</td>;
    }
  }
  function renderPurchaseOrderField(
    field: BuiltInScreenLayoutField,
    item: PurchaseOrderSummary,
  ) {
    switch (field.key) {
      case "code": {
        // Dates sit under the code unless the layout shows them as their own columns.
        const showDates = !orderFieldVisible("orderDate") && !orderFieldVisible("expectedReceiptDate");
        const overdue = isPurchaseOrderOverdue(item, today);
        return (
          <span className="po-list-code-cell">
            <button
              type="button"
              className="erp-link-button customer-code"
              aria-label={`${item.code} sipariş ayrıntılarını aç`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedOrderId(item.id);
                void openOrder(item.id);
              }}
            >
              {item.code}
            </button>
            {showDates && (
              <small className={`cell-subtitle${overdue ? " po-list-overdue" : ""}`}>
                {`${item.orderDate.slice(5, 10).split("-").reverse().join(".")} · teslim ${
                  item.expectedReceiptDate ? item.expectedReceiptDate.slice(5, 10).split("-").reverse().join(".") : "—"
                }`}
              </small>
            )}
          </span>
        );
      }
      case "supplierName": {
        const warehouse = !orderFieldVisible("targetWarehouseCode")
          ? warehouses.find((x) => x.id === item.targetWarehouseId)
          : undefined;
        return (
          <span className="po-list-supplier-cell">
            <b className="customer-name">{item.supplierName}</b>
            {warehouse && <small className="cell-subtitle">{warehouse.name}</small>}
          </span>
        );
      }
      case "receivedProgress": {
        const totals = orderReceivedTotals(item.id);
        if (!totals)
          return orderDetailCache.current.get(item.id) === "error" ? "—" : <span className="po-list-muted">…</span>;
        const share = totals.ordered > 0 ? Math.min(1, totals.received / totals.ordered) : 0;
        return (
          <span className="po-list-received">
            <span>
              {totals.received.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} /{" "}
              {totals.ordered.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}
            </span>
            <span
              className="po-list-bar"
              role="progressbar"
              aria-label={`${item.code} teslim alınan oranı`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(share * 100)}
            >
              <i style={{ width: `${share * 100}%` }} />
            </span>
          </span>
        );
      }
      case "orderDate":
        return item.orderDate.split("-").reverse().join(".");
      case "expectedReceiptDate":
        return item.expectedReceiptDate?.split("-").reverse().join(".") || "—";
      case "targetWarehouseCode":
        return (
          warehouses.find(
            (warehouse) => warehouse.id === item.targetWarehouseId,
          )?.code || "—"
        );
      case "lineCount":
        return item.lineCount;
      case "grandTotal":
        return orderFieldVisible("currencyCode") ? (
          <span>{item.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        ) : (
          listAmount(item.grandTotal, item.currencyCode)
        );
      case "currencyCode":
        return item.currencyCode;
      case "status":
        return <PurchaseOrderTag status={item.status} overdue={isPurchaseOrderOverdue(item, today)} />;
      case "actions":
        return (
          <SalesRowActionsMenu label={item.code}>
            <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void openOrder(item.id)}>
              <Eye size={15} aria-hidden="true" /> Siparişi aç
            </button>
            {canReceiveOrder(item.status) && (
              <button type="button" role="menuitem" className="sales-row-menu-item" onClick={() => void openOrderReceipt(item.id)}>
                <PackageCheck size={15} aria-hidden="true" /> Mal kabul ekle
              </button>
            )}
          </SalesRowActionsMenu>
        );
      default:
        return null;
    }
  }
  useEffect(() => {
    if (!detail) return;
    let active = true;
    void Promise.all(
      detail.lines.map(async (line) => {
        const result = await api<{ conversions: StockItemUnitConversion[] }>(
          `/api/stock/items/${line.stockItemId}/units`,
          token,
        );
        return [line.lineNumber, result.conversions] as const;
      }),
    )
      .then((rows) => {
        if (active) {
          setReceiptUnits(Object.fromEntries(rows));
          setEnteredReceiptUnits(
            Object.fromEntries(
              detail.lines.map((line) => [line.lineNumber, line.unitCode]),
            ),
          );
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [detail?.id, token]);
  async function openOrder(id: string) {
    setError("");
    try {
      const order = await api<PurchaseOrderDetail>(
        `/api/purchasing/orders/${id}`,
        token,
      );
      setDetail(order);
      setOrderFieldValues(
        Object.fromEntries(
          order.customFields.map((field) => [field.code, field.value]),
        ),
      );
      return order;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }
  /** Opens the goods-receipt form of an open or partially received order (detail "Mal kabul ekle"). */
  function beginReceipt(order: PurchaseOrderDetail) {
    const targetWarehouseId = warehouses.find((x) => x.isActive)?.id || "";
    setWarehouseId(targetWarehouseId);
    setReceiptLocationIds({});
    void loadReceiptLocations(targetWarehouseId);
    setReceiptFieldValues(
      Object.fromEntries(
        receiptFieldDefinitions.map((field) => [
          field.code,
          order.customFields.find(
            (source) => source.code.toLowerCase() === field.code.toLowerCase(),
          )?.value || "",
        ]),
      ),
    );
    setReceiptEditor(true);
  }
  const canReceiveOrder = (status: PurchaseOrderSummary["status"]) =>
    status !== "Received" && status !== "Cancelled";
  /** From the list: open the order and its goods-receipt form, then bring the form into view. */
  async function openOrderReceipt(id: string) {
    const order = await openOrder(id);
    if (!order || !canReceiveOrder(order.status)) return;
    beginReceipt(order);
    focusReceiptForm();
  }
  function focusReceiptForm() {
    window.setTimeout(() => {
      const form = document.querySelector<HTMLElement>(".doc-surface .sales-rf-embedded");
      form?.scrollIntoView({ block: "start", behavior: "smooth" });
      form?.querySelector<HTMLElement>(".rf-form input:not([type='hidden']), .rf-form select")?.focus({ preventScroll: true });
    }, 120);
  }
  async function openRequest(id: string) {
    setError("");
    setSupplierQuotes([]);
    setQuoteEditor(false);
    setOrderConversion(false);
    try {
      const request = await api<PurchaseRequestDetail>(
        `/api/purchasing/requests/${id}`,
        token,
      );
      setRequestDetail(request);
      setRequestFieldValues(
        Object.fromEntries(
          (request.customFields || []).map((field) => [
            field.code,
            field.value,
          ]),
        ),
      );
      if (request.status === "Approved" || request.status === "Ordered")
        setSupplierQuotes(
          await api<PurchaseSupplierQuote[]>(
            `/api/purchasing/requests/${id}/supplier-quotes`,
            token,
          ),
        );
      return request;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }
  async function loadRequestUnits(itemId: string) {
    if (!itemId || requestUnits[itemId]) return;
    try {
      const result = await api<{ conversions: StockItemUnitConversion[] }>(
        `/api/stock/items/${itemId}/units`,
        token,
      );
      setRequestUnits((current) => ({
        ...current,
        [itemId]: result.conversions,
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function beginRequestCreate() {
    setRequestLines([{ stockItemId: "", quantity: "1", unitCode: "" }]);
    setRequestUnits({});
    setRequestFieldValues(
      Object.fromEntries(
        requestFieldDefinitions.map((field) => [field.code, ""]),
      ),
    );
    setRequestEditor(true);
  }
  async function createRequestCustomField(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/purchasing/requests/custom-fields", token, {
        method: "POST",
        body: JSON.stringify({
          code: requestFieldCode,
          label: requestFieldLabel,
          dataType: requestFieldType,
          maxLength: Number(requestFieldMaxLength),
          isRequired: role === "TenantAdmin" && requestFieldRequired,
        }),
      });
      setRequestFieldCode("");
      setRequestFieldLabel("");
      setRequestFieldType("Text");
      setRequestFieldMaxLength("200");
      setRequestFieldRequired(false);
      setNotice("Satın alma talebi özel alanı oluşturuldu.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createOrderCustomField(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/purchasing/orders/custom-fields", token, {
        method: "POST",
        body: JSON.stringify({
          code: orderFieldCode,
          label: orderFieldLabel,
          dataType: orderFieldType,
          maxLength: Number(orderFieldMaxLength),
          isRequired: role === "TenantAdmin" && orderFieldRequired,
        }),
      });
      setOrderFieldCode("");
      setOrderFieldLabel("");
      setOrderFieldType("Text");
      setOrderFieldMaxLength("200");
      setOrderFieldRequired(false);
      setNotice("Satın alma siparişi özel alanı oluşturuldu.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editOrderCustomField(field: PurchaseOrderFieldDefinition) {
    const label = (
      await promptDialog({
        title: "Alan etiketi düzenlensin mi?",
        label: "Alan etiketi",
        message: `${field.label} için yeni bir tanım sürümü kaydedilir.`,
        defaultValue: field.label,
        required: true,
        tone: "default",
        confirmLabel: "Devam",
      })
    )?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(
            await promptDialog({
              title: "En fazla karakter",
              label: "En fazla karakter (1–500)",
              defaultValue: String(field.maxLength),
              required: true,
              tone: "default",
              confirmLabel: "Devam",
            }),
          )
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const isRequired =
      role === "TenantAdmin"
        ? await confirmDialog({
            title: "Bu alan zorunlu olsun mu?",
            message: "Vazgeçerseniz alan isteğe bağlı olarak kaydedilir.",
            tone: "default",
            confirmLabel: "Zorunlu yap",
            cancelLabel: "İsteğe bağlı",
          })
        : undefined;
    setBusy(true);
    setError("");
    try {
      await api(`/api/purchasing/orders/custom-fields/${field.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          label,
          maxLength,
          ...(isRequired === undefined ? {} : { isRequired }),
        }),
      });
      setNotice("Sipariş alanı güncellendi; yeni tanım sürümü kaydedildi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivateOrderCustomField(
    field: PurchaseOrderFieldDefinition,
  ) {
    if (
      !(await confirmDialog({
        title: "Sipariş alanı devre dışı bırakılsın mı?",
        message: `${field.label} alanı devre dışı bırakılır. Eski sipariş değerleri saklanır.`,
        tone: "warning",
        confirmLabel: "Devre dışı bırak",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/purchasing/orders/custom-fields/${field.id}`, token, {
        method: "DELETE",
      });
      setNotice("Sipariş alanı devre dışı bırakıldı.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openOrderFieldHistory(field: PurchaseOrderFieldDefinition) {
    setError("");
    try {
      setOrderFieldHistory(
        await api<PurchaseOrderFieldRevision[]>(
          `/api/purchasing/orders/custom-fields/${field.id}/history`,
          token,
        ),
      );
      setOrderFieldHistoryDefinition(field);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restoreOrderFieldRevision(
    revision: PurchaseOrderFieldRevision,
  ) {
    if (
      !orderFieldHistoryDefinition ||
      !(await confirmDialog({
        title: "Alan tanımı geri yüklensin mi?",
        message: `v${revision.version} alan tanımı yeni sürüm olarak geri yüklenir.`,
        tone: "warning",
        confirmLabel: "Geri yükle",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/purchasing/orders/custom-fields/${revision.definitionId}/restore`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            version: revision.version,
            confirmation: true,
          }),
        },
      );
      setNotice(`v${revision.version} tanımı yeni sürüm olarak geri yüklendi.`);
      await load();
      await openOrderFieldHistory(orderFieldHistoryDefinition);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveOrderCustomFields(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const fields = await api<PurchaseOrderFieldValue[]>(
        `/api/purchasing/orders/${detail.id}/custom-fields`,
        token,
        { method: "PUT", body: JSON.stringify({ values: orderFieldValues }) },
      );
      setDetail({ ...detail, customFields: fields });
      setNotice("Satın alma siparişi özel alanları kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editRequestCustomField(field: PurchaseRequestFieldDefinition) {
    const label = (
      await promptDialog({
        title: "Alan etiketi düzenlensin mi?",
        label: "Alan etiketi",
        message: `${field.label} için yeni bir tanım sürümü kaydedilir.`,
        defaultValue: field.label,
        required: true,
        tone: "default",
        confirmLabel: "Devam",
      })
    )?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(
            await promptDialog({
              title: "En fazla karakter",
              label: "En fazla karakter (1–500)",
              defaultValue: String(field.maxLength),
              required: true,
              tone: "default",
              confirmLabel: "Devam",
            }),
          )
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const required =
      role === "TenantAdmin"
        ? await confirmDialog({
            title: "Bu alan zorunlu olsun mu?",
            message: "Vazgeçerseniz alan isteğe bağlı olarak kaydedilir.",
            tone: "default",
            confirmLabel: "Zorunlu yap",
            cancelLabel: "İsteğe bağlı",
          })
        : undefined;
    setBusy(true);
    setError("");
    try {
      await api(`/api/purchasing/requests/custom-fields/${field.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          label,
          maxLength,
          ...(required === undefined ? {} : { isRequired: required }),
        }),
      });
      setNotice("Talep özel alanı güncellendi; yeni tanım sürümü kaydedildi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivateRequestCustomField(
    field: PurchaseRequestFieldDefinition,
  ) {
    if (
      !(await confirmDialog({
        title: "Talep alanı devre dışı bırakılsın mı?",
        message: `${field.label} alanı devre dışı bırakılır. Eski taleplerdeki değerler saklanır.`,
        tone: "warning",
        confirmLabel: "Devre dışı bırak",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/purchasing/requests/custom-fields/${field.id}`, token, {
        method: "DELETE",
      });
      setNotice("Talep özel alanı devre dışı bırakıldı.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openRequestFieldHistory(
    field: PurchaseRequestFieldDefinition,
  ) {
    setError("");
    try {
      setRequestFieldMetadataHistory(
        await api<PurchaseRequestFieldMetadataRevision[]>(
          `/api/purchasing/requests/custom-fields/${field.id}/history`,
          token,
        ),
      );
      setRequestFieldHistoryDefinition(field);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restoreRequestFieldRevision(
    revision: PurchaseRequestFieldMetadataRevision,
  ) {
    if (
      !(await confirmDialog({
        title: "Alan tanımı geri yüklensin mi?",
        message: `v${revision.version} alan tanımı yeni sürüm olarak geri yüklenir.`,
        tone: "warning",
        confirmLabel: "Geri yükle",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/purchasing/requests/custom-fields/${revision.definitionId}/restore`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            version: revision.version,
            confirmation: true,
          }),
        },
      );
      setNotice(`v${revision.version} tanımı yeni sürüm olarak geri yüklendi.`);
      await load();
      if (requestFieldHistoryDefinition)
        await openRequestFieldHistory(requestFieldHistoryDefinition);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openRequestValueHistory(field: PurchaseRequestFieldValue) {
    if (!requestDetail) return;
    setError("");
    try {
      setRequestFieldValueHistory(
        await api<PurchaseRequestFieldValueRevision[]>(
          `/api/purchasing/requests/${requestDetail.id}/custom-fields/${field.definitionId}/history`,
          token,
        ),
      );
      setRequestValueHistoryField(field);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restoreRequestValueRevision(
    revision: PurchaseRequestFieldValueRevision,
  ) {
    if (
      !requestDetail ||
      !requestValueHistoryField ||
      !(await confirmDialog({
        title: "Önceki değer geri yüklensin mi?",
        message: `'${requestValueHistoryField.label}' alanı için bu kayıt öncesindeki değer geri yüklenir.`,
        tone: "warning",
        confirmLabel: "Geri yükle",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/purchasing/requests/${requestDetail.id}/custom-fields/${revision.definitionId}/history/${revision.id}/restore`,
        token,
        { method: "POST", body: JSON.stringify({ confirmation: true }) },
      );
      setNotice("Önceki değer geri yüklendi ve yeni geçmiş kaydı eklendi.");
      await openRequest(requestDetail.id);
      await openRequestValueHistory(requestValueHistoryField);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveRequestCustomFields(e: React.FormEvent) {
    e.preventDefault();
    if (!requestDetail) return;
    setBusy(true);
    setError("");
    try {
      const fields = await api<PurchaseRequestFieldValue[]>(
        `/api/purchasing/requests/${requestDetail.id}/custom-fields`,
        token,
        { method: "PUT", body: JSON.stringify({ values: requestFieldValues }) },
      );
      setRequestDetail({ ...requestDetail, customFields: fields });
      setNotice("Satın alma talebi özel alanları kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<PurchaseRequestSummary>(
        "/api/purchasing/requests/",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code: requestCode,
            requestDate,
            neededByDate: neededByDate || null,
            description: requestDescription,
            lines: requestLines.map((x) => ({
              stockItemId: x.stockItemId,
              quantity: Number(x.quantity),
              unitCode:
                x.unitCode ||
                stockItems.find((item) => item.id === x.stockItemId)?.unitCode,
            })),
            customFields: requestFieldValues,
          }),
        },
      );
      setRequestEditor(false);
      setRequestCode("");
      setNeededByDate("");
      setRequestDescription("");
      setRequestLines([{ stockItemId: "", quantity: "1", unitCode: "" }]);
      setNotice(`${saved.code} satın alma talebi onaya gönderildi.`);
      await load(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** Called from the inline decision flow (side panel or detail), after its own confirm step. */
  async function decideRequest(
    request: PurchaseRequestSummary | PurchaseRequestDetail,
    approved: boolean,
    rawNote: string,
  ) {
    const note = rawNote.trim() || null;
    if (!approved && !note) {
      setDecision({ requestId: request.id, note: rawNote, confirm: null, error: "Ret gerekçesi zorunludur." });
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/purchasing/requests/${request.id}/decision`, token, {
        method: "POST",
        body: JSON.stringify({ approved, note }),
      });
      setNotice(
        `${request.code} talebi ${approved ? "onaylandı" : "reddedildi"}.`,
      );
      setDecision(null);
      setSelectedRequestId(request.id);
      setRequestDetail(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function beginOrderConversion(
    request: PurchaseRequestDetail,
    quote?: PurchaseSupplierQuote,
  ) {
    setConversionCode("");
    setConversionSupplierId(quote?.supplierId || "");
    setConversionDate(today);
    setConversionTargetWarehouseId("");
    setConversionNotes(quote ? `Tedarikçi teklifi ${quote.code}` : "");
    setSelectedQuoteForOrder(quote?.id || null);
    setConversionPrices(
      Object.fromEntries(
        request.lines.map((line) => {
          const priced = quote?.lines.find(
            (x) => x.requestLineNumber === line.lineNumber,
          );
          return [
            line.lineNumber,
            {
              unitPrice: priced?.unitPrice.toString() || "0",
              discountPercent: priced?.discountPercent.toString() || "0",
              vatPercent: priced?.vatPercent.toString() || "20",
            },
          ];
        }),
      ),
    );
    setConversionFieldValues(
      Object.fromEntries(
        orderFieldDefinitions.map((field) => [
          field.code,
          request.customFields?.find(
            (value) => value.code.toLowerCase() === field.code.toLowerCase(),
          )?.value || "",
        ]),
      ),
    );
    setOrderConversion(true);
  }
  async function convertPurchaseRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestDetail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api<PurchaseOrderSummary>(
        `/api/purchasing/requests/${requestDetail.id}/order`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code: conversionCode,
            supplierId: conversionSupplierId,
            orderDate: conversionDate,
            expectedReceiptDate: requestDetail.neededByDate,
            targetWarehouseId: conversionTargetWarehouseId || null,
            notes: conversionNotes || null,
            supplierQuoteId: selectedQuoteForOrder,
            customFields: conversionFieldValues,
            lines: requestDetail.lines.map((line) => ({
              lineNumber: line.lineNumber,
              unitPrice: Number(
                conversionPrices[line.lineNumber]?.unitPrice || 0,
              ),
              discountPercent: Number(
                conversionPrices[line.lineNumber]?.discountPercent || 0,
              ),
              vatPercent: Number(
                conversionPrices[line.lineNumber]?.vatPercent || 0,
              ),
            })),
          }),
        },
      );
      setOrderConversion(false);
      setRequestDetail(null);
      setNotice(
        `${created.code} siparişi ${requestDetail.code} talebinden oluşturuldu.`,
      );
      await load();
      await openOrder(created.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function beginQuoteCapture(request: PurchaseRequestDetail) {
    setQuoteCode("");
    setQuoteSupplierId("");
    setQuoteDate(today);
    setQuoteValidUntil("");
    setQuoteNotes("");
    setQuotePrices(
      Object.fromEntries(
        request.lines.map((line) => [
          line.lineNumber,
          { unitPrice: "0", discountPercent: "0", vatPercent: "20" },
        ]),
      ),
    );
    setSupplierQuoteFieldValues(
      Object.fromEntries(
        supplierQuoteFieldDefinitions.map((field) => [field.code, ""]),
      ),
    );
    setQuoteEditor(true);
  }
  async function createSupplierQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!requestDetail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const quote = await api<PurchaseSupplierQuote>(
        `/api/purchasing/requests/${requestDetail.id}/supplier-quotes`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code: quoteCode,
            supplierId: quoteSupplierId,
            quoteDate,
            validUntil: quoteValidUntil || null,
            notes: quoteNotes || null,
            customFields: supplierQuoteFieldValues,
            lines: requestDetail.lines.map((line) => ({
              requestLineNumber: line.lineNumber,
              unitPrice: Number(quotePrices[line.lineNumber]?.unitPrice || 0),
              discountPercent: Number(
                quotePrices[line.lineNumber]?.discountPercent || 0,
              ),
              vatPercent: Number(quotePrices[line.lineNumber]?.vatPercent || 0),
            })),
          }),
        },
      );
      // The POST response has no base-currency comparison, which the list then showed as
      // "Baz para birimine çevrilemedi"; reload the request's quotes as the detail view does.
      const refreshedQuotes = await api<PurchaseSupplierQuote[]>(
        `/api/purchasing/requests/${requestDetail.id}/supplier-quotes`,
        token,
      );
      setSupplierQuotes(refreshedQuotes);
      requestQuoteCache.current.set(requestDetail.id, refreshedQuotes);
      setRequestQuoteCacheVersion((value) => value + 1);
      setQuoteEditor(false);
      setNotice(`${quote.supplierName} için ${quote.code} teklifi kaydedildi.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createSupplierQuoteCustomField(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/purchasing/supplier-quotes/custom-fields", token, {
        method: "POST",
        body: JSON.stringify({
          code: supplierQuoteFieldCode,
          label: supplierQuoteFieldLabel,
          dataType: supplierQuoteFieldType,
          maxLength: Number(supplierQuoteFieldMaxLength),
          isRequired: role === "TenantAdmin" && supplierQuoteFieldRequired,
        }),
      });
      setSupplierQuoteFieldCode("");
      setSupplierQuoteFieldLabel("");
      setSupplierQuoteFieldType("Text");
      setSupplierQuoteFieldMaxLength("200");
      setSupplierQuoteFieldRequired(false);
      setNotice("Tedarikçi teklifi özel alanı oluşturuldu.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editSupplierQuoteCustomField(
    field: PurchaseSupplierQuoteFieldDefinition,
  ) {
    const label = (
      await promptDialog({
        title: "Alan etiketi düzenlensin mi?",
        label: "Alan etiketi",
        message: `${field.label} için yeni bir tanım sürümü kaydedilir.`,
        defaultValue: field.label,
        required: true,
        tone: "default",
        confirmLabel: "Devam",
      })
    )?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(
            await promptDialog({
              title: "En fazla karakter",
              label: "En fazla karakter (1–500)",
              defaultValue: String(field.maxLength),
              required: true,
              tone: "default",
              confirmLabel: "Devam",
            }),
          )
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const isRequired =
      role === "TenantAdmin"
        ? await confirmDialog({
            title: "Bu alan zorunlu olsun mu?",
            message: "Vazgeçerseniz alan isteğe bağlı olarak kaydedilir.",
            tone: "default",
            confirmLabel: "Zorunlu yap",
            cancelLabel: "İsteğe bağlı",
          })
        : undefined;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/purchasing/supplier-quotes/custom-fields/${field.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
          label,
          maxLength,
          ...(isRequired === undefined ? {} : { isRequired }),
        }),
        },
      );
      setNotice("Tedarikçi teklifi alanı güncellendi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivateSupplierQuoteCustomField(
    field: PurchaseSupplierQuoteFieldDefinition,
  ) {
    if (
      !(await confirmDialog({
        title: "Teklif alanı devre dışı bırakılsın mı?",
        message: `${field.label} alanı devre dışı bırakılır. Eski teklifler korunur.`,
        tone: "warning",
        confirmLabel: "Devre dışı bırak",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/purchasing/supplier-quotes/custom-fields/${field.id}`,
        token,
        { method: "DELETE" },
      );
      setNotice("Tedarikçi teklifi alanı devre dışı bırakıldı.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createReceiptCustomField(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/purchasing/receipts/custom-fields", token, {
        method: "POST",
        body: JSON.stringify({
          code: receiptFieldCode,
          label: receiptFieldLabel,
          dataType: receiptFieldType,
          maxLength: Number(receiptFieldMaxLength),
          isRequired: role === "TenantAdmin" && receiptFieldRequired,
        }),
      });
      setReceiptFieldCode("");
      setReceiptFieldLabel("");
      setReceiptFieldType("Text");
      setReceiptFieldMaxLength("200");
      setReceiptFieldRequired(false);
      setNotice("Mal kabul özel alanı oluşturuldu.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editReceiptCustomField(field: PurchaseReceiptFieldDefinition) {
    const label = (
      await promptDialog({
        title: "Alan etiketi düzenlensin mi?",
        label: "Alan etiketi",
        message: `${field.label} için yeni bir tanım sürümü kaydedilir.`,
        defaultValue: field.label,
        required: true,
        tone: "default",
        confirmLabel: "Devam",
      })
    )?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(
            await promptDialog({
              title: "En fazla karakter",
              label: "En fazla karakter (1–500)",
              defaultValue: String(field.maxLength),
              required: true,
              tone: "default",
              confirmLabel: "Devam",
            }),
          )
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const isRequired =
      role === "TenantAdmin"
        ? await confirmDialog({
            title: "Yeni mal kabullerde bu alan zorunlu olsun mu?",
            message: "Vazgeçerseniz alan isteğe bağlı olarak kaydedilir.",
            tone: "default",
            confirmLabel: "Zorunlu yap",
            cancelLabel: "İsteğe bağlı",
          })
        : undefined;
    setBusy(true);
    setError("");
    try {
      await api(`/api/purchasing/receipts/custom-fields/${field.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          label,
          maxLength,
          ...(isRequired === undefined ? {} : { isRequired }),
        }),
      });
      setNotice("Mal kabul alanı güncellendi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivateReceiptCustomField(
    field: PurchaseReceiptFieldDefinition,
  ) {
    if (
      !(await confirmDialog({
        title: "Mal kabul alanı devre dışı bırakılsın mı?",
        message: `${field.label} alanı devre dışı bırakılır. Geçmiş mal kabuller korunur.`,
        tone: "warning",
        confirmLabel: "Devre dışı bırak",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/purchasing/receipts/custom-fields/${field.id}`, token, {
        method: "DELETE",
      });
      setNotice("Mal kabul alanı devre dışı bırakıldı.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadReceiptLocations(targetWarehouseId: string) {
    if (!targetWarehouseId) {
      setReceiptLocations([]);
      return;
    }
    try {
      setReceiptLocations(
        (
          await api<WarehouseLocationOption[]>(
            `/api/warehouses/${targetWarehouseId}/locations`,
            token,
          )
        ).filter((location) => location.isActive),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Tracking codes are asked line by line, in order, before the receipt is posted.
      const receiptLines: {
        orderLineNumber: number;
        quantity: number;
        unitCode: string;
        tracking: {
          trackingCode: string;
          quantity: number;
          expiryDate?: string | null;
        }[];
        storageLocationId: string | null;
      }[] = [];
      for (const x of detail.lines) {
        const receivedQuantity = Number(quantities[x.lineNumber] || 0);
        if (receivedQuantity <= 0) continue;
        const unitCode =
            enteredReceiptUnits[x.lineNumber] || x.unitCode,
          factor =
            unitCode === x.unitCode
              ? 1
              : (receiptUnits[x.lineNumber] || []).find(
                  (u) => u.unitCode === unitCode,
                )?.factorToBase || 1,
          baseQuantity = receivedQuantity * factor,
          tracked = stockItems.find(
            (item) => item.id === x.stockItemId,
          );
        let tracking: {
          trackingCode: string;
          quantity: number;
          expiryDate?: string | null;
        }[] = [];
        if (tracked?.trackingMode === "Serial") {
          const input = await promptDialog({
            title: "Seri numaralarını girin",
            label: "Seri numaraları",
            message: `${x.stockCode} için seri numaralarını virgül veya yeni satırla girin (${baseQuantity} temel birim).`,
            multiline: true,
            tone: "default",
            confirmLabel: "Devam",
          });
          if (input === null)
            throw new Error("Mal kabul iptal edildi.");
          tracking = input
            .split(/[\n,;]/)
            .map((trackingCode) => ({
              trackingCode: trackingCode.trim(),
              quantity: 1,
            }))
            .filter((item) => item.trackingCode);
        } else if (tracked?.trackingMode === "Lot") {
          const trackingCode = await promptDialog({
            title: "Lot kodunu girin",
            label: `${x.stockCode} lot kodu`,
            tone: "default",
            confirmLabel: "Devam",
          });
          if (trackingCode === null)
            throw new Error("Mal kabul iptal edildi.");
          const expiryDate = await promptDialog({
            title: "Son kullanma tarihini girin",
            label: `${x.stockCode} son kullanma tarihi (YYYY-MM-DD)`,
            placeholder: "YYYY-MM-DD",
            tone: "default",
            confirmLabel: "Devam",
          });
          if (expiryDate === null)
            throw new Error("Mal kabul iptal edildi.");
          tracking = [
            {
              trackingCode: trackingCode.trim(),
              quantity: baseQuantity,
              expiryDate,
            },
          ];
        }
        receiptLines.push({
          orderLineNumber: x.lineNumber,
          quantity: receivedQuantity,
          unitCode,
          tracking,
          storageLocationId: receiptLocationIds[x.lineNumber] || null,
        });
      }
      await api<PurchaseReceipt>(
        `/api/purchasing/orders/${detail.id}/receipts`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId,
            warehouseId,
            receiptDate,
            customFields: receiptFieldValues,
            lines: receiptLines,
          }),
        },
      );
      setRequestId(crypto.randomUUID());
      setQuantities({});
      setReceiptLocationIds({});
      setReceiptFieldValues({});
      setReceiptEditor(false);
      setNotice("Mal kabul kaydedildi; seçilen depoya stok girişi işlendi.");
      await load();
      await openOrder(detail.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidReceipt(receipt: PurchaseReceipt) {
    if (
      !detail ||
      !(await confirmDialog({
        title: "Mal kabul iptal edilsin mi?",
        message: `${receipt.code} mal kabulü iptal edilir. İptal stok bakiyesini negatife düşürmemelidir.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/purchasing/receipts/${receipt.id}/void`, token, {
        method: "POST",
      });
      setNotice(
        `${receipt.code} mal kabul iptal edildi; stok hareketleri ters kaydedildi.`,
      );
      await load();
      await openOrder(detail.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createPurchaseInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !invoiceReceiptId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const invoice = await api<PurchaseInvoiceSummary>(
        `/api/purchasing/receipts/${invoiceReceiptId}/invoice`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ code: invoiceCode, invoiceDate }),
        },
      );
      setNotice(
        `${invoice.code} alış faturası oluşturuldu; vade ${invoice.dueDate.split("-").reverse().join(".")}.`,
      );
      setInvoiceReceiptId(null);
      setInvoiceCode("");
      await load();
      await openOrder(detail.id);
      setInvoiceId(invoice.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const supplierOptions = customers.filter(
    (x) => x.isActive && (x.type === "Supplier" || x.type === "Both"),
  );
  // List type: the current row is the one the user chose (click, ↑/↓), never an implicit first row.
  const selectedOrderSummary = displayedOrders.find((item) => item.id === selectedOrderId) ?? null;
  const selectedRequestSummary = purchaseRequests.find((item) => item.id === selectedRequestId) ?? null;
  const requestHasQuotes = (status: PurchaseRequestSummary["status"]) =>
    status === "Approved" || status === "Ordered";
  // Quotes exist only after approval, so only approved/ordered rows are fetched (5 at a time).
  const requestQuoteTargets = requestsOnly
    ? (requestFieldVisible("quotes")
        ? purchaseRequests
        : selectedRequestSummary
          ? [selectedRequestSummary]
          : []
      )
        .filter((item) => requestHasQuotes(item.status))
        .map((item) => item.id)
    : [];
  useEffect(() => {
    if (!requestsOnly) return;
    const ids = requestQuoteTargets.filter((id) => !requestQuoteCache.current.has(id));
    if (!ids.length) return;
    let active = true;
    void (async () => {
      for (let start = 0; start < ids.length && active; start += 5) {
        await Promise.all(
          ids.slice(start, start + 5).map(async (id) => {
            try {
              requestQuoteCache.current.set(
                id,
                await api<PurchaseSupplierQuote[]>(`/api/purchasing/requests/${id}/supplier-quotes`, token),
              );
            } catch {
              requestQuoteCache.current.set(id, "error");
            }
          }),
        );
        if (active) setRequestQuoteCacheVersion((value) => value + 1);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, requestsOnly, requestQuoteTargets.join(","), requestQuoteCacheVersion]);
  const cachedRequestQuotes = (id: string) => {
    const value = requestQuoteCache.current.get(id);
    return value && value !== "error" ? value : null;
  };
  /** Lowest base-currency total among the quotes that can be compared; null when none can. */
  const bestRequestQuote = (quotes: PurchaseSupplierQuote[]) =>
    quotes.reduce<PurchaseSupplierQuote | null>(
      (best, quote) =>
        quote.comparableGrandTotal !== null &&
        (best === null || quote.comparableGrandTotal < (best.comparableGrandTotal ?? Infinity))
          ? quote
          : best,
      null,
    );
  // A note typed for one request never posts for another: the flow resets when the selection moves.
  useEffect(() => {
    setDecision((current) =>
      current && current.requestId !== selectedRequestSummary?.id && current.requestId !== requestDetail?.id
        ? null
        : current,
    );
  }, [selectedRequestSummary?.id, requestDetail?.id]);
  const canDecideRequest = (request: Pick<PurchaseRequestSummary, "status" | "requestedByUserId">) =>
    role === "TenantAdmin" && request.status === "Submitted" && request.requestedByUserId !== currentUserId;
  /** Opens the purchase order in the "Satınalma siparişleri" tab (it reads the same hand-off as the create page). */
  function openLinkedPurchaseOrder(id: string, code: string) {
    try {
      sessionStorage.setItem(createdPurchaseOrderStorageKey, JSON.stringify({ id, code, intent: "open" }));
    } catch {
      /* Session storage is optional; a mounted orders tab still reacts to the event. */
    }
    window.dispatchEvent(new CustomEvent(PURCHASE_ORDERS_CHANGED_EVENT, { detail: { id } }));
    onNavigate?.("sales-purchasing");
  }
  async function beginRequestQuoteFromList(id: string) {
    const request = await openRequest(id);
    if (!request || request.status !== "Approved") return;
    beginQuoteCapture(request);
    focusRequestDetailForm(".pr-detail-quotes");
  }
  async function beginRequestConversionFromList(id: string) {
    const request = await openRequest(id);
    if (!request || request.status !== "Approved" || request.purchaseOrderId) return;
    beginOrderConversion(request);
    focusRequestDetailForm(".pr-detail-conversion");
  }
  /**
   * Onayla / Reddet from the list (row menu, İşlemler): the request opens and its decision panel takes the step, as
   * Teklif ekle does (the list panel may be closed on a narrow screen).
   */
  async function decideFromList(id: string, approved: boolean) {
    const request = await openRequest(id);
    if (!request || !canDecideRequest(request)) return;
    startDecision(request, approved);
    focusRequestDecision(approved);
  }
  function focusRequestDecision(approved: boolean) {
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>(".doc-surface .pr-detail-decision .pr-decision");
      panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      panel
        ?.querySelector<HTMLElement>(approved ? ".pr-decision-confirm button.primary" : "textarea")
        ?.focus({ preventScroll: true });
    }, 120);
  }
  function focusRequestDetailForm(target = ".pr-detail-form-target") {
    window.setTimeout(() => {
      const form = document.querySelector<HTMLElement>(`.doc-surface ${target} form`);
      form?.scrollIntoView({ block: "start", behavior: "smooth" });
      form?.querySelector<HTMLElement>("input:not([type='hidden']):not([readonly]), select")?.focus({ preventScroll: true });
    }, 120);
  }
  function startDecision(request: PurchaseRequestSummary | PurchaseRequestDetail, approved?: boolean) {
    setSelectedRequestId(request.id);
    setDecision((current) => {
      const base = current?.requestId === request.id ? current : { requestId: request.id, note: "", confirm: null, error: "" };
      if (approved === undefined) return base;
      if (!approved && !base.note.trim()) return { ...base, confirm: null, error: "Ret gerekçesi zorunludur." };
      return { ...base, confirm: approved ? "approve" : "reject", error: "" };
    });
  }
  function renderDecisionControls(request: PurchaseRequestSummary | PurchaseRequestDetail, idPrefix: string) {
    if (role !== "TenantAdmin" || request.status !== "Submitted") return null;
    if (request.requestedByUserId === currentUserId)
      return (
        <p className="pr-decision-own">
          Kendi talebinizi onaylayamaz veya reddedemezsiniz; kararı başka bir yetkili verir.
        </p>
      );
    const state =
      decision?.requestId === request.id ? decision : { requestId: request.id, note: "", confirm: null, error: "" };
    const noteId = `${idPrefix}-decision-note-${request.id}`;
    return (
      <div className="pr-decision">
        <label htmlFor={noteId}>Karar notu</label>
        <textarea
          id={noteId}
          rows={2}
          maxLength={500}
          value={state.note}
          disabled={busy}
          placeholder="Onaylarken isteğe bağlı, reddederken zorunlu"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${noteId}-error` : undefined}
          onChange={(e) =>
            setDecision({ requestId: request.id, note: e.target.value, confirm: null, error: "" })
          }
        />
        {state.error && (
          <p className="pr-decision-error" id={`${noteId}-error`} role="alert">
            {state.error}
          </p>
        )}
        {state.confirm ? (
          <div className="pr-decision-confirm" role="group" aria-label="Kararı onaylayın">
            <span>{state.confirm === "approve" ? "Bu talep onaylansın mı?" : "Bu talep reddedilsin mi?"}</span>
            <div className="pr-decision-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setDecision({ ...state, confirm: null })}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={state.confirm === "approve" ? "primary" : "primary danger-action"}
                disabled={busy}
                onClick={() => void decideRequest(request, state.confirm === "approve", state.note)}
              >
                {busy ? "Kaydediliyor…" : state.confirm === "approve" ? "Evet, onayla" : "Evet, reddet"}
              </button>
            </div>
          </div>
        ) : (
          <div className="pr-decision-actions">
            <button
              type="button"
              className="secondary danger-action"
              disabled={busy}
              onClick={() => startDecision(request, false)}
            >
              Reddet
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => startDecision(request, true)}>
              Onayla
            </button>
          </div>
        )}
      </div>
    );
  }
  const canManagePurchaseFields = role === "TenantAdmin" || role === "TenantDeveloper";
  const requestFieldsSection = (
    <section className="panel request-field-settings po-fields-section">
      <div className="panel-heading">
        <div>
          <b>Talep alanları</b>
          <small>
            Tanımlar tenant kapsamındadır; yeni taleplerde doldurulur ve
            sürüm geçmişi korunur.
          </small>
        </div>
      </div>
      <div className="requests-list">
        {requestFieldDefinitions.map((field) => (
          <article className="request-row" key={field.id}>
            <div className="request-info">
              <b>
                {field.label} · {field.code}
              </b>
              <small>
                {field.dataType}
                {field.dataType === "Text"
                  ? ` · en fazla ${field.maxLength} karakter`
                  : ""}{" "}
                · v{field.version}
                {field.isRequired ? " · zorunlu" : ""}
              </small>
            </div>
            <button
              className="row-action"
              disabled={busy}
              onClick={() => void editRequestCustomField(field)}
            >
              Düzenle
            </button>
            <button
              className="row-action"
              disabled={busy}
              onClick={() => void openRequestFieldHistory(field)}
            >
              Sürüm geçmişi
            </button>
            {role === "TenantAdmin" && (
              <button
                className="row-action danger-action"
                disabled={busy}
                onClick={() => void deactivateRequestCustomField(field)}
              >
                Devre dışı bırak
              </button>
            )}
          </article>
        ))}
        {requestFieldDefinitions.length === 0 && (
          <div className="empty-small">Henüz talep özel alanı yok.</div>
        )}
      </div>
      {requestFieldHistoryDefinition && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-heading">
            <div>
              <b>
                {requestFieldHistoryDefinition.code} · tanım geçmişi
              </b>
              <small>Geri yükleme yeni bir sürüm ekler.</small>
            </div>
            <button
              type="button"
              className="secondary small-button"
              onClick={() => setRequestFieldHistoryDefinition(null)}
            >
              Kapat
            </button>
          </div>
          <div className="requests-list">
            {requestFieldMetadataHistory.map((revision) => (
              <article className="request-row" key={revision.id}>
                <div className="request-info">
                  <b>
                    v{revision.version} · {revision.label}
                  </b>
                  <small>
                    {revision.dataType}
                    {revision.dataType === "Text"
                      ? ` · en fazla ${revision.maxLength} karakter`
                      : ""}
                    {revision.isRequired ? " · zorunlu" : ""} ·{" "}
                    {revision.isActive ? "Etkin" : "Devre dışı"} ·{" "}
                    {revision.changeKind} ·{" "}
                    {new Date(revision.createdAt).toLocaleString(
                      "tr-TR",
                    )}
                  </small>
                </div>
                {role === "TenantAdmin" && (
                  <button
                    type="button"
                    className="secondary small-button"
                    disabled={busy}
                    onClick={() =>
                      void restoreRequestFieldRevision(revision)
                    }
                  >
                    Bu sürümü geri yükle
                  </button>
                )}
              </article>
            ))}
            {requestFieldMetadataHistory.length === 0 && (
              <div className="empty-small">
                Tanım geçmişi bulunmuyor.
              </div>
            )}
          </div>
        </section>
      )}
      <form
        className="collection-form"
        onSubmit={createRequestCustomField}
      >
        <div className="form-two">
          <label>
            Alan kodu
            <input
              value={requestFieldCode}
              onChange={(e) =>
                setRequestFieldCode(e.target.value.toUpperCase())
              }
              required
              maxLength={40}
              placeholder="PROJE_KODU"
            />
          </label>
          <label>
            Ekran etiketi
            <input
              value={requestFieldLabel}
              onChange={(e) => setRequestFieldLabel(e.target.value)}
              required
              maxLength={120}
              placeholder="Proje kodu"
            />
          </label>
        </div>
        <div className="form-two">
          <label>
            Veri türü
            <select
              value={requestFieldType}
              onChange={(e) =>
                setRequestFieldType(
                  e.target
                    .value as PurchaseRequestFieldDefinition["dataType"],
                )
              }
            >
              <option value="Text">Metin</option>
              <option value="Decimal">Ondalık sayı</option>
              <option value="Date">Tarih</option>
              <option value="Boolean">Evet/Hayır</option>
            </select>
          </label>
          {requestFieldType === "Text" && (
            <label>
              En fazla karakter
              <input
                type="number"
                min="1"
                max="500"
                value={requestFieldMaxLength}
                onChange={(e) =>
                  setRequestFieldMaxLength(e.target.value)
                }
                required
              />
            </label>
          )}
        </div>
        {role === "TenantAdmin" ? (
          <label className="check-row">
            <input
              type="checkbox"
              checked={requestFieldRequired}
              onChange={(e) => setRequestFieldRequired(e.target.checked)}
            />{" "}
            Yeni taleplerde zorunlu olsun
          </label>
        ) : (
          <p className="muted">Geliştirici alanları isteğe bağlıdır.</p>
        )}
        <div className="modal-foot">
          <span>
            Zorunlu alanı mevcut talepler varken açmak için önce
            taleplere değer girilmelidir.
          </span>
          <button className="secondary" disabled={busy}>
            Alan tanımı ekle
          </button>
        </div>
      </form>
    </section>
  );
  const supplierQuoteFieldsSection = (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-heading">
        <div>
          <b>Tedarikçi teklifi alanları</b>
          <small>
            Tenant kapsamlı, tür doğrulamalı teklif metadata alanları.
          </small>
        </div>
      </div>
      <div className="requests-list">
        {supplierQuoteFieldDefinitions.map((field) => (
          <article className="request-row" key={field.id}>
            <div className="request-info">
              <b>
                {field.label} · {field.code}
              </b>
              <small>
                {field.dataType} · v{field.version}
                {field.isRequired ? " · zorunlu" : ""}
              </small>
            </div>
            <button
              className="row-action"
              disabled={busy}
              onClick={() => void editSupplierQuoteCustomField(field)}
            >
              Edit
            </button>
            {role === "TenantAdmin" && (
              <button
                className="row-action danger-action"
                disabled={busy}
                onClick={() => void deactivateSupplierQuoteCustomField(field)}
              >
                Disable
              </button>
            )}
          </article>
        ))}
        {supplierQuoteFieldDefinitions.length === 0 && (
          <div className="empty-small">Henüz teklif alanı yok.</div>
        )}
      </div>
      <form
        className="collection-form"
        onSubmit={createSupplierQuoteCustomField}
      >
        <div className="form-two">
          <label>
            Alan kodu
            <input
              value={supplierQuoteFieldCode}
              onChange={(e) =>
                setSupplierQuoteFieldCode(e.target.value.toUpperCase())
              }
              required
              maxLength={40}
            />
          </label>
          <label>
            Ekran etiketi
            <input
              value={supplierQuoteFieldLabel}
              onChange={(e) => setSupplierQuoteFieldLabel(e.target.value)}
              required
              maxLength={120}
            />
          </label>
        </div>
        <div className="form-two">
          <label>
            Veri türü
            <select
              value={supplierQuoteFieldType}
              onChange={(e) =>
                setSupplierQuoteFieldType(
                  e.target
                    .value as PurchaseSupplierQuoteFieldDefinition["dataType"],
                )
              }
            >
              <option value="Text">Metin</option>
              <option value="Decimal">Ondalık sayı</option>
              <option value="Date">Tarih</option>
              <option value="Boolean">Evet/Hayır</option>
            </select>
          </label>
          {supplierQuoteFieldType === "Text" && (
            <label>
              En fazla karakter
              <input
                type="number"
                min="1"
                max="500"
                value={supplierQuoteFieldMaxLength}
                onChange={(e) =>
                  setSupplierQuoteFieldMaxLength(e.target.value)
                }
                required
              />
            </label>
          )}
        </div>
        {role === "TenantAdmin" ? (
          <label className="check-row">
            <input
              type="checkbox"
              checked={supplierQuoteFieldRequired}
              onChange={(e) =>
                setSupplierQuoteFieldRequired(e.target.checked)
              }
            />{" "}
            Tekliflerde zorunlu olsun
          </label>
        ) : (
          <p className="muted">Geliştirici alanları isteğe bağlıdır.</p>
        )}
        <div className="modal-foot">
          <span>
            Zorunlu alan açmak için önce mevcut teklifler doldurulmalıdır.
          </span>
          <button className="secondary" disabled={busy}>
            Alan ekle
          </button>
        </div>
      </form>
    </section>
  );
  const orderFieldsSection = (
    <section className="panel purchase-settings-panel po-fields-section">
      <div className="panel-heading">
        <div>
          <b>Sipariş alanları</b>
          <small>
            Talep dönüşümünde eşleşen kodlar aktarılır; alanlar tenant
            kapsamındadır.
          </small>
        </div>
      </div>
      <div className="requests-list">
        {orderFieldDefinitions.map((field) => (
          <article className="request-row" key={field.id}>
            <div className="request-info">
              <b>
                {field.label} · {field.code}
              </b>
              <small>
                {field.dataType} · v{field.version}
                {field.isRequired ? " · zorunlu" : ""}
              </small>
            </div>
            <button
              className="row-action"
              disabled={busy}
              onClick={() => void editOrderCustomField(field)}
            >
              Düzenle
            </button>
            <button
              className="row-action"
              disabled={busy}
              onClick={() => void openOrderFieldHistory(field)}
            >
              Sürüm geçmişi
            </button>
            {role === "TenantAdmin" && (
              <button
                className="row-action danger-action"
                disabled={busy}
                onClick={() => void deactivateOrderCustomField(field)}
              >
                Devre dışı bırak
              </button>
            )}
          </article>
        ))}
      </div>
      {orderFieldHistoryDefinition && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-heading">
            <div>
              <b>{orderFieldHistoryDefinition.code} · tanım geçmişi</b>
              <small>Geri yükleme yeni sürüm ekler.</small>
            </div>
            <button
              type="button"
              className="secondary small-button"
              onClick={() => setOrderFieldHistoryDefinition(null)}
            >
              Kapat
            </button>
          </div>
          <div className="requests-list">
            {orderFieldHistory.map((revision) => (
              <article className="request-row" key={revision.id}>
                <div className="request-info">
                  <b>
                    v{revision.version} · {revision.label}
                  </b>
                  <small>
                    {revision.dataType}
                    {revision.isRequired ? " · zorunlu" : ""} ·{" "}
                    {revision.isActive ? "Etkin" : "Devre dışı"} ·{" "}
                    {revision.changeKind} ·{" "}
                    {new Date(revision.createdAt).toLocaleString("tr-TR")}
                  </small>
                </div>
            {role === "TenantAdmin" && (
              <button
                type="button"
                className="secondary small-button"
                disabled={busy}
                onClick={() => void restoreOrderFieldRevision(revision)}
              >
                Bu sürümü geri yükle
              </button>
            )}
              </article>
            ))}
          </div>
        </section>
      )}
      <form className="collection-form" onSubmit={createOrderCustomField}>
        <div className="form-two">
          <label>
            Alan kodu
            <input
              value={orderFieldCode}
              onChange={(e) =>
                setOrderFieldCode(e.target.value.toUpperCase())
              }
              required
              maxLength={40}
            />
          </label>
          <label>
            Ekran etiketi
            <input
              value={orderFieldLabel}
              onChange={(e) => setOrderFieldLabel(e.target.value)}
              required
              maxLength={120}
            />
          </label>
        </div>
        <div className="form-two">
          <label>
            Veri türü
            <select
              value={orderFieldType}
              onChange={(e) =>
                setOrderFieldType(
                  e.target
                    .value as PurchaseOrderFieldDefinition["dataType"],
                )
              }
            >
              <option value="Text">Metin</option>
              <option value="Decimal">Ondalık sayı</option>
              <option value="Date">Tarih</option>
              <option value="Boolean">Evet/Hayır</option>
            </select>
          </label>
          {orderFieldType === "Text" && (
            <label>
              En fazla karakter
              <input
                type="number"
                min="1"
                max="500"
                value={orderFieldMaxLength}
                onChange={(e) => setOrderFieldMaxLength(e.target.value)}
                required
              />
            </label>
          )}
        </div>
        {role === "TenantAdmin" ? (
          <label className="check-row">
            <input
              type="checkbox"
              checked={orderFieldRequired}
              onChange={(e) => setOrderFieldRequired(e.target.checked)}
            />{" "}
            Zorunlu alan
          </label>
        ) : (
          <p className="muted">Geliştirici alanları isteğe bağlıdır.</p>
        )}
        <div className="modal-foot">
          <span>Sipariş oluştururken doldurulur.</span>
          <button className="secondary" disabled={busy}>
            Alan ekle
          </button>
        </div>
      </form>
    </section>
  );
  const receiptFieldsSection = (
    <section className="panel purchase-settings-panel po-fields-section">
      <div className="panel-heading">
        <div>
          <b>Mal kabul alanlar&#305;</b>
          <small>
            De&#287;erler stok giri&#351;iyle birlikte kaydedilir ve
            sonradan de&#287;i&#351;tirilemez.
          </small>
        </div>
      </div>
      <div className="requests-list">
        {receiptFieldDefinitions.map((field) => (
          <article className="request-row" key={field.id}>
            <div className="request-info">
              <b>
                {field.label} · {field.code}
              </b>
              <small>
                {field.dataType} · v{field.version}
                {field.isRequired ? " · zorunlu" : ""}
              </small>
            </div>
            <button
              className="row-action"
              disabled={busy}
              onClick={() => void editReceiptCustomField(field)}
            >
              D&#252;zenle
            </button>
            {role === "TenantAdmin" && (
              <button
                className="row-action danger-action"
                disabled={busy}
                onClick={() => void deactivateReceiptCustomField(field)}
              >
                Devre d&#305;&#351;&#305; b&#305;rak
              </button>
            )}
          </article>
        ))}
        {receiptFieldDefinitions.length === 0 && (
          <div className="empty-small">
            Hen&#252;z mal kabul alan&#305; yok.
          </div>
        )}
      </div>
      <form className="collection-form" onSubmit={createReceiptCustomField}>
        <div className="form-two">
          <label>
            Alan kodu
            <input
              value={receiptFieldCode}
              onChange={(e) =>
                setReceiptFieldCode(e.target.value.toUpperCase())
              }
              required
              maxLength={40}
            />
          </label>
          <label>
            Ekran etiketi
            <input
              value={receiptFieldLabel}
              onChange={(e) => setReceiptFieldLabel(e.target.value)}
              required
              maxLength={120}
            />
          </label>
        </div>
        <div className="form-two">
          <label>
            Veri t&#252;r&#252;
            <select
              value={receiptFieldType}
              onChange={(e) =>
                setReceiptFieldType(
                  e.target
                    .value as PurchaseReceiptFieldDefinition["dataType"],
                )
              }
            >
              <option value="Text">Metin</option>
              <option value="Decimal">Ondal&#305;k say&#305;</option>
              <option value="Date">Tarih</option>
              <option value="Boolean">Evet/Hay&#305;r</option>
            </select>
          </label>
          {receiptFieldType === "Text" && (
            <label>
              En fazla karakter
              <input
                type="number"
                min="1"
                max="500"
                value={receiptFieldMaxLength}
                onChange={(e) => setReceiptFieldMaxLength(e.target.value)}
                required
              />
            </label>
          )}
        </div>
        {role === "TenantAdmin" ? (
          <label className="check-row">
            <input
              type="checkbox"
              checked={receiptFieldRequired}
              onChange={(e) => setReceiptFieldRequired(e.target.checked)}
            />{" "}
            Mal kabulde zorunlu
          </label>
        ) : (
          <p className="muted">Geliştirici alanları isteğe bağlıdır.</p>
        )}
        <div className="modal-foot">
          <span>
            Her mal kabul kayd&#305; alan tan&#305;m
            s&#252;r&#252;m&#252;n&#252; saklar.
          </span>
          <button className="secondary" disabled={busy}>
            Alan ekle
          </button>
        </div>
      </form>
    </section>
  );
  const [purchaseTicked, setPurchaseTicked] = useState<string[]>([]);
  const purchaseGridExportRef = useRef<GridExportActions | null>(null);
  /** Supplier quote whose line prices are expanded in the request document. */
  const [openQuoteLinesId, setOpenQuoteLinesId] = useState<string | null>(null);
  // ---- List type and İşlem Çubuğu (Faz 4, mockup 07): the current row is the one the user chose; Aç / Enter / double
  // click / the number link open it. The page owns the bar while it is on screen; an open alış faturası owns its own.
  const busyReason = busy ? "Kaydediliyor…" : undefined;
  const purchaseListActive = requestsOnly
    ? !requestDetail && !detail && !requestEditor && !requestFieldSettingsOpen
    : !detail && !requestEditor && !orderFieldsOpen;
  const purchasePanel = usePurchaseListPanel(purchaseListActive);
  const purchaseRows: Array<PurchaseRequestSummary | PurchaseOrderSummary> = requestsOnly ? purchaseRequests : displayedOrders;
  const purchaseTarget = requestsOnly
    ? (selectedRequestSummary ?? (purchaseTicked.length === 1 ? purchaseRequests.find((item) => item.id === purchaseTicked[0]) : undefined))
    : (selectedOrderSummary ?? (purchaseTicked.length === 1 ? displayedOrders.find((item) => item.id === purchaseTicked[0]) : undefined));
  const applyOrderStatusFilter = (next: typeof orderStatusFilter) => {
    setOrderStatusFilter(next);
    setOrderPage(1);
    if (!next) void load(requestPage, 1);
  };
  const purchaseCommands: PageCommands = {};
  const purchaseMore: MenuCommand[] = [];
  if (detail) {
    // An open order (from the order list, or just created from a request): Mal kabul ekle moves to İşlemler.
    Object.assign(purchaseCommands, documentOpenCommands(() => void openOrder(detail.id)));
    if (!requestsOnly) purchaseCommands.new = { run: () => onNavigate?.("sales-purchase-order-create") };
    if (canReceiveOrder(detail.status))
      purchaseMore.push({
        id: "po-receipt",
        label: "Mal kabul ekle",
        disabledReason: busyReason,
        run: () => {
          if (!receiptEditor) beginReceipt(detail);
          focusReceiptForm();
        },
      });
  } else if (requestDetail) {
    // An open request: the decision, quote capture and order conversion of its body, with the same conditions.
    Object.assign(purchaseCommands, documentOpenCommands(() => void openRequest(requestDetail.id)));
    purchaseCommands.new = { run: () => void beginRequestCreate() };
    if (canDecideRequest(requestDetail)) {
      purchaseMore.push({ id: "pr-approve", label: "Onayla", disabledReason: busyReason, run: () => { startDecision(requestDetail, true); focusRequestDecision(true); } });
      purchaseMore.push({ id: "pr-reject", label: "Reddet", disabledReason: busyReason, run: () => { startDecision(requestDetail, false); focusRequestDecision(false); } });
    }
    if (role === "TenantAdmin" && requestDetail.status === "Approved")
      purchaseMore.push({
        id: "pr-quote",
        label: "Teklif ekle",
        disabledReason: busyReason,
        run: () => {
          if (!quoteEditor) beginQuoteCapture(requestDetail);
          focusRequestDetailForm(".pr-detail-quotes");
        },
      });
    if (role === "TenantAdmin" && requestDetail.status === "Approved" && !requestDetail.purchaseOrderId)
      purchaseMore.push({
        id: "pr-convert",
        label: "Siparişe dönüştür",
        disabledReason: busyReason,
        run: () => {
          if (!orderConversion) beginOrderConversion(requestDetail);
          focusRequestDetailForm(".pr-detail-conversion");
        },
      });
    if (requestDetail.status === "Ordered" && requestDetail.purchaseOrderId)
      purchaseMore.push({
        id: "pr-order",
        label: "Siparişi aç",
        run: () => openLinkedPurchaseOrder(requestDetail.purchaseOrderId!, requestDetail.purchaseOrderCode || ""),
      });
  } else if (requestsOnly) {
    const request = purchaseTarget as PurchaseRequestSummary | undefined;
    purchaseCommands.new = { primary: true, run: () => void beginRequestCreate() };
    purchaseCommands.open = {
      disabledReason: request ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? request?.id;
        if (id) void openRequest(id);
      },
    };
    // The row menu ("⋯") items, with its conditions; İncele is Aç.
    if (request && canDecideRequest(request)) {
      purchaseMore.push({ id: "pr-row-approve", label: "Onayla", disabledReason: busyReason, run: () => void decideFromList(request.id, true) });
      purchaseMore.push({ id: "pr-row-reject", label: "Reddet", disabledReason: busyReason, run: () => void decideFromList(request.id, false) });
    }
    if (request && role === "TenantAdmin" && request.status === "Approved")
      purchaseMore.push({ id: "pr-row-quote", label: "Teklif ekle", disabledReason: busyReason, run: () => void beginRequestQuoteFromList(request.id) });
    if (request && role === "TenantAdmin" && request.status === "Approved" && !request.purchaseOrderId)
      purchaseMore.push({ id: "pr-row-convert", label: "Siparişe dönüştür", disabledReason: busyReason, run: () => void beginRequestConversionFromList(request.id) });
    if (request && request.status === "Ordered" && request.purchaseOrderId)
      purchaseMore.push({
        id: "pr-row-order",
        label: "Siparişi aç",
        run: () => openLinkedPurchaseOrder(request.purchaseOrderId!, request.purchaseOrderCode || ""),
      });
    if (canManagePurchaseFields) purchaseMore.push({ id: "pr-fields", label: "Alanlar", run: () => setRequestFieldSettingsOpen(true) });
    purchaseMore.push(csvExportCommand(purchaseGridExportRef));
  } else {
    const order = purchaseTarget as PurchaseOrderSummary | undefined;
    purchaseCommands.new = { primary: true, run: () => onNavigate?.("sales-purchase-order-create") };
    purchaseCommands.open = {
      disabledReason: order ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? order?.id;
        if (id) void openOrder(id);
      },
    };
    // The row menu ("⋯") item Mal kabul ekle, with its condition; Siparişi aç is Aç. The header's Talep oluştur and
    // Alanlar are here too.
    if (order && canReceiveOrder(order.status))
      purchaseMore.push({ id: "po-row-receipt", label: "Mal kabul ekle", disabledReason: busyReason, run: () => void openOrderReceipt(order.id) });
    purchaseMore.push({ id: "po-request", label: "Talep oluştur", run: () => void beginRequestCreate() });
    if (canManagePurchaseFields) purchaseMore.push({ id: "po-fields", label: "Alanlar", run: () => setOrderFieldsOpen(true) });
    purchaseMore.push(csvExportCommand(purchaseGridExportRef));
  }
  if (purchaseMore.length) purchaseCommands.more = purchaseMore;
  // As in Satış (salesPageDialogOpen): no Yeni while a dialog of this page (Alanlar, talep formu, Faturala) is open.
  if (requestFieldSettingsOpen || orderFieldsOpen || requestEditor || invoiceReceiptId) delete purchaseCommands.new;
  let purchaseListPanel: React.ReactNode = null;
  if (purchasePanel.open && purchaseListActive) {
    if (requestsOnly) {
      const request = selectedRequestSummary;
      const cachedQuotes = request ? requestQuoteCache.current.get(request.id) : undefined;
      const decisionControls = request ? renderDecisionControls(request, "panel") : null;
      purchaseListPanel = request ? (
        <PurchaseRequestListPanel
          row={request}
          needHint={requestNeedHint(request)}
          quotes={requestHasQuotes(request.status) ? (cachedQuotes ?? "loading") : undefined}
          decision={decisionControls && <div className="pr-ld-decision">{decisionControls}</div>}
          onOpen={() => void openRequest(request.id)}
          openDisabled={busy}
          onOpenOrder={() => openLinkedPurchaseOrder(request.purchaseOrderId!, request.purchaseOrderCode || "")}
          onClose={purchasePanel.close}
          takeFocus={purchasePanel.takeFocus}
        />
      ) : (
        <PurchaseRequestListEmpty />
      );
    } else {
      const order = selectedOrderSummary;
      purchaseListPanel = order ? (
        <PurchaseOrderListPanel
          row={order}
          detail={cachedOrderDetail(order.id)}
          error={orderDetailCache.current.get(order.id) === "error" ? "Satırlar yüklenemedi." : ""}
          overdue={isPurchaseOrderOverdue(order, today)}
          warehouseName={warehouses.find((x) => x.id === order.targetWarehouseId)?.name}
          onOpen={() => void openOrder(order.id)}
          openDisabled={busy}
          onClose={purchasePanel.close}
          takeFocus={purchasePanel.takeFocus}
        />
      ) : (
        <PurchaseOrderListEmpty />
      );
    }
  }
  const purchaseGridSelection = {
    currentId: requestsOnly ? selectedRequestId : selectedOrderId,
    onCurrentChange: requestsOnly ? setSelectedRequestId : setSelectedOrderId,
    onTickedChange: setPurchaseTicked,
    // Only while the list is on screen: a document or dialog over it must not show the floating bar.
    bulkActions: purchaseListActive
      ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void purchaseGridExportRef.current?.exportExcel() }]
      : undefined,
    onOpen: (id: string) => void (requestsOnly ? openRequest(id) : openOrder(id)),
  };
  const purchaseListBodyClass = `sales-list-body${purchaseListPanel ? " has-detail" : ""}`;
  return (
    <div className={`${requestsOnly ? "pr-lv2" : "po-lv2"} list-v2 sales-lv2-root`}>
      {!invoiceId && <PageCommandsSlot commands={purchaseCommands} />}
      <div className="sales-lv2-stack">
        <ListPageHeader
          className="customer-heading"
          title={requestsOnly ? "Satınalma talepleri" : "Satınalma siparişleri"}
          description={
            requestsOnly
              ? "İhtiyaçları kaydedin, onayları ve tedarikçi tekliflerini takip edin."
              : "Tedarikçi siparişlerini, kısmi mal kabulleri ve depo stok girişlerini yönetin."
          }
          count={
            requestsOnly
              ? (requestStatusCounts?.all ?? (requestStatus ? null : requestTotal))
              : orderTotal
          }
          countLabel={requestsOnly ? "talep" : "sipariş"}
        />
        <ListSummaryCards
          cards={
            requestsOnly
              ? purchaseRequestSummaryCards(requestStatusCounts, requestStatus, setRequestStatus, !!requestSearch.trim())
              : purchaseOrderSummaryCards(displayedOrders, today, loading || orderIndexPending, orderStatusFilter === "Overdue", () =>
                  applyOrderStatusFilter(orderStatusFilter === "Overdue" ? "" : "Overdue"),
                )
          }
        />
        {requestsOnly ? (
          <ListToolbar
            search={requestSearch}
            onSearchChange={setRequestSearch}
            searchLabel="Satın alma taleplerinde ara"
            searchPlaceholder="Talep no, açıklama veya talep sahibi"
            toolsSlotRef={setRequestGridToolsSlot}
            onRefresh={() => void load()}
          >
            <ListChipGroup
              label="Talep durumuna göre filtrele"
              value={requestStatus}
              onChange={setRequestStatus}
              options={[
                { value: "", label: "Tümü", count: requestStatusCounts?.all },
                { value: "Submitted", label: "Onay bekliyor", count: requestStatusCounts?.Submitted },
                { value: "Approved", label: "Onaylandı", count: requestStatusCounts?.Approved },
                { value: "Ordered", label: "Siparişe dönüştü", count: requestStatusCounts?.Ordered },
                { value: "Rejected", label: "Reddedildi", count: requestStatusCounts?.Rejected },
              ]}
            />
            <SalesListPanelToggle open={purchasePanel.open} onToggle={purchasePanel.toggle} />
          </ListToolbar>
        ) : (
          <ListToolbar
            search={orderSearch}
            onSearchChange={(value) => {
              setOrderPage(1);
              setOrderSearch(value);
            }}
            searchLabel="Tedarikçi siparişlerinde ara"
            searchPlaceholder="Sipariş no veya tedarikçi ara"
            toolsSlotRef={setOrderGridToolsSlot}
            onRefresh={() => void load(requestPage, orderPage)}
          >
            <ListChipGroup
              label="Sipariş durumuna göre filtrele"
              value={orderStatusFilter}
              onChange={(value) => applyOrderStatusFilter(value as typeof orderStatusFilter)}
              options={[
                { value: "", label: "Tümü", count: orderStatusCounts?.all },
                { value: "Open", label: "Açık", count: orderStatusCounts?.Open },
                { value: "PartiallyReceived", label: "Kısmen alındı", count: orderStatusCounts?.PartiallyReceived },
                { value: "Received", label: "Tam alındı", count: orderStatusCounts?.Received },
                { value: "Overdue", label: "Gecikmiş", count: orderStatusCounts?.Overdue },
              ]}
            />
            <SalesListPanelToggle open={purchasePanel.open} onToggle={purchasePanel.toggle} />
          </ListToolbar>
        )}
      </div>
      {error && (
        <div className="alert inline-alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice">
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div ref={purchasePanel.rootRef} className={purchaseListBodyClass}>
        <section className="list-v2-list" aria-label={requestsOnly ? "Satınalma talebi listesi" : "Tedarikçi siparişi listesi"}>
          {requestsOnly ? (
            <SalesDocumentGrid
              gridId="purchase-requests-v2"
              ariaLabel="Satınalma talebi kayıtları"
              hideExport
              exportActionsRef={purchaseGridExportRef}
              fields={visibleRequestScreenFields}
              items={purchaseRequests}
              loading={loading && purchaseRequests.length === 0}
              loadingMessage="Satınalma talepleri yükleniyor…"
              emptyMessage={
                requestStatus === "Approved"
                  ? "Onaylanmış satın alma talebi yok."
                  : requestSearch.trim() || requestStatus
                    ? "Filtrelerle eşleşen satın alma talebi yok."
                    : "Henüz satın alma talebi yok."
              }
              search=""
              searchEmptyMessage="Filtrelerle eşleşen satın alma talebi yok."
              toolbarContainer={requestGridToolsSlot}
              renderCell={renderPurchaseRequestCell}
              selection={purchaseGridSelection}
              columnWidths={PURCHASE_REQUEST_LIST_WIDTHS}
              numberFields={PURCHASE_REQUEST_NUMBER_FIELDS}
              codeFields={PURCHASE_REQUEST_CODE_FIELDS}
              footer={
                <SalesListFooter
                  ticked={purchaseTicked.length}
                  shown={purchaseRows.length}
                  total={requestTotal}
                  page={requestPage}
                  pageSize={purchasePageSize}
                  loading={loading}
                  onPageChange={(next) => void load(next)}
                />
              }
            />
          ) : (
            <SalesDocumentGrid
              gridId="purchase-orders-v2"
              ariaLabel="Satınalma siparişi kayıtları"
              hideExport
              exportActionsRef={purchaseGridExportRef}
              fields={visibleOrderScreenFields}
              items={displayedOrders}
              loading={loading || orderIndexPending}
              loadingMessage="Satın alma siparişleri yükleniyor…"
              emptyMessage={
                orderStatusFilter
                  ? "Bu durumda satın alma siparişi yok."
                  : orderSearch.trim()
                    ? "Aramanızla eşleşen tedarikçi siparişi yok."
                    : "Henüz satın alma siparişi yok."
              }
              search=""
              searchEmptyMessage="Aramanızla eşleşen tedarikçi siparişi yok."
              toolbarContainer={orderGridToolsSlot}
              renderCell={renderPurchaseOrderField}
              selection={purchaseGridSelection}
              columnWidths={PURCHASE_ORDER_LIST_WIDTHS}
              numberFields={PURCHASE_ORDER_NUMBER_FIELDS}
              codeFields={PURCHASE_ORDER_CODE_FIELDS}
              footer={
                <SalesListFooter
                  ticked={purchaseTicked.length}
                  shown={purchaseRows.length}
                  total={displayedOrderTotal}
                  page={orderPage}
                  pageSize={purchasePageSize}
                  loading={loading}
                  onPageChange={(next) => (orderStatusFilter ? setOrderPage(next) : void load(requestPage, next))}
                />
              }
            />
          )}
        </section>
        {purchaseListPanel}
      </div>
      {requestsOnly && requestFieldSettingsOpen && canManagePurchaseFields && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setRequestFieldSettingsOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setRequestFieldSettingsOpen(false);
          }}
        >
          <div className="modal po-fields-modal" role="dialog" aria-modal="true" aria-labelledby="pr-fields-title">
            <div className="modal-head">
              <div>
                <h2 id="pr-fields-title">Alanlar</h2>
                <p>Talep ve tedarikçi teklifi kayıtlarına eklenen tenant özel alanları.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Alanlar penceresini kapat"
                autoFocus
                onClick={() => setRequestFieldSettingsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {error && (
              <div className="alert inline-alert" role="alert">
                {error}
                <button type="button" aria-label="Hatayı kapat" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice">
                {notice}
                <button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            <DetailTabs<"request" | "quote">
              label="Alan türleri"
              value={requestFieldsTab}
              onChange={setRequestFieldsTab}
              tabs={[
                { key: "request", label: "Talep alanları", count: requestFieldDefinitions.length },
                { key: "quote", label: "Teklif alanları", count: supplierQuoteFieldDefinitions.length },
              ]}
            />
            <div className="po-fields-body" role="tabpanel">
              {requestFieldsTab === "request" && requestFieldsSection}
              {requestFieldsTab === "quote" && supplierQuoteFieldsSection}
            </div>
            <div className="modal-foot">
              <span>Alan tanımları sürümlenir; geçmiş kayıtların değerleri korunur.</span>
              <button type="button" className="secondary" onClick={() => setRequestFieldSettingsOpen(false)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
      {!requestsOnly && orderFieldsOpen && canManagePurchaseFields && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOrderFieldsOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setOrderFieldsOpen(false);
          }}
        >
          <div className="modal po-fields-modal" role="dialog" aria-modal="true" aria-labelledby="po-fields-title">
            <div className="modal-head">
              <div>
                <h2 id="po-fields-title">Alanlar</h2>
                <p>Teklif, sipariş ve mal kabul kayıtlarına eklenen tenant özel alanları.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Alanlar penceresini kapat"
                autoFocus
                onClick={() => setOrderFieldsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {error && (
              <div className="alert inline-alert" role="alert">
                {error}
                <button type="button" aria-label="Hatayı kapat" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice">
                {notice}
                <button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            <DetailTabs<"quote" | "order" | "receipt">
              label="Alan türleri"
              value={orderFieldsTab}
              onChange={setOrderFieldsTab}
              tabs={[
                { key: "quote", label: "Teklif alanları", count: supplierQuoteFieldDefinitions.length },
                { key: "order", label: "Sipariş alanları", count: orderFieldDefinitions.length },
                { key: "receipt", label: "Mal kabul alanları", count: receiptFieldDefinitions.length },
              ]}
            />
            <div className="po-fields-body" role="tabpanel">
              {orderFieldsTab === "quote" && supplierQuoteFieldsSection}
              {orderFieldsTab === "order" && orderFieldsSection}
              {orderFieldsTab === "receipt" && receiptFieldsSection}
            </div>
            <div className="modal-foot">
              <span>Alan tanımları sürümlenir; geçmiş kayıtların değerleri korunur.</span>
              <button type="button" className="secondary" onClick={() => setOrderFieldsOpen(false)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
      {detail && (() => {
        // Satınalma siparişi belgesi (taslak 02): durum akışı, özet kutucukları, başlık alanları, satırlar ve
        // toplamlar, özel alanlar, mal kabuller; Mal kabul ekle İşlemler'de de.
        const orderMoney = (value: number) => formatAmount(value, detail.currencyCode);
        const postedReceipts = detail.receipts.filter((receipt) => receipt.status === "Posted");
        const invoicedReceipts = postedReceipts.filter((receipt) => receipt.invoice).length;
        const overdue = isPurchaseOrderOverdue(detail, today);
        const overdueDays = overdue && detail.expectedReceiptDate ? -daysFromToday(detail.expectedReceiptDate) : 0;
        const targetWarehouse = warehouses.find((x) => x.id === detail.targetWarehouseId);
        return (
          <DocumentSurface
            variant="detail"
            title="Satınalma siparişi"
            code={detail.code}
            subtitle={detail.supplierName}
            status={purchaseOrderStatus(detail.status)}
            meta={<span>{formatDate(detail.orderDate)}</span>}
            statusFlow={<PurchaseOrderFlow status={detail.status} />}
            onClose={() => setDetail(null)}
            aside={
              <DetailContext title="Belge zinciri">
                <DetailChain
                  items={[
                    { key: "self", code: detail.code, label: "Bu sipariş", kind: "Satınalma siparişi", current: true, status: purchaseOrderStatus(detail.status) },
                    ...detail.receipts.flatMap((receipt) => [
                      {
                        key: `receipt-${receipt.id}`,
                        code: receipt.code,
                        label: "Mal kabul",
                        meta: formatDate(receipt.receiptDate),
                        status: purchaseReceiptStatus(receipt.status),
                      },
                      ...(receipt.invoice
                        ? [
                            {
                              key: `invoice-${receipt.invoice.id}`,
                              code: receipt.invoice.code,
                              label: "Alış faturası",
                              status: purchaseInvoiceStatus(receipt.invoice.status),
                              onOpen: () => setInvoiceId(receipt.invoice!.id),
                            },
                          ]
                        : []),
                    ]),
                  ]}
                />
              </DetailContext>
            }
            hints={SALES_DETAIL_HINTS}
            footerStatus={<SalesFooterStatus lines={detail.lines.length} total={orderMoney(detail.grandTotal)} />}
          >
            {error && (
              <div className="alert inline-alert" role="alert">
                {error}
                <button type="button" aria-label="Hatayı kapat" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                {notice}
                <button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            <DetailTiles
              label="Sipariş özeti"
              items={[
                { label: "Genel toplam", value: orderMoney(detail.grandTotal) },
                { label: "Mal kabul", value: postedReceipts.length },
                { label: "Faturalanan", value: `${invoicedReceipts} / ${postedReceipts.length}` },
                {
                  label: "Beklenen teslim",
                  value: formatDate(detail.expectedReceiptDate),
                  tone: overdue ? "danger" : "default",
                  hint: overdue ? `${overdueDays} gün geçti` : undefined,
                },
              ]}
            />
            <div className="dd-box">
              <DetailInfoGrid
                label="Sipariş üst bilgileri"
                items={[
                  { label: "Sipariş tarihi", value: formatDate(detail.orderDate) },
                  { label: "Beklenen teslim", value: formatDate(detail.expectedReceiptDate) },
                  { label: "Hedef depo", value: targetWarehouse ? `${targetWarehouse.code} · ${targetWarehouse.name}` : "—" },
                  { label: "Para birimi", value: detail.currencyCode },
                ]}
              />
            </div>
            <div className="dd-box">
              <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={detail.lines.length} extra={detail.currencyCode} />} />
              <div className="dd-lines-wrap">
                <table className="dd-lines" aria-label="Sipariş satırları">
                  <thead>
                    <tr>
                      <th className="dd-ix">#</th>
                      <th>Stok</th>
                      <th className="dd-num">Sipariş</th>
                      <th className="dd-num">Alınan</th>
                      <th className="dd-num">Kalan</th>
                      <th className="dd-num">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.lineNumber}>
                        <td className="dd-ix">{line.lineNumber}</td>
                        <td className="dd-stock">
                          <b>{line.stockCode}</b>
                          <small>{line.stockName}</small>
                        </td>
                        <td className="dd-num">
                          <span>{formatQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                        </td>
                        <td className="dd-num">{formatQuantity(line.receivedQuantity)}</td>
                        <td className="dd-num">{formatQuantity(line.remainingQuantity)}</td>
                        <td className="dd-num">{orderMoney(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DetailLinesFooter
                label="Sipariş toplamları"
                aside={detail.notes ? <DetailNotes items={[{ label: "Not", value: detail.notes }]} /> : undefined}
                totals={salesTotalRows(
                  detail,
                  orderMoney,
                  vatByRate(
                    detail.lines.map((line) => ({ vatPercent: line.vatPercent, taxable: line.lineSubtotal - line.discountAmount, vat: line.taxAmount })),
                    { taxable: detail.subtotal - detail.discountTotal, vat: detail.taxTotal },
                  ),
                )}
              />
            </div>
            {detail.customFields.length > 0 && (
              <DetailSection
                title="Sipariş özel alanları"
                description={
                  detail.status === "Open" ||
                  detail.status === "PartiallyReceived"
                    ? "Açık siparişte düzenlenebilir."
                    : "Sipariş kapalı."
                }
              >
              <form onSubmit={saveOrderCustomFields} className="pr-detail-form">
                <div className="form-two">
                  {detail.customFields.map((field) => (
                    <label key={field.definitionId}>
                      {field.label}
                      {field.isRequired ? " *" : ""}
                      <small>
                        {field.code} · {field.dataType}
                      </small>
                      {field.dataType === "Boolean" ? (
                        <select
                          disabled={
                            detail.status === "Received" ||
                            detail.status === "Cancelled"
                          }
                          required={field.isRequired}
                          value={orderFieldValues[field.code] || ""}
                          onChange={(e) =>
                            setOrderFieldValues((current) => ({
                              ...current,
                              [field.code]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Seçin</option>
                          <option value="true">Evet</option>
                          <option value="false">Hayır</option>
                        </select>
                      ) : (
                        <input
                          disabled={
                            detail.status === "Received" ||
                            detail.status === "Cancelled"
                          }
                          type={
                            field.dataType === "Decimal"
                              ? "number"
                              : field.dataType === "Date"
                                ? "date"
                                : "text"
                          }
                          step={
                            field.dataType === "Decimal" ? "any" : undefined
                          }
                          maxLength={
                            field.dataType === "Text"
                              ? field.maxLength
                              : undefined
                          }
                          required={field.isRequired}
                          value={orderFieldValues[field.code] || ""}
                          onChange={(e) =>
                            setOrderFieldValues((current) => ({
                              ...current,
                              [field.code]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
                {(detail.status === "Open" ||
                  detail.status === "PartiallyReceived") && (
                  <div className="modal-foot">
                    <span>Değişiklikler geçmişe kaydedilir.</span>
                    <button className="primary" disabled={busy}>
                      Alanları kaydet
                    </button>
                  </div>
                )}
              </form>
              </DetailSection>
            )}
            <DetailSection
              title="Mal kabuller"
              count={detail.receipts.length}
              description="Her kayıt seçilen depoya stok girişi yapar."
              actions={
                canReceiveOrder(detail.status) ? (
                  <button type="button" className="secondary small-button" onClick={() => beginReceipt(detail)}>
                    <Plus size={14} /> Mal kabul ekle
                  </button>
                ) : undefined
              }
            >
              <AdvancedDataGrid
                className="customer-table"
                gridId="purchase-order-receipts"
                {...screenViewGridDefaults(visibleReceiptScreenFields)}
                externalPagination
                hideSearch
                enableRowSelection={false}
              >
                <thead>
                  <tr>
                    {visibleReceiptScreenFields.map((field) => (
                      <th key={field.key}>
                        {field.key === "actions" && field.label === "İşlemler"
                          ? ""
                          : field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      {visibleReceiptScreenFields.map((field) =>
                        renderPurchaseReceiptCell(field, receipt),
                      )}
                    </tr>
                  ))}
                  {detail.receipts.length === 0 && (
                    <tr>
                      <td
                        colSpan={visibleReceiptScreenFields.length}
                        className="table-empty"
                      >
                        Henüz mal kabul yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </AdvancedDataGrid>
            </DetailSection>
            {receiptEditor && (() => {
              const receiptHasQuantity = detail.lines.some(
                (x) => Number(quantities[x.lineNumber] || 0) > 0,
              );
              return (
              <RecordFormPage
                variant="dialog"
                className="sales-rf sales-rf-embedded"
                title="Mal kabul"
                mode="create"
                busy={busy}
                saveLabel="Mal kabul kaydet"
                onSubmit={(event) => {
                  // The old save button was disabled until a quantity was entered.
                  if (!receiptHasQuantity) {
                    event.preventDefault();
                    return;
                  }
                  void createReceipt(event);
                }}
                onCancel={() => setReceiptEditor(false)}
                error={error}
                onDismissError={() => setError("")}
                status={
                  <>
                    <span>
                      Konum seçimi isteğe bağlıdır; tekrar gönderim anahtarı çift
                      stok girişini engeller.
                    </span>
                    {!receiptHasQuantity && (
                      <span className="rf-status-warning">
                        Kaydetmek için en az bir kalemde miktar girin.
                      </span>
                    )}
                  </>
                }
              >
                <RecordFormGroup title="Mal Kabul Kimliği" bodyClassName="rf-pair">
                  <label>
                    <span>Mal kabul tarihi <RequiredMark /></span>
                    <input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Depo
                    <SearchableRecordPicker
                      options={warehouses
                        .filter((x) => x.isActive)
                        .map((x) => ({
                          id: x.id,
                          label: `${x.code} · ${x.name}`,
                        }))}
                      selectedId={warehouseId}
                      onSelect={(value) => {
                        setWarehouseId(value);
                        setReceiptLocationIds({});
                        void loadReceiptLocations(value);
                      }}
                      title="Depo seçin"
                      placeholder="Depo seçin"
                      searchPlaceholder="Depo kodu veya adıyla ara"
                      emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
                      required
                    />
                  </label>
                </RecordFormGroup>
                {receiptFieldDefinitions.length > 0 && (
                  <RecordFormGroup title="Mal Kabul Özel Alanları">
                  <div className="rf-custom-grid">
                    {receiptFieldDefinitions.map((field) => (
                      <label key={field.id}>
                        {field.label}
                        {field.isRequired ? " *" : ""}
                        <small>{field.code}</small>
                        {field.dataType === "Boolean" ? (
                          <select
                            required={field.isRequired}
                            value={receiptFieldValues[field.code] || ""}
                            onChange={(e) =>
                              setReceiptFieldValues((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Se&#231;in</option>
                            <option value="true">Evet</option>
                            <option value="false">Hay&#305;r</option>
                          </select>
                        ) : (
                          <input
                            type={
                              field.dataType === "Decimal"
                                ? "number"
                                : field.dataType === "Date"
                                  ? "date"
                                  : "text"
                            }
                            step={
                              field.dataType === "Decimal" ? "any" : undefined
                            }
                            maxLength={
                              field.dataType === "Text"
                                ? field.maxLength
                                : undefined
                            }
                            required={field.isRequired}
                            value={receiptFieldValues[field.code] || ""}
                            onChange={(e) =>
                              setReceiptFieldValues((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  </RecordFormGroup>
                )}
                <RecordFormGroup title="Kabul Edilen Kalemler">
                <div className="ledger-list sales-rf-lines">
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th>Stok</th>
                        <th>Kalan sipariş</th>
                        <th>Bu kabul · birim / miktar</th>
                        <th>Depo konumu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines
                        .filter((x) => x.remainingQuantity > 0)
                        .map((line) => (
                          <tr key={line.lineNumber}>
                            <td>
                              <b>{line.stockCode}</b>
                              <small className="cell-subtitle">
                                {line.stockName}
                              </small>
                            </td>
                            <td>
                              {line.remainingQuantity.toLocaleString("tr-TR", {
                                maximumFractionDigits: 4,
                              })}{" "}
                              {line.unitCode}
                            </td>
                            <td>
                              <select
                                aria-label={`${line.stockCode} mal kabul birimi`}
                                value={
                                  enteredReceiptUnits[line.lineNumber] ||
                                  line.unitCode
                                }
                                onChange={(e) =>
                                  setEnteredReceiptUnits((current) => ({
                                    ...current,
                                    [line.lineNumber]: e.target.value,
                                  }))
                                }
                              >
                                <option value={line.unitCode}>
                                  {line.unitCode}
                                </option>
                                {(receiptUnits[line.lineNumber] || [])
                                  .filter(
                                    (u) =>
                                      u.isActive &&
                                      u.unitCode !== line.unitCode,
                                  )
                                  .map((u) => (
                                    <option key={u.id} value={u.unitCode}>
                                      {u.unitCode}
                                    </option>
                                  ))}
                              </select>
                              <input
                                aria-label={`${line.stockCode} mal kabul miktarı`}
                                type="number"
                                min="0"
                                step="0.0001"
                                value={quantities[line.lineNumber] || ""}
                                onChange={(e) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [line.lineNumber]: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <select
                                aria-label={`${line.stockCode} mal kabul konumu`}
                                value={
                                  receiptLocationIds[line.lineNumber] || ""
                                }
                                disabled={!warehouseId}
                                onChange={(e) =>
                                  setReceiptLocationIds((current) => ({
                                    ...current,
                                    [line.lineNumber]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Depo düzeyinde</option>
                                {receiptLocations.map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {location.code} · {location.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                </RecordFormGroup>
              </RecordFormPage>
              );
            })()}
            <p className="dd-muted">Alış faturası vade gününü tedarikçi kartından alır.</p>
          </DocumentSurface>
        );
      })()}
      {requestEditor && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setRequestEditor(false);
          }}
        >
          <div className="modal quote-modal sales-rf-host" role="dialog" aria-modal="true" aria-label="Satın alma talebi">
            <RecordFormPage
              variant="dialog"
              className="sales-rf"
              title="Satın alma talebi"
              mode="create"
              busy={busy}
              saveLabel="Onaya gönder"
              onSubmit={createRequest}
              onCancel={() => setRequestEditor(false)}
              error={error}
              onDismissError={() => setError("")}
              status={
                <>
                  <span>
                    Talep TenantAdmin onayına gönderilir; talep sahibi kendi
                    talebini karara bağlayamaz.
                  </span>
                  <span className="rf-status-end">Kalem: <b>{requestLines.length}</b></span>
                </>
              }
            >
              <RecordFormGroup title="Talep Kimliği" bodyClassName="rf-identity sales-rf-identity-even">
                <label>
                  <span>Talep no <RequiredMark /></span>
                  <input
                    className="rf-must rf-mono"
                    value={requestCode}
                    onChange={(e) => setRequestCode(e.target.value)}
                    required
                    maxLength={40}
                    placeholder="ST-2026-0001"
                  />
                </label>
                <label>
                  <span>Talep tarihi <RequiredMark /></span>
                  <input
                    type="date"
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    required
                  />
                </label>
              <label>
                <span>
                  İhtiyaç tarihi{" "}
                  <span className="optional-label">İsteğe bağlı</span>
                </span>
                <input
                  type="date"
                  value={neededByDate}
                  min={requestDate}
                  onChange={(e) => setNeededByDate(e.target.value)}
                />
              </label>
              <label className="rf-columns-wide">
                <span>Talep açıklaması <RequiredMark /></span>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  required
                  placeholder="Satın alma gerekçesi"
                />
              </label>
              </RecordFormGroup>
              <RecordFormGroup title="Talep Özel Alanları">
                    <small>
                      Firma tarafından tanımlanmış alanlar talep ile birlikte
                      saklanır.
                    </small>
                <div className="rf-custom-grid">
                  {requestFieldDefinitions.map((field) => (
                    <label key={field.id}>
                      {field.label}
                      {field.isRequired ? " *" : ""}
                      <small>
                        {field.code} · {field.dataType}
                      </small>
                      {field.dataType === "Boolean" ? (
                        <select
                          required={field.isRequired}
                          value={requestFieldValues[field.code] || ""}
                          onChange={(e) =>
                            setRequestFieldValues((current) => ({
                              ...current,
                              [field.code]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Seçin</option>
                          <option value="true">Evet</option>
                          <option value="false">Hayır</option>
                        </select>
                      ) : (
                        <input
                          type={
                            field.dataType === "Decimal"
                              ? "number"
                              : field.dataType === "Date"
                                ? "date"
                                : "text"
                          }
                          step={
                            field.dataType === "Decimal" ? "any" : undefined
                          }
                          maxLength={
                            field.dataType === "Text"
                              ? field.maxLength
                              : undefined
                          }
                          required={field.isRequired}
                          value={requestFieldValues[field.code] || ""}
                          onChange={(e) =>
                            setRequestFieldValues((current) => ({
                              ...current,
                              [field.code]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
                {requestFieldDefinitions.length === 0 && (
                  <div className="empty-small">
                    Firma yöneticisi henüz özel alan tanımlamadı.
                  </div>
                )}
              </RecordFormGroup>
              <RecordFormGroup title="İstenen Stok Kalemleri">
              <div className="quote-lines-heading sales-rf-group-actions">
                <span className="muted">
                  İstenen miktar seçilen birim üzerinden temel birime çevrilir.
                </span>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={requestLines.length >= 100}
                  onClick={() =>
                    setRequestLines((current) => [
                      ...current,
                      { stockItemId: "", quantity: "1", unitCode: "" },
                    ])
                  }
                >
                  <Plus size={14} /> Kalem ekle
                </button>
              </div>
              {requestLines.map((line, index) => (
                <div className="quote-line" key={index}>
                  <div className="quote-line-title">
                    <b>Kalem {index + 1}</b>
                    {requestLines.length > 1 && (
                      <button
                        type="button"
                        className="row-action"
                        onClick={() =>
                          setRequestLines((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                  <div className="form-two">
                    <label>
                      Stok kartı
                      <AsyncStockItemPicker
                        token={token}
                        selectedId={line.stockItemId}
                        initialItems={stockItems}
                        onSelect={(item) => {
                          void loadRequestUnits(item.id);
                          setRequestLines((current) =>
                            current.map((row, i) =>
                              i === index
                                ? {
                                    ...row,
                                    stockItemId: item.id,
                                    unitCode: item.unitCode || "",
                                  }
                                : row,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      Birim
                      <select
                        value={
                          line.unitCode ||
                          stockItems.find((x) => x.id === line.stockItemId)
                            ?.unitCode ||
                          ""
                        }
                        onChange={(e) =>
                          setRequestLines((current) =>
                            current.map((row, i) =>
                              i === index
                                ? { ...row, unitCode: e.target.value }
                                : row,
                            ),
                          )
                        }
                        required
                      >
                        <option
                          value={
                            stockItems.find((x) => x.id === line.stockItemId)
                              ?.unitCode || line.unitCode || ""
                          }
                        >
                          {stockItems.find((x) => x.id === line.stockItemId)
                            ?.unitCode || line.unitCode || "Temel birim"}
                        </option>
                        {(requestUnits[line.stockItemId] || [])
                          .filter((x) => x.isActive)
                          .map((unit) => (
                            <option key={unit.id} value={unit.unitCode}>
                              {unit.unitCode} (×{unit.factorToBase})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Miktar
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={line.quantity}
                        onChange={(e) =>
                          setRequestLines((current) =>
                            current.map((row, i) =>
                              i === index
                                ? { ...row, quantity: e.target.value }
                                : row,
                            ),
                          )
                        }
                        required
                      />
                    </label>
                  </div>
                </div>
              ))}
              </RecordFormGroup>
            </RecordFormPage>
          </div>
        </div>
      )}
      {requestDetail && (
          <DocumentSurface
            variant="detail"
            title="Satınalma talebi"
            code={requestDetail.code}
            subtitle={requestDetail.requestedByName}
            status={purchaseRequestStatus(requestDetail.status)}
            meta={<span>{formatDate(requestDetail.requestDate)}</span>}
            statusFlow={<PurchaseRequestFlow status={requestDetail.status} />}
            onClose={() => setRequestDetail(null)}
            aside={
              <DetailContext title="Belge zinciri">
                <DetailChain
                  items={[
                    { key: "self", code: requestDetail.code, label: "Bu talep", kind: "Satınalma talebi", current: true, status: purchaseRequestStatus(requestDetail.status) },
                    ...supplierQuotes.map((quote) => ({
                      key: `quote-${quote.id}`,
                      code: quote.code,
                      label: "Tedarikçi teklifi",
                      meta: quote.supplierName,
                      status: supplierQuoteDocumentStatus(quote, today),
                    })),
                    ...(requestDetail.purchaseOrderCode
                      ? [
                          {
                            key: "order",
                            code: requestDetail.purchaseOrderCode,
                            label: "Satınalma siparişi",
                            onOpen: requestDetail.purchaseOrderId
                              ? () => openLinkedPurchaseOrder(requestDetail.purchaseOrderId!, requestDetail.purchaseOrderCode || "")
                              : undefined,
                          },
                        ]
                      : []),
                  ]}
                />
              </DetailContext>
            }
            hints={SALES_DETAIL_HINTS}
            footerStatus={<SalesFooterStatus lines={requestDetail.lines.length} />}
          >
            {error && (
              <div className="alert inline-alert" role="alert">
                {error}
                <button type="button" aria-label="Hatayı kapat" onClick={() => setError("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                {notice}
                <button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice("")}>
                  <X size={15} />
                </button>
              </div>
            )}
            <div className="dd-box">
              <DetailInfoGrid
                label="Talep üst bilgileri"
                items={[
                  { label: "Talep tarihi", value: formatDate(requestDetail.requestDate) },
                  { label: "İhtiyaç tarihi", value: requestDetail.neededByDate ? formatDate(requestDetail.neededByDate) : "İhtiyaç tarihi belirtilmedi" },
                  { label: "Talep sahibi", value: requestDetail.requestedByName || "—" },
                  requestDetail.reviewedByName && requestDetail.status !== "Submitted"
                    ? { label: requestDetail.status === "Rejected" ? "Reddeden" : "Onaylayan", value: requestDetail.reviewedByName }
                    : { label: "Kalem", value: requestDetail.lines.length },
                ]}
              />
            </div>
            <div className="dd-box">
              <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={requestDetail.lines.length} />} />
              <div className="dd-lines-wrap">
                <table className="dd-lines" aria-label="Talep satırları">
                  <thead>
                    <tr>
                      <th className="dd-ix">#</th>
                      <th>Stok</th>
                      <th className="dd-num">Miktar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestDetail.lines.map((line) => (
                      <tr key={line.lineNumber}>
                        <td className="dd-ix">{line.lineNumber}</td>
                        <td className="dd-stock">
                          <b>{line.stockCode}</b>
                          <small>{line.stockName}</small>
                        </td>
                        <td className="dd-num">
                          <span>{formatQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dd-lines-footer">
                <div className="dd-lines-aside">
                  <DetailNotes
                    items={[
                      { label: "Açıklama", value: requestDetail.description },
                      ...(requestDetail.reviewNote ? [{ label: "Karar notu", value: requestDetail.reviewNote }] : []),
                    ]}
                  />
                </div>
              </div>
            </div>
            {role === "TenantAdmin" && requestDetail.status === "Submitted" && (
              <div className="pr-detail-decision">
                <DetailSection title="Talep kararı">{renderDecisionControls(requestDetail, "detail")}</DetailSection>
              </div>
            )}
            {requestDetail.status === "Ordered" &&
              requestDetail.purchaseOrderCode && (
                <p className="notice">
                  Bu talep <b>{requestDetail.purchaseOrderCode}</b> siparişine
                  dönüştürüldü.
                </p>
              )}
            {(supplierQuotes.length > 0 ||
              requestDetail.status === "Approved") && (
              <div className="pr-detail-form-target pr-detail-quotes">
                <DetailSection
                  title="Tedarikçi teklifleri"
                  count={supplierQuotes.length}
                  description="Tutarlar teklif tarihindeki kurla tenant baz para birimine çevrilir; kur yoksa kıyaslanamaz."
                  actions={
                    role === "TenantAdmin" &&
                    requestDetail.status === "Approved" &&
                    !quoteEditor ? (
                      <button
                        type="button"
                        className="secondary small-button"
                        disabled={busy}
                        onClick={() => beginQuoteCapture(requestDetail)}
                      >
                        <Plus size={14} /> Teklif kaydet
                      </button>
                    ) : undefined
                  }
                >
                  {supplierQuotes.length > 0 ? (
                    <div className="dd-lines-wrap">
                      <table className="dd-lines pr-quotes" aria-label="Tedarikçi teklifleri">
                        <thead>
                          <tr>
                            <th>Tedarikçi</th>
                            <th>Teklif no</th>
                            <th>Teklif tarihi</th>
                            <th>Geçerlilik</th>
                            <th className="dd-num">Genel toplam</th>
                            <th className="dd-num">Kıyas</th>
                            <th>Durum</th>
                            <th aria-label="İşlemler" />
                          </tr>
                        </thead>
                        <tbody>
                          {supplierQuotes.map((quote) => {
                            const linesOpen = openQuoteLinesId === quote.id;
                            const values = quote.customFields.filter((field) => field.value);
                            return (
                              <React.Fragment key={quote.id}>
                                <tr>
                                  <td className="pr-quote-supplier">
                                    <b>{quote.supplierName}</b>
                                    {values.length > 0 && (
                                      <small>{values.map((field) => `${field.label}: ${field.value}`).join(" · ")}</small>
                                    )}
                                    <button
                                      type="button"
                                      className="pr-quote-lines-toggle"
                                      aria-expanded={linesOpen}
                                      onClick={() => setOpenQuoteLinesId(linesOpen ? null : quote.id)}
                                    >
                                      Kalem fiyatlarını incele
                                    </button>
                                  </td>
                                  <td className="nx-code">{quote.code}</td>
                                  <td>{formatDate(quote.quoteDate)}</td>
                                  <td>{quote.validUntil ? formatDate(quote.validUntil) : "Geçerlilik tarihi yok"}</td>
                                  <td className="dd-num">{formatAmount(quote.grandTotal, quote.currencyCode)}</td>
                                  <td className="dd-num">
                                    {quote.comparableGrandTotal === null ? (
                                      "Baz para birimine çevrilemedi"
                                    ) : (
                                      <>
                                        <span>{formatAmount(quote.comparableGrandTotal, quote.baseCurrencyCode)}</span>
                                        {quote.appliedRateDate && <small>{formatDate(quote.appliedRateDate)}</small>}
                                      </>
                                    )}
                                  </td>
                                  <td>
                                    <DocumentStatusBadge status={supplierQuoteDocumentStatus(quote, today)} />
                                  </td>
                                  <td>
                                    {role === "TenantAdmin" &&
                                      requestDetail.status === "Approved" &&
                                      quote.status === "Submitted" &&
                                      (!quote.validUntil || quote.validUntil >= today) && (
                                        <button
                                          type="button"
                                          className="row-action"
                                          disabled={busy}
                                          onClick={() =>
                                            beginOrderConversion(requestDetail, quote)
                                          }
                                        >
                                          Bu teklifle sipariş
                                        </button>
                                      )}
                                  </td>
                                </tr>
                                {linesOpen && (
                                  <tr className="pr-quote-lines-row">
                                    <td colSpan={8}>
                                      <table className="pr-quote-lines" aria-label={`${quote.code} kalem fiyatları`}>
                                        <thead>
                                          <tr>
                                            <th>Kalem</th>
                                            <th className="dd-num">Miktar</th>
                                            <th className="dd-num">Birim fiyat</th>
                                            <th className="dd-num">KDV</th>
                                            <th className="dd-num">Toplam</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {quote.lines.map((line) => (
                                            <tr key={line.requestLineNumber}>
                                              <td className="dd-stock">
                                                <b>{line.stockCode}</b>
                                                <small>{line.stockName}</small>
                                              </td>
                                              <td className="dd-num">
                                                <span>{formatQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                                              </td>
                                              <td className="dd-num">
                                                {line.unitPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                              </td>
                                              <td className="dd-num">{line.vatPercent}%</td>
                                              <td className="dd-num">{formatAmount(line.lineTotal)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="dd-empty">
                      Henüz tedarikçi teklifi kaydedilmedi.
                    </p>
                  )}
                {quoteEditor && (
                  <form onSubmit={createSupplierQuote} className="pr-detail-form">
                    <div className="form-two">
                      <label>
                        Tedarikçi teklif no
                        <input
                          value={quoteCode}
                          onChange={(e) => setQuoteCode(e.target.value)}
                          maxLength={64}
                          required
                          placeholder="TKL-2026-001"
                        />
                      </label>
                      <label>
                        Tedarikçi
                        <SearchableRecordPicker
                          options={supplierOptions.map((x) => ({
                            id: x.id,
                            label: `${x.code} · ${x.name}`,
                            description: x.currencyCode,
                            searchText: x.currencyCode,
                          }))}
                          selectedId={quoteSupplierId}
                          onSelect={setQuoteSupplierId}
                          title="Tedarikçi seçin"
                          placeholder="Tedarikçi seçin"
                          searchPlaceholder="Tedarikçi kodu veya unvanıyla ara"
                          emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı."
                          required
                        />
                      </label>
                    </div>
                    <div className="form-two">
                      <label>
                        Teklif tarihi
                        <input
                          type="date"
                          value={quoteDate}
                          onChange={(e) => setQuoteDate(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Geçerlilik sonu
                        <input
                          type="date"
                          min={quoteDate}
                          value={quoteValidUntil}
                          onChange={(e) => setQuoteValidUntil(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="dd-lines-wrap">
                      <table className="dd-lines pr-price-lines">
                        <thead>
                          <tr>
                            <th>Stok</th>
                            <th>Miktar</th>
                            <th>Birim fiyat</th>
                            <th>İskonto %</th>
                            <th>KDV %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requestDetail.lines.map((line) => (
                            <tr key={line.lineNumber}>
                              <td>
                                <b>{line.stockCode}</b>
                                <small className="cell-subtitle">
                                  {line.stockName}
                                </small>
                              </td>
                              <td>
                                {line.quantity.toLocaleString("tr-TR", {
                                  maximumFractionDigits: 4,
                                })}{" "}
                                {line.unitCode}
                              </td>
                              <td>
                                <input
                                  aria-label={`${line.stockCode} teklif fiyatı`}
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  value={
                                    quotePrices[line.lineNumber]?.unitPrice ||
                                    "0"
                                  }
                                  onChange={(e) =>
                                    setQuotePrices((current) => ({
                                      ...current,
                                      [line.lineNumber]: {
                                        ...current[line.lineNumber],
                                        unitPrice: e.target.value,
                                      },
                                    }))
                                  }
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`${line.stockCode} teklif iskontosu`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={
                                    quotePrices[line.lineNumber]
                                      ?.discountPercent || "0"
                                  }
                                  onChange={(e) =>
                                    setQuotePrices((current) => ({
                                      ...current,
                                      [line.lineNumber]: {
                                        ...current[line.lineNumber],
                                        discountPercent: e.target.value,
                                      },
                                    }))
                                  }
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`${line.stockCode} teklif KDV oranı`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={
                                    quotePrices[line.lineNumber]?.vatPercent ||
                                    "20"
                                  }
                                  onChange={(e) =>
                                    setQuotePrices((current) => ({
                                      ...current,
                                      [line.lineNumber]: {
                                        ...current[line.lineNumber],
                                        vatPercent: e.target.value,
                                      },
                                    }))
                                  }
                                  required
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <label>
                      Teklif notu{" "}
                      <span className="optional-label">İsteğe bağlı</span>
                      {supplierQuoteFieldDefinitions.length > 0 && (
                        <div className="form-two">
                          {supplierQuoteFieldDefinitions.map((field) => (
                            <label key={field.id}>
                              {field.label}
                              {field.isRequired ? " *" : ""}
                              <small>{field.code}</small>
                              {field.dataType === "Boolean" ? (
                                <select
                                  required={field.isRequired}
                                  value={
                                    supplierQuoteFieldValues[field.code] || ""
                                  }
                                  onChange={(e) =>
                                    setSupplierQuoteFieldValues((current) => ({
                                      ...current,
                                      [field.code]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Seçin</option>
                                  <option value="true">Evet</option>
                                  <option value="false">Hayır</option>
                                </select>
                              ) : (
                                <input
                                  type={
                                    field.dataType === "Decimal"
                                      ? "number"
                                      : field.dataType === "Date"
                                        ? "date"
                                        : "text"
                                  }
                                  step={
                                    field.dataType === "Decimal"
                                      ? "any"
                                      : undefined
                                  }
                                  maxLength={
                                    field.dataType === "Text"
                                      ? field.maxLength
                                      : undefined
                                  }
                                  required={field.isRequired}
                                  value={
                                    supplierQuoteFieldValues[field.code] || ""
                                  }
                                  onChange={(e) =>
                                    setSupplierQuoteFieldValues((current) => ({
                                      ...current,
                                      [field.code]: e.target.value,
                                    }))
                                  }
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                      <textarea
                        value={quoteNotes}
                        onChange={(e) => setQuoteNotes(e.target.value)}
                        maxLength={1000}
                        rows={2}
                      />
                    </label>
                    <div className="modal-foot">
                      <div>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setQuoteEditor(false)}
                        >
                          Vazgeç
                        </button>
                        <button className="primary" disabled={busy}>
                          {busy ? "Kaydediliyor…" : "Teklifi kaydet"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
                </DetailSection>
              </div>
            )}
            {role === "TenantAdmin" &&
              requestDetail.status === "Approved" &&
              !requestDetail.purchaseOrderId && (
                <div className="pr-detail-form-target pr-detail-conversion">
                  <DetailSection
                    title="Talebi siparişe dönüştür"
                    description="Tedarikçi seçin ve talep miktarları için birim fiyatları girin."
                    actions={
                      !orderConversion ? (
                        <button
                          type="button"
                          className="primary small-button"
                          disabled={busy}
                          onClick={() => beginOrderConversion(requestDetail)}
                        >
                          Sipariş oluştur
                        </button>
                      ) : undefined
                    }
                  >
                  {orderConversion && (
                    <form onSubmit={convertPurchaseRequest} className="pr-detail-form">
                      <div className="form-two">
                        <label>
                          Sipariş no
                          <input
                            value={conversionCode}
                            onChange={(e) => setConversionCode(e.target.value)}
                            maxLength={40}
                            required
                            placeholder="ST-SIP-2026-0001"
                          />
                        </label>
                        <label>
                          Tedarikçi
                          <SearchableRecordPicker
                            options={supplierOptions.map((x) => ({
                              id: x.id,
                              label: `${x.code} · ${x.name}`,
                              description: x.currencyCode,
                              searchText: x.currencyCode,
                            }))}
                            selectedId={conversionSupplierId}
                            onSelect={setConversionSupplierId}
                            title="Tedarikçi seçin"
                            placeholder="Tedarikçi seçin"
                            searchPlaceholder="Tedarikçi kodu veya unvanıyla ara"
                            emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı."
                            required
                            disabled={!!selectedQuoteForOrder}
                          />
                        </label>
                      </div>
                      <label>
                        Sipariş tarihi
                        <input
                          type="date"
                          value={conversionDate}
                          onChange={(e) => setConversionDate(e.target.value)}
                          required
                        />
                      </label>
                      <div className="form-two">
                        <label>
                          Beklenen teslim tarihi
                          <input
                            type="date"
                            value={requestDetail.neededByDate || ""}
                            min={conversionDate}
                            readOnly
                          />
                        </label>
                        <label>
                          Hedef depo
                          <SearchableRecordPicker
                            options={warehouses
                              .filter((x) => x.isActive)
                              .map((x) => ({
                                id: x.id,
                                label: `${x.code} · ${x.name}`,
                              }))}
                            selectedId={conversionTargetWarehouseId}
                            onSelect={setConversionTargetWarehouseId}
                            title="Hedef depo seçin"
                            placeholder="Belirtilmedi"
                            searchPlaceholder="Depo kodu veya adıyla ara"
                            emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
                          />
                        </label>
                      </div>
                      <div className="dd-lines-wrap">
                        <table className="dd-lines pr-price-lines">
                          <thead>
                            <tr>
                              <th>Stok</th>
                              <th>Miktar</th>
                              <th>Birim fiyat</th>
                              <th>İskonto %</th>
                              <th>KDV %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {requestDetail.lines.map((line) => (
                              <tr key={line.lineNumber}>
                                <td>
                                  <b>{line.stockCode}</b>
                                  <small className="cell-subtitle">
                                    {line.stockName}
                                  </small>
                                </td>
                                <td>
                                  {line.quantity.toLocaleString("tr-TR", {
                                    maximumFractionDigits: 4,
                                  })}{" "}
                                  {line.unitCode}
                                </td>
                                <td>
                                  <input
                                    aria-label={`${line.stockCode} birim fiyat`}
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    disabled={!!selectedQuoteForOrder}
                                    value={
                                      conversionPrices[line.lineNumber]
                                        ?.unitPrice || "0"
                                    }
                                    onChange={(e) =>
                                      setConversionPrices((current) => ({
                                        ...current,
                                        [line.lineNumber]: {
                                          ...current[line.lineNumber],
                                          unitPrice: e.target.value,
                                        },
                                      }))
                                    }
                                    required
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`${line.stockCode} iskonto oranı`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    disabled={!!selectedQuoteForOrder}
                                    value={
                                      conversionPrices[line.lineNumber]
                                        ?.discountPercent || "0"
                                    }
                                    onChange={(e) =>
                                      setConversionPrices((current) => ({
                                        ...current,
                                        [line.lineNumber]: {
                                          ...current[line.lineNumber],
                                          discountPercent: e.target.value,
                                        },
                                      }))
                                    }
                                    required
                                  />
                                </td>
                                <td>
                                  <input
                                    aria-label={`${line.stockCode} KDV oranı`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    disabled={!!selectedQuoteForOrder}
                                    value={
                                      conversionPrices[line.lineNumber]
                                        ?.vatPercent || "20"
                                    }
                                    onChange={(e) =>
                                      setConversionPrices((current) => ({
                                        ...current,
                                        [line.lineNumber]: {
                                          ...current[line.lineNumber],
                                          vatPercent: e.target.value,
                                        },
                                      }))
                                    }
                                    required
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <label>
                        Not <span className="optional-label">İsteğe bağlı</span>
                        {orderFieldDefinitions.length > 0 && (
                          <div className="form-two">
                            {orderFieldDefinitions.map((field) => (
                              <label key={field.id}>
                                {field.label}
                                {field.isRequired ? " *" : ""}
                                <small>
                                  {field.code} · talep değeri varsa aktarılır
                                </small>
                                {field.dataType === "Boolean" ? (
                                  <select
                                    required={field.isRequired}
                                    value={
                                      conversionFieldValues[field.code] || ""
                                    }
                                    onChange={(e) =>
                                      setConversionFieldValues((current) => ({
                                        ...current,
                                        [field.code]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Seçin</option>
                                    <option value="true">Evet</option>
                                    <option value="false">Hayır</option>
                                  </select>
                                ) : (
                                  <input
                                    type={
                                      field.dataType === "Decimal"
                                        ? "number"
                                        : field.dataType === "Date"
                                          ? "date"
                                          : "text"
                                    }
                                    step={
                                      field.dataType === "Decimal"
                                        ? "any"
                                        : undefined
                                    }
                                    maxLength={
                                      field.dataType === "Text"
                                        ? field.maxLength
                                        : undefined
                                    }
                                    required={field.isRequired}
                                    value={
                                      conversionFieldValues[field.code] || ""
                                    }
                                    onChange={(e) =>
                                      setConversionFieldValues((current) => ({
                                        ...current,
                                        [field.code]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                        <textarea
                          value={conversionNotes}
                          onChange={(e) => setConversionNotes(e.target.value)}
                          maxLength={1000}
                          rows={2}
                        />
                      </label>
                      <div className="modal-foot">
                        <span>
                          Talep miktarları siparişe aynen aktarılır; tutarlar
                          sunucuda hesaplanır.
                        </span>
                        <div>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setOrderConversion(false)}
                          >
                            Vazgeç
                          </button>
                          <button className="primary" disabled={busy}>
                            {busy ? "Oluşturuluyor…" : "Siparişi oluştur"}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                  </DetailSection>
                </div>
              )}
            {requestDetail.customFields &&
              requestDetail.customFields.length > 0 && (
                <DetailSection
                  title="Talep özel alanları"
                  description="Bu değerler satın alma talebiyle saklanır."
                >
                  {requestDetail.status === "Submitted" ? (
                    <form onSubmit={saveRequestCustomFields}>
                      <div className="form-two">
                        {requestDetail.customFields.map((field) => (
                          <label key={field.definitionId}>
                            {field.label}
                            {field.isRequired ? " *" : ""}
                            <small>
                              {field.code} · v{field.definitionVersion}
                            </small>
                            {field.dataType === "Boolean" ? (
                              <select
                                required={field.isRequired}
                                value={requestFieldValues[field.code] || ""}
                                onChange={(e) =>
                                  setRequestFieldValues((current) => ({
                                    ...current,
                                    [field.code]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Seçin</option>
                                <option value="true">Evet</option>
                                <option value="false">Hayır</option>
                              </select>
                            ) : (
                              <input
                                type={
                                  field.dataType === "Decimal"
                                    ? "number"
                                    : field.dataType === "Date"
                                      ? "date"
                                      : "text"
                                }
                                step={
                                  field.dataType === "Decimal"
                                    ? "any"
                                    : undefined
                                }
                                maxLength={
                                  field.dataType === "Text"
                                    ? field.maxLength
                                    : undefined
                                }
                                required={field.isRequired}
                                value={requestFieldValues[field.code] || ""}
                                onChange={(e) =>
                                  setRequestFieldValues((current) => ({
                                    ...current,
                                    [field.code]: e.target.value,
                                  }))
                                }
                              />
                            )}
                          </label>
                        ))}
                      </div>
                      <div className="requests-list">
                        {requestDetail.customFields.map((field) => (
                          <article
                            className="request-row"
                            key={field.definitionId}
                          >
                            <div className="request-info">
                              <b>{field.label}</b>
                              <small>{field.code}</small>
                            </div>
                            <button
                              type="button"
                              className="row-action"
                              disabled={busy}
                              onClick={() =>
                                void openRequestValueHistory(field)
                              }
                            >
                              Değer geçmişi
                            </button>
                          </article>
                        ))}
                      </div>
                      <div className="modal-foot">
                        <span>Onay sonrası alanlar değiştirilemez.</span>
                        <button className="secondary" disabled={busy}>
                          Alanları kaydet
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="requests-list">
                      {requestDetail.customFields.map((field) => (
                        <article
                          className="request-row"
                          key={field.definitionId}
                        >
                          <div className="request-info">
                            <b>{field.label}</b>
                            <small>
                              {field.code} · v{field.definitionVersion}
                            </small>
                          </div>
                          <span>{field.value || "—"}</span>
                          <button
                            type="button"
                            className="row-action"
                            disabled={busy}
                            onClick={() => void openRequestValueHistory(field)}
                          >
                            Değer geçmişi
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                  {requestValueHistoryField && (
                    <div className="pr-value-history">
                      <div className="pr-value-history-head">
                        <div>
                          <b>
                            {requestValueHistoryField.label} · değer geçmişi
                          </b>
                          <small>
                            Geri yükleme yeni bir geçmiş kaydı oluşturur.
                          </small>
                        </div>
                        <button
                          type="button"
                          className="secondary small-button"
                          onClick={() => setRequestValueHistoryField(null)}
                        >
                          Kapat
                        </button>
                      </div>
                      <div className="requests-list">
                        {requestFieldValueHistory.map((revision) => (
                          <article className="request-row" key={revision.id}>
                            <div className="request-info">
                              <b>
                                {revision.previousValue ?? "—"} →{" "}
                                {revision.newValue ?? "—"}
                              </b>
                              <small>
                                Tanım v{revision.definitionVersion} ·{" "}
                                {new Date(revision.createdAt).toLocaleString(
                                  "tr-TR",
                                )}
                              </small>
                            </div>
                            {requestDetail?.status === "Submitted" && (
                              <button
                                type="button"
                                className="secondary small-button"
                                disabled={busy}
                                onClick={() =>
                                  void restoreRequestValueRevision(revision)
                                }
                              >
                                Önceki değeri geri yükle
                              </button>
                            )}
                          </article>
                        ))}
                        {requestFieldValueHistory.length === 0 && (
                          <div className="empty-small">
                            Bu alan için değişiklik geçmişi yok.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </DetailSection>
              )}
            <p className="dd-muted">
              Onay, sipariş ve finans kaydı birbirinden ayrı adımlardır.
            </p>
          </DocumentSurface>
          )}
      {invoiceReceiptId && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setInvoiceReceiptId(null);
          }}
        >
          <div className="modal sales-rf-host sales-rf-host--narrow" role="dialog" aria-modal="true" aria-label="Mal kabulini faturala">
            <RecordFormPage
              variant="dialog"
              className="sales-rf"
              title="Mal kabulini faturala"
              mode="create"
              busy={busy}
              saveLabel="Fatura oluştur"
              onSubmit={createPurchaseInvoice}
              onCancel={() => setInvoiceReceiptId(null)}
              error={error}
              onDismissError={() => setError("")}
              status={
                <span>
                  Vade, tedarikçinin kayıtlı ödeme koşulundan hesaplanır.
                </span>
              }
            >
              <RecordFormGroup title="Alış Faturası" bodyClassName="rf-identity sales-rf-identity-2">
              <label>
                <span>Tedarikçi fatura no <RequiredMark /></span>
                <input
                  className="rf-must rf-mono"
                  value={invoiceCode}
                  onChange={(e) => setInvoiceCode(e.target.value)}
                  required
                  maxLength={64}
                  placeholder="TDR-2026-0042"
                />
              </label>
              <label>
                <span>Fatura tarihi <RequiredMark /></span>
                <input
                  className="rf-must"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                />
              </label>
              </RecordFormGroup>
            </RecordFormPage>
          </div>
        </div>
      )}
      {invoiceId && (
        <PurchaseInvoiceModal
          invoiceId={invoiceId}
          token={token}
          warehouses={warehouses}
          onClose={() => setInvoiceId(null)}
          onChanged={async () => {
            if (detail) {
              await load();
              await openOrder(detail.id);
            }
          }}
        />
      )}
    </div>
  );
}

function SalesOrderModal({
  order,
  token,
  role,
  warehouses,
  onClose,
  onSaved,
  onInvoiceCreated,
  newCommand,
  ownsActionBar = true,
  onReload,
}: {
  order: SalesOrderDetail;
  token: string;
  role: string;
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onInvoiceCreated: (id: string) => void;
  /** The owning screen's Yeni while this detail holds the action bar. */
  newCommand?: CommandSpec;
  /** Reloads this order (the bar's Yenile while it is open). */
  onReload?: () => void | Promise<void>;
  /** False while an invoice opened from this order holds the action bar. */
  ownsActionBar?: boolean;
}) {
  const defaultOrderLineFields: BuiltInScreenLayoutField[] = [
    { key: "stockCode", label: "Stok kodu", visible: true, position: 0 },
    { key: "stockName", label: "Stok adı", visible: true, position: 1 },
    { key: "quantity", label: "Sipariş miktarı", visible: true, position: 2 },
    {
      key: "deliveredQuantity",
      label: "Teslim edilen",
      visible: true,
      position: 3,
    },
    {
      key: "remainingQuantity",
      label: "Kalan miktar",
      visible: true,
      position: 4,
    },
    { key: "reservedQuantity", label: "Rezerve", visible: true, position: 5 },
    { key: "unitPrice", label: "Birim fiyat", visible: true, position: 6 },
    { key: "lineTotal", label: "Satır toplamı", visible: true, position: 7 },
  ];
  const [orderLineFields, setOrderLineFields] = useState<
    BuiltInScreenLayoutField[]
  >(defaultOrderLineFields);
  const visibleOrderLineFields = orderLineFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const [deliveries, setDeliveries] = useState<SalesDeliverySummary[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState(false);
  const [detailTab, setDetailTab] = useState<"information" | "deliveries">("information");
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      (order.customFields || []).map((field) => [field.code, field.value]),
    ),
  );
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(
    order.requestedDeliveryDate || "",
  );
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || ""),
    [deliveryDate, setDeliveryDate] = useState(localDateString());
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [reservationEditor, setReservationEditor] = useState(false),
    [reservationWarehouseId, setReservationWarehouseId] = useState(
      warehouses.find((x) => x.isActive)?.id || "",
    ),
    [reservationRequestId, setReservationRequestId] = useState(() =>
      crypto.randomUUID(),
    );
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      order.lines.map((x) => [x.lineNumber, String(x.remainingQuantity)]),
    ),
  );
  const [deliveryUnits, setDeliveryUnits] = useState<
      Record<number, StockItemUnitConversion[]>
    >({}),
    [enteredDeliveryUnits, setEnteredDeliveryUnits] = useState<
      Record<number, string>
    >(() =>
      Object.fromEntries(order.lines.map((x) => [x.lineNumber, x.unitCode])),
    ),
    [deliveryLocations, setDeliveryLocations] = useState<
      WarehouseLocationOption[]
    >([]),
    [deliveryLocationIds, setDeliveryLocationIds] = useState<
      Record<number, string>
    >({});
  async function loadDeliveries() {
    setLoading(true);
    try {
      const page = await api<{ items: SalesDeliverySummary[] }>(
        `/api/sales/deliveries/?orderId=${order.id}&page=1&pageSize=100`,
        token,
      );
      setDeliveries(page.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadDeliveries();
  }, [order.id, token]);
  useEffect(() => {
    let active = true;
    void api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/sales-order-lines/active",
      token,
    )
      .then((view) => {
        if (active && view.fields?.length) setOrderLineFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    setCustomFieldValues(
      Object.fromEntries(
        (order.customFields || []).map((field) => [field.code, field.value]),
      ),
    );
  }, [order.id, order.customFields]);
  useEffect(() => {
    setRequestedDeliveryDate(order.requestedDeliveryDate || "");
  }, [order.id, order.requestedDeliveryDate]);
  async function saveRequestedDeliveryDate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SalesOrderSummary>(
        `/api/sales/orders/${order.id}/delivery-date`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            requestedDeliveryDate: requestedDeliveryDate || null,
          }),
        },
      );
      setNotice(
        "İstenen teslim tarihi güncellendi. MRP bu tarihi ihtiyaç tarihi olarak kullanacak.",
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveOrderCustomFields(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SalesOrderCustomFieldValue[]>(
        `/api/sales/orders/${order.id}/custom-fields`,
        token,
        { method: "PUT", body: JSON.stringify({ values: customFieldValues }) },
      );
      setNotice("Satış siparişi özel alanları kaydedildi.");
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadDeliveryLocations(targetWarehouseId: string) {
    if (!targetWarehouseId) {
      setDeliveryLocations([]);
      return;
    }
    try {
      setDeliveryLocations(
        (
          await api<WarehouseLocationOption[]>(
            `/api/warehouses/${targetWarehouseId}/locations`,
            token,
          )
        ).filter((location) => location.isActive),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function startDelivery() {
    setError("");
    setNotice("");
    setRequestId(crypto.randomUUID());
    const targetWarehouseId =
      order.lines.find((x) => x.reservationId)?.reservationWarehouseId ||
      warehouses.find((x) => x.isActive)?.id ||
      "";
    setWarehouseId(targetWarehouseId);
    setDeliveryLocationIds({});
    void loadDeliveryLocations(targetWarehouseId);
    setQuantities(
      Object.fromEntries(
        order.lines.map((x) => [
          x.lineNumber,
          String(
            x.reservationId
              ? Math.min(x.remainingQuantity, x.reservedQuantity)
              : x.remainingQuantity,
          ),
        ]),
      ),
    );
    setEnteredDeliveryUnits(
      Object.fromEntries(order.lines.map((x) => [x.lineNumber, x.unitCode])),
    );
    try {
      const units = await Promise.all(
        order.lines.map(async (line) => {
          const result = await api<{ conversions: StockItemUnitConversion[] }>(
            `/api/stock/items/${line.stockItemId}/units`,
            token,
          );
          return [line.lineNumber, result.conversions] as const;
        }),
      );
      setDeliveryUnits(Object.fromEntries(units));
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setEditor(true);
  }
  async function reserveOrderStock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/sales/orders/${order.id}/reservations`, token, {
        method: "POST",
        body: JSON.stringify({
          requestId: reservationRequestId,
          warehouseId: reservationWarehouseId,
        }),
      });
      setReservationRequestId(crypto.randomUUID());
      setReservationEditor(false);
      setNotice("Açık satış siparişi miktarları depoda rezerve edildi.");
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function releaseOrderReservation() {
    const reason = (
      await promptDialog({
        title: "Rezervasyonu bırakma gerekçesi",
        label: "Gerekçe",
        required: true,
        multiline: true,
        tone: "warning",
        confirmLabel: "Devam",
      })
    )?.trim();
    if (!reason) return;
    if (
      !(await confirmDialog({
        title: "Stok rezervasyonu bırakılsın mı?",
        message: "Siparişin kalan stok rezervasyonu bırakılır.",
        tone: "warning",
        confirmLabel: "Rezervasyonu bırak",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/sales/orders/${order.id}/reservations/release`, token, {
        method: "POST",
        body: JSON.stringify({ reason, confirmation: true }),
      });
      setNotice(
        "Kalan stok rezervasyonu bırakıldı ve kullanılabilir bakiyeye döndü.",
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createDelivery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const lines = order.lines
      .map((x) => ({
        orderLineNumber: x.lineNumber,
        quantity: Number(quantities[x.lineNumber] || 0),
        unitCode: enteredDeliveryUnits[x.lineNumber] || x.unitCode,
        storageLocationId: deliveryLocationIds[x.lineNumber] || null,
      }))
      .filter((x) => x.quantity > 0);
    try {
      if (!lines.length)
        throw new Error("En az bir satır için teslim miktarı girin.");
      await api<SalesDeliverySummary>(
        `/api/sales/orders/${order.id}/deliveries`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ requestId, warehouseId, deliveryDate, lines }),
        },
      );
      setNotice("İrsaliye oluşturuldu ve stok çıkışı kaydedildi.");
      setEditor(false);
      await onSaved();
      await loadDeliveries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createInvoice(item: SalesDeliverySummary) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const invoice = await api<SalesInvoiceSummary>(
        `/api/sales/deliveries/${item.id}/invoice`,
        token,
        { method: "POST" },
      );
      setNotice("Satış faturası ve cari borç kaydı oluşturuldu.");
      await onSaved();
      await loadDeliveries();
      onInvoiceCreated(invoice.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidDelivery(item: SalesDeliverySummary) {
    if (
      !(await confirmDialog({
        title: "İrsaliye iptal edilsin mi?",
        message: `${item.code} irsaliyesi iptal edilir. Stok hareketi ters kaydedilecek.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/sales/deliveries/${item.id}/void`, token, {
        method: "POST",
      });
      setNotice("İrsaliye iptal edildi; stok kaydı ters hareketle korundu.");
      await onSaved();
      await loadDeliveries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const activeReservation = order.lines.some((x) => x.reservationId !== null);
  // The order's one-click actions in İşlemler (labels and conditions of the buttons in the detail).
  const orderCommands: PageCommands = documentOpenCommands(onReload);
  if (newCommand) orderCommands.new = newCommand;
  const orderMore: MenuCommand[] = [];
  if (order.status === "Open" && !activeReservation)
    orderMore.push({
      id: "order-reserve",
      label: "Stok ayır",
      run: () => {
        setDetailTab("information");
        setReservationWarehouseId(warehouses.find((warehouse) => warehouse.isActive)?.id || "");
        setReservationRequestId(crypto.randomUUID());
        setReservationEditor(true);
      },
    });
  if (order.status === "Open" && activeReservation && role === "TenantAdmin")
    orderMore.push({ id: "order-release", label: "Rezervasyonu bırak", disabledReason: busy ? "Kaydediliyor…" : undefined, run: () => releaseOrderReservation() });
  if (order.status === "Open")
    orderMore.push({
      id: "order-delivery",
      label: "İrsaliye oluştur",
      disabledReason: busy
        ? "Kaydediliyor…"
        : !warehouses.some((warehouse) => warehouse.isActive)
          ? "Aktif depo yok."
          : order.lines.every((x) => x.remainingQuantity === 0)
            ? "Sevk edilecek kalan miktar yok."
            : undefined,
      run: () => {
        setDetailTab("deliveries");
        void startDelivery();
      },
    });
  if (orderMore.length) orderCommands.more = orderMore;
  const orderMoney = (value: number) => formatAmount(value, order.currencyCode);
  return (
    <DocumentSurface
      variant="detail"
      title="Satış siparişi"
      code={order.code}
      subtitle={order.customerName}
      status={salesOrderStatus(order.status)}
      meta={<span>{formatDate(order.orderDate)}</span>}
      statusFlow={<SalesOrderFlow status={order.status} />}
      onClose={onClose}
      aside={
        <DetailContext title="Belge zinciri">
          <DetailChain
            items={[
              ...(order.quoteCode ? [{ key: "quote", code: order.quoteCode, label: "Satış teklifi" }] : []),
              { key: "self", code: order.code, label: "Bu sipariş", kind: "Satış siparişi", current: true, status: salesOrderStatus(order.status) },
              ...deliveries.map((item) => ({
                key: `delivery-${item.id}`,
                code: item.code,
                label: "Satış irsaliyesi",
                meta: formatDate(item.deliveryDate),
                status: salesDeliveryStatus(item.status),
              })),
              // A delivery gives its invoice's status and id, not its number.
              ...deliveries
                .filter((item) => item.invoiceId && item.invoiceStatus)
                .map((item) => ({
                  key: `invoice-${item.invoiceId}`,
                  label: "Satış faturası",
                  status: salesInvoiceStatus(item.invoiceStatus!),
                  onOpen: () => onInvoiceCreated(item.invoiceId!),
                })),
            ]}
          />
        </DetailContext>
      }
      hints={SALES_DETAIL_HINTS}
      footerStatus={<SalesFooterStatus lines={order.lines.length} total={orderMoney(order.grandTotal)} />}
    >
        {ownsActionBar && <PageCommandsSlot commands={orderCommands} />}
        {error && (
          <div className="alert inline-alert">
            {error}
            <button onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice("")}>
              <X size={15} />
            </button>
          </div>
        )}
        <DetailTabs<"information" | "deliveries">
          label="Sipariş detay bölümleri"
          value={detailTab}
          onChange={setDetailTab}
          tabs={[
            { key: "information", label: "Sipariş Bilgileri" },
            { key: "deliveries", label: "İrsaliye Geçmişi", count: deliveries.length },
          ]}
        />
        {detailTab === "information" && <>
        <div className="dd-box">
          <DetailInfoGrid
            label="Sipariş üst bilgileri"
            items={[
              { label: "Sipariş tarihi", value: formatDate(order.orderDate) },
              { label: "İstenen teslim tarihi", value: formatDate(order.requestedDeliveryDate) },
              { label: "Para birimi", value: order.currencyCode },
              { label: "Kaynak teklif", value: order.quoteCode || "—" },
            ]}
          />
        </div>
        {order.status === "Open" && (
          <form
            className="panel"
            style={{ marginTop: 14 }}
            onSubmit={saveRequestedDeliveryDate}
          >
            <div className="form-two">
              <label>
                İstenen teslim tarihi{" "}
                <span className="optional-label">İsteğe bağlı</span>
                <input
                  type="date"
                  min={order.orderDate}
                  value={requestedDeliveryDate}
                  onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                />
              </label>
              <div>
                <small>
                  MRP, açık sipariş talebini bu tarihte karşılamaya çalışır.
                </small>
                <button className="secondary" disabled={busy}>
                  Teslim tarihini kaydet
                </button>
              </div>
            </div>
          </form>
        )}
        {order.customFields?.length > 0 && (
          <form
            onSubmit={saveOrderCustomFields}
            className="panel"
            style={{ marginTop: 14 }}
          >
            <div className="panel-heading">
              <div>
                <b>Sipariş özel alanları</b>
                <small>
                  {order.status === "Open"
                    ? "Açık siparişte düzenlenebilir."
                    : "Sipariş kapanınca kilitlenir."}
                </small>
              </div>
            </div>
            <div className="form-two">
              {order.customFields.map((field) => (
                <label key={field.definitionId}>
                  {field.label}
                  {field.isRequired ? " *" : ""}
                  <small>
                    {field.code} · {field.dataType}
                  </small>
                  {order.status !== "Open" ? (
                    <span>{field.value || "—"}</span>
                  ) : field.dataType === "Boolean" ? (
                    <select
                      required={field.isRequired}
                      value={customFieldValues[field.code] || ""}
                      onChange={(e) =>
                        setCustomFieldValues((current) => ({
                          ...current,
                          [field.code]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Seçin</option>
                      <option value="true">Evet</option>
                      <option value="false">Hayır</option>
                    </select>
                  ) : (
                    <input
                      type={
                        field.dataType === "Decimal"
                          ? "number"
                          : field.dataType === "Date"
                            ? "date"
                            : "text"
                      }
                      step={field.dataType === "Decimal" ? "any" : undefined}
                      maxLength={
                        field.dataType === "Text" ? field.maxLength : undefined
                      }
                      required={field.isRequired}
                      disabled={order.status !== "Open"}
                      value={customFieldValues[field.code] || ""}
                      onChange={(e) =>
                        setCustomFieldValues((current) => ({
                          ...current,
                          [field.code]: e.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            {order.status === "Open" && (
              <div className="modal-foot">
                <span>Tekliften eşleşen kodlu alan değerleri taşındı.</span>
                <button className="primary" disabled={busy}>
                  Değerleri kaydet
                </button>
              </div>
            )}
          </form>
        )}
        {reservationEditor && detailTab === "information" && (
          <form className="delivery-editor" onSubmit={reserveOrderStock}>
            <label>
              Rezervasyon deposu
              <SearchableRecordPicker
                options={warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => ({ id: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))}
                selectedId={reservationWarehouseId}
                onSelect={setReservationWarehouseId}
                title="Rezervasyon deposu seçin"
                placeholder="Depo seçin"
                searchPlaceholder="Depo kodu veya adıyla ara"
                emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
                required
              />
            </label>
            <p className="muted">Siparişin teslim edilmemiş ürün miktarları seçilen depoda rezerve edilir.</p>
            <div className="modal-foot">
              <span>Bu işlem stok hareketi oluşturmaz.</span>
              <div>
                <button type="button" className="secondary" onClick={() => setReservationEditor(false)}>Vazgeç</button>
                <button className="primary" disabled={busy || !reservationWarehouseId}>Stok ayır</button>
              </div>
            </div>
          </form>
        )}
        <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={order.lines.length} extra={order.currencyCode} />} />
        <div className="dd-grid">
          <AdvancedDataGrid className="customer-table quote-detail-table" gridId="sales-order-lines" {...screenViewGridDefaults(visibleOrderLineFields)} enableRowSelection={false}>
            <thead>
              <ScreenViewGroupHeader fields={visibleOrderLineFields} />
              <tr>
                {visibleOrderLineFields.map((field) => (
                  <th key={field.key} className={ORDER_NUMBER_FIELDS.has(field.key) ? "dd-num" : undefined}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.lineNumber}>
                  {visibleOrderLineFields.map((field) => (
                    <td key={field.key} className={ORDER_NUMBER_FIELDS.has(field.key) ? "dd-num" : undefined}>
                      {field.key === "stockCode" ? (
                        line.stockCode
                      ) : field.key === "stockName" ? (
                        line.stockName
                      ) : field.key === "quantity" ? (
                        `${line.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ${line.unitCode}`
                      ) : field.key === "deliveredQuantity" ? (
                        line.deliveredQuantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })
                      ) : field.key === "remainingQuantity" ? (
                        <b>
                          {line.remainingQuantity.toLocaleString("tr-TR", {
                            maximumFractionDigits: 4,
                          })}
                        </b>
                      ) : field.key === "reservedQuantity" ? (
                        line.reservedQuantity > 0 ? (
                          `${line.reservedQuantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} · ${line.reservationWarehouseName}`
                        ) : (
                          ""
                        )
                      ) : field.key === "unitPrice" ? (
                        <span className="sales-order-line-price">
                          <span>
                            {(line.enteredUnitPrice ?? line.unitPrice).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                            })} {line.enteredCurrencyCode || order.currencyCode}
                          </span>
                          {line.enteredCurrencyCode && line.enteredCurrencyCode !== order.currencyCode && (
                            <small>
                              Kur {Number(line.exchangeRateToOrderCurrency || 1).toLocaleString("tr-TR", { maximumFractionDigits: 8 })} · {line.unitPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {order.currencyCode}
                            </small>
                          )}
                        </span>
                      ) : (
                        line.lineTotal.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
        <DetailLinesFooter
          label="Sipariş toplamları"
          totals={salesTotalRows(
            order,
            orderMoney,
            vatByRate(
              order.lines.map((line) => ({ vatPercent: line.vatPercent, taxable: line.lineSubtotal - line.discountAmount, vat: line.taxAmount })),
              { taxable: order.subtotal - order.discountTotal, vat: order.taxTotal },
            ),
          )}
        />
        </div>
        </>}
        {detailTab === "deliveries" && <>
        {editor && (
          <RecordFormPage
            variant="dialog"
            className="sales-rf sales-rf-embedded"
            title="Satış irsaliyesi"
            mode="create"
            busy={busy}
            saveLabel="İrsaliye oluştur"
            saveDisabledReason={warehouseId ? undefined : "Kaydetmek için depo seçin."}
            onSubmit={(event) => {
              // The old save button was disabled until a warehouse was chosen.
              if (!warehouseId) {
                event.preventDefault();
                return;
              }
              void createDelivery(event);
            }}
            onCancel={() => setEditor(false)}
            status={
              <span>
                Konum seçimi isteğe bağlıdır; stok, seçilen konum ve depoda
                doğrulanır.
              </span>
            }
          >
            <RecordFormGroup title="Sevk Bilgileri" bodyClassName="rf-pair">
              <label>
                <span>Depo <RequiredMark /></span>
                <SearchableRecordPicker
                  options={warehouses
                    .filter((x) => x.isActive)
                    .map((x) => ({ id: x.id, label: `${x.code} · ${x.name}` }))}
                  selectedId={warehouseId}
                  onSelect={(value) => {
                    setWarehouseId(value);
                    setDeliveryLocationIds({});
                    void loadDeliveryLocations(value);
                  }}
                  title="Depo seçin"
                  placeholder="Depo seçin"
                  searchPlaceholder="Depo kodu veya adıyla ara"
                  emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
                  required
                />
              </label>
              <label>
                <span>Sevk tarihi <RequiredMark /></span>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  required
                />
              </label>
            </RecordFormGroup>
            <RecordFormGroup title="Teslim Edilecek Kalemler">
            {order.lines
              .filter((x) => x.remainingQuantity > 0)
              .map((line) => (
                <div className="delivery-quantity" key={line.lineNumber}>
                  <span>
                    <b>{line.stockCode}</b>
                    <small>
                      {line.stockName} · siparişte kalan{" "}
                      {line.remainingQuantity} {line.unitCode}
                    </small>
                  </span>
                  <select
                    aria-label={`${line.stockCode} teslim birimi`}
                    value={
                      enteredDeliveryUnits[line.lineNumber] || line.unitCode
                    }
                    onChange={(e) =>
                      setEnteredDeliveryUnits((current) => ({
                        ...current,
                        [line.lineNumber]: e.target.value,
                      }))
                    }
                  >
                    <option value={line.unitCode}>{line.unitCode}</option>
                    {(deliveryUnits[line.lineNumber] || [])
                      .filter((x) => x.isActive && x.unitCode !== line.unitCode)
                      .map((x) => (
                        <option key={x.id} value={x.unitCode}>
                          {x.unitCode}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label={`${line.stockCode} teslim miktarı`}
                    type="number"
                    min="0"
                    step="0.0001"
                    value={quantities[line.lineNumber] ?? "0"}
                    onChange={(e) =>
                      setQuantities((current) => ({
                        ...current,
                        [line.lineNumber]: e.target.value,
                      }))
                    }
                  />
                  <select
                    aria-label={`${line.stockCode} teslim konumu`}
                    value={deliveryLocationIds[line.lineNumber] || ""}
                    disabled={!warehouseId}
                    onChange={(e) =>
                      setDeliveryLocationIds((current) => ({
                        ...current,
                        [line.lineNumber]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Depo düzeyinde</option>
                    {deliveryLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </RecordFormGroup>
          </RecordFormPage>
        )}
        <DetailSection
          title="İrsaliyeler"
          count={deliveries.length}
          actions={
            <>
          {order.status === "Open" &&
            activeReservation &&
            role === "TenantAdmin" && (
              <button
                className="secondary danger-action"
                disabled={busy}
                onClick={() => void releaseOrderReservation()}
              >
                Rezervasyonu bırak
              </button>
            )}
          {order.status === "Open" && (
            <button
              className="primary"
              disabled={
                busy ||
                warehouses.length === 0 ||
                order.lines.every((x) => x.remainingQuantity === 0)
              }
              onClick={startDelivery}
            >
              <Plus size={14} /> İrsaliye oluştur
            </button>
          )}
            </>
          }
        >
        <div className="delivery-list">
          {loading ? (
            <span className="cell-subtitle">İrsaliyeler yükleniyor…</span>
          ) : deliveries.length === 0 ? (
            <span className="cell-subtitle">Henüz irsaliye oluşturulmadı.</span>
          ) : (
            deliveries.map((item) => (
              <div className="delivery-row" key={item.id}>
                <div>
                  <b>{item.code}</b>
                  <small>
                    {item.deliveryDate.split("-").reverse().join(".")} ·{" "}
                    {item.warehouseName} · {item.lineCount} satır
                  </small>
                </div>
                <span
                  className={`quote-status ${item.status === "Posted" ? "accepted" : "rejected"}`}
                >
                  {item.status === "Posted" ? "Sevk edildi" : "İptal"}
                </span>
                {item.status === "Posted" && !item.hasSalesInvoice && (
                  <button
                    className="row-action"
                    disabled={busy}
                    onClick={() => void createInvoice(item)}
                  >
                    Fatura kes
                  </button>
                )}
                {item.invoiceId && (
                  <button
                    className="row-action"
                    onClick={() => onInvoiceCreated(item.invoiceId!)}
                  >
                    Faturayı aç
                  </button>
                )}
                {item.status === "Posted" &&
                  item.invoiceStatus !== "Posted" && (
                    <button
                      className="row-action danger-action"
                      disabled={busy}
                      onClick={() => void voidDelivery(item)}
                    >
                      İptal et
                    </button>
                  )}
              </div>
            ))
          )}
        </div>
        </DetailSection>
        </>}
      </DocumentSurface>
  );
}

/** Order line grid columns that hold numbers (right-aligned, tabular figures). */
const ORDER_NUMBER_FIELDS = new Set(["quantity", "deliveredQuantity", "remainingQuantity", "unitPrice", "lineTotal"]);

const noTicks = () => undefined;

function SalesInvoiceTable({
  invoices,
  orders,
  customers,
  stockItems,
  warehouses,
  onOpen,
  onSelect,
  selectedId,
  search,
  fields,
  toolbarContainer,
  token,
  role,
  createOpen,
  entryPage = false,
  createFromOrder = false,
  initialCustomerId = "",
  setCreateOpen,
  onInvoiceCreated,
  onChanged,
  onNew,
  commandsSuspended = false,
  ticked = [],
  onTickedChange,
  listFooter,
  listPanel,
  listBodyRef,
  listBodyClass = "sales-list-body",
}: {
  invoices: SalesInvoiceSummary[];
  orders: SalesOrderSummary[];
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  onOpen: (id: string) => void;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  search: string;
  fields: BuiltInScreenLayoutField[];
  toolbarContainer?: HTMLElement | null;
  token: string;
  role: string;
  createOpen: boolean;
  entryPage?: boolean;
  createFromOrder?: boolean;
  initialCustomerId?: string;
  setCreateOpen: (open: boolean) => void;
  onInvoiceCreated: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
  /** Yeni on the invoice list: opens the invoice create page. */
  onNew: () => void;
  /** An invoice / order detail or a page dialog owns the action bar. */
  commandsSuspended?: boolean;
  /** Ticked rows of the list page (the current row is `selectedId`). */
  ticked?: string[];
  onTickedChange?: (ids: string[]) => void;
  /** Footer and detail panel of the list (owned by SalesPage, which also renders the summary cards). */
  listFooter?: React.ReactNode;
  listPanel?: React.ReactNode;
  listBodyRef?: React.Ref<HTMLDivElement>;
  listBodyClass?: string;
}) {
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [actionNotice, setActionNotice] = useState("");
  const [deliveries, setDeliveries] = useState<SalesDeliverySummary[]>([]),
    [deliveryTotal, setDeliveryTotal] = useState(0),
    [deliveryPage, setDeliveryPage] = useState(1),
    [deliverySearch, setDeliverySearch] = useState(""),
    [deliveryLoading, setDeliveryLoading] = useState(false),
    [deliveryBusyId, setDeliveryBusyId] = useState<string | null>(null),
    [deliveryError, setDeliveryError] = useState("");
  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setDeliveryLoading(true);
        setDeliveryError("");
        api<{ items: SalesDeliverySummary[]; totalCount: number }>(
          `/api/sales/deliveries/?unbilledOnly=true&q=${encodeURIComponent(deliverySearch.trim())}&page=${deliveryPage}&pageSize=25`,
          token,
        )
          .then((result) => {
            if (!cancelled) {
              setDeliveries(result.items);
              setDeliveryTotal(result.totalCount);
            }
          })
          .catch((error) => {
            if (!cancelled) setDeliveryError((error as Error).message);
          })
          .finally(() => {
            if (!cancelled) setDeliveryLoading(false);
          });
      },
      deliverySearch ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [createOpen, deliveryPage, deliverySearch, token]);
  async function createFromDelivery(item: SalesDeliverySummary, eDocument?: Record<string, string | null>, accountingProfileCode?: string, invoiceType: "Wholesale" | "Retail" = "Wholesale") {
    setDeliveryBusyId(item.id);
    setDeliveryError("");
    try {
      const invoice = await api<SalesInvoiceSummary>(
        `/api/sales/deliveries/${item.id}/invoice`,
        token,
        { method: "POST", body: JSON.stringify({ eDocument: eDocument ?? null, accountingProfileCode: accountingProfileCode ?? null, invoiceType }) },
      );
      setCreateOpen(false);
      setDeliverySearch("");
      setDeliveryPage(1);
      await onInvoiceCreated(invoice.id);
    } catch (error) {
      setDeliveryError((error as Error).message);
    } finally {
      setDeliveryBusyId(null);
    }
  }
  async function voidInvoice(item: SalesInvoiceSummary) {
    if (
      !(await confirmDialog({
        title: "Fatura iptal edilsin mi?",
        message: `${item.code} faturası iptal edilecek ve cari hareketi ters kayıtla kapatılacak.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      await api(`/api/sales/invoices/${item.id}/void`, token, {
        method: "POST",
      });
      setActionNotice(`${item.code} faturası iptal edildi.`);
      await onChanged();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteInvoice(item: SalesInvoiceSummary) {
    if (
      !(await confirmDialog({
        title: "Fatura silinsin mi?",
        message: `${item.code} faturası silinecek. Yalnızca iptal edilmiş faturalar silinebilir.`,
        tone: "danger",
        confirmLabel: "Sil",
      }))
    )
      return;
    setBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      await api(`/api/sales/invoices/${item.id}`, token, { method: "DELETE" });
      setActionNotice(`${item.code} faturası silindi.`);
      await onChanged();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Already filtered by the search in SalesPage (visibleInvoices).
  const visible = invoices;
  // The bar (Aç, Sil, İşlemler › İptal et) and the detail panel cover the former row menu: no "⋯" column.
  const ordered = fields.filter((field) => field.key !== "actions" && field.visible).sort((a, b) => a.position - b.position);
  const render = (
    item: SalesInvoiceSummary,
    field: BuiltInScreenLayoutField,
  ) => {
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
              onSelect(item.id);
              onOpen(item.id);
            }}
          >
            {item.code}
          </button>
        );
      case "deliveryCode":
        return item.deliveryCode || "—";
      case "orderCode":
        return item.orderCode || "—";
      case "customerName":
        return <span className="customer-name">{item.customerName}</span>;
      case "customerTaxNumber":
        return item.customerTaxNumber || "—";
      case "invoiceDate":
        return item.invoiceDate.split("-").reverse().join(".");
      case "lineCount":
        return item.lineCount;
      case "grandTotal":
        return listAmount(item.grandTotal, item.currencyCode);
      case "status":
        return listTag("invoice", item.status);
      default:
        if (field.key.startsWith("custom:")) return item.listCustomFields?.[field.key] || "—";
        return null;
    }
  };
  // Action bar of the invoice list and of the invoice create page.
  const gridExportRef = useRef<GridExportActions | null>(null);
  const [createDirty, setCreateDirty] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);
  const commands: PageCommands = {};
  if (entryPage) {
    commands.new = {
      run: async () => {
        if (!(await confirmStartNew(createDirty))) return;
        setCreateDirty(false);
        setCreateFormKey((key) => key + 1);
      },
    };
  } else if (!createOpen) {
    // The current row, else a single ticked row (never an implicit first row).
    const selected =
      visible.find((item) => item.id === selectedId) ??
      (ticked.length === 1 ? visible.find((item) => item.id === ticked[0]) : undefined);
    commands.new = { primary: true, run: onNew };
    commands.open = {
      disabledReason: selected ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? selected?.id;
        if (id) onOpen(id);
      },
    };
    const more: MenuCommand[] = [];
    if (role === "TenantAdmin") {
      // A posted (kesilmiş) invoice is cancelled, not deleted; only a voided invoice can be deleted.
      commands.delete = {
        disabledReason: !selected
          ? "Önce bir kayıt seçin"
          : selected.status === "Posted"
            ? "Kesilmiş belge silinemez — İşlemler › İptal et"
            : busy
              ? "Kaydediliyor…"
              : undefined,
        run: () => (selected ? deleteInvoice(selected) : undefined),
      };
      if (selected?.status === "Posted")
        more.push({ id: "invoice-void", label: "İptal et", disabledReason: busy ? "Kaydediliyor…" : undefined, run: () => voidInvoice(selected) });
    }
    more.push(csvExportCommand(gridExportRef));
    commands.more = more;
  }
  return (
    <>
      {!commandsSuspended && (entryPage || !createOpen) && <PageCommandsSlot commands={commands} />}
      {actionError && (
        <div className="alert inline-alert">
          {actionError}
          <button onClick={() => setActionError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {actionNotice && (
        <div className="notice">
          {actionNotice}
          <button onClick={() => setActionNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {!entryPage && (
        <div ref={listBodyRef} className={listBodyClass}>
          <section className="sales-invoice-list-card list-v2-list" aria-label="Satış faturası listesi">
            <SalesDocumentGrid
              gridId="sales-invoices"
              hideExport
              exportActionsRef={gridExportRef}
              fields={ordered}
              items={visible}
              loading={false}
              loadingMessage="Faturalar yükleniyor…"
              emptyMessage="Henüz satış faturası yok. Yeni fatura oluştururken sipariş ve irsaliye kaydı otomatik oluşturulur."
              search={search}
              searchEmptyMessage="Aramanızla eşleşen fatura yok."
              toolbarContainer={toolbarContainer}
              renderCell={(field, item) => render(item, field)}
              selection={{
                currentId: selectedId,
                onCurrentChange: onSelect,
                onTickedChange: onTickedChange ?? noTicks,
                // Only while the list is on screen: a document or form over it must not show the floating bar.
                bulkActions: !commandsSuspended && !createOpen
                  ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                  : undefined,
                onOpen,
              }}
              footer={listFooter}
              columnWidths={INVOICE_LIST_WIDTHS}
              numberFields={SALES_NUMBER_FIELDS}
              codeFields={SALES_CODE_FIELDS}
            />
          </section>
          {listPanel}
        </div>
      )}
      {createOpen && (
        <SalesInvoiceFromDeliveryDialog
          key={createFormKey}
          onDirtyChange={setCreateDirty}
          deliveries={deliveries}
          orders={orders}
          customers={customers}
          stockItems={stockItems}
          warehouses={warehouses}
          token={token}
          initialMode={entryPage || createFromOrder ? "standalone" : "delivery"}
          fullPage={entryPage}
          initialCustomerId={initialCustomerId}
          total={deliveryTotal}
          page={deliveryPage}
          search={deliverySearch}
          loading={deliveryLoading}
          busyDeliveryId={deliveryBusyId}
          error={deliveryError}
          onClose={() => {
            setCreateOpen(false);
            setDeliverySearch("");
            setDeliveryPage(1);
          }}
          onSearchChange={(value) => {
            setDeliverySearch(value);
            setDeliveryPage(1);
          }}
          onPageChange={setDeliveryPage}
          onCreateInvoice={(delivery, eDocument, accountingProfileCode, invoiceType) => void createFromDelivery(delivery, eDocument, accountingProfileCode, invoiceType)}
          onInvoiceCreated={onInvoiceCreated}
        />
      )}
    </>
  );
}

function SalesCustomerPopupSelect({
  customers,
  selectedId,
  onSelect,
  totalCount,
  token,
  onSearchResults,
}: {
  customers: SalesCustomer[];
  selectedId: string;
  onSelect: (customer: SalesCustomer) => void;
  totalCount: number;
  token: string;
  onSearchResults: (customers: SalesCustomer[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [resultCount, setResultCount] = useState(totalCount);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSequence = useRef(0);
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);
  function updateQuery(value: string) {
    setQuery(value);
    searchSequence.current += 1;
    const requestSequence = searchSequence.current;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = value.trim();
    if (term.length < 2) {
      setResultCount(totalCount);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const [customerPage, bothPage] = await Promise.all([
          api<{ items: SalesCustomer[]; totalCount: number }>(`/api/customers/?q=${encodeURIComponent(term)}&type=Customer&status=Active&page=1&pageSize=50`, token),
          api<{ items: SalesCustomer[]; totalCount: number }>(`/api/customers/?q=${encodeURIComponent(term)}&type=Both&status=Active&page=1&pageSize=50`, token),
        ]);
        if (requestSequence === searchSequence.current) {
          setResultCount(customerPage.totalCount + bothPage.totalCount);
          onSearchResults([...customerPage.items, ...bothPage.items]);
        }
      } catch {
        // Keep the currently loaded options available if remote search fails.
      }
    }, 350);
  }
  const selected = customers.find((customer) => customer.id === selectedId);
  const eligible = customers.filter(
    (customer) => customer.isActive && customer.type !== "Supplier",
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = eligible.filter(
    (customer) =>
      !normalizedQuery ||
      `${customer.code} ${customer.name}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedQuery),
  );
  const visible = filtered.slice(0, 50);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="customer-popup-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setResultCount(totalCount);
          searchSequence.current += 1;
          if (searchTimer.current) clearTimeout(searchTimer.current);
          setOpen(true);
        }}
      >
        <span>
          {selected
            ? `${selected.code} · ${selected.name} (${selected.currencyCode})`
            : "Müşteri seçin"}
        </span>
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div
            className="modal-backdrop customer-picker-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section
              className="modal customer-picker-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sales-customer-picker-title"
            >
              <div className="modal-head">
                <div>
                  <p className="eyebrow">SATIŞ YÖNETİMİ</p>
                  <h2 id="sales-customer-picker-title">Müşteri seçin</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Müşteri seçimini kapat"
                  onClick={() => setOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <label className="customer-search">
                <Search size={15} />
                <input
                  type="search"
                  aria-label="Müşteri kodu veya unvanıyla ara"
                  autoFocus
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  placeholder="Müşteri kodu veya unvanıyla ara"
                />
              </label>
              <div className="searchable-record-results-heading">
                <span>Sonuçlar</span>
                <small>{resultCount} kayıt · ilk {visible.length} gösteriliyor</small>
              </div>
              <div
                className="customer-picker-options"
                role="listbox"
                aria-label="Aktif müşteriler"
              >
                {visible.map((customer) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={customer.id === selectedId}
                    className="customer-picker-option"
                    key={customer.id}
                    onClick={() => {
                      onSelect(customer);
                      setOpen(false);
                    }}
                  >
                    <span>
                      <b>
                        {customer.code} · {customer.name}
                      </b>
                      <small>{customer.currencyCode}</small>
                    </span>
                    {customer.id === selectedId && (
                      <span className="customer-picker-selected">Seçili</span>
                    )}
                  </button>
                ))}
                {filtered.length > visible.length && (
                  <div className="customer-picker-empty">
                    İlk {visible.length} sonuç gösteriliyor. Aramayı daraltın.
                  </div>
                )}
                {filtered.length === 0 && (
                  <div className="customer-picker-empty">
                    {eligible.length === 0
                      ? "Seçilebilir aktif müşteri bulunmuyor."
                      : "Aramanızla eşleşen müşteri bulunamadı."}
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
