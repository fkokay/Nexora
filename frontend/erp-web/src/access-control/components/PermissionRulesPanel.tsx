import { Search, ShieldCheck } from 'lucide-react'
import type { PermissionDefinition, PermissionRule } from '../../erp-types'

type Props = {
  rules: PermissionRule[]
  visibleRules: PermissionRule[]
  selectedRule: PermissionRule | null
  definitions: PermissionDefinition[]
  filter: string
  setFilter: (value: string) => void
  busy: boolean
  setSelectedRuleId: (value: string) => void
  remove: (rule: PermissionRule) => void
}

export function PermissionRulesPanel({ rules, visibleRules, selectedRule, definitions, filter, setFilter, busy, setSelectedRuleId, remove }: Props) {
  return <section className="panel" style={{ marginTop: 18 }}>
    <div className="panel-heading"><div><h3>Tenant politikaları</h3><p>{rules.length} kural · rol varsayılanları dahil</p></div><label className="compact-search"><Search size={15}/><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="İzin, rol veya koşul ara"/></label></div>
    <div className="requests-list">{visibleRules.map(rule => <article className={`request-row ${selectedRule?.id === rule.id ? 'security-selected-row' : ''}`} key={rule.id} onClick={() => setSelectedRuleId(rule.id)}><div className="request-info"><b>{rule.permissionCode}</b><small>{rule.subjectType === 'Role' ? rule.subjectRole : `${rule.subjectDisplayName || rule.subjectUserId} · üye`} · {rule.effect}{rule.attributeName ? ` · ${rule.attributeName} ${rule.attributeOperator} ${rule.attributeValue}` : ''}</small></div><button className="row-action danger-action" disabled={busy} onClick={() => void remove(rule)}>Sil</button></article>)}{visibleRules.length === 0 && <div className="empty-small">Eşleşen izin politikası yok.</div>}</div>
    {selectedRule && <aside className="security-record-pane"><div className="security-record-heading"><div><span>İZİN POLİTİKASI</span><h3>{selectedRule.permissionCode}</h3><small>{selectedRule.isActive ? 'Etkin' : 'Pasif'} · {selectedRule.effect === 'Allow' ? 'İzin ver' : 'Reddet'}</small></div><ShieldCheck size={18}/></div><dl><div><dt>Açıklama</dt><dd>{definitions.find(definition => definition.code === selectedRule.permissionCode)?.description || 'İzin kataloğunda açıklama tanımlanmamış.'}</dd></div><div><dt>Hedef</dt><dd>{selectedRule.subjectType === 'Role' ? selectedRule.subjectRole : `${selectedRule.subjectDisplayName || selectedRule.subjectUserId} · üye`}</dd></div><div><dt>İşlem</dt><dd>{selectedRule.action}</dd></div><div><dt>Kaynak türü</dt><dd>{selectedRule.resourceType || 'Tüm kaynaklar'}</dd></div><div><dt>ABAC koşulu</dt><dd>{selectedRule.attributeName ? `${selectedRule.attributeName} ${selectedRule.attributeOperator} ${selectedRule.attributeValue}` : 'Koşul yok'}</dd></div><div><dt>Oluşturulma</dt><dd>{new Date(selectedRule.createdAt).toLocaleString('tr-TR')}</dd></div></dl><button type="button" className="row-action danger-action" disabled={busy} onClick={() => void remove(selectedRule)}>Seçili kuralı sil</button></aside>}
  </section>
}
