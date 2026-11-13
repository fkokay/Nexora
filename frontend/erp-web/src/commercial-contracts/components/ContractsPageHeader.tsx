import { Plus } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import type { Translate } from "../types";

type Props = {
  /** Number of contracts matching the current filters; undefined while unknown. */
  total: number | undefined;
  canEdit: boolean;
  tx: Translate;
  onCreate: () => void;
};

export default function ContractsPageHeader({
  total,
  canEdit,
  tx,
  onCreate,
}: Props) {
  return (
    <ListPageHeader
      title={tx("Ticari sözleşmeler")}
      description={tx(
        "Müşteri ve tedarikçi sözleşmelerini firma kapsamında izleyin; durum değişiklikleri geçmişe kaydedilir.",
      )}
      count={total ?? null}
      countLabel={tx("kayıt")}
    >
      {canEdit && (
        <button className="primary" onClick={onCreate}>
          <Plus size={17} /> {tx("Yeni sözleşme")}
        </button>
      )}
    </ListPageHeader>
  );
}
