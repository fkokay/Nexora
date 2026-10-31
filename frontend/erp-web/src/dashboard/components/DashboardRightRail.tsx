import { Bell, ChevronRight, FileText, Package, Users, Zap, Plus } from 'lucide-react'

type Props = { platformStatus: string; platformLabel: string; onNavigate: (page: string) => void }
const shortcuts = [
  { page: 'sales-invoices', title: 'Satış faturası', note: 'Yeni fatura oluştur', icon: FileText },
  { page: 'sales-purchase-invoices', title: 'Alış faturası', note: 'Tedarikçi faturası kaydet', icon: FileText },
  { page: 'inventory-stock', title: 'Stok hareketleri', note: 'Mal kabul ve stok hareketleri', icon: Package },
  { page: 'customers', title: 'Cari kart', note: 'Müşteri veya tedarikçi ekle', icon: Users },
  { page: 'reports', title: 'Raporlar', note: 'Detaylı raporları görüntüle', icon: FileText },
  { page: 'sales-orders', title: 'Yeni satış siparişi', note: 'Sipariş oluştur', icon: Plus },
]

export default function DashboardRightRail({ platformStatus, platformLabel, onNavigate }: Props) {
  return <aside className="dashboard-reference-right">
    <section className="erp-home-panel dashboard-reference-shortcuts"><header><div><h2><Zap size={17}/> Hızlı işlemler</h2><p>Sık kullanılan ekranlar</p></div></header>
      <div className="dashboard-shortcut-list">{shortcuts.map(({ page, title, note, icon: Icon }) => <button type="button" key={title} onClick={() => onNavigate(page)}><span><Icon size={17}/></span><i><b>{title}</b><small>{note}</small></i><ChevronRight size={14}/></button>)}</div>
    </section>
    <section className="erp-home-panel dashboard-reference-status"><header><div><h2><Bell size={16}/> Sistem durumu</h2><p>Bağlantı kontrolleri</p></div><span className={`dashboard-status-dot ${platformStatus}`}/></header><div className={`dashboard-status-message ${platformStatus}`}><span/>{platformLabel}</div><p>Platform API ve firma veritabanı</p></section>
  </aside>
}
