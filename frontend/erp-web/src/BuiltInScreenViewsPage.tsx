import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowDown, ArrowUp, Check, Clock3, Eye, EyeOff, GripVertical, LayoutTemplate, Plus, RotateCcw, Save, Send, ShieldCheck } from 'lucide-react'
import './built-in-screen-views.css'

type Field = { key: string; label: string; defaultVisible: boolean; fixed?: boolean }
type LayoutField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null; width?: number | null }
type Catalog = { key: string; label: string; fields: Field[] }
type View = { id: string | null; screenKey: string; screenLabel: string; name: string; isPublished: boolean; revision: number; fields: LayoutField[] }
type Revision = { id: string; revision: number; name: string; fields: LayoutField[]; changeKind: string; changedByUserId: string; createdAt: string }
type EditorState = { catalog: Catalog; active: View; draft: View | null }
const previewScreensWithExternalSearch = new Set([
  'customers', 'commercial-contracts', 'inventory-stock-movements', 'hr-employees', 'fixed-assets',
  'inventory-trace-balances', 'manufacturing-orders', 'manufacturing-mrp-lines', 'purchase-delivery-notes',
  'operational-projects', 'operational-project-tasks', 'operational-project-time-entries', 'sales-promotions',
  'sales-campaign-performance', 'purchase-invoice-receipt-selection', 'sales-distribution-plan',
  'crm-opportunities', 'finance-credit-schedules', 'finance-credit-movements'
])
const screensWithResizableColumns = new Set([
  'customers', 'sales-returns', 'finance-accounts', 'finance-account-transactions',
  'finance-balance-sheet', 'finance-cash-flow-report', 'finance-fx-exposure',
  'finance-fx-revaluation-lines', 'finance-fx-revaluations', 'finance-income-statement',
  'finance-journals', 'finance-ledger-accounts', 'finance-ledger-mappings', 'finance-maturities',
  'finance-maturity-aging', 'finance-statement-lines', 'finance-statement-unmatched-book',
  'finance-statements', 'finance-transfer-sources', 'finance-trial-balance',
  'hr-attendance', 'hr-employee-calendar-overrides', 'hr-employees', 'hr-leave-requests',
  'hr-workplace-assignments', 'hr-workplace-calendars'
])

function supportsColumnWidth(screenKey: string) {
  return screensWithResizableColumns.has(screenKey)
}

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
      <section className="panel screen-view-editor"><div className="screen-view-panel-head"><div><p className="eyebrow">{en ? 'LAYOUT EDITOR' : 'DÜZEN TASARIMI'}</p><h2>{en ? 'List fields' : 'Liste alanları'}</h2><p>{en ? 'Change labels, visibility, and order. System actions stay available.' : 'Etiketleri, görünürlüğü ve sıralamayı değiştirin. Sistem işlemleri erişilebilir kalır.'}</p></div>{state.draft ? <span className="screen-view-draft"><Clock3 size={14}/>{en ? 'Draft' : 'Taslak'} · v{state.draft.revision}</span> : admin ? <button className="secondary small-button" disabled={busy} onClick={() => void createDraft()}><Plus size={15}/>{en ? 'Create draft' : 'Taslak oluştur'}</button> : <span className="screen-view-readonly">{en ? 'Read only' : 'Salt okunur'}</span>}</div>
        {state.draft && admin ? <><label className="screen-view-name">{en ? 'Draft name' : 'Taslak adı'}<input maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><div className="screen-view-fields">{[...fields].sort((a, b) => a.position - b.position).map((field, index) => <article className={`screen-view-field${field.fixed ? ' fixed' : ''}${supportsColumnWidth(screenKey) ? ' screen-view-field-width' : ''}`} key={field.key} draggable={!field.fixed} onDragStart={event => event.dataTransfer.setData('text/plain', field.key)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorder(event.dataTransfer.getData('text/plain'), field.key) }}><GripVertical size={16} className="screen-view-grip"/><label className="screen-view-visible" title={en ? 'Show or hide column' : 'Sütunu göster veya gizle'}><input type="checkbox" checked={field.visible} disabled={field.fixed} onChange={event => updateField(field.key, { visible: event.target.checked })}/>{field.visible ? <Eye size={16}/> : <EyeOff size={16}/>}</label><input aria-label={en ? 'Column label' : 'Sütun etiketi'} maxLength={80} value={field.label} onChange={event => updateField(field.key, { label: event.target.value })}/><label className="screen-view-section-label">{en ? 'Section' : 'Bölüm'}<input aria-label={en ? `Section for ${field.label}` : `${field.label} bölümü`} maxLength={40} disabled={field.fixed} value={field.section || ''} placeholder={en ? 'General' : 'Genel'} onChange={event => updateField(field.key, { section: event.target.value || null })}/></label>{supportsColumnWidth(screenKey) && !field.fixed && <label className="screen-view-width-label">{en ? 'Width (px)' : 'Genişlik (px)'}<input aria-label={en ? `Width for ${field.label}` : `${field.label} genişliği`} type="number" min={80} max={640} step={10} value={field.width ?? ''} placeholder={en ? 'Auto' : 'Otomatik'} onChange={event => updateField(field.key, { width: event.target.value ? Number(event.target.value) : null })}/></label>}<code>{field.key}</code>{field.fixed && <small>{en ? 'Required' : 'Zorunlu'}</small>}<div className="screen-view-order"><button type="button" aria-label={en ? 'Move up' : 'Yukarı taşı'} disabled={index === 0 || field.fixed || fields[index - 1]?.fixed} onClick={() => move(index, -1)}><ArrowUp size={14}/></button><button type="button" aria-label={en ? 'Move down' : 'Aşağı taşı'} disabled={index === fields.length - 1 || field.fixed || fields[index + 1]?.fixed} onClick={() => move(index, 1)}><ArrowDown size={14}/></button></div></article>)}</div><div className="screen-view-actions"><span>{visibleFields.length} {en ? 'visible columns' : 'görünür sütun'}</span><button className="secondary" disabled={busy} onClick={() => void saveDraft()}><Save size={15}/>{en ? 'Save draft' : 'Taslağı kaydet'}</button><button className="primary" disabled={busy || state.draft.revision < 1} onClick={() => void publishDraft()}><Send size={15}/>{en ? 'Publish' : 'Yayımla'}</button></div></> : <div className="screen-view-empty"><Check size={18}/><span>{state.active.isPublished ? (en ? 'The published company layout is active.' : 'Yayımlanmış firma düzeni kullanımda.') : (en ? 'ERP varsayılan düzeni kullanımda.' : 'ERP varsayılan düzeni kullanımda.')}</span></div>}
      </section>
      <section className="panel screen-view-preview"><div className="screen-view-panel-head"><div><p className="eyebrow">{en ? 'SAFE PREVIEW' : 'GÜVENLİ ÖNİZLEME'}</p><h2>{screenLabel}</h2><p>{en ? 'Synthetic example rows' : 'Örnek sentetik satırlar'}</p></div><span className="screen-view-preview-badge"><Eye size={14}/>{en ? 'Preview' : 'Önizleme'}</span></div><div className="screen-view-table-wrap"><AdvancedDataGrid hideSearch={previewScreensWithExternalSearch.has(screenKey)} externalPagination={screenKey === 'customers'} enableRowSelection={screenKey !== 'customers'}><thead>{previewGroups.length > 0 && <tr className="screen-view-group-row">{previewGroups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.count}>{group.label}</th>)}</tr>}<tr>{visibleFields.map(field => <th key={field.key} style={field.width ? { width: `${field.width}px`, minWidth: `${field.width}px` } : undefined}>{field.label}</th>)}</tr></thead><tbody>{(screenKey === 'inventory-stock' ? ['SKU-001','SKU-002'] : screenKey === 'sales-orders' ? ['SIP-001','SIP-002'] : screenKey === 'sales-order-lines' ? ['SAT-001 · Paslanmaz sac','SAT-002 · Bağlantı elemanı'] : screenKey === 'sales-quotes' ? ['TEK-2026-001','TEK-2026-002'] : screenKey === 'sales-promotions' ? ['KMP-001','KMP-002'] : screenKey === 'sales-campaign-performance' ? ['KMP-001 · Yaz indirimi','KMP-002 · Kurumsal kampanya'] : screenKey === 'sales-deliveries' ? ['IRS-2026-001','IRS-2026-002'] : screenKey === 'customer-sales-invoices' ? ['INV-2026-014','INV-2026-015'] : screenKey === 'sales-invoices' ? ['SATF-2026-001','SATF-2026-002'] : screenKey === 'purchase-invoices' ? ['ALF-001','ALF-002'] : screenKey === 'standalone-invoice-drafts' ? ['ALF-T-001','ALF-T-002'] : screenKey === 'purchase-orders' ? ['SAT-001','SAT-002'] : screenKey === 'purchase-receipts' ? ['MKB-2026-001','MKB-2026-002'] : screenKey === 'purchase-delivery-order-lines' ? ['PO line 10','PO line 20'] : screenKey === 'purchase-order-delivery-notes' ? ['SUP-DN-2026-018','SUP-DN-2026-019'] : screenKey === 'purchase-delivery-note-lines' ? ['PO line 10','PO line 20'] : screenKey === 'manufacturing-orders' ? ['URE-2026-001','URE-2026-002'] : screenKey === 'fixed-asset-depreciation' ? ['2026-01','2026-02'] : screenKey === 'fixed-asset-assignments' ? ['KIY-001 · Ayşe Yılmaz','KIY-002 · Mehmet Demir'] : screenKey === 'exchange-rates' ? ['USD','EUR'] : screenKey === 'inventory-trace-balances' ? ['LOT-2026-001','SER-2026-002'] : screenKey === 'inventory-warehouse-locations' ? ['A-01','B-02'] : screenKey === 'inventory-warehouse-reconciliation' ? ['SKU-001','SKU-002'] : screenKey === 'warehouse-location-balances' ? ['RAF-A01','RAF-B02'] : screenKey === 'crm-opportunities' ? ['FRS-001','FRS-002'] : screenKey === 'payment-instruments' ? ['CEK-2026-001','SNT-2026-001'] : screenKey === 'commercial-contracts' ? ['SOZ-2026-001','SOZ-2026-002'] : screenKey === 'operational-project-tasks' ? ['TASK-001','TASK-002'] : screenKey === 'operational-project-time-entries' ? ['TIME-001','TIME-002'] : screenKey === 'operational-projects' ? ['PRJ-001','PRJ-002'] : screenKey === 'direct-cash-budgets' ? ['2026-TRY','2026-EUR'] : screenKey === 'finance-budget-scenarios' ? ['2026-01','2026-02'] : screenKey === 'finance-credit-schedules' ? ['20.11.2026','20.12.2026'] : screenKey === 'finance-credit-movements' ? ['KRD-2026-001','KRD-2026-002'] : screenKey === 'finance-accounts' ? ['KASA-01','BNK-01'] : screenKey === 'finance-account-transactions' ? ['MOV-2026-001','MOV-2026-002'] : screenKey === 'finance-journals' ? ['YEV-2026-001','YEV-2026-002'] : screenKey === 'finance-ledger-accounts' ? ['100 · Kasa','300 · Banka kredileri'] : screenKey === 'finance-ledger-mappings' ? ['Satış faturası geliri','Tedarikçi ödeme hesabı'] : screenKey === 'finance-transfer-sources' ? ['SATF-2026-014','ODE-2026-008'] : screenKey === 'finance-statement-unmatched-book' ? ['2026-10-21-01','2026-10-22-02'] : screenKey === 'finance-maturity-aging' ? ['TRY-ALACAK','USD-BORC'] : screenKey === 'finance-fx-exposure' ? ['USD-2026-001','EUR-2026-002'] : screenKey === 'finance-cash-flow-report' ? ['2026-TRY','2026-EUR'] : screenKey === 'finance-income-statement' ? ['PNL-2026-001','PNL-2026-002'] : screenKey === 'finance-fx-revaluations' ? ['DGR-2026-010','DGR-2026-011'] : screenKey === 'finance-fx-revaluation-lines' ? ['SATF-2026-014','ALF-2026-008'] : screenKey === 'finance-balance-sheet' ? ['BS-2026-001','BS-2026-002'] : screenKey === 'finance-trial-balance' ? ['100 · Cash','600 · Sales'] : ['CAR-001','CAR-002']).map((code, index) => <tr key={code}>{visibleFields.map(field => <td key={field.key} style={field.width ? { width: `${field.width}px`, minWidth: `${field.width}px` } : undefined}>{field.fixed ? <span className="screen-view-preview-actions" aria-label={en ? 'Synthetic actions, disabled' : 'Sentetik işlemler, devre dışı'}>{previewValue(screenKey, field.key, index, en).split(' · ').map((action, actionIndex) => <button type="button" className="secondary small-button" key={`${field.key}-${actionIndex}`} disabled tabIndex={-1}>{action}</button>)}</span> : previewValue(screenKey, field.key, index, en)}</td>)}</tr>)}</tbody></AdvancedDataGrid></div></section>
      {admin && <section className="panel screen-view-history"><div className="screen-view-panel-head"><div><p className="eyebrow">{en ? 'REVISION HISTORY' : 'SÜRÜM GEÇMİŞİ'}</p><h2>{en ? 'Published and saved revisions' : 'Yayımlanan ve kaydedilen sürümler'}</h2></div><button className="secondary small-button" disabled={busy} onClick={() => void load()}><RotateCcw size={14}/>{en ? 'Refresh' : 'Yenile'}</button></div><div className="screen-view-revisions">{history.map(revision => <article key={revision.id}><div><b>{revision.name} · v{revision.revision}</b><small>{revision.changeKind} · {new Date(revision.createdAt).toLocaleString(en ? 'en-US' : 'tr-TR')}</small></div><button type="button" className="secondary small-button" disabled={busy || Boolean(state.draft)} onClick={() => void restoreDraft(revision)}><RotateCcw size={14}/>{en ? 'Use as draft' : 'Taslağa al'}</button></article>)}{history.length === 0 && <p className="empty-small">{en ? 'No revisions yet.' : 'Henüz sürüm geçmişi yok.'}</p>}</div></section>}
    </div>}
  </section>
}

function groupLayoutFields(fields: LayoutField[], en: boolean) {
  if (!fields.some(field => field.section?.trim())) return []
  return fields.reduce<{ label: string; count: number }[]>((groups, field) => {
    const label = field.section?.trim() || (en ? 'General' : 'Genel')
    const current = groups[groups.length - 1]
    if (current?.label === label) current.count++
    else groups.push({ label, count: 1 })
    return groups
  }, [])
}

function previewValue(screenKey: string, key: string, index: number, en: boolean) {
  const employeeValues: Record<string, [string, string]> = {
    personnelCode: ['IK-001', 'IK-002'], fullName: ['Ayşe Yılmaz', 'Mehmet Demir'], department: ['Üretim', 'Finans'],
    jobTitle: ['Üretim planlama uzmanı', 'Finans sorumlusu'], status: [en ? 'Active' : 'Aktif', en ? 'Terminated' : 'Ayrıldı'],
    actions: [en ? 'Edit' : 'Düzenle', en ? 'Edit' : 'Düzenle']
  }
  const leaveRequestValues: Record<string, [string, string]> = {
    employee: ['Ayşe Yılmaz', 'Mehmet Demir'], leaveType: [en ? 'Annual' : 'Yıllık', en ? 'Medical' : 'Hastalık'],
    startDate: ['04.11.2026', '12.11.2026'], endDate: ['08.11.2026', '12.11.2026'],
    requestedDays: ['5', '1'], status: [en ? 'Pending' : 'Bekliyor', en ? 'Approved' : 'Onaylandı'],
    actions: [en ? 'Approve · Reject' : 'Onayla · Reddet', en ? 'Cancel' : 'İptal et']
  }
  const attendanceValues: Record<string, [string, string]> = {
    employee: ['Ayşe Yılmaz', 'Mehmet Demir'], workDate: ['20.10.2026', '21.10.2026'],
    workedMinutes: ['8 sa 0 dk', '7 sa 30 dk'], overtimeMinutes: ['0 sa 0 dk', '0 sa 30 dk'],
    note: [en ? 'Day shift' : 'Gündüz vardiyası', '—'], actions: [en ? 'Correct' : 'Düzelt', en ? 'Correct' : 'Düzelt']
  }
  const workplaceAssignmentValues: Record<string, [string, string]> = {
    employee: ['IK-001 · Ayşe Yılmaz', 'IK-002 · Mehmet Demir'], workplaceCode: ['MERKEZ', 'FABRIKA-1'],
    effectiveFrom: ['01.01.2026', '01.03.2026'], versionStatus: ['v2 · Onaylandı', 'v1 · Onay bekliyor'],
    actions: [en ? 'Approve · Reject' : 'Onayla · Reddet', en ? 'Approve · Reject' : 'Onayla · Reddet']
  }
  const workplaceCalendarValues: Record<string, [string, string]> = {
    workplaceCode: ['MERKEZ', 'FABRIKA-1'], effectiveFrom: ['01.01.2026', '01.03.2026'],
    versionStatus: ['v1 · Onaylandı', 'v2 · Onay bekliyor'], policyReference: ['IK-POL-2026-01', 'IK-POL-2026-02'],
    calendar: ['Hafta içi 08:00 · JSON önizleme', 'Hafta içi 08:00 · JSON önizleme'],
    actions: [en ? 'Approve · Reject' : 'Onayla · Reddet', en ? 'Approve · Reject' : 'Onayla · Reddet']
  }
  const employeeCalendarOverrideValues: Record<string, [string, string]> = {
    employee: ['IK-001 · Ayşe Yılmaz', 'IK-002 · Mehmet Demir'], effectiveFrom: ['01.02.2026', '01.04.2026'],
    versionStatus: ['v1 · Onaylandı', 'v1 · Onay bekliyor'], policyReference: ['IK-IST-2026-01', 'IK-IST-2026-02'],
    actions: [en ? 'Approve · Reject' : 'Onayla · Reddet', en ? 'Approve · Reject' : 'Onayla · Reddet']
  }
  const customerValues: Record<string, [string, string]> = {
    code: ['CAR-001', 'CAR-002'], name: ['Örnek Müşteri A.Ş.', 'Örnek Tedarik Ltd.'], groupName: ['Kurumsal', 'Tedarikçiler'],
    type: [en ? 'Customer' : 'Müşteri', en ? 'Supplier' : 'Tedarikçi'], currencyCode: ['TRY', 'USD'], paymentTermDays: ['30', '45'],
    taxNumber: ['—', '—'], status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'], actions: [en ? 'Open · Edit' : 'Aç · Düzenle', en ? 'Open · Edit' : 'Aç · Düzenle']
  }
  const purchaseInvoiceReceiptSelectionValues: Record<string, [string, string]> = {
    receipt: ['MKB-2026-014 · SAT-2026-021', 'MKB-2026-015 · SAT-2026-024'],
    supplier: ['Örnek Tedarik Ltd.', 'Örnek Makine A.Ş.'], receiptDate: ['21.10.2026', '22.10.2026'],
    warehouse: ['Merkez depo', 'Üretim deposu'], lineCount: ['3', '5'],
    purchaseOrderTotal: ['₺24.800,00', '$3,250.00'], actions: [en ? 'Select receipt' : 'Mal kabulü seç', en ? 'Select receipt' : 'Mal kabulü seç']
  }
  const bankStatementValues: Record<string, [string, string]> = {
    code: ['EKST-2026-010', 'EKST-2026-011'], account: ['BNK-01 · İş Bankası', 'BNK-02 · Garanti'],
    period: ['01–15.10.2026', '16–31.10.2026'], openingBalance: ['₺120.000,00', '₺138.450,00'],
    closingBalance: ['₺138.450,00', '₺152.800,00'], matching: ['18 / 20', '24 / 25'],
    status: [en ? 'Partially matched' : 'Kısmen eşleşti', en ? 'Matched' : 'Eşleşti'], actions: [en ? 'Open statement' : 'Ekstreyi aç', en ? 'Open statement' : 'Ekstreyi aç']
  }
  const bankStatementLineValues: Record<string, [string, string]> = {
    lineNumber: ['12', '13'], transactionDate: ['20.10.2026', '21.10.2026'],
    direction: [en ? 'Credit' : 'Alacak', en ? 'Debit' : 'Borç'],
    description: ['Müşteri tahsilatı · ABC A.Ş.', 'Tedarikçi ödemesi · XYZ Ltd.'],
    externalId: ['BNK-TRX-8841', 'BNK-TRX-8842'], reference: ['SATF-2026-014', 'ODE-2026-008'],
    amount: ['₺18.450,00', '₺7.200,00'], matchStatus: [en ? 'Matched' : 'Eşleşti', en ? 'Unmatched' : 'Eşleşmedi'],
    actions: [en ? 'Review match' : 'Eşleşmeyi incele', en ? 'Create transaction' : 'Hareket oluştur']
  }
  const financeMaturityValues: Record<string, [string, string]> = {
    invoice: ['SATF-2026-014', 'ALF-2026-009'], counterparty: ['ABC A.Ş.', 'Örnek Tedarik Ltd.'],
    direction: [en ? 'Receivable' : 'Alacak', en ? 'Payable' : 'Borç'],
    invoiceDate: ['20.10.2026', '18.10.2026'], dueDate: ['19.11.2026', '25.10.2026'],
    outstandingAmount: ['₺18.450,00', '₺7.200,00'], status: [en ? 'Not due' : 'Vadesi gelmedi', en ? 'Overdue · 1 day' : '1 gün gecikmiş']
  }
  const financeCashFlowForecastValues: Record<string, [string, string]> = {
    periodStart: ['01.11.2026', '01.12.2026'], openingBalance: ['₺152.800,00', '₺181.300,00'],
    receivables: ['₺42.000,00', '₺18.500,00'], payables: ['₺21.400,00', '₺35.000,00'],
    instrumentReceivables: ['₺8.000,00', '₺12.000,00'], instrumentPayables: ['₺3.000,00', '₺2.500,00'],
    creditFacilityPayments: ['₺5.100,00', '₺5.100,00'], directCashBudgetInflows: ['₺6.000,00', '₺0,00'],
    directCashBudgetOutflows: ['₺4.000,00', '₺3.500,00'], postedMovements: ['₺6.000,00', '₺0,00'],
    netChange: ['₺28.500,00', '−₺18.500,00'], closingBalance: ['₺181.300,00', '₺162.800,00'],
    overdueTotal: ['₺7.200,00', '₺0,00']
  }
  const stockValues: Record<string, [string, string]> = {
    code: ['SKU-001', 'SKU-002'], name: ['Örnek hammadde', 'Örnek mamul'], category: ['Hammadde', 'Mamül'],
    quantityOnHand: ['120 AD', '48 AD'], reservedQuantity: ['12 AD', '8 AD'], availableQuantity: ['108 AD', '40 AD'],
    minimumStock: ['25 AD', '10 AD'], valuationAmountBase: ['₺18.450,00', '₺32.160,00'], unvaluedQuantity: ['0 AD', '2 AD'],
    status: [en ? 'Sufficient' : 'Yeterli', en ? 'Below minimum' : 'Minimum altı'],
    actions: [en ? 'Custom fields · Edit · Disable · Movements' : 'Özel alanlar · Düzenle · Devre dışı · Hareketler', en ? 'Custom fields · Edit · Disable · Movements' : 'Özel alanlar · Düzenle · Devre dışı · Hareketler']
  }
  const inventoryMovementValues: Record<string, [string, string]> = {
    entryDate: ['20.10.2026', '21.10.2026'], direction: [en ? 'Receipt' : 'Giriş', en ? 'Issue' : 'Çıkış'],
    description: [en ? 'Opening balance · A-01 · LOT-2026-001' : 'Açılış stoğu · A-01 · LOT-2026-001', en ? 'Sales shipment · reversed' : 'Satış çıkışı · ters kayıt'],
    quantity: ['120 KG', '4 AD'], unitCostBase: ['154.50 TRY', en ? 'No cost' : 'Maliyet yok'],
    actions: [en ? 'Create reversal' : 'Ters kayıt', en ? 'Create reversal' : 'Ters kayıt']
  }
  const inventoryTraceValues: Record<string, [string, string]> = {
    trackingCode: ['LOT-2026-001', 'SER-2026-002'],
    trackingMode: [en ? 'Lot' : 'Lot', en ? 'Serial' : 'Seri'],
    stockItem: ['HAM-001 · Paslanmaz sac', 'MAM-004 · Gövde'],
    warehouse: ['MERKEZ · Merkez depo', 'URETIM · Üretim deposu'],
    quantityOnHand: ['120 KG', '1 AD'], expiryDate: ['31.12.2026', '—'],
    lastMovementDate: ['20.10.2026', '21.10.2026']
  }
  const salesOrderValues: Record<string, [string, string]> = {
    code: ['SIP-001', 'SIP-002'], quoteCode: ['TEK-001', 'TEK-002'], customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'],
    orderDate: ['21.10.2026', '22.10.2026'], lineCount: ['3', '5'], grandTotal: ['₺12.450,00', '₺28.900,00'],
    status: [en ? 'Open' : 'Açık', en ? 'Fulfilled' : 'Tamamlandı'], actions: [en ? 'Details' : 'Detay', en ? 'Details' : 'Detay']
  }
  const salesOrderLineValues: Record<string, [string, string]> = {
    stockCode: ['HAM-001', 'STK-004'], stockName: ['Paslanmaz sac', 'Bağlantı elemanı'],
    quantity: ['120 KG', '500 AD'], deliveredQuantity: ['40 KG', '250 AD'], remainingQuantity: ['80 KG', '250 AD'],
    reservedQuantity: ['20 KG · Merkez depo', '0 AD'], unitPrice: ['₺245,00', '₺3,20'], lineTotal: ['₺29.400,00', '₺1.600,00']
  }
  const salesDistributionValues: Record<string, [string, string]> = {
    stock: ['HAM-001 · Paslanmaz sac', 'MAM-004 · Pompa gövdesi'], openDemand: ['240 KG', '18 AD'],
    onHand: ['180 KG', '12 AD'], activeReserved: ['40 KG', '4 AD'], available: ['140 KG', '8 AD'],
    uncovered: ['100 KG', '10 AD'], openOrderCount: ['3', '2']
  }
  const salesQuoteValues: Record<string, [string, string]> = {
    code: ['TEK-2026-001', 'TEK-2026-002'], customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'],
    quoteDate: ['21.10.2026', '22.10.2026'], validUntil: ['04.11.2026', '05.11.2026'], lineCount: ['3', '5'],
    grandTotal: ['₺125.450,00', '$28,900.00'], status: [en ? 'Sent' : 'İletildi', en ? 'Accepted' : 'Kabul edildi'],
    actions: [en ? 'Details · Accept · Reject' : 'Detay · Kabul et · Reddet', en ? 'Details · Create order' : 'Detay · Sipariş oluştur']
  }
  const salesPromotionValues: Record<string, [string, string]> = {
    code: ['KMP-001', 'KMP-002'], name: ['Yaz indirimi', 'Kurumsal kampanya'], discountPercent: ['%10', '%7,5'],
    effectiveFrom: ['01.06.2026', '01.10.2026'], effectiveThrough: ['30.06.2026', '31.10.2026'],
    status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'], applicationCount: ['12', '4']
  }
  const salesCampaignPerformanceValues: Record<string, [string, string]> = {
    campaign: ['KMP-001 · Yaz indirimi', 'KMP-002 · Kurumsal kampanya'], applications: ['12', '4'], appliedQuotes: ['10', '4'],
    discountTotals: ['TRY 18.450,00', 'TRY 7.200,00'], linkedOrders: ['6', '3'], linkedOrderTotals: ['TRY 245.000,00', 'TRY 96.500,00']
  }
  const salesDeliveryValues: Record<string, [string, string]> = {
    code: ['IRS-2026-001', 'IRS-2026-002'], orderCode: ['SIP-2026-004', 'SIP-2026-006'],
    deliveryDate: ['21.10.2026', '22.10.2026'], warehouseName: ['Merkez depo', 'Üretim deposu'],
    lineCount: ['3', '5'], status: [en ? 'Posted' : 'Sevk edildi', en ? 'Voided' : 'İptal'],
    invoiceStatus: [en ? 'Invoiced' : 'Faturalandı', en ? 'Not invoiced' : 'Faturalanmadı'],
    actions: [en ? 'Lines · Void' : 'Satırları gör · İptal et', en ? 'Lines' : 'Satırları gör']
  }
  const purchaseInvoiceValues: Record<string, [string, string]> = {
    code: ['ALF-001', 'ALF-002'], supplierName: ['Örnek Tedarik Ltd.', 'Örnek Sanayi A.Ş.'], receiptCode: ['KBL-001', 'KBL-002'],
    purchaseOrderCode: ['SAT-001', 'SAT-002'], invoiceDate: ['20.10.2026', '21.10.2026'], dueDate: ['19.11.2026', '20.11.2026'],
    currencyCode: ['TRY', 'USD'], grandTotal: ['₺24.800,00', '$3,250.00'], paidAmount: ['₺10.000,00', '$0.00'],
    outstandingAmount: ['₺14.800,00', '$3,250.00'], lineCount: ['4', '2'], status: [en ? 'Posted' : 'İşlendi', en ? 'Posted' : 'İşlendi'],
    actions: [en ? 'Details' : 'Detay', en ? 'Details' : 'Detay']
  }
  const standaloneInvoiceDraftValues: Record<string, [string, string]> = {
    invoiceNumber: ['ALF-T-001', 'ALF-T-002'], supplierName: ['Örnek Tedarik Ltd.', 'Örnek Hizmet A.Ş.'],
    invoiceDate: ['20.10.2026', '22.10.2026'], dueDate: ['19.11.2026', '21.11.2026'], currencyCode: ['TRY', 'USD'],
    grandTotal: ['₺24.800,00', '$1,250.00'], lineCount: ['4', '2'], createdAt: ['24.10.2026 09:30', '24.10.2026 10:15'],
    status: [en ? 'Draft · unposted' : 'Taslak · muhasebeleştirilmedi', en ? 'Draft · unposted' : 'Taslak · muhasebeleştirilmedi'],
    actions: [en ? 'Edit draft' : 'Taslağı düzenle', en ? 'Edit draft' : 'Taslağı düzenle']
  }
  const fixedAssetValues: Record<string, [string, string]> = {
    assetCode: ['KIY-001', 'KIY-002'], name: ['Üretim makinesi', 'Ofis ekipmanı'], category: ['Makine', 'Demirbaş'],
    acquisitionDate: ['14.03.2025', '02.06.2025'], inServiceDate: ['01.04.2025', '02.06.2025'], acquisitionCostBase: ['₺480.000,00', '₺36.500,00'],
    residualValueBase: ['₺20.000,00', '₺1.500,00'], usefulLifeMonths: ['120', '60'], accumulatedDepreciationBase: ['₺24.000,00', '₺3.500,00'],
    remainingBookValueBase: ['₺456.000,00', '₺33.000,00'], status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'], actions: [en ? 'Details' : 'Detay', en ? 'Details' : 'Detay']
  }
  const fixedAssetDepreciationValues: Record<string, [string, string]> = { periodStart: ['01.01.2026', '01.02.2026'], amountBase: ['₺4.000,00', '₺4.000,00'], isPosted: [en ? 'Posted' : 'Kaydedildi', en ? 'Planned' : 'Planlandı'], journalEntryId: ['YEV-2026-0142', '—'] }
  const fixedAssetAssignmentValues: Record<string, [string, string]> = { employee: ['Ayşe Yılmaz', 'Mehmet Demir'], assignedDate: ['14.03.2025', '02.06.2025'], returnedDate: ['—', '30.09.2026'], location: ['Üretim hattı 2', 'Merkez ofis'], actions: [en ? 'Return' : 'İade al', '—'] }
  const purchaseOrderValues: Record<string, [string, string]> = {
    code: ['SAT-2026-001', 'SAT-2026-002'], supplierName: ['Örnek Tedarik Ltd.', 'Örnek Makine A.Ş.'],
    orderDate: ['20.10.2026', '21.10.2026'], expectedReceiptDate: ['05.11.2026', '—'], targetWarehouseCode: ['MERKEZ', '—'],
    lineCount: ['4', '2'], grandTotal: ['₺24.800,00', '$3,250.00'], currencyCode: ['TRY', 'USD'],
    status: [en ? 'Open' : 'Açık', en ? 'Partially received' : 'Kısmi mal kabul'], actions: [en ? 'Details · Receive' : 'Detay · Mal kabul', en ? 'Details · Receive' : 'Detay · Mal kabul']
  }
  const purchaseReceiptValues: Record<string, [string, string]> = {
    code: ['MKB-2026-001', 'MKB-2026-002'], purchaseOrderCode: ['SAT-2026-001', 'SAT-2026-002'],
    receiptDate: ['21.10.2026', '22.10.2026'], warehouseName: ['Merkez depo', 'Üretim deposu'],
    lineCount: ['3', '2'], status: [en ? 'Received' : 'Kabul edildi', en ? 'Received' : 'Kabul edildi'],
    actions: [en ? 'Open order and lines' : 'Sipariş ve satırlar', en ? 'Open order and lines' : 'Sipariş ve satırlar']
  }
  const purchaseDeliveryNoteValues: Record<string, [string, string]> = {
    documentNumber: ['TED-IRS-2026-018', 'TED-IRS-2026-019'], documentDate: ['21.10.2026', '22.10.2026'],
    purchaseOrderCode: ['PO-2026-001', 'PO-2026-002'], supplierName: ['Sample Supply Ltd.', 'Example Machinery Inc.'],
    lineCount: ['3', '2'], purchaseReceiptCode: ['KBL-2026-014', en ? 'Not matched' : 'Bağlantı bekliyor'],
    actions: [en ? 'Details · Open order' : 'Detay · Siparişi aç', en ? 'Details · Open order' : 'Detay · Siparişi aç']
  }
  const purchaseDeliveryOrderLineValues: Record<string, [string, string]> = { lineNumber: ['10','20'], product: ['Synthetic steel sheet · SHEET-01','Synthetic fastener · BOLT-02'], orderedQuantity: ['120 PC','500 PC'], deliveryQuantity: ['96 PC','500 PC'] }
  const purchaseOrderDeliveryNoteLineValues: Record<string, [string, string]> = { documentNumber: ['SUP-DN-2026-018','SUP-DN-2026-019'], documentDate: ['21 Oct 2026','22 Oct 2026'], lineCount: ['2','1'], purchaseReceiptCode: ['GR-2026-014','Awaiting receipt'], actions: ['Link receipt','Link receipt'] }
  const purchaseDeliveryNoteLineValues: Record<string, [string, string]> = { orderLineNumber: ['10','20'], quantity: ['96 PC','500 PC'] }
  const exchangeRateValues: Record<string, [string, string]> = {
    rateDate: ['22.10.2026', '22.10.2026'], currencyCode: ['USD', 'EUR'], rate: ['42.85', '49.62'], revision: ['1', '1'], source: ['TCMB', 'TCMB']
  }
  const warehouseLocationValues: Record<string, [string, string]> = {
    stockItemCode: ['SKU-001', 'SKU-002'], stockItemName: ['Örnek hammadde', 'Örnek mamul'], quantity: ['48 AD', '12 AD'], unitCode: ['AD', 'AD']
  }
  const warehouseBinValues: Record<string, [string, string]> = {
    code: ['A-01', 'B-02'], name: ['Hammadde rafı', 'Montaj bölmesi'], parentLocation: ['A koridoru', 'Üst düzey'],
    status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'], actions: [en ? 'Select · Edit' : 'Seç · Düzenle', en ? 'Select · Edit' : 'Seç · Düzenle']
  }
  const warehouseReconciliationValues: Record<string, [string, string]> = {
    stockItemCode: ['SKU-001', 'SKU-002'], stockItemName: ['Örnek hammadde', 'Örnek mamul'], warehouseQuantity: ['50 AD', '12 AD'],
    locatedQuantity: ['48 AD', '12 AD'], unlocatedQuantity: ['2 AD', '0 AD'], unitCode: ['AD', 'AD']
  }
  const crmOpportunityValues: Record<string, [string, string]> = {
    code: ['FRS-001', 'FRS-002'], name: ['ERP yenileme projesi', 'Üretim hattı yatırımı'], customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'],
    stage: [en ? 'Qualified' : 'Nitelikli', en ? 'Proposal' : 'Teklif'], estimatedValue: ['₺850,000.00', '$125,000.00'],
    probabilityPercent: ['%60', '%40'], expectedCloseDate: ['15.11.2026', '30.11.2026'], nextActivityAt: ['25.10.2026 10:00', '26.10.2026 14:30'],
    actions: [en ? 'Advance · Lose' : 'İlerlet · Kaybet', en ? 'Advance · Lose' : 'İlerlet · Kaybet']
  }
  const paymentInstrumentValues: Record<string, [string, string]> = {
    instrumentNumber: ['ÇK-2026-018', 'SN-2026-009'], code: ['CEK-2026-001', 'SNT-2026-001'],
    type: [en ? 'Check' : 'Çek', en ? 'Promissory note' : 'Senet'], direction: [en ? 'Received' : 'Alınan', en ? 'Issued' : 'Verilen'],
    counterpartyName: ['Örnek Müşteri A.Ş.', 'Örnek Tedarik Ltd.'], bankName: ['Örnek Banka', '—'],
    dueDate: ['15.11.2026', '30.11.2026'], amount: ['₺85.000,00', '₺42.500,00'], currencyCode: ['TRY', 'TRY'],
    status: [en ? 'In portfolio' : 'Portföyde', en ? 'Endorsed' : 'Ciro edildi'],
    actions: [en ? 'Collect · Endorse · Bounce · Cancel' : 'Tahsil · Ciro · Karşılıksız · İptal', en ? 'Collect · Endorse · Bounce · Cancel' : 'Tahsil · Ciro · Karşılıksız · İptal']
  }
  const commercialContractValues: Record<string, [string, string]> = {
    code: ['SOZ-2026-001', 'SOZ-2026-002'], type: [en ? 'Sales' : 'Satış', en ? 'Purchase' : 'Satın alma'],
    counterpartyName: ['Örnek Müşteri A.Ş.', 'Örnek Tedarik Ltd.'], effectiveFrom: ['01.01.2026', '01.03.2026'],
    effectiveThrough: ['31.12.2026', '28.02.2027'], currencyCode: ['TRY', 'EUR'],
    status: [en ? 'Active' : 'Aktif', en ? 'Draft' : 'Taslak'], revision: ['v2', 'v1'],
    actions: [en ? 'Open details' : 'Detayı aç', en ? 'Open details' : 'Detayı aç']
  }
  const operationalProjectTaskValues: Record<string, [string, string]> = {
    code: ['TASK-001', 'TASK-002'], name: ['Review requirements', 'Prepare rollout'],
    status: [en ? 'In progress' : 'Devam ediyor', en ? 'Open' : 'Açık'], plannedHours: ['12 h', '8 h'],
    startDate: ['21.10.2026', '24.10.2026'], endDate: ['28.10.2026', '31.10.2026'],
    actions: [en ? 'Change status' : 'Durumu değiştir', en ? 'Change status' : 'Durumu değiştir']
  }
  const operationalProjectTimeValues: Record<string, [string, string]> = {
    workDate: ['21.10.2026', '22.10.2026'], taskName: ['Review requirements', 'Project level'],
    hours: ['2.5 h', '1 h'], description: ['Stakeholder review', 'Weekly coordination']
  }
  const operationalProjectValues: Record<string, [string, string]> = {
    code: ['PRJ-001', 'PRJ-002'], name: ['ERP geçişi', 'Üretim kapasitesi artışı'],
    status: [en ? 'Active' : 'Devam ediyor', en ? 'On hold' : 'Beklemede'], startDate: ['01.09.2026', '15.09.2026'],
    endDate: ['31.12.2026', '31.03.2027'], budgetAmount: ['₺850.000,00', '€120.000,00'], currencyCode: ['TRY', 'EUR'],
    taskCount: ['12', '8'], completedTaskCount: ['7', '2'], overdueTaskCount: ['1', '0'],
    actualHours: ['186,5', '74'], nextTaskDate: ['27.10.2026', '29.10.2026'], actions: [en ? 'Open project' : 'Projeyi aç', en ? 'Open project' : 'Projeyi aç']
  }
  const financeBudgetScenarioValues: Record<string, [string, string]> = {
    periodStart: ['2026 January', '2026 February'], account: ['600 · Domestic sales', '760 · Marketing expenses'],
    section: [en ? 'Revenue' : 'Gelir', en ? 'Expense' : 'Gider'], plannedAmount: ['₺125.000,00', '₺18.500,00'],
    actualAmount: ['₺118.400,00', '₺21.200,00'], variance: ['₺6.600,00', '−₺2.700,00'], notes: ['Monthly target', 'Campaign costs']
  }
  const directCashBudgetValues: Record<string, [string, string]> = {
    name: ['2026 işletme bütçesi', '2026 yatırım bütçesi'], fiscalYear: ['2026', '2026'], currencyCode: ['TRY', 'EUR'],
    status: [en ? 'Draft' : 'Taslak', en ? 'Approved' : 'Onaylı'], lineCount: ['12', '8'], revision: ['2', '1'],
    actions: [en ? 'Open' : 'Aç', en ? 'Open' : 'Aç']
  }
  const transferSourceValues: Record<string, [string, string]> = {
    source: [en ? 'Sales invoice · INV-2026-014' : 'Satış faturası · SATF-2026-014', en ? 'Supplier payment · PAY-2026-008' : 'Tedarikçi ödemesi · ODE-2026-008'],
    entryDate: ['20.10.2026', '21.10.2026'], description: ['October invoice', 'Mapped bank payment'],
    amount: ['₺125.450,00', '€8.200,00'], actions: [en ? 'Review and transfer' : 'İncele ve aktar', en ? 'Missing mapping' : 'Eşleştirme eksik']
  }
  const journalValues: Record<string, [string, string]> = {
    code: ['YEV-2026-001', 'YEV-2026-002'], entryDate: ['20.10.2026', '21.10.2026'],
    sourceType: [en ? 'Manual journal' : 'Manuel fiş', en ? 'Sales invoice' : 'Satış faturası'],
    description: ['Açılış düzeltmesi', 'Ekim satış kaydı'], totalDebit: ['₺12.500,00', '₺8.400,00'], totalCredit: ['₺12.500,00', '₺8.400,00']
  }
  const financialAccountValues: Record<string, [string, string]> = {
    code: ['KASA-01', 'BNK-01'], name: ['Merkez kasa', 'İş Bankası · Merkez şube'],
    type: [en ? 'Cash' : 'Kasa', en ? 'Bank' : 'Banka'], currencyCode: ['TRY', 'EUR'],
    balance: ['₺24.850,00', '€12.400,00'], transactionCount: ['18', '42'],
    status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'],
    actions: [en ? 'Movements · Disable' : 'Hareketler · Pasifleştir', en ? 'Movements · Disable' : 'Hareketler · Pasifleştir']
  }
  const accountTransactionValues: Record<string, [string, string]> = {
    transactionDate: ['21.10.2026 09:15', '22.10.2026 14:40'],
    source: [en ? 'Manual movement' : 'Manuel hareket', en ? 'Transfer' : 'Transfer'],
    description: [en ? 'Opening cash receipt' : 'Açılış tahsilatı', en ? 'Supplier payment' : 'Tedarikçi ödemesi'],
    cashFlowCategory: [en ? 'Operating inflow' : 'Faaliyet girişi', en ? 'Operating outflow' : 'Faaliyet çıkışı'],
    reference: ['REF-2026-001', 'REF-2026-002'], inflow: ['₺15.000,00', '₺0,00'], outflow: ['₺0,00', '₺4.250,00'],
    actions: [en ? 'Reverse · Edit category' : 'Ters kayıt · Kategori düzenle', en ? 'Reverse · Edit category' : 'Ters kayıt · Kategori düzenle']
  }
  const fxExposureValues: Record<string, [string, string]> = {
    invoice: ['SATF-2026-014', 'ALF-2026-008'], counterparty: ['Örnek Müşteri A.Ş.', 'Örnek Tedarikçi Ltd.'],
    direction: [en ? 'Receivable' : 'Alacak', en ? 'Payable' : 'Borç'], invoiceDate: ['15.10.2026', '18.10.2026'],
    currencyCode: ['USD', 'EUR'], outstandingAmount: ['$12,500.00', '€8,200.00'],
    invoiceDateRate: ['34.20', '39.10'], currentRate: ['34.45', '39.35'], estimatedChangeBase: ['₺3,125.00', '₺2,050.00']
  }
  const fxRevaluationVoucherValues: Record<string, [string, string]> = {
    code: ['DGR-2026-010', 'DGR-2026-011'], asOfDate: ['31.10.2026', '30.11.2026'],
    lineCount: ['4', '2'], totalDebit: ['₺3.125,00', '₺1.400,00'], totalCredit: ['₺3.125,00', '₺1.400,00'],
    actions: [en ? 'Open voucher' : 'Fişi aç', en ? 'Open voucher' : 'Fişi aç']
  }
  const fxRevaluationLineValues: Record<string, [string, string]> = {
    invoice: ['SATF-2026-014 · Örnek Müşteri A.Ş.', 'ALF-2026-008 · Örnek Tedarikçi Ltd.'],
    direction: [en ? 'Receivable · USD' : 'Alacak · USD', en ? 'Payable · EUR' : 'Borç · EUR'],
    outstandingAmount: ['$12,500.00', '€8,200.00'], invoiceDateRate: ['34.20', '39.10'], closingRate: ['34.45', '39.35'],
    adjustmentBase: ['₺3.125,00', '₺2.050,00'], debitBaseAmount: ['₺3.125,00', '₺0,00'], debitAccount: ['120.01', '656.01'],
    creditBaseAmount: ['₺0,00', '₺2.050,00'], creditAccount: ['646.01', '320.01']
  }
  const unmatchedBookValues: Record<string, [string, string]> = {
    date: ['21.10.2026', '22.10.2026'], source: [en ? 'Bank transfer' : 'Banka transferi', en ? 'Customer receipt' : 'Müşteri tahsilatı'],
    description: [en ? 'Unmatched bank fee' : 'Eşleşmemiş banka masrafı', en ? 'Unmatched collection' : 'Eşleşmemiş tahsilat'],
    amount: ['−₺25,00', '+₺2.500,00']
  }
  const incomeStatementValues: Record<string, [string, string]> = {
    account: ['600 · Yurtiçi satışlar', '760 · Pazarlama giderleri'],
    section: [en ? 'Revenue' : 'Gelir', en ? 'Expense' : 'Gider'],
    debit: ['₺0,00', '₺2.400,00'], credit: ['₺18.500,00', '₺0,00'], balance: ['₺18.500,00', '₺2.400,00']
  }
  const balanceSheetValues: Record<string, [string, string]> = {
    account: ['100 · Kasa', '300 · Banka kredileri'], section: [en ? 'Assets' : 'Varlıklar', en ? 'Liabilities' : 'Yükümlülükler'],
    debit: ['₺16.700,00', '₺0,00'], credit: ['₺0,00', '₺4.500,00'], balance: ['₺16.700,00', '−₺4.500,00']
  }
  const ledgerAccountValues: Record<string, [string, string]> = {
    code: ['100', '300'], name: [en ? 'Cash accounts' : 'Kasa hesapları', en ? 'Bank loans' : 'Banka kredileri'],
    statementSection: [en ? 'Assets' : 'Varlıklar', en ? 'Liabilities' : 'Yükümlülükler'],
    status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'],
    actions: [en ? 'Edit · Deactivate' : 'Düzenle · Pasifleştir', en ? 'Edit · Deactivate' : 'Düzenle · Pasifleştir']
  }
  const trialBalanceValues: Record<string, [string, string]> = {
    account: ['100 · Kasa', '600 · Yurtiçi satışlar'], openingDebit: ['₺12.500,00', '₺0,00'], openingCredit: ['₺0,00', '₺0,00'],
    debit: ['₺4.200,00', '₺0,00'], credit: ['₺0,00', '₺18.500,00'], balanceDebit: ['₺16.700,00', '₺0,00'], balanceCredit: ['₺0,00', '₺18.500,00']
  }
  const maturityAgingValues: Record<string, [string, string]> = {
    direction: [en ? 'Receivable' : 'Alacak', en ? 'Payable' : 'Borç'], currencyCode: ['TRY', 'USD'],
    invoiceCount: ['12', '4'], outstandingAmount: ['₺125.450,00', '$8.200,00'], notDue: ['₺72.500,00', '$2.100,00'],
    days1To30: ['₺30.000,00', '$2.000,00'], days31To60: ['₺15.000,00', '$1.500,00'],
    days61To90: ['₺5.000,00', '$1.000,00'], over90Days: ['₺2.950,00', '$1.600,00']
  }
  const cashFlowReportValues: Record<string, [string, string]> = {
    currencyCode: ['TRY', 'EUR'], openingBalance: ['₺120.000,00', '€8.500,00'],
    operating: ['₺18.500,00', '€1.200,00'], investing: ['₺0,00', '€0,00'],
    financing: ['₺5.000,00', '€0,00'], internalTransfers: ['₺2.000,00', '€500,00'],
    unclassified: ['₺0,00', '€0,00'], openingAdjustments: ['₺0,00', '€0,00'],
    netChange: ['₺21.500,00', '€700,00'], closingBalance: ['₺141.500,00', '€9.200,00'],
    reconciles: [en ? 'Reconciled' : 'Mutabık', en ? 'Reconciled' : 'Mutabık']
  }
  const manufacturingOrderValues: Record<string, [string, string]> = {
    code: ['URE-2026-001', 'URE-2026-002'], billOfMaterialName: ['Montaj reçetesi · 2 operasyon', 'Kasa gövdesi · 1 operasyon'],
    warehouseName: ['Merkez üretim deposu', 'Montaj deposu'], plannedQuantity: ['24', '8'], components: ['SAC-001: 48 · CIV-002: 96', 'GOV-010: 8 · BOYA-001: 2'],
    status: [en ? 'Planned' : 'Planlandı', en ? 'Released' : 'Serbest bırakıldı'], actions: [en ? 'Schedule · Release · Cancel' : 'Çizelgele · Serbest bırak · İptal', en ? 'Complete · Cancel' : 'Tamamla · İptal']
  }
  const manufacturingMrpLineValues: Record<string, [string, string]> = {
    stockItem: ['SKU-RAW-01 · Paslanmaz sac', 'SKU-FIN-02 · Kapak montajı'], level: ['0', '1'],
    grossRequirement: ['120 KG', '60 AD'], onHandAndReserved: ['45 / 12 KG', '8 / 4 AD'],
    openPurchaseOrders: ['30 KG', '0 AD'], openManufacturingOrders: ['0 KG', '10 AD'],
    netRequirement: ['57 KG', '38 AD'], requiredByDate: ['28.10.2026', '28.10.2026'],
    recommendedOrderDate: ['24.10.2026', '26.10.2026'], recommendation: [en ? 'Purchase' : 'Satın al', en ? 'Produce' : 'Üret']
  }
  const salesInvoiceValues: Record<string, [string, string]> = {
    code: ['SATF-2026-001', 'SATF-2026-002'], deliveryCode: ['IRS-2026-003', 'IRS-2026-004'], orderCode: ['SIP-2026-001', 'SIP-2026-002'],
    customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'], invoiceDate: ['21.10.2026', '22.10.2026'], lineCount: ['3', '5'],
    grandTotal: ['₺125,450.00', '$28,900.00'], status: [en ? 'Posted' : 'Kesildi', en ? 'Voided' : 'İptal'], actions: [en ? 'Details' : 'Detay', en ? 'Details' : 'Detay']
  }
  const salesInvoiceDetailValues: Record<string, [string, string]> = {
    customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'], invoiceDate: ['21.10.2026', '22.10.2026'],
    orderCode: ['SIP-2026-001', 'SIP-2026-002'], deliveryCode: ['IRS-2026-003', 'IRS-2026-004'], currencyCode: ['TRY', 'USD'],
    subtotal: ['₺120.000,00', '$27.500,00'], discountTotal: ['₺2.000,00', '$500,00'], taxTotal: ['₺24.000,00', '$5.400,00'],
    grandTotal: ['₺142.000,00', '$32.400,00'], paidAmount: ['₺20.000,00', '$10.000,00'], returnedAmount: ['₺0,00', '$1.200,00'],
    outstandingAmount: ['₺122.000,00', '$21.200,00'], status: [en ? 'Posted' : 'Kesildi', en ? 'Posted' : 'Kesildi'],
    ledgerEntry: [en ? 'Customer receivable posted' : 'Müşteri cari borcu işlendi', en ? 'Customer receivable posted' : 'Müşteri cari borcu işlendi']
  }
  const customerSalesInvoiceValues: Record<string, [string, string]> = {
    code: ['INV-2026-014', 'INV-2026-015'], deliveryCode: ['DN-2026-003', 'DN-2026-004'],
    orderCode: ['SO-2026-021', 'SO-2026-022'], invoiceDate: ['Oct 21, 2026', 'Oct 22, 2026'],
    lineCount: ['3', '5'], grandTotal: ['$1,245.00', '$890.50'],
    status: ['Issued', 'Issued'], actions: ['Open invoice', 'Open invoice']
  }
  const creditScheduleValues: Record<string, [string, string]> = {
    dueDate: ['20.11.2026', '20.12.2026'], principalAmount: ['₺25.000,00', '₺25.000,00'], interestAmount: ['₺2.100,00', '₺1.850,00'],
    feeAmount: ['₺250,00', '₺250,00'], total: ['₺27.350,00', '₺27.100,00'], status: [en ? 'Planned' : 'Planlandı', en ? 'Planned' : 'Planlandı'],
    actions: [en ? 'Pay · Cancel' : 'Öde · İptal', en ? 'Pay · Cancel' : 'Öde · İptal']
  }
  const creditMovementValues: Record<string, [string, string]> = {
    transactionDate: ['21.10.2026', '22.10.2026'], type: [en ? 'Drawdown' : 'Kullandırım', en ? 'Repayment' : 'Geri ödeme'],
    accountCode: ['BNK-01', 'BNK-01'], principalAmount: ['₺100.000,00', '₺25.000,00'], interestAmount: ['₺0,00', '₺2.100,00'],
    feeAmount: ['₺0,00', '₺250,00'], actions: [en ? 'Reverse' : 'Ters kayıt', en ? 'Reverse' : 'Ters kayıt']
  }
  const ledgerMappingValues: Record<string, [string, string]> = {
    sourceAccount: [en ? 'Sales invoice revenue' : 'Satış faturası geliri', en ? 'Supplier payment clearing' : 'Tedarikçi ödeme hesabı'],
    tenantAccount: ['600 · Yurtiçi satışlar', '320 · Satıcılar'],
    status: [en ? 'Mapped' : 'Eşleştirildi', en ? 'Mapped' : 'Eşleştirildi']
  }
  const values = screenKey === 'purchase-invoice-receipt-selection' ? purchaseInvoiceReceiptSelectionValues : screenKey === 'finance-statements' ? bankStatementValues : screenKey === 'finance-statement-lines' ? bankStatementLineValues : screenKey === 'finance-maturities' ? financeMaturityValues : screenKey === 'finance-cash-flow-forecast' ? financeCashFlowForecastValues : screenKey === 'manufacturing-mrp-lines' ? manufacturingMrpLineValues : screenKey === 'sales-order-lines' ? salesOrderLineValues : screenKey === 'sales-invoice-details' ? salesInvoiceDetailValues : screenKey === 'customer-sales-invoices' ? customerSalesInvoiceValues : screenKey === 'hr-employees' ? employeeValues : screenKey === 'hr-leave-requests' ? leaveRequestValues : screenKey === 'hr-attendance' ? attendanceValues : screenKey === 'hr-workplace-assignments' ? workplaceAssignmentValues : screenKey === 'hr-workplace-calendars' ? workplaceCalendarValues : screenKey === 'hr-employee-calendar-overrides' ? employeeCalendarOverrideValues : screenKey === 'inventory-stock-movements' ? inventoryMovementValues : screenKey === 'inventory-trace-balances' ? inventoryTraceValues : screenKey === 'inventory-warehouse-locations' ? warehouseBinValues : screenKey === 'inventory-warehouse-reconciliation' ? warehouseReconciliationValues : screenKey === 'inventory-stock' ? stockValues : screenKey === 'sales-distribution-plan' ? salesDistributionValues : screenKey === 'sales-orders' ? salesOrderValues : screenKey === 'sales-quotes' ? salesQuoteValues : screenKey === 'sales-promotions' ? salesPromotionValues : screenKey === 'sales-campaign-performance' ? salesCampaignPerformanceValues : screenKey === 'sales-deliveries' ? salesDeliveryValues : screenKey === 'sales-invoices' ? salesInvoiceValues : screenKey === 'purchase-invoices' ? purchaseInvoiceValues : screenKey === 'standalone-invoice-drafts' ? standaloneInvoiceDraftValues : screenKey === 'purchase-orders' ? purchaseOrderValues : screenKey === 'purchase-receipts' ? purchaseReceiptValues : screenKey === 'purchase-delivery-notes' ? purchaseDeliveryNoteValues : screenKey === 'purchase-delivery-order-lines' ? purchaseDeliveryOrderLineValues : screenKey === 'purchase-order-delivery-notes' ? purchaseOrderDeliveryNoteLineValues : screenKey === 'purchase-delivery-note-lines' ? purchaseDeliveryNoteLineValues : screenKey === 'manufacturing-orders' ? manufacturingOrderValues : screenKey === 'exchange-rates' ? exchangeRateValues : screenKey === 'warehouse-location-balances' ? warehouseLocationValues : screenKey === 'fixed-assets' ? fixedAssetValues : screenKey === 'fixed-asset-depreciation' ? fixedAssetDepreciationValues : screenKey === 'fixed-asset-assignments' ? fixedAssetAssignmentValues : screenKey === 'crm-opportunities' ? crmOpportunityValues : screenKey === 'payment-instruments' ? paymentInstrumentValues : screenKey === 'commercial-contracts' ? commercialContractValues : screenKey === 'operational-project-tasks' ? operationalProjectTaskValues : screenKey === 'operational-project-time-entries' ? operationalProjectTimeValues : screenKey === 'operational-projects' ? operationalProjectValues : screenKey === 'direct-cash-budgets' ? directCashBudgetValues : screenKey === 'finance-budget-scenarios' ? financeBudgetScenarioValues : screenKey === 'finance-accounts' ? financialAccountValues : screenKey === 'finance-account-transactions' ? accountTransactionValues : screenKey === 'finance-journals' ? journalValues : screenKey === 'finance-ledger-accounts' ? ledgerAccountValues : screenKey === 'finance-ledger-mappings' ? ledgerMappingValues : screenKey === 'finance-credit-schedules' ? creditScheduleValues : screenKey === 'finance-credit-movements' ? creditMovementValues : screenKey === 'finance-transfer-sources' ? transferSourceValues : screenKey === 'finance-statement-unmatched-book' ? unmatchedBookValues : screenKey === 'finance-maturity-aging' ? maturityAgingValues : screenKey === 'finance-fx-exposure' ? fxExposureValues : screenKey === 'finance-cash-flow-report' ? cashFlowReportValues : screenKey === 'finance-income-statement' ? incomeStatementValues : screenKey === 'finance-fx-revaluations' ? fxRevaluationVoucherValues : screenKey === 'finance-fx-revaluation-lines' ? fxRevaluationLineValues : screenKey === 'finance-balance-sheet' ? balanceSheetValues : screenKey === 'finance-trial-balance' ? trialBalanceValues : customerValues
  return values[key]?.[index] ?? '—'
}
