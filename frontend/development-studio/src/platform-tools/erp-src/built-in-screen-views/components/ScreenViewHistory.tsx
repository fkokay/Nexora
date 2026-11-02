import { RotateCcw } from 'lucide-react'
import type { EditorState, Revision } from '../types'

type Props = { en: boolean; busy: boolean; state: EditorState; history: Revision[]; onRefresh: () => void; onRestore: (revision: Revision) => void }

export default function ScreenViewHistory({ en, busy, state, history, onRefresh, onRestore }: Props) {
  return <section className="panel screen-view-history"><div className="screen-view-panel-head"><div><p className="eyebrow">{en ? 'REVISION HISTORY' : 'SÜRÜM GEÇMİŞİ'}</p><h2>{en ? 'Published and saved revisions' : 'Yayımlanan ve kaydedilen sürümler'}</h2></div><button className="secondary small-button" disabled={busy} onClick={onRefresh}><RotateCcw size={14}/>{en ? 'Refresh' : 'Yenile'}</button></div><div className="screen-view-revisions">{history.map(revision => <article key={revision.id}><div><b>{revision.name} · v{revision.revision}</b><small>{revision.changeKind} · {new Date(revision.createdAt).toLocaleString(en ? 'en-US' : 'tr-TR')}</small></div><button type="button" className="secondary small-button" disabled={busy || Boolean(state.draft)} onClick={() => onRestore(revision)}><RotateCcw size={14}/>{en ? 'Use as draft' : 'Taslağa al'}</button></article>)}{history.length === 0 && <p className="empty-small">{en ? 'No revisions yet.' : 'Henüz sürüm geçmişi yok.'}</p>}</div></section>
}
