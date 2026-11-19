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
import catalog from './inventoryTrackingOperations.fixture.json';

// Lot / Seri İzleme standart tanımı (inventory-tracking.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `inventoryTrackingOperations.fixture.json`, ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür
// (allowed: true); katalog değişirse yeniden üretilmelidir.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

// Vitest runs from frontend/erp-web.
const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-tracking.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; definition: Definition };

const W = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;

/** Yerel takvimde bugünden `offset` gün sonrası (YYYY-MM-DD); çalışma zamanının `bugun` değeriyle aynı biçim. */
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const trDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const balance = (trackingCode: string, extra: Record<string, unknown> = {}) => ({
  stockItemId: S1, stockItemCode: 'ILC', stockItemName: 'İlaç', unitCode: 'KUTU', trackingMode: 'Lot', warehouseId: W, warehouseCode: 'MRK',
  warehouseName: 'Merkez', trackingCode, expiryDate: null, quantityOnHand: 12, lastMovementDate: '2026-11-01', ...extra,
});
const rows = () => [
  balance('LOT-ESKI', { expiryDate: day(-1) }),
  balance('LOT-YAKIN', { expiryDate: day(30) }),
  balance('LOT-UZAK', { expiryDate: day(31) }),
  balance('SN-1', { stockItemId: S2, stockItemCode: 'TEL', stockItemName: 'Telefon', unitCode: 'ADET', trackingMode: 'Serial', quantityOnHand: 1 }),
];

type Call = { url: string; method: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET' && path === '/api/inventory-tracking/balances') return { items: rows(), page: 1, pageSize: 50, totalCount: 4 };
  if (method === 'GET' && path === '/api/warehouses') return [{ id: W, code: 'MRK', name: 'Merkez', isActive: true, rowVersion: 'w' }];
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === '/api/system-pages/inventory-tracking/published') {
      return {
        id: 'sp', code: '@inventory-tracking', name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: 'inventory-tracking', source: 'standard', standardVersion: 1,
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
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Lot / Seri İzleme</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey="inventory-tracking" token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const listRow = (code: string) => screen.getByText(code, { selector: '.tenant-page-data-grid td' }).closest('tr') as HTMLElement;
const filters = () => screen.getByRole('region', { name: 'Süzgeçler' });
const detail = () => document.querySelector('.tenant-page-detail') as HTMLElement;
const tags = () => Array.from(detail().querySelectorAll('.tenant-page-detail-labels .tenant-page-badge')).map((tag) => tag.textContent);
const ready = () => screen.findByText('LOT-ESKI', { selector: '.tenant-page-data-grid td' }, T);
const pick = async (code: string) => {
  fireEvent.click(listRow(code).querySelector('td:not(.advanced-grid-select-cell)') as HTMLElement);
  await waitFor(() => expect(detail().querySelector('h3')?.textContent).toBe(code), T);
};

beforeEach(() => {
  calls = []; api.mockReset();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('Lot / Seri İzleme standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture and never writes', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect(catalog.operations.every((operation) => operation.kind === 'read' && operation.method === 'GET')).toBe(true);
  });

  it('list requests tracking balances with paging and the filter bar sends q, trackingMode and warehouseId', async () => {
    setup();
    await ready();
    const first = gets('/api/inventory-tracking/balances')[0];
    expect(query(first.url).get('page')).toBe('1');
    expect(query(first.url).get('pageSize')).toBe('50');
    expect(query(first.url).get('q')).toBeNull();
    expect(query(first.url).get('trackingMode')).toBeNull();
    expect(query(first.url).get('warehouseId')).toBeNull();

    // İz türü seçenekleri listenin değer etiketlerinden gelir: Lot / Seri (ham değer sunucuya gider).
    const mode = within(filters()).getByLabelText('İz türü') as HTMLSelectElement;
    expect(Array.from(mode.options).map((option) => option.textContent)).toEqual(expect.arrayContaining(['Lot', 'Seri']));
    fireEvent.change(mode, { target: { value: 'Serial' } });
    await waitFor(() => expect(gets('/api/inventory-tracking/balances').some((call) => query(call.url).get('trackingMode') === 'Serial')).toBe(true), T);

    const warehouse = within(filters()).getByLabelText('Depo') as HTMLSelectElement;
    await waitFor(() => expect(within(warehouse).getByRole('option', { name: 'Merkez' })).toBeTruthy(), T);
    fireEvent.change(warehouse, { target: { value: W } });
    await waitFor(() => expect(gets('/api/inventory-tracking/balances').some((call) =>
      query(call.url).get('warehouseId') === W && query(call.url).get('trackingMode') === 'Serial')).toBe(true), T);

    expect(input('suzgec').placeholder).toBe('Lot/seri kodu, stok veya depo ara');
    fireEvent.change(input('suzgec'), { target: { value: 'LOT' } });
    await waitFor(() => expect(gets('/api/inventory-tracking/balances').some((call) => query(call.url).get('q') === 'LOT')).toBe(true), T);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('legacy columns: lot / seri code, type label, stock, warehouse, quantity with unit and dates', async () => {
    const { container } = setup();
    await ready();
    const list = container.querySelector('.tenant-page-data-grid') as HTMLElement;
    expect(list.style.gridColumn).toBe('span 8');
    expect(Array.from(list.querySelectorAll('th:not(.advanced-grid-select-cell)')).map((th) => th.textContent)).toEqual([
      'Lot / seri', 'İz türü', 'Stok', 'Stok kodu', 'Depo kodu', 'Depo', 'Mevcut miktar', 'Son kullanma', 'Son hareket',
    ]);
    const cells = (code: string) => Array.from(listRow(code).querySelectorAll('td:not(.advanced-grid-select-cell)')).map((td) => td.textContent);
    expect(cells('LOT-ESKI')).toEqual(['LOT-ESKI', 'Lot', 'İlaç', 'ILC', 'MRK', 'Merkez', '12 KUTU', trDate(day(-1)), '01.11.2026']);
    expect(cells('SN-1')).toEqual(['SN-1', 'Seri', 'Telefon', 'TEL', 'MRK', 'Merkez', '1 ADET', '—', '01.11.2026']);
    // Sayfa başlığında kayıt sayısı.
    const heading = screen.getByRole('heading', { level: 1 }).closest('.list-v2-heading') as HTMLElement;
    await waitFor(() => expect(heading.querySelector('.list-v2-count')?.textContent).toBe('4 kayıt'), T);
    // Alt not (bakiye hesabı) şerit olarak görünür.
    expect(screen.getByText('Bakiye yalnız iz kodu bulunan stok hareketlerinden hesaplanır.')).toBeTruthy();
  });

  it('detail panel: empty state until a row is picked, then the selected lot / serial', async () => {
    setup();
    await ready();
    expect(detail().style.gridColumn).toBe('span 4');
    expect(within(detail()).getByText('Bir lot veya seri seçin; ayrıntıları burada görün.')).toBeTruthy();
    expect(detail().querySelector('h3')).toBeNull();
    await pick('SN-1');
    expect(within(detail()).queryByText('Bir lot veya seri seçin; ayrıntıları burada görün.')).toBeNull();
    expect(detail().querySelector('.tenant-page-detail-top .nx-code')?.textContent).toBe('TEL');
    expect(tags()).toEqual(['Seri']);
    const panel = detail().querySelector('.tenant-page-context') as HTMLElement;
    expect(Array.from(panel.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(['Son kullanma', 'Stok', 'Depo kodu', 'Depo', 'Son hareket']);
    expect(Array.from(panel.querySelectorAll('dd')).map((dd) => dd.textContent)).toEqual(['—', 'Telefon', 'MRK', 'Merkez', '01.11.2026']);
    expect(within(detail()).getByText('Bu ekran salt okunurdur. Stok hareketleri ilgili stok ve ambar ekranından yönetilir.')).toBeTruthy();
    const metric = within(detail()).getByText('Mevcut miktar', { selector: '.tenant-metric-label' }).closest('article') as HTMLElement;
    expect(metric.querySelector('strong')?.textContent).toBe('1');
    expect(metric.textContent).toContain('ADET');
  });

  it('detail panel marks expired and soon-to-expire lots against today (30 days)', async () => {
    setup();
    await ready();
    await pick('LOT-ESKI');
    expect(tags()).toEqual(['Lot', 'Süresi geçti']);
    expect(detail().querySelector('.tenant-page-badge.tone-danger')?.textContent).toBe('Süresi geçti');
    await pick('LOT-YAKIN');
    expect(tags()).toEqual(['Lot', 'Süresi yaklaşıyor']);
    expect(detail().querySelector('.tenant-page-badge.tone-warning')?.textContent).toBe('Süresi yaklaşıyor');
    await pick('LOT-UZAK');
    expect(tags()).toEqual(['Lot']);
    // Tarihsiz kayıt (seri) ne geçmiş ne yakın sayılır.
    await pick('SN-1');
    expect(tags()).toEqual(['Seri']);
  });

  it('TenantUser sees the same read-only page', async () => {
    setup('TenantUser');
    await ready();
    await pick('LOT-YAKIN');
    expect(tags()).toEqual(['Lot', 'Süresi yaklaşıyor']);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });
});
