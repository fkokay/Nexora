import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageParams } from '../pageNavigation';
import catalog from './salesOrdersOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Satış Siparişleri" standart tanımı (sales-orders.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `salesOrdersOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-orders';
const O1 = 'dddddddd-0000-0000-0000-000000000001';
const O2 = 'dddddddd-0000-0000-0000-000000000002';
const O9 = 'dddddddd-0000-0000-0000-000000000009';
const Q1 = 'eeeeeeee-0000-0000-0000-000000000001';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const D1 = 'ffffffff-0000-0000-0000-000000000001';
const I1 = '99999999-0000-0000-0000-000000000001';

const order = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, quoteId: null, quoteCode: null, customerId: 'c1', customerName: 'Acme', orderDate: '2026-11-01', requestedDeliveryDate: '2026-11-20',
  currencyCode: 'TRY', status, grandTotal: 1200, lineCount: 1, createdAt: '2026-11-01T08:00:00Z', ...extra,
});
const line = { lineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli', unitCode: 'ADET', quantity: 10, deliveredQuantity: 4, remainingQuantity: 6,
  reservedQuantity: 0, reservationId: null, reservationWarehouseId: null, reservationWarehouseName: null, unitPrice: 100, discountPercent: 0, vatPercent: 20,
  lineSubtotal: 1000, discountAmount: 0, taxAmount: 200, lineTotal: 1200, enteredUnitPrice: null, enteredCurrencyCode: null };
const detail = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) =>
  ({ ...order(id, code, status, extra), subtotal: 1000, discountTotal: 0, taxTotal: 200, lines: [line], customFields: [] });
const delivery = { id: D1, code: 'IRS-1', orderId: O1, orderCode: 'S-1', warehouseId: W1, warehouseName: 'Merkez', deliveryDate: '2026-11-03', status: 'Posted',
  lineCount: 1, createdAt: '2026-11-03T08:00:00Z', hasSalesInvoice: true, invoiceStatus: 'Posted', invoiceId: I1 };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/sales/orders') {
      return page([order(O1, 'S-1', 'Open', { quoteId: Q1, quoteCode: 'T-1' }), order(O2, 'S-2', 'Draft')],
        { pageGrandTotal: 2400, pageCurrencyCode: 'TRY', pageMixedCurrencies: false });
    }
    if (path === `/api/sales/orders/${O1}`) return detail(O1, 'S-1', 'Open', { quoteId: Q1, quoteCode: 'T-1' });
    if (path === `/api/sales/orders/${O2}`) return detail(O2, 'S-2', 'Fulfilled');
    if (path === `/api/sales/orders/${O9}`) return detail(O9, 'S-9', 'Open');
    if (path === '/api/sales/deliveries') return { items: query(url).get('orderId') === O1 ? [delivery] : [], page: 1, pageSize: 100, totalCount: query(url).get('orderId') === O1 ? 1 : 0 };
    if (path === '/api/warehouses') return [{ id: W1, code: 'MRK', name: 'Merkez', isActive: true, rowVersion: 'rv' }];
  } else if (method === 'PUT' && path === `/api/sales/orders/${O1}/delivery-date`) {
    return order(O1, 'S-1', 'Open');
  } else if (method === 'POST' && path === `/api/sales/orders/${O1}/reservations/release`) {
    return null;
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); h.listen(); });
afterEach(() => { h.reset(); cleanup(); setPageParams(KEY, {}); });

const openOrder = async (code: string) => {
  await h.selectRow(code);
  await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
  fireEvent.click(h.command('open'));
  return h.dialog(new RegExp(`Satış siparişi · ${code}`));
};

describe('Satış Siparişleri standart tanımı', { timeout: 30000 }, () => {
  it('is a v3 preview standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 3, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads the first page of 25 with the page total and the open-order counter', async () => {
    h.setup();
    await screen.findByText('S-1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    const list = h.gets('/api/sales/orders')[0];
    expect(query(list.url).get('page')).toBe('1');
    expect(query(list.url).get('pageSize')).toBe('25');
    const metric = (title: string) => screen.getAllByText(title).map((node) => node.closest('article')!).find(Boolean)!;
    await waitFor(() => expect(metric('Sevk bekleyen').textContent).toContain('1'), T);
    expect(metric('Sipariş tutarı').textContent).toContain('2.400');
    expect(screen.getAllByText('Açık').length).toBeGreaterThan(0);
  });

  it('opens the order from the orderId page param (openParam), even when it is not on the loaded page', async () => {
    setPageParams(KEY, { orderId: O9 });
    h.setup();
    const opened = await h.dialog(/Satış siparişi · S-9/);
    expect(h.gets(`/api/sales/orders/${O9}`).length).toBeGreaterThan(0);
    expect(opened.textContent).toContain('S-9 · Acme');
  });

  it('detail: lines, delivery history with its invoice link, and the chain to the source quote', async () => {
    h.setup();
    const opened = await openOrder('S-1');
    await waitFor(() => expect(opened.textContent).toContain('STK-1'), T);
    expect(opened.textContent).toContain('Teklif T-1');
    await waitFor(() => expect(h.gets('/api/sales/deliveries').length).toBeGreaterThan(0), T);
    expect(query(h.gets('/api/sales/deliveries')[0].url).get('orderId')).toBe(O1);
    fireEvent.click(within(opened).getByRole('tab', { name: /İrsaliye Geçmişi/ }));
    fireEvent.click(await within(opened).findByRole('button', { name: 'Faturayı aç' }, T));
    await waitFor(() => expect(h.state.navigations.some((item) => item.page === 'sales-invoices')).toBe(true), T);
    expect(h.state.navigations.find((item) => item.page === 'sales-invoices')).toMatchObject({ params: { invoiceId: I1 }, replace: false });
    fireEvent.click(within(opened).getByRole('button', { name: /Teklifi aç/ }));
    await waitFor(() => expect(h.state.navigations.some((item) => item.page === 'sales-quotes')).toBe(true), T);
    expect(h.state.navigations.find((item) => item.page === 'sales-quotes')).toMatchObject({ params: { quoteId: Q1 } });
  });

  it('İrsaliye oluştur opens the legacy order screen with orderId (approved); Düzenle opens the order card (draft)', async () => {
    h.setup();
    await h.selectRow('S-1');
    fireEvent.click(await h.menuItem(/İrsaliye oluştur/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { orderId: O1 }, legacy: true });
    await h.selectRow('S-2');
    expect((await h.menuAfter(`/api/sales/orders/${O2}`)).some((item) => /İrsaliye oluştur/.test(item))).toBe(false);
    fireEvent.click(await h.menuItem(/Düzenle/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'sales-order-create', params: { orderId: O2, customerId: 'c1', orderDate: '2026-11-01' }, replace: false });
    expect(h.state.navigations[1].legacy).toBeFalsy();
  });

  it('Teslim tarihini kaydet PUTs the date; a TenantUser sees no Sil or Rezervasyonu bırak', async () => {
    h.setup('TenantUser');
    const opened = await openOrder('S-1');
    await waitFor(() => expect(within(opened).getByRole('button', { name: 'Teslim tarihini kaydet' })).toBeTruthy(), T);
    expect(within(opened).queryByRole('button', { name: 'Sil' })).toBeNull();
    expect(within(opened).queryByRole('button', { name: 'Rezervasyonu bırak' })).toBeNull();
    fireEvent.click(within(opened).getByRole('button', { name: 'Teslim tarihini kaydet' }));
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'PUT', url: `/api/sales/orders/${O1}/delivery-date` });
    expect(JSON.parse(h.writes()[0].body!)).toEqual({ requestedDeliveryDate: '2026-11-20' });
  });
});
