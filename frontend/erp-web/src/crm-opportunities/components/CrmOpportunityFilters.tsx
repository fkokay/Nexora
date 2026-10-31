import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { stages, stageLabels } from '../types'

type Props = { loading: boolean; itemsCount: number; totalCount: number; page: number; query: string; filter: string; closeFrom: string; closeTo: string; valueFrom: string; valueTo: string; onQueryChange: (value: string) => void; onFilterChange: (value: string) => void; onCloseFromChange: (value: string) => void; onCloseToChange: (value: string) => void; onValueFromChange: (value: string) => void; onValueToChange: (value: string) => void; onClear: () => void }

export function CrmOpportunityFilters({ loading, itemsCount, totalCount, page, query, filter, closeFrom, closeTo, valueFrom, valueTo, onQueryChange, onFilterChange, onCloseFromChange, onCloseToChange, onValueFromChange, onValueToChange, onClear }: Props) {
  const [expanded,setExpanded]=useState(false)
  const hasAdvancedFilters=Boolean(closeFrom||closeTo||valueFrom||valueTo)
  return <div className="crm-filter-workbench">
    <div className="crm-panel-heading crm-list-heading">
      <div><h2>Satış hattı</h2><p>{loading ? 'Fırsatlar yükleniyor…' : `${itemsCount} / ${totalCount} fırsat gösteriliyor · sayfa ${page} · Aşamalar tenant içinde izlenir.`}</p></div>
      <div className="crm-toolbar">
      <label className="crm-search"><span>Ara</span><span className="crm-search-control"><Search size={16} aria-hidden="true" /><input aria-label="Fırsatlarda ara" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Kod, fırsat veya müşteri ara" /></span></label>
      <label className="crm-filter-label"><span>Aşama</span><select aria-label="Aşamaya göre filtrele" value={filter} onChange={event => onFilterChange(event.target.value)}><option value="">Tüm aşamalar</option>{stages.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
        <button type="button" className={`crm-advanced-toggle${expanded||hasAdvancedFilters?' active':''}`} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><SlidersHorizontal size={15}/> Diğer filtreler{hasAdvancedFilters&&<i/>}</button>
      </div>
    </div>
    {expanded&&<div className="crm-advanced-filters">
      <div className="crm-advanced-heading"><div><b>Gelişmiş filtreler</b><small>Tahmini kapanış tarihi ve fırsat değeri aralığı</small></div>{hasAdvancedFilters&&<button type="button" className="crm-clear-filters" onClick={onClear}><X size={14}/> Filtreleri temizle</button>}</div>
      <div className="crm-advanced-fields">
        <label>Beklenen kapanış · başlangıç<input type="date" value={closeFrom} onChange={event=>onCloseFromChange(event.target.value)}/></label>
        <label>Beklenen kapanış · bitiş<input type="date" value={closeTo} onChange={event=>onCloseToChange(event.target.value)}/></label>
        <label>Tahmini değer · en az<input type="number" min="0" step="0.01" value={valueFrom} onChange={event=>onValueFromChange(event.target.value)} placeholder="Alt sınır"/></label>
        <label>Tahmini değer · en fazla<input type="number" min="0" step="0.01" value={valueTo} onChange={event=>onValueToChange(event.target.value)} placeholder="Üst sınır"/></label>
      </div>
    </div>}
  </div>
}
