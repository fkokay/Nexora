import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import TenantCustomPage from '../TenantCustomPage';
import { OPEN_PAGE_EVENT, setPageParams, type WorkspaceOpenRequest } from '../pageNavigation';
import catalog from './foreignTradeCaseOperations.fixture.json';

// "Dış ticaret dosyası" standart tanımı (foreign-trade-case.json): yeni ve düzenleme tek tanım. `{{sayfa.parametre.id}}` boşsa yeni
// dosya (disTicaret.dosya.olustur; yön `direction` parametresinden, yoksa İhracat), doluysa o dosya düzenlenir (getir + guncelle).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

type Definition = { schemaVersion: number; components: { id: string; type: string; props?: Record<string, unknown> }[]; queries: { id: string; operation: string }[] };
const KEY = 'foreign-trade-case';
const standard = JSON.parse(readFileSync(resolve(process.cwd(), `../../src/Hosts/AIERP.Api/SystemPages/Standards/${KEY}.json`), 'utf8')) as { title: string; definition: Definition };

const F1 = '44444444-0000-0000-0000-000000000001';
const NEW = '44444444-0000-0000-0000-0000000000aa';
const PO = '66666666-0000-0000-0000-000000000001';
const SO = '77777777-0000-0000-0000-000000000001';
const jwt = (role: string) => `x.${btoa(JSON.stringify({ sub: 'u1', role })).replace(/=+$/, '')}.y`;

let status = 'Draft';
let importOrders: unknown[] = [];
let exportOrders: unknown[] = [];
const order = (orderId: string, code: string, counterpartyName: string) =>
  ({ id: orderId, code, counterpartyName, orderDate: '2026-11-10', currencyCode: 'EUR', grandTotal: 125000, status: 'Approved' });
const card = (extra: Record<string, unknown> = {}) => ({
  id: F1, direction: 'Import', status, purchaseOrderId: PO, salesOrderId: null, referenceCode: 'IMP-2026-001', originCountryCode: 'DE',
  destinationCountryCode: 'TR', incotermsCode: 'FOB', harmonizedSystemCode: '844332', transportMode: 'Sea', carrierReference: 'MSKU-1',
  customsReference: null, declaredValue: 125000, currencyCode: 'EUR', plannedShipDate: '2026-12-01', actualShipDate: null,
  plannedArrivalDate: '2026-12-15', actualArrivalDate: null, notes: 'Liman: Mersin', updatedAt: '2026-11-20T00:00:00Z', inventoryPostingRequired: true,
  purchaseReceiptId: null, salesDeliveryId: null, inventoryDocumentLinkedAt: null, orderCode: 'PO-001', counterpartyName: 'Berlin Makine GmbH',
  route: 'DE → TR', shipDate: '2026-12-01', arrivalDate: '2026-12-15', ...extra,
});

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let navigations: WorkspaceOpenRequest[] = [];
const onNavigate = (event: Event) => { navigations.push((event as CustomEvent<WorkspaceOpenRequest>).detail); };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/foreign-trade/orders') return new URLSearchParams(url.split('?')[1] ?? '').get('direction') === 'Import' ? importOrders : exportOrders;
    if (path === `/api/foreign-trade/cases/${F1}`) return card();
  } else {
    if (path === '/api/foreign-trade/cases' && method === 'POST') return { ...card(), id: NEW };
    if (path === `/api/foreign-trade/cases/${F1}` && method === 'PUT') return card();
  }
  throw new Error(`unexpected ${method} ${url}`);
}

function setup(params: Record<string, string> = {}) {
  setPageParams(KEY, params);
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
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (name: string) => bar().querySelector<HTMLElement>(`[data-command="${name}"]`);
const ready = (name: string) => waitFor(() => expect(command(name)?.getAttribute('aria-disabled')).not.toBe('true'), T);
const writes = () => calls.filter((call) => call.method !== 'GET');
const posts = () => writes().filter((call) => call.method === 'POST' && call.url === '/api/foreign-trade/cases');
const puts = () => writes().filter((call) => call.method === 'PUT');
const orderReads = () => calls.filter((call) => call.method === 'GET' && call.url.split('?')[0] === '/api/foreign-trade/orders');
const input = (name: string) => document.getElementById(`page-input-${name}`) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(input(name), { target: { value } });
const text = () => document.body.textContent ?? '';
const pickOrder = async (label: RegExp, option: RegExp) => {
  fireEvent.click(await screen.findByRole('combobox', { name: label }, T));
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};
const openNew = async (params: Record<string, string> = {}) => {
  setup(params);
  await waitFor(() => expect(input('referans')).toBeTruthy(), T);
  await ready('save');
};
const openCard = async () => {
  setup({ id: F1 });
  await waitFor(() => expect(input('referans').value).toBe('IMP-2026-001'), T);
};
const fillRoute = () => {
  type('cikisUlkesi', 'de');
  type('varisUlkesi', 'tr');
};

beforeEach(() => {
  calls = []; navigations = []; status = 'Draft'; api.mockReset(); localStorage.clear();
  importOrders = [order(PO, 'PO-001', 'Berlin Makine GmbH')];
  exportOrders = [order(SO, 'SO-001', 'Hamburg Handel')];
  window.addEventListener(OPEN_PAGE_EVENT, onNavigate);
});
afterEach(() => {
  for (let open = screen.queryByRole('alertdialog'); open; open = screen.queryByRole('alertdialog')) fireEvent.click(within(open).getAllByRole('button')[0]);
  cleanup();
  window.removeEventListener(OPEN_PAGE_EVENT, onNavigate);
  setPageParams(KEY, {});
});

describe('Dış ticaret dosyası standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => {
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('order options use one fixed-direction operation each', async () => {
    await openNew();
    await waitFor(() => expect(orderReads().length).toBeGreaterThanOrEqual(2), T);
    const directions = orderReads().map((call) => new URLSearchParams(call.url.split('?')[1] ?? '').get('direction'));
    expect(directions).toContain('Import');
    expect(directions).toContain('Export');
  });

  it('new without a direction parameter is an export with the sales order lookup; no card read', async () => {
    await openNew();
    expect(input('yon').value).toBe('Export');
    await waitFor(() => expect(text()).toContain('İhracat dosyası oluştur'), T);
    expect(text()).toContain('Sipariş, firma veritabanında doğrulanır ve referans değişiklikleri denetlenir.');
    expect(calls.filter((call) => call.url.startsWith(`/api/foreign-trade/cases/`))).toEqual([]);
    expect(screen.queryByRole('combobox', { name: /Bağlı satın alma siparişi/ })).toBeNull();
    expect(await screen.findByRole('combobox', { name: /Bağlı satış siparişi/ }, T)).toBeTruthy();
    expect(input('tasima').value).toBe('Road');
  });

  it('new import: direction param, purchase order lookup, empty declared value and dotted HS code; back to the list', async () => {
    await openNew({ direction: 'Import' });
    expect(input('yon').value).toBe('Import');
    await waitFor(() => expect(text()).toContain('İthalat dosyası oluştur'), T);
    await pickOrder(/Bağlı satın alma siparişi/, /^PO-001 · Berlin Makine GmbH/);
    type('referans', 'imp-2026-001');
    fillRoute();
    fireEvent.change(input('incoterms'), { target: { value: 'FOB' } });
    type('hsKodu', '8443.32');
    type('tasima', 'Sea');
    type('planlananSevk', '2026-12-01');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body).toMatchObject({ direction: 'Import', purchaseOrderId: PO, referenceCode: 'IMP-2026-001', originCountryCode: 'DE', destinationCountryCode: 'TR',
      incotermsCode: 'FOB', harmonizedSystemCode: '8443.32', transportMode: 'Sea', plannedShipDate: '2026-12-01' });
    expect(body.salesOrderId ?? null).toBeNull();
    expect(body.declaredValue ?? null).toBeNull();
    expect(puts()).toEqual([]);
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'foreign-trade', replace: true, refresh: true });
  });

  it('new export sends the sales order and clears the order when the direction changes', async () => {
    await openNew({ direction: 'Export' });
    await pickOrder(/Bağlı satış siparişi/, /^SO-001 · Hamburg Handel/);
    fireEvent.change(input('yon'), { target: { value: 'Import' } });
    expect(await screen.findByRole('combobox', { name: /Bağlı satın alma siparişi/ }, T)).toBeTruthy();
    fireEvent.change(input('yon'), { target: { value: 'Export' } });
    await pickOrder(/Bağlı satış siparişi/, /^SO-001 · Hamburg Handel/);
    type('referans', 'EXP-1');
    type('cikisUlkesi', 'TR');
    type('varisUlkesi', 'DE');
    type('beyanDegeri', '99000');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(posts()).toHaveLength(1), T);
    const body = JSON.parse(posts()[0].body!);
    expect(body).toMatchObject({ direction: 'Export', salesOrderId: SO, referenceCode: 'EXP-1', declaredValue: 99000, transportMode: 'Road' });
    expect(body.purchaseOrderId ?? null).toBeNull();
  });

  it('new: the order is required', async () => {
    await openNew({ direction: 'Import' });
    type('referans', 'IMP-1');
    fillRoute();
    fireEvent.click(command('save')!);
    await new Promise((done) => setTimeout(done, 150));
    expect(posts()).toEqual([]);
  });

  it('new: an empty option list shows the legacy hint of the active direction', async () => {
    importOrders = [];
    await openNew({ direction: 'Import' });
    await waitFor(() => expect(text()).toContain('İthalat dosyası için seçilebilir satın alma siparişi bulunamadı.'), T);
    expect(text()).not.toContain('İhracat dosyası için seçilebilir satış siparişi bulunamadı.');
    fireEvent.change(input('yon'), { target: { value: 'Export' } });
    await waitFor(() => expect(text()).not.toContain('İthalat dosyası için seçilebilir satın alma siparişi bulunamadı.'), T);
  });

  it('edit: loads via getir, keeps direction and order read-only and PUTs the source-backed body', async () => {
    await openCard();
    await waitFor(() => expect(text()).toContain('İthalat dosyasını düzenle'), T);
    expect(text()).toContain('PO-001 · Berlin Makine GmbH (değiştirilemez)');
    expect(screen.getAllByText('Taslak').length).toBeGreaterThan(0);
    expect(input('yon').disabled).toBe(true);
    expect(screen.queryByRole('combobox', { name: /Bağlı satın alma siparişi/ })).toBeNull();
    expect(input('cikisUlkesi').value).toBe('DE');
    expect(input('tasima').value).toBe('Sea');
    expect(input('beyanDegeri').value).toBe('125000');
    await ready('save');
    type('tasiyiciReferansi', 'MSKU-9');
    fireEvent.click(command('save')!);
    await waitFor(() => expect(puts()).toHaveLength(1), T);
    expect(puts()[0].url).toBe(`/api/foreign-trade/cases/${F1}`);
    expect(JSON.parse(puts()[0].body!)).toMatchObject({ direction: 'Import', purchaseOrderId: PO, referenceCode: 'IMP-2026-001', originCountryCode: 'DE',
      destinationCountryCode: 'TR', incotermsCode: 'FOB', harmonizedSystemCode: '844332', transportMode: 'Sea', carrierReference: 'MSKU-9',
      declaredValue: 125000, plannedShipDate: '2026-12-01', plannedArrivalDate: '2026-12-15', notes: 'Liman: Mersin' });
    expect(posts()).toEqual([]);
    await waitFor(() => expect(navigations).toHaveLength(1), T);
    expect(navigations[0]).toMatchObject({ page: 'foreign-trade' });
  });

  it('edit of a shipped case: warning shown and no save', async () => {
    status = 'Shipped';
    await openCard();
    await waitFor(() => expect(text()).toContain('Sevkiyat başladıktan sonra temel dosya bilgileri değiştirilemez.'), T);
    expect(screen.getAllByText('Sevkte').length).toBeGreaterThan(0);
    const save = command('save');
    expect(save === null || save.getAttribute('aria-disabled') === 'true').toBe(true);
    fireEvent.keyDown(window, { key: 'F2' });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await new Promise((done) => setTimeout(done, 100));
    expect(writes()).toEqual([]);
  });
});
