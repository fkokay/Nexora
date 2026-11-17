import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Coins, Globe2, Lock, X } from "lucide-react";
import { api, localDateString } from "./erpApi";
import AdvancedDataGrid from "./AdvancedDataGrid";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import { DefinitionEmptyPane, DefinitionLayout } from "./list-page/DefinitionLayout";
import { ListFooter } from "./list-page/ListFooter";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListSummaryCards, type SummaryCard } from "./list-page/ListSummaryCards";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import type { PageCommands } from "./commands/types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "./record-form/RecordForm";
import { isInPopup, openDialogs, useWindowKeyDown } from "./record-form/recordFormKeys";
import { confirmDialog } from "./confirmDialog";
import FxRevaluationVoucherGrid from "./fx-revaluation/components/FxRevaluationVoucherGrid";
import FxRevaluationVoucherDetail from "./fx-revaluation/components/FxRevaluationVoucherDetail";
import type { ExchangeRate } from "./exchange-rates/types";
import type {
  BuiltInScreenLayoutField,
  FxExposureReport,
  FxRevaluationVoucher,
  FxRevaluationVoucherSummary,
} from "./erp-types";
import "./list-page/list-page-v2.css";
import "./fx-revaluation/fx-revaluation-list-v2.css";
import "./exchange-rates/fx-settings.css";
import "./finance-hub.css";

type RateFilter = "latest" | "all" | "manual";
const RATE_FORM_ID = "fx-rate-form";
const REVAL_FORM_ID = "fx-revaluation-form";
const ADMIN_RATES = "Kurları yalnızca firma yöneticisi girebilir.";
const ADMIN_REVAL = "Değerleme fişini yalnızca firma yöneticisi oluşturabilir.";

/** Turkish names of the currencies TCMB publishes (shown under the code). */
const currencyNames: Record<string, string> = {
  USD: "ABD doları",
  EUR: "Euro",
  GBP: "İngiliz sterlini",
  CHF: "İsviçre frangı",
  JPY: "Japon yeni",
  CAD: "Kanada doları",
  AUD: "Avustralya doları",
  DKK: "Danimarka kronu",
  SEK: "İsveç kronu",
  NOK: "Norveç kronu",
  SAR: "Suudi Arabistan riyali",
  KWD: "Kuveyt dinarı",
  RON: "Rumen leyi",
  RUB: "Rus rublesi",
  CNY: "Çin yuanı",
  PKR: "Pakistan rupisi",
  QAR: "Katar riyali",
  KRW: "Güney Kore wonu",
  AZN: "Azerbaycan manatı",
  AED: "BAE dirhemi",
  BGN: "Bulgar levası",
  IRR: "İran riyali",
  TRY: "Türk lirası",
};

const tcmbHelp =
  "TCMB gösterge satış kurları her gün Türkiye saatiyle 16.45’ten sonra otomatik alınır. Yayın gecikirse yapılandırılmış yeniden deneme penceresinde artan aralıklarla tekrar denenir. Tatil günlerinde son yayımlanan tarih kullanılır. Elle girilen kurlar korunur.";

const isTcmb = (rate: ExchangeRate) => (rate.source ?? "").toUpperCase().startsWith("TCMB");
const sourceLabel = (source: string | null) => {
  if (!source) return "—";
  // Stored as e.g. "TCMB ForexSelling · 2026-11-13"; the date is already its own column.
  if (/^TCMB\s+ForexSelling\b/i.test(source)) return "TCMB satış";
  if (/^TCMB\s+ForexBuying\b/i.test(source)) return "TCMB alış";
  return source;
};
const displayDate = (value: string) => value.split("-").reverse().join(".");
const displayDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const rate4 = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const rateFull = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const money = (value: number, currency: string) =>
  `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${currency}`;

const defaultLayout: BuiltInScreenLayoutField[] = [
  { key: "currencyCode", label: "Döviz", visible: true, position: 0 },
  { key: "rateDate", label: "Tarih", visible: true, position: 1 },
  { key: "rate", label: "Kur", visible: true, position: 2 },
  { key: "source", label: "Kaynak", visible: true, position: 3 },
  { key: "revision", label: "Rev.", visible: true, position: 4 },
];

export default function FxSettingsPage({ token, role }: { token: string; role: string }) {
  const today = localDateString();
  const isAdmin = role === "TenantAdmin";

  // Base currency and rates (formerly ExchangeRatesPage)
  const [base, setBase] = useState("TRY"),
    [baseDraft, setBaseDraft] = useState("TRY"),
    [rates, setRates] = useState<ExchangeRate[]>([]),
    [ratesLoaded, setRatesLoaded] = useState(false),
    [code, setCode] = useState("USD"),
    [date, setDate] = useState(today),
    [rate, setRate] = useState(""),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [screenFields, setScreenFields] = useState(defaultLayout);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RateFilter>("latest");
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  // Period-end revaluation (formerly FxRevaluationPage)
  const [revalDate, setRevalDate] = useState(today),
    [vouchers, setVouchers] = useState<FxRevaluationVoucherSummary[]>([]),
    [vouchersLoaded, setVouchersLoaded] = useState(false),
    [selectedVoucher, setSelectedVoucher] = useState<FxRevaluationVoucher | null>(null),
    [voucherQuery, setVoucherQuery] = useState(""),
    [voucherToolsSlot, setVoucherToolsSlot] = useState<HTMLDivElement | null>(null),
    [revalBusy, setRevalBusy] = useState(false);
  // Kur & Değerleme as a definition screen (mockup 04-alt): two tabs, each a list with its form on the right.
  const [tab, setTab] = useState<"rates" | "vouchers">("rates"),
    [rateFormOpen, setRateFormOpen] = useState(false),
    // The rate row the form was filled from (a same-day correction becomes a new revision).
    [rateFrom, setRateFrom] = useState<string | null>(null),
    [creatingVoucher, setCreatingVoucher] = useState(false);

  const [exposure, setExposure] = useState<FxExposureReport | null>(null),
    [exposureFailed, setExposureFailed] = useState(false);

  async function load() {
    try {
      const [currency, rows] = await Promise.all([
        api<{ baseCurrencyCode: string }>("/api/finance/currency", token),
        api<ExchangeRate[]>("/api/finance/exchange-rates", token),
      ]);
      setBase(currency.baseCurrencyCode);
      setBaseDraft(currency.baseCurrencyCode);
      setRates(rows);
      setRatesLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadVouchers() {
    try {
      setVouchers(
        await api<FxRevaluationVoucherSummary[]>("/api/finance/fx-revaluations", token),
      );
      setVouchersLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadExposure() {
    try {
      setExposure(await api<FxExposureReport>("/api/finance/fx-exposure", token));
      setExposureFailed(false);
    } catch {
      setExposureFailed(true);
    }
  }
  useEffect(() => {
    void load();
    void loadVouchers();
    void loadExposure();
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    api<{ id?: string | null; fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/exchange-rates/active",
      token,
    )
      .then((view) => {
        // Without a published view the server returns its catalog default (id null);
        // this page then keeps its own column order (Döviz, Tarih, Kur, Kaynak, Rev.).
        if (!cancelled && view.id && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/finance/exchange-rates", token, {
        method: "POST",
        body: JSON.stringify({
          currencyCode: code,
          rateDate: date,
          rate: Number(rate),
          source: source || null,
        }),
      });
      setNotice("Döviz kuru eklendi. Düzeltmeler yeni revizyon olarak kaydedilir.");
      setRate("");
      await load();
      void loadExposure();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importTcmb() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{
        rateDate: string;
        imported: number;
        skipped: number;
        baseCurrencyCode: string;
      }>("/api/finance/exchange-rates/import-tcmb", token, { method: "POST" });
      setNotice(
        `TCMB ${displayDate(result.rateDate)} tarihli kurları alındı: ${result.imported} yeni kur, ${result.skipped} mevcut kur korundu. Baz para: ${result.baseCurrencyCode}.`,
      );
      await load();
      void loadExposure();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveBase(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ baseCurrencyCode: string }>("/api/finance/currency", token, {
        method: "PUT",
        body: JSON.stringify({ baseCurrencyCode: baseDraft }),
      });
      setBase(result.baseCurrencyCode);
      setNotice("Baz para birimi güncellendi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createRevaluation() {
    if (
      !(await confirmDialog({
        title: "Değerleme fişi oluşturulsun mu?",
        message: `${revalDate} tarihi için değerleme fişi oluşturulacak. Fiş kaydedildikten sonra değiştirilemez.`,
        tone: "warning",
        confirmLabel: "Fişi oluştur",
      }))
    )
      return;
    setRevalBusy(true);
    setError("");
    setNotice("");
    try {
      const voucher = await api<FxRevaluationVoucher>("/api/finance/fx-revaluations", token, {
        method: "POST",
        body: JSON.stringify({ asOfDate: revalDate }),
      });
      setSelectedVoucher(voucher);
      setCreatingVoucher(false);
      setNotice(
        `${voucher.code} fişi oluşturuldu. Borç ve alacak toplamı ${voucher.totalDebit.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${voucher.baseCurrencyCode}.`,
      );
      await loadVouchers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevalBusy(false);
    }
  }
  async function openVoucher(id: string) {
    setError("");
    try {
      setSelectedVoucher(await api<FxRevaluationVoucher>(`/api/finance/fx-revaluations/${id}`, token));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // The base currency can change only until the first rate or financial record; a stored
  // rate is enough to know it is locked (the server rejects other cases with a message).
  const baseLocked = rates.length > 0;

  const latestByCurrency = useMemo(() => {
    const latest = new Map<string, ExchangeRate>();
    for (const row of rates) {
      const current = latest.get(row.currencyCode);
      if (
        !current ||
        row.rateDate > current.rateDate ||
        (row.rateDate === current.rateDate && row.revision > current.revision)
      )
        latest.set(row.currencyCode, row);
    }
    return latest;
  }, [rates]);
  const latestRates = [...latestByCurrency.values()].sort((a, b) =>
    a.currencyCode.localeCompare(b.currencyCode),
  );
  const manualRates = rates.filter((row) => !isTcmb(row));
  const lastTcmb = rates
    .filter(isTcmb)
    .reduce<ExchangeRate | null>(
      (latest, row) => (!latest || row.createdAt > latest.createdAt ? row : latest),
      null,
    );
  const lastRateDate = rates.reduce<string>(
    (latest, row) => (row.rateDate > latest ? row.rateDate : latest),
    "",
  );

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const visibleRates = (filter === "latest" ? latestRates : filter === "manual" ? manualRates : rates).filter(
    (row) =>
      !normalizedQuery ||
      `${row.currencyCode} ${currencyNames[row.currencyCode] ?? ""} ${row.source ?? ""} ${row.rateDate}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedQuery),
  );
  const visibleFields = screenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);

  const tileCurrencies = ["USD", "EUR", "GBP", "CHF", "JPY"].filter((c) => c !== base).slice(0, 3);

  // Net open FX position in base currency: open foreign receivables minus payables at today's rate.
  const foreignSummaries = (exposure?.summaries ?? []).filter(
    (summary) => summary.currencyCode !== exposure?.baseCurrencyCode,
  );
  const exposureNet = foreignSummaries.reduce(
    (sum, summary) =>
      sum + (summary.direction === "Receivable" ? 1 : -1) * (summary.currentBaseAmount ?? 0),
    0,
  );
  const exposureInvoices = foreignSummaries.reduce((sum, summary) => sum + summary.invoiceCount, 0);
  const exposureUnconverted = foreignSummaries.reduce(
    (sum, summary) => sum + summary.unconvertedInvoiceCount,
    0,
  );

  const normalizedVoucherQuery = voucherQuery.trim().toLocaleLowerCase("tr-TR");
  const filteredVouchers = vouchers.filter(
    (voucher) =>
      !normalizedVoucherQuery ||
      voucher.code.toLocaleLowerCase("tr-TR").includes(normalizedVoucherQuery) ||
      voucher.asOfDate.includes(normalizedVoucherQuery),
  );

  const ratesTab = tab === "rates";
  const rateRow = rateFrom ? rates.find((row) => row.id === rateFrom) : undefined;
  const rateDirty = rateFormOpen && rate !== (rateRow ? String(rateRow.rate) : "");
  // Esc = Vazgeç for the open form / voucher (asks first when a rate was typed); not while a dialog or picker owns it.
  const pageRef = useRef<HTMLDivElement | null>(null);
  useWindowKeyDown(rateFormOpen || creatingVoucher || Boolean(selectedVoucher), (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || openDialogs().length) return;
    if (ratesTab ? !rateFormOpen : !creatingVoucher && !selectedVoucher) return;
    if (pageRef.current?.closest("[hidden]")) return;
    event.preventDefault();
    if (ratesTab) void cancelRate();
    else if (creatingVoucher) setCreatingVoucher(false);
    else setSelectedVoucher(null);
  });
  async function cancelRate() {
    if (rateDirty && !(await confirmDialog({ title: "Vazgeç", message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Devam" }))) return;
    closeRate();
  }
  /** Yeni (F2) and row selection replace the form's values: a typed rate is not dropped without asking. */
  async function requestRate(from?: ExchangeRate) {
    if (
      rateDirty &&
      !(await confirmDialog({ title: from ? "Vazgeç" : "Yeni kayıt", message: "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?", confirmLabel: "Devam" }))
    )
      return;
    startRate(from);
  }
  function startRate(from?: ExchangeRate) {
    setCode(from?.currencyCode ?? "USD");
    setDate(from?.rateDate ?? localDateString());
    setRate(from ? String(from.rate) : "");
    setSource(from?.source && !isTcmb(from) ? from.source : "");
    setRateFrom(from?.id ?? null);
    setRateFormOpen(true);
    setError("");
    window.setTimeout(() => document.querySelector<HTMLInputElement>(`#${RATE_FORM_ID} input`)?.focus(), 0);
  }
  function closeRate() {
    setRateFormOpen(false);
    setRateFrom(null);
  }
  const commands: PageCommands = ratesTab
    ? {
        new: isAdmin
          ? { primary: !rateFormOpen, disabledReason: busy ? "İşlem sürüyor…" : undefined, run: () => void requestRate() }
          : { disabledReason: ADMIN_RATES },
        delete: { disabledReason: "Kurlar silinmez; düzeltme aynı gün için yeni revizyon olarak kaydedilir" },
        more: isAdmin
          ? [
              {
                id: "fx-import-tcmb",
                label: busy ? "TCMB kurları alınıyor…" : "TCMB’den çek",
                disabledReason: busy ? "İşlem sürüyor…" : undefined,
                run: () => void importTcmb(),
              },
            ]
          : [],
      }
    : {
        new: isAdmin
          ? {
              primary: !creatingVoucher,
              disabledReason: revalBusy ? "İşlem sürüyor…" : undefined,
              run: () => {
                setSelectedVoucher(null);
                setCreatingVoucher(true);
              },
            }
          : { disabledReason: ADMIN_REVAL },
        delete: { disabledReason: "Değerleme fişi silinmez; kaydedilen fiş değiştirilemez" },
      };

  const rateList = (
    <>
      <ListToolbar
        search={query}
        onSearchChange={setQuery}
        searchLabel="Kur ara"
        searchPlaceholder="Döviz kodu, adı veya kaynak"
        toolsSlotRef={setToolsSlot}
        onRefresh={() => void load()}
      >
        <ListChipGroup
          label="Kur filtresi"
          value={filter}
          onChange={(value) => value && setFilter(value as RateFilter)}
          options={[
            { value: "latest", label: "Son kurlar", count: latestRates.length },
            { value: "all", label: "Tüm geçmiş", count: rates.length },
            { value: "manual", label: "Elle girilen", count: manualRates.length },
          ]}
        />
      </ListToolbar>
      <section className="list-v2-list fh-def-grid" aria-label="Döviz kurları">
        <div className="customer-table-wrap">
          <AdvancedDataGrid
            className="customer-table"
            gridId="exchange-rates"
            {...screenViewGridDefaults(visibleFields)}
            externalPagination
            hideSearch
            enableRowSelection={false}
            selectable
            hideExport
            currentRowKey={isAdmin ? rateFrom : undefined}
            onCurrentRowChange={
              isAdmin
                ? (key) => {
                    const row = key ? rates.find((item) => item.id === key) : undefined;
                    if (row) void requestRate(row);
                  }
                : undefined
            }
            toolbarContainer={toolsSlot}
            aria-label="Döviz kuru listesi"
          >
            <thead>
              <ScreenViewGroupHeader fields={visibleFields} />
              <tr>
                {visibleFields.map((field) => (
                  <th key={field.key} className={field.key === "rate" ? "nx-num" : undefined}>
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRates.map((row) => (
                <tr key={row.id}>
                  {visibleFields.map((field) => (
                    <td key={field.key} className={field.key === "rate" ? "nx-num" : undefined}>
                      {rateCell(row, field.key, base)}
                    </td>
                  ))}
                </tr>
              ))}
              {visibleRates.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, visibleFields.length)} className="table-empty">
                    {!ratesLoaded
                      ? "Kurlar yükleniyor…"
                      : rates.length === 0
                        ? "Henüz döviz kuru girilmedi."
                        : "Filtreye uygun kur bulunamadı."}
                  </td>
                </tr>
              )}
            </tbody>
          </AdvancedDataGrid>
        </div>
        <ListFooter hints={isAdmin ? "↑↓ listede gez · satır seçmek kuru düzeltme için forma alır · F2 yeni kur · Ctrl+S kaydet" : "↑↓ listede gez"}>
          <span title={tcmbHelp}>
            {lastTcmb ? (
              <>
                <span>TCMB · son alım</span> <span>{displayDateTime(lastTcmb.createdAt)}</span>
              </>
            ) : (
              <span>TCMB · henüz kur alınmadı</span>
            )}
          </span>
        </ListFooter>
      </section>
    </>
  );

  const ratePane = !isAdmin ? (
    <DefinitionEmptyPane>Kurları yalnızca firma yöneticisi girebilir.</DefinitionEmptyPane>
  ) : !rateFormOpen ? (
    <DefinitionEmptyPane>Yeni kur için F2'ye basın ya da düzeltmek için listeden bir kur seçin.</DefinitionEmptyPane>
  ) : (
    <div className="inv-rf-embedded fh-rate-form">
      <RecordFormPage
        variant="dialog"
        title={rateFrom ? "Kur düzeltmesi" : "Kur gir"}
        mode="create"
        busy={busy}
        saveLabel="Kuru kaydet"
        formId={RATE_FORM_ID}
        onSubmit={saveRate}
        onCancel={() => void cancelRate()}
        error={error}
        onDismissError={() => setError("")}
        subtitle={rateFrom ? <span>Aynı gün düzeltmesi yeni revizyon oluşturur</span> : undefined}
        status={notice ? <span className="rf-status-notice">{notice}</span> : undefined}
      >
        <RecordFormGroup title="Kur" hint="* zorunlu alan">
          <label>
            <span>Döviz <RequiredMark /></span>
            <input className="rf-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} minLength={3} maxLength={3} required />
          </label>
          <label>
            <span>Tarih <RequiredMark /></span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            <span>
              1 {code || "döviz"} = ? {base}
            </span>
            <input
              className="rf-num"
              type="number"
              min="0.00000001"
              step="0.00000001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </label>
          <label className="rf-span-2">
            Kaynak / not
            <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={160} placeholder="Örn. banka satış kuru" />
          </label>
          <p className="fin-rf-hint">Geçmiş tarih için kur girilebilir. Aynı gün düzeltmesi yeni revizyon oluşturur.</p>
        </RecordFormGroup>
      </RecordFormPage>
    </div>
  );

  const voucherList = (
    <>
      <ListToolbar
        search={voucherQuery}
        onSearchChange={setVoucherQuery}
        searchPlaceholder="Fiş kodu veya YYYY-AA-GG"
        toolsSlotRef={setVoucherToolsSlot}
        onRefresh={() => void loadVouchers()}
      />
      <section className="list-v2-list fh-def-grid fh-reval-list" aria-label="Dönem sonu kur değerleme fişleri">
        <FxRevaluationVoucherGrid
          token={token}
          vouchers={filteredVouchers}
          emptyMessage={vouchers.length ? "Filtreye uygun değerleme fişi bulunamadı." : "Henüz değerleme fişi oluşturulmadı."}
          toolbarContainer={voucherToolsSlot}
          money={money}
          compact
          onOpen={(id) => {
            setCreatingVoucher(false);
            void openVoucher(id);
          }}
        />
        <ListFooter hints="Fişi aç · F2 yeni değerleme fişi">
          <span>
            <span>{vouchersLoaded ? vouchers.length : "—"}</span> <span>fiş</span>
          </span>
        </ListFooter>
      </section>
    </>
  );

  const voucherPane = creatingVoucher && isAdmin ? (
    <div className="inv-rf-embedded fh-rate-form">
      <RecordFormPage
        variant="dialog"
        title="Dönem sonu değerleme"
        mode="create"
        busy={revalBusy}
        saveLabel="Değerleme fişi oluştur"
        formId={REVAL_FORM_ID}
        onSubmit={(event) => {
          event.preventDefault();
          void createRevaluation();
        }}
        onCancel={() => setCreatingVoucher(false)}
        saveDisabledReason={!revalDate ? "Dönem sonu tarihini girin" : undefined}
        error={error}
        onDismissError={() => setError("")}
        status={notice ? <span className="rf-status-notice">{notice}</span> : undefined}
      >
        <RecordFormGroup title="Değerleme">
          <label>
            <span>Dönem sonu tarihi <RequiredMark /></span>
            <input type="date" value={revalDate} max={today} onChange={(event) => setRevalDate(event.target.value)} required />
          </label>
          <p className="fin-rf-hint">Eksik kur varsa fiş oluşturulmaz. Aynı tarihte tekrar fiş kesilemez. Fiş kaydedildikten sonra değiştirilemez.</p>
        </RecordFormGroup>
      </RecordFormPage>
    </div>
  ) : selectedVoucher ? (
    <div className="fh-reval-detail">
      <FxRevaluationVoucherDetail token={token} voucher={selectedVoucher} money={money} onClose={() => setSelectedVoucher(null)} />
    </div>
  ) : (
    <DefinitionEmptyPane>
      {isAdmin ? "Bir değerleme fişi açın ya da F2 ile yeni dönem sonu değerlemesi yapın." : "Satırlarını görmek için bir değerleme fişi açın."}
    </DefinitionEmptyPane>
  );

  const rateCards: SummaryCard[] = tileCurrencies.map((currency) => {
    const latest = latestByCurrency.get(currency);
    return {
      id: currency,
      label: `${currency}/${base}`,
      icon: Coins,
      value: !ratesLoaded ? "—" : latest ? rate4(latest.rate) : "Kur yok",
      hint: latest ? `${displayDate(latest.rateDate)} · ${sourceLabel(latest.source)}` : undefined,
    };
  });
  rateCards.push(
    exposureFailed
      ? { id: "last-date", label: "Son kur tarihi", icon: CalendarDays, value: lastRateDate ? displayDate(lastRateDate) : "—" }
      : {
          id: "exposure",
          label: "Açık döviz pozisyonu",
          icon: Globe2,
          tone: exposureUnconverted > 0 ? "warn" : undefined,
          value: !exposure ? "—" : `${exposureNet.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${exposure.baseCurrencyCode}`,
          hint: exposure ? (
            <>
              <span>{exposureInvoices}</span> <span>açık dövizli fatura</span>
              {exposureUnconverted > 0 && (
                <>
                  {" · "}
                  <span>{exposureUnconverted}</span> <span>kursuz</span>
                </>
              )}
            </>
          ) : undefined,
        },
  );

  return (
    <div ref={pageRef} className="finance-page fh-page list-v2 fx-settings-page">
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Kur ve değerleme"
        description="Baz para birimini, döviz kurlarını ve dönem sonu değerlemelerini yönetin."
        count={ratesLoaded ? latestRates.length : null}
        countLabel={`döviz · baz para ${base}`}
      >
        {baseLocked || !isAdmin || !ratesLoaded ? (
          <span className="fh-meta" title={baseLocked ? "İlk finansal kayıt veya kur girildikten sonra değiştirilemez" : undefined}>
            <span>Baz para</span> <b>{base}</b>
            {baseLocked && <Lock size={14} aria-label="Kilitli" />}
          </span>
        ) : (
          <form className="fh-meta fh-base-form" onSubmit={saveBase} title="İlk finansal kayıt veya kur girilene kadar değiştirilebilir.">
            <span>Baz para</span>
            <input aria-label="Baz para birimi" value={baseDraft} onChange={(e) => setBaseDraft(e.target.value.toUpperCase())} minLength={3} maxLength={3} required />
            {baseDraft !== base && (
              <button className="secondary" disabled={busy}>
                Kaydet
              </button>
            )}
          </form>
        )}
      </ListPageHeader>

      {error && !(ratesTab ? rateFormOpen : creatingVoucher) && (
        <div className="alert inline-alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && !(ratesTab ? rateFormOpen : creatingVoucher) && (
        <div className="notice">
          {notice}
          <button type="button" aria-label="Kapat" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}

      <ListSummaryCards cards={rateCards} />

      <div className="list-v2-tabs fh-tabs" role="tablist" aria-label="Kur ve değerleme bölümleri">
        <button type="button" role="tab" aria-selected={ratesTab} className={ratesTab ? "is-active" : undefined} onClick={() => setTab("rates")}>
          <span>Döviz kurları</span> <span className="list-v2-chip-count">{rates.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={!ratesTab} className={!ratesTab ? "is-active" : undefined} onClick={() => setTab("vouchers")}>
          <span>Değerleme fişleri</span> <span className="list-v2-chip-count">{vouchersLoaded ? vouchers.length : "—"}</span>
        </button>
      </div>

      {ratesTab ? (
        <DefinitionLayout className="fh-def" paneOpen={isAdmin && rateFormOpen} paneLabel="Kur girişi" list={rateList} pane={ratePane} />
      ) : (
        <DefinitionLayout
          className="fh-def"
          paneOpen={Boolean(selectedVoucher) || (isAdmin && creatingVoucher)}
          paneLabel="Değerleme fişi"
          list={voucherList}
          pane={voucherPane}
        />
      )}
    </div>
  );
}


function rateCell(row: ExchangeRate, key: string, base: string) {
  switch (key) {
    case "rateDate":
      return displayDate(row.rateDate);
    case "currencyCode":
      return (
        <>
          <b>{row.currencyCode}</b>
          {currencyNames[row.currencyCode] && (
            <small className="cell-subtitle">{currencyNames[row.currencyCode]}</small>
          )}
        </>
      );
    case "rate":
      return `${rateFull(row.rate)} ${base}`;
    case "revision":
      return row.revision;
    case "source":
      return <span title={row.source ?? undefined}>{sourceLabel(row.source)}</span>;
    default:
      return "—";
  }
}
