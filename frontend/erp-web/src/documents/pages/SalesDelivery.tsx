import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { DocContext } from '../context'
import { deliveryStatus } from '../definitions'
import DocumentShell, { ReadField, type FlowLink } from '../DocumentShell'
import { formatDate, formatQuantity } from '../format'
import type { SalesInvoiceSummary, SalesOrderDetail } from '../models'
import { LinesTable, quantityColumn, useRunner } from '../parts'

type DeliveryLine = { orderLineNumber: number; stockItemId: string; stockCode: string; stockName: string; unitCode: string; quantity: number; enteredQuantity?: number | null; enteredUnitCode?: string | null }
type DeliveryView = { id: string; code: string; orderId: string; orderCode: string; warehouseId: string; warehouseName: string; deliveryDate: string; status: 'Posted' | 'Voided'; createdAt: string; lines: DeliveryLine[]; hasSalesInvoice: boolean; invoiceStatus: 'Posted' | 'Voided' | null; invoiceId: string | null }

export function SalesDeliveryDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [delivery, setDelivery] = useState<DeliveryView | null>(null)
  const [order, setOrder] = useState<SalesOrderDetail | null>(null)
  const runner = useRunner()

  async function load() {
    const item = await api<DeliveryView>(`/api/sales/deliveries/${id}`, ctx.token)
    setDelivery(item)
    setOrder(await api<SalesOrderDetail>(`/api/sales/orders/${item.orderId}`, ctx.token).catch(() => null))
  }
  useEffect(() => { setDelivery(null); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!delivery) return <DocumentShell title="Satış irsaliyesi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'İrsaliye yükleniyor…'}</div>}/>

  const posted = delivery.status === 'Posted'
  async function invoice() {
    let invoiceId = ''
    const ok = await runner.run(async () => { invoiceId = (await api<SalesInvoiceSummary>(`/api/sales/deliveries/${delivery!.id}/invoice`, ctx.token, { method: 'POST' })).id })
    if (ok) { ctx.changed(); ctx.open('sales-invoices', invoiceId) }
  }
  function voidDelivery() {
    if (!window.confirm(`${delivery!.code} irsaliyesi iptal edilsin mi? Stok hareketi ters kaydedilecek.`)) return
    void runner.run(async () => { await api(`/api/sales/deliveries/${delivery!.id}/void`, ctx.token, { method: 'POST' }); await load(); ctx.changed(); return 'İrsaliye iptal edildi; stok kaydı ters hareketle korundu.' })
  }
  const flow: FlowLink[] = [
    ...(order ? [{ step: 'quote' as const, detail: order.quoteCode, state: 'done' as const, target: { key: 'sales-quotes' as const, id: order.quoteId } }] : []),
    { step: 'order', detail: delivery.orderCode, state: 'done', target: { key: 'sales-orders', id: delivery.orderId } },
    { step: 'delivery', detail: delivery.code, state: 'current' },
    ...(delivery.invoiceId && delivery.invoiceStatus === 'Posted' ? [{ step: 'invoice' as const, state: 'done' as const, target: { key: 'sales-invoices' as const, id: delivery.invoiceId } }] : []),
  ]

  return <DocumentShell title="Satış irsaliyesi" code={delivery.code} status={deliveryStatus(delivery.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={posted && !delivery.hasSalesInvoice ? { label: 'Fatura kes', onClick: () => void invoice(), disabled: runner.busy }
      : delivery.invoiceId ? { label: 'Faturayı aç', onClick: () => ctx.open('sales-invoices', delivery.invoiceId!) } : undefined}
    secondary={posted && delivery.invoiceStatus !== 'Posted' ? [{ label: 'İrsaliyeyi iptal et', danger: true, disabled: runner.busy, onClick: voidDelivery }] : []}
    flow={flow}
    nextStep={posted && !delivery.hasSalesInvoice ? { text: 'Sevkiyat tamamlandı, irsaliye henüz faturalanmadı.', actionLabel: 'Fatura kes', onAction: () => void invoice() }
      : posted && delivery.invoiceStatus === 'Posted' ? { text: 'Faturası kesilmiş irsaliye iptal edilemez; önce faturayı iptal edin.' } : undefined}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
    header={<div className="doc-grid">
      <ReadField label="Müşteri" value={order?.customerName} className="wide"/>
      <ReadField label="Sevk tarihi" value={formatDate(delivery.deliveryDate)}/>
      <ReadField label="Depo" value={delivery.warehouseName}/>
      <ReadField label="Kaynak sipariş" value={<button className="doc-link" onClick={() => ctx.open('sales-orders', delivery.orderId)}>{delivery.orderCode}</button>}/>
      <ReadField label="Fatura" value={delivery.invoiceId ? <button className="doc-link" onClick={() => ctx.open('sales-invoices', delivery.invoiceId!)}>{delivery.invoiceStatus === 'Posted' ? 'Kesildi' : 'İptal edildi'}</button> : 'Kesilmedi'}/>
    </div>}
    tabs={[{ key: 'lines', label: 'Satırlar', count: delivery.lines.length, content: <LinesTable lines={delivery.lines} rowKey={line => line.orderLineNumber} columns={[
      quantityColumn('Sevk edilen'),
      { label: 'Girilen', align: 'right', render: line => line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode ? `${formatQuantity(line.enteredQuantity)} ${line.enteredUnitCode}` : '—' },
      { label: 'Sipariş satırı', align: 'right', render: line => String(line.orderLineNumber) },
    ]}/> }]}/>
}
