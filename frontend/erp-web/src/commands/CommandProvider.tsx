import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createCommandRegistry, type CommandRegistry } from './registry';
import type { CommandSource, MenuCommand, PageCommands, StandardCommandId } from './types';
import { STANDARD_SHORTCUTS } from './shortcuts';

export const ViewKeyContext = createContext<string>('root');
const RegistryContext = createContext<CommandRegistry | null>(null);

const TYPING_SELECTOR = 'input,textarea,select,[contenteditable="true"]';
const INTERACTIVE_SELECTOR = 'button, a[href], [role=button], [role=menuitem], [role=tab], summary';
const STANDARD_IDS = Object.keys(STANDARD_SHORTCUTS) as StandardCommandId[];

export function CommandProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createCommandRegistry);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      registry.handleKeyDown(event, {
        typing: Boolean(target?.closest(TYPING_SELECTOR)),
        modalOpen: document.querySelector('[aria-modal="true"]:not([hidden])') !== null,
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

export function usePageCommands(commands: PageCommands, source: CommandSource = 'page'): void {
  const registry = useCommandRegistry();
  const viewKey = useContext(ViewKeyContext);
  const ref = useRef(commands);
  ref.current = commands;
  const signature = structureSignature(commands);
  useEffect(() => registry.register(viewKey, source, buildStable(ref)), [registry, viewKey, source, signature]);
}

export function useActivePageCommands(): PageCommands | undefined {
  const registry = useCommandRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getActive, registry.getActive);
}
