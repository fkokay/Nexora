import type { FormEvent } from 'react'
import { FileText, Plus } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { OrderDetail, Note, ScreenField } from '../types'

export function DeliveryNoteComposePanel({ detail, notes, receiptId, quantities, documentNumber, documentDate, busy, fields, onSubmit, onDocumentNumberChange, onDocumentDateChange, onReceiptChange, onQuantityChange }: {
  detail: OrderDetail
  notes: Note[]
  receiptId: string
  quantities: Record<number, string>
  documentNumber: string
  documentDate: string
  busy: boolean
  fields: ScreenField[]
  onSubmit: (event: FormEvent) => void
  onDocumentNumberChange: (value: string) => void
  onDocumentDateChange: (value: string) => void
  onReceiptChange: (value: string) => void
  onQuantityChange: (lineNumber: number, value: string) => void
}) {
  return <section className="panel purchase-note-compose-panel"><div className="panel-heading"><div><p className="eyebrow">YENİ BELGE</p><b>İrsaliye kaydet</b><small>{detail.code} · {detail.supplierName} · miktarlar sipariş satırının temel biriminde girilir.</small></div><FileText size={18}/></div><form onSubmit={onSubmit}>
    <div className="form-two"><label>Tedarikçi irsaliye numarası<input value={documentNumber} onChange={event => onDocumentNumberChange(event.target.value)} maxLength={80} required/></label><label>Belge tarihi<input type="date" value={documentDate} onChange={event => onDocumentDateChange(event.target.value)} required/></label></div>
    <label>Mevcut mal kabul (isteğe bağlı)<select value={receiptId} onChange={event => onReceiptChange(event.target.value)}><option value="">Sonradan bağlayacağım</option>{detail.receipts.filter(receipt => receipt.status === 'Posted' && !notes.some(note => note.purchaseReceiptId === receipt.id)).map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.code} · {receipt.receiptDate}</option>)}</select></label>
    <div className="ledger-list"><AdvancedDataGrid className="customer-table"><thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{detail.lines.map(line => <tr key={line.lineNumber}>{fields.map(field => <td key={field.key}>{field.key === 'lineNumber' ? line.lineNumber : field.key === 'product' ? `${line.stockCode} · ${line.stockName}` : field.key === 'orderedQuantity' ? `${line.quantity.toLocaleString('tr-TR')} ${line.unitCode}` : <input aria-label={`${line.stockCode} irsaliye miktarı`} type="number" min="0" max={line.quantity} step="0.0001" value={quantities[line.lineNumber] || ''} onChange={event => onQuantityChange(line.lineNumber, event.target.value)}/>}</td>)}</tr>)}</tbody></AdvancedDataGrid></div>
    {receiptId && <p className="muted">Mal kabul bağlantısında tüm irsaliye satırları ile mal kabul satırları ve temel birim miktarları bire bir eşleşmelidir.</p>}<div className="modal-foot"><span>Bu kayıt stok veya muhasebe hareketi oluşturmaz.</span><button className="primary" disabled={busy}><Plus size={16}/> İrsaliyeyi kaydet</button></div>
  </form></section>
}
