import { useLayoutEffect, useRef, type RefObject } from "react";

const DURATION = 150;

/**
 * Izgaradaki blokların yer değiştirmesini canlandırır (FLIP): `key` değişince doğrudan alt öğelerden `data-flip`
 * taşıyanların önceki ve yeni konumu karşılaştırılır, fark kadar `transform` ile geri itilip 150 ms'de yerine kaydırılır.
 * Konumlar kaba göre ölçülür (kaydırmadan etkilenmez). `prefers-reduced-motion: reduce` iken canlandırma yapılmaz.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, key: string) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.flip);
    const next = new Map<string, { x: number; y: number }>();
    for (const element of items) {
      if (element.offsetParent === null) continue; // gizli (sahipli) blok
      const rect = element.getBoundingClientRect();
      next.set(element.dataset.flip!, { x: rect.left - base.left, y: rect.top - base.top });
    }
    if (!reduce) for (const element of items) {
      const before = last.current.get(element.dataset.flip!);
      const now = next.get(element.dataset.flip!);
      if (!before || !now) continue;
      const dx = before.x - now.x;
      const dy = before.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      element.style.transition = "none";
      element.style.transform = `translate(${dx}px, ${dy}px)`;
      void element.offsetWidth; // başlangıç konumunu uygula
      element.style.transition = `transform ${DURATION}ms ease`;
      element.style.transform = "";
      window.setTimeout(() => { if (element.style.transform === "") element.style.transition = ""; }, DURATION + 30);
    }
    last.current = next;
  }, [key, ref]);
}
