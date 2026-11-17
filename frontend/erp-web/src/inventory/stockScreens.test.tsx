import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import InventoryMovementsPage from '../InventoryMovementsPage';
import InventoryCostPage from '../InventoryCostPage';
import InventoryTransfersPage from '../InventoryTransfersPage';
import InventoryTrackingPage from '../InventoryTrackingPage';
import { ConfirmDialogHost } from '../confirmDialog';
import { expiryState } from './trackingExpiry';
import { useCostListScreen } from './useCostListScreen';
import { useTransferListScreen } from './useTransferListScreen';

const xlsx = vi.hoisted(() => ({ sheets: [] as unknown[][][] }));
vi.mock('xlsx', () => ({
  utils: {
    book_new: () => ({}),
    aoa_to_sheet: (data: unknown[][]) => {
      xlsx.sheets.push(data);
      return {};
    },
    book_append_sheet: () => {},
  },
  writeFileXLSX: () => {},
}));

const warehouses = [
  { id: 'w1', code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'AA' },
  { id: 'w2', code: 'D2', name: 'Yedek depo', isActive: true, rowVersion: 'AA' },
];

// Local YYYY-MM-DD `days` from today (the tracking expiry dates are date-only strings).
const day = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const stockItem = { id: 's1', code: 'AMB-2040', name: 'Karton koli 40x30', barcode: null, unitCode: 'ADET', category: 'Ambalaj', minimumStock: 10, isActive: true, createdAt: '2026-11-01T09:00:00Z', rowVersion: 'AA', trackingMode: 'None' };
const movement = (id: string, direction: 'Receipt' | 'Issue', quantity: number, description: string, isReversal = false) => ({
  id, entryDate: '2026-11-10', direction, quantity, description, reversalOfId: isReversal ? 'm1' : null, isReversal, hasReversal: false,
  unitCostBase: 20, enteredQuantity: null, enteredUnitCode: null, warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo', tracking: null,
});
const movements = [
  movement('m1', 'Receipt', 100, 'Açılış girişi'),
  movement('m2', 'Issue', 12, 'Sevkiyat çıkışı'),
  movement('m3', 'Receipt', 12, 'Sevkiyat iadesi', true),
];
const costBalance = (id: string, code: string, name: string, quantity: number, value: number, unvalued: number) => ({
  stockItemId: id, code, name, unitCode: 'ADET', minimumStock: 0, quantityOnHand: quantity, belowMinimum: false,
  reservedQuantity: 0, availableQuantity: quantity, valuationAmountBase: value, unvaluedQuantity: unvalued, baseCurrencyCode: 'TRY',
});
const costRows = [
  { balance: costBalance('s1', 'AMB-2040', 'Karton koli 40x30', 240, 4800, 0), stockItem },
  { balance: costBalance('s2', 'HMD-0112', 'Un tip 550', 50, 0, 50), stockItem: { ...stockItem, id: 's2', code: 'HMD-0112', name: 'Un tip 550' } },
];
const transfer = (id: string, code: string, status: 'Posted' | 'Voided') => ({
  id, code, fromWarehouseId: 'w1', fromWarehouseName: 'Ana depo', toWarehouseId: 'w2', toWarehouseName: 'Yedek depo',
  transferDate: '2026-11-12', status, lineCount: 2, createdAt: '2026-11-12T10:00:00Z',
});
const transfers = [transfer('t1', 'TRF-0001', 'Posted'), transfer('t2', 'TRF-0002', 'Voided')];
const trace = (code: string, mode: 'Lot' | 'Serial', expiryDate: string | null, quantity: number) => ({
  stockItemId: 's1', stockItemCode: 'AMB-2040', stockItemName: 'Karton koli 40x30', unitCode: 'ADET', trackingMode: mode,
  warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo', trackingCode: code, expiryDate, quantityOnHand: quantity, lastMovementDate: '2026-11-10',
});
const traces = [
  trace('LOT-OLD', 'Lot', day(-3), 40),
  trace('LOT-SOON', 'Lot', day(10), 25),
  trace('SER-001', 'Serial', null, 1),
];

function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  if (init?.method === 'POST') return {};
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/stock/items/') return { items: [stockItem], page: 1, pageSize: 50, totalCount: 1 };
  if (path === '/api/stock/items/s1/transactions') return { items: movements, page: 1, pageSize: 50, totalCount: 3 };
  if (path === '/api/warehouses/w1/balances/page') return { items: costRows, page: 1, pageSize: 25, totalCount: 2, belowMinimumCount: 0 };
  if (path.endsWith('/cost-adjustments')) return [];
  if (path.endsWith('/units')) return { baseUnitCode: 'ADET', conversions: [] };
  if (path === '/api/purchasing/receipts/') return { items: [] };
  if (path === '/api/warehouses/transfers') return { items: transfers, page: 1, pageSize: 50, totalCount: 2 };
  if (path === '/api/warehouses/transfers/t1')
    return { transfer: transfers[0], lines: [{ stockItemId: 's1', code: 'AMB-2040', name: 'Karton koli 40x30', unitCode: 'ADET', quantity: 5, enteredQuantity: null, enteredUnitCode: null, fromStorageLocationId: null, fromStorageLocationCode: null, fromStorageLocationName: null, toStorageLocationId: null, toStorageLocationCode: null, toStorageLocationName: null }] };
  if (path === '/api/inventory-tracking/balances') return { items: traces, page: 1, pageSize: 50, totalCount: 3 };
  if (path.endsWith('/custom-fields') || path === '/api/stock/categories/' || path.endsWith('/locations')) return [];
  if (path.startsWith('/api/tenant-settings/')) return { allowNegativeStock: false };
  return { items: [], page: 1, pageSize: 50, totalCount: 0, belowMinimumCount: 0 };
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

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`);
const enabled = (id: string) => !!command(id) && command(id)!.getAttribute('aria-disabled') !== 'true';
const openMenu = () => {
  fireEvent.click(command('more')!);
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  return items;
};
const headerButtonTexts = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.heading-actions button, .page-heading button, .list-v2-export-slot button'))
    .map((node) => node.textContent?.trim() ?? '');
const COMMON = /^(yeni|kaydet|sil|yazdır|excel|xlsx|csv|dışa aktar|yenile)(?!\p{L})/iu;
const scroller = () => document.querySelector<HTMLElement>('.advanced-grid-scroll')!;
const bodyRows = () => Array.from(scroller().querySelectorAll<HTMLTableRowElement>('tbody tr'));
const rowOf = (text: string) => bodyRows().find((row) => row.textContent?.includes(text))!;
const tick = (text: string) => fireEvent.click(within(rowOf(text)).getByRole('checkbox'));
const footer = () => document.querySelector<HTMLElement>('.nx-list-footer')!;
const bulkButtons = () =>
  within(screen.getByRole('toolbar', { name: 'Toplu işlemler' })).getAllByRole('button').map((button) => button.textContent?.trim());

/** The shared list language: bar without duplicate header buttons, a selectable grid and the footer line. */
async function expectListLanguage(firstRow: string, shown: string) {
  expect(headerButtonTexts().filter((text) => COMMON.test(text))).toEqual([]);
  expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
  expect(within(rowOf(firstRow)).getByRole('checkbox')).toBeTruthy();
  expect(footer().textContent).toContain(`Gösterilen ${shown}`);
  expect(footer().textContent).toContain('↑↓ gez · Boşluk işaretle');
  expect(footer().querySelector('.nx-list-pagination')).not.toBeNull();
  tick(firstRow);
  await waitFor(() => expect(footer().textContent).toContain('1 seçili'));
  // Append-only or read-only lists: no bulk delete, only the selection export.
  expect(bulkButtons().filter((text) => text !== '✕ Esc' && !/Esc/.test(text ?? ''))).toEqual(['Excel (seçilenler)']);
  expect(enabled('delete')).toBe(false);
}

describe('Stok Hareketleri list', () => {
  async function renderLoaded() {
    renderScreen(<InventoryMovementsPage token="t" locale="tr" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Stok kodu veya adıyla ara/ }));
    fireEvent.click(await screen.findByRole('option', { name: /AMB-2040/ }));
    await waitFor(() => expect(screen.getByText('Açılış girişi')).toBeTruthy());
    await settle();
  }

  it('renders the bar, a selectable grid with direction tags, plain numbers and the footer', async () => {
    await renderLoaded();
    expect(enabled('export')).toBe(true);
    expect(enabled('refresh')).toBe(true);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    const tag = (text: string) => rowOf(text).querySelector('.nx-status-tag')!;
    expect(tag('Açılış girişi').className).toContain('is-ok');
    expect(tag('Açılış girişi').textContent).toContain('Giriş');
    expect(tag('Sevkiyat çıkışı').className).toContain('is-info');
    expect(tag('Sevkiyat çıkışı').textContent).toContain('Çıkış');
    // A reversal keeps its direction and is marked as a reversal (append-only ledger: nothing is deleted).
    expect(tag('Sevkiyat iadesi').className).toContain('is-off');
    expect(tag('Sevkiyat iadesi').textContent).toContain('İade');
    const quantity = rowOf('Açılış girişi').querySelector('td.nx-num')!;
    expect(quantity.textContent).toContain('100 ADET');
    expect(quantity.querySelector('b')).toBeNull();
    expect(enabled('open')).toBe(false);
    await expectListLanguage('Açılış girişi', '3 / 3');
  });
});

describe('Stok Değerleme list', () => {
  async function renderLoaded(role = 'TenantAdmin') {
    renderScreen(<InventoryCostPage token="t" role={role} />);
    await waitFor(() => expect(screen.getAllByText('Karton koli 40x30').length).toBeGreaterThan(0));
    await settle();
  }

  it('shows the balances as a selectable grid with summary cards, plain numbers and the footer', async () => {
    await renderLoaded();
    expect(enabled('refresh')).toBe(true);
    expect(enabled('export')).toBe(true);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    expect(document.querySelector('.inventory-cost-card')).toBeNull();
    const cards = within(document.querySelector<HTMLElement>('.nx-summary-row')!);
    // Only the warning card: no decorative totals.
    expect(document.querySelectorAll('.nx-summary-row > .nx-summary-item')).toHaveLength(1);
    const unvalued = cards.getByText('Maliyetsiz').closest('.nx-summary-item')!;
    expect(unvalued.className).toContain('is-warn');
    expect(unvalued.tagName).not.toBe('BUTTON');
    expect(unvalued.textContent).toContain('1');
    expect(document.querySelector('.nx-summary-row')!.textContent).toContain('bu sayfa');
    expect(rowOf('Karton koli').querySelector('td .nx-code')!.textContent).toBe('AMB-2040');
    const numbers = Array.from(rowOf('Karton koli').querySelectorAll('td.nx-num')).map((cell) => cell.textContent);
    expect(numbers).toEqual(['240 ADET', '4.800,00 TRY', '0 ADET']);
    expect(rowOf('Karton koli').querySelector('td.nx-num b')).toBeNull();
    await expectListLanguage('Karton koli', '2 / 2');
  });

  it('Aç (Enter) opens the cost manager of the current row; the row Yönet button stays', async () => {
    await renderLoaded();
    expect(enabled('open')).toBe(false);
    expect(command('open')!.title).toBe('Önce bir kayıt seçin');
    fireEvent.click(rowOf('Un tip'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    scroller().focus();
    fireEvent.keyDown(scroller(), { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Un tip 550' });
    expect(dialog.textContent).toContain('STOK MALİYETİ · HMD-0112');
    expect(apiMock).toHaveBeenCalledWith('/api/warehouses/w1/stock/s2/cost-adjustments', 't');
    fireEvent.click(within(dialog).getAllByRole('button')[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Un tip 550' })).toBeNull());
    fireEvent.click(within(rowOf('Karton koli')).getByRole('button', { name: /Yönet/ }));
    expect(await screen.findByRole('dialog', { name: 'Karton koli 40x30' })).toBeTruthy();
  });

  it('TenantUser sees the boundary note, no grid and no Aç', async () => {
    renderScreen(<InventoryCostPage token="t" role="TenantUser" />);
    await settle();
    expect(screen.getByText(/yalnızca firma yöneticileri tarafından yönetilebilir/)).toBeTruthy();
    expect(document.querySelector('.advanced-grid-scroll')).toBeNull();
    expect(enabled('open')).toBe(false);
  });
});

describe('Depolar arası transferler list', () => {
  async function renderLoaded() {
    renderScreen(<InventoryTransfersPage token="t" role="TenantAdmin" />);
    await waitFor(() => expect(screen.getAllByText('TRF-0001').length).toBeGreaterThan(0));
    await settle();
  }

  it('renders status tags, the selectable grid and the footer', async () => {
    await renderLoaded();
    expect(headerButtonTexts()).toEqual([]);
    const tag = (text: string) => rowOf(text).querySelector('.nx-status-tag')!;
    expect(tag('TRF-0001').className).toContain('is-ok');
    expect(tag('TRF-0001').textContent).toBe('Kaydedildi');
    expect(tag('TRF-0002').className).toContain('is-off');
    expect(tag('TRF-0002').textContent).toBe('İptal edildi');
    expect(rowOf('TRF-0001').querySelector('td.nx-num')!.textContent).toBe('2');
    expect(footer().textContent).toContain('Enter aç');
    await expectListLanguage('TRF-0001', '2 / 2');
  });

  it('Aç (Enter) opens the lines of the current row; İptal is offered only for a posted transfer', async () => {
    await renderLoaded();
    expect(enabled('open')).toBe(false);
    expect(openMenu()).not.toContain('Transferi iptal et');
    fireEvent.click(rowOf('TRF-0002'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    // A voided transfer cannot be voided again; the ledger is append-only, so there is no Sil either.
    expect(openMenu()).not.toContain('Transferi iptal et');
    expect(rowOf('TRF-0002').textContent).not.toContain('Transferi iptal et');
    fireEvent.click(rowOf('TRF-0001'));
    await waitFor(() => expect(openMenu()).toContain('Transferi iptal et'));
    scroller().focus();
    fireEvent.keyDown(scroller(), { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Ana depo → Yedek depo' });
    expect(dialog.textContent).toContain('TRF-0001');
    expect(apiMock).toHaveBeenCalledWith('/api/warehouses/transfers/t1', 't');
  });

  it('İptal from the actions menu keeps the reason prompt and the confirmation', async () => {
    await renderLoaded();
    fireEvent.click(rowOf('TRF-0001'));
    await waitFor(() => expect(enabled('open')).toBe(true));
    fireEvent.click(command('more')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Transferi iptal et' }));
    const prompt = await screen.findByRole('alertdialog');
    expect(prompt.textContent).toContain('TRF-0001 transferi iptal edilecek.');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(apiMock).not.toHaveBeenCalledWith('/api/warehouses/transfers/t1/void', 't', expect.anything());
  });
});

describe('Lot / seri izleme list', () => {
  async function renderLoaded() {
    renderScreen(<InventoryTrackingPage token="t" />);
    await waitFor(() => expect(screen.getAllByText('LOT-OLD').length).toBeGreaterThan(0));
    await settle();
  }
  const panel = () => document.querySelector<HTMLElement>('.inventory-stock-detail')!;

  it('renders the bar, expiry cards and tags, the selectable grid and the footer', async () => {
    await renderLoaded();
    expect(enabled('export')).toBe(true);
    expect(headerButtonTexts()).toEqual([]);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    const cards = within(document.querySelector<HTMLElement>('.nx-summary-row')!);
    const expired = cards.getByText('Süresi geçmiş').closest('.nx-summary-item')!;
    expect(expired.className).toContain('is-bad');
    expect(expired.textContent).toContain('1');
    const soon = cards.getByText('30 gün içinde dolacak').closest('.nx-summary-item')!;
    expect(soon.className).toContain('is-warn');
    expect(soon.textContent).toContain('1');
    expect(document.querySelector('.nx-summary-row')!.textContent).toContain('bu sayfa');
    expect(rowOf('LOT-OLD').querySelector('.nx-status-tag.is-bad')!.textContent).toBe('Süresi geçti');
    expect(rowOf('LOT-SOON').querySelector('.nx-status-tag.is-warn')).not.toBeNull();
    expect(rowOf('SER-001').querySelector('.nx-status-tag:is(.is-bad, .is-warn)')).toBeNull();
    // The tracking type keeps its two colours as tags: Lot info, Seri off.
    expect(rowOf('LOT-OLD').querySelector('.nx-status-tag.is-info')!.textContent).toBe('Lot');
    expect(rowOf('SER-001').querySelector('.nx-status-tag.is-off')!.textContent).toBe('Seri');
    // The expiry tag is shown but is not part of the cell text the grid exports (and sorts by).
    expect(rowOf('LOT-OLD').textContent).toContain('Süresi geçti');
    xlsx.sheets.length = 0;
    fireEvent.click(command('export')!);
    await waitFor(() => expect(xlsx.sheets.length).toBe(1));
    const sheet = xlsx.sheets[0] as string[][];
    const exported = sheet.find((cells) => cells.includes('LOT-OLD'))!;
    expect(exported).toEqual(['LOT-OLD', 'Lot', 'Karton koli 40x30 AMB-2040', 'D1 · Ana depo', '40 ADET', new Date(`${day(-3)}T00:00:00`).toLocaleDateString('tr-TR'), '10.11.2026']);
    const quantity = rowOf('LOT-OLD').querySelector('td.nx-num')!;
    expect(quantity.textContent).toBe('40 ADET');
    expect(quantity.querySelector('b')).toBeNull();
    await expectListLanguage('LOT-OLD', '3 / 3');
  });

  it('the detail panel follows the grid current row', async () => {
    await renderLoaded();
    fireEvent.click(rowOf('LOT-SOON'));
    await waitFor(() => expect(within(panel()).getByRole('heading', { name: 'LOT-SOON' })).toBeTruthy());
    expect(panel().textContent).toContain('25 ADET');
    scroller().focus();
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    await waitFor(() => expect(within(panel()).getByRole('heading', { name: 'SER-001' })).toBeTruthy());
    expect(panel().textContent).toContain('Belirtilmemiş');
  });

  it('classifies expiry dates against the local day', () => {
    expect(expiryState(null, day(0))).toBeNull();
    expect(expiryState(day(-1), day(0))).toBe('expired');
    expect(expiryState(day(0), day(0))).toBe('soon');
    expect(expiryState(day(30), day(0))).toBe('soon');
    expect(expiryState(day(31), day(0))).toBeNull();
  });
});

describe('moved actions keep their busy condition', () => {
  const noop = () => {};
  it('Değerleme Aç (former Yönet) is disabled while another write runs', () => {
    const onManage = vi.fn();
    const { result, rerender } = renderHook((busy: boolean) =>
      useCostListScreen({
        balances: costRows.map((row) => row.balance), total: 2, page: 1, pageSize: 25, loading: false, busy,
        exportRef: { current: null }, onManage, onPageChange: noop,
      }), { initialProps: false });
    expect(result.current.commands.open.disabledReason).toBe('Önce bir kayıt seçin');
    act(() => result.current.grid.onCurrentRowChange('s2'));
    expect(result.current.commands.open.disabledReason).toBeUndefined();
    rerender(true);
    expect(result.current.commands.open.disabledReason).toBe('İşlem sürüyor…');
    rerender(false);
    void result.current.commands.open.run?.();
    expect(onManage).toHaveBeenCalledWith(expect.objectContaining({ stockItemId: 's2' }));
  });

  it('Transferi iptal et is disabled while busy and absent for a voided transfer', () => {
    const onVoid = vi.fn();
    const { result, rerender } = renderHook((busy: boolean) =>
      useTransferListScreen({
        transfers, total: 2, page: 1, busy, loading: false, exportRef: { current: null }, onOpen: noop, onVoid, onPageChange: noop,
      }), { initialProps: false });
    expect(result.current.moreItems).toEqual([]);
    act(() => result.current.grid.onCurrentRowChange('t2'));
    expect(result.current.moreItems).toEqual([]);
    act(() => result.current.grid.onCurrentRowChange('t1'));
    expect(result.current.moreItems.map((item) => [item.label, item.disabledReason])).toEqual([['Transferi iptal et', undefined]]);
    rerender(true);
    expect(result.current.moreItems[0].disabledReason).toBe('İşlem sürüyor…');
    rerender(false);
    void result.current.moreItems[0].run?.();
    expect(onVoid).toHaveBeenCalledWith(transfers[0]);
  });
});
