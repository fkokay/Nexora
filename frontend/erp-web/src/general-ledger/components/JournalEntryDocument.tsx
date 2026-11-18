import type { JournalEntrySummary, JournalEntryView } from "../../erp-types";
import { DocumentSurface, type DocumentStatus } from "../../document-page/DocumentSurface";
import {
  DetailChain,
  DetailContext,
  DetailInfoGrid,
  DetailLinesFooter,
  DetailLinesHead,
  type DetailChainItem,
} from "../../document-detail/DocumentDetailLayout";
import { journalSourceTypeLabel } from "../sourceTypeLabels";
import { displayDate, formatAmount } from "../ledgerReportUtils";
import { entryCreatedLabel, entrySourceText, isBalanced } from "../journalEntries";

const sourceStatus = (sourceType: string): DocumentStatus => ({
  label: journalSourceTypeLabel(sourceType),
  tone: sourceType === "Manual" ? "info" : sourceType === "ManualReversal" ? "warning" : "neutral",
});

type Props = {
  /** The list row (null when the entry is not on the loaded page, e.g. a reversed entry opened from the chain). */
  summary: JournalEntrySummary | null;
  detail: JournalEntryView | null;
  error: string;
  /** The reversal of this entry when it is on the loaded page. */
  reversal: JournalEntrySummary | null;
  /** For a reversal entry: the reversed entry (code when it is on the page). */
  reversedEntry: { id: string; code: string | null } | null;
  baseCurrency: string;
  onOpenEntry: (id: string) => void;
  onClose: () => void;
};

/**
 * Yevmiye fişi, read-only (mockup 02 / 09): entries have no status, so there is no status flow. Header fields,
 * the line grid (account, description, debit, credit) and the debit = credit totals; Kaydet / Sil stay disabled and
 * Ters kayıt oluştur is in İşlemler.
 */
export function JournalEntryDocument({ summary, detail, error, reversal, reversedEntry, baseCurrency, onOpenEntry, onClose }: Props) {
  const head = detail ?? summary;
  const lines = Array.isArray(detail?.lines) ? detail.lines : [];
  const money = (value: number) => `${formatAmount(value)}${baseCurrency ? ` ${baseCurrency}` : ""}`;
  const isReversed = detail ? detail.isReversed : reversal !== null;
  const chain: DetailChainItem[] = [];
  if (head && reversedEntry)
    chain.push({ key: "reversed", code: reversedEntry.code, label: "Ters çevrilen fiş", kind: "Yevmiye fişi", onOpen: () => onOpenEntry(reversedEntry.id) });
  if (head) chain.push({ key: "self", code: head.code, label: "Bu fiş", kind: "Yevmiye fişi", current: true });
  if (reversal) chain.push({ key: "reversal", code: reversal.code, label: "Ters kaydı", kind: "Ters kayıt", onOpen: () => onOpenEntry(reversal.id) });
  else if (isReversed) chain.push({ key: "reversal", label: "Ters kaydı", kind: "Ters kayıt" });
  const balanced = detail ? isBalanced(detail) : true;
  return (
    <DocumentSurface
      variant="detail"
      title="Yevmiye fişi"
      code={head?.code}
      subtitle={head?.description}
      status={head ? sourceStatus(head.sourceType) : undefined}
      meta={
        head && (
          <>
            <span>{displayDate(head.entryDate)}</span>
            {head.accountingBasis && (
              <>
                {" · "}
                <span>{head.accountingBasis}</span>
              </>
            )}
            {isReversed && (
              <>
                {" · "}
                <span>Ters kaydı var</span>
              </>
            )}
          </>
        )
      }
      onClose={onClose}
      aside={
        chain.length > 1 ? (
          <DetailContext title="Fiş zinciri">
            <DetailChain items={chain} label="Fiş zinciri" />
          </DetailContext>
        ) : undefined
      }
      hints={["Alt+İ işlemler"]}
      footerStatus={
        detail ? (
          <span>
            <span>{`${lines.length} satır`}</span> · <span>Borç</span> <b>{formatAmount(detail.totalDebit)}</b> · <span>Alacak</span>{" "}
            <b>{formatAmount(detail.totalCredit)}</b>
          </span>
        ) : undefined
      }
    >
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
        </div>
      )}
      {head && (
        <div className="dd-box">
          <DetailInfoGrid
            label="Fiş üst bilgileri"
            items={[
              { label: "Fiş tarihi", value: displayDate(head.entryDate) },
              { label: "Kaynak belge", value: entrySourceText(head, reversedEntry?.code ?? reversedEntry?.id ?? null) },
              { label: "Muhasebe standardı", value: head.accountingBasis || "—" },
              { label: "Kayıt zamanı", value: entryCreatedLabel(head.createdAt).full },
            ]}
          />
        </div>
      )}
      <div className="dd-box">
        <DetailLinesHead title="Satırlar" meta={detail ? <span>{`${lines.length} satır`}</span> : undefined} />
        <div className="dd-lines-wrap">
          <table className="dd-lines" aria-label="Yevmiye satırları">
            <thead>
              <tr>
                <th className="dd-ix">#</th>
                <th>Hesap</th>
                <th>Satır açıklaması</th>
                <th className="dd-num">Borç</th>
                <th className="dd-num">Alacak</th>
              </tr>
            </thead>
            <tbody>
              {!detail && !error && (
                <tr>
                  <td colSpan={5} className="dd-empty">Fiş yükleniyor…</td>
                </tr>
              )}
              {detail && lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="dd-empty">Satır yok.</td>
                </tr>
              )}
              {lines.map((line, index) => (
                <tr key={line.lineNumber}>
                  <td className="dd-ix">{index + 1}</td>
                  <td className="dd-stock">
                    <b>{line.accountCode}</b>
                    <small>{line.accountName}</small>
                  </td>
                  <td>{line.description || "—"}</td>
                  <td className="dd-num">{line.debit ? formatAmount(line.debit) : ""}</td>
                  <td className="dd-num">{line.credit ? formatAmount(line.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detail && (
          <DetailLinesFooter
            label="Fiş toplamları"
            aside={<p className="dd-muted">Kaydedilen fiş değiştirilemez; düzeltme ters kayıtla yapılır.</p>}
            totals={[
              { key: "debit", label: "Toplam borç", value: money(detail.totalDebit) },
              { key: "credit", label: "Toplam alacak", value: money(detail.totalCredit) },
              balanced
                ? { key: "balance", label: "Borç = Alacak", value: "Dengeli", emphasis: "grand" }
                : { key: "balance", label: "Fark", value: money(detail.totalDebit - detail.totalCredit), emphasis: "grand" },
            ]}
          />
        )}
      </div>
    </DocumentSurface>
  );
}
