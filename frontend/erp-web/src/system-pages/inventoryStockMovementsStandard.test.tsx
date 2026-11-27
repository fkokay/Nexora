import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { setPageParams } from '../pageNavigation';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from './inventoryStockMovementsOperations.fixture.json';

// Stok Hareketleri standart tanımı (inventory-stock-movements.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// Liste kalıbı: süzgeç alanında stok ve depo seçimi (seçenekler stok.bakiye.sayfa / depo.listele); seçilince göstergeler
// (stok.bakiye.kart), hareketler (stok.hareket.gecmisi) ve satır eylemi Ters kayıt (stok.hareket.tersKayit).
// `inventoryStockMovementsOperations.fixture.json`, ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık
// görüntüsüdür (allowed: true); InventoryStockMovementsStandardTests.Frontend_fixture_matches_catalog canlı katalogla karşılaştırır.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

// Vitest runs from frontend/erp-web.
const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock-movements.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; definition: Definition };

const KEY = 'inventory-stock-movements';
const W = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const E1 = 'eeeeeeee-0000-0000-0000-000000000001';
const BALANCES = '/api/warehouses/balances/page';
const WAREHOUSE_BALANCES = `/api/warehouses/${W}/balances/page`;

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;

const card = (id: string, code: string, name: string) => ({
  id, code, name, barcode: null, unitCode: 'ADET', category: 'Kırtasiye', minimumStock: 0, isActive: true, createdAt: '2026-01-01T00:00:00Z', rowVersion: `rv-${code}`,
});
const balanceItem = (stockItem: ReturnType<typeof card>, quantity: number) => ({
  balance: {
    stockItemId: stockItem.id, code: stockItem.code, name: stockItem.name, unitCode: stockItem.unitCode, minimumStock: 0, quantityOnHand: quantity,
    belowMinimum: false, reservedQuantity: 0, availableQuantity: quantity, valuationAmountBase: quantity * 5, unvaluedQuantity: 0, baseCurrencyCode: 'TRY',
  },
  stockItem, status: 'Yeterli',
});
const balanceItems = [balanceItem(card(S1, 'KLM', 'Kalem'), 1100), balanceItem(card(S2, 'DFT', 'Defter'), 20)];
const movement = (id: string, extra: Record<string, unknown> = {}) => ({
  id, entryDate: '2026-11-02', direction: 'Receipt', quantity: 24, description: `Hareket ${id.slice(-1)}`, reversalOfId: null, isReversal: false,
  hasReversal: false, unitCostBase: 5, enteredQuantity: 2, enteredUnitCode: 'KOLI', tracking: [{ trackingCode: 'LOT-1', quantity: 24, expiryDate: null }],
  storageLocationId: null, storageLocationCode: null, storageLocationName: null, warehouseId: W, warehouseCode: 'MRK', warehouseName: 'Merkez',
  baseUnitCode: 'ADET', displayQuantity: 2, displayUnitCode: 'KOLI', trackingText: 'LOT-1 (24)', ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let movementRows: unknown[] = [];

const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'POST' && /\/transactions\/[^/]+\/reverse$/.test(path)) return movement('eeeeeeee-0000-0000-0000-0000000000fe', { isReversal: true });
  if (method !== 'GET') throw new Error(`unexpected ${method} ${url}`);
  if (path === BALANCES || path === WAREHOUSE_BALANCES) {
    // stok.bakiye.kart: stockItemId süzgeci tek kartı döndürür; stok.bakiye.sayfa: tüm liste.
    const stockItemId = query(url).get('stockItemId');
    const items = balanceItems.filter((item) => !stockItemId || item.balance.stockItemId === stockItemId);
    return { items, page: 1, pageSize: 25, totalCount: items.length, belowMinimumCount: 0, pageValuationAmountBase: 0, pageAvailableQuantity: 0,
      pageUnitCode: 'ADET', pageAvailableCount: items.length, pageUnvaluedCount: 0, baseCurrencyCode: 'TRY' };
  }
  if (path === '/api/warehouses') return [{ id: W, code: 'MRK', name: 'Merkez', isActive: true }];
  if (path === `/api/stock/items/${S1}/transactions` || path === `/api/warehouses/${W}/stock/${S1}/transactions`) {
    return { items: movementRows, page: 1, pageSize: 50, totalCount: movementRows.length };
  }
  if (path === `/api/stock/items/${S2}/transactions`) return { items: [], page: 1, pageSize: 50, totalCount: 0 };
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(params: Record<string, string> = {}, role = 'TenantAdmin') {
  setPageParams(KEY, params);
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === '/api/system-pages/inventory-stock-movements/published') {
      return {
        id: 'sp', code: '@inventory-stock-movements', name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: false, delete: false }, screenKey: KEY, source: 'standard', standardVersion: 2,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: catalog.operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Stok Hareketleri</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const summaryCalls = (path = BALANCES) => gets(path).filter((call) => query(call.url).has('stockItemId'));
const transactionCalls = () => calls.filter((call) => call.url.includes('/transactions'));
const filters = () => screen.getByRole('region', { name: 'Süzgeçler' });
const combo = (name: string) => within(filters()).getByRole('combobox', { name }) as HTMLInputElement;
const choose = async (name: string, option: RegExp) => {
  fireEvent.click(combo(name));
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};
const grid = () => document.querySelector('.tenant-page-data-grid') as HTMLElement | null;
const metricValue = (label: string) => screen.getByText(label, { selector: '.tenant-metric-label' }).closest('article')!.textContent ?? '';
const HINT = 'Hareketleri görmek için yukarıdan bir stok seçin.';
const writes = () => calls.filter((call) => call.method !== 'GET');
const CELL = { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' };
const readRow = (text: string) => within(grid()!).getByText(text, CELL).closest('tr') as HTMLElement;

beforeEach(() => {
  calls = []; movementRows = [movement(E1)]; api.mockReset();
  localStorage.clear();
});
afterEach(() => { cleanup(); setPageParams(KEY, {}); });

describe('Stok Hareketleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture; the only write is the reversal', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect(catalog.operations.filter((operation) => operation.kind !== 'read').map((operation) => operation.name)).toEqual(['stok.hareket.tersKayit']);
  });

  it('opens with a hint and the stock / depot filters: no summary or movement read, no list', async () => {
    setup();
    expect(await screen.findByText(HINT, {}, T)).toBeTruthy();
    await waitFor(() => expect(combo('Stok')).not.toBeNull(), T);
    expect(combo('Depo')).not.toBeNull();
    expect(grid()).toBeNull();
    expect(summaryCalls()).toEqual([]);
    expect(transactionCalls()).toEqual([]);
    expect(screen.queryByText('Mevcut', { selector: '.tenant-metric-label' })).toBeNull();
  });

  it('choosing a stock shows its indicators and movements at once', async () => {
    setup();
    await screen.findByText(HINT, {}, T);
    await choose('Stok', /Kalem/);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`)).toHaveLength(1), T);
    const first = gets(`/api/stock/items/${S1}/transactions`)[0];
    expect(query(first.url).get('page')).toBe('1');
    expect(query(first.url).get('pageSize')).toBe('50');
    await waitFor(() => expect(summaryCalls().map((call) => query(call.url).get('stockItemId'))).toEqual([S1]), T);
    await waitFor(() => expect(metricValue('Mevcut')).toContain('1.100'), T);
    expect(metricValue('Mevcut')).toContain('ADET');
    expect(metricValue('Stok değeri')).toContain('5.500,00');
    await screen.findByText('Hareket 1', CELL, T);
    expect(screen.queryByText(HINT)).toBeNull();
    expect(await screen.findByRole('button', { name: /Excel/ }, T)).toBeTruthy();
  });

  it('the depot filter carries over to the summary and the movements', async () => {
    setup();
    await screen.findByText(HINT, {}, T);
    await choose('Depo', /MRK/);
    await choose('Stok', /Kalem/);
    await waitFor(() => expect(gets(`/api/warehouses/${W}/stock/${S1}/transactions`)).toHaveLength(1), T);
    await waitFor(() => expect(summaryCalls(WAREHOUSE_BALANCES)).toHaveLength(1), T);
  });

  it('opens straight on the movements with the stockItemId page parameter', async () => {
    setup({ stockItemId: S1 });
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`)).toHaveLength(1), T);
    await waitFor(() => expect(summaryCalls().map((call) => query(call.url).get('stockItemId'))).toEqual([S1]), T);
    expect(screen.queryByText(HINT)).toBeNull();
    await screen.findByText('Hareket 1', CELL, T);
  });

  it('an empty movement history shows the empty text', async () => {
    setup({ stockItemId: S2 });
    await waitFor(() => expect(gets(`/api/stock/items/${S2}/transactions`)).toHaveLength(1), T);
    await screen.findByText('Seçili stok ve depoda hareket bulunmuyor.', undefined, T);
  });

  it('draws the movement columns: date, direction tag, reversal, entered quantity with unit, warehouse, lot / serial', async () => {
    movementRows = [
      movement(E1),
      movement('eeeeeeee-0000-0000-0000-000000000002', {
        direction: 'Issue', isReversal: true, reversalOfId: E1, enteredQuantity: null, enteredUnitCode: null,
        quantity: 1.5, displayQuantity: 1.5, displayUnitCode: 'ADET', tracking: null, trackingText: null, storageLocationCode: 'A-01', storageLocationName: 'Raf 1',
      }),
    ];
    setup({ stockItemId: S1 });
    await screen.findByText('Hareket 1', CELL, T);
    const headers = within(grid()!).getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Tarih', 'Yön', 'Ters kayıt', 'Miktar', 'Depo', 'Konum', 'Lot / seri', 'Açıklama']));
    expect(headers).not.toContain('Birim maliyet');
    const rows = within(grid()!).getAllByRole('row').filter((row) => row.querySelector('td'));
    expect(rows).toHaveLength(2);
    const [receipt, reversal] = rows.map((row) => row.textContent ?? '');
    expect(receipt).toContain('02.11.2026');
    expect(receipt).toContain('Giriş');
    expect(receipt).toContain('2 KOLI');
    expect(receipt).toContain('MRK Merkez');
    expect(receipt).toContain('LOT-1 (24)');
    expect(reversal).toContain('Çıkış');
    expect(reversal).toContain('İade');
    expect(reversal).toContain('1,5 ADET');
    expect(reversal).toContain('A-01 Raf 1');
    expect(within(rows[0]).getByText('Giriş').className).toContain('tone-success');
    expect(within(rows[1]).getByText('Çıkış').className).toContain('tone-info');
  });

  it('Ters kayıt asks for a reason and posts the reversal of the picked row; reversed rows are disabled with a reason', async () => {
    movementRows = [movement(E1), movement('eeeeeeee-0000-0000-0000-000000000002', { hasReversal: true })];
    setup({ stockItemId: S1 });
    await screen.findByText('Hareket 1', CELL, T);
    const reverseButton = (text: string) => within(readRow(text)).getByRole('button', { name: 'Ters kayıt' });
    expect(reverseButton('Hareket 2').hasAttribute('disabled')).toBe(true);
    expect(reverseButton('Hareket 2').getAttribute('title')).toBe('Bu hareket zaten ters kayıtla düzeltilmiş ya da kendisi bir ters kayıt.');
    fireEvent.click(reverseButton('Hareket 1'));
    const prompt = await screen.findByRole('alertdialog');
    expect(within(prompt).getByText('Ters kayıt gerekçesi')).toBeTruthy();
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Yanlış miktar' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ url: `/api/warehouses/${W}/stock/${S1}/transactions/${E1}/reverse`, method: 'POST', body: '{"reason":"Yanlış miktar"}' });
    // Ters kayıttan sonra geçmiş yeniden okunur.
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`).length).toBeGreaterThan(1), T);
  });

  it('the command bar has no new, save or delete', async () => {
    setup({ stockItemId: S1 });
    await screen.findByText('Hareket 1', CELL, T);
    const bar = screen.getByRole('toolbar', { name: 'İşlemler' });
    const enabled = Array.from(bar.querySelectorAll<HTMLElement>('[data-command]'))
      .filter((item) => item.getAttribute('aria-disabled') !== 'true').map((item) => item.dataset.command);
    for (const write of ['new', 'save', 'delete']) expect(enabled).not.toContain(write);
  });
});
