import { matchesShortcut, parseShortcut, STANDARD_SHORTCUTS } from './shortcuts';
import type { StandardCommandId, CommandSource, CommandSpec, PageCommands } from './types';

export type DispatchEnv = {
  typing: boolean;
  modalOpen: boolean;
  /** Focus is on a button, link, [role=button], [role=menuitem] or summary: Enter keeps its native activation. */
  onInteractive?: boolean;
};

export type GlobalCommand = {
  id: string;
  shortcut: string;
  run: (e: KeyboardEvent) => void;
  allowWhileTyping?: boolean;
  allowInModal?: boolean;
};

export type CommandSlot = { set(commands: PageCommands): void; remove(): void };

export type CommandRegistry = {
  /**
   * Several registrations may share a (view, source): the earliest-registered one that is still mounted is
   * effective (first wins); when it is removed the next one takes over.
   */
  register(viewKey: string, source: CommandSource, commands: PageCommands): () => void;
  /** Like `register`, but `set` replaces the commands while keeping the slot's position in the order. */
  openSlot(viewKey: string, source: CommandSource): CommandSlot;
  setActiveView(viewKey: string): void;
  getActive(): PageCommands | undefined;
  registerGlobal(command: GlobalCommand): () => void;
  subscribe(listener: () => void): () => void;
  handleKeyDown(event: KeyboardEvent, env: DispatchEnv): boolean;
};

export const RESERVED_BROWSER_CHORDS = ['Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+E', 'Ctrl+D', 'F5'];

// Higher precedence first.
const SOURCE_PRECEDENCE: readonly CommandSource[] = ['page', 'list', 'grid'];
const STANDARD_IDS = Object.keys(STANDARD_SHORTCUTS) as StandardCommandId[];
const TYPING_BLOCKED = ['Enter', 'Ctrl+Z', 'Ctrl+A', 'Ctrl+Delete'].map(parseShortcut);
const RESERVED = RESERVED_BROWSER_CHORDS.map(parseShortcut);
const STANDARD_CHORDS = STANDARD_IDS.map((id) => ({ id, chord: parseShortcut(STANDARD_SHORTCUTS[id]) }));

function isEnabled(spec: CommandSpec | undefined): spec is CommandSpec & { run: () => void | Promise<void> } {
  return !!spec && typeof spec.run === 'function' && !spec.disabledReason;
}

function isFunctionKey(key: string): boolean {
  return /^F\d{1,2}$/.test(key);
}

export function createCommandRegistry(): CommandRegistry {
  type Slot = { commands?: PageCommands };
  const views = new Map<string, Partial<Record<CommandSource, Slot[]>>>();
  const globals: GlobalCommand[] = [];
  const listeners = new Set<() => void>();
  let activeView: string | undefined;
  let cache: PageCommands | undefined;
  let cacheValid = false;

  function changed() {
    cacheValid = false;
    for (const listener of [...listeners]) listener();
  }

  function compute(): PageCommands | undefined {
    const sources = activeView === undefined ? undefined : views.get(activeView);
    if (!sources) return undefined;
    const merged: PageCommands = {};
    for (const id of STANDARD_IDS) {
      for (const source of SOURCE_PRECEDENCE) {
        const spec = sources[source]?.find((slot) => slot.commands)?.commands?.[id];
        if (spec) {
          merged[id] = spec;
          break;
        }
      }
    }
    const pageMore = sources.page?.find((slot) => slot.commands)?.commands?.more;
    if (pageMore) merged.more = pageMore;
    return merged;
  }

  function getActive() {
    if (!cacheValid) {
      cache = compute();
      cacheValid = true;
    }
    return cache;
  }

  function runCommand(event: KeyboardEvent, run: () => void | Promise<void>) {
    event.preventDefault();
    void run();
  }

  const registry: CommandRegistry = {
    openSlot(viewKey, source) {
      const entry = views.get(viewKey) ?? {};
      const slot: Slot = {};
      (entry[source] ??= []).push(slot);
      views.set(viewKey, entry);
      return {
        set(commands) {
          slot.commands = commands;
          changed();
        },
        remove() {
          const list = views.get(viewKey)?.[source];
          const index = list ? list.indexOf(slot) : -1;
          if (!list || index < 0) return;
          list.splice(index, 1);
          if (!list.length) delete views.get(viewKey)![source];
          if (!Object.keys(views.get(viewKey)!).length) views.delete(viewKey);
          changed();
        },
      };
    },

    register(viewKey, source, commands) {
      const slot = registry.openSlot(viewKey, source);
      slot.set(commands);
      return slot.remove;
    },

    setActiveView(viewKey) {
      if (activeView === viewKey) return;
      activeView = viewKey;
      changed();
    },

    getActive,

    registerGlobal(command) {
      globals.push(command);
      return () => {
        const index = globals.indexOf(command);
        if (index >= 0) globals.splice(index, 1);
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    handleKeyDown(event, env) {
      if (env.modalOpen) {
        for (const command of globals) {
          if (command.allowInModal && matchesShortcut(event, parseShortcut(command.shortcut))) {
            runCommand(event, () => command.run(event));
            return true;
          }
        }
        return false;
      }

      for (const command of globals) {
        if (env.typing && !command.allowWhileTyping) continue;
        if (matchesShortcut(event, parseShortcut(command.shortcut))) {
          runCommand(event, () => command.run(event));
          return true;
        }
      }

      if (env.typing) {
        if (TYPING_BLOCKED.some((chord) => matchesShortcut(event, chord))) return false;
        // Plain keys (letters, digits...) belong to the text field.
        if (!event.ctrlKey && !event.metaKey && !event.altKey && !isFunctionKey(event.key)) return false;
      }

      const active = getActive();
      if (active) {
        for (const { id, chord } of STANDARD_CHORDS) {
          if (!matchesShortcut(event, chord)) continue;
          if (id === 'open' && env.onInteractive) continue;
          const spec = active[id];
          if (isEnabled(spec)) {
            runCommand(event, spec.run);
            return true;
          }
        }
      }

      if (RESERVED.some((chord) => matchesShortcut(event, chord))) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  };
  return registry;
}
