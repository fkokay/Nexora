import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createCommandRegistry, type CommandRegistry, type CommandSlot } from './registry';
import type { CommandSource, MenuCommand, PageCommands, StandardCommandId } from './types';
import { STANDARD_SHORTCUTS } from './shortcuts';

export const ViewKeyContext = createContext<string>('root');
const RegistryContext = createContext<CommandRegistry | null>(null);

const TYPING_SELECTOR = 'input,textarea,select,[contenteditable="true"]';
const INTERACTIVE_SELECTOR = 'button, a[href], [role=button], [role=menuitem], [role=tab], summary';
const STANDARD_IDS = Object.keys(STANDARD_SHORTCUTS) as StandardCommandId[];

// A modal left mounted inside a hidden keep-alive view must not block shortcuts of the active view.
function openModals(): Element[] {
  return Array.from(document.querySelectorAll('[aria-modal="true"]')).filter((el) => !el.closest('[hidden]'));
}

/**
 * The topmost modal belongs to the active view when it is rendered inside the view's KeepAliveViews wrapper, or
 * when a page portals it elsewhere and marks it with `data-nx-view-owner` (see `useViewDialogOwner`). Document-level
 * dialogs (confirmDialog, shortcut help) are neither.
 */
function isModalInActiveView(modals: Element[], activeView: string | undefined): boolean {
  const topmost = modals[modals.length - 1];
  if (!topmost || activeView === undefined) return false;
  const view = topmost.closest('[data-nx-view]');
  if (view) return view.getAttribute('data-nx-view') === activeView;
  return topmost.closest('[data-nx-view-owner]')?.getAttribute('data-nx-view-owner') === activeView;
}

/** Marks a page dialog that is portalled out of its view as belonging to that view (spread on the dialog root). */
export function useViewDialogOwner(): { 'data-nx-view-owner': string } {
  return { 'data-nx-view-owner': useContext(ViewKeyContext) };
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createCommandRegistry);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const modals = openModals();
      registry.handleKeyDown(event, {
        typing: Boolean(target?.closest(TYPING_SELECTOR)),
        modalOpen: modals.length > 0,
        modalInActiveView: isModalInActiveView(modals, registry.getActiveView()),
        onInteractive: Boolean(target?.closest(INTERACTIVE_SELECTOR)),
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [registry]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useCommandRegistry(): CommandRegistry {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useCommandRegistry must be used inside CommandProvider');
  return registry;
}

function moreSignature(more: MenuCommand[] | undefined) {
  return more?.map((item) => [item.id, item.label, item.shortcut ?? '', item.disabledReason ?? '', typeof item.run === 'function']);
}

function structureSignature(commands: PageCommands): string {
  const specs = STANDARD_IDS.flatMap((id) => {
    const spec = commands[id];
    return spec ? [[id, typeof spec.run === 'function', spec.disabledReason ?? '', Boolean(spec.primary)]] : [];
  });
  return JSON.stringify([specs, moreSignature(commands.more)]);
}

// The registered `run` functions are stable wrappers that call through `ref`, so handlers may change every render.
function buildStable(ref: { current: PageCommands }): PageCommands {
  const latest = ref.current;
  const built: PageCommands = {};
  for (const id of STANDARD_IDS) {
    const spec = latest[id];
    if (!spec) continue;
    built[id] = {
      run: spec.run ? () => ref.current[id]?.run?.() : undefined,
      disabledReason: spec.disabledReason,
      primary: spec.primary,
    };
  }
  if (latest.more) {
    built.more = latest.more.map((item) => ({
      id: item.id,
      label: item.label,
      shortcut: item.shortcut,
      disabledReason: item.disabledReason,
      run: item.run ? () => ref.current.more?.find((candidate) => candidate.id === item.id)?.run?.() : undefined,
    }));
  }
  return built;
}

/**
 * Registrations sharing a (view, source) are first-wins: the earliest mounted one is effective and the next takes
 * over when it unmounts. A handler/structure change updates the slot in place, so it keeps its position.
 */
export function usePageCommands(commands: PageCommands, source: CommandSource = 'page'): void {
  const registry = useCommandRegistry();
  const viewKey = useContext(ViewKeyContext);
  const ref = useRef(commands);
  ref.current = commands;
  const slotRef = useRef<CommandSlot | null>(null);
  const signature = structureSignature(commands);
  useEffect(() => {
    const slot = registry.openSlot(viewKey, source);
    slotRef.current = slot;
    return () => {
      slotRef.current = null;
      slot.remove();
    };
  }, [registry, viewKey, source]);
  useEffect(() => {
    slotRef.current?.set(buildStable(ref));
  }, [registry, viewKey, source, signature]);
}

export function useActivePageCommands(): PageCommands | undefined {
  const registry = useCommandRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getActive, registry.getActive);
}
