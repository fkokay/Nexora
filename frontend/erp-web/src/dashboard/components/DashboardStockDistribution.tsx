import { ChevronRight } from 'lucide-react'
import type { ErpDashboardStockItem } from '../types'

type Props = { items: ErpDashboardStockItem[]; totalValue: number | null; activeCount: number | null; loading: boolean; canReadInventory: boolean; money: (value: number, code?: string) => string; onNavigate: (page: string) => void }
const stockColors = ['#1E3A8A', '#F6C23E', '#16A36A', '#7895B8', '#A8B5C6']

export default function DashboardStockDistribution({ items, totalValue, activeCount, loading, canReadInventory, money, onNavigate }: Props) {
  const stockTotal = items.reduce((total, row) => total + Math.max(0, row.amountBase), 0)
  const background = stockTotal ? `conic-gradient(${items.map((_, index) => `${stockColors[index % stockColors.length]} ${items.slice(0, index).reduce((sum, item) => sum + Math.max(0, item.amountBase), 0) / stockTotal * 100}% ${items.slice(0, index + 1).reduce((sum, item) => sum + Math.max(0, item.amountBase), 0) / stockTotal * 100}%`).join(',')})` : undefined
  return <section className="erp-home-panel dashboard-reference-stock">
    <header><div><h2>Stok dağılımı</h2><p>En yüksek stok değerleri</p></div><button className="secondary compact" type="button" onClick={() => onNavigate('inventory-stock')}>Stok kartları <ChevronRight size={14}/></button></header>
    <div className="dashboard-stock-layout">
      <div className="dashboard-stock-donut" style={{ background }}><span><b>{loading ? '…' : canReadInventory ? (activeCount ?? 0).toLocaleString('tr-TR') : '—'}</b><small>Stok kartı</small></span></div>
      <div className="dashboard-stock-legend">{items.map((row, index) => <div key={row.id}><i style={{ background: stockColors[index % stockColors.length] }}/><span>{row.name}</span><b>{stockTotal ? Math.round(Math.max(0, row.amountBase) / stockTotal * 100) : 0}%</b></div>)}{!items.length && <small>{loading ? 'Stok verileri yükleniyor…' : canReadInventory ? 'Stok değeri bulunamadı.' : 'Görüntüleme yetkisi yok.'}</small>}</div>
    </div>
    <div className="dashboard-stock-total"><span>Toplam stok değeri</span><b>{loading ? '…' : canReadInventory ? money(totalValue ?? 0) : '—'}</b></div>
  </section>
}
