import { Search, X } from 'lucide-react'
import type { SalesDeliverySummary } from '../../erp-types'

type Props = {
  deliveries: SalesDeliverySummary[]
  total: number
  page: number
  search: string
  loading: boolean
  busyDeliveryId: string | null
  error: string
  onClose: () => void
  onSearchChange: (value: string) => void
  onPageChange: (page: number) => void
  onCreateInvoice: (delivery: SalesDeliverySummary) => void
}

export default function SalesInvoiceFromDeliveryDialog({
  deliveries, total, page, search, loading, busyDeliveryId, error,
  onClose, onSearchChange, onPageChange, onCreateInvoice,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / 25))

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busyDeliveryId) onClose() }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="sales-invoice-create-title">
      <div className="modal-head"><div><p className="eyebrow">SATIŞ · FATURALAMA</p><h2 id="sales-invoice-create-title">İrsaliyeden fatura oluştur</h2></div><button type="button" className="icon-button" disabled={!!busyDeliveryId} aria-label="Pencereyi kapat" onClick={onClose}><X size={19}/></button></div>
      <p className="muted">Yalnızca kaydedilmiş ve henüz faturalanmamış irsaliyeler gösterilir. Fatura, sipariş fiyatlarıyla hesaplanır ve cari hesaba borç kaydı ekler.</p>
      <label className="customer-search"><Search size={16}/><input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="İrsaliye no, sipariş no veya müşteriyle ara"/></label>
      {error && <div className="alert inline-alert" role="alert">{error}</div>}
      <div className="requests-list" style={{ maxHeight: 'min(48vh,420px)', overflowY: 'auto', marginTop: 12 }}>
        {loading ? <div className="empty-small" role="status">İrsaliyeler yükleniyor…</div> : deliveries.map(item => <article className="request-row" key={item.id}>
          <div className="request-info"><b>{item.code} · {item.orderCode}</b><small>{item.deliveryDate.split('-').reverse().join('.')} · {item.lineCount} satır · {item.warehouseName}</small></div>
          <button type="button" className="row-action" disabled={!!busyDeliveryId} onClick={() => onCreateInvoice(item)}>{busyDeliveryId === item.id ? 'Oluşturuluyor…' : 'Fatura kes'}</button>
        </article>)}
        {!loading && deliveries.length === 0 && !error && <div className="empty-small">{search ? 'Aramanızla eşleşen faturalanmamış irsaliye yok.' : 'Faturalanmamış, kaydedilmiş irsaliye bulunmuyor.'}</div>}
      </div>
      <div className="modal-foot"><span>{total} faturalanmamış irsaliye · Sayfa {page} / {pageCount}</span><div>
        <button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => onPageChange(Math.max(1, page - 1))}>Önceki</button>
        <button type="button" className="secondary" disabled={page >= pageCount || loading} onClick={() => onPageChange(page + 1)}>Sonraki</button>
        <button type="button" className="secondary" disabled={!!busyDeliveryId} onClick={onClose}>Kapat</button>
      </div></div>
    </section>
  </div>
}
