import { CONDITION_MAX_LENGTH } from "./conditions";
import { countWhenProblem } from "./countWhen";

/**
 * Sorgulu göstergenin "Koşullu sayaç" alanı (`countWhen`). Doluysa gösterge, sorgunun yüklenmiş satırlarından koşulu
 * sağlayanların sayısını gösterir (sayfalı sorguda o sayfa); tuvalde örnek satırlar sayılır.
 */
export function CountWhenField({ value, queryName, pageNames, disabled, onChange }: {
  value: unknown; queryName: string; pageNames: string[]; disabled?: boolean;
  /** Boş değer (undefined) özelliği siler. */
  onChange: (next: string | undefined) => void;
}) {
  const text = typeof value === "string" ? value : "";
  const problem = countWhenProblem(text, queryName, pageNames);
  return <label className="pd-field">Koşullu sayaç
    <small>Doluysa gösterge, koşulu sağlayan satırları sayar. Satır alanı <code>{queryName}.satir.&lt;alan&gt;</code> ile yazılır; yalnız yüklenmiş satırlar (sayfalı sorguda o sayfa, tuvalde örnek satırlar) sayılır.</small>
    <input className="pd-condition-input" value={text} maxLength={CONDITION_MAX_LENGTH} spellCheck={false} disabled={disabled}
      aria-invalid={problem ? true : undefined} placeholder={`${queryName}.satir.expiryDate < bugun`}
      onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}/>
    {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
  </label>;
}
