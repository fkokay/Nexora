import type { ReactNode } from 'react'
import { RotateCcw, Save, Settings } from 'lucide-react'

type Props = { title: string; description: ReactNode; english: boolean; saved: boolean; onReset: () => void; onSave: () => void }

export function SettingsPageHeader({ title, description, english, saved, onReset, onSave }: Props) {
  return <header className="settings-heading">
    <div><span className="settings-heading-icon"><Settings size={24}/></span><span><h1>{title}</h1><p>{description}</p></span></div>
    <div><button type="button" className="secondary" onClick={onReset}><RotateCcw size={16}/>{english ? 'Restore defaults' : 'Varsayılanlara dön'}</button><button type="button" className="primary" onClick={onSave}><Save size={16}/>{saved ? (english ? 'Saved' : 'Kaydedildi') : (english ? 'Save' : 'Kaydet')}</button></div>
  </header>
}
