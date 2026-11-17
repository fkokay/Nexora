import { lazy, useEffect, useRef, useState } from "react";
import { Download, Info, Landmark, X } from "lucide-react";
import { api, parseBankStatementCsv, localDateString } from "./erpApi";
import { FinanceStudioGrid } from "./FinanceStudioGrid";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { CashFlowReportPanel } from "./finance/components/CashFlowReportPanel";
import { MaturityReportView } from "./finance/components/MaturityReportView";
import { FinanceAccountsList } from "./finance/components/FinanceAccountsList";
import { FinanceAccountStatement } from "./finance/components/FinanceAccountStatement";
import { DetailDrawer } from "./document-detail/DocumentDetailLayout";
import {
  BankStatementList,
  exportBankStatements,
  filterBankStatements,
  type BankStatementStatusFilter,
} from "./finance/components/BankStatementList";
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
import { confirmDialog } from "./confirmDialog";
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
    >("all");
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
  // list-v2: the page toolbar hosts the list's own tools (columns, pivot, export…).
  const searchedAccounts = kindAccounts.filter((account) =>
    `${account.code} ${account.name} ${account.currencyCode}`
      .toLocaleLowerCase("tr-TR")
      .includes(accountQuery.toLocaleLowerCase("tr-TR")),
  );
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
    [lineMatches, setLineMatches] = useState<Record<string, string>>({}),
    [statementSearch, setStatementSearch] = useState(""),
    [statementStatus, setStatementStatus] =
      useState<BankStatementStatusFilter>("");
  const visibleStatements = filterBankStatements(
    statements,
    statementSearch,
    statementStatus,
  );
  // The first listed statement opens once per visit when nothing is selected yet.
  const statementAutoSelected = useRef(false);
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
    statementAutoSelected.current = false;
  }, [section]);
  useEffect(() => {
    if (
      section !== "finance-statements" ||
      loading ||
      statementDetail ||
      statementAutoSelected.current
    )
      return;
    const first = visibleStatements[0];
    if (!first) return;
    statementAutoSelected.current = true;
    void loadStatement(first.id);
  });
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
  function startCreateAccount() {
    setEditingAccount(null); setCode(""); setName(""); setCurrencyCode("TRY"); setOpeningBalance("0"); setAccountCreateOpen(true);
  }
  function editAccount(account: FinancialAccount) {
    setEditingAccount(account); setCode(account.code); setName(account.name);
    setCurrencyCode(account.currencyCode); setOpeningBalance("0"); setAccountCreateOpen(true);
  }
  /** Resolves true once the account is deleted (false: not confirmed or refused by the server). */
  async function deleteAccount(account: FinancialAccount): Promise<boolean> {
    if (!(await confirmDialog({ title: "Hesap silinsin mi?", message: `“${account.name}” hesabı silinecek. Bu işlem geri alınamaz.`, tone: "danger", confirmLabel: "Sil" }))) return false;
    setBusy(true); setError("");
    try {
      await api(`/api/finance/accounts/${account.id}`, token, { method: "DELETE" });
      setNotice(`${account.name} hesabı silindi.`); await load();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
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
      !(await confirmDialog({
        title: "Manuel hareket iptal edilsin mi?",
        message: "Hareket ters kayıtla iptal edilir; özgün kayıt korunur.",
        tone: "warning",
        confirmLabel: "Ters kayıtla iptal et",
      }))
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
      !(await confirmDialog({
        title: "Transfer iptal edilsin mi?",
        message: `${item.sourceCode || "Transfer"} için iki hesaba da ters kayıt yazılır; özgün kayıtlar korunur.`,
        tone: "warning",
        confirmLabel: "Ters kayıtla iptal et",
      }))
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
  const isListSection = isAccountsPage || section === "finance-statements";
  // Vade Takibi is a report screen: LedgerReportFrame draws its own header.
  const isReportSection = section === "finance-maturities";
  const showListHeader = isListSection && !(accountCreateOpen && isAccountsPage);
  return (
    <div
      className={`finance-page finance-workbench-page${section === "finance-cash-flow" ? " cash-flow-page" : ""}${accountCreateOpen && isAccountsPage ? " finance-account-record-form-open" : ""}${isListSection ? " list-v2" : ""}${isAccountsPage ? " fin-acc-page" : ""}${section === "finance-statements" ? " fh-page cf-page bank-statements-page" : ""}${isReportSection ? " list-v2 fh-page ledger-report-host maturity-report-page" : ""}`}
    >
      {showListHeader && (
        <ListPageHeader
          title={financePageTitles[section]}
          description={financePageDescriptions[section]}
          count={
            isAccountsPage
              ? loading ? null : kindAccounts.length
              : section === "finance-statements"
                ? loading ? null : statements.length
                : null
          }
        >
          {section === "finance-statements" && (
            <>
              <button
                type="button"
                className="secondary"
                disabled={visibleStatements.length === 0}
                title="Listelenen ekstreleri XLSX olarak indir"
                onClick={() =>
                  void exportBankStatements(visibleStatements, "xlsx", localDateString()).catch(() =>
                    setError("XLSX dosyası oluşturulamadı."),
                  )
                }
              >
                <Download size={15} aria-hidden="true" /> XLSX
              </button>
              <button
                type="button"
                className="secondary"
                disabled={visibleStatements.length === 0}
                title="Listelenen ekstreleri CSV olarak indir"
                onClick={() =>
                  void exportBankStatements(visibleStatements, "csv", localDateString()).catch(() =>
                    setError("CSV dosyası oluşturulamadı."),
                  )
                }
              >
                <Download size={15} aria-hidden="true" /> CSV
              </button>
              <button type="button" className="primary" onClick={() => setStatementImportOpen(true)}>
                Banka ekstresi içe aktar
              </button>
            </>
          )}
        </ListPageHeader>
      )}
      {!ledgerViews[section] && !showListHeader && !accountFormOpen && !isReportSection && (
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
              {editingAccount ? <p className="fin-rf-field-hint fin-rf-span-all"><Info size={14} aria-hidden="true" /><span>Hesap bakiyesi hareketlerden hesaplanır. Açılış bakiyesi değişikliği ayrı bir hareket olarak kaydedilmelidir.</span></p> : <>
                <label>Açılış bakiyesi
                  <span className="fin-rf-amount"><input className="rf-num" type="number" min={accountKind === "Cash" ? 0 : undefined} step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} aria-describedby="finance-opening-balance-hint" /><span className="fin-rf-suffix" aria-hidden="true">{currencyCode || "—"}</span></span>
                  <small id="finance-opening-balance-hint" className="fin-rf-field-hint"><Info size={14} aria-hidden="true" /><span>Açılış bakiyesi ayrı bir ilk hareket olarak kaydedilir ve hesap bakiyesi hareketlerden hesaplanır.</span></small>
                </label>
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
      {error && !accountFormOpen && !(section === "finance-statements" && statementDetail) && (
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
        <MaturityReportView
          token={token}
          title={financePageTitles[section]}
          description={financePageDescriptions[section]}
          maturity={maturity}
          loading={loading}
          onRun={() => void load()}
          query={maturityQuery}
          onQueryChange={setMaturityQuery}
          direction={maturityDirection}
          onDirectionChange={setMaturityDirection}
          items={maturityItems}
          summaries={maturitySummaries}
          overdueCount={overdueMaturityCount}
          receivableCount={receivableMaturityCount}
          payableCount={payableMaturityCount}
        />
      )}
      {isAccountsPage && !accountCreateOpen && (
        <FinanceAccountsList
          kind={accountKind}
          active={!detail}
          loading={loading}
          busy={busy}
          allAccounts={accounts}
          kindAccounts={kindAccounts}
          accounts={visibleAccounts}
          fields={visibleAccountFields.filter((field) => field.key !== "actions")}
          query={accountQueryDraft}
          status={accountStateFilter}
          counts={{
            all: searchedAccounts.length,
            active: searchedAccounts.filter((account) => account.isActive).length,
            inactive: searchedAccounts.filter((account) => !account.isActive).length,
          }}
          onQueryChange={setAccountQueryDraft}
          onStatusChange={setAccountStateFilter}
          onApplyQuery={() => setAccountQuery(accountQueryDraft)}
          onRefresh={() => void load()}
          onCreate={startCreateAccount}
          onOpen={(account) => void showDetail(account)}
          onEdit={editAccount}
          onToggle={(account) => void toggle(account)}
          onDelete={(account) => void deleteAccount(account)}
          onNewMovement={(account) =>
            void showDetail(account).then(() => {
              setMovementDirection("Inflow");
              setTransferOpen(false);
              setMovementOpen(true);
            })
          }
          onNewTransfer={(account) =>
            void showDetail(account).then(() => {
              setToAccountId("");
              setTransferRate("1");
              setMovementOpen(false);
              setTransferOpen(true);
            })
          }
        />
      )}
      {section === "finance-statements" && (
        <div className="cf-layout bst-layout">
          <BankStatementList
            statements={statements}
            visibleStatements={visibleStatements}
            selectedId={statementDetail?.id ?? null}
            loading={loading}
            search={statementSearch}
            status={statementStatus}
            onSearchChange={setStatementSearch}
            onStatusChange={setStatementStatus}
            onRefresh={() => void load()}
            onSelect={(statement) => void loadStatement(statement.id)}
            onClearFilters={() => {
              setStatementSearch("");
              setStatementStatus("");
            }}
            onImport={() => setStatementImportOpen(true)}
          />
          {statementDetail ? (
            <BankStatementDetailPanel
              key={statementDetail.id}
              token={token}
              statement={statementDetail}
              unmatchedBook={unmatchedBook}
              lineMatches={lineMatches}
              busy={busy}
              error={statementImportOpen ? "" : error}
              onDismissError={() => setError("")}
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
          ) : (
            <section className="cf-detail">
              <p className="fh-empty">
                {loading
                  ? "Ekstreler yükleniyor…"
                  : statements.length
                    ? "Ayrıntıları görmek için soldan bir banka ekstresi seçin."
                    : "İçe aktarılan banka ekstresi burada satırlarıyla açılır."}
              </p>
            </section>
          )}
        </div>
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
        <FinanceAccountStatement
          token={token}
          detail={detail}
          accounts={accounts}
          role={role}
          busy={busy}
          error={error}
          notice={notice}
          onDismissError={() => setError("")}
          onDismissNotice={() => setNotice("")}
          onClose={() => {
            setDetail(null);
            setMovementOpen(false);
            setTransferOpen(false);
          }}
          onPage={(page) => void showDetail(detail, page)}
          onCreateAccount={() => {
            setDetail(null);
            startCreateAccount();
          }}
          onEdit={() => {
            const account = accounts.find((row) => row.id === detail.id);
            if (!account) return;
            setDetail(null);
            editAccount(account);
          }}
          onToggle={() => {
            const account = accounts.find((row) => row.id === detail.id);
            if (account) void toggle(account).then(() => showDetail(detail, detail.transactionPage));
          }}
          onDelete={() => {
            const account = accounts.find((row) => row.id === detail.id);
            if (account) void deleteAccount(account).then((deleted) => { if (deleted) setDetail(null); });
          }}
          onNewMovement={() => {
            setMovementDirection("Inflow");
            setTransferOpen(false);
            setMovementOpen(true);
          }}
          onNewTransfer={() => {
            setToAccountId("");
            setTransferRate("1");
            setMovementOpen(false);
            setTransferOpen(true);
          }}
          onVoidMovement={(item) => void voidMovement(item)}
          onVoidTransfer={(item) => void voidTransfer(item)}
          onCategoryChange={(item, category) => void updateCashFlowCategory(item, category)}
          drawer={
            <DetailDrawer
              open={movementOpen || transferOpen}
              label={movementOpen ? "Manuel hareket" : "Transfer / döviz"}
              onClose={() => {
                setMovementOpen(false);
                setTransferOpen(false);
              }}
            >
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
                    <span>Tutar ({detail.currencyCode}) <RequiredMark /></span>
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
                    <span>Kaynak tutarı ({detail.currencyCode}) <RequiredMark /></span>
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
                      <span>
                        Kur · 1 {detail.currencyCode} = ?{" "}
                        {accounts.find((a) => a.id === toAccountId)?.currencyCode} <RequiredMark />
                      </span>
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
            </DetailDrawer>
          }
        />
      )}
    </div>
  );
}

export { FinancePage };
