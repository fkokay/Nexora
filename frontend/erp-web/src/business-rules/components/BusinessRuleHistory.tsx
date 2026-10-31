import { Check, ChevronRight, Plus } from 'lucide-react'
import type { Evaluation, Rule } from '../types'

type Props = { busy: boolean; evaluations: Evaluation[]; archived: Rule[]; totalRuleCount: number; onPost: (url: string) => void }

export function BusinessRuleHistory({ busy, evaluations, archived, totalRuleCount, onPost }: Props) {
  return <>
    <section className="rule-panel rule-evaluations"><div className="rule-panel-heading"><div><p className="eyebrow">ÇALIŞMA GEÇMİŞİ</p><h2>Son kural değerlendirmeleri</h2></div><span>{evaluations.length}</span></div>
      {evaluations.length === 0 ? <p className="rules-empty">Henüz desteklenen bir ERP olayı değerlendirilmedi.</p> : <div className="evaluation-list">{evaluations.map(item => <article className="evaluation-row" key={item.id}><span className={`evaluation-icon ${item.matched ? 'matched' : ''}`}>{item.matched ? <Check size={15}/> : <ChevronRight size={15}/>}</span><div><b>{item.matched ? 'Koşullar eşleşti' : 'Koşullar eşleşmedi'}</b><small>{item.details} · {new Date(item.createdAt).toLocaleString('tr-TR')}</small></div><code>{item.eventId.slice(0, 8)}</code></article>)}</div>}
    </section>
    <section className="rule-panel"><div className="rule-panel-heading"><div><p className="eyebrow">VERSİYON YÖNETİMİ</p><h2>Taslaklar ve geçmiş sürümler</h2></div><span>{totalRuleCount}</span></div>
      {archived.length === 0 ? <p className="rules-empty">Arşivlenmiş eski sürüm yok.</p> : archived.map(rule => <article className="rule-draft archived-rule" key={rule.id}><div><b>{rule.name}</b><small>{rule.code} · Arşivlendi v{rule.version}</small></div><button className="secondary" disabled={busy} onClick={() => onPost(`/api/business-rules/${rule.id}/draft`)}><Plus size={14}/> Yeni taslak</button></article>)}
    </section>
  </>
}
