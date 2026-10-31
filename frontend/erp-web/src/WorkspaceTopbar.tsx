import { useEffect, useRef, useState } from 'react'
import { Bell, Building2, ChevronDown, Code2, LogOut, Menu, Moon, Search, Settings, Sparkles, Sun } from 'lucide-react'
import type { Locale } from './WorkspaceComponents'
import type { Tenant, Theme } from './erp-types'

type Props = {
  locale: Locale
  tenant: Tenant
  tenants: Tenant[]
  theme: Theme
  standaloneStudio: boolean
  developerModeOpen: boolean
  onToggleMenu: () => void
  onOpenSearch: () => void
  onThemeChange: (theme: Theme) => void
  onLocaleChange: (locale: Locale) => void
  onOpenDeveloperMode: () => void
  onSelectTenant: (tenant: Tenant) => void | Promise<void>
  onOpenCompanySettings: () => void
  onNavigate: (page: string) => void
  onSignOut: () => void
}

export function WorkspaceTopbar({ locale, tenant, tenants, theme, standaloneStudio, developerModeOpen, onToggleMenu, onOpenSearch, onThemeChange, onLocaleChange, onOpenDeveloperMode, onSelectTenant, onOpenCompanySettings, onNavigate, onSignOut }: Props) {
  const english = locale === 'en'
  const [profileOpen, setProfileOpen] = useState(false)
  const [tenantOpen, setTenantOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const tenantRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen && !tenantOpen && !notificationsOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false)
      if (!tenantRef.current?.contains(event.target)) setTenantOpen(false)
      if (!(event.target as Element).closest('.notification-menu-wrap')) setNotificationsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        setTenantOpen(false)
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileOpen, tenantOpen, notificationsOpen])

  return <header className="topbar">
    <div className="crumb">
      <button className="icon-button menu-button" aria-label={english ? 'Open module search' : 'Modül aramayı aç'} onClick={onToggleMenu}><Menu size={18}/></button>
      <span className="topbar-brand"><span className="brand-mark small"><Sparkles size={15}/></span><span>nexora<strong>ERP</strong></span></span>
      <span className="topbar-divider"/>
      <div className="tenant-context-wrap" ref={tenantRef}>
        <button type="button" className="tenant-context" aria-haspopup="menu" aria-expanded={tenantOpen} onClick={() => setTenantOpen(value => !value)}>
          <Building2 size={17}/><span>{tenant.name}</span><ChevronDown size={14}/>
        </button>
        {tenantOpen && <div className="tenant-context-menu" role="menu">{tenants.map(item => <button type="button" role="menuitem" key={item.id} className={item.id === tenant.id ? 'active' : ''} onClick={() => { setTenantOpen(false); if (item.id !== tenant.id) void onSelectTenant(item) }}>
          <span className="tenant-context-avatar">{item.name.slice(0, 1).toUpperCase()}</span><span><b>{item.name}</b><small>{item.role}</small></span>{item.id === tenant.id && <i>✓</i>}
        </button>)}</div>}
      </div>
    </div>
    <div className="top-actions">
      {!standaloneStudio && tenant.role === 'TenantAdmin' && <button className="developer-mode-trigger" type="button" aria-expanded={developerModeOpen} onClick={onOpenDeveloperMode}><Code2 size={15}/><span>{english ? 'Developer mode' : 'Geliştirici modu'}</span></button>}
      <button className="icon-button theme-toggle" type="button" title={theme === 'dark' ? (english ? 'Switch to light theme' : 'Açık temaya geç') : (english ? 'Switch to dark theme' : 'Koyu temaya geç')} aria-label={theme === 'dark' ? (english ? 'Switch to light theme' : 'Açık temaya geç') : (english ? 'Switch to dark theme' : 'Koyu temaya geç')} aria-pressed={theme === 'dark'} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
      <div className="locale-switch" role="group" aria-label={english ? 'Language' : 'Dil'}><button type="button" aria-pressed={!english} onClick={() => onLocaleChange('tr')}>TR</button><button type="button" aria-pressed={english} onClick={() => onLocaleChange('en')}>EN</button></div>
      <button type="button" className="global-search" aria-label={english ? 'Search pages and customers' : 'Ekran ve cari ara'} onClick={onOpenSearch}><Search size={16}/><span>{english ? 'Search' : 'Hızlı ara'}</span><kbd>Ctrl + K</kbd></button>
      <div className="notification-menu-wrap">
        <button type="button" className="icon-button notification" aria-label={english ? 'Notifications' : 'Bildirimler'} aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><Bell size={18}/></button>
        {notificationsOpen && <section className="notification-popover" role="dialog" aria-label={english ? 'Notifications' : 'Bildirimler'}><header><b>{english ? 'Notifications' : 'Bildirimler'}</b><button type="button" className="link-button" onClick={() => { setNotificationsOpen(false); onNavigate('settings') }}>{english ? 'Settings' : 'Ayarlar'}</button></header><div className="notification-empty"><Bell size={20}/><b>{english ? 'You are all caught up' : 'Yeni bildiriminiz yok'}</b><span>{english ? 'New system and operation updates will appear here.' : 'Yeni sistem ve işlem bildirimleri burada görünecek.'}</span></div></section>}
      </div>
      <div className="profile-menu-wrap" ref={profileRef}>
        <button className="top-avatar" type="button" aria-label={english ? 'Open profile menu' : 'Profil menüsünü aç'} aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(value => !value)}>{(localStorage.getItem('aierp.user') || 'A').slice(0, 1).toUpperCase()}</button>
        {profileOpen && <div className="profile-dropdown" role="menu"><div className="profile-dropdown-identity"><b>{localStorage.getItem('aierp.user') || (english ? 'User' : 'Kullanıcı')}</b><small>{tenant.role}</small></div>
          <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onOpenCompanySettings() }}><Settings size={15}/>{english ? 'Company settings' : 'Firma ayarları'}</button>
          <button type="button" role="menuitem" className="profile-dropdown-signout" onClick={() => { setProfileOpen(false); onSignOut() }}><LogOut size={15}/>{english ? 'Sign out' : 'Oturumu kapat'}</button>
        </div>}
      </div>
    </div>
  </header>
}
