import { Search } from 'lucide-react'

type Props = {
  search: string
  from: string
  to: string
  onSearchChange: (value: string) => void
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onApply: () => void
  onRefresh: () => void
}

export function AuditLogFilters({ search, from, to, onSearchChange, onFromChange, onToChange, onApply, onRefresh }: Props) {
  return <div className="customer-toolbar audit-toolbar">
    <form className="customer-search" onSubmit={event => { event.preventDefault(); onApply() }}>
      <Search size={16}/><input value={search} onChange={event => onSearchChange(event.target.value)} maxLength={120} placeholder="İşlem veya kaynak ara"/>
      <button type="submit" className="secondary small-button">Ara</button>
    </form>
    <label className="date-pill audit-date-filter"><span>Başlangıç tarihi</span><input aria-label="Başlangıç tarihi" type="date" value={from} onChange={event => onFromChange(event.target.value)}/></label>
    <label className="date-pill audit-date-filter"><span>Bitiş tarihi</span><input aria-label="Bitiş tarihi" type="date" value={to} onChange={event => onToChange(event.target.value)}/></label>
    <button type="button" className="secondary small-button" onClick={onRefresh}>Yenile</button>
  </div>
}
