import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileSpreadsheet, Filter, Plus, Printer, RefreshCw, Save, SquarePen, Trash2, Undo2 } from 'lucide-react';
import { useActivePageCommands, useCommandRegistry } from '../commands/CommandProvider';
import { formatShortcut, MORE_MENU_SHORTCUT, STANDARD_SHORTCUTS } from '../commands/shortcuts';
import { ACTION_BAR_ORDER, offersCommand, type CommandSpec, type MenuCommand, type PageCommands, type StandardCommandId } from '../commands/types';
import { COMMAND_LABELS } from './labels';
import { useActionBarTarget } from './ActionBarSlot';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import './action-bar.css';

type Locale = 'tr' | 'en';
type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

const ICONS: Record<StandardCommandId, IconType> = {
  new: Plus, open: SquarePen, save: Save, delete: Trash2, refresh: RefreshCw, filter: Filter, print: Printer, export: FileSpreadsheet, undo: Undo2,
};
const SEPARATOR_BEFORE: ReadonlySet<StandardCommandId> = new Set(['refresh', 'print']);
const UNAVAILABLE = 'Bu ekranda kullanılamaz';

/**
 * How much the standard buttons give up when the bar is narrow: first the key hints, then the labels (icon only,
 * with the label as aria-label and title). The İşlemler menu (and Geri Al) never compacts or scrolls away.
 */
export const COMPACTION_LEVELS = ['full', 'no-keys', 'icons'] as const;
export type Compaction = (typeof COMPACTION_LEVELS)[number];

/** The least compact level whose buttons fit; the most compact one (the buttons then scroll) when none does. */
export function pickCompaction(fits: (level: Compaction) => boolean): Compaction {
  return COMPACTION_LEVELS.find(fits) ?? COMPACTION_LEVELS[COMPACTION_LEVELS.length - 1];
}

/**
 * Keeps `data-compact` of the bar at the least compact level at which the standard buttons fit their area. Each
 * measurement starts from the full level, so the bar expands again when it widens. Without layout (no
 * ResizeObserver, nothing measured) the bar stays full.
 */
function useCompaction(deps: unknown[]) {
  const barRef = useRef<HTMLDivElement>(null);
  const commandsRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<Compaction>('full');
  useLayoutEffect(() => {
    const bar = barRef.current, commands = commandsRef.current;
    if (!bar || !commands) return;
    const measure = () => {
      const picked = pickCompaction((candidate) => {
        bar.dataset.compact = candidate;
        return commands.scrollWidth <= commands.clientWidth + 1;
      });
      bar.dataset.compact = picked;
      setLevel(picked);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    // The bar's own size (window, widget rail). Not the button area: its content changes with the level, which would
    // loop the observer. Geri Al coming or going re-runs this effect (commands in deps).
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { barRef, commandsRef, level };
}

/**
 * The buttons the screen offers, in the fixed order, split into the separated groups (Yeni · Aç · Kaydet · Sil |
 * Yenile · Filtre | Yazdır · Excel). A group with no button left is dropped, so no separator stands alone.
 */
function visibleGroups(commands: PageCommands | undefined): StandardCommandId[][] {
  const groups: StandardCommandId[][] = [];
  for (const id of ACTION_BAR_ORDER) {
    if (!groups.length || SEPARATOR_BEFORE.has(id)) groups.push([]);
    if (offersCommand(commands, id)) groups[groups.length - 1].push(id);
  }
  return groups.filter((group) => group.length > 0);
}

function stateOf(spec: CommandSpec | undefined): { enabled: boolean; reason?: string } {
  if (spec?.run && !spec.disabledReason) return { enabled: true };
  return { enabled: false, reason: spec?.disabledReason ?? UNAVAILABLE };
}

function CommandButton({ id, spec, locale, iconOnly = false }: { id: StandardCommandId; spec: CommandSpec | undefined; locale: Locale; iconOnly?: boolean }) {
  const reasonId = useId();
  const { enabled, reason } = stateOf(spec);
  const Icon = ICONS[id];
  const label = COMMAND_LABELS[id];
  return (
    <button
      type="button"
      className="nx-action-bar__button"
      data-command={id}
      data-primary={spec?.primary ? 'true' : undefined}
      aria-label={label}
      aria-keyshortcuts={STANDARD_SHORTCUTS[id]}
      aria-disabled={enabled ? undefined : 'true'}
      aria-describedby={enabled ? undefined : reasonId}
      title={enabled ? (iconOnly ? `${label} (${formatShortcut(STANDARD_SHORTCUTS[id], locale)})` : undefined) : reason}
      onClick={() => { if (enabled) void spec?.run?.(); }}
    >
      <Icon size={15} aria-hidden />
      <span>{label}</span>
      <kbd>{formatShortcut(STANDARD_SHORTCUTS[id], locale)}</kbd>
      {!enabled && <span id={reasonId} className="nx-action-bar__sr">{reason}</span>}
    </button>
  );
}

function ActionsMenu({ items, locale, open, onOpenChange }: { items: MenuCommand[]; locale: Locale; open: boolean; onOpenChange: (open: boolean) => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  const close = useCallback((restoreFocus: boolean) => {
    onOpenChange(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, [onOpenChange]);

  // The bar scrolls horizontally, which would clip an absolutely positioned menu, so the menu is fixed to the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, onOpenChange]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => {
      event.preventDefault();
      entries[(next + entries.length) % entries.length]?.focus();
    };
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(false);
    else if (!entries.length) return;
    else if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index < 0 ? entries.length - 1 : index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(entries.length - 1);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="nx-action-bar__button nx-action-bar__more"
        data-command="more"
        aria-label="İşlemler"
        aria-keyshortcuts={MORE_MENU_SHORTCUT}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>İşlemler</span>
        <kbd>{formatShortcut(MORE_MENU_SHORTCUT, locale)}</kbd>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <div ref={menuRef} className="nx-action-bar__menu" role="menu" aria-label="İşlemler" style={position} onKeyDown={onMenuKeyDown}>
          {items.length === 0 && <div className="nx-action-bar__menu-empty">{UNAVAILABLE}</div>}
          {items.map((item) => {
            const { enabled, reason } = stateOf(item);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="nx-action-bar__menu-item"
                data-item={item.id}
                aria-disabled={enabled ? undefined : 'true'}
                title={enabled ? undefined : reason}
                onClick={() => {
                  if (!enabled) return;
                  close(true);
                  void item.run?.();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && <kbd>{formatShortcut(item.shortcut, locale)}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ActionBar({ locale }: { locale: Locale }) {
  const registry = useCommandRegistry();
  const commands = useActivePageCommands();
  const slotTarget = useActionBarTarget();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  // Record forms keep their own Kaydet only while no bar is mounted.
  useLayoutEffect(() => registry.attachActionBar(), [registry]);

  useEffect(() => {
    const disposers = [
      registry.registerGlobal({ id: 'action-bar.more', shortcut: MORE_MENU_SHORTCUT, allowWhileTyping: true, run: () => setMenuOpen((open) => !open) }),
      registry.registerGlobal({ id: 'action-bar.help', shortcut: 'F1', allowWhileTyping: true, run: () => setHelpOpen(true) }),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [registry]);

  const { barRef, commandsRef, level } = useCompaction([slotTarget, commands, locale]);
  const iconOnly = level === 'icons';
  const bar = (
    <div ref={barRef} className="nx-action-bar" data-nx-action-bar data-compact={level} role="toolbar" aria-label="İşlemler çubuğu">
      {/* The standard buttons compact, then scroll; İşlemler stays pinned at the right. */}
      <div ref={commandsRef} className="nx-action-bar__commands">
        {visibleGroups(commands).map((group, index) => (
          <Fragment key={group[0]}>
            {index > 0 && <span className="nx-action-bar__sep" aria-hidden="true" />}
            {group.map((id) => <CommandButton key={id} id={id} spec={commands?.[id]} locale={locale} iconOnly={iconOnly} />)}
          </Fragment>
        ))}
      </div>
      <div className="nx-action-bar__end">
        {commands?.undo && <CommandButton id="undo" spec={commands.undo} locale={locale} iconOnly={iconOnly} />}
        <ActionsMenu items={commands?.more ?? []} locale={locale} open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
      {helpOpen && <ShortcutHelpDialog locale={locale} onClose={closeHelp} />}
    </div>
  );
  // One instance: it moves into the active page's slot (under the title) when there is one.
  return slotTarget ? createPortal(bar, slotTarget) : bar;
}
