import { Search } from 'lucide-react'
import { stages, stageLabels } from '../types'

type Props = { loading: boolean; itemsCount: number; totalCount: number; page: number; query: string; filter: string; onQueryChange: (value: string) => void; onFilterChange: (value: string) => void }

export function CrmOpportunityFilters({ loading, itemsCount, totalCount, page, query, filter, onQueryChange, onFilterChange }: Props) {
  return <div className="crm-panel-heading crm-list-heading">
    <div><h2>Satış hattı</h2><p>{loading ? 'Fırsatlar yükleniyor…' : `${itemsCount} / ${totalCount} fırsat gösteriliyor · sayfa ${page} · Aşamalar tenant içinde izlenir.`}</p></div>
    <div className="crm-toolbar">
      <label className="crm-search"><span>Ara</span><span className="crm-search-control"><Search size={16} aria-hidden="true" /><input aria-label="Fırsatlarda ara" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Kod, fırsat veya müşteri ara" /></span></label>
      <label className="crm-filter-label"><span>Aşama</span><select aria-label="Aşamaya göre filtrele" value={filter} onChange={event => onFilterChange(event.target.value)}><option value="">Tüm aşamalar</option>{stages.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
    </div>
  </div>
}
