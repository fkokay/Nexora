import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdvancedDataGrid from '../AdvancedDataGrid';
import { CommandProvider } from '../commands/CommandProvider';

type Item = { id: string; name: string; qty: number };
const items = (count: number, prefix = 'S'): Item[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix === 'S' ? 'Stok' : 'Ürün'} ${i + 1}`, qty: i + 1 }));

type GridProps = Partial<Parameters<typeof AdvancedDataGrid>[0]>;
function tree(rows: Item[], props: GridProps = {}) {
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
            <tr key={row.id}>
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

  it('clears the selection when the page or the filter changes', () => {
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
  });

  it('drops selected rows whose keys disappear when the row set changes (external pagination)', () => {
    const { rerender } = render(tree(items(3), { selectable: true, externalPagination: true }));
    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(rowBoxes()[2]);
    rerender(tree(items(3).slice(1), { selectable: true, externalPagination: true }));
    expect(checkedCount()).toBe(1);
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
});
