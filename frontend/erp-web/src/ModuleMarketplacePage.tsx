import AdvancedDataGrid from './AdvancedDataGrid'
import { localizedText } from './locale'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowUpRight, Boxes, Code2, Copy, Download, PackageOpen, Play, Search, ShieldCheck } from 'lucide-react'
import './ModuleMarketplacePage.css'
import type { MarketplaceModule, ModuleManifest, ModuleMenuSelection, ModuleStarterTemplate } from './module-marketplace/types'
import { moduleStarterTemplates } from './module-marketplace/starterTemplates'
import { ModuleMarketplaceHeader } from './module-marketplace/components/ModuleMarketplaceHeader'
import { ModuleMarketplaceMetrics } from './module-marketplace/components/ModuleMarketplaceMetrics'
import { ModuleMarketplaceToolbar } from './module-marketplace/components/ModuleMarketplaceToolbar'
import { MarketplaceModuleCard } from './module-marketplace/components/MarketplaceModuleCard'
import { MarketplaceModuleInspector } from './module-marketplace/components/MarketplaceModuleInspector'
export type { ModuleMenuSelection } from './module-marketplace/types'
type ActivatedModule = { moduleCode: string; version: string; manifest: ModuleManifest | string; runtimeStatus: string }


async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, token, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; details?: string[]; title?: string } | null
    throw new Error([payload?.error || payload?.title || localizedText(`İstek başarısız (${response.status}).`, `Request failed (${response.status}).`), ...(payload?.details || [])].join(' '))
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
    catch { setError(localizedText('Girdi geçerli JSON olmalı.', 'Input must be valid JSON.')); return }
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
    <div><b>{localizedText('Sandbox’ta çalıştır', 'Run in sandbox')}</b><span>{localizedText(`${item.activatedVersion} sürümü, tenant yetkisiyle çağrılır.`, `Version ${item.activatedVersion} runs with tenant permissions.`)}</span></div>
    <form onSubmit={invoke}>
      <label>{localizedText('Menü eylemi', 'Menu action')}<select required value={action} onChange={event => setAction(event.target.value)}><option value="">{localizedText('Eylem seçin', 'Select an action')}</option>{(item.manifest?.menuEntries || []).map(entry => <option key={entry.code} value={entry.code}>{entry.label} · {entry.code}</option>)}</select></label>
      <label>{localizedText('JSON girdi', 'JSON input')}<textarea required value={input} onChange={event => setInput(event.target.value)} rows={3} spellCheck={false} /></label>
      <button className="secondary small-button" type="submit" disabled={busy || !action}><Play size={14}/>{busy ? localizedText('Çalışıyor…', 'Running…') : localizedText('Modülü çalıştır', 'Run module')}</button>
    </form>
    {error && <p className="module-invoke-error" role="alert">{error}</p>}
    {output && <pre className="module-invoke-output">{output}</pre>}
  </section>
}

export default function ModuleMarketplacePage({ token, role, onDevelopStarter }: { token: string; role: string; onDevelopStarter?: (template: { code: string; moduleCode: string; name: string }) => void }) {
  const [items, setItems] = useState<MarketplaceModule[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'available' | 'blocked'>('all')
  const [selectedModuleCode, setSelectedModuleCode] = useState('')

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
        setNotice(localizedText(`${item.moduleCode} tenant modül listesinden çıkarıldı.`, `${item.moduleCode} was removed from the tenant module list.`))
      } else {
        const result = await request<{ runtimeStatus: string }>('/api/tenant/modules/activate', token, {
          method: 'POST', body: JSON.stringify({ moduleCode: item.moduleCode, version: item.version }),
        })
        setNotice(localizedText(`${item.moduleCode}@${item.version} etkinleştirildi. Doğrulanmış WASM modülleri tenant izin denetimiyle izole PluginHost’ta çalıştırılabilir.`, `${item.moduleCode}@${item.version} was activated. Verified WASM modules can run in the isolated PluginHost under tenant permission checks.`))
        if (result.runtimeStatus !== 'Ready') setNotice(localizedText(`${item.moduleCode}@${item.version} etkinleştirildi; modül çalışma zamanı hazır değil.`, `${item.moduleCode}@${item.version} was activated, but the module runtime is not ready.`))
      }
      await load()
      window.dispatchEvent(new Event('aierp-modules-changed'))
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy('') }
  }

  async function copyStarterFile(template: ModuleStarterTemplate, file: 'manifest' | 'cargo' | 'source') {
    const content = file === 'manifest' ? JSON.stringify(template.manifest, null, 2) : file === 'cargo' ? template.cargo : template.source
    const label = file === 'manifest' ? 'manifest.json' : file === 'cargo' ? 'Cargo.toml' : 'src/lib.rs'
    try {
      await navigator.clipboard.writeText(content)
      setNotice(localizedText(`${label} panoya kopyalandı. Örneği kendi modül kodunuza göre düzenleyebilirsiniz.`, `${label} copied. You can adapt the example for your module.`))
    } catch {
      setError(localizedText('Panoya erişilemedi. Dosyayı indirme düğmelerini kullanın.', 'Clipboard access failed. Use the download buttons instead.'))
    }
  }

  function downloadStarterFile(template: ModuleStarterTemplate, file: 'manifest' | 'cargo' | 'source') {
    const content = file === 'manifest' ? JSON.stringify(template.manifest, null, 2) : file === 'cargo' ? template.cargo : template.source
    const fileName = file === 'manifest' ? `${template.code}-manifest.json` : file === 'cargo' ? `Cargo-${template.code}.toml` : `${template.code}-lib.rs`
    const blob = new Blob([content], { type: file === 'manifest' ? 'application/json' : 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const filteredItems = items.filter(item => {
    const name = item.manifest?.displayName || item.moduleCode
    const publisher = item.manifest?.publisher || item.publisher
    const matchesQuery = !normalizedQuery || `${name} ${item.moduleCode} ${publisher}`.toLocaleLowerCase('tr-TR').includes(normalizedQuery)
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && item.isActivated)
      || (statusFilter === 'available' && !item.isActivated && item.runtimeStatus === 'Ready')
      || (statusFilter === 'blocked' && item.runtimeStatus !== 'Ready')
    return matchesQuery && matchesStatus
  })
  const activeCount = items.filter(item => item.isActivated).length
  const availableCount = items.filter(item => !item.isActivated && item.runtimeStatus === 'Ready').length
  const selectedModule = filteredItems.find(item => item.moduleCode === selectedModuleCode) ?? filteredItems[0] ?? null
  useEffect(() => {
    if (!filteredItems.length) setSelectedModuleCode('')
    else if (!filteredItems.some(item => item.moduleCode === selectedModuleCode)) setSelectedModuleCode(filteredItems[0].moduleCode)
  }, [filteredItems, selectedModuleCode])

  return <main className="module-marketplace-page">
    <ModuleMarketplaceHeader loading={loading} onRefresh={()=>void load()}/>
    {error && <div className="alert marketplace-alert" role="alert"><span>{error}</span><button className="secondary small-button" type="button" onClick={() => void load()} disabled={loading}>{localizedText('Yeniden dene', 'Retry')}</button></div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="boundary-note marketplace-runtime-note"><ShieldCheck size={17} aria-hidden="true"/><span>{localizedText('Güven sınırı: imza ve ABI doğrulaması uygulanır. Kod, dosya/ağ/veritabanı erişimi kapalı PluginHost’ta 64 MiB bellek ve 20 milyon Wasmtime yakıt sınırıyla çalışır. Eylemler manifestte tanımlıdır ve her çağrı tenant izin denetimine tabidir. Menü metadata’sı ERP gezinmesine henüz bağlanmadı.', 'Security boundary: signatures and ABI are validated. Code runs in the isolated PluginHost with file, network, and database access disabled, a 64 MiB memory limit, and 20 million units of Wasmtime fuel. Actions are defined in the manifest and each call is checked against tenant permissions. Menu metadata is not yet connected to ERP navigation.')}</span></div>
    <section className="module-starter-gallery" aria-labelledby="module-starters-title">
      <header><div><p className="eyebrow">{localizedText('ÖRNEK MODÜLLER', 'MODULE EXAMPLES')}</p><h2 id="module-starters-title">{localizedText('Kendi modülünüz için başlangıç şablonları', 'Starter templates for your own module')}</h2><p>{localizedText('Manifesti ve Rust kaynak kodunu inceleyin, indirin veya panoya kopyalayın. İndirdiğiniz dosyaları manifest.json, Cargo.toml ve src/lib.rs olarak Cargo projesine yerleştirip `cargo build --release --target wasm32-unknown-unknown` komutuyla derleyin; WASM çıktısını module.wasm olarak paketleyin. Örnekler kataloğa yüklenmez; yayın için imzalı paket gerekir.', 'Inspect, download, or copy the manifest and Rust source. Place the downloaded files in a Cargo project as manifest.json, Cargo.toml, and src/lib.rs, then build with `cargo build --release --target wasm32-unknown-unknown`; package the WASM output as module.wasm. Examples are not published to the catalog; publishing requires a signed package.')}</p></div><span className="module-starter-count">{localizedText(`${moduleStarterTemplates.length} örnek`, `${moduleStarterTemplates.length} examples`)}</span></header>
      <div className="module-starter-grid">{moduleStarterTemplates.map((template, index) => <article className="module-starter-card" key={template.code}>
        <div className="module-starter-card-heading"><span><Code2 size={17}/></span><small>{String(index + 1).padStart(2, '0')} · WASM</small></div>
        <h3>{localizedText(template.name, ['Greeting module', 'Price calculator', 'Text summary'][index])}</h3><p>{localizedText(template.description, ['Accepts a name and returns a personalized greeting.', 'Calculates a net amount from unit price, quantity, and discount.', 'Counts words and characters in text; a simple pure function example.'][index])}</p>
        {onDevelopStarter&&<button className="secondary small-button module-starter-develop" type="button" onClick={()=>onDevelopStarter({code:template.code,moduleCode:String(template.manifest.moduleCode),name:template.name})}><Code2 size={14}/>{localizedText('Studio’da geliştir', 'Develop in Studio')}<ArrowUpRight size={13}/></button>}
        <details><summary>{localizedText('Manifest ve kodu incele', 'Inspect manifest and code')}</summary><div className="module-starter-files">
          <div><b>manifest.json</b><pre>{JSON.stringify(template.manifest, null, 2)}</pre><div className="module-starter-actions"><button className="secondary small-button" type="button" onClick={() => void copyStarterFile(template, 'manifest')}><Copy size={13}/>{localizedText('Kopyala', 'Copy')}</button><button className="secondary small-button" type="button" onClick={() => downloadStarterFile(template, 'manifest')}><Download size={13}/>{localizedText('İndir', 'Download')}</button></div></div>
          <div><b>Cargo.toml</b><pre>{template.cargo}</pre><div className="module-starter-actions"><button className="secondary small-button" type="button" onClick={() => void copyStarterFile(template, 'cargo')}><Copy size={13}/>{localizedText('Kopyala', 'Copy')}</button><button className="secondary small-button" type="button" onClick={() => downloadStarterFile(template, 'cargo')}><Download size={13}/>{localizedText('İndir', 'Download')}</button></div></div>
          <div><b>src/lib.rs</b><pre>{template.source}</pre><div className="module-starter-actions"><button className="secondary small-button" type="button" onClick={() => void copyStarterFile(template, 'source')}><Copy size={13}/>{localizedText('Kopyala', 'Copy')}</button><button className="secondary small-button" type="button" onClick={() => downloadStarterFile(template, 'source')}><Download size={13}/>{localizedText('İndir', 'Download')}</button></div></div>
        </div></details>
      </article>)}</div>
    </section>
    <ModuleMarketplaceMetrics moduleCount={items.length} activeCount={activeCount} availableCount={availableCount} blockedCount={items.filter(item=>item.runtimeStatus!=='Ready').length}/>
    {!loading && error && items.length === 0 ? <section className="panel marketplace-empty" aria-live="polite"><span className="marketplace-empty-icon"><PackageOpen size={24} aria-hidden="true"/></span><h2>{localizedText('Katalog yüklenemedi', 'Could not load catalog')}</h2><p>{localizedText('Modül listesini alamadık. Bağlantıyı kontrol edip yeniden deneyin.', 'We could not load the module list. Check the connection and try again.')}</p><button className="primary small-button" type="button" onClick={() => void load()}>{localizedText('Tekrar dene', 'Try again')}</button></section> : <>
      <ModuleMarketplaceToolbar query={query} statusFilter={statusFilter} moduleCount={items.length} activeCount={activeCount} availableCount={availableCount} resultCount={filteredItems.length} loading={loading} onQueryChange={setQuery} onStatusChange={setStatusFilter}/>
      {loading && items.length === 0 ? <div className="marketplace-loading" role="status" aria-live="polite"><span className="marketplace-spinner" aria-hidden="true"/>{localizedText('Yayımlanmış modüller yükleniyor…', 'Loading published modules…')}</div> : items.length === 0 ? <section className="panel marketplace-empty"><span className="marketplace-empty-icon"><PackageOpen size={24} aria-hidden="true"/></span><h2>{localizedText('Henüz yayımlanmış modül yok', 'No modules have been published yet')}</h2><p>{localizedText('Platform yayın yöneticisi bir modülü yayımladığında katalogda görünür.', 'Modules appear here when a platform publisher publishes them.')}</p></section> : filteredItems.length === 0 ? <section className="panel marketplace-empty"><span className="marketplace-empty-icon"><Search size={24} aria-hidden="true"/></span><h2>{localizedText('Aramanızla eşleşen modül yok', 'No modules match your search')}</h2><p>{localizedText('Arama terimini veya durum filtresini değiştirip yeniden deneyin.', 'Change the search term or status filter and try again.')}</p><button className="secondary small-button" type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>{localizedText('Filtreleri temizle', 'Clear filters')}</button></section> : <div className="marketplace-workbench"><div className="module-marketplace-grid" aria-busy={loading}>
      {filteredItems.map(item=><MarketplaceModuleCard key={`${item.moduleCode}@${item.version}`} item={item} selected={selectedModule?.moduleCode===item.moduleCode} role={role} busy={!!busy} busyCode={busy} onSelect={setSelectedModuleCode} onToggle={(module,remove)=>void toggle(module,remove)} invokePanel={item.isActivated?<ModuleInvokePanel item={item} token={token}/>:null}/>)}
      </div><MarketplaceModuleInspector item={selectedModule} invokePanel={selectedModule?.isActivated?<ModuleInvokePanel item={selectedModule} token={token}/>:null}/></div>}
    </>}
  </main>
}

export function TenantModuleNavigation({ token, page, onSelect, onSearchItems }: {
  token: string
  page: string
  onSelect: (selection: ModuleMenuSelection) => void
  onSearchItems?: (items: Array<{page:string;label:string;description:string;selection:ModuleMenuSelection}>) => void
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

  const entries = useMemo(()=>modules.flatMap(module => {
    try {
      const manifest = typeof module.manifest === 'string' ? JSON.parse(module.manifest) as ModuleManifest : module.manifest
      return (manifest.menuEntries || []).map(entry => ({ moduleCode: module.moduleCode, version: module.version, entry }))
    } catch { return [] }
  }),[modules])
  useEffect(()=>{onSearchItems?.(entries.map(item=>({page:`module:${item.moduleCode}:${item.entry.code}`,label:item.entry.label,description:item.moduleCode,selection:item})))},[entries,onSearchItems])
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
      {output !== undefined && <><h2>Modül yanıtı</h2>{view?.resultMode === 'table' && resultRows.length > 0 ? <div className="module-ui-table-wrap"><AdvancedDataGrid  className="module-ui-table"><thead><tr>{view.resultColumns.map(column => <th key={column.code}>{column.label}</th>)}</tr></thead><tbody>{resultRows.map((row, index) => <tr key={index}>{view.resultColumns.map(column => <td key={column.code}>{formatCell(row[column.code])}</td>)}</tr>)}</tbody></AdvancedDataGrid></div> : <>
        {view?.resultMode === 'table' && <div className="boundary-note">Modül yanıtında beklenen satır listesi bulunmadı; ham JSON gösteriliyor.</div>}
        <pre className="module-invoke-output">{JSON.stringify(output, null, 2)}</pre>
      </>}</>}
    </section>
  </div>
}
