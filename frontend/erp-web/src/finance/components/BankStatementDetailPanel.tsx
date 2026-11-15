import { useState } from "react";
import { X } from "lucide-react";
import type {
  BankStatementDetail,
  BankStatementLine,
  UnmatchedBookMovement,
} from "../../erp-types";
import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import { DetailTabs, formatDate } from "../../document-detail/DocumentDetailLayout";
import { BankStatementStatus } from "./BankStatementList";

type Props = {
  token: string;
  statement: BankStatementDetail;
  unmatchedBook: UnmatchedBookMovement[];
  lineMatches: Record<string, string>;
  busy: boolean;
  /** The page error is shown inside the selected statement, right under its header. */
  error?: string;
  onDismissError?: () => void;
  /** Optional; the page normally shows its notice once above the layout. */
  notice?: string;
  onAutoMatch: () => void;
  onReconcile: () => void;
  onMatchLine: (line: BankStatementLine) => void;
  onPostLine: (line: BankStatementLine) => void;
  onLineMatchChange: (lineId: string, transactionId: string) => void;
};

type StatementTab = "lines" | "unmatched";

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });

/** Selected bank statement, shown inline next to the statement list (master–detail). */
export function BankStatementDetailPanel({
  token,
  statement,
  unmatchedBook,
  lineMatches,
  busy,
  error = "",
  onDismissError,
  notice = "",
  onAutoMatch,
  onReconcile,
  onMatchLine,
  onPostLine,
  onLineMatchChange,
}: Props) {
  const [tab, setTab] = useState<StatementTab>("lines");
  const matchedCount = statement.lines.filter(
    (line) => line.financialAccountTransactionId,
  ).length;
  const hasOpenLines = matchedCount < statement.lines.length;
  const open = statement.status === "Imported";
  const headingId = `bank-statement-${statement.id}`;
  return (
    <section className="cf-detail bst-detail" aria-labelledby={headingId}>
      <header className="cf-detail-head">
        <div className="cf-detail-title">
          <h2 id={headingId}>{statement.code}</h2>
          <BankStatementStatus status={statement.status} />
        </div>
        <p className="cf-detail-sub">
          {statement.accountName} · {formatDate(statement.startDate)} – {formatDate(statement.endDate)}
        </p>
        <p className="cf-detail-sub bst-balance">
          <span>Açılış → kapanış</span>{" "}
          <b>
            {amount(statement.openingBalance)} → {amount(statement.closingBalance)}{" "}
            {statement.currencyCode}
          </b>
          <span>{` · ${matchedCount}/${statement.lines.length} satır eşleşti`}</span>
        </p>
        {open && (
          <div className="cf-detail-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onAutoMatch}
            >
              Otomatik eşleştir
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || hasOpenLines}
              title={
                hasOpenLines
                  ? "Mutabakat için tüm ekstre satırları eşleşmiş olmalıdır."
                  : undefined
              }
              onClick={onReconcile}
            >
              {busy ? "Kontrol ediliyor…" : "Mutabakatı tamamla"}
            </button>
          </div>
        )}
      </header>
      {error && (
        <div className="bst-error" role="alert">
          <span>{error}</span>
          {onDismissError && (
            <button
              type="button"
              className="bst-dismiss"
              onClick={onDismissError}
              aria-label="Hatayı kapat"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {notice && !error && (
        <div className="bst-notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <DetailTabs<StatementTab>
        label="Ekstre ayrıntıları"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "lines", label: "Ekstre satırları", count: statement.lines.length },
          { key: "unmatched", label: "Eşleşmeyen defter hareketleri", count: unmatchedBook.length },
        ]}
      />
      <div className="cf-tabbody" role="tabpanel">
        {tab === "lines" && (
          <>
            <p className="bst-hint">
              {open
                ? "Önce benzersiz eşleşmeleri bulun, sonra kalanları defter hareketiyle eşleştirin ya da deftere ekleyin. Mutabakat, iki bakiyeyi ve tüm dönem hareketlerini doğrular."
                : "Mutabakatı tamamlanan ekstrenin satırları değiştirilemez."}
            </p>
            <div className="ledger-list bst-grid">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-statement-lines"
                defaults={financeGridDefaults["finance-statement-lines"]}
              >
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Satır</th>
                      <th>Tarih</th>
                      <th>Yön</th>
                      <th>Açıklama</th>
                      <th>Dış işlem no</th>
                      <th>Referans</th>
                      <th>Tutar</th>
                      <th>Eşleştirme</th>
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.lines.map((line) => {
                      const candidates = unmatchedBook.filter(
                        (movement) =>
                          movement.transactionDate === line.transactionDate &&
                          movement.direction === line.direction &&
                          movement.amount === line.amount,
                      );
                      return (
                        <tr key={line.id}>
                          <td>{line.lineNumber}</td>
                          <td>{line.transactionDate}</td>
                          <td>{line.direction === "Inflow" ? "Giriş" : "Çıkış"}</td>
                          <td>{line.description}</td>
                          <td>{line.externalId || "—"}</td>
                          <td>{line.reference || "—"}</td>
                          <td>
                            {line.direction === "Inflow" ? "+" : "−"}
                            {amount(line.amount)}
                          </td>
                          <td>
                            {line.financialAccountTransactionId ? (
                              line.isBookEntryCreated ? (
                                "Deftere eklendi"
                              ) : (
                                "Eşleşti"
                              )
                            ) : open && candidates.length > 0 ? (
                              <select
                                aria-label={`${line.lineNumber}. satır için defter hareketi`}
                                value={lineMatches[line.id] || ""}
                                onChange={(event) =>
                                  onLineMatchChange(line.id, event.target.value)
                                }
                              >
                                <option value="">Defter hareketi seçin</option>
                                {candidates.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {formatDate(candidate.transactionDate)} ·{" "}
                                    {candidate.direction === "Inflow" ? "Giriş" : "Çıkış"}{" "}
                                    · {amount(candidate.amount)} ·{" "}
                                    {candidate.sourceType || candidate.description}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              "Bekliyor"
                            )}
                          </td>
                          <td>
                            {!line.financialAccountTransactionId &&
                              open &&
                              (candidates.length > 0 ? (
                                <button
                                  type="button"
                                  className="row-action"
                                  disabled={busy || !lineMatches[line.id]}
                                  onClick={() => onMatchLine(line)}
                                >
                                  Eşleştir
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="row-action"
                                  disabled={busy}
                                  onClick={() => onPostLine(line)}
                                >
                                  Deftere ekle
                                </button>
                              ))}
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
            <p className="bst-hint">
              Defterde olup ekstreden henüz eşleşmeyen hareketler. Eşleştirme, ekstre satırları sekmesinden yapılır.
            </p>
            <div className="ledger-list bst-grid">
              <FinanceStudioGrid
                token={token}
                screenKey="finance-statement-unmatched-book"
                defaults={financeGridDefaults["finance-statement-unmatched-book"]}
              >
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Kaynak</th>
                      <th>Açıklama</th>
                      <th>Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedBook.map((movement) => (
                      <tr key={movement.id}>
                        <td>{movement.transactionDate}</td>
                        <td>{movement.sourceType || "Finans hareketi"}</td>
                        <td>{movement.description}</td>
                        <td>
                          {movement.direction === "Inflow" ? "+" : "−"}
                          {amount(movement.amount)} {movement.currencyCode}
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
    </section>
  );
}
