import type { ReactNode } from 'react'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { BuiltInScreenLayoutField, InventoryBalance } from '../../erp-types'

type Props = {
  fields: BuiltInScreenLayoutField[]
  balances: InventoryBalance[]
  pageBalances: InventoryBalance[]
  loading: boolean
  balancesLoading: boolean
  warehouseSelected: boolean
  belowMinimumOnly: boolean
  renderCell: (field: BuiltInScreenLayoutField, item: InventoryBalance) => ReactNode
  pagination: ReactNode
}

export function InventoryStockGrid({ fields, balances, pageBalances, loading, balancesLoading, warehouseSelected, belowMinimumOnly, renderCell, pagination }: Props) {
  return <><div className="customer-table-wrap"><table className="customer-table inventory-table"><thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>
    {loading || balancesLoading ? <tr><td colSpan={fields.length} className="table-empty" role="status">{balancesLoading ? 'Depo stok bakiyeleri yükleniyor…' : 'Stok kartları yükleniyor…'}</td></tr> : !warehouseSelected ? <tr><td colSpan={fields.length} className="table-empty">Stok bakiyelerini görmek için bir depo oluşturun veya seçin.</td></tr> : balances.length === 0 ? <tr><td colSpan={fields.length} className="table-empty">{belowMinimumOnly ? 'Seçili depoda minimum stok altına düşen ürün yok.' : 'Henüz aktif stok kartı yok.'}</td></tr> : pageBalances.map(item => <tr key={item.stockItemId}>{fields.map(field => <td key={field.key}>{renderCell(field, item)}</td>)}</tr>)}
  </tbody></table></div>{pagination}</>
}
