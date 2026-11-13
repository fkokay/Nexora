import { useEffect, useMemo, useRef, useState } from 'react'
import { Columns3, Download, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { localDateString } from '../lib/api'
import type { DocColumn, DocKey, DocumentDefinition } from './definitions'
import { formatDate, formatMoney } from './format'
import { countTabs, filterRows, paginate, sumByCurrency, toCsv } from './listLogic'
import { loadHiddenColumns, loadViews, saveHiddenColumns, saveViews, type DocScope, type SavedView } from './storage'
import { StatusPill } from './DocumentShell'

const pageSize = 25
const attentionTabs = new Set(['late', 'overdue', 'expiring'])

export type PreviewRenderer<T> = (row: T, helpers: { open: () => void; close: () => void }) => React.ReactNode

type Props<T> = {
  definition: DocumentDefinition<T>
  token: string
  scope: DocScope
  reloadKey: number
  onOpen: (id: string) => void
  onNavigate: (key: DocKey, id: string) => void
  onCreate: () => void
  renderPreview: PreviewRenderer<T>
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function DocumentListPage<T>({ definition, token, scope, reloadKey, onOpen, onNavigate, onCreate, renderPreview }: Props<T>) {
  const today = localDateString()
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tabKey, setTabKey] = useState('all')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hidden, setHidden] = useState<string[]>(() => loadHiddenColumns(scope))
  const [views, setViews] = useState<SavedView[]>(() => loadViews(scope))
  const [menu, setMenu] = useState<'columns' | 'views' | null>(null)
  const [viewName, setViewName] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    definition.load(token)
      .then(items => { if (active) setRows(items) })
      .catch(e => { if (active) setError((e as Error).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [definition, token, reloadKey])

  const columns = useMemo<(DocColumn<T> & { fixed?: boolean })[]>(() => [
    { key: 'date', label: 'Tarih', render: row => formatDate(definition.date(row)) },
    { key: 'party', label: definition.partyLabel, render: row => definition.party(row) ?? '—' },
    { key: 'source', label: 'Kaynak belge', render: row => definition.source(row)?.label ?? '—' },
    ...definition.extraColumns,
    { key: 'amount', label: 'Tutar', align: 'right', render: row => { const amount = definition.amount(row); return amount === null ? '—' : formatMoney(amount, definition.currency(row)) } },
  ], [definition])
  const visibleColumns = columns.filter(column => !hidden.includes(column.key))

  const counts = useMemo(() => countTabs(rows, definition.tabs, today), [rows, definition, today])
  const activeTab = definition.tabs.find(tab => tab.key === tabKey) ?? definition.tabs[0]
  const filtered = useMemo(
    () => filterRows(rows, { tab: activeTab, query, from, to, today, searchText: definition.searchText, date: definition.date }),
    [rows, activeTab, query, from, to, today, definition],
  )
  const paged = paginate(filtered, page, pageSize)
  const totals = sumByCurrency(filtered, definition.amount, definition.currency)
  const selected = selectedId ? rows.find(row => definition.id(row) === selectedId) ?? null : null
  const filtering = !!query || !!from || !!to || activeTab.key !== 'all'

  useEffect(() => { setPage(1) }, [tabKey, query, from, to])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { if (menu) setMenu(null); else if (selectedId) setSelectedId(null); return }
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); onCreate(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!paged.items.length) return
        event.preventDefault()
        const index = paged.items.findIndex(row => definition.id(row) === selectedId)
        const next = event.key === 'ArrowDown' ? Math.min(paged.items.length - 1, index + 1) : Math.max(0, index < 0 ? 0 : index - 1)
        setSelectedId(definition.id(paged.items[next]))
        return
      }
      if (event.key === 'Enter' && selectedId) { event.preventDefault(); onOpen(selectedId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, selectedId, paged.items, definition, onCreate, onOpen])

  function toggleColumn(key: string) {
    const next = hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key]
    setHidden(next); saveHiddenColumns(scope, next)
  }
  function saveView(event: React.FormEvent) {
    event.preventDefault()
    const name = viewName.trim()
    if (!name) return
    const next = [...views.filter(view => view.name !== name), { id: crypto.randomUUID(), name, tab: activeTab.key, query, from, to }]
    setViews(next); saveViews(scope, next); setViewName('')
  }
  function applyView(view: SavedView) { setTabKey(view.tab); setQuery(view.query); setFrom(view.from); setTo(view.to); setMenu(null) }
  function removeView(id: string) { const next = views.filter(view => view.id !== id); setViews(next); saveViews(scope, next) }
  function clearFilters() { setTabKey('all'); setQuery(''); setFrom(''); setTo('') }
  function exportCsv() {
    const headers = ['Belge no', ...columns.map(column => column.label), 'Durum']
    const data = filtered.map(row => [definition.code(row), ...columns.map(column => column.render(row)), definition.status(row).label])
    const url = URL.createObjectURL(new Blob([toCsv(headers, data)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${definition.key}-${today}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="doc-page">
    <div className="doc-head">
      <div>
        <p className="eyebrow">{definition.side === 'sales' ? 'SATIŞ' : 'SATINALMA'}</p>
        <h1>{definition.title}</h1>
        <p>{definition.description}</p>
      </div>
      <div className="doc-actions">
        <button className="secondary" onClick={exportCsv} disabled={!filtered.length} title="Görünen kayıtları Excel'e aktar"><Download size={15}/> Excel</button>
        <div className="doc-popover-wrap">
          <button className="secondary" onClick={() => setMenu(menu === 'columns' ? null : 'columns')} aria-expanded={menu === 'columns'}><Columns3 size={15}/> Sütunlar</button>
          {menu === 'columns' && <div className="doc-popover" role="menu">
            {columns.map(column => <label key={column.key}><input type="checkbox" checked={!hidden.includes(column.key)} onChange={() => toggleColumn(column.key)}/> {column.label}</label>)}
            <small>Belge no ve durum her zaman görünür.</small>
          </div>}
        </div>
        <button className="primary" onClick={onCreate}><Plus size={16}/> {definition.createLabel} <span className="doc-kbd">N</span></button>
      </div>
    </div>

    {error && <div className="alert inline-alert">{error}<button onClick={() => setError('')} aria-label="Kapat"><X size={15}/></button></div>}

    <div className="doc-tabs" role="tablist">
      {definition.tabs.map(tab => <button key={tab.key} role="tab" aria-selected={tab.key === activeTab.key}
        className={`doc-chip${tab.key === activeTab.key ? ' active' : ''}${attentionTabs.has(tab.key) && counts[tab.key] > 0 ? ' attention' : ''}`}
        onClick={() => setTabKey(tab.key)}>{tab.label} <b>{counts[tab.key] ?? 0}</b></button>)}
      <div className="doc-popover-wrap">
        <button className="doc-chip" onClick={() => setMenu(menu === 'views' ? null : 'views')} aria-expanded={menu === 'views'}><Star size={13}/> Kayıtlı görünümler{views.length > 0 && <b>{views.length}</b>}</button>
        {menu === 'views' && <div className="doc-popover" role="menu">
          {views.length === 0 && <small>Sık kullandığınız filtreyi adlandırıp saklayın. Görünümler bu tarayıcıda tutulur.</small>}
          {views.map(view => <div className="doc-popover-row" key={view.id}>
            <button onClick={() => applyView(view)}>{view.name}</button>
            <button className="icon-button" onClick={() => removeView(view.id)} aria-label={`${view.name} görünümünü sil`}><Trash2 size={14}/></button>
          </div>)}
          <form onSubmit={saveView}>
            <input className="doc-input" value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Geçerli filtreye ad verin" maxLength={40} aria-label="Görünüm adı"/>
            <button className="secondary small-button" disabled={!viewName.trim()}>Kaydet</button>
          </form>
        </div>}
      </div>
    </div>

    <div className="doc-toolbar">
      <label className="doc-search"><Search size={15}/>
        <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Belge no veya ${definition.partyLabel.toLocaleLowerCase('tr-TR')} ara`} aria-label="Ara"/>
        <span className="doc-kbd">/</span>
      </label>
      <input className="doc-input" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="Başlangıç tarihi" title="Başlangıç tarihi"/>
      <input className="doc-input" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="Bitiş tarihi" title="Bitiş tarihi"/>
      {filtering && <button className="doc-text-button" onClick={clearFilters}>Filtreleri temizle</button>}
    </div>

    <div className={`doc-split${selected ? ' with-preview' : ''}`}>
      <div>
        <div className="doc-table-wrap">
          {loading ? <div className="doc-loading">{definition.title} yükleniyor…</div>
            : filtered.length === 0 ? <div className="doc-empty">
              <b>{filtering ? 'Bu filtreyle eşleşen kayıt yok' : definition.title}</b>
              <span>{filtering ? 'Aramayı veya filtreleri değiştirin.' : definition.emptyText}</span>
              {filtering ? <button className="secondary" onClick={clearFilters}>Filtreleri temizle</button> : <button className="primary" onClick={onCreate}><Plus size={16}/> {definition.createLabel}</button>}
            </div>
            : <table className="doc-table doc-list">
              <thead><tr><th>Belge no</th>{visibleColumns.map(column => <th key={column.key} className={column.align === 'right' ? 'num' : undefined}>{column.label}</th>)}<th>Durum</th></tr></thead>
              <tbody>{paged.items.map(row => {
                const id = definition.id(row), source = definition.source(row)
                return <tr key={id} className={id === selectedId ? 'selected' : undefined} onClick={() => setSelectedId(id)} onDoubleClick={() => onOpen(id)}>
                  <td><span className="doc-code">{definition.code(row)}</span></td>
                  {visibleColumns.map(column => <td key={column.key} className={column.align === 'right' ? 'num' : undefined}>
                    {column.key === 'source' && source?.target
                      ? <button className="doc-link" onClick={event => { event.stopPropagation(); onNavigate(source.target!.key, source.target!.id) }}>{source.label}</button>
                      : column.render(row)}
                  </td>)}
                  <td><StatusPill status={definition.status(row)}/></td>
                </tr>
              })}</tbody>
            </table>}
        </div>
        {!loading && filtered.length > 0 && <div className="doc-foot">
          <span><b>{paged.from}–{paged.to}</b> / {filtered.length} kayıt{totals.length > 0 && <> · toplam {totals.map(total => <b key={total.currency}> {formatMoney(total.total, total.currency)}</b>)}</>}</span>
          <span className="doc-pager">
            <span><span className="doc-kbd">↑</span> <span className="doc-kbd">↓</span> gezin · <span className="doc-kbd">Enter</span> aç</span>
            {paged.pageCount > 1 && <>
              <button onClick={() => setPage(paged.page - 1)} disabled={paged.page <= 1} aria-label="Önceki sayfa">‹</button>
              <span>{paged.page} / {paged.pageCount}</span>
              <button onClick={() => setPage(paged.page + 1)} disabled={paged.page >= paged.pageCount} aria-label="Sonraki sayfa">›</button>
            </>}
          </span>
        </div>}
      </div>
      {selected && <aside className="doc-preview" aria-label="Önizleme">
        <div className="doc-preview-head">
          <div><h3>{definition.code(selected)}</h3><span className="muted">{definition.singular}</span></div>
          <span className="doc-inline-actions"><StatusPill status={definition.status(selected)}/><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Önizlemeyi kapat"><X size={16}/></button></span>
        </div>
        <dl>
          <dt>Tarih</dt><dd>{formatDate(definition.date(selected))}</dd>
          <dt>{definition.partyLabel}</dt><dd>{definition.party(selected) ?? '—'}</dd>
          {definition.source(selected) && <><dt>Kaynak belge</dt><dd>{definition.source(selected)!.label}</dd></>}
          {definition.extraColumns.map(column => <span key={column.key} style={{ display: 'contents' }}><dt>{column.label}</dt><dd>{column.render(selected)}</dd></span>)}
          {definition.amount(selected) !== null && <><dt>Tutar</dt><dd><b>{formatMoney(definition.amount(selected)!, definition.currency(selected))}</b></dd></>}
        </dl>
        {renderPreview(selected, { open: () => onOpen(definition.id(selected)), close: () => setSelectedId(null) })}
      </aside>}
    </div>
  </div>
}
