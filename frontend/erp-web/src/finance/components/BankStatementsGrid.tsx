import { useState } from "react";
import type { BankStatement } from "../../erp-types";
import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";

type Props = {
  token: string;
  statements: BankStatement[];
  loading: boolean;
  onOpen: (statement: BankStatement) => void;
};

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });

export function BankStatementsGrid({
  token,
  statements,
  loading,
  onOpen,
}: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredStatements = statements.filter((statement) => {
    const matchesQuery = !normalizedQuery || [
      statement.code,
      statement.accountName,
      statement.currencyCode,
      statement.startDate,
      statement.endDate,
    ].some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
    const matchesStatus = !status || statement.status === status;
    return matchesQuery && matchesStatus;
  });
  const matchedLines = statements.reduce((sum, statement) => sum + statement.matchedLineCount, 0);
  const totalLines = statements.reduce((sum, statement) => sum + statement.lineCount, 0);
  return (
    <>
      <section className="bank-statements-summary" aria-label="Banka ekstreleri özeti">
        <article><span>Toplam ekstre</span><b>{statements.length}</b></article>
        <article><span>Mutabık ekstre</span><b>{statements.filter((statement) => statement.status === "Reconciled").length}</b></article>
        <article><span>Eşleşen hareket</span><b>{matchedLines} / {totalLines}</b></article>
      </section>
      <section className="bank-statements-filter-card" aria-label="Banka ekstresi filtreleri">
        <div>
          <h2>Filtreler</h2>
          <p>Ekstre kodu, hesap, döviz veya mutabakat durumuna göre daraltın.</p>
        </div>
        <label>
          Ara
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ekstre, hesap veya döviz ara"
          />
        </label>
        <label>
          Durum
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tüm durumlar</option>
            <option value="Reconciled">Mutabık</option>
            <option value="Imported">Bekliyor</option>
          </select>
        </label>
      </section>
      <section className="panel bank-statements-list-panel">
        <div className="list-toolbar">
          <div>
            <h2>Banka ekstreleri</h2>
            <p>{filteredStatements.length} / {statements.length} aktarım</p>
          </div>
        </div>
      <div className="ledger-list">
        <FinanceStudioGrid
          token={token}
          screenKey="finance-statements"
          defaults={financeGridDefaults["finance-statements"]}
          hideSearch
        >
          <table className="customer-table">
            <thead>
              <tr>
                <th>Ekstre</th>
                <th>Hesap</th>
                <th>Dönem</th>
                <th>Açılış</th>
                <th>Kapanış</th>
                <th>Eşleşme</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredStatements.map((statement) => (
                <tr key={statement.id}>
                  <td>
                    <span className="customer-code">{statement.code}</span>
                  </td>
                  <td>
                    {statement.accountName} · {statement.currencyCode}
                  </td>
                  <td>
                    {statement.startDate} — {statement.endDate}
                  </td>
                  <td>{amount(statement.openingBalance)}</td>
                  <td>{amount(statement.closingBalance)}</td>
                  <td>
                    {statement.matchedLineCount}/{statement.lineCount}
                  </td>
                  <td>
                    <span
                      className={`quote-status ${statement.status === "Reconciled" ? "accepted" : "rejected"}`}
                    >
                      {statement.status === "Reconciled"
                        ? "Mutabık"
                        : "Bekliyor"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="row-action"
                      onClick={() => onOpen(statement)}
                    >
                      Aç
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredStatements.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    {statements.length
                      ? "Filtreye uygun banka ekstresi bulunamadı."
                      : "Henüz banka ekstresi aktarılmadı."}
                  </td>
                </tr>
              )}
              {loading && filteredStatements.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty" role="status">
                    Ekstreler yükleniyor…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FinanceStudioGrid>
      </div>
      </section>
    </>
  );
}
