import { RefreshCw, Search } from "lucide-react";
import type { BankStatement } from "../../erp-types";
import { ListChipGroup } from "../../list-page/ListToolbar";
import { formatDate } from "../../document-detail/DocumentDetailLayout";
import "../../list-page/list-page-v2.css";
import "../../document-detail/document-detail.css";
import "../../finance-hub.css";
import "../../credit-facilities.css";
import "../bank-statements.css";

export type BankStatementStatusFilter = "" | BankStatement["status"];

export const bankStatementStatusLabel = (status: BankStatement["status"]) =>
  status === "Reconciled" ? "Mutabık" : "Bekliyor";

/** Statements matching the free-text search (code, account, currency or period). */
export function searchBankStatements(statements: BankStatement[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  if (!normalized) return statements;
  return statements.filter((statement) =>
    [
      statement.code,
      statement.accountName,
      statement.currencyCode,
      statement.startDate,
      statement.endDate,
      formatDate(statement.startDate),
      formatDate(statement.endDate),
    ].some((value) => value.toLocaleLowerCase("tr-TR").includes(normalized)),
  );
}

export function filterBankStatements(
  statements: BankStatement[],
  query: string,
  status: BankStatementStatusFilter,
) {
  return searchBankStatements(statements, query).filter(
    (statement) => !status || statement.status === status,
  );
}

/** Downloads the listed statements as XLSX or CSV (same columns as the former list grid). */
export async function exportBankStatements(
  statements: BankStatement[],
  format: "xlsx" | "csv",
  today: string,
) {
  const rows: (string | number)[][] = [
    ["Ekstre", "Hesap", "Döviz", "Başlangıç", "Bitiş", "Açılış", "Kapanış", "Eşleşen satır", "Satır", "Durum"],
    ...statements.map((statement) => [
      statement.code,
      statement.accountName,
      statement.currencyCode,
      statement.startDate,
      statement.endDate,
      statement.openingBalance,
      statement.closingBalance,
      statement.matchedLineCount,
      statement.lineCount,
      bankStatementStatusLabel(statement.status),
    ]),
  ];
  const fileName = `banka-ekstreleri-${today}`;
  if (format === "csv") {
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const content = "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Banka ekstreleri");
  XLSX.writeFile(book, `${fileName}.xlsx`);
}

type Props = {
  statements: BankStatement[];
  visibleStatements: BankStatement[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  status: BankStatementStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: BankStatementStatusFilter) => void;
  onRefresh: () => void;
  onSelect: (statement: BankStatement) => void;
  onClearFilters: () => void;
  onImport: () => void;
};

/** Left column of the Banka Ekstreleri page: search, status chips and one row per statement. */
export function BankStatementList({
  statements,
  visibleStatements,
  selectedId,
  loading,
  search,
  status,
  onSearchChange,
  onStatusChange,
  onRefresh,
  onSelect,
  onClearFilters,
  onImport,
}: Props) {
  const searched = searchBankStatements(statements, search);
  const pending = searched.filter((statement) => statement.status === "Imported").length;
  const reconciled = searched.length - pending;
  return (
    <aside className="cf-list-column" aria-label="Banka ekstreleri">
      <div className="cf-filters">
        <div className="cf-search-row">
          <label className="cf-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Ekstre, hesap veya döviz"
              aria-label="Banka ekstresi ara"
            />
          </label>
          <button
            type="button"
            className="list-v2-icon-button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Banka ekstrelerini yenile"
            title="Yenile"
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <ListChipGroup
          label="Durum"
          value={status}
          allowClear
          onChange={(value) => onStatusChange(value as BankStatementStatusFilter)}
          options={[
            { value: "Imported", label: "Bekliyor", count: pending },
            { value: "Reconciled", label: "Mutabık", count: reconciled },
          ]}
        />
      </div>
      {loading && statements.length === 0 ? (
        <div className="cf-empty" role="status">
          <span>Ekstreler yükleniyor…</span>
        </div>
      ) : statements.length === 0 ? (
        <div className="cf-empty">
          <strong>Henüz banka ekstresi aktarılmadı.</strong>
          <span>Banka hesabının dönem hareketlerini CSV dosyasıyla içe aktarın.</span>
          <button type="button" className="secondary small-button" onClick={onImport}>
            Banka ekstresi içe aktar
          </button>
        </div>
      ) : visibleStatements.length === 0 ? (
        <div className="cf-empty">
          <strong>Filtreye uygun banka ekstresi bulunamadı.</strong>
          <button type="button" className="secondary small-button" onClick={onClearFilters}>
            Filtreleri temizle
          </button>
        </div>
      ) : (
        <ul className="cf-items">
          {visibleStatements.map((statement) => {
            const selected = statement.id === selectedId;
            const share = statement.lineCount
              ? statement.matchedLineCount / statement.lineCount
              : 1;
            return (
              <li key={statement.id}>
                <button
                  type="button"
                  className={`cf-item bst-item${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(statement)}
                >
                  <span className="cf-item-top">
                    <b>{statement.code}</b>
                  </span>
                  <span className="cf-item-meta">
                    {statement.accountName} · {formatDate(statement.startDate)} – {formatDate(statement.endDate)}
                  </span>
                  <span className="cf-item-usage">
                    <span>
                      {`${statement.matchedLineCount}/${statement.lineCount} eşleşti`}
                    </span>
                    <BankStatementStatus status={statement.status} />
                  </span>
                  <span
                    className={`cf-bar${statement.status === "Reconciled" ? "" : " is-warning"}`}
                    aria-hidden="true"
                  >
                    <i style={{ width: `${share * 100}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export function BankStatementStatus({ status }: { status: BankStatement["status"] }) {
  return (
    <span className={`cf-state ${status === "Reconciled" ? "is-active" : "is-warning"}`}>
      {bankStatementStatusLabel(status)}
    </span>
  );
}
