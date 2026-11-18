import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Hover delay before the tooltip shows; keyboard focus (focus-visible) shows it at once. */
export const TOOLTIP_DELAY_MS = 400;
const GAP = 6;
const EDGE = 8;

const focusVisible = (element: Element) => {
  try {
    return element.matches(':focus-visible');
  } catch {
    // Engines without :focus-visible (older jsdom): keyboard focus cannot be told apart, so focus shows it.
    return true;
  }
};

/**
 * A small tooltip under a toolbar button (above it when there is no room below), e.g. "Kaydet · Ctrl+S". It is
 * portalled to the body and fixed to the viewport, so the scrolling bar does not clip it and nothing shifts. The
 * anchor gets `describedBy` (the tooltip id) while it is shown.
 */
export function useActionTooltip<T extends HTMLElement>(text: string) {
  const id = useId();
  const anchorRef = useRef<T>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'below' | 'above' }>({ top: 0, left: 0, placement: 'below' });

  const clear = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  const hide = useCallback(() => { clear(); setOpen(false); }, []);
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const placement = below + tip.height > window.innerHeight - EDGE && anchor.top - GAP - tip.height >= EDGE ? 'above' : 'below';
    const top = placement === 'below' ? below : anchor.top - GAP - tip.height;
    const centered = anchor.left + anchor.width / 2 - tip.width / 2;
    const left = Math.max(EDGE, Math.min(centered, window.innerWidth - EDGE - tip.width));
    setPosition({ top, left, placement });
  }, [open, text]);

  const handlers = {
    onMouseEnter: () => {
      clear();
      timer.current = window.setTimeout(() => setOpen(true), TOOLTIP_DELAY_MS);
    },
    onMouseLeave: hide,
    onFocus: (event: FocusEvent<T>) => { if (focusVisible(event.currentTarget)) { clear(); setOpen(true); } },
    onBlur: hide,
    onMouseDown: hide,
  };
  const tooltip: ReactNode = open && text
    ? createPortal(
      <div ref={tipRef} id={id} role="tooltip" className="nx-action-tip" data-placement={position.placement} style={{ top: position.top, left: position.left }}>{text}</div>,
      document.body,
    )
    : null;
  return { anchorRef, handlers, tooltip, describedBy: open && text ? id : undefined };
}

/** "<Etiket> · <Kısayol>"; a disabled command shows its reason instead of the label. */
export function tooltipText(label: string, shortcut: string, reason?: string) {
  return `${reason ?? label} · ${shortcut}`;
}
