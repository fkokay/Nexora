import { ListPageHeader } from "../../list-page/ListPageHeader";

export function PurchaseDeliveryNotesHeader({
  total = null,
}: {
  /** Number of delivery notes of the company; null while unknown. */
  total?: number | null;
}) {
  return (
    <ListPageHeader
      title="Satınalma İrsaliyeleri"
      description="Tedarikçi belge numarası ve sipariş miktarlarını kaydedin; mal kabul öncesi veya sonrasında bağlantı kurun."
      count={total}
    />
  );
}
