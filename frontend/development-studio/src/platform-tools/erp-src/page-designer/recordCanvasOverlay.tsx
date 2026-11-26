// Kayıt kartı tuvalinin (taslak 08, Studio görünümü) denetimleri: ERP'nin bildirdiği kutuların üstünde sürükle-bırak, bırakma
// çizgisi, bölümde 1/2/3 kolon, alanda ✕, "+ Bölüm ekle", "+ Sekme" ve sekme geçişi. Tıklamalar ve fare hareketi tuvalin
// seçim katmanına (ErpCanvasFrame) kabarcıklanır; denetimlerin tıklaması kabarcıklanmaz. Kutular kayıtlı taslağı gösterdiği
// için tanımla geçici olarak ayrışabilir: yalnız ikisinde de olan kimlikler için denetim çizilir.
import { useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { CanvasBlock } from "./erpCanvasProtocol";
import { stringList, type ModelDefinition } from "./panel/listPanelModel";
import { RECORD_BLOCK_DRAG, RECORD_COLUMN_DRAG, type RecordBlockKind } from "./panel/RecordFieldList";
import {
  addSection, addTab, fieldRemovalBlocked, MAX_RECORD_TABS, MAX_TAB_BLOCKS, moveBlock, moveField, recordTabs, removeField, setSectionColumns,
} from "./panel/recordModel";
import type { RecordSelection } from "./panel/templateGuards";
import { recordDropAt, recordDropMarker, tabSections, type Point, type RecordDrop } from "./recordCanvasHit";

/** Tuvalde taşınan alan (girdi kimliği) ve blok (bölüm, satır tablosu, not kimliği). */
export const RECORD_FIELD_DRAG = "application/x-nexora-record-field";
export const RECORD_MOVE_DRAG = "application/x-nexora-record-move";

export type RecordCanvasOverlayProps = {
  blocks: CanvasBlock[];
  def: ModelDefinition;
  activeTab: number;
  selection: RecordSelection | null;
  onChange: (next: ModelDefinition) => void;
  onSelect: (selection: RecordSelection) => void;
  onShowTab: (index: number) => void;
  /** Düzenleme kapalı: yalnız sekme geçişi kalır. */
  disabled?: boolean;
  /** Sol listeden kolon bırakıldı (katalog kolonu çağıranda çözülür). */
  onDropColumn?: (code: string, sectionId: string, index: number) => void;
  /** Sol listeden satır tablosu ya da açıklama bırakıldı (kaynak seçimi çağıranda). */
  onDropBlock?: (kind: RecordBlockKind, tabIndex: number, index: number) => void;
};

const ACCENT = "#6b4de6";
const auto: CSSProperties = { position: "absolute", pointerEvents: "auto", boxSizing: "border-box" };
const chip: CSSProperties = { ...auto, border: `1px solid #d9d0fb`, borderRadius: 6, background: "#fff", color: ACCENT, font: "600 11px/1 inherit", cursor: "pointer", padding: "0 8px" };
const at = (b: { x: number; y: number; width?: number; height?: number }): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
const contains = (b: CanvasBlock, p: Point) => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const stop = (event: MouseEvent) => event.stopPropagation();
const kindOf = (types: readonly string[]): "field" | "block" | null =>
  types.includes(RECORD_COLUMN_DRAG) || types.includes(RECORD_FIELD_DRAG) ? "field"
    : types.includes(RECORD_BLOCK_DRAG) || types.includes(RECORD_MOVE_DRAG) ? "block" : null;

export function RecordCanvasOverlay(props: RecordCanvasOverlayProps) {
  const { blocks, def, activeTab, selection, disabled } = props;
  const [hover, setHover] = useState<Point | null>(null);
  const [drop, setDrop] = useState<RecordDrop>(null);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const tabs = recordTabs(def);
  const tab = tabs[activeTab];
  const tabsId = def.components.find((component) => component.type === "tabs" && component.props.slot === "tabs")?.id;
  const tabBoxes = tabsId ? tabs.map((item, index) => ({ index, label: item.label, box: byId.get(`${tabsId}#tab${index}`) }))
    .filter((item): item is { index: number; label: string; box: CanvasBlock } => !!item.box) : [];
  const sections = tabSections(def, activeTab).filter((section) => byId.has(section.id));
  const tabBlocks = (tab?.ids ?? []).filter((id) => byId.has(id) && def.components.some((component) => component.id === id));
  const fields = sections.flatMap((section) => stringList(section.props.inputs).filter((id) => byId.has(id) && def.components.some((component) => component.id === id))
    .map((id) => ({ id, sectionId: section.id })));

  const local = (event: { clientX: number; clientY: number; currentTarget: EventTarget & Element }): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const hoveredSection = hover ? sections.find((section) => contains(byId.get(section.id)!, hover)) : undefined;
  const hoveredField = hover ? fields.find((field) => contains(byId.get(field.id)!, hover)) : undefined;
  const columnsFor = new Set<string>();
  if (hoveredSection) columnsFor.add(hoveredSection.id);
  if (selection?.kind === "section" && sections.some((section) => section.id === selection.id)) columnsFor.add(selection.id);

  const dragOver = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const kind = disabled ? null : kindOf(Array.from(event.dataTransfer.types));
    if (!kind) return;
    const next = recordDropAt(blocks, def, activeTab, local(event), kind);
    if (!next) { if (drop) setDrop(null); return; }
    event.preventDefault();
    const types = Array.from(event.dataTransfer.types);
    event.dataTransfer.dropEffect = types.includes(RECORD_COLUMN_DRAG) || types.includes(RECORD_BLOCK_DRAG) ? "copy" : "move";
    if (!drop || drop.kind !== next.kind || JSON.stringify(drop) !== JSON.stringify(next)) setDrop(next);
  };
  const dropHere = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setDrop(null);
    const types = Array.from(event.dataTransfer.types);
    const kind = disabled ? null : kindOf(types);
    const target = kind ? recordDropAt(blocks, def, activeTab, local(event), kind) : null;
    if (!target) return;
    event.preventDefault();
    if (target.kind === "field") {
      const column = event.dataTransfer.getData(RECORD_COLUMN_DRAG);
      if (column) { props.onDropColumn?.(column, target.sectionId, target.index); return; }
      const inputId = event.dataTransfer.getData(RECORD_FIELD_DRAG);
      if (!inputId) return;
      const own = stringList(def.components.find((component) => component.id === target.sectionId)?.props.inputs).indexOf(inputId);
      const next = moveField(def, inputId, target.sectionId, own >= 0 && own < target.index ? target.index - 1 : target.index);
      if (next !== def) props.onChange(next);
      return;
    }
    const kindName = event.dataTransfer.getData(RECORD_BLOCK_DRAG);
    if (kindName === "lines" || kindName === "note") { props.onDropBlock?.(kindName, target.tabIndex, target.index); return; }
    const blockId = event.dataTransfer.getData(RECORD_MOVE_DRAG);
    if (!blockId) return;
    const own = tabs[target.tabIndex]?.ids.indexOf(blockId) ?? -1;
    const next = moveBlock(def, blockId, target.tabIndex, own >= 0 && own < target.index ? target.index - 1 : target.index);
    if (next !== def) props.onChange(next);
  };
  const dragLeave = (event: DragEvent<HTMLDivElement>) => {
    const to = event.relatedTarget as Node | null;
    if (!to || !event.currentTarget.contains(to)) setDrop(null);
  };
  const startDrag = (mime: string, id: string) => (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.dataTransfer.setData(mime, id);
    event.dataTransfer.effectAllowed = "move";
  };

  const marker = recordDropMarker(blocks, def, drop);
  const lastBlock = tabBlocks.length > 0 ? byId.get(tabBlocks[tabBlocks.length - 1]) : undefined;
  const lastTab = tabBoxes[tabBoxes.length - 1]?.box;
  const addSectionAt = lastBlock ? { x: lastBlock.x, y: lastBlock.y + lastBlock.height + 8 } : lastTab ? { x: lastTab.x, y: lastTab.y + lastTab.height + 12 } : null;

  const controls: ReactNode[] = [];
  if (!disabled) {
    for (const id of tabBlocks) {
      const b = byId.get(id)!;
      controls.push(<div key={`move-${id}`} className="rco-drag" draggable onDragStart={startDrag(RECORD_MOVE_DRAG, id)} onDragEnd={() => setDrop(null)}
        style={{ ...auto, ...at(b), cursor: "grab" }}/>);
    }
    for (const field of fields) {
      const b = byId.get(field.id)!;
      controls.push(<div key={`field-${field.id}`} className="rco-drag" draggable onDragStart={startDrag(RECORD_FIELD_DRAG, field.id)} onDragEnd={() => setDrop(null)}
        style={{ ...auto, ...at(b), cursor: "grab" }}/>);
    }
    for (const id of columnsFor) {
      const b = byId.get(id)!;
      const current = def.components.find((component) => component.id === id)?.props.columns ?? 2;
      controls.push(<span key={`cols-${id}`} className="rco-cols" role="group" aria-label="Kolon sayısı"
        style={{ ...auto, left: b.x + b.width - 96, top: b.y + 6, display: "flex", gap: 2 }}>
        {([1, 2, 3] as const).map((count) => <button key={count} type="button" aria-label={`${count} kolon`} aria-pressed={current === count}
          style={{ ...chip, position: "static", width: 28, height: 22, padding: 0, background: current === count ? ACCENT : "#fff", color: current === count ? "#fff" : ACCENT }}
          onClick={(event) => { stop(event); const next = setSectionColumns(def, id, count); if (next !== def) props.onChange(next); }}>{count}</button>)}
      </span>);
    }
    if (hoveredField) {
      const b = byId.get(hoveredField.id)!;
      const blocked = fieldRemovalBlocked(def, hoveredField.id);
      controls.push(<button key="remove" type="button" className="rco-remove" aria-label="Alanı kaldır" title={blocked ?? "Alanı karttan çıkar"} disabled={!!blocked}
        style={{ ...chip, left: b.x + b.width - 22, top: b.y + 2, width: 20, height: 20, padding: 0, color: blocked ? "#aaa" : "#b42318" }}
        onClick={(event) => {
          stop(event);
          const next = removeField(def, hoveredField.id);
          if (next === def) return;
          props.onChange(next);
          if (selection?.kind === "field" && selection.id === hoveredField.id) props.onSelect({ kind: "section", id: hoveredField.sectionId });
        }}>✕</button>);
    }
    if (addSectionAt && tab) {
      const full = tab.ids.length >= MAX_TAB_BLOCKS;
      controls.push(<button key="add-section" type="button" className="rco-add-section" aria-label="+ Bölüm ekle" disabled={full}
        title={full ? `Bir sekmede en çok ${MAX_TAB_BLOCKS} blok olur.` : undefined}
        style={{ ...chip, left: addSectionAt.x, top: addSectionAt.y, height: 28, borderStyle: "dashed" }}
        onClick={(event) => {
          stop(event);
          const added = addSection(def, activeTab);
          if (!added.sectionId) return;
          props.onChange(added.def);
          props.onSelect({ kind: "section", id: added.sectionId });
        }}>+ Bölüm ekle</button>);
    }
    if (lastTab) {
      const full = tabs.length >= MAX_RECORD_TABS;
      controls.push(<button key="add-tab" type="button" className="rco-add-tab" aria-label="+ Sekme" disabled={full}
        title={full ? `En çok ${MAX_RECORD_TABS} sekme olur.` : undefined}
        style={{ ...chip, left: lastTab.x + lastTab.width + 6, top: lastTab.y, height: lastTab.height, borderStyle: "dashed" }}
        onClick={(event) => {
          stop(event);
          const added = addTab(def);
          if (added.tabIndex < 0) return;
          props.onChange(added.def);
          props.onShowTab(added.tabIndex);
        }}>+ Sekme</button>);
    }
  }
  for (const item of tabBoxes) {
    controls.push(<button key={`tab-${item.index}`} type="button" className="rco-tab" aria-label={`${item.label} sekmesini göster`} aria-pressed={item.index === activeTab}
      style={{ ...auto, ...at(item.box), border: 0, background: "transparent", cursor: "pointer" }}
      onClick={(event) => { stop(event); props.onShowTab(item.index); }}/>);
  }

  return <div className="rco" style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
    onMouseMove={(event) => setHover(local(event))} onMouseLeave={() => setHover(null)}
    onDragOver={dragOver} onDragLeave={dragLeave} onDrop={dropHere}>
    {controls}
    {marker && <div className="rco-marker" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none", ...at(marker), background: ACCENT, borderRadius: 2 }}/>}
  </div>;
}
