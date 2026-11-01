import { BriefcaseBusiness, Plus } from 'lucide-react'

type Props = { onCreate: () => void }

export function CrmOpportunityHeader({ onCreate }: Props) {
  return <header className="crm-hero screen-page-header">
    <div className="crm-hero-icon" aria-hidden="true"><BriefcaseBusiness size={22} /></div>
    <div><p className="eyebrow">MÜŞTERİ İLİŞKİLERİ · SATIŞ HATTI</p><h1>CRM fırsatları</h1><p>Açık fırsatları aşamaları, tahmini kapanışları ve takip adımlarıyla yönetin.</p></div>
    <button className="primary crm-new-action" type="button" onClick={onCreate}><Plus size={16} />Yeni fırsat</button>
  </header>
}
