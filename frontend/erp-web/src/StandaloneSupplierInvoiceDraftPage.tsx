import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import SearchableRecordPicker from './SearchableRecordPicker'
import { FilePlus2, Plus, RotateCw, ShieldCheck, Trash2 } from 'lucide-react'
import './standalone-supplier-invoice-draft.css'

type Supplier = { id: string; code: string; name: string; currencyCode: string }
type SupplierPage = { items: Supplier[]; totalCount: number }
type ExpenseAccount = { id: string; code: string; name: string; isActive: boolean; statementSection: string }
type DraftLineInput = { description: string; quantity: string; unitCode: string; unitPrice: string; subtotal: string; discountAmount: string; taxAmount: string; total: string; expenseAccountId: string; vatRate: string; standalonePurchaseReceiptLineId: string }
type DraftInput = { requestId: string; supplierId: string; invoiceNumber: string; invoiceDate: string; dueDate: string; currencyCode: string; notes: string; subtotal: string; discountTotal: string; taxTotal: string; grandTotal: string; lines: DraftLineInput[] }
type DraftSummary = { id: string; supplierId: string; supplierName: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; currencyCode: string; grandTotal: number; lineCount: number; status: string; createdAt: string }
type DraftPage = { items: DraftSummary[]; page: number; pageSize: number; totalCount: number }
type ReceiptOption = { lineId: string; receiptId: string; receiptCode: string; receiptDate: string; stockCode: string; stockName: string; quantity: number; unitCode: string; unitCostBase: number }
type DraftScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null }
type DraftDetail = { id: string; supplierId: string; supplierName: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; currencyCode: string; notes: string | null; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; status: string; rowVersion: string; lines: Array<{ lineNumber: number; description: string; quantity: number | null; unitCode: string | null; unitPrice: number | null; subtotal: number; discountAmount: number; taxAmount: number; total: number; expenseAccountId: string | null; vatRate: number | null; standalonePurchaseReceiptLineId: string | null }> }

export type StandaloneSupplierInvoiceDraftPageProps = { token: string; role: string }

const blankLine = (): DraftLineInput => ({ description: '', quantity: '', unitCode: '', unitPrice: '', subtotal: '', discountAmount: '0', taxAmount: '', total: '', expenseAccountId: '', vatRate: '', standalonePurchaseReceiptLineId: '' })
const defaultDraftScreenFields: DraftScreenField[] = [
  { key: 'invoiceNumber', label: 'Fatura no', visible: true, position: 0 }, { key: 'supplierName', label: 'Tedarikçi', visible: true, position: 1 },
  { key: 'invoiceDate', label: 'Fatura tarihi', visible: true, position: 2 }, { key: 'dueDate', label: 'Vade tarihi', visible: true, position: 3 },
  { key: 'currencyCode', label: 'Döviz', visible: true, position: 4 }, { key: 'grandTotal', label: 'Genel toplam', visible: true, position: 5 },
  { key: 'lineCount', label: 'Satır', visible: true, position: 6 }, { key: 'createdAt', label: 'Kaydedilme', visible: true, position: 7 },
  { key: 'status', label: 'Durum', visible: true, position: 8 }, { key: 'actions', label: 'İşlemler', visible: true, position: 9, fixed: true },
]
function localDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const blankDraft = (): DraftInput => ({ requestId: crypto.randomUUID(), supplierId: '', invoiceNumber: '', invoiceDate: localDate(), dueDate: '', currencyCode: 'TRY', notes: '', subtotal: '', discountTotal: '0', taxTotal: '', grandTotal: '', lines: [blankLine()] })

async function request<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } })
  if (!response.ok) {
    let message = `İstek başarısız (${response.status}).`
    try { const body = await response.json(); message = body.error || body.title || message } catch { /* retain the status message */ }
    throw new Error(message)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function optionalNumber(value: string): number | null { return value.trim() === '' ? null : Number(value) }
function requiredNumber(value: string): number { return Number(value) }

export default function StandaloneSupplierInvoiceDraftPage({ token, role }: StandaloneSupplierInvoiceDraftPageProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([])
  const [receiptOptions, setReceiptOptions] = useState<ReceiptOption[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [draftScreenFields, setDraftScreenFields] = useState(defaultDraftScreenFields)
  const [draft, setDraft] = useState<DraftInput>(() => blankDraft())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [editing, setEditing] = useState<{ id: string; rowVersion: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const draftPage = await request<DraftPage>('/api/purchasing/standalone-invoices/?page=1&pageSize=50', token)
      setDrafts(draftPage.items)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [token])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let active = true
    void request<ExpenseAccount[]>('/api/finance/general-ledger/accounts', token)
      .then(accounts => { if (active) setExpenseAccounts(accounts.filter(account => account.isActive && account.statementSection === 'Expense')) })
      .catch(() => { if (active) setExpenseAccounts([]) })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    let active = true
    void request<{ fields: DraftScreenField[] }>('/api/screen-views/standalone-invoice-drafts/active', token)
      .then(view => { if (active && view.fields?.length) setDraftScreenFields(view.fields.map((field, position) => ({ ...field, fixed: field.key === 'actions', position: field.position ?? position }))) })
      .catch(() => { /* keep the default list when layout settings are unavailable */ })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void request<SupplierPage>(`/api/purchasing/standalone-invoices/suppliers?page=1&pageSize=100&q=${encodeURIComponent(supplierSearch.trim())}`, token)
        .then(result => { if (active) setSuppliers(result.items) })
        .catch(e => { if (active) setError((e as Error).message) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [supplierSearch, token])

  useEffect(() => {
    let active = true
    setReceiptOptions([])
    if (!draft.supplierId || !draft.invoiceDate) return () => { active = false }
    void request<ReceiptOption[]>(`/api/purchasing/standalone-invoices/receipts?supplierId=${encodeURIComponent(draft.supplierId)}&invoiceDate=${encodeURIComponent(draft.invoiceDate)}${editing ? `&draftId=${encodeURIComponent(editing.id)}` : ''}`, token)
      .then(items => { if (active) setReceiptOptions(items) })
      .catch(() => { if (active) setReceiptOptions([]) })
    return () => { active = false }
  }, [draft.supplierId, draft.invoiceDate, editing, token])

  const visibleSuppliers = useMemo(() => {
    if (!selectedSupplier || suppliers.some(x => x.id === selectedSupplier.id)) return suppliers
    return [...suppliers, selectedSupplier]
  }, [selectedSupplier, suppliers])

  function update<K extends keyof DraftInput>(field: K, value: DraftInput[K]) { setDraft(current => ({ ...current, [field]: value })) }
  function updateLine(index: number, field: keyof DraftLineInput, value: string) {
    setDraft(current => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, [field]: value } : line) }))
  }
  function selectReceiptLine(index: number, receiptLineId: string) {
    const receipt = receiptOptions.find(x => x.lineId === receiptLineId)
    setDraft(current => ({ ...current, lines: current.lines.map((line, i) => i === index ? {
      ...line, standalonePurchaseReceiptLineId: receiptLineId, expenseAccountId: receiptLineId ? '' : line.expenseAccountId,
      ...(receiptLineId && receipt ? { description: `${receipt.stockCode} · ${receipt.stockName}`, quantity: String(receipt.quantity), unitCode: receipt.unitCode } : {}),
    } : line) }))
  }
  function selectSupplier(id: string) {
    const supplier = suppliers.find(x => x.id === id)
    setSelectedSupplier(supplier || null)
    setDraft(current => ({ ...current, supplierId: id, currencyCode: supplier?.currencyCode || current.currencyCode }))
  }
  function addLine() { setDraft(current => ({ ...current, lines: [...current.lines, blankLine()] })) }
  function removeLine(index: number) { setDraft(current => ({ ...current, lines: current.lines.length <= 1 ? current.lines : current.lines.filter((_, i) => i !== index) })) }

  async function beginEdit(id: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await request<DraftDetail>(`/api/purchasing/standalone-invoices/${id}`, token)
      if (saved.status !== 'Draft') throw new Error('Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir.')
      setEditing({ id: saved.id, rowVersion: saved.rowVersion })
      setSelectedSupplier({ id: saved.supplierId, code: '', name: saved.supplierName, currencyCode: saved.currencyCode })
      setSupplierSearch('')
      setDraft({ requestId: crypto.randomUUID(), supplierId: saved.supplierId, invoiceNumber: saved.invoiceNumber,
        invoiceDate: saved.invoiceDate, dueDate: saved.dueDate || '', currencyCode: saved.currencyCode, notes: saved.notes || '',
        subtotal: String(saved.subtotal), discountTotal: String(saved.discountTotal), taxTotal: String(saved.taxTotal), grandTotal: String(saved.grandTotal),
        lines: saved.lines.map(line => ({ description: line.description, quantity: line.quantity == null ? '' : String(line.quantity),
          unitCode: line.unitCode || '', unitPrice: line.unitPrice == null ? '' : String(line.unitPrice), subtotal: String(line.subtotal),
          discountAmount: String(line.discountAmount), taxAmount: String(line.taxAmount), total: String(line.total),
          expenseAccountId: line.expenseAccountId || '', vatRate: line.vatRate == null ? '' : String(line.vatRate),
          standalonePurchaseReceiptLineId: line.standalonePurchaseReceiptLineId || '' })) })
      setNotice(`${saved.invoiceNumber} taslağı düzenleniyor.`)
      document.querySelector('.sid-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  function cancelEdit() { setEditing(null); setSelectedSupplier(null); setSupplierSearch(''); setDraft(blankDraft()); setError(''); setNotice('') }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const fields = {
        supplierId: draft.supplierId,
        invoiceNumber: draft.invoiceNumber.trim(),
        invoiceDate: draft.invoiceDate,
        dueDate: draft.dueDate || null,
        currencyCode: draft.currencyCode.trim().toUpperCase(),
        notes: draft.notes.trim() || null,
        subtotal: requiredNumber(draft.subtotal), discountTotal: requiredNumber(draft.discountTotal),
        taxTotal: requiredNumber(draft.taxTotal), grandTotal: requiredNumber(draft.grandTotal),
        lines: draft.lines.map((line, index) => ({
          lineNumber: index + 1, description: line.description.trim(), quantity: optionalNumber(line.quantity),
          unitCode: line.unitCode.trim() || null, unitPrice: optionalNumber(line.unitPrice),
          subtotal: requiredNumber(line.subtotal), discountAmount: requiredNumber(line.discountAmount),
          taxAmount: requiredNumber(line.taxAmount), total: requiredNumber(line.total),
          expenseAccountId: line.expenseAccountId || null, vatRate: optionalNumber(line.vatRate),
          standalonePurchaseReceiptLineId: line.standalonePurchaseReceiptLineId || null,
        })),
      }
      if (editing) {
        const updated = await request<{ id: string; invoiceNumber: string }>(`/api/purchasing/standalone-invoices/${editing.id}`, token,
          { method: 'PUT', body: JSON.stringify({ ...fields, expectedRowVersion: editing.rowVersion }) })
        setNotice(`${updated.invoiceNumber} taslağı güncellendi. Muhasebe veya stok kaydı oluşturulmadı.`)
      } else {
        const created = await request<{ id: string; invoiceNumber: string }>('/api/purchasing/standalone-invoices/', token,
          { method: 'POST', body: JSON.stringify({ ...fields, requestId: draft.requestId }) })
        setNotice(`${created.invoiceNumber} taslak olarak kaydedildi. Cari borç, stok, ödeme veya yevmiye kaydı oluşturulmadı.`)
      }
      setEditing(null); setDraft(blankDraft()); setSelectedSupplier(null); setSupplierSearch(''); await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function postDraft(item: DraftSummary) {
    if (item.status !== 'Draft' || busy) return
    const confirmed = window.confirm(`${item.invoiceNumber} numaralı tedarikçi faturası muhasebeleştirilsin mi? Bu işlem gider veya mal kabule bağlı stok maliyeti, varsa indirilecek KDV, tedarikçi borcu ve yevmiye kaydı oluşturur. Stok miktar hareketi veya ödeme kaydı oluşturmaz.`)
    if (!confirmed) return
    setBusy(true); setError(''); setNotice('')
    try {
      await request<{ draftId: string; status: string; journalEntryId: string; ledgerEntryId: string }>(
        `/api/purchasing/standalone-invoices/${item.id}/post`, token, { method: 'POST' })
      setNotice(`${item.invoiceNumber} muhasebeleştirildi. Yevmiye ve tedarikçi cari hareketi oluşturuldu; stok miktarı ve ödeme hareketi oluşturulmadı.`)
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return <main className="standalone-invoice-page">
    <header className="sid-heading"><div><p className="sid-eyebrow">ERP CORE · SATIN ALMA</p><h1>Bağımsız alış faturası taslakları</h1><p>Siparişsiz tedarikçi faturasını kaydedin; uygunsa mal kabul satırıyla eşleştirip maliyet farkını aktarın.</p></div><span className="sid-tenant"><ShieldCheck size={15}/>{role} · firma kapsamı</span></header>
    <section className="sid-draft-banner" role="status"><span><FilePlus2 size={18}/></span><div><b>Taslak · muhasebeleştirilmedi</b><p>Bu kayıt yalnızca belge bilgisidir. Kaydetmek stok, cari borç, ödeme veya yevmiye hareketi oluşturmaz.</p></div></section>
    {error && <div className="sid-alert" role="alert">{error}<button type="button" onClick={() => setError('')}>Kapat</button></div>}
    {notice && <div className="sid-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>Kapat</button></div>}

    <form className="sid-form" onSubmit={save}>
      <section className="sid-card">
        <div className="sid-card-heading"><div><h2>Belge bilgileri</h2><p>Tedarikçi faturasında görünen değerleri girin.</p></div><span>{editing ? 'Taslak düzenleniyor' : 'Taslak'}</span></div>
        <div className="sid-fields">
          <label>Tedarikçi *<SearchableRecordPicker options={visibleSuppliers.map(x=>({id:x.id,label:`${x.code ? `${x.code} · ` : ''}${x.name}`}))} selectedId={draft.supplierId} onSelect={selectSupplier} onSearchChange={setSupplierSearch} title="Tedarikçi seçin" placeholder="Tedarikçi seçin" searchPlaceholder="Tedarikçi kodu veya unvanıyla ara" emptyMessage="Aramanızla eşleşen tedarikçi bulunamadı." required/></label>
          <label>Tedarikçi fatura no *<input value={draft.invoiceNumber} onChange={e => update('invoiceNumber', e.target.value)} maxLength={100} required/></label>
          <label>Fatura tarihi *<input type="date" value={draft.invoiceDate} onChange={e => update('invoiceDate', e.target.value)} required/></label>
          <label>Vade tarihi<input type="date" value={draft.dueDate} onChange={e => update('dueDate', e.target.value)}/></label>
          <label>Para birimi *<input value={draft.currencyCode} onChange={e => update('currencyCode', e.target.value.toUpperCase())} maxLength={3} minLength={3} required/></label>
          <label className="sid-wide">Not<textarea value={draft.notes} onChange={e => update('notes', e.target.value)} maxLength={1000} rows={2}/></label>
        </div>
      </section>

      <section className="sid-card">
        <div className="sid-card-heading"><div><h2>Fatura satırları</h2><p>Miktar ve birim fiyat isteğe bağlıdır; satır tutarları kaynak belgeden girilir, yeniden hesaplanmaz.</p></div><button type="button" className="sid-secondary" onClick={addLine}><Plus size={15}/> Satır ekle</button></div>
        <div className="sid-lines">{draft.lines.map((line, index) => <div className="sid-line" key={index}>
          <div className="sid-line-title"><b>Satır {index + 1}</b><button type="button" className="sid-icon-button" disabled={draft.lines.length === 1} aria-label={`Satır ${index + 1} sil`} onClick={() => removeLine(index)}><Trash2 size={15}/></button></div>
          <label className="sid-wide">Siparişsiz mal kabul satırı<select value={line.standalonePurchaseReceiptLineId} onChange={e => selectReceiptLine(index, e.target.value)}><option value="">Mal kabule bağlı değil · gider hesabı seçin</option>{receiptOptions.map(receipt => <option key={receipt.lineId} value={receipt.lineId}>{receipt.receiptCode} · {receipt.receiptDate} · {receipt.stockCode} — kalan {receipt.quantity} {receipt.unitCode} · birim maliyet {receipt.unitCostBase.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} baz para</option>)}</select></label>
          <label className="sid-wide">Açıklama *<input value={line.description} onChange={e => updateLine(index, 'description', e.target.value)} maxLength={240} required/></label>
          <label>Miktar<input type="number" min="0" step="0.0001" value={line.quantity} onChange={e => updateLine(index, 'quantity', e.target.value)}/></label>
          <label>Birim<input value={line.unitCode} onChange={e => updateLine(index, 'unitCode', e.target.value)} maxLength={12}/></label>
          <label>Birim fiyat<input type="number" min="0" step="0.0001" value={line.unitPrice} onChange={e => updateLine(index, 'unitPrice', e.target.value)}/></label>
          <label>Ara toplam *<input type="number" min="0" step="0.01" value={line.subtotal} onChange={e => updateLine(index, 'subtotal', e.target.value)} required/></label>
          <label>İskonto *<input type="number" min="0" step="0.01" value={line.discountAmount} onChange={e => updateLine(index, 'discountAmount', e.target.value)} required/></label>
          <label>Vergi tutarı *<input type="number" min="0" step="0.01" value={line.taxAmount} onChange={e => updateLine(index, 'taxAmount', e.target.value)} required/></label>
          <label>Belgedeki KDV oranı (%)<input type="number" min="0" max="100" step="0.01" value={line.vatRate} onChange={e => updateLine(index, 'vatRate', e.target.value)}/></label>
          {!line.standalonePurchaseReceiptLineId && <label>Gider hesabı<select value={line.expenseAccountId} onChange={e => updateLine(index, 'expenseAccountId', e.target.value)}><option value="">Şimdi seçme</option>{expenseAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>}
          <label>Satır toplamı *<input type="number" min="0" step="0.01" value={line.total} onChange={e => updateLine(index, 'total', e.target.value)} required/></label>
          <p className="sid-line-note sid-wide">{line.standalonePurchaseReceiptLineId ? 'Bu satır mal kabul maliyetini faturadaki net tutara günceller. Yalnız kalan, tüketilmemiş stok için aktarılır; stok miktarı değişmez.' : 'KDV oranı belge üzerinden kaydedilir; yeniden hesaplanmaz. Gider hesabı yalnız sonraki muhasebeleştirme için sınıflandırmadır.'}</p>
        </div>)}</div>
      </section>

      <section className="sid-card">
        <div className="sid-card-heading"><div><h2>Belge toplamları</h2><p>Toplamları tedarikçi belgesinden aynen aktarın.</p></div></div>
        <div className="sid-fields sid-totals"><label>Ara toplam *<input type="number" min="0" step="0.01" value={draft.subtotal} onChange={e => update('subtotal', e.target.value)} required/></label><label>İskonto toplamı *<input type="number" min="0" step="0.01" value={draft.discountTotal} onChange={e => update('discountTotal', e.target.value)} required/></label><label>Vergi toplamı *<input type="number" min="0" step="0.01" value={draft.taxTotal} onChange={e => update('taxTotal', e.target.value)} required/></label><label>Genel toplam *<input type="number" min="0" step="0.01" value={draft.grandTotal} onChange={e => update('grandTotal', e.target.value)} required/></label></div>
        <footer className="sid-form-footer"><span>Tutarlar kaydedildiği haliyle korunur; bu işlem muhasebe veya stok kaydı oluşturmaz.</span><div className="sid-form-actions">{editing && <button type="button" className="sid-secondary" disabled={busy} onClick={cancelEdit}>Düzenlemeyi iptal et</button>}<button className="sid-primary" disabled={busy || suppliers.length === 0}>{busy ? 'Kaydediliyor…' : <><FilePlus2 size={16}/> {editing ? 'Taslağı güncelle' : 'Taslağı kaydet'}</>}</button></div></footer>
      </section>
    </form>

    <section className="sid-card sid-list-card"><div className="sid-card-heading"><div><h2>Bağımsız tedarikçi faturaları</h2><p>Taslak kayıtları düzenleyebilir, hesap eşleştirmeleri tamamlandıktan sonra muhasebeleştirebilirsiniz.</p></div><button type="button" className="sid-secondary" onClick={() => void load()} disabled={loading}><RotateCw size={15}/> Yenile</button></div>
      <div className="sid-table-wrap"><AdvancedDataGrid><thead>{draftFieldGroups(draftScreenFields).map((group, index) => <tr className="sid-group-row" key={`${group.label}-${index}`}><th colSpan={group.count}>{group.label}</th></tr>)}<tr>{visibleDraftFields(draftScreenFields).map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={visibleDraftFields(draftScreenFields).length} className="sid-empty">Faturalar yükleniyor…</td></tr> : drafts.length === 0 ? <tr><td colSpan={visibleDraftFields(draftScreenFields).length} className="sid-empty">Henüz bağımsız fatura kaydı yok.</td></tr> : drafts.map(item => <tr key={item.id}>{visibleDraftFields(draftScreenFields).map(field => <td key={field.key}>{draftFieldValue(item, field.key, () => void beginEdit(item.id), () => void postDraft(item), busy)}</td>)}</tr>)}</tbody></AdvancedDataGrid></div>
    </section>
  </main>
}

function visibleDraftFields(fields: DraftScreenField[]) { return fields.filter(field => field.visible).sort((a, b) => a.position - b.position) }

function draftFieldGroups(fields: DraftScreenField[]) {
  const visible = visibleDraftFields(fields)
  if (!visible.some(field => field.section?.trim())) return []
  return visible.reduce<{ label: string; count: number }[]>((groups, field) => {
    const label = field.section?.trim() || 'Belge'
    const current = groups[groups.length - 1]
    if (current?.label === label) current.count++
    else groups.push({ label, count: 1 })
    return groups
  }, [])
}

function draftFieldValue(item: DraftSummary, key: string, edit: () => void, post: () => void, busy: boolean) {
  switch (key) {
    case 'invoiceNumber': return <b>{item.invoiceNumber}</b>
    case 'supplierName': return item.supplierName
    case 'invoiceDate': return item.invoiceDate
    case 'dueDate': return item.dueDate || '—'
    case 'currencyCode': return item.currencyCode
    case 'grandTotal': return <>{item.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {item.currencyCode}</>
    case 'lineCount': return item.lineCount
    case 'createdAt': return new Date(item.createdAt).toLocaleString('tr-TR')
    case 'status': return <span className={`sid-status${item.status === 'Posted' ? ' sid-status-posted' : ''}`}>{item.status === 'Posted' ? 'Muhasebeleştirildi' : 'Taslak'}</span>
    case 'actions': return <div className="sid-row-actions">{item.status === 'Draft' && <><button type="button" className="sid-secondary" onClick={edit} disabled={busy}>Düzenle</button><button type="button" className="sid-primary sid-post-button" onClick={post} disabled={busy}>Muhasebeleştir</button></>}{item.status === 'Posted' && <span>Deftere aktarıldı</span>}</div>
    default: return '—'
  }
}
