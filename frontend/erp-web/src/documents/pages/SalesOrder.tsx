import { useEffect, useState } from 'react'
import { api, localDateString } from '../../lib/api'
import { isAdmin, type DocContext } from '../context'
import { CustomFieldCatalog, CustomFieldValues } from '../customFields'
import { deliveryStatus, salesOrderStatus } from '../definitions'
import DocumentShell, { Field, ReadField, StatusPill, type FlowLink } from '../DocumentShell'
import { formatDate, formatNumber, formatQuantity } from '../format'
import type { SalesDeliverySummary, SalesInvoiceSummary, SalesOrderDetail } from '../models'
import { LinesTable, PartyCard, QuantityEntry, WarehouseSelect, quantityColumn, useLineUnits, useRunner } from '../parts'

const basePath = '/api/sales/orders'

export function SalesOrderDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [order, setOrder] = useState<SalesOrderDetail | null>(null)
  const [deliveries, setDeliveries] = useState<SalesDeliverySummary[]>([])
  const [tab, setTab] = useState('lines')
  const [form, setForm] = useState<'delivery' | 'reservation' | null>(null)
  const [requestedDate, setRequestedDate] = useState('')
  const [warehouseId, setWarehouseId] = useState(''), [deliveryDate, setDeliveryDate] = useState(localDateString()), [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [quantities, setQuantities] = useState<Record<string, string>>({}), [enteredUnits, setEnteredUnits] = useState<Record<string, string>>({})
  const [reservationWarehouseId, setReservationWarehouseId] = useState(''), [reservationRequestId, setReservationRequestId] = useState(() => crypto.randomUUID())
  const runner = useRunner()
  const firstActive = ctx.warehouses.find(warehouse => warehouse.isActive)?.id ?? ''
  const openLines = order?.lines.filter(line => line.remainingQuantity > 0) ?? []
  const units = useLineUnits(ctx.token, openLines.map(line => ({ key: String(line.lineNumber), stockItemId: line.stockItemId })), form === 'delivery')

  async function load() {
    const [item, page] = await Promise.all([
      api<SalesOrderDetail>(`${basePath}/${id}`, ctx.token),
      api<{ items: SalesDeliverySummary[] }>(`/api/sales/deliveries/?orderId=${id}&page=1&pageSize=100`, ctx.token),
    ])
    setOrder(item); setDeliveries(page.items); setRequestedDate(item.requestedDeliveryDate ?? '')
    return item
  }
  function beginDelivery(target = order) {
    if (!target) return
    setRequestId(crypto.randomUUID())
    setWarehouseId(target.lines.find(line => line.reservationId)?.reservationWarehouseId ?? firstActive)
    setQuantities(Object.fromEntries(target.lines.map(line => [String(line.lineNumber), String(line.reservationId ? Math.min(line.remainingQuantity, line.reservedQuantity) : line.remainingQuantity)])))
    setEnteredUnits({}); setForm('delivery'); setTab('deliveries')
  }
  useEffect(() => {
    setOrder(null); setForm(null); setTab('lines')
    void load().then(item => { if (ctx.intent === 'deliver' && item.status === 'Open' && item.lines.some(line => line.remainingQuantity > 0)) beginDelivery(item) }).catch(e => runner.setError((e as Error).message))
  }, [id, ctx.token])

  if (!order) return <DocumentShell title="Satış siparişi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Sipariş yükleniyor…'}</div>}/>

  const open = order.status === 'Open'
  const reserved = order.lines.some(line => line.reservationId !== null)
  const posted = deliveries.filter(delivery => delivery.status === 'Posted')
  const invoiced = posted.filter(delivery => delivery.invoiceStatus === 'Posted')
  const fullyDelivered = order.lines.filter(line => line.remainingQuantity <= 0).length
  const refresh = async () => { await load(); ctx.changed() }

  const saveDate = (event: React.FormEvent) => { event.preventDefault(); void runner.run(async () => {
    await api(`${basePath}/${order.id}/delivery-date`, ctx.token, { method: 'PUT', body: JSON.stringify({ requestedDeliveryDate: requestedDate || null }) })
    await refresh(); return 'Teslim tarihi güncellendi. MRP bu tarihi ihtiyaç tarihi olarak kullanır.'
  }) }
  const reserve = (event: React.FormEvent) => { event.preventDefault(); void runner.run(async () => {
    await api(`${basePath}/${order.id}/reservations`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId: reservationRequestId, warehouseId: reservationWarehouseId }) })
    setReservationRequestId(crypto.randomUUID()); setForm(null); await refresh(); return 'Açık sipariş miktarları depoda rezerve edildi.'
  }) }
  function release() {
    const reason = window.prompt('Rezervasyonu bırakma gerekçesi:')?.trim()
    if (!reason || !window.confirm('Siparişin kalan stok rezervasyonu bırakılsın mı?')) return
    void runner.run(async () => {
      await api(`${basePath}/${order!.id}/reservations/release`, ctx.token, { method: 'POST', body: JSON.stringify({ reason, confirmation: true }) })
      await refresh(); return 'Kalan stok rezervasyonu bırakıldı ve kullanılabilir bakiyeye döndü.'
    })
  }
  const createDelivery = (event: React.FormEvent) => { event.preventDefault(); void runner.run(async () => {
    const lines = openLines.map(line => ({ orderLineNumber: line.lineNumber, quantity: Number(quantities[String(line.lineNumber)] || 0), unitCode: enteredUnits[String(line.lineNumber)] || line.unitCode })).filter(line => line.quantity > 0)
    if (!lines.length) throw new Error('En az bir satır için sevk miktarı girin.')
    await api(`${basePath}/${order.id}/deliveries`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId, warehouseId, deliveryDate, lines }) })
    setForm(null); await refresh(); return 'İrsaliye oluşturuldu ve stok çıkışı kaydedildi.'
  }) }
  async function invoice(delivery: SalesDeliverySummary) {
    let invoiceId = ''
    const ok = await runner.run(async () => { invoiceId = (await api<SalesInvoiceSummary>(`/api/sales/deliveries/${delivery.id}/invoice`, ctx.token, { method: 'POST' })).id })
    if (ok) { ctx.changed(); ctx.open('sales-invoices', invoiceId) }
  }
  function voidDelivery(delivery: SalesDeliverySummary) {
    if (!window.confirm(`${delivery.code} irsaliyesi iptal edilsin mi? Stok hareketi ters kaydedilecek.`)) return
    void runner.run(async () => { await api(`/api/sales/deliveries/${delivery.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'İrsaliye iptal edildi; stok kaydı ters hareketle korundu.' })
  }

  const uninvoiced = posted.find(delivery => !delivery.hasSalesInvoice)
  const nextStep = open && openLines.length > 0
    ? { text: `${openLines.length} satır henüz sevk edilmedi: ${openLines.slice(0, 2).map(line => `${formatQuantity(line.remainingQuantity)} ${line.unitCode} ${line.stockName}`).join(', ')}${openLines.length > 2 ? '…' : ''}`, actionLabel: 'Kalanı sevk et', onAction: () => beginDelivery() }
    : uninvoiced ? { text: `${uninvoiced.code} irsaliyesi henüz faturalanmadı.`, actionLabel: 'Fatura kes', onAction: () => void invoice(uninvoiced) }
    : undefined
  const flow: FlowLink[] = [
    { step: 'quote', detail: order.quoteCode, state: 'done', target: { key: 'sales-quotes', id: order.quoteId } },
    { step: 'order', detail: order.code, state: 'current' },
    { step: 'delivery', detail: `${fullyDelivered} / ${order.lines.length}`, state: fullyDelivered === 0 ? 'none' : fullyDelivered === order.lines.length ? 'done' : 'partial', target: posted.length === 1 ? { key: 'sales-deliveries', id: posted[0].id } : undefined },
    { step: 'invoice', detail: posted.length ? `${invoiced.length} / ${posted.length}` : undefined, state: !invoiced.length ? 'none' : invoiced.length === posted.length ? 'done' : 'partial', target: invoiced.length === 1 && invoiced[0].invoiceId ? { key: 'sales-invoices', id: invoiced[0].invoiceId } : undefined },
  ]

  return <DocumentShell title="Satış siparişi" code={order.code} status={salesOrderStatus(order.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={open && openLines.length > 0 ? { label: 'İrsaliye oluştur', onClick: () => beginDelivery(), disabled: runner.busy || ctx.warehouses.length === 0 } : undefined}
    secondary={[
      ...(open && !reserved ? [{ label: 'Stok ayır', disabled: runner.busy || !firstActive, onClick: () => { setReservationWarehouseId(firstActive); setReservationRequestId(crypto.randomUUID()); setForm('reservation'); setTab('deliveries') } }] : []),
      ...(open && reserved && isAdmin(ctx) ? [{ label: 'Rezervasyonu bırak', danger: true, disabled: runner.busy, onClick: release }] : []),
    ]}
    flow={flow} nextStep={nextStep} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss} tab={tab} onTab={setTab}
    header={<form className="doc-grid" onSubmit={saveDate}>
      <ReadField label="Müşteri" value={order.customerName} className="wide"/>
      <ReadField label="Para birimi" value={order.currencyCode}/>
      <ReadField label="Sipariş tarihi" value={formatDate(order.orderDate)}/>
      {open ? <Field label="İstenen teslim tarihi" optional><input type="date" min={order.orderDate} value={requestedDate} onChange={e => setRequestedDate(e.target.value)}/></Field> : <ReadField label="İstenen teslim tarihi" value={formatDate(order.requestedDeliveryDate)}/>}
      <ReadField label="Kaynak teklif" value={<button type="button" className="doc-link" onClick={() => ctx.open('sales-quotes', order.quoteId)}>{order.quoteCode}</button>}/>
      {open && requestedDate !== (order.requestedDeliveryDate ?? '') && <div className="doc-form-foot full" style={{ marginTop: 0 }}><span>MRP, açık sipariş talebini bu tarihte karşılamaya çalışır.</span><button className="secondary small-button" disabled={runner.busy}>Teslim tarihini kaydet</button></div>}
    </form>}
    side={<PartyCard token={ctx.token} partyId={order.customerId} kind="customer" currency={order.currencyCode}/>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: order.lines.length, content: <LinesTable lines={order.lines} rowKey={line => line.lineNumber} columns={[
        quantityColumn('Sipariş'),
        { label: 'Sevk edilen', align: 'right', render: line => formatQuantity(line.deliveredQuantity) },
        { label: 'Kalan', align: 'right', render: line => <b>{formatQuantity(line.remainingQuantity)}</b> },
        { label: 'Rezerve', render: line => line.reservedQuantity > 0 ? `${formatQuantity(line.reservedQuantity)} · ${line.reservationWarehouseName}` : '—' },
        { label: 'Birim fiyat', align: 'right', render: line => formatNumber(line.unitPrice, 2, 4) },
        { label: 'İsk %', align: 'right', render: line => formatQuantity(line.discountPercent) },
        { label: 'KDV %', align: 'right', render: line => formatQuantity(line.vatPercent) },
        { label: 'Tutar', align: 'right', render: line => formatNumber(line.lineTotal) },
      ]}/> },
      { key: 'deliveries', label: 'İrsaliyeler', count: deliveries.length, content: <div className="doc-stack">
        {form === 'reservation' && <form className="doc-card" onSubmit={reserve}>
          <div className="doc-section-title"><span>Stok ayır</span></div>
          <div className="doc-grid"><Field label="Rezervasyon deposu"><WarehouseSelect warehouses={ctx.warehouses} value={reservationWarehouseId} onChange={setReservationWarehouseId}/></Field></div>
          <div className="doc-form-foot"><span>Sevk edilmemiş tüm miktarlar için kullanılabilir stok kontrol edilir. Bu işlem stok hareketi oluşturmaz.</span>
            <span className="doc-inline-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Vazgeç</button><button className="primary" disabled={runner.busy || !reservationWarehouseId}>{runner.busy ? 'Ayrılıyor…' : 'Stok ayır'}</button></span></div>
        </form>}
        {form === 'delivery' && <form className="doc-card" onSubmit={createDelivery}>
          <div className="doc-section-title"><span>Yeni irsaliye</span></div>
          <div className="doc-grid" style={{ marginBottom: 12 }}>
            <Field label="Depo"><WarehouseSelect warehouses={ctx.warehouses} value={warehouseId} onChange={setWarehouseId} activeOnly={false}/></Field>
            <Field label="Sevk tarihi"><input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} required/></Field>
          </div>
          <QuantityEntry quantityLabel="Sevk miktarı" units={units} quantities={quantities} enteredUnits={enteredUnits}
            rows={openLines.map(line => ({ key: String(line.lineNumber), stockItemId: line.stockItemId, stockCode: line.stockCode, stockName: line.stockName, unitCode: line.unitCode, remaining: line.remainingQuantity, info: line.reservedQuantity > 0 ? `${formatQuantity(line.reservedQuantity)} ${line.unitCode} rezerve · ${line.reservationWarehouseName}` : 'Rezervasyon yok' }))}
            onQuantity={(key, value) => setQuantities(current => ({ ...current, [key]: value }))} onUnit={(key, value) => setEnteredUnits(current => ({ ...current, [key]: value }))}/>
          <div className="doc-form-foot"><span>Alternatif birimde girilen miktar temel birime çevrilerek stoktan düşülür.</span>
            <span className="doc-inline-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Vazgeç</button><button className="primary" disabled={runner.busy || !warehouseId}>{runner.busy ? 'Kaydediliyor…' : 'İrsaliyeyi kaydet'}</button></span></div>
        </form>}
        <div className="doc-row-list">
          {deliveries.length === 0 && <div className="doc-card"><p className="muted">Henüz irsaliye oluşturulmadı.</p></div>}
          {deliveries.map(delivery => <div className="doc-row-item" key={delivery.id}>
            <div><button className="doc-link" onClick={() => ctx.open('sales-deliveries', delivery.id)}>{delivery.code}</button><small>{formatDate(delivery.deliveryDate)} · {delivery.warehouseName} · {delivery.lineCount} satır</small></div>
            <span className="doc-inline-actions">
              <StatusPill status={deliveryStatus(delivery.status)}/>
              {delivery.status === 'Posted' && !delivery.hasSalesInvoice && <button className="doc-text-button" disabled={runner.busy} onClick={() => void invoice(delivery)}>Fatura kes</button>}
              {delivery.invoiceId && <button className="doc-text-button" onClick={() => ctx.open('sales-invoices', delivery.invoiceId!)}>Faturayı aç</button>}
              {delivery.status === 'Posted' && delivery.invoiceStatus !== 'Posted' && <button className="doc-text-button danger" disabled={runner.busy} onClick={() => voidDelivery(delivery)}>İptal et</button>}
            </span>
          </div>)}
        </div>
      </div> },
      { key: 'fields', label: 'Özel alanlar', count: order.customFields?.length ?? 0, content: <div className="doc-stack">
        <CustomFieldValues token={ctx.token} basePath={basePath} documentId={order.id} fields={order.customFields ?? []} editable={open} lockedText="Sipariş kapanınca özel alanlar kilitlenir."
          onSaved={customFields => setOrder(current => current ? { ...current, customFields } : current)} onError={runner.setError} onNotice={runner.setNotice}/>
        {isAdmin(ctx) && <CustomFieldCatalog token={ctx.token} basePath={basePath} title="Sipariş alan tanımları" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}
    totals={{ subtotal: order.subtotal, discountTotal: order.discountTotal, taxTotal: order.taxTotal, grandTotal: order.grandTotal, currency: order.currencyCode }}/>
}
