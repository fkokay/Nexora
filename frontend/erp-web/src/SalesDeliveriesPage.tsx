import { useEffect, useRef, useState } from "react";
import type * as AppTypes from "./erp-types";
import { api, localDateString } from "./erpApi";
import { dropPageParam, usePageParams } from "./pageNavigation";
import {
  FilePlus2,
  X,
} from "lucide-react";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot, documentOpenCommands } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { StandaloneFulfillmentPanel } from "./StandaloneFulfillmentPanel";
import { SalesInvoiceModal } from "./SalesInvoiceModal";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { CircleSlash, FileWarning } from "lucide-react";
import { useSalesListPanel } from "./sales/useSalesListPanel";
import { SalesListPanelToggle } from "./sales/components/SalesListDetailPanel";
import { SalesListFooter } from "./sales/components/SalesListFooter";
import { DeliveryListPanel, SalesListPanelEmpty } from "./sales/components/SalesListPanels";
import { DELIVERY_LIST_WIDTHS, SALES_CODE_FIELDS, SALES_NUMBER_FIELDS, listTag } from "./sales/components/salesListCells";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import "./sales/sales-list-v2.css";
import { confirmDialog } from "./confirmDialog";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./sales/sales-record-forms.css";
import { DocumentSurface } from "./document-page/DocumentSurface";
import { salesDeliveryStatus, salesInvoiceStatus } from "./document-page/documentStatus";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailLinesFooter,
  DetailLinesHead,
  DetailSection,
  DetailTabs,
  formatDate,
  formatQuantity,
  type DocumentTotalRow,
} from "./document-detail/DocumentDetailLayout";
import { SALES_DETAIL_HINTS, SalesDeliveryFlow, SalesFooterStatus, SalesLinesMeta } from "./sales/salesDocumentDetail";
import {
  formatMoneyWithCurrency,
  invoiceLineOverridden,
  invoicePriceFields,
  invoicePriceLine,
  lineAmounts,
  listPriceSuggestion,
  priceDraftFrom,
  missingInvoiceAmounts,
  type DeliveryHeaderPricing,
  type DeliveryLinePricing,
  type InvoicePriceLine,
} from "./delivery-pricing/deliveryPricing";
import { FreeTag, InvoiceAmountsAlert, InvoicePriceCells, PriceHeadCells, PriceReadCells, PricingStateTag } from "./delivery-pricing/DeliveryPricingCells";
type BuiltInScreenLayoutField = AppTypes.BuiltInScreenLayoutField;
type SalesCustomer = AppTypes.SalesCustomer;
type SalesDeliverySummary = AppTypes.SalesDeliverySummary;
type SalesInvoiceCustomFieldDefinition =
  AppTypes.SalesInvoiceCustomFieldDefinition;
type StockItem = AppTypes.StockItem;
type Warehouse = AppTypes.Warehouse;

/** A saved line with its amounts: the server's, else computed (servers before taslak 20 send none). */
function withLineAmounts(line: DeliveryLinePricing & { quantity: number; enteredQuantity?: number | null }): DeliveryLinePricing {
  if (line.lineNetAmount !== undefined || line.isFreeOfCharge) return line;
  const amounts = lineAmounts(line.enteredQuantity ?? line.quantity, priceDraftFrom(line));
  return { ...line, lineNetAmount: amounts?.net ?? null, lineVatAmount: amounts?.vat ?? null, lineTotal: amounts?.total ?? null };
}

export function SalesDeliveriesScreen({
  token,
  role,
  warehouses,
  customers,
  stockItems,
  initialCreate = false,
  initialCustomerId = "",
}: {
  token: string;
  role: string;
  warehouses: Warehouse[];
  customers: SalesCustomer[];
  stockItems: StockItem[];
  initialCreate?: boolean;
  initialCustomerId?: string;
}) {
  const [items, setItems] = useState<SalesDeliverySummary[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(initialCreate);
  const [customerActionId, setCustomerActionId] = useState(initialCustomerId);
  useEffect(() => {
    if (initialCreate) setCreating(true);
  }, [initialCreate]);
  useEffect(() => {
    if (initialCustomerId) setCustomerActionId(initialCustomerId);
  }, [initialCustomerId]);
  useEffect(() => {
    const receiveCustomerAction = (event: Event) => {
      const action = (event as CustomEvent<{ page: string; customerId: string }>).detail;
      if (action?.page !== "sales-delivery-create") return;
      setCreating(true);
      setCustomerActionId(action.customerId);
    };
    window.addEventListener("nexora:customer-sales-action", receiveCustomerAction);
    return () => window.removeEventListener("nexora:customer-sales-action", receiveCustomerAction);
  }, []);
  const [detailTab, setDetailTab] = useState<"information" | "invoice">("information");
  const [screenFields, setScreenFields] = useState<BuiltInScreenLayoutField[]>([
    { key: "code", label: "İrsaliye no", visible: true, position: 0 },
    { key: "orderCode", label: "Sipariş no", visible: true, position: 1 },
    { key: "deliveryDate", label: "Sevk tarihi", visible: true, position: 2 },
    { key: "warehouseName", label: "Depo", visible: true, position: 3 },
    { key: "lineCount", label: "Satır", visible: true, position: 4 },
    { key: "pricedGrandTotal", label: "Tutar", visible: true, position: 5 },
    { key: "status", label: "Durum", visible: true, position: 6 },
    { key: "invoiceStatus", label: "Fatura", visible: true, position: 7 },
  ]);
  const [detail, setDetail] = useState<{
    id: string;
    code: string;
    orderId: string | null;
    orderCode: string | null;
    warehouseName: string;
    deliveryDate: string;
    status: "Posted" | "Voided";
    lines: ({
      orderLineNumber: number;
      stockItemId: string;
      stockCode: string;
      stockName: string;
      unitCode: string;
      quantity: number;
      enteredQuantity?: number | null;
      enteredUnitCode?: string | null;
      unitPrice: number | null;
      discountPercent: number | null;
      vatPercent: number | null;
      currencyCode: string | null;
    } & DeliveryLinePricing)[];
    hasSalesInvoice: boolean;
    invoiceStatus: "Posted" | "Voided" | null;
    invoiceId: string | null;
  } & DeliveryHeaderPricing | null>(null);
  const [invoiceEditing, setInvoiceEditing] = useState(false),
    [invoiceCustomerId, setInvoiceCustomerId] = useState(""),
    [invoiceDate, setInvoiceDate] = useState(localDateString());
  // Taslak 20: invoice lines prefilled from the delivery prices; free / unpriced lines need an amount.
  const [invoiceLines, setInvoiceLines] = useState<
    ({ orderLineNumber: number } & InvoicePriceLine)[]
  >([]);
  const [invoiceCustomFields, setInvoiceCustomFields] = useState<
      SalesInvoiceCustomFieldDefinition[]
    >([]),
    [invoiceCustomFieldValues, setInvoiceCustomFieldValues] = useState<
      Record<string, string>
    >({});
  const [invoiceId, setInvoiceId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!detail) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detail]);
  const pageSize = 25;
  // Arama sunucuda yapılır; yalnızca açık sayfa değil tüm irsaliyeler taranır.
  const [filter, setFilter] = useState("");
  // Existing server filter of the list endpoint (shipped, not yet invoiced).
  const [unbilledOnly, setUnbilledOnly] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<{
        items: SalesDeliverySummary[];
        totalCount: number;
      }>(`/api/sales/deliveries/?page=${page}&pageSize=${pageSize}${filter ? `&q=${encodeURIComponent(filter)}` : ""}${unbilledOnly ? "&unbilledOnly=true" : ""}`, token);
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
  }, [token, page, filter, unbilledOnly]);
  useEffect(() => {
    let active = true;
    void api<SalesInvoiceCustomFieldDefinition[]>(
      "/api/sales/invoices/custom-fields",
      token,
    )
      .then((fields) => {
        if (active) setInvoiceCustomFields(fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/sales-deliveries/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setScreenFields((defaults) => {
            const saved = view.fields.map((field, index) => ({
              ...field,
              position: field.position ?? index,
            }));
            // Columns added after the layout was saved (e.g. Tutar) are kept, at the end.
            const missing = defaults
              .filter((field) => !saved.some((item) => item.key === field.key))
              .map((field, index) => ({ ...field, position: saved.length + index }));
            return [...saved, ...missing];
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  // The bar (Faturalaştır, Faturayı aç, İptal et, Sil) and the detail panel cover the former row menu: no "⋯".
  const visibleFields = screenFields
    .filter((field) => field.visible && field.key !== "actions")
    .sort((a, b) => a.position - b.position);
  const deliveryTotals = (detail?.lines ?? []).reduce((totals, line) => {
    // Taslak 20: a line price is per entered unit; the server's line amounts are used when it sends them.
    const gross = (line.enteredQuantity ?? line.quantity) * (line.unitPrice ?? 0);
    const taxable = line.lineNetAmount ?? gross - gross * (line.discountPercent ?? 0) / 100;
    const discount = gross - taxable;
    const rate = line.vatPercent ?? 0;
    const vat = line.lineVatAmount ?? taxable * rate / 100;
    return {
      subtotal: totals.subtotal + gross,
      discount: totals.discount + discount,
      vat: totals.vat + vat,
      total: totals.total + taxable + vat,
      taxableByRate: { ...totals.taxableByRate, [rate]: (totals.taxableByRate[rate] ?? 0) + taxable },
      vatByRate: { ...totals.vatByRate, [rate]: (totals.vatByRate[rate] ?? 0) + vat },
    };
  }, { subtotal: 0, discount: 0, vat: 0, total: 0, taxableByRate: {} as Record<number, number>, vatByRate: {} as Record<number, number> });
  const deliveryCurrency = detail?.currencyCode ?? detail?.lines.find((line) => line.currencyCode)?.currencyCode ?? "TRY";
  const priced = !!detail?.lines.some((line) => line.unitPrice !== null);
  // Price columns also show when every line is Bedelsiz (no priced line).
  const showPrices = priced || !!detail?.lines.some((line) => line.isFreeOfCharge);
  const deliveryMoney = (value: number) =>
    `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)} ${deliveryCurrency === "TRY" ? "TL" : deliveryCurrency}`;
  // The delivery's own totals block, with the wording and order users know: per rate the base rows, then the VAT rows
  // (rates ascending), the VAT total and the amount to pay; the discount always as "− X".
  const deliveryRates = Object.keys(deliveryTotals.vatByRate).map(Number).sort((a, b) => a - b);
  const deliveryTotalRows: DocumentTotalRow[] = [
    { key: "subtotal", label: "Mal / hizmet toplamı", value: deliveryMoney(deliveryTotals.subtotal) },
    { key: "discount", label: "Toplam iskonto", value: `− ${deliveryMoney(deliveryTotals.discount)}`, emphasis: "muted" },
    ...deliveryRates.map((rate) => ({ key: `taxable-${rate}`, label: `KDV %${rate} matrahı`, value: deliveryMoney(deliveryTotals.taxableByRate[rate]) })),
    ...deliveryRates.map((rate) => ({ key: `vat-${rate}`, label: `KDV %${rate}`, value: deliveryMoney(deliveryTotals.vatByRate[rate]) })),
    { key: "vat", label: "KDV toplamı", value: deliveryMoney(deliveryTotals.vat) },
    { key: "grand", label: "Genel toplam · Ödenecek tutar", value: deliveryMoney(deliveryTotals.total), emphasis: "grand" },
  ];
  function renderField(
    item: SalesDeliverySummary,
    field: BuiltInScreenLayoutField,
  ) {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-haspopup="dialog"
            aria-label={`${item.code} irsaliye ayrıntılarını aç`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(item.id);
              void open(item.id);
            }}
          >
            {item.code}
          </button>
        );
      case "orderCode":
        return item.orderCode || "—";
      case "deliveryDate":
        return item.deliveryDate.split("-").reverse().join(".");
      case "warehouseName":
        return item.warehouseName;
      case "lineCount":
        return item.lineCount;
      case "pricedGrandTotal":
        return (
          <>
            {item.pricedGrandTotal === null || item.pricedGrandTotal === undefined || item.pricingState === "Free" || item.pricingState === "Unpriced"
              ? "—"
              : formatMoneyWithCurrency(item.pricedGrandTotal, item.currencyCode)}
            {item.pricingState && item.pricingState !== "Priced" && (
              <>
                {" "}
                <PricingStateTag state={item.pricingState} />
              </>
            )}
          </>
        );
      case "status":
        return listTag("delivery", item.status);
      case "invoiceStatus":
        return item.invoiceId ? (
          <button
            className="row-action"
            onClick={() => setInvoiceId(item.invoiceId)}
          >
            Faturayı aç
          </button>
        ) : (
          <span className="cell-subtitle">Yok</span>
        );
      default:
        return null;
    }
  }
  // Karar 4: the list opens an order-based delivery from the page param `deliveryId` (read once, then removed).
  const paramDeliveryId = usePageParams(initialCreate ? undefined : "sales-deliveries").deliveryId ?? "";
  useEffect(() => {
    if (!paramDeliveryId) return;
    dropPageParam("sales-deliveries", "deliveryId");
    void open(paramDeliveryId);
  }, [paramDeliveryId]);
  async function open(id: string) {
    setError("");
    setInvoiceEditing(false);
    setDetailTab("information");
    try {
      setDetail(
        await api<NonNullable<typeof detail>>(
          `/api/sales/deliveries/${id}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function startOrderlessInvoice(id: string) {
    setBusy(true);
    setError("");
    try {
      const loaded = await api<NonNullable<typeof detail>>(
        `/api/sales/deliveries/${id}`,
        token,
      );
      setDetail(loaded);
      setDetailTab("invoice");
      setInvoiceCustomerId("");
      setInvoiceDate(localDateString());
      setInvoiceCustomFieldValues({});
      setInvoiceLines(
        loaded.lines.map((line) => ({
          orderLineNumber: line.orderLineNumber,
          // A free / unpriced line takes the stock card's sales VAT (else blank: the server falls back to the order line).
          ...invoicePriceLine(line, null, stockItems.find((item) => item.id === line.stockItemId)?.salesVatPercent ?? null),
        })),
      );
      setInvoiceEditing(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createInvoice(id: string, request?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const invoice = await api<{ id: string }>(
        `/api/sales/deliveries/${id}/invoice`,
        token,
        {
          method: "POST",
          ...(request ? { body: JSON.stringify(request) } : {}),
        },
      );
      setInvoiceEditing(false);
      setInvoiceId(invoice.id);
      await load();
      if (detail?.id === id) await open(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const invoiceCustomFieldsPayload = Object.fromEntries(
    invoiceCustomFields.map((field) => [
      field.code,
      invoiceCustomFieldValues[field.code] || "",
    ]),
  );
  function renderInvoiceCustomFieldInputs() {
    return (
      invoiceCustomFields.length > 0 && (
        <RecordFormGroup title="Fatura Özel Alanları">
          <small>Tenant tarafından tanımlanan ek bilgiler</small>
          <div className="rf-custom-grid">
            {invoiceCustomFields.map((field) => (
              <label key={field.id}>
                {field.label}
                {field.isRequired ? " *" : ""}
                <small>
                  {field.code} · {field.dataType}
                </small>
                {field.dataType === "Boolean" ? (
                  <select
                    required={field.isRequired}
                    value={invoiceCustomFieldValues[field.code] || ""}
                    onChange={(event) =>
                      setInvoiceCustomFieldValues((values) => ({
                        ...values,
                        [field.code]: event.target.value,
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
                    value={invoiceCustomFieldValues[field.code] || ""}
                    onChange={(event) =>
                      setInvoiceCustomFieldValues((values) => ({
                        ...values,
                        [field.code]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </RecordFormGroup>
      )
    );
  }
  async function deleteDelivery(item: SalesDeliverySummary) {
    if (
      !(await confirmDialog({
        title: "İrsaliye silinsin mi?",
        message: `${item.code} irsaliyesi listeden kaldırılır; stok hareketleri ve denetim kayıtları korunur.`,
        tone: "danger",
        confirmLabel: "Sil",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<void>(`/api/sales/deliveries/${item.id}`, token, {
        method: "DELETE",
      });
      setDetail(null);
      setSelectedId(null);
      if (items.length === 1 && page > 1) setPage(page - 1);
      else await load();
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
        message: `${item.code} irsaliyesi iptal edilecek. Stok çıkışı ters hareketle geri alınır.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<void>(`/api/sales/deliveries/${item.id}/void`, token, {
        method: "POST",
      });
      setDetail(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Action bar of the delivery list and of an open delivery. A shipped (Posted) delivery is cancelled, never
  // deleted; only a cancelled one can be deleted. The create page's Yeni comes from StandaloneFulfillmentPanel.
  const busyReason = busy ? "İşleniyor…" : undefined;
  // The bar acts on the open delivery, else on the row the user chose (current row, else a single ticked row).
  const current = items.find((item) => item.id === selectedId);
  const target: SalesDeliverySummary | undefined = detail
    ? ({ warehouseId: "", lineCount: detail.lines.length, createdAt: "", ...detail } as SalesDeliverySummary)
    : current ?? (ticked.length === 1 ? items.find((item) => item.id === ticked[0]) : undefined);
  const commands: PageCommands = {
    // The create page replaces the list; an open delivery is closed first so the form is what shows.
    new: {
      primary: !detail,
      run: () => {
        setDetail(null);
        setCreating(true);
      },
    },
    // While a delivery is open the list's refresh / filter / Excel must not act on the hidden list.
    ...(detail ? documentOpenCommands(() => open(detail.id)) : {}),
  };
  if (!detail)
    commands.open = {
      disabledReason: target ? undefined : "Önce bir kayıt seçin",
      run: () => {
        const id = focusedRecordId() ?? target?.id;
        if (id) return open(id);
      },
    };
  if (role === "TenantAdmin")
    commands.delete = {
      disabledReason: !target
        ? "Önce bir kayıt seçin"
        : target.status !== "Voided"
          ? "Sevk edilmiş irsaliye silinemez — İşlemler › İptal et"
          : busyReason,
      run: () => (target ? deleteDelivery(target) : undefined),
    };
  const more: MenuCommand[] = [];
  // Same handler as the visible control: the row menu on the list, the detail's button (invoice editor) when open.
  if (target?.status === "Posted" && !target.hasSalesInvoice && !(detail && invoiceEditing))
    more.push({
      id: "delivery-invoice",
      label: "Faturalaştır",
      disabledReason: busyReason,
      run: () =>
        detail
          ? startOrderlessInvoice(detail.id)
          : target.orderId && (!target.pricingState || target.pricingState === "Priced")
            ? createInvoice(target.id)
            : startOrderlessInvoice(target.id),
    });
  if (target?.invoiceId)
    more.push({ id: "delivery-open-invoice", label: "Faturayı aç", run: () => setInvoiceId(target.invoiceId) });
  if (target?.status === "Posted")
    more.push({
      id: "delivery-void",
      label: "İptal et",
      disabledReason:
        busyReason ??
        (role !== "TenantAdmin"
          ? "İrsaliye iptali için yönetici yetkisi gerekir."
          : target.invoiceStatus === "Posted"
            ? "Önce bağlı satış faturasını iptal edin."
            : undefined),
      run: () => voidDelivery(target),
    });
  if (!detail) more.push(csvExportCommand(gridExportRef));
  commands.more = more;
  const listActive = !creating && !detail && !invoiceId;
  const panel = useSalesListPanel<Parameters<typeof DeliveryListPanel>[0]["detail"]>({
    active: listActive,
    token,
    currentId: current?.id ?? null,
    path: (id) => `/api/sales/deliveries/${id}`,
    reloadKey: current ? JSON.stringify(current) : undefined,
  });
  const listPanel =
    panel.open && listActive ? (
      current ? (
        <DeliveryListPanel
          row={current}
          detail={panel.detail}
          error={panel.error}
          onOpen={() => void open(current.id)}
          openDisabled={busy}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        />
      ) : (
        <SalesListPanelEmpty kind="delivery" />
      )
    ) : null;
  // Cards: figures of the loaded page ("bu sayfa"); Faturalanmamış filters with the endpoint's unbilledOnly.
  const summary = (
    <ListSummaryCards
      cards={[
        {
          id: "unbilled",
          label: "Faturalanmamış",
          value: loading ? "—" : items.filter((item) => item.status === "Posted" && !item.hasSalesInvoice).length.toLocaleString("tr-TR"),
          icon: FileWarning,
          tone: "warn",
          hint: "bu sayfa",
          filterActive: unbilledOnly,
          onFilter: () => {
            setPage(1);
            setUnbilledOnly((on) => !on);
          },
        },
        {
          id: "voided",
          label: "İptal",
          value: loading ? "—" : items.filter((item) => item.status === "Voided").length.toLocaleString("tr-TR"),
          icon: CircleSlash,
          hint: "bu sayfa",
        },
      ]}
    />
  );
  return (
    <div
      className={`delivery-screen list-v2${creating ? " delivery-create-screen" : ""}`}
    >
      {!creating && !invoiceId && <PageCommandsSlot commands={commands} />}
      {/* The create form draws its own document header (type, flow, Vazgeç = back to the list). */}
      {!creating && (
        <div className="sales-lv2-stack">
          <ListPageHeader
            className="customer-heading"
            title="Satış İrsaliyeleri"
            description="Sevk edilen sipariş satırlarını, depoları ve bağlı faturaları izleyin."
            count={total}
          />
          {summary}
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchLabel="İrsaliye, sipariş veya depo ara"
            searchPlaceholder="İrsaliye, sipariş veya depo ara"
            onSearchApply={() => { setPage(1); setFilter(search.trim()); }}
            toolsSlotRef={setToolsSlot}
            onRefresh={() => void load()}
          >
            <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
          </ListToolbar>
        </div>
      )}
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {creating ? (
        <StandaloneFulfillmentPanel
          token={token}
          sales
          customers={customers}
          stockItems={stockItems}
          warehouses={warehouses}
          initialCustomerId={customerActionId}
          onCancel={() => setCreating(false)}
          ownsActionBar={!invoiceId}
        />
      ) : (
        <div ref={panel.rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
          <section className="list-v2-list">
            <SalesDocumentGrid
              gridId="sales-deliveries"
              hideExport
              exportActionsRef={gridExportRef}
              fields={visibleFields}
              items={items}
              loading={loading}
              loadingMessage="İrsaliyeler yükleniyor…"
              emptyMessage="Henüz satış irsaliyesi yok. İrsaliye, açık sipariş ayrıntısından oluşturulur."
              search={filter}
              searchEmptyMessage="Aramanızla eşleşen irsaliye yok."
              toolbarContainer={toolsSlot}
              renderCell={(field, item) => renderField(item, field)}
              ariaLabel="Satış irsaliyesi kayıtları"
              selection={{
                currentId: selectedId,
                onCurrentChange: setSelectedId,
                onTickedChange: setTicked,
                // Only while the list is on screen: a document or form over it must not show the floating bar.
                bulkActions: listActive
                  ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                  : undefined,
                onOpen: (id) => void open(id),
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
              columnWidths={DELIVERY_LIST_WIDTHS}
              numberFields={SALES_NUMBER_FIELDS}
              codeFields={SALES_CODE_FIELDS}
            />
          </section>
          {listPanel}
        </div>
      )}
      {detail && (
          <DocumentSurface
            variant="detail"
            title="Satış irsaliyesi"
            code={detail.code}
            status={salesDeliveryStatus(detail.status)}
            meta={<span>{formatDate(detail.deliveryDate)}</span>}
            statusFlow={<SalesDeliveryFlow status={detail.status} invoiced={detail.hasSalesInvoice && detail.invoiceStatus === "Posted"} />}
            onClose={() => setDetail(null)}
            aside={
              <DetailContext title="Belge zinciri">
                <DetailChain
                  items={[
                    ...(detail.orderCode ? [{ key: "order", code: detail.orderCode, label: "Satış siparişi" }] : []),
                    { key: "self", code: detail.code, label: "Bu irsaliye", kind: "Satış irsaliyesi", current: true, status: salesDeliveryStatus(detail.status) },
                    // The delivery gives its invoice's status and id, not its number.
                    ...(detail.invoiceStatus
                      ? [
                          {
                            key: "invoice",
                            label: "Satış faturası",
                            status: salesInvoiceStatus(detail.invoiceStatus),
                            onOpen: detail.invoiceId ? () => setInvoiceId(detail.invoiceId) : undefined,
                          },
                        ]
                      : []),
                  ]}
                />
              </DetailContext>
            }
            hints={SALES_DETAIL_HINTS}
            footerStatus={
              <SalesFooterStatus lines={detail.lines.length} total={priced ? deliveryMoney(deliveryTotals.total) : undefined} />
            }
          >
            <DetailTabs<"information" | "invoice">
              label="İrsaliye detay bölümleri"
              value={detailTab}
              onChange={setDetailTab}
              tabs={[
                { key: "information", label: "İrsaliye Bilgileri" },
                { key: "invoice", label: "Fatura İşlemleri", count: detail.hasSalesInvoice ? 1 : 0 },
              ]}
            />
            {detailTab === "information" && <>
            <div className="dd-box">
              <DetailInfoGrid
                label="İrsaliye bilgileri"
                items={[
                  { label: "Bağlı sipariş", value: detail.orderCode || "—" },
                  ...(detail.pricingState && detail.pricingState !== "Priced"
                    ? [{ label: "Fiyat durumu", value: <PricingStateTag state={detail.pricingState} /> }]
                    : []),
                  { label: "Sevk deposu", value: detail.warehouseName },
                  { label: "Sevk tarihi", value: formatDate(detail.deliveryDate) },
                  {
                    label: "Fatura durumu",
                    value: detail.hasSalesInvoice ? (detail.invoiceStatus === "Posted" ? "Faturası kesildi" : "Fatura iptal edildi") : "Fatura bekliyor",
                  },
                ]}
              />
            </div>
            <div className="dd-box">
              <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={detail.lines.length} extra={detail.warehouseName} />} />
              <div className="dd-lines-wrap">
                <table className="dd-lines" aria-label="İrsaliye satırları">
                  <thead>
                    <tr>
                      <th className="dd-ix">#</th>
                      <th>Stok kartı</th>
                      <th className="dd-num">Sipariş satırı</th>
                      <th className="dd-num">Sevk miktarı</th>
                      {showPrices && <PriceHeadCells gross />}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line, index) => (
                      <tr
                        key={`${line.orderLineNumber}-${line.stockItemId}-${index}`}
                        className={line.isFreeOfCharge ? "dp-free-row" : undefined}
                      >
                        <td className="dd-ix">{index + 1}</td>
                        <td className="dd-stock">
                          <b>{line.stockCode}{line.isFreeOfCharge && <> <FreeTag /></>}</b>
                          <small>{line.stockName}</small>
                        </td>
                        <td className="dd-num">{line.orderLineNumber}</td>
                        <td className="dd-num">
                          {formatQuantity(line.quantity)} {line.unitCode}
                        </td>
                        {showPrices && <PriceReadCells line={withLineAmounts(line)} gross />}
                      </tr>
                    ))}
                    {detail.lines.length === 0 && (
                      <tr>
                        <td colSpan={showPrices ? 10 : 4} className="dd-empty">İrsaliye kalemi bulunamadı.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {priced && (
                <DetailLinesFooter
                  label="İrsaliye toplamları"
                  totals={deliveryTotalRows}
                />
              )}
              {((detail.freeLineCount ?? 0) > 0 || (detail.unpricedLineCount ?? 0) > 0) && (
                <p className="dp-hint">
                  {(detail.freeLineCount ?? 0) > 0 && `Bedelsiz satır: ${detail.freeLineCount} · tutarı faturada girilir. `}
                  {(detail.unpricedLineCount ?? 0) > 0 && `Fiyatsız satır: ${detail.unpricedLineCount} · tutarı faturada girilir.`}
                </p>
              )}
            </div>
            </>}
            {detailTab === "invoice" && <>
            <DetailSection
              title={detail.hasSalesInvoice ? "Fatura oluşturulmuş" : "Henüz fatura yok"}
              description={
                detail.hasSalesInvoice
                  ? `Fatura durumu: ${detail.invoiceStatus === "Posted" ? "İşlendi" : "İptal edildi"}`
                  : detail.orderId
                    ? "Bu irsaliyeyi faturalaştırarak satış faturasını ve cari borç kaydını oluşturun."
                    : "Faturayı daha sonra bu irsaliyedeki miktarları değiştirmeden oluşturabilirsiniz."
              }
              actions={
                detail.invoiceId ? (
                  <button type="button" className="secondary" onClick={() => setInvoiceId(detail.invoiceId)}>
                    Faturayı aç
                  </button>
                ) : (
                  detail.status === "Posted" &&
                  !invoiceEditing && (
                    <button type="button" className="primary" disabled={busy} onClick={() => void startOrderlessInvoice(detail.id)}>
                      <FilePlus2 size={15} />
                      {busy ? "Fatura hazırlanıyor…" : detail.orderId ? "Faturalaştır" : "Fatura bilgilerini gir"}
                    </button>
                  )
                )
              }
            />
            {invoiceEditing && (
              <RecordFormPage
                variant="dialog"
                className="sales-rf sales-rf-embedded"
                title="Fatura bilgileri"
                mode="create"
                busy={busy}
                saveLabel="Faturayı oluştur"
                // A sub-form of the document: its own Kaydet saves it, not the action bar's.
                ownSave
                saveDisabledReason={
                  detail.orderId === null && !invoiceCustomerId
                    ? "Kaydetmek için müşteri seçin."
                    : missingInvoiceAmounts(invoiceLines) > 0
                      ? "Bedelsiz/fiyatsız satırların tutarını girin."
                      : undefined
                }
                onCancel={() => {
                  if (!busy) setInvoiceEditing(false);
                }}
                status={
                  <span>
                    {detail.orderId
                      ? "İrsaliye fiyatları kullanılır; burada değiştirilebilir (irsaliye değişmez)."
                      : `${customers.find((customer) => customer.id === invoiceCustomerId)?.currencyCode || "Döviz"} · KDV/iskonto oranlarını doğrulayın`}
                  </span>
                }
                onSubmit={(event) => {
                  event.preventDefault();
                  // The old save button was disabled until a customer was chosen.
                  if (detail.orderId === null && !invoiceCustomerId) return;
                  if (missingInvoiceAmounts(invoiceLines) > 0) {
                    setError("Bedelsiz/fiyatsız satırların tutarını girin.");
                    return;
                  }
                  // Order-based: only the lines whose price differs from the delivery (or had none) go as overrides.
                  const overrides = invoiceLines
                    .filter((line, index) => invoiceLineOverridden(line, detail.lines[index] ?? {}))
                    .map((line) => ({ orderLineNumber: line.orderLineNumber, ...invoicePriceFields(line) }));
                  const request = detail.orderId
                    ? { customFields: invoiceCustomFieldsPayload, ...(overrides.length ? { lines: overrides } : {}) }
                    : {
                        customerId: invoiceCustomerId,
                        invoiceDate,
                        customFields: invoiceCustomFieldsPayload,
                        lines: invoiceLines.map((line) => ({
                          orderLineNumber: line.orderLineNumber,
                          ...invoicePriceFields(line),
                        })),
                      };
                  void createInvoice(detail.id, request);
                }}
              >
                {detail.orderId === null ? (
                  <>
                    <RecordFormGroup title="Fatura Kimliği" bodyClassName="rf-identity sales-rf-identity-2">
                      <label className="sales-rf-order-2">
                        <span>Müşteri <RequiredMark /></span>
                        <select
                          className="rf-must"
                          value={invoiceCustomerId}
                          onChange={(event) =>
                            setInvoiceCustomerId(event.target.value)
                          }
                          required
                        >
                          <option value="">Müşteri seçin</option>
                          {customers
                            .filter(
                              (customer) =>
                                customer.isActive &&
                                customer.type !== "Supplier",
                            )
                            .map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customer.code} · {customer.name} (
                                {customer.currencyCode})
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        <span>Fatura tarihi <RequiredMark /></span>
                        <input
                          type="date"
                          value={invoiceDate}
                          onChange={(event) =>
                            setInvoiceDate(event.target.value)
                          }
                          required
                        />
                      </label>
                    </RecordFormGroup>
                  </>
                ) : (
                  <p className="muted">
                    Fiyatlı satırlar irsaliye fiyatıyla gelir. Zorunlu fatura özel alanlarını tamamlayın.
                  </p>
                )}
                    <RecordFormGroup title="Fatura Satırları">
                    <InvoiceAmountsAlert missing={missingInvoiceAmounts(invoiceLines)} />
                    <div className="customer-table-wrap sales-delivery-lines-wrap sales-rf-lines">
                      <table className="customer-table">
                        <thead>
                          <tr>
                            <th>İrsaliye satırı</th>
                            <th>Miktar</th>
                            <th className="dd-num">Birim fiyat</th>
                            <th className="dd-num">İsk. %</th>
                            <th className="dd-num">KDV %</th>
                            <th className="dd-num">Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.lines.map((line, index) => (
                            <tr
                              key={`${line.orderLineNumber}-${line.stockItemId}`}
                              className={line.isFreeOfCharge ? "dp-free-row" : undefined}
                            >
                              <td>
                                <b>
                                  {line.stockCode} · {line.stockName}
                                </b>
                                {line.isFreeOfCharge && <> <FreeTag /></>}
                              </td>
                              <td>
                                {line.quantity.toLocaleString("tr-TR", {
                                  maximumFractionDigits: 4,
                                })}{" "}
                                {line.unitCode}
                              </td>
                              {invoiceLines[index] && (
                                <InvoicePriceCells
                                  label={line.stockCode}
                                  quantity={line.enteredQuantity ?? line.quantity}
                                  line={invoiceLines[index]}
                                  suggestion={listPriceSuggestion(
                                    stockItems.find((item) => item.id === line.stockItemId),
                                    "sales",
                                    deliveryCurrency,
                                  )}
                                  onChange={(patch) =>
                                    setInvoiceLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
                                  }
                                />
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted">
                      Bu işlem yalnızca faturayı ve cari borç kaydını oluşturur;
                      irsaliyedeki stok çıkışı tekrarlanmaz. Bedelsiz satır 0 olarak da
                      faturalanabilir; fatura toplamı sıfırdan büyük olmalı.
                    </p>
                    </RecordFormGroup>
                {renderInvoiceCustomFieldInputs()}
              </RecordFormPage>
            )}
            </>}
          </DocumentSurface>
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
