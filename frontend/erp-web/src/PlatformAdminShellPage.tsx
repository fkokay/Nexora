import { Building2, KeyRound, LogOut, Sparkles } from 'lucide-react'
import PlatformTenantProvisioningPage from './PlatformTenantProvisioningPage'
import PlatformLicenseIssuancePage from './PlatformLicenseIssuancePage'
import type { Locale } from './WorkspaceComponents'
import { api } from './erpApi'

type Props = {
  page: string
  token: string
  locale: Locale
  onNavigate: (page: string) => void
  onLocaleChange: (locale: Locale) => void
  onSignOut: () => void
}

export function PlatformAdminShellPage({ page, token, locale, onNavigate, onLocaleChange, onSignOut }: Props) {
  const english = locale === 'en'
  return <div className="platform-admin-shell">
    <aside className="platform-admin-sidebar">
      <div className="side-brand"><span className="brand-mark small"><Sparkles size={17}/></span><span>nexora<strong>ERP</strong></span></div>
      <p className="platform-admin-sidebar-label">{english ? 'PLATFORM ADMINISTRATION' : 'PLATFORM YÖNETİMİ'}</p>
      <nav aria-label={english ? 'Platform administration' : 'Platform yönetimi'}>
        <button className={`nav-item ${page === 'platform-tenants' ? 'active' : ''}`} onClick={() => onNavigate('platform-tenants')}><Building2 size={18}/>{english ? 'Companies' : 'Firmalar'}</button>
        <button className={`nav-item ${page === 'platform-license-issuance' ? 'active' : ''}`} onClick={() => onNavigate('platform-license-issuance')}><KeyRound size={18}/>{english ? 'Licenses' : 'Lisanslar'}</button>
      </nav>
      <div className="platform-admin-sidebar-bottom"><div className="profile"><div className="profile-avatar">{(localStorage.getItem('aierp.user') || 'A').slice(0, 1).toUpperCase()}</div><span><b>{localStorage.getItem('aierp.user') || 'Platform Admin'}</b><small>PlatformSuperAdmin</small></span><button className="icon-button" title={english ? 'Sign out' : 'Oturumu kapat'} onClick={onSignOut}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="platform-admin-main">
      <header className="platform-admin-topbar"><div><span>{english ? 'Platform Admin' : 'Platform yönetimi'}</span><b>{page === 'platform-license-issuance' ? (english ? 'License issuance' : 'Lisans oluştur') : english ? 'Companies' : 'Firmalar'}</b></div>
        <div className="locale-switch" role="group" aria-label={english ? 'Language' : 'Dil'}><button type="button" aria-pressed={!english} onClick={() => onLocaleChange('tr')}>TR</button><button type="button" aria-pressed={english} onClick={() => onLocaleChange('en')}>EN</button><button type="button" className="secondary small-button" onClick={onSignOut}>{english ? 'Sign out' : 'Oturumu kapat'}</button></div>
      </header>
      <section className="platform-admin-content">{page === 'platform-tenants' && <PlatformTenantProvisioningPage token={token} api={api}/>} {page === 'platform-license-issuance' && <PlatformLicenseIssuancePage token={token} api={api}/>}</section>
    </main>
  </div>
}
