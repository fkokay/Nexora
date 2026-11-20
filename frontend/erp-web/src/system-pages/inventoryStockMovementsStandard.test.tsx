import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from './inventoryStockMovementsOperations.fixture.json';

// Stok Hareketleri standart tanımı (inventory-stock-movements.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `inventoryStockMovementsOperations.fixture.json`, ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık
// görüntüsüdür (allowed: true); InventoryStockMovementsStandardTests.Frontend_fixture_matches_catalog canlı katalogla karşılaştırır.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

// Vitest runs from frontend/erp-web.
const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock-movements.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; definition: Definition };

const W = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;

const card = (id: string, code: string, name: string) => ({
  id, code, name, barcode: null, unitCode: 'ADET', category: 'Kırtasiye', minimumStock: 0, isActive: true, createdAt: '2026-01-01T00:00:00Z', rowVersion: `rv-${code}`,
});
const movement = (id: string, extra: Record<string, unknown> = {}) => ({
  id, entryDate: '2026-11-02', direction: 'Receipt', quantity: 24, description: `Hareket ${id.slice(-1)}`, reversalOfId: null, isReversal: false,
  hasReversal: false, unitCostBase: 5, enteredQuantity: 2, enteredUnitCode: 'KOLI', tracking: [{ trackingCode: 'LOT-1', quantity: 24, expiryDate: null }],
  storageLocationId: null, storageLocationCode: null, storageLocationName: null, warehouseId: W, warehouseCode: 'MRK', warehouseName: 'Merkez',
  baseUnitCode: 'ADET', displayQuantity: 2, displayUnitCode: 'KOLI', trackingText: 'LOT-1 (24)', ...extra,
});

type Call = { url: string; method: string };
let calls: Call[] = [];
let movementRows: unknown[] = [];

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method !== 'GET') throw new Error(`unexpected ${method} ${url}`);
  if (path === '/api/stock/items') return { items: [card(S1, 'KLM', 'Kalem'), card(S2, 'DFT', 'Defter')], page: 1, pageSize: 50, totalCount: 2 };
  if (path === '/api/warehouses') return [{ id: W, code: 'MRK', name: 'Merkez', isActive: true }];
  if (path === `/api/stock/items/${S1}/transactions` || path === `/api/warehouses/${W}/stock/${S1}/transactions`) {
    return { items: movementRows, page: 1, pageSize: 50, totalCount: movementRows.length };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === '/api/system-pages/inventory-stock-movements/published') {
      return {
        id: 'sp', code: '@inventory-stock-movements', name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: false, update: false, delete: false }, screenKey: 'inventory-stock-movements', source: 'standard', standardVersion: 1,
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
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey="inventory-stock-movements" token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const combo = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const choose = async (id: string, option: string) => {
  fireEvent.click(combo(id));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${option}`) }, T));
};
const cell = (text: string) => screen.findByText(text, { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);

beforeEach(() => {
  calls = []; movementRows = [movement('eeeeeeee-0000-0000-0000-000000000001')]; api.mockReset();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('Stok Hareketleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('asks for a stock card first and reads no movements until one is chosen', async () => {
    setup();
    await screen.findByText('Hareketleri görmek için bir stok kartı seçin.', undefined, T);
    await waitFor(() => expect(gets('/api/stock/items').length).toBeGreaterThan(0), T);
    await waitFor(() => expect(gets('/api/warehouses').length).toBeGreaterThan(0), T);
    expect(calls.some((call) => call.url.includes('/transactions'))).toBe(false);
    expect(combo('stokSecimi').placeholder).toBe('Stok kodu veya adıyla ara');
    // "Tüm depolar" is the default warehouse choice.
    expect(combo('depoSecimi').value).toBe('Tüm depolar');
    expect(document.querySelector('.tenant-page-data-grid')).toBeNull();
  });

  it('reads the card route for all warehouses and the warehouse route for one', async () => {
    setup();
    await waitFor(() => expect(gets('/api/stock/items').length).toBeGreaterThan(0), T);
    await choose('stokSecimi', 'Kalem');
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`)).toHaveLength(1), T);
    const first = gets(`/api/stock/items/${S1}/transactions`)[0];
    expect(query(first.url).get('page')).toBe('1');
    expect(query(first.url).get('pageSize')).toBe('50');
    expect(screen.queryByText('Hareketleri görmek için bir stok kartı seçin.')).toBeNull();

    await choose('depoSecimi', 'Merkez');
    await waitFor(() => expect(gets(`/api/warehouses/${W}/stock/${S1}/transactions`)).toHaveLength(1), T);
    expect(query(gets(`/api/warehouses/${W}/stock/${S1}/transactions`)[0].url).get('page')).toBe('1');

    // "Tüm depolar" returns to the card route.
    await choose('depoSecimi', 'Tüm depolar');
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/transactions`)).toHaveLength(2), T);
  });

  it('draws the legacy columns: date, direction tag, reversal, entered quantity with unit, warehouse, lot / serial', async () => {
    movementRows = [
      movement('eeeeeeee-0000-0000-0000-000000000001'),
      movement('eeeeeeee-0000-0000-0000-000000000002', {
        direction: 'Issue', isReversal: true, reversalOfId: 'eeeeeeee-0000-0000-0000-000000000001', enteredQuantity: null, enteredUnitCode: null,
        quantity: 1.5, displayQuantity: 1.5, displayUnitCode: 'ADET', tracking: null, trackingText: null, storageLocationCode: 'A-01', storageLocationName: 'Raf 1',
      }),
    ];
    setup();
    await waitFor(() => expect(gets('/api/stock/items').length).toBeGreaterThan(0), T);
    await choose('stokSecimi', 'Kalem');
    await cell('Hareket 1');
    const grid = document.querySelector('.tenant-page-data-grid') as HTMLElement;
    const headers = within(grid).getAllByRole('columnheader').map((header) => header.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Tarih', 'Yön', 'Ters kayıt', 'Miktar', 'Depo', 'Konum', 'Lot / seri', 'Açıklama']));
    expect(headers).not.toContain('Birim maliyet');
    const rows = within(grid).getAllByRole('row').filter((row) => row.querySelector('td'));
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
    // Direction tones follow the legacy screen: Giriş ok, Çıkış info.
    expect(within(rows[0]).getByText('Giriş').className).toContain('tone-success');
    expect(within(rows[1]).getByText('Çıkış').className).toContain('tone-info');
  });

  it('shows the empty text when the stock has no movements in the selection', async () => {
    movementRows = [];
    setup();
    await waitFor(() => expect(gets('/api/stock/items').length).toBeGreaterThan(0), T);
    await choose('stokSecimi', 'Kalem');
    await screen.findByText('Seçili stok ve depoda hareket bulunmuyor.', undefined, T);
  });

  it('searches stock cards on the server', async () => {
    setup();
    await waitFor(() => expect(gets('/api/stock/items').length).toBeGreaterThan(0), T);
    fireEvent.click(combo('stokSecimi'));
    fireEvent.change(combo('stokSecimi'), { target: { value: 'kal' } });
    await waitFor(() => expect(gets('/api/stock/items').some((call) => query(call.url).get('q') === 'kal')).toBe(true), T);
  });
});
