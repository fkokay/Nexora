import { FileText } from 'lucide-react'
import type { AuditEvent } from '../types'

export function AuditEventDetail({ item }: { item: AuditEvent }) {
  return <aside className="security-record-pane audit-detail-pane">
    <div className="security-record-heading"><div><span>DENETİM OLAYI</span><h3>{item.action}</h3><small>{new Date(item.occurredAt).toLocaleString('tr-TR')}</small></div><FileText size={18}/></div>
    <dl><div><dt>Kullanıcı</dt><dd>{item.userDisplayName || 'Sistem'}</dd></div><div><dt>Kullanıcı kimliği</dt><dd>{item.userId || 'Sistem olayı'}</dd></div><div><dt>Kaynak</dt><dd>{item.resource || 'Belirtilmemiş'}</dd></div><div><dt>Olay numarası</dt><dd>{item.id}</dd></div></dl>
    <p>Denetim kayıtları salt okunur ve firma kapsamındadır.</p>
  </aside>
}
