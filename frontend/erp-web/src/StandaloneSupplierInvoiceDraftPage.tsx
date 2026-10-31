import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import './standalone-supplier-invoice-draft.css'
import type { DraftDetail, DraftInput, DraftLineInput, DraftPage, DraftScreenField, DraftSummary, ExpenseAccount, ReceiptOption, StandaloneSupplierInvoiceDraftPageProps, Supplier, SupplierPage } from './supplier-invoice-draft/types'
import { InvoiceDraftForm } from './supplier-invoice-draft/components/InvoiceDraftForm'
import { InvoiceDraftHeader, InvoiceDraftMessages } from './supplier-invoice-draft/components/InvoiceDraftHeader'
import { InvoiceDraftList } from './supplier-invoice-draft/components/InvoiceDraftList'

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
    <InvoiceDraftHeader role={role}/>
    <InvoiceDraftMessages error={error} notice={notice} onClearError={() => setError('')} onClearNotice={() => setNotice('')}/>
    <InvoiceDraftForm draft={draft} editing={!!editing} busy={busy} visibleSuppliers={visibleSuppliers} supplierCount={suppliers.length} expenseAccounts={expenseAccounts} receiptOptions={receiptOptions} onSubmit={save} onUpdate={update} onUpdateLine={updateLine} onSelectSupplier={selectSupplier} onSearchSuppliers={setSupplierSearch} onSelectReceiptLine={selectReceiptLine} onAddLine={addLine} onRemoveLine={removeLine} onCancelEdit={cancelEdit}/>
    <InvoiceDraftList drafts={drafts} fields={draftScreenFields} loading={loading} busy={busy} onRefresh={() => void load()} onEdit={id => void beginEdit(id)} onPost={item => void postDraft(item)}/>
  </main>
}
