import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { ActiveCatalog, CatalogAction, CatalogDataSource } from "../catalogClient";
import type { ErpOperation } from "../erpOperations";
import { gridToolPatch, type GridToolKey } from "../GridSettingsFields";
import { ComponentPanel, LegacySettings } from "./ComponentPanel";
import {
  DEFAULT_LIST_PAGE_SIZE, actionUsableAt, addListAction, chooseDataSource, dataSourceUsable, findList, labelMap, listDataSourceCode,
  missingCatalogCodes, newButtonOn, placedActions, removeListAction, rowOpenChoice, rowOpenParamName, rowOpenUsable, searchState, setColumns, setListProps, setPageSize,
  setNewButton, setRowDoubleClick, setSearch, stringList, withOperationParameters, MAX_LIST_COLUMNS, type ActionPlace, type ModelDefinition, type OperationListStatus,
  type RowOpenChoice,
} from "./listPanelModel";

export const LIST_EXPORT_NOTE = "“Dışa aktar” açıkken kullanıcı Excel ya da CSV seçebilir, sadece seçili satırları da aktarabilir.";
export const LIST_ACTIONS_NOTE = "Bu eylemleri yazılımcı hazırlar, sen sadece hangilerinin görüneceğini seçersin.";
export const LIST_MISSING_IN_CATALOG = "Katalogda yok";
const PAGE_SIZES = [10, 25, 50, 100];
const TOOLS: [GridToolKey, string][] = [["showColumnFilters", "Kolon filtreleri"], ["showColumnChooser", "Kolon seçici"], ["showPivot", "Pivot"], ["showExport", "Dışa aktar"]];
// Sunucu ve ERP yalnız iki değer bilir; değer yokken Sıkı sayılır.
const DENSITIES: [string, string][] = [["dense", "Sıkı"], ["comfort", "Rahat"]];
export const LIST_EMPTY_DEFAULT = "Kayıt yok.";
const OPEN_CHOICES: [RowOpenChoice, string][] = [["card", "Kartı aç"], ["panel", "Yan panelde göster"], ["none", "Hiçbir şey yapma"]];
/**
 * Panelin karşıladığı tablo özellikleri; ötekiler "Eski ayarlar" altında salt okunur görünür ve kayıtta korunur.
 * `hideOnMobile` burada yoktur: sayfanın tek listesi gizlenmez (ERP listeye uygulamaz); eski kayıttaki değer eski ayarlarda görünür.
 */
const KNOWN = new Set(["slot", "title", "query", "columns", "columnLabels", "showGridSearch", "pageSize", "rowOpenAction", "rowActions", "bulkDeleteQuery",
  "showColumnFilters", "showColumnChooser", "showPivot", "showExport", "density", "striped", "emptyText", "visibleWhen"]);

export type ListPanelProps = {
  definition: ModelDefinition; listId: string;
  /** Etkin katalog; `null` etkin sürüm yok demektir. */
  catalog: ActiveCatalog | null; catalogStatus: "loading" | "ready" | "failed";
  operationOf: (name: string | null) => ErpOperation | undefined;
  /** ERP işlem listesinin durumu: işlem bilinmeden işleme dayanan öğeler seçilemez. */
  operationsStatus?: OperationListStatus;
  isTenantAdmin: boolean; recordCount?: number | null; disabled?: boolean;
  onChange: (next: ModelDefinition) => void;
  /** "Ne zaman görünsün?" alanı (tasarımcının koşul düzenleyicisi); verilmezse yalnız "Her zaman" gösterilir. */
  visibility?: ReactNode;
  /** Özel alan bloğu ve pencere satır tablosu için "Ne zaman salt okunur" seçicisi (tasarımcıdan gelir). */
  readOnlyWhen?: ReactNode;
  /** "Yazılımcıdan iste →" tıklanınca (ör. kaydedilmemiş değişiklik onayı; `preventDefault` geçişi durdurur). */
  onLeave?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** Liste kalıbının paneli (taslak 01): sekme ve açılır pencere yok; sıra taslaktaki gibidir. */
export function ListPanel(props: ListPanelProps) {
  const { definition, listId, catalog, disabled, onChange } = props;
  const table = findList(definition, listId);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [emptyPreview, setEmptyPreview] = useState(false);
  if (!table) return null;
  const sources = (catalog?.dataSources ?? []).map((item) => withOperationParameters(item, props.operationOf(item.erpOperation), false, props.operationsStatus));
  const actions = (catalog?.actions ?? []).map((item) => withOperationParameters(item, props.operationOf(item.erpOperation), true, props.operationsStatus));
  const code = listDataSourceCode(definition, listId);
  const source = sources.find((item) => item.code === code);
  const missing = catalog ? missingCatalogCodes(definition, catalog) : [];
  const change = (next: ModelDefinition) => { if (!disabled && next !== definition) onChange(next); };
  const patch = (values: Parameters<typeof setListProps>[2]) => change(setListProps(definition, listId, values));

  const columns = stringList(table.props.columns);
  const labels = labelMap(table.props.columnLabels);
  const columnCodes = source ? source.columns.map((column) => column.code) : columns;
  const ordered = [...columns, ...columnCodes.filter((column) => !columns.includes(column))];
  const labelOf = (column: string) => labels[column] ?? source?.columns.find((item) => item.code === column)?.label ?? column;
  const full = columns.length >= MAX_LIST_COLUMNS;
  const toggleColumn = (column: string, on: boolean) => change(on
    ? setColumns(definition, listId, ordered.filter((item) => item === column || columns.includes(item)), labels[column] ? {} : { [column]: labelOf(column) })
    : setColumns(definition, listId, columns.filter((item) => item !== column), {}));
  const dropOn = (target: string) => (event: DragEvent) => {
    event.preventDefault();
    if (!dragging || dragging === target || !columns.includes(dragging) || !columns.includes(target)) return setDragging(null);
    const next = columns.filter((item) => item !== dragging);
    next.splice(next.indexOf(target), 0, dragging);
    setDragging(null);
    change(setColumns(definition, listId, next, {}));
  };

  const search = searchState(definition, listId);
  const pageSize = typeof table.props.pageSize === "number" ? table.props.pageSize : DEFAULT_LIST_PAGE_SIZE;
  const open = rowOpenChoice(definition, listId);
  const openParam = open === "card" ? rowOpenParamName(definition, listId, source) : null;
  const placed = placedActions(definition, listId);
  const sourceColumns = source?.columns.map((column) => column.code) ?? [];
  const actionChips = (place: ActionPlace) => {
    const list = actions.filter((action) => place === "row" ? action.target === "row" : true);
    // Yerleştirilmiş ama katalogdan kalkmış eylemler (toplu silme dahil) kaldırılabilir çip olarak görünür.
    const known = new Set(actions.map((action) => action.code));
    const gone = [...new Set((place === "row" ? placed.row : placed.above).filter((item) => !known.has(item)))];
    if (list.length === 0 && gone.length === 0) return <p className="cpanel-note">Yazılımcının hazırladığı eylem yok.</p>;
    return <div className="cpanel-chips">{gone.map((item) => <button type="button" key={`gone-${item}`} className="cpanel-chip on is-missing" aria-pressed
      disabled={disabled} title="Kaldırmak için tıklayın" onClick={() => change(removeListAction(definition, listId, item, place))}>{`${item} · ${LIST_MISSING_IN_CATALOG}`}</button>)}
      {list.map((action: CatalogAction) => {
      const on = (place === "row" ? placed.row : placed.above).includes(action.code);
      const usable = actionUsableAt(action, sourceColumns, place);
      return <button type="button" key={action.code} className={`cpanel-chip${on ? " on" : ""}`} aria-pressed={on}
        disabled={disabled || !source || (!on && !usable.usable)} title={usable.usable ? undefined : usable.reason}
        onClick={() => change(on ? removeListAction(definition, listId, action.code, place) : addListAction(definition, listId, action, place))}>
        {action.label}{!usable.usable && !on && <small> · {usable.reason}</small>}</button>;
    })}</div>;
  };
  const missingNote = missing.length > 0 && <p className="cpanel-warn" role="status">{LIST_MISSING_IN_CATALOG}: {missing.join(", ")}</p>;

  const what = <>
    {props.catalogStatus === "loading" ? <p className="cpanel-note">Katalog yükleniyor…</p>
      : props.catalogStatus === "failed" ? <p className="cpanel-warn">Katalog okunamadı.</p>
        : !catalog ? <p className="cpanel-note">Etkin katalog sürümü yok; liste için yazılımcıdan bir veri kaynağı isteyin.</p>
          : <ul className="cpanel-sources" aria-label="Veri kaynakları">{sources.map((item: CatalogDataSource) => {
            const usable = dataSourceUsable(item, props.isTenantAdmin);
            const on = item.code === code;
            return <li key={item.code} className={`${on ? "on" : ""}${usable.usable ? "" : " is-dim"}`}>
              <label><input type="radio" name={`liste-kaynak-${listId}`} checked={on} disabled={disabled || !usable.usable}
                onChange={() => change(chooseDataSource(definition, listId, item))}/>{item.label}</label>
              {!usable.usable && <small>{usable.reason}</small>}
            </li>;
          })}{code && !source && <li className="on is-missing"><label><input type="radio" checked readOnly disabled/>{code}</label><small>{LIST_MISSING_IN_CATALOG}</small></li>}</ul>}
    {source && <div className="cpanel-dev">{`Yazılımcının hazırladığı veri kaynağı${props.recordCount != null ? ` · ${props.recordCount.toLocaleString("tr-TR")} kayıt` : ""}`}</div>}
    {missingNote}
  </>;

  const basics = <>
    <div className="cpanel-sub" data-part="columns"><h4>Kolonlar</h4>
      {ordered.length === 0 ? <p className="cpanel-note">Önce ne listeleneceğini seçin.</p> : <ul className="cpanel-cols">{ordered.map((column) => {
        const on = columns.includes(column);
        return <li key={column} draggable={on && !disabled} onDragStart={(event) => { event.dataTransfer.setData("text/plain", column); event.dataTransfer.effectAllowed = "move"; setDragging(column); }} onDragOver={(event) => event.preventDefault()} onDrop={dropOn(column)}>
          <span className="cpanel-grip" aria-hidden="true">⋮⋮</span>
          <input type="checkbox" checked={on} disabled={disabled || (!on && full)} title={!on && full ? `En fazla ${MAX_LIST_COLUMNS} kolon gösterilir.` : undefined} aria-label={labelOf(column)} onChange={(event) => toggleColumn(column, event.target.checked)}/>
          {editing === column
            ? <input className="cpanel-colname" autoFocus defaultValue={labelOf(column)} maxLength={60} aria-label="Kolon başlığı"
                onBlur={(event) => { setEditing(null); const value = event.target.value.trim(); if (value && value !== labelOf(column)) change(setColumns(definition, listId, columns, { [column]: value })); }}
                onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); if (event.key === "Escape") setEditing(null); }}/>
            : <span className="cpanel-colname">{labelOf(column)}</span>}
          <button type="button" className="cpanel-pen" title="Başlığı değiştir" aria-label="Başlığı değiştir" disabled={disabled} onClick={() => setEditing(column)}>✎</button>
        </li>;
      })}</ul>}
    </div>
    <div className="cpanel-sub" data-part="list"><h4>Liste</h4>
      <label className="cpanel-row">Arama kutusu<input type="checkbox" role="switch" checked={search.on} disabled={disabled || search.server}
        title={search.server ? "Bu kaynak aramayı kendisi yapar; arama kutusu açık kalır." : undefined} onChange={(event) => change(setSearch(definition, listId, event.target.checked))}/></label>
      <div className="cpanel-row">Sayfa başına<div className="cpanel-seg" role="group" aria-label="Sayfa başına">{PAGE_SIZES.map((size) =>
        <button type="button" key={size} className={pageSize === size ? "on" : ""} aria-pressed={pageSize === size} disabled={disabled} onClick={() => change(setPageSize(definition, listId, size))}>{size}</button>)}</div></div>
      <label className="cpanel-q">Satıra çift tıklayınca
        <select value={open} disabled={disabled || !source} onChange={(event) => source && change(setRowDoubleClick(definition, listId, event.target.value as RowOpenChoice, source))}>
          {OPEN_CHOICES.map(([value, label]) => <option key={value} value={value} disabled={value === "card" && !!source && !rowOpenUsable(source).usable}>{label}</option>)}
        </select></label>
      {source && !rowOpenUsable(source).usable && <p className="cpanel-note">{(rowOpenUsable(source) as { reason: string }).reason}</p>}
      {open === "card" && source && <label className="cpanel-row" data-part="new-button">Listede “+ Yeni” düğmesi<input type="checkbox" checked={newButtonOn(definition)} disabled={disabled}
        onChange={(event) => change(setNewButton(definition, listId, event.target.checked, source))}/></label>}
      {open === "card" && openParam && <p className="cpanel-note" data-part="open-param">Açılan sayfa bu kaydı <code>{openParam}</code> bilgisiyle alır.</p>}
      {open === "panel" && <p className="cpanel-note">Panel açılınca ızgara kendiliğinden daralır. Mobilde panel alttan açılır.</p>}
      <div className="cpanel-q">Kullanıcı araçları</div>
      <div className="cpanel-chips">{TOOLS.map(([key, label]) => {
        const on = table.props[key] !== false;
        return <button type="button" key={key} className={`cpanel-chip${on ? " on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => patch(gridToolPatch(key, !on))}>{label}</button>;
      })}</div>
      <p className="cpanel-note">{LIST_EXPORT_NOTE}</p>
    </div>
    <div className="cpanel-sub" data-part="small"><h4>Küçük ekranlarda</h4>
      <div className="cpanel-dev cpanel-info">
        Kolon sırası aynı zamanda <b>önem sırası</b>.<br/>
        <b>Tablet:</b> ilk 4 kolon görünür, satır eylemleri “⋯” menüsüne girer.<br/>
        <b>Mobil:</b> kart listesi olur. 1. kolon başlık, 2.–3. kolon alt satır, sayı kolonu sağda görünür.
      </div>
    </div>
  </>;

  const actionsPart = <>
    <div className="cpanel-q">Listenin üstünde</div>{actionChips("above")}
    <div className="cpanel-q">Her satırın sonunda</div>{actionChips("row")}
    <div className="cpanel-dev">{LIST_ACTIONS_NOTE}</div>
  </>;

  const density = typeof table.props.density === "string" ? table.props.density : undefined;
  const appearance = <>
    <div className="cpanel-row">Satır yüksekliği<div className="cpanel-seg" role="group" aria-label="Satır yüksekliği">{DENSITIES.map(([value, label]) =>
      <button type="button" key={label} className={(density ?? "dense") === value ? "on" : ""} aria-pressed={(density ?? "dense") === value} disabled={disabled} onClick={() => patch({ density: value })}>{label}</button>)}</div></div>
    <label className="cpanel-row">Çizgili satırlar<input type="checkbox" role="switch" checked={table.props.striped === true} disabled={disabled}
      onChange={(event) => patch({ striped: event.target.checked ? true : undefined })}/></label>
    <label className="cpanel-q">Liste boşken yazılacak<input className="cpanel-txt" maxLength={120} disabled={disabled} value={typeof table.props.emptyText === "string" ? table.props.emptyText : ""}
      onChange={(event) => patch({ emptyText: event.target.value || undefined })}/></label>
    <button type="button" className="cpanel-link" aria-pressed={emptyPreview} onClick={() => setEmptyPreview((value) => !value)}>{emptyPreview ? "Önizlemeyi kapat" : "Boş halini önizle"}</button>
    {emptyPreview && <div className="cpanel-empty-preview" role="status">{typeof table.props.emptyText === "string" && table.props.emptyText ? table.props.emptyText : LIST_EMPTY_DEFAULT}</div>}
    <div className="cpanel-q">Ne zaman görünsün?</div>
    {props.visibility ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Her zaman</button></div>}
    <LegacySettings props={table.props} known={KNOWN}/>
  </>;

  return <ComponentPanel nameLabel="Liste başlığı" name={typeof table.props.title === "string" ? table.props.title : ""} onRename={(title) => patch({ title: title || undefined })}
    whatTitle="Ne listelensin?" basicsTitle={null} what={what} basics={basics} actions={actionsPart} appearance={appearance}>
    <div className="cpanel-ask"><b>Aradığın alan ya da liste yok mu?</b> Örneğin “Son ödeme tarihi” kolonu gibi. <a href="#my-requests" onClick={props.onLeave}>Yazılımcıdan iste →</a></div>
  </ComponentPanel>;
}
