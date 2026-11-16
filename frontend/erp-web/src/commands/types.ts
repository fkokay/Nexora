export type StandardCommandId = 'new' | 'open' | 'save' | 'delete' | 'refresh' | 'filter' | 'print' | 'export' | 'undo';

export const ACTION_BAR_ORDER: readonly StandardCommandId[] = ['new', 'open', 'save', 'delete', 'refresh', 'filter', 'print', 'export'];

export type CommandSpec = { run?: () => void | Promise<void>; disabledReason?: string; primary?: boolean };

export type MenuCommand = { id: string; label: string; shortcut?: string; run?: () => void | Promise<void>; disabledReason?: string };

export type PageCommands = Partial<Record<StandardCommandId, CommandSpec>> & { more?: MenuCommand[] };

export type CommandSource = 'page' | 'list' | 'grid';
