import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import { ListPagination } from "./list-page/ListPagination";
import SalesListToolbar from "./sales/components/SalesListToolbar";
import SalesInvoiceFromDeliveryDialog from "./sales/components/SalesInvoiceFromDeliveryDialog";
import SalesRowActionsMenu from "./sales/components/SalesRowActionsMenu";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import "./sales/sales-list-v2.css";
import { SalesQuotePdfTools } from "./sales/components/SalesQuotePdfTools";
import AdvancedDataGrid from "./AdvancedDataGrid";
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
import { SalesDeliveriesScreen } from "./SalesDeliveriesPage";
import { PurchaseReceiptsScreen } from "./PurchaseReceiptsScreen";
import { PurchaseInvoiceModal } from "./PurchaseInvoiceModal";
import { SalesInvoiceModal } from "./SalesInvoiceModal";
import { confirmLocalized, promptLocalized } from "./locale";
import { DocumentSurface } from "./document-page/DocumentSurface";
import { DocumentStatusBadge } from "./document-page/DocumentStatusBadge";
import { purchaseInvoiceStatus, purchaseOrderStatus, purchaseReceiptStatus, purchaseRequestStatus, salesInvoiceStatus, salesOrderStatus, salesQuoteStatus } from "./document-page/documentStatus";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./sales/sales-record-forms.css";
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

function AsyncStockItemPicker({
  token,
  selectedId,
  initialItems,
  onSelect,
}: {
  token: string;
  selectedId: string;
  initialItems: StockItem[];
  onSelect: (item: StockItem) => void;
}) {
  const selected = initialItems.find((item) => item.id === selectedId);
  const [query, setQuery] = useState(selected ? `${selected.code} · ${selected.name}` : "");
  const [results, setResults] = useState<StockItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (selected) setQuery(`${selected.code} · ${selected.name}`);
  }, [selected?.id]);
  useEffect(() => {
    const value = query.trim();
    if (!open || value.length < 2 || value === (selected ? `${selected.code} · ${selected.name}` : "")) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api<{ items: StockItem[] }>(
        `/api/stock/items/?q=${encodeURIComponent(value)}&page=1&pageSize=25`,
        token,
      ).then((page) => {
        if (!cancelled) setResults(page.items.filter((item) => item.isActive));
      }).catch(() => {
        if (!cancelled) setResults([]);
      }).finally(() => {
        if (!cancelled) setSearching(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, token, selected?.id]);
  return (
    <div className="async-stock-picker">
      <input
        type="search"
        value={query}
        placeholder="Stok kodu veya adıyla ara"
        aria-label="Stok kodu veya adıyla ara"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && query.trim().length >= 2 && (
        <div className="async-stock-picker-results" role="listbox">
          {searching && <div className="async-stock-picker-empty">Stok kartları aranıyor…</div>}
          {!searching && results.map((item) => (
            <button type="button" role="option" key={item.id} onClick={() => {
              onSelect(item);
              setQuery(`${item.code} · ${item.name}`);
              setOpen(false);
            }}>
              <b>{item.code} · {item.name}</b><small>{item.unitCode}</small>
            </button>
          ))}
          {!searching && results.length === 0 && <div className="async-stock-picker-empty">Eşleşen aktif stok kartı bulunamadı.</div>}
        </div>
      )}
    </div>
  );
}

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
    [selectedSalesId, setSelectedSalesId] = useState<string | null>(null);
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
        const [supplierPage, combinedPage, warehouseItems] = await Promise.all([
          tab === "purchases"
            ? api<{ items: SalesCustomer[] }>(
                "/api/customers/?type=Supplier&status=Active&page=1&pageSize=100",
                token,
              )
            : Promise.resolve({ items: [] as SalesCustomer[] }),
          tab === "purchases"
            ? api<{ items: SalesCustomer[] }>(
                "/api/customers/?type=Both&status=Active&page=1&pageSize=100",
                token,
              )
            : Promise.resolve({ items: [] as SalesCustomer[] }),
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
  function selectDirectOrderStock(index: number, stockItemId: string) {
    const selectedItem = stockItems.find((item) => item.id === stockItemId);
    if (!selectedItem) return;
    const previousLine = directOrderLines[index];
    const editingOrder = Boolean(sessionStorage.getItem("nexora.sales-order.edit-id"));
    const shouldRefreshPrice = !editingOrder || !previousLine?.stockItemId || previousLine.stockItemId === stockItemId || confirmLocalized(
      `Stok kartı değişti. Tanımlı satış fiyatı ${selectedItem.salesListPrice ?? 0} ${selectedItem.priceCurrencyCode || currencyCode} olarak güncellensin mi?`,
    );
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
    const label = promptLocalized("Yeni alan etiketi:", field.label);
    if (label === null) return;
    let maxLength = field.maxLength;
    if (field.dataType === "Text") {
      const raw = promptLocalized(
        "En fazla metin uzunluğu (1–500):",
        String(field.maxLength),
      );
      if (raw === null) return;
      maxLength = Number(raw);
    }
    let isRequired: boolean | undefined;
    if (role === "TenantAdmin") {
      const answer = promptLocalized(
        "Taslaklarda zorunlu olsun mu? Evet/Hayır. Zorunlu yapmak için tüm taslak tekliflerde değer olmalıdır.",
        field.isRequired ? "Evet" : "Hayır",
      );
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
      !confirmLocalized(
        `${field.label} yeni teklifler için devre dışı bırakılsın mı? Mevcut teklif değerleri korunur.`,
      )
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
      !confirmLocalized(
        `${quoteValueHistoryField.label} alanının önceki değeri geri yüklensin mi? Bu işlem yeni bir geçmiş kaydı oluşturur.`,
      )
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
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteQuote(item: SalesQuoteSummary) {
    if (
      !confirmLocalized(
        `${item.code} taslak teklifi ve özel alan geçmişi silinecek. Devam edilsin mi?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/sales/quotes/${item.id}`, token, { method: "DELETE" });
      setSelectedSalesId(null);
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
      !confirmLocalized(
        `${item.code} siparişi ve özel alan geçmişi silinecek. Devam edilsin mi?`,
      )
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
  const statusName = (status: SalesQuoteSummary["status"]) =>
    status === "Draft"
      ? "Taslak"
      : status === "Sent"
        ? "İletildi"
        : status === "Accepted"
          ? "Kabul edildi"
          : status === "Rejected"
            ? "Reddedildi"
            : "Süresi doldu";
  const visibleQuoteFields = quoteScreenFields
    .filter(
      (field) =>
        field.key !== "revisionNumber" &&
        (field.key === "actions" || field.visible),
    )
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
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
        return (
          <b>
            {item.grandTotal.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </b>
        );
      case "status":
        return (
          <DocumentStatusBadge status={salesQuoteStatus(item.status)} />
        );
      case "actions":
        return (
          <SalesRowActionsMenu label={item.code}>
            <button role="menuitem" className="sales-row-menu-item" disabled={busy} onClick={() => void openQuote(item.id)}>Detay</button>
            {item.status === "Draft" && (
              <>
                <button role="menuitem" className="sales-row-menu-item" disabled={busy} onClick={() => void beginQuoteEdit(item.id)}>Düzenle</button>
                <button role="menuitem" className="sales-row-menu-item" disabled={busy} onClick={() => void sendQuote(item)}>İletildi yap</button>
                {role === "TenantAdmin" && (
                  <button role="menuitem" className="sales-row-menu-item danger-action" disabled={busy} onClick={() => void deleteQuote(item)}>Sil</button>
                )}
              </>
            )}
            {item.status === "Sent" && (
              <>
                <button role="menuitem" className="sales-row-menu-item" disabled={busy} onClick={() => void decideQuote(item, "accept")}>Kabul et</button>
                <button role="menuitem" className="sales-row-menu-item danger-action" disabled={busy} onClick={() => void decideQuote(item, "reject")}>Reddet</button>
              </>
            )}
            {item.status === "Accepted" && !item.hasSalesOrder && (
              <button role="menuitem" className="sales-row-menu-item" disabled={busy} onClick={() => void convertQuote(item)}>Sipariş oluştur</button>
            )}
            {item.status === "Accepted" && item.hasSalesOrder && (
              <span className="sales-row-menu-note">Sipariş hazır</span>
            )}
          </SalesRowActionsMenu>
        );
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
        return (
          <b>
            {item.grandTotal.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </b>
        );
      case "status":
        return (
          <DocumentStatusBadge status={salesOrderStatus(item.status)} />
        );
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
  return (
    <div className="list-v2 sales-lv2-root">
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
            >
              {activeTab === "quotes" && (role === "TenantAdmin" || role === "TenantDeveloper") && (
                <button
                  className="secondary"
                  onClick={() => void openQuoteFieldCatalog()}
                >
                  Teklif alanları
                </button>
              )}
              {activeTab === "orders" && (role === "TenantAdmin" || role === "TenantDeveloper") && (
                <button
                  className="secondary"
                  onClick={() => void openOrderFieldCatalog()}
                >
                  Sipariş alanları
                </button>
              )}
              {activeTab === "orders" && (
                <button
                  className="primary"
                  onClick={() => onNavigate("sales-order-create")}
                >
                  <Plus size={17} /> Yeni sipariş
                </button>
              )}
              {activeTab === "quotes" && (
                <button
                  className="primary"
                  onClick={() => void openQuoteCreatePage()}
                >
                  <Plus size={17} /> Yeni teklif
                </button>
              )}
              {activeTab === "invoices" && (
                <button
                  className="primary"
                  onClick={() => onNavigate("sales-invoice-create")}
                >
                  <Plus size={17} /> Fatura oluştur
                </button>
              )}
            </ListPageHeader>
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
        ) : activeTab === "purchases" || activeTab === "requests" ? (
          <PurchasingPanel
            token={token}
            role={role}
            customers={customers}
            stockItems={stockItems}
            warehouses={warehouses}
            mode={activeTab === "requests" ? "requests" : "purchasing"}
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
            invoices={invoices}
            orders={orders}
            customers={customers}
            stockItems={stockItems}
            warehouses={warehouses}
            onOpen={openInvoice}
            onSelect={setSelectedSalesId}
            selectedId={selectedSalesId}
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
          />
        ) : activeTab === "quotes" ? (
          <section
            className="sales-document-list-card list-v2-list"
            aria-label="Satış teklifi listesi"
          >
            <SalesDocumentGrid
              gridId="sales-quotes"
              fields={visibleQuoteFields}
              items={filtered}
              selectedId={selectedSalesId}
              loading={loading}
              loadingMessage="Teklifler yükleniyor…"
              emptyMessage="Henüz satış teklifi yok."
              search={search}
              searchEmptyMessage="Aramanızla eşleşen teklif yok."
              toolbarContainer={salesGridToolsSlot}
              onSelect={setSelectedSalesId}
              renderCell={renderQuoteField}
            />
          </section>
        ) : (
          <section
            className="sales-document-list-card list-v2-list"
            aria-label="Satış siparişi listesi"
          >
            <SalesDocumentGrid
              gridId="sales-orders"
              fields={visibleOrderFields}
              items={filteredOrders}
              selectedId={selectedSalesId}
              loading={loading}
              loadingMessage="Siparişler yükleniyor…"
              emptyMessage="Henüz satış siparişi yok. Yeni sipariş oluşturabilir veya kabul edilen bir teklifi dönüştürebilirsiniz."
              search={search}
              searchEmptyMessage="Aramanızla eşleşen sipariş yok."
              toolbarContainer={salesGridToolsSlot}
              onSelect={setSelectedSalesId}
              renderCell={renderOrderField}
            />
          </section>
        ))}
      {(activeTab === "quotes" ||
        activeTab === "orders" ||
        activeTab === "invoices") &&
        !createOrderPage && !createQuotePage && (
          <ListPagination
            page={salesListPage}
            total={salesListTotal}
            loading={loading}
            onPageChange={setSalesListPage}
          />
        )}
      {quoteFieldCatalogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !quoteFieldBusy)
              setQuoteFieldCatalogOpen(false);
          }}
        >
          <div className="modal quote-field-catalog-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">SATIŞ YÖNETİMİ · TENANT ALANLARI</p>
                <h2>Teklif özel alanları</h2>
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
          <div className="modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">SATIŞ · SİPARİŞ ALANLARI</p>
                <h2>Sipariş alan tanımları</h2>
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
            title={directOrderEditId ? "Sipariş Düzenleme" : "Yeni Sipariş"}
            mode={directOrderEditId ? "edit" : "create"}
            busy={busy}
            saveLabel={directOrderEditId ? "Siparişi kaydet" : "Sipariş oluştur"}
            formId="sales-direct-order-form"
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
            <RecordFormGroup title="Sipariş Kimliği" bodyClassName="rf-identity">
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
            <RecordFormGroup title="Sipariş Satırları">
              <div className="sales-order-create-card sales-rf-lines">
              <div className="quote-lines-table-wrap">
                <table className="quote-lines-table direct-order-lines-table">
                  <thead><tr><th>#</th><th>Stok kartı</th><th>Miktar</th><th>Birim</th><th>Birim fiyat</th><th>Döviz</th><th>Kur</th><th>İskonto %</th><th>KDV %</th><th>KDV türü</th><th>Ara toplam</th><th>İskonto</th><th>KDV tutarı</th><th>Satır toplamı</th></tr></thead>
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
                        <td className="quote-line-index"><span>{index + 1}</span><button type="button" className="quote-line-remove" aria-label={`Satır ${index + 1} kaldır`} title="Satırı kaldır" onClick={() => setDirectOrderLines((current) => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : [{ stockItemId: "", quantity: "1", unitPrice: "0", discountPercent: "0", vatPercent: "20", isVatIncluded: false, unitCode: "", currencyCode: currencyCode || "TRY" }])}>×</button></td>
                        <td className="quote-stock-cell"><SearchableRecordPicker options={stockItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}`, description: item.unitCode, searchText: item.unitCode }))} selectedId={line.stockItemId} onSelect={(id) => selectDirectOrderStock(index, id)} title="Stok kartı seçin" placeholder="Stok seçin" searchPlaceholder="Stok kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen stok kartı bulunamadı." required /></td>
                        <td><input aria-label={`Satır ${index + 1} miktar`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateDirectOrderLine(index, "quantity", event.target.value)} required /></td>
                        <td><select aria-label={`Satır ${index + 1} birim`} value={line.unitCode || itemUnit} onChange={(event) => updateDirectOrderLine(index, "unitCode", event.target.value)} required><option value={itemUnit || line.unitCode}>{itemUnit || line.unitCode || "Temel birim"}</option>{(quoteUnits[line.stockItemId] || []).filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.unitCode}>{unit.unitCode} (×{unit.factorToBase})</option>)}</select></td>
                        <td><input aria-label={`Satır ${index + 1} birim fiyat`} type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(event) => updateDirectOrderLine(index, "unitPrice", event.target.value)} required /></td>
                        <td><select aria-label={`Satır ${index + 1} para birimi`} value={lineCurrency} onChange={(event) => updateDirectOrderLine(index, "currencyCode", event.target.value)}>{quoteCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></td>
                        <td><input aria-label={`Satır ${index + 1} döviz kuru`} value={fxRate === null ? "Kur yok" : formatOrderMoney(fxRate)} disabled /></td>
                        <td><input aria-label={`Satır ${index + 1} iskonto yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => updateDirectOrderLine(index, "discountPercent", event.target.value)} required /></td>
                        <td><input aria-label={`Satır ${index + 1} KDV yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.vatPercent} onChange={(event) => updateDirectOrderLine(index, "vatPercent", event.target.value)} required /></td>
                        <td><select aria-label={`Satır ${index + 1} KDV dahil veya hariç`} value={line.isVatIncluded ? "included" : "excluded"} onChange={(event) => updateDirectOrderLine(index, "isVatIncluded", event.target.value === "included")}><option value="excluded">KDV hariç</option><option value="included">KDV dâhil</option></select></td>
                        <td className="quote-amount-cell"><input aria-label={`Satır ${index + 1} ara toplam`} value={formatOrderMoney(subtotal)} disabled /></td>
                        <td className="quote-amount-cell"><input aria-label={`Satır ${index + 1} iskonto tutarı`} value={formatOrderMoney(discount)} disabled /></td>
                        <td className="quote-amount-cell"><input aria-label={`Satır ${index + 1} KDV tutarı`} value={formatOrderMoney(tax)} disabled /></td>
                        <td className="quote-amount-cell quote-row-total"><input aria-label={`Satır ${index + 1} satır toplamı`} value={formatOrderMoney(subtotal - discount + tax)} disabled /></td>
                      </tr>;
                    })}
                    <tr className="quote-line-add-row"><td colSpan={14}><button type="button" className="secondary small-button" data-line-add-shortcut title="Ctrl+Shift+Enter ile satır ekle" onClick={() => setDirectOrderLines((current) => [...current, { stockItemId: "", quantity: "1", unitPrice: "0", discountPercent: "0", vatPercent: "20", isVatIncluded: false, unitCode: "", currencyCode: currencyCode || "TRY" }])}><Plus size={14} /> Satır ekle <small>Ctrl+Shift+Enter</small></button></td></tr>
                  </tbody>
                </table>
              </div>
              </div>
            </RecordFormGroup>
            <RecordFormGroup title="Toplamlar">
              <div className="sales-order-create-card sales-rf-lines">
              <section className="order-grand-total quote-total-breakdown" aria-label="Sipariş toplamları">
                <div><span>Mal / hizmet toplamı</span>{renderOrderCurrency(directOrderTotals.subtotal, customers.find((x) => x.id === customerId)?.currencyCode || "TRY")}</div>
                <div><span>Toplam iskonto</span><span className="sales-total-discount">− {renderOrderCurrency(directOrderTotals.discount, customers.find((x) => x.id === customerId)?.currencyCode || "TRY")}</span></div>
                {Object.keys(directOrderTotals.taxableByRate).map(Number).sort((a, b) => a - b).map((rate) => <div key={`order-tax-${rate}`}><span>KDV %{rate} matrahı</span>{renderOrderCurrency(directOrderTotals.taxableByRate[rate], customers.find((x) => x.id === customerId)?.currencyCode || "TRY")}</div>)}
                {Object.keys(directOrderTotals.vatByRate).map(Number).sort((a, b) => a - b).map((rate) => <div key={`order-vat-${rate}`}><span>KDV %{rate}</span>{renderOrderCurrency(directOrderTotals.vatByRate[rate], customers.find((x) => x.id === customerId)?.currencyCode || "TRY")}</div>)}
                <div><span>KDV toplamı</span>{renderOrderCurrency(directOrderTotals.vat, customers.find((x) => x.id === customerId)?.currencyCode || "TRY")}</div>
                <div className="grand"><span>Genel toplam · Ödenecek tutar</span>{renderOrderCurrency(directOrderTotals.total, customers.find((x) => x.id === customerId)?.currencyCode || "TRY")}</div>
              </section>
              </div>
            </RecordFormGroup>
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
            title={editingQuoteId ? "Teklif Düzenleme" : revisesQuoteId ? "Teklif Revizyonu" : "Yeni Teklif"}
            mode={editingQuoteId ? "edit" : "create"}
            busy={busy}
            saveLabel={editingQuoteId ? "Değişiklikleri kaydet" : revisesQuoteId ? "Revizyon taslağını oluştur" : "Teklif taslağı oluştur"}
            formId="sales-quote-create-form"
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
            <RecordFormGroup title="Teklif Kimliği" bodyClassName="rf-identity">
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
            <RecordFormGroup title="Teklif Satırları">
              <div className="sales-order-create-card sales-rf-lines">
              <div className="quote-lines-table-wrap">
                <table className="quote-lines-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Stok kartı</th><th>Miktar</th><th>Birim</th>
                      <th>Birim fiyat</th><th>Döviz</th><th>Kur</th><th>İskonto %</th><th>KDV %</th>
                      <th>KDV</th><th>Ara toplam</th><th>İskonto</th><th>KDV tutarı</th><th>Satır toplamı</th>
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
                          <td className="quote-line-index"><span>{index + 1}</span><button type="button" className="quote-line-remove" aria-label={`Satır ${index + 1} kaldır`} title="Satırı kaldır" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button></td>
                          <td className="quote-stock-cell">
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
                          <td><input aria-label={`Satır ${index + 1} miktar`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required /></td>
                          <td>
                            <select aria-label={`Satır ${index + 1} birim`} value={line.unitCode || itemUnit} onChange={(event) => updateLine(index, "unitCode", event.target.value)} required>
                              <option value={itemUnit || line.unitCode}>{itemUnit || line.unitCode || "Temel birim"}</option>
                              {(quoteUnits[line.stockItemId] || []).filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.unitCode}>{unit.unitCode} (×{unit.factorToBase})</option>)}
                            </select>
                          </td>
                          <td><input aria-label={`Satır ${index + 1} birim fiyat`} type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} required /></td>
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
                          <td><input aria-label={`Satır ${index + 1} döviz kuru`} type="number" min="0.00000001" step="0.00000001" value={lineCurrency.toUpperCase() === currencyCode.toUpperCase() ? "1" : line.exchangeRateOverride || (lineFxRate === null ? "" : String(lineFxRate))} disabled={lineCurrency.toUpperCase() === currencyCode.toUpperCase()} onChange={(event) => updateLine(index, "exchangeRateOverride", event.target.value)} /></td>
                          <td><input aria-label={`Satır ${index + 1} iskonto yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => updateLine(index, "discountPercent", event.target.value)} required /></td>
                          <td><input aria-label={`Satır ${index + 1} KDV yüzdesi`} type="number" min="0" max="100" step="0.01" value={line.vatPercent} onChange={(event) => updateLine(index, "vatPercent", event.target.value)} required /></td>
                          <td><select aria-label={`Satır ${index + 1} KDV dahil mi`} value={line.isVatIncluded ? "included" : "excluded"} onChange={(event) => updateLine(index, "isVatIncluded", event.target.value === "included")}><option value="excluded">Hariç</option><option value="included">Dahil</option></select></td>
                          <td className="quote-amount-cell"><input aria-label={`Satır ${index + 1} ara toplam`} value={formatOrderMoney(amount.subtotal)} disabled /></td>
                          <td className="quote-amount-cell"><input aria-label={`Satır ${index + 1} iskonto tutarı`} value={formatOrderMoney(amount.discount)} disabled /></td>
                          <td className="quote-amount-cell"><input aria-label={`Satır ${index + 1} KDV tutarı`} value={formatOrderMoney(amount.tax)} disabled /></td>
                          <td className="quote-amount-cell quote-row-total"><input aria-label={`Satır ${index + 1} satır toplamı`} value={formatOrderMoney(amount.total)} disabled /></td>
                        </tr>
                      );
                    })}
                    <tr className="quote-line-add-row">
                      <td colSpan={14}>
                        <button
                          type="button"
                          className="secondary small-button"
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
                          <Plus size={14} /> Satır ekle
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              </div>
            </RecordFormGroup>
            <div className="sales-rf-totals-layout">
            <RecordFormGroup title="Koşullar ve Açıklama">
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
            </RecordFormGroup>
            <RecordFormGroup title="Toplamlar">
              <div className="sales-order-create-card sales-rf-lines">
              <section className="order-grand-total quote-grand-total quote-total-breakdown" aria-label="Teklif toplamları">
                <div><span>Mal / hizmet toplamı</span>{renderOrderCurrency(quoteTotals.subtotal, currencyCode)}</div>
                <div><span>Toplam iskonto</span><span className="sales-total-discount">− {renderOrderCurrency(quoteTotals.discount, currencyCode)}</span></div>
                {Object.keys(quoteTotals.taxableByRate).map(Number).sort((a, b) => a - b).map((rate) => <div key={`quote-tax-${rate}`}><span>KDV %{rate} matrahı</span>{renderOrderCurrency(quoteTotals.taxableByRate[rate], currencyCode)}</div>)}
                {Object.keys(quoteTotals.taxByRate).map(Number).sort((a, b) => a - b).map((rate) => <div key={`quote-vat-${rate}`}><span>KDV %{rate}</span>{renderOrderCurrency(quoteTotals.taxByRate[rate], currencyCode)}</div>)}
                <div><span>KDV toplamı</span>{renderOrderCurrency(quoteTotals.tax, currencyCode)}</div>
                <div className="grand"><span>Genel toplam · Ödenecek tutar</span>{renderOrderCurrency(quoteTotals.total, currencyCode)}</div>
              </section>
              </div>
            </RecordFormGroup>
            </div>
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
      {detail && (
          <DocumentSurface
            title="Satış teklifi"
            code={detail.code}
            subtitle={detail.customerName}
            status={salesQuoteStatus(detail.status)}
            onClose={() => setDetail(null)}
            className="sales-quote-detail-backdrop"
            bodyClassName="modal ledger-modal sales-detail-modal sales-quote-detail-modal"
          >
            <nav className="sales-quote-detail-tabs" role="tablist" aria-label="Teklif detay bölümleri">
              {([
                ["information", "Teklif Bilgileri"],
                ["revisions", "Teklif Geçmişi"],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={quoteDetailTab === key} className={quoteDetailTab === key ? "active" : ""} onClick={() => setQuoteDetailTab(key)}>{label}{key === "revisions" && <span>{quoteRevisions.length}</span>}</button>
              ))}
            </nav>
            <div className="sales-detail-content">
            {quoteDetailTab === "information" && <>
            <section className="sales-quote-readonly-form" aria-label="Teklif üst bilgileri">
              <label><span>Teklif alıcısı</span><input readOnly value={`${detail.customerCode ? `${detail.customerCode} · ` : ""}${detail.customerName}`} /></label>
              <label><span>Durum</span><input readOnly value={statusName(detail.status)} /></label>
              <label><span>Teklif tarihi</span><input readOnly value={new Date(`${detail.quoteDate}T00:00:00`).toLocaleDateString("tr-TR")} /></label>
              <label><span>Geçerlilik tarihi</span><input readOnly value={new Date(`${detail.validUntil}T00:00:00`).toLocaleDateString("tr-TR")} /></label>
              {detail.salesRequestCode && <label><span>Kaynak talep</span><input readOnly value={detail.salesRequestCode} /></label>}
              <label><span>Para birimi</span><input readOnly value={detail.currencyCode} /></label>
              <label><span>Plasiyer</span><input readOnly value={detail.salespersonName || "—"} /></label>
              {detail.deliveryTerms && <label className="wide"><span>Teslimat koşulları</span><textarea readOnly rows={2} value={detail.deliveryTerms} /></label>}
            </section>
            </>}
            {quoteDetailTab === "revisions" && <section className="panel sales-quote-revisions">
              <div className="sales-quote-revisions-heading">
                <div className="sales-quote-revisions-title">
                  <b>Revizyon geçmişi</b>
                  <small>Önceki teklif sürümleri korunur.</small>
                </div>
                <div className="sales-quote-revisions-actions">
                  <span className="sales-quote-revision-count">{quoteRevisions.length} sürüm</span>
                  {!detail.hasSalesOrder && quoteRevisions[quoteRevisions.length - 1]?.id === detail.id && (
                  <button type="button" className="secondary small-button" disabled={busy} onClick={() => void beginQuoteRevision()}>
                    Yeni revizyon oluştur
                  </button>
                  )}
                </div>
              </div>
              <div className="requests-list sales-quote-revisions-list">
                {quoteRevisions.map((revision) => (
                  <button type="button" className="request-row" key={revision.id} onClick={() => revision.id !== detail.id && void openQuote(revision.id)} disabled={revision.id === detail.id}>
                    <div className="request-info">
                      <b>Revizyon {revision.revisionNumber} · {revision.code}</b>
                      <small>{statusName(revision.status)} · {revision.quoteDate} · {revision.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {revision.currencyCode}</small>
                    </div>
                    {revision.id === detail.id && <span className="quote-status accepted">Açık</span>}
                  </button>
                ))}
              </div>
            </section>}
            {quoteDetailTab === "information" && <>
            <section className="sales-quote-lines-section">
            <h3 className="sales-quote-section-title">Teklif Satırları</h3>
            <div className="ledger-list sales-quote-lines">
              <table className="customer-table quote-detail-table">
                <thead>
                  <tr>
                    <th>Stok</th>
                    <th>Miktar</th>
                    <th>Birim fiyat</th>
                    <th>İskonto</th>
                    <th>KDV</th>
                    <th>Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
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
                        {(line.enteredUnitPrice ?? line.unitPrice).toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}{" "}{line.enteredCurrencyCode || detail.currencyCode}
                        {line.enteredCurrencyCode && line.enteredCurrencyCode !== detail.currencyCode && (
                          <small className="cell-subtitle">
                            Kur: 1 {line.enteredCurrencyCode} = {Number(line.exchangeRateToQuoteCurrency || 1).toLocaleString("tr-TR", { maximumFractionDigits: 8 })} {detail.currencyCode}
                            {" · "}{line.unitPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {detail.currencyCode}
                          </small>
                        )}
                      </td>
                      <td>
                        {line.discountAmount.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        ({line.discountPercent}%)
                      </td>
                      <td>
                        {line.taxAmount.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        ({line.vatPercent}%)
                      </td>
                      <td>
                        {line.lineTotal.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </section>
            <div className="sales-quote-total-row">
              {detail.notes && (
                <label className="sales-quote-notes-field">
                  <span>Notlar</span>
                  <textarea readOnly rows={5} value={detail.notes} />
                </label>
              )}
              <section className="sales-quote-totals-panel">
                <div><span>Ara toplam</span><b>{detail.subtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {detail.currencyCode}</b></div>
                <div><span>Toplam iskonto</span><b>{detail.discountTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {detail.currencyCode}</b></div>
                <div><span>Toplam KDV</span><b>{detail.taxTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {detail.currencyCode}</b></div>
                <div className="grand-total"><span>Genel toplam</span><b>{detail.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {detail.currencyCode}</b></div>
              </section>
            </div>
            </>}
            {quoteDetailTab === "information" && detail.status === "Draft" && detail.customFields.length > 0 && (
              <form
                onSubmit={saveQuoteFieldValues}
                className="panel"
                style={{ marginTop: 14 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>Teklif özel alanları</b>
                    <small>Teklif iletildiğinde değerler kilitlenir.</small>
                  </div>
                </div>
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
                <div className="modal-foot">
                  <span>İşlem geçmişi her değişikliği saklar.</span>
                  <button className="primary" disabled={quoteFieldBusy}>
                    Değerleri kaydet
                  </button>
                </div>
              </form>
            )}
            {quoteDetailTab === "information" && quoteValueHistoryField && (
              <section className="panel" style={{ marginTop: 14 }}>
                <div className="panel-heading">
                  <div>
                    <b>{quoteValueHistoryField.label} · değer geçmişi</b>
                    <small>Son 50 değişiklik</small>
                  </div>
                  <button
                    type="button"
                    className="secondary small-button"
                    onClick={() => setQuoteValueHistoryField(null)}
                  >
                    Kapat
                  </button>
                </div>
                <div className="requests-list">
                  {quoteValueHistory.map((revision) => (
                    <article className="request-row" key={revision.id}>
                      <div className="request-info">
                        <b>
                          {revision.previousValue ?? "—"} →{" "}
                          {revision.newValue ?? "—"}
                        </b>
                        <small>
                          Tanım v{revision.definitionVersion} ·{" "}
                          {new Date(revision.createdAt).toLocaleString("tr-TR")}
                        </small>
                      </div>
                      {detail.status === "Draft" && (
                        <button
                          type="button"
                          className="secondary small-button"
                          disabled={quoteFieldBusy}
                          onClick={() =>
                            void restoreQuoteFieldRevision(revision)
                          }
                        >
                          Önceki değeri geri yükle
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
            <div className="decision-actions">
              {detail.status === "Sent" && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void decideQuote(detail, "reject")}
                  >
                    Teklifi reddet
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void decideQuote(detail, "accept")}
                  >
                    Teklifi kabul et
                  </button>
                </>
              )}
              {detail.status === "Rejected" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void decideQuote(detail, "accept")}
                >
                  Reddedilen teklifi kabul et
                </button>
              )}
              {detail.status === "Accepted" && !detail.hasSalesOrder && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void convertQuote(detail)}
                >
                  Satış siparişi oluştur
                </button>
              )}
              {detail.hasSalesOrder && (
                <span className="quote-status accepted">
                  Satış siparişi oluşturuldu
                </span>
              )}
            </div>
            </div>
            <div className="modal-foot">
              <div className="sales-quote-footer-summary" aria-label="Teklif özeti">
                <span className="sales-quote-footer-revision">Revizyon {detail.revisionNumber}</span>
                <span><small>Teklif tarihi</small><b>{detail.quoteDate}</b></span>
                <span><small>Son geçerlilik</small><b>{detail.validUntil}</b></span>
              </div>
              <div>
                <button className="secondary" onClick={() => setDetail(null)}>
                  Kapat
                </button>
                <button className="secondary sales-quote-print-trigger" onClick={() => setQuotePrintOpen(true)}>
                  <Printer size={15} /> Yazdır / Önizle
                </button>
                {detail.status === "Draft" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void sendQuote(detail)}
                  >
                    {busy ? "Kaydediliyor…" : "İletildi yap"}
                  </button>
                )}
              </div>
            </div>
          </DocumentSurface>
      )}
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
        />
      )}
    </div>
  );
}

function PurchaseInvoicesScreen({
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
    [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const defaultLayout: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Fatura no", visible: true, position: 0 },
    { key: "supplierName", label: "Tedarikçi", visible: true, position: 1 },
    { key: "receiptCode", label: "Mal kabul", visible: true, position: 2 },
    {
      key: "purchaseOrderCode",
      label: "Sipariş no",
      visible: true,
      position: 3,
    },
    { key: "invoiceDate", label: "Fatura tarihi", visible: true, position: 4 },
    { key: "dueDate", label: "Vade tarihi", visible: true, position: 5 },
    { key: "currencyCode", label: "Döviz", visible: true, position: 6 },
    { key: "grandTotal", label: "Toplam", visible: true, position: 7 },
    { key: "paidAmount", label: "Ödenen", visible: true, position: 8 },
    {
      key: "outstandingAmount",
      label: "Ödenmemiş",
      visible: true,
      position: 9,
    },
    { key: "lineCount", label: "Satır", visible: true, position: 10 },
    { key: "status", label: "Durum", visible: true, position: 11 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 12,
      fixed: true,
    },
  ];
  const [screenFields, setScreenFields] = useState(defaultLayout);
  const pageSize = 25;
  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        q: query.trim(),
      });
      if (supplierFilter) params.set("supplierId", supplierFilter.id);
      const result = await api<{
        items: PurchaseInvoiceSummary[];
        page: number;
        pageSize: number;
        totalCount: number;
      }>(`/api/purchasing/invoices/?${params}`, token);
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
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-invoices/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
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
  const visibleFields = [...screenFields]
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  function cell(item: PurchaseInvoiceSummary, field: BuiltInScreenLayoutField) {
    switch (field.key) {
      case "code":
        return <span className="customer-code">{item.code}</span>;
      case "supplierName":
        return <b className="customer-name">{item.supplierName}</b>;
      case "receiptCode":
        return item.receiptCode;
      case "purchaseOrderCode":
        return item.purchaseOrderCode;
      case "invoiceDate":
        return item.invoiceDate.split("-").reverse().join(".");
      case "dueDate":
        return item.dueDate.split("-").reverse().join(".");
      case "currencyCode":
        return item.currencyCode;
      case "grandTotal":
        return (
          <b>
            {item.grandTotal.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </b>
        );
      case "paidAmount":
        return (
          <>
            {item.paidAmount.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </>
        );
      case "outstandingAmount":
        return (
          <b>
            {item.outstandingAmount.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </b>
        );
      case "lineCount":
        return item.lineCount;
      case "status":
        return (
          <DocumentStatusBadge status={purchaseInvoiceStatus(item.status)} />
        );
      case "actions":
        return (
          <button
            className="row-action"
            onClick={(event) => {
              event.stopPropagation();
              void openInvoice(item.id);
            }}
          >
            Detay
          </button>
        );
      default:
        return null;
    }
  }
  return (
    <div className="purchase-invoices-page list-v2">
      <div className="sales-lv2-stack">
        <ListPageHeader
          className="customer-heading"
          title="Satınalma Faturaları"
          description="Mal kabullerinden oluşan tedarikçi faturalarını, vadeleri ve kalan borçları izleyin."
          count={total}
        >
          <details className="purchase-invoice-add-menu">
            <summary className="primary" aria-haspopup="menu">
              <Plus size={16} />
              Fatura ekle
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="purchase-invoice-add-options" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  onNavigate("sales-purchase-invoice-entry");
                }}
              >
                <b>Mal kabulünden fatura</b>
                <small>Faturalanmamış bir mal kabulünü seçip faturasını girin.</small>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  onNavigate("sales-purchase-invoice-drafts");
                }}
              >
                <b>Mal kabulsüz fatura</b>
                <small>Sipariş veya mal kabulü olmayan tedarikçi faturasını taslak olarak girin.</small>
              </button>
            </div>
          </details>
        </ListPageHeader>
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
        </ListToolbar>
      </div>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <section
        className="purchase-invoice-list-card list-v2-list"
        aria-label="Alış faturası listesi"
      >
        <div className="customer-table-wrap">
          <AdvancedDataGrid
          className="customer-table quote-table"
          gridId="purchase-invoices"
          {...screenViewGridDefaults(visibleFields)}
          externalPagination
          hideSearch
          toolbarContainer={toolsSlot}
          enableRowSelection={false}
        >
            <thead>
              <ScreenViewGroupHeader fields={visibleFields} />
              <tr>
                {visibleFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleFields.length} className="table-empty">
                    Alış faturaları yükleniyor…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={visibleFields.length} className="table-empty">
                    {query
                      ? "Aramanızla eşleşen alış faturası yok."
                      : supplierFilter
                        ? `${supplierFilter.name} için görüntülenebilir alış faturası yok.`
                        : "Henüz alış faturası yok. Fatura eklemek için faturalanabilir bir mal kabul seçin."}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} onClick={() => void openInvoice(item.id)}>
                    {visibleFields.map((field) => (
                      <td key={field.key}>{cell(item, field)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </AdvancedDataGrid>
        </div>
      </section>
      <ListPagination
        page={page}
        total={total}
        pageSize={pageSize}
        loading={loading}
        onPageChange={setPage}
      />
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

function PurchasingPanel({
  token,
  role,
  customers,
  stockItems,
  warehouses,
  mode,
}: {
  token: string;
  role: string;
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  mode: "requests" | "purchasing";
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
  const defaultOrderScreenFields: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Sipariş no", visible: true, position: 0 },
    { key: "supplierName", label: "Tedarikçi", visible: true, position: 1 },
    { key: "orderDate", label: "Sipariş tarihi", visible: true, position: 2 },
    {
      key: "expectedReceiptDate",
      label: "Beklenen teslim",
      visible: true,
      position: 3,
    },
    {
      key: "targetWarehouseCode",
      label: "Hedef depo",
      visible: true,
      position: 4,
    },
    { key: "lineCount", label: "Satır", visible: true, position: 5 },
    { key: "grandTotal", label: "Genel toplam", visible: true, position: 6 },
    { key: "currencyCode", label: "Döviz", visible: true, position: 7 },
    { key: "status", label: "Durum", visible: true, position: 8 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 9,
      fixed: true,
    },
  ];
  const [orderScreenFields, setOrderScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >(defaultOrderScreenFields);
  const defaultRequestScreenFields: BuiltInScreenLayoutField[] = [
    { key: "code", label: "Talep no", visible: true, position: 0 },
    { key: "description", label: "Açıklama", visible: true, position: 1 },
    { key: "requestedByName", label: "Talep sahibi", visible: true, position: 2 },
    { key: "requestDate", label: "Talep tarihi", visible: true, position: 3 },
    { key: "neededByDate", label: "İhtiyaç tarihi", visible: true, position: 4 },
    { key: "lineCount", label: "Kalem", visible: true, position: 5 },
    { key: "status", label: "Durum", visible: true, position: 6 },
    {
      key: "purchaseOrderCode",
      label: "Bağlı sipariş",
      visible: false,
      position: 7,
    },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 8,
      fixed: true,
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
    [editor, setEditor] = useState(false),
    [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [requestSearch, setRequestSearch] = useState(""),
    [requestStatus, setRequestStatus] = useState(""),
    [orderSearch, setOrderSearch] = useState("");
  const [orderGridToolsSlot, setOrderGridToolsSlot] =
    useState<HTMLDivElement | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null),
    [invoiceReceiptId, setInvoiceReceiptId] = useState<string | null>(null),
    [invoiceCode, setInvoiceCode] = useState(""),
    [invoiceDate, setInvoiceDate] = useState(today);
  const [code, setCode] = useState(""),
    [supplierId, setSupplierId] = useState(""),
    [orderDate, setOrderDate] = useState(today),
    [expectedReceiptDate, setExpectedReceiptDate] = useState(""),
    [targetWarehouseId, setTargetWarehouseId] = useState(""),
    [notes, setNotes] = useState("");
  const [lines, setLines] = useState([
      {
        stockItemId: "",
        quantity: "1",
        unitPrice: "0",
        discountPercent: "0",
        vatPercent: "20",
        unitCode: "",
      },
    ]),
    [purchaseOrderUnits, setPurchaseOrderUnits] = useState<
      Record<string, StockItemUnitConversion[]>
    >({});
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
        const requests = await api<PurchaseRequestPage>(
          `/api/purchasing/requests/?${requestParams}`,
          token,
        );
        setPurchaseRequests(requests.items);
        setRequestPage(requests.page);
        setRequestTotal(requests.totalCount);
        setSelectedRequestId((current) =>
          current && requests.items.some((item) => item.id === current)
            ? current
            : (requests.items[0]?.id ?? null),
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
    }, requestsOnly && requestSearch.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [token, requestsOnly, requestSearch, requestStatus, orderSearch]);
  useEffect(() => {
    if (requestsOnly) return;
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-orders/active",
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
  }, [token, requestsOnly]);
  const visibleOrderScreenFields = useMemo(
    () =>
      orderScreenFields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position),
    [orderScreenFields],
  );
  useEffect(() => {
    if (!requestsOnly) return;
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/purchase-requests/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setRequestScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, requestsOnly]);
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
        ),
    [requestScreenFields],
  );
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
      case "code":
        return <td key={field.key}><button type="button" className="purchase-request-code" onClick={(event) => { event.stopPropagation(); setSelectedRequestId(request.id); }}>{request.code}</button></td>;
      case "description":
        return <td key={field.key} className="purchase-request-description">{request.description}</td>;
      case "requestedByName":
        return <td key={field.key}>{request.requestedByName || "—"}</td>;
      case "requestDate":
        return <td key={field.key}>{request.requestDate.split("-").reverse().join(".")}</td>;
      case "neededByDate":
        return <td key={field.key}>{request.neededByDate?.split("-").reverse().join(".") || "—"}</td>;
      case "lineCount":
        return <td key={field.key}>{request.lineCount}</td>;
      case "status":
        return <td key={field.key}><DocumentStatusBadge status={purchaseRequestStatus(request.status)} /></td>;
      case "purchaseOrderCode":
        return <td key={field.key}>{request.purchaseOrderCode || "—"}</td>;
      case "actions":
        return <td key={field.key}><button className="row-action" onClick={(event) => { event.stopPropagation(); void openRequest(request.id); }}>İncele</button></td>;
      default:
        return <td key={field.key}>—</td>;
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
      case "code":
        return <span className="customer-code">{item.code}</span>;
      case "supplierName":
        return <b className="customer-name">{item.supplierName}</b>;
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
        return (
          <b>
            {item.grandTotal.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
            })}
          </b>
        );
      case "currencyCode":
        return item.currencyCode;
      case "status":
        return (
          <DocumentStatusBadge status={purchaseOrderStatus(item.status)} />
        );
      case "actions":
        return (
          <button
            className="row-action"
            onClick={() => void openOrder(item.id)}
          >
            Detay / Mal kabul
          </button>
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
    } catch (e) {
      setError((e as Error).message);
    }
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
    } catch (e) {
      setError((e as Error).message);
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
    const label = promptLocalized("Alan etiketi", field.label)?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(promptLocalized("En fazla karakter", String(field.maxLength)))
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const isRequired =
      role === "TenantAdmin"
        ? confirmLocalized("Bu alan zorunlu olsun mu?")
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
      !confirmLocalized(
        `${field.label} alanı devre dışı bırakılsın mı? Eski sipariş değerleri saklanır.`,
      )
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
      !confirmLocalized(
        `v${revision.version} alan tanımı yeni sürüm olarak geri yüklensin mi?`,
      )
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
    const label = promptLocalized("Alan etiketi", field.label)?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(promptLocalized("En fazla karakter", String(field.maxLength)))
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const required =
      role === "TenantAdmin"
        ? confirmLocalized("Bu alan zorunlu olsun mu?")
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
      !confirmLocalized(
        `${field.label} alanı devre dışı bırakılsın mı? Eski taleplerdeki değerler saklanır.`,
      )
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
      !confirmLocalized(
        `v${revision.version} alan tanımı yeni sürüm olarak geri yüklensin mi?`,
      )
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
      !confirmLocalized(
        `'${requestValueHistoryField.label}' alanı için bu kayıt öncesindeki değer geri yüklensin mi?`,
      )
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
  async function decideRequest(
    request: PurchaseRequestSummary | PurchaseRequestDetail,
    approved: boolean,
  ) {
    const note = approved
      ? promptLocalized("Onay notu (isteğe bağlı):")?.trim() || null
      : promptLocalized("Ret gerekçesi:")?.trim();
    if (!approved && !note) return;
    if (
      !confirmLocalized(
        approved ? "Bu talep onaylansın mı?" : "Bu talep reddedilsin mi?",
      )
    )
      return;
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
      setSupplierQuotes((current) =>
        [...current, quote].sort(
          (a, b) =>
            a.currencyCode.localeCompare(b.currencyCode) ||
            a.grandTotal - b.grandTotal,
        ),
      );
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
    const label = promptLocalized("Alan etiketi", field.label)?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(promptLocalized("En fazla karakter", String(field.maxLength)))
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const isRequired =
      role === "TenantAdmin"
        ? confirmLocalized("Bu alan zorunlu olsun mu?")
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
      !confirmLocalized(
        `${field.label} alanı devre dışı bırakılsın mı? Eski teklifler korunur.`,
      )
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
    const label = promptLocalized("Alan etiketi", field.label)?.trim();
    if (!label) return;
    const maxLength =
      field.dataType === "Text"
        ? Number(promptLocalized("En fazla karakter", String(field.maxLength)))
        : 0;
    if (
      field.dataType === "Text" &&
      (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500)
    )
      return;
    const isRequired =
      role === "TenantAdmin"
        ? confirmLocalized("Yeni mal kabullerde bu alan zorunlu olsun mu?")
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
      !confirmLocalized(
        `${field.label} alanı devre dışı bırakılsın mı? Geçmiş mal kabuller korunur.`,
      )
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
  async function loadPurchaseOrderUnits(itemId: string) {
    if (!itemId || purchaseOrderUnits[itemId]) return;
    try {
      const result = await api<{ conversions: StockItemUnitConversion[] }>(
        `/api/stock/items/${itemId}/units`,
        token,
      );
      setPurchaseOrderUnits((current) => ({
        ...current,
        [itemId]: result.conversions,
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function beginDirectOrder() {
    setError("");
    setPurchaseOrderUnits({});
    setLines([
      {
        stockItemId: "",
        quantity: "1",
        unitPrice: "0",
        discountPercent: "0",
        vatPercent: "20",
        unitCode: "",
      },
    ]);
    setEditor(true);
  }
  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    const supplier = customers.find((x) => x.id === supplierId);
    if (!supplier) {
      setError("Tedarikçi seçin.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
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
            customFields: orderFieldValues,
            lines: lines.map((x) => ({
              stockItemId: x.stockItemId,
              quantity: Number(x.quantity),
              unitPrice: Number(x.unitPrice),
              discountPercent: Number(x.discountPercent),
              vatPercent: Number(x.vatPercent),
              unitCode:
                x.unitCode ||
                stockItems.find((item) => item.id === x.stockItemId)?.unitCode,
            })),
          }),
        },
      );
      setEditor(false);
      setCode("");
      setNotes("");
      setExpectedReceiptDate("");
      setTargetWarehouseId("");
      setLines([
        {
          stockItemId: "",
          quantity: "1",
          unitPrice: "0",
          discountPercent: "0",
          vatPercent: "20",
          unitCode: "",
        },
      ]);
      setNotice(`${created.code} satın alma siparişi oluşturuldu.`);
      await load();
      await openOrder(created.id);
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
            lines: detail.lines
              .map((x) => {
                const receivedQuantity = Number(quantities[x.lineNumber] || 0);
                if (receivedQuantity <= 0) return null;
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
                  const input = promptLocalized(
                    `${x.stockCode} için seri numaralarını virgül veya yeni satırla girin (${baseQuantity} temel birim).`,
                  );
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
                  const trackingCode = promptLocalized(
                    `${x.stockCode} lot kodu:`,
                  );
                  if (trackingCode === null)
                    throw new Error("Mal kabul iptal edildi.");
                  const expiryDate = promptLocalized(
                    `${x.stockCode} son kullanma tarihi (YYYY-MM-DD):`,
                  );
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
                return {
                  orderLineNumber: x.lineNumber,
                  quantity: receivedQuantity,
                  unitCode,
                  tracking,
                  storageLocationId: receiptLocationIds[x.lineNumber] || null,
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null),
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
      !confirmLocalized(
        `${receipt.code} mal kabulini iptal edilsin mi? İptal stok bakiyesini negatife düşürmemelidir.`,
      )
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
  function updateLine(
    index: number,
    key: keyof (typeof lines)[number],
    value: string,
  ) {
    setLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  }
  const supplierOptions = customers.filter(
    (x) => x.isActive && (x.type === "Supplier" || x.type === "Both"),
  );
  const selectedOrderSummary =
    orders.find((item) => item.id === selectedOrderId) ?? orders[0] ?? null;
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const selectedRequestSummary =
    purchaseRequests.find((item) => item.id === selectedRequestId) ??
    purchaseRequests[0] ??
    null;
  return (
    <div
      className={`${
        requestsOnly ? "purchase-requests-page" : "purchase-orders-page"
      } list-v2`}
    >
      <div className="sales-lv2-stack">
        <ListPageHeader
          className="customer-heading"
          title={requestsOnly ? "Satınalma Talepleri" : "Satınalma Siparişleri"}
          description={
            requestsOnly
              ? "İhtiyaçları kaydedin, onayları ve tedarikçi tekliflerini takip edin."
              : "Tedarikçi siparişlerini, kısmi mal kabulleri ve depo stok girişlerini yönetin."
          }
          count={requestsOnly ? requestTotal : orderTotal}
        >
          {requestsOnly && (role === "TenantAdmin" || role === "TenantDeveloper") && (
            <button
              className="secondary"
              onClick={() => setRequestFieldSettingsOpen(true)}
            >
              <Settings size={14} /> Talep alanları
            </button>
          )}
          {requestsOnly && (
            <button className="primary" onClick={beginRequestCreate}>
              <Plus size={17} /> Talep oluştur
            </button>
          )}
          {!requestsOnly && (
            <button
              className="secondary"
              onClick={() => {
                beginRequestCreate();
              }}
            >
              Talep oluştur
            </button>
          )}
          {!requestsOnly && (
            <button className="primary" onClick={() => void beginDirectOrder()}>
              <Plus size={17} /> Yeni satın alma siparişi
            </button>
          )}
        </ListPageHeader>
        {requestsOnly ? (
          <ListToolbar
            search={requestSearch}
            onSearchChange={setRequestSearch}
            searchLabel="Satın alma taleplerinde ara"
            searchPlaceholder="Talep no, açıklama veya talep sahibi"
            onRefresh={() => void load()}
          >
            <ListChipGroup
              label="Talep durumuna göre filtrele"
              value={requestStatus}
              onChange={setRequestStatus}
              options={[
                { value: "", label: "Tümü" },
                { value: "Submitted", label: "Onay bekliyor" },
                { value: "Approved", label: "Onaylandı" },
                { value: "Ordered", label: "Siparişe dönüştü" },
                { value: "Rejected", label: "Reddedildi" },
              ]}
            />
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
          />
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
      {requestsOnly && (
        <>
          <section className="panel purchase-request-list-card list-v2-list" style={{ marginBottom: 16 }}>
          <div className="requests-list purchase-request-table-wrap">
            <AdvancedDataGrid
              className="purchase-request-table"
              gridId="purchase-requests"
              {...screenViewGridDefaults(visibleRequestScreenFields)}
              externalPagination
              hideSearch
              enableRowSelection={false}
            >
              <thead><tr>{visibleRequestScreenFields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead>
              <tbody>
                {purchaseRequests.map((request) => (
                  <tr key={request.id} className={selectedRequestSummary?.id === request.id ? "erp-selected-request" : ""} onClick={() => setSelectedRequestId(request.id)}>
                    {visibleRequestScreenFields.map((field) => renderPurchaseRequestCell(field, request))}
                  </tr>
                ))}
                {purchaseRequests.length === 0 && <tr><td colSpan={visibleRequestScreenFields.length} className="purchase-request-empty">{requestStatus === "Approved" ? "Onaylanmış satın alma talebi yok." : requestSearch.trim() || requestStatus ? "Filtrelerle eşleşen satın alma talebi yok." : "Henüz satın alma talebi yok."}</td></tr>}
              </tbody>
            </AdvancedDataGrid>
          </div>
          <ListPagination
            page={requestPage}
            total={requestTotal}
            pageSize={purchasePageSize}
            loading={loading}
            onPageChange={(next) => void load(next)}
          />
          {selectedRequestSummary && (
            <aside className="erp-record-pane purchase-request-selection sales-lv2-detail">
              <div className="list-v2-detail-head">
                <div>
                  <span className="list-v2-kind">SATIN ALMA · TALEP</span>
                  <h2>{selectedRequestSummary.code}</h2>
                </div>
                <div className="list-v2-detail-head-actions">
                  <button
                    className="secondary small-button"
                    onClick={() => void openRequest(selectedRequestSummary.id)}
                  >
                    Talebi aç
                  </button>
                </div>
              </div>
              <div className="list-v2-detail-meta">
                <span>{selectedRequestSummary.requestedByName}</span>
                <span
                  className={`list-v2-status${selectedRequestSummary.status === "Approved" || selectedRequestSummary.status === "Ordered" ? " is-active" : ""}`}
                >
                  <i />
                  {selectedRequestSummary.status === "Submitted"
                    ? "Onay bekliyor"
                    : selectedRequestSummary.status === "Approved"
                      ? "Onaylandı"
                      : selectedRequestSummary.status === "Ordered"
                        ? "Siparişe dönüştü"
                        : "Reddedildi"}
                </span>
              </div>
              <dl className="list-v2-facts">
                <div>
                  <dt>Talep tarihi</dt>
                  <dd>{selectedRequestSummary.requestDate}</dd>
                </div>
                <div>
                  <dt>İhtiyaç tarihi</dt>
                  <dd>{selectedRequestSummary.neededByDate || "—"}</dd>
                </div>
                <div>
                  <dt>Kalem</dt>
                  <dd>{selectedRequestSummary.lineCount}</dd>
                </div>
                <div>
                  <dt>Bağlı sipariş</dt>
                  <dd>{selectedRequestSummary.purchaseOrderCode || "—"}</dd>
                </div>
              </dl>
            </aside>
          )}
        </section>
        </>
      )}
      {requestFieldSettingsOpen && (role === "TenantAdmin" || role === "TenantDeveloper") && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy)
              setRequestFieldSettingsOpen(false);
          }}
        >
          <div className="modal request-field-modal">
            <section className="panel request-field-settings">
              <div className="panel-heading">
                <div>
                  <b>Talep alanları</b>
                  <small>
                    Tanımlar tenant kapsamındadır; yeni taleplerde doldurulur ve
                    sürüm geçmişi korunur.
                  </small>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Talep alanlarını kapat"
                  onClick={() => setRequestFieldSettingsOpen(false)}
                >
                  <X size={18} />
                </button>
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
            <div className="modal-foot">
              <span>
                Yeni talep alanları kaydedildiğinde yeni taleplerde
                kullanılabilir.
              </span>
              <button
                type="button"
                className="secondary"
                onClick={() => setRequestFieldSettingsOpen(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
      {!requestsOnly && (
        <section className="panel purchase-order-list-card list-v2-list" aria-label="Tedarikçi siparişi listesi">
      <div className="customer-table-wrap">
        <AdvancedDataGrid
          className="customer-table quote-table"
          gridId="purchase-orders"
          {...screenViewGridDefaults(visibleOrderScreenFields)}
          externalPagination
          hideSearch
          toolbarContainer={orderGridToolsSlot}
          enableRowSelection={false}
        >
          <thead>
            <ScreenViewGroupHeader fields={visibleOrderScreenFields} />
            <tr>
              {visibleOrderScreenFields.map((field) => (
                <th key={field.key}>{field.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={visibleOrderScreenFields.length}
                  className="table-empty"
                >
                  Satın alma siparişleri yükleniyor…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleOrderScreenFields.length}
                  className="table-empty"
                >
                  {orderSearch.trim()
                    ? "Aramanızla eşleşen tedarikçi siparişi yok."
                    : "Henüz satın alma siparişi yok."}
                </td>
              </tr>
            ) : (
              orders.map((item) => (
                <tr
                  key={item.id}
                  className={
                    selectedOrderSummary?.id === item.id
                      ? "erp-selected-row"
                      : ""
                  }
                  onClick={() => setSelectedOrderId(item.id)}
                  aria-selected={selectedOrderSummary?.id === item.id}
                >
                  {visibleOrderScreenFields.map((field) => (
                    <td key={field.key}>
                      {renderPurchaseOrderField(field, item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
        </section>
      )}
      {(role === "TenantAdmin" || role === "TenantDeveloper") && (
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
      )}
      {!requestsOnly && (role === "TenantAdmin" || role === "TenantDeveloper") && (
        <details className="panel purchase-settings-panel">
          <summary className="panel-heading">
            <div>
              <b>Sipariş alanları</b>
              <small>
                Talep dönüşümünde eşleşen kodlar aktarılır; alanlar tenant
                kapsamındadır.
              </small>
            </div>
          </summary>
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
        </details>
      )}
      {!requestsOnly && (role === "TenantAdmin" || role === "TenantDeveloper") && (
        <details className="panel purchase-settings-panel">
          <summary className="panel-heading">
            <div>
              <b>Mal kabul alanlar&#305;</b>
              <small>
                De&#287;erler stok giri&#351;iyle birlikte kaydedilir ve
                sonradan de&#287;i&#351;tirilemez.
              </small>
            </div>
          </summary>
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
        </details>
      )}

      {!requestsOnly && selectedOrderSummary && (
        <aside className="erp-record-pane sales-selected-record sales-lv2-detail">
          <div className="list-v2-detail-head">
            <div>
              <span className="list-v2-kind">SATIN ALMA · SİPARİŞ</span>
              <h2>{selectedOrderSummary.supplierName}</h2>
            </div>
            <div className="list-v2-detail-head-actions">
              <button
                className="secondary small-button"
                onClick={() => void openOrder(selectedOrderSummary.id)}
              >
                Siparişi aç
              </button>
            </div>
          </div>
          <div className="list-v2-detail-meta">
            <span className="list-v2-detail-code">{selectedOrderSummary.code}</span>
            <span>{selectedOrderSummary.status}</span>
          </div>
          <dl className="list-v2-facts">
            <div>
              <dt>Sipariş tarihi</dt>
              <dd>{selectedOrderSummary.orderDate}</dd>
            </div>
            <div>
              <dt>Beklenen teslim</dt>
              <dd>{selectedOrderSummary.expectedReceiptDate || "—"}</dd>
            </div>
            <div>
              <dt>Satır</dt>
              <dd>{selectedOrderSummary.lineCount}</dd>
            </div>
            <div>
              <dt>Toplam</dt>
              <dd>
                {selectedOrderSummary.grandTotal.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                })}{" "}
                {selectedOrderSummary.currencyCode}
              </dd>
            </div>
          </dl>
        </aside>
      )}
      {!requestsOnly && (
        <ListPagination
          page={orderPage}
          total={orderTotal}
          pageSize={purchasePageSize}
          loading={loading}
          onPageChange={(next) => void load(requestPage, next)}
        />
      )}
      <div className="boundary-note">
        <ShieldCheck size={17} />
        <span>
          <b>Tedarikçi borcu</b>Mal kabulden alış faturası oluşturun; fatura
          tedarikçi vadesini ve cari borcu yazar. Kısmi ödemeler borçtan düşer;
          iptaller ters kayıtla korunur.
        </span>
      </div>
      {editor && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditor(false);
          }}
        >
          <div className="modal quote-modal sales-rf-host">
            <RecordFormPage
              variant="dialog"
              className="sales-rf"
              title="Yeni satın alma siparişi"
              mode="create"
              busy={busy}
              saveLabel="Sipariş oluştur"
              onSubmit={createOrder}
              onCancel={() => setEditor(false)}
              error={error}
              onDismissError={() => setError("")}
              status={
                <>
                  <span>
                    Miktar ve fiyat seçilen birim içindir; sipariş stok kartının
                    temel biriminde saklanır.
                  </span>
                  <span className="rf-status-end">Satır: <b>{lines.length}</b></span>
                </>
              }
            >
              <RecordFormGroup title="Sipariş Kimliği" bodyClassName="rf-identity sales-rf-identity-3">
                <label>
                  <span>Sipariş no <RequiredMark /></span>
                  <input
                    className="rf-must rf-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={40}
                    placeholder="SA-2026-0001"
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
                <span>Sipariş tarihi <RequiredMark /></span>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  required
                />
              </label>
              </RecordFormGroup>
              <RecordFormGroup title="Teslimat" bodyClassName="rf-pair">
                <label>
                  <span>
                    Beklenen teslim tarihi{" "}
                    <span className="optional-label">İsteğe bağlı</span>
                  </span>
                  <input
                    type="date"
                    min={orderDate}
                    value={expectedReceiptDate}
                    onChange={(e) => setExpectedReceiptDate(e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    Hedef depo{" "}
                    <span className="optional-label">İsteğe bağlı</span>
                  </span>
                  <SearchableRecordPicker
                    options={warehouses
                      .filter((x) => x.isActive)
                      .map((x) => ({
                        id: x.id,
                        label: `${x.code} · ${x.name}`,
                      }))}
                    selectedId={targetWarehouseId}
                    onSelect={setTargetWarehouseId}
                    title="Hedef depo seçin"
                    placeholder="Belirtilmedi"
                    searchPlaceholder="Depo kodu veya adıyla ara"
                    emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
                  />
                </label>
              </RecordFormGroup>
              <RecordFormGroup title="Sipariş Satırları">
              <div className="quote-lines-heading sales-rf-group-actions">
                <span className="muted">Her satır için stok, miktar, birim ve fiyat girin.</span>
                <button
                  type="button"
                  className="secondary small-button"
                  data-line-add-shortcut
                  title="Ctrl+Shift+Enter ile satır ekle"
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      {
                        stockItemId: "",
                        quantity: "1",
                        unitPrice: "0",
                        discountPercent: "0",
                        vatPercent: "20",
                        unitCode: "",
                      },
                    ])
                  }
                >
                  <Plus size={14} /> Satır ekle
                </button>
              </div>
              {lines.map((line, index) => (
                <div className="quote-line" key={index}>
                  <div className="quote-line-title">
                    <b>Satır {index + 1}</b>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="row-action"
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                  <label>
                    Stok kartı
                    <AsyncStockItemPicker
                      token={token}
                      selectedId={line.stockItemId}
                      initialItems={stockItems}
                      onSelect={(item) => {
                        void loadPurchaseOrderUnits(item.id);
                        updateLine(index, "stockItemId", item.id);
                        updateLine(index, "unitCode", item.unitCode || "");
                      }}
                    />
                  </label>
                  <div className="form-two order-line-pricing">
                    <label>
                      Miktar
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, "quantity", e.target.value)
                        }
                        required
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
                          updateLine(index, "unitCode", e.target.value)
                        }
                        required
                      >
                        <option
                          value={
                            stockItems.find((x) => x.id === line.stockItemId)
                              ?.unitCode || ""
                          }
                        >
                          {stockItems.find((x) => x.id === line.stockItemId)
                            ?.unitCode || "Temel birim"}
                        </option>
                        {(purchaseOrderUnits[line.stockItemId] || [])
                          .filter((x) => x.isActive)
                          .map((unit) => (
                            <option key={unit.id} value={unit.unitCode}>
                              {unit.unitCode} (×{unit.factorToBase})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Birim fiyat
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateLine(index, "unitPrice", e.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                  <div className="form-two order-line-tax">
                    <label>
                      İskonto %
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.discountPercent}
                        onChange={(e) =>
                          updateLine(index, "discountPercent", e.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      KDV %
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.vatPercent}
                        onChange={(e) =>
                          updateLine(index, "vatPercent", e.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                </div>
              ))}
              </RecordFormGroup>
              {orderFieldDefinitions.length > 0 && (
                <RecordFormGroup title="Sipariş Özel Alanları">
                  <div className="rf-custom-grid">
                    {orderFieldDefinitions.map((field) => (
                      <label key={field.id}>
                        {field.label}
                        {field.isRequired ? " *" : ""}
                        <small>{field.code}</small>
                        {field.dataType === "Boolean" ? (
                          <select
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
                </RecordFormGroup>
              )}
              <RecordFormGroup title="Sipariş Notu">
              <label>
                <span>
                  Sipariş notu{" "}
                  <span className="optional-label">İsteğe bağlı</span>
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  rows={3}
                />
              </label>
              </RecordFormGroup>
            </RecordFormPage>
          </div>
        </div>
      )}
      {detail && (
          <DocumentSurface
            title="Satınalma siparişi"
            code={detail.code}
            subtitle={detail.supplierName}
            status={purchaseOrderStatus(detail.status)}
            onClose={() => setDetail(null)}
            bodyClassName="modal ledger-modal"
          >
            <div className="balance-banner">
              <div>
                <small>Genel toplam · {detail.currencyCode}</small>
                <b>
                  {detail.grandTotal.toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  {detail.currencyCode}
                </b>
                <span>
                  Sipariş {detail.orderDate.split("-").reverse().join(".")} ·
                  Tedarikçi para birimi
                </span>
              </div>
              <span className="ledger-currency">
                {detail.status === "Open"
                  ? "Açık"
                  : detail.status === "PartiallyReceived"
                    ? "Kısmi mal kabul"
                    : detail.status === "Received"
                      ? "Tam alındı"
                      : "İptal"}
              </span>
            </div>
            <div className="ledger-list invoice-lines-wrap">
              <table className="customer-table quote-detail-table">
                <thead>
                  <tr>
                    <th>Stok</th>
                    <th>Sipariş</th>
                    <th>Alınan</th>
                    <th>Kalan</th>
                    <th>Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
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
                        {line.receivedQuantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td>
                        {line.remainingQuantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td>
                        {line.lineTotal.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.notes && <p className="quote-notes">{detail.notes}</p>}
            {detail.customFields.length > 0 && (
              <form
                onSubmit={saveOrderCustomFields}
                className="panel"
                style={{ marginTop: 14 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>Sipariş özel alanları</b>
                    <small>
                      {detail.status === "Open" ||
                      detail.status === "PartiallyReceived"
                        ? "Açık siparişte düzenlenebilir."
                        : "Sipariş kapalı."}
                    </small>
                  </div>
                </div>
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
            )}
            <div className="list-toolbar">
              <div>
                <h2>Mal kabuller</h2>
                <p>Her kayıt seçilen depoya stok girişi yapar.</p>
              </div>
              {detail.status !== "Received" &&
                detail.status !== "Cancelled" && (
                  <button
                    className="primary"
                    onClick={() => {
                      const targetWarehouseId =
                        warehouses.find((x) => x.isActive)?.id || "";
                      setWarehouseId(targetWarehouseId);
                      setReceiptLocationIds({});
                      void loadReceiptLocations(targetWarehouseId);
                      setReceiptFieldValues(
                        Object.fromEntries(
                          receiptFieldDefinitions.map((field) => [
                            field.code,
                            detail.customFields.find(
                              (source) =>
                                source.code.toLowerCase() ===
                                field.code.toLowerCase(),
                            )?.value || "",
                          ]),
                        ),
                      );
                      setReceiptEditor(true);
                    }}
                  >
                    <Plus size={16} /> Mal kabul ekle
                  </button>
                )}
            </div>
            <div className="ledger-list">
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
            </div>
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
            <div className="modal-foot">
              <span>Alış faturası vade gününü tedarikçi kartından alır.</span>
              <button className="secondary" onClick={() => setDetail(null)}>
                Kapat
              </button>
            </div>
          </DocumentSurface>
          )}
      {requestEditor && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setRequestEditor(false);
          }}
        >
          <div className="modal quote-modal sales-rf-host">
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
                              ?.unitCode || ""
                          }
                        >
                          {stockItems.find((x) => x.id === line.stockItemId)
                            ?.unitCode || "Temel birim"}
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
            title="Satınalma talebi"
            code={requestDetail.code}
            subtitle={requestDetail.requestedByName}
            status={purchaseRequestStatus(requestDetail.status)}
            onClose={() => setRequestDetail(null)}
            bodyClassName="modal ledger-modal"
          >
            <div className="balance-banner">
              <div>
                <small>
                  {requestDetail.requestDate.split("-").reverse().join(".")} ·{" "}
                  {requestDetail.neededByDate
                    ? `İhtiyaç ${requestDetail.neededByDate.split("-").reverse().join(".")}`
                    : "İhtiyaç tarihi belirtilmedi"}
                </small>
                <b>{requestDetail.description}</b>
                <span>
                  {requestDetail.status === "Submitted"
                    ? "Onay bekliyor"
                    : requestDetail.status === "Approved"
                      ? "Onaylandı"
                      : requestDetail.status === "Ordered"
                        ? "Siparişe dönüştü"
                        : "Reddedildi"}
                  {requestDetail.reviewedByName
                    ? ` · ${requestDetail.reviewedByName}`
                    : ""}
                </span>
              </div>
            </div>
            <div className="ledger-list">
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Stok kodu</th>
                    <th>Stok adı</th>
                    <th>Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {requestDetail.lines.map((line) => (
                    <tr key={line.lineNumber}>
                      <td>
                        <span className="customer-code">{line.stockCode}</span>
                      </td>
                      <td>{line.stockName}</td>
                      <td>
                        {line.quantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {line.unitCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {requestDetail.customFields &&
              requestDetail.customFields.length > 0 && (
                <section
                  className="panel"
                  style={{ margin: "18px 0", padding: 16 }}
                >
                  <div className="panel-heading">
                    <div>
                      <b>Talep özel alanları</b>
                      <small>Bu değerler satın alma talebiyle saklanır.</small>
                    </div>
                  </div>
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
                    <section className="panel" style={{ marginTop: 14 }}>
                      <div className="panel-heading">
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
                    </section>
                  )}
                </section>
              )}
            {requestDetail.reviewNote && (
              <p className="quote-notes">
                Karar notu: {requestDetail.reviewNote}
              </p>
            )}
            {(supplierQuotes.length > 0 ||
              requestDetail.status === "Approved") && (
              <section
                className="panel"
                style={{ margin: "18px 0", padding: 16 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>Tedarikçi teklifleri · {supplierQuotes.length}</b>
                    <small>
                      Tutarlar teklif tarihindeki kurla tenant baz para birimine
                      çevrilir; kur yoksa kıyaslanamaz.
                    </small>
                  </div>
                  {role === "TenantAdmin" &&
                    requestDetail.status === "Approved" &&
                    !quoteEditor && (
                      <button
                        className="secondary small-button"
                        disabled={busy}
                        onClick={() => beginQuoteCapture(requestDetail)}
                      >
                        <Plus size={14} /> Teklif kaydet
                      </button>
                    )}
                </div>
                {supplierQuotes.length > 0 ? (
                  <div className="requests-list">
                    {supplierQuotes.map((quote) => (
                      <article className="request-row" key={quote.id}>
                        <div className="request-info">
                          <b>
                            {quote.supplierName} · {quote.code}
                          </b>
                          <small>
                            {quote.quoteDate.split("-").reverse().join(".")} ·{" "}
                            {quote.validUntil
                              ? `Son geçerlilik ${quote.validUntil.split("-").reverse().join(".")}`
                              : "Geçerlilik tarihi yok"}{" "}
                            ·{" "}
                            {quote.grandTotal.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                            })}{" "}
                            {quote.currencyCode}
                            <br />
                            {quote.comparableGrandTotal === null
                              ? "Baz para birimine çevrilemedi"
                              : `Kıyas: ${quote.comparableGrandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${quote.baseCurrencyCode}${quote.appliedRateDate ? ` · ${quote.appliedRateDate.split("-").reverse().join(".")}` : ""}`}
                          </small>
                          <details>
                            <summary>Kalem fiyatlarını incele</summary>
                            <div className="ledger-list">
                              <table className="customer-table">
                                <thead>
                                  <tr>
                                    <th>Kalem</th>
                                    <th>Miktar</th>
                                    <th>Birim fiyat</th>
                                    <th>KDV</th>
                                    <th>Toplam</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {quote.lines.map((line) => (
                                    <tr key={line.requestLineNumber}>
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
                                        {line.unitPrice.toLocaleString(
                                          "tr-TR",
                                          {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4,
                                          },
                                        )}
                                      </td>
                                      <td>{line.vatPercent}%</td>
                                      <td>
                                        {line.lineTotal.toLocaleString(
                                          "tr-TR",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                          {quote.customFields.filter((field) => field.value)
                            .length > 0 && (
                            <p className="quote-notes">
                              {quote.customFields
                                .filter((field) => field.value)
                                .map(
                                  (field) => `${field.label}: ${field.value}`,
                                )
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <span
                          className={`quote-status ${quote.status === "Selected" ? "accepted" : quote.status === "NotSelected" ? "rejected" : "sent"}`}
                        >
                          {quote.status === "Selected"
                            ? "Seçildi"
                            : quote.status === "NotSelected"
                              ? "Seçilmedi"
                              : quote.validUntil && quote.validUntil < today
                                ? "Süresi doldu"
                                : "Değerlendiriliyor"}
                        </span>
                        {role === "TenantAdmin" &&
                          requestDetail.status === "Approved" &&
                          quote.status === "Submitted" &&
                          (!quote.validUntil || quote.validUntil >= today) && (
                            <button
                              className="row-action"
                              disabled={busy}
                              onClick={() =>
                                beginOrderConversion(requestDetail, quote)
                              }
                            >
                              Bu teklifle sipariş
                            </button>
                          )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-small">
                    Henüz tedarikçi teklifi kaydedilmedi.
                  </div>
                )}
                {quoteEditor && (
                  <form onSubmit={createSupplierQuote}>
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
                    <div className="ledger-list">
                      <table className="customer-table">
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
              </section>
            )}
            {requestDetail.status === "Ordered" &&
              requestDetail.purchaseOrderCode && (
                <p className="notice">
                  Bu talep <b>{requestDetail.purchaseOrderCode}</b> siparişine
                  dönüştürüldü.
                </p>
              )}
            {role === "TenantAdmin" &&
              requestDetail.status === "Approved" &&
              !requestDetail.purchaseOrderId && (
                <div
                  className="panel"
                  style={{ margin: "18px 0", padding: 16 }}
                >
                  <div className="panel-heading">
                    <div>
                      <b>Talebi siparişe dönüştür</b>
                      <small>
                        Tedarikçi seçin ve talep miktarları için birim fiyatları
                        girin.
                      </small>
                    </div>
                    {!orderConversion && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => beginOrderConversion(requestDetail)}
                      >
                        Sipariş oluştur
                      </button>
                    )}
                  </div>
                  {orderConversion && (
                    <form onSubmit={convertPurchaseRequest}>
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
                      <div className="ledger-list">
                        <table className="customer-table">
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
                </div>
              )}
            <div className="modal-foot">
              <span>
                Onay, sipariş ve finans kaydı birbirinden ayrı adımlardır.
              </span>
              <div>
                {role === "TenantAdmin" &&
                  requestDetail.status === "Submitted" &&
                  requestDetail.requestedByUserId === currentUserId && (
                    <span className="cell-subtitle">
                      Kendi talebinizi onaylayamaz veya reddedemezsiniz; kararı başka bir yetkili verir.
                    </span>
                  )}
                {role === "TenantAdmin" &&
                  requestDetail.status === "Submitted" &&
                  requestDetail.requestedByUserId !== currentUserId && (
                    <>
                      <button
                        className="secondary danger-action"
                        disabled={busy}
                        onClick={() =>
                          void decideRequest(requestDetail, false)
                        }
                      >
                        Reddet
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void decideRequest(requestDetail, true)}
                      >
                        Onayla
                      </button>
                    </>
                  )}
                <button
                  className="secondary"
                  onClick={() => setRequestDetail(null)}
                >
                  Kapat
                </button>
              </div>
            </div>
          </DocumentSurface>
          )}
      {invoiceReceiptId && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setInvoiceReceiptId(null);
          }}
        >
          <div className="modal sales-rf-host sales-rf-host--narrow">
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
}: {
  order: SalesOrderDetail;
  token: string;
  role: string;
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onInvoiceCreated: (id: string) => void;
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
    const reason = promptLocalized("Rezervasyonu bırakma gerekçesi:")?.trim();
    if (!reason) return;
    if (!confirmLocalized("Siparişin kalan stok rezervasyonu bırakılsın mı?"))
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
      !confirmLocalized(
        `${item.code} irsaliyesi iptal edilsin mi? Stok hareketi ters kaydedilecek.`,
      )
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
  return (
    <DocumentSurface
      title="Satış siparişi"
      code={order.code}
      subtitle={order.customerName}
      status={salesOrderStatus(order.status)}
      onClose={onClose}
      className="sales-order-detail-backdrop"
      bodyClassName="modal ledger-modal sales-detail-modal sales-quote-detail-modal"
    >
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
        <nav className="sales-quote-detail-tabs" role="tablist" aria-label="Sipariş detay bölümleri">
          {([ ["information", "Sipariş Bilgileri"], ["deliveries", "İrsaliye Geçmişi"] ] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={detailTab === key} className={detailTab === key ? "active" : ""} onClick={() => setDetailTab(key)}>{label}{key === "deliveries" && <span>{deliveries.length}</span>}</button>
          ))}
        </nav>
        <div className="sales-detail-content">
        {detailTab === "information" && <>
        <h3 className="sales-quote-section-title">Sipariş Üst Bilgileri</h3>
        <section className="sales-quote-overview-grid">
          <article><small>Müşteri</small><b>{order.customerName}</b></article>
          <article><small>Durum</small><b><span className={`quote-status ${order.status === "Fulfilled" ? "accepted" : order.status === "Cancelled" ? "rejected" : "sent"}`}>{order.status === "Fulfilled" ? "Tamamlandı" : order.status === "Cancelled" ? "İptal" : "Açık"}</span></b></article>
          <article><small>İstenen teslim tarihi</small><b>{order.requestedDeliveryDate || "—"}</b></article>
          <article><small>Para birimi</small><b>{order.currencyCode}</b></article>
        </section>
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
        <div className="sales-order-lines-heading">
          <h3 className="sales-quote-section-title">Sipariş Satırları</h3>
          {order.status === "Open" && !activeReservation && (
            <button className="secondary small-button" type="button" onClick={() => {
              setReservationWarehouseId(warehouses.find((warehouse) => warehouse.isActive)?.id || "");
              setReservationRequestId(crypto.randomUUID());
              setReservationEditor(true);
            }}>
              Stok ayır
            </button>
          )}
        </div>
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
        <div className="ledger-list sales-quote-lines">
          <AdvancedDataGrid className="customer-table quote-detail-table" gridId="sales-order-lines" {...screenViewGridDefaults(visibleOrderLineFields)} enableRowSelection={false}>
            <thead>
              <ScreenViewGroupHeader fields={visibleOrderLineFields} />
              <tr>
                {visibleOrderLineFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.lineNumber}>
                  {visibleOrderLineFields.map((field) => (
                    <td key={field.key}>
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
        <h3 className="sales-quote-section-title sales-quote-totals-title">Toplamlar</h3>
        <section className="sales-quote-totals-panel">
          <div><span>Ara toplam</span><b>{order.subtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currencyCode}</b></div>
          <div><span>Toplam iskonto</span><b>{order.discountTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currencyCode}</b></div>
          <div><span>Toplam KDV</span><b>{order.taxTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {order.currencyCode}</b></div>
          <div className="grand-total"><span>Genel toplam</span><b>{order.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currencyCode}</b></div>
        </section>
        </>}
        {detailTab === "deliveries" && <>
        <div className="delivery-history-head">
          <b>İrsaliyeler</b>
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
        </div>
        {editor && (
          <RecordFormPage
            variant="dialog"
            className="sales-rf sales-rf-embedded"
            title="Satış irsaliyesi"
            mode="create"
            busy={busy}
            saveLabel="İrsaliye oluştur"
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
        </>}
        </div>
      </DocumentSurface>
  );
}

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
}: {
  invoices: SalesInvoiceSummary[];
  orders: SalesOrderSummary[];
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
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
      !confirmLocalized(
        `${item.code} faturası iptal edilecek ve cari hareketi ters kayıtla kapatılacak. Devam edilsin mi?`,
      )
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
      !confirmLocalized(
        `${item.code} faturası silinecek. Yalnızca iptal edilmiş faturalar silinebilir. Devam edilsin mi?`,
      )
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
  const visible = invoices.filter(
    (x) =>
      !search ||
      `${x.code} ${x.deliveryCode} ${x.orderCode} ${x.customerName} ${x.customerTaxNumber ?? ""}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const ordered = fields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
  const render = (
    item: SalesInvoiceSummary,
    field: BuiltInScreenLayoutField,
  ) => {
    switch (field.key) {
      case "code":
        return <span className="customer-code">{item.code}</span>;
      case "deliveryCode":
        return item.deliveryCode || "—";
      case "orderCode":
        return item.orderCode || "—";
      case "customerName":
        return <b className="customer-name">{item.customerName}</b>;
      case "customerTaxNumber":
        return item.customerTaxNumber || "—";
      case "invoiceDate":
        return item.invoiceDate.split("-").reverse().join(".");
      case "lineCount":
        return item.lineCount;
      case "grandTotal":
        return (
          <b>
            {item.grandTotal.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {item.currencyCode}
          </b>
        );
      case "status":
        return (
          <DocumentStatusBadge status={salesInvoiceStatus(item.status)} />
        );
      case "actions":
        return (
          <SalesRowActionsMenu label={item.code}>
            <button role="menuitem" className="sales-row-menu-item" onClick={() => onOpen(item.id)}>Detay</button>
            {role === "TenantAdmin" && item.status === "Posted" && (
              <button
                type="button"
                role="menuitem"
                className="sales-row-menu-item danger-action"
                disabled={busy}
                onClick={() => void voidInvoice(item)}
              >
                İptal et
              </button>
            )}
            {role === "TenantAdmin" && (
              <button
                type="button"
                role="menuitem"
                className="sales-row-menu-item danger-action"
                disabled={busy}
                onClick={() => void deleteInvoice(item)}
              >
                Sil
              </button>
            )}
          </SalesRowActionsMenu>
        );
      default:
        if (field.key.startsWith("custom:")) return item.listCustomFields?.[field.key] || "—";
        return null;
    }
  };
  return (
    <>
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
      {!entryPage && <section
        className="sales-invoice-list-card list-v2-list"
        aria-label="Satış faturası listesi"
      >
        <SalesDocumentGrid
          gridId="sales-invoices"
          fields={ordered}
          items={visible}
          selectedId={selectedId}
          loading={false}
          loadingMessage="Faturalar yükleniyor…"
          emptyMessage="Henüz satış faturası yok. Yeni fatura oluştururken sipariş ve irsaliye kaydı otomatik oluşturulur."
          search={search}
          searchEmptyMessage="Aramanızla eşleşen fatura yok."
          toolbarContainer={toolbarContainer}
          onSelect={(id) => {
            onSelect(id);
            onOpen(id);
          }}
          renderCell={(field, item) => render(item, field)}
        />
      </section>}
      {createOpen && (
        <SalesInvoiceFromDeliveryDialog
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
