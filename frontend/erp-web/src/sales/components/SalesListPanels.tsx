import { useState, type ReactNode } from "react";
import type {
  SalesDeliverySummary,
  SalesInvoiceDetail,
  SalesInvoiceSummary,
  SalesOrderDetail,
  SalesOrderSummary,
  SalesQuoteDetail,
  SalesQuoteSummary,
} from "../../erp-types";
import { StatusTag } from "../../list-page/StatusTag";
import type { ReturnDetail, ReturnListItem, ReturnSideConfig } from "../../document-returns/types";
import type { SalesRequestDetail, SalesRequestSummary } from "../../sales-customer-requests/types";
import { salesListTag, type SalesListKind } from "../salesListStatus";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelLines,
  SalesPanelLinesPreview,
  SalesPanelRows,
  SalesPanelSection,
  SalesPanelStats,
  panelMoney,
  type SalesChainItem,
} from "./SalesListDetailPanel";

/** What every sales list hands its panel: the hook's state and the page's Aç. */
export type SalesPanelControls<D> = {
  detail: D | null;
  error: string;
  onOpen: () => void;
  openDisabled?: boolean;
  onClose: () => void;
  takeFocus: () => boolean;
};

const date = (value: string | null | undefined) => (value ? value.slice(0, 10).split("-").reverse().join(".") : "—");
/** Lines of a detail answer; a partial answer without `lines` shows none. */
const linesOf = <L,>(detail: { lines?: L[] } | null) => (Array.isArray(detail?.lines) ? detail.lines : []);

function Tag({ kind, status }: { kind: SalesListKind; status: string }) {
  const tag = salesListTag(kind, status);
  return <StatusTag tone={tag.tone}>{tag.label}</StatusTag>;
}

type FrameProps<D> = SalesPanelControls<D> & {
  label: string;
  code: string;
  title: string;
  tags: ReactNode;
  tabs: Array<{ id: string; label: string }>;
  render: (tab: string, detail: D, showTab: (tab: string) => void) => ReactNode;
};

function PanelFrame<D>({ label, code, title, tags, tabs, render, detail, error, onOpen, openDisabled, onClose, takeFocus }: FrameProps<D>) {
  // Kept while the current row changes (the panel stays mounted), like the Stok Kartları panel.
  const [tab, setTab] = useState("summary");
  const active = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;
  return (
    <SalesListDetailPanel
      label={label}
      code={code}
      title={title}
      tags={tags}
      tabs={tabs}
      tab={active}
      onTabChange={setTab}
      onOpen={onOpen}
      openDisabled={openDisabled}
      onClose={onClose}
      takeFocus={takeFocus}
      loading={!detail}
      error={error}
    >
      {detail && render(active, detail, setTab)}
    </SalesListDetailPanel>
  );
}

const SUMMARY_TABS = [
  { id: "summary", label: "Özet" },
  { id: "lines", label: "Satırlar" },
];

/** The empty panel of each list (no row chosen). */
export function SalesListPanelEmpty({ kind }: { kind: "quote" | "order" | "invoice" | "delivery" | "request" | "return" }) {
  const texts = {
    quote: ["Satış teklifi özeti", "Özetini görmek için listeden bir teklif seçin."],
    order: ["Satış siparişi özeti", "Özetini görmek için listeden bir sipariş seçin."],
    invoice: ["Satış faturası özeti", "Özetini görmek için listeden bir fatura seçin."],
    delivery: ["Satış irsaliyesi özeti", "Özetini görmek için listeden bir irsaliye seçin."],
    request: ["Satış talebi özeti", "Özetini görmek için listeden bir talep seçin."],
    return: ["İade özeti", "Özetini görmek için listeden bir iade seçin."],
  }[kind];
  return <SalesListDetailEmpty label={texts[0]} text={texts[1]} />;
}

/** Ara toplam / İskonto / KDV / Genel toplam of a document detail. */
function amounts(detail: { grandTotal: number; subtotal: number; discountTotal: number; taxTotal: number; currencyCode: string }) {
  const money = (value: number) => panelMoney(value, detail.currencyCode);
  return [
    { label: "Genel toplam", value: money(detail.grandTotal) },
    { label: "Ara toplam", value: money(detail.subtotal) },
    { label: "İskonto", value: money(detail.discountTotal) },
    { label: "KDV", value: money(detail.taxTotal) },
  ];
}

export function QuoteListPanel({ row, ...controls }: SalesPanelControls<SalesQuoteDetail> & { row: SalesQuoteSummary }) {
  return (
    <PanelFrame
      {...controls}
      label="Satış teklifi özeti"
      code={row.code}
      title={row.customerName}
      tags={<Tag kind="quote" status={row.status} />}
      tabs={SUMMARY_TABS}
      render={(tab, detail, showTab) => {
        const lines = linesOf(detail).map((line) => ({ key: String(line.lineNumber), ...line }));
        if (tab === "lines") return <SalesPanelLines currency={detail.currencyCode} lines={lines} />;
        const chain: SalesChainItem[] = [];
        if (detail.salesRequestCode) chain.push({ key: "request", code: detail.salesRequestCode, label: "Satış talebi" });
        chain.push({ key: "self", code: row.code, label: "Bu teklif", current: true });
        if (row.salesOrderCode) chain.push({ key: "order", code: row.salesOrderCode, label: "Satış siparişi" });
        return (
          <>
            <SalesPanelStats items={amounts(detail)} />
            <SalesPanelFacts
              items={[
                { label: "Teklif tarihi", value: date(row.quoteDate) },
                { label: "Geçerlilik", value: date(row.validUntil) },
                { label: "Plasiyer", value: row.salespersonName || "—" },
                { label: "Revizyon", value: row.revisionNumber },
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

export function OrderListPanel({ row, ...controls }: SalesPanelControls<SalesOrderDetail> & { row: SalesOrderSummary }) {
  return (
    <PanelFrame
      {...controls}
      label="Satış siparişi özeti"
      code={row.code}
      title={row.customerName}
      tags={<Tag kind="order" status={row.status} />}
      tabs={SUMMARY_TABS}
      render={(tab, detail, showTab) => {
        const lines = linesOf(detail).map((line) => ({ key: String(line.lineNumber), ...line }));
        if (tab === "lines") return <SalesPanelLines currency={detail.currencyCode} lines={lines} />;
        const chain: SalesChainItem[] = [];
        if (row.quoteCode) chain.push({ key: "quote", code: row.quoteCode, label: "Satış teklifi" });
        chain.push({ key: "self", code: row.code, label: "Bu sipariş", current: true });
        return (
          <>
            <SalesPanelStats items={amounts(detail)} />
            <SalesPanelFacts
              items={[
                { label: "Sipariş tarihi", value: date(row.orderDate) },
                { label: "Teslim tarihi", value: date(row.requestedDeliveryDate) },
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

const paymentMethods: Record<string, string> = { Cash: "Nakit", "Bank transfer": "Havale / EFT", Card: "Kart", Check: "Çek" };

export function InvoiceListPanel({ row, ...controls }: SalesPanelControls<SalesInvoiceDetail> & { row: SalesInvoiceSummary }) {
  return (
    <PanelFrame
      {...controls}
      label="Satış faturası özeti"
      code={row.code}
      title={row.customerName}
      tags={<Tag kind="invoice" status={row.status} />}
      tabs={[...SUMMARY_TABS, { id: "collections", label: "Tahsilat" }]}
      render={(tab, detail, showTab) => {
        const money = (value: number) => panelMoney(value, detail.currencyCode);
        const lines = linesOf(detail).map((line) => ({ key: line.id, ...line }));
        if (tab === "lines") return <SalesPanelLines currency={detail.currencyCode} lines={lines} />;
        if (tab === "collections") {
          const collections = Array.isArray(detail.collections) ? detail.collections : [];
          return (
            <>
              <SalesPanelFacts
                items={[
                  { label: "Tahsil edilen", value: money(detail.paidAmount) },
                  { label: "İade edilen", value: money(detail.returnedAmount) },
                  { label: "Kalan", value: money(detail.outstandingAmount) },
                ]}
              />
              <SalesPanelSection title="Tahsilat">
                <SalesPanelRows
                  empty="Henüz tahsilat yok."
                  rows={collections.map((collection) => ({
                    key: collection.id,
                    label: <span className="nx-code">{collection.code}</span>,
                    meta: (
                      <>
                        <span>{date(collection.collectionDate)}</span> · <span>{paymentMethods[collection.paymentMethod] ?? collection.paymentMethod}</span>
                        {collection.status === "Voided" && (
                          <>
                            {" "}
                            · <span>İptal</span>
                          </>
                        )}
                      </>
                    ),
                    value: panelMoney(collection.amount, collection.currencyCode),
                  }))}
                />
              </SalesPanelSection>
            </>
          );
        }
        const chain: SalesChainItem[] = [];
        if (row.orderCode) chain.push({ key: "order", code: row.orderCode, label: "Satış siparişi" });
        if (row.deliveryCode) chain.push({ key: "delivery", code: row.deliveryCode, label: "Satış irsaliyesi" });
        chain.push({ key: "self", code: row.code, label: "Bu fatura", current: true });
        for (const item of Array.isArray(detail.returns) ? detail.returns : [])
          chain.push({ key: `return-${item.id}`, code: item.code, label: "Satış iadesi", status: salesListTag("return", item.status) });
        return (
          <>
            <SalesPanelStats
              items={[
                { label: "Genel toplam", value: money(detail.grandTotal) },
                // Neutral: without a due date an unpaid amount is not a warning.
                { label: "Kalan", value: money(detail.outstandingAmount) },
                { label: "Matrah", value: money(detail.subtotal - detail.discountTotal) },
                { label: "KDV", value: money(detail.taxTotal) },
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

type DeliveryDetail = {
  lines?: Array<{ orderLineNumber: number; stockCode: string; stockName: string; unitCode: string; quantity: number }>;
};

export function DeliveryListPanel({ row, ...controls }: SalesPanelControls<DeliveryDetail> & { row: SalesDeliverySummary }) {
  return (
    <PanelFrame
      {...controls}
      label="Satış irsaliyesi özeti"
      code={row.code}
      title={row.warehouseName}
      tags={<Tag kind="delivery" status={row.status} />}
      tabs={SUMMARY_TABS}
      render={(tab, detail) => {
        if (tab === "lines")
          return (
            <SalesPanelLines
              currency=""
              lines={linesOf(detail).map((line) => ({ key: String(line.orderLineNumber), ...line, lineTotal: undefined }))}
            />
          );
        const chain: SalesChainItem[] = [];
        if (row.orderCode) chain.push({ key: "order", code: row.orderCode, label: "Satış siparişi" });
        chain.push({ key: "self", code: row.code, label: "Bu irsaliye", current: true });
        // The list gives the invoice's status, not its number.
        if (row.invoiceStatus) chain.push({ key: "invoice", label: "Satış faturası", status: salesListTag("invoice", row.invoiceStatus) });
        return (
          <>
            <SalesPanelFacts
              items={[
                { label: "Sevk tarihi", value: date(row.deliveryDate) },
                { label: "Depo", value: row.warehouseName },
                { label: "Satır", value: linesOf(detail).length || row.lineCount },
              ]}
            />
            <SalesPanelChain items={chain} />
          </>
        );
      }}
    />
  );
}

export function RequestListPanel({ row, ...controls }: SalesPanelControls<SalesRequestDetail> & { row: SalesRequestSummary }) {
  return (
    <PanelFrame
      {...controls}
      label="Satış talebi özeti"
      code={row.code}
      title={row.customerName}
      tags={<Tag kind="request" status={row.status} />}
      tabs={SUMMARY_TABS}
      render={(tab, detail) => {
        if (tab === "lines")
          return (
            <SalesPanelLines
              currency=""
              lines={linesOf(detail).map((line) => ({ key: String(line.lineNumber), ...line, lineTotal: undefined }))}
            />
          );
        const chain: SalesChainItem[] = [{ key: "self", code: row.code, label: "Bu talep", current: true }];
        for (const quote of Array.isArray(detail.quotes) ? detail.quotes : [])
          chain.push({ key: quote.id, code: quote.code, label: "Satış teklifi", status: salesListTag("quote", quote.status) });
        return (
          <>
            <SalesPanelFacts
              items={[
                { label: "Talep tarihi", value: date(row.requestDate) },
                { label: "İhtiyaç tarihi", value: date(row.neededByDate) },
                ...(detail.description ? [{ label: "Açıklama", value: detail.description }] : []),
              ]}
            />
            <SalesPanelChain items={chain} />
          </>
        );
      }}
    />
  );
}

export function ReturnListPanel({
  row,
  config,
  ...controls
}: SalesPanelControls<ReturnDetail> & { row: ReturnListItem; config: ReturnSideConfig }) {
  const purchase = config.invoicePage === "sales-purchase-invoices";
  return (
    <PanelFrame
      {...controls}
      label="İade özeti"
      code={row.code}
      title={row.partyName}
      tags={<Tag kind="return" status={row.status} />}
      tabs={SUMMARY_TABS}
      render={(tab, detail, showTab) => {
        const lines = linesOf(detail).map((line) => ({ key: String(line.orderLineNumber), ...line }));
        if (tab === "lines") return <SalesPanelLines currency={detail.currencyCode} lines={lines} />;
        return (
          <>
            <SalesPanelStats items={amounts(detail)} />
            <SalesPanelFacts
              items={[
                { label: "İade tarihi", value: date(row.returnDate) },
                { label: "Depo", value: row.warehouseName },
              ]}
            />
            <SalesPanelChain
              items={[
                { key: "invoice", code: row.invoiceCode, label: purchase ? "Alış faturası" : "Satış faturası" },
                { key: "self", code: row.code, label: "Bu iade", current: true },
              ]}
            />
            <SalesPanelLinesPreview lines={lines} currency={detail.currencyCode} onShowAll={() => showTab("lines")} />
          </>
        );
      }}
    />
  );
}
