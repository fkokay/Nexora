import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import InventoryStockPage from '../InventoryStockPage';
import { ConfirmDialogHost } from '../confirmDialog';
import { stockListStatus } from './components/InventoryStockGrid';

const warehouses = [
  { id: 'w1', code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'AA' },
  { id: 'w2', code: 'D2', name: 'Yedek depo', isActive: true, rowVersion: 'AA' },
];
const balance = (id: string, code: string, name: string, quantity: number, minimum: number, value: number, unvalued: number, unit = 'ADET') => ({
  stockItemId: id, code, name, unitCode: unit, minimumStock: minimum, quantityOnHand: quantity, belowMinimum: quantity < minimum,
  reservedQuantity: 0, availableQuantity: quantity, valuationAmountBase: value, unvaluedQuantity: unvalued, baseCurrencyCode: 'TRY',
});
const stockItem = (id: string, code: string, name: string, category: string, unit = 'ADET') => ({
  id, code, name, barcode: null, unitCode: unit, category, minimumStock: 10, isActive: true, createdAt: '2026-11-01T09:00:00Z',
  rowVersion: 'AA', trackingMode: 'None', procurementLeadTimeDays: 0, manufacturingLeadTimeDays: 0,
});
const rows = [
  { balance: balance('s1', 'AMB-2040', 'Karton koli 40x30', 240, 10, 4800, 0), stockItem: stockItem('s1', 'AMB-2040', 'Karton koli 40x30', 'Ambalaj') },
  { balance: balance('s2', 'HMD-0112', 'Un tip 550', 5, 10, 120, 0, 'KG'), stockItem: stockItem('s2', 'HMD-0112', 'Un tip 550', 'Hammadde', 'KG') },
  { balance: balance('s3', 'HMD-0230', 'Toz şeker', 1200, 10, 36000, 200, 'KG'), stockItem: stockItem('s3', 'HMD-0230', 'Toz şeker', 'Hammadde', 'KG') },
];
const listPage = { items: rows, page: 1, pageSize: 25, totalCount: 3, belowMinimumCount: 1 };

function respond(url: string, init?: RequestInit): unknown {
  const [path, search = ''] = url.split('?');
  const query = new URLSearchParams(search);
  if (init?.method === 'DELETE') return undefined;
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/stock/categories/') return [];
  if (path.endsWith('/locations')) return [];
  if (path.startsWith('/api/tenant-settings/')) return { allowNegativeStock: false };
  if (path === '/api/stock/items/s1/transactions')
    return {
      items: [{ id: 't1', entryDate: '2026-11-10', direction: 'Receipt', quantity: 100, description: 'Açılış girişi', reversalOfId: null, isReversal: false, hasReversal: false, unitCostBase: 20, enteredQuantity: null, enteredUnitCode: null, warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo' }],
      page: 1, pageSize: 5, totalCount: 1,
    };
  if (path === '/api/warehouses/w1/balances/page')
    return { items: [{ balance: { ...rows[0].balance, quantityOnHand: 200 }, stockItem: rows[0].stockItem }], page: 1, pageSize: 100, totalCount: 1, belowMinimumCount: 0 };
  if (path === '/api/warehouses/w2/balances/page')
    return { items: [{ balance: { ...rows[0].balance, quantityOnHand: 40 }, stockItem: rows[0].stockItem }], page: 1, pageSize: 100, totalCount: 1, belowMinimumCount: 0 };
  if (path === '/api/warehouses/balances/page')
    return query.get('belowMinimumOnly') === 'true' ? { ...listPage, items: [rows[1]], totalCount: 1 } : listPage;
  return { items: [], page: 1, pageSize: 25, totalCount: 0, belowMinimumCount: 0 };
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) =>
    new Response(JSON.stringify(respond(url, init) ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string, _token?: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  localStorage.clear();
});

function renderStock(role = 'TenantAdmin') {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>
        <InventoryStockPage token="t" role={role} />
      </KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function renderLoaded(role = 'TenantAdmin') {
  renderStock(role);
  await waitFor(() => expect(screen.getAllByText('Karton koli 40x30').length).toBeGreaterThan(0));
  await settle();
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const enabled = (id: string) => !!command(id) && command(id)!.getAttribute('aria-disabled') !== 'true';
const scroller = () => document.querySelector<HTMLElement>('.advanced-grid-scroll')!;
const bodyRows = () => Array.from(scroller().querySelectorAll<HTMLTableRowElement>('tbody tr'));
const rowOf = (name: string) => bodyRows().find((row) => row.textContent?.includes(name))!;
const tick = (name: string) => fireEvent.click(within(rowOf(name)).getByRole('checkbox'));
const summary = () => document.querySelector<HTMLElement>('.nx-summary-row')!;
const panel = () => document.querySelector<HTMLElement>('.inventory-stock-detail');
const openMenu = () => {
  fireEvent.click(command('more')!);
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
};

describe('Stok Kartları list (mockup 01 list part)', () => {
  it('shows summary cards from the loaded page and the server total of below-minimum cards', async () => {
    await renderLoaded();
    const cards = within(summary());
    expect(cards.getByText('Stok değeri').closest('.nx-summary-item')!.textContent).toContain('40.920,00 TRY');
    expect(cards.getByText('Kullanılabilir').closest('.nx-summary-item')!.textContent).toContain('1.445');
    expect(summary().textContent).toContain('bu sayfa');
    const below = cards.getByText('Minimum altı').closest('button')!;
    expect(below.getAttribute('aria-pressed')).toBe('false');
    expect(below.textContent).toContain('1');
    // No uncosted filter exists: the card is information only.
    const unvalued = cards.getByText('Maliyetsiz').closest('.nx-summary-item')!;
    expect(unvalued.tagName).not.toBe('BUTTON');
    expect(unvalued.textContent).toContain('1');
    fireEvent.click(below);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('belowMinimumOnly=true'), 't'));
    expect(cards.getByText('Minimum altı').closest('button')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders a selectable grid with status tags, plain numbers, a level bar and no row menu', async () => {
    await renderLoaded();
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stok kartı işlemleri' })).toBeNull();
    expect(screen.queryByText('İşlemler', { selector: 'th' })).toBeNull();
    // Mockup 01: the code has its own mono column, so the name cell is single-line.
    expect(Array.from(scroller().querySelectorAll('thead th')).some((th) => th.textContent?.includes('Stok kodu'))).toBe(true);
    expect(rowOf('Karton koli').querySelector('td .nx-code')!.textContent).toBe('AMB-2040');
    expect(rowOf('Karton koli').querySelector('.list-v2-name-code')).toBeNull();
    const tag = (name: string) => rowOf(name).querySelector('.nx-status-tag')!;
    expect(tag('Karton koli').className).toContain('is-ok');
    expect(tag('Karton koli').textContent).toBe('Yeterli');
    expect(tag('Un tip').className).toContain('is-bad');
    expect(tag('Un tip').textContent).toBe('Minimum altı');
    expect(tag('Toz şeker').className).toContain('is-warn');
    expect(tag('Toz şeker').textContent).toBe('Maliyetsiz');
    const numbers = Array.from(rowOf('Karton koli').querySelectorAll('td.nx-num'));
    expect(numbers.length).toBeGreaterThanOrEqual(5);
    expect(rowOf('Karton koli').querySelector('td.nx-num b')).toBeNull();
    const level = rowOf('Un tip').querySelector<HTMLElement>('.inventory-stock-level')!;
    expect(level.getAttribute('aria-hidden')).toBe('true');
    expect(level.className).toContain('is-bad');
    expect(level.querySelector<HTMLElement>('i')!.style.width).toBe('50%');
  });

  it('Aç and Sil follow the current row; Enter opens the current row', async () => {
    await renderLoaded();
    expect(enabled('open')).toBe(false);
    expect(enabled('delete')).toBe(false);
    scroller().focus();
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(enabled('delete')).toBe(true);
    expect(openMenu()).toEqual(expect.arrayContaining(['Devre dışı bırak', 'Hareketler / ekle']));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.keyDown(scroller(), { key: 'Enter' });
    // The stock card opens in place (its record form replaces the list).
    await waitFor(() => expect(screen.getByDisplayValue('HMD-0112')).toBeTruthy());
  });

  it('TenantUser gets no Sil in the bar nor in the bulk bar', async () => {
    await renderLoaded('TenantUser');
    fireEvent.click(rowOf('Karton koli'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(enabled('delete')).toBe(false);
    tick('Karton koli');
    const bulk = screen.getByRole('toolbar', { name: 'Toplu işlemler' });
    expect(within(bulk).queryByRole('button', { name: 'Sil' })).toBeNull();
    expect(within(bulk).getByRole('button', { name: 'Excel (seçilenler)' })).toBeTruthy();
  });

  it('deletes the selected cards with one confirmation and shows the selection in the footer', async () => {
    await renderLoaded();
    tick('Karton koli');
    tick('Un tip');
    const footer = document.querySelector<HTMLElement>('.nx-list-footer')!;
    await waitFor(() => expect(footer.textContent).toContain('2 seçili'));
    expect(footer.textContent).toContain('Seçili değer');
    expect(footer.textContent).toContain('4.920,00 TRY');
    expect(footer.textContent).toContain('Gösterilen 3 / 3');
    expect(footer.textContent).toContain('Ctrl+Del sil');
    const bulk = screen.getByRole('toolbar', { name: 'Toplu işlemler' });
    fireEvent.click(within(bulk).getByRole('button', { name: 'Sil' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('2 stok kartı');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await waitFor(() => {
      const deletes = apiMock.mock.calls.filter(([, , init]) => init?.method === 'DELETE').map(([url]) => url);
      expect(deletes).toEqual(['/api/stock/items/s1', '/api/stock/items/s2']);
    });
  });

  it('Ctrl+. toggles the detail panel; its tabs load warehouses and recent movements', async () => {
    await renderLoaded();
    fireEvent.click(rowOf('Karton koli'));
    expect(panel()).toBeNull();
    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    const detail = within(panel()!);
    expect(detail.getByRole('heading', { name: 'Karton koli 40x30' })).toBeTruthy();
    expect(detail.getByRole('tab', { name: 'Özet', selected: true })).toBeTruthy();
    fireEvent.click(detail.getByRole('tab', { name: 'Depolar' }));
    await waitFor(() => expect(panel()!.textContent).toContain('Yedek depo'));
    expect(apiMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/warehouses\/w1\/balances\/page\?.*q=AMB-2040/), 't');
    expect(panel()!.textContent).toContain('200');
    fireEvent.click(detail.getByRole('tab', { name: 'Hareketler' }));
    await waitFor(() => expect(panel()!.textContent).toContain('Açılış girişi'));
    expect(apiMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/stock\/items\/s1\/transactions\?/), 't');
    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    await waitFor(() => expect(panel()).toBeNull());
  });
});

describe('stockListStatus', () => {
  it('orders Pasif, Maliyetsiz (as mockup row HM-1012), Minimum altı, Yeterli', () => {
    const low = { ...balance('x', 'X', 'X', 5, 10, 0, 3) };
    const card = stockItem('x', 'X', 'X', 'C') as never as Parameters<typeof stockListStatus>[1] & object;
    expect(stockListStatus(low, { ...card, isActive: false })).toEqual({ tone: 'off', label: 'Pasif' });
    expect(stockListStatus(low, card)).toEqual({ tone: 'warn', label: 'Maliyetsiz' });
    expect(stockListStatus({ ...low, unvaluedQuantity: 0 }, card)).toEqual({ tone: 'bad', label: 'Minimum altı' });
    expect(stockListStatus({ ...low, unvaluedQuantity: 0, quantityOnHand: 20, belowMinimum: false }, undefined)).toEqual({ tone: 'ok', label: 'Yeterli' });
  });
});
