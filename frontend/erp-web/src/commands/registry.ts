import { matchesShortcut, parseShortcut, STANDARD_SHORTCUTS } from './shortcuts';
import { armRecordView, clearRecordView } from './recordView';
import { offersCommand, type StandardCommandId, type CommandSource, type CommandSpec, type PageCommands } from './types';

export type DispatchEnv = {
  typing: boolean;
  modalOpen: boolean;
  /** Focus is on a button, link, [role=button], [role=menuitem] or summary: Enter keeps its native activation. */
  onInteractive?: boolean;
  /** Every open modal belongs to the active view (none is a document-level dialog such as confirmDialog). */
  modalInActiveView?: boolean;
};

export type GlobalCommand = {
  id: string;
  shortcut: string;
  run: (e: KeyboardEvent) => void;
  allowWhileTyping?: boolean;
  allowInModal?: boolean;
};

/**
 * `touch` marks the slot as the most recently used (a record form reports focus inside it); `setFocusProbe` lets
 * a record form say whether it currently contains the focused element.
 */
export type CommandSlot = {
  set(commands: PageCommands): void;
  remove(): void;
  touch(): void;
  setFocusProbe(probe: (() => boolean) | undefined): void;
};

export type CommandRegistry = {
  /**
   * Several registrations may share a (view, source): the earliest-registered one that is still mounted is
   * effective (first wins); when it is removed the next one takes over.
   */
  register(viewKey: string, source: CommandSource, commands: PageCommands): () => void;
  /** Like `register`, but `set` replaces the commands while keeping the slot's position in the order. */
  openSlot(viewKey: string, source: CommandSource): CommandSlot;
  /** `undefined` when no workspace view is mounted (login, launcher, platform admin). */
  setActiveView(viewKey: string | undefined): void;
  getActiveView(): string | undefined;
  /** The action bar announces itself while mounted; forms without one keep their own save buttons. */
  attachActionBar(): () => void;
  hasActionBar(): boolean;
  getActive(): PageCommands | undefined;
  /** The merged commands of a view, active or not (same merge as `getActive`); stable until something changes. */
  getView(viewKey: string): PageCommands | undefined;
  /**
   * A template shell of the view owns its ⋯ menu: Alt+İ calls `toggle` while the view is active instead of opening the
   * shared bar's İşlemler. The first live claim of a view wins. Returns the release function.
   */
  claimMoreMenu(viewKey: string, toggle: () => void): () => void;
  /** The effective ⋯ menu claim of the view (`undefined` for no view or no claim). */
  moreMenuClaim(viewKey: string | undefined): (() => void) | undefined;
  registerGlobal(command: GlobalCommand): () => void;
  subscribe(listener: () => void): () => void;
  handleKeyDown(event: KeyboardEvent, env: DispatchEnv): boolean;
};

export const RESERVED_BROWSER_CHORDS = ['Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+E', 'Ctrl+D', 'F5'];

// Higher precedence first.
const SOURCE_PRECEDENCE: readonly CommandSource[] = ['form', 'page', 'list', 'grid'];
const SAVE_CHORD = parseShortcut(STANDARD_SHORTCUTS.save);
const STANDARD_IDS = Object.keys(STANDARD_SHORTCUTS) as StandardCommandId[];
const TYPING_BLOCKED = ['Enter', 'Ctrl+Z', 'Ctrl+A', 'Ctrl+Delete'].map(parseShortcut);
const RESERVED = RESERVED_BROWSER_CHORDS.map(parseShortcut);
const STANDARD_CHORDS = STANDARD_IDS.map((id) => ({ id, chord: parseShortcut(STANDARD_SHORTCUTS[id]) }));

function isEnabled(spec: CommandSpec | undefined): spec is CommandSpec & { run: () => void | Promise<void> } {
  return !!spec && !spec.hidden && typeof spec.run === 'function' && !spec.disabledReason;
}

function isFunctionKey(key: string): boolean {
  return /^F\d{1,2}$/.test(key);
}

export function createCommandRegistry(): CommandRegistry {
  type Slot = { commands?: PageCommands; activity: number; hasFocus?: () => boolean };
  let activityCounter = 0;
  const views = new Map<string, Partial<Record<CommandSource, Slot[]>>>();
  const globals: GlobalCommand[] = [];
  const listeners = new Set<() => void>();
  let activeView: string | undefined;
  let actionBars = 0;
  let cache: PageCommands | undefined;
  let cacheValid = false;
  // getView snapshots per view; cleared with the active cache.
  const viewCache = new Map<string, PageCommands | undefined>();
  const menuClaims = new Map<string, { toggle: () => void }[]>();

  function changed() {
    cacheValid = false;
    viewCache.clear();
    for (const listener of [...listeners]) listener();
  }

  function compute(viewKey: string | undefined): PageCommands | undefined {
    const sources = viewKey === undefined ? undefined : views.get(viewKey);
    if (!sources) return undefined;
    // `form` slots: the record form that contains the focused element is effective; otherwise the one with the
    // latest activity (focus inside it, else mounting), so a newly opened dialog form beats the form behind it.
    // A form slot without commands (a form whose commands are inactive) never takes part.
    const effective = (source: CommandSource) => {
      const slots = sources[source]?.filter(
        (slot) => slot.commands && (source !== 'form' || Object.keys(slot.commands).length > 0),
      );
      if (source !== 'form') return slots?.[0]?.commands;
      const focused = slots?.find((slot) => slot.hasFocus?.());
      if (focused) return focused.commands;
      return slots?.reduce<Slot | undefined>((best, slot) => (!best || slot.activity > best.activity ? slot : best), undefined)?.commands;
    };
    const merged: PageCommands = {};
    // A hidden spec (the page removed the command) is effective like any other: it stops the page > list > grid fallback,
    // so a list or grid source cannot bring back e.g. Excel. A record form's own spec still outranks it (form screens are
    // separate screens with their own commands); a form that does not register the command leaves it hidden.
    for (const id of STANDARD_IDS) {
      for (const source of SOURCE_PRECEDENCE) {
        const spec = effective(source)?.[id];
        if (spec) {
          merged[id] = spec;
          break;
        }
      }
    }
    // Aç is "Düzenle" everywhere; a screen that offers Aç but no Görüntüle of its own (legacy lists) gets one: it runs the
    // same Aç action after asking the record form it opens to start read-only (recordView.ts). Düzenle drops that request.
    const open = merged.open;
    if (open && !open.hidden && !merged.view) {
      const run = open.run;
      merged.open = { ...open, run: run ? () => { clearRecordView(); return run(); } : undefined };
      merged.view = { disabledReason: open.disabledReason, run: run ? () => { armRecordView(); return run(); } : undefined };
    }
    const formCommands = effective('form');
    const pageCommands = effective('page');
    const more = [...(formCommands?.more ?? []), ...(pageCommands?.more ?? [])];
    if (formCommands?.more || pageCommands?.more) merged.more = more;
    const barItems = [...(formCommands?.barItems ?? []), ...(pageCommands?.barItems ?? [])];
    if (barItems.length > 0) merged.barItems = barItems;
    // The page's İşlemler visibility and bar look come only from the effective page source, so another view (or a page
    // without them) gets today's bar. An open form with its own İşlemler items keeps the menu (form wins, as above).
    if (pageCommands?.moreHidden && !formCommands?.more?.length) merged.moreHidden = true;
    if (pageCommands?.look) merged.look = pageCommands.look;
    if (pageCommands?.shell) merged.shell = true;
    // An open record form that owns the primary Kaydet makes this a form screen (the bar drops Aç, Filtre, Excel);
    // a form that sits on a list screen (`besideList`) leaves it a list screen.
    if (formCommands?.save?.primary && !formCommands.besideList) merged.screen = 'form';
    // An open form's primary command (Kaydet) is the only primary one.
    if (formCommands && STANDARD_IDS.some((id) => formCommands[id]?.primary)) {
      for (const id of STANDARD_IDS) {
        const spec = merged[id];
        if (spec?.primary && spec !== formCommands[id]) merged[id] = { ...spec, primary: false };
      }
    }
    return merged;
  }

  function getActive() {
    if (!cacheValid) {
      cache = compute(activeView);
      cacheValid = true;
    }
    return cache;
  }

  function getView(viewKey: string) {
    if (viewKey === activeView) return getActive();
    if (!viewCache.has(viewKey)) viewCache.set(viewKey, compute(viewKey));
    return viewCache.get(viewKey);
  }

  function runCommand(event: KeyboardEvent, run: () => void | Promise<void>) {
    event.preventDefault();
    void run();
  }

  const registry: CommandRegistry = {
    openSlot(viewKey, source) {
      const entry = views.get(viewKey) ?? {};
      const slot: Slot = { activity: ++activityCounter };
      (entry[source] ??= []).push(slot);
      views.set(viewKey, entry);
      return {
        set(commands) {
          slot.commands = commands;
          changed();
        },
        setFocusProbe(probe) {
          slot.hasFocus = probe;
        },
        touch() {
          if (slot.activity === activityCounter) return;
          slot.activity = ++activityCounter;
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

    getActiveView: () => activeView,

    attachActionBar() {
      actionBars += 1;
      changed();
      let attached = true;
      return () => {
        if (!attached) return;
        attached = false;
        actionBars -= 1;
        changed();
      };
    },

    hasActionBar: () => actionBars > 0,

    getActive,

    getView,

    claimMoreMenu(viewKey, toggle) {
      // An entry object, so claiming the same function twice releases each claim on its own.
      const claim = { toggle };
      const claims = menuClaims.get(viewKey) ?? [];
      claims.push(claim);
      menuClaims.set(viewKey, claims);
      return () => {
        const list = menuClaims.get(viewKey);
        const index = list ? list.indexOf(claim) : -1;
        if (!list || index < 0) return;
        list.splice(index, 1);
        if (!list.length) menuClaims.delete(viewKey);
      };
    },

    moreMenuClaim: (viewKey) => (viewKey === undefined ? undefined : menuClaims.get(viewKey)?.[0]?.toggle),

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
      // Which record form holds the focus is read at dispatch time. Only the active view can hold the focus, so the
      // background views keep their getView snapshots.
      cacheValid = false;
      if (env.modalOpen) {
        for (const command of globals) {
          if (command.allowInModal && matchesShortcut(event, parseShortcut(command.shortcut))) {
            runCommand(event, () => command.run(event));
            return true;
          }
        }
        // A dialog of the active page itself (not a document-level one) still saves with Ctrl+S.
        if (env.modalInActiveView && matchesShortcut(event, SAVE_CHORD)) {
          const active = getActive();
          const save = active?.save;
          if (offersCommand(active, 'save') && isEnabled(save)) runCommand(event, save.run);
          else event.preventDefault();
          return true;
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
          if ((id === 'open' || id === 'view') && env.onInteractive) continue;
          if (!offersCommand(active, id)) continue;
          const spec = active[id];
          if (isEnabled(spec)) {
            runCommand(event, spec.run);
            return true;
          }
        }
      }

      // Browser chords are reserved only inside the workspace shell (spec §5.5); on the login, launcher and
      // platform admin screens Ctrl+P / F5 keep their browser meaning.
      if (activeView !== undefined && RESERVED.some((chord) => matchesShortcut(event, chord))) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  };
  return registry;
}
