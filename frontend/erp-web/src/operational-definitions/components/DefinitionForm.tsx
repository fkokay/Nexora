import { Plus } from 'lucide-react'
import type { FormEvent } from 'react'
import type { Definition, DefinitionKind, Translate } from '../types'

type Props = {
  tx: Translate
  kind: DefinitionKind
  code: string
  name: string
  editing: Definition | null
  busy: boolean
  onSubmit: (event: FormEvent) => void
  onKindChange: (kind: DefinitionKind) => void
  onCodeChange: (code: string) => void
  onNameChange: (name: string) => void
  onCancel: () => void
}

export function DefinitionForm({ tx, kind, code, name, editing, busy, onSubmit, onKindChange, onCodeChange, onNameChange, onCancel }: Props) {
  return <form className="collection-form" onSubmit={onSubmit}>
    <div className="form-two">
      <label>{tx('Tanım türü', 'Definition type')}<select value={kind} onChange={event => onKindChange(event.target.value as DefinitionKind)}><option value="Workplace">{tx('İş yeri', 'Workplace')}</option><option value="Branch">{tx('Şube', 'Branch')}</option><option value="Factory">{tx('Fabrika', 'Factory')}</option></select></label>
      <label>{tx('Kod', 'Code')}<input value={code} onChange={event => onCodeChange(event.target.value.toUpperCase())} maxLength={40} required/></label>
      <label>{tx('Ad', 'Name')}<input value={name} onChange={event => onNameChange(event.target.value)} maxLength={120} required/></label>
    </div>
    <div className="modal-foot"><span>{editing ? tx('Seçili tanımı düzenleyin.', 'Edit the selected definition.') : tx('Yeni tanım ekleyin.', 'Add a new definition.')}</span><div>{editing && <button type="button" className="secondary" onClick={onCancel}>{tx('Vazgeç', 'Cancel')}</button>}<button className="primary" disabled={busy}><Plus size={16}/>{busy ? tx('Kaydediliyor…', 'Saving…') : editing ? tx('Değişiklikleri kaydet', 'Save changes') : tx('Tanım ekle', 'Add definition')}</button></div></div>
  </form>
}
