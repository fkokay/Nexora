import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowLeft, Copy, Download, Filter, Play, Plus, Save, Trash2 } from 'lucide-react'
import { isEnglishLocale, localizedCatalogLabel, localizedText as tx, subscribeLocale } from './locale'
import './reports.css'

type Column = { code: string; label: string; dataType: 'text' | 'number' | 'decimal' | 'boolean' | 'date'; options?: string[] }
type Source = { code: string; label: string; columns: Column[]; aggregates: { code: string; label: string }[] }
type FilterRow = { field: string; operator: string; value: string }
type Definition = { source: string; columns: string[]; filters: FilterRow[]; sortBy: string; descending: boolean; page: number; pageSize: number; groupBy?: string; groupByFields?: string[]; aggregate?: string }
type SavedReport = { id: string; name: string; source: string; definition: Definition; kind: 'Report' | 'List'; createdAt: string; updatedAt: string; definitionRevision: number }
type SavedReportRevision = { id: string; revision: number; name: string; source: string; definition: Definition; kind: 'Report' | 'List'; createdByUserId: string; createdAt: string }
type AggregateRow = { groupValue: unknown; groupValues?: unknown[]; rowCount: number; value: number | null }
type Result = { source: string; columns: Column[]; rows: Record<string, unknown>[]; page: number; pageSize: number; totalCount: number; groupBy?: string | null; groupByFields?: string[] | null; aggregate?: string | null; groups?: AggregateRow[] | null; totalGroups?: number }

const defaultDefinition: Definition = { source: 'customers', columns: ['code', 'name', 'type', 'currencyCode', 'isActive'], filters: [], sortBy: 'code', descending: false, page: 1, pageSize: 50 }

export default function ReportsPage({ token, role, mode = 'report' }: { token: string; role: string; mode?: 'report' | 'list' }) {
  const [sources, setSources] = useState<Source[]>([])
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [history, setHistory] = useState<SavedReportRevision[]>([])
  const [selectedRevision, setSelectedRevision] = useState(0)
  const [definition, setDefinition] = useState<Definition>(defaultDefinition)
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [drilldownBase, setDrilldownBase] = useState<Definition | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(false)
  const loadGeneration = useRef(0)
  const queryGeneration = useRef(0)
  const admin = role === 'TenantAdmin'
  const english = useSyncExternalStore(subscribeLocale, isEnglishLocale, () => false)
  const locale = english ? 'en-US' : 'tr-TR'
  const kind = mode === 'list' ? 'List' : 'Report'
  const isList = mode === 'list'
  const source = sources.find(x => x.code === definition.source)
  const columns = source?.columns ?? []
  const groupingFields = definition.groupByFields ?? (definition.groupBy ? [definition.groupBy] : [])
  const resultGroupingFields = result?.groupByFields ?? (result?.groupBy ? result.groupBy.split(',') : [])
  const isGrouped = resultGroupingFields.length > 0
  const hasCurrencyEqualityFilter = definition.filters.some(filter => filter.field === 'currencyCode' && filter.operator === 'equals' && filter.value.trim().length > 0)
  const aggregateOptions = (source?.aggregates ?? []).filter(option => definition.source !== 'salesInvoices' || option.code === 'count' || groupingFields.includes('currencyCode') || hasCurrencyEqualityFilter)
  const columnMap = useMemo(() => new Map(columns.map(x => [x.code, x])), [columns])
  const request = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await authenticatedFetch(url, token, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; title?: string; errors?: Record<string, string[]> } | null
      throw new Error(body?.error || Object.values(body?.errors ?? {}).flat().join(' ') || body?.title || tx(`İstek başarısız (${response.status})`, `Request failed (${response.status})`))
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }, [token])
  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current
    setLoading(true)
    setLoadError('')
    setError('')
    try {
      const [catalog, reports] = await Promise.all([request<Source[]>('/api/reports/catalog'), request<SavedReport[]>(`/api/reports/?kind=${kind}`)])
      if (!mounted.current || generation !== loadGeneration.current) return
      setSources(catalog)
      setSaved(reports)
    } catch (e) {
      if (!mounted.current || generation !== loadGeneration.current) return
      const message = (e as Error).message
      setLoadError(message)
      setError(message)
    } finally {
      if (mounted.current && generation === loadGeneration.current) setLoading(false)
    }
  }, [kind, request])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      loadGeneration.current += 1
      queryGeneration.current += 1
    }
  }, [])
  useEffect(() => {
    loadGeneration.current += 1
    queryGeneration.current += 1
    setBusy(false)
    setResult(null)
    setError('')
  }, [token, kind])
  useEffect(() => { void refresh() }, [refresh])

  function update(patch: Partial<Definition>) { setDrilldownBase(null); setDefinition(current => ({ ...current, ...patch, page: patch.page ?? 1 })); setResult(null) }
  function newReport() { setDrilldownBase(null); setSelectedId(''); setSelectedRevision(0); setHistory([]); setName(''); setDefinition(defaultDefinition); setResult(null); setNotice(isList ? tx('Yeni liste taslağı hazır.', 'New list draft is ready.') : tx('Yeni rapor taslağı hazır.', 'New report draft is ready.')) }
  async function openReport(report: SavedReport) {
    const generation = ++queryGeneration.current
    setDrilldownBase(null); setSelectedId(report.id); setSelectedRevision(report.definitionRevision); setName(report.name); setDefinition({ ...report.definition, page: 1, pageSize: 50 }); setResult(null); setError(''); setNotice('')
    setBusy(true)
    try {
      const revisions = await request<SavedReportRevision[]>(`/api/reports/${report.id}/history`)
      if (!mounted.current || generation !== queryGeneration.current) return
      setHistory(revisions)
      const data = await request<Result>(`/api/reports/${report.id}/run`, { method: 'POST', body: JSON.stringify({ page: 1, pageSize: 50 }) })
      if (!mounted.current || generation !== queryGeneration.current) return
      setResult(data)
      setDefinition({ ...report.definition, page: data.page, pageSize: data.pageSize })
    } catch (e) {
      if (mounted.current && generation === queryGeneration.current) setError((e as Error).message)
    } finally {
      if (mounted.current && generation === queryGeneration.current) setBusy(false)
    }
  }
  async function run(page = 1, query = definition) {
    const generation = ++queryGeneration.current
    setBusy(true); setError(''); setNotice('')
    setResult(null)
    try {
      const data = await request<Result>('/api/reports/run', { method: 'POST', body: JSON.stringify({ ...query, page }) })
      if (!mounted.current || generation !== queryGeneration.current) return
      setResult(data)
      setDefinition({ ...query, page: data.page })
    } catch (e) {
      if (mounted.current && generation === queryGeneration.current) setError((e as Error).message)
    } finally {
      if (mounted.current && generation === queryGeneration.current) setBusy(false)
    }
  }
  function drillIntoGroup(values: unknown[]) {
    if (!resultGroupingFields.length || values.length !== resultGroupingFields.length || values.some(value => value === undefined)) return
    const base = drilldownBase ?? definition
    const groupFilters = resultGroupingFields.flatMap((field, index): FilterRow[] => {
      const value = values[index]
      if (value === null) return [{ field, operator: 'isNull', value: '' }]
      return field === 'invoiceDate' || field === 'createdAt'
        ? [{ field, operator: 'gte', value: String(value) }, { field, operator: 'lte', value: String(value) }]
        : [{ field, operator: 'equals', value: String(value) }]
    })
    const grouped = new Set(resultGroupingFields)
    const filters = [...base.filters.filter(filter => !grouped.has(filter.field)), ...groupFilters]
    if (filters.length > 8) { setError(tx('Grup ayrıntısına inmek için filtre sınırına ulaşıldı. Bir filtreyi kaldırın ve yeniden deneyin.', 'The filter limit was reached for this group detail. Remove a filter and try again.')); return }
    if (!drilldownBase) setDrilldownBase(definition)
    const detail: Definition = { ...base, filters, groupBy: undefined, groupByFields: undefined, aggregate: undefined, page: 1 }
    void run(1, detail)
  }
  function returnToGroups() {
    if (!drilldownBase) return
    const base = drilldownBase
    setDrilldownBase(null)
    void run(1, base)
  }
  async function save() {
    if (!name.trim()) return
    setBusy(true); setError(''); setNotice('')
    try {
      const report = await request<SavedReport>(selectedId ? `/api/reports/${selectedId}` : '/api/reports/', { method: selectedId ? 'PUT' : 'POST', body: JSON.stringify({ name, definition, kind, ...(selectedId ? { expectedRevision: selectedRevision } : {}) }) })
      setSelectedId(report.id); setSelectedRevision(report.definitionRevision); setName(report.name); setHistory(await request<SavedReportRevision[]>(`/api/reports/${report.id}/history`)); await refresh(); setNotice(isList ? tx('Liste görünümü tenant alanına kaydedildi.', 'List view saved to this tenant.') : tx('Rapor tanımı tenant alanına kaydedildi.', 'Report definition saved to this tenant.'))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function remove(report: SavedReport) {
    if (!window.confirm(tx(`“${report.name}” ${isList ? 'listesini' : 'raporunu'} silmek istiyor musunuz?`, `Delete ${isList ? 'list' : 'report'} “${report.name}”?`))) return
    setBusy(true)
    try { await request(`/api/reports/${report.id}`, { method: 'DELETE' }); if (selectedId === report.id) newReport(); await refresh(); setNotice(isList ? tx('Liste silindi.', 'List deleted.') : tx('Rapor silindi.', 'Report deleted.')) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function duplicate(report: SavedReport) {
    setBusy(true); setError(''); setNotice('')
    try {
      const copy = await request<SavedReport>(`/api/reports/${report.id}/duplicate`, { method: 'POST' })
      await refresh()
      await openReport(copy)
      setNotice(isList ? tx('Listenin kopyası oluşturuldu; şimdi düzenleyebilirsiniz.', 'A copy of the list was created and is ready to edit.') : tx('Raporun kopyası oluşturuldu; şimdi düzenleyebilirsiniz.', 'A copy of the report was created and is ready to edit.'))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function restore(revision: SavedReportRevision) {
    if (!selectedId) return
    setBusy(true); setError(''); setNotice('')
    try {
      const report = await request<SavedReport>(`/api/reports/${selectedId}/history/${revision.revision}/restore`, { method: 'POST', body: JSON.stringify({ expectedRevision: selectedRevision }) })
      setSelectedRevision(report.definitionRevision); setName(report.name); setDefinition({ ...report.definition, page: 1 }); setHistory(await request<SavedReportRevision[]>(`/api/reports/${report.id}/history`)); await refresh()
      setNotice(tx(`Tanım ${revision.revision}. sürümden ${report.definitionRevision}. sürüm olarak geri yüklendi.`, `Definition restored from revision ${revision.revision} as revision ${report.definitionRevision}.`))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function addFilter() { if (definition.filters.length < 8) update({ filters: [...definition.filters, { field: columns[0]?.code ?? 'code', operator: 'contains', value: '' }] }) }
  function setFilter(index: number, patch: Partial<FilterRow>) { update({ filters: definition.filters.map((row, i) => i === index ? { ...row, ...patch } : row) }) }
  async function exportCsv() {
    if (!result) return
    setBusy(true); setError('')
    try {
      const response = await authenticatedFetch('/api/reports/export', token, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(definition) })
      if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string; title?: string } | null; throw new Error(body?.error || body?.title || tx(`Dışa aktarma başarısız (${response.status})`, `Export failed (${response.status})`)) }
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `nexora-${isList ? 'liste' : 'rapor'}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function operatorsFor(column: Column | undefined) { if (!column) return ['equals']; if (column.code === 'startedByUserId') return ['equals']; if (column.code === 'barcode' || column.code === 'category' || column.code === 'riskLimit') return ['contains', 'equals', 'gt', 'gte', 'lt', 'lte', 'isNull'].filter(op => column.dataType === 'text' ? op === 'contains' || op === 'equals' || op === 'isNull' : op !== 'contains'); if (column.options || column.dataType === 'boolean') return ['equals']; if (column.dataType === 'text') return ['contains', 'equals']; if (column.dataType === 'date') return ['gt', 'gte', 'lt', 'lte']; return ['equals', 'gt', 'gte', 'lt', 'lte'] }
  function valueInput(column: Column | undefined, value: string, onChange: (value: string) => void) {
    const label = `${tx('Filtre değeri', 'Filter value')}: ${localizedCatalogLabel(column?.label ?? '')}`
    if (column?.options) return <select aria-label={label} disabled={busy} value={value} onChange={e => onChange(e.target.value)}><option value="">{tx('Seçin', 'Select')}</option>{column.options.map(option => <option value={option} key={option}>{option}</option>)}</select>
    if (column?.dataType === 'boolean') return <select aria-label={label} disabled={busy} value={value} onChange={e => onChange(e.target.value)}><option value="">{tx('Seçin', 'Select')}</option><option value="true">{tx('Aktif', 'Active')}</option><option value="false">{tx('Pasif', 'Inactive')}</option></select>
    if (column?.code === 'createdAt') return <input aria-label={label} disabled={busy} type="text" value={value} onChange={e => onChange(e.target.value)} maxLength={200} placeholder={tx('ISO tarih/saat', 'ISO date/time')} />
    return <input aria-label={label} disabled={busy} type={column?.dataType === 'date' ? 'date' : column?.dataType === 'number' || column?.dataType === 'decimal' ? 'number' : 'text'} step={column?.dataType === 'decimal' ? '0.01' : undefined} value={value} onChange={e => onChange(e.target.value)} maxLength={200} placeholder={tx('Değer', 'Value')} />
  }
  function groupValue(value: unknown, field: string) {
    if (value === null) return '—'
    const column = columnMap.get(field)
    if (column?.dataType === 'date') return new Date(String(value)).toLocaleString(locale)
    if ((column?.dataType === 'number' || column?.dataType === 'decimal') && typeof value === 'number') return value.toLocaleString(locale, { maximumFractionDigits: 2 })
    return typeof value === 'boolean' ? value ? tx('Aktif', 'Active') : tx('Pasif', 'Inactive') : String(value)
  }

  return <div className={`reports-page${isList ? ' custom-list-mode' : ''}`}>
    <header className="report-hero screen-page-header"><div className="report-hero-mark"><Filter size={21} /></div><div><p className="eyebrow">{isList ? tx('TENANT UYARLAMA', 'TENANT CUSTOMIZATION') : tx('TENANT ANALİTİĞİ', 'TENANT ANALYTICS')}</p><h1>{isList ? tx('Dinamik liste oluşturucu', 'Dynamic list builder') : tx('Rapor oluşturucu', 'Report builder')}</h1><p>{isList ? tx('Veri kaynağı, sütun, filtre ve sıralamayı seçip çalıştırılabilir, tekrar kullanılabilir veri listeleri hazırlayın.', 'Choose a data source, columns, filters, and sorting to create runnable, reusable data lists.') : tx('ERP kayıtlarını sabit veri kaynakları, alanlar ve filtrelerle sorgulayın; rapor tanımlarını ekibiniz için saklayın.', 'Query ERP records using defined data sources, fields, and filters; save report definitions for your team.')}</p></div></header>
    <section className="report-workbench-metrics" aria-label={tx('Çalışma alanı özeti', 'Workbench summary')}>
      <article><span>{isList ? tx('Kayıtlı listeler', 'Saved lists') : tx('Kayıtlı raporlar', 'Saved reports')}</span><strong>{saved.length.toLocaleString(locale)}</strong><small>{loading ? tx('Yükleniyor…', 'Loading…') : tx('Bu firmada', 'In this company')}</small></article>
      <article><span>{tx('Veri kaynakları', 'Data sources')}</span><strong>{sources.length.toLocaleString(locale)}</strong><small>{tx('Yetkili katalog', 'Available catalog')}</small></article>
      <article><span>{tx('Etkin filtreler', 'Active filters')}</span><strong>{definition.filters.length.toLocaleString(locale)}</strong><small>{tx('En fazla 8 koşul', 'Up to 8 conditions')}</small></article>
      <article><span>{tx('Görünen alan', 'Visible fields')}</span><strong>{definition.columns.length.toLocaleString(locale)}</strong><small>{localizedCatalogLabel(source?.label ?? tx('Kaynak seçilmedi', 'No source selected'))}</small></article>
    </section>
    {error && <div className="report-alert error" role="alert">{error}<button type="button" aria-label={tx('Hata bildirimini kapat', 'Dismiss error notification')} onClick={() => setError('')}>{tx('Kapat', 'Close')}</button></div>}{notice && <div className="report-alert success" role="status">{notice}<button type="button" aria-label={tx('Bilgi bildirimini kapat', 'Dismiss status notification')} onClick={() => setNotice('')}>{tx('Kapat', 'Close')}</button></div>}
    <div className="reports-layout" aria-busy={busy || loading}><section className="report-builder panel">
      <div className="report-section-heading"><div><p className="eyebrow">{isList ? tx('LİSTE TASARIMI', 'LIST DESIGN') : tx('SORGUNUZ', 'YOUR QUERY')}</p><h2>{name || (isList ? tx('Yeni liste', 'New list') : tx('Yeni rapor', 'New report'))}</h2><small>{source ? localizedCatalogLabel(source.label) : loading ? tx('Kaynak yükleniyor', 'Loading source') : tx('Kaynak kullanılamıyor', 'Source unavailable')}</small></div><button type="button" className="secondary small-button" disabled={busy} onClick={newReport}><Plus size={14} /> {tx('Yeni', 'New')} {isList ? tx('liste', 'list') : tx('rapor', 'report')}</button></div>
      <div className="report-form-grid">
        <label>{tx('Veri kaynağı', 'Data source')}<select value={definition.source} disabled={busy || loading || sources.length === 0} onChange={e => { const next = sources.find(s => s.code === e.target.value); setDrilldownBase(null); setSelectedId(''); setDefinition({ ...defaultDefinition, source: e.target.value, columns: next?.columns.slice(0, 5).map(c => c.code) ?? [] }); setResult(null) }}>{sources.length ? sources.map(x => <option value={x.code} key={x.code}>{localizedCatalogLabel(x.label)}</option>) : <option value="">{loading ? tx('Kaynaklar yükleniyor…', 'Loading sources…') : tx('Kullanılabilir kaynak yok', 'No sources available')}</option>}</select></label>
        {!isList && <fieldset className="report-columns report-group-fields" disabled={busy}><legend>{tx('Gruplama alanları', 'Group by fields')} · {groupingFields.length}/3</legend><div>{columns.map(column => <label key={column.code}><input type="checkbox" checked={groupingFields.includes(column.code)} disabled={!groupingFields.includes(column.code) && groupingFields.length >= 3} onChange={e => { const next = e.target.checked ? [...groupingFields, column.code] : groupingFields.filter(field => field !== column.code); update({ groupBy: undefined, groupByFields: next.length ? next : undefined, aggregate: next.length ? definition.aggregate ?? 'count' : undefined }) }} />{localizedCatalogLabel(column.label)}</label>)}</div></fieldset>}
        {!isList && groupingFields.length > 0 && <label>{tx('Toplama ölçüsü', 'Aggregation')}<select disabled={busy} value={aggregateOptions.some(option => option.code === definition.aggregate) ? definition.aggregate : 'count'} onChange={e => update({ aggregate: e.target.value })}>{aggregateOptions.map(option => <option value={option.code} key={option.code}>{localizedCatalogLabel(option.label)}</option>)}</select></label>}
        {groupingFields.length === 0 && <label>{tx('Sıralama alanı', 'Sort field')}<select disabled={busy} value={definition.sortBy} onChange={e => update({ sortBy: e.target.value })}>{columns.map(x => <option key={x.code} value={x.code}>{localizedCatalogLabel(x.label)}</option>)}</select></label>}
        <label className="report-sort-direction"><span>{groupingFields.length > 0 ? tx('Grup sırası', 'Group order') : tx('Sıralama yönü', 'Sort direction')}</span><button type="button" className="secondary small-button" disabled={busy} aria-pressed={definition.descending} onClick={() => update({ descending: !definition.descending })}>{definition.descending ? tx('Azalan', 'Descending') : tx('Artan', 'Ascending')}</button></label>
        <fieldset className="report-columns" disabled={busy}><legend>{isList ? tx('Görünen alanlar', 'Visible fields') : tx('Sütunlar', 'Columns')} · {definition.columns.length}/12</legend><div>{columns.map(column => <label key={column.code}><input type="checkbox" checked={definition.columns.includes(column.code)} disabled={!definition.columns.includes(column.code) && definition.columns.length >= 12} onChange={e => update({ columns: e.target.checked ? [...definition.columns, column.code] : definition.columns.filter(x => x !== column.code) })} />{localizedCatalogLabel(column.label)}</label>)}</div></fieldset>
        <div className="report-filter-head"><div><h3>{tx('Filtreler', 'Filters')}</h3><p>{tx('Tüm koşullar birlikte uygulanır.', 'All conditions are applied together.')}</p></div><button type="button" className="secondary small-button" disabled={busy || definition.filters.length >= 8} onClick={addFilter}><Plus size={14} /> {tx('Filtre ekle', 'Add filter')}</button></div>
        {definition.filters.map((filter, index) => { const field = columnMap.get(filter.field); const filterLabel = `${tx('Filtre', 'Filter')} ${index + 1}`; return <div className="report-filter-row" key={index}><select aria-label={`${filterLabel}: ${tx('alan', 'field')}`} disabled={busy} value={filter.field} onChange={e => { const selected = columnMap.get(e.target.value); setFilter(index, { field: e.target.value, operator: operatorsFor(selected)[0], value: '' }) }}>{columns.map(x => <option value={x.code} key={x.code}>{localizedCatalogLabel(x.label)}</option>)}</select><select aria-label={`${filterLabel}: ${tx('operatör', 'operator')}`} disabled={busy} value={filter.operator} onChange={e => setFilter(index, { operator: e.target.value, ...(e.target.value === 'isNull' ? { value: '' } : {}) })}>{operatorsFor(field).map(op => <option value={op} key={op}>{({ contains: tx('İçerir', 'Contains'), equals: tx('Eşittir', 'Equals'), gt: tx('Büyüktür', 'Greater than'), gte: tx('En az', 'At least'), lt: tx('Küçüktür', 'Less than'), lte: tx('En çok', 'At most'), isNull: tx('Boş', 'Is empty') } as Record<string, string>)[op]}</option>)}</select>{filter.operator === 'isNull' ? <input aria-label={`${filterLabel}: ${tx('değer', 'value')}`} type="text" disabled value="" placeholder={tx('Boş değer', 'Empty value')} /> : valueInput(field, filter.value, value => setFilter(index, { value }))}<button type="button" className="report-delete-filter" aria-label={`${filterLabel}: ${tx('kaldır', 'remove')}`} disabled={busy} onClick={() => update({ filters: definition.filters.filter((_, i) => i !== index) })}><Trash2 size={15} /></button></div> })}
      </div>
      <div className="report-builder-footer"><label>{isList ? tx('Liste adı', 'List name') : tx('Rapor adı', 'Report name')}<input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder={isList ? tx('Örn. Açık satın alma talepleri', 'e.g. Open purchase requests') : tx('Örn. Aktif müşteriler', 'e.g. Active customers')} disabled={!admin || !!drilldownBase || busy} /></label><div><button type="button" className="primary" disabled={busy || loading || sources.length === 0 || definition.columns.length === 0 || definition.filters.some(x => x.operator !== 'isNull' && !x.value.trim())} onClick={() => void run(1)}><Play size={15} />{busy ? tx('Çalıştırılıyor…', 'Running…') : isList ? tx('Listeyi görüntüle', 'View list') : tx('Raporu çalıştır', 'Run report')}</button>{admin && <button type="button" className="secondary" disabled={busy || loading || !!drilldownBase || !name.trim() || definition.columns.length === 0} onClick={() => void save()}><Save size={15} />{selectedId ? tx('Değişiklikleri kaydet', 'Save changes') : isList ? tx('Listeyi kaydet', 'Save list') : tx('Raporu kaydet', 'Save report')}</button>}</div></div>
      {selectedId && <section className="saved-history"><div><h3>{tx('Tanım geçmişi', 'Definition history')} · {selectedRevision}</h3><p>{tx('Eski tanım geri yüklendiğinde yeni bir sürüm oluşturulur.', 'Restoring an older definition creates a new revision.')}</p></div>{history.map(item => <article key={item.id}><span>{tx('Sürüm', 'Revision')} {item.revision} · {new Date(item.createdAt).toLocaleString(locale)}</span>{admin && item.revision !== selectedRevision && <button className="secondary small-button" disabled={busy} onClick={() => void restore(item)}>{tx('Bu sürümü geri yükle', 'Restore this revision')}</button>}</article>)}</section>}
      <div className="report-security-note">{tx('Yalnızca katalogdaki alanlar sorgulanır. Kayıtlar aktif tenant ile filtrelenir; liste/rapor çalıştırmaları ve tanım değişiklikleri audit kaydına yazılır.', 'Only catalog fields can be queried. Records are filtered to the active tenant; list/report runs and definition changes are written to the audit log.')}</div>
      {busy && <p className="report-loading" role="status" aria-live="polite">{tx('İşlem sürüyor…', 'Working…')}</p>}
      {loadError && <div className="report-load-error" role="alert"><span>{tx('Kayıtlı raporlar veya kaynaklar yüklenemedi.', 'Saved reports or sources could not be loaded.')} {loadError}</span><button type="button" className="secondary small-button" disabled={loading || busy} onClick={() => void refresh().catch(() => undefined)}>{tx('Yeniden dene', 'Try again')}</button></div>}
      {!result && busy && <div className="report-preview-placeholder" role="status">{tx('Sonuçlar hazırlanıyor…', 'Preparing results…')}</div>}
      {!result && !busy && !loading && !loadError && !error && <div className="report-preview-placeholder">{tx('Önizlemeyi görmek için kaynağı ve alanları seçip raporu çalıştırın.', 'Choose a source and fields, then run the report to see a preview.')}</div>}
      {result && <section className="report-result" aria-label={tx('Rapor önizlemesi', 'Report preview')}>
        <div className="report-result-heading"><div><h3>{drilldownBase ? tx('Grup ayrıntıları', 'Group details') : tx('Sonuçlar', 'Results')}</h3><p>{isGrouped ? `${(result.totalGroups ?? 0).toLocaleString(locale)} ${tx('grup', 'groups')} · ${result.totalCount.toLocaleString(locale)} ${tx('kayıt', 'records')} · ${tx('sayfa', 'page')} ${result.page}` : `${result.totalCount.toLocaleString(locale)} ${tx('kayıt', 'records')} · ${tx('sayfa', 'page')} ${result.page}`}</p></div><div className="report-result-actions">{drilldownBase && <button className="secondary small-button" onClick={returnToGroups} disabled={busy}><ArrowLeft size={14} /> {tx('Gruplara dön', 'Back to groups')}</button>}<button className="secondary small-button" onClick={() => void exportCsv()} disabled={busy || (!result.rows.length && !result.groups?.length)}><Download size={14} /> {tx('CSV indir', 'Download CSV')}</button></div></div>
        <div className="report-table-wrap" role="region" tabIndex={0} aria-label={tx('Sonuç tablosu; yatay kaydırmak için ok tuşlarını kullanın', 'Results table; use arrow keys to scroll horizontally')}><AdvancedDataGrid><caption className="report-visually-hidden">{tx('Rapor sonuçları', 'Report results')}</caption><thead><tr>{isGrouped ? <>{resultGroupingFields.map(field => <th scope="col" key={field}>{localizedCatalogLabel(columns.find(c => c.code === field)?.label ?? field)}</th>)}<th scope="col">{tx('Kayıt sayısı', 'Record count')}</th>{result.aggregate !== 'count' && <th scope="col">{localizedCatalogLabel(source?.aggregates.find(option => option.code === result.aggregate)?.label ?? tx('Değer', 'Value'))}</th>}</> : result.columns.map(c => <th scope="col" key={c.code}>{localizedCatalogLabel(c.label)}</th>)}</tr></thead><tbody>
          {isGrouped ? (result.groups ?? []).map((group, index) => { const values = group.groupValues ?? [group.groupValue]; return <tr key={index}>{resultGroupingFields.map((field, fieldIndex) => { const value = values[fieldIndex]; return <td key={field}>{value === undefined ? '—' : <button type="button" className="report-group-drill" onClick={() => drillIntoGroup(values)} title={tx('Bu grubun kayıt ayrıntılarını aç', 'Open this group’s record details')}>{groupValue(value, field)}</button>}</td>})}<td>{group.rowCount.toLocaleString(locale)}</td>{result.aggregate !== 'count' && <td>{group.value?.toLocaleString(locale, { maximumFractionDigits: 2 }) ?? '—'}</td>}</tr> }) : result.rows.map((row, index) => <tr key={index}>{result.columns.map(c => <td key={c.code}>{typeof row[c.code] === 'boolean' ? row[c.code] ? tx('Aktif', 'Active') : tx('Pasif', 'Inactive') : row[c.code] === null ? '—' : c.dataType === 'date' && row[c.code] ? new Date(String(row[c.code])).toLocaleDateString(locale) : String(row[c.code])}</td>)}</tr>)}
          {(isGrouped ? !result.groups?.length : !result.rows.length) && <tr><td colSpan={isGrouped ? resultGroupingFields.length + 1 + (result.aggregate === 'count' ? 0 : 1) : Math.max(result.columns.length, 1)} className="report-empty">{tx('Filtreye uygun kayıt bulunamadı.', 'No records match the filters.')}</td></tr>}
        </tbody></AdvancedDataGrid></div>
        <nav className="report-pagination" aria-label={tx('Sonuç sayfaları', 'Result pages')}><span>{isGrouped ? `${result.totalGroups ? (result.page - 1) * result.pageSize + 1 : 0}–${Math.min(result.page * result.pageSize, result.totalGroups ?? 0)} / ${result.totalGroups ?? 0} ${tx('grup', 'groups')}` : result.totalCount ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.totalCount)} / ${result.totalCount}` : tx('0 kayıt', '0 records')}</span><div><button type="button" className="secondary small-button" disabled={busy || result.page <= 1} onClick={() => void run(result.page - 1)}>{tx('Önceki', 'Previous')}</button><button type="button" className="secondary small-button" disabled={busy || result.page * result.pageSize >= (isGrouped ? result.totalGroups ?? 0 : result.totalCount)} onClick={() => void run(result.page + 1)}>{tx('Sonraki', 'Next')}</button></div></nav>
      </section>}
    </section>
    <aside className="report-saved panel"><div className="report-section-heading"><div><p className="eyebrow">{isList ? tx('KAYITLI LİSTELER', 'SAVED LISTS') : tx('KAYITLI RAPORLAR', 'SAVED REPORTS')}</p><h2>{isList ? tx('Ekibinizin listeleri', 'Your team’s lists') : tx('Ekibinizin raporları', 'Your team’s reports')}</h2><small aria-live="polite">{loading ? tx('Yükleniyor…', 'Loading…') : `${saved.length} ${isList ? tx('liste', 'lists') : tx('rapor', 'reports')}`}</small></div><button type="button" className="secondary small-button" disabled={loading || busy} onClick={() => void refresh().catch(() => undefined)}>{tx('Yenile', 'Refresh')}</button></div>{loading ? <div className="report-empty-state" role="status">{tx('Kayıtlı tanımlar yükleniyor…', 'Loading saved definitions…')}</div> : loadError ? <div className="report-empty-state" role="alert">{tx('Kayıtlı tanımlar gösterilemiyor.', 'Saved definitions are unavailable.')}</div> : saved.length ? saved.map(report => <article className={`saved-report ${selectedId === report.id ? 'selected' : ''}`} key={report.id}><button className="saved-report-open" title={tx(`${report.name} öğesini aç ve çalıştır`, `Open and run ${report.name}`)} disabled={busy} onClick={() => void openReport(report)}><b>{report.name}</b><small>{localizedCatalogLabel(sources.find(x => x.code === report.source)?.label ?? report.source)} · {tx('Aç ve çalıştır', 'Open and run')} · {new Date(report.updatedAt).toLocaleDateString(locale)}</small></button>{admin && <><button type="button" className="report-delete-saved" title={isList ? tx('Listeyi çoğalt', 'Duplicate list') : tx('Raporu çoğalt', 'Duplicate report')} aria-label={isList ? tx(`Listeyi çoğalt: ${report.name}`, `Duplicate list: ${report.name}`) : tx(`Raporu çoğalt: ${report.name}`, `Duplicate report: ${report.name}`)} disabled={busy} onClick={() => void duplicate(report)}><Copy size={15} /></button><button type="button" className="report-delete-saved" title={isList ? tx('Listeyi sil', 'Delete list') : tx('Raporu sil', 'Delete report')} aria-label={isList ? tx(`Listeyi sil: ${report.name}`, `Delete list: ${report.name}`) : tx(`Raporu sil: ${report.name}`, `Delete report: ${report.name}`)} disabled={busy} onClick={() => void remove(report)}><Trash2 size={15} /></button></>}</article>) : <div className="report-empty-state">{tx('Henüz kayıtlı', 'No saved')} {isList ? tx('liste', 'lists') : tx('rapor', 'reports')} {tx('yok.', 'yet.')}{admin ? ` ${tx('Bir', 'Create a')} ${isList ? tx('liste', 'list') : tx('rapor', 'report')} ${tx('tasarlayıp kaydedin.', 'and save it.')}` : tx(' Yöneticinizden görünüm paylaşmasını isteyin.', ' Ask your administrator to share a view.')}</div>}</aside></div>
  </div>
}
