import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";
import type { BindingSuggestion } from "./BindingInput";
import type { SqlSchemaTable } from "./SqlQueryEditor";
import { MAX_QUERIES, QueryDetailFields, catalogReference, QueryResultTable, isOperationQuery, isWriteKind, nameProblem, queryKindLabels, queryRunBlockedReason, type PageQuery, type PageQueryParameter, type QueryKind, type QueryPreview } from "./QueriesPanel";
import { findOperation, unboundRequiredParameter, type ErpCatalog, type ErpOperation } from "./erpOperations";
import type { CatalogRefs } from "./catalogItems";
import { applyQueryPatch, freeQueryName, newDraftQuery } from "./queryDraft";
import type { SourceColumn } from "./columnEditing";
import { useDesignerModal } from "./designerModals";
import "./page-designer-extras.css";

/** Alanın sorguya bağlanma yaması: seçilen sorgu (ve önerilen sütunlar) için bileşen özellikleri. */
export type QueryBinder = (query: PageQuery, columns: SourceColumn[]) => Record<string, unknown>;
export type QueryFieldRequest = { kinds: QueryKind[]; target: string; queryId: string | null; componentId: string; bind: QueryBinder };

type QueryEditorApi = { open: (request: QueryFieldRequest) => void; queries: PageQuery[]; createBlocked: string | null };
const QueryEditorContext = createContext<QueryEditorApi | null>(null);
export const QueryEditorProvider = ({ value, children }: { value: QueryEditorApi; children: ReactNode }) => <QueryEditorContext.Provider value={value}>{children}</QueryEditorContext.Provider>;

export const READ_KINDS: QueryKind[] = ["read"];
export const WRITE_KINDS: QueryKind[] = ["insert", "update", "delete"];
export const ALL_KINDS: QueryKind[] = ["read", "insert", "update", "delete"];

/**
 * Sorgu seçilen her alanın yanındaki "＋ Yeni sorgu" ve "✎ Düzenle" düğmeleri. Düzenle yalnız seçili sorgu alanın
 * kabul ettiği türdeyse açılır; sağlayıcı yoksa (ör. salt okunur görünüm) hiçbir şey çizilmez.
 */
export function QueryFieldActions({ kinds, target, value, componentId, bind, disabled }: { kinds: QueryKind[]; target: string; value?: string | null; componentId: string; bind: QueryBinder; disabled?: boolean }) {
  const api = useContext(QueryEditorContext);
  if (!api) return null;
  const selected = value ? api.queries.find((query) => query.id === value) : undefined;
  const editable = !!selected && kinds.includes(selected.kind);
  return <span className="pd-qfa">
    <button type="button" className="pd-button small" disabled={disabled || !!api.createBlocked} title={api.createBlocked ?? `Yeni sorgu · ${target} için`}
      onClick={() => api.open({ kinds, target, queryId: null, componentId, bind })}>＋ Yeni sorgu</button>
    <button type="button" className="pd-button small" disabled={!editable} title={editable ? `${selected!.name} sorgusunu düzenle` : "Önce bir sorgu seçin."}
      onClick={() => { if (selected) api.open({ kinds, target, queryId: selected.id, componentId, bind }); }}>✎ Düzenle</button>
  </span>;
}

export type QueryEditorEnv = {
  queries: PageQuery[];
  catalog: ErpCatalog;
  catalogRefs: CatalogRefs;
  /** TenantAdmin: SQL'e dayanan katalog öğelerini yalnız o bağlayabilir. */
  isAdmin: boolean;
  schema: SqlSchemaTable[];
  suggestions: BindingSuggestion[];
  components: { type: string; name?: string; props?: Record<string, unknown> }[];
  /** Sorgu ekleme/düzenleme yetkisi (Sorgular sekmesiyle aynı: yalnız tenant yöneticisi, taslakta). */
  editable: boolean;
  readOnlyReason: string | null;
  previewBlockedReason: string | null;
  previews: Record<string, QueryPreview>;
  takenNames: (exceptQueryId: string | null) => string[];
  defaultBinding: (name: string) => string;
  /** ERP okuma işlemini yerel taslakla çalıştırır (taslak kaydı gerekmez). */
  runOperation: (query: PageQuery) => Promise<void>;
  /** SQL önizlemesi kayıtlı taslağı çalıştırır: sorgu sayfaya işlenir (bağlanmadan), taslak kaydedilir, çalıştırılır. */
  runSql: (query: PageQuery) => Promise<void>;
  /** Vazgeç: önizleme için sayfaya işlenen sorguyu eski haline (yeni sorguysa kaldırarak) döndürür. */
  revert: (original: PageQuery | null, id: string) => void;
  /** Kaydet ve bağla: sorgu eklenir/güncellenir ve alan aynı geri alma adımında bağlanır. */
  save: (query: PageQuery, componentId: string, patch: Record<string, unknown>) => void;
  onAddSourceQuery: (operation: ErpOperation) => void;
};

type DialogState = { request: QueryFieldRequest; draft: PageQuery; original: PageQuery | null; ran: boolean; committedForPreview: boolean };

/** Sayfa tasarımcısının sorgu penceresi: `api` bağlamı sağlar, `dialog` sayfanın köküne çizilir. */
export function useQueryEditor(env: QueryEditorEnv): { api: QueryEditorApi; dialog: ReactNode } {
  const [state, setState] = useState<DialogState | null>(null);
  const memory = useRef(new Map<string, PageQueryParameter>());
  const createBlocked = !env.editable ? (env.readOnlyReason ?? "Sorguları yalnız tenant yöneticisi ekleyip düzenleyebilir.")
    : env.queries.length >= MAX_QUERIES ? `Bir sayfada en fazla ${MAX_QUERIES} sorgu olabilir.` : null;
  const open = (request: QueryFieldRequest) => {
    memory.current = new Map();
    const existing = request.queryId ? env.queries.find((query) => query.id === request.queryId) ?? null : null;
    if (!existing && createBlocked) return;
    const draft = existing ? { ...existing, parameters: existing.parameters.map((parameter) => ({ ...parameter })) }
      : newDraftQuery(`q-${crypto.randomUUID().slice(0, 8)}`, freeQueryName("sorgu", env.takenNames(null)), request.kinds, env.catalog.status === "ready" && request.kinds.includes("read"));
    setState({ request, draft, original: existing, ran: false, committedForPreview: false });
  };
  const api: QueryEditorApi = { open, queries: env.queries, createBlocked };
  return { api, dialog: state ? <QueryEditorDialog key={state.draft.id} env={env} state={state} setState={setState} memory={memory.current}/> : null };
}

function QueryEditorDialog({ env, state, setState, memory }: { env: QueryEditorEnv; state: DialogState; setState: (next: DialogState | null | ((current: DialogState | null) => DialogState | null)) => void; memory: Map<string, PageQueryParameter> }) {
  const ref = useRef<HTMLElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { request, draft, original } = state;
  const isNew = !original;
  const cancel = () => {
    if (state.committedForPreview) env.revert(original, draft.id);
    setState(null);
  };
  useDesignerModal("query", true, ref, cancel);
  const update = (patch: Partial<PageQuery>) => setState((current) => current && { ...current, draft: applyQueryPatch(current.draft, patch, memory, env.defaultBinding) });
  const write = isWriteKind(draft.kind);
  const op = isOperationQuery(draft) ? findOperation(env.catalog, draft.operation) : undefined;
  const runBlocked = write ? "Önizleme okuma sorgularında çalışır; yazma işlemleri önizlenmez." : queryRunBlockedReason(draft, env.catalog, env.previewBlockedReason);
  const taken = env.takenNames(isNew ? null : draft.id);
  const saveProblem = !env.editable ? (env.readOnlyReason ?? "Sorguları yalnız tenant yöneticisi ekleyip düzenleyebilir.")
    : nameProblem(draft.name, taken)
      ?? (!request.kinds.includes(draft.kind) ? `Bu alan yalnız ${request.kinds.map((kind) => queryKindLabels[kind]).join(" / ")} sorgusu kabul eder.` : null)
      ?? (catalogReference(draft) !== undefined ? (catalogReference(draft) === "" ? "Önce katalogdan bir öğe seçin." : null)
        : isOperationQuery(draft) ? (!draft.operation ? "Önce bir ERP işlemi seçin." : op ? (unboundRequiredParameter(op, draft.parameters) ? `Zorunlu parametre bağlanmadı: ${unboundRequiredParameter(op, draft.parameters)}` : null) : null)
        : (draft.sql ?? "").trim() === "" ? "SQL metni boş olamaz." : null)
      ?? (isNew && env.queries.length >= MAX_QUERIES && !state.committedForPreview ? `Bir sayfada en fazla ${MAX_QUERIES} sorgu olabilir.` : null);
  const preview = state.ran || !isNew ? env.previews[draft.id] : undefined;
  const run = async () => {
    if (runBlocked || running) return;
    setRunning(true); setError("");
    try {
      if (isOperationQuery(draft)) await env.runOperation(draft);
      else { setState((current) => current && { ...current, committedForPreview: true }); await env.runSql(draft); }
      setState((current) => current && { ...current, ran: true });
    } catch (failure) { setError((failure as Error).message); }
    finally { setRunning(false); }
  };
  const saveAndBind = () => {
    if (saveProblem) return;
    const resultColumns: SourceColumn[] = env.previews[draft.id]?.columns ?? op?.result.columns ?? [];
    env.save(draft, request.componentId, request.bind(draft, resultColumns));
    setState(null);
  };
  return createPortal(<div className="pd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
    <section ref={ref} className="pd-modal pd-query-modal" role="dialog" aria-modal="true" aria-label={isNew ? `Yeni sorgu · ${request.target} için` : `Sorguyu düzenle · ${draft.name}`} data-pd-modal="query" tabIndex={-1}>
      <header className="pd-modal-head"><b>{isNew ? `Yeni sorgu · ${request.target} için` : `Sorguyu düzenle · ${original?.name ?? draft.name}`}</b>
        <button type="button" className="pd-icon-button" aria-label="Kapat" onClick={cancel}><X size={15}/></button></header>
      <div className="pd-modal-body pd-query-panel">
        {!env.editable && <p className="pd-query-readonly">{env.readOnlyReason ?? "Sorguları yalnız tenant yöneticisi ekleyip düzenleyebilir; bu pencereyi salt okunur görüyorsunuz."}</p>}
        <QueryDetailFields query={draft} queries={env.queries} editable={env.editable} schema={env.schema} suggestions={env.suggestions} takenNames={taken}
          onUpdate={update} catalog={env.catalog} catalogRefs={env.catalogRefs} isAdmin={env.isAdmin} onAddSourceQuery={env.onAddSourceQuery} components={env.components} allowedKinds={request.kinds}/>
        {error && <div className="pd-query-error" role="alert">{error}</div>}
        {!write && preview && <QueryResultTable preview={preview}/>}
        <small className="pd-query-muted">Önizleme okuma sorgularında çalışır; yazma işlemleri önizlenmez.{!isOperationQuery(draft) && !write ? " SQL önizlemesi taslağı kaydeder." : ""}</small>
      </div>
      <footer className="pd-modal-foot">
        {saveProblem && env.editable && <small className="pd-query-warning pd-modal-foot-note">{saveProblem}</small>}
        <button type="button" className="pd-button small" onClick={cancel}>Vazgeç</button>
        <button type="button" className="pd-button small" disabled={!env.editable || !!runBlocked || running} title={runBlocked ?? undefined} onClick={() => void run()}><Play size={13}/>{running ? "Çalışıyor…" : "Çalıştır ve önizle"}</button>
        <button type="button" className="pd-button small primary" disabled={!!saveProblem} title={saveProblem ?? undefined} onClick={saveAndBind}>Kaydet ve bağla</button>
      </footer>
    </section>
  </div>, document.body);
}
