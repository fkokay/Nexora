import { formatAmount } from "../../document-detail/DocumentDetailLayout";
import type { CurrencySummary, Facility } from "../types";

type Props = {
  /** One row per currency (already narrowed by the currency chip). Amounts are never summed across currencies. */
  summaries: CurrencySummary[];
  /** Facilities behind the summaries; their planned instalments feed the 30-day tile. */
  facilities: Facility[];
  today: string;
  /** today + 30 days, yyyy-mm-dd. */
  horizon: string;
};

function Lines({ rows }: { rows: { code: string; value: number }[] }) {
  if (!rows.length) return <span className="fh-tile-value is-muted-value">—</span>;
  return (
    <span className="fh-tile-value">
      {rows.map((row) => (
        <span key={row.code}>{formatAmount(row.value, row.code)}</span>
      ))}
    </span>
  );
}

export function CreditFacilitiesSummary({ summaries, facilities, today, horizon }: Props) {
  const dueSoon = new Map<string, { count: number; total: number }>();
  let overdue = 0;
  for (const facility of facilities) {
    for (const item of facility.schedule) {
      if (item.status !== "Planned") continue;
      if (item.dueDate < today) {
        overdue += 1;
        continue;
      }
      if (item.dueDate > horizon) continue;
      const entry = dueSoon.get(facility.currencyCode) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += item.principalAmount + item.interestAmount + item.feeAmount;
      dueSoon.set(facility.currencyCode, entry);
    }
  }
  const dueSoonCount = [...dueSoon.values()].reduce((sum, entry) => sum + entry.count, 0);
  const single = summaries.length === 1 ? summaries[0] : null;
  const usage = single && single.approved > 0 ? single.drawdown / single.approved : null;
  return (
    <section className="fh-tiles" aria-label="Kredi bakiyesi özeti">
      <div className="fh-tile">
        <span className="fh-tile-label">Onaylı limit</span>
        <Lines rows={summaries.map((row) => ({ code: row.code, value: row.approved }))} />
        <span className="fh-tile-hint">{`${summaries.reduce((sum, row) => sum + row.count, 0)} kredi`}</span>
      </div>
      <div className="fh-tile">
        <span className="fh-tile-label">Kullanılan</span>
        <Lines rows={summaries.map((row) => ({ code: row.code, value: row.drawdown }))} />
        {usage !== null && (
          <>
            <span
              className="cf-bar"
              role="progressbar"
              aria-label="Limit kullanımı"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, usage) * 100)}
            >
              <i style={{ width: `${Math.min(1, Math.max(0, usage)) * 100}%` }} />
            </span>
            <span className="fh-tile-hint">
              {`Limitin %${(usage * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kullanıldı`}
            </span>
          </>
        )}
        {usage === null && summaries.length > 1 && (
          <span className="fh-tile-hint">Para birimleri ayrı gösterilir</span>
        )}
      </div>
      <div className="fh-tile">
        <span className="fh-tile-label">Açık anapara</span>
        <Lines rows={summaries.map((row) => ({ code: row.code, value: row.outstanding }))} />
      </div>
      <div className={`fh-tile${dueSoonCount ? " is-warning" : ""}`}>
        <span className="fh-tile-label">30 gün içinde taksit</span>
        <Lines rows={[...dueSoon.entries()].map(([code, entry]) => ({ code, value: entry.total }))} />
        <span className="fh-tile-hint">
          {`${dueSoonCount} taksit`}
          {overdue > 0 && <span className="is-danger">{` · ${overdue} gecikmiş`}</span>}
        </span>
      </div>
    </section>
  );
}
