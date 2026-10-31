import { Building2, CircleAlert, LoaderCircle, Search } from 'lucide-react'
import type { PlatformTenantSummary } from '../types'

type Props = {
  companies: PlatformTenantSummary[]
  search: string
  loading: boolean
  error: string
  onSearchChange: (value: string) => void
}

export default function ProvisioningCompanyList({ companies, search, loading, error, onSearchChange }: Props) {
  const filteredCompanies = companies.filter(company =>
    `${company.name} ${company.slug}`.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')))

  return <section className="panel platform-provisioning-companies" aria-live="polite">
    <div className="panel-heading">
      <div><p className="eyebrow">KAYITLI FİRMALAR</p><h3>Tanımlı firmalar</h3><p>Platforma kayıtlı şirketler ve hazırlık durumları.</p></div>
      {!loading && <span className="platform-provisioning-company-count">{companies.length}</span>}
    </div>
    {!loading && !error && companies.length > 0 && <label className="platform-provisioning-company-search"><Search size={15} aria-hidden="true"/><input type="search" aria-label="Tanımlı firmalarda ara" placeholder="Firma adı veya kısa ada göre ara" value={search} onChange={event => onSearchChange(event.target.value)}/></label>}
    {loading ? <div className="platform-provisioning-companies-empty"><LoaderCircle size={18} className="platform-provisioning-spin"/> Firmalar yükleniyor…</div>
      : error ? <div className="platform-provisioning-companies-empty is-error"><CircleAlert size={17}/><span>{error}</span></div>
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
}
