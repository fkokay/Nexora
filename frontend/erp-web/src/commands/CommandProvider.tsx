import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createCommandRegistry, type CommandRegistry, type CommandSlot } from './registry';
import { BAR_LOOK_KEYS, type CommandSource, type MenuCommand, type PageCommands, type StandardCommandId } from './types';
import { STANDARD_SHORTCUTS } from './shortcuts';
import { openModals } from './modals';

export const ViewKeyContext = createContext<string>('root');
const RegistryContext = createContext<CommandRegistry | null>(null);

const TYPING_SELECTOR = 'input,textarea,select,[contenteditable="true"]';
const GRID_SELECT_CELL = '.advanced-grid-select-cell';
const INTERACTIVE_SELECTOR = 'button, a[href], [role=button], [role=menuitem], [role=tab], summary';
const STANDARD_IDS = Object.keys(STANDARD_SHORTCUTS) as StandardCommandId[];

export { openModals };

/**
 * Open modals belong to the active view when every one of them is rendered inside the view's KeepAliveViews
 * wrapper, or is portalled elsewhere and marked with `data-nx-view-owner` (see `useViewDialogOwner`). One
 * document-level dialog (confirmDialog, prompt, shortcut help) anywhere makes this false.
 */
export function modalsBelongToView(modals: Element[], activeView: string | undefined): boolean {
  if (!modals.length || activeView === undefined) return false;
  return modals.every((modal) => {
    const view = modal.closest('[data-nx-view]');
    if (view) return view.getAttribute('data-nx-view') === activeView;
    return modal.closest('[data-nx-view-owner]')?.getAttribute('data-nx-view-owner') === activeView;
  });
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
        // A list row's selection checkbox is not typing: Enter / Ctrl+Del keep acting on the list (the grid
        // handles Ctrl+A there itself; no command uses it).
        typing: Boolean(target?.closest(TYPING_SELECTOR)) && !target?.closest(GRID_SELECT_CELL),
        modalOpen: modals.length > 0,
        modalInActiveView: modalsBelongToView(modals, registry.getActiveView()),
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
    return spec ? [[id, typeof spec.run === 'function', spec.disabledReason ?? '', Boolean(spec.primary), Boolean(spec.hidden), spec.label ?? '']] : [];
  });
  const look = commands.look ? BAR_LOOK_KEYS.map((key) => commands.look![key] ?? null) : null;
  return JSON.stringify([specs, moreSignature(commands.more), moreSignature(commands.barItems), Boolean(commands.besideList), Boolean(commands.moreHidden), look]);
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
      ...(spec.hidden ? { hidden: true } : {}),
      ...(spec.label ? { label: spec.label } : {}),
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
  if (latest.barItems) {
    built.barItems = latest.barItems.map((item) => ({
      id: item.id,
      label: item.label,
      shortcut: item.shortcut,
      disabledReason: item.disabledReason,
      run: item.run ? () => ref.current.barItems?.find((candidate) => candidate.id === item.id)?.run?.() : undefined,
    }));
  }
  if (latest.besideList) built.besideList = true;
  if (latest.moreHidden) built.moreHidden = true;
  if (latest.look) built.look = { ...latest.look };
  return built;
}

/**
 * Registrations sharing a (view, source) are first-wins: the earliest mounted one is effective and the next takes
 * over when it unmounts. A handler/structure change updates the slot in place, so it keeps its position.
 */
/**
 * `focusRoot` (record forms): while the focused element is inside it, this registration is the effective `form`
 * one. The returned function marks the registration as the most recently used.
 */
export function usePageCommands(
  commands: PageCommands,
  source: CommandSource = 'page',
  focusRoot?: RefObject<Element | null>,
): () => void {
  const registry = useCommandRegistry();
  const viewKey = useContext(ViewKeyContext);
  const ref = useRef(commands);
  ref.current = commands;
  const slotRef = useRef<CommandSlot | null>(null);
  const signature = structureSignature(commands);
  useEffect(() => {
    const slot = registry.openSlot(viewKey, source);
    if (focusRoot) slot.setFocusProbe(() => Boolean(document.activeElement && focusRoot.current?.contains(document.activeElement)));
    slotRef.current = slot;
    return () => {
      slotRef.current = null;
      slot.remove();
    };
  }, [registry, viewKey, source]);
  useEffect(() => {
    slotRef.current?.set(buildStable(ref));
  }, [registry, viewKey, source, signature]);
  // Marks this registration as the most recently used one (see the `form` source).
  return useCallback(() => slotRef.current?.touch(), []);
}

/** Whether the shell's action bar is mounted (it is not outside the workspace shell, on the launcher or dashboard). */
export function useActionBarMounted(): boolean {
  const registry = useCommandRegistry();
  return useSyncExternalStore(registry.subscribe, registry.hasActionBar, registry.hasActionBar);
}

export function useActivePageCommands(): PageCommands | undefined {
  const registry = useCommandRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getActive, registry.getActive);
}
