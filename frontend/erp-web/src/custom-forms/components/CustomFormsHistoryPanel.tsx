import { History, RotateCcw } from 'lucide-react'
import type { Form, Revision } from '../types'

type Props = { selected: Form; history: Revision[]; busy: boolean; onBack: () => void; onRestore: (revision: Revision) => void }

export function CustomFormsHistoryPanel({ selected, history, busy, onBack, onRestore }: Props) {
  return <section className="history-panel"><div className="builder-title"><div><p className="eyebrow">{selected.code}</p><h2><History size={21}/> Sürüm geçmişi</h2></div><button className="secondary" onClick={onBack}>Formlara dön</button></div>{history.length === 0 ? <p className="empty-state">Henüz değişiklik kaydı yok.</p> : history.map(revision => <article className="history-row" key={revision.id}><div><b>v{revision.version} · {revision.name}</b><small>{revision.changeKind} · {new Date(revision.createdAt).toLocaleString('tr-TR')}</small></div><button className="secondary" disabled={busy || selected.status !== 'Draft'} onClick={() => onRestore(revision)}><RotateCcw size={15}/> Bu sürümü geri yükle</button></article>)}</section>
}
