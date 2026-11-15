import { useCallback, useEffect, useRef, useState } from "react";
import { api, localDateString } from "./erpApi";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  ListTree,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { FinanceStudioGrid } from "./FinanceStudioGrid";
import { financeGridDefaults, ledgerStatementLabels } from "./financeCatalog";
import { ManualJournalForm } from "./general-ledger/components/ManualJournalForm";
import {
  buildManualJournalRequestLines,
  emptyManualJournalLine,
  type ManualJournalLine,
} from "./general-ledger/journalVoucher";
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
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import "./general-ledger/general-ledger-list-v2.css";
import "./general-ledger/transfer-sources.css";

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

type TransferSourceRow = {
  sourceType: LedgerTransferSourceType;
  title: string;
  source: LedgerSource;
  key: string;
};
/** Chip order and labels on the transfer page (sales, purchasing, cash, then valuation sources). */
const transferSourceTypeOrder: LedgerTransferSourceType[] = [
  "SalesInvoice",
  "SalesDelivery",
  "SalesReturn",
  "PurchaseInvoice",
  "PurchaseReceipt",
  "SupplierReturn",
  "CustomerCollection",
  "SupplierPayment",
  "FxRevaluation",
  "InventoryCostAdjustment",
];
const transferSourceTypeTitles: Record<LedgerTransferSourceType, string> = {
  SalesInvoice: "Satış faturası",
  SalesDelivery: "Satış irsaliyesi",
  SalesReturn: "Satış iadesi",
  PurchaseInvoice: "Alış faturası",
  PurchaseReceipt: "Mal kabul",
  SupplierReturn: "Tedarikçi iadesi",
  CustomerCollection: "Müşteri tahsilatı",
  SupplierPayment: "Tedarikçi ödemesi",
  FxRevaluation: "Kur değerleme",
  InventoryCostAdjustment: "Stok maliyeti",
};
/** Dry run of POST /api/finance/general-ledger/transfer (same line-building logic, nothing persisted). */
type JournalTransferPreview = {
  sourceType: string;
  sourceId: string;
  code: string | null;
  entryDate: string | null;
  description: string | null;
  lines: {
    lineNumber: number;
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    description: string;
  }[];
  totalDebit: number;
  totalCredit: number;
  canTransfer: boolean;
  blockingReason: string | null;
};
/** Long document codes keep their start and end: "SF-2026-…000123". */
const shortenTransferCode = (code: string) =>
  code.length > 16 ? `${code.slice(0, 8)}…${code.slice(-6)}` : code;
const displayDate = (value: string) => value.split("-").reverse().join(".");

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

/** Tek Düzen Hesap Planı classes, keyed by the first digit of the account code. */
const ledgerAccountClassLabels: Record<string, string> = {
  "1": "Dönen varlıklar",
  "2": "Duran varlıklar",
  "3": "Kısa vadeli yabancı kaynaklar",
  "4": "Uzun vadeli yabancı kaynaklar",
  "5": "Özkaynaklar",
  "6": "Gelir tablosu hesapları",
  "7": "Maliyet hesapları",
  "8": "Serbest",
  "9": "Nazım hesaplar",
};
const ledgerAccountTypeLabels: Record<string, string> = {
  Unclassified: "Sınıflandırılmamış",
  Asset: "Aktif",
  Liability: "Pasif",
  Equity: "Özkaynak",
  Revenue: "Gelir",
  Expense: "Gider",
  OffBalanceSheet: "Nazım",
};
const ledgerNormalBalanceLabels: Record<string, string> = {
  Debit: "Borç çalışır",
  Credit: "Alacak çalışır",
  Both: "Çift çalışır",
};
const ledgerAccountClassOf = (code: string) => code.trim().charAt(0);
const ledgerAccountGroupOf = (code: string) => code.trim().slice(0, 2);

type LedgerAccountGroupedRow = LedgerAccountTreeRow & {
  group: string;
  /** First visible row of its 2-digit group: carries the group toggle. */
  groupStart: boolean;
  /** The account whose code is exactly the 2-digit group code. */
  isGroupAccount: boolean;
  /** Rows of the group hidden while the group is collapsed. */
  hiddenCount: number;
  /** The group has dotted sub-accounts, so rows reserve room for the tree toggle. */
  groupHasTree: boolean;
};
/**
 * Orders the accounts by their 2-digit group (e.g. "10", "11") and builds the dotted
 * sub-account tree inside each group. The grid keeps plain data rows (header rows with
 * colSpan would be dropped by AdvancedDataGrid and pollute export), so the group is
 * shown on the first row of each group; a collapsed group keeps only that row.
 */
function buildLedgerAccountGroups(
  accounts: LedgerAccount[],
  collapsedCodes: Set<string>,
  collapsedGroups: Set<string>,
): LedgerAccountGroupedRow[] {
  const groups = new Map<string, LedgerAccount[]>();
  for (const account of accounts) {
    const key = ledgerAccountGroupOf(account.code);
    groups.set(key, [...(groups.get(key) || []), account]);
  }
  const rows: LedgerAccountGroupedRow[] = [];
  [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, "tr", { numeric: true, sensitivity: "base" }))
    .forEach((group) => {
      const tree = buildLedgerAccountTree(groups.get(group) || [], collapsedCodes);
      const collapsed = collapsedGroups.has(group);
      const visible = collapsed ? tree.slice(0, 1) : tree;
      const groupHasTree = tree.some((row) => row.hasChildren);
      visible.forEach((row, index) =>
        rows.push({
          ...row,
          group,
          groupStart: index === 0,
          isGroupAccount: row.account.code.trim() === group,
          hiddenCount: index === 0 && collapsed ? tree.length - 1 : 0,
          groupHasTree,
        }),
      );
    });
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
  // The "no active account" warning must wait for the first load, not flash while it runs.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
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
    [manualLines, setManualLines] = useState<ManualJournalLine[]>(() => [
      emptyManualJournalLine(),
      emptyManualJournalLine(),
      emptyManualJournalLine(),
    ]);
  const [editingAccountId, setEditingAccountId] = useState(""),
    [editingAccountCode, setEditingAccountCode] = useState(""),
    [editingAccountName, setEditingAccountName] = useState(""),
    [editingAccountSection, setEditingAccountSection] =
      useState<LedgerStatementSection>("Unclassified");
  const [sources, setSources] = useState<{
    baseCurrencyCode?: string;
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
  // Transfer sources: the row shown in the preview panel (independent of the checkboxes),
  // its server-built journal preview and the inline confirmation step.
  const [previewKey, setPreviewKey] = useState("");
  const [transferPreview, setTransferPreview] = useState<{
    key: string;
    data: JournalTransferPreview | null;
    loading: boolean;
    error: string;
  } | null>(null);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
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
  // Chart of accounts: class filter (first code digit), collapsed 2-digit groups and the
  // account shown in the detail panel — all client-side only.
  const [accountClass, setAccountClass] = useState(""),
    [collapsedAccountGroups, setCollapsedAccountGroups] = useState<Set<string>>(
      () => new Set(),
    ),
    [selectedAccountId, setSelectedAccountId] = useState("");
  const stayAfterAccountSave = useRef(false);
  const [mappingAccountQueries, setMappingAccountQueries] = useState<
    Record<string, string>
  >({});
  const [mappingSearch, setMappingSearch] = useState("");
  const [transferSourceSearch, setTransferSourceSearch] = useState("");
  // list-v2: status chips of the three client-side lists ("" = all).
  const [accountStatus, setAccountStatus] = useState("");
  const [mappingStatus, setMappingStatus] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  // list-v2: the page toolbar hosts the visible list's own tools (columns, export…).
  const [listToolsSlot, setListToolsSlot] = useState<HTMLDivElement | null>(
    null,
  );
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
  const isMappingActive = (mapping: LedgerMapping) =>
    accounts.some((account) => account.id === mapping.accountId && account.isActive);
  const searchedMappings = mappings.filter((mapping) =>
    `${mapping.label} ${mapping.accountCode || ""} ${mapping.accountName || ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(mappingSearch.trim().toLocaleLowerCase("tr-TR")),
  );
  const activeMappingCount = searchedMappings.filter(isMappingActive).length;
  const visibleMappings = mappingStatus
    ? searchedMappings.filter(
        (mapping) => isMappingActive(mapping) === (mappingStatus === "mapped"),
      )
    : searchedMappings;
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
        setAccountsLoaded(true);
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
  }, [token, entryPage, view, entryFrom, entryTo]);
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
  async function transferPreviewedSource(row: TransferSourceRow, nextKey: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<JournalEntrySummary>(
        "/api/finance/general-ledger/transfer",
        token,
        {
          method: "POST",
          body: JSON.stringify({ sourceType: row.sourceType, sourceId: row.source.id }),
        },
      );
      setNotice(
        `${result.code} yevmiye fişi oluşturuldu. Borç ve alacak toplamı ${result.totalDebit.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}.`,
      );
      setConfirmingTransfer(false);
      setSelectedTransferKeys((current) => {
        if (!current.has(row.key)) return current;
        const next = new Set(current);
        next.delete(row.key);
        return next;
      });
      setPreviewKey(nextKey);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setConfirmingTransfer(false);
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
    if (busy) return;
    setNotice("");
    const prepared = buildManualJournalRequestLines(manualLines, manualDescription);
    if (!manualDescription.trim()) {
      setError("Fiş açıklaması girin.");
      return;
    }
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<JournalEntrySummary>(
        "/api/finance/general-ledger/entries/manual",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            entryDate: manualDate,
            accountingBasis: manualAccountingBasis,
            description: manualDescription.trim(),
            lines: prepared.lines,
          }),
        },
      );
      setManualDescription("");
      setManualLines([emptyManualJournalLine(), emptyManualJournalLine(), emptyManualJournalLine()]);
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
  const searchedAccounts = normalizedAccountQuery
    ? accounts.filter((account) =>
        `${account.code} ${account.name}`
          .toLocaleLowerCase("tr-TR")
          .includes(normalizedAccountQuery),
      )
    : accounts;
  const filteredAccounts = accountStatus
    ? searchedAccounts.filter(
        (account) => account.isActive === (accountStatus === "active"),
      )
    : searchedAccounts;
  const accountClassOptions = Object.keys(ledgerAccountClassLabels)
    .filter((key) =>
      accounts.some((account) => ledgerAccountClassOf(account.code) === key),
    )
    .map((key) => ({
      value: key,
      label: `${key} ${ledgerAccountClassLabels[key]}`,
      count: filteredAccounts.filter(
        (account) => ledgerAccountClassOf(account.code) === key,
      ).length,
    }));
  const classFilteredAccounts = accountClass
    ? filteredAccounts.filter(
        (account) => ledgerAccountClassOf(account.code) === accountClass,
      )
    : filteredAccounts;
  const accountTreeRows = buildLedgerAccountGroups(
    classFilteredAccounts,
    collapsedAccountCodes,
    collapsedAccountGroups,
  );
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) || null;
  const selectedAccountParent = selectedAccount
    ? (() => {
        const separator = selectedAccount.code.lastIndexOf(".");
        const parentCode =
          separator > 0 ? selectedAccount.code.slice(0, separator) : "";
        return parentCode
          ? accounts.find(
              (account) =>
                account.code.toLocaleLowerCase("tr-TR") ===
                parentCode.toLocaleLowerCase("tr-TR"),
            ) || null
          : null;
      })()
    : null;
  const selectedAccountGroup = selectedAccount
    ? ledgerAccountGroupOf(selectedAccount.code)
    : "";
  const selectedAccountGroupAccount = selectedAccountGroup
    ? accounts.find((account) => account.code.trim() === selectedAccountGroup)
    : undefined;
  const canDeleteAccount = (account: LedgerAccount) =>
    !account.hasMovements &&
    !accounts.some((row) => row.code.startsWith(`${account.code}.`));
  function toggleAccountGroup(group: string) {
    setCollapsedAccountGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }
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
    "transfer-sources": "Muhasebeye aktarım",
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
  const transferSourceRows: TransferSourceRow[] = [
    ...sources.salesInvoices.map((source) => ({ sourceType: "SalesInvoice" as const, title: "Satış faturası", source })),
    ...sources.salesDeliveries.map((source) => ({ sourceType: "SalesDelivery" as const, title: "Satış irsaliyesi", source })),
    ...sources.salesReturns.map((source) => ({ sourceType: "SalesReturn" as const, title: "Satış iadesi", source })),
    ...sources.purchaseInvoices.map((source) => ({ sourceType: "PurchaseInvoice" as const, title: "Alış faturası", source })),
    ...sources.purchaseReceipts.map((source) => ({ sourceType: "PurchaseReceipt" as const, title: "Mal kabul", source })),
    ...sources.supplierReturns.map((source) => ({ sourceType: "SupplierReturn" as const, title: "Tedarikçi iadesi", source })),
    ...sources.customerCollections.map((source) => ({ sourceType: "CustomerCollection" as const, title: "Müşteri tahsilatı", source })),
    ...sources.supplierPayments.map((source) => ({ sourceType: "SupplierPayment" as const, title: "Tedarikçi ödemesi", source })),
    ...sources.fxRevaluations.map((source) => ({ sourceType: "FxRevaluation" as const, title: "Kur değerleme", source })),
    ...sources.inventoryAdjustments.map((source) => ({ sourceType: "InventoryCostAdjustment" as const, title: `Stok · ${source.kind || ""}`, source })),
  ].map((row) => ({ ...row, key: `${row.sourceType}-${row.source.id}` }));
  const transferCurrencyOf = (source: LedgerSource) =>
    source.currencyCode || sources.baseCurrencyCode || "";
  const isTransferReady = (source: LedgerSource) =>
    source.amount > 0 && missingFor(source).length === 0;
  const isTransferMappingMissing = (source: LedgerSource) =>
    source.amount > 0 && missingFor(source).length > 0;
  const searchedTransferSourceRows = transferSourceRows.filter(({ title, source }) => {
    const query = transferSourceSearch.trim().toLocaleLowerCase("tr-TR");
    return !query || [title, source.code, source.description, source.entryDate, source.currencyCode]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("tr-TR")
      .includes(query);
  });
  // Chip filter: "" = all, "missing" = rows waiting for an account mapping, otherwise a source type.
  const transferTypeChips = transferSourceTypeOrder
    .filter((type) => transferSourceRows.some((row) => row.sourceType === type))
    .map((type) => ({
      value: type,
      label: transferSourceTypeTitles[type],
      count: searchedTransferSourceRows.filter((row) => row.sourceType === type).length,
    }));
  const transferMissingCount = searchedTransferSourceRows.filter(({ source }) =>
    isTransferMappingMissing(source),
  ).length;
  const visibleTransferSourceRows = transferStatus === "missing"
    ? searchedTransferSourceRows.filter(({ source }) => isTransferMappingMissing(source))
    : transferStatus
      ? searchedTransferSourceRows.filter(({ sourceType }) => sourceType === transferStatus)
      : searchedTransferSourceRows;
  const selectedTransferRows = transferSourceRows.filter(({ key }) => selectedTransferKeys.has(key));
  const readyTransferRows = selectedTransferRows.filter(({ source }) =>
    isTransferReady(source),
  );
  // Waiting amount per currency (FX and stock sources are already in the tenant base currency).
  const transferTotalsLabel = Object.entries(
    transferSourceRows.reduce<Record<string, number>>((totals, { source }) => {
      const currency = transferCurrencyOf(source) || "—";
      totals[currency] = (totals[currency] || 0) + source.amount;
      return totals;
    }, {}),
  )
    .sort(([a], [b]) => (a === sources.baseCurrencyCode ? -1 : b === sources.baseCurrencyCode ? 1 : a.localeCompare(b)))
    .map(([currency, total]) => `${fmt(total)} ${currency}`)
    .join(" · ");
  // The previewed row follows the visible list: keep it while visible, else the first row.
  const previewRow =
    visibleTransferSourceRows.find((row) => row.key === previewKey) ||
    visibleTransferSourceRows[0] ||
    null;
  const previewRowKey = previewRow?.key || "";
  useEffect(() => {
    setConfirmingTransfer(false);
    if (view !== "transfer-sources" || role !== "TenantAdmin" || !previewRow) {
      setTransferPreview(null);
      return;
    }
    const controller = new AbortController();
    const key = previewRow.key;
    setTransferPreview({ key, data: null, loading: true, error: "" });
    // Short debounce: clicking through rows only requests the row the user stops on.
    const timer = window.setTimeout(() => {
      api<JournalTransferPreview>("/api/finance/general-ledger/transfer/preview", token, {
        method: "POST",
        body: JSON.stringify({ sourceType: previewRow.sourceType, sourceId: previewRow.source.id }),
        signal: controller.signal,
      })
        .then((data) => {
          if (!controller.signal.aborted) setTransferPreview({ key, data, loading: false, error: "" });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setTransferPreview({ key, data: null, loading: false, error: (e as Error).message });
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // previewRow is derived from previewRowKey and sources; the preview is re-read after each reload.
  }, [view, role, token, previewRowKey, sources]);
  const nextTransferPreviewKey = (key: string) => {
    const index = visibleTransferSourceRows.findIndex((row) => row.key === key);
    if (index < 0) return "";
    return (visibleTransferSourceRows[index + 1] || visibleTransferSourceRows[index - 1])?.key || "";
  };
  const accountFormOpen = accountCreateOpen && view === "accounts";
  // The record lists follow the list-v2 structure (see list-page/README.md); the account
  // card form keeps the classic heading because it hides everything else on the page.
  const isListView =
    view === "accounts" ||
    view === "mappings" ||
    view === "journal-ledger" ||
    view === "transfer-sources";
  const showListHeader = isListView && !accountFormOpen;
  const isTenantAdmin = role === "TenantAdmin";
  const listCount =
    view === "accounts"
      ? accounts.length
      : view === "mappings"
        ? mappings.length
        : view === "journal-ledger"
          ? entryTotal
          : isTenantAdmin
            ? transferSourceRows.length
            : null;
  return (
    <section className={`panel general-ledger-panel finance-workbench general-ledger-view-${view}${accountFormOpen ? " general-ledger-record-form-open" : ""}${showListHeader ? " list-v2" : ""}`}>
      {showListHeader ? (
        <ListPageHeader
          title={viewTitles[view]}
          description={viewDescriptions[view]}
          count={listCount}
          countLabel={view === "transfer-sources" ? `kaynak bekliyor${transferTotalsLabel ? ` · ${transferTotalsLabel}` : ""}` : undefined}
        >
          {view === "journal-ledger" && (
            <button
              type="button"
              className="secondary"
              onClick={() => onNavigate?.("finance-transfer-sources")}
            >
              Aktarılabilir kaynaklar
            </button>
          )}
          {view === "accounts" && isTenantAdmin && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => onNavigate?.("finance-ledger-mappings")}
              >
                Hesap eşleştirmeleri
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void previewStandardChart()}
              >
                Tek Düzen Hesap Planı
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
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
                  setAccountCreateOpen(true);
                }}
              >
                Hesap ekle
              </button>
            </>
          )}
          {view === "transfer-sources" && isTenantAdmin && (
            <button
              type="button"
              className="primary"
              disabled={busy || readyTransferRows.length === 0}
              onClick={() => void transferSelectedSources(readyTransferRows)}
            >
              {busy ? "Aktarılıyor…" : `Seçilenleri aktar (${readyTransferRows.length})`}
            </button>
          )}
        </ListPageHeader>
      ) : accountFormOpen || view === "voucher" ? null : (
        <div className="panel-heading">
          <div>
            <p className="eyebrow">GENEL MUHASEBE</p>
            <h1>{viewTitles[view]}</h1>
            <p>{viewDescriptions[view]}</p>
          </div>
          <div className="heading-actions">
            <button className="secondary small-button" onClick={() => void load()}>Yenile</button>
          </div>
        </div>
      )}
      {/* The voucher form shows its own notice under its header and its errors next to the save bar. */}
      {error && !accountFormOpen && view !== "voucher" && <p className="error-banner">{error}</p>}
      {notice && !accountFormOpen && view !== "voucher" && <p className="notice">{notice}</p>}
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
          <ListToolbar
            search={accountQuery}
            onSearchChange={setAccountQuery}
            searchLabel="Hesap planında ara"
            searchPlaceholder="Kod veya hesap adına göre ara"
            toolsSlotRef={setListToolsSlot}
            onRefresh={() => void load()}
          >
            <ListChipGroup
              label="Hesap durumu"
              value={accountStatus}
              onChange={setAccountStatus}
              options={[
                { value: "", label: "Tüm durumlar", count: searchedAccounts.length },
                { value: "active", label: "Aktif", count: searchedAccounts.filter((account) => account.isActive).length },
                { value: "inactive", label: "Pasif", count: searchedAccounts.filter((account) => !account.isActive).length },
              ]}
            />
            <label className="ledger-class-select">
              <select
                aria-label="Hesap sınıfı"
                value={accountClass}
                onChange={(e) => setAccountClass(e.target.value)}
              >
                <option value="">Tüm sınıflar</option>
                {accountClassOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </label>
          </ListToolbar>
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
          <div className="ledger-chart-layout">
            <nav className="ledger-class-nav" aria-label="Hesap sınıfı">
              <h3>Hesap sınıfı</h3>
              <button
                type="button"
                className={accountClass === "" ? "is-active" : undefined}
                aria-pressed={accountClass === ""}
                onClick={() => setAccountClass("")}
              >
                <span className="ledger-class-name">Tüm sınıflar</span>
                <span className="ledger-class-count">
                  {filteredAccounts.length}
                </span>
              </button>
              {accountClassOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    accountClass === option.value ? "is-active" : undefined
                  }
                  aria-pressed={accountClass === option.value}
                  onClick={() => setAccountClass(option.value)}
                >
                  <span className="ledger-class-digit">{option.value}</span>
                  <span className="ledger-class-name">
                    {ledgerAccountClassLabels[option.value]}
                  </span>
                  <span className="ledger-class-count">{option.count}</span>
                </button>
              ))}
            </nav>
            <div className="ledger-list list-v2-list" id="ledger-chart">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-ledger-accounts"
                defaults={financeGridDefaults["finance-ledger-accounts"]}
                hideSearch
                toolbarContainer={listToolsSlot}
              >
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Kod</th>
                      <th>Hesap</th>
                      <th>Finansal tablo sınıfı</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountTreeRows.map(
                      ({
                        account: a,
                        depth,
                        hasChildren,
                        group,
                        groupStart,
                        isGroupAccount,
                        hiddenCount,
                        groupHasTree,
                      }) => {
                        const groupCollapsed = collapsedAccountGroups.has(group);
                        return (
                          <tr
                            key={a.id}
                            className={[
                              "ledger-account-row",
                              depth > 0 ? "ledger-account-child" : "",
                              groupStart ? "ledger-account-group-start" : "",
                              isGroupAccount ? "ledger-account-group-account" : "",
                              selectedAccountId === a.id
                                ? "ledger-account-selected"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-selected={selectedAccountId === a.id}
                            tabIndex={0}
                            onClick={(e) => {
                              if (
                                (e.target as HTMLElement).closest(
                                  "button,input,select,a",
                                )
                              )
                                return;
                              setSelectedAccountId(a.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedAccountId(a.id);
                              }
                            }}
                          >
                            <td>
                              <div className="ledger-account-code-cell">
                                <span className="ledger-account-group-slot">
                                  {groupStart && (
                                    <button
                                      type="button"
                                      className="ledger-account-group-toggle"
                                      data-group={isGroupAccount ? undefined : group}
                                      aria-label={`${group} grubunu ${groupCollapsed ? "göster" : "gizle"}`}
                                      aria-expanded={!groupCollapsed}
                                      onClick={() => toggleAccountGroup(group)}
                                    >
                                      {groupCollapsed ? (
                                        <ChevronRight size={14} />
                                      ) : (
                                        <ChevronDown size={14} />
                                      )}
                                    </button>
                                  )}
                                </span>
                                <span
                                  className={`ledger-account-code-tree${isGroupAccount ? "" : " is-in-group"}`}
                                  style={{
                                    paddingInlineStart: `${depth * 22}px`,
                                  }}
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
                                  ) : groupHasTree ? (
                                    <span
                                      className="ledger-account-tree-spacer"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span className="customer-code">{a.code}</span>
                                  {hiddenCount > 0 && (
                                    <span
                                      className="ledger-account-group-more"
                                      data-more={`+${hiddenCount}`}
                                      aria-hidden="true"
                                    />
                                  )}
                                </span>
                              </div>
                            </td>
                            <td>{a.name}</td>
                            <td>{ledgerStatementLabels[a.statementSection]}</td>
                            <td>{a.isActive ? "Aktif" : "Pasif"}</td>
                          </tr>
                        );
                      },
                    )}
                    {accountTreeRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="table-empty">
                          {normalizedAccountQuery || accountStatus || accountClass
                            ? "Aramayla eşleşen hesap bulunamadı."
                            : "Tenant hesabı eklenmedi."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </FinanceStudioGrid>
            </div>
            <aside className="ledger-account-detail" aria-label="Seçili hesap">
              {selectedAccount ? (
                <>
                  <div className="list-v2-detail-head">
                    <div>
                      <span className="list-v2-kind">Seçili hesap</span>
                      <h2>
                        <span className="ledger-account-detail-code">
                          {selectedAccount.code}
                        </span>{" "}
                        · {selectedAccount.name}
                      </h2>
                    </div>
                  </div>
                  <div className="list-v2-detail-meta">
                    <span
                      className={`list-v2-status${selectedAccount.isActive ? " is-active" : ""}`}
                    >
                      <i aria-hidden="true" />
                      {selectedAccount.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <dl className="ledger-account-detail-fields">
                    <div>
                      <dt>Finansal tablo sınıfı</dt>
                      <dd>{ledgerStatementLabels[selectedAccount.statementSection]}</dd>
                    </div>
                    {ledgerAccountClassLabels[ledgerAccountClassOf(selectedAccount.code)] && (
                      <div>
                        <dt>Hesap sınıfı</dt>
                        <dd>
                          {ledgerAccountClassOf(selectedAccount.code)}{" "}
                          {ledgerAccountClassLabels[ledgerAccountClassOf(selectedAccount.code)]}
                        </dd>
                      </div>
                    )}
                    {selectedAccountGroup.length === 2 && (
                      <div>
                        <dt>Hesap grubu</dt>
                        <dd>
                          {selectedAccountGroup}
                          {selectedAccountGroupAccount &&
                            selectedAccountGroupAccount.id !== selectedAccount.id &&
                            ` · ${selectedAccountGroupAccount.name}`}
                        </dd>
                      </div>
                    )}
                    {selectedAccountParent && (
                      <div>
                        <dt>Üst hesap</dt>
                        <dd>
                          {selectedAccountParent.code} · {selectedAccountParent.name}
                        </dd>
                      </div>
                    )}
                    {selectedAccount.accountType && (
                      <div>
                        <dt>Hesap tipi</dt>
                        <dd>
                          {ledgerAccountTypeLabels[selectedAccount.accountType] ||
                            selectedAccount.accountType}
                        </dd>
                      </div>
                    )}
                    {selectedAccount.normalBalance && (
                      <div>
                        <dt>Çalışma şekli</dt>
                        <dd>
                          {ledgerNormalBalanceLabels[selectedAccount.normalBalance] ||
                            selectedAccount.normalBalance}
                        </dd>
                      </div>
                    )}
                    {selectedAccount.currencyCode && (
                      <div>
                        <dt>Döviz takibi</dt>
                        <dd>{selectedAccount.currencyCode}</dd>
                      </div>
                    )}
                    {selectedAccount.ifrsAccountCode && (
                      <div>
                        <dt>IFRS / UFRS hesabı</dt>
                        <dd>
                          {selectedAccount.ifrsAccountCode}
                          {selectedAccount.ifrsAccountName &&
                            ` · ${selectedAccount.ifrsAccountName}`}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Hareket</dt>
                      <dd>
                        {selectedAccount.hasMovements ? "Hareket var" : "Hareket yok"}
                      </dd>
                    </div>
                  </dl>
                  {role === "TenantAdmin" && (
                    <div className="ledger-account-detail-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => startEditAccount(selectedAccount)}
                      >
                        Düzenle
                      </button>
                      <div className="list-v2-detail-foot">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleAccount(selectedAccount)}
                        >
                          {selectedAccount.isActive ? "Pasifleştir" : "Aktifleştir"}
                        </button>
                        {canDeleteAccount(selectedAccount) && (
                          <button
                            type="button"
                            className="is-danger"
                            disabled={busy}
                            onClick={() => void deleteAccount(selectedAccount)}
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="ledger-account-detail-empty">Bir hesap seçin</p>
              )}
            </aside>
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
          <ListToolbar
            search={mappingSearch}
            onSearchChange={setMappingSearch}
            searchLabel="Eşleştirmelerde ara"
            searchPlaceholder="Kaynak veya hesap kodu/adı ara"
            toolsSlotRef={setListToolsSlot}
            onRefresh={() => void load()}
          >
            <ListChipGroup
              label="Durum"
              value={mappingStatus}
              onChange={setMappingStatus}
              options={[
                { value: "", label: "Tüm durumlar", count: searchedMappings.length },
                { value: "mapped", label: "Etkin hesapla eşleşen", count: activeMappingCount },
                { value: "unmapped", label: "Eşleştirme gereken", count: searchedMappings.length - activeMappingCount },
              ]}
            />
          </ListToolbar>
          <div className="ledger-list list-v2-list" id="ledger-mappings">
            <FinanceStudioGrid
              token={token}
              screenKey="finance-ledger-mappings"
              defaults={financeGridDefaults["finance-ledger-mappings"]}
              hideSearch
              toolbarContainer={listToolsSlot}
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
                    const active = isMappingActive(m),
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
          accountsLoaded={accountsLoaded}
          manualDate={manualDate}
          setManualDate={setManualDate}
          manualAccountingBasis={manualAccountingBasis}
          setManualAccountingBasis={setManualAccountingBasis}
          manualDescription={manualDescription}
          setManualDescription={setManualDescription}
          manualLines={manualLines}
          setManualLines={setManualLines}
          createManualEntry={createManualEntry}
          error={error}
          onDismissError={() => setError("")}
          notice={notice}
          onDismissNotice={() => setNotice("")}
          onOpenRecentEntries={onNavigate ? () => onNavigate("finance-journal-ledger") : undefined}
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
        <section className="ledger-subpanel ledger-transfer-sources" aria-label="Muhasebeye aktarım">
          <ListToolbar
            search={transferSourceSearch}
            onSearchChange={setTransferSourceSearch}
            searchLabel="Kaynakta ara"
            searchPlaceholder="Kaynak, kod veya açıklama"
            toolsSlotRef={setListToolsSlot}
            onRefresh={() => void load()}
          >
            <ListChipGroup
              label="Kaynak türü"
              value={transferStatus}
              onChange={setTransferStatus}
              options={[
                { value: "", label: "Tümü", count: searchedTransferSourceRows.length },
                ...transferTypeChips,
              ]}
            />
            {(transferMissingCount > 0 || transferStatus === "missing") && (
              <button
                type="button"
                className={`list-v2-chip ledger-transfer-missing-chip${transferStatus === "missing" ? " is-active" : ""}`}
                aria-pressed={transferStatus === "missing"}
                onClick={() => setTransferStatus(transferStatus === "missing" ? "" : "missing")}
              >
                <AlertTriangle size={13} aria-hidden="true" />
                <span>Eşleştirme eksik</span>
                <span className="list-v2-chip-count">{transferMissingCount.toLocaleString("tr-TR")}</span>
              </button>
            )}
          </ListToolbar>
          <div className="ledger-transfer-layout">
            <div className="ledger-list list-v2-list">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-transfer-sources"
                defaults={financeGridDefaults["finance-transfer-sources"]}
                onSelectionChange={handleTransferSelection}
                hideSearch
                toolbarContainer={listToolsSlot}
              >
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Kaynak</th>
                      <th>Tarih</th>
                      <th>Cari / Açıklama</th>
                      <th className="ledger-transfer-amount-cell">Tutar</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransferSourceRows.map(({ title, source: x, key }) => {
                      const missing = missingFor(x);
                      const isPreviewed = key === previewRowKey;
                      return (
                        <tr
                          key={key}
                          className={`ledger-transfer-row${isPreviewed ? " is-previewed" : ""}`}
                          tabIndex={0}
                          aria-current={isPreviewed || undefined}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("button,input,a,select")) return;
                            setPreviewKey(key);
                          }}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setPreviewKey(key);
                            }
                          }}
                        >
                          <td className="ledger-transfer-source-cell" title={x.code}>
                            <span className="ledger-transfer-source">
                              <b>{title}</b>
                              <small>{shortenTransferCode(x.code)}</small>
                            </span>
                          </td>
                          <td>{displayDate(x.entryDate)}</td>
                          <td title={x.description || undefined}>
                            {x.description || "Dönem sonu kur değerleme"}
                          </td>
                          <td className="ledger-transfer-amount-cell">
                            {fmt(x.amount)}
                            {transferCurrencyOf(x) ? ` ${transferCurrencyOf(x)}` : ""}
                          </td>
                          <td>
                            {x.amount <= 0 ? (
                              <span className="ledger-transfer-status is-muted">Sıfır tutar · aktarılamaz</span>
                            ) : missing.length > 0 ? (
                              <button
                                type="button"
                                className="ledger-transfer-status is-warning"
                                title={`${missing.map((mappingKey) => labelByKey[mappingKey] || mappingKey).join(" · ")} eksik`}
                                onClick={() => onNavigate?.("finance-ledger-mappings")}
                              >
                                <AlertTriangle size={13} aria-hidden="true" />
                                Hesap eşleştir
                              </button>
                            ) : (
                              <span className="ledger-transfer-status is-ready">
                                <CheckCircle2 size={13} aria-hidden="true" />
                                Hazır
                              </span>
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
            <aside className="ledger-transfer-preview" aria-label="Oluşacak yevmiye fişi" aria-live="polite">
              {previewRow ? (
                <>
                  <div className="list-v2-detail-head">
                    <div>
                      <span className="list-v2-kind">Oluşacak yevmiye fişi</span>
                      <h2>{previewRow.title}</h2>
                      <span className="ledger-transfer-preview-code" title={previewRow.source.code}>
                        {previewRow.source.code} · {displayDate(previewRow.source.entryDate)}
                      </span>
                    </div>
                  </div>
                  {transferPreview?.key === previewRow.key && transferPreview.data ? (
                    <>
                      {transferPreview.data.lines.length > 0 && (
                        <table className="ledger-transfer-preview-table">
                          <thead>
                            <tr>
                              <th scope="col">Hesap</th>
                              <th scope="col">Borç</th>
                              <th scope="col">Alacak</th>
                            </tr>
                          </thead>
                          <tbody>
                            {transferPreview.data.lines.map((line) => (
                              <tr key={line.lineNumber} title={line.description}>
                                <td>
                                  <b>{line.accountCode}</b>
                                  <small>{line.accountName}</small>
                                </td>
                                <td>{line.debit ? fmt(line.debit) : ""}</td>
                                <td>{line.credit ? fmt(line.credit) : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th scope="row">Toplam</th>
                              <td>{fmt(transferPreview.data.totalDebit)}</td>
                              <td>{fmt(transferPreview.data.totalCredit)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                      {transferPreview.data.canTransfer ? (
                        <p className="ledger-transfer-preview-balance is-ready">
                          <CheckCircle2 size={15} aria-hidden="true" />
                          <span>
                            Dengeli · {transferPreview.data.entryDate ? displayDate(transferPreview.data.entryDate) : displayDate(previewRow.source.entryDate)} dönemi açık
                          </span>
                        </p>
                      ) : (
                        <p className="ledger-transfer-preview-balance is-blocked" role="alert">
                          <AlertTriangle size={15} aria-hidden="true" />
                          <span>{transferPreview.data.blockingReason}</span>
                        </p>
                      )}
                      {!transferPreview.data.canTransfer && missingFor(previewRow.source).length > 0 && (
                        <button
                          type="button"
                          className="secondary ledger-transfer-preview-action"
                          onClick={() => onNavigate?.("finance-ledger-mappings")}
                        >
                          Hesap eşleştirmelerine git
                        </button>
                      )}
                      {confirmingTransfer ? (
                        <div className="ledger-transfer-confirm" role="group" aria-label="Aktarımı onayla">
                          <p>{previewRow.source.code} değiştirilemez yevmiye fişi olarak aktarılsın mı?</p>
                          <div>
                            <button
                              type="button"
                              className="primary"
                              disabled={busy}
                              onClick={() => void transferPreviewedSource(previewRow, nextTransferPreviewKey(previewRow.key))}
                            >
                              {busy ? "Aktarılıyor…" : "Evet, aktar"}
                            </button>
                            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmingTransfer(false)}>
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="primary ledger-transfer-preview-action"
                          disabled={busy || !transferPreview.data.canTransfer}
                          onClick={() => setConfirmingTransfer(true)}
                        >
                          Bu kaynağı aktar
                        </button>
                      )}
                      <p className="ledger-transfer-preview-note">Aktarılan fiş değiştirilemez; düzeltme ters kayıtla yapılır.</p>
                    </>
                  ) : transferPreview?.key === previewRow.key && transferPreview.error ? (
                    <p className="ledger-transfer-preview-balance is-blocked" role="alert">
                      <AlertTriangle size={15} aria-hidden="true" />
                      <span>{transferPreview.error}</span>
                    </p>
                  ) : (
                    <p className="ledger-transfer-preview-empty">Önizleme hazırlanıyor…</p>
                  )}
                </>
              ) : (
                <p className="ledger-transfer-preview-empty">
                  {transferSourceRows.length ? "Önizleme için bir kaynak seçin." : "Aktarılmayı bekleyen kaynak yok."}
                </p>
              )}
            </aside>
          </div>
        </section>
      )}
      {view === "journal-ledger" && (
          <section
            className="ledger-subpanel"
            aria-label="Yevmiye defteri kayıtları"
          >
            <ListToolbar
              toolsSlotRef={setListToolsSlot}
              onRefresh={() => void load()}
            >
              <label className="list-v2-filter">
                <span>Başlangıç</span>
                <input
                  type="date"
                  aria-label="Başlangıç"
                  value={entryFrom}
                  max={entryTo || undefined}
                  onChange={(e) => {
                    setEntryPage(1);
                    setEntryFrom(e.target.value);
                  }}
                />
              </label>
              <label className="list-v2-filter">
                <span>Bitiş</span>
                <input
                  type="date"
                  aria-label="Bitiş"
                  value={entryTo}
                  min={entryFrom || undefined}
                  onChange={(e) => {
                    setEntryPage(1);
                    setEntryTo(e.target.value);
                  }}
                />
              </label>
            </ListToolbar>
            <div className="ledger-list journal-entries-list list-v2-list" id="ledger-journal">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-journals"
                defaults={financeGridDefaults["finance-journals"]}
                externalPagination
                toolbarContainer={listToolsSlot}
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
              <div className="panel ledger-entry-detail" style={{ marginTop: 14 }}>
                <header className="list-v2-detail-head">
                  <div>
                    <span className="list-v2-kind">Yevmiye fişi</span>
                    <h2>{selected.code}</h2>
                  </div>
                  <div className="list-v2-detail-head-actions">
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
                </header>
                <div className="list-v2-detail-meta">
                  <span>{selected.entryDate.split("-").reverse().join(".")}</span>
                  {selected.description && <span>{selected.description}</span>}
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
