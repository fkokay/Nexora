import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefCallback } from 'react';
import { useCommandRegistry } from '../commands/CommandProvider';

type SlotContextValue = {
  /** The visible slot of the active view, or null (the bar then stays at the shell position). */
  target: HTMLElement | null;
  breadcrumb: ReactNode;
  register: (element: HTMLElement) => () => void;
};

const SlotContext = createContext<SlotContextValue | null>(null);

function visibleSlotOfView(slots: Set<HTMLElement>, activeView: string | undefined): HTMLElement | null {
  if (activeView === undefined) return null;
  let first: HTMLElement | null = null;
  for (const slot of slots) {
    if (slot.closest('[data-nx-view]')?.getAttribute('data-nx-view') !== activeView) continue;
    if (slot.closest('[hidden]')) continue;
    // First in DOM order, not registration order.
    if (!first || slot.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) first = slot;
  }
  return first;
}

/**
 * Lets pages show the action bar right under their own title row. Slots register here as they mount, so the single
 * ActionBar instance in the shell can portal into the active view's slot without polling the DOM.
 */
export function ActionBarSlotProvider({ breadcrumb, children }: { breadcrumb: ReactNode; children: ReactNode }) {
  const registry = useCommandRegistry();
  const activeView = useSyncExternalStore(registry.subscribe, registry.getActiveView, registry.getActiveView);
  const [slots, setSlots] = useState<Set<HTMLElement>>(() => new Set());
  const register = useCallback((element: HTMLElement) => {
    setSlots((current) => new Set(current).add(element));
    return () => setSlots((current) => {
      const next = new Set(current);
      next.delete(element);
      return next;
    });
  }, []);
  const target = useMemo(() => visibleSlotOfView(slots, activeView), [slots, activeView]);
  const value = useMemo(() => ({ target, breadcrumb, register }), [target, breadcrumb, register]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/** The element the action bar should render into, or null for the shell position. */
export function useActionBarTarget(): HTMLElement | null {
  return useContext(SlotContext)?.target ?? null;
}

/** The shell's breadcrumb row; hidden while the active page shows the breadcrumb in its own title block. */
export function ShellBreadcrumbRow({ children }: { children: ReactNode }) {
  return useActionBarTarget() ? null : <>{children}</>;
}

/**
 * Registers a slot element and returns the breadcrumb the title block should render: it is non-null only while
 * this slot is the one the action bar occupies, so the breadcrumb never shows twice.
 */
export function useSlotBreadcrumb(): { slotRef: RefCallback<HTMLDivElement>; breadcrumb: ReactNode } {
  const context = useContext(SlotContext);
  const register = context?.register;
  const disposeRef = useRef<(() => void) | null>(null);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const slotRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    disposeRef.current?.();
    disposeRef.current = null;
    setElement(node);
    if (node && register) disposeRef.current = register(node);
  }, [register]);
  return { slotRef, breadcrumb: context && element && context.target === element ? context.breadcrumb : null };
}

function SlotElement({ slotRef }: { slotRef: RefCallback<HTMLDivElement> }) {
  return <div data-nx-action-bar-slot className="nx-action-bar-slot" ref={slotRef} />;
}

function OwnedSlot() {
  return <SlotElement slotRef={useSlotBreadcrumb().slotRef} />;
}

/**
 * Where a page wants the action bar: right after its title row. A page that also shows the breadcrumb passes the
 * `slotRef` from `useSlotBreadcrumb`; otherwise the slot registers itself.
 */
export function ActionBarSlot({ slotRef }: { slotRef?: RefCallback<HTMLDivElement> } = {}) {
  return slotRef ? <SlotElement slotRef={slotRef} /> : <OwnedSlot />;
}
