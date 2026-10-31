import { ChevronRight, ShoppingCart } from 'lucide-react'
import type { ErpDashboardRecentOrder } from '../types'

type Props = { rows: ErpDashboardRecentOrder[]; loading: boolean; canReadSalesOrders: boolean; money: (value: number, code?: string) => string; onNavigate: (page: string) => void }

export default function DashboardRecentOrders({ rows, loading, canReadSalesOrders, money, onNavigate }: Props) {
  return <section className="erp-home-panel dashboard-reference-orders">
    <header><div><h2><ShoppingCart size={16}/> Son satış siparişleri</h2><p>Açık siparişler ve son hareketler</p></div><button className="secondary compact" type="button" onClick={() => onNavigate('sales-orders')}>Tüm siparişler <ChevronRight size={14}/></button></header>
    <div className="erp-home-table-wrap"><table className="erp-home-orders"><thead><tr><th>No</th><th>Tarih</th><th>Müşteri</th><th>Tutar</th><th>Durum</th><th/></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td><button className="erp-link-button" type="button" onClick={() => onNavigate('sales-orders')}>{row.code}</button></td><td>{new Date(row.orderDate).toLocaleDateString('tr-TR')}</td><td>{row.customerName}</td><td>{money(row.grandTotal, row.currencyCode)}</td><td><span className="erp-status-chip green">Açık</span></td><td><ChevronRight size={14}/></td></tr>)}
      {!rows.length && <tr><td colSpan={6} className="erp-home-empty">{loading ? 'Siparişler yükleniyor…' : canReadSalesOrders ? 'Açık satış siparişi bulunmuyor.' : 'Görüntüleme yetkisi yok.'}</td></tr>}
    </tbody></table></div>
  </section>
}
