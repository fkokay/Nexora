import type { PurchaseInvoiceDetail, PurchaseInvoiceSummary } from "../erp-types";
import { StatusTag } from "../list-page/StatusTag";
import { PanelFrame, type SalesPanelControls } from "../sales/components/SalesListPanels";
import {
  SalesListDetailEmpty,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelLines,
  SalesPanelLinesPreview,
  SalesPanelRows,
  SalesPanelSection,
  SalesPanelStats,
  panelMoney,
  type SalesChainItem,
} from "../sales/components/SalesListDetailPanel";
import { salesListTag } from "../sales/salesListStatus";
import { purchaseInvoiceStatus } from "../document-page/documentStatus";
import { purchaseInvoiceListTag, purchaseInvoiceOverdueDays } from "./purchaseInvoiceStatus";

const date = (value: string | null | undefined) => (value ? value.slice(0, 10).split("-").reverse().join(".") : "—");
const paymentMethods: Record<string, string> = { Cash: "Nakit", "Bank transfer": "Havale / EFT", Card: "Kart", Check: "Çek" };
const TABS = [
  { id: "summary", label: "Özet" },
  { id: "lines", label: "Satırlar" },
  { id: "payments", label: "Ödemeler" },
];

export function PurchaseInvoiceListPanelEmpty() {
  return <SalesListDetailEmpty label="Alış faturası özeti" text="Özetini görmek için listeden bir alış faturası seçin." />;
}

/**
 * Right-hand panel of Satınalma Faturaları (taslak 07 ".det"): the document status and, beside it, the payment state;
 * Özet (Genel toplam, Kalan, Ödenen, Vade), the chain sipariş → mal kabul → fatura from the row's codes, the first
 * lines; Satırlar and Ödemeler from the invoice detail.
 */
export function PurchaseInvoiceListPanel({
  row,
  today,
  ...controls
}: SalesPanelControls<PurchaseInvoiceDetail> & { row: PurchaseInvoiceSummary; today: string }) {
  const tag = purchaseInvoiceListTag(row, today);
  const overdue = purchaseInvoiceOverdueDays(row, today);
  return (
    <PanelFrame
      {...controls}
      label="Alış faturası özeti"
      code={row.code}
      title={row.supplierName}
      tags={
        tag.key === "voided" ? (
          <StatusTag tone="off">{tag.label}</StatusTag>
        ) : (
          <>
            <StatusTag tone="info">{purchaseInvoiceStatus(row.status).label}</StatusTag>
            {tag.key !== "posted" && (
              <>
                {" "}
                <StatusTag tone={tag.tone}>{tag.key === "overdue" ? `${tag.label} · ${overdue} gün` : tag.label}</StatusTag>
              </>
            )}
          </>
        )
      }
      tabs={TABS}
      render={(tab, detail, showTab) => {
        const money = (value: number) => panelMoney(value, detail.currencyCode);
        // A voided invoice owes nothing; the API still returns its total as outstanding (same as the list cell).
        const kalan = (invoice: PurchaseInvoiceDetail) => (invoice.status === "Posted" ? money(invoice.outstandingAmount) : "—");
        const lines = (Array.isArray(detail.lines) ? detail.lines : []).map((line) => ({ key: line.id, ...line }));
        if (tab === "lines") return <SalesPanelLines currency={detail.currencyCode} lines={lines} />;
        if (tab === "payments") {
          const payments = Array.isArray(detail.payments) ? detail.payments : [];
          return (
            <>
              <SalesPanelFacts
                items={[
                  { label: "Ödenen", value: money(detail.paidAmount) },
                  { label: "Kalan", value: kalan(detail) },
                ]}
              />
              <SalesPanelSection title="Ödemeler">
                <SalesPanelRows
                  empty="Henüz ödeme yok."
                  rows={payments.map((payment) => ({
                    key: payment.id,
                    label: <span className="nx-code">{payment.code}</span>,
                    meta: (
                      <>
                        <span>{date(payment.paymentDate)}</span> · <span>{paymentMethods[payment.paymentMethod] ?? payment.paymentMethod}</span>
                        {payment.status !== "Posted" && (
                          <>
                            {" "}
                            · <span>İptal</span>
                          </>
                        )}
                      </>
                    ),
                    value: panelMoney(payment.amount, payment.currencyCode),
                  }))}
                />
              </SalesPanelSection>
            </>
          );
        }
        const chain: SalesChainItem[] = [];
        if (row.purchaseOrderCode) chain.push({ key: "order", code: row.purchaseOrderCode, label: "Satınalma siparişi" });
        if (row.receiptCode) chain.push({ key: "receipt", code: row.receiptCode, label: "Mal kabul" });
        chain.push({ key: "self", code: row.code, label: "Bu fatura", current: true });
        for (const item of Array.isArray(detail.returns) ? detail.returns : [])
          chain.push({ key: `return-${item.id}`, code: item.code, label: "Alış iadesi", status: salesListTag("return", item.status) });
        return (
          <>
            <SalesPanelStats
              items={[
                { label: "Genel toplam", value: money(detail.grandTotal) },
                { label: "Kalan", value: kalan(detail), tone: overdue > 0 ? "bad" : undefined },
                { label: "Ödenen", value: money(detail.paidAmount) },
                { label: "Vade", value: date(detail.dueDate) },
              ]}
            />
            <SalesPanelChain items={chain} />
            <SalesPanelLinesPreview lines={lines} currency={detail.currencyCode} onShowAll={() => showTab("lines")} />
          </>
        );
      }}
    />
  );
}
