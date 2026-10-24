import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowDown, ArrowUp, Check, Clock3, Eye, EyeOff, GripVertical, LayoutTemplate, Plus, RotateCcw, Save, Send, ShieldCheck } from 'lucide-react'
import './built-in-screen-views.css'

type Field = { key: string; label: string; defaultVisible: boolean; fixed?: boolean }
type LayoutField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null }
type Catalog = { key: string; label: string; fields: Field[] }
type View = { id: string | null; screenKey: string; screenLabel: string; name: string; isPublished: boolean; revision: number; fields: LayoutField[] }
type Revision = { id: string; revision: number; name: string; fields: LayoutField[]; changeKind: string; changedByUserId: string; createdAt: string }
type EditorState = { catalog: Catalog; active: View; draft: View | null }

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
  const admin = role === 'TenantAdmin'
  const selectedCatalog = catalogs.find(catalog => catalog.key === screenKey)
  const screenLabel = en && screenKey === 'hr-employees' ? 'Employees' : en && screenKey === 'customers' ? 'Customer list' : en && screenKey === 'inventory-stock' ? 'Stock cards' : en && screenKey === 'sales-orders' ? 'Sales orders' : en && screenKey === 'sales-deliveries' ? 'Sales deliveries' : en && screenKey === 'sales-invoices' ? 'Sales invoices' : en && screenKey === 'purchase-invoices' ? 'Purchase invoices' : en && screenKey === 'standalone-invoice-drafts' ? 'Standalone purchase invoice drafts' : en && screenKey === 'purchase-orders' ? 'Purchase orders' : en && screenKey === 'purchase-delivery-notes' ? 'Supplier delivery notes' : en && screenKey === 'manufacturing-orders' ? 'Manufacturing orders' : en && screenKey === 'fixed-assets' ? 'Fixed assets' : en && screenKey === 'crm-opportunities' ? 'CRM opportunities' : en && screenKey === 'payment-instruments' ? 'Payment instruments' : en && screenKey === 'commercial-contracts' ? 'Commercial contracts' : en && screenKey === 'operational-projects' ? 'Projects' : selectedCatalog?.label || (en ? 'ERP screen' : 'ERP ekranı')

  const load = useCallback(async (key = screenKey) => {
    setBusy(true); setError('')
    try {
      const [catalog, editor] = await Promise.all([
        api<Catalog[]>(token, '/api/screen-views/catalog'),
        api<EditorState>(token, `/api/screen-views/${encodeURIComponent(key)}/draft`)
      ])
      setCatalogs(catalog); setState(editor)
      const current = editor.draft || editor.active
      setFields(current.fields.map((field, position) => ({ ...field, position })))
      setName(editor.draft?.name || editor.active.name)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [screenKey, token])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!admin) return
    void api<Revision[]>(token, `/api/screen-views/${encodeURIComponent(screenKey)}/history`).then(setHistory).catch(() => setHistory([]))
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
    <header className="screen-view-hero"><span className="screen-view-hero-icon"><LayoutTemplate size={22}/></span><div><p className="eyebrow">{en ? 'DEVELOPMENT STUDIO · BUILT-IN SCREENS' : 'GELİŞTİRME STUDIO · YERLEŞİK EKRANLAR'}</p><h1>{en ? 'Screen layouts' : 'Ekran düzenleri'}</h1><p>{en ? 'Customize allowlisted fields on native ERP lists. Changes are isolated to this company and published as a reviewed version.' : 'Yerleşik ERP listelerindeki izinli alanları firmaya özel düzenleyin. Değişiklikler taslakta incelenir ve sürüm olarak yayımlanır.'}</p></div><span className="screen-view-scope"><ShieldCheck size={15}/>{en ? 'Company scoped' : 'Firma kapsamlı'}</span></header>
    {error && <div className="alert inline-alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}{notice && <div className="notice">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
    <div className="screen-view-toolbar"><label>{en ? 'ERP screen' : 'ERP ekranı'}<select value={screenKey} disabled={busy} onChange={event => { setScreenKey(event.target.value); setHistory([]) }}>{(catalogs.length ? catalogs : [{ key: 'customers', label: en ? 'Customer list' : 'Cari listesi', fields: [] }]).map(catalog => <option key={catalog.key} value={catalog.key}>{en && catalog.key === 'hr-employees' ? 'Employees' : en && catalog.key === 'customers' ? 'Customer list' : en && catalog.key === 'inventory-stock' ? 'Stock cards' : en && catalog.key === 'sales-orders' ? 'Sales orders' : en && catalog.key === 'sales-deliveries' ? 'Sales deliveries' : en && catalog.key === 'sales-invoices' ? 'Sales invoices' : en && catalog.key === 'purchase-invoices' ? 'Purchase invoices' : en && catalog.key === 'standalone-invoice-drafts' ? 'Standalone purchase invoice drafts' : en && catalog.key === 'purchase-orders' ? 'Purchase orders' : en && catalog.key === 'purchase-delivery-notes' ? 'Supplier delivery notes' : en && catalog.key === 'manufacturing-orders' ? 'Manufacturing orders' : en && catalog.key === 'fixed-assets' ? 'Fixed assets' : en && catalog.key === 'crm-opportunities' ? 'CRM opportunities' : en && catalog.key === 'payment-instruments' ? 'Payment instruments' : en && catalog.key === 'commercial-contracts' ? 'Commercial contracts' : en && catalog.key === 'operational-projects' ? 'Projects' : catalog.label}</option>)}</select></label><div className="screen-view-version"><span className={state?.active.isPublished ? 'published' : 'default'}><i/>{state?.active.isPublished ? (en ? 'Published' : 'Yayımlanmış') : (en ? 'Default layout' : 'Varsayılan düzen')}</span>{state?.active.isPublished && <small>v{state.active.revision}</small>}</div><button className="secondary small-button" disabled={busy} onClick={() => void load()}>{en ? 'Refresh' : 'Yenile'}</button></div>
    {state && <div className="screen-view-workspace">
      <section className="panel screen-view-editor"><div className="screen-view-panel-head"><div><p className="eyebrow">{en ? 'LAYOUT EDITOR' : 'DÜZEN TASARIMI'}</p><h2>{en ? 'List fields' : 'Liste alanları'}</h2><p>{en ? 'Change labels, visibility, and order. System actions stay available.' : 'Etiketleri, görünürlüğü ve sıralamayı değiştirin. Sistem işlemleri erişilebilir kalır.'}</p></div>{state.draft ? <span className="screen-view-draft"><Clock3 size={14}/>{en ? 'Draft' : 'Taslak'} · v{state.draft.revision}</span> : admin ? <button className="secondary small-button" disabled={busy} onClick={() => void createDraft()}><Plus size={15}/>{en ? 'Create draft' : 'Taslak oluştur'}</button> : <span className="screen-view-readonly">{en ? 'Read only' : 'Salt okunur'}</span>}</div>
        {state.draft && admin ? <><label className="screen-view-name">{en ? 'Draft name' : 'Taslak adı'}<input maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label><div className="screen-view-fields">{[...fields].sort((a, b) => a.position - b.position).map((field, index) => <article className={`screen-view-field${field.fixed ? ' fixed' : ''}`} key={field.key} draggable={!field.fixed} onDragStart={event => event.dataTransfer.setData('text/plain', field.key)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorder(event.dataTransfer.getData('text/plain'), field.key) }}><GripVertical size={16} className="screen-view-grip"/><label className="screen-view-visible" title={en ? 'Show or hide column' : 'Sütunu göster veya gizle'}><input type="checkbox" checked={field.visible} disabled={field.fixed} onChange={event => updateField(field.key, { visible: event.target.checked })}/>{field.visible ? <Eye size={16}/> : <EyeOff size={16}/>}</label><input aria-label={en ? 'Column label' : 'Sütun etiketi'} maxLength={80} value={field.label} onChange={event => updateField(field.key, { label: event.target.value })}/><label className="screen-view-section-label">{en ? 'Section' : 'Bölüm'}<input aria-label={en ? `Section for ${field.label}` : `${field.label} bölümü`} maxLength={40} disabled={field.fixed} value={field.section || ''} placeholder={en ? 'General' : 'Genel'} onChange={event => updateField(field.key, { section: event.target.value || null })}/></label><code>{field.key}</code>{field.fixed && <small>{en ? 'Required' : 'Zorunlu'}</small>}<div className="screen-view-order"><button type="button" aria-label={en ? 'Move up' : 'Yukarı taşı'} disabled={index === 0 || field.fixed || fields[index - 1]?.fixed} onClick={() => move(index, -1)}><ArrowUp size={14}/></button><button type="button" aria-label={en ? 'Move down' : 'Aşağı taşı'} disabled={index === fields.length - 1 || field.fixed || fields[index + 1]?.fixed} onClick={() => move(index, 1)}><ArrowDown size={14}/></button></div></article>)}</div><div className="screen-view-actions"><span>{visibleFields.length} {en ? 'visible columns' : 'görünür sütun'}</span><button className="secondary" disabled={busy} onClick={() => void saveDraft()}><Save size={15}/>{en ? 'Save draft' : 'Taslağı kaydet'}</button><button className="primary" disabled={busy || state.draft.revision < 1} onClick={() => void publishDraft()}><Send size={15}/>{en ? 'Publish' : 'Yayımla'}</button></div></> : <div className="screen-view-empty"><Check size={18}/><span>{state.active.isPublished ? (en ? 'The published company layout is active.' : 'Yayımlanmış firma düzeni kullanımda.') : (en ? 'The ERP default layout is active.' : 'ERP varsayılan düzeni kullanımda.')}</span></div>}
      </section>
    <section className="panel screen-view-preview"><div className="screen-view-panel-head"><div><p className="eyebrow">{en ? 'SAFE PREVIEW' : 'GÜVENLİ ÖNİZLEME'}</p><h2>{screenLabel}</h2><p>{en ? 'Synthetic example rows' : 'Örnek sentetik satırlar'}</p></div><span className="screen-view-preview-badge"><Eye size={14}/>{en ? 'Preview' : 'Önizleme'}</span></div><div className="screen-view-table-wrap"><table><thead>{previewGroups.length > 0 && <tr className="screen-view-group-row">{previewGroups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.count}>{group.label}</th>)}</tr>}<tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{(screenKey === 'inventory-stock' ? ['SKU-001','SKU-002'] : screenKey === 'sales-orders' ? ['SIP-001','SIP-002'] : screenKey === 'sales-deliveries' ? ['IRS-2026-001','IRS-2026-002'] : screenKey === 'sales-invoices' ? ['SATF-2026-001','SATF-2026-002'] : screenKey === 'purchase-invoices' ? ['ALF-001','ALF-002'] : screenKey === 'standalone-invoice-drafts' ? ['ALF-T-001','ALF-T-002'] : screenKey === 'purchase-orders' ? ['SAT-001','SAT-002'] : screenKey === 'manufacturing-orders' ? ['URE-2026-001','URE-2026-002'] : screenKey === 'exchange-rates' ? ['USD','EUR'] : screenKey === 'warehouse-location-balances' ? ['RAF-A01','RAF-B02'] : screenKey === 'crm-opportunities' ? ['FRS-001','FRS-002'] : screenKey === 'payment-instruments' ? ['CEK-2026-001','SNT-2026-001'] : screenKey === 'commercial-contracts' ? ['SOZ-2026-001','SOZ-2026-002'] : screenKey === 'operational-projects' ? ['PRJ-001','PRJ-002'] : ['CAR-001','CAR-002']).map((code, index) => <tr key={code}>{visibleFields.map(field => <td key={field.key}>{previewValue(screenKey, field.key, index, en)}</td>)}</tr>)}</tbody></table></div></section>
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
  const customerValues: Record<string, [string, string]> = {
    code: ['CAR-001', 'CAR-002'], name: ['Örnek Müşteri A.Ş.', 'Örnek Tedarik Ltd.'], groupName: ['Kurumsal', 'Tedarikçiler'],
    type: [en ? 'Customer' : 'Müşteri', en ? 'Supplier' : 'Tedarikçi'], currencyCode: ['TRY', 'USD'], paymentTermDays: ['30', '45'],
    taxNumber: ['—', '—'], status: [en ? 'Active' : 'Aktif', en ? 'Active' : 'Aktif'], actions: [en ? 'Open · Edit' : 'Aç · Düzenle', en ? 'Open · Edit' : 'Aç · Düzenle']
  }
  const stockValues: Record<string, [string, string]> = {
    code: ['SKU-001', 'SKU-002'], name: ['Örnek hammadde', 'Örnek mamul'], category: ['Hammadde', 'Mamül'],
    quantityOnHand: ['120 AD', '48 AD'], reservedQuantity: ['12 AD', '8 AD'], availableQuantity: ['108 AD', '40 AD'],
    minimumStock: ['25 AD', '10 AD'], valuationAmountBase: ['₺18.450,00', '₺32.160,00'], unvaluedQuantity: ['0 AD', '2 AD'],
    status: [en ? 'Sufficient' : 'Yeterli', en ? 'Below minimum' : 'Minimum altı'],
    actions: [en ? 'Custom fields · Edit · Disable · Movements' : 'Özel alanlar · Düzenle · Devre dışı · Hareketler', en ? 'Custom fields · Edit · Disable · Movements' : 'Özel alanlar · Düzenle · Devre dışı · Hareketler']
  }
  const salesOrderValues: Record<string, [string, string]> = {
    code: ['SIP-001', 'SIP-002'], quoteCode: ['TEK-001', 'TEK-002'], customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'],
    orderDate: ['21.10.2026', '22.10.2026'], lineCount: ['3', '5'], grandTotal: ['₺12.450,00', '₺28.900,00'],
    status: [en ? 'Open' : 'Açık', en ? 'Fulfilled' : 'Tamamlandı'], actions: [en ? 'Details' : 'Detay', en ? 'Details' : 'Detay']
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
  const purchaseOrderValues: Record<string, [string, string]> = {
    code: ['SAT-2026-001', 'SAT-2026-002'], supplierName: ['Örnek Tedarik Ltd.', 'Örnek Makine A.Ş.'],
    orderDate: ['20.10.2026', '21.10.2026'], expectedReceiptDate: ['05.11.2026', '—'], targetWarehouseCode: ['MERKEZ', '—'],
    lineCount: ['4', '2'], grandTotal: ['₺24.800,00', '$3,250.00'], currencyCode: ['TRY', 'USD'],
    status: [en ? 'Open' : 'Açık', en ? 'Partially received' : 'Kısmi mal kabul'], actions: [en ? 'Details · Receive' : 'Detay · Mal kabul', en ? 'Details · Receive' : 'Detay · Mal kabul']
  }
  const purchaseDeliveryNoteValues: Record<string, [string, string]> = {
    documentNumber: ['TED-IRS-2026-018', 'TED-IRS-2026-019'], documentDate: ['21.10.2026', '22.10.2026'],
    purchaseOrderCode: ['SAT-2026-001', 'SAT-2026-002'], supplierName: ['Örnek Tedarik Ltd.', 'Örnek Makine A.Ş.'],
    lineCount: ['3', '2'], purchaseReceiptCode: ['KBL-2026-014', en ? 'Not matched' : 'Bağlantı bekliyor'],
    actions: [en ? 'Details · Open order' : 'Detay · Siparişi aç', en ? 'Details · Open order' : 'Detay · Siparişi aç']
  }
  const exchangeRateValues: Record<string, [string, string]> = {
    rateDate: ['22.10.2026', '22.10.2026'], currencyCode: ['USD', 'EUR'], rate: ['42.85', '49.62'], revision: ['1', '1'], source: ['TCMB', 'TCMB']
  }
  const warehouseLocationValues: Record<string, [string, string]> = {
    stockItemCode: ['SKU-001', 'SKU-002'], stockItemName: ['Örnek hammadde', 'Örnek mamul'], quantity: ['48 AD', '12 AD'], unitCode: ['AD', 'AD']
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
  const operationalProjectValues: Record<string, [string, string]> = {
    code: ['PRJ-001', 'PRJ-002'], name: ['ERP geçişi', 'Üretim kapasitesi artışı'],
    status: [en ? 'Active' : 'Devam ediyor', en ? 'On hold' : 'Beklemede'], startDate: ['01.09.2026', '15.09.2026'],
    endDate: ['31.12.2026', '31.03.2027'], budgetAmount: ['₺850.000,00', '€120.000,00'], currencyCode: ['TRY', 'EUR'],
    taskCount: ['12', '8'], completedTaskCount: ['7', '2'], overdueTaskCount: ['1', '0'],
    actualHours: ['186,5', '74'], nextTaskDate: ['27.10.2026', '29.10.2026'], actions: [en ? 'Open project' : 'Projeyi aç', en ? 'Open project' : 'Projeyi aç']
  }
  const manufacturingOrderValues: Record<string, [string, string]> = {
    code: ['URE-2026-001', 'URE-2026-002'], billOfMaterialName: ['Montaj reçetesi · 2 operasyon', 'Kasa gövdesi · 1 operasyon'],
    warehouseName: ['Merkez üretim deposu', 'Montaj deposu'], plannedQuantity: ['24', '8'], components: ['SAC-001: 48 · CIV-002: 96', 'GOV-010: 8 · BOYA-001: 2'],
    status: [en ? 'Planned' : 'Planlandı', en ? 'Released' : 'Serbest bırakıldı'], actions: [en ? 'Schedule · Release · Cancel' : 'Çizelgele · Serbest bırak · İptal', en ? 'Complete · Cancel' : 'Tamamla · İptal']
  }
  const salesInvoiceValues: Record<string, [string, string]> = {
    code: ['SATF-2026-001', 'SATF-2026-002'], deliveryCode: ['IRS-2026-003', 'IRS-2026-004'], orderCode: ['SIP-2026-001', 'SIP-2026-002'],
    customerName: ['Örnek Müşteri A.Ş.', 'Örnek Sanayi Ltd.'], invoiceDate: ['21.10.2026', '22.10.2026'], lineCount: ['3', '5'],
    grandTotal: ['₺125,450.00', '$28,900.00'], status: [en ? 'Posted' : 'Kesildi', en ? 'Voided' : 'İptal'], actions: [en ? 'Details' : 'Detay', en ? 'Details' : 'Detay']
  }
  const values = screenKey === 'hr-employees' ? employeeValues : screenKey === 'inventory-stock' ? stockValues : screenKey === 'sales-orders' ? salesOrderValues : screenKey === 'sales-deliveries' ? salesDeliveryValues : screenKey === 'sales-invoices' ? salesInvoiceValues : screenKey === 'purchase-invoices' ? purchaseInvoiceValues : screenKey === 'standalone-invoice-drafts' ? standaloneInvoiceDraftValues : screenKey === 'purchase-orders' ? purchaseOrderValues : screenKey === 'purchase-delivery-notes' ? purchaseDeliveryNoteValues : screenKey === 'manufacturing-orders' ? manufacturingOrderValues : screenKey === 'exchange-rates' ? exchangeRateValues : screenKey === 'warehouse-location-balances' ? warehouseLocationValues : screenKey === 'fixed-assets' ? fixedAssetValues : screenKey === 'crm-opportunities' ? crmOpportunityValues : screenKey === 'payment-instruments' ? paymentInstrumentValues : screenKey === 'commercial-contracts' ? commercialContractValues : screenKey === 'operational-projects' ? operationalProjectValues : customerValues
  return values[key]?.[index] ?? '—'
}
