// Tasarımcının modal pencereleri (Tüm ayarlar, Yeni sorgu / Düzenle): açıkken tuval kısayollarını durdurur, odağı tutar.
import { useEffect, useRef, type RefObject } from "react";

export type DesignerModalKind = "settings" | "query";
const openModals: Record<DesignerModalKind, number> = { settings: 0, query: 0 };

/**
 * Tuval kısayolu bu olayda çalışmamalı mı? Sorgu penceresi açıkken hiçbiri çalışmaz (taslak yerel düzenlenir);
 * Tüm ayarlar penceresinde yalnız Ctrl+Z / Ctrl+Y / Ctrl+S çalışır (değişiklikler sayfaya hemen işlenir).
 */
export function designerShortcutsBlocked(event: KeyboardEvent): boolean {
  if (openModals.query > 0) return true;
  if (openModals.settings === 0) return false;
  const key = event.key.toLowerCase();
  return !((event.ctrlKey || event.metaKey) && (key === "z" || key === "y" || key === "s"));
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Modalı kayda alır, açılınca odağı içine taşır, Tab'ı içerde döndürür ve Esc ile kapatır; kapanınca odak geri döner. */
export function useDesignerModal(kind: DesignerModalKind, open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    openModals[kind]++;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const root = ref.current;
      if (root && !root.contains(document.activeElement)) (root.querySelector<HTMLElement>("[data-autofocus]") ?? root.querySelector<HTMLElement>(FOCUSABLE) ?? root).focus();
    });
    const onKey = (event: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      // Üstte başka bir modal (ör. Tüm ayarlar içinden açılan sorgu penceresi) varsa olay onundur.
      const topmost = [...document.querySelectorAll<HTMLElement>("[data-pd-modal]")].pop();
      if (topmost && topmost !== root) return;
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape") {
        // SQL düzenleyicisi Esc'i öneri listesini kapatmak için kullanır.
        if (target?.closest(".monaco-editor")) return;
        event.preventDefault(); event.stopPropagation(); close.current();
        return;
      }
      if (event.key !== "Tab" || target?.closest(".monaco-editor")) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
      if (items.length === 0) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (!root.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      openModals[kind]--;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, kind, ref]);
}
