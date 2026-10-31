import type { ReactNode } from 'react'
import { Banknote } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { Item, ScreenField } from '../paymentInstrumentTypes'

type Props = { fields: ScreenField[]; items: Item[]; loading: boolean; renderCell: (field: ScreenField, item: Item) => ReactNode }

export function PaymentInstrumentGrid({ fields, items, loading, renderCell }: Props) {
  if (loading) return <div className="payment-instrument-empty">Kayıtlar yükleniyor…</div>
  if (items.length === 0) return <div className="payment-instrument-empty"><Banknote size={20}/><b>Gösterilecek kayıt yok</b><span>Filtreleri değiştirebilir veya yeni çek/senet ekleyebilirsiniz.</span></div>
  return <div className="payment-instrument-table-wrap"><AdvancedDataGrid hideSearch externalPagination enableRowSelection={false} initialColumnWidths={[210,150,85,95,220,180,125,135,85,130,360]} minimumColumnWidths={[180,120,75,85,160,140,110,110,75,110,330]} className="payment-instrument-table">
    <thead><ScreenViewGroupHeader fields={fields}/><tr>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead>
    <tbody>{items.map(item => <tr key={item.id}>{fields.map(field => <td key={field.key}>{renderCell(field, item)}</td>)}</tr>)}</tbody>
  </AdvancedDataGrid></div>
}
