import { useState } from "react";
import type * as AppTypes from "../erp-types";
import { DocumentSurface } from "../document-page/DocumentSurface";
import { DocumentStatusFlow } from "../document-page/DocumentStatusFlow";
import { purchaseOrderStatus, purchaseReceiptStatus, purchaseInvoiceStatus } from "../document-page/documentStatus";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailLinesHead,
  formatDate,
  formatQuantity,
  type DetailChainItem,
} from "../document-detail/DocumentDetailLayout";
import { StatusTag } from "../list-page/StatusTag";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelChain,
  SalesPanelFacts,
  SalesPanelRows,
  type SalesChainItem,
} from "../sales/components/SalesListDetailPanel";
import { SALES_DETAIL_HINTS, SalesFooterStatus, SalesLinesMeta } from "../sales/salesDocumentDetail";

/*
 * Mal kabulleri (taslak 07 / 02): listenin sağ paneli ve kayıtlı mal kabulün belge ekranı. Liste satırında satır ve
 * fatura bilgisi yoktur; ikisi de bugünkü gibi bağlı siparişin ayrıntısından (`/api/purchasing/orders/{id}`, mal kabul
 * satırları ve faturası dahil) okunur.
 */

/** A row of `GET /api/purchasing/receipts/` (no lines, no invoice). */
export type PurchaseReceiptRow = {
  id: string;
  code: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  warehouseId: string;
  warehouseName: string;
  receiptDate: string;
  status: "Posted" | "Voided";
  lineCount: number;
  createdAt: string;
};

type OrderDetail = AppTypes.PurchaseOrderDetail;
type Receipt = AppTypes.PurchaseReceipt;

/** The receipt inside its order's detail answer. */
export const receiptOfOrder = (order: OrderDetail | null, id: string): Receipt | null =>
  order?.receipts?.find((receipt) => receipt.id === id) ?? null;

/** List / panel tag: Kabul edildi ok, İptal off. */
export function purchaseReceiptTag(status: string) {
  return <StatusTag tone={status === "Posted" ? "ok" : "off"}>{purchaseReceiptStatus(status).label}</StatusTag>;
}

/** Mal kabul: Kabul edildi; İptal akış dışı son durum (mal kabulün Taslak durumu yoktur). */
export function PurchaseReceiptFlow({ status }: { status: string }) {
  return (
    <DocumentStatusFlow
      steps={[{ key: "Posted", label: purchaseReceiptStatus("Posted").label }]}
      current={status}
      terminal={{ key: "Voided", label: purchaseReceiptStatus("Voided").label }}
    />
  );
}

const quantityOf = (line: { quantity: number; unitCode: string }) => `${formatQuantity(line.quantity)} ${line.unitCode}`;

const PANEL_TABS = [
  { id: "summary", label: "Özet" },
  { id: "lines", label: "Satırlar" },
];

/** Right-hand panel of the receipt list: order, warehouse, invoice link, chain and lines. */
export function PurchaseReceiptListPanel({
  row,
  order,
  error,
  onOpen,
  openDisabled,
  onClose,
  takeFocus,
}: {
  row: PurchaseReceiptRow;
  /** Detail of the row's order (null while loading). */
  order: OrderDetail | null;
  error: string;
  onOpen: () => void;
  openDisabled?: boolean;
  onClose: () => void;
  takeFocus: () => boolean;
}) {
  const [tab, setTab] = useState("summary");
  const receipt = receiptOfOrder(order, row.id);
  const invoice = receipt?.invoice ?? null;
  const chain: SalesChainItem[] = [
    { key: "order", code: row.purchaseOrderCode, label: "Satınalma siparişi" },
    { key: "self", code: row.code, label: "Bu mal kabul", current: true },
    ...(invoice ? [{ key: "invoice", code: invoice.code, label: "Alış faturası" }] : []),
  ];
  return (
    <SalesListDetailPanel
      label="Mal kabul özeti"
      code={row.code}
      title={order?.supplierName ?? ""}
      tags={purchaseReceiptTag(row.status)}
      tabs={PANEL_TABS}
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      openDisabled={openDisabled}
      onClose={onClose}
      takeFocus={takeFocus}
      loading={!order}
      error={error}
    >
      {order &&
        (tab === "lines" ? (
          <SalesPanelRows
            empty="Satır yok."
            rows={(receipt?.lines ?? []).map((line, index) => ({
              key: `${line.orderLineNumber}-${index}`,
              label: line.stockName,
              meta: <span className="nx-code">{line.stockCode}</span>,
              value: quantityOf(line),
            }))}
          />
        ) : (
          <>
            <SalesPanelFacts
              items={[
                { label: "Sipariş", value: <span className="nx-code">{row.purchaseOrderCode}</span> },
                { label: "Depo", value: row.warehouseName },
                { label: "Kabul tarihi", value: formatDate(row.receiptDate) },
                { label: "Satır sayısı", value: row.lineCount },
                {
                  label: "Alış faturası",
                  value: invoice ? (
                    <span className="nx-code">{invoice.code}</span>
                  ) : row.status === "Posted" ? (
                    "Henüz faturalanmadı"
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
            <SalesPanelChain items={chain} />
          </>
        ))}
    </SalesListDetailPanel>
  );
}

export function PurchaseReceiptListPanelEmpty() {
  return <SalesListDetailEmpty label="Mal kabul özeti" text="Özetini görmek için listeden bir mal kabul seçin." />;
}

/**
 * Kayıtlı mal kabulün belge ekranı (taslak 02): Kabul edildi / İptal akışı, üst bilgiler, satırlar ve bağlam
 * panelinde sipariş → mal kabul → alış faturası zinciri. "Alış faturasını aç" İşlemler menüsündedir (sayfa bağlar).
 */
export function PurchaseReceiptDocument({
  order,
  receipt,
  onClose,
  onOpenInvoice,
}: {
  order: OrderDetail;
  receipt: Receipt;
  onClose: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const lines = receipt.lines ?? [];
  const invoice = receipt.invoice;
  const chain: DetailChainItem[] = [
    { key: "order", code: order.code, label: "Satınalma siparişi", status: purchaseOrderStatus(order.status) },
    { key: "self", code: receipt.code, label: "Bu mal kabul", kind: "Mal kabul", current: true, status: purchaseReceiptStatus(receipt.status) },
    ...(invoice
      ? [{ key: "invoice", code: invoice.code, label: "Alış faturası", status: purchaseInvoiceStatus(invoice.status), onOpen: () => onOpenInvoice(invoice.id) }]
      : []),
  ];
  return (
    <DocumentSurface
      variant="detail"
      title="Mal kabul"
      code={receipt.code}
      subtitle={order.supplierName}
      status={purchaseReceiptStatus(receipt.status)}
      meta={<span>{formatDate(receipt.receiptDate)}</span>}
      statusFlow={<PurchaseReceiptFlow status={receipt.status} />}
      onClose={onClose}
      aside={
        <DetailContext title="Belge zinciri">
          <DetailChain items={chain} />
        </DetailContext>
      }
      hints={SALES_DETAIL_HINTS}
      footerStatus={<SalesFooterStatus lines={lines.length} />}
    >
      <div className="dd-box">
        <DetailInfoGrid
          label="Mal kabul bilgileri"
          items={[
            { label: "Satınalma siparişi", value: order.code },
            { label: "Tedarikçi", value: order.supplierName },
            { label: "Depo", value: receipt.warehouseName },
            { label: "Kabul tarihi", value: formatDate(receipt.receiptDate) },
            {
              label: "Alış faturası",
              value: invoice ? invoice.code : receipt.status === "Posted" ? "Henüz faturalanmadı" : "—",
            },
          ]}
        />
      </div>
      <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={lines.length} extra={receipt.warehouseName} />} />
        <div className="dd-lines-wrap">
          <table className="dd-lines" aria-label="Mal kabul satırları">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok kartı</th>
                <th className="dd-num">Sipariş satırı</th>
                <th className="dd-num">Kabul miktarı</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.orderLineNumber}-${index}`}>
                  <td className="dd-ix">{index + 1}</td>
                  <td className="dd-stock">
                    <b>{line.stockCode}</b>
                    <small>{line.stockName}</small>
                  </td>
                  <td className="dd-num">{line.orderLineNumber}</td>
                  <td className="dd-num">{quantityOf(line)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="dd-empty">Satır yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DocumentSurface>
  );
}
