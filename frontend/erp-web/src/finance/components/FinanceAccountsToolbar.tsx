import { Search } from 'lucide-react'

type Props = {
  visibleCount: number
  totalCount: number
  query: string
  kind: 'all' | 'Cash' | 'Bank'
  status: 'all' | 'active' | 'inactive'
  onQueryChange: (value: string) => void
  onKindChange: (value: Props['kind']) => void
  onStatusChange: (value: Props['status']) => void
  onRefresh: () => void
}

export function FinanceAccountsToolbar({ visibleCount, totalCount, query, kind, status, onQueryChange, onKindChange, onStatusChange, onRefresh }: Props) {
  return <div className="list-toolbar finance-filterbar"><div><h2>Hesaplar</h2><p>{visibleCount} / {totalCount} kayıt</p></div>
    <div className="finance-filter-controls">
      <label className="finance-search"><Search size={16}/><input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Kod, hesap veya döviz ara"/></label>
      <select aria-label="Hesap türü" value={kind} onChange={event => onKindChange(event.target.value as Props['kind'])}><option value="all">Tüm türler</option><option value="Cash">Kasa</option><option value="Bank">Banka</option></select>
      <select aria-label="Hesap durumu" value={status} onChange={event => onStatusChange(event.target.value as Props['status'])}><option value="all">Tüm durumlar</option><option value="active">Aktif</option><option value="inactive">Pasif</option></select>
      <button className="secondary small-button" onClick={onRefresh}>Yenile</button>
    </div>
  </div>
}
