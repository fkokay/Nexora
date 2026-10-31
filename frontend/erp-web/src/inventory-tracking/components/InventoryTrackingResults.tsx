import type { Warehouse } from '../types'

type Props = {
  loading: boolean
  error: string
  totalCount: number
  hasFilters: boolean
  search: string
  trackingMode: string
  warehouseId: string
  warehouses: Warehouse[]
}

export default function InventoryTrackingResults({ loading, error, totalCount, hasFilters, search, trackingMode, warehouseId, warehouses }: Props) {
  const filters = [
    search && `Arama: ${search}`,
    trackingMode && `İz türü: ${trackingMode === 'Lot' ? 'Lot' : 'Seri'}`,
    warehouseId && `Depo: ${warehouses.find(row => row.id === warehouseId)?.code ?? 'Seçili depo'}`
  ].filter(Boolean).join(' · ')

  return <div className="inventory-tracking-results" aria-live="polite" aria-atomic="true">
    <span>{loading ? 'Bakiyeler yükleniyor…' : error ? 'Sonuçlar yüklenemedi.' : `${totalCount} kayıt bulundu`}</span>
    {hasFilters && !loading && !error && <span>Uygulanan filtreler: {filters}</span>}
  </div>
}
