import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { api, localDateString } from "./erpApi";
import { FinanceStudioGrid } from "./FinanceStudioGrid";
import { financeGridDefaults, ledgerStatementLabels } from "./financeCatalog";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import { StatusTag } from "./list-page/StatusTag";
import { LedgerReportFrame, ReportParam } from "./general-ledger/components/LedgerReportFrame";
import { downloadCsv, downloadXlsx, type ExportCell } from "./general-ledger/ledgerReportUtils";
import "./list-page/list-page-v2.css";
import "./finance-hub.css";
import "./finance/finance-reports.css";
import type { CashFlowReport, LedgerAccount, LedgerStatementSection } from "./erp-types";
import {
  tms7Allowed,
  tms7Labels,
  type Tms7Account,
  type Tms7Report,
} from "./Tms7CashFlowPage";

const CashForecastPanel = lazy(() => import("./CashForecastPanel"));
const StatutoryCashFlowStatementPanel = lazy(
  () => import("./StatutoryCashFlowStatementPanel"),
);

type Tab = "summary" | "tms7" | "classification";
type Period = "year" | "month" | "custom";
type ClassFilter = "moved" | "missing" | "all";

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const displayDate = (value?: string) => (value ? value.split("-").reverse().join(".") : "");

/** Net flow categories of the kasa/banka summary, in the order of the stacked bar. */
const flowParts = [
  { key: "operating", label: "İşletme", color: "fh-c1" },
  { key: "investing", label: "Yatırım", color: "fh-c2" },
  { key: "financing", label: "Finansman", color: "fh-c3" },
  { key: "internalTransfers", label: "İç transfer", color: "fh-c4" },
  { key: "unclassified", label: "Sınıflandırılmamış", color: "fh-c5" },
  { key: "openingAdjustments", label: "Açılış düzeltmesi", color: "fh-c6" },
] as const;

const sectionOrder: LedgerStatementSection[] = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Expense",
  "Unclassified",
];

export default function CashFlowPage({ token, role }: { token: string; role: string }) {
  const today = localDateString();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 8)}01`;
  const isAdmin = role === "TenantAdmin";

  const [tab, setTab] = useState<Tab>("summary");
  const [period, setPeriod] = useState<Period>("year");
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);

  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [currencyPick, setCurrencyPick] = useState("");
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  const [tms7, setTms7] = useState<Tms7Report | null>(null);
  const [classes, setClasses] = useState<Tms7Account[]>([]);
  const [tms7Busy, setTms7Busy] = useState(false);
  const [tms7Error, setTms7Error] = useState("");
  const [movedIds, setMovedIds] = useState<Set<string> | null>(null);

  const [classFilter, setClassFilter] = useState<ClassFilter>("moved");
  const [classQuery, setClassQuery] = useState("");

  function choosePeriod(next: string) {
    const value = (next || "year") as Period;
    setPeriod(value);
    if (value === "year") {
      setFrom(yearStart);
      setTo(today);
    } else if (value === "month") {
      setFrom(monthStart);
      setTo(today);
    }
  }

  async function loadReport() {
    setReportLoading(true);
    setReportError("");
    try {
      const params = new URLSearchParams({ from, to });
      setReport(
        await api<CashFlowReport>(
          `/api/finance/general-ledger/financial-statements/cash-flow?${params}`,
          token,
        ),
      );
    } catch (e) {
      setReportError((e as Error).message);
    } finally {
      setReportLoading(false);
    }
  }

  async function loadTms7() {
    setTms7Busy(true);
    setTms7Error("");
    try {
      const params = new URLSearchParams({ from, to });
      const [rows, data] = await Promise.all([
        api<Tms7Account[]>(
          "/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications",
          token,
        ),
        api<Tms7Report>(
          `/api/finance/general-ledger/financial-statements/tms7/cash-flow?${params}`,
          token,
        ),
      ]);
      setClasses(rows);
      setTms7(data);
    } catch (e) {
      setTms7Error((e as Error).message);
    } finally {
      setTms7Busy(false);
    }
  }

  useEffect(() => {
    if (!from || !to || from > to) return;
    void loadReport();
    void loadTms7();
  }, [token, from, to]);

  // Which ledger accounts ever had a journal line ("Yalnız hareketi olanlar" filter).
  useEffect(() => {
    let cancelled = false;
    api<LedgerAccount[]>("/api/finance/general-ledger/accounts", token)
      .then((rows) => {
        if (!cancelled)
          setMovedIds(new Set(rows.filter((row) => row.hasMovements).map((row) => row.id)));
      })
      .catch(() => {
        if (!cancelled) {
          setMovedIds(null);
          setClassFilter((current) => (current === "moved" ? "all" : current));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function classify(account: Tms7Account, classification: string) {
    setTms7Busy(true);
    setTms7Error("");
    try {
      await api(
        `/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications/${account.id}`,
        token,
        { method: "PUT", body: JSON.stringify({ classification }) },
      );
      await loadTms7();
    } catch (e) {
      setTms7Error((e as Error).message);
      setTms7Busy(false);
    }
  }

  // Summary: the selected currency defaults to the tenant base currency.
  const currencies = report?.currencies ?? [];
  const baseCurrency = tms7?.baseCurrencyCode ?? "";
  // User pick, else the base currency, else the first currency of the report.
  const selected =
    currencies.find((row) => row.currencyCode === currencyPick) ??
    currencies.find((row) => row.currencyCode === baseCurrency) ??
    currencies[0] ??
    null;
  const currency = selected?.currencyCode ?? "";
  const flows = selected
    ? flowParts.map((part) => ({ ...part, value: selected[part.key] }))
    : [];
  const inflow = flows.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const outflow = flows.reduce((sum, part) => sum + Math.min(0, part.value), 0);
  const magnitude = flows.reduce((sum, part) => sum + Math.abs(part.value), 0);

  // TMS 7: missing P&L mappings + balance-sheet accounts without a class.
  const missingPnl = tms7?.pAndLUnclassifiedAccountCount ?? 0;
  const missingBalance = tms7?.unclassifiedBalanceAccounts.length ?? 0;
  const missingTotal = missingPnl + missingBalance;

  const missingIds = useMemo(() => {
    const balanceCodes = new Set(tms7?.unclassifiedBalanceAccounts ?? []);
    return new Set(
      classes
        .filter(
          (account) =>
            balanceCodes.has(account.code) ||
            ((account.statementSection === "Revenue" ||
              account.statementSection === "Expense") &&
              account.classification === "Unclassified" &&
              (movedIds ? movedIds.has(account.id) : true)),
        )
        .map((account) => account.id),
    );
  }, [classes, tms7, movedIds]);

  const normalizedQuery = classQuery.trim().toLocaleLowerCase("tr-TR");
  const filteredClasses = classes.filter((account) => {
    if (classFilter === "moved" && movedIds && !movedIds.has(account.id)) return false;
    if (classFilter === "missing" && !missingIds.has(account.id)) return false;
    return (
      !normalizedQuery ||
      `${account.code} ${account.name}`.toLocaleLowerCase("tr-TR").includes(normalizedQuery)
    );
  });
  const groupedClasses = sectionOrder
    .map((section) => ({
      section,
      rows: filteredClasses.filter(
        (account) =>
          (sectionOrder.includes(account.statementSection as LedgerStatementSection)
            ? account.statementSection
            : "Unclassified") === section,
      ),
    }))
    .filter((group) => group.rows.length > 0);

  const disclaimerNote =
    tms7?.note || "Taslak TMS 7 görünümüdür. Hesap eşlemesi ve rapor mutabakatı gerektirir.";
  const disclaimer = `${disclaimerNote} Yasal beyan veya onaylı finansal tablo değildir.`;

  function refresh() {
    void loadReport();
    void loadTms7();
  }

  /** F9 / Yenile: the summary tab reloads both reports, the other tabs only TMS 7 (as before). */
  function run() {
    if (tab === "summary") refresh();
    else void loadTms7();
  }

  function exportRows(): ExportCell[][] {
    if (tab === "summary")
      return [
        ["Döviz", "Dönem başı", "İşletme", "Yatırım", "Finansman", "İç transfer", "Sınıflandırılmamış", "Açılış düzeltmesi", "Net değişim", "Dönem sonu", "Kontrol"],
        ...currencies.map((row) => [
          row.currencyCode, row.openingBalance, row.operating, row.investing, row.financing, row.internalTransfers,
          row.unclassified, row.openingAdjustments, row.netChange, row.closingBalance, row.reconciles ? "Mutabık" : "Fark var",
        ]),
      ];
    if (tab === "tms7")
      return [
        ["Dolaylı yöntem mutabakatı", `Tutar (${tms7?.baseCurrencyCode ?? ""})`],
        ...reconciliationRows.map((row) => [row.label, row.value]),
      ];
    return [
      ["Hesap kodu", "Hesap adı", "Bölüm", "TMS 7 sınıfı", "Eksik"],
      ...filteredClasses.map((account) => [
        account.code, account.name, ledgerStatementLabels[account.statementSection as LedgerStatementSection] ?? account.statementSection,
        tms7Labels[account.classification] ?? account.classification, missingIds.has(account.id) ? "Eksik" : "",
      ]),
    ];
  }
  const exportReady = tab === "summary" ? Boolean(report) : tab === "tms7" ? Boolean(tms7) : classes.length > 0;
  const fileBase = `nakit-akisi-${tab === "summary" ? "ozet" : tab === "tms7" ? "tms7" : "siniflandirma"}-${from}-${to}`;
  const sheetName = tab === "summary" ? "Nakit akışı" : tab === "tms7" ? "TMS 7" : "Sınıflandırma";

  const reconciliationRows = tms7
    ? [
        { label: "Dönem kârı / zararı", value: tms7.operating.netProfitLoss },
        { label: "Nakit dışı düzeltmeler", value: tms7.operating.nonCashAdjustments },
        { label: "İşletme sermayesi değişimi", value: tms7.operating.workingCapitalChanges },
        { label: "Yatırım / finansman kâr-zarar düzeltmeleri", value: tms7.operating.investingFinancingPnlAdjustments },
        { label: "Dolaylı yöntem işletme nakdi", value: tms7.operating.netCashFlow, total: true },
        { label: "Nakit değişimi − sınıflandırılmış akışlar", value: tms7.reconciliation.difference },
        { label: "İşletme dolaylı − doğrudan karşılaştırması", value: tms7.operating.methodDifference },
      ]
    : [];
  const busy = tab === "summary" ? reportLoading : tms7Busy;

  return (
    <div className="finance-page cash-flow-page fh-page list-v2 ledger-report-host">
      <LedgerReportFrame
        className="cf-report"
        title="Nakit akışı"
        description="Kasa ve banka hareketlerini faaliyet sınıfı ve para birimine göre inceleyin."
        count={null}
        countLabel=""
        onRun={run}
        onExportXlsx={() => void downloadXlsx(`${fileBase}.xlsx`, sheetName, exportRows())}
        onExportCsv={() => downloadCsv(`${fileBase}.csv`, exportRows())}
        exportDisabledReason={exportReady ? undefined : "Rapor henüz hazır değil"}
        summary={[
          <>
            <span>Dönem:</span> <b>{displayDate(from)} – {displayDate(to)}</b>
          </>,
          <>
            <span>Baz para:</span> <b>{baseCurrency || "—"}</b>
          </>,
          ...(busy ? [<span className="glrp-loading">Yükleniyor…</span>] : []),
        ]}
        params={
          <ReportParam label="Dönem">
            <ListChipGroup
              label="Dönem"
              value={period}
              onChange={choosePeriod}
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
                  <input type="date" aria-label="Başlangıç" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
                </label>
                <label className="list-v2-filter">
                  <span>Bitiş</span>
                  <input type="date" aria-label="Bitiş" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
                </label>
              </div>
            )}
          </ReportParam>
        }
      >
        <div className="list-v2-tabs fh-tabs" role="tablist" aria-label="Nakit akışı bölümleri">
          <button type="button" role="tab" aria-selected={tab === "summary"} className={tab === "summary" ? "is-active" : undefined} onClick={() => setTab("summary")}>
            Kasa ve banka özeti
          </button>
          <button type="button" role="tab" aria-selected={tab === "tms7"} className={tab === "tms7" ? "is-active" : undefined} onClick={() => setTab("tms7")}>
            TMS 7 raporu
            {missingTotal > 0 && (
              <StatusTag tone="warn">
                <span>{missingTotal.toLocaleString("tr-TR")}</span> <span>eksik eşleme</span>
              </StatusTag>
            )}
          </button>
          <button type="button" role="tab" aria-selected={tab === "classification"} className={tab === "classification" ? "is-active" : undefined} onClick={() => setTab("classification")}>
            Hesap sınıflandırması
          </button>
        </div>

        {tab === "summary" && (
          <div className="cf-tabbody" role="tabpanel" aria-label="Kasa ve banka özeti">
            <ListToolbar>
              {currencies.length > 1 && (
                <ListChipGroup
                  label="Para birimi"
                  value={currency}
                  onChange={(value) => value && setCurrencyPick(value)}
                  options={currencies.map((row) => ({ value: row.currencyCode, label: row.currencyCode }))}
                />
              )}
              {report && (
                <StatusTag tone={report.isComplete ? "ok" : "warn"}>
                  {report.isComplete ? "Kontrol edildi" : "Sınıflandırma bekliyor"}
                </StatusTag>
              )}
            </ListToolbar>
            {reportError && (
              <div className="alert inline-alert">
                {reportError}
                <button type="button" onClick={() => setReportError("")} aria-label="Kapat">
                  <X size={15} />
                </button>
              </div>
            )}
            {report && !report.isComplete && (
              <div className="glrp-warning" role="status">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  {report.unclassifiedMovementCount} hareket henüz sınıflandırılmadı. Ekstre hareketleri şu an
                  sınıflandırılmamış görünür.
                </span>
              </div>
            )}

            <section className="glrp-card cf-flow" aria-label="Faaliyete göre net akış">
              <div className="cf-card-head">
                <h2>Faaliyete göre net akış</h2>
                {selected && (
                  <span className="cf-card-sub">
                    {selected.currencyCode} ·{" "}
                    <StatusTag tone={selected.reconciles ? "ok" : "warn"}>
                      {selected.reconciles ? "Mutabık" : "Kontrol gerekli"}
                    </StatusTag>
                  </span>
                )}
              </div>
              <dl className="cf-figures">
                <Figure label="Dönem başı" hint={displayDate(from)} value={selected?.openingBalance} loading={reportLoading && !report} />
                <Figure label="Giriş" hint="Pozitif net akışlar" value={selected ? inflow : undefined} loading={reportLoading && !report} />
                <Figure label="Çıkış" hint="Negatif net akışlar" value={selected ? outflow : undefined} loading={reportLoading && !report} />
                <Figure label="Net değişim" value={selected?.netChange} loading={reportLoading && !report} />
                <Figure label="Dönem sonu" hint={displayDate(to)} value={selected?.closingBalance} loading={reportLoading && !report} />
              </dl>
              {selected && magnitude > 0 ? (
                <div className="cf-flow-body">
                  <div className="fh-flowbar" aria-hidden="true">
                    {flows
                      .filter((part) => part.value !== 0)
                      .map((part) => (
                        <i
                          key={part.key}
                          className={part.color}
                          style={{ width: `${(Math.abs(part.value) / magnitude) * 100}%` }}
                          title={`${part.label}: ${amount(part.value)}`}
                        />
                      ))}
                  </div>
                  <ul className="fh-legend">
                    {flows.map((part) => (
                      <li key={part.key} className={part.value < 0 ? "is-negative" : undefined}>
                        <i className={part.color} aria-hidden="true" />
                        <span>{part.label}</span>
                        <b>{amount(part.value)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="glrp-empty">
                  {reportLoading ? "Nakit akışı yükleniyor…" : "Seçilen dönemde kasa/banka hareketi yok."}
                </p>
              )}
            </section>

            <section className="glrp-card cf-grid" aria-label="Para birimine göre nakit akışı">
              <div className="cf-card-head">
                <h2>Para birimine göre</h2>
                <div className="cf-card-tools" ref={setToolsSlot} />
              </div>
              <div className="ledger-list cash-flow-table-wrap">
                <FinanceStudioGrid
                  token={token}
                  screenKey="finance-cash-flow-report"
                  defaults={financeGridDefaults["finance-cash-flow-report"]}
                  toolbarContainer={toolsSlot}
                  enableRowSelection={false}
                  externalPagination
                  hideSearch
                  hideExport
                >
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th>Döviz</th>
                        <th>Dönem başı</th>
                        <th>İşletme</th>
                        <th>Yatırım</th>
                        <th>Finansman</th>
                        <th>İç transfer</th>
                        <th>Sınıflandırılmamış</th>
                        <th>Açılış düzeltmesi</th>
                        <th>Net değişim</th>
                        <th>Dönem sonu</th>
                        <th>Kontrol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currencies.map((row) => (
                        <tr key={row.currencyCode}>
                          <td>
                            <span className="cash-flow-currency">{row.currencyCode}</span>
                          </td>
                          <td className="num">{amount(row.openingBalance)}</td>
                          <td className="num">{amount(row.operating)}</td>
                          <td className="num">{amount(row.investing)}</td>
                          <td className="num">{amount(row.financing)}</td>
                          <td className="num">{amount(row.internalTransfers)}</td>
                          <td className="num">{amount(row.unclassified)}</td>
                          <td className="num">{amount(row.openingAdjustments)}</td>
                          <td className="num">{amount(row.netChange)}</td>
                          <td className="num">{amount(row.closingBalance)}</td>
                          <td>
                            <StatusTag tone={row.reconciles ? "ok" : "warn"}>{row.reconciles ? "Mutabık" : "Fark var"}</StatusTag>
                          </td>
                        </tr>
                      ))}
                      {reportLoading && (
                        <tr>
                          <td colSpan={11} className="table-empty" role="status">
                            Nakit akışı yükleniyor…
                          </td>
                        </tr>
                      )}
                      {!reportLoading && report?.currencies.length === 0 && (
                        <tr>
                          <td colSpan={11} className="table-empty">
                            Seçilen dönemde kasa/banka hareketi yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </FinanceStudioGrid>
              </div>
            </section>
            <p className="glrp-note">Bu görünüm kasa/banka hareketlerinden hazırlanır; yasal nakit akış tablosu değildir.</p>
            <Suspense fallback={null}>
              <CashForecastPanel token={token} />
            </Suspense>
          </div>
        )}

        {tab === "tms7" && (
          <div className="cf-tabbody" role="tabpanel" aria-label="TMS 7 raporu">
            <div className="cf-subbar">
              <span>
                {displayDate(tms7?.from)} – {displayDate(tms7?.to)} · Baz para: {tms7?.baseCurrencyCode || "—"}
              </span>
              <StatusTag tone={tms7?.isComplete ? "ok" : "warn"}>{tms7?.isComplete ? "Mutabakat tamam" : "Kontrol gerekli"}</StatusTag>
            </div>
            {tms7Error && <div className="alert inline-alert">{tms7Error}</div>}
            <p className="glrp-note cf-oneline" title={disclaimer}>
              {disclaimerNote} Yasal beyan veya onaylı finansal tablo değildir.
            </p>
            {!tms7 && tms7Busy && <p className="glrp-empty">Rapor yükleniyor…</p>}
            {tms7 && (
              <>
                {missingTotal > 0 ? (
                  <div className="glrp-warning cf-action-note" role="status">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span className="cf-note-text">
                      <b>
                        {missingPnl} eksik P&amp;L eşlemesi · {missingBalance} eksik bilanço hesabı
                      </b>
                      <small>
                        Sınıflandırılmamış hareket: {tms7.unclassifiedMovementCount} · Eksik kur: {tms7.missingFlowRateCount} ·
                        Açılış düzeltmesi: {tms7.openingAdjustmentCount}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="cf-note-button"
                      onClick={() => {
                        setClassFilter("missing");
                        setClassQuery("");
                        setTab("classification");
                      }}
                    >
                      Sınıflandırmayı tamamla
                    </button>
                  </div>
                ) : (
                  <div className={`glrp-check ${tms7.isComplete ? "is-ok" : "is-bad"}`} role="status">
                    {tms7.isComplete ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                    <span className="cf-note-text">
                      <b>Hesap eşlemeleri tamam</b>
                      <small>
                        Sınıflandırılmamış hareket: {tms7.unclassifiedMovementCount} · Eksik kur: {tms7.missingFlowRateCount} ·
                        Açılış düzeltmesi: {tms7.openingAdjustmentCount}
                      </small>
                    </span>
                  </div>
                )}
                <section className="glrp-card" aria-label="TMS 7 özeti">
                  <dl className="cf-figures">
                    <Figure label="Dönem başı nakit" value={tms7.openingCashAndCashEquivalents} unit={tms7.baseCurrencyCode} />
                    <Figure label="İşletme nakit akışı" value={tms7.operating.netCashFlow} unit={tms7.baseCurrencyCode} />
                    <Figure label="Yatırım" value={tms7.investing.netCashFlow} unit={tms7.baseCurrencyCode} />
                    <Figure label="Finansman" value={tms7.financing.netCashFlow} unit={tms7.baseCurrencyCode} />
                    <Figure label="Dönem sonu nakit" value={tms7.closingCashAndCashEquivalents} unit={tms7.baseCurrencyCode} />
                  </dl>
                  <div className="glrp-table-wrap">
                    <table className="glrp-table">
                      <thead>
                        <tr>
                          <th>Dolaylı yöntem mutabakatı</th>
                          <th className="num">Tutar ({tms7.baseCurrencyCode})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliationRows.map((row) => (
                          <tr key={row.label} className={row.total ? "glrp-total-row" : undefined}>
                            <td>{row.label}</td>
                            <td className="num">{amount(row.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
            <Suspense fallback={null}>
              <StatutoryCashFlowStatementPanel token={token} from={from} to={to} />
            </Suspense>
          </div>
        )}

        {tab === "classification" && (
          <div className="cf-tabbody" role="tabpanel" aria-label="Hesap sınıflandırması">
            <ListToolbar search={classQuery} onSearchChange={setClassQuery} searchLabel="Hesap ara" searchPlaceholder="Hesap kodu veya adı">
              <ListChipGroup
                label="Hesap filtresi"
                value={classFilter}
                onChange={(value) => value && setClassFilter(value as ClassFilter)}
                options={[
                  ...(movedIds
                    ? [
                        {
                          value: "moved",
                          label: "Yalnız hareketi olanlar",
                          count: classes.filter((account) => movedIds.has(account.id)).length,
                        },
                      ]
                    : []),
                  { value: "missing", label: "Eksikler", count: missingIds.size },
                  { value: "all", label: "Tümü", count: classes.length },
                ]}
              />
            </ListToolbar>
            {tms7Error && <div className="alert inline-alert">{tms7Error}</div>}
            <p className="glrp-note cf-note-top">
              TMS 7 hesap eşlemesini firma yöneticisi belirler. Hareketi olmayan hesaplar rapora dahil edilmez.
              {!isAdmin && " Sınıflandırmayı yalnızca firma yöneticisi değiştirebilir."}
            </p>
            <section className="glrp-card" aria-label="TMS 7 hesap sınıfları">
              <div className="glrp-table-wrap">
                <table className="glrp-table cf-class-table">
                  <thead>
                    <tr>
                      <th>Hesap</th>
                      <th>TMS 7 sınıfı</th>
                    </tr>
                  </thead>
                  {groupedClasses.map((group) => (
                    <tbody key={group.section}>
                      <tr className="glrp-group-row">
                        <th colSpan={2}>
                          {ledgerStatementLabels[group.section]} <small>{group.rows.length}</small>
                        </th>
                      </tr>
                      {group.rows.map((account) => (
                        <tr key={account.id}>
                          <td>
                            <span className="cf-code">{account.code}</span> {account.name}
                          </td>
                          <td>
                            <select
                              aria-label={`${account.code} TMS 7 sınıfı`}
                              value={account.classification}
                              disabled={tms7Busy || !isAdmin}
                              onChange={(e) => void classify(account, e.target.value)}
                            >
                              {tms7Allowed(account.statementSection).map((value) => (
                                <option key={value} value={value}>
                                  {tms7Labels[value]}
                                </option>
                              ))}
                            </select>{" "}
                            {missingIds.has(account.id) && <StatusTag tone="warn">Eksik</StatusTag>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                  {groupedClasses.length === 0 && (
                    <tbody>
                      <tr>
                        <td colSpan={2} className="glrp-empty">
                          {tms7Busy && !classes.length
                            ? "Hesaplar yükleniyor…"
                            : classFilter === "missing"
                              ? "Eksik sınıflandırma yok."
                              : "Hesap bulunamadı."}
                        </td>
                      </tr>
                    </tbody>
                  )}
                </table>
              </div>
            </section>
          </div>
        )}
      </LedgerReportFrame>
    </div>
  );
}

/** One key figure of a report card (label, tabular amount, small hint). */
function Figure({
  label,
  value,
  unit,
  hint,
  loading,
}: {
  label: string;
  value: number | undefined;
  unit?: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="cf-figure">
      <dt>{label}</dt>
      <dd>
        {loading ? <small>Yükleniyor…</small> : value === undefined ? "—" : <>{amount(value)}{unit && <small> {unit}</small>}</>}
      </dd>
      {hint && <dd className="cf-figure-hint">{hint}</dd>}
    </div>
  );
}
