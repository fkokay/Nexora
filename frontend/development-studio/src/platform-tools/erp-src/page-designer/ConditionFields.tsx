import BindingInput, { type BindingSuggestion } from "./BindingInput";
import { ConditionBuilder } from "./ConditionBuilder";

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
  // Koşul kural kurucusuyla (alan / işleç / değer) yazılır; kurucunun gösteremediği ifade kod olarak düzenlenir.
  const paths = suggestions.map((item) => ({ path: item.path, label: `${item.path}${item.detail ? ` · ${item.detail}` : ""}`, group: item.group }));
  const field = (key: "visibleWhen" | "disabledWhen", label: string, help: string) => <div className="pd-field">{label}<small>{help}</small>
    <ConditionBuilder key={key} prop={key} value={text(key) || undefined} paths={paths} pageNames={pageNames} disabled={disabled} onChange={(next) => onSet(key, next)}/>
  </div>;
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
    <p className="pd-binding-note">Yollar {"{{ }}"} olmadan yazılır; <code>==</code>, <code>!=</code>, <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, <code>&gt;=</code> (sayı ve tarih), <code>bugun + 30</code> (gün ekler), <code>in [...]</code>, <code>&amp;&amp;</code>, <code>||</code>, <code>!</code> ve parantez kullanılabilir. Kök ad bir bileşen, sorgu ya da <code>kullanici</code>, <code>bugun</code>, <code>tarih</code> (<code>tarih.ayBasi</code>, <code>tarih.yilBasi</code>, <code>tarih.ucAyOnce</code>), <code>sayilar</code> olmalıdır.</p>
  </>;
}
