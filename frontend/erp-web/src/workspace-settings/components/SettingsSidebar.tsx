import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Settings } from 'lucide-react'

export type SettingsNavigationItem = {
  id: string
  label: string
  en: string
  icon: LucideIcon
  route?: string
}

type Props = {
  items: SettingsNavigationItem[]
  category: string
  english: boolean
  onSelect: (item: SettingsNavigationItem) => void
}

export function SettingsSidebar({ items, category, english, onSelect }: Props) {
  return <aside className="settings-sidebar">
    <div className="settings-sidebar-title"><Settings size={24}/><span><b>{english ? 'Settings' : 'Ayarlar'}</b><small>{english ? 'System and application configuration' : 'Sistem ve uygulama yapılandırması'}</small></span></div>
    <nav aria-label={english ? 'Settings categories' : 'Ayar kategorileri'}>
      {items.map((item, index) => {
        const Icon = item.icon
        return <button type="button" key={`${item.id}-${index}`} className={category === item.id && !item.route ? 'active' : ''} onClick={() => onSelect(item)}>
          <Icon size={18}/><span>{english ? item.en : item.label}</span>{index === 6 && <ChevronDown size={14}/>}
        </button>
      })}
    </nav>
  </aside>
}
