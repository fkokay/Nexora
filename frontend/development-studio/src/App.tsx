import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Activity, ArrowUpRight, Boxes, CalendarDays, Check, ChevronRight, CircleHelp, ClipboardCheck, Code2, FileText, FolderKanban, GitBranch, ListTodo, LogOut, Package, Pencil, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, TrendingUp, X, Zap } from 'lucide-react'
import { api, migrateLegacyRefreshToken } from './api'
import { StudioProjects } from './StudioProjects'
import { moduleStarterFiles } from './moduleStarterFiles'
import './studio-dashboard.css'

type Tenant = { id: string; name: string; slug: string; role: string }
type DevelopmentProject = { id: string; name: string; repositoryUrl: string; defaultBranch: string; accessLevel: string; createdAt: string; githubAuthorized: boolean; gitHubAuthorized?: boolean }
type DevelopmentRequest = { id: string; title: string; description: string; status: string; createdAt: string; projectId: string | null; projectName: string | null; canEdit: boolean }
type MarketplaceModule = { moduleCode: string; version: string; publisher: string; artifactSha256: string; publishedAt: string | null; manifest: { displayName?: string; dependencies: { moduleCode: string; minimumVersion: string }[]; permissions: { code: string; description: string }[] } | null; isActivated: boolean; activatedVersion: string | null; runtimeStatus: string }
const studioModuleStarters = [
  { id: 'greeting', name: 'Selamlama modülü', moduleCode: 'ornek.selamlama', description: 'Bir ad alır ve kişiselleştirilmiş bir karşılama mesajı döndürür.' },
  { id: 'price', name: 'Fiyat hesaplama modülü', moduleCode: 'ornek.fiyat-hesapla', description: 'Birim fiyat, adet ve indirim oranından net tutarı hesaplar.' },
  { id: 'text-summary', name: 'Metin özeti modülü', moduleCode: 'ornek.metin-ozeti', description: 'Metindeki kelime ve karakter sayısını hesaplar.' },
] as const
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
  const [marketplaceModules, setMarketplaceModules] = useState<MarketplaceModule[]>([])
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const [marketplaceError, setMarketplaceError] = useState('')
  const [marketplaceNotice, setMarketplaceNotice] = useState('')
  const [marketplaceQuery, setMarketplaceQuery] = useState('')
  const [marketplaceBusy, setMarketplaceBusy] = useState('')
  const [analyticsRange, setAnalyticsRange] = useState(180)
  const [analyticsProject, setAnalyticsProject] = useState('all')
  const projectsRequestId = useRef(0)
  const moduleStarterPrompted = useRef(false)
  const [showRequest, setShowRequest] = useState(false)
  const [requestTitle, setRequestTitle] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestProjectId, setRequestProjectId] = useState('')
  const [moduleRequestDraft, setModuleRequestDraft] = useState(false)
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const contextParams = new URLSearchParams(window.location.search)
  const contextPage = (contextParams.get('contextPage') || '').trim().slice(0, 100)
  const configuredPlatformOrigin = import.meta.env.VITE_PLATFORM_URL?.trim()
  const platformOrigin = (() => {
    for (const candidate of [contextParams.get('platformOrigin'), configuredPlatformOrigin]) {
      if (!candidate) continue
      try {
        const url = new URL(candidate)
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== window.location.origin) return url.origin
      } catch { /* Try the configured origin, then keep the current origin. */ }
    }
    return window.location.origin
  })()
  const contextualScreen = (contextParams.get('contextLabel') || contextPage.replace(/^(inventory|sales|finance|manufacturing)-/, '').replaceAll('-', ' ')).trim().slice(0, 100)
  const contextualModuleCode = /^module:([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*):/i.exec(contextPage)?.[1] || ''
  const [moduleStarterId, setModuleStarterId] = useState(() => ['greeting', 'price', 'text-summary'].includes(contextParams.get('moduleStarter') || '') ? contextParams.get('moduleStarter') || '' : '')
  const [moduleDisplayName, setModuleDisplayName] = useState(contextualScreen)
  const [moduleCode, setModuleCode] = useState(contextualModuleCode)
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
  const platformToolHref = (toolId: string) => { const url = new URL('/', platformOrigin); url.searchParams.set('platformTool', toolId); url.searchParams.set('embeddedStudio', '1'); return url.toString() }

  async function refreshProjects() {
    const requestId = ++projectsRequestId.current
    const apiProjects = await api<DevelopmentProject[]>('/studio/projects/', token)
    const registeredProjects = apiProjects.map(project => ({ ...project, githubAuthorized: project.githubAuthorized ?? project.gitHubAuthorized ?? false }))
    if (requestId === projectsRequestId.current) setProjects(registeredProjects)
    return registeredProjects
  }

  async function refreshMarketplace() {
    setMarketplaceLoading(true); setMarketplaceError('')
    try { setMarketplaceModules(await api<MarketplaceModule[]>('/api/tenant/modules/marketplace', token)) }
    catch (cause) { setMarketplaceError((cause as Error).message) }
    finally { setMarketplaceLoading(false) }
  }

  async function toggleMarketplaceModule(item: MarketplaceModule, remove = false) {
    if (remove && !window.confirm(`${item.manifest?.displayName || item.moduleCode} modülünü tenant kataloğunuzdan çıkarmak istiyor musunuz?`)) return
    setMarketplaceBusy(item.moduleCode); setMarketplaceError(''); setMarketplaceNotice('')
    try {
      if (remove) {
        await api<void>(`/api/tenant/modules/${encodeURIComponent(item.moduleCode)}`, token, { method: 'DELETE' })
        setMarketplaceNotice(`${item.moduleCode} tenant kataloğundan çıkarıldı.`)
      } else {
        await api('/api/tenant/modules/activate', token, { method: 'POST', body: JSON.stringify({ moduleCode: item.moduleCode, version: item.version }) })
        setMarketplaceNotice(`${item.moduleCode}@${item.version} tenant çalışma alanına eklendi.`)
      }
      await refreshMarketplace()
    } catch (cause) { setMarketplaceError((cause as Error).message) }
    finally { setMarketplaceBusy('') }
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
    if (activeSection === 'marketplace' && token && tenant) void refreshMarketplace()
  }, [activeSection, token, tenant?.id])

  useEffect(() => {
    if (!moduleStarterId || !token || !tenant || moduleStarterPrompted.current) return
    moduleStarterPrompted.current = true
    openModuleStarterRequest()
  }, [moduleStarterId, token, tenant?.id, contextualScreen, contextualModuleCode])

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
      const moduleMetadata = moduleRequestDraft ? `\n\nModül adı: ${moduleDisplayName.trim()}\nModül kodu: ${moduleCode.trim().toLowerCase()}\nModül şablonu: ${moduleStarterId}` : ''
      await api<DevelopmentRequest>('/studio/requests/', token, { method: 'POST', body: JSON.stringify({
        title: requestTitle, description: `${requestDescription.trim()}${moduleMetadata}`, projectId: requestProjectId || null
      }) })
      closeRequestDialog()
      if (moduleRequestDraft) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#projects`)
        setActiveSection('projects')
        setNotice('Modül geliştirme talebi kaydedildi. Projeler bölümünden yetkili deponuzda izole çalışma alanı isteyin.')
      } else setNotice('Geliştirme talebi Studio’ya kaydedildi.')
      setRequests(await api<DevelopmentRequest[]>('/studio/requests/', token))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function updateRequest(event: FormEvent) {
    event.preventDefault()
    if (!editingRequestId) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api<DevelopmentRequest>(`/studio/requests/${encodeURIComponent(editingRequestId)}`, token, { method: 'PUT', body: JSON.stringify({
        title: requestTitle, description: requestDescription, projectId: requestProjectId || null
      }) })
      closeRequestDialog()
      setNotice('Geliştirme talebi güncellendi.')
      setRequests(await api<DevelopmentRequest[]>('/studio/requests/', token))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function deleteRequest(request: DevelopmentRequest) {
    if (!request.canEdit || request.status !== 'Submitted') return
    if (!window.confirm(`“${request.title}” talebini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api<void>(`/studio/requests/${encodeURIComponent(request.id)}`, token, { method: 'DELETE' })
      setRequests(items => items.filter(item => item.id !== request.id))
      setNotice('Geliştirme talebi silindi.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  function closeRequestDialog() {
    setShowRequest(false); setEditingRequestId(null); setRequestTitle(''); setRequestDescription(''); setRequestProjectId(''); setModuleRequestDraft(false)
  }

  function openNewRequest() {
    setEditingRequestId(null); setRequestTitle(''); setRequestDescription(''); setRequestProjectId(''); setModuleRequestDraft(false); setError(''); setShowRequest(true)
  }

  function openModuleStarterRequest(starter?: typeof studioModuleStarters[number]) {
    const starterId = starter?.id || moduleStarterId
    const displayName = starter?.name || contextualScreen
    const code = starter?.moduleCode || contextualModuleCode
    setModuleStarterId(starterId)
    setEditingRequestId(null)
    setModuleRequestDraft(true)
    setModuleDisplayName(displayName)
    setModuleCode(code)
    setRequestTitle(`${displayName.replace(/\s+modülü?$/i, '') || 'Yeni'} modülünü geliştirme`)
    setRequestDescription(`${displayName} başlangıç şablonunu temel alarak kendi modülümü geliştirmek istiyorum. Modül kodu: ${code}. manifest.json, Cargo.toml ve src/lib.rs dosyalarını seçilen GitHub projesinde oluşturup düzenleyin.`)
    setRequestProjectId('')
    setError('')
    setShowRequest(true)
  }

  function openRequestForEdit(request: DevelopmentRequest) {
    setEditingRequestId(request.id); setModuleRequestDraft(false); setRequestTitle(request.title); setRequestDescription(request.description); setRequestProjectId(request.projectId || ''); setError(''); setShowRequest(true)
  }

  if (!token || (!tenant && tenants.length === 0)) return <div className="studio-auth-page"><div className="studio-auth-card"><div className="studio-brand"><span className="brand-mark"><Sparkles size={21}/></span><span>Nexora<strong> Studio</strong></span></div><p className="eyebrow">YETKİLİ GELİŞTİRME ALANI</p><h1>Oturum açın</h1><p className="muted">AI Development Studio, Platform hesabınızla ayrı ve yetkili oturum açar.</p>{error&&<div className="alert">{error}</div>}<form onSubmit={login}><label>E-posta<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>Parola<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="primary" disabled={busy}>{busy?'Giriş yapılıyor…':'Giriş yap'}</button></form><small>Kimlik doğrulaması Platform API üzerinden yapılır.</small></div></div>

  if (!tenant) return <div className="studio-auth-page"><div className="studio-auth-card"><div className="studio-brand"><span className="brand-mark"><Sparkles size={21}/></span><span>Nexora<strong> Studio</strong></span></div><p className="eyebrow">FİRMA SEÇİMİ</p><h1>Çalışma alanı seçin</h1><p className="muted">Studio oturumu seçtiğiniz tenant’ın yetkileriyle sınırlandırılır.</p>{error&&<div className="alert">{error}</div>}{tenants.length?tenants.map(item=><button className="tenant-option" key={item.id} disabled={busy} onClick={()=>void selectTenant(item)}><span><b>{item.name}</b><small>{item.role}</small></span><span>→</span></button>):<button className="secondary" onClick={logout}>Oturumu kapat</button>}</div></div>

  const connectedProjects = projects.filter(project => project.githubAuthorized).length
  const submittedRequests = requests.filter(request => request.status === 'Submitted').length
  const recentRequests = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3)
  const analyticsNow = new Date()
  const analyticsStart = new Date(analyticsNow.getTime() - analyticsRange * 86400000)
  const analyticsScopedRequests = requests.filter(item => analyticsProject === 'all' || item.projectId === analyticsProject)
  const analyticsRequests = analyticsScopedRequests.filter(item => { const created = Date.parse(item.createdAt); return Number.isFinite(created) && created >= analyticsStart.getTime() && created <= analyticsNow.getTime() })
  const analyticsPreviousStart = new Date(analyticsStart.getTime() - analyticsRange * 86400000)
  const analyticsPreviousCount = analyticsScopedRequests.filter(item => { const created = Date.parse(item.createdAt); return Number.isFinite(created) && created >= analyticsPreviousStart.getTime() && created < analyticsStart.getTime() }).length
  const analyticsChange = analyticsPreviousCount ? Math.round((analyticsRequests.length - analyticsPreviousCount) / analyticsPreviousCount * 100) : null
  const closedStatuses = ['completed', 'closed', 'rejected', 'cancelled', 'canceled']
  const analyticsOpenCount = analyticsRequests.filter(item => !closedStatuses.includes(item.status.toLowerCase())).length
  const analyticsLinkedCount = analyticsRequests.filter(item => item.projectId).length
  const analyticsBucketCount = analyticsRange <= 30 ? 5 : analyticsRange <= 90 ? 13 : analyticsRange <= 180 ? 6 : 12
  const analyticsBuckets = Array.from({ length: analyticsBucketCount }, (_, index) => {
    const from = new Date(analyticsStart.getTime() + (analyticsRange * 86400000 * index / analyticsBucketCount))
    const to = new Date(analyticsStart.getTime() + (analyticsRange * 86400000 * (index + 1) / analyticsBucketCount))
    return { key: `${from.toISOString()}-${index}`, label: analyticsRange <= 90 ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(from) : new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(from), count: analyticsRequests.filter(item => { const created = Date.parse(item.createdAt); return created >= from.getTime() && (index === analyticsBucketCount - 1 ? created <= to.getTime() : created < to.getTime()) }).length }
  })
  const analyticsStatuses = Object.entries(analyticsRequests.reduce<Record<string, number>>((counts, item) => { counts[item.status] = (counts[item.status] || 0) + 1; return counts }, {})).sort((a, b) => b[1] - a[1])
  const analyticsProjects = Object.entries(analyticsRequests.reduce<Record<string, number>>((counts, item) => { const label = item.projectName || 'Bağımsız talep'; counts[label] = (counts[label] || 0) + 1; return counts }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const analyticsMaxBucket = Math.max(1, ...analyticsBuckets.map(item => item.count))
  const analyticsMaxStatus = Math.max(1, ...analyticsStatuses.map(([, count]) => count))
  const analyticsMaxProject = Math.max(1, ...analyticsProjects.map(([, count]) => count))
  const analyticsRecentRequests = [...analyticsRequests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6)
  const statusLabel = (status: string) => ({ Submitted: 'Alındı', InProgress: 'Devam ediyor', Completed: 'Tamamlandı', Rejected: 'Reddedildi', Cancelled: 'İptal edildi' }[status] || status)
  const filteredMarketplaceModules = marketplaceModules.filter(item => `${item.manifest?.displayName || ''} ${item.moduleCode} ${item.publisher}`.toLocaleLowerCase('tr-TR').includes(marketplaceQuery.toLocaleLowerCase('tr-TR')))
  const analyticsContent = <section className="studio-analytics-page" id="analytics" aria-label="Studio analitikleri">
    <header className="studio-analytics-heading"><div><span className="studio-analytics-kicker"><Activity size={14}/> RAPORLAMA · STUDIO</span><h1>Analitik</h1><p>Talep hacmini, iş akışını ve proje dağılımını tek ekrandan takip edin.</p></div><div className="studio-analytics-filters"><label><CalendarDays size={15}/><select aria-label="Rapor dönemi" value={analyticsRange} onChange={event => setAnalyticsRange(Number(event.target.value))}><option value={30}>Son 30 gün</option><option value={90}>Son 90 gün</option><option value={180}>Son 6 ay</option><option value={365}>Son 12 ay</option></select></label><label><FolderKanban size={15}/><select aria-label="Proje filtresi" value={analyticsProject} onChange={event => setAnalyticsProject(event.target.value)}><option value="all">Tüm projeler</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div></header>
    <div className="studio-analytics-kpis">
      <article><span><ListTodo size={17}/></span><small>Toplam talep</small><strong>{analyticsRequests.length}</strong><p>{analyticsChange === null ? 'Önceki dönemde kayıt yok' : <><TrendingUp size={13}/> Önceki döneme göre <b>{analyticsChange > 0 ? '+' : ''}{analyticsChange}%</b></>}</p></article>
      <article><span className="violet"><Activity size={17}/></span><small>Açık iş</small><strong>{analyticsOpenCount}</strong><p>İş akışında devam eden talepler</p></article>
      <article><span className="green"><FolderKanban size={17}/></span><small>Projeye bağlı</small><strong>{analyticsLinkedCount}</strong><p>{analyticsRequests.length ? Math.round(analyticsLinkedCount / analyticsRequests.length * 100) : 0}% proje bağlantısı</p></article>
      <article><span className="orange"><GitBranch size={17}/></span><small>Aktif proje</small><strong>{new Set(analyticsRequests.filter(item => item.projectId).map(item => item.projectId)).size}</strong><p>Seçili dönemde talep alan</p></article>
    </div>
    <div className="studio-analytics-main-grid">
      <article className="studio-analytics-card studio-analytics-trend"><header><div><span>TALEP HACMİ</span><h2>Geliştirme talebi eğilimi</h2><p>Seçilen dönem içindeki kayıtlar · {analyticsRequests.length} talep</p></div><Activity size={18}/></header>{analyticsRequests.length?<div className="studio-advanced-chart" style={{ gridTemplateColumns: `repeat(${analyticsBucketCount}, minmax(0, 1fr))` }} role="img" aria-label="Seçilen dönemde talep eğilimi">{analyticsBuckets.map(item=><div className="studio-advanced-column" key={item.key}><b>{item.count || ''}</b><span><i style={{ height: `${item.count ? Math.max(8, Math.round(item.count / analyticsMaxBucket * 100)) : 2}%` }}/></span><small>{item.label}</small></div>)}</div>:<div className="studio-chart-empty"><Activity size={21}/><b>Bu dönemde talep bulunmuyor</b><span>Farklı bir dönem veya proje seçerek kayıtları görüntüleyin.</span></div>}</article>
      <article className="studio-analytics-card"><header><div><span>İŞ AKIŞI</span><h2>Talep durumları</h2><p>Durumlara göre kayıt dağılımı</p></div><ListTodo size={18}/></header>{analyticsStatuses.length?<div className="studio-status-chart">{analyticsStatuses.map(([status, count]) => <div className="studio-status-row" key={status}><div><span>{statusLabel(status)}</span><b>{count}</b></div><i><span style={{ width: `${Math.round(count / analyticsMaxStatus * 100)}%` }}/></i></div>)}</div>:<div className="studio-chart-empty"><ListTodo size={21}/><b>Durum verisi yok</b><span>Seçilen aralıkta talep bulunamadı.</span></div>}</article>
    </div>
    <div className="studio-analytics-lower-grid">
      <article className="studio-analytics-card"><header><div><span>PROJE DAĞILIMI</span><h2>Talep alan projeler</h2><p>En fazla talep içeren ilk 5 grup</p></div><FolderKanban size={18}/></header>{analyticsProjects.length?<div className="studio-project-workload">{analyticsProjects.map(([name, count], index) => <div key={name}><span className="studio-workload-rank">0{index + 1}</span><span className="studio-workload-name">{name}<i><b style={{ width: `${Math.round(count / analyticsMaxProject * 100)}%` }}/></i></span><strong>{count}</strong></div>)}</div>:<div className="studio-chart-empty"><FolderKanban size={21}/><b>Proje dağılımı yok</b><span>Projelere bağlanan talepler burada listelenir.</span></div>}</article>
      <article className="studio-analytics-card studio-analytics-recent"><header><div><span>SON KAYITLAR</span><h2>Güncel talepler</h2><p>Seçilen dönemin en yeni kayıtları</p></div><ArrowUpRight size={18}/></header>{analyticsRecentRequests.length?<div className="studio-analytics-table-wrap"><table><thead><tr><th>Talep</th><th>Proje</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>{analyticsRecentRequests.map(item=><tr key={item.id}><td><b>{item.title}</b></td><td>{item.projectName || 'Bağımsız'}</td><td><span className={`studio-analytics-status status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></td><td>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(item.createdAt))}</td></tr>)}</tbody></table></div>:<div className="studio-chart-empty"><FileText size={21}/><b>Henüz kayıt yok</b><span>Yeni geliştirme talepleri burada görünür.</span></div>}</article>
    </div>
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
      <nav className="studio-side-nav" aria-label="Platform uyarlama"><a className={`studio-nav-link ${activeSection==='adaptation'||activeSection==='marketplace'||activeSection.startsWith('tool-')?'active':''}`} href="#adaptation"><Boxes size={17}/>Uyarlama araçları<ChevronRight size={14}/></a></nav>
      <p className="studio-nav-label studio-nav-label-spaced">HIZLI BAŞLANGIÇ</p>
      <button className="studio-nav-link studio-nav-action" onClick={openNewRequest}><Plus size={17}/>Yeni geliştirme talebi</button>
      <div className="studio-sidebar-note"><span className="studio-note-icon"><ShieldCheck size={17}/></span><b>Kontrollü geliştirme</b><p>Çalışma alanları proje yetkileri ve insan onayıyla yönetilir.</p><span><i/>Politikalar etkin</span></div>
      <div className="studio-sidebar-profile"><span className="studio-profile-avatar">{(localStorage.getItem('aierp.user') || 'N').slice(0, 1).toUpperCase()}</span><span><b>{localStorage.getItem('aierp.user') || 'Kullanıcı'}</b><small>{tenant.role}</small></span><button className="icon-button" aria-label="Oturumu kapat" title="Oturumu kapat" onClick={logout}><LogOut size={16}/></button></div>
    </aside>

        <div className="studio-dashboard-content">
      <header className="studio-app-header studio-dashboard-topbar">
        <div className="studio-topbar-crumb"><span>Studio</span><ChevronRight size={14}/><b>{activeSection.startsWith('tool-')?platformTools.find(tool=>tool.id===activeSection.slice(5))?.title||'Uyarlama aracı':activeSection==='marketplace'?'Modül pazaryeri':activeSection==='adaptation'?'Platform uyarlama':activeSection==='requests'?'Geliştirme talepleri':activeSection==='analytics'?'Analitik':activeSection==='projects'?'Projeler':'Genel bakış'}</b></div>
        <div className="studio-topbar-actions"><span className="studio-topbar-status"><i/>Servis alanı hazır</span>{tenants.length>1&&selectionToken&&<select aria-label="Firma seç" value={tenant.id} disabled={busy} onChange={e=>{const selected=tenants.find(item=>item.id===e.target.value);if(selected)void selectTenant(selected)}}>{tenants.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button className="secondary small-button studio-topbar-logout" onClick={logout}><LogOut size={15}/> Oturumu kapat</button></div>
      </header>

        <main className="studio-main studio-dashboard-main" id="overview">
        {activeSection==='marketplace' ? <>
          <nav className="studio-product-tabs" aria-label="Studio uyarlama bölümleri"><a href="#adaptation">Uyarlama araçları</a><a className="active" href="#marketplace">Modül pazaryeri</a></nav>
          <section className="studio-marketplace-heading"><div><span><Package size={14}/> MODÜL YÖNETİMİ · STUDIO</span><h1>Modül pazaryeri</h1><p>Yayımlanmış modülleri yönetin veya örnek şablonları temel alarak kendi modülünüzü geliştirin.</p></div><button className="secondary" type="button" onClick={()=>void refreshMarketplace()} disabled={marketplaceLoading}><RefreshCw size={15}/>{marketplaceLoading?'Yenileniyor…':'Kataloğu yenile'}</button></section>
          <div className="studio-marketplace-boundary"><ShieldCheck size={16}/><span>Yayımlanmış paketler imza ve runtime doğrulamasıyla etkinleşir. Örnek şablonlar geliştirme başlangıcıdır; yayımlanmış modül olarak tenant’a eklenmez.</span></div>
          {marketplaceError&&<div className="alert" role="alert">{marketplaceError}</div>}{marketplaceNotice&&<div className="notice" role="status">{marketplaceNotice}</div>}
          <section className="studio-marketplace-starters"><header><div><span>ÖRNEKLER</span><h2>Kendi modülünüz için başlangıç şablonları</h2><p>Şablon seçtiğinizde modül adı ve teknik kodu geliştirme talebine aktarılır.</p></div><b>{studioModuleStarters.length} şablon</b></header><div className="studio-marketplace-starter-grid">{studioModuleStarters.map((starter,index)=>{const files=moduleStarterFiles(starter.id,starter.moduleCode,starter.name);return <article className="studio-marketplace-starter" key={starter.id}><div className="studio-marketplace-starter-top"><span><Code2 size={17}/></span><small>{String(index+1).padStart(2,'0')} · WASM</small></div><h3>{starter.name}</h3><p>{starter.description}</p><code>{starter.moduleCode}</code><details><summary>Şablon dosyalarını incele</summary><div>{files.map(file=><details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}</div></details><button className="primary small-button" type="button" onClick={()=>openModuleStarterRequest(starter)}><Code2 size={14}/>Bu şablonla Studio’da geliştir</button></article>})}</div></section>
          <section className="studio-marketplace-catalog"><header><div><span>YAYIMLANMIŞ PAKETLER</span><h2>Tenant modül kataloğu</h2><p>Etkinleştirme tenant yöneticisi yetkisi ve platform lisans sınırlarına tabidir.</p></div><label><Search size={15}/><input type="search" value={marketplaceQuery} onChange={event=>setMarketplaceQuery(event.target.value)} placeholder="Ad, kod veya yayıncı ara" aria-label="Modül kataloğunda ara"/></label></header>{marketplaceLoading&&marketplaceModules.length===0?<div className="studio-marketplace-empty">Yayımlanmış modüller yükleniyor…</div>:filteredMarketplaceModules.length===0?<div className="studio-marketplace-empty"><Package size={21}/><b>{marketplaceModules.length?'Eşleşen modül yok':'Henüz yayımlanmış modül yok'}</b><span>{marketplaceModules.length?'Arama terimini değiştirip yeniden deneyin.':'Platform yayın yöneticisi modül yayımladığında burada görünür.'}</span></div>:<div className="studio-marketplace-published-grid">{filteredMarketplaceModules.map(item=>{const name=item.manifest?.displayName||item.moduleCode;const canUpdate=item.isActivated&&item.activatedVersion!==item.version;return <article className="studio-marketplace-published" key={`${item.moduleCode}@${item.version}`}><div className="studio-marketplace-published-top"><span><Boxes size={18}/></span><b className={item.runtimeStatus==='Ready'?'ready':'blocked'}>{item.runtimeStatus==='Ready'?'Runtime hazır':'Runtime engelli'}</b></div><h3>{name}</h3><p><code>{item.moduleCode}</code> · v{item.version} · {item.publisher}</p><small>{item.isActivated?`Tenant’ta etkin · ${item.activatedVersion||'sürüm bilinmiyor'}`:'Tenant’ta etkin değil'}</small>{item.manifest&&<details><summary>İzin ve bağımlılıklar</summary><p>Bağımlılıklar: {item.manifest.dependencies.length?item.manifest.dependencies.map(dependency=>`${dependency.moduleCode} ≥ ${dependency.minimumVersion}`).join(', '):'Yok'}</p><p>İzinler: {item.manifest.permissions.length?item.manifest.permissions.map(permission=>permission.code).join(', '):'Yok'}</p></details>}<div className="studio-marketplace-actions">{tenant.role==='TenantAdmin'&&(!item.isActivated||canUpdate)&&<button className="primary small-button" type="button" disabled={!!marketplaceBusy||item.runtimeStatus!=='Ready'} onClick={()=>void toggleMarketplaceModule(item)}>{marketplaceBusy===item.moduleCode?'Doğrulanıyor…':<><Check size={14}/>{canUpdate?`v${item.version} sürümüne geç`:'Tenant’a ekle'}</>}</button>}{tenant.role==='TenantAdmin'&&item.isActivated&&<button className="secondary small-button" type="button" disabled={!!marketplaceBusy} onClick={()=>void toggleMarketplaceModule(item,true)}><Trash2 size={14}/>Tenant’tan çıkar</button>}</div></article>})}</div>}</section>
        </> : activeSection==='adaptation' ? <>
          <section className="studio-adaptation-hero"><span className="studio-adaptation-hero-icon"><Boxes size={21}/></span><div><span className="studio-adaptation-kicker">PLATFORM · TENANT YAPILANDIRMASI</span><h1>Platform uyarlama</h1><p>ERP deneyimini iş süreçlerinize göre şekillendirin. Tüm araçlar Studio içinde açılır.</p></div><span className="studio-adaptation-hero-tenant"><i/>{tenant.name}</span></section>
          <section className="studio-adaptation-section" aria-label="Uyarlama araçları"><header className="studio-adaptation-section-heading"><div><span>ARAÇLAR</span><h2>Çalışma alanınızı yapılandırın</h2><p>Bir araç seçtiğinizde ekran Studio çalışma alanı içinde açılır.</p></div><b>{availablePlatformTools.length} araç</b></header><div className="studio-adaptation-grid">{availablePlatformTools.map((tool,index)=>{const ToolIcon=tool.icon;const internal=tool.id==='modules';return <a className="studio-adaptation-card" key={tool.id} href={internal?'#marketplace':`#tool-${tool.id}`} aria-label={`${tool.title} ekranını aç`}><div className="studio-adaptation-card-top"><span className="studio-adaptation-icon"><ToolIcon size={19}/></span><span className="studio-adaptation-index">{String(index+1).padStart(2,'0')}</span></div><div className="studio-adaptation-card-copy"><h3>{tool.title}</h3><p>{tool.description}</p></div><span className="studio-adaptation-open">Studio’da aç <ArrowUpRight size={15}/></span></a>})}</div></section>
        </> : activeSection.startsWith('tool-') ? (()=>{const tool=availablePlatformTools.find(item=>item.id===activeSection.slice(5));return tool?<><nav className="studio-product-tabs" aria-label="Studio uyarlama bölümleri"><a href="#adaptation">Uyarlama araçları</a><a href="#marketplace">Modül pazaryeri</a></nav><section className="studio-tool-heading"><div><span>PLATFORM UYARLAMA · STUDIO</span><h1>{tool.title}</h1><p>{tool.description}</p></div><a className="secondary small-button" href="#adaptation"><ArrowUpRight size={15}/>Uyarlama araçlarına dön</a></section><iframe className="studio-platform-tool-frame" title={`${tool.title} · Studio`} src={platformToolHref(tool.id)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" onLoad={event=>event.currentTarget.contentWindow?.postMessage({type:'NEXORA_STUDIO_AUTH',token,tenant},platformOrigin)}/></>:<section className="studio-tool-unavailable"><b>Uyarlama aracı bulunamadı</b><a href="#adaptation">Uyarlama araçlarına dön</a></section>})() : activeSection==='projects' ? <>
          <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a href="#overview">Genel bakış</a><a className="active" href="#projects">Projeler</a><a href="#requests">Geliştirme talepleri</a><a href="#analytics">Analitik</a></nav>
          {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
          <section className="studio-hero studio-overview-heading studio-projects-page-hero"><div className="studio-overview-copy"><span className="studio-hero-kicker"><FolderKanban size={14}/> PROJE YÖNETİMİ</span><h1>Projeler</h1><p>{tenant.name} çalışma alanındaki yetkilendirilmiş depoları ve proje erişimlerini yönetin.</p></div><div className="studio-hero-actions"><button className="primary" onClick={openNewRequest}><Plus size={16}/>Yeni geliştirme talebi</button></div></section>
          <div id="projects" className="studio-projects-page-content"><StudioProjects token={token} tenant={tenant} projects={projects} setProjects={setProjects} refreshProjects={refreshProjects}/></div>
          <div className="studio-boundary"><ShieldCheck size={17}/><span>Depo erişimi proje ve tenant yetkileriyle denetlenir. Kaynak kodu paylaşımı ve çalışma alanı değişiklikleri ayrıca onay gerektirir.</span></div>
        </> : activeSection==='requests' ? <>
          <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a href="#overview">Genel bakış</a><a href="#projects">Projeler</a><a className="active" href="#requests">Geliştirme talepleri</a><a href="#analytics">Analitik</a></nav>
          {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
          <section className="studio-hero studio-overview-heading"><div className="studio-overview-copy"><span className="studio-hero-kicker"><ListTodo size={14}/> TALEP YÖNETİMİ</span><h1>Geliştirme talepleri</h1><p>{tenant.name} çalışma alanındaki geliştirme ihtiyaçları ve durumları.</p></div><div className="studio-hero-actions"><button className="primary" onClick={openNewRequest}><Plus size={16}/>Yeni geliştirme talebi</button></div></section>
          <section className="panel studio-request-panel studio-requests-page" id="requests"><div className="panel-heading"><div><span className="studio-section-eyebrow">TALEP AKIŞI</span><h3>Proje geliştirme talepleri</h3><p>{requests.length} tenant/proje kapsamlı kayıt</p></div><span className="studio-section-icon"><FileText size={18}/></span></div>{error&&<div className="alert studio-request-alert">{error}</div>}{notice&&<div className="studio-request-notice" role="status">{notice}</div>}{requests.length?<div className="requests-list">{requests.map(item=><article className="request-row expanded" key={item.id}><div className="request-symbol"><FileText size={17}/></div><div className="request-info"><b>{item.title}</b><p>{item.description}</p><small>{item.projectName?`${item.projectName} · `:''}{new Date(item.createdAt).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'})}</small></div><div className="studio-request-row-actions">{item.canEdit&&<button className="secondary small-button" type="button" onClick={()=>openRequestForEdit(item)}><Pencil size={14}/>Düzenle</button>}{item.canEdit&&<button className="danger-quiet small-button" type="button" disabled={busy} aria-label={`${item.title} talebini sil`} title="Talebi sil" onClick={()=>void deleteRequest(item)}><Trash2 size={14}/><span>Sil</span></button>}<div className="studio-request-status-wrap"><span className="request-status" title={item.status==='Submitted'?'Talep kaydedildi ve kuyruğa alındı; henüz üzerinde çalışıldığı anlamına gelmez.':undefined}><i/>{item.status==='Submitted'?'Alındı':item.status}</span>{item.status==='Submitted'&&<small>Kaydedildi · işlem bekliyor</small>}</div></div></article>)}</div>:<div className="studio-empty-state"><span><ListTodo size={19}/></span><b>Henüz geliştirme talebi yok</b><small>Yeni bir ihtiyaç ekleyerek geliştirme akışını başlatın.</small><button className="secondary small-button" onClick={openNewRequest}><Plus size={14}/>Talep oluştur</button></div>}</section>
        </> : activeSection==='analytics' ? <>
          <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a href="#overview">Genel bakış</a><a href="#projects">Projeler</a><a href="#requests">Geliştirme talepleri</a><a className="active" href="#analytics">Analitik</a></nav>
          {analyticsContent}
        </> : <>
        {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
        {contextualScreen&&<section className="studio-context-launch"><span><Code2 size={18}/></span><div><small>{moduleStarterId?'MODÜL ŞABLONU · STUDIO EDITÖRÜ':'ERP GELİŞTİRİCİ MODU · AKTİF EKRAN'}</small><b>{contextualScreen}{contextualModuleCode&&<code className="studio-context-module-code">{contextualModuleCode}</code>}</b><p>{moduleStarterId?'Şablon manifestini ve kaynak kodunu ERP’deki örnek karttan alın. Proje seçip izole çalışma alanı isteyin; Cargo.toml, manifest.json ve src/lib.rs dosyalarını Project Explorer’da düzenleyebilirsiniz.':'Modül kodu talebe taşınır. İlgili kaynak deposunu ayrıca seçin; Project Explorer’da kodu düzenleyip farkları inceleyerek onaylayabilirsiniz.'}</p></div><button className="secondary small-button" onClick={()=>{if(moduleStarterId){openModuleStarterRequest();return}setEditingRequestId(null);setRequestTitle(moduleStarterId?`${contextualScreen} modülünü geliştirme`:`${contextualScreen} ekranını uyarlama`);setRequestDescription(moduleStarterId?`${contextualScreen} başlangıç şablonunu temel alarak kendi modülümü geliştirmek istiyorum. Modül kodu: ${contextualModuleCode}. Şablon: ${moduleStarterId}. manifest.json, Cargo.toml ve src/lib.rs dosyalarını seçilen GitHub projesinde oluşturup düzenleyin.`:`${contextualScreen} ekranı için istenen değişiklikleri açıklayın.${contextualModuleCode?` Modül kodu: ${contextualModuleCode}.`:''} İlgili kaynak deposunu seçin; değişiklikler onaylı izole çalışma alanında hazırlanır.`);setRequestProjectId('');setError('');setShowRequest(true)}}><Plus size={14}/>{moduleStarterId?'Modül geliştirme talebi':'Uyarlama talebi'}</button></section>}
        <nav className="studio-product-tabs" aria-label="Studio bölümleri"><a className={activeSection==='overview'?'active':''} href="#overview">Genel bakış</a><a className={activeSection==='projects'?'active':''} href="#projects">Projeler</a><a href="#requests">Geliştirme talepleri</a><a href="#analytics">Analitik</a></nav>
                <section className="studio-hero studio-overview-heading"><div className="studio-overview-copy"><span className="studio-hero-kicker"><Sparkles size={14}/> AI DEVELOPMENT STUDIO</span><h1>Nexora Studio</h1><p>{tenant.name} çalışma alanı · Projeleri, geliştirme taleplerini ve yetki kapsamını yönetin.</p></div><div className="studio-hero-actions"><button className="primary" onClick={openNewRequest}><Plus size={16}/>Yeni geliştirme talebi</button><a className="secondary" href="#projects"><FolderKanban size={16}/>Projeleri görüntüle<ArrowUpRight size={14}/></a></div></section>

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
    {showRequest&&<div className="modal-backdrop studio-request-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeRequestDialog()}}><div className="modal studio-request-modal" role="dialog" aria-modal="true" aria-labelledby="studio-request-title"><div className="modal-head studio-request-modal-head"><div><p className="eyebrow">AI DEVELOPMENT STUDIO · TALEP FORMU</p><h2 id="studio-request-title">{editingRequestId?'Geliştirme talebini düzenle':'Yeni geliştirme talebi'}</h2><p>{editingRequestId?'Talep bilgilerini güncelleyin. İşleme alınmış talepler düzenlenemez.':'İhtiyacınızı paylaşın; doğru projeyle eşleştirip takip etmeyi kolaylaştıralım.'}</p></div><button className="icon-button" aria-label="Kapat" onClick={closeRequestDialog}><X size={19}/></button></div><div className="studio-request-modal-context"><span><ListTodo size={16}/></span><p>Talep <b>{tenant.name}</b> çalışma alanına kaydedilir. İsterseniz erişiminiz olan bir projeye bağlayabilirsiniz.</p></div>{error&&<div className="alert">{error}</div>}<form onSubmit={editingRequestId?updateRequest:createRequest}><label>Talep başlığı<input value={requestTitle} onChange={e=>setRequestTitle(e.target.value)} required maxLength={180} placeholder="Örn. Stok kartına garanti süresi ekle"/><small>İhtiyacı kısa ve anlaşılır biçimde özetleyin.</small></label>{moduleRequestDraft&&<div className="studio-module-identity-fields"><label>Modül adı<input value={moduleDisplayName} onChange={e=>{const value=e.target.value;setModuleDisplayName(value);setRequestTitle(`${value.replace(/\s+modülü?$/i," ").trim()||"Yeni"} modülünü geliştirme`)}} required maxLength={120} placeholder="Örn. Selamlama Modülü"/><small>Kullanıcıların ERP içinde göreceği ad.</small></label><label>Modül kodu<input value={moduleCode} onChange={e=>setModuleCode(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g,""))} required maxLength={100} pattern="[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*" title="Küçük harfle başlayın; harf, rakam, nokta ve tire kullanın." placeholder="ornek.selamlama" autoCapitalize="off" spellCheck={false}/><small>Teknik kimlik ve modules/{moduleCode||"modul-kodu"} klasör adı.</small></label></div>}<label>İhtiyaç açıklaması<textarea value={requestDescription} onChange={e=>setRequestDescription(e.target.value)} required maxLength={8000} rows={5} placeholder="İş ihtiyacını, mevcut durumu ve beklenen davranışı anlatın…"/><small>Beklenen sonucu ve önemli iş kurallarını ekleyin.</small></label><label>İlgili proje<select value={requestProjectId} onChange={e=>setRequestProjectId(e.target.value)}><option value="">Genel talep (projeye bağlı değil)</option>{projects.filter(p=>p.accessLevel==='TenantAdmin'||p.accessLevel==='Contributor'||p.accessLevel==='Maintainer').map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><small>Proje seçmezseniz talep tenant genelinde görünür.</small></label><div className="modal-foot"><span><ShieldCheck size={15}/>{requestProjectId?projects.find(p=>p.id===requestProjectId)?.name:tenant.name} alanında kaydedilecek</span><div><button type="button" className="secondary" onClick={closeRequestDialog}>Vazgeç</button><button disabled={busy} className="primary">{editingRequestId?<Pencil size={15}/>:<Plus size={15}/>}{busy?'Kaydediliyor…':editingRequestId?'Talebi güncelle':'Talebi kaydet'}</button></div></div></form></div></div>}
  </div>
}
