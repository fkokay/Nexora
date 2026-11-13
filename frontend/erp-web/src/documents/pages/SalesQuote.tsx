import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { api, localDateString } from '../../lib/api'
import { isAdmin, type DocContext } from '../context'
import { CustomFieldCatalog, CustomFieldInputs, CustomFieldValues, useFieldDefinitions } from '../customFields'
import { quoteStatus } from '../definitions'
import DocumentShell, { Field, ReadField, type FlowLink } from '../DocumentShell'
import { formatDate } from '../format'
import { documentTotals } from '../lineMath'
import type { SalesOrderSummary, SalesQuoteDetail, SalesQuoteSummary, SalesRequestDetail } from '../models'
import { LineEditor, LinesTable, PartyCard, StockHint, draftLinesValid, emptyLine, pricedColumns, quantityColumn, useRunner, useStockAvailability, type DraftLine } from '../parts'
import { clearDraft, loadDraft, saveDraft } from '../storage'

const basePath = '/api/sales/quotes'
type QuoteDraft = { code: string; customerId: string; quoteDate: string; validUntil: string; notes: string; lines: DraftLine[]; customFields: Record<string, string> }

export function SalesQuoteEditor({ ctx, sourceRequestId }: { ctx: DocContext; sourceRequestId?: string }) {
  const scope = ctx.scope('sales-quotes')
  const [source, setSource] = useState<SalesRequestDetail | null>(null)
  const blank = (): QuoteDraft => ({ code: '', customerId: '', quoteDate: localDateString(), validUntil: localDateString(new Date(Date.now() + 14 * 86400000)), notes: '', lines: [emptyLine()], customFields: {} })
  // Talepten hazırlanan teklif kayıtlı taslağı kullanmaz ve üzerine yazmaz.
  const [restored] = useState(() => sourceRequestId ? null : loadDraft<QuoteDraft>(scope))
  const [draft, setDraft] = useState<QuoteDraft>(() => restored && Array.isArray(restored.lines) ? { ...blank(), ...restored } : blank())
  const [saved, setSaved] = useState(false)
  const runner = useRunner()
  const definitions = useFieldDefinitions(ctx.token, basePath)
  const available = useStockAvailability(ctx.token, ctx.warehouses)
  const customers = ctx.customers.filter(customer => customer.isActive && (customer.type === 'Customer' || customer.type === 'Both'))
  const customer = ctx.customers.find(item => item.id === draft.customerId)
  const totals = useMemo(() => documentTotals(draft.lines.map(line => ({ quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discountPercent: Number(line.discountPercent), vatPercent: Number(line.vatPercent) }))), [draft.lines])
  const dirty = !!(draft.code || draft.customerId || draft.notes || draft.lines.some(line => line.stockItemId))

  useEffect(() => {
    if (!dirty || sourceRequestId) return
    const timer = window.setTimeout(() => { saveDraft(scope, draft); setSaved(true) }, 600)
    return () => window.clearTimeout(timer)
  }, [draft, dirty])
  useEffect(() => {
    if (!sourceRequestId) return
    let active = true
    api<SalesRequestDetail>(`/api/sales/requests/${sourceRequestId}`, ctx.token).then(request => {
      if (!active) return
      setSource(request)
      setDraft(current => ({ ...current, customerId: request.customerId, notes: request.description ?? '',
        lines: request.lines.map(line => ({ ...emptyLine(), stockItemId: line.stockItemId, quantity: String(line.quantity), unitCode: line.unitCode })) }))
    }).catch(e => { if (active) runner.setError((e as Error).message) })
    return () => { active = false }
  }, [sourceRequestId, ctx.token])

  const set = (patch: Partial<QuoteDraft>) => { setSaved(false); setDraft(current => ({ ...current, ...patch })) }
  function discard() { if (dirty && !window.confirm('Taslak silinsin mi?')) return; if (!sourceRequestId) clearDraft(scope); setDraft(blank()); setSaved(false) }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!customer) { runner.setError('Müşteri seçin.'); return }
    if (!draftLinesValid(draft.lines)) { runner.setError('Her satırda stok seçili ve miktar sıfırdan büyük olmalı.'); return }
    let createdId = ''
    const ok = await runner.run(async () => {
      const created = await api<SalesQuoteSummary>(`${basePath}/`, ctx.token, { method: 'POST', body: JSON.stringify({
        code: draft.code, customerId: draft.customerId, quoteDate: draft.quoteDate, validUntil: draft.validUntil, currencyCode: customer.currencyCode, notes: draft.notes || null, customFields: draft.customFields, salesRequestId: sourceRequestId ?? null,
        lines: draft.lines.map(line => ({ stockItemId: line.stockItemId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discountPercent: Number(line.discountPercent), vatPercent: Number(line.vatPercent), unitCode: line.unitCode || ctx.stockItems.find(item => item.id === line.stockItemId)?.unitCode })),
      }) })
      createdId = created.id
    })
    if (ok) { if (!sourceRequestId) clearDraft(scope); ctx.changed(); ctx.open('sales-quotes', createdId) }
  }

  return <form onSubmit={submit}>
    <DocumentShell title={source ? `${source.code} talebinden teklif` : 'Yeni satış teklifi'} code="" status={{ label: 'Taslak', tone: 'neutral' }} onBack={ctx.back} onNavigate={ctx.open}
      nextStep={source ? { text: `Müşteri ve satırlar ${source.code} talebinden alındı. Fiyatları girip teklifi kaydedin.` } : undefined}
      hint={saved ? <><Check size={13}/> Taslak bu tarayıcıda saklandı</> : restored && dirty ? 'Yarım kalan taslak geri yüklendi' : undefined}
      primary={{ label: runner.busy ? 'Kaydediliyor…' : 'Teklifi kaydet', onClick: () => {}, submit: true, disabled: runner.busy }}
      secondary={sourceRequestId ? [] : [{ label: 'Taslağı temizle', onClick: discard, danger: true }]}
      flow={[...(source ? [{ step: 'request' as const, detail: source.code, state: 'done' as const, target: { key: 'sales-requests' as const, id: source.id } }] : []), { step: 'quote', state: 'current' }]}
      error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
      header={<div className="doc-grid">
        <Field label="Teklif no"><input value={draft.code} onChange={e => set({ code: e.target.value })} required maxLength={40} placeholder="T-2026-0001" autoFocus/></Field>
        <Field label="Müşteri" className="wide"><select value={draft.customerId} onChange={e => set({ customerId: e.target.value })} required disabled={!!sourceRequestId} title={sourceRequestId ? 'Müşteri talepten alınır' : undefined}>
          <option value="">Müşteri seçin</option>
          {customers.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.currencyCode})</option>)}
        </select></Field>
        <Field label="Teklif tarihi"><input type="date" value={draft.quoteDate} onChange={e => set({ quoteDate: e.target.value })} required/></Field>
        <Field label="Geçerlilik tarihi"><input type="date" min={draft.quoteDate} value={draft.validUntil} onChange={e => set({ validUntil: e.target.value })} required/></Field>
        <ReadField label="Para birimi" value={customer?.currencyCode ?? 'Müşteri kartından alınır'}/>
        <Field label="Açıklama" optional className="full"><textarea rows={2} value={draft.notes} onChange={e => set({ notes: e.target.value })} maxLength={1000}/></Field>
      </div>}
      side={<PartyCard token={ctx.token} partyId={draft.customerId} kind="customer" pendingAmount={totals.grandTotal} currency={customer?.currencyCode}/>}
      totals={{ ...totals, currency: customer?.currencyCode ?? '' }}>
      <div className="doc-stack">
        <LineEditor token={ctx.token} lines={draft.lines} onChange={lines => set({ lines })} stockItems={ctx.stockItems} priced available={available}/>
        {definitions.some(definition => definition.isActive) && <div className="doc-card">
          <div className="doc-section-title"><span>Özel alanlar</span></div>
          <CustomFieldInputs definitions={definitions} values={draft.customFields} onChange={customFields => set({ customFields })}/>
        </div>}
      </div>
    </DocumentShell>
  </form>
}

export function SalesQuoteDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [quote, setQuote] = useState<SalesQuoteDetail | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const runner = useRunner()
  const available = useStockAvailability(ctx.token, ctx.warehouses, quote?.status === 'Draft' || quote?.status === 'Sent' || quote?.status === 'Accepted')

  async function load() {
    const item = await api<SalesQuoteDetail>(`${basePath}/${id}`, ctx.token)
    setQuote(item)
    if (item.hasSalesOrder) {
      const page = await api<{ items: SalesOrderSummary[] }>(`/api/sales/orders/?q=${encodeURIComponent(item.code)}&page=1&pageSize=100`, ctx.token).catch(() => ({ items: [] }))
      setOrderId(page.items.find(order => order.quoteId === item.id)?.id ?? null)
    } else setOrderId(null)
  }
  useEffect(() => { setQuote(null); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!quote) return <DocumentShell title="Satış teklifi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Teklif yükleniyor…'}</div>}/>

  const act = (path: string, message: string) => runner.run(async () => { await api(`${basePath}/${quote.id}/${path}`, ctx.token, { method: 'POST' }); await load(); ctx.changed(); return message })
  async function convert() {
    let created = ''
    const ok = await runner.run(async () => { created = (await api<SalesOrderSummary>(`${basePath}/${quote!.id}/convert-to-order`, ctx.token, { method: 'POST' })).id })
    if (ok) { ctx.changed(); ctx.open('sales-orders', created) }
  }
  const expired = (quote.status === 'Draft' || quote.status === 'Sent') && quote.validUntil < localDateString()
  const primary = quote.status === 'Draft' ? { label: 'İletildi yap', onClick: () => void act('send', `${quote.code} teklifi iletildi durumuna alındı.`), disabled: runner.busy }
    : quote.status === 'Sent' ? { label: 'Kabul et', onClick: () => void act('accept', `${quote.code} teklifi kabul edildi.`), disabled: runner.busy }
    : quote.status === 'Accepted' && !quote.hasSalesOrder ? { label: 'Siparişe dönüştür', onClick: () => void convert(), disabled: runner.busy }
    : orderId ? { label: 'Siparişi aç', onClick: () => ctx.open('sales-orders', orderId) } : undefined
  const nextStep = expired ? { text: `Geçerlilik tarihi ${formatDate(quote.validUntil)} geçti; bu teklif iletilemez veya kabul edilemez.` }
    : quote.status === 'Draft' ? { text: 'Teklif taslak. Müşteriye gönderdiğinizde iletildi olarak işaretleyin.' }
    : quote.status === 'Sent' ? { text: 'Müşterinin yanıtı bekleniyor. Yanıt gelince kabul veya ret olarak işaretleyin.' }
    : quote.status === 'Accepted' && !quote.hasSalesOrder ? { text: 'Teklif kabul edildi. Sevkiyata başlamak için siparişe dönüştürün.', actionLabel: 'Siparişe dönüştür', onAction: () => void convert() }
    : undefined
  const flow: FlowLink[] = [
    ...(quote.salesRequestId ? [{ step: 'request' as const, detail: quote.salesRequestCode ?? undefined, state: 'done' as const, target: { key: 'sales-requests' as const, id: quote.salesRequestId } }] : []),
    { step: 'quote', detail: quote.code, state: 'current' },
    ...(quote.hasSalesOrder ? [{ step: 'order' as const, state: 'done' as const, target: orderId ? { key: 'sales-orders' as const, id: orderId } : undefined }] : []),
  ]

  return <DocumentShell title="Satış teklifi" code={quote.code} status={quoteStatus(quote.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={primary}
    secondary={quote.status === 'Sent' ? [{ label: 'Reddet', danger: true, disabled: runner.busy, onClick: () => { if (window.confirm(`${quote.code} teklifi reddedildi olarak işaretlensin mi?`)) void act('reject', `${quote.code} teklifi reddedildi.`) } }] : []}
    flow={flow} nextStep={nextStep} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
    header={<div className="doc-grid">
      <ReadField label="Müşteri" value={quote.customerName} className="wide"/>
      <ReadField label="Para birimi" value={quote.currencyCode}/>
      <ReadField label="Teklif tarihi" value={formatDate(quote.quoteDate)}/>
      <ReadField label="Geçerlilik tarihi" value={formatDate(quote.validUntil)}/>
      {quote.salesRequestId
        ? <ReadField label="Kaynak talep" value={<button className="doc-link" onClick={() => ctx.open('sales-requests', quote.salesRequestId!)}>{quote.salesRequestCode}</button>}/>
        : <ReadField label="Satır" value={String(quote.lines.length)}/>}
      {quote.notes && <ReadField label="Açıklama" value={quote.notes} className="full"/>}
    </div>}
    side={<PartyCard token={ctx.token} partyId={quote.customerId} kind="customer" pendingAmount={quote.status === 'Accepted' || quote.status === 'Rejected' ? 0 : quote.grandTotal} currency={quote.currencyCode}/>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: quote.lines.length, content: <LinesTable lines={quote.lines} rowKey={line => line.lineNumber} columns={[quantityColumn(), ...pricedColumns()]}
        hint={quote.hasSalesOrder || quote.status === 'Rejected' ? undefined : line => <StockHint available={available} stockItemId={line.stockItemId} needed={line.quantity} unit={line.unitCode}/>}/> },
      { key: 'fields', label: 'Özel alanlar', count: quote.customFields.length, content: <div className="doc-stack">
        <CustomFieldValues token={ctx.token} basePath={basePath} documentId={quote.id} fields={quote.customFields} editable={quote.status === 'Draft'} lockedText="Özel alanlar yalnızca taslak teklifte düzenlenebilir."
          onSaved={customFields => setQuote(current => current ? { ...current, customFields } : current)} onError={runner.setError} onNotice={runner.setNotice}/>
        {isAdmin(ctx) && <CustomFieldCatalog token={ctx.token} basePath={basePath} title="Teklif alan tanımları" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}
    totals={{ subtotal: quote.subtotal, discountTotal: quote.discountTotal, taxTotal: quote.taxTotal, grandTotal: quote.grandTotal, currency: quote.currencyCode }}/>
}
