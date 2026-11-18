import { useState } from "react";
import { X } from "lucide-react";
import type {
  BankStatementDetail,
  BankStatementLine,
  UnmatchedBookMovement,
} from "../../erp-types";
import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { DetailInfoGrid, DetailLinesHead, DetailTabs, DetailTiles, formatDate } from "../../document-detail/DocumentDetailLayout";
import { PageCommandsSlot, documentOpenCommands } from "../../commands/PageCommandsSlot";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { StatusTag } from "../../list-page/StatusTag";
import { statementAmount } from "./BankStatementList";
import "../finance-accounts.css";
import "../bank-statements.css";

type Props = {
  token: string;
  statement: BankStatementDetail;
  unmatchedBook: UnmatchedBookMovement[];
  lineMatches: Record<string, string>;
  busy: boolean;
  error?: string;
  onDismissError?: () => void;
  notice?: string;
  onDismissNotice?: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onImport: () => void;
  onAutoMatch: () => void;
  onReconcile: () => void;
  onMatchLine: (line: BankStatementLine) => void;
  onPostLine: (line: BankStatementLine) => void;
  onLineMatchChange: (lineId: string, transactionId: string) => void;
};

type StatementTab = "lines" | "unmatched";

/** Book movements that can be matched to a statement line (same date, direction and amount, as today). */
export const lineCandidates = (line: BankStatementLine, unmatchedBook: UnmatchedBookMovement[]) =>
  unmatchedBook.filter(
    (movement) =>
      movement.transactionDate === line.transactionDate &&
      movement.direction === line.direction &&
      movement.amount === line.amount,
  );

/**
 * Selected bank statement (opened from the Banka Ekstreleri list) on the detail surface: statement header and status,
 * balance tiles, statement facts, then the lines and the unmatched book movements. Otomatik eşleştir, Satırı eşleştir,
 * Deftere ekle and Mutabakatı tamamla are in İşlemler with today's conditions; the line commands act on the selected
 * line, whose book movement is still chosen in its row.
 */
export function BankStatementDetailPanel({
  token,
  statement,
  unmatchedBook,
  lineMatches,
  busy,
  error = "",
  onDismissError,
  notice = "",
  onDismissNotice,
  onClose,
  onRefresh,
  onImport,
  onAutoMatch,
  onReconcile,
  onMatchLine,
  onPostLine,
  onLineMatchChange,
}: Props) {
  const [tab, setTab] = useState<StatementTab>("lines");
  const [currentLineId, setCurrentLineId] = useState<string | null>(null);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const matchedCount = statement.lines.filter((line) => line.financialAccountTransactionId).length;
  const hasOpenLines = matchedCount < statement.lines.length;
  const open = statement.status === "Imported";
  const currentLine = statement.lines.find((line) => line.id === currentLineId) ?? null;
  const currentCandidates = currentLine ? lineCandidates(currentLine, unmatchedBook) : [];
  const inflow = statement.lines.filter((line) => line.direction === "Inflow").reduce((sum, line) => sum + line.amount, 0);
  const outflow = statement.lines.filter((line) => line.direction === "Outflow").reduce((sum, line) => sum + line.amount, 0);

  const busyReason = busy ? "İşlem sürüyor…" : undefined;
  const closedReason = "Mutabakatı tamamlanan ekstrenin satırları değiştirilemez.";
  const lineReason = (): string | undefined => {
    if (!open) return closedReason;
    if (!currentLine) return "Önce ekstreden bir satır seçin";
    if (currentLine.financialAccountTransactionId) return "Seçili satır zaten eşleşti";
    return undefined;
  };
  const more: MenuCommand[] = [
    {
      id: "statement-auto-match",
      label: "Otomatik eşleştir",
      disabledReason: !open ? closedReason : busyReason,
      run: onAutoMatch,
    },
    {
      id: "statement-line-match",
      label: "Satırı eşleştir",
      disabledReason:
        lineReason() ??
        (currentCandidates.length === 0
          ? "Seçili satır için uygun defter hareketi yok; deftere ekleyin"
          : !lineMatches[currentLine!.id]
            ? "Satırda bir defter hareketi seçin"
            : busyReason),
      run: () => (currentLine ? onMatchLine(currentLine) : undefined),
    },
    {
      id: "statement-line-book",
      label: "Deftere ekle",
      disabledReason:
        lineReason() ??
        (currentCandidates.length > 0 ? "Seçili satırın defterde eşleşebilecek hareketi var; eşleştirin" : busyReason),
      run: () => (currentLine ? onPostLine(currentLine) : undefined),
    },
    {
      id: "statement-reconcile",
      label: "Mutabakatı tamamla",
      disabledReason: !open
        ? "Ekstrenin mutabakatı tamamlandı"
        : hasOpenLines
          ? "Mutabakat için tüm ekstre satırları eşleşmiş olmalıdır."
          : busyReason,
      run: onReconcile,
    },
  ];
  const commands: PageCommands = {
    ...documentOpenCommands(onRefresh),
    new: { disabledReason: busyReason, run: onImport },
    save: { disabledReason: "Banka ekstresi salt okunurdur" },
    delete: { disabledReason: "Aktarılan banka ekstresi silinemez" },
    more,
  };

  return (
    <>
      <PageCommandsSlot commands={commands} />
      <DocumentSurface
        variant="detail"
        className="fin-acc-statement bst-detail"
        title="Banka ekstresi"
        eyebrow="Banka ekstresi · mutabakat"
        code={statement.code}
        subtitle={statement.accountName}
        status={open ? { label: "Bekliyor", tone: "warning" } : { label: "Mutabık", tone: "success" }}
        meta={
          <span>
            {formatDate(statement.startDate)} – {formatDate(statement.endDate)} · {statement.currencyCode}
          </span>
        }
        onClose={onClose}
        hints={["Alt+İ işlemler"]}
        footerStatus={
          <span>
            <span>{`${matchedCount}/${statement.lines.length} satır eşleşti`}</span> · <span>Kapanış</span>{" "}
            <b>{statementAmount(statement.closingBalance, statement.currencyCode)}</b>
          </span>
        }
      >
        {error && (
          <div className="alert inline-alert" role="alert">
            {error}
            {onDismissError && (
              <button type="button" aria-label="Hatayı kapat" onClick={onDismissError}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
        {notice && !error && (
          <div className="notice" role="status" aria-live="polite">
            {notice}
            {onDismissNotice && (
              <button type="button" aria-label="Kapat" onClick={onDismissNotice}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
        <DetailTiles
          label="Ekstre özeti"
          items={[
            { label: "Açılış bakiyesi", value: statementAmount(statement.openingBalance, statement.currencyCode) },
            { label: "Kapanış bakiyesi", value: statementAmount(statement.closingBalance, statement.currencyCode) },
            {
              label: "Eşleşen satır",
              value: `${matchedCount} / ${statement.lines.length}`,
              tone: hasOpenLines ? "warning" : "success",
              progress: statement.lines.length ? matchedCount / statement.lines.length : 1,
            },
            {
              label: "Eşleşmeyen defter hareketi",
              value: unmatchedBook.length.toLocaleString("tr-TR"),
              tone: unmatchedBook.length > 0 ? "warning" : "default",
            },
          ]}
        />
        <div className="dd-box">
          <DetailInfoGrid
            label="Ekstre bilgileri"
            items={[
              { label: "Banka hesabı", value: statement.accountName },
              { label: "Dönem", value: `${formatDate(statement.startDate)} – ${formatDate(statement.endDate)}` },
              { label: "Giriş / çıkış", value: `${statementAmount(inflow)} / ${statementAmount(outflow)}` },
              { label: "Aktarıldı", value: formatDate(statement.createdAt) },
            ]}
          />
        </div>
        <div className="dd-box">
          <DetailTabs<StatementTab>
            label="Ekstre ayrıntıları"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "lines", label: "Ekstre satırları", count: statement.lines.length },
              { key: "unmatched", label: "Eşleşmeyen defter hareketleri", count: unmatchedBook.length },
            ]}
          />
          {tab === "lines" && (
            <>
              <div className="fin-acc-lines-head">
              <DetailLinesHead
                title="Ekstre satırları"
                meta={
                  <span>
                    {open
                      ? "Satırı seçin: İşlemler seçili satıra uygulanır. Mutabakat iki bakiyeyi ve tüm dönem hareketlerini doğrular."
                      : "Mutabakatı tamamlanan ekstrenin satırları değiştirilemez."}
                  </span>
                }
              />
              <div className="fin-acc-tools" ref={setToolsSlot} />
              </div>
              <div className="dd-grid">
                <FinanceStudioGrid
                  token={token}
                  screenKey="finance-statement-lines"
                  defaults={financeGridDefaults["finance-statement-lines"]}
                  enableRowSelection={false}
                  hideSearch
                  externalPagination
                  toolbarContainer={toolsSlot}
                >
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th className="nx-num">Satır</th>
                        <th>Tarih</th>
                        <th>Yön</th>
                        <th>Açıklama</th>
                        <th>Dış işlem no</th>
                        <th>Referans</th>
                        <th className="nx-num">Tutar</th>
                        <th>Eşleştirme</th>
                        <th>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.lines.map((line) => {
                        const candidates = lineCandidates(line, unmatchedBook);
                        const matched = Boolean(line.financialAccountTransactionId);
                        return (
                          <tr
                            key={line.id}
                            className={line.id === currentLineId ? "is-current" : undefined}
                            aria-selected={line.id === currentLineId}
                            tabIndex={0}
                            onClick={(event) => {
                              if ((event.target as HTMLElement).closest("select,button,input")) return;
                              setCurrentLineId(line.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                              event.preventDefault();
                              setCurrentLineId(line.id);
                            }}
                          >
                            <td className="nx-num">{line.lineNumber}</td>
                            <td>{formatDate(line.transactionDate)}</td>
                            <td>{line.direction === "Inflow" ? "Giriş" : "Çıkış"}</td>
                            <td>{line.description}</td>
                            <td>{line.externalId || "—"}</td>
                            <td>{line.reference || "—"}</td>
                            <td className={`nx-num ${line.direction === "Inflow" ? "fin-acc-inflow" : "fin-acc-outflow"}`}>
                              {line.direction === "Inflow" ? "+" : "−"}
                              {statementAmount(line.amount)}
                            </td>
                            <td>
                              {!matched && open && candidates.length > 0 ? (
                                <select
                                  aria-label={`${line.lineNumber}. satır için defter hareketi`}
                                  value={lineMatches[line.id] || ""}
                                  onChange={(event) => {
                                    setCurrentLineId(line.id);
                                    onLineMatchChange(line.id, event.target.value);
                                  }}
                                >
                                  <option value="">Defter hareketi seçin</option>
                                  {candidates.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {formatDate(candidate.transactionDate)} · {candidate.direction === "Inflow" ? "Giriş" : "Çıkış"} ·{" "}
                                      {statementAmount(candidate.amount)} · {candidate.sourceType || candidate.description}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {matched ? (
                                <StatusTag tone="ok">{line.isBookEntryCreated ? "Deftere eklendi" : "Eşleşti"}</StatusTag>
                              ) : open && candidates.length > 0 ? (
                                <StatusTag tone="info">Aday var</StatusTag>
                              ) : (
                                <StatusTag tone="warn">Bekliyor</StatusTag>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {statement.lines.length === 0 && (
                        <tr>
                          <td colSpan={9} className="table-empty">
                            Bu dönemde banka hareketi yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </FinanceStudioGrid>
              </div>
            </>
          )}
          {tab === "unmatched" && (
            <>
              <div className="fin-acc-lines-head">
              <DetailLinesHead
                title="Eşleşmeyen defter hareketleri"
                meta={<span>Defterde olup ekstreden henüz eşleşmeyen hareketler. Eşleştirme, ekstre satırları sekmesinden yapılır.</span>}
              />
              <div className="fin-acc-tools" ref={setToolsSlot} />
              </div>
              <div className="dd-grid">
                <FinanceStudioGrid
                  token={token}
                  screenKey="finance-statement-unmatched-book"
                  defaults={financeGridDefaults["finance-statement-unmatched-book"]}
                  enableRowSelection={false}
                  hideSearch
                  externalPagination
                  toolbarContainer={toolsSlot}
                >
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>Kaynak</th>
                        <th>Açıklama</th>
                        <th className="nx-num">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedBook.map((movement) => (
                        <tr key={movement.id}>
                          <td>{formatDate(movement.transactionDate)}</td>
                          <td>{movement.sourceType || "Finans hareketi"}</td>
                          <td>{movement.description}</td>
                          <td className={`nx-num ${movement.direction === "Inflow" ? "fin-acc-inflow" : "fin-acc-outflow"}`}>
                            {movement.direction === "Inflow" ? "+" : "−"}
                            {statementAmount(movement.amount, movement.currencyCode)}
                          </td>
                        </tr>
                      ))}
                      {unmatchedBook.length === 0 && (
                        <tr>
                          <td colSpan={4} className="table-empty">
                            Eşleşmemiş defter hareketi yok.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </FinanceStudioGrid>
              </div>
            </>
          )}
        </div>
      </DocumentSurface>
    </>
  );
}
