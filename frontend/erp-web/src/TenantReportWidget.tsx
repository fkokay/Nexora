import { type CSSProperties, useEffect, useState } from "react";
import { api } from "./erpApi";

type CatalogColumn = { code: string; label: string; dataType?: string };
type CatalogSource = { code: string; label: string; columns: CatalogColumn[] };
type ReportCatalog = CatalogSource[];
type ReportResult = {
  columns: CatalogColumn[];
  rows: Record<string, unknown>[];
  page: number;
  pageSize: number;
  totalCount: number;
};

type Props = {
  kind: "metric" | "dataTable";
  source?: unknown;
  columns?: unknown;
  title: string;
  description: string;
  fallbackValue?: string;
  style?: CSSProperties;
  token: string;
  rowActionsEnabled?: boolean;
  rowActionWorkflowId?: string;
  rowActionLabel?: string;
  pageCode?: string;
  componentId?: string;
};

const MAX_ROWS = 50;

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
  }
  return String(value);
}

export default function TenantReportWidget({
  kind, source: sourceValue, columns: columnsValue, title, description, fallbackValue, style, token,
  rowActionsEnabled = false, rowActionWorkflowId, rowActionLabel, pageCode = "", componentId = "",
}: Props) {
  const sourceCode = typeof sourceValue === "string" ? sourceValue.trim() : "";
  const selectedColumns = Array.isArray(columnsValue)
    ? columnsValue.filter((column): column is string => typeof column === "string")
    : [];
  const [catalog, setCatalog] = useState<ReportCatalog>([]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");
    setResult(null);

    if (!sourceCode) {
      setCatalog([]);
      setStatus("ready");
      return () => { active = false; };
    }

    void (async () => {
      try {
        const tenantDataCode = sourceCode.startsWith("tenantData:") ? sourceCode.slice("tenantData:".length) : "";
        if (tenantDataCode) {
          const data = await api<{ entity: { name: string; fields: { code: string; label: string; dataType: string }[] }; items: { id: string; values: Record<string, unknown> }[]; total: number }>(
            `/api/custom-data/entities/${encodeURIComponent(tenantDataCode)}/records?page=1&pageSize=${kind === "metric" ? 1 : MAX_ROWS}`, token);
          if (!active) return;
          const columns = data.entity.fields.map((field) => ({ code: field.code, label: field.label, dataType: field.dataType }));
          const source: CatalogSource = { code: sourceCode, label: `Özel veri · ${data.entity.name}`, columns };
          setCatalog([source]);
          const validColumns = kind === "metric" ? [columns[0]?.code].filter((column): column is string => !!column)
            : selectedColumns.filter((code) => columns.some((column) => column.code === code)).slice(0, 12);
          const chosenColumns = validColumns.length > 0 ? validColumns : columns.slice(0, 5).map((column) => column.code);
          setResult({
            columns: columns.filter((column) => chosenColumns.includes(column.code)),
            rows: data.items.map((item) => ({ id: item.id, ...item.values })), page: 1,
            pageSize: kind === "metric" ? 1 : MAX_ROWS, totalCount: data.total,
          });
          setStatus("ready");
          return;
        }
        const sources = await api<ReportCatalog>("/api/reports/catalog", token);
        if (!active) return;
        const source = Array.isArray(sources) ? sources.find((item) => item.code === sourceCode) : undefined;
        setCatalog(Array.isArray(sources) ? sources : []);
        if (!source || !Array.isArray(source.columns) || source.columns.length === 0) {
          throw new Error("Seçilen veri kaynağı artık kullanılamıyor.");
        }

        const validColumns = kind === "metric"
          ? [source.columns[0].code]
          : selectedColumns.filter((code) => source.columns.some((column) => column.code === code)).slice(0, 12);
        const requestColumns = validColumns.length > 0 ? validColumns : source.columns.slice(0, 5).map((column) => column.code);
        const report = await api<ReportResult>("/api/reports/run", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: sourceCode,
            columns: requestColumns,
            filters: [],
            sortBy: requestColumns[0],
            descending: false,
            page: 1,
            pageSize: kind === "metric" ? 1 : MAX_ROWS,
          }),
        });
        if (!active) return;
        setResult(report);
        setStatus("ready");
      } catch (cause) {
        if (!active) return;
        setError((cause as Error)?.message || "Veri yüklenemedi.");
        setStatus("error");
      }
    })();

    return () => { active = false; };
  }, [sourceCode, kind, selectedColumns.join("\u001f"), token, attempt]);

  if (kind === "metric") {
    const value = result ? new Intl.NumberFormat("tr-TR").format(result.totalCount) : fallbackValue || "—";
    return <article className={`tenant-page-metric tenant-page-report-widget ${status === "error" ? "is-error" : ""}`} style={style}>
      {title && <span>{title}</span>}
      {status === "loading" ? <strong className="tenant-report-status" role="status">Yükleniyor…</strong>
        : status === "error" ? <div className="tenant-report-error" role="alert"><span>{error}</span><button type="button" onClick={() => setAttempt((value) => value + 1)}>Yeniden dene</button></div>
          : !sourceCode ? <strong className="tenant-report-unbound">{value}</strong>
            : <strong>{value}</strong>}
      {description && <small>{description}</small>}
      {sourceCode && status === "ready" && result && <small className="tenant-report-source">{catalog.find((item) => item.code === sourceCode)?.label || sourceCode}</small>}
    </article>;
  }

  const resultColumns = result?.columns ?? [];
  const rows = result?.rows ?? [];
  return <section className={`tenant-page-block tenant-page-table tenant-page-report-widget ${status === "error" ? "is-error" : ""}`} style={style}>
    {title && <h3>{title}</h3>}
    {description && <p>{description}</p>}
    {!sourceCode ? <p className="tenant-report-unbound">Bu tablo için veri kaynağı seçilmemiş.</p>
      : status === "loading" ? <div className="tenant-report-state" role="status">Veriler yükleniyor…</div>
        : status === "error" ? <div className="tenant-report-error" role="alert"><span>{error}</span><button type="button" onClick={() => setAttempt((value) => value + 1)}>Yeniden dene</button></div>
          : <div className="tenant-page-table-scroll"><table>
              <thead><tr>{resultColumns.map((column) => <th scope="col" key={column.code}>{column.label || column.code}</th>)}{rowActionsEnabled && <th scope="col">İşlemler</th>}</tr></thead>
              <tbody>{rows.length === 0 && <tr><td colSpan={resultColumns.length + (rowActionsEnabled ? 1 : 0)} className="tenant-report-state">Gösterilecek kayıt bulunamadı.</td></tr>}{rows.slice(0, MAX_ROWS).map((row, rowIndex) => <tr key={String(row.id ?? row.code ?? rowIndex)}>
                {resultColumns.map((column) => <td key={column.code}>{displayValue(row[column.code])}</td>)}
                {rowActionsEnabled && <td>{rowActionWorkflowId
                  ? <TenantReportRowAction token={token} workflowId={rowActionWorkflowId} label={rowActionLabel || "İşlemi başlat"} pageCode={pageCode} componentId={componentId} sourceCode={sourceCode} row={row} />
                  : <span className="tenant-report-unbound">İş akışı bağlanmadı</span>}</td>}
              </tr>)}</tbody>
            </table></div>}
    {sourceCode && status === "ready" && result && <footer className="tenant-report-footer">
      <span>{catalog.find((item) => item.code === sourceCode)?.label || sourceCode}</span>
      <span>{Math.min(rows.length, MAX_ROWS)} / {result.totalCount.toLocaleString("tr-TR")} kayıt</span>
    </footer>}
  </section>;
}

function TenantReportRowAction({ token, workflowId, label, pageCode, componentId, sourceCode, row }: {
  token: string; workflowId: string; label: string; pageCode: string; componentId: string; sourceCode: string; row: Record<string, unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const recordId = typeof row.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) ? row.id : undefined;
  const rowTitle = [row.name, row.code, row.title].find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const start = async () => {
    if (busy) return;
    setBusy(true); setFailed(false); setMessage("");
    try {
      await api(`/api/workflows/definitions/${encodeURIComponent(workflowId)}/instances`, token, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: "General", subjectTitle: (rowTitle || `Kayıt ${String(row.id ?? "")}`).slice(0, 160), subjectId: recordId ?? null,
          context: { pageCode, componentId, action: "low-code-row-action", source: sourceCode, recordId: String(row.id ?? "") },
        }),
      });
      setMessage("Başlatıldı.");
    } catch (cause) { setFailed(true); setMessage((cause as Error).message || "İşlem başlatılamadı."); }
    finally { setBusy(false); }
  };
  return <div className="tenant-report-row-action"><button type="button" className="tenant-page-button" onClick={() => void start()} disabled={busy}>{busy ? "Başlatılıyor…" : label}</button>{message && <small role={failed ? "alert" : "status"} className={failed ? "is-error" : "is-success"}>{message}</small>}</div>;
}
