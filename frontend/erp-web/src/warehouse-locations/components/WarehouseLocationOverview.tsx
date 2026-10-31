import { RefreshCw, ShieldCheck } from 'lucide-react'
import SearchableRecordPicker from '../../SearchableRecordPicker'
import type { Location, WarehouseRow } from '../types'

type Props = {
  warehouses: WarehouseRow[]
  warehouseId: string
  locations: Location[]
  selected: Location | null
  balanceCount: number
  warehousesLoading: boolean
  loading: boolean
  balancesLoading: boolean
  reconciliationLoading: boolean
  error: string
  notice: string
  onRefresh: () => void
  onDismissError: () => void
  onDismissNotice: () => void
  onWarehouseSelect: (warehouseId: string) => void
}

export function WarehouseLocationOverview({
  warehouses, warehouseId, locations, selected, balanceCount,
  warehousesLoading, loading, balancesLoading, reconciliationLoading, error, notice,
  onRefresh, onDismissError, onDismissNotice, onWarehouseSelect,
}: Props) {
  const activeWarehouses = warehouses.filter(warehouse => warehouse.isActive)

  return <>
    <div className="page-heading customer-heading">
      <div><p className="eyebrow">ERP CORE · STOK YERLEŞİMİ</p><h1>Depo konumları</h1><p className="muted">Ambar içindeki raf ve bölmeleri tanımlayın; konuma atanmış stok bakiyelerini izleyin.</p></div>
      <div className="heading-actions"><button className="secondary" type="button" onClick={onRefresh} disabled={warehousesLoading || loading || balancesLoading || reconciliationLoading} aria-label="Depo, konum ve bakiyeleri yenile"><RefreshCw size={15} aria-hidden="true"/> Yenile</button></div>
    </div>
    {error && <div className="alert inline-alert" role="alert">{error}<button type="button" aria-label="Hata mesajını kapat" onClick={onDismissError}>×</button></div>}
    {notice && <div className="notice" role="status">{notice}<button type="button" onClick={onDismissNotice}>Kapat</button></div>}
    <section className="warehouse-location-kpis" aria-label="Depo yerleşimi özeti">
      <article><span>Depo</span><b>{warehouses.find(row => row.id === warehouseId)?.name ?? 'Seçilmedi'}</b><small>{activeWarehouses.length} aktif depo</small></article>
      <article><span>Depo konumu</span><b>{locations.length}</b><small>{locations.filter(row => row.isActive).length} aktif raf veya bölme</small></article>
      <article><span>Seçili konum bakiyesi</span><b>{balanceCount}</b><small>{selected ? `${selected.code} · ${selected.name}` : 'Bir konum seçin'}</small></article>
      <span className="tenant-scope"><ShieldCheck size={14}/>Firma kapsamlı</span>
    </section>
    <div className="customer-toolbar">
      <label className="warehouse-picker">Depo<SearchableRecordPicker
        options={warehouses.map(row => ({ id: row.id, label: `${row.code} · ${row.name}`, description: row.isActive ? 'Aktif' : 'Pasif' }))}
        selectedId={warehouseId} onSelect={onWarehouseSelect} title="Depo seçin"
        placeholder={warehousesLoading ? 'Depolar yükleniyor…' : 'Depo seçin'}
        searchPlaceholder="Depo kodu veya adıyla ara" emptyMessage="Aramanızla eşleşen depo bulunamadı."
        disabled={warehousesLoading} clearable clearLabel="Depo seçimini kaldır"
      /></label>
      <span className="date-pill">Firma kapsamlı · raf / bölme</span>
    </div>
  </>
}
