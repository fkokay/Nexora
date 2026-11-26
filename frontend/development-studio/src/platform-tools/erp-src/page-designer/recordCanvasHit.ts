// Kayıt kartı tuvali (taslak 08): ERP'nin bildirdiği kutulardan bırakma yeri ve bırakma çizgisi. Saf işlevler.
// Sıralar her zaman modeldeki dizinin (`section.props.inputs`, sekmenin blok kimlikleri) sırasıdır: koşulla gizli (kutusu
// olmayan) alan ya da blok sırayı kaydırmaz.
import type { CanvasBlock } from "./erpCanvasProtocol";
import { stringList, type ModelComponent, type ModelDefinition } from "./panel/listPanelModel";
import { recordTabs } from "./panel/recordModel";

export type RecordDrop = { kind: "field"; sectionId: string; index: number } | { kind: "block"; tabIndex: number; index: number } | null;
export type Point = { x: number; y: number };
export type MarkerBox = { x: number; y: number; width: number; height: number };

const MARKER = 3;
const contains = (b: CanvasBlock, p: Point) => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
const isSection = (component: ModelComponent) => component.type === "formCard" && component.props.slot === "section";
const boxMap = (blocks: CanvasBlock[]) => new Map(blocks.map((block) => [block.id, block]));

/** Etkin sekmenin bölümleri (sekmedeki sırayla). */
export function tabSections(def: ModelDefinition, activeTab: number): ModelComponent[] {
  const ids = recordTabs(def)[activeTab]?.ids ?? [];
  return ids.map((id) => def.components.find((component) => component.id === id && isSection(component))).filter((item): item is ModelComponent => !!item);
}

/** Bölümün görünen alan kutuları okuma sırasıyla (üstten alta, soldan sağa) ve her birinin `inputs` sırası. */
function visibleFields(section: ModelComponent, byId: Map<string, CanvasBlock>) {
  const inputs = stringList(section.props.inputs);
  return inputs.map((id, index) => ({ index, box: byId.get(id) })).filter((item): item is { index: number; box: CanvasBlock } => !!item.box)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

const fieldBefore = (p: Point, f: CanvasBlock) => p.y < f.y || (p.y < f.y + f.height && p.x < f.x + f.width / 2);

/** Sürüklenen alanın ya da bloğun bırakılacağı yer; uymuyorsa null. */
export function recordDropAt(blocks: CanvasBlock[], def: ModelDefinition, activeTab: number, point: Point, dragging: "field" | "block"): RecordDrop {
  const byId = boxMap(blocks);
  if (dragging === "field") {
    const section = tabSections(def, activeTab).find((item) => { const b = byId.get(item.id); return !!b && contains(b, point); });
    if (!section) return null;
    const before = visibleFields(section, byId).find((item) => fieldBefore(point, item.box));
    return { kind: "field", sectionId: section.id, index: before ? before.index : stringList(section.props.inputs).length };
  }
  const tab = recordTabs(def)[activeTab];
  if (!tab) return null;
  const visible = tab.ids.map((id, index) => ({ index, box: byId.get(id) })).filter((item): item is { index: number; box: CanvasBlock } => !!item.box);
  if (visible.length > 0) {
    const left = Math.min(...visible.map((item) => item.box.x));
    const right = Math.max(...visible.map((item) => item.box.x + item.box.width));
    if (point.x < left || point.x >= right) return null;
  }
  const before = visible.find((item) => point.y < item.box.y + item.box.height / 2);
  return { kind: "block", tabIndex: activeTab, index: before ? before.index : tab.ids.length };
}

/** Bırakma çizgisi: alan için hedef alanın önünde (ya da son alanın arkasında) dikey, blok için bloklar arasında yatay. */
export function recordDropMarker(blocks: CanvasBlock[], def: ModelDefinition, drop: RecordDrop): MarkerBox | null {
  if (!drop) return null;
  const byId = boxMap(blocks);
  if (drop.kind === "field") {
    const section = def.components.find((component) => component.id === drop.sectionId && isSection(component));
    const sectionBox = section ? byId.get(section.id) : undefined;
    if (!section || !sectionBox) return null;
    const fields = visibleFields(section, byId);
    const next = fields.filter((item) => item.index >= drop.index).sort((a, b) => a.index - b.index)[0];
    if (next) return { x: next.box.x - 2, y: next.box.y, width: MARKER, height: next.box.height };
    const last = fields[fields.length - 1];
    if (last) return { x: last.box.x + last.box.width + 1, y: last.box.y, width: MARKER, height: last.box.height };
    return { x: sectionBox.x + 8, y: sectionBox.y + 8, width: MARKER, height: Math.max(0, sectionBox.height - 16) };
  }
  const tab = recordTabs(def)[drop.tabIndex];
  if (!tab) return null;
  const visible = tab.ids.map((id, index) => ({ index, box: byId.get(id) })).filter((item): item is { index: number; box: CanvasBlock } => !!item.box);
  const next = visible.find((item) => item.index >= drop.index);
  if (next) return { x: next.box.x, y: next.box.y - 11, width: next.box.width, height: MARKER };
  const last = visible[visible.length - 1];
  return last ? { x: last.box.x, y: last.box.y + last.box.height + 4, width: last.box.width, height: MARKER } : null;
}
