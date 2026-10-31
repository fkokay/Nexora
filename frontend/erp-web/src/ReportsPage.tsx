import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowRight, Play, Plus, Save, Sparkles } from 'lucide-react'
import { isEnglishLocale, localizedCatalogLabel, localizedText as tx, subscribeLocale } from './locale'
import { localDateString } from './dateUtils'
import './reports.css'
import { ReportHero } from './reports/components/ReportHero'
import { ReportMetrics } from './reports/components/ReportMetrics'
import { ReportFilters } from './reports/components/ReportFilters'
import { ReportResults } from './reports/components/ReportResults'
import { SavedReportsPanel } from './reports/components/SavedReportsPanel'
import type { Source, FilterRow, Definition, SavedReport, SavedReportRevision, Result } from './reports/reportTypes'

const defaultDefinition: Definition = { source: 'customers', columns: ['code', 'name', 'type', 'currencyCode', 'isActive'], filters: [], sortBy: 'code', descending: false, page: 1, pageSize: 50 }

export default function ReportsPage({ token, role, mode = 'report', onNavigate }: { token: string; role: string; mode?: 'report' | 'list'; onNavigate?: (page: string) => void }) {
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
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `nexora-${isList ? 'liste' : 'rapor'}-${localDateString()}.csv`; anchor.click(); URL.revokeObjectURL(url)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function groupValue(value: unknown, field: string) {
    if (value === null) return '—'
    const column = columnMap.get(field)
    if (column?.dataType === 'date') return new Date(String(value)).toLocaleString(locale)
    if ((column?.dataType === 'number' || column?.dataType === 'decimal') && typeof value === 'number') return value.toLocaleString(locale, { maximumFractionDigits: 2 })
    return typeof value === 'boolean' ? value ? tx('Aktif', 'Active') : tx('Pasif', 'Inactive') : String(value)
  }

  return <div className={`reports-page${isList ? ' custom-list-mode' : ''}`}>
    <ReportHero isList={isList} />
    {!isList && onNavigate && <section className="report-ai-assist" aria-label={tx('Yapay zekâ desteği', 'AI assistance')}><span className="report-ai-assist-icon"><Sparkles size={18}/></span><div><strong>{tx('Raporunuzu daha kolay keşfedin', 'Explore your report more easily')}</strong><p>{tx('Veri kaynakları ve alanlar hakkında AI ERP Asistanı’ndan yardım alın. Rapor tanımını burada siz oluşturup çalıştırabilirsiniz.', 'Ask the AI ERP Assistant about data sources and fields. You can build and run the report definition here.')}</p></div><button type="button" className="secondary small-button" onClick={() => onNavigate('erp-assistant')}>{tx('AI ERP Asistanı', 'AI ERP Assistant')}<ArrowRight size={14}/></button></section>}
    <ReportMetrics isList={isList} savedCount={saved.length} sourceCount={sources.length} activeFilterCount={definition.filters.length} visibleFieldCount={definition.columns.length} source={source} loading={loading} locale={locale} />
    {error && <div className="report-alert error" role="alert">{error}<button type="button" aria-label={tx('Hata bildirimini kapat', 'Dismiss error notification')} onClick={() => setError('')}>{tx('Kapat', 'Close')}</button></div>}{notice && <div className="report-alert success" role="status">{notice}<button type="button" aria-label={tx('Bilgi bildirimini kapat', 'Dismiss status notification')} onClick={() => setNotice('')}>{tx('Kapat', 'Close')}</button></div>}
    <div className="reports-layout" aria-busy={busy || loading}><section className="report-builder panel">
      <div className="report-section-heading"><div><p className="eyebrow">{isList ? tx('LİSTE TASARIMI', 'LIST DESIGN') : tx('SORGUNUZ', 'YOUR QUERY')}</p><h2>{name || (isList ? tx('Yeni liste', 'New list') : tx('Yeni rapor', 'New report'))}</h2><small>{source ? localizedCatalogLabel(source.label) : loading ? tx('Kaynak yükleniyor', 'Loading source') : tx('Kaynak kullanılamıyor', 'Source unavailable')}</small></div><button type="button" className="secondary small-button" disabled={busy} onClick={newReport}><Plus size={14} /> {tx('Yeni', 'New')} {isList ? tx('liste', 'list') : tx('rapor', 'report')}</button></div>
      <div className="report-form-grid">
        <label>{tx('Veri kaynağı', 'Data source')}<select value={definition.source} disabled={busy || loading || sources.length === 0} onChange={e => { const next = sources.find(s => s.code === e.target.value); setDrilldownBase(null); setSelectedId(''); setDefinition({ ...defaultDefinition, source: e.target.value, columns: next?.columns.slice(0, 5).map(c => c.code) ?? [], sortBy: next?.columns[0]?.code ?? 'code' }); setResult(null) }}>{sources.length ? sources.map(x => <option value={x.code} key={x.code}>{localizedCatalogLabel(x.label)}</option>) : <option value="">{loading ? tx('Kaynaklar yükleniyor…', 'Loading sources…') : tx('Kullanılabilir kaynak yok', 'No sources available')}</option>}</select></label>
        {!isList && <fieldset className="report-columns report-group-fields" disabled={busy}><legend>{tx('Gruplama alanları', 'Group by fields')} · {groupingFields.length}/3</legend><div>{columns.map(column => <label key={column.code}><input type="checkbox" checked={groupingFields.includes(column.code)} disabled={!groupingFields.includes(column.code) && groupingFields.length >= 3} onChange={e => { const next = e.target.checked ? [...groupingFields, column.code] : groupingFields.filter(field => field !== column.code); update({ groupBy: undefined, groupByFields: next.length ? next : undefined, aggregate: next.length ? definition.aggregate ?? 'count' : undefined }) }} />{localizedCatalogLabel(column.label)}</label>)}</div></fieldset>}
        {!isList && groupingFields.length > 0 && <label>{tx('Toplama ölçüsü', 'Aggregation')}<select disabled={busy} value={aggregateOptions.some(option => option.code === definition.aggregate) ? definition.aggregate : 'count'} onChange={e => update({ aggregate: e.target.value })}>{aggregateOptions.map(option => <option value={option.code} key={option.code}>{localizedCatalogLabel(option.label)}</option>)}</select></label>}
        {groupingFields.length === 0 && <label>{tx('Sıralama alanı', 'Sort field')}<select disabled={busy} value={definition.sortBy} onChange={e => update({ sortBy: e.target.value })}>{columns.map(x => <option key={x.code} value={x.code}>{localizedCatalogLabel(x.label)}</option>)}</select></label>}
        <label className="report-sort-direction"><span>{groupingFields.length > 0 ? tx('Grup sırası', 'Group order') : tx('Sıralama yönü', 'Sort direction')}</span><button type="button" className="secondary small-button" disabled={busy} aria-pressed={definition.descending} onClick={() => update({ descending: !definition.descending })}>{definition.descending ? tx('Azalan', 'Descending') : tx('Artan', 'Ascending')}</button></label>
        <fieldset className="report-columns" disabled={busy}><legend>{isList ? tx('Görünen alanlar', 'Visible fields') : tx('Sütunlar', 'Columns')} · {definition.columns.length}/12</legend><div>{columns.map(column => <label key={column.code}><input type="checkbox" checked={definition.columns.includes(column.code)} disabled={!definition.columns.includes(column.code) && definition.columns.length >= 12} onChange={e => update({ columns: e.target.checked ? [...definition.columns, column.code] : definition.columns.filter(x => x !== column.code) })} />{localizedCatalogLabel(column.label)}</label>)}</div></fieldset>
        <ReportFilters columns={columns} filters={definition.filters} busy={busy} onAdd={addFilter} onChange={setFilter} onRemove={index => update({ filters: definition.filters.filter((_, i) => i !== index) })} />
      </div>
      <div className="report-builder-footer"><label>{isList ? tx('Liste adı', 'List name') : tx('Rapor adı', 'Report name')}<input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder={isList ? tx('Örn. Açık satın alma talepleri', 'e.g. Open purchase requests') : tx('Örn. Aktif müşteriler', 'e.g. Active customers')} disabled={!admin || !!drilldownBase || busy} /></label><div><button type="button" className="primary" disabled={busy || loading || sources.length === 0 || definition.columns.length === 0 || definition.filters.some(x => x.operator !== 'isNull' && !x.value.trim())} onClick={() => void run(1)}><Play size={15} />{busy ? tx('Çalıştırılıyor…', 'Running…') : isList ? tx('Listeyi görüntüle', 'View list') : tx('Raporu çalıştır', 'Run report')}</button>{admin && <button type="button" className="secondary" disabled={busy || loading || !!drilldownBase || !name.trim() || definition.columns.length === 0} onClick={() => void save()}><Save size={15} />{selectedId ? tx('Değişiklikleri kaydet', 'Save changes') : isList ? tx('Listeyi kaydet', 'Save list') : tx('Raporu kaydet', 'Save report')}</button>}</div></div>
      {selectedId && <section className="saved-history"><div><h3>{tx('Tanım geçmişi', 'Definition history')} · {selectedRevision}</h3><p>{tx('Eski tanım geri yüklendiğinde yeni bir sürüm oluşturulur.', 'Restoring an older definition creates a new revision.')}</p></div>{history.map(item => <article key={item.id}><span>{tx('Sürüm', 'Revision')} {item.revision} · {new Date(item.createdAt).toLocaleString(locale)}</span>{admin && item.revision !== selectedRevision && <button className="secondary small-button" disabled={busy} onClick={() => void restore(item)}>{tx('Bu sürümü geri yükle', 'Restore this revision')}</button>}</article>)}</section>}
      <div className="report-security-note">{tx('Yalnızca katalogdaki alanlar sorgulanır. Kayıtlar aktif tenant ile filtrelenir; liste/rapor çalıştırmaları ve tanım değişiklikleri audit kaydına yazılır.', 'Only catalog fields can be queried. Records are filtered to the active tenant; list/report runs and definition changes are written to the audit log.')}</div>
      {busy && <p className="report-loading" role="status" aria-live="polite">{tx('İşlem sürüyor…', 'Working…')}</p>}
      {loadError && <div className="report-load-error" role="alert"><span>{tx('Kayıtlı raporlar veya kaynaklar yüklenemedi.', 'Saved reports or sources could not be loaded.')} {loadError}</span><button type="button" className="secondary small-button" disabled={loading || busy} onClick={() => void refresh().catch(() => undefined)}>{tx('Yeniden dene', 'Try again')}</button></div>}
      {!result && busy && <div className="report-preview-placeholder" role="status">{tx('Sonuçlar hazırlanıyor…', 'Preparing results…')}</div>}
      {!result && !busy && !loading && !loadError && !error && <div className="report-preview-placeholder">{tx('Önizlemeyi görmek için kaynağı ve alanları seçip raporu çalıştırın.', 'Choose a source and fields, then run the report to see a preview.')}</div>}
      {result && <ReportResults result={result} source={source} columns={columns} resultGroupingFields={resultGroupingFields} isGrouped={isGrouped} drilldownBase={drilldownBase} busy={busy} locale={locale} groupValue={groupValue} onReturnToGroups={returnToGroups} onExport={() => void exportCsv()} onDrillIntoGroup={drillIntoGroup} onPageChange={page => void run(page)} />}
    </section>
    <SavedReportsPanel isList={isList} admin={admin} loading={loading} busy={busy} loadError={loadError} saved={saved} sources={sources} selectedId={selectedId} locale={locale} onRefresh={() => void refresh().catch(() => undefined)} onOpen={report => void openReport(report)} onDuplicate={report => void duplicate(report)} onRemove={report => void remove(report)} /></div>
  </div>
}
