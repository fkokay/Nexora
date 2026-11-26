// Serbest gövde tuvali (ekler planı, madde 6): ERP'nin bildirdiği kutulardan bırakma yeri, bırakma çizgisi, ret gerekçesi ve
// paletten bırakma. Saf işlevler. Sıralar her zaman modeldeki dizinin (bölümün `members`'ı, sekmenin bölüm kimlikleri, sekmesiz
// sayfada bölüm sırası) sırasıdır: kutusu olmayan (koşulla gizli, başka sekmedeki) üye ya da bölüm sırayı kaydırmaz.
import type { CanvasBlock } from "./erpCanvasProtocol";
import { consultantAvailability, consultantKindFromKey, isCreatableKind } from "./panel/consultantPalette";
import {
  addBlock, addItem, FREE_BLOCK_FULL, FREE_BLOCKS_FULL, freeBlocks, freeFullRow, freeTabs, isFreeBlock, MAX_BLOCK_MEMBERS, MAX_FREE_BLOCKS,
  moveBlockTo, shownFreeTab,
} from "./panel/freeModel";
import { stringList, type ModelComponent, type ModelDefinition } from "./panel/listPanelModel";

/**
 * Bırakma yeri: `item` bir bölümün üyeleri arasında; `block` bölümler arasında (sekmesiz sayfada `tabIndex` null). `onTab`:
 * bölüm bir sekme düğmesine bırakıldı, o sekmenin sonuna gider.
 */
export type FreeDrop = { kind: "item"; blockId: string; index: number } | { kind: "block"; tabIndex: number | null; index: number; onTab?: true } | null;
export type Point = { x: number; y: number };
export type MarkerBox = { x: number; y: number; width: number; height: number };
/** Tuvalde taşınan şey: var olan bileşen ya da bölüm; paletten gelen yeni öğede null. */
export type FreeMoving = { itemId: string } | { blockId: string } | null;

export const FREE_PALETTE_REFUSED = "Bu bileşen buraya bırakılamaz; bir bölümün içine bırakın.";
export const FREE_SECTIONS_PLACE = "Yeni bölümü bölümlerin arasına bırakın.";

const MARKER = 3;
const contains = (b: CanvasBlock, p: Point) => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const boxMap = (blocks: CanvasBlock[]) => new Map(blocks.map((block) => [block.id, block]));
const tabsIdOf = (def: ModelDefinition) => def.components.find((component) => component.type === "tabs" && component.props.slot === "tabs")?.id;

/** Görünen sekmenin (sekmesiz sayfada bütün sayfanın) bölüm kimlikleri, sırayla; ve sekme dizini. */
function shownBlockIds(def: ModelDefinition, blocks: CanvasBlock[]): { tabIndex: number | null; ids: string[] } | null {
  const tabs = freeTabs(def);
  if (!tabs) return { tabIndex: null, ids: freeBlocks(def).map((block) => block.id) };
  const shown = shownFreeTab(def, blocks.map((block) => block.id));
  return shown < 0 ? null : { tabIndex: shown, ids: tabs[shown].blockIds };
}

/** Bölümün görünen üye kutuları okuma sırasıyla (üstten alta, soldan sağa); her birinin `members` sırası ve tam satır olup olmadığı. */
function visibleMembers(def: ModelDefinition, block: ModelComponent, byId: Map<string, CanvasBlock>) {
  const find = (id: string) => def.components.find((component) => component.id === id);
  return stringList(block.props.members).map((id, index) => {
    const component = find(id);
    return { index, box: component ? byId.get(id) : undefined, full: component ? freeFullRow(component) : false };
  }).filter((item): item is { index: number; box: CanvasBlock; full: boolean } => !!item.box)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}
/** Yarım üyede okuma sırası (satırın üstünde ya da aynı satırda yarısının solunda); tam satır üyede yüksekliğin ortası. */
const memberBefore = (p: Point, item: { box: CanvasBlock; full: boolean }) => item.full ? p.y < item.box.y + item.box.height / 2
  : p.y < item.box.y || (p.y < item.box.y + item.box.height && p.x < item.box.x + item.box.width / 2);

/** Sürüklenen bileşenin ya da bölümün bırakılacağı yer; uymuyorsa null. */
export function freeDropAt(blocks: CanvasBlock[], def: ModelDefinition, point: Point, dragging: "item" | "block"): FreeDrop {
  const byId = boxMap(blocks);
  if (dragging === "item") {
    const block = def.components.find((component) => { if (!isFreeBlock(component)) return false; const b = byId.get(component.id); return !!b && contains(b, point); });
    if (!block) return null;
    const before = visibleMembers(def, block, byId).find((item) => memberBefore(point, item));
    return { kind: "item", blockId: block.id, index: before ? before.index : stringList(block.props.members).length };
  }
  const tabs = freeTabs(def);
  const tabsId = tabsIdOf(def);
  if (tabs && tabsId) {
    const onTab = tabs.findIndex((_, index) => { const b = byId.get(`${tabsId}#tab${index}`); return !!b && contains(b, point); });
    if (onTab >= 0) return { kind: "block", tabIndex: onTab, index: tabs[onTab].blockIds.length, onTab: true };
  }
  const shown = shownBlockIds(def, blocks);
  if (!shown) return null;
  const visible = shown.ids.map((id, index) => ({ index, box: byId.get(id) })).filter((item): item is { index: number; box: CanvasBlock } => !!item.box);
  if (visible.length > 0) {
    const left = Math.min(...visible.map((item) => item.box.x));
    const right = Math.max(...visible.map((item) => item.box.x + item.box.width));
    if (point.x < left || point.x >= right) return null;
  }
  const before = visible.find((item) => point.y < item.box.y + item.box.height / 2);
  return { kind: "block", tabIndex: shown.tabIndex, index: before ? before.index : shown.ids.length };
}

/**
 * Bırakma çizgisi: bileşen için hedef üyenin önünde (tam satır üyede üstünde yatay, yarım üyede solunda dikey) ya da son üyenin
 * arkasında; boş bölümde bölümün içinde. Bölüm için bölümler arasında yatay; sekme düğmesinde düğmenin altında.
 */
export function freeDropMarker(blocks: CanvasBlock[], def: ModelDefinition, drop: FreeDrop): MarkerBox | null {
  if (!drop) return null;
  const byId = boxMap(blocks);
  if (drop.kind === "item") {
    const block = def.components.find((component) => component.id === drop.blockId && isFreeBlock(component));
    const blockBox = block ? byId.get(block.id) : undefined;
    if (!block || !blockBox) return null;
    const items = visibleMembers(def, block, byId);
    const next = items.filter((item) => item.index >= drop.index).sort((a, b) => a.index - b.index)[0];
    if (next) return next.full ? { x: next.box.x, y: next.box.y - 6, width: next.box.width, height: MARKER }
      : { x: next.box.x - 2, y: next.box.y, width: MARKER, height: next.box.height };
    const last = items.filter((item) => item.index < drop.index).sort((a, b) => a.index - b.index).at(-1);
    if (last) return last.full ? { x: last.box.x, y: last.box.y + last.box.height + 3, width: last.box.width, height: MARKER }
      : { x: last.box.x + last.box.width + 1, y: last.box.y, width: MARKER, height: last.box.height };
    return { x: blockBox.x + 8, y: blockBox.y + blockBox.height - 12, width: Math.max(0, blockBox.width - 16), height: MARKER };
  }
  if (drop.onTab) {
    const tabsId = tabsIdOf(def);
    const tabBox = tabsId && drop.tabIndex !== null ? byId.get(`${tabsId}#tab${drop.tabIndex}`) : undefined;
    return tabBox ? { x: tabBox.x, y: tabBox.y + tabBox.height - MARKER, width: tabBox.width, height: MARKER } : null;
  }
  const tabs = freeTabs(def);
  const ids = drop.tabIndex === null ? freeBlocks(def).map((block) => block.id) : tabs?.[drop.tabIndex]?.blockIds ?? [];
  const visible = ids.map((id, index) => ({ index, box: byId.get(id) })).filter((item): item is { index: number; box: CanvasBlock } => !!item.box);
  const next = visible.find((item) => item.index >= drop.index);
  if (next) return { x: next.box.x, y: next.box.y - 11, width: next.box.width, height: MARKER };
  const last = visible[visible.length - 1];
  return last ? { x: last.box.x, y: last.box.y + last.box.height + 4, width: last.box.width, height: MARKER } : null;
}

/**
 * Bırakma olmayacaksa gerekçesi (5c metinleri): dolu bölüme (12) yeni ya da başka bölümden gelen bileşen; 20 bölümde paletten
 * yeni bölüm. Bölümün kendi üyesinin sırası ve var olan bölümün taşınması reddedilmez.
 */
export function freeDropRefusal(def: ModelDefinition, drop: FreeDrop, moving: FreeMoving): string | null {
  if (!drop) return null;
  if (drop.kind === "item") {
    const block = def.components.find((component) => component.id === drop.blockId && isFreeBlock(component));
    const own = block ? stringList(block.props.members) : [];
    const inside = !!moving && "itemId" in moving && own.includes(moving.itemId);
    return !inside && own.length >= MAX_BLOCK_MEMBERS ? FREE_BLOCK_FULL : null;
  }
  return !moving && def.components.filter(isFreeBlock).length >= MAX_FREE_BLOCKS ? FREE_BLOCKS_FULL : null;
}

/**
 * Paletten bırakma: Metin, Bilgi kutusu, Gösterge, Görsel ve Liste bölümün o sırasına girer; Bölümler bölümler arasına yeni boş
 * bölüm açar. Serbest gövdede kullanılamayan öğe, yanlış yer, dolu bölüm ve 20 bölüm gerekçeyle reddedilir.
 */
export function freePaletteDrop<D extends ModelDefinition>(def: D, key: string, drop: NonNullable<FreeDrop>): { def: D; id: string } | { reason: string } {
  const kind = consultantKindFromKey(key);
  if (!kind) return { reason: FREE_PALETTE_REFUSED };
  const availability = consultantAvailability(kind, "free");
  if (!availability.available) return { reason: availability.reason };
  if (kind === "sections") {
    if (drop.kind !== "block") return { reason: FREE_SECTIONS_PLACE };
    const added = addBlock(def);
    if ("reason" in added) return added;
    return { def: moveBlockTo(added.def, added.blockId, drop.tabIndex, drop.onTab ? Number.MAX_SAFE_INTEGER : drop.index), id: added.blockId };
  }
  if (drop.kind !== "item" || (kind !== "list" && !isCreatableKind(kind))) return { reason: FREE_PALETTE_REFUSED };
  const added = addItem(def, kind === "list" ? "table" : kind, { blockId: drop.blockId }, drop.index);
  return "reason" in added ? added : { def: added.def, id: added.itemId };
}
