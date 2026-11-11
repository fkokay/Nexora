import { Download, MoreHorizontal, Plus, Upload, UsersRound } from "lucide-react";

type Props = {
  canImport: boolean;
  exportBusy: boolean;
  onImport: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onGroups: () => void;
  onCreate: () => void;
  title?: string;
  description?: string;
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
}: Props) {
  return (
    <div className="page-heading customer-heading">
      <div>
        <div className="customer-heading-title">
          <span className="customer-heading-icon"><UsersRound size={24} /></span>
          <div><h1>{title}</h1>
        <p className="muted">{description}</p>
          </div>
        </div>
      </div>
      <div className="heading-actions">
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
        <button className="secondary customer-desktop-action" onClick={onGroups}>
          Gruplar
        </button>
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
      </div>
    </div>
  );
}
