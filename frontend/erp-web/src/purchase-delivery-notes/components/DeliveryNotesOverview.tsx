import type { Note, OrderDetail } from '../types'

export function DeliveryNotesOverview({ noteTotal, searching, orderTotal, loading, detail, notes }: {
  noteTotal: number
  searching: boolean
  orderTotal: number
  loading: boolean
  detail: OrderDetail | null
  notes: Note[]
}) {
  return <div className="purchase-note-overview" aria-label="İrsaliye özeti">
    <div><span>İrsaliye kaydı</span><b>{noteTotal}</b><small>{searching ? 'Arama görünümü' : 'Toplam firma kaydı'}</small></div>
    <div><span>Sipariş aralığı</span><b>{orderTotal}</b><small>{loading ? 'Siparişler yükleniyor' : 'Erişilebilir sipariş'}</small></div>
    <div><span>Seçili sipariş</span><b>{detail?.code ?? 'Seçilmedi'}</b><small>{detail?.supplierName ?? 'İrsaliye girişi için sipariş seçin'}</small></div>
    <div><span>Mal kabul mutabakatı</span><b>{detail ? `${notes.filter(note => note.purchaseReceiptId).length} / ${notes.length}` : '—'}</b><small>{detail ? 'Bağlı irsaliye' : 'Stok hareketi mal kabulde oluşur'}</small></div>
  </div>
}
