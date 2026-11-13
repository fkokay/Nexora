import { X } from "lucide-react";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { returnStatus } from "../../document-page/documentStatus";
import { formatReturnAmount, formatReturnDate, formatReturnQuantity, type ReturnDetail, type ReturnSideConfig } from "../types";

type Props = {
  detail: ReturnDetail;
  config: ReturnSideConfig;
  busy: boolean;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
  onOpenInvoice: () => void;
  onVoid: () => void;
};

/** Kayıtlı bir iadenin tam sayfa detayı: üst bilgiler, satırlar, toplamlar ve iptal. */
export function ReturnDetailSurface({ detail, config, busy, error, notice, onDismissError, onDismissNotice, onClose, onOpenInvoice, onVoid }: Props) {
  const posted = detail.status === "Posted";
  return (
    <DocumentSurface
      title={config.singular}
      code={detail.code}
      subtitle={detail.partyName}
      status={returnStatus(detail.status)}
      onClose={onClose}
      bodyClassName="modal ledger-modal sales-detail-modal sales-quote-detail-modal"
      actions={
        <>
          <button type="button" className="secondary" onClick={onOpenInvoice}>Faturayı aç</button>
          {posted && (
            <button type="button" className="secondary danger-action" disabled={busy} onClick={onVoid}>
              {busy ? "İptal ediliyor…" : "İadeyi iptal et"}
            </button>
          )}
        </>
      }
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
      <div className="sales-detail-content">
        <section className="sales-quote-readonly-form" aria-label="İade üst bilgileri">
          <label><span>{config.partyLabel}</span><input readOnly value={detail.partyName} /></label>
          <label><span>İade tarihi</span><input readOnly value={formatReturnDate(detail.returnDate)} /></label>
          <label><span>{config.warehouseLabel}</span><input readOnly value={detail.warehouseName} /></label>
          <label><span>Kaynak fatura</span><input readOnly value={detail.invoiceCode} /></label>
          <label><span>Para birimi</span><input readOnly value={detail.currencyCode} /></label>
          <label><span>Durum</span><input readOnly value={returnStatus(detail.status).label} /></label>
        </section>
        <section className="sales-quote-lines-section">
          <h3 className="sales-quote-section-title">İade Satırları</h3>
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
                {detail.lines.length === 0 && (
                  <tr><td colSpan={6} className="table-empty">Satır yok.</td></tr>
                )}
                {detail.lines.map((line) => (
                  <tr key={line.orderLineNumber}>
                    <td>
                      <b>{line.stockCode}</b>
                      <small className="cell-subtitle">{line.stockName}</small>
                    </td>
                    <td>
                      <span>{formatReturnQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                      {line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode && (
                        <small className="cell-subtitle"><span>{formatReturnQuantity(line.enteredQuantity)}</span> <span>{line.enteredUnitCode}</span></small>
                      )}
                    </td>
                    <td>{formatReturnAmount(line.unitPrice)}</td>
                    <td><span>{formatReturnAmount(line.discountAmount)}</span> <span>(%{line.discountPercent})</span></td>
                    <td><span>{formatReturnAmount(line.taxAmount)}</span> <span>(%{line.vatPercent})</span></td>
                    <td><b>{formatReturnAmount(line.lineTotal)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="order-grand-total quote-total-breakdown" aria-label="İade toplamları">
          <div><span>Ara toplam</span><span><span>{formatReturnAmount(detail.subtotal)}</span> <span>{detail.currencyCode}</span></span></div>
          <div><span>Toplam iskonto</span><span><span>{formatReturnAmount(detail.discountTotal)}</span> <span>{detail.currencyCode}</span></span></div>
          <div><span>KDV toplamı</span><span><span>{formatReturnAmount(detail.taxTotal)}</span> <span>{detail.currencyCode}</span></span></div>
          <div className="grand"><span>Genel toplam</span><span><span>{formatReturnAmount(detail.grandTotal)}</span> <span>{detail.currencyCode}</span></span></div>
        </section>
        <p className="muted">{posted ? config.effectNote : "Bu iade iptal edildi; stok ve cari hareketleri ters kayıtla geri alındı."}</p>
      </div>
    </DocumentSurface>
  );
}
