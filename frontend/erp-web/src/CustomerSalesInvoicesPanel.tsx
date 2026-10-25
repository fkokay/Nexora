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
    <section className="modal ledger-modal" role="dialog" aria-modal="true" aria-labelledby="customer-sales-invoices-title">
      <div className="modal-head">
        <div><p className="eyebrow">{customer.code} · SATIŞ</p><h2 id="customer-sales-invoices-title">{customer.name} · Faturalar ve iadeler</h2><p className="muted">Müşteriye ait satış faturaları. İade işlemi için faturayı açın.</p></div>
        <button className="icon-button" aria-label="Kapat" onClick={onClose}><X size={19}/></button>
      </div>
      <div className="customer-summary"><div className="customer-summary-icon"><ShieldCheck size={18}/></div><div><b>{loading ? 'Faturalar yükleniyor…' : `${items.length} satış faturası`}</b><small>Aktif firma kapsamındaki kayıtlar</small></div></div>
      {error && <div className="alert inline-alert" role="alert">{error}<button onClick={() => setError('')}><X size={15}/></button></div>}
      <div className="ledger-list"><AdvancedDataGrid  className="customer-table"><thead><tr><th>Fatura</th><th>Sipariş / irsaliye</th><th>Tarih</th><th>Satır</th><th>Tutar</th><th>Durum</th><th></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className="table-empty">Faturalar yükleniyor…</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="table-empty">Bu müşteri için görüntülenebilir satış faturası yok.</td></tr> : items.map(invoice => <tr key={invoice.id}>
          <td><span className="customer-code">{invoice.code}</span></td><td>{invoice.orderCode}<small className="cell-subtitle">İrsaliye {invoice.deliveryCode}</small></td><td>{invoice.invoiceDate.split('-').reverse().join('.')}</td><td>{invoice.lineCount}</td><td>{invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {invoice.currencyCode}</td><td><span className={`quote-status ${invoice.status === 'Posted' ? 'accepted' : 'rejected'}`}>{invoice.status === 'Posted' ? 'Kesildi' : 'İptal'}</span></td><td><button className="row-action" onClick={() => onOpenInvoice(invoice.id)}><RotateCcw size={14}/> Faturayı / iadeyi aç</button></td>
        </tr>)}
      </tbody></AdvancedDataGrid></div>
      <div className="modal-foot"><span><FileText size={15}/> İade miktarı ve kaynak fatura bağlantısı fatura detayında korunur.</span><button className="secondary" onClick={onClose}>Kapat</button></div>
    </section>
  </div>
}
