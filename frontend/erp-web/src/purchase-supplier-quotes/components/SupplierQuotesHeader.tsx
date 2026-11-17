import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  /** Number of quotes matching the current filters; null while unknown. */
  total?: number | null;
};

/** Title row; "Talep üzerinden teklif gir" is in İşlemler (the list is read-only, Aç opens the quote's request). */
export default function SupplierQuotesHeader({ total = null }: Props) {
  return (
    <ListPageHeader
      title="Satınalma Teklifleri"
      description="Taleplere bağlı teklifleri tek listede bulun, durumlarını ve fiyatlarını inceleyin."
      count={total}
    />
  );
}
