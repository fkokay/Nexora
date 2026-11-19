import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import InventoryStockPage from '../InventoryStockPage';
import InventoryMovementsPage from '../InventoryMovementsPage';
import InventoryCostPage from '../InventoryCostPage';
import InventoryWarehousesPage from '../InventoryWarehousesPage';
import InventoryTransfersPage from '../InventoryTransfersPage';
import WarehouseLocationsPage from '../WarehouseLocationsPage';
import InventoryTrackingPage from '../InventoryTrackingPage';
import { ConfirmDialogHost } from '../confirmDialog';
import { commandReason } from '../action-bar/commandReason';

const warehouses = [
  { id: 'w1', code: 'D1', name: 'Ana depo', isActive: true },
  { id: 'w2', code: 'D2', name: 'Yedek depo', isActive: true },
];
const emptyPage = { items: [], page: 1, pageSize: 50, totalCount: 0, belowMinimumCount: 0 };

// Answers every GET of the Stok screens with empty but well-formed data.
function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  if (init?.method === 'POST' && path === '/api/stock/items/')
    return { id: 's-new', code: 'STK-1', name: 'Vida', unitCode: 'EA', isActive: true, rowVersion: 'AA' };
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/stock/categories/') return [];
  if (path.endsWith('/locations')) return [];
  if (path.startsWith('/api/tenant-settings/')) return { allowNegativeStock: false };
  return emptyPage;
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) =>
    new Response(JSON.stringify(respond(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  // jsdom has no ResizeObserver; the grids only need it to exist.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  apiMock.mockImplementation(async (url: string, _token?: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const primary = (id: string) => command(id).getAttribute('data-primary') === 'true';
function openMenu() {
  fireEvent.click(command('more'));
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
}
// Header buttons the UI audit would report as duplicates of the bar.
const headerButtonTexts = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.heading-actions button, .page-heading button, .list-v2-export-slot button'))
    .map((node) => node.textContent?.trim() ?? '');
const COMMON = /^(yeni|kaydet|sil|yazdır|excel|xlsx|csv|dışa aktar|yenile)(?!\p{L})/iu;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Stok Kartları on the action bar', () => {
  it('offers new (primary) and export in the bar and drops the old header buttons', async () => {
    const onNavigate = vi.fn();
    renderScreen(<InventoryStockPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle();
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(true);
    expect(enabled('export')).toBe(true);
    expect(screen.queryByRole('button', { name: /Yeni stok kartı/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'XLSX' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
    expect(headerButtonTexts().filter((text) => COMMON.test(text))).toEqual([]);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(onNavigate).toHaveBeenCalledWith('inventory-stock-create');
    expect(openMenu()).toEqual(['Kategorileri yönet', 'CSV içe aktar', 'Özel alanlar', 'CSV olarak dışa aktar']);
  });

  it('keeps admin-only header actions admin-only in the actions menu', async () => {
    renderScreen(<InventoryStockPage token="t" role="TenantUser" />);
    await settle();
    expect(openMenu()).toEqual(['Özel alanlar', 'CSV olarak dışa aktar']);
  });

  it('Ctrl+S on the open create form saves the stock card', async () => {
    renderScreen(<InventoryStockPage token="t" role="TenantUser" section="inventory-stock-create" />);
    // The bar picks up the form's commands in an effect after the form renders.
    await waitFor(() => expect(enabled('save')).toBe(true));
    expect(primary('save')).toBe(true);
    // F2 stays Yeni while the form is open; only Kaydet is primary.
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(false);
    // The form header keeps only Vazgeç; its other actions are in the bar and its menu.
    expect(Array.from(document.querySelectorAll('.rf-toolbar button')).map((b) => b.textContent?.trim())).toEqual(['Vazgeç']);
    expect(openMenu()).toEqual(['Kaydet ve YeniCtrl+F2', 'Temizle']);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.change(screen.getByPlaceholderText('STK-1001'), { target: { value: 'STK-1' } });
    fireEvent.change(screen.getByPlaceholderText('Stok adı'), { target: { value: 'Vida' } });
    const code = screen.getByPlaceholderText('STK-1001');
    code.focus();
    fireEvent.keyDown(code, { key: 's', ctrlKey: true });
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/api/stock/items/', 't', expect.objectContaining({ method: 'POST' })),
    );
  });
});

describe('F2 with forms and dialogs', () => {
  it('does not run Yeni behind another dialog of the page', async () => {
    const onNavigate = vi.fn();
    renderScreen(<InventoryStockPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle();
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Özel alanlar' }));
    });
    await waitFor(() => expect(command('new')).toBeNull());
    fireEvent.keyDown(window, { key: 'F2' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('F2 over a create form with unsaved input asks before starting a new card', async () => {
    renderScreen(
      <>
        <InventoryStockPage token="t" role="TenantUser" section="inventory-stock-create" />
        <ConfirmDialogHost />
      </>,
    );
    await waitFor(() => expect(enabled('save')).toBe(true));
    fireEvent.change(screen.getByPlaceholderText('STK-1001'), { target: { value: 'STK-9' } });
    fireEvent.keyDown(screen.getByPlaceholderText('STK-1001'), { key: 'F2' });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((screen.getByPlaceholderText('STK-1001') as HTMLInputElement).value).toBe('STK-9');
    // Plain F2 never submits the form.
    expect(apiMock).not.toHaveBeenCalledWith('/api/stock/items/', 't', expect.objectContaining({ method: 'POST' }));
  });
});

describe('other Stok screens on the action bar', () => {
  it('Stok Hareketleri: export in the bar, CSV in the menu, no header export buttons', async () => {
    renderScreen(<InventoryMovementsPage token="t" locale="tr" />);
    await settle();
    expect(enabled('export')).toBe(true);
    expect(enabled('refresh')).toBe(true);
    expect(headerButtonTexts().filter((text) => COMMON.test(text))).toEqual([]);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
  });

  it('Stok Değerleme: renders the bar without duplicate header buttons', async () => {
    renderScreen(<InventoryCostPage token="t" role="TenantAdmin" />);
    await settle();
    expect(enabled('refresh')).toBe(true);
    expect(headerButtonTexts().filter((text) => COMMON.test(text))).toEqual([]);
  });

  it('Depo Yönetimi: new opens the warehouse form beside the list and Kaydet becomes primary', async () => {
    renderScreen(<InventoryWarehousesPage token="t" role="TenantAdmin" />);
    await settle();
    expect(primary('new')).toBe(true);
    expect(screen.queryByRole('button', { name: /Depo ekle/ })).toBeNull();
    expect(headerButtonTexts()).toEqual([]);
    // "Depoları yönet" is gone: its edit, custom values and status change are the form and the selected row's menu.
    expect(openMenu()).toEqual(['Depo alan tanımları', 'CSV olarak dışa aktar']);
    fireEvent.mouseDown(document.body);
    const opens = () => apiMock.mock.calls.filter(([url]) => url === '/api/warehouses/custom-fields').length;
    await act(async () => {
      fireEvent.click(command('new'));
    });
    await waitFor(() => expect(primary('save')).toBe(true));
    // Not a dialog any more: the form is on the screen, beside the list.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.nx-def-pane')!.querySelector('h1')!.textContent).toBe('Yeni depo');
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(false);
    expect(opens()).toBe(1);
    // An unchanged new form is started over without a question.
    fireEvent.keyDown(document.body, { key: 'F2' });
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opens()).toBe(2);
  });

  it('Depolar arası transferler: new needs two active warehouses', async () => {
    renderScreen(<InventoryTransfersPage token="t" role="TenantAdmin" />);
    await settle();
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(true);
    expect(screen.queryByRole('button', { name: /Yeni transfer/ })).toBeNull();
    expect(headerButtonTexts()).toEqual([]);
  });

  it('Depo konumları: Yeni opens the create form, whose Kaydet says why it cannot save yet', async () => {
    renderScreen(<WarehouseLocationsPage token="t" role="TenantAdmin" />);
    await settle();
    expect(enabled('new')).toBe(true);
    expect(primary('new')).toBe(true);
    // Aç (Enter) opens the current row into the form beside the list; nothing is selected yet.
    expect(enabled('open')).toBe(false);
    expect((commandReason(command('open')) ?? '')).toBe('Önce bir kayıt seçin');
    expect(enabled('delete')).toBe(false);
    expect((commandReason(command('delete')) ?? '')).toBe('Önce bir kayıt seçin');
    expect(headerButtonTexts()).toEqual([]);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document.body, { key: 'F2' });
    await settle();
    expect(primary('save')).toBe(true);
    // The empty create form cannot be saved yet; the bar says why.
    expect(enabled('save')).toBe(false);
    expect((commandReason(command('save')) ?? '')).toBe('Konum kodu ve adı zorunludur.');
  });

  it('Lot / seri izleme: export and CSV through the bar only', async () => {
    renderScreen(<InventoryTrackingPage token="t" />);
    await settle();
    expect(enabled('export')).toBe(true);
    expect(headerButtonTexts()).toEqual([]);
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
  });
});
