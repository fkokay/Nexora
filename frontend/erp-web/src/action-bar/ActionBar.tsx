import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileSpreadsheet, Filter, Plus, Printer, RefreshCw, Save, SquarePen, Trash2, Undo2 } from 'lucide-react';
import { useActivePageCommands, useCommandRegistry } from '../commands/CommandProvider';
import { formatShortcut, MORE_MENU_SHORTCUT, STANDARD_SHORTCUTS } from '../commands/shortcuts';
import { ACTION_BAR_ORDER, type CommandSpec, type MenuCommand, type StandardCommandId } from '../commands/types';
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

function stateOf(spec: CommandSpec | undefined): { enabled: boolean; reason?: string } {
  if (spec?.run && !spec.disabledReason) return { enabled: true };
  return { enabled: false, reason: spec?.disabledReason ?? UNAVAILABLE };
}

function CommandButton({ id, spec, locale }: { id: StandardCommandId; spec: CommandSpec | undefined; locale: Locale }) {
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
      title={enabled ? undefined : reason}
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

  useEffect(() => {
    const disposers = [
      registry.registerGlobal({ id: 'action-bar.more', shortcut: MORE_MENU_SHORTCUT, allowWhileTyping: true, run: () => setMenuOpen((open) => !open) }),
      registry.registerGlobal({ id: 'action-bar.help', shortcut: 'F1', allowWhileTyping: true, run: () => setHelpOpen(true) }),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [registry]);

  const bar = (
    <div className="nx-action-bar" data-nx-action-bar role="toolbar" aria-label="İşlemler çubuğu">
      {ACTION_BAR_ORDER.map((id) => (
        <Fragment key={id}>
          {SEPARATOR_BEFORE.has(id) && <span className="nx-action-bar__sep" aria-hidden="true" />}
          <CommandButton id={id} spec={commands?.[id]} locale={locale} />
        </Fragment>
      ))}
      <span className="nx-action-bar__spacer" />
      {commands?.undo && <CommandButton id="undo" spec={commands.undo} locale={locale} />}
      <ActionsMenu items={commands?.more ?? []} locale={locale} open={menuOpen} onOpenChange={setMenuOpen} />
      {helpOpen && <ShortcutHelpDialog locale={locale} onClose={closeHelp} />}
    </div>
  );
  // One instance: it moves into the active page's slot (under the title) when there is one.
  return slotTarget ? createPortal(bar, slotTarget) : bar;
}
