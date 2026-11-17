import { useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import type { MenuCommand } from "../../commands/types";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { isInPopup, openDialogs, useWindowKeyDown } from "../../record-form/recordFormKeys";
import "../ledger-reports.css";

const NOT_IN_REPORT = "Raporda kullanılamaz";

type Props = {
  title: string;
  description: string;
  count: number | null;
  countLabel: string;
  /** Parameter panel content (left; Ctrl+. hides / shows it). */
  params: ReactNode;
  /** Short "Dönem: … · Standart: …" items above the result. */
  summary: ReactNode[];
  /** F9 and Yenile: runs the report again with the current parameters (it also runs on every parameter change). */
  onRun: () => void;
  onExportXlsx?: () => void;
  onExportCsv?: () => void;
  /** Why the export is not possible (no result yet). */
  exportDisabledReason?: string;
  more?: MenuCommand[];
  className?: string;
  children: ReactNode;
};

/**
 * Finans report screen (approved mockup 04 "Rapor ekranı"): header, action bar, a parameter panel on the left and the
 * result on the right. Only the parameters the endpoint takes today are drawn (no saved variants, no branch). Like
 * before, the report runs again when a parameter changes; F9 / Yenile run it again explicitly. Yeni, Aç, Kaydet and
 * Sil are disabled on a report; Excel writes the result.
 */
export function LedgerReportFrame({
  title,
  description,
  count,
  countLabel,
  params,
  summary,
  onRun,
  onExportXlsx,
  onExportCsv,
  exportDisabledReason,
  more = [],
  className,
  children,
}: Props) {
  const [paramsOpen, setParamsOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const owns = () => Boolean(rootRef.current) && !rootRef.current!.closest("[hidden]") && !openDialogs().length;
  useWindowKeyDown(true, (event) => {
    if (event.defaultPrevented || event.altKey || event.metaKey || isInPopup(event.target) || !owns()) return;
    if (event.key === "F9" && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      onRun();
    } else if (event.key === "." && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      setParamsOpen((open) => !open);
    }
  });
  const toggleLabel = paramsOpen ? "Parametreleri gizle" : "Parametreleri göster";
  return (
    <div ref={rootRef} className={`glrp-frame-root${className ? ` ${className}` : ""}`}>
      <PageCommandsSlot
        commands={{
          new: { disabledReason: NOT_IN_REPORT },
          open: { disabledReason: NOT_IN_REPORT },
          save: { disabledReason: NOT_IN_REPORT },
          delete: { disabledReason: NOT_IN_REPORT },
          refresh: { run: onRun },
          export: onExportXlsx
            ? { disabledReason: exportDisabledReason, run: exportDisabledReason ? undefined : onExportXlsx }
            : { disabledReason: NOT_IN_REPORT },
          more: [
            { id: "report-params", label: toggleLabel, shortcut: "Ctrl+.", run: () => setParamsOpen((open) => !open) },
            { id: "report-run", label: "Raporu çalıştır", shortcut: "F9", run: onRun },
            ...(onExportCsv
              ? [{ id: "report-csv", label: "CSV", disabledReason: exportDisabledReason, run: exportDisabledReason ? undefined : onExportCsv }]
              : []),
            ...more,
          ],
        }}
      />
      <ListPageHeader title={title} description={description} count={count} countLabel={countLabel} />
      <div className={`glrp-frame${paramsOpen ? "" : " is-params-hidden"}`}>
        {paramsOpen && (
          <aside className="glrp-params" aria-label="Parametreler">
            <div className="glrp-params-head">
              <b>Parametreler</b>
              <button type="button" className="glrp-params-toggle" onClick={() => setParamsOpen(false)} title="Parametreleri gizle (Ctrl+.)">
                <PanelLeftClose size={15} aria-hidden="true" />
                <span>Gizle</span>
              </button>
            </div>
            {params}
            <button type="button" className="glrp-run" onClick={onRun}>
              <span>Raporu çalıştır</span>
              <kbd>F9</kbd>
            </button>
            <p className="glrp-params-note">Parametre değişince rapor yeniden hesaplanır.</p>
          </aside>
        )}
        <section className="glrp-result" aria-label={title}>
          <div className="glrp-summary">
            {!paramsOpen && (
              <button type="button" className="glrp-params-toggle" onClick={() => setParamsOpen(true)} title="Parametreleri göster (Ctrl+.)">
                <PanelLeftOpen size={15} aria-hidden="true" />
                <span>Parametreler</span>
              </button>
            )}
            {summary.map((item, index) => (
              <span key={index} className="glrp-summary-item">
                {item}
              </span>
            ))}
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}

/** A labelled group inside the parameter panel. */
export function ReportParam({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="glrp-param" role="group" aria-label={label}>
      <span className="glrp-param-label">{label}</span>
      {children}
    </div>
  );
}
