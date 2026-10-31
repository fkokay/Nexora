import { Search } from 'lucide-react'
import { localizedText } from '../../locale'
import type { ModuleStatusFilter } from '../types'

type Props = {
  query: string
  statusFilter: ModuleStatusFilter
  moduleCount: number
  activeCount: number
  availableCount: number
  resultCount: number
  loading: boolean
  onQueryChange: (value: string) => void
  onStatusChange: (value: ModuleStatusFilter) => void
}

export function ModuleMarketplaceToolbar({ query, statusFilter, moduleCount, activeCount, availableCount, resultCount, loading, onQueryChange, onStatusChange }: Props) {
  return <section className="marketplace-toolbar" aria-label={localizedText('Modül kataloğu filtreleri', 'Module catalog filters')}>
    <label className="marketplace-search"><span>{localizedText('Katalogda ara', 'Search catalog')}</span><span className="marketplace-search-control"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder={localizedText('Modül adı, kodu veya yayıncı', 'Module name, code, or publisher')} aria-label={localizedText('Modül adı, kodu veya yayıncıya göre ara', 'Search by module name, code, or publisher')}/></span></label>
    <label className="marketplace-filter"><span>{localizedText('Durum', 'Status')}</span><select value={statusFilter} onChange={event => onStatusChange(event.target.value as ModuleStatusFilter)} aria-label={localizedText('Modül durumuna göre filtrele', 'Filter by module status')}>
      <option value="all">{localizedText(`Tüm durumlar (${moduleCount})`, `All statuses (${moduleCount})`)}</option><option value="active">{localizedText(`Tenant’ta etkin (${activeCount})`, `Active in tenant (${activeCount})`)}</option><option value="available">{localizedText(`Etkinleştirilebilir (${availableCount})`, `Available to activate (${availableCount})`)}</option><option value="blocked">{localizedText('Runtime hazır değil', 'Runtime not ready')}</option>
    </select></label>
    <div className="marketplace-result-count" aria-live="polite">{loading ? localizedText('Katalog yükleniyor…', 'Loading catalog…') : localizedText(`${resultCount} / ${moduleCount} modül`, `${resultCount} / ${moduleCount} modules`)}</div>
  </section>
}
