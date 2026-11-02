import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './authApi';
import './custom-menus.css'
import type { Entry, Target } from './custom-menus/types'
import { CustomMenuSummary } from './custom-menus/components/CustomMenuSummary'
import { CustomMenuEditor } from './custom-menus/components/CustomMenuEditor'
import { CustomMenuList } from './custom-menus/components/CustomMenuList'
import { CustomMenuInspector } from './custom-menus/components/CustomMenuInspector'

export function TenantCustomMenuNavigation({ token, page, onSelect }: { token: string; page: string; onSelect: (page: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  useEffect(() => {
    let active = true
    void authenticatedFetch('/api/custom-menus/', token, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => response.ok ? response.json() as Promise<Entry[]> : [])
      .then(items => { if (active) setEntries(items) })
      .catch(() => { if (active) setEntries([]) })
    return () => { active = false }
  }, [token])
  if (entries.length === 0) return null
  return <><div className="side-label custom-menu-label">ÖZEL MENÜLER</div><nav aria-label="Özel menüler">
    {entries.map(entry => <button key={entry.id} title={entry.targetLabel} className={`nav-item ${page === entry.targetPage ? 'active' : ''}`} onClick={() => onSelect(entry.targetPage)}>
      <span className="custom-menu-dot" aria-hidden="true"/>{entry.label}
    </button>)}
  </nav></>
}

export default function CustomMenusPage({ token, role }: { token: string; role: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [editing, setEditing] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [targetPage, setTargetPage] = useState('customers')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const admin = role === 'TenantAdmin'
  const selectedEntry = entries.find(entry => entry.id === selectedId) ?? entries[0] ?? null

  const request = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await authenticatedFetch(url, token, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; title?: string; errors?: Record<string, string[]> } | null
      throw new Error(body?.error || Object.values(body?.errors ?? {}).flat().join(' ') || body?.title || `İstek başarısız (${response.status})`)
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }, [token])

  const refresh = useCallback(async () => {
    const [nextEntries, nextTargets] = await Promise.all([request<Entry[]>('/api/custom-menus/'), request<Target[]>('/api/custom-menus/targets')])
    setEntries(nextEntries); setTargets(nextTargets)
  }, [request])
  useEffect(() => { void refresh().catch(e => setError((e as Error).message)) }, [refresh])

  function reset() { setEditing(''); setCode(''); setLabel(''); setTargetPage(targets[0]?.page ?? 'customers') }
  function startEdit(entry: Entry) { setEditing(entry.id); setCode(entry.code); setLabel(entry.label); setTargetPage(entry.targetPage); setError(''); setNotice('') }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await request<Entry>(editing ? `/api/custom-menus/${editing}` : '/api/custom-menus/', {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify({ code, label, targetPage })
      })
      await refresh(); reset(); setNotice(editing ? 'Menü öğesi güncellendi.' : 'Menü öğesi oluşturuldu.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`“${entry.label}” menü öğesi silinsin mi?`)) return
    setBusy(true); setError(''); setNotice('')
    try { await request<void>(`/api/custom-menus/${entry.id}`, { method: 'DELETE' }); await refresh(); if (editing === entry.id) reset(); setNotice('Menü öğesi silindi.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function move(index: number, offset: number) {
    const next = [...entries]; const target = index + offset
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusy(true); setError(''); setNotice('')
    try { await request<string[]>('/api/custom-menus/order', { method: 'PUT', body: JSON.stringify({ entryIds: next.map(item => item.id) }) }); await refresh() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return <div className="custom-menus-page">
    <CustomMenuSummary entryCount={entries.length} targetCount={targets.length}/>
    {error && <div className="custom-menu-alert error" role="alert">{error}</div>}{notice && <div className="custom-menu-alert success" role="status">{notice}</div>}
    <div className="custom-menu-layout">
      <CustomMenuEditor admin={admin} busy={busy} editing={Boolean(editing)} code={code} label={label} targetPage={targetPage} targets={targets} entryCount={entries.length} onSubmit={event => void save(event)} onCodeChange={value => setCode(value.toLowerCase())} onLabelChange={setLabel} onTargetChange={setTargetPage} onReset={reset}/>
      <CustomMenuList entries={entries} selectedId={selectedEntry?.id ?? ''} admin={admin} busy={busy} editing={Boolean(editing)} canAdd={entries.length < 30} onSelect={setSelectedId} onMove={(index, offset) => void move(index, offset)} onEdit={startEdit} onRemove={entry => void remove(entry)} onAdd={() => { setTargetPage(targets[0]?.page ?? 'customers'); document.querySelector('.custom-menu-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}/>
      <CustomMenuInspector entry={selectedEntry} entryIndex={selectedEntry ? entries.findIndex(entry => entry.id === selectedEntry.id) : -1} admin={admin} onEdit={startEdit}/>
    </div>
  </div>
}
