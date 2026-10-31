import type { FormEventHandler, Ref } from 'react'
import { BadgeCheck, Check, ChevronDown, KeyRound, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import type { LicenseIssuer, Tenant } from '../types'

type Props = {
  issuer: LicenseIssuer | null
  loading: boolean
  busy: boolean
  activeTenants: Tenant[]
  filteredTenants: Tenant[]
  selectedTenant: Tenant | undefined
  tenantId: string
  tier: string
  expiresOn: string
  tenantPickerOpen: boolean
  tenantSearch: string
  pickerRef: Ref<HTMLDivElement>
  searchInputRef: Ref<HTMLInputElement>
  onSubmit: FormEventHandler<HTMLFormElement>
  onToggleTenantPicker: () => void
  onCloseTenantPicker: () => void
  onSelectTenant: (tenantId: string) => void
  onTenantSearchChange: (value: string) => void
  onTierChange: (value: string) => void
  onExpiresOnChange: (value: string) => void
}

export function LicenseIssuanceForm({
  issuer,
  loading,
  busy,
  activeTenants,
  filteredTenants,
  selectedTenant,
  tenantId,
  tier,
  expiresOn,
  tenantPickerOpen,
  tenantSearch,
  pickerRef,
  searchInputRef,
  onSubmit,
  onToggleTenantPicker,
  onCloseTenantPicker,
  onSelectTenant,
  onTenantSearchChange,
  onTierChange,
  onExpiresOnChange,
}: Props) {
  return <>
    {issuer && !issuer.ready && <div className="platform-license-warning" role="status"><ShieldCheck size={18}/><span><b>Lisans imzalayıcısı yapılandırılmamış</b><small>API sunucusunda lisans veren key ID, özel imzalama anahtarı ve eşleşen açık doğrulama anahtarı güvenli secret store üzerinden yapılandırılmalı.</small></span></div>}
    <section className="panel platform-license-card">
      <div className="panel-heading"><div><h3><BadgeCheck size={17}/> Lisans bilgileri</h3><p>Firma seçin, paket ve bitiş tarihini belirleyin.</p></div>{issuer?.ready && <span className="platform-license-key-id">İmzalama anahtarı · {issuer.keyId}</span>}</div>
      {loading ? <div className="platform-license-loading" role="status"><LoaderCircle size={17}/> Firma ve imzalayıcı bilgileri yükleniyor…</div> : <form className="platform-license-form" onSubmit={onSubmit}>
        <div className="platform-license-company-field"><span className="platform-license-field-label" id="license-company-label">Firma</span><div className="platform-license-company-picker" ref={pickerRef} onKeyDown={event => { if (event.key === 'Escape') onCloseTenantPicker() }}><button type="button" className="platform-license-company-trigger" aria-labelledby="license-company-label" aria-haspopup="dialog" aria-expanded={tenantPickerOpen} disabled={!activeTenants.length} onClick={onToggleTenantPicker}><span className={selectedTenant ? '' : 'is-placeholder'}>{selectedTenant ? `${selectedTenant.name} · ${selectedTenant.slug}` : 'Firma seçin'}</span><ChevronDown size={16} aria-hidden="true"/></button>{tenantPickerOpen && <div className="platform-license-company-popup" role="dialog" aria-label="Firma seç"><label className="platform-license-company-search"><Search size={15} aria-hidden="true"/><input ref={searchInputRef} type="search" aria-label="Firma ara" placeholder="Firma adı veya kısa adı ara" value={tenantSearch} onChange={event => onTenantSearchChange(event.target.value)}/></label><div className="platform-license-company-options" role="listbox" aria-labelledby="license-company-label">{filteredTenants.length ? filteredTenants.map(tenant => <button key={tenant.id} type="button" role="option" aria-selected={tenant.id === tenantId} className="platform-license-company-option" onClick={() => onSelectTenant(tenant.id)}><span><strong>{tenant.name}</strong><small>{tenant.slug}</small></span>{tenant.id === tenantId && <Check size={16} aria-hidden="true"/>}</button>) : <p className="platform-license-company-empty">Aramanızla eşleşen firma bulunamadı.</p>}</div></div>}</div><small>Hazırlığı tamamlanmış firmalar listelenir.</small></div>
        <div className="form-two"><label>Lisans paketi<select value={tier} onChange={event => onTierChange(event.target.value)}><option value="Small">Small · 10 kullanıcı · 10 GB</option><option value="Medium">Medium · 50 kullanıcı · 50 GB</option><option value="Large">Large · sınırsız kullanıcı/modül · 250 GB</option></select></label><label>Bitiş tarihi<input type="date" required value={expiresOn} onChange={event => onExpiresOnChange(event.target.value)}/></label></div>
        {tier === 'Large' && <p className="platform-license-note">Large paketi sınırsız kullanıcı/modül kotası ve 250 GB SQL depolama kotası uygular. HA işareti lisans metadata'sıdır; altyapı veya SLA sağlamaz.</p>}
        {!activeTenants.length && <p className="platform-license-note">Lisans üretmek için önce en az bir firmanın hazırlığı tamamlanmış olmalı.</p>}
        <div className="platform-license-actions"><button className="primary" disabled={busy || !issuer?.ready || !tenantId || !expiresOn || !activeTenants.length}>{busy ? <><LoaderCircle size={16}/>İmzalanıyor…</> : <><KeyRound size={16}/>Lisans kodu üret</>}</button></div>
      </form>}
    </section>
  </>
}
