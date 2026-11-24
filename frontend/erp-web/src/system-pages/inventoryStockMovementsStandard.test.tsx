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
// Tek ekran: üstte stok seçici (seçenekler stok.bakiye.sayfa); seçilince özet (stok.bakiye.kart) ve hareketler (stok.hareket.gecmisi).
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

type Call = { url: string; method: string };
let calls: Call[] = [];
let movementRows: unknown[] = [];

const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method !== 'GET') throw new Error(`unexpected ${method} ${url}`);
  if (path === BALANCES || path === WAREHOUSE_BALANCES) {
    // stok.bakiye.kart: stockItemId süzgeci tek kartı döndürür; stok.bakiye.sayfa: arama metniyle süzülen liste.
    const stockItemId = query(url).get('stockItemId');
    const q = (query(url).get('q') ?? '').toLocaleLowerCase('tr');
    const items = balanceItems.filter((item) => (stockItemId ? item.balance.stockItemId === stockItemId
      : !q || item.balance.name.toLocaleLowerCase('tr').includes(q) || item.balance.code.toLocaleLowerCase('tr').includes(q)));
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
        rights: { view: true, insert: false, update: false, delete: false }, screenKey: KEY, source: 'standard', standardVersion: 1,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations: catalog.operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method });
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
/** Liste istekleri (stok.bakiye.sayfa) ve özet istekleri (stok.bakiye.kart) aynı yolu kullanır: stockItemId ayırır. */
const listCalls = (path = BALANCES) => gets(path).filter((call) => !query(call.url).has('stockItemId'));
const summaryCalls = (path = BALANCES) => gets(path).filter((call) => query(call.url).has('stockItemId'));
const transactionCalls = () => calls.filter((call) => call.url.includes('/transactions'));
const combo = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const choose = async (id: string, option: string) => {
  fireEvent.click(combo(id));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }, T));
};
const grid = () => document.querySelector('.tenant-page-data-grid') as HTMLElement | null;
const header = () => document.querySelector('.tenant-page-record-header') as HTMLElement | null;
const HINT = 'Hareketleri görmek için yukarıdan bir stok seçin.';
/** Stok seçicisinden bir stok seçer ve özetin gelmesini bekler. */
const openMovements = async (code = 'KLM') => {
  await waitFor(() => expect(combo('stokSecimi')).not.toBeNull(), T);
  await choose('stokSecimi', code === 'KLM' ? 'Kalem' : 'Defter');
  await waitFor(() => expect(header()).not.toBeNull(), T);
};

beforeEach(() => {
  calls = []; movementRows = [movement('eeeeeeee-0000-0000-0000-000000000001')]; api.mockReset();
  localStorage.clear();
});
afterEach(() => { cleanup(); setPageParams(KEY, {}); });

describe('Stok Hareketleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('opens with the stock lookup and a hint: no steps, no stock list, no summary or movements read, no Excel', async () => {
    setup();
    expect(await screen.findByText(HINT, {}, T)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Adımlar' })).toBeNull();
    expect(grid()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hareketleri gör ›' })).toBeNull();
    expect(combo('stokSecimi').placeholder).toBe('Stok kodu veya adıyla ara');
    expect(combo('depoSecimi').value).toBe('Tüm depolar');
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(0), T);
    expect(summaryCalls()).toEqual([]);
    expect(transactionCalls()).toEqual([]);
    expect(header()).toBeNull();
    expect(screen.queryByRole('button', { name: /Excel/ })).toBeNull();
  });

  it('choosing a stock shows its summary header and movements at once', async () => {
    setup();
    await openMovements();
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`)).toHaveLength(1), T);
    const first = gets(`/api/stock/items/${S1}/transactions`)[0];
    expect(query(first.url).get('page')).toBe('1');
    expect(query(first.url).get('pageSize')).toBe('50');
    await waitFor(() => expect(summaryCalls().map((call) => query(call.url).get('stockItemId'))).toEqual([S1]), T);

    await waitFor(() => expect(header()!.textContent).toContain('KLM'), T);
    expect(header()!.textContent).toContain('Kalem · ana birim ADET');
    const fields = within(header()!).getAllByRole('definition').map((field) => field.textContent);
    expect(within(header()!).getAllByRole('term').map((term) => term.textContent)).toEqual(['Mevcut', 'Stok değeri']);
    expect(fields).toEqual(['1.100 ADET', '5.500,00 TRY']);
    expect(within(header()!).queryByRole('button', { name: '‹ Stok değiştir' })).toBeNull();

    await screen.findByText('Hareket 1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    expect(screen.queryByText(HINT)).toBeNull();
    expect(await screen.findByRole('button', { name: /Excel/ }, T)).toBeTruthy();
  });

  it('the lookup searches stocks on the server and the depot carries over to summary and movements', async () => {
    setup();
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(0), T);
    fireEvent.change(combo('stokSecimi'), { target: { value: 'kal' } });
    await waitFor(() => expect(listCalls().some((call) => query(call.url).get('q') === 'kal')).toBe(true), T);
    await choose('depoSecimi', 'Merkez');
    await waitFor(() => expect(listCalls(WAREHOUSE_BALANCES).length).toBeGreaterThan(0), T);

    await openMovements('KLM');
    await waitFor(() => expect(gets(`/api/warehouses/${W}/stock/${S1}/transactions`)).toHaveLength(1), T);
    await waitFor(() => expect(summaryCalls(WAREHOUSE_BALANCES)).toHaveLength(1), T);
    await waitFor(() => expect(document.querySelector('.list-v2-count')).not.toBeNull(), T);
  });

  it('opens straight on the movements with the stockItemId page parameter', async () => {
    setup({ stockItemId: S1 });
    await waitFor(() => expect(header()!.textContent).toContain('KLM'), T);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`)).toHaveLength(1), T);
    expect(summaryCalls().map((call) => query(call.url).get('stockItemId'))).toEqual([S1]);
    expect(screen.queryByText(HINT)).toBeNull();
    // The lookup shows the chosen stock's name.
    await waitFor(() => expect(combo('stokSecimi').value).toContain('Kalem'), T);
  });

  it('an empty movement history shows the empty text', async () => {
    setup({ stockItemId: S2 });
    await waitFor(() => expect(gets(`/api/stock/items/${S2}/transactions`)).toHaveLength(1), T);
    await screen.findByText('Seçili stok ve depoda hareket bulunmuyor.', undefined, T);
  });

  it('draws the legacy movement columns: date, direction tag, reversal, entered quantity with unit, warehouse, lot / serial', async () => {
    movementRows = [
      movement('eeeeeeee-0000-0000-0000-000000000001'),
      movement('eeeeeeee-0000-0000-0000-000000000002', {
        direction: 'Issue', isReversal: true, reversalOfId: 'eeeeeeee-0000-0000-0000-000000000001', enteredQuantity: null, enteredUnitCode: null,
        quantity: 1.5, displayQuantity: 1.5, displayUnitCode: 'ADET', tracking: null, trackingText: null, storageLocationCode: 'A-01', storageLocationName: 'Raf 1',
      }),
    ];
    setup({ stockItemId: S1 });
    await screen.findByText('Hareket 1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
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
});
