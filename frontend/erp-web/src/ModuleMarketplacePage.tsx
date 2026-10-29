import AdvancedDataGrid from './AdvancedDataGrid'
import { isEnglishLocale, localizedText } from './locale'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ArrowUpRight, Boxes, Check, Code2, Copy, Download, PackageOpen, Play, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react'
import './ModuleMarketplacePage.css'

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

type ModuleStarterTemplate = { code: string; name: string; description: string; manifest: Record<string, unknown>; cargo: string; source: string }
const rustModuleStarter = (action: string, expression: string) => `use serde_json::{json, Value};
use std::{alloc::{alloc, Layout}, ptr::copy_nonoverlapping, slice};

#[no_mangle]
pub extern "C" fn aierp_alloc(length: i32) -> i32 {
    if length <= 0 { return 0; }
    let Ok(layout) = Layout::from_size_align(length as usize, 8) else { return 0; };
    unsafe { alloc(layout) as i32 }
}

#[no_mangle]
pub extern "C" fn aierp_invoke(request_pointer: i32, request_length: i32) -> i64 {
    if request_pointer < 0 || request_length <= 0 { return 0; }
    let bytes = unsafe { slice::from_raw_parts(request_pointer as *const u8, request_length as usize) };
    let request: Value = serde_json::from_slice(bytes).unwrap_or(Value::Null);
    let action = request.get("action").and_then(Value::as_str).unwrap_or("");
    let data = request.get("data").cloned().unwrap_or(Value::Null);
    let result = match action {
        "${action}" => { ${expression} },
        _ => json!({ "error": "Unknown action" }),
    };
    let Ok(output) = serde_json::to_vec(&result) else { return 0; };
    let Ok(layout) = Layout::from_size_align(output.len(), 8) else { return 0; };
    let output_pointer = unsafe { alloc(layout) };
    if output_pointer.is_null() { return 0; }
    unsafe { copy_nonoverlapping(output.as_ptr(), output_pointer, output.len()); }
    (((output_pointer as u32 as u64) << 32) | output.len() as u64) as i64
}
`
const moduleStarterTemplates: ModuleStarterTemplate[] = [
  {
    code: 'greeting', name: 'Selamlama modülü', description: 'Bir ad alır ve kişiselleştirilmiş bir karşılama mesajı döndürür.',
    manifest: { moduleCode: 'ornek.selamlama', displayName: 'Selamlama Modülü', version: '1.0.0', publisher: 'ornek', minimumPlatformVersion: '1.0.0', dependencies: [], permissions: [{ code: 'greeting.read', description: 'Selamlama ekranını kullanır.' }], menuEntries: [{ code: 'greeting.show', label: 'Selamlama', route: '/greeting', permissionCode: 'greeting.read', view: { inputMode: 'form', inputFields: [{ code: 'name', label: 'Adınız', type: 'text', required: true, maxLength: 80 }], resultMode: 'json', resultColumns: [] } }], migrations: [] },
    cargo: '[package]\nname = "ornek_selamlama"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }',
    source: rustModuleStarter('greeting.show', 'let name = data.get("name").and_then(Value::as_str).unwrap_or("dünya");\n            json!({ "message": format!("Merhaba, {name}!"), "module": "selamlama" })'),
  },
  {
    code: 'price', name: 'Fiyat hesaplama modülü', description: 'Birim fiyat, adet ve indirim oranından net tutarı hesaplar.',
    manifest: { moduleCode: 'ornek.fiyat-hesapla', displayName: 'Fiyat Hesaplama', version: '1.0.0', publisher: 'ornek', minimumPlatformVersion: '1.0.0', dependencies: [], permissions: [{ code: 'price.calculate', description: 'Fiyat hesaplama aracını kullanır.' }], menuEntries: [{ code: 'price.calculate', label: 'Fiyat hesapla', route: '/price-calculator', permissionCode: 'price.calculate', view: { inputMode: 'form', inputFields: [{ code: 'unitPrice', label: 'Birim fiyat', type: 'number', required: true }, { code: 'quantity', label: 'Adet', type: 'number', required: true }, { code: 'discountPercent', label: 'İndirim (%)', type: 'number' }], resultMode: 'json', resultColumns: [] } }], migrations: [] },
    cargo: '[package]\nname = "ornek_fiyat_hesapla"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }',
    source: rustModuleStarter('price.calculate', 'let unit = data.get("unitPrice").and_then(Value::as_f64).unwrap_or(0.0);\n            let quantity = data.get("quantity").and_then(Value::as_f64).unwrap_or(0.0);\n            let discount = data.get("discountPercent").and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 100.0);\n            let subtotal = unit * quantity;\n            json!({ "subtotal": subtotal, "discount": subtotal * discount / 100.0, "total": subtotal * (1.0 - discount / 100.0) })'),
  },
  {
    code: 'text-summary', name: 'Metin özeti modülü', description: 'Metindeki kelime ve karakter sayısını hesaplar; saf bir örnek eylem sunar.',
    manifest: { moduleCode: 'ornek.metin-ozeti', displayName: 'Metin Özeti', version: '1.0.0', publisher: 'ornek', minimumPlatformVersion: '1.0.0', dependencies: [], permissions: [{ code: 'text.analyze', description: 'Metin özetleme aracını kullanır.' }], menuEntries: [{ code: 'text.analyze', label: 'Metin özeti', route: '/text-summary', permissionCode: 'text.analyze', view: { inputMode: 'form', inputFields: [{ code: 'text', label: 'Metin', type: 'text', required: true, maxLength: 1000 }], resultMode: 'json', resultColumns: [] } }], migrations: [] },
    cargo: '[package]\nname = "ornek_metin_ozeti"\nversion = "1.0.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nserde_json = { version = "1", default-features = false, features = ["alloc"] }',
    source: rustModuleStarter('text.analyze', 'let text = data.get("text").and_then(Value::as_str).unwrap_or("");\n            json!({ "characters": text.chars().count(), "words": text.split_whitespace().count() })'),
  },
]

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
    <div className="page-heading customer-heading">
      <div><p className="eyebrow">{localizedText('MODÜL YÖNETİMİ · TENANT KATALOĞU', 'MODULE MANAGEMENT · TENANT CATALOG')}</p><h1>{localizedText('Modül pazaryeri', 'Module marketplace')}</h1><p className="muted">{localizedText('Yayımlanmış modülleri inceleyin; imza doğrulaması, sandbox ve tenant izin sınırları altında etkinleştirin.', 'Review published modules and activate them within signature verification, sandbox, and tenant permission boundaries.')}</p></div>
      <button className="secondary" type="button" onClick={() => void load()} disabled={loading} aria-label={loading ? localizedText('Modül kataloğu yenileniyor', 'Refreshing module catalog') : localizedText('Modül kataloğunu yenile', 'Refresh module catalog')}><RefreshCw size={16} aria-hidden="true"/> {loading ? localizedText('Yenileniyor…', 'Refreshing…') : localizedText('Yenile', 'Refresh')}</button>
    </div>
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
    <section className="marketplace-kpis" aria-label={localizedText('Modül kataloğu özeti', 'Module catalog summary')}><article><span>{localizedText('Katalog modülü', 'Catalog modules')}</span><b>{items.length}</b><small>{localizedText('Yayımlanmış paket', 'Published packages')}</small></article><article><span>{localizedText('Tenant’ta etkin', 'Active in tenant')}</span><b>{activeCount}</b><small>{localizedText('Etkin modül', 'Active modules')}</small></article><article><span>{localizedText('Etkinleştirilebilir', 'Available to activate')}</span><b>{availableCount}</b><small>{localizedText('Runtime hazır', 'Runtime ready')}</small></article><article><span>{localizedText('Runtime engelli', 'Runtime blocked')}</span><b>{items.filter(item => item.runtimeStatus !== 'Ready').length}</b><small>{localizedText('Hazır olmayan paket', 'Packages not ready')}</small></article></section>
    {!loading && error && items.length === 0 ? <section className="panel marketplace-empty" aria-live="polite"><span className="marketplace-empty-icon"><PackageOpen size={24} aria-hidden="true"/></span><h2>{localizedText('Katalog yüklenemedi', 'Could not load catalog')}</h2><p>{localizedText('Modül listesini alamadık. Bağlantıyı kontrol edip yeniden deneyin.', 'We could not load the module list. Check the connection and try again.')}</p><button className="primary small-button" type="button" onClick={() => void load()}>{localizedText('Tekrar dene', 'Try again')}</button></section> : <>
      <section className="marketplace-toolbar" aria-label={localizedText('Modül kataloğu filtreleri', 'Module catalog filters')}>
        <label className="marketplace-search"><span>{localizedText('Katalogda ara', 'Search catalog')}</span><span className="marketplace-search-control"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={localizedText('Modül adı, kodu veya yayıncı', 'Module name, code, or publisher')} aria-label={localizedText('Modül adı, kodu veya yayıncıya göre ara', 'Search by module name, code, or publisher')}/></span></label>
        <label className="marketplace-filter"><span>{localizedText('Durum', 'Status')}</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} aria-label={localizedText('Modül durumuna göre filtrele', 'Filter by module status')}>
          <option value="all">{localizedText(`Tüm durumlar (${items.length})`, `All statuses (${items.length})`)}</option><option value="active">{localizedText(`Tenant’ta etkin (${activeCount})`, `Active in tenant (${activeCount})`)}</option><option value="available">{localizedText(`Etkinleştirilebilir (${availableCount})`, `Available to activate (${availableCount})`)}</option><option value="blocked">{localizedText('Runtime hazır değil', 'Runtime not ready')}</option>
        </select></label>
        <div className="marketplace-result-count" aria-live="polite">{loading ? localizedText('Katalog yükleniyor…', 'Loading catalog…') : localizedText(`${filteredItems.length} / ${items.length} modül`, `${filteredItems.length} / ${items.length} modules`)}</div>
      </section>
      {loading && items.length === 0 ? <div className="marketplace-loading" role="status" aria-live="polite"><span className="marketplace-spinner" aria-hidden="true"/>{localizedText('Yayımlanmış modüller yükleniyor…', 'Loading published modules…')}</div> : items.length === 0 ? <section className="panel marketplace-empty"><span className="marketplace-empty-icon"><PackageOpen size={24} aria-hidden="true"/></span><h2>{localizedText('Henüz yayımlanmış modül yok', 'No modules have been published yet')}</h2><p>{localizedText('Platform yayın yöneticisi bir modülü yayımladığında katalogda görünür.', 'Modules appear here when a platform publisher publishes them.')}</p></section> : filteredItems.length === 0 ? <section className="panel marketplace-empty"><span className="marketplace-empty-icon"><Search size={24} aria-hidden="true"/></span><h2>{localizedText('Aramanızla eşleşen modül yok', 'No modules match your search')}</h2><p>{localizedText('Arama terimini veya durum filtresini değiştirip yeniden deneyin.', 'Change the search term or status filter and try again.')}</p><button className="secondary small-button" type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>{localizedText('Filtreleri temizle', 'Clear filters')}</button></section> : <div className="marketplace-workbench"><div className="module-marketplace-grid" aria-busy={loading}>
      {filteredItems.map(item => {
        const displayName = item.manifest?.displayName || item.moduleCode
        const publisher = item.manifest?.publisher || item.publisher
        const hasUpdate = item.isActivated && item.activatedVersion !== item.version
        const status = item.isActivated
          ? item.runtimeStatus !== 'Ready' ? localizedText('Etkin · runtime hazır değil', 'Active · runtime not ready') : hasUpdate ? localizedText('Yeni sürüm var', 'Update available') : localizedText('Tenant’ta etkin', 'Active in tenant')
          : item.runtimeStatus === 'Ready' ? localizedText('Etkinleştirilebilir', 'Available to activate') : localizedText('Runtime hazır değil', 'Runtime not ready')
        const publishedAt = item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt))
          ? new Intl.DateTimeFormat(isEnglishLocale() ? 'en' : 'tr-TR', { dateStyle: 'medium' }).format(new Date(item.publishedAt))
          : localizedText('Belirtilmemiş', 'Not specified')
        return <article className="panel marketplace-card" key={`${item.moduleCode}@${item.version}`} aria-labelledby={`marketplace-title-${item.moduleCode}-${item.version}`}>
          <div className="marketplace-card-top"><span className="marketplace-module-icon"><Boxes size={19} aria-hidden="true"/></span><span className={`marketplace-status ${item.runtimeStatus !== 'Ready' ? 'blocked' : item.isActivated ? 'enabled' : 'available'}`}>{status}</span></div>
          <button type="button" className="marketplace-record-select" aria-pressed={selectedModule?.moduleCode===item.moduleCode} onClick={()=>setSelectedModuleCode(item.moduleCode)}>{localizedText('Ayrıntıyı aç', 'Open details')}</button><p className="eyebrow">{item.moduleCode}</p><h2 id={`marketplace-title-${item.moduleCode}-${item.version}`}>{displayName}</h2><p className="marketplace-description">{localizedText(`${publisher} tarafından yayımlandı`, `Published by ${publisher}`)}</p>
          <div className="marketplace-version-row"><span className="marketplace-version">{localizedText('Yayımlanan', 'Published')} <b>v{item.version}</b></span>{item.isActivated && <span className="marketplace-version">Tenant <b>v{item.activatedVersion || '—'}</b></span>}</div>
          <div className="marketplace-meta"><span>Platform ≥ {item.manifest?.minimumPlatformVersion || '—'}</span><span>{localizedText(`${item.manifest?.dependencies.length || 0} bağımlılık`, `${item.manifest?.dependencies.length || 0} dependencies`)}</span><span>{localizedText(`${item.manifest?.permissions.length || 0} izin`, `${item.manifest?.permissions.length || 0} permissions`)}</span><span>{localizedText(`${item.manifest?.menuEntries.length || 0} eylem`, `${item.manifest?.menuEntries.length || 0} actions`)}</span></div>
          <details className="marketplace-details"><summary>{localizedText('Modül ayrıntıları', 'Module details')}</summary>
            <div className="marketplace-detail-content">
              <dl><div><dt>{localizedText('Yayıncı', 'Publisher')}</dt><dd>{publisher}</dd></div><div><dt>{localizedText('En düşük platform sürümü', 'Minimum platform version')}</dt><dd>{item.manifest?.minimumPlatformVersion || localizedText('Belirtilmemiş', 'Not specified')}</dd></div><div><dt>{localizedText('Yayın tarihi', 'Published date')}</dt><dd>{publishedAt}</dd></div><div><dt>{localizedText('Paket SHA-256', 'Package SHA-256')}</dt><dd className="marketplace-hash" title={item.artifactSha256}>{item.artifactSha256 || localizedText('Belirtilmemiş', 'Not specified')}</dd></div></dl>
              {!!item.manifest?.dependencies.length && <div className="marketplace-dependencies"><b>{localizedText('Bağımlılıklar', 'Dependencies')}</b><ul>{item.manifest.dependencies.map(x => <li key={x.moduleCode}>{x.moduleCode} ≥ {x.minimumVersion}</li>)}</ul></div>}
              {!!item.manifest?.permissions.length && <div className="marketplace-dependencies"><b>{localizedText('İstenen izinler', 'Requested permissions')}</b><ul>{item.manifest.permissions.map(x => <li key={x.code}><code>{x.code}</code> — {x.description}</li>)}</ul></div>}
              {!!item.manifest?.menuEntries.length && <div className="marketplace-dependencies"><b>{localizedText('Manifest eylemleri', 'Manifest actions')}</b><ul>{item.manifest.menuEntries.map(x => <li key={x.code}>{x.label} <code>{x.code}</code><small>{localizedText('İzin:', 'Permission:')} {x.permissionCode || localizedText('Tanımlı değil', 'Not defined')}</small></li>)}</ul></div>}
              {!item.manifest && <p className="marketplace-detail-unavailable">{localizedText('Bu paket için manifest ayrıntısı sunulmadı.', 'Manifest details are not available for this package.')}</p>}
            </div>
          </details>
          {item.isActivated && <ModuleInvokePanel item={item} token={token}/>}
          <div className="marketplace-card-footer"><span className="marketplace-safety"><ShieldCheck size={14} aria-hidden="true"/> {localizedText('İmza doğrulamalı paket', 'Signature-verified package')}</span>{role === 'TenantAdmin' && <div className="marketplace-actions">
            {!item.isActivated && <button className="primary small-button" type="button" disabled={!!busy || item.runtimeStatus !== 'Ready'} onClick={() => void toggle(item)}>{busy === item.moduleCode ? localizedText('Doğrulanıyor…', 'Verifying…') : <><Check size={14} aria-hidden="true"/> {localizedText('Tenant’a ekle', 'Add to tenant')}</>}</button>}
            {hasUpdate && <button className="primary small-button" type="button" disabled={!!busy} onClick={() => void toggle(item)}>{busy === item.moduleCode ? localizedText('Güncelleniyor…', 'Updating…') : localizedText(`v${item.version} sürümüne geç`, `Switch to v${item.version}`)}</button>}
            {item.isActivated && <button className="secondary small-button" type="button" disabled={!!busy} onClick={() => void toggle(item, true)}>{busy === item.moduleCode ? localizedText('Kaydediliyor…', 'Saving…') : <><Trash2 size={14} aria-hidden="true"/> {localizedText('Tenant’tan çıkar', 'Remove from tenant')}</>}</button>}
          </div>}</div>
        </article>
      })}
      </div><aside className="marketplace-inspector" aria-label={localizedText('Seçili modül ayrıntısı', 'Selected module details')}>{selectedModule ? <><div className="marketplace-inspector-title"><span className="marketplace-module-icon"><Boxes size={18} aria-hidden="true"/></span><div><p className="eyebrow">{localizedText('SEÇİLİ MODÜL', 'SELECTED MODULE')}</p><h2>{selectedModule.manifest?.displayName || selectedModule.moduleCode}</h2><small>{selectedModule.moduleCode} · v{selectedModule.version}</small></div></div><div className="marketplace-inspector-status"><span>Runtime</span><b className={selectedModule.runtimeStatus === 'Ready' ? 'ready' : 'blocked'}>{selectedModule.runtimeStatus}</b></div><dl><div><dt>{localizedText('Yayıncı', 'Publisher')}</dt><dd>{selectedModule.manifest?.publisher || selectedModule.publisher}</dd></div><div><dt>{localizedText('Tenant sürümü', 'Tenant version')}</dt><dd>{selectedModule.isActivated ? selectedModule.activatedVersion || '—' : localizedText('Etkin değil', 'Inactive')}</dd></div><div><dt>{localizedText('Minimum platform', 'Minimum platform')}</dt><dd>{selectedModule.manifest?.minimumPlatformVersion || '—'}</dd></div><div><dt>{localizedText('Paket SHA-256', 'Package SHA-256')}</dt><dd className="marketplace-hash" title={selectedModule.artifactSha256}>{selectedModule.artifactSha256 || localizedText('Belirtilmemiş', 'Not specified')}</dd></div></dl>{!!selectedModule.manifest?.dependencies.length && <section><b>{localizedText('Bağımlılıklar', 'Dependencies')}</b><ul>{selectedModule.manifest.dependencies.map(dependency => <li key={dependency.moduleCode}>{dependency.moduleCode} ≥ {dependency.minimumVersion}</li>)}</ul></section>}{!!selectedModule.manifest?.permissions.length && <section><b>{localizedText('İzin kapsamı', 'Permission scope')}</b><ul>{selectedModule.manifest.permissions.map(permission => <li key={permission.code}><code>{permission.code}</code><small>{permission.description}</small></li>)}</ul></section>}{selectedModule.isActivated && <ModuleInvokePanel item={selectedModule} token={token}/>}</> : <div className="marketplace-empty">{localizedText('Ayrıntıyı görmek için modül seçin.', 'Select a module to see its details.')}</div>}</aside></div>}
    </>}
  </main>
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
      {output !== undefined && <><h2>Modül yanıtı</h2>{view?.resultMode === 'table' && resultRows.length > 0 ? <div className="module-ui-table-wrap"><AdvancedDataGrid  className="module-ui-table"><thead><tr>{view.resultColumns.map(column => <th key={column.code}>{column.label}</th>)}</tr></thead><tbody>{resultRows.map((row, index) => <tr key={index}>{view.resultColumns.map(column => <td key={column.code}>{formatCell(row[column.code])}</td>)}</tr>)}</tbody></AdvancedDataGrid></div> : <>
        {view?.resultMode === 'table' && <div className="boundary-note">Modül yanıtında beklenen satır listesi bulunmadı; ham JSON gösteriliyor.</div>}
        <pre className="module-invoke-output">{JSON.stringify(output, null, 2)}</pre>
      </>}</>}
    </section>
  </div>
}
