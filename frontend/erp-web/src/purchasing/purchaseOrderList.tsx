import { useState, type ReactNode } from "react";
import { AlertTriangle, CircleDollarSign, Truck } from "lucide-react";
import type { PurchaseOrderDetail, PurchaseOrderSummary } from "../erp-types";
import { DocumentStatusFlow, type DocumentFlowStep } from "../document-page/DocumentStatusFlow";
import { purchaseInvoiceStatus, purchaseOrderStatus, purchaseReceiptStatus } from "../document-page/documentStatus";
import type { DocumentStatusTone } from "../document-page/DocumentSurface";
import { StatusTag, type StatusTagTone } from "../list-page/StatusTag";
import type { SummaryCard } from "../list-page/ListSummaryCards";
import { pageAmount, pageAmountHint } from "../sales/components/SalesListFooter";
import "./purchaseRequestList.css";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelRows,
  SalesPanelStats,
  panelMoney,
  type SalesChainItem,
} from "../sales/components/SalesListDetailPanel";

/*
 * Satınalma siparişleri (Faz 4, taslak 07): liste durum etiketi (Gecikmiş beklenen teslim tarihinden türetilir),
 * sipariş belgesinin durum akışı ve liste sağ paneli. Panel, sayfanın zaten getirdiği sipariş detayını kullanır.
 */

const tones: Record<string, StatusTagTone> = {
  PendingApproval: "warn",
  Open: "info",
  PartiallyReceived: "warn",
  Received: "ok",
  Cancelled: "off",
  Rejected: "off",
};

/** Mal bekleyen (açık / kısmen alınmış) sipariş, beklenen teslim tarihi bugünden önceyse gecikmiştir. */
export function isPurchaseOrderOverdue(order: { status: string; expectedReceiptDate: string | null }, today: string) {
  return (order.status === "Open" || order.status === "PartiallyReceived") && !!order.expectedReceiptDate && order.expectedReceiptDate < today;
}

/**
 * Sipariş listesi etiketi, tek etiket: Gecikmiş (kırmızı) önce gelir; sonra Onay bekliyor (turuncu), Açık (mavi),
 * Kısmen alındı (turuncu), Tam alındı (yeşil), İptal / Reddedildi (gri).
 */
export function purchaseOrderListTag(status: string, overdue = false): { tone: StatusTagTone; label: string } {
  if (overdue) return { tone: "bad", label: "Gecikmiş" };
  return { tone: tones[status] ?? "off", label: purchaseOrderStatus(status).label };
}

/** Status cell of the order list. */
export function PurchaseOrderTag({ status, overdue }: { status: string; overdue: boolean }) {
  const tag = purchaseOrderListTag(status, overdue);
  return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
}

const step = (key: string): DocumentFlowStep => ({ key, label: purchaseOrderStatus(key).label });

/** Sipariş: Onay bekliyor → Açık → Kısmen alındı → Tam alındı; İptal ya da Reddedildi akış dışı son durum. */
export function PurchaseOrderFlow({ status }: { status?: string }) {
  return (
    <DocumentStatusFlow
      steps={["PendingApproval", "Open", "PartiallyReceived", "Received"].map(step)}
      current={status}
      terminal={status === "Rejected" ? step("Rejected") : step("Cancelled")}
    />
  );
}

/**
 * Varsayılan sütun genişlikleri (kiracı genişliği olmayan alanlar): onay kutusu ve satır menüsüyle 1440'ta panel
 * kapalıyken, 1720'de panel açıkken yatay kaydırma olmadan sığar.
 */
export const PURCHASE_ORDER_LIST_WIDTHS: Record<string, number> = {
  code: 170, supplierName: 250, receivedProgress: 140, grandTotal: 140, status: 120, orderDate: 100,
  expectedReceiptDate: 110, targetWarehouseCode: 100, lineCount: 60, currencyCode: 70, actions: 56,
};

/**
 * Özet kartları, görünen sayfadan ("bu sayfa"): sipariş tutarı (iptal / ret hariç; farklı para birimleri toplanmaz),
 * mal bekleyen (Açık + Kısmen alındı) ve gecikmiş. Gecikmiş kartı mevcut Gecikmiş çipiyle süzer.
 */
export function purchaseOrderSummaryCards(
  rows: Array<{ status: string; grandTotal: number; currencyCode: string; expectedReceiptDate: string | null }>,
  today: string,
  loading: boolean,
  overdueFilter: boolean,
  onOverdueFilter: () => void,
): SummaryCard[] {
  const count = (value: number) => (loading ? "—" : value.toLocaleString("tr-TR"));
  const counted = rows.filter((row) => row.status !== "Cancelled" && row.status !== "Rejected");
  const pageHint: ReactNode = <span>bu sayfa</span>;
  return [
    {
      id: "order-total",
      label: "Sipariş tutarı",
      value: loading ? "—" : (pageAmount(counted) ?? "—"),
      icon: CircleDollarSign,
      hint: pageAmountHint(counted, <span>bu sayfa · iptaller hariç</span>),
    },
    {
      id: "order-waiting",
      label: "Mal bekleyen",
      value: count(rows.filter((row) => row.status === "Open" || row.status === "PartiallyReceived").length),
      icon: Truck,
      tone: "warn",
      hint: pageHint,
    },
    {
      id: "order-overdue",
      label: "Gecikmiş",
      value: count(rows.filter((row) => isPurchaseOrderOverdue(row, today)).length),
      icon: AlertTriangle,
      tone: "bad",
      hint: pageHint,
      filterActive: overdueFilter,
      onFilter: onOverdueFilter,
    },
  ];
}

/** Right-aligned `tabular-nums` columns of the order list. */
export const PURCHASE_ORDER_NUMBER_FIELDS: ReadonlySet<string> = new Set(["grandTotal", "lineCount", "receivedProgress"]);

/** Monospace document number columns (`nx-code`), as in the other Satış / Satınalma lists. */
export const PURCHASE_ORDER_CODE_FIELDS: ReadonlySet<string> = new Set(["code"]);

const date = (value: string | null | undefined) => (value ? value.slice(0, 10).split("-").reverse().join(".") : "—");
const quantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
const chainStatus = (status: { label: string; tone: DocumentStatusTone }): { tone: StatusTagTone; label: string } => ({
  label: status.label,
  tone: ({ success: "ok", info: "info", warning: "warn", danger: "bad", neutral: "off" } as const)[status.tone],
});

type PanelProps = {
  row: PurchaseOrderSummary;
  /** The order's detail (the page's order cache); null while loading or after an error. */
  detail: PurchaseOrderDetail | null;
  error: string;
  overdue: boolean;
  warehouseName?: string;
  onOpen: () => void;
  openDisabled?: boolean;
  onClose: () => void;
  takeFocus: () => boolean;
};

/** Sağ panel: tutarlar, tarihler, hedef depo, mal kabul ve fatura sayıları, belge zinciri ve satırların alınan miktarı. */
export function PurchaseOrderListPanel({ row, detail, error, overdue, warehouseName, onOpen, openDisabled, onClose, takeFocus }: PanelProps) {
  const [tab, setTab] = useState("summary");
  const tag = purchaseOrderListTag(row.status, overdue);
  const receipts = Array.isArray(detail?.receipts) ? detail.receipts : [];
  const posted = receipts.filter((receipt) => receipt.status === "Posted");
  const invoiced = posted.filter((receipt) => receipt.invoice).length;
  return (
    <SalesListDetailPanel
      label="Satınalma siparişi özeti"
      code={row.code}
      title={row.supplierName}
      tags={<StatusTag tone={tag.tone}>{tag.label}</StatusTag>}
      tabs={[
        { id: "summary", label: "Özet" },
        { id: "lines", label: "Satırlar" },
      ]}
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      openDisabled={openDisabled}
      onClose={onClose}
      takeFocus={takeFocus}
      loading={!detail}
      error={error}
    >
      {detail &&
        (tab === "lines" ? (
          <SalesPanelRows
            empty="Satır yok."
            rows={(Array.isArray(detail.lines) ? detail.lines : []).map((line) => ({
              key: String(line.lineNumber),
              label: line.stockName,
              meta: <span className="nx-code">{line.stockCode}</span>,
              value: (
                <>
                  <span>{quantity(line.receivedQuantity)}</span> / <span>{quantity(line.quantity)}</span> <span>{line.unitCode}</span>
                </>
              ),
            }))}
          />
        ) : (
          <>
            <SalesPanelStats
              items={[
                { label: "Genel toplam", value: panelMoney(detail.grandTotal, detail.currencyCode) },
                { label: "Ara toplam", value: panelMoney(detail.subtotal, detail.currencyCode) },
                { label: "İskonto", value: panelMoney(detail.discountTotal, detail.currencyCode) },
                { label: "KDV", value: panelMoney(detail.taxTotal, detail.currencyCode) },
              ]}
            />
            <SalesPanelFacts
              items={[
                { label: "Sipariş tarihi", value: date(row.orderDate) },
                {
                  label: "Beklenen teslim",
                  value: <span className={overdue ? "po-ld-overdue" : undefined}>{date(row.expectedReceiptDate)}</span>,
                },
                { label: "Hedef depo", value: warehouseName || "—" },
                { label: "Mal kabul", value: posted.length },
                { label: "Faturalanan", value: `${invoiced} / ${posted.length}` },
              ]}
            />
            <SalesPanelChain
              items={[
                { key: "self", code: row.code, label: "Bu sipariş", current: true, status: tag },
                ...receipts.flatMap((receipt): SalesChainItem[] => [
                  { key: `receipt-${receipt.id}`, code: receipt.code, label: "Mal kabul", status: chainStatus(purchaseReceiptStatus(receipt.status)) },
                  ...(receipt.invoice
                    ? [{ key: `invoice-${receipt.invoice.id}`, code: receipt.invoice.code, label: "Alış faturası", status: chainStatus(purchaseInvoiceStatus(receipt.invoice.status)) }]
                    : []),
                ]),
              ]}
            />
          </>
        ))}
    </SalesListDetailPanel>
  );
}

export function PurchaseOrderListEmpty() {
  return <SalesListDetailEmpty label="Satınalma siparişi özeti" text="Özetini görmek için listeden bir sipariş seçin." />;
}
