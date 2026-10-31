import type { ReactNode } from 'react'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { BuiltInScreenLayoutField } from '../../erp-types'

type SalesDocumentGridProps<T extends { id: string }> = {
  fields: BuiltInScreenLayoutField[]
  items: T[]
  selectedId: string | null
  loading: boolean
  loadingMessage: string
  emptyMessage: string
  search: string
  searchEmptyMessage: string
  onSelect: (id: string) => void
  renderCell: (field: BuiltInScreenLayoutField, item: T) => ReactNode
}

export default function SalesDocumentGrid<T extends { id: string }>({
  fields,
  items,
  selectedId,
  loading,
  loadingMessage,
  emptyMessage,
  search,
  searchEmptyMessage,
  onSelect,
  renderCell,
}: SalesDocumentGridProps<T>) {
  const noRowsMessage = search ? searchEmptyMessage : emptyMessage

  return <div className="customer-table-wrap">
    <table className="customer-table quote-table">
      <thead>
        <ScreenViewGroupHeader fields={fields}/>
        <tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr>
      </thead>
      <tbody>
        {loading
          ? <tr><td colSpan={fields.length} className="table-empty">{loadingMessage}</td></tr>
          : items.length === 0
            ? <tr><td colSpan={fields.length} className="table-empty">{noRowsMessage}</td></tr>
            : items.map(item => <tr
              key={item.id}
              className={selectedId === item.id ? 'erp-selected-row' : ''}
              onClick={() => onSelect(item.id)}
              aria-selected={selectedId === item.id}
            >
              {fields.map(field => <td key={field.key}>{renderCell(field, item)}</td>)}
            </tr>)}
      </tbody>
    </table>
  </div>
}
