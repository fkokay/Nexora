import { useState } from "react";
import { CONDITION_MAX_LENGTH, conditionProblem } from "./conditions";
import {
  RULE_OPS, describeRules, formatRules, ruleNeedsValue, rulesFromCondition, type ConditionRule, type RuleJoiner, type RuleOp, type RuleSet,
} from "./conditionRules";

export type ConditionPath = { path: string; label: string; group?: string };
export type ConditionProp = "visibleWhen" | "disabledWhen" | "commandWhen" | "requiredWhen";

const OUTCOME: Record<ConditionProp, { outcome: string; always: string }> = {
  visibleWhen: { outcome: "görünür", always: "Koşul yok; her zaman görünür." },
  disabledWhen: { outcome: "pasif olur", always: "Koşul yok; hiçbir zaman pasif olmaz." },
  commandWhen: { outcome: "komut çubukta görünür", always: "Koşul yok; komut her zaman görünür." },
  requiredWhen: { outcome: "zorunlu olur", always: "Koşul yok; zorunlu değil." },
};

type State = { set: RuleSet; emitted: string | undefined; code: boolean };

const initial = (value: string | undefined): State => {
  const set = rulesFromCondition(value);
  return { set: set ?? { joiner: "and", rules: [] }, emitted: value, code: set === null };
};

/**
 * Koşul kural kurucusu: "Eğer [alan][işleç][değer]" satırları, aralarında ve/veya, altında tek cümlelik özet.
 * Yalnız düz &&/|| zinciri kurucuda gösterilir; başka her koşul (ya da birebir geri üretilemeyen yazım) kod kipinde kalır ve
 * kurucu onu yeniden yazmaz. Boş sonuç (satır yok) `onChange(undefined)` ile özelliği siler.
 */
export function ConditionBuilder({ value, onChange, paths, disabled, pageNames, prop }: {
  value: string | undefined; onChange: (next: string | undefined) => void; paths: ConditionPath[]; disabled?: boolean; pageNames: string[]; prop: ConditionProp;
}) {
  const [state, setState] = useState<State>(() => initial(value));
  const [rowError, setRowError] = useState<{ index: number; error: string } | null>(null);
  // Dışarıdan gelen değişiklik (geri al, başka bileşen seçimi …) yerel satırları geçersiz kılar; kendi yazdığımız değer kılmaz.
  // Kod kipindeyken kod kipinde kalınır.
  let current = state;
  if (value !== state.emitted) {
    current = initial(value);
    if (state.code) current.code = true;
    setState(current);
    setRowError(null);
  }
  const { set, code } = current;

  const labelFor = (path: string) => paths.find((item) => item.path === path)?.label ?? path;
  const problem = conditionProblem(prop, value, pageNames);

  const commit = (next: RuleSet) => {
    const formatted = formatRules(next);
    if (!formatted.ok) {
      // Yazılamayan değer: satır yerelde kalır, koşul değişmez.
      setRowError({ index: formatted.index, error: formatted.error });
      setState({ ...current, set: next });
      return;
    }
    setRowError(null);
    setState({ set: next, emitted: formatted.text, code: false });
    if (formatted.text !== value) onChange(formatted.text);
  };
  const patchRule = (index: number, patch: Partial<ConditionRule>) =>
    commit({ ...set, rules: set.rules.map((rule, at) => at === index ? { ...rule, ...patch } : rule) });
  const removeRule = (index: number) => commit({ ...set, rules: set.rules.filter((_, at) => at !== index) });
  const addRule = () => commit({ ...set, rules: [...set.rules, { path: "", op: "==", value: "" }] });
  const setJoiner = (joiner: RuleJoiner) => commit({ ...set, joiner });

  const canBuild = rulesFromCondition(value) !== null;
  const groups = [...new Set(paths.map((item) => item.group ?? ""))];

  const pathSelect = (rule: ConditionRule, index: number) => {
    const known = paths.some((item) => item.path === rule.path);
    const option = (item: ConditionPath) => <option key={item.path} value={item.path}>{item.label}</option>;
    return <select aria-label={`Kural ${index + 1} alanı`} value={rule.path} disabled={disabled} onChange={(event) => patchRule(index, { path: event.target.value })}>
      <option value="">Alan seçin</option>
      {rule.path !== "" && !known && <option value={rule.path}>{rule.path}</option>}
      {groups.map((group) => group === "" ? paths.filter((item) => !item.group).map(option)
        : <optgroup key={group} label={group}>{paths.filter((item) => item.group === group).map(option)}</optgroup>)}
    </select>;
  };

  if (code) return <div className="pd-cond-builder is-code">
    <input className="pd-condition-input" aria-label="Koşul ifadesi" value={value ?? ""} maxLength={CONDITION_MAX_LENGTH} spellCheck={false} disabled={disabled}
      aria-invalid={problem ? true : undefined} placeholder="kullanici.rol == 'TenantAdmin'"
      onChange={(event) => { const next = event.target.value === "" ? undefined : event.target.value; setState({ ...current, emitted: next }); onChange(next); }}/>
    {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
    <div className="pd-cond-builder-foot">
      <button type="button" className="pd-cond-link" disabled={disabled || !canBuild}
        title={canBuild ? undefined : "Bu koşul kural kurucuyla gösterilemiyor (parantez, ! ya da karışık ve/veya içeriyor)."}
        onClick={() => setState(initial(value))}>Kural kurucuya dön</button>
      {!canBuild && <small className="pd-cond-note">Bu koşul kural kurucuyla gösterilemiyor; kod olarak düzenleyin.</small>}
    </div>
  </div>;

  return <div className="pd-cond-builder">
    {set.rules.map((rule, index) => <div key={index} className="pd-cond-rule-wrap">
      {index > 0 && <div className="pd-segment pd-cond-joiner" role="group" aria-label="Kurallar arasında">
        {([["and", "ve"], ["or", "veya"]] as const).map(([joiner, label]) =>
          <button type="button" key={joiner} disabled={disabled} aria-pressed={set.joiner === joiner} className={set.joiner === joiner ? "active" : ""} onClick={() => setJoiner(joiner)}>{label}</button>)}
      </div>}
      <div className="pd-cond-rule">
        <span className="pd-cond-if">{index === 0 ? "Eğer" : ""}</span>
        {pathSelect(rule, index)}
        <select aria-label={`Kural ${index + 1} işleci`} value={rule.op} disabled={disabled} onChange={(event) => patchRule(index, { op: event.target.value as RuleOp })}>
          {RULE_OPS.map(([op, label]) => <option key={op} value={op}>{label}</option>)}
        </select>
        {ruleNeedsValue(rule.op)
          ? <input aria-label={`Kural ${index + 1} değeri`} value={rule.value} disabled={disabled} spellCheck={false}
            placeholder={rule.op === "in" ? "a, b, c" : "değer"} aria-invalid={rowError?.index === index ? true : undefined}
            onChange={(event) => patchRule(index, { value: event.target.value })}/>
          : <span className="pd-cond-novalue"/>}
        <button type="button" className="pd-cond-remove" aria-label={`Kural ${index + 1}'i kaldır`} disabled={disabled} onClick={() => removeRule(index)}>×</button>
      </div>
      {rowError?.index === index && <small className="pd-query-warning" role="alert">{rowError.error}</small>}
    </div>)}
    <div className="pd-cond-builder-foot">
      <button type="button" className="pd-cond-link" disabled={disabled} onClick={addRule}>+ Kural ekle</button>
      <button type="button" className="pd-cond-link" disabled={disabled} onClick={() => setState({ ...current, code: true })}>Kod olarak yaz</button>
    </div>
    <small className="pd-cond-summary">{describeRules(set, labelFor, OUTCOME[prop].outcome, OUTCOME[prop].always)}</small>
    {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
  </div>;
}
