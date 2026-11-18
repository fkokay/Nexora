import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { CONDITION_MAX_LENGTH, conditionProblem, parseCondition } from "./conditions";
import { iterationOf } from "./erpOperations";
import { queryKindLabels, type PageQuery } from "./QueriesPanel";

export const MAX_SEQUENCE_STEPS = 8;
export const SEQUENCE_ITERATION_HINT = "Izgara satırları: her eklenen satır için bir kez çalışır";
const WHEN_ENTRY = /^([A-Za-z0-9_-]{1,64})=(.+)$/;
const ONCEKI_PROBLEM = "'sequenceWhen' koşulu 'onceki' kullanamaz; adımlar başlamadan değerlendirilir.";

export type SequenceValue = { saveSequence: string[]; sequenceWhen: string[]; stopOnError: boolean };

/** `sequenceWhen` girdileri ("<sorguKimliği>=<koşul>") → kimliğe göre koşul; bozuk girdiler atlanır. */
export function parseSequenceWhen(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    if (typeof item !== "string") continue;
    const match = WHEN_ENTRY.exec(item);
    if (match && !(match[1] in result)) result[match[1]] = match[2];
  }
  return result;
}

/** Adımın koşul sorunu (sunucudaki metinlerle); sorun yoksa null. */
export function sequenceWhenProblem(condition: string, pageNames: string[]): string | null {
  if (condition === "") return null;
  const parsed = parseCondition(condition);
  if (!parsed.ok) return `'sequenceWhen' koşulu geçersiz: ${parsed.error}`;
  if (parsed.roots.includes("onceki")) return ONCEKI_PROBLEM;
  return conditionProblem("sequenceWhen", condition, pageNames);
}

/**
 * Koşulsuz ekleme adımı sonraki adımlarca `.sonuc` ile kullanılıyorsa uyarı (engellemez): kısmi hatadan sonra yeniden
 * kaydetmek ekleme adımını yeniden çalıştırır ve yinelenen kayıt oluşturur. Uyarı yoksa null.
 */
const RESULT_ROOT = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.sonuc(?![A-Za-z0-9_])/g;
export function sequenceRetryWarning(steps: string[], byId: Map<string, PageQuery>, conditions: Record<string, string>): (id: string) => string | null {
  return (id) => {
    const index = steps.indexOf(id);
    const query = byId.get(id);
    if (!query || query.kind !== "insert" || (conditions[id] ?? "").trim() !== "") return null;
    const usesResult = (binding: string, root: string) => [...binding.matchAll(RESULT_ROOT)].some((match) => match[1] === root);
    const used = steps.slice(index + 1).some((laterId, offset) => {
      const later = byId.get(laterId);
      return !!later && later.parameters.some((parameter) => usesResult(parameter.binding, query.name) || (offset === 0 && usesResult(parameter.binding, "onceki")));
    });
    return used
      ? `Bu ekleme adımının sonucu sonraki adımlarda kullanılıyor ama koşulu yok: kısmi bir hatadan sonra yeniden kaydetmek yinelenen kayıt oluşturur. Koşul ekleyin, ör. ${query.name}.sonuc.id == null`
      : null;
  };
}

/**
 * Kayıt dizisi düzenleyicisi (İşlem Çubuğu, Pencere ve "Kayıt dizisi" düğmesi): sıralı yazma adımları, adım başına
 * koşul ve "Hata olursa dur". `onChange` her zaman üç değerin tamamını verir; adım silinince koşulu da düşer.
 * `stopOnError` varsayılanı true'dur (özellik yoksa açık sayılır).
 */
export function SequenceFields({ value, when, stopOnError, writeQueries, componentsNames, disabled, onChange }: {
  value: string[]; when: unknown; stopOnError: unknown; writeQueries: PageQuery[]; componentsNames: string[]; disabled?: boolean;
  onChange: (next: SequenceValue) => void;
}) {
  const byId = new Map(writeQueries.map((query) => [query.id, query]));
  const steps = value.filter((id, index) => value.indexOf(id) === index).slice(0, MAX_SEQUENCE_STEPS);
  const conditions = parseSequenceWhen(when);
  const stop = stopOnError !== false;
  const write = (nextSteps: string[], nextConditions: Record<string, string> = conditions, nextStop = stop) => onChange({
    saveSequence: nextSteps,
    sequenceWhen: nextSteps.filter((id) => (nextConditions[id] ?? "") !== "").map((id) => `${id}=${nextConditions[id]}`),
    stopOnError: nextStop,
  });
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  };
  const remove = (id: string) => {
    const nextConditions = { ...conditions };
    delete nextConditions[id];
    write(steps.filter((step) => step !== id), nextConditions);
  };
  const free = writeQueries.filter((query) => !steps.includes(query.id));
  const retryWarning = sequenceRetryWarning(steps, byId, conditions);
  return <div className="pd-field">Kayıt dizisi<small>Yazma sorguları bu sırayla çalışır; her adım ayrı bir istek gönderir ve kullanıcının kendi yetkisiyle çalışır.</small>
    {steps.length === 0 && <small className="pd-query-warning">En az bir yazma sorgusu ekleyin.</small>}
    {steps.length > 0 && <div className="pd-tabs-editor">
      {steps.map((id, index) => {
        const query = byId.get(id);
        const name = query?.name ?? id;
        const condition = conditions[id] ?? "";
        const problem = sequenceWhenProblem(condition, componentsNames);
        const iteration = query ? iterationOf(query) : null;
        return <fieldset className="pd-tabs-editor-tab" key={id} disabled={disabled}>
          <div className="pd-tabs-editor-head">
            <span><b>{index + 1}.</b> {query ? `${query.name} (${queryKindLabels[query.kind]})` : id}</span>
            <button type="button" className="pd-icon-button" aria-label={`${name} adımını yukarı taşı`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={12}/></button>
            <button type="button" className="pd-icon-button" aria-label={`${name} adımını aşağı taşı`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={12}/></button>
            <button type="button" className="pd-icon-button danger" aria-label={`${name} adımını kaldır`} onClick={() => remove(id)}><Trash2 size={12}/></button>
          </div>
          {!query && <small className="pd-query-warning">Bu adımın sorgusu sayfada yok ya da artık yazma sorgusu değil.</small>}
          {iteration && <small>{SEQUENCE_ITERATION_HINT}</small>}
          {retryWarning(id) && <small className="pd-query-warning">{retryWarning(id)}</small>}
          <label className="pd-field">Koşul<small>Boşsa adım her zaman çalışır; koşul adımlar başlamadan bir kez değerlendirilir.</small>
            <input className="pd-condition-input" value={condition} maxLength={CONDITION_MAX_LENGTH} spellCheck={false}
              aria-label={`${name} adımının koşulu`} aria-invalid={problem ? true : undefined} placeholder="olustur.sonuc.id == null"
              onChange={(event) => write(steps, { ...conditions, [id]: event.target.value })}/>
            {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
          </label>
        </fieldset>;
      })}
    </div>}
    <select value="" aria-label="Kayıt dizisine adım ekle" disabled={disabled || free.length === 0 || steps.length >= MAX_SEQUENCE_STEPS}
      onChange={(event) => { if (event.target.value) write([...steps, event.target.value]); }}>
      <option value="">{writeQueries.length === 0 ? "Yazma sorgusu yok" : steps.length >= MAX_SEQUENCE_STEPS ? `En fazla ${MAX_SEQUENCE_STEPS} adım` : free.length === 0 ? "Tümü eklendi" : "Yazma sorgusu ekle"}</option>
      {free.map((query) => <option key={query.id} value={query.id}>{query.name} ({queryKindLabels[query.kind]})</option>)}
    </select>
    <label className="pd-check"><input type="checkbox" checked={stop} disabled={disabled} onChange={(event) => write(steps, conditions, event.target.checked)}/>Hata olursa dur</label>
    <p className="pd-binding-note">Adımlar <code>{"{{onceki.sonuc.X}}"}</code> ile bir önceki adımın sonucuna, <code>{"{{sorguAdi.sonuc.X}}"}</code> ile adlı adımın sonucuna bağlanabilir; adlı bağlama tercih edilir.</p>
  </div>;
}
