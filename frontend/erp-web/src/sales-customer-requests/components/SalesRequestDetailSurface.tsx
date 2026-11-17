import { X } from "lucide-react";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { DocumentStatusBadge } from "../../document-page/DocumentStatusBadge";
import { salesQuoteStatus, salesRequestStatus } from "../../document-page/documentStatus";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailLinesHead,
  DetailNotes,
  DetailSection,
} from "../../document-detail/DocumentDetailLayout";
import { SALES_DETAIL_HINTS, SalesFooterStatus, SalesRequestFlow } from "../../sales/salesDocumentDetail";
import { formatRequestAmount, formatRequestDate, formatRequestQuantity, type SalesRequestDetail } from "../types";

type Props = {
  detail: SalesRequestDetail;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
};

/**
 * Kayıtlı bir satış talebinin tam sayfa detayı (taslak 02): durum akışı, üst bilgiler, satırlar, bağlı teklifler ve
 * bağlam panelinde belge zinciri. Teklif hazırla ve Talebi iptal et İşlem Çubuğu'nun İşlemler menüsündedir.
 */
export function SalesRequestDetailSurface({ detail, error, notice, onDismissError, onDismissNotice, onClose }: Props) {
  const cancelled = detail.status === "Cancelled";
  return (
    <DocumentSurface
      variant="detail"
      title="Satış talebi"
      code={detail.code}
      subtitle={detail.customerName}
      status={salesRequestStatus(detail.status)}
      meta={<span>{formatRequestDate(detail.requestDate)}</span>}
      statusFlow={<SalesRequestFlow status={detail.status} />}
      onClose={onClose}
      aside={
        <DetailContext title="Belge zinciri">
          <DetailChain
            items={[
              { key: "self", code: detail.code, label: "Bu talep", current: true, status: salesRequestStatus(detail.status) },
              ...detail.quotes.map((quote) => ({
                key: quote.id,
                code: quote.code,
                label: "Satış teklifi",
                meta: formatRequestDate(quote.quoteDate),
                status: salesQuoteStatus(quote.status),
              })),
            ]}
          />
        </DetailContext>
      }
      hints={SALES_DETAIL_HINTS}
      footerStatus={<SalesFooterStatus lines={detail.lines.length} />}
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
          label="Talep üst bilgileri"
          items={[
            { label: "Talep tarihi", value: formatRequestDate(detail.requestDate) },
            { label: "İhtiyaç tarihi", value: formatRequestDate(detail.neededByDate) },
            { label: "Para birimi", value: detail.currencyCode },
            cancelled
              ? { label: "İptal gerekçesi", value: detail.cancelReason || "—" }
              : { label: "Teklif", value: detail.quotes.length },
          ]}
        />
      </div>
      <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={`${detail.lines.length} satır`} />
        <div className="dd-lines-wrap">
          <table className="dd-lines" aria-label="Talep satırları">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok</th>
                <th className="dd-num">Miktar</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.length === 0 && (
                <tr><td colSpan={3} className="dd-empty">Satır yok.</td></tr>
              )}
              {detail.lines.map((line) => (
                <tr key={line.lineNumber}>
                  <td className="dd-ix">{line.lineNumber}</td>
                  <td className="dd-stock">
                    <b>{line.stockCode}</b>
                    <small>{line.stockName}</small>
                  </td>
                  <td className="dd-num">
                    <span>{formatRequestQuantity(line.quantity)}</span> <span>{line.unitCode}</span>
                    {line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode && (
                      <small><span>{formatRequestQuantity(line.enteredQuantity)}</span> <span>{line.enteredUnitCode}</span></small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detail.description && (
          <div className="dd-lines-footer">
            <div className="dd-lines-aside">
              <DetailNotes items={[{ label: "Açıklama", value: detail.description }]} />
            </div>
          </div>
        )}
      </div>
      <DetailSection title="Bu talepten hazırlanan teklifler" count={detail.quotes.length}>
        {detail.quotes.length === 0 ? (
          <p className="dd-empty">Bu talep için henüz teklif hazırlanmadı.</p>
        ) : (
          <div className="dd-lines-wrap">
            <table className="dd-lines" aria-label="Bu talepten hazırlanan teklifler">
              <thead>
                <tr>
                  <th>Teklif no</th>
                  <th>Tarih</th>
                  <th className="dd-num">Tutar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {detail.quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td className="nx-code">{quote.code}</td>
                    <td>{formatRequestDate(quote.quoteDate)}</td>
                    <td className="dd-num"><span>{formatRequestAmount(quote.grandTotal)}</span> <span>{quote.currencyCode}</span></td>
                    <td><DocumentStatusBadge status={salesQuoteStatus(quote.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
      <p className="dd-muted">
        {cancelled
          ? "Bu talep iptal edildi; teklif hazırlanamaz."
          : "Teklif hazırla (İşlemler), müşteri ve satırları dolu bir teklif taslağı açar. İlk teklifle birlikte talep “Teklif verildi” durumuna geçer."}
      </p>
    </DocumentSurface>
  );
}
