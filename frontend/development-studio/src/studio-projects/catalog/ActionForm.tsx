import { useState } from "react";
import { Save } from "lucide-react";
import { WorkspaceCodeEditor } from "../../WorkspaceCodeEditor";
import type { ErpOperation } from "../../platform-tools/erp-src/page-designer/erpOperations";
import type { CatalogEntry, CatalogFile } from "./catalogFiles";
import { ParameterTable } from "./DataSourceForm";
import {
  parametersJson, readParameters, readSource, saveEntry, usableOperations, validateEntry,
  type ParameterRow, type SourceKind,
} from "./catalogFormModel";

export type ActionFormProps = {
  root: string;
  /** null: yeni eylem */
  entry: CatalogEntry | null;
  existingCodes: string[];
  canEdit: boolean;
  operations: ErpOperation[] | null;
  writeFiles: (files: CatalogFile[]) => Promise<void>;
  onSaved?: (code: string) => void;
};

const KINDS = [["insert", "Ekle"], ["update", "Güncelle"], ["delete", "Sil"]] as const;
const TARGETS: [string, string][] = [["row", "Satır"], ["page", "Sayfa"]];

export function ActionForm({ root, entry, existingCodes, canEdit, operations, writeFiles, onSaved }: ActionFormProps) {
  const json = entry?.json ?? {};
  const initialSource = readSource(json.run);
  const initialConfirm = json.confirm && typeof json.confirm === "object" ? (json.confirm as { text?: unknown }).text : undefined;
  const [label, setLabel] = useState(typeof json.label === "string" ? json.label : "");
  const [code, setCode] = useState(entry?.code ?? "");
  const [kind, setKind] = useState(typeof json.kind === "string" ? json.kind : "update");
  const [target, setTarget] = useState(typeof json.target === "string" ? json.target : "row");
  const [sourceKind, setSourceKind] = useState<SourceKind>(initialSource.kind);
  const [operation, setOperation] = useState(initialSource.operation);
  const [sql, setSql] = useState(entry?.sql ?? "");
  const [parameters, setParameters] = useState<ParameterRow[]>(() => readParameters(json));
  const [confirmText, setConfirmText] = useState(typeof initialConfirm === "string" ? initialConfirm : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isNew = entry === null;
  const locked = !canEdit || busy;
  const kindOperations = usableOperations(operations, kind);
  // Depodaki öğe başka bir hedef (ör. bulk) kullanıyorsa seçenek kaybolmasın.
  const targets = TARGETS.some(([value]) => value === target) ? TARGETS : [...TARGETS, [target, target] as [string, string]];

  function currentEntry(): CatalogEntry {
    const base = { ...json };
    delete base.parameters;
    delete base.confirm;
    const next: Record<string, unknown> = {
      ...base, code, label: label.trim(), kind, target,
      run: sourceKind === "sql" ? { sql: `${code}.sql` } : { erpOperation: operation },
    };
    if (sourceKind === "sql" && parameters.length) next.parameters = parametersJson(parameters);
    if (confirmText.trim()) next.confirm = { text: confirmText.trim() };
    const ordered: Record<string, unknown> = {};
    for (const key of ["code", "label", "kind", "target", "run", "parameters", "columns", "opens", "confirm"]) if (key in next) ordered[key] = next[key];
    for (const key of Object.keys(next)) if (!(key in ordered)) ordered[key] = next[key];
    const dir = `${root}/eylemler`;
    return {
      kind: "action", code, jsonPath: `${dir}/${code}.json`,
      sqlPath: sourceKind === "sql" ? `${dir}/${code}.sql` : null,
      json: ordered, sql: sourceKind === "sql" ? sql : null,
    };
  }

  async function save() {
    const problem = validateEntry(code, label, isNew, existingCodes, sourceKind, sql, operation);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const outcome = await saveEntry(root, currentEntry(), writeFiles);
      if (outcome === "cancelled") return;
      if (outcome) { setError(outcome); return; }
      setNotice("Kaydedildi. Yayınlamak için önce değişiklikleri commit edin.");
      onSaved?.(code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-cw-form">
      <div className="sp-cw-card">
        <h3>{label || (isNew ? "Yeni eylem" : code)}</h3>
        <p className="sp-cw-desc">Eylem · danışmanın düğmelerine bağlanır</p>
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
            <span className="ns-field-label">Tür</span>
            <select aria-label="Tür" value={kind} disabled={locked} onChange={e => { setKind(e.target.value); setOperation(""); }}>
              {KINDS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <label className="ns-field">
            <span className="ns-field-label">Hedef</span>
            <select aria-label="Hedef" value={target} disabled={locked} onChange={e => setTarget(e.target.value)}>
              {targets.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
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
            <span className="ns-field-label">Komut · eylemler/{code || "<kod>"}.sql</span>
            <div className="sp-cw-editor">
              <WorkspaceCodeEditor path={`${root}/eylemler/${code || "yeni"}.sql`} value={sql} readOnly={locked} onChange={setSql} />
            </div>
          </>
        ) : (
          <label className="ns-field">
            <span className="ns-field-label">ERP işlemi</span>
            <select aria-label="ERP işlemi" value={operation} disabled={locked || operations === null} onChange={e => setOperation(e.target.value)}>
              <option value="">{operations === null ? "ERP işlem listesi alınamadı." : "İşlem seçin"}</option>
              {kindOperations.map(op => <option key={op.name} value={op.name}>{op.label} ({op.module})</option>)}
            </select>
          </label>
        )}
        <label className="ns-field">
          <span className="ns-field-label">Onay metni (boş bırakılırsa onay sorulmaz)</span>
          <input aria-label="Onay metni" value={confirmText} maxLength={200} disabled={locked} onChange={e => setConfirmText(e.target.value)} />
        </label>
      </div>
      {sourceKind === "sql" && <ParameterTable rows={parameters} disabled={locked} withTrial={false} onChange={setParameters} />}
      <div className="sp-cw-bar sp-cw-save">
        <button type="button" className="ns-btn ns-btn-primary" disabled={locked} onClick={() => void save()}>
          <Save size={14} /> Kaydet
        </button>
        {!canEdit && <span className="sp-cw-hint">Bu projede düzenleme yetkiniz yok.</span>}
      </div>
    </div>
  );
}
