import type { ReactNode } from "react";
import { ComponentPanel } from "./ComponentPanel";
import { DraftInput } from "./DraftInput";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import {
  addGridColumn, BLOCK_NO_SAVE, bindToSave, candidateExists, customFieldsOf, GRID_COLUMN_TYPES, GRID_NO_ACTION, GRID_NO_SAVE,
  gridColumnsOf, hasSaveAction, MAX_WINDOW_GRID_COLUMNS, MAX_WINDOW_GRID_ROWS, RECORD_NO_SAVE_STEP, saveBinding, setCustomFieldsProps, setGridColumns,
  setWindowGridProps, windowOf, type GridColumn, type GridColumnType,
} from "./extrasModel";
import "./component-panel.css";

type PanelProps = {
  def: ModelDefinition; id: string; onChange: (def: ModelDefinition) => void; disabled?: boolean;
  /** "Ne zaman görünsün?" ve "Ne zaman salt okunur" seçicileri (tasarımcıdan gelir). */
  visibility?: ReactNode; readOnlyWhen?: ReactNode;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const nameOf = (component: ModelComponent) => component.name ?? component.id;

/** "Kayıt adımı" uyarısı: değerler / satırlar kayıt adımlarından birine bağlı değilse nedeni ve "Bağla" (adımı ekler / bağlar). */
function SaveStatus({ def, component, segment, disabled, onChange }: {
  def: ModelDefinition; component: ModelComponent; segment: "degerler" | "satirlar"; disabled?: boolean; onChange: (def: ModelDefinition) => void;
}) {
  const dialogId = windowOf(def, component.id);
  const name = nameOf(component);
  const status = saveBinding(def, dialogId, name, segment);
  const binding = `{{${name}.${segment}}}`;
  if (status.bound) return <p className="cpanel-note" data-part="save-status">{segment === "degerler" ? "Kaydet bloğu da kaydeder." : "Kaydet satırları da kaydeder."}</p>;
  const noOwner = dialogId !== null && !hasSaveAction(def, dialogId);
  const message = dialogId === null ? (status.hasOwner ? BLOCK_NO_SAVE : `${BLOCK_NO_SAVE} ${RECORD_NO_SAVE_STEP}`)
    : noOwner && segment === "satirlar" ? `${GRID_NO_SAVE} ${GRID_NO_ACTION}` : segment === "degerler" ? BLOCK_NO_SAVE : GRID_NO_SAVE;
  const can = status.hasOwner && candidateExists(def, segment);
  return <div className="cpanel-warn" role="status" data-part="save-status">
    <p>{message}</p>
    <p className="cpanel-note">{`Kayıt adımlarından birinde ${binding} bağlanmalı.`}</p>
    <button type="button" className="cpanel-btn" disabled={disabled || !can} onClick={() => onChange(bindToSave(def, dialogId, name, segment))}>
      {segment === "degerler" ? "Kayıt adımını ekle" : "Bağla"}</button>
    {status.hasOwner && !candidateExists(def, segment) && <p className="cpanel-note">{`Sayfada ${segment === "degerler" ? "eşlem (map)" : "liste (list)"} parametreli bir yazma sorgusu yok.`}</p>}
  </div>;
}

/** Özel alan bloğunun paneli (Kayıt kartında ve pencerede): başlık, alan kaynağı, kolon sayısı, salt okunur / görünürlük, kayıt göstergesi. */
export function CustomFieldsPanel({ def, id, onChange, disabled, visibility, readOnlyWhen }: PanelProps) {
  const block = def.components.find((component) => component.id === id && component.type === "customFieldsBlock");
  if (!block) return null;
  const reads = def.queries.filter((query) => query.kind === "read");
  const definitions = text(block.props.definitionsQuery);
  const values = text(block.props.valuesQuery);
  const columns = block.props.columns === 1 || block.props.columns === 3 ? block.props.columns : 2;
  const change = (patch: Parameters<typeof setCustomFieldsProps>[2]) => { if (!disabled) onChange(setCustomFieldsProps(def, id, patch)); };
  const picker = (label: string, value: string, empty: string, pick: (queryId: string | null) => void) => <label className="cpanel-row">{label}
    <select aria-label={label} value={value} disabled={disabled} onChange={(event) => pick(event.target.value || null)}>
      <option value="">{empty}</option>
      {reads.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
      {value && !reads.some((query) => query.id === value) && <option value={value}>{`${value} (okuma sorgusu değil)`}</option>}
    </select></label>;
  const place = windowOf(def, id) === null ? "Kartta bu blok bir sekmede bölüm gibi durur." : "Pencerede alanlardan sonra, gövdede durur; pencerenin Kaydet'i bloğu da yazar.";
  return <ComponentPanel name={nameOf(block)} onRename={() => {}} nameReadOnly nameLabel="Özel alan bloğu" whatTitle="Alan kaynağı" basicsTitle="Ayarlar" actionsTitle="Kayıt"
    what={<>
      {picker("Alan tanımları", definitions, "Okuma sorgusu seçin", (queryId) => change({ definitionsQuery: queryId }))}
      {!definitions && <p className="cpanel-warn">Alan tanımları için bir okuma sorgusu seçin.</p>}
      {picker("Kaydın değerleri", values, "Yok (alanlar boş başlar)", (queryId) => change({ valuesQuery: queryId }))}
    </>}
    basics={<>
      <DraftInput label="Başlık" value={text(block.props.title)} disabled={disabled} onCommit={(value) => change({ title: value })}/>
      <div className="cpanel-row">Kolon sayısı<div className="cpanel-seg" role="group" aria-label="Kolon sayısı">{([1, 2, 3] as const).map((count) =>
        <button type="button" key={count} className={columns === count ? "on" : ""} aria-pressed={columns === count} disabled={disabled} onClick={() => change({ columns: count })}>{count}</button>)}</div></div>
      <div className="cpanel-q">Ne zaman salt okunur</div>{readOnlyWhen ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Hiçbir zaman</button></div>}
      <div className="cpanel-q">Ne zaman görünsün</div>{visibility ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Her zaman</button></div>}
      <p className="cpanel-note">{place}</p>
    </>}
    actions={<SaveStatus def={def} component={block} segment="degerler" disabled={disabled} onChange={onChange}/>}
    appearance={<p className="cpanel-note">Görünüm kalıptan gelir.</p>}/>;
}

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));
const parseNumber = (value: string): number | undefined => (value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined);

/** Pencere satır tablosunun paneli: yalnız izinli ayarlar (başlık, açıklama, ekle düğmesi, en az / en çok satır) ve sütunlar. */
export function WindowGridPanel({ def, id, onChange, disabled, visibility, readOnlyWhen }: PanelProps) {
  const grid = def.components.find((component) => component.id === id && component.type === "editableGrid");
  if (!grid) return null;
  const columns = gridColumnsOf(grid);
  const change = (patch: Parameters<typeof setWindowGridProps>[2]) => { if (!disabled) onChange(setWindowGridProps(def, id, patch)); };
  const writeColumns = (next: GridColumn[]) => { if (!disabled) onChange(setGridColumns(def, id, next)); };
  const edit = (index: number, patch: Partial<GridColumn>) => writeColumns(columns.map((column, at) => at === index ? { ...column, ...patch } : column));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...columns];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    writeColumns(next);
  };
  const readQueries = def.queries.filter((query) => query.kind === "read");
  const fillQuery = text(grid.props.fillQuery);
  const maxRows = typeof grid.props.maxRows === "number" ? grid.props.maxRows : MAX_WINDOW_GRID_ROWS;
  const minRows = typeof grid.props.minRows === "number" ? grid.props.minRows : undefined;
  return <ComponentPanel name={nameOf(grid)} onRename={() => {}} nameReadOnly nameLabel="Satır tablosu" whatTitle="Satırlar" basicsTitle="Ayarlar" actionsTitle="Kayıt"
    what={<>
      <DraftInput label="Başlık" value={text(grid.props.title)} disabled={disabled} onCommit={(value) => change({ title: value })}/>
      <DraftInput label="Açıklama" value={text(grid.props.description)} maxLength={300} disabled={disabled} onCommit={(value) => change({ description: value })}/>
      <p className="cpanel-note">Sütunlar</p>
      <ol className="cpanel-steps" data-part="grid-columns">{columns.map((column, index) => <li key={column.code} className="cpanel-sub">
        <div className="cpanel-row"><input className="cpanel-txt" aria-label={`${column.code} etiketi`} defaultValue={column.label} maxLength={60} disabled={disabled}
          onBlur={(event) => { const label = event.target.value.trim(); if (label && label !== column.label) edit(index, { label }); }}/>
          <select aria-label={`${column.label} türü`} value={column.type} disabled={disabled} onChange={(event) => {
            const type = event.target.value as GridColumnType;
            // Seçim sütunu kaynak ister: sayfanın ilk okuma sorgusu başlangıç olur (yoksa değişmez).
            if (type === "lookup") { const first = readQueries[0]; if (first) edit(index, { type, lookup: { query: first.id, value: "id", label: "name" }, maxLength: undefined, min: undefined, max: undefined, upperCase: false }); }
            else edit(index, { type, lookup: undefined });
          }}>
            {GRID_COLUMN_TYPES.map(([type, label]) => <option key={type} value={type} disabled={type === "lookup" && readQueries.length === 0}>{label}</option>)}</select></div>
        {column.type === "lookup" && column.lookup && <div className="cpanel-row" data-part="grid-lookup">
          <select aria-label={`${column.label} seçenek sorgusu`} value={column.lookup.query} disabled={disabled}
            onChange={(event) => edit(index, { lookup: { ...column.lookup!, query: event.target.value } })}>
            {readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select>
          <DraftInput label="Değer sütunu" value={column.lookup.value} disabled={disabled} onCommit={(value) => { if (value.trim()) edit(index, { lookup: { ...column.lookup!, value: value.trim() } }); }}/>
          <DraftInput label="Etiket sütunu" value={column.lookup.label} disabled={disabled} onCommit={(value) => { if (value.trim()) edit(index, { lookup: { ...column.lookup!, label: value.trim() } }); }}/>
        </div>}
        <div className="cpanel-row">
          <label><input type="checkbox" aria-label={`${column.label} zorunlu`} checked={column.required} disabled={disabled} onChange={(event) => edit(index, { required: event.target.checked })}/> Zorunlu</label>
          <label><input type="checkbox" aria-label={`${column.label} salt okunur`} checked={column.readOnly === true} disabled={disabled} onChange={(event) => edit(index, { readOnly: event.target.checked || undefined })}/> Salt okunur</label>
          <label><input type="checkbox" aria-label={`${column.label} benzersiz`} checked={column.unique} disabled={disabled} onChange={(event) => edit(index, { unique: event.target.checked })}/> Benzersiz</label>
        </div>
        {column.type === "text" && <DraftInput label="En çok uzunluk" type="number" commitOnBlur value={numberText(column.maxLength)} disabled={disabled} onCommit={(value) => edit(index, { maxLength: parseNumber(value) })}/>}
        {column.type === "number" && <>
          <DraftInput label="En az" type="number" commitOnBlur value={numberText(column.min)} disabled={disabled} onCommit={(value) => edit(index, { min: parseNumber(value) })}/>
          <DraftInput label="En çok" type="number" commitOnBlur value={numberText(column.max)} disabled={disabled} onCommit={(value) => edit(index, { max: parseNumber(value) })}/>
        </>}
        <span className="cpanel-seg">
          <button type="button" aria-label={`${column.label} yukarı`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" aria-label={`${column.label} aşağı`} disabled={disabled || index === columns.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button type="button" aria-label={`${column.label} çıkar`} disabled={disabled || columns.length <= 1} onClick={() => writeColumns(columns.filter((_, at) => at !== index))}>Çıkar</button>
        </span>
      </li>)}</ol>
      <button type="button" className="cpanel-btn" disabled={disabled || columns.length >= MAX_WINDOW_GRID_COLUMNS} onClick={() => { if (!disabled) onChange(addGridColumn(def, id)); }}>+ Sütun ekle</button>
    </>}
    basics={<>
      <DraftInput label="Ekle düğmesinin adı" value={text(grid.props.addLabel)} placeholder="Satır ekle" maxLength={40} disabled={disabled} onCommit={(value) => change({ addLabel: value })}/>
      <DraftInput label="En az satır" type="number" commitOnBlur value={numberText(minRows)} disabled={disabled} onCommit={(value) => change({ minRows: parseNumber(value) ?? null })}/>
      <DraftInput label={`En çok satır (1–${MAX_WINDOW_GRID_ROWS})`} type="number" commitOnBlur value={String(maxRows)} disabled={disabled} onCommit={(value) => { const next = parseNumber(value); if (next !== undefined) change({ maxRows: next }); }}/>
      <div className="cpanel-q">Satırları sorgudan doldur</div>
      <select aria-label="Doldurma sorgusu" data-part="grid-fill" value={fillQuery} disabled={disabled} onChange={(event) => change({ fillQuery: event.target.value || null })}>
        <option value="">Doldurma yok</option>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select>
      <p className="cpanel-note">Sorgunun sonucundaki satırlar, aynı kodlu sütunlara dolar.</p>
      <div className="cpanel-q">Ne zaman salt okunur</div>{readOnlyWhen ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Hiçbir zaman</button></div>}
      <div className="cpanel-q">Ne zaman görünsün</div>{visibility ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Her zaman</button></div>}
    </>}
    actions={<SaveStatus def={def} component={grid} segment="satirlar" disabled={disabled} onChange={onChange}/>}
    appearance={<p className="cpanel-note">Görünüm kalıptan gelir.</p>}/>;
}

/** Pencere ayarlarındaki "+ Özel alan bloğu" / "+ Satır tablosu" düğmeleri için: pencerede zaten olan var mı. */
export const windowHas = (def: ModelDefinition, dialogId: string) => ({
  block: customFieldsOf(def, dialogId) !== undefined,
  grid: def.components.some((component) => component.type === "editableGrid" && windowOf(def, component.id) === dialogId),
});
