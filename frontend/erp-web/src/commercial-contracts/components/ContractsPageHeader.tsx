import { Download, Plus } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import type { Translate } from "../types";

type Props = {
  /** Number of contracts matching the current filters; undefined while unknown. */
  total: number | undefined;
  canEdit: boolean;
  canExport: boolean;
  tx: Translate;
  onCreate: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
};

export default function ContractsPageHeader({
  total,
  canEdit,
  canExport,
  tx,
  onCreate,
  onExportXlsx,
  onExportCsv,
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
      <button
        type="button"
        className="secondary"
        onClick={onExportXlsx}
        disabled={!canExport}
        title={tx("Listelenen sözleşmeleri XLSX olarak indir")}
      >
        <Download size={15} aria-hidden="true" /> XLSX
      </button>
      <button
        type="button"
        className="secondary"
        onClick={onExportCsv}
        disabled={!canExport}
        title={tx("Listelenen sözleşmeleri CSV olarak indir")}
      >
        <Download size={15} aria-hidden="true" /> CSV
      </button>
      {canEdit && (
        <button type="button" className="primary" onClick={onCreate}>
          <Plus size={17} /> {tx("Yeni sözleşme")}
        </button>
      )}
    </ListPageHeader>
  );
}
