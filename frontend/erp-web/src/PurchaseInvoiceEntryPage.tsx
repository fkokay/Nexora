import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import type { ScreenColumnPin } from "./erp-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { Check, Copy, Info } from "lucide-react";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import { RequiredMark } from "./record-form/RecordForm";
import "./purchasing-record-forms.css";
import "./purchase-list-v2/purchase-list-v2.css";
import "./purchase-invoice-entry.css";
import { ListPagination } from "./list-page/ListPagination";
import { problemDetail } from "./erpApi";

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
    <b className="pie-code" title={value}>
      {shortCode(value)}
    </b>
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

  // The invoice action lives in the detail panel, so the row action column is not shown.
  const visibleFields = screenFields.filter(
    (field) => (field.visible || field.fixed) && field.key !== "actions",
  );
  const fieldValue = (item: ReceiptOption, key: string) => {
    if (key === "receipt")
      return (
        <>
          <ShortCode value={item.receiptCode} />
          <small>{item.purchaseOrderCode}</small>
        </>
      );
    if (key === "supplier")
      return (
        <>
          <b>{item.supplierName}</b>
          <small>{`${item.warehouseName} · ${item.lineCount} satır`}</small>
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

  return (
    <main className="purchase-invoice-entry list-v2 purchase-lv2-stack">
      <ListPageHeader
        title="Mal kabul faturası girişi"
        description="İşlenmiş mal kabullerini seçin; fatura kaydı sipariş ve stok kabulüyle bağlantısını korusun."
        count={loading && total === 0 ? null : total}
        countLabel="mal kabul fatura bekliyor"
      />
      <p className="pie-hint-line" title={LONG_HINT}>
        <Info size={14} aria-hidden="true" />
        <span>Yalnızca siparişe bağlı, işlenmiş mal kabuller listelenir.</span>
      </p>
      {error && (
        <div className="pie-alert" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>Kapat</button>
        </div>
      )}
      {notice && (
        <div className="pie-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Kapat</button>
        </div>
      )}
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
      />
      <div className="pie-workbench">
        <div className="pie-list-column">
          <div className="pie-table-wrap list-v2-list">
            <AdvancedDataGrid
              gridId="purchase-invoice-receipt-selection-v2"
              {...screenViewGridDefaults(visibleFields)}
              hideSearch
              externalPagination
              enableRowSelection={false}
              toolbarContainer={gridToolsSlot}
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
                    <td colSpan={visibleFields.length} className="pie-empty">
                      Mal kabuller yükleniyor…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={visibleFields.length} className="pie-empty">
                      {query
                        ? "Aramanızla eşleşen faturalanabilir mal kabul yok."
                        : "Faturalanabilir mal kabul yok. Önce satın alma siparişi üzerinden mal kabul kaydedin."}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      aria-selected={selected?.id === item.id}
                      onClick={() => selectReceipt(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectReceipt(item);
                        }
                      }}
                    >
                      {visibleFields.map((field) => (
                        <td
                          key={field.key}
                          className={field.key === "invoiceAmount" ? "pie-num" : undefined}
                        >
                          {fieldValue(item, field.key)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </AdvancedDataGrid>
          </div>
          <ListPagination
            page={page}
            total={total}
            pageSize={pageSize}
            loading={loading}
            onPageChange={setPage}
          />
        </div>
        <aside className="pie-record-detail" aria-label="Seçili mal kabul ayrıntıları">
          {selected ? (
            <>
              <span className="list-v2-kind">Seçili mal kabul</span>
              <div className="pie-detail-code">
                <h2 title={selected.receiptCode}>{shortCode(selected.receiptCode)}</h2>
                <button
                  type="button"
                  className="list-v2-icon-button pie-copy"
                  aria-label="Mal kabul numarasını kopyala"
                  title="Mal kabul numarasını kopyala"
                  onClick={() => void copyReceiptCode(selected.receiptCode)}
                >
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                </button>
              </div>
              <p className="pie-detail-sub">{`${selected.supplierName} · ${selected.purchaseOrderCode}`}</p>

              {selectedAmounts === undefined ? (
                <p className="pie-detail-muted">Satırlar yükleniyor…</p>
              ) : selectedAmounts === null ? (
                <p className="pie-detail-muted">Mal kabul satırları alınamadı.</p>
              ) : (
                <>
                  <table className="pie-lines">
                    <thead>
                      <tr>
                        <th>Stok</th>
                        <th className="pie-num">Mkt</th>
                        <th className="pie-num">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAmounts.lines.map((line, index) => (
                        <tr key={`${line.orderLineNumber}-${index}`}>
                          <td title={`${line.stockCode} · ${line.stockName}`}>{line.stockName}</td>
                          <td className="pie-num">{`${quantity(line.quantity)} ${line.unitCode}`}</td>
                          <td className="pie-num">{money(line.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <dl className="pie-totals">
                    <div>
                      <dt>Ara toplam</dt>
                      <dd>{money(selectedAmounts.net)}</dd>
                    </div>
                    <div>
                      <dt>KDV</dt>
                      <dd>{money(selectedAmounts.tax)}</dd>
                    </div>
                    <div className="is-grand">
                      <dt>Genel toplam</dt>
                      <dd>{`${money(selectedAmounts.total)} ${selected.currencyCode}`}</dd>
                    </div>
                  </dl>
                </>
              )}

              <form className="pie-form" onSubmit={createInvoice}>
                <label>
                  <span>Tedarikçi fatura no <RequiredMark /></span>
                  <input
                    className="pie-mono"
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
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                {dueDate && typeof termDays === "number" && (
                  <p className="pie-detail-muted pie-due">{`Vade ${dueDate} · ${termDays} gün`}</p>
                )}
                {accountingProfiles.length > 0 && (
                  <label>
                    <span>Vergi mevzuatı profili <RequiredMark /></span>
                    <select value={accountingProfileCode} onChange={(e) => setAccountingProfileCode(e.target.value)} required disabled={busy}>
                      <option value="">Profil seçin</option>
                      {accountingProfiles.map((profile) => <option key={profile.profileCode} value={profile.profileCode}>{profile.name} · {profile.jurisdictionCode} · {profile.reportingStandard}</option>)}
                    </select>
                  </label>
                )}
                <details className="pie-edoc">
                  <summary>Gelen e-belge bilgileri</summary>
                  <div>
                    <label><span>Belge UUID</span><input className="pie-mono" value={providerInvoiceUuid} onChange={(e) => setProviderInvoiceUuid(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" disabled={busy} /></label>
                    <label><span>Belge senaryosu</span><input value={providerScenario} onChange={(e) => setProviderScenario(e.target.value)} placeholder="TEMELFATURA / TICARIFATURA / EARSIVFATURA" disabled={busy} /></label>
                    <label><span>Belge tür kodu</span><input value={providerTypeCode} onChange={(e) => setProviderTypeCode(e.target.value)} placeholder="SATIS / IADE / TEVKIFAT" disabled={busy} /></label>
                    <label><span>Gönderen e-Fatura etiketi</span><input className="pie-mono" value={providerSenderAlias} onChange={(e) => setProviderSenderAlias(e.target.value)} disabled={busy} /></label>
                  </div>
                </details>
                {formError && (
                  <p className="pie-form-error" role="alert">{formError}</p>
                )}
                <button type="submit" className="pie-primary pie-submit" disabled={busy}>
                  {busy ? "Kaydediliyor…" : "Faturayı kaydet"}
                </button>
              </form>
            </>
          ) : (
            <p className="pie-record-empty">Fatura girmek için listeden bir mal kabul seçin.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
