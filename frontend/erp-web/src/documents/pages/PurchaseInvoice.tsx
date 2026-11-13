import { useEffect, useState } from 'react'
import { api, localDateString } from '../../lib/api'
import type { DocContext } from '../context'
import { purchaseInvoiceStatus } from '../definitions'
import DocumentShell, { ReadField, type FlowLink } from '../DocumentShell'
import { formatDate, formatMoney, formatQuantity } from '../format'
import type { PurchaseInvoiceDetail } from '../models'
import { LinesTable, PartyCard, Returns, Settlements, pricedColumns, quantityColumn, useRunner } from '../parts'

const basePath = '/api/purchasing/invoices'

export function PurchaseInvoiceDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [invoice, setInvoice] = useState<PurchaseInvoiceDetail | null>(null)
  const [tab, setTab] = useState('lines')
  const runner = useRunner()

  async function load() { setInvoice(await api<PurchaseInvoiceDetail>(`${basePath}/${id}`, ctx.token)) }
  useEffect(() => {
    setInvoice(null); setTab(ctx.intent === 'pay' ? 'payments' : ctx.intent === 'return' ? 'returns' : 'lines')
    void load().catch(e => runner.setError((e as Error).message))
  }, [id, ctx.token])

  if (!invoice) return <DocumentShell title="Alış faturası" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Fatura yükleniyor…'}</div>}/>

  const posted = invoice.status === 'Posted'
  const refresh = async () => { await load(); ctx.changed() }
  const returns = invoice.returns ?? []
  const activeReturns = returns.filter(item => item.status === 'Posted')
  const returnedByLine = new Map<string, number>()
  for (const item of activeReturns) for (const line of item.lines) returnedByLine.set(line.purchaseInvoiceLineId, (returnedByLine.get(line.purchaseInvoiceLineId) ?? 0) + line.quantity)
  const overdue = posted && invoice.outstandingAmount > 0 && invoice.dueDate < localDateString()
  function voidInvoice() {
    if (!window.confirm(`${invoice!.code} alış faturası iptal edilsin mi? Cari borç ters kayıtla kapatılacak.`)) return
    void runner.run(async () => { await api(`${basePath}/${invoice!.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'Alış faturası iptal edildi; cari hareket ters kaydedildi.' })
  }
  const flow: FlowLink[] = [
    { step: 'order', detail: invoice.purchaseOrderCode, state: 'done', target: { key: 'purchase-orders', id: invoice.purchaseOrderId } },
    { step: 'delivery', detail: invoice.receiptCode, state: 'done', target: { key: 'purchase-receipts', id: invoice.purchaseReceiptId } },
    { step: 'invoice', detail: invoice.code, state: 'current' },
    ...(activeReturns.length ? [{ step: 'return' as const, detail: activeReturns.length === 1 ? activeReturns[0].code : String(activeReturns.length), state: 'done' as const, target: activeReturns.length === 1 ? { key: 'purchase-returns' as const, id: activeReturns[0].id } : undefined }] : []),
  ]

  return <DocumentShell title="Alış faturası" code={invoice.code} status={purchaseInvoiceStatus(invoice)} onBack={ctx.back} onNavigate={ctx.open}
    primary={posted && invoice.outstandingAmount > 0 ? { label: 'Ödeme kaydet', onClick: () => setTab('payments') } : undefined}
    secondary={posted ? [
      { label: 'İade oluştur', onClick: () => setTab('returns') },
      { label: 'Faturayı iptal et', danger: true, disabled: runner.busy || invoice.paidAmount > 0, title: invoice.paidAmount > 0 ? 'Önce ödemeleri iptal edin.' : undefined, onClick: voidInvoice },
    ] : []}
    flow={flow}
    nextStep={overdue ? { text: `Vadesi ${formatDate(invoice.dueDate)} tarihinde geçti; ${formatMoney(invoice.outstandingAmount, invoice.currencyCode)} ödenmedi.`, actionLabel: 'Ödeme kaydet', onAction: () => setTab('payments') }
      : posted && invoice.outstandingAmount > 0 ? { text: `${formatMoney(invoice.outstandingAmount, invoice.currencyCode)} ödenecek; vade ${formatDate(invoice.dueDate)}.`, actionLabel: 'Ödeme kaydet', onAction: () => setTab('payments') }
      : posted ? { text: 'Faturanın tamamı ödendi veya iade ile kapatıldı.' } : undefined}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss} tab={tab} onTab={setTab}
    header={<div className="doc-grid">
      <ReadField label="Tedarikçi" value={invoice.supplierName} className="wide"/>
      <ReadField label="Para birimi" value={invoice.currencyCode}/>
      <ReadField label="Fatura tarihi" value={formatDate(invoice.invoiceDate)}/>
      <ReadField label="Vade" value={<span className={overdue ? 'doc-danger' : undefined} style={{ fontSize: 13 }}>{formatDate(invoice.dueDate)}{overdue ? ' · gecikti' : ''}</span>}/>
      <ReadField label="Mal kabul" value={<button className="doc-link" onClick={() => ctx.open('purchase-receipts', invoice.purchaseReceiptId)}>{invoice.receiptCode}</button>}/>
      <ReadField label="Sipariş" value={<button className="doc-link" onClick={() => ctx.open('purchase-orders', invoice.purchaseOrderId)}>{invoice.purchaseOrderCode}</button>}/>
    </div>}
    side={<>
      <div className="doc-section-title"><span>Ödeme durumu</span></div>
      <div className="doc-side-row"><span>Ödenen</span><span>{formatMoney(invoice.paidAmount, invoice.currencyCode)}</span></div>
      <div className="doc-side-row"><span>Açık bakiye</span><b>{formatMoney(invoice.outstandingAmount, invoice.currencyCode)}</b></div>
      <div className={`doc-progress${overdue ? ' danger' : ''}`} style={{ margin: '8px 0 14px' }}><span style={{ width: `${invoice.grandTotal > 0 ? Math.min(100, Math.round((invoice.grandTotal - invoice.outstandingAmount) / invoice.grandTotal * 100)) : 0}%` }}/></div>
      <PartyCard token={ctx.token} partyId={invoice.supplierId} kind="supplier" currency={invoice.currencyCode}/>
    </>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: invoice.lines.length, content: <LinesTable lines={invoice.lines} rowKey={line => line.id} columns={[quantityColumn(), ...pricedColumns()]}/> },
      { key: 'payments', label: 'Ödemeler', count: invoice.payments.length, content: <Settlements token={ctx.token} kind="payment" busy={runner.busy} canAdd={posted} outstanding={invoice.outstandingAmount} currency={invoice.currencyCode}
        items={invoice.payments.map(item => ({ id: item.id, code: item.code, date: item.paymentDate, amount: item.amount, currencyCode: item.currencyCode, paymentMethod: item.paymentMethod, reference: item.reference, status: item.status }))}
        onCreate={input => runner.run(async () => {
          await api(`${basePath}/${invoice.id}/payments`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId: input.requestId, paymentDate: input.date, amount: input.amount, paymentMethod: input.paymentMethod, reference: input.reference, financialAccountId: input.financialAccountId }) })
          await refresh(); return 'Tedarikçi ödemesi kaydedildi; cari borçtan düşüldü.'
        })}
        onVoid={item => { if (window.confirm(`${item.code} ödemesi iptal edilsin mi? Tedarikçi cari hareketi ters kaydedilecek.`)) void runner.run(async () => { await api(`/api/purchasing/payments/${item.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'Ödeme iptal edildi; tedarikçi borcu ters kayıtla yeniden açıldı.' }) }}/> },
      { key: 'returns', label: 'İadeler', count: returns.length, content: <Returns token={ctx.token} kind="purchase" busy={runner.busy} canAdd={posted} currency={invoice.currencyCode} warehouses={ctx.warehouses} items={returns} onOpen={id => ctx.open('purchase-returns', id)}
        rows={invoice.lines.map(line => { const remaining = Math.max(0, line.quantity - (returnedByLine.get(line.id) ?? 0)); return { key: line.id, stockItemId: line.stockItemId, stockCode: line.stockCode, stockName: line.stockName, unitCode: line.unitCode, remaining, info: `Faturalanan ${formatQuantity(line.quantity)} ${line.unitCode}` } })}
        onCreate={input => runner.run(async () => {
          await api(`${basePath}/${invoice.id}/returns`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId: input.requestId, warehouseId: input.warehouseId, returnDate: input.returnDate, lines: input.lines.map(line => ({ purchaseInvoiceLineId: line.lineId, quantity: line.quantity, unitCode: line.unitCode })) }) })
          await refresh(); return 'Alış iadesi kaydedildi; stoktan düşüldü ve tedarikçi borcu azaltıldı.'
        })}
        onVoid={item => { if (window.confirm(`${item.code} alış iadesi iptal edilsin mi? Stok ve cari hareketleri ters kaydedilecek.`)) void runner.run(async () => { await api(`/api/purchasing/returns/${item.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return 'Alış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.' }) }}/> },
    ]}
    totals={{ subtotal: invoice.subtotal, discountTotal: invoice.discountTotal, taxTotal: invoice.taxTotal, grandTotal: invoice.grandTotal, currency: invoice.currencyCode }}/>
}
