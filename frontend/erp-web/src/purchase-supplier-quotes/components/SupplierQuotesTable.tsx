import type { Quote } from '../types'

type Props = {
  items: Quote[]
  loading: boolean
  selectedId: string | undefined
  onSelect: (quote: Quote) => void
}

function statusLabel(status: string) {
  return status === 'Submitted' ? 'Değerlendirmede' : status === 'Selected' ? 'Seçildi' : status === 'NotSelected' ? 'Seçilmedi' : status
}

export default function SupplierQuotesTable({ items, loading, selectedId, onSelect }: Props) {
  return (
    <div className="customer-table-wrap supplier-quotes-table-wrap" role="region" aria-label="Tedarikçi teklifleri tablosu" tabIndex={0}>
      <table className="customer-table">
        <thead>
          <tr>
            <th scope="col">Teklif no</th>
            <th scope="col">Talep</th>
            <th scope="col">Tedarikçi</th>
            <th scope="col">Tarih</th>
            <th scope="col">Geçerlilik</th>
            <th scope="col">Durum</th>
            <th className="numeric" scope="col">Toplam</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="table-empty" role="status">Teklifler yükleniyor…</td></tr>
          ) : !items.length ? (
            <tr><td colSpan={7} className="table-empty">Bu filtrelerle teklif bulunamadı.</td></tr>
          ) : items.map(quote => (
            <tr
              key={quote.id}
              tabIndex={0}
              onClick={() => onSelect(quote)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(quote)
                }
              }}
              aria-selected={selectedId === quote.id}
              className={selectedId === quote.id ? 'erp-selected-row' : ''}
            >
              <td><b>{quote.code}</b></td>
              <td>{quote.requestCode}</td>
              <td>{quote.supplierName}</td>
              <td>{quote.quoteDate}</td>
              <td>{quote.validUntil || '—'}</td>
              <td><span className="erp-status-chip">{statusLabel(quote.status)}</span></td>
              <td className="numeric">{quote.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {quote.currencyCode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
