import type { FormEvent } from 'react'
import { Search } from 'lucide-react'
import SearchableRecordPicker from '../../SearchableRecordPicker'
import type { Warehouse } from '../types'

type Props = {
  query: string
  onQueryChange: (value: string) => void
  trackingMode: string
  onTrackingModeChange: (value: string) => void
  warehouseId: string
  onWarehouseSelect: (value: string) => void
  warehouses: Warehouse[]
  warehousesLoading: boolean
  warehouseError: string
  hasFilters: boolean
  loading: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClear: () => void
}

export default function InventoryTrackingFilters({
  query, onQueryChange, trackingMode, onTrackingModeChange, warehouseId, onWarehouseSelect,
  warehouses, warehousesLoading, warehouseError, hasFilters, loading, onSubmit, onClear
}: Props) {
  return <form className="customer-toolbar inventory-tracking-toolbar" onSubmit={onSubmit} role="search" aria-label="Lot ve seri bakiyelerini filtrele">
    <label className="customer-search" htmlFor="inventory-tracking-search">
      <Search size={16} aria-hidden="true"/>
      <input id="inventory-tracking-search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Lot/seri kodu, stok veya depo ara" autoComplete="off"/>
    </label>
    <label htmlFor="inventory-tracking-mode">İz türü<select id="inventory-tracking-mode" value={trackingMode} onChange={event => onTrackingModeChange(event.target.value)}><option value="">Tümü</option><option value="Lot">Lot</option><option value="Serial">Seri</option></select></label>
    <label>Depo
      <SearchableRecordPicker id="inventory-tracking-warehouse" describedBy={warehouseError ? 'inventory-tracking-warehouse-error' : undefined} options={warehouses.map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }))} selectedId={warehouseId} onSelect={onWarehouseSelect} title="Depo seçin" placeholder="Tüm depolar" clearable clearLabel="Tüm depolar" searchPlaceholder="Depo kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen depo bulunamadı." disabled={warehousesLoading}/>
      {warehouseError && <span id="inventory-tracking-warehouse-error" className="inventory-tracking-field-error">Depo seçenekleri kullanılamıyor.</span>}
    </label>
    <div className="inventory-tracking-filter-actions">
      <button className="secondary" type="submit" disabled={loading}><Search size={14} aria-hidden="true"/> Ara</button>
      {hasFilters && <button className="inventory-tracking-clear" type="button" onClick={onClear}>Filtreleri temizle</button>}
    </div>
  </form>
}
