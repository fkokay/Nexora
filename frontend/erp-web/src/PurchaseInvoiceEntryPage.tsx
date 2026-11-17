import type { GridExportActions } from "./AdvancedDataGrid";
import type { ScreenColumnPin } from "./erp-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { Check, Copy, Info, X } from "lucide-react";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "./record-form/RecordForm";
import "./purchase-invoice-entry.css";
import { problemDetail } from "./erpApi";
import SalesDocumentGrid from "./sales/components/SalesDocumentGrid";
import { SalesListFooter } from "./sales/components/SalesListFooter";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesListPanelToggle,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelRows,
  SalesPanelStats,
} from "./sales/components/SalesListDetailPanel";
import { useStockDetailPanelOpen } from "./inventory/components/InventoryStockDetailPanel";
import { SalesFormLines } from "./sales/salesDocumentForm";
import { DetailChain, DetailContext, DetailKeyValues, type DocumentTotalRow } from "./document-detail/DocumentDetailLayout";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import { PurchaseCreateInvoiceFlow } from "./purchasing/purchaseCreateForms";
import "./sales/sales-list-v2.css";

type ReceiptOption = {
  id: string;
  receiptCode: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  supplierId: string;
  supplierName: string;
  receiptDate: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  lineCount: number;
  currencyCode: string;
  purchaseOrderTotal: number;
};
type ReceiptPage = {
  items: ReceiptOption[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type CreatedInvoice = {
  id: string;
  code: string;
  grandTotal: number;
  currencyCode: string;
};
type AccountingRuleProfile = {
  profileCode: string; name: string; jurisdictionCode: string; reportingStandard: string;
  isActive: boolean; parametersJson: string;
};
/** GET /api/purchasing/orders/{id} (PurchaseOrderView): only the fields this page reads. */
type OrderLine = {
  lineNumber: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
};
type OrderReceiptLine = {
  orderLineNumber: number;
  stockCode: string;
  stockName: string;
  unitCode: string;
  quantity: number;
};
type OrderReceipt = {
  id: string;
  status: string;
  lines?: OrderReceiptLine[] | null;
  invoice?: { id: string } | null;
};
type OrderDetail = {
  id: string;
  currencyCode: string;
  lines: OrderLine[];
  receipts: OrderReceipt[];
};
type ReceiptAmountLine = OrderReceiptLine & { net: number; tax: number };
type ReceiptAmounts = {
  lines: ReceiptAmountLine[];
  net: number;
  tax: number;
  total: number;
};
type ReceiptScreenField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  section?: string | null;
  fixed?: boolean;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};
// Depo and line count are shown under the supplier; the amount column is this receipt's invoice value.
const defaultReceiptFields: ReceiptScreenField[] = [
  { key: "receipt", label: "Mal kabul / sipariş", visible: true, position: 0 },
  { key: "supplier", label: "Tedarikçi", visible: true, position: 1 },
  { key: "receiptDate", label: "Kabul tarihi", visible: true, position: 2 },
  { key: "invoiceAmount", label: "Fatura tutarı", visible: true, position: 3 },
  {
    key: "actions",
    label: "Fatura işlemi",
    visible: true,
    position: 4,
    fixed: true,
  },
];
const LONG_HINT =
  "Bu akış yalnızca sipariş ve işlenmiş mal kabul satırlarına bağlı stok faturalarını destekler. Sipariş/mal kabul bağlantısı olmayan hizmet veya masraf faturaları mevcut modelde yer almıyor; bunlar için ayrı bir domain ve hesap eşlemesi kararı gerekiyor.";

export type PurchaseInvoiceEntryPageProps = {
  token: string;
  role: string;
  onInvoiceCreated?: (invoiceId: string) => void;
};

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `İstek başarısız (${response.status}).`;
    try {
      const body = await response.json();
      message = body.error || problemDetail(body) || message;
    } catch {
      /* preserve the status message */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const displayDate = (iso: string) => iso.split("-").reverse().join(".");
const money = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value: number) =>
  value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

/** decimal.Round(x, 2, MidpointRounding.AwayFromZero), tolerant of binary float noise. */
function round2(value: number): number {
  const scaled = Number((Math.abs(value) * 100).toFixed(6));
  return (Math.sign(value) * Math.round(scaled)) / 100;
}

/** SalesQuoteValidation.Calculate for a VAT-exclusive line: subtotal, then discount, each rounded. */
function cumulativeAmounts(qty: number, line: OrderLine) {
  const subtotal = round2(qty * line.unitPrice);
  const discount = round2((subtotal * line.discountPercent) / 100);
  return { subtotal, discount };
}

/**
 * Mirrors PurchaseInvoiceWorkflow.CalculateIncrementalAmounts: each line is the cumulative
 * amount of (already invoiced + this receipt) minus the already invoiced cumulative amount;
 * KDV is then taken on that net amount. Extra profile tax rules (e.g. withholding) can still
 * change the saved totals, so the figures here are a preview.
 */
function receiptAmounts(order: OrderDetail, receiptId: string): ReceiptAmounts | null {
  const receipt = order.receipts.find((item) => item.id === receiptId);
  if (!receipt?.lines) return null;
  const invoicedQty = new Map<number, number>();
  for (const other of order.receipts) {
    if (other.id === receiptId || !other.invoice || !other.lines) continue;
    for (const line of other.lines)
      invoicedQty.set(line.orderLineNumber, (invoicedQty.get(line.orderLineNumber) ?? 0) + line.quantity);
  }
  const lines: ReceiptAmountLine[] = [];
  for (const source of receipt.lines) {
    const orderLine = order.lines.find((line) => line.lineNumber === source.orderLineNumber);
    if (!orderLine) return null;
    const previous = invoicedQty.get(source.orderLineNumber) ?? 0;
    const before = cumulativeAmounts(previous, orderLine);
    const after = cumulativeAmounts(previous + source.quantity, orderLine);
    const net = round2(after.subtotal - after.discount - (before.subtotal - before.discount));
    // AccountingRuleTaxCalculator.Calculate: KDV on this receipt's own net amount.
    const tax = round2((net * orderLine.vatPercent) / 100);
    lines.push({ ...source, net, tax });
  }
  const net = round2(lines.reduce((sum, line) => sum + line.net, 0));
  const tax = round2(lines.reduce((sum, line) => sum + line.tax, 0));
  return { lines, net, tax, total: round2(net + tax) };
}

/** Long receipt codes keep their prefix and tail: "GR-…E1DAEA5". */
function shortCode(code: string): string {
  if (code.length <= 16) return code;
  const dash = code.indexOf("-");
  const prefix = dash > 0 && dash <= 6 ? code.slice(0, dash + 1) : "";
  return `${prefix}…${code.slice(-8)}`;
}

/**
 * Shows the shortened code; the full code stays in the tooltip. The grid reads `value`
 * for export, sort and filter, so XLSX/CSV keep the full receipt number.
 */
function ShortCode({ value }: { value: string }) {
  return (
    <span className="pie-code" title={value}>
      {shortCode(value)}
    </span>
  );
}

function addDays(isoDate: string, days: number): string | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()}`;
}

/** Older saved views used purchaseOrderTotal / warehouse / lineCount; map them onto the current columns. */
function migrateFields(saved: ReceiptScreenField[]): ReceiptScreenField[] {
  const allowed = new Set(defaultReceiptFields.map((field) => field.key));
  const fields: ReceiptScreenField[] = [];
  for (const field of saved) {
    if (field.key === "purchaseOrderTotal") {
      if (!saved.some((item) => item.key === "invoiceAmount"))
        fields.push({ ...field, key: "invoiceAmount", label: "Fatura tutarı" });
      continue;
    }
    if (allowed.has(field.key)) fields.push({ ...field, fixed: field.key === "actions" });
  }
  for (const field of defaultReceiptFields)
    if (!fields.some((item) => item.key === field.key))
      fields.push({ ...field, position: fields.length });
  return fields.sort((a, b) => a.position - b.position);
}

export default function PurchaseInvoiceEntryPage({
  token,
  onInvoiceCreated,
}: PurchaseInvoiceEntryPageProps) {
  const [items, setItems] = useState<ReceiptOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  // Search text that is applied to the query (set shortly after typing stops).
  const [query, setQuery] = useState("");
  const [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ReceiptOption | null>(null);
  const [copied, setCopied] = useState(false);
  const [orders, setOrders] = useState<Record<string, OrderDetail | "error">>({});
  const [paymentTerms, setPaymentTerms] = useState<Record<string, number | null>>({});
  const [invoiceCode, setInvoiceCode] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localDate());
  const [providerInvoiceUuid, setProviderInvoiceUuid] = useState("");
  const [providerScenario, setProviderScenario] = useState("");
  const [providerTypeCode, setProviderTypeCode] = useState("");
  const [providerSenderAlias, setProviderSenderAlias] = useState("");
  const [accountingProfiles, setAccountingProfiles] = useState<AccountingRuleProfile[]>([]);
  const [accountingProfileCode, setAccountingProfileCode] = useState("");
  const [screenFields, setScreenFields] =
    useState<ReceiptScreenField[]>(defaultReceiptFields);
  const pageSize = 25;
  // The row the user chose in the list (click, ↑/↓): the right panel shows it; Aç / Enter / double click opens its
  // invoice form (`selected`).
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);
  const panel = useStockDetailPanelOpen(!selected, listBodyRef);

  useEffect(() => {
    let cancelled = false;
    void request<{ fields?: ReceiptScreenField[] }>(
      "/api/screen-views/purchase-invoice-receipt-selection/active",
      token,
    )
      .then((view) => {
        if (cancelled || !Array.isArray(view.fields)) return;
        setScreenFields(migrateFields(view.fields));
      })
      .catch(() => {
        /* Keep the standard layout if Studio is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void request<AccountingRuleProfile[]>("/api/finance/general-ledger/rule-profiles", token)
      .then((profiles) => {
        if (cancelled) return;
        const configured = profiles.filter((profile) => {
          if (!profile.isActive) return false;
          try { const rules = JSON.parse(profile.parametersJson)?.taxRules; return Array.isArray(rules) && rules.length > 0; }
          catch { return false; }
        });
        setAccountingProfiles(configured);
        const defaultProfile = configured.find((profile) => {
          try { return JSON.parse(profile.parametersJson)?.defaultForDocuments === true; }
          catch { return false; }
        });
        setAccountingProfileCode(defaultProfile?.profileCode || configured.find((profile) => profile.profileCode === "TR-LOCAL")?.profileCode || configured[0]?.profileCode || "");
      })
      .catch(() => { if (!cancelled) setAccountingProfiles([]); });
    return () => { cancelled = true; };
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<ReceiptPage>(
        `/api/purchasing/invoices/entry/receipts?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(query.trim())}`,
        token,
      );
      setItems(result.items);
      setTotal(result.totalCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, query, token]);
  useEffect(() => {
    void load();
  }, [load]);

  // Order details carry the receipt lines and prices; one request per order on the page.
  useEffect(() => {
    const missing = [...new Set(items.map((item) => item.purchaseOrderId))].filter(
      (id) => !(id in orders),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map((id) =>
        request<OrderDetail>(`/api/purchasing/orders/${id}`, token)
          .then((order) => [id, order] as const)
          .catch(() => [id, "error"] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      setOrders((current) => {
        const next = { ...current };
        for (const [id, value] of results) next[id] = value;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items, orders, token]);

  const supplierId = selected?.supplierId;
  useEffect(() => {
    if (!supplierId || supplierId in paymentTerms) return;
    let cancelled = false;
    void request<{ paymentTermDays?: number | null }>(`/api/customers/${supplierId}`, token)
      .then((supplier) => typeof supplier.paymentTermDays === "number" ? supplier.paymentTermDays : null)
      .catch(() => null)
      .then((days) => {
        if (!cancelled) setPaymentTerms((current) => ({ ...current, [supplierId]: days }));
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, paymentTerms, token]);

  const amountsFor = useCallback(
    (item: ReceiptOption): ReceiptAmounts | null | undefined => {
      const order = orders[item.purchaseOrderId];
      if (order === undefined) return undefined;
      if (order === "error") return null;
      return receiptAmounts(order, item.id);
    },
    [orders],
  );

  function selectReceipt(item: ReceiptOption) {
    if (selected?.id === item.id) return;
    setSelected(item);
    setCopied(false);
    setFormError("");
    setInvoiceCode("");
    setInvoiceDate(localDate());
    setProviderInvoiceUuid(""); setProviderScenario(""); setProviderTypeCode(""); setProviderSenderAlias("");
  }

  async function copyReceiptCode(code: string) {
    try {
      if (!navigator.clipboard) return;
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard access can be denied; the full code is still in the tooltip. */
    }
  }

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      const invoice = await request<CreatedInvoice>(
        `/api/purchasing/receipts/${selected.id}/invoice`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ code: invoiceCode.trim(), invoiceDate,
            accountingProfileCode: accountingProfileCode || null,
            providerInvoiceUuid: providerInvoiceUuid || null, providerScenario: providerScenario || null,
            providerInvoiceTypeCode: providerTypeCode || null, providerSenderAlias: providerSenderAlias || null }),
        },
      );
      const orderId = selected.purchaseOrderId;
      setSelected(null);
      setInvoiceCode("");
      setInvoiceDate(localDate());
      setProviderInvoiceUuid(""); setProviderScenario(""); setProviderTypeCode(""); setProviderSenderAlias("");
      // Other receipts of this order are now priced on top of this invoice.
      setOrders((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      setNotice(
        `${invoice.code} alış faturası kaydedildi. Tedarikçi borcu ${invoice.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${invoice.currencyCode}.`,
      );
      onInvoiceCreated?.(invoice.id);
      await load();
    } catch (e) {
      setFormError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  // The invoice action is the panel's Aç (and the bar's Aç / Enter / double click), so the row action column is not shown.
  const visibleFields = screenFields.filter(
    (field) => (field.visible || field.fixed) && field.key !== "actions",
  );
  const fieldValue = (item: ReceiptOption, key: string) => {
    if (key === "receipt")
      return (
        <>
          <ShortCode value={item.receiptCode} />
          <small className="cell-subtitle list-v2-name-code">{item.purchaseOrderCode}</small>
        </>
      );
    if (key === "supplier")
      return (
        <>
          <span>{item.supplierName}</span>
          <small className="cell-subtitle list-v2-name-code">{`${item.warehouseName} · ${item.lineCount} satır`}</small>
        </>
      );
    if (key === "receiptDate") return displayDate(item.receiptDate);
    if (key === "invoiceAmount") {
      const amounts = amountsFor(item);
      return amounts ? `${money(amounts.total)} ${item.currencyCode}` : "—";
    }
    return null;
  };

  const selectedAmounts = selected ? amountsFor(selected) : undefined;
  const termDays = selected ? paymentTerms[selected.supplierId] : undefined;
  const dueDate = useMemo(
    () => (typeof termDays === "number" && invoiceDate ? addDays(invoiceDate, termDays) : null),
    [termDays, invoiceDate],
  );

  function openReceipt(id: string) {
    const item = items.find((row) => row.id === id);
    if (!item) return;
    setCurrentId(item.id);
    selectReceipt(item);
  }

  if (selected) {
    const totals: DocumentTotalRow[] | undefined = selectedAmounts
      ? [
          { key: "net", label: "Ara toplam", value: money(selectedAmounts.net) },
          { key: "tax", label: "KDV", value: money(selectedAmounts.tax) },
          { key: "grand", label: "Genel toplam", value: `${money(selectedAmounts.total)} ${selected.currencyCode}`, emphasis: "grand" },
        ]
      : undefined;
    return (
      <RecordFormPage
        className="sales-rf pie-create"
        title="Mal kabul faturası girişi"
        document={{
          type: "Alış faturası",
          code: invoiceCode.trim() || undefined,
          party: selected.supplierName,
          // The save issues the invoice (İşlendi): no current step before that.
          statusFlow: <PurchaseCreateInvoiceFlow />,
        }}
        aside={
          <DetailContext title="Belge zinciri">
            <DetailChain
              items={[
                { key: "order", code: selected.purchaseOrderCode, label: "Satınalma siparişi" },
                { key: "receipt", code: selected.receiptCode, label: "Mal kabul", meta: displayDate(selected.receiptDate) },
                { key: "self", code: invoiceCode.trim() || undefined, label: "Bu fatura", kind: "Alış faturası", current: true },
              ]}
            />
            <DetailKeyValues
              items={[
                { label: "Depo", value: selected.warehouseName },
                { label: "Kabul tarihi", value: displayDate(selected.receiptDate) },
              ]}
            />
          </DetailContext>
        }
        mode="create"
        busy={busy}
        saveLabel="Faturayı kaydet"
        formId="purchase-invoice-entry-form"
        onSubmit={(event) => void createInvoice(event)}
        onCancel={() => {
          setSelected(null);
          setFormError("");
        }}
        error={formError}
        onDismissError={() => setFormError("")}
        status={
          <>
            <span>Yalnızca siparişe bağlı, işlenmiş mal kabuller listelenir.</span>
            <span className="rf-status-end">
              Satır: <b>{selected.lineCount}</b>
            </span>
          </>
        }
      >
        <RecordFormGroup title="Belge bilgileri" hint="* zorunlu alan" bodyClassName="rf-identity doc-form-fields">
          <label>
            <span>Tedarikçi fatura no <RequiredMark /></span>
            <input
              className="rf-must rf-mono"
              value={invoiceCode}
              onChange={(e) => setInvoiceCode(e.target.value)}
              maxLength={64}
              required
              disabled={busy}
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
              disabled={busy}
            />
          </label>
          {dueDate && typeof termDays === "number" && (
            <p className="rf-field pie-create-due">{`Vade ${dueDate} · ${termDays} gün`}</p>
          )}
          {accountingProfiles.length > 0 && (
            <label className="rf-span-2">
              <span>Vergi mevzuatı profili <RequiredMark /></span>
              <select value={accountingProfileCode} onChange={(e) => setAccountingProfileCode(e.target.value)} required disabled={busy}>
                <option value="">Profil seçin</option>
                {accountingProfiles.map((profile) => <option key={profile.profileCode} value={profile.profileCode}>{profile.name} · {profile.jurisdictionCode} · {profile.reportingStandard}</option>)}
              </select>
            </label>
          )}
          <details className="pie-create-edoc">
            <summary>Gelen e-belge bilgileri</summary>
            <div>
              <label><span>Belge UUID</span><input className="rf-mono" value={providerInvoiceUuid} onChange={(e) => setProviderInvoiceUuid(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" disabled={busy} /></label>
              <label><span>Belge senaryosu</span><input value={providerScenario} onChange={(e) => setProviderScenario(e.target.value)} placeholder="TEMELFATURA / TICARIFATURA / EARSIVFATURA" disabled={busy} /></label>
              <label><span>Belge tür kodu</span><input value={providerTypeCode} onChange={(e) => setProviderTypeCode(e.target.value)} placeholder="SATIS / IADE / TEVKIFAT" disabled={busy} /></label>
              <label><span>Gönderen e-Fatura etiketi</span><input className="rf-mono" value={providerSenderAlias} onChange={(e) => setProviderSenderAlias(e.target.value)} disabled={busy} /></label>
            </div>
          </details>
        </RecordFormGroup>
        <SalesFormLines
          label="Fatura satırları"
          lines={selectedAmounts ? selectedAmounts.lines.length : selected.lineCount}
          extra={selected.currencyCode}
          addHint={false}
          totals={totals}
          totalsLabel="Fatura toplamları"
        >
          <table className="dd-lines">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok</th>
                <th className="dd-num">Miktar</th>
                <th>Birim</th>
                <th className="dd-num">Tutar</th>
                <th className="dd-num">KDV</th>
              </tr>
            </thead>
            <tbody>
              {selectedAmounts ? (
                selectedAmounts.lines.map((line, index) => (
                  <tr key={`${line.orderLineNumber}-${index}`}>
                    <td className="dd-ix">{index + 1}</td>
                    <td className="dd-stock">
                      <b>{line.stockCode}</b>
                      <small>{line.stockName}</small>
                    </td>
                    <td className="dd-num">{quantity(line.quantity)}</td>
                    <td>{line.unitCode}</td>
                    <td className="dd-num">{money(line.net)}</td>
                    <td className="dd-num">{money(line.tax)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="pie-create-lines-state">
                    {selectedAmounts === undefined ? "Satırlar yükleniyor…" : "Mal kabul satırları alınamadı."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </SalesFormLines>
      </RecordFormPage>
    );
  }

  const current = items.find((item) => item.id === currentId);
  const currentAmounts = current ? amountsFor(current) : undefined;
  const listPanel = panel.open ? (
    current ? (
      <SalesListDetailPanel
        label="Seçili mal kabul ayrıntıları"
        code={current.receiptCode}
        title={current.supplierName}
        tags={
          <button
            type="button"
            className="pie-copy"
            aria-label="Mal kabul numarasını kopyala"
            title="Mal kabul numarasını kopyala"
            onClick={() => void copyReceiptCode(current.receiptCode)}
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          </button>
        }
        tabs={[{ id: "summary", label: "Özet" }]}
        tab="summary"
        onTabChange={() => {}}
        onOpen={() => openReceipt(current.id)}
        onClose={panel.close}
        takeFocus={panel.takeFocus}
      >
        {currentAmounts === undefined ? (
          <p className="sales-ld-muted">Satırlar yükleniyor…</p>
        ) : currentAmounts === null ? (
          <p className="sales-ld-muted">Mal kabul satırları alınamadı.</p>
        ) : (
          <>
            <SalesPanelStats
              items={[
                { label: "Genel toplam", value: `${money(currentAmounts.total)} ${current.currencyCode}` },
                { label: "Ara toplam", value: money(currentAmounts.net) },
                { label: "KDV", value: money(currentAmounts.tax) },
              ]}
            />
            <SalesPanelRows
              empty="Satır yok."
              rows={currentAmounts.lines.map((line, index) => ({
                key: `${line.orderLineNumber}-${index}`,
                label: line.stockName,
                meta: `${quantity(line.quantity)} ${line.unitCode}`,
                value: money(line.net),
              }))}
            />
          </>
        )}
        <SalesPanelFacts
          items={[
            { label: "Kabul tarihi", value: displayDate(current.receiptDate) },
            { label: "Depo", value: current.warehouseName },
          ]}
        />
        <SalesPanelChain
          items={[
            { key: "order", code: current.purchaseOrderCode, label: "Satınalma siparişi" },
            { key: "self", code: current.receiptCode, label: "Mal kabul", current: true },
          ]}
        />
      </SalesListDetailPanel>
    ) : (
      <SalesListDetailEmpty label="Seçili mal kabul ayrıntıları" text="Fatura girmek için listeden bir mal kabul seçin." />
    )
  ) : null;

  return (
    <div className="purchase-invoice-entry sales-lv2-stack list-v2">
      <PageCommandsSlot
        commands={{
          open: {
            disabledReason: current ? undefined : "Önce bir kayıt seçin",
            run: () => {
              const id = focusedRecordId() ?? current?.id;
              if (id) openReceipt(id);
            },
          },
          more: [csvExportCommand(gridExportRef)],
        }}
      />
      <ListPageHeader
        title="Mal kabul faturası girişi"
        description="İşlenmiş mal kabullerini seçin; fatura kaydı sipariş ve stok kabulüyle bağlantısını korusun."
        count={loading && total === 0 ? null : total}
        countLabel="mal kabul fatura bekliyor"
      />
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchApply={() => {
          setPage(1);
          setQuery(search.trim());
        }}
        searchPlaceholder="Mal kabul, sipariş, tedarikçi veya depo ara"
        toolsSlotRef={setGridToolsSlot}
        onRefresh={() => {
          if (loading) return;
          // Retry order details that failed earlier.
          setOrders((current) =>
            Object.fromEntries(Object.entries(current).filter(([, value]) => value !== "error")),
          );
          void load();
        }}
      >
        <span className="pie-hint-line" title={LONG_HINT}>
          <Info size={14} aria-hidden="true" />
          <span>Yalnızca siparişe bağlı, işlenmiş mal kabuller listelenir.</span>
        </span>
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" aria-label="Kapat" onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      )}
      <div ref={listBodyRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list">
          <SalesDocumentGrid
            gridId="purchase-invoice-receipt-selection-v2"
            hideExport
            exportActionsRef={gridExportRef}
            fields={visibleFields}
            items={items}
            loading={loading}
            loadingMessage="Mal kabuller yükleniyor…"
            emptyMessage="Faturalanabilir mal kabul yok. Önce satın alma siparişi üzerinden mal kabul kaydedin."
            search={query}
            searchEmptyMessage="Aramanızla eşleşen faturalanabilir mal kabul yok."
            toolbarContainer={gridToolsSlot}
            renderCell={(field, item) => fieldValue(item, field.key)}
            ariaLabel="Faturalanabilir mal kabuller"
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              bulkActions: [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }],
              onOpen: openReceipt,
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
            columnWidths={RECEIPT_COLUMN_WIDTHS}
            numberFields={RECEIPT_NUMBER_FIELDS}
          />
        </section>
        {listPanel}
      </div>
    </div>
  );
}

const RECEIPT_NUMBER_FIELDS: ReadonlySet<string> = new Set(["invoiceAmount"]);
/** Default widths (fields without a tenant width), sized like the Satış lists. */
const RECEIPT_COLUMN_WIDTHS: Record<string, number> = { receipt: 180, supplier: 280, receiptDate: 105, invoiceAmount: 150 };
