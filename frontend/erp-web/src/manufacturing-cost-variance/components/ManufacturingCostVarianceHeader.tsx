import { RefreshCw } from 'lucide-react'

export function ManufacturingCostVarianceHeader({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return <header className="page-heading manufacturing-cost-heading">
    <div><p className="eyebrow">ÜRETİM YÖNETİMİ · MALİYET MUHASEBESİ</p><h1>Üretim maliyet analizi</h1><p className="muted">Üretim emirlerinin planlanan ve kaydedilmiş fiilî maliyetlerini karşılaştırın.</p></div>
    <button className="secondary" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={15}/> Yenile</button>
  </header>
}
