import { useLayoutEffect, useRef, type RefObject } from "react";

const DURATION = 150;

/**
 * Izgaradaki blokların yer değiştirmesini canlandırır (FLIP): `key` değişince doğrudan alt öğelerden `data-flip`
 * taşıyanların önceki ve yeni konumu karşılaştırılır, fark kadar `transform` ile geri itilip 150 ms'de yerine kaydırılır.
 * Konumlar kaba göre ölçülür (kaydırmadan etkilenmez). `prefers-reduced-motion: reduce` iken canlandırma yapılmaz.
 * Önce bütün konumlar okunur, sonra yalnız yeri değişen bloklara yazılır; başlangıç konumu tek bir yeniden akışla
 * uygulanır (blok başına okuma-yazma döngüsü yok).
 */
export function useFlip(ref: RefObject<HTMLElement | null>, key: string) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    // Okuma evresi.
    const base = container.getBoundingClientRect();
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { x: number; y: number }>();
    const moved: { element: HTMLElement; dx: number; dy: number }[] = [];
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || !child.dataset.flip) continue;
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && child.offsetParent === null) continue; // gizli (sahipli) blok
      const id = child.dataset.flip;
      const now = { x: rect.left - base.left, y: rect.top - base.top };
      next.set(id, now);
      const before = last.current.get(id);
      if (reduce || !before) continue;
      const dx = before.x - now.x;
      const dy = before.y - now.y;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moved.push({ element: child, dx, dy });
    }
    last.current = next;
    if (moved.length === 0) return;
    // Yazma evresi: eski konuma it, tek yeniden akışla uygula, sonra yerine kaydır.
    for (const { element, dx, dy } of moved) {
      element.style.transition = "none";
      element.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    void container.offsetWidth;
    for (const { element } of moved) {
      element.style.transition = `transform ${DURATION}ms ease`;
      element.style.transform = "";
    }
    window.setTimeout(() => { for (const { element } of moved) if (element.style.transform === "") element.style.transition = ""; }, DURATION + 30);
  }, [key, ref]);
}
