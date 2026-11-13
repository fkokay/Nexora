import { loadAllPages } from '../lib/api'
import { formatDate, formatMoney } from './format'
import type { ListTab } from './listLogic'
import type {
  PurchaseInvoiceSummary, PurchaseOrderSummary, PurchaseReceipt, PurchaseRequestSummary,
  SalesDeliverySummary, SalesInvoiceSummary, SalesOrderSummary, SalesQuoteSummary,
  SalesRequestSummary, SalesReturnListItem, SupplierQuoteListItem, SupplierReturnListItem,
} from './models'

export type DocKey =
  | 'sales-requests' | 'sales-quotes' | 'sales-orders' | 'sales-deliveries' | 'sales-invoices' | 'sales-returns'
  | 'purchase-requests' | 'purchase-quotes' | 'purchase-orders' | 'purchase-receipts' | 'purchase-invoices' | 'purchase-returns'
export type DocSide = 'sales' | 'purchase'
export type FlowStep = 'request' | 'quote' | 'order' | 'delivery' | 'invoice' | 'return'
export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'
export type StatusBadge = { label: string; tone: Tone }

export type DocColumn<T> = { key: string; label: string; align?: 'right'; render: (row: T) => string }

export type DocumentDefinition<T> = {
  key: DocKey
  side: DocSide
  step: FlowStep
  menuLabel: string
  title: string
  singular: string
  description: string
  emptyText: string
  createLabel: string
  /** 'editor': boş form açılır; 'source': önce kaynak belge seçilir. */
  createMode: 'editor' | 'source'
  partyLabel: string
  load: (token: string) => Promise<T[]>
  id: (row: T) => string
  code: (row: T) => string
  date: (row: T) => string
  party: (row: T) => string | null
  source: (row: T) => { label: string; target?: { key: DocKey; id: string } } | null
  amount: (row: T) => number | null
  currency: (row: T) => string | null
  status: (row: T) => StatusBadge
  tabs: ListTab<T>[]
  extraColumns: DocColumn<T>[]
  searchText: (row: T) => (string | null | undefined)[]
}

const all = <T,>(): ListTab<T> => ({ key: 'all', label: 'Tümü', match: () => true })
const byStatus = <T extends { status: string }>(key: string, label: string, ...statuses: string[]): ListTab<T> =>
  ({ key, label, match: row => statuses.includes(row.status) })
const before = (date: string | null | undefined, today: string) => !!date && date.slice(0, 10) < today

export const quoteStatus = (status: string): StatusBadge =>
  status === 'Draft' ? { label: 'Taslak', tone: 'neutral' }
    : status === 'Sent' ? { label: 'İletildi', tone: 'info' }
    : status === 'Accepted' ? { label: 'Kabul edildi', tone: 'success' }
    : status === 'Rejected' ? { label: 'Reddedildi', tone: 'danger' }
    : { label: 'Süresi doldu', tone: 'neutral' }

export const salesOrderStatus = (status: string): StatusBadge =>
  status === 'Fulfilled' ? { label: 'Tamamlandı', tone: 'success' }
    : status === 'Cancelled' ? { label: 'İptal', tone: 'neutral' }
    : { label: 'Açık', tone: 'warning' }

export const deliveryStatus = (status: string): StatusBadge =>
  status === 'Posted' ? { label: 'Sevk edildi', tone: 'success' } : { label: 'İptal', tone: 'neutral' }

export const salesInvoiceStatus = (status: string): StatusBadge =>
  status === 'Posted' ? { label: 'Kesildi', tone: 'success' } : { label: 'İptal', tone: 'neutral' }

export const purchaseRequestStatus = (status: string): StatusBadge =>
  status === 'Submitted' ? { label: 'Onay bekliyor', tone: 'warning' }
    : status === 'Approved' ? { label: 'Onaylandı', tone: 'info' }
    : status === 'Rejected' ? { label: 'Reddedildi', tone: 'danger' }
    : { label: 'Siparişe dönüştü', tone: 'success' }

export const purchaseOrderStatus = (status: string): StatusBadge =>
  status === 'Open' ? { label: 'Açık', tone: 'warning' }
    : status === 'PartiallyReceived' ? { label: 'Kısmi teslim', tone: 'info' }
    : status === 'Received' ? { label: 'Teslim alındı', tone: 'success' }
    : status === 'PendingApproval' ? { label: 'Onay bekliyor', tone: 'warning' }
    : status === 'Rejected' ? { label: 'Reddedildi', tone: 'danger' }
    : { label: 'İptal', tone: 'neutral' }

export const purchaseInvoiceStatus = (row: { status: string; outstandingAmount: number }): StatusBadge =>
  row.status !== 'Posted' ? { label: 'İptal', tone: 'neutral' }
    : row.outstandingAmount > 0 ? { label: 'Ödeme bekliyor', tone: 'warning' }
    : { label: 'Ödendi', tone: 'success' }

export const postedStatus = (status: string, postedLabel: string): StatusBadge =>
  status === 'Posted' ? { label: postedLabel, tone: 'success' } : { label: 'İptal', tone: 'neutral' }

/** İrsaliye özetinde cari bilgisi yok; sipariş listesinden tamamlanır. */
export type SalesDeliveryRow = SalesDeliverySummary & { customerName: string | null }

const salesQuotes: DocumentDefinition<SalesQuoteSummary> = {
  key: 'sales-quotes', side: 'sales', step: 'quote', menuLabel: 'Teklifler', title: 'Satış teklifleri', singular: 'Satış teklifi',
  description: 'Müşteriye verilen fiyat teklifleri. Kabul edilen teklif siparişe dönüşür.',
  emptyText: 'Henüz satış teklifi yok. İlk teklifi oluşturarak satış sürecini başlatın.',
  createLabel: 'Yeni teklif', createMode: 'editor', partyLabel: 'Müşteri',
  load: token => loadAllPages<SalesQuoteSummary>('/api/sales/quotes/', token),
  id: row => row.id, code: row => row.code, date: row => row.quoteDate, party: row => row.customerName,
  source: () => null, amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => quoteStatus(row.status),
  tabs: [
    all(), byStatus('draft', 'Taslak', 'Draft'), byStatus('sent', 'İletildi', 'Sent'),
    { key: 'to-order', label: 'Siparişe dönüşecek', match: row => row.status === 'Accepted' && !row.hasSalesOrder },
    { key: 'expiring', label: 'Süresi dolan', match: (row, today) => (row.status === 'Draft' || row.status === 'Sent') && before(row.validUntil, today) },
    byStatus('rejected', 'Reddedildi', 'Rejected'),
  ],
  extraColumns: [
    { key: 'validUntil', label: 'Geçerlilik', render: row => formatDate(row.validUntil) },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.customerName],
}

const salesOrders: DocumentDefinition<SalesOrderSummary> = {
  key: 'sales-orders', side: 'sales', step: 'order', menuLabel: 'Siparişler', title: 'Satış siparişleri', singular: 'Satış siparişi',
  description: 'Kabul edilen tekliflerden oluşan müşteri siparişleri. Sevkiyat buradan başlar.',
  emptyText: 'Henüz satış siparişi yok. Kabul edilen bir teklifi siparişe dönüştürün.',
  createLabel: 'Tekliften sipariş', createMode: 'source', partyLabel: 'Müşteri',
  load: token => loadAllPages<SalesOrderSummary>('/api/sales/orders/', token),
  id: row => row.id, code: row => row.code, date: row => row.orderDate, party: row => row.customerName,
  source: row => ({ label: row.quoteCode, target: { key: 'sales-quotes', id: row.quoteId } }),
  amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => salesOrderStatus(row.status),
  tabs: [
    all(), byStatus('open', 'Açık', 'Open'),
    { key: 'late', label: 'Teslimi geciken', match: (row, today) => row.status === 'Open' && before(row.requestedDeliveryDate, today) },
    byStatus('fulfilled', 'Tamamlandı', 'Fulfilled'), byStatus('cancelled', 'İptal', 'Cancelled'),
  ],
  extraColumns: [
    { key: 'requestedDeliveryDate', label: 'Teslim tarihi', render: row => formatDate(row.requestedDeliveryDate) },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.customerName, row.quoteCode],
}

const salesDeliveries: DocumentDefinition<SalesDeliveryRow> = {
  key: 'sales-deliveries', side: 'sales', step: 'delivery', menuLabel: 'İrsaliyeler', title: 'Satış irsaliyeleri', singular: 'Satış irsaliyesi',
  description: 'Siparişlerden yapılan sevkiyatlar. Her irsaliye stok çıkışı oluşturur ve faturalanır.',
  emptyText: 'Henüz irsaliye yok. Açık bir siparişten sevkiyat oluşturun.',
  createLabel: 'Siparişten irsaliye', createMode: 'source', partyLabel: 'Müşteri',
  load: async token => {
    const [deliveries, orders] = await Promise.all([
      loadAllPages<SalesDeliverySummary>('/api/sales/deliveries/', token),
      loadAllPages<SalesOrderSummary>('/api/sales/orders/', token),
    ])
    const customers = new Map(orders.map(order => [order.id, order.customerName]))
    return deliveries.map(delivery => ({ ...delivery, customerName: customers.get(delivery.orderId) ?? null }))
  },
  id: row => row.id, code: row => row.code, date: row => row.deliveryDate, party: row => row.customerName,
  source: row => ({ label: row.orderCode, target: { key: 'sales-orders', id: row.orderId } }),
  amount: () => null, currency: () => null,
  status: row => deliveryStatus(row.status),
  tabs: [
    all(),
    { key: 'uninvoiced', label: 'Faturalanmamış', match: row => row.status === 'Posted' && !row.hasSalesInvoice },
    { key: 'invoiced', label: 'Faturalandı', match: row => row.status === 'Posted' && row.hasSalesInvoice },
    byStatus('voided', 'İptal', 'Voided'),
  ],
  extraColumns: [
    { key: 'warehouse', label: 'Depo', render: row => row.warehouseName },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.orderCode, row.customerName, row.warehouseName],
}

const salesInvoices: DocumentDefinition<SalesInvoiceSummary> = {
  key: 'sales-invoices', side: 'sales', step: 'invoice', menuLabel: 'Faturalar', title: 'Satış faturaları', singular: 'Satış faturası',
  description: 'İrsaliyelerden kesilen faturalar. Tahsilat ve iade işlemleri fatura üzerinden yapılır.',
  emptyText: 'Henüz satış faturası yok. Sevk edilmiş bir irsaliyeyi faturalayın.',
  createLabel: 'İrsaliyeden fatura', createMode: 'source', partyLabel: 'Müşteri',
  load: token => loadAllPages<SalesInvoiceSummary>('/api/sales/invoices/', token),
  id: row => row.id, code: row => row.code, date: row => row.invoiceDate, party: row => row.customerName,
  source: row => ({ label: row.deliveryCode, target: { key: 'sales-deliveries', id: row.deliveryId } }),
  amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => salesInvoiceStatus(row.status),
  tabs: [all(), byStatus('posted', 'Kesildi', 'Posted'), byStatus('voided', 'İptal', 'Voided')],
  extraColumns: [
    { key: 'order', label: 'Sipariş', render: row => row.orderCode },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.customerName, row.deliveryCode, row.orderCode],
}

const purchaseRequests: DocumentDefinition<PurchaseRequestSummary> = {
  key: 'purchase-requests', side: 'purchase', step: 'request', menuLabel: 'Talepler', title: 'Satınalma talepleri', singular: 'Satınalma talebi',
  description: 'Şirket içi ihtiyaç talepleri. Onaylanan talep için teklif toplanır ve sipariş verilir.',
  emptyText: 'Henüz satınalma talebi yok. İhtiyacınızı talep olarak kaydedin.',
  createLabel: 'Yeni talep', createMode: 'editor', partyLabel: 'Talep eden',
  load: token => loadAllPages<PurchaseRequestSummary>('/api/purchasing/requests/', token),
  id: row => row.id, code: row => row.code, date: row => row.requestDate, party: row => row.requestedByName,
  source: () => null, amount: () => null, currency: () => null,
  status: row => purchaseRequestStatus(row.status),
  tabs: [
    all(), byStatus('submitted', 'Onay bekliyor', 'Submitted'), byStatus('approved', 'Sipariş bekliyor', 'Approved'),
    byStatus('ordered', 'Siparişe dönüştü', 'Ordered'), byStatus('rejected', 'Reddedildi', 'Rejected'),
  ],
  extraColumns: [
    { key: 'neededBy', label: 'İhtiyaç tarihi', render: row => formatDate(row.neededByDate) },
    { key: 'description', label: 'Açıklama', render: row => row.description },
    { key: 'order', label: 'Sipariş', render: row => row.purchaseOrderCode ?? '—' },
  ],
  searchText: row => [row.code, row.requestedByName, row.description, row.purchaseOrderCode],
}

const purchaseOrders: DocumentDefinition<PurchaseOrderSummary> = {
  key: 'purchase-orders', side: 'purchase', step: 'order', menuLabel: 'Siparişler', title: 'Satınalma siparişleri', singular: 'Satınalma siparişi',
  description: 'Tedarikçilere verilen siparişler. Mal kabul ve alış faturası buradan başlar.',
  emptyText: 'Henüz satınalma siparişi yok. Doğrudan ya da onaylı bir talepten sipariş oluşturun.',
  createLabel: 'Yeni sipariş', createMode: 'editor', partyLabel: 'Tedarikçi',
  load: token => loadAllPages<PurchaseOrderSummary>('/api/purchasing/orders/', token),
  id: row => row.id, code: row => row.code, date: row => row.orderDate, party: row => row.supplierName,
  source: () => null, amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => purchaseOrderStatus(row.status),
  tabs: [
    all(), byStatus('open', 'Teslim bekliyor', 'Open', 'PartiallyReceived'),
    { key: 'late', label: 'Teslimi geciken', match: (row, today) => (row.status === 'Open' || row.status === 'PartiallyReceived') && before(row.expectedReceiptDate, today) },
    byStatus('approval', 'Onay bekliyor', 'PendingApproval'), byStatus('received', 'Teslim alındı', 'Received'),
  ],
  extraColumns: [
    { key: 'expected', label: 'Beklenen teslim', render: row => formatDate(row.expectedReceiptDate) },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.supplierName],
}

const purchaseInvoices: DocumentDefinition<PurchaseInvoiceSummary> = {
  key: 'purchase-invoices', side: 'purchase', step: 'invoice', menuLabel: 'Faturalar', title: 'Alış faturaları', singular: 'Alış faturası',
  description: 'Mal kabullerden oluşan tedarikçi faturaları. Ödeme ve iade işlemleri fatura üzerinden yapılır.',
  emptyText: 'Henüz alış faturası yok. Bir mal kabulünü faturalayın.',
  createLabel: 'Mal kabulden fatura', createMode: 'source', partyLabel: 'Tedarikçi',
  load: token => loadAllPages<PurchaseInvoiceSummary>('/api/purchasing/invoices/', token),
  id: row => row.id, code: row => row.code, date: row => row.invoiceDate, party: row => row.supplierName,
  source: row => ({ label: row.receiptCode, target: { key: 'purchase-receipts', id: row.purchaseReceiptId } }),
  amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: purchaseInvoiceStatus,
  tabs: [
    all(),
    { key: 'unpaid', label: 'Ödeme bekliyor', match: row => row.status === 'Posted' && row.outstandingAmount > 0 },
    { key: 'overdue', label: 'Vadesi geçen', match: (row, today) => row.status === 'Posted' && row.outstandingAmount > 0 && before(row.dueDate, today) },
    { key: 'paid', label: 'Ödendi', match: row => row.status === 'Posted' && row.outstandingAmount <= 0 },
    byStatus('voided', 'İptal', 'Voided'),
  ],
  extraColumns: [
    { key: 'order', label: 'Sipariş', render: row => row.purchaseOrderCode },
    { key: 'dueDate', label: 'Vade', render: row => formatDate(row.dueDate) },
    { key: 'outstanding', label: 'Açık bakiye', align: 'right', render: row => formatMoney(row.outstandingAmount, row.currencyCode) },
  ],
  searchText: row => [row.code, row.supplierName, row.receiptCode, row.purchaseOrderCode],
}

export const salesRequestStatus = (status: string): StatusBadge =>
  status === 'Open' ? { label: 'Teklif bekliyor', tone: 'warning' }
    : status === 'Quoted' ? { label: 'Teklif verildi', tone: 'success' }
    : { label: 'İptal', tone: 'neutral' }

const salesRequests: DocumentDefinition<SalesRequestSummary> = {
  key: 'sales-requests', side: 'sales', step: 'request', menuLabel: 'Talepler', title: 'Satış talepleri', singular: 'Satış talebi',
  description: 'Müşterilerden gelen ürün talepleri. Talepten teklif hazırlanır; fiyatlar teklifte belirlenir.',
  emptyText: 'Henüz satış talebi yok. Müşteriden gelen talebi kaydederek satış sürecini başlatın.',
  createLabel: 'Yeni talep', createMode: 'editor', partyLabel: 'Müşteri',
  load: token => loadAllPages<SalesRequestSummary>('/api/sales/requests/', token),
  id: row => row.id, code: row => row.code, date: row => row.requestDate, party: row => row.customerName,
  source: () => null, amount: () => null, currency: () => null,
  status: row => salesRequestStatus(row.status),
  tabs: [
    all(), byStatus('open', 'Teklif bekliyor', 'Open'),
    { key: 'late', label: 'İhtiyaç tarihi geçen', match: (row, today) => row.status === 'Open' && before(row.neededByDate, today) },
    byStatus('quoted', 'Teklif verildi', 'Quoted'), byStatus('cancelled', 'İptal', 'Cancelled'),
  ],
  extraColumns: [
    { key: 'neededBy', label: 'İhtiyaç tarihi', render: row => formatDate(row.neededByDate) },
    { key: 'description', label: 'Açıklama', render: row => row.description ?? '—' },
    { key: 'quoteCount', label: 'Teklif', align: 'right', render: row => String(row.quoteCount) },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.customerName, row.description],
}

export const supplierQuoteStatus = (status: string): StatusBadge =>
  status === 'Selected' ? { label: 'Seçildi', tone: 'success' }
    : status === 'NotSelected' ? { label: 'Seçilmedi', tone: 'neutral' }
    : { label: 'Değerlendiriliyor', tone: 'info' }

const salesReturns: DocumentDefinition<SalesReturnListItem> = {
  key: 'sales-returns', side: 'sales', step: 'return', menuLabel: 'İadeler', title: 'Satış iadeleri', singular: 'Satış iadesi',
  description: 'Müşterilerden geri alınan ürünler. İade stok girişi yapar ve müşteri cari hesabına alacak yazar.',
  emptyText: 'Henüz satış iadesi yok. İade, kesilmiş bir satış faturasından oluşturulur.',
  createLabel: 'Faturadan iade', createMode: 'source', partyLabel: 'Müşteri',
  load: token => loadAllPages<SalesReturnListItem>('/api/sales/returns/', token),
  id: row => row.id, code: row => row.code, date: row => row.returnDate, party: row => row.customerName,
  source: row => ({ label: row.invoiceCode, target: { key: 'sales-invoices', id: row.salesInvoiceId } }),
  amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => postedStatus(row.status, 'İşlendi'),
  tabs: [all(), byStatus('posted', 'İşlendi', 'Posted'), byStatus('voided', 'İptal', 'Voided')],
  extraColumns: [
    { key: 'warehouse', label: 'Depo', render: row => row.warehouseName },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.customerName, row.invoiceCode, row.warehouseName],
}

const purchaseQuotes: DocumentDefinition<SupplierQuoteListItem> = {
  key: 'purchase-quotes', side: 'purchase', step: 'quote', menuLabel: 'Teklifler', title: 'Tedarikçi teklifleri', singular: 'Tedarikçi teklifi',
  description: 'Onaylı talepler için tedarikçilerden alınan fiyat teklifleri. Seçilen teklif siparişe dönüşür.',
  emptyText: 'Henüz tedarikçi teklifi yok. Teklif, onaylanmış bir satınalma talebi için kaydedilir.',
  createLabel: 'Talep için teklif', createMode: 'source', partyLabel: 'Tedarikçi',
  load: token => loadAllPages<SupplierQuoteListItem>('/api/purchasing/supplier-quotes/', token),
  id: row => row.id, code: row => row.code, date: row => row.quoteDate, party: row => row.supplierName,
  source: row => ({ label: row.requestCode, target: { key: 'purchase-requests', id: row.purchaseRequestId } }),
  amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => supplierQuoteStatus(row.status),
  tabs: [
    all(), byStatus('submitted', 'Değerlendiriliyor', 'Submitted'),
    { key: 'expiring', label: 'Süresi dolan', match: (row, today) => row.status === 'Submitted' && before(row.validUntil, today) },
    byStatus('selected', 'Seçildi', 'Selected'), byStatus('not-selected', 'Seçilmedi', 'NotSelected'),
  ],
  extraColumns: [
    { key: 'validUntil', label: 'Geçerlilik', render: row => formatDate(row.validUntil) },
    { key: 'order', label: 'Sipariş', render: row => row.purchaseOrderCode ?? '—' },
  ],
  searchText: row => [row.code, row.supplierName, row.requestCode, row.purchaseOrderCode],
}

/** Mal kabul özetinde tedarikçi ve fatura bilgisi yok; sipariş ve fatura listelerinden tamamlanır. */
export type PurchaseReceiptRow = Omit<PurchaseReceipt, 'invoice' | 'customFields' | 'lines'> & { supplierName: string | null; invoiceId: string | null; invoiceCode: string | null }

const purchaseReceipts: DocumentDefinition<PurchaseReceiptRow> = {
  key: 'purchase-receipts', side: 'purchase', step: 'delivery', menuLabel: 'İrsaliyeler', title: 'Alış irsaliyeleri', singular: 'Alış irsaliyesi',
  description: 'Siparişlerden yapılan mal kabuller. Her mal kabul stok girişi oluşturur ve faturalanır.',
  emptyText: 'Henüz mal kabul yok. Açık bir satınalma siparişinden mal kabul yapın.',
  createLabel: 'Siparişten mal kabul', createMode: 'source', partyLabel: 'Tedarikçi',
  load: async token => {
    const [receipts, orders, invoices] = await Promise.all([
      loadAllPages<PurchaseReceipt>('/api/purchasing/receipts/', token),
      loadAllPages<PurchaseOrderSummary>('/api/purchasing/orders/', token),
      loadAllPages<PurchaseInvoiceSummary>('/api/purchasing/invoices/', token),
    ])
    const suppliers = new Map(orders.map(order => [order.id, order.supplierName]))
    const invoiced = new Map(invoices.filter(invoice => invoice.status === 'Posted').map(invoice => [invoice.purchaseReceiptId, invoice]))
    return receipts.map(receipt => ({ ...receipt, supplierName: suppliers.get(receipt.purchaseOrderId) ?? null, invoiceId: invoiced.get(receipt.id)?.id ?? null, invoiceCode: invoiced.get(receipt.id)?.code ?? null }))
  },
  id: row => row.id, code: row => row.code, date: row => row.receiptDate, party: row => row.supplierName,
  source: row => ({ label: row.purchaseOrderCode, target: { key: 'purchase-orders', id: row.purchaseOrderId } }),
  amount: () => null, currency: () => null,
  status: row => postedStatus(row.status, 'Kabul edildi'),
  tabs: [
    all(),
    { key: 'uninvoiced', label: 'Faturalanmamış', match: row => row.status === 'Posted' && !row.invoiceId },
    { key: 'invoiced', label: 'Faturalandı', match: row => row.status === 'Posted' && !!row.invoiceId },
    byStatus('voided', 'İptal', 'Voided'),
  ],
  extraColumns: [
    { key: 'warehouse', label: 'Depo', render: row => row.warehouseName },
    { key: 'invoice', label: 'Fatura', render: row => row.invoiceCode ?? '—' },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.supplierName, row.purchaseOrderCode, row.warehouseName, row.invoiceCode],
}

const purchaseReturns: DocumentDefinition<SupplierReturnListItem> = {
  key: 'purchase-returns', side: 'purchase', step: 'return', menuLabel: 'İadeler', title: 'Alış iadeleri', singular: 'Alış iadesi',
  description: 'Tedarikçilere geri gönderilen ürünler. İade stoktan düşülür ve tedarikçi borcunu azaltır.',
  emptyText: 'Henüz alış iadesi yok. İade, kayıtlı bir alış faturasından oluşturulur.',
  createLabel: 'Faturadan iade', createMode: 'source', partyLabel: 'Tedarikçi',
  load: token => loadAllPages<SupplierReturnListItem>('/api/purchasing/returns/', token),
  id: row => row.id, code: row => row.code, date: row => row.returnDate, party: row => row.supplierName,
  source: row => ({ label: row.invoiceCode, target: { key: 'purchase-invoices', id: row.purchaseInvoiceId } }),
  amount: row => row.grandTotal, currency: row => row.currencyCode,
  status: row => postedStatus(row.status, 'İşlendi'),
  tabs: [all(), byStatus('posted', 'İşlendi', 'Posted'), byStatus('voided', 'İptal', 'Voided')],
  extraColumns: [
    { key: 'warehouse', label: 'Depo', render: row => row.warehouseName },
    { key: 'lineCount', label: 'Satır', align: 'right', render: row => String(row.lineCount) },
  ],
  searchText: row => [row.code, row.supplierName, row.invoiceCode, row.warehouseName],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const definitions: Record<DocKey, DocumentDefinition<any>> = {
  'sales-requests': salesRequests, 'sales-quotes': salesQuotes, 'sales-orders': salesOrders, 'sales-deliveries': salesDeliveries, 'sales-invoices': salesInvoices, 'sales-returns': salesReturns,
  'purchase-requests': purchaseRequests, 'purchase-quotes': purchaseQuotes, 'purchase-orders': purchaseOrders, 'purchase-receipts': purchaseReceipts,
  'purchase-invoices': purchaseInvoices, 'purchase-returns': purchaseReturns,
}

export const menu: { side: DocSide; label: string; keys: DocKey[] }[] = [
  { side: 'sales', label: 'Satış', keys: ['sales-requests', 'sales-quotes', 'sales-orders', 'sales-deliveries', 'sales-invoices', 'sales-returns'] },
  { side: 'purchase', label: 'Satınalma', keys: ['purchase-requests', 'purchase-quotes', 'purchase-orders', 'purchase-receipts', 'purchase-invoices', 'purchase-returns'] },
]

export const isDocKey = (page: string): page is DocKey => Object.prototype.hasOwnProperty.call(definitions, page)

export const flowLabels: Record<FlowStep, string> = {
  request: 'Talep', quote: 'Teklif', order: 'Sipariş', delivery: 'İrsaliye', invoice: 'Fatura', return: 'İade',
}
export const flowSteps: FlowStep[] = ['request', 'quote', 'order', 'delivery', 'invoice', 'return']
