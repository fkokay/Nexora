import { useEffect, useRef } from "react";
import { MODAL_SELECTOR } from "../commands/modals";

/** Elements that make a record form "in a dialog" (it keeps its own buttons there). */
export const DIALOG_SELECTOR = '.modal-backdrop, .modal, [role="dialog"], [aria-modal="true"], dialog';
const FIELD_SELECTOR = 'input:not([type="hidden"]), select, textarea, [aria-invalid="true"]';
export const FOCUSABLE_FIELD_SELECTOR = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
/** Input types that take typed text (PgUp / PgDn and Esc belong to them while focused). */
const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image", "hidden"]);
/** Open pickers, list boxes and menus own arrow keys and Escape. */
const POPUP_SELECTOR = '[role="listbox"], [aria-expanded="true"]';

/** Open dialogs (modal backdrops, `aria-modal` elements, modal native dialogs) outside hidden keep-alive views. */
export function openDialogs(): Element[] {
  return Array.from(document.querySelectorAll(`.modal-backdrop, ${MODAL_SELECTOR}`)).filter((el) => !el.closest("[hidden]"));
}

/**
 * Whether this form may act on a save shortcut or command: it is not in a hidden keep-alive view, and when dialogs
 * are open (modal backdrops or `aria-modal` elements) it lives inside the topmost one.
 */
export function ownsKeyboard(form: HTMLFormElement | null): boolean {
  if (!form || form.closest("[hidden]")) return false;
  const dialogs = openDialogs();
  const topmost = dialogs[dialogs.length - 1];
  return !topmost || topmost.contains(form);
}

/** Another visible record form on screen would also take a save shortcut (it owns the keyboard as well). */
export function otherFormOwnsKeyboard(root: HTMLElement | null): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(".record-form")).some(
    (other) => other !== root && !root?.contains(other) && !other.contains(root) && ownsKeyboard(other.querySelector<HTMLFormElement>("form.rf-form")),
  );
}

/** Focus sits in another record form on the same screen: that form gets the section and record shortcuts. */
export function focusIsInOtherForm(root: HTMLElement | null): boolean {
  const active = document.activeElement;
  return !!active && !!active.closest(".record-form") && !root?.contains(active);
}

export function firstInvalidField(scope: Element | null): HTMLElement | null {
  if (!scope) return null;
  return (
    Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).find(
      (field) => field.getAttribute("aria-invalid") === "true" || field.matches(":invalid"),
    ) ?? null
  );
}

/** A control that takes typed text: text-like inputs, textarea, select, contenteditable (not checkbox / radio). */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const field = target.closest('input, textarea, select, [contenteditable="true"]');
  if (!field) return false;
  return !(field instanceof HTMLInputElement) || !NON_TEXT_INPUT_TYPES.has(field.type);
}

/** The target is inside an open picker, list box or expanded control. */
export function isInPopup(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(POPUP_SELECTOR);
}

/** The target sits in a scrollable region inside the form (e.g. a line-item table): PgUp / PgDn scroll it. */
export function isInScrollableRegion(target: EventTarget | null, root: HTMLElement | null): boolean {
  if (!(target instanceof Element) || !root) return false;
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    if (node.scrollHeight <= node.clientHeight) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return true;
  }
  return false;
}

/**
 * A window keydown listener while `enabled` (bubble phase, after field and picker handlers). The latest handler
 * is always called, so it may close over render values. Like the existing Ctrl+F2, record form keys stay out of
 * the command registry: its globals are first-match and kept-alive hidden forms would swallow them.
 */
export function useWindowKeyDown(enabled: boolean, handler: (event: KeyboardEvent) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
