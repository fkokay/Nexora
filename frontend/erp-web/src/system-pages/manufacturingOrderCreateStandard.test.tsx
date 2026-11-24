import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './manufacturingOrderCreateOperations.fixture.json';

// "Yeni üretim emri" standart tanımı (manufacturing-order-create.json): aktif reçeteden stoka ya da satış siparişi satırına
// üretim emri planlanır; reçete içeriği birim başına önizlenir. API sahte yanıtlar döner.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'manufacturing-order-create';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const W1 = '55555555-0000-0000-0000-000000000001';
const B1 = '44444444-0000-0000-0000-000000000001';
const S1 = '66666666-0000-0000-0000-000000000001';
const S2 = '66666666-0000-0000-0000-000000000002';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const recipe = {
  id: B1, code: 'RC-014', name: 'Salça reçetesi', productStockItemId: 'st1', productName: 'Domates salçası 830 g', productTrackingMode: 'None',
  outputQuantity: 1, isActive: true, orderCount: 0, rowVersion: 'rv', lineCount: 1, operationCount: 2, operations: [],
  lines: [{ componentStockItemId: 'c1', componentCode: 'HMD-01', componentName: 'Domates', quantity: 2.5, scrapPercent: 5, standardUnitCostBase: 4 }],
};
const salesOrder = (id: string, code: string, status: string) => ({
  id, code, quoteId: null, quoteCode: null, customerId: 'cu1', customerName: 'Akdeniz Gıda', orderDate: '2026-11-20', currencyCode: 'TRY', status,
  grandTotal: 1000, lineCount: 1, createdAt: '2026-11-20', requestedDeliveryDate: null, salespersonEmployeeId: null,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/warehouses') return [{ id: W1, code: 'D03', name: 'Üretim Deposu', isActive: true, rowVersion: 'w' }];
    if (path === '/api/manufacturing/boms') return [recipe];
    if (path === `/api/manufacturing/boms/${B1}`) return recipe;
    if (path === '/api/sales/orders') return { items: [salesOrder(S1, 'SS-0001', 'Open'), salesOrder(S2, 'SS-0002', 'Closed')], page: 1, pageSize: 25, totalCount: 2 };
    if (path === `/api/sales/orders/${S1}`) return { ...salesOrder(S1, 'SS-0001', 'Open'), lines: [
      { lineNumber: 1, stockItemId: 'st1', stockCode: 'MAM-01', stockName: 'Domates salçası 830 g', unitCode: 'AD', quantity: 10, remainingQuantity: 6 },
      { lineNumber: 2, stockItemId: 'st2', stockCode: 'MAM-02', stockName: 'Biber salçası', unitCode: 'AD', quantity: 5, remainingQuantity: 0 },
    ] };
  } else if (method === 'POST' && path === '/api/manufacturing/orders') {
    return { id: 'new-order', code: 'URE-1' };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup() {
  api.mockImplementation(async (endpoint: string, _token: string, init?: RequestInit) => {
    if (endpoint === `/api/system-pages/${KEY}/published`) {
      return { id: 'sp', code: `@${KEY}`, name: standard.title, description: null, revision: 1, forms: [], rights: { view: true, insert: true, update: true, delete: true },
        screenKey: KEY, source: 'standard', standardVersion: 1, definitionJson: JSON.stringify(standard.definition) };
    }
    if (endpoint === '/api/custom-pages/erp-operations') return catalog;
    const method = init?.method ?? 'GET';
    calls.push({ url: endpoint, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(endpoint, method);
  });
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}><TenantCustomPage systemScreenKey={KEY} token={jwt('TenantAdmin')} onOpenLegacy={() => {}} /></KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const T = { timeout: 10000 };
const command = (id: string) => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' }).querySelector<HTMLElement>(`[data-command="${id}"]`);
const ready = (id: string) => waitFor(() => expect(command(id)?.getAttribute('aria-disabled')).not.toBe('true'), T);
const gets = (path: string) => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === path);
const posts = () => calls.filter((call) => call.method === 'POST' && call.url === '/api/manufacturing/orders');
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });
const query = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');
const pick = async (id: string, option: RegExp) => {
  fireEvent.click(input(id));
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};
const openNew = async () => {
  setup();
  await waitFor(() => expect(input('emirKodu')).toBeTruthy(), T);
  await ready('save');
};
const fillStock = async () => {
  type('emirKodu', 'ure-2026-001');
  type('miktar', '120');
  await pick('depo', /Üretim Deposu/);
  await pick('recete', /Salça reçetesi/);
};

beforeEach(() => {
  calls = []; navigations = []; api.mockReset(); localStorage.clear();
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
});

describe('Yeni üretim emri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('opens with today, quantity 1, stock production and only active recipes; no sales order fields', async () => {
    await openNew();
    expect(document.body.textContent).toContain('Üretim emri planlama');
    expect(input('planTarihi').value).toBe(today());
    expect(input('miktar').value).toBe('1');
    expect((input('uretimTuru') as unknown as HTMLSelectElement).value).toBe('Stock');
    await waitFor(() => expect(gets('/api/manufacturing/boms').length).toBeGreaterThan(0), T);
    expect(query(gets('/api/manufacturing/boms')[0].url).get('isActive')).toBe('true');
    expect(input('siparis')).toBeNull();
    expect(document.body.textContent).toContain('Reçete seçilmeden özet boş kalır.');
  });

  it('the selected recipe shows its content per output unit and the summary', async () => {
    await openNew();
    await pick('recete', /Salça reçetesi/);
    await screen.findByText('Domates', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    await waitFor(() => expect(document.body.textContent).toContain('Mamul: Domates salçası 830 g'), T);
    expect(document.body.textContent).toContain('1 bileşen · 2 operasyon · çıktı 1');
  });

  it('stock production: posts the order without a sales order and returns to the list', async () => {
    await openNew();
    await fillStock();
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body).toMatchObject({ code: 'URE-2026-001', plannedDate: today(), warehouseId: W1, billOfMaterialId: B1, plannedQuantity: 120 });
    expect(body.sourceSalesOrderId ?? null).toBeNull();
    expect(body.sourceSalesOrderLineNumber ?? null).toBeNull();
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'manufacturing-orders', params: {}, refresh: true });
  });

  it('sales order production: open orders and lines with a remaining quantity; the line number is posted', async () => {
    await openNew();
    await fillStock();
    fireEvent.change(input('uretimTuru'), { target: { value: 'SalesOrder' } });
    await waitFor(() => expect(input('siparis')).toBeTruthy(), T);
    fireEvent.click(input('siparis'));
    await screen.findByRole('option', { name: /SS-0001/ }, T);
    expect(screen.queryByRole('option', { name: /SS-0002/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /SS-0001/ }));
    await waitFor(() => expect(gets(`/api/sales/orders/${S1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(input('siparisSatiri'));
    await screen.findByRole('option', { name: /Domates salçası 830 g/ }, T);
    expect(screen.queryByRole('option', { name: /Biber salçası/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /Domates salçası 830 g/ }));
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body).toMatchObject({ code: 'URE-2026-001', billOfMaterialId: B1, sourceSalesOrderId: S1 });
    // Seçicinin değeri metindir; motor int parametresini metin olarak geçirir, API (JSON Web varsayılanları) sayıya çevirir.
    expect(Number(body.sourceSalesOrderLineNumber)).toBe(1);
  });

  it('sales order production requires the order and the line', async () => {
    await openNew();
    await fillStock();
    fireEvent.change(input('uretimTuru'), { target: { value: 'SalesOrder' } });
    await waitFor(() => expect(input('siparis')).toBeTruthy(), T);
    fireEvent.click(command('save')!);
    await new Promise((done) => setTimeout(done, 100));
    expect(posts()).toEqual([]);
  });

  it('Vazgeç returns to the order list', async () => {
    await openNew();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'manufacturing-orders' });
  });
});
