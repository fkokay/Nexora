import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  /** Number of tracked balances matching the filters; null while unknown. */
  total: number | null;
};

export default function InventoryTrackingHeader({ total }: Props) {
  return (
    <ListPageHeader
      className="customer-heading"
      title="Lot / seri izleme"
      description="Depolardaki izlenen lot ve seri numaralarının güncel bakiyesini ve son hareket tarihini bulun."
      count={total}
    />
  );
}
