import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Activity, ArrowUpRight, Boxes, ChevronRight, CircleHelp, ClipboardCheck, Code2, FileText, FolderKanban, GitBranch, ListTodo, LogOut, Package, Plus, ShieldCheck, Sparkles, X, Zap } from 'lucide-react'
import { api, migrateLegacyRefreshToken } from './api'
import { StudioProjects } from './StudioProjects'
import './studio-dashboard.css'

type Tenant = { id: string; name: string; slug: string; role: string }
type DevelopmentProject = { id: string; name: string; repositoryUrl: string; defaultBranch: string; accessLevel: string; createdAt: string; githubAuthorized: boolean; gitHubAuthorized?: boolean }
type DevelopmentRequest = { id: string; title: string; description: string; status: string; createdAt: string; projectId: string | null; projectName: string | null }
type LoginResponse = { accessToken: string; displayName: string; tenants: Tenant[] }
type TenantSelectionResponse = { accessToken: string; tenant: Tenant }

const tokenKey = 'aierp.accessToken'
const activeTenantKey = 'aierp.tenant'
const tenantSelectionKey = 'aierp.studioSelectionToken'
const tenantListKey = 'aierp.studioTenants'
const refreshTokenKey = 'aierp.studioRefreshToken'

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
  const projectsRequestId = useRef(0)
  const [showRequest, setShowRequest] = useState(false)
  const [requestTitle, setRequestTitle] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestProjectId, setRequestProjectId] = useState('')
  const contextParams = new URLSearchParams(window.location.search)
  const contextPage = (contextParams.get('contextPage') || '').trim().slice(0, 100)
  const platformOrigin = (() => { try { const url = new URL(contextParams.get('platformOrigin') || window.location.origin); return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : window.location.origin } catch { return window.location.origin } })()
  const contextualScreen = (contextParams.get('contextLabel') || contextPage.replace(/^(inventory|sales|finance|manufacturing)-/, '').replaceAll('-', ' ')).trim().slice(0, 100)
  const contextualModuleCode = /^module:([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*):/i.exec(contextPage)?.[1] || ''
  const [activeSection, setActiveSection] = useState(window.location.hash.slice(1) || 'overview')
  const contextSection = window.location.hash.slice(1)
  const platformTools = [
    { id: 'modules', title: 'Modül pazaryeri', description: 'ERP modüllerini inceleyin ve çalışma alanınıza ekleyin.', icon: Package },
    { id: 'custom-forms', title: 'Özel formlar', description: 'İş süreçlerinize uygun formlar ve alanlar tanımlayın.', icon: FileText },
    { id: 'workflows', title: 'İş akışları', description: 'Onay ve görev adımlarını görsel olarak düzenleyin.', icon: ClipboardCheck },
    { id: 'business-rules', title: 'İş kuralları', description: 'Süreçlerin koşullarını ve otomatik davranışlarını yönetin.', icon: Zap },
    { id: 'reports', title: 'Rapor oluşturucu', description: 'İş verileri için raporları yapılandırın.', icon: Activity },
    { id: 'custom-lists', title: 'Dinamik listeler', description: 'Liste görünümlerini ve kullanıcıya sunulan kayıtları düzenleyin.', icon: ListTodo },
    { id: 'screen-views', title: 'Ekran düzenleri', description: 'Tablo ve kayıt ekranlarında alanların görünümünü ayarlayın.', icon: Boxes },
    { id: 'custom-menus', title: 'Özel menüler', description: 'Tenant çalışma alanına özel gezinme menüleri oluşturun.', icon: FolderKanban },
    { id: 'settings', title: 'Yapay zekâ tanımlaması', description: 'Kurumun AI sağlayıcılarını ve çalışma ayarlarını yönetin.', icon: Sparkles },
  ]
  const availablePlatformTools = platformTools.filter(tool=>(tool.id!=='custom-menus'&&tool.id!=='settings')||tenant?.role==='TenantAdmin')
  const platformToolHref = (toolId: string) => { const url = new URL('/', platformOrigin); url.searchParams.set('platformTool', toolId); return url.toString() }

  async function refreshProjects() {
    const requestId = ++projectsRequestId.current
    const apiProjects = await api<DevelopmentProject[]>('/studio/projects/', token)
    const registeredProjects = apiProjects.map(project => ({ ...project, githubAuthorized: project.githubAuthorized ?? project.gitHubAuthorized ?? false }))
    if (requestId === projectsRequestId.current) setProjects(registeredProjects)
    return registeredProjects
  }

  useEffect(() => {
    if (!token || !tenant) return
    let current = true
    const requestId = ++projectsRequestId.current
    void Promise.all([
      api<DevelopmentRequest[]>('/studio/requests/', token),
      api<DevelopmentProject[]>('/studio/projects/', token)
    ]).then(([items, registeredProjects]) => {
      if (!current) return
      setRequests(items)
      if (requestId === projectsRequestId.current) setProjects(registeredProjects)
    }).catch(e => { if (current) setError((e as Error).message) })
    return () => { current = false }
  }, [token, tenant?.id])

  useEffect(() => {
    const updateActiveSection = () => setActiveSection(window.location.hash.slice(1) || 'overview')
    window.addEventListener('hashchange', updateActiveSection)
    return () => window.removeEventListener('hashchange', updateActiveSection)
  }, [])

  useEffect(() => {
    if (contextSection !== 'requests' || !token || !tenant) return
    const timer = window.setTimeout(() => document.getElementById('requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    return () => window.clearTimeout(timer)
  }, [contextSection, token, tenant?.id, requests.length])

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await api<LoginResponse>('/api/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ email, password })
      })
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.removeItem(refreshTokenKey)
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
        method: 'POST', headers: { 'X-Studio-Session': 'cookie' }, body: JSON.stringify({ tenantId: item.id })
      })
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.removeItem(refreshTokenKey)
      localStorage.setItem(activeTenantKey, JSON.stringify(result.tenant))
      setTenant(result.tenant); setToken(result.accessToken)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  function logout() {
    void fetch('/api/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Studio-Session': 'cookie' },
      body: '{}'
    }).catch(() => undefined)
    for (const key of [tokenKey, refreshTokenKey, activeTenantKey, tenantSelectionKey, tenantListKey, 'aierp.user']) localStorage.removeItem(key)
    setToken(''); setSelectionToken(''); setTenant(null); setTenants([]); setError('')
  }

  useEffect(() => {
    const onSessionExpired = () => {
      logout()
      setError('Oturum süresi doldu. Lütfen yeniden giriş yapın.')
    }
    const onAccessTokenRefreshed = (event: Event) => {
      const refreshedToken = (event as CustomEvent<string>).detail
      if (refreshedToken) setToken(refreshedToken)
    }
    window.addEventListener('aierp:session-expired', onSessionExpired)
    window.addEventListener('aierp:access-token-refreshed', onAccessTokenRefreshed)
    return () => {
      window.removeEventListener('aierp:session-expired', onSessionExpired)
      window.removeEventListener('aierp:access-token-refreshed', onAccessTokenRefreshed)
    }
  }, [])

  useEffect(() => {
    void migrateLegacyRefreshToken().catch(e => setError((e as Error).message))
  }, [])

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

  const connectedProjects = projects.filter(project => project.githubAuthorized).length
  const submittedRequests = requests.filter(request => request.status === 'Submitted').length
  const recentRequests = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3)
  const requestActivity=Array.from({length:6},(_,index)=>{const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-5+index);const year=date.getFullYear(),month=date.getMonth();return {key:`${year}-${month}`,label:new Intl.DateTimeFormat('tr-TR',{month:'short'}).format(date),count:requests.filter(item=>{const created=new Date(item.createdAt);return created.getFullYear()===year&&created.getMonth()===month}).length}})
  const requestStatuses=Object.entries(requests.reduce<Record<string,number>>((counts,item)=>{counts[item.status]=(counts[item.status]||0)+1;return counts},{ })).sort((a,b)=>b[1]-a[1])
  const maxMonthlyRequests=Math.max(1,...requestActivity.map(item=>item.count)),maxStatusRequests=Math.max(1,...requestStatuses.map(([,count])=>count))
  const analyticsContent = <section className="studio-analytics-grid" id="analytics" aria-label="Studio analitikleri">
    <article className="studio-analytics-card"><header><div><span>ANALİTİK · SON 6 AY</span><h2>Geliştirme talebi eğilimi</h2><p>Talep oluşturulma tarihine göre</p></div><b>{requests.length} toplam</b></header>{requests.length?<div className="studio-month-chart" role="img" aria-label="Aylık geliştirme talebi sayısı">{requestActivity.map(item=><div className="studio-month-column" key={item.key}><strong>{item.count||''}</strong><span><i style={{height:`${item.count?Math.max(8,Math.round(item.count/maxMonthlyRequests*100)):3}%`}}/></span><small>{item.label}</small></div>)}</div>:<div className="studio-chart-empty"><Activity size={21}/><b>Henüz talep verisi yok</b><span>Geliştirme talepleri oluşturuldukça aylık eğilim burada görünür.</span></div>}</article>
    <article className="studio-analytics-card"><header><div><span>ANALİTİK · DURUM</span><h2>Talep durumları</h2><p>Mevcut taleplerin iş akışı durumu</p></div><ListTodo size={18}/></header>{requestStatuses.length?<div className="studio-status-chart">{requestStatuses.map(([status,count])=><div className="studio-status-row" key={status}><div><span>{status==='Submitted'?'Alındı':status}</span><b>{count}</b></div><i><span style={{width:`${Math.round(count/maxStatusRequests*100)}%`}}/></i></div>)}</div>:<div className="studio-chart-empty"><ListTodo size={21}/><b>Henüz durum dağılımı yok</b><span>İlk talep kaydedildiğinde durum dağılımı burada gösterilir.</span></div>}</article>
  </section>

  return <div className="studio-root studio-dashboard">
    <aside className="studio-sidebar">
      <a className="studio-app-brand" href="#overview" aria-label="Nexora Studio ana sayfa"><span className="brand-mark small"><Sparkles size={17}/></span><span>Nexora<strong> Studio</strong></span></a>
      <div className="studio-sidebar-tenant"><span className="studio-tenant-avatar">{tenant.name.slice(0, 1).toUpperCase()}</span><span><b>{tenant.name}</b><small>{tenant.role} çalışma alanı</small></span><span className="studio-tenant-dot"/></div>
      <p className="studio-nav-label">GELİŞTİRME</p>
       <nav className="studio-side-nav" aria-label="Studio gezinme">
        <a className={`studio-nav-link ${activeSection==='overview'?'active':''}`} href="#overview"><Code2 size={17}/>Genel bakış</a>
        <a className={`studio-nav-link ${activeSection==='projects'?'active':''}`} href="#projects"><FolderKanban size={17}/>Projeler<span className="studio-nav-count">{projects.length}</span></a>
        <a className={`studio-nav-link ${activeSection==='requests'?'active':''}`} href="#requests"><ListTodo size={17}/>Geliştirme talepleri<span className="studio-nav-count">{requests.length}</span></a>
        <a className={`studio-nav-link ${activeSection==='analytics'?'active':''}`} href="#analytics"><Activity size={17}/>Analitik</a>
      </nav>
      <p className="studio-nav-label studio-nav-label-spaced">PLATFORM UYARLAMA</p>
      <nav className="studio-side-nav" aria-label="Platform uyarlama"><a className={`studio-nav-link ${activeSection==='adaptation'?'active':''}`} href="#adaptation"><Boxes size={17}/>Uyarlama araçları<ChevronRight size={14}/></a></nav>
      <p className="studio-nav-label studio-nav-label-spaced">HIZLI BAŞLANGIÇ</p>
      <button className="studio-nav-link studio-nav-action" onClick={()=>{setError('');setShowRequest(true)}}><Plus size={17}/>Yeni geliştirme talebi</button>
      <div className="studio-sidebar-note"><span className="studio-note-icon"><ShieldCheck size={17}/></span><b>Kontrollü geliştirme</b><p>Çalışma alanları proje yetkileri ve insan onayıyla yönetilir.</p><span><i/>Politikalar etkin</span></div>
      <div className="studio-sidebar-profile"><span className="studio-profile-avatar">{(localStorage.getItem('aierp.user') || 'N').slice(0, 1).toUpperCase()}</span><span><b>{localStorage.getItem('aierp.user') || 'Kullanıcı'}</b><small>{tenant.role}</small></span><button className="icon-button" aria-label="Oturumu kapat" title="Oturumu kapat" onClick={logout}><LogOut size={16}/></button></div>
    </aside>

        <div className="studio-dashboard-content">
      <header className="studio-app-header studio-dashboard-topbar">
        <div className="studio-topbar-crumb"><span>Studio</span><ChevronRight size={14}/><b>{activeSection==='adaptation'?'Platform uyarlama':activeSection==='requests'?'Geliştirme talepleri':activeSection==='analytics'?'Analitik':activeSection==='projects'?'Projeler':'Genel bakış'}</b></div>
        <div className="studio-topbar-actions"><span className="studio-topbar-status"><i/>Servis alanı hazır</span>{tenants.length>1&&selectionToken&&<select aria-label="Firma seç" value={tenant.id} disabled={busy} onChange={e=>{const selected=tenants.find(item=>item.id===e.target.value);if(selected)void selectTenant(selected)}}>{tenants.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button className="secondary small-button studio-topbar-logout" onClick={logout}><LogOut size={15}/> Oturumu kapat</button></div>
      </header>

        <main className="studio-main studio-dashboard-main" id="overview">
        {activeSection==='adaptation' ? <>
          <section className="studio-adaptation-hero"><span className="studio-adaptation-hero-icon"><Boxes size={21}/></span><div><span className="studio-adaptation-kicker">PLATFORM · TENANT YAPILANDIRMASI</span><h1>Platform uyarlama</h1><p>ERP deneyimini iş süreçlerinize göre şekillendirin. Her araç mevcut Platform yetkilerinizle açılır.</p></div><span className="studio-adaptation-hero-tenant"><i/>{tenant.name}</span></section>
          <section className="studio-adaptation-section" aria-label="Uyarlama araçları"><header className="studio-adaptation-section-heading"><div><span>ARAÇLAR</span><h2>Çalışma alanınızı yapılandırın</h2><p>Bir aracı seçtiğinizde Platform’daki ilgili ekran yeni sekmede açılır.</p></div><b>{availablePlatformTools.length} araç</b></header><div className="studio-adaptation-grid">{availablePlatformTools.map((tool,index)=>{const ToolIcon=tool.icon;return <article className="studio-adaptation-card" key={tool.id}><div className="studio-adaptation-card-top"><span className="studio-adaptation-icon"><ToolIcon size={19}/></span><span className="studio-adaptation-index">{String(index+1).padStart(2,'0')}</span></div><div className="studio-adaptation-card-copy"><h3>{tool.title}</h3><p>{tool.description}</p></div><a className="studio-adaptation-open" href={platformToolHref(tool.id)} target="_blank" rel="noreferrer" aria-label={`${tool.title} ekranını aç`}>Aracı aç <ArrowUpRight size={15}/></a></article>})}</div></section>
        </> : activeSection==='projects' ? <>
          <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a href="#overview">Genel bakış</a><a className="active" href="#projects">Projeler</a><a href="#requests">Geliştirme talepleri</a><a href="#analytics">Analitik</a></nav>
          {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
          <section className="studio-hero studio-overview-heading studio-projects-page-hero"><div className="studio-overview-copy"><span className="studio-hero-kicker"><FolderKanban size={14}/> PROJE YÖNETİMİ</span><h1>Projeler</h1><p>{tenant.name} çalışma alanındaki yetkilendirilmiş depoları ve proje erişimlerini yönetin.</p></div><div className="studio-hero-actions"><button className="primary" onClick={()=>{setError('');setShowRequest(true)}}><Plus size={16}/>Yeni geliştirme talebi</button></div></section>
          <div id="projects" className="studio-projects-page-content"><StudioProjects token={token} tenant={tenant} projects={projects} setProjects={setProjects} refreshProjects={refreshProjects}/></div>
          <div className="studio-boundary"><ShieldCheck size={17}/><span>Depo erişimi proje ve tenant yetkileriyle denetlenir. Kaynak kodu paylaşımı ve çalışma alanı değişiklikleri ayrıca onay gerektirir.</span></div>
        </> : activeSection==='requests' ? <>
          <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a href="#overview">Genel bakış</a><a href="#projects">Projeler</a><a className="active" href="#requests">Geliştirme talepleri</a><a href="#analytics">Analitik</a></nav>
          {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
          <section className="studio-hero studio-overview-heading"><div className="studio-overview-copy"><span className="studio-hero-kicker"><ListTodo size={14}/> TALEP YÖNETİMİ</span><h1>Geliştirme talepleri</h1><p>{tenant.name} çalışma alanındaki geliştirme ihtiyaçları ve durumları.</p></div><div className="studio-hero-actions"><button className="primary" onClick={()=>{setError('');setShowRequest(true)}}><Plus size={16}/>Yeni geliştirme talebi</button></div></section>
          <section className="panel studio-request-panel studio-requests-page" id="requests"><div className="panel-heading"><div><span className="studio-section-eyebrow">TALEP AKIŞI</span><h3>Proje geliştirme talepleri</h3><p>{requests.length} tenant/proje kapsamlı kayıt</p></div><span className="studio-section-icon"><FileText size={18}/></span></div>{requests.length?<div className="requests-list">{requests.map(item=><article className="request-row expanded" key={item.id}><div className="request-symbol"><FileText size={17}/></div><div className="request-info"><b>{item.title}</b><p>{item.description}</p><small>{item.projectName?`${item.projectName} · `:''}{new Date(item.createdAt).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'})}</small></div><span className="request-status"><i/>{item.status==='Submitted'?'Alındı':item.status}</span></article>)}</div>:<div className="studio-empty-state"><span><ListTodo size={19}/></span><b>Henüz geliştirme talebi yok</b><small>Yeni bir ihtiyaç ekleyerek geliştirme akışını başlatın.</small><button className="secondary small-button" onClick={()=>{setError('');setShowRequest(true)}}><Plus size={14}/>Talep oluştur</button></div>}</section>
        </> : activeSection==='analytics' ? <>
          <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a href="#overview">Genel bakış</a><a href="#projects">Projeler</a><a href="#requests">Geliştirme talepleri</a><a className="active" href="#analytics">Analitik</a></nav>
          <section className="studio-hero studio-overview-heading"><div className="studio-overview-copy"><span className="studio-hero-kicker"><Activity size={14}/> RAPORLAMA</span><h1>Analitik</h1><p>{tenant.name} çalışma alanındaki geliştirme taleplerinin eğilimi ve iş akışı durumu.</p></div></section>
          {analyticsContent}
        </> : <>
        {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
        {contextualScreen&&<section className="studio-context-launch"><span><Code2 size={18}/></span><div><small>ERP GELİŞTİRİCİ MODU · AKTİF EKRAN</small><b>{contextualScreen}{contextualModuleCode&&<code className="studio-context-module-code">{contextualModuleCode}</code>}</b><p>Modül kodu talebe taşınır. İlgili kaynak deposunu ayrıca seçin; Project Explorer’da kodu düzenleyip farkları inceleyerek onaylayabilirsiniz.</p></div><button className="secondary small-button" onClick={()=>{setRequestTitle(`${contextualScreen} ekranını uyarlama`);setRequestDescription(`${contextualScreen} ekranı için istenen değişiklikleri açıklayın.${contextualModuleCode?` Modül kodu: ${contextualModuleCode}.`:''} İlgili kaynak deposunu seçin; değişiklikler onaylı izole çalışma alanında hazırlanır.`);setShowRequest(true)}}><Plus size={14}/>Uyarlama talebi</button></section>}
        <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a className={activeSection==='overview'?'active':''} href="#overview">Genel bakış</a><a className={activeSection==='projects'?'active':''} href="#projects">Projeler</a><a href="#requests">Geliştirme talepleri</a><a href="#analytics">Analitik</a></nav>
                <section className="studio-hero studio-overview-heading"><div className="studio-overview-copy"><span className="studio-hero-kicker"><Sparkles size={14}/> AI DEVELOPMENT STUDIO</span><h1>Nexora Studio</h1><p>{tenant.name} çalışma alanı · Projeleri, geliştirme taleplerini ve yetki kapsamını yönetin.</p></div><div className="studio-hero-actions"><button className="primary" onClick={()=>{setError('');setShowRequest(true)}}><Plus size={16}/>Yeni geliştirme talebi</button><a className="secondary" href="#projects"><FolderKanban size={16}/>Projeleri görüntüle<ArrowUpRight size={14}/></a></div></section>

        <section className="studio-metrics" aria-label="Studio özeti">
          <article className="studio-metric-card"><span className="studio-metric-icon violet"><FolderKanban size={19}/></span><div><small>Erişilebilir proje</small><b>{projects.length}</b><span>Bu çalışma alanında</span></div><span className="studio-metric-accent">01</span></article>
          <article className="studio-metric-card"><span className="studio-metric-icon blue"><GitBranch size={19}/></span><div><small>GitHub bağlantısı</small><b>{connectedProjects}<small> / {projects.length}</small></b><span>Yetkilendirilmiş depo</span></div><span className="studio-metric-accent">02</span></article>
          <article className="studio-metric-card"><span className="studio-metric-icon amber"><ListTodo size={19}/></span><div><small>Geliştirme talebi</small><b>{requests.length}</b><span>{submittedRequests} yeni kayıt</span></div><span className="studio-metric-accent">03</span></article>
          <article className="studio-metric-card studio-metric-live"><span className="studio-metric-icon green"><Activity size={19}/></span><div><small>Yetki kapsamı</small><b>Aktif</b><span>Tenant sınırları uygulanıyor</span></div><span className="studio-live-pill"><i/>GÜVENLİ</span></article>
                </section>

        <div className="studio-dashboard-grid">
          <div className="studio-dashboard-primary studio-overview-shortcuts">
            <a className="studio-overview-shortcut" href="#projects"><span className="studio-overview-shortcut-icon"><FolderKanban size={18}/></span><span><small>PROJE ALANI</small><b>Projelerinizi yönetin</b><i>{projects.length} yetkilendirilmiş proje · depoları ve çalışma alanlarını görüntüleyin</i></span><ArrowUpRight size={16}/></a>
            <a className="studio-overview-shortcut" href="#requests"><span className="studio-overview-shortcut-icon requests"><ListTodo size={18}/></span><span><small>GELİŞTİRME AKIŞI</small><b>Talepleri takip edin</b><i>{requests.length} kayıt · yeni geliştirme ihtiyacı oluşturun ve durumunu izleyin</i></span><ArrowUpRight size={16}/></a>
          </div>
          <aside className="studio-dashboard-rail">
            <section className="studio-rail-card studio-focus-card"><div className="studio-rail-heading"><span className="studio-rail-icon"><Sparkles size={17}/></span><span><small>STUDIO REHBERİ</small><b>Geliştirme akışı</b></span></div><div className="studio-flow-step"><span>01</span><div><b>Projeyi seç</b><small>Yetkili depoya güvenli erişim</small></div><i>✓</i></div><div className="studio-flow-step"><span>02</span><div><b>İzole alan iste</b><small>Değişiklik için ayrı checkout</small></div><i>02</i></div><div className="studio-flow-step"><span>03</span><div><b>İncele ve onayla</b><small>İnsan kontrolünde ilerleme</small></div><i>03</i></div><div className="studio-rail-foot"><ShieldCheck size={15}/><span>Onaysız değişiklik uygulanmaz.</span></div></section>
            <section className="studio-rail-card studio-activity-card"><div className="studio-rail-heading"><span className="studio-rail-icon blue"><Activity size={17}/></span><span><small>SON HAREKETLER</small><b>Talep geçmişi</b></span></div>{recentRequests.length?recentRequests.map((item,index)=><div className="studio-activity-row" key={item.id}><span className={'studio-activity-dot tone-'+(index%3)}/><div><b>{item.title}</b><small>{item.projectName || 'Genel talep'}</small></div><time>{new Date(item.createdAt).toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}</time></div>):<div className="studio-activity-empty">Yeni talepleriniz ve durumları burada görünür.</div>}</section>
            <div className="studio-help-card"><span><CircleHelp size={16}/></span><div><b>Yardıma mı ihtiyacınız var?</b><p>Geliştirme talebinde ihtiyacınızı ve beklenen sonucu açıklayın.</p></div></div>
          </aside>
        </div>
        <div className="studio-boundary"><ShieldCheck size={17}/><span>Studio ayrı frontend ve API servisi kullanır. Depo erişimi, kod paylaşımı ve değişiklik uygulaması proje/tenant yetkileriyle denetlenir.</span></div>
        </>}
      </main>
    </div>
    {showRequest&&<div className="modal-backdrop studio-request-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowRequest(false)}}><div className="modal studio-request-modal" role="dialog" aria-modal="true" aria-labelledby="studio-request-title"><div className="modal-head studio-request-modal-head"><div><p className="eyebrow">AI DEVELOPMENT STUDIO · TALEP FORMU</p><h2 id="studio-request-title">Yeni geliştirme talebi</h2><p>İhtiyacınızı paylaşın; doğru projeyle eşleştirip takip etmeyi kolaylaştıralım.</p></div><button className="icon-button" aria-label="Kapat" onClick={()=>setShowRequest(false)}><X size={19}/></button></div><div className="studio-request-modal-context"><span><ListTodo size={16}/></span><p>Talep <b>{tenant.name}</b> çalışma alanına kaydedilir. İsterseniz erişiminiz olan bir projeye bağlayabilirsiniz.</p></div>{error&&<div className="alert">{error}</div>}<form onSubmit={createRequest}><label>Talep başlığı<input value={requestTitle} onChange={e=>setRequestTitle(e.target.value)} required maxLength={180} placeholder="Örn. Stok kartına garanti süresi ekle"/><small>İhtiyacı kısa ve anlaşılır biçimde özetleyin.</small></label><label>İhtiyaç açıklaması<textarea value={requestDescription} onChange={e=>setRequestDescription(e.target.value)} required maxLength={8000} rows={5} placeholder="İş ihtiyacını, mevcut durumu ve beklenen davranışı anlatın…"/><small>Beklenen sonucu ve önemli iş kurallarını ekleyin.</small></label><label>İlgili proje<select value={requestProjectId} onChange={e=>setRequestProjectId(e.target.value)}><option value="">Genel talep (projeye bağlı değil)</option>{projects.filter(p=>p.accessLevel==='TenantAdmin'||p.accessLevel==='Contributor'||p.accessLevel==='Maintainer').map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><small>Proje seçmezseniz talep tenant genelinde görünür.</small></label><div className="modal-foot"><span><ShieldCheck size={15}/>{requestProjectId?projects.find(p=>p.id===requestProjectId)?.name:tenant.name} alanında kaydedilecek</span><div><button type="button" className="secondary" onClick={()=>setShowRequest(false)}>Vazgeç</button><button disabled={busy} className="primary"><Plus size={15}/>{busy?'Kaydediliyor…':'Talebi kaydet'}</button></div></div></form></div></div>}
  </div>
}
