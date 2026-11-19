import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { commandReason } from '../action-bar/commandReason';
import { ActionBarSlotProvider } from '../action-bar/ActionBarSlot';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, openWorkspacePage, type WorkspaceOpenRequest } from '../pageNavigation';
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
        rights: { view: true, insert: true, update: true, delete: true }, screenKey: 'inventory-stock', source: 'standard', standardVersion: 1,
        definitionJson: JSON.stringify(definition),
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
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const ready = (id: string) => waitFor(() => expect(command(id).getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const settle = (ms = 30) => new Promise((done) => setTimeout(done, ms));
const listRow = (name: string) => screen.getByText(name, { selector: '.tenant-page-data-grid td' }).closest('tr') as HTMLElement;
const menuItem = async (name: RegExp) => {
  fireEvent.click(command('more'));
  return screen.findByRole('menuitem', { name });
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

/**
 * Aynı sayfanın eski biçimi: Yeni ve Aç gizli "Sayfa aç" düğmelerine (newButton / openButton) bağlı. Eski kayıtlı tanımlar
 * aynen çalışmalıdır; düz özellikli standartla aynı gezinmeleri vermelidir.
 */
function legacyDefinition(): Definition {
  const legacy = structuredClone(standard.definition);
  const bar = legacy.components.find((component) => component.type === 'actionBar')!;
  const props = { ...bar.props };
  for (const key of ['newAction', 'newPageCode', 'newTarget', 'openAction', 'openPageCode', 'openTarget', 'openTable', 'openParams']) delete props[key];
  bar.props = { ...props, newButton: 'yeniDugme', openButton: 'acDugme' };
  legacy.components.push(
    { id: 'yeniDugme', type: 'button', props: { text: 'Yeni stok kartı', actionType: 'page', pageCode: '@inventory-stock-create', target: 'newTab' } },
    { id: 'acDugme', type: 'button', props: { text: 'Stok kartını aç', actionType: 'page', pageCode: '@inventory-stock-create', target: 'newTab',
      params: ['id={{liste.seciliSatir.stockItem.id}}'], visibleWhen: 'liste.seciliSatir.stockItem.id != null' } });
  return legacy;
}
let definition: Definition = standard.definition;

beforeEach(() => {
  definition = standard.definition;
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
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
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
    // Seçili depo süzgeç çipinde adıyla görünür.
    expect(screen.getByRole('group', { name: 'Etkin süzgeçler' }).textContent).toContain('Merkez');
    fireEvent.click(screen.getByLabelText('Pasif kartları da göster'));
    await waitFor(() => expect(calls.some((call) => call.url.startsWith(`/api/warehouses/${W}/balances/page`) && query(call.url).get('includeInactive') === 'true')).toBe(true), T);
    // Arama sunucuya q ile gider (sayfanın 1'e dönmesi genel olarak CustomPageTable.test.tsx'te sınanır).
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

  it('metrics show formatted page meta and minimum filter toggles', async () => {
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    const metric = (title: string) => screen.getByText(title, { selector: '.tenant-metric-label' }).closest('article') as HTMLElement;
    await waitFor(() => expect(metric('Stok değeri').querySelector('strong')?.textContent).toBe('1.234,50'), T);
    expect(metric('Stok değeri').textContent).toContain('bu sayfa · TRY');
    expect(metric('Kullanılabilir').querySelector('strong')?.textContent).toBe('23');
    expect(metric('Kullanılabilir').textContent).toContain('bu sayfa · ADET');
    expect(screen.queryByText('Kullanılabilir stoklu kart', { selector: '.tenant-metric-label' })).toBeNull();
    expect(metric('Maliyetsiz').querySelector('strong')?.textContent).toBe('0');
    expect(screen.getByLabelText('Minimum altı 1')).toBeTruthy();
    const minimum = metric('Minimum altı');
    expect(minimum.querySelector('strong')?.textContent).toBe('1');
    expect(minimum.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(minimum);
    await waitFor(() => expect((screen.getByLabelText('Minimum altı 1') as HTMLInputElement).checked).toBe(true), T);
    await waitFor(() => expect(gets('/api/warehouses/balances/page').some((call) => query(call.url).get('belowMinimumOnly') === 'true')).toBe(true), T);
    expect(metric('Minimum altı').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(metric('Minimum altı'));
    await waitFor(() => expect((screen.getByLabelText('Minimum altı 1') as HTMLInputElement).checked).toBe(false), T);
    expect(metric('Minimum altı').getAttribute('aria-pressed')).toBe('false');
  });

  it('legacy title row: breadcrumb, title and record count above the action bar, inside the page column', async () => {
    const { container } = setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    const title = screen.getByRole('heading', { level: 1, name: 'Stok Kartları' });
    const heading = title.closest('.list-v2-heading') as HTMLElement;
    expect(heading).toBeTruthy();
    await waitFor(() => expect(heading.querySelector('.list-v2-count')?.textContent).toBe('2 kayıt'), T);
    expect(container.querySelector('.tenant-custom-page-header, .tenant-custom-page-icon')).toBeNull();
    // No description line (legacy shows none); it stays the title's tooltip.
    expect(heading.querySelector('p')).toBeNull();
    // The shared action bar moves into the slot right under the title, inside the page content column.
    const bar = screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
    const slot = bar.closest('[data-nx-action-bar-slot]') as HTMLElement;
    await waitFor(() => expect(bar.closest('[data-nx-action-bar-slot]')).toBeTruthy(), T);
    expect(slot.closest('.tenant-custom-page-content')).toBeTruthy();
    expect(heading.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(heading).getByRole('navigation', { name: 'Konum' }).textContent).toBe('Ana Sayfa › Stok Kartları');
  });

  it('legacy look: toolbar row, full-width list with legacy headings and a right-side detail panel', async () => {
    const { container } = setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    // One compact toolbar row (no card heading): the Süzgeç alanı (search, Depo, Pasif) and, right of it, Minimum altı and Detay paneli.
    const toolbar = screen.getByRole('region', { name: 'Süzgeçler' });
    expect(toolbar.classList.contains('tenant-page-filter-bar')).toBe(true);
    expect(toolbar.classList.contains('is-inline')).toBe(true);
    expect(toolbar.querySelector('h3')).toBeNull();
    expect(toolbar.contains(input('suzgec'))).toBe(true);
    expect(within(toolbar).getByLabelText('Depo').tagName).toBe('SELECT');
    expect(within(toolbar).getByLabelText('Pasif kartları da göster')).toBeTruthy();
    expect(toolbar.style.gridColumn).toBe('span 8');
    const side = input('detayPaneli').closest('.tenant-page-form-card') as HTMLElement;
    expect(side.classList.contains('is-inline')).toBe(true);
    expect(side.querySelector('h3')).toBeNull();
    expect(side.contains(input('minimumAlti'))).toBe(true);
    expect(side.style.gridColumn).toBe('span 4');
    expect(toolbar.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.tenant-page-table-search')).toBeNull();
    const list = container.querySelector('.tenant-page-data-grid') as HTMLElement;
    expect(list.style.gridColumn).toBe('span 12');
    expect(Array.from(list.querySelectorAll('th:not(.advanced-grid-select-cell)')).map((th) => th.textContent)).toEqual([
      'Stok kodu', 'Stok adı', 'Kategori', 'Depo bakiyesi', 'Rezerve', 'Kullanılabilir', 'Minimum', 'Stok değeri', 'Maliyetsiz miktar', 'Durum',
    ]);
    const cells = Array.from(listRow('Kalem').querySelectorAll('td:not(.advanced-grid-select-cell)')).map((td) => td.textContent);
    expect(cells).toEqual(['KLM', 'Kalem', 'Kırtasiye', '5 ADET', '1 ADET', '4 ADET', '10', '25,00 TRY', '0 ADET', 'Minimum altı']);
    const strip = screen.getByText('Negatif stok koruması açık').closest('.tenant-page-status-strip') as HTMLElement;
    expect(strip.classList.contains('tone-success')).toBe(true);
    expect(strip.querySelector('.tenant-page-status-strip-mark svg')).toBeTruthy();
    expect(strip.querySelector('.tenant-page-status-strip-badge')?.textContent).toBe('Etkin');
    expect(screen.queryByText('Negatif stoka izin veriliyor')).toBeNull();

    await selectCard();
    // Legacy: on a narrow list area (here unmeasured) the panel stays closed until the toggle opens it, so the list keeps
    // its full width and never scrolls sideways.
    expect(list.style.gridColumn).toBe('span 12');
    expect((input('detayPaneli') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(input('detayPaneli'));
    await waitFor(() => expect(list.style.gridColumn).toBe('span 8'), T);
    // Legacy InventoryStockDetailPanel: code, Aç and ×, the card name, status tag, then Özet / Depolar / Hareketler.
    const panel = screen.getByRole('complementary', { name: 'Kalem' });
    expect(panel.classList.contains('tenant-page-detail')).toBe(true);
    expect(panel.style.gridColumn).toBe('span 4');
    expect(panel.querySelector('.tenant-page-detail-top .nx-code')?.textContent).toBe('KLM');
    expect(within(panel).getByRole('heading', { level: 3, name: 'Kalem' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Aç' })).toBeTruthy();
    expect(panel.querySelector('.tenant-page-detail-labels')?.textContent).toBe('Minimum altı');
    expect(within(panel).getAllByRole('tab').map((item) => item.textContent)).toEqual(['Özet', 'Depolar', 'Hareketler']);
    const stats = Array.from(panel.querySelectorAll('.tenant-page-metric')).map((tile) => tile.querySelector('.tenant-metric-label')?.textContent);
    expect(stats).toEqual(['Depo bakiyesi', 'Kullanılabilir', 'Rezerve', 'Minimum']);
    const facts = Array.from(panel.querySelectorAll('.tenant-page-context-field')).map((field) => field.textContent);
    expect(facts).toEqual(['Stok değeri25,00 TRY', 'Maliyetsiz miktar0 ADET', 'KategoriKırtasiye', 'BirimADET']);
    expect(within(panel).getByRole('button', { name: 'Hareketler / ekle' })).toBeTruthy();
    expect(panel.querySelector('.tenant-page-detail-foot')?.textContent).toContain('Devre dışı bırak');
    fireEvent.click(within(panel).getByRole('tab', { name: 'Hareketler' }));
    await waitFor(() => expect(panel.querySelector('.tenant-page-compact-items li')).toBeTruthy(), T);
    const movementRow = panel.querySelector('.tenant-page-compact-items li') as HTMLElement;
    expect(movementRow.querySelector('b')?.textContent).toBe('+5');
    expect(movementRow.querySelector('b')?.className).toBe('tone-success');

    // × (like turning the toggle off) gives the list its full width back.
    fireEvent.click(within(panel).getByRole('button', { name: 'Detay panelini kapat' }));
    await waitFor(() => expect(list.style.gridColumn).toBe('span 12'), T);
    expect(screen.queryByRole('complementary', { name: 'Kalem' })).toBeNull();
  });

  it('tenant user gating', async () => {
    operations = catalog.operations.map((operation) => ['stok.kart.sil', 'stok.kart.birimEkle', 'stok.kart.birimSil'].includes(operation.name)
      ? { ...operation, allowed: false } : operation);
    setup('TenantUser');
    await selectCard();
    expect(command('delete').getAttribute('aria-disabled')).toBe('true');
    expect(commandReason(command('delete'))).toBe('Bu işlem için yetkiniz yok');
    // Kart formu ayrı ekrandadır (inventory-stock-create); birim kuralı orada sınanır.
    expect(command('open').getAttribute('aria-disabled')).not.toBe('true');
  });

  // Düz özellikli standart ve eski gizli düğmeli tanım aynı gezinmeleri verir.
  for (const [variant, make] of [['', () => standard.definition], [' (legacy newButton/openButton)', legacyDefinition]] as const) {
  it(`yeni opens the card screen in its own tab${variant}`, async () => {
    definition = make();
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

  it(`aç opens the selected card on the card screen; Enter and double click too${variant}`, async () => {
    definition = make();
    setup();
    await screen.findByText('Kalem', { selector: '.tenant-page-data-grid td' }, T);
    await waitFor(() => expect(commandReason(command('open'))).toBe('Önce bir kayıt seçin'), T);
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
  }

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

  it('movement dialog posts movement and reversal sends reason', async () => {
    setup();
    await selectCard();
    const disabledItem = await menuItem(/Hareketler \/ ekle/);
    expect(disabledItem.getAttribute('aria-disabled')).toBe('true');
    expect(disabledItem.getAttribute('title') ?? disabledItem.textContent).toContain('Hareket için önce bir depo seçin.');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await chooseWarehouse();
    // Depo süzgeci listeyi yeniden yükler; aynı kart seçili kalır.
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`)).toHaveLength(1), T);
    await settle(100);
    expect(listRow('Kalem').getAttribute('aria-current')).toBe('true');
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

    // Liste (bakiye) yenilenir; aynı kimlikli satır seçili kalır, yeni hareket için yeniden seçmek gerekmez.
    await waitFor(() => expect(gets(`/api/warehouses/${W}/balances/page`).length).toBeGreaterThan(1), T);
    await settle(100);
    expect(listRow('Kalem').getAttribute('aria-current')).toBe('true');
    calls = [];
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
    expect(listRow('Kalem').getAttribute('aria-current')).toBe('true');
    expect(within(dialog).getByText('Hareket 2')).toBeTruthy();
    await reverse('Hareket 2', 'İkinci');
    await waitFor(() => expect(writes()).toHaveLength(2), T);
    expect(writes()[1]).toEqual({ url: `/api/warehouses/${W}/stock/${S1}/transactions/${E2}/reverse`, method: 'POST', body: '{"reason":"İkinci"}' });
  });

});
