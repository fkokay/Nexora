import type { FormEvent } from 'react'
import type { CustomerLocationProvinceView, TurkeyLocationOption } from '../../erp-types'

type ProvinceFormProps = {
  editingId: number | null
  name: string
  active: boolean
  busy: boolean
  onNameChange: (value: string) => void
  onActiveChange: (value: boolean) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}

function ProvinceForm({ editingId, name, active, busy, onNameChange, onActiveChange, onSubmit, onCancel }: ProvinceFormProps) {
  return <form className="collection-form" onSubmit={onSubmit}>
    <div className="form-two">
      <label>İl adı<input value={name} onChange={event => onNameChange(event.target.value)} required maxLength={100} placeholder="İl adı"/></label>
      <label>Durum<select value={active ? 'active' : 'inactive'} onChange={event => onActiveChange(event.target.value === 'active')}><option value="active">Aktif</option><option value="inactive">Pasif</option></select></label>
    </div>
    <div className="modal-foot"><span>{editingId ? 'Seçili il tanımını düzenleyin.' : 'Yeni il tanımı ekleyin.'}</span><div>
      {editingId && <button type="button" className="secondary" onClick={onCancel}>Vazgeç</button>}
      <button className="primary" disabled={busy}>{busy ? 'Kaydediliyor…' : editingId ? 'İl tanımını kaydet' : 'İl ekle'}</button>
    </div></div>
  </form>
}

type ProvinceGridProps = {
  provinces: CustomerLocationProvinceView[]
  districts: { provinceId: number }[]
  selectedProvinceId: number
  loading: boolean
  busy: boolean
  onSelect: (id: number) => void
  onEdit: (item: CustomerLocationProvinceView) => void
  onToggle: (item: TurkeyLocationOption) => void
}

function ProvinceGrid({ provinces, districts, selectedProvinceId, loading, busy, onSelect, onEdit, onToggle }: ProvinceGridProps) {
  return <div className="ledger-list"><table className="customer-table"><thead><tr><th>İl</th><th>Durum</th><th>İlçeler</th><th>İşlemler</th></tr></thead><tbody>
    {provinces.map(item => <tr key={item.id} className={selectedProvinceId === item.id ? 'erp-selected-row' : ''} onClick={() => onSelect(item.id)}>
      <td><b>{item.name}</b></td><td>{item.isActive ? 'Aktif' : 'Pasif'}</td><td>{districts.filter(district => district.provinceId === item.id).length}</td>
      <td><button type="button" className="row-action" onClick={event => { event.stopPropagation(); onEdit(item) }}>Düzenle</button><button type="button" className="row-action" disabled={busy} onClick={event => { event.stopPropagation(); onToggle(item) }}>{item.isActive ? 'Pasife al' : 'Etkinleştir'}</button></td>
    </tr>)}
    {!loading && provinces.length === 0 && <tr><td colSpan={4} className="table-empty">İl tanımı bulunamadı.</td></tr>}
  </tbody></table></div>
}

type Props = ProvinceFormProps & ProvinceGridProps

export function ProvinceSection(props: Props) {
  const { provinces, districts, selectedProvinceId, loading, busy, onSelect, onEdit, onToggle, editingId, name, active, onNameChange, onActiveChange, onSubmit, onCancel } = props
  return <section className="panel">
    <div className="panel-heading"><div><h2>İl tanımları</h2><p>{provinces.length} il · varsayılan Türkiye listesi</p></div></div>
    <ProvinceForm editingId={editingId} name={name} active={active} busy={busy} onNameChange={onNameChange} onActiveChange={onActiveChange} onSubmit={onSubmit} onCancel={onCancel}/>
    <ProvinceGrid provinces={provinces} districts={districts} selectedProvinceId={selectedProvinceId} loading={loading} busy={busy} onSelect={onSelect} onEdit={onEdit} onToggle={onToggle}/>
  </section>
}
