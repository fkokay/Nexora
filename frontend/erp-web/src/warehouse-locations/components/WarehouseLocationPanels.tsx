import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import { Search, Warehouse } from 'lucide-react'
import type { Balance, Location, Reconciliation, ScreenField } from '../types'

type LocationListProps = {
  locations: Location[]
  filteredLocations: Location[]
  visibleFields: ScreenField[]
  selectedId: string
  search: string
  loading: boolean
  warehouseId: string
  busy: boolean
  role: string
  onSearchChange: (value: string) => void
  onSelect: (id: string) => void
  onEdit: (location: Location) => void
}

export function LocationListPanel({ locations, filteredLocations, visibleFields, selectedId, search, loading, warehouseId, busy, role, onSearchChange, onSelect, onEdit }: LocationListProps) {
  return <section className="panel warehouse-location-list-panel" aria-labelledby="warehouse-location-list-title" aria-busy={loading}>
    <div className="panel-heading"><div><b id="warehouse-location-list-title">Raf ve bölmeler</b><small>{locations.filter(row => row.isActive).length} aktif · {locations.length} toplam</small></div></div>
    <label className="warehouse-location-search"><Search size={16} aria-hidden="true"/><input type="search" value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Kod, ad veya üst konum ara" aria-label="Kod, ad veya üst konum ara" disabled={loading || locations.length === 0}/>{search && <button type="button" onClick={() => onSearchChange('')} aria-label="Aramayı temizle">×</button>}</label>
    {loading ? <div className="empty-small" role="status" aria-live="polite">Konumlar yükleniyor…</div>
      : !warehouseId ? <div className="empty-small">Konumları görmek için önce bir depo seçin.</div>
      : locations.length === 0 ? <div className="empty-small">Bu depoda henüz konum yok. Kod ve ad vererek raf ya da bölme ekleyin.</div>
      : filteredLocations.length === 0 ? <div className="empty-small" role="status">“{search}” aramasıyla eşleşen konum bulunamadı.</div>
      : visibleFields.length === 0 ? <div className="empty-small">Konum görünümünde açık sütun bulunmuyor.</div>
      : <div className="customer-table-wrap warehouse-location-table-wrap" role="region" aria-label="Depo raf ve bölme listesi" tabIndex={0}>
        <AdvancedDataGrid enableRowSelection={false} className="customer-table" aria-label="Depo raf ve bölmeler">
          <thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field => <th scope="col" key={field.key}>{field.label}</th>)}</tr></thead>
          <tbody>{filteredLocations.map(location => <tr key={location.id} className={selectedId === location.id ? 'selected' : undefined}>
            {visibleFields.map(field => <td key={field.key}>
              {field.key === 'code' ? <button type="button" className="warehouse-location-select" aria-pressed={selectedId === location.id} onClick={() => onSelect(location.id)}><b>{location.code}</b></button>
                : field.key === 'name' ? location.name
                : field.key === 'parentLocation' ? (locations.find(row => row.id === location.parentLocationId)?.code ?? 'Üst düzey')
                : field.key === 'status' ? <span className={location.isActive ? 'warehouse-location-state is-active' : 'warehouse-location-state'}>{location.isActive ? 'Aktif' : 'Pasif'}</span>
                : field.key === 'actions' ? <div className="row-actions"><button type="button" className="secondary small-button" onClick={() => onSelect(location.id)}>Seç</button>{role === 'TenantAdmin' && <button type="button" className="row-action" disabled={busy} onClick={() => onEdit(location)} aria-label={`${location.code} konumunu düzenle`}>Düzenle</button>}</div>
                : '—'}
            </td>)}
          </tr>)}</tbody>
        </AdvancedDataGrid>
      </div>}
  </section>
}

type LocationBalanceProps = {
  selected: Location | null
  locations: Location[]
  balances: Balance[]
  visibleFields: ScreenField[]
  loading: boolean
  error: string
  role: string
  busy: boolean
  onEdit: (location: Location) => void
}

export function LocationBalancePanel({ selected, locations, balances, visibleFields, loading, error, role, busy, onEdit }: LocationBalanceProps) {
  return <section className="panel warehouse-location-detail" aria-labelledby="warehouse-location-balance-title" aria-busy={loading}>
    <div className="panel-heading"><div><b id="warehouse-location-balance-title">{selected ? `${selected.code} · ${selected.name}` : 'Konum bakiyesi'}</b><small>{selected ? 'Bu konuma açıkça atanmış stok hareketlerinin net miktarı' : 'Bakiye görmek için bir konum seçin.'}</small></div><span className="tenant-scope"><Warehouse size={14} aria-hidden="true"/>{balances.length} stok satırı</span></div>
    {selected && <div className="warehouse-record-summary">
      <div><small>Konum kodu</small><b>{selected.code}</b></div><div><small>Konum adı</small><b>{selected.name}</b></div>
      <div><small>Üst konum</small><b>{selected.parentLocationId ? locations.find(row => row.id === selected.parentLocationId)?.code : 'Üst düzey'}</b></div>
      <span className={selected.isActive ? 'warehouse-location-state is-active' : 'warehouse-location-state'}>{selected.isActive ? 'Aktif' : 'Pasif'}</span>
      {role === 'TenantAdmin' && <button type="button" className="secondary" disabled={busy} onClick={() => onEdit(selected)}>Düzenle</button>}
    </div>}
    {error ? <div className="empty-small" role="alert">{error}</div>
      : !selected ? <div className="empty-small">Bir raf veya bölme seçin.</div>
      : loading ? <div className="empty-small" role="status" aria-live="polite">Konum bakiyesi yükleniyor…</div>
      : balances.length === 0 ? <div className="empty-small">Bu konumda stok bakiyesi bulunmuyor.</div>
      : visibleFields.length === 0 ? <div className="empty-small">Bakiye görünümünde açık sütun bulunmuyor.</div>
      : <div className="customer-table-wrap warehouse-location-table-wrap" role="region" aria-label="Konum stok bakiyesi tablosu" tabIndex={0}>
        <AdvancedDataGrid enableRowSelection={false} className="customer-table" aria-label={`${selected.code} konumundaki stok bakiyeleri`}>
          <thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field => <th scope="col" key={field.key}>{field.label}</th>)}</tr></thead>
          <tbody>{balances.map(row => <tr key={row.stockItemId}>{visibleFields.map(field => <td key={field.key}>
            {field.key === 'stockItemCode' ? <b>{row.stockItemCode}</b> : field.key === 'stockItemName' ? row.stockItemName : field.key === 'quantity' ? row.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : row.unitCode}
          </td>)}</tr>)}</tbody>
        </AdvancedDataGrid>
      </div>}
  </section>
}

type ReconciliationPanelProps = { rows: Reconciliation[]; visibleFields: ScreenField[]; loading: boolean; error: string }

export function ReconciliationPanel({ rows, visibleFields, loading, error }: ReconciliationPanelProps) {
  return <section className="panel warehouse-location-reconciliation" aria-labelledby="warehouse-location-reconciliation-title" aria-busy={loading}>
    <div className="panel-heading"><div><b id="warehouse-location-reconciliation-title">Konumlandırma denetimi</b><small>Raf/konum ataması olmayan hareketler nedeniyle depo bakiyesiyle konum bakiyeleri arasındaki fark</small></div><span className="tenant-scope"><Warehouse size={14} aria-hidden="true"/>{rows.length} stok kalemi</span></div>
    <p className="warehouse-location-reconciliation-note">Konumu boş eski hareketler burada görünür; bu ekran geçmiş kayıtlara otomatik konum atamaz. Miktarlar kendi stok birimleri içinde karşılaştırılır.</p>
    {error ? <div className="empty-small" role="alert">{error}</div>
      : loading ? <div className="empty-small" role="status" aria-live="polite">Depo ve konum bakiyeleri karşılaştırılıyor…</div>
      : rows.length === 0 ? <div className="empty-small">Konumu boş hareket kaynaklı fark bulunmuyor.</div>
      : visibleFields.length === 0 ? <div className="empty-small">Denetim görünümünde açık sütun bulunmuyor.</div>
      : <div className="customer-table-wrap warehouse-location-table-wrap" role="region" aria-label="Depo ve konum bakiyesi karşılaştırması" tabIndex={0}>
        <AdvancedDataGrid enableRowSelection={false} className="customer-table" aria-label="Konumlandırma denetimi">
          <thead><ScreenViewGroupHeader fields={visibleFields}/><tr>{visibleFields.map(field => <th scope="col" key={field.key}>{field.label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.stockItemId}>{visibleFields.map(field => <td key={field.key}>
            {field.key === 'stockItemCode' ? <b>{row.stockItemCode}</b> : field.key === 'stockItemName' ? row.stockItemName
              : field.key === 'warehouseQuantity' ? row.warehouseQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })
              : field.key === 'locatedQuantity' ? row.locatedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })
              : field.key === 'unlocatedQuantity' ? <span className="warehouse-unlocated-quantity">{row.unlocatedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</span>
              : field.key === 'unitCode' ? row.unitCode : '—'}
          </td>)}</tr>)}</tbody>
        </AdvancedDataGrid>
      </div>}
  </section>
}
