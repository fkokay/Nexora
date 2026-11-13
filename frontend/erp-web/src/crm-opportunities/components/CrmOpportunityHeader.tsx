import { Plus } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  onCreate: () => void;
  /** Number of opportunities matching the current search and stage; null while unknown. */
  total?: number | null;
};

export function CrmOpportunityHeader({ onCreate, total = null }: Props) {
  return (
    <ListPageHeader
      title="CRM fırsatları"
      description="Açık fırsatları aşamaları, tahmini kapanışları ve takip adımlarıyla yönetin."
      count={total}
    >
      <button
        className="primary crm-new-action"
        type="button"
        onClick={onCreate}
      >
        <Plus size={16} />
        Yeni fırsat
      </button>
    </ListPageHeader>
  );
}
