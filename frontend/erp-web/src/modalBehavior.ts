/**
 * Shared keyboard behaviour for every `.modal-backdrop` popup.
 *
 * Escape closes the topmost popup through its own close control, so each screen
 * keeps owning its state (unsaved-change guards, busy checks) and nothing needs
 * per-modal wiring. A popup that already handled Escape itself (and so removed
 * its backdrop, or called preventDefault) is left alone.
 */

const CLOSE_SELECTORS = [
  '.modal-head [aria-label="Kapat"]',
  ".modal-head .icon-button",
  '[aria-label="Kapat"]',
];

function topmostBackdrop(): HTMLElement | null {
  const backdrops = Array.from(
    document.querySelectorAll<HTMLElement>(".modal-backdrop"),
  ).filter((element) => element.getClientRects().length > 0);
  if (backdrops.length === 0) return null;
  // Highest z-index wins; among equals the later element is painted on top.
  return backdrops.reduce((top, element) => {
    const z = Number.parseInt(getComputedStyle(element).zIndex, 10) || 0;
    const topZ = Number.parseInt(getComputedStyle(top).zIndex, 10) || 0;
    return z >= topZ ? element : top;
  });
}

function closeControl(backdrop: HTMLElement): HTMLElement | null {
  for (const selector of CLOSE_SELECTORS) {
    const match = backdrop.querySelector<HTMLElement>(selector);
    if (match) return match;
  }
  // Record forms close through their "Vazgeç" command; plain popups through "Kapat".
  const buttons = Array.from(backdrop.querySelectorAll<HTMLButtonElement>("button"));
  return (
    buttons.find((button) => button.textContent?.trim() === "Vazgeç") ??
    buttons.find((button) => button.textContent?.trim() === "Kapat") ??
    null
  );
}

export function installModalBehavior() {
  let pending: HTMLElement | null = null;

  // Capture: remember which popup was on top before any React handler runs.
  window.addEventListener(
    "keydown",
    (event) => {
      pending = event.key === "Escape" && !event.isComposing ? topmostBackdrop() : null;
    },
    true,
  );

  // Bubble: act only if nobody else handled this Escape.
  window.addEventListener("keydown", (event) => {
    const backdrop = pending;
    pending = null;
    if (!backdrop || event.defaultPrevented || !backdrop.isConnected) return;

    // An open grid menu or popover inside the popup closes first.
    const openMenu = backdrop.querySelector<HTMLDetailsElement>("details[open]");
    if (openMenu) {
      openMenu.open = false;
      event.preventDefault();
      return;
    }

    const control = closeControl(backdrop);
    if (!control || (control as HTMLButtonElement).disabled) return;
    event.preventDefault();
    control.click();
  });
}
