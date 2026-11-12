import { useCallback, useEffect, useRef, useState } from "react";
import { api, localDateString } from "./erpApi";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  ListTree,
  Search,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { FinanceStudioGrid } from "./FinanceStudioGrid";
import { financeGridDefaults, ledgerStatementLabels } from "./financeCatalog";
import { ManualJournalForm } from "./general-ledger/components/ManualJournalForm";
import { LedgerReportsPanel } from "./general-ledger/components/LedgerReportsPanel";
import { AccountingRuleProfilesPanel } from "./general-ledger/AccountingRuleProfilesPanel";
import type {
  LedgerAccount,
  LedgerMapping,
  JournalEntrySummary,
  LedgerTrialBalance,
  BalanceSheet,
  IncomeStatement,
  LedgerStatementSection,
  LedgerSource,
  JournalEntryView,
} from "./erp-types";
import { confirmLocalized } from "./locale";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "./record-form/RecordForm";
import "./finance-record-forms.css";

type LedgerView =
  | "overview"
  | "accounts"
  | "mappings"
  | "voucher"
  | "trial-balance"
  | "balance-sheet"
  | "journal-ledger"
  | "transfer-sources";

type LedgerTransferSourceType =
  | "SalesInvoice"
  | "SalesDelivery"
  | "PurchaseInvoice"
  | "PurchaseReceipt"
  | "SalesReturn"
  | "SupplierReturn"
  | "CustomerCollection"
  | "SupplierPayment"
  | "FxRevaluation"
  | "InventoryCostAdjustment";

type LedgerAccountTreeRow = {
  account: LedgerAccount;
  depth: number;
  hasChildren: boolean;
};
function buildLedgerAccountTree(
  accounts: LedgerAccount[],
  collapsedCodes: Set<string>,
): LedgerAccountTreeRow[] {
  const byCode = new Map(
    accounts.map((account) => [
      account.code.toLocaleLowerCase("tr-TR"),
      account,
    ]),
  );
  const children = new Map<string, LedgerAccount[]>();
  const roots: LedgerAccount[] = [];
  for (const account of accounts) {
    const separator = account.code.lastIndexOf(".");
    const parentCode = separator > 0 ? account.code.slice(0, separator) : "";
    const parent = parentCode
      ? byCode.get(parentCode.toLocaleLowerCase("tr-TR"))
      : undefined;
    if (parent) {
      const key = parent.code.toLocaleLowerCase("tr-TR");
      children.set(key, [...(children.get(key) || []), account]);
    } else roots.push(account);
  }
  const sort = (items: LedgerAccount[]) =>
    items.sort((a, b) =>
      a.code.localeCompare(b.code, "tr", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const rows: LedgerAccountTreeRow[] = [];
  const append = (items: LedgerAccount[], depth: number) => {
    for (const account of sort(items)) {
      const key = account.code.toLocaleLowerCase("tr-TR"),
        nested = children.get(key) || [];
      rows.push({ account, depth, hasChildren: nested.length > 0 });
      if (nested.length && !collapsedCodes.has(account.code))
        append(nested, depth + 1);
    }
  };
  append(roots, 0);
  return rows;
}

export default function GeneralLedgerPage({
  token,
  role,
  view = "overview",
  onNavigate,
}: {
  token: string;
  role: string;
  view?: LedgerView;
  onNavigate?: (page: string) => void;
}) {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]),
    [mappings, setMappings] = useState<LedgerMapping[]>([]),
    [entries, setEntries] = useState<JournalEntrySummary[]>([]),
    [entryPage, setEntryPage] = useState(1),
    [entryTotal, setEntryTotal] = useState(0),
    [entryFrom, setEntryFrom] = useState(""),
    [entryTo, setEntryTo] = useState("");
  const [trialBalance, setTrialBalance] = useState<LedgerTrialBalance | null>(
      null,
    ),
    [trialFrom, setTrialFrom] = useState(""),
    [trialTo, setTrialTo] = useState("");
  const [reportingBasis, setReportingBasis] = useState<"TDHP" | "IFRS">("TDHP");
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null),
    [balanceSheetDate, setBalanceSheetDate] = useState(localDateString());
  const [incomeStatement, setIncomeStatement] =
      useState<IncomeStatement | null>(null),
    [incomeFrom, setIncomeFrom] = useState(`${new Date().getFullYear()}-01-01`),
    [incomeTo, setIncomeTo] = useState(localDateString());
  const [manualDate, setManualDate] = useState(localDateString()),
    [manualAccountingBasis, setManualAccountingBasis] = useState<"TDHP" | "IFRS">("TDHP"),
    [manualDescription, setManualDescription] = useState(""),
    [manualLines, setManualLines] = useState([
      { accountId: "", description: "", debit: "0", credit: "0" },
      { accountId: "", description: "", debit: "0", credit: "0" },
    ]);
  const [editingAccountId, setEditingAccountId] = useState(""),
    [editingAccountCode, setEditingAccountCode] = useState(""),
    [editingAccountName, setEditingAccountName] = useState(""),
    [editingAccountSection, setEditingAccountSection] =
      useState<LedgerStatementSection>("Unclassified");
  const [sources, setSources] = useState<{
    salesInvoices: LedgerSource[];
    salesDeliveries: LedgerSource[];
    purchaseInvoices: LedgerSource[];
    purchaseReceipts: LedgerSource[];
    salesReturns: LedgerSource[];
    supplierReturns: LedgerSource[];
    customerCollections: LedgerSource[];
    supplierPayments: LedgerSource[];
    fxRevaluations: LedgerSource[];
    inventoryAdjustments: LedgerSource[];
  }>({
    salesInvoices: [],
    salesDeliveries: [],
    purchaseInvoices: [],
    purchaseReceipts: [],
    salesReturns: [],
    supplierReturns: [],
    customerCollections: [],
    supplierPayments: [],
    fxRevaluations: [],
    inventoryAdjustments: [],
  });
  const [selectedTransferKeys, setSelectedTransferKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const handleTransferSelection = useCallback(
    (keys: string[]) => setSelectedTransferKeys(new Set(keys)),
    [],
  );
  const [selected, setSelected] = useState<JournalEntryView | null>(null);
  const [chartPreview, setChartPreview] = useState<{
      totalAccounts: number;
      existingAccounts: number;
      accountsToAdd: number;
      sourceUrl: string;
    } | null>(null),
    [accountCreateOpen, setAccountCreateOpen] = useState(false);
  const [newAccountParentId, setNewAccountParentId] = useState(""),
    [collapsedAccountCodes, setCollapsedAccountCodes] = useState<Set<string>>(
      () => new Set(),
    ),
    [accountQuery, setAccountQuery] = useState("");
  const stayAfterAccountSave = useRef(false);
  const [mappingAccountQueries, setMappingAccountQueries] = useState<
    Record<string, string>
  >({});
  const [mappingSearch, setMappingSearch] = useState("");
  const [transferSourceSearch, setTransferSourceSearch] = useState("");
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [newAccountSection, setNewAccountSection] =
      useState<LedgerStatementSection>("Unclassified"),
    [accountType, setAccountType] = useState("Unclassified"),
    [normalBalance, setNormalBalance] = useState("Both"),
    [accountCurrency, setAccountCurrency] = useState(""),
    [ifrsAccountCode, setIfrsAccountCode] = useState(""),
    [ifrsAccountName, setIfrsAccountName] = useState(""),
    [ifrsStatementSection, setIfrsStatementSection] = useState<LedgerStatementSection>("Unclassified"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const labelByKey = Object.fromEntries(
    mappings.map((m) => [m.mappingKey, m.label]),
  ) as Record<string, string>;
  const activeMappingCount = mappings.filter((mapping) =>
    accounts.some((account) => account.id === mapping.accountId && account.isActive),
  ).length;
  const visibleMappings = mappings.filter((mapping) =>
    `${mapping.label} ${mapping.accountCode || ""} ${mapping.accountName || ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(mappingSearch.trim().toLocaleLowerCase("tr-TR")),
  );
  function missingFor(source: LedgerSource) {
    return source.requiredMappings.filter(
      (key) =>
        !mappings.some(
          (m) =>
            m.mappingKey === key &&
            m.accountId &&
            accounts.some((a) => a.id === m.accountId && a.isActive),
        ),
    );
  }
  async function load(targetPage = entryPage) {
    try {
      setError("");
      const needsAccounts =
        view === "accounts" ||
        view === "mappings" ||
        view === "voucher" ||
        view === "journal-ledger" ||
        view === "transfer-sources";
      if (needsAccounts) {
        const [a, m] = await Promise.all([
          api<LedgerAccount[]>("/api/finance/general-ledger/accounts", token),
          view === "accounts" ||
          view === "mappings" ||
          view === "journal-ledger" ||
          view === "transfer-sources"
            ? api<LedgerMapping[]>(
                "/api/finance/general-ledger/mappings",
                token,
              )
            : Promise.resolve(mappings),
        ]);
        setAccounts(a);
        setMappings(m);
      }
      if (view === "journal-ledger") {
        const entryParams = new URLSearchParams({
          page: String(targetPage),
          pageSize: "50",
        });
        if (entryFrom) entryParams.set("from", entryFrom);
        if (entryTo) entryParams.set("to", entryTo);
        const [e, s] = await Promise.all([
          api<{
            items: JournalEntrySummary[];
            page: number;
            pageSize: number;
            total: number;
          }>(`/api/finance/general-ledger/entries?${entryParams}`, token),
          api<typeof sources>("/api/finance/general-ledger/sources", token),
        ]);
        setEntries(e.items);
        setEntryTotal(e.total);
        setSources(s);
      }
      if (view === "transfer-sources") {
        const s = await api<typeof sources>(
          "/api/finance/general-ledger/sources",
          token,
        );
        setSources(s);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function applyEntryFilters() {
    setEntryPage(1);
    void load(1);
  }
  async function loadTrialBalance() {
    setError("");
    setTrialBalance(null);
    try {
      const params = new URLSearchParams();
      params.set("basis", reportingBasis);
      if (trialFrom) params.set("from", trialFrom);
      if (trialTo) params.set("to", trialTo);
      setTrialBalance(
        await api<LedgerTrialBalance>(
          `/api/finance/general-ledger/trial-balance?${params}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadBalanceSheet() {
    setError("");
    setBalanceSheet(null);
    try {
      const params = new URLSearchParams({ asOfDate: balanceSheetDate, basis: reportingBasis });
      setBalanceSheet(
        await api<BalanceSheet>(
          `/api/finance/general-ledger/financial-statements/balance-sheet?${params}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadIncomeStatement() {
    setError("");
    setIncomeStatement(null);
    try {
      const params = new URLSearchParams({ from: incomeFrom, to: incomeTo, basis: reportingBasis });
      setIncomeStatement(
        await api<IncomeStatement>(
          `/api/finance/general-ledger/financial-statements/income-statement?${params}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportTrialBalance() {
    if (!trialBalance) return;
    const cell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "Hesap kodu",
        "Hesap adı",
        "Açılış borç",
        "Açılış alacak",
        "Dönem borç",
        "Dönem alacak",
        "Kapanış borç",
        "Kapanış alacak",
      ],
      ...trialBalance.accounts.map((row) => [
        row.code,
        row.name,
        row.openingDebit,
        row.openingCredit,
        row.debit,
        row.credit,
        row.balanceDebit,
        row.balanceCredit,
      ]),
      ["Toplam", "", "", "", "", "", "", ""],
      [
        "Açılış toplamı",
        "",
        trialBalance.totalOpeningDebit,
        trialBalance.totalOpeningCredit,
        "",
        "",
        "",
        "",
      ],
      [
        "Dönem hareketi",
        "",
        "",
        "",
        trialBalance.totalDebit,
        trialBalance.totalCredit,
        "",
        "",
      ],
      [
        "Kapanış bakiyesi",
        "",
        "",
        "",
        "",
        "",
        trialBalance.totalBalanceDebit,
        trialBalance.totalBalanceCredit,
      ],
    ];
    const csv =
      "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `mizan-${trialFrom || "baslangic"}-${trialTo || "bugun"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    void load();
  }, [token, entryPage, view]);
  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    const parent = accounts.find(
        (account) => account.id === newAccountParentId && account.isActive,
      ),
      segment = code.trim();
    if (parent && (!segment || segment.includes("."))) {
      setError("Alt hesap koduna tek bir alt kod girin. Örnek: 001 → 120.001.");
      return;
    }
    const accountCode = parent ? `${parent.code}.${segment}` : segment;
    if (accountCode.length > 32) {
      setError("Oluşan hesap kodu en fazla 32 karakter olabilir.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/finance/general-ledger/accounts", token, {
        method: "POST",
        body: JSON.stringify({
          code: accountCode,
          name,
          isActive: true,
          statementSection: newAccountSection,
          accountType,
          normalBalance,
          currencyCode: accountCurrency || null,
          ifrsAccountCode: ifrsAccountCode || null,
          ifrsAccountName: ifrsAccountName || null,
          ifrsStatementSection,
        }),
      });
      setCode("");
      setName("");
      const stayForNext = stayAfterAccountSave.current;
      stayAfterAccountSave.current = false;
      if (!stayForNext) setAccountCreateOpen(false);
      setEditingAccountId("");
      setNotice(`${accountCode} hesabı eklendi.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function previewStandardChart() {
    setBusy(true);
    setError("");
    try {
      setChartPreview(
        await api<{
          totalAccounts: number;
          existingAccounts: number;
          accountsToAdd: number;
          sourceUrl: string;
        }>("/api/finance/general-ledger/accounts/standard-chart", token),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function applyStandardChart() {
    if (
      !chartPreview ||
      !confirmLocalized(
        `Türkiye Tek Düzen Hesap Planı'ndaki ${chartPreview.accountsToAdd} eksik hesap bu firmaya eklensin mi? Var olan hesaplar ve muhasebe eşleştirmeleri değiştirilmez.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{
        addedCount: number;
        preservedExistingCount: number;
      }>("/api/finance/general-ledger/accounts/standard-chart/apply", token, {
        method: "POST",
      });
      setChartPreview(null);
      setNotice(
        `Tek Düzen Hesap Planı uygulandı: ${result.addedCount} hesap eklendi, ${result.preservedExistingCount} mevcut hesap korundu. Muhasebe eşleştirmeleri ayrıca yapılmalıdır.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function resetNewAccountForm() {
    setError("");
    setEditingAccountId("");
    setCode("");
    setName("");
    setNewAccountParentId("");
    setNewAccountSection("Unclassified");
    setAccountType("Unclassified");
    setNormalBalance("Both");
    setAccountCurrency("");
    setIfrsAccountCode("");
    setIfrsAccountName("");
    setIfrsStatementSection("Unclassified");
  }
  function startEditAccount(account: LedgerAccount) {
    setEditingAccountId(account.id);
    setEditingAccountCode(account.code);
    setEditingAccountName(account.name);
    setEditingAccountSection(account.statementSection);
    setAccountType(account.accountType || "Unclassified");
    setNormalBalance(account.normalBalance || "Both");
    setAccountCurrency(account.currencyCode || "");
    setIfrsAccountCode(account.ifrsAccountCode || "");
    setIfrsAccountName(account.ifrsAccountName || "");
    setIfrsStatementSection(account.ifrsStatementSection || "Unclassified");
    setAccountCreateOpen(true);
  }
  async function saveAccount(
    account: LedgerAccount,
    isActive = account.isActive,
    code = editingAccountCode,
    name = editingAccountName,
    statementSection = editingAccountSection,
  ) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/finance/general-ledger/accounts/${account.id}`, token, {
        method: "PUT",
        body: JSON.stringify({ code, name, isActive, statementSection, accountType, normalBalance, currencyCode: accountCurrency || null, ifrsAccountCode: ifrsAccountCode || null, ifrsAccountName: ifrsAccountName || null, ifrsStatementSection }),
      });
      setEditingAccountId("");
      setAccountCreateOpen(false);
      setNotice("Hesap güncellendi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitAccountForm(event: React.FormEvent) {
    event.preventDefault();
    const account = accounts.find((row) => row.id === editingAccountId);
    if (account) {
      await saveAccount(account, account.isActive, editingAccountCode, editingAccountName, editingAccountSection);
      return;
    }
    await createAccount(event);
  }
  async function toggleAccount(account: LedgerAccount) {
    await saveAccount(
      account,
      !account.isActive,
      account.code,
      account.name,
      account.statementSection,
    );
  }
  async function deleteAccount(account: LedgerAccount) {
    if (
      account.hasMovements ||
      !confirmLocalized(
        `${account.code} · ${account.name} hesabı silinsin mi? Hesaba bağlı eşleştirme varsa kaldırılır.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<void>(
        `/api/finance/general-ledger/accounts/${account.id}`,
        token,
        { method: "DELETE" },
      );
      setNotice(`${account.code} hesabı silindi.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mapAccount(key: string, accountId: string) {
    if (!accountId) return;
    const previous = mappings.find((m) => m.mappingKey === key)?.accountId;
    if (
      previous &&
      previous !== accountId &&
      !confirmLocalized(
        "Bu eşleştirme sonraki aktarımlarda kullanılacak. Daha önce oluşturulmuş yevmiye fişleri değişmez. Devam edilsin mi?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/finance/general-ledger/mappings/${encodeURIComponent(key)}`,
        token,
        { method: "PUT", body: JSON.stringify({ mappingKey: key, accountId }) },
      );
      setNotice("Hesap eşleştirmesi kaydedildi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transfer(
    sourceType: LedgerTransferSourceType,
    source: LedgerSource,
  ) {
    if (missingFor(source).length || source.amount <= 0) return;
    if (
      !confirmLocalized(
        `${source.code} kaynağı değiştirilemez yevmiye fişi olarak aktarılsın mı? Borç ve alacak hesaplarını kontrol ettiğinizi onaylayın.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<JournalEntrySummary>(
        "/api/finance/general-ledger/transfer",
        token,
        {
          method: "POST",
          body: JSON.stringify({ sourceType, sourceId: source.id }),
        },
      );
      setNotice(
        `${result.code} yevmiye fişi oluşturuldu. Borç ve alacak toplamı ${result.totalDebit.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transferSelectedSources(
    rows: Array<{ sourceType: LedgerTransferSourceType; source: LedgerSource }>,
  ) {
    if (!rows.length || busy) return;
    if (!confirmLocalized(`${rows.length} kaynak, değiştirilemez yevmiye fişleri olarak aktarılsın mı? Lütfen borç ve alacak hesap eşleştirmelerini kontrol edin.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    let completed = 0;
    const failures: string[] = [];
    for (const row of rows) {
      try {
        await api<JournalEntrySummary>("/api/finance/general-ledger/transfer", token, {
          method: "POST",
          body: JSON.stringify({ sourceType: row.sourceType, sourceId: row.source.id }),
        });
        completed++;
      } catch (e) {
        failures.push(`${row.source.code}: ${(e as Error).message}`);
      }
    }
    setSelectedTransferKeys(new Set());
    setNotice(`${completed} kaynak aktarıldı${failures.length ? `, ${failures.length} kaynak aktarılamadı.` : "."}`);
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
    if (failures.length) setError(failures.slice(0, 3).join(" · "));
  }
  async function createManualEntry(e: React.FormEvent) {
    e.preventDefault();
    const debitCents = manualLines.reduce(
        (sum, line) => sum + Math.round(Number(line.debit || 0) * 100),
        0,
      ),
      creditCents = manualLines.reduce(
        (sum, line) => sum + Math.round(Number(line.credit || 0) * 100),
        0,
      );
    if (debitCents <= 0 || debitCents !== creditCents) {
      setError("Borç ve alacak toplamları eşit ve sıfırdan büyük olmalı.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<JournalEntrySummary>(
        "/api/finance/general-ledger/entries/manual",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            entryDate: manualDate,
            accountingBasis: manualAccountingBasis,
            description: manualDescription,
            lines: manualLines.map((line) => ({
              ...line,
              debit: Number(line.debit),
              credit: Number(line.credit),
            })),
          }),
        },
      );
      setManualDescription("");
      setManualLines([
        { accountId: "", description: "", debit: "0", credit: "0" },
        { accountId: "", description: "", debit: "0", credit: "0" },
      ]);
      setNotice(`${result.code} manuel yevmiye fişi kaydedildi.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openEntry(id: string) {
    try {
      setSelected(
        await api<JournalEntryView>(
          `/api/finance/general-ledger/entries/${id}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reverseJournalEntry(entry: JournalEntryView) {
    const reason = window
      .prompt(`${entry.code} fişi için ters kayıt gerekçesi:`)
      ?.trim();
    if (!reason) return;
    if (
      !confirmLocalized(
        `${entry.code} fişinin borç/alacak satırları ${reason} gerekçesiyle ters çevrilsin mi?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const reversal = await api<JournalEntrySummary>(
        `/api/finance/general-ledger/entries/${entry.id}/reverse`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ entryDate: localDateString(), reason }),
        },
      );
      setNotice(`${reversal.code} ters kayıt oluşturuldu.`);
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fmt = (value: number) =>
    value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
  const newAccountParent = accounts.find(
    (account) => account.id === newAccountParentId && account.isActive,
  );
  const normalizedAccountQuery = accountQuery.trim().toLocaleLowerCase("tr-TR");
  const filteredAccounts = normalizedAccountQuery
    ? accounts.filter((account) =>
        `${account.code} ${account.name}`
          .toLocaleLowerCase("tr-TR")
          .includes(normalizedAccountQuery),
      )
    : accounts;
  const accountTreeRows = buildLedgerAccountTree(
    filteredAccounts,
    collapsedAccountCodes,
  );
  function toggleAccountTree(code: string) {
    setCollapsedAccountCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }
  const viewTitles: Record<LedgerView, string> = {
    overview: "Muhasebe çalışma alanı",
    accounts: "Hesap planı",
    mappings: "Hesap eşleştirmeleri",
    voucher: "Yevmiye fişi",
    "trial-balance": "Mizan",
    "balance-sheet": "Bilanço",
    "journal-ledger": "Yevmiye defterleri",
    "transfer-sources": "Aktarılabilir alt defter kaynakları",
  };
  const viewDescriptions: Record<LedgerView, string> = {
    overview:
      "Hesap planınızı, fişlerinizi ve mali tablolarınızı ilgili çalışma sayfasından yönetin.",
    accounts: "Tenant hesaplarını düzenleyin.",
    mappings: "Alt defter kaynaklarını muhasebe hesaplarıyla eşleştirin.",
    voucher:
      "Borç ve alacak satırları dengeli yeni bir yevmiye fişi oluşturun.",
    "trial-balance":
      "Seçili dönem için açılışları, hareketleri ve kapanış bakiyelerini inceleyin.",
    "balance-sheet":
      "Belirli bir tarih itibarıyla varlık, yükümlülük ve özkaynak dağılımını inceleyin.",
    "journal-ledger":
      "Kaydedilmiş yevmiye fişlerini tarih aralığına göre inceleyin.",
    "transfer-sources":
      "Satış, satın alma, tahsilat ve stok hareketlerini muhasebeye aktarın.",
  };
  const transferSourceRows = [
    ...sources.salesReturns.map((source) => ({ sourceType: "SalesReturn" as const, title: "Satış iadesi", source })),
    ...sources.supplierReturns.map((source) => ({ sourceType: "SupplierReturn" as const, title: "Tedarikçi iadesi", source })),
    ...sources.customerCollections.map((source) => ({ sourceType: "CustomerCollection" as const, title: "Müşteri tahsilatı", source })),
    ...sources.supplierPayments.map((source) => ({ sourceType: "SupplierPayment" as const, title: "Tedarikçi ödemesi", source })),
    ...sources.purchaseInvoices.map((source) => ({ sourceType: "PurchaseInvoice" as const, title: "Alış faturası", source })),
    ...sources.purchaseReceipts.map((source) => ({ sourceType: "PurchaseReceipt" as const, title: "Mal kabul", source })),
    ...sources.salesInvoices.map((source) => ({ sourceType: "SalesInvoice" as const, title: "Satış faturası", source })),
    ...sources.salesDeliveries.map((source) => ({ sourceType: "SalesDelivery" as const, title: "Satış irsaliyesi", source })),
    ...sources.fxRevaluations.map((source) => ({ sourceType: "FxRevaluation" as const, title: "Kur değerleme", source })),
    ...sources.inventoryAdjustments.map((source) => ({ sourceType: "InventoryCostAdjustment" as const, title: `Stok · ${source.kind || ""}`, source })),
  ].map((row) => ({ ...row, key: `${row.sourceType}-${row.source.id}` }));
  const visibleTransferSourceRows = transferSourceRows.filter(({ title, source }) => {
    const query = transferSourceSearch.trim().toLocaleLowerCase("tr-TR");
    return !query || [title, source.code, source.description, source.entryDate, source.currencyCode]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR")
      .includes(query);
  });
  const transferReadyCount = transferSourceRows.filter(
    ({ source }) => source.amount > 0 && missingFor(source).length === 0,
  ).length;
  const selectedTransferRows = transferSourceRows.filter(({ key }) => selectedTransferKeys.has(key));
  const readyTransferRows = selectedTransferRows.filter(
    ({ source }) => source.amount > 0 && missingFor(source).length === 0,
  );
  const accountFormOpen = accountCreateOpen && view === "accounts";
  return (
    <section className={`panel general-ledger-panel finance-workbench${accountFormOpen ? " general-ledger-record-form-open" : ""}`}>
      {!accountFormOpen && <div className="panel-heading">
        <div>
          <p className="eyebrow">GENEL MUHASEBE</p>
          <h1>{viewTitles[view]}</h1>
          <p>{viewDescriptions[view]}</p>
        </div>
        <div className="heading-actions">
          {view === "journal-ledger" && <button className="secondary" onClick={() => onNavigate?.("finance-transfer-sources")}>Aktarılabilir kaynaklar</button>}
          <button className="secondary small-button" onClick={() => void load()}>Yenile</button>
        </div>
      </div>}
      {error && !accountFormOpen && <p className="error-banner">{error}</p>}
      {notice && !accountFormOpen && <p className="notice">{notice}</p>}
      {view === "overview" && (
        <div className="gl-home">
          <div className="gl-home-intro">
            <div>
              <span className="gl-home-kicker">MUHASEBE ÇALIŞMA ALANI</span>
              <h2>İşinizi doğru sayfadan sürdürün</h2>
              <p>
                Hesap planını yönetin, fiş kaydedin ve mali raporları ayrı
                ekranlarda inceleyin.
              </p>
            </div>
            <div className="gl-home-status">
              <ShieldCheck size={18} />
              <span>Firma defteri</span>
            </div>
          </div>
          <div className="gl-home-grid">
            {(
              [
                [
                  "finance-ledger-chart",
                  "Hesap Planı",
                  "Hesapları ve finansal tablo sınıflarını yönetin.",
                  <ListTree size={20} />,
                ],
                [
                  "finance-journal-vouchers",
                  "Yevmiye Fişi",
                  "Dengeli manuel fiş oluşturun.",
                  <FileText size={20} />,
                ],
                [
                  "finance-trial-balance",
                  "Mizan",
                  "Dönem açılışlarını ve kapanış bakiyelerini karşılaştırın.",
                  <Scale size={20} />,
                ],
                [
                  "finance-balance-sheet",
                  "Bilanço",
                  "Belirli tarih itibarıyla varlık ve kaynakları inceleyin.",
                  <Landmark size={20} />,
                ],
                [
                  "finance-journal-ledger",
                  "Yevmiye Defterleri",
                  "Kaynakları aktarın ve kayıtlı fişleri arayın.",
                  <BookOpen size={20} />,
                ],
              ] as const
            ).map(([page, title, description, icon]) => (
              <button
                key={page}
                className="gl-home-card"
                type="button"
                onClick={() => onNavigate?.(page)}
              >
                <span className="gl-home-icon">{icon}</span>
                <span className="gl-home-copy">
                  <b>{title}</b>
                  <small>{description}</small>
                </span>
                <span className="gl-home-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
          </div>
          <p className="gl-home-footnote">
            Muhasebe kayıtları firma defterinde tutulur. Kaydedilmiş yevmiye
            fişleri değiştirilemez.
          </p>
        </div>
      )}
      {view === "overview" && <AccountingRuleProfilesPanel token={token} />}
      {view === "accounts" && (
        <section
          className="ledger-subpanel ledger-accounts-panel"
          aria-label="Hesap planı"
        >
          <div className="finance-summary-strip ledger-account-summary" aria-label="Hesap planı özeti">
            <div><small>Toplam hesap</small><b>{accounts.length.toLocaleString("tr-TR")}</b></div>
            <div><small>Aktif hesap</small><b>{accounts.filter((account) => account.isActive).length.toLocaleString("tr-TR")}</b></div>
            <div><small>Pasif hesap</small><b>{accounts.filter((account) => !account.isActive).length.toLocaleString("tr-TR")}</b></div>
          </div>
          <section className="panel ledger-account-filter-card" aria-label="Hesap planı filtreleri">
            <div className="ledger-account-filter-heading">
              <h2>Filtreler</h2>
              <p>Hesap planını kod veya hesap adına göre daraltın.</p>
            </div>
            <label className="ledger-account-search finance-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Hesap planında ara</span>
              <input
                type="search"
                value={accountQuery}
                onChange={(e) => setAccountQuery(e.target.value)}
                placeholder="Kod veya hesap adına göre ara"
              />
            </label>
          </section>
          <div className="list-toolbar" id="ledger-chart">
            <div>
              <h3>Hesap planı</h3>
              <p>{accountTreeRows.length.toLocaleString("tr-TR")} kayıt gösteriliyor · kod ve ad tenant tarafından belirlenir</p>
            </div>
          {role === "TenantAdmin" && (
            <>
                <div className="heading-actions ledger-account-controls">
                  <button
                    type="button"
                    className="primary small-button"
                    onClick={() => {
                      resetNewAccountForm();
                      setAccountCreateOpen(true);
                    }}
                  >
                    Hesap ekle
                  </button>
                  <button
                    type="button"
                    className="secondary small-button"
                    onClick={() => onNavigate?.("finance-ledger-mappings")}
                  >
                    Hesap eşleştirmeleri
                  </button>
                  <button
                    type="button"
                    className="secondary small-button"
                    disabled={busy}
                    onClick={() => void previewStandardChart()}
                  >
                    Tek Düzen Hesap Planı
                  </button>
                </div>
            </>
          )}
          </div>
          {role === "TenantAdmin" && (
            <>
              {chartPreview && (
                <div className="ledger-standard-chart">
                  <div>
                    <strong>Türkiye Tek Düzen Hesap Planı</strong>
                    <p>
                      {chartPreview.totalAccounts} standart hesap ·{" "}
                      {chartPreview.existingAccounts} mevcut hesap ·{" "}
                      {chartPreview.accountsToAdd} eklenecek
                    </p>
                    <small>
                      Mevcut hesaplar korunur. Hesap eşleştirmeleri otomatik
                      yapılmaz.{" "}
                      <a
                        href={chartPreview.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Resmî tebliği görüntüle
                      </a>
                    </small>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || chartPreview.accountsToAdd === 0}
                    onClick={() => void applyStandardChart()}
                  >
                    {chartPreview.accountsToAdd === 0
                      ? "Hesap planı güncel"
                      : "Eksik hesapları ekle"}
                  </button>
                  <button
                    type="button"
                    className="row-action"
                    disabled={busy}
                    onClick={() => setChartPreview(null)}
                  >
                    Kapat
                  </button>
                </div>
              )}
            </>
          )}
          <div className="ledger-list">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-ledger-accounts"
              defaults={financeGridDefaults["finance-ledger-accounts"]}
            >
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Kod</th>
                    <th>Hesap</th>
                    <th>Finansal tablo sınıfı</th>
                    <th>Durum</th>
                    {role === "TenantAdmin" && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {accountTreeRows.map(({ account: a, depth, hasChildren }) => (
                    <tr
                      key={a.id}
                      className={depth > 0 ? "ledger-account-child" : undefined}
                    >
                      {editingAccountId === a.id ? (
                        <>
                          <td
                            style={{
                              paddingInlineStart: `${depth * 22 + 8}px`,
                            }}
                          >
                            <input
                              value={editingAccountCode}
                              onChange={(e) =>
                                setEditingAccountCode(e.target.value)
                              }
                              maxLength={32}
                              required
                            />
                          </td>
                          <td>
                            <input
                              value={editingAccountName}
                              onChange={(e) =>
                                setEditingAccountName(e.target.value)
                              }
                              maxLength={160}
                              required
                            />
                          </td>
                          <td>
                            <select
                              value={editingAccountSection}
                              onChange={(e) =>
                                setEditingAccountSection(
                                  e.target.value as LedgerStatementSection,
                                )
                              }
                            >
                              {Object.entries(ledgerStatementLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </td>
                          <td>{a.isActive ? "Aktif" : "Pasif"}</td>
                          <td>
                            <button
                              className="row-action"
                              disabled={busy}
                              onClick={() => void saveAccount(a)}
                            >
                              Kaydet
                            </button>
                            <button
                              className="row-action"
                              disabled={busy}
                              onClick={() => setEditingAccountId("")}
                            >
                              Vazgeç
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <div
                              className="ledger-account-code-cell"
                              style={{ paddingInlineStart: `${depth * 22}px` }}
                            >
                              {hasChildren ? (
                                <button
                                  type="button"
                                  className="ledger-account-tree-toggle"
                                  aria-label={`${a.code} alt hesaplarını ${collapsedAccountCodes.has(a.code) ? "göster" : "gizle"}`}
                                  aria-expanded={
                                    !collapsedAccountCodes.has(a.code)
                                  }
                                  onClick={() => toggleAccountTree(a.code)}
                                >
                                  {collapsedAccountCodes.has(a.code) ? (
                                    <ChevronRight size={15} />
                                  ) : (
                                    <ChevronDown size={15} />
                                  )}
                                </button>
                              ) : (
                                <span
                                  className="ledger-account-tree-spacer"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="customer-code">{a.code}</span>
                            </div>
                          </td>
                          <td>{a.name}</td>
                          <td>{ledgerStatementLabels[a.statementSection]}</td>
                          <td>{a.isActive ? "Aktif" : "Pasif"}</td>
                          {role === "TenantAdmin" && (
                            <td>
                              <button
                                className="row-action"
                                disabled={busy}
                                onClick={() => startEditAccount(a)}
                              >
                                Düzenle
                              </button>
                              <button
                                className="row-action"
                                disabled={busy}
                                onClick={() => void toggleAccount(a)}
                              >
                                {a.isActive ? "Pasifleştir" : "Etkinleştir"}
                              </button>
                              {!a.hasMovements &&
                                !accounts.some((account) =>
                                  account.code.startsWith(`${a.code}.`),
                                ) && (
                                  <button
                                    className="row-action danger-action"
                                    disabled={busy}
                                    onClick={() => void deleteAccount(a)}
                                  >
                                    Sil
                                  </button>
                                )}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                  {accountTreeRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={role === "TenantAdmin" ? 5 : 4}
                        className="table-empty"
                      >
                        {normalizedAccountQuery
                          ? "Aramayla eşleşen hesap bulunamadı."
                          : "Tenant hesabı eklenmedi."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </FinanceStudioGrid>
          </div>
        </section>
      )}
      {accountFormOpen && <div className="ledger-account-record-form">
        <RecordFormPage
          variant="dialog"
          title={editingAccountId ? "Hesap Kartını Düzenle" : "Hesap Kartı Tanımlama"}
          mode={editingAccountId ? "edit" : "create"}
          busy={busy}
          saveLabel={editingAccountId ? "Değişiklikleri Kaydet" : "Hesap Kartını Kaydet"}
          formId="ledger-account-record-form"
          onSubmit={(event) => void submitAccountForm(event)}
          onCancel={() => { setAccountCreateOpen(false); setEditingAccountId(""); setError(""); }}
          onSaveIntent={(stayForNext) => { stayAfterAccountSave.current = stayForNext; }}
          onReset={() => { resetNewAccountForm(); setNotice(""); }}
          error={error}
          onDismissError={() => setError("")}
          status={
            <>
              <span>Zorunlu alanlar: <b>{[(editingAccountId ? editingAccountCode : code).trim(), (editingAccountId ? editingAccountName : name).trim()].filter(Boolean).length} / 2</b></span>
              {notice && <span className="rf-status-notice">{notice}</span>}
              {!editingAccountId && (code.trim() || name.trim()) && <span className="rf-status-end">Kaydedilmemiş değişiklik var</span>}
            </>
          }
        >
          <p className="fin-rf-hint">{editingAccountId ? "Muhasebe hesabının temel bilgilerini ve finansal sınıflandırmasını güncelleyin." : "Yeni muhasebe hesabının temel bilgilerini ve finansal sınıflandırmasını tanımlayın."}</p>
          <RecordFormGroup title="Hesap Kimliği" bodyClassName="fin-rf-grid-4">
            {!editingAccountId && <label>Üst hesap<select value={newAccountParentId} onChange={(e) => { const parentId = e.target.value; setNewAccountParentId(parentId); const parent = accounts.find((account) => account.id === parentId && account.isActive); if (parent) setNewAccountSection(parent.statementSection); }}>
                <option value="">Ana hesap</option>{accounts.filter((account) => account.isActive).slice().sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true })).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
              </select></label>}
            <label><span>{editingAccountId ? "Hesap kodu" : newAccountParent ? "Alt hesap kodu" : "Hesap kodu"}<RequiredMark /></span><input className="rf-must rf-mono" value={editingAccountId ? editingAccountCode : code} onChange={(e) => editingAccountId ? setEditingAccountCode(e.target.value) : setCode(e.target.value)} maxLength={editingAccountId ? 32 : newAccountParent ? Math.max(1, 32 - newAccountParent.code.length - 1) : 32} required placeholder={newAccountParent ? "001" : "Örn. 120"} />{newAccountParent && !editingAccountId && <small>Oluşacak kod: {newAccountParent.code}.{code.trim() || "001"}</small>}</label>
            <label className="fin-rf-span-2"><span>Hesap adı<RequiredMark /></span><input className="rf-must" value={editingAccountId ? editingAccountName : name} onChange={(e) => editingAccountId ? setEditingAccountName(e.target.value) : setName(e.target.value)} maxLength={160} required placeholder="Hesap adı" /></label>
          </RecordFormGroup>
          <div className="rf-columns">
            <RecordFormGroup title="Finansal Sınıflandırma">
              <label>Finansal tablo sınıfı<select value={editingAccountId ? editingAccountSection : newAccountSection} onChange={(e) => editingAccountId ? setEditingAccountSection(e.target.value as LedgerStatementSection) : setNewAccountSection(e.target.value as LedgerStatementSection)}>{Object.entries(ledgerStatementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Hesap tipi<select value={accountType} onChange={(e) => setAccountType(e.target.value)}>{[["Unclassified","Sınıflandırılmamış"],["Asset","Aktif"],["Liability","Pasif"],["Equity","Özkaynak"],["Revenue","Gelir"],["Expense","Gider"],["OffBalanceSheet","Nazım"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="rf-pair">
                <label>Çalışma şekli<select value={normalBalance} onChange={(e) => setNormalBalance(e.target.value)}><option value="Debit">Borç çalışır</option><option value="Credit">Alacak çalışır</option><option value="Both">Çift çalışır</option></select></label>
                <label>Döviz takibi<input className="rf-mono" value={accountCurrency} onChange={(e) => setAccountCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="TRY, USD, EUR" /></label>
              </div>
              <p className="fin-rf-hint">Hesap sınıfı bilanço ve mali raporlarda kullanılır. Hesap koduna göre otomatik tahmin edilmez.</p>
            </RecordFormGroup>
            <RecordFormGroup title="IFRS / UFRS Raporlama Eşlemesi">
              <label>IFRS / UFRS hesap kodu<input className="rf-mono" value={ifrsAccountCode} onChange={(e) => setIfrsAccountCode(e.target.value)} maxLength={32} placeholder="Örn. IFRS-AR" /></label>
              <label>IFRS / UFRS hesap adı<input value={ifrsAccountName} onChange={(e) => setIfrsAccountName(e.target.value)} maxLength={160} placeholder="Trade receivables" /></label>
              <label>IFRS / UFRS tablo sınıfı<select value={ifrsStatementSection} onChange={(e) => setIfrsStatementSection(e.target.value as LedgerStatementSection)}>{Object.entries(ledgerStatementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <p className="fin-rf-hint">Tekdüzen hesabını uluslararası raporlama hesabına bağlayın. Boş bırakılırsa bu hesap IFRS rapor eşlemesine dahil edilmez.</p>
            </RecordFormGroup>
          </div>
        </RecordFormPage>
      </div>}
      {view === "mappings" && (
        <section
          className="ledger-subpanel ledger-mappings-panel"
          aria-label="Hesap eşleştirmeleri"
        >
          <div className="finance-summary-strip ledger-mapping-summary" aria-label="Hesap eşleştirmeleri özeti">
            <div><small>Toplam eşleştirme</small><b>{mappings.length.toLocaleString("tr-TR")}</b></div>
            <div><small>Etkin hesapla eşleşen</small><b>{activeMappingCount.toLocaleString("tr-TR")}</b></div>
            <div><small>Eşleştirme gereken</small><b>{(mappings.length - activeMappingCount).toLocaleString("tr-TR")}</b></div>
          </div>
          <section className="panel ledger-account-filter-card" aria-label="Eşleştirme filtreleri">
            <div className="ledger-account-filter-heading">
              <h2>Filtreler</h2>
              <p>Alt defter kaynağını veya bağlı hesabı arayın.</p>
            </div>
            <label className="ledger-account-search finance-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Eşleştirmelerde ara</span>
              <input type="search" value={mappingSearch} onChange={(event) => setMappingSearch(event.target.value)} placeholder="Kaynak veya hesap kodu/adı ara" />
            </label>
          </section>
          <div className="list-toolbar" id="ledger-mappings">
            <div>
              <h3>Hesap eşleştirmeleri</h3>
              <p>
                {visibleMappings.length} / {mappings.length} kaynak gösteriliyor · eşleştirme tamamlanana kadar kaynak yevmiyeye aktarılamaz.
              </p>
            </div>
          </div>
          <div className="ledger-list">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-ledger-mappings"
              defaults={financeGridDefaults["finance-ledger-mappings"]}
            >
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Kaynak hesabı</th>
                    <th>Muhasebe hesabı</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMappings.map((m) => {
                    const active = accounts.some(
                        (a) => a.id === m.accountId && a.isActive,
                      ),
                      query = (mappingAccountQueries[m.mappingKey] || "")
                        .trim()
                        .toLocaleLowerCase("tr-TR"),
                      options = accounts.filter(
                        (a) =>
                          a.isActive &&
                          (query.length === 0 ||
                            a.code.toLocaleLowerCase("tr-TR").includes(query) ||
                            a.name.toLocaleLowerCase("tr-TR").includes(query)),
                      );
                    return (
                      <tr key={m.mappingKey}>
                        <td>{m.label}</td>
                        <td>
                          {role === "TenantAdmin" ? (
                            <div className="ledger-mapping-account-picker">
                              <input
                                type="search"
                                aria-label={`${m.label} için hesap ara`}
                                placeholder="Hesap kodu veya adı ara"
                                value={
                                  mappingAccountQueries[m.mappingKey] || ""
                                }
                                onChange={(e) =>
                                  setMappingAccountQueries((current) => ({
                                    ...current,
                                    [m.mappingKey]: e.target.value,
                                  }))
                                }
                              />
                              <select
                                disabled={busy}
                                value={active ? m.accountId || "" : ""}
                                onChange={(e) =>
                                  void mapAccount(m.mappingKey, e.target.value)
                                }
                              >
                                <option value="">Hesap seçin</option>
                                {m.accountId && !active && (
                                  <option value="" disabled>
                                    Önceki hesap pasif; yeni eşleştirme gerekli
                                  </option>
                                )}
                                {options.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.code} · {a.name}
                                  </option>
                                ))}
                                {options.length === 0 && (
                                  <option value="" disabled>
                                    Aramayla eşleşen hesap yok
                                  </option>
                                )}
                              </select>
                            </div>
                          ) : active ? (
                            `${m.accountCode} · ${m.accountName}`
                          ) : (
                            "Eşleştirilmedi"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleMappings.length === 0 && (
                    <tr><td colSpan={2} className="table-empty">{mappings.length ? "Aramayla eşleşen kaynak bulunamadı." : "Henüz alt defter kaynağı bulunmuyor."}</td></tr>
                  )}
                </tbody>
              </table>
            </FinanceStudioGrid>
          </div>
        </section>
      )}
      {view === "voucher" && (
        <ManualJournalForm
          role={role}
          busy={busy}
          accounts={accounts}
          manualDate={manualDate}
          setManualDate={setManualDate}
          manualAccountingBasis={manualAccountingBasis}
          setManualAccountingBasis={setManualAccountingBasis}
          manualDescription={manualDescription}
          setManualDescription={setManualDescription}
          manualLines={manualLines}
          setManualLines={setManualLines}
          createManualEntry={createManualEntry}
        />
      )}
      {(view === "trial-balance" || view === "balance-sheet") && (
        <LedgerReportsPanel
          token={token}
          reportView={view}
          reportingBasis={reportingBasis}
          setReportingBasis={setReportingBasis}
          trialFrom={trialFrom}
          setTrialFrom={setTrialFrom}
          trialTo={trialTo}
          setTrialTo={setTrialTo}
          trialBalance={trialBalance}
          loadTrialBalance={loadTrialBalance}
          exportTrialBalance={exportTrialBalance}
          balanceSheet={balanceSheet}
          balanceSheetDate={balanceSheetDate}
          setBalanceSheetDate={setBalanceSheetDate}
          loadBalanceSheet={loadBalanceSheet}
          incomeStatement={incomeStatement}
          incomeFrom={incomeFrom}
          setIncomeFrom={setIncomeFrom}
          incomeTo={incomeTo}
          setIncomeTo={setIncomeTo}
          loadIncomeStatement={loadIncomeStatement}
          fmt={fmt}
        />
      )}
      {view === "transfer-sources" && role === "TenantAdmin" && (
        <section className="ledger-subpanel ledger-transfer-sources" aria-label="Aktarılabilir alt defter kaynakları">
          <div className="list-toolbar finance-transfer-toolbar">
            <div>
              <h3>Aktarılabilir alt defter kaynakları</h3>
              <p>Eksik hesap eşleştirmelerini tamamlayıp hazır kaynakları muhasebeye aktarın.</p>
            </div>
            <button className="primary small-button" disabled={busy || readyTransferRows.length === 0} onClick={() => void transferSelectedSources(readyTransferRows)}>
              {busy ? "Aktarılıyor…" : `Seçilenleri aktar${readyTransferRows.length ? ` (${readyTransferRows.length})` : ""}`}
            </button>
          </div>
          <div className="finance-summary-strip ledger-transfer-summary" aria-label="Aktarılabilir kaynak özeti">
            <div><small>Bekleyen kaynak</small><b>{transferSourceRows.length.toLocaleString("tr-TR")}</b></div>
            <div><small>Aktarılmaya hazır</small><b>{transferReadyCount.toLocaleString("tr-TR")}</b></div>
            <div><small>Seçilen kaynak</small><b>{selectedTransferRows.length.toLocaleString("tr-TR")}</b></div>
          </div>
          <section className="ledger-transfer-filter-card" aria-label="Aktarılabilir kaynak filtreleri">
            <div className="ledger-transfer-filter-heading">
              <h2>Filtreler</h2>
              <p>Kaynak türü, kod veya açıklama ile daraltın.</p>
            </div>
            <label>
              <span>Kaynakta ara</span>
              <input
                type="search"
                value={transferSourceSearch}
                onChange={(event) => setTransferSourceSearch(event.target.value)}
                placeholder="Kaynak, kod veya açıklama"
              />
            </label>
          </section>
          <div className="ledger-list">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-transfer-sources"
              defaults={financeGridDefaults["finance-transfer-sources"]}
              onSelectionChange={handleTransferSelection}
            >
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th>Kaynak</th>
                        <th>Tarih</th>
                        <th>Açıklama</th>
                        <th>Tutar</th>
                        <th>Gerekli eşleştirmeler / işlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTransferSourceRows.map(({ sourceType, title, source: x, key }) => {
                        const missing = missingFor(x);
                        return (
                          <tr key={key}>
                            <td>
                              <b>{title}</b>
                              <small className="cell-subtitle">{x.code}</small>
                            </td>
                            <td>
                              {x.entryDate.split("-").reverse().join(".")}
                            </td>
                            <td>
                              {x.description || "Dönem sonu kur değerleme"}
                            </td>
                            <td>
                              {fmt(x.amount)}
                              {x.currencyCode ? ` ${x.currencyCode}` : ""}
                            </td>
                            <td>
                              {x.amount <= 0 ? (
                                <span>Sıfır tutar · aktarılamaz</span>
                              ) : missing.length > 0 ? (
                                <span>
                                  {missing
                                    .map((key) => labelByKey[key] || key)
                                    .join(" · ")}{" "}
                                  eksik
                                </span>
                              ) : (
                                <button
                                  className="row-action"
                                  disabled={busy}
                                  onClick={() =>
                                    void transfer(
                                      sourceType,
                                      x,
                                    )
                                  }
                                >
                                  İncele ve aktar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {transferSourceRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            Aktarılmayı bekleyen kaynak yok.
                          </td>
                        </tr>
                      )}
                      {transferSourceRows.length > 0 && visibleTransferSourceRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            Filtreyle eşleşen kaynak bulunamadı.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
            </FinanceStudioGrid>
          </div>
        </section>
      )}
      {view === "journal-ledger" && (
          <section
            className="ledger-subpanel"
            aria-label="Yevmiye defteri kayıtları"
          >
            <div className="finance-summary-strip ledger-journal-summary" aria-label="Yevmiye defteri özeti">
              <div><small>Toplam yevmiye fişi</small><b>{entryTotal.toLocaleString("tr-TR")}</b></div>
              <div><small>Bu sayfada gösterilen</small><b>{entries.length.toLocaleString("tr-TR")}</b></div>
            </div>
            <section className="panel ledger-journal-filter-card" aria-label="Yevmiye defteri filtreleri">
              <div className="ledger-journal-filter-heading">
                <h2>Filtreler</h2>
                <p>Yevmiye kayıtlarını tarih aralığına göre daraltın.</p>
              </div>
              <div className="ledger-journal-filter-fields">
                <label>
                  Başlangıç
                  <input type="date" value={entryFrom} max={entryTo || undefined} onChange={(e) => setEntryFrom(e.target.value)} />
                </label>
                <label>
                  Bitiş
                  <input type="date" value={entryTo} min={entryFrom || undefined} onChange={(e) => setEntryTo(e.target.value)} />
                </label>
                <button className="secondary small-button" onClick={applyEntryFilters}>Filtrele</button>
              </div>
            </section>
            <div className="list-toolbar" id="ledger-journal">
              <div>
                <h3>Yevmiye defteri</h3>
                <p>{entryTotal} kayıt · borç ve alacak toplamları eşit</p>
              </div>
            </div>
            <div className="ledger-list journal-entries-list">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-journals"
                defaults={financeGridDefaults["finance-journals"]}
                externalPagination
              >
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Fiş</th>
                      <th>Tarih</th>
                      <th>Kaynak</th>
                      <th>Açıklama</th>
                      <th>Borç</th>
                      <th>Alacak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((x) => (
                      <tr key={x.id}>
                        <td>
                          <button
                            className="row-action"
                            title={x.code}
                            onClick={() => void openEntry(x.id)}
                          >
                            {x.code}
                          </button>
                        </td>
                        <td>{x.entryDate.split("-").reverse().join(".")}</td>
                        <td title={x.sourceType}>
                          {x.sourceType === "FxRevaluation"
                            ? "Kur değerleme"
                            : x.sourceType === "InventoryCostAdjustment"
                              ? "Stok maliyeti"
                              : x.sourceType === "Manual"
                                ? "Manuel fiş"
                                : x.sourceType === "ManualReversal"
                                  ? "Ters kayıt"
                                  : x.sourceType}
                        </td>
                        <td title={x.description}>{x.description}{x.accountingBasis === "IFRS" && <small className="ledger-basis-badge">IFRS düzeltmesi</small>}</td>
                        <td>{fmt(x.totalDebit)}</td>
                        <td>{fmt(x.totalCredit)}</td>
                      </tr>
                    ))}
                    {entries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="table-empty">
                          Henüz yevmiye kaydı yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </FinanceStudioGrid>
            </div>
            <div className="modal-foot">
              <span>
                Sayfa {entryPage} / {Math.max(1, Math.ceil(entryTotal / 50))}
              </span>
              <div>
                <button
                  className="secondary small-button"
                  disabled={entryPage <= 1}
                  onClick={() => setEntryPage((page) => page - 1)}
                >
                  Önceki
                </button>
                <button
                  className="secondary small-button"
                  disabled={entryPage * 50 >= entryTotal}
                  onClick={() => setEntryPage((page) => page + 1)}
                >
                  Sonraki
                </button>
              </div>
            </div>
            {selected && (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panel-heading">
                  <div>
                    <h3>
                      {selected.code} ·{" "}
                      {selected.entryDate.split("-").reverse().join(".")}
                    </h3>
                    <p>{selected.description}</p>
                  </div>
                  <div className="heading-actions">
                    {role === "TenantAdmin" &&
                      selected.sourceType !== "ManualReversal" &&
                      !selected.isReversed && (
                        <button
                          className="secondary small-button"
                          disabled={busy}
                          onClick={() => void reverseJournalEntry(selected)}
                        >
                          Ters kayıt oluştur
                        </button>
                      )}
                    <button
                      className="secondary small-button"
                      onClick={() => setSelected(null)}
                    >
                      Kapat
                    </button>
                  </div>
                </div>
                <div className="ledger-list">
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th>Hesap</th>
                        <th>Açıklama</th>
                        <th>Borç</th>
                        <th>Alacak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((line) => (
                        <tr key={line.lineNumber}>
                          <td>
                            <b>{line.accountCode}</b>
                            <small className="cell-subtitle">
                              {line.accountName}
                            </small>
                          </td>
                          <td>{line.description}</td>
                          <td>{fmt(line.debit)}</td>
                          <td>{fmt(line.credit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="modal-foot">
                  <span>Toplam</span>
                  <b>
                    {fmt(selected.totalDebit)} / {fmt(selected.totalCredit)}
                  </b>
                </div>
              </div>
            )}
          </section>
      )}
    </section>
  );
}
