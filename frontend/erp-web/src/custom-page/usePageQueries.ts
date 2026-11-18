import { useEffect, useRef, useState } from "react";
import { api } from "../erpApi";
import { bindingPath, coerceParameter, queryOrder, resolvePath, type PageScope } from "./pageBindings";
import { buildOperationRequest, fieldErrorsByParameter, mapOperationResult, missingRouteValue, sourceRecordError, type ErpOperation, type OperationRequest } from "./erpOperations";

export type PageQueryDefinition = {
  id: string; name: string; runOn: "load" | "manual"; kind: "read" | "insert" | "update" | "delete";
  parameters: { name: string; binding: string; type: string }[];
  /** SQL yerine çağrılacak ERP işlemi (`modul.nesne.eylem`); yol ve yöntem yalnız sunucu kataloğundan gelir. */
  operation?: string;
};
export type QueryColumn = { code: string; label: string; dataType?: string };
export type QueryState = {
  rows: Record<string, unknown>[]; rowCount: number; columns: QueryColumn[]; truncated: boolean; loading: boolean; error: string;
  /** Sorgu en az bir kez yanıt (sonuç ya da hata) aldı mı; elle çalışan ve hiç çalışmamış sorguyu boş sonuçtan ayırır. */
  ran: boolean;
  /** ERP yazma işleminin JSON yanıtı; `{{sorgu.sonuc.alan}}` ile bağlanabilir. */
  sonuc?: unknown;
  /** ERP işleminin sunucu doğrulama hataları (işlem parametre adına göre). */
  fieldErrors?: Record<string, string>;
};
/** ERP yazma işleminde `sonuc` sunucunun JSON yanıtıdır (SQL yazmalarında yoktur). */
export type WriteResult = { affectedRows: number; sonuc?: unknown };
type RunResult = { columns?: QueryColumn[]; rows?: Record<string, unknown>[]; rowCount?: number; truncated?: boolean };

export const QUERY_DEBOUNCE_MS = 300;
const emptyState = (loading: boolean): QueryState => ({ rows: [], rowCount: 0, columns: [], truncated: false, loading, error: "", ran: false });

/** v2 sayfa tanımındaki `queries` dizisini savunmacı biçimde okur; okunamayan girdiler atlanır. */
export function readPageQueries(definition: unknown): PageQueryDefinition[] {
  const raw = (definition as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(raw)) return [];
  const result: PageQueryDefinition[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string") continue;
    const kind = item.kind;
    if (kind !== "read" && kind !== "insert" && kind !== "update" && kind !== "delete") continue;
    const parameters = Array.isArray(item.parameters) ? (item.parameters as Record<string, unknown>[])
      .filter((p) => p && typeof p.name === "string" && typeof p.binding === "string" && typeof p.type === "string")
      .map((p) => ({ name: p.name as string, binding: p.binding as string, type: p.type as string })) : [];
    result.push({ id: item.id, name: item.name, runOn: kind !== "read" || item.runOn === "manual" ? "manual" : "load", kind, parameters,
      ...(typeof item.operation === "string" ? { operation: item.operation } : {}) });
  }
  return result;
}

/** Sorgu parametrelerini bağlama kapsamından çözer (okuma ve yazma çağrıları aynı yolu kullanır). */
export function resolveQueryParameters(query: PageQueryDefinition, scope: PageScope): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const parameter of query.parameters) {
    const path = bindingPath(parameter.binding);
    values[parameter.name] = path ? coerceParameter(resolvePath(scope, path), parameter.type) : null;
  }
  return values;
}

/**
 * Okuma sorgularını bağımlılık sırasıyla çalıştırır. `runOn: "load"` sorgular sayfa açılınca çalışır; parametrelerinin
 * çözülmüş değerleri değişince 300 ms bekleyip yeniden çalışır. Yüklenmekte olan bir sorguya bağlı sorgu bekler.
 * `buildScope` sorgu durumlarından tam bağlama kapsamını üretir (girişler, seçili satırlar, oturum değişkenleri dahil).
 */
export function usePageQueries(options: {
  queries: PageQueryDefinition[]; token: string; pageCode: string; previewId?: string;
  buildScope: (states: Record<string, QueryState>) => PageScope;
  /** ERP işlem kataloğu; null iken işlem sorguları katalog yüklenene kadar bekler. */
  operations?: Map<string, ErpOperation> | null;
}): {
  states: Record<string, QueryState>; scope: PageScope;
  /** Verilen okuma sorgularını (id) güncel parametrelerle hemen yeniden çalıştırır. */
  rerun: (queryIds: string[]) => void;
  /** Yazma sorgusunu çalıştırır; hata durumunda sunucu mesajıyla fırlatır. Önizlemede `confirmWrite` açık onayı taşır. */
  runWrite: (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite?: boolean) => Promise<WriteResult>;
  /** Okuma sorgusunu hemen çalıştırır ve sonucunu bekler; çalıştırılamazsa reddeder. */
  runRead: (queryId: string) => Promise<QueryState>;
  /** ERP işlemini doğrudan çağırır (yetki ve önizleme denetimi çağıranındır); JSON yanıtını döner. */
  callOperation: (op: ErpOperation, values: Record<string, unknown>) => Promise<unknown>;
} {
  const { queries, token, pageCode, previewId, buildScope } = options;
  const operations = options.operations ?? null;
  const endpointFor = (query: PageQueryDefinition) => previewId
    ? `/api/custom-pages/${encodeURIComponent(previewId)}/preview/queries/${encodeURIComponent(query.id)}/run`
    : `/api/custom-pages/${encodeURIComponent(pageCode)}/queries/${encodeURIComponent(query.id)}/run`;
  const [states, setStates] = useState<Record<string, QueryState>>(() =>
    Object.fromEntries(queries.map((query) => [query.name, emptyState(query.runOn === "load")])));
  const lastKeys = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sequences = useRef(new Map<string, number>());
  const generation = useRef(0);

  const scope = buildScope(states);
  const byName = new Map(queries.map((query) => [query.name, query]));
  const plans = queryOrder(queries).map((name) => {
    const query = byName.get(name)!;
    const values = resolveQueryParameters(query, scope);
    const upstream = new Set<string>();
    for (const parameter of query.parameters) {
      const path = bindingPath(parameter.binding);
      const root = path?.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
      if (root && root !== query.name && byName.has(root)) upstream.add(root);
    }
    const waiting = [...upstream].some((dependency) => states[dependency]?.loading) || (query.operation !== undefined && operations === null);
    return { query, values, key: JSON.stringify(values), waiting };
  });
  const signature = plans.map((plan) => `${plan.query.id}:${plan.waiting ? 1 : 0}:${plan.key}`).join("|");

  useEffect(() => () => {
    // Bileşen kalkarken (React StrictMode çift bağlamada da) bekleyen zamanlayıcıları ve uçuştaki yanıtları iptal et.
    generation.current += 1;
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    lastKeys.current.clear();
  }, []);

  // Zamanlayıcılar ve komut çubuğu eski kapanışları çağırabilir; kaynak satır ve katalog her zaman en güncelden okunur.
  const latestStates = useRef(states);
  latestStates.current = states;
  const latestOperations = useRef(operations);
  latestOperations.current = operations;
  const operationOf = (query: PageQueryDefinition): ErpOperation => {
    if (!latestOperations.current) throw new Error("ERP işlem kataloğu henüz yüklenmedi.");
    const op = latestOperations.current.get(query.operation!);
    if (!op) throw new Error(`ERP işlemi bulunamadı: ${query.operation}`);
    return op;
  };
  /** İşlemin kaynak sorgusu: sayfada `operation === op.sourceOperation` olan okuma sorgusu. */
  const sourceQueryOf = (op: ErpOperation) => op.sourceOperation
    ? queries.find((candidate) => candidate.kind === "read" && candidate.operation === op.sourceOperation) : undefined;
  const sourceRow = (op: ErpOperation): Record<string, unknown> | null => {
    const source = sourceQueryOf(op);
    return (source && latestStates.current[source.name]?.rows[0]) ?? null;
  };
  /** 403 her zaman genel yetki metniyle gösterilir; sunucunun `error` gövdesi (serverError) onu ezmesin. */
  const operationFailure = (cause: unknown): unknown => (cause as { status?: number } | null)?.status === 403
    ? Object.assign(new Error("Bu işlem için yetkiniz yok."), { status: 403 }) : cause;
  const operationInit = (request: OperationRequest): RequestInit => request.body !== undefined
    ? { method: request.method, headers: { "Content-Type": "application/json" }, body: request.body }
    : { method: request.method };

  const executeOperation = async (query: PageQueryDefinition, values: Record<string, unknown>): Promise<QueryState | undefined> => {
    const sequence = (sequences.current.get(query.name) ?? 0) + 1;
    sequences.current.set(query.name, sequence);
    const currentGeneration = generation.current;
    setStates((current) => ({ ...current, [query.name]: { ...(current[query.name] ?? emptyState(true)), loading: true, error: "" } }));
    try {
      const op = operationOf(query);
      if (op.kind !== "read") throw new Error(`ERP yazma işlemi okuma sorgusunda çalıştırılmaz: ${op.name}`);
      const source = sourceRow(op);
      // Yol parametresi henüz yok (ör. tabloda satır seçilmedi): istek atılmaz, hata da gösterilmez; sorgu boş kalır.
      if (missingRouteValue(op, values, source)) {
        if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return undefined;
        const idle = emptyState(false);
        setStates((current) => ({ ...current, [query.name]: idle }));
        return idle;
      }
      const request = buildOperationRequest(op, values, source);
      const json = await api<unknown>(request.url, token, operationInit(request));
      if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return undefined;
      const mapped = mapOperationResult(op, json);
      const next: QueryState = { ...mapped, truncated: mapped.rows.length < mapped.rowCount, loading: false, error: "", ran: true };
      setStates((current) => ({ ...current, [query.name]: next }));
      return next;
    } catch (cause) {
      if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return undefined;
      const failure = operationFailure(cause) as Error & { serverError?: string };
      const next: QueryState = { ...emptyState(false), error: failure.serverError || failure.message || "Sorgu çalıştırılamadı.", ran: true };
      setStates((current) => ({ ...current, [query.name]: next }));
      return next;
    }
  };

  const runOperationWrite = async (query: PageQueryDefinition, values: Record<string, unknown>): Promise<WriteResult> => {
    if (previewId) throw new Error("Önizlemede ERP yazma işlemi çalıştırılmaz.");
    const op = operationOf(query);
    const source = sourceQueryOf(op);
    // Kaynak kayıt yenilenirken eski satırın gizli alanları ve rowVersion'ı gönderilmesin.
    if (source && latestStates.current[source.name]?.loading) throw new Error("Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin.");
    const row = sourceRow(op);
    const mismatch = sourceRecordError(op, values, row);
    if (mismatch) throw new Error(mismatch);
    const request = buildOperationRequest(op, values, row);
    setStates((current) => ({ ...current, [query.name]: { ...(current[query.name] ?? emptyState(false)), fieldErrors: undefined } }));
    try {
      const json = await api<unknown>(request.url, token, operationInit(request));
      setStates((current) => ({ ...current, [query.name]: { ...emptyState(false), ran: true, sonuc: json } }));
      return { affectedRows: 1, sonuc: json };
    } catch (cause) {
      const failure = cause as Error & { fieldErrors?: Record<string, string[]> };
      const fieldErrors = fieldErrorsByParameter(op, failure.fieldErrors);
      setStates((current) => ({ ...current, [query.name]: { ...emptyState(false), ran: true, fieldErrors } }));
      throw operationFailure(cause);
    }
  };

  const execute = async (query: PageQueryDefinition, values: Record<string, unknown>): Promise<QueryState | undefined> => {
    if (query.operation !== undefined) return executeOperation(query, values);
    const sequence = (sequences.current.get(query.name) ?? 0) + 1;
    sequences.current.set(query.name, sequence);
    const currentGeneration = generation.current;
    setStates((current) => ({ ...current, [query.name]: { ...(current[query.name] ?? emptyState(true)), loading: true, error: "" } }));
    try {
      const result = await api<RunResult>(endpointFor(query), token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameters: values }),
      });
      if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return undefined;
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const next: QueryState = {
        rows, rowCount: typeof result.rowCount === "number" ? result.rowCount : rows.length,
        columns: Array.isArray(result.columns) ? result.columns : [], truncated: result.truncated === true, loading: false, error: "", ran: true,
      };
      setStates((current) => ({ ...current, [query.name]: next }));
      return next;
    } catch (cause) {
      if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return undefined;
      const failure = cause as Error & { serverError?: string };
      const next: QueryState = { ...emptyState(false), error: failure.serverError || failure.message || "Sorgu çalıştırılamadı.", ran: true };
      setStates((current) => ({ ...current, [query.name]: next }));
      return next;
    }
  };

  const latestPlans = useRef(plans);
  latestPlans.current = plans;
  const rerun = (queryIds: string[]) => {
    for (const plan of latestPlans.current) {
      if (plan.query.kind === "read" && queryIds.includes(plan.query.id) && !plan.waiting) void execute(plan.query, plan.values);
    }
  };
  /**
   * Okuma sorgusunu (id) güncel parametrelerle hemen çalıştırır ve sonuç durumunu döner (kod bileşeni köprüsü).
   * Bağlı olduğu sorgu yükleniyorsa ya da çalıştırma daha yenisiyle geçersizleşirse reddedilir; hiçbir zaman asılı kalmaz.
   */
  const runRead = async (queryId: string): Promise<QueryState> => {
    const plan = latestPlans.current.find((candidate) => candidate.query.id === queryId && candidate.query.kind === "read");
    if (!plan) throw new Error("Okuma sorgusu bulunamadı.");
    if (plan.waiting) throw new Error("Sorgu şu an çalıştırılamaz; bağlı olduğu veri yükleniyor.");
    const next = await execute(plan.query, plan.values);
    if (!next) throw new Error("Sorgu daha yeni bir çalıştırmayla geçersizleşti.");
    if (next.error) throw new Error(next.error);
    return next;
  };
  /** Katalogdaki ERP işlemini doğrudan çağırır ve JSON yanıtını döner (kod bileşeni köprüsü; kaynak kayıt yok). */
  const callOperation = async (op: ErpOperation, values: Record<string, unknown>): Promise<unknown> => {
    const request = buildOperationRequest(op, values, null);
    try { return await api<unknown>(request.url, token, operationInit(request)); } catch (cause) { throw operationFailure(cause); }
  };
  const runWrite = async (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite = false): Promise<WriteResult> => {
    if (query.operation !== undefined) return runOperationWrite(query, values);
    const result = await api<Partial<WriteResult>>(endpointFor(query), token, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmWrite ? { parameters: values, confirmWrite: true } : { parameters: values }),
    });
    return { affectedRows: typeof result.affectedRows === "number" ? result.affectedRows : 0 };
  };

  useEffect(() => {
    for (const plan of plans) {
      const { query } = plan;
      if (query.runOn !== "load") continue;
      const previous = lastKeys.current.get(query.name);
      if (plan.waiting) {
        // Bağlı olduğu sorgu yenileniyor: henüz başlamamış çalıştırmayı iptal et, bitince yeniden değerlendirilir.
        const pending = timers.current.get(query.name);
        if (pending !== undefined) { clearTimeout(pending); timers.current.delete(query.name); lastKeys.current.delete(query.name); }
        continue;
      }
      if (previous === plan.key) continue;
      const pending = timers.current.get(query.name);
      if (pending !== undefined) { clearTimeout(pending); timers.current.delete(query.name); }
      lastKeys.current.set(query.name, plan.key);
      if (previous === undefined) { void execute(query, plan.values); continue; }
      // Parametre değişti: sonucu eskimiş say, sequence'i ilerletip bekleyerek yeniden çalıştır.
      sequences.current.set(query.name, (sequences.current.get(query.name) ?? 0) + 1);
      setStates((current) => ({ ...current, [query.name]: { ...(current[query.name] ?? emptyState(true)), loading: true } }));
      timers.current.set(query.name, setTimeout(() => { timers.current.delete(query.name); void execute(query, plan.values); }, QUERY_DEBOUNCE_MS));
    }
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  return { states, scope, rerun, runWrite, runRead, callOperation };
}
