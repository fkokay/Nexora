import { Boxes, Factory, PackageCheck } from "lucide-react";
import { ListSummaryCards } from "../../list-page/ListSummaryCards";
import type { CostReport } from "./types";

const amount = (value: number | null | undefined, currency: string) => {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
};

/** Page totals of the report (the endpoint returns `pageTotals`, no report total), so every card says "Bu sayfa". */
export function ManufacturingCostVarianceSummary({
  report,
  currency,
}: {
  report: CostReport;
  currency: string;
}) {
  return (
    <section aria-label="Üretim maliyet özeti">
      <ListSummaryCards
        cards={[
          {
            id: "planned-material",
            label: "Planlanan malzeme",
            value: amount(report.pageTotals.plannedMaterialBase, currency),
            icon: Boxes,
            hint: "Bu sayfa · fire dahil emir anlık görüntüsü",
          },
          {
            id: "planned-conversion",
            label: "Planlanan dönüşüm",
            value: amount(
              report.pageTotals.plannedLaborBase +
                report.pageTotals.plannedOverheadBase +
                report.pageTotals.plannedEnergyBase,
              currency,
            ),
            icon: Factory,
            hint: "Bu sayfa · işçilik, genel gider ve enerji",
          },
          {
            id: "actual-material",
            label: "Fiilî malzeme",
            value: amount(report.pageTotals.actualMaterialBase, currency),
            icon: PackageCheck,
            hint: "Bu sayfa · emre bağlı bileşen hareketleri",
          },
        ]}
      />
    </section>
  );
}
