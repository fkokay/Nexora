import { useRef, useState } from "react";
import { Play, Plus, Save, Trash2 } from "lucide-react";
import { WorkspaceCodeEditor } from "../../WorkspaceCodeEditor";
import type { ErpOperation } from "../../platform-tools/erp-src/page-designer/erpOperations";
import { buildBundle, toCatalogColumnType, type CatalogEntry } from "./catalogFiles";
import { runPreview, storePreview, type PreviewResult } from "./catalogApi";
import {
  TYPE_LABELS, VALUE_TYPES, columnsJson, parametersJson, readColumns, readParameters, readSource, saveEntry, type WriteCatalogFiles,
  trialValues, usableOperations, validateEntry, type ColumnRow, type ParameterRow, type SourceKind,
} from "./catalogFormModel";

export type DataSourceFormProps = {
  root: string;
  /** null: yeni veri kaynağı */
  entry: CatalogEntry | null;
  existingCodes: string[];
  canEdit: boolean;
  isTenantAdmin: boolean;
  token: string;
  operations: ErpOperation[] | null;
  writeFiles: WriteCatalogFiles;
  /** Dosya yolu → sha256; form açıldığında kopyalanır ve kayıtta beklenen sha olarak gönderilir. */
  fileShas?: Record<string, string>;
  onSaved?: (code: string) => void;
};

const PREVIEW_ROWS = 50;
const errorText = (error: unknown) => (error instanceof Error ? error.message : "İşlem tamamlanamadı.");

function cell(row: unknown, index: number, code: string): string {
  const value = Array.isArray(row) ? row[index] : (row as Record<string, unknown> | null)?.[code];
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function TypeSelect({ value, label, disabled, onChange }: { value: string; label: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {VALUE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
    </select>
  );
}

export function ParameterTable({ rows, disabled, withTrial, onChange }: {
  rows: ParameterRow[]; disabled: boolean; withTrial: boolean; onChange: (rows: ParameterRow[]) => void;
}) {
  const update = (index: number, patch: Partial<ParameterRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <div className="sp-cw-card">
      <h3>Parametreler</h3>
      <p className="sp-cw-desc">Sorgudaki @ad parametreleri; adlar birebir aynı yazılmalıdır.</p>
      {rows.length > 0 && (
        <table className="sp-cw-table">
          <thead><tr><th>Ad</th><th>Tip</th>{withTrial && <th>Deneme değeri</th>}<th aria-label="İşlem" /></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td><input aria-label="Parametre adı" className="ns-mono" value={row.name} disabled={disabled} onChange={e => update(index, { name: e.target.value })} /></td>
                <td><TypeSelect label="Parametre tipi" value={row.type} disabled={disabled} onChange={type => update(index, { type })} /></td>
                {withTrial && (
                  <td>
                    {row.type === "bool" ? (
                      <select aria-label="Deneme değeri" value={row.trial} onChange={e => update(index, { trial: e.target.value })}>
                        <option value="">(boş)</option><option value="true">Evet</option><option value="false">Hayır</option>
                      </select>
                    ) : (
                      <input aria-label="Deneme değeri" value={row.trial} placeholder={row.type === "date" ? "yyyy-aa-gg" : ""} onChange={e => update(index, { trial: e.target.value })} />
                    )}
                  </td>
                )}
                <td>
                  <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" aria-label="Parametreyi sil" disabled={disabled} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="ns-btn ns-btn-sm" disabled={disabled} onClick={() => onChange([...rows, { name: "", type: "text", trial: "" }])}>
        <Plus size={14} /> Parametre ekle
      </button>
    </div>
  );
}

export function DataSourceForm({ root, entry, existingCodes, canEdit, isTenantAdmin, token, operations, writeFiles, onSaved, fileShas = {} }: DataSourceFormProps) {
  const json = entry?.json ?? {};
  const initialSource = readSource(json.source);
  const [label, setLabel] = useState(typeof json.label === "string" ? json.label : "");
  const [code, setCode] = useState(entry?.code ?? "");
  const [sourceKind, setSourceKind] = useState<SourceKind>(initialSource.kind);
  const [operation, setOperation] = useState(initialSource.operation);
  const [sql, setSql] = useState(entry?.sql ?? "");
  const [parameters, setParameters] = useState<ParameterRow[]>(() => readParameters(json));
  const [columns, setColumns] = useState<ColumnRow[]>(() => readColumns(json));
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const seededShas = useRef<Record<string, string>>({ ...fileShas });
  const isNew = entry === null;
  const locked = !canEdit || busy;
  const readOperations = usableOperations(operations, "read");

  function currentEntry(): CatalogEntry {
    const base = { ...json };
    delete base.parameters;
    const next: Record<string, unknown> = {
      ...base,
      code,
      label: label.trim(),
      source: sourceKind === "sql" ? { sql: `${code}.sql` } : { erpOperation: operation },
      columns: columnsJson(columns),
    };
    if (sourceKind === "sql" && parameters.length) next.parameters = parametersJson(parameters);
    const ordered: Record<string, unknown> = {};
    for (const key of ["code", "label", "source", "parameters", "columns", "opens"]) if (key in next) ordered[key] = next[key];
    for (const key of Object.keys(next)) if (!(key in ordered)) ordered[key] = next[key];
    const dir = `${root}/veri`;
    return {
      kind: "dataSource", code, jsonPath: `${dir}/${code}.json`,
      sqlPath: sourceKind === "sql" ? `${dir}/${code}.sql` : null,
      json: ordered, sql: sourceKind === "sql" ? sql : null,
    };
  }

  const invalid = () => validateEntry(code, label, isNew, existingCodes, sourceKind, sql, operation);

  async function preview() {
    if (!isTenantAdmin || sourceKind !== "sql") return;
    const problem = invalid();
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { id } = await storePreview(token, buildBundle([currentEntry()]));
      const next = await runPreview(token, id, code, trialValues(parameters));
      setResult(next);
      setColumns(current => {
        const known = new Set(current.map(c => c.code.toLowerCase()));
        const added = next.columns
          .filter(c => !known.has(c.code.toLowerCase()))
          .map(c => ({ code: c.code, label: c.label || c.code, type: toCatalogColumnType(c.dataType), key: false, isNew: true }));
        return [...current, ...added];
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const problem = invalid();
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const outcome = await saveEntry(root, currentEntry(), writeFiles, seededShas.current);
      if (outcome === "cancelled") return;
      if (outcome) { setError(outcome); return; }
      setNotice("Kaydedildi. Yayınlamak için önce değişiklikleri commit edin.");
      onSaved?.(code);
    } finally {
      setBusy(false);
    }
  }

  const updateColumn = (index: number, patch: Partial<ColumnRow>) => setColumns(rows => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const selectedOperation = readOperations.find(op => op.name === operation);
  const rows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <div className="sp-cw-form">
      <div className="sp-cw-card">
        <h3>{label || (isNew ? "Yeni veri kaynağı" : code)}</h3>
        <p className="sp-cw-desc">Veri kaynağı · danışmanın "Ne listelensin?" listesinde bu adla görünür</p>
        {error && <div className="alert" role="alert">{error}</div>}
        {notice && <p className="sp-cw-notice" role="status">{notice}</p>}
        <div className="sp-cw-grid">
          <label className="ns-field">
            <span className="ns-field-label">Danışmanın göreceği ad</span>
            <input aria-label="Görünen ad" value={label} maxLength={100} disabled={locked} onChange={e => setLabel(e.target.value)} />
          </label>
          <label className="ns-field">
            <span className="ns-field-label">Kod</span>
            <input aria-label="Kod" className="ns-mono" value={code} maxLength={64} disabled={!isNew || locked} onChange={e => setCode(e.target.value)} />
          </label>
          <label className="ns-field">
            <span className="ns-field-label">Kaynak</span>
            <select aria-label="Kaynak" value={sourceKind} disabled={locked} onChange={e => setSourceKind(e.target.value as SourceKind)}>
              <option value="sql">SQL</option>
              <option value="erp">ERP işlemi</option>
            </select>
          </label>
        </div>
        {sourceKind === "sql" ? (
          <>
            <span className="ns-field-label">Sorgu · veri/{code || "<kod>"}.sql</span>
            <div className="sp-cw-editor">
              <WorkspaceCodeEditor path={`${root}/veri/${code || "yeni"}.sql`} value={sql} readOnly={locked} onChange={setSql} />
            </div>
            <div className="sp-cw-bar">
              <button type="button" className="ns-btn sp-cw-dev" disabled={!isTenantAdmin || busy} onClick={() => void preview()}>
                <Play size={14} /> Önizle
              </button>
              <span className="sp-cw-hint">
                {isTenantAdmin ? `Firma verisiyle okuma oturumunda çalışır · en fazla ${PREVIEW_ROWS} satır` : "Yalnızca firma yöneticisi önizleyebilir."}
              </span>
            </div>
            {result && (
              <div className="sp-cw-result">
                <table className="sp-cw-table">
                  <thead><tr>{result.columns.map(c => <th key={c.code}>{c.code}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((row, r) => (
                      <tr key={r}>{result.columns.map((c, i) => <td key={c.code}>{cell(row, i, c.code)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && <p className="sp-cw-hint">Sorgu satır döndürmedi.</p>}
                {result.truncated && <p className="sp-cw-hint">İlk {PREVIEW_ROWS} satır gösteriliyor.</p>}
              </div>
            )}
          </>
        ) : (
          <label className="ns-field">
            <span className="ns-field-label">ERP işlemi</span>
            <select aria-label="ERP işlemi" value={operation} disabled={locked || operations === null} onChange={e => setOperation(e.target.value)}>
              <option value="">{operations === null ? "ERP işlem listesi alınamadı." : "İşlem seçin"}</option>
              {readOperations.map(op => <option key={op.name} value={op.name}>{op.label} ({op.module})</option>)}
            </select>
            {selectedOperation && selectedOperation.parameters.length > 0 && (
              <span className="sp-cw-hint">Parametreler işlemden gelir: {selectedOperation.parameters.map(p => p.name).join(", ")}</span>
            )}
          </label>
        )}
      </div>
      {sourceKind === "sql" && <ParameterTable rows={parameters} disabled={locked} withTrial onChange={setParameters} />}
      <div className="sp-cw-card">
        <h3>Kolonlar</h3>
        <p className="sp-cw-desc">Önizle sorgudaki yeni kolonları ekler. Danışmanın göreceği adı ve türü burada düzeltin.</p>
        <table className="sp-cw-table sp-cw-columns">
          <thead><tr><th>Kod</th><th>Danışmanın göreceği ad</th><th>Tip</th><th>Anahtar</th><th aria-label="İşlem" /></tr></thead>
          <tbody>
            {columns.map((column, index) => (
              <tr key={index} className={column.isNew ? "is-new" : undefined}>
                <td>
                  <input aria-label="Kolon kodu" className="ns-mono" value={column.code} disabled={locked} onChange={e => updateColumn(index, { code: e.target.value })} />
                  {column.isNew && <span className="sp-cw-tag">yeni</span>}
                </td>
                <td><input aria-label="Kolon görünen adı" value={column.label} disabled={locked} onChange={e => updateColumn(index, { label: e.target.value })} /></td>
                <td><TypeSelect label="Kolon tipi" value={column.type} disabled={locked} onChange={type => updateColumn(index, { type })} /></td>
                <td><input type="checkbox" aria-label="Anahtar" checked={column.key} disabled={locked} onChange={e => updateColumn(index, { key: e.target.checked })} /></td>
                <td>
                  <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" aria-label="Kolonu sil" disabled={locked} onClick={() => setColumns(rows => rows.filter((_, i) => i !== index))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ns-btn ns-btn-sm" disabled={locked} onClick={() => setColumns(rows => [...rows, { code: "", label: "", type: "text", key: false, isNew: false }])}>
          <Plus size={14} /> Kolon ekle
        </button>
      </div>
      <div className="sp-cw-bar sp-cw-save">
        <button type="button" className="ns-btn ns-btn-primary" disabled={locked} onClick={() => void save()}>
          <Save size={14} /> Kaydet
        </button>
        {!canEdit && <span className="sp-cw-hint">Bu projede düzenleme yetkiniz yok.</span>}
      </div>
    </div>
  );
}
