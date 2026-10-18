import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Filter, Play, Plus, Save, Trash2 } from 'lucide-react'
import './reports.css'

type Column = { code: string; label: string; dataType: 'text' | 'number' | 'decimal' | 'boolean' | 'date'; options?: string[] }
type Source = { code: string; label: string; columns: Column[]; aggregates: { code: string; label: string }[] }
type FilterRow = { field: string; operator: string; value: string }
type Definition = { source: string; columns: string[]; filters: FilterRow[]; sortBy: string; descending: boolean; page: number; pageSize: number; groupBy?: string; groupByFields?: string[]; aggregate?: string }
type SavedReport = { id: string; name: string; source: string; definition: Definition; kind: 'Report' | 'List'; createdAt: string; updatedAt: string }
type AggregateRow = { groupValue: unknown; groupValues?: unknown[]; rowCount: number; value: number | null }
type Result = { source: string; columns: Column[]; rows: Record<string, unknown>[]; page: number; pageSize: number; totalCount: number; groupBy?: string | null; groupByFields?: string[] | null; aggregate?: string | null; groups?: AggregateRow[] | null; totalGroups?: number }

const defaultDefinition: Definition = { source: 'customers', columns: ['code', 'name', 'type', 'currencyCode', 'isActive'], filters: [], sortBy: 'code', descending: false, page: 1, pageSize: 50 }

export default function ReportsPage({ token, role, mode = 'report' }: { token: string; role: string; mode?: 'report' | 'list' }) {
  const [sources, setSources] = useState<Source[]>([])
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [definition, setDefinition] = useState<Definition>(defaultDefinition)
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [drilldownBase, setDrilldownBase] = useState<Definition | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const admin = role === 'TenantAdmin'
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
    const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; title?: string; errors?: Record<string, string[]> } | null
      throw new Error(body?.error || Object.values(body?.errors ?? {}).flat().join(' ') || body?.title || `İstek başarısız (${response.status})`)
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }, [token])
  const refresh = useCallback(async () => {
    const [catalog, reports] = await Promise.all([request<Source[]>('/api/reports/catalog'), request<SavedReport[]>(`/api/reports/?kind=${kind}`)])
    setSources(catalog)
    setSaved(reports)
  }, [kind, request])
  useEffect(() => { void refresh().catch(e => setError((e as Error).message)) }, [refresh])

  function update(patch: Partial<Definition>) { setDrilldownBase(null); setDefinition(current => ({ ...current, ...patch, page: patch.page ?? 1 })); setResult(null) }
  function newReport() { setDrilldownBase(null); setSelectedId(''); setName(''); setDefinition(defaultDefinition); setResult(null); setNotice(isList ? 'Yeni liste taslağı hazır.' : 'Yeni rapor taslağı hazır.') }
  async function openReport(report: SavedReport) {
    setDrilldownBase(null); setSelectedId(report.id); setName(report.name); setDefinition({ ...report.definition, page: 1, pageSize: 50 }); setResult(null); setError(''); setNotice('')
    setBusy(true)
    try {
      const data = await request<Result>(`/api/reports/${report.id}/run`, { method: 'POST', body: JSON.stringify({ page: 1, pageSize: 50 }) })
      setResult(data)
      setDefinition({ ...report.definition, page: data.page, pageSize: data.pageSize })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function run(page = 1, query = definition) {
    setBusy(true); setError(''); setNotice('')
    try { const data = await request<Result>('/api/reports/run', { method: 'POST', body: JSON.stringify({ ...query, page }) }); setResult(data); setDefinition({ ...query, page: data.page }) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
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
    if (filters.length > 8) { setError('Grup ayrıntısına inmek için filtre sınırına ulaşıldı. Bir filtreyi kaldırın ve yeniden deneyin.'); return }
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
      const report = await request<SavedReport>(selectedId ? `/api/reports/${selectedId}` : '/api/reports/', { method: selectedId ? 'PUT' : 'POST', body: JSON.stringify({ name, definition, kind }) })
      setSelectedId(report.id); setName(report.name); await refresh(); setNotice(isList ? 'Liste görünümü tenant alanına kaydedildi.' : 'Rapor tanımı tenant alanına kaydedildi.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function remove(report: SavedReport) {
    if (!window.confirm(`“${report.name}” ${isList ? 'listesini' : 'raporunu'} silmek istiyor musunuz?`)) return
    setBusy(true)
    try { await request(`/api/reports/${report.id}`, { method: 'DELETE' }); if (selectedId === report.id) newReport(); await refresh(); setNotice(isList ? 'Liste silindi.' : 'Rapor silindi.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function addFilter() { if (definition.filters.length < 8) update({ filters: [...definition.filters, { field: columns[0]?.code ?? 'code', operator: 'contains', value: '' }] }) }
  function setFilter(index: number, patch: Partial<FilterRow>) { update({ filters: definition.filters.map((row, i) => i === index ? { ...row, ...patch } : row) }) }
  async function exportCsv() {
    if (!result) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/reports/export', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(definition) })
      if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string; title?: string } | null; throw new Error(body?.error || body?.title || `Dışa aktarma başarısız (${response.status})`) }
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `nexora-${isList ? 'liste' : 'rapor'}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  function operatorsFor(column: Column | undefined) { if (!column) return ['equals']; if (column.code === 'startedByUserId') return ['equals']; if (column.code === 'barcode' || column.code === 'category' || column.code === 'riskLimit') return ['contains', 'equals', 'gt', 'gte', 'lt', 'lte', 'isNull'].filter(op => column.dataType === 'text' ? op === 'contains' || op === 'equals' || op === 'isNull' : op !== 'contains'); if (column.options || column.dataType === 'boolean') return ['equals']; if (column.dataType === 'text') return ['contains', 'equals']; if (column.dataType === 'date') return ['gt', 'gte', 'lt', 'lte']; return ['equals', 'gt', 'gte', 'lt', 'lte'] }
  function valueInput(column: Column | undefined, value: string, onChange: (value: string) => void) {
    if (column?.options) return <select value={value} onChange={e => onChange(e.target.value)}><option value="">Seçin</option>{column.options.map(option => <option value={option} key={option}>{option}</option>)}</select>
    if (column?.dataType === 'boolean') return <select value={value} onChange={e => onChange(e.target.value)}><option value="">Seçin</option><option value="true">Aktif</option><option value="false">Pasif</option></select>
    if (column?.code === 'createdAt') return <input type="text" value={value} onChange={e => onChange(e.target.value)} maxLength={200} placeholder="ISO tarih/saat" />
    return <input type={column?.dataType === 'date' ? 'date' : column?.dataType === 'number' || column?.dataType === 'decimal' ? 'number' : 'text'} step={column?.dataType === 'decimal' ? '0.01' : undefined} value={value} onChange={e => onChange(e.target.value)} maxLength={200} placeholder="Değer" />
  }
  function groupValue(value: unknown, field: string) {
    if (value === null) return '—'
    const column = columnMap.get(field)
    if (column?.dataType === 'date') return new Date(String(value)).toLocaleString('tr-TR')
    if ((column?.dataType === 'number' || column?.dataType === 'decimal') && typeof value === 'number') return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
    return typeof value === 'boolean' ? value ? 'Aktif' : 'Pasif' : String(value)
  }

  return <div className={`reports-page${isList ? ' custom-list-mode' : ''}`}>
    <header className="report-hero"><div className="report-hero-mark"><Filter size={21} /></div><div><p className="eyebrow">{isList ? 'TENANT UYARLAMA' : 'TENANT ANALİTİĞİ'}</p><h1>{isList ? 'Dinamik liste oluşturucu' : 'Rapor oluşturucu'}</h1><p>{isList ? 'ERP kayıtlarından ekibiniz için kolon, filtre ve sıralama seçerek tekrar kullanılabilir listeler hazırlayın.' : 'ERP kayıtlarını sabit veri kaynakları, alanlar ve filtrelerle sorgulayın; rapor tanımlarını ekibiniz için saklayın.'}</p></div></header>
    {error && <div className="report-alert error">{error}<button onClick={() => setError('')}>Kapat</button></div>}{notice && <div className="report-alert success">{notice}<button onClick={() => setNotice('')}>Kapat</button></div>}
    <div className="reports-layout"><section className="report-builder panel">
      <div className="report-section-heading"><div><p className="eyebrow">{isList ? 'LİSTE TASARIMI' : 'SORGUNUZ'}</p><h2>{name || (isList ? 'Yeni liste' : 'Yeni rapor')}</h2><small>{source?.label ?? 'Kaynak yükleniyor'}</small></div><button className="secondary small-button" onClick={newReport}><Plus size={14} /> Yeni {isList ? 'liste' : 'rapor'}</button></div>
      <div className="report-form-grid">
        <label>Veri kaynağı<select value={definition.source} onChange={e => { const next = sources.find(s => s.code === e.target.value); setDrilldownBase(null); setSelectedId(''); setDefinition({ ...defaultDefinition, source: e.target.value, columns: next?.columns.slice(0, 5).map(c => c.code) ?? [] }); setResult(null) }}>{sources.map(x => <option value={x.code} key={x.code}>{x.label}</option>)}</select></label>
        {!isList && <fieldset className="report-columns report-group-fields"><legend>Gruplama alanları · {groupingFields.length}/3</legend><div>{columns.map(column => <label key={column.code}><input type="checkbox" checked={groupingFields.includes(column.code)} disabled={!groupingFields.includes(column.code) && groupingFields.length >= 3} onChange={e => { const next = e.target.checked ? [...groupingFields, column.code] : groupingFields.filter(field => field !== column.code); update({ groupBy: undefined, groupByFields: next.length ? next : undefined, aggregate: next.length ? definition.aggregate ?? 'count' : undefined }) }} />{column.label}</label>)}</div></fieldset>}
        {!isList && groupingFields.length > 0 && <label>Toplama ölçüsü<select value={aggregateOptions.some(option => option.code === definition.aggregate) ? definition.aggregate : 'count'} onChange={e => update({ aggregate: e.target.value })}>{aggregateOptions.map(option => <option value={option.code} key={option.code}>{option.label}</option>)}</select></label>}
        {groupingFields.length === 0 && <label>Sıralama alanı<select value={definition.sortBy} onChange={e => update({ sortBy: e.target.value })}>{columns.map(x => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>}
        <label className="report-sort-direction"><span>{groupingFields.length > 0 ? 'Grup sırası' : 'Sıralama yönü'}</span><button type="button" className="secondary small-button" onClick={() => update({ descending: !definition.descending })}>{definition.descending ? 'Azalan' : 'Artan'}</button></label>
        <fieldset className="report-columns"><legend>{isList ? 'Görünen alanlar' : 'Sütunlar'} · {definition.columns.length}/12</legend><div>{columns.map(column => <label key={column.code}><input type="checkbox" checked={definition.columns.includes(column.code)} disabled={!definition.columns.includes(column.code) && definition.columns.length >= 12} onChange={e => update({ columns: e.target.checked ? [...definition.columns, column.code] : definition.columns.filter(x => x !== column.code) })} />{column.label}</label>)}</div></fieldset>
        <div className="report-filter-head"><div><h3>Filtreler</h3><p>Tüm koşullar birlikte uygulanır.</p></div><button className="secondary small-button" disabled={definition.filters.length >= 8} onClick={addFilter}><Plus size={14} /> Filtre ekle</button></div>
        {definition.filters.map((filter, index) => { const field = columnMap.get(filter.field); return <div className="report-filter-row" key={index}><select aria-label="Filtre alanı" value={filter.field} onChange={e => { const selected = columnMap.get(e.target.value); setFilter(index, { field: e.target.value, operator: operatorsFor(selected)[0], value: '' }) }}>{columns.map(x => <option value={x.code} key={x.code}>{x.label}</option>)}</select><select aria-label="Filtre operatörü" value={filter.operator} onChange={e => setFilter(index, { operator: e.target.value, ...(e.target.value === 'isNull' ? { value: '' } : {}) })}>{operatorsFor(field).map(op => <option value={op} key={op}>{({ contains: 'İçerir', equals: 'Eşittir', gt: 'Büyüktür', gte: 'En az', lt: 'Küçüktür', lte: 'En çok', isNull: 'Boş' } as Record<string, string>)[op]}</option>)}</select>{filter.operator === 'isNull' ? <input type="text" disabled value="" placeholder="Boş değer" /> : valueInput(field, filter.value, value => setFilter(index, { value }))}<button className="report-delete-filter" aria-label="Filtreyi kaldır" onClick={() => update({ filters: definition.filters.filter((_, i) => i !== index) })}><Trash2 size={15} /></button></div> })}
      </div>
      <div className="report-builder-footer"><label>{isList ? 'Liste adı' : 'Rapor adı'}<input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder={isList ? 'Örn. Açık satın alma talepleri' : 'Örn. Aktif müşteriler'} disabled={!admin || !!drilldownBase} /></label><div><button className="primary" disabled={busy || definition.columns.length === 0 || definition.filters.some(x => x.operator !== 'isNull' && !x.value.trim())} onClick={() => void run(1)}><Play size={15} />{busy ? 'Çalıştırılıyor…' : isList ? 'Listeyi görüntüle' : 'Raporu çalıştır'}</button>{admin && <button className="secondary" disabled={busy || !!drilldownBase || !name.trim() || definition.columns.length === 0} onClick={() => void save()}><Save size={15} />{selectedId ? 'Değişiklikleri kaydet' : isList ? 'Listeyi kaydet' : 'Raporu kaydet'}</button>}</div></div>
      <div className="report-security-note">Yalnızca katalogdaki alanlar sorgulanır. Kayıtlar aktif tenant ile filtrelenir; liste/rapor çalıştırmaları ve tanım değişiklikleri audit kaydına yazılır.</div>
      {result && <section className="report-result">
        <div className="report-result-heading"><div><h3>{drilldownBase ? 'Grup ayrıntıları' : 'Sonuçlar'}</h3><p>{isGrouped ? `${(result.totalGroups ?? 0).toLocaleString('tr-TR')} grup · ${result.totalCount.toLocaleString('tr-TR')} kayıt · sayfa ${result.page}` : `${result.totalCount.toLocaleString('tr-TR')} kayıt · sayfa ${result.page}`}</p></div><div className="report-result-actions">{drilldownBase && <button className="secondary small-button" onClick={returnToGroups} disabled={busy}><ArrowLeft size={14} /> Gruplara dön</button>}<button className="secondary small-button" onClick={() => void exportCsv()} disabled={busy || (!result.rows.length && !result.groups?.length)}><Download size={14} /> CSV indir</button></div></div>
        <div className="report-table-wrap"><table><thead><tr>{isGrouped ? <>{resultGroupingFields.map(field => <th key={field}>{columns.find(c => c.code === field)?.label ?? field}</th>)}<th>Kayıt sayısı</th>{result.aggregate !== 'count' && <th>{source?.aggregates.find(option => option.code === result.aggregate)?.label ?? 'Değer'}</th>}</> : result.columns.map(c => <th key={c.code}>{c.label}</th>)}</tr></thead><tbody>
          {isGrouped ? (result.groups ?? []).map((group, index) => { const values = group.groupValues ?? [group.groupValue]; return <tr key={index}>{resultGroupingFields.map((field, fieldIndex) => { const value = values[fieldIndex]; return <td key={field}>{value === undefined ? '—' : <button type="button" className="report-group-drill" onClick={() => drillIntoGroup(values)} title="Bu grubun kayıt ayrıntılarını aç">{groupValue(value, field)}</button>}</td>})}<td>{group.rowCount.toLocaleString('tr-TR')}</td>{result.aggregate !== 'count' && <td>{group.value?.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) ?? '—'}</td>}</tr> }) : result.rows.map((row, index) => <tr key={index}>{result.columns.map(c => <td key={c.code}>{typeof row[c.code] === 'boolean' ? row[c.code] ? 'Aktif' : 'Pasif' : row[c.code] === null ? '—' : c.dataType === 'date' && row[c.code] ? new Date(String(row[c.code])).toLocaleDateString('tr-TR') : String(row[c.code])}</td>)}</tr>)}
          {(isGrouped ? !result.groups?.length : !result.rows.length) && <tr><td colSpan={isGrouped ? resultGroupingFields.length + 1 + (result.aggregate === 'count' ? 0 : 1) : Math.max(result.columns.length, 1)} className="report-empty">Filtreye uygun kayıt bulunamadı.</td></tr>}
        </tbody></table></div>
        <div className="report-pagination"><span>{isGrouped ? `${result.totalGroups ? (result.page - 1) * result.pageSize + 1 : 0}–${Math.min(result.page * result.pageSize, result.totalGroups ?? 0)} / ${result.totalGroups ?? 0} grup` : result.totalCount ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.totalCount)} / ${result.totalCount}` : '0 kayıt'}</span><div><button className="secondary small-button" disabled={busy || result.page <= 1} onClick={() => void run(result.page - 1)}>Önceki</button><button className="secondary small-button" disabled={busy || result.page * result.pageSize >= (isGrouped ? result.totalGroups ?? 0 : result.totalCount)} onClick={() => void run(result.page + 1)}>Sonraki</button></div></div>
      </section>}
    </section>
    <aside className="report-saved panel"><div className="report-section-heading"><div><p className="eyebrow">{isList ? 'KAYITLI LİSTELER' : 'KAYITLI RAPORLAR'}</p><h2>{isList ? 'Ekibinizin listeleri' : 'Ekibinizin raporları'}</h2><small>{saved.length} {isList ? 'liste' : 'rapor'}</small></div><button className="secondary small-button" onClick={() => void refresh().catch(e => setError((e as Error).message))}>Yenile</button></div>{saved.length ? saved.map(report => <article className={`saved-report ${selectedId === report.id ? 'selected' : ''}`} key={report.id}><button className="saved-report-open" title={`${report.name} öğesini aç ve çalıştır`} disabled={busy} onClick={() => void openReport(report)}><b>{report.name}</b><small>{sources.find(x => x.code === report.source)?.label ?? report.source} · Aç ve çalıştır · {new Date(report.updatedAt).toLocaleDateString('tr-TR')}</small></button>{admin && <button className="report-delete-saved" title={isList ? 'Listeyi sil' : 'Raporu sil'} disabled={busy} onClick={() => void remove(report)}><Trash2 size={15} /></button>}</article>) : <div className="report-empty-state">Henüz kayıtlı {isList ? 'liste' : 'rapor'} yok.{admin ? ` Bir ${isList ? 'liste' : 'rapor'} tasarlayıp kaydedin.` : ' Yöneticinizden görünüm paylaşmasını isteyin.'}</div>}</aside></div>
  </div>
}
