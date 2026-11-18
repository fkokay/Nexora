import {
  FILTER_KIND_LABELS, FILTER_PLACE_LABELS, MAX_FILTERS, MAX_SEARCH_COLUMNS, SEARCH_RESET, SERVER_KINDS, isSearchableColumn, parseFilterEntries, setFilter, toggleSearchColumn,
  unboundFilterParams, filterBarParams, type FilterKind, type FilterPlace, type FilterSpec, type QueryParam,
} from "./filterBarSettings";
import type { PageQuery } from "./QueriesPanel";

type Column = { code: string; label: string; dataType?: string };
type Patch = Record<string, string | boolean | string[] | undefined>;
/** Süzgeç tablosunun satırı: listenin sütunu ya da sütunu olmayan sorgu parametresi (ör. @warehouseId). */
type Row = { key: string; label: string; column: boolean; param?: string; paramType?: string; searchable: boolean };

/**
 * Süzgeç alanının ayarları (taslak 14): bağlı tablo, arama kutusu (yer tutucu, aranacak sütunlar, sunucu parametresi) ve
 * sütun/parametre başına Süzgeçte, Aramada, Tür, Yer, Uygulama. Uygulama, sorguda aynı adlı parametre varsa "Sunucu"dur;
 * yoksa süzgeç ERP'de görünen satırlara uygulanır ("Bu sayfada"; sayfalı tabloda uyarılır).
 */
export function FilterBarFields({ name, props, tables, tableId, columns, formats, query, queryParams, paged, readQueries, columnsOf, queryEditable, disabled, onPatch }: {
  name?: string; props: Record<string, unknown>; tables: { id: string; label: string }[]; tableId: string;
  columns: Column[]; formats: Record<string, string>; query?: PageQuery; queryParams: QueryParam[]; paged: boolean;
  readQueries: { id: string; name: string }[]; columnsOf: (queryId: string) => Column[]; queryEditable: boolean; disabled: boolean;
  onPatch: (patch: Patch) => void;
}) {
  const specs = parseFilterEntries(props.filters);
  const byKey = new Map(specs.map((spec) => [spec.key, spec]));
  const search = props.search === true;
  const searchColumns = Array.isArray(props.searchColumns) ? props.searchColumns.filter((item): item is string => typeof item === "string") : [];
  const paramNamed = new Map(queryParams.map((param) => [param.name, param]));
  const rows: Row[] = [
    ...columns.map((column) => ({ key: column.code, label: column.label || column.code, column: true, param: paramNamed.get(column.code)?.name, paramType: paramNamed.get(column.code)?.type,
      searchable: isSearchableColumn(formats[column.code], column.dataType) })),
    ...queryParams.filter((param) => !columns.some((column) => column.code === param.name)).map((param) => ({ key: param.name, label: `@${param.name}`, column: false, param: param.name, paramType: param.type, searchable: false })),
    // Tanımda olup artık listede olmayan anahtarlar da kaldırılabilsin.
    ...specs.filter((spec) => !columns.some((column) => column.code === spec.key) && !paramNamed.has(spec.key)).map((spec) => ({ key: spec.key, label: spec.label || spec.key, column: false, param: spec.param, searchable: false })),
  ];
  const columnLabel = (code: string) => columns.find((column) => column.code === code)?.label || code;
  const patchFilter = (row: Row, patch: Partial<FilterSpec> | null) => onPatch({ filters: emptyToUndefined(setFilter(props.filters, row.key, patch, { key: row.key, kind: row.paramType === "bool" ? "toggle" : "auto", place: "row", ...(row.param ? { param: row.param } : {}) })) });
  const unbound = name ? unboundFilterParams(query, name, filterBarParams(props)) : [];
  return <>
    <label className="pd-field">Bağlı tablo<small>Süzgeçlerin uygulanacağı ızgara; sorguya bağlı olmalı.</small>
      <select value={tableId} disabled={disabled} onChange={(event) => onPatch({ table: event.target.value || undefined, filters: undefined, searchColumns: undefined, searchParam: undefined })}>
        <option value="">Tablo seçin</option>
        {tables.map((table) => <option key={table.id} value={table.id}>{table.label}</option>)}
      </select>
      {tables.length === 0 && <small className="pd-query-warning">Önce sayfaya sorguya bağlı bir ızgara ekleyin.</small>}
    </label>
    {tableId && <>
      <div className="pd-field pd-filterbar-search">
        <label className="pd-check"><input type="checkbox" checked={search} disabled={disabled}
          onChange={(event) => onPatch(event.target.checked ? { search: true } : { search: undefined, ...SEARCH_RESET })}/> <b>Arama kutusu</b></label>
        {search && <>
          <label className="pd-field">Yer tutucu<input value={String(props.searchPlaceholder ?? "")} maxLength={80} disabled={disabled} placeholder="Kod veya adla ara"
            onChange={(event) => onPatch({ searchPlaceholder: event.target.value.replace(/[<>{}]/g, "") || undefined })}/></label>
          <div className="pd-field">Aranacak sütunlar<small>Yazılan metin bu sütunlardan birinde geçerse satır kalır (en çok {MAX_SEARCH_COLUMNS}). Yalnız metin ve kod sütunları.</small>
            <div className="pd-filterbar-chips" role="group" aria-label="Aranacak sütunlar">
              {searchColumns.map((code) => <span key={code} className="pd-chip"><strong>{columnLabel(code)}</strong>
                <button type="button" className="pd-chip-x" aria-label={`${columnLabel(code)} sütununu aramadan çıkar`} disabled={disabled}
                  onClick={() => onPatch({ searchColumns: emptyToUndefined(toggleSearchColumn(searchColumns, code)) })}>✕</button></span>)}
              {searchColumns.length < MAX_SEARCH_COLUMNS && <select aria-label="Sütun ekle" value="" disabled={disabled} onChange={(event) => { if (event.target.value) onPatch({ searchColumns: toggleSearchColumn(searchColumns, event.target.value) }); }}>
                <option value="">＋ Sütun ekle</option>
                {rows.filter((row) => row.column && row.searchable && !searchColumns.includes(row.key)).map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
              </select>}
            </div>
          </div>
          <label className="pd-field">Uygulama<small>Sorguda arama parametresi seçilirse metin sunucuya gider (sorgu hangi sütunlarda arayacağını kendi bilir); yoksa seçili sütunlarda görünen satırlarda aranır.</small>
            <select value={typeof props.searchParam === "string" ? props.searchParam : ""} disabled={disabled} onChange={(event) => onPatch({ searchParam: event.target.value || undefined })}>
              <option value="">Bu sayfada</option>
              {queryParams.filter((param) => param.type === "text").map((param) => <option key={param.name} value={param.name}>Sunucu · @{param.name}</option>)}
            </select>
          </label>
        </>}
      </div>
      <div className="pd-field pd-settings-wide">Süzgeçler<small>Süzgeçte açık olanlar ERP'de çizilir (en çok {MAX_FILTERS}); tür sütunun biçiminden kendiliğinden gelir.</small>
        <div className="pd-filterbar-table" role="table" aria-label="Süzgeç sütunları">
          <div className="pd-filterbar-row is-head" role="row">{["Süzgeçte", "Aramada", "Sütun", "Tür", "Yer", "Uygulama"].map((head) => <span key={head} role="columnheader">{head}</span>)}</div>
          {rows.map((row) => {
            const spec = byKey.get(row.key);
            const on = !!spec;
            const server = !!spec?.param;
            const kinds = (Object.keys(FILTER_KIND_LABELS) as FilterKind[]).filter((kind) => !server || SERVER_KINDS.includes(kind));
            return <div key={row.key} className={`pd-filterbar-row${on ? "" : " is-off"}`} role="row">
              <span role="cell"><input type="checkbox" aria-label={`${row.label} süzgeçte`} checked={on} disabled={disabled || (!on && specs.length >= MAX_FILTERS)} onChange={(event) => patchFilter(row, event.target.checked ? {} : null)}/></span>
              <span role="cell">{row.column && row.searchable && search
                ? <input type="checkbox" aria-label={`${row.label} aramada`} checked={searchColumns.includes(row.key)} disabled={disabled} onChange={() => onPatch({ searchColumns: emptyToUndefined(toggleSearchColumn(searchColumns, row.key)) })}/>
                : <span className="pd-muted">—</span>}</span>
              <span role="cell" className="pd-filterbar-name"><b>{row.label}</b><code>{row.column ? row.key : `@${row.key} (sorgu parametresi)`}</code>
                {on && <input aria-label={`${row.label} etiketi`} placeholder="Etiket" maxLength={40} value={spec!.label ?? ""} disabled={disabled} onChange={(event) => patchFilter(row, { label: event.target.value })}/>}</span>
              <span role="cell">{on && <select aria-label={`${row.label} türü`} value={spec!.kind} disabled={disabled} onChange={(event) => patchFilter(row, { kind: event.target.value as FilterKind })}>
                {kinds.map((kind) => <option key={kind} value={kind}>{FILTER_KIND_LABELS[kind]}</option>)}</select>}
                {on && (spec!.kind === "select" || (spec!.kind === "auto" && !!spec!.options)) && <OptionsSource spec={spec!} readQueries={readQueries} columnsOf={columnsOf} disabled={disabled} onChange={(options) => patchFilter(row, { options })}/>}
              </span>
              <span role="cell">{on && <select aria-label={`${row.label} yeri`} value={spec!.place} disabled={disabled} onChange={(event) => patchFilter(row, { place: event.target.value as FilterPlace })}>
                {(Object.keys(FILTER_PLACE_LABELS) as FilterPlace[]).map((place) => <option key={place} value={place}>{FILTER_PLACE_LABELS[place]}</option>)}</select>}</span>
              <span role="cell">{on && (server ? <span className="pd-filterbar-apply">Sunucu<span className="pd-tag">parametre</span></span>
                : <span className="pd-filterbar-apply">Bu sayfada{paged && <small className="pd-query-warning">{`Süzgeç yalnız görünen sayfaya uygulanır; sunucuda süzmek için sorguya @${row.key.split(".").pop()} parametresi ekleyin.`}</small>}</span>)}</span>
            </div>;
          })}
          {rows.length === 0 && <p className="pd-binding-note">Izgaranın sorgu önizlemesi çalışınca sütunlar listelenir.</p>}
        </div>
        {paged && search && !props.searchParam && <small className="pd-query-warning">Arama yalnız görünen sayfada yapılır; sunucuda aramak için arama parametresini seçin.</small>}
        {unbound.length > 0 && (queryEditable
          ? <small>Kayıtta {unbound.map((param) => `@${param}`).join(", ")} parametresi {`{{${name}.<parametre>}}`} ile bağlanır.</small>
          : <small className="pd-query-warning">Sorguda {unbound.map((param) => `@${param}`).join(", ")} parametresini {`{{${name}.<parametre>}}`} ile bağlayın; bu sayfanın sorgusunu yalnız yönetici düzenleyebilir.</small>)}
      </div>
    </>}
  </>;
}

const emptyToUndefined = (list: string[]) => (list.length > 0 ? list : undefined);

/** Seçim süzgecinin seçenekleri: bir okuma sorgusu ve değer/etiket sütunları; seçilmezse değer etiketleri ya da satırlardaki değerler. */
function OptionsSource({ spec, readQueries, columnsOf, disabled, onChange }: {
  spec: FilterSpec; readQueries: { id: string; name: string }[]; columnsOf: (queryId: string) => Column[]; disabled: boolean;
  onChange: (options: FilterSpec["options"] | undefined) => void;
}) {
  const options = spec.options;
  const columns = options ? columnsOf(options.query) : [];
  return <span className="pd-filterbar-options">
    <select aria-label={`${spec.label || spec.key} seçenekleri`} value={options?.query ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value ? { query: event.target.value } : undefined)}>
      <option value="">Seçenekler: değer etiketleri</option>
      {readQueries.map((query) => <option key={query.id} value={query.id}>Sorgu · {query.name}</option>)}
    </select>
    {options && columns.length > 0 && <>
      <select aria-label="Değer sütunu" value={options.valueColumn ?? ""} disabled={disabled} onChange={(event) => onChange({ ...options, valueColumn: event.target.value || undefined })}>
        <option value="">Değer: ilk sütun</option>{columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}</select>
      <select aria-label="Etiket sütunu" value={options.labelColumn ?? ""} disabled={disabled || !options.valueColumn} onChange={(event) => onChange({ ...options, labelColumn: event.target.value || undefined })}>
        <option value="">Etiket: değer</option>{columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}</select>
    </>}
  </span>;
}
