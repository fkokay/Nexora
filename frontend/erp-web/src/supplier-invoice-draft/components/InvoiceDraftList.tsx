import AdvancedDataGrid from '../../AdvancedDataGrid'
import { RotateCw } from 'lucide-react'
import type { DraftScreenField, DraftSummary, DraftListProps } from '../types'

export function InvoiceDraftList({ drafts, fields, loading, busy, onRefresh, onEdit, onPost }: DraftListProps) {
  const visibleFields = visibleDraftFields(fields)
  return <section className="sid-card sid-list-card"><div className="sid-card-heading"><div><h2>Bağımsız tedarikçi faturaları</h2><p>Taslak kayıtları düzenleyebilir, hesap eşleştirmeleri tamamlandıktan sonra muhasebeleştirebilirsiniz.</p></div><button type="button" className="sid-secondary" onClick={onRefresh} disabled={loading}><RotateCw size={15}/> Yenile</button></div>
    <div className="sid-table-wrap"><AdvancedDataGrid><thead>{draftFieldGroups(fields).map((group, index) => <tr className="sid-group-row" key={`${group.label}-${index}`}><th colSpan={group.count}>{group.label}</th></tr>)}<tr>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={visibleFields.length} className="sid-empty">Faturalar yükleniyor…</td></tr> : drafts.length === 0 ? <tr><td colSpan={visibleFields.length} className="sid-empty">Henüz bağımsız fatura kaydı yok.</td></tr> : drafts.map(item => <tr key={item.id}>{visibleFields.map(field => <td key={field.key}>{draftFieldValue(item, field.key, () => onEdit(item.id), () => onPost(item), busy)}</td>)}</tr>)}</tbody></AdvancedDataGrid></div>
  </section>
}

function visibleDraftFields(fields: DraftScreenField[]) { return fields.filter(field => field.visible).sort((a, b) => a.position - b.position) }

function draftFieldGroups(fields: DraftScreenField[]) {
  const visible = visibleDraftFields(fields)
  if (!visible.some(field => field.section?.trim())) return []
  return visible.reduce<{ label: string; count: number }[]>((groups, field) => {
    const label = field.section?.trim() || 'Belge'
    const current = groups[groups.length - 1]
    if (current?.label === label) current.count++
    else groups.push({ label, count: 1 })
    return groups
  }, [])
}

function draftFieldValue(item: DraftSummary, key: string, edit: () => void, post: () => void, busy: boolean) {
  switch (key) {
    case 'invoiceNumber': return <b>{item.invoiceNumber}</b>
    case 'supplierName': return item.supplierName
    case 'invoiceDate': return item.invoiceDate
    case 'dueDate': return item.dueDate || '—'
    case 'currencyCode': return item.currencyCode
    case 'grandTotal': return <>{item.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {item.currencyCode}</>
    case 'lineCount': return item.lineCount
    case 'createdAt': return new Date(item.createdAt).toLocaleString('tr-TR')
    case 'status': return <span className={`sid-status${item.status === 'Posted' ? ' sid-status-posted' : ''}`}>{item.status === 'Posted' ? 'Muhasebeleştirildi' : 'Taslak'}</span>
    case 'actions': return <div className="sid-row-actions">{item.status === 'Draft' && <><button type="button" className="sid-secondary" onClick={edit} disabled={busy}>Düzenle</button><button type="button" className="sid-primary sid-post-button" onClick={post} disabled={busy}>Muhasebeleştir</button></>}{item.status === 'Posted' && <span>Deftere aktarıldı</span>}</div>
    default: return '—'
  }
}
