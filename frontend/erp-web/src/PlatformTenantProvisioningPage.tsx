import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, CircleAlert, LoaderCircle, RotateCw, Search, ShieldCheck } from 'lucide-react'
import './platform-tenant-provisioning.css'

type ProvisioningStatus = {
  jobId: string
  tenantId: string
  status: 'Queued' | 'Running' | 'Completed' | 'Failed'
  provisioningState: string | null
  attemptCount: number
  errorCode: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  statusUrl: string
}

type ProvisioningRequest = {
  name: string
  slug: string
  baseCurrencyCode: string
  adminEmail: string
  adminDisplayName: string
}

type PlatformTenantSummary = {
  id: string
  name: string
  slug: string
  isActive: boolean
  baseCurrencyCode: string
  provisioningState: string | null
  licenseStatus: 'Unlicensed' | 'Active' | 'Expired' | 'Invalid'
  licenseTier: string | null
  licenseExpiresAt: string | null
}

type ApiRequest = <T>(url: string, token?: string, init?: RequestInit) => Promise<T>

export type PlatformTenantProvisioningPageProps = {
  token: string
  api: ApiRequest
}

const errorText: Record<string, string> = {
  tenant_database_provisioning_failed: 'Veritabanı hazırlığı tamamlanamadı. Yeniden deneyebilirsiniz.',
  tenant_database_not_ready: 'Veritabanı henüz hazır değil. Yeniden deneyebilirsiniz.',
  tenant_database_provisioning_interrupted: 'Hazırlık işlemi kesildi. Yeniden deneyebilirsiniz.'
}

const terminal = (status: ProvisioningStatus['status']) => status === 'Completed' || status === 'Failed'

export default function PlatformTenantProvisioningPage({ token, api }: PlatformTenantProvisioningPageProps) {
  const [form, setForm] = useState<ProvisioningRequest>({
    name: '', slug: '', baseCurrencyCode: 'TRY', adminEmail: '', adminDisplayName: ''
  })
  const [job, setJob] = useState<ProvisioningStatus | null>(null)
  const [companies, setCompanies] = useState<PlatformTenantSummary[]>([])
  const [companySearch, setCompanySearch] = useState('')
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companiesError, setCompaniesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const keyForRequest = useRef<{ fingerprint: string; key: string } | null>(null)

  useEffect(() => {
    if (!job || terminal(job.status)) return
    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const next = await api<ProvisioningStatus>(job.statusUrl, token)
        if (!cancelled) {
          setJob(next)
          setPollError('')
        }
      } catch {
        if (!cancelled) setPollError('Durum alınamadı. Biraz sonra yeniden denenecek.')
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 2500)
      }
    }
    timer = window.setTimeout(poll, 1500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [api, job?.jobId, job?.status, job?.statusUrl, token])

  useEffect(() => {
    let cancelled = false
    setCompaniesLoading(true)
    setCompaniesError('')
    api<PlatformTenantSummary[]>('/api/platform/tenants', token)
      .then(result => { if (!cancelled) setCompanies(result) })
      .catch(() => { if (!cancelled) setCompaniesError('Firma listesi alınamadı. Yeniden deneyin.') })
      .finally(() => { if (!cancelled) setCompaniesLoading(false) })
    return () => { cancelled = true }
  }, [api, job?.status, token])

  const update = (field: keyof ProvisioningRequest, value: string) => {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      baseCurrencyCode: form.baseCurrencyCode.trim().toUpperCase(),
      adminEmail: form.adminEmail.trim().toLowerCase(),
      adminDisplayName: form.adminDisplayName.trim()
    }
    const fingerprint = JSON.stringify(payload)
    if (!keyForRequest.current || keyForRequest.current.fingerprint !== fingerprint) {
      keyForRequest.current = { fingerprint, key: crypto.randomUUID() }
    }
    try {
      const created = await api<ProvisioningStatus>('/api/platform/tenants', token, {
        method: 'POST',
        headers: { 'Idempotency-Key': keyForRequest.current.key },
        body: JSON.stringify(payload)
      })
      setJob(created)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Firma oluşturma isteği başarısız oldu.')
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    if (!job) return
    setBusy(true)
    setError('')
    try {
      const updated = await api<ProvisioningStatus>(`${job.statusUrl}/retry`, token, { method: 'POST' })
      setJob(updated)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Yeniden deneme isteği başarısız oldu.')
    } finally {
      setBusy(false)
    }
  }

  const filteredCompanies = companies.filter(company =>
    `${company.name} ${company.slug}`.toLocaleLowerCase('tr-TR').includes(companySearch.trim().toLocaleLowerCase('tr-TR')))

  return <div className="page-heading platform-provisioning-page">
    <div className="platform-provisioning-heading platform-provisioning-commandbar">
      <div>
        <p className="eyebrow">PLATFORM YÖNETİMİ</p>
        <h1>Yeni firma</h1>
        <p className="muted">Firma kaydı sıraya alınır. Veritabanı hazır olduğunda firma kullanıma açılır.</p>
      </div>
      <div className="platform-provisioning-command-actions"><span className="platform-provisioning-mark"><Building2 size={20}/></span><span className="platform-provisioning-security"><ShieldCheck size={15}/> Platform erişimi</span></div>
    </div>

    <div className="platform-provisioning-overview" aria-label="Firma hazırlama adımları">
      <div className="is-current"><i>1</i><span><b>Firma tanımı</b><small>Kimlik ve ilk yönetici</small></span></div>
      <div className={job?'is-current':''}><i>2</i><span><b>Veritabanı hazırlığı</b><small>Firmaya özel SQL alanı</small></span></div>
      <div className={job?.status==='Completed'?'is-complete':''}><i>3</i><span><b>Kullanıma açılış</b><small>{job?.status==='Completed'?'Firma hazır':'Hazırlık tamamlanınca'}</small></span></div>
    </div>

    <section className="panel platform-provisioning-companies" aria-live="polite">
      <div className="panel-heading">
        <div><p className="eyebrow">KAYITLI FİRMALAR</p><h3>Tanımlı firmalar</h3><p>Platforma kayıtlı şirketler ve hazırlık durumları.</p></div>
        {!companiesLoading && <span className="platform-provisioning-company-count">{companies.length}</span>}
      </div>
      {!companiesLoading && !companiesError && companies.length > 0 && <label className="platform-provisioning-company-search"><Search size={15} aria-hidden="true"/><input type="search" aria-label="Tanımlı firmalarda ara" placeholder="Firma adı veya kısa ada göre ara" value={companySearch} onChange={event => setCompanySearch(event.target.value)}/></label>}
      {companiesLoading ? <div className="platform-provisioning-companies-empty"><LoaderCircle size={18} className="platform-provisioning-spin"/> Firmalar yükleniyor…</div>
        : companiesError ? <div className="platform-provisioning-companies-empty is-error"><CircleAlert size={17}/><span>{companiesError}</span></div>
        : companies.length === 0 ? <div className="platform-provisioning-companies-empty">Henüz tanımlı firma yok.</div>
        : filteredCompanies.length === 0 ? <div className="platform-provisioning-companies-empty">Aramanızla eşleşen firma bulunamadı.</div>
        : <div className="platform-provisioning-company-list">{filteredCompanies.map(company => {
          const databaseLabel = company.provisioningState === 'Ready' ? 'Veritabanı hazır'
            : company.provisioningState === 'Failed' ? 'Veritabanı hatası'
              : company.provisioningState ? 'Veritabanı hazırlanıyor' : 'Veritabanı durumu yok'
          const licenseLabel = company.licenseStatus === 'Active' ? 'Lisans aktif'
            : company.licenseStatus === 'Expired' ? 'Lisans süresi doldu'
              : company.licenseStatus === 'Invalid' ? 'Lisans geçersiz' : 'Lisans yok'
          const licenseDetails = company.licenseTier
            ? `${company.licenseTier}${company.licenseExpiresAt ? ` · ${new Date(company.licenseExpiresAt).toLocaleDateString('tr-TR')} tarihine kadar` : ''}`
            : 'Henüz etkinleştirilmemiş'
          return <article className="platform-provisioning-company" key={company.id}>
            <span className="platform-provisioning-company-icon"><Building2 size={17}/></span>
            <div className="platform-provisioning-company-info"><b>{company.name}</b><small>{company.slug} · {company.baseCurrencyCode}</small></div>
            <div className="platform-provisioning-company-state"><span className={`platform-provisioning-company-badge ${company.isActive ? 'is-active' : company.provisioningState === 'Failed' ? 'is-failed' : 'is-pending'}`}>{company.isActive ? 'Aktif' : company.provisioningState === 'Failed' ? 'Başarısız' : 'Hazırlanıyor'}</span><small>{databaseLabel}</small><span className={`platform-provisioning-company-badge is-license-${company.licenseStatus.toLowerCase()}`}>{licenseLabel}</span><small>{licenseDetails}</small></div>
          </article>
        })}</div>}
    </section>

    <div className="panel platform-provisioning-card">
      <div className="panel-heading">
        <div><p className="eyebrow">YENİ KAYIT</p><h3>Firma bilgileri</h3><p>İlk firma yöneticisi mevcut ve etkin bir kullanıcı olmalıdır.</p></div>
      </div>
      <form className="platform-provisioning-form" onSubmit={submit}>
        <div className="form-two">
          <label>Firma adı<input value={form.name} onChange={event => update('name', event.target.value)} maxLength={200} required autoComplete="organization"/></label>
          <label>Firma kısa adı<input value={form.slug} onChange={event => update('slug', event.target.value)} maxLength={100} required placeholder="ornek-firma" autoCapitalize="none"/></label>
        </div>
        <div className="form-two">
          <label>Temel para birimi<input value={form.baseCurrencyCode} onChange={event => update('baseCurrencyCode', event.target.value.slice(0, 3).toUpperCase())} maxLength={3} minLength={3} required/></label>
          <label>Firma yöneticisi e-posta<input type="email" value={form.adminEmail} onChange={event => update('adminEmail', event.target.value)} maxLength={320} required autoComplete="email"/></label>
        </div>
        <label className="platform-provisioning-admin-name">Firma yöneticisi adı<input value={form.adminDisplayName} onChange={event => update('adminDisplayName', event.target.value)} maxLength={160} required autoComplete="name"/></label>
        <p className="platform-provisioning-note">Bu ekranda parola veya veritabanı bilgisi alınmaz. Yönetici hesabı önceden oluşturulmuş olmalıdır.</p>
        {error && <p className="platform-provisioning-error" role="alert"><CircleAlert size={16}/>{error}</p>}
        <div className="platform-provisioning-actions"><button className="primary" disabled={busy}>{busy ? <><LoaderCircle size={16} className="platform-provisioning-spin"/> İstek gönderiliyor…</> : 'Firma oluştur'}</button></div>
      </form>
    </div>

    {job && <section className="panel platform-provisioning-status" aria-live="polite">
      <div className="panel-heading">
        <div><p className="eyebrow">HAZIRLAMA DURUMU</p><h3>{job.status === 'Completed' ? 'Firma hazır' : job.status === 'Failed' ? 'Hazırlık tamamlanamadı' : 'Firma hazırlanıyor'}</h3></div>
        <span className={`platform-provisioning-badge is-${job.status.toLowerCase()}`}>{job.status === 'Queued' ? 'Sırada' : job.status === 'Running' ? 'Hazırlanıyor' : job.status === 'Completed' ? 'Hazır' : 'Başarısız'}</span>
      </div>
      <div className="platform-provisioning-details">
        <div><span>Firma kimliği</span><code>{job.tenantId}</code></div>
        <div><span>Veritabanı durumu</span><b>{job.provisioningState ?? 'Kontrol ediliyor'}</b></div>
        <div><span>Deneme</span><b>{job.attemptCount}</b></div>
      </div>
      {job.errorCode && <p className="platform-provisioning-error" role="status"><CircleAlert size={16}/>{errorText[job.errorCode] ?? 'Hazırlık işlemi tamamlanamadı.'}</p>}
      {pollError && <p className="platform-provisioning-note" role="status">{pollError}</p>}
      {job.status === 'Failed' && <div className="platform-provisioning-actions"><button className="secondary" onClick={() => void retry()} disabled={busy}><RotateCw size={15}/> Yeniden dene</button></div>}
      {job.status === 'Completed' && <p className="platform-provisioning-success">Veritabanı hazır. Firma artık kullanıcı oturumlarında seçilebilir.</p>}
    </section>}
  </div>
}
