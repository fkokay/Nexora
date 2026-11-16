import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute("inert") && element.getClientRects().length > 0,
  );
}

/**
 * Keeps keyboard focus inside `ref` while `active` is true, closes on Escape and returns focus to the element
 * that was focused before the dialog opened. Nested dialogs work: only the innermost one reacts to keys.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      if (root.contains(document.activeElement)) return;
      const target = initialFocus?.current ?? root.querySelector<HTMLElement>("[autofocus]") ?? focusables(root)[0] ?? root;
      target.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (!root) return;
      // Only the topmost open dialog handles keys.
      const open = Array.from(document.querySelectorAll<HTMLElement>("[data-ns-dialog='open']"));
      if (open[open.length - 1] !== root) return;
      if (event.key === "Escape" && escapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !root.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !root.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous && document.contains(previous)) previous.focus();
    };
    // initialFocus is only read once when the dialog opens; re-arming on every render would steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref]);
}
