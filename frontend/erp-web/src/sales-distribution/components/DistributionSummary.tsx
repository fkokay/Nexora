type Props = {
  totalOpenDemand: number;
  totalUncovered: number;
};

/** Quantity totals of the visible page; they have no filter equivalent, so they stay. */
export default function DistributionSummary({
  totalOpenDemand,
  totalUncovered,
}: Props) {
  return (
    <dl className="sales-lv2-facts">
      <div>
        <dt>Sayfadaki açık talep</dt>
        <dd>{totalOpenDemand.toLocaleString("tr-TR")}</dd>
      </div>
      <div>
        <dt>Sayfadaki karşılanmamış miktar</dt>
        <dd>{totalUncovered.toLocaleString("tr-TR")}</dd>
      </div>
    </dl>
  );
}
