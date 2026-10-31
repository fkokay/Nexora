import type { FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import { deliveryNotePageSize, type Note, type ScreenField } from '../types'

export function DeliveryNotesListPanel({
  fields, notes, searchResults, searchTotal, searchPage, page, total, loading, search, onSearchChange,
  onSearch, onClearSearch, onRefresh, onPageChange, onOpenNote, onOpenOrder,
}: {
  fields: ScreenField[]
  notes: Note[]
  searchResults: Note[] | null
  searchTotal: number
  searchPage: number
  page: number
  total: number
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  onSearch: (event: FormEvent) => void
  onClearSearch: () => void
  onRefresh: () => void
  onPageChange: (page: number) => void
  onOpenNote: (note: Note) => void
  onOpenOrder: (note: Note) => void
}) {
  const isSearching = searchResults !== null
  const currentPage = isSearching ? searchPage : page
  const currentTotal = isSearching ? searchTotal : total
  const pageCount = Math.max(1, Math.ceil(currentTotal / deliveryNotePageSize))

  return <section className="panel purchase-note-list-panel">
    <div className="panel-heading"><div><p className="eyebrow">BELGE LİSTESİ</p><b>Gelen irsaliyeler</b><small>{isSearching ? `${searchTotal} eşleşme · sayfa ${searchPage} / ${Math.max(1, Math.ceil(searchTotal / deliveryNotePageSize))}` : `${total} kayıt · sayfa ${page} / ${Math.max(1, Math.ceil(total / deliveryNotePageSize))}`}</small></div><button className="secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={15}/> Yenile</button></div>
    <form className="form-inline" onSubmit={onSearch}><input aria-label="Gelen irsaliyelerde ara" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="İrsaliye no, sipariş, tedarikçi veya mal kabul ara"/><button className="secondary" disabled={loading}>{loading ? 'Aranıyor…' : 'Ara'}</button>{isSearching && <button type="button" className="secondary" onClick={onClearSearch}>Temizle</button>}</form>
    <div className="ledger-list"><AdvancedDataGrid hideSearch externalPagination className="customer-table"><thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan={fields.length} className="table-empty">İrsaliyeler yükleniyor…</td></tr> : (searchResults ?? notes).map(note => <tr key={note.id}>{fields.map(field => <td key={field.key}>{field.key === 'documentNumber' ? note.documentNumber : field.key === 'documentDate' ? note.documentDate : field.key === 'purchaseOrderCode' ? note.purchaseOrderCode : field.key === 'supplierName' ? note.supplierName : field.key === 'lineCount' ? note.lineCount : field.key === 'purchaseReceiptCode' ? (note.purchaseReceiptCode ? `Eşleşti · ${note.purchaseReceiptCode}` : 'Mal kabul bağlantısı yok') : field.key === 'actions' ? <><button type="button" className="row-action" onClick={() => onOpenNote(note)}>Detay</button><button type="button" className="row-action" onClick={() => onOpenOrder(note)}>Siparişi aç</button></> : null}</td>)}</tr>)}
      {!loading && (searchResults ?? notes).length === 0 && <tr><td colSpan={fields.length} className="table-empty">{isSearching ? 'Aramanızla eşleşen irsaliye bulunamadı.' : total === 0 ? 'Henüz gelen irsaliye yok.' : 'Bu sayfada kayıt yok; listeyi yenileyin.'}</td></tr>}
    </tbody></AdvancedDataGrid></div>
    <div className="table-pagination"><span>Sayfa {currentPage} / {pageCount}</span><div><button type="button" className="secondary" disabled={loading || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Önceki</button><button type="button" className="secondary" disabled={loading || currentPage * deliveryNotePageSize >= currentTotal} onClick={() => onPageChange(currentPage + 1)}>Sonraki</button></div></div>
  </section>
}
