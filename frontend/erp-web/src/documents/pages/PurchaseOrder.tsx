import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { api, localDateString } from '../../lib/api'
import { isAdmin, type DocContext } from '../context'
import { CustomFieldCatalog, CustomFieldInputs, CustomFieldValues, useFieldDefinitions } from '../customFields'
import { postedStatus, purchaseInvoiceStatus, purchaseOrderStatus } from '../definitions'
import DocumentShell, { Field, ReadField, StatusPill, type FlowLink } from '../DocumentShell'
import { formatDate, formatMoney, formatNumber, formatQuantity } from '../format'
import { documentTotals } from '../lineMath'
import type { PurchaseInvoiceSummary, PurchaseOrderDetail, PurchaseOrderSummary, PurchaseReceipt } from '../models'
import { LineEditor, LinesTable, PartyCard, QuantityEntry, WarehouseSelect, draftLinesValid, emptyLine, quantityColumn, useLineUnits, useRunner, type DraftLine } from '../parts'
import { clearDraft, loadDraft, saveDraft } from '../storage'

const basePath = '/api/purchasing/orders'
const receiptPath = '/api/purchasing/receipts'
type OrderDraft = { code: string; supplierId: string; orderDate: string; expectedReceiptDate: string; targetWarehouseId: string; notes: string; lines: DraftLine[]; customFields: Record<string, string> }

export function PurchaseOrderEditor({ ctx }: { ctx: DocContext }) {
  const scope = ctx.scope('purchase-orders')
  const blank = (): OrderDraft => ({ code: '', supplierId: '', orderDate: localDateString(), expectedReceiptDate: '', targetWarehouseId: '', notes: '', lines: [emptyLine()], customFields: {} })
  const [restored] = useState(() => loadDraft<OrderDraft>(scope))
  const [draft, setDraft] = useState<OrderDraft>(() => restored && Array.isArray(restored.lines) ? { ...blank(), ...restored } : blank())
  const [saved, setSaved] = useState(false)
  const runner = useRunner()
  const definitions = useFieldDefinitions(ctx.token, basePath)
  const suppliers = ctx.customers.filter(customer => customer.isActive && (customer.type === 'Supplier' || customer.type === 'Both'))
  const supplier = ctx.customers.find(item => item.id === draft.supplierId)
  const totals = useMemo(() => documentTotals(draft.lines.map(line => ({ quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discountPercent: Number(line.discountPercent), vatPercent: Number(line.vatPercent) }))), [draft.lines])
  const dirty = !!(draft.code || draft.supplierId || draft.notes || draft.lines.some(line => line.stockItemId))

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => { saveDraft(scope, draft); setSaved(true) }, 600)
    return () => window.clearTimeout(timer)
  }, [draft, dirty])
  const set = (patch: Partial<OrderDraft>) => { setSaved(false); setDraft(current => ({ ...current, ...patch })) }
  function discard() { if (dirty && !window.confirm('Taslak silinsin mi?')) return; clearDraft(scope); setDraft(blank()); setSaved(false) }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supplier) { runner.setError('Tedarikçi seçin.'); return }
    if (!draftLinesValid(draft.lines)) { runner.setError('Her satırda stok seçili ve miktar sıfırdan büyük olmalı.'); return }
    let createdId = ''
    const ok = await runner.run(async () => {
      const created = await api<PurchaseOrderSummary>(`${basePath}/`, ctx.token, { method: 'POST', body: JSON.stringify({
        code: draft.code, supplierId: draft.supplierId, orderDate: draft.orderDate, expectedReceiptDate: draft.expectedReceiptDate || null, targetWarehouseId: draft.targetWarehouseId || null,
        currencyCode: supplier.currencyCode, notes: draft.notes || null, customFields: draft.customFields,
        lines: draft.lines.map(line => ({ stockItemId: line.stockItemId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discountPercent: Number(line.discountPercent), vatPercent: Number(line.vatPercent), unitCode: line.unitCode || ctx.stockItems.find(item => item.id === line.stockItemId)?.unitCode })),
      }) })
      createdId = created.id
    })
    if (ok) { clearDraft(scope); ctx.changed(); ctx.open('purchase-orders', createdId) }
  }

  return <form onSubmit={submit}>
    <DocumentShell title="Yeni satınalma siparişi" code="" status={{ label: 'Taslak', tone: 'neutral' }} onBack={ctx.back}
      hint={saved ? <><Check size={13}/> Taslak bu tarayıcıda saklandı</> : restored && dirty ? 'Yarım kalan taslak geri yüklendi' : undefined}
      primary={{ label: runner.busy ? 'Kaydediliyor…' : 'Siparişi kaydet', onClick: () => {}, submit: true, disabled: runner.busy }}
      secondary={[{ label: 'Taslağı temizle', onClick: discard, danger: true }]}
      flow={[{ step: 'order', state: 'current' }]} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss}
      header={<div className="doc-grid">
        <Field label="Sipariş no"><input value={draft.code} onChange={e => set({ code: e.target.value })} required maxLength={40} placeholder="ST-2026-0001" autoFocus/></Field>
        <Field label="Tedarikçi" className="wide"><select value={draft.supplierId} onChange={e => set({ supplierId: e.target.value })} required>
          <option value="">Tedarikçi seçin</option>
          {suppliers.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.currencyCode})</option>)}
        </select></Field>
        <Field label="Sipariş tarihi"><input type="date" value={draft.orderDate} onChange={e => set({ orderDate: e.target.value })} required/></Field>
        <Field label="Beklenen teslim" optional><input type="date" min={draft.orderDate} value={draft.expectedReceiptDate} onChange={e => set({ expectedReceiptDate: e.target.value })}/></Field>
        <Field label="Hedef depo" optional><select value={draft.targetWarehouseId} onChange={e => set({ targetWarehouseId: e.target.value })}>
          <option value="">Belirtilmedi</option>
          {ctx.warehouses.filter(warehouse => warehouse.isActive).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
        </select></Field>
        <ReadField label="Para birimi" value={supplier?.currencyCode ?? 'Tedarikçi kartından alınır'}/>
        <Field label="Açıklama" optional className="wide"><input value={draft.notes} onChange={e => set({ notes: e.target.value })} maxLength={1000}/></Field>
      </div>}
      side={<PartyCard token={ctx.token} partyId={draft.supplierId} kind="supplier" currency={supplier?.currencyCode}/>}
      totals={{ ...totals, currency: supplier?.currencyCode ?? '' }}>
      <div className="doc-stack">
        <LineEditor token={ctx.token} lines={draft.lines} onChange={lines => set({ lines })} stockItems={ctx.stockItems} priced/>
        {definitions.some(definition => definition.isActive) && <div className="doc-card">
          <div className="doc-section-title"><span>Özel alanlar</span></div>
          <CustomFieldInputs definitions={definitions} values={draft.customFields} onChange={customFields => set({ customFields })}/>
        </div>}
      </div>
    </DocumentShell>
  </form>
}

type Tracking = { serials: string; lot: string; expiry: string }

export function PurchaseOrderDocument({ id, ctx }: { id: string; ctx: DocContext }) {
  const today = localDateString()
  const admin = isAdmin(ctx)
  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null)
  const [tab, setTab] = useState('lines')
  const [receiving, setReceiving] = useState(false)
  const [warehouseId, setWarehouseId] = useState(''), [receiptDate, setReceiptDate] = useState(today), [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [quantities, setQuantities] = useState<Record<string, string>>({}), [enteredUnits, setEnteredUnits] = useState<Record<string, string>>({})
  const [tracking, setTracking] = useState<Record<string, Tracking>>({}), [receiptFields, setReceiptFields] = useState<Record<string, string>>({})
  const [invoiceFor, setInvoiceFor] = useState<PurchaseReceipt | null>(null), [invoiceCode, setInvoiceCode] = useState(''), [invoiceDate, setInvoiceDate] = useState(today)
  const runner = useRunner()
  const receiptDefinitions = useFieldDefinitions(ctx.token, receiptPath)
  const openLines = order?.lines.filter(line => line.remainingQuantity > 0) ?? []
  const units = useLineUnits(ctx.token, openLines.map(line => ({ key: String(line.lineNumber), stockItemId: line.stockItemId })), receiving)

  async function load() { const item = await api<PurchaseOrderDetail>(`${basePath}/${id}`, ctx.token); setOrder(item); return item }
  function beginReceipt(target = order) {
    if (!target) return
    setRequestId(crypto.randomUUID()); setReceiptDate(today)
    setWarehouseId(target.targetWarehouseId ?? ctx.warehouses.find(warehouse => warehouse.isActive)?.id ?? '')
    setQuantities(Object.fromEntries(target.lines.map(line => [String(line.lineNumber), String(line.remainingQuantity)])))
    setEnteredUnits({}); setTracking({}); setReceiptFields({}); setInvoiceFor(null); setReceiving(true); setTab('receipts')
  }
  useEffect(() => {
    setOrder(null); setReceiving(false); setInvoiceFor(null); setTab('lines')
    void load().then(item => { if (ctx.intent === 'receive' && (item.status === 'Open' || item.status === 'PartiallyReceived')) beginReceipt(item); else if (ctx.intent === 'invoice') setTab('receipts') }).catch(e => runner.setError((e as Error).message))
  }, [id, ctx.token])

  if (!order) return <DocumentShell title="Satınalma siparişi" code="" onBack={ctx.back} error={runner.error} onDismiss={ctx.back} header={<div className="doc-loading">{runner.error ? 'Belge açılamadı.' : 'Sipariş yükleniyor…'}</div>}/>

  const receivable = order.status === 'Open' || order.status === 'PartiallyReceived'
  const posted = order.receipts.filter(receipt => receipt.status === 'Posted')
  const invoiced = posted.filter(receipt => receipt.invoice?.status === 'Posted')
  const receivedLines = order.lines.filter(line => line.remainingQuantity <= 0).length
  const refresh = async () => { await load(); ctx.changed() }
  const trackedMode = (stockItemId: string) => ctx.stockItems.find(item => item.id === stockItemId)?.trackingMode ?? 'None'
  const patchTracking = (key: string, patch: Partial<Tracking>) => setTracking(current => ({ ...current, [key]: { ...(current[key] ?? { serials: '', lot: '', expiry: '' }), ...patch } }))

  const createReceipt = (event: React.FormEvent) => { event.preventDefault(); void runner.run(async () => {
    const lines = openLines.map(line => {
      const key = String(line.lineNumber), quantity = Number(quantities[key] || 0)
      if (quantity <= 0) return null
      const unitCode = enteredUnits[key] || line.unitCode
      const factor = unitCode === line.unitCode ? 1 : units[key]?.find(unit => unit.unitCode === unitCode)?.factorToBase ?? 1
      const mode = trackedMode(line.stockItemId), entry = tracking[key]
      let allocations: { trackingCode: string; quantity: number; expiryDate?: string | null }[] = []
      if (mode === 'Serial') {
        allocations = (entry?.serials ?? '').split(/[\n,;]/).map(code => code.trim()).filter(Boolean).map(trackingCode => ({ trackingCode, quantity: 1 }))
        if (allocations.length !== quantity * factor) throw new Error(`${line.stockCode} için ${formatQuantity(quantity * factor)} seri numarası girin (girilen: ${allocations.length}).`)
      } else if (mode === 'Lot') {
        if (!entry?.lot.trim()) throw new Error(`${line.stockCode} için lot kodu girin.`)
        allocations = [{ trackingCode: entry.lot.trim(), quantity: quantity * factor, expiryDate: entry.expiry || null }]
      }
      return { orderLineNumber: line.lineNumber, quantity, unitCode, tracking: allocations }
    }).filter((line): line is NonNullable<typeof line> => line !== null)
    if (!lines.length) throw new Error('En az bir satır için kabul miktarı girin.')
    await api(`${basePath}/${order.id}/receipts`, ctx.token, { method: 'POST', body: JSON.stringify({ requestId, warehouseId, receiptDate, customFields: receiptFields, lines }) })
    setReceiving(false); await refresh(); return 'Mal kabul kaydedildi; seçilen depoya stok girişi işlendi.'
  }) }
  function voidReceipt(receipt: PurchaseReceipt) {
    if (!window.confirm(`${receipt.code} mal kabulü iptal edilsin mi? İptal stok bakiyesini negatife düşürmemelidir.`)) return
    void runner.run(async () => { await api(`${receiptPath}/${receipt.id}/void`, ctx.token, { method: 'POST' }); await refresh(); return `${receipt.code} mal kabulü iptal edildi; stok hareketleri ters kaydedildi.` })
  }
  async function createInvoice(event: React.FormEvent) {
    event.preventDefault()
    if (!invoiceFor) return
    let invoiceId = ''
    const ok = await runner.run(async () => { invoiceId = (await api<PurchaseInvoiceSummary>(`${receiptPath}/${invoiceFor.id}/invoice`, ctx.token, { method: 'POST', body: JSON.stringify({ code: invoiceCode, invoiceDate }) })).id })
    if (ok) { ctx.changed(); ctx.open('purchase-invoices', invoiceId) }
  }
  const beginInvoice = (receipt: PurchaseReceipt) => { setInvoiceFor(receipt); setInvoiceCode(''); setInvoiceDate(today); setReceiving(false); setTab('receipts') }

  const uninvoiced = posted.find(receipt => !receipt.invoice)
  const nextStep = order.status === 'PendingApproval' ? { text: 'Sipariş iş kuralı gereği onay bekliyor. Onay iş akışı ekranından verilir.' }
    : receivable && openLines.length > 0 ? { text: `${openLines.length} satır teslim bekliyor: ${openLines.slice(0, 2).map(line => `${formatQuantity(line.remainingQuantity)} ${line.unitCode} ${line.stockName}`).join(', ')}${openLines.length > 2 ? '…' : ''}`, actionLabel: 'Mal kabul yap', onAction: () => beginReceipt() }
    : uninvoiced ? { text: `${uninvoiced.code} mal kabulünün faturası henüz girilmedi.`, actionLabel: 'Faturayı gir', onAction: () => beginInvoice(uninvoiced) }
    : undefined
  const flow: FlowLink[] = [
    { step: 'order', detail: order.code, state: 'current' },
    { step: 'delivery', detail: `${receivedLines} / ${order.lines.length}`, state: receivedLines === 0 ? (posted.length ? 'partial' : 'none') : receivedLines === order.lines.length ? 'done' : 'partial', target: posted.length === 1 ? { key: 'purchase-receipts', id: posted[0].id } : undefined },
    { step: 'invoice', detail: posted.length ? `${invoiced.length} / ${posted.length}` : undefined, state: !invoiced.length ? 'none' : invoiced.length === posted.length ? 'done' : 'partial', target: invoiced.length === 1 ? { key: 'purchase-invoices', id: invoiced[0].invoice!.id } : undefined },
  ]

  return <DocumentShell title="Satınalma siparişi" code={order.code} status={purchaseOrderStatus(order.status)} onBack={ctx.back} onNavigate={ctx.open}
    primary={receivable && openLines.length > 0 ? { label: 'Mal kabul yap', onClick: () => beginReceipt(), disabled: runner.busy || ctx.warehouses.length === 0 } : undefined}
    flow={flow} nextStep={nextStep} error={runner.error} notice={runner.notice} onDismiss={runner.dismiss} tab={tab} onTab={setTab}
    header={<div className="doc-grid">
      <ReadField label="Tedarikçi" value={order.supplierName} className="wide"/>
      <ReadField label="Para birimi" value={order.currencyCode}/>
      <ReadField label="Sipariş tarihi" value={formatDate(order.orderDate)}/>
      <ReadField label="Beklenen teslim" value={formatDate(order.expectedReceiptDate)}/>
      <ReadField label="Hedef depo" value={ctx.warehouses.find(warehouse => warehouse.id === order.targetWarehouseId)?.name ?? 'Belirtilmedi'}/>
      {order.notes && <ReadField label="Açıklama" value={order.notes} className="full"/>}
    </div>}
    side={<PartyCard token={ctx.token} partyId={order.supplierId} kind="supplier" currency={order.currencyCode}/>}
    tabs={[
      { key: 'lines', label: 'Satırlar', count: order.lines.length, content: <LinesTable lines={order.lines} rowKey={line => line.lineNumber} columns={[
        quantityColumn('Sipariş'),
        { label: 'Teslim alınan', align: 'right', render: line => formatQuantity(line.receivedQuantity) },
        { label: 'Kalan', align: 'right', render: line => <b>{formatQuantity(line.remainingQuantity)}</b> },
        { label: 'Birim fiyat', align: 'right', render: line => formatNumber(line.unitPrice, 2, 4) },
        { label: 'İsk %', align: 'right', render: line => formatQuantity(line.discountPercent) },
        { label: 'KDV %', align: 'right', render: line => formatQuantity(line.vatPercent) },
        { label: 'Tutar', align: 'right', render: line => formatNumber(line.lineTotal) },
      ]}/> },
      { key: 'receipts', label: 'Mal kabuller', count: order.receipts.length, content: <div className="doc-stack">
        {receiving && <form className="doc-card" onSubmit={createReceipt}>
          <div className="doc-section-title"><span>Yeni mal kabul</span></div>
          <div className="doc-grid" style={{ marginBottom: 12 }}>
            <Field label="Depo"><WarehouseSelect warehouses={ctx.warehouses} value={warehouseId} onChange={setWarehouseId} activeOnly={false}/></Field>
            <Field label="Kabul tarihi"><input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} required/></Field>
          </div>
          <QuantityEntry quantityLabel="Kabul miktarı" units={units} quantities={quantities} enteredUnits={enteredUnits}
            rows={openLines.map(line => ({ key: String(line.lineNumber), stockItemId: line.stockItemId, stockCode: line.stockCode, stockName: line.stockName, unitCode: line.unitCode, remaining: line.remainingQuantity, info: trackedMode(line.stockItemId) === 'Serial' ? 'Seri numarası takipli' : trackedMode(line.stockItemId) === 'Lot' ? 'Lot takipli' : `Sipariş ${formatQuantity(line.quantity)} ${line.unitCode}` }))}
            onQuantity={(key, value) => setQuantities(current => ({ ...current, [key]: value }))} onUnit={(key, value) => setEnteredUnits(current => ({ ...current, [key]: value }))}/>
          {openLines.filter(line => trackedMode(line.stockItemId) !== 'None' && Number(quantities[String(line.lineNumber)] || 0) > 0).map(line => { const key = String(line.lineNumber), entry = tracking[key]; return <div className="doc-grid" key={key} style={{ marginTop: 12 }}>
            {trackedMode(line.stockItemId) === 'Serial'
              ? <Field label={`${line.stockCode} seri numaraları (virgül veya satırla ayırın)`} className="full"><textarea rows={2} value={entry?.serials ?? ''} onChange={e => patchTracking(key, { serials: e.target.value })} required/></Field>
              : <><Field label={`${line.stockCode} lot kodu`} className="wide"><input value={entry?.lot ?? ''} onChange={e => patchTracking(key, { lot: e.target.value })} required maxLength={80}/></Field>
                <Field label="Son kullanma tarihi" optional><input type="date" value={entry?.expiry ?? ''} onChange={e => patchTracking(key, { expiry: e.target.value })}/></Field></>}
          </div> })}
          {receiptDefinitions.some(definition => definition.isActive) && <div style={{ marginTop: 12 }}><CustomFieldInputs definitions={receiptDefinitions} values={receiptFields} onChange={setReceiptFields}/></div>}
          <div className="doc-form-foot"><span>Alternatif birimde girilen miktar temel birime çevrilerek stoğa işlenir.</span>
            <span className="doc-inline-actions"><button type="button" className="secondary" onClick={() => setReceiving(false)}>Vazgeç</button><button className="primary" disabled={runner.busy || !warehouseId}>{runner.busy ? 'Kaydediliyor…' : 'Mal kabulü kaydet'}</button></span></div>
        </form>}
        {invoiceFor && <form className="doc-card" onSubmit={createInvoice}>
          <div className="doc-section-title"><span>{invoiceFor.code} mal kabulünü faturala</span></div>
          <div className="doc-grid">
            <Field label="Tedarikçi fatura no"><input value={invoiceCode} onChange={e => setInvoiceCode(e.target.value)} required maxLength={40} placeholder="TDR-2026-0042" autoFocus/></Field>
            <Field label="Fatura tarihi"><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required/></Field>
          </div>
          <div className="doc-form-foot"><span>Fatura tutarı mal kabul miktarları ve sipariş fiyatlarından hesaplanır; vade tedarikçi kartından gelir.</span>
            <span className="doc-inline-actions"><button type="button" className="secondary" onClick={() => setInvoiceFor(null)}>Vazgeç</button><button className="primary" disabled={runner.busy}>{runner.busy ? 'Oluşturuluyor…' : 'Faturayı oluştur'}</button></span></div>
        </form>}
        <div className="doc-row-list">
          {order.receipts.length === 0 && !receiving && <div className="doc-card"><p className="muted">Henüz mal kabul yapılmadı.</p></div>}
          {order.receipts.map(receipt => <div className="doc-row-item" key={receipt.id} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <button className="doc-link" onClick={() => ctx.open('purchase-receipts', receipt.id)}>{receipt.code}</button>
              <small>{formatDate(receipt.receiptDate)} · {receipt.warehouseName} · {receipt.lineCount} satır</small>
              {receipt.lines && receipt.lines.length > 0 && <small>{receipt.lines.map(line => `${formatQuantity(line.quantity)} ${line.unitCode} ${line.stockCode}`).join(' · ')}</small>}
              {receipt.customFields?.length > 0 && <small>{receipt.customFields.map(field => `${field.label}: ${field.value || '—'}`).join(' · ')}</small>}
              {receipt.invoice && <small>Fatura {receipt.invoice.code} · {formatMoney(receipt.invoice.grandTotal, receipt.invoice.currencyCode)} · vade {formatDate(receipt.invoice.dueDate)}</small>}
            </div>
            <span className="doc-inline-actions">
              <StatusPill status={postedStatus(receipt.status, 'Kabul edildi')}/>
              {receipt.invoice && <StatusPill status={purchaseInvoiceStatus(receipt.invoice)}/>}
              {receipt.invoice && <button className="doc-text-button" onClick={() => ctx.open('purchase-invoices', receipt.invoice!.id)}>Faturayı aç</button>}
              {receipt.status === 'Posted' && !receipt.invoice && <button className="doc-text-button" disabled={runner.busy} onClick={() => beginInvoice(receipt)}>Faturala</button>}
              {receipt.status === 'Posted' && !receipt.invoice && <button className="doc-text-button danger" disabled={runner.busy} onClick={() => voidReceipt(receipt)}>İptal et</button>}
            </span>
          </div>)}
        </div>
        {admin && <CustomFieldCatalog token={ctx.token} basePath={receiptPath} title="Mal kabul alan tanımları" history="view" onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
      { key: 'fields', label: 'Özel alanlar', count: order.customFields?.length ?? 0, content: <div className="doc-stack">
        <CustomFieldValues token={ctx.token} basePath={basePath} documentId={order.id} fields={order.customFields ?? []} editable={receivable} lockedText="Teslim alınan veya kapanan siparişte özel alanlar kilitlidir."
          onSaved={customFields => setOrder(current => current ? { ...current, customFields } : current)} onError={runner.setError} onNotice={runner.setNotice}/>
        {admin && <CustomFieldCatalog token={ctx.token} basePath={basePath} title="Sipariş alan tanımları" onChanged={() => void load()} onError={runner.setError} onNotice={runner.setNotice}/>}
      </div> },
    ]}
    totals={{ subtotal: order.subtotal, discountTotal: order.discountTotal, taxTotal: order.taxTotal, grandTotal: order.grandTotal, currency: order.currencyCode }}/>
}
