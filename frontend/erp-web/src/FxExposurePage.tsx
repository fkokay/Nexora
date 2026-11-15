import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { api, localDateString } from "./erpApi";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import { ListChipGroup, ListToolbar } from "./list-page/ListToolbar";
import type { BuiltInScreenLayoutField, FxExposureReport } from "./erp-types";
import "./list-page/list-page-v2.css";
import "./finance-hub.css";

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

  function downloadCsv() {
    if (!report || !foreign.length) return;
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
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
    const content = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `doviz-pozisyonu-${report.asOfDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const firstLoad = !report && (loading || !error);
  const empty = !!report && foreign.length === 0;
  // A figure no invoice could be converted into shows "—" instead of a misleading 0,00.
  const tileValue = (value: number, converted: number, colored = false) =>
    firstLoad ? (
      <small>Yükleniyor…</small>
    ) : converted === 0 ? (
      "—"
    ) : (
      <>
        <span className={colored ? tone(value) : undefined}>{colored ? signed(value) : amount(value)}</span>{" "}
        <small>{base}</small>
      </>
    );

  return (
    <div className="finance-page finance-workbench-page fh-page list-v2 fx-exposure-page">
      <div className="page-heading list-v2-heading fh-head">
        <div className="list-v2-title">
          <h1 title="Açık dövizli alacak ve borç faturalarını güncel kurla inceleyin.">
            Döviz pozisyonu
          </h1>
          <span className="fh-meta">
            <span>{displayDate(report?.asOfDate ?? localDateString())}</span>
            {base && (
              <>
                {" · "}
                <span>baz para</span> <b>{base}</b>
              </>
            )}
          </span>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="secondary"
            disabled={!foreign.length}
            onClick={downloadCsv}
          >
            <Download size={15} aria-hidden="true" />
            <span>CSV indir</span>
          </button>
          {onNavigate && (
            <button type="button" className="secondary" onClick={() => onNavigate("finance-fx")}>
              Kur ve değerleme
            </button>
          )}
          <button
            type="button"
            className="list-v2-icon-button"
            disabled={loading}
            onClick={() => void load()}
            aria-label="Raporu yenile"
            title="Yenile"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert inline-alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {firstLoad && <p className="fh-empty">Rapor yükleniyor…</p>}

      {empty && (
        <section className="fh-box fh-calm" role="status">
          <b>Açık döviz pozisyonu yok</b>
          {baseInvoiceCount > 0 && (
            <span className="fh-muted">{`Tüm açık faturalar ${base} (${baseInvoiceCount} fatura)`}</span>
          )}
        </section>
      )}

      {report && !empty && (
        <>
          <div className="fh-tiles">
            <div className="fh-tile">
              <span className="fh-tile-label">Net pozisyon</span>
              <span className="fh-tile-value">{tileValue(totals.net, totals.receivableConverted + totals.payableConverted, true)}</span>
              <span className="fh-tile-hint">Alacak − borç, güncel kurla</span>
            </div>
            <div className="fh-tile">
              <span className="fh-tile-label">Dövizli alacak</span>
              <span className="fh-tile-value">{tileValue(totals.receivable, totals.receivableConverted)}</span>
              <span className="fh-tile-hint">
                <span>{totals.receivableCount}</span> <span>fatura</span>
              </span>
            </div>
            <div className="fh-tile">
              <span className="fh-tile-label">Dövizli borç</span>
              <span className="fh-tile-value">{tileValue(totals.payable, totals.payableConverted)}</span>
              <span className="fh-tile-hint">
                <span>{totals.payableCount}</span> <span>fatura</span>
              </span>
            </div>
            <div className="fh-tile">
              <span className="fh-tile-label">Tahmini kur farkı</span>
              <span className="fh-tile-value">{tileValue(totals.change, totals.changeConverted, true)}</span>
              <span className="fh-tile-hint">kayıt oluşturmaz</span>
            </div>
          </div>
          {(totals.unconverted > 0 || totals.unconvertedChange > 0) && (
            <p className="fh-note fh-neg">
              <span>{Math.max(totals.unconverted, totals.unconvertedChange)}</span>{" "}
              <span>fatura kursuz, toplamlara dahil değil</span>
            </p>
          )}

          <div className="fh-ccys">
            {positions.map((position) => (
              <CurrencyBox key={position.code} position={position} base={base} />
            ))}
          </div>

          <ListToolbar
            search={query}
            onSearchChange={setQuery}
            searchLabel="Fatura veya cari ara"
            searchPlaceholder="Fatura no veya cari"
            toolsSlotRef={setToolsSlot}
          >
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
          </ListToolbar>

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
        </>
      )}

      {report && (
        <p className="fh-note">
          Tahmini görünümdür; güncel kurla hesaplanır ve muhasebe kaydı oluşturmaz.
        </p>
      )}
    </div>
  );
}

function CurrencyBox({ position, base }: { position: CurrencyPosition; base: string }) {
  const swing = position.rate === null ? 0 : Math.abs(position.net * position.rate * 0.05);
  const rise = position.net >= 0 ? swing : -swing;
  return (
    <section className="fh-box fh-ccy" aria-label={position.code}>
      <div className="fh-ccy-head">
        <b className="fh-ccy-code">{position.code}</b>
        {position.rate !== null ? (
          <span className="fh-muted">
            <span>Güncel kur</span> <b>{rate4(position.rate)}</b> <span>{base}</span>
          </span>
        ) : (
          <span className="fh-neg">Güncel kur yok — Kur ve değerleme'den kur girin</span>
        )}
      </div>
      <dl className="fh-ccy-rows">
        <div>
          <dt>Alacak</dt>
          <dd>
            {amount(position.receivable)} <small>{position.code}</small>
          </dd>
        </div>
        <div>
          <dt>Borç</dt>
          <dd>
            {amount(position.payable)} <small>{position.code}</small>
          </dd>
        </div>
        <div className="is-total">
          <dt>Net</dt>
          <dd className={tone(position.net)}>
            {signed(position.net)} <small>{position.code}</small>
          </dd>
        </div>
      </dl>
      {position.rate !== null && position.net !== 0 && (
        <p className="fh-ccy-sens">
          {`Kur %5 artarsa ${signed(rise)} ${base} · %5 düşerse ${signed(-rise)} ${base}`}
        </p>
      )}
    </section>
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
        <b>
          {amount(row.outstandingAmount)} {row.currencyCode}
        </b>
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
