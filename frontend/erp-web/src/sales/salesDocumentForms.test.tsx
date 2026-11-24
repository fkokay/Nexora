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
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import { setPageParams } from '../pageNavigation';

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
  if (path === '/api/customers/c1') return customers[0];
  if (path === '/api/sales/requests/req9')
    return { id: 'req9', code: 'ST-9', customerId: 'c1', customerName: 'Acme', currencyCode: 'TRY', description: null,
      lines: [
        { lineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 3, quoteCodes: [] },
        { lineNumber: 2, stockItemId: 's2', stockCode: 'STK-2', stockName: 'Gıda etiketi', unitCode: 'ADET', quantity: 5, quoteCodes: ['T-1'] },
      ] };
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
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
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
      lines: [{ stockItemId: 's1', salesRequestLineNumber: null, quantity: 2, unitPrice: 100, discountPercent: 0, vatPercent: 20, isVatIncluded: false, currencyCode: 'TRY', exchangeRateToQuoteCurrency: 1, unitCode: 'ADET' }],
    });
    expect(body.quoteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('from a request: lines already quoted start unticked and unticked lines are not sent', async () => {
    sessionStorage.setItem('nexora.sales-quote.request-id', 'req9');
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={vi.fn()} createQuotePage />);
    const second = await screen.findByRole('checkbox', { name: 'Satır 2 teklife dahil' });
    await settle();
    expect((screen.getByRole('checkbox', { name: 'Satır 1 teklife dahil' }) as HTMLInputElement).checked).toBe(true);
    expect((second as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Teklife dahil değil')).toBeTruthy();
    expect(screen.getByText('T-1')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('T-2026-0001'), { target: { value: 'T-10' } });
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/quotes/')).toBeDefined());
    const body = sentBody('/api/sales/quotes/');
    expect(body.salesRequestId).toBe('req9');
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({ stockItemId: 's1', salesRequestLineNumber: 1, quantity: 3 });
  });

  it('Esc on a touched quote asks before leaving', async () => {
    const onNavigate = vi.fn();
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={onNavigate} createQuotePage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await escapeAsksAndStays(screen.getByPlaceholderText('T-2026-0001'));
    expect(onNavigate).not.toHaveBeenCalledWith('sales-quotes');
  });
});

describe('Belgeler arası geçiş (sayfa parametresi)', () => {
  it('opens the quote given by quoteId on the quote list, and the request given by requestId on the request list', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={vi.fn()} />);
    await settle();
    act(() => setPageParams('sales-quotes', { quoteId: 'new1' }));
    await waitFor(() => expect(apiMock.mock.calls.some(([url]) => url === '/api/sales/quotes/new1')).toBe(true));
    cleanup();
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    act(() => setPageParams('sales-customer-requests', { requestId: 'new1' }));
    await waitFor(() => expect(apiMock.mock.calls.some(([url]) => url === '/api/sales/requests/new1')).toBe(true));
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

  // The document header replaces only the record header: Kaydet ve Yeni (Ctrl+F2), Temizle and F2 work as before.
  it('Ctrl+F2 saves and keeps an empty request form open (Kaydet ve Yeni)', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.keyDown(window, { key: 'F2' });
    const input = await screen.findByPlaceholderText<HTMLInputElement>('ST-2026-0001');
    await settle();
    fireEvent.change(input, { target: { value: 'ST-9' } });
    await pick('Müşteri seçin', /Acme/);
    await pick('Stok seçin', /Koli 40x30/);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'F2', ctrlKey: true });
    });
    await waitFor(() => expect(sentBody('/api/sales/requests/')).toBeDefined());
    expect(sentBody('/api/sales/requests/').code).toBe('ST-9');
    await waitFor(() => expect(screen.getByText('NEW-1 kaydedildi.')).toBeTruthy());
    // Still the create form (no detail opened), reset for the next request.
    expect(document.querySelector('.doc-form')).not.toBeNull();
    expect(document.querySelector('.doc-surface')).toBeNull();
    expect(screen.getByPlaceholderText<HTMLInputElement>('ST-2026-0001').value).toBe('');
    expect(screen.getByText('Müşteri seçin', { selector: 'button > span' })).toBeTruthy();
    expect(apiMock.mock.calls.some(([url]) => url === '/api/sales/requests/new1')).toBe(false);
  });

  it('İşlemler › Temizle clears the request form', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.keyDown(window, { key: 'F2' });
    const input = await screen.findByPlaceholderText<HTMLInputElement>('ST-2026-0001');
    await settle();
    fireEvent.change(input, { target: { value: 'ST-9' } });
    await pick('Müşteri seçin', /Acme/);
    fireEvent.click(command('more'));
    fireEvent.click(Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Temizle')!);
    await waitFor(() => expect(screen.getByPlaceholderText<HTMLInputElement>('ST-2026-0001').value).toBe(''));
    expect(screen.getByText('Müşteri seçin', { selector: 'button > span' })).toBeTruthy();
    expect(apiMock.mock.calls.some(([, , init]) => init?.method === 'POST')).toBe(false);
  });

  it('F2 over a changed request form asks first; declining keeps the values, accepting starts afresh', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.keyDown(window, { key: 'F2' });
    const input = await screen.findByPlaceholderText<HTMLInputElement>('ST-2026-0001');
    await settle();
    fireEvent.change(input, { target: { value: 'ST-9' } });
    fireEvent.keyDown(window, { key: 'F2' });
    expect(await screen.findByText(confirmText)).toBeTruthy();
    fireEvent.click(document.querySelector<HTMLElement>('.workspace-confirm-actions button.secondary')!);
    await waitFor(() => expect(screen.queryByText(confirmText)).toBeNull());
    expect(screen.getByPlaceholderText<HTMLInputElement>('ST-2026-0001').value).toBe('ST-9');
    fireEvent.keyDown(window, { key: 'F2' });
    expect(await screen.findByText(confirmText)).toBeTruthy();
    fireEvent.click(document.querySelector<HTMLElement>('.workspace-confirm-actions button:not(.secondary)')!);
    await waitFor(() => expect(screen.queryByText(confirmText)).toBeNull());
    expect(screen.getByPlaceholderText<HTMLInputElement>('ST-2026-0001').value).toBe('');
    expect(document.querySelector('.doc-form')).not.toBeNull();
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
      // Taslak 20: the stock card list price is suggested in the customer's currency and sent with the line.
      lines: [{
        stockItemId: 's1', quantity: 1, unitCode: 'ADET', unitCostBase: 0, trackingCode: null, expiryDate: null, storageLocationId: null,
        isFreeOfCharge: false, unitPrice: 100, discountPercent: 0, vatPercent: 20,
      }],
    });
  });

  it('Bedelsiz locks and clears the price cells; Tümünü bedelsiz yap toggles every line; the totals follow', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    fireEvent.change(screen.getByPlaceholderText('IRS-2026-001'), { target: { value: 'IRS-9' } });
    await pick('Cari seçin', /Acme/);
    fireEvent.change(screen.getByRole('combobox', { name: /Depo/ }), { target: { value: 'w1' } });
    await pick('Stok seçin', /Koli 40x30/);
    const price = screen.getByLabelText<HTMLInputElement>('Satır 1 birim fiyat');
    expect(price.value).toBe('100');
    expect(screen.getByText('liste fiyatı 100,00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Satır 1 miktar'), { target: { value: '2' } });
    fireEvent.change(price, { target: { value: '90' } });
    expect(screen.getByText('liste fiyatı 100,00 · değiştirildi')).toBeTruthy();
    const cards = () => screen.getByRole('group', { name: 'İrsaliye fiyat toplamları' }).textContent;
    expect(cards()).toContain('180,00 TRY');
    expect(cards()).toContain('216,00 TRY');
    fireEvent.click(screen.getByLabelText('Satır 1 bedelsiz'));
    expect(screen.queryByLabelText('Satır 1 birim fiyat')).toBeNull();
    expect(screen.getByText('— fiyatsız')).toBeTruthy();
    expect(cards()).toContain('0,00 TRY');
    expect(screen.getByRole('group', { name: 'İrsaliye fiyat toplamları' }).querySelector(':scope > div:last-child b')?.textContent).toBe('1');
    await act(async () => ctrlS());
    await waitFor(() => expect(sentBody('/api/sales/standalone-deliveries/')).toBeDefined());
    // A free line sends only the flag: the price keys are left out.
    expect(sentBody('/api/sales/standalone-deliveries/').lines[0]).toEqual({
      stockItemId: 's1', quantity: 2, unitCode: 'ADET', unitCostBase: 0, trackingCode: null, expiryDate: null, storageLocationId: null, isFreeOfCharge: true,
    });
  });

  it('Tümünü bedelsiz yap marks every line; Bedelsizi kaldır suggests the list price again', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    await pick('Cari seçin', /Acme/);
    await pick('Stok seçin', /Koli 40x30/);
    fireEvent.click(screen.getByRole('button', { name: /satır ekle/i }));
    await pick('Stok seçin', /Gıda etiketi/);
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü bedelsiz yap' }));
    expect(screen.getByLabelText<HTMLInputElement>('Satır 1 bedelsiz').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Satır 2 bedelsiz').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Bedelsizi kaldır' }));
    expect(screen.getByLabelText<HTMLInputElement>('Satır 1 birim fiyat').value).toBe('100');
    expect(screen.getByLabelText<HTMLInputElement>('Satır 2 birim fiyat').value).toBe('50');
    expect(screen.getByLabelText<HTMLInputElement>('Satır 2 KDV yüzdesi').value).toBe('10');
  });

  it('taslak 20: the invoice dialog prefills the delivery prices, a free line needs an amount (list price offered)', async () => {
    const posted = { id: 'sd1', code: 'IRS-5', customerId: 'c1', customerName: 'Acme', warehouseId: 'w1', date: '2026-11-20', status: 'Posted', lineCount: 2,
      createdAt: '2026-11-20', invoiceId: null, currencyCode: 'TRY', pricedGrandTotal: 120, pricingState: 'PartlyFree' };
    const detail = { lines: [
      { lineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 1, unitPrice: 100, discountPercent: 0, vatPercent: 20, isFreeOfCharge: false },
      { lineNumber: 2, stockItemId: 's2', stockCode: 'STK-2', stockName: 'Gıda etiketi', unitCode: 'ADET', quantity: 3, unitPrice: null, discountPercent: null, vatPercent: null, isFreeOfCharge: true },
    ] };
    apiMock.mockImplementation(async (url: string, _token: string, init?: { method?: string }) => {
      const path = url.split('?')[0];
      if (!init?.method && path === '/api/sales/standalone-deliveries/') return page([posted]);
      if (!init?.method && path === '/api/sales/standalone-deliveries/sd1') return detail;
      return respond(url, init);
    });
    try {
      renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
      await waitFor(() => expect(screen.getByText(/IRS-5/)).toBeTruthy());
      const item = screen.getByText(/IRS-5/).closest('article')!;
      expect(within(item).getByText('Kısmen bedelsiz')).toBeTruthy();
      expect(item.textContent).toContain('120,00 TRY');
      await act(async () => {
        fireEvent.click(within(item).getByRole('button', { name: 'Fatura oluştur' }));
      });
      const dialog = await screen.findByRole('dialog', { name: 'IRS-5 için fatura oluştur' });
      expect(within(dialog).getByLabelText<HTMLInputElement>('STK-1 birim fiyat').value).toBe('100');
      expect(within(dialog).getByText('irsaliyeden')).toBeTruthy();
      expect(dialog.textContent).toContain('1 satırın tutarı eksik');
      const free = within(dialog).getByLabelText<HTMLInputElement>('STK-2 birim fiyat');
      expect(free.value).toBe('');
      await act(async () => {
        fireEvent.submit(dialog.querySelector('form')!);
      });
      expect(sentBody('/api/sales/standalone-deliveries/sd1/invoice')).toBeUndefined();
      fireEvent.click(within(dialog).getByRole('button', { name: 'liste fiyatı 50,00 · öner' }));
      expect(free.value).toBe('50');
      await act(async () => {
        fireEvent.submit(dialog.querySelector('form')!);
      });
      await waitFor(() => expect(sentBody('/api/sales/standalone-deliveries/sd1/invoice')).toBeDefined());
      expect(sentBody('/api/sales/standalone-deliveries/sd1/invoice').lines).toEqual([
        { lineNumber: 1, unitPrice: 100, discountPercent: 0, vatPercent: 20 },
        // The free line takes the stock card's VAT; its blank discount is left to the server.
        { lineNumber: 2, unitPrice: 50, vatPercent: 10 },
      ]);
    } finally {
      apiMock.mockImplementation(async (url: string, _token: string, init?: { method?: string }) => respond(url, init));
    }
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
    fireEvent.change(screen.getByLabelText('Satır 1 birim fiyat'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Satır 1 miktar'), { target: { value: '3' } });
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
    await escapeAsksAndStays(screen.getByLabelText('Satır 1 miktar'));
    expect(screen.getByLabelText('Satır 1 miktar')).toBeTruthy();
  });
});

/* ---- Belge ekranı görünümü (taslak 02) ---- */

const form = () => document.querySelector<HTMLElement>('.record-form')!;
const head = () => form().querySelector<HTMLElement>('header.doc-surface-head')!;
const flowSteps = () =>
  Array.from(head().querySelectorAll('.doc-flow-step')).map(
    (step) => `${step.querySelector('span')?.textContent}${step.getAttribute('aria-current') ? '*' : ''}`,
  );
const footKeys = () => Array.from(form().querySelectorAll('.rf-keys > span')).map((node) => node.textContent);
/** Visible text with the parts of an amount ("200,00" + "TL") separated as they are on screen. */
function words(node: Node): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) parts.push(text.textContent ?? '');
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
}
const totalsOf = (label: string) =>
  Array.from(screen.getByLabelText(label).querySelectorAll(':scope > div')).map((row) => [
    words(row.querySelector('dt')!),
    words(row.querySelector('dd')!),
  ]);
/** Buttons in the header besides Vazgeç would duplicate the action bar. */
const headButtons = () => Array.from(head().querySelectorAll('button')).map((button) => button.textContent?.trim());
function expectKitChrome(type: string) {
  expect(form().classList.contains('doc-form')).toBe(true);
  expect(head().querySelector('.doc-surface-eyebrow')!.textContent).toContain(type);
  expect(headButtons()).toEqual(['Vazgeç']);
  expect(form().querySelector('.rf-group-body.doc-form-fields')).not.toBeNull();
  const grid = form().querySelector<HTMLTableElement>('.dd-box table.dd-lines')!;
  expect(grid).not.toBeNull();
  expect(grid.querySelector('tr.dd-new-line [data-line-add-shortcut]')).not.toBeNull();
  return grid;
}

describe('Belge ekranı görünümü', () => {
  it('quote create: kit chrome, Taslak current, lines grid, totals by KDV rate', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantUser" onNavigate={vi.fn()} createQuotePage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    const grid = expectKitChrome('Satış teklifi');
    // The suggested number is filled in on load; the heading follows the number field.
    const suggested = (screen.getByPlaceholderText('T-2026-0001') as HTMLInputElement).value;
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(suggested ? `Satış teklifi ${suggested}` : 'Yeni Teklif');
    expect(flowSteps()).toEqual(['Taslak*', 'İletildi', 'Kabul edildi']);
    fireEvent.change(screen.getByPlaceholderText('T-2026-0001'), { target: { value: 'T-9' } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Satış teklifi T-9');
    await pick('Stok seçin', /Koli 40x30/);
    fireEvent.change(screen.getByLabelText('Satır 1 miktar'), { target: { value: '2' } });
    expect(within(grid).getByLabelText('Satır 1 miktar').closest('td')!.className).toContain('dd-num');
    expect(totalsOf('Teklif toplamları')).toEqual([
      ['Mal / hizmet toplamı', '200,00 TL'],
      ['Toplam iskonto', '− 0,00 TL'],
      ['KDV %20 matrahı', '200,00 TL'],
      ['KDV %20', '40,00 TL'],
      ['KDV toplamı', '40,00 TL'],
      ['Genel toplam · Ödenecek tutar', '240,00 TL'],
    ]);
    // Notes sit left of the totals in the lines card's bottom band.
    expect(screen.getByLabelText('Teklif toplamları').closest('.dd-lines-footer')!.querySelector('textarea')).not.toBeNull();
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Esc kapat']);
    // Nothing in İşlemler (no Kaydet ve Yeni / Temizle on this form), so no Alt+İ hint.
    expect(openMenu()).toEqual([]);
  });

  it('order create: no current step before save (Açık exists once saved), cari next to the heading, totals', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantUser" onNavigate={vi.fn()} createOrderPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    expectKitChrome('Satış siparişi');
    expect(openMenu()).toEqual([]);
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Esc kapat']);
    expect(flowSteps()).toEqual(['Açık', 'Tamamlandı']);
    expect(head().querySelector('.doc-surface-meta .rf-badge')!.textContent).toBe('YENİ KAYIT');
    fireEvent.click(document.querySelector<HTMLElement>('.customer-popup-trigger')!);
    fireEvent.click(await screen.findByRole('option', { name: /Acme/ }));
    await waitFor(() => expect(head().querySelector('.doc-surface-party')?.textContent).toBe('Acme'));
    await pick('Stok seçin', /Gıda etiketi/);
    expect(totalsOf('Sipariş toplamları')).toEqual([
      ['Mal / hizmet toplamı', '50,00 TL'],
      ['Toplam iskonto', '− 0,00 TL'],
      ['KDV %10 matrahı', '50,00 TL'],
      ['KDV %10', '5,00 TL'],
      ['KDV toplamı', '5,00 TL'],
      ['Genel toplam · Ödenecek tutar', '55,00 TL'],
    ]);
  });

  it('request create: no current step before save, lines grid without prices (no totals)', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.keyDown(window, { key: 'F2' });
    await screen.findByPlaceholderText('ST-2026-0001');
    expectKitChrome('Satış talebi');
    expect(openMenu()).toEqual(['Kaydet ve YeniCtrl+F2', 'Temizle']);
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Alt+İ işlemler', 'Esc kapat']);
    expect(flowSteps()).toEqual(['Açık', 'Kısmen teklif verildi', 'Teklif verildi']);
    expect(form().querySelector('.dd-totals')).toBeNull();
  });

  it('delivery create: Taslak current (a draft is posted later), lines grid', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantUser" onNavigate={vi.fn()} createDeliveryPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    const grid = expectKitChrome('Satış irsaliyesi');
    expect(openMenu()).toEqual(['Temizle']);
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Alt+İ işlemler', 'Esc kapat']);
    expect(flowSteps()).toEqual(['Taslak*', 'Sevk edildi', 'Faturalandı']);
    // Taslak 20: the price columns follow the unit.
    expect(Array.from(grid.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(
      ['#', 'Stok kartı', 'Miktar', 'Birim', 'Bedelsiz', 'Birim fiyat', 'İsk. %', 'KDV %', 'Tutar', 'KDV dahil'],
    );
    expect(form().querySelector('.dd-totals')).toBeNull();
  });

  it('invoice create: Kesildi not current before save (the save issues it), totals as today', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantUser" onNavigate={vi.fn()} openInvoiceCreate />);
    await waitFor(() => expect(command('save').getAttribute('data-primary')).toBe('true'));
    await settle();
    expectKitChrome('Satış faturası');
    expect(openMenu()).toEqual([]);
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Esc kapat']);
    expect(flowSteps()).toEqual(['Kesildi']);
    expect(head().querySelector('[aria-current]')).toBeNull();
    await pick('Müşteri seçin', /Acme/);
    await waitFor(() => expect(head().querySelector('.doc-surface-party')?.textContent).toBe('Acme'));
    await pick('Stok kartı seçin', /Koli 40x30/);
    fireEvent.change(screen.getByLabelText('Satır 1 birim fiyat'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Satır 1 miktar'), { target: { value: '3' } });
    expect(totalsOf('Fatura toplamları')).toEqual([
      ['Toplam tutar', '300,00 TL'],
      ['KDV %20', '60,00 TL'],
      ['KDV toplamı', '60,00 TL'],
      ['Genel toplam', '360,00 TL'],
      ['KDV tevkifat tutarı', '0,00 TL'],
      ['Ödenecek tutar', '360,00 TL'],
    ]);
    // One emphasised grand row: Genel toplam. Ödenecek tutar is the same amount (no withholding) — a strong row.
    const rowClass = (name: string) =>
      Array.from(screen.getByLabelText('Fatura toplamları').querySelectorAll(':scope > div'))
        .find((row) => words(row.querySelector('dt')!) === name)!.className;
    expect(screen.getByLabelText('Fatura toplamları').querySelectorAll(':scope > .is-grand')).toHaveLength(1);
    expect(rowClass('Genel toplam')).toBe('is-grand');
    expect(rowClass('Ödenecek tutar')).toBe('is-strong');
    expect(screen.getByLabelText('Fatura toplamları').closest('.dd-lines-footer')!.querySelector('textarea')).not.toBeNull();
  });
});

describe('English text of the create screens', () => {
  it('has an English entry for every new text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    const texts = [
      'Satış talebi', 'Satış teklifi', 'Satış siparişi', 'Satış irsaliyesi', 'Satış faturası', 'Belge bilgileri', '* zorunlu alan',
      'Satırlar', 'satır ekle', 'Ctrl+Shift+Enter satır ekle', 'Alt+İ işlemler', 'Satır ekle', 'Bu teklif', '1 satır',
      'Teklif satırları', 'Sipariş satırları', 'Talep satırları', 'İrsaliye satırları', 'Fatura satırları',
      'Lot / seri takipli stoklarda takip kodu zorunludur.', 'Her satırın stok çıkışı seçilen depodan yapılır.',
      'Depo gözü', 'Lot / seri kodu', 'Son kullanma tarihi', 'Satır 1 kaldır', 'Satır 1 depo gözü', 'Satır 1 lot / seri kodu',
      'Satır 1 son kullanma tarihi', 'Satır 1 miktar', 'Satır 1 birim fiyat', 'Satır 1 iskonto yüzdesi', 'Satır 1 KDV yüzdesi', 'Satır 1 sil',
      'Birim fiyat (TRY)', 'Teklif toplamları', 'Sipariş toplamları', 'Fatura toplamları', 'Satır işlemleri',
    ];
    expect(texts.filter((text) => localizedUiText(text) === text)).toEqual([]);
  });
});
