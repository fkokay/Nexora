import { Globe2, PackageCheck, X } from 'lucide-react'
import { localizedText } from '../../locale'
import type { Direction, InventoryDocument, TradeCapabilities, TradeCase, TradeOrder, TradeStatus } from '../types'

type Props = {
  item: TradeCase | null; orderMap: Map<string, TradeOrder>; documents: InventoryDocument[]; documentId: string
  capabilities: TradeCapabilities; busyId: string; nextStatus?: TradeStatus; locale: string
  statusLabel: (status: TradeStatus) => string; directionLabel: (direction: Direction) => string; transportLabel: (mode: string) => string
  onClear: () => void; onDocumentChange: (id: string) => void; onLinkDocument: (item: TradeCase) => void
  onEdit: (item: TradeCase) => void; onTransition: (item: TradeCase, status: TradeStatus) => void
}

const tr = (turkish: string, english: string) => localizedText(turkish, english)

export function ForeignTradeDetail({ item, orderMap, documents, documentId, capabilities, busyId, nextStatus, locale, statusLabel, directionLabel, transportLabel, onClear, onDocumentChange, onLinkDocument, onEdit, onTransition }: Props) {
  return <aside className="foreign-trade-detail" aria-label={tr('Seçili dış ticaret dosyası', 'Selected foreign trade case')}>
    {item ? <>
      <div className="foreign-trade-detail-head"><div><small>{item.referenceCode} · {directionLabel(item.direction)}</small><h3>{statusLabel(item.status)}</h3></div><button className="secondary" aria-label={tr('Seçimi kaldır', 'Clear selection')} onClick={onClear}><X size={15}/></button></div>
      <dl>
        <div><dt>{tr('Bağlı sipariş', 'Linked order')}</dt><dd>{orderMap.get(item.purchaseOrderId || item.salesOrderId || '')?.code || '—'}</dd></div>
        <div><dt>{tr('Rota', 'Route')}</dt><dd>{item.originCountryCode} → {item.destinationCountryCode}</dd></div>
        <div><dt>Incoterms / {tr('taşıma', 'transport')}</dt><dd>{item.incotermsCode || '—'} · {transportLabel(item.transportMode)}</dd></div>
        <div><dt>{tr('Beyan değeri', 'Declared value')}</dt><dd>{item.declaredValue.toLocaleString(locale, { minimumFractionDigits: 2 })} {item.currencyCode}</dd></div>
        <div><dt>{tr('Planlanan sevkiyat', 'Planned shipment')}</dt><dd>{item.plannedShipDate ? new Date(`${item.plannedShipDate}T00:00:00`).toLocaleDateString(locale) : '—'}</dd></div>
        <div><dt>{tr('Planlanan varış', 'Planned arrival')}</dt><dd>{item.plannedArrivalDate ? new Date(`${item.plannedArrivalDate}T00:00:00`).toLocaleDateString(locale) : '—'}</dd></div>
        <div><dt>{tr('Taşıyıcı referansı', 'Carrier reference')}</dt><dd>{item.carrierReference || '—'}</dd></div>
        <div><dt>{tr('Gümrük referansı', 'Customs reference')}</dt><dd>{item.customsReference || '—'}</dd></div>
      </dl>
      {item.notes && <p className="foreign-trade-detail-notes">{item.notes}</p>}
      <section className="foreign-trade-inventory-link"><h4>{tr('Stok belgesi', 'Inventory document')}</h4><p>{tr('Stok hareketini standart mal kabul veya teslimat ekranında oluşturun. Bu adım yalnızca mevcut belgeyi bağlar; stok ikinci kez işlenmez.', 'Post stock in the standard receipt or delivery screen. This only links the existing document; it does not post inventory again.')}</p>
        {item.purchaseReceiptId || item.salesDeliveryId ? <div className="foreign-trade-linked-document"><PackageCheck size={16}/><span>{documents.find(document => document.isLinked)?.code || item.purchaseReceiptId || item.salesDeliveryId}</span></div> : <>
          {((item.direction === 'Import' && ['Arrived', 'Closed'].includes(item.status)) || (item.direction === 'Export' && ['Shipped', 'CustomsClearance', 'Arrived', 'Closed'].includes(item.status))) && capabilities.canAdvance && <div className="foreign-trade-link-controls"><select aria-label={tr('Stok belgesi seçin', 'Select inventory document')} value={documentId} onChange={event => onDocumentChange(event.target.value)}><option value="">{tr('Kayıtlı stok belgesi seçin', 'Select a posted inventory document')}</option>{documents.map(document => <option key={document.id} value={document.id}>{document.code} · {document.warehouseName} · {document.lineCount} {tr('satır', 'lines')}</option>)}</select><button className="secondary" disabled={!documentId || busyId === item.id} onClick={() => onLinkDocument(item)}>{tr('Belgeyi bağla', 'Link document')}</button></div>}
          {!documents.length && <small>{tr('Uygun kayıtlı stok belgesi bulunamadı. Önce standart mal kabul veya teslimat işlemini tamamlayın.', 'No eligible posted inventory document was found. Complete the standard receipt or delivery first.')}</small>}
        </>}
      </section>
      {capabilities.canUpdate && ['Draft', 'Booked'].includes(item.status) && <div className="foreign-trade-detail-actions"><button className="secondary" disabled={busyId === item.id} onClick={() => onEdit(item)}>{tr('Dosyayı düzenle', 'Edit case')}</button></div>}
      {capabilities.canAdvance && <div className="foreign-trade-detail-actions">{nextStatus && <button className="primary" disabled={busyId === item.id} onClick={() => onTransition(item, nextStatus)}>{tr(`${statusLabel(nextStatus)} aşamasına geçir`, `Move to ${statusLabel(nextStatus)}`)}</button>}{['Draft', 'Booked'].includes(item.status) && <button className="secondary" disabled={busyId === item.id} onClick={() => onTransition(item, 'Cancelled')}>{tr('Dosyayı iptal et', 'Cancel case')}</button>}</div>}
    </> : <div className="foreign-trade-detail-empty"><Globe2 size={20}/><b>{tr('Dosya seçin', 'Select a case')}</b><span>{tr('Seçili dosyanın rota, taşıma ve gümrük bilgileri burada görünür.', 'The selected case route, transport and customs details appear here.')}</span></div>}
  </aside>
}
