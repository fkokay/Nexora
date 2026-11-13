import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { DocContext } from '../context'
import { postedStatus } from '../definitions'
import DocumentShell, { ReadField, type FlowLink } from '../DocumentShell'
import { formatDate, formatQuantity } from '../format'
import type { DocumentReturnLine, SalesReturnDetail, SupplierReturnDetail } from '../models'
import { LinesTable, PartyCard, pricedColumns, quantityColumn, useRunner, type LineColumn } from '../parts'

const lineColumns: LineColumn<DocumentReturnLine>[] = [
  quantityColumn('İade miktarı'),
  { label: 'Girilen', align: 'right', render: line => line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode ? `${formatQuantity(line.enteredQuantity)} ${line.enteredUnitCode}` : '—' },
  ...pricedColumns<DocumentReturnLine>(),
]

export function SalesReturnDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [item, setItem] = useState<SalesReturnDetail | null>(null)
  const runner = useRunner()
  async function load() { setItem(await api<SalesReturnDetail>(`/api/sales/returns/${id}`, ctx.token)) }
  useEffect(() => { setItem(null); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!item) return <DocumentShell title="Satış iadesi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'İade yükleniyor…'}</div>}/>

  const posted = item.status === 'Posted'
  function voidReturn() {
    if (!window.confirm(`${item!.code} iadesi iptal edilsin mi? Stok ve cari hareketleri ters kaydedilecek.`)) return
    void runner.run(async () => { await api(`/api/sales/returns/${item!.id}/void`, ctx.token, { method: 'POST' }); await load(); ctx.changed(); return 'Satış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.' })
  }
  const flow: FlowLink[] = [
    { step: 'invoice', detail: item.invoiceCode, state: 'done', target: { key: 'sales-invoices', id: item.salesInvoiceId } },
    { step: 'return', detail: item.code, state: 'current' },
  ]

  return <DocumentShell title="Satış iadesi" code={item.code} status={postedStatus(item.status, 'İşlendi')} onBack={ctx.back} onNavigate={ctx.open}
    primary={{ label: 'Faturayı aç', onClick: () => ctx.open('sales-invoices', item.salesInvoiceId) }}
    secondary={posted ? [{ label: 'İadeyi iptal et', danger: true, disabled: runner.busy, onClick: voidReturn }] : []}
    flow={flow}
    nextStep={posted ? { text: 'İade işlendi: ürünler depoya girdi, tutar müşterinin cari hesabına alacak yazıldı.' } : { text: 'Bu iade iptal edildi; stok ve cari hareketleri ters kayıtla geri alındı.' }}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
    header={<div className="doc-grid">
      <ReadField label="Müşteri" value={item.customerName} className="wide"/>
      <ReadField label="Para birimi" value={item.currencyCode}/>
      <ReadField label="İade tarihi" value={formatDate(item.returnDate)}/>
      <ReadField label="İadenin alındığı depo" value={item.warehouseName}/>
      <ReadField label="Kaynak fatura" value={<button className="doc-link" onClick={() => ctx.open('sales-invoices', item.salesInvoiceId)}>{item.invoiceCode}</button>}/>
    </div>}
    side={<PartyCard token={ctx.token} partyId={item.customerId} kind="customer" currency={item.currencyCode}/>}
    tabs={[{ key: 'lines', label: 'Satırlar', count: item.lines.length, content: <LinesTable lines={item.lines} rowKey={line => line.orderLineNumber} columns={lineColumns}/> }]}
    totals={{ subtotal: item.subtotal, discountTotal: item.discountTotal, taxTotal: item.taxTotal, grandTotal: item.grandTotal, currency: item.currencyCode }}/>
}

export function PurchaseReturnDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [item, setItem] = useState<SupplierReturnDetail | null>(null)
  const runner = useRunner()
  async function load() { setItem(await api<SupplierReturnDetail>(`/api/purchasing/returns/${id}`, ctx.token)) }
  useEffect(() => { setItem(null); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!item) return <DocumentShell title="Alış iadesi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'İade yükleniyor…'}</div>}/>

  const posted = item.status === 'Posted'
  function voidReturn() {
    if (!window.confirm(`${item!.code} alış iadesi iptal edilsin mi? Stok ve cari hareketleri ters kaydedilecek.`)) return
    void runner.run(async () => { await api(`/api/purchasing/returns/${item!.id}/void`, ctx.token, { method: 'POST' }); await load(); ctx.changed(); return 'Alış iadesi iptal edildi; stok ve cari kayıtları ters hareketle korundu.' })
  }
  const flow: FlowLink[] = [
    { step: 'order', state: 'done', target: { key: 'purchase-orders', id: item.purchaseOrderId } },
    { step: 'invoice', detail: item.invoiceCode, state: 'done', target: { key: 'purchase-invoices', id: item.purchaseInvoiceId } },
    { step: 'return', detail: item.code, state: 'current' },
  ]

  return <DocumentShell title="Alış iadesi" code={item.code} status={postedStatus(item.status, 'İşlendi')} onBack={ctx.back} onNavigate={ctx.open}
    primary={{ label: 'Faturayı aç', onClick: () => ctx.open('purchase-invoices', item.purchaseInvoiceId) }}
    secondary={posted ? [{ label: 'İadeyi iptal et', danger: true, disabled: runner.busy, onClick: voidReturn }] : []}
    flow={flow}
    nextStep={posted ? { text: 'İade işlendi: ürünler stoktan düştü, tutar tedarikçi borcundan indirildi.' } : { text: 'Bu iade iptal edildi; stok ve cari hareketleri ters kayıtla geri alındı.' }}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
    header={<div className="doc-grid">
      <ReadField label="Tedarikçi" value={item.supplierName} className="wide"/>
      <ReadField label="Para birimi" value={item.currencyCode}/>
      <ReadField label="İade tarihi" value={formatDate(item.returnDate)}/>
      <ReadField label="İadenin çıktığı depo" value={item.warehouseName}/>
      <ReadField label="Kaynak fatura" value={<button className="doc-link" onClick={() => ctx.open('purchase-invoices', item.purchaseInvoiceId)}>{item.invoiceCode}</button>}/>
    </div>}
    side={<PartyCard token={ctx.token} partyId={item.supplierId} kind="supplier" currency={item.currencyCode}/>}
    tabs={[{ key: 'lines', label: 'Satırlar', count: item.lines.length, content: <LinesTable lines={item.lines} rowKey={line => line.orderLineNumber} columns={lineColumns}/> }]}
    totals={{ subtotal: item.subtotal, discountTotal: item.discountTotal, taxTotal: item.taxTotal, grandTotal: item.grandTotal, currency: item.currencyCode }}/>
}
