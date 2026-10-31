import type { FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { deliveryNotePageSize, type OrderSummary } from '../types'

export function OrderSelectionPanel({ orders, orderId, query, page, total, loading, onQueryChange, onSearch, onSelect, onRefresh, onPageChange }: {
  orders: OrderSummary[]
  orderId: string
  query: string
  page: number
  total: number
  loading: boolean
  onQueryChange: (value: string) => void
  onSearch: (event: FormEvent) => void
  onSelect: (id: string) => void
  onRefresh: () => void
  onPageChange: (page: number) => void
}) {
  return <section className="panel purchase-note-order-panel">
    <div className="panel-heading"><div><p className="eyebrow">SİPARİŞ BAĞLAMI</p><b>Satın alma siparişi</b><small>İrsaliye siparişe bağlanır; mal kabul stok girişinin tek kaynağıdır.</small></div><button className="secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={15}/> Yenile</button></div>
    <div className="purchase-note-order-controls"><form className="form-inline" onSubmit={onSearch}><input aria-label="Satın alma siparişlerinde ara" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Sipariş no veya tedarikçi ara"/><button className="secondary" disabled={loading}>{loading ? 'Yükleniyor…' : 'Ara'}</button></form><label>Sipariş<select value={orderId} onChange={event => onSelect(event.target.value)}><option value="">İrsaliye kaydedilebilir sipariş seçin</option>{orders.map(order => <option key={order.id} value={order.id}>{order.code} · {order.supplierName} · {order.status}</option>)}</select></label></div>
    <div className="table-pagination"><span>{total === 0 ? '0 sipariş' : `${(page - 1) * deliveryNotePageSize + 1}–${Math.min(page * deliveryNotePageSize, total)} / ${total} sipariş`}</span><div><button type="button" className="secondary" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Önceki</button><button type="button" className="secondary" disabled={loading || page * deliveryNotePageSize >= total} onClick={() => onPageChange(page + 1)}>Sonraki</button></div></div>
  </section>
}
