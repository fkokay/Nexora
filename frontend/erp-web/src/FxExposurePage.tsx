import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api, localDateString } from "./erpApi";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import type { BuiltInScreenLayoutField, FxExposureReport } from "./erp-types";
import { LedgerReportFrame, ReportParam } from "./general-ledger/components/LedgerReportFrame";
import { downloadCsv, downloadXlsx, type ExportCell } from "./general-ledger/ledgerReportUtils";
import "./list-page/list-page-v2.css";
import "./finance-hub.css";
import "./finance/finance-reports.css";

type Invoice = FxExposureReport["invoices"][number];
type Direction = Invoice["direction"];
type ColumnKey =
  | "invoice"
  | "direction"
  | "invoiceDate"
  | "outstandingAmount"
  | "invoiceDateRate"
  | "currentRate"
  | "estimatedChangeBase";
type Column = {
  key: ColumnKey;
  label: string;
  width?: number | null;
  pinned?: BuiltInScreenLayoutField["pinned"];
};

const amount = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${amount(Math.abs(value))}`;
const rate4 = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const rateFull = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const displayDate = (value: string) => value.split("-").reverse().join(".");
const tone = (value: number) => (value > 0 ? "fh-pos" : value < 0 ? "fh-neg" : undefined);
/** Receivables gain when the rate rises, payables lose: the base-currency effect of a change. */
const effectSign = (direction: Direction) => (direction === "Receivable" ? 1 : -1);
const directionLabel = (direction: Direction) => (direction === "Receivable" ? "Alacak" : "Borç");

/**
 * Columns of this page. The tenant's "finance-fx-exposure" screen view still lists the older
 * separate columns; Fatura+Cari and Kalan tutar+Döviz are merged here, so their order and
 * visibility come from whichever of the pair the view keeps visible.
 */
const columns: { key: ColumnKey; label: string; sources: string[] }[] = [
  { key: "invoice", label: "Fatura · cari", sources: ["invoice", "counterparty"] },
  { key: "direction", label: "Yön", sources: ["direction"] },
  { key: "invoiceDate", label: "Fatura tarihi", sources: ["invoiceDate"] },
  { key: "outstandingAmount", label: "Kalan", sources: ["outstandingAmount", "currencyCode"] },
  { key: "invoiceDateRate", label: "Fatura kuru", sources: ["invoiceDateRate"] },
  { key: "currentRate", label: "Güncel kur", sources: ["currentRate"] },
  { key: "estimatedChangeBase", label: "Tahmini fark", sources: ["estimatedChangeBase"] },
];
const defaultColumns: Column[] = columns.map(({ key, label }) => ({ key, label }));

function columnsFromView(fields: BuiltInScreenLayoutField[]): Column[] {
  return columns
    .map((column, index) => {
      const matches = fields.filter(
        (field) => column.sources.includes(field.key) && (field.visible || field.fixed),
      );
      if (!matches.length) return null;
      const primary = fields.find((field) => field.key === column.sources[0]);
      return {
        column: {
          key: column.key,
          label: column.label,
          width: primary?.width,
          pinned: primary?.pinned,
        } as Column,
        position: Math.min(...matches.map((field) => field.position ?? index)),
      };
    })
    .filter((entry): entry is { column: Column; position: number } => entry !== null)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.column);
}

type CurrencyPosition = {
  code: string;
  receivable: number;
  payable: number;
  net: number;
  rate: number | null;
  invoiceCount: number;
};

export default function FxExposurePage({
  token,
  onNavigate,
}: {
  token: string;
  role: string;
  onNavigate?: (page: string) => void;
}) {
  const [report, setReport] = useState<FxExposureReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("");
  const [query, setQuery] = useState("");
  const [gridColumns, setGridColumns] = useState<Column[]>(defaultColumns);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setReport(await api<FxExposureReport>("/api/finance/fx-exposure", token));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    api<{ id?: string | null; fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/finance-fx-exposure/active",
      token,
    )
      .then((view) => {
        // Without a published view the server returns its catalog default (id null).
        if (cancelled || !view.id || !view.fields?.length) return;
        const next = columnsFromView(view.fields);
        if (next.length) setGridColumns(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  const base = report?.baseCurrencyCode ?? "";
  // Base-currency invoices carry no FX risk and are left out of every figure on this page.
  const foreign = useMemo(
    () => (report ? report.invoices.filter((row) => row.currencyCode !== report.baseCurrencyCode) : []),
    [report],
  );
  const baseInvoiceCount = report ? report.invoices.length - foreign.length : 0;

  const totals = useMemo(() => {
    let receivable = 0,
      payable = 0,
      change = 0,
      unconverted = 0,
      receivableConverted = 0,
      payableConverted = 0,
      changeConverted = 0;
    for (const row of foreign) {
      if (row.currentBaseAmount === null) unconverted++;
      else if (row.direction === "Receivable") {
        receivable += row.currentBaseAmount;
        receivableConverted++;
      } else {
        payable += row.currentBaseAmount;
        payableConverted++;
      }
      if (row.estimatedChangeBase !== null) {
        change += effectSign(row.direction) * row.estimatedChangeBase;
        changeConverted++;
      }
    }
    const receivableCount = foreign.filter((row) => row.direction === "Receivable").length;
    return {
      receivable,
      payable,
      net: receivable - payable,
      change,
      unconverted,
      receivableConverted,
      payableConverted,
      changeConverted,
      unconvertedChange: foreign.filter((row) => row.estimatedChangeBase === null).length,
      receivableCount,
      payableCount: foreign.length - receivableCount,
    };
  }, [foreign]);

  const positions = useMemo(() => {
    const byCode = new Map<string, CurrencyPosition>();
    for (const row of foreign) {
      const current = byCode.get(row.currencyCode) ?? {
        code: row.currencyCode,
        receivable: 0,
        payable: 0,
        net: 0,
        rate: null,
        invoiceCount: 0,
      };
      if (row.direction === "Receivable") current.receivable += row.outstandingAmount;
      else current.payable += row.outstandingAmount;
      current.net = current.receivable - current.payable;
      current.rate ??= row.currentRate;
      current.invoiceCount++;
      byCode.set(row.currencyCode, current);
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [foreign]);

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const visibleRows = foreign.filter(
    (row) =>
      (currencyFilter === "all" || row.currencyCode === currencyFilter) &&
      (!directionFilter || row.direction === directionFilter) &&
      (!normalizedQuery ||
        `${row.invoiceCode} ${row.counterpartyName}`
          .toLocaleLowerCase("tr-TR")
          .includes(normalizedQuery)),
  );

  function exportRows(): ExportCell[][] {
    if (!report) return [];
    return [
      [
        "Yön",
        "Fatura no",
        "Cari",
        "Fatura tarihi",
        "Döviz",
        "Kalan tutar",
        "Fatura kuru",
        "Fatura tarihindeki baz değer",
        "Güncel kur",
        "Bugünkü baz değer",
        "Tahmini kur farkı (+ gelir / − gider)",
        "Baz para birimi",
      ],
      ...foreign.map((row) => [
        directionLabel(row.direction),
        row.invoiceCode,
        row.counterpartyName,
        row.invoiceDate,
        row.currencyCode,
        row.outstandingAmount,
        row.invoiceDateRate,
        row.historicalBaseAmount,
        row.currentRate,
        row.currentBaseAmount,
        row.estimatedChangeBase === null
          ? null
          : effectSign(row.direction) * row.estimatedChangeBase,
        report.baseCurrencyCode,
      ]),
    ];
  }
  const fileBase = `doviz-pozisyonu-${report?.asOfDate ?? localDateString()}`;

  const firstLoad = !report && (loading || !error);
  const empty = !!report && foreign.length === 0;
  // A figure no invoice could be converted into shows "—" instead of a misleading 0,00.
  const figure = (value: number, converted: number, colored = false) =>
    firstLoad ? (
      <small>Yükleniyor…</small>
    ) : converted === 0 ? (
      "—"
    ) : (
      <>
        <span className={colored ? tone(value) : undefined}>{colored ? signed(value) : amount(value)}</span> <small>{base}</small>
      </>
    );
  const filtered = currencyFilter !== "all" || Boolean(directionFilter) || Boolean(normalizedQuery);

  return (
    <div className="finance-page fh-page list-v2 fx-exposure-page ledger-report-host">
      <LedgerReportFrame
        className="fx-report"
        title="Döviz pozisyonu"
        description="Açık dövizli alacak ve borç faturalarını güncel kurla inceleyin."
        count={report ? foreign.length : null}
        countLabel="dövizli fatura"
        onRun={() => void load()}
        onExportXlsx={() => void downloadXlsx(`${fileBase}.xlsx`, "Döviz pozisyonu", exportRows())}
        onExportCsv={() => downloadCsv(`${fileBase}.csv`, exportRows())}
        exportDisabledReason={foreign.length ? undefined : report ? "Dövizli açık fatura yok" : "Rapor henüz hazır değil"}
        paramsNote="Rapor bugünün tarihiyle ve en son girilen kurla hesaplanır. Filtreler yüklü raporu süzer."
        more={onNavigate ? [{ id: "fx-open-rates", label: "Kur ve değerleme", run: () => onNavigate("finance-fx") }] : []}
        summary={[
          <>
            <span>Tarih:</span> <b>{displayDate(report?.asOfDate ?? localDateString())}</b>
          </>,
          <>
            <span>Baz para:</span> <b>{base || "—"}</b>
          </>,
          ...(filtered && report
            ? [
                <>
                  <span>Gösterilen:</span> <b>{visibleRows.length}</b> <span>fatura</span>
                </>,
              ]
            : []),
          ...(loading ? [<span className="glrp-loading">Yükleniyor…</span>] : []),
        ]}
        params={
          <>
            <ReportParam label="Para birimi">
              <ListChipGroup
                label="Para birimi"
                value={currencyFilter}
                onChange={(value) => setCurrencyFilter(value || "all")}
                options={[
                  { value: "all", label: "Tümü", count: foreign.length },
                  ...positions.map((position) => ({
                    value: position.code,
                    label: position.code,
                    count: position.invoiceCount,
                  })),
                ]}
              />
            </ReportParam>
            <ReportParam label="Yön">
              <ListChipGroup
                label="Yön"
                value={directionFilter}
                allowClear
                onChange={setDirectionFilter}
                options={[
                  { value: "Receivable", label: "Alacak", count: totals.receivableCount },
                  { value: "Payable", label: "Borç", count: totals.payableCount },
                ]}
              />
            </ReportParam>
          </>
        }
      >
        {error && (
          <div className="alert inline-alert">
            {error}
            <button type="button" onClick={() => setError("")} aria-label="Kapat">
              <X size={15} />
            </button>
          </div>
        )}

        {firstLoad && <p className="glrp-empty">Rapor yükleniyor…</p>}

        {empty && (
          <section className="glrp-card cf-calm" role="status">
            <b>Açık döviz pozisyonu yok</b>
            {baseInvoiceCount > 0 && <span>{`Tüm açık faturalar ${base} (${baseInvoiceCount} fatura)`}</span>}
          </section>
        )}

        {report && !empty && (
          <>
            {(totals.unconverted > 0 || totals.unconvertedChange > 0) && (
              <div className="glrp-warning" role="status">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>
                  <span>{Math.max(totals.unconverted, totals.unconvertedChange)}</span>{" "}
                  <span>fatura kursuz, toplamlara dahil değil</span>
                </span>
              </div>
            )}
            <section className="glrp-card" aria-label="Döviz bazında pozisyon">
              <dl className="cf-figures">
                <div className="cf-figure">
                  <dt>Net pozisyon</dt>
                  <dd>{figure(totals.net, totals.receivableConverted + totals.payableConverted, true)}</dd>
                  <dd className="cf-figure-hint">Alacak − borç, güncel kurla</dd>
                </div>
                <div className="cf-figure">
                  <dt>Dövizli alacak</dt>
                  <dd>{figure(totals.receivable, totals.receivableConverted)}</dd>
                  <dd className="cf-figure-hint">
                    <span>{totals.receivableCount}</span> <span>fatura</span>
                  </dd>
                </div>
                <div className="cf-figure">
                  <dt>Dövizli borç</dt>
                  <dd>{figure(totals.payable, totals.payableConverted)}</dd>
                  <dd className="cf-figure-hint">
                    <span>{totals.payableCount}</span> <span>fatura</span>
                  </dd>
                </div>
                <div className="cf-figure">
                  <dt>Tahmini kur farkı</dt>
                  <dd>{figure(totals.change, totals.changeConverted, true)}</dd>
                  <dd className="cf-figure-hint">kayıt oluşturmaz</dd>
                </div>
              </dl>
              <div className="glrp-table-wrap">
                <table className="glrp-table">
                  <thead>
                    <tr>
                      <th>Döviz</th>
                      <th className="num">Güncel kur ({base})</th>
                      <th className="num">Alacak</th>
                      <th className="num">Borç</th>
                      <th className="num">Net</th>
                      <th className="num">Kur %5 artarsa ({base})</th>
                      <th className="num">Kur %5 düşerse ({base})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => {
                      const swing = position.rate === null ? 0 : Math.abs(position.net * position.rate * 0.05);
                      const rise = position.net >= 0 ? swing : -swing;
                      const sensitive = position.rate !== null && position.net !== 0;
                      return (
                        <tr key={position.code}>
                          <td>
                            <span className="cf-code">{position.code}</span>
                          </td>
                          <td className="num">
                            {position.rate !== null ? rate4(position.rate) : <span className="fh-neg">Güncel kur yok — Kur ve değerleme'den kur girin</span>}
                          </td>
                          <td className="num">{amount(position.receivable)}</td>
                          <td className="num">{amount(position.payable)}</td>
                          <td className={`num ${tone(position.net) ?? ""}`}>{signed(position.net)}</td>
                          <td className="num">{sensitive ? signed(rise) : "—"}</td>
                          <td className="num">{sensitive ? signed(-rise) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="glrp-card cf-grid" aria-label="Açık dövizli faturalar">
              <div className="cf-card-head">
                <h2>Açık dövizli faturalar</h2>
                <ListToolbar search={query} onSearchChange={setQuery} searchLabel="Fatura veya cari ara" searchPlaceholder="Fatura no veya cari">
                  <div className="cf-card-tools" ref={setToolsSlot} />
                </ListToolbar>
              </div>
              <div className="ledger-list">
                <AdvancedDataGrid
                  className="customer-table"
                  gridId="finance-fx-exposure-v2"
                  {...screenViewGridDefaults(gridColumns)}
                  externalPagination
                  hideSearch
                  hideExport
                  enableRowSelection={false}
                  toolbarContainer={toolsSlot}
                >
                  <thead>
                    <tr>
                      {gridColumns.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={`${row.direction}-${row.invoiceId}`}>
                        {gridColumns.map((column) => (
                          <td
                            key={column.key}
                            className={
                              column.key === "invoice" || column.key === "direction" || column.key === "invoiceDate"
                                ? undefined
                                : "fh-rate-num"
                            }
                          >
                            {cell(row, column.key, base)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={Math.max(1, gridColumns.length)} className="table-empty">
                          Filtreye uygun fatura bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </AdvancedDataGrid>
              </div>
            </section>
          </>
        )}

        {report && <p className="glrp-note">Tahmini görünümdür; güncel kurla hesaplanır ve muhasebe kaydı oluşturmaz.</p>}
      </LedgerReportFrame>
    </div>
  );
}

function cell(row: Invoice, key: ColumnKey, base: string) {
  switch (key) {
    case "invoice":
      return (
        <>
          <span className="customer-code">{row.invoiceCode}</span>
          <small className="cell-subtitle">{row.counterpartyName}</small>
        </>
      );
    case "direction":
      return directionLabel(row.direction);
    case "invoiceDate":
      return displayDate(row.invoiceDate);
    case "outstandingAmount":
      return (
        <>
          {amount(row.outstandingAmount)} {row.currencyCode}
        </>
      );
    case "invoiceDateRate":
      return row.invoiceDateRate === null ? "Kur yok" : rateFull(row.invoiceDateRate);
    case "currentRate":
      return row.currentRate === null ? "Kur yok" : rateFull(row.currentRate);
    case "estimatedChangeBase": {
      if (row.estimatedChangeBase === null) return "—";
      const effect = effectSign(row.direction) * row.estimatedChangeBase;
      return (
        <span className={tone(effect)} title={effect >= 0 ? "Kur farkı geliri" : "Kur farkı gideri"}>
          {signed(effect)} {base}
        </span>
      );
    }
  }
}
