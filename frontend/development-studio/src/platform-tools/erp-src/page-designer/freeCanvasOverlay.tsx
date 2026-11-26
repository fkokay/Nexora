// Serbest gövde tuvalinin (ekler planı, madde 6) sürükle-bırak katmanı: ERP'nin bildirdiği bölüm ve üye kutularının üstünde
// bileşeni bölüm içinde ve bölümler arasında taşıma, bölümü sıralama (sekmeli sayfada sekme düğmesine bırakınca o sekmeye),
// paletten bölüme konumlu bırakma, bırakma çizgisi ve üstüne gelinen bileşende tür etiketi. Tıklama ve fare hareketi tuvalin
// seçim katmanına (ErpCanvasFrame) kabarcıklanır. Kutular kayıtlı taslağı gösterdiği için tanımla geçici olarak ayrışabilir:
// yalnız ikisinde de olan kimlikler için denetim çizilir. Kayıt kartı tuvali (RecordCanvasOverlay) ayrıdır.
import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { CanvasBlock } from "./erpCanvasProtocol";
import {
  FREE_PALETTE_REFUSED, FREE_SECTIONS_PLACE, freeDropAt, freeDropMarker, freeDropRefusal, freePaletteDrop, type FreeDrop, type FreeMoving, type Point,
} from "./freeCanvasHit";
import { consultantKindFromKey, consultantLayerLabel } from "./panel/consultantPalette";
import { DEFAULT_BLOCK_TITLE, freeBlocks, isFreeItem, moveBlockTo, moveItemToBlock } from "./panel/freeModel";
import { stringList, type ModelDefinition } from "./panel/listPanelModel";

/** Paletten gelen öğenin türü (sol panelin sürükleme biçimi). */
export const PALETTE_DRAG = "application/x-nexora-component";
/** Tuvalde taşınan bileşen ve bölüm (kimlik). */
export const FREE_ITEM_DRAG = "application/x-nexora-free-item";
export const FREE_BLOCK_DRAG = "application/x-nexora-free-block";

export type FreeCanvasOverlayProps = {
  blocks: CanvasBlock[];
  def: ModelDefinition;
  /** Düzenleme kapalı: sürükleme yok, yalnız tür etiketi. */
  disabled?: boolean;
  /** Paletten sürüklenen öğenin anahtarı (tarayıcı sürükleme sırasında veriyi okutmaz; türü çağıran bilir). */
  paletteKey: () => string | null;
  onChange: (next: ModelDefinition) => void;
  onSelect: (id: string) => void;
  /** Bırakma reddedildi; danışmana gerekçe gösterilir. */
  onRefuse: (reason: string) => void;
};

const ACCENT = "#6b4de6";
const REFUSED = "#b42318";
const auto: CSSProperties = { position: "absolute", pointerEvents: "auto", boxSizing: "border-box" };
const at = (b: { x: number; y: number; width?: number; height?: number }): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
const contains = (b: CanvasBlock, p: Point) => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const tagStyle = (b: CanvasBlock): CSSProperties => ({
  position: "absolute", pointerEvents: "none", left: b.x, top: Math.max(0, b.y - 18), height: 16, padding: "0 6px", borderRadius: 4,
  background: ACCENT, color: "#fff", font: "600 10px/16px inherit", whiteSpace: "nowrap",
});

export function FreeCanvasOverlay(props: FreeCanvasOverlayProps) {
  const { blocks, def, disabled } = props;
  const [hover, setHover] = useState<Point | null>(null);
  const [drop, setDrop] = useState<FreeDrop>(null);
  const [outside, setOutside] = useState<(Point & { reason: string }) | null>(null);
  const moving = useRef<FreeMoving>(null);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const sections = freeBlocks(def).filter((block) => byId.has(block.id));
  const items = sections.flatMap((section) => stringList(section.props.members)
    .map((id) => def.components.find((component) => component.id === id && isFreeItem(component)))
    .filter((component): component is NonNullable<typeof component> => !!component && byId.has(component.id)));

  const local = (event: { clientX: number; clientY: number; currentTarget: EventTarget & Element }): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const kindOf = (types: readonly string[]): "item" | "block" | null => {
    if (types.includes(FREE_ITEM_DRAG)) return "item";
    if (types.includes(FREE_BLOCK_DRAG)) return "block";
    if (!types.includes(PALETTE_DRAG)) return null;
    const key = props.paletteKey();
    return key && consultantKindFromKey(key) === "sections" ? "block" : "item";
  };
  const target = (event: DragEvent<HTMLDivElement>) => {
    const kind = disabled ? null : kindOf(Array.from(event.dataTransfer.types));
    return kind ? freeDropAt(blocks, def, local(event), kind) : null;
  };
  // Paletten gelen öğe bölüm dışında da kabul edilir: bırakınca neden söylenir (yoksa sessizce hiçbir şey olmaz).
  const outsideReason = (event: DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer.types);
    if (disabled || !types.includes(PALETTE_DRAG)) return null;
    return kindOf(types) === "block" ? FREE_SECTIONS_PLACE : FREE_PALETTE_REFUSED;
  };
  const dragOver = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const next = target(event);
    if (!next) {
      if (drop) setDrop(null);
      const reason = outsideReason(event);
      if (!reason) { if (outside) setOutside(null); return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const point = local(event);
      if (outside?.reason !== reason || outside.x !== point.x || outside.y !== point.y) setOutside({ ...point, reason });
      return;
    }
    if (outside) setOutside(null);
    // Ret de bırakılabilir olmalı: gerekçe bırakınca gösterilir (yoksa `drop` hiç gelmez).
    event.preventDefault();
    event.dataTransfer.dropEffect = Array.from(event.dataTransfer.types).includes(PALETTE_DRAG) ? "copy" : "move";
    if (JSON.stringify(drop) !== JSON.stringify(next)) setDrop(next);
  };
  const dropHere = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setDrop(null);
    setOutside(null);
    const where = target(event);
    const was = moving.current;
    moving.current = null;
    if (!where) {
      const reason = outsideReason(event);
      if (reason) { event.preventDefault(); props.onRefuse(reason); }
      return;
    }
    event.preventDefault();
    const itemId = event.dataTransfer.getData(FREE_ITEM_DRAG);
    const blockId = event.dataTransfer.getData(FREE_BLOCK_DRAG);
    const key = event.dataTransfer.getData(PALETTE_DRAG);
    const source: FreeMoving = itemId ? { itemId } : blockId ? { blockId } : null;
    const refused = freeDropRefusal(def, where, source ?? was);
    if (refused) { props.onRefuse(refused); return; }
    if (itemId && where.kind === "item") {
      const result = moveItemToBlock(def, itemId, where.blockId, where.index);
      if ("reason" in result) { props.onRefuse(result.reason); return; }
      if (result.def !== def) props.onChange(result.def);
      props.onSelect(itemId);
      return;
    }
    if (blockId && where.kind === "block") {
      const next = moveBlockTo(def, blockId, where.tabIndex, where.index);
      if (next !== def) props.onChange(next);
      props.onSelect(blockId);
      return;
    }
    if (key) {
      const added = freePaletteDrop(def, key, where);
      if ("reason" in added) { props.onRefuse(added.reason); return; }
      props.onChange(added.def);
      props.onSelect(added.id);
    }
  };
  const dragLeave = (event: DragEvent<HTMLDivElement>) => {
    const to = event.relatedTarget as Node | null;
    if (!to || !event.currentTarget.contains(to)) { setDrop(null); setOutside(null); }
  };
  const startDrag = (mime: string, id: string) => (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.dataTransfer.setData(mime, id);
    event.dataTransfer.effectAllowed = "move";
    moving.current = mime === FREE_ITEM_DRAG ? { itemId: id } : { blockId: id };
  };
  const endDrag = () => { moving.current = null; setDrop(null); setOutside(null); };

  const marker = freeDropMarker(blocks, def, drop);
  const refusal = freeDropRefusal(def, drop, moving.current);
  const hoveredItem = hover && !drop ? items.find((item) => contains(byId.get(item.id)!, hover)) : undefined;
  const hoveredSection = hover && !drop && !hoveredItem ? sections.find((section) => contains(byId.get(section.id)!, hover)) : undefined;
  const tagged = hoveredItem ? { box: byId.get(hoveredItem.id)!, label: consultantLayerLabel(hoveredItem) ?? "Bileşen" }
    : hoveredSection ? { box: byId.get(hoveredSection.id)!, label: DEFAULT_BLOCK_TITLE } : null;

  return <div className="fco" style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
    onMouseMove={(event) => setHover(local(event))} onMouseLeave={() => setHover(null)}
    onDragOver={dragOver} onDragLeave={dragLeave} onDrop={dropHere}>
    {!disabled && sections.map((section) => <div key={`block-${section.id}`} className="fco-block" draggable data-id={section.id}
      onDragStart={startDrag(FREE_BLOCK_DRAG, section.id)} onDragEnd={endDrag} style={{ ...auto, ...at(byId.get(section.id)!), cursor: "grab" }}/>)}
    {!disabled && items.map((item) => <div key={`item-${item.id}`} className="fco-item" draggable data-id={item.id}
      onDragStart={startDrag(FREE_ITEM_DRAG, item.id)} onDragEnd={endDrag} style={{ ...auto, ...at(byId.get(item.id)!), cursor: "grab" }}/>)}
    {tagged && <span className="fco-tag" aria-hidden="true" style={tagStyle(tagged.box)}>{tagged.label}</span>}
    {marker && <div className={`fco-marker${refusal ? " is-refused" : ""}`} aria-hidden="true" title={refusal ?? undefined}
      style={{ position: "absolute", pointerEvents: "none", ...at(marker), background: refusal ? REFUSED : ACCENT, borderRadius: 2 }}/>}
    {outside && <span className="fco-refusal" role="status" style={{ position: "absolute", pointerEvents: "none", left: outside.x + 12, top: outside.y + 12,
      padding: "2px 6px", borderRadius: 4, background: REFUSED, color: "#fff", font: "600 11px/1.4 inherit", whiteSpace: "nowrap" }}>{outside.reason}</span>}
    {marker && refusal && <span className="fco-refusal" role="status" style={{ position: "absolute", pointerEvents: "none", left: marker.x, top: marker.y + marker.height + 4,
      padding: "2px 6px", borderRadius: 4, background: REFUSED, color: "#fff", font: "600 11px/1.4 inherit", whiteSpace: "nowrap" }}>{refusal}</span>}
  </div>;
}
