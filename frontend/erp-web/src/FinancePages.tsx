import { lazy, useEffect, useRef, useState } from "react";
import { Activity, Landmark, Wallet, X } from "lucide-react";
import { api, parseBankStatementCsv, localDateString } from "./erpApi";
import { FinanceStudioGrid } from "./FinanceStudioGrid";
import { CashFlowReportPanel } from "./finance/components/CashFlowReportPanel";
import { FinanceAccountsToolbar } from "./finance/components/FinanceAccountsToolbar";
import { FinanceAccountsGrid } from "./finance/components/FinanceAccountsGrid";
import { BankStatementImportPrompt } from "./finance/components/BankStatementImportPrompt";
import { BankStatementsGrid } from "./finance/components/BankStatementsGrid";
import { BankStatementDetailPanel } from "./finance/components/BankStatementDetailPanel";
import { financeGridDefaults, financePageTitles } from "./financeCatalog";
import type {
  FinancePageKey,
  FinancialAccount,
  FinancialAccountDetail,
  CashFlowReport,
  MaturityReport,
  FxExposureReport,
  BankStatement,
  BankStatementDetail,
  UnmatchedBookMovement,
  BankStatementInputLine,
  FinancialTransfer,
  FinancialMovement,
  BankStatementLine,
  BuiltInScreenLayoutField,
} from "./erp-types";
import { confirmLocalized } from "./locale";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./finance-record-forms.css";

const CashForecastPanel = lazy(() => import("./CashForecastPanel"));
const ExchangeRatesPage = lazy(() => import("./ExchangeRatesPage"));
const FxRevaluationPage = lazy(() => import("./FxRevaluationPage"));
const GeneralLedgerPage = lazy(() => import("./GeneralLedgerPage"));
const Tms7CashFlowPage = lazy(() => import("./Tms7CashFlowPage"));
const StatutoryCashFlowStatementPanel = lazy(
  () => import("./StatutoryCashFlowStatementPanel"),
);
const CreditFacilitiesPage = lazy(() => import("./CreditFacilitiesPage"));

function FinancePage({
  token,
  role,
  section,
  onNavigate,
  createOnOpen = false,
}: {
  token: string;
  role: string;
  section: FinancePageKey;
  onNavigate?: (page: string) => void;
  createOnOpen?: boolean;
}) {
  const financePageDescriptions: Record<FinancePageKey, string> = {
    "finance-accounts":
      "Kasa hesaplarını, bakiyelerini ve hareketlerini yönetin.",
    "finance-banks":
      "Banka hesaplarını, bakiyelerini ve ekstre hareketlerini yönetin.",
    "finance-statements":
      "Banka ekstrelerini yükleyin, hareketlerle eşleştirin ve mutabakatı tamamlayın.",
    "finance-cash-flow":
      "Kasa ve banka hareketlerini faaliyet sınıfı ve para birimine göre inceleyin.",
    "finance-fx":
      "Baz para birimini, döviz kurlarını ve dönem sonu değerlemelerini yönetin.",
    "finance-ledger":
      "Hesap planı, fiş ve mali raporlar için muhasebe çalışma alanı.",
    "finance-ledger-chart": "Tenant hesaplarını yönetin.",
    "finance-ledger-mappings":
      "Alt defter kaynaklarını muhasebe hesaplarıyla eşleştirin.",
    "finance-journal-vouchers":
      "Manuel yevmiye fişi oluşturun; borç ve alacak toplamları kayıtta doğrulanır.",
    "finance-trial-balance":
      "Dönem açılışlarını, borç/alacak hareketlerini ve kapanış bakiyelerini karşılaştırın.",
    "finance-balance-sheet":
      "Belirlenen tarih itibarıyla varlık, yükümlülük ve özkaynak bakiyelerini görün.",
    "finance-journal-ledger":
      "Yevmiye fişlerini ve muhasebeye aktarılmayı bekleyen kaynakları inceleyin.",
    "finance-transfer-sources":
      "Satış, satın alma, tahsilat ve stok kaynaklarını muhasebeye aktarın.",
    "finance-budget":
      "Dönemsel bütçe senaryolarını oluşturun ve defter gerçekleşenleriyle karşılaştırın.",
    "finance-cash-budget":
      "Tahsilat ve ödemeleri planlayın; onaylanan planlar nakit tahminine yansır, muhasebe kaydı oluşturmaz.",
    "finance-exposure": "Açık dövizli cari bakiyeleri güncel kurla inceleyin.",
    "finance-maturities":
      "Açık satış ve alış faturalarını vade aralıklarına göre takip edin.",
    "finance-instruments":
      "Alınan ve verilen çek/senetleri, vadeleri ve portföy hareketleriyle izleyin.",
    "finance-credit-facilities":
      "Banka ve finansman kuruluşu limitlerini, vadeleri ve ödeme planlarını yönetin.",
    "finance-credit-facility-create":
      "Kredi veya limit sözleşmesini tanımlayın.",
    "finance-credit-schedule-create": "Ödeme planına yeni taksit ekleyin.",
    "finance-credit-movement-create":
      "Kredi kullandırımını kasa/banka hesabına kaydedin.",
    "finance-credit-repayment-create":
      "Kredi geri ödemesini kasa/banka hesabına kaydedin.",
    "finance-credit-security-create":
      "Kredi teminatı veya garantisi tanımlayın.",
  };
  const isAccountsPage =
    section === "finance-accounts" || section === "finance-banks";
  const accountKind = section === "finance-banks" ? "Bank" : "Cash";
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]),
    [detail, setDetail] = useState<FinancialAccountDetail | null>(null),
    [accountQuery, setAccountQuery] = useState(""),
    [accountQueryDraft, setAccountQueryDraft] = useState(""),
    [accountStateFilter, setAccountStateFilter] = useState<
      "all" | "active" | "inactive"
    >("all"),
    [accountStateDraft, setAccountStateDraft] = useState<"all" | "active" | "inactive">("all");
  const kindAccounts = accounts.filter(
    (account) => account.type === accountKind,
  );
  const visibleAccounts = kindAccounts.filter(
    (account) =>
      `${account.code} ${account.name} ${account.currencyCode}`
        .toLocaleLowerCase("tr-TR")
        .includes(accountQuery.toLocaleLowerCase("tr-TR")) &&
      (accountStateFilter === "all" ||
        account.isActive === (accountStateFilter === "active")),
  );
  const [accountScreenFields, setAccountScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >([
    { key: "code", label: "Kod", visible: true, position: 0 },
    { key: "name", label: "Hesap", visible: true, position: 1 },
    { key: "type", label: "Tür", visible: true, position: 2 },
    { key: "currencyCode", label: "Döviz", visible: true, position: 3 },
    { key: "balance", label: "Bakiye", visible: true, position: 4 },
    { key: "transactionCount", label: "Hareket", visible: true, position: 5 },
    { key: "status", label: "Durum", visible: true, position: 6 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 7,
      fixed: true,
    },
  ]);
  const visibleAccountFields = accountScreenFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null),
    [cashFlowFrom, setCashFlowFrom] = useState(
      `${new Date().getFullYear()}-01-01`,
    ),
    [cashFlowTo, setCashFlowTo] = useState(localDateString()),
    [cashFlowLoading, setCashFlowLoading] = useState(false);
  const [maturity, setMaturity] = useState<MaturityReport | null>(null);
  const [maturityQuery, setMaturityQuery] = useState("");
  const [maturityDirection, setMaturityDirection] = useState<"all" | "Receivable" | "Payable">("all");
  const maturityItems = (maturity?.items ?? []).filter((item) => {
    const query = maturityQuery.trim().toLocaleLowerCase("tr-TR");
    const matchesQuery = !query || `${item.invoiceCode} ${item.counterpartyName}`.toLocaleLowerCase("tr-TR").includes(query);
    return matchesQuery && (maturityDirection === "all" || item.direction === maturityDirection);
  });
  const maturitySummaries = (maturity?.summaries ?? []).filter(
    (summary) => maturityDirection === "all" || summary.direction === maturityDirection,
  );
  const overdueMaturityCount = (maturity?.items ?? []).filter((item) => item.daysOverdue > 0).length;
  const receivableMaturityCount = (maturity?.items ?? []).filter((item) => item.direction === "Receivable").length;
  const payableMaturityCount = (maturity?.items ?? []).filter((item) => item.direction === "Payable").length;
  const [fxExposure, setFxExposure] = useState<FxExposureReport | null>(null);
  const [statements, setStatements] = useState<BankStatement[]>([]),
    [statementDetail, setStatementDetail] =
      useState<BankStatementDetail | null>(null),
    [unmatchedBook, setUnmatchedBook] = useState<UnmatchedBookMovement[]>([]),
    [lineMatches, setLineMatches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [accountCreateOpen, setAccountCreateOpen] = useState(false),
    [statementImportOpen, setStatementImportOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const statementImportDialog = useRef<HTMLDialogElement>(null);
  const stayAfterAccountSave = useRef(false);
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [currencyCode, setCurrencyCode] = useState("TRY"),
    [openingBalance, setOpeningBalance] = useState("0");
  const today = localDateString(),
    [statementAccountId, setStatementAccountId] = useState(""),
    [periodStart, setPeriodStart] = useState(`${today.slice(0, 8)}01`),
    [periodEnd, setPeriodEnd] = useState(today),
    [statementOpening, setStatementOpening] = useState("0"),
    [statementClosing, setStatementClosing] = useState("0"),
    [statementLines, setStatementLines] = useState<BankStatementInputLine[]>(
      [],
    ),
    [statementFileName, setStatementFileName] = useState("");
  const [movementOpen, setMovementOpen] = useState(false),
    [transferOpen, setTransferOpen] = useState(false),
    [movementDirection, setMovementDirection] = useState<"Inflow" | "Outflow">(
      "Inflow",
    ),
    [movementCategory, setMovementCategory] = useState<
      "Unclassified" | "Operating" | "Investing" | "Financing"
    >("Unclassified"),
    [movementAmount, setMovementAmount] = useState(""),
    [movementDescription, setMovementDescription] = useState(""),
    [movementReference, setMovementReference] = useState(""),
    [movementDate, setMovementDate] = useState(localDateString()),
    [toAccountId, setToAccountId] = useState(""),
    [transferAmount, setTransferAmount] = useState(""),
    [transferRate, setTransferRate] = useState("1"),
    [transferReference, setTransferReference] = useState(""),
    [transferDate, setTransferDate] = useState(localDateString());
  useEffect(() => {
    if (createOnOpen && section === "finance-accounts")
      setAccountCreateOpen(true);
  }, [createOnOpen, section]);
  useEffect(() => {
    if (section !== "finance-banks") return;
    const title = accountCreateOpen
      ? editingAccount
        ? "Banka Hesabı Düzenle"
        : "Banka Kartı Tanımlama"
      : "";
    window.dispatchEvent(
      new CustomEvent("workspace-subroute-title", {
        detail: { page: "finance-banks", title },
      }),
    );
  }, [accountCreateOpen, editingAccount, section]);
  useEffect(() => {
    const dialog = statementImportDialog.current;
    if (!statementImportOpen || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [statementImportOpen]);
  useEffect(() => {
    if (!isAccountsPage) return;
    let cancelled = false;
    api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/finance-accounts/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setAccountScreenFields(
            view.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAccountsPage, section, token]);
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (isAccountsPage) {
        setAccounts(
          await api<FinancialAccount[]>("/api/finance/accounts", token),
        );
      } else if (section === "finance-statements") {
        const [accountRows, statementRows] = await Promise.all([
          api<FinancialAccount[]>("/api/finance/accounts", token),
          api<BankStatement[]>("/api/finance/statements", token),
        ]);
        setAccounts(accountRows);
        setStatements(statementRows);
        if (!statementAccountId)
          setStatementAccountId(
            accountRows.find((a) => a.type === "Bank" && a.isActive)?.id || "",
          );
      } else if (section === "finance-maturities") {
        setMaturity(
          await api<MaturityReport>("/api/finance/maturities", token),
        );
      } else if (section === "finance-exposure") {
        setFxExposure(
          await api<FxExposureReport>("/api/finance/fx-exposure", token),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function downloadFxExposure() {
    if (!fxExposure) return;
    const csvCell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "Yön",
        "Fatura no",
        "Cari",
        "Fatura tarihi",
        "Döviz",
        "Kalan tutar",
        "Fatura kuru",
        "Fatura tarihindeki baz değer",
        "Güncel kur",
        "Bugünkü baz değer",
        "Tahmini değişim",
        "Baz para birimi",
      ],
      ...fxExposure.invoices
        .filter(
          (invoice) => invoice.currencyCode !== fxExposure.baseCurrencyCode,
        )
        .map((invoice) => [
          invoice.direction === "Receivable" ? "Alacak" : "Borç",
          invoice.invoiceCode,
          invoice.counterpartyName,
          invoice.invoiceDate,
          invoice.currencyCode,
          invoice.outstandingAmount,
          invoice.invoiceDateRate,
          invoice.historicalBaseAmount,
          invoice.currentRate,
          invoice.currentBaseAmount,
          invoice.estimatedChangeBase,
          fxExposure.baseCurrencyCode,
        ]),
    ];
    const content =
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `doviz-pozisyonu-${fxExposure.asOfDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    void load();
  }, [section, token]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(editingAccount ? `/api/finance/accounts/${editingAccount.id}` : "/api/finance/accounts", token, {
        method: editingAccount ? "PUT" : "POST",
        body: JSON.stringify({
          code,
          name,
          type: accountKind,
          currencyCode,
          openingBalance: editingAccount ? 0 : Number(openingBalance),
        }),
      });
      setCode("");
      setName("");
      setOpeningBalance("0");
      const stayForNext = !editingAccount && stayAfterAccountSave.current;
      stayAfterAccountSave.current = false;
      if (!stayForNext) setAccountCreateOpen(false);
      setEditingAccount(null);
      setNotice(
        `${accountKind === "Cash" ? "Kasa" : "Banka"} hesabı ${editingAccount ? "güncellendi" : "oluşturuldu"}.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editAccount(account: FinancialAccount) {
    setEditingAccount(account); setCode(account.code); setName(account.name);
    setCurrencyCode(account.currencyCode); setOpeningBalance("0"); setAccountCreateOpen(true);
  }
  async function deleteAccount(account: FinancialAccount) {
    if (!confirmLocalized(`“${account.name}” hesabını silmek istiyor musunuz?`)) return;
    setBusy(true); setError("");
    try {
      await api(`/api/finance/accounts/${account.id}`, token, { method: "DELETE" });
      setNotice(`${account.name} hesabı silindi.`); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function showDetail(account: { id: string }, page = 1) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
      });
      setDetail(
        await api<FinancialAccountDetail>(
          `/api/finance/accounts/${account.id}?${params}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggle(account: FinancialAccount) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/accounts/${account.id}/status?isActive=${!account.isActive}`,
        token,
        { method: "POST" },
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/finance/accounts/${detail.id}/movements`, token, {
        method: "POST",
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          transactionDate: movementDate,
          direction: movementDirection,
          amount: Number(movementAmount),
          description: movementDescription,
          reference: movementReference || null,
          cashFlowCategory: movementCategory,
        }),
      });
      setMovementOpen(false);
      setMovementAmount("");
      setMovementDescription("");
      setMovementReference("");
      setMovementCategory("Unclassified");
      setNotice("Manuel finans hareketi kaydedildi.");
      await load();
      await showDetail(accounts.find((a) => a.id === detail.id) ?? detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadCashFlow() {
    setCashFlowLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        from: cashFlowFrom,
        to: cashFlowTo,
      });
      setCashFlow(
        await api<CashFlowReport>(
          `/api/finance/general-ledger/financial-statements/cash-flow?${params}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCashFlowLoading(false);
    }
  }
  useEffect(() => {
    if (section === "finance-cash-flow") void loadCashFlow();
  }, [section, token, cashFlowFrom, cashFlowTo]);
  async function createTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<FinancialTransfer>("/api/finance/transfers", token, {
        method: "POST",
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          fromAccountId: detail.id,
          toAccountId,
          transferDate,
          amount: Number(transferAmount),
          exchangeRate: Number(transferRate),
          reference: transferReference || null,
          description: "Kasa/banka döviz transferi",
        }),
      });
      setTransferOpen(false);
      setTransferAmount("");
      setTransferRate("1");
      setTransferReference("");
      setNotice("Döviz transferi iki hesapta kaydedildi.");
      await load();
      await showDetail(accounts.find((a) => a.id === detail.id) ?? detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateCashFlowCategory(
    item: FinancialMovement,
    category: NonNullable<FinancialMovement["cashFlowCategory"]>,
  ) {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/accounts/${detail.id}/transactions/${item.id}/cash-flow-category`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ cashFlowCategory: category }),
        },
      );
      setNotice("Nakit akışı sınıfı güncellendi.");
      await load();
      await showDetail(accounts.find((a) => a.id === detail.id) ?? detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidMovement(item: FinancialMovement) {
    if (
      !detail ||
      !confirmLocalized("Bu manuel hareket ters kayıtla iptal edilsin mi?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/accounts/${detail.id}/transactions/${item.id}/void`,
        token,
        { method: "POST" },
      );
      setNotice("Hareket iptal edildi; ters kayıt oluşturuldu.");
      await load();
      await showDetail(accounts.find((a) => a.id === detail.id) ?? detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function voidTransfer(item: FinancialMovement) {
    if (
      !item.transferId ||
      !confirmLocalized(
        `Transfer ${item.sourceCode || ""} iki hesabın da ters kaydıyla iptal edilsin mi?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/finance/transfers/${item.transferId}/void`, token, {
        method: "POST",
      });
      setNotice("Transfer iki hesapta ters kayıtlarla iptal edildi.");
      await load();
      if (detail) await showDetail(detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadStatement(id: string) {
    try {
      const [statement, movements] = await Promise.all([
        api<BankStatementDetail>(`/api/finance/statements/${id}`, token),
        api<UnmatchedBookMovement[]>(
          `/api/finance/statements/${id}/unmatched-book-movements`,
          token,
        ),
      ]);
      setStatementDetail(statement);
      setUnmatchedBook(movements);
      setLineMatches({});
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importStatement(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<BankStatement>(
        `/api/finance/accounts/${statementAccountId}/statements`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            startDate: periodStart,
            endDate: periodEnd,
            openingBalance: Number(statementOpening),
            closingBalance: Number(statementClosing),
            lines: statementLines,
          }),
        },
      );
      setStatementLines([]);
      setStatementFileName("");
      setStatementImportOpen(false);
      setNotice(
        "Banka ekstresi aktarıldı; otomatik eşleştirme başlatabilirsiniz.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function autoMatch() {
    if (!statementDetail) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        matched: number;
        remaining: number;
        ambiguous: number;
      }>(`/api/finance/statements/${statementDetail.id}/auto-match`, token, {
        method: "POST",
      });
      setNotice(
        `${result.matched} satır otomatik eşleşti; ${result.remaining} satır bekliyor${result.ambiguous ? `, ${result.ambiguous} eşleşme belirsiz` : ""}.`,
      );
      await loadStatement(statementDetail.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function matchStatementLine(line: BankStatementLine) {
    if (!statementDetail || !lineMatches[line.id]) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/statements/${statementDetail.id}/lines/${line.id}/match`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            financialAccountTransactionId: lineMatches[line.id],
          }),
        },
      );
      await loadStatement(statementDetail.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postStatementLine(line: BankStatementLine) {
    if (!statementDetail) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/statements/${statementDetail.id}/lines/${line.id}/create-book-entry`,
        token,
        { method: "POST" },
      );
      setNotice(
        "Ekstre satırı banka hesabına finans hareketi olarak kaydedildi.",
      );
      await loadStatement(statementDetail.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reconcileStatement() {
    if (!statementDetail) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/statements/${statementDetail.id}/reconcile`,
        token,
        { method: "POST" },
      );
      setNotice("Banka ekstresi mutabakatı tamamlandı.");
      await loadStatement(statementDetail.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function handleStatementFile(file: File | null) {
    if (!file) return;
    setError("");
    try {
      const parsed = parseBankStatementCsv(await file.text());
      setStatementLines(parsed);
      setStatementFileName(file.name);
    } catch (e) {
      setError((e as Error).message);
      setStatementLines([]);
      setStatementFileName("");
    }
  }
  const ledgerViews: Partial<
    Record<
      FinancePageKey,
      | "overview"
      | "accounts"
      | "mappings"
      | "voucher"
      | "trial-balance"
      | "balance-sheet"
      | "journal-ledger"
      | "transfer-sources"
    >
  > = {
    "finance-ledger": "overview",
    "finance-ledger-chart": "accounts",
    "finance-ledger-mappings": "mappings",
    "finance-journal-vouchers": "voucher",
    "finance-trial-balance": "trial-balance",
    "finance-balance-sheet": "balance-sheet",
    "finance-journal-ledger": "journal-ledger",
    "finance-transfer-sources": "transfer-sources",
  };
  const accountFormOpen = accountCreateOpen && isAccountsPage;
  return (
    <div
      className={`finance-page finance-workbench-page${section === "finance-cash-flow" ? " cash-flow-page" : ""}${accountCreateOpen && isAccountsPage ? " finance-account-record-form-open" : ""}`}
    >
      {!ledgerViews[section] && !accountFormOpen && (
        <div className="page-heading">
          <div className={isAccountsPage ? "finance-account-heading-main" : undefined}>
            {isAccountsPage && <span className="finance-account-heading-icon"><Landmark size={22} /></span>}
            <div>
              <p className="eyebrow">FİNANS YÖNETİMİ</p>
              <h1>{financePageTitles[section]}</h1>
              <p className="muted">{financePageDescriptions[section]}</p>
            </div>
          </div>
          {isAccountsPage && (
            <div className="heading-actions">
              <button
                type="button"
                className="primary"
                onClick={() => { setEditingAccount(null); setCode(""); setName(""); setCurrencyCode("TRY"); setOpeningBalance("0"); setAccountCreateOpen(true); }}
              >+ Yeni {accountKind === "Cash" ? "kasa" : "banka"}</button>
            </div>
          )}
        </div>
      )}
      {accountFormOpen && (
        <section className="finance-account-record-form">
          <RecordFormPage
            title={editingAccount ? `${accountKind === "Cash" ? "Kasa" : "Banka" } Hesabı Düzenle` : `${accountKind === "Cash" ? "Kasa" : "Banka" } Kartı Tanımlama`}
            mode={editingAccount ? "edit" : "create"}
            busy={busy}
            saveLabel={editingAccount ? "Değişiklikleri Kaydet" : `${accountKind === "Cash" ? "Kasa" : "Banka" } Kartını Kaydet`}
            formId="finance-account-record-form"
            onSubmit={create}
            onCancel={() => { setAccountCreateOpen(false); setEditingAccount(null); setError(""); }}
            onSaveIntent={(stayForNext) => { stayAfterAccountSave.current = stayForNext; }}
            onReset={() => { setCode(""); setName(""); setCurrencyCode("TRY"); setOpeningBalance("0"); setError(""); setNotice(""); }}
            error={error}
            onDismissError={() => setError("")}
            status={
              <>
                <span>
                  Zorunlu alanlar: <b>{[code.trim(), name.trim(), currencyCode.trim()].filter(Boolean).length} / 3</b>
                </span>
                {notice && <span className="rf-status-notice">{notice}</span>}
                {!editingAccount && (code.trim() || name.trim()) && <span className="rf-status-end">Kaydedilmemiş değişiklik var</span>}
              </>
            }
          >
            <p className="fin-rf-hint">
              {editingAccount ? "Hesap bilgilerini güncelleyin. Açılış bakiyesi hareket kaydı olarak korunur." : "Yeni hesabın temel ve finansal bilgilerini tanımlayın."}
            </p>
            <RecordFormGroup title={accountKind === "Cash" ? "Kasa Kimliği" : "Banka Kimliği"} bodyClassName="rf-identity">
              <label><span>{accountKind === "Cash" ? "Kasa" : "Banka"} kodu<RequiredMark /></span><input className="rf-must rf-mono" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={40} placeholder={accountKind === "Cash" ? "KASA-01" : "BANKA-01"} /></label>
              <label><span>{accountKind === "Cash" ? "Kasa" : "Banka"} adı<RequiredMark /></span><input className="rf-must" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder={accountKind === "Cash" ? "Merkez kasa" : "Merkez banka hesabı"} /></label>
              <label>Hesap türü<select value={accountKind} disabled><option value="Bank">Banka</option><option value="Cash">Kasa</option></select></label>
              <label><span>Döviz kodu<RequiredMark /></span><input className="rf-must rf-mono" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} required minLength={3} maxLength={3} /></label>
            </RecordFormGroup>
            <RecordFormGroup title="Finansal Bilgiler" bodyClassName="fin-rf-grid-2">
              {editingAccount ? <p className="fin-rf-note fin-rf-span-all">Hesap bakiyesi hareketlerden hesaplanır. Açılış bakiyesi değişikliği ayrı bir hareket olarak kaydedilmelidir.</p> : <>
                <label>Açılış bakiyesi<input className="rf-num" type="number" min={accountKind === "Cash" ? 0 : undefined} step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} /></label>
                <p className="fin-rf-note">Açılış bakiyesi ayrı bir ilk hareket olarak kaydedilir ve hesap bakiyesi hareketlerden hesaplanır.</p>
              </>}
            </RecordFormGroup>
          </RecordFormPage>
        </section>
      )}
      {section === "finance-credit-facilities" && (
        <CreditFacilitiesPage token={token} role={role} />
      )}
      {section === "finance-fx" && (
        <>
          <ExchangeRatesPage token={token} role={role} />
          <FxRevaluationPage token={token} role={role} />
        </>
      )}
      {ledgerViews[section] && (
        <GeneralLedgerPage
          token={token}
          role={role}
          view={ledgerViews[section]}
          onNavigate={onNavigate}
        />
      )}
      {error && !accountFormOpen && (
        <div className="alert inline-alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && !accountFormOpen && (
        <div className="notice">
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {section === "finance-cash-flow" && (
        <CashFlowReportPanel
          token={token}
          report={cashFlow}
          loading={cashFlowLoading}
          from={cashFlowFrom}
          to={cashFlowTo}
          onFromChange={setCashFlowFrom}
          onToChange={setCashFlowTo}
          onRefresh={() => void loadCashFlow()}
        />
      )}
      {section === "finance-cash-flow" && (
        <Tms7CashFlowPage
          token={token}
          from={cashFlowFrom}
          to={cashFlowTo}
          role={role}
        />
      )}
      {section === "finance-cash-flow" && (
        <StatutoryCashFlowStatementPanel
          token={token}
          from={cashFlowFrom}
          to={cashFlowTo}
        />
      )}
      {section === "finance-cash-flow" && <CashForecastPanel token={token} />}
      {section === "finance-exposure" && (
        <div className="panel finance-exposure-panel">
          <div className="panel-heading">
            <div>
              <h3>Döviz pozisyonu · açık cari bakiyeler</h3>
              <p>
                {fxExposure?.asOfDate.split("-").reverse().join(".")} itibarıyla{" "}
                {fxExposure?.baseCurrencyCode} bazında tahmini görünüm. Kur
                farkı muhasebe kaydı oluşturmaz.
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary small-button"
                disabled={!fxExposure}
                onClick={downloadFxExposure}
              >
                CSV indir
              </button>
              <button
                className="secondary small-button"
                onClick={() => void load()}
              >
                Yenile
              </button>
            </div>
          </div>
          <div className="ledger-list">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Yön</th>
                  <th>Döviz</th>
                  <th>Açık fatura</th>
                  <th>Fatura tarihindeki değer</th>
                  <th>Bugünkü değer</th>
                  <th>Tahmini değişim</th>
                </tr>
              </thead>
              <tbody>
                {fxExposure?.summaries.map((s) => (
                  <tr key={`${s.direction}-${s.currencyCode}`}>
                    <td>
                      <b>{s.direction === "Receivable" ? "Alacak" : "Borç"}</b>
                    </td>
                    <td>{s.currencyCode}</td>
                    <td>
                      {s.invoiceCount} ·{" "}
                      {s.outstandingAmount.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      {s.historicalBaseAmount === null
                        ? "—"
                        : `${s.historicalBaseAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${fxExposure.baseCurrencyCode}`}
                    </td>
                    <td>
                      {s.currentBaseAmount === null
                        ? "—"
                        : `${s.currentBaseAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${fxExposure.baseCurrencyCode}`}
                    </td>
                    <td>
                      {s.estimatedChangeBase === null
                        ? "—"
                        : `${s.estimatedChangeBase.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${fxExposure.baseCurrencyCode}`}
                      {s.unconvertedInvoiceCount > 0 && (
                        <small className="cell-subtitle">
                          {s.unconvertedInvoiceCount} fatura için kur eksik
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
                {fxExposure?.summaries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Açık cari döviz bakiyesi bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="list-toolbar">
            <div>
              <h3>Dövizli açık faturalar</h3>
              <p>{fxExposure?.invoices.length ?? 0} kayıt</p>
            </div>
          </div>
          <div className="ledger-list">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-fx-exposure"
              defaults={financeGridDefaults["finance-fx-exposure"]}
            >
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Fatura</th>
                    <th>Cari</th>
                    <th>Yön</th>
                    <th>Fatura tarihi</th>
                    <th>Döviz</th>
                    <th>Kalan tutar</th>
                    <th>Fatura kuru</th>
                    <th>Güncel kur</th>
                    <th>Tahmini değişim</th>
                  </tr>
                </thead>
                <tbody>
                  {fxExposure?.invoices
                    .filter(
                      (x) => x.currencyCode !== fxExposure.baseCurrencyCode,
                    )
                    .map((i) => (
                      <tr key={`${i.direction}-${i.invoiceId}`}>
                        <td>
                          <span className="customer-code">{i.invoiceCode}</span>
                        </td>
                        <td>{i.counterpartyName}</td>
                        <td>
                          {i.direction === "Receivable" ? "Alacak" : "Borç"}
                        </td>
                        <td>{i.invoiceDate.split("-").reverse().join(".")}</td>
                        <td>{i.currencyCode}</td>
                        <td>
                          <b>
                            {i.outstandingAmount.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                            })}{" "}
                            {i.currencyCode}
                          </b>
                        </td>
                        <td>
                          {i.invoiceDateRate?.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 8,
                          }) ?? "Kur yok"}
                        </td>
                        <td>
                          {i.currentRate?.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 8,
                          }) ?? "Kur yok"}
                        </td>
                        <td>
                          {i.estimatedChangeBase === null
                            ? "—"
                            : `${i.estimatedChangeBase.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${fxExposure.baseCurrencyCode}`}
                        </td>
                      </tr>
                    ))}
                  {fxExposure?.invoices.filter(
                    (x) => x.currencyCode !== fxExposure.baseCurrencyCode,
                  ).length === 0 && (
                    <tr>
                      <td colSpan={9} className="table-empty">
                        Açık döviz faturası bulunmuyor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </FinanceStudioGrid>
          </div>
        </div>
      )}
      {section === "finance-maturities" && (
        <div className="maturity-workbench">
          <section className="maturity-overview" aria-label="Vade özeti">
            <article className="maturity-stat"><span>Açık fatura</span><b>{maturity?.items.length ?? 0}</b><small>Alış ve satış faturaları</small></article>
            <article className="maturity-stat"><span>Alacak faturası</span><b>{receivableMaturityCount}</b><small>Açık satış faturası</small></article>
            <article className="maturity-stat"><span>Borç faturası</span><b>{payableMaturityCount}</b><small>Açık alış faturası</small></article>
            <article className="maturity-stat maturity-stat-warning"><span>Vadesi geçmiş</span><b>{overdueMaturityCount}</b><small>Ödeme tarihi geçen</small></article>
          </section>
          <section className="maturity-filter-card" aria-label="Vade filtreleri">
            <div>
              <h3>Filtreler</h3>
              <p>Açık faturaları fatura numarası, cari veya işlem yönüne göre daraltın.</p>
            </div>
            <label>
              Fatura veya cari ara
              <input type="search" value={maturityQuery} onChange={(event) => setMaturityQuery(event.target.value)} placeholder="Fatura no veya cari adı" />
            </label>
            <label>
              Yön
              <select value={maturityDirection} onChange={(event) => setMaturityDirection(event.target.value as "all" | "Receivable" | "Payable")}>
                <option value="all">Alacak ve borç</option>
                <option value="Receivable">Alacak</option>
                <option value="Payable">Borç</option>
              </select>
            </label>
            <span className="maturity-filter-count">{maturityItems.length} fatura</span>
          </section>
          <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Vade takibi</h3>
              <p>
                {maturity?.asOfDate.split("-").reverse().join(".")} itibarıyla
                açık satış ve alış faturaları. Satış vadesi cari ödeme gününden
                hesaplanır.
              </p>
            </div>
          </div>
          <div className="ledger-list">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-maturity-aging"
              defaults={financeGridDefaults["finance-maturity-aging"]}
            >
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Yön</th>
                    <th>Döviz</th>
                    <th>Fatura</th>
                    <th>Vadesi gelmemiş</th>
                    <th>1–30 gün</th>
                    <th>31–60 gün</th>
                    <th>61–90 gün</th>
                    <th>90+ gün</th>
                  </tr>
                </thead>
                <tbody>
                  {maturitySummaries.map((s) => (
                    <tr key={`${s.direction}-${s.currencyCode}`}>
                      <td>
                        <b>
                          {s.direction === "Receivable" ? "Alacak" : "Borç"}
                        </b>
                      </td>
                      <td>{s.currencyCode}</td>
                      <td>
                        {s.invoiceCount} ·{" "}
                        {s.outstandingAmount.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        {s.notDue.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        {s.days1To30.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        {s.days31To60.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        {s.days61To90.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        {s.over90Days.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                  {maturitySummaries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="table-empty">
                        Açık vadeli fatura bulunmuyor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </FinanceStudioGrid>
          </div>
          <div className="list-toolbar">
            <div>
              <h3>Açık faturalar</h3>
              <p>{maturityItems.length} kayıt</p>
            </div>
          </div>
          <div className="ledger-list">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-maturities"
              defaults={financeGridDefaults["finance-maturities"]}
            >
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Fatura</th>
                    <th>Cari</th>
                    <th>Yön</th>
                    <th>Fatura tarihi</th>
                    <th>Vade tarihi</th>
                    <th>Kalan tutar</th>
                    <th>Gecikme</th>
                  </tr>
                </thead>
                <tbody>
                  {maturityItems.map((i) => (
                    <tr key={`${i.direction}-${i.invoiceId}`}>
                      <td>
                        <span className="customer-code">{i.invoiceCode}</span>
                      </td>
                      <td>{i.counterpartyName}</td>
                      <td>
                        {i.direction === "Receivable" ? "Alacak" : "Borç"}
                      </td>
                      <td>{i.invoiceDate.split("-").reverse().join(".")}</td>
                      <td>{i.dueDate.split("-").reverse().join(".")}</td>
                      <td>
                        <b>
                          {i.outstandingAmount.toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          {i.currencyCode}
                        </b>
                      </td>
                      <td>
                        {i.daysOverdue
                          ? `${i.daysOverdue} gün`
                          : "Vadesi gelmedi"}
                      </td>
                    </tr>
                  ))}
                  {maturityItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="table-empty">
                        {maturity?.items.length ? "Filtrelere uygun açık fatura bulunmuyor." : "Açık fatura bulunmuyor."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </FinanceStudioGrid>
          </div>
          </div>
        </div>
      )}
      {isAccountsPage && (
        <div className="finance-summary-strip">
          <div>
            <span className="finance-summary-icon blue"><Wallet size={19} /></span>
            <div><small>Toplam {accountKind === "Cash" ? "kasa" : "banka"}</small><b>{kindAccounts.length}</b></div>
          </div>
          <div>
            <span className="finance-summary-icon green"><Landmark size={19} /></span>
            <div><small>Aktif {accountKind === "Cash" ? "kasa" : "banka"}</small><b>{kindAccounts.filter((a) => a.isActive).length}</b></div>
          </div>
          <div>
            <span className="finance-summary-icon violet"><Activity size={19} /></span>
            <div><small>Toplam hareket</small><b>{kindAccounts.reduce((sum, a) => sum + a.transactionCount, 0).toLocaleString("tr-TR")}</b></div>
          </div>
        </div>
      )}
      {isAccountsPage && (
        <FinanceAccountsToolbar
          query={accountQueryDraft}
          status={accountStateDraft}
          onQueryChange={setAccountQueryDraft}
          onStatusChange={setAccountStateDraft}
          onApply={() => { setAccountQuery(accountQueryDraft); setAccountStateFilter(accountStateDraft); }}
        />
      )}
      {isAccountsPage && (
        <section className="ledger-list finance-accounts-grid-panel">
          <div className="erp-pane-heading">
            <div>
              <h2>{accountKind === "Cash" ? "Kasalar" : "Bankalar"}</h2>
              <p>{visibleAccounts.length} / {kindAccounts.length} kayıt</p>
            </div>
          </div>
          <FinanceAccountsGrid
            token={token}
            loading={loading}
            busy={busy}
            accounts={visibleAccounts}
            fields={visibleAccountFields}
            onShowDetail={(account) => void showDetail(account)}
            onToggle={(account) => void toggle(account)}
            onEdit={editAccount}
            onDelete={(account) => void deleteAccount(account)}
          />
        </section>
      )}
      {section === "finance-statements" && (
        <BankStatementsGrid
          token={token}
          statements={statements}
          loading={loading}
          onOpen={(statement) => void loadStatement(statement.id)}
        />
      )}
      {section === "finance-statements" && (
        <BankStatementImportPrompt
          onImport={() => setStatementImportOpen(true)}
        />
      )}
      {section === "finance-statements" && statementDetail && (
        <BankStatementDetailPanel
          token={token}
          statement={statementDetail}
          unmatchedBook={unmatchedBook}
          lineMatches={lineMatches}
          busy={busy}
          onClose={() => setStatementDetail(null)}
          onAutoMatch={() => void autoMatch()}
          onReconcile={() => void reconcileStatement()}
          onMatchLine={(line) => void matchStatementLine(line)}
          onPostLine={(line) => void postStatementLine(line)}
          onLineMatchChange={(lineId, transactionId) =>
            setLineMatches((current) => ({
              ...current,
              [lineId]: transactionId,
            }))
          }
        />
      )}
      <dialog
        ref={statementImportDialog}
        className="finance-form-dialog finance-statement-dialog fin-rf-dialog"
        onCancel={(event) => {
          event.preventDefault();
          setStatementImportOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget)
            setStatementImportOpen(false);
        }}
      >
        {statementImportOpen && (
          <RecordFormPage
            variant="dialog"
            title="Banka ekstresi içe aktar"
            mode="create"
            busy={busy}
            saveLabel="Ekstreyi aktar"
            onSubmit={(event) => {
              if (!statementAccountId || !statementFileName) {
                event.preventDefault();
                return;
              }
              void importStatement(event);
            }}
            onCancel={() => {
              if (!busy) setStatementImportOpen(false);
            }}
            error={error}
            onDismissError={() => setError("")}
            status={
              <span>
                {statementFileName
                  ? `${statementFileName} · ${statementLines.length} satır okundu`
                  : "CSV başlıkları date, amount, description; reference ve externalId alanları isteğe bağlıdır."}
              </span>
            }
          >
            <div className="fin-rf-bar">
              <p className="fin-rf-hint">
                İmzalı tutar kullanın: pozitif giriş, negatif çıkış. Bakiye
                toplamı API tarafından doğrulanır.
              </p>
              <a
                className="link-button"
                href="data:text/csv;charset=utf-8,date%2Camount%2Cdescription%2Creference%2CexternalId%0A2026-10-01%2C1250.00%2CM%C3%BC%C5%9Fteri%20tahsilat%C4%B1%2CREF-01%2CTX-001%0A2026-10-02%2C-25.00%2CBanka%20masraf%C4%B1%2CREF-02%2CTX-002"
                download="banka-ekstresi-ornek.csv"
              >
                CSV örneği indir
              </a>
            </div>
            <RecordFormGroup title="Ekstre Kimliği" bodyClassName="fin-rf-grid-2">
              <label>
                <span>
                  Banka hesabı
                  <RequiredMark />
                </span>
                <select
                  className="rf-must"
                  value={statementAccountId}
                  onChange={(e) => setStatementAccountId(e.target.value)}
                  required
                >
                  <option value="">Hesap seçin</option>
                  {accounts
                    .filter((a) => a.type === "Bank" && a.isActive)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name} ({a.currencyCode})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>
                  CSV dosyası
                  <RequiredMark />
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) =>
                    void handleStatementFile(e.target.files?.[0] || null)
                  }
                  required
                />
              </label>
            </RecordFormGroup>
            <RecordFormGroup title="Dönem ve Bakiyeler" bodyClassName="fin-rf-grid-4">
              <label>
                <span>
                  Dönem başlangıcı
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>
                  Dönem bitişi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>
                  Açılış bakiyesi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-num"
                  type="number"
                  step="0.01"
                  value={statementOpening}
                  onChange={(e) => setStatementOpening(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>
                  Kapanış bakiyesi
                  <RequiredMark />
                </span>
                <input
                  className="rf-must rf-num"
                  type="number"
                  step="0.01"
                  value={statementClosing}
                  onChange={(e) => setStatementClosing(e.target.value)}
                  required
                />
              </label>
            </RecordFormGroup>
          </RecordFormPage>
        )}
      </dialog>
      {isAccountsPage && detail && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="modal ledger-modal account-transactions-modal">
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {detail.code} · {detail.type === "Cash" ? "KASA" : "BANKA"}
                </p>
                <h2>{detail.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setDetail(null)}>
                <X size={19} />
              </button>
            </div>
            <div className="balance-banner">
              <div>
                <small>Hesap bakiyesi · {detail.currencyCode}</small>
                <b>
                  {detail.balance.toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  {detail.currencyCode}
                </b>
              </div>
            </div>
            <div className="modal-foot">
              <span>Hesap işlemleri</span>
              <div>
                <button
                  className="secondary"
                  disabled={busy || !detail.isActive}
                  onClick={() => {
                    setMovementDirection("Inflow");
                    setTransferOpen(false);
                    setMovementOpen(true);
                  }}
                >
                  Manuel hareket
                </button>
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    !detail.isActive ||
                    !accounts.some((a) => a.id !== detail.id && a.isActive)
                  }
                  onClick={() => {
                    setToAccountId("");
                    setTransferRate("1");
                    setMovementOpen(false);
                    setTransferOpen(true);
                  }}
                >
                  Transfer / döviz
                </button>
              </div>
            </div>
            {movementOpen && (
              <RecordFormPage
                variant="dialog"
                className="fin-rf-inline"
                title="Manuel hareket"
                mode="create"
                busy={busy}
                saveLabel="Kaydet"
                onSubmit={createMovement}
                onCancel={() => setMovementOpen(false)}
                status={<span>Nakit çıkışı hesap bakiyesini aşamaz.</span>}
              >
                <RecordFormGroup title="Hareket Bilgileri" bodyClassName="fin-rf-grid-4">
                  <label>
                    Yön
                    <select
                      value={movementDirection}
                      onChange={(e) =>
                        setMovementDirection(
                          e.target.value as "Inflow" | "Outflow",
                        )
                      }
                    >
                      <option value="Inflow">Giriş</option>
                      <option value="Outflow">Çıkış</option>
                    </select>
                  </label>
                  <label>
                    <span>
                      Tarih
                      <RequiredMark />
                    </span>
                    <input
                      className="rf-must"
                      type="date"
                      value={movementDate}
                      onChange={(e) => setMovementDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Tutar ({detail.currencyCode})
                    <input
                      className="rf-must rf-num"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={movementAmount}
                      onChange={(e) => setMovementAmount(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Referans
                    <input
                      value={movementReference}
                      onChange={(e) => setMovementReference(e.target.value)}
                      maxLength={100}
                    />
                  </label>
                  <label className="fin-rf-span-2">
                    <span>
                      Açıklama
                      <RequiredMark />
                    </span>
                    <input
                      className="rf-must"
                      value={movementDescription}
                      onChange={(e) => setMovementDescription(e.target.value)}
                      required
                      maxLength={240}
                    />
                  </label>
                  <label className="fin-rf-span-2">
                    Nakit akışı sınıfı
                    <select
                      value={movementCategory}
                      onChange={(e) =>
                        setMovementCategory(
                          e.target.value as typeof movementCategory,
                        )
                      }
                    >
                      <option value="Unclassified">Sınıflandırılmamış</option>
                      <option value="Operating">İşletme faaliyeti</option>
                      <option value="Investing">Yatırım faaliyeti</option>
                      <option value="Financing">Finansman faaliyeti</option>
                    </select>
                  </label>
                </RecordFormGroup>
              </RecordFormPage>
            )}
            {transferOpen && (
              <RecordFormPage
                variant="dialog"
                className="fin-rf-inline"
                title="Transfer / döviz"
                mode="create"
                busy={busy}
                saveLabel="Döviz transferi kaydet"
                onSubmit={(event) => {
                  if (!toAccountId || !transferAmount) {
                    event.preventDefault();
                    return;
                  }
                  void createTransfer(event);
                }}
                onCancel={() => setTransferOpen(false)}
                status={
                  <span>
                    Kur kaynak para biriminden hedef para birimine uygulanır.
                    Kasa bakiyesi kontrol edilir.
                  </span>
                }
              >
                <RecordFormGroup title="Transfer Bilgileri" bodyClassName="fin-rf-grid-4">
                  <label className="fin-rf-span-2">
                    <span>
                      Hedef hesap
                      <RequiredMark />
                    </span>
                    <select
                      className="rf-must"
                      value={toAccountId}
                      onChange={(e) => {
                        setToAccountId(e.target.value);
                        const selected = accounts.find(
                          (a) => a.id === e.target.value,
                        );
                        if (selected?.currencyCode === detail.currencyCode)
                          setTransferRate("1");
                      }}
                      required
                    >
                      <option value="">Hesap seçin</option>
                      {accounts
                        .filter((a) => a.id !== detail.id && a.isActive)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name} ({a.currencyCode})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>
                      Transfer tarihi
                      <RequiredMark />
                    </span>
                    <input
                      className="rf-must"
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>
                      Referans{" "}
                      <span className="optional-label">İsteğe bağlı</span>
                    </span>
                    <input
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Kaynak tutarı ({detail.currencyCode})
                    <input
                      className="rf-must rf-num"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      required
                    />
                  </label>
                  {accounts.find((a) => a.id === toAccountId)?.currencyCode !==
                    detail.currencyCode && (
                    <label>
                      Kur · 1 {detail.currencyCode} = ?{" "}
                      {accounts.find((a) => a.id === toAccountId)?.currencyCode}
                      <input
                        className="rf-must rf-num"
                        type="number"
                        min="0.00000001"
                        step="0.00000001"
                        value={transferRate}
                        onChange={(e) => setTransferRate(e.target.value)}
                        required
                      />
                    </label>
                  )}
                  <label>
                    Hedef tutar (
                    {accounts.find((a) => a.id === toAccountId)?.currencyCode ||
                      "—"}
                    )
                    <input
                      className="rf-num"
                      value={
                        toAccountId && transferAmount
                          ? `${(Number(transferAmount) * Number(transferRate)).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : ""
                      }
                      readOnly
                    />
                  </label>
                </RecordFormGroup>
              </RecordFormPage>
            )}
            <div className="ledger-list">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-account-transactions"
                defaults={financeGridDefaults["finance-account-transactions"]}
              >
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Kaynak</th>
                      <th>Açıklama</th>
                      <th>Nakit akışı</th>
                      <th>Referans</th>
                      <th>Giriş</th>
                      <th>Çıkış</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.transactions.map((t) => (
                      <tr key={t.id}>
                        <td>
                          {t.transactionDate.split("-").reverse().join(".")}
                        </td>
                        <td>
                          {t.sourceType
                            ? `${t.sourceType} ${t.sourceCode || ""}`
                            : "Manuel / ters kayıt"}
                        </td>
                        <td>{t.description}</td>
                        <td>
                          <select
                            aria-label="Nakit akışı sınıfı"
                            disabled={
                              role !== "TenantAdmin" ||
                              busy ||
                              t.cashFlowCategory === "InternalTransfer" ||
                              t.cashFlowCategory === "OpeningBalance"
                            }
                            value={t.cashFlowCategory || "Unclassified"}
                            onChange={(e) =>
                              void updateCashFlowCategory(
                                t,
                                e.target.value as NonNullable<
                                  FinancialMovement["cashFlowCategory"]
                                >,
                              )
                            }
                          >
                            <option value="Unclassified">
                              Sınıflandırılmamış
                            </option>
                            <option value="Operating">İşletme</option>
                            <option value="Investing">Yatırım</option>
                            <option value="Financing">Finansman</option>
                            {t.cashFlowCategory === "InternalTransfer" && (
                              <option value="InternalTransfer">
                                İç transfer
                              </option>
                            )}
                            {t.cashFlowCategory === "OpeningBalance" && (
                              <option value="OpeningBalance">Açılış</option>
                            )}
                          </select>
                        </td>
                        <td>{t.reference || "—"}</td>
                        <td>
                          {t.direction === "Inflow"
                            ? t.amount.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                        <td>
                          {t.direction === "Outflow"
                            ? t.amount.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                              })
                            : "—"}
                        </td>
                        <td>
                          {t.sourceType === "Manuel hareket" &&
                            !t.reversalOfId && (
                              <button
                                className="row-action danger-action"
                                disabled={busy}
                                onClick={() => void voidMovement(t)}
                              >
                                İptal
                              </button>
                            )}
                          {t.sourceType === "Hesap transferi" &&
                            !t.reversalOfId && (
                              <button
                                className="row-action danger-action"
                                disabled={busy}
                                onClick={() => void voidTransfer(t)}
                              >
                                Transferi iptal et
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                    {detail.transactions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="table-empty">
                          Hesap hareketi yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </FinanceStudioGrid>
            </div>
            <div className="modal-foot transaction-pagination">
              <span>
                {detail.transactionTotalCount === 0
                  ? 0
                  : (detail.transactionPage - 1) * detail.transactionPageSize +
                    1}
                –
                {Math.min(
                  detail.transactionPage * detail.transactionPageSize,
                  detail.transactionTotalCount,
                )}{" "}
                / {detail.transactionTotalCount} hareket
              </span>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={detail.transactionPage <= 1}
                  onClick={() =>
                    void showDetail(detail, detail.transactionPage - 1)
                  }
                >
                  Önceki
                </button>
                <span>
                  Sayfa {detail.transactionPage} /{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      detail.transactionTotalCount / detail.transactionPageSize,
                    ),
                  )}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    detail.transactionPage * detail.transactionPageSize >=
                    detail.transactionTotalCount
                  }
                  onClick={() =>
                    void showDetail(detail, detail.transactionPage + 1)
                  }
                >
                  Sonraki
                </button>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => setDetail(null)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { FinancePage };
