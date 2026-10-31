import { useState, type FormEvent } from 'react'
import { Building2, Check, ChevronRight, Eye, EyeOff, Globe2, LogOut, Moon, Plus, Search, ShieldCheck, Sun } from 'lucide-react'
import type { Locale } from './WorkspaceComponents'
import type { Tenant } from './erp-types'

type Props = {
  locale: Locale
  theme: 'light' | 'dark'
  hasSession: boolean
  tenants: Tenant[]
  busy: boolean
  error: string
  email: string
  password: string
  platformAdminAvailable: boolean
  onLocaleChange: (locale: Locale) => void
  onThemeChange: (theme: 'light' | 'dark') => void
  onEmailChange: (email: string) => void
  onPasswordChange: (password: string) => void
  onLogin: (event: FormEvent<HTMLFormElement>) => void
  onSelectTenant: (tenant: Tenant) => void
  onSelectPlatformAdmin: () => void
  onSignOut: () => void
}

export function WorkspaceAuthPage({ locale, theme, hasSession, tenants, busy, error, email, password, platformAdminAvailable, onLocaleChange, onThemeChange, onEmailChange, onPasswordChange, onLogin, onSelectTenant, onSelectPlatformAdmin, onSignOut }: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [tenantQuery, setTenantQuery] = useState('')
  const en = locale === 'en'
  const accountName = localStorage.getItem('aierp.user') || (en ? 'Signed-in user' : 'Oturum açan kullanıcı')
  const filteredTenants = tenants.filter(tenant => `${tenant.name} ${tenant.slug} ${tenant.role}`.toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US').includes(tenantQuery.trim().toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US')))
  const features = en
    ? [['01', 'Real-time visibility', 'Make informed decisions with current data'], ['02', 'Connected operations', 'Bring every team into one workspace'], ['03', 'Secure by design', 'Your business data stays protected'], ['04', 'Ready to scale', 'Adapt the platform to your processes']]
    : [['01', 'Gerçek zamanlı görünürlük', 'Güncel verilerle doğru kararlar alın'], ['02', 'Entegre iş süreçleri', 'Tüm ekipleri tek çalışma alanında buluşturun'], ['03', 'Güvenli çalışma alanı', 'İş verileriniz koruma altında'], ['04', 'İşinize göre ölçeklenir', 'Platformu süreçlerinize uyarlayın']]

  if (hasSession) return <main className="auth-tenant-shell">
    <header className="auth-tenant-topbar">
      <div className="auth-tenant-brand"><div className="auth-wordmark auth-wordmark-dark"><span className="auth-logo">N</span><span>nexora <b>ERP</b></span></div><span className="auth-tenant-divider"/><p>{en ? 'ENTERPRISE RESOURCE PLANNING' : 'KURUMSAL KAYNAK YÖNETİM SİSTEMİ'}</p></div>
      <div className="auth-preferences auth-tenant-preferences">
        <div className="auth-language" aria-label={en ? 'Language' : 'Dil'}><button type="button" className={locale === 'tr' ? 'selected' : ''} aria-pressed={locale === 'tr'} onClick={() => onLocaleChange('tr')}>TR</button><button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => onLocaleChange('en')}>EN</button></div>
        <button type="button" className="auth-theme-toggle" aria-label={en ? 'Toggle theme' : 'Temayı değiştir'} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
      </div>
    </header>
    <section className="auth-tenant-content">
      <aside className="auth-tenant-intro">
        <p className="auth-kicker">NEXORA ERP</p>
        <h1>{en ? <>All your business<br/><em>on one platform.</em></> : <>Tüm iş süreçleriniz<br/><em>tek platformda.</em></>}</h1>
        <p>{en ? 'Manage every operation more efficiently, from purchasing and sales to inventory and finance.' : 'Satın almadan satışa, stoktan finansa kadar tüm operasyonlarınızı daha verimli yönetin.'}</p>
        <ul>{(en ? [['01','Central management','Access all your companies from one place.'],['02','Secure access','Reach only the companies assigned to you.'],['03','Seamless switching','Switch companies without signing out.']] : [['01','Merkezi yönetim','Tüm şirketlerinize tek ekrandan erişin.'],['02','Güvenli erişim','Yetkiniz dahilindeki firmalara ulaşın.'],['03','Hızlı geçiş','Firma değiştirirken oturumunuzu kapatmayın.']]).map(([id,title,detail])=><li key={id}><span>{id}</span><div><b>{title}</b><small>{detail}</small></div></li>)}</ul>
      </aside>
      <section className="auth-company-card" aria-labelledby="auth-company-heading">
        <div className="auth-company-account"><span className="auth-account-avatar">{accountName.slice(0,1).toLocaleUpperCase()}</span><span><b>{accountName}</b><small>{email || (en ? 'Signed in' : 'Oturum açıldı')}</small></span><button type="button" aria-label={en ? 'Sign out' : 'Oturumu kapat'} onClick={onSignOut}><LogOut size={17}/></button></div>
        <div className="auth-company-heading"><span className="auth-company-icon"><Building2 size={24}/></span><p className="auth-kicker">NEXORA ERP</p><h2 id="auth-company-heading">{en ? 'Choose a company' : 'Firma seçin'}</h2><p>{en ? 'Select a company you are authorized to access.' : 'Devam etmek için erişim yetkiniz olan firmayı seçin.'}</p></div>
        {error && <div className="alert auth-alert" role="alert">{error}</div>}
        <label className="auth-company-search"><Search size={19}/><input type="search" value={tenantQuery} onChange={event => setTenantQuery(event.target.value)} placeholder={en ? 'Search by company name or code…' : 'Firma adı veya kod ile ara…'} aria-label={en ? 'Search companies' : 'Firma ara'}/></label>
        <div className="auth-company-list">
          {filteredTenants.map((tenant,index)=><button className={`auth-company-row${index===0?' preferred':''}`} key={tenant.id} disabled={busy} onClick={() => onSelectTenant(tenant)}><span className={`auth-company-initials tone-${index%4}`}>{tenant.name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toLocaleUpperCase()}</span><span className="auth-company-details"><b>{tenant.name}</b><small><span>{tenant.slug}</span><i/>{tenant.role}</small></span><span className="auth-company-open"><ChevronRight size={19}/></span></button>)}
          {filteredTenants.length === 0 && <div className="auth-company-empty">{tenants.length === 0 ? (en ? 'No company is assigned to this account.' : 'Bu hesaba henüz firma atanmamış.') : (en ? 'No companies match your search.' : 'Aramanızla eşleşen firma bulunamadı.')}</div>}
        </div>
        {platformAdminAvailable && <button className="auth-company-create" type="button" disabled={busy} onClick={onSelectPlatformAdmin}><span><Plus size={18}/>{en ? 'Define or manage companies' : 'Firma tanımla veya yönet'}</span><ChevronRight size={17}/></button>}
        <div className="auth-company-secure"><ShieldCheck size={16}/>{en ? 'Your account only shows companies you are authorized to access.' : 'Hesabınızda yalnızca erişim yetkiniz olan firmalar gösterilir.'}</div>
      </section>
    </section>
  </main>

  return <main className="auth-shell auth-shell-split">
    <section className="auth-story" aria-label="Nexora ERP">
      <div className="auth-story-content">
        <div className="auth-wordmark"><span className="auth-logo">N</span><span>nexora <b>ERP</b></span></div>
        <p className="auth-brand-caption">{en ? 'ENTERPRISE RESOURCE PLANNING' : 'KURUMSAL KAYNAK YÖNETİM SİSTEMİ'}</p>
        <div className="auth-story-copy">
          <p className="auth-kicker">NEXORA · ERP</p>
          <h2>{en ? <>More than software.<br/><em>One connected platform.</em></> : <>Daha fazlası için<br/><em>tek bir platform.</em></>}</h2>
          <p>{en ? 'Manage every business process, from purchasing and sales to inventory and finance, in one place.' : 'Satın almadan satışa, stoktan finansa kadar tüm iş süreçlerinizi tek ekosistemde yönetin.'}</p>
        </div>
        <ul className="auth-feature-list">{features.map(([number, title, detail]) => <li key={number}><span className="auth-feature-index">{number}</span><span><b>{title}</b><small>{detail}</small></span></li>)}</ul>
        <blockquote>{en ? '“Build your business. Shape what comes next.”' : '“İşinizi büyütün, geleceği birlikte şekillendirin.”'}</blockquote>
      </div>
      <div className="auth-story-footer"><span>NEXORA ERP</span><span>{en ? 'BUSINESS MANAGEMENT PLATFORM' : 'KURUMSAL İŞ YÖNETİM PLATFORMU'}</span></div>
    </section>

    <section className="auth-entry">
      <div className="auth-preferences">
        <div className="auth-language" aria-label={en ? 'Language' : 'Dil'}>
          <Globe2 size={15}/>
          <button type="button" className={locale === 'tr' ? 'selected' : ''} aria-pressed={locale === 'tr'} onClick={() => onLocaleChange('tr')}>TR</button>
          <button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => onLocaleChange('en')}>EN</button>
        </div>
        <button type="button" className="auth-theme-toggle" aria-label={en ? 'Toggle theme' : 'Temayı değiştir'} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
      </div>

      <div className="auth-login-card">
        <div className="auth-card-brand"><div className="auth-wordmark auth-wordmark-dark"><span className="auth-logo">N</span><span>nexora <b>ERP</b></span></div><p className="auth-brand-caption">{en ? 'ENTERPRISE RESOURCE PLANNING' : 'KURUMSAL KAYNAK YÖNETİM SİSTEMİ'}</p></div>
        <div className="auth-card-heading">
          <p className="auth-kicker">{hasSession ? (en ? 'WORKSPACE ACCESS' : 'ÇALIŞMA ALANI ERİŞİMİ') : (en ? 'WELCOME BACK' : 'HOŞ GELDİNİZ')}</p>
          <h1>{hasSession ? (en ? 'Choose your company' : 'Firma seçin') : (en ? 'Sign in to your account' : 'Hesabınıza giriş yapın')}</h1>
          <p>{hasSession ? (en ? 'Select a company you are authorized to access.' : 'Devam etmek için erişim yetkiniz olan firmayı seçin.') : (en ? 'Enter your credentials to continue to Nexora ERP.' : 'Nexora ERP’ye devam etmek için bilgilerinizi girin.')}</p>
        </div>
        {error && <div className="alert auth-alert" role="alert">{error}</div>}
        {tenants.length > 0 ? <div className="tenant-options auth-tenant-options">
          {tenants.map(tenant => <button className="tenant-option auth-tenant-option" key={tenant.id} disabled={busy} onClick={() => onSelectTenant(tenant)}><span className="auth-tenant-icon"><Building2 size={18}/></span><span><b>{tenant.name}</b><small>{tenant.role}</small></span><ChevronRight className="arrow" size={17}/></button>)}
          {platformAdminAvailable && <button className="tenant-option auth-tenant-option" disabled={busy} onClick={onSelectPlatformAdmin}><span className="auth-tenant-icon"><ShieldCheck size={18}/></span><span><b>Platform Admin</b><small>{en ? 'Company setup and administration' : 'Firma oluşturma ve yönetimi'}</small></span><ChevronRight className="arrow" size={17}/></button>}
          <button className="text-button auth-switch-account" onClick={onSignOut}>{en ? 'Sign in with another account' : 'Farklı bir hesapla giriş yap'}</button>
        </div> : !hasSession ? <form onSubmit={onLogin} className="auth-form auth-login-form">
          <label>{en ? 'Username or email' : 'Kullanıcı adı veya e-posta'}<span className="auth-input-wrap"><span className="auth-input-icon">@</span><input type="email" autoComplete="username" value={email} onChange={event => onEmailChange(event.target.value)} required placeholder={en ? 'name@company.com' : 'ad@firma.com'}/></span></label>
          <label>{en ? 'Password' : 'Şifre'}<span className="auth-input-wrap"><span className="auth-input-icon auth-lock-icon"><ShieldCheck size={17}/></span><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => onPasswordChange(event.target.value)} required placeholder={en ? 'Enter your password' : 'Şifrenizi girin'}/><button type="button" className="auth-password-toggle" aria-label={showPassword ? (en ? 'Hide password' : 'Şifreyi gizle') : (en ? 'Show password' : 'Şifreyi göster')} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          <div className="auth-form-options"><label className="auth-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/><span className="auth-check"><Check size={12}/></span>{en ? 'Remember me' : 'Beni hatırla'}</label><span className="auth-help-text">{en ? 'Need help? Contact your administrator.' : 'Yardım için sistem yöneticinize başvurun.'}</span></div>
          <button className="primary full auth-submit" disabled={busy}>{busy ? (en ? 'Signing in…' : 'Giriş yapılıyor…') : (en ? 'Sign in' : 'Giriş yap')}<span>→</span></button>
        </form> : <div className="empty-small auth-empty"><b>{platformAdminAvailable ? (en ? 'No active company membership was found.' : 'Bu hesapta etkin firma üyeliği yok.') : (en ? 'No company has been assigned to this account yet.' : 'Bu hesaba henüz firma atanmamış.')}</b>
          {platformAdminAvailable && <button className="tenant-option auth-tenant-option" disabled={busy} onClick={onSelectPlatformAdmin}><span className="auth-tenant-icon"><ShieldCheck size={18}/></span><span><b>Platform Admin</b><small>{en ? 'Company setup and administration' : 'Firma oluşturma ve yönetimi'}</small></span><ChevronRight className="arrow" size={17}/></button>}
          <button className="text-button" onClick={onSignOut}>{en ? 'Return to sign in' : 'Giriş ekranına dön'}</button>
        </div>}
        <div className="auth-foot auth-secure-note"><ShieldCheck size={16}/><span>{en ? 'Secure session' : 'Güvenli oturum'}<i/> {en ? 'Your data is protected' : 'Verileriniz koruma altında'}</span></div>
      </div>
    </section>
  </main>
}
