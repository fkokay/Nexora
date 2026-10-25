import AdvancedDataGrid from './AdvancedDataGrid'
import { useEffect, useRef, useState } from 'react'
import { Activity, Boxes, ChevronDown, ChevronUp, LayoutDashboard, Plus, RefreshCw, ShoppingCart, Trash2, TrendingUp } from 'lucide-react'
import './dashboard-widgets.css'

type SavedReport = { id: string; name: string; source: string }
type Widget = { id: string; savedReportId: string; name: string; source: string; position: number; createdAt: string }
type ReportColumn = { code: string; label: string }
type Group = { groupValue: unknown; groupValues?: unknown[]; rowCount: number; value: number | null }
type ReportResult = { columns: ReportColumn[]; rows: Record<string, unknown>[]; groups: Group[]; aggregate: string | null }

function display(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (typeof value === 'number') return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)
  return String(value)
}

type InsightRow = { label: string; count: number; value: string; amount: number }
function insightRows(result: ReportResult | undefined): InsightRow[] {
  if (!result) return []
  if (result.groups.length) return result.groups.slice(0, 6).map((group, index) => {
    const groupValue = (group.groupValues ?? [group.groupValue]).map(display).filter(Boolean).join(' · ')
    const amount = typeof group.value === 'number' && Number.isFinite(group.value) ? Math.abs(group.value) : group.rowCount
    return { label: groupValue || `Grup ${index + 1}`, count: group.rowCount, value: group.value == null ? `${group.rowCount} kayıt` : display(group.value), amount }
  })
  const labelCodes = /date|period|month|year|quarter|warehouse|category|name|status|code|group/i
  return result.rows.slice(0, 6).map((row, index) => {
    const labelColumn = result.columns.find(column => labelCodes.test(column.code)) ?? result.columns[0]
    const numericColumn = result.columns.find(column => typeof row[column.code] === 'number')
    const rawLabel = labelColumn ? row[labelColumn.code] : undefined
    const label = rawLabel == null || rawLabel === '' ? `Kayıt ${index + 1}` : display(rawLabel)
    const rawValue = numericColumn ? row[numericColumn.code] : null
    const amount = typeof rawValue === 'number' && Number.isFinite(rawValue) ? Math.abs(rawValue) : 1
    return { label, count: 1, value: rawValue == null ? '1 kayıt' : display(rawValue), amount }
  })
}

export default function DashboardWidgets({ token, role, requestApi }: {
  token: string
  role: string
  requestApi: <T>(url: string, token?: string, init?: RequestInit) => Promise<T>
}) {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [reports, setReports] = useState<SavedReport[]>([])
  const [previews, setPreviews] = useState<Record<string, ReportResult>>({})
  const [previewStatus, setPreviewStatus] = useState<Record<string, 'loading' | 'error'>>({})
  const previewRequestSequence = useRef<Record<string, number>>({})
  const [selectedReport, setSelectedReport] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canEdit = role === 'TenantAdmin'

  async function loadPreview(widget: Widget) {
    const requestSequence = (previewRequestSequence.current[widget.id] ?? 0) + 1
    previewRequestSequence.current[widget.id] = requestSequence
    setPreviewStatus(current => ({ ...current, [widget.id]: 'loading' }))
    try {
      const result = await requestApi<ReportResult>(`/api/reports/${widget.savedReportId}/run`, token, {
        method: 'POST', body: JSON.stringify({ page: 1, pageSize: 5 })
      })
      if (previewRequestSequence.current[widget.id] !== requestSequence) return
      setPreviews(current => ({ ...current, [widget.id]: result }))
      setPreviewStatus(current => {
        const next = { ...current }
        delete next[widget.id]
        return next
      })
    } catch {
      if (previewRequestSequence.current[widget.id] !== requestSequence) return
      setPreviews(current => {
        const next = { ...current }
        delete next[widget.id]
        return next
      })
      setPreviewStatus(current => ({ ...current, [widget.id]: 'error' }))
    }
  }

  async function load() {
    setBusy(true)
    setError('')
    try {
      const [nextWidgets, savedReports] = await Promise.all([
        requestApi<Widget[]>('/api/dashboard/widgets/', token),
        requestApi<SavedReport[]>('/api/reports/', token)
      ])
      setWidgets(nextWidgets)
      setReports(savedReports)
      setPreviews({})
      setPreviewStatus(Object.fromEntries(nextWidgets.map(widget => [widget.id, 'loading' as const])))
      await Promise.all(nextWidgets.map(loadPreview))
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  useEffect(() => { void load() }, [token])

  async function addWidget() {
    if (!selectedReport) return
    setBusy(true); setError('')
    try {
      await requestApi<Widget>('/api/dashboard/widgets/', token, { method: 'POST', body: JSON.stringify({ savedReportId: selectedReport }) })
      setSelectedReport('')
      await load()
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  async function removeWidget(widget: Widget) {
    setBusy(true); setError('')
    try {
      await requestApi<void>(`/api/dashboard/widgets/${widget.id}`, token, { method: 'DELETE' })
      await load()
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  async function moveWidget(widget: Widget, offset: number) {
    const ordered = [...widgets].sort((a, b) => a.position - b.position)
    const index = ordered.findIndex(item => item.id === widget.id)
    const target = index + offset
    if (target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setBusy(true); setError('')
    try {
      await requestApi<string[]>('/api/dashboard/widgets/order', token, { method: 'PUT', body: JSON.stringify({ widgetIds: ordered.map(item => item.id) }) })
      await load()
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const ordered = [...widgets].sort((a, b) => a.position - b.position)
  const availableReports = reports.filter(report => !widgets.some(widget => widget.savedReportId === report.id))
  const insightPanels = [
    { key: 'sales', title: 'Satış eğilimi', note: 'Satış raporlarındaki mevcut gruplar', icon: TrendingUp, sources: ['salesOrders', 'salesInvoices', 'salesQuotes', 'salesDeliveries', 'salesReturns'] },
    { key: 'purchases', title: 'Satın alma eğilimi', note: 'Satın alma raporlarındaki mevcut gruplar', icon: ShoppingCart, sources: ['purchaseOrders', 'purchaseInvoices', 'purchaseReceipts', 'purchaseRequests', 'purchaseSupplierQuotes', 'supplierReturns'] },
    { key: 'stock', title: 'Stok dağılımı', note: 'Stok ve depo raporlarındaki mevcut gruplar', icon: Boxes, sources: ['warehouseStock', 'stockItems', 'inventoryTransactions', 'inventoryTransfers'] },
  ] as const
  const reportRowCount = Object.values(previews).reduce((total, preview) => total + preview.rows.length + preview.groups.length, 0)
  const previewErrors = Object.values(previewStatus).filter(value => value === 'error').length

  function focusAddWidget() {
    const selector = document.querySelector<HTMLSelectElement>('.dashboard-widget-add select')
    selector?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    selector?.focus({ preventScroll: true })
  }

  return <section className="dashboard-widgets">
    <div className="dashboard-widgets-heading">
      <div><p className="eyebrow">KİŞİSELLEŞTİRİLEBİLİR GÖRÜNÜM</p><h2>Dashboard widget’ları</h2><p className="muted">Kayıtlı raporları firmanızın ana ekranına ekleyin ve sıralayın.</p></div>
      {canEdit && <div className="dashboard-widget-add"><select aria-label="Dashboard'a eklenecek rapor" value={selectedReport} onChange={e => setSelectedReport(e.target.value)} disabled={busy || availableReports.length === 0}>
        <option value="">{availableReports.length ? 'Kayıtlı rapor seçin' : 'Eklenecek rapor yok'}</option>
        {availableReports.map(report => <option key={report.id} value={report.id}>{report.name}</option>)}
      </select><button className="primary small-button" onClick={() => void addWidget()} disabled={busy || !selectedReport}><Plus size={15}/> Widget ekle</button></div>}
    </div>
    <div className="dashboard-commandbar"><div className="dashboard-commandbar-label"><span>ÇALIŞMA ALANI ÖZETİ</span><b>{busy ? 'Raporlar güncelleniyor…' : `${ordered.length} widget · ${reports.length} kayıtlı rapor`}</b></div><div className="dashboard-quick-actions"><span>Hızlı işlemler</span><button type="button" className="secondary small-button" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Yenile</button>{canEdit&&<button type="button" className="secondary small-button" onClick={focusAddWidget} disabled={busy||availableReports.length===0}><Plus size={14}/> Rapor widget’ı ekle</button>}</div></div>
    <section className="dashboard-kpis" aria-label="Dashboard göstergeleri" aria-live="polite"><article><span>Dashboard widget’ı</span><b>{ordered.length}<small> / 12</small></b><i><LayoutDashboard size={16}/></i></article><article><span>Kayıtlı rapor</span><b>{reports.length}</b><i><Activity size={16}/></i></article><article><span>Görüntülenen veri grubu</span><b>{reportRowCount}</b><i><TrendingUp size={16}/></i></article><article className={previewErrors?'has-errors':''}><span>Önizleme sorunu</span><b>{previewErrors}</b><i><RefreshCw size={16}/></i></article></section>
    {error && <div className="dashboard-widget-error" role="alert">{error}</div>}
    {ordered.length>0&&<section className="dashboard-insights" aria-label="Satış, satın alma ve stok özeti">{insightPanels.map(panel=>{const sources=ordered.filter(widget=>panel.sources.some(source=>source===widget.source));const entries=sources.flatMap(widget=>insightRows(previews[widget.id]).map(row=>({...row,widgetName:widget.name,widgetId:widget.id})));const maxValue=Math.max(1,...entries.map(row=>row.amount));return <article className={`dashboard-insight-panel ${panel.key}`} key={panel.key}><header><span className="dashboard-insight-icon"><panel.icon size={17}/></span><div><h3>{panel.title}</h3><small>{panel.note}</small></div><b className="dashboard-insight-count">{sources.length}</b></header>{sources.length===0?<div className="dashboard-insight-empty">Bu alana ait rapor widget’ı eklenmemiş.</div>:entries.length===0?<div className="dashboard-insight-empty">{sources.some(widget=>previewStatus[widget.id]==='loading')?'Rapor verisi yükleniyor…':sources.some(widget=>previewStatus[widget.id]==='error')?'Rapor önizlemesi alınamadı. Widget kartındaki yeniden dene eylemini kullanın.':'Seçili raporlarda gösterilecek veri yok.'}</div>:<div className="dashboard-insight-rows">{entries.slice(0,6).map((row,index)=><div className="dashboard-insight-row" key={`${row.widgetId}-${row.label}-${index}`}><div className="dashboard-insight-row-copy"><span title={row.label}>{row.label}</span><small>{row.widgetName} · {row.count} kayıt</small></div><b>{row.value}</b><i><span style={{width:`${Math.max(5,Math.round(row.amount/maxValue*100))}%`}}/></i></div>)}</div>}<small className="dashboard-insight-footnote">Görünüm kayıtlı raporun filtre ve gruplamasını izler; değerler yeni bir toplama hesabı değildir.</small></article>})}</section>}
    {ordered.length === 0 ? <div className="dashboard-widget-empty"><LayoutDashboard size={20}/><div><b>Henüz dashboard widget’ı yok</b><span>Önce Rapor oluşturucu’da bir rapor kaydedin, ardından bu alandan ekleyin.</span></div></div> :
      <div className="dashboard-widget-grid">{ordered.map((widget, index) => {
        const preview = previews[widget.id]
        const isGrouped = Boolean(preview?.groups?.length)
        const columns = preview?.columns ?? []
        return <article className="dashboard-widget panel" key={widget.id}>
          <header><div className="dashboard-widget-title"><span className="dashboard-widget-icon"><LayoutDashboard size={16}/></span><div><h3>{widget.name}</h3><small>{widget.source} · Rapor özeti</small></div></div>
            {canEdit && <div className="dashboard-widget-actions"><button className="icon-button" title="Yukarı taşı" aria-label={`${widget.name} widget'ını yukarı taşı`} disabled={busy || index === 0} onClick={() => void moveWidget(widget, -1)}><ChevronUp size={17}/></button><button className="icon-button" title="Aşağı taşı" aria-label={`${widget.name} widget'ını aşağı taşı`} disabled={busy || index === ordered.length - 1} onClick={() => void moveWidget(widget, 1)}><ChevronDown size={17}/></button><button className="icon-button danger" title="Widget'ı kaldır" aria-label={`${widget.name} widget'ını kaldır`} disabled={busy} onClick={() => void removeWidget(widget)}><Trash2 size={16}/></button></div>}
          </header>
          {!preview ? <div className="dashboard-widget-preview-empty" role={previewStatus[widget.id] === 'error' ? 'alert' : 'status'}>
            <span>{previewStatus[widget.id] === 'loading' ? 'Rapor verisi yükleniyor…' : 'Bu widget’ın rapor verisi alınamadı. Yeniden deneyin.'}</span>
            {previewStatus[widget.id] === 'error' && <button className="dashboard-widget-retry" type="button" onClick={() => void loadPreview(widget)}><RefreshCw size={14}/> Tekrar dene</button>}
          </div> : isGrouped ? <div className="dashboard-widget-table-wrap"><AdvancedDataGrid><thead><tr><th>Grup</th><th>Kayıt</th><th>Toplam</th></tr></thead><tbody>{preview.groups.slice(0, 5).map((group, rowIndex) => <tr key={rowIndex}><td>{(group.groupValues ?? [group.groupValue]).map(display).join(' · ')}</td><td>{display(group.rowCount)}</td><td>{display(group.value)}</td></tr>)}</tbody></AdvancedDataGrid></div> : <div className="dashboard-widget-table-wrap"><AdvancedDataGrid><thead><tr>{columns.map(column => <th key={column.code}>{column.label}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{columns.map(column => <td key={column.code}>{display(row[column.code])}</td>)}</tr>)}</tbody></AdvancedDataGrid></div>}
        </article>
      })}</div>}
  </section>
}
