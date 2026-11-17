import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdvancedDataGrid from '../AdvancedDataGrid';
import { CommandProvider } from '../commands/CommandProvider';
import { supplementalEnglish } from '../locales/en';

type Item = { id: string; name: string; qty: number };
const items = (count: number, prefix = 'S'): Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix === 'S' ? 'Stok' : 'Ürün'} ${i + 1}`, qty: i + 1 }));

type GridProps = Partial<Parameters<typeof AdvancedDataGrid>[0]>;
function tree(rows: Item[], props: GridProps = {}, onRowClick?: (id: string) => void) {
  return (
    <CommandProvider>
      <AdvancedDataGrid gridId="selection-test" aria-label="Stok kartları" {...props}>
        <thead>
          <tr>
            <th>Stok adı</th>
            <th>Miktar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={onRowClick ? () => onRowClick(row.id) : undefined}>
              <td>{row.name}</td>
              <td>{row.qty}</td>
            </tr>
          ))}
        </tbody>
      </AdvancedDataGrid>
    </CommandProvider>
  );
}

// The focusable scroll container (the grid's outer wrapper is a region with the same name).
const region = () => document.querySelector<HTMLElement>('.advanced-grid-scroll')!;
const rowBoxes = () => screen.queryAllByRole('checkbox', { name: /^Satırı seç/ });
const master = () => screen.getByRole('checkbox', { name: 'Tümünü seç' });
const checkedCount = () => rowBoxes().filter((box) => (box as HTMLInputElement).checked).length;
const bulkBar = () => screen.queryByRole('toolbar', { name: 'Toplu işlemler' });
const bodyRows = () => within(region()).getAllByRole('row').slice(1);

beforeEach(() => {
  localStorage.clear();
  // jsdom has no ResizeObserver; the grid only needs it to exist.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no element scrolling; pagination resets the scroll position.
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AdvancedDataGrid selectable', () => {
  it('without selectable keeps the legacy selection (inline row checkbox) and adds no selection column', () => {
    render(tree(items(3)));
    expect(screen.getByRole('checkbox', { name: 'Görünen satırları seç' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Satırı seç 1' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Tümünü seç' })).toBeNull();
    expect(region().querySelector('.advanced-grid-select-cell')).toBeNull();
    cleanup();
    render(tree(items(3), { enableRowSelection: false }));
    expect(within(region()).queryAllByRole('checkbox')).toHaveLength(0);
    expect(region().querySelector('.advanced-grid-select-cell')).toBeNull();
  });

  it('renders a selection column with a "Tümünü seç" header box and one "Satırı seç" box per row', () => {
    render(tree(items(3), { selectable: true }));
    expect(master()).toBeTruthy();
    expect(rowBoxes()).toHaveLength(3);
    // The legacy master label and the inline row number are gone in this mode.
    expect(screen.queryByRole('checkbox', { name: 'Görünen satırları seç' })).toBeNull();
    const headerCells = within(region()).getAllByRole('columnheader');
    expect(headerCells[0].className).toContain('advanced-grid-select-cell');
    expect(headerCells).toHaveLength(3);
  });

  it('select-all selects only the visible page, and the header is mixed while partial', () => {
    const onSelectionChange = vi.fn();
    render(tree(items(30), { selectable: true, onSelectionChange }));
    expect(rowBoxes()).toHaveLength(25);
    fireEvent.click(rowBoxes()[1]);
    expect(master().getAttribute('aria-checked')).toBe('mixed');
    expect((master() as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(master());
    expect(checkedCount()).toBe(25);
    expect(master().getAttribute('aria-checked')).not.toBe('mixed');
    expect((master() as HTMLInputElement).checked).toBe(true);
    expect(onSelectionChange).toHaveBeenLastCalledWith(items(25).map((item) => item.id));
    fireEvent.click(master());
    expect(checkedCount()).toBe(0);
  });

  it('Space toggles the current row, arrows move it, Ctrl+A selects the page, Esc clears', () => {
    render(tree(items(4), { selectable: true }));
    const grid = region();
    grid.focus();
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(bodyRows()[0].getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(bodyRows()[1].getAttribute('aria-current')).toBe('true');
    expect(bodyRows()[0].getAttribute('aria-current')).toBeNull();
    fireEvent.keyDown(grid, { key: ' ' });
    expect((rowBoxes()[1] as HTMLInputElement).checked).toBe(true);
    expect(bodyRows()[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(bodyRows()[0].getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(grid, { key: 'a', ctrlKey: true });
    expect(checkedCount()).toBe(4);
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(checkedCount()).toBe(0);
  });

  it('an arrow key from a focused row checkbox hands focus to the grid, so Space toggles the new current row', () => {
    render(tree(items(3), { selectable: true }));
    const first = rowBoxes()[0];
    fireEvent.click(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(bodyRows()[1].getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(region());
    fireEvent.keyDown(region(), { key: ' ' });
    expect(rowBoxes().map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, false]);
  });

  it('ticking a row box does not run the row click of the page (no record opens), but makes it the current row', () => {
    const onRowClick = vi.fn();
    render(tree(items(3), { selectable: true }, onRowClick));
    fireEvent.click(rowBoxes()[2]);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(bodyRows()[2].getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByText('Stok 1'));
    expect(onRowClick).toHaveBeenCalledWith('S1');
    expect(bodyRows()[0].getAttribute('aria-current')).toBe('true');
  });

  it('ignores the keys while typing in a cell editor and while a modal outside the grid is open', () => {
    // The inline cell editor exists only for grids with onEditRows.
    const { rerender } = render(tree(items(3), { selectable: true, onEditRows: () => {} }));
    fireEvent.doubleClick(screen.getByText('Stok 1'));
    const editor = within(region()).getByRole('textbox');
    fireEvent.keyDown(editor, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(editor, { key: ' ' });
    expect(checkedCount()).toBe(0);
    fireEvent.keyDown(editor, { key: 'Escape' });

    rerender(
      <>
        {tree(items(3), { selectable: true })}
        <div role="dialog" aria-modal="true">Onay</div>
      </>,
    );
    fireEvent.keyDown(region(), { key: 'a', ctrlKey: true });
    expect(checkedCount()).toBe(0);
  });

  it('clears the selection when the page, the filter or the sort changes', () => {
    render(tree(items(30), { selectable: true }));
    fireEvent.click(rowBoxes()[0]);
    expect(checkedCount()).toBe(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sonraki' })[0]);
    expect(rowBoxes()).toHaveLength(5);
    fireEvent.click(screen.getAllByRole('button', { name: 'Önceki' })[0]);
    expect(checkedCount()).toBe(0);

    fireEvent.click(rowBoxes()[0]);
    fireEvent.change(screen.getByPlaceholderText('Tüm sütunlarda ara'), { target: { value: 'Stok' } });
    expect(checkedCount()).toBe(0);

    fireEvent.click(rowBoxes()[0]);
    expect(checkedCount()).toBe(1);
    fireEvent.click(within(region()).getByRole('columnheader', { name: /Miktar/ }));
    expect(checkedCount()).toBe(0);
  });

  it('drops selected rows whose keys disappear when the row set changes (external pagination)', () => {
    const { rerender } = render(tree(items(3), { selectable: true, externalPagination: true }));
    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(rowBoxes()[2]);
    rerender(tree(items(3).slice(1), { selectable: true, externalPagination: true }));
    expect(checkedCount()).toBe(1);
    // The dropped key stays dropped when its row comes back.
    rerender(tree(items(3), { selectable: true, externalPagination: true }));
    expect(rowBoxes().map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, true]);
    rerender(tree(items(3, 'U'), { selectable: true, externalPagination: true }));
    expect(checkedCount()).toBe(0);
    expect(bulkBar()).toBeNull();
  });

  it('shows the bulk bar with the selection, runs an action with the keys, and Esc closes it', () => {
    const run = vi.fn();
    render(
      tree(items(3), {
        selectable: true,
        bulkActions: [
          { id: 'excel', label: 'Excel (seçilenler)', run },
          { id: 'delete', label: 'Sil', run: vi.fn(), disabledReason: 'Silme yetkiniz yok.' },
        ],
      }),
    );
    expect(bulkBar()).toBeNull();
    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(rowBoxes()[2]);
    const bar = bulkBar()!;
    expect(bar).toBeTruthy();
    expect(within(bar).getByText('2')).toBeTruthy();
    expect(within(bar).getByText('seçili')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Excel (seçilenler)' }));
    expect(run).toHaveBeenCalledWith(["S1", "S3"]);
    const remove = within(bar).getByRole('button', { name: 'Sil' }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(remove.title).toBe('Silme yetkiniz yok.');
    expect(within(bar).getByText('Esc')).toBeTruthy();
    fireEvent.keyDown(region(), { key: 'Escape' });
    expect(bulkBar()).toBeNull();
    expect(checkedCount()).toBe(0);
  });

  it('Esc on a bulk bar button also clears the selection and returns focus to the grid', () => {
    render(tree(items(3), { selectable: true, bulkActions: [{ id: 'x', label: 'Excel', run: () => {} }] }));
    fireEvent.click(rowBoxes()[0]);
    const action = within(bulkBar()!).getByRole('button', { name: 'Excel' });
    action.focus();
    fireEvent.keyDown(action, { key: 'Escape' });
    expect(bulkBar()).toBeNull();
    expect(checkedCount()).toBe(0);
    expect(document.activeElement).toBe(region());
  });

  it('the bulk bar clear button clears the selection', () => {
    render(tree(items(3), { selectable: true, bulkActions: [{ id: 'x', label: 'Excel', run: () => {} }] }));
    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(within(bulkBar()!).getByRole('button', { name: 'Seçimi temizle' }));
    expect(bulkBar()).toBeNull();
    expect(checkedCount()).toBe(0);
  });

  it('starts the keyboard from the row the page marks as current', () => {
    render(
      <CommandProvider>
        <AdvancedDataGrid gridId="selection-marked" selectable>
          <thead><tr><th>Stok adı</th></tr></thead>
          <tbody>
            {items(3).map((row) => (
              <tr key={row.id} aria-selected={row.id === 'S2'}><td>{row.name}</td></tr>
            ))}
          </tbody>
        </AdvancedDataGrid>
      </CommandProvider>,
    );
    expect(bodyRows()[1].getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(region(), { key: ' ' });
    expect(rowBoxes().map((box) => (box as HTMLInputElement).checked)).toEqual([false, true, false]);
    fireEvent.keyDown(region(), { key: 'ArrowDown' });
    expect(bodyRows()[2].getAttribute('aria-current')).toBe('true');
  });

  it('reports the current row to the page (arrows, row click) and null when it leaves the page', () => {
    const onCurrentRowChange = vi.fn();
    const { rerender } = render(tree(items(3), { selectable: true, onCurrentRowChange }));
    expect(onCurrentRowChange).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(region(), { key: 'ArrowDown' });
    expect(onCurrentRowChange).toHaveBeenLastCalledWith('S1');
    fireEvent.click(bodyRows()[2]);
    expect(onCurrentRowChange).toHaveBeenLastCalledWith('S3');
    const calls = onCurrentRowChange.mock.calls.length;
    rerender(tree(items(3), { selectable: true, onCurrentRowChange }));
    expect(onCurrentRowChange).toHaveBeenCalledTimes(calls);
    rerender(tree(items(2), { selectable: true, onCurrentRowChange }));
    expect(onCurrentRowChange).toHaveBeenLastCalledWith(null);
  });

  it('with currentRowKey the page owns the current row: arrows and clicks only request it', () => {
    const onCurrentRowChange = vi.fn();
    const { rerender } = render(tree(items(3), { selectable: true, currentRowKey: null, onCurrentRowChange }));
    // Controlled: no report on mount, nothing current.
    expect(onCurrentRowChange).not.toHaveBeenCalled();
    expect(bodyRows().some((row) => row.getAttribute('aria-current') === 'true')).toBe(false);
    fireEvent.keyDown(region(), { key: 'ArrowDown' });
    expect(onCurrentRowChange).toHaveBeenLastCalledWith('S1');
    // The page has not accepted it yet: the row is not current.
    expect(bodyRows()[0].getAttribute('aria-current')).toBeNull();
    rerender(tree(items(3), { selectable: true, currentRowKey: 'S1', onCurrentRowChange }));
    expect(bodyRows()[0].getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(region(), { key: 'ArrowDown' });
    expect(onCurrentRowChange).toHaveBeenLastCalledWith('S2');
    fireEvent.click(bodyRows()[2]);
    expect(onCurrentRowChange).toHaveBeenLastCalledWith('S3');
    // Declined (e.g. unsaved changes): the page keeps S1 current.
    expect(bodyRows()[0].getAttribute('aria-current')).toBe('true');
    // A click on the current row asks nothing.
    const calls = onCurrentRowChange.mock.calls.length;
    fireEvent.click(bodyRows()[0]);
    expect(onCurrentRowChange).toHaveBeenCalledTimes(calls);
    // The page clears it (Esc = Vazgeç).
    rerender(tree(items(3), { selectable: true, currentRowKey: null, onCurrentRowChange }));
    expect(bodyRows().some((row) => row.getAttribute('aria-current') === 'true')).toBe(false);
  });

  it('reports the displayed row order (after a header sort) to the page', () => {
    const onVisibleRowsChange = vi.fn();
    render(tree(items(3), { selectable: true, onVisibleRowsChange }));
    expect(onVisibleRowsChange).toHaveBeenLastCalledWith(['S1', 'S2', 'S3']);
    const header = within(region()).getAllByRole('columnheader').find((th) => th.textContent?.includes('Stok adı'))!;
    fireEvent.click(header);
    fireEvent.click(header);
    expect(onVisibleRowsChange).toHaveBeenLastCalledWith(['S3', 'S2', 'S1']);
    const calls = onVisibleRowsChange.mock.calls.length;
    fireEvent.keyDown(region(), { key: 'ArrowDown' });
    expect(onVisibleRowsChange).toHaveBeenCalledTimes(calls);
  });

  it('leaves arrow keys to an open menu inside a row', () => {
    render(
      <CommandProvider>
        <AdvancedDataGrid gridId="selection-menu" selectable>
          <thead><tr><th>Stok adı</th><th>İşlemler</th></tr></thead>
          <tbody>
            {items(2).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td><details open><summary>⋯</summary><div role="menu"><button type="button" role="menuitem">Aç {row.id}</button></div></details></td>
              </tr>
            ))}
          </tbody>
        </AdvancedDataGrid>
      </CommandProvider>,
    );
    const item = screen.getByRole('menuitem', { name: 'Aç S1' });
    fireEvent.keyDown(item, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getAllByText('⋯')[0], { key: 'ArrowDown' });
    expect(bodyRows().map((row) => row.getAttribute('aria-current'))).toEqual([null, null]);
  });
});

describe('BulkActionBar', () => {
  it('is one tab stop: only one button is tabbable and ←/→ move it (roving tabindex)', () => {
    render(
      tree(items(3), {
        selectable: true,
        bulkActions: [
          { id: 'excel', label: 'Excel', run: () => {} },
          { id: 'locked', label: 'Kilitli', run: () => {}, disabledReason: 'Yetki yok.' },
          { id: 'print', label: 'Yazdır', run: () => {} },
        ],
      }),
    );
    fireEvent.click(rowBoxes()[0]);
    const bar = bulkBar()!;
    const tabbable = () => within(bar).getAllByRole('button').filter((b) => b.tabIndex === 0).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(tabbable()).toEqual(['Excel']);
    const excel = within(bar).getByRole('button', { name: 'Excel' });
    excel.focus();
    fireEvent.keyDown(excel, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('Yazdır');
    expect(tabbable()).toEqual(['Yazdır']);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Seçimi temizle');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('Excel');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Seçimi temizle');
  });

  it('its Turkish labels have English dictionary entries (the DOM translator also translates aria-label)', () => {
    for (const source of ['Toplu işlemler', 'Seçimi temizle', 'seçili', 'Tümünü seç', 'Satırı seç'])
      expect(supplementalEnglish[source], source).toBeTruthy();
  });

  it('reserves room under the last row for the bar on the scroll area while it is shown', () => {
    render(tree(items(3), { selectable: true, bulkActions: [{ id: 'x', label: 'Excel', run: () => {} }] }));
    expect(region().style.getPropertyValue('--nx-bulk-space')).toBe('');
    fireEvent.click(rowBoxes()[0]);
    expect(region().style.getPropertyValue('--nx-bulk-space')).toMatch(/px$/);
    fireEvent.keyDown(region(), { key: 'Escape' });
    expect(region().style.getPropertyValue('--nx-bulk-space')).toBe('');
  });

  it('re-measures its lift when the grid or page layout resizes without a scroll', () => {
    const observers: { callback: () => void; targets: Element[] }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        targets: Element[] = [];
        constructor(public callback: () => void) { observers.push(this); }
        observe(target: Element) { this.targets.push(target); }
        unobserve() {}
        disconnect() { this.targets = []; }
      },
    );
    // Run the scheduled measurement at once (returning 0 leaves no frame pending).
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => { callback(0); return 0; });
    render(tree(items(3), { selectable: true, bulkActions: [{ id: 'x', label: 'Excel', run: () => {} }] }));
    fireEvent.click(rowBoxes()[0]);
    const dock = document.querySelector<HTMLElement>('.nx-bulk-dock')!;
    expect(dock.style.getPropertyValue('--nx-bulk-lift')).toBe('0px');
    const watcher = observers.find((o) => o.targets.includes(region()) && o.targets.includes(document.documentElement));
    expect(watcher).toBeTruthy();
    // Layout change (fullscreen, density, side panel): the grid now ends 232px below the window (768px high).
    dock.getBoundingClientRect = () => ({ top: window.innerHeight + 232 }) as DOMRect;
    act(() => watcher!.callback());
    expect(dock.style.getPropertyValue('--nx-bulk-lift')).toBe('232px');
  });
});
