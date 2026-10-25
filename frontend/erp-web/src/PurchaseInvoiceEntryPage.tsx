import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { FilePlus2, PackageCheck, Search, ShieldCheck } from 'lucide-react'
import './purchase-invoice-entry.css'

type ReceiptOption = {
  id: string
  receiptCode: string
  purchaseOrderId: string
  purchaseOrderCode: string
  supplierId: string
  supplierName: string
  receiptDate: string
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  lineCount: number
  currencyCode: string
  purchaseOrderTotal: number
}
type ReceiptPage = { items: ReceiptOption[]; page: number; pageSize: number; totalCount: number }
type CreatedInvoice = { id: string; code: string; grandTotal: number; currencyCode: string }

export type PurchaseInvoiceEntryPageProps = {
  token: string
  role: string
  onInvoiceCreated?: (invoiceId: string) => void
}

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } })
  if (!response.ok) {
    let message = `İstek başarısız (${response.status}).`
    try { const body = await response.json(); message = body.error || body.title || message } catch { /* preserve the status message */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

function localDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function PurchaseInvoiceEntryPage({ token, role, onInvoiceCreated }: PurchaseInvoiceEntryPageProps) {
  const [items, setItems] = useState<ReceiptOption[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<ReceiptOption | null>(null)
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptOption | null>(null)
  const [invoiceCode, setInvoiceCode] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(localDate())
  const pageSize = 25

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await request<ReceiptPage>(`/api/purchasing/invoices/entry/receipts?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(query.trim())}`, token)
      setItems(result.items); setTotal(result.totalCount)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [page, query, token])
  useEffect(() => { void load() }, [load])

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const invoice = await request<CreatedInvoice>(`/api/purchasing/receipts/${selected.id}/invoice`, token, {
        method: 'POST', body: JSON.stringify({ code: invoiceCode.trim(), invoiceDate }),
      })
      setSelected(null); setInvoiceCode(''); setInvoiceDate(localDate())
      setNotice(`${invoice.code} alış faturası kaydedildi. Tedarikçi borcu ${invoice.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${invoice.currencyCode}.`)
      onInvoiceCreated?.(invoice.id)
      await load()
    } catch (e) { setError((e as Error).message); await load() } finally { setBusy(false) }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <main className="purchase-invoice-entry">
    <header className="pie-heading"><div><p className="pie-eyebrow">ERP CORE · SATIN ALMA</p><h1>Alış faturası girişi</h1><p>İşlenmiş mal kabullerini seçin; fatura kaydı sipariş ve stok kabulüyle bağlantısını korusun.</p></div><span className="pie-tenant"><ShieldCheck size={15}/>{role} · firma kapsamı</span></header>
    <p className="pie-hint">Bu akış yalnızca sipariş ve işlenmiş mal kabul satırlarına bağlı stok faturalarını destekler. Sipariş/mal kabul bağlantısı olmayan hizmet veya masraf faturaları mevcut modelde yer almıyor; bunlar için ayrı bir domain ve hesap eşlemesi kararı gerekiyor.</p>
    {error && <div className="pie-alert" role="alert">{error}<button onClick={() => setError('')}>Kapat</button></div>}
    {notice && <div className="pie-notice" role="status">{notice}<button onClick={() => setNotice('')}>Kapat</button></div>}
    <section className="pie-summary"><span><PackageCheck size={20}/></span><div><b>{total} faturalanabilir mal kabul</b><small>İptal edilen ve daha önce faturalanmış kabuller listelenmez.</small></div></section>
    <div className="pie-toolbar"><label><Search size={16}/><input value={query} onChange={e => { setPage(1); setQuery(e.target.value) }} placeholder="Mal kabul, sipariş, tedarikçi veya depo ara"/></label><span>{loading ? 'Yükleniyor…' : `${total === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}`}</span><button disabled={loading} onClick={() => void load()}>Yenile</button></div>
    <div className="pie-workbench"><div className="pie-table-wrap"><AdvancedDataGrid><thead><tr><th>Mal kabul</th><th>Tedarikçi / sipariş</th><th>Kabul tarihi</th><th>Depo</th><th>Satır</th><th>Sipariş toplamı</th><th></th></tr></thead><tbody>
      {loading ? <tr><td colSpan={7} className="pie-empty">Mal kabuller yükleniyor…</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="pie-empty">{query ? 'Aramanızla eşleşen faturalanabilir mal kabul yok.' : 'Faturalanabilir mal kabul yok. Önce satın alma siparişi üzerinden mal kabul kaydedin.'}</td></tr> : items.map(item => <tr key={item.id} aria-selected={previewReceipt?.id===item.id} onClick={() => setPreviewReceipt(item)}>
        <td><b>{item.receiptCode}</b><small>{item.purchaseOrderCode}</small></td><td><b>{item.supplierName}</b><small>Sipariş {item.purchaseOrderCode}</small></td><td>{item.receiptDate.split('-').reverse().join('.')}</td><td>{item.warehouseCode} · {item.warehouseName}</td><td>{item.lineCount}</td><td>{item.purchaseOrderTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {item.currencyCode}</td><td><button className="pie-primary" onClick={event => { event.stopPropagation(); setPreviewReceipt(item); setSelected(item); setInvoiceCode(''); setInvoiceDate(localDate()) }}><FilePlus2 size={15}/> Fatura gir</button></td>
      </tr>)}
    </tbody></AdvancedDataGrid></div><aside className="pie-record-detail" aria-label="Seçili mal kabul ayrıntıları">{previewReceipt?<><small>SEÇİLİ MAL KABUL</small><h2>{previewReceipt.receiptCode}</h2><p>{previewReceipt.supplierName} · {previewReceipt.purchaseOrderCode}</p><dl><div><dt>Kabul tarihi</dt><dd>{previewReceipt.receiptDate.split('-').reverse().join('.')}</dd></div><div><dt>Depo</dt><dd>{previewReceipt.warehouseCode} · {previewReceipt.warehouseName}</dd></div><div><dt>Satır sayısı</dt><dd>{previewReceipt.lineCount}</dd></div><div><dt>Sipariş toplamı</dt><dd>{previewReceipt.purchaseOrderTotal.toLocaleString('tr-TR',{minimumFractionDigits:2})} {previewReceipt.currencyCode}</dd></div></dl><button className="pie-primary" onClick={()=>{setSelected(previewReceipt);setInvoiceCode('');setInvoiceDate(localDate())}}><FilePlus2 size={15}/> Bu mal kabul için fatura gir</button></>:<div className="pie-record-empty"><b>Mal kabul seçin</b><span>Seçili kabulün tedarikçi, depo ve fatura bilgileri burada görünür.</span></div>}</aside></div>
    <footer className="pie-pagination"><span>Sayfa {page} / {pages}</span><div><button disabled={page <= 1 || loading} onClick={() => setPage(x => Math.max(1, x - 1))}>Önceki</button><button disabled={page >= pages || loading} onClick={() => setPage(x => x + 1)}>Sonraki</button></div></footer>
    {selected && <div className="pie-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setSelected(null) }}><section className="pie-modal" role="dialog" aria-modal="true" aria-labelledby="pie-modal-title"><header><div><p className="pie-eyebrow">ALIŞ FATURASI</p><h2 id="pie-modal-title">{selected.receiptCode} için fatura gir</h2><p>{selected.supplierName} · {selected.purchaseOrderCode} · {selected.warehouseName}</p></div><button aria-label="Kapat" disabled={busy} onClick={() => setSelected(null)}>×</button></header><form onSubmit={createInvoice}>
      <label>Tedarikçi fatura numarası<input value={invoiceCode} onChange={e => setInvoiceCode(e.target.value)} maxLength={64} required autoFocus/></label>
      <label>Fatura tarihi<input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required/></label>
      <p className="pie-hint">Vade, tedarikçinin kayıtlı ödeme koşulundan hesaplanır. Kaydetme, mal kabul satırlarını ve cari borç kaydını birlikte oluşturur.</p>
      <footer><button type="button" disabled={busy} onClick={() => setSelected(null)}>Vazgeç</button><button className="pie-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Faturayı kaydet'}</button></footer>
    </form></section></div>}
  </main>
}
