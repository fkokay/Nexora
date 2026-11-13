import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, loadAllPages, loadStockItemCatalog } from '../lib/api'
import type { DocContext, DocIntent } from './context'
import { definitions, type DocKey, type DocumentDefinition } from './definitions'
import DocumentListPage, { type PreviewRenderer } from './DocumentListPage'
import DocumentShell from './DocumentShell'
import { formatDate, formatMoney, formatQuantity } from './format'
import type { PurchaseInvoiceSummary, PurchaseOrderSummary, PurchaseRequestSummary, SalesCustomer, SalesDeliverySummary, SalesInvoiceSummary, SalesOrderSummary, SalesQuoteSummary, StockItem, Warehouse } from './models'
import { PurchaseInvoiceDocument } from './pages/PurchaseInvoice'
import { PurchaseOrderDocument, PurchaseOrderEditor } from './pages/PurchaseOrder'
import { PurchaseReceiptDocument, SupplierQuoteDocument } from './pages/PurchaseQuoteReceipt'
import { PurchaseRequestDocument, PurchaseRequestEditor } from './pages/PurchaseRequest'
import { PurchaseReturnDocument, SalesReturnDocument } from './pages/Returns'
import { SalesDeliveryDocument } from './pages/SalesDelivery'
import { SalesInvoiceDocument } from './pages/SalesInvoice'
import { SalesOrderDocument } from './pages/SalesOrder'
import { SalesQuoteDocument, SalesQuoteEditor } from './pages/SalesQuote'
import { SalesRequestDocument, SalesRequestEditor } from './pages/SalesRequest'
import { useRunner } from './parts'
import { buildHash, parseHash, type DocRoute } from './route'
import './documents.css'

type Props = { page: DocKey; token: string; role: string; tenantId: string; userId: string; onNavigate: (page: DocKey) => void }

/* ---------- liste önizlemesi ---------- */

const detailUrl: Record<DocKey, string> = {
  'sales-requests': '/api/sales/requests', 'sales-quotes': '/api/sales/quotes', 'sales-orders': '/api/sales/orders', 'sales-deliveries': '/api/sales/deliveries', 'sales-invoices': '/api/sales/invoices', 'sales-returns': '/api/sales/returns',
  'purchase-requests': '/api/purchasing/requests', 'purchase-quotes': '/api/purchasing/supplier-quotes', 'purchase-orders': '/api/purchasing/orders',
  'purchase-receipts': '/api/purchasing/receipts', 'purchase-invoices': '/api/purchasing/invoices', 'purchase-returns': '/api/purchasing/returns',
}
type PreviewLine = { stockName: string; unitCode: string; quantity: number; deliveredQuantity?: number; receivedQuantity?: number; remainingQuantity?: number }

function PreviewLines({ docKey, id, token }: { docKey: DocKey; id: string; token: string }) {
  const [lines, setLines] = useState<PreviewLine[] | null>(null)
  useEffect(() => {
    let active = true
    setLines(null)
    api<{ lines?: PreviewLine[] }>(`${detailUrl[docKey]}/${id}`, token).then(detail => { if (active) setLines(detail.lines ?? []) }).catch(() => { if (active) setLines([]) })
    return () => { active = false }
  }, [docKey, id, token])
  if (!lines) return <div className="doc-preview-lines">Satırlar yükleniyor…</div>
  if (!lines.length) return null
  const tracked = lines.filter(line => line.remainingQuantity !== undefined)
  const done = tracked.filter(line => (line.remainingQuantity ?? 0) <= 0).length
  return <div className="doc-preview-lines">
    {lines.slice(0, 5).map((line, index) => <span key={index}>{formatQuantity(line.quantity)} {line.unitCode} {line.stockName}</span>)}
    {lines.length > 5 && <span>+{lines.length - 5} satır daha</span>}
    {tracked.length > 0 && <>
      <span style={{ marginTop: 4 }}>{docKey === 'purchase-orders' ? 'Teslim alınan' : 'Sevk edilen'} <b>{done} / {tracked.length}</b> satır</span>
      <div className={`doc-progress${done < tracked.length ? ' warn' : ''}`}><span style={{ width: `${Math.round(done / tracked.length * 100)}%` }}/></div>
    </>}
  </div>
}

function quickAction(docKey: DocKey, row: unknown): { label: string; intent: DocIntent } | null {
  const item = row as { status: string; outstandingAmount?: number }
  if (docKey === 'sales-orders' && item.status === 'Open') return { label: 'İrsaliye oluştur', intent: 'deliver' }
  if (docKey === 'sales-invoices' && item.status === 'Posted') return { label: 'Tahsilat kaydet', intent: 'collect' }
  if (docKey === 'purchase-orders' && (item.status === 'Open' || item.status === 'PartiallyReceived')) return { label: 'Mal kabul yap', intent: 'receive' }
  if (docKey === 'purchase-invoices' && item.status === 'Posted' && (item.outstandingAmount ?? 0) > 0) return { label: 'Ödeme kaydet', intent: 'pay' }
  if (docKey === 'purchase-requests' && item.status === 'Approved') return { label: 'Teklifleri aç', intent: 'quote' }
  return null
}

/* ---------- kaynak belgeden oluşturma ---------- */

type SourceRow = { id: string; code: string; date: string; party: string | null; info: string }
type SourceConfig = { title: string; description: string; emptyText: string; actionLabel: string; load: (token: string) => Promise<SourceRow[]>; pick: (row: SourceRow, ctx: DocContext) => Promise<void> }

const sources: Partial<Record<DocKey, SourceConfig>> = {
  'sales-orders': {
    title: 'Tekliften sipariş oluştur', description: 'Kabul edilmiş ve henüz siparişe dönüşmemiş teklifler.', emptyText: 'Siparişe dönüştürülecek kabul edilmiş teklif yok. Önce bir teklifi kabul edildi olarak işaretleyin.', actionLabel: 'Siparişe dönüştür',
    load: async token => (await loadAllPages<SalesQuoteSummary>('/api/sales/quotes/', token)).filter(quote => quote.status === 'Accepted' && !quote.hasSalesOrder)
      .map(quote => ({ id: quote.id, code: quote.code, date: quote.quoteDate, party: quote.customerName, info: formatMoney(quote.grandTotal, quote.currencyCode) })),
    pick: async (row, ctx) => { const order = await api<SalesOrderSummary>(`/api/sales/quotes/${row.id}/convert-to-order`, ctx.token, { method: 'POST' }); ctx.changed(); ctx.open('sales-orders', order.id) },
  },
  'sales-deliveries': {
    title: 'Siparişten irsaliye oluştur', description: 'Sevk edilecek miktarı kalan açık siparişler.', emptyText: 'Sevk bekleyen açık sipariş yok.', actionLabel: 'Sevk et',
    load: async token => (await loadAllPages<SalesOrderSummary>('/api/sales/orders/', token)).filter(order => order.status === 'Open')
      .map(order => ({ id: order.id, code: order.code, date: order.orderDate, party: order.customerName, info: order.requestedDeliveryDate ? `Teslim ${formatDate(order.requestedDeliveryDate)}` : formatMoney(order.grandTotal, order.currencyCode) })),
    pick: async (row, ctx) => ctx.open('sales-orders', row.id, 'deliver'),
  },
  'sales-invoices': {
    title: 'İrsaliyeden fatura kes', description: 'Sevk edilmiş ve henüz faturalanmamış irsaliyeler.', emptyText: 'Faturalanmayı bekleyen irsaliye yok.', actionLabel: 'Fatura kes',
    load: async token => {
      const [deliveries, orders] = await Promise.all([loadAllPages<SalesDeliverySummary>('/api/sales/deliveries/', token), loadAllPages<SalesOrderSummary>('/api/sales/orders/', token)])
      const customers = new Map(orders.map(order => [order.id, order.customerName]))
      return deliveries.filter(delivery => delivery.status === 'Posted' && !delivery.hasSalesInvoice)
        .map(delivery => ({ id: delivery.id, code: delivery.code, date: delivery.deliveryDate, party: customers.get(delivery.orderId) ?? null, info: `Sipariş ${delivery.orderCode} · ${delivery.warehouseName}` }))
    },
    pick: async (row, ctx) => { const invoice = await api<SalesInvoiceSummary>(`/api/sales/deliveries/${row.id}/invoice`, ctx.token, { method: 'POST' }); ctx.changed(); ctx.open('sales-invoices', invoice.id) },
  },
  'sales-returns': {
    title: 'Faturadan satış iadesi oluştur', description: 'Kesilmiş satış faturaları. İade miktarları fatura ekranında girilir.', emptyText: 'İade alınabilecek kesilmiş satış faturası yok.', actionLabel: 'İade oluştur',
    load: async token => (await loadAllPages<SalesInvoiceSummary>('/api/sales/invoices/', token)).filter(invoice => invoice.status === 'Posted')
      .map(invoice => ({ id: invoice.id, code: invoice.code, date: invoice.invoiceDate, party: invoice.customerName, info: formatMoney(invoice.grandTotal, invoice.currencyCode) })),
    pick: async (row, ctx) => ctx.open('sales-invoices', row.id, 'return'),
  },
  'purchase-quotes': {
    title: 'Talep için tedarikçi teklifi kaydet', description: 'Onaylanmış ve henüz siparişe dönüşmemiş satınalma talepleri.', emptyText: 'Teklif toplanacak onaylı talep yok. Önce bir satınalma talebini onaylayın.', actionLabel: 'Teklif kaydet',
    load: async token => (await loadAllPages<PurchaseRequestSummary>('/api/purchasing/requests/', token)).filter(request => request.status === 'Approved')
      .map(request => ({ id: request.id, code: request.code, date: request.requestDate, party: request.requestedByName, info: request.description })),
    pick: async (row, ctx) => ctx.open('purchase-requests', row.id, 'quote'),
  },
  'purchase-receipts': {
    title: 'Siparişten mal kabul yap', description: 'Teslim bekleyen satınalma siparişleri.', emptyText: 'Teslim bekleyen satınalma siparişi yok.', actionLabel: 'Mal kabul yap',
    load: async token => (await loadAllPages<PurchaseOrderSummary>('/api/purchasing/orders/', token)).filter(order => order.status === 'Open' || order.status === 'PartiallyReceived')
      .map(order => ({ id: order.id, code: order.code, date: order.orderDate, party: order.supplierName, info: order.expectedReceiptDate ? `Beklenen ${formatDate(order.expectedReceiptDate)}` : formatMoney(order.grandTotal, order.currencyCode) })),
    pick: async (row, ctx) => ctx.open('purchase-orders', row.id, 'receive'),
  },
  'purchase-returns': {
    title: 'Faturadan alış iadesi oluştur', description: 'Kayıtlı alış faturaları. İade miktarları fatura ekranında girilir.', emptyText: 'İade yapılabilecek kayıtlı alış faturası yok.', actionLabel: 'İade oluştur',
    load: async token => (await loadAllPages<PurchaseInvoiceSummary>('/api/purchasing/invoices/', token)).filter(invoice => invoice.status === 'Posted')
      .map(invoice => ({ id: invoice.id, code: invoice.code, date: invoice.invoiceDate, party: invoice.supplierName, info: formatMoney(invoice.grandTotal, invoice.currencyCode) })),
    pick: async (row, ctx) => ctx.open('purchase-invoices', row.id, 'return'),
  },
  'purchase-invoices': {
    title: 'Mal kabulden alış faturası gir', description: 'Mal kabulü yapılmış siparişler. Fatura, siparişin mal kabul satırından girilir.', emptyText: 'Mal kabulü yapılmış sipariş yok.', actionLabel: 'Mal kabulleri aç',
    load: async token => (await loadAllPages<PurchaseOrderSummary>('/api/purchasing/orders/', token)).filter(order => order.status === 'PartiallyReceived' || order.status === 'Received')
      .map(order => ({ id: order.id, code: order.code, date: order.orderDate, party: order.supplierName, info: formatMoney(order.grandTotal, order.currencyCode) })),
    pick: async (row, ctx) => ctx.open('purchase-orders', row.id, 'invoice'),
  },
}

function SourcePicker({ docKey, config, ctx }: { docKey: DocKey; config: SourceConfig; ctx: DocContext }) {
  const [rows, setRows] = useState<SourceRow[] | null>(null)
  const runner = useRunner()
  useEffect(() => { let active = true; config.load(ctx.token).then(items => { if (active) setRows(items) }).catch(e => { if (active) { setRows([]); runner.setError((e as Error).message) } }); return () => { active = false } }, [config, ctx.token])
  return <DocumentShell title={config.title} code="" onBack={ctx.back} error={runner.error} onDismiss={runner.dismiss}
    flow={[{ step: definitions[docKey].step, state: 'current' }]}
    header={<p className="muted">{config.description}</p>}>
    <div className="doc-table-wrap">
      {!rows ? <div className="doc-loading">Kaynak belgeler yükleniyor…</div>
        : rows.length === 0 ? <div className="doc-empty"><b>Uygun kaynak belge yok</b><span>{config.emptyText}</span><button className="secondary" onClick={ctx.back}>Listeye dön</button></div>
        : <table className="doc-table"><thead><tr><th>Belge no</th><th>Tarih</th><th>Cari</th><th>Bilgi</th><th/></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td><span className="doc-code">{row.code}</span></td><td>{formatDate(row.date)}</td><td>{row.party ?? '—'}</td><td>{row.info}</td>
            <td className="num"><button className="primary small-button" disabled={runner.busy} onClick={() => void runner.run(() => config.pick(row, ctx))}>{config.actionLabel}</button></td>
          </tr>)}</tbody></table>}
    </div>
  </DocumentShell>
}

/* ---------- modül ---------- */

export default function DocumentsModule({ page, token, role, tenantId, userId, onNavigate }: Props) {
  const [route, setRoute] = useState<DocRoute>(() => { const parsed = parseHash(window.location.hash); return parsed && parsed.key === page ? parsed : { key: page, view: 'list' } })
  const [reloadKey, setReloadKey] = useState(0)
  const [intent, setIntent] = useState<{ id: string; intent: DocIntent } | null>(null)
  const [customers, setCustomers] = useState<SalesCustomer[]>([]), [stockItems, setStockItems] = useState<StockItem[]>([]), [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([loadAllPages<SalesCustomer>('/api/customers/', token), loadStockItemCatalog(token), api<Warehouse[]>('/api/warehouses/', token)])
      .then(([customerItems, stock, warehouseItems]) => { if (active) { setCustomers(customerItems); setStockItems(stock); setWarehouses(warehouseItems) } })
      .catch(e => { if (active) setLoadError((e as Error).message) })
    return () => { active = false }
  }, [token])

  const go = useCallback((next: DocRoute, nextIntent?: DocIntent) => {
    setIntent(next.view === 'doc' && nextIntent ? { id: next.id, intent: nextIntent } : null)
    setRoute(next)
    const hash = buildHash(next)
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    if (next.key !== page) onNavigate(next.key)
    window.scrollTo({ top: 0 })
  }, [page, onNavigate])

  // Menüden başka bir belge türüne geçildi.
  useEffect(() => {
    if (route.key === page) return
    // Sayfa değişimi adres çubuğundan geldiyse (bağlantı, geri tuşu) adresteki rota korunur.
    const fromAddress = parseHash(window.location.hash)
    const next: DocRoute = fromAddress && fromAddress.key === page ? fromAddress : { key: page, view: 'list' }
    setRoute(next); setIntent(null)
    if (window.location.hash !== buildHash(next)) window.history.pushState(null, '', buildHash(next))
  }, [page])
  // İlk açılışta adres çubuğu geçerli rotayı göstersin.
  useEffect(() => { if (window.location.hash !== buildHash(route)) window.history.replaceState(null, '', buildHash(route)) }, [])
  // Tarayıcının geri/ileri tuşları.
  useEffect(() => {
    function onChange() {
      const parsed = parseHash(window.location.hash)
      if (!parsed) return
      setIntent(null); setRoute(parsed)
      if (parsed.key !== page) onNavigate(parsed.key)
    }
    window.addEventListener('popstate', onChange); window.addEventListener('hashchange', onChange)
    return () => { window.removeEventListener('popstate', onChange); window.removeEventListener('hashchange', onChange) }
  }, [page, onNavigate])

  const ctx = useMemo<DocContext>(() => ({
    token, role, customers, stockItems, warehouses,
    scope: key => ({ tenantId, userId, docKey: key }),
    intent: route.view === 'doc' && intent?.id === route.id ? intent.intent : null,
    open: (key, id, nextIntent) => go({ key, view: 'doc', id }, nextIntent),
    create: (key, sourceId) => go({ key, view: 'new', sourceId }),
    back: () => go({ key: route.key, view: 'list' }),
    changed: () => setReloadKey(value => value + 1),
  }), [token, role, customers, stockItems, warehouses, tenantId, userId, route, intent, go])

  if (route.key !== page) return null
  const definition = definitions[page] as DocumentDefinition<unknown>

  if (route.view === 'list') {
    const renderPreview: PreviewRenderer<unknown> = (row, helpers) => {
      const id = definition.id(row), action = quickAction(page, row)
      return <>
        <PreviewLines docKey={page} id={id} token={token}/>
        <div className="doc-inline-actions">
          {action && <button className="primary" onClick={() => ctx.open(page, id, action.intent)}>{action.label}</button>}
          <button className={action ? 'secondary' : 'primary'} onClick={helpers.open}>Belgeyi aç</button>
        </div>
      </>
    }
    return <>
      {loadError && <div className="alert inline-alert">{loadError}</div>}
      <DocumentListPage key={page} definition={definition} token={token} scope={ctx.scope(page)} reloadKey={reloadKey}
        onOpen={id => ctx.open(page, id)} onNavigate={ctx.open} onCreate={() => ctx.create(page)} renderPreview={renderPreview}/>
    </>
  }

  if (route.view === 'new') {
    if (page === 'sales-requests') return <SalesRequestEditor ctx={ctx}/>
    if (page === 'sales-quotes') return <SalesQuoteEditor key={route.sourceId ?? 'new'} ctx={ctx} sourceRequestId={route.sourceId}/>
    if (page === 'purchase-requests') return <PurchaseRequestEditor ctx={ctx}/>
    if (page === 'purchase-orders') return <PurchaseOrderEditor ctx={ctx}/>
    const config = sources[page]
    return config ? <SourcePicker key={page} docKey={page} config={config} ctx={ctx}/> : null
  }

  const id = route.id
  switch (page) {
    case 'sales-requests': return <SalesRequestDocument id={id} ctx={ctx}/>
    case 'sales-quotes': return <SalesQuoteDocument id={id} ctx={ctx}/>
    case 'sales-orders': return <SalesOrderDocument id={id} ctx={ctx}/>
    case 'sales-deliveries': return <SalesDeliveryDocument id={id} ctx={ctx}/>
    case 'sales-invoices': return <SalesInvoiceDocument id={id} ctx={ctx}/>
    case 'purchase-requests': return <PurchaseRequestDocument id={id} ctx={ctx}/>
    case 'purchase-orders': return <PurchaseOrderDocument id={id} ctx={ctx}/>
    case 'purchase-invoices': return <PurchaseInvoiceDocument id={id} ctx={ctx}/>
    case 'sales-returns': return <SalesReturnDocument id={id} ctx={ctx}/>
    case 'purchase-returns': return <PurchaseReturnDocument id={id} ctx={ctx}/>
    case 'purchase-quotes': return <SupplierQuoteDocument id={id} ctx={ctx}/>
    case 'purchase-receipts': return <PurchaseReceiptDocument id={id} ctx={ctx}/>
  }
}
