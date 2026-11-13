import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api, localDateString } from '../../lib/api'
import { isAdmin, type DocContext } from '../context'
import { CustomFieldCatalog, CustomFieldInputs, CustomFieldValues, useFieldDefinitions } from '../customFields'
import { purchaseRequestStatus } from '../definitions'
import DocumentShell, { Field, ReadField, type FlowLink } from '../DocumentShell'
import { formatDate, formatMoney, formatNumber, formatQuantity } from '../format'
import { documentTotals } from '../lineMath'
import type { PurchaseOrderSummary, PurchaseRequestDetail, PurchaseRequestSummary, PurchaseSupplierQuote } from '../models'
import { LineEditor, LinesTable, draftLinesValid, emptyLine, quantityColumn, useRunner, type DraftLine } from '../parts'
import { clearDraft, loadDraft, saveDraft } from '../storage'

const basePath = '/api/purchasing/requests'
const quotePath = '/api/purchasing/supplier-quotes'
type RequestDraft = { code: string; requestDate: string; neededByDate: string; description: string; lines: DraftLine[]; customFields: Record<string, string> }
type LinePrice = { unitPrice: string; discountPercent: string; vatPercent: string }
const blankPrice = (): LinePrice => ({ unitPrice: '0', discountPercent: '0', vatPercent: '20' })

export function PurchaseRequestEditor({ ctx }: { ctx: DocContext }) {
  const scope = ctx.scope('purchase-requests')
  const blank = (): RequestDraft => ({ code: '', requestDate: localDateString(), neededByDate: '', description: '', lines: [emptyLine()], customFields: {} })
  const [restored] = useState(() => loadDraft<RequestDraft>(scope))
  const [draft, setDraft] = useState<RequestDraft>(() => restored && Array.isArray(restored.lines) ? { ...blank(), ...restored } : blank())
  const [saved, setSaved] = useState(false)
  const runner = useRunner()
  const definitions = useFieldDefinitions(ctx.token, basePath)
  const dirty = !!(draft.code || draft.description || draft.lines.some(line => line.stockItemId))

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
      const created = await api<PurchaseRequestSummary>(`${basePath}/`, ctx.token, { method: 'POST', body: JSON.stringify({
        code: draft.code, requestDate: draft.requestDate, neededByDate: draft.neededByDate || null, description: draft.description, customFields: draft.customFields,
        lines: draft.lines.map(line => ({ stockItemId: line.stockItemId, quantity: Number(line.quantity), unitCode: line.unitCode || ctx.stockItems.find(item => item.id === line.stockItemId)?.unitCode })),
      }) })
      createdId = created.id
    })
    if (ok) { clearDraft(scope); ctx.changed(); ctx.open('purchase-requests', createdId) }
  }

  return <form onSubmit={submit}>
    <DocumentShell title="Yeni satınalma talebi" code="" status={{ label: 'Taslak', tone: 'neutral' }} onBack={ctx.back}
      hint={saved ? <><Check size={13}/> Taslak bu tarayıcıda saklandı</> : restored && dirty ? 'Yarım kalan taslak geri yüklendi' : undefined}
      primary={{ label: runner.busy ? 'Gönderiliyor…' : 'Onaya gönder', onClick: () => {}, submit: true, disabled: runner.busy }}
      secondary={[{ label: 'Taslağı temizle', onClick: discard, danger: true }]}
      flow={[{ step: 'request', state: 'current' }]} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
      header={<div className="doc-grid">
        <Field label="Talep no"><input value={draft.code} onChange={e => set({ code: e.target.value })} required maxLength={40} placeholder="SA-2026-0001" autoFocus/></Field>
        <Field label="Talep tarihi"><input type="date" value={draft.requestDate} onChange={e => set({ requestDate: e.target.value })} required/></Field>
        <Field label="İhtiyaç tarihi" optional><input type="date" min={draft.requestDate} value={draft.neededByDate} onChange={e => set({ neededByDate: e.target.value })}/></Field>
        <Field label="Gerekçe" className="full"><textarea rows={2} value={draft.description} onChange={e => set({ description: e.target.value })} required maxLength={500} placeholder="Satın alma gerekçesi"/></Field>
      </div>}>
      <div className="doc-stack">
        <LineEditor token={ctx.token} lines={draft.lines} onChange={lines => set({ lines })} stockItems={ctx.stockItems} priced={false}/>
        {definitions.some(definition => definition.isActive) && <div className="doc-card">
          <div className="doc-section-title"><span>Özel alanlar</span></div>
          <CustomFieldInputs definitions={definitions} values={draft.customFields} onChange={customFields => set({ customFields })}/>
        </div>}
        <p className="muted">Talep kaydedildiğinde doğrudan onaya gönderilir; talep eden kişi kendi talebini onaylayamaz.</p>
      </div>
    </DocumentShell>
  </form>
}

function PriceTable({ request, prices, onChange }: { request: PurchaseRequestDetail; prices: Record<number, LinePrice>; onChange: (lineNumber: number, patch: Partial<LinePrice>) => void }) {
  return <div className="doc-table-wrap"><table className="doc-table doc-line-editor">
    <thead><tr><th>Stok</th><th className="num">Miktar</th><th style={{ width: 130 }} className="num">Birim fiyat</th><th style={{ width: 90 }} className="num">İsk %</th><th style={{ width: 90 }} className="num">KDV %</th></tr></thead>
    <tbody>{request.lines.map(line => { const price = prices[line.lineNumber] ?? blankPrice(); return <tr key={line.lineNumber}>
      <td style={{ paddingTop: 14 }}><b>{line.stockCode}</b> · {line.stockName}</td>
      <td className="num" style={{ paddingTop: 14 }}>{formatQuantity(line.quantity)} {line.unitCode}</td>
      <td><input type="number" min="0" step="0.0001" required value={price.unitPrice} onChange={e => onChange(line.lineNumber, { unitPrice: e.target.value })} aria-label={`${line.stockCode} birim fiyat`}/></td>
      <td><input type="number" min="0" max="100" step="0.01" required value={price.discountPercent} onChange={e => onChange(line.lineNumber, { discountPercent: e.target.value })} aria-label={`${line.stockCode} iskonto yüzdesi`}/></td>
      <td><input type="number" min="0" max="100" step="0.01" required value={price.vatPercent} onChange={e => onChange(line.lineNumber, { vatPercent: e.target.value })} aria-label={`${line.stockCode} KDV yüzdesi`}/></td>
    </tr> })}</tbody>
  </table></div>
}

const priceTotal = (request: PurchaseRequestDetail, prices: Record<number, LinePrice>) =>
  documentTotals(request.lines.map(line => { const price = prices[line.lineNumber] ?? blankPrice(); return { quantity: line.quantity, unitPrice: Number(price.unitPrice), discountPercent: Number(price.discountPercent), vatPercent: Number(price.vatPercent) } })).grandTotal

export function PurchaseRequestDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const today = localDateString()
  const admin = isAdmin(ctx)
  const [request, setRequest] = useState<PurchaseRequestDetail | null>(null)
  const [quotes, setQuotes] = useState<PurchaseSupplierQuote[]>([])
  const [tab, setTab] = useState('lines')
  const [form, setForm] = useState<'quote' | 'order' | null>(null)
  const runner = useRunner()
  const quoteDefinitions = useFieldDefinitions(ctx.token, quotePath)
  const orderDefinitions = useFieldDefinitions(ctx.token, '/api/purchasing/orders')
  const suppliers = ctx.customers.filter(customer => customer.isActive && (customer.type === 'Supplier' || customer.type === 'Both'))
  // tedarikçi teklifi formu
  const [quoteCode, setQuoteCode] = useState(''), [quoteSupplierId, setQuoteSupplierId] = useState(''), [quoteDate, setQuoteDate] = useState(today), [quoteValidUntil, setQuoteValidUntil] = useState(''), [quoteNotes, setQuoteNotes] = useState('')
  const [quotePrices, setQuotePrices] = useState<Record<number, LinePrice>>({}), [quoteFields, setQuoteFields] = useState<Record<string, string>>({})
  // siparişe dönüştürme formu
  const [orderCode, setOrderCode] = useState(''), [orderSupplierId, setOrderSupplierId] = useState(''), [orderDate, setOrderDate] = useState(today), [orderWarehouseId, setOrderWarehouseId] = useState(''), [orderNotes, setOrderNotes] = useState('')
  const [orderPrices, setOrderPrices] = useState<Record<number, LinePrice>>({}), [orderFields, setOrderFields] = useState<Record<string, string>>({}), [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)

  async function load() {
    const item = await api<PurchaseRequestDetail>(`${basePath}/${id}`, ctx.token)
    setRequest(item)
    setQuotes(item.status === 'Approved' || item.status === 'Ordered' ? await api<PurchaseSupplierQuote[]>(`${basePath}/${id}/supplier-quotes`, ctx.token) : [])
    return item
  }
  useEffect(() => { setRequest(null); setForm(null); setTab('lines')
    void load().then(item => {
      if (item.status !== 'Approved' && item.status !== 'Ordered') return
      if (ctx.intent === 'quote' && admin && item.status === 'Approved') beginQuote(item)
      else if (ctx.intent === 'quote') setTab('quotes')
    }).catch(e => runner.setError((e as Error).message))
  }, [id, ctx.token])

  if (!request) return <DocumentShell title="Satınalma talebi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Talep yükleniyor…'}</div>}/>

  const canOrder = admin && request.status === 'Approved' && !request.purchaseOrderId
  const comparable = quotes.filter(quote => quote.comparableGrandTotal !== null)
  const bestQuoteId = comparable.length > 1 ? comparable.reduce((best, quote) => quote.comparableGrandTotal! < best.comparableGrandTotal! ? quote : best).id : null
  const selectedQuote = quotes.find(quote => quote.id === selectedQuoteId)

  function decide(approved: boolean) {
    const note = approved ? window.prompt('Onay notu (isteğe bağlı):')?.trim() || null : window.prompt('Ret gerekçesi:')?.trim()
    if (!approved && !note) return
    if (!window.confirm(approved ? 'Bu talep onaylansın mı?' : 'Bu talep reddedilsin mi?')) return
    void runner.run(async () => {
      await api(`${basePath}/${request!.id}/decision`, ctx.token, { method: 'POST', body: JSON.stringify({ approved, note }) })
      await load(); ctx.changed(); return `${request!.code} talebi ${approved ? 'onaylandı' : 'reddedildi'}.`
    })
  }
  function beginQuote(target = request) {
    if (!target) return
    setQuoteCode(''); setQuoteSupplierId(''); setQuoteDate(today); setQuoteValidUntil(''); setQuoteNotes(''); setQuoteFields({})
    setQuotePrices(Object.fromEntries(target.lines.map(line => [line.lineNumber, blankPrice()])))
    setForm('quote'); setTab('quotes')
  }
  function beginOrder(quote?: PurchaseSupplierQuote) {
    setOrderCode(''); setOrderSupplierId(quote?.supplierId ?? ''); setOrderDate(today); setOrderWarehouseId(''); setOrderNotes(quote ? `Tedarikçi teklifi ${quote.code}` : ''); setSelectedQuoteId(quote?.id ?? null)
    setOrderPrices(Object.fromEntries(request!.lines.map(line => { const priced = quote?.lines.find(item => item.requestLineNumber === line.lineNumber); return [line.lineNumber, priced ? { unitPrice: String(priced.unitPrice), discountPercent: String(priced.discountPercent), vatPercent: String(priced.vatPercent) } : blankPrice()] })))
    setOrderFields(Object.fromEntries(orderDefinitions.filter(definition => definition.isActive).map(definition => [definition.code, request!.customFields?.find(value => value.code.toLowerCase() === definition.code.toLowerCase())?.value ?? ''])))
    setForm('order'); setTab('quotes')
  }
  const saveQuote = (event: React.FormEvent) => { event.preventDefault(); void runner.run(async () => {
    const quote = await api<PurchaseSupplierQuote>(`${basePath}/${request.id}/supplier-quotes`, ctx.token, { method: 'POST', body: JSON.stringify({
      code: quoteCode, supplierId: quoteSupplierId, quoteDate, validUntil: quoteValidUntil || null, notes: quoteNotes || null, customFields: quoteFields,
      lines: request.lines.map(line => { const price = quotePrices[line.lineNumber] ?? blankPrice(); return { requestLineNumber: line.lineNumber, unitPrice: Number(price.unitPrice), discountPercent: Number(price.discountPercent), vatPercent: Number(price.vatPercent) } }),
    }) })
    setForm(null); await load(); return `${quote.supplierName} için ${quote.code} teklifi kaydedildi.`
  }) }
  async function saveOrder(event: React.FormEvent) {
    event.preventDefault()
    let createdId = ''
    const ok = await runner.run(async () => {
      const created = await api<PurchaseOrderSummary>(`${basePath}/${request!.id}/order`, ctx.token, { method: 'POST', body: JSON.stringify({
        code: orderCode, supplierId: orderSupplierId, orderDate, expectedReceiptDate: request!.neededByDate, targetWarehouseId: orderWarehouseId || null, notes: orderNotes || null, supplierQuoteId: selectedQuoteId, customFields: orderFields,
        lines: request!.lines.map(line => { const price = orderPrices[line.lineNumber] ?? blankPrice(); return { lineNumber: line.lineNumber, unitPrice: Number(price.unitPrice), discountPercent: Number(price.discountPercent), vatPercent: Number(price.vatPercent) } }),
      }) })
      createdId = created.id
    })
    if (ok) { ctx.changed(); ctx.open('purchase-orders', createdId) }
  }

  const primary = admin && request.status === 'Submitted' ? { label: 'Onayla', onClick: () => decide(true), disabled: runner.busy }
    : canOrder ? { label: 'Siparişe dönüştür', onClick: () => beginOrder(), disabled: runner.busy }
    : request.purchaseOrderId ? { label: 'Siparişi aç', onClick: () => ctx.open('purchase-orders', request.purchaseOrderId!) } : undefined
  const nextStep = request.status === 'Submitted' ? { text: admin ? 'Talep onayınızı bekliyor. Talep eden kişi kendi talebini onaylayamaz.' : 'Talep yönetici onayını bekliyor.' }
    : request.status === 'Approved' && !request.purchaseOrderId ? (quotes.length === 0
      ? { text: 'Talep onaylandı. Tedarikçilerden teklif toplayın ya da doğrudan sipariş verin.', actionLabel: admin ? 'Teklif kaydet' : undefined, onAction: admin ? () => beginQuote() : undefined }
      : { text: `${quotes.length} tedarikçi teklifi kaydedildi. En uygun teklifi seçip siparişe dönüştürün.`, actionLabel: 'Teklifleri karşılaştır', onAction: () => setTab('quotes') })
    : request.status === 'Ordered' ? { text: `Bu talep ${request.purchaseOrderCode} siparişine dönüştürüldü.` } : undefined
  const flow: FlowLink[] = [
    { step: 'request', detail: request.code, state: 'current' },
    ...(quotes.length ? [{ step: 'quote' as const, detail: String(quotes.length), state: quotes.some(quote => quote.status === 'Selected') ? 'done' as const : 'partial' as const }] : []),
    ...(request.purchaseOrderId ? [{ step: 'order' as const, detail: request.purchaseOrderCode ?? undefined, state: 'done' as const, target: { key: 'purchase-orders' as const, id: request.purchaseOrderId } }] : []),
  ]

  return <DocumentShell title="Satınalma talebi" code={request.code} status={purchaseRequestStatus(request.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={primary}
    secondary={[
      ...(admin && request.status === 'Submitted' ? [{ label: 'Reddet', danger: true, disabled: runner.busy, onClick: () => decide(false) }] : []),
      ...(admin && request.status === 'Approved' ? [{ label: 'Tedarikçi teklifi kaydet', disabled: runner.busy, onClick: () => beginQuote() }] : []),
    ]}
    flow={flow} nextStep={nextStep} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss} tab={tab} onTab={setTab}
    header={<div className="doc-grid">
      <ReadField label="Talep eden" value={request.requestedByName}/>
      <ReadField label="Talep tarihi" value={formatDate(request.requestDate)}/>
      <ReadField label="İhtiyaç tarihi" value={formatDate(request.neededByDate)}/>
      <ReadField label="Gerekçe" value={request.description} className="full"/>
      {request.reviewedByName && <ReadField label="Karar veren" value={`${request.reviewedByName}${request.reviewedAt ? ` · ${formatDate(request.reviewedAt)}` : ''}`}/>}
      {request.reviewNote && <ReadField label="Karar notu" value={request.reviewNote} className="wide"/>}
    </div>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: request.lines.length, content: <LinesTable lines={request.lines} rowKey={line => line.lineNumber} columns={[quantityColumn()]}/> },
      ...(request.status === 'Approved' || request.status === 'Ordered' ? [{ key: 'quotes', label: 'Tedarikçi teklifleri', count: quotes.length, content: <div className="doc-stack">
        {form === 'quote' && <form className="doc-card" onSubmit={saveQuote}>
          <div className="doc-section-title"><span>Tedarikçi teklifi kaydet</span><small>Toplam {formatNumber(priceTotal(request, quotePrices))}</small></div>
          <div className="doc-grid" style={{ marginBottom: 12 }}>
            <Field label="Teklif no"><input value={quoteCode} onChange={e => setQuoteCode(e.target.value)} required maxLength={40} placeholder="TKL-2026-001"/></Field>
            <Field label="Tedarikçi" className="wide"><select value={quoteSupplierId} onChange={e => setQuoteSupplierId(e.target.value)} required><option value="">Tedarikçi seçin</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.currencyCode})</option>)}</select></Field>
            <Field label="Teklif tarihi"><input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} required/></Field>
            <Field label="Geçerlilik tarihi" optional><input type="date" min={quoteDate} value={quoteValidUntil} onChange={e => setQuoteValidUntil(e.target.value)}/></Field>
            <Field label="Not" optional><input value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)} maxLength={500}/></Field>
          </div>
          <PriceTable request={request} prices={quotePrices} onChange={(lineNumber, patch) => setQuotePrices(current => ({ ...current, [lineNumber]: { ...(current[lineNumber] ?? blankPrice()), ...patch } }))}/>
          {quoteDefinitions.some(definition => definition.isActive) && <div style={{ marginTop: 12 }}><CustomFieldInputs definitions={quoteDefinitions} values={quoteFields} onChange={setQuoteFields}/></div>}
          <div className="doc-form-foot"><span>Teklif tutarı, teklif tarihindeki kurla firma para birimine çevrilerek karşılaştırılır.</span>
            <span className="doc-inline-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Vazgeç</button><button className="primary" disabled={runner.busy}>{runner.busy ? 'Kaydediliyor…' : 'Teklifi kaydet'}</button></span></div>
        </form>}
        {form === 'order' && <form className="doc-card" onSubmit={saveOrder}>
          <div className="doc-section-title"><span>Talebi siparişe dönüştür{selectedQuote ? ` · ${selectedQuote.supplierName} teklifiyle` : ''}</span><small>Toplam {formatNumber(priceTotal(request, orderPrices))}</small></div>
          <div className="doc-grid" style={{ marginBottom: 12 }}>
            <Field label="Sipariş no"><input value={orderCode} onChange={e => setOrderCode(e.target.value)} required maxLength={40} placeholder="ST-SIP-2026-0001"/></Field>
            <Field label="Tedarikçi" className="wide"><select value={orderSupplierId} onChange={e => setOrderSupplierId(e.target.value)} required disabled={!!selectedQuoteId}><option value="">Tedarikçi seçin</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.currencyCode})</option>)}</select></Field>
            <Field label="Sipariş tarihi"><input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} required/></Field>
            <ReadField label="Beklenen teslim" value={formatDate(request.neededByDate)}/>
            <Field label="Hedef depo" optional><select value={orderWarehouseId} onChange={e => setOrderWarehouseId(e.target.value)}><option value="">Belirtilmedi</option>{ctx.warehouses.filter(warehouse => warehouse.isActive).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></Field>
            <Field label="Not" optional className="full"><input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} maxLength={1000}/></Field>
          </div>
          <PriceTable request={request} prices={orderPrices} onChange={(lineNumber, patch) => setOrderPrices(current => ({ ...current, [lineNumber]: { ...(current[lineNumber] ?? blankPrice()), ...patch } }))}/>
          {orderDefinitions.some(definition => definition.isActive) && <div style={{ marginTop: 12 }}><CustomFieldInputs definitions={orderDefinitions} values={orderFields} onChange={setOrderFields}/></div>}
          <div className="doc-form-foot"><span>Sipariş para birimi seçilen tedarikçi kartından alınır.</span>
            <span className="doc-inline-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Vazgeç</button><button className="primary" disabled={runner.busy}>{runner.busy ? 'Oluşturuluyor…' : 'Siparişi oluştur'}</button></span></div>
        </form>}
        <div className="doc-row-list">
          {quotes.length === 0 && form !== 'quote' && <div className="doc-card"><p className="muted">Henüz tedarikçi teklifi kaydedilmedi.</p></div>}
          {quotes.map(quote => <div className="doc-row-item" key={quote.id} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <span><b>{quote.supplierName}</b> · <button className="doc-link" onClick={() => ctx.open('purchase-quotes', quote.id)}>{quote.code}</button></span>
              <small>{formatDate(quote.quoteDate)} · {quote.validUntil ? `geçerlilik ${formatDate(quote.validUntil)}` : 'geçerlilik tarihi yok'} · {formatMoney(quote.grandTotal, quote.currencyCode)}</small>
              <small>{quote.comparableGrandTotal === null ? 'Kur bulunamadı; karşılaştırılamıyor' : `Karşılaştırma tutarı ${formatMoney(quote.comparableGrandTotal, quote.baseCurrencyCode)}${quote.appliedRateDate ? ` · kur tarihi ${formatDate(quote.appliedRateDate)}` : ''}`}</small>
              {quote.notes && <small>{quote.notes}</small>}
              {quote.customFields?.length > 0 && <small>{quote.customFields.map(field => `${field.label}: ${field.value || '—'}`).join(' · ')}</small>}
              <details style={{ marginTop: 6 }}><summary className="doc-text-button" style={{ padding: 0, cursor: 'pointer' }}>Kalem fiyatları</summary>
                <table className="doc-table" style={{ marginTop: 6 }}><thead><tr><th>Kalem</th><th className="num">Miktar</th><th className="num">Birim fiyat</th><th className="num">İsk %</th><th className="num">KDV %</th><th className="num">Tutar</th></tr></thead>
                  <tbody>{quote.lines.map(line => <tr key={line.requestLineNumber}><td><b>{line.stockCode}</b> · {line.stockName}</td><td className="num">{formatQuantity(line.quantity)} {line.unitCode}</td><td className="num">{formatNumber(line.unitPrice, 2, 4)}</td><td className="num">{formatQuantity(line.discountPercent)}</td><td className="num">{formatQuantity(line.vatPercent)}</td><td className="num">{formatNumber(line.lineTotal)}</td></tr>)}</tbody></table>
              </details>
            </div>
            <span className="doc-inline-actions">
              {quote.id === bestQuoteId && <span className="doc-pill success">En uygun</span>}
              {quote.status === 'Selected' && <span className="doc-pill info">Seçildi</span>}
              {quote.status === 'NotSelected' && <span className="doc-pill">Seçilmedi</span>}
              {canOrder && <button className="secondary small-button" disabled={runner.busy} onClick={() => beginOrder(quote)}>Bu teklifle sipariş ver</button>}
            </span>
          </div>)}
        </div>
        {admin && <CustomFieldCatalog token={ctx.token} basePath={quotePath} title="Tedarikçi teklifi alan tanımları" history="none" onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> }] : []),
      { key: 'fields', label: 'Özel alanlar', count: request.customFields?.length ?? 0, content: <div className="doc-stack">
        <CustomFieldValues token={ctx.token} basePath={basePath} documentId={request.id} fields={request.customFields ?? []} editable={request.status === 'Submitted'} lockedText="Onay sonrası özel alanlar değiştirilemez."
          onSaved={customFields => setRequest(current => current ? { ...current, customFields } : current)} onError={runner.setError} onNotice={runner.setNotice}/>
        {admin && <CustomFieldCatalog token={ctx.token} basePath={basePath} title="Talep alan tanımları" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}/>
}
