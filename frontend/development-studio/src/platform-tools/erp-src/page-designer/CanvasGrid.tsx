import { cloneElement, memo, useMemo, type DragEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { useDragSelect, type DragStore } from "./dragStore";
import { useFlip } from "./useFlip";

export type CanvasBlock = { id: string; element: ReactElement<{ className?: string }> };

type Props = {
  store: DragStore;
  gridRef: RefObject<HTMLDivElement | null>;
  /** Bileşen dizisi sırasıyla bütün bloklar (gizli/sahipli olanlar dahil); öğeler sürükleme sırasında değişmez. */
  blocks: CanvasBlock[];
  /** Cihaz + bileşen sırası: değişince FLIP yeniden ölçer. */
  layoutKey: string;
  guides: ReactNode;
  empty: ReactNode;
  /** Sürüklenen şeye ve tuvaldeki konuma göre yer tutucu (konum + genişlik) ya da yok. */
  placeholderFor: (dragging: string | null, canvasDrop: number | null) => { at: number; span: number } | null;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

/**
 * Tuval ızgarası: sürükleme durumuna abone olan tek parça. Dragover'da yalnız bu bileşen yeniden çizilir; bloklar hazır
 * (önbellekli) öğeler olduğundan React onları atlar, yalnız yer tutucu ve sürüklenen bloğun sınıfı değişir.
 */
export const CanvasGrid = memo(function CanvasGrid({ store, gridRef, blocks, layoutKey, guides, empty, placeholderFor, onDragOver, onDragLeave, onDrop }: Props) {
  const dragging = useDragSelect(store, (state) => state.dragging);
  const canvasDrop = useDragSelect(store, (state) => state.canvasDrop);
  const placeholder = placeholderFor(dragging, canvasDrop);
  const at = placeholder?.at ?? null;
  const span = placeholder?.span ?? 12;
  useFlip(gridRef, `${layoutKey}|${at ?? "-"}`);
  const children = useMemo(() => {
    const node = <div key="__placeholder" data-flip="__placeholder" data-page-placeholder="" className="pd-drop-placeholder"
      style={{ gridColumn: `span ${span}` }}>Buraya bırakın</div>;
    const list = blocks.flatMap(({ id, element }, index) => {
      const block = id === dragging ? cloneElement(element, { className: `${element.props.className ?? ""} is-dragging` }) : element;
      return at === index ? [node, block] : [block];
    });
    if (at !== null && at >= blocks.length) list.push(node);
    return list;
  }, [blocks, dragging, at, span]);
  return <div ref={gridRef} className={`pd-grid ${dragging ? "is-dragging" : ""}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
    {guides}
    {blocks.length === 0 && at === null && empty}
    {children}
  </div>;
});
