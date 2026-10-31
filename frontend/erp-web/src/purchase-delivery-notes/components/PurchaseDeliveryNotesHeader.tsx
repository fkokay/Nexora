import { RefreshCw } from 'lucide-react'

export function PurchaseDeliveryNotesHeader({ disabled, onRefresh }: { disabled: boolean; onRefresh: () => void }) {
  return <div className="page-heading purchase-note-commandbar"><div><p className="eyebrow">SATIN ALMA · TEDARİKÇİ BELGELERİ</p><h1>Tedarikçi irsaliyeleri</h1><p className="muted">Tedarikçi belge numarası ve sipariş miktarlarını kaydedin; mal kabul öncesi veya sonrasında bağlantı kurun.</p></div><button className="secondary" onClick={onRefresh} disabled={disabled}><RefreshCw size={16}/> Yenile</button></div>
}
