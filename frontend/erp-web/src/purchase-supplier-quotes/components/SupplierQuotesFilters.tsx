import { Search } from 'lucide-react'

type Props = {
  search: string
  status: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
}

export default function SupplierQuotesFilters({ search, status, onSearchChange, onStatusChange }: Props) {
  return (
    <div className="customer-toolbar purchase-request-toolbar">
      <label className="customer-search">
        <Search size={15} />
        <input
          type="search"
          aria-label="Tedarikçi tekliflerinde ara"
          placeholder="Teklif no, talep no veya tedarikçi"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
        />
      </label>
      <label>
        <span>Durum</span>
        <select value={status} onChange={event => onStatusChange(event.target.value)}>
          <option value="">Tüm durumlar</option>
          <option value="Submitted">Değerlendirmede</option>
          <option value="Selected">Seçildi</option>
          <option value="NotSelected">Seçilmedi</option>
        </select>
      </label>
    </div>
  )
}
