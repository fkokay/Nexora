import { Search } from 'lucide-react'
import SearchableRecordPicker from '../../SearchableRecordPicker'
import type { Warehouse } from '../../erp-types'

type Props = {
  warehouses: Warehouse[]
  warehouseId: string
  search: string
  belowMinimumOnly: boolean
  belowMinimumCount: number
  balancesLoading: boolean
  loading: boolean
  onWarehouseChange: (id: string) => void
  onSearchChange: (value: string) => void
  onToggleBelowMinimum: () => void
}

export function InventoryStockFilters({ warehouses, warehouseId, search, belowMinimumOnly, belowMinimumCount, balancesLoading, loading, onWarehouseChange, onSearchChange, onToggleBelowMinimum }: Props) {
  return <div className="customer-toolbar">
    <label className="warehouse-picker">Depo<SearchableRecordPicker options={warehouses.map(item => ({ id: item.id, label: `${item.code} · ${item.name}`, description: item.isActive ? 'Aktif' : 'Pasif' }))} selectedId={warehouseId} onSelect={onWarehouseChange} title="Depo seçin" placeholder="Depo seçin" searchPlaceholder="Depo kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen depo bulunamadı."/></label>
    <label className="inventory-stock-search"><Search size={16}/><input aria-label="Stok ara" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Kod veya stok adıyla ara"/></label>
    <button type="button" className={belowMinimumOnly ? 'primary' : 'secondary'} aria-pressed={belowMinimumOnly} disabled={balancesLoading} onClick={onToggleBelowMinimum}>Minimum altı · {balancesLoading ? '…' : belowMinimumCount}</button>
    <span className="date-pill">{balancesLoading ? 'Bakiyeler yükleniyor…' : loading ? 'Yükleniyor…' : 'Tenant kapsamlı stok'}</span>
  </div>
}
