import { ExternalLink } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  onOpenRequests: () => void;
  /** Number of quotes matching the current filters; null while unknown. */
  total?: number | null;
};

export default function SupplierQuotesHeader({
  onOpenRequests,
  total = null,
}: Props) {
  return (
    <ListPageHeader
      title="Tedarikçi Teklifleri"
      description="Taleplere bağlı teklifleri tek listede bulun, durumlarını ve fiyatlarını inceleyin."
      count={total}
    >
      <button className="primary" onClick={onOpenRequests}>
        Talep üzerinden teklif gir <ExternalLink size={15} />
      </button>
    </ListPageHeader>
  );
}
