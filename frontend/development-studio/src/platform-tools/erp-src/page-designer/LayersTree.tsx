import { useEffect, useMemo, useRef, type DragEvent } from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { buildLayerTree, filterLayerTree, matchesTerm, type ChildGroup } from "./leftPanelModel";

/** Katmanlar bölümünün bir bileşeni; `children` sekme/pencere sahipliğidir (sekme etiketiyle). */
export type LayerItem = { id: string; name?: string; label: string; typeLabel: string; span: number; icon: LucideIcon; children: ChildGroup[] };

type Props = {
  items: LayerItem[];
  search: string;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  dropTarget: { index: number; edge: "before" | "after" } | null;
  onDragStart: (index: number, id: string, event: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (index: number, edge: "before" | "after") => void;
  onDrop: (index: number, event: DragEvent) => void;
  onMove: (index: number, delta: number) => void;
  /** Kök (üst düzey) bileşen sayısı: `items` bunlardan sonra kartların çocuklarını da taşıyabilir. */
  rootCount?: number;
};

/**
 * Katman ağacı: sekme ve pencere içindeki bileşenler sahibinin altında girintili. Kök katmanlar sürüklenerek ya da oklarla
 * taşınır; iç katmanların yeri sahibinin ayarlarından değişir. Tuvalde seçilen bileşen burada vurgulanır ve görünür kaydırılır.
 */
export default function LayersTree({ items, search, canEdit, selectedId, onSelect, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop, onMove, rootCount }: Props) {
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const tree = useMemo(() => buildLayerTree(items, (item) => item.children), [items]);
  const visible = useMemo(() => filterLayerTree(tree, (id) => {
    const item = byId.get(id);
    return !!item && matchesTerm(search, item.label, item.typeLabel, item.name, item.id);
  }), [tree, byId, search]);
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const element = listRef.current.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(selectedId)}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (items.length === 0) return <p className="pd-empty-note">Sayfada henüz bileşen yok.</p>;
  if (visible.length === 0) return <p className="pd-empty-note">“{search.trim()}” ile eşleşen katman yok.</p>;
  const last = (rootCount ?? items.length) - 1;
  return <ol className="pd-layers pd-layer-tree" ref={listRef}>{visible.map((node) => {
    const item = byId.get(node.id);
    if (!item) return null;
    const Icon = item.icon;
    const root = node.depth === 0;
    const index = node.index;
    const drop = root && dropTarget?.index === index ? `drop-${dropTarget.edge}-v` : "";
    return <li key={node.id} data-layer-id={node.id} className={`${selectedId === node.id ? "is-selected" : ""} ${drop}`} style={{ paddingLeft: 2 + node.depth * 14 }}
      draggable={canEdit && root}
      onDragStart={root ? (event) => onDragStart(index, node.id, event) : undefined}
      onDragEnd={root ? onDragEnd : undefined}
      onDragOver={root ? (event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); onDragOver(index, event.clientY < rect.top + rect.height / 2 ? "before" : "after"); } : undefined}
      onDrop={root ? (event) => onDrop(dropTarget?.index === index && dropTarget.edge === "after" ? index + 1 : index, event) : undefined}>
      <button type="button" className="pd-layer-open" aria-current={selectedId === node.id ? "true" : undefined} onClick={() => onSelect(node.id)}><Icon size={14}/>
        <span><b>{item.label}</b><small>{node.group ? `${node.group} · ` : ""}{item.typeLabel} · {item.span}/12</small></span></button>
      {root && <span className="pd-layer-actions">
        <button type="button" title="Yukarı taşı" aria-label="Yukarı taşı" disabled={!canEdit || index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={13}/></button>
        <button type="button" title="Aşağı taşı" aria-label="Aşağı taşı" disabled={!canEdit || index === last} onClick={() => onMove(index, 1)}><ArrowDown size={13}/></button>
      </span>}
    </li>;
  })}</ol>;
}
