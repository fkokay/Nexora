import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api, localDateString } from "./erpApi";
import { FinanceStudioGrid } from "./FinanceStudioGrid";
import { financeGridDefaults, ledgerStatementLabels } from "./financeCatalog";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./finance-hub.css";
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

  return (
    <div className="finance-page finance-workbench-page cash-flow-page fh-page list-v2">
      <div className="page-heading list-v2-heading fh-head">
        <div className="list-v2-title">
          <h1 title="Kasa ve banka hareketlerini faaliyet sınıfı ve para birimine göre inceleyin.">
            Nakit akışı
          </h1>
          <span className="list-v2-count">
            {displayDate(from)} – {displayDate(to)}
          </span>
        </div>
        <div className="heading-actions">
          <div className="fh-periods">
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
              <>
                <label>
                  Başlangıç
                  <input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label>
                  Bitiş
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          {/* AdvancedDataGrid portals the summary grid's XLSX/CSV buttons here. */}
          <span className="list-v2-export-slot" />
        </div>
      </div>

      <div className="dd-tabs" role="tablist" aria-label="Nakit akışı bölümleri">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "summary"}
          className={`dd-tab${tab === "summary" ? " is-active" : ""}`}
          onClick={() => setTab("summary")}
        >
          Kasa ve banka özeti
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tms7"}
          className={`dd-tab${tab === "tms7" ? " is-active" : ""}`}
          onClick={() => setTab("tms7")}
        >
          TMS 7 raporu
          {missingTotal > 0 && (
            <span className="fh-tab-warn">
              <span>{missingTotal.toLocaleString("tr-TR")}</span> <span>eksik eşleme</span>
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "classification"}
          className={`dd-tab${tab === "classification" ? " is-active" : ""}`}
          onClick={() => setTab("classification")}
        >
          Hesap sınıflandırması
        </button>
      </div>

      {tab === "summary" && (
        <div className="fh-tabbody" role="tabpanel">
          <ListToolbar toolsSlotRef={setToolsSlot} onRefresh={refresh} refreshLabel="Dönemi yenile">
            {currencies.length > 1 && (
              <ListChipGroup
                label="Para birimi"
                value={currency}
                onChange={(value) => value && setCurrencyPick(value)}
                options={currencies.map((row) => ({
                  value: row.currencyCode,
                  label: row.currencyCode,
                }))}
              />
            )}
            {report && (
              <span className={`fh-state ${report.isComplete ? "is-success" : "is-warning"}`}>
                {report.isComplete ? "Kontrol edildi" : "Sınıflandırma bekliyor"}
              </span>
            )}
          </ListToolbar>
          {reportError && (
            <div className="alert inline-alert">
              {reportError}
              <button type="button" onClick={() => setReportError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <div className="fh-tiles">
            <Tile
              label="Dönem başı"
              loading={reportLoading && !report}
              value={selected ? amount(selected.openingBalance) : "—"}
              unit={selected?.currencyCode}
              hint={displayDate(from)}
            />
            <Tile
              label="Giriş"
              loading={reportLoading && !report}
              value={selected ? amount(inflow) : "—"}
              unit={selected?.currencyCode}
              hint="Pozitif net akışlar"
            />
            <Tile
              label="Çıkış"
              loading={reportLoading && !report}
              value={selected ? amount(outflow) : "—"}
              unit={selected?.currencyCode}
              hint="Negatif net akışlar"
            />
            <div className="fh-tile">
              <span className="fh-tile-label">Dönem sonu</span>
              <span className="fh-tile-value">
                {reportLoading && !report ? (
                  <small>Yükleniyor…</small>
                ) : selected ? (
                  <>
                    {amount(selected.closingBalance)} <small>{selected.currencyCode}</small>
                  </>
                ) : (
                  "—"
                )}
              </span>
              {selected && (
                <span>
                  <span className={`fh-state ${selected.reconciles ? "is-success" : "is-warning"}`}>
                    {selected.reconciles ? "Mutabık" : "Kontrol gerekli"}
                  </span>
                </span>
              )}
            </div>
          </div>

          <section className="fh-box" aria-label="Faaliyete göre net akış">
            <div className="fh-box-head">
              <h2>Faaliyete göre net akış</h2>
              {selected && (
                <small>
                  Net değişim <b>{amount(selected.netChange)}</b> {selected.currencyCode}
                </small>
              )}
            </div>
            {selected && magnitude > 0 ? (
              <>
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
              </>
            ) : (
              <p className="fh-empty">
                {reportLoading ? "Nakit akışı yükleniyor…" : "Seçilen dönemde kasa/banka hareketi yok."}
              </p>
            )}
          </section>

          {report && !report.isComplete && (
            <div className="boundary-note cash-flow-warning">
              <ShieldCheck size={16} />
              <span>
                {report.unclassifiedMovementCount} hareket henüz sınıflandırılmadı.
                Ekstre hareketleri şu an sınıflandırılmamış görünür.
              </span>
            </div>
          )}

          <div className="ledger-list cash-flow-table-wrap">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-cash-flow-report"
              defaults={financeGridDefaults["finance-cash-flow-report"]}
              toolbarContainer={toolsSlot}
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
                      <td>{amount(row.openingBalance)}</td>
                      <td>{amount(row.operating)}</td>
                      <td>{amount(row.investing)}</td>
                      <td>{amount(row.financing)}</td>
                      <td>{amount(row.internalTransfers)}</td>
                      <td>{amount(row.unclassified)}</td>
                      <td>{amount(row.openingAdjustments)}</td>
                      <td>
                        <b>{amount(row.netChange)}</b>
                      </td>
                      <td>
                        <b>{amount(row.closingBalance)}</b>
                      </td>
                      <td>
                        <span
                          className={`cash-flow-reconcile ${row.reconciles ? "matched" : "unmatched"}`}
                        >
                          {row.reconciles ? "Mutabık" : "Fark var"}
                        </span>
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
          <p className="fh-note">
            Bu görünüm kasa/banka hareketlerinden hazırlanır; yasal nakit akış tablosu değildir.
          </p>
          <Suspense fallback={null}>
            <CashForecastPanel token={token} />
          </Suspense>
        </div>
      )}

      {tab === "tms7" && (
        <div className="fh-tabbody" role="tabpanel">
          <div className="list-v2-toolbar">
            <span className="fh-muted">
              {displayDate(tms7?.from)} – {displayDate(tms7?.to)} · Baz para:{" "}
              {tms7?.baseCurrencyCode || "—"}
            </span>
            <div className="list-v2-toolbar-end">
              <span className={`fh-state ${tms7?.isComplete ? "is-success" : "is-warning"}`}>
                {tms7?.isComplete ? "Mutabakat tamam" : "Kontrol gerekli"}
              </span>
              <button
                type="button"
                className="list-v2-icon-button"
                disabled={tms7Busy}
                onClick={() => void loadTms7()}
                aria-label="Raporu yenile"
                title="Yenile"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          {tms7Error && <div className="alert inline-alert">{tms7Error}</div>}
          <p className="fh-note is-oneline" title={disclaimer}>
            {disclaimerNote} Yasal beyan veya onaylı finansal tablo değildir.
          </p>
          {!tms7 && tms7Busy && <p className="fh-empty">Rapor yükleniyor…</p>}
          {tms7 && (
            <>
              {missingTotal > 0 ? (
                <div className="fh-warn" role="status">
                  <AlertTriangle size={18} />
                  <span className="fh-warn-text">
                    <b>
                      {missingPnl} eksik P&amp;L eşlemesi · {missingBalance} eksik bilanço hesabı
                    </b>
                    <small>
                      Sınıflandırılmamış hareket: {tms7.unclassifiedMovementCount} · Eksik kur:{" "}
                      {tms7.missingFlowRateCount} · Açılış düzeltmesi: {tms7.openingAdjustmentCount}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="secondary"
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
                <div className={`fh-warn${tms7.isComplete ? " is-ok" : ""}`} role="status">
                  {tms7.isComplete ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <span className="fh-warn-text">
                    <b>Hesap eşlemeleri tamam</b>
                    <small>
                      Sınıflandırılmamış hareket: {tms7.unclassifiedMovementCount} · Eksik kur:{" "}
                      {tms7.missingFlowRateCount} · Açılış düzeltmesi: {tms7.openingAdjustmentCount}
                    </small>
                  </span>
                </div>
              )}
              <div className="finance-summary-strip tms7-summary-strip">
                <div>
                  <small>Dönem başı nakit</small>
                  <b>
                    {amount(tms7.openingCashAndCashEquivalents)} <span>{tms7.baseCurrencyCode}</span>
                  </b>
                </div>
                <div>
                  <small>İşletme nakit akışı</small>
                  <b>
                    {amount(tms7.operating.netCashFlow)} <span>{tms7.baseCurrencyCode}</span>
                  </b>
                </div>
                <div>
                  <small>Yatırım</small>
                  <b>
                    {amount(tms7.investing.netCashFlow)} <span>{tms7.baseCurrencyCode}</span>
                  </b>
                </div>
                <div>
                  <small>Finansman</small>
                  <b>
                    {amount(tms7.financing.netCashFlow)} <span>{tms7.baseCurrencyCode}</span>
                  </b>
                </div>
                <div className="closing-cash">
                  <small>Dönem sonu nakit</small>
                  <b>
                    {amount(tms7.closingCashAndCashEquivalents)} <span>{tms7.baseCurrencyCode}</span>
                  </b>
                </div>
              </div>
              <section className="fh-box">
                <div className="fh-table-wrap">
                  <table className="fh-table">
                    <thead>
                      <tr>
                        <th>Dolaylı yöntem mutabakatı</th>
                        <th className="fh-num">Tutar ({tms7.baseCurrencyCode})</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Dönem kârı / zararı</td>
                        <td className="fh-num">{amount(tms7.operating.netProfitLoss)}</td>
                      </tr>
                      <tr>
                        <td>Nakit dışı düzeltmeler</td>
                        <td className="fh-num">{amount(tms7.operating.nonCashAdjustments)}</td>
                      </tr>
                      <tr>
                        <td>İşletme sermayesi değişimi</td>
                        <td className="fh-num">{amount(tms7.operating.workingCapitalChanges)}</td>
                      </tr>
                      <tr>
                        <td>Yatırım / finansman kâr-zarar düzeltmeleri</td>
                        <td className="fh-num">
                          {amount(tms7.operating.investingFinancingPnlAdjustments)}
                        </td>
                      </tr>
                      <tr className="is-total">
                        <td>Dolaylı yöntem işletme nakdi</td>
                        <td className="fh-num">{amount(tms7.operating.netCashFlow)}</td>
                      </tr>
                      <tr>
                        <td>Nakit değişimi − sınıflandırılmış akışlar</td>
                        <td className="fh-num">{amount(tms7.reconciliation.difference)}</td>
                      </tr>
                      <tr>
                        <td>İşletme dolaylı − doğrudan karşılaştırması</td>
                        <td className="fh-num">{amount(tms7.operating.methodDifference)}</td>
                      </tr>
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
        <div className="fh-tabbody" role="tabpanel">
          <ListToolbar
            search={classQuery}
            onSearchChange={setClassQuery}
            searchLabel="Hesap ara"
            searchPlaceholder="Hesap kodu veya adı"
            onRefresh={() => void loadTms7()}
          >
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
          <p className="fh-note">
            TMS 7 hesap eşlemesini firma yöneticisi belirler. Hareketi olmayan hesaplar rapora
            dahil edilmez.
            {!isAdmin && " Sınıflandırmayı yalnızca firma yöneticisi değiştirebilir."}
          </p>
          <section className="fh-box">
            <div className="fh-table-wrap">
              <table className="fh-table">
                <thead>
                  <tr>
                    <th>Hesap</th>
                    <th>TMS 7 sınıfı</th>
                  </tr>
                </thead>
                {groupedClasses.map((group) => (
                  <tbody key={group.section}>
                    <tr className="fh-group-row">
                      <th colSpan={2}>
                        {ledgerStatementLabels[group.section]}
                        <small>{group.rows.length}</small>
                      </th>
                    </tr>
                    {group.rows.map((account) => (
                      <tr key={account.id}>
                        <td>
                          <b>{account.code}</b>
                          <small>{account.name}</small>
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
                          {missingIds.has(account.id) && (
                            <span className="fh-missing-mark">Eksik</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                {groupedClasses.length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={2} className="fh-empty">
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
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  hint,
  loading,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="fh-tile">
      <span className="fh-tile-label">{label}</span>
      <span className="fh-tile-value">
        {loading ? (
          <small>Yükleniyor…</small>
        ) : (
          <>
            {value} {unit && <small>{unit}</small>}
          </>
        )}
      </span>
      {hint && <span className="fh-tile-hint">{hint}</span>}
    </div>
  );
}
