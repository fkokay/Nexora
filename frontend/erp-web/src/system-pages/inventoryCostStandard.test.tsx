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
import catalog from './inventoryCostOperations.fixture.json';

// Stok Değerleme standart tanımı (inventory-cost.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `inventoryCostOperations.fixture.json`, ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür
// (allowed: true); katalog değişirse yeniden üretilmelidir.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: unknown[]; queries: unknown[] };
const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-cost.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { title: string; definition: Definition };

const W = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const U1 = 'cccccccc-0000-0000-0000-000000000001';
const R1 = 'dddddddd-0000-0000-0000-000000000001';
const R2 = 'dddddddd-0000-0000-0000-000000000002';
const A1 = 'eeeeeeee-0000-0000-0000-000000000001';
const A2 = 'eeeeeeee-0000-0000-0000-000000000002';
const A3 = 'eeeeeeee-0000-0000-0000-000000000003';
const L1 = 'eeeeeeee-0000-0000-0000-000000000011';
const L2 = 'eeeeeeee-0000-0000-0000-000000000012';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;

const stockItem = { id: S1, code: 'KLM', name: 'Kalem', unitCode: 'ADET', isActive: true, trackingMode: 'None' };
const balancePage = {
  items: [{
    balance: { stockItemId: S1, code: 'KLM', name: 'Kalem', unitCode: 'ADET', minimumStock: 0, quantityOnHand: 12.5, belowMinimum: false,
      reservedQuantity: 0, availableQuantity: 12.5, valuationAmountBase: 1250.75, unvaluedQuantity: 2, baseCurrencyCode: 'TRY' },
    stockItem, status: 'Maliyetsiz',
  }],
  page: 1, pageSize: 25, totalCount: 1, belowMinimumCount: 0, pageValuationAmountBase: 1250.75, pageAvailableQuantity: 12.5,
  pageUnitCode: 'ADET', pageAvailableCount: 1, pageUnvaluedCount: 1, baseCurrencyCode: 'TRY',
};
const adjustment = (id: string, code: string, kind: string, extra: Record<string, unknown> = {}) => ({
  id, code, entryDate: '2026-11-10', kind, purchaseReceiptId: null, description: `${code} açıklama`, reversalOfId: null,
  createdAt: '2026-11-10T10:00:00Z', totalAmountBase: 10, lines: [], hasReversal: false, ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses/balances/page' || path === `/api/warehouses/${W}/balances/page`) return balancePage;
    if (path === '/api/warehouses') return [{ id: W, code: 'MRK', name: 'Merkez', isActive: true }];
    if (path === `/api/stock/items/${S1}/units`) return { baseUnitCode: 'ADET', conversions: [{ id: U1, unitCode: 'KOLI', factorToBase: 12 }] };
    if (path === `/api/warehouses/${W}/stock/${S1}/cost-adjustments`) {
      return [adjustment(A1, 'DGR-1', 'Revaluation', { hasReversal: true }), adjustment(A2, 'DGR-2', 'Reversal', { reversalOfId: A1 }),
        adjustment(A3, 'DGR-3', 'Revaluation')];
    }
    if (path === '/api/purchasing/receipts') {
      return { items: [
        { id: R1, code: 'MK-1', purchaseOrderId: 'p1', purchaseOrderCode: 'SA-1', warehouseId: W, warehouseName: 'Merkez', receiptDate: '2026-11-01', status: 'Posted', lineCount: 1, createdAt: '2026-11-01T00:00:00Z' },
        { id: R2, code: 'MK-2', purchaseOrderId: 'p2', purchaseOrderCode: 'SA-2', warehouseId: W, warehouseName: 'Merkez', receiptDate: '2026-10-01', status: 'Voided', lineCount: 1, createdAt: '2026-10-01T00:00:00Z' },
      ], page: 1, pageSize: 50, totalCount: 2 };
    }
    if (path === `/api/purchasing/receipts/${R1}/landed-costs`) {
      return [adjustment(L1, 'EKM-1', 'LandedCost', { purchaseReceiptId: R1 }), adjustment(L2, 'EKM-2', 'LandedCost', { purchaseReceiptId: R1, hasReversal: true })];
    }
    if (path === `/api/purchasing/receipts/${R2}/landed-costs`) return [];
  } else if (method === 'POST') {
    if (path === `/api/stock/items/${S1}/units`) return { id: 'u-new', unitCode: 'PK', factorToBase: 6 };
    if (path === `/api/warehouses/${W}/stock/${S1}/revaluations`) return adjustment('new', 'DGR-9', 'Revaluation');
    if (path.endsWith('/reverse')) return adjustment('rev', 'TRS-1', 'Reversal');
    if (path === `/api/purchasing/receipts/${R1}/landed-costs`) return adjustment('lnew', 'EKM-9', 'LandedCost', { purchaseReceiptId: R1 });
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === '/api/system-pages/inventory-cost/published') {
      return {
        id: 'sp', code: '@inventory-cost', name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: 'inventory-cost', source: 'standard', standardVersion: 1,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Stok Değerleme</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey="inventory-cost" token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const writes = () => calls.filter((call) => call.method !== 'GET');
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const warehouseSelect = () => within(screen.getByRole('region', { name: 'Süzgeçler' })).getByLabelText('Depo') as HTMLSelectElement;
const chooseWarehouse = async () => {
  await waitFor(() => expect(within(warehouseSelect()).getByRole('option', { name: 'Merkez' })).toBeTruthy(), T);
  fireEvent.change(warehouseSelect(), { target: { value: W } });
  await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`).length).toBeGreaterThan(0), T);
};
const rowOf = (scope: HTMLElement, text: string) => within(scope).getByText(text).closest('tr') as HTMLElement;
const openManager = async () => {
  await chooseWarehouse();
  const row = await waitFor(() => rowOf(document.body, 'Kalem'), T);
  await waitFor(() => expect(within(row).getByRole('button', { name: 'Yönet' }).hasAttribute('disabled')).toBe(false), T);
  fireEvent.click(within(row).getByRole('button', { name: 'Yönet' }));
  return screen.findByRole('dialog', { name: 'Stok maliyeti · KLM · Kalem' }, T);
};

beforeEach(() => {
  calls = []; api.mockReset();
  localStorage.clear();
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Stok Değerleme standard (inventory-cost)', () => {
  it('shows the legacy cost list to a tenant admin', async () => {
    setup();
    const row = await waitFor(() => rowOf(document.body, 'Kalem'), T);
    const headers = [...document.querySelectorAll('.tenant-page-data-grid th')].map((th) => th.textContent?.trim());
    for (const label of ['Stok kodu', 'Stok adı', 'Depo miktarı', 'Stok değeri', 'Maliyetsiz miktar']) expect(headers).toContain(label);
    expect(row.textContent).toContain('KLM');
    expect(row.textContent).toContain('ADET');
    expect(row.textContent).toContain('TRY');
    expect(screen.getByText('Maliyetsiz')).toBeTruthy();
    expect(screen.queryByText(/yalnızca firma yöneticileri/)).toBeNull();
    // Without a warehouse the manager cannot open (cost records are per warehouse).
    const manage = within(row).getByRole('button', { name: 'Yönet' });
    expect(manage.hasAttribute('disabled')).toBe(true);
    expect(manage.getAttribute('title')).toBe('Maliyet yönetimi için önce bir depo seçin.');
  });

  it('shows only the boundary note to a tenant user', async () => {
    setup('TenantUser');
    await screen.findByText('Stok maliyetleri ve alternatif birimler yalnızca firma yöneticileri tarafından yönetilebilir.', {}, T);
    await settle(100);
    expect(screen.queryByText('Kalem')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Süzgeçler' })).toBeNull();
    expect(screen.queryByText('Maliyetsiz')).toBeNull();
  });

  it('cost manager writes each section on its own', async () => {
    setup();
    const dialog = await openManager();
    for (const title of ['Birim dönüşümleri', 'Maliyet yeniden değerleme', 'Mal kabul ek maliyeti', 'Seçili depodaki maliyet kayıtları']) {
      expect(within(dialog).getByText(title)).toBeTruthy();
    }
    await within(dialog).findByText('KOLI', {}, T);
    // Birim ekle sends only the unit form; the empty revaluation and landed cost forms do not block it.
    type('birimKodu', 'PK');
    type('birimKatsayisi', '6');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Birim ekle' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/stock/items/${S1}/units`);
    expect(JSON.parse(writes()[0].body!)).toEqual({ unitCode: 'PK', factorToBase: 6 });

    type('degerFarki', '-25.5');
    type('degerlemeAciklamasi', 'Piyasa düşüşü');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yeniden değerle' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1].url).toBe(`/api/warehouses/${W}/stock/${S1}/revaluations`);
    expect(JSON.parse(writes()[1].body!)).toMatchObject({ amountBase: -25.5, reason: 'Piyasa düşüşü' });
    expect(JSON.parse(writes()[1].body!).entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The dialog stays open on the same stock item after a write.
    await settle(100);
    expect(screen.getByRole('dialog', { name: 'Stok maliyeti · KLM · Kalem' })).toBeTruthy();
  });

  it('landed cost goes to the first posted receipt and voided receipts cannot take one', async () => {
    setup();
    const dialog = await openManager();
    await waitFor(() => expect(gets(`/api/purchasing/receipts/${R1}/landed-costs`).length).toBeGreaterThan(0), T);
    await within(dialog).findByText('EKM-1', {}, T);
    type('ekMaliyetTutari', '100');
    type('ekMaliyetAciklamasi', 'Navlun');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ek maliyeti dağıt' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/purchasing/receipts/${R1}/landed-costs`);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ amountBase: 100, allocationMethod: 'Value', description: 'Navlun' });

    // A voided receipt is listed (the endpoint has no status filter) but cannot take a landed cost.
    await settle(100);
    fireEvent.click(input('ekMaliyetKabul'));
    fireEvent.click(await within(await screen.findByRole('listbox', {}, T)).findByText('MK-2', {}, T));
    await waitFor(() => expect(gets(`/api/purchasing/receipts/${R2}/landed-costs`).length).toBeGreaterThan(0), T);
    const distribute = within(dialog).getByRole('button', { name: 'Ek maliyeti dağıt' });
    await waitFor(() => expect(distribute.hasAttribute('disabled')).toBe(true), T);
    expect(distribute.getAttribute('title')).toBe('Ek maliyet yalnız işlenmiş bir mal kabule dağıtılabilir.');
  });

  it('offers reversal only on unreversed rows of the right kind', async () => {
    setup();
    const dialog = await openManager();
    await within(dialog).findByText('DGR-3', {}, T);
    const reverseIn = (code: string) => within(rowOf(dialog, code)).queryByRole('button', { name: 'Ters kayıt' });
    expect(reverseIn('DGR-1')).toBeNull();
    expect(reverseIn('DGR-2')).toBeNull();
    await within(dialog).findByText('EKM-1', {}, T);
    expect(reverseIn('EKM-2')).toBeNull();

    fireEvent.click(reverseIn('DGR-3')!);
    let prompt = await screen.findByRole('alertdialog');
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Hatalı değerleme' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ url: `/api/warehouses/cost-adjustments/${A3}/reverse`, method: 'POST', body: '{"reason":"Hatalı değerleme"}' });

    await settle(100);
    fireEvent.click(reverseIn('EKM-1')!);
    prompt = await screen.findByRole('alertdialog');
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Yanlış fatura' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toEqual({ url: `/api/purchasing/receipts/${R1}/landed-costs/${L1}/reverse`, method: 'POST', body: '{"reason":"Yanlış fatura"}' });
  });
});
