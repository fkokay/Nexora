import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider, usePageCommands } from '../commands/CommandProvider';
import { ACTION_BAR_ORDER, type PageCommands } from '../commands/types';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ActionBar } from './ActionBar';

afterEach(cleanup);

function Page({ commands }: { commands: PageCommands }) {
  usePageCommands(commands);
  return null;
}

function setup(commands: PageCommands | null) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{commands ? <Page commands={commands} /> : <span />}</KeepAliveViews>
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const button = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

describe('ActionBar', () => {
  it('renders the eight standard buttons in fixed order plus the actions menu', () => {
    setup({});
    const ids = Array.from(bar().querySelectorAll('[data-command]')).map((el) => el.getAttribute('data-command'));
    expect(ids).toEqual([...ACTION_BAR_ORDER, 'more']);
  });

  it('renders a button for every command even when the page registered nothing', () => {
    setup(null);
    for (const id of ACTION_BAR_ORDER) {
      expect(button(id)).toBeTruthy();
      expect(isDisabled(button(id))).toBe(true);
      expect(button(id).title).toBe('Bu ekranda kullanılamaz');
    }
  });

  it('disabled button shows its reason as title and is not hidden', () => {
    const run = vi.fn();
    setup({ delete: { run, disabledReason: 'Kesilmiş belge silinemez — İşlemler › İptal et' } });
    const del = button('delete');
    expect(del.hidden).toBe(false);
    expect(isDisabled(del)).toBe(true);
    expect(del.title).toBe('Kesilmiş belge silinemez — İşlemler › İptal et');
    expect(document.getElementById(del.getAttribute('aria-describedby')!)?.textContent).toBe('Kesilmiş belge silinemez — İşlemler › İptal et');
    fireEvent.click(del);
    expect(run).not.toHaveBeenCalled();
  });

  it('marks the primary command', () => {
    setup({ save: { run: () => undefined, primary: true }, new: { run: () => undefined } });
    expect(button('save').getAttribute('data-primary')).toBe('true');
    expect(button('new').getAttribute('data-primary')).toBeNull();
  });

  it('shows the formatted shortcut on each button', () => {
    setup({});
    expect(within(button('delete')).getByText('Ctrl+Del')).toBeTruthy();
    expect(within(button('new')).getByText('F2')).toBeTruthy();
    expect(within(button('more')).getByText('Alt+İ')).toBeTruthy();
  });

  it('renders the undo button only when the page registers it', () => {
    const undo = vi.fn();
    setup({ undo: { run: undo } });
    fireEvent.click(button('undo'));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('actions menu opens with Alt+İ, lists items with shortcut, disabled items show reason, Esc closes and returns focus', () => {
    const cancel = vi.fn();
    setup({ more: [
      { id: 'cancel', label: 'İptal et', shortcut: 'Ctrl+Shift+K', run: cancel },
      { id: 'dup', label: 'Çoğalt', disabledReason: 'Önce kaydedin' },
    ] });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'İ', altKey: true });
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.getAttribute('data-item'))).toEqual(['cancel', 'dup']);
    expect(within(items[0]).getByText('Ctrl+Shift+K')).toBeTruthy();
    expect(isDisabled(items[1])).toBe(true);
    expect(items[1].title).toBe('Önce kaydedin');
    expect(button('more').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(items[1]);
    expect(screen.queryByRole('menu')).not.toBeNull();
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button('more'));
    fireEvent.click(button('more'));
    fireEvent.click(screen.getByRole('menuitem', { name: /İptal et/ }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the actions menu on outside click', () => {
    setup({ more: [{ id: 'a', label: 'A', run: () => undefined }] });
    fireEvent.click(button('more'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clicking a button and pressing its shortcut call the same run', () => {
    const save = vi.fn();
    setup({ save: { run: save } });
    fireEvent.click(button('save'));
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('F1 opens the shortcut help listing all standard and global shortcuts', () => {
    setup({});
    fireEvent.keyDown(document.body, { key: 'F1' });
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    for (const text of ['F2', 'Enter', 'Ctrl+S', 'Ctrl+Del', 'F5', 'Ctrl+F', 'Ctrl+P', 'Ctrl+E', 'Ctrl+Z', 'Alt+İ', 'Ctrl+K', 'Ctrl+B', 'Ctrl+W', 'Ctrl+Tab', 'Alt+←', 'Alt+→', 'F1', 'Ctrl+↑/↓', 'PgUp/PgDn', 'Ctrl+.', 'Esc']) {
      expect(within(dialog).getAllByText(text).length).toBeGreaterThan(0);
    }
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has an accessible name on every button', () => {
    setup({ undo: { run: () => undefined } });
    for (const el of Array.from(bar().querySelectorAll<HTMLElement>('[data-command]'))) {
      expect((el.getAttribute('aria-label') ?? '').trim()).not.toBe('');
    }
  });
});
