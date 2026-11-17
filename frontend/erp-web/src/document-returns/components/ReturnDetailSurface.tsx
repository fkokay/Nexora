import { X } from "lucide-react";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { returnStatus } from "../../document-page/documentStatus";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailLinesFooter,
  DetailLinesHead,
  formatAmount,
} from "../../document-detail/DocumentDetailLayout";
import { ReturnFlow, SALES_DETAIL_HINTS, SalesFooterStatus, salesTotalRows, vatByRate } from "../../sales/salesDocumentDetail";
import { formatReturnAmount, formatReturnDate, formatReturnQuantity, type ReturnDetail, type ReturnSideConfig } from "../types";

type Props = {
  detail: ReturnDetail;
  config: ReturnSideConfig;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
  onOpenInvoice: () => void;
};

/**
 * Kayıtlı bir iadenin tam sayfa detayı (taslak 02): durum akışı, üst bilgiler, satır ızgarası, KDV oranına göre
 * toplamlar ve bağlam panelinde belge zinciri. Faturayı aç ve İadeyi iptal et İşlem Çubuğu'nun İşlemler menüsündedir.
 */
export function ReturnDetailSurface({ detail, config, error, notice, onDismissError, onDismissNotice, onClose, onOpenInvoice }: Props) {
  const posted = detail.status === "Posted";
  const purchase = config.invoicePage === "sales-purchase-invoices";
  const money = (value: number) => formatAmount(value, detail.currencyCode);
  const vat = vatByRate(
    detail.lines.map((line) => ({
      vatPercent: line.vatPercent,
      taxable: line.lineSubtotal !== undefined ? line.lineSubtotal - line.discountAmount : line.lineTotal - line.taxAmount,
      vat: line.taxAmount,
    })),
    { taxable: detail.subtotal - detail.discountTotal, vat: detail.taxTotal },
  );
  return (
    <DocumentSurface
      variant="detail"
      title={config.singular}
      code={detail.code}
      subtitle={detail.partyName}
      status={returnStatus(detail.status)}
      meta={<span>{formatReturnDate(detail.returnDate)}</span>}
      statusFlow={<ReturnFlow status={detail.status} />}
      onClose={onClose}
      aside={
        <DetailContext title="Belge zinciri">
          <DetailChain
            items={[
              { key: "invoice", code: detail.invoiceCode, label: purchase ? "Alış faturası" : "Satış faturası", onOpen: onOpenInvoice },
              { key: "self", code: detail.code, label: "Bu iade", kind: config.singular, current: true, status: returnStatus(detail.status) },
            ]}
          />
        </DetailContext>
      }
      hints={SALES_DETAIL_HINTS}
      footerStatus={<SalesFooterStatus lines={detail.lines.length} total={money(detail.grandTotal)} />}
    >
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={onDismissError}><X size={15} /></button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" aria-label="Kapat" onClick={onDismissNotice}><X size={15} /></button>
        </div>
      )}
      <div className="dd-box">
        <DetailInfoGrid
          label="İade üst bilgileri"
          items={[
            { label: "İade tarihi", value: formatReturnDate(detail.returnDate) },
            { label: config.warehouseLabel, value: detail.warehouseName },
            { label: "Kaynak fatura", value: detail.invoiceCode },
            { label: "Para birimi", value: detail.currencyCode },
          ]}
        />
      </div>
      <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={`${detail.lines.length} satır`} />
        <div className="dd-lines-wrap">
          <table className="dd-lines" aria-label="İade satırları">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok</th>
                <th className="dd-num">Miktar</th>
                <th className="dd-num">Birim fiyat</th>
                <th className="dd-num">İskonto</th>
                <th className="dd-num">KDV</th>
                <th className="dd-num">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.length === 0 && (
                <tr><td colSpan={7} className="dd-empty">Satır yok.</td></tr>
              )}
              {detail.lines.map((line, index) => (
                <tr key={line.orderLineNumber}>
                  <td className="dd-ix">{index + 1}</td>
                  <td className="dd-stock">
                    <b>{line.stockCode}</b>
                    <small>{line.stockName}</small>
                  </td>
                  <td className="dd-num">
                    <span>{formatReturnQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                    {line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode && (
                      <small><span>{formatReturnQuantity(line.enteredQuantity)}</span> <span>{line.enteredUnitCode}</span></small>
                    )}
                  </td>
                  <td className="dd-num">{formatReturnAmount(line.unitPrice)}</td>
                  <td className="dd-num">
                    {formatReturnAmount(line.discountAmount)}
                    <small>%{line.discountPercent}</small>
                  </td>
                  <td className="dd-num">
                    {formatReturnAmount(line.taxAmount)}
                    <small>%{line.vatPercent}</small>
                  </td>
                  <td className="dd-num">{formatReturnAmount(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DetailLinesFooter
          label="İade toplamları"
          aside={<p className="dd-muted">{posted ? config.effectNote : "Bu iade iptal edildi; stok ve cari hareketleri ters kayıtla geri alındı."}</p>}
          totals={salesTotalRows(detail, money, vat)}
        />
      </div>
    </DocumentSurface>
  );
}
