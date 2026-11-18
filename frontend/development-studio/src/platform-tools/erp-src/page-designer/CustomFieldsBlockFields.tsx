type Patch = { definitionsQuery?: string; valuesQuery?: string; columns?: number };

const DEFINITION_COLUMNS = ["code", "label", "dataType"];
const VALUE_COLUMNS = ["code", "value"];
export const DEFINITIONS_COLUMNS_PROBLEM = "'definitionsQuery' sorgusunun sonucu code, label ve dataType sütunlarını içermelidir.";
export const VALUES_COLUMNS_PROBLEM = "'valuesQuery' sorgusunun sonucu code ve value sütunlarını içermelidir.";

/** Sütunları bilinen sorguda eksik zorunlu sütun var mı (sütunlar bilinmiyorsa denetlenmez). */
const lacks = (columns: string[] | null, required: string[]) => columns !== null && required.some((code) => !columns.includes(code));

/**
 * Özel alanlar bloğu müfettişi: tanım sorgusu (zorunlu), değer sorgusu ve sütun sayısı (1–3, form kartı kuralı).
 * `columnsOf` bir okuma sorgusunun bilinen sonuç sütunlarını verir (ERP işlemi sonucu ya da önizleme); bilinmiyorsa null.
 */
export function CustomFieldsBlockFields({ name, props, readQueries, columnsOf, disabled, onPatch }: {
  name: string | undefined; props: Record<string, unknown>; readQueries: { id: string; name: string }[];
  columnsOf: (queryId: string) => string[] | null; disabled?: boolean; onPatch: (patch: Patch) => void;
}) {
  const definitions = typeof props.definitionsQuery === "string" ? props.definitionsQuery : "";
  const values = typeof props.valuesQuery === "string" ? props.valuesQuery : "";
  const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
  const picker = (value: string, emptyLabel: string, onPick: (id: string) => void) => <select value={value} disabled={disabled} onChange={(event) => onPick(event.target.value)}>
    <option value="">{emptyLabel}</option>
    {readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
    {value && !readQueries.some((query) => query.id === value) && <option value={value}>{value} (okuma sorgusu değil)</option>}
  </select>;
  return <>
    {!name && <small className="pd-query-warning">Özel alanlar bloğunun adı olmalıdır.</small>}
    <label className="pd-field">Tanım sorgusu<small>Alan tanımları: code, label, dataType (isRequired, maxLength, isActive isteğe bağlı).</small>
      {picker(definitions, "Okuma sorgusu seçin", (id) => onPatch({ definitionsQuery: id || undefined }))}
      {!definitions && <small className="pd-query-warning">Tanım sorgusu gerekir.</small>}
      {definitions && lacks(columnsOf(definitions), DEFINITION_COLUMNS) && <small className="pd-query-warning">{DEFINITIONS_COLUMNS_PROBLEM}</small>}
    </label>
    <label className="pd-field">Değer sorgusu<small>Kaydın mevcut değerleri: code, value. Boşsa alanlar boş başlar.</small>
      {picker(values, "Yok", (id) => onPatch({ valuesQuery: id || undefined }))}
      {values && lacks(columnsOf(values), VALUE_COLUMNS) && <small className="pd-query-warning">{VALUES_COLUMNS_PROBLEM}</small>}
    </label>
    <div className="pd-field">Sütun sayısı
      <div className="pd-segment" role="group" aria-label="Sütun sayısı">
        {[1, 2, 3].map((count) => <button type="button" key={count} aria-pressed={columns === count} className={columns === count ? "active" : ""}
          disabled={disabled} onClick={() => onPatch({ columns: count })}>{count}</button>)}
      </div>
    </div>
    <p className="pd-binding-note">Değerler <code>{`{{${name || "blok"}.degerler}}`}</code> ile bir eşlem parametresine (ör. customFields, values) bağlanır.</p>
  </>;
}
