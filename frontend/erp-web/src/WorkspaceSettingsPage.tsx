import { useEffect, useState } from 'react'
import { Bell, Building2, Database, FileText, Hash, Info, Link2, Settings, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react'
import type { Locale } from './WorkspaceComponents'
import './workspace-settings.css'
import { SettingsSidebar, type SettingsNavigationItem } from './workspace-settings/components/SettingsSidebar'
import { SettingsPageHeader } from './workspace-settings/components/SettingsPageHeader'
import { SettingsTabs } from './workspace-settings/components/SettingsTabs'
import { SettingsContent } from './workspace-settings/components/SettingsContent'
import { defaultPreferences, type Preferences, type SettingsTab } from './workspace-settings/types'

const prefsKey=()=>`aierp.workspace-preferences.${encodeURIComponent((localStorage.getItem('aierp.user')||'user').trim().toLocaleLowerCase('tr-TR'))}`
function readPreferences():Preferences{try{return {...defaultPreferences,...JSON.parse(localStorage.getItem(prefsKey())||'{}')}}catch{return defaultPreferences}}
type Props={tenantName:string;locale:Locale;onLocaleChange:(locale:Locale)=>void;onThemeChange:(theme:'light'|'dark')=>void;onNavigate:(page:string)=>void}
export function WorkspaceSettingsPage({tenantName,locale,onLocaleChange,onThemeChange,onNavigate}:Props){
  const [values,setValues]=useState<Preferences>(readPreferences)
  const [tab,setTab]=useState<SettingsTab>('application')
  const [category,setCategory]=useState('general')
  const [saved,setSaved]=useState(false)
  const english=locale==='en'
  const tabs:Array<{id:SettingsTab;label:string;en:string}>= [{id:'application',label:'Uygulama Ayarları',en:'Application settings'},{id:'appearance',label:'Görünüm ve Tema',en:'Appearance & theme'},{id:'regional',label:'Bölgesel Ayarlar',en:'Regional settings'},{id:'security',label:'Güvenlik',en:'Security'},{id:'notifications',label:'E-Posta (SMTP)',en:'Email (SMTP)'},{id:'storage',label:'Dosya ve Depolama',en:'Files & storage'}]
  useEffect(()=>{setSaved(false)},[values,tab])
  function update<K extends keyof Preferences>(key:K,value:Preferences[K]){setValues(current=>({...current,[key]:value}))}
  function save(){localStorage.setItem(prefsKey(),JSON.stringify(values));onLocaleChange(values.locale);onThemeChange(values.theme);window.dispatchEvent(new Event('nexora:preferences-saved'));setSaved(true)}
  function reset(){setValues(defaultPreferences);localStorage.removeItem(prefsKey());onLocaleChange(defaultPreferences.locale);onThemeChange(defaultPreferences.theme);window.dispatchEvent(new Event('nexora:preferences-saved'))}
  const settingNav:SettingsNavigationItem[]=[
    {id:'general',label:'Genel Ayarlar',en:'General settings',icon:Settings},
    {id:'company-settings',label:'Şirket Bilgileri',en:'Company information',icon:Building2,route:'company-settings'},
    {id:'access',label:'Kullanıcılar ve Yetkiler',en:'Users & permissions',icon:Users,route:'access'},
    {id:'access',label:'Rol ve Yetki Grupları',en:'Roles & permission groups',icon:ShieldCheck,route:'access'},
    {id:'custom-lists',label:'Parametreler',en:'Parameters',icon:SlidersHorizontal,route:'custom-lists'},
    {id:'series',label:'Numara Serileri',en:'Number series',icon:Hash},
    {id:'integrations',label:'E-İşlemler',en:'E-transactions',icon:FileText,route:'integrations'},
    {id:'integrations',label:'Entegrasyonlar',en:'Integrations',icon:Link2,route:'integrations'},
    {id:'notifications',label:'Bildirim Ayarları',en:'Notification settings',icon:Bell},
    {id:'storage',label:'Yedekleme',en:'Backup',icon:Database},
    {id:'system',label:'Sistem Bilgileri',en:'System information',icon:Info}
  ]
  const title=settingNav.find(item=>item.id===category)?.[english?'en':'label']||'Genel Ayarlar'
  return <div className="workspace-settings">
    <SettingsSidebar items={settingNav} category={category} english={english} onSelect={item=>{if(item.route){onNavigate(item.route);return}setCategory(item.id);if(item.id==='notifications')setTab('notifications');if(item.id==='storage')setTab('storage')}}/>
    <main className="settings-main"><SettingsPageHeader title={title} description={<>{english?'Configure application preferences for':'Uygulama tercihlerini yapılandırın ·'} {tenantName}</>} english={english} saved={saved} onReset={reset} onSave={save}/>
      <SettingsTabs tabs={tabs} activeTab={tab} english={english} onSelect={value=>setTab(value as SettingsTab)}/>
      <SettingsContent tab={tab} values={values} english={english} onUpdate={update} onNavigate={onNavigate}/>
      <footer className="settings-page-footer"><span><Building2 size={15}/>{tenantName}</span><span>{english?'Changes are applied after saving':'Değişiklikler kaydedildiğinde uygulanır'}</span></footer>
    </main>
  </div>
}
