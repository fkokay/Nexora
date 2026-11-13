import { ListPageHeader } from "../../list-page/ListPageHeader";
import type { Translate } from "../types";

type Props = {
  tx: Translate;
  /** Number of definitions; null while the first load is running. */
  total?: number | null;
};

export function OperationalDefinitionsHeader({ tx, total = null }: Props) {
  return (
    <ListPageHeader
      title={tx("İş yeri, şube ve fabrika", "Workplaces, branches and factories")}
      description={tx(
        "Firma lokasyonlarını tanımlayın. Depolar, stok işlemleri ve raf/konum bağlantılarıyla birlikte ayrı depo kayıtları olarak yönetilir.",
        "Define company locations. Warehouses remain separate records managed with inventory and storage locations.",
      )}
      count={total}
      countLabel={tx("kayıt", "records")}
    />
  );
}
