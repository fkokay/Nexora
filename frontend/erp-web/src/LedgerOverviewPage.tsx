import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { FinancePage } from "./FinancePages";
import { api, localDateString } from "./erpApi";
import { AccountingRuleProfilesPanel } from "./general-ledger/AccountingRuleProfilesPanel";
import { journalSourceTypeLabel } from "./general-ledger/sourceTypeLabels";
import type {
  FinancePageKey,
  JournalEntrySummary,
  LedgerAccount,
  LedgerMapping,
  LedgerSource,
  LedgerTrialBalance,
} from "./erp-types";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./finance-hub.css";

export default function LedgerOverviewPage({
  token,
  role,
  section = "finance-ledger",
  onNavigate,
}: {
  token: string;
  role: string;
  section?: FinancePageKey;
  onNavigate?: (page: string) => void;
}) {
  // Only the hub is redesigned here; the other ledger pages keep their own screens.
  if (section !== "finance-ledger")
    return <FinancePage token={token} role={role} section={section} onNavigate={onNavigate} />;
  return <LedgerOverview token={token} onNavigate={onNavigate} />;
}

/** Result of one tile request: loading (undefined), failed (Error) or data. */
type Slot<T> = T | Error | undefined;
const isReady = <T,>(slot: Slot<T>): slot is T => slot !== undefined && !(slot instanceof Error);

type EntryPage = { items: JournalEntrySummary[]; page: number; pageSize: number; total: number };
type SourcesResponse = { baseCurrencyCode?: string } & Record<string, unknown>;
type Tms7Summary = { pAndLUnclassifiedAccountCount: number; unclassifiedBalanceAccounts: string[] };

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const displayDate = (value: string) => value.split("-").reverse().join(".");
/** Long voucher codes keep their start and end: "YF-2026-…000123". */
const shortCode = (code: string) => (code.length > 16 ? `${code.slice(0, 8)}…${code.slice(-6)}` : code);

function LedgerOverview({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate?: (page: string) => void;
}) {
  const go = (page: string) => onNavigate?.(page);
  const today = localDateString();
  const year = today.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const monthStart = `${today.slice(0, 8)}01`;

  const [tab, setTab] = useState<"summary" | "profiles">("summary");
  const [monthEntries, setMonthEntries] = useState<Slot<EntryPage>>();
  const [recentEntries, setRecentEntries] = useState<Slot<EntryPage>>();
  const [sources, setSources] = useState<Slot<SourcesResponse>>();
  const [trial, setTrial] = useState<Slot<LedgerTrialBalance>>();
  const [accounts, setAccounts] = useState<Slot<LedgerAccount[]>>();
  const [mappings, setMappings] = useState<Slot<LedgerMapping[]>>();
  const [profiles, setProfiles] = useState<Slot<unknown[]>>();
  const [tms7, setTms7] = useState<Slot<Tms7Summary>>();
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  function fetchInto<T>(url: string, set: (value: Slot<T>) => void, isCancelled: () => boolean) {
    api<T>(url, token)
      .then((value) => {
        if (!isCancelled()) set(value);
      })
      .catch((e) => {
        if (!isCancelled()) set(e instanceof Error ? e : new Error(String(e)));
      });
  }

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    const month = new URLSearchParams({ from: monthStart, to: today, page: "1", pageSize: "100" });
    fetchInto<EntryPage>(`/api/finance/general-ledger/entries?${month}`, setMonthEntries, isCancelled);
    fetchInto<EntryPage>(
      "/api/finance/general-ledger/entries?page=1&pageSize=5",
      setRecentEntries,
      isCancelled,
    );
    fetchInto<SourcesResponse>("/api/finance/general-ledger/sources", setSources, isCancelled);
    const trialParams = new URLSearchParams({ basis: "TDHP", from: yearStart, to: today });
    fetchInto<LedgerTrialBalance>(
      `/api/finance/general-ledger/trial-balance?${trialParams}`,
      setTrial,
      isCancelled,
    );
    fetchInto<LedgerAccount[]>("/api/finance/general-ledger/accounts", setAccounts, isCancelled);
    fetchInto<LedgerMapping[]>("/api/finance/general-ledger/mappings", setMappings, isCancelled);
    const tmsParams = new URLSearchParams({ from: yearStart, to: today });
    fetchInto<Tms7Summary>(
      `/api/finance/general-ledger/financial-statements/tms7/cash-flow?${tmsParams}`,
      setTms7,
      isCancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The profile count is refetched on every tab switch: saves inside the editor do not report back.
  useEffect(() => {
    let cancelled = false;
    fetchInto<unknown[]>("/api/finance/general-ledger/rule-profiles", setProfiles, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  const sourceRows: LedgerSource[] = isReady(sources)
    ? Object.values(sources)
        .filter((value): value is LedgerSource[] => Array.isArray(value))
        .flat()
    : [];
  const sourceBase = isReady(sources) ? sources.baseCurrencyCode ?? "" : "";
  const sourceBaseTotal = sourceRows
    .filter((row) => !row.currencyCode || row.currencyCode === sourceBase)
    .reduce((sum, row) => sum + row.amount, 0);
  const foreignSourceCount = sourceRows.filter(
    (row) => row.currencyCode && row.currencyCode !== sourceBase,
  ).length;

  const profileCount = isReady(profiles) ? profiles.length : null;
  const mappedCount = isReady(mappings) ? mappings.filter((m) => m.accountId).length : 0;
  const tms7Missing = isReady(tms7)
    ? tms7.pAndLUnclassifiedAccountCount + tms7.unclassifiedBalanceAccounts.length
    : 0;

  return (
    <div className="finance-page finance-workbench-page fh-page list-v2 ledger-overview-page">
      <div className="page-heading list-v2-heading fh-head">
        <div className="fh-head-main">
          <span className="fh-eyebrow">Genel muhasebe</span>
          <div className="list-v2-title">
            <h1 title="Hesap planı, fiş ve mali raporlar için muhasebe çalışma alanı.">
              Muhasebe özeti
            </h1>
          </div>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary" onClick={() => go("finance-trial-balance")}>
            Mizan
          </button>
          <button type="button" className="secondary" onClick={() => go("finance-balance-sheet")}>
            Bilanço
          </button>
          <button type="button" className="secondary" onClick={() => go("finance-transfer-sources")}>
            <span>Aktar</span>
            {isReady(sources) && <span>({sourceRows.length.toLocaleString("tr-TR")})</span>}
          </button>
          <button type="button" className="primary" onClick={() => go("finance-journal-vouchers")}>
            Yeni yevmiye fişi
          </button>
        </div>
      </div>

      <div className="dd-tabs" role="tablist" aria-label="Genel muhasebe bölümleri">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "summary"}
          className={`dd-tab${tab === "summary" ? " is-active" : ""}`}
          onClick={() => setTab("summary")}
        >
          Özet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "profiles"}
          className={`dd-tab${tab === "profiles" ? " is-active" : ""}`}
          onClick={() => setTab("profiles")}
        >
          Mevzuat profilleri
          {profileCount != null && <span className="dd-tab-count">{profileCount}</span>}
        </button>
      </div>

      {tab === "summary" && (
        <div className="fh-tabbody" role="tabpanel">
          <div className="fh-tiles">
            <TileFrame label="Bu ay fiş" slot={monthEntries}>
              {(page) => (
                <>
                  <span className="fh-tile-value">{page.total.toLocaleString("tr-TR")}</span>
                  {page.total <= page.items.length && (
                    <span className="fh-tile-hint">
                      <span>{page.items.filter((e) => e.sourceType === "Manual").length}</span>{" "}
                      <span>manuel</span>
                    </span>
                  )}
                </>
              )}
            </TileFrame>
            <TileFrame label="Aktarılmayı bekleyen" slot={sources}>
              {() => (
                <>
                  <span className="fh-tile-value">{sourceRows.length.toLocaleString("tr-TR")}</span>
                  <span className="fh-tile-hint">
                    {amount(sourceBaseTotal)} {sourceBase}
                    {foreignSourceCount > 0 && (
                      <>
                        {" · "}
                        <span>{foreignSourceCount}</span> <span>dövizli kaynak</span>
                      </>
                    )}
                  </span>
                </>
              )}
            </TileFrame>
            <TileFrame label="Mizan dengesi" slot={trial}>
              {(balance) => (
                <>
                  <span className="fh-tile-value">
                    <span className={balance.isBalanced ? "is-success" : "is-danger"}>
                      {balance.isBalanced ? "Dengeli" : "Dengesiz"}
                    </span>
                  </span>
                  <span className="fh-tile-hint">
                    <span>Borç</span> {amount(balance.totalDebit)} · <span>Alacak</span>{" "}
                    {amount(balance.totalCredit)}
                  </span>
                </>
              )}
            </TileFrame>
            <div className="fh-tile">
              <span className="fh-tile-label">Açık dönem</span>
              <span className="fh-tile-value">{year}</span>
              <span className="fh-tile-hint">
                {displayDate(yearStart)} – {displayDate(today)}
              </span>
            </div>
          </div>

          <div className="fh-layout">
            <section className="fh-box" aria-label="Son fişler">
              <div className="fh-box-head">
                <h2>Son fişler</h2>
                {isReady(recentEntries) && (
                  <small>
                    <span>{recentEntries.total.toLocaleString("tr-TR")}</span> <span>kayıt</span>
                  </small>
                )}
              </div>
              {recentEntries === undefined && <p className="fh-empty">Fişler yükleniyor…</p>}
              {recentEntries instanceof Error && (
                <p className="fh-empty">Fişler alınamadı: {recentEntries.message}</p>
              )}
              {isReady(recentEntries) &&
                (recentEntries.items.length === 0 ? (
                  <p className="fh-empty">Henüz yevmiye fişi yok.</p>
                ) : (
                  <div className="fh-table-wrap">
                    <table className="fh-table">
                      <thead>
                        <tr>
                          <th>Fiş</th>
                          <th>Tarih</th>
                          <th>Kaynak</th>
                          <th className="fh-num">Tutar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentEntries.items.map((entry) => (
                          <tr key={entry.id}>
                            <td title={entry.code}>
                              <b>{shortCode(entry.code)}</b>
                              {entry.description && <small>{entry.description}</small>}
                            </td>
                            <td>{displayDate(entry.entryDate)}</td>
                            <td title={entry.sourceType}>{journalSourceTypeLabel(entry.sourceType)}</td>
                            <td className="fh-num">{amount(entry.totalDebit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              <p className="fh-box-foot">
                <button type="button" className="fh-link" onClick={() => go("finance-journal-ledger")}>
                  Yevmiye defterinde tümünü gör →
                </button>
              </p>
            </section>

            <aside className="fh-side">
              <section className="fh-box" aria-label="Kurulum durumu">
                <div className="fh-box-head">
                  <h2>Kurulum durumu</h2>
                </div>
                <ul className="fh-check">
                  <CheckItem
                    title="Hesap planı"
                    slot={accounts}
                    ok={isReady(accounts) && accounts.length > 0}
                    detail={isReady(accounts) ? `${accounts.length.toLocaleString("tr-TR")} hesap` : ""}
                    action={isReady(accounts) && accounts.length > 0 ? "Aç" : "Tanımla"}
                    onAction={() => go("finance-ledger-chart")}
                  />
                  <CheckItem
                    title="Hesap eşleştirmeleri"
                    slot={mappings}
                    ok={isReady(mappings) && mappedCount === mappings.length}
                    detail={isReady(mappings) ? `${mappedCount} / ${mappings.length} eşleşti` : ""}
                    action={isReady(mappings) && mappedCount === mappings.length ? "Aç" : "Tamamla"}
                    onAction={() => go("finance-ledger-mappings")}
                  />
                  <CheckItem
                    title="Mevzuat profili"
                    slot={profiles}
                    ok={(profileCount ?? 0) > 0}
                    detail={profileCount ? `${profileCount} profil` : "Profil yok"}
                    action={profileCount ? "Aç" : "Tanımla"}
                    onAction={() => setTab("profiles")}
                  />
                  {!(tms7 instanceof Error) && (
                    <CheckItem
                      title="TMS 7 sınıflandırması"
                      slot={tms7}
                      ok={isReady(tms7) && tms7Missing === 0}
                      detail={isReady(tms7) ? (tms7Missing > 0 ? `${tms7Missing} eksik eşleme` : "Tamam") : ""}
                      action={tms7Missing > 0 ? "Tamamla" : "Aç"}
                      onAction={() => go("finance-cash-flow")}
                    />
                  )}
                </ul>
              </section>
            </aside>
          </div>
        </div>
      )}

      {tab === "profiles" && (
        <div className="fh-tabbody" role="tabpanel">
          {profileCount === 0 && !profileEditorOpen ? (
            <div className="fh-invite">
              <h2>İlk mevzuat profilini tanımlayın</h2>
              <p>
                Yürürlük tarihine bağlı yerel mevzuat, raporlama standardı ve vergi kurallarını
                firma bazında tanımlayın. Belgeler varsayılan profile göre vergilendirilir.
              </p>
              <button type="button" className="primary" onClick={() => setProfileEditorOpen(true)}>
                Profil oluştur
              </button>
            </div>
          ) : (
            <AccountingRuleProfilesPanel token={token} />
          )}
        </div>
      )}
    </div>
  );
}

function TileFrame<T>({
  label,
  slot,
  children,
}: {
  label: string;
  slot: Slot<T>;
  children: (value: T) => ReactNode;
}) {
  return (
    <div className="fh-tile">
      <span className="fh-tile-label">{label}</span>
      {slot === undefined ? (
        <span className="fh-tile-value">
          <small>Yükleniyor…</small>
        </span>
      ) : slot instanceof Error ? (
        <span className="fh-tile-error" title={slot.message}>
          Alınamadı
        </span>
      ) : (
        children(slot)
      )}
    </div>
  );
}

function CheckItem<T>({
  title,
  slot,
  ok,
  detail,
  action,
  onAction,
}: {
  title: string;
  slot: Slot<T>;
  ok: boolean;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  const loading = slot === undefined;
  const failed = slot instanceof Error;
  return (
    <li>
      {ok ? (
        <CheckCircle2 size={16} className="is-ok" aria-label="Tamam" />
      ) : loading || failed ? (
        <Circle size={16} className="is-muted" aria-hidden="true" />
      ) : (
        <CircleAlert size={16} className="is-open" aria-label="Eksik" />
      )}
      <span className="fh-check-text">
        <b>{title}</b>
        <small>{loading ? "Yükleniyor…" : failed ? "Alınamadı" : detail}</small>
      </span>
      <button type="button" className="fh-link" onClick={onAction}>
        {action}
      </button>
    </li>
  );
}
