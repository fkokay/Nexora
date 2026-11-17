import { useEffect, useRef, useState } from "react";
import { BookOpen, CircleDollarSign, RotateCcw, Shuffle } from "lucide-react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import { api } from "../../erpApi";
import type { BuiltInScreenLayoutField, JournalEntrySummary, JournalEntryView } from "../../erp-types";
import { PageCommandsSlot, documentOpenCommands } from "../../commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "../../commands/gridCommands";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { ListFooter } from "../../list-page/ListFooter";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListPagination } from "../../list-page/ListPagination";
import { ListSummaryCards } from "../../list-page/ListSummaryCards";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import { SalesListPanelToggle } from "../../sales/components/SalesListDetailPanel";
import { useStockDetailPanelOpen } from "../../inventory/components/InventoryStockDetailPanel";
import { journalSourceTone, journalSourceTypeLabel } from "../sourceTypeLabels";
import { displayDate, formatAmount } from "../ledgerReportUtils";
import { JournalEntryListPanel, JournalEntryListPanelEmpty } from "./JournalEntryListPanel";
import { entryCreatedLabel, reversalBlockReason } from "../journalEntries";
import { JournalEntryDocument } from "./JournalEntryDocument";
import "../../sales/sales-list-v2.css";
import "../journal-ledger.css";

export const JOURNAL_PAGE_SIZE = 50;

/** Source chips of the journal ledger; "other" collects every type not listed. They filter the loaded page only. */
const sourceChipTypes: Record<string, string[]> = {
  manual: ["Manual"],
  sales: ["SalesInvoice"],
  collection: ["CustomerCollection"],
  payment: ["SupplierPayment"],
  return: ["SalesReturn", "SupplierReturn"],
  instrument: ["PaymentInstrumentEvent"],
};
const sourceChipLabels: [string, string][] = [
  ["manual", "Manuel"],
  ["sales", "Satış faturası"],
  ["collection", "Tahsilat"],
  ["payment", "Ödeme"],
  ["return", "İade"],
  ["instrument", "Çek/senet"],
  ["other", "Diğer"],
];
const listedTypes = new Set(Object.values(sourceChipTypes).flat());
const matchesChip = (entry: JournalEntrySummary, chip: string) =>
  !chip ||
  (chip === "other"
    ? !listedTypes.has(entry.sourceType)
    : (sourceChipTypes[chip] || []).includes(entry.sourceType));

const FIELDS: BuiltInScreenLayoutField[] = [
  { key: "code", label: "Fiş", width: 140 },
  { key: "entryDate", label: "Tarih", width: 90 },
  { key: "sourceType", label: "Kaynak", width: 175 },
  { key: "description", label: "Açıklama", width: 250 },
  { key: "accountingBasis", label: "Standart", width: 78 },
  { key: "totalDebit", label: "Borç", width: 115 },
  { key: "totalCredit", label: "Alacak", width: 115 },
  { key: "createdAt", label: "Kayıt zamanı", width: 100 },
].map((field, position) => ({ ...field, visible: true, position }) as BuiltInScreenLayoutField);
const NUMBER_FIELDS = new Set(["totalDebit", "totalCredit"]);
const CODE_FIELDS = new Set(["code"]);

type Props = {
  token: string;
  role: string;
  entries: JournalEntrySummary[];
  entryTotal: number;
  loading: boolean;
  entryPage: number;
  setEntryPage: (page: number) => void;
  entryFrom: string;
  entryTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  /** Server-side accounting basis filter ("" = all). */
  basis: string;
  onBasisChange: (basis: string) => void;
  sourceChip: string;
  setSourceChip: (value: string) => void;
  busy: boolean;
  onReverse: (entry: JournalEntryView) => Promise<void>;
  onRefresh: () => void;
  /** Sources waiting for transfer (all of them; TenantAdmin only), null when not shown. */
  pendingSources: number | null;
  baseCurrency: string;
  onNavigate?: (page: string) => void;
};

/**
 * Yevmiye Defterleri (mockup 09, list type A): page-scoped summary, server date / basis filters, page-scoped source
 * chips, checkbox list, detail panel and footer. A single click makes a row current (panel), a double click / Enter /
 * Aç / the number opens the read-only entry document. Ters kayıt oluştur is in İşlemler with today's condition.
 */
export function JournalLedgerView({
  token,
  role,
  entries,
  entryTotal,
  loading,
  entryPage,
  setEntryPage,
  entryFrom,
  entryTo,
  onDateRangeChange,
  basis,
  onBasisChange,
  sourceChip,
  setSourceChip,
  busy,
  onReverse,
  onRefresh,
  pendingSources,
  baseCurrency,
  onNavigate,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, { data: JournalEntryView | null; error: string }>>({});
  const gridExportRef = useRef<GridExportActions | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listActive = !docId;
  const panel = useStockDetailPanelOpen(listActive, rootRef);

  const visibleEntries = entries.filter((entry) => matchesChip(entry, sourceChip));
  const current = visibleEntries.find((entry) => entry.id === currentId) ?? null;
  // Reversals on the same page tell which entries already have one ("Ters kaydı var", bu sayfa).
  const reversalBySource = new Map(
    entries.filter((entry) => entry.sourceType === "ManualReversal").map((entry) => [entry.sourceId, entry]),
  );
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  // Detail of the current row and of the open entry. The İşlemler condition (isReversed) needs it even while the
  // panel is closed, so it loads independently of the panel, a moment after the row settles; reloads refetch it.
  const wanted = [current?.id, docId].filter((id): id is string => Boolean(id));
  const wantedKey = wanted.join(",");
  useEffect(() => {
    if (!wanted.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      for (const id of wanted)
        api<JournalEntryView>(`/api/finance/general-ledger/entries/${id}`, token, { signal: controller.signal })
          .then((data) => {
            if (!controller.signal.aborted) setDetails((all) => ({ ...all, [id]: { data, error: "" } }));
          })
          .catch((e) => {
            if (!controller.signal.aborted) setDetails((all) => ({ ...all, [id]: { data: null, error: (e as Error).message } }));
          });
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // entries: the detail is read again after each reload (e.g. after a reversal).
  }, [token, wantedKey, entries]);
  useEffect(() => setDetails({}), [entries]);

  const currentDetail = current ? details[current.id]?.data ?? null : null;
  const doc = docId ? details[docId] ?? null : null;
  const docSummary = docId ? entryById.get(docId) ?? null : null;
  const docSource = doc?.data ?? docSummary;

  function openEntry(id: string) {
    setCurrentId(id);
    setDocId(id);
  }
  const reverseCommand = (entry: JournalEntryView | null): MenuCommand => {
    const reason = reversalBlockReason(role, entry, busy);
    return {
      id: "journal-reverse",
      label: "Ters kayıt oluştur",
      disabledReason: reason ?? undefined,
      run: () => (entry && !reason ? onReverse(entry) : undefined),
    };
  };
  const transferCommand: MenuCommand = {
    id: "journal-transfer-sources",
    label: "Aktarılabilir kaynaklar",
    disabledReason: onNavigate ? undefined : "Bu ekranda kullanılamaz",
    run: () => onNavigate?.("finance-transfer-sources"),
  };
  const newVoucher = { disabledReason: onNavigate ? undefined : "Bu ekranda kullanılamaz", run: () => onNavigate?.("finance-journal-vouchers") };
  const notDeletable = "Kaydedilmiş fiş silinemez — İşlemler › Ters kayıt oluştur";
  const commands: PageCommands = docId
    ? {
        ...documentOpenCommands(onRefresh),
        new: newVoucher,
        save: { disabledReason: "Kaydedilmiş fiş değiştirilemez" },
        delete: { disabledReason: notDeletable },
        more: [reverseCommand(doc?.data ?? null), transferCommand],
      }
    : {
        new: { ...newVoucher, primary: true },
        open: {
          disabledReason: current ? undefined : "Önce bir kayıt seçin",
          run: () => {
            const id = focusedRecordId() ?? current?.id;
            if (id) openEntry(id);
          },
        },
        delete: { disabledReason: current ? notDeletable : "Önce bir kayıt seçin" },
        more: [
          current ? reverseCommand(currentDetail) : { id: "journal-reverse", label: "Ters kayıt oluştur", disabledReason: "Önce bir kayıt seçin" },
          transferCommand,
          csvExportCommand(gridExportRef),
        ],
      };

  const chipOptions = [
    { value: "", label: "Tümü", count: entries.length },
    ...sourceChipLabels.map(([value, label]) => ({
      value,
      label,
      count: entries.filter((entry) => matchesChip(entry, value)).length,
    })),
  ];
  const money = (value: number) => `${formatAmount(value)}${baseCurrency ? ` ${baseCurrency}` : ""}`;
  const pageDebit = entries.reduce((sum, entry) => sum + entry.totalDebit, 0);
  const shownDebit = visibleEntries.reduce((sum, entry) => sum + entry.totalDebit, 0);
  const shownCredit = visibleEntries.reduce((sum, entry) => sum + entry.totalCredit, 0);
  const reversalsOnPage = entries.filter((entry) => entry.sourceType === "ManualReversal").length;
  const filtered = Boolean(entryFrom || entryTo || basis);

  const renderCell = (field: BuiltInScreenLayoutField, entry: JournalEntrySummary) => {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code gljl-code"
            title={entry.code}
            aria-label={`${entry.code} fişini aç`}
            onClick={(event) => {
              event.stopPropagation();
              openEntry(entry.id);
            }}
          >
            {entry.code}
          </button>
        );
      case "entryDate":
        return displayDate(entry.entryDate);
      case "sourceType":
        return (
          <span className="gljl-source">
            <StatusTag tone={journalSourceTone(entry.sourceType)}>{journalSourceTypeLabel(entry.sourceType)}</StatusTag>
            {reversalBySource.has(entry.id) && <StatusTag tone="warn">Ters kaydı var</StatusTag>}
          </span>
        );
      case "description":
        return <span title={entry.description}>{entry.description || "—"}</span>;
      case "accountingBasis":
        return entry.accountingBasis || "—";
      case "totalDebit":
        return formatAmount(entry.totalDebit);
      case "totalCredit":
        return formatAmount(entry.totalCredit);
      case "createdAt": {
        const created = entryCreatedLabel(entry.createdAt);
        return <span className="gljl-muted" title={created.full}>{created.short}</span>;
      }
      default:
        return null;
    }
  };

  const listPanel =
    panel.open && listActive ? (
      current ? (
        <JournalEntryListPanel
          entry={current}
          detail={currentDetail}
          error={details[current.id]?.error ?? ""}
          reversal={reversalBySource.get(current.id) ?? null}
          reversedCode={current.sourceType === "ManualReversal" ? entryById.get(current.sourceId)?.code ?? current.sourceId : null}
          baseCurrency={baseCurrency}
          onOpen={() => openEntry(current.id)}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        />
      ) : (
        <JournalEntryListPanelEmpty />
      )
    ) : null;

  return (
    <>
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Yevmiye Defterleri"
        description="Kaydedilmiş yevmiye fişlerini tarih aralığına ve standarda göre inceleyin."
        count={loading && entryTotal === 0 ? null : entryTotal}
        countLabel="fiş"
      />
      <ListSummaryCards
        cards={[
          {
            id: "count",
            label: "Fiş sayısı",
            value: loading ? "—" : entryTotal.toLocaleString("tr-TR"),
            icon: BookOpen,
            hint: filtered ? <span>seçili filtre</span> : <span>tümü</span>,
          },
          {
            id: "amount",
            label: "Borç = alacak toplamı",
            value: loading || entries.length === 0 ? "—" : money(pageDebit),
            icon: CircleDollarSign,
            hint: (
              <>
                <span>bu sayfa</span> · <span>{entries.length}</span> <span>fiş</span>
              </>
            ),
          },
          ...(pendingSources !== null
            ? [
                {
                  id: "pending",
                  label: "Aktarılmayı bekleyen kaynak",
                  value: pendingSources.toLocaleString("tr-TR"),
                  icon: Shuffle,
                  tone: pendingSources > 0 ? ("warn" as const) : ("primary" as const),
                  hint: <span>tümü · İşlemler › Aktarılabilir kaynaklar</span>,
                },
              ]
            : []),
          {
            id: "reversals",
            label: "Ters kayıt",
            value: loading ? "—" : reversalsOnPage.toLocaleString("tr-TR"),
            icon: RotateCcw,
            hint: <span>bu sayfa</span>,
          },
        ]}
      />
      <ListToolbar toolsSlotRef={setToolsSlot} onRefresh={onRefresh}>
        <label className="list-v2-filter">
          <span>Başlangıç</span>
          <input
            type="date"
            aria-label="Başlangıç"
            value={entryFrom}
            max={entryTo || undefined}
            onChange={(e) => onDateRangeChange(e.target.value, entryTo)}
          />
        </label>
        <label className="list-v2-filter">
          <span>Bitiş</span>
          <input
            type="date"
            aria-label="Bitiş"
            value={entryTo}
            min={entryFrom || undefined}
            onChange={(e) => onDateRangeChange(entryFrom, e.target.value)}
          />
        </label>
        <label className="list-v2-filter">
          <span>Standart</span>
          <select aria-label="Standart" value={basis} onChange={(e) => onBasisChange(e.target.value)}>
            <option value="">Tümü</option>
            <option value="TDHP">TDHP</option>
            <option value="IFRS">IFRS</option>
          </select>
        </label>
        <div className="gljl-source-filter">
          {/* No server-side source filter: the chips narrow the loaded page only, and say so. */}
          <span className="gljl-source-filter-label" aria-hidden="true">
            Kaynak (bu sayfa):
          </span>
          <ListChipGroup label="Kaynak (bu sayfa)" value={sourceChip} onChange={setSourceChip} options={chipOptions} hideEmpty />
        </div>
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      <div ref={rootRef} className={`sales-list-body gljl-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list gljl-list">
          <SalesDocumentGrid
            gridId="studio-finance-finance-journals-v3"
            hideExport
            exportActionsRef={gridExportRef}
            fields={FIELDS}
            items={visibleEntries}
            loading={loading && entries.length === 0}
            loadingMessage="Fişler yükleniyor…"
            emptyMessage={entries.length ? "Filtreyle eşleşen fiş yok." : "Henüz yevmiye kaydı yok."}
            search=""
            searchEmptyMessage=""
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel="Yevmiye defteri kayıtları"
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              bulkActions: listActive
                ? [{ id: "export-selected", label: "Excel (seçilenler)", run: () => void gridExportRef.current?.exportExcel() }]
                : undefined,
              onOpen: openEntry,
            }}
            footer={
              <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli">
                {ticked.length > 0 && (
                  <span>
                    <span>{ticked.length}</span> <span>seçili</span>
                  </span>
                )}
                {visibleEntries.length > 0 && (
                  <span className="gljl-foot-totals">
                    <span>{sourceChip ? "Gösterilen fişler" : "Bu sayfa toplamı"}</span>{" "}
                    <span>Borç</span> <b>{formatAmount(shownDebit)}</b> · <span>Alacak</span> <b>{formatAmount(shownCredit)}</b>
                  </span>
                )}
                <span>
                  <span>Gösterilen</span>{" "}
                  <span>
                    {visibleEntries.length.toLocaleString("tr-TR")} / {entryTotal.toLocaleString("tr-TR")}
                  </span>
                </span>
                <ListPagination
                  page={entryPage}
                  total={entryTotal}
                  pageSize={JOURNAL_PAGE_SIZE}
                  loading={loading}
                  onPageChange={setEntryPage}
                />
              </ListFooter>
            }
            numberFields={NUMBER_FIELDS}
            codeFields={CODE_FIELDS}
          />
        </section>
        {listPanel}
      </div>
      {docId && (
        <JournalEntryDocument
          summary={docSummary}
          detail={doc?.data ?? null}
          error={doc?.error ?? ""}
          reversal={reversalBySource.get(docId) ?? null}
          reversedEntry={docSource?.sourceType === "ManualReversal" ? { id: docSource.sourceId, code: entryById.get(docSource.sourceId)?.code ?? null } : null}
          baseCurrency={baseCurrency}
          onOpenEntry={(id) => openEntry(id)}
          onClose={() => setDocId(null)}
        />
      )}
    </>
  );
}
