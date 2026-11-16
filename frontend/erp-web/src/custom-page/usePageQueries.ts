import { useEffect, useRef, useState } from "react";
import { api } from "../erpApi";
import { bindingPath, coerceParameter, queryOrder, resolvePath, type PageScope } from "./pageBindings";

export type PageQueryDefinition = {
  id: string; name: string; runOn: "load" | "manual";
  parameters: { name: string; binding: string; type: string }[];
};
export type QueryColumn = { code: string; label: string; dataType?: string };
export type QueryState = {
  rows: Record<string, unknown>[]; rowCount: number; columns: QueryColumn[]; truncated: boolean; loading: boolean; error: string;
};
type RunResult = { columns?: QueryColumn[]; rows?: Record<string, unknown>[]; rowCount?: number; truncated?: boolean };

export const QUERY_DEBOUNCE_MS = 300;
const emptyState = (loading: boolean): QueryState => ({ rows: [], rowCount: 0, columns: [], truncated: false, loading, error: "" });

/** v2 sayfa tanımındaki `queries` dizisini savunmacı biçimde okur; okunamayan girdiler atlanır. */
export function readPageQueries(definition: unknown): PageQueryDefinition[] {
  const raw = (definition as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(raw)) return [];
  const result: PageQueryDefinition[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string" || item.kind !== "read") continue;
    const parameters = Array.isArray(item.parameters) ? (item.parameters as Record<string, unknown>[])
      .filter((p) => p && typeof p.name === "string" && typeof p.binding === "string" && typeof p.type === "string")
      .map((p) => ({ name: p.name as string, binding: p.binding as string, type: p.type as string })) : [];
    result.push({ id: item.id, name: item.name, runOn: item.runOn === "manual" ? "manual" : "load", parameters });
  }
  return result;
}

/**
 * Okuma sorgularını bağımlılık sırasıyla çalıştırır. `runOn: "load"` sorgular sayfa açılınca çalışır; parametrelerinin
 * çözülmüş değerleri değişince 300 ms bekleyip yeniden çalışır. Yüklenmekte olan bir sorguya bağlı sorgu bekler.
 * `buildScope` sorgu durumlarından tam bağlama kapsamını üretir (girişler, seçili satırlar, oturum değişkenleri dahil).
 */
export function usePageQueries(options: {
  queries: PageQueryDefinition[]; token: string; pageCode: string; previewId?: string;
  buildScope: (states: Record<string, QueryState>) => PageScope;
}): { states: Record<string, QueryState>; scope: PageScope } {
  const { queries, token, pageCode, previewId, buildScope } = options;
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
    const values: Record<string, unknown> = {};
    const upstream = new Set<string>();
    for (const parameter of query.parameters) {
      const path = bindingPath(parameter.binding);
      values[parameter.name] = path ? coerceParameter(resolvePath(scope, path), parameter.type) : null;
      const root = path?.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
      if (root && root !== query.name && byName.has(root)) upstream.add(root);
    }
    const waiting = [...upstream].some((dependency) => states[dependency]?.loading);
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

  useEffect(() => {
    const execute = async (query: PageQueryDefinition, values: Record<string, unknown>) => {
      const sequence = (sequences.current.get(query.name) ?? 0) + 1;
      sequences.current.set(query.name, sequence);
      const currentGeneration = generation.current;
      setStates((current) => ({ ...current, [query.name]: { ...(current[query.name] ?? emptyState(true)), loading: true, error: "" } }));
      const endpoint = previewId
        ? `/api/custom-pages/${encodeURIComponent(previewId)}/preview/queries/${encodeURIComponent(query.id)}/run`
        : `/api/custom-pages/${encodeURIComponent(pageCode)}/queries/${encodeURIComponent(query.id)}/run`;
      try {
        const result = await api<RunResult>(endpoint, token, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameters: values }),
        });
        if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return;
        const rows = Array.isArray(result.rows) ? result.rows : [];
        setStates((current) => ({ ...current, [query.name]: {
          rows, rowCount: typeof result.rowCount === "number" ? result.rowCount : rows.length,
          columns: Array.isArray(result.columns) ? result.columns : [], truncated: result.truncated === true, loading: false, error: "",
        } }));
      } catch (cause) {
        if (sequences.current.get(query.name) !== sequence || generation.current !== currentGeneration) return;
        const failure = cause as Error & { serverError?: string };
        setStates((current) => ({ ...current, [query.name]: { ...emptyState(false), error: failure.serverError || failure.message || "Sorgu çalıştırılamadı." } }));
      }
    };

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

  return { states, scope };
}
