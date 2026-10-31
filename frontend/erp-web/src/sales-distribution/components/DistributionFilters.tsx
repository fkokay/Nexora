import SearchableRecordPicker from '../../SearchableRecordPicker'
import type { Warehouse } from './types'

type Props = {
  warehouses: Warehouse[]
  warehouseId: string
  query: string
  busy: boolean
  onWarehouseChange: (id: string) => void
  onQueryChange: (query: string) => void
  onRefresh: () => void
}

export default function DistributionFilters({ warehouses, warehouseId, query, busy, onWarehouseChange, onQueryChange, onRefresh }: Props) {
  return <section className="sales-distribution-toolbar" aria-label="Plan filtreleri">
    <label>Depo<SearchableRecordPicker options={warehouses.map(x => ({ id: x.id, label: `${x.code} · ${x.name}` }))} selectedId={warehouseId} onSelect={onWarehouseChange} title="Depo seçin" placeholder="Depo seçin" clearable clearLabel="Depo filtresini kaldır" searchPlaceholder="Depo kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen depo bulunamadı." /></label>
    <label>Stok kodu veya adı<input value={query} maxLength={120} onChange={event => onQueryChange(event.target.value)} placeholder="Kod veya stok adı ara" /></label>
    <button type="button" className="secondary" onClick={onRefresh} disabled={busy}>Yenile</button>
  </section>
}
