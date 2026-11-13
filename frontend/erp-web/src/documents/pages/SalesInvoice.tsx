import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { isAdmin, type DocContext } from '../context'
import { CustomFieldCatalog, CustomFieldValues } from '../customFields'
import { salesInvoiceStatus } from '../definitions'
import DocumentShell, { ReadField, type FlowLink } from '../DocumentShell'
import { formatDate, formatMoney, formatQuantity } from '../format'
import type { SalesInvoiceDetail } from '../models'
import { LinesTable, PartyCard, Returns, Settlements, pricedColumns, quantityColumn, useRunner } from '../parts'

const basePath = '/api/sales/invoices'

export function SalesInvoiceDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [invoice, setInvoice] = useState<SalesInvoiceDetail | null>(null)
  const [tab, setTab] = useState('lines')
  const runner = useRunner()

  async function load() { const item = await api<SalesInvoiceDetail>(`${basePath}/${id}`, ctx.token); setInvoice(item); return item }
  useEffect(() => {
    setInvoice(null); setTab(ctx.intent === 'collect' ? 'collections' : ctx.intent === 'return' ? 'returns' : 'lines')
    void load().catch(e => runner.setError((e as Error).message))
  }, [id, ctx.token])

  if (!invoice) return <DocumentShell title="Satış faturası" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Fatura yükleniyor…'}</div>}/>

  const posted = invoice.status === 'Posted'
  const refresh = async () => { await load(); ctx.changed() }
  const returnedByLine = new Map<string, number>()
  for (const item of invoice.returns) if (item.status === 'Posted') for (const line of item.lines) returnedByLine.set(line.salesInvoiceLineId, (returnedByLine.get(line.salesInvoiceLineId) ?? 0) + line.quantity)
  const activeReturns = invoice.returns.filter(item => item.status === 'Posted')
  const blocked = invoice.paidAmount > 0 || invoice.returnedAmount > 0
  function voidInvoice() {
    if (!window.confirm(`${invoice!.code} faturası iptal edilsin mi? Cari borç ters hareketle kapatılacak.`)) return
    void runner.run(async () => { await api(`${basePath}/${invoice!.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'Fatura iptal edildi; cari borç ters kayıtla kapatıldı.' })
  }
  const flow: FlowLink[] = [
    { step: 'order', detail: invoice.orderCode, state: 'done', target: { key: 'sales-orders', id: invoice.orderId } },
    { step: 'delivery', detail: invoice.deliveryCode, state: 'done', target: { key: 'sales-deliveries', id: invoice.deliveryId } },
    { step: 'invoice', detail: invoice.code, state: 'current' },
    ...(activeReturns.length ? [{ step: 'return' as const, detail: activeReturns.length === 1 ? activeReturns[0].code : String(activeReturns.length), state: 'done' as const, target: activeReturns.length === 1 ? { key: 'sales-returns' as const, id: activeReturns[0].id } : undefined }] : []),
  ]

  return <DocumentShell title="Satış faturası" code={invoice.code} status={salesInvoiceStatus(invoice.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={posted && invoice.outstandingAmount > 0 ? { label: 'Tahsilat kaydet', onClick: () => setTab('collections') } : undefined}
    secondary={posted ? [
      { label: 'İade oluştur', onClick: () => setTab('returns') },
      { label: 'Faturayı iptal et', danger: true, disabled: runner.busy || blocked, title: blocked ? 'Önce tahsilat ve iadeleri iptal edin.' : undefined, onClick: voidInvoice },
    ] : []}
    flow={flow}
    nextStep={posted && invoice.outstandingAmount > 0 ? { text: `${formatMoney(invoice.outstandingAmount, invoice.currencyCode)} tahsil edilmeyi bekliyor.`, actionLabel: 'Tahsilat kaydet', onAction: () => setTab('collections') }
      : posted ? { text: 'Faturanın tamamı tahsil edildi veya iade ile kapatıldı.' } : undefined}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss} tab={tab} onTab={setTab}
    header={<div className="doc-grid">
      <ReadField label="Müşteri" value={invoice.customerName} className="wide"/>
      <ReadField label="Para birimi" value={invoice.currencyCode}/>
      <ReadField label="Fatura tarihi" value={formatDate(invoice.invoiceDate)}/>
      <ReadField label="İrsaliye" value={<button className="doc-link" onClick={() => ctx.open('sales-deliveries', invoice.deliveryId)}>{invoice.deliveryCode}</button>}/>
      <ReadField label="Sipariş" value={<button className="doc-link" onClick={() => ctx.open('sales-orders', invoice.orderId)}>{invoice.orderCode}</button>}/>
      <ReadField label="Cari kaydı" value={invoice.ledgerEntryId ? 'Cari borç kaydı oluşturuldu' : 'Cari hareketi yok'} className="full"/>
    </div>}
    side={<>
      <div className="doc-section-title"><span>Tahsilat durumu</span></div>
      <div className="doc-side-row"><span>Tahsil edilen</span><span>{formatMoney(invoice.paidAmount, invoice.currencyCode)}</span></div>
      <div className="doc-side-row"><span>İade</span><span>{formatMoney(invoice.returnedAmount, invoice.currencyCode)}</span></div>
      <div className="doc-side-row"><span>Açık bakiye</span><b>{formatMoney(invoice.outstandingAmount, invoice.currencyCode)}</b></div>
      <div className="doc-progress" style={{ margin: '8px 0 14px' }}><span style={{ width: `${invoice.grandTotal > 0 ? Math.min(100, Math.round((invoice.grandTotal - invoice.outstandingAmount) / invoice.grandTotal * 100)) : 0}%` }}/></div>
      <PartyCard token={ctx.token} partyId={invoice.customerId} kind="customer" currency={invoice.currencyCode}/>
    </>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: invoice.lines.length, content: <LinesTable lines={invoice.lines} rowKey={line => line.id} columns={[quantityColumn(), ...pricedColumns()]}/> },
      { key: 'collections', label: 'Tahsilatlar', count: invoice.collections.length, content: <Settlements token={ctx.token} kind="collection" busy={runner.busy} canAdd={posted} outstanding={invoice.outstandingAmount} currency={invoice.currencyCode}
        items={invoice.collections.map(item => ({ id: item.id, code: item.code, date: item.collectionDate, amount: item.amount, currencyCode: item.currencyCode, paymentMethod: item.paymentMethod, reference: item.reference, status: item.status }))}
        onCreate={input => runner.run(async () => {
          await api(`${basePath}/${invoice.id}/collections`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId: input.requestId, collectionDate: input.date, amount: input.amount, paymentMethod: input.paymentMethod, reference: input.reference, financialAccountId: input.financialAccountId }) })
          await refresh(); return 'Tahsilat kaydedildi ve fatura bakiyesine mahsup edildi.'
        })}
        onVoid={item => { if (window.confirm(`${item.code} tahsilatı iptal edilsin mi? Cari alacak ters kayıtla geri alınacak.`)) void runner.run(async () => { await api(`/api/customer-collections/${item.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'Tahsilat iptal edildi; fatura bakiyesi yeniden açıldı.' }) }}/> },
      { key: 'returns', label: 'İadeler', count: invoice.returns.length, content: <Returns token={ctx.token} kind="sales" busy={runner.busy} canAdd={posted} currency={invoice.currencyCode} warehouses={ctx.warehouses} items={invoice.returns} onOpen={id => ctx.open('sales-returns', id)}
        rows={invoice.lines.map(line => { const remaining = Math.max(0, line.quantity - (returnedByLine.get(line.id) ?? 0)); return { key: line.id, stockItemId: line.stockItemId, stockCode: line.stockCode, stockName: line.stockName, unitCode: line.unitCode, remaining, info: `Faturalanan ${formatQuantity(line.quantity)} ${line.unitCode}` } })}
        onCreate={input => runner.run(async () => {
          await api(`${basePath}/${invoice.id}/returns`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId: input.requestId, warehouseId: input.warehouseId, returnDate: input.returnDate, lines: input.lines.map(line => ({ salesInvoiceLineId: line.lineId, quantity: line.quantity, unitCode: line.unitCode })) }) })
          await refresh(); return 'Satış iadesi kaydedildi; stok girişi ve cari alacak oluşturuldu.'
        })}
        onVoid={item => { if (window.confirm(`${item.code} iadesi iptal edilsin mi? Stok ve cari hareketleri ters kaydedilecek.`)) void runner.run(async () => { await api(`/api/sales/returns/${item.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'Satış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.' }) }}/> },
      { key: 'fields', label: 'Özel alanlar', count: invoice.customFields?.length ?? 0, content: <div className="doc-stack">
        <CustomFieldValues token={ctx.token} basePath={basePath} documentId={invoice.id} fields={invoice.customFields ?? []} editable={posted} lockedText="İptal edilen faturada özel alanlar kilitlidir."
          onSaved={customFields => setInvoice(current => current ? { ...current, customFields } : current)} onError={runner.setError} onNotice={runner.setNotice}/>
        {isAdmin(ctx) && <CustomFieldCatalog token={ctx.token} basePath={basePath} title="Fatura alan tanımları" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}
    totals={{ subtotal: invoice.subtotal, discountTotal: invoice.discountTotal, taxTotal: invoice.taxTotal, grandTotal: invoice.grandTotal, currency: invoice.currencyCode }}/>
}
