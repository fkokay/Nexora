import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isOperationQuery, isWriteKind, type PageQuery, type QueryPreview } from "./QueriesPanel";
import { ERP_NOT_ALLOWED, buildReadRequest, findOperation, mapReadResult, type ErpCatalog } from "./erpOperations";
import { bindingPath, coerceParameter, resolvePath, type PageScope } from "./pageBindings";
import { SAMPLE_DEBOUNCE_MS, SAMPLE_ROWS, sampleBlocker, sampleCacheKey, sampleQueryIds, storedQueries, storedQueryMatches } from "./canvasSamples";
import "./page-designer-extras.css";

export type SampleEnv = {
  /** Kayıtlı taslağın kimliği (yeni, kaydedilmemiş sayfada null). */
  pageId: string | null;
  queries: PageQuery[];
  components: { type: string; props: Record<string, unknown> }[];
  previews: Record<string, QueryPreview>;
  setPreviews: (update: (current: Record<string, QueryPreview>) => Record<string, QueryPreview>) => void;
  /** Taslak düzenleniyor (yayımlanmış sayfada örnek veri kendiliğinden çalışmaz; bugünkü ipucu kalır). */
  enabled: boolean;
  /** SQL önizleme ucu: yalnız tenant yöneticisi ve kayıtlı taslak. */
  sqlAllowed: boolean;
  storedDefinitionJson: string | null;
  catalog: ErpCatalog;
  scope: () => PageScope;
  fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>;
  /** ⟳ ile, kayıtlı tanımdan farklı SQL sorgusu için: Sorgular sekmesindeki "Çalıştır ve önizle" (taslağı kaydeder). */
  manualRun: (queryId: string) => Promise<unknown>;
  /** Sürükle-bırak sürerken bekler: istek başlatma ve sonucu tuvale yazma sürükleme bitene kadar ertelenir. */
  whenIdle?: () => Promise<void>;
};

export type SampleInfo = { state: "off" | "waiting" | "loading" | "ready" | "error" | "blocked" | "stale"; message?: string };

type Plan = { key: string; blocked?: string; stale?: boolean; run: () => Promise<QueryPreview> };

function planFor(env: SampleEnv, query: PageQuery, stored: PageQuery[], scope: PageScope): Plan | null {
  if (isWriteKind(query.kind)) return null;
  const values: Record<string, unknown> = {};
  for (const parameter of query.parameters) {
    const path = bindingPath(parameter.binding);
    values[parameter.name] = path ? coerceParameter(resolvePath(scope, path), parameter.type) : null;
  }
  const key = sampleCacheKey(env.pageId, query, values);
  if (isOperationQuery(query)) {
    if (env.catalog.status !== "ready") return null;
    const op = findOperation(env.catalog, query.operation);
    if (!op || op.kind === "write") return null;
    if (!op.allowed) return { key, blocked: ERP_NOT_ALLOWED, run: () => Promise.reject(new Error(ERP_NOT_ALLOWED)) };
    const required = new Set(op.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name));
    const blocked = sampleBlocker(query.parameters, bindingPath, (path) => resolvePath(scope, path), required) ?? undefined;
    return { key, blocked, run: async () => {
      const built = buildReadRequest(op, values);
      const json = await env.fetchJson<unknown>(built.url, { method: built.method, ...(built.body !== undefined ? { body: built.body } : {}) });
      return mapReadResult(op, json);
    } };
  }
  if (!env.sqlAllowed || !env.pageId) return null;
  const blocked = sampleBlocker(query.parameters, bindingPath, (path) => resolvePath(scope, path)) ?? undefined;
  const stale = !storedQueryMatches(stored.find((item) => item.id === query.id), query);
  const pageId = env.pageId;
  return { key, blocked, stale, run: () => env.fetchJson<QueryPreview>(`/api/custom-pages/${pageId}/preview/queries/${encodeURIComponent(query.id)}/run`, { method: "POST", body: JSON.stringify({ parameters: values }) }) };
}

/**
 * Tuvaldeki okuma sorgularının otomatik örnek verisi: tasarımcı açılınca ve sorgu/bağlama değişince 500 ms gecikmeyle,
 * sırayla (aynı anda tek istek) çalışır; sonuç sorgu + parametre anahtarıyla önbelleğe alınır. Yazma sorguları hiç çalışmaz.
 */
export function useCanvasSamples(env: SampleEnv) {
  const envRef = useRef(env);
  envRef.current = env;
  const cache = useRef(new Map<string, { result?: QueryPreview; error?: string }>());
  const wanted = useRef(new Map<string, string>());
  const applied = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, { key: string; timer: number }>());
  const inflight = useRef(new Map<string, string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [, setTick] = useState(0);
  const [manual, setManual] = useState<Record<string, string>>({});

  const stored = useMemo(() => storedQueries(env.storedDefinitionJson), [env.storedDefinitionJson]);
  const plans = new Map<string, Plan>();
  if (env.enabled) {
    const scope = env.scope();
    for (const id of sampleQueryIds(env.components)) {
      const query = env.queries.find((item) => item.id === id);
      const plan = query ? planFor(env, query, stored, scope) : null;
      if (plan) plans.set(id, plan);
    }
  }
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const enqueue = (id: string, key: string) => {
    queue.current = queue.current.then(async () => {
      await envRef.current.whenIdle?.();
      const plan = plansRef.current.get(id);
      if (!plan || plan.key !== key || wanted.current.get(id) !== key) return;
      inflight.current.set(id, key); setTick((tick) => tick + 1);
      try {
        const result = await plan.run();
        cache.current.set(key, { result });
        await envRef.current.whenIdle?.();
        if (wanted.current.get(id) === key) { applied.current.set(id, key); envRef.current.setPreviews((current) => ({ ...current, [id]: result })); }
      } catch (failure) { cache.current.set(key, { error: (failure as Error).message }); }
      finally { await envRef.current.whenIdle?.(); inflight.current.delete(id); setTick((tick) => tick + 1); }
    });
  };

  useEffect(() => {
    const previews = envRef.current.previews;
    for (const [id, entry] of timers.current) if (plans.get(id)?.key !== entry.key) { window.clearTimeout(entry.timer); timers.current.delete(id); }
    for (const [id, plan] of plans) {
      if (plan.blocked || plan.stale) { wanted.current.delete(id); continue; }
      wanted.current.set(id, plan.key);
      if (applied.current.get(id) === plan.key && previews[id] !== undefined) continue;
      const hit = cache.current.get(plan.key);
      if (hit?.result) { applied.current.set(id, plan.key); const result = hit.result; envRef.current.setPreviews((current) => ({ ...current, [id]: result })); continue; }
      if (hit || inflight.current.get(id) === plan.key || timers.current.get(id)?.key === plan.key) continue;
      const key = plan.key;
      const timer = window.setTimeout(() => { timers.current.delete(id); enqueue(id, key); }, SAMPLE_DEBOUNCE_MS);
      timers.current.set(id, { key, timer });
    }
  });
  useEffect(() => () => { for (const entry of timers.current.values()) window.clearTimeout(entry.timer); }, []);

  const info = (queryId: string): SampleInfo => {
    const plan = plans.get(queryId);
    if (!plan) return { state: "off" };
    if (manual[queryId] === "loading" || inflight.current.get(queryId) === plan.key || timers.current.get(queryId)?.key === plan.key) return { state: "loading" };
    if (manual[queryId] && manual[queryId] !== "loading") return { state: "error", message: manual[queryId] };
    if (plan.blocked) return { state: "blocked", message: plan.blocked };
    if (plan.stale) return env.previews[queryId] ? { state: "ready" } : { state: "stale", message: "Kaydedince örnek veri gelir; ⟳ ile şimdi kaydedip çalıştırabilirsiniz." };
    const hit = cache.current.get(plan.key);
    if (hit?.error) return { state: "error", message: hit.error };
    return env.previews[queryId] ? { state: "ready" } : { state: "waiting" };
  };

  const refresh = (queryId: string) => {
    const plan = plans.get(queryId);
    if (!plan || plan.blocked) return;
    if (plan.stale) {
      setManual((current) => ({ ...current, [queryId]: "loading" }));
      void envRef.current.manualRun(queryId)
        .then(() => setManual((current) => { const next = { ...current }; delete next[queryId]; return next; }))
        .catch((failure: Error) => setManual((current) => ({ ...current, [queryId]: failure.message })));
      return;
    }
    cache.current.delete(plan.key);
    applied.current.delete(queryId);
    wanted.current.set(queryId, plan.key);
    const timer = timers.current.get(queryId);
    if (timer) { window.clearTimeout(timer.timer); timers.current.delete(queryId); }
    enqueue(queryId, plan.key);
  };

  /** Bloğun sağ üstündeki örnek veri durumu ve ⟳ düğmesi; örnek verisi olmayan bloklarda null. */
  const badge = (queryId: string | null | undefined) => {
    if (!queryId) return null;
    const sample = info(queryId);
    if (sample.state === "off") return null;
    const text = sample.state === "loading" ? "Örnek veri yükleniyor…" : sample.state === "ready" ? `örnek veri (ilk ${SAMPLE_ROWS} satır)` : sample.state === "waiting" ? "örnek veri" : sample.message ?? "";
    return <span className={`pd-sample-badge is-${sample.state}`} title={sample.message ?? text} onClick={(event) => event.stopPropagation()}>
      <span className="pd-sample-text">{text}</span>
      {sample.state !== "blocked" && <button type="button" aria-label="Örnek veriyi yenile" title="Örnek veriyi yenile" disabled={sample.state === "loading"} onClick={() => refresh(queryId)}><RefreshCw size={11}/></button>}
    </span>;
  };
  return { info, refresh, badge };
}
