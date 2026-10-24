import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, LayoutDashboard, Plus, RefreshCw, Trash2 } from 'lucide-react'
import './dashboard-widgets.css'

type SavedReport = { id: string; name: string; source: string }
type Widget = { id: string; savedReportId: string; name: string; source: string; position: number; createdAt: string }
type ReportColumn = { code: string; label: string }
type Group = { groupValue: unknown; groupValues?: unknown[]; rowCount: number; value: number | null }
type ReportResult = { columns: ReportColumn[]; rows: Record<string, unknown>[]; groups: Group[]; aggregate: string | null }

async function request<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; title?: string } | null
    throw new Error(body?.error || body?.title || `İstek başarısız (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function display(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
  if (typeof value === 'number') return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)
  return String(value)
}

export default function DashboardWidgets({ token, role }: { token: string; role: string }) {
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
      const result = await request<ReportResult>(token, `/api/reports/${widget.savedReportId}/run`, {
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
        request<Widget[]>(token, '/api/dashboard/widgets/'),
        request<SavedReport[]>(token, '/api/reports/')
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
      await request<Widget>(token, '/api/dashboard/widgets/', { method: 'POST', body: JSON.stringify({ savedReportId: selectedReport }) })
      setSelectedReport('')
      await load()
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  async function removeWidget(widget: Widget) {
    setBusy(true); setError('')
    try {
      await request<void>(token, `/api/dashboard/widgets/${widget.id}`, { method: 'DELETE' })
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
      await request<string[]>(token, '/api/dashboard/widgets/order', { method: 'PUT', body: JSON.stringify({ widgetIds: ordered.map(item => item.id) }) })
      await load()
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const ordered = [...widgets].sort((a, b) => a.position - b.position)
  const availableReports = reports.filter(report => !widgets.some(widget => widget.savedReportId === report.id))

  return <section className="dashboard-widgets">
    <div className="dashboard-widgets-heading">
      <div><p className="eyebrow">KİŞİSELLEŞTİRİLEBİLİR GÖRÜNÜM</p><h2>Dashboard widget’ları</h2><p className="muted">Kayıtlı raporları firmanızın ana ekranına ekleyin ve sıralayın.</p></div>
      {canEdit && <div className="dashboard-widget-add"><select aria-label="Dashboard'a eklenecek rapor" value={selectedReport} onChange={e => setSelectedReport(e.target.value)} disabled={busy || availableReports.length === 0}>
        <option value="">{availableReports.length ? 'Kayıtlı rapor seçin' : 'Eklenecek rapor yok'}</option>
        {availableReports.map(report => <option key={report.id} value={report.id}>{report.name}</option>)}
      </select><button className="primary small-button" onClick={() => void addWidget()} disabled={busy || !selectedReport}><Plus size={15}/> Widget ekle</button></div>}
    </div>
    {error && <div className="dashboard-widget-error" role="alert">{error}</div>}
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
          </div> : isGrouped ? <div className="dashboard-widget-table-wrap"><table><thead><tr><th>Grup</th><th>Kayıt</th><th>Toplam</th></tr></thead><tbody>{preview.groups.slice(0, 5).map((group, rowIndex) => <tr key={rowIndex}><td>{(group.groupValues ?? [group.groupValue]).map(display).join(' · ')}</td><td>{display(group.rowCount)}</td><td>{display(group.value)}</td></tr>)}</tbody></table></div> : <div className="dashboard-widget-table-wrap"><table><thead><tr>{columns.map(column => <th key={column.code}>{column.label}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{columns.map(column => <td key={column.code}>{display(row[column.code])}</td>)}</tr>)}</tbody></table></div>}
        </article>
      })}</div>}
  </section>
}
