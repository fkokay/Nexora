import type { ReactNode } from 'react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { Asset, AssetField } from '../types'

type Props = {
  assets: Asset[]
  totalAssetCount: number
  fields: AssetField[]
  loading: boolean
  search: string
  status: string
  selectedId: string | null
  locale: 'tr' | 'en'
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSelect: (asset: Asset) => void
  fieldLabel: (key: string, label: string) => string
  formatField: (asset: Asset, key: string) => ReactNode
}

export function FixedAssetRegister({ assets, totalAssetCount, fields, loading, search, status, selectedId, locale, onSearchChange, onStatusChange, onSelect, fieldLabel, formatField }: Props) {
  const en = locale === 'en'
  return <section className="panel" aria-labelledby="asset-register-heading">
    <div className="panel-heading"><div><h3 id="asset-register-heading">{en ? 'Asset register' : 'Kıymet listesi'}</h3><p role="status" aria-live="polite">{loading ? (en ? 'Loading assets…' : 'Kıymetler yükleniyor…') : `${assets.length} / ${totalAssetCount} ${en ? 'records' : 'kayıt'}`}</p></div></div>
    <div className="fixed-asset-register-toolbar">
      <label><span>{en ? 'Search' : 'Ara'}</span><input type="search" value={search} onChange={event => onSearchChange(event.target.value)} placeholder={en ? 'Code, name, or category' : 'Kod, ad veya kategori'} /></label>
      <label><span>{en ? 'Status' : 'Durum'}</span><select value={status} onChange={event => onStatusChange(event.target.value)}><option value="all">{en ? 'All assets' : 'Tüm kıymetler'}</option><option value="active">{en ? 'Active' : 'Etkin'}</option><option value="inactive">{en ? 'Disposed or inactive' : 'Elden çıkarılan veya pasif'}</option></select></label>
    </div>
    <div className="ledger-list" role="region" aria-label={en ? 'Asset register table' : 'Kıymet listesi tablosu'} tabIndex={0}>
      <AdvancedDataGrid enableRowSelection={false} hideSearch className="customer-table fixed-asset-register-table">
        <thead><ScreenViewGroupHeader fields={fields} generalLabel={en ? 'General' : 'Genel'} /><tr>{fields.map(field => <th key={field.key} scope="col">{fieldLabel(field.key, field.label)}</th>)}</tr></thead>
        <tbody>
          {assets.map(asset => <tr key={asset.id} className={selectedId === asset.id ? 'fixed-asset-selected' : ''}>{fields.map(field => <td key={field.key} data-label={fieldLabel(field.key, field.label)}>{field.key === 'actions' ? <button type="button" className="row-action" aria-pressed={selectedId === asset.id} onClick={() => onSelect(asset)}>{en ? 'Details' : 'Detay'}</button> : field.key === 'name' ? <><button type="button" className="row-action" aria-pressed={selectedId === asset.id} onClick={() => onSelect(asset)}>{asset.assetCode}</button><small className="cell-subtitle">{asset.name}</small></> : formatField(asset, field.key)}</td>)}</tr>)}
          {loading && !assets.length && <tr><td colSpan={Math.max(fields.length, 1)} className="table-empty" role="status">{en ? 'Loading assets…' : 'Kıymetler yükleniyor…'}</td></tr>}
          {!loading && !assets.length && <tr><td colSpan={Math.max(fields.length, 1)} className="table-empty">{totalAssetCount ? (en ? 'No assets match these filters.' : 'Filtreye uygun kıymet bulunamadı.') : (en ? 'No assets recorded yet. Use New acquisition to add one.' : 'Henüz kıymet kaydı yok. Yeni edinim ile ilk kaydı oluşturun.')}</td></tr>}
        </tbody>
      </AdvancedDataGrid>
    </div>
  </section>
}
