import ScreenViewEditor from './built-in-screen-views/components/ScreenViewEditor'
import ScreenViewHistory from './built-in-screen-views/components/ScreenViewHistory'
import ScreenViewPreview from './built-in-screen-views/components/ScreenViewPreview'
import { groupLayoutFields } from './built-in-screen-views/components/preview-samples'
import type { Catalog, EditorState, LayoutField, Revision, View } from './built-in-screen-views/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { LayoutTemplate, ShieldCheck } from 'lucide-react'
import './built-in-screen-views.css'

async function api<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, token, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; title?: string } | null
    throw new Error(body?.error || body?.title || `İstek başarısız (${response.status}).`)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export default function BuiltInScreenViewsPage({ token, role, locale = 'tr' }: { token: string; role: string; locale?: 'tr' | 'en' }) {
  const en = locale === 'en'
  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [screenKey, setScreenKey] = useState('customers')
  const [state, setState] = useState<EditorState | null>(null)
  const [fields, setFields] = useState<LayoutField[]>([])
  const [name, setName] = useState('')
  const [history, setHistory] = useState<Revision[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const loadSequence = useRef(0)
  const admin = role === 'TenantAdmin'
  const selectedCatalog = catalogs.find(catalog => catalog.key === screenKey)
  const screenLabel = en && screenKey === 'manufacturing-mrp-lines' ? 'MRP plan results' : en && screenKey === 'sales-order-lines' ? 'Sales order lines' : en && screenKey === 'sales-invoice-details' ? 'Sales invoice detail summary' : en && screenKey === 'customer-sales-invoices' ? 'Customer sales invoices' : en && screenKey === 'inventory-trace-balances' ? 'Lot and serial balances' : en && screenKey === 'inventory-warehouse-locations' ? 'Warehouse shelves and bins' : en && screenKey === 'inventory-warehouse-reconciliation' ? 'Location reconciliation' : en && screenKey === 'hr-employees' ? 'Employees' : en && screenKey === 'hr-leave-requests' ? 'Leave requests' : en && screenKey === 'hr-attendance' ? 'Attendance records' : en && screenKey === 'hr-workplace-assignments' ? 'Workplace assignments' : en && screenKey === 'hr-workplace-calendars' ? 'Workplace calendars' : en && screenKey === 'hr-employee-calendar-overrides' ? 'Employee calendar overrides' : en && screenKey === 'customer-details' ? 'Customer detail card' : en && screenKey === 'customers' ? 'Customer list' : en && screenKey === 'inventory-stock-movements' ? 'Stock movement history' : en && screenKey === 'inventory-stock' ? 'Stock cards' : en && screenKey === 'sales-orders' ? 'Sales orders' : en && screenKey === 'sales-quotes' ? 'Sales quotes' : en && screenKey === 'sales-promotions' ? 'Campaigns' : en && screenKey === 'sales-campaign-performance' ? 'Campaign performance' : en && screenKey === 'sales-deliveries' ? 'Sales deliveries' : en && screenKey === 'sales-invoices' ? 'Sales invoices' : en && screenKey === 'purchase-invoices' ? 'Purchase invoices' : en && screenKey === 'standalone-invoice-drafts' ? 'Standalone purchase invoice drafts' : en && screenKey === 'purchase-orders' ? 'Purchase orders' : en && screenKey === 'purchase-receipts' ? 'Purchase receipts' : en && screenKey === 'purchase-delivery-notes' ? 'Supplier delivery notes' : en && screenKey === 'purchase-delivery-order-lines' ? 'Delivery note entry · order lines' : en && screenKey === 'purchase-order-delivery-notes' ? 'Supplier delivery notes for order' : en && screenKey === 'purchase-delivery-note-lines' ? 'Supplier delivery note lines' : en && screenKey === 'manufacturing-orders' ? 'Manufacturing orders' : en && screenKey === 'fixed-assets' ? 'Fixed assets' : en && screenKey === 'fixed-asset-depreciation' ? 'Depreciation schedule' : en && screenKey === 'fixed-asset-assignments' ? 'Custody history' : en && screenKey === 'crm-opportunities' ? 'CRM opportunities' : en && screenKey === 'payment-instruments' ? 'Payment instruments' : en && screenKey === 'commercial-contracts' ? 'Commercial contracts' : en && screenKey === 'operational-project-tasks' ? 'Project tasks' : en && screenKey === 'operational-project-time-entries' ? 'Project time entries' : en && screenKey === 'operational-projects' ? 'Projects' : en && screenKey === 'direct-cash-budgets' ? 'Direct cash budgets' : en && screenKey === 'finance-budget-scenarios' ? 'Budget plan and actuals' : en && screenKey === 'finance-credit-schedules' ? 'Credit repayment schedules' : en && screenKey === 'finance-credit-movements' ? 'Credit facility movements' : en && screenKey === 'finance-accounts' ? 'Cash and bank accounts' : en && screenKey === 'finance-account-transactions' ? 'Cash and bank account transactions' : en && screenKey === 'finance-journals' ? 'General ledger journal' : en && screenKey === 'finance-ledger-accounts' ? 'Chart of accounts' : en && screenKey === 'finance-ledger-mappings' ? 'Chart of accounts mappings' : en && screenKey === 'finance-transfer-sources' ? 'General ledger transfer sources' : en && screenKey === 'finance-statement-unmatched-book' ? 'Unmatched book movements' : en && screenKey === 'finance-maturity-aging' ? 'Maturity aging summary' : en && screenKey === 'finance-fx-exposure' ? 'FX exposure report' : en && screenKey === 'finance-fx-revaluations' ? 'FX revaluation vouchers' : en && screenKey === 'finance-fx-revaluation-lines' ? 'FX revaluation voucher lines' : en && screenKey === 'finance-cash-flow-report' ? 'Cash flow actuals report' : en && screenKey === 'finance-income-statement' ? 'Income statement report' : en && screenKey === 'finance-balance-sheet' ? 'Balance sheet' : en && screenKey === 'finance-trial-balance' ? 'Trial balance' : en && screenKey === 'purchase-invoice-receipt-selection' ? 'Purchase invoice receipt selection' : en && screenKey === 'finance-statements' ? 'Bank statements' : en && screenKey === 'finance-statement-lines' ? 'Bank statement lines' : en && screenKey === 'finance-maturities' ? 'Invoice maturities' : en && screenKey === 'finance-cash-flow-forecast' ? 'Cash flow forecast' : selectedCatalog?.label || (en ? 'ERP screen' : 'ERP ekranı')

  const load = useCallback(async (key = screenKey) => {
    const sequence = ++loadSequence.current
    setBusy(true); setError('')
    try {
      const [catalog, editor] = await Promise.all([
        api<Catalog[]>(token, '/api/screen-views/catalog'),
        api<EditorState>(token, `/api/screen-views/${encodeURIComponent(key)}/draft`)
      ])
      if (sequence !== loadSequence.current) return
      setCatalogs(catalog); setState(editor)
      const current = editor.draft || editor.active
      setFields(current.fields.map((field, position) => ({ ...field, position })))
      setName(editor.draft?.name || editor.active.name)
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message)
    } finally {
      if (sequence === loadSequence.current) setBusy(false)
    }
  }, [screenKey, token])

  useEffect(() => {
    void load()
    return () => { loadSequence.current++ }
  }, [load])
  useEffect(() => {
    if (!admin) return
    let active = true
    void api<Revision[]>(token, `/api/screen-views/${encodeURIComponent(screenKey)}/history`)
      .then(revisions => { if (active) setHistory(revisions) })
      .catch(() => { if (active) setHistory([]) })
    return () => { active = false }
  }, [admin, screenKey, state?.draft?.revision, state?.active.revision, token])

  const visibleFields = useMemo(() => fields.filter(field => field.visible).sort((a, b) => a.position - b.position), [fields])
  const previewGroups = useMemo(() => groupLayoutFields(visibleFields, en), [visibleFields, en])
  function updateField(key: string, update: Partial<LayoutField>) {
    setFields(current => current.map(field => field.key === key ? { ...field, ...update } : field))
  }
  function move(index: number, delta: -1 | 1) {
    const next = [...fields].sort((a, b) => a.position - b.position)
    const target = index + delta
    if (target < 0 || target >= next.length || next[index].fixed || next[target].fixed) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setFields(next.map((field, position) => ({ ...field, position })))
  }
  function reorder(source: string, target: string) {
    const next = [...fields].sort((a, b) => a.position - b.position)
    const from = next.findIndex(field => field.key === source), to = next.findIndex(field => field.key === target)
    if (from < 0 || to < 0 || next[from].fixed || next[to].fixed) return
    const [picked] = next.splice(from, 1); next.splice(to, 0, picked)
    setFields(next.map((field, position) => ({ ...field, position })))
  }

  async function createDraft() {
    setBusy(true); setError(''); setNotice('')
    try { await api(token, `/api/screen-views/${encodeURIComponent(screenKey)}/draft`, { method: 'POST', body: JSON.stringify({ name: state?.active.screenLabel || screenLabel }) }); await load(); setNotice(en ? 'Draft created from the published layout.' : 'Yayımlanan düzenden taslak oluşturuldu.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function saveDraft() {
    if (!state?.draft?.id) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await api<View>(token, `/api/screen-views/${state.draft.id}`, { method: 'PUT', body: JSON.stringify({ expectedRevision: state.draft.revision, name, fields: [...fields].sort((a, b) => a.position - b.position) }) })
      await load(); setNotice(`${en ? 'Draft saved' : 'Taslak kaydedildi'} · v${saved.revision}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function publishDraft() {
    if (!state?.draft?.id) return
    setBusy(true); setError(''); setNotice('')
    try { await api<View>(token, `/api/screen-views/${state.draft.id}/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision: state.draft.revision }) }); await load(); setNotice(en ? 'Layout published to this company.' : 'Düzen bu firma için yayımlandı.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function restoreDraft(revision: Revision) {
    setBusy(true); setError(''); setNotice('')
    try { await api(token, `/api/screen-views/${encodeURIComponent(screenKey)}/draft-from-revision/${revision.id}`, { method: 'POST' }); await load(); setNotice(en ? 'A new draft was created from history. Review and publish it.' : 'Geçmiş sürümden yeni taslak oluşturuldu. İnceleyip yayımlayın.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return <section className="screen-view-page">
    <header className="screen-view-hero screen-page-header"><span className="screen-view-hero-icon"><LayoutTemplate size={22}/></span><div><p className="eyebrow">{en ? 'DEVELOPMENT STUDIO · SCREEN LAYOUTS' : 'GELİŞTİRME STUDIO · EKRAN DÜZENLERİ'}</p><h1>{en ? 'Screen layouts' : 'Ekran düzenleri'}</h1><p>{en ? 'Change the visible columns and their order on existing ERP screens. This does not create a filtered list or report.' : 'Mevcut ERP ekranlarında görünen sütunları, sıralarını ve destekleniyorsa genişliklerini düzenleyin. Filtreli liste veya rapor oluşturmaz.'}</p></div><span className="screen-view-scope"><ShieldCheck size={15}/>{en ? 'Company scoped' : 'Firma kapsamlı'}</span></header>
    {error && <div className="alert inline-alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}{notice && <div className="notice">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
    <div className="screen-view-toolbar"><label>{en ? 'ERP screen' : 'ERP ekranı'}<select value={screenKey} disabled={busy} onChange={event => { setScreenKey(event.target.value); setHistory([]) }}>{(catalogs.length ? catalogs : [{ key: 'customers', label: en ? 'Customer list' : 'Cari listesi', fields: [] }]).map(catalog => <option key={catalog.key} value={catalog.key}>{en && catalog.key === 'manufacturing-mrp-lines' ? 'MRP plan results' : en && catalog.key === 'customer-sales-invoices' ? 'Customer sales invoices' : en && catalog.key === 'hr-employees' ? 'Employees' : en && catalog.key === 'hr-leave-requests' ? 'Leave requests' : en && catalog.key === 'hr-attendance' ? 'Attendance records' : en && catalog.key === 'hr-workplace-assignments' ? 'Workplace assignments' : en && catalog.key === 'hr-workplace-calendars' ? 'Workplace calendars' : en && catalog.key === 'hr-employee-calendar-overrides' ? 'Employee calendar overrides' : en && catalog.key === 'audit-events' ? 'Audit log' : en && catalog.key === 'customers' ? 'Customer list' : en && catalog.key === 'inventory-stock-movements' ? 'Stock movement history' : en && catalog.key === 'inventory-stock' ? 'Stock cards' : en && catalog.key === 'inventory-warehouse-locations' ? 'Warehouse shelves and bins' : en && catalog.key === 'inventory-warehouse-reconciliation' ? 'Location reconciliation' : en && catalog.key === 'sales-orders' ? 'Sales orders' : en && catalog.key === 'sales-quotes' ? 'Sales quotes' : en && catalog.key === 'sales-promotions' ? 'Campaigns' : en && catalog.key === 'sales-campaign-performance' ? 'Campaign performance' : en && catalog.key === 'sales-deliveries' ? 'Sales deliveries' : en && catalog.key === 'sales-invoices' ? 'Sales invoices' : en && catalog.key === 'purchase-invoices' ? 'Purchase invoices' : en && catalog.key === 'standalone-invoice-drafts' ? 'Standalone purchase invoice drafts' : en && catalog.key === 'purchase-orders' ? 'Purchase orders' : en && catalog.key === 'purchase-receipts' ? 'Purchase receipts' : en && catalog.key === 'purchase-delivery-notes' ? 'Supplier delivery notes' : en && catalog.key === 'purchase-delivery-order-lines' ? 'Delivery note entry · order lines' : en && catalog.key === 'purchase-order-delivery-notes' ? 'Supplier delivery notes for order' : en && catalog.key === 'purchase-delivery-note-lines' ? 'Supplier delivery note lines' : en && catalog.key === 'manufacturing-orders' ? 'Manufacturing orders' : en && catalog.key === 'fixed-assets' ? 'Fixed assets' : en && catalog.key === 'fixed-asset-depreciation' ? 'Depreciation schedule' : en && catalog.key === 'fixed-asset-assignments' ? 'Custody history' : en && catalog.key === 'crm-opportunities' ? 'CRM opportunities' : en && catalog.key === 'payment-instruments' ? 'Payment instruments' : en && catalog.key === 'commercial-contracts' ? 'Commercial contracts' : en && catalog.key === 'operational-project-tasks' ? 'Project tasks' : en && catalog.key === 'operational-project-time-entries' ? 'Project time entries' : en && catalog.key === 'operational-projects' ? 'Projects' : en && catalog.key === 'direct-cash-budgets' ? 'Direct cash budgets' : en && catalog.key === 'finance-accounts' ? 'Cash and bank accounts' : en && catalog.key === 'finance-account-transactions' ? 'Cash and bank account transactions' : en && catalog.key === 'finance-journals' ? 'General ledger journal' : en && catalog.key === 'finance-ledger-accounts' ? 'Chart of accounts' : en && catalog.key === 'finance-ledger-mappings' ? 'Chart of accounts mappings' : en && catalog.key === 'finance-credit-schedules' ? 'Credit repayment schedules' : en && catalog.key === 'finance-credit-movements' ? 'Credit facility movements' : en && catalog.key === 'finance-transfer-sources' ? 'General ledger transfer sources' : en && catalog.key === 'finance-statement-unmatched-book' ? 'Unmatched book movements' : en && catalog.key === 'finance-maturity-aging' ? 'Maturity aging summary' : en && catalog.key === 'finance-fx-exposure' ? 'FX exposure report' : en && catalog.key === 'finance-cash-flow-report' ? 'Cash flow actuals report' : en && catalog.key === 'finance-income-statement' ? 'Income statement report' : en && catalog.key === 'finance-fx-revaluations' ? 'FX revaluation vouchers' : en && catalog.key === 'finance-fx-revaluation-lines' ? 'FX revaluation voucher lines' : en && catalog.key === 'finance-balance-sheet' ? 'Balance sheet' : en && catalog.key === 'finance-trial-balance' ? 'Trial balance' : en && catalog.key === 'purchase-invoice-receipt-selection' ? 'Purchase invoice receipt selection' : en && catalog.key === 'finance-statements' ? 'Bank statements' : en && catalog.key === 'finance-statement-lines' ? 'Bank statement lines' : en && catalog.key === 'finance-maturities' ? 'Invoice maturities' : en && catalog.key === 'finance-cash-flow-forecast' ? 'Cash flow forecast' : catalog.label}</option>)}</select></label><div className="screen-view-version"><span className={state?.active.isPublished ? 'published' : 'default'}><i/>{state?.active.isPublished ? (en ? 'Published' : 'Yayımlanmış') : (en ? 'Default layout' : 'Varsayılan düzen')}</span>{state?.active.isPublished && <small>v{state.active.revision}</small>}</div><button className="secondary small-button" disabled={busy} onClick={() => void load()}>{en ? 'Refresh' : 'Yenile'}</button></div>
    {state && <div className="screen-view-workspace">
      <ScreenViewEditor en={en} busy={busy} admin={admin} state={state} fields={fields} name={name} visibleCount={visibleFields.length} screenKey={screenKey} onNameChange={setName} onCreateDraft={() => void createDraft()} onSaveDraft={() => void saveDraft()} onPublishDraft={() => void publishDraft()} onUpdateField={updateField} onMove={move} onReorder={reorder}/>
      <ScreenViewPreview en={en} screenKey={screenKey} screenLabel={screenLabel} visibleFields={visibleFields} previewGroups={previewGroups}/>
      {admin && <ScreenViewHistory en={en} busy={busy} state={state} history={history} onRefresh={() => void load()} onRestore={revision => void restoreDraft(revision)}/>}
    </div>}
  </section>
}
