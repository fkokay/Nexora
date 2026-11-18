import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../erpApi";
import { journalSourceTypeLabel as sourceTypeLabel } from "../sourceTypeLabels";
import { displayDate, formatAmount, round2 } from "../ledgerReportUtils";
import { shortenEntryCode } from "../journalEntries";

/** GET /api/finance/general-ledger/accounts/{accountId}/statement (muavin defter). */
type AccountStatement = {
  account: { id: string; code: string; name: string; isActive: boolean };
  openingDebit: number;
  openingCredit: number;
  totalDebit: number;
  totalCredit: number;
  closingBalanceDebit: number;
  closingBalanceCredit: number;
  totalCount: number;
  page: number;
  totalPages: number;
  lines: {
    journalEntryId: string;
    journalEntryCode: string;
    entryDate: string;
    journalDescription: string;
    sourceType: string;
    lineNumber: number;
    lineDescription: string;
    debit: number;
    credit: number;
  }[];
};

const balanceText = (net: number) => {
  const value = round2(net);
  if (value === 0) return "—";
  return `${formatAmount(Math.abs(value))} ${value > 0 ? "B" : "A"}`;
};

/** Account movements (muavin) for one ledger account over a period, used beside the Mizan and the chart of accounts. */
export function AccountMovementsAside({
  token,
  accountId,
  code,
  name,
  from,
  to,
  onClose,
}: {
  token: string;
  accountId: string;
  code: string;
  name: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const [statement, setStatement] = useState<AccountStatement | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function fetchPage(page: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), pageSize: "200" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return api<AccountStatement>(
      `/api/finance/general-ledger/accounts/${accountId}/statement?${params}`,
      token,
      { signal },
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    setStatement(null);
    setError("");
    setLoading(true);
    fetchPage(1, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setStatement(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // fetchPage only reads the props listed here.
  }, [token, accountId, from, to]);
  async function loadMore() {
    if (!statement) return;
    setLoading(true);
    try {
      const next = await fetchPage(statement.page + 1);
      setStatement({ ...next, lines: [...statement.lines, ...next.lines] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  let running = statement ? statement.openingDebit - statement.openingCredit : 0;
  return (
    <aside className="glmv" aria-label="Hesap hareketleri" aria-live="polite">
      <div className="list-v2-detail-head">
        <div>
          <span className="list-v2-kind">Muavin</span>
          <h2 title={name}>{`${code} · ${name}`}</h2>
          <span className="glmv-meta">
            {from || to ? `${from ? displayDate(from) : "Başlangıç"} – ${to ? displayDate(to) : "Bugün"}` : "Tüm dönemler"}
          </span>
        </div>
        <div className="list-v2-detail-head-actions">
          <button type="button" className="icon-button" aria-label="Kapat" title="Kapat" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {statement ? (
        <>
          <dl className="glmv-summary">
            <div>
              <dt>Açılış</dt>
              <dd>{balanceText(statement.openingDebit - statement.openingCredit)}</dd>
            </div>
            <div>
              <dt>Dönem borç</dt>
              <dd>{formatAmount(statement.totalDebit)}</dd>
            </div>
            <div>
              <dt>Dönem alacak</dt>
              <dd>{formatAmount(statement.totalCredit)}</dd>
            </div>
            <div>
              <dt>Kapanış</dt>
              <dd>{balanceText(statement.closingBalanceDebit - statement.closingBalanceCredit)}</dd>
            </div>
          </dl>
          {statement.lines.length ? (
            <table className="glmv-lines">
              <thead>
                <tr>
                  <th scope="col">Fiş</th>
                  <th scope="col">Borç</th>
                  <th scope="col">Alacak</th>
                  <th scope="col">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => {
                  running += line.debit - line.credit;
                  const description = line.lineDescription || line.journalDescription;
                  return (
                    <tr key={`${line.journalEntryId}-${line.lineNumber}`} title={description}>
                      <td>
                        <b title={line.journalEntryCode}>{shortenEntryCode(line.journalEntryCode)}</b>
                        <small>{`${displayDate(line.entryDate)} · ${line.sourceType === "ManualReversal" ? "Ters kayıt" : sourceTypeLabel(line.sourceType)}`}</small>
                        {description && <small>{description}</small>}
                      </td>
                      <td>{line.debit ? formatAmount(line.debit) : ""}</td>
                      <td>{line.credit ? formatAmount(line.credit) : ""}</td>
                      <td>{balanceText(running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="glmv-empty">Bu dönemde hareket yok.</p>
          )}
          {statement.page < statement.totalPages && (
            <button type="button" className="secondary glmv-more" disabled={loading} onClick={() => void loadMore()}>
              {loading ? "Yükleniyor…" : `Daha fazla göster (${statement.lines.length} / ${statement.totalCount})`}
            </button>
          )}
          <p className="glmv-note">Muavin, hesabın tüm muhasebe standartlarındaki fiş satırlarını listeler.</p>
        </>
      ) : (
        !error && <p className="glmv-empty">{loading ? "Hareketler yükleniyor…" : ""}</p>
      )}
    </aside>
  );
}
