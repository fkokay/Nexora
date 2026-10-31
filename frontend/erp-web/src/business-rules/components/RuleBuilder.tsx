import { Plus, Zap } from 'lucide-react'
import type { Condition, Operator, Rule, Trigger, TriggerField, Workflow } from '../types'

type Props = {
  editing: Rule | null
  code: string
  name: string
  description: string
  workflowCode: string
  trigger: string
  triggerCatalog: Trigger[]
  publishedWorkflows: Workflow[]
  selectedTrigger: Trigger | undefined
  selectedFields: TriggerField[]
  conditions: Condition[]
  busy: boolean
  fieldType: (field: string) => string
  operatorsFor: (field: string) => Operator[]
  onCodeChange: (value: string) => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onWorkflowChange: (value: string) => void
  onTriggerChange: (value: string) => void
  onConditionChange: (index: number, patch: Partial<Condition>) => void
  onAddCondition: () => void
  onRemoveCondition: (index: number) => void
  onCancel: () => void
  onSave: () => void
}

export function RuleBuilder({ editing, code, name, description, workflowCode, trigger, triggerCatalog, publishedWorkflows, selectedTrigger, selectedFields, conditions, busy, fieldType, operatorsFor, onCodeChange, onNameChange, onDescriptionChange, onWorkflowChange, onTriggerChange, onConditionChange, onAddCondition, onRemoveCondition, onCancel, onSave }: Props) {
  const canSave = !busy && !!name.trim() && !!code.trim() && !!workflowCode && !!conditions.length && !conditions.some(condition => !['IsEmpty', 'IsNotEmpty'].includes(condition.operator) && !condition.value.trim())
  return <section className="rule-builder">
    <div className="rule-heading"><div><p className="eyebrow">{editing ? `${editing.code} · v${editing.version}` : 'KURAL TASARIMI'}</p><h2>{editing ? 'Taslağı düzenle' : 'Yeni kural oluştur'}</h2></div><div><button className="secondary" onClick={onCancel}>Vazgeç</button><button className="primary" disabled={!canSave} onClick={onSave}>Taslağı kaydet</button></div></div>
    <div className="rule-meta">
      <label>Kural kodu<input value={code} disabled={!!editing} onChange={event => onCodeChange(event.target.value)} placeholder="buyuk-talep-onayi" maxLength={40}/></label>
      <label>Ad<input value={name} onChange={event => onNameChange(event.target.value)} placeholder="Onay akışı kuralı" maxLength={120}/></label>
      <label>Başlatılacak akış<select value={workflowCode} onChange={event => onWorkflowChange(event.target.value)}><option value="">Akış seçin</option>{publishedWorkflows.map(flow => <option value={flow.code} key={flow.id}>{flow.name} · v{flow.version}</option>)}</select></label>
      <label>Tetikleyici<select value={trigger} onChange={event => onTriggerChange(event.target.value)}>{triggerCatalog.map(event => <option value={event.code} key={event.code}>{event.label}</option>)}</select></label>
      <label className="rule-description">Açıklama<input value={description} onChange={event => onDescriptionChange(event.target.value)} placeholder="Koşulun iş amacını yazın" maxLength={500}/></label>
    </div>
    <div className="conditions-heading"><div><h3>Koşullar</h3><p>{selectedTrigger?.description ?? 'Tüm koşullar eşleştiğinde seçilen onay akışı başlar.'}</p></div><button className="secondary" disabled={conditions.length >= 20 || !selectedFields.length} onClick={onAddCondition}><Plus size={14}/> Koşul ekle</button></div>
    <div className="conditions-list">{conditions.map((condition, index) => <div className="condition-row" key={index}><span className="condition-index">{String(index + 1).padStart(2, '0')}</span>
      <select value={condition.field} onChange={event => onConditionChange(index, { field: event.target.value, operator: operatorsFor(event.target.value)[0][0], value: '' })}>{selectedFields.map(field => <option value={field.code} key={field.code}>{field.label}</option>)}</select>
      <select value={condition.operator} onChange={event => onConditionChange(index, { operator: event.target.value })}>{operatorsFor(condition.field).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <input type={fieldType(condition.field) === 'number' ? 'number' : fieldType(condition.field) === 'date' ? 'date' : 'text'} disabled={condition.operator === 'IsEmpty' || condition.operator === 'IsNotEmpty'} value={condition.value} onChange={event => onConditionChange(index, { value: event.target.value })} placeholder="Değer"/>
      <button className="condition-remove" disabled={conditions.length === 1} title="Koşulu sil" onClick={() => onRemoveCondition(index)}>×</button>
    </div>)}</div>
    <div className="rule-example"><Zap size={16}/><span><b>Örnek:</b> {selectedFields.find(field => field.code === conditions[0]?.field)?.label ?? 'Seçilen alan'} {conditions[0]?.operator} “{conditions[0]?.value}” ise “{publishedWorkflows.find(flow => flow.code === workflowCode)?.name || 'seçilen iş akışı'}” onayını başlat.</span></div>
  </section>
}
