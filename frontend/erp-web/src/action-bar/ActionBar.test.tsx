import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandProvider, usePageCommands } from '../commands/CommandProvider';
import { ACTION_BAR_ORDER, type CommandSource, type PageCommands } from '../commands/types';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ActionBar, pickCompaction } from './ActionBar';
import { TOOLTIP_DELAY_MS } from './ActionTooltip';
import { readFileSync } from 'node:fs';

// Vitest runs from the package root (jsdom gives import.meta.url a non-file scheme).
const barCss = readFileSync('src/action-bar/action-bar.css', 'utf8');

afterEach(cleanup);

function Page({ commands }: { commands: PageCommands }) {
  usePageCommands(commands);
  return null;
}

function Source({ source, commands }: { source: CommandSource; commands: PageCommands }) {
  usePageCommands(commands, source);
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

const all = (): PageCommands => ({
  ...Object.fromEntries(ACTION_BAR_ORDER.map((id) => [id, { run: vi.fn() }])),
  more: [{ id: 'x', label: 'X', run: vi.fn() }],
});
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const button = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
/** Focuses the button (keyboard focus shows the tooltip at once) and returns the tooltip it describes itself with. */
const tooltipOf = (el: HTMLElement) => {
  act(() => el.focus());
  const tip = screen.getByRole('tooltip');
  expect(el.getAttribute('aria-describedby')?.split(' ')).toContain(tip.id);
  return tip.textContent;
};

describe('ActionBar', () => {
  const commandIds = () => Array.from(bar().querySelectorAll('[data-command]')).map((el) => el.getAttribute('data-command'));
  const layout = () => Array.from(bar().querySelectorAll('.nx-action-bar__commands > *')).map((el) =>
    el.classList.contains('nx-action-bar__sep') ? '|' : el.getAttribute('data-command'));

  it('renders the standard buttons in fixed order plus the actions menu', () => {
    setup(all());
    expect(commandIds()).toEqual([...ACTION_BAR_ORDER, 'more']);
    expect(layout()).toEqual(['new', 'open', 'view', 'save', 'delete', '|', 'refresh', 'filter', '|', 'print', 'export']);
    expect(button('view').textContent).toBe('Görüntüle');
  });

  it('a source label replaces the standard one (Studio pages: Aç reads Düzenle)', () => {
    setup({ open: { run: vi.fn(), label: 'Düzenle' }, view: { run: vi.fn() } });
    expect(button('open').textContent).toBe('Düzenle');
    expect(button('open').getAttribute('aria-label')).toBe('Düzenle');
    expect(button('view').getAttribute('aria-keyshortcuts')).toBe('Shift+Enter');
  });

  it('hides every command no source registered; no İşlemler when the page registered nothing', () => {
    setup(null);
    for (const id of ACTION_BAR_ORDER) expect(button(id)).toBeNull();
    expect(commandIds()).toEqual([]);
    expect(bar().querySelector('.nx-action-bar__sep')).toBeNull();
  });

  it('a list screen (no save registered) shows no Kaydet, keeps the separators, and Ctrl+S does nothing', () => {
    const open = vi.fn();
    const { save: _save, ...list } = all();
    setup({ ...list, open: { run: open }, delete: { disabledReason: 'Önce bir kayıt seçin' } });
    expect(button('save')).toBeNull();
    expect(layout()).toEqual(['new', 'open', 'view', 'delete', '|', 'refresh', 'filter', '|', 'print', 'export']);
    expect(isDisabled(button('delete'))).toBe(true);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('drops a separator whose group has no button left', () => {
    setup({ new: { run: () => undefined }, print: { run: () => undefined } });
    expect(layout()).toEqual(['new', '|', 'print']);
  });

  it('a record form screen (form owns the primary Kaydet) hides Aç, Filtre, Excel and their shortcuts do nothing', () => {
    const page = all();
    const save = vi.fn();
    render(
      <CommandProvider>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}>
          <Page commands={page} />
          <Source source="form" commands={{ save: { run: save, primary: true } }} />
        </KeepAliveViews>
      </CommandProvider>,
    );
    expect(layout()).toEqual(['new', 'save', 'delete', '|', 'refresh', '|', 'print']);
    expect(button('save').getAttribute('data-primary')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'e', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(page.filter!.run).not.toHaveBeenCalled();
    expect(page.export!.run).not.toHaveBeenCalled();
    expect(page.open!.run).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a form beside the list (non-primary Kaydet, or besideList) leaves the list bar with its Kaydet', () => {
    for (const form of [{ save: { run: () => undefined } }, { save: { run: () => undefined, primary: true }, besideList: true }] as PageCommands[]) {
      const { unmount } = render(
        <CommandProvider>
          <ActionBar locale="tr" />
          <KeepAliveViews activeKey="v" openKeys={['v']}>
            <Page commands={all()} />
            <Source source="form" commands={form} />
          </KeepAliveViews>
        </CommandProvider>,
      );
      expect(commandIds()).toEqual([...ACTION_BAR_ORDER, 'more']);
      unmount();
    }
  });

  it('a read-only record that registers save with a reason keeps Kaydet dimmed', () => {
    setup({ save: { disabledReason: 'Banka ekstresi salt okunurdur' } });
    expect(isDisabled(button('save'))).toBe(true);
    expect(tooltipOf(button('save'))).toBe('Banka ekstresi salt okunurdur · Ctrl+S');
  });

  it('disabled button shows its reason (and shortcut) in the tooltip and is not hidden', () => {
    const run = vi.fn();
    setup({ delete: { run, disabledReason: 'Kesilmiş belge silinemez — İşlemler › İptal et' } });
    const del = button('delete');
    expect(del.hidden).toBe(false);
    expect(isDisabled(del)).toBe(true);
    expect(del.title).toBe('');
    expect(document.getElementById(del.getAttribute('aria-describedby')!)?.textContent).toBe('Kesilmiş belge silinemez — İşlemler › İptal et');
    expect(tooltipOf(del)).toBe('Kesilmiş belge silinemez — İşlemler › İptal et · Ctrl+Del');
    fireEvent.click(del);
    expect(run).not.toHaveBeenCalled();
  });

  it('marks the primary command', () => {
    setup({ save: { run: () => undefined, primary: true }, new: { run: () => undefined } });
    expect(button('save').getAttribute('data-primary')).toBe('true');
    expect(button('new').getAttribute('data-primary')).toBeNull();
  });

  it('shows the formatted shortcut in a tooltip, not as a badge on the button', () => {
    setup({ new: { run: () => undefined }, delete: { run: () => undefined } , more: [{ id: 'x', label: 'X', run: () => undefined }] });
    expect(bar().querySelector('kbd')).toBeNull();
    expect(button('new').getAttribute('aria-keyshortcuts')).toBe('F2');
    expect(tooltipOf(button('new'))).toBe('Yeni · F2');
    act(() => (document.activeElement as HTMLElement).blur()); void (button('new'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(tooltipOf(button('delete'))).toBe('Sil · Ctrl+Del');
    act(() => (document.activeElement as HTMLElement).blur()); void (button('delete'));
    expect(tooltipOf(button('more'))).toBe('İşlemler · Alt+İ');
  });

  it('shows the tooltip after the hover delay and hides it on leave', () => {
    vi.useFakeTimers();
    try {
      setup({ save: { run: () => undefined } });
      fireEvent.mouseEnter(button('save'));
      expect(screen.queryByRole('tooltip')).toBeNull();
      act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY_MS); });
      expect(screen.getByRole('tooltip').textContent).toBe('Kaydet · Ctrl+S');
      expect(bar().contains(screen.getByRole('tooltip'))).toBe(false);
      fireEvent.mouseLeave(button('save'));
      expect(screen.queryByRole('tooltip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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

describe('ActionBar compaction (narrow bar)', () => {
  it('pickCompaction takes the least compact level that fits, else the most compact', () => {
    expect(pickCompaction(() => true)).toBe('full');
    expect(pickCompaction((level) => level !== 'full')).toBe('no-keys');
    expect(pickCompaction((level) => level === 'icons')).toBe('icons');
    expect(pickCompaction(() => false)).toBe('icons');
  });

  /** Fakes the button area's widths: `need[level]` px of buttons in an area of `width` px. */
  function fakeLayout(width: number, need: Record<string, number>) {
    const scroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')!;
    const client = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!;
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.classList.contains('nx-action-bar__commands')) return 0;
        return need[this.closest<HTMLElement>('[data-nx-action-bar]')!.dataset.compact ?? 'full'];
      },
    });
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('nx-action-bar__commands') ? width : 0;
      },
    });
    return () => {
      Object.defineProperty(Element.prototype, 'scrollWidth', scroll);
      Object.defineProperty(Element.prototype, 'clientWidth', client);
    };
  }

  it('keeps İşlemler (and Geri Al) outside the scrolling button area', () => {
    setup({ ...all(), undo: { run: () => undefined } });
    const area = bar().querySelector<HTMLElement>('.nx-action-bar__commands')!;
    expect(area.contains(button('more'))).toBe(false);
    expect(area.contains(button('undo'))).toBe(false);
    expect(Array.from(area.querySelectorAll('[data-command]')).map((el) => el.getAttribute('data-command'))).toEqual([...ACTION_BAR_ORDER]);
  });

  it('stays full when the buttons fit (and without layout)', () => {
    setup({ save: { run: () => undefined } });
    expect(bar().getAttribute('data-compact')).toBe('full');
    expect(button('save').title).toBe('');
  });

  it('compacts to icons only (label and shortcut in the tooltip); İşlemler keeps its label', () => {
    const restore = fakeLayout(700, { full: 900, 'no-keys': 760, icons: 420 });
    try {
      setup({ save: { run: () => undefined }, delete: { disabledReason: 'Önce bir kayıt seçin' } , more: [{ id: 'x', label: 'X', run: () => undefined }] });
      expect(bar().getAttribute('data-compact')).toBe('icons');
      expect(button('save').getAttribute('aria-label')).toBe('Kaydet');
      expect(tooltipOf(button('save'))).toBe('Kaydet · Ctrl+S');
      act(() => (document.activeElement as HTMLElement).blur()); void (button('save'));
      // A disabled button shows its reason with the shortcut.
      expect(tooltipOf(button('delete'))).toBe('Önce bir kayıt seçin · Ctrl+Del');
      expect(button('more').textContent).toContain('İşlemler');
    } finally {
      restore();
    }
    cleanup();
    const restoreWide = fakeLayout(800, { full: 900, 'no-keys': 760, icons: 420 });
    try {
      setup({ save: { run: () => undefined } });
      expect(bar().getAttribute('data-compact')).toBe('no-keys');
      expect(button('save').title).toBe('');
    } finally {
      restoreWide();
    }
  });

  describe('page look (barLook) and hidden commands', () => {
    const layout = () => Array.from(bar().querySelectorAll('.nx-action-bar__commands > *')).map((el) =>
      el.classList.contains('nx-action-bar__sep') ? '|' : el.getAttribute('data-command'));
    const LOOK_ATTRIBUTES = ['data-align', 'data-density', 'data-sticky', 'data-separators', 'data-size', 'data-style', 'data-content', 'data-border', 'data-radius', 'data-accent', 'data-background', 'style'];

    it('without a look the bar carries none of the look attributes', () => {
      setup(all());
      for (const name of LOOK_ATTRIBUTES) expect(bar().hasAttribute(name)).toBe(false);
    });

    it('applies the look as data attributes and CSS variables', () => {
      setup({ ...all(), look: { align: 'center', density: 'wide', sticky: true, separators: false, size: 'lg', style: 'outline', content: 'text', border: 'bottom', radius: 'round', accent: '#112233', background: '#FAFAFA' } });
      expect(bar().getAttribute('data-align')).toBe('center');
      expect(bar().getAttribute('data-density')).toBe('wide');
      expect(bar().getAttribute('data-sticky')).toBe('true');
      expect(bar().getAttribute('data-separators')).toBe('false');
      expect(bar().getAttribute('data-size')).toBe('lg');
      expect(bar().getAttribute('data-style')).toBe('outline');
      expect(bar().getAttribute('data-content')).toBe('text');
      expect(bar().getAttribute('data-border')).toBe('bottom');
      expect(bar().getAttribute('data-radius')).toBe('round');
      expect(bar().style.getPropertyValue('--nx-bar-accent')).toBe('#112233');
      expect(bar().style.getPropertyValue('--nx-bar-background')).toBe('#FAFAFA');
      // Labels stay in the DOM (aria-label too); CSS decides what shows.
      expect(button('save').getAttribute('aria-label')).toBe('Kaydet');
    });

    it('content=text never empties a button at the icons compaction level (the icon comes back)', () => {
      // jsdom applies no stylesheet: the rule that hides the icons must exclude the icons level, where labels are hidden.
      expect(barCss).toContain('.nx-action-bar[data-content="text"]:not([data-compact="icons"]) .nx-action-bar__button:not(.nx-action-bar__more) > svg { display: none; }');
      const restore = fakeLayout(700, { full: 900, 'no-keys': 760, icons: 420 });
      try {
        setup({ save: { run: () => undefined }, look: { content: 'text' } });
        expect(bar().getAttribute('data-compact')).toBe('icons');
        expect(button('save').querySelector('svg')).not.toBeNull();
      } finally {
        restore();
      }
    });

    it('hints=false drops the shortcut from the tooltips', () => {
      setup({ save: { run: () => undefined }, delete: { disabledReason: 'Önce bir kayıt seçin' }, look: { hints: false } , more: [{ id: 'x', label: 'X', run: () => undefined }] });
      expect(tooltipOf(button('save'))).toBe('Kaydet');
      act(() => (document.activeElement as HTMLElement).blur());
      expect(tooltipOf(button('delete'))).toBe('Önce bir kayıt seçin');
      act(() => (document.activeElement as HTMLElement).blur());
      expect(tooltipOf(button('more'))).toBe('İşlemler');
      // The shortcut itself still works and stays announced.
      expect(button('save').getAttribute('aria-keyshortcuts')).toBe('Ctrl+S');
    });

    it('hidden commands are not drawn and their shortcuts do nothing', () => {
      const save = vi.fn();
      setup({ ...all(), save: { hidden: true }, export: { hidden: true }, refresh: { hidden: true, run: save } });
      expect(button('save')).toBeNull();
      expect(button('export')).toBeNull();
      expect(button('refresh')).toBeNull();
      expect(layout()).toEqual(['new', 'open', 'view', 'delete', '|', 'filter', '|', 'print']);
      const event = new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(save).not.toHaveBeenCalled();
    });

    it('moreHidden removes İşlemler and makes Alt+İ a no-op', () => {
      setup({ ...all(), more: [{ id: 'x', label: 'X', run: vi.fn() }], moreHidden: true });
      expect(button('more')).toBeNull();
      fireEvent.keyDown(document.body, { key: 'İ', altKey: true });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('the shared bar resets its look and İşlemler on a view without them', () => {
      const view = (key: string) => render(
        <CommandProvider>
          <ActionBar locale="tr" />
          <KeepAliveViews activeKey={key} openKeys={['styled', 'plain']}>
            {key === 'styled' ? <Page commands={{ refresh: { run: vi.fn() }, moreHidden: true, look: { size: 'sm', accent: '#000000' } }} />
              : <Page commands={{ refresh: { run: vi.fn() } }} />}
          </KeepAliveViews>
        </CommandProvider>,
      );
      const { rerender } = view('styled');
      expect(bar().getAttribute('data-size')).toBe('sm');
      expect(button('more')).toBeNull();
      rerender(
        <CommandProvider>
          <ActionBar locale="tr" />
          <KeepAliveViews activeKey="plain" openKeys={['styled', 'plain']}><Page commands={{ refresh: { run: vi.fn() }, more: [{ id: 'x', label: 'X', run: vi.fn() }] }} /></KeepAliveViews>
        </CommandProvider>,
      );
      // React leaves an empty style attribute behind once the variables are removed.
      for (const name of LOOK_ATTRIBUTES.filter((attribute) => attribute !== 'style')) expect(bar().hasAttribute(name)).toBe(false);
      expect(bar().getAttribute('style') ?? '').toBe('');
      expect(button('more')).not.toBeNull();
    });
  });
});
