import { useState, type DragEvent, type ReactNode } from "react";
import type { ActiveCatalog, CatalogDataSource } from "../catalogClient";
import { AppearanceSection } from "./AppearanceSection";
import { ComponentPanel, LegacySettings } from "./ComponentPanel";
import { DraftInput } from "./DraftInput";
import { chooseTableSource, FREE_TABLE_LEGACY_PAGE_SIZE, FREE_TABLE_PAGE_SIZES, freeTableSourceUsable, setTableEmptyText, setTablePageSize, tableOf } from "./freeTableModel";
import { MAX_LIST_COLUMNS, setColumns, type ModelDefinition } from "./listPanelModel";
import { setHideOnMobile } from "./textPanelModel";

export const FREE_TABLE_MISSING_IN_CATALOG = "Katalogda yok";
export const FREE_TABLE_DELETED_SOURCE = "Silinmiş kaynak";
export const FREE_TABLE_DEV_NOTE = "Yazılımcının hazırladığı veri kaynağı";
export const FREE_TABLE_COLUMNS_NOTE = "Sıra, işaretleme sırasıdır; ilk kolonlar dar ekranda öne çıkar.";
export const FREE_TABLE_READ_ONLY_NOTE = "Bu liste salt okunurdur: satır eylemi, arama ve süzgeç yoktur. Bunlar için Liste kalıbını kullanın.";
/** Panelin yazdığı özellikler; ötekiler "Eski ayarlar" altında salt okunur görünür ve kayıtta korunur. */
const KNOWN = new Set(["slot", "title", "query", "columns", "columnLabels", "pageSize", "emptyText", "visibleWhen", "hideOnMobile"]);

export type FreeTablePanelProps = {
  def: ModelDefinition; id: string;
  /** Etkin katalog, ERP işlemine dayanan kaynakları `withOperationParameters(…, false, …)` ile zenginleştirilmiş; `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null;
  catalogStatus?: "loading" | "ready" | "failed";
  disabled?: boolean;
  onChange: (next: ModelDefinition) => void;
  /** Ad bölümünün altındaki satır: bileşenin bölümü ve Yukarı / Aşağı (çağıran verir). */
  place?: ReactNode;
  /** "Ne zaman görünsün?" alanı (`VisibilityField` düğümü); verilmezse yalnız "Her zaman". */
  visibility?: ReactNode;
};

/** Serbest gövdedeki salt okunur Liste paneli (taslak 09, Karar 7): Ne listelensin? → Kolonlar → Sayfa başına → Görünüm. */
export function FreeTablePanel(props: FreeTablePanelProps) {
  const { def, id, catalog, disabled } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const table = def.components.find((component) => component.id === id);
  const state = tableOf(def, id);
  if (!table || !state) return null;
  const change = (next: ModelDefinition) => { if (!disabled && next !== def) props.onChange(next); };
  const sources = catalog?.dataSources ?? [];
  const source = sources.find((item) => item.code === state.source);

  const { columns, labels } = state;
  const sourceCodes = source ? source.columns.map((column) => column.code) : [];
  const ordered = [...columns, ...sourceCodes.filter((column) => !columns.includes(column))];
  const labelOf = (column: string) => labels[column] ?? source?.columns.find((item) => item.code === column)?.label ?? column;
  const full = columns.length >= MAX_LIST_COLUMNS;
  // Eski kayıttaki 100 seçili görünür ve yeniden seçilebilir; yeni Listede 10 / 25 / 50 sunulur.
  const pageSizes = state.pageSize === FREE_TABLE_LEGACY_PAGE_SIZE ? [...FREE_TABLE_PAGE_SIZES, FREE_TABLE_LEGACY_PAGE_SIZE] : FREE_TABLE_PAGE_SIZES;
  // Yeni işaretlenen kolon sona eklenir (sıra, işaretleme sırasıdır).
  const toggleColumn = (column: string, on: boolean) => change(on
    ? setColumns(def, id, [...columns, column], labels[column] ? {} : { [column]: labelOf(column) })
    : setColumns(def, id, columns.filter((item) => item !== column), {}));
  const dropOn = (target: string) => (event: DragEvent) => {
    event.preventDefault();
    if (!dragging || dragging === target || !columns.includes(dragging) || !columns.includes(target)) return setDragging(null);
    const next = columns.filter((item) => item !== dragging);
    next.splice(next.indexOf(target), 0, dragging);
    setDragging(null);
    change(setColumns(def, id, next, {}));
  };

  const what = <>
    {props.catalogStatus === "loading" ? <p className="cpanel-note">Katalog yükleniyor…</p>
      : props.catalogStatus === "failed" ? <p className="cpanel-warn">Katalog okunamadı.</p>
        : !catalog ? <p className="cpanel-note">Etkin katalog sürümü yok; liste için yazılımcıdan bir veri kaynağı isteyin.</p>
          : <ul className="cpanel-sources" aria-label="Veri kaynakları">{sources.map((item: CatalogDataSource) => {
            const usable = freeTableSourceUsable(item);
            const on = item.code === state.source;
            return <li key={item.code} className={`${on ? "on" : ""}${usable.usable ? "" : " is-dim"}`}>
              <label><input type="radio" name={`serbest-liste-kaynak-${id}`} checked={on} disabled={disabled || (!on && !usable.usable)}
                onChange={() => change(chooseTableSource(def, id, item))}/>{item.label}</label>
              {!usable.usable && <small>{usable.reason}</small>}
            </li>;
          })}{state.source && !source && <li className="on is-missing"><label><input type="radio" checked readOnly disabled/>{FREE_TABLE_DELETED_SOURCE}</label>
            <small>{FREE_TABLE_MISSING_IN_CATALOG}</small></li>}</ul>}
    {source && <div className="cpanel-dev">{FREE_TABLE_DEV_NOTE}</div>}
  </>;

  const basics = <>
    <div className="cpanel-sub" data-part="columns"><h4>Kolonlar</h4>
      {ordered.length === 0 ? <p className="cpanel-note">Önce ne listeleneceğini seçin.</p> : <ul className="cpanel-cols">{ordered.map((column) => {
        const on = columns.includes(column);
        const missing = !!source && !sourceCodes.includes(column);
        return <li key={column} draggable={on && !disabled} onDragStart={(event) => { event.dataTransfer.setData("text/plain", column); event.dataTransfer.effectAllowed = "move"; setDragging(column); }}
          onDragOver={(event) => event.preventDefault()} onDrop={dropOn(column)}>
          <span className="cpanel-grip" aria-hidden="true">⋮⋮</span>
          <input type="checkbox" checked={on} disabled={disabled || (!on && full)} title={!on && full ? `En fazla ${MAX_LIST_COLUMNS} kolon gösterilir.` : undefined}
            aria-label={labelOf(column)} onChange={(event) => toggleColumn(column, event.target.checked)}/>
          {editing === column
            ? <input className="cpanel-colname" autoFocus defaultValue={labelOf(column)} maxLength={60} aria-label="Kolon başlığı"
                onBlur={(event) => { setEditing(null); const value = event.target.value.trim(); if (value && value !== labelOf(column)) change(setColumns(def, id, columns, { [column]: value })); }}
                onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setEditing(null); }}/>
            : <span className="cpanel-colname">{labelOf(column)}{missing && <small>{` · ${FREE_TABLE_MISSING_IN_CATALOG}`}</small>}</span>}
          <button type="button" className="cpanel-pen" title="Başlığı değiştir" aria-label="Başlığı değiştir" disabled={disabled} onClick={() => setEditing(column)}>✎</button>
        </li>;
      })}</ul>}
      <p className="cpanel-note">{FREE_TABLE_COLUMNS_NOTE}</p>
    </div>
    <div className="cpanel-row">Sayfa başına<div className="cpanel-seg" role="group" aria-label="Sayfa başına">{pageSizes.map((size) =>
      <button type="button" key={size} className={state.pageSize === size ? "on" : ""} aria-pressed={state.pageSize === size} disabled={disabled || !state.source}
        onClick={() => change(setTablePageSize(def, id, size))}>{size}</button>)}</div></div>
  </>;

  const appearance = <AppearanceSection disabled={disabled} visibility={props.visibility} hideOnMobile={table.props.hideOnMobile === true}
    onHideOnMobile={(hide) => change(setHideOnMobile(def, id, hide))}
    extra={<DraftInput label="Liste boşken yazılacak" value={state.emptyText} placeholder="Kayıt yok." disabled={disabled}
      onCommit={(value) => change(setTableEmptyText(def, id, value))}/>}/>;

  return <ComponentPanel nameLabel="Liste başlığı" name={state.title} namePlaceholder="Liste" nameReadOnly onRename={() => {}} place={props.place}
    whatTitle="Ne listelensin?" what={what} basicsTitle={null} basics={basics}
    actions={<p className="cpanel-note">{FREE_TABLE_READ_ONLY_NOTE}</p>} appearance={appearance}>
    <LegacySettings props={table.props} known={KNOWN}/>
  </ComponentPanel>;
}
