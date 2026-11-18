import type { ReactNode } from "react";
import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  title: string;
  description: string;
  /** Record count shown next to the title; null while unknown or on a screen without a count. */
  count?: number | null;
  /** Word after the count (default "kayıt"). */
  countLabel?: string;
  /** Muted figures on the right of the title row (material planning: recipes, work centers, warehouses). */
  meta?: ReactNode;
};

/**
 * Title row of the Üretim list screens (list-v2): title, record count and the action bar slot under it. Create,
 * refresh and plan history live on the action bar (Yeni F2, Yenile F5, İşlemler).
 */
export default function ManufacturingPageHeader({ title, description, count = null, countLabel, meta }: Props) {
  return (
    <ListPageHeader title={title} description={description} count={count} countLabel={countLabel}>
      {meta && <span className="list-v2-count mfg-heading-meta">{meta}</span>}
    </ListPageHeader>
  );
}
