import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import SupplierOrdersPage from '../SupplierOrdersPage';
import PurchaseInvoiceEntryPage from '../PurchaseInvoiceEntryPage';
import StandaloneSupplierInvoiceDraftPage from '../StandaloneSupplierInvoiceDraftPage';

/*
 * Satınalma oluşturma ekranları: yeni satınalma siparişi, mal kabul faturası girişi, bağımsız fatura taslakları.
 * Kaydetme isteklerinin gövdesi ve Esc onayı temel sürümle aynı kalmalıdır.
 */

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const supplier = { id: 's1', code: '320.01', name: 'Ege Ambalaj', type: 'Supplier', isActive: true, currencyCode: 'TRY' };
const stock = { id: 'st1', code: 'AMB-1', name: 'Koli 40x30', unitCode: 'ADET', isActive: true, purchaseListPrice: 35, purchaseVatPercent: 20, purchaseDiscountPercent: 0, priceCurrencyCode: 'TRY', trackingMode: 'None' };
const receipt = {
  id: 'r1', receiptCode: 'MK-0009', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0007', supplierId: 's1', supplierName: 'Ege Ambalaj',
  receiptDate: '2026-11-10', warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo', lineCount: 1, currencyCode: 'TRY', purchaseOrderTotal: 8400,
};
const order = {
  id: 'po1', currencyCode: 'TRY', lines: [{ lineNumber: 1, unitPrice: 35, discountPercent: 0, vatPercent: 20 }],
  receipts: [{ id: 'r1', status: 'Posted', invoice: null, lines: [{ orderLineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 200 }] }],
};
const draftRow = (id: string, status: string) => ({
  id, supplierId: 's1', supplierName: 'Ege Ambalaj', invoiceNumber: `BF-${id}`, invoiceDate: '2026-11-12', dueDate: null, currencyCode: 'TRY',
  grandTotal: 1200, lineCount: 1, status, createdAt: '2026-11-12T10:00:00Z',
});
const draftDetail = {
  ...draftRow('d1', 'Draft'), notes: null, subtotal: 1000, discountTotal: 0, taxTotal: 200, rowVersion: 'rv-1',
  lines: [{ lineNumber: 1, description: 'Nakliye', quantity: null, unitCode: null, unitPrice: null, subtotal: 1000, discountAmount: 0, taxAmount: 200, total: 1200, expenseAccountId: null, vatRate: 20, standalonePurchaseReceiptLineId: null }],
};

function respond(url: string, init?: { method?: string }): unknown {
  const path = url.split('?')[0];
  const method = init?.method ?? 'GET';
  if (method === 'POST' && path === '/api/purchasing/orders/') return { id: 'po9', code: 'SA-9' };
  if (method === 'POST' && path === '/api/purchasing/receipts/r1/invoice') return { id: 'pi9', code: 'AF-9', grandTotal: 8400, currencyCode: 'TRY' };
  if (method === 'POST' && path === '/api/purchasing/standalone-invoices/') return { id: 'd9', invoiceNumber: 'BF-9' };
  if (method === 'PUT') return { id: 'd1', invoiceNumber: 'BF-d1' };
  if (method === 'POST' && path.endsWith('/post')) return { draftId: 'd1', status: 'Posted', journalEntryId: 'j1', ledgerEntryId: 'l1' };
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/purchasing/orders/custom-fields') return [];
  if (path === '/api/customers/') return page(url.includes('type=Supplier') ? [supplier] : []);
  if (path === '/api/customers/s1') return { ...supplier, paymentTermDays: 30 };
  if (path === '/api/stock/items/') return page([stock]);
  if (path === '/api/stock/items/st1/units') return { conversions: [] };
  if (path === '/api/finance/general-ledger/rule-profiles') return [];
  if (path === '/api/finance/general-ledger/accounts') return [{ id: 'a1', code: '770.01', name: 'Genel giderler', isActive: true, statementSection: 'Expense' }];
  if (path === '/api/purchasing/invoices/entry/receipts') return page([receipt]);
  if (path === '/api/purchasing/orders/po1') return order;
  if (path === '/api/purchasing/standalone-invoices/') return page([draftRow('d1', 'Draft'), draftRow('d2', 'Posted')]);
  if (path === '/api/purchasing/standalone-invoices/suppliers') return { items: [supplier], totalCount: 1 };
  if (path === '/api/purchasing/standalone-invoices/receipts') return [];
  if (path === '/api/purchasing/standalone-invoices/d1') return draftDetail;
  return page([]);
}

type Call = { url: string; method: string; body?: unknown };
const calls: Call[] = [];
function record(url: string, init?: { method?: string; body?: unknown }) {
  calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: { method?: string; body?: unknown }) => {
    record(url, init);
    return new Response(JSON.stringify(respond(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'req-1' });
  apiMock.mockImplementation(async (url: string, _token: string, init?: { method?: string; body?: unknown }) => {
    record(url, init);
    return respond(url, init);
  });
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  calls.length = 0;
  sessionStorage.clear();
  localStorage.clear();
});

function renderScreen(view: ReactNode, activeKey = 'v') {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey={activeKey} openKeys={['v', 'other']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const ctrlS = () => fireEvent.keyDown(window, { key: 's', ctrlKey: true });
const sent = (path: string, method = 'POST') => calls.find((call) => call.url === path && call.method === method)?.body;
/** Picks `option` in the SearchableRecordPicker whose trigger currently reads `trigger`. */
async function pick(trigger: string, option: RegExp, nth = 0) {
  fireEvent.click(screen.getAllByText(trigger, { selector: 'button > span' })[nth].closest('button')!);
  const dialog = await screen.findByRole('dialog', { name: /seçin/ });
  fireEvent.click(within(dialog).getByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /seçin/ })).toBeNull());
}
async function pickStock() {
  const input = screen.getByLabelText('Stok kodu veya adıyla ara');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Ko' } });
  fireEvent.click(await screen.findByRole('option', { name: /Koli 40x30/ }, { timeout: 2000 }));
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
const input = (label: RegExp, nth = 0) => screen.getAllByLabelText(label)[nth] as HTMLInputElement;
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

describe('Yeni satınalma siparişi', () => {
  const renderOrder = (onNavigate = vi.fn()) =>
    renderScreen(<SupplierOrdersPage token="t" role="TenantUser" onNavigate={onNavigate} createPurchaseOrderPage />);

  it('Ctrl+S posts the same order body', async () => {
    renderOrder();
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    type(screen.getByPlaceholderText('SA-2026-0001'), 'SA-9');
    await pick('Tedarikçi seçin', /Ege Ambalaj/);
    await pickStock();
    await waitFor(() => expect((screen.getByLabelText('Satır 1 birim fiyat') as HTMLInputElement).value).toBe('35'));
    type(screen.getByLabelText('Satır 1 miktar'), '4');
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/orders/')).toBeDefined());
    const body = sent('/api/purchasing/orders/') as { orderDate: string };
    expect(body).toEqual({
      code: 'SA-9', supplierId: 's1', orderDate: body.orderDate, expectedReceiptDate: null, targetWarehouseId: null, currencyCode: 'TRY',
      notes: null, customFields: {},
      lines: [{ stockItemId: 'st1', quantity: 4, unitPrice: 35, discountPercent: 0, vatPercent: 20, unitCode: 'ADET' }],
    });
  });

  it('keeps the missing-supplier check before the request', async () => {
    renderOrder();
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    type(screen.getByPlaceholderText('SA-2026-0001'), 'SA-9');
    // The supplier picker is required; submitting the form itself (no browser validation in jsdom) reaches the check.
    fireEvent.submit(document.querySelector('form.rf-form')!);
    expect(await screen.findByText('Tedarikçi seçin.')).toBeTruthy();
    expect(sent('/api/purchasing/orders/')).toBeUndefined();
  });

  it('Esc on a touched order asks before leaving', async () => {
    const onNavigate = vi.fn();
    renderOrder(onNavigate);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await escapeAsksAndStays(screen.getByPlaceholderText('SA-2026-0001'));
    expect(onNavigate).not.toHaveBeenCalledWith('sales-purchasing');
  });
});

describe('Mal kabul faturası girişi', () => {
  it('saves the selected receipt invoice with the same body', async () => {
    const onInvoiceCreated = vi.fn();
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" onInvoiceCreated={onInvoiceCreated} />);
    fireEvent.click(await screen.findByText('MK-0009'));
    type(await screen.findByLabelText(/Tedarikçi fatura no/), 'TF-123');
    fireEvent.click(screen.getByRole('button', { name: 'Faturayı kaydet' }));
    await waitFor(() => expect(sent('/api/purchasing/receipts/r1/invoice')).toBeDefined());
    const body = sent('/api/purchasing/receipts/r1/invoice') as { invoiceDate: string };
    expect(body).toEqual({
      code: 'TF-123', invoiceDate: body.invoiceDate, accountingProfileCode: null, providerInvoiceUuid: null, providerScenario: null,
      providerInvoiceTypeCode: null, providerSenderAlias: null,
    });
    await waitFor(() => expect(onInvoiceCreated).toHaveBeenCalledWith('pi9'));
  });
});

describe('Bağımsız fatura taslakları', () => {
  const renderDrafts = () => renderScreen(<StandaloneSupplierInvoiceDraftPage token="t" role="TenantUser" />);

  it('Ctrl+S posts the same new draft body', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await pick('Tedarikçi seçin', /Ege Ambalaj/);
    type(input(/Tedarikçi fatura no/), 'BF-77');
    type(input(/Açıklama/), 'Nakliye');
    type(input(/Ara toplam/, 0), '1000');
    type(input(/Vergi tutarı/), '200');
    type(input(/Satır toplamı/), '1200');
    type(input(/Ara toplam/, 1), '1000');
    type(input(/Vergi toplamı/), '200');
    type(input(/Genel toplam/), '1200');
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/standalone-invoices/')).toBeDefined());
    const body = sent('/api/purchasing/standalone-invoices/') as { invoiceDate: string };
    expect(body).toEqual({
      supplierId: 's1', invoiceNumber: 'BF-77', invoiceDate: body.invoiceDate, dueDate: null, currencyCode: 'TRY', notes: null,
      subtotal: 1000, discountTotal: 0, taxTotal: 200, grandTotal: 1200, requestId: 'req-1',
      lines: [{ lineNumber: 1, description: 'Nakliye', quantity: null, unitCode: null, unitPrice: null, subtotal: 1000, discountAmount: 0, taxAmount: 200, total: 1200, expenseAccountId: null, vatRate: null, standalonePurchaseReceiptLineId: null }],
    });
  });

  it('Düzenle loads the draft and Ctrl+S puts it with the row version', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await editDraft('d1');
    await waitFor(() => expect(input(/Tedarikçi fatura no/).value).toBe('BF-d1'));
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/standalone-invoices/d1', 'PUT')).toBeDefined());
    expect(sent('/api/purchasing/standalone-invoices/d1', 'PUT')).toEqual({
      supplierId: 's1', invoiceNumber: 'BF-d1', invoiceDate: '2026-11-12', dueDate: null, currencyCode: 'TRY', notes: null,
      subtotal: 1000, discountTotal: 0, taxTotal: 200, grandTotal: 1200, expectedRowVersion: 'rv-1',
      lines: [{ lineNumber: 1, description: 'Nakliye', quantity: null, unitCode: null, unitPrice: null, subtotal: 1000, discountAmount: 0, taxAmount: 200, total: 1200, expenseAccountId: null, vatRate: 20, standalonePurchaseReceiptLineId: null }],
    });
  });

  it('Muhasebeleştir asks, then posts the draft', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await postDraft('d1');
    expect(await screen.findByText('Tedarikçi faturası muhasebeleştirilsin mi?')).toBeTruthy();
    fireEvent.click(within(document.querySelector<HTMLElement>('.workspace-confirm-actions')!).getByRole('button', { name: /Muhasebeleştir/ }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/purchasing/standalone-invoices/d1/post' && call.method === 'POST')).toBe(true));
  });
});

/* ---- Interaction helpers (base: row buttons). ---- */

async function editDraft(id: string) {
  const row = screen.getByText(`BF-${id}`).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Düzenle' }));
}
async function postDraft(id: string) {
  const row = screen.getByText(`BF-${id}`).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Muhasebeleştir' }));
}
