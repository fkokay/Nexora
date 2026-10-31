import type { FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { PermissionDefinition, PermissionMember } from '../../erp-types'

type Props = {
  attributes: string[]
  definitions: PermissionDefinition[]
  members: PermissionMember[]
  selectableMembers: PermissionMember[]
  roles: string[]
  permissionCode: string
  setPermissionCode: (value: string) => void
  subjectType: 'Role' | 'User'
  setSubjectType: (value: 'Role' | 'User') => void
  subjectRole: string
  setSubjectRole: (value: string) => void
  subjectUserId: string
  setSubjectUserId: (value: string) => void
  effect: 'Allow' | 'Deny'
  setEffect: (value: 'Allow' | 'Deny') => void
  attributeName: string
  setAttributeName: (value: string) => void
  operator: 'Equals' | 'NotEquals' | 'In'
  setOperator: (value: 'Equals' | 'NotEquals' | 'In') => void
  attributeValue: string
  setAttributeValue: (value: string) => void
  busy: boolean
  save: (event: FormEvent<HTMLFormElement>) => void
}

export function PermissionRuleForm({ attributes, definitions, members, selectableMembers, roles, permissionCode, setPermissionCode, subjectType, setSubjectType, subjectRole, setSubjectRole, subjectUserId, setSubjectUserId, effect, setEffect, attributeName, setAttributeName, operator, setOperator, attributeValue, setAttributeValue, busy, save }: Props) {
  return <section className="panel">
    <div className="panel-heading"><div><h3>Politika oluştur</h3><p>TenantAdmin yönetim yetkisi korunur. Eşleşen bir Deny, Allow sonucunu geçersiz kılar.</p></div><ShieldCheck size={20}/></div>
    <form onSubmit={event => void save(event)}>
      <div className="form-two"><label>Hedef türü<select value={subjectType} onChange={event => setSubjectType(event.target.value as 'Role' | 'User')}><option value="Role">Rol</option><option value="User">Üye</option></select></label>{subjectType === 'Role' ? <label>Tenant rolü<select value={roles.includes(subjectRole) ? subjectRole : 'TenantUser'} onChange={event => setSubjectRole(event.target.value)} required>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label> : <label>Tenant üyesi<select value={selectableMembers.some(member => member.userId === subjectUserId) ? subjectUserId : ''} onChange={event => setSubjectUserId(event.target.value)} required disabled={selectableMembers.length === 0}>{selectableMembers.length === 0 && <option value="">Önce uygun bir firma üyesi ekleyin</option>}{selectableMembers.map(member => <option key={member.userId} value={member.userId}>{member.displayName} · {member.email} · {member.role}</option>)}</select></label>}</div>
      <div className="form-two"><label>İzin<select value={permissionCode} onChange={event => { const next = event.target.value; setPermissionCode(next); if (definitions.find(definition => definition.code === next)?.resourceType !== 'erp.payroll-compensation') { setSubjectRole('TenantUser'); if (members.find(member => member.userId === subjectUserId)?.role === 'TenantAdmin') setSubjectUserId('') } }} required>{definitions.map(definition => <option key={definition.code} value={definition.code}>{definition.code} · {definition.description}</option>)}</select></label><label>Karar<select value={effect} onChange={event => setEffect(event.target.value as 'Allow' | 'Deny')}><option value="Allow">Allow · izin ver</option><option value="Deny">Deny · reddet</option></select></label></div>
      <div className="form-two"><label>ABAC attribute <span className="optional-label">İsteğe bağlı</span><select value={attributeName} onChange={event => setAttributeName(event.target.value)}><option value="">Koşul yok</option>{attributes.map(attribute => <option key={attribute} value={attribute}>{attribute}</option>)}</select>{attributeName === 'resource.status' && <small>Durum koşulu tekil kayıtlarda ve desteklenen satış/alış listelerinde filtrelenir.</small>}{['resource.customerId', 'resource.supplierId', 'resource.ownerUserId'].includes(attributeName) && <small>Bu nitelik tekil kayıtlarda ve ilgili satış/alış listelerinde satır bazında filtrelenir.</small>}</label>{attributeName && <><label>Operatör<select value={operator} onChange={event => setOperator(event.target.value as 'Equals' | 'NotEquals' | 'In')}><option value="Equals">Equals</option><option value="NotEquals">NotEquals</option><option value="In">In · virgülle ayır</option></select></label><label>Attribute değeri<input value={attributeValue} onChange={event => setAttributeValue(event.target.value)} required maxLength={500} placeholder="Örn. 8c63…"/></label></>}</div>
      <div className="modal-foot"><span>Koşulsuz kural, seçilen izin için tüm eşleşen kaynaklara uygulanır.</span><button className="primary" disabled={busy || definitions.length === 0 || !permissionCode || (subjectType === 'User' && !subjectUserId)}>{busy ? 'Kaydediliyor…' : 'Politikayı kaydet'}</button></div>
    </form>
  </section>
}
