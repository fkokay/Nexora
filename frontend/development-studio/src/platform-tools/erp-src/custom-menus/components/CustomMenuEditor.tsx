import type { FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import type { Target } from '../types'

type Props = {
  admin: boolean
  busy: boolean
  editing: boolean
  code: string
  label: string
  targetPage: string
  targets: Target[]
  entryCount: number
  onSubmit: (event: FormEvent) => void
  onCodeChange: (value: string) => void
  onLabelChange: (value: string) => void
  onTargetChange: (value: string) => void
  onReset: () => void
}

export function CustomMenuEditor({ admin, busy, editing, code, label, targetPage, targets, entryCount, onSubmit, onCodeChange, onLabelChange, onTargetChange, onReset }: Props) {
  return <section className="panel custom-menu-editor"><div className="panel-heading"><div><h3>{editing ? 'Menüyü düzenle' : 'Yeni menü öğesi'}</h3><p>Hedef, yetkili ERP sayfa kataloğundan seçilir.</p></div>{editing && <button type="button" className="icon-button" onClick={onReset} aria-label="Düzenlemeyi kapat"><X size={18}/></button>}</div>
    {admin ? <form onSubmit={onSubmit}>
      <label className="custom-menu-field">Menü kodu<input required maxLength={40} pattern="[a-z][a-z0-9_-]{0,39}" value={code} onChange={event => onCodeChange(event.target.value)} placeholder="depo-kisayolu"/><small>Küçük harfle başlar; harf, rakam, tire ve alt çizgi kullanılabilir.</small></label>
      <label className="custom-menu-field">Görünen ad<input required maxLength={80} value={label} onChange={event => onLabelChange(event.target.value)} placeholder="Depo yönetimi"/></label>
      <label className="custom-menu-field">ERP sayfası<select value={targetPage} onChange={event => onTargetChange(event.target.value)}>{targets.map(target => <option key={target.page} value={target.page}>{target.label}</option>)}</select></label>
      <div className="custom-menu-form-actions"><button className="primary" disabled={busy || entryCount >= 30 && !editing}><Save size={16}/>{busy ? 'Kaydediliyor…' : editing ? 'Değişiklikleri kaydet' : 'Menü ekle'}</button>{editing && <button type="button" className="secondary" onClick={onReset}>Vazgeç</button>}</div>
    </form> : <div className="custom-menu-readonly">Özel menüleri yalnız TenantAdmin düzenleyebilir. Mevcut menüler çalışma alanı kenar çubuğunda görünür.</div>}
  </section>
}
