// Sunucu hesaplı önizleme sorguları (`runOn: ["<bileşen>", …]`): bağlı girişler ya da tablolar değişince gecikmeli yeniden
// çalışır; yanıtlar sırayla uygulanır (eski yanıt düşer). Kayıt yolundan tamamen ayrıdır: tekrar deneme kimliğini yenilemez,
// tablo satırlarını sıfırlamaz, kaydı hiçbir zaman engellemez (eskimiş/başarısız önizleme yalnız "—" gösterir).
import { useEffect, useRef, useState } from "react";
import { api } from "../erpApi";
import { buildOperationRequest, mapOperationResult, missingRequiredValue, type ErpOperation } from "./erpOperations";
import { formatGridTotal } from "./gridTotals";
import { displayText } from "./pageBindings";
import type { PageQueryDefinition, QueryState } from "./usePageQueries";

export const DEFAULT_PREVIEW_DEBOUNCE_MS = 400;
export const MIN_PREVIEW_DEBOUNCE_MS = 150;
export const MAX_PREVIEW_DEBOUNCE_MS = 3000;
/** Önizlemenin satır eşleme alanı: işlemin liste parametresi öğelerinde bu adda alan varsa taslak anahtarıyla doldurulur. */
export const ROW_KEY_FIELD = "rowKey";
/** Hesaplanan hücrede değer yok (önizleme eskidi, başarısız ya da satır eşleşmedi). */
export const CALC_EMPTY = "—";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Sorgu tanımının önizleme tetikleyicileri: `runOn` dizisi (bileşen adları) ve `runDebounceMs` (150–3000, varsayılan 400). */
export function readPreviewTrigger(item: Record<string, unknown>): { watch: string[]; debounceMs: number } | null {
  if (!Array.isArray(item.runOn)) return null;
  const watch = [...new Set(item.runOn.filter((name): name is string => typeof name === "string" && NAME.test(name)))].slice(0, 20);
  const raw = item.runDebounceMs;
  const debounceMs = typeof raw === "number" && Number.isInteger(raw) && raw >= MIN_PREVIEW_DEBOUNCE_MS && raw <= MAX_PREVIEW_DEBOUNCE_MS
    ? raw : DEFAULT_PREVIEW_DEBOUNCE_MS;
  return { watch, debounceMs };
}

/**
 * Önizleme sorgusunun gönderilen değerleri: `{{<tablo>.satirlar}}` bağlayan liste parametresi, katalogdaki öğeleri `rowKey` alanı
 * bildiriyorsa her satıra taslak anahtarını ekler (yanıt satırları anahtarla eşlenir, dizinle değil). Bildirmeyen işlemde ve
 * önizleme olmayan sorgularda hiçbir şey eklenmez.
 */
export function withRowKeys(op: ErpOperation | undefined, query: PageQueryDefinition, values: Record<string, unknown>,
  gridRows: (path: string) => { key: string; row: Record<string, unknown> }[] | null): Record<string, unknown> {
  if (!op) return values;
  let next = values;
  for (const parameter of query.parameters) {
    const declared = op.parameters.find((item) => item.name.toLowerCase() === parameter.name.toLowerCase());
    if (!declared || declared.type !== "list" || !declared.items?.some((item) => item.code === ROW_KEY_FIELD)) continue;
    const path = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(parameter.binding.trim())?.[1];
    const rows = path ? gridRows(path) : null;
    if (!rows) continue;
    if (next === values) next = { ...values };
    next[parameter.name] = rows.map(({ key, row }) => ({ ...row, [ROW_KEY_FIELD]: key }));
  }
  return next;
}

/** Önizleme sonucunun satırları: liste biçiminde işlemin `rowsPath` satırları, kayıt biçiminde kaydın `rowsPath` dizisi. */
export function previewRows(op: ErpOperation | undefined, state: QueryState | undefined): Record<string, unknown>[] {
  if (!state || !op) return [];
  if (op.result.shape === "list") return state.rows;
  const record = state.rows[0];
  const path = op.result.rowsPath;
  const raw = record && path ? record[path] : undefined;
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
}

/** Hesaplanan hücrenin metni: satır anahtarı eşleşen sonuç satırının alanı (sayı biçimli); yoksa "—". */
export function calcText(rows: Record<string, unknown>[], draftKey: string, field: string): string {
  const row = rows.find((candidate) => displayText(candidate[ROW_KEY_FIELD]) === draftKey);
  if (!row) return CALC_EMPTY;
  let value: unknown = row;
  for (const part of field.split(".")) value = isRecord(value) ? value[part] : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return formatGridTotal(value);
  const text = displayText(value);
  return text === "" ? CALC_EMPTY : text;
}

export type PreviewPlan = {
  query: PageQueryDefinition; values: Record<string, unknown>;
  /** Değerlerin ve izlenen bileşenlerin anahtarı; değişince gecikmeli yeniden çalışır. */
  key: string;
  /** Bağlı tabloda geçersiz satır var: çalışmaz, son sonuç eskimiş kalır. */
  blocked: boolean;
  debounceMs: number;
};
export type PreviewEntry = { result: QueryState; ranKey: string | null; wantKey: string | null; pending: boolean };
const idle = (): QueryState => ({ rows: [], rowCount: 0, columns: [], truncated: false, loading: false, error: "", ran: false });

/** Kapsamdaki görünüm: eskimiş (bekleyen, atlanan, başarısız) önizlemenin satırları ve üst bilgileri gizlenir; `eskidi` true. */
export function previewScopeState(entry: PreviewEntry | undefined): QueryState & { eskidi: boolean } {
  if (!entry) return { ...idle(), eskidi: true };
  const stale = entry.ranKey === null || entry.ranKey !== entry.wantKey || entry.result.error !== "";
  return stale ? { ...idle(), loading: entry.pending, error: entry.result.error, ran: entry.result.ran, eskidi: true } : { ...entry.result, eskidi: false };
}

/**
 * Önizleme sorgularının deposu ve zamanlayıcısı. `states` kapsama girer (`previewScopeState`); `sync` her çizimden sonra güncel
 * planlarla çağrılır. Katalog (`operations`) yüklenmeden ve işleme izin yoksa çalışmaz.
 */
export function usePreviewQueries(token: string, operations: Map<string, ErpOperation> | null): {
  entries: Record<string, PreviewEntry>; sync: (plans: PreviewPlan[]) => void;
} {
  const [entries, setEntries] = useState<Record<string, PreviewEntry>>({});
  const requested = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sequences = useRef(new Map<string, number>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
      requested.current.clear();
    };
  }, []);
  const latestOperations = useRef(operations);
  latestOperations.current = operations;

  const update = (name: string, change: (entry: PreviewEntry) => PreviewEntry) =>
    setEntries((current) => ({ ...current, [name]: change(current[name] ?? { result: idle(), ranKey: null, wantKey: null, pending: false }) }));

  const execute = async (plan: PreviewPlan) => {
    const { query, values, key } = plan;
    const sequence = (sequences.current.get(query.name) ?? 0) + 1;
    sequences.current.set(query.name, sequence);
    const current = () => alive.current && sequences.current.get(query.name) === sequence;
    const op = query.operation ? latestOperations.current?.get(query.operation) : undefined;
    if (!op || op.allowed === false) {
      update(query.name, (entry) => ({ ...entry, result: { ...idle(), ran: true, error: op ? "Bu işlem için yetkiniz yok." : "Önizleme işlemi bulunamadı." }, ranKey: key, pending: false }));
      return;
    }
    if (missingRequiredValue(op, values, null)) {
      update(query.name, (entry) => ({ ...entry, result: idle(), ranKey: key, pending: false }));
      return;
    }
    update(query.name, (entry) => ({ ...entry, pending: true }));
    try {
      const request = buildOperationRequest(op, values, null);
      const json = await api<unknown>(request.url, token, request.body !== undefined
        ? { method: request.method, headers: { "Content-Type": "application/json" }, body: request.body } : { method: request.method });
      if (!current()) return;
      const mapped = mapOperationResult(op, json);
      const result: QueryState = { ...mapped, truncated: false, loading: false, error: "", ran: true, ranWith: values };
      update(query.name, (entry) => ({ ...entry, result, ranKey: key, pending: false }));
    } catch (cause) {
      if (!current()) return;
      const failure = cause as Error & { serverError?: string };
      const error = failure.serverError || failure.message || "Önizleme hesaplanamadı.";
      update(query.name, (entry) => ({ ...entry, result: { ...idle(), ran: true, error }, ranKey: key, pending: false }));
    }
  };

  const sync = (plans: PreviewPlan[]) => {
    if (!latestOperations.current) return;
    for (const plan of plans) {
      const name = plan.query.name;
      setEntries((current) => {
        const entry = current[name];
        if (entry && entry.wantKey === plan.key) return current;
        return { ...current, [name]: { ...(entry ?? { result: idle(), ranKey: null, pending: false }), wantKey: plan.key } };
      });
      const pending = timers.current.get(name);
      if (plan.blocked) {
        // Geçersiz satır: çalıştırılmaz; geçerli olunca aynı değerlerle yeniden istenir.
        if (pending !== undefined) { clearTimeout(pending); timers.current.delete(name); }
        requested.current.delete(name);
        sequences.current.set(name, (sequences.current.get(name) ?? 0) + 1);
        update(name, (entry) => (entry.pending ? { ...entry, pending: false } : entry));
        continue;
      }
      if (requested.current.get(name) === plan.key) continue;
      const first = !requested.current.has(name) && !(name in entries);
      requested.current.set(name, plan.key);
      if (pending !== undefined) { clearTimeout(pending); timers.current.delete(name); }
      // Süren istek varsa eskisi düşsün diye sıra numarası hemen ilerler.
      sequences.current.set(name, (sequences.current.get(name) ?? 0) + 1);
      if (first) { void execute(plan); continue; }
      update(name, (entry) => ({ ...entry, pending: true }));
      timers.current.set(name, setTimeout(() => { timers.current.delete(name); void execute(plan); }, plan.debounceMs));
    }
  };
  return { entries, sync };
}
