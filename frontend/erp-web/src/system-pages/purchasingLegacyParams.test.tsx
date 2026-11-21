import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { ConfirmDialogHost } from '../confirmDialog';
import { KeepAliveViews } from '../WorkspaceComponents';
import { pageParamsOf, setPageParams } from '../pageNavigation';
import { usePurchasingPageParams } from '../sales/purchasingPageParams';
import { PurchaseReceiptsScreen } from '../PurchaseReceiptsScreen';
import { PurchaseInvoicesScreen } from '../purchasing/PurchaseInvoicesScreen';
import PurchaseInvoiceEntryPage from '../PurchaseInvoiceEntryPage';
import SupplierOrdersPage from '../SupplierOrdersPage';
import SalesRequestsPage from '../SalesRequestsPage';
import PurchaseDeliveryNotesPage from '../PurchaseDeliveryNotesPage';

// K7: satınalma sistem sayfaları eski satınalma ekranlarını sayfa parametreleriyle açar (purchaseOrderId, receiptId,
// purchaseInvoiceId, requestId, supplierId); eski ekran parametreyi bir kez okur ve yalnız onu sekmeden siler.

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const receiptRow = (id: string, code: string) => ({
  id, code, purchaseOrderId: 'po1', purchaseOrderCode: 'SA-1', warehouseId: 'w1', warehouseName: 'Ana depo',
  receiptDate: '2026-11-04', status: 'Posted', lineCount: 1, createdAt: '2026-11-04T10:00:00Z',
});
const receiptLine = { orderLineNumber: 1, stockItemId: 'st1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 4 };
const po1 = {
  id: 'po1', code: 'SA-1', supplierId: 's1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', status: 'PartiallyReceived', currencyCode: 'TRY',
  grandTotal: 1200, subtotal: 1000, discountTotal: 0, taxTotal: 200, notes: null, createdAt: '2026-11-01', customFields: [],
  lines: [{ lineNumber: 1, stockItemId: 'st1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 10, unitPrice: 100, discountPercent: 0, vatPercent: 20, lineSubtotal: 1000, discountAmount: 0, taxAmount: 200, lineTotal: 1200, receivedQuantity: 4, remainingQuantity: 6 }],
  receipts: [
    { ...receiptRow('r1', 'MK-1'), lines: [receiptLine], invoice: null, customFields: [] },
    { ...receiptRow('r9', 'MK-9'), lines: [receiptLine], invoice: null, customFields: [] },
  ],
};
const entryReceipt = (id: string, code: string) => ({
  id, receiptCode: code, purchaseOrderId: 'po1', purchaseOrderCode: 'SA-1', supplierId: 's1', supplierName: 'Ege Ambalaj',
  receiptDate: '2026-11-10', warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo', lineCount: 1, currencyCode: 'TRY', purchaseOrderTotal: 1200,
});
const invoice = {
  id: 'pi1', code: 'AF-1', purchaseReceiptId: 'r1', receiptCode: 'MK-1', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-1',
  supplierId: 's1', supplierName: 'Ege Ambalaj', invoiceDate: '2026-11-05', dueDate: '2026-12-05', currencyCode: 'TRY',
  status: 'Posted', grandTotal: 1200, paidAmount: 0, outstandingAmount: 1200, lineCount: 1, createdAt: '2026-11-05',
};

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/finance/general-ledger/rule-profiles' || path === '/api/finance/accounts') return [];
  if (path === '/api/customers/s1') return { id: 's1', code: '320.01', name: 'Ege Ambalaj', type: 'Supplier', isActive: true, currencyCode: 'TRY' };
  if (path === '/api/purchasing/receipts/') return page([receiptRow('r1', 'MK-1')]);
  // The receipt lookup (`GET /api/purchasing/receipts/{id}`): r9 is not on the loaded page.
  if (path === '/api/purchasing/receipts/r9') return { ...receiptRow('r9', 'MK-9'), supplierId: 's1', supplierName: 'Ege Ambalaj', lines: [receiptLine], invoice: null, customFields: [] };
  if (path === '/api/purchasing/orders/po1') return po1;
  if (path === '/api/purchasing/delivery-notes/orders/po1') return [];
  if (path === '/api/purchasing/invoices/') return page([invoice]);
  if (path === '/api/purchasing/invoices/pi1') return { ...invoice, subtotal: 1000, discountTotal: 0, taxTotal: 200, providerInvoiceUuid: null, providerScenario: null, providerInvoiceTypeCode: null, providerSenderAlias: null, lines: [], payments: [], returns: [] };
  if (path === '/api/purchasing/invoices/entry/receipts')
    return page(url.includes('q=MK-9') ? [entryReceipt('r9', 'MK-9')] : [entryReceipt('r1', 'MK-1')]);
  if (path === '/api/purchasing/requests/q1') return { id: 'q1', code: 'TLP-1', status: 'Submitted', requestDate: '2026-11-01', lines: [], customFields: [] };
  return page([]);
}

const apiMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../authApi')>()), authenticatedFetch: fetchMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  apiMock.mockImplementation(async (url: string) => respond(url));
  fetchMock.mockImplementation(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
});
afterAll(() => vi.unstubAllGlobals());
const KEYS = ['sales-purchase-delivery-notes', 'sales-requests', 'sales-purchasing', 'sales-purchase-receipts', 'sales-purchase-invoice-entry', 'sales-purchase-invoices', 't'];
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  fetchMock.mockClear();
  for (const key of KEYS) setPageParams(key, {});
  sessionStorage.clear();
  localStorage.clear();
});

const T = { timeout: 10000 };
const fetched = (path: string) => [...apiMock.mock.calls, ...fetchMock.mock.calls].some(([url]) => String(url).split('?')[0] === path);
const fetchedUrl = (predicate: (url: string) => boolean) => [...apiMock.mock.calls, ...fetchMock.mock.calls].some(([url]) => predicate(String(url)));
function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

describe('usePurchasingPageParams', () => {
  it('hands the named params out once and removes only them from the tab', () => {
    setPageParams('t', { receiptId: 'r1', supplierId: 's1', other: 'x' });
    const onParams = vi.fn();
    renderHook(() => usePurchasingPageParams('t', ['receiptId', 'supplierId'], onParams), { wrapper: StrictMode });
    expect(onParams).toHaveBeenCalledTimes(1);
    expect(onParams).toHaveBeenCalledWith({ receiptId: 'r1', supplierId: 's1' });
    expect(pageParamsOf('t')).toEqual({ other: 'x' });
  });

  it('reads new params of an open tab, ignores unnamed ones and is off without a page key', () => {
    const onParams = vi.fn();
    renderHook(() => usePurchasingPageParams('t', ['purchaseOrderId'], onParams));
    const off = vi.fn();
    renderHook(() => usePurchasingPageParams(undefined, ['purchaseOrderId'], off));
    act(() => setPageParams('t', { customerId: 'c1' }));
    expect(onParams).not.toHaveBeenCalled();
    act(() => setPageParams('t', { purchaseOrderId: 'po1' }));
    expect(onParams).toHaveBeenCalledWith({ purchaseOrderId: 'po1' });
    expect(off).not.toHaveBeenCalled();
  });
});

describe('eski satınalma ekranları sayfa parametreleri', { timeout: 30000 }, () => {
  it('Siparişler opens the order from purchaseOrderId', async () => {
    setPageParams('sales-purchasing', { purchaseOrderId: 'po1' });
    renderScreen(<SupplierOrdersPage token="t" role="TenantAdmin" onNavigate={() => {}} />);
    await waitFor(() => expect(fetched('/api/purchasing/orders/po1')).toBe(true), T);
    expect(pageParamsOf('sales-purchasing')).toEqual({});
  });

  it('Talepler opens the request from requestId', async () => {
    setPageParams('sales-requests', { requestId: 'q1' });
    renderScreen(<SalesRequestsPage token="t" role="TenantAdmin" onNavigate={() => {}} />);
    await waitFor(() => expect(fetched('/api/purchasing/requests/q1')).toBe(true), T);
    expect(pageParamsOf('sales-requests')).toEqual({});
  });

  it('Mal kabulleri opens a receipt off the loaded page through its order', async () => {
    setPageParams('sales-purchase-receipts', { receiptId: 'r9' });
    renderScreen(<PurchaseReceiptsScreen token="t" role="TenantAdmin" warehouses={[]} customers={[]} stockItems={[]} />);
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull(), T);
    expect(fetched('/api/purchasing/receipts/r9')).toBe(true);
    expect(fetched('/api/purchasing/orders/po1')).toBe(true);
    expect(document.querySelector('.doc-surface')?.textContent).toContain('MK-9');
    expect(pageParamsOf('sales-purchase-receipts')).toEqual({});
  });

  it('Alış faturaları filters by supplierId (named chip) and opens purchaseInvoiceId', async () => {
    setPageParams('sales-purchase-invoices', { supplierId: 's1', purchaseInvoiceId: 'pi1' });
    renderScreen(<PurchaseInvoicesScreen token="t" onNavigate={() => {}} />);
    await waitFor(() => expect(fetchedUrl((url) => url.startsWith('/api/purchasing/invoices/?') && url.includes('supplierId=s1'))).toBe(true), T);
    await waitFor(() => expect(fetched('/api/purchasing/invoices/pi1')).toBe(true), T);
    expect(fetched('/api/customers/s1')).toBe(true);
    expect((await screen.findAllByText('Ege Ambalaj', {}, T)).length).toBeGreaterThan(0);
    expect(pageParamsOf('sales-purchase-invoices')).toEqual({});
  });

  it('Fatura girişi preselects receiptId on the loaded page', async () => {
    setPageParams('sales-purchase-invoice-entry', { receiptId: 'r1' });
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" />);
    await screen.findByLabelText(/Tedarikçi fatura no/, {}, T);
    expect(fetched('/api/purchasing/receipts/r1')).toBe(false);
    expect(pageParamsOf('sales-purchase-invoice-entry')).toEqual({});
  });

  it('Fatura girişi searches by the receipt code when receiptId is not on the loaded page, then preselects it', async () => {
    setPageParams('sales-purchase-invoice-entry', { receiptId: 'r9' });
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" />);
    await waitFor(() => expect(fetchedUrl((url) => url.startsWith('/api/purchasing/invoices/entry/receipts?') && url.includes('q=MK-9'))).toBe(true), T);
    await screen.findByLabelText(/Tedarikçi fatura no/, {}, T);
    expect(fetched('/api/purchasing/receipts/r9')).toBe(true);
    expect(document.body.textContent).toContain('MK-9');
  });

  it('İrsaliyeler opens the create / link view on purchaseOrderId', async () => {
    setPageParams('sales-purchase-delivery-notes', { purchaseOrderId: 'po1' });
    renderScreen(<PurchaseDeliveryNotesPage token="t" />);
    await waitFor(() => expect(fetched('/api/purchasing/orders/po1')).toBe(true), T);
    await waitFor(() => expect(fetched('/api/purchasing/delivery-notes/orders/po1')).toBe(true), T);
    expect(pageParamsOf('sales-purchase-delivery-notes')).toEqual({});
  });

  it('without params the screens make no lookup calls', async () => {
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" />);
    await screen.findByText('MK-1', {}, T);
    expect(fetchedUrl((url) => url.startsWith('/api/purchasing/receipts/'))).toBe(false);
    expect(screen.queryByLabelText(/Tedarikçi fatura no/)).toBeNull();
  });
});
