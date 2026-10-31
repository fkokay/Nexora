import { Activity, ChevronRight } from 'lucide-react'
import type { ErpDashboardStockItem } from '../types'

type Props = { items: ErpDashboardStockItem[]; activeCount: number | null; loading: boolean; canReadInventory: boolean; money: (value: number, code?: string) => string; onNavigate: (page: string) => void }

export default function DashboardHighStockTable({ items, activeCount, loading, canReadInventory, money, onNavigate }: Props) {
  return <section className="erp-home-panel dashboard-reference-stock-table">
    <header><div><h2><Activity size={16}/> En yüksek stok değerleri</h2><p>{activeCount ?? 0} aktif stok kartı</p></div><button className="secondary compact" type="button" onClick={() => onNavigate('inventory-stock')}>Tüm stoklar <ChevronRight size={14}/></button></header>
    <div className="erp-home-table-wrap"><table className="erp-home-orders"><thead><tr><th>Stok kodu</th><th>Stok adı</th><th>Stok değeri</th><th/></tr></thead><tbody>
      {items.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{money(row.amountBase)}</td><td><ChevronRight size={14}/></td></tr>)}
      {!items.length && <tr><td colSpan={4} className="erp-home-empty">{loading ? 'Stok verileri yükleniyor…' : canReadInventory ? 'Stok kartı bulunmuyor.' : 'Görüntüleme yetkisi yok.'}</td></tr>}
    </tbody></table></div>
  </section>
}
