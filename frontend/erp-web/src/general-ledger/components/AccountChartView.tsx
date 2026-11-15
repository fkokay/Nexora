import { Fragment, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, X } from "lucide-react";
import { api, localDateString } from "../../erpApi";
import type { LedgerAccount, LedgerMapping, LedgerTrialBalance } from "../../erp-types";
import { ledgerStatementLabels } from "../../financeCatalog";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListToolbar } from "../../list-page/ListToolbar";
import {
  displayAccountName,
  downloadCsv,
  downloadXlsx,
  formatAmount,
  isReverseBalance,
  round2,
  startOfYear,
  tdhpClassLabels,
  tdhpGroupLabel,
} from "../ledgerReportUtils";
import { AccountMovementsAside } from "./AccountMovementsAside";
import "../ledger-reports.css";
import "../ledger-chart.css";

/** Short chip labels of the TDHP classes; the full name is the tooltip. */
const classChipLabels: Record<string, string> = {
  "1": "Dönen varlıklar",
  "2": "Duran varlıklar",
  "3": "KVYK",
  "4": "UVYK",
  "5": "Özkaynaklar",
  "6": "Gelir tablosu",
  "7": "Maliyet",
  "8": "Serbest",
  "9": "Nazım",
};
type Ytd = { debit: number; credit: number; net: number };
const zeroYtd: Ytd = { debit: 0, credit: 0, net: 0 };
const balanceText = (net: number) => {
  const value = round2(net);
  return value === 0 ? "—" : `${formatAmount(Math.abs(value))} ${value > 0 ? "B" : "A"}`;
};
const classOf = (code: string) => code.trim().charAt(0);
const groupOf = (code: string) => code.trim().slice(0, 2);
const byCode = (a: LedgerAccount, b: LedgerAccount) =>
  a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" });

export type AccountChartActions = {
  onAdd: () => void;
  onAddChild: (parent: LedgerAccount) => void;
  onEdit: (account: LedgerAccount) => void;
  onToggle: (account: LedgerAccount) => void;
  onDelete: (account: LedgerAccount) => void;
  canDelete: (account: LedgerAccount) => boolean;
  onPreviewStandardChart: () => void;
};

/** Hesap planı (finance-ledger-chart): class › group › account tree with year-to-date balances. */
export function AccountChartView({
  token,
  role,
  accounts,
  mappings,
  busy,
  actions,
  standardChartNotice,
  onRefresh,
  onNavigate,
}: {
  token: string;
  role: string;
  accounts: LedgerAccount[];
  mappings: LedgerMapping[];
  busy: boolean;
  actions: AccountChartActions;
  /** The "Tek Düzen Hesap Planı" preview strip rendered by the page. */
  standardChartNotice?: ReactNode;
  onRefresh: () => void;
  onNavigate?: (page: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [accountClass, setAccountClass] = useState(""),
    [status, setStatus] = useState(""),
    [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(() => new Set()),
    [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set()),
    [selectedId, setSelectedId] = useState(""),
    [showMovements, setShowMovements] = useState(false),
    [ytdRows, setYtdRows] = useState<Map<string, Ytd>>(() => new Map()),
    [ytdError, setYtdError] = useState("");
  const from = startOfYear(),
    to = localDateString();
  // Year-to-date balances come from the TDHP trial balance (Jan 1 – today).
  useEffect(() => {
    const controller = new AbortController();
    setYtdError("");
    api<LedgerTrialBalance>(
      `/api/finance/general-ledger/trial-balance?${new URLSearchParams({ basis: "TDHP", from, to })}`,
      token,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setYtdRows(
          new Map(
            data.accounts.map((row) => [
              row.accountId,
              { debit: row.debit, credit: row.credit, net: row.balanceDebit - row.balanceCredit },
            ]),
          ),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setYtdError((e as Error).message);
      });
    return () => controller.abort();
    // accounts: balances are re-read after each chart reload.
  }, [token, from, to, accounts]);

  const ytdOf = (account: LedgerAccount) => ytdRows.get(account.id) || zeroYtd;
  /** An account row shows its own amounts plus every dotted sub-account below it. */
  const rolledUp = (account: LedgerAccount): Ytd => {
    const prefix = `${account.code}.`;
    return accounts
      .filter((row) => row.id === account.id || row.code.startsWith(prefix))
      .reduce(
        (sum, row) => {
          const ytd = ytdOf(row);
          return { debit: sum.debit + ytd.debit, credit: sum.credit + ytd.credit, net: sum.net + ytd.net };
        },
        { ...zeroYtd },
      );
  };
  const isMoving = (account: LedgerAccount) => {
    const ytd = ytdOf(account);
    return round2(ytd.debit) !== 0 || round2(ytd.credit) !== 0;
  };
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const searched = normalized
    ? accounts.filter((account) =>
        `${account.code} ${account.name}`.toLocaleLowerCase("tr-TR").includes(normalized),
      )
    : accounts;
  const statusFiltered = searched.filter((account) =>
    status === "moving"
      ? isMoving(account)
      : status === "active"
        ? account.isActive
        : status === "inactive"
          ? !account.isActive
          : true,
  );
  const visible = (accountClass ? statusFiltered.filter((account) => classOf(account.code) === accountClass) : statusFiltered)
    .slice()
    .sort(byCode);
  const classes = [...new Set(visible.map((account) => classOf(account.code)))].sort();
  const classChips = Object.keys(classChipLabels).filter((key) => accounts.some((account) => classOf(account.code) === key));
  const allGroupKeys = [...new Set(visible.map((account) => `${classOf(account.code)}:${groupOf(account.code)}`))];
  const everythingCollapsed = classes.length > 0 && allGroupKeys.every((key) => collapsedGroups.has(key));
  const expandedForSearch = normalized.length > 0;
  const toggleSet = (setter: typeof setCollapsedGroups, key: string) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selected = accounts.find((account) => account.id === selectedId) || null;
  const mappingUses = selected ? mappings.filter((mapping) => mapping.accountId === selected.id).length : 0;
  const isAdmin = role === "TenantAdmin";

  // Class and group balances cover every account of the class/group, whatever the filters show.
  const sumOf = (predicate: (account: LedgerAccount) => boolean) =>
    accounts.filter(predicate).reduce((total, account) => total + ytdOf(account).net, 0);
  function exportRows() {
    return [
      ["Hesap kodu", "Hesap adı", "Finansal tablo sınıfı", "Durum", "Dönem borç", "Dönem alacak", "Bakiye"],
      ...visible.map((account) => {
        const ytd = rolledUp(account);
        return [
          account.code,
          account.name,
          ledgerStatementLabels[account.statementSection] || account.statementSection,
          account.isActive ? "Aktif" : "Pasif",
          round2(ytd.debit),
          round2(ytd.credit),
          balanceText(ytd.net),
        ];
      }),
    ];
  }
  const selectRow = (account: LedgerAccount) => {
    setShowMovements(false);
    setSelectedId((current) => (current === account.id ? "" : account.id));
  };
  const rowKeyHandler = (account: LedgerAccount) => (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRow(account);
    }
  };
  const reverseIcon = (account: LedgerAccount, ytd: Ytd) =>
    isReverseBalance(
      account,
      Math.max(0, ytd.net),
      Math.max(0, -ytd.net),
      "TDHP",
      accounts.find((row) => row.code.trim() === account.code.trim().split(".")[0].slice(0, 3))?.name,
    ) ? (
      <span
        className="glrp-reverse"
        role="img"
        aria-label="Ters bakiye"
        title={ytd.net < 0 ? "Ters bakiye: varlık hesabı alacak bakiyesi veriyor." : "Ters bakiye: kaynak hesabı borç bakiyesi veriyor."}
      >
        <AlertTriangle size={13} aria-hidden="true" />
      </span>
    ) : null;

  return (
    <>
      <ListPageHeader
        title="Hesap planı"
        description="Tenant hesaplarını düzenleyin."
        count={accounts.length}
        countLabel="hesap · Tek Düzen Hesap Planı"
      >
        <button type="button" className="secondary" disabled={!accounts.length} onClick={() => void downloadXlsx("hesap-plani.xlsx", "Hesap planı", exportRows())}>
          XLSX
        </button>
        <button type="button" className="secondary" disabled={!accounts.length} onClick={() => downloadCsv("hesap-plani.csv", exportRows())}>
          CSV
        </button>
        <button type="button" className="secondary" onClick={() => onNavigate?.("finance-ledger-mappings")}>
          Hesap eşleştirmeleri
        </button>
        {isAdmin && (
          <>
            <button type="button" className="secondary" disabled={busy} onClick={actions.onPreviewStandardChart}>
              Tek Düzen Hesap Planı
            </button>
            <button type="button" className="primary" onClick={actions.onAdd}>
              Hesap ekle
            </button>
          </>
        )}
      </ListPageHeader>
      <section className="ledger-subpanel glch" aria-label="Hesap planı">
        <ListToolbar
          search={query}
          onSearchChange={setQuery}
          searchLabel="Hesap planında ara"
          searchPlaceholder="Kod veya hesap adına göre ara"
          onRefresh={onRefresh}
        >
          <div className="list-v2-chips" role="group" aria-label="Hesap sınıfı">
            <button
              type="button"
              className={`list-v2-chip${accountClass === "" ? " is-active" : ""}`}
              aria-pressed={accountClass === ""}
              onClick={() => setAccountClass("")}
            >
              <span>Tümü</span>
              <span className="list-v2-chip-count">{statusFiltered.length.toLocaleString("tr-TR")}</span>
            </button>
            {classChips.map((key) => (
              <button
                type="button"
                key={key}
                title={`${key} ${tdhpClassLabels[key]}`}
                className={`list-v2-chip${accountClass === key ? " is-active" : ""}`}
                aria-pressed={accountClass === key}
                onClick={() => setAccountClass(accountClass === key ? "" : key)}
              >
                <span>{`${key} ${classChipLabels[key]}`}</span>
                <span className="list-v2-chip-count">
                  {statusFiltered.filter((account) => classOf(account.code) === key).length.toLocaleString("tr-TR")}
                </span>
              </button>
            ))}
          </div>
        </ListToolbar>
        <div className="glrp-subbar">
          <div className="list-v2-chips" role="group" aria-label="Hesap durumu">
            {(
              [
                ["", "Tüm durumlar", searched.length],
                ["moving", "Hareketli", searched.filter(isMoving).length],
                ["active", "Aktif", searched.filter((account) => account.isActive).length],
                ["inactive", "Pasif", searched.filter((account) => !account.isActive).length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                type="button"
                key={value || "all"}
                className={`list-v2-chip${status === value ? " is-active" : ""}`}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                <span>{label}</span>
                <span className="list-v2-chip-count">{count.toLocaleString("tr-TR")}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="glch-collapse-all"
            disabled={!classes.length}
            onClick={() => {
              if (everythingCollapsed) {
                setCollapsedGroups(new Set());
                setCollapsedClasses(new Set());
              } else setCollapsedGroups(new Set(allGroupKeys));
            }}
          >
            {everythingCollapsed ? "Tümünü genişlet" : "Tümünü daralt"}
          </button>
          {ytdError && <span className="glmp-hint is-error">{`Bakiyeler yüklenemedi: ${ytdError}`}</span>}
        </div>
        {standardChartNotice}
        <div className={`glrp-layout${selected ? " has-side" : ""}`}>
          <div className="glrp-table-wrap">
            <table className="glch-table">
              <thead>
                <tr>
                  <th scope="col">Kod</th>
                  <th scope="col">Hesap</th>
                  <th scope="col">Tür</th>
                  <th scope="col">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((classKey) => {
                  const classAccounts = visible.filter((account) => classOf(account.code) === classKey);
                  const classCollapsed = !expandedForSearch && collapsedClasses.has(classKey);
                  const groups = [...new Set(classAccounts.map((account) => groupOf(account.code)))];
                  const classAccount = classAccounts.find((account) => account.code.trim() === classKey);
                  return (
                    <Fragment key={classKey}>
                      <tr className="glch-class-row">
                        <th scope="rowgroup" colSpan={3}>
                          <button
                            type="button"
                            aria-expanded={!classCollapsed}
                            onClick={() => toggleSet(setCollapsedClasses, classKey)}
                          >
                            {classCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                            {`${classKey} ${tdhpClassLabels[classKey] || classAccount?.name || "Diğer"}`}
                          </button>
                        </th>
                        <td>{balanceText(sumOf((account) => classOf(account.code) === classKey))}</td>
                      </tr>
                      {!classCollapsed &&
                        groups.map((group) => {
                          const groupKey = `${classKey}:${group}`;
                          const groupAccounts = classAccounts.filter((account) => groupOf(account.code) === group);
                          const groupAccount = groupAccounts.find((account) => account.code.trim() === group);
                          const groupCollapsed = !expandedForSearch && collapsedGroups.has(groupKey);
                          const rows = groupAccounts.filter((account) => account !== groupAccount && account.code.trim() !== classKey);
                          return (
                            <Fragment key={groupKey}>
                              <tr
                                className={`glch-group-row${groupAccount && selectedId === groupAccount.id ? " is-selected" : ""}`}
                              >
                                <td>
                                  <button
                                    type="button"
                                    className="glch-toggle"
                                    aria-expanded={!groupCollapsed}
                                    aria-label={`${group} grubunu ${groupCollapsed ? "göster" : "gizle"}`}
                                    onClick={() => toggleSet(setCollapsedGroups, groupKey)}
                                  >
                                    {groupCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                                  </button>
                                  <b>{group}</b>
                                </td>
                                <td
                                  className={groupAccount ? "is-clickable" : undefined}
                                  onClick={groupAccount ? () => selectRow(groupAccount) : undefined}
                                  title={groupAccount?.name}
                                >
                                  {groupAccount ? displayAccountName(groupAccount.name) : tdhpGroupLabel(group)}
                                  {groupCollapsed && rows.length > 0 && <small>{` · ${rows.length} hesap`}</small>}
                                </td>
                                <td />
                                <td>{balanceText(sumOf((account) => classOf(account.code) === classKey && groupOf(account.code) === group))}</td>
                              </tr>
                              {!groupCollapsed &&
                                rows.map((account) => {
                                  const ytd = rolledUp(account);
                                  const depth = account.code.split(".").length - 1;
                                  const isSelected = selectedId === account.id;
                                  return (
                                    <tr
                                      key={account.id}
                                      className={`glch-row${isSelected ? " is-selected" : ""}${account.isActive ? "" : " is-inactive"}`}
                                      tabIndex={0}
                                      aria-current={isSelected || undefined}
                                      onClick={() => selectRow(account)}
                                      onKeyDown={rowKeyHandler(account)}
                                    >
                                      <td className="glch-code" style={{ paddingLeft: 34 + depth * 16 }}>
                                        {account.code}
                                      </td>
                                      <td className="glch-name" title={account.name}>
                                        {displayAccountName(account.name)}
                                        {!account.isActive && <small> · Pasif</small>}
                                      </td>
                                      <td className="glch-type">{ledgerStatementLabels[account.statementSection] || account.statementSection}</td>
                                      <td className="glch-balance">
                                        {balanceText(ytd.net)}
                                        {reverseIcon(account, ytd)}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="glrp-empty">
                      {normalized || status || accountClass ? "Aramayla eşleşen hesap bulunamadı." : "Tenant hesabı eklenmedi."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selected &&
            (showMovements ? (
              <AccountMovementsAside
                token={token}
                accountId={selected.id}
                code={selected.code}
                name={displayAccountName(selected.name)}
                from={from}
                to={to}
                onClose={() => setShowMovements(false)}
              />
            ) : (
              <aside className="glmv glch-side" aria-label="Seçili hesap">
                <div className="list-v2-detail-head">
                  <div>
                    <span className="list-v2-kind">{selected.isActive ? "Seçili hesap" : "Seçili hesap · Pasif"}</span>
                    <h2 title={selected.name}>{`${selected.code} · ${displayAccountName(selected.name)}`}</h2>
                    <span className="glmv-meta">
                      {[
                        tdhpClassLabels[classOf(selected.code)] ? `${classOf(selected.code)} ${tdhpClassLabels[classOf(selected.code)]}` : "",
                        selected.code.trim().length > 1 ? `${groupOf(selected.code)} ${tdhpGroupLabel(groupOf(selected.code))}` : "",
                      ]
                        .filter(Boolean)
                        .join(" › ")}
                      {` · ${ledgerStatementLabels[selected.statementSection] || selected.statementSection}`}
                    </span>
                  </div>
                  <div className="list-v2-detail-head-actions">
                    <button type="button" className="icon-button" aria-label="Kapat" title="Kapat" onClick={() => setSelectedId("")}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
                {(() => {
                  const ytd = rolledUp(selected);
                  return (
                    <dl className="glmv-summary">
                      <div>
                        <dt>Dönem borç</dt>
                        <dd>{formatAmount(ytd.debit)}</dd>
                      </div>
                      <div>
                        <dt>Dönem alacak</dt>
                        <dd>{formatAmount(ytd.credit)}</dd>
                      </div>
                      <div>
                        <dt>Bakiye</dt>
                        <dd>
                          {balanceText(ytd.net)}
                          {reverseIcon(selected, ytd)}
                        </dd>
                      </div>
                      <div>
                        <dt>Eşleştirmeler</dt>
                        <dd>{`Eşleştirmelerde ${mappingUses} kullanım`}</dd>
                      </div>
                    </dl>
                  );
                })()}
                <dl className="glch-facts">
                  {selected.normalBalance && (
                    <div>
                      <dt>Çalışma şekli</dt>
                      <dd>
                        {selected.normalBalance === "Debit"
                          ? "Borç çalışır"
                          : selected.normalBalance === "Credit"
                            ? "Alacak çalışır"
                            : "Çift çalışır"}
                      </dd>
                    </div>
                  )}
                  {selected.currencyCode && (
                    <div>
                      <dt>Döviz takibi</dt>
                      <dd>{selected.currencyCode}</dd>
                    </div>
                  )}
                  {selected.ifrsAccountCode && (
                    <div>
                      <dt>IFRS / UFRS hesabı</dt>
                      <dd>{`${selected.ifrsAccountCode}${selected.ifrsAccountName ? ` · ${selected.ifrsAccountName}` : ""}`}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Hareket</dt>
                    <dd>{selected.hasMovements ? "Hareket var" : "Hareket yok"}</dd>
                  </div>
                </dl>
                <div className="glch-actions">
                  <button type="button" className="secondary" onClick={() => setShowMovements(true)}>
                    Hareketleri gör
                  </button>
                  {isAdmin && (
                    <>
                      <button type="button" className="secondary" disabled={busy} onClick={() => actions.onEdit(selected)}>
                        Düzenle
                      </button>
                      {selected.isActive && (
                        <button type="button" className="secondary" disabled={busy} onClick={() => actions.onAddChild(selected)}>
                          Alt hesap
                        </button>
                      )}
                      <button type="button" className="secondary" disabled={busy} onClick={() => actions.onToggle(selected)}>
                        {selected.isActive ? "Pasifleştir" : "Etkinleştir"}
                      </button>
                      {actions.canDelete(selected) && (
                        <button type="button" className="secondary is-danger" disabled={busy} onClick={() => actions.onDelete(selected)}>
                          Sil
                        </button>
                      )}
                    </>
                  )}
                </div>
              </aside>
            ))}
        </div>
      </section>
    </>
  );
}
