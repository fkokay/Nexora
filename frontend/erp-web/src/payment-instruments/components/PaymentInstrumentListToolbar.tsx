import { Search } from 'lucide-react'
import type { FormEvent } from 'react'
import type { KindFilter, Status, StatusFilter } from '../paymentInstrumentTypes'
import { statusText } from '../paymentInstrumentTypes'

type Props = {
  searchDraft: string
  searchTerm: string
  filter: StatusFilter
  kindFilter: KindFilter
  onSearchDraftChange: (value: string) => void
  onSearch: (event: FormEvent) => void
  onClearSearch: () => void
  onFilterChange: (value: StatusFilter) => void
  onKindFilterChange: (value: KindFilter) => void
}

export function PaymentInstrumentListToolbar({ searchDraft, searchTerm, filter, kindFilter, onSearchDraftChange, onSearch, onClearSearch, onFilterChange, onKindFilterChange }: Props) {
  return <div className="payment-instrument-list-toolbar">
    <form className="payment-instrument-search" onSubmit={onSearch}>
      <label><Search size={16}/><input type="search" aria-label="Çek/senet no, portföy kodu veya cari ara" placeholder="Çek/senet no, portföy kodu veya cari ara" maxLength={100} value={searchDraft} onChange={event => onSearchDraftChange(event.target.value)}/></label>
      <button type="submit" className="secondary">Ara</button>
      {searchTerm && <button type="button" className="secondary" onClick={onClearSearch}>Temizle</button>}
    </form>
    <div className="payment-instrument-filters">
      <select aria-label="Duruma göre filtrele" value={filter} onChange={event => onFilterChange(event.target.value as StatusFilter)}>
        <option value="All">Tüm durumlar</option>{(Object.keys(statusText) as Status[]).map(value => <option value={value} key={value}>{statusText[value]}</option>)}
      </select>
      <select aria-label="Türe göre filtrele" value={kindFilter} onChange={event => onKindFilterChange(event.target.value as KindFilter)}>
        <option value="All">Çek ve senet</option><option value="Check">Çekler</option><option value="PromissoryNote">Senetler</option>
      </select>
    </div>
  </div>
}
