import { useRef, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import type { BankStatement, BuiltInScreenLayoutField } from "../../erp-types";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import { focusedRecordId } from "../../commands/gridCommands";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { ListSummaryCards, type SummaryCard } from "../../list-page/ListSummaryCards";
import { ListFooter } from "../../list-page/ListFooter";
import { StatusTag } from "../../list-page/StatusTag";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import {
  SalesListDetailEmpty,
  SalesListDetailPanel,
  SalesListPanelToggle,
  SalesPanelFacts,
  SalesPanelStats,
} from "../../sales/components/SalesListDetailPanel";
import { useStockDetailPanelOpen } from "../../inventory/components/InventoryStockDetailPanel";
import { formatDate } from "../../document-detail/DocumentDetailLayout";
import "../../sales/sales-list-v2.css";
import "../finance-accounts.css";
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

export const statementAmount = (value: number, currency?: string) =>
  `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;

export function BankStatementStatusTag({ status }: { status: BankStatement["status"] }) {
  return <StatusTag tone={status === "Reconciled" ? "ok" : "warn"}>{bankStatementStatusLabel(status)}</StatusTag>;
}

const FIELDS: BuiltInScreenLayoutField[] = [
  { key: "code", label: "Ekstre", visible: true, position: 0 },
  { key: "account", label: "Hesap", visible: true, position: 1 },
  { key: "currencyCode", label: "Döviz", visible: true, position: 2 },
  { key: "period", label: "Dönem", visible: true, position: 3 },
  { key: "openingBalance", label: "Açılış", visible: true, position: 4 },
  { key: "closingBalance", label: "Kapanış", visible: true, position: 5 },
  { key: "matched", label: "Eşleşen satır", visible: true, position: 6 },
  { key: "status", label: "Durum", visible: true, position: 7 },
];
const NUMBER_FIELDS = new Set(["openingBalance", "closingBalance", "matched"]);
const CODE_FIELDS = new Set(["code"]);
const WIDTHS: Record<string, number> = { code: 130, account: 220, currencyCode: 70, period: 180, openingBalance: 140, closingBalance: 140, matched: 110, status: 100 };

type Props = {
  /** The list is the visible screen (no statement or import form over it). */
  active: boolean;
  loading: boolean;
  busy: boolean;
  statements: BankStatement[];
  visibleStatements: BankStatement[];
  search: string;
  status: BankStatementStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: BankStatementStatusFilter) => void;
  onRefresh: () => void;
  onOpen: (statement: BankStatement) => void;
  onImport: () => void;
  onExport: (format: "xlsx" | "csv") => void;
};

/**
 * Banka Ekstreleri (list type A, mockup 09 map): pending / unmatched-line cards from the loaded list, search and status
 * chips, checkbox list, detail panel and footer. A click makes a statement current; a double click / Enter / Aç / the
 * code opens it for reconciliation. Yeni imports a statement; Excel / CSV write the listed statements (same columns).
 */
export function BankStatementList({
  active,
  loading,
  busy,
  statements,
  visibleStatements,
  search,
  status,
  onSearchChange,
  onStatusChange,
  onRefresh,
  onOpen,
  onImport,
  onExport,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const panel = useStockDetailPanelOpen(active, rootRef);
  const current = visibleStatements.find((statement) => statement.id === currentId) ?? null;

  const searched = searchBankStatements(statements, search);
  const pendingCount = searched.filter((statement) => statement.status === "Imported").length;
  const allPending = statements.filter((statement) => statement.status === "Imported");
  const openLines = allPending.reduce((sum, statement) => sum + Math.max(0, statement.lineCount - statement.matchedLineCount), 0);
  const cards: SummaryCard[] = [
    {
      id: "pending",
      label: "Mutabakat bekleyen",
      value: loading ? "—" : allPending.length.toLocaleString("tr-TR"),
      icon: AlertTriangle,
      tone: allPending.length > 0 ? "warn" : "primary",
      hint: <span>tüm ekstreler</span>,
      filterActive: status === "Imported",
      onFilter: () => onStatusChange(status === "Imported" ? "" : "Imported"),
    },
    {
      id: "open-lines",
      label: "Eşleşmemiş satır",
      value: loading ? "—" : openLines.toLocaleString("tr-TR"),
      icon: ListChecks,
      tone: openLines > 0 ? "warn" : "primary",
      hint: <span>mutabakat bekleyen ekstreler</span>,
    },
  ];

  const selectReason = "Önce bir kayıt seçin";
  const emptyReason = "Listede ekstre yok";
  const more: MenuCommand[] = [
    {
      id: "export-csv",
      label: "CSV olarak dışa aktar",
      disabledReason: visibleStatements.length === 0 ? emptyReason : undefined,
      run: () => onExport("csv"),
    },
  ];
  const commands: PageCommands = {
    new: { primary: true, disabledReason: busy ? "İşlem sürüyor…" : undefined, run: onImport },
    open: {
      disabledReason: current ? undefined : selectReason,
      run: () => {
        const id = focusedRecordId() ?? current?.id;
        const statement = visibleStatements.find((row) => row.id === id);
        if (statement) onOpen(statement);
      },
    },
    delete: { disabledReason: "Aktarılan banka ekstresi silinemez" },
    export: { disabledReason: visibleStatements.length === 0 ? emptyReason : undefined, run: () => onExport("xlsx") },
    more,
  };

  const renderCell = (field: BuiltInScreenLayoutField, statement: BankStatement) => {
    switch (field.key) {
      case "code":
        return (
          <button
            type="button"
            className="erp-link-button customer-code"
            aria-label={`${statement.code} ekstresini aç`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(statement);
            }}
          >
            {statement.code}
          </button>
        );
      case "account":
        return statement.accountName;
      case "currencyCode":
        return statement.currencyCode;
      case "period":
        return `${formatDate(statement.startDate)} – ${formatDate(statement.endDate)}`;
      case "openingBalance":
        return statementAmount(statement.openingBalance);
      case "closingBalance":
        return statementAmount(statement.closingBalance);
      case "matched":
        return (
          <span className={statement.matchedLineCount < statement.lineCount ? "bst-open-lines" : undefined}>
            {statement.matchedLineCount.toLocaleString("tr-TR")} / {statement.lineCount.toLocaleString("tr-TR")}
          </span>
        );
      case "status":
        return <BankStatementStatusTag status={statement.status} />;
      default:
        return null;
    }
  };

  const listPanel =
    panel.open && active ? (
      current ? (
        <SalesListDetailPanel
          label="Banka ekstresi özeti"
          code={current.code}
          title={current.accountName}
          tags={
            <>
              <BankStatementStatusTag status={current.status} />
              <StatusTag tone="off">{current.currencyCode}</StatusTag>
            </>
          }
          tabs={[{ id: "summary", label: "Özet" }]}
          tab="summary"
          onTabChange={() => {}}
          onOpen={() => onOpen(current)}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        >
          <SalesPanelStats
            items={[
              { label: "Açılış", value: statementAmount(current.openingBalance, current.currencyCode) },
              { label: "Kapanış", value: statementAmount(current.closingBalance, current.currencyCode) },
            ]}
          />
          <SalesPanelFacts
            items={[
              { label: "Dönem", value: `${formatDate(current.startDate)} – ${formatDate(current.endDate)}` },
              { label: "Eşleşen satır", value: `${current.matchedLineCount} / ${current.lineCount}` },
              { label: "Aktarıldı", value: formatDate(current.createdAt) },
            ]}
          />
          <p className="sales-ld-muted">Satırlar ve mutabakat için Aç (Enter).</p>
        </SalesListDetailPanel>
      ) : (
        <SalesListDetailEmpty label="Banka ekstresi özeti" text="Özetini görmek için listeden bir ekstre seçin." />
      )
    ) : null;

  return (
    <>
      {active && <PageCommandsSlot commands={commands} />}
      <ListSummaryCards cards={cards} />
      <ListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchLabel="Banka ekstresi ara"
        searchPlaceholder="Ekstre, hesap veya döviz"
        toolsSlotRef={setToolsSlot}
        onRefresh={onRefresh}
      >
        <ListChipGroup
          label="Durum"
          value={status}
          allowClear
          onChange={(value) => onStatusChange(value as BankStatementStatusFilter)}
          options={[
            { value: "Imported", label: "Bekliyor", count: pendingCount },
            { value: "Reconciled", label: "Mutabık", count: searched.length - pendingCount },
          ]}
        />
        <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
      </ListToolbar>
      <div ref={rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
        <section className="list-v2-list fin-acc-list bst-list">
          <SalesDocumentGrid
            gridId="studio-finance-bank-statements-v2"
            hideExport
            fields={FIELDS}
            items={visibleStatements}
            loading={loading}
            loadingMessage="Ekstreler yükleniyor…"
            emptyMessage={
              statements.length === 0
                ? "Henüz banka ekstresi aktarılmadı. Yeni (F2) ile CSV dosyasından içe aktarın."
                : "Filtreye uygun banka ekstresi bulunamadı."
            }
            search=""
            searchEmptyMessage=""
            toolbarContainer={toolsSlot}
            renderCell={renderCell}
            ariaLabel="Banka ekstreleri"
            columnWidths={WIDTHS}
            numberFields={NUMBER_FIELDS}
            codeFields={CODE_FIELDS}
            selection={{
              currentId,
              onCurrentChange: setCurrentId,
              onTickedChange: setTicked,
              onOpen: (id) => {
                const statement = visibleStatements.find((row) => row.id === id);
                if (statement) onOpen(statement);
              },
            }}
            footer={
              <ListFooter hints="↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç · Ctrl+. detay paneli">
                {ticked.length > 0 && (
                  <span>
                    <span>{ticked.length}</span> <span>seçili</span>
                  </span>
                )}
                <span>
                  <span>Gösterilen</span>{" "}
                  <span>
                    {visibleStatements.length.toLocaleString("tr-TR")} / {statements.length.toLocaleString("tr-TR")}
                  </span>
                </span>
              </ListFooter>
            }
          />
        </section>
        {listPanel}
      </div>
    </>
  );
}

