import { useState } from "react";
import { localDateString } from "../../erpApi";
import type { MaturityReport } from "../../erp-types";
import { FinanceStudioGrid } from "../../FinanceStudioGrid";
import { financeGridDefaults } from "../../financeCatalog";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import { LedgerReportFrame, ReportParam } from "../../general-ledger/components/LedgerReportFrame";
import { downloadCsv, downloadXlsx, type ExportCell } from "../../general-ledger/ledgerReportUtils";
import "../finance-reports.css";

type Direction = "all" | "Receivable" | "Payable";
type Item = MaturityReport["items"][number];
type Summary = MaturityReport["summaries"][number];

const amount = (value: number) => value.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
const date = (value: string) => value.split("-").reverse().join(".");
const directionLabel = (direction: Item["direction"]) => (direction === "Receivable" ? "Alacak" : "Borç");

type Props = {
  token: string;
  title: string;
  description: string;
  maturity: MaturityReport | null;
  loading: boolean;
  /** Yenile / F9: the same GET /api/finance/maturities as before. */
  onRun: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  direction: Direction;
  onDirectionChange: (value: Direction) => void;
  /** Open invoices after the direction / search filter. */
  items: Item[];
  /** Aging rows after the direction filter. */
  summaries: Summary[];
  overdueCount: number;
  receivableCount: number;
  payableCount: number;
};

/**
 * Vade Takibi as a report screen (approved mockup 04): the endpoint takes no parameters, so the panel holds the
 * filters of the loaded report (Yön). Aging per direction × currency on top, the open invoices below; both grids keep
 * the tenant's screen layouts ("finance-maturity-aging", "finance-maturities").
 */
export function MaturityReportView({
  token,
  title,
  description,
  maturity,
  loading,
  onRun,
  query,
  onQueryChange,
  direction,
  onDirectionChange,
  items,
  summaries,
  overdueCount,
  receivableCount,
  payableCount,
}: Props) {
  const [agingTools, setAgingTools] = useState<HTMLDivElement | null>(null);
  const [itemTools, setItemTools] = useState<HTMLDivElement | null>(null);
  const asOf = maturity?.asOfDate ?? localDateString();

  function exportRows(): ExportCell[][] {
    return [
      ["Fatura", "Cari", "Yön", "Fatura tarihi", "Vade tarihi", "Döviz", "Kalan tutar", "Gecikme (gün)"],
      ...items.map((item) => [
        item.invoiceCode, item.counterpartyName, directionLabel(item.direction), item.invoiceDate, item.dueDate,
        item.currencyCode, item.outstandingAmount, item.daysOverdue,
      ]),
    ];
  }
  const fileBase = `vade-takibi-${asOf}`;

  return (
    <LedgerReportFrame
      className="mt-report"
      title={title}
      description={description}
      count={maturity ? maturity.items.length : null}
      countLabel="açık fatura"
      onRun={onRun}
      onExportXlsx={() => void downloadXlsx(`${fileBase}.xlsx`, "Vade takibi", exportRows())}
      onExportCsv={() => downloadCsv(`${fileBase}.csv`, exportRows())}
      exportDisabledReason={maturity ? (items.length ? undefined : "Gösterilecek fatura yok") : "Rapor henüz hazır değil"}
      paramsNote="Rapor bugünün tarihiyle hesaplanır. Filtreler yüklü raporu süzer."
      summary={[
        <>
          <span>Tarih:</span> <b>{date(asOf)}</b>
        </>,
        <>
          <span>Yön:</span> <b>{direction === "all" ? "Alacak ve borç" : directionLabel(direction)}</b>
        </>,
        ...(maturity && overdueCount > 0
          ? [
              <StatusTag tone="warn">
                <span>{overdueCount}</span> <span>fatura vadesi geçmiş</span>
              </StatusTag>,
            ]
          : []),
        ...(loading ? [<span className="glrp-loading">Yükleniyor…</span>] : []),
      ]}
      params={
        <ReportParam label="Yön">
          <ListChipGroup
            label="Yön"
            value={direction}
            onChange={(value) => onDirectionChange((value || "all") as Direction)}
            options={[
              { value: "all", label: "Alacak ve borç", count: maturity?.items.length },
              { value: "Receivable", label: "Alacak", count: maturity ? receivableCount : undefined },
              { value: "Payable", label: "Borç", count: maturity ? payableCount : undefined },
            ]}
          />
        </ReportParam>
      }
    >
      <section className="glrp-card cf-grid" aria-label="Yaşlandırma">
        <div className="cf-card-head">
          <h2>Yaşlandırma</h2>
          <span className="cf-card-sub">Satış vadesi cari ödeme gününden hesaplanır.</span>
          <div className="cf-card-tools" ref={setAgingTools} />
        </div>
        <div className="ledger-list">
          <FinanceStudioGrid
            token={token}
            screenKey="finance-maturity-aging"
            defaults={financeGridDefaults["finance-maturity-aging"]}
            toolbarContainer={agingTools}
            enableRowSelection={false}
            externalPagination
            hideSearch
            hideExport
          >
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Yön</th>
                  <th>Döviz</th>
                  <th>Fatura</th>
                  <th>Açık tutar</th>
                  <th>Vadesi gelmemiş</th>
                  <th>1–30 gün</th>
                  <th>31–60 gün</th>
                  <th>61–90 gün</th>
                  <th>90+ gün</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={`${s.direction}-${s.currencyCode}`}>
                    <td>{directionLabel(s.direction)}</td>
                    <td>{s.currencyCode}</td>
                    <td className="num">{s.invoiceCount}</td>
                    <td className="num">{amount(s.outstandingAmount)}</td>
                    <td className="num">{amount(s.notDue)}</td>
                    <td className="num">{amount(s.days1To30)}</td>
                    <td className="num">{amount(s.days31To60)}</td>
                    <td className="num">{amount(s.days61To90)}</td>
                    <td className="num">{amount(s.over90Days)}</td>
                  </tr>
                ))}
                {summaries.length === 0 && (
                  <tr>
                    <td colSpan={9} className="table-empty">
                      Açık vadeli fatura bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </FinanceStudioGrid>
        </div>
      </section>

      <section className="glrp-card cf-grid" aria-label="Açık faturalar">
        <div className="cf-card-head">
          <h2>Açık faturalar</h2>
          <ListToolbar search={query} onSearchChange={onQueryChange} searchLabel="Fatura veya cari ara" searchPlaceholder="Fatura no veya cari adı">
            <div className="cf-card-tools" ref={setItemTools} />
          </ListToolbar>
        </div>
        <div className="ledger-list">
          <FinanceStudioGrid
            token={token}
            screenKey="finance-maturities"
            defaults={financeGridDefaults["finance-maturities"]}
            toolbarContainer={itemTools}
            enableRowSelection={false}
            hideSearch
            hideExport
          >
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th>Cari</th>
                  <th>Yön</th>
                  <th>Fatura tarihi</th>
                  <th>Vade tarihi</th>
                  <th>Kalan tutar</th>
                  <th>Gecikme</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.direction}-${i.invoiceId}`}>
                    <td>
                      <span className="customer-code">{i.invoiceCode}</span>
                    </td>
                    <td>{i.counterpartyName}</td>
                    <td>{directionLabel(i.direction)}</td>
                    <td>{date(i.invoiceDate)}</td>
                    <td>{date(i.dueDate)}</td>
                    <td className="num">
                      {amount(i.outstandingAmount)} {i.currencyCode}
                    </td>
                    <td>
                      {i.daysOverdue ? (
                        <StatusTag tone={i.daysOverdue > 90 ? "bad" : "warn"}>{`${i.daysOverdue} gün`}</StatusTag>
                      ) : (
                        <StatusTag tone="off">Vadesi gelmedi</StatusTag>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      {maturity?.items.length ? "Filtrelere uygun açık fatura bulunmuyor." : "Açık fatura bulunmuyor."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </FinanceStudioGrid>
        </div>
      </section>
    </LedgerReportFrame>
  );
}
