import type { Quote, QuoteDetail } from "../types";

type Props = {
  selected: Quote;
  detail: QuoteDetail | null;
  onOpenRequests: () => void;
};

function statusLabel(status: string) {
  return status === "Submitted"
    ? "Değerlendirmede"
    : status === "Selected"
      ? "Seçildi"
      : status === "NotSelected"
        ? "Seçilmedi"
        : status;
}

export default function SupplierQuoteDetailPane({
  selected,
  detail,
  onOpenRequests,
}: Props) {
  return (
    <aside className="erp-record-pane supplier-quotes-detail">
      <header className="list-v2-detail-head">
        <div>
          <span className="list-v2-kind">SATIN ALMA · TEDARİKÇİ TEKLİFİ</span>
          <h2>{selected.supplierName}</h2>
        </div>
        <div className="list-v2-detail-head-actions">
          <button className="secondary small-button" onClick={onOpenRequests}>
            Talep ekranı
          </button>
        </div>
      </header>
      <div className="list-v2-detail-meta">
        <span className="list-v2-detail-code">{selected.code}</span>
        <span>
          <span>Talep</span> <span>{selected.requestCode}</span>
        </span>
        <span
          className={`list-v2-status${selected.status === "Selected" ? " is-active" : ""}`}
        >
          <i aria-hidden="true" />
          {statusLabel(selected.status)}
        </span>
      </div>
      {detail ? (
        <>
          <dl className="list-v2-facts">
            <div>
              <dt>Teklif tarihi</dt>
              <dd>{detail.quoteDate}</dd>
            </div>
            <div>
              <dt>Geçerlilik</dt>
              <dd>{detail.validUntil || "—"}</dd>
            </div>
            <div>
              <dt>Toplam</dt>
              <dd>
                {detail.grandTotal.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                })}{" "}
                {detail.currencyCode}
              </dd>
            </div>
          </dl>
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Stok</th>
                  <th>Miktar</th>
                  <th>Birim fiyat</th>
                  <th>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.requestLineNumber}>
                    <td>
                      <b>{line.stockCode}</b>
                      <small className="cell-subtitle">{line.stockName}</small>
                    </td>
                    <td>
                      {line.quantity.toLocaleString("tr-TR")} {line.unitCode}
                    </td>
                    <td>
                      {line.unitPrice.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      {line.lineTotal.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      {detail.currencyCode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.notes && <p className="muted">{detail.notes}</p>}
        </>
      ) : (
        <p className="muted" role="status">
          Teklif ayrıntıları yükleniyor…
        </p>
      )}
    </aside>
  );
}
