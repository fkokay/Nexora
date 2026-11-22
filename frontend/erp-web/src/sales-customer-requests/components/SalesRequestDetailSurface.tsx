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
  DetailTiles,
  daysFromToday,
} from "../../document-detail/DocumentDetailLayout";
import { SALES_DETAIL_HINTS, SalesFooterStatus, SalesLinesMeta, SalesRequestFlow } from "../../sales/salesDocumentDetail";
import { formatRequestAmount, formatRequestDate, formatRequestQuantity, type SalesRequestDetail } from "../types";

type Props = {
  detail: SalesRequestDetail;
  error: string;
  notice: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onClose: () => void;
  /** Teklif numarası (teklifler tablosu, satır teklif sütunu, belge zinciri) bu teklifi açar. */
  onOpenQuote: (quoteId: string) => void;
};

/** İhtiyaç tarihine kalan süre; açık olmayan talepte gösterilmez. */
function neededByHint(detail: SalesRequestDetail) {
  if (!detail.neededByDate || detail.status === "Cancelled" || detail.status === "Quoted") return undefined;
  const days = daysFromToday(detail.neededByDate);
  if (days < 0) return `${-days} gün geçti`;
  return days === 0 ? "Bugün" : `${days} gün kaldı`;
}

/**
 * Kayıtlı bir satış talebinin tam sayfa detayı (taslak 02): durum akışı, üst bilgi kartları (talep no, tarih, cari,
 * ihtiyaç tarihi), bilgiler ve açıklama, satır bazında teklif kapsamı, bağlı teklifler ve bağlam panelinde belge zinciri.
 * Düzenle / Sil İşlem Çubuğu'nda; Teklif hazırla ve Talebi iptal et İşlemler menüsündedir.
 */
export function SalesRequestDetailSurface({ detail, error, notice, onDismissError, onDismissNotice, onClose, onOpenQuote }: Props) {
  const cancelled = detail.status === "Cancelled";
  const quoteIdByCode = new Map(detail.quotes.map((quote) => [quote.code, quote.id]));
  const neededHint = neededByHint(detail);
  const quoteLink = (code: string) => {
    const id = quoteIdByCode.get(code);
    return id ? (
      <button key={code} type="button" className="dd-link nx-code" aria-label={`${code} teklif ayrıntılarını aç`} onClick={() => onOpenQuote(id)}>
        {code}
      </button>
    ) : (
      <span key={code} className="nx-code">{code}</span>
    );
  };
  const customerContact = [detail.customerPhone, detail.customerEmail, detail.currencyCode].filter(Boolean).join(" · ");
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
              { key: "self", code: detail.code, label: "Bu talep", kind: "Satış talebi", current: true, status: salesRequestStatus(detail.status) },
              ...detail.quotes.map((quote) => ({
                key: quote.id,
                code: quote.code,
                label: "Satış teklifi",
                meta: formatRequestDate(quote.quoteDate),
                status: salesQuoteStatus(quote.status),
                onOpen: () => onOpenQuote(quote.id),
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
      <DetailTiles
        label="Talep özeti"
        items={[
          { label: "Talep no", value: <span className="nx-code">{detail.code}</span> },
          { label: "Talep tarihi", value: formatRequestDate(detail.requestDate) },
          {
            label: "Cari",
            value: (
              <span>
                {detail.customerCode && <span className="nx-code">{detail.customerCode}</span>}
                {detail.customerCode && " · "}
                {detail.customerName}
              </span>
            ),
            hint: customerContact || undefined,
          },
          {
            label: "İhtiyaç tarihi",
            value: formatRequestDate(detail.neededByDate),
            tone: !detail.neededByDate ? "muted" : neededHint?.endsWith("geçti") ? "danger" : "default",
            hint: neededHint,
          },
        ]}
      />
      <div className="dd-box">
        <DetailInfoGrid
          label="Talep bilgileri"
          items={[
            { label: "Para birimi", value: detail.currencyCode },
            { label: "Teklif", value: detail.quotes.length },
            { label: "Oluşturma", value: formatRequestDate(detail.createdAt.slice(0, 10)) },
            ...(cancelled ? [{ label: "İptal gerekçesi", value: detail.cancelReason || "—" }] : []),
          ]}
        />
        <div className="dd-lines-footer">
          <div className="dd-lines-aside">
            <DetailNotes items={[{ label: "Açıklama", value: detail.description || "Belirtilmedi" }]} />
          </div>
        </div>
      </div>
      <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={<SalesLinesMeta lines={detail.lines.length} />} />
        <div className="dd-lines-wrap">
          <table className="dd-lines" aria-label="Talep satırları">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Stok</th>
                <th className="dd-num">Miktar</th>
                <th>Teklif</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.length === 0 && (
                <tr><td colSpan={4} className="dd-empty">Satır yok.</td></tr>
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
                  <td>
                    {line.quoteCodes?.length
                      ? line.quoteCodes.map((code, index) => <span key={code}>{index > 0 && ", "}{quoteLink(code)}</span>)
                      : <span className="dd-muted">Açık</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    <td>{quoteLink(quote.code)}</td>
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
          : "Teklif hazırla (İşlemler), müşteri ve satırları dolu bir teklif taslağı açar; teklife girmeyecek satırların işaretini kaldırabilirsiniz. Satırların bir kısmına teklif verilince talep “Kısmen teklif verildi”, tümüne verilince “Teklif verildi” durumuna geçer."}
      </p>
    </DocumentSurface>
  );
}
