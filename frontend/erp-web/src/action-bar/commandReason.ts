/**
 * Why an action bar command is disabled, as screen readers get it: the hidden reason text the button is described by
 * (the visible tooltip shows "<reason> · <shortcut>" on hover/focus). Null for an enabled command. For tests and tools.
 */
export function commandReason(button: Element | null | undefined): string | null {
  if (!button || button.getAttribute('aria-disabled') !== 'true') return null;
  const ids = (button.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element?.classList.contains('nx-action-bar__sr')) return element.textContent ?? '';
  }
  return null;
}
