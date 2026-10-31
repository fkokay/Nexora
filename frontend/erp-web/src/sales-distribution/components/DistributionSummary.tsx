type Props = { totalCount: number; totalOpenDemand: number; totalUncovered: number; warehouseCode: string }

export default function DistributionSummary({ totalCount, totalOpenDemand, totalUncovered, warehouseCode }: Props) {
  return <div className="sales-distribution-kpis">
    <article><span>Listelenen stok kalemi</span><b>{totalCount}</b></article>
    <article><span>Sayfadaki açık talep</span><b>{totalOpenDemand.toLocaleString('tr-TR')}</b></article>
    <article><span>Sayfadaki karşılanmamış miktar</span><b>{totalUncovered.toLocaleString('tr-TR')}</b></article>
    <article><span>Depo</span><b>{warehouseCode}</b></article>
  </div>
}
