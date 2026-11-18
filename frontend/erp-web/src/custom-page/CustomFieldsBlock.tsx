import type { CSSProperties } from "react";
import { AlertCircle } from "lucide-react";
import type { CustomFieldSpec } from "./customFields";

/**
 * Özel alanlar bloğu (`customFieldsBlock`): tanım satırlarından türüne göre girişler (`page-cf-<blok>-<KOD>`).
 * Onay kutusunun değeri "true"/"false" metnidir.
 */
export function CustomFieldsBlock({ id, title, columns, specs, values, onChange, errors, disabled, loading, error, style }: {
  id: string; title: string; columns: 1 | 2 | 3; specs: CustomFieldSpec[];
  values: Record<string, string>; onChange: (code: string, value: string) => void; errors: Record<string, string>;
  disabled: boolean; loading: boolean; error?: string; style: CSSProperties;
}) {
  return <section className={`tenant-page-block tenant-page-form-card tenant-page-custom-fields${disabled ? " is-disabled" : ""}`} style={style}>
    {title && <h3>{title}</h3>}
    {loading ? <div className="tenant-report-state" role="status">Yükleniyor…</div>
      : error ? <div className="tenant-custom-page-error tenant-page-query-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>
      : specs.length === 0 ? <p className="tenant-report-state">Tanımlı özel alan yok.</p>
      : <div className={`tenant-page-form-card-grid is-cols-${columns}`}>
        {specs.map((spec) => {
          const inputId = `page-cf-${id}-${spec.code}`;
          const value = values[spec.code] ?? "";
          const message = errors[spec.code];
          const common = { id: inputId, disabled, "aria-invalid": message ? true : undefined, required: spec.required && spec.inputType !== "checkbox" ? true : undefined };
          const control = spec.inputType === "checkbox"
            ? <input {...common} type="checkbox" checked={value === "true"} onChange={(event) => onChange(spec.code, event.target.checked ? "true" : "false")} />
            : <input {...common} type={spec.inputType} value={value} step={spec.inputType === "number" ? "any" : undefined}
              maxLength={spec.inputType === "text" ? spec.maxLength : undefined} onChange={(event) => onChange(spec.code, event.target.value)} />;
          return <div key={spec.code} className="tenant-page-form-card-cell">
            <div className={`tenant-page-input tenant-page-input-${spec.inputType}${message ? " is-invalid" : ""}`}>
              <label htmlFor={inputId}><span>{spec.label}{spec.required && spec.inputType !== "checkbox" && <b aria-hidden="true"> *</b>}</span>{control}</label>
              {message && <small className="tenant-page-input-error" role="alert">{message}</small>}
            </div>
          </div>;
        })}
      </div>}
  </section>;
}
