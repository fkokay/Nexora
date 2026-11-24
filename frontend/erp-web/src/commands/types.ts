/**
 * `view` (Görüntüle) opens the selected record read-only. Only Studio pages register it (İşlem Çubuğu, next to `open`, which
 * those pages label "Düzenle"); other screens keep their single "Aç".
 */
export type StandardCommandId = 'new' | 'open' | 'view' | 'save' | 'delete' | 'refresh' | 'filter' | 'print' | 'export' | 'undo';

export const ACTION_BAR_ORDER: readonly StandardCommandId[] = ['new', 'open', 'view', 'save', 'delete', 'refresh', 'filter', 'print', 'export'];

/** List commands a record form screen does not offer: the bar hides them and their shortcuts do nothing there. */
export const HIDDEN_ON_FORM: ReadonlySet<StandardCommandId> = new Set(['open', 'view', 'filter', 'export']);

/**
 * Whether the bar shows the standard command: only when some source registered it (a registered command that is
 * unavailable right now is drawn dimmed with its reason), and never a list command on a form screen.
 */
export function offersCommand(commands: PageCommands | undefined, id: StandardCommandId): boolean {
  if (!commands?.[id] || commands[id]!.hidden) return false;
  return !(commands.screen === 'form' && HIDDEN_ON_FORM.has(id));
}

/**
 * `hidden`: the page removed the command (İşlem Çubuğu `hiddenCommands` / `commandWhen`). The bar does not draw it, its
 * shortcut does nothing (a reserved browser chord stays prevented) and a lower-precedence source cannot re-add it.
 * A hidden spec carries nothing else.
 */
export type CommandSpec = {
  run?: () => void | Promise<void>; disabledReason?: string; primary?: boolean; hidden?: boolean;
  /** The source's own button label (e.g. a Studio page's Aç reads "Düzenle"); absent = the standard label. */
  label?: string;
};

/**
 * Look of the action bar a page chose (İşlem Çubuğu `barLook`). A missing key keeps today's look; `title` (the page title
 * row) and `unbound` (hide unbound commands) are applied by the page itself.
 */
export type BarLook = {
  align?: 'start' | 'center' | 'end';
  density?: 'compact' | 'normal' | 'wide';
  sticky?: boolean;
  separators?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: 'outline' | 'solid' | 'plain';
  content?: 'both' | 'text' | 'icon';
  unbound?: 'dim' | 'hide';
  hints?: boolean;
  border?: 'none' | 'bottom' | 'box';
  radius?: 'sharp' | 'soft' | 'round';
  title?: boolean;
  /** #RRGGBB */
  accent?: string;
  /** #RRGGBB */
  background?: string;
};

/** BarLook keys in a fixed order (stable signatures). */
export const BAR_LOOK_KEYS = ['align', 'density', 'sticky', 'separators', 'size', 'style', 'content', 'unbound', 'hints', 'border', 'radius', 'title', 'accent', 'background'] as const satisfies readonly (keyof BarLook)[];

export type MenuCommand = { id: string; label: string; shortcut?: string; run?: () => void | Promise<void>; disabledReason?: string };

/**
 * `besideList` (a form registration): the form sits on a list screen (under or beside the list), so the bar stays a
 * list bar. `screen` is computed by the registry for the bar: `form` while an open record form owns the primary Kaydet.
 */
export type PageCommands = Partial<Record<StandardCommandId, CommandSpec>> & {
  more?: MenuCommand[];
  besideList?: boolean;
  screen?: 'list' | 'form';
  /** The page removed the İşlemler menu: the bar does not draw it and Alt+İ does nothing. */
  moreHidden?: boolean;
  /** The page's bar look (from the effective `page` source only); absent = today's look. */
  look?: BarLook;
};

/**
 * `form`: an open record form (RecordFormPage); the most recently opened one wins and its `more` items come first.
 * `page` > `list` > `grid`: earliest registered wins.
 */
export type CommandSource = 'form' | 'page' | 'list' | 'grid';
