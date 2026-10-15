import { useEffect, useState, type FormEvent } from 'react'
import { Code2, FileText, LogOut, Plus, Sparkles, X } from 'lucide-react'
import { api } from './api'
import { StudioProjects } from './StudioProjects'

type Tenant = { id: string; name: string; slug: string; role: string }
type DevelopmentProject = { id: string; name: string; repositoryUrl: string; defaultBranch: string; accessLevel: string; createdAt: string }
type DevelopmentRequest = { id: string; title: string; description: string; status: string; createdAt: string; projectId: string | null; projectName: string | null }
type LoginResponse = { accessToken: string; displayName: string; tenants: Tenant[] }
type TenantSelectionResponse = { accessToken: string; tenant: Tenant }

const tokenKey = 'aierp.accessToken'
const activeTenantKey = 'aierp.tenant'
const tenantSelectionKey = 'aierp.studioSelectionToken'
const tenantListKey = 'aierp.studioTenants'

function readTenant(): Tenant | null {
  try { return JSON.parse(localStorage.getItem(activeTenantKey) || 'null') as Tenant | null }
  catch { return null }
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '')
  const [selectionToken, setSelectionToken] = useState(localStorage.getItem(tenantSelectionKey) || '')
  const [tenant, setTenant] = useState<Tenant | null>(readTenant)
  const [tenants, setTenants] = useState<Tenant[]>(() => {
    try { return JSON.parse(localStorage.getItem(tenantListKey) || '[]') as Tenant[] }
    catch { return [] }
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requests, setRequests] = useState<DevelopmentRequest[]>([])
  const [projects, setProjects] = useState<DevelopmentProject[]>([])
  const [showRequest, setShowRequest] = useState(false)
  const [requestTitle, setRequestTitle] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestProjectId, setRequestProjectId] = useState('')

  useEffect(() => {
    if (!token || !tenant) return
    void Promise.all([
      api<DevelopmentRequest[]>('/studio/requests/', token),
      api<DevelopmentProject[]>('/studio/projects/', token)
    ]).then(([items, registeredProjects]) => { setRequests(items); setProjects(registeredProjects) })
      .catch(e => setError((e as Error).message))
  }, [token, tenant?.id])

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<LoginResponse>('/api/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ email, password })
      })
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.setItem('aierp.user', result.displayName)
      localStorage.setItem(tenantSelectionKey, result.accessToken)
      localStorage.setItem(tenantListKey, JSON.stringify(result.tenants))
      setToken(result.accessToken); setSelectionToken(result.accessToken); setTenants(result.tenants)
      if (result.tenants.length === 1) await selectTenant(result.tenants[0], result.accessToken)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function selectTenant(item: Tenant, access = selectionToken) {
    setBusy(true); setError('')
    try {
      const result = await api<TenantSelectionResponse>('/api/auth/select-tenant', access, {
        method: 'POST', body: JSON.stringify({ tenantId: item.id })
      })
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.setItem(activeTenantKey, JSON.stringify(result.tenant))
      setTenant(result.tenant); setToken(result.accessToken)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  function logout() {
    for (const key of [tokenKey, activeTenantKey, tenantSelectionKey, tenantListKey, 'aierp.user']) localStorage.removeItem(key)
    setToken(''); setSelectionToken(''); setTenant(null); setTenants([])
  }

  async function createRequest(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await api<DevelopmentRequest>('/studio/requests/', token, { method: 'POST', body: JSON.stringify({
        title: requestTitle, description: requestDescription, projectId: requestProjectId || null
      }) })
      setRequestTitle(''); setRequestDescription(''); setRequestProjectId(''); setShowRequest(false)
      setNotice('Geliştirme talebi Studio’ya kaydedildi.')
      setRequests(await api<DevelopmentRequest[]>('/studio/requests/', token))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (!token || (!tenant && tenants.length === 0)) return <div className="studio-auth-page"><div className="studio-auth-card"><div className="studio-brand"><span className="brand-mark"><Sparkles size={21}/></span><span>Nexora<strong> Studio</strong></span></div><p className="eyebrow">YETKİLİ GELİŞTİRME ALANI</p><h1>Oturum açın</h1><p className="muted">AI Development Studio, Platform hesabınızla ayrı ve yetkili oturum açar.</p>{error&&<div className="alert">{error}</div>}<form onSubmit={login}><label>E-posta<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>Parola<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="primary" disabled={busy}>{busy?'Giriş yapılıyor…':'Giriş yap'}</button></form><small>Kimlik doğrulaması Platform API üzerinden yapılır.</small></div></div>

  if (!tenant) return <div className="studio-auth-page"><div className="studio-auth-card"><div className="studio-brand"><span className="brand-mark"><Sparkles size={21}/></span><span>Nexora<strong> Studio</strong></span></div><p className="eyebrow">FİRMA SEÇİMİ</p><h1>Çalışma alanı seçin</h1><p className="muted">Studio oturumu seçtiğiniz tenant’ın yetkileriyle sınırlandırılır.</p>{error&&<div className="alert">{error}</div>}{tenants.length?tenants.map(item=><button className="tenant-option" key={item.id} disabled={busy} onClick={()=>void selectTenant(item)}><span><b>{item.name}</b><small>{item.role}</small></span><span>→</span></button>):<button className="secondary" onClick={logout}>Oturumu kapat</button>}</div></div>

  return <div className="studio-root"><header className="studio-app-header"><div className="studio-app-brand"><span className="brand-mark small"><Sparkles size={17}/></span><span>Nexora<strong> Studio</strong></span></div><div className="studio-user"><span><b>{tenant.name}</b><small>{tenant.role} · {localStorage.getItem('aierp.user') || 'Kullanıcı'}</small></span>{tenants.length>1&&selectionToken&&<select aria-label="Firma seç" value={tenant.id} disabled={busy} onChange={e=>{const selected=tenants.find(item=>item.id===e.target.value);if(selected)void selectTenant(selected)}}>{tenants.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button className="secondary small-button" onClick={logout}><LogOut size={15}/> Oturumu kapat</button></div></header><main className="studio-main"><div className="studio-page-heading"><div><p className="eyebrow">GELİŞTİRME ALANI · {tenant.name}</p><h1><Code2 size={28}/> AI Development Studio</h1><p className="muted">Yetkilendirilmiş projeler, ayrı workspace’ler ve insan onaylı kod değişiklikleri.</p></div><button className="primary" onClick={()=>{setError('');setShowRequest(true)}}><Plus size={16}/> Geliştirme talebi</button></div>{error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}<StudioProjects token={token} tenant={tenant}/><section className="panel studio-request-panel"><div className="panel-heading"><div><h3>Geliştirme talepleri</h3><p>{requests.length} tenant/proje kapsamlı kayıt</p></div><FileText size={20}/></div>{requests.length?requests.map(item=><article className="request-row expanded" key={item.id}><div className="request-symbol"><FileText size={17}/></div><div className="request-info"><b>{item.title}</b><p>{item.description}</p><small>{item.projectName?`${item.projectName} · `:''}{new Date(item.createdAt).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'})}</small></div><span className="request-status"><i/>{item.status==='Submitted'?'Alındı':item.status}</span></article>):<div className="empty-small">Henüz geliştirme talebi yok.</div>}</section><div className="studio-boundary"><Sparkles size={17}/><span>Studio ayrı frontend ve API servisi kullanır. Depo erişimi, kod paylaşımı ve değişiklik uygulaması proje/tenant yetkileriyle denetlenir.</span></div></main>{showRequest&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowRequest(false)}}><div className="modal"><div className="modal-head"><div><p className="eyebrow">AI DEVELOPMENT STUDIO</p><h2>Yeni geliştirme talebi</h2></div><button className="icon-button" onClick={()=>setShowRequest(false)}><X size={19}/></button></div><p className="muted modal-sub">Talep, seçili tenant’a ve isteğe bağlı olarak erişilebilir projeye bağlanır.</p>{error&&<div className="alert">{error}</div>}<form onSubmit={createRequest}><label>Talep başlığı<input value={requestTitle} onChange={e=>setRequestTitle(e.target.value)} required maxLength={180} placeholder="Örn. Stok kartına garanti süresi ekle"/></label><label>İhtiyaç açıklaması<textarea value={requestDescription} onChange={e=>setRequestDescription(e.target.value)} required maxLength={8000} rows={5} placeholder="İş ihtiyacını ve beklenen davranışı anlatın…"/></label><label>İlgili proje<select value={requestProjectId} onChange={e=>setRequestProjectId(e.target.value)}><option value="">Genel talep (projeye bağlı değil)</option>{projects.filter(p=>p.accessLevel==='TenantAdmin'||p.accessLevel==='Contributor'||p.accessLevel==='Maintainer').map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="modal-foot"><span>{requestProjectId?projects.find(p=>p.id===requestProjectId)?.name:tenant.name} alanında kaydedilecek</span><div><button type="button" className="secondary" onClick={()=>setShowRequest(false)}>Vazgeç</button><button disabled={busy} className="primary">{busy?'Kaydediliyor…':'Talebi kaydet'}</button></div></div></form></div></div>}</div>
}
