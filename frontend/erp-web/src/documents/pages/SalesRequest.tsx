import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api, localDateString } from '../../lib/api'
import type { DocContext } from '../context'
import { quoteStatus, salesRequestStatus } from '../definitions'
import DocumentShell, { Field, ReadField, StatusPill, type FlowLink } from '../DocumentShell'
import { formatDate, formatMoney, formatQuantity } from '../format'
import type { SalesRequestDetail, SalesRequestSummary } from '../models'
import { LineEditor, LinesTable, PartyCard, StockHint, draftLinesValid, emptyLine, quantityColumn, useRunner, useStockAvailability, type DraftLine } from '../parts'
import { clearDraft, loadDraft, saveDraft } from '../storage'

const basePath = '/api/sales/requests'
type RequestDraft = { code: string; customerId: string; requestDate: string; neededByDate: string; description: string; lines: DraftLine[] }

export function SalesRequestEditor({ ctx }: { ctx: DocContext }) {
  const scope = ctx.scope('sales-requests')
  const blank = (): RequestDraft => ({ code: '', customerId: '', requestDate: localDateString(), neededByDate: '', description: '', lines: [emptyLine()] })
  const [restored] = useState(() => loadDraft<RequestDraft>(scope))
  const [draft, setDraft] = useState<RequestDraft>(() => restored && Array.isArray(restored.lines) ? { ...blank(), ...restored } : blank())
  const [saved, setSaved] = useState(false)
  const runner = useRunner()
  const available = useStockAvailability(ctx.token, ctx.warehouses)
  const customers = ctx.customers.filter(customer => customer.isActive && (customer.type === 'Customer' || customer.type === 'Both'))
  const dirty = !!(draft.code || draft.customerId || draft.description || draft.lines.some(line => line.stockItemId))

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => { saveDraft(scope, draft); setSaved(true) }, 600)
    return () => window.clearTimeout(timer)
  }, [draft, dirty])
  const set = (patch: Partial<RequestDraft>) => { setSaved(false); setDraft(current => ({ ...current, ...patch })) }
  function discard() { if (dirty && !window.confirm('Taslak silinsin mi?')) return; clearDraft(scope); setDraft(blank()); setSaved(false) }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draftLinesValid(draft.lines)) { runner.setError('Her satırda stok seçili ve miktar sıfırdan büyük olmalı.'); return }
    let createdId = ''
    const ok = await runner.run(async () => {
      const created = await api<SalesRequestSummary>(`${basePath}/`, ctx.token, { method: 'POST', body: JSON.stringify({
        code: draft.code, customerId: draft.customerId, requestDate: draft.requestDate, neededByDate: draft.neededByDate || null, description: draft.description || null,
        lines: draft.lines.map(line => ({ stockItemId: line.stockItemId, quantity: Number(line.quantity), unitCode: line.unitCode || ctx.stockItems.find(item => item.id === line.stockItemId)?.unitCode })),
      }) })
      createdId = created.id
    })
    if (ok) { clearDraft(scope); ctx.changed(); ctx.open('sales-requests', createdId) }
  }

  return <form onSubmit={submit}>
    <DocumentShell title="Yeni satış talebi" code="" status={{ label: 'Taslak', tone: 'neutral' }} onBack={ctx.back}
      hint={saved ? <><Check size={13}/> Taslak bu tarayıcıda saklandı</> : restored && dirty ? 'Yarım kalan taslak geri yüklendi' : undefined}
      primary={{ label: runner.busy ? 'Kaydediliyor…' : 'Talebi kaydet', onClick: () => {}, submit: true, disabled: runner.busy }}
      secondary={[{ label: 'Taslağı temizle', onClick: discard, danger: true }]}
      flow={[{ step: 'request', state: 'current' }]} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
      header={<div className="doc-grid">
        <Field label="Talep no"><input value={draft.code} onChange={e => set({ code: e.target.value })} required maxLength={40} placeholder="TLP-2026-0001" autoFocus/></Field>
        <Field label="Müşteri" className="wide"><select value={draft.customerId} onChange={e => set({ customerId: e.target.value })} required>
          <option value="">Müşteri seçin</option>
          {customers.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.currencyCode})</option>)}
        </select></Field>
        <Field label="Talep tarihi"><input type="date" value={draft.requestDate} onChange={e => set({ requestDate: e.target.value })} required/></Field>
        <Field label="İhtiyaç tarihi" optional><input type="date" min={draft.requestDate} value={draft.neededByDate} onChange={e => set({ neededByDate: e.target.value })}/></Field>
        <Field label="Açıklama" optional className="full"><textarea rows={2} value={draft.description} onChange={e => set({ description: e.target.value })} maxLength={1000} placeholder="Müşterinin talebiyle ilgili notlar"/></Field>
      </div>}
      side={<PartyCard token={ctx.token} partyId={draft.customerId} kind="customer"/>}>
      <div className="doc-stack">
        <LineEditor token={ctx.token} lines={draft.lines} onChange={lines => set({ lines })} stockItems={ctx.stockItems} priced={false} available={available}/>
        <p className="muted">Talepte fiyat girilmez; fiyatlar talepten hazırlanan teklifte belirlenir.</p>
      </div>
    </DocumentShell>
  </form>
}

export function SalesRequestDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const [request, setRequest] = useState<SalesRequestDetail | null>(null)
  const [tab, setTab] = useState('lines')
  const runner = useRunner()
  const available = useStockAvailability(ctx.token, ctx.warehouses, request?.status !== 'Cancelled')

  async function load() { setRequest(await api<SalesRequestDetail>(`${basePath}/${id}`, ctx.token)) }
  useEffect(() => { setRequest(null); setTab('lines'); void load().catch(e => runner.setError((e as Error).message)) }, [id, ctx.token])

  if (!request) return <DocumentShell title="Satış talebi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Talep yükleniyor…'}</div>}/>

  const active = request.status !== 'Cancelled'
  const prepareQuote = () => ctx.create('sales-quotes', request.id)
  function cancel() {
    const reason = window.prompt('İptal gerekçesi:')?.trim()
    if (!reason) return
    void runner.run(async () => {
      setRequest(await api<SalesRequestDetail>(`${basePath}/${request!.id}/cancel`, ctx.token, { method: 'POST', body: JSON.stringify({ reason }) }))
      ctx.changed(); return `${request!.code} talebi iptal edildi.`
    })
  }
  const flow: FlowLink[] = [
    { step: 'request', detail: request.code, state: 'current' },
    ...(request.quotes.length ? [{ step: 'quote' as const, detail: request.quotes.length === 1 ? request.quotes[0].code : String(request.quotes.length), state: request.quotes.some(quote => quote.status === 'Accepted') ? 'done' as const : 'partial' as const, target: request.quotes.length === 1 ? { key: 'sales-quotes' as const, id: request.quotes[0].id } : undefined }] : []),
  ]

  return <DocumentShell title="Satış talebi" code={request.code} status={salesRequestStatus(request.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={active ? { label: request.quotes.length ? 'Yeni teklif hazırla' : 'Teklif hazırla', onClick: prepareQuote } : undefined}
    secondary={request.status === 'Open' ? [{ label: 'Talebi iptal et', danger: true, disabled: runner.busy, onClick: cancel }] : []}
    flow={flow}
    nextStep={request.status === 'Open' ? { text: 'Talep açık. Müşteriye fiyat vermek için talepten teklif hazırlayın.', actionLabel: 'Teklif hazırla', onAction: prepareQuote }
      : request.status === 'Quoted' ? { text: `Bu talep için ${request.quotes.length} teklif hazırlandı.`, actionLabel: 'Teklifleri gör', onAction: () => setTab('quotes') }
      : { text: `Talep iptal edildi${request.cancelReason ? `: ${request.cancelReason}` : '.'}` }}
    error={runner.error} notice={runner.notice} onDismiss={runner.dismiss} tab={tab} onTab={setTab}
    header={<div className="doc-grid">
      <ReadField label="Müşteri" value={request.customerName} className="wide"/>
      <ReadField label="Para birimi" value={request.currencyCode}/>
      <ReadField label="Talep tarihi" value={formatDate(request.requestDate)}/>
      <ReadField label="İhtiyaç tarihi" value={formatDate(request.neededByDate)}/>
      <ReadField label="Satır" value={String(request.lines.length)}/>
      {request.description && <ReadField label="Açıklama" value={request.description} className="full"/>}
    </div>}
    side={<PartyCard token={ctx.token} partyId={request.customerId} kind="customer" currency={request.currencyCode}/>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: request.lines.length, content: <LinesTable lines={request.lines} rowKey={line => line.lineNumber}
        hint={active ? line => <StockHint available={available} stockItemId={line.stockItemId} needed={line.quantity} unit={line.unitCode}/> : undefined}
        columns={[
          quantityColumn(),
          { label: 'Girilen', align: 'right', render: line => line.enteredQuantity && line.enteredUnitCode ? `${formatQuantity(line.enteredQuantity)} ${line.enteredUnitCode}` : '—' },
        ]}/> },
      { key: 'quotes', label: 'Teklifler', count: request.quotes.length, content: <div className="doc-row-list">
        {request.quotes.length === 0 && <div className="doc-card"><p className="muted">Bu talep için henüz teklif hazırlanmadı.</p></div>}
        {request.quotes.map(quote => <div className="doc-row-item" key={quote.id}>
          <div><button className="doc-link" onClick={() => ctx.open('sales-quotes', quote.id)}>{quote.code}</button><small>{formatDate(quote.quoteDate)} · {formatMoney(quote.grandTotal, quote.currencyCode)}</small></div>
          <StatusPill status={quoteStatus(quote.status)}/>
        </div>)}
      </div> },
    ]}/>
}
