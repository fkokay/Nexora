import { ListPageHeader } from "../../list-page/ListPageHeader";

/** Title row of the cost analysis list; refresh lives in the toolbar row. */
export function ManufacturingCostVarianceHeader({
  total,
}: {
  /** Number of production orders in the selected range; null while unknown. */
  total: number | null;
}) {
  return (
    <ListPageHeader
      title="Üretim maliyet analizi"
      description="Üretim emirlerinin planlanan ve kaydedilmiş fiilî maliyetlerini karşılaştırın."
      count={total}
      className="manufacturing-cost-heading"
    />
  );
}
