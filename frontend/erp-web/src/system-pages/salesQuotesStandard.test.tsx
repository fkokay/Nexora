import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageParams } from '../pageNavigation';
import catalog from './salesQuotesOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Satış Teklifleri" standart tanımı (sales-quotes.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `salesQuotesOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-quotes';
const Q1 = 'eeeeeeee-0000-0000-0000-000000000001';
const Q2 = 'eeeeeeee-0000-0000-0000-000000000002';
const Q3 = 'eeeeeeee-0000-0000-0000-000000000003';
const O1 = 'dddddddd-0000-0000-0000-000000000001';

const quote = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, customerId: 'c1', customerCode: '120.01', customerName: 'Acme', quoteDate: '2026-11-01', validUntil: '2099-12-01', currencyCode: 'TRY',
  status, grandTotal: 1200, lineCount: 1, createdAt: '2026-11-01T08:00:00Z', hasSalesOrder: false, revisionNumber: 1, salespersonName: 'PER001 · Ayşe Kaya',
  salesOrderId: null, salesOrderCode: null, ...extra,
});
const line = { lineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli', unitCode: 'ADET', quantity: 10, unitPrice: 100, discountPercent: 0,
  discountAmount: 0, vatPercent: 20, isVatIncluded: false, lineSubtotal: 1000, taxAmount: 200, lineTotal: 1200, enteredCurrencyCode: null, exchangeRateToQuoteCurrency: null };
const detail = (row: ReturnType<typeof quote>) => ({ ...row, subtotal: 1000, discountTotal: 0, taxTotal: 200, notes: null, deliveryTerms: null, lines: [line], customFields: [] });
const rows = () => [
  quote(Q1, 'T-1', 'Draft'),
  quote(Q2, 'T-2', 'Sent'),
  quote(Q3, 'T-3', 'Accepted', { hasSalesOrder: true, salesOrderId: O1, salesOrderCode: 'S-1' }),
];

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/sales/quotes') {
      const status = query(url).get('status');
      const items = rows().filter((row) => !status || row.status === status);
      return page(items, { pageGrandTotal: 1200 * items.length, pageCurrencyCode: 'TRY', pageMixedCurrencies: false });
    }
    const one = /^\/api\/sales\/quotes\/([^/]+)$/.exec(path);
    if (one) return detail(rows().find((row) => row.id === one[1]) ?? quote(one[1], 'T-9', 'Draft'));
    if (/^\/api\/sales\/quotes\/[^/]+\/revisions$/.test(path)) return [{ id: Q1, code: 'T-1', revisionNumber: 1, status: 'Draft', quoteDate: '2026-11-01', grandTotal: 1200, currencyCode: 'TRY', hasSalesOrder: false }];
  } else if (method === 'POST' && path === `/api/sales/quotes/${Q1}/send`) {
    return quote(Q1, 'T-1', 'Sent');
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); h.listen(); });
afterEach(() => { h.reset(); cleanup(); setPageParams(KEY, {}); });

describe('Satış Teklifleri standart tanımı', { timeout: 30000 }, () => {
  it('is a v1 preview standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 1, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('loads 25 per page; the Yanıt bekleyen metric filters the list to İletildi', async () => {
    h.setup();
    await screen.findByText('T-1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    expect(query(h.gets('/api/sales/quotes')[0].url).get('pageSize')).toBe('25');
    const metric = await screen.findByRole('button', { name: /Yanıt bekleyen/ }, T);
    await waitFor(() => expect(metric.textContent).toContain('1'), T);
    fireEvent.click(metric);
    await waitFor(() => expect(query(h.lastGet('/api/sales/quotes').url).get('status')).toBe('Sent'), T);
    await waitFor(() => expect(screen.queryByText('T-1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' })).toBeNull(), T);
  });

  it('opens the quote from the quoteId page param and İletildi yap posts after confirmation', async () => {
    setPageParams(KEY, { quoteId: Q1 });
    h.setup();
    const opened = await h.dialog(/Satış teklifi · T-1/);
    await waitFor(() => expect(opened.textContent).toContain('STK-1'), T);
    fireEvent.click(await within(opened).findByRole('button', { name: 'İletildi yap' }, T));
    await h.confirm('“T-1” müşteriye iletildi');
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/sales/quotes/${Q1}/send` });
  });

  it('İşlemler follow the status: Draft → Düzenle / İletildi yap; Accepted with an order → Siparişi aç', async () => {
    h.setup();
    await h.selectRow('T-1');
    const draft = await h.menuAfter(`/api/sales/quotes/${Q1}`);
    expect(draft).toEqual(expect.arrayContaining(['Düzenle', 'İletildi yap']));
    expect(draft).not.toContain('Kabul et');
    fireEvent.click(await h.menuItem(/Düzenle/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-quote-create', params: { quoteId: Q1 }, replace: false });
    await h.selectRow('T-3');
    const accepted = await h.menuAfter(`/api/sales/quotes/${Q3}`);
    expect(accepted).toContain('Siparişi aç');
    expect(accepted).not.toContain('Sipariş oluştur');
    fireEvent.click(await h.menuItem(/Siparişi aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'sales-orders', params: { orderId: O1 } });
  });

  it('Sil is offered to an admin only on a Draft; Yazdır / PDF opens the legacy quote screen with quoteId', async () => {
    h.setup();
    const deletable = () => { const button = h.command('delete'); return !!button && button.getAttribute('aria-disabled') !== 'true'; };
    await h.selectRow('T-2');
    await h.menuAfter(`/api/sales/quotes/${Q2}`);
    expect(deletable()).toBe(false);
    await h.selectRow('T-1');
    expect(await h.menuAfter(`/api/sales/quotes/${Q1}`)).toContain('Yazdır / PDF');
    expect(deletable()).toBe(true);
    fireEvent.click(await h.menuItem(/Yazdır/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { quoteId: Q1 }, legacy: true });
  });
});
