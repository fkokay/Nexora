import { formatAmount } from "../../document-detail/DocumentDetailLayout";
import type { CurrencyAmount } from "../paymentInstrumentTypes";

/** Portfolio-wide figures; they do not follow the tab or chip filters. */
export type PortfolioTiles = {
  receivableOpen: CurrencyAmount[];
  receivableOpenCount: number;
  payableOpen: CurrencyAmount[];
  payableOpenCount: number;
  dueSoonCount: number;
  dueSoonReceivable: CurrencyAmount[];
  dueSoonPayable: CurrencyAmount[];
  bouncedCount: number;
};

function Amounts({ rows }: { rows: CurrencyAmount[] }) {
  if (!rows.length) return <span className="fh-tile-value is-muted-value">—</span>;
  return (
    <span className="fh-tile-value">
      {rows.map((row) => (
        <span key={row.currencyCode}>{formatAmount(row.amount, row.currencyCode)}</span>
      ))}
    </span>
  );
}

export function PaymentInstrumentMetrics({
  tiles,
  loading,
}: {
  tiles: PortfolioTiles | null;
  loading: boolean;
}) {
  if (!tiles)
    return (
      <div className="fh-tiles" aria-busy={loading}>
        {["Portföyde", "Verilen", "30 gün içinde vade", "Karşılıksız"].map((label) => (
          <div key={label} className="fh-tile is-muted">
            <span className="fh-tile-label">{label}</span>
            <span className="fh-tile-value">{loading ? "…" : "—"}</span>
          </div>
        ))}
      </div>
    );
  const dueSoon = [
    ...tiles.dueSoonReceivable.map((row) => ({ ...row, side: "Alınan" })),
    ...tiles.dueSoonPayable.map((row) => ({ ...row, side: "Verilen" })),
  ];
  return (
    <section className="fh-tiles" aria-label="Portföy özeti">
      <div className="fh-tile">
        <span className="fh-tile-label">Portföyde</span>
        <Amounts rows={tiles.receivableOpen} />
        <span className="fh-tile-hint">{`${tiles.receivableOpenCount} alınan çek/senet`}</span>
      </div>
      <div className="fh-tile">
        <span className="fh-tile-label">Verilen</span>
        <Amounts rows={tiles.payableOpen} />
        <span className="fh-tile-hint">{`${tiles.payableOpenCount} açık verilen çek/senet`}</span>
      </div>
      <div className={`fh-tile${tiles.dueSoonCount ? " is-warning" : ""}`}>
        <span className="fh-tile-label">30 gün içinde vade</span>
        {dueSoon.length ? (
          <span className="fh-tile-value pi-tile-lines">
            {dueSoon.map((row) => (
              <span key={`${row.side}-${row.currencyCode}`}>
                <small>{row.side}</small> {formatAmount(row.amount, row.currencyCode)}
              </span>
            ))}
          </span>
        ) : (
          <span className="fh-tile-value is-muted-value">—</span>
        )}
        <span className="fh-tile-hint">{`${tiles.dueSoonCount} çek/senet`}</span>
      </div>
      <div className={`fh-tile${tiles.bouncedCount ? " is-danger-tile" : ""}`}>
        <span className="fh-tile-label">Karşılıksız</span>
        <span className="fh-tile-value">{tiles.bouncedCount.toLocaleString("tr-TR")}</span>
        <span className="fh-tile-hint">Tahsil edilemeyen alınan ve verilen kayıtlar</span>
      </div>
    </section>
  );
}
