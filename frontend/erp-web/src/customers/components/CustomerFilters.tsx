import { Filter, Search } from 'lucide-react'

type Props = {
  search: string
  typeFilter: string
  statusFilter: string
  onSearchChange: (value: string) => void
  onTypeChange: (value: string) => void
  onStatusChange: (value: string) => void
  onApply: () => void
}

export function CustomerFilters({ search, typeFilter, statusFilter, onSearchChange, onTypeChange, onStatusChange, onApply }: Props) {
  return <div className="customer-toolbar customer-directory-toolbar">
    <form className="customer-search" onSubmit={event => { event.preventDefault(); onApply() }}>
      <Search size={16}/>
      <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Cari kodu, unvanı veya vergi no ile ara" aria-label="Cari kodu, unvanı veya vergi no ile ara"/>
    </form>
    <label className="customer-filter-field"><span>Cari türü</span><select value={typeFilter} onChange={event => onTypeChange(event.target.value)}><option value="">Tümü</option><option value="Customer">Müşteri</option><option value="Supplier">Tedarikçi</option><option value="Both">Diğer</option></select></label>
    <label className="customer-filter-field"><span>Durum</span><select value={statusFilter} onChange={event => onStatusChange(event.target.value)}><option value="">Tümü</option><option value="Active">Aktif</option><option value="Inactive">Pasif</option></select></label>
    <button type="button" className="secondary customer-filter-button" onClick={onApply}><Filter size={15}/> Filtrele</button>
  </div>
}
