import type { DragEvent, MouseEvent } from "react";
import type { ActiveCatalog } from "../catalogClient";
import { RECORD_SOURCE_HINT } from "../pageTemplates";
import { fieldKey, missingRecordColumns, recordKey, recordQuery, usedColumns } from "./recordModel";
import type { ModelDefinition } from "./listPanelModel";
import { columnTypeLabel, RECORD_MISSING_IN_CATALOG } from "./RecordPanel";
import "./component-panel.css";

export type RecordBlockKind = "lines" | "note";
/** Sol listeden sürüklenen kolonun ve bloğun veri türleri (tuvaldeki bırakma bunları okur). */
export const RECORD_COLUMN_DRAG = "application/x-nexora-record-column";
export const RECORD_BLOCK_DRAG = "application/x-nexora-record-block";

/**
 * Kayıt kartının sol alan listesi (taslak 08): kayıt kaynağının kolonları (kullanılanlar işaretli ve soluk), katalogdan kalkmış
 * kolona bağlı alanlar ("Katalogda yok"), eklenebilir bloklar ve "Yazılımcıdan iste →" bağlantısı.
 * `onAddColumn` / `onAddBlock` verilirse öğeye tıklamak da ekler (sürükleme tuvalde bırakılır).
 */
export function RecordFieldList({ def, catalog, onDragStartColumn, onDragStartBlock, onAddColumn, onAddBlock, onAskDeveloper, catalogStatus, disabled }: {
  def: ModelDefinition; catalog: ActiveCatalog | null;
  onDragStartColumn: (code: string) => void; onDragStartBlock: (kind: RecordBlockKind) => void;
  onAddColumn?: (code: string) => void; onAddBlock?: (kind: RecordBlockKind) => void;
  /** "Yazılımcıdan iste →" tıklanınca (geçişi çağıran yapar). */
  onAskDeveloper?: () => void;
  catalogStatus?: "loading" | "ready" | "failed"; disabled?: boolean;
}) {
  const code = recordQuery(def)?.dataSource;
  const source = code ? catalog?.dataSources.find((item) => item.code === code) : undefined;
  const used = usedColumns(def);
  const missing = catalog && recordKey(def) ? missingRecordColumns(def, catalog) : [];
  const fieldLabel = (column: string) => {
    const field = def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column);
    return typeof field?.props.label === "string" && field.props.label ? field.props.label : column;
  };
  const hasRecord = !!recordKey(def);
  const dragColumn = (column: string) => (event: DragEvent) => {
    event.dataTransfer.setData(RECORD_COLUMN_DRAG, column);
    event.dataTransfer.effectAllowed = "copy";
    onDragStartColumn(column);
  };
  const dragBlock = (kind: RecordBlockKind) => (event: DragEvent) => {
    event.dataTransfer.setData(RECORD_BLOCK_DRAG, kind);
    event.dataTransfer.effectAllowed = "copy";
    onDragStartBlock(kind);
  };
  const ask = (event: MouseEvent<HTMLAnchorElement>) => { if (!onAskDeveloper) return; event.preventDefault(); onAskDeveloper(); };

  return <div className="rfl" aria-label="Alanlar">
    <h4>Alanlar</h4>
    {catalogStatus === "loading" ? <p className="cpanel-note">Katalog yükleniyor…</p>
      : catalogStatus === "failed" ? <p className="cpanel-warn">Katalog okunamadı.</p>
        : !catalog ? <p className="cpanel-note">Etkin katalog sürümü yok.</p>
          : !code ? <p className="cpanel-note">{RECORD_SOURCE_HINT}</p>
            : <>
              {source && <div className="cpanel-dev">Yazılımcının hazırladığı · <b>{source.label}</b> veri kaynağı. Kullanılan alanlar işaretli.</div>}
              <ul className="rfl-items">
                {source?.columns.map((column) => {
                  const on = used.has(column.code);
                  return <li key={column.code} className={`rfl-item${on ? " is-used" : ""}`} draggable={!on && !disabled && hasRecord}
                    onDragStart={dragColumn(column.code)} title={on ? "Kartta kullanılıyor" : "Bir bölüme sürükleyin"}>
                    {onAddColumn && !on ? <button type="button" className="rfl-add" disabled={disabled} onClick={() => onAddColumn(column.code)}>{column.label || column.code}</button>
                      : <span className="rfl-name">{column.label || column.code}</span>}
                    {on && <span className="rfl-check" aria-label="Kullanılıyor">✓</span>}
                    <span className="rfl-type">{columnTypeLabel(column)}</span>
                  </li>;
                })}
                {missing.map((column) => <li key={`missing-${column}`} className="rfl-item is-used is-missing">
                  <span className="rfl-name">{fieldLabel(column)}</span><span className="rfl-tag">{RECORD_MISSING_IN_CATALOG}</span>
                </li>)}
              </ul>
            </>}
    <h4 className="rfl-gap">Ekle</h4>
    <ul className="rfl-items">
      {([["lines", "▦ Satır tablosu"], ["note", "✎ Açıklama metni"]] as const).map(([kind, label]) =>
        <li key={kind} className="rfl-item rfl-block" draggable={!disabled && hasRecord} onDragStart={dragBlock(kind)}>
          {onAddBlock ? <button type="button" className="rfl-add" disabled={disabled || !hasRecord} onClick={() => onAddBlock(kind)}>{label}</button> : <span className="rfl-name">{label}</span>}
        </li>)}
    </ul>
    <div className="cpanel-ask"><b>Aradığın alan yok mu?</b> <a href="#my-requests" onClick={ask}>Yazılımcıdan iste →</a></div>
  </div>;
}
