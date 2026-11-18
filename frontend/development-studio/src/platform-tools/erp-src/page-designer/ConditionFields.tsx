import BindingInput, { type BindingSuggestion } from "./BindingInput";
import { CONDITION_MAX_LENGTH, conditionProblem } from "./conditions";

const DISABLED_REASON_MAX = 200;

/**
 * Müfettişin "Koşullar" bölümü: her bileşende `visibleWhen`; düğme ve girişte ayrıca `disabledWhen` ve `disabledReason`.
 * Koşul metni {{…}} olmadan yazılır (ör. kullanici.rol == 'TenantAdmin'). Tasarımcıda koşul değerlendirilmez.
 */
export function ConditionFields({ props, allowDisabled, pageNames, suggestions, disabled, onSet }: {
  props: Record<string, unknown>; allowDisabled: boolean; pageNames: string[]; suggestions: BindingSuggestion[]; disabled?: boolean;
  /** Boş değer (undefined) özelliği siler. */
  onSet: (key: "visibleWhen" | "disabledWhen" | "disabledReason", value: string | undefined) => void;
}) {
  const text = (key: string) => typeof props[key] === "string" ? props[key] as string : "";
  const field = (key: "visibleWhen" | "disabledWhen", label: string, help: string) => {
    const problem = conditionProblem(key, props[key], pageNames);
    return <label className="pd-field">{label}<small>{help}</small>
      <input className="pd-condition-input" value={text(key)} maxLength={CONDITION_MAX_LENGTH} spellCheck={false} disabled={disabled}
        aria-invalid={problem ? true : undefined} placeholder="kullanici.rol == 'TenantAdmin'"
        onChange={(event) => onSet(key, event.target.value === "" ? undefined : event.target.value)}/>
      {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
    </label>;
  };
  const hasDisabledWhen = text("disabledWhen") !== "";
  return <>
    {field("visibleWhen", "Görünürlük koşulu", "Boşsa bileşen her zaman görünür; koşul yanlışsa ERP'de gizlenir. Tasarımcıda gizlenmez, “Koşullu” işaretiyle gösterilir.")}
    {allowDisabled && <>
      {field("disabledWhen", "Pasiflik koşulu", "Koşul doğruysa ERP'de pasif olur. Sunucudaki yetki ve doğrulama denetimlerinin yerini almaz.")}
      <label className="pd-field">Pasiflik nedeni<small>{hasDisabledWhen ? "Pasifken kullanıcıya gösterilir." : "Önce pasiflik koşulu yazın."}</small>
        <BindingInput value={text("disabledReason")} maxLength={DISABLED_REASON_MAX} suggestions={suggestions} disabled={disabled || !hasDisabledWhen}
          ariaLabel="Pasiflik nedeni" placeholder="Bu işlem şu anda kullanılamaz." onChange={(next) => onSet("disabledReason", next || undefined)}/>
      </label>
    </>}
    <p className="pd-binding-note">Yollar {"{{ }}"} olmadan yazılır; <code>==</code>, <code>!=</code>, <code>in [...]</code>, <code>&amp;&amp;</code>, <code>||</code>, <code>!</code> ve parantez kullanılabilir. Kök ad bir bileşen, sorgu ya da <code>kullanici</code>, <code>bugun</code>, <code>sayilar</code> olmalıdır.</p>
  </>;
}
