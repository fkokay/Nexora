import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import catalog from './inventoryStockOperations.fixture.json';

// Stok Kartları standart tanımı (inventory-stock.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `inventoryStockOperations.fixture.json`, ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür
// (allowed: true); katalog değişirse yeniden üretilmelidir.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Operation = (typeof catalog.operations)[number];
type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };

// Vitest runs from frontend/erp-web.
const standardPath = resolve(process.cwd(), '../../src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json');
const standard = JSON.parse(readFileSync(standardPath, 'utf8')) as { screenKey: string; title: string; definition: Definition };

const W = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const U1 = 'cccccccc-0000-0000-0000-000000000001';
const E1 = 'eeeeeeee-0000-0000-0000-000000000001';
const E2 = 'eeeeeeee-0000-0000-0000-000000000002';
const E3 = 'eeeeeeee-0000-0000-0000-000000000003';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

const card = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, barcode: `869${code}`, unitCode: 'ADET', category: 'Kırtasiye', minimumStock: 10, isActive: true, createdAt: '2026-01-01T00:00:00Z',
  rowVersion: `rv-${code}`, trackingMode: 'None', procurementLeadTimeDays: 3, manufacturingLeadTimeDays: 0, purchaseListPrice: 5, salesListPrice: 8,
  priceCurrencyCode: 'TRY', purchaseVatPercent: 20, salesVatPercent: 20, exciseTaxPercent: 0, communicationTaxPercent: 0,
  purchaseDiscountPercent: 0, salesDiscountPercent: 0, maximumStock: 100, reorderPoint: 15, safetyStock: 5, netWeight: null, grossWeight: null,
  length: null, width: null, height: null, productImageUrl: null, purchaseAccountCode: null, salesAccountCode: null, costAccountCode: null,
  marketplaceProductId: null, parentStockItemId: null, isVariantParent: false, withholdingTaxPercent: null, stampTaxPercent: null, ...extra,
});
const balanceItem = (stockItem: ReturnType<typeof card>, quantity: number, status: string) => ({
  balance: {
    stockItemId: stockItem.id, code: stockItem.code, name: stockItem.name, unitCode: stockItem.unitCode, minimumStock: stockItem.minimumStock,
    quantityOnHand: quantity, belowMinimum: quantity < stockItem.minimumStock, reservedQuantity: 1, availableQuantity: quantity - 1,
    valuationAmountBase: quantity * 5, unvaluedQuantity: 0, baseCurrencyCode: 'TRY',
  },
  stockItem, status,
});
const movement = (id: string, extra: Record<string, unknown> = {}) => ({
  id, entryDate: '2026-11-01', direction: 'Receipt', quantity: 5, description: `Hareket ${id.slice(-1)}`, reversalOfId: null, isReversal: false,
  hasReversal: false, unitCostBase: 5, enteredQuantity: 5, enteredUnitCode: 'ADET', storageLocationId: null, storageLocationCode: null,
  storageLocationName: null, warehouseId: W, warehouseCode: 'MRK', warehouseName: 'Merkez', ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let operations: Operation[] = catalog.operations;
/** Bir sonraki eşleşen isteği hataya çeviren kurallar (yöntem + yol öneki). */
let failures: { method: string; url: string; status: number; error: string }[] = [];
/** Verilirse kart özel alan değerleri okuması bu söz çözülene kadar bekler (kaynak okuması yükleniyor durumu). */
let valuesGate: Promise<void> | null = null;

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses/balances/page' || path === `/api/warehouses/${W}/balances/page`) {
      const items = [balanceItem(card(S1, 'KLM', 'Kalem'), 5, 'Minimum altı'), balanceItem(card(S2, 'DFT', 'Defter'), 20, 'Yeterli')];
      return {
        items, page: 1, pageSize: 25, totalCount: 2, belowMinimumCount: 1, pageValuationAmountBase: 1234.5, pageAvailableQuantity: 23,
        pageUnitCode: 'ADET', pageAvailableCount: 2, pageUnvaluedCount: 0, baseCurrencyCode: 'TRY',
      };
    }
    if (path === '/api/warehouses') return [{ id: W, code: 'MRK', name: 'Merkez' }];
    if (path === `/api/warehouses/${W}/locations`) return [];
    if (path === '/api/stock/categories') return [{ id: 'k1', name: 'Kırtasiye' }];
    if (path === '/api/tenant-settings/operations') return { tenantId: 't1', allowNegativeStock: false, updatedByUserId: null, updatedAt: null, rowVersion: 'o1' };
    if (path === '/api/stock/items/custom-fields') {
      return [{ id: 'd1', code: 'RENK', label: 'Renk', dataType: 'Text', maxLength: 40, version: 1, isRequired: false, isActive: true }];
    }
    if (path === `/api/stock/items/${S1}`) return card(S1, 'KLM', 'Kalem');
    if (path === `/api/stock/items/${S2}`) return card(S2, 'DFT', 'Defter');
    if (/^\/api\/stock\/items\/[^/]+\/balances$/.test(path)) return [{ warehouseId: W, warehouseCode: 'MRK', warehouseName: 'Merkez', quantityOnHand: 5, reservedQuantity: 1, availableQuantity: 4, valuationAmountBase: 25, unvaluedQuantity: 0 }];
    if (/^\/api\/stock\/items\/[^/]+\/transactions$/.test(path)) return { items: [movement(E1)], page: 1, pageSize: 25, totalCount: 1 };
    if (/^\/api\/stock\/items\/[^/]+\/units$/.test(path)) return { baseUnitCode: 'ADET', conversions: [{ id: U1, unitCode: 'KOLI', factorToBase: 12 }] };
    if (/^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(path)) {
      return [{ definitionId: 'd1', code: 'RENK', label: 'Renk', dataType: 'Text', maxLength: 40, definitionVersion: 1, isRequired: false, value: 'Mavi' }];
    }
    if (/^\/api\/stock\/items\/[^/]+\/variants$/.test(path)) return [];
    if (path === '/api/manufacturing/boms') return [{ id: 'b1', code: 'RC-1', name: 'Kalem reçetesi', productStockItemId: S1, productName: 'Kalem', productTrackingMode: 'None', outputQuantity: 1, isActive: true, orderCount: 2, rowVersion: 'b' }];
    if (path === `/api/warehouses/${W}/stock/${S1}/transactions`) {
      return { items: [movement(E1), movement(E2), movement(E3, { hasReversal: true })], page: 1, pageSize: 50, totalCount: 3 };
    }
  } else {
    if (path === '/api/stock/items' && method === 'POST') return { ...card(S2, 'YENI', 'Yeni'), id: 'new-card' };
    if (path === `/api/stock/items/${S1}` && method === 'PUT') return card(S1, 'KLM', 'Kalem');
    if (path === `/api/stock/items/${S1}` && method === 'DELETE') return null;
    if (/^\/api\/stock\/items\/[^/]+\/(deactivate|activate)$/.test(path) && method === 'POST') return card(S1, 'KLM', 'Kalem');
    if (/^\/api\/stock\/items\/[^/]+\/units$/.test(path) && method === 'POST') return { id: 'u-new', unitCode: 'PK', factorToBase: 6 };
    if (/^\/api\/stock\/items\/[^/]+\/units\/[^/]+$/.test(path) && method === 'DELETE') return null;
    if (/^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(path) && method === 'PUT') return [];
    if (path === `/api/warehouses/${W}/stock/${S1}/transactions` && method === 'POST') return movement('eeeeeeee-0000-0000-0000-0000000000ff');
    if (/\/transactions\/[^/]+\/reverse$/.test(path) && method === 'POST') return movement('eeeeeeee-0000-0000-0000-0000000000fe', { isReversal: true });
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(role = 'TenantAdmin') {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === '/api/system-pages/inventory-stock/published') {
      return {
        id: 'sp', code: '@inventory-stock', name: standard.title, description: null, revision: 1, forms: [],
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: 'inventory-stock', source: 'standard', standardVersion: 1,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const failure = failures.find((rule) => rule.method === method && endpoint.startsWith(rule.url));
    if (failure) {
      failures = failures.filter((rule) => rule !== failure);
      throw Object.assign(new Error(failure.error), { status: failure.status, serverError: failure.error });
    }
    if (valuesGate && method === 'GET' && /^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(endpoint)) await valuesGate;
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey="inventory-stock" token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 4000 };
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const listRow = (name: string) => screen.getByText(name, { selector: '.tenant-page-table td' }).closest('tr') as HTMLElement;
const drawer = () => screen.getByRole('dialog', { name: /^Stok kartı/ });
const tab = (container: HTMLElement, name: string) => within(container).getByRole('tab', { name: new RegExp(`^${name}`) });
const ctrlS = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 's', ctrlKey: true });
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name });
};
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const selectCard = async (name = 'Kalem', id = S1) => {
  fireEvent.click(await screen.findByText(name, { selector: '.tenant-page-table td' }, T));
  await waitFor(() => expect(gets(`/api/stock/items/${id}`).length).toBeGreaterThan(0), T);
  await ready('open');
};
/** Kartı Aç ile açar ve kaynak okumalarının (kart, özel alan değerleri) yüklenmesini bekler. */
const openCard = async () => {
  fireEvent.click(command('open'));
  await screen.findByRole('dialog', { name: 'Stok kartı KLM' }, T);
  await waitFor(() => expect(input('ad').value).toBe('Kalem'), T);
  await waitFor(() => expect((within(drawer()).getByLabelText('Renk') as HTMLInputElement).value).toBe('Mavi'), T);
};
const chooseWarehouse = async () => {
  await waitFor(() => expect(input('depoSecimi')).toBeTruthy(), T);
  fireEvent.click(input('depoSecimi'));
  fireEvent.click(await screen.findByRole('option', { name: /Merkez/ }));
};

beforeEach(() => { calls = []; failures = []; valuesGate = null; operations = catalog.operations; api.mockReset(); });
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
});

describe('Stok Kartları standart tanımı', () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('list requests balances page with filters and paging', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-table td' }, T);
    const first = gets('/api/warehouses/balances/page')[0];
    expect(query(first.url).get('page')).toBe('1');
    expect(query(first.url).get('pageSize')).toBe('25');
    await chooseWarehouse();
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`)).toHaveLength(1), T);
    fireEvent.click(screen.getByLabelText('Pasif kartları da göster'));
    await waitFor(() => expect(calls.some((call) => call.url.startsWith(`/api/warehouses/${W}/balances/page`) && query(call.url).get('includeInactive') === 'true')).toBe(true), T);
  });

  it('metrics show formatted page meta and minimum filter toggles', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-table td' }, T);
    const metric = (title: string) => screen.getByText(title, { selector: '.tenant-metric-label' }).closest('article') as HTMLElement;
    await waitFor(() => expect(metric('Stok değeri').querySelector('strong')?.textContent).toBe('1.234,50'), T);
    expect(metric('Stok değeri').textContent).toContain('Bu sayfa · TRY');
    expect(metric('Kullanılabilir').querySelector('strong')?.textContent).toBe('23');
    expect(metric('Kullanılabilir').textContent).toContain('Bu sayfa · ADET');
    expect(screen.queryByText('Kullanılabilir stoklu kart', { selector: '.tenant-metric-label' })).toBeNull();
    expect(metric('Maliyetsiz').querySelector('strong')?.textContent).toBe('0');
    expect(screen.getByLabelText('Minimum altı (1)')).toBeTruthy();
    const minimum = metric('Minimum altı');
    expect(minimum.querySelector('strong')?.textContent).toBe('1');
    expect(minimum.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(minimum);
    await waitFor(() => expect((screen.getByLabelText('Minimum altı (1)') as HTMLInputElement).checked).toBe(true), T);
    await waitFor(() => expect(gets('/api/warehouses/balances/page').some((call) => query(call.url).get('belowMinimumOnly') === 'true')).toBe(true), T);
    expect(metric('Minimum altı').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(metric('Minimum altı'));
    await waitFor(() => expect((screen.getByLabelText('Minimum altı (1)') as HTMLInputElement).checked).toBe(false), T);
    expect(metric('Minimum altı').getAttribute('aria-pressed')).toBe('false');
  });

  it('yeni then save posts exactly one card', async () => {
    setup();
    await selectCard();
    expect(listRow('Kalem').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'F2' });
    await screen.findByRole('dialog', { name: /^Stok kartı/ }, T);
    await waitFor(() => expect(tab(drawer(), 'Genel').getAttribute('aria-selected')).toBe('true'), T);
    await waitFor(() => expect(document.activeElement).toBe(input('kod')), T);
    expect(input('kod').value).toBe('');
    type('kod', 'yeni-1');
    type('ad', 'Yeni kart');
    type('anaBirim', 'adet');
    ctrlS();
    await waitFor(() => expect(writes().length).toBeGreaterThan(0), T);
    await settle(100);
    expect(writes().filter((call) => call.method === 'PUT')).toEqual([]);
    const posts = writes().filter((call) => call.url === '/api/stock/items' && call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body!)).toMatchObject({ code: 'YENI-1', name: 'Yeni kart', unitCode: 'ADET', customFields: {}, variants: [] });
  });

  it('aç then save sends PUT with source rowVersion and custom field PUT', async () => {
    setup();
    await selectCard();
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı KLM' }, T);
    await waitFor(() => expect(input('ad').value).toBe('Kalem'), T);
    await within(drawer()).findByLabelText('Renk', {}, T);
    await waitFor(() => expect((within(drawer()).getByLabelText('Renk') as HTMLInputElement).value).toBe('Mavi'), T);
    type('ad', 'Kalem (mavi)');
    fireEvent.change(within(drawer()).getByLabelText('Renk'), { target: { value: 'Kırmızı' } });
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    const put = writes()[0];
    expect(put).toMatchObject({ method: 'PUT', url: `/api/stock/items/${S1}` });
    expect(JSON.parse(put.body!)).toMatchObject({ id: S1, code: 'KLM', name: 'Kalem (mavi)', barcode: '869KLM', rowVersion: 'rv-KLM', maximumStock: 100 });
    expect(writes()[1]).toEqual({ method: 'PUT', url: `/api/stock/items/${S1}/custom-fields`, body: '{"values":{"RENK":"Kırmızı"}}' });
  });

  it('save while a source read loads writes nothing', async () => {
    // Bulgu (Task 7): kart açılır açılmaz kaydedilince kart PUT gidiyor, ardından özel alan adımı "Kaynak kayıt yükleniyor"
    // ile düşüyordu (kısmi kayıt). Dizi artık kaynak okumaları yüklenirken hiç başlamaz.
    let release = () => {};
    valuesGate = new Promise((done) => { release = done; });
    setup();
    await selectCard();
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı KLM' }, T);
    await waitFor(() => expect(input('ad').value).toBe('Kalem'), T);
    await waitFor(() => expect(gets(`/api/stock/items/${S1}/custom-fields`)).toHaveLength(1), T);
    type('ad', 'Kalem (mavi)');
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Kaydet' }));
    await within(drawer()).findByText('Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin.', {}, T);
    expect(writes()).toEqual([]);
    release();
    await waitFor(() => expect((within(drawer()).getByLabelText('Renk') as HTMLInputElement).value).toBe('Mavi'), T);
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes().map((call) => `${call.method} ${call.url}`)).toEqual([`PUT /api/stock/items/${S1}`, `PUT /api/stock/items/${S1}/custom-fields`]);
  });

  it('unit staging sends POST and DELETE after card save', async () => {
    setup();
    await selectCard();
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı KLM' }, T);
    fireEvent.click(tab(drawer(), 'Birimler'));
    await within(drawer()).findByText('KOLI', {}, T);
    expect(within(drawer()).getByText('Ana birim: ADET (1)')).toBeTruthy();
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Satır ekle' }));
    const unitInputs = within(drawer()).getAllByLabelText(/^Birim \(satır/);
    fireEvent.change(unitInputs[unitInputs.length - 1], { target: { value: 'pk' } });
    const factorInputs = within(drawer()).getAllByLabelText(/^Ana birim katsayısı \(satır/);
    fireEvent.change(factorInputs[factorInputs.length - 1], { target: { value: '6' } });
    fireEvent.click(within(drawer()).getAllByRole('button', { name: 'Satırı sil' })[0]);
    ctrlS();
    await waitFor(() => expect(writes()).toHaveLength(4), T);
    expect(writes().map((call) => `${call.method} ${call.url} ${call.body ?? ''}`)).toEqual([
      `PUT /api/stock/items/${S1} ${writes()[0].body}`,
      `POST /api/stock/items/${S1}/units {"unitCode":"PK","factorToBase":6}`,
      `DELETE /api/stock/items/${S1}/units/${U1} `,
      `PUT /api/stock/items/${S1}/custom-fields ${writes()[3].body}`,
    ]);
  });

  it('tenant user gating', async () => {
    operations = catalog.operations.map((operation) => ['stok.kart.sil', 'stok.kart.birimEkle', 'stok.kart.birimSil'].includes(operation.name)
      ? { ...operation, allowed: false } : operation);
    setup('TenantUser');
    await selectCard();
    expect(command('delete').getAttribute('aria-disabled')).toBe('true');
    expect(command('delete').getAttribute('title')).toBe('Bu işlem için yetkiniz yok');
    await openCard();
    fireEvent.click(tab(drawer(), 'Birimler'));
    expect(await within(drawer()).findByText('Birim dönüşümlerini yalnız firma yöneticisi değiştirebilir.', {}, T)).toBeTruthy();
    expect(within(drawer()).queryByRole('button', { name: 'Satır ekle' })?.hasAttribute('disabled') ?? true).toBe(true);
    const save = within(drawer()).getByRole('button', { name: 'Kaydet' });
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(tab(drawer(), 'Genel'));
    type('ad', 'Kalem 2');
    fireEvent.click(save);
    await waitFor(() => expect(writes().some((call) => call.method === 'PUT' && call.url === `/api/stock/items/${S1}`)).toBe(true), T);
    expect(writes().filter((call) => call.url.includes('/units'))).toEqual([]);
  });

  it('recipes are read only with product filter', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-table td' }, T);
    await settle(400);
    expect(gets('/api/manufacturing/boms')).toEqual([]);
    await selectCard();
    await waitFor(() => expect(gets('/api/manufacturing/boms')).toHaveLength(1), T);
    expect(gets('/api/manufacturing/boms')[0].url).toBe(`/api/manufacturing/boms?productStockItemId=${S1}`);
    fireEvent.click(command('open'));
    await screen.findByRole('dialog', { name: 'Stok kartı KLM' }, T);
    fireEvent.click(tab(drawer(), 'Reçeteler'));
    expect(await within(drawer()).findByText('Kalem reçetesi', {}, T)).toBeTruthy();
    expect(within(drawer()).queryByRole('button', { name: 'Satır ekle' })).toBeNull();
  });

  it('movement dialog posts movement and reversal sends reason', async () => {
    setup();
    await selectCard();
    const disabledItem = await menuItem(/Hareketler \/ ekle/);
    expect(disabledItem.getAttribute('aria-disabled')).toBe('true');
    expect(disabledItem.getAttribute('title') ?? disabledItem.textContent).toContain('Hareket için önce bir depo seçin.');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await chooseWarehouse();
    await selectCard();
    fireEvent.click(await menuItem(/Hareketler \/ ekle/));
    const dialog = await screen.findByRole('dialog', { name: 'Stok hareketleri · KLM · Merkez' }, T);
    await within(dialog).findByText('Hareket 3', {}, T);
    type('hareketMiktari', '3');
    type('hareketAciklamasi', 'Sayım farkı');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hareketi kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/warehouses/${W}/stock/${S1}/transactions`);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ direction: 'Receipt', quantity: 3, description: 'Sayım farkı', tracking: [] });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Stok hareketleri/ })).toBeNull(), T);

    calls = [];
    await selectCard();
    fireEvent.click(await menuItem(/Hareketler \/ ekle/));
    const again = await screen.findByRole('dialog', { name: 'Stok hareketleri · KLM · Merkez' }, T);
    await within(again).findByText('Hareket 3', {}, T);
    const reverseButton = (text: string) => within(within(again).getByText(text).closest('tr') as HTMLElement).getByRole('button', { name: 'Ters kayıt' });
    expect(reverseButton('Hareket 3').hasAttribute('disabled')).toBe(true);
    expect(reverseButton('Hareket 3').getAttribute('title')).toBe('Bu hareket zaten ters kayıtla düzeltilmiş ya da kendisi bir ters kayıt.');
    fireEvent.click(reverseButton('Hareket 1'));
    const prompt = await screen.findByRole('alertdialog');
    expect(within(prompt).getByText('Ters kayıt gerekçesi')).toBeTruthy();
    fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: 'Yanlış miktar' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0]).toEqual({ url: `/api/warehouses/${W}/stock/${S1}/transactions/${E1}/reverse`, method: 'POST', body: '{"reason":"Yanlış miktar"}' });
  });

  it('deactivate confirms and shows server conflict text', async () => {
    failures = [{ method: 'POST', url: `/api/stock/items/${S1}/deactivate`, status: 409, error: 'Bakiyesi sıfır olmayan stok kartı devre dışı bırakılamaz.' }];
    setup();
    await selectCard();
    fireEvent.click(await menuItem(/Devre dışı bırak/));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.textContent).toContain('“Kalem” devre dışı bırakılsın mı?');
    fireEvent.click(within(confirm).getByRole('button', { name: /Onayla|Devre dışı bırak/ }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    // Kaynak satır (stok.kart.getir) gövdeye taşınır; sunucu yalnız rowVersion ve confirmation alanlarını okur.
    expect(writes()[0].url).toBe(`/api/stock/items/${S1}/deactivate`);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ rowVersion: 'rv-KLM', confirmation: true });
    await waitFor(() => expect(document.body.textContent).toContain('Bakiyesi sıfır olmayan stok kartı devre dışı bırakılamaz.'), T);
  });

  it('reversal keeps the movement list usable', async () => {
    setup();
    await chooseWarehouse();
    await selectCard();
    fireEvent.click(await menuItem(/Hareketler \/ ekle/));
    const dialog = await screen.findByRole('dialog', { name: 'Stok hareketleri · KLM · Merkez' }, T);
    await within(dialog).findByText('Hareket 3', {}, T);
    const reverse = async (text: string, reason: string) => {
      fireEvent.click(within(within(dialog).getByText(text).closest('tr') as HTMLElement).getByRole('button', { name: 'Ters kayıt' }));
      const prompt = await screen.findByRole('alertdialog');
      fireEvent.change(within(prompt).getByRole('textbox'), { target: { value: reason } });
      fireEvent.click(within(prompt).getByRole('button', { name: 'Ters kayıt' }));
    };
    await reverse('Hareket 1', 'Birinci');
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    await within(dialog).findByText(/^Ters kayıt oluşturuldu\./, {}, T);
    await settle(100);
    // İstemli satır işlemi yalnız refreshQueries'i yeniler; liste (bakiye) yenilenmez, seçim ve başlık korunur.
    expect(screen.getByRole('dialog', { name: 'Stok hareketleri · KLM · Merkez' })).toBe(dialog);
    await settle(100);
    expect(listRow('Kalem').getAttribute('aria-selected')).toBe('true');
    expect(within(dialog).getByText('Hareket 2')).toBeTruthy();
    await reverse('Hareket 2', 'İkinci');
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toEqual({ url: `/api/warehouses/${W}/stock/${S1}/transactions/${E2}/reverse`, method: 'POST', body: '{"reason":"İkinci"}' });
  });

  it('clearing an optional field on edit', async () => {
    setup();
    await selectCard();
    await openCard();
    expect(input('barkod').value).toBe('869KLM');
    expect(input('maksimumStok').value).toBe('100');
    type('barkod', '');
    type('maksimumStok', '');
    ctrlS();
    await waitFor(() => expect(writes().some((call) => call.method === 'PUT' && call.url === `/api/stock/items/${S1}`)).toBe(true), T);
    const body = JSON.parse(writes().find((call) => call.method === 'PUT' && call.url === `/api/stock/items/${S1}`)!.body!) as Record<string, unknown>;
    // Ölçülen davranış (2026-11-18, eşdeğerlik listesi "İsteğe bağlı alanı boşaltma"): boşaltılan metin alanı "" olarak
    // gider (sunucu barkodu null yapar, temizlenir); boşaltılan sayı alanı null'a çözülür ve kaynak kaydın değeri gövdede
    // kalır (maksimum stok sayfadan temizlenemez: fark). Bu plan bunu düzeltmez; davranış değişirse bu beklenti güncellenmeli.
    expect({ barcode: body.barcode, maximumStock: body.maximumStock }).toEqual({ barcode: '', maximumStock: 100 });
  });
});
