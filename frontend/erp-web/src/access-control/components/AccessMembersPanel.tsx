import { Plus, Search, Trash2, Users } from 'lucide-react'
import type { FormEvent } from 'react'
import type { PermissionMember } from '../../erp-types'

type Props = {
  members: PermissionMember[]
  selectedMember: PermissionMember | null
  candidate: PermissionMember | null
  candidateEmail: string
  setCandidateEmail: (value: string) => void
  memberRole: string
  setMemberRole: (value: string) => void
  newMemberEmail: string
  setNewMemberEmail: (value: string) => void
  newMemberName: string
  setNewMemberName: (value: string) => void
  temporaryPassword: string
  setTemporaryPassword: (value: string) => void
  busy: boolean
  findMember: (event: FormEvent<HTMLFormElement>) => void
  createMemberAccount: (event: FormEvent<HTMLFormElement>) => void
  addMember: () => void
  changeMemberRole: (member: PermissionMember, role: string) => void
  removeMember: (member: PermissionMember) => void
  selectMember: (userId: string) => void
}

export function AccessMembersPanel(props: Props) {
  const { members, selectedMember, candidate, candidateEmail, setCandidateEmail, memberRole, setMemberRole, newMemberEmail, setNewMemberEmail, newMemberName, setNewMemberName, temporaryPassword, setTemporaryPassword, busy, findMember, createMemberAccount, addMember, changeMemberRole, removeMember, selectMember } = props

  return <section className="panel access-members-panel">
    <div className="panel-heading"><div><h3>Firma üyeleri</h3><p>{members.length} üye · lisans kullanıcı sınırı ekleme sırasında doğrulanır. Son firma yöneticisi kaldırılamaz veya düşürülemez.</p></div><Users size={20}/></div>
    <form className="access-member-search" onSubmit={event => void findMember(event)}>
      <label>Mevcut platform kullanıcısını e-posta ile bul<input type="email" value={candidateEmail} onChange={event => setCandidateEmail(event.target.value)} maxLength={254} required placeholder="kullanici@firma.com" autoComplete="off"/></label>
      <button className="secondary" disabled={busy || !candidateEmail.trim()}><Search size={15}/>{busy ? 'Aranıyor…' : 'Kullanıcıyı bul'}</button>
    </form>
    {candidate && <div className="access-member-candidate"><div><b>{candidate.displayName}</b><small>{candidate.email}</small></div><label>Firma rolü<select value={memberRole} onChange={event => setMemberRole(event.target.value)}><option value="TenantUser">TenantUser</option><option value="TenantAdmin">TenantAdmin</option></select></label><button className="primary" disabled={busy} onClick={() => void addMember()}><Plus size={15}/>Üyeliğe ekle</button></div>}
    <form className="access-member-create" onSubmit={event => void createMemberAccount(event)}>
      <div className="access-member-form-heading"><h4>Yeni kullanıcı oluştur</h4><p>Platform hesabı ve firma üyeliğini birlikte oluşturun.</p></div>
      <label>Yeni kullanıcının e-postası<input type="email" value={newMemberEmail} onChange={event => setNewMemberEmail(event.target.value)} maxLength={254} required placeholder="kullanici@firma.com" autoComplete="off"/></label>
      <label>Yeni kullanıcı adı<input value={newMemberName} onChange={event => setNewMemberName(event.target.value)} maxLength={160} required placeholder="Ad Soyad" autoComplete="off"/></label>
      <label>Geçici parola<input type="password" value={temporaryPassword} onChange={event => setTemporaryPassword(event.target.value)} minLength={12} maxLength={256} required autoComplete="new-password" placeholder="En az 12 karakter"/></label>
      <label>Firma rolü<select value={memberRole} onChange={event => setMemberRole(event.target.value)}><option value="TenantUser">TenantUser</option><option value="TenantAdmin">TenantAdmin</option></select></label>
      <div className="access-member-form-footer"><small>Parolayı kullanıcıya güvenli bir kanaldan iletin.</small><button className="primary" disabled={busy || !newMemberEmail.trim() || !newMemberName.trim() || temporaryPassword.length < 12}><Plus size={15}/>{busy ? 'Oluşturuluyor…' : 'Hesap ve üyelik oluştur'}</button></div>
    </form>
    <div className="access-members-workspace">
      <div className="access-member-list">{members.map(member => <article className={`access-member-row ${selectedMember?.userId === member.userId ? 'security-selected-row' : ''}`} key={member.userId} onClick={() => selectMember(member.userId)}>
        <div className="access-member-identity"><span className="member-avatar"><Users size={15}/></span><span><b>{member.displayName}</b><small>{member.email}</small></span></div>
        <label className="access-member-role">Rol<select aria-label={`${member.displayName} rolü`} value={member.role} disabled={busy} onChange={event => void changeMemberRole(member, event.target.value)}><option value="TenantUser">TenantUser</option><option value="TenantAdmin">TenantAdmin</option></select></label>
        <button className="row-action danger-action" disabled={busy} onClick={() => void removeMember(member)}><Trash2 size={14}/>Firmadan çıkar</button>
      </article>)}{members.length === 0 && <div className="empty-small">Bu firmada üye yok.</div>}</div>
      {selectedMember && <aside className="security-record-pane"><div className="security-record-heading"><div><span>FİRMA ÜYESİ</span><h3>{selectedMember.displayName}</h3><small>{selectedMember.email}</small></div><Users size={18}/></div><dl><div><dt>Firma rolü</dt><dd>{selectedMember.role}</dd></div><div><dt>Platform kullanıcısı</dt><dd>{selectedMember.userId}</dd></div></dl><p>Rol değişikliği, üye satırındaki rol alanından yapılır. Firma yöneticisi koruması sunucu tarafından uygulanır.</p></aside>}
    </div>
  </section>
}
