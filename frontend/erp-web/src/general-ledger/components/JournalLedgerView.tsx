import { useEffect, useState } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { api } from "../../erpApi";
import type { JournalEntrySummary, JournalEntryView } from "../../erp-types";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { journalSourceTypeLabel as sourceTypeLabel } from "../sourceTypeLabels";
import { displayDate, formatAmount } from "../ledgerReportUtils";
import "../journal-ledger.css";

/** Source chips of the journal ledger; "other" collects every type not listed. */
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

/** ManualReversal is the reversal entry itself (its sourceId is the reversed entry). */
const entrySourceLabel = (type: string) => (type === "ManualReversal" ? "Ters kayıt" : sourceTypeLabel(type));

/** Long legacy codes keep the prefix and the last 8 characters: "YV-…1a2b3c4d". */
export const shortenEntryCode = (code: string) => {
  if (code.length <= 16) return code;
  const dash = code.indexOf("-");
  const prefix = dash > 0 && dash <= 4 ? code.slice(0, dash + 1) : code.slice(0, 3);
  return `${prefix}…${code.slice(-8)}`;
};

type Props = {
  token: string;
  role: string;
  entries: JournalEntrySummary[];
  entryTotal: number;
  entryPage: number;
  setEntryPage: (update: (page: number) => number) => void;
  entryFrom: string;
  entryTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  sourceChip: string;
  setSourceChip: (value: string) => void;
  busy: boolean;
  onReverse: (entry: JournalEntryView) => Promise<void>;
  onRefresh: () => void;
  toolsSlot: HTMLDivElement | null;
  setToolsSlot: (element: HTMLDivElement | null) => void;
};

export function JournalLedgerView({
  token,
  role,
  entries,
  entryTotal,
  entryPage,
  setEntryPage,
  entryFrom,
  entryTo,
  onDateRangeChange,
  sourceChip,
  setSourceChip,
  busy,
  onReverse,
  onRefresh,
  toolsSlot,
  setToolsSlot,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{
    id: string;
    data: JournalEntryView | null;
    error: string;
  } | null>(null);
  const visibleEntries = entries.filter((entry) => matchesChip(entry, sourceChip));
  // Reversals on the same page tell which entries already have one ("Ters kaydı var").
  const reversedIds = new Set(
    entries.filter((entry) => entry.sourceType === "ManualReversal").map((entry) => entry.sourceId),
  );
  const codeById = new Map(entries.map((entry) => [entry.id, entry.code]));
  const selectedEntry =
    visibleEntries.find((entry) => entry.id === selectedId) || visibleEntries[0] || null;
  const selectedEntryId = selectedEntry?.id || "";
  useEffect(() => {
    if (!selectedEntryId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    const id = selectedEntryId;
    setDetail((current) => (current?.id === id ? current : { id, data: null, error: "" }));
    // Short debounce: clicking through rows only loads the row the user stops on.
    const timer = window.setTimeout(() => {
      api<JournalEntryView>(`/api/finance/general-ledger/entries/${id}`, token, {
        signal: controller.signal,
      })
        .then((data) => {
          if (!controller.signal.aborted) setDetail({ id, data, error: "" });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setDetail({ id, data: null, error: (e as Error).message });
        });
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // entries: the detail is re-read after each reload (e.g. after a reversal).
  }, [token, selectedEntryId, entries]);

  const chipOptions = [
    { value: "", label: "Tümü", count: entries.length },
    ...sourceChipLabels.map(([value, label]) => ({
      value,
      label,
      count: entries.filter((entry) => matchesChip(entry, value)).length,
    })),
  ];
  const selected = detail?.id === selectedEntryId ? detail.data : null;
  const canReverse =
    role === "TenantAdmin" && selected != null && selected.sourceType === "Manual" && !selected.isReversed;
  const pageCount = Math.max(1, Math.ceil(entryTotal / 50));

  return (
    <section className="ledger-subpanel gljl" aria-label="Yevmiye defteri kayıtları">
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
        <ListChipGroup
          label="Kaynak türü"
          value={sourceChip}
          onChange={setSourceChip}
          options={chipOptions}
          hideEmpty
        />
      </ListToolbar>
      <div className="gljl-layout">
        <div className="ledger-list journal-entries-list list-v2-list" id="ledger-journal">
          <AdvancedDataGrid
            className="customer-table"
            gridId="studio-finance-finance-journals-v2"
            externalPagination
            enableRowSelection={false}
            toolbarContainer={toolsSlot}
            hideSearch
          >
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Fiş</th>
                  <th>Tarih</th>
                  <th>Kaynak</th>
                  <th className="gljl-amount">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((x) => {
                  const isSelected = x.id === selectedEntryId;
                  const select = () => setSelectedId(x.id);
                  return (
                    <tr
                      key={x.id}
                      className={`gljl-row${isSelected ? " is-selected" : ""}`}
                      tabIndex={0}
                      aria-current={isSelected || undefined}
                      onClick={select}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          select();
                        }
                      }}
                    >
                      <td title={x.code}>
                        {/* The visible code is drawn from data-short; export and assistive tech read the full code. */}
                        <span className="gljl-code" title={x.code} aria-label={x.code} data-short={shortenEntryCode(x.code)} />
                      </td>
                      <td>{displayDate(x.entryDate)}</td>
                      <td title={x.description}>
                        <span className="gljl-source">
                          <span className={`gljl-src-tag${x.sourceType === "Manual" ? " is-manual" : ""}`}>
                            {entrySourceLabel(x.sourceType)}
                          </span>
                          {reversedIds.has(x.id) && <span className="gljl-flag">Ters kaydı var</span>}
                          {x.accountingBasis === "IFRS" && <span className="gljl-flag">IFRS</span>}
                          <small>{x.description}</small>
                        </span>
                      </td>
                      <td className="gljl-amount">{formatAmount(x.totalDebit)}</td>
                    </tr>
                  );
                })}
                {visibleEntries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-empty">
                      {entries.length ? "Filtreyle eşleşen fiş yok." : "Henüz yevmiye kaydı yok."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdvancedDataGrid>
          <div className="modal-foot">
            <span>{`Sayfa ${entryPage} / ${pageCount}`}</span>
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
        </div>
        <aside className="gljl-side" aria-label="Seçili fiş" aria-live="polite">
          {!selectedEntry ? (
            <p className="gljl-side-empty">
              {entries.length ? "Ayrıntı için bir fiş seçin." : "Henüz yevmiye kaydı yok."}
            </p>
          ) : (
            <>
              <div className="list-v2-detail-head">
                <div>
                  <span className="list-v2-kind">{`Seçili fiş · ${entrySourceLabel(selectedEntry.sourceType)}`}</span>
                  <h2 title={selectedEntry.code}>{selectedEntry.code}</h2>
                  <span className="gljl-side-meta">{displayDate(selectedEntry.entryDate)}</span>
                </div>
              </div>
              {selected ? (
                <>
                  <table className="gljl-lines">
                    <thead>
                      <tr>
                        <th scope="col">Hesap</th>
                        <th scope="col">Borç</th>
                        <th scope="col">Alacak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((line) => (
                        <tr key={line.lineNumber} title={line.description}>
                          <td>
                            <b>{line.accountCode}</b>
                            <small>{line.accountName}</small>
                          </td>
                          <td>{line.debit ? formatAmount(line.debit) : ""}</td>
                          <td>{line.credit ? formatAmount(line.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Toplam</th>
                        <td>{formatAmount(selected.totalDebit)}</td>
                        <td>{formatAmount(selected.totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <dl className="gljl-facts">
                    {selected.description && (
                      <div>
                        <dt>Açıklama</dt>
                        <dd>{selected.description}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Kaynak belge</dt>
                      <dd>
                        {selected.sourceType === "ManualReversal"
                          ? `Ters çevrilen fiş: ${codeById.get(selected.sourceId) || selected.sourceId}`
                          : selected.sourceType === "Manual"
                            ? "Manuel fiş (kaynak belge yok)"
                            : entrySourceLabel(selected.sourceType)}
                      </dd>
                    </div>
                    {selected.isReversed && (
                      <div>
                        <dt>Durum</dt>
                        <dd>Ters kaydı var</dd>
                      </div>
                    )}
                  </dl>
                  {canReverse && (
                    <button
                      type="button"
                      className="secondary gljl-side-action"
                      disabled={busy}
                      onClick={() => void onReverse(selected)}
                    >
                      Ters kayıt oluştur
                    </button>
                  )}
                  {selected.sourceType !== "Manual" && selected.sourceType !== "ManualReversal" && (
                    <p className="gljl-side-note">
                      Ters kayıt yalnız manuel fişlerde; kaynaklı fişler kaynak belgeden iptal edilir.
                    </p>
                  )}
                </>
              ) : detail?.id === selectedEntryId && detail.error ? (
                <p className="error-banner" role="alert">
                  {detail.error}
                </p>
              ) : (
                <p className="gljl-side-empty">Fiş yükleniyor…</p>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
