import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowDown, ArrowUp, Edit2, Plus, Save, Trash2, X } from 'lucide-react'
import './custom-menus.css'

type Target = { page: string; label: string }
type Entry = { id: string; code: string; label: string; targetPage: string; targetLabel: string; position: number }

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
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [targetPage, setTargetPage] = useState('customers')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const admin = role === 'TenantAdmin'

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
    <div className="page-heading"><div><p className="eyebrow">TENANT UYARLAMA</p><h1>Özel menüler</h1><p className="muted">Kullanıcılarınız için ERP çalışma alanına kısayollar ekleyin ve sıralayın.</p></div><span className="custom-menu-count">{entries.length} / 30 öğe</span></div>
    {error && <div className="custom-menu-alert error" role="alert">{error}</div>}{notice && <div className="custom-menu-alert success" role="status">{notice}</div>}
    <div className="custom-menu-layout">
      <section className="panel custom-menu-editor"><div className="panel-heading"><div><h3>{editing ? 'Menüyü düzenle' : 'Yeni menü öğesi'}</h3><p>Hedef, yetkili ERP sayfa kataloğundan seçilir.</p></div>{editing && <button className="icon-button" onClick={reset} aria-label="Düzenlemeyi kapat"><X size={18}/></button>}</div>
        {admin ? <form onSubmit={save}>
          <label className="custom-menu-field">Menü kodu<input required maxLength={40} pattern="[a-z][a-z0-9_-]{0,39}" value={code} onChange={e => setCode(e.target.value.toLowerCase())} placeholder="depo-kisayolu"/><small>Küçük harfle başlar; harf, rakam, tire ve alt çizgi kullanılabilir.</small></label>
          <label className="custom-menu-field">Görünen ad<input required maxLength={80} value={label} onChange={e => setLabel(e.target.value)} placeholder="Depo yönetimi"/></label>
          <label className="custom-menu-field">ERP sayfası<select value={targetPage} onChange={e => setTargetPage(e.target.value)}>{targets.map(target => <option key={target.page} value={target.page}>{target.label}</option>)}</select></label>
          <div className="custom-menu-form-actions"><button className="primary" disabled={busy || entries.length >= 30 && !editing}><Save size={16}/>{busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Menü ekle'}</button>{editing && <button type="button" className="secondary" onClick={reset}>Vazgeç</button>}</div>
        </form> : <div className="custom-menu-readonly">Özel menüleri yalnız TenantAdmin düzenleyebilir. Mevcut menüler çalışma alanı kenar çubuğunda görünür.</div>}
      </section>
      <section className="panel custom-menu-list"><div className="panel-heading"><div><h3>Çalışma alanı menüsü</h3><p>{entries.length ? 'Sıra, bütün tenant kullanıcılarına uygulanır.' : 'Henüz özel menü öğesi eklenmedi.'}</p></div></div>
        {entries.map((entry, index) => <div className="custom-menu-entry" key={entry.id}><span className="custom-menu-entry-index">{String(index + 1).padStart(2, '0')}</span><div className="custom-menu-entry-copy"><b>{entry.label}</b><small>{entry.targetLabel} · <code>{entry.code}</code></small></div>{admin && <div className="custom-menu-entry-actions"><button className="icon-button" disabled={busy || index === 0} onClick={() => void move(index, -1)} aria-label="Yukarı taşı"><ArrowUp size={16}/></button><button className="icon-button" disabled={busy || index === entries.length - 1} onClick={() => void move(index, 1)} aria-label="Aşağı taşı"><ArrowDown size={16}/></button><button className="icon-button" disabled={busy} onClick={() => startEdit(entry)} aria-label="Düzenle"><Edit2 size={16}/></button><button className="icon-button danger" disabled={busy} onClick={() => void remove(entry)} aria-label="Sil"><Trash2 size={16}/></button></div>}</div>)}
        {admin && entries.length < 30 && !editing && <button className="custom-menu-add-row" onClick={() => { setTargetPage(targets[0]?.page ?? 'customers'); document.querySelector('.custom-menu-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><Plus size={16}/> Menü öğesi oluştur</button>}
      </section>
    </div>
  </div>
}
