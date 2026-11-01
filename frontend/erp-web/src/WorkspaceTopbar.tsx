import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Building2, ChevronDown, Code2, ExternalLink, LogOut, Menu, Moon, Search, Settings, ShieldAlert, Sparkles, Sun } from 'lucide-react'
import type { Locale } from './WorkspaceComponents'
import type { Tenant, Theme } from './erp-types'
import { api } from './erpApi'
import './notification-alerts.css'

type SecurityAlert = {
  id: string
  facilityCode: string
  type: string
  code: string
  amount: number
  currencyCode: string
  expiryDate: string
  alert: 'Expired' | 'Expiring'
}
type SecurityAlertSummary = { expiredCount: number; expiringCount: number; items: SecurityAlert[] }

type Props = {
  locale: Locale
  token: string
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

export function WorkspaceTopbar({ locale, token, tenant, tenants, theme, standaloneStudio, developerModeOpen, onToggleMenu, onOpenSearch, onThemeChange, onLocaleChange, onOpenDeveloperMode, onSelectTenant, onOpenCompanySettings, onNavigate, onSignOut }: Props) {
  const english = locale === 'en'
  const [profileOpen, setProfileOpen] = useState(false)
  const [tenantOpen, setTenantOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [alertCount, setAlertCount] = useState(0)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState('')
  const [dismissingAlert, setDismissingAlert] = useState<string | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const tenantRef = useRef<HTMLDivElement>(null)
  const tenantTriggerRef = useRef<HTMLButtonElement>(null)
  const tenantMenuRef = useRef<HTMLDivElement>(null)
  const [tenantMenuPosition, setTenantMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null)

  const loadAlerts = useCallback(async (signal?: AbortSignal) => {
    if (standaloneStudio || !token) return
    setAlertsLoading(true)
    try {
      const summary = await api<SecurityAlertSummary>('/api/finance/credit-facilities/securities/alerts?expiryWithinDays=30', token, { signal })
      if (signal?.aborted) return
      setAlerts(summary.items ?? [])
      setAlertCount((summary.expiredCount ?? 0) + (summary.expiringCount ?? 0))
      setAlertsError('')
    } catch (error) {
      if (signal?.aborted) return
      setAlertsError(error instanceof Error ? error.message : (english ? 'Notifications could not be loaded.' : 'Bildirimler yüklenemedi.'))
    } finally {
      if (!signal?.aborted) setAlertsLoading(false)
    }
  }, [english, standaloneStudio, token])

  useEffect(() => {
    if (standaloneStudio || !token) return
    const controller = new AbortController()
    void loadAlerts(controller.signal)
    const timer = window.setInterval(() => void loadAlerts(), 5 * 60 * 1000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [loadAlerts, standaloneStudio, tenant.id, token])

  const dismissAlert = async (alert: SecurityAlert) => {
    const key = `${alert.id}:${alert.alert}`
    setDismissingAlert(key)
    try {
      await api<void>(`/api/finance/credit-facilities/securities/${alert.id}/alerts/${alert.alert}/dismiss`, token, { method: 'POST' })
      setAlerts(current => current.filter(item => item.id !== alert.id || item.alert !== alert.alert))
      setAlertCount(count => Math.max(0, count - 1))
    } catch (error) {
      setAlertsError(error instanceof Error ? error.message : (english ? 'Notification could not be dismissed.' : 'Bildirim kapatılamadı.'))
    } finally {
      setDismissingAlert(null)
    }
  }

  useEffect(() => {
    if (!profileOpen && !tenantOpen && !notificationsOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false)
      if (!tenantRef.current?.contains(event.target) && !tenantMenuRef.current?.contains(event.target)) setTenantOpen(false)
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

  useLayoutEffect(() => {
    if (!tenantOpen) {
      setTenantMenuPosition(null)
      return
    }
    const updatePosition = () => {
      const trigger = tenantTriggerRef.current
      if (!trigger) return
      const bounds = trigger.getBoundingClientRect()
      const width = Math.min(340, Math.max(0, window.innerWidth - 24))
      const left = Math.min(Math.max(12, bounds.left), Math.max(12, window.innerWidth - width - 12))
      setTenantMenuPosition({ top: bounds.bottom + 8, left, width })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [tenantOpen])

  return <header className="topbar">
    <div className="crumb">
      <button className="icon-button menu-button" aria-label={english ? 'Open module search' : 'Modül aramayı aç'} onClick={onToggleMenu}><Menu size={18}/></button>
      <span className="topbar-brand"><span className="brand-mark small"><Sparkles size={15}/></span><span>nexora<strong>ERP</strong></span></span>
      <span className="topbar-divider"/>
      <div className="tenant-context-wrap" ref={tenantRef}>
        <button ref={tenantTriggerRef} type="button" className="tenant-context" aria-haspopup="menu" aria-expanded={tenantOpen} aria-controls={tenantOpen ? 'tenant-context-menu' : undefined} onClick={() => setTenantOpen(value => !value)}>
          <Building2 size={17}/><span>{tenant.name}</span><ChevronDown size={14}/>
        </button>
        {tenantOpen && tenantMenuPosition && createPortal(<div id="tenant-context-menu" ref={tenantMenuRef} className="tenant-context-menu" role="menu" aria-label={english ? 'Available companies' : 'Tanımlı firmalar'} style={{ position: 'fixed', top: tenantMenuPosition.top, left: tenantMenuPosition.left, width: tenantMenuPosition.width, zIndex: 10050 }}><div className="tenant-context-menu-heading">{english ? 'COMPANIES' : 'TANIMLI FİRMALAR'}</div>{tenants.map(item => <button type="button" role="menuitem" key={item.id} className={item.id === tenant.id ? 'active' : ''} aria-current={item.id === tenant.id ? 'true' : undefined} onClick={() => { setTenantOpen(false); if (item.id !== tenant.id) void onSelectTenant(item) }}>
          <span className="tenant-context-avatar">{item.name.slice(0, 1).toUpperCase()}</span><span><b>{item.name}</b><small>{item.role}</small></span>{item.id === tenant.id && <i>✓</i>}
        </button>)}</div>, document.body)}
      </div>
    </div>
    <div className="top-actions">
      {!standaloneStudio && tenant.role === 'TenantAdmin' && <button className="developer-mode-trigger" type="button" aria-expanded={developerModeOpen} onClick={onOpenDeveloperMode}><Code2 size={15}/><span>{english ? 'Developer mode' : 'Geliştirici modu'}</span></button>}
      <button className="icon-button theme-toggle" type="button" title={theme === 'dark' ? (english ? 'Switch to light theme' : 'Açık temaya geç') : (english ? 'Switch to dark theme' : 'Koyu temaya geç')} aria-label={theme === 'dark' ? (english ? 'Switch to light theme' : 'Açık temaya geç') : (english ? 'Switch to dark theme' : 'Koyu temaya geç')} aria-pressed={theme === 'dark'} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
      <div className="locale-switch" role="group" aria-label={english ? 'Language' : 'Dil'}><button type="button" aria-pressed={!english} onClick={() => onLocaleChange('tr')}>TR</button><button type="button" aria-pressed={english} onClick={() => onLocaleChange('en')}>EN</button></div>
      <button type="button" className="global-search" aria-label={english ? 'Search pages and customers' : 'Ekran ve cari ara'} onClick={onOpenSearch}><Search size={16}/><span>{english ? 'Search' : 'Hızlı ara'}</span><kbd>Ctrl + K</kbd></button>
      <div className="notification-menu-wrap notification-wrap">
        <button type="button" className="icon-button notification" aria-label={`${english ? 'Notifications' : 'Bildirimler'}${alertCount ? ` (${alertCount})` : ''}`} aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => { const open = !notificationsOpen; setNotificationsOpen(open); if (open) void loadAlerts() }}><Bell size={18}/>{alertCount > 0 && <span className="notification-count" aria-label={`${alertCount} ${english ? 'alerts' : 'uyarı'}`}>{alertCount > 99 ? '99+' : alertCount}</span>}</button>
        {notificationsOpen && <section className="notification-popover" role="dialog" aria-label={english ? 'Notifications' : 'Bildirimler'}>
          <header><div><b>{english ? 'Expiry alerts' : 'Vade uyarıları'}</b><small>{english ? 'Active guarantees and collateral' : 'Aktif teminat ve garantiler'}</small></div><button type="button" className="link-button" onClick={() => { setNotificationsOpen(false); onNavigate('finance-credit-facilities') }}>{english ? 'View finance' : 'Finansı aç'}</button></header>
          {alertsError ? <p className="notification-message error" role="alert">{alertsError}</p> : alertsLoading && alerts.length === 0 ? <p className="notification-message" role="status">{english ? 'Loading alerts…' : 'Uyarılar yükleniyor…'}</p> : alerts.length === 0 ? <p className="notification-message">{english ? 'No active expiry alerts.' : 'Etkin vade uyarısı yok.'}</p> : <div className="notification-list">{alerts.map(alert => {
            const expired = alert.alert === 'Expired'
            const key = `${alert.id}:${alert.alert}`
            const date = new Intl.DateTimeFormat(english ? 'en' : 'tr-TR').format(new Date(`${alert.expiryDate}T00:00:00`))
            const amount = new Intl.NumberFormat(english ? 'en' : 'tr-TR', { maximumFractionDigits: 2 }).format(alert.amount)
            return <div className="notification-item" key={key}>
              <button type="button" className="notification-open" onClick={() => { setNotificationsOpen(false); onNavigate('finance-credit-facilities') }}>
                <span className={`notification-indicator${expired ? ' expired' : ''}`}><ShieldAlert size={15}/></span>
                <span className="notification-copy"><b>{alert.code} · {alert.facilityCode}</b><small>{expired ? (english ? `Expired ${date}` : `${date} tarihinde vadesi doldu`) : (english ? `Expires ${date}` : `${date} tarihinde vadesi doluyor`)}</small></span>
                <strong className={expired ? 'expired' : ''}>{amount} {alert.currencyCode}</strong>
              </button>
              <button type="button" className="notification-dismiss" aria-label={english ? `Dismiss ${alert.code}` : `${alert.code} uyarısını kapat`} title={english ? 'Dismiss' : 'Kapat'} disabled={dismissingAlert === key} onClick={() => void dismissAlert(alert)}>{dismissingAlert === key ? '…' : '×'}</button>
            </div>
          })}</div>}
          <footer><button type="button" onClick={() => { setNotificationsOpen(false); onNavigate('finance-credit-facilities') }}>{english ? 'Open loans & financing' : 'Krediler ve finansmanı aç'}<ExternalLink size={13}/></button></footer>
        </section>}
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
