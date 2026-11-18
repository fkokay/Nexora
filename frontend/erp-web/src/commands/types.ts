export type StandardCommandId = 'new' | 'open' | 'save' | 'delete' | 'refresh' | 'filter' | 'print' | 'export' | 'undo';

export const ACTION_BAR_ORDER: readonly StandardCommandId[] = ['new', 'open', 'save', 'delete', 'refresh', 'filter', 'print', 'export'];

/** List commands a record form screen does not offer: the bar hides them and their shortcuts do nothing there. */
export const HIDDEN_ON_FORM: ReadonlySet<StandardCommandId> = new Set(['open', 'filter', 'export']);

/**
 * Whether the bar shows the standard command: only when some source registered it (a registered command that is
 * unavailable right now is drawn dimmed with its reason), and never a list command on a form screen.
 */
export function offersCommand(commands: PageCommands | undefined, id: StandardCommandId): boolean {
  if (!commands?.[id]) return false;
  return !(commands.screen === 'form' && HIDDEN_ON_FORM.has(id));
}

export type CommandSpec = { run?: () => void | Promise<void>; disabledReason?: string; primary?: boolean };

export type MenuCommand = { id: string; label: string; shortcut?: string; run?: () => void | Promise<void>; disabledReason?: string };

/**
 * `besideList` (a form registration): the form sits on a list screen (under or beside the list), so the bar stays a
 * list bar. `screen` is computed by the registry for the bar: `form` while an open record form owns the primary Kaydet.
 */
export type PageCommands = Partial<Record<StandardCommandId, CommandSpec>> & {
  more?: MenuCommand[];
  besideList?: boolean;
  screen?: 'list' | 'form';
};

/**
 * `form`: an open record form (RecordFormPage); the most recently opened one wins and its `more` items come first.
 * `page` > `list` > `grid`: earliest registered wins.
 */
export type CommandSource = 'form' | 'page' | 'list' | 'grid';
