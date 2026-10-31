import { RefreshCw } from 'lucide-react'

type Props = { loading: boolean; onRefresh: () => void }

export default function InventoryTrackingHeader({ loading, onRefresh }: Props) {
  return <div className="page-heading customer-heading">
    <div>
      <p className="eyebrow">ERP CORE · STOK İZLENEBİLİRLİĞİ</p>
      <h1>Lot / seri izleme</h1>
      <p className="muted">Depolardaki izlenen lot ve seri numaralarının güncel bakiyesini ve son hareket tarihini bulun.</p>
    </div>
    <button className="secondary" type="button" disabled={loading} onClick={onRefresh} aria-label="Lot ve seri bakiyelerini yenile">
      <RefreshCw size={15} aria-hidden="true"/> Yenile
    </button>
  </div>
}
