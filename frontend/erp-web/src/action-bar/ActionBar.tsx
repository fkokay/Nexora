import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, CopyPlus, Eye, FileSpreadsheet, Filter, Plus, Printer, RefreshCw, Save, SquarePen, Trash2, Undo2 } from 'lucide-react';
import { useActivePageCommands, useCommandRegistry } from '../commands/CommandProvider';
import { formatShortcut, MORE_MENU_SHORTCUT, STANDARD_SHORTCUTS } from '../commands/shortcuts';
import { ACTION_BAR_ORDER, offersCommand, type BarLook, type CommandSpec, type MenuCommand, type PageCommands, type StandardCommandId } from '../commands/types';
import { COMMAND_LABELS } from './labels';
import { useActionBarTarget } from './ActionBarSlot';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { tooltipText, useActionTooltip } from './ActionTooltip';
import './action-bar.css';

type Locale = 'tr' | 'en';
type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

const ICONS: Record<StandardCommandId, IconType> = {
  new: Plus, open: SquarePen, view: Eye, save: Save, delete: Trash2, refresh: RefreshCw, filter: Filter, print: Printer, export: FileSpreadsheet, undo: Undo2,
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

/**
 * The page's bar look (`PageCommands.look`) as data attributes and CSS variables on `.nx-action-bar` (see action-bar.css).
 * Only the keys the page set are emitted, so a page without a look renders exactly today's bar.
 */
function lookAttributes(look: BarLook | undefined): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (!look) return attributes;
  for (const key of ['align', 'density', 'size', 'style', 'content', 'border', 'radius'] as const) {
    if (look[key]) attributes[`data-${key}`] = look[key]!;
  }
  for (const key of ['sticky', 'separators'] as const) {
    if (look[key] !== undefined) attributes[`data-${key}`] = String(look[key]);
  }
  if (look.accent) attributes['data-accent'] = 'true';
  if (look.background) attributes['data-background'] = 'true';
  return attributes;
}

function lookStyle(look: BarLook | undefined): CSSProperties | undefined {
  if (!look?.accent && !look?.background) return undefined;
  return {
    ...(look.accent ? { '--nx-bar-accent': look.accent } : {}),
    ...(look.background ? { '--nx-bar-background': look.background } : {}),
  } as CSSProperties;
}

/** The tooltip text; `hints=false` (barLook) drops the shortcut and keeps the label (or the reason while disabled). */
const tipText = (hints: boolean, label: string, shortcut: string, reason?: string) =>
  hints ? tooltipText(label, shortcut, reason) : reason ?? label;

function stateOf(spec: CommandSpec | undefined): { enabled: boolean; reason?: string } {
  if (spec?.run && !spec.disabledReason) return { enabled: true };
  return { enabled: false, reason: spec?.disabledReason ?? UNAVAILABLE };
}

/** aria-describedby of a button: the shown tooltip and, while disabled, the (screen-reader) reason. */
const describedBy = (...ids: (string | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

function CommandButton({ id, spec, locale, hints = true }: { id: StandardCommandId; spec: CommandSpec | undefined; locale: Locale; iconOnly?: boolean; hints?: boolean }) {
  const reasonId = useId();
  const { enabled, reason } = stateOf(spec);
  const Icon = ICONS[id];
  const label = spec?.label || COMMAND_LABELS[id];
  // The shortcut is no longer a badge on the button: it shows in the hover/focus tooltip ("Kaydet · Ctrl+S").
  const tip = useActionTooltip<HTMLButtonElement>(tipText(hints, label, formatShortcut(STANDARD_SHORTCUTS[id], locale), enabled ? undefined : reason));
  return (
    <>
      <button
        ref={tip.anchorRef}
        type="button"
        className="nx-action-bar__button"
        data-command={id}
        data-primary={spec?.primary ? 'true' : undefined}
        aria-label={label}
        aria-keyshortcuts={STANDARD_SHORTCUTS[id]}
        aria-disabled={enabled ? undefined : 'true'}
        aria-describedby={describedBy(tip.describedBy, enabled ? undefined : reasonId)}
        {...tip.handlers}
        onClick={() => { if (enabled) void spec?.run?.(); }}
      >
        <Icon size={15} aria-hidden />
        <span>{label}</span>
        {!enabled && <span id={reasonId} className="nx-action-bar__sr">{reason}</span>}
      </button>
      {tip.tooltip}
    </>
  );
}

/** A page button on the bar (`barItems`, e.g. "Kaydet ve yeni"): drawn like a standard command, dimmed with its reason. */
function BarItemButton({ item, locale, hints = true }: { item: MenuCommand; locale: Locale; hints?: boolean }) {
  const reasonId = useId();
  const enabled = !!item.run && !item.disabledReason;
  const reason = enabled ? undefined : item.disabledReason ?? UNAVAILABLE;
  const tip = useActionTooltip<HTMLButtonElement>(item.shortcut ? tipText(hints, item.label, formatShortcut(item.shortcut, locale), reason) : reason ?? item.label);
  return (
    <>
      <button
        ref={tip.anchorRef}
        type="button"
        className="nx-action-bar__button"
        data-command={item.id}
        aria-label={item.label}
        aria-keyshortcuts={item.shortcut}
        aria-disabled={enabled ? undefined : 'true'}
        aria-describedby={describedBy(tip.describedBy, enabled ? undefined : reasonId)}
        {...tip.handlers}
        onClick={() => { if (enabled) void item.run?.(); }}
      >
        <CopyPlus size={15} aria-hidden />
        <span>{item.label}</span>
        {!enabled && <span id={reasonId} className="nx-action-bar__sr">{reason}</span>}
      </button>
      {tip.tooltip}
    </>
  );
}

function ActionsMenu({ items, locale, open, onOpenChange, hints = true }: { items: MenuCommand[]; locale: Locale; open: boolean; onOpenChange: (open: boolean) => void; hints?: boolean }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const tip = useActionTooltip<HTMLButtonElement>(open ? '' : tipText(hints, 'İşlemler', formatShortcut(MORE_MENU_SHORTCUT, locale)));
  const setTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    tip.anchorRef.current = node;
  }, [tip.anchorRef]);

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
        ref={setTrigger}
        type="button"
        className="nx-action-bar__button nx-action-bar__more"
        data-command="more"
        aria-label="İşlemler"
        aria-keyshortcuts={MORE_MENU_SHORTCUT}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-describedby={tip.describedBy}
        {...tip.handlers}
        onClick={() => onOpenChange(!open)}
      >
        <span>İşlemler</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {tip.tooltip}
      {open && (
        <div ref={menuRef} className="nx-action-bar__menu" role="menu" aria-label="İşlemler" style={position} onKeyDown={onMenuKeyDown}>
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
  // No İşlemler when the page removed it (`moreHidden`) or registered no items: no menu, Alt+İ does nothing,
  // and an open menu closes.
  // A shell view (`shell`): the template shell draws the bar, so the shared one has no İşlemler either.
  const shell = !!commands?.shell;
  const moreHidden = shell || !!commands?.moreHidden || !commands?.more?.length;
  const moreHiddenRef = useRef(moreHidden);
  moreHiddenRef.current = moreHidden;
  useEffect(() => { if (moreHidden) setMenuOpen(false); }, [moreHidden]);

  useEffect(() => {
    const disposers = [
      registry.registerGlobal({
        id: 'action-bar.more', shortcut: MORE_MENU_SHORTCUT, allowWhileTyping: true,
        // A template shell of the active view owns the ⋯ menu (claimMoreMenu); only otherwise the bar's İşlemler opens.
        run: () => {
          const claim = registry.moreMenuClaim(registry.getActiveView());
          if (claim) claim();
          else if (!moreHiddenRef.current) setMenuOpen((open) => !open);
        },
      }),
      registry.registerGlobal({ id: 'action-bar.help', shortcut: 'F1', allowWhileTyping: true, run: () => setHelpOpen(true) }),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [registry]);

  // The look comes only from the active page's commands, so the one shared bar resets on every other screen.
  const look = commands?.look;
  const hints = look?.hints !== false;
  const { barRef, commandsRef, level } = useCompaction([slotTarget, commands, locale, look]);
  const iconOnly = level === 'icons';
  const bar = (
    <div ref={barRef} className="nx-action-bar" data-nx-action-bar data-compact={level} role="toolbar" aria-label="İşlemler çubuğu"
      {...lookAttributes(look)} style={lookStyle(look)}>
      {/* The standard buttons compact, then scroll; İşlemler stays pinned at the right. */}
      <div ref={commandsRef} className="nx-action-bar__commands">
        {visibleGroups(commands).map((group, index) => (
          <Fragment key={group[0]}>
            {index > 0 && <span className="nx-action-bar__sep" aria-hidden="true" />}
            {group.map((id) => <CommandButton key={id} id={id} spec={commands?.[id]} locale={locale} iconOnly={iconOnly} hints={hints} />)}
            {/* Page buttons (Kaydet ve yeni) follow the record commands, before the first separator. */}
            {index === 0 && commands?.barItems?.map((item) => <BarItemButton key={item.id} item={item} locale={locale} hints={hints} />)}
          </Fragment>
        ))}
        {visibleGroups(commands).length === 0 && commands?.barItems?.map((item) => <BarItemButton key={item.id} item={item} locale={locale} hints={hints} />)}
      </div>
      <div className="nx-action-bar__end">
        {commands?.undo && <CommandButton id="undo" spec={commands.undo} locale={locale} iconOnly={iconOnly} hints={hints} />}
        {!moreHidden && <ActionsMenu items={commands?.more ?? []} locale={locale} open={menuOpen} onOpenChange={setMenuOpen} hints={hints} />}
      </div>
      {helpOpen && <ShortcutHelpDialog locale={locale} onClose={closeHelp} />}
    </div>
  );
  // A shell view: no bar and no portal; F1 help stays (Alt+İ goes to the shell's claim above).
  if (shell) return helpOpen ? <ShortcutHelpDialog locale={locale} onClose={closeHelp} /> : null;
  // One instance: it moves into the active page's slot (under the title) when there is one.
  return slotTarget ? createPortal(bar, slotTarget) : bar;
}
