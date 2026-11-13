import { Download, MoreHorizontal, Plus, Upload } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  canImport: boolean;
  exportBusy: boolean;
  onImport: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onGroups: () => void;
  onCreate: () => void;
  title?: string;
  description?: string;
  /** Total number of customer cards in the tenant; null while it is still loading. */
  total?: number | null;
};

export function CustomerDirectoryHeader({
  canImport,
  exportBusy,
  onImport,
  onExport,
  onGroups,
  onCreate,
  title = "Cari Hesaplar",
  description = "Müşteri ve tedarikçi kartlarını firma bazında yönetin.",
  total = null,
}: Props) {
  return (
    <ListPageHeader title={title} description={description} count={total} className="customer-heading">
        <button className="secondary customer-desktop-action" onClick={onGroups}>
          Gruplar
        </button>
        {canImport && (
          <button className="secondary customer-desktop-action" onClick={onImport}>
            <Upload size={15} /> CSV / Excel içe aktar
          </button>
        )}
        <details className="customer-export-menu customer-desktop-action">
          <summary className="secondary">
            <Download size={15} /> Dışa aktar
          </summary>
          <div>
            <button
              type="button"
              disabled={exportBusy}
              onClick={() => onExport("csv")}
            >
              CSV olarak indir
            </button>
            <button
              type="button"
              disabled={exportBusy}
              onClick={() => onExport("xlsx")}
            >
              Excel olarak indir
            </button>
          </div>
        </details>
        <button className="primary" onClick={onCreate}>
          <Plus size={17} /> Yeni cari kartı
        </button>
        <details className="customer-mobile-actions">
          <summary aria-label="Diğer işlemler">
            <MoreHorizontal size={20} />
            <span className="sr-only">Diğer işlemler</span>
          </summary>
          <div>
            {canImport && (
              <button type="button" onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                onImport();
              }}>
                <Upload size={15} /> CSV / Excel içe aktar
              </button>
            )}
            <button type="button" disabled={exportBusy} onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onExport("csv");
            }}>
              <Download size={15} /> CSV olarak indir
            </button>
            <button type="button" disabled={exportBusy} onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onExport("xlsx");
            }}>
              <Download size={15} /> Excel olarak indir
            </button>
            <button type="button" onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onGroups();
            }}>
              Gruplar
            </button>
          </div>
        </details>
    </ListPageHeader>
  );
}
