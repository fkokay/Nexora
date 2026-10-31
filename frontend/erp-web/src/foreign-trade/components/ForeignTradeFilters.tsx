import { localizedText } from '../../locale'
import type { Direction } from '../types'

type Props = { query: string; direction: 'All' | Direction; onQueryChange: (value: string) => void; onDirectionChange: (value: 'All' | Direction) => void }

export function ForeignTradeFilters({ query, direction, onQueryChange, onDirectionChange }: Props) {
  return <div className="foreign-trade-filters">
    <input aria-label={localizedText('Referans ara', 'Search references')} placeholder={localizedText('Referans ara…', 'Search references…')} value={query} onChange={event => onQueryChange(event.target.value)}/>
    <select aria-label={localizedText('Yön filtresi', 'Filter by direction')} value={direction} onChange={event => onDirectionChange(event.target.value as 'All' | Direction)}>
      <option value="All">{localizedText('Tüm yönler', 'All directions')}</option><option value="Import">{localizedText('İthalat', 'Import')}</option><option value="Export">{localizedText('İhracat', 'Export')}</option>
    </select>
  </div>
}
