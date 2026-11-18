import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  title?: string;
  description?: string;
  /** Total number of customer cards (search applied); null while it is still loading. */
  total?: number | null;
};

/**
 * Title row of Cari Hesaplar. The former header buttons live on the action bar: Yeni (F2), Excel (Ctrl+E; CSV in
 * İşlemler), and Gruplar / CSV / Excel içe aktar in İşlemler (Alt+İ).
 */
export function CustomerDirectoryHeader({
  title = "Cari Hesaplar",
  description = "Müşteri ve tedarikçi kartlarını firma bazında yönetin.",
  total = null,
}: Props) {
  return <ListPageHeader title={title} description={description} count={total} className="customer-heading" />;
}
