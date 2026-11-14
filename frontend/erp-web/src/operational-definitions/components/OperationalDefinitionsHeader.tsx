import { Plus } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import type { Translate } from "../types";

type Props = {
  tx: Translate;
  /** Number of definitions; null while the first load is running. */
  total?: number | null;
  /** Opens the definition panel for a new record. */
  onCreate: () => void;
};

export function OperationalDefinitionsHeader({ tx, total = null, onCreate }: Props) {
  return (
    <ListPageHeader
      title={tx("İş yeri, şube ve fabrika", "Workplaces, branches and factories")}
      description={tx(
        "Firma lokasyonlarını tanımlayın. Depolar, stok işlemleri ve raf/konum bağlantılarıyla birlikte ayrı depo kayıtları olarak yönetilir.",
        "Define company locations. Warehouses remain separate records managed with inventory and storage locations.",
      )}
      count={total}
      countLabel={tx("kayıt", "records")}
    >
      <button type="button" className="primary" onClick={onCreate}>
        <Plus size={16} /> {tx("Yeni tanım", "New definition")}
      </button>
    </ListPageHeader>
  );
}
