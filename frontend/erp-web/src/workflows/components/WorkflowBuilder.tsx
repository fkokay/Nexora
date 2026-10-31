import { Plus, X } from 'lucide-react'
import { localizedText } from '../../locale'
import type { WorkflowDefinition, WorkflowStep } from '../types'

type Props = {
  editing: WorkflowDefinition | null
  busy: boolean
  code: string
  name: string
  description: string
  steps: WorkflowStep[]
  roles: string[]
  onCodeChange: (value: string) => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onClose: () => void
  onSave: () => void
  onAddStep: () => void
  onUpdateStep: (index: number, patch: Partial<WorkflowStep>) => void
  onRemoveStep: (index: number) => void
}

export function WorkflowBuilder({ editing, busy, code, name, description, steps, roles, onCodeChange, onNameChange, onDescriptionChange, onClose, onSave, onAddStep, onUpdateStep, onRemoveStep }: Props) {
  return <section className="workflow-builder"><div className="workflow-heading"><div><p className="eyebrow">{editing?`${editing.code} · v${editing.version}`:localizedText('TASARIMCI','BUILDER')}</p><h2>{editing?localizedText('Taslağı düzenle','Edit draft'):localizedText('Yeni akış tanımla','Define workflow')}</h2></div><div className="workflow-actions"><button className="secondary" onClick={onClose}>{localizedText('Kapat','Close')}</button><button className="primary" disabled={busy||!code.trim()||!name.trim()||!steps.length} onClick={onSave}>{localizedText('Taslağı kaydet','Save draft')}</button></div></div><div className="workflow-fields"><label>{localizedText('Akış kodu','Workflow code')}<input value={code} disabled={!!editing} onChange={e=>onCodeChange(e.target.value)} placeholder={localizedText('masraf-onayi','expense-approval')} maxLength={40}/></label><label>{localizedText('Ad','Name')}<input value={name} onChange={e=>onNameChange(e.target.value)} placeholder={localizedText('Masraf talebi onayı','Expense request approval')} maxLength={120}/></label><label className="wide">{localizedText('Açıklama','Description')}<input value={description} onChange={e=>onDescriptionChange(e.target.value)} placeholder={localizedText('Sürecin kullanım amacı','Describe the purpose of the workflow')} maxLength={500}/></label></div><div className="workflow-step-heading"><div><h3>{localizedText('Sıralı onay adımları','Sequential approval steps')}</h3><p>{localizedText('Her adım belirtilen tenant rolünden bir kişinin kararıyla ilerler.','Each step advances with a decision from a member of the specified tenant role.')}</p></div><button className="secondary" onClick={onAddStep}><Plus size={15}/> {localizedText('Adım ekle','Add step')}</button></div><div className="workflow-step-list">{steps.map((step,index)=><div className="workflow-step" key={index}><span aria-hidden="true">{String(index+1).padStart(2,'0')}</span><label>{localizedText('Adım adı','Step name')}<input value={step.name} onChange={e=>onUpdateStep(index,{name:e.target.value})}/></label><label>{localizedText('Onaylayacak rol','Approver role')}<select value={step.approverRole} onChange={e=>onUpdateStep(index,{approverRole:e.target.value})}>{roles.map(value=><option key={value}>{localizedText(value, value==='TenantAdmin'?'Tenant admin':value==='TenantDeveloper'?'Tenant developer':'Tenant user')}</option>)}</select></label><button className="workflow-remove" aria-label={localizedText(`${step.name} adımını kaldır`,`Remove step ${step.name}`)} disabled={steps.length===1} onClick={()=>onRemoveStep(index)}><X size={17}/></button></div>)}</div></section>
}
