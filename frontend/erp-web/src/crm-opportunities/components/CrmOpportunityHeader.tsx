import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  /** Number of opportunities matching the current search and stage; null while unknown. */
  total?: number | null;
};

/** Title row of CRM Fırsatları; "Yeni fırsat" is the action bar's Yeni (F2). */
export function CrmOpportunityHeader({ total = null }: Props) {
  return (
    <ListPageHeader
      title="CRM fırsatları"
      description="Açık fırsatları aşamaları, tahmini kapanışları ve takip adımlarıyla yönetin."
      count={total}
    />
  );
}
