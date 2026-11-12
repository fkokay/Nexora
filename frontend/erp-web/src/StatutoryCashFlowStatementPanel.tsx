import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "./erpApi";

type AmountLine = {
  accountId: string;
  code: string;
  name: string;
  classification: string;
  amount: number;
};
type ActivityLine = {
  accountId: string;
  code: string;
  name: string;
  classification: string;
  inflows: number;
  outflows: number;
  netCashFlow: number;
};
type Activity = {
  lines: ActivityLine[];
  inflows: number;
  outflows: number;
  netCashFlow: number;
};
type WarningAccount = {
  accountId: string;
  code: string;
  name: string;
  section: string;
  classification: string;
  periodMovement: number;
  currencyCode: string | null;
};
type StatementWarning = {
  code: string;
  message: string;
  accounts: WarningAccount[];
};
type Statement = {
  standard: string;
  method: string;
  basis: string;
  from: string;
  to: string;
  baseCurrencyCode: string;
  operating: {
    netProfitLoss: number;
    adjustments: AmountLine[];
    adjustmentsTotal: number;
    workingCapitalChanges: AmountLine[];
    workingCapitalTotal: number;
    netCashFlow: number;
  };
  investing: Activity;
  financing: Activity;
  effectOfExchangeRateChanges: number;
  netChangeInCash: number;
  reconciliation: {
    openingCashAndCashEquivalents: number;
    netChangeInCash: number;
    expectedClosingCashAndCashEquivalents: number;
    closingCashAndCashEquivalents: number;
    difference: number;
    reconciles: boolean;
  };
  nonCashInvestingFinancingEntries: {
    entryId: string;
    entryCode: string;
    entryDate: string;
    accountCodes: string[];
  }[];
  warnings: StatementWarning[];
  excludedFiscalCloseEntryCount: number;
  isComplete: boolean;
  note: string;
};

const fmt = (value: number) =>
  value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const trDate = (value: string) => value.split("-").reverse().join(".");

export default function StatutoryCashFlowStatementPanel({
  token,
  from,
  to,
}: {
  token: string;
  from: string;
  to: string;
}) {
  const [basis, setBasis] = useState("TDHP"),
    [statement, setStatement] = useState<Statement | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, basis });
      setStatement(
        await api<Statement>(
          `/api/finance/general-ledger/financial-statements/tms7/statement-of-cash-flows?${params}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token, from, to, basis]);

  const activityRows = (activity: Activity) =>
    activity.lines.map((line) => (
      <tr key={line.accountId}>
        <td className="tms7-indent">
          {line.code} · {line.name}
          {line.inflows !== 0 && line.outflows !== 0 && (
            <small className="cell-subtitle">
              {`Giriş ${fmt(line.inflows)} · Çıkış ${fmt(line.outflows)}`}
            </small>
          )}
        </td>
        <td>{fmt(line.netCashFlow)}</td>
      </tr>
    ));
  const amountRows = (lines: AmountLine[]) =>
    lines.map((line) => (
      <tr key={line.accountId}>
        <td className="tms7-indent">
          {line.code} · {line.name}
        </td>
        <td>{fmt(line.amount)}</td>
      </tr>
    ));

  return (
    <section className="panel tms7-cashflow-panel statutory-cashflow-panel">
      <div className="tms7-cashflow-header">
        <div>
          <p className="eyebrow">TMS 7 · DOLAYLI YÖNTEM · YEVMİYE KAYITLARINDAN</p>
          <h2>Nakit akış tablosu</h2>
          <p>
            {statement
              ? `${trDate(statement.from)} – ${trDate(statement.to)} · Baz para: ${statement.baseCurrencyCode}`
              : "—"}
          </p>
        </div>
        <div className="tms7-cashflow-actions">
          <select
            aria-label="Rapor standardı"
            value={basis}
            disabled={busy}
            onChange={(e) => setBasis(e.target.value)}
          >
            <option value="TDHP">TDHP</option>
            <option value="IFRS">TFRS / UFRS</option>
          </select>
          <span
            className={
              statement?.isComplete ? "status-pill active" : "status-pill"
            }
          >
            {statement?.isComplete ? "Mutabakat tamam" : "Kontrol gerekli"}
          </span>
          <button
            className="secondary small-button"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw size={14} />
            {busy ? "Yükleniyor…" : "Yenile"}
          </button>
        </div>
      </div>
      {error && <div className="alert inline-alert">{error}</div>}
      <div className="boundary-note tms7-disclaimer">
        <ShieldCheck size={16} />
        <span>
          Muhasebeci tarafından incelenmemiş taslak tablodur; yasal finansal
          tablo veya beyan olarak kullanılmamalıdır.
        </span>
      </div>
      {statement && (
        <>
          {statement.warnings.map((warning) => (
            <div
              key={warning.code}
              className="alert inline-alert statutory-cashflow-warning"
            >
              <AlertTriangle size={16} />
              <div>
                <b>{warning.message}</b>
                {warning.accounts.length > 0 && (
                  <ul>
                    {warning.accounts.map((account) => (
                      <li key={account.accountId}>
                        {`${account.code} · ${account.name} (${account.section}${account.currencyCode ? ` · ${account.currencyCode}` : ""}) · ${fmt(account.periodMovement)}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          <div className="ledger-list tms7-reconciliation-table">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Kalem</th>
                  <th>Tutar ({statement.baseCurrencyCode})</th>
                </tr>
              </thead>
              <tbody>
                <tr className="tms7-total-row">
                  <td colSpan={2}>
                    <b>A. İşletme faaliyetlerinden nakit akışları</b>
                  </td>
                </tr>
                <tr>
                  <td>Dönem kârı / zararı</td>
                  <td>{fmt(statement.operating.netProfitLoss)}</td>
                </tr>
                <tr>
                  <td>Dönem kârı mutabakatı ile ilgili düzeltmeler</td>
                  <td>{fmt(statement.operating.adjustmentsTotal)}</td>
                </tr>
                {amountRows(statement.operating.adjustments)}
                <tr>
                  <td>İşletme sermayesinde gerçekleşen değişimler</td>
                  <td>{fmt(statement.operating.workingCapitalTotal)}</td>
                </tr>
                {amountRows(statement.operating.workingCapitalChanges)}
                <tr className="tms7-total-row">
                  <td>
                    <b>İşletme faaliyetlerinden net nakit</b>
                  </td>
                  <td>
                    <b>{fmt(statement.operating.netCashFlow)}</b>
                  </td>
                </tr>
                <tr className="tms7-total-row">
                  <td colSpan={2}>
                    <b>B. Yatırım faaliyetlerinden nakit akışları</b>
                  </td>
                </tr>
                {activityRows(statement.investing)}
                <tr className="tms7-total-row">
                  <td>
                    <b>Yatırım faaliyetlerinden net nakit</b>
                  </td>
                  <td>
                    <b>{fmt(statement.investing.netCashFlow)}</b>
                  </td>
                </tr>
                <tr className="tms7-total-row">
                  <td colSpan={2}>
                    <b>C. Finansman faaliyetlerinden nakit akışları</b>
                  </td>
                </tr>
                {activityRows(statement.financing)}
                <tr className="tms7-total-row">
                  <td>
                    <b>Finansman faaliyetlerinden net nakit</b>
                  </td>
                  <td>
                    <b>{fmt(statement.financing.netCashFlow)}</b>
                  </td>
                </tr>
                <tr>
                  <td>D. Kur değişiminin nakit üzerindeki etkisi</td>
                  <td>{fmt(statement.effectOfExchangeRateChanges)}</td>
                </tr>
                <tr className="tms7-total-row">
                  <td>
                    <b>Nakit ve nakit benzerlerindeki net değişim</b>
                  </td>
                  <td>
                    <b>{fmt(statement.netChangeInCash)}</b>
                  </td>
                </tr>
                <tr>
                  <td>E. Dönem başı nakit ve nakit benzerleri</td>
                  <td>
                    {fmt(
                      statement.reconciliation.openingCashAndCashEquivalents,
                    )}
                  </td>
                </tr>
                <tr className="tms7-total-row">
                  <td>
                    <b>Dönem sonu nakit ve nakit benzerleri (A+B+C+D+E)</b>
                  </td>
                  <td>
                    <b>
                      {fmt(
                        statement.reconciliation
                          .expectedClosingCashAndCashEquivalents,
                      )}
                    </b>
                  </td>
                </tr>
                <tr>
                  <td>Defterdeki dönem sonu nakit</td>
                  <td>
                    {fmt(
                      statement.reconciliation.closingCashAndCashEquivalents,
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Mutabakat farkı</td>
                  <td>{fmt(statement.reconciliation.difference)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="boundary-note tms7-quality-note">
            <ShieldCheck size={16} />
            <span>
              {`Nakit dışı yatırım/finansman işlemleri (TMS 7.43): ${
                statement.nonCashInvestingFinancingEntries.length === 0
                  ? "yok"
                  : statement.nonCashInvestingFinancingEntries
                      .map(
                        (entry) =>
                          `${entry.entryCode} (${trDate(entry.entryDate)}: ${entry.accountCodes.join(", ")})`,
                      )
                      .join(" · ")
              } · Hariç tutulan kapanış/açılış fişi: ${statement.excludedFiscalCloseEntryCount}`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
