import { Link2 } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { OrderDetail, Note, ScreenField } from '../types'

export function OrderDeliveryNotesPanel({ detail, notes, fields, receiptId, busy, onReceiptChange, onLink, onUnlink }: {
  detail: OrderDetail
  notes: Note[]
  fields: ScreenField[]
  receiptId: string
  busy: boolean
  onReceiptChange: (value: string) => void
  onLink: (note: Note) => void
  onUnlink: (note: Note) => void
}) {
  return <section className="panel purchase-note-related-panel"><div className="panel-heading"><div><p className="eyebrow">SEÇİLİ SİPARİŞ</p><b>Bu siparişin irsaliyeleri</b><small>Mutabık olan belgeler bağlı mal kabul kodunu gösterir.</small></div></div><div className="ledger-list"><AdvancedDataGrid className="customer-table"><thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{notes.map(note => <tr key={note.id}>{fields.map(field => <td key={field.key}>{field.key === 'documentNumber' ? note.documentNumber : field.key === 'documentDate' ? note.documentDate : field.key === 'lineCount' ? note.lineCount : field.key === 'purchaseReceiptCode' ? (note.purchaseReceiptCode || 'Bekliyor') : note.purchaseReceiptId ? <button className="row-action danger-action" disabled={busy} onClick={() => onUnlink(note)}>Bağlantıyı kaldır</button> : <div className="form-inline"><select aria-label={`${note.documentNumber} mal kabul seçin`} value={receiptId} onChange={event => onReceiptChange(event.target.value)}><option value="">Mal kabul seçin</option>{detail.receipts.filter(receipt => receipt.status === 'Posted' && !notes.some(item => item.purchaseReceiptId === receipt.id)).map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.code}</option>)}</select><button className="row-action" disabled={busy || !receiptId} onClick={() => onLink(note)}><Link2 size={14}/> Bağla</button></div>}</td>)}</tr>)}{notes.length === 0 && <tr><td colSpan={fields.length} className="table-empty">Bu sipariş için irsaliye yok.</td></tr>}</tbody></AdvancedDataGrid></div></section>
}
