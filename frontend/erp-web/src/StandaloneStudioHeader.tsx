import { Sparkles } from 'lucide-react'
import type { Locale } from './WorkspaceComponents'
import type { Tenant } from './erp-types'

export function StandaloneStudioHeader({ tenant, locale, onReturn, onSignOut }: { tenant: Tenant; locale: Locale; onReturn: () => void; onSignOut: () => void }) {
  const english = locale === 'en'
  return <header className="studio-standalone-bar">
    <div><b><Sparkles size={16}/> AI Development Studio</b><small>{tenant.name} · {tenant.role}</small></div>
    <div><button className="secondary small-button" onClick={onReturn}>{english ? 'Return to ERP' : 'ERP’ye dön'}</button><button className="secondary small-button" onClick={onSignOut}>{english ? 'Sign out' : 'Oturumu kapat'}</button></div>
  </header>
}
