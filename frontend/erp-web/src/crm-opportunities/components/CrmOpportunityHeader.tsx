import { BriefcaseBusiness, Plus } from 'lucide-react'

type Props = { pipelineTotals: Record<string, number>; formatMoney: (amount: number, code: string, digits: number) => string; onCreate: () => void }

export function CrmOpportunityHeader({ pipelineTotals, formatMoney, onCreate }: Props) {
  const total = Object.entries(pipelineTotals)
  return <header className="crm-hero screen-page-header">
    <div className="crm-hero-icon" aria-hidden="true"><BriefcaseBusiness size={22} /></div>
    <div><p className="eyebrow">MÜŞTERİ İLİŞKİLERİ · SATIŞ HATTI</p><h1>CRM fırsatları</h1><p>Açık fırsatları aşamaları, tahmini kapanışları ve takip adımlarıyla yönetin.</p></div>
    <div className="crm-hero-total"><span>Görüntülenen açık fırsat değeri</span><b>{total.length ? total.map(([code, amount]) => formatMoney(amount, code, 0)).join(' · ') : 'Değer girilmedi'}</b></div>
    <button className="primary crm-new-action" type="button" onClick={onCreate}><Plus size={16} />Yeni fırsat</button>
  </header>
}
