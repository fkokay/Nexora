import { useCallback, useEffect, useRef, useState } from "react";
import { api, localDateString } from "./erpApi";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
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
import { AccountChartView } from "./general-ledger/components/AccountChartView";
import { LedgerMappingsView } from "./general-ledger/components/LedgerMappingsView";
import { JournalLedgerView } from "./general-ledger/components/JournalLedgerView";
import { TrialBalanceView } from "./general-ledger/components/TrialBalanceView";
import { BalanceSheetView } from "./general-ledger/components/BalanceSheetView";
import { AccountingRuleProfilesPanel } from "./general-ledger/AccountingRuleProfilesPanel";
import type {
  LedgerAccount,
  LedgerMapping,
  JournalEntrySummary,
  LedgerStatementSection,
  LedgerSource,
  JournalEntryView,
} from "./erp-types";
import { confirmDialog, promptDialog } from "./confirmDialog";
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
  const [journalSourceChip, setJournalSourceChip] = useState("");
  // Server-side accounting basis filter of the journal ledger ("" = all; the endpoint already takes it).
  const [entryBasis, setEntryBasis] = useState("");
  const [entriesLoading, setEntriesLoading] = useState(false);
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
  const [chartPreview, setChartPreview] = useState<{
      totalAccounts: number;
      existingAccounts: number;
      accountsToAdd: number;
      sourceUrl: string;
    } | null>(null),
    [accountCreateOpen, setAccountCreateOpen] = useState(false);
  const [newAccountParentId, setNewAccountParentId] = useState("");
  const stayAfterAccountSave = useRef(false);
  const [transferSourceSearch, setTransferSourceSearch] = useState("");
  // list-v2: status chips of the three client-side lists ("" = all).
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
        if (entryBasis) entryParams.set("accountingBasis", entryBasis);
        setEntriesLoading(true);
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
        setEntriesLoading(false);
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
      setEntriesLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token, entryPage, view, entryFrom, entryTo, entryBasis]);
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
      !(await confirmDialog({
        title: "Eksik hesaplar eklensin mi?",
        message: `Türkiye Tek Düzen Hesap Planı'ndaki ${chartPreview.accountsToAdd} eksik hesap bu firmaya eklenecek. Var olan hesaplar ve muhasebe eşleştirmeleri değiştirilmez.`,
        tone: "default",
        confirmLabel: "Hesapları ekle",
      }))
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
      !(await confirmDialog({
        title: "Hesap silinsin mi?",
        message: `${account.code} · ${account.name} hesabı silinecek. Hesaba bağlı eşleştirme varsa kaldırılır.`,
        tone: "danger",
        confirmLabel: "Sil",
      }))
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
    if (
      !(await confirmDialog({
        title: "Kaynaklar muhasebeye aktarılsın mı?",
        message: `${rows.length} kaynak, değiştirilemez yevmiye fişleri olarak aktarılacak. Lütfen borç ve alacak hesap eşleştirmelerini kontrol edin.`,
        tone: "warning",
        confirmLabel: "Aktar",
      }))
    )
      return;
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
  async function reverseJournalEntry(entry: JournalEntryView) {
    // One dialog asks for the reason and confirms the reversal (the reason is required by the API).
    const reason = (
      await promptDialog({
        title: "Fiş ters çevrilsin mi?",
        message: `${entry.code} fişinin borç/alacak satırları ters çevrilerek yeni bir fiş oluşturulur. Özgün fiş korunur.`,
        label: "Ters kayıt gerekçesi",
        required: true,
        multiline: true,
        tone: "warning",
        confirmLabel: "Ters kaydı oluştur",
      })
    )?.trim();
    if (!reason) return;
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
  const canDeleteAccount = (account: LedgerAccount) =>
    !account.hasMovements &&
    !accounts.some((row) => row.code.startsWith(`${account.code}.`));
  const viewTitles: Record<LedgerView, string> = {
    overview: "Muhasebe çalışma alanı",
    accounts: "Hesap planı",
    mappings: "Hesap eşleştirmeleri",
    voucher: "Yevmiye fişi",
    "trial-balance": "Mizan",
    "balance-sheet": "Bilanço",
    "journal-ledger": "Yevmiye defteri",
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
  // The chart of accounts, the mappings and the journal ledger render their own list-v2 header inside the view.
  const ownsHeader = view === "accounts" || view === "mappings" || view === "journal-ledger";
  // Mizan and Bilanço render their own list-v2 header (with report exports) inside the view.
  const isReportView = view === "trial-balance" || view === "balance-sheet";
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
    <section className={`${view === "journal-ledger" || view === "voucher" ? "" : "panel "}general-ledger-panel finance-workbench general-ledger-view-${view}${accountFormOpen ? " general-ledger-record-form-open" : ""}${showListHeader || isReportView ? " list-v2" : ""}`}>
      {showListHeader && !ownsHeader ? (
        <ListPageHeader
          title={viewTitles[view]}
          description={viewDescriptions[view]}
          count={listCount}
          countLabel={view === "transfer-sources" ? `kaynak bekliyor${transferTotalsLabel ? ` · ${transferTotalsLabel}` : ""}` : undefined}
        >
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
      ) : accountFormOpen || view === "voucher" || isReportView || ownsHeader ? null : (
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
      {view === "accounts" && !accountFormOpen && (
        <AccountChartView
          token={token}
          role={role}
          accounts={accounts}
          mappings={mappings}
          busy={busy}
          onRefresh={() => void load()}
          onNavigate={onNavigate}
          actions={{
            onAdd: () => {
              resetNewAccountForm();
              setAccountCreateOpen(true);
            },
            onAddChild: (parent) => {
              resetNewAccountForm();
              setNewAccountParentId(parent.id);
              setNewAccountSection(parent.statementSection);
              setAccountCreateOpen(true);
            },
            onEdit: startEditAccount,
            onToggle: (account) => void toggleAccount(account),
            onDelete: (account) => void deleteAccount(account),
            canDelete: canDeleteAccount,
            onPreviewStandardChart: () => void previewStandardChart(),
          }}
          standardChartNotice={
            role === "TenantAdmin" && chartPreview ? (

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
            ) : null
          }
        />
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
        <LedgerMappingsView
          token={token}
          role={role}
          accounts={accounts}
          mappings={mappings}
          loaded={accountsLoaded}
          onSaved={() => load()}
          onRefresh={() => void load()}
          onNavigate={onNavigate}
        />
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
          onReset={() => {
            setManualDescription("");
            setManualLines([emptyManualJournalLine(), emptyManualJournalLine(), emptyManualJournalLine()]);
            setError("");
            setNotice("");
          }}
        />
      )}
      {view === "trial-balance" && <TrialBalanceView token={token} />}
      {view === "balance-sheet" && <BalanceSheetView token={token} />}
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
        <JournalLedgerView
          token={token}
          role={role}
          entries={entries}
          entryTotal={entryTotal}
          loading={entriesLoading}
          entryPage={entryPage}
          setEntryPage={setEntryPage}
          entryFrom={entryFrom}
          entryTo={entryTo}
          onDateRangeChange={(from, to) => {
            setEntryPage(1);
            setEntryFrom(from);
            setEntryTo(to);
          }}
          basis={entryBasis}
          onBasisChange={(next) => {
            setEntryPage(1);
            setEntryBasis(next);
          }}
          sourceChip={journalSourceChip}
          setSourceChip={setJournalSourceChip}
          busy={busy}
          onReverse={reverseJournalEntry}
          onRefresh={() => void load()}
          pendingSources={isTenantAdmin ? transferSourceRows.length : null}
          baseCurrency={sources.baseCurrencyCode || ""}
          onNavigate={onNavigate}
        />
      )}
    </section>
  );
}
