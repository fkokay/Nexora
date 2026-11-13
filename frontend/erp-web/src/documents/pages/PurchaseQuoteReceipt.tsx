import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { isAdmin, type DocContext } from '../context'
import { CustomFieldCatalog, CustomFieldValues } from '../customFields'
import { postedStatus, purchaseInvoiceStatus, purchaseRequestStatus, supplierQuoteStatus } from '../definitions'
import DocumentShell, { ReadField, StatusPill, type FlowLink } from '../DocumentShell'
import { formatDate, formatMoney, formatNumber, formatQuantity } from '../format'
import type { PurchaseReceiptDetail, SupplierQuoteDetail } from '../models'
import { LinesTable, PartyCard, quantityColumn, useRunner } from '../parts'

const quotePath = '/api/purchasing/supplier-quotes'
const receiptPath = '/api/purchasing/receipts'

export function SupplierQuoteDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [quote, setQuote] = useState<SupplierQuoteDetail | null>(null)
  const runner = useRunner()
  async function load() { setQuote(await api<SupplierQuoteDetail>(`${quotePath}/${id}`, ctx.token)) }
  useEffect(() => { setQuote(null); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!quote) return <DocumentShell title="Tedarikçi teklifi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Teklif yükleniyor…'}</div>}/>

  const open = quote.status === 'Submitted' && quote.requestStatus === 'Approved'
  const flow: FlowLink[] = [
    { step: 'request', detail: quote.requestCode, state: 'done', target: { key: 'purchase-requests', id: quote.purchaseRequestId } },
    { step: 'quote', detail: quote.code, state: 'current' },
    ...(quote.purchaseOrderId ? [{ step: 'order' as const, detail: quote.purchaseOrderCode ?? undefined, state: 'done' as const, target: { key: 'purchase-orders' as const, id: quote.purchaseOrderId } }] : []),
  ]

  return <DocumentShell title="Tedarikçi teklifi" code={quote.code} status={supplierQuoteStatus(quote.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={quote.purchaseOrderId ? { label: 'Siparişi aç', onClick: () => ctx.open('purchase-orders', quote.purchaseOrderId!) }
      : { label: open ? 'Teklifleri karşılaştır' : 'Talebi aç', onClick: () => ctx.open('purchase-requests', quote.purchaseRequestId, 'quote') }}
    flow={flow}
    nextStep={open ? { text: 'Teklif değerlendiriliyor. Talep ekranında diğer tekliflerle karşılaştırıp siparişe dönüştürün.', actionLabel: 'Teklifleri karşılaştır', onAction: () => ctx.open('purchase-requests', quote.purchaseRequestId, 'quote') }
      : quote.status === 'Selected' ? { text: `Bu teklif seçildi${quote.purchaseOrderCode ? ` ve ${quote.purchaseOrderCode} siparişine dönüştü` : ''}.` }
      : quote.status === 'NotSelected' ? { text: 'Talep başka bir teklifle veya teklifsiz siparişe dönüştürüldü; bu teklif seçilmedi.' } : undefined}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
    header={<div className="doc-grid">
      <ReadField label="Tedarikçi" value={quote.supplierName} className="wide"/>
      <ReadField label="Para birimi" value={quote.currencyCode}/>
      <ReadField label="Teklif tarihi" value={formatDate(quote.quoteDate)}/>
      <ReadField label="Geçerlilik tarihi" value={formatDate(quote.validUntil)}/>
      <ReadField label="Talep" value={<span className="doc-inline-actions"><button className="doc-link" onClick={() => ctx.open('purchase-requests', quote.purchaseRequestId)}>{quote.requestCode}</button><StatusPill status={purchaseRequestStatus(quote.requestStatus)}/></span>}/>
      {quote.notes && <ReadField label="Not" value={quote.notes} className="full"/>}
    </div>}
    side={<>
      <div className="doc-section-title"><span>Karşılaştırma</span></div>
      <div className="doc-side-row"><span>Teklif tutarı</span><b>{formatMoney(quote.grandTotal, quote.currencyCode)}</b></div>
      {quote.currencyCode !== quote.baseCurrencyCode && <div className="doc-side-row"><span>Uygulanan kur</span><span>{quote.appliedExchangeRate === null ? '—' : formatNumber(quote.appliedExchangeRate, 2, 6)}{quote.appliedRateDate ? ` · ${formatDate(quote.appliedRateDate)}` : ''}</span></div>}
      <div className="doc-side-row"><span>{quote.baseCurrencyCode} karşılığı</span><b>{quote.comparableGrandTotal === null ? 'Kur bulunamadı' : formatMoney(quote.comparableGrandTotal, quote.baseCurrencyCode)}</b></div>
      <div style={{ height: 12 }}/>
      <PartyCard token={ctx.token} partyId={quote.supplierId} kind="supplier" currency={quote.currencyCode}/>
    </>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: quote.lines.length, content: <LinesTable lines={quote.lines} rowKey={line => line.requestLineNumber} columns={[
        quantityColumn(),
        { label: 'Birim fiyat', align: 'right', render: line => formatNumber(line.unitPrice, 2, 4) },
        { label: 'İsk %', align: 'right', render: line => formatQuantity(line.discountPercent) },
        { label: 'KDV %', align: 'right', render: line => formatQuantity(line.vatPercent) },
        { label: 'Tutar', align: 'right', render: line => formatNumber(line.lineTotal) },
      ]}/> },
      { key: 'fields', label: 'Özel alanlar', count: quote.customFields.length, content: <div className="doc-stack">
        <CustomFieldValues token={ctx.token} basePath={quotePath} documentId={quote.id} fields={quote.customFields} editable={quote.status === 'Submitted'} valueHistory={false}
          lockedText="Seçim yapıldıktan sonra teklif alanları değiştirilemez."
          onSaved={customFields => setQuote(current => current ? { ...current, customFields } : current)} onError={runner.setError} onNotice={runner.setNotice}/>
        {isAdmin(ctx) && <CustomFieldCatalog token={ctx.token} basePath={quotePath} title="Tedarikçi teklifi alan tanımları" history="none" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}
    totals={{ subtotal: quote.subtotal, discountTotal: quote.discountTotal, taxTotal: quote.taxTotal, grandTotal: quote.grandTotal, currency: quote.currencyCode }}/>
}

export function PurchaseReceiptDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [receipt, setReceipt] = useState<PurchaseReceiptDetail | null>(null)
  const runner = useRunner()
  async function load() { setReceipt(await api<PurchaseReceiptDetail>(`${receiptPath}/${id}`, ctx.token)) }
  useEffect(() => { setReceipt(null); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!receipt) return <DocumentShell title="Alış irsaliyesi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Mal kabul yükleniyor…'}</div>}/>

  const posted = receipt.status === 'Posted'
  const invoice = receipt.invoice
  const toInvoice = () => ctx.open('purchase-orders', receipt.purchaseOrderId, 'invoice')
  function voidReceipt() {
    if (!window.confirm(`${receipt!.code} mal kabulü iptal edilsin mi? İptal stok bakiyesini negatife düşürmemelidir.`)) return
    void runner.run(async () => { await api(`${receiptPath}/${receipt!.id}/void`, ctx.token, { method: 'POST' }); await load(); ctx.changed(); return 'Mal kabul iptal edildi; stok hareketleri ters kaydedildi.' })
  }
  const flow: FlowLink[] = [
    { step: 'order', detail: receipt.purchaseOrderCode, state: 'done', target: { key: 'purchase-orders', id: receipt.purchaseOrderId } },
    { step: 'delivery', detail: receipt.code, state: 'current' },
    ...(invoice ? [{ step: 'invoice' as const, detail: invoice.code, state: 'done' as const, target: { key: 'purchase-invoices' as const, id: invoice.id } }] : []),
  ]

  return <DocumentShell title="Alış irsaliyesi" code={receipt.code} status={postedStatus(receipt.status, 'Kabul edildi')} onBack={ctx.back} onNavigate={ctx.open}
    primary={invoice ? { label: 'Faturayı aç', onClick: () => ctx.open('purchase-invoices', invoice.id) } : posted ? { label: 'Faturayı gir', onClick: toInvoice } : undefined}
    secondary={posted && !invoice ? [{ label: 'Mal kabulü iptal et', danger: true, disabled: runner.busy, onClick: voidReceipt }] : []}
    flow={flow}
    nextStep={posted && !invoice ? { text: 'Mal kabul yapıldı, tedarikçi faturası henüz girilmedi. Fatura sipariş ekranındaki mal kabul satırından girilir.', actionLabel: 'Faturayı gir', onAction: toInvoice }
      : posted && invoice ? { text: 'Faturası girilmiş mal kabul iptal edilemez; önce faturayı iptal edin.' } : undefined}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
    header={<div className="doc-grid">
      <ReadField label="Tedarikçi" value={receipt.supplierName} className="wide"/>
      <ReadField label="Kabul tarihi" value={formatDate(receipt.receiptDate)}/>
      <ReadField label="Depo" value={receipt.warehouseName}/>
      <ReadField label="Kaynak sipariş" value={<button className="doc-link" onClick={() => ctx.open('purchase-orders', receipt.purchaseOrderId)}>{receipt.purchaseOrderCode}</button>}/>
      <ReadField label="Fatura" value={invoice ? <span className="doc-inline-actions"><button className="doc-link" onClick={() => ctx.open('purchase-invoices', invoice.id)}>{invoice.code}</button><StatusPill status={purchaseInvoiceStatus(invoice)}/></span> : 'Girilmedi'}/>
    </div>}
    side={<PartyCard token={ctx.token} partyId={receipt.supplierId} kind="supplier"/>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: receipt.lines.length, content: <LinesTable lines={receipt.lines} rowKey={line => line.orderLineNumber} columns={[
        quantityColumn('Kabul edilen'),
        { label: 'Girilen', align: 'right', render: line => line.enteredQuantity && line.enteredUnitCode && line.enteredUnitCode !== line.unitCode ? `${formatQuantity(line.enteredQuantity)} ${line.enteredUnitCode}` : '—' },
        { label: 'Sipariş satırı', align: 'right', render: line => String(line.orderLineNumber) },
      ]}/> },
      { key: 'fields', label: 'Özel alanlar', count: receipt.customFields.length, content: <div className="doc-stack">
        <div className="doc-card">{receipt.customFields.length === 0 ? <p className="muted">Mal kabul için özel alan tanımlanmamış.</p>
          : <div className="doc-grid">{receipt.customFields.map(field => <ReadField key={field.definitionId} label={field.label} value={field.dataType === 'Boolean' && field.value ? (field.value === 'true' ? 'Evet' : 'Hayır') : field.value}/>)}</div>}
          <div className="doc-form-foot"><span>Mal kabul özel alanları kayıt sırasında girilir, sonradan değiştirilemez.</span></div>
        </div>
        {isAdmin(ctx) && <CustomFieldCatalog token={ctx.token} basePath={receiptPath} title="Mal kabul alan tanımları" history="view" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}/>
}
