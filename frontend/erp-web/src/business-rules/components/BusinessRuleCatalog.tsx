import { Check, RotateCcw, Zap } from 'lucide-react'
import type { Rule, TriggerField, Workflow } from '../types'

type Props = {
  admin: boolean
  busy: boolean
  published: Rule[]
  drafts: Rule[]
  selectedRule: Rule | null
  fields: TriggerField[]
  publishedWorkflows: Workflow[]
  triggerLabel: (trigger: string) => string
  onSelect: (id: string) => void
  onEdit: (rule: Rule) => void
  onPost: (url: string) => void
}

export function BusinessRuleCatalog({ admin, busy, published, drafts, selectedRule, fields, publishedWorkflows, triggerLabel, onSelect, onEdit, onPost }: Props) {
  return <>
    <div className="rule-columns"><section className="rule-panel"><div className="rule-panel-heading"><div><p className="eyebrow">AKTİF KURAL</p><h2>Yayımlanmış olay kuralları</h2></div><span>{published.length}</span></div>
      {published.length === 0 ? <p className="rules-empty">Yayımlanmış kural yok. Olay ve onay akışı seçerek bir kural oluşturun.</p> : published.map(rule => <article className={`rule-card active-rule ${selectedRule?.id === rule.id ? 'is-selected' : ''}`} key={rule.id}>
        <div className="rule-card-top"><div className="rules-badge"><Zap size={16}/></div><span className="active-pill"><i/>Yayımlandı · v{rule.version}</span></div><h3>{rule.name}</h3><p>{triggerLabel(rule.trigger)} · {rule.description || 'Açıklama eklenmemiş.'}</p>
        <button className="rule-select" type="button" aria-pressed={selectedRule?.id === rule.id} onClick={() => onSelect(rule.id)}>Ayrıntıyı aç</button>
        <div className="rule-readable"><b>EĞER</b>{rule.conditions.map((condition, index) => <span key={index}>{index ? 'VE ' : ''}{fields.find(field => field.code === condition.field)?.label ?? condition.field} {condition.operator} “{condition.value}”</span>)}<b>İSE</b><span>{publishedWorkflows.find(flow => flow.code === rule.workflowCode)?.name ?? rule.workflowCode} akışını başlat</span></div>
        {admin && <div className="rule-card-actions"><button className="secondary" onClick={() => onPost(`/api/business-rules/${rule.id}/draft`)}><RotateCcw size={14}/> Yeni sürüm düzenle</button></div>}
      </article>)}
    </section>
    {admin && <section className="rule-panel"><div className="rule-panel-heading"><div><p className="eyebrow">KURAL TASLAKLARI</p><h2>Yayımlamaya hazır</h2></div><span>{drafts.length}</span></div>
      {drafts.length === 0 ? <p className="rules-empty">Henüz taslak kural yok.</p> : <div className="rule-draft-list">{drafts.map(rule => <article className="rule-draft" key={rule.id}><div><b>{rule.name}</b><small>{triggerLabel(rule.trigger)} · {rule.code} · v{rule.version} · {rule.conditions.length} koşul</small></div><button className="secondary" onClick={() => onEdit(rule)}>Düzenle</button><button className="primary" disabled={busy} onClick={() => onPost(`/api/business-rules/${rule.id}/publish`)}><Check size={14}/> Yayımla</button></article>)}</div>}
    </section>}
    </div>
    {admin && selectedRule && <aside className="rule-inspector" aria-label="Seçili kural ayrıntısı"><div><p className="eyebrow">SEÇİLİ KURAL · {selectedRule.status === 'Published' ? 'YAYIMLANDI' : 'TASLAK'}</p><h2>{selectedRule.name}</h2><p>{selectedRule.description || 'Açıklama eklenmemiş.'}</p></div>
      <dl><div><dt>Kural kodu</dt><dd><code>{selectedRule.code}</code> · v{selectedRule.version}</dd></div><div><dt>Tetikleyici</dt><dd>{triggerLabel(selectedRule.trigger)}</dd></div><div><dt>Onay akışı</dt><dd>{publishedWorkflows.find(flow => flow.code === selectedRule.workflowCode)?.name ?? selectedRule.workflowCode}</dd></div><div><dt>Koşul sayısı</dt><dd>{selectedRule.conditions.length}</dd></div></dl>
      <div className="rule-inspector-conditions"><b>Koşul özeti</b>{selectedRule.conditions.map((condition, index) => <span key={`${condition.field}-${index}`}>{fields.find(field => field.code === condition.field)?.label ?? condition.field} {condition.operator} {condition.value && `“${condition.value}”`}</span>)}</div>
      {selectedRule.status === 'Draft' && <button className="secondary" onClick={() => onEdit(selectedRule)}>Taslağı düzenle</button>}
    </aside>}
  </>
}
