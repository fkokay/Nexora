import type { ReactNode } from 'react'
import { Bell, Database, Globe2, Mail, Monitor, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import type { Preferences, SettingsTab } from '../types'
import { SettingsCard } from './SettingsCard'
import { SettingsRow } from './SettingsRow'
import { SettingsSwitch } from './SettingsSwitch'

type ToggleKey = 'systemNotifications' | 'operationNotifications' | 'releaseNotes' | 'rememberSort' | 'rememberFilters' | 'saveColumns' | 'rememberTabs' | 'restoreTabs' | 'confirmTabClose' | 'preventDuplicateTabs'
type Props = {
  tab: SettingsTab
  values: Preferences
  english: boolean
  onUpdate: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  onNavigate: (page: string) => void
}

export function SettingsContent({ tab, values, english, onUpdate, onNavigate }: Props) {
  const row = (label: string, control: ReactNode) => <SettingsRow label={label}>{control}</SettingsRow>
  const toggle = (key: ToggleKey) => <SettingsSwitch checked={values[key]} label={key} onChange={() => onUpdate(key, !values[key])}/>
  const sessionTimeout = row(english ? 'Session timeout' : 'Oturum zaman aşımı', <span className="settings-input-unit"><input type="number" min="5" max="480" value={values.sessionTimeout} onChange={event => onUpdate('sessionTimeout', Number(event.target.value))}/><small>{english ? 'minutes' : 'dakika'}</small></span>)

  if (tab === 'application') return <div className="settings-card-grid">
    <SettingsCard icon={<Monitor size={20}/>} title={english ? 'General application settings' : 'Genel Uygulama Ayarları'}>
      {row(english ? 'Default start page' : 'Varsayılan başlangıç ekranı', <select value={values.defaultPage} onChange={event => onUpdate('defaultPage', event.target.value)}><option value="launcher">{english ? 'Module search' : 'Arama ekranı'}</option><option value="dashboard">{english ? 'Home dashboard' : 'Ana Sayfa'}</option></select>)}
      {row(english ? 'Default language' : 'Varsayılan dil', <select value={values.locale} onChange={event => onUpdate('locale', event.target.value as Preferences['locale'])}><option value="tr">Türkçe (TR)</option><option value="en">English (EN)</option></select>)}
      {row(english ? 'Default theme' : 'Varsayılan tema', <select value={values.theme} onChange={event => onUpdate('theme', event.target.value as Preferences['theme'])}><option value="light">{english ? 'Light theme' : 'Açık Tema'}</option><option value="dark">{english ? 'Dark theme' : 'Koyu Tema'}</option></select>)}
      {sessionTimeout}
    </SettingsCard>
    <SettingsCard icon={<Bell size={20}/>} title={english ? 'Notifications' : 'Bildirimler'}>{row(english ? 'Show system notifications' : 'Sistem bildirimlerini göster', toggle('systemNotifications'))}{row(english ? 'Notify about operation results' : 'İşlem sonuçlarını bildir', toggle('operationNotifications'))}{row(english ? 'Show release announcements' : 'Güncelleme duyurularını göster', toggle('releaseNotes'))}</SettingsCard>
    <SettingsCard icon={<SlidersHorizontal size={20}/>} title={english ? 'Table and list settings' : 'Tablo ve Liste Ayarları'}>
      {row(english ? 'Default rows per page' : 'Varsayılan kayıt sayısı', <select value={values.pageSize} onChange={event => onUpdate('pageSize', Number(event.target.value) as Preferences['pageSize'])}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>)}
      {row(english ? 'Remember table sorting' : 'Tablo sıralama', toggle('rememberSort'))}{row(english ? 'Remember table filters' : 'Tablo filtreleme', toggle('rememberFilters'))}{row(english ? 'Save column settings' : 'Kolon ayarlarını kaydet', toggle('saveColumns'))}
    </SettingsCard>
    <SettingsCard icon={<LayersIcon/>} title={english ? 'Workspace (tabs)' : 'Çalışma Alanı (Sekmeler)'}>{row(english ? 'Remember open tabs during session' : 'Açık sekmeleri oturumda hatırla', toggle('rememberTabs'))}{row(english ? 'Restore tabs on next visit' : 'Yeniden açıldığında sekmeleri geri yükle', toggle('restoreTabs'))}{row(english ? 'Ask before closing a tab' : 'Sekme kapatırken onay sor', toggle('confirmTabClose'))}{row(english ? 'Activate an already open tab' : 'Aynı ekranı yeniden açınca mevcut sekmeyi etkinleştir', toggle('preventDuplicateTabs'))}</SettingsCard>
  </div>

  if (tab === 'appearance') return <div className="settings-card-grid"><SettingsCard icon={<Monitor size={20}/>} title={english ? 'Theme' : 'Görünüm ve Tema'}>{row(english ? 'Color theme' : 'Renk teması', <select value={values.theme} onChange={event => onUpdate('theme', event.target.value as Preferences['theme'])}><option value="light">{english ? 'Light' : 'Açık Tema'}</option><option value="dark">{english ? 'Dark' : 'Koyu Tema'}</option></select>)}<p className="settings-hint">{english ? 'Corporate navy and gold accents are used throughout the workspace.' : 'Çalışma alanında kurumsal lacivert ve altın vurgular kullanılır.'}</p></SettingsCard></div>
  if (tab === 'regional') return <div className="settings-card-grid"><SettingsCard icon={<Globe2 size={20}/>} title={english ? 'Regional settings' : 'Bölgesel Ayarlar'}>
    {row(english ? 'Interface language' : 'Arayüz dili', <select value={values.locale} onChange={event => onUpdate('locale', event.target.value as Preferences['locale'])}><option value="tr">Türkçe (TR)</option><option value="en">English (EN)</option></select>)}
    {row(english ? 'Currency format' : 'Para birimi biçimi', <select defaultValue="TRY"><option>TRY · ₺</option><option>USD · $</option><option>EUR · €</option></select>)}{row(english ? 'Date format' : 'Tarih biçimi', <select defaultValue="dd.mm.yyyy"><option value="dd.mm.yyyy">31.12.2026</option><option value="yyyy-mm-dd">2026-12-31</option></select>)}
  </SettingsCard></div>
  if (tab === 'security') return <div className="settings-card-grid"><SettingsCard icon={<ShieldCheck size={20}/>} title={english ? 'Session security' : 'Güvenlik'}>{sessionTimeout}<p className="settings-hint">{english ? 'Access and permissions continue to be enforced by the ERP API.' : 'Erişim ve yetki kontrolleri ERP API tarafından uygulanır.'}</p></SettingsCard></div>
  if (tab === 'notifications') return <div className="settings-card-grid"><SettingsCard icon={<Mail size={20}/>} title={english ? 'Email (SMTP)' : 'E-Posta (SMTP)'}><p className="settings-hint">{english ? 'Configure delivery through the company integration settings.' : 'E-posta gönderim bağlantısını şirket entegrasyon ayarlarından yapılandırın.'}</p><button type="button" className="secondary" onClick={() => onNavigate('integrations')}>{english ? 'Open integrations' : 'Entegrasyonları aç'}</button></SettingsCard></div>
  return <div className="settings-card-grid"><SettingsCard icon={<Database size={20}/>} title={english ? 'File and storage' : 'Dosya ve Depolama'}><p className="settings-hint">{english ? 'Backup policies are managed by your platform administrator.' : 'Yedekleme politikaları platform yöneticisi tarafından yönetilir.'}</p></SettingsCard></div>
}

function LayersIcon() { return <span className="settings-layers-icon">▱</span> }
