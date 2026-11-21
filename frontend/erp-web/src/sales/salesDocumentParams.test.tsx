import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import SalesQuotesPage from '../SalesQuotesPage';
import SalesOrdersPage from '../SalesOrdersPage';
import SalesInvoicesPage from '../SalesInvoicesPage';
import SalesDeliveriesScreenPage from '../SalesDeliveriesScreenPage';
import { pageParamsOf, setPageParams } from '../pageNavigation';

/*
 * Karar 4 (satış sistem sayfaları, aşama A): eski satış ekranları belgeyi sayfa parametresiyle açar. Listeler
 * `quoteId` / `orderId` / `invoiceId` / `deliveryId` ile belgenin detayını, oluşturma ekranları `quoteId` / `orderId` ile
 * düzenlemeyi açar. Parametre bir kez okunur ve silinir; aynı sekmedeki diğer parametreler (ör. `customerId`) kalır.
 */

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const line = {
  id: 'l1', lineNumber: 1, orderLineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli', unitCode: 'ADET',
  quantity: 2, unitPrice: 50, discountPercent: 0, vatPercent: 20, lineSubtotal: 100, discountAmount: 0, taxAmount: 20, lineTotal: 120,
  deliveredQuantity: 0, remainingQuantity: 2, reservationId: null, reservationWarehouseId: null, reservationWarehouseName: null, reservedQuantity: 0,
  currencyCode: 'TRY',
};
const amounts = { subtotal: 100, discountTotal: 0, taxTotal: 20, grandTotal: 120 };
const quote = {
  id: 'q1', code: 'T-q1', customerId: 'c1', customerName: 'Acme', customerCode: '120.01', quoteDate: '2026-11-01', validUntil: '2099-12-01',
  currencyCode: 'TRY', status: 'Draft', lineCount: 1, createdAt: '2026-11-01', hasSalesOrder: false, revisionNumber: 1, ...amounts,
  notes: null, deliveryTerms: null, lines: [line], customFields: [],
};
const order = {
  id: 'o1', code: 'S-o1', quoteId: null, quoteCode: null, customerId: 'c1', customerName: 'Acme', orderDate: '2026-11-01',
  requestedDeliveryDate: null, currencyCode: 'TRY', status: 'Open', lineCount: 1, createdAt: '2026-11-01', ...amounts, lines: [line], customFields: [],
};
const invoice = {
  id: 'i1', code: 'F-i1', deliveryId: 'd1', deliveryCode: 'I-d1', orderId: 'o1', orderCode: 'S-o1', customerId: 'c1', customerName: 'Acme',
  invoiceDate: '2026-11-01', currencyCode: 'TRY', status: 'Posted', lineCount: 1, createdAt: '2026-11-01', ...amounts, ledgerEntryId: 'le1',
  lines: [line], paidAmount: 0, returnedAmount: 0, outstandingAmount: 120, notes: null, collections: [], returns: [], customFields: [],
  eDocumentScenario: null, eDocumentTypeCode: null, eDocumentRecipientAlias: null, eCommercePurchaseUrl: null, eCommercePaymentAgentName: null,
  eCommercePaymentType: null, eCommercePaymentMeans: null, deliveryCarrierName: null, deliverySentAt: null,
};
const delivery = {
  id: 'd1', code: 'I-d1', orderId: 'o1', orderCode: 'S-o1', warehouseId: 'w1', warehouseName: 'Ana depo', deliveryDate: '2026-11-01',
  status: 'Posted', lineCount: 1, createdAt: '2026-11-01', hasSalesInvoice: false, invoiceStatus: null, invoiceId: null, lines: [line],
};

let urls: string[] = [];
function respond(url: string): unknown {
  urls.push(url);
  const path = url.split('?')[0];
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/' || path.endsWith('/revisions') || path.startsWith('/api/finance/accounts')) return [];
  if (path === '/api/sales/quotes/exchange-rates') return { baseCurrencyCode: 'TRY', rates: [] };
  if (path === '/api/sales/quotes/q1') return quote;
  if (path === '/api/sales/orders/o1') return order;
  if (path === '/api/sales/invoices/i1') return invoice;
  if (path === '/api/sales/deliveries/d1') return delivery;
  if (path === '/api/customers/c1') return { id: 'c1', code: '120.01', name: 'Acme', type: 'Customer', isActive: true, currencyCode: 'TRY' };
  return page([]);
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

const PAGES = ['sales-quotes', 'sales-orders', 'sales-invoices', 'sales-deliveries', 'sales-quote-create', 'sales-order-create'];
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  apiMock.mockImplementation(async (url: string) => respond(url));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  urls = [];
  apiMock.mockClear();
  sessionStorage.clear();
  for (const key of PAGES) setPageParams(key, {});
});

const props = { token: 't', role: 'TenantAdmin', onNavigate: vi.fn() };
function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const T = { timeout: 10000 };
const surfaceCode = () => document.querySelector('.doc-surface .doc-surface-title h1 b')?.textContent;

describe('eski satış ekranları belge sayfa parametreleri', { timeout: 30000 }, () => {
  it('the quote list opens the quote from quoteId and consumes the param', async () => {
    setPageParams('sales-quotes', { quoteId: 'q1' });
    renderScreen(<SalesQuotesPage {...props} />);
    await waitFor(() => expect(surfaceCode()).toBe('T-q1'), T);
    expect(pageParamsOf('sales-quotes')).toEqual({});
  });

  it('the order list opens the order from orderId', async () => {
    setPageParams('sales-orders', { orderId: 'o1' });
    renderScreen(<SalesOrdersPage {...props} />);
    await waitFor(() => expect(surfaceCode()).toBe('S-o1'), T);
    expect(pageParamsOf('sales-orders')).toEqual({});
  });

  it('the invoice list opens the invoice from invoiceId and keeps the customer filter', async () => {
    setPageParams('sales-invoices', { customerId: 'c1', invoiceId: 'i1' });
    renderScreen(<SalesInvoicesPage {...props} />);
    await waitFor(() => expect(urls).toContain('/api/sales/invoices/i1'), T);
    await waitFor(() => expect(urls.some((url) => url.startsWith('/api/sales/invoices/?') && url.includes('customerId=c1'))).toBe(true), T);
    await waitFor(() => expect(surfaceCode()).toBe('F-i1'), T);
    expect(pageParamsOf('sales-invoices')).toEqual({});
  });

  it('the delivery list opens the delivery from deliveryId', async () => {
    setPageParams('sales-deliveries', { deliveryId: 'd1' });
    renderScreen(<SalesDeliveriesScreenPage {...props} />);
    await waitFor(() => expect(surfaceCode()).toBe('I-d1'), T);
    expect(pageParamsOf('sales-deliveries')).toEqual({});
  });

  it('the quote create screen edits the quote from quoteId', async () => {
    setPageParams('sales-quote-create', { quoteId: 'q1' });
    renderScreen(<SalesQuotesPage {...props} createQuotePage />);
    await waitFor(() => expect(urls).toContain('/api/sales/quotes/q1'), T);
    await waitFor(() => expect((document.querySelector('input[value="T-q1"]') as HTMLInputElement | null)?.value).toBe('T-q1'), T);
    expect(pageParamsOf('sales-quote-create')).toEqual({});
  });

  it('the order create screen edits the order from orderId, loading it once', async () => {
    setPageParams('sales-order-create', { orderId: 'o1' });
    renderScreen(<SalesOrdersPage {...props} createOrderPage />);
    await waitFor(() => expect((document.querySelector('input[value="S-o1"]') as HTMLInputElement | null)?.value).toBe('S-o1'), T);
    expect(sessionStorage.getItem('nexora.sales-order.edit-id')).toBe('o1');
    expect(pageParamsOf('sales-order-create')).toEqual({});
    expect(urls.filter((url) => url === '/api/sales/orders/o1')).toHaveLength(1);
  });
});
