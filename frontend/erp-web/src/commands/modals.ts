/**
 * What counts as an open modal for keyboard routing: `aria-modal` overlays and native dialogs opened with
 * `showModal()` (`dialog[open]`). Page shortcuts are blocked while one is open, and only a form inside the topmost
 * one may save.
 */
export const MODAL_SELECTOR = '[aria-modal="true"], dialog[open]';

// A modal left mounted inside a hidden keep-alive view must not block shortcuts of the active view.
export function openModals(): Element[] {
  return Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter((el) => !el.closest('[hidden]'));
}
