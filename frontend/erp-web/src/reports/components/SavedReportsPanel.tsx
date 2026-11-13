import type { ReactNode } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { localizedCatalogLabel, localizedText as tx } from "../../locale";
import type { SavedReport, Source } from "../reportTypes";

type Props = {
  isList: boolean;
  admin: boolean;
  canDesign: boolean;
  loading: boolean;
  busy: boolean;
  loadError: string;
  saved: SavedReport[];
  sources: Source[];
  selectedId: string;
  locale: string;
  onRefresh: () => void;
  onOpen: (report: SavedReport) => void;
  onDuplicate: (report: SavedReport) => void;
  onRemove: (report: SavedReport) => void;
  /** Extra content below the list, e.g. the open definition's revision history. */
  children?: ReactNode;
};

export function SavedReportsPanel({
  isList,
  admin,
  canDesign,
  loading,
  busy,
  loadError,
  saved,
  sources,
  selectedId,
  locale,
  onRefresh,
  onOpen,
  onDuplicate,
  onRemove,
  children,
}: Props) {
  return (
    <aside
      className="report-saved report-pane"
      aria-labelledby="report-saved-title"
    >
      <div className="report-pane-head">
        <h2 className="report-pane-title" id="report-saved-title">
          {isList
            ? tx("Kayıtlı listeler", "Saved lists")
            : tx("Kayıtlı raporlar", "Saved reports")}
          <b className="report-count" aria-live="polite">
            {loading ? "…" : saved.length.toLocaleString(locale)}
          </b>
        </h2>
        <button
          type="button"
          className="report-icon-button"
          title={tx("Yenile", "Refresh")}
          aria-label={tx("Yenile", "Refresh")}
          disabled={loading || busy}
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {loading ? (
        <div className="report-empty-state" role="status">
          {tx("Kayıtlı tanımlar yükleniyor…", "Loading saved definitions…")}
        </div>
      ) : loadError ? (
        <div className="report-empty-state" role="alert">
          {tx(
            "Kayıtlı tanımlar gösterilemiyor.",
            "Saved definitions are unavailable.",
          )}
        </div>
      ) : saved.length ? (
        saved.map((report) => (
          <article
            className={`saved-report ${selectedId === report.id ? "selected" : ""}`}
            key={report.id}
          >
            <button
              className="saved-report-open"
              title={tx(
                `${report.name} öğesini aç ve çalıştır`,
                `Open and run ${report.name}`,
              )}
              disabled={busy}
              onClick={() => onOpen(report)}
            >
              <b>{report.name}</b>
              <small>
                {localizedCatalogLabel(
                  sources.find((x) => x.code === report.source)?.label ??
                    report.source,
                )}{" "}
                · {tx("Aç ve çalıştır", "Open and run")} ·{" "}
                {new Date(report.updatedAt).toLocaleDateString(locale)}
              </small>
            </button>
            {canDesign && (
              <button
                type="button"
                className="report-delete-saved"
                title={
                  isList
                    ? tx("Listeyi çoğalt", "Duplicate list")
                    : tx("Raporu çoğalt", "Duplicate report")
                }
                aria-label={
                  isList
                    ? tx(`Listeyi çoğalt: ${report.name}`, `Duplicate list: ${report.name}`)
                    : tx(`Raporu çoğalt: ${report.name}`, `Duplicate report: ${report.name}`)
                }
                disabled={busy}
                onClick={() => onDuplicate(report)}
              >
                <Copy size={15} />
              </button>
            )}
            {admin && (
              <>
                <button
                  type="button"
                  className="report-delete-saved"
                  title={
                    isList
                      ? tx("Listeyi sil", "Delete list")
                      : tx("Raporu sil", "Delete report")
                  }
                  aria-label={
                    isList
                      ? tx(
                          `Listeyi sil: ${report.name}`,
                          `Delete list: ${report.name}`,
                        )
                      : tx(
                          `Raporu sil: ${report.name}`,
                          `Delete report: ${report.name}`,
                        )
                  }
                  disabled={busy}
                  onClick={() => onRemove(report)}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </article>
        ))
      ) : (
        <div className="report-empty-state">
          {tx("Henüz kayıtlı", "No saved")}{" "}
          {isList ? tx("liste", "lists") : tx("rapor", "reports")}{" "}
          {tx("yok.", "yet.")}
          {canDesign
            ? ` ${tx("Bir", "Create a")} ${isList ? tx("liste", "list") : tx("rapor", "report")} ${tx("tasarlayıp kaydedin.", "and save it.")}`
            : tx(
                " Yöneticinizden görünüm paylaşmasını isteyin.",
                " Ask your administrator to share a view.",
              )}
        </div>
      )}
      {children}
    </aside>
  );
}
