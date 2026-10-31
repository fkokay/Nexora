import { FinanceStudioGrid } from '../../FinanceStudioGrid'
import { auditGridDefaults } from '../../financeCatalog'
import type { AuditEvent } from '../types'

type Props = {
  token: string
  items: AuditEvent[]
  selectedId: number | null
  loading: boolean
  onSelect: (id: number) => void
}

export function AuditEventGrid({ token, items, selectedId, loading, onSelect }: Props) {
  return <div className="customer-table-wrap"><FinanceStudioGrid token={token} screenKey="audit-events" defaults={auditGridDefaults}>
    <table className="customer-table"><thead><tr>{auditGridDefaults.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan={auditGridDefaults.length} className="table-empty">Kayıtlar yükleniyor…</td></tr> : items.length === 0 ? <tr><td colSpan={auditGridDefaults.length} className="table-empty">Filtrelerle eşleşen işlem kaydı yok.</td></tr> : items.map(item => <tr key={item.id} className={selectedId === item.id ? 'erp-selected-row' : ''} onClick={() => onSelect(item.id)} aria-selected={selectedId === item.id}>
        <td>{new Date(item.occurredAt).toLocaleString('tr-TR')}</td><td>{item.userDisplayName || 'Sistem'}</td><td>{item.userId || 'Kullanıcı bilgisi yok'}</td><td><span className="customer-code">{item.action}</span></td><td>{item.resource || '—'}</td><td>{item.id}</td>
      </tr>)}
    </tbody></table>
  </FinanceStudioGrid></div>
}
