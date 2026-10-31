import type { ReactNode } from 'react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import type { BuiltInScreenLayoutField, CustomerItem } from '../../erp-types'

type Props = {
  items: CustomerItem[]
  fields: BuiltInScreenLayoutField[]
  groups: { label: string; count: number }[]
  total: number
  page: number
  loading: boolean
  filter: string
  selectedCustomerId: string | null
  onRefresh: () => void
  onPageChange: (page: number) => void
  onSelect: (item: CustomerItem) => void
  renderCell: (field: BuiltInScreenLayoutField, item: CustomerItem) => ReactNode
}

export function CustomerGrid({ items, fields, groups, total, page, loading, filter, selectedCustomerId, onRefresh, onPageChange, onSelect, renderCell }: Props) {
  return <section className="erp-list-pane">
    <div className="erp-pane-heading"><div><b>Cariler</b><small>{total} kayıt · sayfa {page}</small></div><button className="secondary small-button" onClick={onRefresh} disabled={loading}>Yenile</button></div>
    <div className="customer-table-wrap"><AdvancedDataGrid className="customer-table customer-directory-grid" gridId="customers-directory" initialColumnWidths={fields.map(field => field.width || 120)} minimumColumnWidths={fields.map(field => field.key === 'actions' ? 82 : field.key === 'taxNumber' ? 105 : field.key === 'name' ? 125 : field.key === 'groupName' ? 115 : field.key === 'code' ? 90 : field.key === 'type' ? 80 : field.key === 'currencyCode' ? 68 : field.key === 'paymentTermDays' ? 76 : field.key === 'status' ? 72 : 80)} externalPagination hideSearch enableRowSelection={false}>
      <thead>{groups.length > 0 && <tr className="screen-view-group-row">{groups.map((group, index) => <th key={`${group.label}-${index}`} colSpan={group.count}>{group.label}</th>)}</tr>}<tr>{fields.map(field => <th key={field.key} style={field.width ? { width: `${field.width}px`, minWidth: `${field.width}px` } : undefined}>{field.label}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={fields.length} className="table-empty">Kayıtlar yükleniyor…</td></tr> : items.length === 0 ? <tr><td colSpan={fields.length} className="table-empty">{filter ? 'Aramanızla eşleşen cari kartı yok.' : 'Henüz cari kartı eklenmemiş.'}</td></tr> : items.map(item => <tr key={item.id} className={selectedCustomerId === item.id ? 'erp-selected-row' : ''} onClick={event => { if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) return; onSelect(item) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item) } }} tabIndex={0} aria-haspopup="dialog" aria-selected={selectedCustomerId === item.id}>{fields.map(field => <td key={field.key} className={`customer-directory-cell-${field.key}`} style={field.width ? { width: `${field.width}px`, minWidth: `${field.width}px` } : undefined}>{renderCell(field, item)}</td>)}</tr>)}</tbody>
    </AdvancedDataGrid></div>
    <div className="table-pagination"><span>{total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} / ${total} kayıt` : '0 kayıt'}</span><div><button className="secondary small-button" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>Önceki</button><button className="secondary small-button" disabled={page * 25 >= total || loading} onClick={() => onPageChange(page + 1)}>Sonraki</button></div></div>
  </section>
}
