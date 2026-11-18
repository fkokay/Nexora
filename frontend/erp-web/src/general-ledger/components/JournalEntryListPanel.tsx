import { useState } from "react";
import type { JournalEntrySummary, JournalEntryView } from "../../erp-types";
import { StatusTag } from "../../list-page/StatusTag";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesPanelFacts,
  SalesPanelRows,
  SalesPanelSection,
  SalesPanelStats,
} from "../../sales/components/SalesListDetailPanel";
import { journalSourceTone, journalSourceTypeLabel } from "../sourceTypeLabels";
import { displayDate, formatAmount } from "../ledgerReportUtils";
import { entryCreatedLabel, entrySourceText, isBalanced } from "../journalEntries";

const TABS = [
  { id: "lines", label: "Satırlar" },
  { id: "info", label: "Bilgi" },
];

type Props = {
  entry: JournalEntrySummary;
  detail: JournalEntryView | null;
  error: string;
  /** The reversal of this entry when it is on the loaded page. */
  reversal: JournalEntrySummary | null;
  /** For a reversal entry: the reversed entry's code (or id when it is not on the page). */
  reversedCode: string | null;
  baseCurrency: string;
  onOpen: () => void;
  onClose: () => void;
  takeFocus: () => boolean;
};

/** Right-hand panel of Yevmiye Defterleri (mockup 09 ".det"): Satırlar (amounts + lines) and Bilgi. */
export function JournalEntryListPanel({ entry, detail, error, reversal, reversedCode, baseCurrency, onOpen, onClose, takeFocus }: Props) {
  const [tab, setTab] = useState("lines");
  const money = (value: number) => `${formatAmount(value)}${baseCurrency ? ` ${baseCurrency}` : ""}`;
  const isReversed = detail ? detail.isReversed : reversal !== null;
  const lines = Array.isArray(detail?.lines) ? detail.lines : [];
  return (
    <SalesListDetailPanel
      label="Yevmiye fişi özeti"
      code={entry.code}
      title={entry.description}
      tags={
        <>
          <StatusTag tone={journalSourceTone(entry.sourceType)}>{journalSourceTypeLabel(entry.sourceType)}</StatusTag>
          {entry.accountingBasis && <StatusTag tone="off">{entry.accountingBasis}</StatusTag>}
          {isBalanced(entry) && <StatusTag tone="ok">Dengeli</StatusTag>}
          {isReversed && <StatusTag tone="warn">Ters kaydı var</StatusTag>}
        </>
      }
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      onOpen={onOpen}
      onClose={onClose}
      takeFocus={takeFocus}
      loading={!detail}
      error={error}
    >
      {detail &&
        (tab === "lines" ? (
          <>
            <SalesPanelStats
              items={[
                { label: "Borç", value: money(detail.totalDebit) },
                { label: "Alacak", value: money(detail.totalCredit) },
                { label: "Fiş tarihi", value: displayDate(detail.entryDate) },
                { label: "Satır", value: lines.length },
              ]}
            />
            <SalesPanelSection title="Yevmiye satırları">
              <SalesPanelRows
                empty="Satır yok."
                rows={lines.map((line) => ({
                  key: String(line.lineNumber),
                  label: (
                    <>
                      <span className="nx-code">{line.accountCode}</span> <span>{line.accountName}</span>
                    </>
                  ),
                  meta: line.description || undefined,
                  value: line.debit ? (
                    <>
                      <span>Borç</span> <span>{formatAmount(line.debit)}</span>
                    </>
                  ) : (
                    <>
                      <span>Alacak</span> <span>{formatAmount(line.credit)}</span>
                    </>
                  ),
                }))}
              />
            </SalesPanelSection>
          </>
        ) : (
          <>
            <SalesPanelFacts
              items={[
                ...(detail.description ? [{ label: "Açıklama", value: detail.description }] : []),
                { label: "Kaynak belge", value: entrySourceText(detail, reversedCode) },
                { label: "Standart", value: detail.accountingBasis || "—" },
                { label: "Kayıt zamanı", value: entryCreatedLabel(detail.createdAt).full },
                ...(detail.isReversed ? [{ label: "Durum", value: "Ters kaydı var" }] : []),
              ]}
            />
            {detail.sourceType !== "Manual" && detail.sourceType !== "ManualReversal" && (
              <p className="sales-ld-muted">Ters kayıt yalnız manuel fişlerde; kaynaklı fişler kaynak belgeden iptal edilir.</p>
            )}
          </>
        ))}
    </SalesListDetailPanel>
  );
}

export function JournalEntryListPanelEmpty() {
  return <SalesListDetailEmpty label="Yevmiye fişi özeti" text="Özetini görmek için listeden bir fiş seçin." />;
}
