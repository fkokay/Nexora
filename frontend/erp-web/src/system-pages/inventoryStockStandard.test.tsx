import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, openWorkspacePage, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './inventoryStockOperations.fixture.json';

// Stok Kartları standart tanımı (inventory-stock.json, sürüm 2, Liste kalıbı) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
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
const NEW = '11111111-0000-0000-0000-0000000000aa';
const E1 = 'eeeeeeee-0000-0000-0000-000000000001';
const E2 = 'eeeeeeee-0000-0000-0000-000000000002';
const E3 = 'eeeeeeee-0000-0000-0000-000000000003';

const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role, tenant_id: 't1' })).replace(/=+$/, '')}.y`;

const card = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, barcode: `869${code}`, unitCode: 'ADET', category: 'Kırtasiye', minimumStock: 10, isActive: true, createdAt: '2026-01-01T00:00:00Z',
  rowVersion: `rv-${code}`, trackingMode: 'None', procurementLeadTimeDays: 3, manufacturingLeadTimeDays: 0, purchaseListPrice: 5, salesListPrice: 8,
  priceCurrencyCode: 'TRY', purchaseVatPercent: 20, salesVatPercent: 20, exciseTaxPercent: 0, communicationTaxPercent: 0,
  purchaseDiscountPercent: 0, salesDiscountPercent: 0, maximumStock: 100, reorderPoint: 15, safetyStock: 5, netWeight: null, grossWeight: null,
  length: null, width: null, height: null, productImageUrl: null, purchaseAccountCode: null, salesAccountCode: null, costAccountCode: null,
  marketplaceProductId: null, parentStockItemId: null, isVariantParent: false, withholdingTaxPercent: 0, stampTaxPercent: 0, ...extra,
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
let failures: { method: string; url: string; status: number; error: string; exact?: boolean }[] = [];
/** Verilirse kart özel alan değerleri okuması bu söz çözülene kadar bekler (kaynak okuması yükleniyor durumu). */
let valuesGate: Promise<void> | null = null;
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses/balances/page' || path === `/api/warehouses/${W}/balances/page`) {
      const items = [balanceItem(card(S1, 'KLM', 'Kalem'), 5, 'Minimum altı'), balanceItem(card(S2, 'DFT', 'Defter', { trackingMode: 'Lot' }), 20, 'Yeterli')];
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
    if (path === '/api/stock/items' && method === 'POST') return { ...card(S2, 'YENI', 'Yeni'), id: NEW };
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
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: 'inventory-stock', source: 'standard', standardVersion: 2,
        definitionJson: JSON.stringify(standard.definition),
      };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return { operations };
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    const failure = failures.find((rule) => rule.method === method && (rule.exact ? endpoint.split('?')[0] === rule.url : endpoint.startsWith(rule.url)));
    if (failure) {
      failures = failures.filter((rule) => rule !== failure);
      throw Object.assign(new Error(failure.error), { status: failure.status, serverError: failure.error });
    }
    if (valuesGate && method === 'GET' && /^\/api\/stock\/items\/[^/]+\/custom-fields$/.test(endpoint)) await valuesGate;
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBarSlotProvider breadcrumb={<nav aria-label="Konum">Ana Sayfa › Stok Kartları</nav>}>
        <ActionBar locale="tr" />
        <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey="inventory-stock" token={jwt(role)} onOpenLegacy={() => {}} /></KeepAliveViews>
      </ActionBarSlotProvider>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const listRow = (name: string) => screen.getByText(name, { selector: '.tenant-page-data-grid td' }).closest('tr') as HTMLElement;
const detail = () => document.querySelector('.tenant-page-detail') as HTMLElement;
/** Kabuğun "⋯" menüsündeki (Diğer) öğe. */
const menuItem = async (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: 'Diğer işlemler' }));
  return screen.findByRole('menuitem', { name });
};
/** Pasif komutun nedeni: üzerine gelince görünen ipucu metni. */
const commandReason = async (button: HTMLElement) => {
  fireEvent.mouseEnter(button);
  return (await screen.findByRole('tooltip', {}, T)).textContent ?? '';
};
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const selectCard = async (name = 'Kalem', id = S1) => {
  fireEvent.click(await screen.findByText(name, { selector: '.tenant-page-data-grid td' }, T));
  await waitFor(() => expect(gets(`/api/stock/items/${id}`).length).toBeGreaterThan(0), T);
  await ready('open');
};
/** Süzgeç alanının (suzgec) Depo seçimi: depolar sorgusunun seçenekleri gelince Merkez seçilir. */
const warehouseSelect = () => within(screen.getByRole('region', { name: 'Süzgeçler' })).getByLabelText('Depo') as HTMLSelectElement;
const chooseWarehouse = async () => {
  await waitFor(() => expect(within(warehouseSelect()).getByRole('option', { name: 'Merkez' })).toBeTruthy(), T);
  fireEvent.change(warehouseSelect(), { target: { value: W } });
};

beforeEach(() => {
  calls = []; failures = []; valuesGate = null; operations = catalog.operations; navigations = []; api.mockReset();
  // Süzgeç alanı değerlerini sayfa başına tarayıcıda saklar; testler birbirine taşımasın.
  localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
});

describe('Stok Kartları standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture; history and reversal moved to the movements screen', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect(standard.definition.queries.some((item) => item.operation === 'stok.hareket.tersKayit' || item.operation === 'stok.hareket.listele')).toBe(false);
  });

  it('list requests balances page with filters and paging', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    const first = gets('/api/warehouses/balances/page')[0];
    expect(query(first.url).get('page')).toBe('1');
    expect(query(first.url).get('pageSize')).toBe('25');
    expect(query(first.url).get('q')).toBeNull();
    await chooseWarehouse();
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`)).toHaveLength(1), T);
    fireEvent.click(screen.getByLabelText('Pasif kartları da göster'));
    await waitFor(() => expect(calls.some((call) => call.url.startsWith(`/api/warehouses/${W}/balances/page`) && query(call.url).get('includeInactive') === 'true')).toBe(true), T);
    // Minimum altı, süzgeç alanının aç/kapa süzgecidir ve sunucuya belowMinimumOnly olarak gider.
    fireEvent.click(screen.getByLabelText('Minimum altı'));
    await waitFor(() => expect(calls.some((call) => call.url.startsWith(`/api/warehouses/${W}/balances/page`) && query(call.url).get('belowMinimumOnly') === 'true')).toBe(true), T);
    fireEvent.change(input('suzgec'), { target: { value: 'kal' } });
    await waitFor(() => expect(calls.some((call) => call.url.startsWith(`/api/warehouses/${W}/balances/page`) && query(call.url).get('q') === 'kal')).toBe(true), T);
    const searched = calls.filter((call) => call.url.startsWith(`/api/warehouses/${W}/balances/page`) && query(call.url).get('q') === 'kal');
    expect(searched.every((call) => query(call.url).get('page') === '1' && query(call.url).get('includeInactive') === 'true')).toBe(true);
    // "Tümü" depo süzgecini kaldırır: tüm depoların bakiyesi okunur.
    const before = gets('/api/warehouses/balances/page').length;
    fireEvent.change(warehouseSelect(), { target: { value: '' } });
    await waitFor(() => expect(gets('/api/warehouses/balances/page').length).toBeGreaterThan(before), T);
  });

  it('saklanan süzgeç yalnız aynı firmada geri gelir (seçili depo başka firmaya taşınmaz)', async () => {
    const stored = JSON.stringify({ search: '', values: { warehouseId: W } });
    localStorage.setItem('nexora.filterBar.t2.@inventory-stock.suzgec', stored);
    localStorage.setItem('nexora.filterBar.@inventory-stock.suzgec', stored);
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    expect(gets(`/api/warehouses/${W}/balances/page`)).toEqual([]);
    expect(warehouseSelect().value).toBe('');
    cleanup();
    calls = [];
    localStorage.setItem('nexora.filterBar.t1.@inventory-stock.suzgec', stored);
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    // Açılışta tek istek, doğrudan seçili depoyla.
    expect(gets('/api/warehouses/balances/page')).toEqual([]);
    expect(gets(`/api/warehouses/${W}/balances/page`).length).toBeGreaterThan(0);
  });

  it('Filtre komutu (Ctrl+F) süzgeç alanının arama kutusuna odaklanır', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    await ready('filter');
    fireEvent.click(command('filter'));
    await waitFor(() => expect(document.activeElement).toBe(input('suzgec')), T);
    expect(input('suzgec').placeholder).toBe('Kod veya stok adıyla ara');
  });

  it('four indicators show the formatted page meta; the card-count indicator is gone', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    const metric = (title: string) => screen.getByText(title, { selector: '.tenant-metric-label' }).closest('article') as HTMLElement;
    await waitFor(() => expect(metric('Stok değeri').querySelector('strong')?.textContent).toBe('1.234,50'), T);
    expect(metric('Stok değeri').textContent).toContain('bu sayfa · TRY');
    expect(metric('Kullanılabilir').querySelector('strong')?.textContent).toBe('23');
    expect(metric('Kullanılabilir').textContent).toContain('bu sayfa · ADET');
    expect(metric('Minimum altı').querySelector('strong')?.textContent).toBe('1');
    expect(metric('Maliyetsiz').querySelector('strong')?.textContent).toBe('0');
    expect(screen.queryByText('Kullanılabilir stoklu kart', { selector: '.tenant-metric-label' })).toBeNull();
    expect(document.querySelectorAll('.tenant-page-metric').length).toBe(4);
  });

  it('title row shows the record count; negative stock is one conditional note', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    const heading = screen.getByRole('heading', { level: 1, name: 'Stok Kartları' }).closest('.list-v2-heading') as HTMLElement;
    await waitFor(() => expect(heading.querySelector('.list-v2-count')?.textContent).toBe('2 kayıt'), T);
    expect(screen.getByText('Negatif stok kural\u0131')).toBeTruthy();
    expect(screen.queryByText('Negatif stok korumas\u0131 a\u00e7\u0131k')).toBeNull();
    expect(screen.queryByText('Negatif stoka izin veriliyor')).toBeNull();
  });

  it('Liste layout: one filter bar, list with legacy headings, card group on the right without toggle or tabs', async () => {
    const { container } = setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    const toolbar = screen.getByRole('region', { name: 'Süzgeçler' });
    expect(within(toolbar).getByLabelText('Depo').tagName).toBe('SELECT');
    expect(within(toolbar).getByLabelText('Pasif kartları da göster')).toBeTruthy();
    expect(within(toolbar).getByLabelText('Minimum altı')).toBeTruthy();
    const list = container.querySelector('.tenant-page-data-grid') as HTMLElement;
    expect(list.closest('.list-template-list')).not.toBeNull();
    expect(within(list).queryByRole('button', { name: 'Detay paneli' })).toBeNull();
    expect(Array.from(list.querySelectorAll('th:not(.advanced-grid-select-cell)')).map((th) => th.textContent)).toEqual([
      'Stok kodu', 'Stok adı', 'Kategori', 'Depo bakiyesi', 'Rezerve', 'Kullanılabilir', 'Minimum', 'Stok değeri', 'Maliyetsiz miktar', 'Durum',
    ]);
    const cells = Array.from(listRow('Kalem').querySelectorAll('td:not(.advanced-grid-select-cell)')).map((td) => td.textContent);
    expect(cells).toEqual(['KLM', 'Kalem', 'Kırtasiye', '5 ADET', '1 ADET', '4 ADET', '10', '25,00 TRY', '0 ADET', 'Minimum altı']);

    // Kart grubu hep sağda: seçim yokken boş durum, seçilince kart.
    expect(detail().closest('.list-template-detail')).not.toBeNull();
    expect(within(detail()).getByText('Bir stok kartı seçin; ayrıntıları burada görün.')).toBeTruthy();
    await selectCard();
    expect(within(detail()).queryByText('Bir stok kartı seçin; ayrıntıları burada görün.')).toBeNull();
    expect(detail().querySelector('.tenant-page-detail-top .nx-code')?.textContent).toBe('KLM');
    expect(within(detail()).getByRole('heading', { level: 3, name: 'Kalem' })).toBeTruthy();
    expect(within(detail()).queryAllByRole('tab')).toEqual([]);
    const stats = Array.from(detail().querySelectorAll('.tenant-page-metric')).map((tile) => tile.querySelector('.tenant-metric-label')?.textContent);
    expect(stats).toEqual(['Depo bakiyesi', 'Kullanılabilir']);
    const facts = Array.from(detail().querySelectorAll('.tenant-page-context-field')).map((field) => field.textContent);
    expect(facts).toEqual(['Rezerve1 ADET', 'Minimum10', 'Stok değeri25,00 TRY', 'Maliyetsiz miktar0 ADET', 'KategoriKırtasiye', 'BirimADET']);
    // Depo dağılımı ve son hareketler tabloları karttan kalktı; hareketler ayrı ekranda.
    expect(gets(`/api/stock/items/${S1}/balances`)).toEqual([]);
    expect(calls.some((call) => call.url.includes('/transactions'))).toBe(false);
    expect(within(detail()).getByRole('button', { name: 'Hareket gir' })).toBeTruthy();
    expect(within(detail()).getByRole('button', { name: 'Hareketler ›' })).toBeTruthy();
    expect(within(detail()).getByRole('button', { name: 'Devre dışı bırak' })).toBeTruthy();
  });

  it('Hareketler › opens the movements screen with the card as page parameter', async () => {
    setup();
    await selectCard();
    fireEvent.click(within(detail()).getByRole('button', { name: 'Hareketler ›' }));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'inventory-stock-movements', params: { stockItemId: S1 }, replace: false });
  });

  it('Sil names the selected stock card in the confirmation', async () => {
    setup();
    await selectCard();
    await ready('delete');
    fireEvent.click(command('delete'));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(within(dialog).getByRole('heading').textContent).toMatch(/^\S+ · Kalem stok kartı silinsin mi\?$/);
  });

  it('tenant user gating', async () => {
    operations = catalog.operations.map((operation) => ['stok.kart.sil', 'stok.kart.birimEkle', 'stok.kart.birimSil'].includes(operation.name)
      ? { ...operation, allowed: false } : operation);
    setup('TenantUser');
    await selectCard();
    expect(command('delete').getAttribute('aria-disabled')).toBe('true');
    expect(await commandReason(command('delete'))).toContain('Bu işlem için yetkiniz yok');
    // Kart formu ayrı ekrandadır (inventory-stock-create); birim kuralı orada sınanır.
    expect(command('open').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('yeni opens the card screen in its own tab', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    await ready('new');
    fireEvent.keyDown(document.body, { key: 'F2' });
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toEqual({ page: 'inventory-stock-create', params: {}, replace: false, from: 'inventory-stock' });
    // Liste kart formu taşımaz: pencere açılmaz, form kaynakları okunmaz.
    expect(screen.queryByRole('dialog', { name: /^Stok kartı/ })).toBeNull();
    expect(document.getElementById('page-input-kod')).toBeNull();
    for (const path of ['/api/stock/categories', '/api/stock/items/custom-fields', '/api/manufacturing/boms']) expect(gets(path)).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('aç opens the selected card on the card screen; Enter and double click too', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    expect(await commandReason(command('open'))).toContain('Önce bir kayıt seçin');
    expect(command('open').getAttribute('aria-disabled')).toBe('true');
    await selectCard();
    fireEvent.click(command('open'));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toEqual({ page: 'inventory-stock-create', params: { id: S1 }, replace: false, from: 'inventory-stock' });
    // Seçili satırda Enter aynı Aç komutudur.
    listRow('Kalem').focus();
    fireEvent.keyDown(listRow('Kalem'), { key: 'Enter' });
    await waitFor(() => expect(navigations).toHaveLength(2), T);
    expect(navigations[1].params).toEqual({ id: S1 });
    // Başka bir satıra çift tıklama o satırı seçer ve onu açar.
    fireEvent.doubleClick(listRow('Defter'));
    await waitFor(() => expect(navigations).toHaveLength(3), T);
    expect(navigations[2]).toEqual({ page: 'inventory-stock-create', params: { id: S2 }, replace: false, from: 'inventory-stock' });
    expect(listRow('Defter').getAttribute('aria-current')).toBe('true');
    expect(writes()).toEqual([]);
  });

  it('a save on the card screen refreshes the open list', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    await settle(100);
    const before = gets('/api/warehouses/balances/page').length;
    // Kart ekranının afterSaveButton gezinmesi (listeye dön + yenile).
    act(() => { openWorkspacePage({ page: 'inventory-stock', params: {}, replace: true, from: 'inventory-stock-create', refresh: true }); });
    await waitFor(() => expect(gets('/api/warehouses/balances/page').length).toBeGreaterThan(before), T);
    // Yenilemesiz gezinme listeyi yeniden okumaz.
    await settle(400);
    const after = gets('/api/warehouses/balances/page').length;
    act(() => { openWorkspacePage({ page: 'inventory-stock', params: {}, replace: true, from: 'inventory-stock-create' }); });
    await settle(400);
    expect(gets('/api/warehouses/balances/page').length).toBe(after);
  });

  it('Hareket gir needs a depot, then posts one movement from the window; history and reversal are not in it', async () => {
    setup();
    await selectCard();
    const disabledItem = await menuItem(/Hareket gir/);
    expect(disabledItem.hasAttribute('disabled')).toBe(true);
    expect(disabledItem.getAttribute('title') ?? disabledItem.textContent).toContain('Hareket için önce bir depo seçin.');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await chooseWarehouse();
    // Depo süzgeci listeyi yeniden yükler; aynı kart seçili kalır.
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`)).toHaveLength(1), T);
    await settle(100);
    expect(listRow('Kalem').getAttribute('aria-current')).toBe('true');
    fireEvent.click(await menuItem(/Hareket gir/));
    const dialog = await screen.findByRole('dialog', { name: 'Stok hareketi · KLM · Merkez' }, T);
    // Pencere yalnız giriş yapar: geçmiş tablosu, ters kayıt ve lot / seri ızgarası yok.
    expect(within(dialog).queryByText('Hareket 3')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Ters kayıt' })).toBeNull();
    expect(within(dialog).queryByText('Lot / seri takipli kart')).toBeNull();
    type('hareketMiktari', '3');
    type('hareketAciklamasi', 'Sayım farkı');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(writes()[0].url).toBe(`/api/warehouses/${W}/stock/${S1}/transactions`);
    const body = JSON.parse(writes()[0].body!) as Record<string, unknown>;
    expect(body).toMatchObject({ direction: 'Receipt', quantity: 3, description: 'Sayım farkı' });
    expect(body.tracking ?? []).toEqual([]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Stok hareketi/ })).toBeNull(), T);
    // Liste (bakiye) yenilenir; aynı kimlikli satır seçili kalır.
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`).length).toBeGreaterThan(1), T);
    await settle(100);
    expect(listRow('Kalem').getAttribute('aria-current')).toBe('true');
    expect(calls.some((call) => call.url.includes('/reverse'))).toBe(false);
  });

  it('a lot-tracked card captures allocation rows in the movement window', async () => {
    setup();
    await chooseWarehouse();
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`)).toHaveLength(1), T);
    await selectCard('Defter', S2);
    fireEvent.click(await menuItem(/Hareket gir/));
    const dialog = await screen.findByRole('dialog', { name: 'Stok hareketi · DFT · Merkez' }, T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sat?r ekle' }));
    fireEvent.change(document.getElementById('page-grid-hareketTakipIzgarasi-yeni-1-trackingCode')!, { target: { value: 'LOT-01' } });
    fireEvent.change(document.getElementById('page-grid-hareketTakipIzgarasi-yeni-1-quantity')!, { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(writes()).toHaveLength(1), T);
    expect(JSON.parse(writes()[0].body!)).toMatchObject({ direction: 'Receipt', tracking: [{ trackingCode: 'LOT-01', quantity: 2 }] });
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
});
