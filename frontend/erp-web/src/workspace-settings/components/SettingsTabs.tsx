export type SettingsTabDefinition = { id: string; label: string; en: string }
type Props = { tabs: SettingsTabDefinition[]; activeTab: string; english: boolean; onSelect: (tab: string) => void }

export function SettingsTabs({ tabs, activeTab, english, onSelect }: Props) {
  return <nav className="settings-tabs" aria-label={english ? 'Settings sections' : 'Ayar bölümleri'}>
    {tabs.map(item => <button type="button" key={item.id} className={activeTab === item.id ? 'active' : ''} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => onSelect(item.id)}>{english ? item.en : item.label}</button>)}
  </nav>
}
