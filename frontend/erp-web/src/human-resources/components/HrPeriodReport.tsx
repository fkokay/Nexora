import { useRef } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ListFooter } from "../../list-page/ListFooter";
import { isInPopup, openDialogs, useWindowKeyDown } from "../../record-form/recordFormKeys";

export type HrPeriodSummary = {
  from: string;
  to: string;
  employeesAtPeriodEnd: number;
  attendanceRecordCount: number;
  employeesWithAttendance: number;
  workedMinutes: number;
  overtimeMinutes: number;
  leaveRequestCount: number;
  requestedLeaveDays: number;
  leaveStatuses: { status: string; requestCount: number; requestedDays: number }[];
};

type Props = {
  tr: (tr: string, en: string) => string;
  isEn: boolean;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  /**
   * Runs the report (each load is written to the audit log, so it only runs on request: button, F9, İşlemler). The
   * caller validates the dates first, also while the parameters are hidden (see `focusInvalidHrReportParam`).
   */
  onRun: () => void;
  busy: boolean;
  summary: HrPeriodSummary | null;
  paramsOpen: boolean;
  onParamsOpenChange: (open: boolean) => void;
  statusLabel: (status: string) => string;
  formatDate: (value: string) => string;
};

export const HR_REPORT_FORM_ID = "hr-report-params";

/** Moves the focus to the first invalid report parameter and shows the browser's message for it. */
export function focusInvalidHrReportParam(form: HTMLFormElement) {
  const invalid = Array.from(form.elements).find(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement && !element.checkValidity(),
  );
  invalid?.focus();
  form.reportValidity();
}

/**
 * Dönem özeti as a report screen (approved mockup 04 "Rapor ekranı"): parameters on the left (Ctrl+. hides them), the
 * result on the right. Unlike the Finans reports it does not re-run on a parameter change, because every load is
 * audited; the result says "güncel değil" until it is run again (F9).
 */
export function HrPeriodReport({
  tr,
  isEn,
  from,
  to,
  onFromChange,
  onToChange,
  onRun,
  busy,
  summary,
  paramsOpen,
  onParamsOpenChange,
  statusLabel,
  formatDate,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const number = (value: number) => value.toLocaleString(isEn ? "en-US" : "tr-TR");
  const duration = (minutes: number) =>
    `${number(Math.floor(minutes / 60))}${tr(" sa", " h")} ${minutes % 60}${tr(" dk", " min")}`;
  /** F9: the same path as İşlemler › Raporu çalıştır (the caller validates, also with the parameters hidden). */
  const run = () => {
    if (!busy) onRun();
  };
  useWindowKeyDown(true, (event) => {
    const root = rootRef.current;
    if (!root || root.closest("[hidden]") || openDialogs().length) return;
    if (event.defaultPrevented || event.altKey || event.metaKey || isInPopup(event.target)) return;
    if (event.key === "F9" && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      run();
    } else if (event.key === "." && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      onParamsOpenChange(!paramsOpen);
    }
  });
  const stale = !!summary && (summary.from !== from || summary.to !== to);
  const leaveTotals = summary?.leaveStatuses.reduce(
    (sum, row) => ({ requests: sum.requests + row.requestCount, days: sum.days + row.requestedDays }),
    { requests: 0, days: 0 },
  );
  const metrics: [string, string][] = summary
    ? [
        [tr("Dönem sonundaki personel sayısı", "Employees at period end"), number(summary.employeesAtPeriodEnd)],
        [tr("Puantaj kaydı", "Attendance records"), number(summary.attendanceRecordCount)],
        [tr("Puantajı olan personel", "Employees with attendance"), number(summary.employeesWithAttendance)],
        [tr("Çalışma süresi", "Worked time"), duration(summary.workedMinutes)],
        [tr("Fazla mesai", "Overtime"), duration(summary.overtimeMinutes)],
        [tr("Dönemle çakışan izin talebi", "Overlapping leave requests"), number(summary.leaveRequestCount)],
        [tr("Talep edilen izin günü", "Requested leave days"), number(summary.requestedLeaveDays)],
      ]
    : [];
  return (
    <>
      <div ref={rootRef} className={`hr-rp${paramsOpen ? "" : " is-params-hidden"}`}>
        {paramsOpen && (
          <aside className="hr-rp-params" aria-label={tr("Parametreler", "Parameters")}>
            <div className="hr-rp-params-head">
              <b>{tr("Parametreler", "Parameters")}</b>
              <button
                type="button"
                className="hr-rp-toggle"
                onClick={() => onParamsOpenChange(false)}
                title={tr("Parametreleri gizle (Ctrl+.)", "Hide parameters (Ctrl+.)")}
              >
                <PanelLeftClose size={15} aria-hidden="true" />
                <span>{tr("Gizle", "Hide")}</span>
              </button>
            </div>
            <form
              id={HR_REPORT_FORM_ID}
              className="hr-rp-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!busy) onRun();
              }}
            >
              <label>
                {tr("Başlangıç", "From")}
                <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} required />
              </label>
              <label>
                {tr("Bitiş", "To")}
                <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} required />
              </label>
              <button type="submit" className="hr-rp-run" disabled={busy}>
                <span>{tr("Raporu çalıştır", "Run report")}</span>
                <kbd>F9</kbd>
              </button>
            </form>
            <p className="hr-rp-note">
              {tr(
                "Rapor dönemi en fazla 366 takvim günüdür. İzin günleri, döneme denk gelen taleplerin talep edilen toplam günüdür.",
                "Reports cover up to 366 calendar days. Leave days are the requested totals for requests overlapping the period.",
              )}
            </p>
            <p className="hr-rp-note">
              {tr(
                "Firma yöneticileri için kişi bazında satır içermeyen personel, puantaj ve izin toplamları. Dönem erişimi denetim kaydına yazılır.",
                "Tenant wide employee, attendance and leave totals without employee-level rows. Report access is recorded in the audit log.",
              )}
            </p>
          </aside>
        )}
        <section className="hr-rp-result" aria-label={tr("Dönem özeti", "Period summary")}>
          <div className="hr-rp-summary">
            {!paramsOpen && (
              <button
                type="button"
                className="hr-rp-toggle"
                onClick={() => onParamsOpenChange(true)}
                title={tr("Parametreleri göster (Ctrl+.)", "Show parameters (Ctrl+.)")}
              >
                <PanelLeftOpen size={15} aria-hidden="true" />
                <span>{tr("Parametreler", "Parameters")}</span>
              </button>
            )}
            <span className="hr-rp-summary-item">
              {tr("Dönem", "Period")}: {formatDate(summary?.from ?? from)} – {formatDate(summary?.to ?? to)}
            </span>
            {stale && (
              <span className="hr-rp-summary-item is-stale" role="status">
                {tr("Parametreler değişti · sonuç güncel değil (F9)", "Parameters changed · result is out of date (F9)")}
              </span>
            )}
          </div>
          {!summary ? (
            <p className="hr-rp-empty">
              {tr(
                "Dönemi seçip Raporu çalıştır (F9) ile özeti getirin.",
                "Choose the period and use Run report (F9) to load the summary.",
              )}
            </p>
          ) : (
            <div className="hr-rp-body">
              <div className="hr-rp-table">
                <table>
                  <caption>{tr("Personel ve puantaj", "Employees and attendance")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{tr("Gösterge", "Measure")}</th>
                      <th scope="col" className="nx-num">
                        {tr("Değer", "Value")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(([label, value]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td className="nx-num">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="hr-rp-table">
                <table>
                  <caption>{tr("İzin durumu kırılımı", "Leave status breakdown")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{tr("İzin durumu", "Leave status")}</th>
                      <th scope="col" className="nx-num">
                        {tr("Talep", "Requests")}
                      </th>
                      <th scope="col" className="nx-num">
                        {tr("Talep edilen gün", "Requested days")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.leaveStatuses.map((row) => (
                      <tr key={row.status}>
                        <td>{statusLabel(row.status)}</td>
                        <td className="nx-num">{number(row.requestCount)}</td>
                        <td className="nx-num">{number(row.requestedDays)}</td>
                      </tr>
                    ))}
                    {!summary.leaveStatuses.length && (
                      <tr>
                        <td colSpan={3}>{tr("Dönemle çakışan izin talebi yok.", "No overlapping leave requests.")}</td>
                      </tr>
                    )}
                  </tbody>
                  {!!summary.leaveStatuses.length && leaveTotals && (
                    <tfoot>
                      <tr>
                        <th scope="row">{tr("Toplam", "Total")}</th>
                        <td className="nx-num">{number(leaveTotals.requests)}</td>
                        <td className="nx-num">{number(leaveTotals.days)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
      <ListFooter
        hints={tr(
          "F9 çalıştır · Ctrl+. parametreleri gizle · Ctrl+E CSV",
          "F9 run · Ctrl+. hide parameters · Ctrl+E CSV",
        )}
      >
        {summary && (
          <span>
            {tr("Personel", "Employees")} {number(summary.employeesAtPeriodEnd)} · {tr("İzin talebi", "Leave requests")}{" "}
            {number(summary.leaveRequestCount)}
          </span>
        )}
      </ListFooter>
    </>
  );
}
