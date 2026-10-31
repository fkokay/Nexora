import { Plus } from 'lucide-react'
import type { FormEvent, MouseEvent } from 'react'
import type { Location } from '../types'

type CreateLocationFormProps = {
  locations: Location[]
  warehouseId: string
  code: string
  name: string
  parentLocationId: string
  busy: boolean
  onCodeChange: (value: string) => void
  onNameChange: (value: string) => void
  onParentChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}

export function CreateLocationForm({ locations, warehouseId, code, name, parentLocationId, busy, onCodeChange, onNameChange, onParentChange, onSubmit }: CreateLocationFormProps) {
  return <form className="panel warehouse-location-form" onSubmit={onSubmit}>
    <div className="panel-heading"><div><b><Plus size={16}/> Konum oluştur</b><small>Kod depo içinde benzersiz olmalıdır. Üst konum seçerek hiyerarşi kurabilirsiniz.</small></div></div>
    <div className="form-three">
      <label>Konum kodu<input value={code} onChange={event => onCodeChange(event.target.value.toUpperCase())} required maxLength={40} placeholder="A-01-03"/></label>
      <label>Konum adı<input value={name} onChange={event => onNameChange(event.target.value)} required maxLength={120} placeholder="Raf 3 · Göz 1"/></label>
      <label>Üst konum<select value={parentLocationId} onChange={event => onParentChange(event.target.value)}><option value="">Üst düzey konum</option>{locations.filter(row => row.isActive).map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
    </div>
    <div className="modal-foot"><span>TenantAdmin yetkisiyle kaydedilir ve audit izi oluşturulur.</span><button className="primary" disabled={busy || !warehouseId || !code.trim() || !name.trim()}><Plus size={15}/> Konumu kaydet</button></div>
  </form>
}

type EditLocationModalProps = {
  editing: Location
  locations: Location[]
  editCode: string
  editName: string
  editParentLocationId: string
  editIsActive: boolean
  busy: boolean
  onEditCodeChange: (value: string) => void
  onEditNameChange: (value: string) => void
  onEditParentChange: (value: string) => void
  onEditIsActiveChange: (value: boolean) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}

export function EditLocationModal({ editing, locations, editCode, editName, editParentLocationId, editIsActive, busy, onEditCodeChange, onEditNameChange, onEditParentChange, onEditIsActiveChange, onClose, onSubmit }: EditLocationModalProps) {
  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) onClose()
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={closeOnBackdrop}>
    <form className="modal warehouse-location-edit-modal" role="dialog" aria-modal="true" aria-labelledby="warehouse-location-edit-title" onSubmit={onSubmit}>
      <div className="modal-head"><div><p className="eyebrow">DEPO YERLEŞİMİ · DÜZENLE</p><h2 id="warehouse-location-edit-title">{editing.code} konumunu düzenle</h2></div><button type="button" className="icon-button" aria-label="Kapat" disabled={busy} onClick={onClose}>×</button></div>
      <div className="form-two"><label>Konum kodu<input autoFocus value={editCode} onChange={event => onEditCodeChange(event.target.value.toUpperCase())} required maxLength={40}/></label><label>Konum adı<input value={editName} onChange={event => onEditNameChange(event.target.value)} required maxLength={120}/></label></div>
      <label>Üst konum<select value={editParentLocationId} onChange={event => onEditParentChange(event.target.value)}><option value="">Üst düzey konum</option>{locations.filter(row => row.isActive && row.id !== editing.id).map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
      <label className="warehouse-location-active"><input type="checkbox" checked={editIsActive} onChange={event => onEditIsActiveChange(event.target.checked)}/> Konum aktif</label>
      <div className="modal-foot"><span>Güncelleme sürüm denetimiyle ve audit iziyle kaydedilir.</span><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>Vazgeç</button><button className="primary" disabled={busy || !editCode.trim() || !editName.trim()}>Değişiklikleri kaydet</button></div></div>
    </form>
  </div>
}
