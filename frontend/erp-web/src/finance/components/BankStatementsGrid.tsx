import { useState } from "react";
import type { BankStatement } from "../../erp-types";
import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

type Props = {
  token: string;
  statements: BankStatement[];
  loading: boolean;
  onOpen: (statement: BankStatement) => void;
  onRefresh?: () => void;
};

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });

export function BankStatementsGrid({
  token,
  statements,
  loading,
  onOpen,
  onRefresh,
}: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const searchedStatements = statements.filter((statement) =>
    !normalizedQuery || [
      statement.code,
      statement.accountName,
      statement.currencyCode,
      statement.startDate,
      statement.endDate,
    ].some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedQuery)),
  );
  const filteredStatements = searchedStatements.filter(
    (statement) => !status || statement.status === status,
  );
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <ListToolbar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Ekstre, hesap veya döviz ara"
        toolsSlotRef={setToolsSlot}
        onRefresh={onRefresh}
      >
        <ListChipGroup
          label="Durum"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Tüm durumlar", count: searchedStatements.length },
            { value: "Reconciled", label: "Mutabık", count: searchedStatements.filter((statement) => statement.status === "Reconciled").length },
            { value: "Imported", label: "Bekliyor", count: searchedStatements.filter((statement) => statement.status === "Imported").length },
          ]}
        />
      </ListToolbar>
      <section className="panel bank-statements-list-panel list-v2-list">
      <div className="ledger-list">
        <FinanceStudioGrid
          token={token}
          screenKey="finance-statements"
          defaults={financeGridDefaults["finance-statements"]}
          hideSearch
          toolbarContainer={toolsSlot}
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
