import { X } from "lucide-react";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { DocumentStatusBadge } from "../../document-page/DocumentStatusBadge";
import { salesQuoteStatus, salesRequestStatus } from "../../document-page/documentStatus";
import { formatRequestAmount, formatRequestDate, formatRequestQuantity, type SalesRequestDetail } from "../types";

type Props = {
  detail: SalesRequestDetail;
  busy: boolean;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
  onCreateQuote: () => void;
  onCancelRequest: () => void;
};

/** Kayıtlı bir satış talebinin tam sayfa detayı: üst bilgiler, satırlar, bağlı teklifler. */
export function SalesRequestDetailSurface({ detail, busy, error, notice, onDismissError, onDismissNotice, onClose, onCreateQuote, onCancelRequest }: Props) {
  const cancelled = detail.status === "Cancelled";
  return (
    <DocumentSurface
      title="Satış talebi"
      code={detail.code}
      subtitle={detail.customerName}
      status={salesRequestStatus(detail.status)}
      onClose={onClose}
      bodyClassName="modal ledger-modal sales-detail-modal sales-quote-detail-modal"
      actions={
        <>
          {!cancelled && (
            <button type="button" className="primary" disabled={busy} onClick={onCreateQuote}>Teklif hazırla</button>
          )}
          {detail.status === "Open" && (
            <button type="button" className="secondary danger-action" disabled={busy} onClick={onCancelRequest}>
              {busy ? "İptal ediliyor…" : "Talebi iptal et"}
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
        <section className="sales-quote-readonly-form" aria-label="Talep üst bilgileri">
          <label><span>Müşteri</span><input readOnly value={detail.customerName} /></label>
          <label><span>Talep tarihi</span><input readOnly value={formatRequestDate(detail.requestDate)} /></label>
          <label><span>İhtiyaç tarihi</span><input readOnly value={formatRequestDate(detail.neededByDate)} /></label>
          <label><span>Para birimi</span><input readOnly value={detail.currencyCode} /></label>
          <label><span>Durum</span><input readOnly value={salesRequestStatus(detail.status).label} /></label>
          {cancelled && <label><span>İptal gerekçesi</span><input readOnly value={detail.cancelReason || "—"} /></label>}
        </section>
        {detail.description && (
          <section className="sales-quote-lines-section">
            <h3 className="sales-quote-section-title">Açıklama</h3>
            <p className="quote-notes">{detail.description}</p>
          </section>
        )}
        <section className="sales-quote-lines-section">
          <h3 className="sales-quote-section-title">Talep Satırları</h3>
          <div className="ledger-list sales-quote-lines">
            <table className="customer-table quote-detail-table">
              <thead>
                <tr>
                  <th>Sıra</th>
                  <th>Stok</th>
                  <th>Miktar</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.length === 0 && (
                  <tr><td colSpan={3} className="table-empty">Satır yok.</td></tr>
                )}
                {detail.lines.map((line) => (
                  <tr key={line.lineNumber}>
                    <td>{line.lineNumber}</td>
                    <td>
                      <b>{line.stockCode}</b>
                      <small className="cell-subtitle">{line.stockName}</small>
                    </td>
                    <td>
                      <span>{formatRequestQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                      {line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode && (
                        <small className="cell-subtitle"><span>{formatRequestQuantity(line.enteredQuantity)}</span> <span>{line.enteredUnitCode}</span></small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="sales-quote-lines-section">
          <h3 className="sales-quote-section-title">Bu Talepten Hazırlanan Teklifler</h3>
          <div className="ledger-list sales-quote-lines">
            <table className="customer-table quote-detail-table">
              <thead>
                <tr>
                  <th>Teklif no</th>
                  <th>Tarih</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {detail.quotes.length === 0 && (
                  <tr><td colSpan={4} className="table-empty">Bu talep için henüz teklif hazırlanmadı.</td></tr>
                )}
                {detail.quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td><b>{quote.code}</b></td>
                    <td>{formatRequestDate(quote.quoteDate)}</td>
                    <td><span>{formatRequestAmount(quote.grandTotal)}</span> <span>{quote.currencyCode}</span></td>
                    <td><DocumentStatusBadge status={salesQuoteStatus(quote.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <p className="muted">
          {cancelled
            ? "Bu talep iptal edildi; teklif hazırlanamaz."
            : "Teklif hazırla düğmesi, müşteri ve satırları dolu bir teklif taslağı açar. İlk teklifle birlikte talep “Teklif verildi” durumuna geçer."}
        </p>
      </div>
    </DocumentSurface>
  );
}
