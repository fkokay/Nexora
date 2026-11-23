import { Plus, Trash2 } from "lucide-react";
import { LOOKUP_COLUMN, parseGridColumns } from "./gridColumns";
import { FILL_LABEL_SUFFIX, formulaCodes, formulaProblem, lookupFillsOf, stringMap, type StringMap } from "./gridEngine";
import { MAX_FORMULA_LENGTH } from "./gridFormula";

type Patch = Record<string, unknown>;
type QueryColumn = { code: string; label?: string };

const orUndefined = <T extends object>(map: T): T | undefined => (Object.keys(map).length > 0 ? map : undefined);

/** Sorgu sütunu seçimi: sütunlar biliniyorsa açılır liste, değilse metin (alandan çıkınca yazılır). */
function ColumnPicker({ value, columns, empty, ariaLabel, disabled, onChange }: {
  value: string; columns: QueryColumn[]; empty: string; ariaLabel: string; disabled?: boolean; onChange: (value: string) => void;
}) {
  const pickable = columns.filter((column) => LOOKUP_COLUMN.test(column.code));
  if (pickable.length > 0) return <select value={value} aria-label={ariaLabel} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="">{empty}</option>
    {pickable.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}
    {value && !pickable.some((column) => column.code === value) && <option value={value}>{value}</option>}
  </select>;
  return <input key={value} defaultValue={value} maxLength={128} spellCheck={false} placeholder={empty} aria-label={ariaLabel} disabled={disabled}
    onBlur={(event) => { const next = event.target.value.trim(); if (next !== value && (next === "" || LOOKUP_COLUMN.test(next))) onChange(next); else event.target.value = value; }}/>;
}

/**
 * Listeli tablonun motor ayarları: sorgudan doldurma (`fillQuery`, `fillColumns`, `skipWhenZero`), seçimle doldurma
 * (`lookupFills`) ve formül sütunları (`formulas`). `onPatch` undefined değeri siler.
 */
export function GridEngineFields({ props, readQueries, columnsOf, disabled, onPatch }: {
  props: Record<string, unknown>; readQueries: { id: string; name: string }[]; columnsOf: (queryId: string) => QueryColumn[];
  disabled?: boolean; onPatch: (patch: Patch) => void;
}) {
  const columns = parseGridColumns(props.gridColumns);
  const formulas = stringMap(props.formulas);
  const computed = formulaCodes(props);
  const numbers = columns.filter((column) => column.inputType === "number");
  const fillQuery = typeof props.fillQuery === "string" ? props.fillQuery : "";
  const fillColumns = stringMap(props.fillColumns);
  const fillSource = fillQuery ? columnsOf(fillQuery) : [];
  const lookupFills = lookupFillsOf(props.lookupFills);
  const skip = typeof props.skipWhenZero === "string" ? props.skipWhenZero : "";
  const rowNumber = typeof props.rowNumberColumn === "string" ? props.rowNumberColumn : "";
  const knownFill = !fillQuery || readQueries.some((query) => query.id === fillQuery);
  // Hesaplanan (calc) sütun önizlemeden gelir: doldurmaların hedefi olmaz.
  const targetable = columns.filter((column) => column.inputType !== "calc" && !computed.has(column.code));

  const setFillColumn = (code: string, source: string) => {
    const next = { ...fillColumns };
    if (source && (source !== code || code.endsWith(FILL_LABEL_SUFFIX))) next[code] = source; else delete next[code];
    onPatch({ fillColumns: orUndefined(next) });
  };
  const setLookupTargets = (code: string, targets: StringMap) => {
    const next = { ...lookupFills };
    if (Object.keys(targets).length > 0) next[code] = targets; else delete next[code];
    onPatch({ lookupFills: orUndefined(next) });
  };
  const setFormula = (code: string, text: string) => {
    const next = { ...formulas };
    if (text) next[code] = text.slice(0, MAX_FORMULA_LENGTH); else delete next[code];
    // Formül sütunu doldurulmaz.
    const fills = { ...fillColumns };
    delete fills[code];
    onPatch({ formulas: orUndefined(next), ...(code in fillColumns && text ? { fillColumns: orUndefined(fills) } : {}) });
  };

  return <>
    <label className="pd-field">Sorgudan doldur<small>Seçilen okuma sorgusunun her satırı tabloya düzenlenebilir bir satır olarak yazılır; sorgu yeni bir sonuç verince (parametreleri değişince) satırlar değiştirilir.</small>
      <select value={fillQuery} disabled={disabled} aria-label="Doldurma sorgusu"
        onChange={(event) => onPatch({ fillQuery: event.target.value || undefined, ...(event.target.value ? {} : { fillColumns: undefined }) })}>
        <option value="">(Doldurma yok)</option>
        {readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
        {!knownFill && <option value={fillQuery}>{fillQuery}</option>}
      </select>
      {!knownFill && <small className="pd-query-warning">{`'fillQuery' sayfadaki bir okuma sorgusu olmalıdır: ${fillQuery}`}</small>}
    </label>
    {fillQuery && <div className="pd-field">Doldurulan sütunlar<small>Boş bırakılan sütun, sorgunun aynı kodlu sütunundan kopyalanır.</small>
      {targetable.map((column) => <label key={column.code} className="pd-field">{column.label} <code>{column.code}</code>
        <ColumnPicker value={fillColumns[column.code] ?? ""} columns={fillSource} empty={`(aynı kod: ${column.code})`} ariaLabel={`${column.code} doldurma sütunu`}
          disabled={disabled} onChange={(source) => setFillColumn(column.code, source)}/>
      </label>)}
      {targetable.filter((column) => column.inputType === "lookup").map((column) => <label key={`${column.code}@label`} className="pd-field">{`${column.label} görünen metni`}
        <small>Doldurulan seçim hücresi seçenek sayfasında olmasa da bu sütunun metniyle görünür (ham kimlik yerine).</small>
        <ColumnPicker value={fillColumns[column.code + FILL_LABEL_SUFFIX] ?? ""} columns={fillSource} empty="(seçenekten)" ariaLabel={`${column.code} görünen metin sütunu`}
          disabled={disabled} onChange={(source) => setFillColumn(column.code + FILL_LABEL_SUFFIX, source)}/>
      </label>)}
    </div>}
    <label className="pd-field">Sıfırsa gönderme<small>Bu sayı sütunu boş ya da 0 olan satırlar kayda gönderilmez, sayılmaz ve doğrulanmaz.</small>
      <select value={skip} disabled={disabled} aria-label="Sıfırsa gönderilmeyen sütun" onChange={(event) => onPatch({ skipWhenZero: event.target.value || undefined })}>
        <option value="">(Hepsi gönderilir)</option>
        {numbers.map((column) => <option key={column.code} value={column.code}>{column.label} ({column.code})</option>)}
        {skip && !numbers.some((column) => column.code === skip) && <option value={skip}>{skip}</option>}
      </select>
    </label>
    <label className="pd-field">Sıra numarası sütunu<small>Gönderilen satırlar görüntü sırasıyla 1, 2, 3… alır (sıfır atlanan satırlar sayılmaz); sütun salt okunurdur.</small>
      <select value={rowNumber} disabled={disabled} aria-label="Sıra numarası sütunu" onChange={(event) => onPatch({ rowNumberColumn: event.target.value || undefined })}>
        <option value="">(Yok)</option>
        {numbers.filter((column) => !computed.has(column.code)).map((column) => <option key={column.code} value={column.code}>{column.label} ({column.code})</option>)}
        {rowNumber && !numbers.some((column) => column.code === rowNumber) && <option value={rowNumber}>{rowNumber}</option>}
      </select>
    </label>
    {columns.filter((column) => column.inputType === "lookup").map((column) => {
      const targets = lookupFills[column.code] ?? {};
      const options = column.lookup ? columnsOf(column.lookup.query) : [];
      const free = targetable.filter((item) => item.code !== column.code && !(item.code in targets));
      return <div key={column.code} className="pd-field">{`${column.label} seçilince doldur`}<small>Seçilen seçeneğin sütunları aynı satırın hücrelerine yazılır.</small>
        {Object.entries(targets).map(([target, source]) => <div key={target} className="pd-field-row">
          <code>{target}</code>
          <ColumnPicker value={source} columns={options} empty="Seçenek sütunu" ariaLabel={`${column.code} → ${target} seçenek sütunu`} disabled={disabled}
            onChange={(next) => { if (next) setLookupTargets(column.code, { ...targets, [target]: next }); }}/>
          <button type="button" className="pd-icon-button danger" aria-label={`${column.code} → ${target} doldurmasını sil`} disabled={disabled}
            onClick={() => { const next = { ...targets }; delete next[target]; setLookupTargets(column.code, next); }}><Trash2 size={12}/></button>
        </div>)}
        {free.length > 0 && <select value="" disabled={disabled} aria-label={`${column.code} doldurulacak sütun ekle`}
          onChange={(event) => { if (event.target.value) setLookupTargets(column.code, { ...targets, [event.target.value]: event.target.value }); }}>
          <option value="">Doldurulacak sütun ekle…</option>
          {free.map((item) => <option key={item.code} value={item.code}>{item.label} ({item.code})</option>)}
        </select>}
        {free.length === 0 && Object.keys(targets).length === 0 && <small className="pd-query-muted"><Plus size={11}/> Doldurulabilecek başka sütun yok.</small>}
      </div>;
    })}
    {numbers.length > 0 && <div className="pd-field">Formüller<small>Sayılar, diğer sayı sütunlarının (döngüsüz olarak başka formüllerin de) kodları, + - * / ve parantez (ör. <code>quantity * unitPrice</code>). Ara sonuçlar 2 ondalığa yuvarlanır. Boş hücre 0, sıfıra bölme 0; sonuç 2 ondalığa yuvarlanır. Formül sütunu salt okunurdur.</small>
      {numbers.filter((column) => column.code !== rowNumber).map((column) => {
        const text = formulas[column.code] ?? "";
        const problem = text ? formulaProblem(props, column.code, text) : null;
        return <label key={column.code} className="pd-field">{column.label} <code>{column.code}</code>
          <input key={text} defaultValue={text} maxLength={MAX_FORMULA_LENGTH} spellCheck={false} placeholder="(formül yok)" disabled={disabled}
            aria-label={`${column.code} formülü`} onBlur={(event) => { const next = event.target.value.trim(); if (next !== text) setFormula(column.code, next); }}/>
          {problem && <small className="pd-query-warning">{problem}</small>}
        </label>;
      })}
    </div>}
  </>;
}
