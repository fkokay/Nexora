import AdvancedDataGrid from './AdvancedDataGrid'
import { useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { FileText, RotateCcw, ShieldCheck, X } from 'lucide-react'

type InvoiceSummary = {
  id: string
  code: string
  deliveryCode: string
  orderCode: string
  customerId: string
  customerName: string
  invoiceDate: string
  currencyCode: string
  status: 'Posted' | 'Voided'
  grandTotal: number
  lineCount: number
}

type InvoicePage = { items: InvoiceSummary[]; page: number; pageSize: number; totalCount: number }
type Customer = { id: string; code: string; name: string }
type InvoiceScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean }
const defaultInvoiceFields: InvoiceScreenField[] = [
  { key: 'code', label: 'Fatura', visible: true, position: 0 },
  { key: 'orderCode', label: 'Sipariş', visible: true, position: 1 },
  { key: 'deliveryCode', label: 'İrsaliye', visible: true, position: 2 },
  { key: 'invoiceDate', label: 'Tarih', visible: true, position: 3 },
  { key: 'lineCount', label: 'Satır', visible: true, position: 4 },
  { key: 'grandTotal', label: 'Tutar', visible: true, position: 5 },
  { key: 'status', label: 'Durum', visible: true, position: 6 },
  { key: 'actions', label: '', visible: true, position: 7, fixed: true }
]

async function request<T>(path: string, token: string): Promise<T> {
  const response = await authenticatedFetch(path, token, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`
    try { const body = await response.json() as { error?: string; title?: string }; message = body.error || body.title || message } catch { /* keep the status message */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export default function CustomerSalesInvoicesPanel({ token, customer, onClose, onOpenInvoice }: {
  token: string
  customer: Customer
  onClose: () => void
  onOpenInvoice: (invoiceId: string) => void
}) {
  const [items, setItems] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [screenFields, setScreenFields] = useState<InvoiceScreenField[]>(defaultInvoiceFields)

  useEffect(() => {
    let cancelled = false
    void request<{ fields?: InvoiceScreenField[] }>('/api/screen-views/customer-sales-invoices/active', token).then(view => {
      if (cancelled || !Array.isArray(view.fields)) return
      const allowed = new Set(defaultInvoiceFields.map(field => field.key))
      const fields = view.fields.filter(field => allowed.has(field.key)).map(field => ({ ...field, fixed: field.key === 'actions' }))
      if (!fields.some(field => field.key === 'actions')) fields.push({ key: 'actions', label: '', visible: true, position: fields.length, fixed: true })
      if (!cancelled) setScreenFields(fields.sort((a, b) => a.position - b.position))
    }).catch(() => { /* Keep the standard layout if Studio is unavailable. */ })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError('')
      try {
        const pageSize = 100
        const first = await request<InvoicePage>(`/api/sales/invoices/?q=${encodeURIComponent(customer.name)}&page=1&pageSize=${pageSize}`, token)
        const rows = [...first.items]
        for (let page = 2; page <= Math.ceil(first.totalCount / pageSize); page++) {
          const next = await request<InvoicePage>(`/api/sales/invoices/?q=${encodeURIComponent(customer.name)}&page=${page}&pageSize=${pageSize}`, token)
          rows.push(...next.items)
        }
        if (!cancelled) setItems(rows.filter(invoice => invoice.customerId === customer.id))
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [customer.id, customer.name, token])

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal ledger-modal customer-sales-invoices-modal" role="dialog" aria-modal="true" aria-labelledby="customer-sales-invoices-title">
      <div className="modal-head">
        <div><p className="eyebrow">{customer.code} · SATIŞ</p><h2 id="customer-sales-invoices-title">{customer.name} · Faturalar ve iadeler</h2><p className="muted">Müşteriye ait satış faturaları. İade işlemi için faturayı açın.</p></div>
        <button className="icon-button" aria-label="Kapat" onClick={onClose}><X size={19}/></button>
      </div>
      <div className="customer-summary"><div className="customer-summary-icon"><ShieldCheck size={18}/></div><div><b>{loading ? 'Faturalar yükleniyor…' : `${items.length} satış faturası`}</b><small>Aktif firma kapsamındaki kayıtlar</small></div></div>
      {error && <div className="alert inline-alert" role="alert">{error}<button onClick={() => setError('')}><X size={15}/></button></div>}
      <div className="ledger-list customer-sales-invoices-list"><AdvancedDataGrid className="customer-table" gridId="customer-sales-invoices"><thead><tr>{screenFields.filter(field => field.visible).map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan={screenFields.filter(field => field.visible).length} className="table-empty">Faturalar yükleniyor…</td></tr> : items.length === 0 ? <tr><td colSpan={screenFields.filter(field => field.visible).length} className="table-empty">Bu müşteri için görüntülenebilir satış faturası yok.</td></tr> : items.map(invoice => <tr key={invoice.id}>
          {screenFields.filter(field => field.visible).map(field => <td key={field.key}>{field.key === 'code' ? <span className="customer-code">{invoice.code}</span> : field.key === 'orderCode' ? invoice.orderCode : field.key === 'deliveryCode' ? invoice.deliveryCode : field.key === 'invoiceDate' ? invoice.invoiceDate.split('-').reverse().join('.') : field.key === 'lineCount' ? invoice.lineCount : field.key === 'grandTotal' ? `${invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${invoice.currencyCode}` : field.key === 'status' ? <span className={`quote-status ${invoice.status === 'Posted' ? 'accepted' : 'rejected'}`}>{invoice.status === 'Posted' ? 'Kesildi' : 'İptal'}</span> : field.key === 'actions' ? <button className="row-action" onClick={() => onOpenInvoice(invoice.id)}><RotateCcw size={14}/> Faturayı / iadeyi aç</button> : null}</td>)}
        </tr>)}
      </tbody></AdvancedDataGrid></div>
      <div className="modal-foot"><span><FileText size={15}/> İade miktarı ve kaynak fatura bağlantısı fatura detayında korunur.</span><button className="secondary" onClick={onClose}>Kapat</button></div>
    </section>
  </div>
}
