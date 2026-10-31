import { Search } from 'lucide-react'
import type { FormEvent } from 'react'
import type { CustomerLocationProvinceView, TurkeyDistrictOption } from '../../erp-types'

type DistrictFormProps = {
  provinces: CustomerLocationProvinceView[]
  editingId: number | null
  provinceId: string
  name: string
  active: boolean
  busy: boolean
  onProvinceIdChange: (value: string) => void
  onNameChange: (value: string) => void
  onActiveChange: (value: boolean) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}

function DistrictForm({ provinces, editingId, provinceId, name, active, busy, onProvinceIdChange, onNameChange, onActiveChange, onSubmit, onCancel }: DistrictFormProps) {
  return <form className="collection-form" onSubmit={onSubmit}>
    <div className="form-two">
      <label>İl<select value={provinceId} onChange={event => onProvinceIdChange(event.target.value)} required><option value="">İl seçin</option>{provinces.map(item => <option key={item.id} value={item.id}>{item.name}{item.isActive ? '' : ' · Pasif'}</option>)}</select></label>
      <label>İlçe adı<input value={name} onChange={event => onNameChange(event.target.value)} required maxLength={100} placeholder="İlçe adı"/></label>
      <label>Durum<select value={active ? 'active' : 'inactive'} onChange={event => onActiveChange(event.target.value === 'active')}><option value="active">Aktif</option><option value="inactive">Pasif</option></select></label>
    </div>
    <div className="modal-foot"><span>{editingId ? 'Seçili ilçe tanımını düzenleyin.' : 'Yeni ilçe tanımı ekleyin.'}</span><div>
      {editingId && <button type="button" className="secondary" onClick={onCancel}>Vazgeç</button>}
      <button className="primary" disabled={busy || provinces.length === 0}>{busy ? 'Kaydediliyor…' : editingId ? 'İlçe tanımını kaydet' : 'İlçe ekle'}</button>
    </div></div>
  </form>
}

type DistrictGridProps = {
  districts: TurkeyDistrictOption[]
  provinces: CustomerLocationProvinceView[]
  loading: boolean
  busy: boolean
  onEdit: (item: TurkeyDistrictOption) => void
  onToggle: (item: TurkeyDistrictOption) => void
}

function DistrictGrid({ districts, provinces, loading, busy, onEdit, onToggle }: DistrictGridProps) {
  return <div className="ledger-list"><table className="customer-table"><thead><tr><th>İlçe</th><th>İl</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>
    {districts.map(item => <tr key={item.id}><td><b>{item.name}</b></td><td>{provinces.find(province => province.id === item.provinceId)?.name || '—'}</td><td>{item.isActive ? 'Aktif' : 'Pasif'}</td>
      <td><button type="button" className="row-action" onClick={() => onEdit(item)}>Düzenle</button><button type="button" className="row-action" disabled={busy} onClick={() => onToggle(item)}>{item.isActive ? 'Pasife al' : 'Etkinleştir'}</button></td>
    </tr>)}
    {!loading && districts.length === 0 && <tr><td colSpan={4} className="table-empty">Seçili il için ilçe bulunamadı.</td></tr>}
  </tbody></table></div>
}

type Props = DistrictFormProps & DistrictGridProps & {
  title: string
  resultCount: number
  query: string
  onQueryChange: (value: string) => void
}

export function DistrictSection(props: Props) {
  const { provinces, editingId, provinceId, name, active, busy, onProvinceIdChange, onNameChange, onActiveChange, onSubmit, onCancel, districts, loading, onEdit, onToggle, title, resultCount, query, onQueryChange } = props
  return <section className="panel">
    <div className="panel-heading"><div><h2>{title}</h2><p>{resultCount} kayıt</p></div><label className="finance-search"><Search size={16}/><input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="İlçe ara"/></label></div>
    <DistrictForm provinces={provinces} editingId={editingId} provinceId={provinceId} name={name} active={active} busy={busy} onProvinceIdChange={onProvinceIdChange} onNameChange={onNameChange} onActiveChange={onActiveChange} onSubmit={onSubmit} onCancel={onCancel}/>
    <DistrictGrid districts={districts} provinces={provinces} loading={loading} busy={busy} onEdit={onEdit} onToggle={onToggle}/>
  </section>
}
