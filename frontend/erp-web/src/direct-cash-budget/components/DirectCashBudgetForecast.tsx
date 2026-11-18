import AdvancedDataGrid from "../../AdvancedDataGrid";
import { formatMonth, money, type ForecastMonth } from "../types";

type Row = ForecastMonth & { currencyCode: string };
type Props = { rows: Row[]; loading: boolean };

export default function DirectCashBudgetForecast({ rows, loading }: Props) {
  return (
    <>
    <section
      className="fin-cash-forecast"
      aria-labelledby="direct-cash-forecast-title"
    >
      <header className="fin-cash-forecast-head">
        <h2 id="direct-cash-forecast-title">
          Onaylı planların nakit tahminine etkisi
        </h2>
        <p>
          Önümüzdeki 12 ay · tahsilat ve ödeme satırları para birimi bazında
          ayrıdır.
        </p>
      </header>
      <div
        className="ledger-list"
        role="region"
        aria-label="Onaylı planların nakit tahmini tablosu"
        tabIndex={0}
      >
        <AdvancedDataGrid enableRowSelection={false} className="customer-table">
          <caption>
            Önümüzdeki 12 ay için onaylı planların para birimi bazında nakit
            tahmini
          </caption>
          <thead>
            <tr>
              <th scope="col">Dönem</th>
              <th scope="col">Döviz</th>
              <th scope="col" className="nx-num">Planlanan tahsilat</th>
              <th scope="col" className="nx-num">Planlanan ödeme</th>
              <th scope="col" className="nx-num">Net nakit değişimi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.currencyCode}-${row.periodStart}`}>
                <td data-label="Dönem">{formatMonth(row.periodStart)}</td>
                <td data-label="Döviz">{row.currencyCode}</td>
                <td data-label="Planlanan tahsilat" className="nx-num">
                  {money(row.directCashBudgetInflows, row.currencyCode)}
                </td>
                <td data-label="Planlanan ödeme" className="nx-num">
                  {money(row.directCashBudgetOutflows, row.currencyCode)}
                </td>
                <td data-label="Net nakit değişimi" className="nx-num">
                  {money(
                    row.directCashBudgetInflows - row.directCashBudgetOutflows,
                    row.currencyCode,
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="table-empty">
                  Seçilen tahmin döneminde onaylı nakit bütçesi yok.
                </td>
              </tr>
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
    </section>
      <div className="boundary-note">
        <span>
          Tahmin satırları yalnızca planlama bilgisidir. Onay, tahsilat/ödeme
          veya yevmiye kaydı başlatmaz.
        </span>
      </div>
    </>
  );
}
