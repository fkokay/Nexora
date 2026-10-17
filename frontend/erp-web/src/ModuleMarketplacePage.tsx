import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Boxes, Check, PackageOpen, Play, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'

type ModuleManifest = {
  moduleCode: string
  displayName: string
  version: string
  publisher: string
  minimumPlatformVersion: string
  dependencies: { moduleCode: string; minimumVersion: string }[]
  permissions: { code: string; description: string }[]
  menuEntries: { code: string; label: string; route: string; permissionCode: string; view?: ModuleMenuView | null }[]
}
type ModuleUiField = { code: string; label: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select'; required: boolean; options?: string[] | null; maxLength?: number | null }
type ModuleMenuView = { inputMode: 'json' | 'form'; inputFields: ModuleUiField[]; resultMode: 'json' | 'table'; resultColumns: ModuleUiField[]; dataCapabilities?: string[] | null }
type MarketplaceModule = {
  moduleCode: string
  version: string
  publisher: string
  artifactSha256: string
  publishedAt: string | null
  manifest: ModuleManifest | null
  isActivated: boolean
  activatedVersion: string | null
  runtimeStatus: string
}

type ActivatedModule = { moduleCode: string; version: string; manifest: ModuleManifest | string; runtimeStatus: string }
export type ModuleMenuSelection = { moduleCode: string; version: string; entry: ModuleManifest['menuEntries'][number] }

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; details?: string[]; title?: string } | null
    throw new Error([payload?.error || payload?.title || `İstek başarısız (${response.status}).`, ...(payload?.details || [])].join(' '))
  }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>
}

function ModuleInvokePanel({ item, token }: { item: MarketplaceModule; token: string }) {
  const [action, setAction] = useState('')
  const [input, setInput] = useState('{}')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')

  async function invoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setOutput('')
    let data: unknown
    try { data = JSON.parse(input) }
    catch { setError('Girdi geçerli JSON olmalı.'); return }
    setBusy(true)
    try {
      const response = await request<{ result: unknown }>(`/api/tenant/modules/${encodeURIComponent(item.moduleCode)}/invoke`, token, {
        method: 'POST', body: JSON.stringify({ action, input: data }),
      })
      setOutput(JSON.stringify(response.result, null, 2))
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }

  return <section className="module-invoke">
    <div><b>Sandbox’ta çalıştır</b><span>{item.activatedVersion} sürümü, tenant yetkisiyle çağrılır.</span></div>
    <form onSubmit={invoke}>
      <label>Menü eylemi<select required value={action} onChange={event => setAction(event.target.value)}><option value="">Eylem seçin</option>{(item.manifest?.menuEntries || []).map(entry => <option key={entry.code} value={entry.code}>{entry.label} · {entry.code}</option>)}</select></label>
      <label>JSON girdi<textarea required value={input} onChange={event => setInput(event.target.value)} rows={3} spellCheck={false} /></label>
      <button className="secondary small-button" type="submit" disabled={busy || !action}><Play size={14}/>{busy ? 'Çalışıyor…' : 'Modülü çalıştır'}</button>
    </form>
    {error && <p className="module-invoke-error" role="alert">{error}</p>}
    {output && <pre className="module-invoke-output">{output}</pre>}
  </section>
}

export default function ModuleMarketplacePage({ token, role }: { token: string; role: string }) {
  const [items, setItems] = useState<MarketplaceModule[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setItems(await request<MarketplaceModule[]>('/api/tenant/modules/marketplace', token)) }
    catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  async function toggle(item: MarketplaceModule, remove = false) {
    setBusy(item.moduleCode)
    setError('')
    setNotice('')
    try {
      if (remove) {
        await request(`/api/tenant/modules/${encodeURIComponent(item.moduleCode)}`, token, { method: 'DELETE' })
        setNotice(`${item.moduleCode} tenant modül listesinden çıkarıldı.`)
      } else {
        const result = await request<{ runtimeStatus: string }>('/api/tenant/modules/activate', token, {
          method: 'POST', body: JSON.stringify({ moduleCode: item.moduleCode, version: item.version }),
        })
        setNotice(`${item.moduleCode}@${item.version} etkinleştirildi. Doğrulanmış WASM modülleri tenant izin denetimiyle izole PluginHost’ta çalıştırılabilir.`)
        if (result.runtimeStatus !== 'Ready') setNotice(`${item.moduleCode}@${item.version} etkinleştirildi; modül çalışma zamanı hazır değil.`)
      }
      await load()
      window.dispatchEvent(new Event('aierp-modules-changed'))
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy('') }
  }

  return <div className="module-marketplace-page">
    <div className="page-heading customer-heading">
      <div><p className="eyebrow">EXTENSION ECOSYSTEM · TENANT KATALOĞU</p><h1>Modül pazaryeri</h1><p className="muted">Yayımlanmış, imzası doğrulanmış modülleri inceleyin ve tenant kapsamına ekleyin.</p></div>
      <button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Yenile</button>
    </div>
    {error && <div className="alert">{error}</div>}{notice && <div className="notice">{notice}</div>}
    <div className="boundary-note marketplace-runtime-note"><ShieldCheck size={17}/><span>Yayınlanan paketler imza ve ABI doğrulamasından geçer. Modül kodu yalnızca 64 MiB bellek ve 20 milyon Wasmtime yakıtı sınırı olan, dosya/ağ/DB erişimi kapalı PluginHost içinde çalışır. Menü metadata’sı ERP gezinmesine henüz bağlanmadı.</span></div>
    {loading ? <div className="empty-small">Yayımlanmış modüller yükleniyor…</div> : items.length === 0 ? <section className="panel marketplace-empty"><span className="marketplace-empty-icon"><PackageOpen size={24}/></span><h2>Henüz yayımlanmış modül yok</h2><p>Platform yayın yöneticisi bir modülü yayımladığında katalogda görünür.</p></section> : <div className="module-marketplace-grid">
      {items.map(item => <article className="panel marketplace-card" key={`${item.moduleCode}@${item.version}`}>
          <div className="marketplace-card-top"><span className="marketplace-module-icon"><Boxes size={19}/></span><span className={`marketplace-status ${item.isActivated ? 'enabled' : ''}`}>{item.isActivated ? `Etkin · ${item.activatedVersion}` : item.runtimeStatus === 'Ready' ? 'Sandbox doğrulandı' : 'Runtime yok'}</span></div>
        <p className="eyebrow">{item.moduleCode}</p><h2>{item.manifest?.displayName || item.moduleCode}</h2><p className="marketplace-description">{item.manifest?.publisher || item.publisher} tarafından yayımlandı · v{item.version}</p>
        <div className="marketplace-meta"><span>Platform ≥ {item.manifest?.minimumPlatformVersion || '—'}</span><span>{item.manifest?.dependencies.length || 0} bağımlılık</span><span>{item.manifest?.permissions.length || 0} izin</span></div>
        {!!item.manifest?.dependencies.length && <div className="marketplace-dependencies"><b>Bağımlılıklar</b><span>{item.manifest.dependencies.map(x => `${x.moduleCode} ≥ ${x.minimumVersion}`).join(' · ')}</span></div>}
        {!!item.manifest?.menuEntries.length && <div className="marketplace-dependencies"><b>Tanımlı menüler</b><span>{item.manifest.menuEntries.map(x => x.label).join(' · ')}</span></div>}
        {item.isActivated && <ModuleInvokePanel item={item} token={token}/>}
        <div className="marketplace-card-footer"><span className="marketplace-safety"><ShieldCheck size={14}/> İmzalı paket</span>{role === 'TenantAdmin' && <div className="marketplace-actions">
          {!item.isActivated && <button className="primary small-button" disabled={!!busy || item.runtimeStatus !== 'Ready'} onClick={() => void toggle(item)}>{busy === item.moduleCode ? 'Doğrulanıyor…' : <><Check size={14}/> Tenant’a ekle</>}</button>}
          {item.isActivated && item.activatedVersion !== item.version && <button className="primary small-button" disabled={!!busy} onClick={() => void toggle(item)}>{busy === item.moduleCode ? 'Güncelleniyor…' : <>v{item.version} sürümüne geç</>}</button>}
          {item.isActivated && <button className="secondary small-button" disabled={!!busy} onClick={() => void toggle(item, true)}>{busy === item.moduleCode ? 'Kaydediliyor…' : <><Trash2 size={14}/> Tenant’tan çıkar</>}</button>}
        </div>}</div>
      </article>)}
    </div>}
  </div>
}

export function TenantModuleNavigation({ token, page, onSelect }: {
  token: string
  page: string
  onSelect: (selection: ModuleMenuSelection) => void
}) {
  const [modules, setModules] = useState<ActivatedModule[]>([])
  useEffect(() => {
    let cancelled = false
    const refresh = () => void request<ActivatedModule[]>('/api/tenant/modules/', token)
      .then(items => { if (!cancelled) setModules(items.filter(item => item.runtimeStatus === 'Ready')) })
      .catch(() => { if (!cancelled) setModules([]) })
    const onModulesChanged = () => refresh()
    void refresh()
    window.addEventListener('aierp-modules-changed', onModulesChanged)
    return () => { cancelled = true; window.removeEventListener('aierp-modules-changed', onModulesChanged) }
  }, [token])

  const entries = modules.flatMap(module => {
    try {
      const manifest = typeof module.manifest === 'string' ? JSON.parse(module.manifest) as ModuleManifest : module.manifest
      return (manifest.menuEntries || []).map(entry => ({ moduleCode: module.moduleCode, version: module.version, entry }))
    } catch { return [] }
  })
  if (!entries.length) return null
  return <>
    <div className="side-label">ETKİN MODÜLLER</div>
    <nav className="tenant-module-nav">{entries.map(item => {
      const key = `module:${item.moduleCode}:${item.entry.code}`
      return <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} title={`${item.moduleCode} · ${item.version}`} onClick={() => onSelect(item)}>
        <Boxes size={17}/><span>{item.entry.label}</span>
      </button>
    })}</nav>
  </>
}

export function TenantModuleScreen({ token, selection }: { token: string; selection: ModuleMenuSelection }) {
  const [input, setInput] = useState('{}')
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState<unknown>()
  const view = selection.entry.view

  async function invoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setOutput('')
    let data: unknown
    if (view?.inputMode === 'form') {
      data = Object.fromEntries(view.inputFields.map(field => {
        const value = formValues[field.code]
        if (field.type === 'boolean') return [field.code, value === true]
        if (field.type === 'number') {
          const number = Number(value)
          return [field.code, value === '' || value === undefined ? null : Number.isFinite(number) ? number : NaN]
        }
        return [field.code, value ?? '']
      }))
      if (Object.values(data as Record<string, unknown>).some(value => typeof value === 'number' && !Number.isFinite(value))) {
        setError('Sayı alanlarına geçerli bir değer girin.')
        return
      }
    } else {
      try { data = JSON.parse(input) }
      catch { setError('Girdi geçerli JSON olmalı.'); return }
    }
    setBusy(true)
    try {
      const formData = data && typeof data === 'object' ? data as Record<string, unknown> : {}
      const capabilities = (view?.dataCapabilities || []).map(code => ({
        code,
        query: code === 'customers.balance.read'
          ? { customerCode: formData["customer-code"] }
          : { term: formData.term, ...(typeof formData.limit === 'number' ? { limit: formData.limit } : {}) },
      }))
      const response = await request<{ result: unknown }>(`/api/tenant/modules/${encodeURIComponent(selection.moduleCode)}/invoke`, token, {
        method: 'POST', body: JSON.stringify({ action: selection.entry.code, input: data, ...(capabilities.length ? { capabilities } : {}) }),
      })
      setOutput(response.result)
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }

  const resultRows = (() => {
    if (Array.isArray(output)) return output.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
    if (output && typeof output === 'object') {
      const candidate = (output as Record<string, unknown>).rows ?? (output as Record<string, unknown>).items
      if (Array.isArray(candidate)) return candidate.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
    }
    return []
  })()

  function formatCell(value: unknown) {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'object') return JSON.stringify(value)
    if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır'
    return String(value)
  }

  return <div className="module-menu-screen">
    <div className="page-heading"><div><p className="eyebrow">TENANT MODÜLÜ · {selection.moduleCode} · v{selection.version}</p><h1>{selection.entry.label}</h1><p className="muted">Bu modül eylemi izole WASM çalışma alanında yürütülür. Modüller ERP veritabanına veya ağa doğrudan erişemez.</p></div></div>
    <section className="panel module-menu-panel">
      <div><b>Modül eylemi</b><span>{selection.entry.code} · İstek tenant yürütme iznine tabidir.</span></div>
      <form onSubmit={invoke}>
        {view?.inputMode === 'form' ? <div className="module-ui-form-fields">{view.inputFields.map(field => <label key={field.code}>
          {field.label}{field.required && <span aria-hidden="true"> *</span>}
          {field.type === 'boolean' ? <input type="checkbox" required={field.required} checked={formValues[field.code] === true} onChange={event => setFormValues(values => ({ ...values, [field.code]: event.target.checked }))}/> :
            field.type === 'select' ? <select required={field.required} value={String(formValues[field.code] ?? '')} onChange={event => setFormValues(values => ({ ...values, [field.code]: event.target.value }))}>
              <option value="">Seçin</option>{(field.options || []).map(option => <option value={option} key={option}>{option}</option>)}
            </select> : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} required={field.required}
              maxLength={field.maxLength ?? undefined} value={String(formValues[field.code] ?? '')} onChange={event => setFormValues(values => ({ ...values, [field.code]: event.target.value }))}/>}</label>)}</div> :
          <label>JSON girdi<textarea required value={input} onChange={event => setInput(event.target.value)} rows={7} spellCheck={false}/></label>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Çalışıyor…' : <><Play size={15}/> {view?.inputMode === 'form' ? 'Gönder' : 'Çalıştır'}</>}</button>
      </form>
      {error && <div className="alert" role="alert">{error}</div>}
      {output !== undefined && <><h2>Modül yanıtı</h2>{view?.resultMode === 'table' && resultRows.length > 0 ? <div className="module-ui-table-wrap"><table className="module-ui-table"><thead><tr>{view.resultColumns.map(column => <th key={column.code}>{column.label}</th>)}</tr></thead><tbody>{resultRows.map((row, index) => <tr key={index}>{view.resultColumns.map(column => <td key={column.code}>{formatCell(row[column.code])}</td>)}</tr>)}</tbody></table></div> : <>
        {view?.resultMode === 'table' && <div className="boundary-note">Modül yanıtında beklenen satır listesi bulunmadı; ham JSON gösteriliyor.</div>}
        <pre className="module-invoke-output">{JSON.stringify(output, null, 2)}</pre>
      </>}</>}
    </section>
  </div>
}
