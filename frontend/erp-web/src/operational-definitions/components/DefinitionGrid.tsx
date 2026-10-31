import type { Definition, Translate } from '../types'

type Props = {
  rows: Definition[]
  loading: boolean
  busy: boolean
  tx: Translate
  kindName: (kind: Definition['kind']) => string
  onEdit: (row: Definition) => void
  onToggle: (row: Definition) => void
}

export function DefinitionGrid({ rows, loading, busy, tx, kindName, onEdit, onToggle }: Props) {
  return <div className="ledger-list"><table className="customer-table"><thead><tr><th>{tx('Tür', 'Type')}</th><th>{tx('Kod', 'Code')}</th><th>{tx('Ad', 'Name')}</th><th>{tx('Durum', 'Status')}</th><th>{tx('İşlemler', 'Actions')}</th></tr></thead><tbody>
    {rows.map(row => <tr key={row.id}><td>{kindName(row.kind)}</td><td><b>{row.code}</b></td><td>{row.name}</td><td>{row.isActive ? tx('Etkin', 'Active') : tx('Devre dışı', 'Inactive')}</td><td><button type="button" className="row-action" disabled={busy} onClick={() => onEdit(row)}>{tx('Düzenle', 'Edit')}</button><button type="button" className="row-action" disabled={busy} onClick={() => onToggle(row)}>{row.isActive ? tx('Devre dışı bırak', 'Deactivate') : tx('Etkinleştir', 'Activate')}</button></td></tr>)}
    {!loading && rows.length === 0 && <tr><td colSpan={5} className="table-empty">{tx('Henüz tanım yok.', 'No definitions yet.')}</td></tr>}
  </tbody></table></div>
}
