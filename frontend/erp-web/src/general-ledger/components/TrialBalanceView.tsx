import { Fragment, useEffect, useState, type KeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, localDateString } from "../../erpApi";
import type { LedgerStatementSection, LedgerTrialBalance } from "../../erp-types";
import { ledgerStatementLabels } from "../../financeCatalog";
import { ListFooter } from "../../list-page/ListFooter";
import { LedgerReportFrame, ReportParam } from "./LedgerReportFrame";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import {
  displayDate,
  downloadCsv,
  downloadXlsx,
  formatAmount,
  formatOrDash,
  isReverseBalance,
  round2,
  startOfMonth,
  startOfYear,
  tdhpClassLabels,
} from "../ledgerReportUtils";
import { AccountMovementsAside } from "./AccountMovementsAside";
import { BasisSegmented, type ReportingBasis } from "./BasisSegmented";
import "../ledger-reports.css";

type TrialRow = LedgerTrialBalance["accounts"][number];
/** One displayed Mizan row: an account as returned, or a 3-digit main account aggregate. */
type DisplayRow = {
  key: string;
  code: string;
  name: string;
  statementSection?: string | null;
  isActive: boolean;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  balanceDebit: number;
  balanceCredit: number;
  members: TrialRow[];
};
type Amounts = Pick<DisplayRow, "openingDebit" | "openingCredit" | "debit" | "credit" | "balanceDebit" | "balanceCredit">;

const amountKeys: (keyof Amounts)[] = ["openingDebit", "openingCredit", "debit", "credit", "balanceDebit", "balanceCredit"];
const sumAmounts = (rows: Amounts[]): Amounts =>
  Object.fromEntries(amountKeys.map((key) => [key, round2(rows.reduce((sum, row) => sum + row[key], 0))])) as Amounts;
const hasActivity = (row: Amounts) => amountKeys.some((key) => round2(row[key]) !== 0);
const isLedgerGuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const mainCodeOf = (code: string) => {
  const head = code.trim().split(".")[0];
  return head.length > 3 ? head.slice(0, 3) : head;
};
const sectionOrder = ["Asset", "Liability", "Equity", "Revenue", "Expense", "Unclassified"];

function toDisplayRow(row: TrialRow): DisplayRow {
  return {
    key: row.accountId,
    code: row.code,
    name: row.name,
    statementSection: row.statementSection,
    isActive: row.isActive,
    openingDebit: row.openingDebit,
    openingCredit: row.openingCredit,
    debit: row.debit,
    credit: row.credit,
    balanceDebit: row.balanceDebit,
    balanceCredit: row.balanceCredit,
    members: [row],
  };
}
/** Aggregates sub-accounts into their 3-digit main account; the balance is netted per main account. */
function aggregateMainAccounts(rows: TrialRow[]): DisplayRow[] {
  const groups = new Map<string, TrialRow[]>();
  for (const row of rows) {
    const key = mainCodeOf(row.code);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.entries()].map(([code, members]) => {
    const own = members.find((row) => row.code.trim() === code) || members[0];
    const sums = sumAmounts(members);
    const net = round2(sums.openingDebit - sums.openingCredit + sums.debit - sums.credit);
    return {
      key: `main:${code}`,
      code,
      name: own.name,
      statementSection: own.statementSection,
      isActive: members.some((row) => row.isActive),
      ...sums,
      balanceDebit: Math.max(0, net),
      balanceCredit: Math.max(0, -net),
      members,
    };
  });
}

type Period = "year" | "month" | "custom";

/** ↑ / ↓ on an account row: focus the previous / next account row (group and subtotal rows are skipped). */
function moveRowFocus(event: KeyboardEvent<HTMLTableRowElement>): boolean {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  event.preventDefault();
  const rows = [...(event.currentTarget.closest("tbody")?.querySelectorAll<HTMLElement>("tr.glrp-row") ?? [])];
  rows[rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  return true;
}

export function TrialBalanceView({ token }: { token: string }) {
  const [basis, setBasis] = useState<ReportingBasis>("TDHP"),
    [period, setPeriod] = useState<Period>("year"),
    [customFrom, setCustomFrom] = useState(startOfYear()),
    [customTo, setCustomTo] = useState(localDateString()),
    [scope, setScope] = useState<"moving" | "all">("moving"),
    [level, setLevel] = useState<"main" | "sub">("sub"),
    [query, setQuery] = useState(""),
    [data, setData] = useState<LedgerTrialBalance | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selection, setSelection] = useState<{ rowKey: string; accountId: string } | null>(null),
    // F9 / Yenile: the same request again.
    [runKey, setRunKey] = useState(0);
  const from = period === "year" ? startOfYear() : period === "month" ? startOfMonth() : customFrom;
  const to = period === "custom" ? customTo : localDateString();
  const rangeValid = !from || !to || from <= to;
  useEffect(() => {
    if (!rangeValid) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelection(null);
    const params = new URLSearchParams({ basis });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const timer = window.setTimeout(() => {
      api<LedgerTrialBalance>(`/api/finance/general-ledger/trial-balance?${params}`, token, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [token, basis, from, to, rangeValid, runKey]);

  const isIfrs = basis === "IFRS";
  const effectiveLevel = isIfrs ? "sub" : level;
  const levelRows: DisplayRow[] = data
    ? effectiveLevel === "main"
      ? aggregateMainAccounts(data.accounts)
      : data.accounts.map(toDisplayRow)
    : [];
  const nameByCode = new Map((data?.accounts || []).map((row) => [row.code.trim(), row.name]));
  const reverseOf = (row: DisplayRow) =>
    isReverseBalance(row, row.balanceDebit, row.balanceCredit, basis, isIfrs ? undefined : nameByCode.get(mainCodeOf(row.code)));
  const reverseCount = levelRows.filter(reverseOf).length;
  const levelTotals = sumAmounts(levelRows);
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const visibleRows = levelRows
    .filter((row) => scope === "all" || hasActivity(row))
    .filter(
      (row) =>
        !normalizedQuery ||
        row.code.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
        row.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery),
    )
    .sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" }));
  const groupOf = (row: DisplayRow) =>
    isIfrs ? row.statementSection || "Unclassified" : row.code.trim().charAt(0) || "?";
  const groupLabel = (group: string) =>
    isIfrs
      ? ledgerStatementLabels[group as LedgerStatementSection] || group
      : `${group} ${tdhpClassLabels[group] || "Diğer"}`;
  const groups = [...new Set(visibleRows.map(groupOf))].sort((a, b) =>
    isIfrs ? sectionOrder.indexOf(a) - sectionOrder.indexOf(b) : a.localeCompare(b, "tr", { numeric: true }),
  );
  // The total row stays the level total; search and the movement filter only hide rows.
  const visibleTotals = levelTotals;
  const movingCount = levelRows.filter(hasActivity).length;

  const selectedRow = selection ? levelRows.find((row) => row.key === selection.rowKey) || null : null;
  const selectedAccount = selection && selectedRow
    ? selectedRow.members.find((member) => member.accountId === selection.accountId) || null
    : null;
  function openRow(row: DisplayRow) {
    if (isIfrs) return;
    const moving = row.members.filter((member) => isLedgerGuid(member.accountId) && hasActivity(member));
    const only = moving.length === 1 ? moving[0] : row.members.length === 1 ? row.members[0] : null;
    setSelection({ rowKey: row.key, accountId: only && isLedgerGuid(only.accountId) ? only.accountId : "" });
  }

  function exportRows() {
    return [
      ["Hesap kodu", "Hesap adı", "Açılış borç", "Açılış alacak", "Dönem borç", "Dönem alacak", "Bakiye borç", "Bakiye alacak"],
      ...visibleRows.map((row) => [row.code, row.name, ...amountKeys.map((key) => row[key])]),
      ["Toplam", "", ...amountKeys.map((key) => visibleTotals[key])],
    ];
  }
  const fileBase = `mizan-${basis}-${from || "baslangic"}-${to || "bugun"}`;

  const periodLabel = `${from ? displayDate(from) : "Başlangıç"} – ${to ? displayDate(to) : "Bugün"}`;
  const difference = round2(levelTotals.balanceDebit - levelTotals.balanceCredit);

  return (
    <LedgerReportFrame
      className="glrp-trial"
      title="Mizan"
      description="Seçili dönem için açılışları, hareketleri ve kapanış bakiyelerini inceleyin."
      count={data ? visibleRows.length : null}
      countLabel={`hesap · ${periodLabel}`}
      onRun={() => setRunKey((key) => key + 1)}
      onExportXlsx={() => void downloadXlsx(`${fileBase}.xlsx`, "Mizan", exportRows())}
      onExportCsv={() => downloadCsv(`${fileBase}.csv`, exportRows())}
      exportDisabledReason={data ? undefined : "Rapor henüz hazır değil"}
      summary={[
        <>
          <span>Dönem:</span> <b>{periodLabel}</b>
        </>,
        <>
          <span>Standart:</span> <b>{basis}</b>
        </>,
        ...(!isIfrs ? [<><span>Düzey:</span> <b>{level === "main" ? "Ana hesap" : "Alt hesap"}</b></>] : []),
        <>
          <span>Kapsam:</span> <b>{scope === "moving" ? "Yalnız hareketli" : "Tüm hesaplar"}</b>
        </>,
        ...(loading ? [<span className="glrp-loading">Yükleniyor…</span>] : []),
      ]}
      params={
        <>
          <ReportParam label="Dönem">
            <ListChipGroup
              label="Dönem"
              value={period}
              onChange={(value) => setPeriod(value as Period)}
              options={[
                { value: "year", label: "Bu yıl" },
                { value: "month", label: "Bu ay" },
                { value: "custom", label: "Özel" },
              ]}
            />
            {period === "custom" && (
              <div className="glrp-param-dates">
                <label className="list-v2-filter">
                  <span>Başlangıç</span>
                  <input type="date" aria-label="Başlangıç" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label className="list-v2-filter">
                  <span>Bitiş</span>
                  <input type="date" aria-label="Bitiş" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
              </div>
            )}
          </ReportParam>
          <ReportParam label="Standart">
            <BasisSegmented value={basis} onChange={setBasis} />
          </ReportParam>
          {!isIfrs && (
            <ReportParam label="Hesap düzeyi">
              <ListChipGroup
                label="Hesap düzeyi"
                value={level}
                onChange={(value) => {
                  setSelection(null);
                  setLevel(value as "main" | "sub");
                }}
                options={[
                  { value: "main", label: "Ana hesap" },
                  { value: "sub", label: "Alt hesap" },
                ]}
              />
            </ReportParam>
          )}
          <ReportParam label="Hesap kapsamı">
            <ListChipGroup
              label="Hesap kapsamı"
              value={scope}
              onChange={(value) => setScope(value as "moving" | "all")}
              options={[
                { value: "moving", label: "Yalnız hareketli", count: data ? movingCount : undefined },
                { value: "all", label: "Tüm hesaplar", count: data ? levelRows.length : undefined },
              ]}
            />
          </ReportParam>
        </>
      }
    >
      <ListToolbar search={query} onSearchChange={setQuery} searchLabel="Mizanda hesap ara" searchPlaceholder="Hesap kodu veya adı" />
      {error && <p className="error-banner">{error}</p>}
      {!rangeValid && <p className="error-banner">Başlangıç tarihi bitiş tarihinden sonra olamaz.</p>}
      {data?.isComplete === false && (
        <p className="glrp-warning" role="status">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>
            {`${data.unmappedAccountCount || 0} hareketli hesapta ${basis} eşlemesi eksik. Profil tamamlanmadan rapor eksiksiz değildir.`}
            {data.unmappedAccounts?.length ? ` ${data.unmappedAccounts.slice(0, 5).join(", ")}${data.unmappedAccounts.length > 5 ? "…" : ""}` : ""}
          </span>
        </p>
      )}
      {data && (
        <div className={`glrp-layout${selectedRow ? " has-side" : ""}`}>
          <div className="glrp-card">
            <div className="glrp-table-wrap">
              <table className="glrp-table">
                <thead>
                  <tr>
                    <th scope="col">Hesap</th>
                    <th scope="col">Açılış B</th>
                    <th scope="col">Açılış A</th>
                    <th scope="col">Dönem B</th>
                    <th scope="col">Dönem A</th>
                    <th scope="col">Bakiye B</th>
                    <th scope="col">Bakiye A</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const rows = visibleRows.filter((row) => groupOf(row) === group);
                    const subtotal = sumAmounts(rows);
                    return (
                      <Fragment key={group}>
                        <tr className="glrp-group-row">
                          <th scope="rowgroup" colSpan={7}>{groupLabel(group)}</th>
                        </tr>
                        {rows.map((row) => {
                          const reverse = reverseOf(row);
                          const isSelected = selectedRow?.key === row.key;
                          const clickable = !isIfrs;
                          return (
                            <tr
                              key={row.key}
                              className={`glrp-row${clickable ? " is-clickable" : ""}${isSelected ? " is-selected" : ""}${row.isActive ? "" : " is-inactive"}`}
                              // Every account row takes the focus so ↑↓ walks the list (IFRS too); Enter opens the muavin
                              // only on the TDHP basis. The arrows move the focus only.
                              tabIndex={0}
                              aria-current={isSelected || undefined}
                              title={clickable ? "Enter: muavini aç" : undefined}
                              onClick={clickable ? () => openRow(row) : undefined}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (moveRowFocus(event)) return;
                                if (clickable && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault();
                                  openRow(row);
                                }
                              }}
                            >
                              <td className="glrp-account" style={{ paddingLeft: effectiveLevel === "sub" ? 10 + 14 * (row.code.split(".").length - 1) : undefined }}>
                                <b>{row.code}</b>
                                <span title={row.name}>{row.name}{row.isActive ? "" : " · Pasif"}</span>
                                {reverse && (
                                  <span
                                    className="glrp-reverse"
                                    role="img"
                                    aria-label="Ters bakiye"
                                    title={
                                      row.balanceCredit > 0
                                        ? "Ters bakiye: varlık hesabı alacak bakiyesi veriyor."
                                        : "Ters bakiye: kaynak hesabı borç bakiyesi veriyor."
                                    }
                                  >
                                    <AlertTriangle size={13} aria-hidden="true" />
                                  </span>
                                )}
                              </td>
                              {amountKeys.map((key) => (
                                <td key={key}>{formatOrDash(row[key])}</td>
                              ))}
                            </tr>
                          );
                        })}
                        <tr className="glrp-subtotal-row">
                          <th scope="row">{`${groupLabel(group)} toplamı`}</th>
                          {amountKeys.map((key) => (
                            <td key={key}>{formatOrDash(subtotal[key])}</td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="glrp-empty">
                        {levelRows.length ? "Filtreyle eşleşen hesap yok." : "Hesap planında hesap yok."}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="glrp-total-row">
                    <th scope="row">
                      <span>Genel toplam</span>
                      {data.isBalanced ? (
                        <span className="glrp-total-check is-ok">
                          <CheckCircle2 size={13} aria-hidden="true" /> Mizan dengede
                        </span>
                      ) : data.isComplete !== false ? (
                        <span className="glrp-total-check is-bad">
                          <AlertTriangle size={13} aria-hidden="true" /> Dengede değil
                        </span>
                      ) : null}
                    </th>
                    {amountKeys.map((key) => (
                      <td key={key}>{formatAmount(visibleTotals[key])}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <ListFooter hints={isIfrs ? "↑↓ gez · Ctrl+. parametreler · F9 çalıştır" : "↑↓ gez · Enter muavini aç · Ctrl+. parametreler · F9 çalıştır"}>
              {reverseCount > 0 && (
                <span className="glrp-foot-warn">
                  <span>{reverseCount}</span> <span>ters bakiye</span>
                </span>
              )}
              <span>
                <span>{levelRows.length}</span> <span>hesap</span> · <span>Borç</span> <span>{formatAmount(visibleTotals.debit)}</span> · <span>Alacak</span>{" "}
                <span>{formatAmount(visibleTotals.credit)}</span> · <span>Bakiye farkı</span> <span>{formatAmount(Math.abs(difference))}</span>
              </span>
            </ListFooter>
          </div>
          {selectedRow &&
            (selectedAccount ? (
              <AccountMovementsAside
                token={token}
                accountId={selectedAccount.accountId}
                code={selectedAccount.code}
                name={selectedAccount.name}
                from={from}
                to={to}
                onClose={() => setSelection(null)}
              />
            ) : (
              <aside className="glmv" aria-label="Alt hesaplar">
                <div className="list-v2-detail-head">
                  <div>
                    <span className="list-v2-kind">Muavin</span>
                    <h2>{`${selectedRow.code} · ${selectedRow.name}`}</h2>
                    <span className="glmv-meta">Hareketlerini görmek için bir alt hesap seçin.</span>
                  </div>
                </div>
                <ul className="glmv-members">
                  {selectedRow.members
                    .filter((member) => isLedgerGuid(member.accountId) && (scope === "all" || hasActivity(member)))
                    .map((member) => {
                      const net = round2(member.balanceDebit - member.balanceCredit);
                      return (
                        <li key={member.accountId}>
                          <button type="button" onClick={() => setSelection({ rowKey: selectedRow.key, accountId: member.accountId })}>
                            <b>{member.code}</b>
                            <span>{member.name}</span>
                            <small>{net === 0 ? "—" : `${formatAmount(Math.abs(net))} ${net > 0 ? "B" : "A"}`}</small>
                          </button>
                        </li>
                      );
                    })}
                </ul>
                <button type="button" className="secondary glmv-more" onClick={() => setSelection(null)}>
                  Kapat
                </button>
              </aside>
            ))}
        </div>
      )}
      {!data && loading && <p className="glrp-empty">Mizan hazırlanıyor…</p>}
    </LedgerReportFrame>
  );
}
