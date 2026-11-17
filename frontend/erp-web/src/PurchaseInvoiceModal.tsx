import React, { useEffect, useRef, useState } from "react";
import type * as AppTypes from "./erp-types";
import { api, localDateString } from "./erpApi";
import { Plus, Undo2, X } from "lucide-react";
import SearchableRecordPicker from "./SearchableRecordPicker";
import { confirmDialog } from "./confirmDialog";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "./record-form/RecordForm";
import "./purchasing-record-forms.css";
import { DocumentSurface } from "./document-page/DocumentSurface";
import { DocumentStatusBadge } from "./document-page/DocumentStatusBadge";
import { purchaseInvoiceStatus, returnStatus } from "./document-page/documentStatus";
import { PageCommandsSlot, documentOpenCommands } from "./commands/PageCommandsSlot";
import type { CommandSpec, MenuCommand, PageCommands } from "./commands/types";
import { PurchaseInvoiceFlow } from "./purchasing/purchaseDocumentDetail";
import { SALES_DETAIL_HINTS, SalesFooterStatus } from "./sales/salesDocumentDetail";
import SalesRowActionsMenu from "./sales/components/SalesRowActionsMenu";
import {
  DetailChain,
  DetailContext,
  DetailDrawer,
  DetailKeyValues,
  DetailInfoGrid,
  DetailLinesFooter,
  DetailSection,
  DetailTiles,
  daysFromToday,
  formatAmount,
  formatDate,
  formatQuantity,
  shortenMiddle,
  type DetailTotalLine,
} from "./document-detail/DocumentDetailLayout";
type FinancialAccount = AppTypes.FinancialAccount;
type PurchaseInvoiceDetail = AppTypes.PurchaseInvoiceDetail;
type AccountingTaxBreakdownLine = AppTypes.AccountingTaxBreakdownLine;
type StockItemUnitConversion = AppTypes.StockItemUnitConversion;
type SupplierPayment = AppTypes.SupplierPayment;
type SupplierReturn = AppTypes.SupplierReturn;
/** The API also returns the cash / bank account the payment was posted to. */
type PaymentWithAccount = SupplierPayment & { financialAccountName?: string | null };
type Warehouse = AppTypes.Warehouse;
type WarehouseLocationOption = AppTypes.WarehouseLocationOption;

function readInvoiceTaxBreakdown(value?: string): AccountingTaxBreakdownLine[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed as AccountingTaxBreakdownLine[] : [];
  } catch { return []; }
}

export type PurchaseInvoiceInitialAction = "payment" | "return" | "void";

export function PurchaseInvoiceModal({
  invoiceId,
  token,
  warehouses,
  onClose,
  onChanged,
  initialAction,
  newCommand,
}: {
  invoiceId: string;
  token: string;
  warehouses: Warehouse[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  /** Opened from a list row action: jump to the payment or return form, or start the void flow. */
  initialAction?: PurchaseInvoiceInitialAction;
  /** Yeni (F2) while the invoice is open; the list passes its own (receipt invoice entry). */
  newCommand?: CommandSpec;
}) {
  const today = localDateString();
  const [invoice, setInvoice] = useState<PurchaseInvoiceDetail | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [financeAccounts, setFinanceAccounts] = useState<FinancialAccount[]>(
      [],
    ),
    [financialAccountId, setFinancialAccountId] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [paymentDate, setPaymentDate] = useState(today),
    [amount, setAmount] = useState(""),
    [method, setMethod] =
      useState<SupplierPayment["paymentMethod"]>("Bank transfer"),
    [reference, setReference] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [returnWarehouseId, setReturnWarehouseId] = useState(
      warehouses[0]?.id || "",
    ),
    [returnDate, setReturnDate] = useState(today),
    [returnQuantities, setReturnQuantities] = useState<Record<string, string>>(
      {},
    ),
    [returnRequestId, setReturnRequestId] = useState(() => crypto.randomUUID()),
    [returnUnits, setReturnUnits] = useState<
      Record<string, StockItemUnitConversion[]>
    >({}),
    [enteredReturnUnits, setEnteredReturnUnits] = useState<
      Record<string, string>
    >({}),
    [returnLocations, setReturnLocations] = useState<WarehouseLocationOption[]>(
      [],
    ),
    [returnLocationIds, setReturnLocationIds] = useState<
      Record<string, string>
    >({});
  async function load() {
    setLoading(true);
    setError("");
    try {
      setInvoice(
        await api<PurchaseInvoiceDetail>(
          `/api/purchasing/invoices/${invoiceId}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void api<FinancialAccount[]>("/api/finance/accounts", token)
      .then(setFinanceAccounts)
      .catch((e) => setError((e as Error).message));
  }, [invoiceId, token]);
  /** Payment and return forms open in the right-side panel; only one at a time. */
  const [drawer, setDrawer] = useState<"payment" | "return" | null>(null);
  const returnEditor = drawer === "return";
  const canReturn = (current: PurchaseInvoiceDetail) =>
    current.status === "Posted" && warehouses.some((x) => x.isActive);
  const canPay = (current: PurchaseInvoiceDetail) =>
    current.status === "Posted" && current.outstandingAmount > 0;
  function openReturnPanel() {
    const warehouseId = warehouses.find((x) => x.isActive)?.id || "";
    if (!warehouseId) return;
    setError("");
    setReturnWarehouseId(warehouseId);
    void loadReturnLocations(warehouseId);
    setDrawer("return");
  }
  function openPaymentPanel() {
    setError("");
    setDrawer("payment");
  }
  const initialActionHandled = useRef(false);
  useEffect(() => {
    if (!invoice || !initialAction || initialActionHandled.current) return;
    initialActionHandled.current = true;
    if (invoice.status !== "Posted") return;
    if (initialAction === "void") {
      // voidInvoice keeps its own confirmation step.
      if (invoice.paidAmount <= 0) void voidInvoice();
      return;
    }
    if (initialAction === "return") openReturnPanel();
    if (initialAction === "payment" && canPay(invoice)) openPaymentPanel();
  }, [invoice]);
  /** The invoice detail carries no warehouse; the receipt's warehouse is read from its order when visible. */
  const [receiptWarehouseName, setReceiptWarehouseName] = useState<string | null>(null);
  useEffect(() => {
    if (!invoice?.purchaseOrderId) return;
    let active = true;
    void api<{ receipts?: { id: string; warehouseName: string }[] }>(
      `/api/purchasing/orders/${invoice.purchaseOrderId}`,
      token,
    )
      .then((order) => {
        if (active)
          setReceiptWarehouseName(
            order.receipts?.find((receipt) => receipt.id === invoice.purchaseReceiptId)?.warehouseName ?? null,
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [invoice?.purchaseOrderId, invoice?.purchaseReceiptId, token]);
  useEffect(() => {
    if (!invoice) return;
    let active = true;
    void Promise.all(
      invoice.lines.map(async (line) => {
        const result = await api<{ conversions: StockItemUnitConversion[] }>(
          `/api/stock/items/${line.stockItemId}/units`,
          token,
        );
        return [line.id, result.conversions] as const;
      }),
    )
      .then((rows) => {
        if (active) {
          setReturnUnits(Object.fromEntries(rows));
          setEnteredReturnUnits(
            Object.fromEntries(
              invoice.lines.map((line) => [line.id, line.unitCode]),
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
  }, [invoice?.id, token]);
  const eligibleAccounts = financeAccounts.filter(
    (a) =>
      a.isActive &&
      a.currencyCode === invoice?.currencyCode &&
      a.type === (method === "Cash" ? "Cash" : "Bank"),
  );
  async function createPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SupplierPayment>(
        `/api/purchasing/invoices/${invoice.id}/payments`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId,
            paymentDate,
            amount: Number(amount),
            paymentMethod: method,
            reference: reference || null,
            financialAccountId:
              method === "Cash" || method === "Bank transfer"
                ? financialAccountId
                : null,
          }),
        },
      );
      setRequestId(crypto.randomUUID());
      setAmount("");
      setReference("");
      setDrawer(null);
      setNotice("Tedarikçi ödemesi kaydedildi; cari borçtan düşüldü.");
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidPayment(payment: SupplierPayment) {
    if (
      !(await confirmDialog({
        title: "Ödeme iptal edilsin mi?",
        message: `${payment.code} ödemesi iptal edilecek. Tedarikçi cari hareketi ters kaydedilecek.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/purchasing/payments/${payment.id}/void`, token, {
        method: "POST",
      });
      setNotice(
        "Ödeme iptal edildi; tedarikçi borcu ters kayıtla yeniden açıldı.",
      );
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidInvoice() {
    if (
      !invoice ||
      !(await confirmDialog({
        title: "Alış faturası iptal edilsin mi?",
        message: `${invoice.code} alış faturası iptal edilecek. Cari borç ters kayıtla kapatılacak.`,
        tone: "danger",
        confirmLabel: "Faturayı iptal et",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/purchasing/invoices/${invoice.id}/void`, token, {
        method: "POST",
      });
      setNotice("Alış faturası iptal edildi; cari hareket ters kaydedildi.");
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadReturnLocations(warehouseId: string) {
    if (!warehouseId) {
      setReturnLocations([]);
      setReturnLocationIds({});
      return;
    }
    setReturnLocationIds({});
    try {
      setReturnLocations(
        (
          await api<WarehouseLocationOption[]>(
            `/api/warehouses/${warehouseId}/locations`,
            token,
          )
        ).filter((location) => location.isActive),
      );
      setReturnLocationIds({});
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    const lines = invoice.lines
      .map((line) => ({
        purchaseInvoiceLineId: line.id,
        quantity: Number(returnQuantities[line.id] || 0),
        unitCode: enteredReturnUnits[line.id] || line.unitCode,
        storageLocationId: returnLocationIds[line.id] || null,
      }))
      .filter((x) => x.quantity > 0);
    if (!lines.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<SupplierReturn>(
        `/api/purchasing/invoices/${invoice.id}/returns`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId: returnRequestId,
            warehouseId: returnWarehouseId,
            returnDate,
            lines,
          }),
        },
      );
      setReturnRequestId(crypto.randomUUID());
      setReturnQuantities({});
      setReturnLocationIds({});
      setDrawer(null);
      setNotice(
        "Alış iadesi kaydedildi; stoktan düşüldü ve tedarikçi borcu azaltıldı.",
      );
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidReturn(item: SupplierReturn) {
    if (
      !(await confirmDialog({
        title: "Alış iadesi iptal edilsin mi?",
        message: `${item.code} alış iadesi iptal edilecek. Stok ve cari hareketleri ters kaydedilecek.`,
        tone: "danger",
        confirmLabel: "İptal et",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/purchasing/returns/${item.id}/void`, token, {
        method: "POST",
      });
      setNotice(
        "Alış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.",
      );
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const currency = invoice?.currencyCode ?? "";
  const money = (value: number) => formatAmount(value, currency);
  const methodName = (value: SupplierPayment["paymentMethod"]) =>
    value === "Bank transfer" ? "Havale / EFT" : value === "Cash" ? "Nakit" : value === "Card" ? "Kart" : "Çek";
  const totals: DetailTotalLine[] = [];
  if (invoice) {
    // The invoice breakdown is aggregated by tax code: the "VAT" row merges all VAT rates, so VAT is
    // grouped per rate from the lines; other rows are profile taxes (additive or withholding).
    // Backend: taxTotal = VAT + additive taxes; grandTotal = subtotal − discount + taxTotal − withholding.
    const isVat = (tax: AccountingTaxBreakdownLine) => tax.code === "VAT" || tax.code === "KDV";
    const profileTaxes = readInvoiceTaxBreakdown(invoice.taxBreakdownJson).filter((tax) => !isVat(tax));
    const additive = profileTaxes.filter((tax) => tax.treatment !== "Withholding");
    const withholding = profileTaxes.filter((tax) => tax.treatment === "Withholding");
    const sum = (rows: { amount: number }[]) => rows.reduce((total, row) => total + row.amount, 0);
    const vatTotal = invoice.taxTotal - sum(additive);
    const vatGroups = new Map<number, number>();
    invoice.lines.forEach((line) => {
      const lineVat = readInvoiceTaxBreakdown(line.taxBreakdownJson).find(isVat)?.amount ??
        Math.round((line.lineSubtotal - line.discountAmount) * line.vatPercent) / 100;
      vatGroups.set(line.vatPercent, (vatGroups.get(line.vatPercent) ?? 0) + lineVat);
    });
    const groupedVat = [...vatGroups.entries()].filter(([rate]) => rate > 0).sort(([a], [b]) => b - a);
    const vatReconciles =
      Math.abs(groupedVat.reduce((total, [, amount]) => total + amount, 0) - vatTotal) <= 0.01 * Math.max(1, invoice.lines.length);
    totals.push({ label: "Ara toplam", value: money(invoice.subtotal), key: "subtotal" });
    if (invoice.discountTotal > 0)
      totals.push({ label: "İskonto", value: `−${money(invoice.discountTotal)}`, emphasis: "negative", key: "discount" });
    if (!vatReconciles || vatTotal < 0) {
      // Older or unexpected breakdowns: show the VAT part of the stored tax total as one line.
      totals.push({ label: "KDV", value: money(vatTotal), key: "vat" });
    } else if (groupedVat.length > 0) {
      groupedVat.forEach(([rate, amount]) =>
        totals.push({ label: `KDV %${rate}`, value: money(amount), key: `vat-${rate}` }),
      );
    } else if (vatTotal > 0) {
      totals.push({ label: "KDV", value: money(vatTotal), key: "vat" });
    }
    additive.forEach((tax, index) =>
      totals.push({ label: `${tax.name} %${tax.rate}`, value: money(tax.amount), key: `add-${tax.code}-${index}` }),
    );
    withholding.forEach((tax, index) =>
      totals.push({
        label: `${tax.name} %${tax.rate} (tevkifat)`,
        value: `−${money(tax.amount)}`,
        emphasis: "negative",
        key: `wh-${tax.code}-${index}`,
      }),
    );
    totals.push({ label: "Genel toplam", value: money(invoice.grandTotal), emphasis: "grand", key: "grand" });
  }
  const dueDays = invoice ? daysFromToday(invoice.dueDate) : 0;
  const settled = !!invoice && invoice.status === "Posted" && invoice.outstandingAmount <= 0;
  const paidShare = invoice && invoice.grandTotal > 0 ? invoice.paidAmount / invoice.grandTotal : 0;
  const drawerError = drawer ? error : "";
  // Action bar while the invoice is open: Excel / Filtre act on the document (hidden list rule), Yenile reloads it. A
  // posted invoice is cancelled with a reversal, never deleted; the header's former buttons are İşlemler items.
  const commands: PageCommands = documentOpenCommands(() => load());
  if (newCommand) commands.new = newCommand;
  if (invoice) {
    commands.delete = {
      disabledReason:
        invoice.status === "Posted" ? "İşlenmiş belge silinemez — İşlemler › Faturayı iptal et" : "İptal edilmiş belge silinemez",
    };
    if (invoice.status === "Posted") {
      const busyReason = busy ? "Kaydediliyor…" : undefined;
      const more: MenuCommand[] = [];
      if (canPay(invoice)) more.push({ id: "purchase-invoice-payment", label: "Ödeme ekle", disabledReason: busyReason, run: openPaymentPanel });
      if (canReturn(invoice)) more.push({ id: "purchase-invoice-return", label: "İade oluştur", disabledReason: busyReason, run: openReturnPanel });
      more.push({
        id: "purchase-invoice-void",
        label: "Faturayı iptal et (ters kayıt)",
        disabledReason: busyReason ?? (invoice.paidAmount > 0 ? "İptal için önce ödemeleri iptal edin." : undefined),
        run: () => voidInvoice(),
      });
      commands.more = more;
    }
  }
  return (
    <DocumentSurface
      variant="detail"
      title="Alış faturası"
      eyebrow="Alış faturası"
      code={invoice?.code}
      closeLabel="Geri"
      subtitle={invoice?.supplierName || (loading ? "Yükleniyor…" : undefined)}
      status={invoice ? purchaseInvoiceStatus(invoice.status) : undefined}
      statusFlow={invoice && <PurchaseInvoiceFlow status={invoice.status} />}
      onClose={onClose}
      aside={
        invoice && (
          <>
            <DetailContext title="Belge zinciri">
              <DetailChain
                items={[
                  ...(invoice.purchaseOrderCode ? [{ key: "order", code: invoice.purchaseOrderCode, label: "Satınalma siparişi" }] : []),
                  ...(invoice.receiptCode ? [{ key: "receipt", code: invoice.receiptCode, label: "Mal kabul" }] : []),
                  { key: "self", code: invoice.code, label: "Bu fatura", kind: "Alış faturası", current: true, status: purchaseInvoiceStatus(invoice.status) },
                  ...invoice.returns.map((item) => ({
                    key: `return-${item.id}`,
                    code: item.code,
                    label: "Alış iadesi",
                    meta: formatDate(item.returnDate),
                    status: returnStatus(item.status),
                  })),
                ]}
              />
            </DetailContext>
            <DetailContext title="Tedarikçi">
              <DetailKeyValues items={[{ label: "Unvan", value: invoice.supplierName }]} />
            </DetailContext>
          </>
        )
      }
      hints={SALES_DETAIL_HINTS}
      footerStatus={invoice && <SalesFooterStatus lines={invoice.lines.length} total={money(invoice.grandTotal)} />}
    >
      <PageCommandsSlot commands={commands} />
      {error && !drawer && (
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
      {loading && !invoice ? (
        <div className="dd-loading">Fatura yükleniyor…</div>
      ) : (
        invoice && (
          <>
            <DetailTiles
              label="Fatura özeti"
              items={[
                { label: "Fatura toplamı", value: money(invoice.grandTotal) },
                { label: "Ödenen", value: money(invoice.paidAmount) },
                {
                  label: "Kalan",
                  value: money(invoice.outstandingAmount),
                  tone: invoice.status === "Posted" && invoice.outstandingAmount > 0 ? "warning" : "default",
                  progress: paidShare,
                  progressLabel: "Ödenen oranı",
                },
                {
                  label: "Vade",
                  value: formatDate(invoice.dueDate),
                  tone: invoice.status !== "Posted" ? "muted" : settled ? "success" : dueDays < 0 ? "danger" : "default",
                  hint:
                    invoice.status !== "Posted"
                      ? "İptal edildi"
                      : settled
                        ? "Ödendi"
                        : dueDays < 0
                          ? `${-dueDays} gün gecikti`
                          : dueDays === 0
                            ? "Bugün"
                            : `${dueDays} gün kaldı`,
                },
              ]}
            />
            <div className="dd-box">
              <DetailInfoGrid
                label="Fatura bilgileri"
                items={[
                  { label: "Fatura tarihi", value: formatDate(invoice.invoiceDate) },
                  { label: "Sipariş", value: invoice.purchaseOrderCode || "—" },
                  {
                    label: "Mal kabul",
                    value: invoice.receiptCode ? shortenMiddle(invoice.receiptCode) : "—",
                    title: invoice.receiptCode || undefined,
                  },
                  { label: "Depo", value: receiptWarehouseName || "—" },
                  {
                    label: "Vergi profili",
                    value: invoice.accountingProfileCode || <span className="dd-muted">Belirtilmemiş</span>,
                  },
                  ...(invoice.providerInvoiceUuid || invoice.providerScenario || invoice.providerInvoiceTypeCode || invoice.providerSenderAlias
                    ? [
                        {
                          label: "Gelen e-belge",
                          value: `${invoice.providerScenario || "senaryo yok"} · ${invoice.providerInvoiceTypeCode || "tür yok"}`,
                          title: [
                            invoice.providerInvoiceUuid && `UUID ${invoice.providerInvoiceUuid}`,
                            invoice.providerSenderAlias && `Gönderen etiketi ${invoice.providerSenderAlias}`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
            <div className="dd-box">
              <div className="dd-lines-wrap">
                <table className="dd-lines" aria-label="Fatura satırları">
                  <thead>
                    <tr>
                      <th>Stok</th>
                      <th className="dd-num">Miktar</th>
                      <th className="dd-num">Birim fiyat</th>
                      <th className="dd-num">İskonto</th>
                      <th className="dd-num">KDV</th>
                      <th className="dd-num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="dd-stock">
                          <b>{line.stockCode}</b>
                          <small>{line.stockName}</small>
                        </td>
                        <td className="dd-num">
                          {formatQuantity(line.quantity)} {line.unitCode}
                        </td>
                        <td className="dd-num">
                          {line.unitPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
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
                    ))}
                  </tbody>
                </table>
              </div>
              <DetailLinesFooter label="Fatura toplamları" totals={totals} />
            </div>
            <DetailSection
              title="Ödemeler"
              count={invoice.payments.length}
              actions={
                canPay(invoice) && (
                  <button type="button" className="secondary" disabled={busy} onClick={openPaymentPanel}>
                    <Plus size={14} aria-hidden="true" /> Ödeme ekle
                  </button>
                )
              }
            >
              {invoice.payments.length === 0 ? (
                <p className="dd-empty">Henüz ödeme yok.</p>
              ) : (
                <div className="dd-lines-wrap">
                  <table className="dd-lines" aria-label="Tedarikçi ödemeleri">
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>Yöntem</th>
                        <th>Hesap</th>
                        <th>Referans</th>
                        <th className="dd-num">Tutar</th>
                        <th className="dd-menu">
                          <span className="dd-sr">İşlemler</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.payments.map((payment) => {
                        const voided = payment.status !== "Posted";
                        return (
                          <tr key={payment.id} className={voided ? "is-voided" : undefined}>
                            <td>
                              {formatDate(payment.paymentDate)}
                              <small>
                                {payment.code}
                                {voided ? " · İptal" : ""}
                              </small>
                            </td>
                            <td>{methodName(payment.paymentMethod)}</td>
                            <td>{(payment as PaymentWithAccount).financialAccountName || "—"}</td>
                            <td>{payment.reference || "—"}</td>
                            <td className="dd-num">{formatAmount(payment.amount, payment.currencyCode)}</td>
                            <td className="dd-menu">
                              {!voided && (
                                <SalesRowActionsMenu label={payment.code}>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="sales-row-menu-item danger-action"
                                    disabled={busy}
                                    onClick={() => void voidPayment(payment)}
                                  >
                                    Ödemeyi iptal et
                                  </button>
                                </SalesRowActionsMenu>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailSection>
            <DetailSection
              title="İadeler"
              count={invoice.returns.length}
              actions={
                canReturn(invoice) && (
                  <button type="button" className="secondary" disabled={busy} onClick={openReturnPanel}>
                    <Undo2 size={14} aria-hidden="true" /> İade oluştur
                  </button>
                )
              }
            >
              {invoice.returns.length === 0 ? (
                <p className="dd-empty">
                  Bu faturadan iade yapılmadı. İade, faturalanan miktarı ve depodaki stoğu aşamaz.
                </p>
              ) : (
                <div className="dd-lines-wrap">
                  <table className="dd-lines" aria-label="Alış iadeleri">
                    <thead>
                      <tr>
                        <th>İade no</th>
                        <th>Tarih</th>
                        <th>Depo</th>
                        <th className="dd-num">Satır</th>
                        <th className="dd-num">Tutar</th>
                        <th>Durum</th>
                        <th className="dd-menu">
                          <span className="dd-sr">İşlemler</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.returns.map((item) => (
                        <tr key={item.id} className={item.status !== "Posted" ? "is-voided" : undefined}>
                          <td>
                            <b>{item.code}</b>
                          </td>
                          <td>{formatDate(item.returnDate)}</td>
                          <td>{item.warehouseName}</td>
                          <td className="dd-num">{item.lineCount}</td>
                          <td className="dd-num">{money(item.grandTotal)}</td>
                          <td>
                            <DocumentStatusBadge
                              status={item.status === "Posted" ? { label: "İşlendi", tone: "success" } : { label: "İptal", tone: "danger" }}
                            />
                          </td>
                          <td className="dd-menu">
                            {item.status === "Posted" && (
                              <SalesRowActionsMenu label={item.code}>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="sales-row-menu-item danger-action"
                                  disabled={busy}
                                  onClick={() => void voidReturn(item)}
                                >
                                  İadeyi iptal et
                                </button>
                              </SalesRowActionsMenu>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailSection>
            <DetailDrawer open={returnEditor} label="Alış iadesi" onClose={() => setDrawer(null)}>
              <RecordFormPage
                variant="dialog"
                className={`prf-embedded prf-return-form${
                  !returnWarehouseId ||
                  !invoice.lines.some((line) => Number(returnQuantities[line.id] || 0) > 0)
                    ? " prf-save-blocked"
                    : ""
                }`}
                title="Alış İadesi"
                mode="create"
                busy={busy}
                saveLabel="İadeyi kaydet"
                onSubmit={createReturn}
                onCancel={() => setDrawer(null)}
                error={drawerError}
                onDismissError={() => setError("")}
                status={<span>İade, tedarikçi cari borcunu azaltır.</span>}
              >
                <RecordFormGroup title="İade Kimliği" bodyClassName="rf-identity prf-identity-2">
                  <label>
                    <span>İade tarihi <RequiredMark /></span>
                    <input
                      className="rf-must"
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Çıkış deposu <RequiredMark /></span>
                    <SearchableRecordPicker
                      options={warehouses
                        .filter((x) => x.isActive)
                        .map((x) => ({
                          id: x.id,
                          label: `${x.code} · ${x.name}`,
                        }))}
                      selectedId={returnWarehouseId}
                      onSelect={(id) => {
                        setReturnWarehouseId(id);
                        void loadReturnLocations(id);
                      }}
                      title="Çıkış deposu seçin"
                      placeholder="Depo seçin"
                      searchPlaceholder="Depo kodu veya adıyla ara"
                      emptyMessage="Aramanızla eşleşen aktif depo bulunamadı."
                      required
                    />
                  </label>
                </RecordFormGroup>
                <RecordFormGroup title="İade Satırları">
                  <div className="ledger-list">
                    <table className="customer-table">
                      <thead>
                        <tr>
                          <th>Stok</th>
                          <th>Fatura miktarı</th>
                          <th>İade edilebilir</th>
                          <th>İade miktarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.lines.map((line) => {
                          const returned = invoice.returns
                            .filter((r) => r.status === "Posted")
                            .flatMap((r) => r.lines)
                            .filter((r) => r.purchaseInvoiceLineId === line.id)
                            .reduce((sum, r) => sum + r.quantity, 0);
                          const remaining = Math.max(0, line.quantity - returned);
                          return (
                            <tr key={line.id}>
                              <td>
                                <b>{line.stockCode}</b>
                                <small className="cell-subtitle">{line.stockName}</small>
                              </td>
                              <td>
                                {formatQuantity(line.quantity)} {line.unitCode}
                              </td>
                              <td>{formatQuantity(remaining)}</td>
                              <td>
                                <div className="prf-line-controls">
                                  <select
                                    aria-label={`${line.stockCode} alış iade birimi`}
                                    value={enteredReturnUnits[line.id] || line.unitCode}
                                    onChange={(e) =>
                                      setEnteredReturnUnits((current) => ({
                                        ...current,
                                        [line.id]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value={line.unitCode}>{line.unitCode}</option>
                                    {(returnUnits[line.id] || [])
                                      .filter((u) => u.isActive && u.unitCode !== line.unitCode)
                                      .map((u) => (
                                        <option key={u.id} value={u.unitCode}>
                                          {u.unitCode}
                                        </option>
                                      ))}
                                  </select>
                                  <input
                                    className="rf-num"
                                    aria-label={`${line.stockCode} alış iade miktarı`}
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={returnQuantities[line.id] || ""}
                                    onChange={(e) =>
                                      setReturnQuantities((current) => ({
                                        ...current,
                                        [line.id]: e.target.value,
                                      }))
                                    }
                                  />
                                  <select
                                    aria-label={`${line.stockCode} alış iade konumu`}
                                    value={returnLocationIds[line.id] || ""}
                                    onChange={(e) =>
                                      setReturnLocationIds((current) => ({
                                        ...current,
                                        [line.id]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Depo düzeyi</option>
                                    {returnLocations.map((location) => (
                                      <option key={location.id} value={location.id}>
                                        {location.code} · {location.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </RecordFormGroup>
              </RecordFormPage>
            </DetailDrawer>
            <DetailDrawer
              open={drawer === "payment" && canPay(invoice)}
              label="Tedarikçi ödemesi"
              onClose={() => setDrawer(null)}
            >
              <RecordFormPage
                variant="dialog"
                className={`prf-embedded prf-payment-form${
                  (method === "Cash" || method === "Bank transfer") && !eligibleAccounts.length
                    ? " prf-save-blocked"
                    : ""
                }`}
                title="Tedarikçi Ödemesi"
                mode="create"
                busy={busy}
                saveLabel="Ödeme kaydet"
                onSubmit={createPayment}
                onCancel={() => setDrawer(null)}
                error={drawerError}
                onDismissError={() => setError("")}
                status={
                  <span>
                    En fazla {money(invoice.outstandingAmount)} ödenebilir.
                  </span>
                }
              >
                <RecordFormGroup title="Ödeme Kimliği" bodyClassName="rf-identity prf-identity-2">
                  <label>
                    <span>Ödeme tarihi <RequiredMark /></span>
                    <input
                      className="rf-must"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Tutar ({invoice.currencyCode}) <RequiredMark /></span>
                    <input
                      className="rf-must rf-num"
                      type="number"
                      min="0.01"
                      max={invoice.outstandingAmount}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Ödeme yöntemi
                    <select
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value as SupplierPayment["paymentMethod"]);
                        setFinancialAccountId("");
                      }}
                    >
                      <option value="Bank transfer">Havale / EFT</option>
                      <option value="Cash">Nakit</option>
                      <option value="Card">Kart</option>
                      <option value="Check">Çek</option>
                    </select>
                  </label>
                  <label>
                    <span>
                      Referans <span className="optional-label">İsteğe bağlı</span>
                    </span>
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      maxLength={100}
                      placeholder="Dekont veya işlem numarası"
                    />
                  </label>
                </RecordFormGroup>
                {(method === "Cash" || method === "Bank transfer") && (
                  <RecordFormGroup title="Kasa / Banka Hesabı" bodyClassName="rf-pair">
                    <label>
                      <span>
                        {method === "Cash" ? "Kasa hesabı" : "Banka hesabı"}
                        <RequiredMark />
                      </span>
                      <select
                        className="rf-must"
                        value={financialAccountId}
                        onChange={(e) => setFinancialAccountId(e.target.value)}
                        required
                      >
                        <option value="">Hesap seçin</option>
                        {eligibleAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name} ({formatAmount(a.balance, a.currencyCode)})
                          </option>
                        ))}
                      </select>
                    </label>
                    {eligibleAccounts.length === 0 && (
                      <span className="optional-label">
                        Bu dövizde aktif hesap yok. Önce Finans ekranından hesap açın.
                      </span>
                    )}
                  </RecordFormGroup>
                )}
              </RecordFormPage>
            </DetailDrawer>
          </>
        )
      )}
    </DocumentSurface>
  );
}
