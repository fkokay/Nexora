import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import SalesCustomerRequestsPage from '../sales-customer-requests/SalesCustomerRequestsPage';

/*
 * Satış belge oluşturma ekranları (taslak 02, belge düzenlenirken): kayıt formu davranışı (Ctrl+S, Esc, Enter) aynı,
 * görünüm belge ekranı — durum akışı, belge bilgileri kartı, satır ızgarası, KDV oranına göre toplamlar.
 * Kaydetme isteklerinin gövdesi temel sürümle aynı kalmalıdır.
 */

const warehouses = [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const customers = [{ id: 'c1', code: '120.01', name: 'Acme', type: 'Customer', isActive: true, currencyCode: 'TRY' }];
const stockItem = (id: string, code: string, name: string, price: number, vat: number) => ({
  id, code, name, unitCode: 'ADET', isActive: true, salesListPrice: price, salesVatPercent: vat, salesDiscountPercent: 0,
  priceCurrencyCode: 'TRY', trackingMode: 'None',
});
const stockItems = [stockItem('s1', 'STK-1', 'Koli 40x30', 100, 20), stockItem('s2', 'STK-2', 'Gıda etiketi', 50, 10)];

function respond(url: string, init?: { method?: string }): unknown {
  const path = url.split('?')[0];
  if (init?.method === 'POST' || init?.method === 'PUT') return { id: 'new1', code: 'NEW-1' };
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/' || path === '/api/finance/accounts') return [];
  if (path.endsWith('/units') || path.endsWith('/locations')) return [];
  if (path === '/api/sales/quotes/exchange-rates') return { baseCurrencyCode: 'TRY', rates: [] };
  if (path === '/api/customers/') return page(url.includes('type=Both') ? [] : customers);
  if (path === '/api/stock/items/') return page(stockItems);
  if (path === '/api/sales/quotes/new1')
    return { id: 'new1', code: 'NEW-1', customerId: null, customerName: 'Yeni Müşteri', quoteDate: '2026-11-17', validUntil: '2026-12-17',
      currencyCode: 'TRY', status: 'Draft', grandTotal: 0, lineCount: 0, createdAt: '2026-11-17', hasSalesOrder: false, revisionNumber: 1,
      notes: null, deliveryTerms: null, subtotal: 0, discountTotal: 0, taxTotal: 0, lines: [], customFields: [] };
  if (path === '/api/sales/quotes/new1/revisions') return [];
  if (path === '/api/sales/requests/new1')
    return { id: 'new1', code: 'NEW-1', customerId: 'c1', customerName: 'Acme', requestDate: '2026-11-17', neededByDate: null, description: null,
      status: 'Open', lineCount: 1, quoteCount: 0, createdAt: '2026-11-17', currencyCode: 'TRY', cancelReason: null, lines: [], quotes: [] };
  return page([]);
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'req-1' });
  apiMock.mockImplementation(async (url: string, _token: string, init?: { method?: string }) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  sessionStorage.clear();
  localStorage.clear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}
const ctrlS = () => fireEvent.keyDown(window, { key: 's', ctrlKey: true });
/** Body of the save request sent to `path` with `method`. */
function sentBody(path: string, method = 'POST') {
  const call = apiMock.mock.calls.find(([url, , init]) => url === path && init?.method === method);
  return call ? JSON.parse(call[2].body as string) : undefined;
}
/** Picks `option` in the SearchableRecordPicker whose trigger currently reads `trigger` (the nth one). */
async function pick(trigger: string, option: RegExp, nth = 0) {
  fireEvent.click(screen.getAllByText(trigger, { selector: 'button > span' })[nth].closest('button')!);
  const dialog = await screen.findByRole('dialog', { name: /seçin/ });
  fireEvent.click(within(dialog).getByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /seçin/ })).toBeNull());
}
const confirmText = 'Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?';
async function escapeAsksAndStays(input: HTMLElement) {
  fireEvent.input(input, { target: { value: 'X-1' } });
  fireEvent.change(input, { target: { value: 'X-1' } });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(await screen.findByText(confirmText)).toBeTruthy();
  fireEvent.click(document.querySelector<HTMLElement>('.workspace-confirm-actions button.secondary')!);
  await waitFor(() => expect(screen.queryByText(confirmText)).toBeNull());
}

describe('Teklif oluşturma', () => {
  it('Ctrl+S posts the same quote body', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={vi.fn()} createQuotePage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    fireEvent.change(screen.getByPlaceholderText('T-2026-0001'), { target: { value: 'T-9' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Kayıtlı cari olmadan teklif oluştur/ }));
    fireEvent.change(await screen.findByPlaceholderText('Firma veya kişi adı'), { target: { value: 'Yeni Müşteri' } });
    fireEvent.change(screen.getByPlaceholderText('TRY'), { target: { value: 'TRY' } });
    await pick('Stok seçin', /Koli 40x30/);
    fireEvent.change(screen.getByLabelText('Satır 1 miktar'), { target: { value: '2' } });
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/quotes/')).toBeDefined());
    const body = sentBody('/api/sales/quotes/');
    expect(body).toEqual({
      code: 'T-9', customerId: null, prospectCustomerName: 'Yeni Müşteri', quoteDate: body.quoteDate, validUntil: body.validUntil,
      currencyCode: 'TRY', notes: null, deliveryTerms: null, salespersonEmployeeId: null, customFields: {}, revisesQuoteId: null,
      salesRequestId: null,
      lines: [{ stockItemId: 's1', quantity: 2, unitPrice: 100, discountPercent: 0, vatPercent: 20, isVatIncluded: false, currencyCode: 'TRY', exchangeRateToQuoteCurrency: 1, unitCode: 'ADET' }],
    });
    expect(body.quoteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Esc on a touched quote asks before leaving', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={onNavigate} createQuotePage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await escapeAsksAndStays(screen.getByPlaceholderText('T-2026-0001'));
    expect(onNavigate).not.toHaveBeenCalledWith('sales-quotes');
  });
});

describe('Sipariş oluşturma', () => {
  it('Ctrl+S posts the same order body', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantUser" onNavigate={vi.fn()} createOrderPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    fireEvent.change(screen.getByLabelText(/Sipariş no/), { target: { value: 'S-9' } });
    fireEvent.click(document.querySelector<HTMLElement>('.customer-popup-trigger')!);
    fireEvent.click(await screen.findByRole('option', { name: /Acme/ }));
    await pick('Stok seçin', /Gıda etiketi/);
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/orders/')).toBeDefined());
    const body = sentBody('/api/sales/orders/');
    expect(body).toEqual({
      code: 'S-9', customerId: 'c1', orderDate: body.orderDate, requestedDeliveryDate: null, currencyCode: 'TRY',
      salespersonEmployeeId: null, customFields: {},
      lines: [{ stockItemId: 's2', quantity: 1, unitPrice: 50, discountPercent: 0, vatPercent: 10, isVatIncluded: false, unitCode: 'ADET', currencyCode: 'TRY' }],
    });
  });

  it('Esc on a touched order asks before leaving', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesOrdersPage token="t" role="TenantUser" onNavigate={onNavigate} createOrderPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await escapeAsksAndStays(screen.getByLabelText(/Sipariş no/));
    expect(onNavigate).not.toHaveBeenCalledWith('sales-orders');
  });
});

describe('Talep oluşturma', () => {
  it('Ctrl+S posts the same request body', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(screen.getByPlaceholderText('ST-2026-0001')).toBeTruthy());
    await settle();
    fireEvent.change(screen.getByPlaceholderText('ST-2026-0001'), { target: { value: 'ST-9' } });
    await pick('Müşteri seçin', /Acme/);
    await pick('Stok seçin', /Koli 40x30/);
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/requests/')).toBeDefined());
    const body = sentBody('/api/sales/requests/');
    expect(body).toEqual({
      code: 'ST-9', customerId: 'c1', requestDate: body.requestDate, neededByDate: null, description: null,
      lines: [{ stockItemId: 's1', quantity: 1 }],
    });
  });

  it('Esc on a touched request asks before leaving', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.keyDown(window, { key: 'F2' });
    const input = await screen.findByPlaceholderText('ST-2026-0001');
    await escapeAsksAndStays(input);
    expect(screen.getByPlaceholderText('ST-2026-0001')).toBeTruthy();
  });
});

describe('İrsaliye oluşturma', () => {
  it('Ctrl+S posts the same draft body', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    fireEvent.change(screen.getByPlaceholderText('IRS-2026-001'), { target: { value: 'IRS-9' } });
    await pick('Cari seçin', /Acme/);
    fireEvent.change(screen.getByRole('combobox', { name: /Depo/ }), { target: { value: 'w1' } });
    await pick('Stok seçin', /Koli 40x30/);
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/standalone-deliveries/')).toBeDefined());
    const body = sentBody('/api/sales/standalone-deliveries/');
    expect(body).toEqual({
      requestId: 'req-1', code: 'IRS-9', customerId: 'c1', supplierId: 'c1', warehouseId: 'w1', deliveryDate: body.deliveryDate,
      lines: [{ stockItemId: 's1', quantity: 1, unitCode: 'ADET', unitCostBase: 0, trackingCode: null, expiryDate: null, storageLocationId: null }],
    });
  });

  it('Esc on a touched draft asks before leaving', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await escapeAsksAndStays(screen.getByPlaceholderText('IRS-2026-001'));
    expect(screen.getByPlaceholderText('IRS-2026-001')).toBeTruthy();
  });
});

describe('Fatura oluşturma', () => {
  it('Ctrl+S posts the same invoice body', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantUser" onNavigate={vi.fn()} openInvoiceCreate />);
    await waitFor(() => expect(command('save').getAttribute('data-primary')).toBe('true'));
    await settle();
    await pick('Müşteri seçin', /Acme/);
    await pick('Stok kartı seçin', /Koli 40x30/);
    await pick('Depo seçin', /Ana depo/);
    fireEvent.change(screen.getByLabelText(/Birim fiyat/), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/Miktar/), { target: { value: '3' } });
    await waitFor(() => expect(enabled('save')).toBe(true));
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/invoices/')).toBeDefined());
    const body = sentBody('/api/sales/invoices/');
    expect(body).toEqual({
      requestId: 'req-1', customerId: 'c1', warehouseId: 'w1', invoiceDate: body.invoiceDate, accountingProfileCode: null,
      customFields: body.customFields, eDocument: body.eDocument, invoiceType: 'Wholesale', notes: null,
      lines: [{ stockItemId: 's1', quantity: 3, unitPrice: 100, discountPercent: 0, vatPercent: 20, isVatIncluded: false, warehouseId: 'w1' }],
    });
  });

  it('Esc on a touched invoice asks before leaving', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantUser" onNavigate={vi.fn()} openInvoiceCreate />);
    await waitFor(() => expect(command('save').getAttribute('data-primary')).toBe('true'));
    await escapeAsksAndStays(screen.getByLabelText(/Miktar/));
    expect(screen.getByLabelText(/Miktar/)).toBeTruthy();
  });
});
