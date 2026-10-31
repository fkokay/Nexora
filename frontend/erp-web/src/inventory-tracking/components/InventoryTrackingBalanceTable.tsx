import type { MouseEvent, ReactNode } from 'react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { Balance, ScreenField } from '../types'

type Props = {
  fields: ScreenField[]
  rows: Balance[]
  totalCount: number
  loading: boolean
  error: string
  hasFilters: boolean
  onClick: (event: MouseEvent<HTMLDivElement>) => void
  renderField: (row: Balance, field: ScreenField) => ReactNode
}

export default function InventoryTrackingBalanceTable({ fields, rows, totalCount, loading, error, hasFilters, onClick, renderField }: Props) {
  return <section className="inventory-list-pane" aria-label="Lot ve seri bakiye listesi">
    <div className="inventory-list-title"><div><b>İzlenen stoklar</b><small>{totalCount} kayıt · ayrıntı için satır seçin</small></div></div>
    <div className="customer-table-wrap inventory-tracking-table-wrap" role="region" aria-label="Lot ve seri bakiyeleri tablosu" tabIndex={0} onClick={onClick}>
      <AdvancedDataGrid hideSearch externalPagination enableRowSelection={false} className="customer-table quote-table inventory-tracking-table">
        <caption className="inventory-tracking-sr-only">Lot ve seri bazında stok bakiyesi, depo, son kullanma ve son hareket bilgileri</caption>
        <thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key} scope="col">{field.label}</th>)}</tr></thead>
        <tbody>
          {loading
            ? <tr><td colSpan={Math.max(1, fields.length)} className="table-empty" role="status">İz kayıtları yükleniyor…</td></tr>
            : error
              ? <tr><td colSpan={Math.max(1, fields.length)} className="table-empty">Sonuçlar gösterilemiyor. Yeniden denemek için üstteki düğmeyi kullanın.</td></tr>
              : rows.length === 0
                ? <tr><td colSpan={Math.max(1, fields.length)} className="table-empty">{hasFilters ? 'Bu filtrelerle aktif lot veya seri bakiyesi bulunamadı.' : 'Aktif lot veya seri bakiyesi bulunamadı.'}</td></tr>
                : rows.map(row => <tr key={`${row.stockItemId}:${row.warehouseId}:${row.trackingCode}:${row.expiryDate ?? ''}`}>
                  {fields.map(field => <td key={field.key} className={field.key === 'quantityOnHand' ? 'inventory-tracking-quantity' : undefined}>{renderField(row, field)}</td>)}
                </tr>)}
        </tbody>
      </AdvancedDataGrid>
    </div>
  </section>
}
