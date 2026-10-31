import { ClipboardCheck, Plus } from 'lucide-react'
import { localizedText } from '../../locale'

type Props = { admin: boolean; onNew: () => void }

export function WorkflowPageHeader({ admin, onNew }: Props) {
  return <header className="workflow-hero screen-page-header"><div className="workflow-hero-icon"><ClipboardCheck size={23}/></div><div><p className="eyebrow">{localizedText('SÜREÇ MERKEZİ · TENANT İŞ AKIŞLARI','PROCESS CENTER · TENANT WORKFLOWS')}</p><h1>{localizedText('İş akışları','Workflows')}</h1><p>{localizedText('Onay kurallarını, bekleyen kararları ve tamamlanan süreçleri buradan takip edin.','Track approval rules, pending decisions, and completed workflows here.')}</p></div>{admin&&<button className="primary" onClick={onNew}><Plus size={17}/> {localizedText('Yeni iş akışı','New workflow')}</button>}</header>
}
