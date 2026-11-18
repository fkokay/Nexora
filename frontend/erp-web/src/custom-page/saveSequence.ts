// Saf (React'siz) kayıt dizisi yürütücüsü (`saveSequence`): tek kilit, bir kez doğrulama / beforeSave / onay,
// sonra adımlar sırayla (yinelenen adımlar satır başına bir çağrı). Sunucu her çağrıyı kullanıcının yetkisiyle yine denetler.
import { confirmDialog } from "../confirmDialog";
import type { ErpOperation } from "./erpOperations";
import { bindingPath } from "./pageBindings";
import { BEFORE_SAVE_TIMEOUT_MESSAGE } from "./pageEvents";
import type { PageQueryDefinition, WriteResult } from "./usePageQueries";
import { PREVIEW_WRITE_WARNING, type WriteConfirm } from "./writeAction";

export type SequenceList = "eklenenSatir" | "silinenSatir";
export type SequenceStep = {
  query: PageQueryDefinition; label: string; allowed: boolean;
  /** Write query names in this sequence plus "onceki" that the step's bindings reference (for dependency skips). */
  refs: string[];
  iterate: { grid: string; list: SequenceList; rows: { key: string; row: Record<string, unknown> }[] } | null;
};
export type SequenceCall = { query: string; label: string; ok: boolean; sonuc?: unknown; error?: string; skipped?: boolean; grid?: string; rowKey?: string };
export type SequenceOutcome =
  | { status: "busy" } | { status: "cancelled" } | { status: "blocked"; message: string }
  | { status: "done"; tone: "success" | "warning" | "error"; message: string; calls: SequenceCall[]; succeeded: number };

export const NOTHING_TO_SAVE = "Kaydedilecek bir değişiklik yok.";
export const STEP_NOT_ALLOWED = "Bu işlem için yetkiniz yok.";
export const DEPENDENCY_FAILED = "bağlı olduğu adım başarısız";
const DEFAULT_SUCCESS = "İşlem tamamlandı.";
const PREVIOUS = "onceki";

/** Adım etiketi: katalog işlem etiketi, yoksa sorgu adı. */
export function stepLabel(query: PageQueryDefinition, op: ErpOperation | undefined): string {
  return op && typeof op.label === "string" && op.label !== "" ? op.label : query.name;
}

const ITERATION_PATH = /^([A-Za-z_][A-Za-z0-9_]*)\.(eklenenSatir|silinenSatir)(?:\.|\[|$)/;

/** Parametreleri `{{<tablo>.eklenenSatir.X}}` ya da `{{<tablo>.silinenSatir.X}}` bağlayan sorgunun yinelediği tablo listesi. */
export function iterationOf(query: PageQueryDefinition): { grid: string; list: SequenceList } | null {
  for (const parameter of query.parameters) {
    const match = bindingPath(parameter.binding)?.match(ITERATION_PATH);
    if (match && match[0].length > match[1].length + match[2].length + 1) return { grid: match[1], list: match[2] as SequenceList };
  }
  return null;
}

/** Hata metninin sonuna, `.`, `!` ya da `?` ile bitmiyorsa nokta ekler. */
function sentence(text: string): string {
  const trimmed = text.trim() || "İşlem tamamlanamadı";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

async function askConfirm(confirm: WriteConfirm, isPreview: boolean, usePrompt: boolean): Promise<boolean> {
  // İstem kendisi bir onaydır: istem varken yalnız önizleme uyarısı sorulur (önizleme kuralı kazanır).
  const enabled = confirm.enabled && !usePrompt;
  if (!enabled && !isPreview) return true;
  const configured = enabled ? confirm.text ?? "" : "";
  const message = isPreview ? [configured, PREVIEW_WRITE_WARNING].filter(Boolean).join(" ") : configured;
  return confirmDialog({
    title: confirm.title ?? "Emin misiniz?", message: message || undefined, confirmLabel: confirm.confirmLabel ?? "Onayla", cancelLabel: "Vazgeç",
    tone: isPreview ? "danger" : confirm.tone ?? "default",
  });
}

/**
 * Kayıt dizisini Wire sözleşmesindeki sırayla çalıştırır. `steps` çağıran tarafından `sequenceWhen` ile süzülmüş ve
 * yineleme satırları anlık görüntülenmiş olarak verilir. `runWriteAction` çağrılmaz (kilidi kendisi tutar).
 * `promptName` verilirse istem yanıtı bindirmede `{ [promptName]: { yanit } }` olarak bağlanır (`{{<düğmeAdı>.yanit}}`).
 */
export async function runSaveSequence(opts: {
  steps: SequenceStep[]; stopOnError: boolean; lock: { current: boolean }; isPreview: boolean;
  confirm: WriteConfirm; successText: string;
  validate: () => string | null;
  beforeWrite: (firstQuery: PageQueryDefinition) => Promise<{ cancel: true; message: string } | null>;
  /** Optional prompt (row action / button promptLabel); null cancels. Runs after beforeWrite, replaces confirm. */
  prompt?: () => Promise<string | null>;
  /** İstem yanıtının bindirmedeki adı (düğme adı). */
  promptName?: string;
  /** Resolves step parameters against the current scope plus the overlay (results by name, onceki, grid row, prompt answer). */
  resolve: (query: PageQueryDefinition, overlay: Record<string, unknown>) => Record<string, unknown>;
  write: (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite: boolean) => Promise<WriteResult>;
  errorText: (cause: unknown) => string;
  afterWrite: (payload: { query: string; sonuc: unknown; adimlar: { query: string; ok: boolean; sonuc?: unknown; hata?: string }[] }) => void;
}): Promise<SequenceOutcome> {
  const { lock } = opts;
  if (lock.current) return { status: "busy" };
  lock.current = true;
  try {
    // 2. Etkin adımlar: sıfır satırlı yinelenen adım atlanır (yetkisiz olsa da istek ve hata yoktur).
    const steps = opts.steps.filter((step) => !step.iterate || step.iterate.rows.length > 0);
    if (steps.length === 0) return { status: "done", tone: "warning", message: NOTHING_TO_SAVE, calls: [], succeeded: 0 };

    // 3. Doğrulama, bir kez.
    const invalid = opts.validate();
    if (invalid !== null) return { status: "blocked", message: invalid };

    // 4. beforeSave, bir kez, ilk etkin adımla.
    let verdict: { cancel: true; message: string } | null;
    try { verdict = await opts.beforeWrite(steps[0].query); } catch { verdict = { cancel: true, message: BEFORE_SAVE_TIMEOUT_MESSAGE }; }
    if (verdict) return { status: "blocked", message: verdict.message };

    // 5. İstem (varsa), sonra onay, bir kez.
    const overlayBase: Record<string, unknown> = {};
    if (opts.prompt) {
      const answer = await opts.prompt();
      if (answer === null) return { status: "cancelled" };
      if (opts.promptName) overlayBase[opts.promptName] = { yanit: answer };
    }
    if (!(await askConfirm(opts.confirm, opts.isPreview, !!opts.prompt))) return { status: "cancelled" };

    // 6. Adımlar.
    const calls: SequenceCall[] = [];
    const results: Record<string, unknown> = {};
    const failedSteps = new Set<string>();
    let previous: { sonuc: unknown } | undefined;
    let previousStepClean = true;
    let stopped = false;
    let firstFailure: SequenceCall | null = null;

    for (const step of steps) {
      if (stopped) break;
      const name = step.query.name;
      const rows = step.iterate ? step.iterate.rows : [null];
      const dependencyFailed = step.refs.some((ref) => (ref === PREVIOUS ? !previousStepClean : failedSteps.has(ref)));
      const fixedPrevious = previous;
      let stepClean = true;
      let lastSuccess: { sonuc: unknown } | undefined;

      for (let index = 0; index < rows.length; index += 1) {
        const item = rows[index];
        const label = step.iterate ? `${step.label} (satır ${index + 1}/${rows.length})` : step.label;
        const call: SequenceCall = { query: name, label, ok: false };
        if (step.iterate && item) { call.grid = step.iterate.grid; call.rowKey = item.key; }
        if (dependencyFailed) {
          call.skipped = true;
          call.error = sentence(DEPENDENCY_FAILED);
        } else if (!step.allowed) {
          call.error = STEP_NOT_ALLOWED;
        } else {
          const overlay: Record<string, unknown> = { ...overlayBase };
          for (const [resultName, sonuc] of Object.entries(results)) overlay[resultName] = { sonuc };
          if (fixedPrevious) overlay[PREVIOUS] = fixedPrevious;
          if (step.iterate && item) overlay[step.iterate.grid] = { [step.iterate.list]: item.row };
          try {
            const values = opts.resolve(step.query, overlay);
            const result = await opts.write(step.query, values, opts.isPreview);
            call.ok = true;
            if (result.sonuc !== undefined) call.sonuc = result.sonuc;
            lastSuccess = { sonuc: result.sonuc };
          } catch (cause) {
            call.error = sentence(opts.errorText(cause));
          }
        }
        calls.push(call);
        if (!call.ok) {
          stepClean = false;
          firstFailure ??= call;
          if (opts.stopOnError) { stopped = true; break; }
        }
      }

      if (lastSuccess) {
        results[name] = lastSuccess.sonuc;
        previous = lastSuccess;
      }
      if (!stepClean) failedSteps.add(name);
      previousStepClean = stepClean;
    }

    // 7. Son.
    const succeeded = calls.filter((call) => call.ok).length;
    if (succeeded > 0) {
      const last = [...calls].reverse().find((call) => call.ok)!;
      const adimlar = calls.map((call) => {
        const entry: { query: string; ok: boolean; sonuc?: unknown; hata?: string } = { query: call.query, ok: call.ok };
        if (call.ok && call.sonuc !== undefined) entry.sonuc = call.sonuc;
        if (!call.ok && call.error !== undefined) entry.hata = call.error;
        return entry;
      });
      try { opts.afterWrite({ query: last.query, sonuc: last.sonuc, adimlar }); } catch { /* olay işleyicisi sonucu bozmaz */ }
    }

    if (!firstFailure) {
      return { status: "done", tone: "success", message: `${opts.successText || DEFAULT_SUCCESS} (${succeeded} işlem)`, calls, succeeded };
    }
    if (opts.stopOnError) {
      const head = `${firstFailure.label} başarısız: ${firstFailure.error ?? ""}`;
      return succeeded === 0
        ? { status: "done", tone: "error", message: `${head} Hiçbir değişiklik kaydedilmedi.`, calls, succeeded }
        : { status: "done", tone: "warning", message: `${head} Önceki ${succeeded} işlem kaydedildi; kalan adımlar çalıştırılmadı.`, calls, succeeded };
    }
    const failures = calls.filter((call) => !call.ok).map((call) => `${call.label}: ${call.error ?? ""}`).join(" ");
    return {
      status: "done", tone: succeeded === 0 ? "error" : "warning",
      message: `${succeeded}/${calls.length} işlem tamamlandı. Başarısız: ${failures}`, calls, succeeded,
    };
  } finally {
    lock.current = false;
  }
}
