import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authenticatedFetch } from "./authApi";
import { X } from "lucide-react";
import { localDateString } from "./dateUtils";
import ContractRegister, {
  type ContractTab,
} from "./commercial-contracts/components/ContractRegister";
import ContractCreateDialog from "./commercial-contracts/components/ContractCreateDialog";
import ContractsPageHeader from "./commercial-contracts/components/ContractsPageHeader";
import {
  dateLabel,
  statusLabel,
  statusLabelsEn,
  type Contract,
  type ContractStatus,
  type ContractType,
  type Counterparty,
  type CounterpartyPage,
  type Detail,
  type Page,
  type SourceKind,
  type SourceOption,
  type SourcePage,
  type Transition,
} from "./commercial-contracts/types";
import { downloadCsv, downloadXlsx } from "./general-ledger/ledgerReportUtils";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./finance-hub.css";
import "./credit-facilities.css";
import "./commercial-contracts.css";
import "./commercial-contracts/commercial-contracts.css";
import { problemDetail } from "./erpApi";

/** The list endpoint pages at most 100 rows; the register loads every contract of the company. */
const LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 100;

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
  locale: "tr" | "en" = "tr",
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      title?: string;
      errors?: Record<string, string[]>;
    } | null;
    const validation = Object.values(body?.errors ?? {})
      .flat()
      .join(" ");
    throw new Error(
      response.status === 403
        ? locale === "en"
          ? "You are not authorized to perform this action."
          : "Bu işlem için yetkiniz yok."
        : body?.error ||
          validation ||
          problemDetail(body) ||
          (locale === "en"
            ? `Request failed (${response.status}).`
            : `İstek başarısız (${response.status}).`),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const englishUi: Record<string, string> = {
  "Bu işlem için yetkiniz yok.":
    "You are not authorized to perform this action.",
  Tür: "Type",
  "Tür filtresi": "Type filter",
  "Durum filtresi": "Status filter",
  "Sözleşme durum değişiklikleri": "Contract status changes",
  "Cari hesap": "Account",
  Başlangıç: "Start date",
  Bitiş: "End date",
  Döviz: "Currency",
  Durum: "Status",
  Sürüm: "Revision",
  İşlemler: "Actions",
  "Sözleşme kodu": "Contract code",
  "Filtreye uyan sözleşme": "Matching contracts",
  "Bu sayfada aktif": "Active on this page",
  "Aktif firma verisi": "Active company data",
  "SATIŞ · SATIN ALMA": "SALES · PROCUREMENT",
  "Ticari sözleşmeler": "Commercial contracts",
  "Müşteri ve tedarikçi sözleşmelerini firma kapsamında izleyin; durum değişiklikleri geçmişe kaydedilir.":
    "Manage customer and supplier contracts for this company; status changes are recorded in history.",
  Yenile: "Refresh",
  "Yeni sözleşme": "New contract",
  "Sözleşme listesi": "Contract list",
  Filtreler: "Filters",
  "Sözleşme filtreleri": "Contract filters",
  "Sözleşme listesini tür, durum veya cari hesaba göre daraltın.":
    "Narrow the contract list by type, status or account.",
  "Satış ve satın alma sözleşmeleri aynı firma kapsamında listelenir.":
    "Sales and purchase contracts are listed for the same company.",
  "Sözleşme ara": "Search contracts",
  "Kod veya cari hesapta ara": "Search by code or account",
  "Kod veya cari ara": "Search code or account",
  "Sözleşme türüne göre filtrele": "Filter by contract type",
  "Tüm türler": "All types",
  Satış: "Sales",
  "Satın alma": "Purchase",
  "Sözleşme durumuna göre filtrele": "Filter by contract status",
  "Tüm durumlar": "All statuses",
  "Sözleşmeler yükleniyor…": "Loading contracts…",
  "Seçili filtrelerle eşleşen sözleşme bulunamadı.":
    "No contracts match the selected filters.",
  "Henüz sözleşme bulunmuyor.": "No contracts yet.",
  "Filtreleri temizle": "Clear filters",
  "Kayıtlar alınıyor…": "Loading records…",
  görüntüleniyor: "shown",
  "eşleşen kayıt": "matching records",
  "Oluşturma ve durum değiştirme işlemleri firma yöneticisine açıktır.":
    "Creating contracts and changing their status are available to company administrators.",
  "Açılıyor…": "Opening…",
  Detay: "Details",
  "sözleşmesinin detaylarını aç": "Open contract details",
  "Listeye dön": "Back to list",
  "Sözleşme detayını kapat": "Close contract details",
  "Hatayı kapat": "Dismiss error",
  "Bildirimi kapat": "Dismiss notification",
  "SATIŞ SÖZLEŞMESİ": "SALES CONTRACT",
  "SATIN ALMA SÖZLEŞMESİ": "PURCHASE CONTRACT",
  Geçerlilik: "Validity",
  "Para birimi": "Currency",
  "Bağlı kaynak": "Linked source",
  "Bağlı teklif veya sipariş yok": "No linked quote or order",
  "Durum işlemi": "Status action",
  "Yeniden etkinleştir": "Reactivate",
  Etkinleştir: "Activate",
  "Askıya al": "Suspend",
  "Tamamlandı olarak işaretle": "Mark completed",
  Feshet: "Terminate",
  "İptal et": "Cancel",
  "Durum geçmişi": "Status history",
  "Henüz durum değişikliği yapılmadı.": "No status changes yet.",
  "YENİ KAYIT": "NEW RECORD",
  "Sözleşme oluştur": "Create contract",
  "Oluşturma penceresini kapat": "Close create dialog",
  "Sözleşme türü": "Contract type",
  "Cari hesap ara": "Search accounts",
  "Kod, unvan veya vergi no ara": "Search code, name or tax number",
  "Cari hesap seç": "Select account",
  "Cari hesaplar yükleniyor…": "Loading accounts…",
  "Cari seçin": "Select an account",
  "Uygun cari hesap yok": "No eligible accounts",
  "uygun cari": "eligible accounts",
  sayfa: "page",
  Önceki: "Previous",
  Sonraki: "Next",
  "Kaynak belge türü": "Source document type",
  "Bağlantı yok": "No link",
  "Satış teklifi": "Sales quote",
  "Satış siparişi": "Sales order",
  "Tedarikçi teklifi": "Supplier quote",
  "Satın alma siparişi": "Purchase order",
  "Kaynak belge": "Source document",
  "İsteğe bağlı": "Optional",
  "Kaynak belge ara": "Search source document",
  "Önce cari seçin": "Select an account first",
  "Belge kodu veya cari ara": "Search document code or account",
  "Kaynak belgesi seç": "Select source document",
  "Belgeler yükleniyor…": "Loading documents…",
  "Belge seçin": "Select a document",
  "Uygun belge yok": "No eligible documents",
  "uygun belge": "eligible documents",
  "Başlangıç tarihi": "Start date",
  "Bitiş tarihi": "End date",
  "Kaynaklar sunucuda tenant, cari ve para birimine göre filtrelenir. Arama ve sayfalama ile tüm uygun belgeleri bulabilirsiniz.":
    "Sources are filtered on the server by tenant, account and currency. Search and pagination help you find all eligible documents.",
  "Sözleşme taslak olarak oluşturulur. Kaynak belge bağlantısı isteğe bağlıdır; bağlanan belge ile cari ve döviz tutarlılığı API’de yeniden doğrulanır.":
    "The contract is created as a draft. Linking a source document is optional; the API revalidates account and currency consistency.",
  Vazgeç: "Cancel",
  "Kaydediliyor…": "Saving…",
  "Taslağı oluştur": "Create draft",
  "Sözleşme taslak olarak oluşturuldu.": "Contract created as a draft.",
  Askıda: "Suspended",
  Tamamlandı: "Completed",
  Feshedildi: "Terminated",
  İptal: "Cancelled",
  kayıt: "records",
  "Sözleşmeleri yenile": "Refresh contracts",
  "İlk sözleşmeyi cari hesap ve geçerlilik tarihleriyle taslak olarak oluşturun.":
    "Create the first contract as a draft with an account and validity dates.",
  "Sözleşmeler firma yöneticisi tarafından oluşturulur.":
    "Contracts are created by company administrators.",
  "Ayrıntıları görmek için soldan bir sözleşme seçin.":
    "Select a contract on the left to see its details.",
  "süresi doldu": "expired",
  "bugün bitiyor": "ends today",
  "Satış sözleşmesi": "Sales contract",
  "Satın alma sözleşmesi": "Purchase contract",
  "Sözleşme ayrıntıları": "Contract details",
  Özet: "Summary",
  "Listelenen sözleşmeleri XLSX olarak indir": "Download listed contracts as XLSX",
  "Listelenen sözleşmeleri CSV olarak indir": "Download listed contracts as CSV",
  "Dışa aktarma dosyası oluşturulamadı.": "The export file could not be created.",
  Sözleşmeler: "Contracts",
  "Durum geçmişi alınamadı.": "Status history could not be loaded.",
};
const translateUi = (value: string, en: boolean) =>
  en ? (englishUi[value] ?? value) : value;

export default function CommercialContractsPage({
  token,
  role,
  locale = "tr",
}: {
  token: string;
  role: string;
  locale?: "tr" | "en";
}) {
  const en = locale === "en";
  const labels = en ? statusLabelsEn : statusLabel;
  const tx = (value: string) => translateUi(value, en);
  const [contracts, setContracts] = useState<Contract[]>([]),
    [counterpartyPageData, setCounterpartyPageData] =
      useState<CounterpartyPage | null>(null),
    [counterpartyLoading, setCounterpartyLoading] = useState(false),
    [counterpartySearch, setCounterpartySearch] = useState(""),
    [counterpartyPage, setCounterpartyPage] = useState(1),
    [selectedCounterparty, setSelectedCounterparty] =
      useState<Counterparty | null>(null),
    [sourcePageData, setSourcePageData] = useState<SourcePage | null>(null),
    [sourceLoading, setSourceLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [tab, setTab] = useState<ContractTab>("summary"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContractType | "">(""),
    [statusFilter, setStatusFilter] = useState<ContractStatus | "">(""),
    [search, setSearch] = useState(""),
    [showCreate, setShowCreate] = useState(false);
  const [type, setType] = useState<"Sales" | "Purchase">("Sales"),
    [counterpartyId, setCounterpartyId] = useState(""),
    [code, setCode] = useState(""),
    [currency, setCurrency] = useState("TRY"),
    [from, setFrom] = useState(localDateString()),
    [through, setThrough] = useState(`${new Date().getFullYear()}-12-31`),
    [sourceKind, setSourceKind] = useState<SourceKind>("none"),
    [sourceId, setSourceId] = useState(""),
    [sourceQuery, setSourceQuery] = useState(""),
    [sourcePage, setSourcePage] = useState(1),
    [selectedSource, setSelectedSource] = useState<SourceOption | null>(null);
  const canEdit = role === "TenantAdmin";
  const today = localDateString();
  // Loads every contract (newest first) so the status chips can show exact counts.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items: Contract[] = [];
      for (let pageNumber = 1; pageNumber <= MAX_LIST_PAGES; pageNumber += 1) {
        const params = new URLSearchParams({
          page: String(pageNumber),
          pageSize: String(LIST_PAGE_SIZE),
          sortBy: "createdAt",
          sortDirection: "desc",
        });
        const result = await request<Page>(
          `/api/commercial-contracts?${params}`,
          token,
          undefined,
          locale,
        );
        items.push(...result.items);
        if (result.items.length < LIST_PAGE_SIZE || items.length >= result.total) break;
      }
      setContracts(items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, locale]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    setCounterpartyPageData(null);
    if (!showCreate) {
      setCounterpartyLoading(false);
      return;
    }
    setCounterpartyLoading(true);
    setError("");
    void (async () => {
      try {
        const params = new URLSearchParams({
          type,
          page: String(counterpartyPage),
          pageSize: "25",
        });
        if (counterpartySearch.trim())
          params.set("q", counterpartySearch.trim());
        const data = await request<CounterpartyPage>(
          `/api/commercial-contracts/counterparties?${params}`,
          token,
          undefined,
          locale,
        );
        if (!cancelled) setCounterpartyPageData(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setCounterpartyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreate, type, counterpartySearch, counterpartyPage, token, locale]);
  useEffect(() => {
    let cancelled = false;
    setSourcePageData(null);
    if (
      !showCreate ||
      sourceKind === "none" ||
      !counterpartyId ||
      currency.trim().length !== 3
    ) {
      setSourceLoading(false);
      return;
    }
    setSourceLoading(true);
    setError("");
    void (async () => {
      try {
        const kind =
          sourceKind === "sales-quote"
            ? "SalesQuote"
            : sourceKind === "sales-order"
              ? "SalesOrder"
              : sourceKind === "purchase-quote"
                ? "PurchaseSupplierQuote"
                : "PurchaseOrder";
        const params = new URLSearchParams({
          kind,
          counterpartyId,
          currencyCode: currency.trim().toUpperCase(),
          page: String(sourcePage),
          pageSize: "25",
        });
        if (sourceQuery.trim()) params.set("q", sourceQuery.trim());
        const data = await request<SourcePage>(
          `/api/commercial-contracts/sources?${params}`,
          token,
          undefined,
          locale,
        );
        if (!cancelled) setSourcePageData(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    showCreate,
    sourceKind,
    counterpartyId,
    currency,
    sourcePage,
    sourceQuery,
    token,
    locale,
  ]);
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visibleContracts = contracts.filter(
    (item) =>
      (!typeFilter || item.type === typeFilter) &&
      (!statusFilter || item.status === statusFilter) &&
      `${item.code} ${item.counterpartyName}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedSearch),
  );
  const selectedContract =
    visibleContracts.find((item) => item.id === selectedId) ??
    visibleContracts[0] ??
    null;
  const selectedContractId = selectedContract?.id ?? "";
  // The list row's revision changes after every status change, so it also refreshes the detail.
  const selectedRevision = selectedContract?.revision ?? 0;
  useEffect(() => {
    if (!selectedContractId) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void request<Detail>(
      `/api/commercial-contracts/${selectedContractId}`,
      token,
      undefined,
      locale,
    )
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedContractId, selectedRevision, token, locale]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const source = {
      salesQuoteId: sourceKind === "sales-quote" && sourceId ? sourceId : null,
      salesOrderId: sourceKind === "sales-order" && sourceId ? sourceId : null,
      purchaseSupplierQuoteId:
        sourceKind === "purchase-quote" && sourceId ? sourceId : null,
      purchaseOrderId:
        sourceKind === "purchase-order" && sourceId ? sourceId : null,
    };
    try {
      const created = await request<Contract>(
        "/api/commercial-contracts",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code,
            type,
            counterpartyId,
            effectiveFrom: from,
            effectiveThrough: through,
            currencyCode: currency,
            ...source,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
        locale,
      );
      setShowCreate(false);
      setNotice(tx("Sözleşme taslak olarak oluşturuldu."));
      // Clear the filters so the new draft is listed and selected.
      setSearch("");
      setTypeFilter("");
      setStatusFilter("");
      setSelectedId(created.id);
      setTab("summary");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transition(status: ContractStatus) {
    // Only act on the detail that belongs to the contract on screen (its id and revision).
    if (!detail || detail.contract.id !== selectedContractId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{
        contract: Contract;
        transition: Transition;
      }>(
        `/api/commercial-contracts/${detail.contract.id}/transitions`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            status,
            reason: "",
            idempotencyKey: crypto.randomUUID(),
            revision: detail.contract.revision,
          }),
        },
        locale,
      );
      setDetail((current) =>
        current && current.contract.id === result.contract.id
          ? {
              contract: result.contract,
              transitions: [...current.transitions, result.transition],
            }
          : current,
      );
      // Keep the changed contract selected even when it leaves the active status filter.
      setSelectedId(result.contract.id);
      if (statusFilter && statusFilter !== result.contract.status) setStatusFilter("");
      setNotice(
        en
          ? `Contract status updated to “${labels[status]}”.`
          : `Sözleşme durumu “${labels[status]}” olarak güncellendi.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportRows() {
    return [
      [
        tx("Sözleşme kodu"),
        tx("Tür"),
        tx("Cari hesap"),
        tx("Başlangıç"),
        tx("Bitiş"),
        tx("Döviz"),
        tx("Durum"),
        tx("Sürüm"),
      ],
      ...visibleContracts.map((item) => [
        item.code,
        item.type === "Sales" ? tx("Satış") : tx("Satın alma"),
        item.counterpartyName,
        dateLabel(item.effectiveFrom, en),
        dateLabel(item.effectiveThrough, en),
        item.currencyCode,
        labels[item.status],
        `v${item.revision}`,
      ]),
    ];
  }
  const exportName = `${en ? "commercial-contracts" : "ticari-sozlesmeler"}-${today}`;
  return (
    <main className="contracts-page commercial-contracts-page list-v2 fh-page cf-page">
      <ContractsPageHeader
        total={loading && contracts.length === 0 ? undefined : visibleContracts.length}
        canEdit={canEdit}
        canExport={visibleContracts.length > 0}
        tx={tx}
        onCreate={() => setShowCreate(true)}
        onExportXlsx={() =>
          void downloadXlsx(`${exportName}.xlsx`, tx("Sözleşmeler"), exportRows()).catch(
            () => setError(tx("Dışa aktarma dosyası oluşturulamadı.")),
          )
        }
        onExportCsv={() => downloadCsv(`${exportName}.csv`, exportRows())}
      />
      {error && !showCreate && (
        <div className="contracts-alert" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            aria-label={tx("Hatayı kapat")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="contracts-notice" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label={tx("Bildirimi kapat")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <ContractRegister
        contracts={contracts}
        visibleContracts={visibleContracts}
        selected={selectedContract}
        detail={detail}
        detailLoading={detailLoading}
        loading={loading}
        today={today}
        tab={tab}
        search={search}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        labels={labels}
        en={en}
        canEdit={canEdit}
        busy={busy}
        tx={tx}
        onSearchChange={setSearch}
        onTypeFilterChange={setTypeFilter}
        onStatusFilterChange={setStatusFilter}
        onRefresh={() => {
          if (!loading) void load();
        }}
        onSelect={(contract) => setSelectedId(contract.id)}
        onTabChange={setTab}
        onTransition={(status) => void transition(status)}
        onClearFilters={() => {
          setSearch("");
          setTypeFilter("");
          setStatusFilter("");
        }}
        onCreate={() => setShowCreate(true)}
      />
      {showCreate && (
        <ContractCreateDialog
          error={error}
          setError={setError}
          tx={tx}
          busy={busy}
          setShowCreate={setShowCreate}
          create={create}
          type={type}
          setType={setType}
          code={code}
          setCode={setCode}
          counterpartySearch={counterpartySearch}
          setCounterpartySearch={setCounterpartySearch}
          counterpartyId={counterpartyId}
          setCounterpartyId={setCounterpartyId}
          selectedCounterparty={selectedCounterparty}
          setSelectedCounterparty={setSelectedCounterparty}
          counterpartyPageData={counterpartyPageData}
          counterpartyLoading={counterpartyLoading}
          counterpartyPage={counterpartyPage}
          setCounterpartyPage={setCounterpartyPage}
          sourceKind={sourceKind}
          setSourceKind={setSourceKind}
          sourceId={sourceId}
          setSourceId={setSourceId}
          selectedSource={selectedSource}
          setSelectedSource={setSelectedSource}
          sourcePageData={sourcePageData}
          sourceLoading={sourceLoading}
          sourcePage={sourcePage}
          setSourcePage={setSourcePage}
          sourceQuery={sourceQuery}
          setSourceQuery={setSourceQuery}
          currency={currency}
          setCurrency={setCurrency}
          from={from}
          setFrom={setFrom}
          through={through}
          setThrough={setThrough}
        />
      )}
    </main>
  );
}
